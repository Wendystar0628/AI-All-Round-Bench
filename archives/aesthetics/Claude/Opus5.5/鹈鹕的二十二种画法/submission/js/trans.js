'use strict';
/* ============================================================
   转场：鹈鹕始终在画面里、骑行不中断，画风围绕着它变换
   每个版块的 trans 描述“这一版怎样变成下一版”（对应题面第 4 节的「转场」）：
     reveal(u, c)  下一版在屏幕上铺开的范围（u = 距强拍的秒数；c.P 是鹈鹕的屏幕姿态）
     fx / fx2      转场特效（覆盖层；fx 在鹈鹕之下，fx2 在鹈鹕之上）
     pel           鹈鹕自己换画法的时刻与扫过方式（最后才换）
     align         'cam'：下一版的镜头先对准鹈鹕再回到自己的构图；'move'：鹈鹕从旧位置移到新位置
   ============================================================ */

/* ---------- 形状工具 ---------- */
// 有机的圆团（纸边、墨晕）：r 半径；amp 起伏；n 点数
function blobD(cx, cy, r, seed, amp, n, freq) {
  n = n || 40; amp = amp === undefined ? .12 : amp; freq = freq || 1;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const w = noise1(Math.cos(a) * 2.2 * freq + seed, seed) * .6 + noise1(Math.sin(a) * 2.2 * freq + seed * 1.7, seed + 3) * .4;
    const rr = Math.max(0, r * (1 + amp * (w - .5) * 2));
    d += (i ? 'L' : 'M') + f1(cx + Math.cos(a) * rr) + ',' + f1(cy + Math.sin(a) * rr);
  }
  return d + 'Z';
}
// 并集里的每块都按顺时针（屏幕坐标）绕行，避免互相抵消
function polyCW(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q2 = pts[(i + 1) % pts.length]; a += p[0] * q2[1] - q2[0] * p[1]; } const o = a < 0 ? pts.slice().reverse() : pts; return 'M' + o.map(p => f1(p[0]) + ',' + f1(p[1])).join('L') + 'Z'; }
function circCW(cx, cy, r) { return `M${f1(cx - r)},${f1(cy)}a${f1(r)},${f1(r)} 0 1 1 ${f1(2 * r)},0a${f1(r)},${f1(r)} 0 1 1 ${f1(-2 * r)},0Z`; }
// 撕纸边：高频锯齿的圆
function tornBlobD(cx, cy, r, seed, n) {
  n = n || 64; let d = '';
  for (let i = 0; i < n; i++) { const a = i / n * TAU, j = (hash(i * 3.7 + seed) - .5) * .09 + (noise1(i * .35 + seed, seed) - .5) * .16; const rr = Math.max(0, r * (1 + j)); d += (i ? 'L' : 'M') + f1(cx + Math.cos(a) * rr) + ',' + f1(cy + Math.sin(a) * rr); }
  return d + 'Z';
}
// 半平面：从屏幕一侧沿方向推进；front(t) 给出前沿的起伏
function sideD(dir, pos, edgeFn) {
  // dir: 'L' 从左往右，'R' 从右往左，'T' 从上往下，'B' 从下往上；pos 为前沿位置（屏幕坐标）
  const N = 24, pts = [];
  if (dir === 'L' || dir === 'R') {
    for (let i = 0; i <= N; i++) { const y = -60 + i * (1200 / N); pts.push([pos + (edgeFn ? edgeFn(y, i) : 0), y]); }
    const xo = dir === 'L' ? -400 : 2320;
    return 'M' + xo + ',-60' + pts.map(p => 'L' + f1(p[0]) + ',' + f1(p[1])).join('') + 'L' + xo + ',1140Z';
  }
  for (let i = 0; i <= N; i++) { const x = -60 + i * (2040 / N); pts.push([x, pos + (edgeFn ? edgeFn(x, i) : 0)]); }
  const yo = dir === 'T' ? -400 : 1480;
  return 'M-60,' + yo + pts.map(p => 'L' + f1(p[0]) + ',' + f1(p[1])).join('') + 'L1980,' + yo + 'Z';
}
const FULL = 'full';
// 转场特效共用的滤镜
function transDefs() {
  if (transDefs.done) return; transDefs.done = true;
  def(`<filter id="tBlur8" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="tBlur20" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="tGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
}
// 鹈鹕局部坐标 → 屏幕
const pelPt = (c, x, y) => TRM.map(c.Pm, x, y);
const pelPtA = (c, x, y) => TRM.map(TRM.canon(c.pA), x, y);

/* ---------- 默认：从车轮下铺开 ---------- */
const TRANS_DEFAULT = {
  reveal(u, c) { if (u < 0) return null; const k = eo(clamp(u / .8)); if (k >= 1) return FULL; return blobD(c.pA.o[0], c.pA.o[1], 40 + 2600 * k, this.index || 1, .2); },
  hideA: .85
};
SCENES.forEach(s => { s.exitFx = null; s.portal = null; s.exit = null; });
SEG.intro.exitFx = null; SEG.intro.exit = null;

/* ======================= 片头 → No.01：红黑拼贴从车轮下铺开，盖满整张画布 ======================= */
(function () {
  const R0 = '#d42a1e', K = '#151313', PP = '#efe6d3';
  const rad = u => 24 + 1860 * Math.pow(eio(clamp(u / 1.0)), 1.15);
  SEG.intro.trans = {
    reveal(u, c) { if (u < 0) return null; if (u >= 1.0) return FULL; return tornBlobD(c.pA.o[0], c.pA.o[1] + 6, rad(u), 11, 80); },
    hideA: 1.0, hold: 1.4, blend: 2.15,
    // 旧的线稿鹈鹕像一张剪下来的贴纸，压在新画面上，最后才被重画
    pel: { at: 1.02, dur: .4, wipe: 'up', edge: 26, oldFilter: () => 'url(#tCutout)' },
    fx: {
      win: [0, 1.05],
      build(g) {
        transDefs();
        def(`<filter id="tCutout" x="-25%" y="-25%" width="150%" height="150%"><feMorphology in="SourceAlpha" operator="dilate" radius="7" result="d"/><feFlood flood-color="#efe6d3"/><feComposite in2="d" operator="in" result="w"/><feOffset in="w" dx="7" dy="9" result="s0"/><feFlood flood-color="#000" flood-opacity=".5"/><feComposite in2="s0" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
        const R = rng(77);
        g.innerHTML = `<path class="rk" fill="none" stroke="${K}" stroke-width="30" stroke-linejoin="round"/><path class="rr" fill="none" stroke="${R0}" stroke-width="12" stroke-linejoin="round"/><path class="rp" fill="none" stroke="${PP}" stroke-width="3" stroke-dasharray="14 9"/>` +
          Array.from({ length: 30 }, (_, i) => `<path class="sc" d="${tornRect(-18 - R() * 16, -12 - R() * 10, 36 + R() * 30, 24 + R() * 20, 3, 7, R)}" fill="${[R0, K, PP][i % 3]}"/>`).join('');
        this.fxr = [q(g, '.rk'), q(g, '.rr'), q(g, '.rp')]; this.fxs = qa(g, '.sc');
        this.fxp = this.fxs.map((e, i) => [hash(i * 3.3) * TAU, hash(i * 7.1) * .6, .6 + hash(i * 1.9) * .9, (hash(i * 5.7) - .5) * 900]);
      },
      update(u, c) {
        const o = c.pA.o, r = rad(u), d = tornBlobD(o[0], o[1] + 6, r, 11, 80), on = u < 1.0;
        this.fxr.forEach(e => { e.setAttribute('d', on ? d : 'M0,0'); });
        this.fxs.forEach((e, i) => {
          const p = this.fxp[i], age = u - p[1] * 1.3;
          if (age < 0 || age > .45) { e.setAttribute('opacity', 0); return; }
          const rr = rad(p[1] * 1.3) + age * 700 * p[2], x = o[0] + Math.cos(p[0]) * rr, y = o[1] + 6 + Math.sin(p[0]) * rr * .9;
          at(e, { opacity: f2(1 - age / .45), transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(p[3] * age + p[0] * 57)}) scale(${f2(1.4 - age)})` });
        });
      }
    }
  };
})();

/* ======================= No.01 → No.02：剪纸碎片翻飞，黑色铺成夜空，红屑化星，金轨亮起 ======================= */
(function () {
  const R0 = '#d42a1e', K = '#151313', PP = '#efe6d3', GOLD = '#ffd36a';
  const rad = u => 30 + 2050 * Math.pow(eio(clamp(u / .9)), 1.1);
  const ctr = c => pelPtA(c, 0, -190);
  SCENES[0].trans = {
    reveal(u, c) { if (u < 0) return null; if (u >= .9) return FULL; const o = ctr(c); return tornBlobD(o[0], o[1], rad(u), 21, 70); },
    hideA: .9, hold: .95, blend: 2.0,
    pel: { at: .72, dur: .32, wipe: 'up', edge: 18 },
    fx: {
      win: [0, 1.4],
      build(g) {
        transDefs();
        const R = rng(1201);
        let s = `<path class="rim" fill="none" stroke="${K}" stroke-width="46" stroke-linejoin="round"/><g class="rail" filter="url(#tGlow)"><path class="rl" stroke="${GOLD}" stroke-width="6" fill="none" stroke-linecap="round"/><path class="rl2" stroke="#fff6d0" stroke-width="2" fill="none" stroke-linecap="round"/></g>`;
        this.fr = [];
        for (let i = 0; i < 44; i++) {
          const kind = i % 10 < 3 ? 'r' : i % 10 < 7 ? 'k' : 'p', a = R() * TAU, rr = 130 + R() * 420;
          const w = 40 + R() * 70, h = 30 + R() * 60;
          s += `<g class="f"><path d="${tornRect(-w / 2, -h / 2, w, h, 3, 8, R)}" fill="${kind === 'r' ? R0 : kind === 'k' ? K : PP}" stroke="${kind === 'k' ? '#2a2626' : 'none'}" stroke-width="2"/>${kind === 'r' ? `<path class="st" d="M0,-16L4,-4L16,0L4,4L0,16L-4,4L-16,0L-4,-4Z" fill="#fff6d8" opacity="0"/>` : ''}</g>`;
          this.fr.push({ kind, lx: Math.cos(a) * rr, ly: -190 + Math.sin(a) * rr * .8, dist: 500 + R() * 900, spin: (R() - .5) * 900, flip: 2 + R() * 5, st: R() * TAU });
        }
        g.innerHTML = s;
        this.rim = q(g, '.rim'); this.rl = q(g, '.rl'); this.rl2 = q(g, '.rl2'); this.rail = q(g, '.rail'); this.fe = qa(g, '.f');
      },
      update(u, c) {
        const o = ctr(c);
        this.rim.setAttribute('d', u < .9 ? tornBlobD(o[0], o[1], rad(u), 21, 70) : 'M0,0');
        this.fe.forEach((e, i) => {
          const f = this.fr[i], p0 = pelPtA(c, f.lx, f.ly), dx = p0[0] - o[0], dy = p0[1] - o[1], L = Math.hypot(dx, dy) || 1;
          if (f.kind === 'r') {
            // 红屑：飞出去，越飞越小，停下来变成星星
            const k = eo(clamp(u / .75)), x = p0[0] + dx / L * f.dist * .7 * k, y = p0[1] + dy / L * f.dist * .7 * k - 120 * k;
            const sc = lerp(1, .12, ss(0, .7, u)), tw = .7 + .3 * Math.sin(u * 14 + f.st);
            at(e, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(f.spin * k)}) scale(${f2(sc)},${f2(sc * Math.cos(f.flip * k))})`, opacity: f2(1 - ss(1.1, 1.4, u)) });
            const stE = e.lastChild; at(stE, { opacity: f2(ss(.35, .7, u) * tw), transform: `scale(${f2(1.6 / Math.max(sc, .12) * tw)})` });
          } else {
            // 黑色的碎片：翻飞、变大、化进夜空；米色的碎片：翻飞后淡出
            const k = eo(clamp(u / .9)), x = p0[0] + dx / L * f.dist * k, y = p0[1] + dy / L * f.dist * k + 60 * k * k;
            const sc = f.kind === 'k' ? 1 + 2.5 * k : 1 - .3 * k;
            at(e, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(f.spin * k)}) scale(${f2(sc)},${f2(sc * Math.cos(f.flip * k))})`, opacity: f2(1 - ss(f.kind === 'k' ? .35 : .2, f.kind === 'k' ? .85 : .7, u)) });
          }
        });
        // 车轮下亮起一条金色的轨道（沿路的方向向两边延伸）
        const Lr = 2600 * eo(inv(.08, .55, u)), a = pelPt(c, -Lr, 2), b = pelPt(c, Lr, 2);
        const d = `M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}`;
        this.rl.setAttribute('d', d); this.rl2.setAttribute('d', d);
        op(this.rail, ss(.06, .14, u) * (1 - ss(.85, 1.2, u)));
      }
    }
  };
})();

/* ======================= No.02 → No.03：星空由远及近亮成蓝天，金线舒展成雕花边框，轨道化成草原小路 ======================= */
(function () {
  const GOLD = '#e9b949', GL = '#fff0b8';
  const hole = u => 1750 * Math.pow(1 - clamp(u / .85), .85);
  const ctr = c => pelPtA(c, 0, -170);
  const BIGR = 'M-500,-500H2420V1580H-500Z';
  SCENES[1].trans = {
    // 新画风从画面四周（远处）亮起，向鹈鹕合拢；车轮下的轨道最后变
    reveal(u, c) { if (u < 0) return null; if (u >= .85) return FULL; const o = ctr(c); return '!' + BIGR + blobD(o[0], o[1], hole(u), 31, .1, 48); },
    hideA: .86, hold: 1.05, blend: 1.9,
    pel: { at: .78, dur: .32, wipe: 'up', edge: 10 },
    fx: {
      win: [0, 1.2],
      build(g) {
        transDefs();
        g.innerHTML = `<path class="glow" fill="none" stroke="#ffe8b0" stroke-width="70" opacity=".55" filter="url(#tBlur20)"/><path class="glow2" fill="none" stroke="#fff8e0" stroke-width="10" opacity=".8"/>` +
          [0, 1, 2, 3].map(() => `<path class="ln" fill="none" stroke="${GOLD}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path class="ln2" fill="none" stroke="${GL}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('') +
          `<g class="cn">${goldCorner(30, 30, 1, 1)}</g><g class="cn">${goldCorner(1890, 30, -1, 1)}</g><g class="cn">${goldCorner(30, 1050, 1, -1)}</g><g class="cn">${goldCorner(1890, 1050, -1, -1)}</g>`;
        this.gw = q(g, '.glow'); this.gw2 = q(g, '.glow2'); this.ln = qa(g, '.ln'); this.ln2 = qa(g, '.ln2'); this.cn = qa(g, '.cn');
      },
      update(u, c) {
        const o = ctr(c), r = hole(u), d = u < .85 ? blobD(o[0], o[1], r, 31, .1, 48) : 'M0,0';
        this.gw.setAttribute('d', d); this.gw2.setAttribute('d', d);
        op(this.gw, .55 * (1 - ss(.6, .85, u))); op(this.gw2, .8 * (1 - ss(.6, .85, u)));
        // 金色的轨道线向两侧伸到画框，再沿着边框舒展开
        const a = pelPt(c, -3000, 0), b = pelPt(c, 3000, 0);
        const yAt = x => clamp(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]), 30, 1050);
        const yl = yAt(30), yr = yAt(1890), base = pelPt(c, 0, 0);
        const paths = [
          [[base[0], base[1]], [30, yl], [30, 30], [960, 30]], [[base[0], base[1]], [30, yl], [30, 1050], [960, 1050]],
          [[base[0], base[1]], [1890, yr], [1890, 30], [960, 30]], [[base[0], base[1]], [1890, yr], [1890, 1050], [960, 1050]]];
        const k = eio(inv(.05, .62, u)), fade = 1 - ss(.75, 1.05, u);
        paths.forEach((pts, i) => {
          let L = 0; const seg = []; for (let j = 1; j < pts.length; j++) { const l = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); seg.push(l); L += l; }
          let rem = L * k, dd = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
          for (let j = 1; j < pts.length && rem > 0; j++) { const t = Math.min(1, rem / seg[j - 1]); dd += `L${f1(lerp(pts[j - 1][0], pts[j][0], t))},${f1(lerp(pts[j - 1][1], pts[j][1], t))}`; rem -= seg[j - 1]; }
          for (const e of [this.ln[i], this.ln2[i]]) { e.setAttribute('d', dd); op(e, fade); }
        });
        this.cn.forEach((e, i) => { const kk = eob(inv(.42 + (i % 2) * .05, .62 + (i % 2) * .05, u)); const p = [[30, 30], [1890, 30], [30, 1050], [1890, 1050]][i]; at(e, { transform: `translate(${p[0]},${p[1]}) scale(${f2(kk)}) translate(${-p[0]},${-p[1]})`, opacity: f2(fade) }); });
      }
    }
  };
})();

