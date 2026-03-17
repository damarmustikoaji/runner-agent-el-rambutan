/* router.js — page navigation + app bootstrap */
;(function() {
  'use strict'

  const PAGES = {
    setup:        { title: 'First-time Setup',   fn: () => window.PageSetup?.render() },
    dashboard:    { title: 'Dashboard',          fn: () => window.PageDashboard?.render() },
    inspector:    { title: 'Inspector & Editor', fn: () => window.PageInspector?.render() },
    projects:     { title: 'Projects',           fn: () => window.PageProjects?.render() },
    testrun:      { title: 'Test Run',    fn: () => window.PageTestRun?.render() },
    reports:      { title: 'Reports & History',  fn: () => window.PageReports?.render() },
    environments: { title: 'Environments',       fn: () => window.PageEnvironments?.render() },
    settings:     { title: 'Settings',           fn: () => window.PageSettings?.render() },
  }

  // ── Navigate ───────────────────────────────────────────────
  window.navigate = function(page, options = {}) {
    if (!PAGES[page]) { console.warn('[router] unknown page:', page); return }

    // Stop device poll saat meninggalkan setup
    if (AppState.currentPage === 'setup' && page !== 'setup') {
      AppState.emit('page-leaving-setup')
    }

    // Cleanup inspector ResizeObserver
    if (AppState.currentPage === 'inspector' && page !== 'inspector') {
      if (window._inspectorRO) { window._inspectorRO.disconnect(); window._inspectorRO = null }
    }

    AppState.currentPage = page

    // Update sidebar active state
    document.querySelectorAll('.nb').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page)
    })

    // Update breadcrumb
    const bc = document.getElementById('breadcrumb')
    if (bc) bc.innerHTML = '<b>' + PAGES[page].title + '</b>'

    // Clear topbar actions
    const ta = document.getElementById('topbar-actions')
    if (ta) ta.innerHTML = ''

    // Set content area class
    const ca = document.getElementById('content-area')
    if (ca) {
      ca.className = 'content-area'
      if (options.noPad) ca.classList.add('no-pad')
    }

    // Render page
    try {
      const result = PAGES[page].fn()
      if (result && typeof result.catch === 'function') {
        result.catch(err => {
          console.error('[router] async render error:', err)
        })
      }
    } catch (err) {
      console.error('[router] render error:', err)
      const area = document.getElementById('content-area')
      if (area) area.innerHTML =
        '<div class="empty-s"><div class="ei"><i class="bi bi-exclamation-triangle"></i></div>' +
        '<h3>Terjadi Kesalahan</h3><p>' + esc(err.message) + '</p></div>'
    }
  }

  // ── Sidebar hamburger ──────────────────────────────────────
  document.getElementById('hamburger')?.addEventListener('click', function() {
    const sb = document.getElementById('sidebar')
    sb?.classList.toggle('collapsed')
  })

  // ── Sidebar nav clicks ─────────────────────────────────────
  document.getElementById('sidebar-nav')?.addEventListener('click', function(e) {
    const btn = e.target.closest('.nb')
    if (!btn || !btn.dataset.page) return
    navigate(btn.dataset.page)
  })

  // ── Active env pill ────────────────────────────────────────
  document.getElementById('active-env-pill')?.addEventListener('click', function() {
    navigate('environments')
  })
  AppState.on('env-changed', function(env) {
    const nameEl = document.getElementById('env-name')
    if (nameEl) nameEl.textContent = env ? env.name || 'Tidak ada' : 'Default'
  })

  // ── Device update dari main process ───────────────────────
  window.api.device.onUpdate(function(devices) {
    AppState.devices = devices
    AppState.emit('devices-updated', devices)
    const online = devices.filter(function(d) { return d.online }).length
    console.log('[router] devices updated: ' + online + '/' + devices.length + ' online')
  })

  // ── Bootstrap ──────────────────────────────────────────────
  async function bootstrap() {
    console.log('[router] bootstrapping...')

    // Retry helper — IPC handler mungkin belum siap saat renderer pertama load
    async function ipcWithRetry(fn, retries, delayMs) {
      retries  = retries  || 3
      delayMs  = delayMs  || 300
      for (let i = 0; i < retries; i++) {
        try {
          return await fn()
        } catch (err) {
          const isNotReady = err.message && err.message.includes('No handler')
          if (i < retries - 1 && isNotReady) {
            console.warn('[router] IPC not ready, retry ' + (i + 1) + '/' + retries + '...')
            await new Promise(function(r) { setTimeout(r, delayMs) })
          } else {
            throw err
          }
        }
      }
    }

    // Load environments
    try {
      const envs   = await ipcWithRetry(function() { return window.api.db.getEnvs() })
      const active = (envs || []).find(function(e) { return e.is_active }) || (envs || [])[0]
      if (active) AppState.setActiveEnv(active)
    } catch (err) {
      console.warn('[router] failed to load envs:', err.message)
    }

    // Env pill fallback
    const envName = document.getElementById('env-name')
    if (envName && !AppState.activeEnv) envName.textContent = 'Default'

    // Load projects count for badge
    try {
      const projects = await ipcWithRetry(function() { return window.api.db.getProjects() })
      AppState.cache.projects = projects || []
      const badge = document.getElementById('badge-projects')
      if (badge) badge.textContent = (projects || []).length
    } catch (err) {
      console.warn('[router] failed to load projects:', err.message)
    }

    // Check setup_done setting
    let setupDone = null
    try {
      setupDone = await ipcWithRetry(function() { return window.api.db.getSetting('setup_done') })
    } catch (err) {
      console.warn('[router] getSetting failed:', err.message)
    }

    // Check deps
    let allReady = false
    try {
      const deps = await ipcWithRetry(function() { return window.api.setup.checkDeps() })
      allReady = !!(deps && deps.adb && deps.adb.ok && deps.java && deps.java.ok && deps.maestro && deps.maestro.ok)
      console.log('[router] deps:', JSON.stringify(deps))
    } catch (err) {
      console.warn('[router] dep check failed:', err.message)
    }

    if (!setupDone || !allReady) {
      navigate('setup')
    } else {
      navigate('dashboard')
    }
  }

  // Wait for DOM then bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap)
  } else {
    bootstrap()
  }

  console.log('[router] loaded')
})()