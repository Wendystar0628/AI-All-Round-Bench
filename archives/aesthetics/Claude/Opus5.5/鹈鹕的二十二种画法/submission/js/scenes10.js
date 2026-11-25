'use strict';
/* ---------------- No.19 像素艺术 ---------------- */
const PIX = 6;
/* 把矢量鹈鹕栅格化成像素小人（4 帧），每帧按颜色合并为一条 path */
function pixelPelican(pal, cell) {
  cell = cell || PIX;
  const pr = probe();
  const parts = ['wing', 'beak', 'pouch', 'head', 'neck', 'body'];
  const colOf = { body: pal.body, neck: pal.body, head: pal.body, wing: pal.wing, beak: pal.beak, pouch: pal.pouch };
  const segDist = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy; let t = l ? ((px - a[0]) * dx + (py - a[1]) * dy) / l : 0; t = clamp(t); const x = a[0] + dx * t, y = a[1] + dy * t; return Math.hypot(px - x, py - y); };
  const { RW, FW, BB, ST, HTT, HTB, GRIP, SADDLE } = PG;
  const frameSegs = [[RW, BB], [BB, ST], [ST, RW], [ST, HTT], [HTT, HTB], [HTB, BB], [HTB, FW], [HTT, [84, -174]], [[84, -174], GRIP], [ST, SADDLE]];
  // 预先算出上半身的格子（与帧无关）
  const x0 = -150, x1 = 225, y0 = -390, y1 = 6;
  const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
  const upper = new Array(W * H).fill(null);
  for (const k of parts) {
    pr.setAttribute('d', PS[k]);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (upper[j * W + i]) continue;
      const x = x0 + (i + .5) * cell, y = y0 + (j + .5) * cell;
      if (pr.isPointInFill(new DOMPoint(x, y))) upper[j * W + i] = colOf[k];
    }
  }
  // 眼睛 + 喉囊里的小鱼（尾巴）
  { const i = Math.floor((PEYE[0] - x0) / cell), j = Math.floor((PEYE[1] - y0) / cell); upper[j * W + i] = pal.line; }
  { const fx = FISHPOS[0], fy = FISHPOS[1]; for (const [dx, dy] of [[0, 0], [-cell, -cell], [cell, -cell], [-cell, -2 * cell], [cell, -2 * cell]]) { const i = Math.floor((fx + dx - x0) / cell), j = Math.floor((fy + dy - y0) / cell); if (i >= 0 && j >= 0 && i < W && j < H) upper[j * W + i] = pal.fish || '#3cbcfc'; } }
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const ps = pelPose(f / 4, 0, { bob: 0 });
    const grid = new Array(W * H).fill(null);
    const wa = f * PI / 8;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = x0 + (i + .5) * cell, y = y0 + (j + .5) * cell;
      let c = null;
      // 车
      for (const w of [RW, FW]) { const d = Math.hypot(x - w[0], y - w[1]); if (Math.abs(d - 56) < 5) c = pal.tire; else if (d < 52) { const a = Math.atan2(y - w[1], x - w[0]) - wa; if (Math.abs(Math.sin(a * 2)) < .12 && d > 6) c = pal.spoke; } if (d < 6) c = pal.hub; }
      for (const sgm of frameSegs) if (segDist(x, y, sgm[0], sgm[1]) < 4) c = pal.frame;
      if (segDist(x, y, ps.hip, [ps.k2[0], ps.k2[1]]) < 4.5 || segDist(x, y, [ps.k2[0], ps.k2[1]], [ps.k2[2], ps.k2[3]]) < 4) c = pal.legFar;
      if (upper[j * W + i]) c = upper[j * W + i];
      if (segDist(x, y, ps.hip, [ps.k1[0], ps.k1[1]]) < 4.5 || segDist(x, y, [ps.k1[0], ps.k1[1]], [ps.k1[2], ps.k1[3]]) < 4 || segDist(x, y, [ps.k1[2], ps.k1[3]], [ps.k1[2] + 16, ps.k1[3] + 2]) < 4) c = pal.leg;
      grid[j * W + i] = c;
    }
    // 黑色描边
    const out = grid.slice();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (grid[j * W + i]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const ii = i + a, jj = j + b; return ii >= 0 && jj >= 0 && ii < W && jj < H && grid[jj * W + ii] && grid[jj * W + ii] !== pal.tire && grid[jj * W + ii] !== pal.frame && grid[jj * W + ii] !== pal.spoke; });
      if (n) out[j * W + i] = pal.line;
    }
    // 合并为 path
    const by = {};
    for (let j = 0; j < H; j++) { let i = 0; while (i < W) { const c = out[j * W + i]; if (!c) { i++; continue; } let e = i; while (e < W && out[j * W + e] === c) e++; by[c] = (by[c] || '') + `M${x0 + i * cell},${y0 + j * cell}h${(e - i) * cell}v${cell}h${-(e - i) * cell}Z`; i = e; } }
    let s = ''; for (const c in by) s += `<path d="${by[c]}" fill="${c}"/>`;
    frames.push(s);
  }
  return frames;
}
(function () {
  const PAL = { body: '#fcfcfc', wing: '#bcbcbc', beak: '#fc9838', pouch: '#fcbc58', line: '#000000', tire: '#202020', spoke: '#7c7c7c', hub: '#fcd800', frame: '#d82800', leg: '#fc9838', legFar: '#c84c0c' };
  PELICANS.s19 = () => {
    const frames = pixelPelican(PAL);
    const g = mk('g', { 'shape-rendering': 'crispEdges' });
    const fg = frames.map(f => add(g, `<g>${f}</g>`));
    return { g, update(tau) { const k = Math.floor(fr(tau) * 4) % 4; fg.forEach((e, i) => vis(e, i === k)); } };
  };
  SCENES.push({
    key: 's19', zh: '像素艺术', en: 'Pixel Art',
    build(root) {
      root.setAttribute('shape-rendering', 'crispEdges');
      bigBg(root, '#3878f8');
      const R = rng(1919);
      this.L = [];
      // 天空分层（16-bit 的抖动带）
      let sky = '';
      const bands = ['#3878f8', '#4888fc', '#5c94fc', '#78a8fc', '#98bcfc'];
      bands.forEach((c, i) => { sky += `<rect x="0" y="${i * 120}" width="1920" height="${i === 4 ? 960 : 120}" fill="${c}"/>`; if (i < 4) for (let x = 0; x < 1920; x += 12) sky += `<rect x="${x + ((i % 2) * 6)}" y="${i * 120 + 114}" width="6" height="6" fill="${bands[i + 1]}"/>`; });
      add(root, sky);
      const cloud = (x, y) => `<rect x="${x + 12}" y="${y}" width="48" height="12" fill="#fcfcfc"/><rect x="${x}" y="${y + 12}" width="96" height="18" fill="#fcfcfc"/><rect x="${x - 12}" y="${y + 30}" width="132" height="18" fill="#fcfcfc"/><rect x="${x - 12}" y="${y + 42}" width="132" height="6" fill="#a4c4fc"/>`;
      let cl = ''; for (let i = 0; i < 10; i++) cl += cloud(-200 + i * 300, 90 + (i % 3) * 60);
      this.L.push(layer(root, 0.1, cl));
      let mt = ''; for (let i = 0; i < 12; i++) { const x = -300 + i * 300; for (let k = 0; k < 20; k++) mt += `<rect x="${x + k * 12}" y="${f1(780 - (k < 10 ? k : 20 - k) * 30)}" width="12" height="${f1((k < 10 ? k : 20 - k) * 30)}" fill="${k < 10 ? '#3c6cb8' : '#2c5098'}"/>`; mt += `<rect x="${x + 96}" y="${780 - 300}" width="48" height="24" fill="#dcecfc"/>`; }
      this.L.push(layer(root, 0.25, mt));
      let hl = ''; for (let i = 0; i < 14; i++) { const x = -300 + i * 260; hl += `<rect x="${x}" y="720" width="200" height="120" fill="#00a800"/><rect x="${x + 24}" y="690" width="152" height="30" fill="#00a800"/><rect x="${x + 60}" y="672" width="80" height="18" fill="#00a800"/><rect x="${x + 70}" y="696" width="12" height="18" fill="#000"/><rect x="${x + 118}" y="696" width="12" height="18" fill="#000"/>`; }
      this.L.push(layer(root, 0.5, hl));
      // 地面：砖块、坑洞、平台、金币
      const PITX = PX + SPEED * 2.55, PW = 180;
      this.pitX = PITX;
      let gd = '';
      const brick = (x, y) => `<rect x="${x}" y="${y}" width="60" height="60" fill="#c84c0c"/><rect x="${x}" y="${y}" width="60" height="6" fill="#fcbcb0"/><rect x="${x}" y="${y + 30}" width="60" height="6" fill="#000"/><rect x="${x + 30}" y="${y}" width="6" height="30" fill="#000"/><rect x="${x + 12}" y="${y + 36}" width="6" height="24" fill="#000"/>`;
      for (let x = -900; x < 5600; x += 60) { if (x + 60 > PITX - PW / 2 && x < PITX + PW / 2) continue; gd += brick(x, GY) + brick(x, GY + 60) + brick(x, GY + 120); }
      gd += `<rect x="${PITX - PW / 2}" y="${GY}" width="${PW}" height="200" fill="#000"/>`;
      // 浮空砖与问号块
      for (let i = 0; i < 4; i++) { const x = PITX - 120 + i * 60; gd += `<rect x="${x}" y="${GY - 540}" width="60" height="60" fill="${i === 1 ? '#fc9838' : '#c84c0c'}"/><rect x="${x}" y="${GY - 540}" width="60" height="6" fill="#fcbcb0"/>${i === 1 ? `<text x="${x + 30}" y="${GY - 495}" text-anchor="middle" font-family="'Press Start 2P'" font-size="30" fill="#000">?</text>` : `<rect x="${x}" y="${GY - 510}" width="60" height="6" fill="#000"/>`}`; }
      // 水管
      gd += `<g transform="translate(${PX + SPEED * 4.6},${GY})"><rect x="-54" y="-150" width="108" height="150" fill="#00a800"/><rect x="-66" y="-186" width="132" height="42" fill="#00a800"/><rect x="-42" y="-150" width="12" height="150" fill="#80d010"/><rect x="-54" y="-186" width="12" height="42" fill="#80d010"/><rect x="-66" y="-186" width="132" height="6" fill="#000"/></g>`;
      gd += `<g transform="translate(1500,${GY})"><rect x="-6" y="-150" width="12" height="150" fill="#7c7c7c"/><rect x="-84" y="-222" width="168" height="78" fill="#000"/><rect x="-78" y="-216" width="156" height="66" fill="#fcd800"/><text y="-170" text-anchor="middle" font-family="'Press Start 2P'" font-size="28" fill="#000">No.19</text></g>`;
      this.Lg = layer(root, 1, gd); this.L.push(this.Lg);
      // 金币（沿跳跃弧线）
      this.coins = mk('g', {}, root);
      this.coinW = [];
      for (let i = 0; i < 5; i++) { const t = .2 + i * .15; const wx = PX + SPEED * (2.2 + t * .7) + 70, wy = GY - 330 - Math.sin(t * PI) * 120 + 140; this.coinW.push([wx, wy, 2.2 + t * .7]); }
      this.coins.innerHTML = this.coinW.map(() => `<g class="cn"><rect x="-12" y="-24" width="24" height="48" fill="#fcd800"/><rect x="-18" y="-18" width="36" height="36" fill="#fcd800"/><rect x="-6" y="-18" width="6" height="36" fill="#fc9838"/><rect x="-18" y="-24" width="36" height="6" fill="#000" opacity="0"/></g>`).join('') + this.coinW.map(() => `<text class="cp" font-family="'Press Start 2P'" font-size="18" fill="#fcfcfc" stroke="#000" stroke-width="4" paint-order="stroke">100</text>`).join('');
      this.cn = qa(this.coins, '.cn'); this.cp = qa(this.coins, '.cp');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s19(); this.pg.appendChild(this.pel.g);
      // 1UP
      this.up = mk('g', {}, root);
      this.up.innerHTML = `<text x="0" y="0" text-anchor="middle" font-family="'Press Start 2P'" font-size="54" fill="#58f858" stroke="#000" stroke-width="10" paint-order="stroke">1UP</text>`;
      // HUD（界面层）
      const hudL = hudOf(root);
      this.clear = mk('g', {}, hudL);
      this.clear.innerHTML = `<text x="960" y="420" text-anchor="middle" font-family="'Press Start 2P'" font-size="64" fill="#fcd800" stroke="#000" stroke-width="12" paint-order="stroke">COURSE CLEAR!</text><text x="960" y="490" text-anchor="middle" font-family="'Press Start 2P'" font-size="28" fill="#fcfcfc" stroke="#000" stroke-width="8" paint-order="stroke">WORLD 19-1 ★ TIME BONUS</text>`;
      this.hud = mk('g', {}, hudL);
      this.hud.innerHTML = `<g font-family="'Press Start 2P'" font-size="26" fill="#fcfcfc" stroke="#000" stroke-width="6" paint-order="stroke"><text x="70" y="70">PELICAN</text><text class="lives" x="70" y="112">♥×03</text><text x="560" y="70">COIN</text><text class="coin" x="560" y="112">◎×17</text><text x="940" y="70">SCORE</text><text class="score" x="940" y="112">018400</text><text x="1380" y="70">WORLD</text><text x="1380" y="112">19-1</text><text x="1680" y="70">TIME</text><text class="time" x="1680" y="112">149</text></g>`;
      this.lives = q(this.hud, '.lives'); this.coinT = q(this.hud, '.coin'); this.scoreT = q(this.hud, '.score'); this.timeT = q(this.hud, '.time');
      this.title = mk('g', {}, hudL);
      this.title.innerHTML = `<rect x="-480" y="-130" width="960" height="250" fill="#000" opacity=".75"/><rect x="-468" y="-118" width="936" height="226" fill="none" stroke="#fcfcfc" stroke-width="6"/><text x="6" y="16" text-anchor="middle" font-family="'ipix_12px','Press Start 2P'" font-size="108" fill="#d82800">像素艺术</text><text x="0" y="10" text-anchor="middle" font-family="'ipix_12px','Press Start 2P'" font-size="108" fill="#fcd800">像素艺术</text><text x="0" y="86" text-anchor="middle" font-family="'Press Start 2P'" font-size="36" fill="#fcfcfc">PIXEL ART</text>`;
      // 出口：关底城堡大门
      this.gate = mk('g', {}, root);
      let gm = '';
      for (let y = 0; y < 11; y++) for (let x = 0; x < 12; x++) { const gx = -360 + x * 60, gy = -660 + y * 60; const inDoor = x >= 2 && x <= 9 && y >= 2; if (!inDoor) gm += brick(gx, gy); }
      gm += `<rect x="-360" y="-720" width="60" height="60" fill="#c84c0c"/><rect x="-120" y="-720" width="60" height="60" fill="#c84c0c"/><rect x="60" y="-720" width="60" height="60" fill="#c84c0c"/><rect x="300" y="-720" width="60" height="60" fill="#c84c0c"/>`;
      gm += `<rect x="420" y="-900" width="12" height="900" fill="#7cfc00"/><path d="M432,-900h90v60h-90Z" fill="#fcfcfc"/><text x="476" y="-856" text-anchor="middle" font-family="'Press Start 2P'" font-size="22" fill="#d82800">GO</text>`;
      this.gate.innerHTML = gm;
    },
    update(lt) {
      const sRaw = stdScroll(lt), s = Math.floor(sRaw / PIX) * PIX;
      scrollL(this.L, s);
      // 跳过坑洞
      const jk = inv(2.2, 2.9, lt), jh = Math.sin(jk * PI) * 220;
      const py = Math.round((GY - jh) / PIX) * PIX;
      this.pel.update(lt < 2.2 || lt > 2.9 ? lt : 0.25);
      at(this.pg, { transform: `translate(${PX},${py})` });
      let coins = 17, score = 18400;
      this.cn.forEach((c, i) => {
        const w = this.coinW[i], got = lt >= w[2];
        const sx = Math.floor((w[0] - s) / PIX) * PIX, spin = Math.abs(Math.cos(lt * 6 + i));
        at(c, { transform: `translate(${sx},${w[1]}) scale(${f2(Math.max(.25, Math.round(spin * 3) / 3))},1)`, opacity: got ? 0 : 1 });
        const pk = inv(w[2], w[2] + .5, lt);
        at(this.cp[i], { x: sx - 20, y: f1(w[1] - 40 - pk * 60), opacity: pk > 0 && pk < 1 ? 1 : 0 });
        if (got) { coins++; score += 100; }
      });
      const up = lt >= 3.0;
      const uk = inv(3.0, 3.8, lt);
      at(this.up, { transform: `translate(${PX + 20},${f1(GY - 430 - uk * 80)})`, opacity: uk > 0 && uk < 1 ? (Math.floor(lt * 10) % 2 ? 1 : .7) : 0 });
      this.lives.textContent = `♥×0${up ? 4 : 3}`; this.coinT.textContent = `◎×${coins}`; this.scoreT.textContent = String(score + (up ? 1000 : 0)).padStart(6, '0'); this.timeT.textContent = String(149 - Math.floor(lt * 2)).padStart(3, '0');
      at(this.lives, { fill: up && lt < 3.6 ? '#58f858' : '#fcfcfc' });
      const ti = lt > 0.15 && lt < 1.9;
      vis(this.title, ti);
      at(this.title, { transform: `translate(960,${lt < 0.4 ? 420 + (0.4 - lt) * 1200 : 420})` });
      const fx = Math.floor(frameScreenX(lt) / PIX) * PIX;
      vis(this.gate, lt > 3.3);
      at(this.gate, { transform: `translate(${fx},${GY})` });
      // 关底城堡：骑进城门，过关
      const ck = inv(5.3, 5.55, lt); vis(this.clear, ck > 0);
      if (ck > 0) at(this.clear, { transform: `translate(960,440) scale(${f2(Math.round(eob(ck) * 6) / 6)}) translate(-960,-440)`, opacity: Math.floor(lt * 8) % 2 || lt < 5.6 ? 1 : .8 });
    },
    openD(lt, cx) { const x = Math.floor(cx / PIX) * PIX; return rectD(x - 240, GY - 540, 480, 540); },
    ow: 480, oh: 540, oby: GY,
    exitFx: {
      win: [-0.05, 1.2],
      build(g) {
        const R = rng(1920); let s = `<defs><filter id="s19neo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#s19neo)">`;
        this.px = [];
        for (let i = 0; i < 120; i++) { s += `<rect class="px" width="30" height="30"/>`; this.px.push([Math.floor(R() * 64) * 30, Math.floor(R() * 36) * 30, R()]); }
        g.innerHTML = s + '</g>'; this.pe = qa(g, '.px');
      },
      update(u) {
        const NEON = ['#ff2bd6', '#2be8ff', '#fff12b', '#8a2bff'];
        const o = 1 - ss(0.7, 1.2, u);
        this.pe.forEach((e, i) => { const p = this.px[i]; const k = ss(p[2] * .3 - .05, p[2] * .3 + .2, u); at(e, { x: p[0], y: f1(p[1] + k * k * 60), fill: NEON[i % 4], opacity: f2(k * o * (1 - ss(.5, .9, u - p[2] * .2)) * .9) }); });
      }
    }
  });
})();

