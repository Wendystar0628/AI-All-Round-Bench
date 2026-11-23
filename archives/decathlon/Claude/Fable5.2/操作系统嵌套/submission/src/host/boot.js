'use strict';
/* 根系统核心：设置、通知、文件持久化、内核与显示设备的装配、主循环。 */
(function () {
  const OS = window.OS = { ready: false, tree: [], listeners: {}, bridge: window.hostBridge || null };
  OS.on = (ev, f) => { (OS.listeners[ev] || (OS.listeners[ev] = [])).push(f); return () => { const a = OS.listeners[ev]; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }; };
  OS.emit = (ev, ...a) => { for (const f of (OS.listeners[ev] || []).slice()) { try { f(...a); } catch (e) { console.error(e); } } };
  const store = {
    get: async (k) => OS.bridge ? OS.bridge.storeGet(k) : localStorage.getItem('nos:' + k),
    set: async (k, v) => OS.bridge ? OS.bridge.storeSet(k, v) : (v == null ? localStorage.removeItem('nos:' + k) : localStorage.setItem('nos:' + k, v)),
    clear: async () => { if (OS.bridge) return OS.bridge.storeClear(); for (const k of Object.keys(localStorage)) if (k.startsWith('nos:')) localStorage.removeItem(k); }
  };
  OS.store = store;

  // ---------- 设置（设置应用与快捷设置共用这一份状态） ----------
  const DEFAULTS = { name: '根系统', wallpaper: 'dawn', accent: '#8b6cf0', scale: 1, dnd: false, clock24: true };
  const ACCENTS = { '#8b6cf0': '#6a4fd0', '#2ec4b6': '#1a8f86', '#f5a524': '#b87512', '#f06595': '#b8416b', '#5aa9ff': '#3577c2', '#7bd66b': '#4f9a43' };
  OS.settings = {
    data: Object.assign({}, DEFAULTS), ACCENTS, DEFAULTS,
    get(k) { return this.data[k]; },
    set(k, v) { if (this.data[k] === v) return; this.data[k] = v; this.apply(); store.set('settings', JSON.stringify(this.data)); OS.emit('settings', k, v); },
    reset() { this.data = Object.assign({}, DEFAULTS); this.apply(); OS.emit('settings', '*'); },
    apply() {
      const d = this.data, rs = document.documentElement.style;
      rs.setProperty('--accent', d.accent); rs.setProperty('--accent2', ACCENTS[d.accent] || d.accent);
      const wall = document.getElementById('wall'); if (wall) wall.className = 'w-' + d.wallpaper;
      const t = document.getElementById('start-title'); if (t) t.textContent = d.name;
      if (OS.wm && OS.wm.layout) OS.wm.layout();
    }
  };

  // ---------- 通知：只记录实际发生的事件 ----------
  OS.notes = [];
  OS.notify = function (title, text, kind) {
    const n = { title, text: text || '', kind: kind || 'info', at: Date.now() };
    OS.notes.push(n); if (OS.notes.length > 60) OS.notes.shift();
    OS.emit('notify', n);
    if (!OS.settings.get('dnd')) {
      const box = document.getElementById('toasts');
      const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('data-testid', 'toast'); el.setAttribute('data-system-id', 'outer');
      const b = document.createElement('b'); b.textContent = title; const s = document.createElement('span'); s.textContent = n.text;
      el.append(b, s); box.appendChild(el);
      setTimeout(() => el.remove(), 4200);
      while (box.children.length > 4) box.firstChild.remove();
    }
    return n;
  };

  // ---------- 根文件系统持久化：只保存与预置镜像不同的文件 ----------
  const persist = { index: {}, timer: null, image: null, off: false };
  function fileKey(p) { return 'f_' + NVM.hash(p); }
  function schedIndex() {
    if (persist.off) return;
    clearTimeout(persist.timer);
    persist.timer = setTimeout(() => store.set('fsindex', JSON.stringify(persist.index)), 300);
  }
  function onPersist(p, node) {
    if (persist.off) return;
    if (!node) { if (persist.index[p] && !persist.index[p].img) store.set(fileKey(p), null); persist.index[p] = { gone: 1 }; if (!(p in persist.image)) delete persist.index[p]; schedIndex(); return; }
    if (node.k === 'd') { persist.index[p] = { d: 1 }; schedIndex(); return; }
    if (persist.image[p] && persist.image[p].k === 'f' && persist.image[p].h === node.h) { persist.index[p] = { img: 1 }; schedIndex(); return; }
    persist.index[p] = { h: node.h, m: node.m };
    store.set(fileKey(p), node.d); schedIndex();
  }
  async function loadImage() {
    const res = await fetch('nos://app/dist/image.json');
    const j = await res.json();
    const img = {};
    for (const p in j.files) img[p] = j.files[p] === null ? { k: 'd', m: 0 } : { k: 'f', d: j.files[p], m: 0, h: NVM.hash(j.files[p]) };
    for (const p in j.rootExtra) img[p] = j.rootExtra[p] === null ? { k: 'd', m: 0 } : { k: 'f', d: j.rootExtra[p], m: 0, h: NVM.hash(j.rootExtra[p]) };
    for (const d of ['/Documents', '/Downloads', '/Recycle', '/Snapshots', '/System/kernels', '/System/cache', '/Programs', '/Demo']) if (!img[d]) img[d] = { k: 'd', m: 0 };
    return img;
  }
  OS.loadFs = async function (fresh) {
    const fs = OS.kernel.fs;
    persist.off = true;
    fs.nodes.clear();
    const img = persist.image || (persist.image = await loadImage());
    let idx = null;
    if (!fresh) { try { idx = JSON.parse(await store.get('fsindex') || 'null'); } catch (e) { idx = null; } }
    const nodes = {};
    for (const p in img) nodes[p] = img[p];
    if (idx) {
      for (const p in idx) {
        const e = idx[p];
        if (e.gone) { delete nodes[p]; continue; }
        if (e.d) { nodes[p] = { k: 'd', m: 0 }; continue; }
        if (e.img) continue;
        const d = await store.get(fileKey(p));
        if (typeof d === 'string') nodes[p] = { k: 'f', d, m: e.m || 0, h: e.h };
      }
      // 上次运行留下的子系统内核副本与过期缓存不再需要
      for (const p of Object.keys(nodes)) if (p.startsWith('/System/kernels/')) { delete nodes[p]; }
    }
    fs.loadImage(nodes);
    persist.index = {};
    if (idx) for (const p in idx) if (nodes[p] || idx[p].gone) persist.index[p] = idx[p];
    persist.off = false;
    fs.onPersist = onPersist;
  };

  // ---------- 内核与显示设备 ----------
  OS.initKernel = function () {
    const host = {
      gfx: (o, op, a, b, c) => OS.device.apply(o, op, a, b, c),
      tree: (flat) => { OS.tree = flat; OS.emit('tree', flat); },
      sysEvent: (type, c) => OS.emit('sys', type, c),
      bus: (m) => OS.emit('bus', m),
      procEnded: (p) => OS.emit('proc', p),
      procOutput: (p) => OS.emit('procout', p),
      wmMessage: (p, m) => { OS.emit('progwm', p, m); return true; },
      systemName: () => OS.settings.get('name')
    };
    const K = OS.kernel = new RootKernelLib.RootKernel(host);
    const dhost = {
      dev3d: null,
      isAncestor: (a, b) => { let n = OS.tree.find(x => x.id === b); while (n && n.parentId) { if (n.parentId === a) return true; n = OS.tree.find(x => x.id === n.parentId); } return false; },
      systemFocused: (sys, win) => {
        if (sys === 'outer') return !!(OS.wm.focused && OS.wm.focused.gid === win);
        const S = OS.device.surface(sys, 0, false); const m = S && S.meta && S.meta.d;
        if (!m || !m.active) return false;
        return win == null ? true : (sys + '-' + m.focus) === win;
      },
      fieldEvent: (el, ev) => {
        const w = OS.wm.wins.find(x => x.el.contains(el));
        if (w && OS.wm.focused !== w) OS.wm.focus(w);
        OS.wm.routeKeyLike(ev);
      },
      fieldFocus: (el) => {
        const w = OS.wm.wins.find(x => x.el.contains(el));
        if (w && OS.wm.focused !== w) OS.wm.focus(w);
        // 没有经过指针事件就取得焦点（例如自动化工具直接 focus/fill）：补一次点击，让所属系统的程序把焦点给它
        if (el._prim && !el._prim.focus && performance.now() - (OS.wm.lastRawDown || 0) > 80) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      }
    };
    OS.device = new Device2D(dhost);
    OS.deviceHost = dhost;
    return K;
  };

  // ---------- 主循环：由 Worker 计时，窗口被遮住或隐藏时也照常推进 ----------
  OS.loop = { running: false, last: 0, acc: 0, stepsPerSec: 0, count: 0, t0: 0, worker: null, ms: 0 };
  OS.tick = function () {
    const L = OS.loop, now = performance.now();
    let dt = now - L.last; L.last = now;
    if (dt > 250) dt = 250;
    L.acc += dt;
    let n = 0;
    const STEP = RootKernelLib.STEP_MS;
    const t0 = performance.now();
    while (L.acc >= STEP && n < 4) { OS.kernel.step(); L.acc -= STEP; n++; OS.emit('step'); }
    if (L.acc > STEP * 4) L.acc = 0;
    if (n) {
      OS.device.flush();
      if (OS.dev3d) OS.dev3d.render();
      L.count += n; L.ms = L.ms * 0.9 + (performance.now() - t0) * 0.1;
      if (now - L.t0 > 1000) { L.stepsPerSec = L.count * 1000 / (now - L.t0); L.count = 0; L.t0 = now; OS.emit('second'); }
    }
  };
  OS.startLoop = function () {
    const L = OS.loop;
    L.last = performance.now(); L.t0 = L.last; L.running = true;
    const src = 'let t=null;onmessage=e=>{if(e.data==="start"){clearInterval(t);t=setInterval(()=>postMessage(0),1000/120);}else if(e.data==="stop"){clearInterval(t);}}';
    try {
      L.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      L.worker.onmessage = () => { if (L.running) OS.tick(); };
      L.worker.postMessage('start');
    } catch (e) { console.warn('worker timer unavailable', e); setInterval(() => { if (L.running) OS.tick(); }, 8); }
  };
})();
