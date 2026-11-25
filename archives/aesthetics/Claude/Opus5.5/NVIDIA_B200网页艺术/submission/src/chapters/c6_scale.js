// 06 尺度 —— 等轴测插画：从上一章收拢成的那道光（GPU 的接缝）起，镜头一级级退远：
// 单颗 GPU → 八 GPU 的 HGX B200（NVLink 归约的光）→ GB200 计算托盘 → NVL72 整机柜（背板、母排、液冷）→ 成排机柜的机房
import * as THREE from 'three';
import { S } from '../state.js';
import { h, seg, ease, env, lerp, css, show, clamp } from '../util.js';
import { beat, block, titleBlock, isoCam, ISO_EL, orthoTopDown } from '../kit.js';
import { setOrtho } from '../gl.js';
import { GPU_POS, MOD_TOP, TRAY_POS } from '../scenes/server.js';
import { PKG_H } from '../scenes/pkg.js';

export const GI = 5;
export const DIE_Y = MOD_TOP + PKG_H.subT + PKG_H.dieTop;
export const SWITCH_P = 0.5;
export const PULL = 1150;
const Q = Math.PI / 4;
const TOP = Math.PI / 2 - 0.0001;

/** 关键帧插值：{p, t:[x,y,z], V（对数插值）, az, el} */
export function isoPath(keys, p) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const a = keys[i], b = keys[i + 1] || a;
  const k = b === a ? 0 : ease.inOut(clamp((p - a.p) / (b.p - a.p)));
  const L = (x, y) => x + (y - x) * k;
  return { t: new THREE.Vector3(L(a.t[0], b.t[0]), L(a.t[1], b.t[1]), L(a.t[2], b.t[2])), V: Math.exp(L(Math.log(a.V), Math.log(b.V))), az: L(a.az, b.az), el: L(a.el, b.el) };
}
/** 让画面内容整体右移 fx 个屏宽（给左侧文字留白） */
export function shiftT(t, az, V, fx) {
  const w = V * (S.W / S.H) * fx;
  return new THREE.Vector3(t.x - Math.cos(az) * w, t.y, t.z + Math.sin(az) * w);
}
export function applyIso(cam, c, userAz = 0, userZoom = 1, fx = 0) {
  const az = c.az + userAz, V = c.V * userZoom;
  const t = fx ? shiftT(c.t, az, V, fx) : c.t;
  cam.near = Math.max(1, 40000 - V * 4); cam.far = 40000 + V * 4;
  isoCam(cam, t, V, az, c.el, setOrtho);
  return V;
}

