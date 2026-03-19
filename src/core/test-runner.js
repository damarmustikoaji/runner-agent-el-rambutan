/**
 * src/core/test-runner.js
 *
 * Test runner menggunakan Maestro CLI.
 *
 * PENTING — Session Isolation:
 * Runner dan Inspector TIDAK boleh berjalan bersamaan pada device yang sama.
 * Ini dijaga oleh:
 * 1. RunnerLock — prevent 2 run bersamaan
 * 2. IPC handler memeriksa lock sebelum start
 * 3. Inspector.session = null saat runner aktif
 *
 * Flow:
 * 1. Terima config (tc YAML path + device serial + env vars)
 * 2. Resolve {{VARIABLE}} dengan nilai dari environment aktif
 * 3. Tulis YAML yang sudah di-resolve ke tmp file
 * 4. Spawn Maestro CLI → stream stdout sebagai structured log
 * 5. Emit events: log, stepUpdate, finish
 * 6. Cleanup tmp file
 */
const { spawn }     = require('child_process')
const path          = require('path')
const fs            = require('fs')
const os            = require('os')
const EventEmitter  = require('events')
const { getMaestroPath, isBinaryAvailable } = require('../utils/process-utils')
const logger        = require('../utils/logger')

// ── Lock ──────────────────────────────────────────────────────
// Prevent session conflict antara Inspector dan Runner
let _runnerLock = null

function acquireLock(serial) {
  if (_runnerLock) {
    throw new Error(
      `Runner sedang berjalan pada device ${_runnerLock}. ` +
      `Tunggu sampai selesai atau stop terlebih dahulu.`
    )
  }
  _runnerLock = serial
  logger.info(`Runner lock acquired: ${serial}`)
}

function releaseLock() {
  const serial = _runnerLock
  _runnerLock = null
  if (serial) logger.info(`Runner lock released: ${serial}`)
}

function isRunning() {
  return _runnerLock !== null
}

// ── Runner ────────────────────────────────────────────────────

class TestRunner extends EventEmitter {
  constructor() {
    super()
    this._process  = null
    this._runId    = null
    this._serial   = null
  }

  /**
   * Mulai run test case
   * @param {Object} config
   * @param {string} config.serial       - device serial
   * @param {string} config.stepsYaml   - YAML string steps
   * @param {string} config.tcName      - nama test case (untuk log)
   * @param {string} config.tcId        - ID test case
   * @param {Object} config.envVars     - key-value env variables untuk replace {{VAR}}
   * @param {boolean} config.noReset    - --no-reset flag
   */
  async run(config) {
    if (!config.serial) throw new Error('Serial device diperlukan')
    if (!config.stepsYaml) throw new Error('Steps YAML diperlukan')

    // Cek Maestro tersedia
    const maestroPath = getMaestroPath()
    const maestroOk = await isBinaryAvailable(maestroPath)
    if (!maestroOk) {
      throw new Error(
        'Maestro CLI tidak ditemukan. Silakan jalankan Setup Wizard terlebih dahulu.'
      )
    }

    // Acquire lock — cegah bentrok dengan Inspector atau run lain
    acquireLock(config.serial)

    this._serial = config.serial
    this._runId  = `run-${Date.now()}`

    // Resolve environment variables di YAML
    const resolvedYaml = this._resolveEnvVars(config.stepsYaml, config.envVars || {})

    // Tulis ke tmp file
    const tmpYaml = path.join(os.tmpdir(), `testpilot_run_${this._runId}.yaml`)
    fs.writeFileSync(tmpYaml, resolvedYaml, 'utf8')

    logger.info(`Starting test run: ${config.tcName} on ${config.serial}`)
    this._emitLog('info', `▶ Memulai: ${config.tcName}`)
    this._emitLog('info', `   Device: ${config.serial}`)
    this._emitLog('info', `   Maestro: ${maestroPath}`)

    try {
      await this._spawnMaestro(maestroPath, tmpYaml, config)
    } finally {
      // Selalu cleanup dan release lock
      fs.unlink(tmpYaml, () => {})
      releaseLock()
      this._process = null
      this._serial  = null
    }
  }

