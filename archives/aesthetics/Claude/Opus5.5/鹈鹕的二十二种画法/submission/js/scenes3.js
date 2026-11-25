'use strict';
/* ---------------- No.05 Galgame 美术风 ---------------- */
(function () {
  const LN = '#6a4a5a', PK = '#ff8fb4', TX = '#5a3a4a';
  PELICANS.s05 = () => {
    const p = makePelican({
      line: '#4a2a3a', lw: 2.6, body: '#fffdfd', wing: '#fbf8ff', beak: '#ffb46a', pouch: '#ffd9a0', eye: '#3a2030',
      rim: { body: ['#ffffff', -3, 3] },
      shade: { body: ['#efe0f2', 9, -11], neck: ['#efe0f2', 6, -3], head: ['#efe0f2', 5, -5], wing: ['#e9dcf2', 5, -6], pouch: ['#f4b07a', 0, -6], beak: ['#f08f4a', 0, -4] },
      shade2: { body: ['#dccbe8', 20, -24], wing: ['#d8c8ea', 12, -12] },
      leg: '#ffa070', legFar: '#e2806a', legW: 8, tire: '#5a4a6a', tireW: 6, spoke: '#d8c8e0', spokeW: 1, spokes: 20,
      frame: '#bff0e0', frameW: 8, frameUnder: LN, frameUnderW: 1.2, frameLine: '#ffffff', frameLineW: 2, saddle: '#7a5a8a', bar: LN, crank: LN, hub: PK, fish: '#9fd8ff', crestC: '#f6eefa',
      eyeMk: () => `<ellipse cx="49" cy="-354" rx="7.5" ry="9" fill="#4a2a40"/><ellipse cx="49" cy="-351" rx="5.5" ry="6" fill="#b0487a"/><ellipse cx="49" cy="-349" rx="4" ry="3.6" fill="#ff9ac4"/><circle cx="46.5" cy="-357" r="2.8" fill="#fff"/><circle cx="52" cy="-350" r="1.3" fill="#fff"/><path d="M40,-364Q49,-368 58,-362" stroke="#3a2030" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
      headExtra: `<ellipse cx="64" cy="-334" rx="11" ry="5" fill="#ff9fbd" opacity=".55"/><path d="M58,-336l3,-4M63,-336l3,-4M68,-336l3,-4" stroke="#ff7aa8" stroke-width="1.2"/><path d="M80,-356C110,-352 150,-344 190,-337" stroke="#fff" stroke-width="2.5" fill="none" opacity=".8" stroke-linecap="round"/>`,
      wingExtra: `<path d="M-6,-252C-40,-256 -72,-246 -96,-232" stroke="#fff" stroke-width="3" fill="none" opacity=".9" stroke-linecap="round"/>`
    });
    return p;
  };
  const TXT0 = '（今天的风里，好像有樱花的味道。）', TXT1 = '……那个，一起回家吗？';
  SCENES.push({
    key: 's05', zh: 'Galgame 美术风', en: 'Galgame Art',
    build(root) {
      def(`<linearGradient id="s05sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd2ff"/><stop offset=".55" stop-color="#d8ecff"/><stop offset="1" stop-color="#ffe4ee"/></linearGradient>
        <radialGradient id="s05sun" cx=".15" cy=".05" r=".9"><stop offset="0" stop-color="#fffbe8" stop-opacity=".95"/><stop offset=".35" stop-color="#fff2e0" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <linearGradient id="s05box" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".88"/><stop offset="1" stop-color="#ffe6f0" stop-opacity=".82"/></linearGradient>
        <radialGradient id="s05bl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd6e6"/><stop offset=".7" stop-color="#ffb8d0"/><stop offset="1" stop-color="#ff9fc0"/></radialGradient>
        <filter id="s05soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
        <filter id="s05blur8" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
        <filter id="s05sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#b05070" flood-opacity=".25"/></filter>`);
      const R = rng(505);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s05sky)"/>`);
      let cl = ''; for (let i = 0; i < 5; i++) { const x = R() * 2000, y = 90 + R() * 200; cl += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(160 + R() * 140)}" ry="${f1(30 + R() * 20)}" fill="#fff" opacity=".75"/>`; }
      this.L.push(layer(root, 0.03, `<g filter="url(#s05soft)">${cl}</g>`));
      let tw = '';
      for (let i = 0; i < 26; i++) { const x = -100 + i * 100 + R() * 40, h = 40 + R() * 90, w = 60 + R() * 60; tw += `<path d="M${f1(x)},620V${f1(620 - h)}L${f1(x + w / 2)},${f1(620 - h - 26)}L${f1(x + w)},${f1(620 - h)}V620Z" fill="${R() < .5 ? '#d9c8e8' : '#e8d8ee'}"/>`; }
      tw += `<rect x="-200" y="618" width="3000" height="200" fill="#efe2f0"/>`;
      this.L.push(layer(root, 0.07, `<g filter="url(#s05soft)">${tw}</g>`));
      // 坡道与校门（中景）
      const blossom = (x, y, r, R2) => { let s = ''; for (let i = 0; i < 14; i++) { const a = R2() * TAU, d = R2() * r; s += `<circle cx="${f1(x + Math.cos(a) * d)}" cy="${f1(y + Math.sin(a) * d * .7)}" r="${f1(r * (.35 + R2() * .3))}" fill="${['#ffc6d8', '#ffb3cb', '#ffd9e6', '#ff9fbd'][i % 4]}"/>`; } s += `<circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .35}" fill="#fff0f6" opacity=".7"/>`; return s; };
      let md = `<path d="M-300,800L700,800L1500,560L2600,560V820H-300Z" fill="#e9d6d8"/><path d="M700,800L1500,560" stroke="#fff" stroke-width="6" opacity=".7"/><path d="M-300,812L740,812L1520,572L2600,572" stroke="#cdb4b8" stroke-width="3" fill="none"/>`;
      for (let i = 0; i < 9; i++) { const x = 600 + i * 120, y = 800 - Math.max(0, (x - 700)) * .3; md += `<path d="M${x},${y}v-${70 + i * 2}" stroke="#7a5a5a" stroke-width="${10 - i * .5}"/>` + blossom(x, y - 110, 70 - i * 3, R); }
      md += `<g transform="translate(1720,560)"><rect x="-120" y="-150" width="34" height="150" fill="#e8e0d8" stroke="#a89890" stroke-width="2"/><rect x="86" y="-150" width="34" height="150" fill="#e8e0d8" stroke="#a89890" stroke-width="2"/><path d="M-86,-130H86" stroke="#6a5a5a" stroke-width="4"/><rect x="-60" y="-190" width="120" height="34" fill="#f8f0e8" stroke="#a89890" stroke-width="2"/><text x="0" y="-166" text-anchor="middle" font-family="'Source Han Serif CN'" font-size="20" fill="#6a4a5a">樱丘学园</text></g>`;
      this.L.push(layer(root, 0.25, `<g filter="url(#s05soft)">${md}</g>`));
      // 樱花树（中近景）
      let tr = '';
      for (let i = 0; i < 9; i++) { const x = -200 + i * 480 + R() * 100; tr += `<path d="M${f1(x)},${GY - 30}C${f1(x + 10)},${GY - 200} ${f1(x - 30)},${GY - 280} ${f1(x - 10)},${GY - 360}M${f1(x)},${GY - 220}C${f1(x + 60)},${GY - 280} ${f1(x + 120)},${GY - 300} ${f1(x + 160)},${GY - 330}" stroke="#6a4646" stroke-width="18" fill="none" stroke-linecap="round"/>` + blossom(x - 10, GY - 400, 140, R) + blossom(x + 150, GY - 360, 100, R); }
      tr += `<rect x="-400" y="${GY - 60}" width="6000" height="10" fill="#fff8f8"/>` + Array.from({ length: 60 }, (_, i) => `<rect x="${-400 + i * 90}" y="${GY - 90}" width="8" height="60" fill="#fff8f8" stroke="#d8c0c8" stroke-width="1"/>`).join('');
      this.L.push(layer(root, 0.6, tr));
      let rd = `<rect x="-800" y="${GY - 30}" width="6400" height="230" fill="#f0e4e6"/><rect x="-800" y="${GY - 30}" width="6400" height="30" fill="#e2d0d4"/><path d="M-800,${GY}H5600" stroke="#cdb0b8" stroke-width="2"/>`;
      for (let i = 0; i < 80; i++) { const x = -800 + R() * 6400, y = GY + 10 + R() * 180; rd += `<path d="M0,-6C4,-6 6,-1 4,3C3,5 0,6 0,4C0,6 -3,5 -4,3C-6,-1 -4,-6 0,-6Z" fill="#ffb3cb" transform="translate(${f1(x)},${f1(y)}) rotate(${f1(R() * 360)})"/>`; }
      rd += `<g transform="translate(1500,${GY - 30})"><path d="M0,0V-140" stroke="#a89098" stroke-width="6"/><rect x="-70" y="-210" width="140" height="74" rx="10" fill="#fff" stroke="${PK}" stroke-width="3"/><text x="0" y="-164" text-anchor="middle" font-family="'Great Vibes',serif" font-size="40" fill="${PK}">No.05</text><text x="0" y="-146" text-anchor="middle" font-family="'Source Han Serif CN'" font-size="13" fill="${TX}">樱 坂 · 上 り</text></g>`;
      this.L.push(layer(root, 1, rd));
      this.pg = mk('g', { filter: '' }, root);
      this.pel = PELICANS.s05(); this.pg.appendChild(this.pel.g);
      // 前景枝条（虚化）
      let fg = '';
      for (let i = 0; i < 5; i++) { const x = i * 900 + 200; fg += `<path d="M${x - 300},-40C${x - 100},40 ${x + 100},60 ${x + 300},20" stroke="#5a3838" stroke-width="22" fill="none"/>` + blossom(x - 120, 40, 120, R) + blossom(x + 160, 60, 110, R); }
      this.Lf = layer(root, 1.35, `<g filter="url(#s05blur8)" opacity=".9">${fg}</g>`);
      this.L.push(this.Lf);
      // 光
      add(root, `<rect width="1920" height="1080" fill="url(#s05sun)" style="mix-blend-mode:screen"/>`);
      // 飘落的花瓣
      this.pet = mk('g', {}, root);
      let ps = ''; this.pp = [];
      for (let i = 0; i < 36; i++) { ps += `<path d="M0,-8C6,-8 9,-2 6,4C4,7 0,9 0,6C0,9 -4,7 -6,4C-9,-2 -6,-8 0,-8Z" fill="${['#ffc6d8', '#ffb3cb', '#ffe0ea'][i % 3]}"/>`; this.pp.push([R(), R(), R(), R()]); }
      this.pet.innerHTML = ps; this.pe = qa(this.pet, 'path');
      // 标题卡
      this.title = mk('g', { filter: 'url(#s05sh)' }, root);
      this.title.innerHTML = `<rect x="0" y="0" width="600" height="180" rx="22" fill="#fff" fill-opacity=".78" stroke="${PK}" stroke-width="2.5"/><rect x="10" y="10" width="580" height="160" rx="16" fill="none" stroke="${PK}" stroke-width="1" opacity=".6"/>
        <text x="40" y="96" font-family="'Source Han Serif CN'" font-weight="600" font-size="60" fill="${TX}">Galgame 美术风</text><text x="44" y="150" font-family="'Great Vibes'" font-size="46" fill="${PK}">Galgame Art</text>
        <path d="M330,140h220" stroke="${PK}" stroke-width="2"/><circle cx="560" cy="140" r="5" fill="${PK}"/>`;
      // 对话框
      this.box = mk('g', {}, root);
      this.box.innerHTML = `<g filter="url(#s05sh)"><rect x="150" y="826" width="1620" height="226" rx="24" fill="url(#s05box)" stroke="${PK}" stroke-width="3"/><rect x="162" y="838" width="1596" height="202" rx="18" fill="none" stroke="#ffd0e0" stroke-width="1.5"/></g>
        <g class="np"><rect x="190" y="790" width="230" height="58" rx="29" fill="${PK}"/><text class="npt" x="305" y="830" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="30" fill="#fff">鹈鹕</text></g>
        <text class="ln" x="230" y="920" font-family="'HarmonyOS Sans SC'" font-weight="500" font-size="44" fill="${TX}"></text>
        <path class="tri" d="M0,0h20l-10,12Z" fill="${PK}"/>
        <text x="1730" y="1030" text-anchor="end" font-family="Montserrat" font-weight="600" font-size="16" letter-spacing="3" fill="#c07090">AUTO · SKIP · LOG · SAVE · LOAD</text>`;
      this.ln = q(this.box, '.ln'); this.npt = q(this.box, '.npt'); this.tri = q(this.box, '.tri');
      // 选项
      this.ch = mk('g', {}, root);
      this.ch.innerHTML = ['好啊', '我骑车'].map((t, i) => `<g class="cb" transform="translate(960,${250 + i * 120})"><rect x="-300" y="-44" width="600" height="88" rx="44" fill="#fff" fill-opacity=".85" stroke="${PK}" stroke-width="3"/><rect class="hv" x="-300" y="-44" width="600" height="88" rx="44" fill="${PK}" opacity="0"/><text class="ct" y="14" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="40" fill="${TX}">${t}</text></g>`).join('') +
        `<g class="cur"><path d="M0,0L0,34L9,26L16,42L23,39L16,23L28,23Z" fill="#fff" stroke="${TX}" stroke-width="2.5" stroke-linejoin="round"/></g><circle class="rip" r="10" fill="none" stroke="${PK}" stroke-width="4" opacity="0"/>`;
      this.cb = qa(this.ch, '.cb'); this.cur = q(this.ch, '.cur'); this.rip = q(this.ch, '.rip');
      // 出口：校门的门柱
      this.gate = mk('g', {}, root);
      this.gate.innerHTML = `<rect x="-360" y="-600" width="80" height="630" fill="#ece4dc" stroke="#a89890" stroke-width="3"/><rect x="280" y="-600" width="80" height="630" fill="#ece4dc" stroke="#a89890" stroke-width="3"/><rect x="-372" y="-620" width="104" height="26" fill="#d8ccc4"/><rect x="268" y="-620" width="104" height="26" fill="#d8ccc4"/>
        <rect x="-120" y="-660" width="240" height="56" fill="#f8f2ea" stroke="#a89890" stroke-width="3"/><text x="0" y="-622" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="700" font-size="30" fill="${TX}">樱丘学园</text><path d="M-280,-560H280" stroke="#7a6a6a" stroke-width="6"/>`;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.pel.update(lt, s);
      at(this.pg, { transform: `translate(${PX},${GY})` });
      this.pe.forEach((e, i) => { const p = this.pp[i], k = fr(lt * (.12 + p[0] * .1) + p[1]); at(e, { transform: `translate(${f1(p[2] * 2200 - k * 500)},${f1(-30 + k * 1150)}) rotate(${f1(lt * 80 * (p[3] - .5) * 2 + p[1] * 360)}) scale(${f2(1 + p[3] * 1.4)},${f2((1 + p[3] * 1.4) * Math.cos(lt * 3 + p[0] * 9))})` }); });
      const ti = eo(inv(0.15, 0.5, lt)), to = inv(1.8, 2.1, lt);
      at(this.title, { transform: `translate(120,${f1(100 - (1 - ti) * 20)})`, opacity: f2(ti * (1 - to)) });
      // 对话框滑入
      const bk = eo(inv(-0.15, 0.4, lt));
      at(this.box, { transform: `translate(0,${f1((1 - bk) * 300)})` });
      let str = '', name = '鹈鹕', tl = 0;
      if (lt < 1.95) { str = typed(TXT0, lt - 0.35, 14); tl = Array.from(TXT0).length; }
      else if (lt < 4.05) { name = '？？？'; str = typed(TXT1, lt - 2.0, 13); tl = Array.from(TXT1).length; }
      else { name = '鹈鹕'; str = typed('（——那就骑车，一起回家吧。）', lt - 4.1, 18); }
      this.ln.textContent = str; this.npt.textContent = name;
      const full = Array.from(str).length >= tl && tl > 0;
      let wdt = 0; try { wdt = this.ln.getComputedTextLength(); } catch (e) { }
      at(this.tri, { transform: `translate(${f1(240 + wdt)},${f1(902 + Math.sin(lt * 10) * 4)})`, opacity: full ? 1 : 0 });
      // 选项
      const ck = eob(inv(2.95, 3.2, lt)), cout = inv(3.75, 4.0, lt);
      vis(this.ch, lt > 2.95 && lt < 4.0);
      this.cb.forEach((g, i) => {
        const k = eob(inv(2.95 + i * .08, 3.2 + i * .08, lt));
        at(g, { transform: `translate(${f1(960 + (1 - k) * (i ? 300 : -300))},${250 + i * 120}) scale(${f2(i === 1 ? 1 + bump(lt - 3.62, .06) * .08 : 1)})`, opacity: f2(clamp(k) * (1 - cout * (i === 1 ? .2 : 1))) });
        const hv = q(g, '.hv'); const on = i === 0 ? (lt > 3.2 && lt < 3.4) : (lt > 3.45);
        op(hv, on ? (i === 1 && lt > 3.6 ? .9 : .35) : 0);
        q(g, '.ct').setAttribute('fill', on && i === 1 && lt > 3.6 ? '#fff' : TX);
      });
      // 光标：先停在「好啊」，再自己移到「我骑车」
      const m1 = eio(inv(3.0, 3.22, lt)), m2 = eio(inv(3.32, 3.5, lt));
      const cx = lerp(lerp(1500, 1120, m1), 1180, m2), cy = lerp(lerp(560, 260, m1), 380, m2);
      at(this.cur, { transform: `translate(${f1(cx)},${f1(cy)}) scale(${f2(1 - bump(lt - 3.6, .04) * .15)})` });
      const rp = inv(3.6, 3.85, lt);
      at(this.rip, { cx: f1(cx), cy: f1(cy), r: f1(10 + rp * 60), opacity: rp > 0 && rp < 1 ? f2(1 - rp) : 0 });
      const fx = frameScreenX(lt), gk = eo(inv(3.7, 4.2, lt));
      vis(this.gate, lt > 3.65);
      at(this.gate, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(gk) });
      vis(this.box, lt < 6.02);
    },
    exitFx: {
      win: [0, 1.0],
      build(g) {
        g.innerHTML = `<rect class="bb" fill="url(#s05bl)" stroke="#ff8fb4" stroke-width="4"/><ellipse class="gl" fill="#fff" opacity=".6"/>` + Array.from({ length: 30 }, (_, i) => `<circle class="cf" r="10" fill="${['#ff9ac8', '#9fe8d0', '#fff19a', '#c8b0ff', '#9fd8ff'][i % 5]}"/>`).join('');
        this.bb = q(g, '.bb'); this.gl = q(g, '.gl'); this.cf = qa(g, '.cf');
      },
      update(u) {
        // 对话框鼓起变圆，弹成糖果色
        const k = eo(clamp(u / 0.32)), pop = inv(0.3, 0.55, u);
        const w = lerp(1620, 980, k) * (1 + pop * .6), h = lerp(226, 900, k) * (1 + pop * .6), cx = 960, cy = lerp(939, 560, k);
        at(this.bb, { x: f1(cx - w / 2), y: f1(cy - h / 2), width: f1(w), height: f1(h), rx: f1(lerp(24, Math.min(w, h) / 2, k)), opacity: f2(1 - pop) });
        at(this.gl, { cx: f1(cx - w * .22), cy: f1(cy - h * .26), rx: f1(w * .16), ry: f1(h * .08), opacity: f2(.6 * k * (1 - pop)) });
        this.cf.forEach((c, i) => {
          const a = i / 30 * TAU + .3, d = pop * (300 + (i % 5) * 120);
          at(c, { cx: f1(cx + Math.cos(a) * (w * .4 + d)), cy: f1(cy + Math.sin(a) * (h * .4 + d)), r: f1(14 - pop * 6), opacity: f2(pop > 0 ? 1 - ss(.6, 1, u) : 0) });
        });
      }
    }
  });
})();

