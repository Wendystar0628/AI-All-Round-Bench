// 渲染进程入口：装载系统映像、启动机器与显示设备、提供 window.bench 接口。
import { Machine, buildBase, DT } from './machine.js';
import { Display } from './display.js';
import { installServices } from './services.js';

const api = window.hostApi;
const screenEl = document.getElementById('screen');
let machine = null, display = null, cfg = null, root = null, scale = 1;
let files = null, base = null;

function showFatal(msg) { const f = document.getElementById('fatal'); f.hidden = false; f.textContent = '系统无法继续运行\n\n' + msg; }

function layout() {
  const W = window.innerWidth, H = window.innerHeight;
  const w = Math.floor(W / scale), h = Math.floor(H / scale);
  screenEl.style.width = w + 'px'; screenEl.style.height = h + 'px';
  screenEl.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
  if (machine && machine.root) {
    const r = machine.root;
    if (r.screen.w !== w || r.screen.h !== h) { r.screen = { w, h }; machine.postEvent('outer', { k: 'screen', w, h, scale }); }
  }
}

function onInput(ev, coalesce) {
  const q = machine.events; const last = q[q.length - 1];
  if (ev.type === 'dragev') {
    if (coalesce && last && last.k === 'drag' && last.phase === 'move') { q[q.length - 1] = { k: 'drag', path: [], phase: ev.phase, x: ev.x, y: ev.y }; return; }
    q.push({ k: 'drag', path: [], phase: ev.phase, x: ev.x, y: ev.y }); return;
  }
  if (coalesce && last && last.k === 'input' && last.ev.type === 'move' && last.path.length === 0) { q[q.length - 1] = { k: 'input', path: [], ev }; return; }
  if (q.length > 400) q.splice(0, 100);
  q.push({ k: 'input', path: [], ev });
}

function remount() {
  if (root) { root.destroy(); root = null; }
  screenEl.textContent = '';
  if (machine.k0) root = display.mount(screenEl, { c: { $h: 'ctx', id: machine.k0.cid }, v: 0 }, onInput);
  layout();
}

async function boot(overlay) {
  machine.boot(overlay);
  if (machine.fatal) { showFatal(machine.fatal); return; }
  remount();
  machine.root.screen = { w: 0, h: 0 }; layout();
}

let saveTimer = 0;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    try { api.persistSave(JSON.stringify(machine.root.disk.serialize())); } catch (e) { console.error(e); }
  }, 400);
}

function loop() {
  let last = performance.now(), acc = 0;
  const tick = () => {
    const now = performance.now();
    acc += Math.min(now - last, 120) / 1000; last = now;
    let n = 0;
    while (acc >= DT && n < 8 && performance.now() - now < 14) { machine.step(); acc -= DT; n++; if (machine.fatal) { showFatal(machine.fatal); return; } }
    if (acc > 0.2) acc = 0.2;
    display.flush();
    if (display.render3d) display.render3d.frame();
  };
  setInterval(tick, 5);
}

async function main() {
  cfg = await api.config();
  const imageObj = await api.loadImage();
  files = new Map(Object.entries(imageObj));
  base = buildBase(files);
  machine = new Machine({ base, image: files });
  display = new Display(machine); machine.display = display; machine.persist = persist;
  machine.setScale = (s) => { scale = Math.max(0.5, Math.min(2.5, s)); layout(); };
  display.machine = machine;
  installServices(machine, display, { api, cfg });
  try { const m = await import('./render3d.js'); display.render3d = new m.Render3D(machine, display); } catch (e) { console.warn('三维渲染不可用', e); }
  const ov = await api.persistLoad();
  let overlay = null; try { overlay = ov ? JSON.parse(ov) : null; } catch (e) { overlay = null; }
  await boot(overlay);
  window.addEventListener('resize', layout);
  window.__os = { machine, display, async reload() { const o = await api.loadImage(); files = new Map(Object.entries(o)); base = buildBase(files); machine.base = base; machine.image = files; await boot(null); } };
  loop();
}

// ---------------------------------------------------------------- 自动化接口
const bench = {
  version: 1,
  async ready() {
    for (let i = 0; i < 600; i++) {
      if (machine && machine.k0 && display) {
        const s = display.surfaces.get(machine.k0.cid + ':0');
        if (s && s.cmds && s.cmds.length > 3) return true;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  },
  async reset() {
    await api.persistClear();
    for (const n of [...display.natives.values()]) { try { n.destroy && n.destroy(); } catch (e) { } }
    machine.services.reset && machine.services.reset();
    await boot(null);
    return bench.ready();
  },
  async inspect() {
    const c = display.collect();
    const out = {
      systems: machine.systemList(),
      windows: c.windows, browsers: machine.services.browserInfo ? machine.services.browserInfo() : [],
      players: c.players, charts: c.charts, projections: c.projections,
    };
    return JSON.parse(JSON.stringify(out));
  },
};
window.bench = bench;
main().catch((e) => { console.error(e); showFatal(String(e && e.stack || e)); });
