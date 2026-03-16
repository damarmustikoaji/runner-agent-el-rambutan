/**
 * src/utils/logger.js
 *
 * Centralized logger dengan Winston.
 * - Console output saat development
 * - File output (JSON) untuk diagnostik
 * - Separate error.log untuk error saja
 * - Daily rotation agar tidak memenuhi disk
 *
 * Dipakai di Main Process saja.
 * Renderer menggunakan window.testpilot.* API.
 */
const { createLogger, format, transports } = require('winston')
require('winston-daily-rotate-file')
const path = require('path')
const fs   = require('fs')

// Tentukan log directory
// app belum siap saat logger di-load, pakai env variable atau fallback
function getLogDir() {
  try {
    const { app } = require('electron')
    return path.join(app.getPath('userData'), 'logs')
  } catch {
    // Fallback saat unit test atau electron belum ready
    return path.join(require('os').homedir(), '.testpilot', 'logs')
  }
}

const logDir = getLogDir()
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

// Format untuk file: JSON dengan timestamp
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.json()
)

// Format untuk console: warna + simple
const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ level, message, timestamp, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    return `${timestamp} ${level}: ${message}${metaStr}`
  })
)

const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  transports: [
    // ── Console (dev only)
    new transports.Console({
      silent: process.env.NODE_ENV !== 'development',
      format: consoleFormat,
    }),

    // ── App log (rotasi harian, simpan 7 hari)
    new transports.DailyRotateFile({
      filename:    path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '7d',
      maxSize:     '10m',
      format:      fileFormat,
    }),

    // ── Error log (permanent, simpan 30 hari)
    new transports.DailyRotateFile({
      filename:    path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level:       'error',
      maxFiles:    '30d',
      format:      fileFormat,
    }),
  ]
})

// Convenience: buat child logger dengan context
logger.child = (context) => logger.child(context)

module.exports = logger