/* ======================= No.03 → No.04：落地点向外褪成白色校舍与晴空，金色雕花收成圆角面板 ======================= */
(function () {
  const rad = u => 20 + 2300 * Math.pow(eio(clamp(u / 1.0)), 1.2);
  SCENES[2].trans = {
    reveal(u, c) { if (u < 0) return null; if (u >= 1.0) return FULL; const o = pelPtA(c, 0, 0); return blobD(o[0], o[1] - 40, rad(u), 41, .16, 44); },
    hideA: 1.0, hold: 1.0, blend: 1.8,
    pel: { at: .62, dur: .3, wipe: 'up', edge: 0 },
    fx: {
      win: [0, 1.1],
      build(g) {
        transDefs();
        g.innerHTML = `<path class="wh" fill="none" stroke="#ffffff" stroke-width="80" opacity=".7" filter="url(#tBlur8)"/><path class="wh2" fill="none" stroke="#ffffff" stroke-width="14"/>
          <path class="nv" fill="#2c3a6a" fill-rule="evenodd" d="M0,0H1920V1080H0Z M30,30V1050H1890V30Z"/>
          <rect class="pa" fill="#fff"/><rect class="pb" fill="#fff"/>
          ${[0, 1, 2, 3].map(i => `<g class="cn">${goldCorner([30, 1890, 30, 1890][i], [30, 30, 1050, 1050][i], i % 2 ? -1 : 1, i > 1 ? -1 : 1)}</g>`).join('')}`;
        this.wh = q(g, '.wh'); this.wh2 = q(g, '.wh2'); this.nv = q(g, '.nv'); this.pa = q(g, '.pa'); this.pb = q(g, '.pb'); this.cns = qa(g, '.cn');
      },
      update(u, c) {
        const o = pelPtA(c, 0, 0), d = u < 1 ? blobD(o[0], o[1] - 40, rad(u), 41, .16, 44) : 'M0,0';
        this.wh.setAttribute('d', d); this.wh2.setAttribute('d', d);
        op(this.wh, .7 * (1 - ss(.75, 1, u))); op(this.wh2, 1 - ss(.75, 1, u));
        // 金框收拢成两块圆角的半透明面板（No.04 的界面）
        const k = eio(clamp((u - .05) / .5)), o2 = 1 - ss(.5, .62, u);
        op(this.nv, 1 - ss(0, .3, u));
        const ra = [lerp(30, 56, k), lerp(30, 56, k), lerp(1860, 440, k), lerp(1020, 132, k)], rb = [lerp(30, 1424, k), lerp(30, 56, k), lerp(1860, 440, k), lerp(1020, 96, k)];
        const st = `rgb(${Math.round(lerp(233, 156, k))},${Math.round(lerp(185, 208, k))},${Math.round(lerp(73, 255, k))})`;
        for (const [e, r] of [[this.pa, ra], [this.pb, rb]]) at(e, { x: f1(r[0]), y: f1(r[1]), width: f1(r[2]), height: f1(r[3]), rx: f1(k * 24), 'fill-opacity': f2(k * .62), stroke: st, 'stroke-width': f1(lerp(8, 2, k)), opacity: f2(o2) });
        this.cns.forEach((e, i) => { const p = [[30, 30], [1890, 30], [30, 1050], [1890, 1050]][i], q2 = [[56, 56], [1864, 56], [56, 188], [1864, 152]][i], kk = 1 - k * .7; at(e, { transform: `translate(${f1(lerp(p[0], q2[0], k))},${f1(lerp(p[1], q2[1], k))}) scale(${f2(kk)}) translate(${-p[0]},${-p[1]})`, opacity: f2(1 - ss(.2, .45, u)) }); });
      }
    }
  };
})();

