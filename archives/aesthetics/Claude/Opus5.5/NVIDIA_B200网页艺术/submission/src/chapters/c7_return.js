// 07 归来 —— 镜头从机房一路收回：机柜 → 抽出的托盘 → 一颗 GPU 的正上方 → 开场的那颗封装。
// 停在开场的构图上结束：接缝的光重新贯穿画面。没有总结，没有说明。
import * as THREE from 'three';
import { S } from '../state.js';
import { seg, ease, env, lerp, css, show, clamp } from '../util.js';
import { orbit, camPath, topDownCam, orthoTopDown, viewWidth, createBeam, ISO_EL } from '../kit.js';
import { HERO, bigType } from './c0_prologue.js';
import { isoPath, applyIso, PULL } from './c6_scale.js';
import { PKG_H } from '../scenes/pkg.js';
import { pkgTool, userExplode } from '../pkgctl.js';

const Q = Math.PI / 4, TOP = Math.PI / 2 - 0.0001;
const SW = 0.55;

export default {
  id: 'return', title: '归来 · 回到那道缝', len: 2.4, jumpAt: 0.92,
  init(ctx) {
    const L = this.layer;
    this.type = bigType(L);
    this.beam = createBeam(L);
    this.tool = pkgTool(ctx);
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.g = new THREE.Vector3(); this.sc = new THREE.Vector3();
  },
  update(p, ctx) {
    const on = p >= 0 && p <= 1.0001;
    show(this.layer, on);
    if (!on) return;
    const t = S.time, u = ctx.ui;
    if (p < SW) {
      const Rk = ctx.scenes.rack, cam = Rk.ortho;
      const rx = Rk.rackX, hb = Rk.heroBase;
      const pull = PULL * seg(p, 0.24, 0.36, ease.inOut);
      Rk.update(t, {
        pull, nvlink: 0.3, spineLit: 0.5, power: 0.3, cool: 0.5, lit: 1, hallLit: 1 - seg(p, 0.2, 0.4) * 0.6, heroGlow: seg(p, 0.36, 0.5) * 0.15,
        pool: 0, rise: 1, fog: 0, floorFog: 0.0000012, cold: 1 - seg(p, 0.36, 0.46), overhead: p < 0.12 ? 1 : 0,
      });
      Rk.rack.updateMatrixWorld(true);
      const pk = Rk.hero.pkgs[0];
      pk.group.getWorldScale(this.sc);
      pk.group.localToWorld(this.g.set(0, PKG_H.dieTop, 0));
      const td = orthoTopDown(this.g.x, this.g.y, this.g.z, 32.8 * this.sc.x);
      const keys = [
        { p: 0, t: [0, 0, 3200], V: 30000, az: Q + Math.PI, el: ISO_EL },
        { p: 0.22, t: [rx, 1100, 0], V: 3600, az: Q, el: ISO_EL },
        { p: 0.36, t: [rx + hb.x, hb.y + 20, hb.z + PULL], V: 1250, az: Q, el: ISO_EL },
        { p: 0.5, t: [td.t.x, td.t.y, td.t.z], V: td.V, az: 0, el: TOP },
        { p: SW, t: [td.t.x, td.t.y, td.t.z], V: td.V, az: 0, el: TOP },
      ];
      const c = isoPath(keys, p);
      const uw = 1 - seg(p, 0, 0.25);
      applyIso(cam, c, u.isoAz.v * (Math.PI / 2) * uw, Math.pow(u.isoZoom.v, uw), 0.1 * (1 - seg(p, 0.3, 0.45)));
      ctx.gl.use({ scene: Rk.scene, camera: cam });
      ctx.gl.setPost({ bloom: 0.6, radius: 0.45, threshold: 0.95, exposure: lerp(1.1, 0.62, seg(p, 0.4, 0.52)), grain: 0.04, vig: 0.55, ca: 0.0018, fade: 0, edge: 0.55 * (1 - seg(p, 0.4, 0.5)), flat: 0 });
      ctx.ruler(c.V * (S.W / S.H));
      if (p > 0.44) ctx.fp.show({ draw: 0, alpha: 1, mask: seg(p, 0.44, 0.52) });
      show(this.beam.svg, false);
      this.type.set(0, 0);
    } else {
      const P = ctx.scenes.pkg, cam = P.camera;
      const td = topDownCam(cam, PKG_H.dieTop);
      const keys = [
        { p: SW, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
        { p: 0.6, t: [td.t.x, td.t.y, td.t.z], d: td.d, yaw: 0, pitch: td.pitch },
        { p: 0.9, t: [HERO.target.x, HERO.target.y, HERO.target.z], d: HERO.dist, yaw: 0, pitch: HERO.pitch },
        { p: 1, t: [HERO.target.x, HERO.target.y, HERO.target.z], d: HERO.dist, yaw: 0, pitch: HERO.pitch },
      ];
      const c = camPath(keys, p);
      ctx.gl.use(P);
      cam.up.set(0, 1, 0);
      const yo = u.yaw.v * seg(p, 0.8, 0.95);
      orbit(cam, c.t, c.d + Math.sin(t * 0.4) * 1.5 * seg(p, 0.9, 1), c.yaw + yo, c.pitch);
      if (p < 0.6) { cam.up.set(0, 0, -1); cam.lookAt(c.t); }
      P.root.position.y = Math.sin(t * 0.6) * 0.5 * seg(p, 0.85, 1);
      P.root.rotation.set(0, 0, 0);
      P.update(t, { explode: userExplode(u, 0) * seg(p, 0.75, 0.9), cut: 200, flow: 1, seamGlow: 1, halo: seg(p, 0.65, 0.9), motes: seg(p, 0.8, 1) });
      P.floor.material.uniforms.uAmt.value = seg(p, 0.65, 0.9);
      P.scene.environmentIntensity = lerp(0.1, 0.32, seg(p, 0.6, 0.85));
      ctx.gl.setPost({ bloom: 0.6, radius: 0.5, threshold: 1.0, exposure: 1.05, grain: 0.05, vig: 0.62, ca: 0.0028, fade: 0 });
      ctx.ruler(viewWidth(cam, c.d));
      if (p < 0.66) ctx.fp.show({ draw: 0, alpha: 1, mask: 1 - seg(p, 0.57, 0.65) });
      if (p > 0.88) ctx.tool(this.tool);
      // 接缝的光重新贯穿画面；巨字回到开场的位置
      const pk = P.pkg;
      pk.anchor('seamTop', this.a); pk.anchor('seamBot', this.b);
      pk.group.localToWorld(this.a); pk.group.localToWorld(this.b);
      const A = ctx.gl.project(this.a, cam, {}), B = ctx.gl.project(this.b, cam, {});
      show(this.beam.svg, true);
      this.beam.update(A, B, seg(p, 0.82, 0.97, ease.out) * S.H * 1.4, seg(p, 0.8, 0.88), t);
      this.type.set(seg(p, 0.86, 0.98), 0);
    }
    void env; void clamp;
  },
};
