/**
 * src/core/inspector.js
 *
 * Inspector engine:
 * - Screenshot device → base64 PNG
 * - XML hierarchy dump dari UIAutomator
 * - Parse XML → element tree dengan bounds/selector
 * - Map koordinat element ke posisi di screenshot
 * - PENTING: Inspector menggunakan ADB langsung (bukan Maestro session)
 *   sehingga TIDAK bentrok dengan test runner
 */
const path    = require('path')
const fs      = require('fs')
const os      = require('os')
const { adbDevice, spawnAsync, getAdbPath } = require('../utils/process-utils')
const logger  = require('../utils/logger')

// XML parser ringan (built-in, tidak perlu dependency ekstra)
// Kita parse manual untuk menghindari dependency tambahan

class Inspector {
  constructor() {
    this._screenshotCache = null
    this._lastSerial      = null
  }

  // ── Screenshot ────────────────────────────────────────────

  /**
   * Ambil screenshot dari device, return sebagai base64 string
   * Menggunakan: adb exec-out screencap -p (lebih cepat dari shell screencap)
   */
  async screenshot(serial) {
    logger.debug(`Inspector screenshot: ${serial}`)
    try {
      // Metode 1: exec-out (lebih cepat, langsung binary)
      const adbPath = getAdbPath()
      const tmpFile = path.join(os.tmpdir(), `testpilot_ss_${Date.now()}.png`)

      // screencap ke file di device lalu pull (lebih reliable)
      const devicePath = '/sdcard/testpilot_screenshot.png'
      await adbDevice(serial, ['shell', 'screencap', '-p', devicePath])
      await adbDevice(serial, ['pull', devicePath, tmpFile])

      // Cleanup di device
      adbDevice(serial, ['shell', 'rm', '-f', devicePath]).catch(() => {})

      const data = fs.readFileSync(tmpFile)
      fs.unlinkSync(tmpFile)

      const base64 = data.toString('base64')
      this._screenshotCache = { serial, base64, timestamp: Date.now() }
      return base64
    } catch (err) {
      logger.error('Screenshot failed:', { serial, error: err.message })
      throw new Error(`Screenshot gagal: ${err.message}`)
    }
  }

  // ── XML Hierarchy ──────────────────────────────────────────

  /**
   * Dump UI hierarchy dari device, return parsed element tree
   * Menggunakan UIAutomator via ADB
   */
  async dumpXml(serial) {
    logger.debug(`Inspector XML dump: ${serial}`)
    try {
      const deviceXmlPath = '/sdcard/testpilot_ui.xml'
      const tmpFile = path.join(os.tmpdir(), `testpilot_ui_${Date.now()}.xml`)

      // Dump UI hierarchy
      await adbDevice(serial, ['shell', 'uiautomator', 'dump', deviceXmlPath], { timeout: 15000 })

      // Pull file ke local
      const { exitCode } = await adbDevice(serial, ['pull', deviceXmlPath, tmpFile], { timeout: 10000 })
      if (exitCode !== 0) throw new Error('Failed to pull XML from device')

      const xmlContent = fs.readFileSync(tmpFile, 'utf8')
      fs.unlinkSync(tmpFile)

      // Cleanup di device
      adbDevice(serial, ['shell', 'rm', '-f', deviceXmlPath]).catch(() => {})

      // Parse XML → element tree
      const tree = this._parseXmlToTree(xmlContent)
      return { xml: xmlContent, tree }

    } catch (err) {
      logger.error('XML dump failed:', { serial, error: err.message })
      throw new Error(`XML dump gagal: ${err.message}`)
    }
  }

