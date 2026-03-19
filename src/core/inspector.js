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

// iOS Simulator UDID format: 8-4-4-4-12 hex (UUID)
function _isIosSim(serial) {
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(serial)
}

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

    // ── iOS Simulator: xcrun simctl io screenshot ───────────
    if (_isIosSim(serial)) {
      return this._screenshotIos(serial)
    }

    // ── Android via ADB ─────────────────────────────────────
    const adbPath = getAdbPath()

    try {
      const result = await spawnAsync(
        adbPath,
        ['-s', serial, 'exec-out', 'screencap', '-p'],
        { timeout: 15000, encoding: 'buffer' }
      )
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

    const devicePath = '/data/local/tmp/testpilot_screenshot.png'
    const tmpFile    = path.join(os.tmpdir(), `testpilot_ss_${Date.now()}.png`)
    try {
      const capResult = await spawnAsync(
        adbPath, ['-s', serial, 'shell', 'screencap', '-p', devicePath],
        { timeout: 10000 }
      )
      if (capResult.exitCode !== 0)
        throw new Error(`screencap failed: exit=${capResult.exitCode} ${capResult.stderr}`)

      await new Promise(r => setTimeout(r, 300))
      const pullResult = await spawnAsync(
        adbPath, ['-s', serial, 'pull', devicePath, tmpFile],
        { timeout: 15000 }
      )
      if (pullResult.exitCode !== 0)
        throw new Error(`pull failed: exit=${pullResult.exitCode} ${pullResult.stderr}`)

      if (!fs.existsSync(tmpFile)) throw new Error('File tidak ada setelah pull')
      const data   = fs.readFileSync(tmpFile)
      const base64 = data.toString('base64')
      this._screenshotCache = { serial, base64, timestamp: Date.now() }
      return base64
    } finally {
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile) } catch {}
      adbDevice(serial, ['shell', 'rm', '-f', devicePath]).catch(() => {})
    }
  }

  async _screenshotIos(udid) {
    const tmpFile = path.join(os.tmpdir(), `testpilot_ios_${Date.now()}.png`)
    const { execFile } = require('child_process')
    return new Promise((resolve, reject) => {
      execFile('xcrun', ['simctl', 'io', udid, 'screenshot', tmpFile],
        { timeout: 10000 },
        (err) => {
          if (err) return reject(new Error(`iOS screenshot failed: ${err.message}`))
          try {
            const data   = fs.readFileSync(tmpFile)
            const base64 = data.toString('base64')
            fs.unlinkSync(tmpFile)
            this._screenshotCache = { serial: udid, base64, timestamp: Date.now() }
            logger.debug(`iOS screenshot: ${data.length} bytes`)
            resolve(base64)
          } catch (e) {
            reject(new Error(`iOS screenshot read failed: ${e.message}`))
          }
        })
    })
  }

  // ── XML Hierarchy ──────────────────────────────────────────

  /**
   * Dump UI hierarchy dari device, return parsed element tree
   */
  async dumpXml(serial) {
    logger.debug(`Inspector XML dump: ${serial}`)

    // ── iOS Simulator: pakai Maestro hierarchy dump ──────────
    if (_isIosSim(serial)) {
      return this._dumpXmlIos(serial)
    }

    // ── Android: UIAutomator ─────────────────────────────────
    const adbPath    = getAdbPath()
    const tmpFile    = path.join(os.tmpdir(), `testpilot_ui_${Date.now()}.xml`)
    const devicePath = '/data/local/tmp/testpilot_ui.xml'

    let memAvailMB = 9999
    try {
      const memInfo = await spawnAsync(adbPath,
        ['-s', serial, 'shell', 'cat', '/proc/meminfo'], { timeout: 3000 })
      const m = memInfo.stdout?.match(/MemAvailable:\s+(\d+)/)
      if (m) memAvailMB = Math.round(parseInt(m[1]) / 1024)
      logger.debug(`MemAvailable: ${memAvailMB}MB`)
    } catch {}

    // Metode 1: uiautomator dump /dev/tty (lebih ringan, no file write)
    // Hanya coba kalau memory cukup
    if (memAvailMB >= 400) {
      try {
        const result = await spawnAsync(
          adbPath,
          ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty'],
          { timeout: 20000 }
        )
        if (result.exitCode === 0 && result.stdout?.includes('<hierarchy')) {
          logger.debug(`XML via dump /dev/tty OK: ${result.stdout.length} chars`)
          const tree = this._parseXmlToTree(result.stdout)
          return { xml: result.stdout, tree }
        }
        logger.debug(`dump /dev/tty failed exit=${result.exitCode}`)
      } catch (e) {
        logger.debug(`dump /dev/tty exception: ${e.message}`)
      }

      // Metode 2: uiautomator dump ke file
      try {
        const dumpResult = await spawnAsync(
          adbPath, ['-s', serial, 'shell', 'uiautomator', 'dump', devicePath],
          { timeout: 20000 }
        )
        if (dumpResult.exitCode === 0 || dumpResult.exitCode === -1) {
          const catResult = await spawnAsync(
            adbPath, ['-s', serial, 'exec-out', 'cat', devicePath],
            { timeout: 10000 }
          )
          if (catResult.stdout?.includes('<hierarchy')) {
            const tree = this._parseXmlToTree(catResult.stdout)
            adbDevice(serial, ['shell', 'rm', '-f', devicePath]).catch(() => {})
            return { xml: catResult.stdout, tree }
          }
        }
        logger.debug(`uiautomator dump file failed exit=${dumpResult.exitCode}`)
      } catch (e) {
        logger.debug(`uiautomator dump file exception: ${e.message}`)
      } finally {
        adbDevice(serial, ['shell', 'rm', '-f', devicePath]).catch(() => {})
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile) } catch {}
      }
    } else {
      logger.warn(`MemAvailable ${memAvailMB}MB < 400MB — skip uiautomator, risk of OOM kill`)
    }

    // Metode 3 (fallback): view hierarchy via dumpsys accessibility
    // Tidak butuh uiautomator process — jauh lebih ringan
    try {
      logger.debug('Trying dumpsys accessibility fallback...')
      const dumpsysResult = await spawnAsync(
        adbPath,
        ['-s', serial, 'shell', 'dumpsys', 'accessibility', '--short'],
        { timeout: 8000 }
      )
      if (dumpsysResult.exitCode === 0 && dumpsysResult.stdout) {
        // Parse teks dumpsys menjadi XML-like hierarchy sederhana
        const fakeXml = this._dumpsysToXml(dumpsysResult.stdout)
        if (fakeXml) {
          logger.debug('XML dari dumpsys accessibility OK')
          const tree = this._parseXmlToTree(fakeXml)
          return { xml: fakeXml, tree, source: 'accessibility' }
        }
      }
    } catch (e) {
      logger.debug(`dumpsys accessibility failed: ${e.message}`)
    }

    // Semua metode gagal
    const memMsg = memAvailMB < 400
      ? `Memory terlalu rendah (${memAvailMB}MB tersedia). Tambah RAM emulator di AVD Manager: Android Studio → Device Manager → Edit → RAM 4096MB.`
      : 'uiautomator tidak dapat dijalankan. Coba tap Refresh atau restart emulator.'
    throw new Error(memMsg)
  }

  // Parse output dumpsys accessibility menjadi XML hierarchy sederhana
  _dumpsysToXml(dumpsysText) {
    try {
      const lines = dumpsysText.split('\n')
      let nodes = []
      for (const line of lines) {
        const m = line.match(/\[([^\]]+)\].*class=([^\s,]+).*text="([^"]*)"/)
        if (m) {
          const [, bounds, cls, text] = m
          const cleanClass = cls.split('.').pop()
          nodes.push(`<node class="${cleanClass}" text="${text}" bounds="${bounds}" clickable="true" resource-id="" content-desc="${text}"/>`)
        }
      }
      if (!nodes.length) return null
      return `<?xml version="1.0" ?><hierarchy rotation="0">${nodes.join('')}</hierarchy>`
    } catch { return null }
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
  // ── iOS Simulator specific ────────────────────────────────

  async _resolveIdbPath() {
    // Cari idb dari checkDeps cache dulu, lalu fallback ke known paths
    const os   = require('os')
    const path = require('path')
    const fs   = require('fs')
    const candidates = [
      path.join(os.homedir(), '.local', 'bin', 'idb'),
      '/usr/local/bin/idb',
      '/opt/homebrew/bin/idb',
    ]
    // Coba which sebagai last resort
    const found = candidates.find(p => fs.existsSync(p))
    if (found) return found
    return new Promise(resolve => {
      require('child_process').execFile('which', ['idb'], { timeout: 3000 },
        (err, stdout) => resolve(!err && stdout.trim() ? stdout.trim() : null))
    })
  }

  async _dumpXmlIos(udid) {
    const { execFile } = require('child_process')
    const idbPath = await this._resolveIdbPath()
    if (!idbPath) {
      throw new Error(
        'idb tidak ditemukan.\n' +
        'Install dengan:\n' +
        '  brew install pipx\n' +
        '  pipx install fb-idb --python /usr/local/bin/python3.11\n' +
        'Pastikan Python 3.11 sudah terinstall (brew install python@3.11)'
      )
    }

    return new Promise((resolve, reject) => {
      // idb ui describe-all — return JSON array semua elements
      execFile(idbPath,
        ['ui', 'describe-all', '--udid', udid],
        { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err && !stdout) {
            // Coba connect dulu lalu retry
            execFile(idbPath, ['connect', udid], { timeout: 5000 }, () => {
              execFile(idbPath,
                ['ui', 'describe-all', '--udid', udid],
                { timeout: 15000, maxBuffer: 10 * 1024 * 1024 },
                (err2, stdout2) => {
                  if (err2 && !stdout2) return reject(new Error(`idb describe-all failed: ${err2.message}`))
                  try {
                    const result = this._parseIdbToXml(stdout2 || '[]', udid)
                    resolve(result)
                  } catch (e) { reject(e) }
                })
            })
            return
          }
          try {
            const result = this._parseIdbToXml(stdout || '[]', udid)
            resolve(result)
          } catch (e) { reject(e) }
        })
    })
  }

  _parseIdbToXml(jsonStr, udid) {
    // Parse JSON array dari idb → XML hierarchy format UIAutomator
    // agar bisa dipakai oleh _parseXmlToTree yang sudah ada
    let elements = []
    try {
      // idb kadang output multiple JSON objects atau array
      const clean = jsonStr.trim()
      if (clean.startsWith('[')) {
        elements = JSON.parse(clean)
      } else {
        // newline-delimited JSON
        elements = clean.split('\n').filter(l => l.trim()).map(l => JSON.parse(l))
      }
    } catch (e) {
      logger.warn(`_parseIdbToXml: JSON parse failed: ${e.message}`)
      elements = []
    }

    if (!elements.length) {
      throw new Error('idb: tidak ada element. Pastikan app terbuka di simulator.')
    }

    // Convert ke XML format UIAutomator-compatible
    const toXmlNode = (el) => {
      const f     = el.frame || {}
      const x1    = Math.round(f.x || 0)
      const y1    = Math.round(f.y || 0)
      const x2    = Math.round((f.x || 0) + (f.width || 0))
      const y2    = Math.round((f.y || 0) + (f.height || 0))
      const bounds = `[${x1},${y1}][${x2},${y2}]`

      // Map iOS type → Android-like class untuk kompatibilitas parser
      const typeMap = {
        'Application':  'XCUIElementTypeApplication',
        'Button':       'XCUIElementTypeButton',
        'StaticText':   'XCUIElementTypeStaticText',
        'TextField':    'XCUIElementTypeTextField',
        'Image':        'XCUIElementTypeImage',
        'Cell':         'XCUIElementTypeCell',
        'Table':        'XCUIElementTypeTable',
        'Heading':      'XCUIElementTypeStaticText',
        'Group':        'XCUIElementTypeOther',
        'Slider':       'XCUIElementTypeSlider',
        'ScrollView':   'XCUIElementTypeScrollView',
        'Switch':       'XCUIElementTypeSwitch',
        'Other':        'XCUIElementTypeOther',
      }
      const cls  = typeMap[el.type] || `XCUIElementType${el.type || 'Other'}`
      const text = (el.AXLabel || el.AXValue || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const uid  = el.AXUniqueId || ''
      const enabled  = el.enabled !== false ? 'true' : 'false'
      const clickable = ['Button','Cell','TextField','Switch','Slider'].includes(el.type) ? 'true' : 'false'

      return `<node class="${cls}" text="${text}" resource-id="${uid}" ` +
             `content-desc="${text}" bounds="${bounds}" ` +
             `clickable="${clickable}" enabled="${enabled}" ` +
             `checkable="false" checked="false" focusable="${clickable}" ` +
             `focused="false" scrollable="false" long-clickable="false" ` +
             `password="false" selected="false" index="0"/>`
    }

    const nodes = elements.map(toXmlNode).join('\n  ')
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  ${nodes}
</hierarchy>`

    logger.debug(`_parseIdbToXml: ${elements.length} elements → XML`)
    const tree = this._parseXmlToTree(xml)
    return { xml, tree, source: 'idb', elementCount: elements.length }
  }

  async tap(serial, x, y) {
    const xInt = Math.round(x)
    const yInt = Math.round(y)
    logger.info(`Inspector tap: ${serial} @ (${xInt}, ${yInt})`)

    // ── iOS Simulator: idb ui tap ─────────────────────────────
    if (_isIosSim(serial)) {
      const idbPath = await this._resolveIdbPath()
      if (!idbPath) {
        logger.warn('idb tidak ditemukan untuk tap iOS')
        return { ok: false, x: xInt, y: yInt, error: 'idb tidak ditemukan — install fb-idb dulu' }
      }

      return new Promise((resolve) => {
        execFile(idbPath,
          ['ui', 'tap', String(xInt), String(yInt), '--udid', serial],
          { timeout: 8000 },
          (err) => {
            if (err) {
              logger.warn(`idb tap failed: ${err.message}`)
              resolve({ ok: false, x: xInt, y: yInt, error: err.message })
            } else {
              logger.info(`iOS tap OK via idb @ (${xInt}, ${yInt})`)
              resolve({ ok: true, x: xInt, y: yInt })
            }
          })
      })
    }

    // ── Android: ADB input tap ────────────────────────────────
    const { getAdbPath } = require('../utils/process-utils')
    const { execFile }   = require('child_process')
    const adbPath        = getAdbPath()

    return new Promise((resolve) => {
      execFile(
        adbPath,
        ['-s', serial, 'shell', 'input', 'tap', String(xInt), String(yInt)],
        {},
        (err) => {
          if (err && err.code !== 0) logger.warn(`Tap error: ${err.message}`)
          else logger.info(`Tap OK @ (${xInt}, ${yInt})`)
          resolve({ ok: true, x: xInt, y: yInt })
        }
      )
    })
  }

  async getScreenSize(serial) {
    // ── iOS Simulator ─────────────────────────────────────────
    if (_isIosSim(serial)) {
      const { execFile } = require('child_process')
      return new Promise(resolve => {
        execFile('xcrun', ['simctl', 'list', 'devices', '--json'], { timeout: 5000 }, (err, stdout) => {
          if (err || !stdout) return resolve({ width: 390, height: 844 })
          try {
            const data = JSON.parse(stdout)
            for (const sims of Object.values(data.devices || {})) {
              const sim = sims.find(s => s.udid === serial)
              if (sim) {
                // Resolusi berdasarkan nama device (approximate)
                const name = sim.name || ''
                if (name.includes('Pro Max') || name.includes('Plus'))
                  return resolve({ width: 430, height: 932 })
                if (name.includes('Pro'))
                  return resolve({ width: 393, height: 852 })
                if (name.includes('SE'))
                  return resolve({ width: 375, height: 667 })
                if (name.includes('mini'))
                  return resolve({ width: 375, height: 812 })
                return resolve({ width: 390, height: 844 }) // iPhone 14/15 default
              }
            }
            resolve({ width: 390, height: 844 })
          } catch { resolve({ width: 390, height: 844 }) }
        })
      })
    }

    // ── Android ───────────────────────────────────────────────
    const { stdout } = await adbDevice(serial, ['shell', 'wm', 'size'], { timeout: 5000 })
    const m = stdout.match(/(\d+)x(\d+)/)
    if (m) return { width: parseInt(m[1]), height: parseInt(m[2]) }
    return { width: 1080, height: 1920 }
  }

}

// Singleton — Inspector berjalan di konteks terpisah dari Runner
// Tidak ada shared state dengan TestRunner
module.exports = new Inspector()