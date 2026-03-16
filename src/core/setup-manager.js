/**
 * src/core/setup-manager.js
 *
 * First-time setup:
 * 1. Check apakah setiap dependency sudah tersedia
 * 2. Download & install yang belum ada ke ~/.testpilot/
 * 3. ADB: sudah di-bundle di resources/bin/, tinggal extract
 * 4. Java: download Temurin JRE (headless)
 * 5. Maestro: download dari GitHub releases
 *
 * Semua progress di-emit sebagai events ke IPC → UI
 */
const EventEmitter  = require('events')
const path          = require('path')
const fs            = require('fs')
const os            = require('os')
const https         = require('https')
const { execFile }  = require('child_process')
const AdmZip        = require('adm-zip')
const { getAdbPath, getMaestroPath, TESTPILOT_DIR, isBinaryAvailable } = require('../utils/process-utils')
const logger        = require('../utils/logger')

const DIRS = {
  bin:    path.join(TESTPILOT_DIR, 'bin'),
  java:   path.join(TESTPILOT_DIR, 'java'),
  adb:    path.join(TESTPILOT_DIR, 'adb'),
  cache:  path.join(TESTPILOT_DIR, 'cache'),
}

// ── Download URLs ─────────────────────────────────────────────
// Temurin JRE 17 (headless) — paling ringan, hanya untuk run Java
const JAVA_URLS = {
  darwin_arm64: 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jre_aarch64_mac_hotspot_17.0.10_7.tar.gz',
  darwin_x64:   'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jre_x64_mac_hotspot_17.0.10_7.tar.gz',
  win32_x64:    'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jre_x64_windows_hotspot_17.0.10_7.zip',
  linux_x64:    'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.10%2B7/OpenJDK17U-jre_x64_linux_hotspot_17.0.10_7.tar.gz',
}

// Maestro CLI — latest release
const MAESTRO_URLS = {
  darwin:  'https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip',
  win32:   'https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip',
  linux:   'https://github.com/mobile-dev-inc/maestro/releases/latest/download/maestro.zip',
}

class SetupManager extends EventEmitter {

  constructor() {
    super()
    this._running = false
  }

  // ── Check ──────────────────────────────────────────────────

  async checkAll() {
    const results = {
      adb:     await this._checkAdb(),
      java:    await this._checkJava(),
      maestro: await this._checkMaestro(),
    }
    logger.info('Setup check results:', results)
    return results
  }

  async _checkAdb() {
    const adbPath = getAdbPath()
    const ok = await isBinaryAvailable(adbPath)
    return { ok, path: adbPath }
  }

  async _checkJava() {
    // Cek di ~/.testpilot/java/ dulu
    const javaPath = this._getJavaPath()
    if (javaPath && fs.existsSync(javaPath)) {
      const ok = await isBinaryAvailable(javaPath)
      return { ok, path: javaPath }
    }
    // Cek system Java
    return new Promise(resolve => {
      execFile('java', ['-version'], { timeout: 3000 }, (err, stdout, stderr) => {
        resolve({ ok: !err, path: 'java (system)', version: stderr?.split('\n')[0] })
      })
    })
  }

  async _checkMaestro() {
    const maestroPath = getMaestroPath()
    if (!fs.existsSync(maestroPath)) return { ok: false, path: maestroPath }
    const ok = await isBinaryAvailable(maestroPath)
    return { ok, path: maestroPath }
  }

  // ── Install ────────────────────────────────────────────────

