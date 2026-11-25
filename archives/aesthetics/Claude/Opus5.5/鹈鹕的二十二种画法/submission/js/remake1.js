'use strict';
/* ============================================================
   按「载体与镜头」重做的版块 1–4
   旧版块对象保留在 OLDSCENES 里，只借用它们定义的滤镜/渐变（鹈鹕风格要用）
   ============================================================ */
const OLDSCENES = SCENES.slice();
function legacyDefs(i) {
  const o = OLDSCENES[i]; if (!o || o._ld) return; o._ld = true;
  const tmp = mk('g', {}, document.getElementById('defs'));
  try { o.build(tmp); } catch (e) { console.warn('legacy', i, e); }
  tmp.remove();
}
function remake(i, obj) { obj.key = OLDSCENES[i].key; obj.zh = OLDSCENES[i].zh; obj.en = OLDSCENES[i].en; const b = obj.build; obj.build = function (root) { legacyDefs(i); b.call(this, root); }; SCENES[i] = obj; }
const pageT = (rot, sc) => `translate(960,540) rotate(${rot}) scale(${sc}) translate(-960,-540)`;
function pageToScreen(x, y, rot, sc) { const a = rot * PI / 180, dx = x - 960, dy = y - 540; return [960 + sc * (dx * Math.cos(a) - dy * Math.sin(a)), 540 + sc * (dx * Math.sin(a) + dy * Math.cos(a))]; }