/* ======================= No.04 → No.05：走廊窗外的晴空落满樱花，下方滑出半透明对话框，界面换成恋爱游戏 ======================= */
(function () {
  const PKS = ['#ffc6d8', '#ffb3cb', '#ffe0ea', '#ff9fbd'];
  const winC = A => { let x = 0, y = 0, n = 0; A.corrWin.forEach(w => w.forEach(p => { x += p[0]; y += p[1]; n++; })); return [x / n, y / n]; };
  SCENES[3].trans = {
    reveal(u, c) {
      if (u < 0) return null; if (u >= .9) return FULL;
      let d = this.corrWin.map(w => polyCW(w.map(p => [p[0], p[1]]))).join('');
      const yb = 1080 - 300 * eo(inv(.25, .6, u)); if (u > .25) d += `M-50,${f1(yb)}H1970V1130H-50Z`;
      const r = 2300 * eio(inv(.42, .9, u)); if (r > 1) { const o = winC(this); d += circCW(o[0], o[1], r); }
      return d;
    },
    hideA: .9, align: 'move', move: [.3, 1.05],
    pel: { at: .7, dur: .36, wipe: 'fade' },
    fx2: {
      win: [0, 1.6],
      build(g) {
        transDefs();
        const R = rng(405); this.pt = [];
        g.innerHTML = Array.from({ length: 80 }, (_, i) => `<path d="M0,-9C7,-9 10,-2 7,4C5,8 0,10 0,7C0,10 -5,8 -7,4C-10,-2 -7,-9 0,-9Z" fill="${PKS[i % 4]}" stroke="#ff8fb4" stroke-width=".8"/>`).join('');
        this.pe = qa(g, 'path'); this.pe.forEach(() => this.pt.push([R(), R(), R(), R(), R()]));
      },
      update(u, c) {
        const W = this.corrWin;
        this.pe.forEach((e, i) => {
          const p = this.pt[i], w = W[Math.floor(p[0] * W.length) % W.length], born = p[1] * .45, age = u - born;
          if (age < 0) { e.setAttribute('opacity', 0); return; }
          // 从窗里飘出来，散满整个画面
          const a = w[0], b = w[2], x0 = lerp(a[0], b[0], p[2]), y0 = lerp(b[1], a[1], p[3]);
          const x = x0 + age * (160 + p[4] * 520) + Math.sin(age * 4 + i) * 30, y = y0 + age * (120 + p[2] * 260) + age * age * 120;
          at(e, { opacity: f2(Math.min(1, age * 6) * (1 - ss(1.2, 1.6, u))), transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(age * 300 * (p[3] - .5) + p[4] * 360)}) scale(${f2(1.2 + p[4] * 1.6)})` });
        });
      }
    }
  };
})();

/* ======================= No.05 → No.06：对话框鼓起变圆、像气泡一样弹开，画面弹成糖果色，立绘缩成二头身 ======================= */
(function () {
  const PK = '#ff8fb4', CANDY = ['#ff8ab8', '#5fd0a8', '#ffb83a', '#a888f0', '#6ab8ff', '#fff19a'];
  SCENES[4].trans = {
    reveal(u) { if (u < .3) return null; if (u >= .62) return FULL; return circCW(960, 640, 2300 * eo(inv(.3, .62, u))); },
    hideA: .62, align: 'move', move: [.3, .95],
    pel: { at: .58, dur: .26, wipe: 'radial', edge: 40 },
    fx2: {
      win: [0, 1.0],
      build(g) {
        transDefs();
        const R = rng(506);
        g.innerHTML = `<g class="bb"><rect class="bx" fill="url(#s05box)" stroke="${PK}" stroke-width="3"/><path class="hl" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".85"/></g><circle class="ring" fill="none" stroke="#fff" stroke-width="16"/>` +
          Array.from({ length: 16 }, (_, i) => `<circle class="dr" r="${f1(8 + R() * 12)}" fill="${i % 3 ? '#fff' : PK}"/>`).join('') +
          Array.from({ length: 46 }, (_, i) => `<rect class="cf" x="-9" y="-5" width="18" height="10" rx="4" fill="${CANDY[i % 6]}"/>`).join('');
        this.bx = q(g, '.bx'); this.hl = q(g, '.hl'); this.bb = q(g, '.bb'); this.ring = q(g, '.ring'); this.dr = qa(g, '.dr'); this.cf = qa(g, '.cf');
        this.cfp = this.cf.map(() => [R() * TAU, 500 + R() * 1100, (R() - .5) * 900, R()]);
      },
      update(u) {
        // 对话框鼓起变圆（带一点回弹），在 u≈0.3 弹开
        const k = eob(clamp(u / .3)), pop = u >= .3;
        const w = lerp(1620, 780, k), h = lerp(226, 780, k), cx = 960, cy = lerp(939, 600, k), rx = lerp(24, 390, k);
        vis(this.bb, !pop);
        if (!pop) { at(this.bx, { x: f1(cx - w / 2), y: f1(cy - h / 2), width: f1(w), height: f1(h), rx: f1(Math.min(rx, w / 2, h / 2)) }); this.hl.setAttribute('d', `M${f1(cx - w * .32)},${f1(cy - h * .22)}Q${f1(cx - w * .3)},${f1(cy - h * .4)} ${f1(cx - w * .12)},${f1(cy - h * .42)}`); op(this.hl, ss(.1, .25, u) * .85); }
        const pk = inv(.3, .62, u);
        at(this.ring, { cx: 960, cy: 600, r: f1(390 + pk * 900), opacity: pop && pk < 1 ? f2(1 - pk) : 0, 'stroke-width': f1(16 * (1 - pk) + 2) });
        this.dr.forEach((e, i) => { const a = i / 16 * TAU, rr = 390 + eo(pk) * 520; at(e, { cx: f1(960 + Math.cos(a) * rr), cy: f1(600 + Math.sin(a) * rr + pk * pk * 200), opacity: pop && pk < 1 ? f2(1 - pk) : 0 }); });
        // 糖果色的彩屑炸开
        const ck = inv(.3, 1.0, u);
        this.cf.forEach((e, i) => { const p = this.cfp[i], r = eo(ck) * p[1]; at(e, { opacity: pop && ck < 1 ? f2(1 - ss(.6, 1, ck)) : 0, transform: `translate(${f1(960 + Math.cos(p[0]) * r)},${f1(600 + Math.sin(p[0]) * r * .7 + ck * ck * 260)}) rotate(${f1(p[2] * ck)}) scale(${f2(1 + p[3])})` }); });
      }
    }
  };
})();

/* ======================= No.06 → No.07：糖果房子像积木一样向两侧收起，露出后面的舞台，糖果色炸成彩带和荧光棒 ======================= */
(function () {
  const LN = '#7a4a5a', HOUSE = ['#ffd0e2', '#d8f6e8', '#fff4b8', '#e8dcff', '#d8eeff', '#ffb3d1'];
  const NEON = ['#ff3fa8', '#2be8ff', '#ffe14a', '#b04aff'], RIB = ['#ff5a8a', '#5fd0a8', '#ffb83a', '#a888f0', '#ff8ab8', '#6ab8ff'];
  const hw = u => 1500 * eio(inv(0, .8, u));
  const band = (cx, w) => {
    if (w <= 0) return null;
    const L = [], Rr = [];
    for (let j = 0; j <= 20; j++) { const y0 = j * 60 - 60, off = (hash(j * 3.1) * .6 + .2) * 70 * Math.min(1, w / 200); L.push([cx - w - off, y0], [cx - w - off, y0 + 60]); Rr.push([cx + w + off, y0], [cx + w + off, y0 + 60]); }
    return polyCW(L.concat(Rr.reverse()));
  };
  SCENES[5].trans = {
    reveal(u, c) { if (u < 0) return null; if (u >= .8) return FULL; return band(c.pA.o[0], hw(u)); },
    hideA: .8, hold: .75, blend: 1.75,
    pel: { at: .42, dur: .26, wipe: 'radial', edge: 50 },
    fx: {
      win: [0, .95],
      build(g) {
        transDefs();
        g.innerHTML = Array.from({ length: 2 * 19 }, (_, i) => `<g class="bk"><rect x="-32" y="-32" width="64" height="64" rx="10" fill="${HOUSE[i % 6]}" stroke="${LN}" stroke-width="4"/><path d="M-32,-10H32" stroke="${LN}" stroke-width="3" opacity=".4"/><circle cx="0" cy="12" r="7" fill="#9fd8ff" stroke="#fff" stroke-width="3"/></g>`).join('');
        this.bk = qa(g, '.bk');
      },
      update(u, c) {
        const cx = c.pA.o[0], w = hw(u);
        // 两侧的“房子”收成一摞摞积木，翻着跟头往外退
        this.bk.forEach((e, i) => {
          const side = i < 19 ? -1 : 1, j = i % 19, y = j * 60 - 30, off = (hash(j * 3.1) * .6 + .2) * 70;
          const x = cx + side * (w + off + 34), tumble = side * (u * 520 + j * 13);
          at(e, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(tumble)}) scale(${f2(1 - ss(.5, .9, u) * .6)})`, opacity: f2((u > .02 ? 1 : 0) * (1 - ss(.65, .9, u))) });
        });
      }
    },
    fx2: {
      win: [.3, 1.7],
      build(g) {
        const R = rng(607); this.sp = [];
        g.innerHTML = Array.from({ length: 70 }, (_, i) => i % 3 === 0 ? `<rect x="-7" y="-46" width="14" height="92" rx="7" fill="${NEON[i % 4]}" filter="url(#tGlow)"/>` : `<path d="M0,0c10,-14 22,-14 30,0s20,14 30,0s20,-14 30,0" fill="none" stroke="${RIB[i % 6]}" stroke-width="9" stroke-linecap="round"/>`).join('');
        this.sx = Array.prototype.slice.call(g.children); this.sx.forEach(() => this.sp.push([R() * TAU, 600 + R() * 1200, (R() - .5) * 1400, R()]));
      },
      update(u, c) {
        const o = pelPt(c, 0, -220), k = inv(.32, 1.7, u);
        this.sx.forEach((e, i) => { const p = this.sp[i], r = eo(clamp(k * 1.6)) * p[1]; at(e, { opacity: f2(ss(.32, .38, u) * (1 - ss(.7, 1, k))), transform: `translate(${f1(o[0] + Math.cos(p[0]) * r)},${f1(o[1] + Math.sin(p[0]) * r * .8 + k * k * 500)}) rotate(${f1(p[2] * k + p[0] * 57)}) scale(${f2(.8 + p[3] * .8)})` }); });
      }
    }
  };
})();

