// ───────────── 接缝 · THE SEAM ─────────────
// 引擎：滚动时间轴、平滑、章节导航、键盘、动画时钟、视频导出接口
import { S, ui, makeUI } from './state.js';
import { GL } from './gl.js';
import { h, clamp, ease, Spring, css, attr, show } from './util.js';
import { createPkgScene } from './scenes/pkg.js';
import { createCityScene } from './scenes/city.js';
import { createServerScene } from './scenes/server.js';
import { createRackScene } from './scenes/rack.js';
import c0 from './chapters/c0_prologue.js';
import c1 from './chapters/c1_strata.js';
import c2 from './chapters/c2_city.js';
import c3 from './chapters/c3_river.js';
import c4 from './chapters/c4_print.js';
import c5 from './chapters/c5_weave.js';
import c6 from './chapters/c6_scale.js';
import c7 from './chapters/c7_return.js';
import { createFP } from './overlays/fpsvg.js';

const CH = [c0, c1, c2, c3, c4, c5, c6, c7];
// 每次打开都从开场画面开始
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const $ = (q) => document.querySelector(q);
const canvas = $('#gl');
const stage = $('#stage');
const scrollEl = $('#scroll');
const navEl = $('#nav');
const rulerMark = $('.ruler-mark');
const hudCh = $('.hud-ch');

const gl = new GL(canvas);
const scenes = {};
let rulerMM = 0;
// 当前画面上的体验式交互（由正在播放的篇章每帧登记）
let tool = null, nextTool = null, dragging = false;

const ctx = {
  gl, scenes, S, canvas,
  get ui() { return ui.v; },
  ruler(mm) { rulerMM = mm; },
  tool(t) { nextTool = t; },
  jump: (i) => jumpTo(i),
  chapters: CH,
};

// ── 初始化 ──
function init() {
  S.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  scenes.pkg = createPkgScene(gl);
  scenes.city = createCityScene(gl);
  scenes.server = createServerScene(gl);
  scenes.rack = createRackScene(gl);

  let acc = 0;
  CH.forEach((c, i) => {
    c.index = i;
    c.start = acc; acc += c.len;
    c.layer = h('div', { class: 'layer', id: 'L-' + c.id, 'data-ch': c.id }, stage);
    show(c.layer, false);
    c.sec = h('section', { id: c.id, 'aria-label': c.title }, scrollEl);
  });
  S.total = acc;
  h('div', { class: 'tail', style: 'height:100vh' }, scrollEl);
  ctx.fp = createFP(stage);
  CH.forEach((c) => c.init(ctx));
  buildNav();
  layout();
  bindInput();
}

function layout() {
  S.W = window.innerWidth; S.H = window.innerHeight;
  S.unit = Math.max(10 / 16, Math.min(S.W / 1920, S.H / 1080));
  S.dpr = S.exportMode ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1.5);
  CH.forEach((c) => { c.sec.style.height = c.len * S.H + 'px'; });
  S.maxScroll = S.total * S.H;
  gl.resize(S.W, S.H, S.dpr);
  CH.forEach((c) => c.resize && c.resize(ctx));
  placeNav();
}

