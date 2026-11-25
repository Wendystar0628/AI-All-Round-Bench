// 共享覆盖层：晶粒版图化作纹样（线描）——与三维晶粒严格对齐，从接缝向两侧“绣”出来
// 每个 SM 是一枚方胜纹，GPC 是四角回纹，L2 是密排的经线，HBM 接口是梳齿，外缘接口是折线。
import { S } from '../state.js';
import { h, s, attr, css, show, clamp, seg, ease, lerp } from '../util.js';
import { REGIONS, GPCS, LAYOUT, toXZ, DIE_W, DIE_D, GAP } from '../floorplan.js';
import { fpRect } from '../kit.js';

const C = { bone: '#ece8df', volt: '#b8f24a', amber: '#ffb347', ice: '#7ce0ff' };

export function createFP(parent) {
  const root = h('div', { class: 'layer', id: 'L-fp' }, null);
  parent.prepend(root);
  const svg = s('svg', { class: 'px', 'aria-hidden': 'true' }, root);
  const maskP = s('path', { fill: '#050607', 'fill-rule': 'evenodd' }, svg);
  const g = s('g', {}, svg);
  const rectOf = (die, o) => {
    const a = toXZ(die, o.u0, o.v0), b = toXZ(die, o.u1, o.v1);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
  };
  const items = []; // {el, delay}
  const P = (d, col, op, w = 1, delay = 0) => {
    const el = s('path', { d, fill: 'none', stroke: col, 'stroke-opacity': op, 'stroke-width': w, 'vector-effect': 'non-scaling-stroke', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, g);
    items.push({ el, delay });
    return el;
  };
  const f = (n) => n.toFixed(3);
  const rectD = (r, i = 0) => `M${f(r.x + i)},${f(r.y + i)} H${f(r.x + r.w - i)} V${f(r.y + r.h - i)} H${f(r.x + i)} Z`;
  const dl = (x) => clamp(Math.abs(x) / (DIE_W + 1));

  for (let d = 0; d < 2; d++) {
    const R = rectOf(d, { u0: 0, u1: 1, v0: 0, v1: 1 });
    P(rectD(R), C.bone, 0.75, 1, 0.0);
    P(rectD(R, 0.35), C.bone, 0.3, 1, 0.05);
    for (const r of REGIONS) {
      const rr = rectOf(d, r);
      if (r.key === 'l2') {
        let dd = '';
        for (let x = rr.x + 0.15; x < rr.x + rr.w; x += 0.32) dd += `M${f(x)},${f(rr.y)} V${f(rr.y + rr.h)} `;
        P(dd, C.ice, 0.45, 1, 0.15);
        // 回纹（折线）沿 L2 中线
        let m = `M${f(rr.x)},${f(rr.y + rr.h / 2)} `;
        for (let x = rr.x, k = 0; x < rr.x + rr.w - 0.6; x += 0.6, k++) m += `h0.3 v${k % 2 ? 0.6 : -0.6} h0.3 v${k % 2 ? -0.6 : 0.6} `;
        P(m, C.bone, 0.55, 1, 0.2);
      } else if (r.key === 'phy') {
        let dd = `M${f(rr.x)},${f(rr.y + (rr.y < 0 ? rr.h : 0))} H${f(rr.x + rr.w)} `;
        const base = rr.y < 0 ? rr.y + rr.h : rr.y, tip = rr.y < 0 ? rr.y : rr.y + rr.h;
        for (let x = rr.x + 0.2; x < rr.x + rr.w; x += 0.42) dd += `M${f(x)},${f(base)} V${f(tip)} `;
        P(dd, C.amber, 0.7, 1, 0.55 + dl(rr.x + rr.w / 2) * 0.3);
      } else if (r.key === 'io') {
        let dd = `M${f(rr.x + rr.w / 2)},${f(rr.y)} `;
        for (let y = rr.y, k = 0; y < rr.y + rr.h; y += 0.5, k++) dd += `L${f(rr.x + (k % 2 ? rr.w * 0.85 : rr.w * 0.15))},${f(y + 0.5)} `;
        P(dd, C.amber, 0.65, 1, 0.75);
      } else if (r.key === 'hbi') {
        P(rectD(rr), C.volt, 0.8, 1, 0.0);
        let dd = '';
        for (let y = rr.y + 0.2; y < rr.y + rr.h; y += 0.45) dd += `M${f(rr.x)},${f(y)} H${f(rr.x + rr.w)} `;
        P(dd, C.volt, 0.45, 1, 0.05);
      } else if (r.key === 'eng') {
        const cx = rr.x + rr.w / 2, cy = rr.y + rr.h / 2;
        for (const rad of [0.45, 0.9, 1.35]) P(`M${f(cx - rad)},${f(cy)} a${rad},${rad} 0 1,0 ${f(rad * 2)},0 a${rad},${rad} 0 1,0 ${f(-rad * 2)},0`, C.bone, 0.5, 1, 0.3);
      }
    }
    // GPC：四角回纹
    for (const gp of GPCS) {
      const r = rectOf(d, gp), k = 1.1;
      const dd = `M${f(r.x)},${f(r.y + k)} V${f(r.y)} H${f(r.x + k)} M${f(r.x + r.w - k)},${f(r.y)} H${f(r.x + r.w)} V${f(r.y + k)} M${f(r.x + r.w)},${f(r.y + r.h - k)} V${f(r.y + r.h)} H${f(r.x + r.w - k)} M${f(r.x + k)},${f(r.y + r.h)} H${f(r.x)} V${f(r.y + r.h - k)}`;
      P(dd, C.bone, 0.7, 1, 0.2 + dl(r.x + r.w / 2) * 0.3);
    }
  }
  // SM：方胜纹（方框 + 菱形 + 中心小方块）
  const smCore = [];
  for (const sm of LAYOUT.sms) {
    const r = rectOf(sm.die, sm);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const dly = 0.25 + dl(cx) * 0.55;
    P(rectD(r), C.volt, 0.55, 1, dly);
    P(`M${f(cx)},${f(r.y + 0.12)} L${f(r.x + r.w - 0.12)},${f(cy)} L${f(cx)},${f(r.y + r.h - 0.12)} L${f(r.x + 0.12)},${f(cy)} Z`, C.bone, 0.35, 1, dly + 0.05);
    const q = Math.min(r.w, r.h) * 0.16;
    smCore.push(s('rect', { x: f(cx - q), y: f(cy - q), width: f(q * 2), height: f(q * 2), fill: C.volt, 'fill-opacity': 0 }, g));
  }
  for (const fr of LAYOUT.fronts) {
    const r = rectOf(fr.die, fr), cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.min(r.w, r.h) * 0.3;
    P(`M${f(cx - rad)},${f(cy)} a${f(rad)},${f(rad)} 0 1,0 ${f(rad * 2)},0 a${f(rad)},${f(rad)} 0 1,0 ${f(-rad * 2)},0`, C.amber, 0.5, 1, 0.4 + dl(cx) * 0.4);
  }
  // 跨接缝的数据
  const cross = [];
  for (let i = 0; i < 26; i++) cross.push(s('rect', { width: 1.1, height: 0.32, fill: '#e9ffc4', rx: 0.1 }, g));

  let want = null;
  const api = {
    root,
    begin() { want = null; },
    /** o: {draw, cross, alpha, mask, glow(i)->0..1, core} */
    show(o) { want = o; },
    end() {
      const on = !!want;
      show(root, on);
      if (!on) return;
      const o = want;
      attr(svg, 'viewBox', `0 0 ${S.W} ${S.H}`);
      const Rr = fpRect();
      attr(g, 'transform', `translate(${Rr.cx.toFixed(2)},${Rr.cy.toFixed(2)}) scale(${Rr.pxmm.toFixed(4)})`);
      css(root, 'opacity', (o.alpha ?? 1).toFixed(3));
      const mk = o.mask ?? 0;
      if (mk > 0.001) {
        const m = 6 * Rr.pxmm, x0 = Rr.cx - Rr.w / 2 - m, y0 = Rr.cy - Rr.h / 2 - m, x1 = Rr.cx + Rr.w / 2 + m, y1 = Rr.cy + Rr.h / 2 + m;
        attr(maskP, 'd', `M0,0 H${S.W} V${S.H} H0 Z M${x0.toFixed(1)},${y0.toFixed(1)} V${y1.toFixed(1)} H${x1.toFixed(1)} V${y0.toFixed(1)} Z`);
        css(maskP, 'opacity', (mk * 0.92).toFixed(3));
      } else css(maskP, 'opacity', '0');
      const dr = o.draw ?? 1;
      for (const it of items) attr(it.el, 'stroke-dashoffset', (1 - seg(dr, it.delay * 0.7, it.delay * 0.7 + 0.3)).toFixed(4));
      const gl = o.glow, core = o.core ?? 0;
      smCore.forEach((el, i) => attr(el, 'fill-opacity', (Math.min(1, core + (gl ? gl(i) : 0)) * 0.85).toFixed(3)));
      const ck = o.cross ?? 0;
      cross.forEach((c, i) => {
        const lane = i % 13, dir = i < 13 ? 1 : -1;
        const fr = (S.time * (0.55 + (lane % 4) * 0.12) + lane * 0.137 + (dir > 0 ? 0 : 0.5)) % 1;
        const x = dir * lerp(-7, 7, fr) - 0.55;
        const y = -DIE_D * 0.44 + (lane / 12) * DIE_D * 0.88 + (dir > 0 ? 0 : 0.5);
        attr(c, 'x', x.toFixed(3)); attr(c, 'y', y.toFixed(3));
        css(c, 'opacity', (ck * Math.sin(fr * Math.PI) * (0.4 + 0.6 * clamp(1 - Math.abs(x) / 7))).toFixed(3));
      });
      void ease; void GAP;
    },
  };
  show(root, false);
  return api;
}