/* ======================= No.07 → No.08：最后一个音符落下，舞台灯熄灭又亮起，亮起时已是手绘的街道和晴空 ======================= */
(function () {
  SCENES[6].trans = {
    reveal(u) { return u < .42 ? null : FULL; },
    hideA: .44, hold: .55, blend: 1.6,
    pel: { at: .2, dur: .2, wipe: 'fade' },
    fx: {
      win: [0, .62],
      build(g) {
        def(`<radialGradient id="t07spot" gradientUnits="userSpaceOnUse" cx="960" cy="600" r="420"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".15"/><stop offset=".85" stop-color="#050208" stop-opacity=".97"/><stop offset="1" stop-color="#050208" stop-opacity=".97"/></radialGradient>
          <linearGradient id="t07cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset="1" stop-color="#fff8e0" stop-opacity=".22"/></linearGradient>`);
        g.innerHTML = `<rect class="bk" x="-200" y="-200" width="2320" height="1480" fill="url(#t07spot)"/><path class="cone" fill="url(#t07cone)" style="mix-blend-mode:screen"/>`;
        this.bkR = q(g, '.bk'); this.cone = q(g, '.cone'); this.spot = q(DEFS, '#t07spot');
      },
      update(u, c) {
        const o = pelPt(c, 0, -200), r = 300 * c.P.s + 120;
        at(this.spot, { cx: f1(o[0]), cy: f1(o[1]), r: f1(r) });
        const k = ss(0, .06, u) * (1 - ss(.42, .56, u));
        op(this.bkR, k);
        const b = pelPt(c, 0, 40);
        this.cone.setAttribute('d', `M${f1(o[0] - 40)},-20L${f1(o[0] + 40)},-20L${f1(b[0] + r * .8)},${f1(b[1])}L${f1(b[0] - r * .8)},${f1(b[1])}Z`);
        op(this.cone, ss(.08, .16, u) * (1 - ss(.38, .46, u)));
      }
    }
  };
})();

/* ======================= No.08 → No.09：骑上坡顶，平涂的天空变得通透，逆光光晕洒下，两侧黑边退开成宽银幕 ======================= */
(function () {
  SCENES[7].trans = {
    reveal(u, c) {
      if (u < 0) return null; if (u >= .8) return FULL;
      const y = lerp(pelPtA(c, 0, 0)[1] - 30, 1200, eio(inv(.35, .8, u)));
      return `M-60,-60H1980V${f1(y)}H-60Z`;
    },
    fadeB: u => ss(0, .42, u),
    hideA: .8, hold: .95, blend: 1.85,
    pel: { at: .55, dur: .3, wipe: 'fwd', edge: 0 },
    fx: {
      win: [0, .75],
      build(g) {
        g.innerHTML = `<rect class="bl" x="0" y="0" width="240" height="1080" fill="#000"/><rect class="br" x="1680" y="0" width="240" height="1080" fill="#000"/><rect class="bt" x="0" y="0" width="1920" height="140" fill="#000"/><rect class="bb" x="0" y="940" width="1920" height="140" fill="#000"/>`;
        this.bl = q(g, '.bl'); this.br = q(g, '.br'); this.bt = q(g, '.bt'); this.bb2 = q(g, '.bb');
      },
      update(u) {
        // 两侧的竖黑边向外退开，上下的宽银幕黑边压进来
        const k = eio(inv(.05, .55, u)), k2 = eio(inv(.12, .6, u));
        this.bl.setAttribute('x', f1(-240 * k)); this.br.setAttribute('x', f1(1680 + 240 * k));
        this.bt.setAttribute('y', f1(-140 * (1 - k2))); this.bb2.setAttribute('y', f1(940 + 140 * (1 - k2)));
      }
    },
    fx2: {
      win: [0, 1.4],
      build(g) {
        g.innerHTML = `<g style="mix-blend-mode:screen"><circle class="gl" r="520" fill="url(#s09flare)"/>${[0, 1, 2, 3].map(i => `<circle class="fl" r="${[40, 70, 26, 110][i]}" fill="${['#ffe8a8', '#a8e8ff', '#ffffff', '#ffd0f0'][i]}" opacity=".35"/>`).join('')}<path class="st" d="M-1100,0H1100" stroke="#fff" stroke-width="5" opacity=".6"/></g>`;
        this.gl = q(g, '.gl'); this.fl = qa(g, '.fl'); this.st = q(g, '.st');
      },
      update(u) {
        // 逆光的光晕从右上洒下来
        const k = ss(.05, .35, u) * (1 - ss(.8, 1.4, u));
        at(this.gl, { cx: f1(1450 - u * 120), cy: 200, opacity: f2(k), r: f1(420 + u * 260) });
        this.fl.forEach((e, i) => { const t = [.3, .55, .8, 1.1][i]; at(e, { cx: f1(lerp(1450, 600, t) - u * 120 * t), cy: f1(lerp(200, 900, t)), opacity: f2(k * .5) }); });
        at(this.st, { transform: `translate(1450,200) rotate(${f1(-18 + u * 6)})`, opacity: f2(k * .5) });
      }
    }
  };
})();

/* ======================= No.09 → No.10：电车开走后画面定格、褪色泛黄成一张老照片；镜头拉远，照片印在报纸版面上 ======================= */
(function () {
  const SEP = [.44, .82, .2, 0, .03, .37, .72, .17, 0, .02, .27, .54, .13, 0, 0, 0, 0, 0, 1, 0], ID = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  // 报纸的镜头：先贴着照片（照片铺满屏幕），再拉远到整版
  function camB(u) {
    const B = SCENES[9], z = 1 + .05 * eio(clamp((u + 2) / 8)), PS9 = B.PS9 || 544 / 1920;
    const cp = [900 + (932 - 900) * z, 600 + (586 - 600) * z], s0 = 1920 / (560 * z);
    const k = eio(inv(.36, 1.55, u)), s = Math.pow(s0, 1 - k), vc = [lerp(cp[0], 960, k), lerp(cp[1], 540, k)];
    return [s, 0, 0, s, 960 - s * vc[0], 540 - s * vc[1]];
  }
  SCENES[8].trans = {
    reveal(u) { return u < .36 ? null : FULL; },
    hideA: .36, align: 'move', move: [.45, 1.55],
    camB(u) { return u < 1.56 ? camB(u) : null; },
    filterA: () => 'url(#n10sepA)',
    // 定格的画面缩进照片的白边里（与报纸上那张照片严丝合缝）
    camA(u) { const k = 1 - (1 - 544 / 560) * eio(inv(.1, .34, u)); return [k, 0, 0, k, 960 * (1 - k), 540 * (1 - k)]; },
    pel: { at: 1.2, dur: .34, wipe: 'fwd', edge: 14 },
    fx: {
      win: [0, .4],
      build(g) {
        g.innerHTML = `<g class="bd"><path fill="#000" fill-rule="evenodd" d="M-10,-10H1930V1090H-10Z M27.4,15.4V1064.6H1892.6V15.4Z"/><rect x="-10" y="-10" width="37.4" height="1100" fill="#f4ead0"/><rect x="1892.6" y="-10" width="37.4" height="1100" fill="#f4ead0"/></g><rect class="fl" x="-100" y="-100" width="2120" height="1280" fill="#fff8e8"/>`;
        this.fl = q(g, '.fl'); this.bd = q(g, '.bd');
      },
      update(u) {
        // 定格的一瞬（快门闪一下），颜色褪成泛黄的老照片，四周出现照片的白边
        const k = ss(0, .3, u), m = q(DEFS, '#n10sepA .m');
        if (m) m.setAttribute('values', ID.map((v, i) => f2(lerp(v, SEP[i], k) * 100) / 100).join(' '));
        op(this.fl, bump(u - .02, .06) * .55);
        op(this.bd, ss(.1, .2, u));
      }
    }
  };
})();