// ── 章节导航 ──
const navBtns = [];
let navFill, navSpark;
function buildNav() {
  h('div', { class: 'rail' }, navEl);
  navFill = h('div', { class: 'fill' }, navEl);
  navSpark = h('div', { class: 'spark' }, navEl);
  CH.forEach((c, i) => {
    const b = h('button', {
      type: 'button', 'aria-label': `第 ${i} 章：${c.title}`,
      html: `<i></i><span><b>${String(i).padStart(2, '0')}</b>${c.title}</span>`,
      onclick: () => jumpTo(i),
    }, navEl);
    navBtns.push(b);
  });
}
const skip = document.querySelector('.skip');
if (skip) skip.addEventListener('click', (e) => { e.preventDefault(); (navBtns[Math.max(0, curCh)] || navBtns[0]).focus(); });
function placeNav() {
  CH.forEach((c, i) => { navBtns[i].style.top = (c.start / S.total) * 100 + '%'; });
}
let curCh = -1;
function updateNav() {
  const p = S.p;
  css(navFill, 'height', (p * 100).toFixed(3) + '%');
  css(navSpark, 'top', (p * 100).toFixed(3) + '%');
  let cur = 0;
  CH.forEach((c, i) => { if (S.sp >= c.start - 1e-6) cur = i; });
  if (cur !== curCh) {
    curCh = cur;
    hudCh.innerHTML = `<b>${String(cur).padStart(2, '0')}</b><span>${CH[cur].title}</span>`;
    navBtns.forEach((b, i) => {
      b.classList.toggle('cur', i === cur);
      b.classList.toggle('done', i < cur);
      if (i === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }
}

// ── 跳转：较快地滚过中间画面，从当前画面自然进入目标篇章 ──
let tween = null;
function jumpTo(i) {
  i = clamp(i, 0, CH.length - 1);
  const c = CH[i];
  const to = (c.start + (c.jumpAt || 0) * c.len) * S.H;
  const from = window.scrollY;
  const dist = Math.abs(to - from) / S.H;
  if (S.exportMode) return;
  tween = { from, to, t0: performance.now(), dur: (0.7 + Math.min(dist, 14) * 0.11) * 1000 };
}
function stepTween(now) {
  if (!tween) return;
  const t = clamp((now - tween.t0) / tween.dur);
  const y = tween.from + (tween.to - tween.from) * ease.inOut(t);
  window.scrollTo(0, y);
  S.target = y / S.maxScroll;
  if (t >= 1) tween = null;
}

// ── 输入 ──
function bindInput() {
  window.addEventListener('scroll', () => { if (!S.exportMode && !tween) S.target = clamp(window.scrollY / S.maxScroll); }, { passive: true });
  window.addEventListener('resize', () => { if (!S.exportMode) layout(); });
  const cancel = () => { tween = null; };
  window.addEventListener('wheel', cancel, { passive: true });
  window.addEventListener('touchstart', cancel, { passive: true });
  window.addEventListener('pointermove', (e) => {
    S.pointer.x = e.clientX; S.pointer.y = e.clientY;
    S.pointer.nx = (e.clientX / S.W) * 2 - 1; S.pointer.ny = (e.clientY / S.H) * 2 - 1;
    S.pointer.moved = S.time;
    if (S.exportMode || !tool) return;
    if (dragging && tool.move) tool.move(e);
    else if (!dragging && tool.hover && (e.target === canvas || e.target === document.documentElement || e.target === document.body)) tool.hover(e);
  }, { passive: true });
  canvas.addEventListener('pointerdown', (e) => {
    if (S.exportMode || !tool || !tool.down) return;
    dragging = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件 */ }
    canvas.classList.add('grabbing');
    tool.down(e);
  });
  const endDrag = (e) => { if (!dragging) return; dragging = false; canvas.classList.remove('grabbing'); if (tool && tool.up) tool.up(e); };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('keydown', (e) => {
    if (tool && tool.key && tool.key(e)) { e.preventDefault(); e.stopPropagation(); }
  });
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[0-7]$/.test(e.key)) { jumpTo(+e.key); e.preventDefault(); }
    else if (e.key === ']') { jumpTo(curCh + 1); e.preventDefault(); }
    else if (e.key === '[') { jumpTo(curCh - (S.sp - CH[curCh].start < 0.15 ? 1 : 0)); e.preventDefault(); }
    else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].includes(e.key)) cancel();
  });
}

