// ───────────────────────── 通用数学与 DOM 工具 ─────────────────────────
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => t * t * (3 - 2 * t);
export const ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  quartOut: (t) => 1 - Math.pow(1 - t, 4),
  expoOut: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  expoInOut: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
/** 把 p 在 [a,b] 内归一化后再缓动 */
export const seg = (p, a, b, e = ease.inOut) => e(inv(a, b, p));
/** 在 [a,b] 内出现、在 [c,d] 内消失的包络（0..1） */
export const env = (p, a, b, c, d) => Math.min(seg(p, a, b, ease.out), 1 - seg(p, c, d, ease.in));
export const mix3 = (out, a, b, t) => {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
};
export const fract = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;

/** 可复现的伪随机数 */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
export function gauss(r) {
  let u = 0, v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

// ── 弹簧：新的目标随时可以打断，并从当前位置与速度出发转向 ──
export class Spring {
  constructor(v = 0, stiffness = 90, damping = 0.92) {
    this.v = v; this.vel = 0; this.target = v;
    this.k = stiffness; this.c = 2 * Math.sqrt(stiffness) * damping;
  }
  set(t) { this.target = t; return this; }
  snap(t = this.target) { this.v = this.target = t; this.vel = 0; return this; }
  step(dt) {
    // 半隐式欧拉，分步以保证稳定
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * (this.target - this.v) - this.c * this.vel;
      this.vel += a * h;
      this.v += this.vel * h;
    }
    if (Math.abs(this.target - this.v) < 1e-5 && Math.abs(this.vel) < 1e-5) { this.v = this.target; this.vel = 0; }
    return this.v;
  }
}

// ── DOM / SVG 构造 ──
export const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}
export function h(tag, attrs = {}, parent = null) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v === undefined || v === null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}
/** 只在值变化时写属性，减少重排 */
export function attr(el, k, v) {
  const key = '_a_' + k;
  if (el[key] !== v) { el[key] = v; el.setAttribute(k, v); }
}
export function css(el, k, v) {
  const key = '_c_' + k;
  if (el[key] !== v) { el[key] = v; el.style[k] = v; }
}
export function show(el, on) {
  const v = on ? '' : 'hidden'; // 显示时继承父级（图层隐藏时子元素随之隐藏）
  if (el._vis !== v) { el._vis = v; el.style.visibility = v; }
}
export const fmt = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const f1 = (x) => (Math.round(x * 10) / 10).toString();
