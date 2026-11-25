// 篇章通用：文字节拍、三维标注引线、像素空间 SVG
import * as THREE from 'three';
import { S } from './state.js';
import { h, s, seg, ease, clamp, attr, css, show } from './util.js';

/** 文字块：在 [a,b] 内可见；f 为淡入淡出宽度。mode: rise | left | mask | weight | none */
export function beat(el, p, a, b, f = 0.06, mode = 'rise') {
  const kin = seg(p, a, a + f, ease.out);
  const kout = 1 - seg(p, b - f, b, ease.in);
  const k = Math.min(kin, kout);
  const vis = k > 0.001;
  show(el, vis);
  if (!vis) return 0;
  let tx = 0, ty = 0;
  const u = S.unit;
  if (mode === 'rise') { ty = (1 - kin) * 34 * u - (1 - kout) * 24 * u; }
  else if (mode === 'left') { tx = -(1 - kin) * 50 * u - (1 - kout) * 30 * u; }
  else if (mode === 'right') { tx = (1 - kin) * 50 * u + (1 - kout) * 30 * u; }
  else if (mode === 'mask') {
    ty = -(1 - kout) * 20 * u;
    const lines = el._lines || (el._lines = [...el.querySelectorAll('.reveal-line > span')]);
    const n = lines.length;
    lines.forEach((ln, i) => {
      const st = a + (i / Math.max(1, n)) * f * 1.4;
      const ki = seg(p, st, st + f, ease.quartOut);
      css(ln, 'transform', `translate3d(0,${((1 - ki) * 108).toFixed(2)}%,0)`);
    });
  } else if (mode === 'weight') {
    ty = (1 - kin) * 20 * u - (1 - kout) * 16 * u;
    const w = Math.round(200 + 700 * kin);
    css(el, 'fontVariationSettings', `'wght' ${w}`);
  }
  css(el, 'opacity', (mode === 'mask' ? Math.min(1, kout * 1.2) * (kin > 0 ? 1 : 0) : k).toFixed(3));
  css(el, 'transform', `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0)`);
  return k;
}

/** 生成按行遮罩揭示的 HTML */
export const lines = (arr) => arr.map((l) => `<span class="reveal-line"><span>${l}</span></span>`).join('');

/** 绝对定位文字块（单位 rem / %） */
export function block(parent, html, style, cls = '') {
  return h('div', { class: 'text ' + cls, html, style }, parent);
}

/** 像素空间 SVG（viewBox 跟随视口），用于与三维对齐的引线与图形 */
export function pxSVG(parent, cls = '') {
  const svg = s('svg', { class: 'px ' + cls, 'aria-hidden': 'true' }, parent);
  const fit = () => attr(svg, 'viewBox', `0 0 ${S.W} ${S.H}`);
  fit();
  svg._fit = fit;
  return svg;
}

/**
 * 三维标注：HTML 标签 + SVG 引线，锚点每帧投影到屏幕。
 * 标签放在固定的屏幕位置（fx, fy 为视口比例），引线折一次指向部件。
 */
