'use strict';
/* ---------------- No.15 剪纸艺术 ---------------- */
(function () {
  const W = '#fbf8f0', SH = 'rgba(10,30,40,.45)';
  PELICANS.s15 = () => {
    const sh = angularShapes(1515, 2.2, { body: 26, neck: 16, head: 14, beak: 12, pouch: 14, wing: 40, crest: 6 });
    const base = {
      shapes: sh, line: '#d8d2c4', lw: 1.2, join: 'miter', body: W, wing: '#f2eee4', beak: '#f8e6c8', pouch: '#f6eee0', eye: '#2a3a4a', neck: W, head: W,
      leg: '#f0e0c8', legFar: '#d8ccb8', legW: 8, tire: W, tireW: 10, spoke: W, spokeW: 4, spokes: 8, frame: W, frameW: 8, saddle: '#e8e2d4', bar: W, crank: W, hub: '#e0d8c8', hubR: 8, fish: '#e8e0d0',
      wingExtra: `<path d="M-20,-246L-80,-232M-30,-230L-92,-218" stroke="#cfc8b8" stroke-width="1.5"/>`, crestC: W
    };
    const front = makePelican(base);
    const back = makePelican(Object.assign({}, base, { line: 'none', lw: 0, eye: W, beak: W, pouch: W, wing: W, wingExtra: '', fish: W, saddle: W, hub: W, leg: W, legFar: W }));
    const g = mk('g', { filter: 'url(#s15sh)' });
    g.appendChild(back.g); g.appendChild(front.g);
    return {
      g, front, back,
      update(tau, roll, opt) { const flip = opt && opt.flip !== undefined ? opt.flip : 1; vis(front.g, flip >= 0); vis(back.g, flip < 0); (flip >= 0 ? front : back).update(tau, roll, opt); }
    };
  };
  SCENES.push({
    key: 's15', zh: '剪纸艺术', en: 'Paper Cut',
    build(root) {
      def(`<filter id="s15sh" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="6" dy="8" stdDeviation="5" flood-color="#0a1e28" flood-opacity=".5"/></filter>
        <filter id="s15shL" x="-5%" y="-10%" width="110%" height="130%"><feDropShadow dx="0" dy="-8" stdDeviation="7" flood-color="#06141c" flood-opacity=".55"/></filter>
        <radialGradient id="s15moon" cx=".5" cy=".5" r=".5"><stop offset=".6" stop-color="#fff4d0" stop-opacity=".55"/><stop offset="1" stop-color="#fff4d0" stop-opacity="0"/></radialGradient>
        <linearGradient id="s15bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10283a"/><stop offset="1" stop-color="#24525a"/></linearGradient>`);
      const R = rng(1515);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s15bg)"/>`);
      // 纸月亮 + 纸星
      let mn = `<circle cx="1480" cy="230" r="230" fill="url(#s15moon)"/><g filter="url(#s15sh)"><circle cx="1480" cy="230" r="120" fill="#fff2c8"/><path d="M1430,190a14,14 0 1 0 0.1,0M1520,270a20,20 0 1 0 0.1,0M1500,180a8,8 0 1 0 0.1,0" fill="#efe0b0"/></g>`;
      for (let i = 0; i < 16; i++) { const x = R() * 1900, y = 40 + R() * 340, r = 6 + R() * 10; mn += `<path d="${P(starPts(x, y, r, r * .42, 5, R()), true)}" fill="#fff2c8" opacity=".9"/>`; }
      this.L.push(layer(root, 0.02, mn));
      const cols = ['#1d4048', '#2a5a5e', '#3a7470', '#4e8c7e', '#6aa88e'];
      const tree = (x, y, h, w) => `M${x - w * .08},${y}L${x - w * .08},${y - h * .25}L${x - w * .5},${y - h * .25}L${x - w * .2},${y - h * .45}L${x - w * .4},${y - h * .45}L${x - w * .12},${y - h * .7}L${x - w * .28},${y - h * .7}L${x},${y - h}L${x + w * .28},${y - h * .7}L${x + w * .12},${y - h * .7}L${x + w * .4},${y - h * .45}L${x + w * .2},${y - h * .45}L${x + w * .5},${y - h * .25}L${x + w * .08},${y - h * .25}L${x + w * .08},${y}Z`;
      for (let l = 0; l < 4; l++) {
        const R2 = rng(150 + l); const y0 = 640 + l * 70;
        let d = `M-400,1100V${y0}`; for (let x = -400; x <= 3600; x += 100) d += `Q${x + 50},${f1(y0 - 30 - R2() * 40)} ${x + 100},${y0}`; d += 'L3600,1100Z';
        let s = `<path d="${d}" fill="${cols[l]}"/>`;
        for (let i = 0; i < 16; i++) { const x = -300 + i * 240 + R2() * 120, h = 200 + R2() * 200 - l * 20, w = 120 + R2() * 60; s += `<path d="${tree(x, y0 + 10, h, w)}" fill="${cols[l]}"/>`; }
        if (l === 2) { // 小屋
          s += `<g transform="translate(1300,${y0})"><path d="M-90,0V-110H90V0Z" fill="${cols[l]}"/><path d="M-110,-110L0,-200L110,-110Z" fill="${cols[l]}"/><rect x="-40" y="-90" width="34" height="34" fill="#ffd88a"/><rect x="10" y="-90" width="34" height="34" fill="#ffd88a"/><path d="M-23,-90v34M27,-90v34M-40,-73h34M10,-73h34" stroke="${cols[l]}" stroke-width="4"/><rect x="50" y="-230" width="22" height="60" fill="${cols[l]}"/></g>`;
        }
        this.L.push(layer(root, 0.06 + l * 0.12, s, { filter: 'url(#s15shL)' }));
      }
      // 蘑菇与路
      let rd = `<path d="M-800,1100V${GY - 6}H5600V1100Z" fill="#7ab494"/><path d="M-800,${GY - 6}${Array.from({ length: 160 }, (_, i) => `L${-800 + i * 40 + 20},${GY - 16}L${-800 + i * 40 + 40},${GY - 6}`).join('')}" fill="none" stroke="#9ccaa8" stroke-width="3"/>`;
      for (let i = 0; i < 14; i++) { const x = -600 + i * 470 + R() * 100, s = .7 + R() * .6; rd += `<g transform="translate(${f1(x)},${GY + 60}) scale(${f2(s)})"><path d="M-14,0V-50H14V0Z" fill="#f4ecd8"/><path d="M-60,-46Q0,-120 60,-46Z" fill="#d84a3a"/>${[[-30, -60], [0, -80], [28, -62]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="8" fill="#fbf4e4"/>`).join('')}</g>`; }
      rd += `<g transform="translate(1560,${GY - 6})"><path d="M-8,0V-130H8V0Z" fill="${W}"/><path d="M-80,-230H80V-130H-80Z" fill="${W}"/><text y="-168" text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="700" font-size="44" fill="#2a5a5e">No.15</text><path d="M-60,-150H60" stroke="#2a5a5e" stroke-width="2" stroke-dasharray="6 4"/></g>`;
      this.L.push(layer(root, 1, rd, { filter: 'url(#s15sh)' }));
      // 风：纸片和风线
      this.wind = mk('g', {}, root);
      this.wind.innerHTML = Array.from({ length: 10 }, (_, i) => `<path class="wl" d="M0,0C80,-30 160,30 240,0C280,-14 300,-40 280,-60" fill="none" stroke="#e8f4ee" stroke-width="5" stroke-linecap="round" opacity="0"/>`).join('') + Array.from({ length: 12 }, (_, i) => `<path class="lf" d="M0,0L14,-6L26,2L12,8Z" fill="${['#f4ecd8', '#9ccaa8', '#d84a3a'][i % 3]}"/>`).join('');
      this.wl = qa(this.wind, '.wl'); this.lf = qa(this.wind, '.lf');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s15(); this.pg.appendChild(this.pel.g);
      this.ex = mk('g', {}, root);
      this.ex.innerHTML = `<text text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="700" font-size="90" fill="${W}" filter="url(#s15sh)">!?</text>`;
      // 标题：剪纸字
      this.title = mk('g', { filter: 'url(#s15sh)' }, root);
      this.title.innerHTML = `<path d="M0,0H620V200H0Z" fill="#d84a3a"/><path d="M14,14H606V186H14Z" fill="none" stroke="#f4ecd8" stroke-width="3" stroke-dasharray="10 6"/><text x="310" y="112" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="86" letter-spacing="14" fill="#fbf4e4">剪纸艺术</text><text x="310" y="166" text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="700" font-size="34" letter-spacing="16" fill="#fbf4e4">PAPER CUT</text>`;
      // 出口：纸雕的树洞
      this.hol = mk('g', { filter: 'url(#s15sh)' }, root);
      this.hol.innerHTML = `<path d="M-420,40C-380,-200 -400,-500 -300,-720H300C400,-500 380,-200 420,40Z M0,-560A290,290 0 1 0 0.1,-560Z" fill="#3a2a22" fill-rule="evenodd"/><path d="M-300,-720C-500,-760 -520,-900 -400,-940C-200,-1000 200,-1000 400,-940C520,-900 500,-760 300,-720Z" fill="#2a5a5e"/><path d="M-200,-300C-180,-240 -190,-160 -170,-80M220,-360C200,-280 216,-200 190,-120" stroke="#5a4232" stroke-width="6" fill="none"/>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      // 一阵风把纸鹈鹕吹得翻了个面
      const f1k = eio(inv(2.25, 2.55, lt)), f2k = eio(inv(3.1, 3.3, lt));
      const ang = PI * f1k - PI * f2k, flip = Math.cos(ang);
      this.pel.update(lt, s, { flip });
      at(this.pg, { transform: `translate(${PX},${f1(GY - 30 * Math.sin(ang))}) translate(20,-180) scale(${f2(Math.abs(flip) < .04 ? .04 * Math.sign(flip || 1) : flip)},1) translate(-20,180)` });
      const wk = ss(2.05, 2.25, lt) * (1 - ss(3.0, 3.3, lt));
      this.wl.forEach((w, i) => { const k = fr(lt * 1.3 + i / 10); at(w, { transform: `translate(${f1(1900 - k * 2400)},${f1(300 + i * 50 + Math.sin(i) * 40)}) scale(${f2(1 + i % 3 * .3)})`, opacity: f2(wk * Math.sin(k * PI)) }); });
      this.lf.forEach((w, i) => { const k = fr(lt * 1.1 + i / 12); at(w, { transform: `translate(${f1(2000 - k * 2600)},${f1(250 + i * 50 + Math.sin(k * 9 + i) * 60)}) rotate(${f1(k * 900)}) scale(2)`, opacity: f2(wk) }); });
      const ek = ss(2.55, 2.65, lt) * (1 - ss(3.05, 3.15, lt));
      at(this.ex, { transform: `translate(${PX + 40},${GY - 420}) scale(${f2(eob(clamp(ek * 1.5)))})`, opacity: f2(ek) });
      const ti = eob(inv(0.15, 0.45, lt)), to = inv(1.7, 2.0, lt);
      at(this.title, { transform: `translate(130,${f1(110 - to * 400)}) rotate(${f1((1 - ti) * -10)})`, opacity: f2(clamp(ti)) });
      const fx = frameScreenX(lt);
      vis(this.hol, lt > 3.6);
      at(this.hol, { transform: `translate(${f1(fx)},${GY + 30}) translate(0,${f1((1 - eo(inv(3.6, 4.1, lt))) * 700)})` });
    },
    openD(lt, cx) { return circD(cx, GY + 30 - 270, 290); },
    exitFx: {
      win: [-0.05, 1.3],
      build(g) {
        const R = rng(1616); this.sp = [];
        let s = `<rect class="bm" width="1920" height="1080" fill="#fff6d8" style="mix-blend-mode:screen"/>`;
        for (let i = 0; i < 80; i++) { s += `<path class="sp" stroke-linecap="round" stroke-width="18"/>`; this.sp.push([R() * 1920, R() * 1080, R(), R()]); }
        g.innerHTML = s; this.bm = q(g, '.bm'); this.spe = qa(g, '.sp');
      },
      update(u) {
        op(this.bm, bump(u - .05, .15) * .5);
        const k = ss(0, .35, u), m = ss(.3, .7, u), o = 1 - ss(.8, 1.3, u);
        const IMP = ['#f6e27a', '#f2b8c8', '#a8d0e8', '#b8e0a0', '#fff6d0', '#c8b8e8'];
        this.spe.forEach((e, i) => {
          const p = this.sp[i];
          const x = lerp(1480, p[0], k), y = lerp(230, p[1], k);
          const len = lerp(0, 26 + p[2] * 20, m), a = p[3] * PI;
          at(e, { d: `M${f1(x - Math.cos(a) * len / 2)},${f1(y - Math.sin(a) * len / 2)}L${f1(x + Math.cos(a) * len / 2 + .1)},${f1(y + Math.sin(a) * len / 2)}`, stroke: m > .5 ? IMP[i % 6] : '#fff4c8', 'stroke-width': f1(lerp(30 + p[2] * 20, 12, m)), opacity: f2(o * (u < 0 ? 0 : .85)) });
        });
      }
    }
  });
})();

