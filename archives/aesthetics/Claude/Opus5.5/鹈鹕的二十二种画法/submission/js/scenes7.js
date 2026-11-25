'use strict';
/* ---------------- No.13 水墨国风 ---------------- */
(function () {
  const INK = '#1c1c1e', PAPER = '#f1e9d6', SEAL = '#b8281e';
  PELICANS.s13 = () => {
    const p = makePelican({
      line: INK, lw: 4.2, body: '#f3ecdb', wing: 'url(#s13wash)', beak: '#d8ccb4', pouch: '#cfc6b6', eye: INK, neck: '#f3ecdb', head: '#f3ecdb',
      leg: '#3a3a3a', legFar: '#7a7a78', legW: 5, tire: INK, tireW: 5.5, spoke: 'none', spokeW: 0, spokes: 2, frame: '#2a2a2a', frameW: 4, saddle: INK, bar: INK, crank: INK, hub: INK, hubR: 4, fish: '#5a5a5a',
      wheelDeco: R => `<path d="M${R - 2},0A${R - 2},${R - 2} 0 1 1 ${f1((R - 2) * Math.cos(5.6))},${f1((R - 2) * Math.sin(5.6))}" fill="none" stroke="${INK}" stroke-width="2" opacity=".35"/>`,
      wingExtra: `<path d="M8,-258C-30,-268 -90,-256 -120,-226" stroke="${INK}" stroke-width="10" fill="none" mask="url(#s13dry)" stroke-linecap="round"/><path d="M-80,-232L-124,-214M-70,-224L-112,-204" stroke="${INK}" stroke-width="8" mask="url(#s13dry)" stroke-linecap="round"/>`
    });
    p.g.setAttribute('filter', 'url(#s13ink)');
    return p;
  };
  SCENES.push({
    key: 's13', zh: '水墨国风', en: 'Chinese Ink Painting',
    build(root) {
      def(`<filter id="s13ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="13" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4.5" xChannelSelector="R" yChannelSelector="G"/></filter>
        <filter id="s13fiber" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".02 .5" numOctaves="2" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .4  0 0 0 0 .3  0 0 0 1 -.55"/></filter>
        <filter id="s13blur" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter id="s13mist" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
        <linearGradient id="s13wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4a4c" stop-opacity=".75"/><stop offset="1" stop-color="#8a8a88" stop-opacity=".25"/></linearGradient>
        <linearGradient id="s13m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8b2a4"/><stop offset=".7" stop-color="#d8d0c0" stop-opacity=".3"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></linearGradient>
        <linearGradient id="s13m2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6e6a64"/><stop offset=".65" stop-color="#a8a298" stop-opacity=".35"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></linearGradient>
        <linearGradient id="s13m3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2c"/><stop offset=".6" stop-color="#6a6660" stop-opacity=".45"/><stop offset="1" stop-color="${PAPER}" stop-opacity="0"/></linearGradient>
        <pattern id="s13streak" width="300" height="12" patternUnits="userSpaceOnUse"><rect width="300" height="12" fill="#fff"/><rect y="3" width="300" height="2" fill="#000"/><rect x="40" y="8" width="200" height="2" fill="#000"/></pattern>
        <mask id="s13dry" maskUnits="userSpaceOnUse" x="-200" y="-400" width="400" height="300"><rect x="-200" y="-400" width="400" height="300" fill="url(#s13streak)" transform="rotate(-12)"/></mask>`);
      const R = rng(1313);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="${PAPER}"/><rect width="1920" height="1080" filter="url(#s13fiber)" opacity=".35"/>`);
      const ridge = (y0, amp, step, seed, w) => { const R2 = rng(seed); let d = `M-300,${y0 + 400}`; for (let x = -300; x <= w; x += step) { d += `L${x},${f1(y0 - (Math.sin(x * .004 + seed) * .5 + .5) * amp - R2() * amp * .35)}`; } return d + `L${w},${y0 + 400}Z`; };
      this.L.push(layer(root, 0.03, `<g filter="url(#s13blur)"><path d="${ridge(520, 260, 70, 1, 2600)}" fill="url(#s13m1)"/></g><circle cx="1500" cy="170" r="60" fill="${SEAL}" opacity=".12"/>`));
      this.L.push(layer(root, 0.08, `<g filter="url(#s13blur)"><path d="${ridge(620, 300, 60, 2, 2800)}" fill="url(#s13m2)"/></g>`));
      this.mist = mk('g', {}, root);
      this.mist.innerHTML = Array.from({ length: 6 }, (_, i) => `<ellipse class="ms" cx="0" cy="${500 + (i % 3) * 70}" rx="${300 + i * 40}" ry="40" fill="#fbf7ee" opacity=".85" filter="url(#s13mist)"/>`).join('');
      this.ms = qa(this.mist, '.ms');
      // 近山、小径、石桥、溪水
      let ns = `<g filter="url(#s13blur)"><path d="${ridge(760, 260, 50, 3, 3200)}" fill="url(#s13m3)"/></g>`;
      ns += `<path d="M300,700C600,690 800,650 1000,600C1200,560 1300,540 1500,520" stroke="#4a4844" stroke-width="5" fill="none" opacity=".5" stroke-dasharray="40 14 8 14"/>`;
      ns += `<g transform="translate(1250,760)"><path d="M-160,0A160,110 0 0 1 160,0" fill="none" stroke="${INK}" stroke-width="9"/><path d="M-180,-6H180" stroke="${INK}" stroke-width="5"/><path d="M-200,0H-160M160,0H200" stroke="${INK}" stroke-width="7"/><path d="M-130,-46V-80M-60,-76V-104M0,-84V-112M60,-76V-104M130,-46V-80" stroke="${INK}" stroke-width="3"/><path d="M-130,-80Q0,-130 130,-80" stroke="${INK}" stroke-width="3" fill="none"/></g>`;
      ns += `<path d="M700,800C900,790 1100,800 1500,790C1800,785 2200,800 2600,795" stroke="#7a7874" stroke-width="2" fill="none"/><path d="M800,820C1000,815 1300,822 1700,815" stroke="#9a9894" stroke-width="2" fill="none"/>`;
      this.L.push(layer(root, 0.3, ns));
      // 竹林
      let bb = '';
      for (let i = 0; i < 16; i++) {
        const x = -100 + i * 220 + R() * 90, h = 500 + R() * 260, c = R() < .5 ? INK : '#5a5a58';
        for (let j = 0; j < 8; j++) bb += `<path d="M${f1(x + j * 1.5)},${f1(GY - j * h / 8)}L${f1(x + (j + 1) * 1.5)},${f1(GY - (j + 1) * h / 8 + 8)}" stroke="${c}" stroke-width="${f1(11 - j * .6)}" stroke-linecap="butt"/>`;
        for (let k = 0; k < 4; k++) { const ly = GY - h * (.45 + R() * .55), lx = x + 6, side = R() < .5 ? 1 : -1; for (let m = 0; m < 3; m++) { const a = side > 0 ? 18 + m * 22 + R() * 8 : 162 - m * 22 - R() * 8; bb += `<path d="M0,0C14,-7 44,-6 70,1C44,7 16,6 0,0Z" fill="${c}" transform="translate(${f1(lx)},${f1(ly)}) rotate(${f1(a)})" opacity=".88"/>`; } }
      }
      this.L.push(layer(root, 0.7, bb));
      // 路：山间小径，近浓远淡的飞白
      let rd = `<path d="M-800,${GY + 4}C200,${GY - 6} 1200,${GY + 10} 5600,${GY}" stroke="${INK}" stroke-width="16" fill="none" mask="url(#s13road)"/><path d="M-800,${GY + 30}H5600" stroke="#5a5854" stroke-width="5" opacity=".5" stroke-dasharray="120 40 20 40"/>`;
      rd += `<g transform="translate(1620,${GY})"><path d="M-30,0Q-36,-80 -20,-120Q0,-140 20,-120Q36,-80 30,0Z" fill="#d8d0bc" stroke="${INK}" stroke-width="3"/><text x="0" y="-80" text-anchor="middle" font-family="'STXingkai','Alimama DongFangDaKai'" font-size="30" fill="${INK}" writing-mode="tb">十三</text><rect x="-10" y="-30" width="20" height="20" fill="${SEAL}"/></g>`;
      // 亭与文人
      rd += `<g transform="translate(${PX + SPEED * 2.6 + 180},${GY})"><path d="M-150,0V-200M150,0V-200" stroke="${INK}" stroke-width="8"/><path d="M-230,-200Q-150,-216 -120,-250L0,-300L120,-250Q150,-216 230,-200Q200,-208 180,-206L-180,-206Q-200,-208 -230,-200Z" fill="${INK}"/><path d="M0,-300V-330" stroke="${INK}" stroke-width="6"/>
        <path d="M-110,-20H70V-50H-110Z" fill="none" stroke="${INK}" stroke-width="4"/><path d="M-100,-50H60" stroke="#c8b898" stroke-width="10"/>
        <g class="sch"><path d="M-40,0C-50,-40 -50,-80 -30,-100L10,-100C30,-80 30,-40 20,0Z" fill="#e8e0cc" stroke="${INK}" stroke-width="3.5"/><g class="shd"><circle cx="-6" cy="-118" r="18" fill="#efe6d2" stroke="${INK}" stroke-width="3.5"/><path d="M-20,-128Q-6,-146 10,-128" fill="${INK}"/><path d="M-6,-148V-136" stroke="${INK}" stroke-width="5"/><path d="M4,-112l8,4" stroke="${INK}" stroke-width="2.5"/></g><path d="M10,-80L50,-56" stroke="${INK}" stroke-width="3"/><path d="M50,-56L64,-70" stroke="${INK}" stroke-width="2"/></g></g>`;
      this.L.push(layer(root, 1, rd));
      def(`<linearGradient id="s13rg" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient><mask id="s13road" maskUnits="userSpaceOnUse" x="-800" y="${GY - 40}" width="6400" height="80"><rect x="-800" y="${GY - 40}" width="6400" height="80" fill="url(#s13rg)"/><rect x="-800" y="${GY - 40}" width="6400" height="80" fill="url(#s13streak)" opacity=".5"/></mask>`);
      this.shd = q(this.L[this.L.length - 1].g, '.shd');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s13(); this.pg.appendChild(this.pel.g);
      // 画卷特写
      this.inset = mk('g', {}, root);
      this.inset.innerHTML = `<circle cx="0" cy="0" r="250" fill="#efe6d0" stroke="${INK}" stroke-width="6"/><circle r="236" fill="none" stroke="${INK}" stroke-width="1.5"/><g class="ipel"></g>
        <rect x="90" y="-170" width="46" height="46" fill="${SEAL}"/><text x="113" y="-138" text-anchor="middle" font-family="'STXingkai'" font-size="30" fill="#f4e8d8">鹕</text><text x="150" y="-60" font-family="'STXingkai'" font-size="34" fill="${INK}" writing-mode="tb">早已画好</text>`;
      this.ipel = PELICANS.s13(); q(this.inset, '.ipel').appendChild(this.ipel.g); this.ipel.update(.2, 0); this.ipel.g.setAttribute('transform', 'translate(-20,150) scale(.62)');
      // 标题：竖排行楷 + 印章
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<text x="0" y="0" font-family="'STXingkai','Alimama DongFangDaKai'" font-size="150" fill="${INK}" writing-mode="tb" letter-spacing="-6">水墨国风</text><rect x="-34" y="600" width="68" height="68" fill="${SEAL}"/><text x="0" y="646" text-anchor="middle" font-family="'STXingkai'" font-size="40" fill="#f4e8d8">墨</text>
        <text x="80" y="20" font-family="'Cormorant Garamond'" font-style="italic" font-size="30" fill="#4a4844" writing-mode="tb" letter-spacing="4">Chinese Ink Painting</text>`;
      // 出口：月洞门
      this.gate = mk('g', {}, root);
      this.gate.innerHTML = `<path d="M-420,40V-620H420V40Z M0,-560A280,280 0 1 0 0.1,-560Z" fill="#f6f0e2" fill-rule="evenodd" stroke="${INK}" stroke-width="4"/><path d="M-460,-620Q0,-650 460,-620L440,-660Q0,-690 -440,-660Z" fill="${INK}"/><circle cx="0" cy="-280" r="292" fill="none" stroke="#5a5854" stroke-width="10"/><text x="0" y="-588" text-anchor="middle" font-family="'STXingkai'" font-size="40" fill="${INK}">别有天</text>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.ms.forEach((m, i) => m.setAttribute('transform', `translate(${f1(((i * 520 + lt * (30 + i * 10) - s * .1) % 2600) - 300)},0)`));
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 文人抬头看鹈鹕，再低头看画卷
      const up = ss(2.05, 2.3, lt) * (1 - ss(2.75, 2.95, lt));
      this.shd.setAttribute('transform', `rotate(${f1(-28 * up + 12 * ss(2.8, 3.0, lt))},-6,-100)`);
      const ik = eo(inv(2.95, 3.25, lt)) * (1 - eo(inv(3.85, 4.1, lt)));
      vis(this.inset, ik > 0.01);
      at(this.inset, { transform: `translate(1450,330) scale(${f2(ik)})` });
      const ti = ss(0.15, 0.6, lt), to = 1 - ss(1.7, 2.0, lt);
      at(this.title, { transform: `translate(1700,120)`, opacity: f2(ti * to) });
      const fx = frameScreenX(lt);
      vis(this.gate, lt > 3.4);
      at(this.gate, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(ss(3.4, 4.0, lt)) });
    },
    openD(lt, cx) { const cy = GY + 30 - 280; return circD(cx, cy, 280); },
    exitFx: {
      win: [-0.05, 1.2],
      build(g) {
        let s = '';
        for (let i = 0; i < 4; i++) s += `<path class="wv" stroke-width="6" stroke-linejoin="round"/>`;
        g.innerHTML = s; this.wv = qa(g, '.wv');
      },
      update(u) {
        const k = ss(0, 0.45, u), c = ss(0.2, 0.55, u), o = 1 - ss(0.75, 1.2, u);
        this.wv.forEach((e, i) => {
          const base = 1080 - k * (260 - i * 50) + i * 40;
          let d = `M-40,1120L-40,${f1(base)}`;
          for (let x = -40; x <= 1980; x += 120) { const h = 60 + i * 10; d += `Q${x + 30},${f1(base - h)} ${x + 60},${f1(base - h * .4)}Q${x + 70},${f1(base - h * .9)} ${x + 50},${f1(base - h * .7)}Q${x + 90},${f1(base + 10)} ${x + 120},${f1(base)}`; }
          d += 'L1980,1120Z';
          const fill = c > .5 ? ['#1f3d7a', '#2c5aa0', '#3f74b8', '#f4ecd8'][i] : 'none';
          at(e, { d, fill, stroke: c > .5 ? '#1a2a4a' : '#1c1c1e', opacity: f2(o * (u < 0 ? 0 : 1)), transform: `translate(${f1(-u * 200 * (i + 1))},0)` });
        });
      }
    }
  });
})();

/* ---------------- No.14 浮世绘 ---------------- */
(function () {
  const IND = '#1d2a4a', PRU = '#24427a', PAP = '#efe3c6';
  PELICANS.s14 = () => {
    const p = makePelican({
      line: IND, lw: 3, body: '#f4ecd8', wing: '#3a6ab0', beak: '#e8a050', pouch: '#f2c890', eye: IND, neck: '#f4ecd8', head: '#f4ecd8',
      shade: { body: ['#b8c8dc', 8, -10], wing: ['#24427a', 6, -6], neck: ['#c8d4e2', 5, -2] },
      leg: '#d88a40', legFar: '#a86a30', legW: 8, footLine: IND, tire: IND, tireW: 7, spoke: IND, spokeW: 1.5, spokes: 12, frame: '#b8322a', frameW: 7, frameUnder: IND, frameUnderW: 1.5, saddle: IND, bar: IND, crank: IND, hub: '#e8c060', fish: '#3a6ab0',
      wingExtra: `<path d="M-10,-246C-40,-250 -76,-240 -100,-226M-14,-230C-44,-232 -72,-224 -94,-212" stroke="#f4ecd8" stroke-width="1.6" fill="none"/>`
    });
    return p;
  };
  function waveD(h, t, R) {
    // 巨浪：浪身 + 卷曲的浪头
    const bx = 1100, by = 1080;
    const top = by - h, cx = bx + 260;
    let d = `M${bx - 520},${by}C${bx - 300},${by - h * .2} ${bx - 120},${top + h * .1} ${cx - 160},${top}C${cx - 40},${top - 70} ${cx + 180},${top - 40} ${cx + 230},${top + 80}C${cx + 120},${top + 10} ${cx - 10},${top + 40} ${cx + 20},${top + 150}C${cx + 80},${by - h * .3} ${cx + 300},${by - 60} ${cx + 560},${by}Z`;
    return d;
  }
  SCENES.push({
    key: 's14', zh: '浮世绘', en: 'Ukiyo-e',
    build(root) {
      def(`<linearGradient id="s14sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PRU}"/><stop offset=".28" stop-color="#7a92b8"/><stop offset=".5" stop-color="${PAP}"/><stop offset=".72" stop-color="#f2cfae"/><stop offset="1" stop-color="${PAP}"/></linearGradient>
        <filter id="s14wood" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".003 .09" numOctaves="3" seed="14"/><feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .32  0 0 0 0 .18  0 0 0 1.3 -.55"/></filter>
        <pattern id="s14sei" width="60" height="30" patternUnits="userSpaceOnUse"><rect width="60" height="30" fill="#3f74b8"/><g fill="none" stroke="#e8eef4" stroke-width="2"><path d="M0,30A30,30 0 0 1 60,30M10,30A20,20 0 0 1 50,30M20,30A10,10 0 0 1 40,30"/><path d="M-30,15A30,30 0 0 1 30,15M30,15A30,30 0 0 1 90,15" stroke-opacity=".6"/></g></pattern>
        <pattern id="s14wl" width="40" height="16" patternUnits="userSpaceOnUse"><rect width="40" height="16" fill="${PRU}"/><path d="M0,8Q10,0 20,8T40,8" stroke="#8fb0d8" stroke-width="2" fill="none"/></pattern>`);
      const R = rng(1414);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s14sky)"/>`);
      // 富士
      this.L.push(layer(root, 0.02, `<path d="M500,700L900,330Q960,300 1020,330L1420,700Z" fill="#5a7aa8" stroke="${IND}" stroke-width="3"/><path d="M820,404L900,330Q960,300 1020,330L1100,404L1060,420L1030,392L1000,430L960,396L930,426L900,394L870,420Z" fill="#fbf6ea" stroke="${IND}" stroke-width="2.5"/>
        <path d="M200,640Q600,600 1000,640T1800,630" stroke="#f4e0c8" stroke-width="24" opacity=".7" fill="none"/><path d="M-200,560Q400,520 900,560" stroke="#f4e0c8" stroke-width="18" opacity=".6" fill="none"/>`));
      // 海（青海波）与远帆
      this.L.push(layer(root, 0.12, `<rect x="-200" y="700" width="3000" height="160" fill="url(#s14sei)"/><path d="M-200,700H2800" stroke="${IND}" stroke-width="3"/>${[0, 1, 2].map(i => `<g transform="translate(${400 + i * 700},690)"><path d="M0,0L0,-60L36,-6Z" fill="#f4ecd8" stroke="${IND}" stroke-width="2.5"/><path d="M-30,0H40L30,12H-20Z" fill="#6a4a2a" stroke="${IND}" stroke-width="2"/></g>`).join('')}`));
      // 驿道：松树、樱花
      let mid = '';
      for (let i = 0; i < 9; i++) { const x = -100 + i * 420 + R() * 80; mid += `<path d="M${x},${GY - 20}C${x + 10},${GY - 120} ${x - 20},${GY - 200} ${x + 30},${GY - 280}" stroke="#5a3a2a" stroke-width="14" fill="none"/>${[0, 1, 2].map(j => `<path d="M${x - 90 + j * 40},${GY - 230 - j * 40}Q${x + 10 + j * 20},${GY - 300 - j * 40} ${x + 120 + j * 10},${GY - 236 - j * 40}Q${x + 20},${GY - 220 - j * 40} ${x - 90 + j * 40},${GY - 230 - j * 40}Z" fill="#2f5a3a" stroke="${IND}" stroke-width="2.5"/>`).join('')}`; }
      this.L.push(layer(root, 0.55, mid));
      let rd = `<rect x="-800" y="${GY - 10}" width="6400" height="210" fill="#e2cfa0"/><path d="M-800,${GY - 10}H5600" stroke="${IND}" stroke-width="3"/>`;
      for (let i = 0; i < 70; i++) rd += `<path d="M${-800 + i * 92},${GY + 30 + (i % 3) * 30}h${30 + (i % 4) * 10}" stroke="#a88a5a" stroke-width="3"/>`;
      rd += `<g transform="translate(1600,${GY - 10})"><rect x="-26" y="-190" width="52" height="190" fill="#c8a870" stroke="${IND}" stroke-width="3"/><text x="0" y="-160" text-anchor="middle" font-family="'Shippori Mincho B1','Source Han Serif CN'" font-weight="800" font-size="34" fill="${IND}" writing-mode="tb">十四里</text></g>`;
      this.L.push(layer(root, 1, rd));
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s14(); this.pg.appendChild(this.pel.g);
      // 巨浪（前景）
      this.wave = mk('g', {}, root);
      this.wave.innerHTML = `<path class="wb" fill="url(#s14wl)" stroke="${IND}" stroke-width="4"/><path class="wf" fill="#f4f0e4" stroke="${IND}" stroke-width="3"/><g class="cl"></g>`;
      this.wb = q(this.wave, '.wb'); this.wf = q(this.wave, '.wf'); this.cl = q(this.wave, '.cl');
      this.cl.innerHTML = Array.from({ length: 14 }, () => `<path d="M0,0C-6,10 -4,24 6,30C2,22 4,12 12,8C8,16 10,26 18,30C16,18 14,6 0,0Z" fill="#f4f0e4" stroke="${IND}" stroke-width="2.5"/>`).join('');
      this.claws = qa(this.cl, 'path');
      root.insertBefore(this.wave, this.L[2].g);
      // 前景樱花枝
      add(root, `<g transform="translate(-40,-20)"><path d="M0,60C160,90 300,60 460,120M200,74C260,140 330,150 380,210" stroke="#3a2a22" stroke-width="14" fill="none"/>${Array.from({ length: 16 }, (_, i) => { const x = 60 + i * 26 + (i % 3) * 8, y = 70 + Math.sin(i) * 30 + (i > 8 ? 60 : 0); return `<g transform="translate(${x},${y})">${[0, 1, 2, 3, 4].map(j => `<ellipse cx="0" cy="-7" rx="5" ry="8" fill="#f6c4cc" stroke="${IND}" stroke-width="1.2" transform="rotate(${j * 72})"/>`).join('')}<circle r="3" fill="#c83a4a"/></g>`; }).join('')}</g>`);
      add(root, `<rect width="1920" height="1080" filter="url(#s14wood)" opacity=".45" style="mix-blend-mode:multiply"/>`);
      // 标题：竖长方形题签
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<rect x="0" y="0" width="110" height="420" fill="#f2d870" stroke="${IND}" stroke-width="4"/><rect x="8" y="8" width="94" height="404" fill="none" stroke="${IND}" stroke-width="1.5"/><text x="55" y="40" text-anchor="middle" font-family="'Shippori Mincho B1','Source Han Serif CN'" font-weight="800" font-size="76" fill="${IND}" writing-mode="tb" letter-spacing="10">浮世绘</text>
        <rect x="130" y="0" width="64" height="300" fill="#e8d8b4" stroke="${IND}" stroke-width="3"/><text x="162" y="24" text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="600" font-size="34" fill="${IND}" writing-mode="tb" letter-spacing="8">UKIYO-E</text>
        <rect x="20" y="440" width="70" height="70" fill="#c8322a"/><text x="55" y="488" text-anchor="middle" font-family="'Shippori Mincho B1'" font-weight="800" font-size="40" fill="#f4ecd8">鹕</text>`;
      // 出口：版画的边框
      this.frame = mk('g', {}, root);
      this.frame.innerHTML = `<path d="M-340,40V-630H340V40H300V-590H-300V40Z" fill="#e2cfa0" stroke="${IND}" stroke-width="4"/><path d="M-320,30V-610H320V30" fill="none" stroke="${IND}" stroke-width="1.5"/><rect x="220" y="-580" width="60" height="200" fill="#f2d870" stroke="${IND}" stroke-width="3"/><text x="250" y="-560" text-anchor="middle" font-family="'Shippori Mincho B1'" font-weight="800" font-size="32" fill="${IND}" writing-mode="tb">次之景</text>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 巨浪卷到最高，凝在半空
      const rise = eo(inv(1.6, 2.6, lt)), fall = ei(inv(3.75, 4.25, lt));
      const h = 700 * rise * (1 - fall), sway = (1 - ss(2.5, 2.65, lt) * (1 - ss(3.7, 3.8, lt))) * Math.sin(lt * 3) * 20;
      vis(this.wave, h > 5);
      if (h > 5) {
        const ox = 900 - (s - SPEED * 3.15) - 1360 + sway;
        this.wave.setAttribute('transform', `translate(${f1(ox)},0)`);
        this.wb.setAttribute('d', waveD(h));
        const top = 1080 - h, cx = 1360;
        this.wf.setAttribute('d', `M${cx - 160},${top}C${cx - 40},${top - 70} ${cx + 180},${top - 40} ${cx + 230},${top + 80}C${cx + 170},${top + 20} ${cx + 60},${top - 10} ${cx - 160},${top}Z`);
        // 浪尖的“爪”：一根根擦过鹈鹕的头顶
        this.claws.forEach((c, i) => { const t = i / 13; const x = lerp(cx - 120, cx + 240, t), y = top - 50 + Math.sin(t * PI) * -10 + t * t * 140; at(c, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(140 + t * 70)}) scale(${f2(1.4 + Math.sin(t * PI) * .6)})` }); });
      }
      const ti = ss(0.15, 0.5, lt), to = 1 - ss(1.6, 1.9, lt);
      at(this.title, { transform: `translate(1660,90)`, opacity: f2(ti * to) });
      const fx = frameScreenX(lt);
      vis(this.frame, lt > 4.1);
      at(this.frame, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(ss(4.1, 4.5, lt)) });
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 590, 600, 590); },
    oh: 590,
    exitFx: {
      win: [-0.05, 1.3],
      build(g) {
        const cols = ['#24427a', '#3f74b8', '#efe3c6', '#e2cfa0'];
        const tree = ['#2a4a4a', '#3a6a5a', '#5a8a6a', '#8ab08a'];
        let s = '';
        for (let i = 0; i < 4; i++) {
          let d = `M-60,1140V${700 + i * 90}`; const R = rng(i + 3);
          for (let x = -60; x <= 1980; x += 80) d += `Q${x + 40},${700 + i * 90 - 60 - R() * 60} ${x + 80},${700 + i * 90}`;
          d += 'L1980,1140Z';
          let dt = `M-60,1140V${700 + i * 90}`;
          for (let x = -60; x <= 1980; x += 60) dt += `L${x + 30},${700 + i * 90 - 120 - R() * 80}L${x + 60},${700 + i * 90}`;
          dt += 'L1980,1140Z';
          s += `<g class="ly" style="filter:drop-shadow(0 10px 8px rgba(0,0,0,.35))"><path class="a" d="${d}" fill="${cols[i]}"/><path class="b" d="${dt}" fill="${tree[i]}" opacity="0"/></g>`;
        }
        g.innerHTML = s; this.ly = qa(g, '.ly');
      },
      update(u) {
        const k = eio(inv(0, 0.5, u)), m = ss(0.25, 0.6, u), o = 1 - ss(0.8, 1.3, u);
        this.ly.forEach((l, i) => {
          at(l, { transform: `translate(0,${f1(k * (120 - i * 50) + 380 * (1 - (u < 0 ? 0 : 1)))}) scale(1,${f2(1 + k * .1)})`, opacity: f2(o * (u < 0 ? 0 : 1)) });
          op(l.firstChild, 1 - m); op(l.lastChild, m);
        });
      }
    }
  });
})();
