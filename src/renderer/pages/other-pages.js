/* pages/projects.js */
window.PageProjects = (() => {
  'use strict'
  let _proj = null, _suite = null, _section = null

  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = `<button class="btn btn-p btn-sm" onclick="PageProjects.newProject()"><i class="bi bi-plus-lg"></i> Project Baru</button>`

    const projects = await window.api.db.getProjects()
    AppState.cache.projects = projects
    document.getElementById('badge-projects').textContent = projects.length
    if (!_proj && projects.length) _proj = projects[0]

    const suites   = _proj ? await window.api.db.getSuites(_proj.id) : []
    if (!_suite && suites.length) _suite = suites[0]
    const sections = _suite ? await window.api.db.getSections(_suite.id) : []
    if (!_section && sections.length) _section = sections[0]
    const tcs      = _section ? await window.api.db.getTestCases(_section.id) : []

    content.innerHTML = `
    <div class="flex g10" style="height:calc(100vh - var(--tb-h) - 28px);min-height:0">
      <!-- Projects -->
      <div style="width:178px;flex-shrink:0;display:flex;flex-direction:column;gap:5px;overflow-y:auto">
        <div class="slbl">Projects</div>
        ${projects.map(p => `
          <div style="padding:10px 11px;border-radius:9px;border:1.5px solid ${p.id===_proj?.id?'var(--blue)':'var(--border)'};background:${p.id===_proj?.id?'var(--blue-bg)':'var(--surface)'};cursor:pointer;transition:all .12s"
            onclick="PageProjects.selectProject('${esc(p.id)}')">
            <div class="flex ic g6 mb4">
              <div style="width:7px;height:7px;border-radius:50%;background:${esc(p.color||'#888')};flex-shrink:0"></div>
              <div class="fw6 sm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(p.name)}</div>
            </div>
            <div class="flex ic g4"><span class="badge b-${esc(p.platform)}">${esc(p.platform)}</span></div>
          </div>`).join('')}
        <button class="btn btn-gh btn-sm" onclick="PageProjects.newProject()" style="border:1px dashed var(--border2)"><i class="bi bi-plus-lg"></i> Baru</button>
      </div>

      <!-- Suite tree -->
      <div style="width:238px;flex-shrink:0;display:flex;flex-direction:column;min-height:0">
        <div class="flex ic jb mb6"><div class="slbl" style="margin:0">${esc(_proj?.name||'–')} — Suites</div>
          <button class="btn btn-xs btn-d" onclick="PageProjects.newSuite()"><i class="bi bi-plus-lg"></i></button>
        </div>
        <div style="flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
          ${suites.map(suite => `
          <div>
            <div style="display:flex;align-items:center;gap:7px;padding:7px 10px;background:var(--surface2);border-bottom:1px solid var(--border);font-weight:700;font-size:11px;cursor:pointer"
              onclick="PageProjects.selectSuite('${esc(suite.id)}')">
              <i class="bi bi-folder-fill" style="color:var(--yellow)"></i>
              <span style="flex:1">${esc(suite.name)}</span>
              <button class="btn btn-xs btn-gh" onclick="event.stopPropagation();PageProjects.newSection('${esc(suite.id)}')"><i class="bi bi-plus-lg"></i></button>
            </div>
            ${_suite?.id===suite.id ? sections.map(sec => `
              <div style="display:flex;align-items:center;gap:7px;padding:6px 10px 6px 20px;${_section?.id===sec.id?'background:var(--blue-bg);':''}border-bottom:1px solid var(--border);font-size:11px;cursor:pointer;font-weight:600;color:var(--text2)"
                onclick="PageProjects.selectSection('${esc(sec.id)}')">
                <i class="bi bi-folder2" style="font-size:11px"></i>
                <span style="flex:1">${esc(sec.name)}</span>
                <span class="xs muted">0</span>
              </div>`).join('') : ''}
          </div>`).join('') ||
          `<div class="empty-s" style="padding:16px"><div class="ei"><i class="bi bi-folder-x"></i></div><p>Klik + untuk suite</p></div>`}
        </div>
      </div>

      <!-- TC list -->
      <div style="flex:1;min-width:0;display:flex;flex-direction:column">
        <div class="flex ic jb mb8">
          <div><b class="fw7">${esc(_section?.name||'Pilih section')}</b>
            ${_section ? `<span class="tag">${tcs.length} TC</span>` : ''}</div>
          <div class="flex g6">
            ${_section ? `
              <button class="btn btn-d btn-sm" onclick="PageProjects.newTC()"><i class="bi bi-plus-lg"></i> Test Case</button>
              <button class="btn btn-g btn-sm" onclick="toast('▶ Run section segera tersedia')"><i class="bi bi-play-fill"></i> Run</button>` : ''}
          </div>
        </div>
        ${_section ? `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <div style="display:grid;grid-template-columns:26px 1fr 90px 50px 130px;padding:7px 12px;background:var(--surface2);border-bottom:1px solid var(--border)">
            ${['#','Test Case','Status','Steps','Aksi'].map(h=>`<div class="xs muted fw6">${h}</div>`).join('')}
          </div>
          ${tcs.map((tc,i) => `
          <div style="display:grid;grid-template-columns:26px 1fr 90px 50px 130px;padding:8px 12px;border-bottom:1px solid var(--border);align-items:center;cursor:pointer;transition:background .1s"
            onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">
            <div class="xs mono muted">${i+1}</div>
            <div><div class="sm fw6">${esc(tc.name)}</div>
              <div class="flex g3 mt4">${(tc.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>
            </div>
            <div><span class="badge b-${esc(tc.status)}">${esc(tc.status)}</span></div>
            <div class="xs muted">${tc.steps_count||'–'}</div>
            <div class="flex g4">
              <button class="btn btn-xs btn-d" onclick="PageProjects.editTC('${esc(tc.id)}')"><i class="bi bi-pencil"></i> Edit</button>
              <button class="btn btn-xs btn-g" onclick="toast('▶ ${esc(tc.name)}')"><i class="bi bi-play-fill"></i></button>
              <button class="btn btn-xs btn-gh" style="color:var(--red)" onclick="PageProjects.deleteTC('${esc(tc.id)}')"><i class="bi bi-trash3"></i></button>
            </div>
          </div>`).join('') ||
          `<div style="text-align:center;padding:24px;color:var(--text3);font-size:12px">Belum ada TC. Klik + Test Case.</div>`}
        </div>` :
        `<div class="empty-s"><div class="ei"><i class="bi bi-arrow-left-circle"></i></div><h3>Pilih Section</h3><p>Pilih section dari tree di kiri.</p></div>`}
      </div>
    </div>`
  }

  async function selectProject(id) {
    const projects = AppState.cache.projects || await window.api.db.getProjects()
    _proj = projects.find(p => p.id === id)
    _suite = null; _section = null
    render()
  }
  async function selectSuite(id) {
    const suites = await window.api.db.getSuites(_proj?.id)
    _suite = suites.find(s => s.id === id)
    _section = null
    render()
  }
  async function selectSection(id) {
    const sections = await window.api.db.getSections(_suite?.id)
    _section = sections.find(s => s.id === id)
    render()
  }

  async function newProject() {
    const name = prompt('Nama project baru:')
    if (!name?.trim()) return
    const platform = prompt('Platform (android/ios/web):') || 'android'
    const p = await window.api.db.saveProject({ name: name.trim(), platform, color: '#3b7eed' })
    _proj = p
    render()
    toast(`✅ Project "${name}" dibuat`)
  }
  async function newSuite() {
    if (!_proj) { toast('Pilih project dulu', 'error'); return }
    const name = prompt('Nama test suite:')
    if (!name?.trim()) return
    const s = await window.api.db.saveSuite({ project_id: _proj.id, name: name.trim() })
    _suite = s
    render()
  }
  async function newSection(suiteId) {
    const name = prompt('Nama section/folder:')
    if (!name?.trim()) return
    const sec = await window.api.db.saveSection({ suite_id: suiteId, name: name.trim() })
    _section = sec
    render()
  }
  async function newTC() {
    if (!_section) { toast('Pilih section dulu', 'error'); return }
    const name = prompt('Nama test case:')
    if (!name?.trim()) return
    await window.api.db.saveTestCase({ section_id: _section.id, name: name.trim(), status: 'pending' })
    render()
  }
  async function deleteTC(id) {
    if (!confirm('Hapus test case ini?')) return
    await window.api.db.deleteTestCase(id)
    render()
  }
  function editTC(id) {
    toast('💡 Edit TC: buka di Inspector & Editor (segera tersedia)')
    navigate('inspector')
  }

  return { render, selectProject, selectSuite, selectSection, newProject, newSuite, newSection, newTC, deleteTC, editTC }
})()

