'use strict';
/* ---------------- No.17 波普艺术 ---------------- */
(function () {
  const RD = '#e8202a', YL = '#ffe21a', BL = '#1a5ae8', K = '#111111';
  function popPel(c) {
    return makePelican({
      line: K, lw: 6, body: c.body, wing: c.wing, beak: c.beak, pouch: c.pouch, eye: K, neck: c.body, head: c.body,
      shade: { body: ['url(#s17d' + c.dot + ')', 10, -12], neck: ['url(#s17d' + c.dot + ')', 6, -2], wing: ['url(#s17d' + c.dot + ')', 6, -7] },
      leg: c.leg, legFar: c.leg, legW: 10, footLine: K, tire: K, tireW: 9, spoke: K, spokeW: 3, spokes: 8, frame: c.frame, frameW: 10, frameUnder: K, frameUnderW: 3,
      saddle: K, bar: K, crank: K, hub: YL, hubR: 8, fish: BL,
      eyeMk: () => `<circle cx="48" cy="-354" r="9" fill="#fff" stroke="${K}" stroke-width="3"/><circle cx="51" cy="-354" r="4.5" fill="${K}"/>`
    });
  }
  const SCH = [
    { body: '#ffffff', wing: '#ffffff', beak: YL, pouch: RD, leg: YL, frame: BL, dot: 'b' },
    { body: '#ff6ac8', wing: '#ffe21a', beak: '#1ae8e0', pouch: '#ff3a3a', leg: '#1ae8e0', frame: '#3a1ae8', dot: 'r' },
    { body: '#1ae8e0', wing: '#ff6ac8', beak: '#ffe21a', pouch: '#e8202a', leg: '#ffe21a', frame: '#ff8a1a', dot: 'b' },
    { body: '#ffe21a', wing: '#3a8aff', beak: '#ff3a8a', pouch: '#ff8a1a', leg: '#ff3a8a', frame: '#e8202a', dot: 'r' },
    { body: '#ff8a1a', wing: '#8a3aff', beak: '#3aff8a', pouch: '#ffe21a', leg: '#3aff8a', frame: '#1a5ae8', dot: 'b' }
  ];
  PELICANS.s17 = () => popPel(SCH[0]);
  SCENES.push({
    key: 's17', zh: '波普艺术', en: 'Pop Art',
    build(root) {
      def(`<pattern id="s17db" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#cfe0ff"/><circle cx="7" cy="7" r="3.6" fill="${BL}"/></pattern>
        <pattern id="s17dr" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#ffd0d4"/><circle cx="7" cy="7" r="3.6" fill="${RD}"/></pattern>
        <pattern id="s17dy" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="18" height="18" fill="${YL}"/><circle cx="9" cy="9" r="4" fill="${RD}"/></pattern>
        <pattern id="s17dk" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#8fd0ff"/><circle cx="8" cy="8" r="5" fill="#fff"/></pattern>`);
      const R = rng(1717);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s17dk)"/>`);
      // 漫画分格的城市
      let ct = '';
      for (let i = 0; i < 16; i++) { const x = -200 + i * 220, w = 160 + R() * 60, h = 220 + R() * 300, c = [RD, YL, BL, '#fff'][i % 4]; ct += `<rect x="${f1(x)}" y="${f1(800 - h)}" width="${f1(w)}" height="${f1(h)}" fill="${c === YL ? 'url(#s17dy)' : c}" stroke="${K}" stroke-width="6"/>`; for (let j = 0; j < 5; j++) ct += `<rect x="${f1(x + 20)}" y="${f1(800 - h + 30 + j * 50)}" width="${f1(w - 40)}" height="22" fill="${c === '#fff' ? BL : '#fff'}" stroke="${K}" stroke-width="4"/>`; }
      this.L.push(layer(root, 0.15, ct));
      // 气泡与爆炸框
      let bb = '';
      const bubble = (x, y, t, c) => `<g transform="translate(${x},${y})"><path d="M-150,-60Q-150,-110 -80,-110H90Q160,-110 160,-60V-10Q160,40 90,40H-10L-60,90L-50,40H-80Q-150,40 -150,-10Z" fill="#fff" stroke="${K}" stroke-width="6"/><text y="-18" text-anchor="middle" font-family="'Alimama ShuHeiTi','Anton'" font-size="46" fill="${c}">${t}</text></g>`;
      bb += bubble(300, 260, '鹈鹕来了！', RD) + bubble(2400, 300, 'WHOOSH!', BL);
      bb += `<g transform="translate(1300,240)"><path d="${P(starPts(0, 0, 170, 100, 14), true)}" fill="${YL}" stroke="${K}" stroke-width="7"/><text y="22" text-anchor="middle" font-family="Anton,Impact" font-size="76" fill="${RD}" stroke="${K}" stroke-width="4" paint-order="stroke">ZOOM!</text></g>`;
      this.L.push(layer(root, 0.3, bb));
      let rd = `<rect x="-800" y="${GY - 8}" width="6400" height="210" fill="url(#s17dy)"/><path d="M-800,${GY - 8}H5600" stroke="${K}" stroke-width="8"/><path d="M-800,${GY + 70}H5600" stroke="${K}" stroke-width="6" stroke-dasharray="80 50"/>`;
      rd += `<g transform="translate(1540,${GY - 8})"><path d="M0,0V-120" stroke="${K}" stroke-width="10"/><path d="${P(starPts(0, -200, 100, 64, 12), true)}" fill="#fff" stroke="${K}" stroke-width="6"/><text y="-182" text-anchor="middle" font-family="Anton,Impact" font-size="54" fill="${BL}">No.17</text></g>`;
      this.L.push(layer(root, 1, rd));
      // 分格边框（全屏漫画页）
      add(root, `<path d="M0,0H1920V1080H0Z M22,22V1058H1898V22Z" fill="${K}" fill-rule="evenodd"/>`);
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s17(); this.pg.appendChild(this.pel.g);
      // 「叮！」
      this.ding = mk('g', {}, root);
      this.ding.innerHTML = `<path d="${P(starPts(0, 0, 520, 330, 18), true)}" fill="${YL}" stroke="${K}" stroke-width="12"/><path d="${P(starPts(0, 0, 430, 280, 18, -1.4), true)}" fill="${RD}" opacity=".9"/><text x="0" y="110" text-anchor="middle" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="330" fill="#fff" stroke="${K}" stroke-width="16" paint-order="stroke" stroke-linejoin="round" transform="rotate(-8)">叮！</text>`;
      // 2×2 丝网版
      this.grid = mk('g', {}, root);
      const bgs = ['#ff6ac8', '#ffe21a', '#3a8aff', '#3aff8a'];
      this.gp = [];
      for (let i = 0; i < 4; i++) {
        const gx = (i % 2) * 960, gy = Math.floor(i / 2) * 540;
        const g = add(this.grid, `<g><rect x="${gx}" y="${gy}" width="960" height="540" fill="${bgs[i]}"/><rect x="${gx}" y="${gy}" width="960" height="540" fill="url(#s17d${i % 2 ? 'r' : 'b'})" opacity=".25"/><path d="M${gx},${gy + 470}H${gx + 960}" stroke="${K}" stroke-width="8"/><g class="pp"></g><rect x="${gx}" y="${gy}" width="960" height="540" fill="none" stroke="${K}" stroke-width="16"/></g>`);
        const pel = popPel(SCH[i + 1]); q(g, '.pp').appendChild(pel.g);
        this.gp.push({ g, pel, gx, gy });
      }
      // 标题
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g transform="rotate(-6)"><text x="8" y="10" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="130" fill="${RD}" stroke="${K}" stroke-width="8" paint-order="stroke">波普艺术</text><text x="0" y="0" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="130" fill="${YL}" stroke="${K}" stroke-width="8" paint-order="stroke">波普艺术</text>
        <g transform="translate(560,-120)"><path d="M-130,-50Q-130,-90 -70,-90H90Q140,-90 140,-50V-10Q140,30 90,30H0L-40,70L-36,30H-70Q-130,30 -130,-10Z" fill="#fff" stroke="${K}" stroke-width="6"/><text x="5" y="-14" text-anchor="middle" font-family="Anton,Impact" font-size="52" fill="${BL}">POP ART!</text></g></g>`;
      // 出口：漫画格框
      this.frame = mk('g', {}, root);
      this.frame.innerHTML = `<path d="M-340,50V-640H340V50Z M-300,30V-600H300V30Z" fill="#fff" fill-rule="evenodd" stroke="${K}" stroke-width="12"/><rect x="-300" y="-600" width="250" height="60" fill="${YL}" stroke="${K}" stroke-width="6"/><text x="-176" y="-558" text-anchor="middle" font-family="Anton,Impact" font-size="36" fill="${K}">LATER...</text>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.pel.update(lt, s, { wingRot: -18 * bump(lt - 2.05, .12) });
      at(this.pg, { transform: `translate(${PX},${GY})` });
      const dk = eob(inv(2.05, 2.25, lt)) * (1 - ss(2.55, 2.7, lt));
      vis(this.ding, dk > 0.01);
      at(this.ding, { transform: `translate(1240,420) scale(${f2(dk)}) rotate(${f1(Math.sin(lt * 40) * 2 * dk)})` });
      const gk = lt > 2.65 && lt < 3.95;
      vis(this.grid, gk);
      if (gk) this.gp.forEach((p, i) => {
        const a = 2.65 + i * .08; const k = eob(inv(a, a + .15, lt));
        const flip = i === 3;
        p.pel.update(lt, s);
        p.g.setAttribute('transform', `translate(${f1(p.gx + 480)},${f1(p.gy + 270)}) scale(${f2(k)}) translate(${f1(-p.gx - 480)},${f1(-p.gy - 270)})`);
        p.pel.g.setAttribute('transform', `translate(${p.gx + (flip ? 520 : 420)},${p.gy + 470}) scale(${flip ? -.8 : .8},.8)`);
      });
      const ti = eob(inv(0.15, 0.45, lt)), to = inv(1.7, 1.95, lt);
      at(this.title, { transform: `translate(${f1(130 - to * 1200)},${250}) scale(${f2(ti)})` });
      const fx = frameScreenX(lt);
      vis(this.frame, lt > 3.95);
      at(this.frame, { transform: `translate(${f1(fx)},${GY + 30}) scale(${f2(eob(inv(3.95, 4.3, lt)))})` });
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 630, 600, 630); },
    oh: 630,
    exitFx: {
      win: [-0.05, 1.3],
      build(g) {
        const R = rng(1818); this.bl = [];
        let s = `<defs><filter id="s17spr" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter></defs><rect class="br" width="1920" height="1080" fill="url(#s18brick)" opacity="0"/>`;
        for (let i = 0; i < 26; i++) { const c = ['#ff2bd6', '#2bffe0', '#fff12b', '#ff6a1a', '#6a2bff'][i % 5]; s += `<circle class="bl" r="80" fill="${c}" filter="url(#s17spr)"/>`; this.bl.push([R(), R(), R()]); }
        for (let i = 0; i < 10; i++) s += `<g class="stk"><rect x="-70" y="-30" width="140" height="60" rx="8" fill="${['#fff', '#ffe21a', '#ff6ac8'][i % 3]}" stroke="#111" stroke-width="4"/><text y="10" text-anchor="middle" font-family="Anton" font-size="28" fill="#111">${['HELLO', 'PELI', '22', 'RIDE', '叮'][i % 5]}</text></g>`;
        g.innerHTML = s; this.ble = qa(g, '.bl'); this.stk = qa(g, '.stk'); this.br = q(g, '.br');
      },
      update(u) {
        const k = ss(-0.05, 0.35, u), o = 1 - ss(0.8, 1.3, u);
        op(this.br, ss(.2, .5, u) * o * .6);
        // 喷漆先盖过格框
        this.ble.forEach((b, i) => { const p = this.bl[i]; const side = i % 4; const t = p[0]; const x = side < 2 ? lerp(PX - 300, PX + 300, t) : (side === 2 ? PX - 300 : PX + 300), y = side < 2 ? (side ? GY + 30 : GY - 600) : lerp(GY - 600, GY + 30, t); const kk = ss(p[1] * .2 - .05, p[1] * .2 + .25, u); at(b, { cx: f1(lerp(x, p[0] * 1920, ss(.2, .6, u))), cy: f1(lerp(y, p[2] * 1080, ss(.2, .6, u))), r: f1(kk * (60 + p[2] * 90)), opacity: f2(o * .85) }); });
        this.stk.forEach((e, i) => { const a = .2 + i * .04, kk = eob(inv(a, a + .15, u)); at(e, { transform: `translate(${120 + (i % 5) * 400},${180 + Math.floor(i / 5) * 600 + (i % 2) * 80}) rotate(${(i % 3 - 1) * 12}) scale(${f2(kk)})`, opacity: f2(o) }); });
      }
    }
  });
})();

