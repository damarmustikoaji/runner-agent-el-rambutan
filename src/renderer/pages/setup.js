/* pages/setup.js */
window.PageSetup = (() => {
  'use strict'

  const STEPS = [
    { key: 'adb',     title: 'ADB (Android Debug Bridge)', desc: 'Dibutuhkan untuk komunikasi dengan Android device & emulator.' },
    { key: 'java',    title: 'Java Runtime (JRE 17)',       desc: 'Runtime untuk menjalankan Maestro. Download otomatis ~80MB.' },
    { key: 'maestro', title: 'Maestro CLI',                 desc: 'Test runner utama MustLab. Download otomatis dari internet.' },
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
      <button class="btn btn-p btn-sm" id="setup-start-btn" onclick="PageSetup.startInstall()">
        <i class="bi bi-lightning-charge-fill"></i> Mulai Setup Otomatis
      </button>`

    content.innerHTML = `
    <div style="max-width:600px;margin:0 auto;padding:10px 0">

      <div style="text-align:center;margin-bottom:22px">
        <div style="width:64px;height:64px;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
          <img src="./assets/logo.png" alt="MustLab" style="width:64px;height:64px;object-fit:contain">
        </div>
        <div style="font-size:22px;font-weight:800;letter-spacing:-.03em;margin-bottom:6px">Just test it.</div>
        <div class="sm muted" style="line-height:1.65">Setup seminimal mungkin, kurangin coding — dan siap testing.</div>
      </div>

      <div id="setup-steps" class="mb12">
        ${STEPS.map(s => renderStep(s, 'wait')).join('')}
      </div>

      <div id="setup-done-box" style="display:none;margin-bottom:14px">
        <div style="background:var(--green-bg);border:1px solid rgba(42,157,92,.25);border-radius:10px;padding:16px;text-align:center">
          <i class="bi bi-check-circle-fill" style="font-size:1.6rem;color:var(--green)"></i>
          <div class="fw7 mt6 mb4">Setup Selesai!</div>
          <div class="xs muted mb10">Semua dependensi siap. MustLab bisa digunakan.</div>
          <button class="btn btn-g" onclick="PageSetup.finishSetup()">
            <i class="bi bi-arrow-right-circle-fill"></i> Mulai Gunakan MustLab
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
              <div class="flex g8 wrap mt8">
                ${[['Samsung','https://www.samsung.com/us/support/downloads/'],
                   ['Xiaomi','https://www.mi.com/global/service/support/'],
                   ['Oppo/Realme','https://www.oppo.com/en/support/'],
                   ['Universal ADB','https://adb.clockworkmod.com/']
                  ].map(([l,u])=>`
                  <span style="display:inline-flex;align-items:center;gap:5px;
                    cursor:pointer;border:1px solid var(--border2);border-radius:5px;
                    padding:3px 9px;font-size:11px;background:var(--surface2);color:var(--text2)"
                    onclick="window.api.system.openExternal('${u}')">
                    ${esc(l)}
                    <i class="bi bi-box-arrow-up-right" style="font-size:9px;color:var(--text3)"></i>
                  </span>`).join('')}
              </div>
            </div>
          </div>

          <!-- Panduan Emulator Android -->
          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <i class="bi bi-display" style="font-size:15px;flex-shrink:0;color:var(--text3);margin-top:2px"></i>
            <div style="width:100%">
              <div class="fw6 sm mb4">Gunakan Android Emulator (AVD)</div>
              <div class="xs muted" style="line-height:1.75;margin-bottom:8px">
                Emulator tidak butuh device fisik dan tidak ada masalah permission. Cocok untuk development & testing.
              </div>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${[
                  ['1', 'Install Android Studio', 'Download dari developer.android.com/studio', 'https://developer.android.com/studio'],
                  ['2', 'Buka Device Manager', 'Android Studio → More Actions → Device Manager (atau menu Tools → Device Manager)', null],
                  ['3', 'Buat Virtual Device', 'Klik "+" → Pilih Pixel 6 → Next → Pilih API 31+ (Android 12) → Download jika belum → Next → Finish', null],
                  ['4', 'Jalankan Emulator', 'Klik tombol ▶ di Device Manager. Tunggu boot ~1-2 menit pertama kali', null],
                  ['5', 'Cek di MustLab', 'Emulator otomatis terdeteksi sebagai "emulator-5554" di panel Device', null],
                ].map(([n,t,d,u]) => `
                  <div style="display:flex;gap:8px;align-items:flex-start;
                    background:var(--surface2);border-radius:6px;padding:7px 10px">
                    <div style="width:18px;height:18px;background:var(--blue);border-radius:50%;
                      color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;
                      justify-content:center;flex-shrink:0;margin-top:1px">${esc(n)}</div>
                    <div>
                      <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:2px">
                        ${esc(t)}
                        ${u ? `<span style="display:inline-flex;align-items:center;gap:3px;
                          cursor:pointer;color:var(--blue);font-weight:400;margin-left:6px;font-size:10px"
                          onclick="window.api.system.openExternal('${u}')">
                          Download <i class="bi bi-box-arrow-up-right" style="font-size:9px"></i>
                        </span>` : ''}
                      </div>
                      <div style="font-size:10px;color:var(--text3);line-height:1.5">${esc(d)}</div>
                    </div>
                  </div>`).join('')}
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

      <!-- iOS Simulator Section -->
      <div class="slbl mb8 mt12">
        <i class="bi bi-apple" style="margin-right:4px"></i>iOS Simulator (opsional — untuk testing iOS)
      </div>
      <div class="card">
        <div style="display:flex;flex-direction:column;gap:0">

          <!-- iOS deps status -->
          <div id="ios-deps-status" style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div class="xs muted">Memeriksa dependensi iOS...</div>
          </div>

          <!-- Step 1: Xcode -->
          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <span style="width:22px;height:22px;background:var(--blue);border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">1</span>
            <div style="width:100%">
              <div class="fw6 sm mb4">Install Xcode
                <span style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;color:var(--blue);font-weight:400;margin-left:6px;font-size:10px"
                  onclick="window.api.system.openExternal('https://apps.apple.com/app/xcode/id497799835')">
                  Buka App Store <i class="bi bi-box-arrow-up-right" style="font-size:9px"></i>
                </span>
              </div>
              <div class="xs muted" style="line-height:1.75">
                Download Xcode dari App Store (~15GB). Setelah selesai, buka Xcode sekali untuk accept license, lalu jalankan di terminal:<br>
              </div>
              <div style="background:#0d1117;border-radius:6px;padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;line-height:1.8;color:#e6edf3;margin-top:6px">
                <div><span style="color:#3fb950">~</span> sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer</div>
                <div><span style="color:#3fb950">~</span> sudo xcodebuild -license accept</div>
              </div>
            </div>
          </div>

          <!-- Step 2: Simulator Runtime -->
          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <span style="width:22px;height:22px;background:var(--blue);border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">2</span>
            <div>
              <div class="fw6 sm mb4">Download iOS Simulator Runtime</div>
              <div class="xs muted" style="line-height:1.75">
                Xcode → Settings (⌘,) → Platforms → klik (+) di bawah → pilih iOS versi terbaru → Download (~7GB).
                Atau via terminal:
              </div>
              <div style="background:#0d1117;border-radius:6px;padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;line-height:1.8;color:#e6edf3;margin-top:6px">
                <div><span style="color:#3fb950">~</span> xcodebuild -downloadPlatform iOS</div>
                <div><span style="color:#3fb950">~</span> open -a Simulator</div>
              </div>
            </div>
          </div>

          <!-- Step 3: Python + idb -->
          <div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
            <span style="width:22px;height:22px;background:var(--blue);border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">3</span>
            <div style="width:100%">
              <div class="fw6 sm mb4">Install idb — iOS Element Inspector</div>
              <div class="xs muted" style="line-height:1.75;margin-bottom:6px">
                idb (Facebook iOS Device Bridge) dibutuhkan untuk inspect element di iOS Simulator. Jalankan satu kali di terminal:
              </div>
              <div style="background:#0d1117;border-radius:6px;padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;line-height:1.9;color:#e6edf3">
                <div><span style="color:#8b949e"># 1. Install Homebrew (kalau belum ada)</span></div>
                <div><span style="color:#3fb950">~</span> /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"</div>
                <div style="margin-top:4px"><span style="color:#8b949e"># 2. Install idb companion (server)</span></div>
                <div><span style="color:#3fb950">~</span> brew tap facebook/fb && brew install idb-companion</div>
                <div style="margin-top:4px"><span style="color:#8b949e"># 3. Install Python 3.11 (idb client butuh 3.11, bukan 3.12+)</span></div>
                <div><span style="color:#3fb950">~</span> brew install python@3.11</div>
                <div style="margin-top:4px"><span style="color:#8b949e"># 4. Install idb client</span></div>
                <div><span style="color:#3fb950">~</span> brew install pipx && pipx ensurepath</div>
                <div><span style="color:#3fb950">~</span> pipx install fb-idb --python $(which python3.11)</div>
                <div style="margin-top:4px"><span style="color:#8b949e"># 5. Verifikasi</span></div>
                <div><span style="color:#3fb950">~</span> idb list-targets</div>
              </div>
            </div>
          </div>

          <!-- Step 4: Verifikasi -->
          <div style="display:flex;gap:12px;padding:12px 0">
            <span style="width:22px;height:22px;background:var(--blue);border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">4</span>
            <div>
              <div class="fw6 sm mb4">Boot simulator dan mulai testing</div>
              <div class="xs muted" style="line-height:1.75;margin-bottom:6px">
                Buka Simulator dari Xcode atau terminal. MustLab otomatis mendeteksi simulator yang Booted.
              </div>
              <div style="background:#0d1117;border-radius:6px;padding:8px 12px;font-family:'Courier New',monospace;font-size:10px;line-height:1.9;color:#e6edf3">
                <div><span style="color:#8b949e"># Boot simulator (atau buka dari Xcode menu)</span></div>
                <div><span style="color:#3fb950">~</span> open -a Simulator</div>
                <div style="margin-top:4px"><span style="color:#8b949e"># Cek simulator terdeteksi</span></div>
                <div><span style="color:#3fb950">~</span> xcrun simctl list devices | grep Booted</div>
                <div style="margin-top:4px"><span style="color:#8b949e"># Bundle ID app untuk test — contoh built-in apps:</span></div>
                <div><span style="color:#ffa657">Contacts</span>: com.apple.MobileAddressBook</div>
                <div><span style="color:#ffa657">Safari</span>&nbsp;&nbsp;: com.apple.mobilesafari</div>
                <div><span style="color:#ffa657">Notes</span>&nbsp;&nbsp;&nbsp;: com.apple.mobilenotes</div>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>`

    await checkDeps()
    await scanDevices()
    startDevicePoll()
    checkVersion()

    window.api.device.onUpdate((devices) => {
      _devices = devices
      AppState.devices = devices
      refreshDeviceList()
    })
  }

  // ── Version Check ──────────────────────────────────────────
  const GITHUB_API_LATEST = 'https://api.github.com/repos/damarmustikoaji/murbei/releases/latest'

  async function checkVersion() {
    try {
      const currentVersion = await window.api.system.getAppVersion().catch(() => '0.0.0')
      const res = await fetch(GITHUB_API_LATEST, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(8000)
      })
      // 404 = belum ada release, abaikan saja tanpa error
      if (res.status === 404) return
      if (!res.ok) return

      const data        = await res.json()
      const latest      = (data.tag_name || '').replace(/^v/, '')
      const note        = data.name || 'Versi terbaru tersedia'
      const date        = data.published_at ? data.published_at.slice(0, 10) : ''
      const body        = data.body || ''   // release notes dari GitHub
      const downloadUrl = data.assets?.[0]?.browser_download_url || ''

      if (!latest || latest === currentVersion) return

      // Tentukan level dari semver
      const [cMaj, cMin] = currentVersion.split('.').map(Number)
      const [lMaj, lMin] = latest.split('.').map(Number)
      const level = lMaj > cMaj ? 'major' : lMin > cMin ? 'minor' : 'minor'

      const levelCfg = {
        major: { bg:'#fff7ed', border:'#f97316', icon:'bi-exclamation-triangle-fill', color:'#ea580c', label:'⬆️ Update Major — Sangat disarankan' },
        minor: { bg:'#f0f6ff', border:'#3b7eed', icon:'bi-info-circle-fill',          color:'#2563eb', label:'ℹ️ Update Minor Tersedia' },
      }
      const cfg = levelCfg[level] || levelCfg.minor

      if (document.getElementById('version-banner')) return
      const stepsEl = document.getElementById('setup-steps')
      if (!stepsEl) return

      const banner = document.createElement('div')
      banner.id = 'version-banner'
      banner.style.cssText = `
        background:${cfg.bg};border:1px solid ${cfg.border};border-radius:10px;
        padding:12px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px`
      banner.innerHTML = `
        <i class="bi ${cfg.icon}" style="color:${cfg.color};font-size:18px;flex-shrink:0;margin-top:1px"></i>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px;color:${cfg.color};margin-bottom:3px">
            ${cfg.label}
          </div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:3px">${esc(note)}</div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:6px">
            Versi kamu: <code style="font-family:monospace;background:rgba(0,0,0,.06);padding:1px 4px;border-radius:3px">${esc(currentVersion)}</code>
            &nbsp;→&nbsp;
            Terbaru: <code style="font-family:monospace;background:rgba(0,0,0,.06);padding:1px 4px;border-radius:3px">${esc(latest)}</code>
            ${date ? `&nbsp;·&nbsp; ${esc(date)}` : ''}
          </div>
          ${body ? `
          <div style="font-size:10px;color:var(--text3);background:rgba(0,0,0,.04);
                      border-radius:5px;padding:6px 8px;margin-bottom:8px;
                      white-space:pre-wrap;line-height:1.5;max-height:80px;overflow-y:auto">
            ${esc(body)}
          </div>` : ''}
          ${downloadUrl ? `
          <button onclick="window.api.system.openExternal('${downloadUrl}')"
            style="background:${cfg.color};color:#fff;border:none;border-radius:5px;
                   padding:4px 10px;font-size:11px;cursor:pointer;font-weight:600">
            <i class="bi bi-download"></i> Download v${esc(latest)}
          </button>` : ''}
        </div>
        <button onclick="document.getElementById('version-banner').remove()"
          style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;
                 padding:0 4px;border-radius:4px;line-height:1" title="Tutup">✕</button>`

      stepsEl.parentNode.insertBefore(banner, stepsEl)
    } catch (err) {
      console.log('[setup] version check skipped:', err.message)
    }
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
  function renderStep(step, status, pct = 0, msg = '', foundPath = '') {
    const colors = { done:'var(--green)', active:'var(--blue)', error:'var(--red)', wait:'var(--text3)' }
    const icons  = { done:'check-circle-fill', active:'arrow-clockwise', error:'x-circle-fill', wait:'circle' }
    const bg     = { done:'var(--green-bg)', active:'var(--blue-bg)', error:'var(--red-bg)', wait:'var(--surface)' }
    const border = { done:'rgba(42,157,92,.3)', active:'rgba(59,126,237,.3)', error:'rgba(220,38,38,.3)', wait:'var(--border)' }
    const labels = { done:'Selesai', active: msg || 'Installing...', error:'Gagal', wait:'Menunggu' }

    // Kalau sudah done dan ada path aktual, tampilkan path nyata — bukan desc statis
    const descHtml = (status === 'done' && foundPath)
      ? `<span style="opacity:.7">Ditemukan di: </span><code style="font-family:var(--font-mono,monospace);font-size:9px;
          word-break:break-all;opacity:.85">${esc(foundPath)}</code>`
      : esc(step.desc)

    // Saat error, tampilkan hint dan tombol coba lagi
    const errorHint = status === 'error' ? `
      <div style="margin-top:6px;font-size:10px;color:var(--red);line-height:1.5">
        ${msg || 'Instalasi gagal.'} Pastikan koneksi internet aktif, lalu coba lagi.
      </div>
      <div style="margin-top:6px">
        <button class="btn btn-sm" style="background:var(--red);color:#fff;border:none;font-size:10px"
          onclick="PageSetup.startInstallStep('${step.key}')">
          <i class="bi bi-arrow-repeat"></i> Coba Lagi
        </button>
      </div>` : ''

    return `
    <div id="setup-step-${step.key}" style="display:flex;gap:10px;padding:11px 13px;border-radius:9px;border:1px solid ${border[status]};background:${bg[status]};margin-bottom:7px;transition:all .2s">
      <div style="width:30px;height:30px;border-radius:7px;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:16px;color:${colors[status]};flex-shrink:0;${status==='active'?'animation:spin .8s linear infinite':''}">
        <i class="bi bi-${icons[status]}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div class="fw6 sm">${esc(step.title)}</div>
        <div class="xs muted" style="line-height:1.6;word-break:break-word">${descHtml}</div>
        ${status==='active'?`<div class="pbar mt6"><div class="pbar-fill" id="pbar-${step.key}" style="width:${pct}%"></div></div>`:''}
        ${errorHint}
      </div>
      <div class="xs fw6" style="color:${colors[status]};flex-shrink:0">${labels[status]}</div>
    </div>`
  }

  function updateStep(key, status, pct = 0, msg = '', foundPath = '') {
    const el   = document.getElementById(`setup-step-${key}`)
    const step = STEPS.find(s => s.key === key)
    if (el && step) el.outerHTML = renderStep(step, status, pct, msg, foundPath)
  }

  async function checkDeps() {
    try {
      _depsStatus = await window.api.setup.checkDeps()
      for (const [key, result] of Object.entries(_depsStatus)) {
        if (['adb','java','maestro'].includes(key)) {
          updateStep(key, result.ok ? 'done' : 'wait', 0, '', result.ok ? (result.path || '') : '')
        }
      }

      // Maestro fix hint
      const maestro = _depsStatus.maestro
      if (maestro && !maestro.ok) _showMaestroFixButton(maestro.path)

      _setupDone = _depsStatus.adb?.ok && _depsStatus.java?.ok && _depsStatus.maestro?.ok
      if (_setupDone) {
        const doneBox  = document.getElementById('setup-done-box')
        const startBtn = document.getElementById('setup-start-btn')
        if (doneBox) doneBox.style.display = 'block'
        if (startBtn) startBtn.style.display = 'none'
      }

      // Render iOS deps status (macOS only)
      _renderIosDeps(_depsStatus)

    } catch (err) {
      console.warn('[setup] checkDeps error:', err)
    }
  }

  function _renderIosDeps(deps) {
    const el = document.getElementById('ios-deps-status')
    if (!el) return

    const isMac = navigator.platform.startsWith('Mac') || navigator.userAgent.includes('Mac')
    if (!isMac) {
      el.innerHTML = `<div class="xs muted">iOS Simulator hanya tersedia di macOS.</div>`
      return
    }

    const items = [
      { key: 'xcode',        label: 'Xcode',         icon: 'bi-apple' },
      { key: 'idbCompanion', label: 'idb-companion',  icon: 'bi-braces' },
      { key: 'idb',          label: 'idb (client)',   icon: 'bi-braces-asterisk' },
    ]

    el.innerHTML = `
      <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:8px">
        Status dependensi iOS
        ${deps.xcode && deps.idbCompanion && deps.idb && deps.xcode.ok && deps.idbCompanion.ok && deps.idb.ok
          ? '<span style="color:var(--green);margin-left:8px">✓ Semua siap</span>'
          : '<span style="color:var(--yellow);margin-left:8px">⚠️ Belum lengkap — ikuti panduan di bawah</span>'}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${items.map(item => {
          const d = deps[item.key]
          const ok = d?.ok
          return `
          <div style="display:flex;align-items:center;gap:5px;padding:4px 10px;
            border-radius:6px;font-size:11px;
            background:${ok?'var(--green-bg)':'var(--surface2)'};
            border:1px solid ${ok?'rgba(42,157,92,.2)':'var(--border)'}">
            <i class="bi ${ok?'bi-check-circle-fill':'bi-circle'}"
              style="color:${ok?'var(--green)':'var(--text3)'}"></i>
            <span style="color:${ok?'var(--green)':'var(--text2)'}">${item.label}</span>
            ${ok&&d.path ? `<span style="font-size:9px;color:var(--text3);font-family:monospace;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.path.replace(/^\/Users\/[^/]+/,'~')}</span>` : ''}
          </div>`
        }).join('')}
      </div>`
  }

  function _showMaestroFixButton(maestroPath) {
    const el = document.getElementById('setup-step-maestro')
    if (!el) return
    // Tambah info dan tombol fix di bawah step maestro
    const existing = document.getElementById('maestro-fix-hint')
    if (existing) return  // sudah ada

    const hint = document.createElement('div')
    hint.id = 'maestro-fix-hint'
    hint.style.cssText = 'margin-top:6px'
    hint.innerHTML = `
      <div style="background:var(--yellow-bg);border:1px solid rgba(196,125,14,.2);border-radius:7px;padding:8px 11px;font-size:11px;color:var(--text2)">
        <i class="bi bi-exclamation-triangle-fill" style="color:var(--yellow)"></i>
        File Maestro ada di <code style="font-size:10px;font-family:monospace">${esc(maestroPath)}</code>
        tapi tidak bisa dieksekusi.
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm" style="background:var(--yellow);color:#fff;border:none"
            onclick="PageSetup.fixMaestroPermission()">
            <i class="bi bi-wrench"></i> Fix Permission (+x)
          </button>
          <button class="btn btn-d btn-sm" onclick="PageSetup.startInstallStep('maestro')">
            <i class="bi bi-arrow-repeat"></i> Install Ulang
          </button>
        </div>
      </div>`
    el.after(hint)
  }

  async function fixMaestroPermission() {
    toast('🔧 Fixing Maestro permission...')
    try {
      const result = await window.api.setup.fixMaestro()
      if (result?.ok) {
        const hint = document.getElementById('maestro-fix-hint')
        if (hint) hint.remove()
        toast('✅ Permission diperbaiki! Cek ulang status...')
        await checkDeps()
      } else {
        toast(`Gagal: ${result?.error || 'unknown'}`, 'error')
      }
    } catch (err) {
      toast(`Error: ${err.message}`, 'error')
    }
  }

  async function startInstallStep(step) {
    // Install ulang satu step saja
    _installing = true
    try {
      window.api.setup.onProgress((payload) => {
        const { step: s, status, pct, msg } = payload
        if (status === 'start')         updateStep(s, 'active', 0, msg)
        else if (status === 'progress') {
          const pb = document.getElementById('pbar-' + s)
          if (pb) pb.style.width = pct + '%'
        }
        else if (status === 'done')     updateStep(s, 'done', 100, msg)
        else if (status === 'error')    updateStep(s, 'error', 0, msg)
      })
      await window.api.setup.install(step)
      await checkDeps()
    } catch (err) {
      toast(`Install ${step} gagal: ${err.message}`, 'error')
    } finally {
      _installing = false
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

  return { render, startInstall, finishSetup, scanDevices, useDevice, checkVersion, fixMaestroPermission, startInstallStep }
})()