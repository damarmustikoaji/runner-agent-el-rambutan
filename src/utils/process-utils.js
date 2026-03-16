/**
 * src/utils/process-utils.js
 *
 * Utility untuk spawn proses child dan resolve path binary.
 * Mendeteksi platform dan mengembalikan path binary yang tepat
 * (bundled di resources/bin/ atau didownload di ~/.testpilot/bin/).
 */
const { spawn, execFile } = require('child_process')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const logger = require('./logger')

// ── Binary paths ──────────────────────────────────────────────

const TESTPILOT_DIR = path.join(os.homedir(), '.testpilot')

/**
 * Dapatkan path ADB binary yang tepat.
 * Priority: bundled di resources/bin/ → ~/.testpilot/adb/
 */
function getAdbPath() {
  const platform = process.platform
  const adbName  = platform === 'win32' ? 'adb.exe' : 'adb'

  // 1. Cek bundled di app resources (production build)
  const resourcesPath = process.resourcesPath
    ? path.join(process.resourcesPath, 'bin', adbName)
    : null

  if (resourcesPath && fs.existsSync(resourcesPath)) {
    return resourcesPath
  }

  // 2. Cek di ~/.testpilot/adb/ (downloaded by setup)
  const setupPath = path.join(TESTPILOT_DIR, 'adb', adbName)
  if (fs.existsSync(setupPath)) {
    return setupPath
  }

  // 3. Fallback: system ADB (jika user sudah install Android Studio)
  return adbName
}

/**
 * Dapatkan path Maestro CLI.
 * Maestro zip mengekstrak ke subfolder: ~/.testpilot/bin/maestro/bin/maestro
 * Kita cek beberapa kemungkinan path.
 */
function getMaestroPath() {
  const binName = process.platform === 'win32' ? 'maestro.bat' : 'maestro'
  // Kemungkinan path setelah extract:
  // 1. ~/.testpilot/bin/maestro           (ideal, setelah rename)
  // 2. ~/.testpilot/bin/maestro/bin/maestro (zip subfolder default)
  const candidates = [
    path.join(TESTPILOT_DIR, 'bin', binName),
    path.join(TESTPILOT_DIR, 'bin', 'maestro', 'bin', binName),
    path.join(TESTPILOT_DIR, 'maestro', 'bin', binName),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  // Return path default meskipun belum ada (untuk display di UI)
  return path.join(TESTPILOT_DIR, 'bin', binName)
}

/**
 * Cek apakah sebuah binary bisa dieksekusi.
 * Mencoba beberapa flag umum karena setiap tool berbeda.
 */
function isBinaryAvailable(binaryPath) {
  return new Promise(resolve => {
    if (!fs.existsSync(binaryPath)) { resolve(false); return }
    // Coba tanpa argumen dulu (Maestro exit 0 saat dipanggil tanpa arg)
    execFile(binaryPath, [], { timeout: 5000 }, (err) => {
      if (!err) { resolve(true); return }
      // Exit code bukan 0 tidak berarti binary tidak ada —
      // bisa jadi argumen tidak valid tapi binary tetap ada
      // Selama bukan ENOENT / EACCES, anggap binary ada
      const notFound = err.code === 'ENOENT' || err.code === 'EACCES'
        || (err.message && err.message.includes('not found'))
      resolve(!notFound)
    })
  })
}

// ── Spawn helpers ─────────────────────────────────────────────

/**
 * Spawn process dan return Promise {stdout, stderr, exitCode}
 * Untuk one-shot command (bukan streaming)
 */
function spawnAsync(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    logger.debug(`spawn: ${cmd} ${args.join(' ')}`)
    const proc = spawn(cmd, args, {
      ...options,
      env: { ...process.env, ...options.env }
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', d => { stdout += d.toString() })
    proc.stderr?.on('data', d => { stderr += d.toString() })

    proc.on('close', exitCode => {
      logger.debug(`spawn exit ${exitCode}: ${cmd}`)
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode })
    })

    proc.on('error', err => {
      logger.error(`spawn error: ${cmd}`, { error: err.message })
      reject(err)
    })

    // Timeout
    if (options.timeout) {
      setTimeout(() => {
        proc.kill()
        reject(new Error(`Process timeout after ${options.timeout}ms: ${cmd}`))
      }, options.timeout)
    }
  })
}

/**
 * ADB wrapper — jalankan satu command ADB
 */
async function adb(args = [], options = {}) {
  const adbPath = getAdbPath()
  return spawnAsync(adbPath, args, { timeout: 10000, ...options })
}

/**
 * ADB dengan target serial tertentu
 */
async function adbDevice(serial, args = [], options = {}) {
  return adb(['-s', serial, ...args], options)
}

module.exports = {
  getAdbPath,
  getMaestroPath,
  isBinaryAvailable,
  spawnAsync,
  adb,
  adbDevice,
  TESTPILOT_DIR,
}