  async _spawnMaestro(maestroPath, yamlPath, config) {
    const home    = os.homedir()
    const javaEnv = this._buildJavaEnv()
    const env     = {
      ...process.env,
      ...javaEnv,
      ...config.envVars,
      TERM: 'dumb',
      PATH: [
        path.join(home, '.testpilot', 'bin', 'maestro', 'bin'),
        path.join(home, '.testpilot', 'bin'),
        javaEnv.JAVA_HOME ? path.join(javaEnv.JAVA_HOME, 'bin') : '',
        '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin',
        process.env.PATH || '',
      ].filter(Boolean).join(':'),
    }

    // Setup evidence directory
    const evidenceDir = config.evidenceDir
    const tcFolder    = evidenceDir
      ? path.join(evidenceDir, (config.tcName||'tc').replace(/[^a-z0-9_-]/gi, '_'))
      : null

    if (tcFolder) {
      try { fs.mkdirSync(tcFolder, { recursive: true }) } catch {}
    }

    // Screenshot helper — support Android (ADB) dan iOS (xcrun simctl)
    const { execFile } = require('child_process')
    const isIos = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(config.serial)

    const captureScreenshot = (label) => {
      if (!tcFolder || !config.serial) return
      const localPath = path.join(tcFolder, `${label}.png`)

      if (isIos) {
        // iOS Simulator: xcrun simctl io <udid> screenshot <file>
        execFile('xcrun', ['simctl', 'io', config.serial, 'screenshot', localPath],
          { timeout: 10000 },
          (err) => {
            if (err) logger.warn(`iOS evidence screenshot failed: ${err.message}`)
            else logger.debug(`iOS evidence screenshot: ${localPath}`)
          })
      } else {
        // Android: ADB exec-out screencap
        const { getAdbPath } = require('../utils/process-utils')
        const adbPath = getAdbPath()
        execFile(adbPath, ['-s', config.serial, 'exec-out', 'screencap', '-p'],
          { encoding: 'buffer', timeout: 10000 },
          (err, stdout) => {
            if (!err && stdout && stdout.length > 4 &&
                stdout[0]===0x89 && stdout[1]===0x50) {
              fs.writeFile(localPath, stdout, () =>
                logger.debug(`Android evidence screenshot: ${localPath}`)
              )
            }
          })
      }
    }

    return new Promise((resolve, reject) => {
      const args = [
        '--device', config.serial,
        'test', yamlPath, '--no-ansi',
      ]
      if (config.noReset || config.noReinstallDriver) {
        args.push('--no-reinstall-driver')
      }
      if (config.autoGrant && config.serial && config.stepsYaml) {
        const pkg = (config.stepsYaml.match(/^appId:\s*(\S+)/m) || [])[1]
        if (pkg) {
          execFile(adbPath, ['-s', config.serial, 'shell', 'pm', 'grant', pkg,
            'android.permission.READ_EXTERNAL_STORAGE'], () => {})
          execFile(adbPath, ['-s', config.serial, 'shell', 'pm', 'grant', pkg,
            'android.permission.WRITE_EXTERNAL_STORAGE'], () => {})
        }
      }

      this._process = spawn(maestroPath, args, { env })

      let currentStep      = 0
      let injectErrorShown = false

      // ── stdout ─────────────────────────────────────────
      this._process.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim())
        for (const line of lines) {
          logger.debug(`[maestro] ${line}`)

          // Filter Java stacktraces
          if (line.match(/^\s+at [a-zA-Z]/) || line.includes('CoroutineScheduler')) continue

          // INJECT_EVENTS
          if (!injectErrorShown && line.includes('INJECT_EVENTS')) {
            injectErrorShown = true
            this._emitLog('fail', '❌ INJECT_EVENTS: Maestro driver belum terinstall di device.')
            this._emitLog('warn', '🔄 Klik "Install Driver Sekarang" di banner merah, lalu Run lagi.')
            continue
          }

          const parsed = this._parseMaestroLine(line)
          this._emitLog(parsed.type, parsed.msg)

          // Step start: naikkan counter dan emit 'running'
          if (parsed.stepStart) {
            currentStep++
            this.emit('runner:stepUpdate', {
              runId: this._runId, tcId: config.tcId,
              stepIndex: currentStep,
              stepStatus: 'running',
              msg: parsed.msg,
            })
          }

          // Step done: emit pass/fail + capture screenshot evidence
          if (parsed.stepDone && currentStep > 0) {
            this.emit('runner:stepUpdate', {
              runId: this._runId, tcId: config.tcId,
              stepIndex: currentStep,
              stepStatus: parsed.stepResult,
              msg: parsed.msg,
            })
            // Screenshot per step
            if (config.screenshotPerStep) {
              const label = `step_${String(currentStep).padStart(2,'0')}_${parsed.stepResult}`
              captureScreenshot(label)
            }
            // Screenshot saat fail
            if (parsed.stepResult === 'fail' && config.screenshotOnFail && !config.screenshotPerStep) {
              captureScreenshot(`step_${String(currentStep).padStart(2,'0')}_FAIL`)
            }
          }
        }
      })

