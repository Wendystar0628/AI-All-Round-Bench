'use strict';
/* ---------------- No.11 工业机能风 ---------------- */
(function () {
  const K = '#161616', G2 = '#3a3a3a', G4 = '#8a8a88', G6 = '#cfcfcb', YL = '#f2c200', WH = '#ecece8';
  PELICANS.s11 = () => {
    const p = makePelican({
      line: K, lw: 2.8, body: '#e6e6e2', wing: '#d6d6d2', beak: '#d8a050', pouch: '#e8c080', eye: K,
      shade: { body: ['#a8a8a4', 9, -10], neck: ['#b0b0ac', 5, -2], head: ['#b0b0ac', 4, -4], wing: ['#9a9a96', 6, -6] },
      leg: '#d88a3a', legFar: '#a86a2a', legW: 9, footLine: K, tire: K, tireW: 9, spoke: G4, spokeW: 3, spokes: 5, rimW: 3, rimC: YL,
      frame: G2, frameW: 10, frameLine: YL, frameLineW: 2, saddle: K, bar: K, crank: K, hub: YL, hubR: 8, fish: G4,
      bikeFront: `<g transform="translate(30,-118) rotate(-17)"><rect x="-26" y="-9" width="52" height="18" fill="${YL}"/><text x="0" y="5" text-anchor="middle" font-family="'Bender','Bahnschrift'" font-weight="900" font-size="13" fill="${K}">EQ-11</text></g><path d="M-74,-104l12,-20l12,20Z" fill="${YL}" stroke="${K}" stroke-width="2"/><text x="-62" y="-107" text-anchor="middle" font-family="Bahnschrift" font-weight="900" font-size="12" fill="${K}">!</text>`,
      upFront: `<path d="M-70,-262C-30,-276 10,-270 32,-250C40,-226 30,-200 12,-186L-56,-200C-70,-220 -76,-244 -70,-262Z" fill="#2e2e2e" stroke="${K}" stroke-width="2.5"/><path d="M-60,-256L22,-196M-20,-270L-36,-196" stroke="${YL}" stroke-width="7"/><rect x="-40" y="-248" width="30" height="20" fill="${G6}" stroke="${K}" stroke-width="2"/><text x="-25" y="-233" text-anchor="middle" font-family="Bahnschrift" font-weight="700" font-size="10" fill="${K}">P-11</text>
        <g class="refl" opacity="0"><path d="M-66,-238L30,-226M-64,-216L24,-206" stroke="#e8f4ff" stroke-width="6"/><path d="M-66,-238L30,-226M-64,-216L24,-206" stroke="#9ab8d0" stroke-width="2" stroke-dasharray="4 4"/></g>`,
      headExtra: `<g class="helm" opacity="0"><path d="M18,-360C18,-392 80,-392 80,-358L86,-352H14Z" fill="${YL}" stroke="${K}" stroke-width="3"/><path d="M46,-390V-354" stroke="${K}" stroke-width="2"/><rect x="40" y="-396" width="12" height="8" fill="${K}"/></g><g class="gog" opacity="0"><path d="M30,-362H76V-346H30Z" fill="#3a5a6a" stroke="${K}" stroke-width="3"/><rect x="34" y="-359" width="14" height="10" fill="#8ad0f0"/><path d="M20,-356H30" stroke="${K}" stroke-width="4"/></g>`
    });
    p.helm = q(p.g, '.helm'); p.gog = q(p.g, '.gog'); p.refl = q(p.g, '.refl');
    p.gear = (a, b, c) => { op(p.helm, a); op(p.gog, b); op(p.refl, c); };
    return p;
  };
  function arm(i) {
    return `<g class="arm"><rect x="-40" y="-20" width="80" height="40" fill="${G2}" stroke="${K}" stroke-width="3"/><rect x="-40" y="-20" width="80" height="10" fill="${YL}"/>
      <g class="a1"><rect x="-12" y="0" width="24" height="220" fill="${G6}" stroke="${K}" stroke-width="3"/><circle cy="220" r="20" fill="${G2}" stroke="${K}" stroke-width="3"/><circle cy="220" r="7" fill="${YL}"/>
      <g class="a2" transform="translate(0,220)"><rect x="-10" y="0" width="20" height="150" fill="${G6}" stroke="${K}" stroke-width="3"/><path d="M-22,150H22L16,174H8L6,160H-6L-8,174H-16Z" fill="${G2}" stroke="${K}" stroke-width="3"/><text x="16" y="60" font-family="Bahnschrift" font-weight="700" font-size="14" fill="${K}" transform="rotate(90,16,60)">ARM-0${i + 1}</text></g></g></g>`;
  }
  SCENES.push({
    key: 's11', zh: '工业机能风', en: 'Industrial Tech',
    build(root) {
      def(`<pattern id="s11haz" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="40" height="40" fill="${YL}"/><rect width="20" height="40" fill="${K}"/></pattern>
        <linearGradient id="s11sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfd0cc"/><stop offset="1" stop-color="#eeeeea"/></linearGradient>
        <filter id="s11grit" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".05 .4" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .35  0 0 0 0 .2  0 0 0 0 .1  0 0 0 1.5 -.7"/></filter>
        <radialGradient id="s11beam" cx="0" cy=".5" r="1"><stop offset="0" stop-color="#ffb020" stop-opacity=".8"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient>`);
      const R = rng(1111);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s11sky)"/>`);
      let far = '';
      for (let i = 0; i < 10; i++) { const x = -100 + i * 300; far += `<rect x="${x}" y="${420 + R() * 120}" width="${200 + R() * 80}" height="400" fill="#b4b4b0"/><rect x="${x + 40}" y="${180 + R() * 120}" width="26" height="400" fill="#a4a4a0"/><rect x="${x + 40}" y="${180 + R() * 0}" width="26" height="14" fill="${YL}" opacity=".7"/>`; }
      far += `<path d="M1500,800C1530,640 1520,520 1480,420H1700C1660,520 1650,640 1680,800Z" fill="#b8b8b4"/><path d="M200,200L200,800M120,200H620L600,230H120Z" stroke="#9a9a96" stroke-width="10" fill="#9a9a96"/>`;
      this.L.push(layer(root, 0.06, far));
      // 锈蚀钢结构、管线、混凝土
      let mid = '';
      for (let i = 0; i < 6; i++) {
        const x = -200 + i * 700;
        mid += `<rect x="${x}" y="360" width="600" height="440" fill="#a8a49c"/><rect x="${x}" y="360" width="600" height="440" filter="url(#s11grit)" opacity=".5"/>`;
        mid += `<path d="M${x},360H${x + 600}M${x},420H${x + 600}" stroke="#7a4a2a" stroke-width="16"/>`;
        for (let j = 0; j < 6; j++) mid += `<path d="M${x + j * 100},360L${x + j * 100 + 50},420L${x + j * 100 + 100},360" stroke="#8a5a34" stroke-width="7" fill="none"/>`;
        mid += `<rect x="${x + 40}" y="${520}" width="560" height="30" fill="#6a6a68"/><rect x="${x + 40}" y="${560}" width="560" height="20" fill="${YL}" opacity=".85"/>${[0, 1, 2, 3].map(j => `<rect x="${x + 60 + j * 140}" y="512" width="16" height="46" fill="#4a4a48"/>`).join('')}`;
        mid += `<g transform="translate(${x + 380},640)"><rect width="180" height="160" fill="${WH}" stroke="${K}" stroke-width="3"/><rect x="10" y="10" width="160" height="40" fill="${K}"/><text x="18" y="38" font-family="Bender,Bahnschrift" font-weight="900" font-size="22" fill="${YL}">UNIT ${11 + i}-${['A', 'B', 'C'][i % 3]}</text>${[0, 1, 2].map(j => `<circle cx="${30 + j * 30}" cy="80" r="8" fill="${['#3ac85a', YL, '#e23a2a'][j]}"/>`).join('')}<rect x="10" y="110" width="160" height="10" fill="url(#s11haz)"/></g>`;
      }
      this.L.push(layer(root, 0.35, mid));
      // 地面：混凝土 + 警示边线
      let rd = `<rect x="-800" y="${GY}" width="6400" height="200" fill="#8a8884"/><rect x="-800" y="${GY}" width="6400" height="200" filter="url(#s11grit)" opacity=".4"/><rect x="-800" y="${GY}" width="6400" height="22" fill="url(#s11haz)"/>`;
      for (let i = 0; i < 20; i++) rd += `<text x="${-700 + i * 340}" y="${GY + 120}" font-family="Bender,Bahnschrift" font-weight="900" font-size="54" fill="${WH}" opacity=".55">B-0${(i % 9) + 1} ▶</text>`;
      // 传送带（高光）
      const cx0 = PX + SPEED * 2 - 400;
      rd += `<g transform="translate(${cx0},${GY})"><rect x="0" y="-14" width="1400" height="54" rx="27" fill="#2a2a2a" stroke="${K}" stroke-width="3"/><g class="roll">${Array.from({ length: 24 }, (_, i) => `<circle cx="${30 + i * 58}" cy="13" r="18" fill="${G4}" stroke="${K}" stroke-width="2"/>`).join('')}</g><rect x="0" y="-18" width="1400" height="8" fill="${K}"/><rect x="0" y="40" width="1400" height="14" fill="url(#s11haz)"/></g>`;
      rd += `<g transform="translate(1560,${GY})"><rect x="-6" y="-170" width="12" height="170" fill="${K}"/><path d="M-90,-270H90L110,-250V-170H-110V-250Z" fill="${K}"/><text y="-210" text-anchor="middle" font-family="Bender,Bahnschrift" font-weight="900" font-size="56" fill="${YL}">No.11</text><text y="-182" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="700" font-size="16" fill="${WH}">工区 · 鹈鹕通道</text></g>`;
      this.Lr = layer(root, 1, rd);
      this.L.push(this.Lr);
      this.belt = qa(this.Lr.g, '.roll circle');
      // 龙门架与机械臂
      this.gantry = mk('g', {}, root);
      this.gantry.innerHTML = `<rect x="-200" y="40" width="2400" height="40" fill="${G2}" stroke="${K}" stroke-width="3"/><rect x="-200" y="80" width="2400" height="10" fill="url(#s11haz)"/>` + [0, 1, 2].map(i => `<g class="armw">${arm(i)}</g>`).join('') +
        `<g class="bea"><rect x="-26" y="-20" width="52" height="30" fill="${K}"/><path d="M-22,-20C-22,-56 22,-56 22,-20Z" fill="#ffb020" stroke="${K}" stroke-width="3"/><path class="bmz" d="M0,-34L600,-120L600,40Z" fill="url(#s11beam)" opacity=".6"/></g>`;
      this.arms = qa(this.gantry, '.armw'); this.bea = q(this.gantry, '.bea'); this.bmz = q(this.gantry, '.bmz');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s11(); this.pg.appendChild(this.pel.g);
      // 界面：黑白灰 + 警示黄，三角斜切框、编号、刻度、条码
      let ui = `<path d="M40,40H520L560,80V150H40Z" fill="${K}" opacity=".9"/><path d="M40,40H520L560,80" fill="none" stroke="${YL}" stroke-width="4"/>
        <text x="60" y="96" font-family="Bender,Bahnschrift" font-weight="900" font-size="40" fill="${WH}">SECTOR 11</text><text x="60" y="132" font-family="'Source Han Sans CN'" font-weight="700" font-size="20" fill="${YL}">工区 · 装备整备线 / EQUIP LINE</text>`;
      for (let i = 0; i < 60; i++) ui += `<path d="M${600 + i * 20},40v${i % 5 ? 10 : 22}" stroke="${K}" stroke-width="2"/>`;
      ui += `<text x="600" y="90" font-family="Bender" font-size="16" fill="${K}">X 0000 ——— 0600 ——— 1200</text>`;
      for (let i = 0; i < 30; i++) ui += `<path d="M1880,${200 + i * 20}h${i % 5 ? -10 : -22}" stroke="${K}" stroke-width="2"/>`;
      let bc = ''; let bx = 0; const R2 = rng(5); for (let i = 0; i < 40; i++) { const w = 2 + Math.floor(R2() * 3) * 2; if (i % 2 === 0) bc += `<rect x="${1600 + bx}" y="960" width="${w}" height="50" fill="${K}"/>`; bx += w; }
      ui += bc + `<text x="1600" y="1032" font-family="Bender" font-size="16" fill="${K}">PL-11-0472-B</text>`;
      ui += `<path d="M1560,40H1880V150H1600L1560,110Z" fill="${WH}" stroke="${K}" stroke-width="3"/><text x="1600" y="84" font-family="Bender" font-weight="900" font-size="22" fill="${K}">STATUS</text><text class="stt" x="1600" y="128" font-family="'Source Han Sans CN'" font-weight="900" font-size="30" fill="${K}">待整备</text><rect x="1790" y="60" width="70" height="70" fill="url(#s11haz)"/>`;
      ui += `<path d="M40,1040V960L80,920H300" fill="none" stroke="${K}" stroke-width="4"/><text x="60" y="1020" font-family="Bender" font-weight="700" font-size="22" fill="${K}">LOT 22 / 11</text>`;
      this.ui = mk('g', {}, root); this.ui.innerHTML = ui; this.stt = q(this.ui, '.stt');
      // 标题
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<path d="M0,0H700L760,60V200H60L0,140Z" fill="${WH}" stroke="${K}" stroke-width="5"/><rect x="0" y="0" width="34" height="200" fill="url(#s11haz)"/><text x="70" y="112" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="90" fill="${K}">工业机能风</text>
        <rect x="70" y="134" width="420" height="44" fill="${K}"/><text x="84" y="168" font-family="Bender,Bahnschrift" font-weight="900" font-size="34" letter-spacing="6" fill="${YL}">INDUSTRIAL TECH</text><text x="740" y="190" text-anchor="end" font-family="Bender" font-size="18" fill="${K}">No.11 / 22</text>`;
      // 出口：升起的安全闸门
      this.gate = mk('g', {}, root);
      this.gate.innerHTML = `<path d="M-360,40V-640H360V40H290V-560H-290V40Z" fill="${G2}" stroke="${K}" stroke-width="4"/><rect x="-360" y="-640" width="720" height="40" fill="url(#s11haz)"/><rect x="-360" y="-30" width="70" height="70" fill="url(#s11haz)"/><rect x="290" y="-30" width="70" height="70" fill="url(#s11haz)"/>
        <g class="door"><rect x="-290" y="-560" width="580" height="590" fill="#5a5a58" stroke="${K}" stroke-width="3"/>${Array.from({ length: 10 }, (_, i) => `<path d="M-290,${-500 + i * 56}H290" stroke="${K}" stroke-width="3"/>`).join('')}<rect x="-290" y="-10" width="580" height="40" fill="url(#s11haz)"/><text y="-260" text-anchor="middle" font-family="Bender" font-weight="900" font-size="60" fill="${YL}">GATE 12</text></g>
        <circle class="gl" cx="0" cy="-600" r="14" fill="#3ac85a"/>`;
      this.door = q(this.gate, '.door');
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.belt.forEach((c, i) => c.setAttribute('transform', ''));
      // 机械臂依次装备
      const tg = [2.25, 2.75, 3.25];
      this.arms.forEach((a, i) => {
        const t0 = tg[i], d = ss(t0 - .3, t0, lt) * (1 - ss(t0 + .12, t0 + .4, lt));
        const x = [PX - 60, PX + 50, PX - 30][i];
        a.setAttribute('transform', `translate(${x},80)`);
        q(a, '.a1').setAttribute('transform', `rotate(${f1(lerp(-60, [18, -6, 22][i], d))})`);
        q(a, '.a2').setAttribute('transform', `translate(0,220) rotate(${f1(lerp(70, [-36, -10, -48][i], d))})`);
        op(a, ss(1.9, 2.1, lt) * (1 - ss(3.9, 4.1, lt)));
      });
      this.pel.gear(ss(2.2, 2.3, lt), ss(2.7, 2.8, lt), ss(3.2, 3.3, lt));
      // 警示灯转一圈
      const bk = inv(3.45, 3.95, lt);
      at(this.bea, { transform: `translate(${PX + 260},80)`, opacity: f2(ss(1.9, 2.1, lt) * (1 - ss(3.95, 4.1, lt))) });
      at(this.bmz, { transform: `scale(${f2(Math.cos(bk * TAU))},1)`, opacity: bk > 0 && bk < 1 ? .7 : 0 });
      this.stt.textContent = lt < 2.2 ? '待整备' : lt < 3.4 ? '整备中…' : '整备完毕 ✓';
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${f1(GY - 14 * ss(1.95, 2.05, lt) * (1 - ss(3.95, 4.05, lt)))})` });
      const ti = eo(inv(0.15, 0.45, lt)), to = inv(1.7, 1.95, lt);
      at(this.title, { transform: `translate(${f1(140 - (1 - ti) * 900 - to * 1200)},250)` });
      const fx = frameScreenX(lt);
      vis(this.gate, lt > 3.5);
      at(this.gate, { transform: `translate(${f1(fx)},${GY + 30})` });
      this.door.setAttribute('transform', `translate(0,${f1(-560 * eio(inv(4.3, 5.4, lt)))})`);
      q(this.gate, '.gl').setAttribute('fill', lt > 5.3 ? '#3ac85a' : (Math.floor(lt * 4) % 2 ? '#ffb020' : '#e23a2a'));
    },
    openD(lt, cx) { return rectD(cx - 290, GY + 30 - 590, 580, 590); },
    oh: 590,
    exitFx: {
      win: [-0.05, 1.2],
      build(g) {
        const parts = [
          `<circle r="60" fill="#5a5a58" stroke="#161616" stroke-width="4"/><circle r="22" fill="#cfcfcb" stroke="#161616" stroke-width="4"/>${Array.from({ length: 10 }, (_, i) => `<rect x="-9" y="-76" width="18" height="20" fill="#5a5a58" stroke="#161616" stroke-width="3" transform="rotate(${i * 36})"/>`).join('')}`,
          `<rect x="-90" y="-30" width="180" height="60" fill="#3a3a3a" stroke="#161616" stroke-width="4"/><rect x="-90" y="-30" width="180" height="14" fill="#f2c200"/>`,
          `<rect x="-110" y="-16" width="220" height="32" rx="16" fill="#7a4a2a" stroke="#161616" stroke-width="4"/>`,
          `<path d="M-40,-50H40L60,0L40,50H-40L-60,0Z" fill="#8a8a88" stroke="#161616" stroke-width="4"/>`,
          `<rect x="-70" y="-50" width="140" height="100" fill="#ecece8" stroke="#161616" stroke-width="4"/>`,
          `<circle r="40" fill="#f2c200" stroke="#161616" stroke-width="4"/>`
        ];
        g.innerHTML = `<rect class="bl" width="1920" height="1080" fill="#1d4f9a"/>` + parts.map(p => `<g class="pt"><g class="so">${p}</g><g class="wl" opacity="0">${p.replace(/fill="[^"]*"/g, 'fill="none"').replace(/stroke="[^"]*"/g, 'stroke="#eaf2ff"').replace(/stroke-width="4"/g, 'stroke-width="2"')}</g></g>`).join('');
        this.pt = qa(g, '.pt'); this.bl = q(g, '.bl');
      },
      update(u) {
        const k = eio(inv(0, 0.5, u)), fl = ss(.3, .6, u), o = 1 - ss(.7, 1.15, u);
        op(this.bl, ss(0.25, 0.55, u) * (1 - ss(.55, .8, u)) * .9);
        this.pt.forEach((e, i) => {
          const a = i / 6 * TAU + .4, d = k * (380 + i * 40);
          at(e, { transform: `translate(${f1(PX + 40 + Math.cos(a) * d)},${f1(GY - 260 + Math.sin(a) * d * .6)}) rotate(${f1(k * (i % 2 ? 90 : -60))}) scale(${f2(1 + k * .6)},${f2((1 + k * .6) * (1 - fl * .85))})`, opacity: f2(o * (u < 0 ? 0 : 1)) });
          op(e.firstChild, 1 - fl); op(e.lastChild, fl);
        });
      }
    }
  });
})();

