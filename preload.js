/**
 * preload.js — Security Bridge
 *
 * Satu-satunya cara renderer berkomunikasi dengan Main Process.
 * contextIsolation: true → renderer tidak bisa akses Node.js langsung.
 * Semua API di-expose secara eksplisit lewat contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('testpilot', {

  // ── Setup Wizard ──────────────────────────────────────────
  setup: {
    checkDeps:      ()         => ipcRenderer.invoke('setup:checkDeps'),
    install:        (step)     => ipcRenderer.invoke('setup:install', step),
    fixMaestro:     ()         => ipcRenderer.invoke('setup:fixMaestro'),
    onProgress:     (cb)       => ipcRenderer.on('setup:progress', (_, d) => cb(d)),
  },

  // ── Device Management ─────────────────────────────────────
  device: {
    list:           ()         => ipcRenderer.invoke('device:list'),
    connect:        (serial)   => ipcRenderer.invoke('device:connect', serial),
    disconnect:     ()         => ipcRenderer.invoke('device:disconnect'),
    getConnected:   ()         => ipcRenderer.invoke('device:getConnected'),
    onUpdate:       (cb)       => ipcRenderer.on('device:update', (_, d) => cb(d)),
  },

  // ── Inspector ─────────────────────────────────────────────
  inspector: {
    // Screenshot dari device
    screenshot:     (serial)   => ipcRenderer.invoke('inspector:screenshot', serial),
    // Dump UI XML hierarchy
    dumpXml:        (serial)   => ipcRenderer.invoke('inspector:dumpXml', serial),
    // Tap elemen di koordinat tertentu
    tap:            (serial, x, y) => ipcRenderer.invoke('inspector:tap', serial, x, y),
    // Launch app di device
    launchApp:      (serial, pkg)  => ipcRenderer.invoke('inspector:launchApp', serial, pkg),
    // List packages yang terinstall
    listPackages:   (serial)   => ipcRenderer.invoke('inspector:listPackages', serial),
    // Upload & install APK
    installApk:     (serial, apkPath) => ipcRenderer.invoke('inspector:installApk', serial, apkPath),
    // Get screen dimensions
    getScreenSize:  (serial)   => ipcRenderer.invoke('inspector:getScreenSize', serial),
    // Detect foreground app package + activity
    getActiveApp:   (serial)   => ipcRenderer.invoke('inspector:getActiveApp', serial),
    // Get activities list dari package
    getActivities:  (serial, pkg) => ipcRenderer.invoke('inspector:getActivities', serial, pkg),
  },

  // ── Test Runner ───────────────────────────────────────────
  runner: {
    // Jalankan 1 test case (YAML DSL path)
    run:            (config)   => ipcRenderer.invoke('runner:run', config),
    stop:           ()         => ipcRenderer.invoke('runner:stop'),
    getStatus:      ()         => ipcRenderer.invoke('runner:status'),
    // Streaming log dari runner
    onLog:          (cb)       => ipcRenderer.on('runner:log', (_, d) => cb(d)),
    onStepUpdate:   (cb)       => ipcRenderer.on('runner:stepUpdate', (_, d) => cb(d)),
    onFinish:       (cb)       => ipcRenderer.on('runner:finish', (_, d) => cb(d)),
    removeListeners: ()        => {
      ipcRenderer.removeAllListeners('runner:log')
      ipcRenderer.removeAllListeners('runner:stepUpdate')
      ipcRenderer.removeAllListeners('runner:finish')
    },
  },

  // ── DSL / File ────────────────────────────────────────────
  dsl: {
    save:           (yamlStr, filePath) => ipcRenderer.invoke('dsl:save', yamlStr, filePath),
    load:           (filePath) => ipcRenderer.invoke('dsl:load', filePath),
    exportDialog:   (yamlStr) => ipcRenderer.invoke('dsl:exportDialog', yamlStr),
  },

  // ── Database (Projects, Suites, Test Cases) ───────────────
  db: {
    // Projects
    getProjects:        ()           => ipcRenderer.invoke('db:projects:getAll'),
    saveProject:        (project)    => ipcRenderer.invoke('db:projects:save', project),
    deleteProject:      (id)         => ipcRenderer.invoke('db:projects:delete', id),

    // Suites
    getSuites:          (projectId)  => ipcRenderer.invoke('db:suites:getByProject', projectId),
    saveSuite:          (suite)      => ipcRenderer.invoke('db:suites:save', suite),
    deleteSuite:        (id)         => ipcRenderer.invoke('db:suites:delete', id),

    // Sections
    getSections:        (suiteId)    => ipcRenderer.invoke('db:sections:getBySuite', suiteId),
    saveSection:        (section)    => ipcRenderer.invoke('db:sections:save', section),

    // Test Cases
    getTestCases:       (sectionId)  => ipcRenderer.invoke('db:testcases:getBySection', sectionId),
    saveTestCase:       (tc)         => ipcRenderer.invoke('db:testcases:save', tc),
    deleteTestCase:     (id)         => ipcRenderer.invoke('db:testcases:delete', id),

    // Test Runs
    saveRun:            (run)        => ipcRenderer.invoke('db:runs:save', run),
    getRuns:            (projectId)  => ipcRenderer.invoke('db:runs:getByProject', projectId),

    // Environments
    getEnvs:            ()           => ipcRenderer.invoke('db:envs:getAll'),
    saveEnv:            (env)        => ipcRenderer.invoke('db:envs:save', env),
    deleteEnv:          (id)         => ipcRenderer.invoke('db:envs:delete', id),

    // Settings
    getSetting:         (key)        => ipcRenderer.invoke('db:settings:get', key),
    setSetting:         (key, value) => ipcRenderer.invoke('db:settings:set', key, value),
  },

  // ── System / File Dialog ──────────────────────────────────
  system: {
    openFileDialog:  (opts) => ipcRenderer.invoke('system:openFileDialog', opts),
    getAppVersion:   ()     => ipcRenderer.invoke('system:getAppVersion'),
    openExternal:    (url)  => ipcRenderer.invoke('system:openExternal', url),
    getDataPath:     ()     => ipcRenderer.invoke('system:getDataPath'),
  },

})