      // ── stderr ─────────────────────────────────────────
      this._process.stderr.on('data', (data) => {
        const text = data.toString().trim()
        if (!text) return
        logger.warn(`[maestro:stderr] ${text}`)

        // Filter WARNING Java yang tidak relevan
        if (text.includes('WARNING:') && (
          text.includes('java.lang.System') ||
          text.includes('sun.misc.Unsafe') ||
          text.includes('enable-native-access') ||
          text.includes('ALL-UNNAMED')
        )) return

        // Deteksi INJECT_EVENTS
        if (!injectErrorShown && text.includes('INJECT_EVENTS')) {
          injectErrorShown = true
          this._emitLog('fail', '❌ INJECT_EVENTS: Maestro driver belum terinstall di device.')
          this._emitLog('warn', '🔄 Run sedang menginstall driver, tunggu run berikutnya...')
          return
        }

        // Stacktrace lines — skip
        if (text.match(/^\s+at [a-zA-Z]/) || text.includes('StatusRuntimeException')) return

        // Pesan relevan lain (pendek)
        if (text.length < 300 && !text.includes('Config Field Required')) {
          this._emitLog('warn', text)
        }
      })

      // ── close ──────────────────────────────────────────
      this._process.on('close', (exitCode) => {
        const success = exitCode === 0
        const status  = success ? 'pass' : 'fail'

        logger.info(`Test run finished: ${config.tcName} → ${status} (exit ${exitCode})`)
        this._emitLog(status, success
          ? `✅ LULUS — ${config.tcName}`
          : `❌ GAGAL — ${config.tcName} (exit code: ${exitCode})`
        )

        this.emit('runner:finish', {
          runId: this._runId, tcId: config.tcId, tcName: config.tcName, status, exitCode,
        })

        success
          ? resolve({ status, exitCode })
          : reject(Object.assign(new Error(`Test gagal: exit code ${exitCode}`), { status: 'fail', exitCode }))
      })

