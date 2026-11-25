'use strict';
/* ---------------- No.09 现代数码动画 ---------------- */
(function () {
  def0();
  function def0() { }
  PELICANS.s09 = () => {
    const p = makePelican({
      line: '#3a3a5a', lw: 2.2, body: 'url(#s09body)', wing: 'url(#s09wing)', beak: 'url(#s09beak)', pouch: '#ffc890', eye: '#20203a', neck: 'url(#s09body)', head: 'url(#s09body)',
      rim: { body: ['#fff4c8', -4, 3], neck: ['#fff4c8', -3, 1], head: ['#fff4c8', -3, 2], wing: ['#fff8dc', -3, 3] },
      shade: { body: ['#b8c0e0', 9, -10], neck: ['#b8c0e0', 6, -2], head: ['#c0c6e4', 5, -4], wing: ['#b4bcdc', 6, -6], pouch: ['#e8a070', 0, -6] },
      leg: '#ff9a4a', legFar: '#c87038', legW: 8, tire: '#2a2a3a', tireW: 6, spoke: '#c8ccd8', spokeW: 1, spokes: 24, rimW: 2, rimC: '#e8ecf4',
      frame: '#2a6ad8', frameW: 7, frameLine: '#9fd0ff', frameLineW: 1.6, saddle: '#2a2a3a', bar: '#3a3a4a', crank: '#3a3a4a', hub: '#e8ecf4', fish: '#7ac0ff',
      eyeMk: () => `<ellipse cx="48" cy="-354" rx="5.5" ry="6.5" fill="#20203a"/><ellipse cx="48" cy="-352" rx="3.5" ry="4" fill="#4a6ab8"/><circle cx="46.5" cy="-357" r="2.2" fill="#fff"/>`,
      top: `<g class="ding" opacity="0"><path d="M60,-198a14,14 0 1 1 0.1,0" fill="none" stroke="#fff" stroke-width="3"/><path d="M80,-210l18,-14M84,-196l22,-2M78,-222l6,-20" stroke="#fff" stroke-width="3" stroke-linecap="round"/><text x="104" y="-232" font-family="'Source Han Serif CN'" font-weight="700" font-size="34" fill="#fff" stroke="#2a4a8a" stroke-width="5" paint-order="stroke">叮</text></g>`
    });
    p.ding = q(p.g, '.ding');
    return p;
  };
  SCENES.push({
    key: 's09', zh: '现代数码动画', en: 'Modern Digital Anime',
    build(root) {
      def(`<linearGradient id="s09sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1450c8"/><stop offset=".45" stop-color="#3fa2f4"/><stop offset=".78" stop-color="#a8e2ff"/><stop offset="1" stop-color="#f2fbff"/></linearGradient>
        <linearGradient id="s09body" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e2e6f6"/></linearGradient>
        <linearGradient id="s09wing" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d8def2"/></linearGradient>
        <linearGradient id="s09beak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffb86a"/><stop offset="1" stop-color="#ff9a3a"/></linearGradient>
        <radialGradient id="s09puff" cx=".66" cy=".25" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#f4f7ff"/><stop offset=".75" stop-color="#c4d0ea"/><stop offset="1" stop-color="#8ea2cc"/></radialGradient>
        <radialGradient id="s09flare" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity="1"/><stop offset=".12" stop-color="#fff6d0" stop-opacity=".9"/><stop offset=".4" stop-color="#ffe2a0" stop-opacity=".25"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></radialGradient>
        <linearGradient id="s09ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8e0" stop-opacity=".5"/><stop offset="1" stop-color="#fff8e0" stop-opacity="0"/></linearGradient>
        <linearGradient id="s09train" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6fa"/><stop offset=".6" stop-color="#c8ced8"/><stop offset="1" stop-color="#8a92a0"/></linearGradient>
        <filter id="s09b1" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>
        <filter id="s09b8" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
        <filter id="s09mb" x="-10%" y="0" width="120%" height="100%"><feGaussianBlur stdDeviation="26 1"/></filter>
        <filter id="s09bloom" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>`);
      const R = rng(909);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s09sky)"/>`);
      // 积雨云（体积感：多层渐变团块）
      let cb = '';
      const puffs = [];
      for (let i = 0; i < 70; i++) { const t = Math.pow(R(), .8), hw = 420 * Math.pow(1 - t, .55) + 50; puffs.push([1150 + (R() * 2 - 1) * hw + t * 120, 600 - t * 470, 34 + (1 - t) * 60 + R() * 26]); }
      puffs.sort((a, b) => b[1] - a[1]);
      for (const p of puffs) cb += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(p[2])}" fill="url(#s09puff)"/>`;
      cb += `<path d="M560,600Q1150,540 1760,600L1760,660H560Z" fill="#b4c4e2"/>`;
      let c2 = ''; for (let i = 0; i < 8; i++) { const x = R() * 2200 - 100, y = 120 + R() * 200; c2 += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(90 + R() * 120)}" ry="${f1(14 + R() * 10)}" fill="#fff" opacity=".7"/>`; }
      this.L.push(layer(root, 0.02, `<g filter="url(#s09b1)">${cb}</g>${c2}`));
      // 逆光：太阳与光芒
      add(root, `<g style="mix-blend-mode:screen"><circle cx="1480" cy="170" r="420" fill="url(#s09flare)"/>${Array.from({ length: 7 }, (_, i) => `<path d="M1480,170L${f1(1480 + Math.cos(1.6 + i * .28) * 1600 - 60)},${f1(170 + Math.sin(1.6 + i * .28) * 1600)}L${f1(1480 + Math.cos(1.6 + i * .28) * 1600 + 60)},${f1(170 + Math.sin(1.6 + i * .28) * 1600)}Z" fill="url(#s09ray)" opacity=".35"/>`).join('')}</g>`);
      // 远景街区（轻微虚化）
      let fr0 = '';
      for (let i = 0; i < 16; i++) { const x = -200 + i * 190 + R() * 40, w = 140 + R() * 60, h = 90 + R() * 120; fr0 += `<rect x="${f1(x)}" y="${f1(780 - h)}" width="${f1(w)}" height="${f1(h)}" fill="${['#8a9cc0', '#9aa8c8', '#7c90b8'][i % 3]}"/><path d="M${f1(x - 10)},${f1(780 - h)}L${f1(x + w / 2)},${f1(780 - h - 40)}L${f1(x + w + 10)},${f1(780 - h)}Z" fill="#5a6a90"/>`; }
      this.L.push(layer(root, 0.15, `<g filter="url(#s09b1)" opacity=".9">${fr0}</g>`));
      // 中景：电线杆、密集的电线、道口
      let mid = '';
      for (let i = 0; i < 7; i++) { const x = -100 + i * 640; mid += `<path d="M${x},140V${GY - 10}" stroke="#3a4058" stroke-width="16"/><path d="M${x - 60},190H${x + 60}M${x - 46},236H${x + 46}" stroke="#3a4058" stroke-width="7"/><rect x="${x + 10}" y="270" width="40" height="60" rx="8" fill="#5a6078"/>`; for (let w = 0; w < 5; w++) mid += `<path d="M${x - 56 + w * 26},${190 + (w % 2) * 46}Q${x + 330},${250 + w * 14} ${x + 584 + w * 26},${190 + (w % 2) * 46}" stroke="#2a3048" stroke-width="${1.6 + (w % 2)}" fill="none"/>`; }
      for (let i = 0; i < 10; i++) { const x = -200 + i * 480 + R() * 100; mid += `<rect x="${f1(x)}" y="${GY - 190}" width="${f1(320 + R() * 80)}" height="190" fill="${['#e8e2d6', '#d8dce6', '#e6dcd0'][i % 3]}"/><rect x="${f1(x + 20)}" y="${GY - 160}" width="70" height="60" fill="#6a88b8"/><rect x="${f1(x + 20)}" y="${GY - 160}" width="70" height="14" fill="#a8c8f0"/><rect x="${f1(x)}" y="${GY - 200}" width="${f1(340 + R() * 60)}" height="14" fill="#4a5470"/>`; }
      mid += `<g transform="translate(1500,${GY})"><path d="M0,0V-260" stroke="#e8e8ec" stroke-width="10"/><path d="M-60,-250L60,-190M60,-250L-60,-190" stroke="#f4f4f4" stroke-width="18"/><path d="M-60,-250L60,-190M60,-250L-60,-190" stroke="#e23a3a" stroke-width="10" stroke-dasharray="14 10"/><rect x="-58" y="-170" width="116" height="40" rx="6" fill="#2a2a32"/><text y="-140" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="700" font-size="22" fill="#fff">踏切 No.09</text></g>`;
      this.L.push(layer(root, 0.55, mid));
      let rd = `<rect x="-800" y="${GY}" width="6400" height="200" fill="#5a6070"/><rect x="-800" y="${GY}" width="6400" height="8" fill="#8a90a0"/><path d="M-800,${GY + 70}H5600" stroke="#f4f4f4" stroke-width="6" stroke-dasharray="120 80" opacity=".85"/>`;
      rd += `<rect x="-800" y="${GY + 4}" width="6400" height="40" fill="url(#s09ray)" opacity=".25"/>`;
      this.L.push(layer(root, 1, rd));
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s09(); this.pg.appendChild(this.pel.g);
      // 前景虚化
      let fg = ''; for (let i = 0; i < 6; i++) { const x = 200 + i * 900; fg += `<path d="M${x},1080V560" stroke="#20263a" stroke-width="44"/><circle cx="${x + 80}" cy="1040" r="120" fill="#2a4a2a"/><circle cx="${x - 40}" cy="1010" r="90" fill="#3a6a3a"/>`; }
      this.L.push(layer(root, 1.5, `<g filter="url(#s09b8)">${fg}</g>`));
      // ===== 高光：道口镜头 =====
      this.shot = mk('g', {}, root);
      let sb = `<rect width="1920" height="1080" fill="url(#s09sky)"/><g filter="url(#s09b1)">${cb}</g><g style="mix-blend-mode:screen"><circle cx="1480" cy="170" r="420" fill="url(#s09flare)"/></g>`;
      sb += `<g filter="url(#s09b1)">${fr0}</g>`;
      sb += `<rect x="0" y="690" width="1920" height="400" fill="#6a7080"/><path d="M0,742H1920M0,792H1920" stroke="#c8ccd8" stroke-width="6"/>${Array.from({ length: 40 }, (_, i) => `<rect x="${i * 50}" y="736" width="22" height="64" fill="#4a4a52"/>`).join('')}<path d="M0,742H1920M0,792H1920" stroke="#e8ecf4" stroke-width="4"/>`;
      sb += `<g class="girl" filter="url(#s09b1)"><path d="M1080,700L1066,600Q1080,560 1100,560Q1120,560 1134,600L1120,700Z" fill="#3a3a58"/><circle cx="1100" cy="538" r="22" fill="#3a3040"/><path d="M1078,540Q1070,600 1084,620L1118,620Q1130,600 1122,540Z" fill="#2a2030"/></g>`;
      sb += `<g class="pel2"></g>`;
      sb += `<g class="tr" filter="url(#s09mb)">${Array.from({ length: 8 }, (_, i) => `<g transform="translate(${i * 620},0)"><rect x="0" y="420" width="600" height="300" rx="20" fill="url(#s09train)"/><rect x="0" y="600" width="600" height="26" fill="#2a9a5a"/>${[0, 1, 2, 3, 4].map(j => `<rect x="${40 + j * 110}" y="470" width="80" height="90" rx="10" fill="#3a4a68"/>`).join('')}<rect x="0" y="690" width="600" height="30" fill="#4a4e58"/></g>`).join('')}</g>`;
      sb += `<g class="gate"><rect x="300" y="560" width="30" height="400" fill="#3a3a42"/><g class="arm"><rect x="0" y="-12" width="1200" height="24" fill="#f4f4f4"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 100}" y="-12" width="50" height="24" fill="#e02a2a"/>`).join('')}</g>
        <g transform="translate(315,520)"><path d="M-90,-70L90,70M90,-70L-90,70" stroke="#f4f4f4" stroke-width="30"/><path d="M-90,-70L90,70M90,-70L-90,70" stroke="#e02a2a" stroke-width="18" stroke-dasharray="20 14"/></g><rect x="235" y="610" width="160" height="70" rx="35" fill="#2a2a32"/><circle class="lt1" cx="275" cy="645" r="26" fill="#ff3030"/><circle class="lt2" cx="355" cy="645" r="26" fill="#ff3030"/></g>`;
      this.shot.innerHTML = sb;
      this.arm = q(this.shot, '.arm'); this.trn = q(this.shot, '.tr'); this.girl = q(this.shot, '.girl'); this.lt1 = q(this.shot, '.lt1'); this.lt2 = q(this.shot, '.lt2');
      this.pel2 = PELICANS.s09(); q(this.shot, '.pel2').appendChild(this.pel2.g);
      // 标题：细腻的衬线
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<text x="960" y="250" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="300" font-size="84" letter-spacing="30" fill="#fff" style="filter:drop-shadow(0 2px 12px rgba(20,60,140,.5))">现代数码动画</text><path d="M760,290H1160" stroke="#fff" stroke-width="1.5" opacity=".8"/><text x="960" y="336" text-anchor="middle" font-family="'Cormorant Garamond'" font-style="italic" font-size="38" letter-spacing="10" fill="#fff" style="filter:drop-shadow(0 2px 10px rgba(20,60,140,.5))">Modern Digital Anime</text>`;
      // 出口：电车车窗
      this.win = mk('g', {}, root);
      this.win.innerHTML = `<rect x="-360" y="-610" width="720" height="660" rx="30" fill="url(#s09train)"/><rect x="-360" y="-90" width="720" height="26" fill="#2a9a5a"/><rect x="-300" y="-560" width="600" height="540" rx="40" fill="none" stroke="#8a92a0" stroke-width="12"/><path d="M-300,-300H300" stroke="#8a92a0" stroke-width="10" opacity="0"/>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 道口镜头：2.0–4.0
      const inShot = lt >= 2.0 && lt < 4.0;
      vis(this.shot, inShot);
      if (inShot) {
        const down = eio(inv(2.0, 2.35, lt)) * (1 - eio(inv(3.7, 3.98, lt)));
        this.arm.setAttribute('transform', `translate(315,600) rotate(${f1(-88 + 88 * down)})`);
        const blink = Math.floor(lt * 4) % 2;
        op(this.lt1, down > 0.05 ? (blink ? 1 : .25) : .25); op(this.lt2, down > 0.05 ? (blink ? .25 : 1) : .25);
        const tx = lerp(-5200, 2200, inv(2.45, 3.45, lt));
        vis(this.trn, lt > 2.45 && lt < 3.45);
        this.trn.setAttribute('transform', `translate(${f1(tx)},0)`);
        op(this.girl, 1 - ss(2.6, 2.7, lt));
        const pv = lt > 3.0;
        vis(this.pel2.g, pv);
        this.pel2.update(0.35, 0);
        this.pel2.g.setAttribute('transform', `translate(1100,700) scale(.62)`);
        op(this.pel2.ding, bump(lt - 3.68, .1) > .05 ? Math.min(1, bump(lt - 3.68, .12) * 1.5) : 0);
      }
      const ti = ss(0.2, 0.6, lt), to = 1 - ss(1.6, 1.95, lt);
      op(this.title, ti * to);
      const fx = frameScreenX(lt);
      vis(this.win, lt > 4.0);
      at(this.win, { transform: `translate(${f1(fx)},${GY + 30})` });
    },
    openD(lt, cx) { return rrD(cx - 300, GY + 30 - 560, 600, 540, 40); },
    oh: 560, ow: 600,
    exitFx: {
      win: [-0.05, 1.2],
      build(g) {
        g.innerHTML = `<rect class="sp" width="1920" height="1080" fill="#b08a50" style="mix-blend-mode:color"/><rect class="sp2" width="1920" height="1080" fill="#e8d8b0" style="mix-blend-mode:multiply"/><path class="ph" fill="none" stroke="#f4ecd8" stroke-width="40"/>`;
        this.sp = q(g, '.sp'); this.sp2 = q(g, '.sp2'); this.ph = q(g, '.ph');
      },
      update(u) {
        const k = ss(-0.05, 0.3, u), out = 1 - ss(0.75, 1.15, u);
        op(this.sp, k * out); op(this.sp2, k * .6 * out);
        // 老照片的白边收进报纸版面
        const e = eio(inv(0.15, 0.75, u));
        const r = [lerp(-30, 1040, e), lerp(-30, 180, e), lerp(1980, 1500, e), lerp(1110, 520, e)];
        at(this.ph, { d: rectD(r[0], r[1], r[2] - r[0], r[3] - r[1]), 'stroke-width': f1(lerp(60, 14, e)), opacity: f2(ss(.1, .2, u) * out) });
      }
    }
  });
})();

/* ---------------- No.10 复古神秘学印刷风 ---------------- */
(function () {
  const INK = '#2e2216', SEP = '#d9c9a4', RED = '#a8321e';
  PELICANS.s10 = () => {
    const p = makePelican({
      line: INK, lw: 2.6, body: 'url(#s10ht)', wing: 'url(#s10ht2)', beak: '#b89868', pouch: 'url(#s10ht)', eye: INK, neck: 'url(#s10ht)', head: 'url(#s10ht)',
      leg: '#6a5232', legFar: '#4a3a22', legW: 8, tire: INK, tireW: 6, spoke: INK, spokeW: 1, spokes: 16, frame: '#5a4630', frameW: 6, saddle: INK, bar: INK, crank: INK, hub: INK, fish: '#8a7050'
    });
    p.g.setAttribute('filter', 'url(#s10mis)');
    return p;
  };
  const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  const ZOD = '♈♉♊♋♌♍♎♏♐♑♒♓';
  function astro(cx, cy, r, R) {
    let s = `<g transform="translate(${cx},${cy})" fill="none" stroke="${INK}">`;
    s += `<circle r="${r}" stroke-width="3"/><circle r="${r * .86}" stroke-width="1.2"/><circle r="${r * .62}" stroke-width="2"/><circle r="${r * .2}" stroke-width="1.5"/>`;
    for (let i = 0; i < 72; i++) { const a = i * TAU / 72, l = i % 6 ? .04 : .09; s += `<path d="M${f1(Math.cos(a) * r)},${f1(Math.sin(a) * r)}L${f1(Math.cos(a) * r * (1 - l))},${f1(Math.sin(a) * r * (1 - l))}" stroke-width="1"/>`; }
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; s += `<path d="M${f1(Math.cos(a) * r * .62)},${f1(Math.sin(a) * r * .62)}L${f1(Math.cos(a) * r * .86)},${f1(Math.sin(a) * r * .86)}" stroke-width="1.2"/>`; }
    s += `<path d="${P(starPts(0, 0, r * .6, r * .24, 6), true)}" stroke-width="1.2"/><path d="M${-r * .6},0Q0,${-r * .3} ${r * .6},0Q0,${r * .3} ${-r * .6},0Z" stroke-width="1"/></g>`;
    s += `<g font-family="'Segoe UI Symbol','Segoe UI Historic'" font-size="${f1(r * .13)}" fill="${INK}" text-anchor="middle">`;
    for (let i = 0; i < 12; i++) { const a = (i + .5) * TAU / 12; s += `<text x="${f1(cx + Math.cos(a) * r * .74)}" y="${f1(cy + Math.sin(a) * r * .74 + r * .045)}">${ZOD[i]}&#xFE0E;</text>`; }
    s += `</g>`;
    return s;
  }
  function ring(cx, cy, r, R) {
    let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r - 30}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4 5"/><g font-family="'Segoe UI Historic'" font-size="22" fill="${INK}" text-anchor="middle">`;
    for (let i = 0; i < 18; i++) { const a = i * TAU / 18; s += `<text x="${f1(cx + Math.cos(a) * (r - 15))}" y="${f1(cy + Math.sin(a) * (r - 15) + 8)}" transform="rotate(${f1(a * 180 / PI + 90)},${f1(cx + Math.cos(a) * (r - 15))},${f1(cy + Math.sin(a) * (r - 15))})">${RUNES[i % RUNES.length]}</text>`; }
    return s + `</g><path d="M${cx},${cy - r * .5}L${cx + r * .43},${cy + r * .25}L${cx - r * .43},${cy + r * .25}Z" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r * .12}" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="${r * .05}" fill="${INK}"/>`;
  }
  function textLines(x, y, w, n, R, gap) { let s = ''; for (let i = 0; i < n; i++) s += `<rect x="${x}" y="${y + i * (gap || 14)}" width="${f1(i % 7 === 6 ? w * (.3 + R() * .4) : w - R() * 8)}" height="5" fill="${INK}" opacity="${f2(.45 + R() * .25)}"/>`; return s; }
  SCENES.push({
    key: 's10', zh: '复古神秘学印刷风', en: 'Retro Occult Print',
    build(root) {
      def(`<pattern id="s10ht" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#e8dcc0"/><circle cx="3.5" cy="3.5" r="1.7" fill="#5a4630" opacity=".55"/></pattern>
        <pattern id="s10ht2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="#d8c8a4"/><circle cx="3.5" cy="3.5" r="2.4" fill="#4a3a24" opacity=".6"/></pattern>
        <pattern id="s10dots" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="1.4" fill="${INK}" opacity=".16"/></pattern>
        <filter id="s10mis" x="-10%" y="-10%" width="120%" height="120%"><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 .66  0 0 0 0 .2  0 0 0 0 .12  0 0 0 .45 0" result="r"/><feOffset in="r" dx="5" dy="-3" result="ro"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 .15  0 0 0 0 .35  0 0 0 0 .45  0 0 0 .35 0" result="b"/><feOffset in="b" dx="-4" dy="3" result="bo"/><feMerge><feMergeNode in="ro"/><feMergeNode in="bo"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="s10paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .02" numOctaves="4" seed="10" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .45  0 0 0 0 .3  0 0 0 0 .12  0 0 0 1.4 -.6"/></filter>
        <filter id="s10rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3"/></filter>
        <radialGradient id="s10vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#5a3a10" stop-opacity="0"/><stop offset="1" stop-color="#5a3a10" stop-opacity=".45"/></radialGradient>
        <radialGradient id="s10dev" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#f4ead0" stop-opacity="0"/><stop offset="1" stop-color="#f4ead0" stop-opacity=".9"/></radialGradient>`);
      const R = rng(1010);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="${SEP}"/><rect width="1920" height="1080" filter="url(#s10paper)" opacity=".55"/>`);
      // 背景报纸版面（远）
      let np = `<rect x="-200" y="40" width="3000" height="760" fill="#e6d8b8" opacity=".55"/>`;
      np += `<text x="120" y="150" font-family="'KingHwa_OldSong','Huiwen-mincho'" font-size="96" fill="${INK}" opacity=".7">鹈鹕日报</text><text x="620" y="140" font-family="'Playfair Display'" font-weight="900" font-size="52" fill="${INK}" opacity=".7" letter-spacing="4">THE PELICAN GAZETTE</text>`;
      np += `<path d="M-200,175H2800M-200,183H2800" stroke="${INK}" stroke-width="3" opacity=".6"/><text x="120" y="208" font-family="'Kingthings Trypewriter 2','Courier Prime'" font-size="20" fill="${INK}" opacity=".7">第 MCMXXII 号 · 星期三 · 有雾 · 每份铜元二枚</text>`;
      for (let c = 0; c < 12; c++) { const x = -150 + c * 240; np += textLines(x, 240, 210, 36, R); np += `<path d="M${x + 225},230V760" stroke="${INK}" stroke-width="1" opacity=".4"/>`; }
      np += `<g opacity=".8">${astro(1500, 470, 230, R)}</g>${ring(400, 520, 170, R)}`;
      np += `<g transform="translate(2150,300)"><rect width="300" height="380" fill="#c8b48c" stroke="${INK}" stroke-width="3"/><rect x="16" y="16" width="268" height="300" fill="#8a7454"/><path d="M60,316Q150,140 240,316Z" fill="#5a4630"/><circle cx="150" cy="140" r="40" fill="#5a4630"/><text x="150" y="350" text-anchor="middle" font-family="'Kingthings Trypewriter 2'" font-size="18" fill="${INK}">fig. 3 — 夜行者</text></g>`;
      this.L.push(layer(root, 0.12, np));
      // 中景：神秘符号与印章
      let mid = '';
      mid += `<g transform="translate(980,330)" opacity=".85"><path d="M0,-110L95,55H-95Z" fill="none" stroke="${INK}" stroke-width="3"/><path d="M-46,10Q0,-34 46,10Q0,54 -46,10Z" fill="#e6d8b8" stroke="${INK}" stroke-width="2.5"/><circle cy="10" r="15" fill="${INK}"/>${Array.from({ length: 16 }, (_, i) => `<path d="M${f1(Math.cos(i * TAU / 16) * 130)},${f1(Math.sin(i * TAU / 16) * 130 - 10)}L${f1(Math.cos(i * TAU / 16) * 160)},${f1(Math.sin(i * TAU / 16) * 160 - 10)}" stroke="${INK}" stroke-width="2"/>`).join('')}</g>`;
      for (let i = 0; i < 6; i++) { const x = 160 + i * 130; mid += `<circle cx="${x}" cy="760" r="34" fill="${INK}" opacity=".75"/><circle cx="${x + (i - 2.5) * 9}" cy="760" r="34" fill="${SEP}"/>`; }
      mid += `<g transform="translate(1720,700) rotate(-14)" filter="url(#s10rough)" opacity=".8"><circle r="80" fill="none" stroke="${RED}" stroke-width="8"/><circle r="64" fill="none" stroke="${RED}" stroke-width="3"/><text y="18" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="54" fill="${RED}">秘</text><text y="-36" text-anchor="middle" font-family="'Kingthings Trypewriter 2'" font-size="16" fill="${RED}">· ARCANA ·</text></g>`;
      mid += `<g transform="translate(2500,560) rotate(8)" filter="url(#s10rough)" opacity=".8"><rect x="-120" y="-50" width="240" height="100" fill="none" stroke="${RED}" stroke-width="6"/><text y="16" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="48" fill="${RED}">已 核 准</text></g>`;
      this.L.push(layer(root, 0.35, mid));
      // 路面：版面分隔线
      let rd = `<rect x="-800" y="${GY}" width="6400" height="200" fill="#e2d4b4"/><path d="M-800,${GY + 2}H5600" stroke="${INK}" stroke-width="5"/><path d="M-800,${GY + 12}H5600" stroke="${INK}" stroke-width="1.6"/>`;
      for (let i = 0; i < 260; i++) rd += `<path d="M${-800 + i * 26},${GY + 40}l18,30" stroke="${INK}" stroke-width="1.5" opacity=".35"/>`;
      rd += `<text x="-700" y="${GY + 140}" font-family="'Kingthings Trypewriter 2'" font-size="26" fill="${INK}" opacity=".6" letter-spacing="6">${'· 本报讯 · 一只鹈鹕骑车穿过城市 · 目击者称其画法屡次改变 · 专家对此不予置评 '.repeat(5)}</text>`;
      rd += `<g transform="translate(1520,${GY})"><path d="M0,0V-110" stroke="${INK}" stroke-width="5"/><rect x="-80" y="-200" width="160" height="96" fill="#efe4c8" stroke="${INK}" stroke-width="3"/><rect x="-72" y="-192" width="144" height="80" fill="none" stroke="${INK}" stroke-width="1"/><text y="-150" text-anchor="middle" font-family="'Playfair Display'" font-weight="900" font-size="40" fill="${INK}">No.10</text><text y="-124" text-anchor="middle" font-family="'Kingthings Trypewriter 2'" font-size="14" fill="${INK}">MILE · 拾</text></g>`;
      this.L.push(layer(root, 1, rd));
      // 高光：头版（中景，鹈鹕骑进去）
      this.front = mk('g', {}, root);
      let fp = `<rect x="0" y="0" width="1000" height="620" fill="#efe4c8" stroke="${INK}" stroke-width="4"/><rect x="12" y="12" width="976" height="596" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
      fp += `<text x="500" y="88" text-anchor="middle" font-family="'KingHwa_OldSong','Huiwen-mincho'" font-size="70" fill="${INK}">鹈 鹕 日 报</text><path d="M30,110H970M30,118H970" stroke="${INK}" stroke-width="2.5"/>`;
      fp += `<g class="hl1"></g><g class="hl2"></g>`;
      fp += `<rect class="phbox" x="560" y="250" width="400" height="320" fill="#f4ead0" stroke="${INK}" stroke-width="3"/><g class="photo"><rect x="566" y="256" width="388" height="308" fill="#8a7454"/><rect x="566" y="256" width="388" height="200" fill="#b8a07a"/><g class="phpel"></g></g><rect class="dev" x="566" y="256" width="388" height="308" fill="url(#s10dev)"/>`;
      fp += textLines(40, 400, 240, 13, R) + textLines(300, 400, 240, 13, R);
      fp += `<text x="760" y="596" text-anchor="middle" font-family="'Kingthings Trypewriter 2'" font-size="18" fill="${INK}">本报记者摄于显影室</text>`;
      this.front.innerHTML = fp;
      this.hl1 = q(this.front, '.hl1'); this.hl2 = q(this.front, '.hl2'); this.photo = q(this.front, '.photo'); this.dev = q(this.front, '.dev');
      const H1 = '号外！', H2 = '鹈鹕骑车穿城而过';
      this.h1c = Array.from(H1).map((c, i) => add(this.hl1, `<text x="${60 + i * 110}" y="240" font-family="'Source Han Serif CN'" font-weight="900" font-size="104" fill="${RED}">${c}</text>`));
      this.h2c = Array.from(H2).map((c, i) => add(this.hl2, `<text x="${40 + i * 62}" y="350" font-family="'KingHwa_OldSong','Source Han Serif CN'" font-weight="900" font-size="60" fill="${INK}">${c}</text>`));
      this.ppel = PELICANS.s10(); this.ppel.g.removeAttribute('filter');
      q(this.front, '.phpel').appendChild(this.ppel.g); this.ppel.update(.3, 0); this.ppel.g.setAttribute('transform', 'translate(760,540) scale(.62)');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s10(); this.pg.appendChild(this.pel.g);
      // 纸面：折痕、暗角、网点
      add(root, `<rect width="1920" height="1080" fill="url(#s10dots)"/><path d="M640,0V1080M0,540H1920" stroke="#fff8e8" stroke-width="3" opacity=".5"/><path d="M643,0V1080M0,543H1920" stroke="#7a5a30" stroke-width="1.5" opacity=".35"/><rect width="1920" height="1080" fill="url(#s10vig)"/>`);
      // 标题
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<rect x="110" y="70" width="760" height="210" fill="#efe4c8" stroke="${INK}" stroke-width="5"/><rect x="122" y="82" width="736" height="186" fill="none" stroke="${INK}" stroke-width="1.5"/>
        <text x="490" y="182" text-anchor="middle" font-family="'KingHwa_OldSong','Huiwen-mincho','Source Han Serif CN'" font-size="82" fill="${INK}">复古神秘学印刷风</text><path d="M150,206H830" stroke="${INK}" stroke-width="2"/>
        <text x="490" y="248" text-anchor="middle" font-family="'Playfair Display'" font-weight="700" font-style="italic" font-size="34" letter-spacing="4" fill="${RED}">Retro Occult Print</text>`;
      // 出口：报纸的版框
      this.box = mk('g', {}, root);
      this.box.innerHTML = `<path d="M-330,40V-590H330V40H280V-540H-280V40Z" fill="${INK}"/><path d="M-312,30V-572H312V30" fill="none" stroke="#efe4c8" stroke-width="2"/>${[[-330, -590], [330, -590]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="22" fill="${INK}"/><circle cx="${p[0]}" cy="${p[1]}" r="11" fill="#efe4c8"/>`).join('')}<text x="0" y="-604" text-anchor="middle" font-family="'Playfair Display'" font-weight="900" font-size="30" fill="${INK}" letter-spacing="6">— CONTINUED ON NEXT PAGE —</text>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 头版：1.6 落下，铅字逐行排出标题，照片在显影液里浮现
      const fk = eob(inv(1.55, 1.95, lt)), fo = inv(4.2, 4.6, lt);
      vis(this.front, lt > 1.5 && lt < 4.6);
      at(this.front, { transform: `translate(${f1(880 - fo * 1500)},${f1(140 - (1 - fk) * 700)}) rotate(${f1((1 - fk) * -8 + fo * -6)})` });
      this.h1c.forEach((e, i) => { const a = 2.0 + i * .1, k = inv(a, a + .08, lt); at(e, { opacity: k > 0 ? 1 : 0, transform: `translate(0,${f1((1 - k) * -40)})` }); });
      this.h2c.forEach((e, i) => { const a = 2.4 + i * .08, k = inv(a, a + .06, lt); at(e, { opacity: k > 0 ? 1 : 0, transform: `translate(0,${f1((1 - k) * -30)})` }); });
      const dv = ss(2.3, 3.8, lt);
      op(this.photo, dv);
      op(this.dev, 1 - dv * .85);
      this.dev.setAttribute('transform', `translate(0,${f1(Math.sin(lt * 5) * 4)})`);
      const ti = eo(inv(0.15, 0.5, lt)), to = inv(1.5, 1.8, lt);
      at(this.title, { opacity: f2(ti * (1 - to)), transform: `translate(0,${f1(-to * 30)})` });
      const fx = frameScreenX(lt), bk = eob(inv(3.7, 4.1, lt));
      vis(this.box, lt > 3.65);
      at(this.box, { transform: `translate(${f1(fx)},${GY + 30}) scale(${f2(bk)},1)` });
    },
    exitFx: {
      win: [-0.05, 1.2],
      build(g) {
        const chars = '鹈鹕骑车穿城而过号外'.split('');
        const tgt = 'No.11-0472-B'.split('');
        let s = `<g class="haz" opacity="0"><rect x="0" y="0" width="1920" height="40" fill="url(#s11haz)"/><rect x="0" y="1040" width="1920" height="40" fill="url(#s11haz)"/></g>`;
        chars.forEach((c, i) => { s += `<text class="tc" font-family="'KingHwa_OldSong','Source Han Serif CN'" font-weight="900" font-size="60" fill="${INK}" text-anchor="middle">${c}</text>`; });
        tgt.forEach((c, i) => { s += `<text class="tn" font-family="'Bender','DIN 1451 Std Engschrift','Bahnschrift'" font-weight="900" font-size="64" fill="#1a1a1a" text-anchor="middle">${c}</text>`; });
        let bc = ''; const R = rng(1110); let x = 0; for (let i = 0; i < 46; i++) { const w = 2 + Math.floor(R() * 4) * 2; if (i % 2 === 0) bc += `<rect x="${x}" y="0" width="${w}" height="70" fill="#1a1a1a"/>`; x += w; }
        s += `<g class="bc">${bc}</g>`;
        g.innerHTML = s;
        this.tc = qa(g, '.tc'); this.tn = qa(g, '.tn'); this.bc = q(g, '.bc'); this.haz = q(g, '.haz');
      },
      update(u) {
        const k = eio(inv(0, 0.45, u)), o = 1 - ss(0.75, 1.15, u);
        this.tc.forEach((e, i) => { const x0 = 960 + (i - 4.5) * 64, y0 = 480; const x1 = 1180 + i * 22, y1 = 210; at(e, { x: f1(lerp(x0, x1, k)), y: f1(lerp(y0, y1, k)), opacity: f2((1 - k) * (u > 0 ? 1 : inv(-0.05, 0, u))), transform: '' }); });
        this.tn.forEach((e, i) => { at(e, { x: f1(1180 + i * 40), y: 230, opacity: f2(ss(.2, .45, u) * o) }); });
        at(this.bc, { transform: `translate(1180,250) scale(${f2(ss(.25, .5, u))},1)`, opacity: f2(o) });
        op(this.haz, ss(0.05, 0.2, u) * (0.6 + 0.4 * (Math.floor(u * 8) % 2)) * o);
      }
    }
  });
})();