export class Annotator {
  constructor(layer) {
    this.svg = pxSVG(layer, 'ann-svg');
    this.items = [];
    this.v = new THREE.Vector3();
    this.layer = layer;
  }
  add({ title, desc = '', fx, fy, side = 'l', anchor, color = 'var(--volt)' }) {
    const el = h('div', { class: 'ann ' + (side === 'r' ? 'r' : ''), html: `<div class="t">${title}</div>${desc ? `<div class="d">${desc}</div>` : ''}` }, this.layer);
    const path = s('path', { class: 'ann-line' }, this.svg);
    const dot = s('circle', { r: 3, class: 'ann-dot', style: `fill:${color}` }, this.svg);
    const ring = s('circle', { r: 7, fill: 'none', stroke: color, 'stroke-width': 1, opacity: 0.6 }, this.svg);
    const it = { el, path, dot, ring, fx, fy, side, anchor, k: 0 };
    this.items.push(it);
    return it;
  }
  /** k: 每个标注的可见度（数组或函数） */
  update(camera, gl, kfn) {
    this.svg._fit();
    const u = S.unit;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const k = typeof kfn === 'function' ? kfn(i, it) : kfn;
      const vis = k > 0.002;
      show(it.el, vis); show(it.path, vis); show(it.dot, vis); show(it.ring, vis);
      if (!vis) continue;
      it.anchor(this.v);
      const a = gl.project(this.v, camera, {});
      const lx = it.fx * S.W, ly = it.fy * S.H;
      const w = it.el.offsetWidth || 160;
      const ex = it.side === 'r' ? lx - 14 * u : lx + w + 14 * u;
      // 折线：标签 → 水平段 → 斜向锚点
      const mx = it.side === 'r' ? Math.min(ex - 24 * u, a.x + 60 * u) : Math.max(ex + 24 * u, a.x - 60 * u);
      const kk = ease.out(clamp(k));
      const tx = mx + (a.x - mx) * kk, ty = ly + (a.y - ly) * kk;
      attr(it.path, 'd', `M${ex.toFixed(1)},${ly.toFixed(1)} L${mx.toFixed(1)},${ly.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}`);
      attr(it.dot, 'cx', a.x.toFixed(1)); attr(it.dot, 'cy', a.y.toFixed(1));
      attr(it.ring, 'cx', a.x.toFixed(1)); attr(it.ring, 'cy', a.y.toFixed(1));
      css(it.dot, 'opacity', kk > 0.95 ? 1 : 0);
      css(it.ring, 'opacity', kk > 0.95 ? 0.6 : 0);
      css(it.path, 'opacity', k.toFixed(3));
      const x0 = it.side === 'r' ? lx - w - 0 : lx;
      css(it.el, 'transform', `translate3d(${(it.side === 'r' ? lx - w : lx).toFixed(1)}px,${(ly - 12 * u).toFixed(1)}px,0)`);
      css(it.el, 'opacity', Math.min(1, k * 1.4).toFixed(3));
      void x0;
    }
  }
  hide() { for (const it of this.items) { show(it.el, false); show(it.path, false); show(it.dot, false); show(it.ring, false); } }
}

/** 相机绕目标的球坐标摆放 */
export function orbit(cam, target, dist, yaw, pitch) {
  const cp = Math.cos(pitch);
  cam.position.set(target.x + Math.sin(yaw) * cp * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * cp * dist);
  cam.lookAt(target);
}

/** 可视宽度（用于“尺度尺”） */
export function viewWidth(cam, dist) {
  const hgt = 2 * dist * Math.tan((cam.fov * Math.PI) / 360);
  return hgt * (S.W / S.H);
}
export function fmtLen(mm) {
  if (mm < 1) return `${(mm * 1000).toFixed(0)} µm`;
  if (mm < 1000) return `${mm < 10 ? mm.toFixed(1) : mm.toFixed(0)} mm`;
  if (mm < 1e5) return `${(mm / 1000).toFixed(mm < 1e4 ? 2 : 1)} m`;
  return `${(mm / 1000).toFixed(0)} m`;
}

/** 关键帧相机路径：keys = [{p, t:[x,y,z], d, yaw, pitch}]，段内缓动插值 */
const _tv = new THREE.Vector3();
export function camPath(keys, p) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const a = keys[i], b = keys[i + 1] || a;
  const k = b === a ? 0 : ease.inOut(clamp((p - a.p) / (b.p - a.p)));
  const L = (x, y) => x + (y - x) * k;
  return {
    t: _tv.set(L(a.t[0], b.t[0]), L(a.t[1], b.t[1]), L(a.t[2], b.t[2])).clone(),
    d: L(a.d, b.d), yaw: L(a.yaw, b.yaw), pitch: L(a.pitch, b.pitch), k, i,
  };
}

/** 晶粒对在屏幕上的目标矩形（版图与三维对齐用） */
export function fpRect() {
  const aspect = 51.6 / 32.8;
  const hh = Math.min(0.62 * S.H, (0.46 * S.W) / aspect);
  return { cx: 0.52 * S.W, cy: 0.5 * S.H, h: hh, w: hh * aspect, pxmm: hh / 32.8 };
}
/** 让透视相机正俯视，使 y=planeY 平面上的晶粒对落在 fpRect 上 */
export function topDownCam(cam, planeY) {
  const R = fpRect();
  const tan = Math.tan((cam.fov * Math.PI) / 360);
  const d = (32.8 * S.H) / (R.h * 2 * tan);
  const offX = (R.cx - S.W / 2) / R.pxmm, offZ = (R.cy - S.H / 2) / R.pxmm;
  return { t: new THREE.Vector3(-offX, planeY, -offZ), d, yaw: 0, pitch: Math.PI / 2 - 0.0004 };
}

