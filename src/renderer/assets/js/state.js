/**
 * state.js — Global app state (vanilla JS, no framework)
 *
 * Simple reactive state dengan subscriber pattern.
 * Semua halaman membaca state dari sini.
 */
;(function() {
  'use strict'

  window.AppState = {
    // ── Runtime state
    devices:        [],
    connectedDevice: null,   // { serial, model, androidVersion, screenWidth, screenHeight, ... }
    activeEnv:       null,   // environment object dari DB

    // ── Inspector state
    inspector: {
      screenshotB64: null,     // base64 PNG
      elements:      [],       // parsed element tree
      xmlRaw:        '',       // raw XML string
      selectedEl:    null,     // element yang dipilih
      screenW:       1080,
      screenH:       1920,
      isLoading:     false,
      pkg:           '',       // package name aktif
      activity:      '',       // activity aktif
      activities:    [],       // daftar activity dari package
      orient:        'portrait',
      noReset:       false,
    },

    // ── Runner state
    runner: {
      isRunning:  false,
      runId:      null,
      logs:       [],
      stepStatus: {},   // { stepIndex: 'pass'|'fail'|'running' }
    },

    // ── Navigation
    currentPage: 'setup',

    // ── DB cache (untuk reduce IPC calls)
    cache: {
      projects:   null,
      activeProj: null,
    },

    // ── Subscribers
    _subs: {},

    on(event, cb) {
      if (!this._subs[event]) this._subs[event] = []
      this._subs[event].push(cb)
      return () => this.off(event, cb)  // return unsubscribe fn
    },

    off(event, cb) {
      if (!this._subs[event]) return
      this._subs[event] = this._subs[event].filter(fn => fn !== cb)
    },

    emit(event, data) {
      ;(this._subs[event] || []).forEach(cb => {
        try { cb(data) } catch (e) { console.error(`[state] subscriber error [${event}]:`, e) }
      })
    },

    // Helpers
    setConnectedDevice(dev) {
      this.connectedDevice = dev
      this.emit('device-changed', dev)
    },

    setActiveEnv(env) {
      this.activeEnv = env
      this.emit('env-changed', env)
    },

    addRunnerLog(entry) {
      this.runner.logs.push(entry)
      if (this.runner.logs.length > 500) this.runner.logs.shift()
      this.emit('runner-log', entry)
    },

    clearRunnerLogs() {
      this.runner.logs = []
      this.runner.stepStatus = {}
    },
  }
})()