/* ---------------- No.16 印象派 ---------------- */
(function () {
  function dabs(R, n, region, colors, len, w) {
    // region(x,y)->bool, 在矩形范围内随机取点；按颜色合并为 path
    const by = {}; colors.forEach(c => by[c] = '');
    const [x0, y0, x1, y1] = region.box;
    let made = 0, guard = 0;
    while (made < n && guard < n * 8) {
      guard++;
      const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
      if (region.test && !region.test(x, y)) continue;
      const c = region.col ? region.col(x, y, R) : colors[Math.floor(R() * colors.length)];
      const a = (region.ang !== undefined ? region.ang : -0.3) + (R() - .5) * .9, l = len * (.6 + R() * .8);
      by[c] = (by[c] || '') + `M${f1(x)},${f1(y)}l${f1(Math.cos(a) * l)},${f1(Math.sin(a) * l)}`;
      made++;
    }
    let s = ''; for (const c in by) if (by[c]) s += `<path d="${by[c]}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
    return s;
  }
  function pat(id, cols, seed, w) {
    const R = rng(seed); let s = `<pattern id="${id}" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="${cols[0]}"/>`;
    for (let i = 0; i < 26; i++) { const x = R() * 48, y = R() * 48, a = -0.5 + (R() - .5), l = 8 + R() * 8; s += `<path d="M${f1(x)},${f1(y)}l${f1(Math.cos(a) * l)},${f1(Math.sin(a) * l)}" stroke="${cols[1 + (i % (cols.length - 1))]}" stroke-width="${w}" stroke-linecap="round"/>`; }
    return s + `</pattern>`;
  }
  PELICANS.s16 = () => {
    const p = makePelican({
      line: 'rgba(90,80,140,.55)', lw: 5, body: 'url(#s16pb)', wing: 'url(#s16pw)', beak: 'url(#s16pk)', pouch: 'url(#s16pk)', eye: '#3a3a6a', neck: 'url(#s16pb)', head: 'url(#s16pb)',
      leg: '#f0a060', legFar: '#c88a70', legW: 9, tire: '#5a6aa0', tireW: 8, spoke: '#a8b8d8', spokeW: 2.5, spokes: 10, frame: '#4a8a8a', frameW: 8, frameLine: '#a8d8c8', frameLineW: 3,
      saddle: '#6a5a8a', bar: '#5a5a8a', crank: '#5a5a8a', hub: '#f6e27a', fish: '#a8c8e8'
    });
    p.g.setAttribute('filter', 'url(#s16fz)');
    return p;
  };
  SCENES.push({
    key: 's16', zh: '印象派', en: 'Impressionism',
    build(root) {
      def(pat('s16pb', ['#f4f0e4', '#ffffff', '#e8e0f0', '#f8eec8', '#dfe6f4', '#f6e2d8'], 1, 4) + pat('s16pw', ['#c8cce8', '#e8ecf8', '#a8b4dc', '#d8c8e8', '#f4f0e8'], 2, 4) + pat('s16pk', ['#f0a868', '#f6c888', '#e88a68', '#f8d8a8'], 3, 4) +
        `<filter id="s16fz" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="16" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="7"/></filter>
        <filter id="s16rip" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".01 .12" numOctaves="2" seed="6" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="18"/></filter>
        <radialGradient id="s16sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6c8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>`);
      const R = rng(1616);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="#cfe0ec"/>`);
      const SKY = ['#bcd8ee', '#d8e8f4', '#f4ecd0', '#e8d8ec', '#c8dcf0', '#fff4dc'];
      const dabPat = (id, w, h, n, cols, len, wd, bg) => { const R2 = rng(id.length * 97 + n); const by = {}; for (let i = 0; i < n; i++) { const x = R2() * w, y = R2() * h, a = -.3 + (R2() - .5) * .9, l = len * (.6 + R2() * .8), c = cols[Math.floor(R2() * cols.length)]; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { if (x + ox < -len || x + ox > w + len || y + oy < -len || y + oy > h + len) continue; by[c] = (by[c] || '') + `M${f1(x + ox)},${f1(y + oy)}l${f1(Math.cos(a) * l)},${f1(Math.sin(a) * l)}`; } } let s = `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${h}" fill="${bg}"/>`; for (const k in by) s += `<path d="${by[k]}" stroke="${k}" stroke-width="${wd}" stroke-linecap="round" fill="none"/>`; return s + '</pattern>'; };
      def(dabPat('s16Psky', 520, 260, 330, SKY, 36, 15, '#cfe0ee') + dabPat('s16Pleaf', 300, 240, 300, ['#4a7a4a', '#6a9a5a', '#8ab86a', '#b8d080', '#3a5a4a', '#d8e090', '#5a8a7a'], 30, 12, '#6a9a5a') + dabPat('s16Pbush', 420, 200, 360, ['#6a9a5a', '#8ab86a', '#b8d080', '#d8c870', '#f2b8c8', '#4a7a5a', '#a8c878'], 30, 13, '#7aa86a') + dabPat('s16Proad', 300, 60, 120, ['#c8b088', '#d8c098', '#b89870', '#e8d4a8'], 30, 12, '#d0b890') + dabPat('s16Pwater', 460, 200, 300, ['#6a9ac0', '#8ab8d8', '#4a7aa8', '#a8c8e0', '#7aa8a0', '#5a8a9a'], 36, 13, '#7aa8c8'));
      this.L.push(layer(root, 0.03, `<rect x="-100" y="-40" width="2300" height="700" fill="url(#s16Psky)"/>`));
      const TREE = ['#4a7a4a', '#6a9a5a', '#8ab86a', '#b8d080', '#3a5a4a', '#d8e090', '#5a8a7a'];
      let tr = `<path d="M-100,600${Array.from({ length: 40 }, (_, i) => `Q${-100 + i * 80 + 40},${f1(540 + R() * 40)} ${-100 + i * 80 + 80},${f1(580 + R() * 30)}`).join('')}V920H-100Z" fill="url(#s16Pbush)"/>`;
      for (let i = 0; i < 6; i++) { const cx = -100 + i * 480 + R() * 100, cy = 330 + R() * 80, r = 190 + R() * 60; tr += `<path d="M${cx},${cy + r * .6}V720" stroke="#5a4a3a" stroke-width="22" stroke-linecap="round"/>`; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, d = k ? r * .45 : 0; tr += `<circle cx="${f1(cx + Math.cos(a) * d)}" cy="${f1(cy + Math.sin(a) * d * .8)}" r="${f1(r * (k ? .55 : .7))}" fill="url(#s16Pleaf)"/>`; } tr += dabs(R, 70, { box: [cx - r, cy - r, cx + r, cy + r], test: (x, y) => { const q = (x - cx) ** 2 + ((y - cy) * 1.2) ** 2; return q < r * r * 1.1 && q > r * r * .6; } }, TREE, 30, 12); }
      this.L.push(layer(root, 0.2, tr));
      // 拱桥（日式绿桥）与睡莲池（路的一部分）
      const B0 = PX + SPEED * 2.0, B1 = PX + SPEED * 4.0, BH = 90;
      this.B0 = B0; this.B1 = B1; this.BH = BH;
      let rd = `<rect x="-800" y="${GY - 8}" width="${B0 + 780}" height="50" fill="url(#s16Proad)"/><rect x="${B1 + 20}" y="${GY - 8}" width="${5600 - B1}" height="50" fill="url(#s16Proad)"/>`;
      // 池水
      rd += `<rect x="-800" y="${GY + 30}" width="6400" height="200" fill="url(#s16Pwater)"/>`;
      for (let i = 0; i < 40; i++) { const x = -700 + R() * 6200, y = GY + 70 + R() * 120; rd += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(26 + R() * 20)}" ry="${f1(8 + R() * 4)}" fill="#5a8a4a" opacity=".9"/>${R() < .5 ? `<circle cx="${f1(x + 6)}" cy="${f1(y - 4)}" r="7" fill="${R() < .5 ? '#f6c8d8' : '#fff8f0'}"/>` : ''}`; }
      // 桥
      let bd = '';
      for (let i = 0; i <= 40; i++) { const t = i / 40, x = lerp(B0, B1, t), y = GY - Math.sin(t * PI) * BH; bd += `M${f1(x)},${f1(y)}l${f1(14)},${f1(-2)}`; }
      rd += `<path d="${bd}" stroke="#3a7a6a" stroke-width="22" stroke-linecap="round"/><path d="M${B0},${GY - 6}Q${(B0 + B1) / 2},${GY - BH * 2 - 6} ${B1},${GY - 6}" stroke="#5a9a7a" stroke-width="8" fill="none"/>`;
      for (let i = 1; i < 10; i++) { const t = i / 10, x = lerp(B0, B1, t), y = GY - Math.sin(t * PI) * BH; rd += `<path d="M${f1(x)},${f1(y)}v-54" stroke="#4a8a6a" stroke-width="9" stroke-linecap="round"/>`; }
      rd += `<path d="M${B0},${GY - 60}Q${(B0 + B1) / 2},${GY - BH * 2 - 60} ${B1},${GY - 60}" stroke="#4a8a6a" stroke-width="10" fill="none" stroke-linecap="round"/>`;
      rd += `<g transform="translate(1500,${GY})"><path d="M0,0V-110" stroke="#7a6a5a" stroke-width="8"/><rect x="-74" y="-190" width="148" height="80" rx="10" fill="#f4ecd8" stroke="#8a7a6a" stroke-width="4"/><text y="-140" text-anchor="middle" font-family="'Great Vibes'" font-size="44" fill="#4a6a8a">No.16</text></g>`;
      this.Lr = layer(root, 1, rd); this.L.push(this.Lr);
      // 倒影（慢半拍）
      this.refl = mk('g', { filter: 'url(#s16rip)', opacity: .72 }, root);
      this.rpel = PELICANS.s16(); this.rpel.g.removeAttribute('filter'); this.refl.appendChild(this.rpel.g);
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s16(); this.pg.appendChild(this.pel.g);
      // 光斑
      this.dap = mk('g', {}, root);
      this.dap.innerHTML = Array.from({ length: 16 }, () => `<ellipse rx="70" ry="40" fill="url(#s16sun)"/>`).join('');
      this.dp = qa(this.dap, 'ellipse'); this.dpr = this.dp.map(() => [R(), R(), R()]);
      // 标题：签名式
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<text x="0" y="0" font-family="'LXGW WenKai GB','Source Han Serif CN'" font-size="96" fill="#3a4a7a" opacity=".9">印象派</text><text x="10" y="80" font-family="'Great Vibes'" font-size="72" fill="#c85a7a">Impressionism</text><path d="M10,100C120,90 260,110 380,96" stroke="#c85a7a" stroke-width="3" fill="none"/>`;
      // 出口：镀金画框
      this.frame = mk('g', {}, root);
      this.frame.innerHTML = `<defs><linearGradient id="s16gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".4" stop-color="#d8a83a"/><stop offset=".7" stop-color="#a8782a"/><stop offset="1" stop-color="#f0d070"/></linearGradient></defs>
        <path d="M-380,60V-660H380V60Z M-300,30V-590H300V30Z" fill="url(#s16gold)" fill-rule="evenodd" stroke="#6a4a1a" stroke-width="4"/><path d="M-350,40V-640H350V40Z" fill="none" stroke="#fff4c0" stroke-width="3" opacity=".7"/><path d="M-314,30V-600H314V30" fill="none" stroke="#6a4a1a" stroke-width="5"/>
        ${[[-380, -660], [380, -660], [-380, 60], [380, 60]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="34" fill="url(#s16gold)" stroke="#6a4a1a" stroke-width="3"/>`).join('')}<path d="M-100,-660Q0,-720 100,-660" fill="url(#s16gold)" stroke="#6a4a1a" stroke-width="3"/>`;
    },
    bridgeY(wx) { if (wx < this.B0 || wx > this.B1) return 0; return -Math.sin((wx - this.B0) / (this.B1 - this.B0) * PI) * this.BH; },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      const wx = PX + s, by = this.bridgeY(wx);
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${f1(GY + by)})` });
      // 倒影慢了半拍，鹈鹕已经上了桥，倒影还在犹豫
      const lag = 0.25 + 0.45 * ss(2.4, 2.9, lt) * (1 - ss(3.5, 4.1, lt));
      const lt2 = lt - lag, s2 = stdScroll(lt2), wx2 = PX + s2, by2 = this.bridgeY(wx2);
      const hes = ss(2.6, 2.9, lt) * (1 - ss(3.3, 3.6, lt));
      this.rpel.update(lt2 - hes * Math.sin(lt * 9) * .05, s2);
      const rx = PX - (s - s2) + Math.sin(lt * 7) * 6 * hes, wl = GY + 30;
      at(this.refl, { transform: `translate(${f1(rx)},${f1(wl + (wl - (GY + by2)) * .55)}) scale(1,-.55)` });
      vis(this.refl, true);
      this.dp.forEach((d, i) => { const p = this.dpr[i]; at(d, { cx: f1(((p[0] * 2400 - s * .9) % 2400 + 2400) % 2400 - 200), cy: f1(560 + p[1] * 380), opacity: f2(.35 + .35 * Math.sin(lt * 2 + p[2] * 9)), rx: f1(50 + p[2] * 60) }); });
      const ti = ss(0.15, 0.6, lt), to = 1 - ss(1.7, 2.0, lt);
      at(this.title, { transform: `translate(140,190)`, opacity: f2(ti * to) });
      const fx = frameScreenX(lt);
      vis(this.frame, lt > 4.0);
      at(this.frame, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(ss(4.0, 4.4, lt)) });
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 620, 600, 620); },
    oh: 620,
    exitFx: {
      win: [-0.05, 1.2],
      build(g) {
        g.innerHTML = `<defs><pattern id="s16ht" width="24" height="24" patternUnits="userSpaceOnUse"><circle class="htd" cx="12" cy="12" r="4" fill="#e8202a"/></pattern></defs>
          <rect class="ht" width="1920" height="1080" fill="url(#s16ht)" style="mix-blend-mode:multiply"/><rect class="yl" width="1920" height="1080" fill="#ffe21a" style="mix-blend-mode:multiply"/>
          <path class="pl" d="M0,360H1920M640,0V360M1180,360V1080" stroke="#111" fill="none"/>`;
        this.ht = q(g, '.ht'); this.htd = q(g, '.htd'); this.yl = q(g, '.yl'); this.pl = q(g, '.pl');
      },
      update(u) {
        const k = ss(0, .4, u), o = 1 - ss(.75, 1.2, u);
        op(this.ht, k * o * .8); at(this.htd, { r: f1(2 + k * 5) });
        op(this.yl, ss(.15, .45, u) * o * .45);
        at(this.pl, { 'stroke-width': f1(ss(.2, .55, u) * 18), opacity: f2(o * (u < 0 ? 0 : 1)) });
      }
    }
  });
})();
