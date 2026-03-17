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
   *
   * Strategi:
   * 1. exec-out screencap -p → pipe langsung ke stdout (tidak butuh pull)
   * 2. Fallback: screencap ke sdcard → pull → baca file
   */
  async screenshot(serial) {
    logger.debug(`Inspector screenshot: ${serial}`)
    const adbPath = getAdbPath()

    // ── Metode 1: exec-out (lebih cepat, tidak perlu pull) ─────
    try {
      const result = await spawnAsync(
        adbPath,
        ['-s', serial, 'exec-out', 'screencap', '-p'],
        { timeout: 15000, encoding: 'buffer' }
      )

      // Validasi output: PNG header = 0x89 0x50 0x4E 0x47
      const buf = result.rawBuffer
      if (buf && buf.length > 4 &&
          buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
        const base64 = buf.toString('base64')
        logger.debug(`Screenshot via exec-out: ${buf.length} bytes`)
        this._screenshotCache = { serial, base64, timestamp: Date.now() }
        return base64
      }
      logger.warn('exec-out screenshot: invalid PNG, falling back to pull method')
    } catch (err) {
      logger.warn(`exec-out screenshot failed: ${err.message}, trying pull method...`)
    }

    // ── Metode 2: screencap ke /data/local/tmp lalu pull ──────
    // /data/local/tmp/ tidak butuh permission — aman di semua Android versi
    const devicePath = '/data/local/tmp/testpilot_screenshot.png'
    const tmpFile    = path.join(os.tmpdir(), `testpilot_ss_${Date.now()}.png`)

    try {
      // 1. Screencap ke sdcard
      const capResult = await spawnAsync(
        adbPath, ['-s', serial, 'shell', 'screencap', '-p', devicePath],
        { timeout: 10000 }
      )
      if (capResult.exitCode !== 0) {
        throw new Error(`screencap failed: exit=${capResult.exitCode} ${capResult.stderr}`)
      }

      // 2. Tunggu sebentar agar file flush ke sdcard
      await new Promise(r => setTimeout(r, 300))

      // 3. Pull ke local
      const pullResult = await spawnAsync(
        adbPath, ['-s', serial, 'pull', devicePath, tmpFile],
        { timeout: 15000 }
      )
      if (pullResult.exitCode !== 0) {
        throw new Error(`pull failed: exit=${pullResult.exitCode} ${pullResult.stderr}`)
      }

      // 4. Baca file
      if (!fs.existsSync(tmpFile)) {
        throw new Error(`File tidak ada setelah pull: ${tmpFile}`)
      }
      const data   = fs.readFileSync(tmpFile)
      const base64 = data.toString('base64')
      logger.debug(`Screenshot via pull: ${data.length} bytes`)

      this._screenshotCache = { serial, base64, timestamp: Date.now() }
      return base64

    } finally {
      // Cleanup
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile) } catch {}
      adbDevice(serial, ['shell', 'rm', '-f', devicePath]).catch(() => {})
    }
  }

  // ── XML Hierarchy ──────────────────────────────────────────

  /**
   * Dump UI hierarchy dari device, return parsed element tree
   * Menggunakan UIAutomator via ADB
   */
  async dumpXml(serial) {
    logger.debug(`Inspector XML dump: ${serial}`)
    const adbPath   = getAdbPath()
    const tmpFile   = path.join(os.tmpdir(), `testpilot_ui_${Date.now()}.xml`)

    // Android 12+ emulator: /sdcard/ butuh MANAGE_EXTERNAL_STORAGE permission
    // /data/local/tmp/ selalu accessible oleh ADB shell tanpa permission
    const devicePath = '/data/local/tmp/testpilot_ui.xml'

    try {
      // 1. uiautomator dump ke /data/local/tmp/
      const dumpResult = await spawnAsync(
        adbPath,
        ['-s', serial, 'shell', 'uiautomator', 'dump', devicePath],
        { timeout: 15000 }
      )
      if (dumpResult.exitCode !== 0) {
        throw new Error(`uiautomator dump failed: ${dumpResult.stderr || dumpResult.stdout}`)
      }

      // 2. Baca via exec-out (tidak butuh pull, tidak ada permission issue)
      const catResult = await spawnAsync(
        adbPath,
        ['-s', serial, 'exec-out', 'cat', devicePath],
        { timeout: 10000 }
      )

      let xmlContent = catResult.stdout
      if (!xmlContent || !xmlContent.includes('<hierarchy')) {
        // Fallback: pull biasa
        await new Promise(r => setTimeout(r, 300))
        const pullResult = await spawnAsync(
          adbPath, ['-s', serial, 'pull', devicePath, tmpFile],
          { timeout: 15000 }
        )
        if (pullResult.exitCode !== 0 || !fs.existsSync(tmpFile)) {
          throw new Error(`Cannot read XML: ${pullResult.stderr}`)
        }
        xmlContent = fs.readFileSync(tmpFile, 'utf8')
      }

      const tree = this._parseXmlToTree(xmlContent)
      return { xml: xmlContent, tree }

    } catch (err) {
      logger.error('XML dump failed:', { serial, error: err.message })
      throw new Error(`XML dump gagal: ${err.message}`)
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile) } catch {}
      adbDevice(serial, ['shell', 'rm', '-f', devicePath]).catch(() => {})
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