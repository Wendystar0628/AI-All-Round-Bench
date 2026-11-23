'use strict';
/* 根系统桌面外壳：窗口管理、任务栏、开始菜单、对话框、通知，以及把原始输入送进子系统。 */
(function () {
  const OS = window.OS;
  const $ = (s, r) => (r || document).querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    return el;
  };
  const icon = (name) => { const s = h('span', { class: 'ic' }); s.innerHTML = window.deviceIconSvg(name); return s; };
  const svgIcon = (name) => window.deviceIconSvg(name);
  OS.h = h; OS.icon = icon; OS.svgIcon = svgIcon; OS.$ = $;

  const TASKBAR_H = 46;
  const wm = OS.wm = {
    wins: [], seq: 0, focused: null, z: 10, scale: 1, deskW: 0, deskH: 0,
    capture: null, hoverSys: null, drag: null, apps: {}, order: [], menus: null, dialogs: [],
    notes: [], dnd: false, noteOpen: false
  };

  // ---------- 桌面尺寸与缩放 ----------
  wm.layout = function () {
    const vp = $('#viewport'), desk = $('#desk');
    const s = wm.scale = OS.settings.get('scale') || 1;
    wm.deskW = Math.round(vp.clientWidth / s); wm.deskH = Math.round(vp.clientHeight / s);
    desk.style.width = wm.deskW + 'px'; desk.style.height = wm.deskH + 'px';
    desk.style.transform = s === 1 ? '' : 'scale(' + s + ')';
    for (const w of wm.wins) { if (w.state === 'max') wm.applyRect(w, 0, 0, wm.deskW, wm.deskH - TASKBAR_H); else if (w.snap) wm.snapTo(w, w.snap); else wm.clampWin(w); }
    wm.layoutIcons();
  };
  // 指针位置 → 桌面坐标（考虑界面缩放）
  wm.toDesk = (e) => { const r = $('#desk').getBoundingClientRect(); return { x: (e.clientX - r.left) / wm.scale, y: (e.clientY - r.top) / wm.scale }; };
  wm.areaH = () => wm.deskH - TASKBAR_H;

  // ---------- 应用登记 ----------
  wm.registerApp = function (def) { wm.apps[def.id] = def; if (!def.hidden) wm.order.push(def.id); };
  wm.launch = function (id, args) {
    const def = wm.apps[id];
    if (!def) { OS.notify('无法启动', '没有应用 ' + id); return null; }
    wm.closeFlyouts();
    try { return def.open(args || {}); } catch (e) { console.error(e); OS.notify('应用出错', def.name + '：' + e.message); return null; }
  };
  wm.openFile = function (path) {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
    if (ext === 'sheet') return wm.launch('spreadsheet', { file: path });
    if (ext === 'snap') return wm.launch('systems', { file: path });
    return wm.launch('editor', { file: path });
  };

  // ---------- 窗口 ----------
  wm.create = function (o) {
    const id = 'w' + (++wm.seq), gid = 'outer-' + id;
    const def = wm.apps[o.app] || {};
    const el = h('div', { class: 'rw', 'data-testid': 'app-window', 'data-system-id': 'outer', 'data-window-id': gid, 'data-app-id': o.app, 'aria-label': o.title, role: 'dialog' });
    const name = h('span', { class: 'rw-name', text: o.title });
    const ic = h('span', { class: 'rw-icon', html: svgIcon(o.icon || def.icon || 'window') });
    const src = h('span', { class: 'rw-src' });
    const bMin = h('button', { 'data-testid': 'window-minimize', title: '最小化', 'aria-label': '最小化', html: svgIcon('minimize') });
    const bMax = h('button', { 'data-testid': 'window-maximize', title: '最大化', 'aria-label': '最大化', html: svgIcon('maximize') });
    const bClose = h('button', { class: 'close', 'data-testid': 'window-close', title: '关闭', 'aria-label': '关闭', html: svgIcon('close') });
    const title = h('div', { class: 'rw-title', 'data-testid': 'window-titlebar', 'aria-label': o.title }, ic, name, src, h('div', { class: 'rw-btns' }, bMin, bMax, bClose));
    const body = h('div', { class: 'rw-body' });
    el.append(title, body);
    for (const d of ['n', 's', 'w', 'e', 'nw', 'ne', 'sw']) el.appendChild(h('div', { class: 'rw-edge ' + d, 'data-edge': d }));
    el.appendChild(h('div', { class: 'rw-edge se', 'data-edge': 'se', 'data-testid': 'window-resize', 'aria-label': '调整大小' }));
    const W = Math.min(o.w || 720, wm.deskW - 16), H = Math.min(o.h || 480, wm.areaH() - 10);
    const n = wm.wins.length;
    const w = {
      id, gid, app: o.app, title: o.title, el, body, nameEl: name, srcEl: src, state: 'normal', snap: null, kind: o.kind || 'app',
      x: o.x != null ? o.x : Math.max(8, Math.min(wm.deskW - W - 8, 60 + (wm.seq * 34) % Math.max(60, wm.deskW - W - 120))),
      y: o.y != null ? o.y : Math.max(6, Math.min(wm.areaH() - H - 6, 30 + (wm.seq * 26) % Math.max(40, wm.areaH() - H - 60))),
      w: W, h: H, minW: o.minW || 260, minH: o.minH || 160, onClose: o.onClose || null, onResize: o.onResize || null, onFocus: o.onFocus || null, onKey: o.onKey || null,
      icon: o.icon || def.icon || 'window', sys: o.sys || null, proc: o.proc || null, meta: o.meta || {}
    };
    w.restore = { x: w.x, y: w.y, w: w.w, h: w.h };
    w.setTitle = (t) => { w.title = t; name.textContent = t; el.setAttribute('aria-label', t); title.setAttribute('aria-label', t); wm.renderTaskbar(); };
    w.close = (force) => wm.close(w, force);
    w.focus = () => wm.focus(w);
    bMin.addEventListener('click', () => wm.minimize(w));
    bMax.addEventListener('click', () => wm.toggleMax(w));
    bClose.addEventListener('click', () => wm.close(w));
    w.btnMax = bMax; w.btns = title.lastChild; w.titleEl = title;
    $('#wins').appendChild(el);
    wm.wins.push(w);
    wm.applyRect(w, w.x, w.y, w.w, w.h, true);
    // 给窗口里的控件补上归属标注
    const tagAll = (rootEl) => { const list = rootEl.querySelectorAll ? rootEl.querySelectorAll('[data-testid]:not(.p)') : []; for (const c of list) wm.tagCtl(c, gid); if (rootEl.matches && rootEl.matches('[data-testid]:not(.p)')) wm.tagCtl(rootEl, gid); };
    w.observer = new MutationObserver((muts) => { for (const m of muts) for (const nd of m.addedNodes) if (nd.nodeType === 1 && !nd.closest('.surf')) tagAll(nd); });
    w.observer.observe(body, { childList: true, subtree: true });
    tagAll(title); tagAll(el.lastChild);
    wm.focus(w);
    wm.renderTaskbar();
    return w;
  };
  wm.tagCtl = (c, gid) => { if (!c.hasAttribute('data-system-id')) c.setAttribute('data-system-id', 'outer'); if (!c.hasAttribute('data-window-id')) c.setAttribute('data-window-id', gid); };
  wm.applyRect = function (w, x, y, ww, hh, silent) {
    const changed = w.w !== ww || w.h !== hh;
    w.x = x; w.y = y; w.w = ww; w.h = hh;
    const s = w.el.style; s.left = x + 'px'; s.top = y + 'px'; s.width = ww + 'px'; s.height = hh + 'px';
    if ((changed || silent) && w.onResize) w.onResize(w);
  };
  wm.clampWin = function (w) {
    let { x, y, w: ww, h: hh } = w;
    ww = Math.min(ww, wm.deskW); hh = Math.min(hh, wm.areaH());
    x = Math.max(60 - ww, Math.min(wm.deskW - 60, x)); y = Math.max(0, Math.min(wm.areaH() - 32, y));
    wm.applyRect(w, x, y, ww, hh);
  };
  wm.focus = function (w) {
    if (w && w.state === 'min') { w.state = w.prevState || 'normal'; w.el.classList.remove('min'); w.el.dataset.state = w.state === 'max' ? 'maximized' : 'normal'; if (w.onResize) w.onResize(w); }
    if (wm.focused === w) { if (w) w.el.style.zIndex = ++wm.z; return; }
    const old = wm.focused;
    wm.focused = w || null;
    if (old) { old.el.classList.remove('focus'); old.el.dataset.focused = 'false'; if (old.onFocus) old.onFocus(false); }
    if (w) { w.el.style.zIndex = ++wm.z; w.el.classList.add('focus'); w.el.dataset.focused = 'true'; if (w.onFocus) w.onFocus(true); }
    if (!w || (w.kind !== 'system' && w.kind !== 'projection')) { const a = document.activeElement; if (a && a.classList && a.classList.contains('p-input')) a.blur(); }
    wm.renderTaskbar();
  };
  wm.topWin = () => { let t = null; for (const w of wm.wins) if (w.state !== 'min' && (!t || +w.el.style.zIndex > +t.el.style.zIndex)) t = w; return t; };
  wm.minimize = function (w) {
    if (w.state === 'min') return;
    w.prevState = w.state; w.state = 'min'; w.el.classList.add('min'); w.el.dataset.state = 'minimized';
    if (wm.focused === w) wm.focus(wm.topWin());
    wm.renderTaskbar();
  };
  wm.toggleMax = function (w) {
    if (w.state === 'max') { w.state = 'normal'; w.el.classList.remove('max'); w.snap = null; wm.applyRect(w, w.restore.x, w.restore.y, w.restore.w, w.restore.h); }
    else { if (!w.snap) w.restore = { x: w.x, y: w.y, w: w.w, h: w.h }; w.snap = null; w.state = 'max'; w.el.classList.add('max'); wm.applyRect(w, 0, 0, wm.deskW, wm.areaH()); }
    w.el.dataset.state = w.state === 'max' ? 'maximized' : 'normal';
    w.btnMax.innerHTML = svgIcon(w.state === 'max' ? 'restore' : 'maximize'); w.btnMax.title = w.state === 'max' ? '还原' : '最大化'; w.btnMax.setAttribute('aria-label', w.btnMax.title);
    wm.focus(w);
  };
  wm.snapTo = function (w, side) {
    if (!w.snap && w.state !== 'max') w.restore = { x: w.x, y: w.y, w: w.w, h: w.h };
    w.state = 'normal'; w.el.classList.remove('max'); w.snap = side; w.el.dataset.state = 'normal';
    const half = Math.floor(wm.deskW / 2);
    if (side === 'left') wm.applyRect(w, 0, 0, half, wm.areaH()); else wm.applyRect(w, half, 0, wm.deskW - half, wm.areaH());
  };
  wm.close = async function (w, force) {
    if (w.closing) return;
    if (!force && w.onClose) { w.closing = true; let ok; try { ok = await w.onClose(w); } finally { w.closing = false; } if (ok === false) return; }
    wm.destroy(w);
  };
  wm.destroy = function (w) {
    const i = wm.wins.indexOf(w); if (i < 0) return;
    wm.wins.splice(i, 1);
    w.observer.disconnect();
    if (w.onDestroy) { try { w.onDestroy(w); } catch (e) { console.error(e); } }
    w.el.remove(); w.dead = true;
    if (wm.capture && wm.capture.win === w) wm.capture = null;
    if (wm.focused === w) { wm.focused = null; wm.focus(wm.topWin()); }
    wm.renderTaskbar();
  };
  wm.byId = (id) => wm.wins.find(w => w.id === id || w.gid === id);

  // 标题栏拖动、边缘缩放、双击最大化、半屏贴靠
  function winFromEvent(e) { const el = e.target.closest && e.target.closest('.rw'); return el ? wm.wins.find(w => w.el === el) : null; }
  let hint = null;
  function showHint(side) {
    if (!side) { if (hint) { hint.remove(); hint = null; } return; }
    if (!hint) { hint = h('div', { class: 'snap-hint' }); $('#desk').appendChild(hint); }
    const half = Math.floor(wm.deskW / 2), s = hint.style;
    s.top = '6px'; s.height = (wm.areaH() - 12) + 'px';
    if (side === 'left') { s.left = '6px'; s.width = (half - 12) + 'px'; } else if (side === 'right') { s.left = (half + 6) + 'px'; s.width = (wm.deskW - half - 12) + 'px'; } else { s.left = '6px'; s.width = (wm.deskW - 12) + 'px'; }
  }
  // 指针事件本身不带连击次数，这里按时间与位置自己数
  const clicks = { t: 0, x: 0, y: 0, n: 0, b: -1 };
  function clickCount(e) {
    const now = performance.now();
    if (e.button === clicks.b && now - clicks.t < 450 && Math.abs(e.clientX - clicks.x) < 6 && Math.abs(e.clientY - clicks.y) < 6) clicks.n++; else clicks.n = 1;
    clicks.t = now; clicks.x = e.clientX; clicks.y = e.clientY; clicks.b = e.button;
    return clicks.n;
  }
  function onPointerDown(e) {
    e._n = clickCount(e);
    const w = winFromEvent(e);
    if (!e.target.closest('.menu')) wm.closeMenu();
    if (!e.target.closest('.flyout') && !e.target.closest('#taskbar')) wm.closeFlyouts();
    if (!w) { if (!e.target.closest('#taskbar') && !e.target.closest('.flyout') && !e.target.closest('#scrim') && !e.target.closest('.menu')) { if (e.target.closest('#icons') || e.target.id === 'wall') wm.focus(null); } return; }
    if (wm.focused !== w) wm.focus(w); else w.el.style.zIndex = ++wm.z;
    if (e.button !== 0) return;
    const edge = e.target.closest('.rw-edge');
    const p = wm.toDesk(e);
    if (edge && w.state !== 'max') {
      wm.drag = { mode: 'resize', w, ed: edge.dataset.edge, sx: p.x, sy: p.y, x0: w.x, y0: w.y, w0: w.w, h0: w.h };
      e.preventDefault(); return;
    }
    if (e.target.closest('.rw-title') && !e.target.closest('button')) {
      if (e._n >= 2) { wm.toggleMax(w); wm.drag = null; e.preventDefault(); return; }
      wm.drag = { mode: 'move', w, ox: p.x - w.x, oy: p.y - w.y, sx: p.x, sy: p.y, moved: false };
      e.preventDefault();
    }
  }
  function onPointerMove(e) {
    const d = wm.drag; if (!d) return;
    const p = wm.toDesk(e), w = d.w;
    if (d.mode === 'move') {
      if (!d.moved && Math.abs(p.x - d.sx) + Math.abs(p.y - d.sy) < 4) return;
      if (!d.moved && (w.state === 'max' || w.snap)) {
        const fx = (p.x - w.x) / w.w;
        w.state = 'normal'; w.snap = null; w.el.classList.remove('max'); w.el.dataset.state = 'normal'; w.btnMax.innerHTML = svgIcon('maximize');
        wm.applyRect(w, Math.round(p.x - w.restore.w * fx), Math.max(0, p.y - 14), w.restore.w, w.restore.h);
        d.ox = p.x - w.x; d.oy = p.y - w.y;
      }
      d.moved = true;
      const nx = Math.max(60 - w.w, Math.min(wm.deskW - 60, p.x - d.ox)), ny = Math.max(0, Math.min(wm.areaH() - 32, p.y - d.oy));
      wm.applyRect(w, Math.round(nx), Math.round(ny), w.w, w.h);
      d.side = p.x <= 8 ? 'left' : p.x >= wm.deskW - 9 ? 'right' : p.y <= 4 ? 'max' : null;
      showHint(d.side);
    } else {
      const dx = p.x - d.sx, dy = p.y - d.sy, ed = d.ed;
      let x = d.x0, y = d.y0, ww = d.w0, hh = d.h0;
      if (ed.includes('e')) ww = d.w0 + dx;
      if (ed.includes('s')) hh = d.h0 + dy;
      if (ed.includes('w')) { ww = Math.max(w.minW, d.w0 - dx); x = d.x0 + d.w0 - ww; }
      if (ed.includes('n')) { hh = Math.max(w.minH, d.h0 - dy); y = d.y0 + d.h0 - hh; if (y < 0) { hh += y; y = 0; } }
      ww = Math.max(w.minW, ww); hh = Math.max(w.minH, Math.min(hh, wm.areaH() - y));
      w.snap = null;
      wm.applyRect(w, Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
    }
  }
  function onPointerUp() {
    const d = wm.drag; if (!d) return;
    wm.drag = null; showHint(null);
    if (d.mode === 'move' && d.moved) {
      if (d.side === 'left' || d.side === 'right') wm.snapTo(d.w, d.side);
      else if (d.side === 'max') wm.toggleMax(d.w);
      else d.w.restore = { x: d.w.x, y: d.w.y, w: d.w.w, h: d.w.h };
    }
  }

  // ---------- 原始输入送进子系统 ----------
  const mods = (e) => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
  function surfInfo(target) {
    const el = target.closest && target.closest('.sys-surface, .proj-surface');
    if (!el) return null;
    const w = wm.wins.find(x => x.el.contains(el));
    return w ? { el, win: w } : null;
  }
  function localPt(el, e) { const r = el.getBoundingClientRect(); const sx = r.width / (el.offsetWidth || 1) || 1; return { x: Math.round((e.clientX - r.left) / sx), y: Math.round((e.clientY - r.top) / sx) }; }
  function sendPtr(info, ev) {
    const w = info.win;
    if (w.kind === 'system') OS.kernel.childInput(w.sys, ev);
    else if (w.kind === 'projection') { if (!w.meta.frozen) OS.kernel.route({ to: w.meta.src.sys, from: 'outer', pid: w.meta.src.pid, k: 'proj_input', win: w.meta.src.win, e: ev }); }
  }
  function rawDown(e) {
    const info = surfInfo(e.target); if (!info) return;
    const p = localPt(info.el, e);
    wm.capture = { el: info.el, win: info.win };
    wm.lastRawDown = performance.now();
    sendPtr(info, { t: 'ptr', k: 'down', x: p.x, y: p.y, b: e.button, n: e._n || 1, mod: mods(e), dy: 0, bs: e.buttons });
    const tag = e.target.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); const a = document.activeElement; if (a && a.classList && a.classList.contains('p-input')) a.blur(); }
  }
  function rawMove(e) {
    if (wm.dndActive) { OS.dnd.move(e); }
    if (wm.capture) { const p = localPt(wm.capture.el, e); sendPtr(wm.capture, { t: 'ptr', k: 'move', x: p.x, y: p.y, b: 0, n: 0, mod: mods(e), dy: 0, bs: e.buttons }); return; }
    if (wm.drag) return;
    const info = surfInfo(e.target);
    if (info) { const p = localPt(info.el, e); sendPtr(info, { t: 'ptr', k: 'move', x: p.x, y: p.y, b: 0, n: 0, mod: mods(e), dy: 0, bs: e.buttons }); wm.hoverSys = info; }
    else if (wm.hoverSys) { const hsys = wm.hoverSys; wm.hoverSys = null; if (!hsys.win.dead) sendPtr(hsys, { t: 'ptr', k: 'leave', x: -1, y: -1, b: 0, n: 0, mod: 0, dy: 0, bs: 0 }); }
  }
  function rawUp(e) {
    if (wm.capture) { const c = wm.capture; wm.capture = null; const p = localPt(c.el, e); if (!c.win.dead) sendPtr(c, { t: 'ptr', k: 'up', x: p.x, y: p.y, b: e.button, n: clicks.n || 1, mod: mods(e), dy: 0, bs: e.buttons }); }
    if (wm.dndActive) OS.dnd.drop(e);
  }
  function rawWheel(e) {
    const info = surfInfo(e.target); if (!info) return;
    if (e.target.tagName === 'TEXTAREA') return;
    const p = localPt(info.el, e);
    sendPtr(info, { t: 'ptr', k: 'wheel', x: p.x, y: p.y, b: 0, n: 0, mod: mods(e), dy: e.deltaY, bs: 0 });
    e.preventDefault();
  }
  // 键盘类事件只交给当前获得焦点的窗口
  wm.routeKeyLike = function (ev) {
    const w = wm.focused; if (!w) return false;
    if (w.kind === 'system') { OS.kernel.childInput(w.sys, ev); return true; }
    if (w.kind === 'projection') { if (!w.meta.frozen) OS.kernel.route({ to: w.meta.src.sys, from: 'outer', pid: w.meta.src.pid, k: 'proj_input', win: w.meta.src.win, e: ev }); return true; }
    return false;
  };
  const NATIVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Backspace', 'Delete', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Process', 'Unidentified']);
  function onKeyDown(e) {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i'))) return;
    if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) { e.preventDefault(); return; }
    if (wm.dialogs.length) { return; }
    if (e.key === 'Escape') { if (wm.dndActive) { OS.dnd.cancel(); e.preventDefault(); return; } if (wm.menu || wm.flyoutOpen()) { wm.closeMenu(); wm.closeFlyouts(); e.preventDefault(); return; } }
    const w = wm.focused;
    if (!w) return;
    if (w.kind === 'system' || w.kind === 'projection') {
      const t = e.target, isField = t && t.classList && t.classList.contains('p-input');
      if (e.isComposing || e.keyCode === 229) return;
      if (isField) {
        const multi = t.tagName === 'TEXTAREA';
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;       // 复制粘贴走设备的文本事件
        if (!ctrl && !e.altKey && (e.key.length === 1 || NATIVE_KEYS.has(e.key) || (multi && e.key === 'Enter'))) return;
        if (multi && e.key === 'Tab') { e.preventDefault(); wm.routeKeyLike({ t: 'text', text: '  ', s: t.selectionStart, e: t.selectionEnd }); return; }
      }
      e.preventDefault();
      wm.routeKeyLike({ t: 'key', key: e.key, code: e.code, mod: mods(e) });
      return;
    }
    if (w.onKey) w.onKey(e);
  }

  // ---------- 任务栏 / 开始菜单 ----------
  wm.renderTaskbar = function () {
    const box = $('#tb-wins'); if (!box) return;
    const want = wm.wins.slice().sort((a, b) => parseInt(a.id.slice(1), 10) - parseInt(b.id.slice(1), 10));
    const have = new Map([...box.children].map(c => [c.dataset.windowId, c]));
    for (const w of want) {
      let b = have.get(w.gid);
      if (!b) {
        b = h('button', { class: 'tb-btn tb-win', 'data-testid': 'taskbar-item', 'data-system-id': 'outer', 'data-window-id': w.gid, 'data-app-id': w.app }, h('span', { class: 'ic', html: svgIcon(w.icon) }), h('span', { class: 'tx' }));
        b.addEventListener('click', () => { if (wm.focused === w && w.state !== 'min') wm.minimize(w); else wm.focus(w); });
        b.firstChild.style.cssText = 'width:17px;height:17px;flex:none;display:block';
        box.appendChild(b);
      }
      have.delete(w.gid);
      b.lastChild.textContent = w.title; b.title = w.title; b.setAttribute('aria-label', w.title);
      b.classList.toggle('on', wm.focused === w); b.classList.toggle('min', w.state === 'min');
      if (box.children[want.indexOf(w)] !== b) box.insertBefore(b, box.children[want.indexOf(w)] || null);
    }
    for (const b of have.values()) b.remove();
  };
  wm.flyoutOpen = () => !$('#start-menu').hidden || (OS.widgets && OS.widgets.isOpen()) || wm.noteOpen;
  wm.closeFlyouts = function (except) {
    if (except !== 'start') { $('#start-menu').hidden = true; $('#start-btn').classList.remove('on'); }
    if (except !== 'notes' && OS.notifyCenter) OS.notifyCenter.close();
    if (except !== 'widgets' && OS.widgets && !OS.widgets.pinned) OS.widgets.close();
  };
  wm.toggleStart = function (on) {
    const m = $('#start-menu');
    const open = on != null ? on : m.hidden;
    wm.closeFlyouts('start'); wm.closeMenu();
    m.hidden = !open; $('#start-btn').classList.toggle('on', open);
    if (open) { const s = $('#start-search'); s.value = ''; wm.renderStart(''); setTimeout(() => s.focus(), 0); }
  };
  wm.renderStart = function (q) {
    const list = $('#start-list'); list.textContent = '';
    q = (q || '').trim().toLowerCase();
    for (const id of wm.order) {
      const a = wm.apps[id];
      if (q && !(a.name.toLowerCase().includes(q) || id.includes(q) || (a.keywords || '').includes(q))) continue;
      const b = h('button', { class: 'start-item', 'data-testid': a.launchId || ('launch-' + id), 'data-system-id': 'outer', 'data-app-id': id, 'aria-label': a.name, onclick: () => { wm.toggleStart(false); wm.launch(id); } }, h('span', { html: svgIcon(a.icon) }), h('span', { text: a.name }));
      list.appendChild(b);
    }
    if (!list.children.length) list.appendChild(h('div', { class: 'muted', style: { gridColumn: '1 / -1', padding: '18px', textAlign: 'center' }, text: '没有匹配的应用' }));
  };

  // ---------- 桌面图标 ----------
  wm.desktopIcons = function () {
    const out = wm.order.filter(id => !wm.apps[id].noIcon).map(id => ({ app: id, name: wm.apps[id].name, icon: wm.apps[id].icon }));
    out.push({ file: '/Demo/sample.sheet', name: '示例工作簿', icon: 'sheet' });
    out.push({ file: '/Demo/helicopter-24.scene', name: '直升机 24 号场景', icon: 'scene' });
    out.push({ file: '/Documents/操作说明.md', name: '操作说明', icon: 'help', help: true });
    return out;
  };
  wm.layoutIcons = function () {
    const box = $('#icons'); if (!box) return;
    const items = wm.desktopIcons();
    const rows = Math.max(1, Math.floor((wm.areaH() - 16) / 92));
    box.textContent = '';
    items.forEach((it, i) => {
      const b = h('button', { class: 'dicon', 'data-testid': 'desktop-icon', 'data-system-id': 'outer', 'aria-label': it.name, style: { left: (12 + Math.floor(i / rows) * 96) + 'px', top: (12 + (i % rows) * 92) + 'px' } }, icon(it.icon), h('span', { class: 'tx', text: it.name }));
      if (it.app) b.dataset.appId = it.app; else b.dataset.filePath = it.file;
      b.addEventListener('click', (e) => { for (const o of box.children) o.classList.remove('sel'); b.classList.add('sel'); e.stopPropagation(); });
      b.addEventListener('dblclick', () => { if (it.app) wm.launch(it.app); else if (it.help) wm.launch('help'); else wm.openFile(it.file); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); for (const o of box.children) o.classList.remove('sel'); b.classList.add('sel'); wm.showMenu(e, [{ text: '打开', icon: 'open', act: () => b.dispatchEvent(new MouseEvent('dblclick')) }]); });
      box.appendChild(b);
    });
  };

  // ---------- 菜单 / 对话框 / 通知 ----------
  wm.showMenu = function (e, items, opts) {
    wm.closeMenu();
    const m = h('div', { class: 'menu', 'data-testid': (opts && opts.testid) || 'context-menu', 'data-system-id': 'outer', role: 'menu' });
    for (const it of items) {
      if (it === '-') { m.appendChild(h('hr')); continue; }
      const b = h('button', { role: 'menuitem', disabled: it.disabled, 'data-testid': it.testid || 'menu-item', 'data-system-id': 'outer' }, h('span', { html: svgIcon(it.icon || 'dot'), style: { display: 'flex', opacity: it.icon ? 1 : 0 } }), it.text);
      if (it.data) for (const k in it.data) b.setAttribute('data-' + k, it.data[k]);
      b.addEventListener('click', () => { wm.closeMenu(); it.act && it.act(); });
      m.appendChild(b);
    }
    $('#desk').appendChild(m);
    const p = e.clientX != null ? wm.toDesk(e) : e;
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(2, Math.min(wm.deskW - mw - 4, p.x)) + 'px'; m.style.top = Math.max(2, Math.min(wm.deskH - mh - 4, p.y)) + 'px';
    wm.menu = m;
  };
  wm.closeMenu = function () { if (wm.menu) { wm.menu.remove(); wm.menu = null; } };
  // 对话框：返回 Promise。buttons: [{text, value, primary, danger}]
  wm.dialog = function (o) {
    return new Promise((resolve) => {
      const scrim = $('#scrim'); scrim.hidden = false;
      const d = h('div', { class: 'dialog', 'data-testid': 'dialog', 'data-system-id': 'outer', role: 'alertdialog', 'aria-label': o.title });
      d.appendChild(h('h3', { text: o.title }));
      if (o.text) d.appendChild(h('p', { 'data-testid': 'dialog-text', text: o.text }));
      let input = null;
      if (o.prompt != null) { input = h('input', { class: 'field', 'data-testid': 'dialog-input', 'data-system-id': 'outer', value: o.prompt, 'aria-label': o.title }); input.value = o.prompt; d.appendChild(input); }
      const row = h('div', { class: 'row' });
      const btns = o.buttons || [{ text: '确定', value: true, primary: true }, { text: '取消', value: false }];
      const done = (v) => { const i = wm.dialogs.indexOf(d); if (i >= 0) wm.dialogs.splice(i, 1); d.remove(); if (!wm.dialogs.length) scrim.hidden = true; resolve(input && v === true ? input.value : v); };
      btns.forEach((b, i) => {
        const ids = ['dialog-ok', 'dialog-cancel', 'dialog-alt'];
        const el = h('button', { class: 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''), 'data-testid': b.testid || (b.value === false || b.value === null ? 'dialog-cancel' : (i === 0 ? 'dialog-ok' : ids[Math.min(2, i)])), 'data-system-id': 'outer', text: b.text, onclick: () => done(b.value) });
        row.appendChild(el);
      });
      d.appendChild(row);
      d.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); done(btns[0].value); } else if (e.key === 'Escape') { e.preventDefault(); done(btns[btns.length - 1].value === true ? false : btns[btns.length - 1].value); } e.stopPropagation(); });
      scrim.appendChild(d); wm.dialogs.push(d);
      setTimeout(() => { if (input) { input.focus(); input.select(); } else row.firstChild.focus(); }, 0);
    });
  };
  wm.confirm = (title, text, okText, danger) => wm.dialog({ title, text, buttons: [{ text: okText || '确定', value: true, primary: !danger, danger }, { text: '取消', value: false }] });
  wm.prompt = (title, text, value) => wm.dialog({ title, text, prompt: value || '', buttons: [{ text: '确定', value: true, primary: true }, { text: '取消', value: null }] });
  wm.alert = (title, text) => wm.dialog({ title, text, buttons: [{ text: '知道了', value: true, primary: true }] });

  wm.init = function () {
    const desk = $('#desk');
    desk.addEventListener('pointerdown', (e) => { onPointerDown(e); rawDown(e); }, true);
    window.addEventListener('pointermove', (e) => { onPointerMove(e); rawMove(e); }, true);
    window.addEventListener('pointerup', (e) => { onPointerUp(e); rawUp(e); }, true);
    window.addEventListener('pointercancel', (e) => { onPointerUp(e); rawUp(e); }, true);
    window.addEventListener('blur', () => { if (wm.drag) onPointerUp(); });
    desk.addEventListener('wheel', rawWheel, { passive: false, capture: true });
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('contextmenu', (e) => { if (!(e.target.closest && e.target.closest('.allow-ctx'))) e.preventDefault(); });
    // 自动化工具直接派发的 click（没有真实指针事件）：补成一次按下/抬起，交给所属系统处理
    desk.addEventListener('click', (e) => {
      if (e.isTrusted || !e.target.closest) return;
      const info = surfInfo(e.target); if (!info) return;
      const r = e.target.getBoundingClientRect(), sr = info.el.getBoundingClientRect(), sx = sr.width / (info.el.offsetWidth || 1) || 1;
      const x = Math.round((r.left + r.width / 2 - sr.left) / sx), y = Math.round((r.top + r.height / 2 - sr.top) / sx);
      if (wm.focused !== info.win) wm.focus(info.win);
      sendPtr(info, { t: 'ptr', k: 'down', x, y, b: 0, n: 1, mod: 0, dy: 0, bs: 1 });
      sendPtr(info, { t: 'ptr', k: 'up', x, y, b: 0, n: 1, mod: 0, dy: 0, bs: 0 });
    }, true);
    $('#wall').addEventListener('contextmenu', (e) => wm.desktopMenu(e));
    $('#icons').addEventListener('contextmenu', (e) => { if (e.target.id === 'icons') wm.desktopMenu(e); });
    $('#icons').addEventListener('click', (e) => { if (e.target.id === 'icons') for (const o of $('#icons').children) o.classList.remove('sel'); });
    $('#start-btn').addEventListener('click', () => wm.toggleStart());
    $('#start-search').addEventListener('input', (e) => wm.renderStart(e.target.value));
    $('#start-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = $('#start-list button'); if (f) f.click(); } e.stopPropagation(); if (e.key === 'Escape') wm.toggleStart(false); });
    window.addEventListener('resize', () => wm.layout());
    wm.layout();
  };
  wm.desktopMenu = function (e) {
    e.preventDefault();
    wm.showMenu(e, [
      { text: '打开文件管理器', icon: 'folder', act: () => wm.launch('files') },
      { text: '新建子系统', icon: 'plus', act: () => OS.systems.create() },
      { text: '小组件面板', icon: 'widgets', act: () => OS.widgets && OS.widgets.toggle(true) },
      '-',
      { text: '任务管理器', icon: 'tasks', act: () => wm.launch('tasks') },
      { text: '设置', icon: 'settings', act: () => wm.launch('settings') },
      { text: '操作说明', icon: 'help', act: () => wm.launch('help') }
    ]);
  };
})();
