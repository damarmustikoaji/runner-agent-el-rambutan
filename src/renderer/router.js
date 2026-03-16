/* router.js — page navigation + app bootstrap */
;(function() {
  'use strict'

  const PAGES = {
    setup:        { title: 'First-time Setup',   fn: () => window.PageSetup?.render() },
    dashboard:    { title: 'Dashboard',          fn: () => window.PageDashboard?.render() },
    inspector:    { title: 'Inspector & Editor', fn: () => window.PageInspector?.render() },
    projects:     { title: 'Projects',           fn: () => window.PageProjects?.render() },
    testrun:      { title: 'Test Run / Plan',    fn: () => window.PageTestRun?.render() },
    reports:      { title: 'Reports & History',  fn: () => window.PageReports?.render() },
    environments: { title: 'Environments',       fn: () => window.PageEnvironments?.render() },
    settings:     { title: 'Settings',           fn: () => window.PageSettings?.render() },
  }

  // ── Navigate ───────────────────────────────────────────────
  window.navigate = function(page, options = {}) {
    if (!PAGES[page]) { console.warn('[router] unknown page:', page); return }

    AppState.currentPage = page

    // Update sidebar active state
    document.querySelectorAll('.nb').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page)
    })

    // Update breadcrumb
    const bc = document.getElementById('breadcrumb')
    if (bc) bc.innerHTML = `<b>${PAGES[page].title}</b>`

    // Clear topbar actions
    const ta = document.getElementById('topbar-actions')
    if (ta) ta.innerHTML = ''

    // Set content area padding
    const ca = document.getElementById('content-area')
    if (ca) {
      ca.className = 'content-area'
      if (options.noPad) ca.classList.add('no-pad')
    }

    // Render page
    try {
      PAGES[page].fn()
    } catch (err) {
      console.error('[router] render error:', err)
      const ca = document.getElementById('content-area')
      if (ca) ca.innerHTML = `<div class="empty-s"><div class="ei"><i class="bi bi-exclamation-triangle"></i></div><h3>Terjadi Kesalahan</h3><p>${esc(err.message)}</p></div>`
    }
  }

  // ── Sidebar hamburger ──────────────────────────────────────
  document.getElementById('hamburger')?.addEventListener('click', () => {
    const sb = document.getElementById('sidebar')
    sb?.classList.toggle('collapsed')
  })

  // ── Sidebar nav clicks ─────────────────────────────────────
  document.getElementById('sidebar-nav')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.nb')
    if (!btn || !btn.dataset.page) return
    navigate(btn.dataset.page)
  })

  // ── Active env pill ────────────────────────────────────────
  document.getElementById('active-env-pill')?.addEventListener('click', () => navigate('environments'))
  AppState.on('env-changed', (env) => {
    const nameEl = document.getElementById('env-name')
    if (nameEl) nameEl.textContent = env?.name || 'Tidak ada'
  })

  // ── Device update from main process ───────────────────────
  window.api.device.onUpdate((devices) => {
    AppState.devices = devices
    AppState.emit('devices-updated', devices)
    // Update jumlah device online di status bar jika perlu
    const online = devices.filter(d => d.online).length
    console.log(`[router] devices updated: ${online}/${devices.length} online`)
  })

  // ── Bootstrap ──────────────────────────────────────────────
  async function bootstrap() {
    console.log('[router] bootstrapping...')

    // Load environments
    try {
      const envs = await window.api.db.getEnvs()
      const active = envs.find(e => e.is_active) || envs[0]
      if (active) {
        AppState.setActiveEnv(active)
      }
    } catch (err) {
      console.warn('[router] failed to load envs:', err)
    }

    // Load projects count for badge
    try {
      const projects = await window.api.db.getProjects()
      AppState.cache.projects = projects
      const badge = document.getElementById('badge-projects')
      if (badge) badge.textContent = projects.length
    } catch (err) {
      console.warn('[router] failed to load projects:', err)
    }

    // Check if first-run (no setup done)
    const setupDone = await window.api.db.getSetting('setup_done').catch(() => null)

    // Check deps
    let allReady = false
    try {
      const deps = await window.api.setup.checkDeps()
      allReady = deps.adb?.ok && deps.java?.ok && deps.maestro?.ok
    } catch (err) {
      console.warn('[router] dep check failed:', err)
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