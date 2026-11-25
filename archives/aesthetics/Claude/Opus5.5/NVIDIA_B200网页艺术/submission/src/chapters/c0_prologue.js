// 00 序章 · 接缝 —— 开场构图：一道竖直的光把画面与巨字“B2 | 00”一分为二，光的来处是两颗晶粒之间的接缝
import * as THREE from 'three';
import { S } from '../state.js';
import { h, s, seg, ease, lerp, attr, css, show, clamp } from '../util.js';
import { beat, lines, block, orbit, viewWidth, createBeam } from '../kit.js';
import { pkgTool, userExplode } from '../pkgctl.js';

const V = new THREE.Vector3();
export const HERO = { target: new THREE.Vector3(0, -9, 2), dist: 205, yaw: 0, pitch: 0.34 };
export const C0_END = { target: new THREE.Vector3(0, 2, 0), dist: 128, yaw: -0.55, pitch: 0.72 };

export function heroCam(cam, p, t, yawOff = 0) {
  const k = seg(p, 0.08, 1, ease.inOut);
  const ky = seg(p, 0.35, 1, ease.inOut);
  const tg = V.copy(HERO.target).lerp(C0_END.target, k);
  const dist = lerp(HERO.dist, C0_END.dist, k) + Math.sin(t * 0.4) * 1.5 * (1 - k);
  const pitch = lerp(HERO.pitch, C0_END.pitch, k) + Math.sin(t * 0.27) * 0.012 * (1 - k);
  const yaw = lerp(HERO.yaw, C0_END.yaw, ky) + yawOff;
  orbit(cam, tg, dist, yaw, pitch);
  return dist;
}

/** 巨型描边字 B2 | 00（开场与结尾共用） */
export function bigType(parent) {
  const big = s('svg', { class: 'full', viewBox: '0 0 1920 1080', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' }, parent);
  const mk = (txt, anchor) => s('text', {
    x: 960, y: 690, 'text-anchor': anchor, class: 'svg-disp',
    style: `font-size:520px;font-variation-settings:'wdth' 112,'wght' 180;letter-spacing:-6px;fill:none;stroke:rgba(236,232,223,0.22);stroke-width:1.2`,
    text: txt,
  }, big);
  const b2 = mk('B2', 'end'), o0 = mk('00', 'start');
  return {
    big,
    set(alpha, open) {
      css(big, 'opacity', alpha.toFixed(3));
      attr(b2, 'transform', `translate(${(-30 - open * 520).toFixed(1)},0)`);
      attr(o0, 'transform', `translate(${(30 + open * 520).toFixed(1)},0)`);
      const fv = `'wdth' ${(112 - open * 40).toFixed(0)},'wght' ${(180 - open * 80).toFixed(0)}`;
      css(b2, 'fontVariationSettings', fv); css(o0, 'fontVariationSettings', fv);
    },
  };
}

export default {
  id: 'prologue', title: '序章 · 接缝', len: 1.6,
  init(ctx) {
    const L = this.layer;
    this.type = bigType(L);
    this.beam = createBeam(L);
    h('div', { class: 'scrim bottom' }, L);
    this.heroT = block(L, `
      <div class="kicker"><b>NVIDIA B200</b></div>
      <h1 class="h1" style="margin-top:1.4rem">接缝</h1>
      <div class="en" style="font-size:1.5rem;letter-spacing:0.5em;margin-top:1rem;color:var(--bone2)">THE SEAM</div>
      <p class="ttl-line" style="margin-top:1.6rem;max-width:30rem">两块硅，被一道光缝成一颗 GPU。</p>`,
      'left:6.4rem;bottom:6.6rem;width:36rem');
    this.hint = block(L, `<div class="hint">滚动，沿着接缝进入 <span style="color:var(--volt)">↓</span></div>
      <div class="hint" style="margin-top:.5rem">拖动芯片，可以把它拆开</div>`,
      'left:calc(50% + 2.2rem);bottom:2.6rem;width:24rem');
    this.cap = block(L, `<p class="ttl-line" style="max-width:24rem">这道光的源头，是两颗晶粒之间不到半毫米的缝。</p>`, 'right:7.2rem;bottom:9%;width:26rem;text-align:right');
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3();
    this.tool = pkgTool(ctx);
  },
  update(p, ctx) {
    const on = p > -0.5 && p < 1.05;
    show(this.layer, on);
    if (!on) return;
    const t = S.time, u = ctx.ui;
    const P = ctx.scenes.pkg;
    if (p >= -0.5 && p < 1) {
      ctx.gl.use(P);
      P.camera.up.set(0, 1, 0);
      const dist = heroCam(P.camera, Math.max(0, p), t, u.yaw.v);
      P.root.position.y = Math.sin(t * 0.6) * 0.5 * (1 - seg(p, 0, 0.6));
      P.root.rotation.set(0, 0, 0);
      P.update(t, { explode: userExplode(u, 0), cut: 200, flow: 1, seamGlow: 1, halo: 1, motes: 1 - seg(p, 0.3, 0.9) });
      P.floor.material.uniforms.uAmt.value = 1;
      P.scene.environmentIntensity = 0.32;
      ctx.gl.setPost({ bloom: 0.6, radius: 0.5, threshold: 1.0, exposure: 1.05, grain: 0.05, vig: 0.62, ca: 0.0028, fade: 0 });
      ctx.ruler(viewWidth(P.camera, dist));
      if (p < 0.7) ctx.tool(this.tool);
    }
    // 巨字向两侧分开
    const open = seg(p, 0.02, 0.6, ease.inOut);
    this.type.set((1 - seg(p, 0.05, 0.38)) * ease.out(clamp(t / 2.2)), open);
    // 光束：从接缝两端投影后向屏幕上下延伸
    if (p < 1) {
      const pk = P.pkg;
      pk.anchor('seamTop', this.a); pk.anchor('seamBot', this.b);
      pk.group.localToWorld(this.a); pk.group.localToWorld(this.b);
      const A = ctx.gl.project(this.a, P.camera, {}), B = ctx.gl.project(this.b, P.camera, {});
      const ext = (1 - seg(p, 0.35, 0.95, ease.inOut)) * S.H * 1.4 * ease.out(clamp(t / 1.6));
      this.beam.update(A, B, ext, 1 - seg(p, 0.75, 0.98), t);
    }
    const ti = ease.out(clamp((t - 0.3) / 1.4));
    const k1 = beat(this.heroT, p, -1, 0.42, 0.2, 'rise');
    css(this.heroT, 'opacity', (k1 * ti).toFixed(3));
    beat(this.hint, p, -1, 0.15, 0.12, 'none');
    beat(this.cap, p, 0.42, 0.98, 0.12, 'rise');
  },
};
