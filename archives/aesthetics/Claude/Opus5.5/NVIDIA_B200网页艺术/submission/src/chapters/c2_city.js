// 02 硅城 —— 纹样版图生长成夜城 → 俯冲进一栋楼：屋顶的纹样一层层放大，直到张量核心里的乘加单元
// → 退回城上空：一项任务切成 1024 块，分七波落进 148 个街区（群体运动）
import * as THREE from 'three';
import { S } from '../state.js';
import { h, s, seg, ease, env, lerp, css, show, clamp, attr, fract } from '../util.js';
import { beat, block, titleBlock, orbit, camPath, topDownCam, topDownOn, viewWidth } from '../kit.js';
import { LAYOUT } from '../floorplan.js';
import { WAVES } from '../scenes/city.js';

export const HI = 100;
const W = 1150, Hh = 1000;
export const CITY_OVER = { t: [0, 0, 1.5], d: 96, yaw: -0.32, pitch: 0.82 };
export const ZC = [430, 230]; // 放大中心：第一个分区里的张量核心

/** SM 屋顶的纹样（无文字）：四个分区、寄存器的细线、32 条通道的圆点、张量核心的菱形格、底部回纹 */
export function buildSM(parent) {
  const g = s('g', {}, parent);
  const P = (d, col, op = 0.7) => s('path', { d, fill: 'none', stroke: col, 'stroke-opacity': op, 'vector-effect': 'non-scaling-stroke', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, class: 'smp' }, g);
  const draws = [];
  s('rect', { x: 0, y: 0, width: W, height: Hh, fill: '#06080a', 'fill-opacity': 0.92 }, g);
  draws.push(P(`M4,4 H${W - 4} V${Hh - 4} H4 Z M14,14 H${W - 14} V${Hh - 14} H14 Z`, '#ece8df', 0.7));
  const lanes = [], cells = [];
  for (let q = 0; q < 4; q++) {
    const px = 30 + (q % 2) * 555, py = 40 + Math.floor(q / 2) * 360, pw = 535, ph = 340;
    draws.push(P(`M${px},${py} h${pw} v${ph} h${-pw} Z`, '#ece8df', 0.45));
    let hatch = `M${px + 15},${py + 15} h${pw - 30} v46 h${-(pw - 30)} Z `;
    for (let x = px + 22; x < px + pw - 15; x += 9) hatch += `M${x},${py + 18} v40 `;
    draws.push(P(hatch, '#7ce0ff', 0.5));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
      lanes.push({ el: s('circle', { cx: px + 34 + c * 29, cy: py + 100 + r * 30, r: 7, fill: '#b8f24a', 'fill-opacity': 0.1, stroke: '#b8f24a', 'stroke-opacity': 0.45, 'vector-effect': 'non-scaling-stroke' }, g), q, j: r * 8 + c });
    }
    const tx = px + 290, ty = py + 80;
    draws.push(P(`M${tx},${ty} h220 v220 h-220 Z M${tx + 8},${ty + 8} h204 v204 h-204 Z`, '#b8f24a', 0.75));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const cx = tx + 27.5 + j * 55, cy = ty + 27.5 + i * 55;
      const dm = s('path', { d: `M${cx},${cy - 22} L${cx + 22},${cy} L${cx},${cy + 22} L${cx - 22},${cy} Z`, fill: '#b8f24a', 'fill-opacity': 0.06, stroke: '#b8f24a', 'stroke-opacity': 0.55, 'vector-effect': 'non-scaling-stroke' }, g);
      const dots = [];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) dots.push(s('circle', { cx: cx - 7.5 + b * 5, cy: cy - 7.5 + a * 5, r: 1.2, fill: '#e6ffb8', 'fill-opacity': 0.2 }, g));
      cells.push({ dm, dots, q, k: i * 4 + j });
    }
    let mz = `M${px + 15},${py + ph - 34} `;
    for (let k = 0; k < 24; k++) mz += `h10 v${k % 2 ? 14 : -14} h10 v${k % 2 ? -14 : 14} `;
    draws.push(P(mz, '#ffb347', 0.55));
  }
  let key = 'M30,800 ';
  for (let k = 0; k < 27; k++) key += 'h20 v-30 h20 v20 h-10 v-10 h10 v20 h0 ';
  draws.push(P(key + `M30,840 H${W - 30} M30,880 H${W - 30}`, '#7ce0ff', 0.55));
  let zz = 'M30,930 ';
  for (let x = 30; x < W - 40; x += 24) zz += `L${x + 12},905 L${x + 24},930 `;
  draws.push(P(zz, '#b8f24a', 0.5));
  return { g, draws, lanes, cells };
}

