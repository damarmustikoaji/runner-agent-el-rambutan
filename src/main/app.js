/**
 * src/main/app.js
 * BrowserWindow setup, app lifecycle, dan register IPC handlers
 */
const { BrowserWindow, app, shell, dialog } = require('electron')
const path   = require('path')
const logger = require('../utils/logger')
const db     = require('../store/database')

let mainWindow = null

async function createApp() {
  // Update log dir ke userData sekarang app sudah ready
  logger.setLogDir()

  // Init database PERTAMA
  db.init()

  mainWindow = new BrowserWindow({
    width:        1440,
    height:       900,
    minWidth:     1280,
    minHeight:    800,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f7f7f5',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      webSecurity:      true,
    },
  })

  // ── PENTING: Register IPC handlers SEBELUM loadFile ──────────
  // Renderer mulai bootstrap segera setelah loadFile dan langsung
  // memanggil IPC (misal db:envs:getAll di router.js).
  // Kalau handler belum ready → "No handler registered" error.
  const { registerAllHandlers } = require('./ipc-handlers')
  registerAllHandlers(mainWindow)

  // Start device polling (boleh async, tidak blocking renderer)
  const deviceManager = require('../core/device-manager')
  deviceManager.init().catch(err => logger.warn('deviceManager.init:', err.message))
  deviceManager.on('devices-updated', (devices) => {
    mainWindow?.webContents?.send('device:update', devices)
  })

  // Show saat sudah siap (cegah white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    logger.info('Window ready to show')
  })

  // Load renderer — SETELAH handlers registered
  await mainWindow.loadFile(
    path.join(__dirname, '../../src/renderer/index.html')
  )

  // DevTools hanya di development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  logger.info(`App started. Electron ${process.versions.electron}, Node ${process.versions.node}`)
  return mainWindow
}

function getMainWindow() { return mainWindow }

// Cleanup saat app quit
app.on('before-quit', () => {
  db.close()
  const deviceManager = require('../core/device-manager')
  deviceManager.stopPolling()
  const runner = require('../core/test-runner')
  if (runner.isRunning()) runner.stop()
})

module.exports = { createApp, getMainWindow }