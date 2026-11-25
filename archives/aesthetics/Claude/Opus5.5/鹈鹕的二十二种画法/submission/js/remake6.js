'use strict';
/* ---------------- No.17 波普艺术：一页多格漫画；车铃特写、中景骑行、大字拟声词、四色复制格，鹈鹕跨格骑行 ---------------- */
(function () {
  const RD = '#e8202a', YL = '#ffe21a', BL = '#1a5ae8', K = '#111111';
  const D = makeDist(CRUISE);
  const S = 0.6, YG = 740;
  const xAt = lt => 120 + (D(lt) - D(-2.1)) * S;
  const SCH = [{ body: '#ff6ac8', wing: '#ffe21a', beak: '#1ae8e0', pouch: '#ff3a3a', leg: '#1ae8e0', frame: '#3a1ae8', dot: 'r' }, { body: '#1ae8e0', wing: '#ff6ac8', beak: '#ffe21a', pouch: '#e8202a', leg: '#ffe21a', frame: '#ff8a1a', dot: 'b' }, { body: '#ffe21a', wing: '#3a8aff', beak: '#ff3a8a', pouch: '#ff8a1a', leg: '#ff3a8a', frame: '#e8202a', dot: 'r' }, { body: '#ff8a1a', wing: '#8a3aff', beak: '#3aff8a', pouch: '#ffe21a', leg: '#3aff8a', frame: '#1a5ae8', dot: 'b' }];
  const popPel = c => makePelican({ line: K, lw: 6, body: c.body, wing: c.wing, beak: c.beak, pouch: c.pouch, eye: K, neck: c.body, head: c.body, shade: { body: ['url(#s17d' + c.dot + ')', 10, -12], wing: ['url(#s17d' + c.dot + ')', 6, -7] }, leg: c.leg, legFar: c.leg, legW: 10, footLine: K, tire: K, tireW: 9, spoke: K, spokeW: 3, spokes: 8, frame: c.frame, frameW: 10, frameUnder: K, frameUnderW: 3, saddle: K, bar: K, crank: K, hub: YL, hubR: 8, fish: BL });
  const PANELS = { A: [40, 40, 600, 290], B: [660, 40, 1220, 290], C: [40, 350, 600, 410], D: [660, 350, 580, 410], E: [1260, 350, 620, 410], F: [40, 780, 1840, 260] };
  remake(16, {
    build(root) {
      const R = rng(1717);
      bigBg(root, '#fffef6');
      const clip = (id, r) => `<clipPath id="${id}"><rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}"/></clipPath>`;
      def(Object.keys(PANELS).map(k => clip('n17' + k, PANELS[k])).join(''));
      const panel = (k, inner, fill) => { const r = PANELS[k]; return `<g class="pn${k}"><g clip-path="url(#n17${k})"><rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="${fill}"/>${inner}</g><rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="none" stroke="${K}" stroke-width="8"/></g>`; };
      // A：车铃特写
      const bell = `<g transform="translate(330,190)"><path d="M-260,40H260" stroke="${K}" stroke-width="22"/><path d="M-110,40C-110,-60 110,-60 110,40Z" fill="#c8ccd4" stroke="${K}" stroke-width="7"/><path d="M-70,-10C-40,-40 40,-40 70,-10" stroke="#fff" stroke-width="9" fill="none"/><circle cy="-60" r="16" fill="${YL}" stroke="${K}" stroke-width="5"/><g class="lever"><path d="M90,10L210,-60" stroke="${K}" stroke-width="20" stroke-linecap="round"/><path d="M180,-90C230,-120 300,-80 280,-30C250,0 210,-10 190,-40Z" fill="#fff" stroke="${K}" stroke-width="6"/></g><g class="ring" stroke="${K}" stroke-width="7" fill="none" stroke-linecap="round"><path d="M-150,-70l-40,-30M-160,-20h-50M150,-80l30,-40"/></g></g>`;
      // B：旁白框，后面爆出大字“叮！”
      const cap = `<rect x="700" y="70" width="420" height="80" fill="${YL}" stroke="${K}" stroke-width="5"/><text x="720" y="124" font-family="'Alimama ShuHeiTi'" font-size="40" fill="${K}">某日，城里……</text>${Array.from({ length: 12 }, (_, i) => `<path d="M1300,165L${f1(1300 + Math.cos(i * TAU / 12) * 700)},${f1(165 + Math.sin(i * TAU / 12) * 700)}" stroke="${K}" stroke-width="3" opacity=".25"/>`).join('')}`;
      // C/D/E：骑行这一排，每格一种镜头（远景城市 / 中景速度线 / 近景砖块）
      let city = ''; for (let i = 0; i < 9; i++) { const x = 40 + i * 70, h = 120 + (i * 37) % 160; city += `<rect x="${x}" y="${YG - 40 - h}" width="60" height="${h}" fill="${[RD, BL, YL][i % 3] === YL ? 'url(#s17dy)' : [RD, BL, YL][i % 3]}" stroke="${K}" stroke-width="5"/>`; }
      const C = `<rect x="40" y="350" width="600" height="410" fill="url(#s17dk)"/>${city}<rect x="40" y="${YG}" width="600" height="30" fill="url(#s17dy)"/>`;
      const Dp = `<rect x="660" y="350" width="580" height="410" fill="${YL}"/>${Array.from({ length: 20 }, (_, i) => `<path d="M660,${370 + i * 20}h${200 + (i * 53) % 380}" stroke="${K}" stroke-width="${2 + (i % 3)}"/>`).join('')}<rect x="660" y="${YG}" width="580" height="30" fill="#fff"/>`;
      const E = `<rect x="1260" y="350" width="620" height="410" fill="url(#s17db)"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${1260 + i * 110}" y="${470 + (i % 2) * 40}" width="100" height="300" fill="${i % 2 ? '#fff' : RD}" stroke="${K}" stroke-width="5"/>`).join('')}<rect x="1260" y="${YG}" width="620" height="30" fill="url(#s17dy)"/><g transform="translate(1340,${YG})"><path d="M0,0V-80" stroke="${K}" stroke-width="8"/><path d="${P(starPts(0, -130, 70, 44, 12), true)}" fill="#fff" stroke="${K}" stroke-width="5"/><text y="-116" text-anchor="middle" font-family="Anton" font-size="38" fill="${BL}">No.17</text></g>`;
      add(root, panel('A', bell, 'url(#s17dr)') + panel('B', cap, '#fff') + panel('C', C, '#fff') + panel('D', Dp, '#fff') + panel('E', E, '#fff'));
      this.lever = q(root, '.pnA .lever'); this.ring = q(root, '.pnA .ring');
      // F：四色复制格（高光时出现）
      this.grid = mk('g', {}, root);
      this.gp = SCH.map((c, i) => { const x = 40 + i * 460; const g = add(this.grid, `<g><rect x="${x}" y="780" width="450" height="260" fill="${['#ff6ac8', '#ffe21a', '#3a8aff', '#3aff8a'][i]}"/><rect x="${x}" y="780" width="450" height="260" fill="url(#s17d${i % 2 ? 'r' : 'b'})" opacity=".3"/><path d="M${x},1000H${x + 450}" stroke="${K}" stroke-width="6"/><g class="pp"></g><rect x="${x}" y="780" width="450" height="260" fill="none" stroke="${K}" stroke-width="8"/></g>`); const pel = popPel(c); q(g, '.pp').appendChild(pel.g); return { g, pel, x }; });
      // 鹈鹕（漫画主角，跨格骑行：画在格子之上）
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s17(); this.pg.appendChild(this.pel.g);
      this.bubble = add(root, `<g><path d="M-170,-70Q-170,-120 -100,-120H110Q170,-120 170,-70V-20Q170,30 110,30H0L-50,80L-46,30H-100Q-170,30 -170,-20Z" fill="#fff" stroke="${K}" stroke-width="6"/><text y="-30" text-anchor="middle" font-family="'Alimama ShuHeiTi'" font-size="46" fill="${RD}">让一让！</text></g>`);
      // 大字拟声词“叮！”（占半个画面）
      this.ding = add(root, `<g><path d="${P(starPts(0, 0, 520, 330, 18), true)}" fill="${YL}" stroke="${K}" stroke-width="12"/><path d="${P(starPts(0, 0, 430, 280, 18, -1.4), true)}" fill="${RD}" opacity=".9"/><text y="110" text-anchor="middle" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="330" fill="#fff" stroke="${K}" stroke-width="16" paint-order="stroke" stroke-linejoin="round" transform="rotate(-8)">叮！</text></g>`);
      // 出口：一格小漫画框
      this.fxp = xAt(6);
      this.frame = add(root, `<g transform="translate(${f1(this.fxp)},${YG + 30})"><path d="M-170,30V-370H170V30H140V-340H-140V30Z" fill="#fff" stroke="${K}" stroke-width="10"/><rect x="-140" y="-340" width="140" height="44" fill="${YL}" stroke="${K}" stroke-width="5"/><text x="-70" y="-308" text-anchor="middle" font-family="Anton" font-size="26" fill="${K}">LATER…</text></g>`);
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g transform="rotate(-6)"><text x="6" y="8" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="104" fill="${RD}" stroke="${K}" stroke-width="7" paint-order="stroke">波普艺术</text><text font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="104" fill="${YL}" stroke="${K}" stroke-width="7" paint-order="stroke">波普艺术</text><text x="440" y="-6" font-family="Anton" font-size="56" fill="${BL}" stroke="${K}" stroke-width="3" paint-order="stroke">POP ART!</text></g>`;
    },
    update(lt) {
      const d = D(lt), x = xAt(lt);
      ride(this.pel, d, { wingRot: -18 * bump(lt - 2.05, .12) });
      at(this.pg, { transform: `translate(${f1(x)},${YG}) scale(${S})` });
      this.lever.setAttribute('transform', `rotate(${f1(-20 * (bump(lt - .4, .1) + bump(lt - 2.0, .1)))},90,10)`);
      op(this.ring, Math.max(bump(lt - .45, .15), bump(lt - 2.05, .2)));
      at(this.bubble, { transform: `translate(${f1(x + 240)},${f1(YG - 330)}) scale(${f2(eob(inv(.6, .8, lt)) * (1 - ss(1.8, 2.0, lt)))})` });
      const dk = eob(inv(2.05, 2.25, lt)) * (1 - ss(2.55, 2.7, lt));
      vis(this.ding, dk > .01); at(this.ding, { transform: `translate(1240,300) scale(${f2(dk * .78)})` });
      const gk = lt > 2.6 && lt < 4.2; vis(this.grid, gk);
      if (gk) this.gp.forEach((p, i) => { const k = eob(inv(2.6 + i * .08, 2.75 + i * .08, lt)); p.pel.update(d / DPR, d, {}); p.g.setAttribute('transform', `translate(${f1(p.x + 225)},910) scale(${f2(k)}) translate(${f1(-p.x - 225)},-910)`); p.pel.g.setAttribute('transform', `translate(${p.x + (i === 3 ? 270 : 180)},1000) scale(${i === 3 ? -.5 : .5},.5)`); });
      vis(this.frame, false);
      at(this.title, { transform: `translate(${f1(700 - inv(1.7, 1.95, lt) * 1400)},250) scale(${f2(eob(inv(.15, .45, lt)))})` });
    },
    portal(lt) { const x = this.fxp; return { d: rectD(x - 140, YG + 30 - 340, 280, 370), box: [x - 140, YG - 310, x + 140, YG + 60], zmax: 10 }; },
    exitFx: OLDSCENES[16].exitFx
  });
})();

