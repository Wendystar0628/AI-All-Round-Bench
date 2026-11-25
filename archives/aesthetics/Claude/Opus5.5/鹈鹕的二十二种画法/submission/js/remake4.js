'use strict';
/* ---------------- No.09 现代数码动画：宽银幕；低机位仰拍逆光，道口处镜头固定，电车从前景横穿 ---------------- */
(function () {
  const V9 = lt => SPEED * (1 - ss(1.8, 2.2, lt) * (1 - ss(3.8, 4.2, lt)));   // 停在道口：踏板和前进一起停下（正好少两圈）
  const D = makeDist(V9);
  const S = 0.6, YW = 742;                                  // 对面街道上的鹈鹕
  const xAt = lt => 900 + (D(lt) - D(2.6)) * S;             // 停在 x=900
  remake(8, {
    build(root) {
      const R = rng(9909);
      bigBg(root, '#4a5470');
      add(root, `<rect x="-1400" y="-1200" width="4720" height="1950" fill="#2a4a8a"/><rect width="1920" height="1080" fill="url(#s09sky)"/>`);
      // 积雨云（逆光）
      const puffs = []; for (let i = 0; i < 80; i++) { const t = Math.pow(R(), .8), hw = 520 * Math.pow(1 - t, .55) + 60; puffs.push([1050 + (R() * 2 - 1) * hw + t * 160, 700 - t * 560, 40 + (1 - t) * 70 + R() * 30]); }
      puffs.sort((a, b) => b[1] - a[1]);
      this.cloud = add(root, `<g filter="url(#s09b1)">${puffs.map(p => `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${f1(p[2])}" fill="url(#s09puff)"/>`).join('')}</g>`);
      add(root, `<g style="mix-blend-mode:screen"><circle cx="1380" cy="210" r="460" fill="url(#s09flare)"/>${Array.from({ length: 8 }, (_, i) => `<path d="M1380,210L${f1(1380 + Math.cos(1.7 + i * .26) * 1700 - 70)},${f1(210 + Math.sin(1.7 + i * .26) * 1700)}L${f1(1380 + Math.cos(1.7 + i * .26) * 1700 + 70)},${f1(210 + Math.sin(1.7 + i * .26) * 1700)}Z" fill="url(#s09ray)" opacity=".4"/>`).join('')}</g>`);
      // 低机位：地平线很低，电线杆从下往上收拢，电线横过天空
      let far = '';
      for (let i = 0; i < 14; i++) { const x = -100 + i * 150 + R() * 40, w = 120 + R() * 50, h = 40 + R() * 60; far += `<rect x="${f1(x)}" y="${f1(YW - 10 - h)}" width="${f1(w)}" height="${f1(h)}" fill="#5a6a90"/><path d="M${f1(x - 8)},${f1(YW - 10 - h)}L${f1(x + w / 2)},${f1(YW - 30 - h)}L${f1(x + w + 8)},${f1(YW - 10 - h)}Z" fill="#3a4a70"/>`; }
      far += `<rect x="0" y="${YW - 12}" width="1920" height="30" fill="#4a5470"/>`;
      add(root, `<g filter="url(#s09b1)">${far}</g>`);
      let poles = '';
      [[260, 1.0], [1640, .9], [900, .55]].forEach(([x, s]) => { poles += `<path d="M${x - 14 * s},${YW + 40}L${x - 5 * s},-50L${x + 5 * s},-50L${x + 14 * s},${YW + 40}Z" fill="#20263a"/><path d="M${x - 70 * s},${60 + (1 - s) * 200}H${x + 70 * s}M${x - 55 * s},${110 + (1 - s) * 200}H${x + 55 * s}" stroke="#20263a" stroke-width="${8 * s}"/>`; });
      for (let w = 0; w < 7; w++) poles += `<path d="M-50,${80 + w * 22}Q500,${170 + w * 30} 900,${120 + w * 16}T1980,${60 + w * 26}" stroke="#1a2032" stroke-width="${2 + (w % 3)}" fill="none"/>`;
      add(root, poles);
      // 对面的道口：交叉标志、期待中的人
      add(root, `<g transform="translate(1180,${YW})"><path d="M0,0V-150" stroke="#e8e8ec" stroke-width="7"/><path d="M-42,-150L42,-108M42,-150L-42,-108" stroke="#f4f4f4" stroke-width="12"/><path d="M-42,-150L42,-108M42,-150L-42,-108" stroke="#e23a3a" stroke-width="7" stroke-dasharray="10 7"/><rect x="-40" y="-96" width="80" height="26" rx="5" fill="#2a2a32"/><text y="-77" text-anchor="middle" font-family="'Source Han Sans CN'" font-weight="700" font-size="15" fill="#fff">踏切 No.09</text></g>`);
      this.girl = add(root, `<g filter="url(#s09b1)" transform="translate(1060,${YW})"><path d="M-14,0L-20,-80Q0,-110 20,-80L14,0Z" fill="#3a3a58"/><circle cy="-122" r="17" fill="#3a3040"/><path d="M-17,-120Q-22,-80 -8,-74L8,-74Q22,-80 17,-120Z" fill="#2a2030"/></g>`);
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s09(); this.pg.appendChild(this.pel.g);
      // 前景：铁轨（近在镜头前）、栏杆、信号灯（景深虚化）
      add(root, `<rect x="0" y="${YW + 18}" width="1920" height="400" fill="#4a4e5a"/><g filter="url(#s09b1)"><rect x="0" y="${YW + 60}" width="1920" height="30" fill="#2a2a32"/>${Array.from({ length: 30 }, (_, i) => `<rect x="${i * 70}" y="${YW + 58}" width="36" height="150" fill="#3a3a42"/>`).join('')}<path d="M0,${YW + 74}H1920M0,${YW + 140}H1920" stroke="#e8ecf4" stroke-width="12"/></g>`);
      this.gate = add(root, `<g filter="url(#s09b8)"><rect x="120" y="${YW - 120}" width="40" height="420" fill="#2a2a32"/><g class="arm" transform="translate(140,${YW - 100})"><rect x="0" y="-16" width="1500" height="32" fill="#f4f4f4"/>${Array.from({ length: 15 }, (_, i) => `<rect x="${i * 100}" y="-16" width="50" height="32" fill="#e02a2a"/>`).join('')}</g><rect x="70" y="${YW - 220}" width="140" height="70" rx="35" fill="#2a2a32"/><circle class="l1" cx="105" cy="${YW - 185}" r="26" fill="#ff3030"/><circle class="l2" cx="175" cy="${YW - 185}" r="26" fill="#ff3030"/></g>`);
      this.arm = q(this.gate, '.arm'); this.l1 = q(this.gate, '.l1'); this.l2 = q(this.gate, '.l2');
      // 前景横穿的电车（高光）与停靠的电车（出口：车窗）
      const car = (x, win) => `<g transform="translate(${x},0)"><rect x="0" y="${YW - 470}" width="760" height="520" rx="26" fill="url(#s09train)"/><rect x="0" y="${YW - 70}" width="760" height="30" fill="#2a9a5a"/>${[0, 1, 2, 3].map(j => `<rect x="${50 + j * 175}" y="${YW - 400}" width="140" height="190" rx="16" fill="${win || '#3a4a68'}"/>`).join('')}<rect x="0" y="${YW + 20}" width="760" height="60" fill="#4a4e58"/></g>`;
      this.trn = add(root, `<g filter="url(#s09mb)">${Array.from({ length: 8 }, (_, i) => car(i * 780)).join('')}</g>`);
      // 停靠的电车：窗户是透明的（画框），能看见对面的鹈鹕
      this.local = mk('g', {}, root);
      let lc = '';
      for (let i = 0; i < 3; i++) { const x = i * 780; lc += `<path d="M${x},${YW - 470}h760v600h-760Z ${[0, 1, 2, 3].map(j => `M${x + 50 + j * 175},${YW - 400}v190h140v-190Z`).join(' ')}" fill="url(#s09train)" fill-rule="evenodd"/><rect x="${x}" y="${YW - 70}" width="760" height="30" fill="#2a9a5a"/>${[0, 1, 2, 3].map(j => `<rect x="${x + 50 + j * 175}" y="${YW - 400}" width="140" height="190" rx="16" fill="none" stroke="#8a92a0" stroke-width="10"/>`).join('')}`; }
      this.local.innerHTML = lc;
      // 宽银幕黑边 + 标题（片名式，压在下方黑边里）——界面层，转场时由上一版的竖黑边退开而成
      const hud = hudOf(root);
      this.bars = add(hud, `<g><rect x="0" y="0" width="1920" height="140" fill="#000"/><rect x="0" y="940" width="1920" height="140" fill="#000"/></g>`);
      this.title = mk('g', {}, hud);
      this.title.innerHTML = `<text x="960" y="1012" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="300" font-size="54" letter-spacing="26" fill="#fff">现代数码动画</text><text x="960" y="1056" text-anchor="middle" font-family="'Cormorant Garamond'" font-style="italic" font-size="28" letter-spacing="10" fill="#c8d4ec">Modern Digital Anime</text>`;
      this.lcX = lt => { const k = eo(inv(4.3, 5.2, lt)); return lerp(2400, 960 - 380 - 1 * 780 - 50 - 175 - 70 + 380 + 0, k); };
      // 全部画面装进一个带 id 的组：下一版的报纸照片直接引用这一帧
      const all = mk('g', { id: 'n09all' }); while (root.firstChild) all.appendChild(root.firstChild); root.appendChild(all);
    },
    winX() { return xAt(6); },
    update(lt0) {
      // 强拍之后画面定格（变成一张老照片），只有鹈鹕继续往前骑
      const lt = Math.min(lt0, 6);
      const d = D(lt0), x = xAt(lt0);
      ride(this.pel, d);
      at(this.pg, { transform: `translate(${f1(x)},${YW}) scale(${S})` });
      const down = eio(inv(2.0, 2.3, lt)) * (1 - eio(inv(3.7, 3.98, lt))) + eio(inv(4.3, 4.55, lt)) * (1 - eio(inv(5.55, 5.8, lt)));
      this.arm.setAttribute('transform', `translate(140,${YW - 100}) rotate(${f1(-86 + 86 * down)})`);
      const bl = Math.floor(lt * 4) % 2; op(this.l1, down > .05 ? (bl ? 1 : .25) : .25); op(this.l2, down > .05 ? (bl ? .25 : 1) : .25);
      // 电车从前景横穿两次：第 2 小节（高光），第 3 小节末开走
      const tA = lt > 2.45 && lt < 3.45, tB = lt > 4.55 && lt < 5.6;
      vis(this.trn, tA || tB);
      this.trn.setAttribute('transform', `translate(${f1(tA ? lerp(-6400, 2200, inv(2.45, 3.45, lt)) : lerp(2200, -6400, inv(4.55, 5.6, lt)))},0)`);
      op(this.girl, 1 - ss(2.6, 2.7, lt));
      op(this.pel.ding, Math.min(1, bump(lt - 3.68, .12) * 1.5));
      // 停靠的电车在第 3 小节驶入、停住；鹈鹕在车窗后面骑过，强拍时正好对准一扇窗
      const k = eo(inv(4.2, 5.1, lt)), wx = this.winX();
      const off = (wx - 70) - (50 + 2 * 175);                    // 让第 3 扇窗对准鹈鹕
      vis(this.local, false);
      op(this.title, ss(.62, .9, lt) * (1 - ss(1.7, 2.0, lt)));
      op(this.bars, ss(.6, .66, lt));
    },
    portal(lt) { const wx = this.winX(); return { d: rrD(wx - 70, YW - 400, 140, 190, 16), box: [wx - 70, YW - 400, wx + 70, YW - 210], late: true, zmax: 12 }; },
    exitFx: OLDSCENES[8].exitFx
  });
})();

/* ---------------- No.10 复古神秘学印刷：俯视整张报纸头版；鹈鹕沿栏线从一栏骑到另一栏 ---------------- */
(function () {
  const INK = '#2e2216', RED = '#a8321e';
  const D = makeDist(CRUISE);
  const S = 0.5;
  const PATH = [[1150, 700], [1532, 700], [1532, 1030], [1880, 1030]];   // 从照片右边骑出来，沿栏线走
  const SEG = PATH.slice(1).map((p, i) => Math.hypot(p[0] - PATH[i][0], p[1] - PATH[i][1]));
  const s0 = lt => D(lt) * S + 15;                          // 沿路线走过的版面距离
  function pathAt(s) {
    let i = 0; while (i < SEG.length - 1 && s > SEG[i]) { s -= SEG[i]; i++; }
    const a = PATH[i], b = PATH[i + 1], k = s / SEG[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / PI];
  }
  function textLines(x, y, w, n, R) { let s = ''; for (let i = 0; i < n; i++) s += `<rect x="${x}" y="${y + i * 15}" width="${f1(i % 7 === 6 ? w * (.3 + R() * .4) : w - R() * 8)}" height="5.5" fill="${INK}" opacity="${f2(.45 + R() * .25)}"/>`; return s; }
  remake(9, {
    build(root) {
      const R = rng(1010);
      add(root, `<rect width="1920" height="1080" fill="#3a2e22"/>`);
      this.page = mk('g', {}, root);
      let pg = `<rect x="40" y="20" width="1840" height="1040" fill="#e9dcbd"/><rect x="40" y="20" width="1840" height="1040" filter="url(#s10paper)" opacity=".55"/><rect x="40" y="20" width="1840" height="1040" fill="url(#s10dots)"/>`;
      pg += `<text x="960" y="138" text-anchor="middle" font-family="'KingHwa_OldSong','Huiwen-mincho'" font-size="108" fill="${INK}" letter-spacing="30">鹈鹕日报</text><text x="960" y="190" text-anchor="middle" font-family="'Playfair Display'" font-weight="900" font-size="34" letter-spacing="14" fill="${INK}">THE PELICAN GAZETTE</text>`;
      pg += `<text x="90" y="80" font-family="'Kingthings Trypewriter 2'" font-size="20" fill="${INK}">第 MCMXXII 号</text><text x="1830" y="80" text-anchor="end" font-family="'Kingthings Trypewriter 2'" font-size="20" fill="${INK}">星期三 · 有雾 · 铜元二枚</text>`;
      pg += `<path d="M70,220H1850M70,228H1850" stroke="${INK}" stroke-width="3"/><path d="M70,236H1850" stroke="${INK}" stroke-width="1.5"/>`;
      // 栏线（鹈鹕骑行的“路”）
      for (const x of [332, 632, 932, 1232, 1532]) pg += `<path d="M${x},248V1030" stroke="${INK}" stroke-width="1.6"/>`;
      pg += `<path d="M640,772H1520" stroke="${INK}" stroke-width="2.5"/><path d="M1212,700H1532M1532,1030H1880" stroke="${INK}" stroke-width="2.5"/><text x="1372" y="690" text-anchor="middle" font-family="'Kingthings Trypewriter 2'" font-size="15" fill="${INK}">← 本报讯 · 道口目击</text>`;
      // 各栏正文
      for (let c = 0; c < 6; c++) { const x = 84 + c * 300; if (c === 2 || c === 3) { pg += textLines(x, 800, 236, 14, R); continue; } pg += textLines(x, 430, 236, 40, R); }
      pg += textLines(84, 260, 236, 10, R);
      // 头版照片框（显影）
      pg += `<rect x="652" y="420" width="560" height="332" fill="#f4ead0" stroke="${INK}" stroke-width="4"/><g class="photo"><rect x="660" y="428" width="544" height="316" fill="#8a7454"/><rect x="660" y="428" width="544" height="200" fill="#b8a07a"/><g class="phpel"></g></g><rect class="dev" x="660" y="428" width="544" height="316" fill="url(#s10dev)"/><text x="932" y="768" text-anchor="middle" font-family="'Kingthings Trypewriter 2'" font-size="15" fill="${INK}" dy="-6">本报记者摄于显影室</text>`;
      // 神秘学符号
      pg += `<g transform="translate(182,880)" fill="none" stroke="${INK}"><circle r="110" stroke-width="3"/><circle r="94" stroke-width="1.2"/><circle r="66" stroke-width="2"/>${Array.from({ length: 12 }, (_, i) => `<path d="M${f1(Math.cos(i * PI / 6) * 66)},${f1(Math.sin(i * PI / 6) * 66)}L${f1(Math.cos(i * PI / 6) * 94)},${f1(Math.sin(i * PI / 6) * 94)}"/>`).join('')}<path d="${P(starPts(0, 0, 64, 26, 6), true)}" stroke-width="1.2"/></g>`;
      pg += `<g transform="translate(1690,880)"><circle r="120" fill="none" stroke="${INK}" stroke-width="2"/><g font-family="'Segoe UI Historic'" font-size="22" fill="${INK}" text-anchor="middle">${'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ'.split('').map((c, i) => `<text x="${f1(Math.cos(i * TAU / 16) * 102)}" y="${f1(Math.sin(i * TAU / 16) * 102 + 8)}">${c}</text>`).join('')}</g><path d="M0,-60L52,30H-52Z" fill="none" stroke="${INK}" stroke-width="2.5"/><circle r="12" fill="${INK}"/></g>`;
      pg += `<g transform="translate(1390,320) rotate(-12)" filter="url(#s10rough)" opacity=".8"><circle r="70" fill="none" stroke="${RED}" stroke-width="7"/><text y="18" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="48" fill="${RED}">秘</text></g>`;
      pg += `<g transform="translate(482,330)"><rect x="-110" y="-60" width="220" height="120" fill="none" stroke="${INK}" stroke-width="3"/><text y="-14" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="30" fill="${INK}">星盘占卜</text><text y="24" text-anchor="middle" font-family="'Kingthings Trypewriter 2'" font-size="18" fill="${INK}">No.10 · 每日一卦</text></g>`;
      pg += `<path d="M640,40V1060M40,540H1880" stroke="#fff8e8" stroke-width="3" opacity=".5"/><path d="M643,40V1060M40,543H1880" stroke="#7a5a30" stroke-width="1.5" opacity=".3"/>`;
      this.page.innerHTML = pg;
      this.photo = q(this.page, '.photo'); this.dev = q(this.page, '.dev');
      // 头版照片：上一版定格的那一帧（道口、电车开走后），褪色泛黄、印成网点
      def(`<filter id="n10sep" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".44 .82 .2 0 .03  .37 .72 .17 0 .02  .27 .54 .13 0 0  0 0 0 1 0"/></filter>
        <filter id="n10sepA" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix class="m" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>
        <clipPath id="n10phc"><rect x="660" y="428" width="544" height="316"/></clipPath>
        <pattern id="n10ht" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="#2e2216" opacity=".35"/></pattern>`);
      const PS9 = 544 / 1920;
      this.photo9 = add(q(this.page, '.photo'), `<g clip-path="url(#n10phc)"><rect x="660" y="428" width="544" height="316" fill="#000"/><g filter="url(#n10sep)" transform="translate(660,${f1(586 - 540 * PS9)}) scale(${f2(PS9 * 1e4) / 1e4})"><use href="#n09all"/><rect x="0" y="0" width="1920" height="140" fill="#000"/><rect x="0" y="940" width="1920" height="140" fill="#000"/></g><rect class="ht" x="660" y="428" width="544" height="316" fill="url(#n10ht)" opacity="0"/></g>`);
      this.ht = q(this.photo9, '.ht');
      this.PS9 = PS9;
      // 标题行：铅字一行行排出
      this.h1 = mk('g', {}, this.page); this.h2 = mk('g', {}, this.page);
      this.h1c = Array.from('号外！').map((c, i) => add(this.h1, `<text x="${700 + i * 120}" y="356" font-family="'Source Han Serif CN'" font-weight="900" font-size="112" fill="${RED}">${c}</text>`));
      this.h2c = Array.from('鹈鹕骑车穿城而过').map((c, i) => add(this.h2, `<text x="${960 + i * 66}" y="400" font-family="'KingHwa_OldSong','Source Han Serif CN'" font-weight="900" font-size="62" fill="${INK}">${c}</text>`));
      // 出口：报纸的版框（方框文章）
      this.box = add(this.page, `<g><path d="M1090,560H1520V1030H1090Z M1110,580V1010H1500V580Z" fill="${INK}" fill-rule="evenodd"/><text x="1305" y="550" text-anchor="middle" font-family="'Playfair Display'" font-weight="900" font-size="24" letter-spacing="5" fill="${INK}">— CONTINUED · 转下版 —</text></g>`);
      this.pg = mk('g', {}, this.page);
      this.pel = PELICANS.s10(); this.pg.appendChild(this.pel.g);
      add(root, `<rect width="1920" height="1080" fill="url(#s10vig)"/>`);
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<rect x="90" y="250" width="500" height="150" fill="#efe4c8" stroke="${INK}" stroke-width="4"/><rect x="100" y="260" width="480" height="130" fill="none" stroke="${INK}" stroke-width="1.2"/><text x="340" y="330" text-anchor="middle" font-family="'KingHwa_OldSong','Huiwen-mincho','Source Han Serif CN'" font-size="58" fill="${INK}">复古神秘学印刷风</text><text x="340" y="372" text-anchor="middle" font-family="'Playfair Display'" font-weight="700" font-style="italic" font-size="26" letter-spacing="3" fill="${RED}">Retro Occult Print</text>`;
    },
    // 读报的目光：微微推近，第 2 小节起随鹈鹕往右下移
    camM(lt) { return [1 + .05 * eio(clamp((lt + 2) / 8)), -360 * eio(inv(2.4, 6.6, lt)), -120 * eio(inv(3.4, 6.6, lt))]; },
    camT(lt) { const m = this.camM(lt); return `translate(${f1(m[1])},${f1(m[2])}) ` + zoomT(m[0], 900, 600); },
    update(lt) {
      const d = D(lt), p = pathAt(s0(lt));
      this.page.setAttribute('transform', this.camT(lt));
      ride(this.pel, d);
      // 拐角处顺势转身：路线朝下时整只鹈鹕转 90°，车轮贴着栏线
      at(this.pg, { transform: `translate(${f1(p[0])},${f1(p[1])}) rotate(${f1(p[2])}) scale(${S})` });
      this.h1c.forEach((e, i) => { const a = 2.0 + i * .1, k = inv(a, a + .08, lt); at(e, { opacity: k > 0 ? 1 : 0, transform: `translate(0,${f1((1 - k) * -40)})` }); });
      this.h2c.forEach((e, i) => { const a = 2.4 + i * .08, k = inv(a, a + .06, lt); at(e, { opacity: k > 0 ? 1 : 0, transform: `translate(0,${f1((1 - k) * -30)})` }); });
      op(this.photo, 1); op(this.dev, 0); op(this.ht, ss(1.4, 2.4, lt));
      vis(this.box, false);
      // 照片里是上一版定格的画面：保证它总是那一帧（与播放历史无关）
      const s9 = SCENES[8];
      if (s9.built && !(s9.wrap && s9.wrap._vis === 'visible')) { s9.update(6.0); if (s9._rOut) setAttrCached(s9._rOut.outer, 'opacity', '0'); }
      op(this.title, eo(inv(.15, .5, lt)) * (1 - inv(1.6, 1.9, lt)));
    },
    portal(lt) {
      const z = 1 + .05 * eio(clamp((lt + 2) / 8)), m = (x, y) => [900 + (x - 900) * z, 600 + (y - 600) * z];
      const a = m(1110, 580), b = m(1500, 1010);
      return { d: rectD(a[0], a[1], b[0] - a[0], b[1] - a[1]), box: [a[0], a[1], b[0], b[1]], pv: m(1110, 772), zmax: 6 };
    },
    exitFx: OLDSCENES[9].exitFx
  });
})();

/* ---------------- No.11 工业机能：设备监控画面；监控摄像头式的高机位斜俯视 ---------------- */
(function () {
  const K = '#161616', G2 = '#3a3a3a', G4 = '#8a8a88', G6 = '#cfcfcb', YL = '#f2c200', WH = '#ecece8';
  const D = makeDist(CRUISE);
  const S = 0.5;
  // 斜俯视投影：地面 (x,z) → 屏幕；高度 h 向上
  const OB = (x, z, h) => [x + z * .42, 760 - z * .58 - (h || 0) * .82];
  const X0 = 180;
  const pX = lt => X0 + D(lt) * S;
  const ZP = 150;
  remake(10, {
    build(root) {
      const R = rng(1111);
      bigBg(root, '#8a8884');
      this.world = mk('g', {}, root);
      let w = `<rect x="-1000" y="-600" width="6000" height="2400" fill="#8a8884"/>`;
      // 地面：混凝土格 + 警示线
      for (let x = -800; x < 4400; x += 200) { const a = OB(x, -400), b = OB(x, 1200); w += `<path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="#7a7874" stroke-width="2"/>`; }
      for (let z = -400; z < 1200; z += 200) { const a = OB(-800, z), b = OB(4400, z); w += `<path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="#7a7874" stroke-width="2"/>`; }
      const band = (z0, z1, fill) => { const a = OB(-800, z0), b = OB(4400, z0), c = OB(4400, z1), d2 = OB(-800, z1); return `<path d="${P([a, b, c, d2], true)}" fill="${fill}"/>`; };
      w += band(ZP - 70, ZP - 50, 'url(#s11haz)') + band(ZP + 50, ZP + 70, 'url(#s11haz)');
      for (let i = 0; i < 12; i++) { const p = OB(-600 + i * 420, ZP - 140); w += `<text x="${f1(p[0])}" y="${f1(p[1])}" font-family="Bender,Bahnschrift" font-weight="900" font-size="40" fill="${WH}" opacity=".5" transform="skewX(-30)">B-0${(i % 9) + 1}</text>`; }
      // 设备方块（斜俯视的盒子）
      const box = (x, z, sx, sz, h, c, top, label) => {
        const p = (a, b, hh) => OB(x + a, z + b, hh);
        let s = `<path d="${P([p(0, 0, 0), p(sx, 0, 0), p(sx, 0, h), p(0, 0, h)], true)}" fill="${c}" stroke="${K}" stroke-width="2"/>`;
        s += `<path d="${P([p(sx, 0, 0), p(sx, sz, 0), p(sx, sz, h), p(sx, 0, h)], true)}" fill="${c}" stroke="${K}" stroke-width="2" style="filter:brightness(.8)"/>`;
        s += `<path d="${P([p(0, 0, h), p(sx, 0, h), p(sx, sz, h), p(0, sz, h)], true)}" fill="${top}" stroke="${K}" stroke-width="2"/>`;
        if (label) { const q2 = p(16, 0, h - 30); s += `<text x="${f1(q2[0])}" y="${f1(q2[1])}" font-family="Bender,Bahnschrift" font-weight="900" font-size="26" fill="${YL}">${label}</text>`; }
        return s;
      };
      const items = [];
      for (let i = 0; i < 8; i++) items.push([-400 + i * 560, 420 + (i % 3) * 120, 260, 220, 240 + (i % 2) * 120, i % 3 ? '#a8a49c' : '#7a4a2a', i % 3 ? '#c8c4bc' : '#9a6a3a', 'UNIT ' + (11 + i)]);
      for (let i = 0; i < 7; i++) items.push([-200 + i * 640, -330, 180, 120, 160, WH, '#fff', 'EQ-' + (20 + i)]);
      items.sort((a, b) => b[1] - a[1]);
      items.forEach(it => { if (it[1] < 0) return; w += box(...it); });
      this.boxes = items.filter(it => it[1] >= 0); this.OB = OB;
      // 柱子与管线（锈蚀钢结构）
      for (let i = 0; i < 8; i++) { const x = -300 + i * 600; const a = OB(x, 300), b = OB(x, 300, 900); w += `<path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="#5a3a2a" stroke-width="26"/><path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="#8a5a34" stroke-width="12"/>`; }
      { const a = OB(-800, 300, 820), b = OB(4400, 300, 820), c = OB(-800, 340, 760), d2 = OB(4400, 340, 760); w += `<path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="#7a4a2a" stroke-width="30"/><path d="M${f1(c[0])},${f1(c[1])}L${f1(d2[0])},${f1(d2[1])}" stroke="${YL}" stroke-width="18"/>`; }
      // 传送带（沿行进方向）
      const cb0 = X0 + D(1.9) * S, cb1 = X0 + D(4.0) * S;
      this.cb = [cb0, cb1];
      { const a = OB(cb0, ZP - 50), b = OB(cb1, ZP - 50), c = OB(cb1, ZP + 50), d2 = OB(cb0, ZP + 50); w += `<path d="${P([a, b, c, d2], true)}" fill="#2a2a2a" stroke="${K}" stroke-width="3"/>`; w += `<g class="rollers">${Array.from({ length: 30 }, (_, i) => { const q2 = OB(cb0 + i * (cb1 - cb0) / 30, ZP - 50), q3 = OB(cb0 + i * (cb1 - cb0) / 30, ZP + 50); return `<path d="M${f1(q2[0])},${f1(q2[1])}L${f1(q3[0])},${f1(q3[1])}" stroke="${G4}" stroke-width="4"/>`; }).join('')}</g>`; }
      { const a = OB(-800, ZP - 200, 640), b = OB(4400, ZP - 200, 640); w += `<path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="${K}" stroke-width="34"/><path d="M${f1(a[0])},${f1(a[1])}L${f1(b[0])},${f1(b[1])}" stroke="${YL}" stroke-width="22" stroke-dasharray="40 24"/>`; }
      // 里程碑 No.11
      { const p = OB(X0 + D(.8) * S + 120, ZP + 120); w += `<g transform="translate(${f1(p[0])},${f1(p[1])})"><rect x="-4" y="-120" width="8" height="120" fill="${K}"/><path d="M-70,-190H70L84,-176V-120H-84V-176Z" fill="${K}"/><text y="-146" text-anchor="middle" font-family="Bender" font-weight="900" font-size="40" fill="${YL}">No.11</text></g>`; }
      this.world.innerHTML = w;
      this.rollers = q(this.world, '.rollers');
      // 鹈鹕（斜俯视：略压扁、带影子）
      this.pg = mk('g', {}, this.world);
      this.pshadow = mk('ellipse', { rx: 140, ry: 30, fill: '#000', opacity: .25 }, this.pg);
      this.pw = mk('g', {}, this.pg);
      this.pel = PELICANS.s11(); this.pw.appendChild(this.pel.g);
      // 机械臂（从上方伸下来）
      this.arms = [0, 1, 2].map(i => add(this.world, `<g><path class="a" stroke="${G6}" stroke-width="18" stroke-linecap="round" fill="none"/><path class="b" stroke="${K}" stroke-width="4" fill="none"/><circle class="j" r="14" fill="${G2}" stroke="${K}" stroke-width="3"/><rect class="hd" x="-18" y="-10" width="36" height="20" fill="${YL}" stroke="${K}" stroke-width="3"/></g>`));
      this.beacon = add(this.world, `<g><circle r="22" fill="#ffb020" stroke="${K}" stroke-width="3"/><path class="bz" d="M0,0L320,-90L320,90Z" fill="url(#s11beam)" opacity=".7"/></g>`);
      // 出口：升起的安全闸门（斜俯视）
      this.gate = mk('g', {}, this.world);
      const gx = X0 + D(6) * S;
      this.gx = gx;
      { const p = (a, b, h) => OB(gx + a, ZP + b, h); const fr = `<path d="${P([p(0, -130, 0), p(0, -130, 560), p(0, 130, 560), p(0, 130, 0), p(0, 100, 0), p(0, 100, 520), p(0, -100, 520), p(0, -100, 0)], true)}" fill="${G2}" stroke="${K}" stroke-width="3"/>`;
        this.gate.innerHTML = fr + `<path d="${P([p(0, -130, 560), p(0, 130, 560), p(0, 130, 600), p(0, -130, 600)], true)}" fill="url(#s11haz)"/><g class="door"><path d="${P([p(0, -100, 0), p(0, 100, 0), p(0, 100, 520), p(0, -100, 520)], true)}" fill="#5a5a58" stroke="${K}" stroke-width="3"/>${[1, 2, 3, 4, 5, 6].map(i => `<path d="M${f1(p(0, -100, i * 74)[0])},${f1(p(0, -100, i * 74)[1])}L${f1(p(0, 100, i * 74)[0])},${f1(p(0, 100, i * 74)[1])}" stroke="${K}" stroke-width="3"/>`).join('')}</g>`;
        this.gq = [p(0, -100, 0), p(0, 100, 0), p(0, 100, 520), p(0, -100, 520)]; }
      this.door = q(this.gate, '.door');
      // 监控界面：扫描框、编号、刻度、REC
      let ui = `<rect width="1920" height="1080" fill="url(#n11scan)"/><path d="M40,40h100M40,40v100M1880,40h-100M1880,40v100M40,1040h100M40,1040v-100M1880,1040h-100M1880,1040v-100" stroke="${WH}" stroke-width="5" fill="none"/>`;
      ui += `<g font-family="'JetBrains Mono',Bender" font-size="26" fill="${WH}"><text x="70" y="90">CAM 11 · 工区 B · 装备整备线</text><text class="ts" x="1850" y="90" text-anchor="end">2026-11-23 15:59:00</text><circle class="rec" cx="84" cy="1000" r="12" fill="#ff3030"/><text x="106" y="1009">REC</text><text x="1850" y="1009" text-anchor="end">ZOOM 1.0× · PAN</text></g>`;
      for (let i = 0; i < 40; i++) ui += `<path d="M${560 + i * 20},1040v${i % 5 ? -10 : -22}" stroke="${WH}" stroke-width="2"/>`;
      ui += `<g class="trk" fill="none" stroke="${YL}" stroke-width="3"><path class="tb"/><text class="tl" font-family="Bender" font-size="22" fill="${YL}" stroke="none">TARGET · PELICAN #22</text></g>`;
      ui += `<g transform="translate(1500,140)"><path d="M0,0H340L370,30V110H30L0,80Z" fill="${K}" fill-opacity=".8" stroke="${YL}" stroke-width="3"/><text x="30" y="46" font-family="Bender" font-weight="900" font-size="24" fill="${WH}">STATUS</text><text class="stt" x="30" y="90" font-family="'Source Han Sans CN'" font-weight="900" font-size="30" fill="${YL}">待整备</text></g>`;
      def(`<pattern id="n11scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" opacity=".12"/></pattern><radialGradient id="n11vig" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>`);
      const hud = hudOf(root);
      this.ui = mk('g', {}, hud); this.ui.innerHTML = `<rect width="1920" height="1080" fill="url(#n11vig)"/>` + ui;
      this.world.appendChild(q(this.ui, '.trk'));          // 跟踪框跟着画面里的鹈鹕走
      this.tb = q(this.world, '.tb'); this.tl = q(this.world, '.tl'); this.ts = q(this.ui, '.ts'); this.rec = q(this.ui, '.rec'); this.stt = q(this.ui, '.stt');
      this.title = mk('g', {}, hud);
      this.title.innerHTML = `<path d="M0,0H700L760,60V200H60L0,140Z" fill="${WH}" stroke="${K}" stroke-width="5"/><rect x="0" y="0" width="34" height="200" fill="url(#s11haz)"/><text x="70" y="112" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="90" fill="${K}">工业机能风</text><rect x="70" y="134" width="420" height="44" fill="${K}"/><text x="84" y="168" font-family="Bender,Bahnschrift" font-weight="900" font-size="34" letter-spacing="6" fill="${YL}">INDUSTRIAL TECH</text>`;
    },
    camAt(lt) { const x = pX(Math.min(lt, 6)); return [lerp(620, 960, ss(-2, 6, lt)) - OB(x, ZP)[0], 0]; },
    update(lt) {
      const d = D(lt), x = pX(lt), c = this.camAt(lt);
      this.world.setAttribute('transform', `translate(${f1(c[0])},${f1(c[1] + 40)})`);
      const onBelt = x > this.cb[0] && x < this.cb[1];
      const p = OB(x, ZP, onBelt ? 22 : 0);
      ride(this.pel, d);
      at(this.pw, { transform: `translate(${f1(p[0])},${f1(p[1])}) scale(${S},${f2(S * .84)}) skewX(-8)` });
      at(this.pshadow, { cx: f1(p[0] + 20), cy: f1(p[1] + 6) });
      this.rollers.setAttribute('transform', `translate(${f1(((lt * 30) % 15))},0)`);
      const tg = [2.25, 2.75, 3.25];
      this.arms.forEach((a, i) => {
        const t0 = tg[i], k = ss(t0 - .3, t0, lt) * (1 - ss(t0 + .12, t0 + .4, lt));
        const base = OB(x + [-40, 40, 0][i], ZP - 200, 640), tip = OB(x + [10, 50, -10][i], ZP, lerp(480, 210, k));
        const j = [(base[0] + tip[0]) / 2 + 60, (base[1] + tip[1]) / 2 - 40];
        at(q(a, '.a'), { d: `M${f1(base[0])},${f1(base[1])}L${f1(j[0])},${f1(j[1])}L${f1(tip[0])},${f1(tip[1])}` });
        at(q(a, '.j'), { cx: f1(j[0]), cy: f1(j[1]) }); at(q(a, '.hd'), { transform: `translate(${f1(tip[0])},${f1(tip[1])})` });
        op(a, ss(1.9, 2.1, lt) * (1 - ss(3.9, 4.1, lt)));
      });
      this.pel.gear(ss(2.2, 2.3, lt), ss(2.7, 2.8, lt), ss(3.2, 3.3, lt));
      const bk = inv(3.45, 3.95, lt), bp = OB(x + 120, ZP - 160, 300);
      at(this.beacon, { transform: `translate(${f1(bp[0])},${f1(bp[1])})`, opacity: f2(ss(1.9, 2.1, lt) * (1 - ss(3.95, 4.1, lt))) });
      at(q(this.beacon, '.bz'), { transform: `scale(${f2(Math.cos(bk * TAU))},1)`, opacity: bk > 0 && bk < 1 ? .7 : 0 });
      this.stt.textContent = lt < 2.2 ? '待整备' : lt < 3.4 ? '整备中…' : '整备完毕 ✓';
      // 跟踪框（画在世界坐标里）
      const sx = p[0], sy = p[1];
      this.tb.setAttribute('d', `M${f1(sx - 130)},${f1(sy - 230)}h40M${f1(sx - 130)},${f1(sy - 230)}v40M${f1(sx + 150)},${f1(sy - 230)}h-40M${f1(sx + 150)},${f1(sy - 230)}v40M${f1(sx - 130)},${f1(sy + 20)}h40M${f1(sx - 130)},${f1(sy + 20)}v-40M${f1(sx + 150)},${f1(sy + 20)}h-40M${f1(sx + 150)},${f1(sy + 20)}v-40`);
      at(this.tl, { x: f1(sx - 130), y: f1(sy - 244) });
      this.ts.textContent = `2026-11-23 15:59:${String(Math.floor(Math.max(0, lt + 2.1) * 4)).padStart(2, '0')}`;
      op(this.rec, Math.floor(lt * 2) % 2 ? .25 : 1);
      this.door.setAttribute('transform', `translate(0,${f1(-430 * eio(inv(4.3, 5.4, lt)))})`);
      vis(this.gate, false);
      at(this.title, { transform: `translate(${f1(140 - (1 - eo(inv(.15, .45, lt))) * 900 - inv(1.7, 1.95, lt) * 1200)},230)` });
    },
    portal(lt) { const c = this.camAt(lt), g = this.gq.map(p => [p[0] + c[0], p[1] + c[1] + 40]); const xs = g.map(p => p[0]), ys = g.map(p => p[1]); return { d: P(g, true), box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], zmax: 8 }; },
    exitFx: OLDSCENES[10].exitFx
  });
})();

/* ---------------- No.12 蓝图：一张工程图纸，正交视图；先以三视图出现，再沿尺寸线骑过整张图 ---------------- */
(function () {
  const BL = '#1d4f9a', WL = '#eaf2ff', FS = "'Zhuque Fangsong (technical preview)','STFangsong',serif";
  const V12 = lt => SPEED * ss(-.4, .3, lt) + 0;            // 先停在图上（三视图），再起步
  const D = makeDist(CRUISE);                               // 骑着进来（转场时骑行不中断）
  const S = 0.62, YD = 820, X0 = 300;
  const BOM = [['1', '车架', '1', '铬钼钢'], ['2', '车轮', '2', '铝合金'], ['3', '链条', '1', '碳钢'], ['4', '车铃', '1', '黄铜'], ['5', '车座', '1', '皮革'], ['6', '踏板', '2', '尼龙'], ['7', '鹈鹕', '1', '材料：不详']];
  remake(11, {
    build(root) {
      add(root, `<rect x="-3000" y="-2400" width="7920" height="5880" fill="${BL}"/><rect x="-3000" y="-2400" width="7920" height="5880" fill="url(#s12G)"/><rect x="40" y="40" width="1840" height="1000" fill="none" stroke="${WL}" stroke-width="4"/><rect x="56" y="56" width="1808" height="968" fill="none" stroke="${WL}" stroke-width="1.5"/>`);
      // 三视图：正视（正面画法）、俯视、侧视（就是要骑走的那只）
      this.views = mk('g', {}, root);
      this.front = makePelicanFB({ line: WL, lw: 2, body: 'none', wing: 'none', beak: 'none', pouch: 'none', eye: WL, leg: WL, tire: WL, frame: WL, bar: WL, fish: 'none', shade: 'none', saddle: WL, treadC: WL }, 'front');
      const fv = mk('g', { transform: 'translate(240,500) scale(.62)' }, this.views); fv.appendChild(this.front.g); this.front.update(0, 0, {});
      this.views.innerHTML += `<g fill="none" stroke="${WL}" stroke-width="1.6"><g transform="translate(620,380)"><ellipse rx="140" ry="16"/><path d="M-70,0H70M-70,-5H70M-70,5H70"/><ellipse cx="-20" rx="56" ry="34"/><path d="M30,0L150,-8L150,8Z"/><circle cx="40" r="16"/></g><path d="M170,500H310M240,180V530M450,380H800M620,260V420" stroke-dasharray="20 5 3 5" stroke-width="1"/></g>
        <g font-family="${FS}" font-size="22" fill="${WL}"><text x="240" y="560" text-anchor="middle">正视图</text><text x="620" y="470" text-anchor="middle">俯视图</text><text x="${X0}" y="${YD + 60}" text-anchor="middle">侧视图（A 向）</text></g>
        <g class="expl" fill="none" stroke="${WL}" stroke-width="1.6"><g class="e1"><circle r="40"/><circle r="6"/></g><g class="e2"><path d="M-60,0H60M-40,0L-10,-40H40"/></g><g class="e4"><circle r="14"/><path d="M0,-14V-24M-8,-24H8"/></g><g class="e5"><path d="M-30,0H30M0,-10V10"/></g><path class="ld" stroke-dasharray="6 6" stroke-width="1"/></g><text x="1050" y="150" font-family="${FS}" font-size="24" fill="${WL}">爆炸视图 EXPLODED VIEW</text>`;
      this.ex = [1, 2, 4, 5].map(i => q(this.views, '.e' + i)); this.ld = q(this.views, '.ld');
      // 长尺寸线（鹈鹕沿它骑过整张图）
      let dl = `<path d="M120,${YD}H1800" stroke="${WL}" stroke-width="2.5"/>`;
      for (let x = 120; x <= 1800; x += 40) dl += `<path d="M${x},${YD}v${x % 200 === 120 % 200 ? 18 : 9}" stroke="${WL}" stroke-width="1.4"/>`;
      dl += `<path d="M120,${YD - 14}V${YD + 14}M1800,${YD - 14}V${YD + 14}" stroke="${WL}" stroke-width="2.5"/><path d="M120,${YD}l18,-6v12ZM1800,${YD}l-18,-6v12Z" fill="${WL}"/>`;
      for (let x = 120; x <= 1800; x += 200) dl += `<text x="${x}" y="${YD + 44}" text-anchor="middle" font-family="'Courier Prime'" font-size="18" fill="${WL}">${(x - 120) * 10}</text>`;
      add(root, dl);
      this.dim = mk('g', {}, root);
      this.dim.innerHTML = `<path class="dd" stroke="${WL}" stroke-width="1.6" fill="none"/><text class="dt" font-family="'Courier Prime'" font-weight="700" font-size="24" fill="${WL}" text-anchor="middle"></text>`;
      this.dd = q(this.dim, '.dd'); this.dt = q(this.dim, '.dt');
      add(root, `<g transform="translate(160,${YD})" fill="none" stroke="${WL}" stroke-width="2"><path d="M0,0V-100"/><rect x="-60" y="-160" width="120" height="60"/><text y="-120" text-anchor="middle" fill="${WL}" stroke="none" font-family="'Courier Prime'" font-weight="700" font-size="28">No.12</text></g>`);
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s12(); this.pg.appendChild(this.pel.g);
      // 零件表
      let tb = `<g transform="translate(1200,170)" font-family="${FS}" fill="${WL}"><rect width="620" height="${40 * 8}" fill="${BL}" fill-opacity=".9" stroke="${WL}" stroke-width="2.5"/><path d="M70,0V320M290,0V320M380,0V320" stroke="${WL}" stroke-width="1.5"/><text x="35" y="28" text-anchor="middle" font-size="20">序号</text><text x="180" y="28" text-anchor="middle" font-size="20">名称</text><text x="335" y="28" text-anchor="middle" font-size="20">数量</text><text x="500" y="28" text-anchor="middle" font-size="20">材料</text>`;
      BOM.forEach((r, i) => { tb += `<g class="row" opacity="0"><path d="M0,${40 * (i + 1)}H620" stroke="${WL}" stroke-width="1.2"/>${i === 6 ? `<rect class="hl" x="2" y="${40 * 7 + 2}" width="616" height="36" fill="${WL}" opacity=".18"/>` : ''}<text x="35" y="${40 * (i + 1) + 28}" text-anchor="middle" font-size="22">${r[0]}</text><text x="180" y="${40 * (i + 1) + 28}" text-anchor="middle" font-size="22">${r[1]}</text><text x="335" y="${40 * (i + 1) + 28}" text-anchor="middle" font-size="22">${r[2]}</text><text x="500" y="${40 * (i + 1) + 28}" text-anchor="middle" font-size="22">${r[3]}</text></g>`; });
      this.tbg = add(root, tb + `</g>`); this.rows = qa(this.tbg, '.row');
      // 标题栏（右下）与出口画框
      add(root, `<g font-family="${FS}" fill="${WL}"><rect x="1300" y="900" width="560" height="120" fill="${BL}" stroke="${WL}" stroke-width="3"/><path d="M1300,950H1860M1640,900V1020" stroke="${WL}" stroke-width="1.5"/><text x="1470" y="938" text-anchor="middle" font-size="26">鹈鹕与自行车 总装图</text><text x="1470" y="996" text-anchor="middle" font-size="22">比例 1:10 · 第 12 张</text><text x="1750" y="938" text-anchor="middle" font-size="22">PL-12</text><text x="1750" y="996" text-anchor="middle" font-size="22">设计 鹈鹕</text></g>`);
      this.fx0 = X0 + D(6) * S;
      this.frame = add(root, `<g transform="translate(${f1(this.fx0)},${YD + 18})"><g fill="none" stroke="${WL}"><rect x="-210" y="-400" width="420" height="418" stroke-width="4"/><rect x="-232" y="-422" width="464" height="462" stroke-width="1.6"/></g><g font-family="${FS}" fill="${WL}"><rect x="-232" y="-470" width="464" height="48" fill="${BL}" stroke="${WL}" stroke-width="2"/><text y="-438" text-anchor="middle" font-size="22">图名：下一张 · 水墨 · PL-13</text></g></g>`);
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g font-family="${FS}" fill="${WL}"><rect width="640" height="150" fill="${BL}" stroke="${WL}" stroke-width="3"/><path d="M0,100H640M460,0V150" stroke="${WL}" stroke-width="1.5"/><text x="230" y="74" text-anchor="middle" font-size="62" letter-spacing="6">蓝图工程绘图</text><text x="230" y="136" text-anchor="middle" font-family="'Courier Prime'" font-weight="700" font-size="30" letter-spacing="10">BLUEPRINT</text><text x="550" y="60" text-anchor="middle" font-size="20">图号</text><text x="550" y="136" text-anchor="middle" font-size="20">PL-12</text></g>`;
    },
    update(lt) {
      const d = D(lt), x = X0 + d * S;
      ride(this.pel, d);
      at(this.pg, { transform: `translate(${f1(x)},${YD}) scale(${S})` });
      // 尺寸线随骑行伸缩：从起点量到前轮
      const fwx = x + PG.FW[0] * S + 60 * S;
      this.dd.setAttribute('d', `M${X0},${YD + 64}V${YD + 104}M${f1(fwx)},${YD + 64}V${YD + 104}M${X0},${YD + 84}H${f1(fwx)}M${X0},${YD + 84}l14,-5v10ZM${f1(fwx)},${YD + 84}l-14,-5v10Z`);
      at(this.dt, { x: f1((X0 + fwx) / 2), y: YD + 76 }); this.dt.textContent = `L = ${Math.round((fwx - X0) * 10)}`;
      const ek = .5 + .5 * Math.sin(lt * 2), base = [[1000, 300], [1080, 380], [1160, 260], [1050, 220]];
      this.ex.forEach((e, i) => e.setAttribute('transform', `translate(${f1(base[i][0] + (i - 1.5) * 50 * ek)},${f1(base[i][1] + (i % 2 ? 1 : -1) * 30 * ek)})`));
      this.ld.setAttribute('d', P(base.map((b, i) => [b[0] + (i - 1.5) * 50 * ek, b[1] + (i % 2 ? 1 : -1) * 30 * ek])));
      op(this.views, 1 - ss(1.6, 2.0, lt) * .55);
      this.rows.forEach((r, i) => op(r, inv(2.0 + i * .24, 2.1 + i * .24, lt)));
      op(this.tbg, ss(1.8, 2.0, lt) * (1 - ss(4.0, 4.3, lt)));
      vis(this.frame, false);
      at(this.title, { transform: `translate(90,${f1(890 + (1 - eo(inv(.15, .45, lt))) * 300 + inv(1.7, 1.95, lt) * 300)})` });
    },
    portal(lt) { const x = this.fx0; return { d: rectD(x - 210, YD + 18 - 400, 420, 418), box: [x - 210, YD - 382, x + 210, YD + 18], zmax: 9 }; },
    exitFx: OLDSCENES[11].exitFx
  });
})();