export default {
  id: 'city', title: '硅城 · 计算单元', len: 3.0, jumpAt: 0.2,
  init(ctx) {
    const L = this.layer;
    h('div', { class: 'scrim left', style: 'opacity:.7' }, L);
    this.svg = s('svg', { class: 'px', 'aria-hidden': 'true' }, L);
    this.sm = buildSM(this.svg);
    this.t1 = titleBlock(L, {
      num: '02', cn: '硅城', en: 'SILICON CITY',
      line: '把版图立起来，是一座彻夜不眠的城。',
      style: 'left:6.4rem;top:13%;width:26rem',
    });
    this.t2 = block(L, `<p class="ttl-line" style="max-width:22rem">一项任务被切成上千块，从天而降，同时落进每一座街区。</p>`, 'left:6.4rem;bottom:12%;width:24rem');
    this.p0 = {}; this.p1 = {};
  },
  update(p, ctx) {
    const on = p >= 0 && p < 1;
    show(this.layer, on);
    if (!on) return;
    const C = ctx.scenes.city, cam = C.camera, t = S.time;
    const sm = LAYOUT.sms[HI];
    const hRoof = C.aH[HI];
    const td = topDownCam(cam, 0);
    const over = topDownOn(cam, sm.x, hRoof, sm.z, 14, 1, 0.58, 0.5);
    const dive = topDownOn(cam, sm.x, hRoof, sm.z, sm.d, 0.78, 0.6, 0.5);
    const keys = [
      { p: 0, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
      { p: 0.06, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
      { p: 0.2, t: [-4, 0.6, 3], d: 40, yaw: -0.7, pitch: 0.36 },
      { p: 0.31, t: [10, 0.6, -3], d: 24, yaw: -1.15, pitch: 0.26 },
      { p: 0.37, t: over.t, d: over.d, yaw: 0, pitch: over.pitch },
      { p: 0.44, t: dive.t, d: dive.d, yaw: 0, pitch: dive.pitch },
      { p: 0.62, t: dive.t, d: dive.d, yaw: 0, pitch: dive.pitch },
      { p: 0.69, t: over.t, d: over.d * 2.2, yaw: 0, pitch: over.pitch },
      { p: 0.77, t: [-9, 5, 3], d: 112, yaw: -0.36, pitch: 0.42 },
      { p: 0.9, t: [-9, 5, 3], d: 104, yaw: -0.24, pitch: 0.48 },
      { p: 0.98, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
      { p: 1, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
    ];
    const c = camPath(keys, p);
    const topDown = p < 0.06 || (p > 0.33 && p < 0.72) || p > 0.975;
    const grow = seg(p, 0.05, 0.22, ease.inOut) * (1 - seg(p, 0.92, 0.985, ease.inOut)); // 结尾：楼宇沉回版图
    const wave = lerp(-0.3, WAVES + 0.05, seg(p, 0.75, 0.9, ease.linear));
    const busy = seg(p, 0.73, 0.77) * (1 - seg(p, 0.92, 0.97));
    ctx.gl.use(C);
    cam.up.set(0, 1, 0);
    orbit(cam, c.t, c.d, c.yaw, c.pitch);
    if (topDown) { cam.up.set(0, 0, -1); cam.lookAt(c.t); }
    const ambient = 0.25 + 0.35 * env(p, 0.15, 0.22, 0.3, 0.36);
    C.update(t, {
      grow, wave, busy, idle: ambient, hi: HI, hiAmt: env(p, 0.3, 0.36, 0.66, 0.72),
      tiles: env(p, 0.73, 0.77, 0.91, 0.95), bridge: 0.35 + 0.65 * env(p, 0.08, 0.16, 0.9, 1.2), dieEmi: 0.35 - 0.2 * grow,
      fog: lerp(0.002, 0.011, env(p, 0.12, 0.2, 0.3, 0.37)), feedMode: 0, streams: 0, hbmGlow: 0,
    });
    const fade = env(p, 0.42, 0.47, 0.62, 0.67) * 0.85;
    ctx.gl.setPost({ bloom: 0.75, radius: 0.5, threshold: 0.95, exposure: 1.0, grain: 0.05, vig: 0.6, ca: 0.003, fade });
    // 承接第 1 章的纹样版图
    if (p < 0.12) ctx.fp.show({ draw: 1, cross: 1 - seg(p, 0, 0.05), alpha: 1 - seg(p, 0.04, 0.12), mask: 1 - seg(p, 0.0, 0.08) });
    if (p > 0.95) ctx.fp.show({ draw: 0, alpha: 1, mask: seg(p, 0.95, 0.995) });
    // 屋顶纹样：先与三维屋顶严丝合缝，再一层层放大到张量核心的乘加单元
    const smK = env(p, 0.4, 0.45, 0.64, 0.68);
    const zoom = Math.pow(9, seg(p, 0.49, 0.57, ease.inOut) * (1 - seg(p, 0.6, 0.66, ease.inOut)));
    let vw = viewWidth(cam, c.d);
    show(this.svg, smK > 0.002);
    if (smK > 0.002) {
      attr(this.svg, 'viewBox', `0 0 ${S.W} ${S.H}`);
      const [A, B] = C.roof(HI);
      const a = ctx.gl.project(A, cam, this.p0), b = ctx.gl.project(B, cam, this.p1);
      const sx = (b.x - a.x) / W, sy = (b.y - a.y) / Hh;
      attr(this.sm.g, 'transform', `translate(${a.x.toFixed(2)},${a.y.toFixed(2)}) scale(${sx.toFixed(5)},${sy.toFixed(5)}) translate(${ZC[0]},${ZC[1]}) scale(${zoom.toFixed(4)}) translate(${-ZC[0]},${-ZC[1]})`);
      css(this.svg, 'opacity', smK.toFixed(3));
      const dk = seg(p, 0.42, 0.5);
      this.sm.draws.forEach((el, i) => attr(el, 'stroke-dashoffset', (1 - seg(dk, (i / this.sm.draws.length) * 0.5, 0.5 + (i / this.sm.draws.length) * 0.5)).toFixed(4)));
      for (const ln of this.sm.lanes) {
        const f = fract(t * 1.6 - ln.j / 32 - ln.q * 0.25);
        attr(ln.el, 'fill-opacity', (f < 0.22 ? 0.85 : 0.08).toFixed(2));
      }
      const deep = seg(zoom, 2, 6);
      for (const ce of this.sm.cells) {
        const f = fract(t * 1.2 - ce.k / 16 - ce.q * 0.17);
        attr(ce.dm, 'fill-opacity', (f < 0.3 ? 0.55 - f : 0.06).toFixed(2));
        if (deep > 0.01 && ce.q === 0) ce.dots.forEach((d, i) => attr(d, 'fill-opacity', (0.15 + 0.85 * deep * (fract(t * 2.3 + i / 16 + ce.k * 0.07) < 0.35 ? 1 : 0.2)).toFixed(2)));
      }
      vw = (S.W * sm.w) / Math.max(1, (b.x - a.x) * zoom);
    }
    ctx.ruler(vw);
    beat(this.t1, p, 0.06, 0.34, 0.05, 'mask');
    beat(this.t2, p, 0.76, 0.98, 0.04, 'rise');
  },
};
