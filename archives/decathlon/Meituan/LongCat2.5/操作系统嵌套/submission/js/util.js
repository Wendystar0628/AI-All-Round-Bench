'use strict';
// ============ 通用工具 ============
window.NOS = window.NOS || {};
(function (NS) {
  let _uid = 1;
  NS.uid = function (p) { return (p || 'id') + '-' + (_uid++) + '-' + Math.random().toString(36).slice(2, 7); };
  NS.now = () => Date.now();
  NS.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  NS.lerp = (a, b, t) => a + (b - a) * t;
  NS.fmtBytes = function (n) {
    if (n == null || isNaN(n)) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(1) : Math.round(n)) + ' ' + u[i];
  };
  NS.fmtNum = (n, d) => { if (typeof n !== 'number' || isNaN(n)) return '-'; return n.toFixed(d === undefined ? 2 : d); };
  NS.pad2 = n => String(n).padStart(2, '0');
  NS.fmtClock = function (ms) {
    const s = Math.floor(ms / 1000);
    return NS.pad2(Math.floor(s / 60)) + ':' + NS.pad2(s % 60);
  };
  NS.fmtTimeFull = function (ms) {
    const s = Math.floor(ms / 1000);
    return NS.pad2(Math.floor(s / 3600)) + ':' + NS.pad2(Math.floor(s / 60) % 60) + ':' + NS.pad2(s % 60);
  };
  NS.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
      else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };
  NS.svgIcon = function (path, size, cls) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || '16');
    svg.setAttribute('height', size || '16');
    if (cls) svg.setAttribute('class', cls);
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    p.setAttribute('fill', 'currentColor');
    svg.appendChild(p);
    return svg;
  };
  NS.deepCopy = function (v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(NS.deepCopy);
    const o = {};
    for (const k in v) o[k] = NS.deepCopy(v[k]);
    return o;
  };
  NS.jsonClone = function (v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return NS.deepCopy(v); } };
  NS.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); };
  NS.download = function (name, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const a = NS.el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  NS.confirmDialog = function (opts) {
    // opts: {title, message, detail, okText, cancelText, danger, onOk}
    return new Promise(resolve => {
      const host = document.getElementById('overlay-layer');
      const back = NS.el('div', { class: 'dialog-back' });
      const dlg = NS.el('div', { class: 'dialog', role: 'dialog', 'aria-label': opts.title });
      const dh = NS.el('div', { class: 'dh', text: opts.title || '确认' });
      const db = NS.el('div', { class: 'db' });
      db.appendChild(NS.el('div', { text: opts.message || '' }));
      if (opts.detail) db.appendChild(NS.el('div', { class: 'tiny muted', style: { marginTop: '.4rem', whiteSpace: 'pre-wrap' }, text: opts.detail }));
      if (opts.input) {
        const inp = NS.el('input', { class: 'inp', value: opts.inputValue || '', placeholder: opts.inputPlaceholder || '' });
        db.appendChild(inp);
        setTimeout(() => inp.focus(), 30);
      }
      const df = NS.el('div', { class: 'df' });
      const cancel = NS.el('button', { class: 'btn', text: opts.cancelText || '取消' });
      const ok = NS.el('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), text: opts.okText || '确定' });
      const close = (val) => { back.remove(); resolve(val); };
      cancel.onclick = () => close(false);
      ok.onclick = () => close(opts.input ? (document.querySelector('.dialog .inp') ? document.querySelector('.dialog .inp').value : '') : true);
      back.onmousedown = (e) => { if (e.target === back) close(false); };
      back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') ok.click(); });
      df.append(cancel, ok);
      dlg.append(dh, db, df);
      back.appendChild(dlg);
      host.appendChild(back);
    });
  };
  NS.toast = function (opts) {
    // opts: {icon, title, body, timeout, systemId}
    const host = document.getElementById('toast-layer');
    const t = NS.el('div', { class: 'toast', role: 'status' });
    if (opts.systemId) t.setAttribute('data-system-id', opts.systemId);
    t.appendChild(NS.el('div', { class: 'tg', text: opts.icon || '🔔' }));
    const mid = NS.el('div', { style: { flex: 1, minWidth: 0 } });
    mid.appendChild(NS.el('div', { class: 'tt', text: opts.title || '' }));
    if (opts.body) mid.appendChild(NS.el('div', { class: 'tb', html: opts.body }));
    t.appendChild(mid);
    const tx = NS.el('div', { class: 'tx', text: '✕', role: 'button', tabindex: '-1' });
    tx.onclick = () => dismiss();
    t.appendChild(tx);
    host.appendChild(t);
    const timer = setTimeout(dismiss, opts.timeout || 5000);
    function dismiss() { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 320); }
    return dismiss;
  };
  // 稳定ID生成（系统/窗口/进程）
  NS.makeId = function (prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9) + (_uid++); };

  // 简单事件总线
  NS.Bus = class {
    constructor() { this.map = {}; }
    on(ev, fn) { (this.map[ev] = this.map[ev] || []).push(fn); return () => this.off(ev, fn); }
    off(ev, fn) { const a = this.map[ev]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
    emit(ev, ...args) { const a = this.map[ev]; if (a) a.slice().forEach(f => { try { f(...args); } catch (e) { console.error(e); } }); }
  };
  NS.sleepMs = ms => new Promise(r => setTimeout(r, ms));
})(window.NOS);