/* ======================= No.10 → No.11：铅字重排成编号和条码，泛黄的纸面换成灰白的设备面板，警示斜纹亮起，照片变成监控画面 ======================= */
(function () {
  const INK = '#2e2216', YL = '#f2c200';
  const pz = (x, y, u) => { const m = SCENES[9].camM(6 + (u || 0)); return [m[1] + 900 + (x - 900) * m[0], m[2] + 600 + (y - 600) * m[0]]; };   // 报纸版面 → 屏幕
  const photo = u => { const a = pz(660, 428, u), b = pz(1204, 744, u); return [a[0], a[1], b[0], b[1]]; };
  const TG = [[1520, 300], [96, 880], [1640, 900], [96, 150]];
  SCENES[9].trans = {
    reveal(u) {
      if (u < 0) return null; if (u >= .85) return FULL;
      // 先是照片框里换成监控画面，然后监控画面撑满整张版面
      const r = photo(u), k = eio(inv(.28, .85, u)), b = [lerp(r[0], -40, k), lerp(r[1], -40, k), lerp(r[2], 1960, k), lerp(r[3], 1120, k)];
      return rrD(b[0], b[1], b[2] - b[0], b[3] - b[1], 6 + 40 * k);
    },
    hideA: .86, hold: .9, blend: 1.85,
    pel: { at: .6, dur: .3, wipe: 'down', edge: 0 },
    fx: {
      win: [0, 1.1],
      build(g) {
        transDefs();
        const R = rng(1011); this.tl = [];
        const cols = [0, 1, 4, 5];
        for (let i = 0; i < 64; i++) {
          const c = cols[i % 4], row = 2 + Math.floor(i / 4) * 2 + (i % 3), x = 84 + c * 300, y = 430 + row * 15, w = 236 - R() * 8;
          const tg = TG[i % 4], j = Math.floor(i / 4);
          this.tl.push({ a: pz(x, y, 0), w: w * SCENES[9].camM(6)[0], t: [tg[0] + j * 13 + (hash(i) * 4), tg[1]], tw: 3 + Math.floor(hash(i * 7) * 3) * 2, dl: hash(i * 3.3) * .25 });
        }
        g.innerHTML = this.tl.map(() => `<rect fill="${INK}"/>`).join('') + TG.map((t, i) => `<text class="dg" x="${t[0]}" y="${t[1] + 112}" font-family="'JetBrains Mono',Bender" font-weight="700" font-size="24" fill="#ecece8" stroke="#161616" stroke-width="4" paint-order="stroke">${['UNIT-022', 'B-07 · 0330', 'PL-0022', 'CAM 11'][i]}</text>`).join('') +
          `<rect class="hz" x="-20" y="0" width="1960" height="34" fill="url(#s11haz)"/><rect class="hz" x="-20" y="1046" width="1960" height="34" fill="url(#s11haz)"/>`;
        this.tr = qa(g, 'rect').slice(0, 64); this.dg = qa(g, '.dg'); this.hz = qa(g, '.hz');
      },
      update(u) {
        // 报纸上的铅字（一行行黑条）脱离版面，重新排成竖条码
        this.tr.forEach((e, i) => {
          const L = this.tl[i], k = eio(inv(.04 + L.dl, .5 + L.dl, u));
          const a = L.a, hk = ss(.6, 1, k);
          at(e, { x: f1(lerp(a[0], L.t[0], k)), y: f1(lerp(a[1], L.t[1], k) - 96 * hk * 0), width: f1(lerp(L.w, L.tw, ss(0, .55, k))), height: f1(lerp(5.8, 96, hk)), fill: hk > .5 ? '#ecece8' : INK, opacity: f2(1 - ss(.85, 1.1, u)) });
        });
        this.dg.forEach(e => op(e, ss(.5, .65, u) * (1 - ss(.85, 1.1, u))));
        // 警示黄的斜纹亮起
        this.hz.forEach(e => op(e, ss(.35, .5, u) * (1 - ss(.85, 1.05, u)) * (.75 + .25 * Math.sin(u * 40))));
      }
    }
  };
})();

/* ======================= No.11 → No.12：监控画面切到结构图模式，机件一件件拆开、压平，褪成蓝底白线稿 ======================= */
(function () {
  const WL = '#eaf2ff', YL = '#f2c200', K = '#161616';
  SCENES[10].trans = {
    reveal(u) { return u < 0 ? null : FULL; },
    fadeB: u => .78 * ss(.02, .3, u) + .22 * ss(.55, .72, u),
    hideA: .74, hold: .85, blend: 1.8,
    pel: { at: .55, dur: .3, wipe: 'down', edge: 0 },
    fx: {
      win: [0, 1.0],
      build(g) {
        transDefs();
        g.innerHTML = Array.from({ length: 14 }, () => `<g class="bx"><path class="f" fill="none" stroke="${WL}" stroke-width="3" stroke-linejoin="round"/><path class="d" fill="none" stroke="${WL}" stroke-width="1.2" stroke-dasharray="8 6"/></g>`).join('') +
          `<rect class="scan" x="-20" width="1960" height="10" fill="${WL}" opacity=".8"/><g class="mode"><rect x="660" y="470" width="600" height="110" fill="${K}" fill-opacity=".85" stroke="${YL}" stroke-width="4"/><text x="960" y="520" text-anchor="middle" font-family="Bender,Bahnschrift" font-weight="900" font-size="34" letter-spacing="6" fill="${YL}">MODE ▸ STRUCTURE</text><text x="960" y="562" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="900" font-size="30" fill="${WL}">结构图模式</text></g>`;
        this.bx = qa(g, '.bx'); this.scan = q(g, '.scan'); this.mode = q(g, '.mode');
      },
      update(u, c) {
        const A = this, cam = A.camAt(6 + u), ox = cam[0], oy = cam[1] + 40, rp = c.pA.o;
        const vis9 = A.boxes.map(it => { const p0 = A.OB(it[0], it[1], 0); return { it, sx: p0[0] + ox, sy: p0[1] + oy }; }).filter(b => b.sx > -300 && b.sx < 2100).slice(0, 14);
        this.bx.forEach((e, i) => {
          const b = vis9[i]; if (!b) { e.setAttribute('opacity', 0); return; }
          const [x, z, sx, sz, h] = b.it, pt = (a, bb, hh) => { const q2 = A.OB(x + a, z + bb, hh); return [q2[0] + ox, q2[1] + oy]; };
          const fr = [pt(0, 0, 0), pt(sx, 0, 0), pt(sx, 0, h), pt(0, 0, h)], sd = [pt(sx, 0, 0), pt(sx, sz, 0), pt(sx, sz, h), pt(sx, 0, h)], tp = [pt(0, 0, h), pt(sx, 0, h), pt(sx, sz, h), pt(0, sz, h)];
          // 一件件拆开：向外飘开，再压平成图纸上的线稿
          const t0 = .06 + i * .035, k = eio(inv(t0, t0 + .4, u)), fl = eio(inv(t0 + .25, t0 + .55, u));
          const cxb = (fr[0][0] + tp[2][0]) / 2, cyb = (fr[0][1] + tp[2][1]) / 2, dx = cxb - rp[0], dy = cyb - rp[1] - 200, L = Math.hypot(dx, dy) || 1;
          e.setAttribute('transform', `translate(${f1(dx / L * 140 * k)},${f1(dy / L * 90 * k - 60 * k)}) translate(${f1(cxb)},${f1(fr[0][1])}) scale(1,${f2(1 - .82 * fl)}) translate(${f1(-cxb)},${f1(-fr[0][1])})`);
          q(e, '.f').setAttribute('d', P(fr, true) + P(sd, true) + P(tp, true));
          q(e, '.d').setAttribute('d', `M${f1(fr[0][0] - 30)},${f1(fr[0][1] + 24)}H${f1(sd[1][0] + 30)}`);
          e.setAttribute('opacity', f2(ss(t0 - .04, t0, u) * (1 - ss(.75, 1, u))));
        });
        at(this.scan, { y: f1(lerp(-20, 1100, eio(clamp(u / .3)))), opacity: f2(.8 * (1 - ss(.26, .32, u))) });
        at(this.mode, { opacity: f2(ss(.02, .08, u) * (1 - ss(.45, .6, u))), transform: `translate(960,525) scale(1,${f2(eob(clamp(u / .12)))}) translate(-960,-525)` });
      }
    }
  };
})();