/* ---------------- No.20 赛博朋克 ---------------- */
(function () {
  const CY = '#2be8ff', MG = '#ff2bd6', YL = '#fff12b', DK = '#0b0718';
  PELICANS.s20 = () => {
    const p = makePelican({
      line: CY, lw: 2.6, body: '#150c28', wing: '#1c1036', beak: '#241640', pouch: '#2a1848', eye: MG, neck: '#150c28', head: '#150c28',
      leg: '#3a2a5a', legFar: '#24183a', legW: 8, tire: '#0a0614', tireW: 8, spoke: '#3a2a5a', spokeW: 1, spokes: 12, rimW: 3, rimC: MG,
      frame: '#150c28', frameW: 8, frameLine: CY, frameLineW: 2, saddle: '#0a0614', saddleLine: CY, bar: CY, crank: CY, hub: YL, fish: MG, footLine: CY,
      headExtra: `<path d="M28,-364H74V-346H28Z" fill="${MG}" opacity=".9"/><rect x="34" y="-360" width="34" height="9" fill="#ffe0fa"/><path d="M18,-356H28" stroke="${CY}" stroke-width="3"/><g class="ex" opacity="0"><text x="40" y="-400" font-family="Orbitron" font-weight="700" font-size="54" fill="${YL}">!</text></g>`,
      wingExtra: `<path d="M-6,-248C-40,-252 -74,-242 -98,-228" stroke="${MG}" stroke-width="1.6" fill="none"/>`
    });
    p.g.setAttribute('filter', 'url(#s20glow)');
    p.ex = q(p.g, '.ex');
    return p;
  };
  SCENES.push({
    key: 's20', zh: '赛博朋克', en: 'Cyberpunk',
    build(root) {
      def(`<linearGradient id="s20sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070412"/><stop offset=".6" stop-color="#1a0a34"/><stop offset="1" stop-color="#4a0a4a"/></linearGradient>
        <filter id="s20glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="s20rf" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3 9"/></filter>
        <pattern id="s20scan" width="4" height="6" patternUnits="userSpaceOnUse"><rect width="4" height="3" fill="#000" opacity=".35"/></pattern>
        <linearGradient id="s20holo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CY}" stop-opacity=".35"/><stop offset="1" stop-color="${MG}" stop-opacity=".2"/></linearGradient>`);
      const R = rng(2020);
      this.L = [];
      add(root, `<rect width="1920" height="1080" fill="url(#s20sky)"/>`);
      // 远景巨构
      let far = '';
      for (let i = 0; i < 18; i++) { const x = -200 + i * 170, w = 120 + R() * 80, h = 380 + R() * 420; far += `<rect x="${f1(x)}" y="${f1(820 - h)}" width="${f1(w)}" height="${f1(h)}" fill="#120a24"/>`; for (let j = 0; j < h / 40; j++) if (R() < .5) far += `<rect x="${f1(x + 10)}" y="${f1(820 - h + 20 + j * 40)}" width="${f1(w * (.3 + R() * .6))}" height="4" fill="${R() < .5 ? CY : MG}" opacity=".5"/>`; far += `<path d="M${f1(x + w / 2)},${f1(820 - h)}v-60" stroke="#2a1a44" stroke-width="4"/><circle cx="${f1(x + w / 2)}" cy="${f1(820 - h - 60)}" r="4" fill="#ff2a2a"/>`; }
      this.L.push(layer(root, 0.06, far));
      // 中景：机械楼、全息广告、高架轨道
      let neon = '';
      const signs = ['拉面', '电子', '义体', '鹈鹕', '夜市', '24H'];
      for (let i = 0; i < 9; i++) { const x = -200 + i * 420, h = 560 + R() * 160; neon += `<rect x="${x}" y="${820 - h}" width="300" height="${h}" fill="#140c2a" stroke="#2a1a4a" stroke-width="3"/>${Array.from({ length: 8 }, (_, j) => `<rect x="${x + 20}" y="${820 - h + 30 + j * 60}" width="260" height="8" fill="#241640"/>`).join('')}<path d="M${x},${820 - h + 120}h-40v200h40M${x + 300},${820 - h + 200}h50v260h-50" stroke="#3a2a5a" stroke-width="10" fill="none"/>`; neon += `<g transform="translate(${x + 240},${820 - h + 120})"><rect x="0" y="0" width="70" height="200" fill="#0a0614" stroke="${i % 2 ? CY : MG}" stroke-width="4"/><text x="35" y="40" text-anchor="middle" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-size="56" fill="${i % 2 ? CY : MG}" writing-mode="tb">${signs[i % 6]}</text></g>`; }
      neon += `<rect x="-400" y="430" width="4400" height="26" fill="#1a1030" stroke="${MG}" stroke-width="2"/><rect x="-400" y="452" width="4400" height="4" fill="${CY}"/>` + Array.from({ length: 16 }, (_, i) => `<rect x="${-300 + i * 300}" y="456" width="20" height="360" fill="#1a1030"/>`).join('');
      neon += `<g transform="translate(400,250)"><rect width="380" height="150" fill="url(#s20holo)" stroke="${CY}" stroke-width="2"/><text x="190" y="72" text-anchor="middle" font-family="'Alimama ShuHeiTi'" font-size="54" fill="${CY}">鹈鹕能量饮料</text><text x="190" y="120" text-anchor="middle" font-family="Orbitron" font-size="24" fill="${MG}">PELI-COLA · 22%</text></g>`;
      this.Ln = layer(root, 0.3, neon, { filter: 'url(#s20glow)' }); this.L.push(this.Ln);
      // 巨型全息广告牌
      this.bill = mk('g', {}, root);
      this.bill.innerHTML = `<rect x="0" y="0" width="760" height="430" fill="#08040f" stroke="${MG}" stroke-width="5" filter="url(#s20glow)"/><g class="ad"><rect x="10" y="10" width="740" height="410" fill="url(#s20holo)"/><text x="380" y="200" text-anchor="middle" font-family="'Alimama ShuHeiTi'" font-size="110" fill="${MG}" filter="url(#s20glow)">義体 SALE</text><text x="380" y="300" text-anchor="middle" font-family="Orbitron" font-weight="700" font-size="44" fill="${CY}">UPGRADE YOUR BEAK</text></g>
        <g class="live" opacity="0"><rect x="10" y="10" width="740" height="410" fill="#061a24"/><g class="lp"></g><rect x="10" y="10" width="740" height="410" fill="url(#s20scan)"/><circle cx="50" cy="50" r="12" fill="#ff2a2a"/><text x="72" y="60" font-family="Orbitron" font-weight="700" font-size="28" fill="#fff">LIVE · CAM 20</text><text x="740" y="406" text-anchor="end" font-family="Orbitron" font-size="20" fill="${CY}">TARGET: PELICAN</text><path d="M260,90H220V130M500,90H540V130M260,380H220V340M500,380H540V340" stroke="${YL}" stroke-width="5" fill="none"/></g>`;
      this.ad = q(this.bill, '.ad'); this.live = q(this.bill, '.live');
      this.lpel = PELICANS.s20(); this.lpel.g.removeAttribute('filter'); q(this.bill, '.lp').appendChild(this.lpel.g);
      // 积水路面与倒影
      let rd = `<rect x="-800" y="${GY}" width="6400" height="200" fill="#0a0614"/>`;
      for (let i = 0; i < 40; i++) rd += `<ellipse cx="${-800 + R() * 6400}" cy="${GY + 30 + R() * 150}" rx="${60 + R() * 140}" ry="${6 + R() * 8}" fill="#1a1030"/>`;
      let st = ''; for (let i = 0; i < 46; i++) { const x = -700 + R() * 6200, w = 8 + R() * 30, h = 50 + R() * 150; st += `<rect x="${f1(x)}" y="${GY + 8 + R() * 20}" width="${f1(w)}" height="${f1(h)}" fill="${[CY, MG, YL, '#8a6aff'][i % 4]}" opacity="${f2(.18 + R() * .25)}"/>`; }
      rd += `<g filter="url(#s20rf)">${st}</g>`;
      rd += `<path d="M-800,${GY}H5600" stroke="${MG}" stroke-width="3"/><g transform="translate(1560,${GY})"><path d="M0,0V-140" stroke="#3a2a5a" stroke-width="8"/><rect x="-80" y="-220" width="160" height="80" fill="#0a0614" stroke="${CY}" stroke-width="4"/><text y="-166" text-anchor="middle" font-family="Orbitron" font-weight="700" font-size="40" fill="${CY}">No.20</text></g>`;
      this.Lr = layer(root, 1, rd); this.L.push(this.Lr);
      this.refl = mk('g', { filter: 'url(#s20rf)', opacity: .45 }, root);

      this.Ln.g.setAttribute('id', 's20neonsrc');
      // 雨
      this.rain = mk('g', {}, root);
      let rn = ''; this.rp = []; for (let i = 0; i < 140; i++) { rn += `<path stroke="#9ab8ff" stroke-width="1.6" opacity=".45"/>`; this.rp.push([R(), R(), R()]); }
      this.rain.innerHTML = rn; this.re = qa(this.rain, 'path');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s20(); this.pg.appendChild(this.pel.g);
      this.title = mk('g', { filter: 'url(#s20glow)' }, root);
      this.title.innerHTML = `<text x="0" y="0" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-size="130" fill="none" stroke="${MG}" stroke-width="4">赛博朋克</text><text x="4" y="78" font-family="Orbitron" font-weight="700" font-size="46" letter-spacing="14" fill="${CY}">CYBERPUNK</text><rect x="0" y="100" width="520" height="6" fill="${YL}"/>`;
      // 出口：全息门
      this.gate = mk('g', { filter: 'url(#s20glow)' }, root);
      this.gate.innerHTML = `<path d="M-300,30V-560H300V30" fill="none" stroke="${CY}" stroke-width="6"/><path d="M-330,30V-590H330V30" fill="none" stroke="${MG}" stroke-width="3"/><rect class="scn" x="-300" y="-560" width="600" height="12" fill="${CY}" opacity=".6"/><text x="0" y="-604" text-anchor="middle" font-family="Orbitron" font-weight="700" font-size="30" letter-spacing="6" fill="${CY}">HOLO-GATE ▶ 21</text>`;
      this.scn = q(this.gate, '.scn');
    },
    tau(lt) { return lt < 2.7 ? lt : lt < 3.7 ? 2.7 : lt - 1; },
    update(lt) {
      const s = stdScroll(lt);
      scrollL(this.L, s);
      this.refl.setAttribute('transform', `translate(0,${2 * GY}) scale(1,-1)`);
      this.re.forEach((e, i) => { const p = this.rp[i]; const k = fr(lt * (1.6 + p[2]) + p[1]); const x = p[0] * 2200 - k * 200, y = -60 + k * 1200; e.setAttribute('d', `M${f1(x)},${f1(y)}l-10,46`); });
      // 广告牌切成鹈鹕本人的实时画面，鹈鹕抬头愣住
      const lv = lt > 2.25 && lt < 4.2;
      at(this.bill, { transform: `translate(${f1(1080 - s * .3 + SPEED * 3 * .3)},140)` });
      op(this.ad, lv ? (lt < 2.4 ? (Math.floor(lt * 30) % 2) : 0) : 1);
      op(this.live, lv ? 1 : 0);
      const tau = this.tau(lt);
      const look = ss(2.55, 2.75, lt) * (1 - ss(3.55, 3.75, lt));
      this.pel.update(tau, s, { headRot: -24 * look });
      op(this.pel.ex, ss(2.7, 2.8, lt) * (1 - ss(3.5, 3.6, lt)));
      if (lv) { this.lpel.update(tau, s, { headRot: -24 * look }); this.lpel.g.setAttribute('transform', 'translate(340,400) scale(.95)'); }
      at(this.pg, { transform: `translate(${PX},${GY})` });
      const ti = ss(0.15, 0.4, lt) * (Math.floor(lt * 14) % 7 ? 1 : .4), to = 1 - ss(1.7, 1.9, lt);
      at(this.title, { transform: `translate(130,230)`, opacity: f2(ti * to) });
      const fx = frameScreenX(lt);
      vis(this.gate, lt > 3.9);
      at(this.gate, { transform: `translate(${f1(fx)},${GY + 30})`, opacity: f2(ss(3.9, 4.2, lt) * (Math.floor(lt * 20) % 9 ? 1 : .5)) });
      this.scn.setAttribute('y', f1(-560 + fr(lt * .8) * 580));
    },
    openD(lt, cx) { return rectD(cx - 300, GY + 30 - 590, 600, 590); },
    oh: 590,
    exitFx: {
      win: [-0.05, 1.3],
      build(g) {
        let s = `<defs><linearGradient id="s20vw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff71ce"/><stop offset=".5" stop-color="#b967ff"/><stop offset="1" stop-color="#01cdfe"/></linearGradient></defs><rect class="gr" width="1920" height="1080" fill="url(#s20vw)"/>`;
        s += `<g class="grid" stroke="#ff71ce" stroke-width="3">`;
        for (let i = -12; i <= 12; i++) s += `<path d="M960,600L${960 + i * 220},1080"/>`;
        for (let j = 0; j < 8; j++) s += `<path class="hz" d="M0,0H1920"/>`;
        g.innerHTML = s + '</g>'; this.gr = q(g, '.gr'); this.grid = q(g, '.grid'); this.hz = qa(g, '.hz');
      },
      update(u) {
        const k = ss(0, .4, u), o = 1 - ss(.75, 1.3, u);
        op(this.gr, k * o * .75);
        const gk = eio(inv(.1, .55, u));
        at(this.grid, { opacity: f2(gk * o), transform: `translate(0,${f1((1 - gk) * 500)})` });
        this.hz.forEach((h, j) => { const y = 600 + Math.pow((j + fr(u * 2)) / 8, 2) * 480; h.setAttribute('d', `M0,${f1(y)}H1920`); });
      }
    }
  });
})();