/* ---------------- No.06 萌系 Q 版 ---------------- */
(function () {
  const LN = '#7a4a5a';
  const CH = {
    body: 'M-90,-140a64,50 0 1 0 128,0a64,50 0 1 0 -128,0Z', neck: 'M0,0Z',
    head: 'M-68,-270a90,86 0 1 0 180,0a90,86 0 1 0 -180,0Z',
    beak: 'M96,-292C134,-292 178,-284 204,-268C208,-262 204,-256 196,-258C164,-262 124,-266 98,-262Z',
    pouch: 'M98,-262C124,-262 164,-258 198,-256C190,-230 154,-216 124,-220C106,-224 96,-238 94,-252Z',
    wing: 'M-40,-170C-70,-166 -96,-146 -102,-120C-80,-120 -58,-130 -42,-142C-22,-142 0,-132 14,-120C10,-144 -10,-170 -40,-170Z',
    crest: 'M12,-352C2,-380 34,-386 28,-358C44,-378 62,-364 44,-348Z', fish: PS.fish, saddle: PS.saddle
  };
  PELICANS.s06 = () => {
    const p = makePelican({
      shapes: CH, line: LN, lw: 4, body: '#ffffff', wing: '#fff4f8', beak: '#ffb25a', pouch: '#ffd98a', crestC: '#ffffff', fishPos: [194, -256],
      leg: '#ffa050', legFar: '#ff9040', legW: 9, footLine: LN, tire: '#ff8ab8', tireW: 10, spoke: '#fff', spokeW: 3, spokes: 6, hub: '#fff19a', hubR: 10,
      frame: '#9fe8d0', frameW: 10, frameUnder: LN, frameUnderW: 2.5, saddle: '#ff8ab8', saddleLine: LN, bar: LN, crank: LN, fish: '#9fd8ff',
      eyeMk: () => `<ellipse cx="46" cy="-282" rx="15" ry="19" fill="#3a2030"/><circle cx="41" cy="-290" r="6" fill="#fff"/><circle cx="51" cy="-276" r="3" fill="#fff"/><ellipse cx="64" cy="-238" rx="16" ry="8" fill="#ff9fbd" opacity=".7"/>`,
      headExtra: `<g class="sweat" opacity="0"><path d="M-30,-330C-36,-318 -40,-306 -30,-302C-20,-306 -24,-318 -30,-330Z" fill="#9fdcff" stroke="#3a7ab0" stroke-width="2.5"/><path d="M-32,-312a3,4 0 0 0 0,6" stroke="#fff" stroke-width="2" fill="none"/></g>`
    });
    for (const k of ['.pbike', '.pfar', '.pnear']) q(p.g, k).setAttribute('transform', 'translate(0,0) scale(.72)');
    p.sweat = q(p.g, '.sweat');
    return p;
  };
  SCENES.push({
    key: 's06', zh: '萌系 Q 版', en: 'Chibi',
    build(root) {
      def(`<linearGradient id="s06sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8e2ff"/><stop offset=".6" stop-color="#e6f4ff"/><stop offset="1" stop-color="#ffe6f4"/></linearGradient>
        <pattern id="s06dot" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="5" fill="#fff" opacity=".55"/><circle cx="30" cy="30" r="5" fill="#fff" opacity=".55"/></pattern>
        <pattern id="s06str" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="20" height="40" fill="#ff8ab8"/><rect x="20" width="20" height="40" fill="#fff"/></pattern>`);
      const R = rng(606);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s06sky)"/><g opacity=".35" fill="none" stroke-width="26">${['#ff9ac8', '#ffd59a', '#fff19a', '#9fe8d0', '#9fd8ff', '#c8b0ff'].map((c, i) => `<path d="M200,900A760,700 0 0 1 1720,900" stroke="${c}" transform="translate(0,${i * 26})"/>`).join('')}</g>`);
      const puff = (x, y, s, c) => { let o = ''; for (const q2 of [[0, 0, 50], [45, -20, 60], [100, 0, 48], [50, 18, 50]]) o += `<circle cx="${x + q2[0] * s}" cy="${y + q2[1] * s}" r="${q2[2] * s}" fill="${c}"/>`; for (const q2 of [[30, -26, 22], [70, -36, 18]]) o += `<circle cx="${x + q2[0] * s}" cy="${y + q2[1] * s}" r="${q2[2] * s}" fill="#fff" opacity=".8"/>`; return o; };
      let cl = ''; for (let i = 0; i < 8; i++) cl += puff(-100 + i * 330 + R() * 80, 110 + R() * 180, .8 + R() * .6, i % 2 ? '#ffd6ea' : '#d6eeff');
      this.L.push(layer(root, 0.04, cl));
      let hl = ''; for (let i = 0; i < 9; i++) { const x = -200 + i * 380, r = 220 + R() * 120, c = ['#c8f2dc', '#e2d4ff', '#ffe0ee'][i % 3]; hl += `<circle cx="${x}" cy="${760 + r * .45}" r="${r}" fill="${c}"/><circle cx="${x}" cy="${760 + r * .45}" r="${r}" fill="url(#s06dot)"/>`; }
      this.L.push(layer(root, 0.1, hl));
      // 圆滚滚的房子与甜点店
      let hs = '';
      const cols = [['#ffd0e2', '#ff8ab8'], ['#d8f6e8', '#5fd0a8'], ['#fff4b8', '#ffb83a'], ['#e8dcff', '#a888f0'], ['#d8eeff', '#6ab8ff']];
      for (let i = 0; i < 9; i++) {
        const x = -100 + i * 360, c = cols[i % 5], w = 180 + R() * 50, h = 150 + R() * 60, y = 800;
        if (i === 3) { // 甜点店
          hs += `<rect x="${x}" y="${y - 200}" width="260" height="200" rx="40" fill="#fff4ea" stroke="${LN}" stroke-width="4"/><path d="M${x - 10},${y - 200}h280v40q-17.5,26 -35,0q-17.5,26 -35,0q-17.5,26 -35,0q-17.5,26 -35,0q-17.5,26 -35,0q-17.5,26 -35,0q-17.5,26 -35,0q-17.5,26 -35,0Z" fill="url(#s06str)" stroke="${LN}" stroke-width="4"/>
            <g transform="translate(${x + 130},${y - 250})"><path d="M-60,0L-44,70H44L60,0Z" fill="#ffb3cb" stroke="${LN}" stroke-width="4"/><path d="M-70,0C-80,-60 -30,-60 -20,-80C0,-110 40,-90 40,-70C80,-70 80,-10 70,0Z" fill="#fff" stroke="${LN}" stroke-width="4"/><circle cx="0" cy="-96" r="16" fill="#ff5a7a" stroke="${LN}" stroke-width="4"/>${[-40, -10, 25, 50].map((sx, j) => `<rect x="${sx}" y="${-30 - j * 8}" width="12" height="5" rx="2.5" fill="${['#ff8ab8', '#5fd0a8', '#ffb83a', '#6ab8ff'][j]}" transform="rotate(${j * 30 - 30},${sx},${-30 - j * 8})"/>`).join('')}</g>
            <text x="${x + 130}" y="${y - 120}" text-anchor="middle" font-family="'Alimama FangYuanTi VF','Nunito'" font-weight="900" font-size="34" fill="${LN}">甜点屋</text><rect x="${x + 100}" y="${y - 90}" width="60" height="90" rx="30" fill="#a86a4a" stroke="${LN}" stroke-width="4"/>`;
          continue;
        }
        hs += `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" rx="50" fill="${c[0]}" stroke="${LN}" stroke-width="4"/><path d="M${x - 20},${y - h + 30}Q${x + w / 2},${y - h - 150} ${x + w + 20},${y - h + 30}Q${x + w / 2},${y - h + 10} ${x - 20},${y - h + 30}Z" fill="${c[1]}" stroke="${LN}" stroke-width="4"/><circle cx="${x + w / 2}" cy="${y - h - 70}" r="12" fill="#fff" stroke="${LN}" stroke-width="3"/>
          <circle cx="${x + w * .3}" cy="${y - h * .55}" r="22" fill="#fff" stroke="${LN}" stroke-width="4"/><circle cx="${x + w * .3}" cy="${y - h * .55}" r="13" fill="#9fd8ff"/><rect x="${x + w * .58}" y="${y - 84}" width="46" height="84" rx="23" fill="#a86a4a" stroke="${LN}" stroke-width="4"/><circle cx="${x + w * .58 + 36}" cy="${y - 42}" r="4" fill="#ffd25a"/>`;
      }
      this.L.push(layer(root, 0.35, hs));
      let lp = '';
      for (let i = 0; i < 12; i++) { const x = -100 + i * 420 + R() * 60; lp += `<path d="M${x},${GY - 20}V${GY - 170}" stroke="#fff" stroke-width="10"/><path d="M${x},${GY - 20}V${GY - 170}" stroke="${LN}" stroke-width="2" opacity=".3"/><circle cx="${x}" cy="${GY - 220}" r="56" fill="${['#ff8ab8', '#5fd0a8', '#ffb83a', '#a888f0'][i % 4]}" stroke="${LN}" stroke-width="4"/><path d="M${x},${GY - 220}m-40,0a40,40 0 0 1 80,0a30,30 0 0 1 -60,0a20,20 0 0 1 40,0" fill="none" stroke="#fff" stroke-width="6"/>`; }
      this.L.push(layer(root, 0.65, lp));
      let rd = `<rect x="-800" y="${GY - 16}" width="6400" height="216" fill="#ffc9dc"/><rect x="-800" y="${GY - 24}" width="6400" height="20" rx="10" fill="#9fe8d0" stroke="${LN}" stroke-width="3"/>`;
      for (let i = 0; i < 60; i++) rd += `<rect x="${-800 + i * 110}" y="${GY + 90}" width="56" height="14" rx="7" fill="#fff"/>`;
      for (let i = 0; i < 160; i++) rd += `<rect x="${f1(-800 + R() * 6400)}" y="${f1(GY + 10 + R() * 180)}" width="14" height="5" rx="2.5" fill="${['#ff5a7a', '#5fd0a8', '#ffb83a', '#6ab8ff', '#fff'][i % 5]}" transform="rotate(${f1(R() * 180)},0,0)" style="transform-box:fill-box;transform-origin:center"/>`;
      rd += `<g transform="translate(1560,${GY - 20})"><path d="M0,0V-150" stroke="#fff" stroke-width="12"/><circle cy="-200" r="70" fill="#fff19a" stroke="${LN}" stroke-width="5"/><text y="-188" text-anchor="middle" font-family="'Alimama FangYuanTi VF','Nunito'" font-weight="900" font-size="40" fill="#ff5a8a">No.06</text><text y="-160" text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="700" font-size="16" fill="${LN}">糖果镇</text></g>`;
      this.L.push(layer(root, 1, rd));
      // 舞台：鹈鹕 + 冒出的拟声词
      this.cam = mk('g', {}, root);
      this.pg = mk('g', {}, this.cam);
      this.pel = PELICANS.s06(); this.pg.appendChild(this.pel.g);
      this.fx = mk('g', {}, this.cam);
      this.fx.innerHTML = ['嘿咻', '嘿咻', '呼…'].map((t, i) => `<g class="hx"><text text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="900" font-size="54" fill="#fff" stroke="${LN}" stroke-width="10" paint-order="stroke">${t}</text></g>`).join('') + `<g class="hearts">${[0, 1, 2].map(i => `<path class="ht" d="M0,6C-14,-6 -10,-20 0,-12C10,-20 14,-6 0,6Z" fill="#ff7aa8" stroke="${LN}" stroke-width="2.5"/>`).join('')}</g>`;
      this.hx = qa(this.fx, '.hx'); this.ht = qa(this.fx, '.ht');
      // 标题
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g class="tt"><text x="0" y="0" text-anchor="middle" font-family="'Alimama FangYuanTi VF','Nunito'" font-weight="900" font-size="112" fill="#ff8ab8" stroke="#fff" stroke-width="22" paint-order="stroke" stroke-linejoin="round">萌系 Q 版</text><text x="0" y="0" text-anchor="middle" font-family="'Alimama FangYuanTi VF','Nunito'" font-weight="900" font-size="112" fill="none" stroke="${LN}" stroke-width="4" stroke-linejoin="round" opacity=".9" dy="0">萌系 Q 版</text>
        <text x="0" y="64" text-anchor="middle" font-family="'Pacifico'" font-size="52" fill="#5fd0a8" stroke="#fff" stroke-width="12" paint-order="stroke">Chibi!</text>
        ${[[-300, -70, '#ffd25a'], [290, -60, '#9fd8ff'], [-250, 40, '#c8b0ff'], [270, 50, '#ff8ab8']].map(s => `<path d="${P(starPts(s[0], s[1], 26, 12, 5), true)}" fill="${s[2]}" stroke="${LN}" stroke-width="3" stroke-linejoin="round"/>`).join('')}</g>`;
      this.tt = q(this.title, '.tt');
      // 出口：饼干拱门
      this.arch = mk('g', {}, root);
      let am = `<path d="M-340,30V-250A340,340 0 0 1 340,-250V30H280V-250A280,280 0 0 0 -280,-250V30Z" fill="#e8b070" stroke="${LN}" stroke-width="5"/>`;
      for (let i = 0; i < 26; i++) { const a = PI + i * PI / 25, r = 310; am += `<circle cx="${f1(Math.cos(a) * r)}" cy="${f1(-250 + Math.sin(a) * r)}" r="5" fill="#a86a3a"/>`; }
      am += `<path d="M-330,-260A330,330 0 0 1 330,-260" fill="none" stroke="#fff" stroke-width="16" stroke-dasharray="30 22" stroke-linecap="round"/>`;
      for (let i = 0; i < 5; i++) am += `<rect x="${i % 2 ? 282 : -338}" y="${-210 + i * 50}" width="56" height="10" rx="5" fill="#fff"/>`;
      am += `<g transform="translate(0,-600)"><circle r="50" fill="#e8b070" stroke="${LN}" stroke-width="5"/><text y="12" text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="900" font-size="32" fill="#fff">GO!</text></g>`;
      this.arch.innerHTML = am;
    },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      // 腿太短：在车座上左右扭着骑
      const hiK = ss(1.9, 2.3, lt) * (1 - ss(3.8, 4.2, lt));
      const wig = Math.sin(TAU * lt) * (8 + 8 * hiK);
      this.pel.update(lt, s, { dangle: true, hip: [-26, -140], bodyRot: wig, rotPivot: [-26, -100], bob: 3 });
      at(this.pel.sweat, { opacity: f2(ss(2.3, 2.45, lt) * (1 - ss(3.85, 4.0, lt))), transform: `translate(0,${f1(Math.max(0, lt - 3.2) * 30 * hiK)})` });
      at(this.pg, { transform: `translate(${PX},${GY})` });
      const z = 1 + .28 * eio(hiK);
      at(this.cam, { transform: zoomT(z, PX + 60, GY - 120) });
      this.hx.forEach((g, i) => { const a = 2.5 + i * .5, k = inv(a, a + .45, lt); at(g, { transform: `translate(${f1(PX + (i % 2 ? 190 : -150))},${f1(GY - 330 - k * 50)}) scale(${f2(eob(clamp(k * 3)))}) rotate(${i % 2 ? 10 : -10})`, opacity: f2(k > 0 && k < 1 ? 1 - ss(.7, 1, k) : 0) }); });
      this.ht.forEach((h, i) => { const k = fr(lt * .8 + i / 3); at(h, { transform: `translate(${f1(PX - 120 + i * 50 + Math.sin(lt * 4 + i) * 16)},${f1(GY - 420 - k * 120)}) scale(${f2(.8 + k * .5)})`, opacity: f2(hiK * (1 - k)) }); });
      const ti = eob(inv(0.15, 0.5, lt)), to = inv(1.8, 2.1, lt);
      vis(this.title, lt > 0.1 && to < 1);
      at(this.tt, { transform: `translate(960,${f1(230 - to * 400)}) scale(${f2(ti)}) rotate(${f1(Math.sin(lt * 5) * 2)})` });
      const fx = frameScreenX(lt), ak = eob(inv(3.7, 4.1, lt));
      vis(this.arch, lt > 3.65);
      at(this.arch, { transform: `translate(${f1(fx)},${GY + 30}) scale(${f2(ak)})` });
    },
    openD(lt, cx) { const by = GY + 30; return `M${f1(cx - 280)},${by}V${by - 250}A280,280 0 0 1 ${f1(cx + 280)},${by - 250}V${by}Z`; },
    exitFx: {
      win: [-0.05, 1.3],
      build(g) {
        const R = rng(66); let s = ''; this.cp = [];
        for (let i = 0; i < 90; i++) {
          const kind = i % 3;
          if (kind === 0) s += `<path class="c" d="M0,0c10,-14 20,14 30,0c10,-14 20,14 30,0" fill="none" stroke-width="6" stroke-linecap="round"/>`;
          else if (kind === 1) s += `<rect class="c" x="-8" y="-5" width="16" height="10" rx="2"/>`;
          else s += `<g class="c"><rect x="-4" y="-40" width="8" height="80" rx="4" fill="#fff"/><rect x="-8" y="-44" width="16" height="88" rx="8" opacity=".45"/></g>`;
          this.cp.push([R(), R(), R(), kind]);
        }
        g.innerHTML = `<rect class="fl" width="1920" height="1080" fill="#fff"/>` + s;
        this.fl = q(g, '.fl'); this.ce = qa(g, '.c');
      },
      update(u) {
        op(this.fl, bump(u - .02, .08) * .6);
        const candy = ['#ff9ac8', '#9fe8d0', '#fff19a', '#c8b0ff', '#9fd8ff'], neon = ['#ff2bd6', '#2bffe0', '#fff12b', '#a02bff', '#2b9bff'];
        this.ce.forEach((e, i) => {
          const p = this.cp[i], k = clamp(u / 1.2);
          const a = p[0] * TAU, sp = 500 + p[1] * 1100, d = sp * eo(clamp(u / .7)) ;
          const x = PX + 120 + Math.cos(a) * d, y = GY - 260 + Math.sin(a) * d * .8 + k * k * 400;
          const col = ss(.1, .5, u) > .5 ? neon[i % 5] : candy[i % 5];
          at(e, { transform: `translate(${f1(x)},${f1(y)}) rotate(${f1(p[2] * 720 * k + a * 57)}) scale(${f2(p[3] === 2 ? .9 : 1.5)})`, opacity: f2(u < 0 ? 0 : 1 - ss(.9, 1.3, u)) });
          if (p[3] === 0) e.setAttribute('stroke', col); else if (p[3] === 1) e.setAttribute('fill', col); else { e.lastChild.setAttribute('fill', neon[i % 5]); e.firstChild.setAttribute('fill', u > .15 ? '#fff' : candy[i % 5]); }
        });
      }
    }
  });
})();
