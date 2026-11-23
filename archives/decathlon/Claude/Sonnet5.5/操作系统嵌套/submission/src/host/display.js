// 显示设备：接收程序提交的二维指令树，渲染为 DOM；嵌套系统的画面按 embed 递归；三维视图交给 render3d。
// 设备不推进任何状态：相同的提交得到相同的画面，两次提交之间画面不变。
import { ICONS } from './icons.js';

const FAM = {
  ui: '"Microsoft YaHei UI","Segoe UI","PingFang SC",sans-serif',
  mono: '"Cascadia Mono","Consolas","Microsoft YaHei UI",monospace',
  title: '"Microsoft YaHei UI","Segoe UI Semibold","Segoe UI",sans-serif',
  num: '"Segoe UI","Microsoft YaHei UI",sans-serif',
};
const SHADOW = {
  s1: '0 1px 2px rgba(0,0,0,.35)', s2: '0 4px 14px rgba(0,0,0,.4)', s3: '0 10px 32px rgba(0,0,0,.5)', s4: '0 18px 54px rgba(0,0,0,.6)',
  glow: '0 0 18px rgba(255,200,61,.45)',
};

function px(n) { return (typeof n === 'number' ? Math.round(n * 100) / 100 : 0) + 'px'; }

export class Display {
  constructor(machine) {
    this.machine = machine; this.surfaces = new Map(); this.roots = new Set(); this.dirty = new Set();
    this.natives = new Map(); this.nativeFactory = null; this.render3d = null; this.inputEls = new Map();
    this.mount0 = null; this.onInput = null; this.scale = 1; this.hint = null;
    this.timer = setInterval(() => this.flush(), 16);
  }
  reset() {
    this.surfaces.clear(); this.dirty.clear();
    for (const r of [...this.roots]) r.destroy();
    for (const [, n] of this.natives) { try { n.destroy && n.destroy(); } catch (e) { } }
    this.natives.clear(); this.inputEls.clear();
    if (this.render3d) this.render3d.reset();
  }
  key(cid, v) { return cid + ':' + v; }
  submit(cid, v, cmds, sysId) {
    const k = this.key(cid, v);
    let s = this.surfaces.get(k);
    if (!s) { s = { cid, v, cmds: null, sys: sysId, rev: 0, views: new Set() }; this.surfaces.set(k, s); }
    s.cmds = cmds; s.sys = sysId; s.rev++; this.dirty.add(k);
  }
  free(cid, v) { const k = this.key(cid, v); const s = this.surfaces.get(k); if (s) { s.cmds = []; this.dirty.add(k); this.surfaces.delete(k); } }
  dropCtx(cid) {
    for (const [k, s] of [...this.surfaces]) if (s.cid === cid) { s.cmds = []; this.dirty.add(k); this.surfaces.delete(k); }
    if (this.render3d) this.render3d.dropCtx(cid);
    for (const k of [...this.inputEls.keys()]) if (k.startsWith(cid + ':')) this.inputEls.delete(k);
  }
  flush() {
    if (!this.dirty.size) return;
    const d = [...this.dirty]; this.dirty.clear();
    for (const k of d) {
      const views = [];
      for (const r of this.roots) r.collect(k, views);
      for (const v of views) v.render();
    }
  }
  // 根挂载：把一个表面作为整屏渲染到 el 里，并把原始输入交给 onInput
  mount(el, ref, onInput) {
    const root = new RootView(this, el, ref, onInput); this.roots.add(root); root.view.render(); return root;
  }
  // ---- 输入控件（宿主文本输入设备）----
  inputValue(cid, v, id) { const e = this.inputEls.get(cid + ':' + v + ':' + id); return e ? e.value : null; }
  inputSet(cid, v, id, text) { const e = this.inputEls.get(cid + ':' + v + ':' + id); if (e) { e.value = text; e.dispatchEvent(new Event('input', { bubbles: true })); } }
  // ---- 三维 ----
  sceneLoad(cid, sc, scene) { if (this.render3d) this.render3d.load(cid, sc, scene); }
  sceneState(cid, sc, st) { if (this.render3d) this.render3d.state(cid, sc, st); }
  sceneFree(cid, sc) { if (this.render3d) this.render3d.free(cid, sc); }
  scenePick(cid, sc, cam, x, y, w, h) { return this.render3d ? this.render3d.pick(cid, sc, cam, x, y, w, h) : null; }
  // ---- 快照：显示设备里保存的是程序提交的数据，不含宿主图形对象 ----
  snapshotCtxs(cidSet) {
    const surfaces = []; for (const [k, s] of this.surfaces) if (cidSet.has(s.cid)) surfaces.push([s.cid, s.v, s.cmds, s.sys]);
    return { surfaces, scenes: this.render3d ? this.render3d.snapshot(cidSet) : [] };
  }
  restoreCtxs(data, mapCid, remap) {
    if (!data) return;
    for (const [cid, v, cmds, sys] of data.surfaces) {
      const c2 = mapCid(cid); if (c2 === undefined) continue;
      const m = JSON.parse(JSON.stringify(cmds)); this.remapCmds(m, remap);
      this.submit(c2, v, m, this.machine.sysOfCtx(c2) ? this.machine.sysOfCtx(c2).id : sys);
    }
    if (this.render3d) this.render3d.restore(data.scenes, mapCid);
  }
  remapCmds(n, remap) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { for (const x of n) this.remapCmds(x, remap); return; }
    if (n.c && typeof n.c === 'object' && n.c.$h) remap(n.c);
    if (n.k) this.remapCmds(n.k, remap);
  }
  // ---- inspect：从提交的指令树里收集窗口与应用状态 ----
  collect() {
    const out = { windows: [], players: [], charts: [], projections: [], natives: [] };
    const walk = (nodes, s) => {
      if (!Array.isArray(nodes)) return;
      for (const n of nodes) {
        if (!n || typeof n !== 'object') continue;
        if (n.o === 'g' && n.wid && n.tid === 'app-window') {
          out.windows.push({ id: n.wid, systemId: s.sys, appId: n.app, title: n.title || '', state: n.ws || 'normal' });
          if (n.app === 'projection') out.projections.push({ windowId: n.wid, systemId: s.sys, sourceSystemId: n.ssys || '', sourceWindowId: n.swid || '', sourceAppId: n.sapp || '', state: n.ws || 'normal' });
        }
        if (n.o === 'meta') {
          if (n.kind === 'player') out.players.push({ windowId: n.wid, systemId: s.sys, state: n.state, position: n.position, duration: n.duration, rate: n.rate, scene: n.scene, frameTime: n.frameTime });
          else if (n.kind === 'chart') out.charts.push({ windowId: n.wid, systemId: s.sys, sourceTitle: n.sourceTitle, range: n.range, chartType: n.chartType, connectionState: n.connectionState });
        }
        if (n.k) walk(n.k, s);
      }
    };
    for (const s of this.surfaces.values()) walk(s.cmds, s);
    return out;
  }
}