/* ======================= No.12 → No.13：蓝底从车轮下洇开成宣纸，白线化成浓淡墨线，山峦从网格里浮起 ======================= */
(function () {
  const rad = u => 20 + 2500 * Math.pow(eio(clamp(u / 1.1)), 1.25);
  SCENES[11].trans = {
    reveal(u, c) { if (u < 0) return null; if (u >= 1.1) return FULL; const o = pelPtA(c, 0, 4); return blobD(o[0], o[1], rad(u), 51, .3, 60, 2); },
    hideA: 1.1, hold: 1.1, blend: 2.15,
    pel: { at: .82, dur: .36, wipe: 'up', edge: 24 },
    fx: {
      win: [0, 1.5],
      build(g) {
        transDefs();
        def(`<linearGradient id="t12m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c1e" stop-opacity=".55"/><stop offset="1" stop-color="#1c1c1e" stop-opacity="0"/></linearGradient>`);
        const ridge = (y0, amp, seed) => { const R2 = rng(seed); let d = `M-40,${y0 + 400}`; for (let x = -40; x <= 1980; x += 30) d += `L${x},${f1(y0 - (Math.sin(x * .006 + seed) * .5 + .5) * amp - R2() * amp * .25)}`; return d + `L1980,${y0 + 400}Z`; };
        g.innerHTML = `<path class="wash" fill="none" stroke="#3a3a3c" stroke-width="90" opacity=".18" filter="url(#tBlur20)"/><path class="edge" fill="none" stroke="#1c1c1e" stroke-width="3" opacity=".55"/>` +
          [[560, 260, 3], [700, 300, 7], [840, 220, 11]].map((r, i) => `<path class="mt" d="${ridge(r[0], r[1], r[2])}" fill="url(#t12m)" opacity="0"/>`).join('');
        this.wash = q(g, '.wash'); this.edge = q(g, '.edge'); this.mt = qa(g, '.mt');
      },
      update(u, c) {
        const o = pelPtA(c, 0, 4), d = u < 1.1 ? blobD(o[0], o[1], rad(u), 51, .3, 60, 2) : 'M0,0';
        this.wash.setAttribute('d', d); this.edge.setAttribute('d', d);
        op(this.wash, .18 * (1 - ss(.9, 1.1, u))); op(this.edge, .55 * (1 - ss(.9, 1.1, u)));
        // 山峦从图纸的网格里浮起来（淡墨）
        this.mt.forEach((e, i) => { const k = eo(inv(.2 + i * .12, .9 + i * .1, u)); at(e, { transform: `translate(0,${f1((1 - k) * 260)})`, opacity: f2(k * .9 * (1 - ss(1.1, 1.5, u))) }); });
      }
    }
  };
})();

/* ======================= No.13 → No.14：江面涌起，浪头从画面后方卷起，墨线换成浮世绘的轮廓线和平涂的蓝，鹈鹕骑上浪下的驿道 ======================= */
(function () {
  const IND = '#1d2a4a';
  const front = u => lerp(-140, 1240, eio(inv(.1, .85, u)));
  const edge = u => (x, i) => 46 * Math.sin(x / 150 + u * 7) + 26 * Math.sin(x / 61 + 1.3) - 30 * Math.max(0, Math.sin(x / 230 + u * 3));
  SCENES[12].trans = {
    reveal(u) { if (u < .1) return null; if (u >= .85) return FULL; return sideD('T', front(u), edge(u)); },
    hideA: .86, hold: .9, blend: 1.9,
    pel: { at: .45, dur: .3, wipe: 'down', edge: 18 },
    fx: {
      win: [0, 1.0],
      build(g) {
        transDefs();
        g.innerHTML = `<path class="sw" fill="#24427a" opacity=".55"/><path class="sw2" fill="none" stroke="#1c1c1e" stroke-width="4" opacity=".5"/><path class="cr" fill="none" stroke="${IND}" stroke-width="7"/><g class="cl">${Array.from({ length: 22 }, () => `<path d="M0,0C-6,10 -4,24 6,30C2,22 4,12 12,8C8,16 10,26 18,30C16,18 14,6 0,0Z" fill="#f4f0e4" stroke="${IND}" stroke-width="2.5"/>`).join('')}</g>`;
        this.sw = q(g, '.sw'); this.sw2 = q(g, '.sw2'); this.cr = q(g, '.cr'); this.cl = qa(g, '.cl path');
      },
      update(u) {
        // 山下的江面先涌起来（淡墨的蓝）
        const yr = 1080 - 300 * eo(inv(0, .35, u)) * (1 - ss(.7, 1, u));
        let d = `M-40,1120`; for (let x = -40; x <= 1980; x += 40) d += `L${x},${f1(yr + 22 * Math.sin(x / 90 + u * 9))}`; d += 'L1980,1120Z';
        this.sw.setAttribute('d', d); op(this.sw, .55 * (1 - ss(.7, 1, u)));
        let d2 = 'M-40,' + f1(yr); for (let x = -40; x <= 1980; x += 40) d2 += `L${x},${f1(yr + 22 * Math.sin(x / 90 + u * 9))}`; this.sw2.setAttribute('d', d2); op(this.sw2, .5 * (1 - ss(.7, 1, u)));
        // 浪头从画面后方卷过来：浮世绘的轮廓线和浪爪沿着前沿
        const y = front(u), e = edge(u), on = u > .1 && u < .85;
        let d3 = ''; for (let x = -40; x <= 1980; x += 30) d3 += (x === -40 ? 'M' : 'L') + x + ',' + f1(y + e(x));
        this.cr.setAttribute('d', on ? d3 : 'M0,0');
        this.cl.forEach((c, i) => { const x = -20 + i * 92, yy = y + e(x); at(c, { transform: `translate(${f1(x)},${f1(yy - 4)}) rotate(${f1(200 + Math.sin(i * 1.7 + u * 6) * 30)}) scale(${f2(1.6 + (i % 3) * .4)})`, opacity: on ? 1 : 0 }); });
      }
    }
  };
})();

/* ======================= No.14 → No.15：套色的版面一层层分开、立起，成了纸雕的层次，海浪退成一片森林 ======================= */
(function () {
  const ST = [[.18, 420], [.36, 652], [.52, 776], [.7, 1200]];
  const yE = u => { let y = -80, t0 = 0; for (const [t, yy] of ST) { if (u < t0) break; y = lerp(y, yy, eio(inv(t0 + .02, t, u))); t0 = t; } return y; };
  const scal = (x) => -18 * Math.abs(Math.sin(x / 48));
  SCENES[13].trans = {
    reveal(u) { if (u < .02) return null; if (u >= .72) return FULL; return sideD('T', yE(u), scal); },
    hideA: .72, hold: .9, blend: 1.85,
    pel: { at: .6, dur: .3, wipe: 'up', edge: 14 },
    fx: {
      win: [0, .8],
      build(g) { transDefs(); g.innerHTML = `<path class="sh" fill="none" stroke="#06141c" stroke-width="16" opacity=".4" filter="url(#tBlur8)"/><path class="ed" fill="none" stroke="#fbf8f0" stroke-width="3"/>`; this.sh = q(g, '.sh'); this.ed = q(g, '.ed'); },
      update(u) {
        // 新的一层纸压在旧画面上：边缘是剪出来的圆弧，带一道投影
        const y = yE(u); let d = ''; for (let x = -40; x <= 1980; x += 12) d += (x === -40 ? 'M' : 'L') + x + ',' + f1(y + scal(x));
        const on = u > .02 && u < .72; this.sh.setAttribute('d', on ? d : 'M0,0'); this.ed.setAttribute('d', on ? d : 'M0,0');
        this.sh.setAttribute('transform', 'translate(0,10)');
      }
    }
  };
})();

/* ======================= No.15 → No.16：纸月亮的光透过纸层洒落，纸层融成一地斑驳的光斑和短笔触 ======================= */
(function () {
  const MOON = [1420, 330];
  const dabs = (() => { const R = rng(1516), o = []; for (let j = 0; j < 11; j++) for (let i = 0; i < 15; i++) { const x = -40 + i * 140 + (R() - .5) * 90, y = -20 + j * 112 + (R() - .5) * 80, dm = Math.hypot(x - MOON[0], y - MOON[1]) / 1700; o.push({ x, y, t: .06 + .55 * dm + .2 * R(), r: 95 + R() * 70 }); } return o; })();
  const dabR = (d, u) => d.r * eo(inv(d.t, d.t + .22, u));
  SCENES[14].trans = {
    reveal(u) { if (u < .06) return null; if (u >= 1.0) return FULL; let s = ''; for (const d of dabs) { const r = dabR(d, u); if (r > 1) s += circCW(d.x, d.y, r); } return s || null; },
    hideA: 1.0, hold: 1.0, blend: 2.0,
    pel: { at: .76, dur: .34, wipe: 'fade' },
    fx: {
      win: [0, 1.1],
      build(g) {
        transDefs();
        def(`<radialGradient id="t15spot"><stop offset="0" stop-color="#fff6d0" stop-opacity=".75"/><stop offset=".6" stop-color="#ffe8a0" stop-opacity=".25"/><stop offset="1" stop-color="#ffe8a0" stop-opacity="0"/></radialGradient>`);
        g.innerHTML = dabs.map(() => `<ellipse fill="url(#t15spot)"/>`).join('');
        this.de = qa(g, 'ellipse');
      },
      update(u) {
        // 光斑：每一处新笔触落下时先亮一下
        this.de.forEach((e, i) => { const d = dabs[i], k = inv(d.t - .05, d.t + .3, u); at(e, { cx: f1(d.x), cy: f1(d.y), rx: f1(d.r * 1.3 * eo(k)), ry: f1(d.r * .9 * eo(k)), opacity: k > 0 && k < 1 ? f2(Math.sin(k * PI) * .9) : 0 }); });
      }
    },
    fx2: {
      win: [0, 1.1],
      build(g) {
        g.innerHTML = `<g style="mix-blend-mode:screen">${Array.from({ length: 8 }, (_, i) => { const a = 1.75 + i * .17, L = 2200; return `<path class="ray" d="M${MOON[0]},${MOON[1]}L${f1(MOON[0] + Math.cos(a - .035) * L)},${f1(MOON[1] + Math.sin(a - .035) * L)}L${f1(MOON[0] + Math.cos(a + .035) * L)},${f1(MOON[1] + Math.sin(a + .035) * L)}Z" fill="#fff2c0" opacity=".0"/>`; }).join('')}<circle cx="${MOON[0]}" cy="${MOON[1]}" r="230" fill="url(#t15spot)"/></g>`;
        this.rays = qa(g, '.ray'); this.mg = g.firstChild;
      },
      update(u) {
        // 纸月亮的光，从纸层的缝隙里洒下来
        this.rays.forEach((e, i) => op(e, (.12 + .1 * Math.sin(u * 6 + i)) * ss(0, .25, u) * (1 - ss(.7, 1.1, u))));
        op(this.mg, ss(0, .2, u) * (1 - ss(.75, 1.1, u)));
      }
    }
  };
})();

