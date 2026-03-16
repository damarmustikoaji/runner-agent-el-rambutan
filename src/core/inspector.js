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
    let idCounter = 0

    // ── Regex ──────────────────────────────────────────────────
    // Capture setiap <node ...> tag (self-closing atau tidak)
    // PENTING: atribut UIAutomator punya nama dengan tanda minus
    //   resource-id, content-desc, long-clickable, dll
    //   [\w-]+ menangkap semua itu; \w+ saja gagal untuk resource-id
    const nodeRegex = /<node\s([^>]*?)(?:\/>|>)/g
    const attrRegex = /([\w-]+)="([^"]*)"/g

    const allNodes = []
    let match
    while ((match = nodeRegex.exec(xmlContent)) !== null) {
      const attrStr = match[1]
      const attrs   = {}
      attrRegex.lastIndex = 0   // WAJIB reset karena reuse regex object
      let attrMatch
      while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2]
      }
      // Ambil semua node yang punya class (semua widget punya class)
      if (attrs.class) allNodes.push(attrs)
    }

    return allNodes
      .map(n => {
        const bounds = this._parseBounds(n.bounds)
        if (!bounds) return null

        const selectors = this._generateSelectors(n)
        return {
          id:          `el-${idCounter++}`,
          class:       n.class       || '',
          text:        n.text        || '',
          resourceId:  n['resource-id']   || '',
          contentDesc: n['content-desc']  || '',
          packageName: n.package     || '',
          clickable:   n.clickable   === 'true',
          scrollable:  n.scrollable  === 'true',
          focusable:   n.focusable   === 'true',
          enabled:     n.enabled     !== 'false',
          checked:     n.checked     === 'true',
          bounds,
          selectors,
          // alias untuk renderHighlights
          highlight: bounds,
        }
      })
      .filter(Boolean)
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
    const rid       = attrs['resource-id'] || ''
    const cdesc     = attrs['content-desc'] || ''
    const text      = attrs.text || ''
    const cls       = attrs.class || ''
    const classShort = cls.split('.').pop() || ''

    // 1. resource-id — paling stabil, tidak berubah dengan bahasa/data
    if (rid) {
      // Format Maestro: id/<full-resource-id>
      selectors.push({
        type:   'resource-id',
        value:  `id/${rid}`,
        label:  'Resource ID',
        stable: true,
      })
    }

    // 2. accessibility / content-desc
    if (cdesc) {
      selectors.push({
        type:   'accessibility',
        value:  `acc/${cdesc}`,
        label:  'Accessibility',
        stable: true,
      })
    }

    // 3. text — hanya kalau tidak kosong dan wajar panjangnya
    if (text && text.length > 0 && text.length < 80) {
      selectors.push({
        type:   'text',
        value:  `text/${text}`,
        label:  'Text',
        stable: false,  // bisa berubah dengan locale / dinamis
      })
    }

    // 4. xpath — lebih spesifik jika ada resource-id
    if (classShort) {
      const fullClass = cls  // e.g. android.widget.Button
      let xpathExpr
      if (rid) {
        xpathExpr = `xpath///${fullClass}[@resource-id="${rid}"]`
      } else if (cdesc) {
        xpathExpr = `xpath///${fullClass}[@content-desc="${cdesc}"]`
      } else if (text) {
        xpathExpr = `xpath///${fullClass}[@text="${text}"]`
      } else {
        xpathExpr = `xpath///${fullClass}`
      }
      selectors.push({
        type:   'xpath',
        value:  xpathExpr,
        label:  'XPath',
        stable: false,
      })
    }

    return selectors
  }

  // ── Tap ───────────────────────────────────────────────────

  /**
   * Tap di koordinat tertentu di device via ADB input tap
   * Menggunakan execFile tanpa timeout agar tidak di-SIGKILL
   */
  async tap(serial, x, y) {
    const xInt = Math.round(x)
    const yInt = Math.round(y)
    logger.info(`Inspector tap: ${serial} @ (${xInt}, ${yInt})`)

    const { getAdbPath } = require('../utils/process-utils')
    const { execFile }   = require('child_process')
    const adbPath        = getAdbPath()

    return new Promise((resolve) => {
      execFile(
        adbPath,
        ['-s', serial, 'shell', 'input', 'tap', String(xInt), String(yInt)],
        {},  // tanpa timeout — biarkan ADB selesai natural (1-3 detik)
        (err, stdout, stderr) => {
          if (err && err.code !== 0) {
            logger.warn(`Tap error: code=${err.code} msg=${err.message}`)
          } else {
            logger.info(`Tap OK @ (${xInt}, ${yInt})`)
          }
          // Selalu resolve ok:true — tap command sudah terkirim ke device
          resolve({ ok: true, x: xInt, y: yInt })
        }
      )
    })
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