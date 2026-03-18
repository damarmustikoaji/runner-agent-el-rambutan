/**
 * bridge.js — Renderer-side API wrapper
 *
 * PENTING: tp.inspector.tap dll adalah functions dari preload contextBridge.
 * Mereka TIDAK butuh 'this' context karena contextBridge expose plain functions,
 * tapi kita tetap pastikan dengan arrow wrapper eksplisit per method.
 */
;(function() {
  'use strict'

  const tp = window.testpilot

  if (!tp) {
    console.warn('[bridge] window.testpilot not available — running outside Electron?')
  }

  // Normalize IPC response
  function checkError(result) {
    if (result && result.__error) {
      throw new Error(result.message || 'Unknown IPC error')
    }
    return result
  }

  // Wrap dengan error check — gunakan arrow wrapper agar args diteruskan dengan benar
  function w(fn) {
    return async function() {
      if (!tp) return null
      const result = await fn.apply(null, arguments)
      return checkError(result)
    }
  }

  const noop    = async function() { return null }
  const noopArr = async function() { return []   }

  window.api = {
    // ── Setup
    setup: {
      checkDeps:       tp ? w(function()    { return tp.setup.checkDeps() })       : noop,
      install:         tp ? w(function(s)   { return tp.setup.install(s) })        : noop,
      fixMaestro:      tp ? w(function()    { return tp.setup.fixMaestro() })      : noop,
      installDriver:   tp ? w(function(s)   { return tp.setup.installDriver(s) })  : noop,
      onProgress:      tp ? function(cb)    { return tp.setup.onProgress(cb) }     : function() {},
      onDriverProgress:tp ? function(cb)    { return tp.setup.onDriverProgress(cb) } : function() {},
    },

    // ── Device
    device: {
      list:         tp ? w(function()   { return tp.device.list() })           : noopArr,
      connect:      tp ? w(function(s)  { return tp.device.connect(s) })       : noop,
      disconnect:   tp ? w(function()   { return tp.device.disconnect() })     : noop,
      getConnected: tp ? w(function()   { return tp.device.getConnected() })   : noop,
      onUpdate:     tp ? function(cb)   { return tp.device.onUpdate(cb) }      : function() {},
    },

    // ── Inspector
    inspector: {
      screenshot:    tp ? w(function(s)      { return tp.inspector.screenshot(s) })           : noop,
      dumpXml:       tp ? w(function(s)      { return tp.inspector.dumpXml(s) })              : noop,
      tap:           tp ? w(function(s,x,y)  { return tp.inspector.tap(s,x,y) })              : noop,
      launchApp:     tp ? w(function(s,p)    { return tp.inspector.launchApp(s,p) })          : noop,
      listPackages:  tp ? w(function(s)      { return tp.inspector.listPackages(s) })         : noopArr,
      installApk:    tp ? w(function(s,p)    { return tp.inspector.installApk(s,p) })         : noop,
      getScreenSize: tp ? w(function(s)      { return tp.inspector.getScreenSize(s) })        : noop,
      getActiveApp:  tp ? w(function(s)      { return tp.inspector.getActiveApp(s) })         : noop,
      getActivities: tp ? w(function(s,p)    { return tp.inspector.getActivities(s,p) })      : noopArr,
    },

    // ── Runner
    runner: {
      run:             tp ? w(function(c)  { return tp.runner.run(c) })        : noop,
      stop:            tp ? w(function()   { return tp.runner.stop() })        : noop,
      getStatus:       tp ? w(function()   { return tp.runner.getStatus() })   : noop,
      onLog:           tp ? function(cb)   { return tp.runner.onLog(cb) }      : function() {},
      onStepUpdate:    tp ? function(cb)   { return tp.runner.onStepUpdate(cb) } : function() {},
      onFinish:        tp ? function(cb)   { return tp.runner.onFinish(cb) }   : function() {},
      removeListeners: tp ? function()     { return tp.runner.removeListeners() } : function() {},
    },

    // ── DSL
    dsl: {
      save:         tp ? w(function(y,p)  { return tp.dsl.save(y,p) })        : noop,
      load:         tp ? w(function(p)    { return tp.dsl.load(p) })          : noop,
      exportDialog: tp ? w(function(y)    { return tp.dsl.exportDialog(y) })  : noop,
    },

    // ── DB
    db: {
      getProjects:     tp ? w(function()    { return tp.db.getProjects() })          : noopArr,
      saveProject:     tp ? w(function(p)   { return tp.db.saveProject(p) })         : noop,
      deleteProject:   tp ? w(function(id)  { return tp.db.deleteProject(id) })      : noop,
      getSuites:       tp ? w(function(id)  { return tp.db.getSuites(id) })          : noopArr,
      saveSuite:       tp ? w(function(s)   { return tp.db.saveSuite(s) })           : noop,
      deleteSuite:     tp ? w(function(id)  { return tp.db.deleteSuite(id) })        : noop,
      getSections:     tp ? w(function(id)  { return tp.db.getSections(id) })        : noopArr,
      saveSection:     tp ? w(function(s)   { return tp.db.saveSection(s) })         : noop,
      getTestCaseById:      tp ? w(function(id)  { return tp.db.getTestCaseById(id) })         : noop,
      getTestCases:         tp ? w(function(id)  { return tp.db.getTestCases(id) })           : noopArr,
      getTestCasesBySuite:  tp ? w(function(id)  { return tp.db.getTestCasesBySuite(id) })    : noopArr,
      saveTestCase:         tp ? w(function(tc)  { return tp.db.saveTestCase(tc) })           : noop,
      deleteTestCase:  tp ? w(function(id)  { return tp.db.deleteTestCase(id) })     : noop,
      saveRun:         tp ? w(function(r)   { return tp.db.saveRun(r) })             : noop,
      getAllRuns:       tp ? w(function()    { return tp.db.getAllRuns() })            : noopArr,
      getRuns:         tp ? w(function(id)  { return tp.db.getRuns(id) })            : noopArr,
      getRunById:      tp ? w(function(id)  { return tp.db.getRunById(id) })         : noop,
      deleteRun:       tp ? w(function(id)  { return tp.db.deleteRun(id) })          : noop,
      saveTcResult:    tp ? w(function(r)   { return tp.db.saveTcResult(r) })        : noop,
      getTcResults:    tp ? w(function(rid) { return tp.db.getTcResults(rid) })      : noopArr,
      getEnvs:         tp ? w(function()    { return tp.db.getEnvs() })              : noopArr,
      saveEnv:         tp ? w(function(e)   { return tp.db.saveEnv(e) })             : noop,
      deleteEnv:       tp ? w(function(id)  { return tp.db.deleteEnv(id) })          : noop,
      getSetting:      tp ? w(function(k)   { return tp.db.getSetting(k) })          : noop,
      setSetting:      tp ? w(function(k,v) { return tp.db.setSetting(k,v) })        : noop,
    },

    // ── System
    system: {
      openFileDialog: tp ? w(function(o)  { return tp.system.openFileDialog(o) })  : noop,
      getAppVersion:  tp ? w(function()   { return tp.system.getAppVersion() })     : async function() { return '1.0.0-dev' },
      openExternal:   tp ? w(function(u)  { return tp.system.openExternal(u) })     : noop,
      getDataPath:    tp ? w(function()   { return tp.system.getDataPath() })        : async function() { return '~/.testpilot' },
      getTestpilotDir:tp ? w(function()   { return tp.system.getTestpilotDir() })    : noop,
      clearData:      tp ? w(function(t)  { return tp.system.clearData(t) })         : noop,
    },
  }

  console.log('[bridge] API ready. Electron:', !!tp)
})()