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
    return new Promise((resolve, reject) => {
      const args = [
        '--device', config.serial,
        'test',
        yamlPath,
      ]
      if (config.noReset) args.push('--no-reset')

      this._process = spawn(maestroPath, args, {
        env: {
          ...process.env,
          // Inject env vars ke environment Maestro
          ...config.envVars,
          // Force color output
          TERM: 'dumb',
        }
      })

      let currentStep    = 0
      let totalSteps     = 0
      let lastStepStatus = 'idle'

      // ── stdout parsing ─────────────────────────────────
      this._process.stdout.on('data', (data) => {
        const text = data.toString()
        const lines = text.split('\n').filter(l => l.trim())

        for (const line of lines) {
          logger.debug(`[maestro] ${line}`)
          const parsed = this._parseMaestroLine(line)
          this._emitLog(parsed.type, parsed.msg)

          // Detect step events untuk update UI per-step
          if (parsed.stepIndex !== undefined) {
            currentStep = parsed.stepIndex
            if (totalSteps < currentStep) totalSteps = currentStep
            this.emit('runner:stepUpdate', {
              runId:       this._runId,
              tcId:        config.tcId,
              stepIndex:   currentStep,
              stepStatus:  parsed.type === 'fail' ? 'fail' : 'running',
              msg:         parsed.msg,
            })
          }
        }
      })

      // ── stderr ─────────────────────────────────────────
      this._process.stderr.on('data', (data) => {
        const text = data.toString().trim()
        if (text) {
          logger.warn(`[maestro:stderr] ${text}`)
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
          runId:   this._runId,
          tcId:    config.tcId,
          tcName:  config.tcName,
          status,
          exitCode,
        })

        success ? resolve({ status, exitCode }) : reject(Object.assign(
          new Error(`Test gagal: exit code ${exitCode}`),
          { status: 'fail', exitCode }
        ))
      })

      this._process.on('error', (err) => {
        logger.error('Maestro process error:', err)
        this._emitLog('fail', `Error: ${err.message}`)
        reject(err)
      })
    })
  }

  /**
   * Parse satu baris output Maestro → {type, msg, stepIndex?}
   */
  _parseMaestroLine(line) {
    // Maestro output patterns:
    // "✅ Tap on text: Login"
    // "❌ Failed to find element: id/btn_login"
    // "  > Flow: Login Flow"
    // "Running on device: Pixel 7"

    if (line.includes('✅') || line.toLowerCase().includes('passed')) {
      const stepMatch = line.match(/step[:\s]+(\d+)/i)
      return {
        type: 'pass',
        msg:  line.trim(),
        stepIndex: stepMatch ? parseInt(stepMatch[1]) : undefined,
      }
    }
    if (line.includes('❌') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('error')) {
      return { type: 'fail', msg: line.trim() }
    }
    if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
      return { type: 'warn', msg: line.trim() }
    }
    return { type: 'info', msg: line.trim() }
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