/* ---------------- No.18 街头涂鸦：一整面墙就是画面；沿墙横向长镜头平移 ---------------- */
(function () {
  const old = OLDSCENES[17]; old._ld = true;
  remake(17, {
    build(root) {
      bigBg(root, '#2a2430');
      old.build.call(this, root);
      // 让整面墙铺满画面：去掉上方的地下通道，墙一直砌到顶（往上多砌一些：转场时镜头会拉远）
      this.L[0].g.style.display = 'none';
      this.Lw.g.insertAdjacentHTML('afterbegin', `<rect x="-1400" y="-1400" width="7000" height="1620" fill="url(#s18brick)"/><path d="M-1400,214H5600" stroke="#5a3428" stroke-width="10"/>`);
      this.L[this.L.length - 1].g.insertAdjacentHTML('afterbegin', `<rect x="-1400" y="${GY - 10}" width="8000" height="800" fill="#4a4650"/>`);
    },
    update(lt) { old.update.call(this, lt); vis(this.door, false); }
  });
})();

/* ---------------- No.20 赛博朋克：雨夜街道的电影画面；镜头从高空俯冲到街面，鹈鹕从远处驶来，积水倒影占下半 ---------------- */
(function () {
  const CY = '#2be8ff', MG = '#ff2bd6', YL = '#fff12b';
  const V20 = lt => SPEED * (1 - ss(2.5, 2.9, lt) * (1 - ss(3.5, 3.9, lt)));   // 愣了一下：停一拍又一拍（正好一圈）
  const D = makeDist(V20);
  const ZG = 900;
  // 鹈鹕迎面骑来，lt=5.0 时从镜头旁擦身而过；镜头一甩，转为跟在它身后（背影骑向远处）
  const TP = 5.025;
  const Zp = lt => 300 + D(5.0) - D(lt);
  const Zr = lt => Math.max(120, 160 + D(lt) - D(5.1));
  const camAt = lt => { const k = eio(clamp((lt - .3) / 2.4)); return { cx: 960, f: 820, hy: lerp(-900, 430, k), h: lerp(2600, 260, k), x: 0 }; };
  remake(19, {
    build(root) {
      const R = rng(2020);
      bigBg(root, '#0b0718');
      add(root, `<rect x="-1500" y="-1200" width="4920" height="3480" fill="#120a26"/><rect width="1920" height="1080" fill="url(#s20sky)"/>`);
      this.scene = mk('g', {}, root);
      this.geo = mk('g', {}, this.scene);
      // 两侧机械楼立面、霓虹招牌（世界坐标，地面 Y=0），倒影用同一几何的 -Y
      this.items = [];
      for (const side of [-1, 1]) {
        this.items.push({ t: 'quad', X: side * 760, z0: 200, z1: 9000, y0: 0, y1: 3200, fill: '#140c28' });
        for (let k = 0; k < 16; k++) { const z = 400 + k * 520, y = 300 + (k * 173) % 1800, h = 140 + (k % 3) * 80; this.items.push({ t: 'quad', X: side * 755, z0: z, z1: z + 260, y0: y, y1: y + h, fill: [CY, MG, YL, '#8a6aff'][(k + (side > 0 ? 1 : 0)) % 4], glow: 1 }); }
        for (let k = 0; k < 30; k++) { const z = 300 + k * 290; this.items.push({ t: 'quad', X: side * 758, z0: z, z1: z + 150, y0: 100 + (k % 5) * 500, y1: 130 + (k % 5) * 500, fill: '#3a2a5a' }); }
      }
      this.items.push({ t: 'road' });
      const gSolid = mk('g', {}, this.geo), gGlow = mk('g', { filter: 'url(#s20glow)' }, this.geo);
      this.items.forEach(it => { if (it.t !== 'quad') return; it.e = mk('path', { fill: it.fill }, it.glow ? gGlow : gSolid); it.r = mk('path', { fill: it.fill, opacity: it.glow ? .35 : .5 }, it.glow ? gGlow : gSolid); });
      this.road = mk('path', { fill: '#0a0614' }); this.geo.insertBefore(this.road, this.geo.firstChild);
      this.roadR = mk('path', { fill: '#1a1238', opacity: .35 }, this.geo);
      this.lanes = mk('g', {}, this.geo); this.lanes.innerHTML = Array.from({ length: 14 }, () => `<path fill="${CY}" opacity=".5"/>`).join(''); this.le = qa(this.lanes, 'path');
      // 巨型全息广告牌（右侧立面上）
      this.bill = mk('g', {}, this.scene);
      this.bill.innerHTML = `<rect width="1000" height="560" fill="#08040f" stroke="${MG}" stroke-width="10"/><g class="ad"><rect x="10" y="10" width="980" height="540" fill="url(#s20holo)"/><text x="500" y="260" text-anchor="middle" font-family="'Alimama ShuHeiTi'" font-size="140" fill="${MG}">義体 SALE</text><text x="500" y="390" text-anchor="middle" font-family="Orbitron" font-weight="700" font-size="56" fill="${CY}">UPGRADE YOUR BEAK</text></g><g class="live" opacity="0"><rect x="10" y="10" width="980" height="540" fill="#061a24"/><g class="lp"></g><rect x="10" y="10" width="980" height="540" fill="url(#s20scan)"/><circle cx="60" cy="60" r="16" fill="#ff2a2a"/><text x="92" y="74" font-family="Orbitron" font-weight="700" font-size="36" fill="#fff">LIVE · CAM 20</text></g>`;
      this.ad = q(this.bill, '.ad'); this.live = q(this.bill, '.live');
      this.lpel = makePelicanFB({ line: CY, lw: 4, body: '#150c28', wing: '#1c1036', beak: '#241640', pouch: '#2a1848', leg: '#3a2a5a', tire: '#0a0614', frame: CY, bar: CY, fish: MG, rimC: MG, treadC: MG, shade: 'rgba(0,0,0,0)', eyeMk: () => `<path d="M-30,-368H30V-350H-30Z" fill="${MG}"/>` }, 'front');
      q(this.bill, '.lp').appendChild(this.lpel.g);
      // 鹈鹕（正面，霓虹描边、发光护目镜）与倒影
      const pelO = { line: CY, lw: 3.2, body: '#150c28', wing: '#1c1036', beak: '#241640', pouch: '#2a1848', leg: '#3a2a5a', tire: '#0a0614', frame: CY, bar: CY, fish: MG, rimC: MG, treadC: MG, shade: 'rgba(0,0,0,0)', crestC: '#150c28', eyeMk: () => `<path d="M-30,-368H30V-350H-30Z" fill="${MG}"/><rect x="-22" y="-365" width="44" height="10" fill="#ffe0fa"/>`, top: `<g class="ex" opacity="0"><text x="40" y="-420" font-family="Orbitron" font-weight="700" font-size="70" fill="${YL}">!</text></g>` };
      this.rpg = mk('g', { opacity: .4, filter: 'url(#s20rf)' }, this.scene);
      this.rpel = makePelicanFB(pelO, 'front'); this.rpg.appendChild(this.rpel.g);
      this.rpelB = makePelicanFB(Object.assign({}, pelO, { top: '' }), 'back'); this.rpg.appendChild(this.rpelB.g);
      this.pg = mk('g', { filter: 'url(#s20glow)' }, this.scene);
      this.pel = makePelicanFB(pelO, 'front'); this.pg.appendChild(this.pel.g);
      this.pelB = makePelicanFB(Object.assign({}, pelO, { top: '' }), 'back'); this.pg.appendChild(this.pelB.g);
      this.riderIn = this.pel.g; this.riderOut = this.pelB.g;
      this.ex = q(this.pel.g, '.ex');
      // 全息门（出口）
      this.gate = mk('g', { filter: 'url(#s20glow)' }, root);
      this.gate.innerHTML = `<path class="g1" fill="none" stroke="${CY}" stroke-width="7"/><path class="g2" fill="none" stroke="${MG}" stroke-width="3"/><text class="gt" text-anchor="middle" font-family="Orbitron" font-weight="700" font-size="30" letter-spacing="6" fill="${CY}">HOLO-GATE ▶ 21</text>`;
      this.g1 = q(this.gate, '.g1'); this.g2 = q(this.gate, '.g2'); this.gt = q(this.gate, '.gt');
      // 雨（界面层：落在镜头前）
      const hud = hudOf(root);
      this.rain = mk('g', {}, hud); this.rp = [];
      for (let i = 0; i < 150; i++) { add(this.rain, `<path stroke="#9ab8ff" stroke-width="1.6" opacity=".45"/>`); this.rp.push([R(), R(), R()]); }
      this.re = qa(this.rain, 'path');
      add(hud, `<g transform="translate(1700,1000)"><rect x="-90" y="-50" width="180" height="70" fill="#0a0614" stroke="${CY}" stroke-width="4" filter="url(#s20glow)"/><text y="0" text-anchor="middle" font-family="Orbitron" font-weight="700" font-size="38" fill="${CY}">No.20</text></g>`);
      // 甩镜头时的横向拖影
      this.whip = mk('g', { opacity: 0 }, hud);
      this.whip.innerHTML = Array.from({ length: 26 }, (_, i) => `<rect x="-200" y="${f1((i * 41.5) % 1080)}" width="2320" height="${f1(4 + (i * 7) % 18)}" fill="${[CY, MG, '#fff', '#8a6aff'][i % 4]}" opacity="${f2(.2 + (i % 5) * .1)}"/>`).join('');
      this.title = mk('g', { filter: 'url(#s20glow)' }, hud);
      this.title.innerHTML = `<text font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-size="130" fill="none" stroke="${MG}" stroke-width="4">赛博朋克</text><text x="4" y="78" font-family="Orbitron" font-weight="700" font-size="46" letter-spacing="14" fill="${CY}">CYBERPUNK</text>`;
    },
    update(lt) {
      const cam = camAt(Math.min(lt, 6)), d = D(lt), rev = lt >= TP, mx = rev ? -1 : 1, pj = (X, Z, Y) => proj(cam, X * mx, Z, Y);
      // 甩镜头：前半段画面向左甩出，后半段反方向的街道从右边甩进来
      const wk = rev ? 3200 * (1 - eo(inv(TP, 5.16, lt))) : -3200 * ei(inv(4.89, TP, lt));
      this.scene.setAttribute('transform', `translate(${f1(wk)},0)`);
      op(this.whip, bump(lt - TP, .07));
      const quad = (it, mir) => { const s = mir ? -1 : 1; const a = pj(it.X, it.z0, it.y0 * s), b = pj(it.X, it.z1, it.y0 * s), c = pj(it.X, it.z1, it.y1 * s), e = pj(it.X, it.z0, it.y1 * s); return P([a, b, c, e], true); };
      this.items.forEach(it => { if (it.e) { it.e.setAttribute('d', quad(it)); it.r.setAttribute('d', quad(it, true)); } });
      const ra = pj(-760, 200), rb = pj(760, 200), rc = pj(760, 9000), rd = pj(-760, 9000);
      this.road.setAttribute('d', P([ra, rb, rc, rd], true));
      this.roadR.setAttribute('d', P([ra, rb, rc, rd], true));
      this.le.forEach((e, i) => { const z = 300 + i * 600; const a = pj(-10, z), b = pj(10, z), c = pj(10, z + 260), dd = pj(-10, z + 260); e.setAttribute('d', P([a, b, c, dd], true)); });
      // 广告牌（贴在右侧立面）：用三个角点做仿射
      const p0 = pj(-750, 3600, 2250), p1 = pj(750, 3600, 2250), p2 = pj(-750, 3600, 1410);
      const W = 1000, H = 560, m = [(p1[0] - p0[0]) / W, (p1[1] - p0[1]) / W, (p2[0] - p0[0]) / H, (p2[1] - p0[1]) / H, p0[0], p0[1]];
      this.bill.setAttribute('transform', `matrix(${m.map(v => v.toFixed(4)).join(',')})`);
      const lv = lt > 2.25 && lt < 4.4;
      vis(this.bill, !rev);
      op(this.ad, lv ? (lt < 2.4 ? Math.floor(lt * 30) % 2 : 0) : 1); op(this.live, lv ? 1 : 0);
      // 鹈鹕从远处驶来，抬头看见自己，愣了一下
      const z = rev ? Zr(lt) : Math.max(120, Zp(lt)), pp = pj(0, z), look = ss(2.55, 2.75, lt) * (1 - ss(3.55, 3.75, lt));
      vis(this.pel.g, !rev); vis(this.rpel.g, !rev); vis(this.pelB.g, rev); vis(this.rpelB.g, rev);
      this.pel.update(d / DPR, d, { lookUp: look }); this.pelB.update(d / DPR, d, {});
      at(this.pg, { transform: `translate(${f1(pp[0])},${f1(pp[1])}) scale(${f2(pp[2])})` });
      this.rpel.update(d / DPR, d, { lookUp: look }); this.rpelB.update(d / DPR, d, {});
      at(this.rpg, { transform: `translate(${f1(pp[0])},${f1(pp[1])}) scale(${f2(pp[2])},${f2(-pp[2])})` });
      op(this.ex, ss(2.7, 2.8, lt) * (1 - ss(3.5, 3.6, lt)));
      if (lv) { this.lpel.update(d / DPR, d, { lookUp: look }); this.lpel.g.setAttribute('transform', 'translate(500,540) scale(1.15)'); }
      const g0 = pj(-430, ZG), g1 = pj(430, ZG, 760);
      this.g1.setAttribute('d', rectD(g0[0], g1[1], g1[0] - g0[0], g0[1] - g1[1])); this.g2.setAttribute('d', rectD(g0[0] - 16, g1[1] - 16, g1[0] - g0[0] + 32, g0[1] - g1[1] + 16));
      at(this.gt, { x: 960, y: f1(g1[1] - 30) });
      vis(this.gate, false);
      this.re.forEach((e, i) => { const p = this.rp[i], k = fr(lt * (1.6 + p[2]) + p[1]); e.setAttribute('d', `M${f1(p[0] * 2200 - k * 200)},${f1(-60 + k * 1200)}l-10,46`); });
      op(this.title, ss(.4, .7, lt) * (Math.floor(lt * 14) % 7 ? 1 : .4) * (1 - ss(1.8, 2.0, lt)));
      this.title.setAttribute('transform', 'translate(130,230)');
    },
    portal(lt) { const cam = camAt(6), g0 = proj(cam, -430, ZG), g1 = proj(cam, 430, ZG, 760); return { d: rectD(g0[0], g1[1], g1[0] - g0[0], g0[1] - g1[1]), box: [g0[0], g1[1], g1[0], g0[1]], late: true, zmax: 5 }; },
    exitFx: OLDSCENES[19].exitFx
  });
})();

