'use strict';
/* ---------------- No.07 偶像音游风 ---------------- */
(function () {
  const PK = '#ff3fa8', CY = '#2be8ff', YL = '#ffe14a', PU = '#b04aff';
  PELICANS.s07 = () => {
    const p = makePelican({
      line: '#2a1030', lw: 3, body: '#ffffff', wing: '#fff0fa', beak: '#ffb02e', pouch: '#ffd46a', eye: '#2a1030',
      shade: { body: ['#e6d0f0', 8, -9], neck: ['#e6d0f0', 5, -3], head: ['#e6d0f0', 4, -4], wing: ['#e8c8f0', 5, -6] },
      leg: '#ff9a3a', legFar: '#d87a2a', legW: 9, tire: '#2a1030', tireW: 7, spoke: CY, spokeW: 1.6, spokes: 14, rimW: 2, rimC: PK,
      frame: PK, frameW: 8, frameUnder: '#2a1030', frameUnderW: 2, frameLine: '#ffd0ec', frameLineW: 2, saddle: '#2a1030', bar: '#2a1030', crank: '#2a1030', hub: YL, fish: CY,
      upFront: `<path d="M-60,-268C-30,-276 10,-272 30,-252C40,-232 34,-206 16,-190C-10,-196 -40,-206 -62,-222Z" fill="${PK}" stroke="#2a1030" stroke-width="3" stroke-linejoin="round"/>
        <path d="M30,-252C16,-236 6,-214 16,-190" stroke="${YL}" stroke-width="5" fill="none"/>${Array.from({ length: 12 }, (_, i) => `<circle cx="${-50 + (i % 4) * 20}" cy="${-258 + Math.floor(i / 4) * 18 + (i % 2) * 6}" r="2.6" fill="#fff" class="sq"/>`).join('')}
        <path d="M8,-262L-6,-272L-6,-252ZM8,-262L22,-272L22,-252Z" fill="${CY}" stroke="#2a1030" stroke-width="2.5" stroke-linejoin="round"/><circle cx="8" cy="-262" r="5" fill="${YL}" stroke="#2a1030" stroke-width="2"/>`,
      headExtra: `<path d="${P(starPts(32, -372, 14, 6, 5), true)}" fill="${YL}" stroke="#2a1030" stroke-width="2.5" stroke-linejoin="round"/><path d="M26,-340C40,-320 70,-318 86,-330" stroke="#2a1030" stroke-width="2.5" fill="none"/><circle cx="88" cy="-331" r="5" fill="#2a1030"/>`
    });
    p.sq = qa(p.g, '.sq');
    p.onUpdate = (ps, tau) => { p.sq.forEach((c, i) => c.setAttribute('opacity', f2(.4 + .6 * Math.abs(Math.sin(tau * 5 + i * 1.3))))); };
    return p;
  };
  const NOTES = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5];   // 判定时刻（局部时间）：每一下踏板
  const MISS = 3.9;
  SCENES.push({
    key: 's07', zh: '偶像音游风', en: 'Idol Rhythm Game',
    build(root) {
      def(`<linearGradient id="s07bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14031f"/><stop offset=".5" stop-color="#3a0a5e"/><stop offset="1" stop-color="#12021c"/></linearGradient>
        <linearGradient id="s07beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient id="s07led" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${PU}"/><stop offset=".5" stop-color="${PK}"/><stop offset="1" stop-color="${CY}"/></linearGradient>
        <linearGradient id="s07title" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ad0"/><stop offset=".5" stop-color="#ff3fa8"/><stop offset="1" stop-color="#8a3aff"/></linearGradient>
        <linearGradient id="s07lane" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a0630" stop-opacity="0"/><stop offset="1" stop-color="#1a0630" stop-opacity=".75"/></linearGradient>
        <filter id="s07glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <pattern id="s07dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="4.5" fill="#000" opacity=".45"/></pattern>`);
      const R = rng(707);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s07bg)"/>`);
      // LED 大屏
      let led = `<rect x="160" y="150" width="1600" height="520" rx="20" fill="url(#s07led)" opacity=".85"/><rect class="ledw" x="160" y="150" width="1600" height="520" rx="20" fill="#fff" opacity="0"/>`;
      for (let i = 0; i < 6; i++) led += `<path d="M${160 + i * 320},670L${400 + i * 320},150" stroke="#fff" stroke-width="40" opacity=".12"/>`;
      led += `<text x="960" y="470" text-anchor="middle" font-family="'Gilroy','Poppins'" font-weight="900" font-style="italic" font-size="190" fill="#fff" opacity=".22" letter-spacing="10">PELICAN LIVE</text>`;
      led += `<rect x="160" y="150" width="1600" height="520" rx="20" fill="url(#s07dots)"/>`;
      this.L.push(layer(root, 0.06, led));
      this.ledw = q(root, '.ledw');
      // 桁架与灯
      let ts = `<rect x="-200" y="60" width="2400" height="40" fill="#2a1a3a"/>` + Array.from({ length: 50 }, (_, i) => `<path d="M${-200 + i * 50},60l25,40l25,-40" stroke="#5a4a6a" stroke-width="3" fill="none"/>`).join('');
      for (let i = 0; i < 9; i++) ts += `<circle cx="${100 + i * 220}" cy="110" r="16" fill="${[PK, CY, YL][i % 3]}" filter="url(#s07glow)"/>`;
      this.L.push(layer(root, 0.03, ts));
      this.beams = mk('g', { style: 'mix-blend-mode:screen' }, root);
      this.beams.innerHTML = Array.from({ length: 6 }, (_, i) => `<path class="bm" d="M-30,0L30,0L260,1100L-260,1100Z" fill="url(#s07beam)" opacity=".5" style="fill:${[PK, CY, '#fff', YL, PK, CY][i]};fill-opacity:.22"/>`).join('');
      this.bm = qa(this.beams, '.bm');
      // 舞台地面
      let st = `<rect x="-800" y="${GY}" width="6400" height="200" fill="#120418"/><rect x="-800" y="${GY}" width="6400" height="6" fill="${PK}" filter="url(#s07glow)"/>`;
      for (let i = 0; i < 90; i++) st += `<rect x="${-800 + i * 72}" y="${GY + 14}" width="40" height="5" rx="2" fill="${[PK, CY, YL, PU][i % 4]}" opacity=".8"/>`;
      st += `<g transform="translate(1600,${GY})"><rect x="-90" y="-160" width="180" height="100" rx="12" fill="#1a0630" stroke="${CY}" stroke-width="4" filter="url(#s07glow)"/><text x="0" y="-96" text-anchor="middle" font-family="'Gilroy'" font-weight="900" font-style="italic" font-size="48" fill="${CY}">No.07</text><path d="M-40,-60L-60,0M40,-60L60,0" stroke="#5a4a6a" stroke-width="6"/></g>`;
      this.L.push(layer(root, 1, st));
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s07(); this.pg.appendChild(this.pel.g);
      // 荧光棒的海洋
      this.rows = [];
      for (let r = 0; r < 3; r++) {
        let s = '';
        for (let i = 0; i < 46; i++) { const x = -60 + i * 44 + R() * 20 + r * 18; const c = [PK, CY, YL, PU, '#ffffff'][Math.floor(R() * 5)]; s += `<g transform="translate(${f1(x)},0)"><path d="M0,0V-${f1(46 + r * 10)}" stroke="${c}" stroke-width="${7 + r * 2}" stroke-linecap="round"/><circle cy="12" r="${12 + r * 3}" fill="#120418"/></g>`; }
        const g = add(root, `<g transform="translate(0,${1000 + r * 46})"><g class="rw" filter="url(#s07glow)">${s}</g></g>`);
        this.rows.push(q(g, '.rw'));
      }
      // 音游界面（虚构）：五条轨道汇向判定线
      let ui = `<path d="M1430,140L1530,140L1880,840L1300,840Z" fill="url(#s07lane)" stroke="#fff" stroke-opacity=".4" stroke-width="2"/>`;
      for (let i = 1; i < 5; i++) ui += `<path d="M${1430 + i * 20},140L${1300 + i * 116},840" stroke="#fff" stroke-opacity=".22" stroke-width="2"/>`;
      ui += `<path d="M1290,840H1890" stroke="#fff" stroke-width="8" filter="url(#s07glow)"/><path d="M1290,840H1890" stroke="${PK}" stroke-width="3"/>`;
      ui += `<g class="notes">${NOTES.concat([MISS]).map((n, i) => `<rect class="nt" x="-50" y="-11" width="100" height="22" rx="11" fill="${i % 2 ? CY : PK}" stroke="#fff" stroke-width="3"/>`).join('')}</g>`;
      ui += `<g class="judge" filter="url(#s07glow)"><text class="jt" x="0" y="0" text-anchor="middle" font-family="'Gilroy','Poppins'" font-weight="900" font-style="italic" font-size="64" fill="#fff" stroke="${PK}" stroke-width="3" paint-order="stroke"></text></g>`;
      ui += `<g transform="translate(1590,620)"><text class="cb" text-anchor="middle" font-family="'Gilroy','Poppins'" font-weight="900" font-style="italic" font-size="96" fill="#fff" opacity=".95">0</text><text y="40" text-anchor="middle" font-family="'Gilroy'" font-weight="800" font-size="30" letter-spacing="8" fill="${YL}">COMBO</text></g>`;
      ui += `<g transform="translate(60,40)"><rect width="520" height="96" rx="16" fill="#1a0630" fill-opacity=".7" stroke="${PK}" stroke-width="3"/><text x="24" y="40" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="28" fill="#fff">♪ 二十二种画法 (Live ver.)</text><text x="24" y="76" font-family="'Gilroy'" font-weight="800" font-size="22" fill="${YL}" letter-spacing="3">MASTER · LV.22</text><rect x="250" y="60" width="240" height="14" rx="7" fill="#3a1a4a"/><rect class="life" x="250" y="60" width="210" height="14" rx="7" fill="${CY}"/></g>`;
      ui += `<g transform="translate(1860,90)"><text text-anchor="end" font-family="'Gilroy'" font-weight="800" font-size="22" letter-spacing="4" fill="${CY}">SCORE</text><text class="sc" y="54" text-anchor="end" font-family="'Gilroy'" font-weight="900" font-size="54" fill="#fff">0000000</text></g>`;
      this.ui = mk('g', {}, root); this.ui.innerHTML = ui;
      this.nt = qa(this.ui, '.nt'); this.jt = q(this.ui, '.jt'); this.cbT = q(this.ui, '.cb'); this.scT = q(this.ui, '.sc'); this.life = q(this.ui, '.life');
      // 标题
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g class="tt" filter="url(#s07glow)"><text x="0" y="0" text-anchor="middle" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="120" font-style="italic" fill="url(#s07title)" stroke="#fff" stroke-width="10" paint-order="stroke" transform="skewX(-10)">偶像音游风</text>
        <text x="0" y="70" text-anchor="middle" font-family="'Gilroy','Poppins'" font-weight="900" font-style="italic" font-size="44" letter-spacing="10" fill="${YL}" stroke="#2a1030" stroke-width="6" paint-order="stroke">IDOL RHYTHM GAME</text>
        <path d="${P(starPts(-330, -60, 40, 16, 5), true)}" fill="${YL}"/><path d="${P(starPts(340, -80, 26, 10, 5), true)}" fill="${CY}"/></g>`;
      this.tt = q(this.title, '.tt');
      // 出口：舞台台口
      this.pros = mk('g', {}, root);
      let pm = `<path d="M-460,40V-700H460V40H290V-480Q0,-560 -290,-480V40Z" fill="#7a0a2a" stroke="${YL}" stroke-width="6"/>`;
      for (let i = 0; i < 6; i++) pm += `<path d="M${-450 + i * 28},40V-690" stroke="#4a0418" stroke-width="6"/><path d="M${310 + i * 26},40V-690" stroke="#4a0418" stroke-width="6"/>`;
      pm += `<path d="M-290,-480Q0,-560 290,-480" fill="none" stroke="${YL}" stroke-width="10"/><text x="0" y="-590" text-anchor="middle" font-family="'Gilroy'" font-weight="900" font-style="italic" font-size="50" fill="${YL}">ENCORE ▸</text>`;
      this.pros.innerHTML = pm;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.bm.forEach((b, i) => b.setAttribute('transform', `translate(${200 + i * 300},90) rotate(${f1(Math.sin(lt * 1.6 + i * 1.1) * 28)})`));
      this.rows.forEach((r, i) => r.setAttribute('transform', `skewX(${f1(Math.sin(TAU * lt * .5 + i * .6) * 22)})`));
      op(this.ledw, bump(fr(lt * 2 + .02) - 0.02, .06) * .18);
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      // 音符下落
      const fallT = 1.0;
      const all = NOTES.concat([MISS]);
      let combo = 96, judge = '', jAge = 9, score = 960000;
      all.forEach((n, i) => {
        const k = (lt - (n - fallT)) / fallT;
        const e = this.nt[i];
        const lane = [0, 2, 4, 1, 3, 2, 0, 4, 3][i];
        const miss = n === MISS;
        if (k < 0 || k > (miss ? 1.25 : 1.0)) { op(e, 0); }
        else {
          const y = 140 + 700 * k * k * .3 + 700 * k * .7, wscale = .25 + .75 * k;
          const xt = 1440 + lane * 20, xb = 1358 + lane * 116, x = lerp(xt, xb, (y - 140) / 700);
          at(e, { transform: `translate(${f1(x)},${f1(y)}) scale(${f2(wscale)},${f2(wscale)})`, opacity: miss && k > 1 ? f2(1 - (k - 1) * 4) : 1 });
        }
        if (lt >= n) { if (miss) { combo = 0; judge = 'MISS'; jAge = lt - n; } else { combo++; score += 12000 + combo * 50; judge = 'PERFECT'; jAge = lt - n; } }
      });
      this.cbT.textContent = String(combo);
      at(this.cbT, { transform: `scale(${f2(1 + bump(jAge, .07) * .25)})`, fill: combo === 0 ? '#aaa' : '#fff' });
      this.scT.textContent = String(Math.round(score)).padStart(7, '0');
      this.jt.textContent = jAge < .45 ? judge : '';
      at(this.jt, { fill: judge === 'MISS' ? '#9a9aa8' : '#fff', stroke: judge === 'MISS' ? '#444' : PK, transform: `translate(1590,${f1(770 - jAge * 60)}) scale(${f2(1 + bump(jAge, .06) * .3)})`, opacity: f2(1 - ss(.3, .45, jAge)) });
      at(this.life, { width: f1(judge === 'MISS' && lt > MISS ? 170 : 210) });
      const ti = eob(inv(0.15, 0.45, lt)), to = inv(1.8, 2.05, lt);
      vis(this.title, lt > 0.1 && to < 1);
      at(this.tt, { transform: `translate(${f1(760 + to * 1400)},${300}) scale(${f2(ti)})` });
      op(this.ui, ss(0, .3, lt));
      const fx = frameScreenX(lt), pk = eo(inv(3.7, 4.2, lt));
      vis(this.pros, lt > 3.65);
      at(this.pros, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(pk) });
    },
    openD(lt, cx) { const by = GY + 30; return `M${f1(cx - 290)},${by}V${by - 480}Q${f1(cx)},${by - 560} ${f1(cx + 290)},${by - 480}V${by}Z`; },
    ow: 580,
    exitFx: {
      win: [-0.02, 0.6],
      build(g) { g.innerHTML = `<rect class="bk" width="1920" height="1080" fill="#000"/><text class="tx" x="960" y="560" text-anchor="middle" font-family="'Gilroy'" font-weight="800" font-size="26" letter-spacing="12" fill="#fff" opacity=".5">— LIGHTS OFF —</text>`; this.bk = q(g, '.bk'); this.tx = q(g, '.tx'); },
      update(u) { const o = u < 0 ? 0 : 1 - ss(0.12, 0.5, u); op(this.bk, o); op(this.tx, o * .6 * (u > .02 ? 1 : 0)); }
    }
  });
})();

/* ---------------- No.08 日系赛璐珞动画 ---------------- */
(function () {
  const OL = '#1a1a22';
  PELICANS.s08 = () => {
    const p = makePelican({
      line: OL, lw: 3.2, body: '#ffffff', wing: '#ffffff', beak: '#ffa63a', pouch: '#ffcf70', eye: OL,
      shade: { body: ['#c6cde6', 10, -12], neck: ['#c6cde6', 7, -2], head: ['#c6cde6', 6, -5], wing: ['#c6cde6', 7, -7], pouch: ['#e8913a', 0, -8], beak: ['#e07f22', 0, -5] },
      shade2: { body: ['#9fa8cc', 24, -26], wing: ['#a8b0d4', 16, -14] },
      leg: '#ff9a2e', legFar: '#c8701a', legW: 9, footLine: OL, tire: OL, tireW: 7, spoke: '#8a8a9a', spokeW: 1.5, spokes: 16,
      frame: '#e23a3a', frameW: 8, frameUnder: OL, frameUnderW: 2, frameLine: '#ff9a9a', frameLineW: 1.5, saddle: OL, bar: OL, crank: OL, hub: '#ddd', fish: '#5ab0ff',
      eyeMk: () => `<ellipse cx="48" cy="-354" rx="5" ry="6.5" fill="${OL}"/><circle cx="46.5" cy="-357" r="2" fill="#fff"/><path class="brow" d="M38,-366L58,-362" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`,
      headExtra: `<g class="toast" opacity="0"><path d="M150,-352C140,-368 150,-384 170,-382C176,-394 200,-394 206,-380C224,-378 228,-360 216,-350L204,-318L156,-324Z" fill="#f4d08a" stroke="${OL}" stroke-width="3" stroke-linejoin="round"/><path d="M160,-348C154,-362 162,-372 174,-370C180,-380 196,-380 200,-370C212,-368 214,-356 206,-350L198,-328L162,-332Z" fill="#fff6dc"/><path d="M168,-344l18,4M172,-352l10,2" stroke="#e8b860" stroke-width="2.5"/></g>`,
      wingExtra: `<path d="M-30,-250L-20,-262L-4,-258Z" fill="#fff"/>`
    });
    p.toast = q(p.g, '.toast');
    return p;
  };
  SCENES.push({
    key: 's08', zh: '日系赛璐珞动画', en: 'Cel Anime',
    build(root) {
      def(`<linearGradient id="s08sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f86e6"/><stop offset=".6" stop-color="#76b8f4"/><stop offset="1" stop-color="#cfe8fb"/></linearGradient>
        <filter id="s08wc" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="3" seed="8" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .2  0 0 0 0 .25  0 0 0 0 .4  0 0 0 1.2 -.55"/></filter>
        <filter id="s08grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="2"/><feColorMatrix type="matrix" values="0 0 0 0 .3  0 0 0 0 .3  0 0 0 0 .3  0 0 0 -1.6 1"/></filter>`);
      const R = rng(808);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s08sky)"/><rect width="1920" height="1080" filter="url(#s08wc)" opacity=".35"/>`);
      // 团块云：两层平涂
      const cloud = (x, y, s) => { let a = '', b = ''; const cs = [[0, 0, 70], [70, -40, 90], [160, -10, 80], [240, 10, 60], [90, 30, 70], [-60, 25, 50]]; for (const c of cs) { a += `<circle cx="${x + c[0] * s}" cy="${y + c[1] * s}" r="${c[2] * s}" fill="#b8cbe8"/>`; b += `<circle cx="${x + c[0] * s - 14 * s}" cy="${y + c[1] * s - 16 * s}" r="${c[2] * s * .92}" fill="#fff"/>`; } return `<g>${a}${b}</g>`; };
      let cl = ''; for (let i = 0; i < 5; i++) cl += cloud(-100 + i * 520 + R() * 100, 200 + R() * 120, .9 + R() * .7);
      this.Lc = layer(root, 0.04, cl);
      this.cloudXs = cl;
      // 背景：住宅街（可循环的一段，宽 1200）
      const TILE = 1200;
      const street = (ox) => {
        let s = '';
        const houses = [[0, 250, 230, '#e8e0cc', '#5a6a8a'], [270, 220, 260, '#f0ead8', '#8a4a3a'], [520, 300, 210, '#dfe6e0', '#4a5a7a'], [850, 260, 240, '#efe4d0', '#6a4a4a']];
        for (const h of houses) {
          const x = ox + h[0], w = h[1], ht = h[2];
          s += `<rect x="${x}" y="${800 - ht}" width="${w}" height="${ht}" fill="${h[3]}"/><path d="M${x - 20},${800 - ht}L${x + w / 2},${800 - ht - 90}L${x + w + 20},${800 - ht}Z" fill="${h[4]}"/><path d="M${x - 20},${800 - ht}H${x + w + 20}" stroke="#3a3a4a" stroke-width="4"/>`;
          for (let j = 0; j < 2; j++) s += `<rect x="${x + 30 + j * (w - 110)}" y="${800 - ht + 40}" width="60" height="56" fill="#7aa0c8"/><rect x="${x + 30 + j * (w - 110)}" y="${800 - ht + 40}" width="60" height="18" fill="#a8c8e8"/><path d="M${x + 60 + j * (w - 110)},${800 - ht + 40}v56" stroke="${h[3]}" stroke-width="4"/>`;
          s += `<rect x="${x}" y="${800 - ht}" width="${w}" height="${ht}" fill="#000" opacity=".06" transform="translate(${w * .6},0) scale(.4,1)"/>`;
        }
        s += `<rect x="${ox}" y="740" width="${TILE}" height="60" fill="#b8b4a8"/>` + Array.from({ length: 12 }, (_, i) => `<path d="M${ox + i * 100},740v60" stroke="#9a968a" stroke-width="3"/>`).join('') + `<path d="M${ox},755H${ox + TILE}M${ox},775H${ox + TILE}" stroke="#9a968a" stroke-width="2"/>`;
        s += `<g transform="translate(${ox + 760},800)"><rect x="-40" y="-150" width="80" height="150" fill="#d83a3a"/><rect x="-32" y="-140" width="64" height="70" fill="#f4f4f8"/>${[0, 1, 2].map(i => `<rect x="${-26 + i * 20}" y="-132" width="14" height="24" rx="3" fill="${['#3a8ae8', '#e8a83a', '#3ac87a'][i]}"/>`).join('')}<rect x="-32" y="-56" width="64" height="16" fill="#222"/></g>`;
        return s;
      };
      this.Ls = layer(root, 0.35, street(0) + street(TILE) + street(TILE * 2) + street(TILE * 3));
      this.TILE = TILE;
      // 电线杆与电线
      let pl = '';
      for (let i = 0; i < 8; i++) { const x = -200 + i * 700; pl += `<rect x="${x - 9}" y="140" width="18" height="${GY - 140}" fill="#8a8478"/><rect x="${x - 50}" y="200" width="100" height="10" fill="#6a6458"/><rect x="${x - 36}" y="250" width="72" height="8" fill="#6a6458"/><rect x="${x + 12}" y="300" width="34" height="50" rx="6" fill="#9a9a90"/>`; if (i < 7) for (let w = 0; w < 3; w++) pl += `<path d="M${x - 40 + w * 40},${204 + (w % 2) * 50}Q${x + 350},${280 + w * 20} ${x + 660 + w * 40},${204 + (w % 2) * 50}" stroke="#2a2a32" stroke-width="2.5" fill="none"/>`; }
      pl += `<g transform="translate(1250,${GY})"><rect x="-6" y="-300" width="12" height="300" fill="#a8a8a8"/><circle cy="-330" r="44" fill="#ff8a3a" stroke="#fff" stroke-width="6"/><circle cy="-330" r="32" fill="#a8d0f0"/><rect x="-74" y="-230" width="148" height="60" fill="#2a5ac8" stroke="#fff" stroke-width="4"/><text y="-190" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="900" font-size="30" fill="#fff">No.08 丁目</text></g>`;
      this.Lp = layer(root, 0.75, pl);
      let rd = `<rect x="-800" y="${GY - 10}" width="6400" height="210" fill="#8a8a92"/><rect x="-800" y="${GY - 10}" width="6400" height="12" fill="#6a6a72"/><path d="M-800,${GY + 95}H5600" stroke="#fff" stroke-width="7" stroke-dasharray="80 60"/><rect x="-800" y="${GY + 150}" width="6400" height="60" fill="#7a7a82"/>`;
      this.Lr = layer(root, 1, rd);
      // 速度线（高光时）
      this.spd = mk('g', { opacity: 0 }, root);
      let sp = ''; this.spp = [];
      for (let i = 0; i < 46; i++) { sp += `<rect height="${f1(2 + R() * 7)}" fill="#fff"/>`; this.spp.push([R(), R(), R()]); }
      this.spd.innerHTML = sp; this.spe = qa(this.spd, 'rect');
      this.dust = mk('g', {}, root);
      this.dust.innerHTML = Array.from({ length: 6 }, () => `<g><circle r="22" fill="#fff" stroke="${OL}" stroke-width="3"/></g>`).join('');
      this.dc = qa(this.dust, 'g');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s08(); this.pg.appendChild(this.pel.g);
      this.pel.brow = q(this.pel.g, '.brow');
      add(root, `<rect width="1920" height="1080" filter="url(#s08grain)" opacity=".18" style="mix-blend-mode:multiply"/>`);
      // 标题：眼珠子式标题卡
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g class="tt"><path d="M-470,-120L470,-150L450,110L-490,130Z" fill="#ffd21a" stroke="${OL}" stroke-width="6"/><path d="M-450,-100L450,-128L432,92L-468,110Z" fill="none" stroke="#e23a3a" stroke-width="4"/>
        <text x="0" y="10" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="900" font-size="96" fill="#fff" stroke="${OL}" stroke-width="14" paint-order="stroke" stroke-linejoin="round" transform="rotate(-2)">日系赛璐珞动画</text>
        <text x="0" y="84" text-anchor="middle" font-family="'Futura','Montserrat'" font-weight="900" font-size="40" font-style="italic" letter-spacing="14" fill="#e23a3a" transform="rotate(-2)">CEL ANIME</text>
        <text x="-420" y="-80" font-family="'Source Han Sans CN'" font-weight="900" font-size="28" fill="${OL}" transform="rotate(-2)">第8话</text></g>`;
      this.tt = q(this.title, '.tt');
      this.late = mk('g', {}, root);
      this.late.innerHTML = `<text x="0" y="0" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="900" font-size="110" fill="#fff" stroke="${OL}" stroke-width="14" paint-order="stroke" stroke-linejoin="round" transform="rotate(-6)">要迟到啦——！</text>`;
      // 出口：天桥桥洞
      this.bridge = mk('g', {}, root);
      this.bridge.innerHTML = `<path d="M-900,-760H900V-560H-900Z" fill="#c8c4bc"/><path d="M-900,-560H900" stroke="#8a867c" stroke-width="6"/><path d="M-900,-780H900" stroke="#6a6a72" stroke-width="10"/>${Array.from({ length: 30 }, (_, i) => `<path d="M${-900 + i * 60},-780v-50" stroke="#6a6a72" stroke-width="6"/>`).join('')}<path d="M-900,-830H900" stroke="#6a6a72" stroke-width="8"/>
        <path d="M-900,40V-560H-300V40ZM300,40V-560H900V40Z" fill="#b8b4aa"/><path d="M-300,40V-560M300,40V-560" stroke="#8a867c" stroke-width="8"/><path d="M-300,-480H300" stroke="#8a867c" stroke-width="0"/>
        <rect x="-110" y="-700" width="220" height="70" fill="#2a8a4a" stroke="#fff" stroke-width="5"/><text y="-652" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="900" font-size="34" fill="#fff">驿前天桥</text>`;
    },
    tau(lt) { return lt < 2 ? lt : lt < 4 ? 2 + (lt - 2) * 2 : lt + 2; },
    update(lt) {
      const hi = ss(1.95, 2.15, lt) * (1 - ss(3.9, 4.1, lt));
      const s = stdScroll(lt);
      // 高光：背景横向循环滚动（加速），速度线拉满
      const loopS = s + 1800 * Math.max(0, Math.min(lt, 4) - 2) * hi + (lt > 4 ? 1800 * 2 : 0);
      this.Lc.g.setAttribute('transform', `translate(${f1(-s * .04)},0)`);
      this.Ls.g.setAttribute('transform', `translate(${f1(-((loopS * .35) % this.TILE) - this.TILE * .5)},0)`);
      this.Lp.g.setAttribute('transform', `translate(${f1(-((loopS * .75) % 700) - 350)},0)`);
      this.Lr.g.setAttribute('transform', `translate(${f1(-s)},0)`);
      op(this.spd, hi);
      if (hi > 0) this.spe.forEach((e, i) => { const p = this.spp[i]; const x = 1920 - fr(lt * (1.8 + p[0] * 2) + p[1]) * 3200; at(e, { x: f1(x), y: f1(80 + p[2] * 900), width: f1(300 + p[0] * 700) }); });
      const tau = this.tau(lt);
      this.pel.update(tau, s + (lt > 2 ? (Math.min(lt, 4) - 2) * 600 : 0));
      op(this.pel.toast, ss(1.75, 1.9, lt) * (1 - ss(5.6, 5.8, lt)));
      const shake = hi * Math.sin(lt * 60) * 3;
      at(this.pg, { transform: `translate(${f1(PX + shake)},${f1(GY - hi * 6)}) rotate(${f2(-4 * hi)})` });
      this.dc.forEach((d, i) => { const k = fr(lt * 3 + i / 6); at(d, { transform: `translate(${f1(PX - 160 - k * 300)},${f1(GY - 10 - k * 40)}) scale(${f2((1 - k) * hi * 1.2)})` }); });
      const lk = eob(inv(2.05, 2.25, lt)) * (1 - inv(3.8, 4.0, lt));
      vis(this.late, lk > 0.01);
      at(this.late, { transform: `translate(1320,330) scale(${f2(lk)}) rotate(${f1(Math.sin(lt * 30) * 1.5)})` });
      const ti = eob(inv(0.15, 0.45, lt)), to = inv(1.75, 1.95, lt);
      vis(this.title, lt > .1 && to < 1);
      at(this.tt, { transform: `translate(960,${f1(250)}) scale(${f2(ti * (1 - to))}) rotate(${f1((1 - ti) * -20)})` });
      const fx = frameScreenX(lt);
      vis(this.bridge, lt > 3.2);
      at(this.bridge, { transform: `translate(${f1(fx)},${GY + 30})` });
    },
    ow: 600, oh: 560,
    exitFx: {
      win: [-0.05, 1.1],
      build(g) {
        g.innerHTML = `<g style="mix-blend-mode:screen"><circle class="gl" r="500" fill="url(#s09flare)"/>${[0, 1, 2, 3].map(i => `<circle class="fl" r="${[40, 70, 26, 110][i]}" fill="${['#ffe8a8', '#a8e8ff', '#ffffff', '#ffd0f0'][i]}" opacity=".35"/>`).join('')}<path class="st" d="M-900,0H900" stroke="#fff" stroke-width="5" opacity=".6"/></g>`;
        this.gl = q(g, '.gl'); this.fl = qa(g, '.fl'); this.st = q(g, '.st');
      },
      update(u) {
        const k = ss(-0.05, 0.25, u) * (1 - ss(0.55, 1.1, u));
        at(this.gl, { cx: f1(1500 - u * 200), cy: 160, opacity: f2(k), r: f1(500 + u * 300) });
        this.fl.forEach((c, i) => { const t = [.3, .55, .8, 1.1][i]; at(c, { cx: f1(lerp(1500, 600, t) - u * 200 * t), cy: f1(lerp(160, 900, t)), opacity: f2(k * .45) }); });
        at(this.st, { transform: `translate(1500,160) rotate(${f1(-20 + u * 8)})`, opacity: f2(k * .5) });
      }
    }
  });
})();
