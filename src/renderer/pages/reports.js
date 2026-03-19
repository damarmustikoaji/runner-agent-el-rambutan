/* pages/reports.js */
window.PageReports = (() => {
  'use strict'

  let _selProjId  = null
  let _filterSt   = 'all'
  let _searchQ    = ''

  async function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    ta.innerHTML  = `
      <button class="btn btn-d btn-sm" onclick="PageReports.exportCSV()">
        <i class="bi bi-download"></i> Export CSV
      </button>`

    content.innerHTML = `<div style="padding:24px;color:var(--text3);font-size:12px">
      <i class="bi bi-arrow-clockwise" style="animation:spin .7s linear infinite"></i> Memuat...</div>`

    const projects = await window.api.db.getProjects().catch(() => [])
    if (!_selProjId && projects.length) _selProjId = projects[0].id

    const allRuns = await window.api.db.getAllRuns().catch(() => [])
    let runs = allRuns

    // Filter per project kalau dipilih
    if (_selProjId) runs = runs.filter(r => r.project_id === _selProjId)

    // Filter status
    if (_filterSt !== 'all') runs = runs.filter(r => r.status === _filterSt)

    // Filter search
    if (_searchQ) {
      const q = _searchQ.toLowerCase()
      runs = runs.filter(r => r.plan_name?.toLowerCase().includes(q) || r.device?.toLowerCase().includes(q))
    }

    // Summary stats dari runs yang difilter
    const totalPass  = runs.reduce((s,r) => s+(r.pass||0), 0)
    const totalFail  = runs.reduce((s,r) => s+(r.fail||0), 0)
    const totalTCRan = totalPass + totalFail
    const passRate   = totalTCRan > 0 ? Math.round(totalPass/totalTCRan*100) : 0
    const avgDur     = runs.filter(r=>r.duration_ms).length
      ? Math.round(runs.filter(r=>r.duration_ms).reduce((s,r)=>s+(r.duration_ms||0),0) / runs.filter(r=>r.duration_ms).length)
      : 0
    const projMap = {}
    projects.forEach(p => { projMap[p.id] = p.name })

    content.innerHTML = `
    <div style="padding:20px;display:flex;flex-direction:column;gap:14px">

      <!-- Summary stats -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
        ${[
          { n: allRuns.length,                            l: 'Total Runs',   c: 'var(--text)',  i: 'bi-play-circle' },
          { n: allRuns.filter(r=>r.status==='pass').length, l: 'Lulus',       c: '#16a34a',      i: 'bi-check-circle-fill' },
          { n: allRuns.filter(r=>r.status==='fail').length, l: 'Gagal',       c: '#dc2626',      i: 'bi-x-circle-fill' },
          { n: passRate+'%',                              l: 'Pass Rate',    c: passRate>=70?'#16a34a':'#ea580c', i: 'bi-percent' },
          { n: avgDur ? (avgDur/1000).toFixed(1)+'s':'—', l: 'Avg Durasi',  c: 'var(--blue)',  i: 'bi-stopwatch' },
        ].map(s => `
          <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 14px">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
              <i class="bi ${s.i}" style="font-size:11px;color:${s.c}"></i>
              <span style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.3px">${s.l}</span>
            </div>
            <div style="font-size:22px;font-weight:800;color:${s.c};line-height:1">${s.n}</div>
          </div>`).join('')}
      </div>

      <!-- Filter bar -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;
        padding:10px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">

        <!-- Project filter -->
        <select style="font-size:11px" onchange="PageReports.filterProj(this.value)">
          <option value="">Semua Project</option>
          ${projects.map(p => `<option value="${p.id}" ${p.id===_selProjId?'selected':''}>${esc(p.name)}</option>`).join('')}
        </select>

        <!-- Status filter -->
        <div style="display:flex;gap:4px">
          ${[['all','Semua'],['pass','Lulus'],['fail','Gagal'],['pending','Pending']].map(([v,l]) => `
            <button onclick="PageReports.filterStatus('${v}')"
              style="font-size:11px;padding:3px 10px;border-radius:5px;border:1px solid var(--border);
                cursor:pointer;font-weight:600;
                background:${_filterSt===v?'var(--blue)':'var(--surface2)'};
                color:${_filterSt===v?'#fff':'var(--text2)'}">
              ${l}
            </button>`).join('')}
        </div>

        <!-- Search -->
        <input type="text" value="${esc(_searchQ)}" placeholder="🔍 Cari nama run, device..."
          style="font-size:11px;flex:1;min-width:160px"
          oninput="PageReports.search(this.value)">

        <span style="font-size:11px;color:var(--text3);margin-left:auto;white-space:nowrap">
          ${runs.length} dari ${allRuns.length} run
        </span>
      </div>

      <!-- Run table -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        ${runs.length ? `
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--surface2);border-bottom:1px solid var(--border)">
              ${['Nama Run','Project','Device','TC Pass','TC Fail','Durasi','Tanggal','Status'].map(h =>
                `<th style="padding:8px 12px;font-size:10px;font-weight:700;color:var(--text3);
                  text-transform:uppercase;letter-spacing:.3px;text-align:left;white-space:nowrap">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>
            ${runs.map(r => {
              const dur   = r.duration_ms ? (r.duration_ms>=60000
                ? Math.floor(r.duration_ms/60000)+'m '+Math.round((r.duration_ms%60000)/1000)+'s'
                : (r.duration_ms/1000).toFixed(1)+'s') : '—'
              const date  = r.created_at
                ? new Date(r.created_at).toLocaleString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
                : '—'
              const sc = r.status==='pass'?'#16a34a':r.status==='fail'?'#dc2626':r.status==='running'?'#2563eb':'#7c3aed'
              const sb = r.status==='pass'?'#dcfce7':r.status==='fail'?'#fee2e2':r.status==='running'?'#dbeafe':'#ede9fe'
              const total = (r.pass||0)+(r.fail||0)
              const pct   = total>0 ? Math.round((r.pass||0)/total*100) : 0
              return `
              <tr style="border-bottom:1px solid var(--border);cursor:pointer"
                onmouseenter="this.style.background='var(--surface2)'"
                onmouseleave="this.style.background=''"
                onclick="PageReports.openRun('${esc(r.id)}')">
                <td style="padding:10px 12px">
                  <div style="font-size:12px;font-weight:600">${esc(r.plan_name)}</div>
                  ${r.environment ? `<div style="font-size:10px;color:var(--text3)">${esc(r.environment)}</div>` : ''}
                </td>
                <td style="padding:10px 12px;font-size:11px;color:var(--text3)">
                  ${esc(projMap[r.project_id]||'—')}
                </td>
                <td style="padding:10px 12px;font-size:11px;color:var(--text3);font-family:var(--font-mono)">
                  ${esc(r.device||'—')}
                </td>
                <td style="padding:10px 12px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:12px;font-weight:700;color:#16a34a">${r.pass||0}</span>
                    ${total ? `
                    <div style="width:40px;height:4px;background:var(--surface3);border-radius:2px;overflow:hidden">
                      <div style="height:100%;width:${pct}%;background:#16a34a;border-radius:2px"></div>
                    </div>` : ''}
                  </div>
                </td>
                <td style="padding:10px 12px;font-size:12px;font-weight:700;
                  color:${(r.fail||0)>0?'#dc2626':'var(--text3)'}">
                  ${r.fail||0}
                </td>
                <td style="padding:10px 12px;font-size:11px;color:var(--text3);font-family:var(--font-mono)">${dur}</td>
                <td style="padding:10px 12px;font-size:11px;color:var(--text3);white-space:nowrap">${date}</td>
                <td style="padding:10px 12px">
                  <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;
                    background:${sb};color:${sc};text-transform:uppercase">
                    ${r.status||'pending'}
                  </span>
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>` : `
        <div style="text-align:center;padding:48px;color:var(--text3)">
          <i class="bi bi-bar-chart-line" style="font-size:2rem;display:block;margin-bottom:12px;opacity:.3"></i>
          <div style="font-size:14px;font-weight:600;margin-bottom:6px">Belum ada data</div>
          <div style="font-size:12px;margin-bottom:16px">
            ${_filterSt!=='all'||_searchQ ? 'Tidak ada run yang sesuai filter' : 'Jalankan test untuk melihat history'}
          </div>
          ${_filterSt!=='all'||_searchQ ? `
          <button class="btn btn-d btn-sm" onclick="PageReports.resetFilter()">Reset Filter</button>` : `
          <button class="btn btn-p btn-sm" onclick="navigate('testrun')">
            <i class="bi bi-play-fill"></i> Jalankan Test
          </button>`}
        </div>`}
      </div>
    </div>`
  }

  // ── Filter controls ────────────────────────────────────────
  function filterProj(id) { _selProjId = id || null; render() }
  function filterStatus(st) { _filterSt = st; render() }
  function search(q) { _searchQ = q; render() }
  function resetFilter() { _filterSt = 'all'; _searchQ = ''; render() }

  async function openRun(runId) {
    // Buka di Test Run detail view
    window.PageTestRun && await window.PageTestRun.openDetail(runId)
    navigate('testrun')
  }

  async function exportCSV() {
    const allRuns = await window.api.db.getAllRuns().catch(() => [])
    const projects = await window.api.db.getProjects().catch(() => [])
    const projMap = {}
    projects.forEach(p => { projMap[p.id] = p.name })

    const rows = [
      ['Nama Run','Project','Device','Environment','Pass','Fail','Durasi (s)','Status','Tanggal'].join(','),
      ...allRuns.map(r => [
        '"'+String(r.plan_name||'').replace(/"/g,'""')+'"',
        '"'+(projMap[r.project_id]||'')+'"',
        '"'+(r.device||'')+'"',
        '"'+(r.environment||'')+'"',
        r.pass||0, r.fail||0,
        r.duration_ms ? (r.duration_ms/1000).toFixed(1) : '',
        r.status||'',
        r.created_at||'',
      ].join(','))
    ].join('\n')

    const blob = new Blob([rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = 'mustlab-reports-' + new Date().toISOString().slice(0,10) + '.csv'
    a.click()
    URL.revokeObjectURL(url)
    toast('✅ CSV berhasil didownload')
  }

  return { render, filterProj, filterStatus, search, resetFilter, openRun, exportCSV }
})()