/* ======================= No.16 → No.17：柔和的笔触从一侧收成整齐的网点，轮廓加粗成黑线，颜色跳成红黄蓝；扫过鹈鹕时它也变成漫画 ======================= */
(function () {
  const fx0 = u => lerp(2080, -260, inv(0, 1.06, u));
  SCENES[15].trans = {
    reveal(u) { if (u <= 0) return null; if (u >= 1.06) return FULL; return sideD('R', fx0(u), (y, i) => (i % 2 ? 10 : -10)); },
    hideA: 1.06, hold: .8, blend: 1.9,
    pel: { at: .44, dur: .16, wipe: 'fwd', edge: 0 },
    fx: {
      win: [0, 1.1],
      build(g) {
        transDefs();
        def([9, 7, 5, 3].map((r, i) => `<pattern id="t16d${i}" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="${r}" fill="${['#111', '#e8202a', '#1a5ae8', '#111'][i]}"/></pattern>`).join(''));
        g.innerHTML = [0, 1, 2, 3].map(i => `<rect class="hd" y="-40" width="64" height="1160" fill="url(#t16d${i})"/>`).join('') + `<rect class="ry" y="-40" width="26" height="1160" fill="#ffe21a"/><rect class="rr" y="-40" width="22" height="1160" fill="#e8202a"/><rect class="rb" y="-40" width="22" height="1160" fill="#1a5ae8"/><rect class="kl" y="-40" width="14" height="1160" fill="#111"/>`;
        this.hd = qa(g, '.hd'); this.cb = [q(g, '.ry'), q(g, '.rr'), q(g, '.rb')]; this.kl = q(g, '.kl');
      },
      update(u) {
        // 前沿外：笔触收成越来越大的网点；前沿：一道粗黑线；前沿内：红黄蓝的色块一闪
        const x = fx0(u), on = u > 0 && u < 1.06;
        this.hd.forEach((e, i) => at(e, { x: f1(x - 64 - i * 64), opacity: on ? .85 - i * .15 : 0 }));
        this.cb.forEach((e, i) => at(e, { x: f1(x + i * 24), opacity: on ? .9 : 0 }));
        at(this.kl, { x: f1(x - 7), opacity: on ? 1 : 0 });
      }
    }
  };
})();

/* ======================= No.17 → No.18：漫画格框被喷漆一笔笔盖过，网点变成砖墙上的喷漆和贴纸 ======================= */
(function () {
  const SPR = ['#ff2bd6', '#2bffe0', '#fff12b', '#ff6a1a', '#8a2bff'];
  // 一笔笔：[x0,y0,x1,y1,开始,结束]
  const STK = [[-60, 340, 1980, 340, 0, .22], [650, -60, 650, 770, .1, .3], [1980, 770, -60, 770, .2, .42], [1250, 340, 1250, 770, .3, .44], [-60, 30, 1980, 50, .36, .5], [30, -60, 40, 1140, .42, .56]];
  const PAN = [[340, 185], [1270, 185], [340, 555], [950, 555], [1570, 555], [960, 910]];
  const band = (s, k, w) => { const dx = s[2] - s[0], dy = s[3] - s[1], L = Math.hypot(dx, dy), nx = -dy / L * w / 2, ny = dx / L * w / 2, ex = s[0] + dx * k, ey = s[1] + dy * k; return polyCW([[s[0] + nx, s[1] + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [s[0] - nx, s[1] - ny]]); };
  SCENES[16].trans = {
    reveal(u) {
      if (u <= 0) return null; if (u >= .86) return FULL;
      let d = ''; STK.forEach(s => { const k = eio(inv(s[4], s[5], u)); if (k > 0) d += band(s, k, 120); });
      PAN.forEach((p, i) => { const r = 1300 * eio(inv(.44 + i * .05, .8, u)); if (r > 1) d += circCW(p[0], p[1], r); });
      return d || null;
    },
    hideA: .86, hold: .9, blend: 1.9,
    pel: { at: .55, dur: .3, wipe: 'fwd', edge: 22 },
    fx: {
      win: [0, 1.3],
      build(g) {
        transDefs();
        g.innerHTML = STK.map((s, i) => `<g class="sk"><path class="p" d="M${s[0]},${s[1]}L${s[2]},${s[3]}" stroke="${SPR[i % 5]}" stroke-width="90" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1 1" filter="url(#s18soft)" opacity=".92"/><path class="p2" d="M${s[0]},${s[1]}L${s[2]},${s[3]}" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1 1" opacity=".5"/>${Array.from({ length: 6 }, (_, j) => `<rect class="dp" width="9" rx="4.5" fill="${SPR[i % 5]}"/>`).join('')}</g>`).join('');
        this.sk = qa(g, '.sk');
      },
      update(u) {
        // 喷罐沿着格框一笔笔扫过去，流下几道漆痕
        this.sk.forEach((e, i) => {
          const s = STK[i], k = eio(inv(s[4], s[5], u)), off = f2(1 - k);
          qa(e, '.p,.p2').forEach(p => p.setAttribute('stroke-dashoffset', off));
          qa(e, '.dp').forEach((r, j) => { const t = (j + .5) / 6; if (t > k) { r.setAttribute('height', 0); return; } const x = lerp(s[0], s[2], t), y = lerp(s[1], s[3], t); at(r, { x: f1(x - 4.5 + (hash(i * 9 + j) - .5) * 60), y: f1(y + 30), height: f1(20 + 120 * ss(0, .5, u - s[4] - t * (s[5] - s[4]))) }); });
          op(e, 1 - ss(.9, 1.3, u));
        });
      }
    }
  };
})();

/* ======================= No.18 → No.19：墙上的喷漆碎成一格一格的像素，画面变成横版游戏，鹈鹕也变成像素小人 ======================= */
(function () {
  const PAL = ['#a85a44', '#8a4a3a', '#ff2bd6', '#2bffe0', '#fff12b', '#2a2430', '#9a523e', '#4a4650'];
  const CELLS = (() => { const o = []; for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) o.push({ i, j, x: i * 120, y: j * 120, h: hash(i * 7.7 + j * 3.1) }); return o; })();
  const tOf = (cl, o) => { const dd = Math.hypot(cl.x + 60 - o[0], cl.y + 60 - o[1]) / 2000; return .05 + .55 * dd + .14 * cl.h; };
  // 鹈鹕的像素化：一格格方块翻成像素小人
  const pixWipe = (k, c) => {
    const sq = [], S = 40;
    for (let y = -480; y < 40; y += S) for (let x = -220; x < 260; x += S) { if (hash(x * .37 + y * .11) * .8 + (y + 480) / 520 * .2 < k * 1.05) sq.push([[x, y], [x + S, y], [x + S, y + S], [x, y + S]]); }
    const box = [[-4600, -4800], [4600, -4800], [4600, 4200], [-4600, 4200]];
    return { nw: sq.length ? sq : [[[0, 0], [0, 0], [0, 0]]], old: [box].concat(sq.map(q2 => q2.slice().reverse())) };
  };
  SCENES[17].trans = {
    reveal(u, c) { if (u <= .04) return null; if (u >= .82) return FULL; const o = pelPtA(c, 0, -200); let d = ''; CELLS.forEach(cl => { if (tOf(cl, o) <= u) d += `M${cl.x},${cl.y}h120v120h-120Z`; }); return d || null; },
    hideA: .82, hold: .85, blend: 1.7,
    pel: { at: .5, dur: .32, wipe: pixWipe },
    fx: {
      win: [0, .85],
      build(g) { g.setAttribute('shape-rendering', 'crispEdges'); g.innerHTML = CELLS.map(() => `<rect width="120" height="120"/>`).join(''); this.ce = qa(g, 'rect'); },
      update(u, c) {
        // 翻成像素前的一瞬：这一格先变成一整块平涂的颜色（喷漆碎成像素）
        const o = pelPtA(c, 0, -200);
        this.ce.forEach((e, n) => { const cl = CELLS[n], t = tOf(cl, o), on = u > t - .12 && u < t; at(e, { x: cl.x, y: cl.y, fill: PAL[Math.floor(cl.h * 8)], opacity: on ? 1 : 0 }); });
      }
    }
  };
})();

/* ======================= No.19 → No.20：关卡结束，像素在原地发出霓虹光，开始下雨，画面平滑地变成雨夜的都市 ======================= */
(function () {
  const NEON = ['#ff2bd6', '#2be8ff', '#fff12b', '#8a2bff', '#2bff88'];
  SCENES[18].trans = {
    reveal(u) { return u < .3 ? null : FULL; },
    fadeB: u => ss(.3, 1.25, u),
    hideA: 1.25, hold: 1.2, blend: 2.3,
    pel: { at: .8, dur: .42, wipe: 'fade' },
    fx: {
      win: [0, 1.4],
      build(g) {
        def(`<radialGradient id="t19halo"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`);
        const R = rng(1920); this.px = [];
        let s = '';
        for (let i = 0; i < 130; i++) { const c = NEON[i % 5]; s += `<g class="np"><circle r="44" fill="${c}" opacity=".35"/><rect x="-15" y="-15" width="30" height="30" fill="${c}"/><rect x="-9" y="-9" width="18" height="18" fill="#fff" opacity=".7"/></g>`; this.px.push([Math.floor(R() * 64) * 30 + 15, Math.floor(R() * 36) * 30 + 15, R()]); }
        g.innerHTML = s; this.pe = qa(g, '.np');
      },
      update(u) {
        // 像素一格一格亮成霓虹（原地发光），随后淡进雨夜
        this.pe.forEach((e, i) => { const p = this.px[i], k = ss(p[2] * .3, p[2] * .3 + .18, u), fl = .75 + .25 * Math.sin(u * 30 + i); at(e, { transform: `translate(${p[0]},${p[1]})`, opacity: f2(k * fl * (1 - ss(.85, 1.4, u))) }); });
      }
    },
    fx2: {
      win: [.1, 1.8],
      build(g) {
        const R = rng(1921); this.rp = [];
        g.innerHTML = Array.from({ length: 140 }, () => `<path stroke="#9ab8ff" stroke-width="2" stroke-linecap="round"/>`).join('');
        this.re = qa(g, 'path'); this.re.forEach(() => this.rp.push([R(), R(), R()]));
      },
      update(u) {
        // 开始下雨
        const k = ss(.1, .4, u) * (1 - ss(1.4, 1.8, u));
        this.re.forEach((e, i) => { const p = this.rp[i], f = fr(u * (1.5 + p[2]) + p[1]); at(e, { d: `M${f1(p[0] * 2200 - f * 220)},${f1(-80 + f * 1250)}l-12,52`, opacity: f2(k * (.35 + p[2] * .4)) }); });
      }
    }
  };
})();

