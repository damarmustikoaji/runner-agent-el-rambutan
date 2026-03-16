/* pages/dashboard.js */
window.PageDashboard = (() => {
  'use strict'

  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = `
      <button class="btn btn-d btn-sm" id="dash-proj-select"></button>
      <button class="btn btn-p btn-sm" onclick="navigate('testrun')">
        <i class="bi bi-play-fill"></i> Run Test
      </button>`

    content.innerHTML = `<div class="loading-screen"><div class="loading-icon"><i class="bi bi-arrow-clockwise"></i></div><div>Memuat dashboard...</div></div>`

    try {
      const projects = await window.api.db.getProjects()
      AppState.cache.projects = projects

      const selEl = document.getElementById('dash-proj-select')
      if (selEl && projects.length) {
        selEl.outerHTML = `<select id="dash-proj-sel" style="font-size:11px" onchange="PageDashboard.switchProject(this.value)">
          ${projects.map(p => `<option value="${esc(p.id)}" ${p.id===AppState.cache.activeProj?.id?'selected':''}>${esc(p.name)}</option>`).join('')}
        </select>`
        if (!AppState.cache.activeProj) AppState.cache.activeProj = projects[0]
      }

      const proj    = AppState.cache.activeProj || projects[0]
      const runs    = proj ? await window.api.db.getRuns(proj.id) : []
      const suites  = proj ? await window.api.db.getSuites(proj.id) : []

      // Count all TCs
      let tcTotal = 0, tcPass = 0, tcFail = 0, tcPend = 0
      for (const suite of suites) {
        const secs = await window.api.db.getSections(suite.id)
        for (const sec of secs) {
          const tcs = await window.api.db.getTestCases(sec.id)
          tcTotal += tcs.length
          tcPass  += tcs.filter(t => t.status === 'pass').length
          tcFail  += tcs.filter(t => t.status === 'fail').length
          tcPend  += tcs.filter(t => t.status === 'pending').length
        }
      }

      content.innerHTML = `
      <div class="stats5">
        ${[
          {n:tcTotal, l:'Total TC',    c:'var(--text)'},
          {n:tcPass,  l:'Lulus',       c:'var(--green)'},
          {n:tcFail,  l:'Gagal',       c:'var(--red)'},
          {n:tcPend,  l:'Pending',     c:'var(--yellow)'},
          {n:runs.length, l:'Total Runs', c:'var(--blue)'},
        ].map(s => `<div class="sc"><div class="sn" style="color:${s.c}">${s.n}</div><div class="sl">${s.l}</div></div>`).join('')}
      </div>

      <div class="flex g12">
        <div class="card" style="flex:1">
          <div class="card-title mb4"><i class="bi bi-clock-history"></i> Run Terakhir</div>
          <div class="card-sub">5 run terbaru</div>
          ${runs.slice(0,5).map(r => `
            <div class="flex ic g10" style="padding:7px 0;border-bottom:1px solid var(--border)">
              <div style="flex:1">
                <div class="sm fw6">${esc(r.plan_name)}</div>
                <div class="xs muted">${r.started_at || r.created_at} · ${r.duration_ms ? (r.duration_ms/1000).toFixed(1)+'s' : '–'}</div>
              </div>
              <div class="mini-bar">
                <div class="mb-p" style="width:${r.pass+r.fail>0?Math.round(r.pass/(r.pass+r.fail)*100):0}%"></div>
                <div class="mb-f" style="width:${r.pass+r.fail>0?Math.round(r.fail/(r.pass+r.fail)*100):0}%"></div>
                <div class="mb-s" style="flex:1"></div>
              </div>
              <span class="badge ${r.status==='pass'?'b-pass':r.status==='fail'?'b-fail':'b-pend'}">${r.status||'–'}</span>
            </div>`).join('') || '<div class="empty-s" style="padding:16px"><p>Belum ada run</p></div>'}
          <button class="btn btn-gh btn-sm mt8 w100" onclick="navigate('reports')">
            Lihat semua <i class="bi bi-arrow-right"></i>
          </button>
        </div>

        <div class="card" style="flex:1">
          <div class="card-title mb4"><i class="bi bi-list-check"></i> Status Suites — ${esc(proj?.name||'–')}</div>
          <div class="card-sub">Progress per use case</div>
          ${suites.map(s => `
            <div style="padding:7px 0;border-bottom:1px solid var(--border)">
              <div class="flex ic jb mb4">
                <div class="sm fw6">${esc(s.name)}</div>
              </div>
              <div style="height:4px;background:var(--surface3);border-radius:2px"></div>
            </div>`).join('') || '<div class="empty-s" style="padding:16px"><p>Belum ada suite</p></div>'}
        </div>
      </div>

      <div class="card mt12">
        <div class="card-title mb8"><i class="bi bi-lightning-fill"></i> Aksi Cepat</div>
        <div class="flex g6 wrap">
          ${[
            ['bi-search','Inspector & Editor','inspector'],
            ['bi-folder-plus','Project Baru','projects'],
            ['bi-play-circle-fill','Jalankan Test','testrun'],
            ['bi-bar-chart-line','Laporan','reports'],
            ['bi-tree-fill','Environments','environments'],
            ['bi-gear','Setup','setup'],
          ].map(([i,l,p]) => `<button class="btn btn-d btn-sm" onclick="navigate('${p}')">
            <i class="bi ${i}"></i> ${l}
          </button>`).join('')}
        </div>
      </div>`

    } catch (err) {
      console.error('[dashboard] render error:', err)
      content.innerHTML = `<div class="empty-s"><div class="ei"><i class="bi bi-exclamation-triangle"></i></div><h3>Gagal memuat dashboard</h3><p>${esc(err.message)}</p></div>`
    }
  }

  async function switchProject(id) {
    const projects = AppState.cache.projects || []
    AppState.cache.activeProj = projects.find(p => p.id === id)
    await render()
  }

  return { render, switchProject }
})()