// ── 帧 ──
function stepSprings(dt) {
  const u = ui.v;
  const st = (v) => { if (v instanceof Spring) { if (S.exportMode) v.snap(); else v.step(dt); } };
  for (const k in u) { const v = u[k]; if (Array.isArray(v)) v.forEach(st); else st(v); }
}
function renderFrame() {
  S.sp = S.p * S.total;
  gl.use(null);
  nextTool = null;
  ctx.fp.begin();
  for (const c of CH) c.update((S.sp - c.start) / c.len, ctx);
  ctx.fp.end();
  updateNav();
  if (nextTool !== tool) {
    if (dragging && tool && tool.up) tool.up();
    dragging = false;
    tool = nextTool;
    canvas.classList.toggle('grab', !!(tool && tool.down));
    canvas.classList.toggle('lens', !!(tool && tool.hover && !tool.down));
    canvas.setAttribute('aria-label', tool && tool.label ? tool.label : '画面');
    canvas.tabIndex = tool && tool.key ? 0 : -1;
  }
  // 尺度尺：对数刻度上的位置（不显示读数）
  if (rulerMM > 0) {
    const lp = clamp((Math.log10(rulerMM) + 2) / 7); // 0.01 mm … 100 m
    css(rulerMark, 'left', (lp * 100).toFixed(2) + '%');
  }
  gl.render();
}
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  if (S.exportMode) { last = now; return; }
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  S.dt = dt;
  S.time += dt;
  stepTween(now);
  const k = 1 - Math.exp(-dt * 6.5);
  S.p += (S.target - S.p) * k;
  if (Math.abs(S.target - S.p) < 2e-6) S.p = S.target;
  stepSprings(dt);
  renderFrame();
}

