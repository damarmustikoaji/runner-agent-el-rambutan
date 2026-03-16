/* utils.js — shared renderer utilities */
;(function() {
  'use strict'

  // ── Toast ──────────────────────────────────────────────────
  window.toast = function(msg, type = 'default', duration = 2800) {
    const wrap = document.getElementById('toasts')
    if (!wrap) return
    const t = document.createElement('div')
    t.className = 'toast'
    if (type === 'error') t.style.background = '#b91c1c'
    if (type === 'success') t.style.background = '#166534'
    t.textContent = msg
    wrap.appendChild(t)
    setTimeout(() => {
      t.style.opacity = '0'
      t.style.transition = 'opacity .2s'
    }, duration - 200)
    setTimeout(() => t.remove(), duration)
  }

  // ── Modal ──────────────────────────────────────────────────
  window.openModal  = (id) => document.getElementById(id)?.classList.add('open')
  window.closeModal = (id) => document.getElementById(id)?.classList.remove('open')

  // ── HTML escape ────────────────────────────────────────────
  window.esc = function(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── Generate ID ────────────────────────────────────────────
  window.genId = function(prefix = '') {
    return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }

  // ── DSL Generator ──────────────────────────────────────────
  window.generateDSL = function(meta, steps) {
    const lines = [
      `# TestPilot DSL v1.0`,
      `# ${new Date().toISOString().split('T')[0]}`,
      ``,
      `scenario:`,
      `  name: "${meta.name || 'Test Case'}"`,
      `  platform: android`,
      `  package: "${meta.package || ''}"`,
    ]
    if (meta.tags?.length) {
      lines.push(`  tags: [${meta.tags.map(t => `"${t}"`).join(', ')}]`)
    }
    lines.push(``, `steps:`)

    steps.forEach((step, i) => {
      lines.push(`  - step: ${i + 1}`)
      lines.push(`    action: ${step.action}`)
      const p = step.params || {}
      if (p.package)    lines.push(`    package: "${p.package}"`)
      if (p.selector)   lines.push(`    selector: "${p.selector}"`)
      if (p.value)      lines.push(`    value: "${p.value}"`)
      if (p.expected)   lines.push(`    expected: "${p.expected}"`)
      if (p.direction)  lines.push(`    direction: ${p.direction}`)
      if (p.ms)         lines.push(`    duration_ms: ${p.ms}`)
      if (p.name)       lines.push(`    filename: "${p.name}"`)
      if (p.desc)       lines.push(`    # ${p.desc}`)
    })

    return lines.join('\n')
  }

  // ── Colorize DSL for display ───────────────────────────────
  window.colorizeDSL = function(dsl) {
    return dsl.split('\n').map(line => {
      if (line.trim().startsWith('#'))
        return `<span class="dc">${esc(line)}</span>`
      const m = line.match(/^(\s*)([\w_]+)(:\s*)(.*)$/)
      if (m)
        return `${esc(m[1])}<span class="dk">${esc(m[2])}</span>${esc(m[3])}<span class="dv">${esc(m[4])}</span>`
      return esc(line)
    }).join('\n')
  }

  // ── Format timestamp ───────────────────────────────────────
  window.fmtTime = function() {
    return new Date().toTimeString().slice(0, 8)
  }

  // ── Debounce ───────────────────────────────────────────────
  window.debounce = function(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
  }

  // ── Handle IPC error response ──────────────────────────────
  window.isIpcError = function(result) {
    return result && result.__error === true
  }

  // ── Copy to clipboard ──────────────────────────────────────
  window.copyText = function(text) {
    navigator.clipboard?.writeText(text).then(() => toast('📋 Berhasil dicopy!'))
  }

  console.log('[utils] loaded')
})()