export default {
  id: 'scale', title: '尺度 · 从一颗到一座', len: 4.2, jumpAt: 0.12,
  init(ctx) {
    const L = this.layer;
    h('div', { class: 'scrim left', style: 'opacity:.6' }, L);
    this.t1 = titleBlock(L, {
      num: '06', cn: '尺度', en: 'SCALE',
      line: '一颗，八颗，七十二颗，一整座机房——NVLink 把它们连成一个整体。',
      hint: '拖动：左右转动视角，上下拉近拉远',
      style: 'left:6.4rem;top:15%;width:25rem',
    });
    this.t2 = block(L, `<p class="ttl-line" style="max-width:20rem">电流从背后流进，冷却液把热量带走。</p>`, 'left:6.4rem;bottom:12%;width:24rem');
    let d = null;
    this.tool = {
      label: '等轴测视角：拖动或方向键转动与拉远',
      down: (e) => { const u = ctx.ui; d = { x: e.clientX, y: e.clientY, az: u.isoAz.target, z: u.isoZoom.target }; },
      move: (e) => {
        if (!d) return;
        const u = ctx.ui; u.isoTouched = true;
        u.isoAz.set(d.az + ((e.clientX - d.x) / S.W) * 4);
        u.isoZoom.set(clamp(d.z * Math.exp(((e.clientY - d.y) / S.H) * 1.6), 0.45, 2.4));
      },
      up: () => { const u = ctx.ui; u.isoAz.set(Math.round(u.isoAz.target)); d = null; },
      key: (e) => {
        const u = ctx.ui;
        if (e.key === 'ArrowLeft') { u.isoTouched = true; u.isoAz.set(Math.round(u.isoAz.target) - 1); return true; }
        if (e.key === 'ArrowRight') { u.isoTouched = true; u.isoAz.set(Math.round(u.isoAz.target) + 1); return true; }
        if (e.key === 'ArrowUp') { u.isoTouched = true; u.isoZoom.set(clamp(u.isoZoom.target / 1.25, 0.45, 2.4)); return true; }
        if (e.key === 'ArrowDown') { u.isoTouched = true; u.isoZoom.set(clamp(u.isoZoom.target * 1.25, 0.45, 2.4)); return true; }
        return false;
      },
    };
  },
  update(p, ctx) {
    const on = p >= 0 && p < 1;
    show(this.layer, on);
    if (!on) return;
    const t = S.time, u = ctx.ui;
    const uw = env(p, 0.1, 0.16, 2, 3);
    const userAz = u.isoAz.v * (Math.PI / 2) * uw, userZoom = Math.pow(u.isoZoom.v, uw);
    if (p > 0.1) ctx.tool(this.tool);
    if (p < SWITCH_P) {
      const Sv = ctx.scenes.server, cam = Sv.ortho;
      const [gx, gz] = GPU_POS[GI];
      const T = TRAY_POS;
      const od = orthoTopDown(gx, DIE_Y, gz, 32.8);
      const keys = [
        { p: 0, t: [od.t.x, od.t.y, od.t.z], V: od.V, az: 0, el: TOP },
        { p: 0.03, t: [od.t.x, od.t.y, od.t.z], V: od.V, az: 0, el: TOP },
        { p: 0.11, t: [gx, DIE_Y, gz], V: 300, az: Q, el: ISO_EL },
        { p: 0.22, t: [0, 0, 0], V: 700, az: Q, el: ISO_EL },
        { p: 0.36, t: [0, 0, 0], V: 680, az: Q, el: ISO_EL },
        { p: SWITCH_P, t: [T.x, T.y + 20, T.z], V: 1150, az: Q, el: ISO_EL },
      ];
      const c = isoPath(keys, p);
      applyIso(cam, c, userAz, userZoom, 0.1 * seg(p, 0.05, 0.15));
      ctx.gl.use({ scene: Sv.scene, camera: cam });
      Sv.scene.fog.near = 1e7; Sv.scene.fog.far = 2e7;
      Sv.scene.environmentIntensity = lerp(0.06, 0.22, seg(p, 0.03, 0.12));
      if (p < 0.09) ctx.fp.show({ draw: 0, alpha: 1, mask: 1 - seg(p, 0.03, 0.09) });
      // 一项计算分给八颗 GPU：各自发亮计算，再沿 NVLink 汇到交换芯片、交换求和、传回
      const cyc = (t * 0.22) % 1, act = env(p, 0.1, 0.16, 0.42, 0.48);
      const glow = [];
      for (let i = 0; i < 8; i++) glow.push(act * (cyc < 0.45 ? 0.75 + 0.25 * Math.sin(t * 9 + i) : cyc > 0.8 ? 0.25 : 0.1));
      const flow = act > 0.05 && cyc > 0.45 && cyc < 0.8 ? (cyc - 0.45) / 0.35 : -1;
      Sv.update(t, { glow, flow, active: 8, links: env(p, 0.03, 0.12, 0.46, 0.5), trayGlow: seg(p, 0.4, 0.48) });
      ctx.ruler(c.V * userZoom * (S.W / S.H));
    } else {
      const Rk = ctx.scenes.rack, cam = Rk.ortho;
      const rx = Rk.rackX, hb = Rk.heroBase;
      const pull = PULL * (1 - seg(p, SWITCH_P, 0.58, ease.inOut));
      const keys = [
        { p: SWITCH_P, t: [rx + hb.x, hb.y + 20, hb.z + PULL], V: 1150, az: Q, el: ISO_EL },
        { p: 0.58, t: [rx, 1100, 0], V: 3400, az: Q, el: ISO_EL },
        { p: 0.64, t: [rx, 1100, 0], V: 3300, az: Q, el: ISO_EL },
        { p: 0.74, t: [rx, 1100, -100], V: 3500, az: Q + Math.PI, el: ISO_EL },
        { p: 0.82, t: [rx, 1100, -100], V: 3600, az: Q + Math.PI, el: ISO_EL },
        { p: 0.96, t: [0, 0, 3200], V: 30000, az: Q + Math.PI, el: ISO_EL },
        { p: 1, t: [0, 0, 3200], V: 30000, az: Q + Math.PI, el: ISO_EL },
      ];
      const c = isoPath(keys, p);
      applyIso(cam, c, userAz, userZoom, 0.1);
      ctx.gl.use({ scene: Rk.scene, camera: cam });
      Rk.update(t, {
        pull, nvlink: env(p, 0.6, 0.66, 0.84, 0.9), spineLit: env(p, 0.58, 0.64, 0.9, 0.96), power: env(p, 0.64, 0.7, 0.9, 0.96), cool: env(p, 0.64, 0.7, 2, 3),
        lit: 1, hallLit: seg(p, 0.82, 0.95), heroGlow: 1 - seg(p, 0.5, 0.56), pool: 1 - seg(p, 0.82, 0.9), rise: seg(p, 0.82, 0.96, ease.linear),
        fog: 0, floorFog: 0.0000012, cold: 1,
      });
      ctx.ruler(c.V * userZoom * (S.W / S.H));
    }
    ctx.gl.setPost({ bloom: 0.6, radius: 0.45, threshold: 0.95, exposure: lerp(0.5, 1.1, seg(p, 0.03, 0.12)), grain: 0.04, vig: 0.5, ca: 0.0018, fade: 0, edge: 0.55 * seg(p, 0.04, 0.12), flat: 0 });
    beat(this.t1, p, 0.08, 0.4, 0.04, 'mask');
    beat(this.t2, p, 0.64, 0.9, 0.03, 'rise');
  },
};