/* ---------------- No.01 红黑拼贴：倾斜的海报版面，几块斜切分格轮流给近景和远景 ---------------- */
(function () {
  const R0 = '#d42a1e', K = '#151313', PP = '#efe6d3', PP2 = '#e4d9c2';
  const ROT = -14, SC = 1.16, GYP = 700, X0 = 600;
  const D = makeDist(CRUISE);
  const pelPX = lt => 760 + 75 * lt;                     // 鹈鹕在版面上的 x（沿斜线向右上冲）
  const FONTS = ["'Source Han Serif CN'", "'Alimama ShuHeiTi'", "'Source Han Sans CN'", "'XiQuezhaopaiti'", "'Abril Fatface','Source Han Serif CN'"];
  const scrap = (cx, cy, ch, o) => `<g transform="translate(${cx},${cy}) rotate(${o.rot})"><path d="${tornRect(-o.w / 2 + 7, -o.h / 2 + 7, o.w, o.h, 3, 9, o.R)}" fill="#000" opacity=".35"/><path d="${tornRect(-o.w / 2, -o.h / 2, o.w, o.h, o.amp || 3, 9, o.R)}" fill="${o.bg}"/><text x="0" y="${o.dy}" text-anchor="middle" font-family="${o.font}" font-weight="900" font-size="${o.size}" fill="${o.fg}">${esc(ch)}</text></g>`;
  remake(0, {
    build(root) {
      const R = rng(1101);
      add(root, `<rect x="-2400" y="-1800" width="6720" height="4680" fill="${K}"/>`);
      this.page = mk('g', { transform: pageT(ROT, SC) }, root);
      // —— 世界（版面坐标，水平铺开，整体倾斜后成了左下→右上的斜线）——
      const world = mk('g', { id: 'n01world' });
      this.L = [];
      const lay = (p, m) => { const l = layer(world, p, m); this.L.push(l); return l; };
      add(world, `<rect x="-3000" y="-2000" width="9000" height="5000" fill="${PP}"/>`);
      let sky = `<path d="M-2000,-900H6000V330L-2000,420Z" fill="${K}"/>`;
      let te = 'M-2000,420'; for (let x = -2000; x <= 6000; x += 30) te += `L${x},${f1(420 - (x + 2000) * .011 + (R() - .5) * 16)}`; sky += te + 'L6000,360L6000,400L-2000,450Z';
      sky = sky.replace(te + 'L6000,360L6000,400L-2000,450Z', `<path d="${te}L6000,330L6000,380L-2000,460Z" fill="${PP2}"/>`);
      for (let i = 0; i < 40; i++) { const x = -1800 + R() * 7600, y = -500 + R() * 820, r = 10 + R() * 26; sky += `<path d="${P(starPts(x, y, r, r * .42, 5, R()), true)}" fill="${i % 4 ? PP : R0}"/>`; }
      lay(0.08, sky);
      let sun = `<g transform="translate(1900,40)">`;
      for (let i = 0; i < 28; i++) { const a = i * TAU / 28; sun += `<path d="M0,0L${f1(Math.cos(a) * 2200)},${f1(Math.sin(a) * 2200)}L${f1(Math.cos(a + .05) * 2200)},${f1(Math.sin(a + .05) * 2200)}Z" fill="${PP}" opacity="${i % 3 ? .08 : .18}"/>`; }
      sun += `<circle r="230" fill="${R0}"/><circle r="150" fill="none" stroke="${K}" stroke-width="12"/><path d="M0,-230V230M-230,0H230" stroke="${K}" stroke-width="6"/></g>`;
      lay(0.04, sun);
      let city = '', x = -1500;
      while (x < 6500) {
        const w = 80 + R() * 140, h = 140 + R() * 260, base = 600, ty = R();
        const pts = [[x, base], [x, base - h]];
        if (ty < .25) pts.push([x + w * .5, base - h - 60 - R() * 80]);
        else if (ty < .45) { for (let i = 0; i < 3; i++) { pts.push([x + w * i / 3, base - h - 36]); pts.push([x + w * (i + 1) / 3, base - h]); } }
        else if (ty < .6) pts.push([x + w * .2, base - h], [x + w * .2, base - h - 130], [x + w * .34, base - h - 130], [x + w * .34, base - h]);
        pts.push([x + w, base - h], [x + w, base]);
        city += `<path d="${P(pts, true)}" fill="${K}"/>`;
        for (let j = 0; j < 5; j++) if (R() < .6) city += `<rect x="${f1(x + 10 + R() * (w - 30))}" y="${f1(base - h + 24 + R() * (h - 60))}" width="${f1(8 + R() * 14)}" height="${f1(14 + R() * 26)}" fill="${R() < .7 ? R0 : PP}"/>`;
        x += w - 6;
      }
      city += `<rect x="-1500" y="598" width="8000" height="160" fill="${K}"/>`;
      lay(0.3, city);
      let sc = '';
      const WORDS = ['速度', '节奏', '画法', '前进', '鹈鹕', '海报', '冲', '★'];
      for (let i = 0; i < 16; i++) {
        const cx = -900 + i * 420 + R() * 120, cy = 470 + R() * 90, w = 120 + R() * 110, h = 70 + R() * 70;
        sc += `<g transform="translate(${f1(cx)},${f1(cy)}) rotate(${f1((R() - .5) * 30)})"><path d="${tornRect(-w / 2 + 6, -h / 2 + 6, w, h, 3, 8, R)}" fill="#000" opacity=".3"/><path d="${tornRect(-w / 2, -h / 2, w, h, 3, 8, R)}" fill="${i % 3 === 0 ? R0 : PP}"/>`;
        for (let j = 0; j < 3; j++) sc += `<rect x="${f1(-w / 2 + 10)}" y="${f1(-h / 2 + 32 + j * 11)}" width="${f1(w - 22 - R() * 30)}" height="4" fill="${K}" opacity=".55"/>`;
        sc += `<text x="${f1(-w / 2 + 10)}" y="${f1(-h / 2 + 26)}" font-family="${FONTS[i % 5]}" font-weight="900" font-size="24" fill="${i % 3 === 0 ? PP : K}">${WORDS[i % 8]}</text></g>`;
      }
      lay(0.45, sc);
      let near = '';
      for (let i = 0; i < 12; i++) { const bx = -1000 + i * 560 + R() * 140, w = 150 + R() * 110, h = 180 + R() * 120; near += `<g transform="translate(${f1(bx)},${GYP - 26}) skewX(${f1((R() - .5) * 18)})"><rect y="${f1(-h)}" width="${f1(w)}" height="${f1(h)}" fill="${K}"/>${[0, 1, 2, 3].map(j => `<rect x="12" y="${f1(-h + 20 + j * 40)}" width="${f1(w - 24)}" height="12" fill="${R0}"/>`).join('')}</g>`; }
      lay(0.7, near);
      // 路：版面上一道粗黑线 + 红黑斜纹带
      let road = `<rect x="-2000" y="${GYP}" width="9000" height="400" fill="${PP}"/><rect x="-2000" y="${GYP - 5}" width="9000" height="18" fill="${K}"/>`;
      for (let i = 0; i < 150; i++) road += `<path d="M${-2000 + i * 60},${GYP + 300}L${-1960 + i * 60},${GYP + 60}L${-1936 + i * 60},${GYP + 60}L${-1976 + i * 60},${GYP + 300}Z" fill="${i % 2 ? R0 : K}"/>`;
      road += `<rect x="-2000" y="${GYP + 34}" width="9000" height="9" fill="${K}"/>`;
      road += `<g transform="translate(${X0 + SPEED * 1.6 + 120},${GYP - 6}) rotate(-6)"><rect x="-6" y="-200" width="12" height="200" fill="${K}"/><path d="${tornRect(-92, -300, 184, 118, 3, 8, R)}" fill="${R0}"/><text y="-232" text-anchor="middle" font-family="Anton,Impact" font-size="66" fill="${PP}">No.01</text><text y="-196" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="900" font-size="22" fill="${K}">第一种画法 →</text></g>`;
      // 出口：红黑海报（立在斜线尽头）
      const pX = X0 + D(6) + 175;
      this.posterX = pX;
      road += `<g class="poster" transform="translate(${pX},${GYP + 30})"><rect x="-20" y="-566" width="600" height="566" fill="${K}"/><path d="${tornRect(0, -540, 560, 516, 4, 12, R)}" fill="${K}" stroke="${PP}" stroke-width="3"/>
        <path d="M0,-290L560,-540V-100L0,-24Z" fill="${R0}"/><path d="${P(starPts(340, -330, 150, 60, 5), true)}" fill="${PP}"/><path d="${P(starPts(340, -330, 92, 37, 5), true)}" fill="${R0}"/>
        <text x="30" y="-120" font-family="'Alimama ShuHeiTi'" font-size="104" fill="${PP}" transform="rotate(-8,30,-120)">冲破</text><text x="36" y="-62" font-family="Anton" font-size="30" letter-spacing="5" fill="${K}">NEXT STOP →</text></g>`;
      this.Lr = lay(1, road);
      this.poster = q(this.Lr.g, '.poster');
      this.pg = mk('g', {}, world);
      this.speed = mk('g', { opacity: 0 }, this.pg);
      let sp = ''; for (let i = 0; i < 9; i++) sp += `<path d="M${-220 - R() * 200},${-60 - i * 36}h${-140 - R() * 220}" stroke="${K}" stroke-width="${6 + R() * 8}"/>`;
      this.speed.innerHTML = sp;
      this.pel = PELICANS.s01(); this.pg.appendChild(this.pel.g);
      this.world = world;
      // —— 三块斜切分格：中间是中景本体，两侧用 <use> 给近景 / 远景 ——
      def(`<clipPath id="n01cL" clipPathUnits="userSpaceOnUse"><path class="c"/></clipPath><clipPath id="n01cM" clipPathUnits="userSpaceOnUse"><path class="c"/></clipPath><clipPath id="n01cR" clipPathUnits="userSpaceOnUse"><path class="c"/></clipPath>`);
      this.cL = q(DEFS, '#n01cL .c'); this.cM = q(DEFS, '#n01cM .c'); this.cR = q(DEFS, '#n01cR .c');
      const pL = mk('g', { 'clip-path': 'url(#n01cL)' }, this.page), pM = mk('g', { 'clip-path': 'url(#n01cM)' }, this.page), pR = mk('g', { 'clip-path': 'url(#n01cR)' }, this.page);
      pM.appendChild(world);
      this.uL = mk('use', { href: '#n01world' }, pL); this.uR = mk('use', { href: '#n01world' }, pR);
      this.gut = mk('g', {}, this.page);
      this.gut.innerHTML = [0, 1].map(() => `<g class="gt"><rect x="-16" y="-900" width="32" height="3000" fill="${PP}"/><path d="M-16,-900V2100M16,-900V2100" stroke="${K}" stroke-width="7"/></g>`).join('');
      this.gts = qa(this.gut, '.gt');
      this.tagL = add(this.page, `<g><rect x="0" y="0" width="150" height="40" fill="${R0}"/><text x="12" y="29" font-family="Anton" font-size="24" letter-spacing="3" fill="${PP}">CLOSE-UP</text></g>`);
      this.tagR = add(this.page, `<g><rect x="0" y="0" width="120" height="40" fill="${K}"/><text x="12" y="29" font-family="Anton" font-size="24" letter-spacing="3" fill="${PP}">WIDE</text></g>`);
      // 斜切红黑两半（强拍）
      this.split = mk('g', { opacity: 0 }, root);
      this.split.innerHTML = `<path class="sr" d="M-200,-200H2200L-200,1300Z" fill="${R0}"/><path class="sk" d="M2200,-200V1300H-200Z" fill="${K}"/>`;
      this.splitR = q(this.split, '.sr'); this.splitK = q(this.split, '.sk');
      // 标题（剪报拼字）
      const R2 = rng(7);
      const sty = [[R0, PP], [K, PP], [PP, K], [R0, K], [K, R0]];
      let tc = '';
      ['红', '黑', '拼', '贴', '风'].forEach((c, i) => { tc += `<g class="tch">${scrap(0, 0, c, { R: R2, w: 120, h: 132, rot: (R2() - .5) * 18, bg: sty[i][0], fg: sty[i][1], font: FONTS[i], size: 98, dy: 35 })}</g>`; });
      tc += `<g class="ten" transform="translate(150,355) rotate(-6)"><rect x="-30" y="-46" width="560" height="64" fill="${K}"/><text x="0" y="4" font-family="Anton,Impact" font-size="48" letter-spacing="6" fill="${PP}">RED-BLACK <tspan fill="${R0}">COLLAGE</tspan></text></g>`;
      this.title = mk('g', {}, root); this.title.innerHTML = tc;
      this.tch = qa(this.title, '.tch'); this.ten = q(this.title, '.ten');
      // 高光：剪报字从四面八方飞来，斜着拼成「鹈鹕，出发」
      const hl = ['鹈', '鹕', '，', '出', '发'];
      this.hpos = [[700, 470], [880, 410], [1000, 384], [1130, 330], [1310, 268]];
      this.hfrom = [[-300, -200], [2300, 900], [900, -300], [2200, -250], [1200, 1300]];
      const hst = [[PP, K, 0], [R0, PP, 1], [K, PP, 2], [K, R0, 3], [R0, K, 4]];
      this.head = mk('g', {}, root);
      this.head.innerHTML = hl.map((c, i) => { const sm = c === '，'; return `<g class="hch">${scrap(0, 0, c, { R: R2, w: sm ? 70 : 168, h: sm ? 92 : 184, rot: (R2() - .5) * 20, bg: hst[i][0], fg: hst[i][1], font: FONTS[hst[i][2]], size: sm ? 90 : 140, dy: sm ? 20 : 48 })}</g>`; }).join('');
      this.hch = qa(this.head, '.hch');
    },
    panels(lt) {
      // 分格位置（版面坐标的竖线）；第 2 小节合成一整幅
      const open = ss(1.85, 2.15, lt) * (1 - ss(3.85, 4.15, lt));
      return [lerp(560, -700, open), lerp(1440, 2600, open)];
    },
    update(lt) {
      const d = D(lt), px = pelPX(Math.min(lt, 6.6));
      const camX = X0 + d - px;
      for (const l of this.L) l.g.setAttribute('transform', `translate(${f1(-camX * l.p)},0)`);
      // 急转亮相
      let sx = 1, py = 0, rot = 0;
      const k1 = inv(2.5, 2.78, lt);
      if (lt > 2.5 && lt < 2.78) { sx = Math.cos(k1 * TAU); py = -Math.sin(k1 * PI) * 46; }
      rot = -17 * ss(2.74, 3.0, lt) * (1 - ss(3.6, 3.95, lt));
      ride(this.pel, d);
      const wx = px;                                   // 鹈鹕画在版面上的 px 处（世界向后滚动 camX）
      at(this.pg, { transform: `translate(${f1(wx)},${f1(GYP + py)}) translate(-110,0) rotate(${f2(rot)}) translate(110,0) scale(${f2(Math.abs(sx) < .08 ? .08 * Math.sign(sx || 1) : sx)},1)` });
      op(this.speed, inv(2.5, 2.6, lt) * (1 - inv(3.7, 4, lt)));
      // 分格
      const [g1, g2] = this.panels(lt);
      at(this.cL, { d: `M-2000,-2000H${f1(g1)}V3000H-2000Z` }); at(this.cM, { d: `M${f1(g1)},-2000H${f1(g2)}V3000H${f1(g1)}Z` }); at(this.cR, { d: `M${f1(g2)},-2000H5000V3000H${f1(g2)}Z` });
      this.gts[0].setAttribute('transform', `translate(${f1(g1)},0)`); this.gts[1].setAttribute('transform', `translate(${f1(g2)},0)`);
      const swap = lt >= 4.0;
      const head = [px + 60 - X0 - d + wx, GYP - 330], wheel = [px + 110, GYP - 70], wide = [px + 400, GYP - 220];
      const tf = (T, z, H) => `translate(${f1(T[0])},${f1(T[1])}) scale(${z}) translate(${f1(-H[0])},${f1(-H[1])})`;
      // 近景 / 远景轮流
      const cL = [(g1 - 400) / 2 + 40, 560], cR = [(g2 + 2300) / 2 - 40, 520];
      const headP = [px + 60, GYP - 330];
      if (!swap) { this.uL.setAttribute('transform', tf(cL, 2.3, headP)); this.uR.setAttribute('transform', tf(cR, .46, wide)); }
      else { this.uL.setAttribute('transform', tf(cL, .46, [px + 200, GYP - 200])); this.uR.setAttribute('transform', tf(cR, 2.6, wheel)); }
      at(this.tagL, { transform: `translate(${f1(g1 - 190)},120)` }); at(this.tagR, { transform: `translate(${f1(g2 + 40)},120)` });
      this.tagL.lastChild.textContent = swap ? 'WIDE' : 'CLOSE-UP'; this.tagR.lastChild.textContent = swap ? 'CLOSE-UP' : 'WIDE';
      // 斜切
      const sp = inv(2.98, 3.1, lt), sp2 = inv(3.85, 4.05, lt);
      op(this.split, sp > 0 && sp2 < 1 ? 1 : 0);
      if (sp > 0 && sp2 < 1) { const e = eob(sp), o = ei(sp2) * 1500; this.splitR.setAttribute('transform', `translate(${f1(-(1 - e) * 1500 - o)},${f1(-(1 - e) * 860 - o * .6)})`); this.splitK.setAttribute('transform', `translate(${f1((1 - e) * 1500 + o)},${f1((1 - e) * 860 + o * .6)})`); }
      // 标题
      const tIn = lt - 0.15, tOut = inv(1.7, 2.0, lt);
      this.tch.forEach((g, i) => { const k = eob(inv(i * .09, i * .09 + .3, tIn)); at(g, { transform: `translate(${f1(150 + i * 126 - tOut * 900)},${f1(230 + (i % 2) * 14 - (1 - k) * 600)}) rotate(${f1((1 - k) * 40)})`, opacity: f2(inv(i * .09, i * .09 + .05, tIn)) }); });
      at(this.ten, { transform: `translate(${f1(150 - (1 - eo(inv(.6, .9, tIn))) * 900 - tOut * 1200)},355) rotate(-6)` });
      this.hch.forEach((g, i) => { const a = 2.05 + i * .16, k = inv(a, a + .32, lt), out = inv(4.25, 4.6, lt), e = eob(k), f = this.hfrom[i], pt = this.hpos[i]; at(g, { transform: `translate(${f1(lerp(f[0], pt[0], e) - out * 1600)},${f1(lerp(f[1], pt[1], e) - out * 500)}) rotate(${f1((1 - e) * (i % 2 ? 160 : -140) - 12)}) scale(${f2(1 + bump(lt - 3.0, .08) * .12)})`, opacity: k > 0 ? 1 : 0 }); });
      const pk = eob(inv(3.7, 4.05, lt));
      vis(this.poster, false);
      at(this.poster, { transform: `translate(${this.posterX},${GYP + 30}) scale(${f2(1 + bump(lt - 5.98, .07) * .05)},${f2(pk)})` });
    },
    impact() { return pageToScreen(pelPX(6) + 190, GYP - 250, ROT, SC); },
    exit(u, X) {
      if (u < 0) { X.clipD('M0,0Z'); return; }
      const c = this.impact(), k = ei(clamp(u / 0.5)), z = 1 + 5 * k;
      X.clipD(P(circPts(c[0], c[1], 160 + u * 2800, 14, .3, rng(3)), true));
      X.camA(zoomT(z, c[0], c[1]));
      if (u >= 0.5) { X.none(); X.hideA(); }
    },
    exitFx: {
      win: [0, 1.1],
      build(g) {
        const Rr = rng(55); const x0 = pelPX(6) + 175 + 0, y0 = GYP + 30 - 540, pw = 560, ph = 516, nx = 6, ny = 6, pts = [];
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const ex = i === 0 || i === nx, ey = j === 0 || j === ny; pts.push(pageToScreen(x0 + i * pw / nx + (ex ? 0 : (Rr() - .5) * 60), y0 + j * ph / ny + (ey ? 0 : (Rr() - .5) * 60), ROT, SC)); }
        const c = pageToScreen(pelPX(6) + 120, GYP - 260, ROT, SC), stars = S02STARS();
        this.fr = []; let si = 0, s = '';
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = pts[j * (nx + 1) + i], b = pts[j * (nx + 1) + i + 1], cc = pts[(j + 1) * (nx + 1) + i + 1], dd = pts[(j + 1) * (nx + 1) + i];
          for (const tri of [[a, b, cc], [a, cc, dd]]) {
            const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3, red = Rr() < .3;
            s += `<g class="fr"><path d="${P(tri.map(p => [p[0] - cx, p[1] - cy]), true)}" fill="${red ? R0 : K}"/>${red ? `<path d="M0,-12L3,-3L12,0L3,3L0,12L-3,3L-12,0L-3,-3Z" fill="#fff3c8" opacity="0"/>` : ''}</g>`;
            this.fr.push({ cx, cy, red, st: red ? stars[(si++ * 7) % stars.length] : null, ang: Math.atan2(cy - c[1], cx - c[0]), sp: 500 + Rr() * 900, rot: (Rr() - .5) * 720, sc: 1.6 + Rr() * 3 });
          }
        }
        s += `<path class="rail" d="M-100,780H2000" stroke="#ffd36a" stroke-width="5" fill="none" pathLength="1" stroke-dasharray="1 1"/>`;
        g.innerHTML = s; this.fe = qa(g, '.fr'); this.rail = q(g, '.rail');
      },
      update(u) {
        this.fe.forEach((e, i) => {
          const f = this.fr[i], k = clamp(u / .75);
          if (f.red) { const kk = eio(k), sc2 = lerp(1, .06, ss(0, .7, k)); at(e, { transform: `translate(${f1(lerp(f.cx, f.st[0], kk) + Math.cos(f.ang) * Math.sin(kk * PI) * 160)},${f1(lerp(f.cy, f.st[1], kk) + Math.sin(f.ang) * Math.sin(kk * PI) * 160)}) rotate(${f1(f.rot * kk)}) scale(${f2(sc2)})`, opacity: f2(1 - ss(.75, 1, u)) }); e.lastChild.setAttribute('opacity', f2(ss(.4, .8, k))); e.lastChild.setAttribute('transform', `scale(${f2(.5 / Math.max(sc2, .06))})`); }
          else { const kk = eo(k), dd = f.sp * kk; at(e, { transform: `translate(${f1(f.cx + Math.cos(f.ang) * dd)},${f1(f.cy + Math.sin(f.ang) * dd - kk * 200)}) rotate(${f1(f.rot * kk)}) scale(${f2(1 + f.sc * kk)})`, opacity: f2(1 - ss(.25, .8, u)) }); }
        });
        this.rail.setAttribute('stroke-dashoffset', f2(1 - eo(inv(.02, .35, u)))); op(this.rail, 1 - inv(.7, 1.1, u));
      }
    }
  });
})();

