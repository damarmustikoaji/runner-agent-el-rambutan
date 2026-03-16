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
  // Init database
  db.init()

  mainWindow = new BrowserWindow({
    width:        1440,
    height:       900,
    minWidth:     1280,
    minHeight:    800,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#f7f7f5',
    show: false,   // jangan show dulu sebelum ready-to-show
    webPreferences: {
      preload:          path.join(__dirname, '../../preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
      webSecurity:      true,
    },
  })

  // Show saat sudah siap (cegah white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    logger.info('Window ready to show')
  })

  // Load renderer
  await mainWindow.loadFile(
    path.join(__dirname, '../renderer/index.html')
  )

  // Register semua IPC handlers
  const { registerAllHandlers } = require('./ipc-handlers')
  registerAllHandlers(mainWindow)

  // Start device polling
  const deviceManager = require('../core/device-manager')
  await deviceManager.init()

  // Forward device events ke renderer
  deviceManager.on('devices-updated', (devices) => {
    mainWindow?.webContents?.send('device:update', devices)
  })

  // DevTools hanya di development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Intercept external links → open di browser
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