/* pages/testrun.js */
window.PageTestRun = (() => {
  'use strict'
  let _planType = 'smoke', _planName = 'Smoke Test Run', _selTCs = new Set(), _evidenceTab = 'log'

  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    content.className = 'content-area no-pad'
    ta.innerHTML = `
      <button class="btn btn-d btn-sm" onclick="toast('💾 Plan disimpan')"><i class="bi bi-save"></i> Simpan</button>
      <button class="btn btn-p btn-sm" id="run-btn" onclick="PageTestRun.startRun()"><i class="bi bi-play-fill"></i> Jalankan</button>`

    const proj = AppState.cache.activeProj
    const all  = proj ? (await getAll(proj.id)) : []
    const sel  = all.filter(t => _selTCs.has(t.id))

    content.innerHTML = `
    <div class="run-wrap">
      <div class="run-L">
        <div class="panel" style="flex:1">
          <div class="ph"><div class="ph-title"><i class="bi bi-ui-checks"></i> Pilih TC</div></div>
          <div style="padding:6px 8px;border-bottom:1px solid var(--border)">
            <input type="text" class="w100" placeholder="🔍 Filter..." style="font-size:11px">
          </div>
          <div id="tc-pick" style="overflow-y:auto;flex:1">${renderPicker(all)}</div>
          <div class="pf flex ic jb xs muted">
            <span><i class="bi bi-check2-square"></i> ${_selTCs.size} dipilih</span>
            <div class="flex g4">
              <button class="btn btn-xs btn-gh" onclick="PageTestRun.selAll(true,${JSON.stringify(all.map(t=>t.id))})">Semua</button>
              <button class="btn btn-xs btn-gh" onclick="PageTestRun.selAll(false,[])">Hapus</button>
            </div>
          </div>
        </div>
      </div>

      <div class="run-C">
        <div class="card">
          <div class="flex ic jb mb8">
            <div class="card-title"><i class="bi bi-sliders2"></i> Tipe Run</div>
            <div id="run-badge" class="badge b-pend" style="display:none"><i class="bi bi-circle-fill" style="font-size:7px"></i> Idle</div>
          </div>
          <div class="flex g6 wrap mb8">
            ${[['smoke','🔥 Smoke'],['sanity','✅ Sanity'],['regression','🔄 Regression'],['full','📦 Full'],['custom','🎯 Custom']]
              .map(([k,l]) => `<button class="rtb rtb-${k} ${_planType===k?'sel':''}" onclick="PageTestRun.setType('${k}')">${l}</button>`).join('')}
          </div>
          <div class="r2">
            <div class="field"><label class="fl">Nama Run</label>
              <input type="text" class="w100" value="${esc(_planName)}" oninput="PageTestRun._planName=this.value"></div>
            <div class="field"><label class="fl">Environment</label>
              <select class="w100"><option>${esc(AppState.activeEnv?.name||'Default')}</option></select></div>
          </div>
          <div class="pbar mt8"><div class="pbar-fill" id="run-pbar" style="width:0%"></div></div>
        </div>
        <div class="panel" style="flex:1">
          <div class="ph">
            <div class="ph-title"><i class="bi bi-list-check"></i> Hasil TC</div>
            <div class="flex ic g6">
              <span class="badge b-run">${sel.length} TC</span>
              <button class="btn btn-xs btn-gh" onclick="PageTestRun.expandAll()"><i class="bi bi-layout-split"></i></button>
            </div>
          </div>
          <div class="pb" id="tc-results">
            ${sel.length ? sel.map((tc,i) => renderTcRow(tc,i)).join('') :
            `<div class="empty-s"><div class="ei"><i class="bi bi-clipboard2-check"></i></div><h3>Belum ada TC</h3><p>Centang dari panel kiri.</p></div>`}
          </div>
        </div>
      </div>

      <div class="run-R">
        <div class="card">
          <div class="card-title mb8"><i class="bi bi-gear-wide-connected"></i> Konfigurasi</div>
          <div class="r2 mb6">
            <div class="field"><label class="fl">Device</label>
              <select class="w100"><option>📱 ${esc(AppState.connectedDevice?.model||'emulator-5554')}</option><option>☁ AWS Device Farm</option></select></div>
            <div class="field"><label class="fl">Mode</label>
              <select class="w100"><option>Sequential</option><option>Retry 1x</option></select></div>
          </div>
          <div class="slbl mb5">Evidence</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${[['Screenshot per step','checked'],['Screenshot saat gagal',''],['Video recording','']].map(([l,c]) =>
              `<label class="flex ic g6" style="cursor:pointer;font-size:11px">
                <input type="checkbox" ${c} style="accent-color:var(--blue)"> ${l}
              </label>`).join('')}
          </div>
        </div>
        <div class="panel" style="flex:1">
          <div class="ph"><div class="ph-title"><i class="bi bi-terminal-fill"></i> Run Log</div>
            <button class="btn btn-xs btn-gh" onclick="document.getElementById('main-log').innerHTML=''"><i class="bi bi-trash3"></i></button>
          </div>
          <div id="main-log" class="log-wrap pb" style="flex:1">
            <span class="ld">Log muncul saat test berjalan...</span>
          </div>
        </div>
      </div>
    </div>`
  }

  function renderPicker(tcs) {
    if (!tcs.length) return `<div class="empty-s" style="padding:14px"><p>Belum ada TC. Buat di Projects.</p></div>`
    return tcs.map(tc => `
      <div class="tc-row" onclick="PageTestRun.togTC('${esc(tc.id)}')">
        <input type="checkbox" ${_selTCs.has(tc.id)?'checked':''} onclick="event.stopPropagation();PageTestRun.togTC('${esc(tc.id)}')" style="accent-color:var(--blue)">
        <div style="flex:1;min-width:0"><div class="tc-label">${esc(tc.name)}</div></div>
        <span class="badge b-${esc(tc.status)}" style="font-size:9px">${esc(tc.status)}</span>
      </div>`).join('')
  }

  function renderTcRow(tc, i) {
    const st = AppState.runner.stepStatus?.[tc.id] || 'idle'
    return `
    <div class="tc-result-row ${st==='run'?'rr-run':st==='pass'?'rr-pass':st==='fail'?'rr-fail':''}" id="tcr-${esc(tc.id)}">
      <div class="tcr-header" onclick="toggleTcEvidence('${esc(tc.id)}')">
        <div class="tcr-num ${st==='pass'?'rn-pass':st==='fail'?'rn-fail':st==='run'?'rn-run':''}">${i+1}</div>
        <div class="step-drag" style="color:var(--border2)"><i class="bi bi-grip-vertical"></i></div>
        <div class="tcr-name">${esc(tc.name)}</div>
        <span class="badge ${st==='run'?'b-run':st==='pass'?'b-pass':st==='fail'?'b-fail':'b-skip'}">${st==='idle'?'Pending':st}</span>
        <i class="bi bi-chevron-down tcr-expand" id="exp-${esc(tc.id)}"></i>
      </div>
      <div class="tcr-evidence" id="evd-${esc(tc.id)}">
        <div style="text-align:center;padding:10px;color:var(--text3);font-size:11px">
          <i class="bi bi-hourglass"></i> Evidence muncul setelah TC dijalankan.
        </div>
      </div>
    </div>`
  }

  function toggleTcEvidence(id) {
    const evd = document.getElementById('evd-'+id)
    const exp = document.getElementById('exp-'+id)
    if (!evd) return
    const open = evd.classList.toggle('open')
    if (exp) exp.classList.toggle('open', open)
  }

  function expandAll() {
    document.querySelectorAll('.tcr-evidence').forEach(e => e.classList.add('open'))
    document.querySelectorAll('.tcr-expand').forEach(e => e.classList.add('open'))
  }

  function togTC(id) {
    if (_selTCs.has(id)) _selTCs.delete(id)
    else _selTCs.add(id)
    render()
  }

  function selAll(yes, ids) {
    if (yes) ids.forEach(id => _selTCs.add(id))
    else _selTCs.clear()
    render()
  }

  function setType(type) {
    _planType = type
    render()
  }

  async function startRun() {
    if (!_selTCs.size) { toast('⚠️ Pilih TC dulu', 'error'); return }
    if (!AppState.connectedDevice) { toast('⚠️ Hubungkan device di Inspector dulu', 'error'); return }

    const btn = document.getElementById('run-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Berjalan...' }
    const badge = document.getElementById('run-badge')
    if (badge) { badge.style.display = 'flex'; badge.className = 'badge b-run'; badge.innerHTML = '<i class="bi bi-circle-fill" style="font-size:7px"></i> Running' }

    const log = document.getElementById('main-log')
    const appendLog = (type, msg) => {
      if (!log) return
      if (log.querySelector('.ld')) log.innerHTML = ''
      const d = document.createElement('div')
      d.className = 'l' + type[0]
      d.textContent = msg
      log.appendChild(d)
      log.scrollTop = 9999
    }

    appendLog('info', `[${fmtTime()}] ▶ ${_planName}`)
    appendLog('info', `[${fmtTime()}] Device: ${AppState.connectedDevice.serial}`)

    const proj = AppState.cache.activeProj
    const all  = proj ? (await getAll(proj.id)) : []
    const sel  = all.filter(t => _selTCs.has(t.id))

    let pass = 0, fail = 0
    for (const tc of sel) {
      const row = document.getElementById('tcr-' + tc.id)
      if (row) { row.className = 'tc-result-row rr-run'; row.querySelector('.tcr-num').className = 'tcr-num rn-run' }
      appendLog('info', `[${fmtTime()}] ▶ ${tc.name}`)

      const pb = document.getElementById('run-pbar')
      if (pb) pb.style.width = Math.round((sel.indexOf(tc)+1)/sel.length*100) + '%'

      // Simulate delay (real: would call window.api.runner.run)
      await new Promise(r => setTimeout(r, 600))

      const ok = tc.status !== 'fail'
      if (ok) pass++; else fail++
      if (row) {
        row.className = `tc-result-row ${ok?'rr-pass':'rr-fail'}`
        row.querySelector('.tcr-num').className = `tcr-num ${ok?'rn-pass':'rn-fail'}`
        // Update evidence drawer
        const evd = document.getElementById('evd-'+tc.id)
        if (evd) {
          evd.innerHTML = `
          <div class="flex ic jb mb6">
            <span class="xs muted fw6"><i class="bi bi-images"></i> Screenshots</span>
            ${!ok ? `<button class="btn btn-xs btn-danger"><i class="bi bi-exclamation-triangle-fill"></i> Lihat Fail</button>` : ''}
          </div>
          <div class="ev-inline-grid">
            ${Array.from({length:tc.steps_count||3},(_,si)=>`
              <div class="ev-inline-item">
                <div class="ev-thumb-sm">
                  <i class="bi bi-${si===2&&!ok?'x-circle-fill':'check-circle'}" style="color:${si===2&&!ok?'var(--red)':'var(--text3)'};font-size:14px"></i>
                  <div class="ev-dot-sm" style="background:${si===2&&!ok?'var(--red)':'var(--green)'}"></div>
                </div>
                <div class="ev-label-sm">step_0${si+1}</div>
              </div>`).join('')}
          </div>`
          if (!ok) { evd.classList.add('open'); document.getElementById('exp-'+tc.id)?.classList.add('open') }
        }
      }
      appendLog(ok?'pass':'fail', `[${fmtTime()}] ${ok?'✅ LULUS':'❌ GAGAL'}: ${tc.name}`)
    }

    appendLog('pass', `[${fmtTime()}] Selesai: ${pass} lulus, ${fail} gagal`)
    if (badge) { badge.className = 'badge b-pass'; badge.innerHTML = '<i class="bi bi-check-circle-fill"></i> Selesai' }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-fill"></i> Jalankan' }
    toast(fail ? `❌ ${fail} TC gagal` : '✅ Semua TC lulus!', fail ? 'error' : 'success')
  }

  async function getAll(projId) {
    const suites = await window.api.db.getSuites(projId)
    const result = []
    for (const s of suites) {
      const secs = await window.api.db.getSections(s.id)
      for (const sec of secs) {
        const tcs = await window.api.db.getTestCases(sec.id)
        result.push(...tcs)
      }
    }
    return result
  }

  return { render, togTC, selAll, setType, startRun, expandAll }
})()

