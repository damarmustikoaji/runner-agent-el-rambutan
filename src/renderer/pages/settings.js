/* pages/settings.js — Global Settings */
window.PageSettings = (() => {
  'use strict'

  const CURRENT_VERSION   = '1.0.0'
  const VERSION_CHECK_URL = 'https://mpcfbb0f4ae675349bd5.free.beeceptor.com/check'

  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = ''

    const [dataPath, version, deps, evidenceDir] = await Promise.all([
      window.api.system.getDataPath().catch(() => '~'),
      window.api.system.getAppVersion().catch(() => CURRENT_VERSION),
      window.api.setup.checkDeps().catch(() => ({})),
      window.api.db.getSetting('evidence_dir').catch(() => ''),
    ])

    const defaultEvidenceDir = `${dataPath}/evidence`
    const evDir = evidenceDir || ''

    content.innerHTML = `
    <div style="max-width:580px;padding:20px">

      <!-- Version banner placeholder -->
      <div id="settings-version-banner"></div>

      <!-- Evidence & Storage -->
      <div class="card mb10">
        <div class="card-title mb12">
          <i class="bi bi-folder-fill" style="color:var(--yellow)"></i> Evidence & Storage
        </div>

        <div style="margin-bottom:12px">
          <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">
            Folder Evidence (Default Global)
          </label>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="ev-dir" value="${esc(evDir)}" readonly
              placeholder="${esc(defaultEvidenceDir)}"
              style="flex:1;font-size:10.5px;font-family:var(--font-mono);cursor:pointer;
                background:var(--surface2)"
              onclick="PageSettings.pickEvidenceDir()">
            <button class="btn btn-d btn-sm" onclick="PageSettings.pickEvidenceDir()"
              title="Pilih folder"><i class="bi bi-folder2-open"></i></button>
            ${evDir ? `
            <button class="btn btn-d btn-sm"
              onclick="window.api.system.openExternal('${esc(evDir)}')"
              title="Buka di Finder"><i class="bi bi-box-arrow-up-right"></i></button>
            <button class="btn btn-d btn-sm" style="color:var(--red)"
              onclick="PageSettings.clearEvidenceDir()"
              title="Reset ke default"><i class="bi bi-x-lg"></i></button>` : ''}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.5">
            ${evDir
              ? `<i class="bi bi-check-circle-fill" style="color:var(--green)"></i>
                 Folder sudah diset. Test Run yang tidak punya folder spesifik akan pakai ini.`
              : `<i class="bi bi-info-circle"></i>
                 Belum diset — pakai default:
                 <code style="font-family:var(--font-mono);font-size:9px;
                   background:var(--surface3);padding:1px 4px;border-radius:3px">
                   ${esc(defaultEvidenceDir)}</code>`}
          </div>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">
            Database
          </label>
          <div style="display:flex;gap:6px;align-items:center">
            <code style="flex:1;background:var(--surface2);padding:5px 9px;
              border-radius:6px;font-size:10px;font-family:var(--font-mono);
              overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${esc(dataPath)}/data/testpilot.db
            </code>
            <button class="btn btn-d btn-sm"
              onclick="window.api.system.openExternal('${esc(dataPath)}/data')"
              title="Buka folder database"><i class="bi bi-folder2-open"></i></button>
          </div>
        </div>
      </div>

      <!-- Binary Paths -->
      <div class="card mb10">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div class="card-title"><i class="bi bi-wrench-adjustable"></i> Binary Paths</div>
          <button class="btn btn-d btn-sm" id="recheck-btn"
            onclick="PageSettings.recheckDeps()">
            <i class="bi bi-arrow-repeat"></i> Cek Ulang
          </button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
          Path binary yang digunakan TestPilot. Diisi otomatis oleh Setup Wizard.
        </div>

        <div id="deps-list">
          ${_renderDeps(deps)}
        </div>

        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-p btn-sm" onclick="navigate('setup')">
            <i class="bi bi-lightning-charge-fill"></i> Jalankan Setup Ulang
          </button>
          <button class="btn btn-d btn-sm" onclick="navigate('setup')">
            <i class="bi bi-arrow-repeat"></i> Install Ulang Dependencies
          </button>
        </div>
      </div>

      <!-- Tentang & Update -->
      <div class="card" id="about-card">
        <div class="card-title mb12"><i class="bi bi-info-circle"></i> Tentang TestPilot</div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div>
            <div style="font-size:15px;font-weight:700">TestPilot</div>
            <div style="font-size:11px;color:var(--text3)">v${esc(version)}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:3px">
              Electron · better-sqlite3 · Maestro CLI · ADB
            </div>
          </div>
          <button class="btn btn-p btn-sm" id="update-btn"
            onclick="PageSettings.checkUpdate()">
            <i class="bi bi-arrow-repeat"></i> Cek Update
          </button>
        </div>

        <!-- Update result placeholder -->
        <div id="update-result"></div>

        <div style="height:1px;background:var(--border);margin:12px 0"></div>
        <div style="font-size:10px;color:var(--text3);line-height:1.6">
          TestPilot adalah tools automation QA berbasis Maestro CLI untuk QA non-teknis.
          Dibuat untuk mempermudah pembuatan dan eksekusi test case Android.
        </div>
      </div>
    </div>`

    // Auto-check update di background
    _autoCheckUpdate(version)
  }

  // ── Binary deps renderer ────────────────────────────────────
  function _renderDeps(deps) {
    return [
      ['ADB',     deps.adb?.path    || '—', deps.adb?.ok,     'Android Debug Bridge — untuk komunikasi ke device/emulator'],
      ['Java',    deps.java?.path   || '—', deps.java?.ok,    'Java Runtime — diperlukan oleh Maestro CLI'],
      ['Maestro', deps.maestro?.path || '—', deps.maestro?.ok, 'Maestro CLI — test runner utama TestPilot'],
    ].map(([label, path, ok, desc]) => `
      <div style="padding:10px 12px;background:var(--surface2);border-radius:7px;
        margin-bottom:8px;border-left:3px solid ${ok?'var(--green)':path==='—'?'var(--border)':'var(--red)'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:12px;font-weight:700">${label}</span>
          <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;
            background:${ok?'#dcfce7':path==='—'?'var(--surface3)':'#fee2e2'};
            color:${ok?'#16a34a':path==='—'?'var(--text3)':'#dc2626'}">
            ${ok?'✓ OK':path==='—'?'Tidak ditemukan':'✗ Error'}
          </span>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:5px">${esc(desc)}</div>
        <div style="display:flex;gap:5px;align-items:center">
          <code style="flex:1;font-size:9.5px;font-family:var(--font-mono);
            background:var(--surface);padding:3px 7px;border-radius:4px;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
            color:${ok?'var(--text2)':'var(--text3)'}">
            ${esc(path)}
          </code>
          ${!ok ? `
          <button class="btn btn-xs btn-p" onclick="navigate('setup')"
            title="Jalankan setup untuk install ${label}">
            Install
          </button>` : ''}
        </div>
      </div>`).join('')
  }

  // ── Actions ─────────────────────────────────────────────────
  async function recheckDeps() {
    const btn = document.getElementById('recheck-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .7s linear infinite"></i> Memeriksa...' }

    const deps = await window.api.setup.checkDeps().catch(() => ({}))
    const list = document.getElementById('deps-list')
    if (list) list.innerHTML = _renderDeps(deps)

    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cek Ulang' }

    const allOk = deps.adb?.ok && deps.java?.ok && deps.maestro?.ok
    toast(allOk ? '✅ Semua dependencies OK' : '⚠️ Ada dependency yang bermasalah. Jalankan Setup Ulang.', allOk?'success':'error')
  }

  async function pickEvidenceDir() {
    const result = await window.api.system.openFileDialog({
      properties: ['openDirectory','createDirectory'],
      title: 'Pilih folder default untuk menyimpan evidence',
    }).catch(() => null)
    if (result?.canceled || !result?.filePaths?.length) return
    const dir = result.filePaths[0]
    await window.api.db.setSetting('evidence_dir', dir)
    toast(`✅ Evidence folder default: ${dir}`)
    render()
  }

  async function clearEvidenceDir() {
    await window.api.db.setSetting('evidence_dir', '')
    toast('Evidence folder direset ke default')
    render()
  }

  async function checkUpdate() {
    const btn = document.getElementById('update-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .7s linear infinite"></i> Memeriksa...' }

    const result = document.getElementById('update-result')
    const version = await window.api.system.getAppVersion().catch(() => CURRENT_VERSION)

    try {
      const res  = await fetch(VERSION_CHECK_URL, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const latest = data.version || ''

      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cek Update' }

      if (!latest || latest === version) {
        if (result) result.innerHTML = `
          <div style="background:#dcfce7;border:1px solid #16a34a;border-radius:8px;
            padding:10px 14px;display:flex;align-items:center;gap:8px">
            <i class="bi bi-check-circle-fill" style="color:#16a34a;font-size:16px"></i>
            <div>
              <div style="font-size:12px;font-weight:600;color:#15803d">
                TestPilot sudah versi terbaru!
              </div>
              <div style="font-size:10px;color:#166534;margin-top:2px">
                Versi kamu: <b>v${esc(version)}</b>
              </div>
            </div>
          </div>`
        return
      }

      const levelCfg = {
        critical: { bg:'#fee2e2', border:'#dc2626', icon:'bi-exclamation-octagon-fill',  color:'#dc2626', label:'🚨 Update Kritis — Harus diupdate!' },
        major:    { bg:'#fff7ed', border:'#f97316', icon:'bi-exclamation-triangle-fill', color:'#ea580c', label:'⬆️ Update Major Tersedia' },
        minor:    { bg:'#f0f6ff', border:'#3b7eed', icon:'bi-info-circle-fill',          color:'#2563eb', label:'ℹ️ Update Minor Tersedia' },
      }
      const cfg = levelCfg[data.level] || levelCfg.minor

      if (result) result.innerHTML = `
        <div style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:8px;
          padding:12px 14px;display:flex;align-items:flex-start;gap:10px">
          <i class="bi ${cfg.icon}" style="color:${cfg.color};font-size:18px;flex-shrink:0;margin-top:1px"></i>
          <div style="flex:1">
            <div style="font-weight:700;font-size:12px;color:${cfg.color};margin-bottom:3px">
              ${cfg.label}
            </div>
            <div style="font-size:11px;color:var(--text2);margin-bottom:6px">
              ${esc(data.note || 'Versi terbaru tersedia')}
            </div>
            <div style="font-size:10px;color:var(--text3);margin-bottom:8px">
              Versi kamu: <b>v${esc(version)}</b>
              &nbsp;→&nbsp;
              Terbaru: <b>v${esc(latest)}</b>
              ${data.date ? `&nbsp;·&nbsp;${esc(data.date)}` : ''}
            </div>
            <button class="btn btn-p btn-sm" onclick="navigate('setup')">
              <i class="bi bi-lightning-charge-fill"></i> Update via Setup Wizard
            </button>
          </div>
        </div>`

    } catch (err) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cek Update' }
      if (result) result.innerHTML = `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
          padding:10px 14px;font-size:11px;color:var(--text3)">
          <i class="bi bi-wifi-off"></i> Tidak dapat memeriksa update — cek koneksi internet.
        </div>`
    }
  }

  // Auto check di background saat render
  async function _autoCheckUpdate(currentVersion) {
    try {
      const res  = await fetch(VERSION_CHECK_URL, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return
      const data = await res.json()
      const latest = data.version || ''
      if (!latest || latest === currentVersion) return

      const banner = document.getElementById('settings-version-banner')
      if (!banner) return

      const levelCfg = {
        critical: { bg:'#fee2e2', border:'#dc2626', color:'#dc2626', label:'🚨 Update Kritis' },
        major:    { bg:'#fff7ed', border:'#f97316', color:'#ea580c', label:'⬆️ Update Major Tersedia' },
        minor:    { bg:'#f0f6ff', border:'#3b7eed', color:'#2563eb', label:'ℹ️ Update Minor Tersedia' },
      }
      const cfg = levelCfg[data.level] || levelCfg.minor

      banner.innerHTML = `
        <div style="background:${cfg.bg};border:1px solid ${cfg.border};border-radius:8px;
          padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
          <div style="flex:1">
            <span style="font-weight:700;font-size:12px;color:${cfg.color}">${cfg.label}</span>
            <span style="font-size:11px;color:var(--text2);margin-left:6px">
              v${esc(currentVersion)} → v${esc(latest)}
            </span>
            ${data.note ? `<span style="font-size:11px;color:var(--text3);margin-left:6px">— ${esc(data.note)}</span>` : ''}
          </div>
          <button class="btn btn-p btn-sm" onclick="navigate('setup')">
            <i class="bi bi-lightning-charge-fill"></i> Update Sekarang
          </button>
          <button onclick="document.getElementById('settings-version-banner').innerHTML=''"
            style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:14px">✕</button>
        </div>`
    } catch {}
  }

  return { render, pickEvidenceDir, clearEvidenceDir, recheckDeps, checkUpdate }
})()