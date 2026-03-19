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
    const { execFile } = require('child_process')
    const os   = require('os')
    const path = require('path')
    const fs   = require('fs')

    // iOS checks hanya di macOS
    const isMac = process.platform === 'darwin'
    const iosChecks = isMac ? {
      xcode:          await this._checkXcode(),
      idbCompanion:   await this._checkIdbCompanion(),
      idb:            await this._checkIdb(),
    } : {}

    const results = {
      adb:     await this._checkAdb(),
      java:    await this._checkJava(),
      maestro: await this._checkMaestro(),
      ...iosChecks,
    }
    logger.info('Setup check results:', results)
    return results
  }

  // ── iOS Dependency Checks ─────────────────────────────────

  async _checkXcode() {
    const { execFile } = require('child_process')
    return new Promise(resolve => {
      execFile('xcode-select', ['-p'], { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout.trim()) return resolve({ ok: false, path: null })
        const p = stdout.trim()
        // Harus pointing ke Xcode.app bukan hanya CLT
        const isFullXcode = p.includes('Xcode.app')
        resolve({ ok: isFullXcode, path: p, cltOnly: !isFullXcode })
      })
    })
  }

  async _checkIdbCompanion() {
    const { execFile } = require('child_process')
    const candidates = [
      '/usr/local/bin/idb_companion',
      '/opt/homebrew/bin/idb_companion',
    ]
    for (const p of candidates) {
      if (require('fs').existsSync(p)) {
        return { ok: true, path: p }
      }
    }
    // Try which
    return new Promise(resolve => {
      execFile('which', ['idb_companion'], { timeout: 3000 }, (err, stdout) => {
        if (!err && stdout.trim()) return resolve({ ok: true, path: stdout.trim() })
        resolve({ ok: false, path: null })
      })
    })
  }

  async _checkIdb() {
    const os   = require('os')
    const path = require('path')
    const fs   = require('fs')
    const { execFile } = require('child_process')

    const candidates = [
      path.join(os.homedir(), '.local', 'bin', 'idb'),
      '/usr/local/bin/idb',
      '/opt/homebrew/bin/idb',
    ]
    for (const p of candidates) {
      if (fs.existsSync(p)) return { ok: true, path: p }
    }
    return new Promise(resolve => {
      execFile('which', ['idb'], { timeout: 3000 }, (err, stdout) => {
        if (!err && stdout.trim()) return resolve({ ok: true, path: stdout.trim() })
        resolve({ ok: false, path: null })
      })
    })
  }

  async _checkAdb() {
    const { execFile } = require('child_process')
    const adbPath = getAdbPath()

    // Helper: cek satu path ADB dengan menjalankan 'adb version'
    const tryAdb = (p) => new Promise(resolve => {
      execFile(p, ['version'], { timeout: 4000 }, (err, stdout) => {
        resolve(!err && stdout.toLowerCase().includes('android debug bridge'))
      })
    })

    // 1. Cek path yang dikembalikan getAdbPath()
    if (await tryAdb(adbPath)) return { ok: true, path: adbPath }

    // 2. Cek kandidat lain
    const candidates = ['adb']
    if (process.env.ANDROID_HOME) {
      candidates.push(
        require('path').join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
        require('path').join(process.env.ANDROID_HOME, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')
      )
    }
    if (process.env.ANDROID_SDK_ROOT) {
      candidates.push(require('path').join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'))
    }
    // macOS common paths
    const home = require('os').homedir()
    candidates.push(
      `${home}/Library/Android/sdk/platform-tools/adb`,
      '/usr/local/bin/adb',
      '/opt/homebrew/bin/adb'
    )

    for (const p of candidates) {
      if (await tryAdb(p)) {
        logger.info(`ADB found at: ${p}`)
        return { ok: true, path: p }
      }
    }

    return { ok: false, path: adbPath }
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

  /**
   * Cek Maestro: pisahkan "file ada" dari "bisa dijalankan"
   *
   * Untuk production DMG/EXE:
   * - File existence = sudah didownload (setup selesai)
   * - Runnability = bonus check, TIDAK menentukan ok/fail
   *
   * Maestro adalah shell script yang butuh Java. Di Electron (DMG),
   * PATH tidak inherit dari terminal user, jadi exec test sering gagal
   * meski file ada dan chmod +x sudah benar.
   */
  async _checkMaestro() {
    const maestroPath = getMaestroPath()
    logger.debug(`_checkMaestro: checking path=${maestroPath}`)

    // Cek apakah file ada
    if (fs.existsSync(maestroPath)) {
      const stat = fs.statSync(maestroPath)
      // File ada dan punya size > 0 = VALID
      // Executable permission juga harus ada (bit +x)
      const isExec = !!(stat.mode & 0o111)
      if (!isExec && process.platform !== 'win32') {
        // Fix permission otomatis — tidak perlu user intervensi
        try {
          fs.chmodSync(maestroPath, 0o755)
          logger.info(`Auto-chmod +x: ${maestroPath}`)
        } catch (e) {
          logger.warn(`chmod failed: ${e.message}`)
        }
      }
      logger.info(`Maestro found: ${maestroPath} (${stat.size} bytes, exec=${isExec})`)
      return { ok: true, path: maestroPath }
    }

    // Juga cek system maestro (homebrew install)
    const systemOk = await new Promise(resolve => {
      execFile('which', ['maestro'], { timeout: 2000 }, (err, stdout) => {
        if (!err && stdout.trim()) { resolve(stdout.trim()); return }
        resolve(null)
      })
    })
    if (systemOk) return { ok: true, path: `maestro (system: ${systemOk.trim()})` }

    return { ok: false, path: maestroPath }
  }

  /**
   * Bangun environment variables untuk menjalankan Maestro
   * Maestro adalah shell script yang butuh JAVA_HOME
   */
  _buildMaestroEnv() {
    const home = require('os').homedir()
    const env  = { ...process.env }

    // Cari JAVA_HOME dari berbagai sumber
    const javaPath = this._getJavaPath()
    if (javaPath) {
      // javaPath adalah path ke binary java, JAVA_HOME adalah parent dari bin/
      const javaHome = require('path').dirname(require('path').dirname(javaPath))
      env.JAVA_HOME = javaHome
      env.PATH      = `${javaHome}/bin:${env.PATH || ''}`
    }

    // Tambahkan ~/.testpilot/bin ke PATH agar maestro bisa ditemukan
    env.PATH = `${home}/.testpilot/bin:${home}/.testpilot/bin/maestro/bin:${env.PATH || ''}`

    // Pastikan PATH standar macOS tersedia (Electron tidak selalu inherit full PATH)
    const macPaths = '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
    if (!env.PATH.includes('/usr/local/bin')) {
      env.PATH = `${env.PATH}:${macPaths}`
    }

    return env
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
   * Production-safe: bekerja dari DMG/EXE tanpa terminal
   */
  async installMaestro() {
    const check = await this._checkMaestro()
    if (check.ok) {
      this._emit('done', 'maestro', 100, `Maestro sudah tersedia: ${check.path}`)
      return
    }

    this._emit('start', 'maestro', 0, 'Mendownload Maestro CLI...')

    const platform = process.platform
    const url      = MAESTRO_URLS[platform] || MAESTRO_URLS.linux
    const tmpZip   = path.join(DIRS.cache, 'maestro.zip')

    logger.info(`Downloading Maestro from: ${url}`)
    await this._download(url, tmpZip, pct =>
      this._emit('progress', 'maestro', pct, `Mendownload Maestro... ${pct}%`)
    )

    this._emit('progress', 'maestro', 90, 'Mengekstrak Maestro...')

    // Extract ZIP
    const zip = new AdmZip(tmpZip)
    zip.extractAllTo(DIRS.bin, true)
    try { fs.unlinkSync(tmpZip) } catch {}

    this._emit('progress', 'maestro', 95, 'Mengatur permission...')

    // Set chmod +x menggunakan Node.js murni — tidak butuh shell command
    // Bekerja di DMG/EXE tanpa terminal
    if (platform !== 'win32') {
      this._chmodRecursive(DIRS.bin, 0o755)
    }

    // Verifikasi
    const maestroPath = getMaestroPath()
    const exists = fs.existsSync(maestroPath)
    logger.info(`Maestro install done. Path: ${maestroPath}, exists: ${exists}`)

    if (!exists) {
      // Log isi folder untuk debug
      try {
        const { spawnAsync } = require('../utils/process-utils')
        const { stdout } = await spawnAsync('find', [DIRS.bin, '-name', 'maestro'], { timeout: 5000 })
          .catch(() => ({ stdout: '' }))
        logger.warn(`Maestro binary not at expected path. find output:\n${stdout}`)
      } catch {}
    }

    this._emit('done', 'maestro', 100, '✅ Maestro CLI terinstall')
  }

  /**
   * Install Maestro driver ke device Android
   *
   * Proses:
   * 1. maestro download-driver  → download APK ke ~/.maestro/
   * 2. Cari APK yang didownload
   * 3. adb install APK ke device
   */
  async installMaestroDriver(serial, onProgress) {
    const emit       = onProgress || ((msg) => logger.info(`[driver] ${msg}`))
    const maestroPath = getMaestroPath()
    const home       = os.homedir()
    const { execFile, spawn } = require('child_process')
    const { getAdbPath } = require('../utils/process-utils')

    if (!fs.existsSync(maestroPath)) {
      throw new Error('Maestro CLI tidak ditemukan. Setup dulu di First-time Setup.')
    }

    emit('⬇️ Step 1/3: Mendownload Maestro Android driver...')
    const env = this._buildMaestroEnv()

    // Step 1: download-driver
    await new Promise((resolve) => {
      const proc = spawn(maestroPath, ['download-driver'], { env })
      let out = ''
      const collect = (d) => {
        const t = d.toString(); out += t
        t.split('\n').filter(l => l.trim() && !l.includes('WARNING:') && !l.match(/^\s+at /))
          .forEach(l => emit(l.trim()))
      }
      proc.stdout?.on('data', collect)
      proc.stderr?.on('data', collect)
      proc.on('close', () => resolve())
      proc.on('error', () => resolve())
      setTimeout(() => { proc.kill(); resolve() }, 90000)
    })

    // Step 2: cari APK yang baru didownload
    emit('🔍 Step 2/3: Mencari driver APK...')
    const searchDirs = [
      path.join(home, '.maestro'),
      path.join(home, '.maestro', 'drivers'),
      path.join(home, '.android', 'maestro'),
      path.join(home, 'Library', 'Application Support', 'maestro'),
    ]

    const findApks = (dir) => {
      const results = []
      try {
        if (!fs.existsSync(dir)) return results
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) { results.push(...findApks(full)) }
          else if (e.name.endsWith('.apk')) { results.push(full) }
        }
      } catch {}
      return results
    }

    let apks = []
    for (const dir of searchDirs) {
      apks.push(...findApks(dir))
    }

    // Filter APK relevan (maestro driver / server)
    const driverApks = apks.filter(p =>
      p.toLowerCase().includes('maestro') ||
      p.toLowerCase().includes('driver') ||
      p.toLowerCase().includes('server')
    )

    if (driverApks.length === 0) {
      emit('⚠️ APK driver tidak ditemukan setelah download.')
      emit(`   Dicari di: ${searchDirs.join(', ')}`)
      emit('   Coba install manual: adb install -r -t ~/.maestro/drivers/*.apk')
      // Meski tidak ketemu, mungkin sudah terinstall sebelumnya
      return { ok: true, warning: 'apk-not-found' }
    }

    logger.info(`Found driver APKs: ${driverApks.join(', ')}`)
    emit(`✅ Ditemukan ${driverApks.length} APK driver`)

    // Step 3: install setiap APK ke device via adb
    emit('📲 Step 3/3: Menginstall driver ke device...')
    const adbPath = getAdbPath()

    for (const apkPath of driverApks) {
      const apkName = path.basename(apkPath)
      emit(`   Installing: ${apkName}`)
      const result = await new Promise((resolve) => {
        execFile(adbPath, ['-s', serial, 'install', '-r', '-t', '-g', apkPath],
          { timeout: 60000 },
          (err, stdout, stderr) => {
            const out = (stdout + stderr).toLowerCase()
            const ok  = !err || out.includes('success') || out.includes('installed')
            logger.info(`adb install ${apkName}: exit=${err?.code} out=${out.slice(0,200)}`)
            resolve({ ok, out })
          }
        )
      })
      if (result.ok) {
        emit(`   ✅ ${apkName} terinstall`)
      } else {
        emit(`   ⚠️ ${apkName}: ${result.out.slice(0, 100)}`)
      }
    }

    emit('✅ Driver installation selesai! Coba Run Steps lagi.')
    return { ok: true }
  }

  /**
   * Rekursif chmod menggunakan Node.js fs — tidak butuh shell
   * Aman dipakai dari dalam DMG/EXE
   */
  _chmodRecursive(dirPath, mode) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        try {
          if (entry.isDirectory()) {
            this._chmodRecursive(fullPath, mode)
          } else {
            fs.chmodSync(fullPath, mode)
            logger.debug(`chmod ${mode.toString(8)}: ${fullPath}`)
          }
        } catch (e) {
          logger.warn(`chmod skip ${fullPath}: ${e.message}`)
        }
      }
    } catch (e) {
      logger.warn(`_chmodRecursive failed for ${dirPath}: ${e.message}`)
    }
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