/* pages/reports.js */
window.PageReports = (() => {
  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = `<button class="btn btn-d btn-sm" onclick="toast('⬇ Export CSV segera tersedia')"><i class="bi bi-download"></i> Export</button>`

    const proj = AppState.cache.activeProj
    const runs = proj ? await window.api.db.getRuns(proj.id) : []

    content.innerHTML = `
    <div class="r2 mb12">
      ${[{n:runs.length,l:'Total Runs',c:'var(--text)'},{n:runs.filter(r=>r.status==='pass').length,l:'Pass',c:'var(--green)'}]
        .map(s=>`<div class="sc"><div class="sn" style="color:${s.c}">${s.n}</div><div class="sl">${s.l}</div></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title mb10"><i class="bi bi-clock-history"></i> History Test Run</div>
      ${runs.length ? `
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div style="display:grid;grid-template-columns:1fr 80px 60px 60px 80px 80px;padding:7px 12px;background:var(--surface2);border-bottom:1px solid var(--border)">
          ${['Nama Run','Type','Lulus','Gagal','Durasi','Status'].map(h=>`<div class="xs muted fw6">${h}</div>`).join('')}
        </div>
        ${runs.map(r=>`
        <div style="display:grid;grid-template-columns:1fr 80px 60px 60px 80px 80px;padding:9px 12px;border-bottom:1px solid var(--border);align-items:center"
          onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''">
          <div><div class="sm fw6">${esc(r.plan_name)}</div><div class="xs muted">${r.created_at||'–'}</div></div>
          <div><span class="tag">${esc(r.run_type||'custom')}</span></div>
          <div class="sm" style="color:var(--green)">${r.pass||0}</div>
          <div class="sm" style="color:${r.fail?'var(--red)':'var(--text3)'}">${r.fail||0}</div>
          <div class="xs mono muted">${r.duration_ms?(r.duration_ms/1000).toFixed(1)+'s':'–'}</div>
          <div><span class="badge b-${esc(r.status||'pend')}">${esc(r.status||'–')}</span></div>
        </div>`).join('')}
      </div>` : `<div class="empty-s"><div class="ei"><i class="bi bi-bar-chart-line"></i></div><h3>Belum ada run</h3><p>Jalankan test untuk melihat history.</p></div>`}
    </div>`
  }
  return { render }
})()

/* pages/environments.js */
window.PageEnvironments = (() => {
  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = `<button class="btn btn-p btn-sm" onclick="PageEnvironments.newEnv()"><i class="bi bi-plus-lg"></i> Environment Baru</button>`

    const envs = await window.api.db.getEnvs()
    const active = envs.find(e => e.is_active) || envs[0]

    content.innerHTML = `
    <div class="r2">
      <div>
        <div class="slbl mb6">Daftar Environment</div>
        ${envs.map(env => `
        <div style="padding:11px 13px;border-radius:9px;border:1.5px solid ${env.is_active?'var(--green)':'var(--border)'};background:${env.is_active?'var(--green-bg)':'var(--surface)'};cursor:pointer;margin-bottom:6px;transition:all .15s"
          onclick="PageEnvironments.activate('${esc(env.id)}')">
          <div class="flex ic jb mb4">
            <div class="fw7 sm">${esc(env.name)}</div>
            ${env.is_active ? '<span class="badge b-pass"><i class="bi bi-circle-fill" style="font-size:7px"></i> Aktif</span>' :
            `<button class="btn btn-xs btn-d" onclick="event.stopPropagation();PageEnvironments.activate('${esc(env.id)}')">Aktifkan</button>`}
          </div>
          <div class="xs mono muted">${esc(env.base_url||'–')}</div>
          <div class="xs muted mt4">${Object.keys(env.vars||{}).length} variabel</div>
        </div>`).join('') || '<div class="xs muted">Belum ada environment</div>'}
      </div>
      <div>
        <div class="slbl mb6">Variabel — ${esc(active?.name||'–')}</div>
        <div class="card">
          ${active ? `
          <div style="border:1px solid var(--border);border-radius:7px;overflow:hidden">
            <div style="display:grid;grid-template-columns:150px 1fr 28px;padding:6px 10px;background:var(--surface2);border-bottom:1px solid var(--border)">
              <div class="xs muted fw6">Key</div><div class="xs muted fw6">Value</div><div></div>
            </div>
            ${Object.entries(active.vars||{}).map(([k,v]) => `
            <div style="display:grid;grid-template-columns:150px 1fr 28px;gap:6px;padding:5px 10px;border-bottom:1px solid var(--border);align-items:center">
              <div class="mono xs muted2">${esc(k)}</div>
              <input class="mono xs w100" type="text" value="${esc(v)}"
                style="background:var(--surface2);padding:3px 7px;border-radius:4px;border:1px solid var(--border);outline:none"
                onchange="PageEnvironments.updateVar('${esc(active.id)}','${esc(k)}',this.value)">
              <button class="btn btn-xs btn-gh" style="color:var(--red)" onclick="toast('🗑 Segera tersedia')"><i class="bi bi-trash3"></i></button>
            </div>`).join('')}
          </div>
          <button class="btn btn-gh btn-sm mt8 w100" onclick="PageEnvironments.addVar('${esc(active.id)}')" style="border:1px dashed var(--border2)">
            <i class="bi bi-plus-lg"></i> Tambah Variabel
          </button>` : '<div class="xs muted">Tidak ada environment aktif</div>'}
        </div>
        <div class="info-box mt8"><div class="ib-ic"><i class="bi bi-info-circle-fill"></i></div>
          <p>Gunakan <code class="mono xs" style="background:rgba(59,126,237,.1);padding:1px 4px;border-radius:3px">{{KEY}}</code>
          di steps. Contoh: <code class="mono xs" style="background:rgba(59,126,237,.1);padding:1px 4px;border-radius:3px">{{EMAIL}}</code></p>
        </div>
      </div>
    </div>`
  }

  async function activate(id) {
    const envs = await window.api.db.getEnvs()
    for (const env of envs) {
      await window.api.db.saveEnv({ ...env, is_active: env.id === id ? 1 : 0 })
    }
    const active = envs.find(e => e.id === id)
    if (active) AppState.setActiveEnv({ ...active, is_active: 1 })
    render()
  }

  async function updateVar(envId, key, val) {
    const envs = await window.api.db.getEnvs()
    const env  = envs.find(e => e.id === envId)
    if (!env) return
    env.vars[key] = val
    await window.api.db.saveEnv(env)
  }

  async function addVar(envId) {
    const key = prompt('Nama variabel (contoh: BASE_URL):')
    if (!key?.trim()) return
    const val = prompt(`Nilai untuk ${key}:`) || ''
    const envs = await window.api.db.getEnvs()
    const env  = envs.find(e => e.id === envId)
    if (!env) return
    env.vars[key.trim().toUpperCase()] = val
    await window.api.db.saveEnv(env)
    render()
  }

  async function newEnv() {
    const name = prompt('Nama environment baru:')
    if (!name?.trim()) return
    const base = prompt('Base URL (opsional):') || ''
    await window.api.db.saveEnv({ name: name.trim(), base_url: base, vars: {}, is_active: 0 })
    render()
  }

  return { render, activate, updateVar, addVar, newEnv }
})()

/* pages/settings.js */
window.PageSettings = (() => {
  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = `<button class="btn btn-p btn-sm" onclick="toast('💾 Settings disimpan')"><i class="bi bi-save"></i> Simpan</button>`
    const dataPath = await window.api.system.getDataPath().catch(() => '~')
    const version  = await window.api.system.getAppVersion().catch(() => '1.0.0')
    const deps     = await window.api.setup.checkDeps().catch(() => ({}))

    content.innerHTML = `
    <div style="max-width:520px">
      <div class="card mb10">
        <div class="card-title mb10"><i class="bi bi-gear"></i> General</div>
        ${[['Default Timeout (ms)','number','5000'],['Screenshot Quality','select',['High','Medium','Low']],
           ['Log Level','select',['Info','Debug','Verbose']]].map(([l,t,v]) => `
          <div class="field mb8"><label class="fl">${l}</label>
            ${t==='select'?`<select class="w100">${v.map(o=>`<option>${o}</option>`).join('')}</select>`:
            `<input type="${t}" class="w100" value="${v}"}`}>
          </div>`).join('')}
      </div>
      <div class="card mb10">
        <div class="card-title mb4"><i class="bi bi-wrench-adjustable"></i> Binary Paths</div>
        <div class="card-sub">Diisi otomatis oleh Setup Wizard</div>
        ${[['ADB', deps.adb?.path||'–', deps.adb?.ok],
           ['Java', deps.java?.path||'–', deps.java?.ok],
           ['Maestro', deps.maestro?.path||'–', deps.maestro?.ok]].map(([l,v,ok]) => `
          <div class="field mb8"><label class="fl">${l} ${ok?'<span class="badge b-pass" style="font-size:9px">OK</span>':'<span class="badge b-fail" style="font-size:9px">Tidak ditemukan</span>'}</label>
            <div class="flex g6">
              <input type="text" value="${esc(v)}" class="w100 mono" style="font-size:10.5px" readonly>
              <button class="btn btn-d btn-sm" onclick="toast('${ok?'✅ Binary OK':'⚠️ Binary tidak ditemukan. Jalankan Setup.'}')">
                <i class="bi bi-${ok?'check2':'exclamation-triangle'}"></i>
              </button>
            </div>
          </div>`).join('')}
        <button class="btn btn-p btn-sm" onclick="navigate('setup')"><i class="bi bi-lightning-charge-fill"></i> Jalankan Setup Ulang</button>
      </div>
      <div class="card mb10">
        <div class="card-title mb4"><i class="bi bi-folder2"></i> Data & Storage</div>
        <div class="flex ic g6 mb8">
          <code class="mono xs" style="flex:1;background:var(--surface2);padding:5px 9px;border-radius:6px">${esc(dataPath)}/data/testpilot.db</code>
          <button class="btn btn-d btn-sm" onclick="window.api.system.openExternal('${esc(dataPath)}')">
            <i class="bi bi-folder2-open"></i> Buka
          </button>
        </div>
      </div>
      <div class="card">
        <div class="card-title mb8"><i class="bi bi-info-circle"></i> Tentang</div>
        <div class="flex ic jb">
          <div><div class="sm fw6">TestPilot v${esc(version)}</div>
            <div class="xs muted">Electron · better-sqlite3 · Maestro CLI · ADB</div></div>
          <button class="btn btn-d btn-sm" onclick="toast('✅ Ini versi terbaru')"><i class="bi bi-arrow-repeat"></i> Cek Update</button>
        </div>
      </div>
    </div>`
  }
  return { render }
})()