class RootView {
  constructor(display, el, ref, onInput) {
    this.display = display; this.el = el; this.ref = ref; this.onInput = onInput;
    el.classList.add('surface-root'); el.tabIndex = 0;
    this.view = new SurfaceView(display, ref.c, ref.v || 0, el, this);
    this.down = 0; this.capture = null;
    this.handlers = {};
    const on = (t, f, o) => { el.addEventListener(t, f, o); this.handlers[t] = [f, o]; };
    const pos = (e) => { const r = el.getBoundingClientRect(); const s = r.width / (el.offsetWidth || r.width) || 1; return [(e.clientX - r.left) / s, (e.clientY - r.top) / s]; };
    const mods = (e) => ({ ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey });
    on('pointerdown', (e) => {
      const [x, y] = pos(e);
      const nat = e.target.closest && e.target.closest('.native-host');
      const ed = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      if (!ed && !nat) { el.focus({ preventScroll: true }); }
      if (!nat) { try { el.setPointerCapture(e.pointerId); } catch (_) { } }
      this.down++;
      this.send({ type: 'down', x, y, b: e.button, native: !!nat, ...mods(e) });
      if (!ed && !nat) e.preventDefault();
    });
    on('pointermove', (e) => {
      const [x, y] = pos(e);
      if (display.drag) { display.dragMove(e.clientX, e.clientY); this.send({ type: 'dragev', phase: 'move', x, y }, true); return; }
      if (!this.down) return;
      this.send({ type: 'move', x, y, bt: e.buttons, ...mods(e) }, true);
    });
    const up = (e) => {
      if (!this.down) return; this.down = Math.max(0, this.down - 1);
      const [x, y] = pos(e);
      if (display.drag) { this.send({ type: 'dragev', phase: 'drop', x, y }); display.dragDropped(); }
      this.send({ type: 'up', x, y, b: e.button, ...mods(e) });
      try { el.releasePointerCapture(e.pointerId); } catch (_) { }
    };
    on('pointerup', up); on('pointercancel', up);
    on('dblclick', (e) => { const [x, y] = pos(e); this.send({ type: 'dbl', x, y, b: e.button, ...mods(e) }); });
    on('contextmenu', (e) => e.preventDefault());
    on('wheel', (e) => {
      if (e.target.closest && e.target.closest('.native-host')) return;
      const [x, y] = pos(e); this.send({ type: 'wheel', x, y, dx: e.deltaX, dy: e.deltaY, ...mods(e) }); e.preventDefault();
    }, { passive: false });
    on('keydown', (e) => {
      if (e.target.closest && e.target.closest('.native-host')) return;
      const ed = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      if (e.key === 'Tab' && !ed) e.preventDefault();
      const isInput = e.target.tagName === 'INPUT';
      const pass = ed ? ((isInput && ['Enter', 'Escape', 'ArrowUp', 'ArrowDown'].includes(e.key)) || e.key === 'Escape' || (e.ctrlKey && e.key.length === 1) || e.key === 'F5') : true;
      if (!pass) return;
      this.send({ type: 'key', key: e.key, code: e.code, rep: e.repeat, ed, id: ed ? e.target.dataset.inputId : undefined, ...mods(e) });
      if (!ed && (e.key.length > 1 || e.ctrlKey)) { if (!['F5', 'F12'].includes(e.key) && !(e.ctrlKey && e.shiftKey)) e.preventDefault(); }
    });
    on('input', (e) => {
      const t = e.target; if (!t || !t.dataset || t.dataset.inputId === undefined) return;
      const big = t.value.length > 4000;
      this.send({ type: 'text', id: t.dataset.inputId, v: big ? null : t.value, len: t.value.length, big, ...caretInfo(t) });
    });
    on('focusin', (e) => { const t = e.target; if (t && t.dataset && t.dataset.inputId !== undefined) this.send({ type: 'infocus', id: t.dataset.inputId }); });
  }
  send(ev, coalesce) { if (this.onInput) this.onInput(ev, coalesce); }
  collect(key, out) { this.view.collect(key, out); }
  destroy() {
    for (const t in this.handlers) this.el.removeEventListener(t, this.handlers[t][0], this.handlers[t][1]);
    this.view.destroy(); this.display.roots.delete(this);
  }
}

