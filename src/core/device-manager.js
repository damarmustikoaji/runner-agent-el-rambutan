/**
 * src/core/device-manager.js
 *
 * Mengelola deteksi dan koneksi device Android via ADB.
 * - Polling periodik untuk deteksi device baru/cabut
 * - Emit events ke IPC untuk update UI real-time
 * - Satu device aktif pada satu waktu
 */
const EventEmitter = require('events')
const { adb, adbDevice, isBinaryAvailable, getAdbPath } = require('../utils/process-utils')
const logger = require('../utils/logger')

// iOS Simulator UDID: UUID format 8-4-4-4-12
function _isIosSim(serial) {
  return /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(serial)
}

const POLL_INTERVAL_MS = 10000  // cek device setiap 10 detik (sebelumnya 3s — terlalu sering, ganggu uiautomator)

class DeviceManager extends EventEmitter {
  constructor() {
    super()
    this.devices      = []
    this.activeSerial = null
    this.pollTimer    = null
    this.adbReady     = false
    this._paused      = false   // pause saat Inspector melakukan XML dump
  }

  async init() {
    // Coba temukan ADB yang berfungsi
    const adbPath = await this._findWorkingAdb()
    if (!adbPath) {
      logger.warn('ADB not found anywhere. Device polling disabled.')
      this.adbReady = false
      return
    }

    // Simpan path yang berhasil ke env agar getAdbPath() bisa pakai
    process.env._TESTPILOT_ADB_PATH = adbPath
    this.adbReady = true
    logger.info(`ADB ready at: ${adbPath}`)

    // Start ADB server
    await require('../utils/process-utils').spawnAsync(adbPath, ['start-server'], { timeout: 5000 })
      .catch(e => logger.warn('adb start-server:', e.message))

    await this.refresh()
    this._startPolling()
  }

