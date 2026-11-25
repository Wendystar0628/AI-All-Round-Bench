'use strict';
/* ---------------- No.03 奇幻冒险金饰风 ---------------- */
(function () {
  const OL = '#3b2a1e', GOLD = '#e9b949';
  PELICANS.s03 = () => {
    const p = makePelican({
      line: OL, lw: 3.5, body: '#ffffff', wing: '#f3f6fb', beak: '#ffa630', pouch: '#ffd06e', eye: OL,
      shade: { body: ['#d4e2f4', 8, -10], neck: ['#d4e2f4', 6, -3], head: ['#d4e2f4', 5, -5], wing: ['#cfdcee', 5, -6], pouch: ['#f2a447', 0, -7], beak: ['#e8862a', 0, -4] },
      leg: '#ff9a2e', legFar: '#d4701a', legW: 9, footLine: OL,
      tire: '#4a3326', tireW: 8, spoke: '#d9a84a', spokeW: 2, spokes: 10, frame: '#3d6fd1', frameW: 8, frameUnder: OL, saddle: '#7a3b22', saddleLine: OL, bar: OL, crank: OL, hub: GOLD, fish: '#5cc0e8',
      upBack: `<path class="cape" fill="#e8473c" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><path class="cape2" fill="#b8302a"/>`,
      upFront: `<path d="M-6,-268C6,-262 18,-262 30,-268L26,-256C14,-252 4,-252 -4,-256Z" fill="${GOLD}" stroke="${OL}" stroke-width="2.5"/><circle cx="12" cy="-258" r="5" fill="#e8473c" stroke="${OL}" stroke-width="2"/>`,
      bikeFront: `<g class="lamp"><path d="M0,0v14" stroke="${OL}" stroke-width="2"/><circle cy="27" r="22" fill="#fff3a0" opacity=".35"/><rect x="-9" y="14" width="18" height="24" rx="4" fill="#ffe680" stroke="${OL}" stroke-width="2.5"/><path d="M-12,14h24M-12,38h24" stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round"/></g>`,
      top: `<g class="glider" opacity="0"><path d="M-30,-462L-70,-252M20,-466L44,-252M-70,-252H44" stroke="${OL}" stroke-width="3" fill="none"/>
        <path class="gw" d="M-270,-410Q-40,-540 250,-468Q20,-452 -270,-410Z" fill="#ffd34a" stroke="${OL}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M-150,-452Q-40,-500 70,-497L80,-476Q-40,-470 -150,-436Z" fill="#e8473c"/><path d="M-270,-410Q-40,-540 250,-468Q20,-452 -270,-410Z" fill="none" stroke="${OL}" stroke-width="3.5"/></g>`
    });
    const cape = q(p.g, '.cape'), cape2 = q(p.g, '.cape2'), lamp = q(p.g, '.lamp'), gl = q(p.g, '.glider');
    p.onUpdate = (ps, tau, roll, opt) => {
      const t = opt.lt !== undefined ? opt.lt : tau, w = opt.wind || 1;
      const pts = [];
      for (let i = 0; i <= 5; i++) { const k = i / 5; pts.push([-4 - k * 150 * (0.85 + .15 * w), -266 + k * 60 + Math.sin(t * 9 - k * 4) * 10 * k * w]); }
      const pts2 = pts.slice().reverse().map((q2, i) => [q2[0] + 8, q2[1] + 34 * (1 - i / 5) + 10]);
      cape.setAttribute('d', smooth(pts.concat(pts2), true));
      cape2.setAttribute('d', smooth(pts.slice(2).concat(pts2.slice(0, 3)), true));
      cape2.setAttribute('opacity', '.0');
      lamp.setAttribute('transform', `translate(${PG.GRIP[0] + 4},${PG.GRIP[1] + 2}) rotate(${f1(Math.sin(t * 6) * 12)})`);
      const g = opt.glide || 0;
      at(gl, { opacity: g > 0.01 ? 1 : 0, transform: `translate(0,-300) scale(${f2(g)},${f2(g)}) translate(0,300)` });
    };
    return p;
  };
  const vfn = lt => 330 + 620 * ss(2.0, 2.5, lt) * (1 - ss(3.5, 4.1, lt));
  const SCR = makeScroll(vfn);
  const camYf = lt => 280 * ss(1.95, 2.6, lt) * (1 - ss(3.45, 4.15, lt));
  const ELEM = {
    fire: `<path d="M0,-16C8,-6 12,0 10,7C8,14 -8,14 -10,7C-12,0 -6,-4 -4,-10C-2,-4 2,-2 2,-6C2,-10 0,-12 0,-16Z" fill="#ff5a2a" stroke="#7a1e0a" stroke-width="1.5"/>`,
    water: `<path d="M0,-15C6,-6 11,0 11,6A11,11 0 0 1 -11,6C-11,0 -6,-6 0,-15Z" fill="#3aa8ff" stroke="#0a3a7a" stroke-width="1.5"/><path d="M-5,4A6,6 0 0 0 1,10" stroke="#fff" stroke-width="2" fill="none"/>`,
    wind: `<path d="M-12,-4H6A5,5 0 1 0 1,-9M-12,3H10A5,5 0 1 1 5,8M-8,10H0" stroke="#2fae58" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    bolt: `<path d="M3,-15L-8,2H-1L-4,15L8,-3H1Z" fill="#ffd21a" stroke="#6a4a00" stroke-width="1.5" stroke-linejoin="round"/>`
  };
  function corner(x, y, sx, sy) {
    return `<g transform="translate(${x},${y}) scale(${sx},${sy})" fill="none" stroke="url(#s03gold)" stroke-width="5" stroke-linecap="round">
      <path d="M0,90V0H90"/><path d="M16,120C16,60 30,30 60,22C80,16 96,30 90,44C84,58 66,56 64,44" stroke-width="4"/><path d="M120,16C60,16 34,30 26,58C20,78 34,92 46,88C58,84 58,68 46,66" stroke-width="4"/>
      <path d="M0,0L22,22" stroke-width="3"/><rect x="-11" y="-11" width="22" height="22" transform="rotate(45)" fill="#e8473c" stroke="#7a4a10" stroke-width="2.5"/></g>`;
  }
  SCENES.push({
    key: 's03', zh: '奇幻冒险金饰风', en: 'Fantasy Adventure',
    scroll: SCR,
    openX(lt) { return frameScreenX(lt, SCR); },
    build(root) {
      def(`<linearGradient id="s03sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a86dc"/><stop offset=".6" stop-color="#86ccfb"/><stop offset="1" stop-color="#d8f1ff"/></linearGradient>
        <linearGradient id="s03gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".45" stop-color="#e9b949"/><stop offset="1" stop-color="#a8701c"/></linearGradient>
        <linearGradient id="s03band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f0c75a"/><stop offset="1" stop-color="#c98f2a"/></linearGradient>
        <linearGradient id="s03lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fd0ff"/><stop offset="1" stop-color="#2f8fd8"/></linearGradient>
        <clipPath id="s03bandc"><rect class="bc" x="960" y="930" width="0" height="120"/></clipPath>`);
      const R = rng(303);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s03sky)"/><g transform="translate(1690,150)"><circle r="120" fill="#fff8d0" opacity=".35"/><circle r="70" fill="#fff6c8"/>${Array.from({ length: 12 }, (_, i) => `<path d="M0,-90L8,-140L-8,-140Z" fill="#fff6c8" opacity=".6" transform="rotate(${i * 30})"/>`).join('')}</g>`);
      const cloud = (x, y, s) => { let a = '', b = ''; const cs = [[0, 0, 60], [55, -25, 70], [120, 0, 58], [70, 20, 60], [-45, 18, 42], [165, 22, 40]]; for (const c of cs) { a += `<circle cx="${x + c[0] * s}" cy="${y + c[1] * s + 10 * s}" r="${c[2] * s}" fill="#cfe6fb"/>`; b += `<circle cx="${x + c[0] * s - 6 * s}" cy="${y + c[1] * s}" r="${c[2] * s}" fill="#fff"/>`; } return a + b; };
      let cl = ''; for (let i = 0; i < 7; i++) cl += cloud(-100 + i * 420 + R() * 120, 140 + R() * 200, .6 + R() * .6);
      this.Lc = layer(root, 0.05, cl);
      let mt = '';
      for (let i = 0; i < 12; i++) { const x = -200 + i * 260 + R() * 80, h = 220 + R() * 160, w = 200 + R() * 120; mt += `<path d="M${x - w},700L${x},${700 - h}L${x + w},700Z" fill="#a4bdea"/><path d="M${x - w * .28},${700 - h * .72}L${x},${700 - h}L${x + w * .28},${700 - h * .72}L${x + w * .1},${700 - h * .66}L${x - w * .06},${700 - h * .74}Z" fill="#fff"/>`; }
      this.Lm = layer(root, 0.08, mt);
      // 远处的城堡与山崖
      let cs = `<path d="M1150,760L1190,520L1240,470L1300,430L1480,420L1560,470L1610,560L1650,760Z" fill="#8f86b8" stroke="${OL}" stroke-width="3"/><path d="M1190,520L1250,600L1230,700M1560,470L1520,560L1560,680" stroke="#6d6396" stroke-width="5" fill="none"/>`;
      const tower = (x, y, w, h, c) => `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" fill="#f3ead2" stroke="${OL}" stroke-width="3"/><path d="M${x - w / 2 - 8},${y - h}L${x},${y - h - w * 1.5}L${x + w / 2 + 8},${y - h}Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><path d="M${x},${y - h - w * 1.5}v-26" stroke="${OL}" stroke-width="2.5"/><path d="M${x},${y - h - w * 1.5 - 26}l24,7l-24,7Z" fill="#e8473c" stroke="${OL}" stroke-width="2"/><rect x="${x - 5}" y="${y - h + 20}" width="10" height="18" rx="5" fill="#3a2a5e"/>`;
      cs += `<rect x="1290" y="330" width="200" height="100" fill="#f3ead2" stroke="${OL}" stroke-width="3"/>` + Array.from({ length: 9 }, (_, i) => `<rect x="${1290 + i * 23}" y="318" width="14" height="14" fill="#f3ead2" stroke="${OL}" stroke-width="2.5"/>`).join('');
      cs += tower(1290, 430, 50, 170, '#3d6fd1') + tower(1490, 430, 50, 150, '#3d6fd1') + tower(1390, 330, 64, 110, '#2f5ab8') + tower(1340, 330, 34, 70, '#e8473c') + tower(1440, 330, 34, 80, '#e8473c');
      cs += `<path d="M1365,430V395A25,25 0 0 1 1415,395V430Z" fill="#3a2a5e"/>`;
      this.Lk = layer(root, 0.12, cs);
      let hl = '';
      for (let j = 0; j < 2; j++) {
        let d = `M-300,900`; for (let x = -300; x <= 3300; x += 150) d += `Q${x + 75},${740 + j * 60 - 40 - R() * 50} ${x + 150},${760 + j * 60 + R() * 20}`; d += `V1300H-300Z`;
        hl += `<path d="${d}" fill="${j ? '#74c255' : '#97d873'}" stroke="${OL}" stroke-width="2.5"/>`;
        for (let i = 0; i < 16; i++) { const x = -200 + i * 220 + R() * 90, y = 770 + j * 60 + R() * 20; hl += `<path d="M${x},${y}v-24" stroke="${OL}" stroke-width="4"/><circle cx="${x}" cy="${y - 40}" r="${20 + R() * 10}" fill="${j ? '#3f9a3a' : '#5bb048'}" stroke="${OL}" stroke-width="2.5"/>`; }
      }
      this.Lh = layer(root, 0.28, hl);
      // 近景地形：路、悬崖、山谷湖泊、对岸、城门
      const S6 = SCR(6), GX = PX + S6;
      this.gateX = GX;
      let nr = '';
      nr += `<path d="M-900,${GY - 14}H1500V1500H-900Z" fill="#6cc04e" stroke="${OL}" stroke-width="3"/>`;
      nr += `<path d="M-900,${GY + 30}H1500L1490,1500H-900Z" fill="#c99a63"/><path d="M-900,${GY + 90}H1496M-900,${GY + 170}H1492M-900,${GY + 260}H1488" stroke="#a87a48" stroke-width="5"/>`;
      nr += `<path d="M1500,${GY - 14}L1530,${GY + 60}L1510,${GY + 160}L1540,${GY + 260}L1520,1500H1490V${GY - 14}Z" fill="#a98a6a" stroke="${OL}" stroke-width="3"/>`;
      nr += `<rect x="-900" y="${GY - 6}" width="2400" height="24" fill="#e8c890"/><path d="M-900,${GY - 6}H1500M-900,${GY + 18}H1500" stroke="#b8925a" stroke-width="3"/>`;
      // 山谷：草地+湖
      nr += `<path d="M1520,1140H3000V1500H1520Z" fill="#7ccc5a" stroke="${OL}" stroke-width="3"/><path d="M1660,1152Q2280,1132 2880,1152L2900,1500H1640Z" fill="url(#s03lake)" stroke="${OL}" stroke-width="3"/>`;
      for (let i = 0; i < 18; i++) { const x = 1700 + R() * 1100, y = 1180 + R() * 120; nr += `<path d="M${f1(x)},${f1(y)}h${f1(40 + R() * 60)}" stroke="#d8f4ff" stroke-width="4" stroke-linecap="round"/>`; }
      for (let i = 0; i < 7; i++) { const x = 1720 + R() * 1000, y = 1200 + R() * 80; nr += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="18" ry="7" fill="#4fae4a" stroke="${OL}" stroke-width="2"/><circle cx="${f1(x + 6)}" cy="${f1(y - 4)}" r="5" fill="#ff8ab8"/>`; }
      // 对岸
      nr += `<path d="M2900,1500V1150Q2990,1120 3040,${GY + 40}Q3070,${GY - 14} 3120,${GY - 14}H6200V1500Z" fill="#6cc04e" stroke="${OL}" stroke-width="3"/><path d="M3100,${GY + 30}H6200V1500H3000Z" fill="#c99a63"/>`;
      nr += `<rect x="3080" y="${GY - 6}" width="3200" height="24" fill="#e8c890"/><path d="M3080,${GY - 6}H6200M3080,${GY + 18}H6200" stroke="#b8925a" stroke-width="3"/>`;
      // 花草与石头
      for (let i = 0; i < 40; i++) { let x = -800 + R() * 6800; if (x > 1460 && x < 3100) continue; const fy = GY - 16; nr += `<path d="M${f1(x)},${fy}l-6,-16M${f1(x)},${fy}l6,-18M${f1(x)},${fy}l0,-20" stroke="#3f9a3a" stroke-width="3"/>${R() < .5 ? `<circle cx="${f1(x)}" cy="${fy - 22}" r="6" fill="${['#ff5a7a', '#ffd21a', '#ffffff'][i % 3]}" stroke="${OL}" stroke-width="1.5"/>` : ''}`; }
      // 里程碑：木牌 No.03
      nr += `<g transform="translate(1180,${GY - 10})"><path d="M0,0V-120" stroke="${OL}" stroke-width="10"/><path d="M0,0V-120" stroke="#9a6a3a" stroke-width="6"/><path d="M-80,-200H70L100,-165L70,-130H-80Z" fill="#c8894a" stroke="${OL}" stroke-width="3.5"/><text x="5" y="-152" text-anchor="middle" font-family="'Uncial Antiqua','Trajan Pro 3',serif" font-size="34" fill="#3b2a1e">No.03</text><path d="M-70,-140H60" stroke="${OL}" stroke-width="1.5" opacity=".5"/></g>`;
      // 城门（出口画框）
      nr += `<g transform="translate(${GX},${GY + 30})">
        <rect x="-420" y="-640" width="140" height="640" fill="#efe2c4" stroke="${OL}" stroke-width="3.5"/><rect x="280" y="-640" width="140" height="640" fill="#efe2c4" stroke="${OL}" stroke-width="3.5"/>
        <path d="M-436,-640L-350,-800L-264,-640Z M264,-640L350,-800L436,-640Z" fill="#3d6fd1" stroke="${OL}" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M-350,-800v-34l34,10l-34,10M350,-800v-34l34,10l-34,10" fill="#e8473c" stroke="${OL}" stroke-width="2.5"/>
        <path d="M-290,0V-260A290,290 0 0 1 290,-260V0H280V-260A280,280 0 0 0 -280,-260V0Z" fill="#efe2c4"/>
        <path d="M-300,0V-560H300V0H280V-260A280,280 0 0 0 -280,-260V0Z" fill="#efe2c4" stroke="${OL}" stroke-width="3.5"/>
        ${Array.from({ length: 11 }, (_, i) => `<rect x="${-300 + i * 55}" y="-590" width="34" height="30" fill="#efe2c4" stroke="${OL}" stroke-width="3"/>`).join('')}
        ${Array.from({ length: 9 }, (_, i) => `<path d="M${-240 + i * 60},-500V-470" stroke="${OL}" stroke-width="2" opacity=".35"/>`).join('')}
        <path d="M-280,-260A280,280 0 0 1 280,-260" fill="none" stroke="url(#s03gold)" stroke-width="12"/>
        <g stroke="#5a4a3a" stroke-width="7">${Array.from({ length: 9 }, (_, i) => `<path d="M${-220 + i * 55},-520V-${470 - Math.abs(4 - i) * 6}"/>`).join('')}</g>
        <path d="M-130,-600H130L110,-560H-110Z" fill="#2c4a9a" stroke="${OL}" stroke-width="3"/><text x="0" y="-568" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="28" fill="#ffe68a">晨风城</text>
        ${[-360, 360].map(x => `<rect x="${x - 14}" y="-420" width="28" height="44" rx="14" fill="#3a2a5e"/><rect x="${x - 14}" y="-260" width="28" height="44" rx="14" fill="#3a2a5e"/>`).join('')}</g>`;
      this.Ln = layer(root, 1, nr);
      // 鹈鹕
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s03(); this.pg.appendChild(this.pel.g);
      // 金色通栏字幕
      this.band = mk('g', { 'clip-path': 'url(#s03bandc)' }, root);
      this.band.innerHTML = `<rect x="0" y="948" width="1920" height="84" fill="url(#s03band)"/><path d="M0,948H1920M0,1032H1920" stroke="#7a4a10" stroke-width="4"/><path d="M0,956H1920M0,1024H1920" stroke="#fff2b0" stroke-width="2"/>
        <text x="960" y="1004" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="42" letter-spacing="6" fill="#4a2c10">✦ 第三章 · 乘风越过晨风之湖 ✦</text>
        <text x="960" y="1024" text-anchor="middle" font-family="'Trajan Pro 3'" font-size="12" letter-spacing="8" fill="#7a4a10">CHAPTER III · OVER THE LAKE OF MORNING WIND</text>`;
      this.bc = q(DEFS, '#s03bandc .bc');
      // 界面：金色雕花边框、元素徽章
      let ui = `<rect x="30" y="30" width="1860" height="1020" fill="none" stroke="url(#s03gold)" stroke-width="6"/><rect x="42" y="42" width="1836" height="996" fill="none" stroke="#a8701c" stroke-width="1.5" opacity=".8"/>`;
      ui += corner(30, 30, 1, 1) + corner(1890, 30, -1, 1) + corner(30, 1050, 1, -1) + corner(1890, 1050, -1, -1);
      ui += `<g transform="translate(1590,80)"><rect x="-20" y="-28" width="270" height="70" rx="14" fill="#2c4a9a" fill-opacity=".8" stroke="url(#s03gold)" stroke-width="4"/>`;
      ['fire', 'water', 'wind', 'bolt'].forEach((k, i) => { ui += `<g transform="translate(${22 + i * 60},7)"><circle r="23" fill="#fffbea" stroke="url(#s03gold)" stroke-width="4"/>${ELEM[k]}</g>`; });
      ui += `</g><g transform="translate(90,80)"><rect x="0" y="-20" width="300" height="56" rx="12" fill="#2c4a9a" fill-opacity=".8" stroke="url(#s03gold)" stroke-width="4"/><text x="20" y="18" font-family="'Source Han Serif CN'" font-weight="900" font-size="24" fill="#ffe68a">Lv.3 鹈鹕骑士</text><rect x="190" y="2" width="90" height="12" rx="6" fill="#1a2a5a"/><rect x="190" y="2" width="70" height="12" rx="6" fill="#4fd06a"/></g>`;
      this.ui = mk('g', {}, root); this.ui.innerHTML = ui;
      // 标题：缎带
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g class="rb"><path d="M-470,-30L-520,-30L-490,10L-520,50L-430,50Z" fill="#1e3576" stroke="${OL}" stroke-width="3"/><path d="M470,-30L520,-30L490,10L520,50L430,50Z" fill="#1e3576" stroke="${OL}" stroke-width="3"/>
        <path d="M-450,-58H450V36H-450Z" fill="#2c4a9a" stroke="url(#s03gold)" stroke-width="6"/><path d="M-440,-48H440V26H-440Z" fill="none" stroke="#a8701c" stroke-width="1.5"/>
        <text x="0" y="8" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="62" letter-spacing="10" fill="url(#s03gold)" stroke="#3b2a1e" stroke-width="2" paint-order="stroke">奇幻冒险金饰风</text>
        <text x="0" y="76" text-anchor="middle" font-family="'Trajan Pro 3'" font-weight="700" font-size="26" letter-spacing="10" fill="#ffe68a" stroke="#3b2a1e" stroke-width="4" paint-order="stroke">FANTASY ADVENTURE</text>
        <path d="M-260,92H-40M40,92H260" stroke="url(#s03gold)" stroke-width="3"/><rect x="-8" y="84" width="16" height="16" transform="rotate(45,0,92)" fill="#e8473c" stroke="${OL}" stroke-width="2"/></g>`;
      this.rb = q(this.title, '.rb');
    },
    tau(lt) { return lt < 2.05 ? lt : lt < 4.05 ? 2.05 : lt - 2; },
    update(lt) {
      const s = SCR(lt), cy = camYf(lt);
      const lay = [[this.Lc, .05, .05], [this.Lm, .08, .12], [this.Lk, .12, .2], [this.Lh, .28, .45], [this.Ln, 1, 1]];
      for (const [l, p, py] of lay) l.g.setAttribute('transform', `translate(${f1(-s * p)},${f1(-cy * py)})`);
      const glide = ss(2.0, 2.22, lt) * (1 - ss(4.08, 4.3, lt));
      const h = 70 * ss(2.0, 2.45, lt) * (1 - ss(3.2, 4.1, lt)) + Math.sin(lt * 4) * 8 * glide;
      const rot = glide * (3 + Math.sin(lt * 3) * 2);
      this.pel.update(this.tau(lt), s, { lt, glide, wind: 1 + glide * 1.5 });
      at(this.pg, { transform: `translate(${PX},${f1(GY - cy - h)}) rotate(${f2(rot)})` });
      // 通栏字幕
      const bk = eo(inv(2.4, 2.85, lt)) * (1 - eo(inv(4.2, 4.5, lt)));
      at(this.bc, { x: f1(960 - 960 * bk), width: f1(1920 * bk) });
      vis(this.band, bk > 0.001);
      // 标题
      const ti = eob(inv(0.15, 0.55, lt)), to = inv(2.1, 2.4, lt);
      vis(this.title, ti > 0 && to < 1);
      at(this.rb, { transform: `translate(960,${f1(150 - to * 260)}) scale(${f2(ti)},1)` });
      op(this.ui, ss(0.25, 0.6, lt));
    },
    openD(lt, cx) {
      const by = GY + 30;
      return `M${f1(cx - 280)},${by}V${by - 260}A280,280 0 0 1 ${f1(cx + 280)},${by - 260}V${by}Z`;
    },
    exitFx: {
      win: [-0.05, 0.9],
      build(g) {
        let s = `<g class="cst">`;
        const tw = (x, y, w, h) => `<rect x="${x - w / 2}" y="${y - h}" width="${w}" height="${h}" class="cw" fill="#f3ead2"/><path class="cr" d="M${x - w / 2 - 8},${y - h}L${x},${y - h - w * 1.5}L${x + w / 2 + 8},${y - h}Z" fill="#3d6fd1" style="transform-origin:${x}px ${y - h}px"/>`;
        s += tw(1260, 800, 120, 330) + tw(1640, 800, 120, 300) + tw(1450, 800, 200, 420);
        s += `<rect class="cw" x="1260" y="560" width="380" height="240" fill="#f3ead2"/></g>`;
        s += `<rect class="pa" fill="#ffffff" stroke="#e9b949" stroke-width="6"/><rect class="pb" fill="#ffffff" stroke="#e9b949" stroke-width="6"/>`;
        g.innerHTML = s;
        this.cst = q(g, '.cst'); this.cw = qa(g, '.cw'); this.cr = qa(g, '.cr'); this.pa = q(g, '.pa'); this.pb = q(g, '.pb');
      },
      update(u) {
        const k = eio(clamp(u / 0.55));
        // 城堡褪成白色校舍：尖顶压平，石墙变白
        op(this.cst, (u < 0 ? inv(-0.05, 0, u) : 1) * (1 - ss(0.35, 0.75, u)));
        this.cr.forEach(e => e.style.transform = `scaleY(${f2(1 - k)})`);
        const col = `rgb(${Math.round(lerp(243, 255, k))},${Math.round(lerp(234, 255, k))},${Math.round(lerp(210, 255, k))})`;
        this.cw.forEach(e => e.setAttribute('fill', col));
        // 金色雕花边框收成两块圆角半透明面板
        const A = [30, 30, 930, 1020], PA = [56, 56, 440, 132], PB = [1424, 56, 440, 96];
        const ra = A.map((v, i) => lerp(v, PA[i], k)), rb = [lerp(960, PB[0], k), lerp(30, PB[1], k), lerp(930, PB[2], k), lerp(1020, PB[3], k)];
        const st = `rgb(${Math.round(lerp(233, 150, k))},${Math.round(lerp(185, 205, k))},${Math.round(lerp(73, 255, k))})`;
        const o = 1 - ss(0.5, 0.8, u);
        for (const [e, r] of [[this.pa, ra], [this.pb, rb]]) at(e, { x: f1(r[0]), y: f1(r[1]), width: f1(r[2]), height: f1(r[3]), rx: f1(k * 24), 'fill-opacity': f2(k * .6), stroke: st, 'stroke-width': f1(lerp(6, 2, k)), opacity: f2(o) });
      }
    }
  });
})();