/* ---------------- No.02 星际列车：星图航线界面，大远景侧面跟拍，星层视差 ---------------- */
(function () {
  const GOLD = '#e8c56a', GOLD2 = '#fff0b8';
  const S = 0.55, PXS = 820;                               // 大远景：鹈鹕缩小
  const D = makeDist(CRUISE);
  const trackY = w => 770 + 46 * Math.sin(w / 620) + 20 * Math.sin(w / 260 + 1);
  const slope = w => (trackY(w + 2) - trackY(w - 2)) / 4;
  const scrollOf = lt => D(lt) * S;
  remake(1, {
    build(root) {
      const R = rng(2202);
      def(`<linearGradient id="n02skyU" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1080"><stop offset="0" stop-color="#03061a"/><stop offset=".55" stop-color="#0d1747"/><stop offset=".85" stop-color="#2b2a6a"/><stop offset="1" stop-color="#4a3a78"/></linearGradient>
        <radialGradient id="n02dawn"><stop offset="0" stop-color="#fff2c8"/><stop offset=".25" stop-color="#ffc98a" stop-opacity=".9"/><stop offset=".6" stop-color="#ff8a7a" stop-opacity=".35"/><stop offset="1" stop-color="#ff8a7a" stop-opacity="0"/></radialGradient>`);
      add(root, `<rect x="-2600" y="-2000" width="7120" height="5080" fill="url(#n02skyU)"/>`);
      let mw = ''; for (let i = 0; i < 9; i++) { const x = -100 + i * 280, y = 520 - i * 50; mw += `<ellipse cx="${x}" cy="${y}" rx="${260 + R() * 120}" ry="${70 + R() * 40}" fill="${i % 2 ? '#7b86d8' : '#b9a6f0'}" opacity=".22" transform="rotate(-10,${x},${y})"/>`; }
      add(root, `<g filter="url(#s02blur)">${mw}</g>`);
      // 三层星，视差不同；每层画两份以便循环
      this.starL = [];
      const stars = S02STARS();
      [[.03, 120, .5], [.08, 90, 1], [.18, 60, 1.6]].forEach(([p, n, sz], li) => {
        let s = '';
        for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) { const x = (i * 97.3 + li * 31) % 1920 + c * 1920, y = (i * 53.7 * (li + 1)) % 1000 + 20, r = sz * (.6 + ((i * 7) % 5) / 5); s += r > 1.6 ? `<path d="M${f1(x)},${f1(y - r * 4)}L${f1(x + r * .8)},${f1(y)}L${f1(x)},${f1(y + r * 4)}L${f1(x - r * .8)},${f1(y)}Z" fill="#fff6d8"/>` : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#fff8e6"/>`; }
        if (li === 1) stars.forEach(s2 => { for (let c = 0; c < 2; c++) s += `<circle cx="${f1(s2[0] + c * 1920)}" cy="${f1(s2[1])}" r="${f1(s2[2])}" fill="#fff"/>`; });
        this.starL.push({ g: add(root, `<g>${s}</g>`), p });
      });
      // 行星与星座（远景）
      add(root, `<g transform="translate(250,190)"><ellipse rx="150" ry="34" fill="none" stroke="${GOLD}" stroke-width="3" opacity=".55" transform="rotate(-14)"/><circle r="74" fill="url(#s02planet)"/><path d="M-150,0A150,34 0 0 0 150,0" transform="rotate(-14)" fill="none" stroke="${GOLD}" stroke-width="3" opacity=".8"/></g>
        <g transform="translate(1560,150)"><circle r="26" fill="#fff0c8"/><circle cx="10" cy="-7" r="24" fill="#0a1238"/></g>`);
      // 第 3 小节：轨道尽头亮起晨光（列车开向黎明）
      this.dawn = add(root, `<g style="mix-blend-mode:screen" opacity="0"><ellipse cx="2050" cy="700" rx="1300" ry="560" fill="url(#n02dawn)"/><ellipse cx="2000" cy="720" rx="420" ry="160" fill="url(#n02dawn)"/></g>`);
      // 世界层（鹈鹕、发光轨道、列车）
      this.world = mk('g', {}, root);
      let tr = '', tr2 = '';
      for (let w = -1500; w <= 5600; w += 20) { tr += (w === -1500 ? 'M' : 'L') + w + ',' + f1(trackY(w)); tr2 += (w === -1500 ? 'M' : 'L') + w + ',' + f1(trackY(w) - 150); }
      let tm = `<path d="${tr}" stroke="${GOLD}" stroke-width="8" fill="none" opacity=".35" filter="url(#s02blur)"/><path d="${tr}" stroke="${GOLD}" stroke-width="3" fill="none" filter="url(#s02glow)"/><path d="${tr2}" stroke="${GOLD}" stroke-width="2.5" fill="none" filter="url(#s02glow)"/>`;
      for (let w = -1500; w <= 5600; w += 26) { const y = trackY(w); tm += `<path d="M${w},${f1(y + 3)}l-6,12" stroke="${GOLD}" stroke-width="2" opacity=".45"/>`; }
      for (let w = -1400; w <= 5600; w += 520) { const y = trackY(w); tm += `<path d="M${w},${f1(y)}V${f1(y - 70)}" stroke="${GOLD}" stroke-width="1.5" opacity=".7"/><circle cx="${w}" cy="${f1(y - 74)}" r="4" fill="#fff2c4" filter="url(#s02glow)"/>`; }
      // 站名牌 = 里程碑 No.02
      const sw = 820 + SPEED * S * 1.4;
      tm += `<g transform="translate(${f1(sw)},${f1(trackY(sw))}) scale(.62)"><path d="M-80,0V-170M80,0V-170" stroke="${GOLD}" stroke-width="4"/><rect x="-140" y="-290" width="280" height="130" rx="8" fill="#f6ecd2" stroke="${GOLD}" stroke-width="4"/><text y="-232" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="46" fill="#0b1236">星海站</text><text y="-202" text-anchor="middle" font-family="'Cormorant Garamond'" font-size="20" letter-spacing="4" fill="#5a4518">STELLA · No.02</text></g>`;
      this.track = add(this.world, `<g>${tm}</g>`);
      // 列车
      this.cars = [];
      const carM = (c) => { const x0 = -165; let s = `<rect x="${x0}" y="-160" width="310" height="140" rx="12" fill="url(#s02car)" stroke="${GOLD}" stroke-width="2"/><path d="M${x0},-56H${x0 + 310}M${x0},-140H${x0 + 310}" stroke="${GOLD}" stroke-width="1.2"/>`; for (let w = 0; w < 5; w++) s += `<rect x="${x0 + 18 + w * 58}" y="-128" width="44" height="60" rx="5" fill="url(#s02win)"/><g class="pax" transform="translate(${x0 + 18 + w * 58},-128)" clip-path="url(#s02wc${w})"></g>`; s += `<circle cx="-110" cy="-16" r="16" fill="#0c1230" stroke="${GOLD}" stroke-width="1.5"/><circle cx="90" cy="-16" r="16" fill="#0c1230" stroke="${GOLD}" stroke-width="1.5"/>`; return s; };
      const loco = `<rect x="-200" y="-140" width="250" height="118" rx="10" fill="#141a3c" stroke="${GOLD}" stroke-width="2"/><rect x="50" y="-160" width="110" height="140" fill="#10163a" stroke="${GOLD}" stroke-width="2"/><rect x="70" y="-140" width="70" height="44" fill="url(#s02win)"/><rect x="-150" y="-200" width="34" height="62" fill="#141a3c" stroke="${GOLD}" stroke-width="2"/><circle cx="-200" cy="-82" r="32" fill="#1a2250" stroke="${GOLD}" stroke-width="2"/><circle cx="-200" cy="-82" r="13" fill="#fff4c4" filter="url(#s02glow)"/>${[-150, -70, 10, 100].map(x => `<circle cx="${x}" cy="-20" r="22" fill="#0c1230" stroke="${GOLD}" stroke-width="2"/>`).join('')}`;
      for (let c = 0; c < 5; c++) { const g = add(this.world, `<g>${c === 0 ? loco.replace(/-200/g, '200').replace('x="200" y="-140"', 'x="-50" y="-140"') : carM(c)}</g>`); this.cars.push(g); }
      this.cars[0].innerHTML = `<g transform="scale(-1,1)">${loco}</g>`;
      this.pax = [];
      this.cars.slice(1).forEach(g => qa(g, '.pax').forEach((pg, i) => { const r2 = rng(this.pax.length * 13 + 5), ty = Math.floor(r2() * 4); let s = `<g class="pp"><path d="M4,60C4,42 12,36 22,36C32,36 40,42 40,60Z" fill="#2a160c"/><circle cx="22" cy="27" r="10" fill="#2a160c"/>${ty === 0 ? `<path d="M8,20h28l-4,-11h-20Z" fill="#2a160c"/>` : ty === 1 ? `<path d="M12,27C11,10 33,10 32,27L35,48H9Z" fill="#2a160c"/>` : ''}<circle cx="27" cy="26" r="2" fill="#ffe7a0"/></g>`; pg.innerHTML = s; this.pax.push(q(pg, '.pp')); }));
      this.pg = mk('g', {}, this.world);
      this.pel = PELICANS.s02(); this.pg.appendChild(this.pel.g);
      // 出口：金饰车厢门（立在轨道上）
      this.door = mk('g', {}, this.world);
      const dw = 560, dh = 520;
      this.door.innerHTML = `<path d="M${-dw / 2 - 40},40V${-dh + dw / 2}A${dw / 2 + 40},${dw / 2 + 40} 0 0 1 ${dw / 2 + 40},${-dh + dw / 2}V40H${dw / 2}V${-dh + dw / 2}A${dw / 2},${dw / 2} 0 0 0 ${-dw / 2},${-dh + dw / 2}V40Z" fill="#141a3c" stroke="${GOLD}" stroke-width="4"/><path class="dl" d="M${-dw / 2 - 20},40V${-dh + dw / 2}A${dw / 2 + 20},${dw / 2 + 20} 0 0 1 ${dw / 2 + 20},${-dh + dw / 2}V40" fill="none" stroke="${GOLD}" stroke-width="3" pathLength="1" stroke-dasharray="1 1"/><circle cx="0" cy="${-dh - 8}" r="24" fill="#fff2c4" filter="url(#s02glow)"/><text x="0" y="${-dh + 34}" text-anchor="middle" font-family="'Cormorant Garamond'" font-size="26" letter-spacing="5" fill="${GOLD}">EXIT · 出口</text>`;
      this.dl = q(this.door, '.dl');
      // 车票（界面层）
      const hud = hudOf(root);
      this.ticket = mk('g', {}, hud);
      this.ticket.innerHTML = OLDSCENES[1]._ticket || '';
      this.ticket.innerHTML = `<g class="tk"><rect x="-270" y="-120" width="540" height="240" rx="10" fill="#f6ecd2"/><rect x="-258" y="-108" width="516" height="216" rx="6" fill="none" stroke="#b8902e" stroke-width="2"/><path d="M150,-108V108" stroke="#b8902e" stroke-width="2" stroke-dasharray="6 6"/><circle cx="-226" cy="-80" r="9" fill="#0b1236"/>
        <text x="-206" y="-74" font-family="'Cormorant Garamond',serif" font-size="17" fill="#6a5320" letter-spacing="3">INTERSTELLAR RAILWAY · 星际列车</text><text x="-230" y="10" font-family="'Source Han Serif CN',serif" font-weight="900" font-size="40" fill="#0b1236">终点站：下一种画法</text>
        <text x="-228" y="48" font-family="'Cormorant Garamond',serif" font-style="italic" font-size="22" fill="#4a3a18">Destination: the Next Way of Drawing</text><text x="-228" y="88" font-family="'JetBrains Mono',monospace" font-size="16" fill="#6a5320">No.000002 · 22号车厢 · 单程</text>
        <g transform="translate(205,0)"><circle r="40" fill="none" stroke="#9a3b5e" stroke-width="3"/><path d="${P(starPts(0, 0, 26, 11, 5), true)}" fill="#9a3b5e"/></g></g>`;
      this.tk = q(this.ticket, '.tk');
      // 星图航线界面
      let ui = `<g fill="none" stroke="${GOLD}" stroke-width="1.5"><path d="M40,40h70M40,40v70M1880,40h-70M1880,40v70M40,1040h70M40,1040v-70M1880,1040h-70M1880,1040v-70" stroke-width="3"/></g>`;
      ui += `<g transform="translate(560,70)"><path d="M0,30H800" stroke="${GOLD}" stroke-width="2" stroke-dasharray="2 6"/>`;
      [['红黑拼贴', 0], ['星海', 400], ['奇幻冒险', 800]].forEach(([n, x], i) => { ui += `<circle cx="${x}" cy="30" r="${i === 1 ? 10 : 7}" fill="${i === 1 ? GOLD : '#0b1236'}" stroke="${GOLD}" stroke-width="2"/><text x="${x}" y="70" text-anchor="middle" font-family="'Source Han Serif CN'" font-size="20" fill="${GOLD2}">${n}站</text>`; });
      ui += `<path class="mk" d="M0,0l10,14h-20Z" fill="${GOLD2}" transform="translate(0,8)"/><text x="400" y="0" text-anchor="middle" font-family="'Cormorant Garamond'" font-size="20" letter-spacing="6" fill="${GOLD}">ROUTE 22 · 银河线</text></g>`;
      ui += `<g transform="translate(1700,860)" fill="none" stroke="${GOLD}" stroke-width="1.2" opacity=".85"><circle r="120"/><circle r="80" stroke-dasharray="3 5"/><circle r="40"/><path d="M-130,0H130M0,-130V130"/><path class="sweep" d="M0,0L0,-120" stroke-width="2"/></g>`;
      ui += `<g font-family="'JetBrains Mono'" font-size="16" fill="${GOLD}"><text x="70" y="1000">RA 22h 08m · DEC −45°</text><text class="vel" x="70" y="1024">VELOCITY 0330 · DIST 000000</text></g>`;
      this.ui = mk('g', {}, hud); this.ui.innerHTML = ui;
      this.mk = q(this.ui, '.mk'); this.sweep = q(this.ui, '.sweep'); this.vel = q(this.ui, '.vel');
      // 标题
      this.title = mk('g', {}, hud);
      this.title.innerHTML = `<g transform="translate(120,180)"><rect width="560" height="190" fill="#0b1236" fill-opacity=".75" stroke="${GOLD}" stroke-width="2"/><rect x="8" y="8" width="544" height="174" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".7"/>
        <text x="280" y="92" text-anchor="middle" font-family="'Source Han Serif CN',serif" font-weight="600" font-size="72" letter-spacing="18" fill="${GOLD2}">星际列车</text><text x="280" y="160" text-anchor="middle" font-family="'Trajan Pro 3','Cormorant Garamond',serif" font-size="24" letter-spacing="7" fill="${GOLD}">INTERSTELLAR RAILWAY</text></g>`;
    },
    trainW(lt) { // 列车车头在世界中的位置（相对鹈鹕）
      const pw = 820 + scrollOf(lt);
      if (lt < 2) return pw + lerp(-380, 520, eo(clamp((lt + 2) / 4)));
      if (lt < 4) return pw + 520;
      return pw + 520 + 520 * Math.pow(lt - 4, 1.8);
    },
    camZ(lt) { return 1 + .85 * eio(inv(1.9, 2.4, lt)) * (1 - eio(inv(3.7, 4.2, lt))); },
    update(lt) {
      const d = D(lt), sc = scrollOf(lt), w = 820 + sc;
      this.starL.forEach(l => l.g.setAttribute('transform', `translate(${f1(-((sc * l.p * 3) % 1920))},0)`));
      const ty = trackY(w), ang = Math.atan(slope(w)) * 180 / PI;
      const z = this.camZ(lt);
      this.world.setAttribute('transform', zoomT(z, PXS, ty - 120) + ` translate(${f1(-sc)},0)`);
      ride(this.pel, d, { lt, v: SPEED });
      at(this.pg, { transform: `translate(${f1(w)},${f1(ty)}) rotate(${f2(ang)}) scale(${S})` });
      // 列车沿轨道
      const tw = this.trainW(lt);
      this.cars.forEach((g, i) => { const cw = tw - (i === 0 ? 0 : 230 + (i - 1) * 182) * 1; const y = trackY(cw) - 150, a = Math.atan(slope(cw)) * 180 / PI; g.setAttribute('transform', `translate(${f1(cw)},${f1(y)}) rotate(${f2(a)}) scale(${S})`); });
      this.pax.forEach((p, i) => { const a = 2.0 + ((i * 7) % 20) / 20 * 1.1, k = eob(inv(a, a + .25, lt)) * (1 - inv(4.6, 4.9, lt)); p.setAttribute('transform', `translate(${f1((1 - k) * (i % 2 ? 46 : -46))},${f1((1 - k) * 10)})`); });
      // 车票飘出
      vis(this.ticket, lt > 2.85 && lt < 4.85);
      if (lt > 2.85 && lt < 4.85) { const e = eo(inv(2.85, 3.55, lt)), k1 = inv(4.25, 4.85, lt); at(this.tk, { transform: `translate(${f1(lerp(1150, 1360, e) + k1 * 700)},${f1(lerp(520, 330, e) - k1 * 420)}) rotate(${f1((1 - e) * 220 + Math.sin(lt * 4) * 3 + k1 * 40)}) scale(${f2(lerp(.08, 1, e) * (1 - k1 * .7))})` }); }
      // 出口门
      const dwx = 820 + scrollOf(6);
      vis(this.door, false);
      op(this.dawn, ss(3.3, 6.0, lt));
      at(this.door, { transform: `translate(${f1(dwx)},${f1(trackY(dwx) + 30 * S)}) scale(${S})`, opacity: f2(ss(3.75, 4.2, lt)) });
      this.dl.setAttribute('stroke-dashoffset', f2(1 - inv(3.8, 4.4, lt)));
      // 界面
      at(this.mk, { transform: `translate(${f1(lerp(240, 560, clamp((lt + 2) / 8)))},8)` });
      this.sweep.setAttribute('transform', `rotate(${f1(lt * 90)})`);
      this.vel.textContent = `VELOCITY 0330 · DIST ${String(Math.max(0, Math.round(d))).padStart(6, '0')}`;
      const ti = eo(inv(.15, .6, lt)), to = inv(1.7, 2.0, lt);
      at(this.title, { opacity: f2(ti * (1 - to)) });
    },
    portal(lt) {
      const sc = scrollOf(lt), dwx = 820 + scrollOf(6), x = dwx - sc, y = trackY(dwx) + 30 * S, w = 280 * S, h = 520 * S;
      return { d: `M${f1(x - w)},${f1(y)}V${f1(y - h + w)}A${f1(w)},${f1(w)} 0 0 1 ${f1(x + w)},${f1(y - h + w)}V${f1(y)}Z`, box: [x - w, y - h, x + w, y], pv: [x, y - h / 2], zmax: 9 };
    },
    exitFx: {
      win: [0, 1.0],
      build(g) { g.innerHTML = `<rect class="fl" width="1920" height="1080" fill="#fff8e0"/><path class="bd" fill="none" stroke="#e8c56a" stroke-width="6"/><path class="bd2" fill="none" stroke="#e8c56a" stroke-width="2"/>`; this.fl = q(g, '.fl'); this.bd = q(g, '.bd'); this.bd2 = q(g, '.bd2'); },
      update(u) {
        op(this.fl, bump(u - .05, .12) * .55);
        const p = SCENES[1].portal(6), k = eio(clamp(u / .55)), b = [30, 30, 1890, 1050];
        const r = p.box.map((v, i) => lerp(v, b[i], k));
        this.bd.setAttribute('d', rectD(r[0], r[1], r[2] - r[0], r[3] - r[1])); this.bd2.setAttribute('d', rectD(r[0] + 12, r[1] + 12, r[2] - r[0] - 24, r[3] - r[1] - 24));
        const o = 1 - ss(.6, 1, u); op(this.bd, o); op(this.bd2, o * .8);
      }
    }
  });
})();
