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

            <!-- Package & Activity — always visible, tidak hidden -->
            <div style="background:var(--surface2);border-radius:7px;padding:8px 10px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <span style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">
                  <i class="bi bi-box"></i> Target App
                </span>
                <button class="btn btn-xs btn-d" onclick="PageInspector.detectActiveApp()" id="btn-detect-app"
                  title="Auto-detect app yang sedang berjalan di foreground">
                  <i class="bi bi-magic"></i> Detect
                </button>
              </div>
              <!-- Package name input + detect -->
              <div style="display:flex;gap:5px;align-items:center;margin-bottom:5px">
                <input type="text" id="cfg-pkg" style="flex:1;font-size:11px;font-family:var(--font-mono)"
                  placeholder="com.example.app"
                  value="${AppState.inspector.pkg||''}"
                  oninput="AppState.inspector.pkg=this.value;PageInspector.onPkgChange(this.value)">
              </div>
              <!-- Activity row -->
              <div style="display:flex;gap:5px;align-items:center">
                <select id="cfg-activity" style="flex:1;font-size:10px;font-family:var(--font-mono)"
                  onchange="AppState.inspector.activity=this.value">
                  <option value="">-- Activity (opsional) --</option>
                  ${(AppState.inspector.activities||[]).map(a=>`
                    <option value="${esc(a)}" ${AppState.inspector.activity===a?'selected':''}>
                      ${esc(a.split('/').pop())}
                    </option>`).join('')}
                </select>
                <button class="btn btn-xs btn-d" onclick="PageInspector.loadActivities()" title="Load daftar activity">
                  <i class="bi bi-arrow-clockwise"></i>
                </button>
              </div>
              <!-- Active app info badge -->
              <div id="active-app-info" style="display:none;margin-top:6px">
                <div style="background:var(--green-bg);border:1px solid rgba(42,157,92,.2);border-radius:5px;padding:4px 8px;font-size:10px;font-family:var(--font-mono);color:var(--green)">
                  <i class="bi bi-check-circle-fill"></i> <span id="active-app-text"></span>
                </div>
              </div>
            </div>

            <!-- Extended config (collapsible) -->
            <div id="insp-ext-cfg" style="display:none">
              <div class="divider" style="margin:6px 0"></div>
              <div class="r2 mb6">
                <div class="field">
                  <label class="fl">Orientasi</label>
                  <select class="w100" onchange="AppState.inspector.orient=this.value">
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </div>
                <div class="field">
                  <label class="fl">Upload APK</label>
                  <input type="file" class="w100" accept=".apk" onchange="PageInspector.handleApkUpload(this)">
                </div>
              </div>
              <div class="flex g12 wrap mb6">
                ${[['noReset','No Reset'],['noSign','No Sign'],['autoGrant','Auto Grant']]
                  .map(([k,l]) => `<label class="flex ic g5" style="cursor:pointer;font-size:11px">
                    <input type="checkbox" onchange="AppState.inspector.${k}=this.checked" style="accent-color:var(--blue)"> ${l}
                  </label>`).join('')}
              </div>
              <!-- Package selector dari list installed -->
              <div class="field">
                <label class="fl">Semua Packages Terinstall</label>
                <select class="w100" id="pkg-select" onchange="PageInspector.selectPackage(this.value)">
                  <option value="">-- Pilih package --</option>
                  ${_packages.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
                </select>
                <button class="btn btn-d btn-xs mt6" onclick="PageInspector.loadPackages()">
                  <i class="bi bi-arrow-clockwise"></i> Load semua packages
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
            <!-- Screenshot: wrap pakai position relative, gambar menentukan ukuran container -->
            <div id="screen-wrap"
              style="position:relative;flex-shrink:0;align-self:center;
                     max-height:280px;max-width:100%;
                     background:#111;border-radius:8px;overflow:hidden;cursor:crosshair;
                     display:flex;align-items:center;justify-content:center;">
              <div id="screen-placeholder"
                style="color:var(--text3);font-size:12px;text-align:center;padding:32px 20px;width:200px">
                <i class="bi bi-phone" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4"></i>
                Hubungkan device dan klik <b>Refresh</b>
              </div>
              <!-- img menentukan ukuran container — overlay di atasnya exact -->
              <img id="screen-img"
                style="display:none;max-height:280px;max-width:100%;
                       width:auto;height:auto;border-radius:6px;
                       user-select:none;-webkit-user-drag:none;"
                alt="Device screen" draggable="false">
              <!--
                Overlay: pointer-events:auto agar semua interaksi (hover/click)
                ditangani di sini. Event listener dipasang via JS di _attachScreenEvents().
                Ini menghindari konflik antara onclick di screen-wrap dan click di hl-box.
              -->
              <div id="screen-overlay"
                style="position:absolute;top:0;left:0;pointer-events:auto;cursor:crosshair;"></div>
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

    // ResizeObserver: re-render highlights saat window / panel di-resize
    if (window.ResizeObserver) {
      if (window._inspectorRO) window._inspectorRO.disconnect()
      window._inspectorRO = new ResizeObserver(() => {
        const img = document.getElementById('screen-img')
        if (img && img.style.display !== 'none' && _elements.length) {
          _updateImgDimensions()
          renderHighlights()
        }
      })
      const wrap = document.getElementById('screen-wrap')
      if (wrap) window._inspectorRO.observe(wrap)
    }

    // Attach screen events ke overlay (bukan inline HTML)
    _attachScreenEvents()
  }

  function _attachScreenEvents() {
    const overlay = document.getElementById('screen-overlay')
    if (!overlay) return
    // Remove existing listeners dulu (cegah duplicate saat re-render)
    const newOverlay = overlay.cloneNode(false)
    overlay.parentNode.replaceChild(newOverlay, overlay)
    const ov = document.getElementById('screen-overlay')
    ov.addEventListener('click',     _onScreenClick)
    ov.addEventListener('mousemove', _onScreenHover)
    ov.addEventListener('mouseleave', _onScreenLeave)
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

    // Color + icon per selector type
    const selectorMeta = {
      'resource-id':  { color: '#2a9d5c', bg: '#f0faf5', border: 'rgba(42,157,92,.25)',  icon: 'bi-hash',          badge: 'stabil ⭐' },
      'accessibility':{ color: '#3b7eed', bg: '#f0f6ff', border: 'rgba(59,126,237,.25)', icon: 'bi-universal-access', badge: 'stabil' },
      'text':         { color: '#c47d0e', bg: '#fef9ec', border: 'rgba(196,125,14,.25)',  icon: 'bi-fonts',         badge: 'berubah' },
      'xpath':        { color: '#8c8c87', bg: '#f3f3f0', border: 'rgba(140,140,135,.2)',  icon: 'bi-code-slash',    badge: 'rapuh' },
    }

    const selectors = el.selectors || []

    return `
    <div style="padding:8px 10px">

      <!-- Selector list -->
      <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">
        Selector Tersedia (${selectors.length})
      </div>

      ${selectors.length === 0 ? `
        <div style="background:var(--yellow-bg);border:1px solid rgba(196,125,14,.2);border-radius:7px;padding:9px 11px;font-size:11px;color:var(--text2);margin-bottom:10px">
          <i class="bi bi-exclamation-triangle" style="color:var(--yellow)"></i>
          Element ini tidak punya resource-id, content-desc, maupun text.
          Kemungkinan hanya bisa diakses via XPath yang rapuh.
        </div>` : ''}

      ${selectors.map(s => {
        const m = selectorMeta[s.type] || selectorMeta['xpath']
        return `
        <div style="border:1px solid ${m.border};background:${m.bg};border-radius:8px;padding:8px 10px;margin-bottom:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
            <div style="display:flex;align-items:center;gap:6px">
              <i class="bi ${m.icon}" style="color:${m.color};font-size:12px"></i>
              <span style="font-size:11px;font-weight:700;color:${m.color}">${esc(s.label)}</span>
            </div>
            <span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:3px;
                         background:${m.color}20;color:${m.color}">${m.badge}</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <code style="flex:1;font-family:'Geist Mono',monospace;font-size:10px;
                         background:rgba(0,0,0,.04);border:1px solid ${m.border};
                         border-radius:5px;padding:4px 8px;overflow:hidden;
                         text-overflow:ellipsis;white-space:nowrap;display:block;
                         color:${m.color}">${esc(s.value)}</code>
            <button class="btn btn-xs" style="background:${m.color};color:#fff;border:none;flex-shrink:0"
              onclick="PageInspector.useSelector('${esc(s.value)}')">Use</button>
            <button class="btn btn-xs btn-d" style="flex-shrink:0"
              onclick="copyText('${esc(s.value)}')"><i class="bi bi-copy"></i></button>
          </div>
        </div>`
      }).join('')}

      <div style="height:1px;background:var(--border);margin:10px 0"></div>

      <!-- Properties table — semua atribut ditampilkan, yang kosong dengan tanda — -->
      <div style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">
        Properti Element
      </div>
      <div style="border:1px solid var(--border);border-radius:7px;overflow:hidden;font-size:11px">
        ${[
          { k:'class',        v: el.class,       icon:'bi-grid',             always: true  },
          { k:'resource-id',  v: el.resourceId,  icon:'bi-hash',             always: true  },
          { k:'content-desc', v: el.contentDesc, icon:'bi-universal-access', always: true  },
          { k:'text',         v: el.text,        icon:'bi-fonts',            always: true  },
          { k:'package',      v: el.packageName, icon:'bi-box',              always: false },
          { k:'clickable',    v: el.clickable  ? 'true' : null, icon:'bi-hand-index',     always: false },
          { k:'scrollable',   v: el.scrollable ? 'true' : null, icon:'bi-arrow-down-up',  always: false },
          { k:'focusable',    v: el.focusable  ? 'true' : null, icon:'bi-cursor',         always: false },
          { k:'checked',      v: el.checked    ? 'true' : null, icon:'bi-check2-square',  always: false },
          { k:'bounds',       v: el.bounds ? `[${el.bounds.x},${el.bounds.y}][${el.bounds.x2},${el.bounds.y2}]` : null,
                                                 icon:'bi-bounding-box',     always: true  },
        ]
        .filter(row => row.always || (row.v && row.v !== ''))
        .map((row, i, arr) => {
          const hasVal = row.v && row.v !== ''
          const borderB = i < arr.length - 1 ? 'border-bottom:1px solid var(--border);' : ''
          return `
          <div style="display:flex;align-items:baseline;gap:0;${borderB}">
            <div style="width:115px;flex-shrink:0;padding:5px 9px;background:var(--surface2);
                        display:flex;align-items:center;gap:5px;border-right:1px solid var(--border);
                        align-self:stretch">
              <i class="bi ${row.icon}" style="font-size:10px;color:var(--text3);flex-shrink:0"></i>
              <span style="font-family:'Geist Mono',monospace;color:var(--text3);font-size:9.5px;
                           overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(row.k)}</span>
            </div>
            <div style="flex:1;padding:5px 9px;font-family:'Geist Mono',monospace;
                        font-size:10px;word-break:break-all;
                        color:${hasVal ? 'var(--green)' : 'var(--text3)'}">
              ${hasVal ? esc(row.v) : '<span style="opacity:.4">—</span>'}
            </div>
          </div>`
        }).join('')}
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
        <button class="btn btn-d btn-sm" onclick="PageInspector.tapSelected()">
          <i class="bi bi-hand-index-thumb"></i> Tap di Device
        </button>
        ${selectors[0] ? `
        <button class="btn btn-b btn-sm" onclick="PageInspector.useSelector('${esc(selectors[0].value)}')">
          <i class="bi bi-plus-lg"></i> Tambah ke Steps
        </button>` : ''}
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
    if (!overlay) return

    _updateImgDimensions()

    if (!_elements.length || !_imgW || !_imgH) {
      overlay.innerHTML = ''
      return
    }

    const scaleX = _imgW / _screenW
    const scaleY = _imgH / _screenH

    // Hapus boxes lama, biarkan overlay-level listeners tetap terpasang
    overlay.innerHTML = ''

    _elements.forEach(el => {
      if (!el.bounds) return
      const { x, y, width, height } = el.bounds
      if (width < 2 || height < 2) return

      const isSelected = _selectedEl?.id === el.id
      const isHovered  = _hoveredId === el.id

      const box        = document.createElement('div')
      box.className    = 'hl-box' + (isSelected ? ' selected' : isHovered ? ' hovered' : '')
      box.id           = `hl-${el.id}`
      box.dataset.elId = el.id
      // pointer-events:none agar semua event naik ke overlay parent
      box.style.cssText = `
        position:absolute;
        left:${Math.round(x * scaleX)}px;
        top:${Math.round(y * scaleY)}px;
        width:${Math.round(width  * scaleX)}px;
        height:${Math.round(height * scaleY)}px;
        pointer-events:none;`

      // Label untuk selected
      if (isSelected || isHovered) {
        const shortClass = (el.class || '').split('.').pop()
        const labelText  = (el.resourceId ? el.resourceId.split('/').pop() : null)
                        || el.text?.substring(0, 20)
                        || shortClass || ''
        if (labelText) {
          const label = document.createElement('div')
          label.textContent = labelText
          label.style.cssText = `
            position:absolute; bottom:100%; left:0; margin-bottom:2px;
            background:${isSelected ? 'rgba(229,77,46,.92)' : 'rgba(42,157,92,.88)'};
            color:#fff; font-size:9px; font-family:monospace;
            padding:1px 6px; border-radius:3px;
            white-space:nowrap; pointer-events:none;
            max-width:160px; overflow:hidden; text-overflow:ellipsis;
            line-height:16px; z-index:11;`
          box.appendChild(label)
        }
      }

      overlay.appendChild(box)
    })
  }

  function updateHighlightStates() {
    // Re-render seluruh overlay agar label selected/hovered ikut terupdate
    renderHighlights()
  }

  // ── Screen interaction ─────────────────────────────────────
  // Semua event dipasang ke overlay via _attachScreenEvents()
  // Overlay = layer transparan tepat di atas gambar

  function _getDeviceCoords(event) {
    if (!_imgW || !_imgH) return null
    const overlay = document.getElementById('screen-overlay')
    if (!overlay) return null
    // getBoundingClientRect lebih reliable karena offsetX berubah saat
    // event.target adalah child element (hl-box)
    const rect = overlay.getBoundingClientRect()
    const relX = event.clientX - rect.left
    const relY = event.clientY - rect.top
    if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return null
    return {
      devX: Math.round(relX * _screenW / rect.width),
      devY: Math.round(relY * _screenH / rect.height),
      relX, relY
    }
  }

  function _onScreenClick(event) {
    const coords = _getDeviceCoords(event)
    if (!coords) return
    const { devX, devY, relX, relY } = coords

    const found = findElementAtCoords(devX, devY)
    if (found) {
      selectElement(found.id)
      addDebugLog('info', `✓ Click (${devX},${devY}) → ${found.resourceId || found.text || found.class}`)
    } else {
      // Deselect jika klik di area kosong
      _selectedEl = null
      updateHighlightStates()
      addDebugLog('info', `Click (${devX},${devY}) → tidak ada element`)
    }

    const wrap = document.getElementById('screen-wrap')
    if (wrap) showTapRipple(relX, relY, wrap)
  }

  function _onScreenHover(event) {
    const coords = _getDeviceCoords(event)
    if (!coords) {
      if (_hoveredId) { _hoveredId = null; updateHighlightStates(); updateTreeHover(null) }
      return
    }
    const { devX, devY } = coords
    const found = findElementAtCoords(devX, devY)
    const newId = found?.id || null
    if (newId !== _hoveredId) {
      _hoveredId = newId
      updateHighlightStates()
      updateTreeHover(newId)
    }
  }

  function _onScreenLeave() {
    _hoveredId = null
    updateHighlightStates()
    updateTreeHover(null)
  }

  // Backward compat stubs (tidak dipakai lagi)
  function onScreenClick(e)  { _onScreenClick(e) }
  function onScreenHover(e)  { _onScreenHover(e) }
  function onScreenLeave()   { _onScreenLeave()  }

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
      const img         = document.getElementById('screen-img')
      const placeholder = document.getElementById('screen-placeholder')
      if (!img) return

      img.onload = () => {
        // Tunggu 2 frame agar browser selesai layout & paint
        requestAnimationFrame(() => requestAnimationFrame(() => {
          _updateImgDimensions()
          renderHighlights()
        }))
      }

      img.src = `data:image/png;base64,${b64}`
      img.style.display = 'block'
      if (placeholder) placeholder.style.display = 'none'

      AppState.inspector.screenshotB64 = b64
      addDebugLog('pass', `Screenshot OK (${_screenW}×${_screenH})`)

      await dumpXml()
    } catch (err) {
      addDebugLog('fail', `Screenshot failed: ${err.message}`)
      toast(`Screenshot gagal: ${err.message}`, 'error')
    }
  }

  /**
   * Ambil dimensi gambar yang sebenarnya di-render di DOM.
   * Perlu dibedakan dari ukuran container — gambar bisa letterbox.
   * Simpan di _imgW/_imgH dan juga posisi offset dalam container.
   */
  function _updateImgDimensions() {
    const img = document.getElementById('screen-img')
    if (!img || img.style.display === 'none') return

    const rect = img.getBoundingClientRect()
    _imgW = rect.width
    _imgH = rect.height

    // Set overlay persis sama ukuran dan posisi dengan gambar
    const overlay = document.getElementById('screen-overlay')
    const wrap    = document.getElementById('screen-wrap')
    if (overlay && wrap) {
      const wrapRect = wrap.getBoundingClientRect()
      // Hitung offset gambar relatif terhadap wrap (center-aligned)
      const offsetLeft = rect.left - wrapRect.left
      const offsetTop  = rect.top  - wrapRect.top
      overlay.style.left   = offsetLeft + 'px'
      overlay.style.top    = offsetTop  + 'px'
      overlay.style.width  = rect.width  + 'px'
      overlay.style.height = rect.height + 'px'
      overlay.style.pointerEvents = 'none'
    }

    addDebugLog('info',
      `Render size: ${Math.round(_imgW)}×${Math.round(_imgH)} ` +
      `(device: ${_screenW}×${_screenH}, ` +
      `scale: ${(_imgW/_screenW).toFixed(3)}×${(_imgH/_screenH).toFixed(3)})`
    )
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

  /**
   * Auto-detect foreground app dari device
   */
  async function detectActiveApp() {
    if (!_serial) { toast('⚠️ Pilih device dulu', 'error'); return }
    const btn = document.getElementById('btn-detect-app')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise" style="animation:spin .7s linear infinite"></i>' }

    try {
      addDebugLog('cmd', `dumpsys activity → detect foreground app`)
      const result = await window.api.inspector.getActiveApp(_serial)
      if (!result) {
        toast('Tidak berhasil detect app. Pastikan app sedang terbuka.', 'error')
        addDebugLog('warn', 'getActiveApp: tidak ada hasil')
        return
      }

      // Update state
      AppState.inspector.pkg      = result.package
      AppState.inspector.activity = result.activity
      if (!AppState.inspector.activities) AppState.inspector.activities = []

      // Update UI
      const pkgInput = document.getElementById('cfg-pkg')
      if (pkgInput) pkgInput.value = result.package

      // Show badge
      const badge = document.getElementById('active-app-info')
      const badgeText = document.getElementById('active-app-text')
      if (badge && badgeText) {
        badgeText.textContent = `${result.package} / ${result.activity?.split('.').pop() || result.activity}`
        badge.style.display = 'block'
      }

      addDebugLog('pass', `Detected: ${result.package} / ${result.activity}`)
      toast(`✅ ${result.package}`)

      // Auto-load activities
      await loadActivities()
    } catch (err) {
      toast(`Detect gagal: ${err.message}`, 'error')
      addDebugLog('fail', `detectActiveApp error: ${err.message}`)
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-magic"></i> Detect' }
    }
  }

  /**
   * Load activity list untuk package aktif
   */
  async function loadActivities() {
    const pkg = AppState.inspector?.pkg || document.getElementById('cfg-pkg')?.value
    if (!pkg || !_serial) return
    try {
      const activities = await window.api.inspector.getActivities(_serial, pkg)
      AppState.inspector.activities = activities

      const sel = document.getElementById('cfg-activity')
      if (sel) {
        sel.innerHTML = `<option value="">-- Activity (opsional) --</option>
          ${activities.map(a => {
            const label = a.split('/').pop()
            const isActive = a === AppState.inspector.activity || a.endsWith(AppState.inspector.activity || '')
            return `<option value="${esc(a)}" ${isActive ? 'selected' : ''}>${esc(label)}</option>`
          }).join('')}`
      }
      addDebugLog('pass', `Activities: ${activities.length} untuk ${pkg}`)
    } catch (err) {
      addDebugLog('warn', `loadActivities: ${err.message}`)
    }
  }

  function onPkgChange(val) {
    AppState.inspector.pkg = val
    // Clear activities saat package berubah
    AppState.inspector.activities = []
    AppState.inspector.activity = ''
    const sel = document.getElementById('cfg-activity')
    if (sel) sel.innerHTML = '<option value="">-- Activity (opsional) --</option>'
    const badge = document.getElementById('active-app-info')
    if (badge) badge.style.display = 'none'
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
    // Sync tab active indicator
    document.querySelectorAll('.insp-L .tab').forEach(t => {
      const tabName = t.textContent.trim().toLowerCase()
      const isActive = (_leftTab === 'xml'    && tabName.includes('xml'))
                    || (_leftTab === 'detail' && tabName.includes('detail'))
                    || (_leftTab === 'debug'  && tabName.includes('debug'))
      t.classList.toggle('active', isActive)
    })
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
    detectActiveApp, loadActivities, onPkgChange,
  }
})()