/* ---------------- No.04 清爽蓝白校园风 ---------------- */
(function () {
  const LN = '#5b6b88', BL = '#3aa0ff', NAVY = '#1f3550';
  PELICANS.s04 = () => {
    const p = makePelican({
      line: LN, lw: 2.4, body: '#ffffff', wing: '#f4f8fd', beak: '#ffb54a', pouch: '#ffd690', eye: NAVY,
      shade: { body: ['#e3eefa', 7, -9], neck: ['#e3eefa', 5, -3], head: ['#e3eefa', 4, -4], wing: ['#dfe9f6', 4, -5] },
      leg: '#ffa04a', legFar: '#e08a3a', legW: 8, tire: '#44516a', tireW: 6, spoke: '#9fb2c8', spokeW: 1.2, spokes: 18,
      frame: '#ffffff', frameW: 8, frameUnder: LN, frameUnderW: 1.6, frameLine: BL, frameLineW: 2.5, saddle: NAVY, bar: LN, crank: LN, hub: BL, fish: '#7fc8ff',
      eyeMk: () => `<circle cx="${PEYE[0]}" cy="${PEYE[1]}" r="5.2" fill="${NAVY}"/><circle cx="${PEYE[0] + 1.6}" cy="${PEYE[1] - 1.8}" r="1.8" fill="#fff"/>`,
      top: `<g class="halo"><ellipse cx="0" cy="0" rx="40" ry="11" fill="none" stroke="#ffffff" stroke-width="10" opacity=".8"/><ellipse cx="0" cy="0" rx="40" ry="11" fill="none" stroke="#1f9bff" stroke-width="4"/>
        <path d="M-40,0l-14,-4M40,0l14,-4M0,-11l0,-12M-24,-9l-5,-9M24,-9l5,-9" stroke="#5cc4ff" stroke-width="3" stroke-linecap="round"/><circle cx="0" cy="-27" r="4" fill="#bfe8ff"/></g>`
    });
    const halo = q(p.g, '.halo');
    p.onUpdate = (ps, tau, roll, opt) => { halo.setAttribute('transform', `translate(40,${f1(-414 + ps.bob + Math.sin(tau * 3.2) * 4)}) rotate(-6)`); };
    return p;
  };
  function student(i) {
    const R = rng(400 + i * 17);
    const hair = ['#2a2a38', '#ff9ac0', '#f2d27a', '#7ab8ff', '#f4f4f8', '#a0603a', '#c8a0ff'][i % 7];
    const halo = ['#ff8ab8', '#5cc4ff', '#ffd25a', '#8fe0a8', '#c8a0ff'][i % 5];
    const skirt = i % 3 === 0;
    return `<g class="st"><g class="stb">
      <path d="M-18,-70L18,-70L${skirt ? 26 : 16},${skirt ? -28 : 0}L${skirt ? -26 : -16},${skirt ? -28 : 0}Z" fill="${skirt ? '#2f4a7a' : '#2f4a7a'}"/>${skirt ? `<path d="M-12,-28V0M12,-28V0" stroke="#f0d8c8" stroke-width="8"/>` : ''}
      <path d="M-20,-122Q0,-128 20,-122L22,-66H-22Z" fill="#fff" stroke="${LN}" stroke-width="2"/><path d="M-6,-120L0,-104L6,-120" fill="${BL}"/>
      <circle cx="0" cy="-142" r="20" fill="#ffe8da" stroke="${LN}" stroke-width="2"/>
      <path d="M-22,-138C-24,-168 24,-168 22,-138C${skirt ? '26,-110 18,-100 16,-120' : '22,-144 18,-150 14,-146'}C8,-156 -8,-156 -14,-146C${skirt ? '-18,-100 -26,-110 -22,-138' : '-18,-150 -22,-144 -22,-138'}Z" fill="${hair}" stroke="${LN}" stroke-width="2"/>
      <ellipse cx="0" cy="-176" rx="16" ry="5" fill="none" stroke="${halo}" stroke-width="3.5"/>
      <g class="arm"><path d="M14,-114L34,-150" stroke="#fff" stroke-width="10" stroke-linecap="round"/><path d="M14,-114L34,-150" stroke="${LN}" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><rect x="24" y="-182" width="22" height="34" rx="4" fill="#33405a" transform="rotate(-10,35,-165)"/><rect x="27" y="-178" width="16" height="26" rx="2" fill="#bfe8ff" transform="rotate(-10,35,-165)"/><g class="flash" opacity="0"><path d="M36,-170l6,-24l6,24l24,6l-24,6l-6,24l-6,-24l-24,-6Z" fill="#fff"/><circle cx="42" cy="-164" r="26" fill="#fff" opacity=".5"/></g></g></g></g>`;
  }
  SCENES.push({
    key: 's04', zh: '清爽蓝白校园风', en: 'Bright Campus',
    build(root) {
      def(`<linearGradient id="s04sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc2ff"/><stop offset=".5" stop-color="#bfe6ff"/><stop offset=".8" stop-color="#eef9ff"/></linearGradient>
        <linearGradient id="s04beam" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <filter id="s04soft" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#2a5a8a" flood-opacity=".18"/></filter>`);
      const R = rng(404);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s04sky)"/>${[0, 1, 2].map(i => `<path d="M${-200 + i * 260},-50L${200 + i * 300},-50L${900 + i * 300},1080L${600 + i * 260},1080Z" fill="url(#s04beam)" opacity=".35"/>`).join('')}`);
      let cl = ''; for (let i = 0; i < 6; i++) { const x = R() * 2200, y = 80 + R() * 220; cl += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(120 + R() * 120)}" ry="${f1(26 + R() * 16)}" fill="#fff" opacity=".85"/><ellipse cx="${f1(x + 60)}" cy="${f1(y - 18)}" rx="${f1(70 + R() * 50)}" ry="${f1(26)}" fill="#fff" opacity=".9"/>`; }
      this.L.push(layer(root, 0.03, cl));
      let sk = '';
      for (let i = 0; i < 18; i++) { const x = -100 + i * 150 + R() * 40, w = 70 + R() * 80, h = 200 + R() * 260; sk += `<rect x="${f1(x)}" y="${f1(720 - h)}" width="${f1(w)}" height="${f1(h)}" fill="${R() < .4 ? '#cfe6f8' : '#e6f2fb'}"/>`; for (let j = 0; j < h / 26; j++) sk += `<rect x="${f1(x + 8)}" y="${f1(720 - h + 14 + j * 26)}" width="${f1(w - 16)}" height="6" fill="#b4d4ee" opacity=".7"/>`; }
      this.L.push(layer(root, 0.08, sk));
      // 高架轻轨
      let rl = `<rect x="-400" y="520" width="4000" height="22" fill="#ffffff" stroke="#c8d8e8" stroke-width="2"/><rect x="-400" y="534" width="4000" height="4" fill="${BL}"/>`;
      for (let i = 0; i < 14; i++) rl += `<path d="M${-300 + i * 300},542L${-290 + i * 300},760H${-250 + i * 300}L${-240 + i * 300},542Z" fill="#f2f7fc" stroke="#c8d8e8" stroke-width="2"/>`;
      this.L.push(layer(root, 0.2, rl));
      this.train = mk('g', {}, root);
      let tn = ''; for (let c = 0; c < 4; c++) { const x = c * 250; tn += `<rect x="${x}" y="452" width="240" height="66" rx="${c === 0 ? 30 : 10}" fill="#fff" stroke="#b8cce0" stroke-width="2"/><rect x="${x}" y="496" width="240" height="8" fill="${BL}"/>${Array.from({ length: 5 }, (_, j) => `<rect x="${x + 22 + j * 42}" y="464" width="30" height="22" rx="4" fill="#9fd2ff"/>`).join('')}`; }
      this.train.innerHTML = tn;
      // 校舍
      let sc = '';
      const bld = (x, y, w, h) => { let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="#c8d8e8" stroke-width="2"/><rect x="${x}" y="${y}" width="${w}" height="14" fill="#e6f0f9"/>`; for (let r = 0; r < Math.floor((h - 40) / 62); r++) for (let c = 0; c < Math.floor((w - 30) / 56); c++) s += `<rect x="${x + 22 + c * 56}" y="${y + 36 + r * 62}" width="40" height="38" rx="4" fill="#a9d6fb"/><rect x="${x + 22 + c * 56}" y="${y + 36 + r * 62}" width="40" height="10" rx="3" fill="#d4ecff"/>`; return s; };
      sc += bld(420, 500, 520, 300) + bld(1180, 400, 520, 400) + bld(1980, 460, 480, 340);
      sc += `<rect x="940" y="560" width="240" height="40" fill="#fff" stroke="#c8d8e8" stroke-width="2"/><rect x="940" y="590" width="240" height="6" fill="${BL}"/><rect x="1700" y="540" width="280" height="40" fill="#fff" stroke="#c8d8e8" stroke-width="2"/><rect x="1700" y="570" width="280" height="6" fill="${BL}"/>`;
      sc += `<g class="tower"><rect x="1385" y="250" width="110" height="160" fill="#fff" stroke="#c8d8e8" stroke-width="2"/><path d="M1375,250H1505L1440,200Z" fill="${BL}"/><circle cx="1440" cy="320" r="38" fill="#fff" stroke="${NAVY}" stroke-width="4"/><path d="M1440,320V294M1440,320L1458,330" stroke="${NAVY}" stroke-width="4" stroke-linecap="round"/><path d="M1426,368H1454V392H1426Z" fill="#ffd25a"/></g>`;
      sc += `<path d="M1180,420H1700" stroke="${BL}" stroke-width="6"/><text x="1440" y="445" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="20" letter-spacing="6" fill="${NAVY}">SEIKU ACADEMY</text>`;
      this.bell = `<g class="ring" fill="none" stroke="${BL}" stroke-width="4">${[0, 1, 2].map(i => `<circle class="rg" cx="1440" cy="320" r="60"/>`).join('')}</g><text class="dd" x="1520" y="250" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="34" fill="${BL}" opacity="0">♪ 叮—咚——</text>`;
      sc += this.bell;
      this.Lb = layer(root, 0.3, sc);
      this.rings = qa(this.Lb.g, '.rg'); this.dd = q(this.Lb.g, '.dd');
      let tr = '';
      for (let i = 0; i < 14; i++) { const x = -200 + i * 300 + R() * 80; tr += `<path d="M${f1(x)},820V720" stroke="#a88a6a" stroke-width="10"/><circle cx="${f1(x)}" cy="680" r="70" fill="#a8e090"/><circle cx="${f1(x - 30)}" cy="660" r="44" fill="#c4ecb0"/><circle cx="${f1(x + 40)}" cy="700" r="40" fill="#8fd27a"/>`; }
      tr += `<rect x="-400" y="800" width="5000" height="8" fill="#fff"/>` + Array.from({ length: 70 }, (_, i) => `<rect x="${-400 + i * 70}" y="780" width="6" height="50" fill="#fff" stroke="#c8d8e8" stroke-width="1"/>`).join('');
      this.L.push(layer(root, 0.6, tr));
      // 路面、校门
      const GX = 2125;
      let rd = `<rect x="-800" y="${GY - 40}" width="6400" height="40" fill="#f4f8fb"/><rect x="-800" y="${GY}" width="6400" height="200" fill="#e3eaf1"/><rect x="-800" y="${GY + 4}" width="6400" height="70" fill="#d4eafc"/>`;
      for (let i = 0; i < 40; i++) rd += `<path d="M${-800 + i * 160},${GY + 120}h80" stroke="#fff" stroke-width="8"/>`;
      for (let i = 0; i < 12; i++) rd += `<g transform="translate(${-600 + i * 560},${GY + 40}) scale(.5)" stroke="#fff" stroke-width="7" fill="none"><circle cx="-40" cy="0" r="26"/><circle cx="40" cy="0" r="26"/><path d="M-40,0L-10,-30H24L40,0M-10,-30L0,0L24,-30"/></g>`;
      rd += `<g transform="translate(${GX},${GY - 40})"><rect x="-260" y="-250" width="56" height="250" rx="10" fill="#fff" stroke="#c8d8e8" stroke-width="2"/><rect x="204" y="-250" width="56" height="250" rx="10" fill="#fff" stroke="#c8d8e8" stroke-width="2"/><rect x="-260" y="-250" width="56" height="18" rx="6" fill="${BL}"/><rect x="204" y="-250" width="56" height="18" rx="6" fill="${BL}"/>
        <rect x="-150" y="-300" width="300" height="56" rx="28" fill="#fff" stroke="${BL}" stroke-width="4"/><text x="0" y="-262" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="28" fill="${NAVY}">晴空学园</text></g>`;
      rd += `<g transform="translate(1000,${GY - 40})"><rect x="-4" y="-150" width="8" height="150" fill="#c8d8e8"/><rect x="-74" y="-226" width="148" height="80" rx="16" fill="#fff" stroke="${BL}" stroke-width="4" filter="url(#s04soft)"/><text x="0" y="-178" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="34" fill="${BL}">No.04</text><text x="0" y="-158" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-size="14" fill="${LN}">通学路 · 400m</text></g>`;
      this.Lr = layer(root, 1, rd);
      this.gateX = GX;
      this.backS = mk('g', {}, this.Lr.g);
      let bs = ''; for (let i = 0; i < 9; i++) bs += student(i); this.backS.innerHTML = bs;
      this.bst = qa(this.backS, '.st');
      this.L.push(this.Lr);
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s04(); this.pg.appendChild(this.pel.g);
      // 前景举手机的学生
      this.front = mk('g', {}, root);
      let fs = ''; for (let i = 0; i < 3; i++) fs += student(10 + i); this.front.innerHTML = fs;
      this.fst = qa(this.front, '.st');
      // 界面面板
      this.ui = mk('g', { filter: 'url(#s04soft)' }, root);
      this.ui.innerHTML = `<g><rect x="56" y="56" width="440" height="132" rx="24" fill="#fff" fill-opacity=".62" stroke="#9cd0ff" stroke-width="2"/><rect x="56" y="84" width="8" height="76" rx="4" fill="${BL}"/>
          <text x="86" y="100" font-family="Montserrat" font-weight="800" font-size="18" letter-spacing="3" fill="${BL}">TODAY'S TASK</text><text x="86" y="140" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="30" fill="${NAVY}">今日任务：骑车上学</text>
          <rect x="86" y="158" width="380" height="10" rx="5" fill="#d8ecfc"/><rect class="pbar" x="86" y="158" width="120" height="10" rx="5" fill="${BL}"/></g>
        <g><rect x="1424" y="56" width="440" height="96" rx="24" fill="#fff" fill-opacity=".62" stroke="#9cd0ff" stroke-width="2"/><circle cx="1474" cy="104" r="22" fill="#ffd25a"/><text class="clk" x="1512" y="96" font-family="Montserrat" font-weight="800" font-size="34" fill="${NAVY}">15:59</text><text x="1512" y="126" font-family="'HarmonyOS Sans SC'" font-size="18" fill="${LN}">晴 · 放学前 1 分钟</text><rect x="1720" y="88" width="120" height="34" rx="17" fill="${BL}"/><text x="1780" y="112" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="18" fill="#fff">第 4 区</text></g>`;
      this.pbar = q(this.ui, '.pbar'); this.clockT = q(this.ui, '.clk'); this.clockS = this.clockT.nextElementSibling;
      // 消息提示
      this.toast = mk('g', { filter: 'url(#s04soft)' }, root);
      this.toast.innerHTML = `<rect x="0" y="0" width="520" height="116" rx="26" fill="#fff" fill-opacity=".92" stroke="#9cd0ff" stroke-width="2"/><rect x="22" y="22" width="72" height="72" rx="18" fill="${BL}"/><path d="M40,46h36a6,6 0 0 1 6,6v14a6,6 0 0 1 -6,6h-22l-10,9v-9h-4a6,6 0 0 1 -6,-6v-14a6,6 0 0 1 6,-6Z" fill="#fff"/>
        <text x="114" y="50" font-family="'HarmonyOS Sans SC'" font-size="20" fill="${LN}">校园通知 · 刚刚</text><text x="114" y="88" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="32" fill="${NAVY}">鹈鹕骑车来上学了</text><circle cx="494" cy="26" r="9" fill="#ff5a7a"/>`;
      // 标题卡
      this.title = mk('g', { filter: 'url(#s04soft)' }, root);
      this.title.innerHTML = `<rect x="0" y="0" width="640" height="190" rx="30" fill="#fff" fill-opacity=".8" stroke="#9cd0ff" stroke-width="2"/><rect x="40" y="36" width="150" height="36" rx="18" fill="${BL}"/><text x="115" y="61" text-anchor="middle" font-family="Montserrat" font-weight="800" font-size="18" letter-spacing="3" fill="#fff">STYLE 04</text>
        <text x="40" y="136" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="64" fill="${NAVY}">清爽蓝白校园风</text><text x="42" y="172" font-family="Montserrat" font-weight="700" font-size="24" letter-spacing="8" fill="${BL}">BRIGHT CAMPUS</text><circle cx="590" cy="54" r="14" fill="none" stroke="${BL}" stroke-width="4"/>`;
      // 出口：走廊的大窗
      this.win = mk('g', {}, root);
      this.win.innerHTML = `<rect x="-310" y="-552" width="620" height="582" rx="34" fill="#fff" stroke="#c8d8e8" stroke-width="3"/><rect x="-310" y="-552" width="620" height="582" rx="34" fill="none" stroke="${BL}" stroke-width="3" opacity=".5"/>
        <rect x="-150" y="-610" width="300" height="46" rx="23" fill="${BL}"/><text x="0" y="-578" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="24" fill="#fff">2F 走廊 · 通往樱花坡</text>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.Lb.g.setAttribute('transform', `translate(${f1(-s * 0.3)},0)`);
      at(this.train, { transform: `translate(${f1(2100 - 700 * (lt + 2.2))},0)` });
      // 放学铃
      const bl = inv(1.95, 3.2, lt);
      this.rings.forEach((r, i) => { const k = fr(bl * 2 - i * .3); at(r, { r: f1(50 + k * 150), opacity: bl > 0 && bl < 1 ? f2(1 - k) : 0 }); });
      op(this.dd, inv(1.95, 2.1, lt) * (1 - inv(3.2, 3.5, lt)));
      // 学生从校门涌出，举起手机
      this.bst.forEach((g, i) => {
        const a = 2.0 + i * 0.05, k = eo(inv(a, a + 0.5, lt));
        const tx = this.gateX - 60 + (i - 4) * 70 * k + (i % 2 ? 30 : -20) * k, ty = GY - 40 + (i % 3) * 6;
        at(g, { transform: `translate(${f1(tx)},${f1(ty)}) scale(${f2(.8 + (i % 3) * .05)})`, opacity: f2(inv(a, a + .1, lt)) });
        const arm = q(g, '.arm'), up = ss(2.45 + i * .03, 2.7 + i * .03, lt);
        arm.setAttribute('transform', `rotate(${f1((1 - up) * 70)},14,-114)`);
        const fl = q(g, '.flash');
        const ft = [2.9, 3.05, 3.2, 3.35, 3.5][i % 5] + (i > 4 ? .07 : 0);
        op(fl, bump(lt - ft, .05));
      });
      this.fst.forEach((g, i) => {
        const k = eo(inv(2.55 + i * .1, 2.9 + i * .1, lt)) * (1 - ss(3.9, 4.3, lt));
        at(g, { transform: `translate(${[300, 1480, 1780][i]},${f1(1080 + 430 - k * 340)}) scale(1.9)` });
        q(g, '.arm').setAttribute('transform', '');
        op(q(g, '.flash'), bump(lt - (3.0 + i * .17), .05));
      });
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 界面
      op(this.ui, ss(0.1, 0.5, lt));
      at(this.pbar, { width: f1(120 + 260 * ss(2.8, 4.5, lt)) });
      this.clockT.textContent = lt < 2 ? '15:59' : '16:00'; this.clockS.textContent = lt < 2 ? '晴 · 放学前 1 分钟' : '晴 · 放学铃响了';
      const tk = eob(inv(2.85, 3.15, lt)) * (1 - eo(inv(4.3, 4.6, lt)));
      at(this.toast, { transform: `translate(${f1(1920 - tk * 580)},180)`, opacity: f2(clamp(tk * 3)) });
      const ti = eo(inv(0.15, 0.5, lt)), to = inv(2.1, 2.4, lt);
      at(this.title, { transform: `translate(${f1(140 - (1 - ti) * 60)},${f1(250 + to * 40)})`, opacity: f2(ti * (1 - to)) });
      const fx = frameScreenX(lt), wk = eob(inv(3.7, 4.1, lt));
      vis(this.win, lt > 3.65);
      at(this.win, { transform: `translate(${f1(fx)},${GY + 30}) scale(1,${f2(wk)})` });
    },
    openD(lt, cx) { return rrD(cx - 280, GY + 30 - 520, 560, 520, 26); },
    exitFx: {
      win: [-0.1, 1.4],
      build(g) {
        const R = rng(45); let s = '';
        this.pet = [];
        for (let i = 0; i < 70; i++) { s += `<path d="M0,-9C7,-9 10,-2 7,4C5,8 0,10 0,7C0,10 -5,8 -7,4C-10,-2 -7,-9 0,-9Z" fill="${['#ffc0d4', '#ffb0c8', '#ffe0ea', '#ff9fbd'][i % 4]}"/>`; this.pet.push([R(), R(), R(), R()]); }
        g.innerHTML = s; this.pe = qa(g, 'path');
      },
      update(u) {
        this.pe.forEach((e, i) => {
          const p = this.pet[i], k = u + 0.1 + p[0] * .4;
          const x = (p[1] * 2300 - 200) - k * 300 + Math.sin(k * 3 + p[2] * 6) * 40, y = -40 + k * (700 + p[3] * 500) - p[0] * 300;
          at(e, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(k * 200 + p[2] * 360)}) scale(${f2(1.4 + p[3] * 1.6)})`, opacity: f2(inv(-0.1, 0.05, u) * (1 - ss(1.0, 1.4, u))) });
        });
      }
    }
  });
})();
