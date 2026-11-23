'use strict';
/*
 * 宿主主体（渲染进程）：启动根系统、按固定逻辑步推进系统树、把显示组合到页面、
 * 保存根系统磁盘，并提供自动化接口 window.bench（版本 1）。
 */
(function () {
  const RT = window.RT.require;
  const { Universe, fnv } = RT('universe');
  const desk = document.getElementById('desk');
  const bootEl = document.getElementById('boot');
  const STEP = 1 / 60;

  let U = null;
  let scale = 1;
  let acc = 0;
  let last = performance.now();
  let lastFrame = 0;
  let lastSave = 0;
  let readyFlag = false;
  let readyResolve = null;
  let readyP = null;
  let frameCount = 0;
  let info = null;

  function newReady() {
    readyFlag = false;
    readyP = new Promise((r) => { readyResolve = r; });
  }

  const measureCtx = document.createElement('canvas').getContext('2d');

  const hooks = {
    onScale(v) {
      if (v && v !== scale) {
        scale = v;
        applyViewport();
      }
    },
    onView3d(el, action, node, sys) {
      if (window.NOSScene3D) window.NOSScene3D.view(el, action, node, sys);
    },
  };

  const host = {
    measure(text, size) {
      measureCtx.font = `${size}px "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif`;
      return measureCtx.measureText(text).width;
    },
    emit(ev) {
      if (ev && ev.type === 'kernel-error') console.warn('内核错误', ev.sys, ev.error);
    },
    dirty() {},
    dragBegin() {},
    dragEnd() {},
    web(sys, op, arg) { return window.NOSWeb ? window.NOSWeb.op(sys, op, arg) : null; },
    dialog(sys, op, name, text) { return window.NOSHostDialog ? window.NOSHostDialog(sys, op, name, text) : null; },
  };

  function applyViewport() {
    const w = window.innerWidth / scale;
    const h = window.innerHeight / scale;
    desk.style.transform = `scale(${scale})`;
    desk.style.width = w + 'px';
    desk.style.height = h + 'px';
    if (U && U.root) U.root.inbox.push({ to: 'wm', type: 'viewport', w, h });
  }

  function handleDrop(e) {
    if (!U || !U.drag) return;
    const drag = U.drag;
    U.drag = null;
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const d = els.find((el) => el.getAttribute && el.getAttribute('data-desk'));
    if (!d) return;
    const target = U.get(d.getAttribute('data-desk'));
    if (!target) return;
    const r = d.getBoundingClientRect();
    target.inbox.push({ to: 'wm', type: 'drop', payload: drag.payload, x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale });
  }

  // 模板版本变化时，用项目里的系统程序与示例文件覆盖磁盘中的同名文件（其余用户文件保留）。
  const REFRESH_PREFIXES = ['/System/', '/Demo/', '/Programs/', '/Flight/', '/Documents/welcome.txt'];
  function templateHash(files) {
    let text = '';
    for (const p of Object.keys(files).sort()) text += p + '\n' + files[p].length + '\n' + files[p].slice(0, 4096);
    return fnv(text);
  }
  function refreshTemplate(root, files) {
    const hash = templateHash(files);
    if (root.disk['cfg:template'] === hash) return;
    const idx = JSON.parse(root.disk['fsidx'] || '{}');
    for (const p of Object.keys(files)) {
      if (!REFRESH_PREFIXES.some((pre) => p.startsWith(pre))) continue;
      const parts = p.split('/').filter(Boolean);
      let dir = '';
      for (let i = 0; i < parts.length - 1; i++) {
        dir += '/' + parts[i];
        if (!idx[dir]) idx[dir] = { t: 'd', s: 0, m: 0 };
      }
      idx[p] = { t: 'f', s: files[p].length, m: 0 };
      root.setDisk('f:' + p, files[p]);
    }
    root.setDisk('fsidx', JSON.stringify(idx));
    root.setDisk('cfg:template', hash);
  }

  async function bootSystem(fresh) {
    newReady();
    const files = await window.hostAPI.loadTemplate();
    const saved = fresh ? null : await window.hostAPI.loadRootDisk();
    U = new Universe(host);
    U.template = files;
    // 预编译的系统程序放入编译缓存（与系统内编译器的输出一致）
    for (const k of Object.keys(window.PRECOMPILED || {})) U.compileCache.set(k, window.PRECOMPILED[k]);
    window.NOSDisplay.setUniverse(U, hooks);
    const root = U.makeRoot({}, files['/System/kernel.ns']);
    if (saved) {
      const disk = JSON.parse(saved);
      root.disk = {};
      root.diskBytes = 0;
      for (const k of Object.keys(disk)) root.setDisk(k, disk[k]);
      refreshTemplate(root, files);
      root.compilerImage = U.compilerFromDisk(root);
      root.compilerKey = root.compilerImage ? fnv(root.disk['f:/System/compiler.nobj'] || '') : '';
      root.bootKernel(root.disk['f:/System/kernel.ns']);
    }
    root.diskDirty = false;
    desk._sys2 = null;
    desk._kids = null;
    desk.innerHTML = '';
    desk.setAttribute('data-desk', 'outer');
    applyViewport();
    lastSave = performance.now();
  }

  async function saveRoot() {
    if (!U || !U.root || !U.root.diskDirty) return;
    U.root.diskDirty = false;
    try {
      await window.hostAPI.saveRootDisk(JSON.stringify(U.root.disk));
    } catch (e) {
      console.error('保存失败', e);
    }
  }

  function frame(now) {
    if (!U) return;
    lastFrame = now;
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 12) {
      U.tick();
      acc -= STEP;
      n++;
    }
    if (n >= 12) acc = 0;
    window.NOSDisplay.syncRoot(desk, U.root);
    if (window.NOSScene3D && window.NOSScene3D.frame) window.NOSScene3D.frame(now);
    if (U.root.diskDirty && now - lastSave > 800) {
      lastSave = now;
      saveRoot();
    }
    frameCount++;
    if (!readyFlag && desk.childNodes.length > 0 && frameCount > 2) {
      readyFlag = true;
      bootEl.classList.add('hide');
      readyResolve(true);
    }
  }

  function loop(now) {
    frame(now);
    requestAnimationFrame(loop);
  }

  // ---------------- 自动化接口 window.bench（版本 1） ----------------
  function collect(key) {
    const out = [];
    U.preorder((s) => {
      const v = s.res[key];
      if (Array.isArray(v)) for (const x of v) out.push(x);
      else if (v && typeof v === 'object' && key.endsWith('*')) out.push(v);
    });
    return out;
  }

  function collectPrefix(prefix) {
    const out = [];
    U.preorder((s) => {
      for (const k of Object.keys(s.res)) {
        if (k.startsWith(prefix)) out.push(s.res[k]);
      }
    });
    return out;
  }

  function inspect() {
    if (!U) return { systems: [], windows: [], browsers: [], players: [], charts: [], projections: [] };
    const systems = [];
    U.preorder((s) => {
      systems.push({
        id: s.id,
        parentId: s.parent ? s.parent.id : null,
        name: s.id,
        state: s.kernelErr ? 'error' : s.frozen() ? (s.paused ? 'paused' : 'suspended') : 'running',
      });
    });
    const browsers = [];
    for (const b of collectPrefix('browser:')) {
      for (const tab of b.tabs || []) browsers.push({ windowId: b.windowId, tabId: tab.tabId, url: tab.url, loadState: tab.loadState, systemId: b.systemId });
    }
    return {
      systems,
      windows: collect('windows'),
      browsers,
      players: collectPrefix('player:'),
      charts: collectPrefix('chart:'),
      projections: collect('projections'),
    };
  }

  async function reset() {
    newReady();
    await window.hostAPI.resetRootDisk();
    U = null;
    await bootSystem(true);
    return readyP;
  }

  // 开发调试用的只读入口：查看任一系统的进程表（状态、错误、消息输出）
  window.nosDebug = {
    dragState() {
      return U ? U.drag : null;
    },
    post(id, msg) {
      const sys = U && U.get(id);
      if (!sys) return false;
      sys.inbox.push(msg);
      return true;
    },
    info(id) {
      const sys = U && U.get(id);
      return sys ? { ...sys.info(), cfgBudget: sys.cfg.budget, kids: sys.kids.map((k) => k.id), clock: sys.clock, stat: sys.stat, lastUsed: sys.lastUsed } : null;
    },
    procs(id) {
      const sys = U && U.get(id);
      if (!sys || !sys.kernel) return null;
      const list = (sys.kernel.G.procs || []).map((p) => ({ pid: p.pid, name: p.name, state: p.state, err: p.err, parent: p.parent, work: p.work }));
      const logs = {};
      sys.cpu.forEach((m, pid) => { if (m && m.logs) logs[pid] = m.logs.slice(-6); });
      const errs = {};
      sys.cpu.forEach((m, pid) => { if (m && m.error) errs[pid] = m.error; });
      return { kernelErr: sys.kernelErr, procs: list, logs, errs, surfaces: Object.keys(sys.surf) };
    },
  };

  window.bench = {
    version: 1,
    ready: () => readyP,
    reset,
    inspect,
  };

  (async function start() {
    newReady();
    const args = await window.hostAPI.info();
    info = args;
    await bootSystem(false);
    window.NOSInput.init({ getRoot: () => (U ? U.root : null), getScale: () => scale, onDrop: handleDrop });
    window.addEventListener('resize', applyViewport);
    requestAnimationFrame(loop);
    setInterval(() => {
      if (performance.now() - lastFrame > 100) frame(performance.now());
    }, 40);
  })();
})();
