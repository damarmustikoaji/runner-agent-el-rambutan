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
   * Dapatkan package dan activity yang sedang aktif di foreground
   * Cara: dumpsys window → mCurrentFocus / mFocusedApp
   * Return: { package, activity, full } atau null
   */
  async getActiveApp(serial) {
    try {
      // Coba Android 10+ via dumpsys activity
      const { stdout: a } = await adbDevice(
        serial,
        ['shell', 'dumpsys', 'activity', 'activities', '|', 'grep', '-E', 'mResumedActivity|mCurrentFocus'],
        { timeout: 6000 }
      )
      let pkg = null, activity = null

      // Pattern: mResumedActivity: ActivityRecord{... pkg/Activity ...}
      const resumedMatch = a.match(/mResumedActivity[^\n]*?\{[^}]*\s+([\w.]+)\/([\w.]+)/)
      if (resumedMatch) {
        pkg      = resumedMatch[1]
        activity = resumedMatch[2]
      }

      // Fallback: dumpsys window mCurrentFocus
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

      // Normalize activity shorthand: .ActivityName → pkg.ActivityName
      if (activity && activity.startsWith('.')) activity = pkg + activity

      logger.info(`Active app: ${pkg}/${activity}`)
      return { package: pkg, activity, full: `${pkg}/${activity}` }
    } catch (err) {
      logger.warn('getActiveApp failed:', err.message)
      return null
    }
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
   * Dapatkan package/activity yang sedang aktif (foreground app)
   */
  async getActiveApp(serial) {
    try {
      // Method 1: dumpsys activity
      const { stdout: a } = await adbDevice(serial, ['shell', 'dumpsys', 'activity', 'activities'], { timeout: 6000 })
      const m1 = a.match(/mResumedActivity[^\n]*?\s+([\w.]+)\/([\w.$]+)/)
      if (m1) {
        const pkg = m1[1], act = m1[2].startsWith('.') ? m1[1] + m1[2] : m1[2]
        return { package: pkg, activity: act, full: `${pkg}/${act}` }
      }
      // Method 2: dumpsys window
      const { stdout: w } = await adbDevice(serial, ['shell', 'dumpsys', 'window'], { timeout: 6000 })
      const m2 = w.match(/mCurrentFocus[^\n]*\s+([\w.]+)\/([\w.$]+)/)
             || w.match(/mFocusedApp[^\n]*\s+([\w.]+)\/([\w.$]+)/)
      if (m2) {
        const pkg = m2[1], act = m2[2].startsWith('.') ? m2[1] + m2[2] : m2[2]
        return { package: pkg, activity: act, full: `${pkg}/${act}` }
      }
      return null
    } catch (err) {
      logger.warn('getActiveApp failed:', err.message)
      return null
    }
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