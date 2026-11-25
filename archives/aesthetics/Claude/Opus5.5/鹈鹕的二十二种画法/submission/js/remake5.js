'use strict';
/* ---------------- No.13 水墨国风：竖长的山水立轴；镜头从顶端远山缓缓下移，鹈鹕在山腰小径上很小 ---------------- */
function polyPath(PATH) {
  const L = [0]; for (let i = 1; i < PATH.length; i++) L.push(L[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
  const f = s => { s = clamp(s, -500, L[L.length - 1] + 500); let i = 1; while (i < L.length - 1 && L[i] < s) i++; const a = PATH[i - 1], b = PATH[i], k = (s - L[i - 1]) / (L[i] - L[i - 1]); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(b[1] - a[1], b[0] - a[0])]; };
  f.len = L[L.length - 1]; return f;
}
(function () {
  const INK = '#1c1c1e', PAPER = '#efe7d3', SEAL = '#b8281e';
  const D = makeDist(CRUISE);
  const S = 0.22, SX = 620;                                   // 画心在屏幕上的左边
  // 山腰小径往下，第 3 小节拐到江边，沿江岸向左骑（下一版的驿道也是向左）
  const PTH = polyPath([[180, 1880], [470, 2040], [540, 2150], [600, 2268], [-200, 2276]]);
  const sAt = lt => (PTH.len - 640) - (D(6) - D(lt)) * S;
  const PAV = [455, 1975];
  // 镜头关键帧（立轴坐标的中心与缩放）：整幅 → 顶端远山 → 缓缓下移 → 推近亭子 → 江边的鹈鹕
  const KF = [[1.8, 340, 1150, .4], [2.45, 340, 430, 1.35], [3.75, 420, 1700, 1.35], [4.3, 455, 1950, 2.1], [5.3, null, 2215, 1.7]];
  function view(lt, rx) {
    if (lt <= KF[0][0]) return { cx: KF[0][1], cy: KF[0][2], k: KF[0][3] };
    for (let i = 1; i < KF.length; i++) if (lt <= KF[i][0]) { const a = KF[i - 1], b = KF[i], e = eio(inv(a[0], b[0], lt)); const ax = a[1] === null ? rx : a[1], bx = b[1] === null ? rx : b[1]; return { cx: lerp(ax, bx, e), cy: lerp(a[2], b[2], e), k: a[3] * Math.pow(b[3] / a[3], e) }; }
    const L = KF[KF.length - 1]; return { cx: rx, cy: L[2], k: L[3] };
  }
  remake(12, {
    build(root) {
      const R = rng(1313);
      add(root, `<rect width="1920" height="1080" fill="#2a2622"/><rect width="1920" height="1080" filter="url(#s13fiber)" opacity=".15"/>`);
      this.scroll = mk('g', {}, root);
      const W = 680, H = 2420;
      let s = `<rect x="-60" y="-150" width="${W + 120}" height="${H + 300}" fill="#bfae7e"/><rect x="-60" y="-150" width="${W + 120}" height="${H + 300}" fill="url(#n13brocade)"/><rect x="-14" y="-14" width="${W + 28}" height="${H + 28}" fill="#7a6a4a"/>`;
      s += `<rect width="${W}" height="${H}" fill="${PAPER}"/><rect width="${W}" height="${H}" filter="url(#s13fiber)" opacity=".4"/>`;
      // 远山（顶端）
      const ridge = (y0, amp, step, seed, w) => { const R2 = rng(seed); let d = `M-20,${y0 + 300}`; for (let x = -20; x <= w; x += step) d += `L${x},${f1(y0 - (Math.sin(x * .012 + seed) * .5 + .5) * amp - R2() * amp * .3)}`; return d + `L${w},${y0 + 300}Z`; };
      s += `<g filter="url(#s13blur)"><path d="${ridge(420, 260, 26, 1, 700)}" fill="url(#s13m1)"/><path d="${ridge(640, 300, 22, 2, 700)}" fill="url(#s13m2)"/><path d="${ridge(980, 380, 20, 3, 700)}" fill="url(#s13m3)"/><path d="${ridge(1400, 300, 22, 4, 700)}" fill="url(#s13m2)"/><path d="${ridge(1780, 260, 20, 5, 700)}" fill="url(#s13m3)"/></g>`;
      s += `<path d="M560,700C580,820 540,900 560,1060" stroke="#fbf7ee" stroke-width="18" fill="none" opacity=".7" filter="url(#s13blur)"/>`;
      s += `<g fill="${INK}">${Array.from({ length: 5 }, (_, i) => `<path d="M${120 + i * 30},${200 + (i % 2) * 14}q8,-8 16,0q8,-8 16,0" stroke="${INK}" stroke-width="2.5" fill="none"/>`).join('')}</g>`;
      s += `<text x="620" y="60" font-family="'STXingkai','Alimama DongFangDaKai'" font-size="36" fill="${INK}" writing-mode="tb" letter-spacing="4">远山无尽处 一鹕骑车来</text><rect x="568" y="420" width="30" height="30" fill="${SEAL}"/><rect x="568" y="460" width="30" height="30" fill="${SEAL}"/>`;
      // 山腰的松树与云雾
      for (let i = 0; i < 26; i++) { const x = R() * 680, y = 1000 + R() * 1100; s += `<g transform="translate(${f1(x)},${f1(y)}) scale(${f2(.5 + R() * .6)})"><path d="M0,0C-4,-20 6,-40 0,-64" stroke="${INK}" stroke-width="5" fill="none"/>${[0, 1, 2, 3].map(j => `<ellipse cx="${(j % 2 ? 14 : -12) + (j === 3 ? 0 : 0)}" cy="${-26 - j * 13}" rx="${30 - j * 5}" ry="${8 - j}" fill="${INK}" opacity="${.55 + j * .1}"/>`).join('')}</g>`; }
      // 竹林与小溪、石桥（下部）
      for (let i = 0; i < 16; i++) { const x = 20 + R() * 640, y = 2180 + R() * 200, h = 160 + R() * 160; s += `<path d="M${f1(x)},${f1(y)}L${f1(x + 3)},${f1(y - h)}" stroke="${INK}" stroke-width="5" opacity=".85"/>${[0, 1, 2].map(j => `<path d="M0,0C10,-5 28,-5 46,1C28,5 10,5 0,0Z" fill="${INK}" transform="translate(${f1(x + 3)},${f1(y - h * (.5 + j * .2))}) rotate(${f1(20 + j * 30)})"/>`).join('')}`; }
      // 山下的江面（淡墨晕染的水与水纹）
      s += `<path d="M0,2282C200,2276 400,2288 680,2280V2420H0Z" fill="#cfcabb" opacity=".55"/><path d="M0,2282C200,2276 400,2288 680,2280" stroke="${INK}" stroke-width="3" fill="none" opacity=".7"/>${Array.from({ length: 14 }, (_, i) => `<path d="M${20 + (i * 97) % 640},${2300 + (i * 37) % 100}q14,-6 28,0q14,6 28,0" stroke="${INK}" stroke-width="2" fill="none" opacity=".35"/>`).join('')}`;
      // 山间小径：墨色由浓到淡退向远处（之字形）
      s += `<path d="M640,1500C600,1560 640,1640 600,1700" stroke="${INK}" stroke-width="5" fill="none" opacity=".25" stroke-dasharray="20 10"/>`;
      s += `<path d="${smooth([[600, 1700], [520, 1790], [230, 1900], [470, 2040], [330, 2140], [345, 2200]])}" stroke="${INK}" stroke-width="7" fill="none" mask="url(#s13road)" opacity=".85"/>`;
      // 亭与文人（画卷上早已画着骑车的鹈鹕）
      s += `<g transform="translate(${PAV[0]},${PAV[1]}) scale(.32)"><path d="M-150,0V-200M150,0V-200" stroke="${INK}" stroke-width="10"/><path d="M-230,-200Q-150,-216 -120,-250L0,-300L120,-250Q150,-216 230,-200Q200,-208 180,-206L-180,-206Q-200,-208 -230,-200Z" fill="${INK}"/><path d="M-110,-20H70V-50H-110Z" fill="none" stroke="${INK}" stroke-width="5"/><g class="scroll"><rect x="-98" y="-62" width="150" height="16" fill="#f4ecd8" stroke="${INK}" stroke-width="2"/></g>
        <g><path d="M-40,0C-50,-40 -50,-80 -30,-100L10,-100C30,-80 30,-40 20,0Z" fill="#e8e0cc" stroke="${INK}" stroke-width="4"/><g class="shd"><circle cx="-6" cy="-118" r="18" fill="#efe6d2" stroke="${INK}" stroke-width="4"/><path d="M-20,-128Q-6,-146 10,-128" fill="${INK}"/></g></g></g>`;
      // 里程碑（石碑）
      s += `<g transform="translate(560,1760) scale(.35)"><path d="M-30,0Q-36,-80 -20,-120Q0,-140 20,-120Q36,-80 30,0Z" fill="#d8d0bc" stroke="${INK}" stroke-width="5"/><text y="-74" text-anchor="middle" font-family="'STXingkai'" font-size="34" fill="${INK}" writing-mode="tb">十三</text></g>`;
      this.gateC = [345, 2140]; this.gateR = 46;
      // 上下轴头
      s += `<rect x="-90" y="-176" width="${W + 180}" height="30" rx="15" fill="#3a2a1a"/><circle cx="-96" cy="-161" r="18" fill="#6a4a2a"/><circle cx="${W + 96}" cy="-161" r="18" fill="#6a4a2a"/><rect x="-90" y="${H + 150}" width="${W + 180}" height="36" rx="18" fill="#3a2a1a"/>`;
      def(`<pattern id="n13brocade" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#c4b282"/><path d="M20,4L36,20L20,36L4,20Z" fill="none" stroke="#a8945e" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="#a8945e"/></pattern>`);
      this.scroll.innerHTML = s;
      this.shd = q(this.scroll, '.shd');
      this.pg = mk('g', {}, this.scroll);
      this.pel = PELICANS.s13(); this.pg.appendChild(this.pel.g);
      // 特写：亭中画卷上的鹈鹕（推近时浮现）
      const hud = hudOf(root);
      this.inset = mk('g', {}, hud);
      this.inset.innerHTML = `<rect x="-230" y="-130" width="460" height="260" fill="#efe6d0" stroke="${INK}" stroke-width="5"/><rect x="-250" y="-140" width="20" height="280" rx="8" fill="#6a4a2a"/><rect x="230" y="-140" width="20" height="280" rx="8" fill="#6a4a2a"/><g class="ipel"></g><rect x="150" y="-110" width="40" height="40" fill="${SEAL}"/><text x="170" y="-82" text-anchor="middle" font-family="'STXingkai'" font-size="26" fill="#f4e8d8">鹕</text><text x="-200" y="-90" font-family="'STXingkai'" font-size="28" fill="${INK}" writing-mode="tb">早已画好</text>`;
      this.ipel = PELICANS.s13(); q(this.inset, '.ipel').appendChild(this.ipel.g); this.ipel.update(.2, 0); this.ipel.g.setAttribute('transform', 'translate(-10,110) scale(.5)');
      this.title = mk('g', {}, hud);
      this.title.innerHTML = `<text x="0" y="0" font-family="'STXingkai','Alimama DongFangDaKai'" font-size="150" fill="#efe7d3" writing-mode="tb" letter-spacing="-6">水墨国风</text><rect x="-34" y="600" width="68" height="68" fill="${SEAL}"/><text y="646" text-anchor="middle" font-family="'STXingkai'" font-size="40" fill="#f4e8d8">墨</text><text x="80" y="20" font-family="'Cormorant Garamond'" font-style="italic" font-size="30" fill="#c8bea8" writing-mode="tb" letter-spacing="4">Chinese Ink Painting</text>`;
    },
    apply(lt) {
      const p = PTH(sAt(lt)), v = view(lt, p[0]);
      return { v, t: `translate(960,540) scale(${f2(v.k * 1000) / 1000}) translate(${f1(-v.cx - SX)},${f1(-v.cy)}) translate(${SX},0)` };
    },
    update(lt) {
      const d = D(lt), p = PTH(sAt(lt)), flip = Math.cos(p[2]) < 0;
      const c = this.apply(lt);
      this.scroll.setAttribute('transform', c.t);
      ride(this.pel, d);
      at(this.pg, { transform: `translate(${f1(p[0])},${f1(p[1])}) rotate(${f1(Math.atan2(Math.sin(flip ? p[2] - PI : p[2]), Math.cos(flip ? p[2] - PI : p[2])) * 180 / PI * .4)}) scale(${flip ? -S : S},${S})` });
      const up = ss(4.05, 4.3, lt) * (1 - ss(4.75, 4.95, lt));
      this.shd.setAttribute('transform', `rotate(${f1(-28 * up + 12 * ss(4.8, 5.0, lt))},-6,-100)`);
      const ik = eo(inv(3.95, 4.2, lt)) * (1 - eo(inv(4.75, 5.0, lt)));
      vis(this.inset, ik > .01); at(this.inset, { transform: `translate(1480,300) scale(${f2(ik)})` });
      op(this.title, ss(.15, .6, lt) * (1 - ss(1.7, 2.0, lt)));
      this.title.setAttribute('transform', 'translate(1560,140)');
    },
    portal(lt) {
      const c = this.apply(lt), m = (x, y) => { let X = SX + x, Y = y - c.py; X = c.fx + (X - c.fx) * c.z; Y = c.fy + (Y - c.fy) * c.z; X = c.gx + (X - c.gx) * c.gz; Y = c.gy + (Y - c.gy) * c.gz; return [X, Y]; };
      const ctr = m(this.gateC[0], this.gateC[1]), r = this.gateR * c.z * c.gz;
      return { d: circD(ctr[0], ctr[1], r), box: [ctr[0] - r, ctr[1] - r, ctr[0] + r, ctr[1] + r], zmax: 26 };
    },
    exitFx: OLDSCENES[12].exitFx
  });
})();

/* ---------------- No.14 浮世绘：横幅木版画；平视远景，鹈鹕沿海边驿道从右向左骑，巨浪在前景 ---------------- */
(function () {
  const IND = '#1d2a4a', PRU = '#24427a';
  const D = makeDist(CRUISE);
  const S = 0.56, YR = 760;
  const xAt = lt => 250 + (D(6) - D(lt)) * S;                // 从右向左
  remake(13, {
    build(root) {
      const R = rng(1414);
      bigBg(root, '#efe3c6');
      const art = mk('g', {}, root);
      art.innerHTML = `<rect x="50" y="50" width="1820" height="980" fill="url(#s14sky)"/>
        <path d="M720,640L1060,330Q1110,300 1160,330L1500,640Z" fill="#5a7aa8" stroke="${IND}" stroke-width="3"/><path d="M990,394L1060,330Q1110,300 1160,330L1230,394L1196,410L1170,384L1144,420L1110,388L1084,416L1058,386L1030,410Z" fill="#fbf6ea" stroke="${IND}" stroke-width="2.5"/>
        <path d="M300,560Q700,520 1100,560T1860,550" stroke="#f4e0c8" stroke-width="22" opacity=".7" fill="none"/>
        <rect x="50" y="640" width="1820" height="120" fill="url(#s14sei)"/><path d="M50,640H1870" stroke="${IND}" stroke-width="3"/>
        ${[0, 1, 2].map(i => `<g transform="translate(${500 + i * 520},630)"><path d="M0,0L0,-50L30,-5Z" fill="#f4ecd8" stroke="${IND}" stroke-width="2"/><path d="M-26,0H34L26,10H-18Z" fill="#6a4a2a" stroke="${IND}" stroke-width="2"/></g>`).join('')}
        <path d="M50,${YR}H1870V1030H50Z" fill="#e2cfa0"/><path d="M50,${YR}H1870" stroke="${IND}" stroke-width="3"/>${Array.from({ length: 40 }, (_, i) => `<path d="M${70 + i * 46},${YR + 30 + (i % 3) * 40}h${24 + (i % 4) * 8}" stroke="#a88a5a" stroke-width="3"/>`).join('')}
        ${Array.from({ length: 6 }, (_, i) => { const x = 160 + i * 320; return `<path d="M${x},${YR}C${x + 10},${YR - 90} ${x - 20},${YR - 160} ${x + 30},${YR - 230}" stroke="#5a3a2a" stroke-width="12" fill="none"/>${[0, 1, 2].map(j => `<path d="M${x - 80 + j * 34},${YR - 190 - j * 34}Q${x + 10 + j * 18},${YR - 250 - j * 34} ${x + 110 + j * 8},${YR - 196 - j * 34}Q${x + 20},${YR - 182 - j * 34} ${x - 80 + j * 34},${YR - 190 - j * 34}Z" fill="#2f5a3a" stroke="${IND}" stroke-width="2.5"/>`).join('')}`; }).join('')}
        <g transform="translate(1500,${YR})"><rect x="-22" y="-170" width="44" height="170" fill="#c8a870" stroke="${IND}" stroke-width="3"/><text y="-140" text-anchor="middle" font-family="'Shippori Mincho B1'" font-weight="800" font-size="30" fill="${IND}" writing-mode="tb">十四里</text></g>`;
      // 套色的几块版：天、山、海、地——转场时一层层分开、立起来，成了纸雕的层次
      { const ch = Array.from(art.children); const L = [0, 1, 2, 3].map(i => mk('g', { class: 'ly' + i }, art)); ch.forEach((e, i) => L[i === 0 || i === 3 ? 0 : i <= 2 ? 1 : i <= 8 ? 2 : 3].appendChild(e)); this.lays = L; }
      def(`<filter id="n14lay" x="-5%" y="-10%" width="110%" height="130%"><feDropShadow dx="0" dy="-10" stdDeviation="5" flood-color="#1d2a4a" flood-opacity=".45"/></filter>`);
      // 巨浪（前景，在驿道上方卷起）
      this.wave = mk('g', {}, root);
      this.wave.innerHTML = `<path class="wb" fill="url(#s14wl)" stroke="${IND}" stroke-width="4"/><path class="wf" fill="#f4f0e4" stroke="${IND}" stroke-width="3"/><g class="cl">${Array.from({ length: 16 }, () => `<path d="M0,0C-6,10 -4,24 6,30C2,22 4,12 12,8C8,16 10,26 18,30C16,18 14,6 0,0Z" fill="#f4f0e4" stroke="${IND}" stroke-width="2.5"/>`).join('')}</g>`;
      this.wb = q(this.wave, '.wb'); this.wf = q(this.wave, '.wf'); this.claws = qa(this.wave, '.cl path');
      this.pg = mk('g', {}, root);
      this.pel = PELICANS.s14(); this.pg.appendChild(this.pel.g);
      // 前景：樱花枝、驿道近景的木纹
      add(root, `<g transform="translate(1900,40) scale(-1,1)"><path d="M0,60C160,90 300,60 460,120M200,74C260,140 330,150 380,210" stroke="#3a2a22" stroke-width="14" fill="none"/>${Array.from({ length: 16 }, (_, i) => { const x = 60 + i * 26, y = 70 + Math.sin(i) * 30 + (i > 8 ? 60 : 0); return `<g transform="translate(${x},${y})">${[0, 1, 2, 3, 4].map(j => `<ellipse cy="-7" rx="5" ry="8" fill="#f6c4cc" stroke="${IND}" stroke-width="1.2" transform="rotate(${j * 72})"/>`).join('')}<circle r="3" fill="#c83a4a"/></g>`; }).join('')}</g>
        <rect width="1920" height="1080" filter="url(#s14wood)" opacity=".5" style="mix-blend-mode:multiply"/>
        <path d="M0,0H1920V1080H0Z M50,50V1030H1870V50Z" fill="#efe3c6" fill-rule="evenodd"/><rect x="50" y="50" width="1820" height="980" fill="none" stroke="${IND}" stroke-width="5"/>`);
      // 出口：版画左侧的套框（题签式边框）
      this.frame = add(root, `<g><path d="M80,${YR + 30}V${YR - 460}H520V${YR + 30}H480V${YR - 420}H120V${YR + 30}Z" fill="#e2cfa0" stroke="${IND}" stroke-width="5"/><rect x="380" y="${YR - 410}" width="56" height="190" fill="#f2d870" stroke="${IND}" stroke-width="3"/><text x="408" y="${YR - 390}" text-anchor="middle" font-family="'Shippori Mincho B1'" font-weight="800" font-size="30" fill="${IND}" writing-mode="tb">次之景</text></g>`);
      // 题签与落款
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<rect x="0" y="0" width="110" height="420" fill="#f2d870" stroke="${IND}" stroke-width="4"/><text x="55" y="40" text-anchor="middle" font-family="'Shippori Mincho B1','Source Han Serif CN'" font-weight="800" font-size="76" fill="${IND}" writing-mode="tb" letter-spacing="10">浮世绘</text><rect x="130" y="0" width="64" height="300" fill="#e8d8b4" stroke="${IND}" stroke-width="3"/><text x="162" y="24" text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="600" font-size="34" fill="${IND}" writing-mode="tb" letter-spacing="8">UKIYO-E</text>`;
      add(root, `<g transform="translate(1790,960)"><rect x="-34" y="-34" width="68" height="68" fill="#c8322a"/><text y="14" text-anchor="middle" font-family="'Shippori Mincho B1'" font-weight="800" font-size="40" fill="#f4ecd8">鹕</text></g><text x="1740" y="1000" text-anchor="end" font-family="'Shippori Mincho B1'" font-weight="800" font-size="26" fill="${IND}" dy="-60" writing-mode="tb">鹈鹕斋画</text>`);
    },
    update(lt) {
      const d = D(lt), x = xAt(lt);
      ride(this.pel, d);
      at(this.pg, { transform: `translate(${f1(x)},${YR}) scale(${-S},${S})` });
      // 巨浪卷到最高、凝在半空；浪尖的爪在鹈鹕经过时一根根擦过它的头顶
      const rise = eo(inv(1.5, 2.55, lt)), fall = ei(inv(3.8, 4.35, lt)), h = 600 * rise * (1 - fall);
      vis(this.wave, h > 5);
      if (h > 5) {
        const top = 960 - h, cx = 880;
        this.wb.setAttribute('d', `M${cx + 700},1030C${cx + 520},${f1(1030 - h * .3)} ${cx + 300},${f1(top + h * .2)} ${cx + 120},${f1(top)}C${cx},${f1(top - 60)} ${cx - 220},${f1(top - 30)} ${cx - 290},${f1(top + 90)}C${cx - 160},${f1(top + 20)} ${cx - 40},${f1(top + 50)} ${cx - 60},${f1(top + 160)}C${cx - 120},${f1(1030 - h * .3)} ${cx - 360},1000 ${cx - 600},1030Z`);
        this.wf.setAttribute('d', `M${cx + 120},${f1(top)}C${cx},${f1(top - 60)} ${cx - 220},${f1(top - 30)} ${cx - 290},${f1(top + 90)}C${cx - 210},${f1(top + 25)} ${cx - 80},${f1(top - 10)} ${cx + 120},${f1(top)}Z`);
        this.claws.forEach((c, i) => { const t = i / 15, cxx = lerp(cx - 280, cx + 100, t), cy = top - 30 + t * t * 120 + Math.sin(t * PI) * -14; at(c, { transform: `translate(${f1(cxx)},${f1(cy + 40)}) rotate(${f1(220 - t * 70)}) scale(${f2(1.5 + Math.sin(t * PI) * .7)})` }); });
      }
      vis(this.frame, false);
      const lk = eio(inv(6.0, 6.5, lt));
      this.lays.forEach((g, i) => { at(g, { transform: lk > 0 ? `translate(0,${f1(-(3 - i) * 16 * lk)}) translate(960,${YR}) scale(1,${f2(1 - .03 * (3 - i) * lk)}) translate(-960,${-YR})` : 'translate(0,0)', filter: lk > .02 && i > 0 ? 'url(#n14lay)' : 'none' }); });
      op(this.title, ss(.15, .5, lt) * (1 - ss(1.6, 1.9, lt)));
      this.title.setAttribute('transform', 'translate(1640,90)');
    },
    portal(lt) { return { d: rectD(120, YR - 420, 360, 450), box: [120, YR - 420, 480, YR + 30], zmax: 8 }; },
    exitFx: OLDSCENES[13].exitFx
  });
})();

/* ---------------- No.15 剪纸艺术：打开的多层纸雕盒；镜头缓慢横移，鹈鹕在两层纸之间骑行 ---------------- */
(function () {
  const W = '#fbf8f0';
  const D = makeDist(CRUISE);
  const S = 0.5, YG = 800;
  // 先向左骑（接上一版的方向），高光时吓了一跳、掉头，之后向右骑
  const dirAt = lt => lerp(-1, 1, ss(2.25, 2.55, lt));
  const DX = makeDist(lt => SPEED * S * dirAt(lt));
  const xAt = lt => 1180 + DX(lt);
  const panX = lt => -30 * (lt + 2.1);
  remake(14, {
    build(root) {
      const R = rng(1515);
      bigBg(root, '#2a2420');
      // 纸雕盒：外框 + 透视的内侧壁
      add(root, `<path d="M90,70H1830L1700,170H220Z" fill="#d8cdb8"/><path d="M90,1010H1830L1700,930H220Z" fill="#a89a84"/><path d="M90,70L220,170V930L90,1010Z" fill="#c4b8a0"/><path d="M1830,70L1700,170V930L1830,1010Z" fill="#b8ac94"/>`);
      this.box = mk('g', {}, root);
      def(`<clipPath id="n15in"><rect x="220" y="170" width="1480" height="760"/></clipPath>`);
      this.box.setAttribute('clip-path', 'url(#n15in)');
      add(this.box, `<rect x="0" y="0" width="1920" height="1080" fill="url(#s15bg)"/><circle cx="1420" cy="330" r="200" fill="url(#s15moon)"/><circle cx="1420" cy="330" r="100" fill="#fff2c8"/><circle cx="1395" cy="300" r="12" fill="#efe0b0"/><circle cx="1450" cy="360" r="16" fill="#efe0b0"/>`);
      const cols = ['#1d4048', '#2a5a5e', '#3a7470', '#4e8c7e', '#6aa88e'];
      const tree = (x, y, h, w) => `M${x - w * .08},${y}L${x - w * .08},${y - h * .25}L${x - w * .5},${y - h * .25}L${x - w * .2},${y - h * .45}L${x - w * .4},${y - h * .45}L${x - w * .12},${y - h * .7}L${x - w * .28},${y - h * .7}L${x},${y - h}L${x + w * .28},${y - h * .7}L${x + w * .12},${y - h * .7}L${x + w * .4},${y - h * .45}L${x + w * .2},${y - h * .45}L${x + w * .5},${y - h * .25}L${x + w * .08},${y - h * .25}L${x + w * .08},${y}Z`;
      this.layers = [];
      const mkLayer = (l, extra) => {
        const R2 = rng(150 + l), y0 = 600 + l * 70;
        let d = `M-200,1100V${y0}`; for (let x = -200; x <= 2200; x += 100) d += `Q${x + 50},${f1(y0 - 30 - R2() * 40)} ${x + 100},${y0}`; d += 'L2200,1100Z';
        let s = `<path d="${d}" fill="${cols[l]}"/>`;
        for (let i = 0; i < 11; i++) { const x = -150 + i * 230 + R2() * 100, h = 200 + R2() * 180 - l * 15, w = 120 + R2() * 60; s += `<path d="${tree(x, y0 + 10, h, w)}" fill="${cols[l]}"/>`; }
        s += extra || '';
        // 纸层之间的投影：一层深色的错位副本，不用模糊，纸感更硬朗
        const g = add(this.box, `<g><g transform="translate(0,-9)" opacity=".45">${s.replace(/fill="[^"]*"/g, 'fill="#06141c"')}</g>${s}</g>`);
        this.layers.push({ g, p: .25 + l * .2 });
      };
      mkLayer(0); mkLayer(1);
      mkLayer(2, `<g transform="translate(1180,740)"><path d="M-90,0V-110H90V0Z" fill="#3a7470"/><path d="M-110,-110L0,-200L110,-110Z" fill="#3a7470"/><rect x="-40" y="-90" width="34" height="34" fill="#ffd88a"/><rect x="10" y="-90" width="34" height="34" fill="#ffd88a"/></g>`);
      // 鹈鹕骑行的纸层（地面）
      this.road = add(this.box, `<g><path d="M-200,1100V${YG}H2200V1100Z" fill="#7ab494"/><path d="M-200,${YG}${Array.from({ length: 60 }, (_, i) => `L${-200 + i * 40 + 20},${YG - 10}L${-200 + i * 40 + 40},${YG}`).join('')}" fill="none" stroke="#9ccaa8" stroke-width="3"/><g transform="translate(560,${YG})"><path d="M-6,0V-120H6V0Z" fill="${W}"/><path d="M-70,-200H70V-120H-70Z" fill="${W}"/><text y="-148" text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="700" font-size="40" fill="#2a5a5e">No.15</text></g></g>`);
      this.pg = mk('g', {}, this.box);
      this.pel = PELICANS.s15(); this.pg.appendChild(this.pel.g);
      // 出口：纸雕的树洞（在鹈鹕所在的纸层上）
      this.hol = add(this.box, `<g transform="translate(1450,${YG + 20})"><path d="M-300,20C-270,-160 -290,-380 -220,-540H220C290,-380 270,-160 300,20Z M0,-420A210,210 0 1 0 0.1,-420Z" fill="#3a2a22" fill-rule="evenodd"/><path d="M-220,-540C-380,-570 -400,-680 -300,-710C-150,-760 150,-760 300,-710C400,-680 380,-570 220,-540Z" fill="#2a5a5e"/></g>`);
      // 前面一层纸（蘑菇和草），挡住鹈鹕的车轮下半
      let fr = `<path d="M-200,1100V${YG + 50}${Array.from({ length: 50 }, (_, i) => `Q${-200 + i * 50 + 25},${YG + 10 + (i % 3) * 8} ${-200 + i * 50 + 50},${YG + 50}`).join('')}V1100Z" fill="#8fc8a2"/>`;
      for (let i = 0; i < 10; i++) { const x = -100 + i * 240 + R() * 80, s = .7 + R() * .5; fr += `<g transform="translate(${f1(x)},${YG + 70}) scale(${f2(s)})"><path d="M-14,0V-50H14V0Z" fill="#f4ecd8"/><path d="M-60,-46Q0,-120 60,-46Z" fill="#d84a3a"/>${[[-30, -60], [0, -80], [28, -62]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="8" fill="#fbf4e4"/>`).join('')}</g>`; }
      this.front = add(this.box, `<g><g transform="translate(0,-10)" opacity=".45">${fr.replace(/fill="[^"]*"/g, 'fill="#06141c"')}</g>${fr}</g>`);
      // 风
      this.wind = mk('g', {}, this.box);
      this.wind.innerHTML = Array.from({ length: 9 }, () => `<path class="wl" d="M0,0C80,-30 160,30 240,0C280,-14 300,-40 280,-60" fill="none" stroke="#e8f4ee" stroke-width="5" stroke-linecap="round" opacity="0"/>`).join('');
      this.wl = qa(this.wind, '.wl');
      this.ex = mk('g', {}, this.box); this.ex.innerHTML = `<text text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="700" font-size="80" fill="${W}">!?</text>`;
      add(root, `<rect x="90" y="70" width="1740" height="940" fill="none" stroke="#efe6d4" stroke-width="10"/><path d="M90,70L220,170M1830,70L1700,170M90,1010L220,930M1830,1010L1700,930" stroke="#efe6d4" stroke-width="4"/><rect x="220" y="170" width="1480" height="760" fill="none" stroke="#1a1410" stroke-width="4" opacity=".4"/>`);
      this.title = mk('g', { filter: 'url(#s15sh)' }, root);
      this.title.innerHTML = `<path d="M0,0H620V200H0Z" fill="#d84a3a"/><path d="M14,14H606V186H14Z" fill="none" stroke="#f4ecd8" stroke-width="3" stroke-dasharray="10 6"/><text x="310" y="112" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="900" font-size="86" letter-spacing="14" fill="#fbf4e4">剪纸艺术</text><text x="310" y="166" text-anchor="middle" font-family="'Cormorant Garamond'" font-weight="700" font-size="34" letter-spacing="16" fill="#fbf4e4">PAPER CUT</text>`;
    },
    update(lt) {
      const d = D(lt), x = xAt(lt), pan = panX(Math.min(lt, 6));
      this.layers.forEach(l => l.g.setAttribute('transform', `translate(${f1(pan * l.p)},0)`));
      const f1k = eio(inv(2.25, 2.55, lt)), ang = PI * f1k, flip = -Math.cos(ang);
      this.pel.update(d / DPR, d, { flip });
      at(this.pg, { transform: `translate(${f1(x + pan)},${f1(YG - 30 * Math.sin(ang))}) translate(${f1(20 * S)},${f1(-180 * S)}) scale(${f2((Math.abs(flip) < .04 ? .04 * Math.sign(flip || 1) : flip) * S)},${S}) translate(-20,180)` });
      this.road.setAttribute('transform', `translate(${f1(pan)},0)`); this.hol.setAttribute('transform', `translate(${f1(1450 + pan)},${YG + 20})`);
      this.front.setAttribute('transform', `translate(${f1(pan * 1.25)},0)`);
      const wk = ss(2.05, 2.25, lt) * (1 - ss(3.0, 3.3, lt));
      this.wl.forEach((w, i) => { const k = fr(lt * 1.3 + i / 9); at(w, { transform: `translate(${f1(1900 - k * 2400)},${f1(300 + i * 50)}) scale(${f2(1 + i % 3 * .3)})`, opacity: f2(wk * Math.sin(k * PI)) }); });
      const ek = ss(2.55, 2.65, lt) * (1 - ss(3.05, 3.15, lt));
      at(this.ex, { transform: `translate(${f1(x + pan + 20)},${f1(YG - 240)}) scale(${f2(eob(clamp(ek * 1.5)))})`, opacity: f2(ek) });
      vis(this.hol, false);
      const ti = eob(inv(.15, .45, lt)), to = inv(1.7, 2.0, lt);
      at(this.title, { transform: `translate(300,${f1(210 - to * 400)})`, opacity: f2(clamp(ti) * (1 - to)) });
    },
    portal(lt) { const x = 1450 + panX(Math.min(lt, 6)), cy = YG + 20 - 210; return { d: circD(x, cy, 210), box: [x - 210, cy - 210, x + 210, cy + 210], zmax: 8 }; },
    exitFx: OLDSCENES[14].exitFx
  });
})();

/* ---------------- No.16 印象派：画架上的一幅油画；先看到画布边缘，再推进画中；鹈鹕由近及远骑向拱桥 ---------------- */
(function () {
  // 画中小路：从左下（近）斜向右上（远）；深度带来的缩放
  const PTH = polyPath([[180, 1020], [620, 860], [1000, 720], [1230, 640], [1330, 600], [1610, 600], [1720, 560]]);
  const scAt = s => lerp(1.0, .34, clamp(s / 1150) ** .8);
  // 屏幕速度 = 巡航速度 × 当前缩放（越远越慢），踏频不变
  const D = makeDist(CRUISE);
  const sTab = (() => { const o = []; let s = 330; for (let i = 0; i <= 1000; i++) { o.push(s); s += SPEED * .01 * scAt(s); } return o; })();   // 每 0.01s 的弧长
  const sAt = lt => { const t = clamp(lt + 2.1, 0, 9.99) * 100, i = Math.floor(t); return sTab[i] + (sTab[i + 1] - sTab[i]) * (t - i); };
  const B0 = 1330, B1 = 1610;
  const camK = lt => eio(inv(.7, 2.3, lt));                 // 先看到画架上的画布边缘，再推进画中
  remake(15, {
    build(root) {
      const R = rng(1616);
      bigBg(root, '#a8c8a0');
      // 画室外的花园（画架所在处），也用短笔触
      add(root, `<rect width="1920" height="1080" fill="url(#s16Psky)"/><rect y="700" width="1920" height="380" fill="url(#s16Pbush)"/>`);
      this.easel = add(root, `<g><path d="M760,1080L900,180M1160,1080L1020,180M960,1080V300" stroke="#7a5a3a" stroke-width="22" stroke-linecap="round"/><rect x="700" y="760" width="520" height="22" fill="#6a4a2a"/></g>`);
      this.paint = mk('g', {}, root);
      let p = `<rect width="1920" height="1080" fill="url(#s16Psky)"/>`;
      for (let i = 0; i < 6; i++) { const cx = -60 + i * 380 + R() * 80, cy = 300 + R() * 80, r = 170 + R() * 60; p += `<path d="M${cx},${cy + r * .6}V700" stroke="#5a4a3a" stroke-width="20" stroke-linecap="round"/>`; for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; p += `<circle cx="${f1(cx + Math.cos(a) * r * .45 * (k ? 1 : 0))}" cy="${f1(cy + Math.sin(a) * r * .36 * (k ? 1 : 0))}" r="${f1(r * (k ? .55 : .7))}" fill="url(#s16Pleaf)"/>`; } }
      p += `<path d="M0,640Q600,600 1920,560V1080H0Z" fill="url(#s16Pbush)"/>`;
      // 河与睡莲池（右下），倒影就画在这里
      p += `<path d="M1920,560C1500,600 1300,650 1100,760C900,860 980,980 1200,1080H1920Z" fill="url(#s16Pwater)"/>`;
      for (let i = 0; i < 22; i++) { const x = 1150 + R() * 760, y = 700 + R() * 360; p += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(22 + R() * 18)}" ry="${f1(7 + R() * 3)}" fill="#5a8a4a" opacity=".9"/>${R() < .5 ? `<circle cx="${f1(x + 6)}" cy="${f1(y - 3)}" r="6" fill="${R() < .5 ? '#f6c8d8' : '#fff8f0'}"/>` : ''}`; }
      // 河岸小路（斜向深处）
      const pts = [[180, 1020], [620, 860], [1000, 720], [1230, 640], [1330, 600]];
      p += `<path d="${smooth(pts)}" fill="none" stroke="#d8c098" stroke-width="70" stroke-linecap="round" opacity=".95"/><path d="${smooth(pts)}" fill="none" stroke="url(#s16Proad)" stroke-width="54" stroke-linecap="round"/>`;
      // 日式拱桥
      let bd = ''; for (let i = 0; i <= 30; i++) { const t = i / 30, x = lerp(B0, B1, t), y = 600 - Math.sin(t * PI) * 70; bd += `M${f1(x)},${f1(y)}l11,-2`; }
      p += `<path d="${bd}" stroke="#3a7a6a" stroke-width="16" stroke-linecap="round"/><path d="M${B0},550Q${(B0 + B1) / 2},${600 - 190} ${B1},550" stroke="#4a8a6a" stroke-width="8" fill="none" stroke-linecap="round"/>${Array.from({ length: 8 }, (_, i) => { const t = (i + 1) / 9, x = lerp(B0, B1, t), y = 600 - Math.sin(t * PI) * 70; return `<path d="M${f1(x)},${f1(y)}v-40" stroke="#4a8a6a" stroke-width="7" stroke-linecap="round"/>`; }).join('')}`;
      p += `<g transform="translate(360,980) scale(.8)"><path d="M0,0V-110" stroke="#7a6a5a" stroke-width="8"/><rect x="-74" y="-190" width="148" height="80" rx="10" fill="#f4ecd8" stroke="#8a7a6a" stroke-width="4"/><text y="-140" text-anchor="middle" font-family="'Great Vibes'" font-size="44" fill="#4a6a8a">No.16</text></g>`;
      this.paint.innerHTML = p;
      this.refl = mk('g', { filter: 'url(#s16rip)', opacity: .7 }, this.paint);
      this.rpel = PELICANS.s16(); this.rpel.g.removeAttribute('filter'); this.refl.appendChild(this.rpel.g);
      this.pg = mk('g', {}, this.paint);
      this.pel = PELICANS.s16(); this.pg.appendChild(this.pel.g);
      this.dap = mk('g', {}, this.paint);
      this.dap.innerHTML = Array.from({ length: 12 }, () => `<ellipse rx="70" ry="40" fill="url(#s16sun)"/>`).join(''); this.dp = qa(this.dap, 'ellipse'); this.dpr = this.dp.map(() => [R(), R(), R()]);
      // 出口：镀金画框（立在桥那头的小路上）
      const FP = PTH(sAt(6)); this.fp = FP; this.frame = add(this.paint, `<g transform="translate(${f1(FP[0])},${f1(FP[1])}) scale(.34)"><path d="M-380,60V-660H380V60Z M-300,30V-590H300V30Z" fill="url(#n16gold)" fill-rule="evenodd" stroke="#6a4a1a" stroke-width="6"/><path d="M-314,30V-600H314V30" fill="none" stroke="#6a4a1a" stroke-width="7"/>${[[-380, -660], [380, -660], [-380, 60], [380, 60]].map(q2 => `<circle cx="${q2[0]}" cy="${q2[1]}" r="40" fill="url(#n16gold)" stroke="#6a4a1a" stroke-width="4"/>`).join('')}</g>`);
      def(`<linearGradient id="n16gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".4" stop-color="#d8a83a"/><stop offset=".7" stop-color="#a8782a"/><stop offset="1" stop-color="#f0d070"/></linearGradient>`);
      // 画布的边（推进前看得见）
      this.edge = add(this.paint, `<g><rect x="-30" y="-30" width="1980" height="1140" fill="none" stroke="#f4ecd8" stroke-width="60"/><rect x="0" y="0" width="1920" height="1080" fill="none" stroke="#8a7a5a" stroke-width="6"/></g>`);
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<text font-family="'LXGW WenKai GB','Source Han Serif CN'" font-size="96" fill="#3a4a7a">印象派</text><text x="10" y="80" font-family="'Great Vibes'" font-size="72" fill="#c85a7a">Impressionism</text>`;
    },
    camT(lt) { const k = camK(lt); const s = lerp(.36, 1, k), z2 = 1 + .9 * eio(ss(2.0, 2.6, lt) * (1 - ss(3.9, 4.4, lt))); return zoomT(z2, 1470, 600) + ` translate(${f1(lerp(960 - 960 * .36, 0, k))},${f1(lerp(250, 0, k))}) scale(${f2(s)})`; },
    bridgeY(x) { return x < B0 || x > B1 ? 0 : -Math.sin((x - B0) / (B1 - B0) * PI) * 70; },
    update(lt) {
      const d = D(lt), s = sAt(lt), p = PTH(s), sc = scAt(Math.min(s, 1150));
      // 第 3 小节：镜头慢慢推向桥那头的鹈鹕，把它带到画面中央
      const k3 = eio(inv(4.4, 6.0, lt)), py0 = p[1] + this.bridgeY(p[0]);
      this.paint.setAttribute('transform', (k3 > 0 ? `translate(${f1((960 - p[0]) * k3)},${f1((600 - py0) * k3)}) ` + zoomT(1 + .45 * k3, p[0], py0) + ' ' : '') + this.camT(lt));
      op(this.edge, 1 - camK(lt)); op(this.easel, 1 - camK(lt));
      ride(this.pel, d);
      const by = this.bridgeY(p[0]);
      at(this.pg, { transform: `translate(${f1(p[0])},${f1(p[1] + by)}) rotate(${f1(p[2] * 180 / PI * .5)}) scale(${f2(sc)})` });
      // 倒影慢了半拍，鹈鹕已经上了桥，倒影还在犹豫
      const lag = .25 + .45 * ss(2.4, 2.9, lt) * (1 - ss(3.5, 4.1, lt)), lt2 = lt - lag, s2 = sAt(lt2), p2 = PTH(s2), by2 = this.bridgeY(p2[0]);
      this.rpel.update(D(lt2) / DPR, D(lt2), {});
      const wl = 640, onWater = p2[0] > B0 - 60;
      at(this.refl, { opacity: onWater ? .7 : 0, transform: `translate(${f1(p2[0] + Math.sin(lt * 7) * 5 * ss(2.6, 2.9, lt) * (1 - ss(3.3, 3.6, lt)))},${f1(wl + (wl - (p2[1] + by2)) * .6)}) scale(${f2(sc)},${f2(-sc * .6)})` });
      this.dp.forEach((e, i) => { const q2 = this.dpr[i]; at(e, { cx: f1(q2[0] * 1920), cy: f1(560 + q2[1] * 480), opacity: f2(.3 + .35 * Math.sin(lt * 2 + q2[2] * 9)), rx: f1(50 + q2[2] * 60) }); });
      vis(this.frame, false);
      at(this.title, { transform: 'translate(150,190)', opacity: f2(ss(.3, .8, lt) * (1 - ss(1.8, 2.1, lt))) });
    },
    portal(lt) { const m = (x, y) => { const k = camK(lt), s = lerp(.36, 1, k); return [lerp(960 - 960 * .36, 0, k) + x * s, lerp(250, 0, k) + y * s]; }; const F = this.fp, a = m(F[0] - 300 * .34, F[1] - 590 * .34), b = m(F[0] + 300 * .34, F[1] + 30 * .34); return { d: rectD(a[0], a[1], b[0] - a[0], b[1] - a[1]), box: [a[0], a[1], b[0], b[1]], zmax: 18 }; },
    exitFx: OLDSCENES[15].exitFx
  });
})();
