'use strict';
/* ---------------- No.03 奇幻冒险：金框风景横幅；高处俯瞰 → 崖边起飞 → 侧后方跟随 ---------------- */
function goldCorner(x, y, sx, sy) {
  return `<g transform="translate(${x},${y}) scale(${sx},${sy})" fill="none" stroke="url(#s03gold)" stroke-width="5" stroke-linecap="round"><path d="M0,90V0H90"/><path d="M16,120C16,60 30,30 60,22C80,16 96,30 90,44C84,58 66,56 64,44" stroke-width="4"/><path d="M120,16C60,16 34,30 26,58C20,78 34,92 46,88C58,84 58,68 46,66" stroke-width="4"/><rect x="-11" y="-11" width="22" height="22" transform="rotate(45)" fill="#e8473c" stroke="#7a4a10" stroke-width="2.5"/></g>`;
}
(function () {
  const OL = '#3b2a1e', GOLD = '#e9b949';
  // 滑翔一直持续到第 3 小节末：强拍上落地（踏板停四圈，落地后接着蹬）
  const V3 = lt => SPEED * (1 + 1.5 * ss(2.0, 2.4, lt) * (1 - ss(4.9, 5.8, lt)));
  const D = makeDist(V3);
  const tau3 = lt => lt < 2.0 ? lt : lt < 6.0 ? 2.0 : lt - 4;
  // 镜头在第 3 小节停下（不再跟随），鹈鹕滑向远处落地
  const Dc = makeDist(lt => V3(lt) * (1 - ss(4.3, 5.3, lt)));
  const HEND = 560;
  // 俯瞰地图上的蜿蜒小路（地图坐标），终点是崖边
  const PATH = [[260, 1080], [300, 990], [420, 930], [380, 850], [500, 790], [640, 800], [720, 730], [860, 690], [930, 640], [1000, 650], [1060, 600], [1120, 585], [1180, 545], [1222, 510]];
  const MS = 0.2;                                   // 俯瞰时鹈鹕的大小
  let PL = null;
  function pathAt(s) {   // 按弧长取点
    if (!PL) { PL = [0]; for (let i = 1; i < PATH.length; i++) PL.push(PL[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1])); }
    s = clamp(s, 0, PL[PL.length - 1]);
    let i = 1; while (i < PL.length - 1 && PL[i] < s) i++;
    const k = (s - PL[i - 1]) / (PL[i] - PL[i - 1]), a = PATH[i - 1], b = PATH[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  const CAM = { cx: 960, hy: 330, f: 900, x: 0 };
  const ZP = 900;
  remake(2, {
    build(root) {
      const R = rng(3303);
      // ===== 镜头一：高处俯瞰的风景横幅 =====
      this.aer = mk('g', {}, root);
      this.map = mk('g', {}, this.aer);
      let m = `<rect x="-200" y="-200" width="2400" height="1500" fill="#7cc95a"/>`;
      m += `<rect x="-200" y="-200" width="2400" height="380" fill="url(#s03sky)"/>`;
      for (let i = 0; i < 12; i++) { const x = -150 + i * 200, h = 70 + R() * 60; m += `<path d="M${x - 140},180L${x},${180 - h}L${x + 140},180Z" fill="#9cb4e2"/><path d="M${x - 34},${180 - h * .76}L${x},${180 - h}L${x + 34},${180 - h * .76}Z" fill="#fff"/>`; }
      // 田野拼块（俯视的色块）
      const fc = ['#8fd16a', '#a6d96f', '#74bf55', '#c9df7a', '#9ccf62', '#6cb64c'];
      for (let j = 0; j < 9; j++) for (let i = 0; i < 12; i++) { const x = -120 + i * 120 + (j % 2) * 50, y = 180 + j * 100; if (x > 1150 + (y - 300) * .25) continue; m += `<path d="M${x},${y}L${x + 118 + R() * 14},${y + R() * 10}L${x + 120},${y + 98}L${x - 6},${y + 100}Z" fill="${fc[Math.floor(R() * 6)]}" stroke="#5a9a3a" stroke-width="1.5"/>`; }
      // 崖下的山谷与湖
      m += `<path d="M1180,180C1210,320 1190,420 1240,520C1270,640 1250,780 1320,900L1350,1300H2300V180Z" fill="#5aa84a"/>`;
      m += `<path d="M1330,430C1480,380 1700,420 1800,520C1900,640 1820,820 1620,860C1460,890 1360,780 1350,660Z" fill="#4fb3e8" stroke="${OL}" stroke-width="3"/>`;
      for (let i = 0; i < 8; i++) m += `<path d="M${1420 + R() * 300},${520 + R() * 260}h${30 + R() * 40}" stroke="#d8f4ff" stroke-width="3" stroke-linecap="round"/>`;
      m += `<path d="M1180,180C1210,320 1190,420 1240,520C1270,640 1250,780 1320,900L1350,1300" fill="none" stroke="#8a7464" stroke-width="16"/><path d="M1180,180C1210,320 1190,420 1240,520C1270,640 1250,780 1320,900L1350,1300" fill="none" stroke="${OL}" stroke-width="3"/>`;
      // 森林（俯视的圆团）
      for (let i = 0; i < 90; i++) { const x = R() * 1150, y = 200 + R() * 880; if (Math.abs(y - 700) < 40 && x > 400) continue; m += `<circle cx="${f1(x + 3)}" cy="${f1(y + 4)}" r="${f1(10 + R() * 8)}" fill="#3f8a34"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(9 + R() * 7)}" fill="#5bb048"/>`; }
      // 蜿蜒小路
      m += `<path d="${smooth(PATH)}" fill="none" stroke="#c99a63" stroke-width="22" stroke-linecap="round"/><path d="${smooth(PATH)}" fill="none" stroke="#e8c890" stroke-width="13" stroke-linecap="round"/>`;
      // 远处城堡
      m += `<g transform="translate(1620,250) scale(.5)">${[[-90, 120, 40, '#3d6fd1'], [90, 110, 40, '#3d6fd1'], [0, 170, 54, '#2f5ab8']].map(t => `<rect x="${t[0] - t[2] / 2}" y="${-t[1]}" width="${t[2]}" height="${t[1]}" fill="#f3ead2" stroke="${OL}" stroke-width="3"/><path d="M${t[0] - t[2] / 2 - 6},${-t[1]}L${t[0]},${-t[1] - t[2] * 1.4}L${t[0] + t[2] / 2 + 6},${-t[1]}Z" fill="${t[3]}" stroke="${OL}" stroke-width="3"/>`).join('')}<rect x="-90" y="-80" width="180" height="80" fill="#f3ead2" stroke="${OL}" stroke-width="3"/></g>`;
      m += `<g transform="translate(560,980)"><path d="M0,0V-36" stroke="${OL}" stroke-width="5"/><rect x="-36" y="-64" width="72" height="30" fill="#c8894a" stroke="${OL}" stroke-width="2.5"/><text y="-42" text-anchor="middle" font-family="'Uncial Antiqua'" font-size="20" fill="${OL}">No.03</text></g>`;
      this.map.innerHTML = m;
      this.mpg = mk('g', {}, this.map);
      this.mpel = PELICANS.s03(); this.mpg.appendChild(this.mpel.g);
      // ===== 镜头二：侧后方跟随（透视地面） =====
      this.rear = mk('g', {}, root);
      add(this.rear, `<rect width="1920" height="1080" fill="url(#s03sky)"/>`);
      let clouds = ''; for (let i = 0; i < 7; i++) { const x = R() * 1920, y = 80 + R() * 160, s = .6 + R() * .7; clouds += `<g transform="translate(${f1(x)},${f1(y)}) scale(${f2(s)})"><circle r="50" fill="#fff"/><circle cx="55" cy="-20" r="60" fill="#fff"/><circle cx="115" r="46" fill="#fff"/><path d="M-50,0H160V30H-50Z" fill="#fff"/></g>`; }
      this.clouds = add(this.rear, `<g>${clouds}</g>`);
      let mts = ''; for (let i = 0; i < 14; i++) { const x = -200 + i * 170 + R() * 40, h = 60 + R() * 70; mts += `<path d="M${x - 150},330L${x},${330 - h}L${x + 150},330Z" fill="#a4bdea"/>`; }
      add(this.rear, mts);
      this.strips = mk('g', {}, this.rear);
      this.NS = 40; let st = ''; for (let i = 0; i < this.NS; i++) st += `<rect x="-10" width="1940"/>`; this.strips.innerHTML = st; this.se = qa(this.strips, 'rect');
      this.road = mk('path', { fill: '#e2c08a', stroke: OL, 'stroke-width': 3 }, this.rear);
      this.dashes = mk('g', {}, this.rear); this.dashes.innerHTML = Array.from({ length: 16 }, () => `<path fill="#c99a63"/>`).join(''); this.de = qa(this.dashes, 'path');
      // 地面上的树和石头（世界坐标）
      this.props = [];
      const pg = mk('g', {}, this.rear);
      for (let i = 0; i < 70; i++) { let X = (R() - .5) * 5200; if (Math.abs(X) < 380) X += Math.sign(X || 1) * 400; const Zw = 300 + R() * 6200, kind = R() < .75 ? 0 : 1; this.props.push({ X, Zw, kind }); }
      this.props.sort((a, b) => b.Zw - a.Zw);
      this.props.forEach(p => { p.e = add(pg, p.kind === 0 ? `<g><path d="M0,0V-60" stroke="${OL}" stroke-width="12"/><circle cy="-110" r="64" fill="#4ea64a" stroke="${OL}" stroke-width="5"/><circle cx="-18" cy="-128" r="26" fill="#6cc05a"/></g>` : `<g><ellipse cy="-14" rx="40" ry="24" fill="#a89a8a" stroke="${OL}" stroke-width="4"/></g>`); });
      // 城堡与城门（出口画框）
      this.castle = mk('g', {}, this.rear);
      const tower = (x, w, h, c) => `<rect x="${x - w / 2}" y="${-h}" width="${w}" height="${h}" fill="#efe2c4" stroke="${OL}" stroke-width="5"/><path d="M${x - w / 2 - 14},${-h}L${x},${-h - w * 1.4}L${x + w / 2 + 14},${-h}Z" fill="${c}" stroke="${OL}" stroke-width="5" stroke-linejoin="round"/><path d="M${x},${-h - w * 1.4}v-50l40,14l-40,14" fill="#e8473c" stroke="${OL}" stroke-width="3"/>`;
      this.castle.innerHTML = `<g transform="translate(0,-60) scale(.62)">${tower(-760, 200, 1100, '#2f5ab8')}${tower(760, 200, 1100, '#2f5ab8')}${tower(0, 300, 1500, '#3d6fd1')}</g>
        <path d="M-900,0V-600H900V0Z" fill="#efe2c4" stroke="${OL}" stroke-width="5"/>${Array.from({ length: 18 }, (_, i) => `<rect x="${-900 + i * 100}" y="-640" width="60" height="40" fill="#efe2c4" stroke="${OL}" stroke-width="4"/>`).join('')}
        ${tower(-420, 160, 820, '#3d6fd1')}${tower(420, 160, 820, '#3d6fd1')}
        <path d="M-330,0V-260A330,330 0 0 1 330,-260V0H280V-260A280,280 0 0 0 -280,-260V0Z" fill="#efe2c4" stroke="${OL}" stroke-width="5"/><path d="M-280,-260A280,280 0 0 1 280,-260" fill="none" stroke="url(#s03gold)" stroke-width="16"/>
        <path d="M-140,-620H140L120,-570H-120Z" fill="#2c4a9a" stroke="${OL}" stroke-width="4"/><text y="-582" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="34" fill="#ffe68a">晨风城</text>`;
      this.rpg = mk('g', {}, this.rear);
      this.rpel = makePelicanFB({ line: OL, lw: 3.5, body: '#ffffff', wing: '#f1f5fb', beak: '#ffa630', leg: '#ff9a2e', tire: '#4a3326', frame: '#3d6fd1', bar: OL, crestC: '#fff', treadC: '#d9a84a',
        upExtra: `<path d="M-46,-288C-70,-250 -80,-200 -66,-160L66,-160C80,-200 70,-250 46,-288Z" fill="#e8473c" stroke="${OL}" stroke-width="3.5"/><path d="M-36,-270C-50,-240 -56,-205 -48,-176" stroke="#b8302a" stroke-width="6" fill="none"/><path d="M-28,-292C-10,-300 10,-300 28,-292L22,-280C8,-286 -8,-286 -22,-280Z" fill="${GOLD}" stroke="${OL}" stroke-width="3"/>`,
        top: `<g class="gld"><path d="M-30,-470L-70,-286M30,-470L70,-286M-70,-286H70" stroke="${OL}" stroke-width="5" fill="none"/><path d="M-430,-440Q0,-560 430,-440Q0,-500 -430,-440Z" fill="#ffd34a" stroke="${OL}" stroke-width="6" stroke-linejoin="round"/><path d="M-230,-470Q0,-540 230,-470Q0,-500 -230,-470Z" fill="#e8473c"/><path d="M-430,-440Q0,-560 430,-440" fill="none" stroke="${OL}" stroke-width="6"/></g>` }, 'back');
      this.gld = q(this.rpel.g, '.gld');
      this.riderIn = this.mpel.g; this.riderOut = this.rpel.g;
      this.rpg.appendChild(this.rpel.g);
      // 金色通栏字幕
      def(`<clipPath id="n03bandc"><rect class="bc" x="960" y="930" width="0" height="120"/></clipPath>`);
      const hud = hudOf(root);
      this.band = mk('g', { 'clip-path': 'url(#n03bandc)' }, hud);
      this.band.innerHTML = `<rect x="0" y="948" width="1920" height="84" fill="url(#s03band)"/><path d="M0,948H1920M0,1032H1920" stroke="#7a4a10" stroke-width="4"/><text x="960" y="1004" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="42" letter-spacing="6" fill="#4a2c10">✦ 第三章 · 乘风越过晨风之湖 ✦</text><text x="960" y="1024" text-anchor="middle" font-family="'Trajan Pro 3'" font-size="12" letter-spacing="8" fill="#7a4a10">CHAPTER III · OVER THE LAKE OF MORNING WIND</text>`;
      this.bc = q(DEFS, '#n03bandc .bc');
      // 金色雕花边框（横幅的边）与元素徽章
      const ELEM = [`<path d="M0,-16C8,-6 12,0 10,7C8,14 -8,14 -10,7C-12,0 -6,-4 -4,-10C-2,-4 2,-2 2,-6C2,-10 0,-12 0,-16Z" fill="#ff5a2a" stroke="#7a1e0a" stroke-width="1.5"/>`, `<path d="M0,-15C6,-6 11,0 11,6A11,11 0 0 1 -11,6C-11,0 -6,-6 0,-15Z" fill="#3aa8ff" stroke="#0a3a7a" stroke-width="1.5"/>`, `<path d="M-12,-4H6A5,5 0 1 0 1,-9M-12,3H10A5,5 0 1 1 5,8" stroke="#2fae58" stroke-width="3" fill="none" stroke-linecap="round"/>`, `<path d="M3,-15L-8,2H-1L-4,15L8,-3H1Z" fill="#ffd21a" stroke="#6a4a00" stroke-width="1.5"/>`];
      let ui = `<path d="M0,0H1920V1080H0Z M30,30V1050H1890V30Z" fill="#2c3a6a" fill-rule="evenodd"/><rect x="30" y="30" width="1860" height="1020" fill="none" stroke="url(#s03gold)" stroke-width="8"/><rect x="44" y="44" width="1832" height="992" fill="none" stroke="#a8701c" stroke-width="1.5"/>`;
      ui += goldCorner(30, 30, 1, 1) + goldCorner(1890, 30, -1, 1) + goldCorner(30, 1050, 1, -1) + goldCorner(1890, 1050, -1, -1);
      ui += `<g transform="translate(1600,90)"><rect x="-22" y="-30" width="270" height="70" rx="14" fill="#2c4a9a" fill-opacity=".85" stroke="url(#s03gold)" stroke-width="4"/>${ELEM.map((e, i) => `<g transform="translate(${22 + i * 60},5)"><circle r="23" fill="#fffbea" stroke="url(#s03gold)" stroke-width="4"/>${e}</g>`).join('')}</g>`;
      ui += `<path d="M560,72H860M1060,72H1360" stroke="url(#s03gold)" stroke-width="3"/><rect x="952" y="64" width="16" height="16" transform="rotate(45,960,72)" fill="#e8473c" stroke="${OL}" stroke-width="2"/>`;
      this.ui = mk('g', {}, hud); this.ui.innerHTML = ui;
      this.title = mk('g', {}, hud);
      this.title.innerHTML = `<g class="rb"><path d="M-450,-58H450V36H-450Z" fill="#2c4a9a" stroke="url(#s03gold)" stroke-width="6"/><text x="0" y="8" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="62" letter-spacing="10" fill="url(#s03gold)" stroke="#3b2a1e" stroke-width="2" paint-order="stroke">奇幻冒险金饰风</text><text x="0" y="78" text-anchor="middle" font-family="'Trajan Pro 3'" font-weight="700" font-size="26" letter-spacing="10" fill="#ffe68a" stroke="#3b2a1e" stroke-width="4" paint-order="stroke">FANTASY ADVENTURE</text></g>`;
      this.rb = q(this.title, '.rb');
    },
    pelZw(lt) { return D(lt); },
    alt(lt) { return 430 * ss(2.0, 2.3, lt) * (1 - ss(4.0, 6.0, lt)) + 30 * Math.sin(lt * 3) * ss(2.1, 2.5, lt) * (1 - ss(3.6, 4.4, lt)); },
    camH(lt) { const a = this.alt(lt); return lerp(380 + a, HEND, ss(4.3, 5.3, lt)); },
    update(lt) {
      const d = D(lt), tau = tau3(lt);
      const aerial = lt < 2.05;
      vis(this.aer, aerial); vis(this.rear, !aerial);
      if (aerial) {
        // 俯瞰：鹈鹕很小，沿蜿蜒小路骑向崖边；镜头缓缓推近
        const s = PL ? 0 : 0; pathAt(0);
        const total = PL[PL.length - 1], sAt = total - (2.0 - lt) * SPEED * MS;
        const p = pathAt(sAt), flip = Math.cos(p[2]) < 0;
        const glide = ss(1.85, 2.05, lt);
        ride(this.mpel, d, { lt, glide, wind: 1 + glide });
        at(this.mpg, { transform: `translate(${f1(p[0])},${f1(p[1])}) rotate(${f2(Math.atan2(Math.sin(flip ? p[2] - PI : p[2]), Math.cos(flip ? p[2] - PI : p[2])) * 180 / PI * .35)}) scale(${flip ? -MS : MS},${MS})` });
        const z = lerp(1.0, 1.22, eio(clamp((lt + 2.1) / 4.1)));
        this.map.setAttribute('transform', zoomT(z, lerp(960, 1080, eio(clamp((lt + 2.1) / 4.1))), 500));
      } else {
        // 侧后方跟随：透视地面随前进流向镜头
        const a = this.alt(lt), h = this.camH(lt), camZw = Dc(lt) - ZP, zr = d - camZw;
        const yZ = Z => CAM.hy + CAM.f * h / Z;
        const Zs = []; for (let i = 0; i <= this.NS; i++) Zs.push(280 * Math.pow(12000 / 280, i / this.NS));
        const LAKE0 = D(2.2) + 200, LAKE1 = D(5.1);
        this.se.forEach((r, i) => {
          const z0 = Zs[i], z1 = Zs[i + 1], zw = camZw + (z0 + z1) / 2, y0 = yZ(z0), y1 = yZ(z1);
          const lake = zw > LAKE0 && zw < LAKE1, band = Math.floor(zw / 260) % 2;
          at(r, { y: f1(Math.min(y0, y1)), height: f1(Math.abs(y0 - y1) + 1), fill: lake ? (band ? '#4fb3e8' : '#5cbcf0') : (band ? '#7cc95a' : '#86d063') });
        });
        // 落地后的路（通向城门）
        const RS = LAKE1 + 200, zn = Math.max(RS - camZw, 300), zf = 9000;
        if (RS - camZw < 9000) { const pa = proj(Object.assign({ h }, CAM), -170, zn), pb = proj(Object.assign({ h }, CAM), 170, zn), pc = proj(Object.assign({ h }, CAM), 170, zf), pd = proj(Object.assign({ h }, CAM), -170, zf); this.road.setAttribute('d', P([pa, pb, pc, pd], true)); vis(this.road, true); } else vis(this.road, false);
        this.de.forEach((e, i) => { const zw = Math.ceil((camZw + 300) / 300) * 300 + i * 300, z = zw - camZw; if (zw < RS || z > 6000) { e.setAttribute('d', 'M0,0'); return; } const a1 = proj(Object.assign({ h }, CAM), -8, z), b1 = proj(Object.assign({ h }, CAM), 8, z), c1 = proj(Object.assign({ h }, CAM), 8, z + 120), d1 = proj(Object.assign({ h }, CAM), -8, z + 120); e.setAttribute('d', P([a1, b1, c1, d1], true)); });
        this.props.forEach(p => { const z = p.Zw + (LAKE1 > p.Zw && p.Zw > LAKE0 ? 99999 : 0) - camZw + 0; const zz = p.Zw - camZw; const inLake = p.Zw > LAKE0 && p.Zw < LAKE1; if (zz < 200 || zz > 7000 || inLake) { p.e.setAttribute('opacity', 0); return; } const pp = proj(Object.assign({ h }, CAM), p.X, zz); at(p.e, { opacity: 1, transform: `translate(${f1(pp[0])},${f1(pp[1])}) scale(${f2(pp[2])})` }); });
        // 城堡：立在落地点后方（镜头停下后，它就在鹈鹕身后的远处）
        const zc = Dc(6) - ZP + 3600 - camZw;
        const pc = proj(Object.assign({ h }, CAM), 0, zc);
        at(this.castle, { transform: `translate(${f1(pc[0])},${f1(pc[1])}) scale(${f2(pc[2])})` });
        this.clouds.setAttribute('transform', `translate(${f1(-d * .02)},0)`);
        // 鹈鹕（背影）+ 滑翔翼
        const glide = ss(2.0, 2.2, lt) * (1 - ss(5.9, 6.25, lt));
        this.rpel.update(tau, d, {});
        at(this.gld, { opacity: f2(glide), transform: `translate(0,-300) scale(${f2(.3 + .7 * glide)}) translate(0,300)` });
        const py = CAM.hy + CAM.f * (h - a) / zr, ps = CAM.f / zr;
        at(this.rpg, { transform: `translate(${f1(960 + Math.sin(lt * 1.7) * 30 * glide * ps)},${f1(py)}) rotate(${f2(Math.sin(lt * 1.7) * 4 * glide)}) scale(${f2(ps)})` });
      }
      const bk = eo(inv(2.4, 2.85, lt)) * (1 - eo(inv(4.2, 4.5, lt)));
      at(this.bc, { x: f1(960 - 960 * bk), width: f1(1920 * bk) }); vis(this.band, bk > .001);
      // 金色雕花边框：转场时由金线舒展而成（lt≈0.6 后接手）；下一次转场时收成圆角面板
      op(this.ui, ss(.6, .8, lt) * (lt < 6 ? 1 : 0));
      const ti = eob(inv(.15, .55, lt)), to = inv(1.6, 1.9, lt);
      vis(this.title, ti > 0 && to < 1);
      at(this.rb, { transform: `translate(960,${f1(160 - to * 260)}) scale(${f2(ti)},1)` });
    },
    portal(lt) {
      const h = 380, zc = 900, x = 960, y = CAM.hy + CAM.f * h / zc, w = 280, top = y - 520;
      return { d: `M${x - w},${f1(y)}V${f1(top + w)}A${w},${w} 0 0 1 ${x + w},${f1(top + w)}V${f1(y)}Z`, box: [x - w, top, x + w, y], pv: [x, y - 260], late: true, zmax: 8 };
    },
    exitFx: {
      win: [-0.02, 0.9],
      build(g) {
        g.innerHTML = `<g class="cst">${[[760, 120, 330], [1160, 120, 300], [960, 200, 420]].map(t => `<rect class="cw" x="${t[0] - t[1] / 2}" y="${560 - t[2]}" width="${t[1]}" height="${t[2]}" fill="#f3ead2"/><path class="cr" d="M${t[0] - t[1] / 2 - 8},${560 - t[2]}L${t[0]},${560 - t[2] - t[1] * 1.5}L${t[0] + t[1] / 2 + 8},${560 - t[2]}Z" fill="#3d6fd1" style="transform-origin:${t[0]}px ${560 - t[2]}px"/>`).join('')}</g><rect class="pa" fill="#fff" stroke="#e9b949" stroke-width="6"/><rect class="pb" fill="#fff" stroke="#e9b949" stroke-width="6"/>`;
        this.cst = q(g, '.cst'); this.cw = qa(g, '.cw'); this.cr = qa(g, '.cr'); this.pa = q(g, '.pa'); this.pb = q(g, '.pb');
      },
      update(u) {
        const k = eio(clamp(u / .55));
        op(this.cst, (u < 0 ? 0 : 1) * (1 - ss(.35, .75, u)));
        this.cr.forEach(e => e.style.transform = `scaleY(${f2(1 - k)})`);
        const col = `rgb(${Math.round(lerp(243, 255, k))},${Math.round(lerp(234, 255, k))},${Math.round(lerp(210, 255, k))})`; this.cw.forEach(e => e.setAttribute('fill', col));
        const ra = [lerp(30, 56, k), lerp(30, 56, k), lerp(930, 440, k), lerp(1020, 132, k)], rb = [lerp(960, 1424, k), lerp(30, 56, k), lerp(930, 440, k), lerp(1020, 96, k)];
        const st = `rgb(${Math.round(lerp(233, 150, k))},${Math.round(lerp(185, 205, k))},${Math.round(lerp(73, 255, k))})`, o = (u < 0 ? 0 : 1) * (1 - ss(.5, .8, u));
        for (const [e, r] of [[this.pa, ra], [this.pb, rb]]) at(e, { x: f1(r[0]), y: f1(r[1]), width: f1(r[2]), height: f1(r[3]), rx: f1(k * 24), 'fill-opacity': f2(k * .6), stroke: st, 'stroke-width': f1(lerp(6, 2, k)), opacity: f2(o) });
      }
    }
  });
})();

/* ---------------- No.04 清爽校园：游戏界面；正面略俯视校门口，鹈鹕从深处朝镜头骑来 ---------------- */
function campusStudent(i) {
  const LN = '#5b6b88', BL = '#3aa0ff';
  const hair = ['#2a2a38', '#ff9ac0', '#f2d27a', '#7ab8ff', '#f4f4f8', '#a0603a', '#c8a0ff'][i % 7], halo = ['#ff8ab8', '#5cc4ff', '#ffd25a', '#8fe0a8', '#c8a0ff'][i % 5], skirt = i % 3 === 0;
  return `<g class="st"><path d="M-18,-70L18,-70L${skirt ? 26 : 16},${skirt ? -28 : 0}L${skirt ? -26 : -16},${skirt ? -28 : 0}Z" fill="#2f4a7a"/>${skirt ? `<path d="M-12,-28V0M12,-28V0" stroke="#f0d8c8" stroke-width="8"/>` : ''}
    <path d="M-20,-122Q0,-128 20,-122L22,-66H-22Z" fill="#fff" stroke="${LN}" stroke-width="2"/><path d="M-6,-120L0,-104L6,-120" fill="${BL}"/><circle cy="-142" r="20" fill="#ffe8da" stroke="${LN}" stroke-width="2"/>
    <path d="M-22,-138C-24,-168 24,-168 22,-138C22,-146 18,-150 14,-146C8,-156 -8,-156 -14,-146C-18,-150 -22,-146 -22,-138Z" fill="${hair}" stroke="${LN}" stroke-width="2"/><ellipse cy="-176" rx="16" ry="5" fill="none" stroke="${halo}" stroke-width="3.5"/>
    <g class="arm"><path d="M14,-114L34,-150" stroke="#fff" stroke-width="10" stroke-linecap="round"/><rect x="24" y="-182" width="22" height="34" rx="4" fill="#33405a" transform="rotate(-10,35,-165)"/><rect x="27" y="-178" width="16" height="26" rx="2" fill="#bfe8ff" transform="rotate(-10,35,-165)"/><g class="flash" opacity="0"><path d="M36,-170l6,-24l6,24l24,6l-24,6l-6,24l-6,-24l-24,-6Z" fill="#fff"/><circle cx="42" cy="-164" r="26" fill="#fff" opacity=".5"/></g></g></g>`;
}
(function () {
  const LN = '#5b6b88', BL = '#3aa0ff', NAVY = '#1f3550';
  const D = makeDist(CRUISE);
  const CAM = { cx: 960, hy: 300, f: 1150, h: 560, x: 0 };
  const ZARC = 1400;
  // 路线（世界坐标 X,Z；朝向 h：0 = 背对镜头往里骑，π = 朝镜头骑来）：
  // 落地后先往里骑，绕一个小圈掉头，从学生中间朝镜头骑来，第 3 小节拐到走廊边
  const Z0 = 2300, L1 = 260, RT = 120, XC = -540;
  const LT = PI * RT, SV0 = 460, SV1 = 990;
  function path4(s) {
    if (s < L1) return { X: 0, Z: Z0 + s, h: 0 };
    const s2 = s - L1;
    if (s2 < LT) { const a = s2 / RT; return { X: -RT + RT * Math.cos(a), Z: Z0 + L1 + RT * Math.sin(a), h: a }; }
    const s3 = s2 - LT, k = ss(SV0, SV1, s3), X = lerp(-2 * RT, XC, k);
    const dk = (ss(SV0, SV1, s3 + 1) - ss(SV0, SV1, s3 - 1)) / 2;
    return { X, Z: Z0 + L1 - s3, h: PI + Math.atan2((XC + 2 * RT) * dk, 1) };
  }
  remake(3, {
    build(root) {
      const R = rng(4404);
      def(`<linearGradient id="n04win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb8ff"/><stop offset=".7" stop-color="#b8e2ff"/><stop offset="1" stop-color="#e8f6ff"/></linearGradient>`);
      bigBg(root, '#8fd0ff');
      add(root, `<rect x="-1200" y="-900" width="4320" height="2880" fill="url(#s04sky)"/>${[0, 1, 2].map(i => `<path d="M${-200 + i * 260},-50L${200 + i * 300},-50L${900 + i * 300},1080L${600 + i * 260},1080Z" fill="url(#s04beam)" opacity=".3"/>`).join('')}`);
      let cl = ''; for (let i = 0; i < 6; i++) { const x = R() * 2000, y = 60 + R() * 140; cl += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(120 + R() * 120)}" ry="${f1(24 + R() * 14)}" fill="#fff" opacity=".85"/>`; }
      add(root, cl);
      const pj = (X, Z, Y) => proj(CAM, X, Z, Y);
      const quad = (a, b, c, d2, fill, extra) => `<path d="${P([a, b, c, d2], true)}" fill="${fill}" ${extra || ''}/>`;
      let s = '';
      // 远处的高架轻轨与城市
      for (let i = 0; i < 14; i++) { const X = -5200 + i * 800, w = 500, h = 1500 + R() * 1600, Z = 9000; const a = pj(X, Z), b = pj(X + w, Z), c = pj(X + w, Z, h), d2 = pj(X, Z, h); s += quad(a, b, c, d2, R() < .5 ? '#d8ecfa' : '#e8f3fb'); }
      { const a = pj(-9000, 7000, 520), b = pj(9000, 7000, 520), c = pj(9000, 7000, 580), d2 = pj(-9000, 7000, 580); s += quad(a, b, c, d2, '#fff', `stroke="#c8d8e8" stroke-width="1"`); }
      this.railY = pj(0, 7000, 580)[1]; this.railS = pj(0, 7000)[2];
      // 地面与道路（先画地面，楼立在地面上）
      s += quad(pj(-3000, 700), pj(3000, 700), pj(3000, 9000), pj(-3000, 9000), '#eef4f9');
      s += quad(pj(-420, 700), pj(420, 700), pj(420, 4100), pj(-420, 4100), '#dde6ee');
      s += quad(pj(-420, 700), pj(-300, 700), pj(-300, 4100), pj(-420, 4100), '#d4eafc');
      for (let z = 760; z < 4100; z += 260) s += quad(pj(-10, z), pj(10, z), pj(10, z + 130), pj(-10, z + 130), '#fff');
      // 走廊边的小路（第 3 小节拐过去）
      s += quad(pj(-690, 700), pj(-400, 700), pj(-400, 2500), pj(-690, 2500), "#e2ecf4");
      // 主楼（校门后方）与钟楼
      const MB = 5600;
      { const a = pj(-1700, MB), b = pj(1700, MB), c = pj(1700, MB, 1300), d2 = pj(-1700, MB, 1300); s += quad(a, b, c, d2, '#fff', `stroke="#c8d8e8" stroke-width="2"`);
        for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) { const X = -1560 + k * 224, Y = 160 + r * 220, p0 = pj(X, MB, Y + 150), p1 = pj(X + 150, MB, Y); s += `<rect x="${f1(p0[0])}" y="${f1(p0[1])}" width="${f1(p1[0] - p0[0])}" height="${f1(p1[1] - p0[1])}" rx="2" fill="#a9d6fb"/>`; }
        const t0 = pj(-260, MB - 10, 1300), t1 = pj(260, MB - 10, 2000); s += `<rect x="${f1(t0[0])}" y="${f1(t1[1])}" width="${f1(t1[0] - t0[0])}" height="${f1(t0[1] - t1[1])}" fill="#fff" stroke="#c8d8e8" stroke-width="2"/>`;
        const tc = pj(0, MB - 20, 1700); this.tower = [tc[0], tc[1], tc[2]]; s += `<path d="M${f1(t0[0] - 6)},${f1(t1[1])}L${f1(tc[0])},${f1(t1[1] - 80 * tc[2] * 3)}L${f1(t1[0] + 6)},${f1(t1[1])}Z" fill="${BL}"/><circle cx="${f1(tc[0])}" cy="${f1(tc[1])}" r="${f1(170 * tc[2])}" fill="#fff" stroke="${NAVY}" stroke-width="3"/><path d="M${f1(tc[0])},${f1(tc[1])}V${f1(tc[1] - 120 * tc[2])}M${f1(tc[0])},${f1(tc[1])}L${f1(tc[0] + 80 * tc[2])},${f1(tc[1] + 40 * tc[2])}" stroke="${NAVY}" stroke-width="3" stroke-linecap="round"/>`;
        const lb = pj(0, MB - 10, 1240); s += `<text x="${f1(lb[0])}" y="${f1(lb[1])}" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="${f1(120 * lb[2])}" letter-spacing="4" fill="${NAVY}">SEIKU ACADEMY</text>`; }
      // 两侧校舍立面（透视）+ 天桥
      for (const side of [-1, 1]) {
        const X = side * 1150, Z0 = 1300, Z1 = 4300, H = 950;
        s += quad(pj(X, Z0), pj(X, Z1), pj(X, Z1, H), pj(X, Z0, H), '#fff', `stroke="#c8d8e8" stroke-width="2"`);
        s += quad(pj(X, Z0, H), pj(X, Z1, H), pj(X + side * 40, Z1, H + 30), pj(X + side * 40, Z0, H + 30), BL);
        for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) { const z0 = Z0 + 120 + k * 290, z1 = z0 + 190, y0 = 160 + r * 200, y1 = y0 + 130; s += quad(pj(X, z0, y0), pj(X, z1, y0), pj(X, z1, y1), pj(X, z0, y1), '#a9d6fb'); }
      }
      s += quad(pj(-1150, 2700, 640), pj(1150, 2700, 640), pj(1150, 2700, 760), pj(-1150, 2700, 760), '#fff', `stroke="#c8d8e8" stroke-width="2"`) + quad(pj(-1150, 2700, 660), pj(1150, 2700, 660), pj(1150, 2700, 680), pj(-1150, 2700, 680), BL);
      // 校园走廊（与路平行的长廊）：大窗外是晴空；转场时樱花从这些窗里落满
      { const XW = -740, Zs0 = 650, Zs1 = 2500, H = 330;
        s += quad(pj(XW, Zs0), pj(XW, Zs1), pj(XW, Zs1, H), pj(XW, Zs0, H), '#ffffff', `stroke="#c8d8e8" stroke-width="2"`);
        this.corrWin = [];
        for (let z = Zs0 + 40; z + 170 < Zs1; z += 230) { const a = pj(XW, z, 70), b = pj(XW, z + 170, 70), c2 = pj(XW, z + 170, 280), d2 = pj(XW, z, 280); this.corrWin.push([a, b, c2, d2]);
          s += `<path d="${P([a, b, c2, d2], true)}" fill="url(#n04win)" stroke="#9cc8ec" stroke-width="${f1(Math.max(1.5, 6 * a[2]))}"/>`;
          const m1 = pj(XW, z + 85, 70), m2 = pj(XW, z + 85, 280); s += `<path d="M${f1(m1[0])},${f1(m1[1])}L${f1(m2[0])},${f1(m2[1])}" stroke="#fff" stroke-width="${f1(Math.max(1.5, 8 * a[2]))}"/>`; }
        s += quad(pj(XW, Zs0, H), pj(XW, Zs1, H), pj(XW + 120, Zs1, H + 24), pj(XW + 120, Zs0, H + 24), BL);
        for (let z = Zs0; z <= Zs1; z += 460) { const a = pj(XW + 110, z), b = pj(XW + 110, z, H + 10); s += `<path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="#fff" stroke-width="${f1(Math.max(3, 22 * a[2]))}" stroke-linecap="round"/>`; }
        const tl = pj(XW, 900, 300); s += `<text x="${f1(tl[0] + 20 * tl[2])}" y="${f1(tl[1] + 6)}" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="${f1(26 * tl[2])}" fill="${NAVY}">1F 走廊</text>`; }
      // 校门
      for (const side of [-1, 1]) { const X = side * 470; const a = pj(X - 40, 4100), b = pj(X + 40, 4100), c = pj(X + 40, 4100, 560), d2 = pj(X - 40, 4100, 560); s += quad(a, b, c, d2, '#fff', `stroke="#c8d8e8" stroke-width="2"`); s += quad(pj(X - 40, 4100, 520), pj(X + 40, 4100, 520), c, d2, BL); }
      { const a = pj(-240, 4100, 600), b = pj(240, 4100, 700); s += `<rect x="${f1(a[0])}" y="${f1(b[1])}" width="${f1(b[0] - a[0])}" height="${f1(a[1] - b[1])}" rx="${f1((a[1] - b[1]) / 2)}" fill="#fff" stroke="${BL}" stroke-width="3"/><text x="${f1((a[0] + b[0]) / 2)}" y="${f1(a[1] - (a[1] - b[1]) * .28)}" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="${f1((a[1] - b[1]) * .62)}" fill="${NAVY}">晴空学园</text>`; }
      // 行道树
      for (const side of [-1, 1]) for (let z = 1400; z < 4000; z += 520) { const p = pj(side * 720, z); s += `<g transform="translate(${f1(p[0])},${f1(p[1])}) scale(${f2(p[2] * 1.6)})"><path d="M0,0V-150" stroke="#a88a6a" stroke-width="16"/><circle cy="-220" r="110" fill="#a8e090"/><circle cx="-40" cy="-250" r="64" fill="#c4ecb0"/><circle cx="50" cy="-200" r="60" fill="#8fd27a"/></g>`; }
      // 里程碑 No.04
      { const p = pj(-560, 2000); s += `<g transform="translate(${f1(p[0])},${f1(p[1])}) scale(${f2(p[2] * 1.6)})"><rect x="-4" y="-150" width="8" height="150" fill="#c8d8e8"/><rect x="-74" y="-226" width="148" height="80" rx="16" fill="#fff" stroke="${BL}" stroke-width="4"/><text y="-178" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="34" fill="${BL}">No.04</text></g>`; }
      add(root, s);
      // 放学铃的涟漪
      this.rings = add(root, `<g fill="none" stroke="${BL}" stroke-width="3">${[0, 1, 2].map(() => `<circle cx="${f1(this.tower[0])}" cy="${f1(this.tower[1])}" r="20"/>`).join('')}<text x="${f1(this.tower[0] + 60)}" y="${f1(this.tower[1] - 40)}" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="30" fill="${BL}" stroke="none">♪ 叮—咚——</text></g>`);
      this.rg = qa(this.rings, 'circle'); this.dd = q(this.rings, 'text');
      // 轻轨列车
      this.train = mk('g', {}, root);
      this.train.innerHTML = Array.from({ length: 4 }, (_, c) => `<rect x="${c * 250}" y="-66" width="240" height="66" rx="${c === 0 ? 30 : 10}" fill="#fff" stroke="#b8cce0" stroke-width="2"/><rect x="${c * 250}" y="-22" width="240" height="8" fill="${BL}"/>${Array.from({ length: 5 }, (_, j) => `<rect x="${c * 250 + 22 + j * 42}" y="-54" width="30" height="22" rx="4" fill="#9fd2ff"/>`).join('')}`).join('');
      // 学生（远/近两组，按深度排在鹈鹕前后）
      this.far = mk('g', {}, root); this.pg = mk('g', {}, root); this.near = mk('g', {}, root);
      this.st = [];
      for (let i = 0; i < 14; i++) { const side = i % 2 ? 1 : -1, X = side * (420 + (i % 4) * 70), Z = 1900 + (i * 97) % 900; const e = add(this.far, campusStudent(i)); this.st.push({ e, X, Z, arm: q(e, '.arm'), fl: q(e, '.flash'), front: false, i }); }
      this.pel = makePelicanFB({ line: LN, lw: 2.6, body: '#ffffff', belly: '#f4f8fd', wing: '#eef4fb', beak: '#ffb54a', pouch: '#ffd690', leg: '#ffa04a', tire: '#44516a', frame: BL, bar: LN, fish: '#7fc8ff', shade: 'rgba(90,140,200,.14)',
        eyeMk: () => `<circle cx="-13" cy="-360" r="5.5" fill="${NAVY}"/><circle cx="13" cy="-360" r="5.5" fill="${NAVY}"/><circle cx="-11" cy="-362" r="2" fill="#fff"/><circle cx="15" cy="-362" r="2" fill="#fff"/>`,
        top: `<g class="halo" transform="translate(0,-414)"><ellipse rx="46" ry="12" fill="none" stroke="#fff" stroke-width="10" opacity=".8"/><ellipse rx="46" ry="12" fill="none" stroke="#1f9bff" stroke-width="4.5"/><path d="M-46,0l-16,-5M46,0l16,-5M0,-12v-14" stroke="#1f9bff" stroke-width="3.5" stroke-linecap="round"/></g>` }, 'front');
      this.gF = mk('g', {}, this.pg); this.gF.appendChild(this.pel.g);
      this.pelB = makePelicanFB({ line: LN, lw: 2.6, body: '#ffffff', wing: '#eef4fb', beak: '#ffb54a', leg: '#ffa04a', tire: '#44516a', frame: BL, bar: LN, crestC: '#fff', treadC: '#9cd0ff',
        top: `<g transform="translate(0,-414)"><ellipse rx="46" ry="12" fill="none" stroke="#fff" stroke-width="10" opacity=".8"/><ellipse rx="46" ry="12" fill="none" stroke="#1f9bff" stroke-width="4.5"/></g>` }, 'back');
      this.gB = mk('g', {}, this.pg); this.gB.appendChild(this.pelB.g);
      this.pelS = PELICANS.s04(); this.gS = mk('g', {}, this.pg); this.gS.appendChild(this.pelS.g);
      this.riderIn = this.pelB.g; this.riderOut = this.pel.g;
      // （旧的出口画框已去掉）
      this.arc = mk('g', {}, root);
      { const a = pj(-560, ZARC), b = pj(560, ZARC, 760), w = b[0] - a[0], h = a[1] - b[1], ox = 70 * a[2], tp = 120 * a[2];
        this.arcBox = [a[0] + ox, b[1] + ox, b[0] - ox, a[1]];
        this.arc.innerHTML = `<path d="M${f1(a[0] - 400)},${f1(a[1] + 60)}V${f1(b[1] - tp)}H${f1(b[0] + 400)}V${f1(a[1] + 60)}H${f1(b[0] - ox)}V${f1(b[1] + ox + 40)}Q${f1(b[0] - ox)},${f1(b[1] + ox)} ${f1(b[0] - ox - 40)},${f1(b[1] + ox)}H${f1(a[0] + ox + 40)}Q${f1(a[0] + ox)},${f1(b[1] + ox)} ${f1(a[0] + ox)},${f1(b[1] + ox + 40)}V${f1(a[1] + 60)}Z" fill="#ffffff" stroke="#c8d8e8" stroke-width="3"/>
          <rect x="${f1(a[0] - 400)}" y="${f1(b[1] - tp)}" width="${f1(w + 800)}" height="${f1(tp * .4)}" fill="${BL}"/><text x="${f1((a[0] + b[0]) / 2)}" y="${f1(b[1] - tp * .2)}" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="${f1(tp * .5)}" fill="${NAVY}">2F 走廊 · 通往樱花坡</text>`; }
      // 界面面板（界面层，不随镜头校正）
      const hud = hudOf(root);
      this.ui = mk('g', { filter: 'url(#s04soft)' }, hud);
      this.ui.innerHTML = `<g><rect x="56" y="56" width="440" height="132" rx="24" fill="#fff" fill-opacity=".62" stroke="#9cd0ff" stroke-width="2"/><rect x="56" y="84" width="8" height="76" rx="4" fill="${BL}"/><text x="86" y="100" font-family="Montserrat" font-weight="800" font-size="18" letter-spacing="3" fill="${BL}">TODAY'S TASK</text><text x="86" y="140" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="30" fill="${NAVY}">今日任务：骑车上学</text><rect x="86" y="158" width="380" height="10" rx="5" fill="#d8ecfc"/><rect class="pbar" x="86" y="158" width="120" height="10" rx="5" fill="${BL}"/></g>
        <g><rect x="1424" y="56" width="440" height="96" rx="24" fill="#fff" fill-opacity=".62" stroke="#9cd0ff" stroke-width="2"/><circle cx="1474" cy="104" r="22" fill="#ffd25a"/><text class="clk" x="1512" y="96" font-family="Montserrat" font-weight="800" font-size="34" fill="${NAVY}">15:59</text><text class="cls" x="1512" y="126" font-family="'HarmonyOS Sans SC'" font-size="18" fill="${LN}">晴 · 放学前 1 分钟</text></g>`;
      this.pbar = q(this.ui, '.pbar'); this.clk = q(this.ui, '.clk'); this.cls = q(this.ui, '.cls');
      this.toast = mk('g', { filter: 'url(#s04soft)' }, hud);
      this.toast.innerHTML = `<rect width="520" height="116" rx="26" fill="#fff" fill-opacity=".94" stroke="#9cd0ff" stroke-width="2"/><rect x="22" y="22" width="72" height="72" rx="18" fill="${BL}"/><path d="M40,46h36a6,6 0 0 1 6,6v14a6,6 0 0 1 -6,6h-22l-10,9v-9h-4a6,6 0 0 1 -6,-6v-14a6,6 0 0 1 6,-6Z" fill="#fff"/><text x="114" y="50" font-family="'HarmonyOS Sans SC'" font-size="20" fill="${LN}">校园通知 · 刚刚</text><text x="114" y="88" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="32" fill="${NAVY}">鹈鹕骑车来上学了</text><circle cx="494" cy="26" r="9" fill="#ff5a7a"/>`;
      this.title = mk('g', { filter: 'url(#s04soft)' }, hud);
      this.title.innerHTML = `<rect width="640" height="190" rx="30" fill="#fff" fill-opacity=".82" stroke="#9cd0ff" stroke-width="2"/><rect x="40" y="36" width="150" height="36" rx="18" fill="${BL}"/><text x="115" y="61" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="18" letter-spacing="3" fill="#fff">STYLE 04</text><text x="40" y="136" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="64" fill="${NAVY}">清爽蓝白校园风</text><text x="42" y="172" font-family="Montserrat" font-weight="700" font-size="24" letter-spacing="8" fill="${BL}">BRIGHT CAMPUS</text>`;
    },
    update(lt) {
      const d = D(lt), P4 = path4(d), z = P4.Z, pp = proj(CAM, P4.X, z);
      const view = P4.h < 1.15 ? 0 : P4.h < 2.0 ? 1 : 2;
      vis(this.gB, view === 0); vis(this.gS, view === 1); vis(this.gF, view === 2);
      this.pelB.update(d / DPR, d, {}); ride(this.pelS, d); this.pel.update(d / DPR, d, { sway: (P4.h - PI) * -14 });
      at(this.gS, { transform: 'scale(-1,1)' });
      at(this.pg, { transform: `translate(${f1(pp[0])},${f1(pp[1])}) scale(${f2(pp[2])})` });
      // 学生：从校门涌出，站到路两边，举手机
      this.st.forEach(s => {
        const a = 2.0 + s.i * .04, k = eo(inv(a, a + .6, lt));
        const Z = lerp(4150, s.Z, k), X = lerp(s.X * .4, s.X, k), p = proj(CAM, X, Z);
        at(s.e, { transform: `translate(${f1(p[0])},${f1(p[1])}) scale(${f2(p[2] * 2.1)})`, opacity: f2(inv(a, a + .1, lt)) });
        const up = ss(2.5 + s.i * .02, 2.75 + s.i * .02, lt); s.arm.setAttribute('transform', `rotate(${f1((1 - up) * 70)},14,-114)`);
        op(s.fl, bump(lt - ([2.9, 3.05, 3.2, 3.35, 3.5][s.i % 5] + (s.i > 6 ? .07 : 0)), .05));
        const front = Z < z; if (front !== s.front) { s.front = front; (front ? this.near : this.far).appendChild(s.e); }
      });
      const bl = inv(1.95, 3.2, lt);
      this.rg.forEach((r, i) => { const k = fr(bl * 2 - i * .3); at(r, { r: f1(20 + k * 90), opacity: bl > 0 && bl < 1 ? f2(1 - k) : 0 }); });
      op(this.dd, inv(1.95, 2.1, lt) * (1 - inv(3.2, 3.5, lt)));
      at(this.train, { transform: `translate(${f1(2400 - 260 * (lt + 2.2))},${f1(this.railY)}) scale(${f2(this.railS * 3)})` });
      at(this.pbar, { width: f1(120 + 260 * ss(2.8, 4.5, lt)) });
      this.clk.textContent = lt < 2 ? '15:59' : '16:00'; this.cls.textContent = lt < 2 ? '晴 · 放学前 1 分钟' : '晴 · 放学铃响了';
      const tk = eob(inv(2.85, 3.15, lt)) * (1 - eo(inv(4.3, 4.6, lt)));
      at(this.toast, { transform: `translate(${f1(1920 - tk * 580)},180)`, opacity: f2(clamp(tk * 3)) });
      const ti = eo(inv(.15, .5, lt)), to = inv(1.7, 2.0, lt);
      at(this.title, { transform: `translate(${f1(140 - (1 - ti) * 60)},${f1(220)})`, opacity: f2(ti * (1 - to)) });
      vis(this.arc, false);
      // 圆角面板：转场时由上一版的金框收拢而成，lt≈0.5 后接手
      op(this.ui, ss(.48, .64, lt));
    },
    portal(lt) { const b = this.arcBox; return { d: rrD(b[0], b[1], b[2] - b[0], b[3] - b[1], 40), box: b, late: true, zmax: 5 }; },
    exitFx: OLDSCENES[3].exitFx
  });
})();