function caretInfo(t) {
  try {
    const pos = t.selectionStart || 0; const before = t.value.slice(0, pos);
    const line = (before.match(/\n/g) || []).length + 1; const col = pos - (before.lastIndexOf('\n') + 1) + 1;
    return { caret: pos, line, col };
  } catch (e) { return {}; }
}

// 把一个表面渲染进容器；embed 节点递归创建子视图
class SurfaceView {
  constructor(display, cidRef, v, parentEl, owner, inherit) {
    this.inherit = inherit || null; this.display = display; this.cid = cidRef && cidRef.id !== undefined ? cidRef.id : cidRef; this.v = v; this.owner = owner;
    this.el = document.createElement('div'); this.el.className = 'surface'; parentEl.appendChild(this.el);
    this.state = new Map(); this.sys = ''; this.ctx = { sys: '', win: '' };
  }
  surface() { return this.display.surfaces.get(this.cid + ':' + this.v); }
  collect(key, out) {
    if (this.cid + ':' + this.v === key) out.push(this);
    for (const ent of this.state.values()) this.collectEnt(ent, key, out);
  }
  collectEnt(ent, key, out) {
    if (ent.view) ent.view.collect(key, out);
    if (ent.sub) for (const e of ent.sub.values()) this.collectEnt(e, key, out);
  }
  render() {
    const s = this.surface();
    if (!s) { this.state = patchList(this.display, this.el, [], this.state, { sys: '', win: '' }, this); return; }
    this.sys = s.sys;
    const base = this.inherit ? { sys: this.inherit.sys, win: this.inherit.win, app: this.inherit.app } : { sys: s.sys, win: '' };
    this.state = patchList(this.display, this.el, s.cmds || [], this.state, base, this);
  }
  destroy() { this.state = patchList(this.display, this.el, [], this.state, this.ctx, this); this.el.remove(); }
}

