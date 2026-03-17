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

    // Ambil TCs: dari section yang dipilih, ATAU dari suite langsung (tanpa section)
    let tcs = []
    if (_section) {
      tcs = await window.api.db.getTestCases(_section.id)
    } else if (_suite) {
      // TCs yang disimpan langsung ke suite (dari Inspector "Simpan ke TC" tanpa section)
      try {
        tcs = await window.api.db.getTestCasesBySuite(_suite.id)
      } catch (e) {
        tcs = []
      }
    }

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
            ${(_section || _suite) ? `
              <button class="btn btn-p btn-sm" onclick="PageProjects.goToInspector()"
                title="Buat test case baru di Inspector">
                <i class="bi bi-search"></i> Buat di Inspector
              </button>` : ''}
          </div>
        </div>

        <div style="flex:1;overflow-y:auto;padding:12px 16px">
          ${_section ? (tcs.length ? `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <!-- Header -->
              <div style="display:grid;grid-template-columns:32px 1fr 80px 70px 100px;
                padding:8px 14px;background:var(--surface2);border-bottom:1px solid var(--border)">
                ${['#','Test Case','Prioritas','Steps','Aksi'].map(h =>
                  `<div style="font-size:10px;font-weight:600;color:var(--text3)">${h}</div>`
                ).join('')}
              </div>
              ${tcs.map((tc, i) => {
                const stepsCount = tc.steps_count || (tc.dsl_yaml
                  ? tc.dsl_yaml.split('\n').filter(l => l.trim().startsWith('- ')).length : 0)
                const prioColor = tc.priority==='high' ? '#dc2626' :
                                  tc.priority==='low'  ? '#6b7280' : '#f97316'
                const prioBg    = tc.priority==='high' ? '#fee2e2' :
                                  tc.priority==='low'  ? '#f3f4f6' : '#fff7ed'
                return `
                <div style="display:grid;grid-template-columns:32px 1fr 80px 70px 100px;
                  padding:9px 14px;border-bottom:1px solid var(--border);align-items:center;
                  transition:background .1s" class="tc-row">
                  <div style="font-size:11px;color:var(--text3);font-weight:600">${i+1}</div>
                  <div>
                    <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px">
                      ${esc(tc.name)}
                    </div>
                    ${tc.description ? `<div style="font-size:10px;color:var(--text3);
                      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">
                      ${esc(tc.description)}</div>` : ''}
                  </div>
                  <div>
                    <span style="font-size:10px;padding:2px 7px;border-radius:4px;font-weight:600;
                      background:${prioBg};color:${prioColor}">
                      ${tc.priority||'medium'}
                    </span>
                  </div>
                  <div style="font-size:11px;color:var(--text3)">
                    ${stepsCount > 0 ? `
                      <span style="display:flex;align-items:center;gap:3px">
                        <i class="bi bi-list-check" style="color:var(--blue)"></i>
                        ${stepsCount} steps
                      </span>` : '<span style="opacity:.4">—</span>'}
                  </div>
                  <div style="display:flex;gap:4px">
                    ${(tc.dsl_yaml || tc.steps_yaml) ? `
                      <button class="btn btn-xs btn-d"
                        onclick="PageProjects.previewDSL('${esc(tc.id)}')"
                        title="Lihat DSL YAML">
                        <i class="bi bi-code-slash"></i>
                      </button>` : ''}
                    <button class="btn btn-xs btn-d"
                      onclick="PageProjects.openInInspector('${esc(tc.id)}')"
                      title="Buka di Inspector">
                      <i class="bi bi-search"></i>
                    </button>
                    <button class="btn btn-xs btn-danger"
                      onclick="PageProjects.deleteTC('${esc(tc.id)}')"
                      title="Hapus">
                      <i class="bi bi-trash3"></i>
                    </button>
                  </div>
                </div>`}).join('')}
            </div>` :
            `<div style="text-align:center;padding:40px 20px;color:var(--text3)">
              <i class="bi bi-file-earmark-x" style="font-size:2rem;display:block;margin-bottom:10px;opacity:.4"></i>
              <div style="font-size:13px;font-weight:600;margin-bottom:4px">Belum ada test case</div>
              <div style="font-size:11px;margin-bottom:16px;line-height:1.6">
                Buat skenario di <b>Inspector & Editor</b>,<br>lalu klik <b>Simpan ke TC</b>
              </div>
              <button class="btn btn-p btn-sm" onclick="PageProjects.goToInspector()">
                <i class="bi bi-search"></i> Buka Inspector
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

  function goToInspector() {
    // Clear active TC — mode buat baru
    AppState.activeTcId   = null
    AppState.activeTcName = null
    navigate('inspector')
    toast('Buat skenario di Inspector, lalu klik Simpan ke TC')
  }

  async function openInInspector(tcId) {
    // Set active TC — Inspector akan tahu ini mode edit/update
    try {
      const tc = await window.api.db.getTestCaseById(tcId)
      AppState.activeTcId   = tcId
      AppState.activeTcName = tc?.name || 'Test Case'
      navigate('inspector')
      toast(`✏️ Mode edit: "${tc?.name}" — klik Simpan ke TC untuk update`)
    } catch (e) {
      AppState.activeTcId   = tcId
      AppState.activeTcName = null
      navigate('inspector')
    }
  }

  async function previewDSL(tcId) {
    let tc = null
    try {
      tc = await window.api.db.getTestCaseById(tcId)
    } catch (e) { /* fallback */ }
    const yaml = tc?.dsl_yaml || tc?.steps_yaml || '# Tidak ada DSL'

    const overlay = document.createElement('div')
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;
      display:flex;align-items:center;justify-content:center`
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:12px;padding:20px;width:520px;
        max-width:92vw;max-height:80vh;display:flex;flex-direction:column;
        box-shadow:var(--sh3);border:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:14px;font-weight:700">
            <i class="bi bi-code-slash" style="color:var(--blue);margin-right:6px"></i>
            DSL YAML — ${esc(tc?.name || 'Test Case')}
          </div>
          <button onclick="this.closest('div[style*=fixed]').remove()"
            style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text3)">✕</button>
        </div>
        <pre style="flex:1;overflow:auto;background:#0d1117;color:#e6edf3;border-radius:8px;
          padding:14px;font-size:11px;line-height:1.7;font-family:var(--font-mono);
          margin:0;white-space:pre-wrap;word-break:break-all">${esc(yaml)}</pre>
        <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:6px">
          <button class="btn btn-d btn-sm" onclick="copyText(\`${esc(yaml)}\`)">
            <i class="bi bi-copy"></i> Copy
          </button>
          <button class="btn btn-d btn-sm" onclick="this.closest('div[style*=fixed]').remove()">Tutup</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    overlay.addEventListener('keydown', e => { if (e.key==='Escape') overlay.remove() })
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
    deleteProject, deleteSection, deleteTC,
    goToInspector, openInInspector, previewDSL,
  }
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
    const content    = document.getElementById('content-area')
    const ta         = document.getElementById('topbar-actions')
    ta.innerHTML     = ''
    const dataPath   = await window.api.system.getDataPath().catch(() => '~')
    const version    = await window.api.system.getAppVersion().catch(() => '1.0.0')
    const deps       = await window.api.setup.checkDeps().catch(() => ({}))
    const evidenceDir = await window.api.db.getSetting('evidence_dir').catch(() => null) || ''

    content.innerHTML = `
    <div style="max-width:540px;padding:16px">

      <!-- Evidence & Storage -->
      <div class="card mb10">
        <div class="card-title mb10"><i class="bi bi-folder-fill" style="color:var(--yellow)"></i> Evidence & Storage</div>

        <div class="field mb8">
          <label class="fl">Folder Evidence</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input type="text" id="ev-dir" value="${esc(evidenceDir)}" readonly
              placeholder="${esc(dataPath)}/evidence"
              style="flex:1;font-size:10.5px;font-family:var(--font-mono);cursor:pointer;background:var(--surface2)"
              onclick="PageSettings.pickEvidenceDir()">
            <button class="btn btn-d btn-sm" onclick="PageSettings.pickEvidenceDir()">
              <i class="bi bi-folder2-open"></i>
            </button>
            ${evidenceDir ? `
            <button class="btn btn-d btn-sm" onclick="window.api.system.openExternal('${esc(evidenceDir)}')"
              title="Buka di Finder">
              <i class="bi bi-box-arrow-up-right"></i>
            </button>` : ''}
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">
            Screenshot & log dari Test Run disimpan di folder ini, diorganisir per run.
          </div>
        </div>

        <div class="field mb8">
          <label class="fl">Database</label>
          <div style="display:flex;gap:6px;align-items:center">
            <code class="mono xs" style="flex:1;background:var(--surface2);
              padding:5px 9px;border-radius:6px;font-size:10px">
              ${esc(dataPath)}/data/testpilot.db
            </code>
            <button class="btn btn-d btn-sm" onclick="window.api.system.openExternal('${esc(dataPath)}')">
              <i class="bi bi-folder2-open"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Binary Paths -->
      <div class="card mb10">
        <div class="card-title mb4"><i class="bi bi-wrench-adjustable"></i> Binary Paths</div>
        <div class="card-sub" style="margin-bottom:10px">Diisi otomatis oleh Setup Wizard</div>
        ${[['ADB', deps.adb?.path||'–', deps.adb?.ok],
           ['Java', deps.java?.path||'–', deps.java?.ok],
           ['Maestro', deps.maestro?.path||'–', deps.maestro?.ok]].map(([l,v,ok]) => `
          <div class="field mb8">
            <label class="fl">${l}
              <span class="badge ${ok?'b-pass':'b-fail'}" style="font-size:9px;margin-left:4px">
                ${ok?'OK':'Tidak ditemukan'}
              </span>
            </label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="text" value="${esc(v)}" class="w100 mono"
                style="font-size:10px;flex:1" readonly>
            </div>
          </div>`).join('')}
        <button class="btn btn-p btn-sm" onclick="navigate('setup')">
          <i class="bi bi-lightning-charge-fill"></i> Jalankan Setup Ulang
        </button>
      </div>

      <!-- Tentang -->
      <div class="card">
        <div class="card-title mb8"><i class="bi bi-info-circle"></i> Tentang</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div class="sm fw6">TestPilot v${esc(version)}</div>
            <div class="xs muted">Electron · better-sqlite3 · Maestro CLI · ADB</div>
          </div>
          <button class="btn btn-d btn-sm" onclick="navigate('setup')">
            <i class="bi bi-arrow-repeat"></i> Cek Update
          </button>
        </div>
      </div>
    </div>`
  }

  async function pickEvidenceDir() {
    const result = await window.api.system.openFileDialog({
      properties: ['openDirectory','createDirectory'],
      title: 'Pilih folder untuk menyimpan evidence',
    }).catch(() => null)
    if (result?.canceled || !result?.filePaths?.length) return
    const dir = result.filePaths[0]
    await window.api.db.setSetting('evidence_dir', dir)
    const inp = document.getElementById('ev-dir')
    if (inp) inp.value = dir
    toast(`✅ Evidence folder disimpan: ${dir}`)
    render()
  }

  return { render, pickEvidenceDir }
})()