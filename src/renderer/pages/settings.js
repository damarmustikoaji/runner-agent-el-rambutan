/* pages/settings.js — Global Settings */
window.PageSettings = (() => {
  'use strict'

  const CURRENT_VERSION   = '1.0.0'
  const VERSION_CHECK_URL = 'https://mpcfbb0f4ae675349bd5.free.beeceptor.com/check'

  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = ''

    const [dataPath, version, deps, evidenceDir, testpilotDir] = await Promise.all([
      window.api.system.getDataPath().catch(() => '~'),
      window.api.system.getAppVersion().catch(() => CURRENT_VERSION),
      window.api.setup.checkDeps().catch(() => ({})),
      window.api.db.getSetting('evidence_dir').catch(() => ''),
      window.api.system.getTestpilotDir().catch(() => '~/.testpilot'),
    ])

    const evDir = evidenceDir || ''

    content.innerHTML = `
    <div style="max-width:600px;padding:20px">

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
            <input type="text" id="ev-dir" value="${evDir}" readonly
              placeholder="${dataPath}/evidence"
              style="flex:1;font-size:10.5px;font-family:var(--font-mono);cursor:pointer;background:var(--surface2)"
              onclick="PageSettings.pickEvidenceDir()">
            <button class="btn btn-d btn-sm" onclick="PageSettings.pickEvidenceDir()" title="Pilih folder">
              <i class="bi bi-folder2-open"></i></button>
            ${evDir ? `
            <button class="btn btn-d btn-sm" onclick="window.api.system.openExternal('${evDir}')" title="Buka di Finder">
              <i class="bi bi-box-arrow-up-right"></i></button>
            <button class="btn btn-d btn-sm" style="color:var(--red)" onclick="PageSettings.clearEvidenceDir()" title="Reset">
              <i class="bi bi-x-lg"></i></button>` : ''}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.5">
            ${evDir
              ? '<i class="bi bi-check-circle-fill" style="color:var(--green)"></i> Folder sudah diset — dipakai Test Run yang tidak punya folder spesifik.'
              : '<i class="bi bi-info-circle"></i> Belum diset — pakai default system userData.'}
          </div>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text2);display:block;margin-bottom:5px">Database</label>
          <div style="display:flex;gap:6px;align-items:center">
            <code style="flex:1;background:var(--surface2);padding:5px 9px;border-radius:6px;
              font-size:10px;font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${dataPath}/data/testpilot.db
            </code>
            <button class="btn btn-d btn-sm" onclick="window.api.system.openExternal('${dataPath}/data')" title="Buka folder">
              <i class="bi bi-folder2-open"></i></button>
          </div>
        </div>
      </div>

      <!-- Dependencies -->
      <div class="card mb10">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div class="card-title"><i class="bi bi-wrench-adjustable"></i> Dependencies</div>
          <button class="btn btn-d btn-sm" id="recheck-btn" onclick="PageSettings.recheckDeps()">
            <i class="bi bi-arrow-repeat"></i> Cek Ulang
          </button>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
          Install location: <code style="font-family:var(--font-mono);font-size:10px;
            background:var(--surface2);padding:1px 5px;border-radius:3px">${testpilotDir}/</code>
        </div>

        <div id="deps-list">${_renderDeps(deps, testpilotDir)}</div>

        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-p btn-sm" onclick="navigate('setup')">
            <i class="bi bi-lightning-charge-fill"></i> Setup Wizard
          </button>
          <button class="btn btn-d btn-sm" onclick="navigate('setup')">
            <i class="bi bi-download"></i> Install Ulang
          </button>
        </div>
      </div>

      <!-- Clear Data & Uninstall -->
      <div class="card mb10">
        <div class="card-title mb4" style="color:var(--red)">
          <i class="bi bi-trash3"></i> Clear Data & Uninstall
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:14px">
          Gunakan jika TestPilot bermasalah atau ingin install ulang dari awal.
        </div>
        <div style="display:flex;flex-direction:column;gap:0">
          ${[
            ['Reset Database',         'db',       'var(--text2)', 'Hapus semua project, TC, dan riwayat run. Binary tetap ada.'],
            ['Hapus Cache Download',   'evidence', 'var(--text2)', 'Hapus file sementara di ~/.testpilot/cache/'],
            ['Reinstall Dependencies', 'binaries', '#ea580c',     'Hapus ADB, Java, Maestro — Setup Wizard harus dijalankan ulang.'],
            ['Uninstall Lengkap',      'all',      '#dc2626',     'Hapus SEMUA data + binary. Tidak bisa dibatalkan!'],
          ].map(([label, type, color, desc]) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-size:12px;font-weight:600;color:${color};margin-bottom:2px">${label}</div>
              <div style="font-size:11px;color:var(--text3)">${desc}</div>
            </div>
            <button class="btn btn-d btn-sm" style="flex-shrink:0;color:${color}"
              onclick="PageSettings.clearData('${type}')">
              <i class="bi bi-trash3"></i>
            </button>
          </div>`).join('')}
        </div>
      </div>

      <!-- Tentang -->
      <div class="card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div>
            <div style="font-size:15px;font-weight:700;margin-bottom:2px">TestPilot</div>
            <div style="font-size:11px;color:var(--text3)">v${version}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:4px">Electron · better-sqlite3 · Maestro CLI · ADB</div>
          </div>
          <button class="btn btn-d btn-sm" id="update-btn" onclick="PageSettings.checkUpdate()" style="flex-shrink:0">
            <i class="bi bi-arrow-repeat"></i> Cek Update
          </button>
        </div>
        <div id="update-result"></div>
      </div>
    </div>`
  }

  // ── Deps renderer ───────────────────────────────────────────
  function _renderDeps(deps, testpilotDir) {
    const tp = testpilotDir || '~/.testpilot'

    const items = [
      {
        label: 'ADB (Android Debug Bridge)',
        ok: deps.adb?.ok,
        path: deps.adb?.path || '—',
        source: _adbSource(deps.adb?.path, tp),
        guide: deps.adb?.ok ? null :
          `ADB tidak ditemukan di ~/.testpilot/adb/ maupun system PATH.<br>
           <b>Solusi:</b> Pastikan Android Studio sudah terinstall — ADB ada di
           <code style="font-family:var(--font-mono);font-size:10px">~/Library/Android/sdk/platform-tools/adb</code>.<br>
           Atau download manual dari
           <a href="#" onclick="window.api.system.openExternal('https://developer.android.com/tools/releases/platform-tools');return false"
             style="color:var(--blue)">developer.android.com/tools/releases/platform-tools</a>
           dan extract ke <code style="font-family:var(--font-mono);font-size:10px">${tp}/adb/</code>`,
      },
      {
        label: 'Java Runtime (JRE 17)',
        ok: deps.java?.ok,
        path: deps.java?.path || '—',
        source: _javaSource(deps.java?.path, tp),
        guide: deps.java?.ok ? null :
          `Java tidak ditemukan. Klik <b>Setup Wizard</b> untuk download otomatis Temurin JRE 17 (~80MB).<br>
           Atau install manual dari
           <a href="#" onclick="window.api.system.openExternal('https://adoptium.net');return false"
             style="color:var(--blue)">adoptium.net</a>`,
      },
      {
        label: 'Maestro CLI',
        ok: deps.maestro?.ok,
        path: deps.maestro?.path || '—',
        source: 'Download dari GitHub releases → ~/.testpilot/bin/maestro/',
        guide: deps.maestro?.ok ? null :
          `Maestro CLI tidak ditemukan. Klik <b>Setup Wizard</b> untuk install otomatis.`,
      },
    ]

    return items.map(item => `
      <div style="padding:10px 12px;background:var(--surface2);border-radius:8px;margin-bottom:8px;
        border-left:3px solid ${item.ok ? 'var(--green)' : 'var(--red)'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-size:12px;font-weight:700">${item.label}</span>
          <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;
            background:${item.ok ? '#dcfce7' : '#fee2e2'};color:${item.ok ? '#16a34a' : '#dc2626'}">
            ${item.ok ? '✓ OK' : '✗ Tidak ditemukan'}
          </span>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:5px">${item.source}</div>
        <code style="font-size:9.5px;font-family:var(--font-mono);background:var(--surface);
          padding:3px 8px;border-radius:4px;display:block;overflow:hidden;
          text-overflow:ellipsis;white-space:nowrap;color:${item.ok ? 'var(--text2)' : 'var(--text3)'}">
          ${item.path}
        </code>
        ${item.guide ? `
        <div style="margin-top:8px;padding:8px 10px;background:var(--yellow-bg);
          border:1px solid rgba(196,125,14,.2);border-radius:6px;font-size:11px;
          color:var(--text2);line-height:1.7">
          <i class="bi bi-lightbulb" style="color:var(--yellow)"></i>&nbsp;
          ${item.guide}
        </div>` : ''}
      </div>`).join('')
  }

  function _adbSource(p, tp) {
    if (!p || p === '—') return 'Mencari di Android SDK, ' + tp + '/adb/, dan PATH system'
    if (p.includes('.testpilot') || p.includes(tp)) return 'Bundle di app → ' + tp + '/adb/'
    if (p.includes('Android/sdk') || p.includes('Android/Sdk')) return 'Android SDK dari Android Studio'
    return 'Terdeteksi dari system PATH'
  }

  function _javaSource(p, tp) {
    if (!p || p === '—') return 'Mencari di ' + tp + '/java/ dan PATH system'
    if (p === 'java (system)') return 'Java dari system PATH (bukan dari Setup Wizard — ini OK)'
    if (p.includes('.testpilot') || p.includes(tp)) return 'Temurin JRE 17 (didownload Setup Wizard → ' + tp + '/java/)'
    return 'Java dari system PATH'
  }

  // ── Actions ─────────────────────────────────────────────────
  async function recheckDeps() {
    const btn = document.getElementById('recheck-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .7s linear infinite"></i>' }
    const [deps, tp] = await Promise.all([
      window.api.setup.checkDeps().catch(() => ({})),
      window.api.system.getTestpilotDir().catch(() => '~/.testpilot'),
    ])
    const list = document.getElementById('deps-list')
    if (list) list.innerHTML = _renderDeps(deps, tp)
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cek Ulang' }
    const allOk = deps.adb?.ok && deps.java?.ok && deps.maestro?.ok
    toast(allOk ? '✅ Semua dependencies OK' : '⚠️ Ada yang bermasalah — jalankan Setup Wizard', allOk ? 'success' : 'error')
  }

  async function pickEvidenceDir() {
    const result = await window.api.system.openFileDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Pilih folder default untuk evidence',
    }).catch(() => null)
    if (result?.canceled || !result?.filePaths?.length) return
    const dir = result.filePaths[0]
    await window.api.db.setSetting('evidence_dir', dir)
    toast('✅ Evidence folder: ' + dir)
    render()
  }

  async function clearEvidenceDir() {
    await window.api.db.setSetting('evidence_dir', '')
    toast('Evidence folder direset ke default')
    render()
  }

  async function clearData(type) {
    const msgs = {
      db:       'Reset database? Semua project, TC, dan riwayat run akan dihapus. Binary tetap ada. Tidak bisa dibatalkan.',
      evidence: 'Hapus cache download?',
      binaries: 'Hapus semua binary dependency (ADB, Java, Maestro)? Setup Wizard harus dijalankan ulang.',
      all:      'HAPUS SEMUA DATA DAN BINARY? Semua project, TC, riwayat run, dan dependencies akan dihapus. TIDAK BISA DIBATALKAN!',
    }
    if (!confirm(msgs[type] || 'Lanjutkan?')) return
    try {
      const result = await window.api.system.clearData(type)
      toast(result.msg || 'Selesai', 'success')
      if (type === 'all' || type === 'db') {
        setTimeout(() => alert('Data dihapus. Restart TestPilot untuk setup ulang.'), 400)
      }
      render()
    } catch (err) {
      toast('Gagal: ' + err.message, 'error')
    }
  }

  async function checkUpdate() {
    const btn    = document.getElementById('update-btn')
    const result = document.getElementById('update-result')
    const version = await window.api.system.getAppVersion().catch(() => CURRENT_VERSION)
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .7s linear infinite"></i> Memeriksa...' }
    try {
      const res  = await fetch(VERSION_CHECK_URL, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      const latest = data.version || ''
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cek Update' }
      if (!latest || latest === version) {
        if (result) result.innerHTML = `
          <div style="margin-top:10px;padding:8px 12px;background:var(--green-bg);
            border:1px solid rgba(42,157,92,.2);border-radius:7px;display:flex;align-items:center;gap:7px">
            <i class="bi bi-check-circle-fill" style="color:var(--green)"></i>
            <span style="font-size:11px;color:var(--green);font-weight:600">Sudah versi terbaru (v${version})</span>
          </div>`
        return
      }
      const lv = data.level || 'minor'
      const colors  = { critical:'#dc2626', major:'#ea580c', minor:'#2563eb' }
      const bgs     = { critical:'#fee2e2', major:'#fff7ed', minor:'#f0f6ff' }
      const borders = { critical:'#dc2626', major:'#f97316', minor:'#3b7eed' }
      const labels  = { critical:'🚨 Update Kritis', major:'⬆️ Update Major', minor:'ℹ️ Update Minor' }
      if (result) result.innerHTML = `
        <div style="margin-top:10px;padding:12px;background:${bgs[lv]||bgs.minor};
          border:1px solid ${borders[lv]||borders.minor};border-radius:8px">
          <div style="font-size:12px;font-weight:700;color:${colors[lv]||colors.minor};margin-bottom:4px">${labels[lv]||labels.minor}</div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px">${data.note||'Versi terbaru tersedia'}</div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:10px">
            v${version} → <b>v${latest}</b>${data.date ? ' · ' + data.date : ''}
          </div>
          <button class="btn btn-p btn-sm" onclick="navigate('setup')">
            <i class="bi bi-lightning-charge-fill"></i> Update via Setup Wizard
          </button>
        </div>`
    } catch (err) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Cek Update' }
      if (result) result.innerHTML = `
        <div style="margin-top:10px;padding:8px 12px;background:var(--surface2);
          border:1px solid var(--border);border-radius:7px;font-size:11px;color:var(--text3)">
          <i class="bi bi-wifi-off"></i> Tidak dapat memeriksa — cek koneksi internet.
        </div>`
    }
  }

  return { render, pickEvidenceDir, clearEvidenceDir, recheckDeps, checkUpdate, clearData }
})()