  /**
   * Parse UIAutomator XML ke tree structure yang berguna untuk UI
   * Menggunakan regex-based parser (tidak butuh xmldom dependency)
   */
  _parseXmlToTree(xmlContent) {
    const elements = []
    let idCounter = 0

    // Regex untuk extract node attributes dari XML UIAutomator
    const nodeRegex = /<node([^>]*)\/?>(?:(?!<\/node>).|\n)*?(?:<\/node>)?/g
    const attrRegex = /(\w+)="([^"]*)"/g

    // Flat parse semua node
    const allNodes = []
    let match
    while ((match = nodeRegex.exec(xmlContent)) !== null) {
      const attrStr = match[1]
      const attrs = {}
      let attrMatch
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2]
      }
      if (Object.keys(attrs).length > 0) {
        allNodes.push(attrs)
      }
    }

    // Convert flat list ke hierarchical berdasarkan bounds depth
    // (UIAutomator XML sudah berurutan depth-first)
    const buildTree = (nodes, depth = 0) => {
      return nodes
        .filter(n => n && (n['resource-id'] || n['text'] || n['content-desc'] || n['class']))
        .map(n => {
          const bounds = this._parseBounds(n.bounds)
          const id = `el-${idCounter++}`

          // Generate selectors yang bisa dipakai di test
          const selectors = this._generateSelectors(n)

          return {
            id,
            class:        n.class || '',
            text:         n.text || '',
            resourceId:   n['resource-id'] || '',
            contentDesc:  n['content-desc'] || '',
            packageName:  n.package || '',
            clickable:    n.clickable === 'true',
            scrollable:   n.scrollable === 'true',
            enabled:      n.enabled !== 'false',
            bounds,
            selectors,
            // Untuk highlight overlay di screenshot
            highlight: bounds ? {
              x:      bounds.x,
              y:      bounds.y,
              width:  bounds.width,
              height: bounds.height,
            } : null,
          }
        })
        .filter(el => el.highlight)  // filter element tanpa bounds
    }

    return buildTree(allNodes)
  }

  /**
   * Parse bounds string "[x1,y1][x2,y2]" → {x, y, width, height}
   */
  _parseBounds(boundsStr) {
    if (!boundsStr) return null
    const m = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
    if (!m) return null
    const [, x1, y1, x2, y2] = m.map(Number)
    return {
      x:      x1,
      y:      y1,
      width:  x2 - x1,
      height: y2 - y1,
      x2, y2,
      centerX: Math.round((x1 + x2) / 2),
      centerY: Math.round((y1 + y2) / 2),
    }
  }

  /**
   * Generate semua selector yang bisa dipakai
   * Priority: resource-id > accessibility > text > xpath
   */
  _generateSelectors(attrs) {
    const selectors = []

    // resource-id (paling stabil)
    if (attrs['resource-id']) {
      selectors.push({
        type:     'resource-id',
        value:    `id/${attrs['resource-id']}`,
        label:    'Resource ID',
        priority: 1,
        stable:   true,
      })
    }

    // accessibility / content-desc
    if (attrs['content-desc']) {
      selectors.push({
        type:     'accessibility',
        value:    `acc/${attrs['content-desc']}`,
        label:    'Accessibility',
        priority: 2,
        stable:   true,
      })
    }

    // text (hanya kalau text tidak kosong dan pendek)
    if (attrs.text && attrs.text.length < 50) {
      selectors.push({
        type:     'text',
        value:    `text/${attrs.text}`,
        label:    'Text',
        priority: 3,
        stable:   false,  // text bisa berubah dengan locale/data
      })
    }

    // xpath sebagai fallback
    const classShort = (attrs.class || '').split('.').pop()
    if (classShort) {
      const xpath = attrs['resource-id']
        ? `xpath///android.widget.${classShort}[@resource-id="${attrs['resource-id']}"]`
        : `xpath///android.widget.${classShort}`
      selectors.push({
        type:     'xpath',
        value:    xpath,
        label:    'XPath',
        priority: 4,
        stable:   false,  // xpath rapuh terhadap perubahan layout
      })
    }

    return selectors
  }

  // ── Tap ───────────────────────────────────────────────────

  /**
   * Tap di koordinat tertentu di device
   * Dipakai saat user klik element dari inspector UI
   */
  async tap(serial, x, y) {
    logger.debug(`Inspector tap: ${serial} @ (${x}, ${y})`)
    await adbDevice(serial, ['shell', 'input', 'tap', String(x), String(y)], { timeout: 5000 })
  }

  /**
   * Dapatkan screen dimensions
   */
  async getScreenSize(serial) {
    const { stdout } = await adbDevice(serial, ['shell', 'wm', 'size'], { timeout: 5000 })
    const m = stdout.match(/(\d+)x(\d+)/)
    if (m) return { width: parseInt(m[1]), height: parseInt(m[2]) }
    return { width: 1080, height: 1920 }
  }

}

// Singleton — Inspector berjalan di konteks terpisah dari Runner
// Tidak ada shared state dengan TestRunner
module.exports = new Inspector()
