/**
 * bridge.js — Renderer-side API wrapper
 *
 * Wraps window.testpilot (exposed by preload.js) dengan:
 * - Error normalization (__error pattern dari IPC)
 * - Fallback untuk development di browser biasa
 * - Convenience methods
 *
 * Semua page scripts menggunakan window.api.xxx
 */
;(function() {
  'use strict'

  const tp = window.testpilot

  if (!tp) {
    console.warn('[bridge] window.testpilot not available — running outside Electron?')
  }

  // Normalize IPC response — IPC handler return {__error, message} untuk errors
  function checkError(result) {
    if (result && result.__error) {
      throw new Error(result.message || 'Unknown IPC error')
    }
    return result
  }

  // Wrap async IPC call dengan error check
  function ipc(fn) {
    return async (...args) => {
      if (!tp) return null
      const result = await fn(...args)
      return checkError(result)
    }
  }

  // Noop fallback
  const noop     = async () => null
  const noopArr  = async () => []

  window.api = {
    // ── Setup
    setup: {
      checkDeps:   tp ? ipc(tp.setup.checkDeps)  : noop,
      install:     tp ? ipc(tp.setup.install)     : noop,
      fixMaestro:  tp ? ipc(tp.setup.fixMaestro)  : noop,
      onProgress:  tp ? (cb) => tp.setup.onProgress(cb) : (cb) => {},
    },

    // ── Device
    device: {
      list:         tp ? ipc(tp.device.list)         : noopArr,
      connect:      tp ? ipc(tp.device.connect)      : noop,
      disconnect:   tp ? ipc(tp.device.disconnect)   : noop,
      getConnected: tp ? ipc(tp.device.getConnected) : noop,
      onUpdate:     tp ? (cb) => tp.device.onUpdate(cb) : (cb) => {},
    },

    // ── Inspector
    inspector: {
      screenshot:   tp ? ipc(tp.inspector.screenshot)   : noop,
      dumpXml:      tp ? ipc(tp.inspector.dumpXml)      : noop,
      tap:          tp ? ipc(tp.inspector.tap)          : noop,
      launchApp:    tp ? ipc(tp.inspector.launchApp)    : noop,
      listPackages: tp ? ipc(tp.inspector.listPackages) : noopArr,
      installApk:   tp ? ipc(tp.inspector.installApk)  : noop,
      getScreenSize:tp ? ipc(tp.inspector.getScreenSize): noop,
      getActiveApp: tp ? ipc(tp.inspector.getActiveApp) : noop,
      getActivities:tp ? ipc(tp.inspector.getActivities): noopArr,
    },

    // ── Runner
    runner: {
      run:             tp ? ipc(tp.runner.run)           : noop,
      stop:            tp ? ipc(tp.runner.stop)          : noop,
      getStatus:       tp ? ipc(tp.runner.getStatus)     : noop,
      onLog:           tp ? (cb) => tp.runner.onLog(cb)  : (cb) => {},
      onStepUpdate:    tp ? (cb) => tp.runner.onStepUpdate(cb) : (cb) => {},
      onFinish:        tp ? (cb) => tp.runner.onFinish(cb) : (cb) => {},
      removeListeners: tp ? () => tp.runner.removeListeners() : () => {},
    },

    // ── DSL
    dsl: {
      save:         tp ? ipc(tp.dsl.save)         : noop,
      load:         tp ? ipc(tp.dsl.load)         : noop,
      exportDialog: tp ? ipc(tp.dsl.exportDialog) : noop,
    },

    // ── DB
    db: {
      getProjects:     tp ? ipc(tp.db.getProjects)     : noopArr,
      saveProject:     tp ? ipc(tp.db.saveProject)     : noop,
      deleteProject:   tp ? ipc(tp.db.deleteProject)   : noop,
      getSuites:       tp ? ipc(tp.db.getSuites)       : noopArr,
      saveSuite:       tp ? ipc(tp.db.saveSuite)       : noop,
      deleteSuite:     tp ? ipc(tp.db.deleteSuite)     : noop,
      getSections:     tp ? ipc(tp.db.getSections)     : noopArr,
      saveSection:     tp ? ipc(tp.db.saveSection)     : noop,
      getTestCases:    tp ? ipc(tp.db.getTestCases)    : noopArr,
      saveTestCase:    tp ? ipc(tp.db.saveTestCase)    : noop,
      deleteTestCase:  tp ? ipc(tp.db.deleteTestCase)  : noop,
      saveRun:         tp ? ipc(tp.db.saveRun)         : noop,
      getRuns:         tp ? ipc(tp.db.getRuns)         : noopArr,
      getEnvs:         tp ? ipc(tp.db.getEnvs)         : noopArr,
      saveEnv:         tp ? ipc(tp.db.saveEnv)         : noop,
      deleteEnv:       tp ? ipc(tp.db.deleteEnv)       : noop,
      getSetting:      tp ? ipc(tp.db.getSetting)      : noop,
      setSetting:      tp ? ipc(tp.db.setSetting)      : noop,
    },

    // ── System
    system: {
      openFileDialog: tp ? ipc(tp.system.openFileDialog) : noop,
      getAppVersion:  tp ? ipc(tp.system.getAppVersion)  : async () => '1.0.0-dev',
      openExternal:   tp ? ipc(tp.system.openExternal)   : noop,
      getDataPath:    tp ? ipc(tp.system.getDataPath)    : async () => '~/.testpilot',
    },
  }

  console.log('[bridge] API ready. Electron:', !!tp)
})()