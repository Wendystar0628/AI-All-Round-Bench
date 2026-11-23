// 通用控件：数值拖拽输入、颜色、菜单、对话框、提示、图标
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const h = MF.h, App = MF.App;

  const ICON = {
    select: 'M4 2l8 6-3.4.6L10.6 13l-1.7.8-2-4.4L4 12z', hand: 'M5 8V3.5a1 1 0 012 0V7m0-4.5a1 1 0 012 0V7m0-3.5a1 1 0 012 0V8m0-2a1 1 0 012 0v4c0 3-2 4-4.5 4S4 13 3 11L2 8.5a1 1 0 012-.5l1 1.5',
    zoom: 'M7 12A5 5 0 107 2a5 5 0 000 10zm3.5-1.5L14 14', rotate: 'M13 8a5 5 0 11-1.6-3.7M13 2v3h-3', anchor: 'M8 2v12M2 8h12M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
    rect: 'M3 4h10v8H3z', ellipse: 'M8 3.5c3 0 5 2 5 4.5s-2 4.5-5 4.5S3 10.5 3 8s2-4.5 5-4.5z', star: 'M8 2l1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4l-3.7 2.1.8-4.2L2 6.4l4.2-.5z',
    pen: 'M3 13l1-4 7-7 3 3-7 7zM9.5 3.5l3 3', text: 'M3 4V3h10v1M8 3v10M6 13h4', pin: 'M8 14V9M5 3h6l-1 3 2 3H4l2-3z',
    eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 100 4 2 2 0 000-4z', lock: 'M4 7h8v6H4zM5.5 7V5a2.5 2.5 0 015 0v2',
    play: 'M5 3l8 5-8 5z', pause: 'M5 3v10M11 3v10', prev: 'M10 3L5 8l5 5M4 3v10', next: 'M6 3l5 5-5 5M12 3v10', first: 'M12 3L6 8l6 5M4 3v10', last: 'M4 3l6 5-6 5M12 3v10',
    loop: 'M3 8a4 4 0 014-4h5l-2-2m2 2l-2 2M13 8a4 4 0 01-4 4H4l2 2m-2-2l2-2', mb: 'M3 8a5 5 0 0110 0M5 8a3 3 0 016 0M8 8v0', cube: 'M8 2l5 3v6l-5 3-5-3V5zM3 5l5 3 5-3M8 8v6',
    graph: 'M2 13C5 13 5 3 8 3s3 10 6 10', node: 'M2 4h4v3H2zM10 9h4v3h-4zM6 5.5h2c1.5 0 1 5 2 5', plus: 'M8 3v10M3 8h10', trash: 'M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.5 8.5h6l.5-8.5',
    shape: 'M3 3h6v6H3zM8.5 8.5a3.5 3.5 0 107 0 3.5 3.5 0 00-7 0z', nul: 'M3 3h10v10H3zM3 3l10 10', adjust: 'M8 2a6 6 0 100 12V2z', precomp: 'M2 4h12v9H2zM2 6.5h12M5 4v2.5M11 4v2.5',
    camera: 'M2 5h8v6H2zM10 7l4-2v6l-4-2', light: 'M8 2a4 4 0 00-2 7.5V11h4V9.5A4 4 0 008 2zM6.5 13h3', geo: 'M8 2l5 3v6l-5 3-5-3V5zM3 5l5 3 5-3M8 8v6', particles: 'M4 4h.01M11 3h.01M8 7h.01M3 10h.01M12 9h.01M7 13h.01M12 13h.01M6 2h.01',
    audio: 'M3 6v4M6 4v8M9 2v12M12 5v6', fit: 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4', field: 'M8 8m-6 0a6 6 0 1012 0 6 6 0 10-12 0M8 8m-2.5 0a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0', path: 'M2 12c2-8 6-8 7-4s4 2 5-4',
    up: 'M4 10l4-4 4 4', down: 'M4 6l4 4 4-4', snap: 'M4 3v5a4 4 0 008 0V3M4 6h2.5M9.5 6H12', max: 'M3 3h10v10H3z', group: 'M2 2h5v5H2zM9 9h5v5H9zM7 4.5h4.5V9', link: 'M6.5 9.5l3-3M5 7L3.5 8.5a2.1 2.1 0 003 3L8 10M11 9l1.5-1.5a2.1 2.1 0 00-3-3L8 6',
  };
  const icon = (name) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 16 16'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICON[name] || ''); el.appendChild(p); return el; };

  const W = (MF.W = {
    icon, ICON,
    fmtNum(v, meta) { if (!isFinite(v)) return '—'; const st = meta && meta.step; const d = st && st >= 1 ? 0 : st && st < 0.05 ? 2 : Math.abs(v) >= 1000 ? 0 : (st && st < 1) ? 2 : 1; let s = v.toFixed(d); if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, ''); if (s === '-0') s = '0'; return s; },
    // 数值输入：左右拖动微调，单击输入；o = { get, set(v), begin(), end(), meta, cls }
    num(o) {
      const meta = o.meta || {}; const el = h('input', { class: 'num ' + (o.cls || ''), type: 'text', spellcheck: false, title: o.title || '' });
      el.value = W.fmtNum(o.get(), meta); el.readOnly = true;
      let drag = null;
      const clampV = (v) => { if (meta.min !== undefined) v = Math.max(meta.min, v); if (meta.max !== undefined) v = Math.min(meta.max, v); return v; };
      el.addEventListener('pointerdown', (e) => { if (!el.readOnly || e.button !== 0) return; drag = { x: e.clientX, v0: +o.get() || 0, moved: false }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return; const dx = e.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) < 3) return;
        if (!drag.moved) { drag.moved = true; if (o.begin) o.begin(); document.body.style.cursor = 'ew-resize'; }
        const base = meta.step || (Math.abs(drag.v0) < 5 && (meta.max !== undefined && meta.max <= 1) ? 0.01 : 1); const k = e.shiftKey ? 10 : e.ctrlKey || e.altKey ? 0.1 : 1;
        let v = clampV(drag.v0 + dx * base * k * (meta.step ? 1 : 0.5)); if (meta.step >= 1) v = Math.round(v); else v = Math.round(v * 1000) / 1000;
        o.set(v); el.value = W.fmtNum(v, meta);
      });
      const up = (e) => { if (!drag) return; const d = drag; drag = null; document.body.style.cursor = ''; try { el.releasePointerCapture(e.pointerId); } catch (x) { /* 已释放 */ } if (d.moved) { if (o.end) o.end(); } else { el.readOnly = false; el.value = String(Math.round((+o.get() || 0) * 10000) / 10000); el.focus(); el.select(); } };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      const commit = () => { if (el.readOnly) return; el.readOnly = true; let v = parseExpr(el.value, +o.get() || 0); if (isFinite(v)) { v = clampV(v); if (o.begin) o.begin(); o.set(v); if (o.end) o.end(); } el.value = W.fmtNum(+o.get(), meta); };
      el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { commit(); el.blur(); } else if (e.key === 'Escape') { el.readOnly = true; el.value = W.fmtNum(+o.get(), meta); el.blur(); } else if (e.key === 'Tab') { commit(); } });
      el.addEventListener('blur', commit);
      el._refresh = () => { if (el.readOnly && !drag) { const s = W.fmtNum(+o.get(), meta); if (el.value !== s) el.value = s; } };
      return el;
    },
    color(o) { const b = h('span', { class: 'swatch', title: '点击选择颜色' }); const inp = h('input', { type: 'color' }); b.appendChild(inp); const paint = () => { const c = o.get(); b.style.background = MF.cssColor(c, 1); inp.value = MF.rgbToHex(c); }; paint(); let open = false; inp.addEventListener('input', () => { if (!open) { open = true; if (o.begin) o.begin(); } const c = MF.hexToRgb(inp.value); const old = o.get(); c[3] = old[3] === undefined ? 1 : old[3]; o.set(c); b.style.background = inp.value; }); inp.addEventListener('change', () => { if (open) { open = false; if (o.end) o.end(); } }); inp.addEventListener('blur', () => { if (open) { open = false; if (o.end) o.end(); } }); b._refresh = () => { if (!open) paint(); }; return b; },
    select(options, value, onChange, cls) { const s = h('select', { class: cls || 'sel' }); for (const [v, l] of options) { const op = h('option', { value: v === null ? '' : v }, l); if (v === value || (v === null && (value === null || value === undefined))) op.selected = true; s.appendChild(op); } s.addEventListener('change', () => onChange(s.value === '' ? null : s.value)); s.addEventListener('keydown', (e) => e.stopPropagation()); s.addEventListener('pointerdown', (e) => e.stopPropagation()); return s; },
    // 弹出菜单：items = [{label, key, run, dis, chk} | '-' | {hd:'标题'}]
    menu(x, y, items, anchorEl) {
      W.closeMenus(); const d = h('div', { class: 'dropdown' });
      for (const it of items) {
        if (!it) continue;
        if (it === '-') { d.appendChild(h('div', { class: 'sep' })); continue; }
        if (it.hd) { d.appendChild(h('div', { class: 'hd' }, it.hd)); continue; }
        const mi = h('div', { class: 'mi' + (it.dis ? ' dis' : '') + (it.chk ? ' chk' : '') }, it.label, it.key ? h('kbd', null, it.key) : null);
        mi.addEventListener('pointerup', (e) => { e.stopPropagation(); W.closeMenus(); try { it.run(); } catch (err) { console.error(err); App.toast('操作失败：' + err.message, 'err'); } });
        d.appendChild(mi);
      }
      document.body.appendChild(d); const r = d.getBoundingClientRect(); if (x + r.width > innerWidth - 4) x = Math.max(4, innerWidth - r.width - 4); if (y + r.height > innerHeight - 4) y = Math.max(4, innerHeight - r.height - 4);
      d.style.left = x + 'px'; d.style.top = y + 'px'; W._menu = d; W._menuAnchor = anchorEl || null; if (anchorEl) anchorEl.classList.add('open');
      setTimeout(() => document.addEventListener('pointerdown', W._menuClose, true), 0);
      return d;
    },
    _menuClose(e) { if (W._menu && W._menu.contains(e.target)) return; W.closeMenus(); },
    closeMenus() { if (W._menu) { W._menu.remove(); W._menu = null; } if (W._menuAnchor) { W._menuAnchor.classList.remove('open'); W._menuAnchor = null; } document.removeEventListener('pointerdown', W._menuClose, true); },
    // 对话框：fields = [{key,label,type:'text'|'number'|'select'|'color'|'note',value,options}]
    modal(title, fields, onOk, okLabel) {
      const bg = h('div', { class: 'modal-bg' }); const vals = {}; const body = h('div', { class: 'mb' }); let first = null;
      for (const f of fields) {
        if (f.type === 'note') { body.appendChild(h('div', { class: 'full note', style: { padding: '0' }, html: f.html || '' }, f.html ? null : f.label)); continue; }
        if (f.type === 'custom') { body.appendChild(h('div', { class: 'full' }, f.el)); continue; }
        vals[f.key] = f.value; body.appendChild(h('label', null, f.label)); let inp;
        if (f.type === 'select') { inp = h('select', null, f.options.map(([v, l]) => h('option', { value: v, selected: v === f.value }, l))); inp.addEventListener('change', () => (vals[f.key] = inp.value)); }
        else if (f.type === 'color') { inp = h('input', { type: 'color', value: MF.rgbToHex(f.value) }); inp.addEventListener('input', () => (vals[f.key] = MF.hexToRgb(inp.value).slice(0, 3))); }
        else if (f.type === 'checkbox') { inp = h('input', { type: 'checkbox', checked: !!f.value, style: { width: 'auto', justifySelf: 'start' } }); inp.addEventListener('change', () => (vals[f.key] = inp.checked)); }
        else { inp = h('input', { type: f.type === 'number' ? 'number' : 'text', value: f.value, step: f.step || 'any' }); inp.addEventListener('input', () => (vals[f.key] = f.type === 'number' ? +inp.value : inp.value)); }
        inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); if (e.key === 'Escape') close(); });
        if (!first && f.type !== 'select' && f.type !== 'checkbox') first = inp; body.appendChild(inp);
      }
      const close = () => bg.remove(); const ok = () => { close(); if (onOk) onOk(vals); };
      const m = h('div', { class: 'modal' }, h('h3', null, title), body, h('div', { class: 'mf' }, onOk ? h('button', { class: 'btn', onclick: close }, '取消') : null, h('button', { class: 'btn pri', onclick: ok }, okLabel || '确定')));
      bg.appendChild(m); bg.addEventListener('pointerdown', (e) => { if (e.target === bg) close(); }); document.body.appendChild(bg); if (first) { first.focus(); first.select && first.select(); }
      return { close };
    },
    tip(el, text) { el.addEventListener('pointerenter', () => { const t = typeof text === 'function' ? text() : text; if (!t) return; W.showTip(el, t); }); el.addEventListener('pointerleave', W.hideTip); el.addEventListener('pointerdown', W.hideTip); return el; },
    showTip(el, t, x, y) { W.hideTip(); const d = h('div', { class: 'tip', html: t }); document.body.appendChild(d); const r = el ? el.getBoundingClientRect() : { left: x, bottom: y, top: y }; const dr = d.getBoundingClientRect(); let px = x !== undefined ? x + 12 : r.left, py = y !== undefined ? y + 14 : r.bottom + 6; if (px + dr.width > innerWidth - 6) px = innerWidth - dr.width - 6; if (py + dr.height > innerHeight - 6) py = (x !== undefined ? y : r.top) - dr.height - 8; d.style.left = px + 'px'; d.style.top = py + 'px'; W._tip = d; },
    hideTip() { if (W._tip) { W._tip.remove(); W._tip = null; } },
    // 拖动助手
    drag(e, onMove, onEnd) { const el = e.currentTarget || e.target; const id = e.pointerId; const mv = (ev) => { if (ev.pointerId === id) onMove(ev); }; const up = (ev) => { if (ev.pointerId !== id) return; window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); if (onEnd) onEnd(ev); }; window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true); void el; },
  });
  // 支持简单算式输入：+=10、*2、1920/2
  function parseExpr(s, cur) {
    s = String(s).trim().replace(/，/g, ','); if (!s) return NaN;
    const m = s.match(/^([+\-*/])=\s*(-?[\d.]+)$/); if (m) { const b = parseFloat(m[2]); return m[1] === '+' ? cur + b : m[1] === '-' ? cur - b : m[1] === '*' ? cur * b : cur / b; }
    if (/^[-+*/().\d\s]+$/.test(s)) { try { const v = Function('"use strict";return (' + s + ')')(); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; } }
    return parseFloat(s);
  }
})();
