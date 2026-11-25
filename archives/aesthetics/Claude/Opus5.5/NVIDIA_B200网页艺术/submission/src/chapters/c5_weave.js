// 05 经纬 —— 从封装俯冲到晶粒上的一个 SM：它的纹样与三维晶粒严丝合缝，再放大到张量核心的菱形格；
// 菱形格的经线与纬线向外展开、铺满画面，交织处一格格累加出乘积；一句话被拆成丝线，穿过一层层运算，织成回答；
// 最后经纬收回张量核心，镜头退回整颗晶粒，交给下一章的那颗 GPU。
import * as THREE from 'three';
import { S } from '../state.js';
import { h, s, seg, ease, env, lerp, css, show, clamp, attr, fract } from '../util.js';
import { beat, titleBlock, orbit, camPath, topDownCam, topDownOn, viewWidth } from '../kit.js';
import { LAYOUT } from '../floorplan.js';
import { PKG_H } from '../scenes/pkg.js';
import { HERO } from './c0_prologue.js';
import { buildSM, ZC } from './c2_city.js';

const SMI = 30;                // 俯冲进入的 SM（左晶粒）
const W = 1150, Hh = 1000;
const IN = '把一句话变成光';
const OUT = '光穿过经纬，织成回答';
const STRIPS = 6;

function glyphs(parent, text, style) {
  const box = h('div', { class: 'gly', style, 'aria-hidden': 'true' }, parent);
  const chars = [...text].map((ch) => {
    const g = h('span', { class: 'g' }, box);
    h('span', { class: 'g0', text: ch }, g);
    const strips = [];
    for (let i = 0; i < STRIPS; i++) {
      const sp = h('span', { class: 'gs', text: ch }, g);
      sp.style.clipPath = `inset(${(i * 100) / STRIPS}% 0 ${100 - ((i + 1) * 100) / STRIPS}% 0)`;
      strips.push(sp);
    }
    return { g, strips };
  });
  return { box, chars };
}