/* ---------------- No.21 蒸汽波：复古电脑桌面，几个窗口叠放；鹈鹕在其中一个窗口里朝消失点骑行 ---------------- */
(function () {
  const PK = '#ff71ce', PU = '#b967ff', CY = '#01cdfe', MT = '#05ffa1';
  const D = makeDist(CRUISE);
  const WIN = [380, 120, 1160, 760];                      // 主窗口（含标题栏）
  const warp = lt => lt >= 2.5 && lt < 3.5 ? 2.5 + ((lt - 2.5) % .25) : lt;
  const winT = (x, y, w, h, title) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#c0c0c0" stroke="#fff" stroke-width="3"/><path d="M${x + w},${y}V${y + h}H${x}" stroke="#404040" stroke-width="3" fill="none"/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="32" fill="url(#s21tb)"/><text x="${x + 16}" y="${y + 29}" font-family="Arial" font-weight="700" font-size="19" fill="#fff">${title}</text>${['_', '□', '×'].map((t, i) => `<rect x="${x + w - 96 + i * 30}" y="${y + 9}" width="26" height="24" fill="#c0c0c0" stroke="#fff" stroke-width="2"/><text x="${x + w - 83 + i * 30}" y="${y + 27}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="16">${t}</text>`).join('')}`;
  remake(20, {
    build(root) {
      const R = rng(2121);
      bigBg(root, '#2f7a7a');
      // 桌面
      add(root, `<rect width="1920" height="1080" fill="#3a8a8a"/><rect width="1920" height="1080" fill="url(#n21desk)"/>` +
        ['我的电脑', 'ＰＥＬＩＣＡＮ', '回收站', 'ｎｏ．２１'].map((n, i) => `<g transform="translate(90,${110 + i * 140})"><rect x="-30" y="-40" width="60" height="50" fill="${['#c0c0c0', '#ffd36a', '#c0c0c0', PK][i]}" stroke="#000" stroke-width="2"/><text y="40" text-anchor="middle" font-family="'MS PMincho',Arial" font-size="18" fill="#fff">${n}</text></g>`).join('') +
        `<rect y="1032" width="1920" height="48" fill="#c0c0c0"/><path d="M0,1032H1920" stroke="#fff" stroke-width="3"/><rect x="8" y="1038" width="120" height="36" fill="#c0c0c0" stroke="#fff" stroke-width="2"/><text x="68" y="1064" text-anchor="middle" font-family="Arial" font-weight="700" font-size="20">▶ 开始</text><text class="clk" x="1880" y="1064" text-anchor="end" font-family="Arial" font-size="20">午後 ３:３３</text>`);
      def(`<pattern id="n21desk" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#2f7a7a"/><path d="M0,0L80,80M80,0L0,80" stroke="${PK}" stroke-width="1" opacity=".25"/></pattern><clipPath id="n21wc"><rect x="${WIN[0] + 8}" y="${WIN[1] + 42}" width="${WIN[2] - 16}" height="${WIN[3] - 50}"/></clipPath>`);
      // 主窗口：透视网格、夕阳、棕榈，鹈鹕背影朝消失点骑
      add(root, winT(WIN[0], WIN[1], WIN[2], WIN[3], 'Ｃ：＼ＶＡＰＯＲ＼ＲＩＤＥ．ＥＸＥ'));
      this.view = mk('g', { 'clip-path': 'url(#n21wc)' }, root);
      const vx = WIN[0] + WIN[2] / 2, hz = WIN[1] + 420;
      this.vx = vx; this.hz = hz;
      add(this.view, `<rect x="${WIN[0]}" y="${WIN[1]}" width="${WIN[2]}" height="${WIN[3]}" fill="url(#s21sky)"/><circle cx="${vx}" cy="${hz - 40}" r="220" fill="url(#s21sun)" clip-path="url(#s21sunc)" transform="translate(${vx - 960},${hz - 40 - 440})"/><rect x="${WIN[0]}" y="${hz}" width="${WIN[2]}" height="${WIN[3]}" fill="#1a0838"/>`);
      this.grid = mk('g', {}, this.view);
      this.grid.innerHTML = Array.from({ length: 25 }, (_, i) => `<path d="M${vx},${hz}L${vx + (i - 12) * 260},${hz + 900}" stroke="${PK}" stroke-width="2.5"/>`).join('') + `<g class="hz">${Array.from({ length: 12 }, () => `<path stroke="${PK}" stroke-width="2.5"/>`).join('')}</g><path d="M${WIN[0]},${hz}H${WIN[0] + WIN[2]}" stroke="${CY}" stroke-width="4"/>`;
      this.hzl = qa(this.grid, '.hz path');
      this.palms = []; const pg2 = mk('g', {}, this.view);
      for (let i = 0; i < 12; i++) { const side = i % 2 ? 1 : -1; const e = add(pg2, `<g><path d="M-8,0L4,-260L14,-260L8,0Z" fill="#3a1a5a"/>${Array.from({ length: 7 }, (_, j) => { const a = -PI + j * PI / 6 - .1; return `<path d="M11,-260L${f1(11 + Math.cos(a) * 150)},${f1(-200 + Math.sin(a) * 60)}L${f1(11 + Math.cos(a + .25) * 90)},${f1(-240 + Math.sin(a + .25) * 40)}Z" fill="${j % 2 ? MT : '#0aa88a'}"/>`; }).join('')}</g>`); this.palms.push({ e, side, z0: i * 400 }); }
      this.pg = mk('g', {}, this.view);
      this.pel = makePelicanFB({ line: '#7a5a8a', lw: 2.4, body: 'url(#s21mb)', wing: 'url(#s21mb2)', beak: '#f4e4ec', leg: '#f0e0ec', tire: CY, frame: CY, bar: CY, crestC: '#f4eef4', treadC: PK, saddle: PU }, 'back');
      this.pg.appendChild(this.pel.g);
      // 陆续弹出的其他窗口
      this.pops = [];
      const pop = (t, x, y, w, h, title, inner) => { const g = add(root, `<g>${winT(x, y, w, h, title)}${inner}</g>`); this.pops.push({ g, t, cx: x + w / 2, cy: y + h / 2 }); return g; };
      pop(.4, 60, 640, 330, 220, 'ＭＵＳＩＣ．ＷＡＶ', `<text x="225" y="760" text-anchor="middle" font-family="'Courier Prime'" font-size="32">▶ 01:29</text><rect x="80" y="790" width="290" height="16" fill="#fff" stroke="#808080"/><rect class="mb" x="82" y="792" width="120" height="12" fill="#000080"/>`);
      this.bustW = pop(1.0, 1440, 160, 420, 470, 'ＢＵＳＴ．ＢＭＰ', `<rect x="1450" y="200" width="400" height="420" fill="#008080"/>`);
      this.bust = add(this.bustW, `<g transform="translate(1650,610) scale(.75)"><path d="M-170,0C-170,-80 -110,-120 -60,-130L60,-130C110,-120 170,-80 170,0Z" fill="url(#s21mb)" stroke="#9a8aa8" stroke-width="2"/><g class="bh"><path d="M-40,-130V-170H40V-130Z" fill="url(#s21mb)"/><path d="M-70,-200C-80,-280 -40,-330 10,-330C70,-330 90,-280 80,-220C78,-200 90,-190 96,-176L76,-170C74,-150 60,-140 30,-142L10,-150L-20,-140C-50,-150 -66,-170 -70,-200Z" fill="url(#s21mb)" stroke="#9a8aa8" stroke-width="2"/><rect x="18" y="-262" width="54" height="16" fill="#111"/></g></g>`);
      this.bh = q(this.bust, '.bh');
      pop(1.6, 1480, 680, 380, 300, 'ＰＡＬＭ．ＪＰＧ', `<rect x="1490" y="722" width="360" height="248" fill="${PK}"/><text x="1670" y="860" text-anchor="middle" font-family="'MS PMincho'" font-size="44" fill="#fff">ペリカン</text>`);
      pop(.8, 70, 120, 280, 160, 'ＴＩＴＬＥ．ＴＸＴ', `<text x="210" y="220" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="700" font-size="40" fill="${PU}">蒸汽波</text><text x="210" y="262" text-anchor="middle" font-family="'Times New Roman'" font-style="italic" font-size="24" fill="#008080">Ｖａｐｏｒｗａｖｅ</text>`);
      this.mb = q(root, '.mb');
      this.skip = add(root, `<g opacity="0"><rect width="1920" height="10" fill="#fff" opacity=".8"/><rect width="1920" height="1080" fill="${CY}" opacity=".08"/></g>`);
      // 出口：复古系统窗口
      this.dlg = add(root, `<g>${winT(760, 300, 400, 300, 'ＳＹＳＴＥＭ')}<rect x="770" y="342" width="380" height="250" fill="#fff"/></g>`);
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g>${winT(560, 400, 800, 230, 'ＶＡＰＯＲＷＡＶＥ．ＴＸＴ')}<text x="960" y="535" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="700" font-size="86" letter-spacing="40" fill="${PU}" stroke="#fff" stroke-width="3" paint-order="stroke">蒸汽波</text><text x="960" y="600" text-anchor="middle" font-family="'Times New Roman'" font-style="italic" font-size="40" letter-spacing="12" fill="#008080">Ｖａｐｏｒｗａｖｅ</text></g>`;
    },
    update(lt) {
      // 强拍后（下一次转场）窗口卡住：画面停在那一帧，只有鹈鹕还在蹬
      const le = lt > 6 ? 6 : warp(lt), d = D(le), vx = this.vx, hz = this.hz;
      // 网格朝镜头流动（不打滑：横线间距对应前进距离）
      const zs = 160;
      this.hzl.forEach((h, j) => { const Z = (j + 1) * zs - (d % zs) + 60; const y = hz + 420 * 140 / Z; h.setAttribute('d', `M${WIN[0]},${f1(y)}H${WIN[0] + WIN[2]}`); });
      this.palms.forEach(p => { const Z = ((p.z0 - d * 2.2) % 4800 + 4800) % 4800 + 200, s = 420 / Z; at(p.e, { transform: `translate(${f1(vx + p.side * (270 * s + 30))},${f1(hz + 420 * 140 / Z * .99)}) scale(${f2(s * 1.1)})` }); });
      const dr = D(lt);
      this.pel.update(dr / DPR, dr, {});
      at(this.pg, { transform: `translate(${vx},${WIN[1] + WIN[3] - 40}) scale(.9)` });
      const jq = Math.floor(lt * 12), jam = lt > 6 ? ss(6, 6.08, lt) : 0;
      this.pops.forEach((p, i) => { const k = eob(inv(p.t, p.t + .25, lt)), jx = jam * (hash(jq * 3 + i) - .5) * 90, jy = jam * (hash(jq * 5 + i) - .5) * 50; at(p.g, { transform: `translate(${f1(jx)},${f1(jy)}) translate(${f1(p.cx)},${f1(p.cy)}) scale(${f2(k)}) translate(${f1(-p.cx)},${f1(-p.cy)})` }); });
      const nod = lt >= 2.5 && lt < 3.5 ? Math.sin(((lt - 2.5) % .25) / .25 * PI) * 14 : Math.sin(le * TAU) * 3;
      this.bh.setAttribute('transform', `rotate(${f1(nod)},0,-150)`);
      at(this.mb, { width: f1(60 + 220 * fr(le / 6)) });
      op(this.skip, lt >= 2.5 && lt < 3.5 && ((lt - 2.5) % .25) < .03 ? 1 : 0);
      vis(this.dlg, false);
      op(this.title, eob(inv(.15, .4, lt)) * (1 - ss(1.7, 2.0, lt)));
    },
    portal(lt) { return { d: rectD(770, 342, 380, 250), box: [770, 342, 1150, 592], late: true, zmax: 7 }; },
    exitFx: OLDSCENES[20].exitFx
  });
})();

/* ---------------- No.22 故障艺术：一个出错的视频播放画面；画面不断撕裂、卡顿，鹈鹕在碎片之间跳帧前进 ---------------- */
(function () {
  const old = OLDSCENES[21]; old._ld = true;
  const D = makeDist(CRUISE);
  const S = 0.62, YG = 860;
  // 跳帧：位置只在“到帧”时更新，偶尔整段卡住
  const jt = lt => { const q = Math.floor(lt * 8); const h = hash(q * 1.7); return h < .35 ? Math.floor(lt * 3) / 3 : q / 8; };
  const xAt = lt => 380 + (D(jt(lt)) - D(-2.1)) * S * .55;
  remake(21, {
    build(root) {
      bigBg(root, '#08080c');
      old.build.call(this, root);
      // 播放器外壳：标题栏、进度条、时间码、缓冲
      this.chrome = add(root, `<g><path d="M0,0H1920V1080H0Z M60,80V900H1860V80Z" fill="#141418" fill-rule="evenodd"/><text x="70" y="56" font-family="'JetBrains Mono'" font-size="26" fill="#cfd2dc">▶ PELICAN_FINAL_v22.mp4 — 解码错误</text>
        <rect x="60" y="930" width="1800" height="10" rx="5" fill="#3a3a44"/><rect class="pb" x="60" y="930" width="900" height="10" rx="5" fill="#ff2b4a"/><circle class="kn" cx="960" cy="935" r="14" fill="#fff"/><rect x="60" y="930" width="1300" height="10" rx="5" fill="#fff" opacity=".18"/>
        <text x="70" y="1006" font-family="'JetBrains Mono'" font-size="34" fill="#fff">⏸</text><text class="tc" x="140" y="1004" font-family="'JetBrains Mono'" font-size="28" fill="#cfd2dc">02:08 / ??:??</text><text x="760" y="1004" font-family="'JetBrains Mono'" font-size="26" fill="#00ffd0">[ 里程 No.22 ]</text><text x="1850" y="1004" text-anchor="end" font-family="'JetBrains Mono'" font-size="24" fill="#ff2b4a">● 缓冲中 · 帧丢失 37%</text>
        <g class="spin" transform="translate(1660,180)">${Array.from({ length: 8 }, (_, i) => `<circle cx="${f1(Math.cos(i * PI / 4) * 30)}" cy="${f1(Math.sin(i * PI / 4) * 30)}" r="6" fill="#fff" opacity="${f2(.15 + i * .1)}"/>`).join('')}</g></g>`);
      this.pb = q(this.chrome, '.pb'); this.kn = q(this.chrome, '.kn'); this.tc = q(this.chrome, '.tc'); this.spin = q(this.chrome, '.spin');
      this.fxe = xAt(6);
      this.exitBox.innerHTML = this.exitBox.innerHTML;
    },
    update(lt) {
      const jl = jt(lt), freeze = lt > 2.6 && lt < 3.0, le = freeze ? 2.6 : jl, d = D(le), x = xAt(freeze ? 2.6 : lt);
      const camS = (x - 380);                                     // 地面随鹈鹕前进滚动
      scrollL(this.L, d * S - camS);
      const q0 = Math.floor(lt * 15);
      this.spe.forEach((e, i) => e.setAttribute('transform', `translate(${f1((hash(q0 * 3 + i) - .5) * 300 * (freeze ? 0 : 1))},0)`));
      this.be.forEach((e, i) => { const p = this.bp[i], on = hash(q0 + i * 17) < .3; at(e, { x: Math.floor(p[0] * 58) * 32 + 60, y: Math.floor(p[1] * 25) * 32 + 80, fill: ['#ff2bd6', '#00ffd0', '#fff12b', '#2060ff', '#111'][Math.floor(hash(q0 * 2 + i) * 5)], opacity: on ? .75 : 0 }); });
      this.pel.update(le);
      at(this.pg, { transform: `translate(${f1(x)},${YG}) scale(${S})` });
      const gk = ss(2.0, 2.2, lt) * (1 - ss(3.8, 4.0, lt));
      this.gh.forEach((p, i) => { p.update(le - (i + 1) * .12); at(p.g, { transform: `translate(${f1(x - (i + 1) * 60 * gk)},${YG}) scale(${S})`, opacity: f2(gk * (.55 - i * .1)) }); });
      vis(this.err, lt > 2.6 && lt < 4.2);
      const ex = 380 + (D(2.6) - D(-2.1)) * S * .55 + 30 - (lt > 3.0 ? (lt - 3.0) * 160 : 0);
      at(this.err, { transform: `translate(${f1(ex)},${YG - 50}) scale(${f2(eob(inv(2.6, 2.75, lt)) * .85)})`, opacity: f2(1 - ss(4.0, 4.2, lt)) });
      this.t3.forEach((t, i) => t.setAttribute('transform', `translate(${f1(130 + (hash(q0 + i) - .5) * 24)},${f1(230 + (i - 1) * 4)})`));
      op(this.title, ss(.15, .3, lt) * (1 - ss(1.7, 1.9, lt)) * (hash(q0 * 9) < .1 ? .3 : 1));
      vis(this.exitBox, false);
      at(this.exitBox, { transform: `translate(${f1(this.fxe)},${YG + 30}) scale(.8)` });
      // 播放器：进度条和时间码乱跳
      const pr = .52 + .1 * jl / 6 + (hash(q0) < .1 ? (hash(q0 * 5) - .5) * .2 : 0);
      at(this.pb, { width: f1(1800 * pr) }); at(this.kn, { cx: f1(60 + 1800 * pr) });
      this.tc.textContent = `02:${String(Math.floor(8 + jl)).padStart(2, '0')}.${String(Math.floor(fr(jl) * 100)).padStart(2, '0')} / ${hash(q0) < .3 ? 'NaN' : '??:??'}`;
      this.spin.setAttribute('transform', `translate(1660,180) rotate(${Math.floor(lt * 8) * 45})`);
    },
    exit(u, X) {
      const x = this.fxe, d = rectD(x - 240, YG + 30 - 480, 480, 480);
      if (u < 0) { X.clipD(d); return; }
      X.clipD('M0,0Z'); if (u > .5) { X.none(); X.hideA(); }
    },
    exitFx: old.exitFx
  });
})();
