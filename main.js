/**
 * main.js — Electron Entry Point
 * Sesederhana mungkin. Semua logic ada di src/main/app.js
 */
const { app } = require('electron')

// Setup logger SEBELUM apapun — supaya error startup juga ke-log
const logger = require('./src/utils/logger')

// Handle uncaught errors sebelum app ready
process.on('uncaughtException', (err) => {
  logger.error('[UNCAUGHT EXCEPTION]', { message: err.message, stack: err.stack })
})
process.on('unhandledRejection', (reason) => {
  logger.error('[UNHANDLED REJECTION]', { reason: String(reason) })
})

// Bootstrap
app.whenReady()
  .then(() => require('./src/main/app').createApp())
  .catch(err => {
    logger.error('Failed to start app:', err)
    app.quit()
  })

app.on('window-all-closed', () => {
  // Quit di semua platform termasuk macOS
  // Standard macOS behavior (stay in dock) tidak cocok untuk tools seperti TestPilot
  app.quit()
})