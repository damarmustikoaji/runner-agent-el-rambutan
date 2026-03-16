/* pages/setup.js */
window.PageSetup = (() => {
  'use strict'

  const STEPS = [
    { key: 'adb',     title: 'ADB (Android Debug Bridge)', desc: 'Di-bundle di app, tinggal ekstrak ke ~/.testpilot/adb/' },
    { key: 'java',    title: 'Java Runtime (JRE 17)',       desc: 'Download Temurin OpenJDK headless ~80MB → ~/.testpilot/java/' },
    { key: 'maestro', title: 'Maestro CLI',                 desc: 'Download dari GitHub releases → ~/.testpilot/bin/' },
  ]

  let _depsStatus = {}
  let _installing = false
  let _setupDone  = false
  let _devices    = []
  let _pollTimer  = null

  // ── Render ─────────────────────────────────────────────────
  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML = `
      <button class="btn btn-d btn-sm" onclick="PageSetup.scanDevices()">
        <i class="bi bi-arrow-clockwise"></i> Scan Device
      </button>
      <button class="btn btn-p btn-sm" id="setup-start-btn" onclick="PageSetup.startInstall()">
        <i class="bi bi-lightning-charge-fill"></i> Mulai Setup Otomatis
      </button>`

    content.innerHTML = `
    <div style="max-width:600px;margin:0 auto;padding:10px 0">

      <div style="text-align:center;margin-bottom:22px">
        <div style="width:50px;height:50px;background:var(--accent);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;margin:0 auto 12px">
          <i class="bi bi-send-fill"></i>
        </div>
        <div style="font-size:20px;font-weight:700;letter-spacing:-.02em;margin-bottom:5px">Selamat Datang di TestPilot</div>
        <div class="sm muted" style="line-height:1.65">Klik <strong>Mulai Setup</strong> untuk menyiapkan semua dependensi secara otomatis.</div>
      </div>

      <div class="info-box mb12">
        <div class="ib-ic"><i class="bi bi-folder2"></i></div>
        <p>Semua file diinstall ke <code class="mono xs" style="background:rgba(59,126,237,.1);padding:1px 4px;border-radius:3px">~/.testpilot/</code> — tidak mengubah system PATH atau menginstall ke system directory.</p>
      </div>

      <div id="setup-steps" class="mb12">
        ${STEPS.map(s => renderStep(s, 'wait')).join('')}
      </div>

      <div id="setup-done-box" style="display:none;margin-bottom:14px">
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

      <!-- Device section -->
      <div class="flex ic jb mb8">
        <div class="slbl" style="margin:0"><i class="bi bi-phone-fill" style="color:var(--blue);margin-right:4px"></i>Device Android Terdeteksi</div>
        <button class="btn btn-xs btn-d" onclick="PageSetup.scanDevices()"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
      </div>

      <div class="card mb14" style="padding:0;overflow:hidden">
        <div style="padding:9px 14px;background:var(--surface2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
          <div class="flex ic g6">
            <span id="device-count-badge" class="badge b-pend">Scanning...</span>
            <span class="xs muted">device terhubung ke laptop ini</span>
          </div>
          <span class="xs muted">Auto-refresh tiap 3 detik</span>
        </div>
        <div id="setup-device-list">
          <div style="text-align:center;padding:20px;color:var(--text3)">
            <i class="bi bi-arrow-clockwise" style="animation:spin .8s linear infinite;font-size:1.2rem"></i>
            <div class="xs mt6">Scanning...</div>
          </div>
        </div>
      </div>

      <!-- Manual steps -->
      <div class="slbl mb8">Yang disiapkan manual (sekali saja)</div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:0">

          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <i class="bi bi-phone-fill" style="font-size:15px;flex-shrink:0;color:var(--text3);margin-top:2px"></i>
            <div>
              <div class="fw6 sm mb4">Aktifkan USB Debugging di HP</div>
              <div class="xs muted" style="line-height:1.75">
                1. Masuk <b>Settings → About Phone</b> → ketuk <b>Build Number</b> 7 kali<br>
                2. Kembali ke Settings → masuk <b>Developer Options</b><br>
                3. Aktifkan <b>USB Debugging</b><br>
                4. Colok HP ke Mac via kabel USB → tap <b>Allow / Trust</b> di HP
              </div>
              <div class="flex g5 wrap mt8">
                ${[['Samsung','https://www.samsung.com/us/support/downloads/'],['Xiaomi','https://www.mi.com/global/service/support/'],['Oppo/Realme','https://www.oppo.com/en/support/'],['Universal ADB','https://adb.clockworkmod.com/']].map(([l,u])=>`
                  <span class="tag" style="cursor:pointer;border:1px solid var(--border2)"
                    onclick="window.api.system.openExternal('${u}')">
                    <i class="bi bi-box-arrow-up-right" style="font-size:9px"></i> ${l}
                  </span>`).join('')}
              </div>
            </div>
          </div>

          <div style="display:flex;gap:12px;padding:12px 0">
            <i class="bi bi-terminal" style="font-size:15px;flex-shrink:0;color:var(--text3);margin-top:2px"></i>
            <div style="width:100%">
              <div class="fw6 sm mb4">Verifikasi via terminal (opsional)</div>
              <div style="background:#0d1117;border-radius:7px;padding:10px 13px;font-family:'Courier New',monospace;font-size:10.5px;line-height:1.9;color:#e6edf3">
                <div><span style="color:#8b949e"># Cek device yang terhubung</span></div>
                <div><span style="color:#3fb950">~</span> adb devices</div>
                <div style="color:#8b949e">List of devices attached</div>
                <div><span style="color:#ffa657">R3CX20ABCDE</span>&nbsp;&nbsp;&nbsp;<span style="color:#3fb950">device</span>&nbsp;&nbsp;<span style="color:#8b949e">← "device" = OK</span></div>
                <div style="margin-top:4px"><span style="color:#8b949e"># Kalau "unauthorized" → tap Allow ulang di HP</span></div>
                <div><span style="color:#3fb950">~</span> adb kill-server && adb start-server</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>`

    await checkDeps()
    await scanDevices()
    startDevicePoll()

    window.api.device.onUpdate((devices) => {
      _devices = devices
      AppState.devices = devices
      refreshDeviceList()
    })
  }

  // ── Device rendering ───────────────────────────────────────
  function refreshDeviceList() {
    const el = document.getElementById('setup-device-list')
    if (!el) return
    el.innerHTML = renderDeviceList(_devices)
  }

  function renderDeviceList(devices) {
    const badge  = document.getElementById('device-count-badge')
    const online = (devices || []).filter(d => d.online || d.status === 'device')

    if (badge) {
      if (online.length > 0) {
        badge.className = 'badge b-pass'
        badge.textContent = `${online.length} device online`
      } else if (devices.length > 0) {
        badge.className = 'badge b-pend'
        badge.textContent = `${devices.length} device (perlu izin)`
      } else {
        badge.className = 'badge b-skip'
        badge.textContent = 'Tidak ada device'
      }
    }

    if (!devices || !devices.length) {
      return `
      <div style="padding:16px 14px;display:flex;gap:12px;align-items:center">
        <i class="bi bi-usb-symbol" style="font-size:1.6rem;color:var(--border2);flex-shrink:0"></i>
        <div>
          <div class="fw6 sm mb4" style="color:var(--text3)">Tidak ada device terdeteksi</div>
          <div class="xs muted" style="line-height:1.6">
            Pastikan HP sudah dicolok via USB dan USB Debugging aktif.
            <br>Klik <b>Refresh</b> setelah mencolok HP.
          </div>
        </div>
      </div>`
    }

    return `<div>${devices.map(d => {
      const isOnline = d.online || d.status === 'device'
      const isUnauth = d.status === 'unauthorized'
      const sc = isOnline ? 'var(--green)' : isUnauth ? 'var(--yellow)' : 'var(--text3)'
      const sb = isOnline ? 'var(--green-bg)' : isUnauth ? 'var(--yellow-bg)' : 'var(--surface2)'
      const si = isOnline ? 'check-circle-fill' : isUnauth ? 'shield-exclamation' : 'circle'
      const st = isOnline ? 'Online' : isUnauth ? 'Perlu izin' : 'Offline'
      const ti = d.type === 'emulator' ? 'display' : 'phone-fill'
      const tl = d.type === 'emulator' ? 'Emulator' : d.type === 'wireless' ? 'Wi-Fi' : 'USB'

      return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);transition:background .1s"
           onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">
        <div style="width:36px;height:36px;border-radius:8px;background:${isOnline?'var(--green-bg)':'var(--surface3)'};display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:15px;color:${isOnline?'var(--green)':'var(--text3)'}">
          <i class="bi bi-${ti}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div class="fw6 sm">${esc(d.model || d.serial)}</div>
          <div class="xs muted flex ic g5 mt2" style="flex-wrap:wrap">
            <span class="tag" style="font-size:9px">${tl}</span>
            <span class="mono">${esc(d.serial)}</span>
            ${d.androidVersion ? `<span>Android ${esc(d.androidVersion)}</span>` : d.os ? `<span>${esc(d.os)}</span>` : ''}
          </div>
          ${isUnauth ? `<div class="xs mt4" style="color:var(--yellow);line-height:1.5">⚠️ Buka HP → tap <b>Allow</b> pada dialog "Trust This Computer"</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;background:${sb};border:1px solid ${isOnline?'rgba(42,157,92,.25)':isUnauth?'rgba(196,125,14,.25)':'var(--border)'}">
            <i class="bi bi-${si}" style="font-size:10px;color:${sc}"></i>
            <span style="font-size:10px;font-weight:600;color:${sc}">${st}</span>
          </div>
          ${isOnline ? `<button class="btn btn-xs btn-g" onclick="PageSetup.useDevice('${esc(d.serial)}')"><i class="bi bi-arrow-right-circle"></i> Gunakan</button>` : ''}
        </div>
      </div>`
    }).join('')}</div>`
  }

  async function scanDevices() {
    try {
      const devices = await window.api.device.list()
      _devices = devices || []
      AppState.devices = _devices
      refreshDeviceList()
    } catch (err) {
      const badge = document.getElementById('device-count-badge')
      if (badge) { badge.className = 'badge b-fail'; badge.textContent = 'ADB tidak tersedia' }
      const el = document.getElementById('setup-device-list')
      if (el) el.innerHTML = `
        <div style="padding:12px 14px">
          <div class="warn-box" style="margin:0">
            <div class="ib-ic"><i class="bi bi-exclamation-triangle-fill" style="color:var(--yellow)"></i></div>
            <p>ADB belum tersedia. Klik <b>Mulai Setup Otomatis</b> untuk menginstall ADB terlebih dahulu.</p>
          </div>
        </div>`
    }
  }

  function startDevicePoll() {
    stopDevicePoll()
    _pollTimer = setInterval(() => {
      if (AppState.currentPage !== 'setup') { stopDevicePoll(); return }
      scanDevices()
    }, 3000)
  }

  function stopDevicePoll() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null }
  }

  async function useDevice(serial) {
    try {
      const info = await window.api.device.connect(serial)
      AppState.setConnectedDevice({ serial, ...info })
      toast(`✅ Device aktif: ${info.model || serial}`, 'success')
      await scanDevices()
    } catch (err) {
      toast(`Gagal connect: ${err.message}`, 'error')
    }
  }

  // ── Dep steps ──────────────────────────────────────────────
  function renderStep(step, status, pct = 0, msg = '') {
    const colors = { done:'var(--green)', active:'var(--blue)', error:'var(--red)', wait:'var(--text3)' }
    const icons  = { done:'check-circle-fill', active:'arrow-clockwise', error:'x-circle-fill', wait:'circle' }
    const bg     = { done:'var(--green-bg)', active:'var(--blue-bg)', error:'var(--red-bg)', wait:'var(--surface)' }
    const border = { done:'rgba(42,157,92,.3)', active:'rgba(59,126,237,.3)', error:'rgba(220,38,38,.3)', wait:'var(--border)' }
    const labels = { done:'Selesai', active: msg || 'Installing...', error:'Gagal', wait:'Menunggu' }
    return `
    <div id="setup-step-${step.key}" style="display:flex;gap:10px;padding:11px 13px;border-radius:9px;border:1px solid ${border[status]};background:${bg[status]};margin-bottom:7px;transition:all .2s">
      <div style="width:30px;height:30px;border-radius:7px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:16px;color:${colors[status]};flex-shrink:0;${status==='active'?'animation:spin .8s linear infinite':''}">
        <i class="bi bi-${icons[status]}"></i>
      </div>
      <div style="flex:1">
        <div class="fw6 sm">${step.title}</div>
        <div class="xs muted">${step.desc}</div>
        ${status==='active'?`<div class="pbar mt6"><div class="pbar-fill" id="pbar-${step.key}" style="width:${pct}%"></div></div>`:''}
      </div>
      <div class="xs fw6" style="color:${colors[status]}">${labels[status]}</div>
    </div>`
  }

  function updateStep(key, status, pct = 0, msg = '') {
    const el   = document.getElementById(`setup-step-${key}`)
    const step = STEPS.find(s => s.key === key)
    if (el && step) el.outerHTML = renderStep(step, status, pct, msg)
  }

  async function checkDeps() {
    try {
      _depsStatus = await window.api.setup.checkDeps()
      for (const [key, result] of Object.entries(_depsStatus)) {
        updateStep(key, result.ok ? 'done' : 'wait')
      }
      _setupDone = _depsStatus.adb?.ok && _depsStatus.java?.ok && _depsStatus.maestro?.ok
      if (_setupDone) {
        const doneBox = document.getElementById('setup-done-box')
        const startBtn = document.getElementById('setup-start-btn')
        if (doneBox) doneBox.style.display = 'block'
        if (startBtn) startBtn.style.display = 'none'
      }
    } catch (err) {
      console.warn('[setup] checkDeps error:', err)
    }
  }

  async function startInstall() {
    if (_installing) return
    _installing = true
    const btn = document.getElementById('setup-start-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise" style="animation:spin .8s linear infinite"></i> Berjalan...' }

    window.api.setup.onProgress((payload) => {
      const { step, status, pct, msg } = payload
      if (status === 'start')         updateStep(step, 'active', 0, msg)
      else if (status === 'progress') { const pb = document.getElementById(`pbar-${step}`); if (pb) pb.style.width = pct + '%' }
      else if (status === 'done')     updateStep(step, 'done', 100, msg)
      else if (status === 'error')    updateStep(step, 'error', 0, msg)
      else if (status === 'all') {
        _setupDone = true
        const doneBox = document.getElementById('setup-done-box')
        if (doneBox) doneBox.style.display = 'block'
        scanDevices()
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
    stopDevicePoll()
    await window.api.db.setSetting('setup_done', true).catch(() => {})
    toast('✅ Setup selesai!', 'success')
    navigate('dashboard')
  }

  return { render, startInstall, finishSetup, scanDevices, useDevice }
})()