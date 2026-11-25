'use strict';
/* ---------------- No.21 蒸汽波 ---------------- */
(function () {
  const PK = '#ff71ce', PU = '#b967ff', CY = '#01cdfe', MT = '#05ffa1';
  PELICANS.s21 = () => {
    const p = makePelican({
      line: '#7a5a8a', lw: 2.2, body: 'url(#s21mb)', wing: 'url(#s21mb2)', beak: '#f4e4ec', pouch: 'url(#s21mb)', eye: '#5a3a6a', neck: 'url(#s21mb)', head: 'url(#s21mb)',
      shade: { body: ['#e8c8f0', 9, -10], neck: ['#e8d0f4', 5, -2], wing: ['#d8c0f0', 6, -6] },
      leg: '#f0e0ec', legFar: '#c8b0d8', legW: 9, tire: CY, tireW: 3, spoke: PK, spokeW: 1.2, spokes: 16, wheelFill: 'rgba(1,205,254,.12)', frame: 'none', frameW: 3, frameLine: CY, frameLineW: 3,
      saddle: PU, bar: CY, crank: CY, hub: MT, fish: PK
    });
    return p;
  };
  SCENES.push({
    key: 's21', zh: '蒸汽波', en: 'Vaporwave',
    build(root) {
      const R = rng(2121);
      let veins = ''; for (let i = 0; i < 9; i++) { let d = `M${f1(R() * 120)},0`; for (let y = 0; y <= 120; y += 20) d += `L${f1(R() * 120)},${y}`; veins += `<path d="${d}" stroke="#9a8aa8" stroke-width="${f2(.5 + R())}" fill="none" opacity=".55"/>`; }
      def(`<linearGradient id="s21sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a0a5a"/><stop offset=".35" stop-color="${PU}"/><stop offset=".62" stop-color="${PK}"/><stop offset=".7" stop-color="#ffb3e6"/></linearGradient>
        <linearGradient id="s21sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff26a"/><stop offset=".5" stop-color="#ff9a5a"/><stop offset="1" stop-color="${PK}"/></linearGradient>
        <pattern id="s21mb" width="120" height="120" patternUnits="userSpaceOnUse"><rect width="120" height="120" fill="#f8f4f6"/>${veins}</pattern>
        <pattern id="s21mb2" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="120" height="120" fill="#eee6f0"/>${veins}</pattern>
        <linearGradient id="s21tb" x1="0" x2="1"><stop offset="0" stop-color="#000080"/><stop offset="1" stop-color="#1084d0"/></linearGradient>
        <clipPath id="s21sunc"><rect x="660" y="140" width="600" height="230"/>${Array.from({ length: 7 }, (_, i) => `<rect x="660" y="${375 + i * 24}" width="600" height="${16 - i * 2}"/>`).join('')}</clipPath>`);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s21sky)"/><circle cx="960" cy="440" r="290" fill="url(#s21sun)" clip-path="url(#s21sunc)"/>`);
      // 低多边形棕榈树、胸像、复古窗口
      let mid = '';
      const palm = (x, y, s, c) => { let o = `<path d="M${x - 8 * s},${y}L${x + 6 * s},${y - 260 * s}L${x + 16 * s},${y - 260 * s}L${x + 10 * s},${y}Z" fill="#3a1a5a"/>`; for (let i = 0; i < 7; i++) { const a = -PI + i * PI / 6 - .1; o += `<path d="M${x + 11 * s},${y - 260 * s}L${f1(x + 11 * s + Math.cos(a) * 150 * s)},${f1(y - 260 * s + Math.sin(a) * 60 * s + 60 * s)}L${f1(x + 11 * s + Math.cos(a + .25) * 90 * s)},${f1(y - 260 * s + Math.sin(a + .25) * 40 * s + 20 * s)}Z" fill="${i % 2 ? c : '#0aa88a'}"/>`; } return o; };
      for (let i = 0; i < 8; i++) mid += palm(-100 + i * 520, 780, .9 + (i % 3) * .2, MT);
      mid += `<g transform="translate(250,180)"><rect width="420" height="260" fill="#c0c0c0" stroke="#fff" stroke-width="3"/><rect x="4" y="4" width="412" height="30" fill="url(#s21tb)"/><text x="14" y="26" font-family="'MS PMincho','Courier Prime'" font-weight="700" font-size="18" fill="#fff">ＰＥＬＩＣＡＮ．ＥＸＥ</text>${['_', '□', '×'].map((t, i) => `<rect x="${328 + i * 28}" y="8" width="24" height="22" fill="#c0c0c0" stroke="#fff"/><text x="${340 + i * 28}" y="25" text-anchor="middle" font-family="Arial" font-size="16">${t}</text>`).join('')}<rect x="14" y="50" width="392" height="140" fill="#008080"/><text x="210" y="135" text-anchor="middle" font-family="'MS PMincho'" font-size="44" fill="${PK}">ペリカン</text><rect x="14" y="210" width="392" height="26" fill="#fff" stroke="#808080"/><rect class="lb" x="16" y="212" width="200" height="22" fill="#000080"/></g>`;
      mid += `<g transform="translate(1700,280)"><rect width="300" height="200" fill="#c0c0c0" stroke="#fff" stroke-width="3"/><rect x="4" y="4" width="292" height="26" fill="url(#s21tb)"/><text x="12" y="23" font-family="Arial" font-weight="700" font-size="16" fill="#fff">ＭＵＳＩＣ．ＷＡＶ</text><text x="150" y="120" text-anchor="middle" font-family="'Courier Prime'" font-size="34" fill="#000">▶ 01:29</text></g>`;
      this.L.push(layer(root, 0.15, mid));
      // 大理石胸像（点头）
      this.bust = mk('g', {}, root);
      this.bust.innerHTML = `<path d="M-170,0C-170,-80 -110,-120 -60,-130L60,-130C110,-120 170,-80 170,0Z" fill="url(#s21mb)" stroke="#9a8aa8" stroke-width="2"/><rect x="-120" y="0" width="240" height="40" fill="#e8e0ec" stroke="#9a8aa8" stroke-width="2"/><rect x="-150" y="40" width="300" height="30" fill="#f4f0f2" stroke="#9a8aa8" stroke-width="2"/>
        <g class="bh"><path d="M-40,-130V-170H40V-130Z" fill="url(#s21mb)"/><path d="M-70,-200C-80,-280 -40,-330 10,-330C70,-330 90,-280 80,-220C78,-200 90,-190 96,-176L76,-170C74,-150 60,-140 30,-142L10,-150L-20,-140C-50,-150 -66,-170 -70,-200Z" fill="url(#s21mb)" stroke="#9a8aa8" stroke-width="2"/><path d="M-70,-250C-90,-300 -40,-350 20,-340C60,-336 90,-300 84,-270C60,-300 0,-300 -30,-280Z" fill="#e8e0ec" stroke="#9a8aa8" stroke-width="2"/><path d="M30,-246q14,-6 26,0M44,-210l10,22" stroke="#9a8aa8" stroke-width="2.5" fill="none"/><rect x="18" y="-262" width="54" height="16" fill="#111"/><rect x="-6" y="-258" width="24" height="6" fill="#111"/></g>`;
      this.bh = q(this.bust, '.bh');
      // 透视网格地面
      this.floor = mk('g', {}, root);
      let fl = `<rect x="0" y="${GY - 120}" width="1920" height="${1200 - GY}" fill="#1a0838"/>`;
      for (let i = -16; i <= 16; i++) fl += `<path d="M960,${GY - 120}L${960 + i * 200},1080" stroke="${PK}" stroke-width="2.5"/>`;
      fl += `<g class="hz">${Array.from({ length: 10 }, () => `<path stroke="${PK}" stroke-width="2.5"/>`).join('')}</g><path d="M0,${GY - 120}H1920" stroke="${CY}" stroke-width="4"/>`;
      this.floor.innerHTML = fl; this.hz = qa(this.floor, '.hz path');
      add(root, `<g transform="translate(0,0)"><text x="1500" y="${GY - 20}" font-family="'MS PMincho'" font-size="40" fill="${CY}" letter-spacing="8">ｎｏ．２１</text></g>`);
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s21(); this.pg.appendChild(this.pel.g);
      this.skip = mk('g', {}, root);
      this.skip.innerHTML = `<rect width="1920" height="8" fill="#fff" opacity=".8"/><rect y="0" width="1920" height="1080" fill="${CY}" opacity=".08"/>`;
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<rect width="640" height="230" fill="#c0c0c0" stroke="#fff" stroke-width="4"/><rect x="5" y="5" width="630" height="36" fill="url(#s21tb)"/><text x="16" y="31" font-family="Arial" font-weight="700" font-size="20" fill="#fff">ＶＡＰＯＲＷＡＶＥ．ＴＸＴ</text>
        <text x="320" y="132" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="700" font-size="84" letter-spacing="40" fill="${PU}" stroke="#fff" stroke-width="3" paint-order="stroke">蒸汽波</text><text x="320" y="196" text-anchor="middle" font-family="'Times New Roman'" font-style="italic" font-size="38" letter-spacing="12" fill="#008080">Ｖａｐｏｒｗａｖｅ</text>`;
      // 出口：复古系统窗口
      this.win = mk('g', {}, root);
      this.win.innerHTML = `<path d="M-330,40V-650H330V40Z M-300,20V-580H300V20Z" fill="#c0c0c0" fill-rule="evenodd" stroke="#fff" stroke-width="4"/><rect x="-326" y="-646" width="652" height="50" fill="url(#s21tb)"/><text x="-310" y="-612" font-family="Arial" font-weight="700" font-size="24" fill="#fff">C:\\NEXT\\GLITCH.EXE</text>${['_', '□', '×'].map((t, i) => `<rect x="${206 + i * 38}" y="-640" width="34" height="34" fill="#c0c0c0" stroke="#fff" stroke-width="2"/><text x="${223 + i * 38}" y="-614" text-anchor="middle" font-family="Arial" font-weight="700" font-size="22">${t}</text>`).join('')}`;
    },
    // 跳针：2.5–3.5 之间，半拍（0.25s）的一段循环四次
    warp(lt) { if (lt >= 2.5 && lt < 3.5) return 2.5 + ((lt - 2.5) % 0.25); return lt; },
    update(lt) {
      const le = this.warp(lt);
      const s = stdScroll(le);
      scrollL(this.L, s);
      this.hz.forEach((h, j) => { const y = (GY - 120) + Math.pow((j + fr(s / 160)) / 10, 2.2) * (1200 - GY + 120); h.setAttribute('d', `M0,${f1(y)}H1920`); });
      const nod = lt >= 2.5 && lt < 3.5 ? Math.sin(((lt - 2.5) % 0.25) / 0.25 * PI) * 14 : Math.sin(le * PI * 2) * 3;
      this.bh.setAttribute('transform', `rotate(${f1(nod)},0,-150)`);
      at(this.bust, { transform: `translate(${f1(1500 - s * .5 + 300)},${GY - 130})` });
      op(this.skip, lt >= 2.5 && lt < 3.5 && ((lt - 2.5) % 0.25) < 0.03 ? 1 : 0);
      this.skip.firstChild.setAttribute('y', f1(200 + ((lt * 1000) % 600)));
      this.pel.update(le, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      const ti = eob(inv(0.15, 0.45, lt)), to = inv(1.75, 2.0, lt);
      at(this.title, { transform: `translate(${f1(140)},${f1(120)}) scale(${f2(ti * (1 - to))})` });
      const fx = frameScreenX(lt);
      vis(this.win, lt > 3.9);
      at(this.win, { transform: `translate(${f1(fx)},${GY + 30}) scale(${f2(eob(inv(3.9, 4.2, lt)))})` });
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 600, 600, 600); },
    oh: 600,
    exitFx: {
      win: [-0.1, 1.0],
      build(g) {
        let s = '';
        const col = ['#ff0000', '#00ff00', '#0000ff'];
        for (let c = 0; c < 3; c++) s += `<g class="ch" style="mix-blend-mode:screen"><path d="M-330,40V-650H330V40Z M-300,20V-580H300V20Z" fill="${col[c]}" fill-rule="evenodd" opacity=".55"/></g>`;
        for (let i = 0; i < 12; i++) s += `<rect class="sl" x="0" width="1920" fill="#fff"/>`;
        g.innerHTML = s; this.ch = qa(g, '.ch'); this.sl = qa(g, '.sl');
      },
      update(u) {
        const st = Math.floor((u + 1) * 14), j = (n) => (hash(st * 7 + n) - .5) * 2;
        const k = ss(-0.1, 0.1, u), o = 1 - ss(.6, 1.0, u);
        this.ch.forEach((c, i) => at(c, { transform: `translate(${f1(PX + j(i) * 40 * k + (i - 1) * 30 * k)},${f1(GY + 30 + j(i + 3) * 20 * k)}) scale(${f2(1 + k * .4)})`, opacity: f2(k * o) }));
        this.sl.forEach((r, i) => at(r, { y: f1(hash(st + i * 13) * 1080), height: f1(2 + hash(st + i) * 30), opacity: f2(k * o * .5 * hash(st * 3 + i)), transform: `translate(${f1(j(i + 9) * 80)},0)` }));
      }
    }
  });
})();

/* ---------------- No.22 故障艺术 ---------------- */
(function () {
  const PALG = { body: '#f0f0f0', wing: '#a0a0a8', beak: '#ff3a8a', pouch: '#ffb03a', line: '#101014', tire: '#202028', spoke: '#606070', hub: '#00ffd0', frame: '#00a0ff', leg: '#ff8a2a', legFar: '#a05a1a' };
  PELICANS.s22 = () => {
    const frames = pixelPelican(PALG, 10);
    const g = mk('g', { 'shape-rendering': 'crispEdges', filter: 'url(#s22rgb)' });
    const fg = frames.map(f => add(g, `<g>${f}</g>`));
    const o = { g, update(tau) { const k = Math.floor(fr(tau) * 4) % 4; fg.forEach((e, i) => vis(e, i === k)); } };
    return o;
  };
  SCENES.push({
    key: 's22', zh: '故障艺术', en: 'Glitch Art',
    build(root) {
      def(`<filter id="s22rgb" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/><feOffset in="r" dx="-8" dy="0" result="ro"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gg"/><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/><feOffset in="b" dx="8" dy="2" result="bo"/><feBlend in="ro" in2="gg" mode="screen" result="rg"/><feBlend in="rg" in2="bo" mode="screen"/></filter>
        <pattern id="s22noise" width="64" height="64" patternUnits="userSpaceOnUse">${(() => { const R = rng(5); let s = ''; for (let i = 0; i < 90; i++) s += `<rect x="${Math.floor(R() * 32) * 2}" y="${Math.floor(R() * 32) * 2}" width="2" height="2" fill="${['#fff', '#0f0', '#f0f', '#0ff'][i % 4]}" opacity=".5"/>`; return s; })()}</pattern>`);
      const R = rng(2222);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="#08080c"/>`);
      // 被撕成横条的“上一张画面”
      this.strips = mk('g', {}, root);
      let st = ''; this.sp = [];
      const SC = [['#ff71ce', '#b967ff'], ['#01cdfe', '#05ffa1'], ['#1a0838', '#ff71ce'], ['#2be8ff', '#08080c'], ['#fff12b', '#ff2bd6'], ['#b967ff', '#01cdfe']];
      for (let i = 0; i < 18; i++) { const y = i * 60, c = SC[i % 6]; st += `<g class="sp"><rect x="-200" y="${y}" width="2320" height="60" fill="${c[0]}" opacity=".55"/><rect x="${f1(R() * 1800)}" y="${y}" width="${f1(200 + R() * 500)}" height="60" fill="${c[1]}" opacity=".7"/></g>`; this.sp.push(R()); }
      this.strips.innerHTML = st; this.spe = qa(this.strips, '.sp');
      // 压缩色块
      this.blocks = mk('g', { 'shape-rendering': 'crispEdges' }, root);
      let bl = ''; this.bp = []; for (let i = 0; i < 40; i++) { bl += `<rect width="${32 * (1 + Math.floor(R() * 3))}" height="${32 * (1 + Math.floor(R() * 2))}"/>`; this.bp.push([R(), R(), R()]); }
      this.blocks.innerHTML = bl; this.be = qa(this.blocks, 'rect');
      add(root, `<rect width="1920" height="1080" fill="url(#s22noise)" opacity=".5"/>`);
      // 坏掉的界面元素
      let ui = `<g font-family="'JetBrains Mono','Fira Code',monospace" font-size="22" fill="#0f0">`;
      ui += `<text x="60" y="980">&gt; render(pelican) ... <tspan fill="#f0f">NaN</tspan></text><text x="60" y="1014">&gt; style = undefined // 22 / 22</text>`;
      ui += `<g transform="translate(1380,860)"><rect width="460" height="120" fill="#c0c0c0" stroke="#fff" stroke-width="3"/><rect x="4" y="4" width="452" height="28" fill="#808080"/><text x="12" y="25" fill="#fff" font-size="16">Loading frame 0x22 …</text><rect x="16" y="60" width="428" height="30" fill="#fff" stroke="#808080"/><rect x="18" y="62" width="300" height="26" fill="#000080"/><text x="330" y="84" fill="#f00" font-size="18">99%</text></g></g>`;
      ui += `<g transform="translate(1580,980)"><rect x="-30" y="-40" width="300" height="60" fill="#111" stroke="#0f0" stroke-width="2"/><text x="-14" y="0" font-family="'JetBrains Mono'" font-size="40" fill="#0f0">No.22?</text></g>`;
      this.ui = mk('g', {}, root); this.ui.innerHTML = ui;
      // 地面
      let rd = `<rect x="-800" y="${GY}" width="6400" height="200" fill="#101018"/><path d="M-800,${GY}H5600" stroke="#00ffd0" stroke-width="4"/>`;
      for (let i = 0; i < 80; i++) rd += `<rect x="${-800 + R() * 6400}" y="${GY + 10 + R() * 170}" width="${20 + R() * 120}" height="${4 + R() * 12}" fill="${['#ff2bd6', '#00ffd0', '#fff'][i % 3]}" opacity=".35"/>`;
      this.L.push(layer(root, 1, rd));
      // 残影 + 鹈鹕
      this.ghosts = mk('g', { opacity: 1 }, root);
      this.gh = [0, 1, 2, 3, 4].map(i => { const p = PELICANS.s22(); p.g.setAttribute('opacity', f2(.5 - i * .08)); this.ghosts.appendChild(p.g); return p; });
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s22(); this.pg.appendChild(this.pel.g);
      // 报错框（中间透明，鹈鹕从框里骑出来）
      this.err = mk('g', {}, root);
      this.err.innerHTML = `<path d="M-340,-470H340V40H-340Z M-320,-400V-120H320V-400Z" fill="#c0c0c0" fill-rule="evenodd" stroke="#fff" stroke-width="4"/><rect x="-336" y="-466" width="672" height="50" fill="#000080"/><text x="-320" y="-432" font-family="'Source Han Sans CN'" font-weight="700" font-size="26" fill="#fff">错误 — PELICAN.SVG</text><rect x="290" y="-460" width="40" height="38" fill="#c0c0c0" stroke="#fff" stroke-width="2"/><text x="310" y="-432" text-anchor="middle" font-family="Arial" font-weight="700" font-size="26">×</text>
        <circle cx="-270" cy="-60" r="30" fill="#e00"/><path d="M-284,-74l28,28M-256,-74l-28,28" stroke="#fff" stroke-width="7"/><text x="-220" y="-48" font-family="'Source Han Sans CN'" font-weight="900" font-size="40" fill="#000">鹈鹕无法渲染</text><text x="-220" y="-14" font-family="'JetBrains Mono'" font-size="18" fill="#333">Error 0x22: too many ways to draw</text>
        <rect x="160" y="-10" width="140" height="40" fill="#c0c0c0" stroke="#000" stroke-width="2"/><text x="230" y="18" text-anchor="middle" font-family="Arial" font-size="20">确定</text>`;
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g class="t3">${['#ff0040', '#00ff90', '#2060ff'].map((c, i) => `<g style="mix-blend-mode:screen"><text x="0" y="0" font-family="'Source Han Sans CN'" font-weight="900" font-size="130" fill="${c}">故障艺术</text><text x="4" y="80" font-family="'JetBrains Mono'" font-weight="700" font-size="52" letter-spacing="6" fill="${c}">GLITCH_ART</text></g>`).join('')}</g>`;
      this.t3 = qa(this.title, '.t3 > g');
      // 出口：另一只报错框
      this.exitBox = mk('g', {}, root);
      this.exitBox.innerHTML = `<path d="M-340,40V-660H340V40Z M-300,20V-580H300V20Z" fill="#c0c0c0" fill-rule="evenodd" stroke="#fff" stroke-width="4"/><rect x="-336" y="-656" width="672" height="56" fill="#000080"/><text x="-316" y="-618" font-family="'Source Han Sans CN'" font-weight="700" font-size="26" fill="#fff">⚠ 重置画布？ RESET.CANVAS</text>`;
    },
    // 掉帧：时间偶尔卡顿
    jit(lt) { const q = Math.floor(lt * 12); return hash(q * 1.7) < .25 ? Math.floor(lt * 4) / 4 : lt; },
    update(lt) {
      const freeze = lt > 2.6 && lt < 3.0;
      const le = freeze ? 2.6 : this.jit(lt);
      const s = stdScroll(le);
      scrollL(this.L, s);
      const q0 = Math.floor(lt * 15);
      this.spe.forEach((e, i) => e.setAttribute('transform', `translate(${f1((hash(q0 * 3 + i) - .5) * 300 * (freeze ? 0 : 1))},0)`));
      this.be.forEach((e, i) => { const p = this.bp[i], on = hash(q0 + i * 17) < .35; at(e, { x: Math.floor(p[0] * 60) * 32, y: Math.floor(p[1] * 34) * 32, fill: ['#ff2bd6', '#00ffd0', '#fff12b', '#2060ff', '#111'][Math.floor(hash(q0 * 2 + i) * 5)], opacity: on ? .75 : 0 }); });
      const jx = (hash(q0 * 5) - .5) * 14;
      this.pel.update(le);
      at(this.pg, { transform: `translate(${f1(PX + (hash(q0) < .2 ? jx : 0))},${GY})` });
      // 残影一串
      const gk = ss(2.0, 2.2, lt) * (1 - ss(3.8, 4.0, lt));
      this.gh.forEach((p, i) => { p.update(le - (i + 1) * .12); at(p.g, { transform: `translate(${f1(PX - (i + 1) * 70 * gk)},${GY})`, opacity: f2(gk * (.55 - i * .1)) }); });
      // 报错框：随世界滚动，鹈鹕从框里骑出来
      const ek = lt > 2.6 ? 1 : 0, eo2v = 1 - ss(4.0, 4.2, lt);
      vis(this.err, lt > 2.6 && lt < 4.2);
      const ex = PX + 40 - (lt > 3.0 ? stdScroll(lt) - stdScroll(3.0) : 0);
      at(this.err, { transform: `translate(${f1(ex)},${GY - 60}) scale(${f2(eob(inv(2.6, 2.75, lt)))})`, opacity: f2(eo2v) });
      const ti = ss(0.15, 0.3, lt) * (1 - ss(1.7, 1.9, lt));
      this.t3.forEach((t, i) => t.setAttribute('transform', `translate(${f1(130 + (hash(q0 + i) - .5) * 24)},${f1(230 + (i - 1) * 4)})`));
      op(this.title, ti * (hash(q0 * 9) < .1 ? .3 : 1));
      const fx = frameScreenX(lt);
      vis(this.exitBox, lt > 4.1);
      at(this.exitBox, { transform: `translate(${f1(fx + (hash(q0 * 4) < .15 ? jx * 2 : 0))},${GY + 30})` });
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 600, 600, 600); },
    oh: 600,
    exit(u, X) {
      // 穿过报错框：碎片在强拍上收拢、归位，回到空白画布
      if (u < 0) { X.clipD(this.openD(6 + u, frameScreenX(6 + u))); return; }
      X.clipD(`M0,0Z`);
      if (u > 0.5) { X.none(); X.hideA(); }
    },
    exitFx: {
      win: [0, 0.75],
      build(g) {
        let s = `<rect class="bg" width="1920" height="1080" fill="#f8f5ed" opacity="0"/>`; this.fr = [];
        const R = rng(2223);
        for (let j = 0; j < 9; j++) for (let i = 0; i < 16; i++) { s += `<rect class="f" width="122" height="122"/>`; this.fr.push([i * 120, j * 120, R(), R(), R()]); }
        g.innerHTML = s; this.fe = qa(g, '.f'); this.bg = q(g, '.bg');
      },
      update(u) {
        const COL = ['#ff2bd6', '#00ffd0', '#fff12b', '#2060ff', '#101018', '#f0f0f0'];
        this.fe.forEach((e, i) => {
          const p = this.fr[i]; const k = eio(clamp((u - p[2] * .15) / .35));
          const sx = p[0] + (p[3] - .5) * 2400 * (1 - k), sy = p[1] + (p[4] - .5) * 1600 * (1 - k);
          const col = k > .85 ? '#f8f5ed' : COL[i % 6];
          at(e, { x: f1(sx), y: f1(sy), fill: col, transform: `rotate(${f1((1 - k) * (p[2] - .5) * 180)},${f1(sx + 60)},${f1(sy + 60)})`, opacity: f2(1 - ss(.55, .75, u)) });
        });
        op(this.bg, ss(.3, .5, u) * (1 - ss(.55, .75, u)));
      }
    }
  });
})();