/** 正俯视某个世界点，使宽高为 worldD（z 方向）的区域在屏幕上占 frac 高度，并居于屏幕 (sx, sy) 比例处 */
export function topDownOn(cam, x, y, z, worldD, frac, sx = 0.5, sy = 0.5) {
  const tan = Math.tan((cam.fov * Math.PI) / 360);
  const d = worldD / (frac * 2 * tan);
  const pxmm = (frac * S.H) / worldD;
  const offX = ((sx - 0.5) * S.W) / pxmm, offZ = ((sy - 0.5) * S.H) / pxmm;
  return { t: [x - offX, y, z - offZ], d, yaw: 0, pitch: Math.PI / 2 - 0.0004 };
}

/** 篇章标题：描边大号章节数字 + 标题 + 一两句话 + 可选操作提示（海报式） */
export function titleBlock(parent, { num, cn, en, line = '', hint = '', style = '', cls = '' }) {
  return block(parent, `
    <div class="ttl-no" aria-hidden="true">${num}</div>
    <h2 class="ttl-cn">${lines([cn])}</h2>
    <div class="ttl-en">${en}</div>
    ${line ? `<p class="ttl-line">${line}</p>` : ''}
    ${hint ? `<div class="ttl-hint">${hint}</div>` : ''}`, style, 'ttl ' + cls);
}

/** 等轴测（正交）相机：方位角 az、仰角 el，取景高度 V */
export const ISO_EL = Math.atan(1 / Math.SQRT2);
export function isoCam(cam, target, V, az, el = ISO_EL, setOrthoFn) {
  const d = 40000;
  const ce = Math.cos(el);
  cam.position.set(target.x + Math.sin(az) * ce * d, target.y + Math.sin(el) * d, target.z + Math.cos(az) * ce * d);
  if (el > Math.PI / 2 - 0.01) cam.up.set(-Math.sin(az), 0, -Math.cos(az)); else cam.up.set(0, 1, 0);
  cam.lookAt(target);
  setOrthoFn(cam, V);
}
/** 正交俯视：让以 (x,z) 为中心、z 向长 worldD 的晶粒对落在 fpRect 上 */
export function orthoTopDown(x, y, z, worldD) {
  const R = fpRect();
  const V = worldD / (R.h / S.H);
  const pxw = S.H / V;
  return { t: new THREE.Vector3(x - (R.cx - S.W / 2) / pxw, y, z - (R.cy - S.H / 2) / pxw), V };
}

/** 接缝光束：从封装接缝两端投影后向屏幕上下延伸（开场与结尾共用） */
export function createBeam(parent) {
  const svg = pxSVG(parent);
  const glow = s('line', { stroke: 'rgba(184,242,74,0.16)', 'stroke-width': 14, 'stroke-linecap': 'round' }, svg);
  const core = s('line', { stroke: '#dcff9a', 'stroke-width': 1.4 }, svg);
  const pulses = [];
  for (let i = 0; i < 7; i++) pulses.push(s('line', { stroke: '#f4ffd8', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, svg));
  return {
    svg,
    update(A, B, ext, alpha, t) {
      svg._fit();
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const x1 = A.x - ux * ext, y1 = A.y - uy * ext, x2 = B.x + ux * ext, y2 = B.y + uy * ext;
      for (const ln of [glow, core]) { attr(ln, 'x1', x1.toFixed(1)); attr(ln, 'y1', y1.toFixed(1)); attr(ln, 'x2', x2.toFixed(1)); attr(ln, 'y2', y2.toFixed(1)); }
      css(svg, 'opacity', alpha.toFixed(3));
      const total = len + ext * 2;
      pulses.forEach((pl, i) => {
        const f = (t * 0.16 + i / pulses.length) % 1;
        const d0 = f * total, d1 = d0 + 30 * S.unit + 40 * S.unit * (i % 3);
        attr(pl, 'x1', (x1 + ux * d0).toFixed(1)); attr(pl, 'y1', (y1 + uy * d0).toFixed(1));
        attr(pl, 'x2', (x1 + ux * d1).toFixed(1)); attr(pl, 'y2', (y1 + uy * d1).toFixed(1));
        css(pl, 'opacity', (Math.sin(f * Math.PI) * 0.9).toFixed(3));
      });
    },
  };
}
