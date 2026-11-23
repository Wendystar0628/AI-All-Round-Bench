// 根系统窗口：跨层投送窗口（外框归根系统，内容归源系统）
import { View2D } from '../../device/view2d.js';
let primRenderer = null;

export function mountProjection(win, api) {
  const proj = win._opts && win._opts.proj;
  const host = api.host;
  win.bar.querySelector('.wtitle').textContent = '投送 · ' + (proj ? proj.title : '');
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;inset:0;background:#0a0f18;overflow:hidden';
  win.body.appendChild(el);
  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;left:0;right:0;top:0;height:22px;background:rgba(28,36,51,0.9);color:#93a1bb;font-size:11px;display:flex;align-items:center;padding:0 8px;gap:8px;z-index:5';
  el.appendChild(info);
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;left:0;top:22px;width:100%;height:calc(100% - 22px)';
  el.appendChild(cv);
  if (!primRenderer) primRenderer = new View2D(host);

  let lastPayload = null;
  function draw() {
    if (!proj) return;
    const p = host.projections.get(proj.id);
    if (!p || !p.active) { info.textContent = '投送已结束（源窗口已关闭）'; return; }
    const src = host.systems.get(p.sourceSystemId);
    info.innerHTML = `<span style="color:#ffd23f">来源</span> ${p.sourceSystemId} · ${p.title} <span style="margin-left:auto">${src && src.effectivePaused() ? '源系统已暂停，内容冻结' : '实时'}</span>`;
    if (p.kind === '3d') return;   // 三维由显示设备绘制
    const payload = p.payload;
    if (!payload || !payload.content) return;
    if (payload === lastPayload) return;
    lastPayload = payload;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w * 2) { cv.width = w * 2; cv.height = h * 2; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const prims = payload.content.map(pr => {
      const q = Object.assign({}, pr);
      if (q.t === 'clip') { q.y += 22; }
      return q;
    });
    primRenderer.prims(ctx, prims, 0, 0);
  }
  const t = setInterval(draw, 120);
  draw();

  // 输入转发给源应用
  const forward = (type, x, y, extra) => {
    if (!proj) return;
    const r = cv.getBoundingClientRect();
    host.projectionInput(proj.id, Object.assign({ t: type, x: x - r.left, y: y - r.top - 22 }, extra || {}));
  };
  cv.addEventListener('pointerdown', e => forward('down', e.clientX, e.clientY));
  cv.addEventListener('pointermove', e => forward('move', e.clientX, e.clientY));
  cv.addEventListener('pointerup', e => forward('up', e.clientX, e.clientY));
  cv.addEventListener('wheel', e => { e.preventDefault(); forward('wheel', e.clientX, e.clientY, { dx: e.deltaX, dy: e.deltaY }); }, { passive: false });

  win.api = {
    dispose: () => clearInterval(t),
    view3d: proj && proj.kind === '3d' ? proj.id : null
  };
  // 三维投送：把窗口矩形登记给显示设备
  if (proj && proj.kind === '3d') {
    const reg = () => {
      const r = el.getBoundingClientRect();
      host.rootProjRects = host.rootProjRects || [];
      host.rootProjRects.push({ projId: proj.id, x: r.left, y: r.top + 22, w: r.width, h: r.height - 22, winId: win.id });
    };
    reg();
    const ro = new ResizeObserver(reg);
    ro.observe(el);
    win.onResize = reg;
  }
}
