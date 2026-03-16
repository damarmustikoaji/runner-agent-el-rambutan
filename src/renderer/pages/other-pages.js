/* pages/projects.js */
window.PageProjects = (() => {
  'use strict'

  let _proj    = null
  let _suite   = null
  let _section = null

  // ── Render ─────────────────────────────────────────────────
  async function render() {
    const content  = document.getElementById('content-area')
    const ta       = document.getElementById('topbar-actions')
    ta.innerHTML   = `<button class="btn btn-p btn-sm" onclick="PageProjects.showModal('project')">
      <i class="bi bi-plus-lg"></i> Project Baru</button>`

    const projects = await window.api.db.getProjects()
    AppState.cache.projects = projects
    const badge = document.getElementById('badge-projects')
    if (badge) badge.textContent = projects.length
    if (!_proj && projects.length) _proj = projects[0]

    const suites   = _proj   ? await window.api.db.getSuites(_proj.id)     : []
    if (!_suite && suites.length) _suite = suites[0]
    const sections = _suite  ? await window.api.db.getSections(_suite.id)  : []
    if (!_section && sections.length) _section = sections[0]
    const tcs      = _section ? await window.api.db.getTestCases(_section.id) : []

    content.innerHTML = `
    <div style="display:flex;height:calc(100vh - var(--tb-h));min-height:0;overflow:hidden">

      <!-- Col 1: Projects -->
      <div style="width:200px;flex-shrink:0;border-right:1px solid var(--border);
        display:flex;flex-direction:column;background:var(--surface);overflow:hidden">
        <div style="padding:10px 12px 6px;display:flex;align-items:center;justify-content:space-between;
          border-bottom:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.5px">Projects</span>
          <button class="btn btn-xs btn-d" onclick="PageProjects.showModal('project')" title="Project baru">
            <i class="bi bi-plus-lg"></i>
          </button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:6px">
          ${projects.length ? projects.map(p => `
            <div onclick="PageProjects.selectProject('${esc(p.id)}')"
              style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;
                cursor:pointer;margin-bottom:2px;transition:all .1s;
                ${p.id===_proj?.id ? 'background:var(--blue-bg);border:1px solid var(--blue-border)' :
                  'background:transparent;border:1px solid transparent'}">
              <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
                background:${esc(p.color||'#3b7eed')}"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;
                  white-space:nowrap;color:${p.id===_proj?.id?'var(--blue)':'var(--text)'}">${esc(p.name)}</div>
                <div style="font-size:10px;color:var(--text3)">${esc(p.platform||'android')}</div>
              </div>
              <button onclick="event.stopPropagation();PageProjects.deleteProject('${esc(p.id)}')"
                style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:12px;
                  padding:2px;border-radius:3px;opacity:0;transition:.1s"
                class="proj-del-btn" title="Hapus">
                <i class="bi bi-trash3"></i>
              </button>
            </div>`).join('') :
            `<div style="text-align:center;padding:24px 12px;color:var(--text3)">
              <i class="bi bi-folder-plus" style="font-size:1.8rem;display:block;margin-bottom:8px;opacity:.4"></i>
              <div style="font-size:11px">Belum ada project</div>
              <button class="btn btn-d btn-sm" style="margin-top:8px"
                onclick="PageProjects.showModal('project')">
                <i class="bi bi-plus-lg"></i> Buat Project
              </button>
            </div>`}
        </div>
      </div>

      <!-- Col 2: Suites + Sections -->
      <div style="width:220px;flex-shrink:0;border-right:1px solid var(--border);
        display:flex;flex-direction:column;background:var(--surface);overflow:hidden">
        <div style="padding:10px 12px 6px;display:flex;align-items:center;justify-content:space-between;
          border-bottom:1px solid var(--border)">
          <span style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;
            letter-spacing:.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px"
            title="${esc(_proj?.name||'')}">
            ${_proj ? esc(_proj.name) : '—'}
          </span>
          ${_proj ? `<button class="btn btn-xs btn-d" onclick="PageProjects.showModal('suite')" title="Suite baru">
            <i class="bi bi-plus-lg"></i>
          </button>` : ''}
        </div>
        <div style="flex:1;overflow-y:auto">
          ${suites.length ? suites.map(suite => `
            <div>
              <!-- Suite header -->
              <div onclick="PageProjects.selectSuite('${esc(suite.id)}')"
                style="display:flex;align-items:center;gap:7px;padding:8px 12px;
                  background:${_suite?.id===suite.id?'var(--surface2)':'transparent'};
                  border-bottom:1px solid var(--border);cursor:pointer;
                  border-left:3px solid ${_suite?.id===suite.id?'var(--yellow)':'transparent'}">
                <i class="bi bi-folder-fill" style="color:var(--yellow);font-size:13px;flex-shrink:0"></i>
                <span style="flex:1;font-size:12px;font-weight:600;overflow:hidden;
                  text-overflow:ellipsis;white-space:nowrap">${esc(suite.name)}</span>
                <button onclick="event.stopPropagation();PageProjects.showModal('section','${esc(suite.id)}')"
                  class="btn btn-xs btn-gh" title="Section baru" style="flex-shrink:0">
                  <i class="bi bi-plus-lg"></i>
                </button>
              </div>
              <!-- Sections di bawah suite ini -->
              ${_suite?.id===suite.id ? sections.map(sec => `
                <div onclick="PageProjects.selectSection('${esc(sec.id)}')"
                  style="display:flex;align-items:center;gap:7px;padding:6px 12px 6px 28px;
                    cursor:pointer;border-bottom:1px solid var(--border);font-size:11px;
                    background:${_section?.id===sec.id?'var(--blue-bg)':'transparent'};
                    border-left:3px solid ${_section?.id===sec.id?'var(--blue)':'transparent'}">
                  <i class="bi bi-folder2" style="color:var(--text3);font-size:11px;flex-shrink:0"></i>
                  <span style="flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;
                    white-space:nowrap;color:${_section?.id===sec.id?'var(--blue)':'var(--text2)'}">${esc(sec.name)}</span>
                  <button onclick="event.stopPropagation();PageProjects.deleteSection('${esc(sec.id)}')"
                    style="background:none;border:none;cursor:pointer;color:var(--text3);
                      font-size:10px;padding:1px;opacity:.5" title="Hapus">
                    <i class="bi bi-x"></i>
                  </button>
                </div>`).join('') : ''}
            </div>`).join('') :
            `<div style="text-align:center;padding:24px 12px;color:var(--text3)">
              <i class="bi bi-folder-x" style="font-size:1.6rem;display:block;margin-bottom:8px;opacity:.4"></i>
              <div style="font-size:11px">${_proj ? 'Belum ada suite' : 'Pilih project dulu'}</div>
              ${_proj ? `<button class="btn btn-d btn-sm" style="margin-top:8px"
                onclick="PageProjects.showModal('suite')">
                <i class="bi bi-plus-lg"></i> Buat Suite
              </button>` : ''}
            </div>`}
        </div>
      </div>

      <!-- Col 3: Test Cases -->
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:10px 16px;border-bottom:1px solid var(--border);background:var(--surface);
          display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
          <div>
            <span style="font-size:13px;font-weight:700">
              ${_section ? esc(_section.name) : 'Pilih Section'}
            </span>
            ${_section ? `<span style="font-size:10px;color:var(--text3);margin-left:8px">${tcs.length} test case</span>` : ''}
          </div>
          <div style="display:flex;gap:6px">
            ${_section ? `
              <button class="btn btn-d btn-sm" onclick="PageProjects.showModal('tc')">
                <i class="bi bi-plus-lg"></i> Test Case
              </button>` : ''}
          </div>
        </div>

        <div style="flex:1;overflow-y:auto;padding:12px 16px">
          ${_section ? (tcs.length ? `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <!-- Header -->
              <div style="display:grid;grid-template-columns:32px 1fr 100px 80px;
                padding:8px 14px;background:var(--surface2);border-bottom:1px solid var(--border)">
                ${['#','Test Case','Status','Aksi'].map(h=>`<div style="font-size:10px;font-weight:600;color:var(--text3)">${h}</div>`).join('')}
              </div>
              ${tcs.map((tc, i) => `
                <div style="display:grid;grid-template-columns:32px 1fr 100px 80px;
                  padding:9px 14px;border-bottom:1px solid var(--border);align-items:center;
                  transition:background .1s" class="tc-row">
                  <div style="font-size:11px;color:var(--text3);font-weight:600">${i+1}</div>
                  <div>
                    <div style="font-size:12px;font-weight:600;color:var(--text)">${esc(tc.name)}</div>
                    ${tc.description ? `<div style="font-size:10px;color:var(--text3)">${esc(tc.description)}</div>` : ''}
                  </div>
                  <div>
                    <span style="font-size:10px;padding:2px 7px;border-radius:4px;font-weight:600;
                      ${tc.status==='pass' ? 'background:#dcfce7;color:#16a34a' :
                        tc.status==='fail' ? 'background:#fee2e2;color:#dc2626' :
                        'background:var(--surface2);color:var(--text3)'}">
                      ${tc.status||'pending'}
                    </span>
                  </div>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-xs btn-d" onclick="PageProjects.openInInspector('${esc(tc.id)}')"
                      title="Buka di Inspector">
                      <i class="bi bi-search"></i>
                    </button>
                    <button class="btn btn-xs btn-danger" onclick="PageProjects.deleteTC('${esc(tc.id)}')"
                      title="Hapus">
                      <i class="bi bi-trash3"></i>
                    </button>
                  </div>
                </div>`).join('')}
            </div>` :
            `<div style="text-align:center;padding:40px 20px;color:var(--text3)">
              <i class="bi bi-file-earmark-x" style="font-size:2rem;display:block;margin-bottom:10px;opacity:.4"></i>
              <div style="font-size:13px;font-weight:600;margin-bottom:4px">Belum ada test case</div>
              <div style="font-size:11px;margin-bottom:16px">Tambahkan test case pertama di section ini</div>
              <button class="btn btn-p btn-sm" onclick="PageProjects.showModal('tc')">
                <i class="bi bi-plus-lg"></i> Test Case Baru
              </button>
            </div>`) :
            `<div style="text-align:center;padding:60px 20px;color:var(--text3)">
              <i class="bi bi-arrow-left-circle" style="font-size:2rem;display:block;margin-bottom:10px;opacity:.4"></i>
              <div style="font-size:13px;font-weight:600;margin-bottom:4px">Pilih Section</div>
              <div style="font-size:11px">Pilih section dari tree di kiri</div>
            </div>`}
        </div>
      </div>
    </div>

    <!-- Modal overlay -->
    <div id="proj-modal-overlay" style="display:none;position:fixed;inset:0;
      background:rgba(0,0,0,.4);z-index:1000;align-items:center;justify-content:center">
    </div>`

    // Add hover effect for project delete buttons
    document.querySelectorAll('.proj-del-btn').forEach(btn => {
      const row = btn.closest('div[onclick]')
      if (row) {
        row.addEventListener('mouseenter', () => btn.style.opacity = '1')
        row.addEventListener('mouseleave', () => btn.style.opacity = '0')
      }
    })
    // TC row hover
    document.querySelectorAll('.tc-row').forEach(row => {
      row.addEventListener('mouseenter', () => row.style.background = 'var(--surface2)')
      row.addEventListener('mouseleave', () => row.style.background = '')
    })
  }

  // ── Modal ──────────────────────────────────────────────────
  function showModal(type, parentId) {
    const overlay = document.getElementById('proj-modal-overlay')
    if (!overlay) return
    overlay.style.display = 'flex'

    const configs = {
      project: {
        title: 'Project Baru',
        icon:  'bi-folder-plus',
        fields: [
          { id:'m-name',     label:'Nama Project',      type:'text',   ph:'Misal: Login Flow, Checkout...' },
          { id:'m-platform', label:'Platform',           type:'select', opts:['android','ios','web'], val:'android' },
          { id:'m-color',    label:'Warna Label',        type:'color',  val:'#3b7eed' },
          { id:'m-desc',     label:'Deskripsi (opsional)', type:'text', ph:'Deskripsi singkat project...' },
        ],
        onSave: async (vals) => {
          const p = await window.api.db.saveProject({
            name:     vals['m-name'],
            platform: vals['m-platform'],
            color:    vals['m-color'],
            description: vals['m-desc'],
          })
          _proj = p; render(); toast(`✅ Project "${p.name}" dibuat`)
        }
      },
      suite: {
        title: 'Suite Baru',
        icon:  'bi-folder-fill',
        fields: [
          { id:'m-name', label:'Nama Suite', type:'text', ph:'Misal: Smoke Test, Regression...' },
          { id:'m-desc', label:'Deskripsi',  type:'text', ph:'Opsional...' },
        ],
        onSave: async (vals) => {
          if (!_proj) { toast('Pilih project dulu', 'error'); return }
          const s = await window.api.db.saveSuite({
            project_id: _proj.id,
            name: vals['m-name'],
            description: vals['m-desc'],
          })
          _suite = s; render(); toast(`✅ Suite "${s.name}" dibuat`)
        }
      },
      section: {
        title: 'Section Baru',
        icon:  'bi-folder2',
        fields: [
          { id:'m-name', label:'Nama Section', type:'text', ph:'Misal: Login, Checkout, Profile...' },
        ],
        onSave: async (vals) => {
          const sid = parentId || _suite?.id
          if (!sid) { toast('Pilih suite dulu', 'error'); return }
          const sec = await window.api.db.saveSection({
            suite_id: sid,
            name: vals['m-name'],
          })
          _section = sec; render(); toast(`✅ Section "${sec.name}" dibuat`)
        }
      },
      tc: {
        title: 'Test Case Baru',
        icon:  'bi-file-earmark-plus',
        fields: [
          { id:'m-name', label:'Nama Test Case', type:'text',     ph:'Misal: Login dengan email valid' },
          { id:'m-desc', label:'Deskripsi',       type:'textarea', ph:'Langkah-langkah atau tujuan test case...' },
          { id:'m-prio', label:'Prioritas',       type:'select',  opts:['high','medium','low'], val:'medium' },
        ],
        onSave: async (vals) => {
          if (!_section) { toast('Pilih section dulu', 'error'); return }
          await window.api.db.saveTestCase({
            section_id:  _section.id,
            name:        vals['m-name'],
            description: vals['m-desc'],
            priority:    vals['m-prio'],
            status:      'pending',
          })
          render(); toast('✅ Test case dibuat')
        }
      }
    }

    const cfg = configs[type]
    if (!cfg) return

    overlay.style.display = 'flex'
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;padding:24px;width:420px;max-width:90vw;
        box-shadow:var(--sh3);border:1px solid var(--border)">
        <!-- Header -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:36px;height:36px;background:var(--blue-bg);border-radius:9px;
            display:flex;align-items:center;justify-content:center;color:var(--blue)">
            <i class="bi ${cfg.icon}" style="font-size:17px"></i>
          </div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700">${cfg.title}</div>
          </div>
          <button onclick="PageProjects.closeModal()"
            style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text3);
              border-radius:6px;padding:2px 6px">✕</button>
        </div>
        <!-- Fields -->
        <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
          ${cfg.fields.map(f => `
            <div>
              <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">
                ${esc(f.label)}
              </label>
              ${f.type === 'select' ? `
                <select id="${f.id}" style="width:100%">
                  ${(f.opts||[]).map(o => `<option value="${o}" ${o===f.val?'selected':''}>${o}</option>`).join('')}
                </select>` :
              f.type === 'color' ? `
                <div style="display:flex;align-items:center;gap:8px">
                  <input type="color" id="${f.id}" value="${f.val||'#3b7eed'}"
                    style="width:40px;height:32px;border:1px solid var(--border);border-radius:6px;
                      cursor:pointer;padding:2px">
                  <span id="${f.id}-label" style="font-size:11px;color:var(--text3)">${f.val||'#3b7eed'}</span>
                </div>` :
              f.type === 'textarea' ? `
                <textarea id="${f.id}" placeholder="${esc(f.ph||'')}" rows="3"
                  style="width:100%;resize:vertical"></textarea>` :
              `<input type="text" id="${f.id}" placeholder="${esc(f.ph||'')}"
                style="width:100%" autocomplete="off">`}
            </div>`).join('')}
        </div>
        <!-- Actions -->
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-d" onclick="PageProjects.closeModal()">Batal</button>
          <button class="btn btn-p" onclick="PageProjects.saveModal('${type}','${parentId||''}')">
            <i class="bi bi-check-lg"></i> Simpan
          </button>
        </div>
      </div>`

    // Color input live update label
    cfg.fields.filter(f => f.type === 'color').forEach(f => {
      const inp = document.getElementById(f.id)
      const lbl = document.getElementById(f.id + '-label')
      if (inp && lbl) inp.addEventListener('input', () => lbl.textContent = inp.value)
    })

    // Focus first text input
    setTimeout(() => {
      const first = overlay.querySelector('input[type=text],textarea')
      if (first) first.focus()
    }, 50)

    // Enter key submit
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        PageProjects.saveModal(type, parentId||'')
      }
      if (e.key === 'Escape') PageProjects.closeModal()
    })
  }

  async function saveModal(type, parentId) {
    const configs = {
      project: { fields:['m-name','m-platform','m-color','m-desc'], required:'m-name' },
      suite:   { fields:['m-name','m-desc'], required:'m-name' },
      section: { fields:['m-name'], required:'m-name' },
      tc:      { fields:['m-name','m-desc','m-prio'], required:'m-name' },
    }
    const cfg = configs[type]
    if (!cfg) return

    const vals = {}
    for (const id of cfg.fields) {
      const el = document.getElementById(id)
      if (el) vals[id] = el.value.trim()
    }

    if (!vals[cfg.required]) {
      const el = document.getElementById(cfg.required)
      if (el) {
        el.style.borderColor = 'var(--red)'
        el.focus()
        setTimeout(() => { if (el) el.style.borderColor = '' }, 2000)
      }
      toast('⚠️ Nama wajib diisi', 'error')
      return
    }

    // Find and call the onSave from showModal context — use direct approach
    closeModal()

    const actions = {
      project: async (vals) => {
        const p = await window.api.db.saveProject({
          name: vals['m-name'], platform: vals['m-platform']||'android',
          color: vals['m-color']||'#3b7eed', description: vals['m-desc']||'',
        })
        _proj = p; render(); toast(`✅ Project "${p.name}" dibuat`)
      },
      suite: async (vals) => {
        if (!_proj) { toast('Pilih project dulu', 'error'); return }
        const s = await window.api.db.saveSuite({
          project_id: _proj.id, name: vals['m-name'], description: vals['m-desc']||'',
        })
        _suite = s; render(); toast(`✅ Suite "${s.name}" dibuat`)
      },
      section: async (vals) => {
        const sid = parentId || _suite?.id
        if (!sid) { toast('Pilih suite dulu', 'error'); return }
        const sec = await window.api.db.saveSection({ suite_id: sid, name: vals['m-name'] })
        _section = sec; render(); toast(`✅ Section "${sec.name}" dibuat`)
      },
      tc: async (vals) => {
        if (!_section) { toast('Pilih section dulu', 'error'); return }
        await window.api.db.saveTestCase({
          section_id: _section.id, name: vals['m-name'],
          description: vals['m-desc']||'', priority: vals['m-prio']||'medium', status: 'pending',
        })
        render(); toast('✅ Test case dibuat')
      },
    }

    try {
      await actions[type]?.(vals)
    } catch (err) {
      toast(`Gagal simpan: ${err.message}`, 'error')
    }
  }

  function closeModal() {
    const overlay = document.getElementById('proj-modal-overlay')
    if (overlay) overlay.style.display = 'none'
  }

  // ── Select ─────────────────────────────────────────────────
  async function selectProject(id) {
    const projects = await window.api.db.getProjects()
    _proj = projects.find(p => String(p.id) === String(id)) || null
    _suite = null; _section = null
    render()
  }
  async function selectSuite(id) {
    const suites = await window.api.db.getSuites(_proj?.id)
    _suite = suites.find(s => String(s.id) === String(id)) || null
    _section = null
    render()
  }
  async function selectSection(id) {
    const sections = await window.api.db.getSections(_suite?.id)
    _section = sections.find(s => String(s.id) === String(id)) || null
    render()
  }

  // ── Delete ─────────────────────────────────────────────────
  async function deleteProject(id) {
    if (!confirm('Hapus project ini beserta semua suites, sections, dan test cases di dalamnya?')) return
    await window.api.db.deleteProject(id)
    _proj = null; _suite = null; _section = null
    render(); toast('Project dihapus')
  }
  async function deleteSection(id) {
    if (!confirm('Hapus section ini?')) return
    await window.api.db.deleteSection(id)
    _section = null; render()
  }
  async function deleteTC(id) {
    await window.api.db.deleteTestCase(id)
    render(); toast('Test case dihapus')
  }

  function openInInspector(tcId) {
    navigate('inspector')
    toast('💡 Buka Inspector & tambahkan steps, lalu klik Simpan ke TC')
  }

  // Legacy stubs
  function newProject()        { showModal('project') }
  function newSuite()          { showModal('suite') }
  function newSection(sid)     { showModal('section', sid) }
  function newTC()             { showModal('tc') }

  return {
    render, selectProject, selectSuite, selectSection,
    showModal, saveModal, closeModal,
    newProject, newSuite, newSection, newTC,
    deleteProject, deleteSection, deleteTC, openInInspector,
  }
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