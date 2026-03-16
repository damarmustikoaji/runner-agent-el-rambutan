/* pages/setup.js */
window.PageSetup = (() => {
  'use strict'

  const STEPS = [
    { key: 'adb',     title: 'ADB (Android Debug Bridge)', desc: 'Di-bundle di app, tinggal ekstrak ke ~/.testpilot/adb/' },
    { key: 'java',    title: 'Java Runtime (JRE 17)',       desc: 'Download Temurin OpenJDK headless ~80MB → ~/.testpilot/java/' },
    { key: 'maestro', title: 'Maestro CLI',                 desc: 'Download dari GitHub releases → ~/.testpilot/bin/' },
  ]

  let _depsStatus  = {}
  let _installing  = false
  let _setupDone   = false

  // ── Render ─────────────────────────────────────────────────
  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = `<button class="btn btn-p btn-sm" id="setup-start-btn" onclick="PageSetup.startInstall()">
      <i class="bi bi-lightning-charge-fill"></i> Mulai Setup Otomatis
    </button>`

    content.innerHTML = `
    <div style="max-width:560px;margin:0 auto;padding:10px 0">
      <div style="text-align:center;margin-bottom:22px">
        <div style="width:50px;height:50px;background:var(--accent);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;margin:0 auto 12px">
          <i class="bi bi-send-fill"></i>
        </div>
        <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:5px">Selamat Datang di TestPilot</div>
        <div class="sm muted" style="line-height:1.65">Klik <strong>Mulai Setup</strong> untuk menyiapkan semua dependensi secara otomatis.</div>
      </div>

      <div class="info-box mb12">
        <div class="ib-ic"><i class="bi bi-folder2"></i></div>
        <p>Semua file diinstall ke <code class="mono xs" style="background:rgba(59,126,237,.1);padding:1px 4px;border-radius:3px">~/.testpilot/</code>
        — tidak mengubah system PATH atau menginstall ke system directory.</p>
      </div>

      <div id="setup-steps" class="mb12">
        ${STEPS.map(s => renderStep(s, 'wait')).join('')}
      </div>

      <div id="setup-done-box" style="display:none">
        <div style="background:var(--green-bg);border:1px solid rgba(42,157,92,.25);border-radius:10px;padding:16px;text-align:center">
          <i class="bi bi-check-circle-fill" style="font-size:1.6rem;color:var(--green)"></i>
          <div class="fw7 mt6 mb4">Setup Selesai!</div>
          <div class="xs muted mb10">Semua dependensi siap. TestPilot bisa digunakan.</div>
          <button class="btn btn-g" onclick="PageSetup.finishSetup()">
            <i class="bi bi-arrow-right-circle-fill"></i> Mulai Gunakan TestPilot
          </button>
        </div>
      </div>

      <div class="divider"></div>
      <div class="slbl">Yang disiapkan manual (sekali saja)</div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:12px">
          <div class="flex g10 ic">
            <i class="bi bi-phone-fill" style="font-size:16px;flex-shrink:0;color:var(--text3)"></i>
            <div>
              <div class="fw6 sm mb4">USB Driver Android (per merk HP)</div>
              <div class="xs muted" style="line-height:1.65">
                Aktifkan <b>Developer Options</b> → <b>USB Debugging</b> di HP.
                <br>Driver: <span class="tag">Samsung</span> <span class="tag">Xiaomi</span>
                <span class="tag">Oppo/Realme</span> <span class="tag">Universal ADB Driver</span>
              </div>
            </div>
          </div>
          <div class="flex g10 ic">
            <i class="bi bi-usb-symbol" style="font-size:16px;flex-shrink:0;color:var(--text3)"></i>
            <div>
              <div class="fw6 sm mb4">macOS: izinkan akses ke device</div>
              <div class="xs muted" style="line-height:1.65">
                Saat pertama kali colok HP ke Mac, tap <b>"Allow"</b> di HP dan di dialog macOS.
                Jalankan <code class="mono" style="font-size:10px">adb devices</code> di terminal untuk verifikasi.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`

    // Auto-check deps
    await checkDeps()
  }

  function renderStep(step, status, pct = 0, msg = '') {
    const colors = { done: 'var(--green)', active: 'var(--blue)', error: 'var(--red)', wait: 'var(--text3)' }
    const icons  = { done: 'check-circle-fill', active: 'arrow-clockwise', error: 'x-circle-fill', wait: 'circle' }
    const bg     = { done: 'var(--green-bg)', active: 'var(--blue-bg)', error: 'var(--red-bg)', wait: 'var(--surface)' }
    const border = { done: 'rgba(42,157,92,.3)', active: 'rgba(59,126,237,.3)', error: 'rgba(220,38,38,.3)', wait: 'var(--border)' }
    const labels = { done: 'Selesai', active: msg || 'Installing...', error: 'Gagal', wait: 'Menunggu' }

    return `
    <div id="setup-step-${step.key}" style="
      display:flex;gap:10px;padding:11px 13px;border-radius:9px;
      border:1px solid ${border[status]};background:${bg[status]};
      margin-bottom:7px;transition:all .2s">
      <div style="width:30px;height:30px;border-radius:7px;background:var(--surface3);
                  display:flex;align-items:center;justify-content:center;
                  font-size:16px;color:${colors[status]};flex-shrink:0;
                  ${status==='active'?'animation:spin .8s linear infinite':''}">
        <i class="bi bi-${icons[status]}"></i>
      </div>
      <div style="flex:1">
        <div class="fw6 sm">${step.title}</div>
        <div class="xs muted">${step.desc}</div>
        ${status === 'active' ? `
          <div class="pbar mt6">
            <div class="pbar-fill" id="pbar-${step.key}" style="width:${pct}%"></div>
          </div>` : ''}
      </div>
      <div class="xs fw6" style="color:${colors[status]}">${labels[status]}</div>
    </div>`
  }

  function updateStep(key, status, pct = 0, msg = '') {
    const el = document.getElementById(`setup-step-${key}`)
    const step = STEPS.find(s => s.key === key)
    if (el && step) el.outerHTML = renderStep(step, status, pct, msg)
  }

  // ── Check deps ─────────────────────────────────────────────
  async function checkDeps() {
    try {
      _depsStatus = await window.api.setup.checkDeps()
      for (const [key, result] of Object.entries(_depsStatus)) {
        updateStep(key, result.ok ? 'done' : 'wait')
      }
      _setupDone = _depsStatus.adb?.ok && _depsStatus.java?.ok && _depsStatus.maestro?.ok
      if (_setupDone) {
        document.getElementById('setup-done-box').style.display = 'block'
        document.getElementById('setup-start-btn').style.display = 'none'
      }
    } catch (err) {
      console.warn('[setup] checkDeps error:', err)
    }
  }

  // ── Start install ──────────────────────────────────────────
  async function startInstall() {
    if (_installing) return
    _installing = true

    const btn = document.getElementById('setup-start-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise" style="animation:spin .8s linear infinite"></i> Berjalan...' }

    // Listen progress events dari main process
    window.api.setup.onProgress((payload) => {
      const { step, status, pct, msg } = payload
      if (status === 'start')    updateStep(step, 'active', 0, msg)
      else if (status === 'progress') {
        const pb = document.getElementById(`pbar-${step}`)
        if (pb) pb.style.width = pct + '%'
        // Update teks status
        const el = document.getElementById(`setup-step-${step}`)
        if (el) {
          const lbl = el.querySelector('[class*="fw6"]')
        }
      }
      else if (status === 'done')  updateStep(step, 'done', 100, msg)
      else if (status === 'error') updateStep(step, 'error', 0, msg)
      else if (status === 'all') {
        _setupDone = true
        document.getElementById('setup-done-box').style.display = 'block'
      }
    })

    try {
      await window.api.setup.install('all')
    } catch (err) {
      toast(`Setup gagal: ${err.message}`, 'error')
    } finally {
      _installing = false
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-lightning-charge-fill"></i> Coba Lagi' }
    }
  }

  async function finishSetup() {
    await window.api.db.setSetting('setup_done', true).catch(() => {})
    toast('✅ Setup selesai! Selamat menggunakan TestPilot.', 'success')
    navigate('dashboard')
  }

  return { render, startInstall, finishSetup }
})()