/* ======================= No.20 → No.21：霓虹褪成粉紫青的渐变，积水的路面展开成透视网格 ======================= */
(function () {
  const PK = '#ff71ce', CY = '#01cdfe';
  const hzOf = c => TRM.map(c.C, 960, 540);              // 下一版窗口里的地平线（经过镜头校正后的屏幕位置）
  SCENES[19].trans = {
    reveal(u, c) {
      if (u <= 0) return null; if (u >= .8) return FULL;
      const h = hzOf(c)[1], yb = lerp(h, 1200, eio(inv(.25, .78, u)));
      return `M-60,-60H1980V${f1(yb)}H-60Z`;
    },
    fadeB: u => ss(0, .4, u),
    hideA: .8, hold: .9, blend: 2.0,
    pel: { at: .6, dur: .3, wipe: 'up', edge: 0 },
    fx: {
      win: [0, 1.0],
      build(g) { g.innerHTML = Array.from({ length: 27 }, () => `<path class="rl" stroke="${PK}" stroke-width="3" fill="none" pathLength="1" stroke-dasharray="1 1"/>`).join('') + Array.from({ length: 12 }, () => `<path class="hl" stroke="${PK}" stroke-width="3" fill="none"/>`).join('') + `<path class="hz" stroke="${CY}" stroke-width="5" fill="none"/>`; this.rl = qa(g, '.rl'); this.hl = qa(g, '.hl'); this.hzl = q(g, '.hz'); },
      update(u, c) {
        // 网格从消失点展开：放射线先长出来，横线再一条条铺向镜头
        const vp = hzOf(c), k = eio(inv(.15, .6, u)), fade = 1 - ss(.75, 1, u);
        this.rl.forEach((e, i) => { const x1 = vp[0] + (i - 13) * 420; e.setAttribute('d', `M${f1(vp[0])},${f1(vp[1])}L${f1(x1)},${f1(vp[1] + 1600)}`); e.setAttribute('stroke-dashoffset', f2(1 - k)); op(e, fade); });
        this.hl.forEach((e, j) => { const t = (j + 1) / 12, y = vp[1] + (1100 - vp[1]) * Math.pow(t, 2.2); const on = ss(.3 + t * .3, .4 + t * .3, u); e.setAttribute('d', `M-40,${f1(y)}H1960`); op(e, on * fade); });
        this.hzl.setAttribute('d', `M-40,${f1(vp[1])}H1960`); op(this.hzl, ss(.1, .3, u) * fade);
      }
    }
  };
})();

/* ======================= No.21 → No.22：窗口卡住、错位，RGB 通道分开，画面开始碎裂 ======================= */
(function () {
  const SH = (() => { // 碎片：抖动网格切成三角形
    const R = rng(2122), nx = 8, ny = 5, P0 = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const ex = i === 0 || i === nx, ey = j === 0 || j === ny; P0.push([i * 240 + (ex ? (i ? 80 : -80) : (R() - .5) * 150), j * 216 + (ey ? (j ? 80 : -80) : (R() - .5) * 130)]); }
    const T = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = P0[j * (nx + 1) + i], b = P0[j * (nx + 1) + i + 1], c = P0[(j + 1) * (nx + 1) + i + 1], d = P0[(j + 1) * (nx + 1) + i]; T.push([a, b, c]); T.push([a, c, d]); }
    return T.map(t => ({ t, cx: (t[0][0] + t[1][0] + t[2][0]) / 3, cy: (t[0][1] + t[1][1] + t[2][1]) / 3, h: hash(t[0][0] * .13 + t[1][1] * .07) }));
  })();
  const tOf = s => .32 + .5 * s.h;
  const glitchWipe = (k) => {
    const nw = [], box = [[-4600, -4800], [4600, -4800], [4600, 4200], [-4600, 4200]];
    for (let y = -520; y < 60; y += 26) if (hash(y * .31) < k * 1.1) nw.push([[-700, y], [700, y], [700, y + 26], [-700, y + 26]]);
    return { nw: nw.length ? nw : [[[0, 0], [0, 0], [0, 0]]], old: [box].concat(nw.map(q2 => q2.slice().reverse())) };
  };
  SCENES[20].trans = {
    reveal(u) { if (u < .3) return null; if (u >= .9) return FULL; let d = ''; SH.forEach(s => { if (tOf(s) <= u) d += polyCW(s.t); }); return d || null; },
    hideA: .9, hold: .85, blend: 1.85,
    camA(u) { const q2 = Math.floor(u * 12), k = ss(0, .1, u); return [1, 0, 0, 1, (hash(q2 * 3.3) - .5) * 46 * k, (hash(q2 * 7.1) - .5) * 26 * k]; },
    filterA: u => u > .02 ? 'url(#t21rgb)' : null,
    pel: { at: .52, dur: .26, wipe: glitchWipe },
    fx: {
      win: [0, 1.0],
      build(g) {
        def(`<filter id="t21rgb" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/><feOffset class="or" in="r" dx="-6" dy="0" result="ro"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gg"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/><feOffset class="ob" in="b" dx="6" dy="2" result="bo"/><feBlend in="ro" in2="gg" mode="screen" result="rg"/><feBlend in="rg" in2="bo" mode="screen"/></filter>`);
        g.innerHTML = SH.map(s => `<path d="${P(s.t, true)}" fill="none" stroke="#fff" stroke-width="3" opacity="0"/>`).join('') + `<g class="bars">${Array.from({ length: 8 }, () => `<rect x="-20" width="1960"/>`).join('')}</g>`;
        this.cr = qa(g, 'path'); this.bars = qa(g, '.bars rect');
      },
      update(u) {
        // RGB 通道越拉越开；裂纹先出现，碎片随后一块块换成下一版
        const k = ss(0, .5, u), or = q(DEFS, '#t21rgb .or'), ob = q(DEFS, '#t21rgb .ob');
        if (or) { or.setAttribute('dx', f1(-6 - 40 * k)); ob.setAttribute('dx', f1(6 + 40 * k)); ob.setAttribute('dy', f1(2 + 10 * k)); }
        this.cr.forEach((e, i) => { const s = SH[i]; op(e, ss(.18 + s.h * .15, .3 + s.h * .15, u) * (1 - ss(tOf(s), tOf(s) + .08, u)) * .8); });
        const q2 = Math.floor(u * 15);
        this.bars.forEach((e, i) => { const on = hash(q2 * 5 + i) < .4 && u > .05 && u < .9; at(e, { y: f1(hash(q2 * 3 + i * 7) * 1080), height: f1(6 + hash(q2 + i) * 40), fill: ['#ff2bd6', '#00ffd0', '#fff12b', '#ffffff'][i % 4], opacity: on ? .55 : 0 }); });
      }
    }
  };
})();

/* ======================= No.22 → 片尾：碎片收拢、归位，回到片头那张空白画布 ======================= */
(function () {
  const COL = ['#ff2bd6', '#00ffd0', '#fff12b', '#2060ff', '#101018', '#f0f0f0'];
  const TL = (() => { const R = rng(2223), o = []; for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) o.push({ x: i * 120, y: j * 120, a: R(), b: R(), c: R() }); return o; })();
  const kOf = (p, u) => eio(clamp((u - p.a * .18) / .38));
  SCENES[21].trans = {
    reveal(u) { return u < .56 ? null : FULL; },
    hideA: .58, align: 'move', move: [.25, 1.3],
    pel: { at: .6, dur: .36, wipe: 'up', edge: 16 },
    fx: {
      win: [0, .8],
      build(g) { g.innerHTML = TL.map(() => `<rect width="122" height="122"/>`).join(''); this.fe = qa(g, 'rect'); },
      update(u) {
        // 碎片从四面八方收拢、归位；落定的一格就变回画布的米白
        this.fe.forEach((e, i) => {
          const p = TL[i], k = kOf(p, u), sx = p.x + (p.b - .5) * 2600 * (1 - k), sy = p.y + (p.c - .5) * 1700 * (1 - k);
          at(e, { x: f1(sx), y: f1(sy), fill: k > .97 ? '#f8f5ed' : COL[i % 6], transform: `rotate(${f1((1 - k) * (p.a - .5) * 200)},${f1(sx + 60)},${f1(sy + 60)})`, opacity: f2(ss(0, .05, u) * (1 - ss(.6, .78, u))) });
        });
      }
    }
  };
})();

/* 其余尚未专门设计的版块（理论上没有）用默认：从车轮下铺开 */
SCENES.forEach(s => { if (!s.trans) s.trans = TRANS_DEFAULT; });
