'use strict';
/* ============================================================
   版块 1–6
   ============================================================ */

/* ---------------- No.01 红黑拼贴风 ---------------- */
(function () {
  const R0 = '#d42a1e', K = '#151313', PP = '#efe6d3', PP2 = '#e4d9c2';
  PELICANS.s01 = () => {
    const sh = angularShapes(11, 3);
    const p = makePelican({
      shapes: sh, line: PP, lw: 5, join: 'miter', body: K, neck: K, head: K, wing: K, beak: K, pouch: R0, eye: PP,
      leg: K, legFar: '#4a3d3a', legW: 10, tire: K, tireW: 13, spoke: R0, spokeW: 5, spokes: 6, frame: R0, frameW: 10,
      saddle: K, bar: K, crank: K, fish: R0, hub: PP, hubR: 8, crestC: R0, footLine: PP,
      wingExtra: `<path d="M2,-246L-92,-228L-112,-218L-40,-222L4,-232Z" fill="${R0}"/><path d="M14,-224L58,-194L50,-188L8,-214Z" fill="${R0}"/>`,
      headExtra: `<path d="M40,-366L62,-362L58,-356Z" fill="${R0}"/>`
    });
    p.g.setAttribute('filter', 'url(#s01sh)');
    return p;
  };
  const scrap = (cx, cy, ch, o) => {
    const R = o.R, w = o.w, h = o.h;
    return `<g transform="translate(${cx},${cy}) rotate(${o.rot})"><path d="${tornRect(-w / 2, -h / 2, w, h, o.amp || 3, 9, R)}" fill="${o.bg}"/>${o.lines ? `<path d="M${-w / 2 + 8},${h / 2 - 10}h${w - 16}" stroke="${o.fg}" stroke-width="2" opacity=".4"/>` : ''}` +
      `<text x="0" y="${o.dy || h * 0.3}" text-anchor="middle" font-family="${o.font}" font-weight="${o.fw || 900}" font-size="${o.size}" fill="${o.fg}">${esc(ch)}</text></g>`;
  };
  const FONTS = ["'Source Han Serif CN'", "'Alimama ShuHeiTi'", "'Source Han Sans CN'", "'XiQuezhaopaiti'", "'Abril Fatface','Source Han Serif CN'"];

  SCENES.push({
    key: 's01', zh: '红黑拼贴风', en: 'Red-Black Collage',
    build(root) {
      def(`<filter id="s01sh" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="7" dy="7" stdDeviation="0" flood-color="#000" flood-opacity=".38"/></filter>
        <clipPath id="s01sky"><path d="M-200,-60H2600V420L2200,445L1800,470L1400,500L1000,530L600,560L200,595L-200,630Z"/></clipPath>`);
      const R = rng(101);
      const L = this.L = [];
      // 纸底
      add(root, `<rect width="1920" height="1080" fill="${PP}"/>`);
      // 黑夜空（撕边），放射线和红日
      let sky = `<path d="M-200,-60H2600V420L2200,445L1800,470L1400,500L1000,530L600,560L200,595L-200,630Z" fill="${K}"/>`;
      sky += `<g clip-path="url(#s01sky)">`;
      for (let i = 0; i < 30; i++) { const a = -PI + i * PI / 15 + 0.05; const x2 = 1460 + Math.cos(a) * 2600, y2 = 300 + Math.sin(a) * 2600, x3 = 1460 + Math.cos(a + 0.045) * 2600, y3 = 300 + Math.sin(a + 0.045) * 2600; sky += `<path d="M1460,300L${f1(x2)},${f1(y2)}L${f1(x3)},${f1(y3)}Z" fill="${PP}" opacity="${i % 3 ? .10 : .22}"/>`; }
      sky += `</g><circle cx="1460" cy="300" r="190" fill="${R0}"/><circle cx="1460" cy="300" r="120" fill="none" stroke="${K}" stroke-width="10"/><path d="M1460,110V490M1270,300H1650" stroke="${K}" stroke-width="5"/>`;
      // 撕纸边
      let te = 'M-200,630'; for (let x = -200; x <= 2600; x += 26) te += `L${x},${f1(630 - (x + 200) * 0.0754 + (R() - .5) * 14)}`; te += 'L2600,430L2600,470L-200,650Z';
      sky += `<path d="${te}" fill="${PP2}"/>`;
      // 星
      for (let i = 0; i < 14; i++) { const x = R() * 2400 - 200, y = 40 + R() * 330, r = 8 + R() * 22; sky += `<path d="${P(starPts(x, y, r, r * .42, 5, -PI / 2 + R()), true)}" fill="${i % 4 ? PP : R0}"/>`; }
      L.push(layer(root, 0.05, sky));
      // 红色斜带
      let band = `<path d="${tornRect(0, 0, 3600, 150, 5, 18, R)}" fill="${R0}" transform="translate(-300,780) rotate(-11)"/>`;
      band += `<path d="M-300,980L3300,290" stroke="${K}" stroke-width="16"/><path d="M-300,1006L3300,316" stroke="${K}" stroke-width="5"/>`;
      L.push(layer(root, 0.15, band));
      // 远处城市剪影
      let city = '', x = -300;
      while (x < 2900) {
        const w = 70 + R() * 130, h = 120 + R() * 240, base = 800, ty = R();
        const pts = [[x, base], [x, base - h]];
        if (ty < .25) pts.push([x + w * .5, base - h - 50 - R() * 70]);
        else if (ty < .45) { for (let i = 0; i < 3; i++) { pts.push([x + w * i / 3, base - h - 34]); pts.push([x + w * (i + 1) / 3, base - h]); } }
        else if (ty < .6) { pts.push([x + w * .2, base - h], [x + w * .2, base - h - 120], [x + w * .32, base - h - 120], [x + w * .32, base - h]); }
        pts.push([x + w, base - h], [x + w, base]);
        city += `<path d="${P(pts, true)}" fill="${K}"/>`;
        for (let j = 0; j < 5; j++) if (R() < .6) city += `<rect x="${f1(x + 10 + R() * (w - 30))}" y="${f1(base - h + 20 + R() * (h - 60))}" width="${f1(8 + R() * 14)}" height="${f1(14 + R() * 26)}" fill="${R() < .7 ? R0 : PP}"/>`;
        if (R() < .15) { const tx = x + w / 2; city += `<path d="M${tx},${base - h}L${tx - 30},${base - h}L${tx},${base - h - 230}L${tx + 30},${base - h}Z" fill="none" stroke="${K}" stroke-width="6"/><path d="M${tx - 22},${base - h - 60}L${tx + 22},${base - h - 120}M${tx + 22},${base - h - 60}L${tx - 22},${base - h - 120}" stroke="${K}" stroke-width="4"/>`; }
        x += w - 6;
      }
      L.push(layer(root, 0.3, city, { transform: '' }));
      // 剪报碎片
      let sc = '';
      const WORDS = ['速度', '节奏', '画法', '前进', '鹈鹕', '海报', '→', '★'];
      for (let i = 0; i < 9; i++) {
        const cx = 150 + i * 330 + R() * 90, cy = 520 + R() * 180, w = 120 + R() * 120, h = 80 + R() * 90, rot = (R() - .5) * 30;
        sc += `<g transform="translate(${f1(cx)},${f1(cy)}) rotate(${f1(rot)})"><path d="${tornRect(-w / 2, -h / 2, w, h, 3, 8, R)}" fill="${i % 3 === 0 ? R0 : PP}" filter="url(#s01sh)"/>`;
        for (let j = 0; j < 4; j++) sc += `<rect x="${f1(-w / 2 + 10)}" y="${f1(-h / 2 + 34 + j * 11)}" width="${f1(w - 20 - R() * 30)}" height="4" fill="${K}" opacity=".55"/>`;
        sc += `<text x="${f1(-w / 2 + 10)}" y="${f1(-h / 2 + 28)}" font-family="${FONTS[i % 5]}" font-weight="900" font-size="26" fill="${i % 3 === 0 ? PP : K}">${WORDS[i % WORDS.length]}</text></g>`;
      }
      L.push(layer(root, 0.42, sc));
      // 近景楼块
      let near = '';
      for (let i = 0; i < 8; i++) {
        const bx = -100 + i * 520 + R() * 120, w = 140 + R() * 100, h = 200 + R() * 140;
        near += `<g transform="translate(${f1(bx)},${GY - 30}) skewX(${f1((R() - .5) * 16)})"><rect x="0" y="${f1(-h)}" width="${f1(w)}" height="${f1(h)}" fill="${K}"/>`;
        for (let j = 0; j < 4; j++) near += `<rect x="12" y="${f1(-h + 20 + j * 40)}" width="${f1(w - 24)}" height="12" fill="${R0}"/>`;
        near += `</g>`;
      }
      L.push(layer(root, 0.62, near));
      // 路面
      let road = `<rect x="-800" y="${GY}" width="6000" height="200" fill="${PP}"/><rect x="-800" y="${GY - 4}" width="6000" height="16" fill="${K}"/>`;
      for (let i = 0; i < 90; i++) road += `<path d="M${-800 + i * 64},1080L${-760 + i * 64},${GY + 70}L${-736 + i * 64},${GY + 70}L${-776 + i * 64},1080Z" fill="${i % 2 ? R0 : K}"/>`;
      road += `<rect x="-800" y="${GY + 34}" width="6000" height="8" fill="${K}"/>`;
      // 里程碑 No.01
      road += `<g transform="translate(1660,${GY - 8}) rotate(-8)"><rect x="-6" y="-200" width="12" height="200" fill="${K}"/><path d="${tornRect(-90, -300, 180, 120, 3, 8, R)}" fill="${R0}"/><text x="0" y="-232" text-anchor="middle" font-family="Anton,Impact" font-size="64" fill="${PP}">No.01</text><text x="0" y="-196" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="900" font-size="22" fill="${K}">第一种画法 →</text></g>`;
      L.push(layer(root, 1, road));
      // 鹈鹕
      this.pg = mk('g', {}, root);
      this.speed = mk('g', { opacity: 0 }, this.pg);
      let sp = ''; for (let i = 0; i < 9; i++) sp += `<path d="M${-220 - R() * 200},${-60 - i * 36}h${-120 - R() * 200}" stroke="${K}" stroke-width="${6 + R() * 8}"/>`;
      this.speed.innerHTML = sp;
      this.pel = PELICANS.s01(); this.pg.appendChild(this.pel.g);
      // 斜切红黑两半（强拍）
      this.split = mk('g', { opacity: 0 }, root);
      this.split.innerHTML = `<path class="sr" d="M-100,-100H2100L-100,1180Z" fill="${R0}"/><path class="sk" d="M2100,-100V1180H-100Z" fill="${K}"/>
        <g class="rays" stroke="${K}" stroke-width="3" opacity=".5">${Array.from({ length: 14 }, (_, i) => `<path d="M${PX},${GY - 300}L${f1(PX - 1800 * Math.cos(i * .11 + .2))},${f1(GY - 300 - 1800 * Math.sin(i * .11 + .2))}"/>`).join('')}</g>`;
      this.splitR = q(this.split, '.sr'); this.splitK = q(this.split, '.sk');
      root.appendChild(this.pg);
      // 标题：剪报拼字
      const R2 = rng(7);
      let tc = '';
      const chars = ['红', '黑', '拼', '贴', '风'];
      const sty = [[R0, PP], [K, PP], [PP, K], [R0, K], [K, R0]];
      chars.forEach((c, i) => { tc += `<g class="tch">${scrap(0, 0, c, { R: R2, w: 116, h: 128, rot: (R2() - .5) * 18, bg: sty[i][0], fg: sty[i][1], font: FONTS[i], size: 96, dy: 34 })}</g>`; });
      tc += `<g class="ten" transform="translate(150,355) rotate(-6)"><rect x="-30" y="-46" width="560" height="64" fill="${K}"/><text x="0" y="4" font-family="Anton,Impact" font-size="48" letter-spacing="6" fill="${PP}">RED-BLACK <tspan fill="${R0}">COLLAGE</tspan></text></g>`;
      this.title = mk('g', {}, root); this.title.innerHTML = tc;
      this.tch = qa(this.title, '.tch'); this.ten = q(this.title, '.ten');
      // 高光：剪报字飞来拼成「鹈鹕，出发」
      const hl = ['鹈', '鹕', '，', '出', '发'];
      const hpos = [[1040, 440], [1215, 380], [1330, 360], [1455, 300], [1630, 238]];
      const hst = [[PP, K, 0], [R0, PP, 1], [K, PP, 2], [K, R0, 3], [R0, K, 4]];
      this.hpos = hpos;
      this.hfrom = [[-300, -200], [2300, 900], [900, -300], [2200, -250], [1200, 1300]];
      let hm = '';
      hl.forEach((c, i) => { const small = c === '，'; hm += `<g class="hch">${scrap(0, 0, c, { R: R2, w: small ? 70 : 160, h: small ? 90 : 176, rot: (R2() - .5) * 20, bg: hst[i][0], fg: hst[i][1], font: FONTS[hst[i][2]], size: small ? 90 : 134, dy: small ? 20 : 46, lines: !small })}</g>`; });
      this.head = mk('g', {}, root); this.head.innerHTML = hm; this.hch = qa(this.head, '.hch');
      // 出口：红黑海报
      const pw = 560, ph = 520;
      let pm = `<g class="poster"><rect x="${-pw / 2 - 26}" y="${-ph - 46}" width="${pw + 52}" height="${ph + 46}" fill="${K}"/>`;
      pm += `<path d="${tornRect(-pw / 2, -ph - 20, pw, ph - 4, 4, 12, R2)}" fill="${K}" stroke="${PP}" stroke-width="3"/>`;
      pm += `<path d="M${-pw / 2},${-ph * .55}L${pw / 2},${-ph - 20}V${-ph * .2}L${-pw / 2},${-20}Z" fill="${R0}"/>`;
      pm += `<path d="${P(starPts(60, -ph * .62, 150, 60, 5), true)}" fill="${PP}"/><path d="${P(starPts(60, -ph * .62, 92, 37, 5), true)}" fill="${R0}"/>`;
      pm += `<text x="${-pw / 2 + 30}" y="-110" font-family="'Alimama ShuHeiTi'" font-size="100" fill="${PP}" transform="rotate(-8,${-pw / 2 + 30},-80)">冲破</text><text x="${-pw / 2 + 34}" y="-62" font-family="Anton" font-size="30" letter-spacing="5" fill="${K}">NEXT STOP →</text>`;
      pm += `<rect x="${-pw / 2 - 20}" y="0" width="16" height="40" fill="${K}"/><rect x="${pw / 2 + 4}" y="0" width="16" height="40" fill="${K}"/></g>`;
      this.poster = mk('g', {}, root); this.poster.innerHTML = pm;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      // 鹈鹕与高光“急转亮相”
      let px = PX, py = GY, rot = 0, sx = 1, sk = 0;
      const k1 = inv(2.5, 2.78, lt);
      if (lt > 2.5 && lt < 2.78) { sx = Math.cos(k1 * TAU); py -= Math.sin(k1 * PI) * 46; px += Math.sin(k1 * PI) * 30; }
      const wl = ss(2.74, 3.0, lt) * (1 - ss(3.6, 3.95, lt));
      rot = -17 * wl;
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${f1(px)},${f1(py)}) translate(-110,0) rotate(${f2(rot)}) translate(110,0) scale(${f2(Math.abs(sx) < .08 ? .08 * Math.sign(sx || 1) : sx)},1)` });
      op(this.speed, inv(2.5, 2.6, lt) * (1 - inv(3.7, 4, lt)));
      // 斜切
      const sp = inv(2.98, 3.1, lt), sp2 = inv(3.85, 4.05, lt);
      op(this.split, sp > 0 && sp2 < 1 ? 1 : 0);
      if (sp > 0 && sp2 < 1) {
        const e = eob(sp), o = ei(sp2) * 1400;
        this.splitR.setAttribute('transform', `translate(${f1(-(1 - e) * 1400 - o)},${f1(-(1 - e) * 800 - o * .6)})`);
        this.splitK.setAttribute('transform', `translate(${f1((1 - e) * 1400 + o)},${f1((1 - e) * 800 + o * .6)})`);
      }
      // 标题卡
      const tIn = lt - 0.15, tOut = inv(2.2, 2.5, lt);
      this.tch.forEach((g, i) => {
        const k = eob(inv(i * 0.09, i * 0.09 + 0.3, tIn));
        const x = 150 + i * 122, y = 230 + (i % 2) * 14;
        at(g, { transform: `translate(${f1(x - tOut * 900)},${f1(y - (1 - k) * 600)}) rotate(${f1((1 - k) * 40)})`, opacity: f2(inv(i * .09, i * .09 + .05, tIn)) });
      });
      const ke = eo(inv(0.6, 0.9, tIn));
      at(this.ten, { transform: `translate(${f1(150 - (1 - ke) * 900 - tOut * 1200)},355) rotate(-6)` });
      // 高光字
      this.hch.forEach((g, i) => {
        const a = 2.05 + i * 0.16, k = inv(a, a + 0.32, lt), out = inv(4.25, 4.6, lt);
        const e = eob(k), f = this.hfrom[i], pt = this.hpos[i];
        const x = lerp(f[0], pt[0], e) - out * 1600, y = lerp(f[1], pt[1], e) - out * 500;
        at(g, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1((1 - e) * (i % 2 ? 160 : -140) - 9)}) scale(${f2(1 + bump(lt - 3.0, .08) * .12)})`, opacity: k > 0 ? 1 : 0 });
      });
      // 海报（出口）
      const fx = frameScreenX(lt) + 470;
      const pk = eob(inv(3.7, 4.05, lt));
      vis(this.poster, lt > 3.65 && lt < 6.0);
      const bulge = 1 + bump(lt - 5.98, .07) * .05;
      at(this.poster, { transform: `translate(${f1(fx)},${GY + 30}) scale(${f2(bulge)},${f2(pk)}) rotate(${f1((1 - pk) * 6)})` });
    },
    exit(u, X) {
      const by = GY + 30, oh = 520;
      if (u < 0) { X.clipD('M0,0Z'); return; }
      const k = ei(clamp(u / 0.5)), z = 1 + 6 * k;
      const zt = zoomT(z, PX, by - oh / 2);
      const r = 160 + u * 2800;
      X.clipD(P(circPts(PX + 170, GY - 250, r, 14, .3, rng(3)), true));
      X.camA(zt);
      if (u >= 0.5) { X.none(); X.hideA(); }
    },
    exitFx: {
      win: [0, 1.1],
      build(g) {
        const R = rng(55);
        const pw = 560, ph = 520, x0 = PX + 470 - pw / 2, y0 = GY + 30 - ph;
        const nx = 6, ny = 6, pts = [];
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
          const ex = i === 0 || i === nx, ey = j === 0 || j === ny;
          pts.push([x0 + i * pw / nx + (ex ? 0 : (R() - .5) * 60), y0 + j * ph / ny + (ey ? 0 : (R() - .5) * 60)]);
        }
        this.frags = [];
        const stars = S02STARS();
        let si = 0, s = '';
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = pts[j * (nx + 1) + i], b = pts[j * (nx + 1) + i + 1], c = pts[(j + 1) * (nx + 1) + i + 1], d = pts[(j + 1) * (nx + 1) + i];
          for (const tri of [[a, b, c], [a, c, d]]) {
            const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
            const red = R() < .3;
            const st = red ? stars[(si++ * 7) % stars.length] : null;
            const d0 = tri.map(p => [p[0] - cx, p[1] - cy]);
            s += `<g class="fr"><path d="${P(d0, true)}" fill="${red ? R0 : K}" stroke="${red ? R0 : '#2a2a40'}" stroke-width="1"/>${red ? `<path d="M0,-12L3,-3L12,0L3,3L0,12L-3,3L-12,0L-3,-3Z" fill="#fff3c8" opacity="0"/>` : ''}</g>`;
            this.frags.push({ cx, cy, red, st, ang: Math.atan2(cy - (GY - 260), cx - (PX + 120)), sp: 500 + R() * 900, rot: (R() - .5) * 720, sc: 1.6 + R() * 3 });
          }
        }
        s += `<path class="rail" d="M${PX - 260},${GY + 4}H2000" stroke="#ffd36a" stroke-width="6" fill="none" filter="url(#s02glow)" pathLength="1" stroke-dasharray="1 1"/>`;
        g.innerHTML = s;
        this.fe = qa(g, '.fr'); this.rail = q(g, '.rail');
      },
      update(u) {
        const ex = this;
        ex.fe.forEach((e, i) => {
          const f = ex.frags[i];
          const k = clamp(u / 0.75);
          if (f.red) {
            const kk = eio(k);
            const x = lerp(f.cx, f.st[0], kk) + Math.cos(f.ang) * Math.sin(kk * PI) * 160, y = lerp(f.cy, f.st[1], kk) + Math.sin(f.ang) * Math.sin(kk * PI) * 160;
            const sc = lerp(1, 0.06, ss(0, .7, k));
            at(e, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(f.rot * kk)}) scale(${f2(sc)})`, opacity: f2(1 - ss(.75, 1, u)) });
            e.lastChild.setAttribute('opacity', f2(ss(.4, .8, k)));
            e.lastChild.setAttribute('transform', `scale(${f2(1 / Math.max(sc, .06) * .5)})`);
          } else {
            const kk = eo(k), dist = f.sp * kk;
            at(e, { transform: `translate(${f1(f.cx + Math.cos(f.ang) * dist)},${f1(f.cy + Math.sin(f.ang) * dist - kk * 200)}) rotate(${f1(f.rot * kk)}) scale(${f2(1 + f.sc * kk)})`, opacity: f2(1 - ss(.25, .8, u)) });
          }
        });
        ex.rail.setAttribute('stroke-dashoffset', f2(1 - eo(inv(0.02, 0.35, u))));
        op(ex.rail, 1 - inv(0.7, 1.1, u));
      }
    }
  });
})();

/* ---------------- No.02 星际列车风 ---------------- */
function S02STARS() {
  if (S02STARS.c) return S02STARS.c;
  const R = rng(202), o = [];
  for (let i = 0; i < 60; i++) o.push([R() * 1920, 30 + R() * 560, 0.6 + R() * 1.8]);
  return (S02STARS.c = o);
}
(function () {
  const GOLD = '#e8c56a', GOLD2 = '#fff0b8', NAVY = '#0b1236', WIN = '#ffcf7a';
  PELICANS.s02 = () => {
    const p = makePelican({
      line: GOLD, lw: 2.2, body: NAVY, neck: NAVY, head: NAVY, wing: '#121b4a', beak: '#141d50', pouch: '#1a2560', eye: GOLD2,
      leg: '#141c4a', legFar: '#0a102e', legW: 9, tire: '#0a1030', tireW: 7, rimW: 1.6, rimC: GOLD, spoke: GOLD, spokeW: 1, spokes: 16,
      frame: NAVY, frameLine: GOLD, frameLineW: 1.6, frameW: 8, saddle: NAVY, saddleLine: GOLD, bar: GOLD, crank: GOLD, fish: GOLD, hub: GOLD, hubR: 5,
      footLine: GOLD,
      wingExtra: `<path d="M-6,-246C-40,-250 -76,-240 -100,-226M-10,-232C-40,-234 -70,-226 -92,-214" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".7"/>`,
      top: `<g class="dust"></g>`
    });
    p.dust = q(p.g, '.dust');
    let ds = ''; for (let i = 0; i < 46; i++) ds += `<circle r="2" fill="${i % 3 ? GOLD2 : '#fff'}"/>`;
    p.dust.innerHTML = ds; p.dustE = qa(p.dust, 'circle');
    p.onUpdate = function (ps, tau, roll, opt) {
      const lt = opt.lt !== undefined ? opt.lt : tau;
      const parts = trailParticles(lt, { dt: 0.035, life: 0.8, seed: 3 });
      p.dustE.forEach((c, i) => {
        const pp = parts[i];
        if (!pp) { c.setAttribute('opacity', 0); return; }
        const w = pp.r1 < .5 ? PG.RW : PG.FW;
        const x = w[0] - 40 * pp.r2 - pp.age * (opt.v || SPEED) * .85, y = -4 - pp.age * (20 + 60 * pp.r3) - Math.sin(pp.r2 * 6 + pp.age * 6) * 6;
        at(c, { cx: f1(x), cy: f1(y), r: f2(0.8 + 2.4 * (1 - pp.k) * pp.r3), opacity: f2((1 - pp.k) * .95) });
      });
    };
    return p;
  };

  SCENES.push({
    key: 's02', zh: '星际列车风', en: 'Interstellar Railway',
    build(root) {
      def(`<linearGradient id="s02sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03061a"/><stop offset=".55" stop-color="#0d1747"/><stop offset=".85" stop-color="#2b2a6a"/><stop offset="1" stop-color="#4a3a78"/></linearGradient>
        <filter id="s02blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
        <filter id="s02glow" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <radialGradient id="s02planet" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#f0c890"/><stop offset=".5" stop-color="#b0705a"/><stop offset="1" stop-color="#3a1d34"/></radialGradient>
        <radialGradient id="s02win" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#fff2c0"/><stop offset="1" stop-color="${WIN}"/></radialGradient>
        <linearGradient id="s02car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2a5e"/><stop offset="1" stop-color="#0e1438"/></linearGradient>`);
      const R = rng(22);
      const L = this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s02sky)"/>`);
      // 银河
      let mw = '';
      for (let i = 0; i < 9; i++) { const x = -100 + i * 280, y = 520 - i * 50; mw += `<ellipse cx="${x}" cy="${y}" rx="${260 + R() * 120}" ry="${70 + R() * 40}" fill="${i % 2 ? '#7b86d8' : '#b9a6f0'}" opacity=".22" transform="rotate(-10,${x},${y})"/>`; }
      let mws = ''; for (let i = 0; i < 260; i++) { const t = R(), x = -150 + t * 2400, y = 540 - t * 470 + (R() - .5) * 150 * (1 + R()); mws += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f2(.4 + R() * 1.1)}" fill="#e8e4ff" opacity="${f2(.3 + R() * .6)}"/>`; }
      L.push(layer(root, 0.02, `<g filter="url(#s02blur)">${mw}</g>${mws}`));
      // 星
      const stars = S02STARS();
      this.starG = [];
      for (let gI = 0; gI < 4; gI++) {
        let ss2 = '';
        stars.forEach((s, i) => { if (i % 4 !== gI) return; ss2 += s[2] > 1.9 ? `<path d="M${f1(s[0])},${f1(s[1] - s[2] * 5)}L${f1(s[0] + s[2] * .9)},${f1(s[1])}L${f1(s[0])},${f1(s[1] + s[2] * 5)}L${f1(s[0] - s[2] * .9)},${f1(s[1])}Z" fill="#fff6d8"/><circle cx="${f1(s[0])}" cy="${f1(s[1])}" r="${f1(s[2])}" fill="#fff"/>` : `<circle cx="${f1(s[0])}" cy="${f1(s[1])}" r="${f1(s[2])}" fill="#fff8e6"/>`; });
        this.starG.push(add(root, `<g>${ss2}</g>`));
      }
      // 星图：同心圆、赤经线、刻度
      let ch = `<g transform="translate(1480,250)" fill="none" stroke="${GOLD}" stroke-width="1.2" opacity=".42">`;
      for (const r of [110, 210, 320, 440]) ch += `<circle r="${r}"/>`;
      for (let i = 0; i < 24; i++) { const a = i * TAU / 24; ch += `<path d="M${f1(Math.cos(a) * 110)},${f1(Math.sin(a) * 110)}L${f1(Math.cos(a) * 440)},${f1(Math.sin(a) * 440)}" opacity=".6"/>`; }
      for (let i = 0; i < 120; i++) { const a = i * TAU / 120, l = i % 5 ? 8 : 18; ch += `<path d="M${f1(Math.cos(a) * 440)},${f1(Math.sin(a) * 440)}L${f1(Math.cos(a) * (440 + l))},${f1(Math.sin(a) * (440 + l))}"/>`; }
      ch += `<ellipse rx="400" ry="150" transform="rotate(-20)" stroke-dasharray="6 8"/></g>`;
      ch += `<g font-family="'Cormorant Garamond',serif" font-size="20" fill="${GOLD}" opacity=".6">` + ['XII', 'III', 'VI', 'IX'].map((t, i) => T(1480 + Math.cos(i * PI / 2 - PI / 2) * 478, 256 + Math.sin(i * PI / 2 - PI / 2) * 478, t, { 'text-anchor': 'middle' })).join('') + `</g>`;
      // 星座（含“鹈鹕座”）
      const cons = [
        { n: 'PELECANUS · 鹈鹕座', p: [[300, 470], [360, 420], [430, 430], [470, 380], [560, 400], [520, 450], [430, 430]] },
        { n: 'LYRA', p: [[880, 140], [930, 110], [990, 150], [960, 210], [900, 200], [880, 140]] },
        { n: 'CYGNUS', p: [[1180, 470], [1250, 420], [1320, 380], [1250, 420], [1270, 500], [1250, 420], [1220, 350]] }
      ];
      for (const c of cons) {
        ch += `<path d="${P(c.p)}" fill="none" stroke="${GOLD}" stroke-width="1.4" opacity=".75"/>`;
        c.p.forEach(p => ch += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff6d8"/><circle cx="${p[0]}" cy="${p[1]}" r="9" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".6"/>`);
        ch += T(c.p[0][0], c.p[0][1] + 34, c.n, { 'font-family': "'Cormorant Garamond','Source Han Serif CN',serif", 'font-size': 18, fill: GOLD, 'letter-spacing': 3, opacity: .85 });
      }
      L.push(layer(root, 0.05, ch));
      // 行星与月牙
      L.push(layer(root, 0.03, `<g transform="translate(250,200)"><ellipse rx="150" ry="34" fill="none" stroke="${GOLD}" stroke-width="3" opacity=".55" transform="rotate(-14)"/><circle r="74" fill="url(#s02planet)"/><path d="M-70,-10Q0,6 70,-16M-66,18Q0,34 64,12" stroke="#7a3a40" stroke-width="5" fill="none" opacity=".4"/><path d="M-150,0A150,34 0 0 0 150,0" transform="rotate(-14)" fill="none" stroke="${GOLD}" stroke-width="3" opacity=".8"/></g>
        <g transform="translate(720,120)"><circle r="26" fill="#fff0c8"/><circle cx="10" cy="-7" r="24" fill="#0a1238"/></g>`));
      // 列车轨道（中景）
      let tr = `<path d="M-600,708H4600" stroke="${GOLD}" stroke-width="3" filter="url(#s02glow)"/><path d="M-600,716H4600" stroke="${GOLD}" stroke-width="1.2" opacity=".6"/>`;
      for (let i = 0; i < 160; i++) tr += `<rect x="${-600 + i * 32}" y="710" width="16" height="4" fill="${GOLD}" opacity=".45"/>`;
      for (let i = 0; i < 16; i++) tr += `<path d="M${-500 + i * 320},716l-30,180M${-500 + i * 320},716l30,180" stroke="${GOLD}" stroke-width="1.2" opacity=".25"/>`;
      L.push(layer(root, 0.5, tr));
      // 列车
      this.train = mk('g', {}, root);
      let tm = '';
      // 机车（车头向右）
      tm += `<g class="loco"><rect x="-380" y="-150" width="250" height="120" rx="10" fill="#141a3c" stroke="${GOLD}" stroke-width="2"/><rect x="-130" y="-170" width="110" height="140" fill="#10163a" stroke="${GOLD}" stroke-width="2"/>
        <path d="M-380,-90H-20" stroke="${GOLD}" stroke-width="1.5"/><rect x="-330" y="-210" width="34" height="62" fill="#141a3c" stroke="${GOLD}" stroke-width="2"/><path d="M-340,-212h54" stroke="${GOLD}" stroke-width="5"/>
        <rect x="-110" y="-150" width="70" height="46" fill="url(#s02win)"/><circle cx="-380" cy="-90" r="34" fill="#1a2250" stroke="${GOLD}" stroke-width="2"/><circle cx="-380" cy="-90" r="14" fill="#fff4c4" filter="url(#s02glow)"/>
        ${[-330, -250, -170, -80].map(x => `<g transform="translate(${x},-24)"><circle r="24" fill="#0c1230" stroke="${GOLD}" stroke-width="2"/><path d="M-20,0H20M0,-20V20" stroke="${GOLD}" stroke-width="1"/></g>`).join('')}
        <path d="M-420,-10L-380,-40H-20" stroke="${GOLD}" stroke-width="2" fill="none"/></g>`;
      this.paxW = [];
      for (let c = 0; c < 4; c++) {
        const x0 = -400 - (c + 1) * 330 + 10;
        tm += `<g class="car"><rect x="${x0}" y="-178" width="310" height="150" rx="12" fill="url(#s02car)" stroke="${GOLD}" stroke-width="2"/><path d="M${x0},-60H${x0 + 310}M${x0},-150H${x0 + 310}" stroke="${GOLD}" stroke-width="1.2" opacity=".8"/>
          <path d="M${x0 + 4},-178Q${x0 + 155},-200 ${x0 + 306},-178" fill="#141a3c" stroke="${GOLD}" stroke-width="2"/>
          ${[x0 + 60, x0 + 250].map(x => `<g transform="translate(${x},-24)"><circle r="18" fill="#0c1230" stroke="${GOLD}" stroke-width="1.5"/></g>`).join('')}`;
        for (let w = 0; w < 5; w++) {
          const wx = x0 + 18 + w * 58;
          tm += `<rect x="${wx}" y="-140" width="44" height="66" rx="5" fill="url(#s02win)"/><g class="pax" clip-path="url(#s02wc${w})" transform="translate(${wx},-140)"></g>`;
        }
        tm += `</g>`;
      }
      this.train.innerHTML = tm;
      let wcs = ''; for (let w = 0; w < 5; w++) wcs += `<clipPath id="s02wc${w}"><rect x="0" y="0" width="44" height="66" rx="5"/></clipPath>`;
      def(wcs);
      // 乘客剪影
      const paxG = qa(this.train, '.pax');
      this.pax = paxG.map((g, i) => {
        const r2 = rng(i * 13 + 5), ty = Math.floor(r2() * 4);
        let s = `<g class="pp"><path d="M4,66C4,46 12,40 22,40C32,40 40,46 40,66Z" fill="#2a160c"/><circle cx="22" cy="30" r="11" fill="#2a160c"/>`;
        if (ty === 0) s += `<path d="M8,22h28l-4,-12h-20Z" fill="#2a160c"/>`;
        else if (ty === 1) s += `<path d="M11,30C10,12 34,12 33,30L36,52H8Z" fill="#2a160c"/>`;
        else if (ty === 2) s += `<path d="M12,22L22,12L32,22Z" fill="#2a160c"/>`;
        s += `<circle cx="28" cy="29" r="2" fill="#ffe7a0"/></g>`;
        g.innerHTML = s; return q(g, '.pp');
      });
      // 车票
      this.ticket = mk('g', {}, root);
      this.ticket.innerHTML = `<g class="tk"><rect x="-270" y="-120" width="540" height="240" rx="10" fill="#f6ecd2"/><rect x="-258" y="-108" width="516" height="216" rx="6" fill="none" stroke="#b8902e" stroke-width="2"/><rect x="-252" y="-102" width="504" height="204" rx="4" fill="none" stroke="#b8902e" stroke-width="1" stroke-dasharray="3 3"/>
        <path d="M150,-108V108" stroke="#b8902e" stroke-width="2" stroke-dasharray="6 6"/><circle cx="-226" cy="-80" r="9" fill="#0b1236"/>
        <text x="-226" y="-60" font-family="'Cormorant Garamond',serif" font-size="17" fill="#6a5320" letter-spacing="3" text-anchor="start" dx="20" dy="-14">INTERSTELLAR RAILWAY · 星际列车</text>
        <text x="-230" y="10" font-family="'Source Han Serif CN',serif" font-weight="900" font-size="40" fill="#0b1236">终点站：下一种画法</text>
        <text x="-228" y="48" font-family="'Cormorant Garamond',serif" font-style="italic" font-size="22" fill="#4a3a18" letter-spacing="1">Destination: the Next Way of Drawing</text>
        <text x="-228" y="88" font-family="'JetBrains Mono',monospace" font-size="16" fill="#6a5320">No.000002 · 22号车厢 · 单程</text>
        <g transform="translate(205,0)"><circle r="40" fill="none" stroke="#9a3b5e" stroke-width="3" opacity=".8"/><path d="${P(starPts(0, 0, 26, 11, 5), true)}" fill="#9a3b5e" opacity=".8"/><text y="62" text-anchor="middle" font-family="'Cormorant Garamond'" font-size="16" fill="#6a5320">ADMIT ONE</text></g></g>`;
      this.tk = q(this.ticket, '.tk');
      // 金色轨道路面
      let road = `<rect x="-800" y="${GY}" width="6000" height="200" fill="#070b24"/><path d="M-800,${GY + 2}H5200" stroke="${GOLD}" stroke-width="4" filter="url(#s02glow)"/><path d="M-800,${GY + 40}H5200" stroke="${GOLD}" stroke-width="2" opacity=".55"/>`;
      for (let i = 0; i < 180; i++) road += `<path d="M${-800 + i * 34},${GY + 8}l-10,30" stroke="${GOLD}" stroke-width="3" opacity=".35"/>`;
      for (let i = 0; i < 12; i++) road += `<g transform="translate(${-700 + i * 460},${GY})"><path d="M0,0V-90" stroke="${GOLD}" stroke-width="2" opacity=".7"/><circle cy="-96" r="6" fill="#fff2c4" filter="url(#s02glow)"/></g>`;
      // 站名牌 = 里程碑 No.02
      road += `<g transform="translate(1520,${GY})"><path d="M-80,0V-170M80,0V-170" stroke="${GOLD}" stroke-width="4"/><rect x="-140" y="-290" width="280" height="130" rx="8" fill="#f6ecd2" stroke="${GOLD}" stroke-width="4"/>
        <text x="0" y="-232" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="46" fill="#0b1236">星海站</text>
        <text x="0" y="-202" text-anchor="middle" font-family="'Cormorant Garamond'" font-size="20" letter-spacing="4" fill="#5a4518">STELLA · No.02</text>
        <path d="M-130,-186H130" stroke="#0b1236" stroke-width="2"/><text x="-126" y="-168" font-family="'Source Han Serif CN'" font-size="14" fill="#0b1236">← 红黑拼贴</text><text x="126" y="-168" text-anchor="end" font-family="'Source Han Serif CN'" font-size="14" fill="#0b1236">奇幻冒险 →</text></g>`;
      L.push(layer(root, 1, road));
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s02(); this.pg.appendChild(this.pel.g);
      // 标题卡
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g transform="translate(120,110)"><rect width="560" height="200" fill="#0b1236" fill-opacity=".72" stroke="${GOLD}" stroke-width="2"/><rect x="8" y="8" width="544" height="184" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".7"/>
        ${[[8, 8], [552, 8], [8, 192], [552, 192]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="${GOLD}"/>`).join('')}
        <path class="tl" d="M40,150L120,120L200,140L300,110L420,130L520,100" fill="none" stroke="${GOLD}" stroke-width="1.2" pathLength="1" stroke-dasharray="1 1" opacity=".7"/>
        ${[[40, 150], [120, 120], [200, 140], [300, 110], [420, 130], [520, 100]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#fff6d8"/>`).join('')}
        <text x="280" y="96" text-anchor="middle" font-family="'Source Han Serif CN',serif" font-weight="600" font-size="72" letter-spacing="18" fill="${GOLD2}">星际列车</text>
        <text x="280" y="178" text-anchor="middle" font-family="'Trajan Pro 3','Cormorant Garamond',serif" font-size="24" letter-spacing="7" fill="${GOLD}">INTERSTELLAR RAILWAY</text></g>`;
      this.tl = q(this.title, '.tl');
      // 出口：金饰车厢门（拱形）
      this.door = mk('g', {}, root);
      const dw = 560, dh = 520;
      this.door.innerHTML = `<g class="dr"><path d="M${-dw / 2 - 40},40V${-dh + dw / 2}A${dw / 2 + 40},${dw / 2 + 40} 0 0 1 ${dw / 2 + 40},${-dh + dw / 2}V40H${dw / 2}V${-dh + dw / 2}A${dw / 2},${dw / 2} 0 0 0 ${-dw / 2},${-dh + dw / 2}V40Z" fill="#141a3c" stroke="${GOLD}" stroke-width="3"/>
        <path class="dl" d="M${-dw / 2 - 20},40V${-dh + dw / 2}A${dw / 2 + 20},${dw / 2 + 20} 0 0 1 ${dw / 2 + 20},${-dh + dw / 2}V40" fill="none" stroke="${GOLD}" stroke-width="2" pathLength="1" stroke-dasharray="1 1"/>
        <circle cx="0" cy="${-dh - 8}" r="22" fill="#fff2c4" filter="url(#s02glow)"/><path d="${P(starPts(0, -dh - 8, 16, 6, 5), true)}" fill="${GOLD}"/>
        <text x="0" y="${-dh + 30}" text-anchor="middle" font-family="'Cormorant Garamond'" font-size="20" letter-spacing="5" fill="${GOLD}">EXIT · 出口</text></g>`;
      this.dl = q(this.door, '.dl'); this.dr = q(this.door, '.dr');
    },
    trainX(lt) {
      if (lt < 0) return 700 + 560 * lt;
      if (lt < 2) return lerp(700, 1720, eo(lt / 2));
      if (lt < 4) return 1720;
      return 1720 + 700 * Math.pow(lt - 4, 1.7);
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.starG.forEach((g, i) => op(g, .55 + .45 * Math.sin(lt * 3.1 + i * 1.7)));
      at(this.train, { transform: `translate(${f1(this.trainX(lt))},${708})` });
      // 乘客依次凑到窗边
      this.pax.forEach((p, i) => {
        const a = 2.0 + (((i * 7) % 20) / 20) * 1.1;
        const k = eob(inv(a, a + 0.25, lt)) * (1 - inv(4.6, 4.9, lt));
        at(p, { transform: `translate(${f1((1 - k) * (i % 2 ? 46 : -46))},${f1((1 - k) * 10)})` });
      });
      // 车票
      const tk0 = inv(2.85, 3.55, lt), tk1 = inv(4.25, 4.85, lt);
      vis(this.ticket, lt > 2.85 && lt < 4.85);
      if (lt > 2.85 && lt < 4.85) {
        const e = eo(tk0);
        const x = lerp(1180, 1360, e) + tk1 * 700 + Math.sin(lt * 5) * 8 * (1 - e), y = lerp(560, 330, e) - tk1 * 420 + Math.sin(lt * 7) * 6;
        const sc = lerp(.08, 1, e) * (1 - tk1 * .7), rot = (1 - e) * 220 + Math.sin(lt * 4) * 3 + tk1 * 40;
        at(this.tk, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(rot)}) scale(${f2(sc)},${f2(sc * (0.75 + 0.25 * Math.cos(lt * 9 * (1 - e))))})` });
      }
      // 鹈鹕
      this.pel.update(lt, s, { lt });
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 标题
      const ti = eo(inv(0.15, 0.6, lt)), to = inv(2.2, 2.6, lt);
      at(this.title, { opacity: f2(ti * (1 - to)), transform: `translate(0,${f1((1 - ti) * -20)})` });
      this.tl.setAttribute('stroke-dashoffset', f2(1 - inv(0.3, 1.2, lt)));
      // 出口门
      const fx = frameScreenX(lt), dk = inv(3.8, 4.4, lt);
      vis(this.door, lt > 3.75);
      this.dl.setAttribute('stroke-dashoffset', f2(1 - dk));
      at(this.dr, { opacity: f2(ss(0, .5, dk)) });
      at(this.door, { transform: `translate(${f1(fx)},${GY + 30})` });
    },
    openD(lt, cx) {
      const dw = 560, dh = 520, by = GY + 30;
      return `M${f1(cx - dw / 2)},${by}V${by - dh + dw / 2}A${dw / 2},${dw / 2} 0 0 1 ${f1(cx + dw / 2)},${by - dh + dw / 2}V${by}Z`;
    },
    exitFx: {
      win: [0, 1.0],
      build(g) {
        g.innerHTML = `<rect class="fl" width="1920" height="1080" fill="#fff8e0"/><path class="bd" fill="none" stroke="#e8c56a" stroke-width="6"/><path class="bd2" fill="none" stroke="#e8c56a" stroke-width="2"/>`;
        this.fl = q(g, '.fl'); this.bd = q(g, '.bd'); this.bd2 = q(g, '.bd2');
      },
      update(u) {
        const ex = this;
        op(ex.fl, bump(u - 0.05, 0.12) * .55);
        // 门框的金线扩展成下一版块的雕花边框
        const k = eio(clamp(u / 0.55));
        const a = [PX - 280, GY + 30 - 520, PX + 280, GY + 30], b = [30, 30, 1890, 1050];
        const r = a.map((v, i) => lerp(v, b[i], k));
        ex.bd.setAttribute('d', rectD(r[0], r[1], r[2] - r[0], r[3] - r[1]));
        ex.bd2.setAttribute('d', rectD(r[0] + 12, r[1] + 12, r[2] - r[0] - 24, r[3] - r[1] - 24));
        const o = 1 - ss(.6, 1.0, u);
        op(ex.bd, o); op(ex.bd2, o * .8);
      }
    }
  });
})();
