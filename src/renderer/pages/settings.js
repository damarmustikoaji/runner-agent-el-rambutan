/* pages/settings.js — Global Settings */
window.PageSettings = (() => {
  'use strict'

  const CURRENT_VERSION   = '1.0.0'
  const VERSION_CHECK_URL = 'https://mpcfbb0f4ae675349bd5.free.beeceptor.com/check'

  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = ''

    const [dataPath, version, deps, evidenceDir, mustlabDir] = await Promise.all([
      window.api.system.getDataPath().catch(() => '~'),
      window.api.system.getAppVersion().catch(() => CURRENT_VERSION),
      window.api.setup.checkDeps().catch(() => ({})),
      window.api.db.getSetting('evidence_dir').catch(() => ''),
      window.api.system.getmustlabDir().catch(() => '~/.mustlab'),
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
              ${dataPath}/data/mustlab.db
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
            background:var(--surface2);padding:1px 5px;border-radius:3px">${mustlabDir}/</code>
        </div>

        <div id="deps-list">${_renderDeps(deps, mustlabDir)}</div>

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
          Gunakan jika mustlab bermasalah atau ingin install ulang dari awal.
        </div>
        <div style="display:flex;flex-direction:column;gap:0">
          ${[
            ['Reset Database',         'db',       'var(--text2)', 'Hapus semua project, TC, dan riwayat run. Binary tetap ada.'],
            ['Hapus Cache Download',   'evidence', 'var(--text2)', 'Hapus file sementara di ~/.mustlab/cache/'],
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
            <div style="font-size:15px;font-weight:700;margin-bottom:2px">MustLab</div>
            <div style="font-size:11px;color:var(--text3)">v${version}</div>
            <div style="font-size:10px;color:var(--text3);margin-top:4px">Electron · better-sqlite3 · Maestro CLI · ADB</div>
          </div>
          <button class="btn btn-d btn-sm" id="update-btn" onclick="PageSettings.checkUpdate()" style="flex-shrink:0">
            <i class="bi bi-arrow-repeat"></i> Cek Update
          </button>
        </div>
        <div id="update-result"></div>
      </div>

      <!-- Log & Diagnostik -->
      <div class="card mt10" id="log-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div>
            <div class="card-title" style="margin-bottom:2px">
              <i class="bi bi-journal-text"></i> Log & Diagnostik
            </div>
            <div style="font-size:11px;color:var(--text3)">
              <code id="log-path-display" style="font-family:var(--font-mono);font-size:10px;
                background:var(--surface2);padding:1px 5px;border-radius:3px">
                ~/Library/Application Support/mustlab/logs/
              </code>
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-d btn-sm" id="log-level-btn"
              onclick="PageSettings.toggleLogLevel()">
              <i class="bi bi-bug"></i> <span id="log-level-label">Debug Mode</span>
            </button>
            <button class="btn btn-d btn-sm" onclick="PageSettings.openLogFolder()">
              <i class="bi bi-folder2-open"></i> Buka Folder
            </button>
          </div>
        </div>

        <div id="log-viewer" style="background:#0d1117;border-radius:7px;
          font-family:var(--font-mono);font-size:10px;line-height:1.8;
          padding:10px 12px;max-height:240px;overflow-y:auto;color:#e6edf3">
          <div style="color:#8b949e;text-align:center;padding:12px">
            Klik "Muat Log" untuk lihat 100 baris terakhir
          </div>
        </div>
        <button class="btn btn-d btn-sm w100" style="margin-top:8px"
          onclick="PageSettings.loadRecentLog()">
          <i class="bi bi-arrow-clockwise"></i> Muat Log Terbaru
        </button>
      </div>
    </div>`

    // Load log path setelah render
    window.api.system.getLogPath().then(p => {
      window._logPath = p
      const el = document.getElementById('log-path-display')
      if (el) el.textContent = p.replace(/^\/Users\/[^/]+/, '~')
    }).catch(() => {})
    _updateLogLevelLabel()
  }

  function _updateLogLevelLabel() {
    const isDebug = localStorage.getItem('tp_log_level') === 'debug'
    const lbl = document.getElementById('log-level-label')
    const btn = document.getElementById('log-level-btn')
    if (lbl) lbl.textContent = isDebug ? 'Debug ON' : 'Debug Mode'
    if (btn) btn.style.color = isDebug ? 'var(--blue)' : ''
  }

  async function openLogFolder() {
    const p = window._logPath || await window.api.system.getLogPath().catch(() => null)
    if (p) window.api.system.openExternal(p)
    else toast('Folder log tidak ditemukan', 'error')
  }

  async function toggleLogLevel() {
    const current = localStorage.getItem('tp_log_level') || 'info'
    const next    = current === 'debug' ? 'info' : 'debug'
    localStorage.setItem('tp_log_level', next)
    window.api.system.log('info', 'Log level changed to: ' + next)
    toast(next === 'debug' ? '🐛 Debug mode ON — log lebih verbose' : '✅ Debug mode OFF')
    _updateLogLevelLabel()
  }

  async function loadRecentLog() {
    const viewer = document.getElementById('log-viewer')
    if (!viewer) return
    viewer.innerHTML = '<div style="color:#8b949e;text-align:center;padding:12px"><i class="bi bi-arrow-clockwise" style="animation:spin .7s linear infinite"></i> Memuat...</div>'
    try {
      const logPath = window._logPath || await window.api.system.getLogPath().catch(() => '')
      const today   = new Date().toISOString().slice(0, 10)
      const logFile = logPath + '/app-' + today + '.log'
      const result  = await window.api.system.readLogFile(logFile).catch(() => null)
      if (!result) {
        viewer.innerHTML = '<div style="color:#8b949e;padding:12px;text-align:center">Belum ada log hari ini.<br><span style="font-size:9px;opacity:.6">' + esc(logFile) + '</span></div>'
        return
      }
      const lines = result.split('\n').filter(Boolean).slice(-100)
      const colors = { error:'#ff7b72', warn:'#e3b341', info:'#79c0ff', debug:'#8b949e' }
      viewer.innerHTML = lines.map(line => {
        try {
          const o   = JSON.parse(line)
          const col = colors[o.level] || '#e6edf3'
          const ts  = (o.timestamp || '').slice(11, 19)
          const extras = Object.entries(o)
            .filter(([k]) => !['level','message','timestamp'].includes(k))
          const meta = extras.length
            ? ' <span style="color:#8b949e;opacity:.7">' + esc(JSON.stringify(Object.fromEntries(extras)).slice(0, 80)) + '</span>'
            : ''
          return '<div><span style="color:#8b949e">' + ts + '</span> ' +
            '<span style="color:' + col + '">' + (o.level||'').toUpperCase().padEnd(5) + '</span> ' +
            esc(o.message || '') + meta + '</div>'
        } catch {
          return '<div style="color:#8b949e">' + esc(line.slice(0, 120)) + '</div>'
        }
      }).join('')
      viewer.scrollTop = viewer.scrollHeight
      toast('✅ ' + lines.length + ' baris log dimuat')
    } catch (err) {
      viewer.innerHTML = '<div style="color:#ff7b72;padding:8px">Gagal baca log: ' + esc(err.message) + '</div>'
    }
  }

  // ── Deps renderer ───────────────────────────────────────────
  function _renderDeps(deps, mustlabDir) {
    const tp = mustlabDir || '~/.mustlab'
    const isMac = navigator.platform?.startsWith('Mac') || navigator.userAgent?.includes('Mac')

    const androidItems = [
      {
        label: 'ADB (Android Debug Bridge)',
        ok: deps.adb?.ok,
        path: deps.adb?.path || '—',
        source: _adbSource(deps.adb?.path, tp),
        guide: deps.adb?.ok ? null :
          `ADB tidak ditemukan. Pastikan Android Studio terinstall, atau download
           <a href="#" onclick="window.api.system.openExternal('https://developer.android.com/tools/releases/platform-tools');return false"
             style="color:var(--blue)">Platform Tools</a>
           dan extract ke <code style="font-family:var(--font-mono);font-size:10px">${tp}/adb/</code>`,
      },
      {
        label: 'Java Runtime (JRE 17)',
        ok: deps.java?.ok,
        path: deps.java?.path || '—',
        source: _javaSource(deps.java?.path, tp),
        guide: deps.java?.ok ? null :
          `Java tidak ditemukan. Klik <b>Setup Wizard</b> untuk download otomatis Temurin JRE 17 (~80MB).`,
      },
      {
        label: 'Maestro CLI',
        ok: deps.maestro?.ok,
        path: deps.maestro?.path || '—',
        source: 'Download dari GitHub releases → ~/.mustlab/bin/maestro/',
        guide: deps.maestro?.ok ? null :
          `Maestro CLI tidak ditemukan. Klik <b>Setup Wizard</b> untuk install otomatis.`,
      },
    ]

    const iosItems = isMac ? [
      {
        label: 'Xcode (iOS)',
        ok: deps.xcode?.ok,
        path: deps.xcode?.path || '—',
        source: deps.xcode?.cltOnly
          ? 'Command Line Tools saja — Xcode.app belum terinstall'
          : 'Xcode Developer Tools',
        guide: deps.xcode?.ok ? null :
          `Xcode belum terinstall atau belum dikonfigurasi.<br>
           <a href="#" onclick="window.api.system.openExternal('https://apps.apple.com/app/xcode/id497799835');return false"
             style="color:var(--blue)">Download dari App Store</a>, lalu:
           <code style="font-family:var(--font-mono);font-size:10px;display:block;margin-top:4px">
           sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer</code>`,
      },
      {
        label: 'idb-companion (iOS)',
        ok: deps.idbCompanion?.ok,
        path: deps.idbCompanion?.path || '—',
        source: 'brew tap facebook/fb && brew install idb-companion',
        guide: deps.idbCompanion?.ok ? null :
          `idb-companion tidak ditemukan. Install via Homebrew:<br>
           <code style="font-family:var(--font-mono);font-size:10px">
           brew tap facebook/fb && brew install idb-companion</code>`,
      },
      {
        label: 'idb client (iOS)',
        ok: deps.idb?.ok,
        path: deps.idb?.path || '—',
        source: 'pipx install fb-idb --python python3.11',
        guide: deps.idb?.ok ? null :
          `idb client tidak ditemukan. Install:<br>
           <code style="font-family:var(--font-mono);font-size:10px">
           brew install python@3.11 pipx<br>
           pipx install fb-idb --python /usr/local/bin/python3.11</code>`,
      },
    ] : []

    const allItems = [...androidItems, ...iosItems]

    return allItems.map(item => `
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
          <i class="bi bi-lightbulb" style="color:var(--yellow)"></i>&nbsp;${item.guide}
        </div>` : ''}
      </div>`).join('')
  }

  function _adbSource(p, tp) {
    if (!p || p === '—') return 'Mencari di Android SDK, ' + tp + '/adb/, dan PATH system'
    if (p.includes('.mustlab') || p.includes(tp)) return 'Bundle di app → ' + tp + '/adb/'
    if (p.includes('Android/sdk') || p.includes('Android/Sdk')) return 'Android SDK dari Android Studio'
    return 'Terdeteksi dari system PATH'
  }

  function _javaSource(p, tp) {
    if (!p || p === '—') return 'Mencari di ' + tp + '/java/ dan PATH system'
    if (p === 'java (system)') return 'Java dari system PATH (bukan dari Setup Wizard — ini OK)'
    if (p.includes('.mustlab') || p.includes(tp)) return 'Temurin JRE 17 (didownload Setup Wizard → ' + tp + '/java/)'
    return 'Java dari system PATH'
  }

  // ── Actions ─────────────────────────────────────────────────
  async function recheckDeps() {
    const btn = document.getElementById('recheck-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat" style="animation:spin .7s linear infinite"></i>' }
    const [deps, tp] = await Promise.all([
      window.api.setup.checkDeps().catch(() => ({})),
      window.api.system.getmustlabDir().catch(() => '~/.mustlab'),
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
      db:       'Reset database? Semua project, TC, dan riwayat run akan dihapus. App akan restart otomatis.',
      evidence: 'Hapus cache download?',
      binaries: 'Hapus semua binary dependency (ADB, Java, Maestro)? App akan restart ke Setup Wizard.',
      all:      'HAPUS SEMUA DATA DAN BINARY? Tidak bisa dibatalkan! App akan restart otomatis.',
    }
    if (!confirm(msgs[type] || 'Lanjutkan?')) return
    try {
      const result = await window.api.system.clearData(type)
      toast(result.msg || 'Selesai', 'success')
      // App akan relaunch otomatis dari main process (db, binaries, all)
      // Untuk cache: hanya toast, tidak perlu restart
      if (type === 'evidence') render()
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

  return { render, pickEvidenceDir, clearEvidenceDir, recheckDeps, checkUpdate, clearData,
           openLogFolder, toggleLogLevel, loadRecentLog }
})()