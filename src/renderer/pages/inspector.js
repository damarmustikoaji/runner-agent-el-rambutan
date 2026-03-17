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
    launch:           { l:'Buka App',        f:['package'] },
    tap:              { l:'Tap',             f:['selector','note'] },
    longPress:        { l:'Long Press',      f:['selector','note'] },
    input:            { l:'Ketik Teks',      f:['selector','value','note'] },
    clearText:        { l:'Clear Text',      f:['selector','note'] },
    swipe:            { l:'Swipe',           f:['direction','note'] },
    scroll:           { l:'Scroll',          f:['note'] },
    assertText:       { l:'Assert Teks',     f:['expected','note'] },
    assertVisible:    { l:'Assert Ada',      f:['selector','note'] },
    assertNotVisible: { l:'Assert Tidak Ada',f:['selector','note'] },
    wait:             { l:'Tunggu',          f:['ms','note'] },
    back:             { l:'Tombol Back',     f:['note'] },
    screenshot:       { l:'Screenshot',      f:['name','note'] },
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
      <button class="btn btn-g btn-sm" id="btn-run-steps" onclick="PageInspector.runSteps()">
        <i class="bi bi-play-fill"></i> Run Steps
      </button>
      <button class="btn btn-d btn-sm" onclick="PageInspector.exportDSL()">
        <i class="bi bi-download"></i> Export DSL
      </button>
      <button class="btn btn-d btn-sm" id="btn-save-tc" onclick="PageInspector.saveToTC()"
        style="${AppState.activeTcId ? 'border-color:var(--green);color:var(--green)' : ''}">
        <i class="bi bi-${AppState.activeTcId ? 'arrow-repeat' : 'save'}"></i>
        ${AppState.activeTcId ? `Update TC` : 'Simpan ke TC'}
      </button>`

    // Banner edit mode kalau ada activeTcId
    if (AppState.activeTcId && AppState.activeTcName) {
      const banner = document.createElement('div')
      banner.id = 'edit-mode-banner'
      banner.style.cssText = `background:#f0faf5;border-bottom:1px solid rgba(42,157,92,.2);
        padding:6px 14px;font-size:11px;color:var(--green);display:flex;align-items:center;gap:8px;
        flex-shrink:0`
      banner.innerHTML = `
        <i class="bi bi-pencil-fill"></i>
        <span>Mode Edit: <b>${esc(AppState.activeTcName)}</b> — ubah steps lalu klik <b>Update TC</b></span>
        <button onclick="AppState.activeTcId=null;AppState.activeTcName=null;PageInspector.render()"
          style="margin-left:auto;background:none;border:none;cursor:pointer;
            color:var(--green);font-size:12px;opacity:.7">
          <i class="bi bi-x"></i> Batalkan edit
        </button>`
      document.getElementById('content-area').prepend(banner)
    }

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

            <!-- Package & Activity — collapsible seperti Config -->
            <div style="background:var(--surface2);border-radius:7px;overflow:hidden">
              <!-- Header — klik untuk toggle -->
              <div style="display:flex;align-items:center;justify-content:space-between;
                           padding:7px 10px;cursor:pointer;user-select:none"
                   onclick="PageInspector.toggleTargetApp()">
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.4px">
                    <i class="bi bi-box"></i> Target App
                  </span>
                  <!-- Tampilkan package saat collapsed -->
                  <span id="target-app-summary" style="font-size:10px;font-family:var(--font-mono);
                    color:var(--text2);${AppState.inspector.pkg ? '' : 'display:none'}">
                    ${esc(AppState.inspector.pkg || '')}
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <button class="btn btn-xs btn-d" onclick="event.stopPropagation();PageInspector.detectActiveApp()"
                    id="btn-detect-app" title="Auto-detect app yang sedang berjalan">
                    <i class="bi bi-magic"></i> Detect
                  </button>
                  <i class="bi bi-chevron-down" id="target-app-chevron"
                    style="font-size:10px;color:var(--text3);transition:transform .15s;
                    transform:${AppState.inspector._targetAppOpen !== false ? 'rotate(0deg)' : 'rotate(-90deg)'}"></i>
                </div>
              </div>

              <!-- Body — collapsible -->
              <div id="target-app-body" style="padding:0 10px 10px;
                display:${AppState.inspector._targetAppOpen !== false ? 'block' : 'none'}">
                <!-- Package name -->
                <div style="margin-bottom:5px">
                  <input type="text" id="cfg-pkg" style="width:100%;font-size:11px;font-family:var(--font-mono)"
                    placeholder="com.example.app"
                    value="${AppState.inspector.pkg||''}"
                    oninput="AppState.inspector.pkg=this.value;PageInspector.onPkgChange(this.value)">
                </div>
                <!-- Activity -->
                <div style="display:flex;gap:5px;align-items:center">
                  <select id="cfg-activity" style="flex:1;font-size:10px;font-family:var(--font-mono)"
                    onchange="AppState.inspector.activity=this.value">
                    <option value="">-- Activity (opsional) --</option>
                    ${(AppState.inspector.activities||[]).map(a=>`
                      <option value="${esc(a)}" ${AppState.inspector.activity===a?'selected':''}>
                        ${esc(a.split('/').pop())}
                      </option>`).join('')}
                  </select>
                  <button class="btn btn-xs btn-d" onclick="PageInspector.loadActivities()" title="Load activities">
                    <i class="bi bi-arrow-clockwise"></i>
                  </button>
                </div>
                <!-- Active app badge -->
                <div id="active-app-info" style="display:none;margin-top:6px">
                  <div style="background:var(--green-bg);border:1px solid rgba(42,157,92,.2);
                    border-radius:5px;padding:4px 8px;font-size:10px;font-family:var(--font-mono);color:var(--green)">
                    <i class="bi bi-check-circle-fill"></i> <span id="active-app-text"></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Extended config (collapsible) -->
            <div id="insp-ext-cfg" style="display:none">
              <div class="divider" style="margin:6px 0"></div>

              <!-- Upload APK -->
              <div class="field mb6">
                <label class="fl"><i class="bi bi-file-earmark-arrow-up"></i> Upload APK</label>
                <input type="file" class="w100" accept=".apk" onchange="PageInspector.handleApkUpload(this)">
              </div>

              <!-- Checkboxes dengan tooltip informatif -->
              <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
                <label style="display:flex;align-items:flex-start;gap:7px;cursor:pointer;
                  background:var(--surface);border:1px solid var(--border);border-radius:6px;
                  padding:7px 9px;font-size:11px"
                  title="Skip reinstall Maestro driver APK ke device. Lebih cepat setelah driver sudah terinstall pertama kali.">
                  <input type="checkbox" ${AppState.inspector.noReinstallDriver?'checked':''}
                    onchange="AppState.inspector.noReinstallDriver=this.checked"
                    style="accent-color:var(--blue);flex-shrink:0;margin-top:1px">
                  <div>
                    <div style="font-weight:600;color:var(--text)">No Reinstall Driver</div>
                    <div style="color:var(--text3);font-size:10px;margin-top:1px">Skip install Maestro driver APK — aktifkan setelah run pertama berhasil agar lebih cepat</div>
                  </div>
                </label>

                <label style="display:flex;align-items:flex-start;gap:7px;cursor:pointer;
                  background:var(--surface);border:1px solid var(--border);border-radius:6px;
                  padding:7px 9px;font-size:11px"
                  title="Tidak melakukan reset state app sebelum run. App tetap di state terakhir.">
                  <input type="checkbox" ${AppState.inspector.noReset?'checked':''}
                    onchange="AppState.inspector.noReset=this.checked"
                    style="accent-color:var(--blue);flex-shrink:0;margin-top:1px">
                  <div>
                    <div style="font-weight:600;color:var(--text)">No Reset</div>
                    <div style="color:var(--text3);font-size:10px;margin-top:1px">Lanjutkan dari state app saat ini — tidak clear data/cache sebelum test dimulai</div>
                  </div>
                </label>

                <label style="display:flex;align-items:flex-start;gap:7px;cursor:pointer;
                  background:var(--surface);border:1px solid var(--border);border-radius:6px;
                  padding:7px 9px;font-size:11px"
                  title="Auto-grant storage permissions ke app target sebelum run via ADB.">
                  <input type="checkbox" ${AppState.inspector.autoGrant?'checked':''}
                    onchange="AppState.inspector.autoGrant=this.checked"
                    style="accent-color:var(--blue);flex-shrink:0;margin-top:1px">
                  <div>
                    <div style="font-weight:600;color:var(--text)">Auto Grant Permissions</div>
                    <div style="color:var(--text3);font-size:10px;margin-top:1px">Grant storage permissions ke app via ADB sebelum run — berguna untuk app yang minta izin storage</div>
                  </div>
                </label>
              </div>

              <!-- Package selector dari list installed -->
              <div class="field">
                <label class="fl">Pilih dari Packages Terinstall</label>
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
            </div>
          </div>

          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;padding:8px;gap:8px">
            <!-- Screenshot wrap: position relative, ukuran mengikuti gambar -->
            <div id="screen-wrap"
              style="position:relative;flex-shrink:0;align-self:center;
                     max-height:280px;max-width:100%;
                     background:#111;border-radius:8px;cursor:crosshair;
                     display:inline-block;line-height:0;">
              <div id="screen-placeholder"
                style="color:var(--text3);font-size:12px;text-align:center;padding:32px 20px;
                       width:200px;display:flex;flex-direction:column;align-items:center">
                <i class="bi bi-phone" style="font-size:2rem;display:block;margin-bottom:8px;opacity:.4"></i>
                Hubungkan device dan klik <b>Refresh</b>
              </div>
              <!-- img: block element, menentukan ukuran wrap -->
              <img id="screen-img"
                style="display:none;max-height:280px;max-width:100%;
                       width:auto;height:auto;border-radius:6px;vertical-align:top;
                       user-select:none;-webkit-user-drag:none;"
                alt="Device screen" draggable="false">
              <!--
                Overlay: position absolute, akan di-set persis sama ukuran+posisi img oleh JS.
                pointer-events:auto agar click/hover diterima.
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
        <button class="btn btn-d btn-sm" onclick="PageInspector.tapSelected()"
          title="Kirim tap ke device di koordinat tengah element">
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

    // Status badge per step
    const statusBadge = st === 'pass' ? `
      <div title="Step berhasil" style="display:flex;align-items:center;gap:3px;
        background:#dcfce7;border:1px solid rgba(34,197,94,.3);border-radius:4px;
        padding:1px 6px;font-size:9px;font-weight:600;color:#16a34a;flex-shrink:0">
        <i class="bi bi-check-circle-fill"></i> PASS
      </div>` :
    st === 'fail' ? `
      <div title="Step gagal" style="display:flex;align-items:center;gap:3px;
        background:#fee2e2;border:1px solid rgba(239,68,68,.3);border-radius:4px;
        padding:1px 6px;font-size:9px;font-weight:600;color:#dc2626;flex-shrink:0">
        <i class="bi bi-x-circle-fill"></i> FAIL
      </div>` :
    st === 'run' ? `
      <div title="Sedang berjalan" style="display:flex;align-items:center;gap:3px;
        background:#dbeafe;border:1px solid rgba(59,130,246,.3);border-radius:4px;
        padding:1px 6px;font-size:9px;font-weight:600;color:#2563eb;flex-shrink:0">
        <i class="bi bi-arrow-clockwise" style="animation:spin .7s linear infinite"></i> RUN
      </div>` : ''

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
    <div class="step-row ${rCls}" id="sr-${step.id}"
      draggable="true"
      ondragstart="PageInspector.onStepDragStart(event, ${step.id})"
      ondragover="PageInspector.onStepDragOver(event)"
      ondrop="PageInspector.onStepDrop(event, ${step.id})"
      ondragend="PageInspector.onStepDragEnd(event)"
      style="cursor:default;
        ${st==='fail' ? 'border-left:3px solid #dc2626;' :
          st==='pass' ? 'border-left:3px solid #16a34a;' :
          st==='run'  ? 'border-left:3px solid #2563eb;' :
                        'border-left:3px solid transparent;'}">
      <div class="step-drag" style="cursor:grab" title="Drag untuk reorder">
        <i class="bi bi-grip-vertical"></i>
      </div>
      <div class="step-n ${nCls}">${idx+1}</div>
      <div class="step-fields" style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <div class="field" style="margin-bottom:0">
            <label class="fl">Aksi</label>
            <select style="min-width:130px" onchange="PageInspector.updateAction(${step.id},this.value)">
              ${Object.entries(ACTS).map(([k,a]) =>
                `<option value="${k}" ${step.action===k?'selected':''}>${a.l}</option>`).join('')}
            </select>
          </div>
          ${fields.replace(/<div class="field">/g, '<div class="field" style="margin-bottom:0">')}
          ${statusBadge}
        </div>
      </div>
      <button class="step-del" onclick="PageInspector.deleteStep(${step.id})">
        <i class="bi bi-x"></i>
      </button>
    </div>`
  }

  // ── Drag-drop reorder ──────────────────────────────────────
  let _dragId = null

  function onStepDragStart(event, stepId) {
    _dragId = stepId
    event.dataTransfer.effectAllowed = 'move'
    // Visual: opacity turun saat drag
    const el = document.getElementById(`sr-${stepId}`)
    if (el) setTimeout(() => el.style.opacity = '0.4', 0)
  }

  function onStepDragOver(event) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    // Highlight row yang jadi target drop
    const row = event.currentTarget
    if (row) row.style.outline = '2px solid var(--blue)'
  }

  function onStepDrop(event, targetId) {
    event.preventDefault()
    const row = event.currentTarget
    if (row) row.style.outline = ''

    if (_dragId === null || _dragId === targetId) return

    const fromIdx = _steps.findIndex(s => s.id === _dragId)
    const toIdx   = _steps.findIndex(s => s.id === targetId)
    if (fromIdx < 0 || toIdx < 0) return

    // Reorder array
    const moved = _steps.splice(fromIdx, 1)[0]
    _steps.splice(toIdx, 0, moved)

    _dragId = null
    refreshEditor()
    toast('↕ Steps diurutkan ulang')
  }

  function onStepDragEnd(event) {
    // Reset semua visual
    document.querySelectorAll('.step-row').forEach(r => {
      r.style.opacity = ''
      r.style.outline = ''
    })
    _dragId = null
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

    // Selalu update dimensi sebelum render agar highlight presisi
    _updateImgDimensions()

    if (!_elements.length || !_imgW || !_imgH) {
      overlay.innerHTML = ''
      return
    }

    // Gunakan actual rendered image size dari DOM untuk scale yang akurat
    const img = document.getElementById('screen-img')
    const imgW = img ? Math.round(img.getBoundingClientRect().width)  : _imgW
    const imgH = img ? Math.round(img.getBoundingClientRect().height) : _imgH

    const scaleX = imgW / _screenW
    const scaleY = imgH / _screenH

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
    const img = document.getElementById('screen-img')
    if (!img || img.style.display === 'none') return null
    if (!_imgW || !_imgH || !_screenW || !_screenH) return null

    const imgRect = img.getBoundingClientRect()
    const relX    = event.clientX - imgRect.left
    const relY    = event.clientY - imgRect.top

    if (relX < 0 || relY < 0 || relX > imgRect.width || relY > imgRect.height) return null

    const devX = Math.round(relX * _screenW / imgRect.width)
    const devY = Math.round(relY * _screenH / imgRect.height)

    return { devX, devY, relX, relY }
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
          _updateImgDimensions()   // set overlay size + pointer-events:auto
          _attachScreenEvents()    // re-attach click/hover ke overlay (ukuran sudah benar)
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
    const newW = Math.round(rect.width)
    const newH = Math.round(rect.height)

    // Set overlay persis sama ukuran dengan gambar
    // Dengan display:inline-block pada wrap, gambar mulai dari top:0 left:0
    // sehingga overlay cukup di-set width/height sama dengan gambar
    const overlay = document.getElementById('screen-overlay')
    if (overlay) {
      overlay.style.top    = '0px'
      overlay.style.left   = '0px'
      overlay.style.width  = rect.width  + 'px'
      overlay.style.height = rect.height + 'px'
      overlay.style.pointerEvents = 'auto'
      overlay.style.cursor        = 'crosshair'
    }

    // Log hanya kalau dimensi berubah
    if (newW !== _imgW || newH !== _imgH) {
      _imgW = newW
      _imgH = newH
      addDebugLog('info',
        `Render size: ${_imgW}×${_imgH} ` +
        `(device: ${_screenW}×${_screenH}, ` +
        `scale: ${(_imgW/_screenW).toFixed(3)}×${(_imgH/_screenH).toFixed(3)})`
      )
    } else {
      _imgW = newW
      _imgH = newH
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

  function toggleTargetApp() {
    const body    = document.getElementById('target-app-body')
    const chevron = document.getElementById('target-app-chevron')
    const summary = document.getElementById('target-app-summary')
    if (!body) return

    const isOpen = body.style.display !== 'none'
    body.style.display    = isOpen ? 'none' : 'block'
    if (chevron) chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)'
    if (summary) summary.style.display   = isOpen ? 'inline' : 'none'
    AppState.inspector._targetAppOpen = !isOpen
  }

  async function tapSelected() {
    if (!_selectedEl?.bounds || !_serial) {
      toast('⚠️ Pilih element dulu dari XML Tree atau screenshot', 'error')
      return
    }
    const { centerX, centerY } = _selectedEl.bounds
    addDebugLog('cmd', `adb -s ${_serial} shell input tap ${centerX} ${centerY}`)

    const tapBtn = document.querySelector('[onclick="PageInspector.tapSelected()"]')
    if (tapBtn) { tapBtn.disabled = true; tapBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i>' }

    try {
      await window.api.inspector.tap(_serial, centerX, centerY)
      addDebugLog('pass', `✓ Tap terkirim @ (${centerX}, ${centerY})`)
      toast(`Tap @ (${centerX}, ${centerY})`)
      setTimeout(refreshScreen, 1000)
    } catch (err) {
      addDebugLog('fail', `✗ Tap gagal: ${err.message}`)
      toast(`Tap gagal: ${err.message}`, 'error')
    } finally {
      if (tapBtn) { tapBtn.disabled = false; tapBtn.innerHTML = '<i class="bi bi-hand-index-thumb"></i> Tap di Device' }
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

    const pkg = AppState.inspector?.pkg || document.getElementById('cfg-pkg')?.value || ''
    if (!pkg) {
      toast('⚠️ Isi Package Name dulu (atau klik Detect)', 'error')
      addDebugLog('warn', 'Package name kosong — Maestro butuh appId')
      return
    }

    // Cek runner status
    const status = await window.api.runner.getStatus().catch(() => null)
    if (status?.isRunning) {
      toast('⚠️ Runner sedang berjalan. Tunggu selesai.', 'error'); return
    }

    _stepSt = {}
    const dsl = generateDSL({ name: 'Inspector Run', package: pkg, appId: pkg }, _steps)
    const env = AppState.activeEnv?.vars || {}

    const btn = document.getElementById('btn-run-steps')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise" style="animation:spin .8s linear infinite"></i> Berjalan...' }

    addDebugLog('head', '═══ RUN START ═══')
    addDebugLog('info', `Device: ${_serial}`)
    addDebugLog('info', `Package: ${pkg}`)
    addDebugLog('cmd', `maestro --device ${_serial} test [tmp.yaml]`)

    // Tetap di tab Steps agar user bisa lihat status per-step live
    // Switch ke Debug tab untuk lihat log
    _leftTab = 'debug'
    refreshLeftTab()

    try {
      await window.api.runner.run({
        serial:             _serial,
        stepsYaml:          dsl,
        tcName:             'Inspector Run',
        tcId:               'inspector-run',
        envVars:            env,
        noReset:            AppState.inspector?.noReset            || false,
        noReinstallDriver:  AppState.inspector?.noReinstallDriver  || false,
      })
      addDebugLog('pass', '═══ RUN PASSED ═══')
      toast('✅ Semua steps berhasil!', 'success')
    } catch (err) {
      addDebugLog('fail', `═══ RUN FAILED: ${err.message} ═══`)
      toast(`❌ Steps gagal: ${err.message}`, 'error')
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-play-fill"></i> Run Steps' }
      // Kembali ke Steps tab setelah selesai agar user lihat hasil per-step
      _editorTab = 'steps'
      refreshEditor()
      refreshScreen()
    }
  }

  function _setupRunnerListeners() {
    window.api.runner.removeListeners()

    window.api.runner.onLog((entry) => {
      addDebugLog(entry.type, entry.msg)

      // Deteksi INJECT_EVENTS — tampilkan banner install driver
      if (entry.msg && entry.msg.includes('INJECT_EVENTS') && !document.getElementById('inject-events-banner')) {
        _showInstallDriverBanner()
      }

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

  function _showInstallDriverBanner() {
    // Tampilkan banner di bawah step editor
    const editorEl = document.querySelector('.insp-R') || document.getElementById('content-area')
    if (!editorEl) return

    const banner = document.createElement('div')
    banner.id = 'inject-events-banner'
    banner.style.cssText = `
      position:fixed; bottom:20px; right:20px; z-index:999;
      background:#1e1e2e; border:1px solid rgba(229,77,46,.4);
      border-radius:10px; padding:14px 16px; max-width:380px;
      box-shadow:0 8px 32px rgba(0,0,0,.4); color:#e5e5e0;`
    banner.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px">
        <div style="font-size:20px;flex-shrink:0">⚠️</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">
            Maestro Driver Belum Terinstall
          </div>
          <div style="font-size:11px;color:#a0a0a0;margin-bottom:10px;line-height:1.5">
            Untuk menjalankan tap/swipe di device fisik, Maestro perlu install driver APK sekali saja.
          </div>
          <div style="display:flex;gap:6px">
            <button id="btn-install-driver"
              style="background:#e54d2e;color:#fff;border:none;border-radius:6px;
                     padding:7px 14px;font-size:11px;font-weight:600;cursor:pointer;flex:1">
              ⬇️ Install Driver Sekarang
            </button>
            <button onclick="document.getElementById('inject-events-banner').remove()"
              style="background:rgba(255,255,255,.1);color:#a0a0a0;border:none;border-radius:6px;
                     padding:7px 10px;font-size:11px;cursor:pointer">
              ✕
            </button>
          </div>
          <div id="driver-install-log" style="display:none;margin-top:8px;font-size:10px;
            font-family:monospace;color:#50fa7b;max-height:80px;overflow-y:auto;
            background:rgba(0,0,0,.3);border-radius:5px;padding:6px"></div>
        </div>
      </div>`

    document.body.appendChild(banner)

    // Listen driver progress
    window.api.setup.onDriverProgress((data) => {
      const logEl = document.getElementById('driver-install-log')
      if (logEl) {
        logEl.style.display = 'block'
        logEl.textContent += data.msg + '\n'
        logEl.scrollTop = logEl.scrollHeight
      }
    })

    document.getElementById('btn-install-driver')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-install-driver')
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Installing...' }
      try {
        const result = await window.api.setup.installDriver(_serial)
        if (result?.ok) {
          if (btn) { btn.textContent = '✅ Driver Terinstall!' }
          addDebugLog('pass', '✅ Maestro driver terinstall. Coba Run Steps lagi.')
          toast('✅ Driver berhasil diinstall! Coba Run Steps lagi.')
          setTimeout(() => {
            document.getElementById('inject-events-banner')?.remove()
          }, 3000)
        } else {
          if (btn) { btn.textContent = '❌ Gagal — lihat log'; btn.disabled = false }
          addDebugLog('fail', `Driver install gagal: ${result?.error || 'unknown'}`)
        }
      } catch (err) {
        if (btn) { btn.textContent = '❌ Error'; btn.disabled = false }
        addDebugLog('fail', `Driver install error: ${err.message}`)
      }
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
    if (!_steps.length) {
      toast('⚠️ Belum ada steps untuk disimpan', 'error')
      return
    }

    const pkg = AppState.inspector?.pkg || ''

    // ── Mode Update (dari Projects → openInInspector) ──────────
    if (AppState.activeTcId) {
      _showUpdateModal(AppState.activeTcId, AppState.activeTcName, pkg)
      return
    }

    // ── Mode Create baru ───────────────────────────────────────
    let projects = []
    try {
      projects = await window.api.db.getProjects()
    } catch (e) {
      toast('Gagal load projects: ' + e.message, 'error')
      return
    }
    _showSaveModal(projects, pkg)
  }

  async function _showUpdateModal(tcId, tcName, pkg) {
    const overlay = document.createElement('div')
    overlay.id = 'save-tc-modal'
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;
      display:flex;align-items:center;justify-content:center`

    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;padding:24px;width:420px;
        max-width:92vw;box-shadow:var(--sh3);border:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:36px;height:36px;background:#f0faf5;border-radius:9px;
            display:flex;align-items:center;justify-content:center;color:var(--green)">
            <i class="bi bi-arrow-repeat" style="font-size:16px"></i>
          </div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700">Update Test Case</div>
            <div style="font-size:11px;color:var(--text3)">${_steps.length} steps · ${pkg || 'no package'}</div>
          </div>
          <button onclick="document.getElementById('save-tc-modal').remove()"
            style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text3);padding:2px 6px">✕</button>
        </div>

        <!-- TC info -->
        <div style="background:var(--green-bg);border:1px solid rgba(42,157,92,.2);border-radius:8px;
          padding:10px 12px;margin-bottom:16px;font-size:12px">
          <div style="font-weight:600;color:var(--green);margin-bottom:2px">
            <i class="bi bi-check-circle"></i> Akan mengupdate:
          </div>
          <div style="color:var(--text2)">${esc(tcName || tcId)}</div>
        </div>

        <div style="margin-bottom:12px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">
            Nama Test Case
          </label>
          <input type="text" id="stc-name" value="${esc(tcName||'')}" style="width:100%" autocomplete="off">
        </div>

        <div style="margin-bottom:20px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">
            Deskripsi (opsional)
          </label>
          <textarea id="stc-desc" rows="2" style="width:100%;resize:none"
            placeholder="Deskripsi singkat..."></textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-d" onclick="document.getElementById('save-tc-modal').remove()">Batal</button>
          <button class="btn btn-g" onclick="PageInspector._doUpdateTC('${esc(tcId)}')">
            <i class="bi bi-arrow-repeat"></i> Update Test Case
          </button>
        </div>
      </div>`

    document.body.appendChild(overlay)
    setTimeout(() => document.getElementById('stc-name')?.focus(), 50)
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter') PageInspector._doUpdateTC(tcId)
      if (e.key === 'Escape') overlay.remove()
    })
  }

  async function _doUpdateTC(tcId) {
    const name = document.getElementById('stc-name')?.value.trim()
    const desc = document.getElementById('stc-desc')?.value.trim() || ''

    if (!name) {
      toast('⚠️ Nama wajib diisi', 'error'); return
    }

    document.getElementById('save-tc-modal')?.remove()

    try {
      const pkg  = AppState.inspector?.pkg || ''
      const dsl  = generateDSL({ name, package: pkg, appId: pkg }, _steps)
      await window.api.db.saveTestCase({
        id:          tcId,
        name,
        description: desc,
        dsl_yaml:    dsl,
        steps_yaml:  dsl,
        steps_count: _steps.length,
        status:      'pending',
      })

      // Clear edit mode
      AppState.activeTcId   = null
      AppState.activeTcName = null

      toast(`✅ Test Case "${name}" berhasil diupdate!`, 'success')
      addDebugLog('pass', `TC updated: ${name}`)

      // Update tombol di topbar
      const btn = document.getElementById('btn-save-tc')
      if (btn) {
        btn.style.borderColor = ''
        btn.style.color = ''
        btn.innerHTML = '<i class="bi bi-save"></i> Simpan ke TC'
      }
      // Hapus banner edit mode
      document.getElementById('edit-mode-banner')?.remove()

    } catch (err) {
      toast(`Gagal update: ${err.message}`, 'error')
    }
  }

  function _showSaveModal(projects, pkg) {
    // Hapus modal lama kalau ada
    const existing = document.getElementById('save-tc-modal')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.id = 'save-tc-modal'
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2000;
      display:flex;align-items:center;justify-content:center`

    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:14px;padding:24px;width:460px;
        max-width:92vw;box-shadow:var(--sh3);border:1px solid var(--border)">

        <!-- Header -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
          <div style="width:36px;height:36px;background:#f0faf5;border-radius:9px;
            display:flex;align-items:center;justify-content:center;color:var(--green)">
            <i class="bi bi-save-fill" style="font-size:16px"></i>
          </div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700">Simpan ke Test Case</div>
            <div style="font-size:11px;color:var(--text3)">${_steps.length} steps · ${pkg || 'no package'}</div>
          </div>
          <button onclick="document.getElementById('save-tc-modal').remove()"
            style="background:none;border:none;cursor:pointer;font-size:18px;
              color:var(--text3);padding:2px 6px;border-radius:6px">✕</button>
        </div>

        <!-- TC Name -->
        <div style="margin-bottom:12px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">
            Nama Test Case <span style="color:var(--red)">*</span>
          </label>
          <input type="text" id="stc-name" placeholder="Misal: Login dengan email valid"
            style="width:100%" autocomplete="off"
            value="${pkg ? pkg.split('.').pop() + ' flow' : 'Test Case'}">
        </div>

        <!-- Description -->
        <div style="margin-bottom:14px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">
            Deskripsi (opsional)
          </label>
          <textarea id="stc-desc" placeholder="Deskripsi singkat test case ini..."
            rows="2" style="width:100%;resize:none"></textarea>
        </div>

        <div style="height:1px;background:var(--border);margin-bottom:14px"></div>

        <!-- Project selector -->
        <div style="margin-bottom:10px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">
            Project <span style="color:var(--red)">*</span>
          </label>
          ${projects.length ? `
            <select id="stc-project" style="width:100%" onchange="PageInspector._onSaveProjChange(this.value)">
              <option value="">-- Pilih Project --</option>
              ${projects.map(p => `
                <option value="${p.id}" data-name="${esc(p.name)}">${esc(p.name)} (${esc(p.platform||'android')})</option>
              `).join('')}
            </select>` : `
            <div style="background:var(--yellow-bg);border:1px solid rgba(196,125,14,.2);
              border-radius:7px;padding:9px 11px;font-size:11px;color:var(--text2)">
              <i class="bi bi-exclamation-triangle" style="color:var(--yellow)"></i>
              Belum ada project.
              <span style="color:var(--blue);cursor:pointer;text-decoration:underline"
                onclick="document.getElementById('save-tc-modal').remove();navigate('projects')">
                Buat project dulu →
              </span>
            </div>`}
        </div>

        <!-- Suite selector -->
        <div style="margin-bottom:10px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">Suite</label>
          <select id="stc-suite" style="width:100%" onchange="PageInspector._onSaveSuiteChange(this.value)" disabled>
            <option value="">-- Pilih project dulu --</option>
          </select>
        </div>

        <!-- Section selector -->
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:5px">Section</label>
          <select id="stc-section" style="width:100%" disabled>
            <option value="">-- Pilih suite dulu --</option>
          </select>
        </div>

        <!-- Actions -->
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-d" onclick="document.getElementById('save-tc-modal').remove()">
            Batal
          </button>
          <button class="btn btn-g" onclick="PageInspector._doSaveTC()" id="stc-save-btn"
            ${!projects.length ? 'disabled' : ''}>
            <i class="bi bi-save-fill"></i> Simpan Test Case
          </button>
        </div>
      </div>`

    document.body.appendChild(overlay)

    // Focus TC name input
    setTimeout(() => {
      const nameEl = document.getElementById('stc-name')
      if (nameEl) { nameEl.focus(); nameEl.select() }
    }, 50)

    // Enter = save
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') PageInspector._doSaveTC()
      if (e.key === 'Escape') overlay.remove()
    })
  }

  async function _onSaveProjChange(projId) {
    const suiteEl   = document.getElementById('stc-suite')
    const sectionEl = document.getElementById('stc-section')
    if (!suiteEl || !sectionEl) return

    if (!projId) {
      suiteEl.innerHTML   = '<option value="">-- Pilih project dulu --</option>'
      suiteEl.disabled    = true
      sectionEl.innerHTML = '<option value="">-- Pilih suite dulu --</option>'
      sectionEl.disabled  = true
      return
    }

    suiteEl.innerHTML = '<option value="">Memuat...</option>'
    suiteEl.disabled  = true
    try {
      const suites = await window.api.db.getSuites(projId)
      suiteEl.innerHTML = `
        <option value="">-- Pilih Suite --</option>
        ${suites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        <option value="__new__">+ Buat suite baru</option>`
      suiteEl.disabled = false
    } catch (e) {
      suiteEl.innerHTML = '<option value="">Gagal load suites</option>'
    }
    sectionEl.innerHTML = '<option value="">-- Pilih suite dulu --</option>'
    sectionEl.disabled  = true
  }

  async function _onSaveSuiteChange(suiteId) {
    const sectionEl = document.getElementById('stc-section')
    if (!sectionEl) return

    if (suiteId === '__new__') {
      const projId = document.getElementById('stc-project')?.value
      if (!projId) return
      const name = await _inlineInput('Nama suite baru:', 'Regression Suite')
      if (!name) {
        // Reset dropdown
        document.getElementById('stc-suite').value = ''
        return
      }
      const suite = await window.api.db.saveSuite({ project_id: projId, name })
      toast(`✅ Suite "${name}" dibuat`)
      await _onSaveProjChange(projId)
      const suiteEl = document.getElementById('stc-suite')
      if (suiteEl) suiteEl.value = suite.id
      // Load sections untuk suite baru
      await _loadSectionsForSuite(suite.id, sectionEl)
      return
    }

    if (!suiteId) {
      sectionEl.innerHTML = '<option value="">-- Pilih suite dulu --</option>'
      sectionEl.disabled  = true
      return
    }

    await _loadSectionsForSuite(suiteId, sectionEl)
  }

  async function _loadSectionsForSuite(suiteId, sectionEl) {
    if (!sectionEl) return
    sectionEl.innerHTML = '<option value="">Memuat...</option>'
    sectionEl.disabled  = true
    try {
      const sections = await window.api.db.getSections(suiteId)
      sectionEl.innerHTML = `
        <option value="">-- Pilih Section (opsional) --</option>
        ${sections.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        <option value="__new__">+ Buat section baru</option>`
      sectionEl.disabled = false

      // Handle pilih "+ Buat section baru" dari dropdown
      sectionEl.onchange = async () => {
        if (sectionEl.value === '__new__') {
          const name = await _inlineInput('Nama section baru:', 'Section 1')
          if (!name) { sectionEl.value = ''; return }
          const sec = await window.api.db.saveSection({ suite_id: suiteId, name })
          toast(`✅ Section "${name}" dibuat`)
          // Tambah ke dropdown dan pilih
          const opt = document.createElement('option')
          opt.value = sec.id
          opt.text  = esc(name)
          // insert sebelum "+ Buat section baru"
          const newOpt = sectionEl.querySelector('option[value="__new__"]')
          sectionEl.insertBefore(opt, newOpt)
          sectionEl.value = sec.id
        }
      }
    } catch (e) {
      sectionEl.innerHTML = '<option value="">Gagal load sections</option>'
    }
  }

  async function _doSaveTC() {
    const nameEl    = document.getElementById('stc-name')
    const descEl    = document.getElementById('stc-desc')
    const projEl    = document.getElementById('stc-project')
    const suiteEl   = document.getElementById('stc-suite')
    const sectionEl = document.getElementById('stc-section')

    const name    = nameEl?.value.trim()
    const desc    = descEl?.value.trim() || ''
    const projId  = projEl?.value
    const suiteId = suiteEl?.value
    let   secId   = sectionEl?.value

    // Validasi
    if (!name) {
      if (nameEl) { nameEl.style.borderColor = 'var(--red)'; nameEl.focus() }
      toast('⚠️ Nama test case wajib diisi', 'error')
      return
    }
    if (!projId) {
      toast('⚠️ Pilih project dulu', 'error')
      return
    }

    const btn = document.getElementById('stc-save-btn')
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Menyimpan...' }

    try {
      // Buat suite/section baru kalau dipilih __new__
      if (suiteId === '__new__' || !suiteId) {
        // Kalau tidak ada suite, buat otomatis
        const suite = await window.api.db.saveSuite({
          project_id: projId,
          name: `Suite - ${name.substring(0, 20)}`,
        })
        // secId tetap null (no section)
        secId = null
        // Lanjut save TC di suite baru ini
        const pkg = AppState.inspector?.pkg || ''
        const dsl = generateDSL({ name, package: pkg, appId: pkg }, _steps)
        await window.api.db.saveTestCase({
          section_id:  null,
          suite_id:    suite.id,
          name,
          description: desc,
          status:      'pending',
          dsl_yaml:    dsl,
          priority:    'medium',
        })
      } else if (secId === '__new__') {
        // Buat section baru
        const secName = await _inlineInput('Nama section baru:', 'Section 1')
        const section = await window.api.db.saveSection({ suite_id: suiteId, name: secName || 'Section 1' })
        secId = section.id
        const pkg = AppState.inspector?.pkg || ''
        const dsl = generateDSL({ name, package: pkg, appId: pkg }, _steps)
        await window.api.db.saveTestCase({
          section_id:  secId,
          name, description: desc, status: 'pending', dsl_yaml: dsl, priority: 'medium',
        })
      } else {
        // Normal save
        const pkg = AppState.inspector?.pkg || ''
        const dsl = generateDSL({ name, package: pkg, appId: pkg }, _steps)
        await window.api.db.saveTestCase({
          section_id:  secId || null,
          suite_id:    secId ? undefined : suiteId,
          name, description: desc, status: 'pending', dsl_yaml: dsl, priority: 'medium',
        })
      }

      document.getElementById('save-tc-modal')?.remove()
      toast(`✅ Test Case "${name}" disimpan ke Projects!`, 'success')

      // Update badge projects
      const projects = await window.api.db.getProjects().catch(() => [])
      const badge = document.getElementById('badge-projects')
      if (badge) badge.textContent = projects.length

    } catch (err) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-save-fill"></i> Simpan Test Case' }
      toast(`Gagal simpan: ${err.message}`, 'error')
      addDebugLog('fail', `Save TC error: ${err.message}`)
    }
  }

  // Helper: inline prompt replacement
  function _inlineInput(label, defaultVal) {
    return new Promise(resolve => {
      const d = document.createElement('div')
      d.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;
        display:flex;align-items:center;justify-content:center`
      d.innerHTML = `
        <div style="background:var(--surface);border-radius:10px;padding:20px;width:320px;
          box-shadow:var(--sh3);border:1px solid var(--border)">
          <div style="font-size:12px;font-weight:600;margin-bottom:8px">${esc(label)}</div>
          <input type="text" id="inline-inp" value="${esc(defaultVal||'')}"
            style="width:100%;margin-bottom:12px" autocomplete="off">
          <div style="display:flex;justify-content:flex-end;gap:6px">
            <button class="btn btn-d btn-sm" id="inline-cancel">Batal</button>
            <button class="btn btn-p btn-sm" id="inline-ok">OK</button>
          </div>
        </div>`
      document.body.appendChild(d)
      const inp = d.querySelector('#inline-inp')
      setTimeout(() => { inp?.focus(); inp?.select() }, 30)
      d.querySelector('#inline-ok').onclick    = () => { document.body.removeChild(d); resolve(inp.value.trim()) }
      d.querySelector('#inline-cancel').onclick = () => { document.body.removeChild(d); resolve('') }
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { document.body.removeChild(d); resolve(inp.value.trim()) }
        if (e.key === 'Escape') { document.body.removeChild(d); resolve('') }
      })
    })
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
    handleApkUpload, useSelector, toggleConfig, toggleTargetApp,
    addStep, deleteStep, updateAction, updateParam,
    switchLeftTab, switchEditorTab, exportDSL, saveToTC,
    runSteps, selectElement, hoverElement, unhoverElement,
    onScreenClick, onScreenHover, onScreenLeave,
    detectActiveApp, loadActivities, onPkgChange,
    onStepDragStart, onStepDragOver, onStepDrop, onStepDragEnd,
    // saveToTC helpers — dipanggil dari inline HTML modal
    _onSaveProjChange, _onSaveSuiteChange, _doSaveTC, _doUpdateTC,
  }
})()