  /**
   * Install semua dependency yang diperlukan
   * Emit 'progress' events: { step, status, pct, msg }
   */
  async installAll() {
    if (this._running) throw new Error('Setup sudah berjalan')
    this._running = true

    // Buat semua direktori
    Object.values(DIRS).forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) })

    try {
      await this.installAdb()
      await this.installJava()
      await this.installMaestro()
      this._emit('done', 'all', 100, '✅ Setup selesai!')
    } catch (err) {
      logger.error('Setup failed:', err)
      this._emit('error', 'all', 0, `Setup gagal: ${err.message}`)
      throw err
    } finally {
      this._running = false
    }
  }

  /**
   * Install ADB dari bundled resources
   */
  async installAdb() {
    this._emit('start', 'adb', 0, 'Menyiapkan ADB...')

    const adbPath = getAdbPath()
    if (fs.existsSync(adbPath)) {
      this._emit('done', 'adb', 100, 'ADB sudah tersedia')
      return
    }

    // Copy dari resources/bin/ (sudah di-bundle)
    const resourcesBin = process.resourcesPath
      ? path.join(process.resourcesPath, 'bin')
      : path.join(__dirname, '../../resources/bin')

    const platform  = process.platform
    const adbName   = platform === 'win32' ? 'adb.exe' : 'adb'
    const srcAdb    = path.join(resourcesBin, `adb-${platform === 'win32' ? 'win32' : platform}${platform === 'win32' ? '.exe' : ''}`)

    if (fs.existsSync(srcAdb)) {
      fs.mkdirSync(DIRS.adb, { recursive: true })
      const destAdb = path.join(DIRS.adb, adbName)
      fs.copyFileSync(srcAdb, destAdb)
      if (platform !== 'win32') fs.chmodSync(destAdb, 0o755)
      this._emit('done', 'adb', 100, '✅ ADB siap')
    } else {
      // Fallback: andalkan system ADB
      logger.warn(`Bundled ADB not found at ${srcAdb}, using system ADB`)
      this._emit('done', 'adb', 100, 'ADB: menggunakan system installation')
    }
  }

  /**
   * Download dan install Java (Temurin JRE headless)
   */
  async installJava() {
    const check = await this._checkJava()
    if (check.ok) {
      this._emit('done', 'java', 100, `Java sudah tersedia: ${check.version || check.path}`)
      return
    }

    this._emit('start', 'java', 0, 'Mendownload Java Runtime...')

    const platform = process.platform
    const arch     = process.arch
    const key      = `${platform}_${arch}`
    const url      = JAVA_URLS[key] || JAVA_URLS[`${platform}_x64`]

    if (!url) throw new Error(`Tidak ada Java URL untuk platform: ${key}`)

    const isZip    = url.endsWith('.zip')
    const ext      = isZip ? '.zip' : '.tar.gz'
    const tmpFile  = path.join(DIRS.cache, `java${ext}`)

    logger.info(`Downloading Java from: ${url}`)
    await this._download(url, tmpFile, pct => this._emit('progress', 'java', pct, `Mendownload Java... ${pct}%`))

    this._emit('progress', 'java', 95, 'Mengekstrak Java...')
    if (isZip) {
      const zip = new AdmZip(tmpFile)
      zip.extractAllTo(DIRS.java, true)
    } else {
      // tar.gz
      await this._extractTarGz(tmpFile, DIRS.java)
    }

    fs.unlinkSync(tmpFile)
    this._emit('done', 'java', 100, '✅ Java Runtime terinstall')
  }

  /**
   * Download dan install Maestro CLI
   */
  async installMaestro() {
    const check = await this._checkMaestro()
    if (check.ok) {
      this._emit('done', 'maestro', 100, 'Maestro sudah tersedia')
      return
    }

    this._emit('start', 'maestro', 0, 'Mendownload Maestro CLI...')

    const platform = process.platform
    const url      = MAESTRO_URLS[platform] || MAESTRO_URLS.linux
    const tmpZip   = path.join(DIRS.cache, 'maestro.zip')

    logger.info(`Downloading Maestro from: ${url}`)
    await this._download(url, tmpZip, pct => this._emit('progress', 'maestro', pct, `Mendownload Maestro... ${pct}%`))

    this._emit('progress', 'maestro', 92, 'Mengekstrak Maestro...')
    const zip = new AdmZip(tmpZip)
    zip.extractAllTo(DIRS.bin, true)
    fs.unlinkSync(tmpZip)

    // Set executable permission di Unix
    const maestroPath = getMaestroPath()
    if (fs.existsSync(maestroPath) && platform !== 'win32') {
      fs.chmodSync(maestroPath, 0o755)
    }

    this._emit('done', 'maestro', 100, '✅ Maestro CLI terinstall')
  }

  // ── Utils ──────────────────────────────────────────────────

  /**
   * Download file dengan progress callback
   * Ikuti redirect (GitHub releases menggunakan redirect)
   */
  _download(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
      const doRequest = (currentUrl, redirectCount = 0) => {
        if (redirectCount > 5) return reject(new Error('Too many redirects'))

        const file = fs.createWriteStream(dest)
        const proto = currentUrl.startsWith('https') ? https : require('http')

        proto.get(currentUrl, (res) => {
          // Handle redirect
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            file.close()
            fs.unlinkSync(dest)
            return doRequest(res.headers.location, redirectCount + 1)
          }

          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} untuk ${currentUrl}`))
          }

          const total = parseInt(res.headers['content-length'] || '0')
          let downloaded = 0

          res.on('data', chunk => {
            downloaded += chunk.length
            if (total > 0 && onProgress) {
              onProgress(Math.round(downloaded / total * 90))  // max 90% saat download
            }
          })

          res.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
          file.on('error', reject)
        }).on('error', reject)
      }

      doRequest(url)
    })
  }

  async _extractTarGz(tarPath, destDir) {
    const { spawnAsync } = require('../utils/process-utils')
    fs.mkdirSync(destDir, { recursive: true })
    await spawnAsync('tar', ['-xzf', tarPath, '-C', destDir], { timeout: 60000 })
  }

  _getJavaPath() {
    const platform = process.platform
    const javaName = platform === 'win32' ? 'java.exe' : 'java'
    // Cari di subdirectory DIRS.java (setelah extract JRE)
    try {
      const entries = fs.readdirSync(DIRS.java)
      for (const entry of entries) {
        const javaExe = path.join(DIRS.java, entry, 'bin', javaName)
        if (fs.existsSync(javaExe)) return javaExe
      }
    } catch { return null }
    return null
  }

  _emit(status, step, pct, msg) {
    const payload = { status, step, pct, msg, ts: Date.now() }
    logger.debug(`Setup [${step}] ${status}: ${msg}`)
    this.emit('progress', payload)
  }
}

module.exports = new SetupManager()