// 04 精度 —— 同一幅画面（开场的那颗芯片）随位数减少一级级变粗：色阶断层 → 抖动纹理 → 网点 → 只剩寥寥几种颜色；
// 再把画面分成小块，每块共用一个缩放因子、各自调整色阶，粗糙的画面重新变得清晰。光标经过的小块先亮起来。
import * as THREE from 'three';
import { S } from '../state.js';
import { h, s, seg, ease, env, lerp, css, show, clamp, attr } from '../util.js';
import { beat, block, titleBlock, orbit, camPath, topDownCam, viewWidth } from '../kit.js';
import { HERO } from './c0_prologue.js';
import { RIVER_END } from './c3_river.js';
import { PKG_H } from '../scenes/pkg.js';

const MW = 192, MH = 108;
const DIG = ['32', '16', '8', '6', '4'];

export default {
  id: 'print', title: '精度 · 由细到粗', len: 3.0, jumpAt: 0.16,
  init(ctx) {
    const L = this.layer;
    // 巨大的位数数字：随位数减少，字宽收窄、笔画变粗
    this.numSVG = s('svg', { class: 'full', viewBox: '0 0 1920 1080', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' }, L);
    this.num = s('text', { x: 1840, y: 930, 'text-anchor': 'end', class: 'svg-disp', style: "font-size:620px;fill:none;stroke:rgba(184,242,74,0.5);stroke-width:1.4;font-variation-settings:'wdth' 120,'wght' 150", text: '32' }, this.numSVG);
    this.unit = s('text', { x: 1846, y: 990, 'text-anchor': 'end', class: 'svg-label', style: 'font-size:22px;letter-spacing:0.5em;fill:rgba(236,232,223,0.55)', text: 'BITS' }, this.numSVG);
    h('div', { class: 'scrim left', style: 'opacity:.55' }, L);
    this.t1 = titleBlock(L, {
      num: '04', cn: '精度', en: 'PRECISION',
      line: '位数一级级变少，同一幅画面断成色阶与网点，最后只剩寥寥几种颜色，却仍认得出它。',
      style: 'left:6.4rem;top:14%;width:24rem', cls: 'ttl-vert',
    });
    this.t2 = block(L, `<p class="ttl-line" style="max-width:24rem">每一小块共用一个缩放因子，各自调整色阶——粗糙的画面重新变得清晰。</p>
      <div class="ttl-hint" style="margin-top:1rem">移动光标，擦亮你经过的小块</div>`, 'left:6.4rem;bottom:10%;width:26rem');
    // 光标擦过的遮罩（低分辨率，按块取样）
    const cv = (this.maskCanvas = document.createElement('canvas'));
    cv.width = MW; cv.height = MH;
    this.mctx = cv.getContext('2d');
    this.mask = new THREE.CanvasTexture(cv);
    this.mask.minFilter = this.mask.magFilter = THREE.NearestFilter;
    this.clearMask();
    const paint = (x, y) => {
      const m = this.mctx, cx = (x / S.W) * MW, cy = (y / S.H) * MH, r = 7.5;
      const g = m.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      m.fillStyle = g; m.beginPath(); m.arc(cx, cy, r, 0, 7); m.fill();
      this.mask.needsUpdate = true;
      ctx.ui.maskTouched = true;
    };
    this.brush = [S.W / 2, S.H / 2];
    this.tool = {
      label: '画面：移动光标擦亮小块；方向键移动画笔',
      hover: (e) => paint(e.clientX, e.clientY),
      key: (e) => {
        const st = 0.05;
        const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        if (!d) return false;
        this.brush[0] = clamp(this.brush[0] + d[0] * S.W, 0, S.W); this.brush[1] = clamp(this.brush[1] + d[1] * S.H, 0, S.H);
        paint(this.brush[0], this.brush[1]);
        S.pointer.x = this.brush[0]; S.pointer.y = this.brush[1]; S.pointer.moved = S.time;
        return true;
      },
    };
    this.cursor = new THREE.Vector3();
  },
  clearMask() { this.mctx.fillStyle = '#000'; this.mctx.fillRect(0, 0, MW, MH); this.mask.needsUpdate = true; },
  reset() { this.clearMask(); },
  update(p, ctx) {
    const on = p >= 0 && p < 1;
    show(this.layer, on);
    if (!on) return;
    const P = ctx.scenes.pkg, cam = P.camera, t = S.time;
    const td = topDownCam(cam, PKG_H.dieTop);
    const keys = [
      { p: 0, ...RIVER_END },
      { p: 0.86, t: [HERO.target.x, HERO.target.y + 1, HERO.target.z], d: HERO.dist - 20, yaw: 0, pitch: HERO.pitch + 0.02 },
      { p: 1, t: [HERO.target.x, HERO.target.y + 1, HERO.target.z], d: HERO.dist - 20, yaw: 0, pitch: HERO.pitch + 0.02 },
    ];
    void td;
    const c = camPath(keys, p);
    ctx.gl.use(P);
    cam.up.set(0, 1, 0);
    orbit(cam, c.t, c.d, c.yaw, c.pitch);
    P.root.position.y = Math.sin(t * 0.6) * 0.4;
    P.root.rotation.set(0, 0, 0);
    P.update(t, { explode: 0, cut: 200, flow: 1, seamGlow: 1, halo: 1, motes: 0 });
    P.floor.material.uniforms.uAmt.value = 1;
    P.scene.environmentIntensity = 0.32 + 0.04 * seg(p, 0, 0.15);
    // 位数：32 → 16 → 8 → 6 → 4，每一级由一道扫描线从左向右刷过
    const stage = seg(p, 0.18, 0.24) + seg(p, 0.26, 0.32) + seg(p, 0.34, 0.4) + seg(p, 0.42, 0.48);
    const blockAmt = seg(p, 0.66, 0.84, ease.linear);
    const fade = 0;
    const mix = 1 - seg(p, 0.86, 0.97);
    const live = !S.exportMode && t - S.pointer.moved < 1.6;
    const toolOn = p > 0.45 && p < 0.86;
    if (toolOn) ctx.tool(this.tool);
    this.cursor.set(S.pointer.x * S.dpr, (S.H - S.pointer.y) * S.dpr, toolOn && live ? 1 - seg(t - S.pointer.moved, 0.8, 1.6) : 0);
    ctx.gl.setPost({
      bloom: 0.55, radius: 0.48, threshold: 1.0, exposure: lerp(1.05, 1.45, seg(p, 0.08, 0.18)) - 0.4 * seg(p, 0.86, 0.97), grain: lerp(0.045, 0.02, seg(p, 0.15, 0.25)), vig: 0.5, ca: 0.0018, fade: 0,
      print: {
        uStage: stage, uBlock: blockAmt, uMaskOn: 1, tMask: this.mask,
        uCell: Math.round(32 * S.unit * S.dpr), uGrid: env(p, 0.62, 0.68, 0.8, 0.88) * 0.35, uMix: mix,
        uFade: fade, uDither: seg(stage, 2.4, 3.0) * (1 - seg(stage, 3.5, 4) * 0.6),
        uDuo: seg(stage, 2.8, 4) * 0.9, uHalf: seg(stage, 3.3, 4) * 0.85, uDot: 7, uCursor: this.cursor,
      },
    });
    ctx.ruler(viewWidth(cam, c.d));
    // 数字字形
    const di = Math.min(4, Math.floor(stage + 0.5));
    if (this.num._t !== DIG[di]) { this.num._t = DIG[di]; this.num.textContent = DIG[di]; }
    const wd = lerp(122, 52, stage / 4), wg = lerp(150, 620, stage / 4);
    css(this.num, 'fontVariationSettings', `'wdth' ${wd.toFixed(0)},'wght' ${wg.toFixed(0)}`);
    const nk = env(p, 0.14, 0.2, 0.84, 0.9);
    css(this.numSVG, 'opacity', nk.toFixed(3));
    beat(this.t1, p, 0.12, 0.6, 0.05, 'mask');
    beat(this.t2, p, 0.64, 0.88, 0.04, 'rise');
  },
};
