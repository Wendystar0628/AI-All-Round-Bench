// 03 河流 —— 从硅城退回到整颗封装：显存堆栈向外展开，露出中介层上的走线。
// 数据从 HBM 堆栈里沿 TSV 落到底层，沿中介层的走线流进晶粒的 HBM 接口，穿过 L2 到达每一个 SM，算完沿原路流回。
// 供不上时，晶粒上的 SM 暗着，只在边缘闪着等待的琥珀色；闸门一座座打开，晶粒成片亮起。可以亲手开关任一座堆栈。
import * as THREE from 'three';
import { S } from '../state.js';
import { h, seg, ease, env, lerp, css, show, clamp } from '../util.js';
import { beat, titleBlock, orbit, camPath, topDownCam, viewWidth } from '../kit.js';
import { HERO } from './c0_prologue.js';
import { PKG_H, SPREAD } from '../scenes/pkg.js';

// 叙事：先是涓涓细流（空等），再一座座开闸（满载）
const ORDER = [0, 4, 1, 5, 2, 6, 3, 7];
const narrFeed = (p, k) => lerp(0.05, 1, seg(p, 0.44 + ORDER.indexOf(k) * 0.03, 0.49 + ORDER.indexOf(k) * 0.03, ease.inOut));
export const RIVER_END = { t: [HERO.target.x, HERO.target.y, HERO.target.z], d: HERO.dist - 12, yaw: 0, pitch: HERO.pitch };

export default {
  id: 'river', title: '河流 · 数据流动', len: 2.8, jumpAt: 0.16,
  init(ctx) {
    const L = this.layer;
    h('div', { class: 'scrim left', style: 'opacity:.7' }, L);
    this.t1 = titleBlock(L, {
      num: '03', cn: '河流', en: 'THE RIVER',
      line: '数据从显存堆栈落下，沿中介层的走线流进晶粒，穿过缓存到达每一个计算单元，再沿原路流回。供不上时，晶粒暗着空等。',
      hint: '点击显存堆栈，打开或关上它的闸门',
      style: 'left:6.4rem;top:22%;width:26rem',
    });
    this.gates = [];
    for (let k = 0; k < 8; k++) {
      const b = h('button', { class: 'gate int', type: 'button', 'aria-label': `显存堆栈 ${k + 1}：打开或关上闸门`, 'aria-pressed': 'false' }, L);
      h('i', {}, b);
      b.addEventListener('click', () => {
        const u = ctx.ui;
        if (!u.gatesTouched) {
          u.gatesTouched = true;
          u.gates.forEach((g, i) => g.snap(clamp(this.cur[i])));
        }
        const g = u.gates[k];
        g.set(g.target > 0.5 ? 0.05 : 1);
      });
      this.gates.push(b);
    }
    this.v = new THREE.Vector3();
    this.cur = new Array(8).fill(0.05);
  },
  update(p, ctx) {
    const on = p >= 0 && p < 1;
    show(this.layer, on);
    if (!on) return;
    const P = ctx.scenes.pkg, cam = P.camera, t = S.time, u = ctx.ui;
    const td = topDownCam(cam, PKG_H.dieTop);
    const keys = [
      { p: 0, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
      { p: 0.05, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
      { p: 0.2, t: [-9, 6, 2], d: 150, yaw: -0.3, pitch: 0.86 },
      { p: 0.55, t: [-9, 6, 1], d: 142, yaw: -0.12, pitch: 0.9 },
      { p: 0.82, t: [-8, 6, 1], d: 146, yaw: 0.06, pitch: 0.82 },
      { p: 1, ...RIVER_END },
    ];
    const c = camPath(keys, p);
    ctx.gl.use(P);
    cam.up.set(0, 1, 0);
    orbit(cam, c.t, c.d, c.yaw + Math.sin(t * 0.08) * 0.015 * env(p, 0.2, 0.3, 0.8, 0.9), c.pitch);
    if (p < 0.055) { cam.up.set(0, 0, -1); cam.lookAt(c.t); }
    // 显存堆栈抬起并向外展开，露出中介层上的走线；结尾合拢回开场的样子
    const open = env(p, 0.06, 0.2, 0.84, 0.97);
    const feeds = this.cur;
    for (let k = 0; k < 8; k++) feeds[k] = u.gatesTouched ? lerp(narrFeed(p, k), u.gates[k].v, env(p, -1, 0, 0.84, 0.95)) : narrFeed(p, k);
    const river = env(p, 0.08, 0.18, 0.86, 0.96);
    P.root.position.y = 0;
    P.root.rotation.set(0, 0, 0);
    P.update(t, {
      explode: 0.3 * open, spread: open, cut: 200, flow: 1, seamGlow: 0.8 + 0.2 * river, halo: seg(p, 0.85, 1), motes: 0,
      river, smAct: river, feeds,
    });
    P.floor.material.uniforms.uAmt.value = seg(p, 0.1, 0.25);
    P.scene.environmentIntensity = lerp(0.1, 0.22, seg(p, 0.04, 0.2)) + 0.1 * seg(p, 0.85, 1);
    ctx.gl.setPost({ bloom: 0.7, radius: 0.5, threshold: 0.9, exposure: 1.0, grain: 0.045, vig: 0.6, ca: 0.0024, fade: 0 });
    ctx.ruler(viewWidth(cam, c.d));
    // 承接第 2 章：俯视对齐时先遮住晶粒外围，再随镜头拉远显出整颗封装
    if (p < 0.12) ctx.fp.show({ draw: 0, alpha: 1, mask: 1 - seg(p, 0.03, 0.1) });
    // 闸门：贴在每座展开的显存堆栈顶上
    const gk = env(p, 0.18, 0.24, 0.8, 0.86);
    const e = P.pkg.explode, sp = P.pkg.spread;
    this.gates.forEach((b, k) => {
      show(b, gk > 0.01);
      if (gk <= 0.01) return;
      const hp = P.pkg.parts.hbm[k];
      this.v.set(hp.x, PKG_H.dieBot + 11 * e + 0.8 + 9.2 * e, hp.z + hp.side * SPREAD * sp);
      P.pkg.group.localToWorld(this.v);
      const a = ctx.gl.project(this.v, cam, {});
      css(b, 'transform', `translate3d(${a.x.toFixed(1)}px,${a.y.toFixed(1)}px,0)`);
      css(b, 'opacity', gk.toFixed(3));
      b.style.setProperty('--f', feeds[k].toFixed(3));
      const opened = (u.gatesTouched ? u.gates[k].target : feeds[k]) > 0.5;
      if (b._o !== opened) { b._o = opened; b.setAttribute('aria-pressed', opened ? 'true' : 'false'); }
    });
    beat(this.t1, p, 0.12, 0.8, 0.05, 'mask');
  },
};