// ── 视频导出接口 ──
const paint = () => new Promise((res) => {
  let done = false;
  const fin = () => { if (!done) { done = true; res(); } };
  requestAnimationFrame(() => requestAnimationFrame(fin));
  setTimeout(fin, 120);
});
let readyP = null;
function whenReady() {
  if (!readyP) {
    readyP = (async () => {
      await booted;
      try { await document.fonts.ready; } catch (e) { /* 忽略 */ }
      // 预编译各场景着色器
      for (const k in scenes) { try { gl.renderer.compile(scenes[k].scene, scenes[k].camera); } catch (e) { /* 忽略 */ } }
      S.ready = true;
    })();
  }
  return readyP;
}
// ── 导出时的运镜：作品自己从页首一直滚到页尾，中途不停；按篇章内容时快时慢 ──
// 关键点：[篇章序号, 篇章内进度, 距上一个关键点的秒数]；关键点之间用单调三次插值连成平滑、处处为正的滚动速度
const PACE = [
  [0, 0.10, 2.8], [0, 0.45, 1.7], [0, 1.0, 1.7],                                                  // 序章：开场构图先慢慢展开（6.2 秒）
  [1, 0.18, 1.5], [1, 0.42, 2.3], [1, 0.66, 2.2], [1, 0.86, 1.6], [1, 1.0, 2.1],                  // 地层：推近、拆开、剖切、俯视成纹样（9.7 秒）
  [2, 0.32, 2.4], [2, 0.47, 1.2], [2, 0.66, 2.0], [2, 0.77, 1.0], [2, 0.93, 2.0], [2, 1.0, 0.9],  // 硅城：生长、俯冲进 SM、任务落下（9.5 秒）
  [3, 0.2, 1.4], [3, 0.44, 2.1], [3, 0.72, 2.6], [3, 0.86, 1.5], [3, 1.0, 1.3],                   // 河流：展开、空等、开闸、满载（8.9 秒）
  [4, 0.18, 1.2], [4, 0.5, 3.0], [4, 0.66, 1.2], [4, 0.86, 2.1], [4, 1.0, 1.0],                   // 精度：一级级变粗、分块恢复（8.5 秒）
  [5, 0.17, 1.5], [5, 0.3, 1.3], [5, 0.5, 2.0], [5, 0.78, 2.6], [5, 0.9, 1.2], [5, 1.0, 1.3],     // 经纬：俯冲、展开、推理、收回（9.9 秒）
  // 尺度：HGX 停留段与“各自计算 → 沿 NVLink 汇总”的光循环对位（10.2 秒）
  [6, 0.12, 1.2], [6, 0.38, 3.2], [6, 0.46, 1.0], [6, 0.64, 1.4], [6, 0.82, 1.8], [6, 1.0, 1.6],
  [7, 0.36, 1.5], [7, 0.58, 1.2], [7, 0.9, 1.7], [7, 1.0, 1.5],                                   // 归来：回到开场的封装，停在画面上（5.9 秒）
];
let TL = null;
function buildTimeline() {
  const T = [0], P = [0];
  for (const [ci, lp, dt] of PACE) { T.push(T[T.length - 1] + dt); P.push((CH[ci].start + lp * CH[ci].len) / S.total); }
  P[P.length - 1] = 1;
  const n = T.length, d = [], m = new Array(n);
  for (let k = 0; k < n - 1; k++) d.push((P[k + 1] - P[k]) / (T[k + 1] - T[k]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = (d[k - 1] + d[k]) / 2;
  // Fritsch–Carlson：保持单调；切线限制在半径 2.9 之内，使速度处处为正（滚动从不停顿）
  for (let k = 0; k < n - 1; k++) {
    const a = m[k] / d[k], b = m[k + 1] / d[k], r2 = a * a + b * b;
    if (r2 > 2.9 * 2.9) { const tau = 2.9 / Math.sqrt(r2); m[k] = tau * a * d[k]; m[k + 1] = tau * b * d[k]; }
  }
  return { T, P, m, total: T[n - 1] };
}
/** 片段时刻 t（秒）→ 全页进度 0..1 */
function progressAt(t) {
  const { T, P, m, total } = TL;
  if (t <= 0) return 0;
  if (t >= total) return 1;
  let k = 0;
  while (k < T.length - 2 && t > T[k + 1]) k++;
  const h = T[k + 1] - T[k], x = (t - T[k]) / h, x2 = x * x, x3 = x2 * x;
  return (2 * x3 - 3 * x2 + 1) * P[k] + (x3 - 2 * x2 + x) * h * m[k] + (-2 * x3 + 3 * x2) * P[k + 1] + (x3 - x2) * h * m[k + 1];
}
function resetUI() {
  ui.v = makeUI();
  CH.forEach((c) => c.reset && c.reset(ctx));
}
let exportFrames = 0;
/** 第 i 帧 = 片段时刻 i / fps：页面滚到运镜给出的位置，动画时钟放到同一时刻，画面更新完再返回 */
async function exportFrame(i) {
  if (window.innerWidth !== S.W || window.innerHeight !== S.H) layout();
  const t = Math.max(0, Math.floor(+i || 0)) / S.fps;
  const p = clamp(progressAt(t));
  S.p = S.target = p;
  S.time = t;
  S.dt = 1 / S.fps;
  window.scrollTo(0, p * S.maxScroll);
  stepSprings(0);
  renderFrame();
  await paint();
}
async function exportBegin(run = 'page', opts = {}) {
  S.exportMode = true;
  S.fps = Math.max(1, +(opts && opts.fps) || 60);
  tween = null;
  document.documentElement.classList.add('export');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  await whenReady();
  resetUI();
  layout();
  TL = buildTimeline();
  exportFrames = Math.max(1, Math.round(TL.total * S.fps));
  await exportFrame(0);
  return { frames: exportFrames };
}
window.videoExport = {
  runs: ['page'],
  begin: exportBegin,
  async frame(i) {
    if (!S.exportMode || !TL) await exportBegin('page', { fps: S.fps || 60 });
    await exportFrame(i);
  },
  end() {
    S.exportMode = false;
    document.documentElement.classList.remove('export');
    layout();
    S.target = clamp(window.scrollY / S.maxScroll);
    last = performance.now();
  },
};

// 先让 HTML 外壳完成首次绘制，再生成场景（避免启动时长时间空白）
const booted = new Promise((res) => {
  let done = false;
  const boot = () => {
    if (done) return;
    done = true;
    init();
    if (!location.hash) window.scrollTo(0, 0);
    S.target = S.p = clamp(window.scrollY / S.maxScroll);
    const bootEl = document.getElementById('boot');
    if (bootEl) bootEl.remove();
    requestAnimationFrame(tick);
    res();
  };
  requestAnimationFrame(() => setTimeout(boot, 0));
  setTimeout(boot, 200); // 某些无头或后台环境不触发 rAF 时的兜底
});
whenReady();
