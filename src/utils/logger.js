/**
 * src/utils/logger.js
 *
 * Centralized logger dengan Winston.
 * - Console output saat development (npm run dev)
 * - File output ke ~/.testpilot/logs/ (dev) atau userData/logs/ (production)
 * - Daily rotation, simpan 7 hari app log + 30 hari error log
 *
 * FIX: logger.js di-load sebelum app.whenReady(), jadi pakai lazy init.
 * Setelah app ready, panggil logger.setLogDir() dari app.js untuk pindah
 * ke userData/logs/ yang benar.
 */
const { createLogger, format, transports } = require('winston')
require('winston-daily-rotate-file')
const path = require('path')
const fs   = require('fs')
const os   = require('os')

// ── Initial log dir — ~/.testpilot/logs saat startup ──────────
// Setelah app ready, setLogDir() akan update ke userData/logs/
let _logDir = path.join(os.homedir(), '.testpilot', 'logs')
try { fs.mkdirSync(_logDir, { recursive: true }) } catch {}

// ── Formats ───────────────────────────────────────────────────
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.json()
)

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    return `${timestamp} ${level}: ${message}${metaStr}`
  })
)

// ── Logger instance ────────────────────────────────────────────
const logger = createLogger({
  // Selalu debug — file log harus verbose untuk diagnostik
  level: process.env.LOG_LEVEL || 'debug',
  transports: [
    // Console: aktif saat development (npm run dev)
    new transports.Console({
      silent: process.env.NODE_ENV !== 'development',
      format: consoleFormat,
    }),
    // App log file
    new transports.DailyRotateFile({
      filename:    path.join(_logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '7d',
      maxSize:     '10m',
      format:      fileFormat,
    }),
    // Error log file (level error saja)
    new transports.DailyRotateFile({
      filename:    path.join(_logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level:       'error',
      maxFiles:    '30d',
      format:      fileFormat,
    }),
  ]
})

/**
 * Dipanggil dari app.js setelah app.whenReady()
 * Update log dir ke userData/logs/ agar log masuk ke folder yang benar
 * di production build (DMG)
 */
logger.setLogDir = function() {
  let newDir
  try {
    const { app } = require('electron')
    if (app && app.isReady && app.isReady()) {
      newDir = path.join(app.getPath('userData'), 'logs')
    }
  } catch {}
  if (!newDir || newDir === _logDir) return

  try {
    fs.mkdirSync(newDir, { recursive: true })

    // Remove file transports lama
    const old = logger.transports.filter(
      t => t instanceof transports.DailyRotateFile
    )
    old.forEach(t => logger.remove(t))

    // Add file transports baru dengan path userData
    logger.add(new transports.DailyRotateFile({
      filename:    path.join(newDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '7d',
      maxSize:     '10m',
      format:      fileFormat,
    }))
    logger.add(new transports.DailyRotateFile({
      filename:    path.join(newDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level:       'error',
      maxFiles:    '30d',
      format:      fileFormat,
    }))

    _logDir = newDir
    logger.info(`Logger: log dir set to ${_logDir}`)
  } catch (err) {
    logger.warn(`Logger: failed to update log dir — ${err.message}`)
  }
}

logger.getLogDir = function() { return _logDir }

module.exports = logger