/* ---------------- No.12 蓝图工程绘图 ---------------- */
(function () {
  const BL = '#1d4f9a', WL = '#eaf2ff', FS = "'Zhuque Fangsong (technical preview)','STFangsong','FangSong',serif";
  PELICANS.s12 = () => {
    const p = makePelican({
      line: WL, lw: 2, body: 'none', wing: 'none', neck: 'none', head: 'none', beak: 'none', pouch: 'none', eye: WL,
      leg: WL, legFar: WL, legW: 2, tire: WL, tireW: 2, spoke: WL, spokeW: .8, spokes: 24, rimW: 1, rimC: WL, frame: 'none', frameW: 2, frameLine: WL, frameLineW: 2,
      saddle: 'none', saddleLine: WL, bar: WL, crank: WL, hub: 'none', fish: 'none', ringFill: 'none',
      top: `<g class="dims" stroke="${WL}" fill="${WL}" font-family="'Courier Prime',monospace" font-size="15">
        <path d="M-110,30V8M112,30V8M-110,22H112" stroke-width="1.2" fill="none"/><path d="M-110,22l12,-4v8ZM112,22l-12,-4v8Z" stroke="none"/><text x="0" y="16" text-anchor="middle" stroke="none">L = 2220</text>
        <path d="M-150,0H-170M-150,-372H-170M-160,0V-372" stroke-width="1.2" fill="none"/><path d="M-160,0l-4,-12h8ZM-160,-372l-4,12h8Z" stroke="none"/><text x="-176" y="-180" text-anchor="middle" stroke="none" transform="rotate(-90,-176,-180)">H = 3720</text>
        <path class="dpd" stroke-width="1.2" fill="none"/><text class="dpt" stroke="none">h</text>
        <circle cx="-110" cy="-60" r="70" fill="none" stroke-width=".8" stroke-dasharray="14 4 2 4"/><path d="M-200,-60H-20M-110,-150V30M22,-60H202M112,-150V30" stroke-width=".8" stroke-dasharray="14 4 2 4"/>
        <g transform="translate(150,-410)"><circle r="16" fill="none" stroke-width="1.5"/><text y="5" text-anchor="middle" stroke="none">7</text><path d="M-12,12L-80,60" stroke-width="1" fill="none"/></g>
        <g transform="translate(-180,-110)"><circle r="16" fill="none" stroke-width="1.5"/><text y="5" text-anchor="middle" stroke="none">2</text><path d="M14,8L60,40" stroke-width="1" fill="none"/></g></g>`
    });
    p.dpd = q(p.g, '.dpd'); p.dpt = q(p.g, '.dpt');
    p.onUpdate = (ps) => {
      const y = ps.p1[1];
      p.dpd.setAttribute('d', `M${f1(ps.p1[0] + 40)},0V${f1(y)}M${f1(ps.p1[0] + 30)},${f1(y)}H${f1(ps.p1[0] + 50)}`);
      at(p.dpt, { x: f1(ps.p1[0] + 46), y: f1(y / 2) });
      p.dpt.textContent = 'h=' + Math.round(-y * 10);
    };
    return p;
  };
  const BOM = [['1', '车架', '1', '铬钼钢'], ['2', '车轮', '2', '铝合金'], ['3', '链条', '1', '碳钢'], ['4', '车铃', '1', '黄铜'], ['5', '车座', '1', '皮革'], ['6', '踏板', '2', '尼龙'], ['7', '鹈鹕', '1', '材料：不详']];
  SCENES.push({
    key: 's12', zh: '蓝图工程绘图', en: 'Blueprint',
    build(root) {
      def(`<pattern id="s12g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20,0H0V20" fill="none" stroke="${WL}" stroke-width=".6" opacity=".2"/></pattern>
        <pattern id="s12G" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#s12g)"/><path d="M100,0H0V100" fill="none" stroke="${WL}" stroke-width="1.2" opacity=".32"/></pattern>
        <pattern id="s12h" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V10" stroke="${WL}" stroke-width="1.2" opacity=".7"/></pattern>
        <radialGradient id="s12v" cx=".5" cy=".45" r=".8"><stop offset=".5" stop-color="#0a2a60" stop-opacity="0"/><stop offset="1" stop-color="#0a2a60" stop-opacity=".55"/></radialGradient>`);
      const R = rng(1212);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="${BL}"/>`);
      this.L.push(layer(root, 0.5, `<rect x="-600" y="-100" width="4000" height="1300" fill="url(#s12G)"/>`));
      // 剖视图等背景图纸
      let bg = `<g fill="none" stroke="${WL}" stroke-width="1.6" opacity=".55">`;
      bg += `<g transform="translate(300,330)"><circle r="150"/><circle r="120"/><circle r="30" fill="url(#s12h)"/><circle r="50"/>${Array.from({ length: 36 }, (_, i) => `<path d="M${f1(Math.cos(i * TAU / 36) * 150)},${f1(Math.sin(i * TAU / 36) * 150)}L${f1(Math.cos(i * TAU / 36 + .05) * 168)},${f1(Math.sin(i * TAU / 36 + .05) * 168)}L${f1(Math.cos(i * TAU / 36 + .12) * 168)},${f1(Math.sin(i * TAU / 36 + .12) * 168)}L${f1(Math.cos(i * TAU / 36 + .17) * 150)},${f1(Math.sin(i * TAU / 36 + .17) * 150)}"/>`).join('')}<path d="M-200,0H200M0,-200V200" stroke-dasharray="20 5 3 5"/><text x="0" y="230" text-anchor="middle" fill="${WL}" stroke="none" font-family="${FS}" font-size="22">链轮 A–A 剖视</text></g>`;
      bg += `<g transform="translate(1000,300)"><rect x="-120" y="-60" width="240" height="120" fill="url(#s12h)"/><rect x="-120" y="-60" width="240" height="120"/><path d="M-160,0H160" stroke-dasharray="20 5 3 5"/><path d="M-120,-90V-70M120,-90V-70M-120,-80H120"/><text y="-96" text-anchor="middle" fill="${WL}" stroke="none" font-family="'Courier Prime'" font-size="18">Ø 34.9</text><text y="100" text-anchor="middle" fill="${WL}" stroke="none" font-family="${FS}" font-size="22">管材截面 B–B</text></g>`;
      bg += `<g transform="translate(1700,330)"><path d="M-160,40L-60,-60H80L160,40Z"/><circle cx="-60" cy="-60" r="10"/><circle cx="80" cy="-60" r="10"/><path d="M-200,40H200" stroke-dasharray="20 5 3 5"/><text y="90" text-anchor="middle" fill="${WL}" stroke="none" font-family="${FS}" font-size="22">车架 俯视</text></g>`;
      bg += `<g transform="translate(2400,300)"><circle r="120"/><path d="M-120,0H120M0,-120V120"/><text y="160" text-anchor="middle" fill="${WL}" stroke="none" font-family="${FS}" font-size="22">车轮 正视</text></g>`;
      bg += `</g>`;
      this.L.push(layer(root, 0.3, bg));
      // 爆炸视图（右上）
      this.expl = mk('g', {}, root);
      this.expl.innerHTML = `<g fill="none" stroke="${WL}" stroke-width="1.6"><g class="e1"><circle r="40"/><circle r="6"/></g><g class="e2"><path d="M-60,0H60M-40,0L-10,-40H40"/></g><g class="e3"><path d="${PS.saddle}" transform="translate(40,160)"/></g><g class="e4"><circle r="14"/><path d="M0,-14V-24M-8,-24H8"/></g><g class="e5"><path d="M-30,0H30M0,-10V10" /></g>
        <path class="ld" stroke-dasharray="6 6" stroke-width="1"/></g><text x="1500" y="150" font-family="${FS}" font-size="24" fill="${WL}">爆炸视图 EXPLODED VIEW</text>`;
      this.ex = [1, 2, 3, 4, 5].map(i => q(this.expl, '.e' + i)); this.ld = q(this.expl, '.ld');
      // 三视图（左上：正视/俯视）
      add(root, `<g transform="translate(160,140)" fill="none" stroke="${WL}" stroke-width="1.5" opacity=".9"><rect x="-20" y="-30" width="260" height="190" stroke-dasharray="8 6" opacity=".5"/>
        <g transform="translate(60,70)"><ellipse rx="10" ry="52"/><path d="M0,-52V-80M-24,-80H24"/><ellipse cy="-110" rx="18" ry="22"/><path d="M0,-90V-40"/></g><text x="20" y="150" fill="${WL}" stroke="none" font-family="${FS}" font-size="18">正视</text>
        <g transform="translate(170,70)"><path d="M-50,0H50M-50,-4H50M-50,4H50"/><ellipse rx="30" ry="12"/><path d="M30,0L70,-6"/></g><text x="150" y="150" fill="${WL}" stroke="none" font-family="${FS}" font-size="18">俯视</text></g>`);
      // 路面：基准线
      let rd = `<path d="M-800,${GY}H5600" stroke="${WL}" stroke-width="2.5"/>`;
      for (let i = 0; i < 220; i++) rd += `<path d="M${-800 + i * 30},${GY}l-14,16" stroke="${WL}" stroke-width="1.2" opacity=".7"/>`;
      rd += `<path d="M-800,${GY + 60}H5600" stroke="${WL}" stroke-width="1" stroke-dasharray="30 6 4 6" opacity=".6"/><text x="-700" y="${GY + 100}" font-family="${FS}" font-size="22" fill="${WL}" opacity=".7">${'基准面 A ———— 地面 ———— '.repeat(12)}</text>`;
      rd += `<g transform="translate(1480,${GY})" fill="none" stroke="${WL}" stroke-width="2"><path d="M0,0V-120"/><rect x="-80" y="-200" width="160" height="80"/><rect x="-74" y="-194" width="148" height="68" stroke-width=".8"/><text y="-150" text-anchor="middle" fill="${WL}" stroke="none" font-family="'Courier Prime'" font-weight="700" font-size="36">No.12</text><text y="-128" text-anchor="middle" fill="${WL}" stroke="none" font-family="${FS}" font-size="15">里程桩 K12+000</text></g>`;
      this.L.push(layer(root, 1, rd));
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s12(); this.pg.appendChild(this.pel.g);
      // 零件表 + 标题栏（右下）
      let tb = `<g transform="translate(1180,600)" font-family="${FS}" fill="${WL}"><g class="bom"><rect x="0" y="0" width="680" height="${44 * 8}" fill="${BL}" fill-opacity=".9" stroke="${WL}" stroke-width="2.5"/><path d="M80,0V${44 * 8}M300,0V${44 * 8}M400,0V${44 * 8}" stroke="${WL}" stroke-width="1.5"/>
        <text x="40" y="30" text-anchor="middle" font-size="22">序号</text><text x="190" y="30" text-anchor="middle" font-size="22">名称</text><text x="350" y="30" text-anchor="middle" font-size="22">数量</text><text x="540" y="30" text-anchor="middle" font-size="22">材料</text>`;
      BOM.forEach((r, i) => { tb += `<g class="row" opacity="0"><path d="M0,${44 * (i + 1)}H680" stroke="${WL}" stroke-width="1.2"/>${i === 6 ? `<rect class="hl" x="2" y="${44 * 7 + 2}" width="676" height="40" fill="${WL}" opacity=".18"/>` : ''}<text x="40" y="${44 * (i + 1) + 30}" text-anchor="middle" font-size="24">${r[0]}</text><text x="190" y="${44 * (i + 1) + 30}" text-anchor="middle" font-size="24">${r[1]}</text><text x="350" y="${44 * (i + 1) + 30}" text-anchor="middle" font-size="24">${r[2]}</text><text x="540" y="${44 * (i + 1) + 30}" text-anchor="middle" font-size="24">${r[3]}</text></g>`; });
      tb += `</g></g>`;
      this.tbg = mk('g', {}, root); this.tbg.innerHTML = tb; this.rows = qa(this.tbg, '.row'); this.bom = q(this.tbg, '.bom');
      add(root, `<rect width="1920" height="1080" fill="url(#s12v)"/>`);
      // 标题：标题栏样式
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g font-family="${FS}" fill="${WL}"><rect x="0" y="0" width="720" height="190" fill="${BL}" stroke="${WL}" stroke-width="3"/><path d="M0,120H720M500,0V190M500,60H720" stroke="${WL}" stroke-width="1.5"/>
        <text x="250" y="88" text-anchor="middle" font-size="72" letter-spacing="6">蓝图工程绘图</text><text x="250" y="166" text-anchor="middle" font-family="'Courier Prime'" font-weight="700" font-size="34" letter-spacing="10">BLUEPRINT</text>
        <text x="520" y="40" font-size="22">图号 PL-12</text><text x="520" y="100" font-size="22">比例 1:10</text><text x="520" y="166" font-size="22">第 12 张</text></g>`;
      // 出口：图纸标题栏的边框
      this.frame = mk('g', {}, root);
      this.frame.innerHTML = `<g fill="none" stroke="${WL}"><rect x="-300" y="-560" width="600" height="590" stroke-width="4"/><rect x="-330" y="-590" width="660" height="650" stroke-width="1.6"/><path d="M-330,-590L-300,-560M330,-590L300,-560M-330,60L-300,30M330,60L300,30" stroke-width="1.2"/></g>
        <g font-family="${FS}" fill="${WL}"><rect x="-330" y="-650" width="660" height="60" fill="${BL}" stroke="${WL}" stroke-width="2"/><path d="M-130,-650V-590M130,-650V-590" stroke="${WL}"/><text x="-230" y="-610" text-anchor="middle" font-size="24">图名</text><text x="0" y="-610" text-anchor="middle" font-size="24">下一张：水墨</text><text x="230" y="-610" text-anchor="middle" font-size="24">PL-13</text></g>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 爆炸视图：零件随骑行分开又合拢
      const ek = .5 + .5 * Math.sin(lt * 2);
      const base = [[1640, 300], [1700, 380], [1580, 420], [1760, 260], [1620, 220]];
      this.ex.forEach((e, i) => { const b = base[i]; e.setAttribute('transform', `translate(${f1(b[0] + (i - 2) * 40 * ek)},${f1(b[1] + (i % 2 ? 1 : -1) * 30 * ek)})`); });
      this.ld.setAttribute('d', P(base.map((b, i) => [b[0] + (i - 2) * 40 * ek, b[1] + (i % 2 ? 1 : -1) * 30 * ek])));
      // 零件表逐行列出
      this.rows.forEach((r, i) => { const a = 2.0 + i * .24; op(r, inv(a, a + .1, lt)); });
      const hl = q(this.tbg, '.hl'); if (hl) op(hl, .18 + .3 * bump(lt - 3.75, .15));
      at(this.tbg, { opacity: f2(ss(1.7, 2.0, lt) * (1 - ss(4.0, 4.25, lt))) });
      const ti = eo(inv(0.15, 0.45, lt)), to = inv(1.7, 1.95, lt);
      at(this.title, { transform: `translate(${f1(120)},${f1(820 + (1 - ti) * 300 + to * 300)})` });
      const fx = frameScreenX(lt), fk = inv(4.15, 4.6, lt);
      vis(this.frame, lt > 4.1);
      at(this.frame, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(fk) });
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 590, 600, 590); },
    oh: 590,
    exitFx: {
      win: [-0.05, 1.3],
      build(g) {
        let s = `<rect class="pp" width="1920" height="1080" fill="#f1e9d6"/>`;
        for (let i = 0; i < 7; i++) s += `<path class="ml" fill="none"/>`;
        g.innerHTML = s; this.pp = q(g, '.pp'); this.ml = qa(g, '.ml');
        const R = rng(1313);
        this.prof = this.ml.map((_, i) => { const pts = []; const ph = R() * 10; for (let x = -40; x <= 1960; x += 40) pts.push(x); return { ph, amp: 120 + i * 30 }; });
      },
      update(u) {
        const k = ss(0.05, 0.6, u), o = 1 - ss(0.8, 1.3, u);
        op(this.pp, ss(0.1, 0.45, u) * o * .85);
        this.ml.forEach((m, i) => {
          const y0 = 300 + i * 70, P0 = this.prof[i]; let d = '';
          for (let x = -40; x <= 1960; x += 40) { const h = (Math.sin(x * .004 + P0.ph) * .5 + .5) * (Math.sin(x * .011 + P0.ph * 2) * .3 + .7) * P0.amp; d += (x < -30 ? 'M' : 'L') + x + ',' + f1(y0 - h * k); }
          const c = Math.round(lerp(234, 40, k));
          at(m, { d, stroke: `rgb(${c},${Math.round(lerp(242, 40, k))},${Math.round(lerp(255, 46, k))})`, 'stroke-width': f1(lerp(1.2, 6 - i * .5, k)), opacity: f2(o * (u < 0 ? 0 : (.9 - i * .08))) });
        });
      }
    }
  });
})();