export default {
  id: 'weave', title: '经纬 · 乘加与推理', len: 3.2, jumpAt: 0.3,
  init(ctx) {
    const L = this.layer;
    this.svg = s('svg', { class: 'px', 'aria-hidden': 'true' }, L);
    this.sm = buildSM(this.svg);
    h('div', { class: 'scrim left', style: 'opacity:.8' }, L);
    this.t1 = titleBlock(L, {
      num: '05', cn: '经纬', en: 'WARP & WEFT',
      line: '推近一个张量核心，乘与加在里面纵横交织；一句话被拆成丝线，穿过一层层运算，织成回答。',
      hint: '移动光标，拨动经纬',
      style: 'left:6.4rem;top:18%;width:24rem',
    });
    this.inG = glyphs(L, IN, 'left:7%;top:58%');
    this.outG = glyphs(L, OUT, 'right:7%;top:58%');
    this.tool = { label: '经纬：移动光标拨动丝线', hover: () => { ctx.ui.pluck.snap(1); ctx.ui.pluck.set(0); } };
    this.p0 = {}; this.p1 = {}; this.A = new THREE.Vector3(); this.B = new THREE.Vector3();
  },
  update(p, ctx) {
    const on = p >= 0 && p < 1;
    show(this.layer, on);
    if (!on) return;
    const P = ctx.scenes.pkg, cam = P.camera, t = S.time, u = ctx.ui;
    const sm = LAYOUT.sms[SMI];
    const yT = PKG_H.dieTop;
    const over = topDownOn(cam, sm.x, yT, sm.z, 16, 1, 0.58, 0.5);
    const dive = topDownOn(cam, sm.x, yT, sm.z, sm.d, 0.78, 0.6, 0.5);
    const td = topDownCam(cam, yT);
    const keys = [
      { p: 0, t: [HERO.target.x, HERO.target.y + 1, HERO.target.z], d: HERO.dist - 20, yaw: 0, pitch: HERO.pitch + 0.02 },
      { p: 0.07, t: [sm.x * 0.6, yT, sm.z * 0.6], d: 92, yaw: 0, pitch: 1.1 },
      { p: 0.12, t: over.t, d: over.d, yaw: 0, pitch: over.pitch },
      { p: 0.17, t: dive.t, d: dive.d, yaw: 0, pitch: dive.pitch },
      { p: 0.88, t: dive.t, d: dive.d, yaw: 0, pitch: dive.pitch },
      { p: 0.93, t: over.t, d: over.d * 1.6, yaw: 0, pitch: over.pitch },
      { p: 0.99, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
      { p: 1, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
    ];
    const c = camPath(keys, p);
    ctx.gl.use(P);
    cam.up.set(0, 1, 0);
    orbit(cam, c.t, c.d, c.yaw, c.pitch);
    if (p > 0.1) { cam.up.set(0, 0, -1); cam.lookAt(c.t); }
    P.root.position.y = 0; P.root.rotation.set(0, 0, 0);
    // 张量核心的纹样：先贴合晶粒上那个 SM，再放大到菱形格
    const smK = env(p, 0.13, 0.18, 0.86, 0.91);
    const zoom = Math.pow(9, seg(p, 0.19, 0.27, ease.inOut) * (1 - seg(p, 0.8, 0.87, ease.inOut)));
    const unfold = seg(p, 0.27, 0.38, ease.inOut) * (1 - seg(p, 0.72, 0.8, ease.inOut));
    let center = [S.W / 2, S.H / 2], cell = 60, vw = viewWidth(cam, c.d);
    show(this.svg, smK > 0.002);
    if (smK > 0.002) {
      attr(this.svg, 'viewBox', `0 0 ${S.W} ${S.H}`);
      this.A.set(sm.x - sm.w / 2, yT, sm.z - sm.d / 2); this.B.set(sm.x + sm.w / 2, yT, sm.z + sm.d / 2);
      const a = ctx.gl.project(this.A, cam, this.p0), b = ctx.gl.project(this.B, cam, this.p1);
      const sx = (b.x - a.x) / W, sy = (b.y - a.y) / Hh;
      attr(this.sm.g, 'transform', `translate(${a.x.toFixed(2)},${a.y.toFixed(2)}) scale(${sx.toFixed(5)},${sy.toFixed(5)}) translate(${ZC[0]},${ZC[1]}) scale(${zoom.toFixed(4)}) translate(${-ZC[0]},${-ZC[1]})`);
      css(this.svg, 'opacity', (smK * (1 - unfold * 0.85)).toFixed(3));
      const dk = seg(p, 0.13, 0.2);
      this.sm.draws.forEach((el, i) => attr(el, 'stroke-dashoffset', (1 - seg(dk, (i / this.sm.draws.length) * 0.5, 0.5 + (i / this.sm.draws.length) * 0.5)).toFixed(4)));
      for (const ln of this.sm.lanes) attr(ln.el, 'fill-opacity', (fract(t * 1.6 - ln.j / 32 - ln.q * 0.25) < 0.22 ? 0.85 : 0.08).toFixed(2));
      const deep = seg(zoom, 2, 6);
      for (const ce of this.sm.cells) {
        const f = fract(t * 1.2 - ce.k / 16 - ce.q * 0.17);
        attr(ce.dm, 'fill-opacity', (f < 0.3 ? 0.55 - f : 0.06).toFixed(2));
        if (deep > 0.01 && ce.q === 0) ce.dots.forEach((d, i) => attr(d, 'fill-opacity', (0.15 + 0.85 * deep * (fract(t * 2.3 + i / 16 + ce.k * 0.07) < 0.35 ? 1 : 0.2)).toFixed(2)));
      }
      center = [a.x + ZC[0] * sx, a.y + ZC[1] * sy];
      cell = 55 * sx * zoom;
      vw = (S.W * sm.w) / Math.max(1, (b.x - a.x) * zoom);
    }
    // 经纬：从菱形格（4×4）向外展开，铺满画面；推理的光穿过一层层“层”
    // 展开时镜头随之退远：中心那 4×4 的菱形格缩小，经纬向四周铺开成一整幅织机
    const cellU = lerp(cell, 34 * S.unit, ease.inOut(unfold));
    const Rmax = Math.max(S.W, S.H) / Math.max(cellU, 1) + 2;
    const R = lerp(2.05, Rmax, unfold);
    const pass = lerp(-0.1, 1.1, seg(p, 0.5, 0.74, ease.linear)) * S.W;
    const toolOn = p > 0.3 && p < 0.78;
    if (toolOn) ctx.tool(this.tool);
    const pl = toolOn && !S.exportMode ? clamp(u.pluck.v) : 0;
    P.update(t, { explode: 0, cut: 200, flow: 1 - smK, seamGlow: 1, halo: 1 - seg(p, 0.02, 0.1), motes: 0, river: 0, smAct: smK * 0.6 * (1 - seg(zoom, 1.2, 2)), feeds: [1, 1, 1, 1, 1, 1, 1, 1], loom: true });
    P.loom.update(t, {
      amt: smK > 0.01 ? seg(zoom, 4, 9) : 0, center, cell: cellU, R, k: seg(p, 0.3, 0.5), pass, bands: env(p, 0.5, 0.54, 0.72, 0.76),
      dim: 0.4 + 0.55 * unfold, mouse: [S.pointer.x, S.pointer.y, pl],
    });
    P.floor.material.uniforms.uAmt.value = 1 - seg(p, 0, 0.08);
    P.scene.environmentIntensity = lerp(0.32, 0.1, seg(p, 0, 0.12));
    const fade = 0;
    ctx.gl.setPost({ bloom: 0.6, radius: 0.45, threshold: 0.9, exposure: 1.05, grain: 0.045, vig: 0.6, ca: 0.0024, fade });
    ctx.ruler(vw);
    if (p > 0.95) ctx.fp.show({ draw: 0, alpha: 1, mask: seg(p, 0.95, 0.995) });
    // 一句话被拆成丝线，穿过经纬
    css(this.inG.box, 'opacity', env(p, 0.44, 0.49, 0.7, 0.76).toFixed(3));
    this.inG.chars.forEach((ch, j) => ch.strips.forEach((sp, i) => {
      const st = 0.5 + j * 0.01 + i * 0.004;
      const k = seg(p, st, st + 0.1, ease.in);
      css(sp, 'transform', `translate3d(${(k * S.W * 0.55).toFixed(1)}px,${((i - STRIPS / 2) * k * 9 * S.unit).toFixed(1)}px,0) scaleX(${(1 + k * 3).toFixed(2)})`);
      css(sp, 'opacity', (1 - k).toFixed(3));
    }));
    css(this.outG.box, 'opacity', env(p, 0.66, 0.71, 0.78, 0.82).toFixed(3));
    this.outG.chars.forEach((ch, j) => ch.strips.forEach((sp, i) => {
      const st = 0.66 + j * 0.006 + i * 0.003;
      const k = seg(p, st, st + 0.07, ease.out);
      css(sp, 'transform', `translate3d(${(-(1 - k) * S.W * 0.4).toFixed(1)}px,${((i - STRIPS / 2) * (1 - k) * 9 * S.unit).toFixed(1)}px,0) scaleX(${(1 + (1 - k) * 3).toFixed(2)})`);
      css(sp, 'opacity', k.toFixed(3));
    }));
    beat(this.t1, p, 0.2, 0.48, 0.04, 'mask');
  },
};
