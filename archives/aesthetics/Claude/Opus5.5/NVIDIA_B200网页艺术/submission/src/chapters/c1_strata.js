// 01 地层 · 一颗封装 —— 推近 → 一层层拆开 → 剖开（光环可拖）→ 俯视：版图化作纹样，数据跨过接缝
import * as THREE from 'three';
import { S } from '../state.js';
import { h, seg, ease, env, lerp, css, show, clamp, attr } from '../util.js';
import { beat, block, titleBlock, orbit, camPath, topDownCam, viewWidth } from '../kit.js';
import { C0_END } from './c0_prologue.js';
import { PKG_H, IP_HD } from '../scenes/pkg.js';
import { pkgTool } from '../pkgctl.js';

const CUT_MIN = -IP_HD + 3, CUT_MAX = 42;
const cutZ = (c01) => lerp(CUT_MIN, CUT_MAX, c01);
const narrExplode = (p) => Math.max(seg(p, 0.2, 0.36) - seg(p, 0.46, 0.56) * 0.62, 0) * (1 - seg(p, 0.72, 0.8));
const narrCut = (p) => lerp(1, 0.52, seg(p, 0.5, 0.62, ease.inOut)) + (1 - 0.52) * seg(p, 0.72, 0.79);

export default {
  id: 'package', title: '地层 · 一颗封装', len: 3.0, jumpAt: 0.12,
  init(ctx) {
    const L = this.layer;
    h('div', { class: 'scrim left', style: 'opacity:.75' }, L);
    this.t1 = titleBlock(L, {
      num: '01', cn: '地层', en: 'STRATA',
      line: '两颗晶粒、八座显存，坐在一层埋着硅桥的中介层上；层与层之间，是成千上万个焊点。',
      hint: '拖动模型：上下拆开，左右旋转 · 拖动光环，剖开它',
      style: 'left:6.4rem;top:30%;width:27rem',
    });
    this.t2 = block(L, `<p class="ttl-line" style="max-width:19rem">俯视晶粒，版图是一幅纹样。</p>`, 'left:6.4rem;bottom:12%;width:22rem');
    // 剖切光环：拖动它沿着封装前后移动剖切面
    const hd = (this.handle = h('button', { class: 'cut-handle int', type: 'button', 'aria-label': '剖切光环：拖动或用左右方向键移动剖切面' }, L));
    h('i', {}, hd);
    let drag = null;
    const V0 = new THREE.Vector3(), V1 = new THREE.Vector3();
    const dirPx = () => {
      const P = ctx.scenes.pkg, cz = cutZ(ctx.ui.cut.target);
      V0.set(0, 26, cz); V1.set(0, 26, cz + 10);
      P.pkg.group.localToWorld(V0); P.pkg.group.localToWorld(V1);
      const a = ctx.gl.project(V0, P.camera, {}), b = ctx.gl.project(V1, P.camera, {});
      return [b.x - a.x, b.y - a.y];
    };
    hd.addEventListener('pointerdown', (e) => {
      if (S.exportMode) return;
      const d = dirPx();
      drag = { x: e.clientX, y: e.clientY, c: ctx.ui.cut.target, d };
      try { hd.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件 */ }
      e.preventDefault();
    });
    hd.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [dx, dy] = drag.d, l2 = dx * dx + dy * dy || 1;
      const mm = (((e.clientX - drag.x) * dx + (e.clientY - drag.y) * dy) / l2) * 10;
      ctx.ui.cutTouched = true;
      ctx.ui.cut.set(clamp(drag.c + mm / (CUT_MAX - CUT_MIN), 0, 1));
    });
    const up = () => { drag = null; };
    hd.addEventListener('pointerup', up); hd.addEventListener('pointercancel', up);
    hd.addEventListener('keydown', (e) => {
      const k = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
      if (!k) return;
      ctx.ui.cutTouched = true;
      ctx.ui.cut.set(clamp(ctx.ui.cut.target + k * 0.06, 0, 1));
      e.preventDefault();
    });
    this.tool = pkgTool(ctx);
    this.hv = new THREE.Vector3();
  },
  update(p, ctx) {
    const on = p >= 0 && p < 1;
    show(this.layer, on);
    if (!on) return;
    const P = ctx.scenes.pkg, u = ctx.ui, t = S.time;
    // 拆开与剖切：用户动过就用用户的（篇章两端平滑回到叙事值）
    const w = env(p, 0.0, 0.04, 0.7, 0.78);
    const ex = lerp(narrExplode(p), u.explodeTouched ? u.explode.v : narrExplode(p), u.explodeTouched ? w : 0);
    const wc = env(p, 0.17, 0.23, 0.7, 0.76);
    const c01 = lerp(narrCut(p), u.cutTouched ? u.cut.v : narrCut(p), wc);
    const cz = cutZ(c01);
    // 相机
    const td = topDownCam(P.camera, PKG_H.dieTop);
    const keys = [
      { p: 0, t: [C0_END.target.x, C0_END.target.y, C0_END.target.z], d: C0_END.dist, yaw: C0_END.yaw, pitch: C0_END.pitch },
      { p: 0.18, t: [-16, 1, 0], d: 168, yaw: -0.42, pitch: 0.52 },
      { p: 0.34, t: [-18, 6, 0], d: 182, yaw: -0.62, pitch: 0.26 },
      { p: 0.48, t: [-18, 6, 0], d: 176, yaw: -0.5, pitch: 0.3 },
      { p: 0.6, t: [-14, 4, 6], d: 146, yaw: -0.3, pitch: 0.2 },
      { p: 0.72, t: [-14, 4, 6], d: 150, yaw: -0.24, pitch: 0.24 },
      { p: 0.88, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
      { p: 1, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
    ];
    const c = camPath(keys, p);
    const free = 1 - seg(p, 0.7, 0.86);
    ctx.gl.use(P);
    P.camera.up.set(0, 1, 0);
    orbit(P.camera, c.t, c.d, c.yaw + u.yaw.v * free, c.pitch);
    if (p > 0.86) { P.camera.up.set(0, 0, -1); P.camera.lookAt(c.t); }
    P.root.position.y = 0;
    P.update(t, { explode: ex, cut: cz, flow: 0.6 + 0.4 * seg(p, 0.8, 0.95), seamGlow: 0.7 + 0.3 * seg(p, 0.85, 1), halo: 1 - seg(p, 0.12, 0.3), motes: 0 });
    P.floor.material.uniforms.uAmt.value = 1 - seg(p, 0.75, 0.88);
    P.scene.environmentIntensity = lerp(lerp(0.32, 0.18, seg(p, 0.2, 0.34)), 0.1, seg(p, 0.76, 0.88));
    ctx.gl.setPost({ bloom: 0.55, radius: 0.45, threshold: 1.25, exposure: 1.05, grain: 0.045, vig: 0.55, ca: 0.0024, fade: 0 });
    ctx.ruler(viewWidth(P.camera, c.d));
    if (p < 0.72) ctx.tool(this.tool);
    // 版图纹样（俯视对齐后从接缝向两侧绣出）
    const fpk = seg(p, 0.86, 0.995);
    if (fpk > 0) ctx.fp.show({ draw: fpk, cross: seg(p, 0.93, 1), core: 0, alpha: 1, mask: seg(p, 0.9, 0.99) });
    // 剖切光环
    const hk = env(p, 0.2, 0.25, 0.7, 0.75);
    show(this.handle, hk > 0.01);
    if (hk > 0.01) {
      this.hv.set(0, 26, cz); P.pkg.group.localToWorld(this.hv);
      const a = ctx.gl.project(this.hv, P.camera, {});
      css(this.handle, 'transform', `translate3d(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px,0)`);
      css(this.handle, 'opacity', hk.toFixed(3));
    }
    beat(this.t1, p, 0.0, 0.74, 0.05, 'mask');
    beat(this.t2, p, 0.9, 1.0, 0.03, 'rise');
  },
};