/* ---------------- No.18 街头涂鸦 ---------------- */
(function () {
  const K = '#141018';
  PELICANS.s18 = () => {
    const p = makePelican({
      line: K, lw: 6, body: '#f4f0f8', wing: '#c8f0ff', beak: '#ffb02a', pouch: '#ff5aa8', eye: K, neck: '#f4f0f8', head: '#f4f0f8',
      shade: { body: ['#b8a8e8', 10, -12], wing: ['#5ac8f0', 7, -7], pouch: ['#d82a88', 0, -8] },
      leg: '#ffb02a', legFar: '#c8801a', legW: 10, footLine: K, tire: K, tireW: 9, spoke: '#ff5aa8', spokeW: 2.5, spokes: 10, frame: '#8a2bff', frameW: 10, frameUnder: K, frameUnderW: 3, frameLine: '#e0b0ff', frameLineW: 2,
      saddle: K, bar: K, crank: K, hub: '#2bffe0', fish: '#2bffe0',
      wingExtra: `<path d="M-6,-252C-36,-256 -70,-246 -92,-232" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/><g class="can" opacity="0"><rect x="52" y="-232" width="22" height="46" rx="5" fill="#ff2b6a" stroke="${K}" stroke-width="3"/><rect x="56" y="-244" width="14" height="12" fill="#ddd" stroke="${K}" stroke-width="3"/></g>`,
      headExtra: `<path d="M30,-366C40,-372 52,-372 60,-366" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      top: `<g opacity=".7">${Array.from({ length: 18 }, (_, i) => { const a = i * 2.39, r = 120 + (i % 5) * 40; return `<circle cx="${f1(Math.cos(a) * r * .9 - 10)}" cy="${f1(-200 + Math.sin(a) * r * .8)}" r="${f1(2 + (i % 3) * 1.5)}" fill="${['#ff5aa8', '#2bffe0', '#8a2bff'][i % 3]}"/>`; }).join('')}</g>`
    });
    p.g.setAttribute('filter', 'url(#s18spray)');
    p.can = q(p.g, '.can');
    return p;
  };
  SCENES.push({
    key: 's18', zh: '街头涂鸦', en: 'Graffiti',
    build(root) {
      def(`<pattern id="s18brick" width="120" height="60" patternUnits="userSpaceOnUse"><rect width="120" height="60" fill="#8a4a3a"/><rect x="2" y="2" width="56" height="26" fill="#a85a44"/><rect x="62" y="2" width="56" height="26" fill="#9a523e"/><rect x="-28" y="32" width="56" height="26" fill="#9e5440"/><rect x="32" y="32" width="56" height="26" fill="#b0624a"/><rect x="92" y="32" width="56" height="26" fill="#a45842"/></pattern>
        <pattern id="s18shut" width="40" height="28" patternUnits="userSpaceOnUse"><rect width="40" height="28" fill="#9aa0a8"/><rect y="0" width="40" height="6" fill="#c8ccd2"/><rect y="22" width="40" height="6" fill="#6a7078"/></pattern>
        <filter id="s18spray" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d"/><feGaussianBlur in="d" stdDeviation="5" result="b"/><feFlood flood-color="#ff5aa8" flood-opacity=".55"/><feComposite in2="b" operator="in" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="s18soft" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="2.5"/></filter>
        <clipPath id="s18tagc"><rect class="tcr" x="0" y="0" width="0" height="600"/></clipPath><clipPath id="s18arc"><rect class="acr" x="0" y="0" width="0" height="600"/></clipPath>`);
      const R = rng(1818);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="#2a2430"/>`);
      // 地下通道：远处的拱
      this.L.push(layer(root, 0.1, `<path d="M-200,820V300Q960,40 2400,300V820Z" fill="#3a3440"/><path d="M200,820V380Q960,190 1900,380V820Z" fill="#1a161e"/>${Array.from({ length: 9 }, (_, i) => `<rect x="${260 + i * 200}" y="360" width="80" height="14" rx="7" fill="#fff4c8" opacity=".8"/>`).join('')}`));
      // 砖墙 + 卷帘门 + 层层叠叠的涂鸦和贴纸
      let w = `<rect x="-600" y="200" width="5400" height="700" fill="url(#s18brick)"/>`;
      for (let i = 0; i < 6; i++) { const x = -300 + i * 900; w += `<g transform="translate(${x},330)"><rect width="440" height="560" fill="url(#s18shut)"/><rect width="440" height="30" fill="#4a4e56"/><rect x="190" y="520" width="60" height="16" fill="#3a3e46"/></g>`; }
      const TAGF = ["'Road Rage'", "'Got heroin?'", "'Blackdiamond'", "'PerSPire'", "'Original by fnkfrsh'"];
      const TAGS = ['DRAW!', 'RIDE', 'PELI', 'BOOM', 'FRESH', 'NO.18', 'WILD', 'YO'];
      for (let i = 0; i < 14; i++) { const x = -400 + i * 380 + R() * 120, y = 380 + R() * 360, c = ['#ff2bd6', '#2bffe0', '#fff12b', '#ff6a1a', '#6aff2b', '#ffffff'][i % 6]; w += `<text x="${f1(x)}" y="${f1(y)}" font-family="${TAGF[i % 5]}" font-size="${f1(90 + R() * 70)}" fill="${c}" stroke="${K}" stroke-width="5" paint-order="stroke" transform="rotate(${f1((R() - .5) * 14)},${f1(x)},${f1(y)})">${TAGS[i % 8]}</text>`; for (let d = 0; d < 4; d++) w += `<rect x="${f1(x + 20 + R() * 160)}" y="${f1(y)}" width="5" height="${f1(20 + R() * 70)}" rx="2.5" fill="${c}"/>`; }
      for (let i = 0; i < 18; i++) { const x = -400 + R() * 5000, y = 260 + R() * 560; w += `<g transform="translate(${f1(x)},${f1(y)}) rotate(${f1((R() - .5) * 30)})"><rect x="-40" y="-26" width="80" height="52" rx="6" fill="${['#fff', '#ffe21a', '#2bffe0', '#ff6ac8'][i % 4]}" stroke="${K}" stroke-width="3"/><text y="8" text-anchor="middle" font-family="Anton" font-size="22" fill="${K}">${['HI!', '★', 'OK', '22'][i % 4]}</text></g>`; }
      // 鹈鹕的签名（高光：边骑边喷）
      const tx0 = PX + 60 + SPEED * 2.0;
      this.tagX = tx0;
      w += `<g clip-path="url(#s18tagc)"><text x="${tx0}" y="520" font-family="'Road Rage','Got heroin?'" font-size="190" fill="#ff2bd6" stroke="#fff" stroke-width="10" paint-order="stroke">Pelica</text><path d="M${tx0 + 500},420C${tx0 + 530},500 ${tx0 + 560},600 ${tx0 + 640},720" stroke="#ff2bd6" stroke-width="30" fill="none" stroke-linecap="round"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${tx0 + 60 + i * 80}" y="500" width="7" height="${40 + (i * 37) % 60}" rx="3" fill="#ff2bd6"/>`).join('')}</g>`;
      w += `<g class="arw"><path class="ap" d="M${tx0 + 840},430C${tx0 + 900},520 ${tx0 + 820},600 ${tx0 + 690},590" stroke="#2bffe0" stroke-width="22" fill="none" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1"/><path class="ah" d="M${tx0 + 736},548L${tx0 + 684},590L${tx0 + 742},630" stroke="#2bffe0" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0"/><text class="at" x="${tx0 + 880}" y="420" font-family="'Alimama ShuHeiTi'" font-size="64" fill="#2bffe0" stroke="${K}" stroke-width="5" paint-order="stroke" opacity="0">是我！</text></g>`;
      this.Lw = layer(root, 1, w); this.L.push(this.Lw);
      this.tcr = q(DEFS, '#s18tagc .tcr'); this.ap = q(this.Lw.g, '.ap'); this.ah = q(this.Lw.g, '.ah'); this.at = q(this.Lw.g, '.at');
      let rd = `<rect x="-800" y="${GY - 10}" width="6400" height="210" fill="#4a4650"/><rect x="-800" y="${GY - 16}" width="6400" height="10" fill="#6a6670"/>`;
      for (let i = 0; i < 30; i++) rd += `<ellipse cx="${-800 + R() * 6400}" cy="${GY + 40 + R() * 140}" rx="${30 + R() * 60}" ry="6" fill="${['#ff2bd6', '#2bffe0', '#fff12b'][i % 3]}" opacity=".35"/>`;
      rd += `<g transform="translate(1600,${GY - 16})"><path d="M0,0V-130" stroke="#6a6670" stroke-width="10"/><rect x="-80" y="-210" width="160" height="90" fill="#fff12b" stroke="${K}" stroke-width="5" transform="rotate(-6,0,-165)"/><text y="-150" text-anchor="middle" font-family="'Road Rage','Anton'" font-size="52" fill="${K}" transform="rotate(-6,0,-165)">No.18</text></g>`;
      this.L.push(layer(root, 1, rd));
      // 喷雾
      this.mist = mk('g', { filter: 'url(#s18soft)' }, root);
      this.mist.innerHTML = Array.from({ length: 22 }, () => `<circle r="6" fill="#ff2bd6"/>`).join('');
      this.mc = qa(this.mist, 'circle');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s18(); this.pg.appendChild(this.pel.g);
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<text x="0" y="0" font-family="'ZiKuXingQiuFeiYangTi','Alimama ShuHeiTi'" font-size="140" fill="#fff12b" stroke="${K}" stroke-width="14" paint-order="stroke" transform="rotate(-8)">街头涂鸦</text><text x="30" y="96" font-family="'Road Rage','Got heroin?'" font-size="96" fill="#2bffe0" stroke="${K}" stroke-width="8" paint-order="stroke" transform="rotate(-8)">Graffiti</text>${Array.from({ length: 6 }, (_, i) => `<rect x="${60 + i * 90}" y="${20 + i * -8}" width="7" height="${50 + i * 13 % 40}" rx="3" fill="#fff12b" transform="rotate(-8)"/>`).join('')}`;
      // 出口：卷帘门门洞
      this.door = mk('g', {}, root);
      this.door.innerHTML = `<path d="M-360,40V-650H360V40H300V-580H-300V40Z" fill="#5a5660" stroke="${K}" stroke-width="5"/><rect class="sh" x="-300" y="-580" width="600" height="160" fill="url(#s18shut)" stroke="${K}" stroke-width="3"/><rect x="-300" y="-600" width="600" height="26" fill="#3a3e46"/><text x="0" y="-612" text-anchor="middle" font-family="'Road Rage','Anton'" font-size="50" fill="#ff2bd6" stroke="${K}" stroke-width="5" paint-order="stroke">GAME ZONE →</text>`;
      this.sh = q(this.door, '.sh');
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      // 边骑边喷签名：揭开的边缘跟着喷罐
      const nozzleW = PX + 80 + s;
      const tagEnd = lt < 2.0 ? 0 : Math.min(nozzleW, this.tagX + 660) - this.tagX;
      at(this.tcr, { x: this.tagX - 20, y: 300, width: f1(Math.max(0, tagEnd + 20)) });
      const ark = eio(inv(3.45, 3.85, lt));
      this.ap.setAttribute('stroke-dashoffset', f2(1 - ark)); op(this.ah, ss(.85, 1, ark)); op(this.at, ss(.3, .6, ark));
      const spraying = (lt > 2.0 && lt < 3.25) || (lt > 3.45 && lt < 3.85);
      op(this.pel.can, ss(1.85, 1.95, lt) * (1 - ss(3.9, 4.0, lt)));
      this.mc.forEach((c, i) => { const k = fr(lt * 6 + i / 22); const a = hash(i) * TAU; at(c, { cx: f1((lt > 3.45 ? PX + 330 - (lt - 3.45) * 300 : PX + 90) + Math.cos(a) * k * 40 + k * 30), cy: f1(lt > 3.1 && lt < 3.3 ? 480 + (lt - 3.1) * 900 : (lt > 3.45 ? 520 + (lt - 3.45) * 160 : 420 + Math.sin(lt * 20) * 30) + Math.sin(a) * k * 40), r: f1(3 + k * 8), opacity: f2(spraying ? (1 - k) * .7 : 0) }); });
      // 回头补一个箭头指向自己
      const back = ss(3.3, 3.45, lt) * (1 - ss(3.85, 4.0, lt));
      this.pel.update(lt, s, { headRot: -38 * back, wingRot: spraying ? -40 + Math.sin(lt * 30) * 4 : 0 });
      at(this.pg, { transform: `translate(${PX},${GY})` });
      const ti = eob(inv(0.15, 0.45, lt)), to = inv(1.7, 1.9, lt);
      at(this.title, { transform: `translate(${f1(130 - (1 - clamp(ti)) * 120 - to * 160)},250)`, opacity: f2(clamp(ti) * (1 - to)) });
      const fx = frameScreenX(lt);
      vis(this.door, lt > 3.9);
      at(this.door, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(ss(3.9, 4.2, lt)) });
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 420, 600, 420); },
    exit(u, X) {
      if (u < 0) { X.clipD(this.openD(6 + u, frameScreenX(6 + u))); return; }
      X.none(); if (u > .6) X.hideA();
    },
    exitFx: {
      win: [-0.4, 1.0],
      build(g) {
        const nx = 24, ny = 14, cw = 80, ch = 1080 / ny;
        // 卷帘门上的喷漆（大泡泡字与色块）
        const blobs = [[400, 420, 200, '#ff2bd6'], [700, 380, 170, '#ff2bd6'], [1000, 430, 190, '#2bffe0'], [1300, 400, 180, '#fff12b'], [1560, 450, 150, '#ff6a1a'], [880, 760, 120, '#8a2bff'], [300, 800, 90, '#6aff2b'], [1650, 800, 110, '#ff2bd6']];
        let sm = `<g class="smooth"><rect width="1920" height="1080" fill="url(#s18shut)"/>${blobs.map(b => `<circle cx="${b[0]}" cy="${b[1]}" r="${b[2]}" fill="${b[3]}" stroke="#141018" stroke-width="10"/>`).join('')}<text x="960" y="520" text-anchor="middle" font-family="'Road Rage','Got heroin?'" font-size="230" fill="#fff" stroke="#141018" stroke-width="10" paint-order="stroke">PELI 22</text><rect y="0" width="1920" height="40" fill="#3a3e46"/></g>`;
        let cells = '<g class="cells">';
        this.cells = [];
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const cx = i * cw + cw / 2, cy = j * ch + ch / 2;
          let col = (j % 2) ? '#8a9098' : '#a8aeb6';
          for (const b of blobs) if ((cx - b[0]) ** 2 + (cy - b[1]) ** 2 < b[2] * b[2]) col = b[3];
          if (cy > 420 && cy < 540 && cx > 420 && cx < 1500 && ((i + j) % 3 !== 0)) col = '#ffffff';
          cells += `<rect x="${i * cw}" y="${f1(j * ch)}" width="${cw}" height="${f1(ch)}" fill="${col}" stroke="#141018" stroke-width="2"/>`;
          this.cells.push([i, j, hash(i * 31 + j * 7)]);
        }
        g.innerHTML = sm + cells + '</g>';
        this.sm = q(g, '.smooth'); this.ce = qa(g, '.cells rect'); this.cg = q(g, '.cells');
      },
      update(u) {
        // 顺手拉下卷帘门 → 强拍上碎成一格一格的像素
        const down = eio(inv(-0.38, -0.02, u));
        vis(this.sm, u < 0.0);
        at(this.sm, { transform: `translate(0,${f1(-1080 * (1 - down))})` });
        vis(this.cg, u >= 0);
        if (u >= 0) this.ce.forEach((r, i) => {
          const c = this.cells[i], d = Math.abs(c[0] - 10.5) / 12 * .25 + c[2] * .2;
          const k = ss(d, d + .3, u);
          r.setAttribute('transform', `translate(${f1(c[0] * 80 + 40)},${f1(c[1] * 77.14 + 38)}) scale(${f2(1 - k)}) translate(${f1(-c[0] * 80 - 40)},${f1(-c[1] * 77.14 - 38)})`);
        });
      }
    }
  });
})();
