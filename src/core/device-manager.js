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

const POLL_INTERVAL_MS = 3000  // cek device setiap 3 detik

class DeviceManager extends EventEmitter {
  constructor() {
    super()
    this.devices      = []
    this.activeSerial = null
    this.pollTimer    = null
    this.adbReady     = false
  }

  async init() {
    const adbPath = getAdbPath()
    logger.info(`Checking ADB at: ${adbPath}`)

    this.adbReady = await isBinaryAvailable(adbPath)
    if (!this.adbReady) {
      logger.warn('ADB not found. Devices will not be detected until ADB is installed.')
      return
    }

    // Start ADB server
    await adb(['start-server']).catch(e => logger.warn('adb start-server:', e.message))

    logger.info('ADB ready. Starting device polling...')
    await this.refresh()
    this._startPolling()
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

  /**
   * Refresh daftar device dari `adb devices -l`
   * Emit 'devices-updated' jika ada perubahan
   */
  async refresh() {
    if (!this.adbReady) return

    try {
      const { stdout } = await adb(['devices', '-l'], { timeout: 5000 })
      const newDevices = this._parseDevices(stdout)

      const changed = JSON.stringify(newDevices) !== JSON.stringify(this.devices)
      if (changed) {
        this.devices = newDevices
        logger.info(`Devices updated: ${newDevices.length} device(s)`, {
          devices: newDevices.map(d => `${d.serial}(${d.status})`)
        })
        this.emit('devices-updated', newDevices)
      }
    } catch (err) {
      logger.error('Failed to refresh devices:', { error: err.message })
    }
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

    // Kalau MainActivity tidak ada, coba cari activity utama
    if (exitCode !== 0 || stdout.includes('Error')) {
      const { stdout: intentOut } = await adbDevice(
        serial,
        ['shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName],
        { timeout: 5000 }
      )
      const resolvedActivity = intentOut.trim().split('\n').pop()
      if (resolvedActivity && resolvedActivity.includes('/')) {
        await adbDevice(serial, ['shell', 'am', 'start', '-n', resolvedActivity])
      }
    }
    logger.info(`Launched: ${packageName} on ${serial}`)
  }
}

// Singleton
module.exports = new DeviceManager()