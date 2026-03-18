/* pages/testrun.js — Test Run Management */
window.PageTestRun = (() => {
  'use strict'

  // ── State ──────────────────────────────────────────────────
  let _view      = 'list'   // 'list' | 'create' | 'detail'
  let _runs      = []
  let _activeRun = null     // run sedang dibuat / dilihat
  let _tcResults = []       // hasil TC run aktif
  let _projects  = []
  let _allTCs    = []
  let _selTCs    = new Set()
  let _selProj   = null
  let _selSerial = null
  let _isRunning = false

  // ── Entry ──────────────────────────────────────────────────
  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    content.className = 'content-area no-pad'

    _projects = await window.api.db.getProjects().catch(() => [])
    if (!_selProj && _projects.length) _selProj = _projects[0].id

    if (_view === 'list')   return _renderList(content, ta)
    if (_view === 'create') return _renderCreate(content, ta)
    if (_view === 'detail') return _renderDetail(content, ta)
  }

  // ────────────────────────────────────────────────────────────
  // VIEW: LIST — daftar semua test run
  // ────────────────────────────────────────────────────────────
  async function _renderList(content, ta) {
    ta.innerHTML = `
      <button class="btn btn-p btn-sm" onclick="PageTestRun.openCreate()">
        <i class="bi bi-plus-lg"></i> Test Run Baru
      </button>`

    // Load SEMUA runs dari semua project
    _runs = await window.api.db.getAllRuns().catch(() => [])

    // Buat map project id → name untuk label di kartu
    const projMap = {}
    _projects.forEach(p => { projMap[p.id] = p.name })

    content.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

      <!-- Header minimal — dihapus label "Semua Test Run" -->
      <div style="padding:8px 20px;border-bottom:1px solid var(--border);
        background:var(--surface);display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span style="font-size:11px;color:var(--text3)">
          ${_runs.length} test run${_runs.length!==1?'s':''}
        </span>
      </div>

      <!-- Run list -->
      <div style="flex:1;overflow-y:auto;padding:16px 20px">
        ${_runs.length ? _runs.map(r => _runCard(r, projMap[r.project_id])).join('') : `
          <div style="text-align:center;padding:60px 20px;color:var(--text3)">
            <i class="bi bi-play-circle" style="font-size:3rem;display:block;margin-bottom:12px;opacity:.3"></i>
            <div style="font-size:14px;font-weight:600;margin-bottom:6px">Belum ada Test Run</div>
            <div style="font-size:12px;margin-bottom:20px">Buat test run pertama untuk menjalankan test case</div>
            <button class="btn btn-p" onclick="PageTestRun.openCreate()">
              <i class="bi bi-plus-lg"></i> Buat Test Run
            </button>
          </div>`}
      </div>
    </div>`
  }

  function _runCard(r, projName) {
    const statusColor = r.status==='pass' ? '#16a34a' : r.status==='fail' ? '#dc2626' :
                        r.status==='running' ? '#2563eb' : '#6b7280'
    const statusBg    = r.status==='pass' ? '#dcfce7' : r.status==='fail' ? '#fee2e2' :
                        r.status==='running' ? '#dbeafe' : '#f3f4f6'
    const total = (r.pass||0) + (r.fail||0)
    const dur   = r.duration_ms ? _fmtDuration(r.duration_ms) : '—'
    const date  = r.created_at ? new Date(r.created_at).toLocaleString('id-ID',
      {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'

    return `
    <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;
      margin-bottom:10px;background:var(--surface);cursor:pointer;transition:box-shadow .1s"
      onclick="PageTestRun.openDetail('${esc(r.id)}')"
      onmouseenter="this.style.boxShadow='var(--sh2)'" onmouseleave="this.style.boxShadow=''">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6px">
        <div style="flex:1;min-width:0;margin-right:10px">
          <div style="font-size:13px;font-weight:700;margin-bottom:3px;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap">${esc(r.plan_name)}</div>
          <div style="font-size:11px;color:var(--text3);display:flex;gap:8px;flex-wrap:wrap">
            ${projName ? `<span><i class="bi bi-folder2"></i> ${esc(projName)}</span>` : ''}
            ${r.device ? `<span><i class="bi bi-phone"></i> ${esc(r.device)}</span>` : ''}
            <span><i class="bi bi-clock"></i> ${date}</span>
            ${r.duration_ms ? `<span><i class="bi bi-stopwatch"></i> ${dur}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:5px;
            background:${statusBg};color:${statusColor};text-transform:uppercase">
            ${r.status==='pending'?'Untested':r.status==='running'?'Running':r.status?.toUpperCase()||'Untested'}
          </span>
          <button onclick="event.stopPropagation();PageTestRun.deleteRun('${esc(r.id)}')"
            style="background:none;border:none;cursor:pointer;color:var(--text3);
              font-size:13px;padding:2px 5px;border-radius:4px;transition:color .1s"
            onmouseenter="this.style.color='var(--red)'" onmouseleave="this.style.color='var(--text3)'"
            title="Hapus run">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
      ${total ? `
      <div style="display:flex;gap:10px;align-items:center;margin-top:4px">
        <span style="font-size:11px;color:#16a34a;font-weight:600">
          <i class="bi bi-check-circle"></i> ${r.pass||0} PASS
        </span>
        <span style="font-size:11px;color:#dc2626;font-weight:600">
          <i class="bi bi-x-circle"></i> ${r.fail||0} FAIL
        </span>
        <div style="flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden">
          <div style="height:100%;background:#16a34a;
            width:${Math.round((r.pass||0)/total*100)}%;transition:width .3s"></div>
        </div>
      </div>` : ''}
    </div>`
  }

  // ────────────────────────────────────────────────────────────
  // VIEW: CREATE — form buat/susun test run
  // ────────────────────────────────────────────────────────────
  async function _renderCreate(content, ta) {
    ta.innerHTML = `
      <button class="btn btn-d btn-sm" onclick="PageTestRun.backToList()">
        <i class="bi bi-arrow-left"></i> Kembali
      </button>
      <button class="btn btn-d btn-sm" onclick="PageTestRun.saveRunOnly()">
        <i class="bi bi-save"></i> Simpan
      </button>
      <button class="btn btn-p btn-sm" id="run-btn" onclick="PageTestRun.startRun()">
        <i class="bi bi-play-fill"></i> Jalankan
      </button>`

    // Load TCs dari project yang dipilih
    _allTCs = _selProj ? await _getAllTCs(_selProj) : []
    const devices     = AppState.devices || []
    const online      = devices.filter(d => d.online)
    const envs        = await window.api.db.getEnvs().catch(() => [])
    const evidenceDir = await window.api.db.getSetting('evidence_dir').catch(() => '') || ''
    if (!_selSerial && online.length) _selSerial = AppState.connectedDevice?.serial || online[0]?.serial

    content.innerHTML = `
    <div style="display:flex;height:100%;overflow:hidden">

      <!-- Kiri: Project + TC picker -->
      <div style="width:240px;flex-shrink:0;border-right:1px solid var(--border);
        display:flex;flex-direction:column;background:var(--surface)">

        <!-- Project selector -->
        <div style="padding:10px 12px;border-bottom:1px solid var(--border);background:var(--surface2)">
          <label style="font-size:10px;font-weight:700;color:var(--text3);
            text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:5px">
            Project
          </label>
          <select style="width:100%;font-size:11px" onchange="PageTestRun.changeProject(this.value)">
            ${_projects.length
              ? _projects.map(p => `<option value="${p.id}" ${p.id===_selProj?'selected':''}>${esc(p.name)}</option>`).join('')
              : '<option>Belum ada project</option>'}
          </select>
        </div>

        <!-- Search TC -->
        <div style="padding:6px 10px;border-bottom:1px solid var(--border)">
          <input type="text" id="tc-filter" style="width:100%;font-size:11px"
            placeholder="🔍 Filter test case..."
            oninput="PageTestRun.filterTCs(this.value)">
        </div>

        <!-- TC list -->
        <div id="tc-pick" style="flex:1;overflow-y:auto">${_renderPicker(_allTCs)}</div>

        <!-- Footer count -->
        <div style="padding:6px 10px;border-top:1px solid var(--border);background:var(--surface2);
          display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:11px;color:var(--text3)" data-sel-count>
            <i class="bi bi-check2-square"></i> ${_selTCs.size} dipilih
          </span>
          <div style="display:flex;gap:4px">
            <button class="btn btn-xs btn-gh" onclick="PageTestRun.selAll(true)">Semua</button>
            <button class="btn btn-xs btn-gh" onclick="PageTestRun.selAll(false)">Clear</button>
          </div>
        </div>
      </div>

      <!-- Tengah: Konfigurasi Run -->
      <div style="width:260px;flex-shrink:0;border-right:1px solid var(--border);
        overflow-y:auto;background:var(--surface)">
        <div style="padding:12px 14px;display:flex;flex-direction:column;gap:14px">

          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text3);
              text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:5px">
              Nama Run
            </label>
            <input type="text" id="run-name" value="Test Run" style="width:100%;font-size:12px"
              oninput="PageTestRun._planName=this.value">
          </div>

          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text3);
              text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:5px">
              Device
            </label>
            ${online.length ? `
              <select id="run-device" style="width:100%;font-size:11px"
                onchange="PageTestRun.selectDevice(this.value)">
                ${online.map(d => `<option value="${esc(d.serial)}" ${d.serial===_selSerial?'selected':''}>
                  ${esc(d.model||d.serial)}</option>`).join('')}
              </select>
              <div style="font-size:10px;color:var(--green);margin-top:3px">
                <i class="bi bi-circle-fill" style="font-size:6px"></i>
                ${online.length} device online
              </div>` : `
              <div style="background:var(--yellow-bg);border:1px solid rgba(196,125,14,.2);
                border-radius:6px;padding:7px 10px;font-size:11px;color:var(--yellow)">
                <i class="bi bi-exclamation-triangle"></i> Belum ada device.
                <span style="color:var(--blue);cursor:pointer;text-decoration:underline"
                  onclick="navigate('inspector')">Hubungkan →</span>
              </div>`}
          </div>

          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text3);
              text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:5px">
              Environment
            </label>
            <select id="run-env" style="width:100%;font-size:11px">
              <option value="">-- Tanpa environment --</option>
              ${envs.map(e => `<option value="${e.id}" ${e.is_active?'selected':''}>${esc(e.name)}</option>`).join('')}
            </select>
          </div>

          <div style="height:1px;background:var(--border)"></div>

          <div>
            <label style="font-size:10px;font-weight:700;color:var(--text3);
              text-transform:uppercase;letter-spacing:.4px;display:block;margin-bottom:8px">
              <i class="bi bi-folder-fill" style="color:var(--yellow)"></i> Evidence
            </label>
            <div style="margin-bottom:8px">
              <div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:4px">Folder Simpan</div>
              <div style="display:flex;gap:5px">
                <input type="text" id="ev-dir" value="${esc(evidenceDir)}"
                  placeholder="~/Desktop/testpilot-evidence" readonly
                  style="flex:1;font-size:10px;font-family:var(--font-mono);
                    background:var(--surface2);cursor:pointer"
                  onclick="PageTestRun.pickEvidenceDir()">
                <button class="btn btn-d btn-sm" onclick="PageTestRun.pickEvidenceDir()"
                  title="Pilih folder"><i class="bi bi-folder2-open"></i></button>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                <input type="checkbox" id="ev-ss-step" checked style="accent-color:var(--blue)">
                Screenshot per step
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:11px;cursor:pointer">
                <input type="checkbox" id="ev-ss-fail" style="accent-color:var(--blue)">
                Screenshot saat gagal saja
              </label>
            </div>
          </div>

        </div>
      </div>

      <!-- Kanan: Preview TC yang dipilih -->
      <div style="flex:1;min-width:0;overflow-y:auto;padding:16px">
        <div style="font-size:12px;font-weight:700;margin-bottom:10px;color:var(--text2)">
          <i class="bi bi-list-check"></i> TC yang akan dijalankan
          <span style="font-weight:400;color:var(--text3)">(${_selTCs.size})</span>
        </div>
        <div id="tc-preview">
          ${_selTCs.size
            ? Array.from(_selTCs).map((id,i) => {
                const tc = _allTCs.find(t => t.id === id)
                return tc ? _tcPreviewRow(tc, i) : ''
              }).join('')
            : `<div style="text-align:center;padding:32px;color:var(--text3)">
                <i class="bi bi-hand-index" style="font-size:1.5rem;display:block;
                  margin-bottom:8px;opacity:.4"></i>
                <div style="font-size:12px">Centang TC dari panel kiri</div>
              </div>`}
        </div>
      </div>
    </div>`
  }

  function _tcPreviewRow(tc, i) {
    const steps = tc.steps_json ? (() => { try { return JSON.parse(tc.steps_json) } catch { return [] } })() : []
    return `
    <div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;
        background:var(--surface);cursor:pointer"
        onclick="this.nextElementSibling.style.display=
          this.nextElementSibling.style.display==='none'?'block':'none';
          this.querySelector('.chev').style.transform=
          this.nextElementSibling.style.display==='block'?'rotate(180deg)':''">
        <div style="width:22px;height:22px;border-radius:50%;background:var(--blue-bg);
          color:var(--blue);font-size:10px;font-weight:700;display:flex;align-items:center;
          justify-content:center;flex-shrink:0">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;
            white-space:nowrap">${esc(tc.name)}</div>
          <div style="font-size:10px;color:var(--text3)">${steps.length||tc.steps_count||0} steps · ${esc(tc.priority||'medium')}</div>
        </div>
        <i class="bi bi-chevron-down chev" style="font-size:10px;color:var(--text3);transition:transform .15s"></i>
      </div>
      <div style="display:none;padding:8px 12px;border-top:1px solid var(--border);background:var(--surface2)">
        ${steps.length ? steps.map((s,si) => `
          <div style="display:flex;align-items:center;gap:7px;padding:4px 0;
            border-bottom:1px solid var(--border);font-size:11px">
            <span style="color:var(--text3);font-weight:600;min-width:18px;text-align:right">${si+1}</span>
            <span style="background:var(--surface3);border-radius:4px;padding:1px 6px;
              font-size:10px;font-weight:600;color:var(--text2)">${esc(s.action||'?')}</span>
            <span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${esc(s.params?.selector||s.params?.package||s.params?.expected||s.params?.value||'')}</span>
          </div>`).join('') : `
          <div style="font-size:11px;color:var(--text3);padding:4px 0">
            ${tc.dsl_yaml ? '✓ Punya DSL YAML' : '⚠ Tidak ada steps_json — run tetap bisa dijalankan dari DSL'}
          </div>`}
      </div>
    </div>`
  }

  // ────────────────────────────────────────────────────────────
  // VIEW: DETAIL — hasil run
  // ────────────────────────────────────────────────────────────
  async function _renderDetail(content, ta) {
    if (!_activeRun) { _view = 'list'; return render() }

    ta.innerHTML = `
      <button class="btn btn-d btn-sm" onclick="PageTestRun.backToList()">
        <i class="bi bi-arrow-left"></i> Semua Run
      </button>
      ${!_isRunning ? `
      <button class="btn btn-p btn-sm" id="run-btn" onclick="PageTestRun.reRun()">
        <i class="bi bi-arrow-repeat"></i> Jalankan Ulang
      </button>` : `
      <button class="btn btn-d btn-sm" disabled>
        <i class="bi bi-arrow-clockwise" style="animation:spin .7s linear infinite"></i> Running...
      </button>`}`

    const statusColor = _activeRun.status==='pass' ? '#16a34a' : _activeRun.status==='fail' ? '#dc2626' :
                        _activeRun.status==='running' ? '#2563eb' : '#6b7280'
    const statusBg    = _activeRun.status==='pass' ? '#dcfce7' : _activeRun.status==='fail' ? '#fee2e2' :
                        _activeRun.status==='running' ? '#dbeafe' : '#f3f4f6'
    const total = (_activeRun.pass||0) + (_activeRun.fail||0)
    const dur   = _activeRun.duration_ms ? _fmtDuration(_activeRun.duration_ms) : '—'

    content.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

      <!-- Run header info -->
      <div style="padding:12px 20px;border-bottom:1px solid var(--border);background:var(--surface);
        display:flex;align-items:center;gap:16px;flex-shrink:0;flex-wrap:wrap">
        <div>
          <div style="font-size:15px;font-weight:700">${esc(_activeRun.plan_name)}</div>
          <div style="font-size:11px;color:var(--text3)">
            <i class="bi bi-phone"></i> ${esc(_activeRun.device||'—')}
            &nbsp;·&nbsp;<i class="bi bi-clock"></i> ${_activeRun.started_at ? new Date(_activeRun.started_at).toLocaleString('id-ID') : '—'}
            &nbsp;·&nbsp;<i class="bi bi-stopwatch"></i> ${dur}
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-left:auto;align-items:center">
          ${total ? `
          <div style="display:flex;gap:8px">
            <span style="font-size:12px;font-weight:700;color:#16a34a">${_activeRun.pass||0} PASS</span>
            <span style="font-size:12px;font-weight:700;color:#dc2626">${_activeRun.fail||0} FAIL</span>
          </div>` : ''}
          <span style="font-size:11px;font-weight:700;padding:4px 12px;border-radius:6px;
            background:${statusBg};color:${statusColor};text-transform:uppercase">
            ${_activeRun.status||'pending'}
          </span>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="height:3px;background:var(--border);flex-shrink:0">
        <div id="run-pbar" style="height:100%;background:var(--blue);
          width:${total?Math.round((_activeRun.pass||0)/total*100):0}%;transition:width .3s"></div>
      </div>

      <div style="flex:1;display:flex;min-height:0;overflow:hidden">

        <!-- TC Results list -->
        <div style="flex:1;overflow-y:auto;padding:14px 20px">
          <div id="tc-results">
            ${_tcResults.length ? _tcResults.map((r,i) => _tcResultRow(r, i)).join('') : `
              <div style="text-align:center;padding:32px;color:var(--text3)">
                <i class="bi bi-hourglass" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:.4"></i>
                <div style="font-size:12px">Belum ada hasil TC</div>
              </div>`}
          </div>
        </div>

        <!-- Run Log -->
        <div style="width:380px;flex-shrink:0;border-left:1px solid var(--border);
          background:#0d1117;display:flex;flex-direction:column">
          <div style="padding:6px 14px;background:#161b22;border-bottom:1px solid #30363d;
            display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <span style="font-size:10px;font-weight:600;color:#8b949e">
              <i class="bi bi-terminal"></i> Run Log
            </span>
            <div style="display:flex;gap:6px;align-items:center">
              <span id="log-count" style="font-size:9px;color:#8b949e"></span>
              <button onclick="document.getElementById('main-log').innerHTML=''"
                style="background:none;border:none;cursor:pointer;color:#8b949e;font-size:10px">Clear</button>
            </div>
          </div>
          <div id="main-log" style="flex:1;overflow-y:auto;padding:10px 14px;
            font-family:'Geist Mono',monospace;font-size:11px;line-height:1.9;color:#e6edf3">
            <div style="color:#8b949e;font-style:italic">Log muncul saat test berjalan...</div>
          </div>
        </div>

      </div>
    </div>`
  }

  function _tcResultRow(r, i) {
    const ok = r.status === 'pass'
    const running = r.status === 'running'
    const untested = r.status === 'pending'
    const steps = r.step_logs || []

    // Untuk untested, coba ambil steps dari TC definition di _allTCs
    const tcDef = _allTCs.find(t => t.id === r.tc_id)
    const tcSteps = tcDef?.steps_json
      ? (() => { try { return JSON.parse(tcDef.steps_json) } catch { return [] } })()
      : []

    const borderColor = ok ? '#16a34a' : running ? '#2563eb' : r.status==='fail' ? '#dc2626' : 'var(--border)'
    const numBg = ok ? '#16a34a' : running ? '#2563eb' : r.status==='fail' ? '#dc2626' : 'var(--surface3)'
    const numColor = ['pass','fail','running'].includes(r.status) ? '#fff' : 'var(--text3)'

    return `
    <div id="tcr-${esc(r.id||r.tc_id+i)}"
      style="border:1px solid ${borderColor};border-radius:8px;margin-bottom:8px;overflow:hidden;
        transition:border-color .2s">
      <!-- TC Header -->
      <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;
        background:var(--surface);cursor:pointer"
        onclick="PageTestRun.toggleTcDetail('${esc(r.id||r.tc_id+i)}')">
        <div id="tcr-num-${esc(r.id||r.tc_id+i)}"
          style="width:24px;height:24px;border-radius:50%;
            background:${numBg};color:${numColor};
            font-size:10px;font-weight:700;display:flex;align-items:center;
            justify-content:center;flex-shrink:0">
          ${running ? '<i class="bi bi-arrow-clockwise" style="animation:spin .7s linear infinite;font-size:11px"></i>' : (i+1)}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;
            white-space:nowrap">${esc(r.tc_name)}</div>
          ${r.duration_ms ? `<div style="font-size:10px;color:var(--text3)">
            <i class="bi bi-stopwatch"></i> ${_fmtDuration(r.duration_ms)}
          </div>` : ''}
        </div>
        <span id="tcr-badge-${esc(r.id||r.tc_id+i)}"
          style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:5px;
            background:${ok?'#dcfce7':running?'#dbeafe':r.status==='fail'?'#fee2e2':'#f3f4f6'};
            color:${ok?'#16a34a':running?'#2563eb':r.status==='fail'?'#dc2626':'#6b7280'}">
          ${r.status==='pending'?'Untested':r.status==='running'?'Running':r.status?.toUpperCase()||'Untested'}
        </span>
        <i class="bi bi-chevron-down" id="tcr-chev-${esc(r.id||r.tc_id+i)}"
          style="font-size:10px;color:var(--text3);transition:transform .15s;flex-shrink:0"></i>
      </div>

      <!-- TC Detail (collapse) -->
      <div id="tcr-detail-${esc(r.id||r.tc_id+i)}"
        style="display:none;border-top:1px solid var(--border);background:var(--surface2)">

        ${r.error_msg ? `
          <div style="padding:8px 14px;background:#fee2e2;border-bottom:1px solid rgba(220,38,38,.2)">
            <div style="font-size:11px;color:#dc2626;font-weight:600;margin-bottom:3px">
              <i class="bi bi-exclamation-circle"></i> Error
            </div>
            <div style="font-size:11px;color:#991b1b;font-family:var(--font-mono)">
              ${esc(r.error_msg)}
            </div>
          </div>` : ''}

        <!-- Steps: log steps kalau sudah run, scenario steps kalau untested -->
        ${steps.length ? `
          <div style="padding:8px 14px">
            <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;
              letter-spacing:.4px;margin-bottom:6px">
              Log Steps (${steps.length})
            </div>
            ${steps.map((s, si) => {
              const isPass = s.status === 'pass'
              const isFail = s.status === 'fail'
              return `
              <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;
                border-bottom:1px solid var(--border)">
                <span style="font-size:9px;color:#8b949e;flex-shrink:0;font-family:monospace;
                  margin-top:2px;min-width:44px">${s.time||''}</span>
                <div style="width:16px;height:16px;border-radius:50%;flex-shrink:0;
                  background:${isPass?'#dcfce7':isFail?'#fee2e2':'var(--surface3)'};
                  display:flex;align-items:center;justify-content:center;margin-top:1px">
                  <i class="bi bi-${isPass?'check-lg':isFail?'x-lg':'dash'}"
                    style="font-size:8px;color:${isPass?'#16a34a':isFail?'#dc2626':'#8b949e'}"></i>
                </div>
                <span style="flex:1;font-size:11px;color:${isPass?'var(--green)':isFail?'var(--red)':'var(--text2)'};
                  word-break:break-word">${esc(s.msg||s.action||'')}</span>
              </div>`
            }).join('')}
          </div>` : untested && tcSteps.length ? `
          <div style="padding:8px 14px">
            <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;
              letter-spacing:.4px;margin-bottom:6px">
              Skenario (${tcSteps.length} steps)
            </div>
            ${tcSteps.map((s, si) => `
              <div style="display:flex;align-items:center;gap:8px;padding:5px 0;
                border-bottom:1px solid var(--border)">
                <span style="width:18px;height:18px;border-radius:50%;background:var(--surface3);
                  color:var(--text3);font-size:9px;font-weight:700;display:flex;align-items:center;
                  justify-content:center;flex-shrink:0">${si+1}</span>
                <span style="background:var(--blue-bg);color:var(--blue);font-size:10px;
                  font-weight:600;padding:1px 6px;border-radius:4px;flex-shrink:0">
                  ${esc(s.action||'?')}
                </span>
                <span style="font-size:11px;color:var(--text2);overflow:hidden;
                  text-overflow:ellipsis;white-space:nowrap;flex:1">
                  ${esc(s.params?.selector||s.params?.package||s.params?.expected||s.params?.value||'')}
                </span>
                <span style="font-size:9px;color:var(--text3);flex-shrink:0">Untested</span>
              </div>`).join('')}
          </div>` : `
          <div style="padding:10px 14px;font-size:11px;color:var(--text3);text-align:center">
            ${running
              ? '<i class="bi bi-arrow-clockwise" style="animation:spin .7s linear infinite"></i> Menunggu log steps...'
              : untested
              ? '<i class="bi bi-hourglass"></i> Untested — belum dijalankan'
              : '<i class="bi bi-info-circle"></i> Log steps tidak tersedia'}
          </div>`}

        <!-- Evidence -->
        ${r.evidence && Object.keys(r.evidence).length ? `
          <div style="padding:8px 14px;border-top:1px solid var(--border)">
            <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;
              letter-spacing:.4px;margin-bottom:6px">Evidence</div>
            <div style="display:flex;align-items:center;gap:6px">
              <code style="font-size:10px;font-family:var(--font-mono);flex:1;overflow:hidden;
                text-overflow:ellipsis;white-space:nowrap;background:var(--surface3);
                padding:3px 7px;border-radius:4px">
                ${esc(r.evidence.folder||'')}
              </code>
              ${r.evidence.folder ? `
                <button class="btn btn-xs btn-d"
                  onclick="window.api.system.openExternal('${esc(r.evidence.folder)}')"
                  title="Buka di Finder"><i class="bi bi-folder2-open"></i></button>` : ''}
            </div>
          </div>` : ''}
      </div>
    </div>`
  }

  // ── Controls ──────────────────────────────────────────────────
  function toggleTcDetail(id) {
    const det  = document.getElementById('tcr-detail-'+id)
    const chev = document.getElementById('tcr-chev-'+id)
    if (!det) return
    const open = det.style.display === 'none'
    det.style.display = open ? 'block' : 'none'
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : ''
  }

  async function switchProject(id) {
    _selProj = id; _selTCs.clear()
    _allTCs = await _getAllTCs(id)
    _runs   = await window.api.db.getRuns(id).catch(() => [])
    render()
  }

  async function changeProject(id) {
    _selProj = id; _selTCs.clear()
    _allTCs = await _getAllTCs(id)
    const el = document.getElementById('tc-pick')
    if (el) el.innerHTML = _renderPicker(_allTCs)
    const preview = document.getElementById('tc-preview')
    if (preview) preview.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3)">
      <i class="bi bi-hand-index" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:.4"></i>
      <div style="font-size:12px">Centang TC dari panel kiri</div></div>`
  }

  async function saveRunOnly() {
    const runName = document.getElementById('run-name')?.value.trim() || 'Test Run'
    const envId   = document.getElementById('run-env')?.value
    const envs    = await window.api.db.getEnvs().catch(() => [])
    const env     = envs.find(e => e.id === envId)
    const serial  = document.getElementById('run-device')?.value || _selSerial || ''
    const devInfo = AppState.devices?.find(d => d.serial === serial)

    if (!_selProj) { toast('⚠️ Pilih project dulu', 'error'); return }

    const run = await window.api.db.saveRun({
      project_id:  _selProj,
      plan_name:   runName,
      run_type:    'custom',
      device:      devInfo?.model || serial || '',
      environment: env?.name || '',
      status:      'pending',
    }).catch(err => { toast('Gagal simpan: ' + err.message, 'error'); return null })

    if (!run) return

    // Simpan TC yang dipilih sebagai tc_results dengan status pending
    for (const tcId of _selTCs) {
      const tc = _allTCs.find(t => t.id === tcId)
      if (tc) {
        await window.api.db.saveTcResult({
          run_id: run.id, tc_id: tc.id, tc_name: tc.name, status: 'pending',
        }).catch(() => {})
      }
    }

    toast(`✅ Test Run disimpan — ${_selTCs.size} TC, status: Untested`)
    _view = 'list'
    render()
  }

  function selectDevice(serial) {
    _selSerial = serial
    const dev = AppState.devices?.find(d => d.serial === serial)
    if (dev) AppState.setConnectedDevice(dev)
  }

  function filterTCs(q) {
    const el = document.getElementById('tc-pick')
    if (!el) return
    el.innerHTML = _renderPicker(q ? _allTCs.filter(tc =>
      tc.name.toLowerCase().includes(q.toLowerCase())) : _allTCs)
  }

  function togTC(id) {
    if (_selTCs.has(id)) _selTCs.delete(id)
    else _selTCs.add(id)
    // Update picker state tanpa full re-render
    document.querySelectorAll('[data-tc-id]').forEach(el => {
      const isSelected = _selTCs.has(el.dataset.tcId)
      el.style.background = isSelected ? 'var(--blue-bg)' : 'transparent'
      el.querySelector('input[type=checkbox]').checked = isSelected
      el.querySelector('.tc-name').style.color = isSelected ? 'var(--blue)' : 'var(--text)'
    })
    // Update preview
    const preview = document.getElementById('tc-preview')
    if (preview) {
      preview.innerHTML = _selTCs.size ? Array.from(_selTCs).map((id,i) => {
        const tc = _allTCs.find(t => t.id === id)
        return tc ? _tcPreviewRow(tc, i) : ''
      }).join('') : `<div style="text-align:center;padding:32px;color:var(--text3)">
        <i class="bi bi-hand-index" style="font-size:1.5rem;display:block;margin-bottom:8px;opacity:.4"></i>
        <div style="font-size:12px">Centang TC dari panel kiri</div></div>`
    }
    const footer = document.querySelector('[data-sel-count]')
    if (footer) footer.textContent = `${_selTCs.size} dipilih`
  }

  function selAll(yes) {
    if (yes) _allTCs.forEach(tc => _selTCs.add(tc.id))
    else _selTCs.clear()
    render()
  }

  async function pickEvidenceDir() {
    const res = await window.api.system.openFileDialog({
      properties: ['openDirectory','createDirectory'],
      title: 'Pilih folder evidence',
    }).catch(() => null)
    if (res?.canceled || !res?.filePaths?.length) return
    const dir = res.filePaths[0]
    await window.api.db.setSetting('evidence_dir', dir)
    const inp = document.getElementById('ev-dir')
    if (inp) inp.value = dir
    toast(`✅ Evidence folder: ${dir}`)
  }

  function openCreate() {
    _view = 'create'
    _selTCs.clear()
    render()
  }

  function backToList() {
    _view = 'list'
    _activeRun = null
    _tcResults = []
    _isRunning = false
    render()
  }

  async function openDetail(runId) {
    _activeRun = await window.api.db.getRunById(runId).catch(() => null)
    if (!_activeRun) return
    _tcResults = await window.api.db.getTcResults(runId).catch(() => [])
    _view = 'detail'
    render()
  }

  async function deleteRun(runId) {
    if (!confirm('Hapus run ini?')) return
    await window.api.db.deleteRun(runId).catch(() => {})
    _runs = _runs.filter(r => r.id !== runId)
    render()
    toast('Run dihapus')
  }

  // ── Run ───────────────────────────────────────────────────────
  async function startRun() {
    if (!_selTCs.size) { toast('⚠️ Pilih TC dulu', 'error'); return }

    const serial = document.getElementById('run-device')?.value || _selSerial || AppState.connectedDevice?.serial
    if (!serial) { toast('⚠️ Pilih device dulu', 'error'); return }

    const sel = _allTCs.filter(t => _selTCs.has(t.id))
    const noDSL = sel.filter(tc => !tc.dsl_yaml && !tc.steps_yaml)
    if (noDSL.length) {
      toast(`⚠️ ${noDSL.length} TC tidak punya steps — buka di Inspector dahulu`, 'error'); return
    }

    const runName = document.getElementById('run-name')?.value.trim() || 'Test Run'
    const envId   = document.getElementById('run-env')?.value
    const envs    = await window.api.db.getEnvs().catch(() => [])
    const env     = envs.find(e => e.id === envId)
    const envVars = env?.vars || AppState.activeEnv?.vars || {}
    const ssStep  = document.getElementById('ev-ss-step')?.checked
    const ssFail  = document.getElementById('ev-ss-fail')?.checked
    const evDir   = document.getElementById('ev-dir')?.value
    const evidenceBase = evDir || (await window.api.system.getDataPath().catch(() => '')) + '/evidence'
    const ts          = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16)
    const runFolder   = `${evidenceBase}/${runName.replace(/\s+/g,'_')}_${ts}`

    // Buat run record
    const deviceInfo = AppState.devices?.find(d => d.serial === serial)
    const run = await window.api.db.saveRun({
      project_id:  _selProj,
      plan_name:   runName,
      run_type:    'custom',
      device:      deviceInfo?.model || serial,
      environment: env?.name || '',
      status:      'running',
      started_at:  new Date().toISOString(),
    })

    _activeRun = run
    _tcResults = []
    _isRunning = true
    _view = 'detail'
    render()

    // ── Log helper ──────────────────────────────────────────
    let logCount = 0
    const appendLog = (type, msg) => {
      const log = document.getElementById('main-log')
      if (!log) return
      const ph = log.querySelector('[style*="font-style:italic"]')
      if (ph) log.innerHTML = ''
      const d = document.createElement('div')
      const c = { pass:'#3fb950', fail:'#f85149', warn:'#d29922', info:'#e6edf3', head:'#58a6ff', cmd:'#c9d1d9' }
      d.style.cssText = `color:${c[type]||'#e6edf3'};padding:1px 0;display:flex;gap:8px;min-height:18px`
      const ts2 = document.createElement('span')
      ts2.style.cssText = 'color:#8b949e;flex-shrink:0;user-select:none;font-size:10px;font-family:monospace'
      ts2.textContent = `[${_fmtTime()}]`
      const txt = document.createElement('span')
      txt.style.wordBreak = 'break-all'
      txt.textContent = msg
      d.appendChild(ts2); d.appendChild(txt)
      log.appendChild(d); log.scrollTop = 9999
      logCount++
      const cnt = document.getElementById('log-count')
      if (cnt) cnt.textContent = `${logCount} baris`
    }

    // Subscribe ke runner log events (real-time streaming dari Maestro)
    const _stepLogs = {}   // { tcId: [{ action, selector, status, msg }] }
    let _currentTcId = null

    window.api.runner.onLog((data) => {
      if (!data) return
      const type = data.type === 'pass' ? 'pass' :
                   data.type === 'fail' ? 'fail' :
                   data.type === 'warn' ? 'warn' :
                   data.type === 'head' ? 'head' : 'info'
      appendLog(type, data.msg || '')

      // Kumpulkan step logs per TC
      if (_currentTcId && data.msg) {
        if (!_stepLogs[_currentTcId]) _stepLogs[_currentTcId] = []
        _stepLogs[_currentTcId].push({
          msg:    data.msg,
          status: data.type === 'pass' ? 'pass' : data.type === 'fail' ? 'fail' : 'info',
          time:   _fmtTime(),
        })
      }
    })

    appendLog('head', `▶ ${runName} (${sel.length} TC)`)
    appendLog('info', `Device: ${serial}`)
    if (envVars && Object.keys(envVars).length) appendLog('info', `Env vars: ${Object.keys(envVars).join(', ')}`)
    appendLog('info', `Evidence: ${runFolder}`)

    let pass = 0, fail = 0
    const startAll = Date.now()

    for (let i = 0; i < sel.length; i++) {
      const tc     = sel[i]
      const dsl    = tc.dsl_yaml || tc.steps_yaml || ''
      const tcId   = `tcr-res-${tc.id}`
      const startT = Date.now()
      _currentTcId = tc.id
      if (!_stepLogs[tc.id]) _stepLogs[tc.id] = []

      // Insert result row ke UI
      const results = document.getElementById('tc-results')
      const placeholder = results?.querySelector('[style*="text-align:center"]')
      if (placeholder) results.innerHTML = ''

      const tmpResult = { id: tcId, tc_id: tc.id, tc_name: tc.name, status: 'running', step_logs: [] }
      _tcResults.push(tmpResult)
      if (results) results.innerHTML += _tcResultRow(tmpResult, i)

      appendLog('head', `── TC ${i+1}/${sel.length}: ${tc.name} ──`)
      const pbar = document.getElementById('run-pbar')
      if (pbar) pbar.style.width = Math.round((i/sel.length)*100)+'%'

      const tcEvidenceDir = (ssStep || ssFail)
        ? `${runFolder}/${tc.name.replace(/[^a-z0-9_-]/gi,'_')}`
        : null

      let tcStatus = 'pass'
      let errMsg   = ''

      try {
        await window.api.runner.run({
          serial, stepsYaml: dsl, tcName: tc.name, tcId: tc.id,
          envVars, noReset: false, noReinstallDriver: true,
          evidenceDir: tcEvidenceDir,
          screenshotPerStep: ssStep,
          screenshotOnFail: ssFail,
        })
        pass++
        appendLog('pass', `✅ PASS — ${tc.name}`)
      } catch (err) {
        fail++
        tcStatus = 'fail'
        errMsg   = err.message
        appendLog('fail', `❌ FAIL — ${tc.name}`)
        appendLog('fail', `   ${err.message}`)
      }

      _currentTcId = null
      const duration    = Date.now() - startT
      const stepLogsArr = _stepLogs[tc.id] || []

      // Save tc_result ke DB dengan step_logs
      const savedId = await window.api.db.saveTcResult({
        run_id:      run.id,
        tc_id:       tc.id,
        tc_name:     tc.name,
        status:      tcStatus,
        duration_ms: duration,
        error_msg:   errMsg,
        evidence:    tcEvidenceDir ? { folder: tcEvidenceDir } : {},
        step_logs:   stepLogsArr,
      }).catch(() => tcId)

      // Update _tcResults
      const finalResult = { id: savedId, tc_id: tc.id, tc_name: tc.name,
        status: tcStatus, duration_ms: duration, error_msg: errMsg,
        evidence: tcEvidenceDir ? { folder: tcEvidenceDir } : {}, step_logs: stepLogsArr }

      const idx = _tcResults.findIndex(r => r.id === tcId)
      if (idx >= 0) _tcResults[idx] = finalResult

      // Update UI row in-place
      const numEl   = document.getElementById('tcr-num-'+tcId)
      const badgeEl = document.getElementById('tcr-badge-'+tcId)
      const rowEl   = document.getElementById('tcr-'+tcId)
      if (numEl)  { numEl.innerHTML = String(i+1); numEl.style.background = tcStatus==='pass'?'#16a34a':'#dc2626'; numEl.style.color='#fff' }
      if (badgeEl){ badgeEl.textContent = tcStatus.toUpperCase(); badgeEl.style.background = tcStatus==='pass'?'#dcfce7':'#fee2e2'; badgeEl.style.color = tcStatus==='pass'?'#16a34a':'#dc2626' }
      if (rowEl)  rowEl.style.borderColor = tcStatus==='pass'?'#16a34a':'#dc2626'

      // Auto-expand fail
      if (tcStatus === 'fail') {
        const det  = document.getElementById('tcr-detail-'+tcId)
        const chev = document.getElementById('tcr-chev-'+tcId)
        if (errMsg && det) {
          det.innerHTML = `<div style="padding:8px 14px;background:#fee2e2;border-bottom:1px solid rgba(220,38,38,.2)">
            <div style="font-size:11px;color:#dc2626;font-weight:600;margin-bottom:3px"><i class="bi bi-exclamation-circle"></i> Error</div>
            <div style="font-size:11px;color:#991b1b;font-family:var(--font-mono)">${esc(errMsg)}</div>
            ${tcEvidenceDir ? `<div style="margin-top:6px;font-size:10px;color:#7f1d1d">Evidence: ${esc(tcEvidenceDir)}</div>` : ''}
          </div>`
          det.style.display = 'block'
          if (chev) chev.style.transform = 'rotate(180deg)'
        }
      } else if (tcEvidenceDir) {
        // Show evidence path on pass
        const det = document.getElementById('tcr-detail-'+tcId)
        if (det) {
          det.innerHTML = `<div style="padding:8px 14px">
            <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Evidence:</div>
            <div style="display:flex;align-items:center;gap:6px">
              <code style="font-size:10px;font-family:var(--font-mono);flex:1;background:var(--surface3);
                padding:3px 7px;border-radius:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                ${esc(tcEvidenceDir)}
              </code>
              <button class="btn btn-xs btn-d" onclick="window.api.system.openExternal('${esc(tcEvidenceDir)}')"
                title="Buka di Finder"><i class="bi bi-folder2-open"></i></button>
            </div>
          </div>`
        }
      }

      // Update progress
      if (pbar) pbar.style.width = Math.round(((i+1)/sel.length)*100)+'%'
    }

    // Update run record
    const finalStatus = fail > 0 ? 'fail' : 'pass'
    const totalDur = Date.now() - startAll
    await window.api.db.saveRun({
      id:          run.id,
      status:      finalStatus,
      pass, fail,
      duration_ms: totalDur,
      finished_at: new Date().toISOString(),
    }).catch(() => {})

    _activeRun = { ..._activeRun, status: finalStatus, pass, fail, duration_ms: totalDur }
    _isRunning = false

    appendLog('head', `Selesai: ${pass} PASS, ${fail} FAIL (${_fmtDuration(totalDur)})`)
    toast(fail ? `❌ ${fail} gagal, ${pass} lulus` : `✅ Semua ${pass} TC lulus!`, fail?'error':'success')

    // Update header badge
    const headerBadge = document.querySelector('[style*="text-transform:uppercase"]')
    if (headerBadge && headerBadge.textContent.includes('running')) {
      headerBadge.textContent = finalStatus.toUpperCase()
      headerBadge.style.background = finalStatus==='pass'?'#dcfce7':'#fee2e2'
      headerBadge.style.color = finalStatus==='pass'?'#16a34a':'#dc2626'
    }

    // Update topbar button
    const ta = document.getElementById('topbar-actions')
    if (ta) ta.innerHTML = `
      <button class="btn btn-d btn-sm" onclick="PageTestRun.backToList()">
        <i class="bi bi-arrow-left"></i> Semua Run
      </button>
      <button class="btn btn-p btn-sm" onclick="PageTestRun.reRun()">
        <i class="bi bi-arrow-repeat"></i> Jalankan Ulang
      </button>`
  }

  async function reRun() {
    if (!_activeRun) return
    // Load TC dari run ini
    const results = await window.api.db.getTcResults(_activeRun.id).catch(() => [])
    _selTCs = new Set(results.map(r => r.tc_id))
    _allTCs = _selProj ? await _getAllTCs(_selProj) : []
    _view   = 'create'
    render()
  }

  // ── Helpers ────────────────────────────────────────────────────
  function _renderPicker(tcs) {
    if (!tcs.length) return `
      <div style="text-align:center;padding:20px;color:var(--text3)">
        <i class="bi bi-file-earmark-x" style="font-size:1.3rem;display:block;margin-bottom:8px;opacity:.4"></i>
        <div style="font-size:11px">Belum ada TC</div>
        <button class="btn btn-d btn-sm" style="margin-top:8px" onclick="navigate('projects')">
          Buat di Projects
        </button>
      </div>`
    return tcs.map(tc => `
      <div data-tc-id="${esc(tc.id)}"
        style="display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;
          border-bottom:1px solid var(--border);
          background:${_selTCs.has(tc.id)?'var(--blue-bg)':'transparent'}"
        onclick="PageTestRun.togTC('${esc(tc.id)}')">
        <input type="checkbox" ${_selTCs.has(tc.id)?'checked':''}
          onclick="event.stopPropagation();PageTestRun.togTC('${esc(tc.id)}')"
          style="accent-color:var(--blue);flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div class="tc-name" style="font-size:11px;font-weight:600;overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap;
            color:${_selTCs.has(tc.id)?'var(--blue)':'var(--text)'}">${esc(tc.name)}</div>
          <div style="font-size:10px;color:var(--text3)">
            ${tc.steps_count||0} steps · ${esc(tc.priority||'medium')}
          </div>
        </div>
      </div>`).join('')
  }

  async function _getAllTCs(projId) {
    if (!projId) return []
    const suites = await window.api.db.getSuites(projId).catch(() => [])
    const result = []
    for (const s of suites) {
      try { result.push(...await window.api.db.getTestCasesBySuite(s.id)) } catch {}
      const secs = await window.api.db.getSections(s.id).catch(() => [])
      for (const sec of secs) {
        try { result.push(...await window.api.db.getTestCases(sec.id)) } catch {}
      }
    }
    const seen = new Set()
    return result.filter(tc => { if (seen.has(tc.id)) return false; seen.add(tc.id); return true })
  }

  function _fmtDuration(ms) {
    if (!ms) return '—'
    if (ms < 1000) return ms + 'ms'
    if (ms < 60000) return (ms/1000).toFixed(1) + 's'
    return Math.floor(ms/60000) + 'm ' + Math.round((ms%60000)/1000) + 's'
  }

  function _fmtTime() {
    return new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  }

  return {
    render, openCreate, backToList, openDetail, deleteRun, reRun,
    switchProject, changeProject, saveRunOnly,
    selectDevice, filterTCs, togTC, selAll,
    pickEvidenceDir, startRun, toggleTcDetail,
  }
})()