  async _findWorkingAdb() {
    const { execFile } = require('child_process')
    const home = require('os').homedir()

    const candidates = [
      getAdbPath(),   // bundled atau ~/.testpilot/adb/adb
      'adb',
      `${home}/Library/Android/sdk/platform-tools/adb`,
      `${home}/Android/Sdk/platform-tools/adb`,
      '/usr/local/bin/adb',
      '/opt/homebrew/bin/adb',
    ]
    if (process.env.ANDROID_HOME) {
      candidates.unshift(require('path').join(process.env.ANDROID_HOME, 'platform-tools', 'adb'))
    }
    if (process.env.ANDROID_SDK_ROOT) {
      candidates.unshift(require('path').join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'))
    }

    for (const p of candidates) {
      const ok = await new Promise(resolve => {
        execFile(p, ['version'], { timeout: 3000 }, (err, stdout) => {
          resolve(!err && stdout?.toLowerCase().includes('android debug bridge'))
        })
      })
      if (ok) return p
    }
    return null
  }

  _startPolling() {
    if (this.pollTimer) return
    this.pollTimer = setInterval(() => this.refresh(), POLL_INTERVAL_MS)
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  // Pause sementara tanpa stop timer — dipakai saat Inspector dump XML
  pausePolling()  { this._paused = true  }
  resumePolling() { this._paused = false }

  /**
   * Refresh daftar device dari `adb devices -l` + `xcrun simctl list` (iOS)
   */
  async refresh() {
    if (!this.adbReady) return
    if (this._paused) return

    try {
      // ── Android via ADB ─────────────────────────────────────
      const { stdout: adbOut } = await adb(['devices', '-l'], { timeout: 5000 })
      const androidDevices = this._parseDevices(adbOut)

      // ── iOS Simulator via xcrun simctl ──────────────────────
      const iosDevices = await this._getIosSimulators()

      const newDevices = [...androidDevices, ...iosDevices]
      const changed = JSON.stringify(newDevices) !== JSON.stringify(this.devices)
      if (changed) {
        this.devices = newDevices
        logger.info(`Devices updated: ${newDevices.length} device(s)`)
        this.emit('devices-updated', newDevices)
      }
    } catch (err) {
      logger.error('Failed to refresh devices:', { error: err.message })
    }
  }

  async _getIosSimulators() {
    return new Promise(resolve => {
      const { execFile } = require('child_process')
      execFile('xcrun', ['simctl', 'list', 'devices', '--json'], { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) return resolve([])
        try {
          const data    = JSON.parse(stdout)
          const devices = []
          for (const [runtime, sims] of Object.entries(data.devices || {})) {
            // Hanya iOS — skip watchOS, tvOS, visionOS
            if (!runtime.toLowerCase().includes('ios')) continue
            const iosVersion = runtime.match(/iOS[-.\s]?(\d+[\d.]*)/i)?.[1] || runtime
            for (const sim of sims) {
              if (sim.state !== 'Booted') continue
              devices.push({
                serial:     sim.udid,
                model:      sim.name,
                type:       'ios-simulator',
                platform:   'ios',
                iosVersion,
                online:     true,
                status:     'device',
              })
            }
          }
          resolve(devices)
        } catch { resolve([]) }
      })
    })
  }

  _parseDevices(raw) {
    const lines = raw.split('\n')
    const devices = []

    for (const line of lines) {
      if (!line.trim() || line.startsWith('List of devices')) continue

      const parts = line.trim().split(/\s+/)
      if (parts.length < 2) continue

      const serial = parts[0]
      const status = parts[1]

      // Extract model dari info tambahan: "model:Pixel_7"
      let model = serial
      const modelMatch = line.match(/model:(\S+)/)
      if (modelMatch) model = modelMatch[1].replace(/_/g, ' ')

      // Detect type
      const type = serial.startsWith('emulator-') ? 'emulator'
                 : serial.startsWith('192.')       ? 'wireless'
                 : 'usb'

      devices.push({
        serial,
        status,  // 'device', 'offline', 'unauthorized'
        model,
        type,
        online: status === 'device',
      })
    }

    return devices
  }

  getDevices() {
    return this.devices
  }

  getOnlineDevices() {
    return this.devices.filter(d => d.online)
  }

  /**
   * Connect ke device dan fetch info lengkap
   */
  async connect(serial) {
    const device = this.devices.find(d => d.serial === serial)
    if (!device) throw new Error(`Device ${serial} not found`)
    if (!device.online) throw new Error(`Device ${serial} is not online (status: ${device.status})`)

    // Fetch detail device
    const info = await this.getDeviceInfo(serial)
    this.activeSerial = serial
    logger.info(`Connected to device: ${serial}`, info)
    this.emit('device-connected', { serial, ...info })
    return { serial, ...info }
  }

  disconnect() {
    const prev = this.activeSerial
    this.activeSerial = null
    if (prev) this.emit('device-disconnected', prev)
    return prev
  }

  getActive() {
    if (!this.activeSerial) return null
    return this.devices.find(d => d.serial === this.activeSerial) || null
  }

  /**
   * Ambil info lengkap device: OS version, manufacturer, SDK, screen size
   */
  async getDeviceInfo(serial) {
    // ── iOS Simulator ─────────────────────────────────────────
    if (_isIosSim(serial)) {
      const device = this.devices.find(d => d.serial === serial)
      // Resolusi berdasarkan model — iOS Simulator pakai point space bukan pixel
      const name = device?.model || ''
      let screenWidth = 390, screenHeight = 844  // iPhone 14/15/16 default

      if (name.includes('Pro Max') || name.includes('Plus')) { screenWidth = 430; screenHeight = 932 }
      else if (name.includes('17 Pro') || name.includes('16 Pro')) { screenWidth = 393; screenHeight = 852 }
      else if (name.includes('SE'))    { screenWidth = 375; screenHeight = 667 }
      else if (name.includes('mini'))  { screenWidth = 375; screenHeight = 812 }
      else if (name.includes('Air') && name.includes('iPhone')) { screenWidth = 393; screenHeight = 852 }
      else if (name.includes('iPad Pro 13')) { screenWidth = 1032; screenHeight = 1376 }
      else if (name.includes('iPad Pro 11')) { screenWidth = 834;  screenHeight = 1210 }
      else if (name.includes('iPad Air 13')) { screenWidth = 1024; screenHeight = 1366 }
      else if (name.includes('iPad Air 11')) { screenWidth = 820;  screenHeight = 1180 }
      else if (name.includes('iPad mini'))   { screenWidth = 744;  screenHeight = 1133 }
      else if (name.includes('iPad'))        { screenWidth = 810;  screenHeight = 1080 }

      return {
        serial,
        model:          name || 'iPhone Simulator',
        manufacturer:   'Apple',
        platform:       'ios',
        iosVersion:     device?.iosVersion || '',
        type:           'ios-simulator',
        screenWidth,
        screenHeight,
        online:         true,
      }
    }

    // ── Android via ADB ───────────────────────────────────────
    const props = [
      ['ro.product.manufacturer', 'manufacturer'],
      ['ro.product.model',        'model'],
      ['ro.build.version.release','androidVersion'],
      ['ro.build.version.sdk',    'sdkVersion'],
      ['ro.product.cpu.abi',      'abi'],
    ]

    const info = {}
    for (const [prop, key] of props) {
      try {
        const { stdout } = await adbDevice(serial, ['shell', 'getprop', prop], { timeout: 3000 })
        info[key] = stdout.trim()
      } catch {
        info[key] = 'unknown'
      }
    }

    // Screen size
    try {
      const { stdout: sizeOut } = await adbDevice(serial, ['shell', 'wm', 'size'], { timeout: 3000 })
      const m = sizeOut.match(/(\d+)x(\d+)/)
      if (m) {
        info.screenWidth  = parseInt(m[1])
        info.screenHeight = parseInt(m[2])
      }
    } catch {
      info.screenWidth  = 1080
      info.screenHeight = 1920
    }

    return info
  }

  /**
   * List semua package yang terinstall di device
   */
  async listPackages(serial) {
    const { stdout } = await adbDevice(serial, ['shell', 'pm', 'list', 'packages', '-3'], { timeout: 10000 })
    return stdout.split('\n')
      .filter(l => l.startsWith('package:'))
      .map(l => l.replace('package:', '').trim())
      .sort()
  }

  /**
   * Install APK ke device
   */
  async installApk(serial, apkPath) {
    logger.info(`Installing APK: ${apkPath} → ${serial}`)
    const { stdout, stderr, exitCode } = await adbDevice(
      serial,
      ['install', '-r', apkPath],
      { timeout: 120000 }  // 2 menit untuk install
    )
    if (exitCode !== 0 || stderr.includes('FAILED')) {
      throw new Error(`APK install failed: ${stderr || stdout}`)
    }
    logger.info(`APK installed successfully`)
    return true
  }

  /**
   * Dapatkan package/bundleId app yang sedang aktif di foreground
   * Android: dumpsys window
   * iOS Simulator: xcrun simctl listapps + check frontmost
   */
  async getActiveApp(serial) {
    // ── iOS Simulator ─────────────────────────────────────────
    if (_isIosSim(serial)) {
      return this._getActiveAppIos(serial)
    }

    // ── Android via ADB ───────────────────────────────────────
    try {
      const { stdout: a } = await adbDevice(
        serial,
        ['shell', 'dumpsys', 'activity', 'activities', '|', 'grep', '-E', 'mResumedActivity|mCurrentFocus'],
        { timeout: 6000 }
      )
      let pkg = null, activity = null

      const resumedMatch = a.match(/mResumedActivity[^\n]*?\{[^}]*\s+([\w.]+)\/([\w.]+)/)
      if (resumedMatch) { pkg = resumedMatch[1]; activity = resumedMatch[2] }

      if (!pkg) {
        const { stdout: w } = await adbDevice(
          serial,
          ['shell', 'dumpsys', 'window', 'windows', '|', 'grep', '-E', 'mCurrentFocus|mFocusedApp'],
          { timeout: 6000 }
        )
        const focusMatch = w.match(/(?:mCurrentFocus|mFocusedApp)[^\n]*?\{[^}]*\s+([\w.]+)\/([\w.]+)/)
        if (focusMatch) { pkg = focusMatch[1]; activity = focusMatch[2] }
      }

      if (!pkg) return null
      if (activity && activity.startsWith('.')) activity = pkg + activity
      logger.info(`Active app: ${pkg}/${activity}`)
      return { package: pkg, activity, full: `${pkg}/${activity}` }
    } catch (err) {
      logger.warn('getActiveApp failed:', err.message)
      return null
    }
  }

  async _getActiveAppIos(udid) {
    const { execFile } = require('child_process')
    return new Promise(resolve => {
      // xcrun simctl listapps — list semua installed apps + filter yang bukan system
      execFile('xcrun', ['simctl', 'listapps', udid],
        { timeout: 8000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null)
          try {
            // Output adalah plist — parse bundle IDs
            // Cari CFBundleIdentifier dari semua apps
            const bundleIds = []
            const matches = stdout.matchAll(/CFBundleIdentifier\s*=\s*"([^"]+)"/g)
            for (const m of matches) bundleIds.push(m[1])

            // Filter: prioritaskan non-Apple apps (user installed)
            const userApps = bundleIds.filter(b =>
              !b.startsWith('com.apple.') &&
              !b.startsWith('com.crashlytics') &&
              b.includes('.')
            )

            // Kalau ada user app, ambil yang pertama
            // Kalau tidak ada, fallback ke Contacts atau Safari
            const bestGuess = userApps[0]
              || bundleIds.find(b => b === 'com.apple.MobileAddressBook')
              || bundleIds.find(b => b === 'com.apple.mobilesafari')
              || bundleIds[0]

            if (!bestGuess) return resolve(null)

            logger.info(`iOS active app (best guess): ${bestGuess}`)
            resolve({
              package:  bestGuess,
              activity: null,
              full:     bestGuess,
              platform: 'ios',
              allApps:  userApps.slice(0, 20),  // untuk dropdown
            })
          } catch (e) {
            logger.warn('_getActiveAppIos parse failed:', e.message)
            resolve(null)
          }
        })
    })
  }

  /**
   * Dapatkan daftar activity dari package tertentu
   * via pm dump packageName
   */
  /**
   * Launch app di device
   */
  async launchApp(serial, packageName, activity = '') {
    const target = activity
      ? `${packageName}/${activity}`
      : `${packageName}/.MainActivity`

    const { stdout, exitCode } = await adbDevice(
      serial,
      ['shell', 'am', 'start', '-n', target],
      { timeout: 10000 }
    )
    if (exitCode !== 0 || stdout.includes('Error')) {
      const { stdout: intentOut } = await adbDevice(
        serial,
        ['shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName],
        { timeout: 5000 }
      ).catch(() => ({ stdout: '' }))
      const resolvedActivity = intentOut.trim().split('\n').pop()
      if (resolvedActivity && resolvedActivity.includes('/')) {
        await adbDevice(serial, ['shell', 'am', 'start', '-n', resolvedActivity])
      }
    }
    logger.info(`Launched: ${packageName} on ${serial}`)
  }

  /**
   * Dapatkan daftar activity dari package via pm dump
   */
  async getActivities(serial, packageName) {
    try {
      const { stdout } = await adbDevice(serial, ['shell', 'pm', 'dump', packageName], { timeout: 8000 })
      const activities = []
      const re = /^\s+([A-Za-z0-9_.]+\/[A-Za-z0-9_.]+)/gm
      let m
      while ((m = re.exec(stdout)) !== null) {
        const a = m[1]
        if (a.includes(packageName.split('.').pop()) && !activities.includes(a)) {
          activities.push(a)
        }
      }
      return activities.length ? activities.slice(0, 15) : [`${packageName}/.MainActivity`]
    } catch {
      return [`${packageName}/.MainActivity`]
    }
  }
}

// Singleton
module.exports = new DeviceManager()