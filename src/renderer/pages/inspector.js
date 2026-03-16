/* pages/inspector.js
 *
 * Inspector & Editor — halaman inti MVP.
 * Features:
 * - Device selector + app config (package/upload APK)
 * - Screenshot live dari device (base64 PNG via ADB)
 * - XML hierarchy dump → element tree
 * - Hover + klik element di tree → highlight overlay di screenshot
 * - Klik di screenshot → cari element di koordinat tersebut
 * - Tap element ke device langsung dari UI
 * - Step editor dengan selector auto-insert
 * - Run steps via Maestro (session isolated dari inspector)
 * - Debug log tab
 */
window.PageInspector = (() => {
  'use strict'

  // ── State ──────────────────────────────────────────────────
  let _serial       = null   // device serial aktif
  let _screenW      = 1080
  let _screenH      = 1920
  let _imgW         = 0      // rendered width di UI
  let _imgH         = 0      // rendered height di UI
  let _elements     = []     // parsed element list dari XML
  let _hoveredId    = null
  let _selectedEl   = null
  let _debugLogs    = []
  let _steps        = []     // editor steps
  let _stepSt       = {}     // { stepId: 'pass'|'fail'|'run' }
  let _editorTab    = 'steps'
  let _leftTab      = 'xml'
  let _packages     = []
  let _cfgOpen      = false
  let _nextStepId   = 1

  const ACTS = {
    launch:           { l:'Buka App',       f:['package'] },
    tap:              { l:'Tap',            f:['selector','desc'] },
    longPress:        { l:'Long Press',     f:['selector','desc'] },
    input:            { l:'Ketik Teks',     f:['selector','value','desc'] },
    clearText:        { l:'Clear Text',     f:['selector','desc'] },
    swipe:            { l:'Swipe',          f:['direction','desc'] },
    scroll:           { l:'Scroll',         f:['direction','desc'] },
    assertText:       { l:'Assert Teks',    f:['selector','expected','desc'] },
    assertVisible:    { l:'Assert Ada',     f:['selector','desc'] },
    assertNotVisible: { l:'Assert Tidak Ada',f:['selector','desc'] },
    wait:             { l:'Tunggu',         f:['ms'] },
    back:             { l:'Tombol Back',    f:['desc'] },
    screenshot:       { l:'Screenshot',    f:['name'] },
  }
  const ACT_ICONS = {
    launch:'rocket-takeoff', tap:'hand-index', longPress:'hand-index-thumb',
    input:'keyboard', clearText:'eraser', swipe:'arrows-move', scroll:'arrow-down-up',
    assertText:'check-circle', assertVisible:'eye', assertNotVisible:'eye-slash',
    wait:'hourglass-split', back:'arrow-left-circle', screenshot:'camera',
  }
  const FLD_CFG = {
    package:   { l:'Package Name',      ph:'com.example.app',          w:190 },
    selector:  { l:'Selector',          ph:'id/... atau text/...',      w:200 },
    value:     { l:'Value',             ph:'teks input...',             w:140 },
    expected:  { l:'Expected',          ph:'teks diharapkan',           w:140 },
    desc:      { l:'Catatan',           ph:'keterangan...',             w:150 },
    direction: { l:'Arah',  type:'sel', opts:['up','down','left','right'], w:82 },
    ms:        { l:'Durasi(ms)', type:'num', ph:'1000',                 w:76 },
    name:      { l:'Nama File',         ph:'step_01',                   w:120 },
  }

  // ── Render ─────────────────────────────────────────────────
  function render() {
    const content = document.getElementById('content-area')
    const ta      = document.getElementById('topbar-actions')
    content.className = 'content-area no-pad'

    ta.innerHTML = `
      <button class="btn btn-d btn-sm" onclick="PageInspector.connectDevice()">
        <i class="bi bi-phone-fill"></i> Connect Device
      </button>
      <div class="tb-div"></div>
      <button class="btn btn-g btn-sm" id="btn-run-steps" onclick="PageInspector.runSteps()">
        <i class="bi bi-play-fill"></i> Run Steps
      </button>
      <button class="btn btn-d btn-sm" onclick="PageInspector.exportDSL()">
        <i class="bi bi-download"></i> Export DSL
      </button>
      <button class="btn btn-d btn-sm" onclick="PageInspector.saveToTC()">
        <i class="bi bi-save"></i> Simpan ke TC
      </button>`

    content.innerHTML = `
    <div class="insp-wrap">

      <!-- ── LEFT: Device + Screen + Tabs ── -->
      <div class="insp-L">

        <!-- Device Config -->
        <div class="dcw">
          <div class="dch">
            <div class="fw7 xs flex ic g6"><i class="bi bi-broadcast-pin"></i> Device &amp; Konfigurasi</div>
            <button class="btn btn-xs btn-d" onclick="PageInspector.toggleConfig()">
              <i class="bi bi-sliders"></i> Config
            </button>
          </div>
          <div class="dcb">
            <!-- Device list -->
            <div class="field">
              <label class="fl"><i class="bi bi-phone"></i> Device Terhubung</label>
              <div id="device-list">${renderDeviceList()}</div>
            </div>
            <!-- Extended config -->
            <div id="insp-ext-cfg" style="display:none">
              <div class="divider" style="margin:6px 0"></div>
              <div class="r2 mb6">
                <div class="field">
                  <label class="fl">Package Name</label>
                  <input type="text" id="cfg-pkg" class="w100" placeholder="com.example.app"
                    value="${AppState.inspector.pkg||''}"
                    oninput="AppState.inspector.pkg=this.value">
                </div>
                <div class="field">
                  <label class="fl">Orientasi</label>
                  <select class="w100" onchange="AppState.inspector.orient=this.value">
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
              </div>
              <div class="field mb6">
                <label class="fl"><i class="bi bi-file-earmark-arrow-up"></i> Upload APK</label>
                <input type="file" class="w100" accept=".apk" onchange="PageInspector.handleApkUpload(this)">
              </div>
              <div class="flex g12 wrap">
                ${[['noReset','No Reset'],['noSign','No Sign'],['autoGrant','Auto Grant Perms']]
                  .map(([k,l]) => `<label class="flex ic g5" style="cursor:pointer;font-size:11px">
                    <input type="checkbox" onchange="AppState.inspector.${k}=this.checked" style="accent-color:var(--blue)"> ${l}
                  </label>`).join('')}
              </div>
              <!-- Package selector -->
              <div class="field mt6">
                <label class="fl">Pilih Package Terinstall</label>
                <select class="w100" id="pkg-select" onchange="PageInspector.selectPackage(this.value)">
                  <option value="">-- Pilih package --</option>
                  ${_packages.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
                </select>
                <button class="btn btn-d btn-xs mt6" onclick="PageInspector.loadPackages()">
                  <i class="bi bi-arrow-clockwise"></i> Refresh Packages
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Screen + XML tabs -->
        <div class="panel" style="flex:1;min-height:0">
          <div class="ph">
            <div class="ph-title"><i class="bi bi-phone-landscape-fill"></i> App Screen</div>
            <div class="flex ic g4">
              <span class="badge ${_serial?'b-pass':'b-pend'}" id="conn-badge">
                ${_serial || 'Tidak Terhubung'}
              </span>
              <button class="btn btn-xs btn-gh" onclick="PageInspector.refreshScreen()" title="Refresh screenshot">
                <i class="bi bi-arrow-clockwise"></i>
              </button>
              <button class="btn btn-xs btn-gh" onclick="PageInspector.launchApp()" title="Launch app">
                <i class="bi bi-play-btn"></i>
              </button>
            </div>
          </div>

          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;padding:8px;gap:8px">
            <!-- Screenshot -->
            <div class="screen-wrap" id="screen-wrap" style="height:260px"
              onclick="PageInspector.onScreenClick(event)"
              onmousemove="PageInspector.onScreenHover(event)"
              onmouseleave="PageInspector.onScreenLeave()">
              <div id="screen-placeholder" style="color:var(--text3);font-size:12px;text-align:center;padding:20px">
                <i class="bi bi-phone" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4"></i>
                Hubungkan device dan klik <b>Refresh</b>
              </div>
              <img id="screen-img" class="screen-img" style="display:none" alt="Device screen"
                draggable="false">
              <!-- Overlay canvas untuk highlight -->
              <div class="screen-overlay" id="screen-overlay"></div>
            </div>

            <!-- Left tabs: XML / Detail / Debug -->
            <div style="flex:1;min-height:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;flex-direction:column">
              <div class="tabs" style="padding:0 8px;background:var(--surface2)">
                <button class="tab ${_leftTab==='xml'?'active':''}" onclick="PageInspector.switchLeftTab('xml',this)">
                  <i class="bi bi-code-slash"></i> XML Tree
                </button>
                <button class="tab ${_leftTab==='detail'?'active':''}" onclick="PageInspector.switchLeftTab('detail',this)">
                  <i class="bi bi-info-circle"></i> Detail
                </button>
                <button class="tab ${_leftTab==='debug'?'active':''}" onclick="PageInspector.switchLeftTab('debug',this)">
                  <i class="bi bi-terminal-fill"></i> Debug
                </button>
              </div>
              <div id="left-tab-body" style="flex:1;overflow-y:auto;overflow-x:hidden">
                ${renderLeftTab()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── RIGHT: Step Editor ── -->
      <div class="insp-R">
        <div class="panel" style="flex:1">
          <div class="ph">
            <div class="ph-title"><i class="bi bi-pencil-square"></i> Step Editor</div>
            <div class="flex ic g6">
              <span class="xs muted" id="step-count">${_steps.length} steps</span>
              <div class="tabs" style="border:none;margin:0">
                <button class="tab ${_editorTab==='steps'?'active':''}"
                  onclick="PageInspector.switchEditorTab('steps',this)">Steps</button>
                <button class="tab ${_editorTab==='dsl'?'active':''}"
                  onclick="PageInspector.switchEditorTab('dsl',this)">DSL Preview</button>
              </div>
            </div>
          </div>
          <div class="pb" id="editor-body">${renderEditorBody()}</div>
        </div>
      </div>

    </div>`

    // Re-sync device list jika ada device yang sudah terhubung
    if (AppState.connectedDevice) {
      _serial = AppState.connectedDevice.serial
      _screenW = AppState.connectedDevice.screenWidth || 1080
      _screenH = AppState.connectedDevice.screenHeight || 1920
    }

    // Listen runner events
    _setupRunnerListeners()
  }

  // ── Device list ────────────────────────────────────────────
  function renderDeviceList() {
    const devices = AppState.devices
    if (!devices.length) return `
      <div style="text-align:center;padding:12px;color:var(--text3);font-size:11px">
        <i class="bi bi-usb-symbol"></i> Tidak ada device terdeteksi.
        Colok HP via USB dan aktifkan USB Debugging.
      </div>`

    return devices.map(d => `
      <div class="dev-opt ${_serial===d.serial?'selected':''} ${!d.online?'offline':''}"
        onclick="${d.online ? `PageInspector.selectDevice('${esc(d.serial)}')` : `toast('⚠️ Device offline: ${esc(d.model)}')`}">
        <div class="do-ico"><i class="bi bi-${d.type==='emulator'?'display':'phone-fill'}"></i></div>
        <div style="flex:1;min-width:0">
          <div class="do-name">${esc(d.model)} <span class="xs muted">${esc(d.serial)}</span></div>
          <div class="do-meta">${d.online ? (d.androidVersion || d.os || 'Android') : 'Offline'} · ${esc(d.type)}</div>
        </div>
        <div class="xs fw6" style="color:${d.online?'var(--green)':'var(--text3)'}">
          <i class="bi bi-circle-fill" style="font-size:7px"></i> ${d.online?'Online':'Offline'}
        </div>
      </div>`).join('')
  }

  // ── Left tabs ──────────────────────────────────────────────
  function renderLeftTab() {
    if (_leftTab === 'xml')    return renderXmlTree()
    if (_leftTab === 'detail') return renderElementDetail()
    return renderDebugLog()
  }

  function renderXmlTree() {
    if (!_elements.length) return `
      <div class="empty-s" style="padding:16px">
        <div class="ei"><i class="bi bi-code-slash"></i></div>
        <h3>Belum ada data XML</h3>
        <p>Klik <b>Refresh</b> untuk dump UI dari device.</p>
      </div>`

    return `<div class="etree" id="xml-tree">
      ${_elements.map(el => renderTreeNode(el)).join('')}
    </div>`
  }

  function renderTreeNode(el) {
    const isHovered  = _hoveredId === el.id
    const isSelected = _selectedEl?.id === el.id
    const cls = `etn ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`

    const tag = (el.class || '').split('.').pop() || 'View'
    const rid = el.resourceId ? `<span class="et-attr"> id=</span><span class="et-val">"${esc(el.resourceId.split('/').pop())}"</span>` : ''
    const txt = el.text ? `<span class="et-attr"> text=</span><span class="et-text">"${esc(el.text.substring(0,20))}"</span>` : ''

    return `<div class="${cls}" id="etn-${esc(el.id)}"
      onclick="PageInspector.selectElement('${esc(el.id)}')"
      onmouseenter="PageInspector.hoverElement('${esc(el.id)}')"
      onmouseleave="PageInspector.unhoverElement()">
      <span class="et-arrow leaf"></span>
      <span class="et-tag">&lt;${esc(tag)}&gt;</span>
      ${rid}${txt}
      ${el.clickable ? '<i class="bi bi-hand-index" style="color:var(--yellow);font-size:9px;margin-left:3px"></i>' : ''}
    </div>`
  }

  function renderElementDetail() {
    if (!_selectedEl) return `
      <div class="empty-s" style="padding:16px">
        <div class="ei"><i class="bi bi-cursor-fill"></i></div>
        <h3>Pilih Element</h3>
        <p>Klik element di XML Tree atau tap di screenshot.</p>
      </div>`

    const el = _selectedEl
    return `
    <div style="padding:8px">
      <div class="slbl mb6">Selector Tersedia</div>
      ${(el.selectors||[]).map(s => `
        <div style="padding:7px;background:var(--surface2);border-radius:7px;margin-bottom:5px">
          <div class="flex ic jb mb4">
            <span class="xs muted fw6">${esc(s.label)}</span>
            ${s.stable ? '<span class="badge b-pass" style="font-size:9px">stabil</span>' : '<span class="badge b-pend" style="font-size:9px">rapuh</span>'}
          </div>
          <div class="flex ic g5">
            <code class="mono xs" style="flex:1;background:var(--surface);padding:3px 7px;
              border-radius:5px;border:1px solid var(--border);overflow:hidden;
              text-overflow:ellipsis;white-space:nowrap;display:block">
              ${esc(s.value)}
            </code>
            <button class="btn btn-xs btn-b" onclick="PageInspector.useSelector('${esc(s.value)}')">
              Use
            </button>
            <button class="btn btn-xs btn-d" onclick="copyText('${esc(s.value)}')">
              <i class="bi bi-copy"></i>
            </button>
          </div>
        </div>`).join('')}

      <div class="divider"></div>
      <div class="slbl mb4">Properti Element</div>
      <div style="font-size:10.5px;font-family:var(--font-mono)">
        ${[
          ['class',       el.class],
          ['resource-id', el.resourceId],
          ['text',        el.text],
          ['content-desc',el.contentDesc],
          ['clickable',   el.clickable],
          ['scrollable',  el.scrollable],
          ['bounds',      el.bounds ? `[${el.bounds.x},${el.bounds.y}][${el.bounds.x2},${el.bounds.y2}]` : ''],
        ].filter(([,v]) => v !== '' && v !== undefined && v !== false)
         .map(([k,v]) => `<div style="padding:2px 0;border-bottom:1px solid var(--border)">
           <span style="color:var(--text3)">${esc(k)}:</span>
           <span style="color:var(--green);margin-left:6px">${esc(String(v))}</span>
         </div>`).join('')}
      </div>

      <div class="flex g6 mt8 wrap">
        <button class="btn btn-d btn-sm" onclick="PageInspector.tapSelected()">
          <i class="bi bi-hand-index-thumb"></i> Tap di Device
        </button>
        <button class="btn btn-d btn-sm" onclick="PageInspector.useSelector('${esc(el.selectors?.[0]?.value||'')}')">
          <i class="bi bi-plus-lg"></i> Tambah ke Steps
        </button>
      </div>
    </div>`
  }

  function renderDebugLog() {
    if (!_debugLogs.length) return `
      <div class="empty-s" style="padding:16px">
        <div class="ei"><i class="bi bi-terminal"></i></div>
        <h3>Belum ada log</h3>
        <p>Log muncul saat melakukan aksi inspector atau run steps.</p>
      </div>`

    return `<div class="dbg-wrap">
      ${_debugLogs.map(l => `
        <div class="dbg-line">
          <span class="dbg-ts">${esc(l.ts)}</span>
          <span class="dbg-${l.type}">${esc(l.msg)}</span>
        </div>`).join('')}
    </div>`
  }

  // ── Editor body ────────────────────────────────────────────
  function renderEditorBody() {
    if (_editorTab === 'dsl') return renderDslView()

    return `
    <div id="step-list" style="display:flex;flex-direction:column">
      ${_steps.length
        ? _steps.map((s,i) => renderStepRow(s,i)).join('')
        : `<div class="empty-s"><div class="ei"><i class="bi bi-gear"></i></div>
           <h3>Belum Ada Step</h3>
           <p>Pilih element dari tree atau klik aksi di bawah.</p></div>`}
    </div>
    <div class="chips">
      ${Object.entries(ACTS).map(([k,a]) =>
        `<div class="chip" onclick="PageInspector.addStep('${k}')">
          <i class="bi bi-${ACT_ICONS[k]||'plus'}"></i> ${a.l}
        </div>`).join('')}
    </div>`
  }

  function renderStepRow(step, idx) {
    const cfg = ACTS[step.action] || {}
    const st  = _stepSt[step.id] || ''
    const nCls = st==='pass'?'sn-pass' : st==='fail'?'sn-fail' : st==='run'?'sn-run' : ''
    const rCls = st==='pass'?'sr-pass' : st==='fail'?'sr-fail' : st==='run'?'sr-run' : ''

    const fields = (cfg.f || []).map(f => {
      const fc = FLD_CFG[f]; if (!fc) return ''
      const val = (step.params && step.params[f]) || ''
      const w = `style="width:${fc.w}px;max-width:100%"`
      if (fc.type === 'sel')
        return `<div class="field"><label class="fl">${esc(fc.l)}</label>
          <select ${w} onchange="PageInspector.updateParam(${step.id},'${f}',this.value)">
            ${fc.opts.map(o => `<option ${val===o?'selected':''}>${o}</option>`).join('')}
          </select></div>`
      if (fc.type === 'num')
        return `<div class="field"><label class="fl">${esc(fc.l)}</label>
          <input type="number" ${w} value="${esc(val)||1000}" min="100" step="500"
            onchange="PageInspector.updateParam(${step.id},'${f}',this.value)"></div>`
      return `<div class="field"><label class="fl">${esc(fc.l)}</label>
        <input type="text" ${w} value="${esc(val)}" placeholder="${esc(fc.ph)}"
          oninput="PageInspector.updateParam(${step.id},'${f}',this.value)"></div>`
    }).join('')

    return `
    <div class="step-row ${rCls}" id="sr-${step.id}">
      <div class="step-drag"><i class="bi bi-grip-vertical"></i></div>
      <div class="step-n ${nCls}">${idx+1}</div>
      <div class="step-fields">
        <div class="field">
          <label class="fl">Aksi</label>
          <select style="min-width:130px" onchange="PageInspector.updateAction(${step.id},this.value)">
            ${Object.entries(ACTS).map(([k,a]) =>
              `<option value="${k}" ${step.action===k?'selected':''}>${a.l}</option>`).join('')}
          </select>
        </div>
        ${fields}
      </div>
      <button class="step-del" onclick="PageInspector.deleteStep(${step.id})">
        <i class="bi bi-x"></i>
      </button>
    </div>`
  }

  function renderDslView() {
    const dsl = generateDSL(
      { name: 'Test Case', package: AppState.inspector?.pkg || '' },
      _steps
    )
    return `<div class="dsl-box">
      <button class="dsl-cp" onclick="copyText(\`${esc(dsl)}\`)">copy</button>
      <pre>${colorizeDSL(dsl)}</pre>
    </div>`
  }

  // ── Highlight overlay ──────────────────────────────────────
  function renderHighlights() {
    const overlay = document.getElementById('screen-overlay')
    if (!overlay || !_elements.length || !_imgW) return

    overlay.innerHTML = ''

    _elements.forEach(el => {
      if (!el.highlight || !el.bounds) return
      const { x, y, width, height } = el.bounds

      // Scale koordinat device → koordinat overlay
      const scaleX = _imgW / _screenW
      const scaleY = _imgH / _screenH

      const box = document.createElement('div')
      box.className = 'hl-box'
      box.id = `hl-${el.id}`
      box.style.left   = (x * scaleX) + 'px'
      box.style.top    = (y * scaleY) + 'px'
      box.style.width  = (width * scaleX) + 'px'
      box.style.height = (height * scaleY) + 'px'
      box.dataset.elId = el.id

      // Hover state
      box.addEventListener('mouseenter', () => hoverElement(el.id))
      box.addEventListener('mouseleave', () => unhoverElement())
      box.addEventListener('click', (e) => {
        e.stopPropagation()
        selectElement(el.id)
      })

      if (_selectedEl?.id === el.id) box.classList.add('selected')
      else if (_hoveredId === el.id) box.classList.add('hovered')

      overlay.appendChild(box)
    })
  }

  function updateHighlightStates() {
    document.querySelectorAll('.hl-box').forEach(box => {
      const id = box.dataset.elId
      box.classList.remove('selected', 'hovered')
      if (_selectedEl?.id === id) box.classList.add('selected')
      else if (_hoveredId === id) box.classList.add('hovered')
    })
  }

  // ── Screen interaction ─────────────────────────────────────
  function onScreenClick(event) {
    const wrap = document.getElementById('screen-wrap')
    const img  = document.getElementById('screen-img')
    if (!img || img.style.display === 'none') return

    const rect = img.getBoundingClientRect()
    // Koordinat relatif terhadap gambar
    const relX = event.clientX - rect.left
    const relY = event.clientY - rect.top

    // Scale ke koordinat device
    const devX = Math.round(relX * _screenW / rect.width)
    const devY = Math.round(relY * _screenH / rect.height)

    // Cari element yang mengandung koordinat ini
    const found = findElementAtCoords(devX, devY)
    if (found) {
      selectElement(found.id)
      addDebugLog('info', `Tap @ (${devX}, ${devY}) → ${found.resourceId || found.text || found.class}`)
    }

    // Show tap ripple
    showTapRipple(event.clientX - rect.left + wrap.getBoundingClientRect().left - wrap.getBoundingClientRect().left,
                  event.clientY - rect.top, wrap)
  }

  function onScreenHover(event) {
    const img  = document.getElementById('screen-img')
    if (!img || img.style.display === 'none') return

    const rect = img.getBoundingClientRect()
    const devX = Math.round((event.clientX - rect.left) * _screenW / rect.width)
    const devY = Math.round((event.clientY - rect.top) * _screenH / rect.height)

    const found = findElementAtCoords(devX, devY)
    if (found && found.id !== _hoveredId) {
      _hoveredId = found.id
      updateHighlightStates()
      updateTreeHover(found.id)
    }
  }

  function onScreenLeave() {
    _hoveredId = null
    updateHighlightStates()
    updateTreeHover(null)
  }

  function findElementAtCoords(x, y) {
    // Cari element terkecil yang mengandung koordinat (paling spesifik)
    let best = null
    let bestArea = Infinity
    for (const el of _elements) {
      const b = el.bounds
      if (!b) continue
      if (x >= b.x && x <= b.x2 && y >= b.y && y <= b.y2) {
        const area = b.width * b.height
        if (area < bestArea) { best = el; bestArea = area }
      }
    }
    return best
  }

  function showTapRipple(x, y, container) {
    const ripple = document.createElement('div')
    ripple.className = 'tap-ripple'
    ripple.style.left = x + 'px'
    ripple.style.top  = y + 'px'
    container.appendChild(ripple)
    setTimeout(() => ripple.remove(), 600)
  }

  // ── Element selection ──────────────────────────────────────
  function hoverElement(id) {
    _hoveredId = id
    updateHighlightStates()
    updateTreeHover(id)
  }

  function unhoverElement() {
    _hoveredId = null
    updateHighlightStates()
    updateTreeHover(null)
  }

  function selectElement(id) {
    _selectedEl = _elements.find(el => el.id === id) || null
    updateHighlightStates()
    updateTreeSelection()
    if (_leftTab === 'detail' || _selectedEl) {
      _leftTab = 'detail'
      refreshLeftTab()
    }
    if (_selectedEl) {
      addDebugLog('info', `Selected: ${_selectedEl.resourceId || _selectedEl.text || _selectedEl.class}`)
    }
  }

  function updateTreeHover(id) {
    document.querySelectorAll('.etn').forEach(el => {
      el.classList.remove('hovered')
      if (id && el.id === `etn-${id}`) el.classList.add('hovered')
    })
  }

  function updateTreeSelection() {
    document.querySelectorAll('.etn').forEach(el => {
      el.classList.remove('selected')
      if (_selectedEl && el.id === `etn-${_selectedEl.id}`) {
        el.classList.add('selected')
        el.scrollIntoView({ block: 'nearest' })
      }
    })
  }

  // ── Public actions ─────────────────────────────────────────
  async function connectDevice() {
    const devices = await window.api.device.list().catch(() => [])
    AppState.devices = devices
    const dl = document.getElementById('device-list')
    if (dl) dl.innerHTML = renderDeviceList()

    const online = devices.filter(d => d.online)
    if (online.length === 1) {
      await selectDevice(online[0].serial)
    } else if (online.length > 1) {
      toast(`${online.length} device terdeteksi. Pilih dari daftar.`)
    } else {
      toast('⚠️ Tidak ada device online. Pastikan USB Debugging aktif.', 'error')
    }
  }

  async function selectDevice(serial) {
    try {
      const info = await window.api.device.connect(serial)
      _serial  = serial
      _screenW = info.screenWidth  || 1080
      _screenH = info.screenHeight || 1920
      AppState.setConnectedDevice({ serial, ...info })

      const badge = document.getElementById('conn-badge')
      if (badge) { badge.className = 'badge b-pass'; badge.textContent = `${info.model || serial}` }

      const dl = document.getElementById('device-list')
      if (dl) dl.innerHTML = renderDeviceList()

      addDebugLog('pass', `Connected: ${info.model} (${serial}) Android ${info.androidVersion}`)
      toast(`✅ Terhubung: ${info.model || serial}`)

      // Auto screenshot
      await refreshScreen()
    } catch (err) {
      toast(`Gagal connect: ${err.message}`, 'error')
      addDebugLog('fail', `Connect failed: ${err.message}`)
    }
  }

  async function refreshScreen() {
    if (!_serial) { toast('⚠️ Pilih device dulu', 'error'); return }
    addDebugLog('info', `Capturing screenshot from ${_serial}...`)
    try {
      const b64 = await window.api.inspector.screenshot(_serial)
      const img = document.getElementById('screen-img')
      const placeholder = document.getElementById('screen-placeholder')
      if (img) {
        img.src = `data:image/png;base64,${b64}`
        img.style.display = 'block'
        if (placeholder) placeholder.style.display = 'none'

        // Setelah load, update dimensi untuk scaling highlight
        img.onload = () => {
          const rect = img.getBoundingClientRect()
          _imgW = rect.width
          _imgH = rect.height
          renderHighlights()
        }
      }
      AppState.inspector.screenshotB64 = b64
      addDebugLog('pass', `Screenshot OK (${_screenW}x${_screenH})`)

      // Auto dump XML
      await dumpXml()
    } catch (err) {
      addDebugLog('fail', `Screenshot failed: ${err.message}`)
      toast(`Screenshot gagal: ${err.message}`, 'error')
    }
  }

  async function dumpXml() {
    if (!_serial) return
    addDebugLog('cmd', `uiautomator dump --serial ${_serial}`)
    try {
      const result = await window.api.inspector.dumpXml(_serial)
      _elements = result.tree || []
      AppState.inspector.elements = _elements
      AppState.inspector.xmlRaw   = result.xml || ''

      addDebugLog('pass', `XML dump OK — ${_elements.length} elements`)
      refreshLeftTab()
      renderHighlights()
    } catch (err) {
      addDebugLog('fail', `XML dump failed: ${err.message}`)
    }
  }

  async function launchApp() {
    const pkg = document.getElementById('cfg-pkg')?.value || AppState.inspector?.pkg
    if (!pkg) { toast('⚠️ Isi Package Name dulu', 'error'); return }
    if (!_serial) { toast('⚠️ Pilih device dulu', 'error'); return }
    addDebugLog('cmd', `am start ${pkg}`)
    try {
      await window.api.inspector.launchApp(_serial, pkg)
      toast(`▶ Launched: ${pkg}`)
      addDebugLog('pass', `App launched: ${pkg}`)
      setTimeout(refreshScreen, 2000)
    } catch (err) {
      addDebugLog('fail', `Launch failed: ${err.message}`)
      toast(`Gagal launch: ${err.message}`, 'error')
    }
  }

  async function tapSelected() {
    if (!_selectedEl?.bounds || !_serial) return
    const { centerX, centerY } = _selectedEl.bounds
    addDebugLog('cmd', `input tap ${centerX} ${centerY}`)
    try {
      await window.api.inspector.tap(_serial, centerX, centerY)
      addDebugLog('pass', `Tapped @ (${centerX}, ${centerY})`)
      setTimeout(refreshScreen, 1000)
    } catch (err) {
      addDebugLog('fail', `Tap failed: ${err.message}`)
    }
  }

  async function loadPackages() {
    if (!_serial) { toast('⚠️ Pilih device dulu', 'error'); return }
    try {
      _packages = await window.api.inspector.listPackages(_serial)
      const sel = document.getElementById('pkg-select')
      if (sel) {
        sel.innerHTML = `<option value="">-- Pilih package --</option>
          ${_packages.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}`
      }
      toast(`✅ ${_packages.length} packages dimuat`)
    } catch (err) {
      toast(`Gagal load packages: ${err.message}`, 'error')
    }
  }

  function selectPackage(pkg) {
    if (!pkg) return
    const input = document.getElementById('cfg-pkg')
    if (input) input.value = pkg
    AppState.inspector = AppState.inspector || {}
    AppState.inspector.pkg = pkg
  }

  async function handleApkUpload(input) {
    const file = input.files?.[0]
    if (!file || !_serial) return
    toast(`📦 Menginstall ${file.name}...`)
    addDebugLog('cmd', `adb install -r ${file.name}`)
    try {
      await window.api.inspector.installApk(_serial, file.path)
      toast(`✅ APK terinstall: ${file.name}`, 'success')
      addDebugLog('pass', `APK installed: ${file.name}`)
    } catch (err) {
      toast(`Gagal install APK: ${err.message}`, 'error')
      addDebugLog('fail', `APK install failed: ${err.message}`)
    }
  }

  function useSelector(selectorValue) {
    if (!selectorValue) return
    addStep('tap')
    const last = _steps[_steps.length - 1]
    if (last) last.params.selector = selectorValue
    refreshEditor()
    toast(`✅ Selector → Tap step`)
    _editorTab = 'steps'
    refreshEditorTab()
  }

  function toggleConfig() {
    _cfgOpen = !_cfgOpen
    const el = document.getElementById('insp-ext-cfg')
    if (el) el.style.display = _cfgOpen ? 'block' : 'none'
  }

  // ── Step editor actions ────────────────────────────────────
  function addStep(action) {
    _steps.push({ id: _nextStepId++, action, params: {} })
    refreshEditor()
    updateStepCount()
  }

  function deleteStep(id) {
    _steps = _steps.filter(s => s.id !== id)
    refreshEditor()
    updateStepCount()
  }

  function updateAction(id, action) {
    const s = _steps.find(s => s.id === id)
    if (s) { s.action = action; s.params = {} }
    refreshEditor()
  }

  function updateParam(id, field, value) {
    const s = _steps.find(s => s.id === id)
    if (s) { s.params = s.params || {}; s.params[field] = value }
  }

  function refreshEditor() {
    const body = document.getElementById('editor-body')
    if (body) body.innerHTML = renderEditorBody()
  }

  function refreshEditorTab() {
    document.querySelectorAll('.insp-R .tab').forEach(t => {
      t.classList.toggle('active',
        (t.textContent.trim().toLowerCase().includes(_editorTab === 'dsl' ? 'dsl' : 'step')))
    })
    refreshEditor()
  }

  function updateStepCount() {
    const el = document.getElementById('step-count')
    if (el) el.textContent = `${_steps.length} steps`
  }

  // ── Run steps ──────────────────────────────────────────────
  async function runSteps() {
    if (!_serial) { toast('⚠️ Pilih device dulu', 'error'); return }
    if (!_steps.length) { toast('⚠️ Tambahkan steps dulu', 'error'); return }

    // Cek runner status — cegah session conflict
    const status = await window.api.runner.getStatus().catch(() => null)
    if (status?.isRunning) {
      toast('⚠️ Runner sedang berjalan. Tunggu selesai.', 'error'); return
    }

    _stepSt = {}
    const dsl = generateDSL({ name: 'Inspector Run', package: AppState.inspector?.pkg || '' }, _steps)
    const env = AppState.activeEnv?.vars || {}

    const btn = document.getElementById('btn-run-steps')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise" style="animation:spin .8s linear infinite"></i> Berjalan...' }

    addDebugLog('head', '═══ RUN START ═══')
    addDebugLog('info', `Device: ${_serial}`)
    addDebugLog('cmd', `maestro --device ${_serial} test [tmp.yaml]`)

    try {
      await window.api.runner.run({
        serial:    _serial,
        stepsYaml: dsl,
        tcName:    'Inspector Run',
        tcId:      'inspector-run',
        envVars:   env,
        noReset:   AppState.inspector?.noReset || false,
      })
      addDebugLog('pass', '═══ RUN PASSED ═══')
      toast('✅ Semua steps berhasil!', 'success')
    } catch (err) {
      addDebugLog('fail', `═══ RUN FAILED: ${err.message} ═══`)
      toast(`❌ Steps gagal: ${err.message}`, 'error')
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-fill"></i> Run Steps' }
      refreshScreen()  // refresh screenshot setelah run
    }
  }

  function _setupRunnerListeners() {
    window.api.runner.removeListeners()

    window.api.runner.onLog((entry) => {
      addDebugLog(entry.type, entry.msg)
      // Sync ke left tab jika sedang di debug tab
      if (_leftTab === 'debug') refreshLeftTab()
    })

    window.api.runner.onStepUpdate((data) => {
      if (data.stepIndex !== undefined) {
        const step = _steps[data.stepIndex - 1]
        if (step) {
          _stepSt[step.id] = data.stepStatus === 'running' ? 'run' : data.stepStatus
          refreshEditor()
        }
      }
    })

    window.api.runner.onFinish(() => {
      refreshEditor()
      if (_leftTab === 'debug') refreshLeftTab()
    })
  }

  // ── DSL export ─────────────────────────────────────────────
  async function exportDSL() {
    if (!_steps.length) { toast('⚠️ Belum ada steps', 'error'); return }
    const dsl = generateDSL({ name: 'Test Case', package: AppState.inspector?.pkg || '' }, _steps)
    const result = await window.api.dsl.exportDialog(dsl)
    if (result?.ok) toast(`📁 DSL disimpan: ${result.path}`)
  }

  async function saveToTC() {
    toast('💾 Fitur simpan ke TC akan tersedia di halaman Projects.')
    navigate('projects')
  }

  // ── Tab switches ───────────────────────────────────────────
  function switchLeftTab(tab, btn) {
    _leftTab = tab
    document.querySelectorAll('.insp-L .tab').forEach(t => t.classList.toggle('active', t === btn))
    refreshLeftTab()
  }

  function switchEditorTab(tab, btn) {
    _editorTab = tab
    if (btn) document.querySelectorAll('.insp-R .tab').forEach(t => t.classList.toggle('active', t === btn))
    refreshEditor()
  }

  function refreshLeftTab() {
    const body = document.getElementById('left-tab-body')
    if (body) body.innerHTML = renderLeftTab()
  }

  // ── Debug log ──────────────────────────────────────────────
  function addDebugLog(type, msg) {
    _debugLogs.push({ type, msg, ts: fmtTime() })
    if (_debugLogs.length > 200) _debugLogs.shift()
    if (_leftTab === 'debug') {
      const body = document.getElementById('left-tab-body')
      if (body) {
        const line = document.createElement('div')
        line.className = 'dbg-line'
        line.innerHTML = `<span class="dbg-ts">${fmtTime()}</span><span class="dbg-${type}">${esc(msg)}</span>`
        const wrap = body.querySelector('.dbg-wrap')
        if (wrap) { wrap.appendChild(line); wrap.scrollTop = 9999 }
        else refreshLeftTab()
      }
    }
  }

  // Expose to global
  return {
    render, connectDevice, selectDevice, refreshScreen,
    launchApp, tapSelected, loadPackages, selectPackage,
    handleApkUpload, useSelector, toggleConfig,
    addStep, deleteStep, updateAction, updateParam,
    switchLeftTab, switchEditorTab, exportDSL, saveToTC,
    runSteps, selectElement, hoverElement, unhoverElement,
    onScreenClick, onScreenHover, onScreenLeave,
  }
})()