function destroyEnt(ent) {
  if (ent.view) ent.view.destroy();
  if (ent.sub) for (const e of ent.sub.values()) destroyEnt(e);
  if (ent.native) ent.native.release();
  if (ent.cleanup) ent.cleanup();
  if (ent.el.parentNode) ent.el.remove();
}

function patchList(display, parent, kids, old, ctx, view) {
  const next = new Map(); const seen = Object.create(null);
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i];
    if (!node || typeof node !== 'object') continue;
    const id = node.key !== undefined && node.key !== null ? 'k' + node.key : node.o + '#' + (seen[node.o] = (seen[node.o] || 0) + 1);
    let ent = old.get(id);
    if (ent && ent.op !== node.o) { destroyEnt(ent); ent = null; old.delete(id); }
    if (!ent) { ent = createEnt(display, node, view); parent.appendChild(ent.el); }
    else old.delete(id);
    updateEnt(display, ent, node, ctx, i, view);
    next.set(id, ent);
  }
  for (const ent of old.values()) destroyEnt(ent);
  return next;
}

function createEnt(display, node, view) {
  const op = node.o; let el;
  if (op === 'input') el = document.createElement(node.ml ? 'textarea' : 'input');
  else if (op === 'icon' || op === 'path' || op === 'poly') el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  else if (op === 'img') el = document.createElement('div');
  else if (op === 'view3d') el = document.createElement('canvas');
  else el = document.createElement('div');
  el.setAttribute('class', 'n n-' + op);
  const ent = { op, el, node: null, css: '' };
  if (op === 'input') {
    el.spellcheck = false; el.autocomplete = 'off';
    el.addEventListener('keydown', (e) => { if (e.key === 'Tab' && node.ml) { e.preventDefault(); const t = el; const s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input', { bubbles: true })); } });
  }
  if (op === 'embed') { ent.view = null; }
  if (op === 'g') ent.sub = new Map();
  if (op === 'view3d') { ent.view3d = null; }
  return ent;
}

function same(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  for (const k in a) { if (k === 'k') continue; const x = a[k], y = b[k]; if (x === y) continue; if (x && y && typeof x === 'object' && typeof y === 'object') { if (JSON.stringify(x) !== JSON.stringify(y)) return false; } else return false; }
  for (const k in b) { if (k === 'k') continue; if (!(k in a)) return false; }
  return true;
}

function updateEnt(display, ent, node, ctx, z, view) {
  const el = ent.el; const old = ent.node;
  let c2 = ctx;
  if (node.o === 'g' && (node.wid || node.app)) c2 = { sys: ctx.sys, win: node.wid || ctx.win, app: node.app || ctx.app };
  const unchanged = old && same(old, node) && ent.z === z && ent.ctxKey === c2.sys + '|' + c2.win;
  if (!unchanged) {
    ent.z = z; ent.ctxKey = c2.sys + '|' + c2.win;
    applyNode(display, ent, node, old, c2, z, view);
  }
  ent.node = node;
  if (node.o === 'g') ent.sub = patchList(display, el, node.k || [], ent.sub, c2, view);
  else if (node.o === 'embed') updateEmbed(display, ent, node, view, c2);
  else if (node.o === 'view3d') updateView3d(display, ent, node, view);
  else if (node.o === 'native') updateNative(display, ent, node, view);
}

function applyNode(display, ent, node, old, ctx, z, view) {
  const el = ent.el; const op = node.o;
  let css = 'z-index:' + z + ';';
  if (node.hid) css += 'display:none;';
  if (node.x !== undefined) css += 'left:' + px(node.x) + ';';
  if (node.y !== undefined) css += 'top:' + px(node.y) + ';';
  if (node.w !== undefined) css += 'width:' + px(node.w) + ';';
  if (node.h !== undefined) css += 'height:' + px(node.h) + ';';
  if (node.op !== undefined && node.op !== 1) css += 'opacity:' + node.op + ';';
  if (node.cur) css += 'cursor:' + node.cur + ';';
  if (node.rot) css += 'transform:rotate(' + node.rot + 'deg);';
  if (node.pe === 0) css += 'pointer-events:none;';
  if (op === 'rect' || op === 'g' || op === 'embed' || op === 'native' || op === 'view3d' || op === 'img') {
    if (node.fill) css += (node.fill.indexOf('gradient') >= 0 ? 'background:' : 'background-color:') + node.fill + ';';
    if (node.grad) css += 'background:linear-gradient(' + (node.grad[2] === undefined ? 180 : node.grad[2]) + 'deg,' + node.grad[0] + ',' + node.grad[1] + ');';
    if (node.stroke) css += 'border:' + (node.sw || 1) + 'px solid ' + node.stroke + ';box-sizing:border-box;';
    if (node.r) css += 'border-radius:' + px(node.r) + ';';
    if (node.sh) css += 'box-shadow:' + (SHADOW[node.sh] || node.sh) + ';';
    if (node.bl) css += 'backdrop-filter:blur(' + node.bl + 'px) saturate(1.2);';
    if (op === 'g' && node.clip) css += 'overflow:hidden;';
  }
  if (op === 'text') {
    css += 'font-size:' + px(node.size || 13) + ';color:' + (node.color || '#fff') + ';font-family:' + (FAM[node.fam] || FAM.ui) + ';';
    if (node.b) css += 'font-weight:600;';
    if (node.i) css += 'font-style:italic;';
    if (node.dec) css += 'text-decoration:underline;';
    if (node.ls) css += 'letter-spacing:' + node.ls + 'px;';
    css += 'line-height:' + px(node.lh || Math.round((node.size || 13) * 1.3)) + ';';
    if (node.al === 'c') css += 'text-align:center;'; else if (node.al === 'r') css += 'text-align:right;';
    if (node.ell) css += 'overflow:hidden;text-overflow:ellipsis;white-space:pre;'; else if (node.wrap) css += 'white-space:pre-wrap;word-break:break-all;'; else css += 'white-space:pre;';
    if (node.sh) css += 'text-shadow:' + (node.sh === 1 ? '0 1px 3px rgba(0,0,0,.6)' : node.sh) + ';';
  }
  if (op === 'icon') { css += 'color:' + (node.color || '#fff') + ';width:' + px(node.size || 20) + ';height:' + px(node.size || 20) + ';'; }
  if (op === 'path' || op === 'poly') { css += 'overflow:visible;'; }
  if (op === 'input') {
    css += 'font-size:' + px(node.size || 13) + ';color:' + (node.color || '#fff') + ';font-family:' + (FAM[node.fam] || FAM.ui) + ';';
    css += 'background:' + (node.fill || 'transparent') + ';border:' + (node.stroke ? (node.sw || 1) + 'px solid ' + node.stroke : 'none') + ';border-radius:' + px(node.r || 0) + ';padding:' + (node.pad === undefined ? 6 : node.pad) + 'px;box-sizing:border-box;outline:none;';
    if (node.ml) css += 'resize:none;white-space:pre;overflow:auto;tab-size:2;line-height:' + px(Math.round((node.size || 13) * 1.45)) + ';';
  }
  if (node.cls) el.setAttribute('class', 'n n-' + op + ' ' + node.cls); else if (old && old.cls) el.setAttribute('class', 'n n-' + op);
  if (node.hf || node.hs) {
    css += '--hf:' + (node.hf || 'transparent') + ';--hs:' + (node.hs || 'transparent') + ';';
    el.classList.add('hv');
  } else el.classList.remove('hv');
  el.style.cssText = css;
  // 属性
  const sys = ctx.sys; if (sys) el.dataset.systemId = sys;
  if (ctx.win) el.dataset.windowId = ctx.win; else delete el.dataset.windowId;
  if (ctx.app && !node.app) el.dataset.appCtx = ctx.app;
  if (node.tid) el.dataset.testid = node.tid; else delete el.dataset.testid;
  if (node.aria) el.setAttribute('aria-label', node.aria); else el.removeAttribute('aria-label');
  if (node.tip) el.dataset.tip = node.tip; else delete el.dataset.tip;
  if (node.app) el.dataset.appId = node.app; else if (old && old.app) delete el.dataset.appId;
  if (node.wid) el.dataset.windowId = node.wid;
  if (node.d) for (const k in node.d) el.setAttribute('data-' + k, node.d[k]);
  if (old && old.d) for (const k in old.d) if (!node.d || !(k in node.d)) el.removeAttribute('data-' + k);
  if (node.ssys) el.dataset.sourceSystemId = node.ssys;
  if (node.swid) el.dataset.sourceWindowId = node.swid;
  if (node.sapp) el.dataset.sourceAppId = node.sapp;
  if (node.ws) el.dataset.state = node.ws;
  if (op === 'text') { if (!old || old.s !== node.s) el.textContent = node.s === undefined ? '' : String(node.s); }
  if (op === 'icon') {
    const sizeS = node.size || 20;
    const pathData = ICONS[node.n] || ICONS.file;
    el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('width', sizeS); el.setAttribute('height', sizeS);
    if (!old || old.n !== node.n || !el.firstChild) {
      el.innerHTML = '<path d="' + pathData + '" fill="' + (node.fillc || 'none') + '" stroke="currentColor" stroke-width="' + (node.sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    }
  }
  if (op === 'line') {
    const x1 = node.x1, y1 = node.y1, x2 = node.x2, y2 = node.y2; const len = Math.hypot(x2 - x1, y2 - y1); const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    el.style.cssText = 'z-index:' + z + ';left:' + px(x1) + ';top:' + px(y1 - (node.sw || 1) / 2) + ';width:' + px(len) + ';height:' + px(node.sw || 1) + ';background:' + (node.dash ? 'repeating-linear-gradient(90deg,' + node.color + ' 0 ' + node.dash + 'px,transparent ' + node.dash + 'px ' + node.dash * 2 + 'px)' : node.color) + ';transform-origin:0 50%;transform:rotate(' + ang + 'deg);' + (node.op !== undefined ? 'opacity:' + node.op + ';' : '');
  }
  if (op === 'path') {
    el.innerHTML = '<path d="' + node.p + '" fill="' + (node.fill || 'none') + '" stroke="' + (node.stroke || 'none') + '" stroke-width="' + (node.sw || 1) + '" stroke-linejoin="round" stroke-linecap="round" ' + (node.dash ? 'stroke-dasharray="' + node.dash + '"' : '') + '/>';
    el.setAttribute('width', node.w || 1); el.setAttribute('height', node.h || 1);
  }
  if (op === 'poly') {
    const pts = node.pts || []; let s = '';
    for (let i = 0; i + 1 < pts.length; i += 2) s += pts[i] + ',' + pts[i + 1] + ' ';
    el.innerHTML = '<polyline points="' + s + '" fill="' + (node.fill || 'none') + '" stroke="' + (node.stroke || '#fff') + '" stroke-width="' + (node.sw || 1.5) + '" stroke-linejoin="round" stroke-linecap="round"/>';
    el.setAttribute('width', node.w || 1); el.setAttribute('height', node.h || 1);
  }
  if (op === 'img') {
    const src = node.src || '';
    const url = src.startsWith('wp:') ? 'assets/wallpapers/' + src.slice(3) + '.svg' : src;
    el.style.backgroundImage = 'url("' + url + '")'; el.style.backgroundSize = node.fit || 'cover'; el.style.backgroundPosition = 'center';
  }
  if (op === 'input') {
    el.dataset.inputId = node.id;
    const key = (view.cid) + ':' + view.v + ':' + node.id;
    display.inputEls.set(key, el); ent.cleanup = () => { if (display.inputEls.get(key) === el) display.inputEls.delete(key); };
    el.placeholder = node.ph || ''; el.readOnly = !!node.ro; if (node.pw) el.type = 'password';
    if (ent.rev !== node.rev) { ent.rev = node.rev; el.value = node.v === undefined || node.v === null ? '' : String(node.v); }
    if (node.f !== undefined && ent.focusSeq !== node.f) { ent.focusSeq = node.f; if (node.f) setTimeout(() => { try { el.focus({ preventScroll: true }); if (node.sel) el.select(); } catch (_) { } }, 0); }
  }
}

function updateEmbed(display, ent, node, view, ctx) {
  const ref = node.c; const cid = ref && ref.id !== undefined ? ref.id : null;
  const v = node.v || 0;
  if (!ent.view || ent.view.cid !== cid || ent.view.v !== v) {
    if (ent.view) ent.view.destroy();
    const isScreen = display.machine && display.machine.kctx.has(cid);
    ent.view = new SurfaceView(display, ref, v, ent.el, view.owner, isScreen ? null : { sys: ctx.sys, win: ctx.win, app: ctx.app });
    ent.view.el.classList.add('embedded');
    ent.view.render();
  } else if (ent.lastRev !== (view.surface && 0)) { /* 子表面自行刷新 */ }
}

function updateView3d(display, ent, node, view) {
  if (!display.render3d) return;
  const cid = node.c && node.c.id; const el = ent.el;
  const w = Math.max(1, Math.round(node.w || 1)), h = Math.max(1, Math.round(node.h || 1));
  display.render3d.setView(ent, el, cid, node.sc, node.cam, w, h);
}

function updateNative(display, ent, node, view) {
  const el = ent.el; el.classList.add('native-host');
  if (!ent.native) {
    ent.native = display.attachNative(node.nid, node.app, el);
  }
  if (ent.native) ent.native.resize && ent.native.resize(node.w, node.h);
}

// ---- 跨系统拖放：宿主只保管负载并显示浮标，落点由各层窗口管理程序与文件管理器决定 ----
Display.prototype.startDrag = function (payload) {
  this.endDrag();
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;z-index:99998;pointer-events:none;padding:8px 12px;border-radius:10px;background:rgba(24,20,48,.96);border:1px solid #8b6cff;color:#ece9ff;font:13px "Microsoft YaHei UI",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:420px;white-space:pre;left:-999px;top:-999px';
  document.body.appendChild(el);
  this.drag = { payload, el, ok: false, target: '', t: 0, label: (payload && payload.label) || '文件', from: payload && payload.from };
  this.dragRender();
};
Display.prototype.dragRender = function () {
  const d = this.drag; if (!d) return;
  const fresh = performance.now() - d.t < 160;
  d.el.textContent = (d.ok && fresh ? '⇢ 投放到  ' + d.target : '拖动 ' + d.label + '（来自 ' + (d.from || '?') + '）\n移到某个文件管理器的目录上投放');
  d.el.style.borderColor = d.ok && fresh ? '#4ade80' : '#8b6cff';
};
Display.prototype.dragMove = function (cx, cy) {
  const d = this.drag; if (!d) return;
  d.el.style.left = (cx + 16) + 'px'; d.el.style.top = (cy + 14) + 'px';
  this.dragRender();
};
Display.prototype.dragHover = function (info) {
  const d = this.drag; if (!d) return;
  d.ok = !!(info && info.ok); d.target = (info && info.label) || ''; d.t = performance.now(); this.dragRender();
};
Display.prototype.dragDropped = function () { const d = this.drag; if (!d) return; d.dropped = true; d.el.style.display = 'none'; d.timer = setTimeout(() => this.endDrag(), 4000); };
Display.prototype.endDrag = function () { const d = this.drag; if (!d) return; clearTimeout(d.timer); d.el.remove(); this.drag = null; };

// ---- 原生应用（电子表格/浏览器等由宿主承载，但窗口框与层叠仍由系统程序决定） ----
Display.prototype.attachNative = function (nid, app, el) {
  const inst = this.natives.get(nid);
  if (!inst) { el.textContent = '（原生应用已关闭）'; return null; }
  inst.mountTo(el);
  return { release: () => inst.unmount && inst.unmount(el), resize: (w, h) => inst.resize && inst.resize(w, h) };
};
