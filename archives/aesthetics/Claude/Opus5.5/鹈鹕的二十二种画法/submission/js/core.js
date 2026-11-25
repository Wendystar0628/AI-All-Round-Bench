'use strict';
/* ============================================================
   核心：时间轴常量、SVG 工具、数学与路径工具
   ============================================================ */
const SVGNS = 'http://www.w3.org/2000/svg';
const VW = 1920, VH = 1080;
const BEAT = 0.5, BAR = 2;
const INTRO_LEN = 5, SEC_LEN = 6, NSEC = 22, OUTRO_LEN = 12;
const TOTAL = INTRO_LEN + NSEC * SEC_LEN + OUTRO_LEN;   // 149 s
const GY = 880;        // 路面（屏幕坐标）
const PX = 840;        // 鹈鹕的标准屏幕位置
const SPEED = 330;     // 世界滚动速度 px/s
const PRE = 2.1;       // 转场前（画框里能看见下一版块）的时长
const POST = 0.6;      // 转场后的时长

const SCENES = [];     // 22 个版块按顺序注册
const SEG = {};        // intro / outro

function mk(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function at(e, attrs) { for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function add(parent, markup) { parent.insertAdjacentHTML('beforeend', markup); return parent.lastElementChild; }
function q(root, sel) { return root.querySelector(sel); }
function qa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
let DEFS = null;
function def(markup) { DEFS.insertAdjacentHTML('beforeend', markup); }

/* ---------- 数学 ---------- */
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const ss = (a, b, x) => { const t = inv(a, b, x); return t * t * (3 - 2 * t); };
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eo = t => 1 - Math.pow(1 - t, 3);
const ei = t => t * t * t;
const eo2 = t => 1 - (1 - t) * (1 - t);
const eob = t => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const eel = t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1;
const bump = (x, w) => Math.exp(-(x / w) * (x / w));
const fr = x => x - Math.floor(x);
const f1 = n => Math.round(n * 10) / 10;
const f2 = n => Math.round(n * 100) / 100;
const step = (x, n) => Math.floor(x * n) / n;
function rng(seed) {
  let s = seed | 0;
  return function () {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function noise1(x, seed = 0) { const i = Math.floor(x), f = x - i, a = hash(i + seed * 101), b = hash(i + 1 + seed * 101), u = f * f * (3 - 2 * f); return a + (b - a) * u; }
// 时间段中局部进度
function seg(t, a, b) { return clamp((t - a) / (b - a)); }

/* ---------- 路径 ---------- */
function P(pts, close) {
  let d = '';
  for (let i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + f1(pts[i][0]) + ',' + f1(pts[i][1]);
  return d + (close ? 'Z' : '');
}
function smooth(pts, close, k = 1) {
  const n = pts.length; if (n < 3) return P(pts, close);
  let d = 'M' + f1(pts[0][0]) + ',' + f1(pts[0][1]);
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = pts[close ? (i - 1 + n) % n : Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[close ? (i + 2) % n : Math.min(i + 2, n - 1)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6 * k, c1y = p1[1] + (p2[1] - p0[1]) / 6 * k;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6 * k, c2y = p2[1] - (p3[1] - p1[1]) / 6 * k;
    d += 'C' + f1(c1x) + ',' + f1(c1y) + ' ' + f1(c2x) + ',' + f1(c2y) + ' ' + f1(p2[0]) + ',' + f1(p2[1]);
  }
  return d + (close ? 'Z' : '');
}
function rectD(x, y, w, h) { return `M${f1(x)},${f1(y)}h${f1(w)}v${f1(h)}h${f1(-w)}Z`; }
function rrD(x, y, w, h, r) {
  return `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
}
function circD(cx, cy, r) { return `M${f1(cx - r)},${f1(cy)}a${f1(r)},${f1(r)} 0 1 0 ${f1(2 * r)},0a${f1(r)},${f1(r)} 0 1 0 ${f1(-2 * r)},0Z`; }
function starPts(cx, cy, r1, r2, n, rot = -PI / 2) {
  const o = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, r = i % 2 ? r2 : r1; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return o;
}
function circPts(cx, cy, r, n, ph = 0, R) {
  const o = [];
  for (let i = 0; i < n; i++) { const a = ph + i * TAU / n, rr = R ? r * (1 + (R() - .5) * .12) : r; o.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  return o;
}
// 撕纸/锯齿边的矩形
function tornRect(x, y, w, h, amp, stepLen, R) {
  const pts = [];
  const edge = (x0, y0, x1, y1) => {
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(L / stepLen));
    const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let i = 0; i < n; i++) { const t = i / n, a = (R() - .5) * 2 * amp; pts.push([x0 + (x1 - x0) * t + nx * a, y0 + (y1 - y0) * t + ny * a]); }
  };
  edge(x, y, x + w, y); edge(x + w, y, x + w, y + h); edge(x + w, y + h, x, y + h); edge(x, y + h, x, y);
  return P(pts, true);
}
function wob(pts, amp, R) { return pts.map(p => [p[0] + (R() - .5) * amp * 2, p[1] + (R() - .5) * amp * 2]); }
function tr(x, y, r, s, sy) {
  let o = `translate(${f2(x)},${f2(y)})`;
  if (r) o += ` rotate(${f2(r)})`;
  if (s !== undefined && (s !== 1 || (sy !== undefined && sy !== 1))) o += ` scale(${f2(s)}${sy !== undefined ? ',' + f2(sy) : ''})`;
  return o;
}
// 以 (cx,cy) 为中心缩放
function zoomT(s, cx, cy) { return `translate(${f2(cx)},${f2(cy)}) scale(${s.toFixed(4)}) translate(${f2(-cx)},${f2(-cy)})`; }
// 版块的界面层：放在镜头组之外（转场时镜头校正不会带动它）
function hudOf(root) { return mk('g', { class: 'hud' }, root.parentNode); }
// 超大的底色（转场时镜头会缩放、旋转，底色要盖得住）
function bigBg(root, fill) { return add(root, `<rect x="-3000" y="-2400" width="7920" height="5880" fill="${fill}"/>`); }
function vis(e, on) { const v = on ? '' : 'none'; if (e._disp === v) return; e._disp = v; e.style.display = v; }
function op(e, v) { e.setAttribute('opacity', f2(clamp(v))); }

/* 打字效果：返回前 n 个字符 */
function typed(str, t, cps) { const n = Math.max(0, Math.floor(t * cps)); return Array.from(str).slice(0, n).join(''); }

/* 场景通用：世界滚动与画框 */
function stdScroll(lt) { return SPEED * Math.min(lt, 6); }
// 画框中心的屏幕 x（画框位于世界中，lt=6 时正好在鹈鹕处）
function frameScreenX(lt, scrollFn) { const sc = scrollFn || stdScroll; return PX + sc(6) - sc(Math.min(lt, 6)); }

/* 文本 markup */
function T(x, y, s, a) {
  let attrs = '';
  for (const k in a) attrs += ` ${k}="${a[k]}"`;
  return `<text x="${f1(x)}" y="${f1(y)}"${attrs}>${esc(s)}</text>`;
}

/* 简单的 path 采样（构建时用） */
let _probe = null;
function probe() {
  if (!_probe) { const s = mk('svg', { width: 0, height: 0, style: 'position:absolute;left:-9999px' }); document.body.appendChild(s); _probe = mk('path', {}, s); }
  return _probe;
}
function samplePath(d, n) {
  const p = probe(); p.setAttribute('d', d);
  const L = p.getTotalLength(), o = [];
  for (let i = 0; i < n; i++) { const pt = p.getPointAtLength(L * i / (n - 1 || 1)); o.push([pt.x, pt.y]); }
  return o;
}
function pathLen(d) { const p = probe(); p.setAttribute('d', d); return p.getTotalLength(); }
