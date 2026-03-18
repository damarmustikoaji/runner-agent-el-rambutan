/**
 * src/main/ipc-handlers.js
 *
 * Semua ipcMain.handle() terpusat di sini.
 * Pattern: thin handler → delegasi ke core/store modules.
 * Handler hanya routing + error wrapping.
 */
const { ipcMain, app, shell, dialog } = require('electron')
const path   = require('path')
const fs     = require('fs')
const logger = require('../utils/logger')

// Lazy load untuk hindari circular dependency saat startup
const getDeviceManager  = () => require('../core/device-manager')
const getInspector      = () => require('../core/inspector')
const getRunner         = () => require('../core/test-runner')
const getSetupManager   = () => require('../core/setup-manager')
const db                = require('../store/database')

// ── Wrap helper ───────────────────────────────────────────────
// Semua handler di-wrap untuk consistent error handling
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args)
    } catch (err) {
      logger.error(`IPC error [${channel}]:`, { message: err.message, stack: err.stack })
      // Return error object ke renderer (tidak throw — electron akan re-throw di renderer)
      return { __error: true, message: err.message }
    }
  })
}

function registerAllHandlers(win) {
  logger.info('Registering IPC handlers...')

  // ── Setup ──────────────────────────────────────────────────
  handle('setup:checkDeps', async () => {
    const result = await getSetupManager().checkAll()
    // Log detail Maestro untuk debug
    const fs   = require('fs')
    const path = require('path')
    const os   = require('os')
    const binDir = path.join(os.homedir(), '.testpilot', 'bin')
    if (fs.existsSync(binDir)) {
      const { spawnAsync } = require('../utils/process-utils')
      const { stdout } = await spawnAsync('find', [binDir, '-type', 'f'], { timeout: 3000 }).catch(() => ({ stdout: '' }))
      logger.info(`~/.testpilot/bin contents:\n${stdout}`)
    }
    return result
  })

  handle('setup:install', async (_, step) => {
    const sm = getSetupManager()
    const listener = (payload) => win.webContents.send('setup:progress', payload)
    sm.on('progress', listener)
    try {
      if (step === 'all')          await sm.installAll()
      else if (step === 'adb')     await sm.installAdb()
      else if (step === 'java')    await sm.installJava()
      else if (step === 'maestro') await sm.installMaestro()
      return { ok: true }
    } finally {
      sm.off('progress', listener)
    }
  })

  // Fix Maestro permission — panggil dari UI jika maestro ada tapi tidak executable
  handle('setup:fixMaestro', async () => {
    const fs   = require('fs')
    const path = require('path')
    const os   = require('os')
    const { spawnAsync } = require('../utils/process-utils')
    const binDir = path.join(os.homedir(), '.testpilot', 'bin')
    try {
      await spawnAsync('find', [binDir, '-type', 'f', '-exec', 'chmod', '+x', '{}', ';'], { timeout: 10000 })
      logger.info('Maestro permissions fixed')
      return { ok: true }
    } catch (err) {
      logger.error('fixMaestro failed:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // Install Maestro Android driver ke device (sekali per device)
  handle('setup:installDriver', async (_, serial) => {
    const logs = []
    try {
      const result = await getSetupManager().installMaestroDriver(serial, (msg) => {
        logs.push(msg)
        win.webContents.send('setup:driverProgress', { msg })
      })
      return { ok: result.ok, logs }
    } catch (err) {
      logger.error('installDriver failed:', err.message)
      return { ok: false, error: err.message, logs }
    }
  })

  // ── Device ─────────────────────────────────────────────────
  handle('device:list', async () => {
    return getDeviceManager().getDevices()
  })

  handle('device:connect', async (_, serial) => {
    return getDeviceManager().connect(serial)
  })

  handle('device:disconnect', async () => {
    return getDeviceManager().disconnect()
  })

  handle('device:getConnected', async () => {
    return getDeviceManager().getActive()
  })

  // ── Inspector ──────────────────────────────────────────────
  handle('inspector:screenshot', async (_, serial) => {
    // Cegah screenshot saat runner sedang aktif pada device yang sama
    const runner = getRunner()
    if (runner.isRunning()) {
      throw new Error('Tidak bisa screenshot saat test sedang berjalan. Tunggu test selesai.')
    }
    return getInspector().screenshot(serial)
  })

  handle('inspector:dumpXml', async (_, serial) => {
    const runner = getRunner()
    if (runner.isRunning()) {
      throw new Error('Tidak bisa dump XML saat test sedang berjalan.')
    }
    return getInspector().dumpXml(serial)
  })

  handle('inspector:tap', async (_, serial, x, y) => {
    return getInspector().tap(serial, x, y)
  })

  handle('inspector:launchApp', async (_, serial, pkg) => {
    return getDeviceManager().launchApp(serial, pkg)
  })

  handle('inspector:listPackages', async (_, serial) => {
    return getDeviceManager().listPackages(serial)
  })

  handle('inspector:installApk', async (_, serial, apkPath) => {
    return getDeviceManager().installApk(serial, apkPath)
  })

  handle('inspector:getScreenSize', async (_, serial) => {
    return getInspector().getScreenSize(serial)
  })

  handle('inspector:getActiveApp', async (_, serial) => {
    return getDeviceManager().getActiveApp(serial)
  })

  handle('inspector:getActivities', async (_, serial, packageName) => {
    return getDeviceManager().getActivities(serial, packageName)
  })

  // ── Runner ─────────────────────────────────────────────────
  handle('runner:run', async (_, config) => {
    const runner = getRunner()

    // Forward runner events ke renderer
    const onLog = (d)        => win.webContents.send('runner:log', d)
    const onStep = (d)       => win.webContents.send('runner:stepUpdate', d)
    const onFinish = (d)     => win.webContents.send('runner:finish', d)

    runner.on('runner:log',        onLog)
    runner.on('runner:stepUpdate', onStep)
    runner.on('runner:finish',     onFinish)

    try {
      const result = await runner.run(config)
      return result
    } finally {
      runner.off('runner:log',        onLog)
      runner.off('runner:stepUpdate', onStep)
      runner.off('runner:finish',     onFinish)
    }
  })

  handle('runner:stop', async () => {
    getRunner().stop()
    return { ok: true }
  })

  handle('runner:status', async () => {
    return getRunner().getStatus()
  })

  // ── DSL ────────────────────────────────────────────────────
  handle('dsl:save', async (_, yamlStr, filePath) => {
    fs.writeFileSync(filePath, yamlStr, 'utf8')
    return { ok: true, path: filePath }
  })

  handle('dsl:load', async (_, filePath) => {
    return fs.readFileSync(filePath, 'utf8')
  })

  handle('dsl:exportDialog', async (_, yamlStr) => {
    const { filePath } = await dialog.showSaveDialog(win, {
      title:       'Export DSL YAML',
      defaultPath: 'testcase.yaml',
      filters:     [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
    })
    if (!filePath) return { ok: false, cancelled: true }
    fs.writeFileSync(filePath, yamlStr, 'utf8')
    return { ok: true, path: filePath }
  })

  // ── Database: Projects ─────────────────────────────────────
  handle('db:projects:getAll',    async () => db.Projects.getAll())
  handle('db:projects:save',      async (_, p) => db.Projects.save(p))
  handle('db:projects:delete',    async (_, id) => db.Projects.delete(id))

  // ── Database: Suites ───────────────────────────────────────
  handle('db:suites:getByProject', async (_, pid) => db.Suites.getByProject(pid))
  handle('db:suites:save',         async (_, s)   => db.Suites.save(s))
  handle('db:suites:delete',       async (_, id)  => db.Suites.delete(id))

  // ── Database: Sections ─────────────────────────────────────
  handle('db:sections:getBySuite', async (_, sid) => db.Sections.getBySuite(sid))
  handle('db:sections:save',       async (_, s)   => db.Sections.save(s))

  // ── Database: Test Cases ───────────────────────────────────
  handle('db:testcases:getById',       async (_, id)  => db.TestCases.getById(id))
  handle('db:testcases:getBySection', async (_, sid) => db.TestCases.getBySection(sid))
  handle('db:testcases:getBySuite',   async (_, sid) => db.TestCases.getBySuite(sid))
  handle('db:testcases:save',         async (_, tc)  => db.TestCases.save(tc))
  handle('db:testcases:delete',       async (_, id)  => db.TestCases.delete(id))

  // ── Database: Runs ─────────────────────────────────────────
  handle('db:runs:save',         async (_, r)   => db.TestRuns.save(r))
  handle('db:runs:getAll',        async ()       => db.TestRuns.getAll())
  handle('db:runs:getByProject', async (_, pid) => db.TestRuns.getByProject(pid))
  handle('db:runs:getById',      async (_, id)  => db.TestRuns.getById(id))
  handle('db:runs:delete',       async (_, id)  => db.TestRuns.delete(id))
  handle('db:tcresults:save',    async (_, r)   => db.TestRuns.saveTcResult(r))
  handle('db:tcresults:getByRun',async (_, rid) => db.TestRuns.getTcResults(rid))

  // ── Database: Environments ─────────────────────────────────
  handle('db:envs:getAll',  async ()         => db.Environments.getAll())
  handle('db:envs:save',    async (_, env)   => db.Environments.save(env))
  handle('db:envs:delete',  async (_, id)    => db.Environments.delete(id))

  // ── Database: Settings ─────────────────────────────────────
  handle('db:settings:get', async (_, key)        => db.Settings.get(key))
  handle('db:settings:set', async (_, key, value) => db.Settings.set(key, value))

  // ── System ─────────────────────────────────────────────────
  handle('system:openFileDialog', async (_, opts) => {
    return dialog.showOpenDialog(win, {
      properties: opts?.properties || ['openFile'],
      filters:    opts?.filters    || [{ name: 'All Files', extensions: ['*'] }],
      ...opts,
    })
  })

  handle('system:getAppVersion', async () => app.getVersion())

  handle('system:openExternal', async (_, url) => shell.openExternal(url))

  handle('system:getDataPath', async () => app.getPath('userData'))

  logger.info(`${ipcMain.eventNames().length} IPC handlers registered`)
}

module.exports = { registerAllHandlers }