      this._process.on('error', (err) => {
        logger.error('Maestro process error:', err)
        this._emitLog('fail', `Error: ${err.message}`)
        reject(err)
      })
    })
  }

  /**
   * Bangun env dengan JAVA_HOME dari ~/.testpilot/java/ atau system Java
   */
  _buildJavaEnv() {
    const home = os.homedir()
    const env  = {}

    // Cek ~/.testpilot/java/ dulu (downloaded by setup)
    const javaBase = path.join(home, '.testpilot', 'java')
    try {
      const fs = require('fs')
      if (fs.existsSync(javaBase)) {
        const entries = fs.readdirSync(javaBase)
        for (const entry of entries) {
          const javaExe = path.join(javaBase, entry, 'bin', 'java')
          if (fs.existsSync(javaExe)) {
            env.JAVA_HOME = path.join(javaBase, entry)
            logger.debug(`JAVA_HOME set: ${env.JAVA_HOME}`)
            return env
          }
        }
      }
    } catch {}

    // Cek system JAVA_HOME
    if (process.env.JAVA_HOME) {
      env.JAVA_HOME = process.env.JAVA_HOME
      return env
    }

    // Coba detect dari `java -XshowSettings:property` — macOS
    // System Java di macOS biasanya di /usr/bin/java → /Library/Java/...
    const commonJavaHomes = [
      '/Library/Java/JavaVirtualMachines',
    ]
    for (const base of commonJavaHomes) {
      try {
        const fs = require('fs')
        if (fs.existsSync(base)) {
          const entries = fs.readdirSync(base)
          if (entries.length > 0) {
            env.JAVA_HOME = path.join(base, entries[0], 'Contents', 'Home')
            logger.debug(`JAVA_HOME detected: ${env.JAVA_HOME}`)
            return env
          }
        }
      } catch {}
    }

    return env  // kosong — pakai system PATH
  }

  /**
   * Parse output Maestro line by line.
   * Maestro output format:
   *   "Tap on text: Animation..."   → step starting
   *   "COMPLETED"                   → step passed
   *   "FAILED"                      → step failed
   *   "Element not found: ..."      → failure detail
   */
  _parseMaestroLine(line) {
    const t = line.trim()

    // Step completion
    if (t === 'COMPLETED' || t.startsWith('✅')) {
      return { type: 'pass', msg: t, stepDone: true, stepResult: 'pass' }
    }
    if (t === 'FAILED' || t.startsWith('❌')) {
      return { type: 'fail', msg: t, stepDone: true, stepResult: 'fail' }
    }

    // Step starting — Maestro prints "Tap on ...", "Launch app ...", "Assert ..."
    const stepStartPatterns = [
      /^Tap on /i, /^Launch app /i, /^Input text/i, /^Assert /i,
      /^Scroll /i, /^Swipe /i, /^Press key/i, /^Wait /i, /^Take screenshot/i,
      /^Long press/i, /^Clear text/i,
    ]
    const isStepStart = stepStartPatterns.some(p => p.test(t))
    if (isStepStart) {
      return { type: 'info', msg: t, stepStart: true }
    }

    // Error detail
    if (t.toLowerCase().includes('element not found') ||
        t.toLowerCase().includes('error') && !t.includes('WARNING')) {
      return { type: 'fail', msg: t }
    }
    if (t.toLowerCase().includes('warning') || t.toLowerCase().includes('warn')) {
      return { type: 'warn', msg: t }
    }
    return { type: 'info', msg: t }
  }

  /**
   * Replace {{VARIABLE}} dengan nilai dari envVars
   */
  _resolveEnvVars(yaml, envVars) {
    return yaml.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return envVars[key] !== undefined ? envVars[key] : match
    })
  }

  /**
   * Stop running test
   */
  stop() {
    if (this._process) {
      logger.info('Stopping test runner...')
      this._process.kill('SIGTERM')
      this._process = null
    }
    releaseLock()
    this.emit('runner:finish', {
      runId:  this._runId,
      status: 'stopped',
    })
  }

  _emitLog(type, msg) {
    const entry = {
      type,
      msg,
      ts: new Date().toISOString(),
    }
    this.emit('runner:log', entry)
  }

  isRunning() {
    return isRunning()
  }

  getStatus() {
    return {
      isRunning:    isRunning(),
      lockedSerial: _runnerLock,
    }
  }
}

// Singleton runner — satu runner per app
const runner = new TestRunner()
module.exports = runner
module.exports.isRunning = isRunning