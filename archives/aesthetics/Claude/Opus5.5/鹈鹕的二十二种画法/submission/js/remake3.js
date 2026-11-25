'use strict';
/* ---------------- No.05 Galgame：恋爱游戏对话界面；背景图缓缓横移，鹈鹕是一侧的立绘 ---------------- */
(function () {
  const PK = '#ff8fb4', TX = '#5a3a4a';
  const D = makeDist(CRUISE);
  const PAN = lt => 120 + 95 * (lt + 2.1);                     // 背景图横移
  const GATEX = 2080;
  const camZ = lt => 1 + .32 * eio(inv(4.4, 6, lt));
  const TXT0 = '（今天的风里，好像有樱花的味道。）', TXT1 = '……那个，一起回家吗？';
  remake(4, {
    build(root) {
      const R = rng(5505);
      this.cg = mk('g', {}, root);
      const bl = (x, y, r) => { let s = ''; for (let i = 0; i < 14; i++) { const a = R() * TAU, d = R() * r; s += `<circle cx="${f1(x + Math.cos(a) * d)}" cy="${f1(y + Math.sin(a) * d * .7)}" r="${f1(r * (.35 + R() * .3))}" fill="${['#ffc6d8', '#ffb3cb', '#ffd9e6', '#ff9fbd'][i % 4]}"/>`; } return s + `<circle cx="${x - r * .3}" cy="${y - r * .3}" r="${r * .35}" fill="#fff0f6" opacity=".7"/>`; };
      // 一整张横长的背景 CG（坡道、樱花、校门）
      let cg = `<rect x="-200" y="-100" width="3800" height="1300" fill="url(#s05sky)"/>`;
      for (let i = 0; i < 6; i++) cg += `<ellipse cx="${f1(R() * 3400)}" cy="${f1(90 + R() * 200)}" rx="${f1(170 + R() * 140)}" ry="${f1(30 + R() * 20)}" fill="#fff" opacity=".75"/>`;
      for (let i = 0; i < 40; i++) { const x = -100 + i * 95, h = 40 + R() * 90; cg += `<path d="M${x},640V${f1(640 - h)}L${x + 40},${f1(610 - h)}L${x + 80},${f1(640 - h)}V640Z" fill="${R() < .5 ? '#d9c8e8' : '#e8d8ee'}"/>`; }
      cg += `<path d="M-200,880L900,880L2000,620L3600,620V1300H-200Z" fill="#ecdcde"/><path d="M-200,892L920,892L2010,632L3600,632" stroke="#cdb4b8" stroke-width="4" fill="none"/>`;
      for (let i = 0; i < 26; i++) { const x = -100 + i * 140, y = x < 900 ? 880 : x < 2000 ? 880 - (x - 900) * .236 : 620; cg += `<path d="M${x},${f1(y)}v-${90 + (i % 3) * 20}" stroke="#7a5a5a" stroke-width="${12 - (i % 3) * 2}"/>` + bl(x, y - 150, 90 - (i % 3) * 10); }
      cg += `<g transform="translate(${GATEX},620)"><rect x="-360" y="-520" width="90" height="520" fill="#ece4dc" stroke="#a89890" stroke-width="3"/><rect x="270" y="-520" width="90" height="520" fill="#ece4dc" stroke="#a89890" stroke-width="3"/><rect x="-372" y="-540" width="114" height="26" fill="#d8ccc4"/><rect x="258" y="-540" width="114" height="26" fill="#d8ccc4"/><path d="M-270,-470H270" stroke="#7a6a6a" stroke-width="7"/><rect x="-140" y="-600" width="280" height="62" fill="#f8f2ea" stroke="#a89890" stroke-width="3"/><text y="-556" text-anchor="middle" font-family="'Source Han Serif CN'" font-weight="700" font-size="36" fill="${TX}">樱丘学园</text></g>`;
      cg += `<g transform="translate(860,880)"><path d="M0,0V-140" stroke="#a89098" stroke-width="6"/><rect x="-70" y="-210" width="140" height="74" rx="10" fill="#fff" stroke="${PK}" stroke-width="3"/><text y="-164" text-anchor="middle" font-family="'Great Vibes'" font-size="40" fill="${PK}">No.05</text></g>`;
      this.cg.innerHTML = `<g filter="url(#s05soft)">${cg}</g>`;
      add(root, `<rect width="1920" height="1080" fill="url(#s05sun)" style="mix-blend-mode:screen"/>`);
      // 立绘：鹈鹕站在画面一侧，随骑行轻轻起伏
      this.spr = mk('g', {}, root);
      this.spr.innerHTML = `<ellipse cx="0" cy="-260" rx="330" ry="330" fill="#fff" opacity=".25" filter="url(#s05blur8)"/>`;
      this.pel = PELICANS.s05(); this.spr.appendChild(this.pel.g);
      // 前景虚化的樱花枝与花瓣（按真实骑行速度掠过）
      let fg = ''; for (let i = 0; i < 6; i++) { const x = i * 900 + 200; fg += `<path d="M${x - 300},-40C${x - 100},40 ${x + 100},60 ${x + 300},20" stroke="#5a3838" stroke-width="22" fill="none"/>` + bl(x - 120, 40, 120) + bl(x + 160, 60, 110); }
      this.fg = add(root, `<g filter="url(#s05blur8)" opacity=".9">${fg}</g>`);
      this.pet = mk('g', {}, root); this.pp = [];
      for (let i = 0; i < 36; i++) { add(this.pet, `<path d="M0,-8C6,-8 9,-2 6,4C4,7 0,9 0,6C0,9 -4,7 -6,4C-9,-2 -6,-8 0,-8Z" fill="${['#ffc6d8', '#ffb3cb', '#ffe0ea'][i % 3]}"/>`); this.pp.push([R(), R(), R(), R()]); }
      this.pe = qa(this.pet, 'path');
      // 对话框与名牌（界面层）
      const hud = hudOf(root);
      this.box = mk('g', {}, hud);
      this.box.innerHTML = `<g filter="url(#s05sh)"><rect x="150" y="826" width="1620" height="226" rx="24" fill="url(#s05box)" stroke="${PK}" stroke-width="3"/><rect x="162" y="838" width="1596" height="202" rx="18" fill="none" stroke="#ffd0e0" stroke-width="1.5"/></g>
        <g><rect x="190" y="790" width="230" height="58" rx="29" fill="${PK}"/><text class="npt" x="305" y="830" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="30" fill="#fff">鹈鹕</text></g>
        <text class="ln" x="230" y="920" font-family="'HarmonyOS Sans SC'" font-weight="500" font-size="44" fill="${TX}"></text><path class="tri" d="M0,0h20l-10,12Z" fill="${PK}"/>
        <text x="1730" y="1030" text-anchor="end" font-family="Montserrat" font-weight="600" font-size="16" letter-spacing="3" fill="#c07090">AUTO · SKIP · LOG · SAVE · LOAD</text>`;
      this.ln = q(this.box, '.ln'); this.npt = q(this.box, '.npt'); this.tri = q(this.box, '.tri');
      this.ch = mk('g', {}, hud);
      this.ch.innerHTML = ['好啊', '我骑车'].map((t, i) => `<g class="cb"><rect x="-300" y="-44" width="600" height="88" rx="44" fill="#fff" fill-opacity=".88" stroke="${PK}" stroke-width="3"/><rect class="hv" x="-300" y="-44" width="600" height="88" rx="44" fill="${PK}" opacity="0"/><text class="ct" y="14" text-anchor="middle" font-family="'HarmonyOS Sans SC'" font-weight="700" font-size="40" fill="${TX}">${t}</text></g>`).join('') + `<g class="cur"><path d="M0,0L0,34L9,26L16,42L23,39L16,23L28,23Z" fill="#fff" stroke="${TX}" stroke-width="2.5" stroke-linejoin="round"/></g><circle class="rip" r="10" fill="none" stroke="${PK}" stroke-width="4" opacity="0"/>`;
      this.cb = qa(this.ch, '.cb'); this.cur = q(this.ch, '.cur'); this.rip = q(this.ch, '.rip');
      this.title = mk('g', { filter: 'url(#s05sh)' }, hud);
      this.title.innerHTML = `<rect width="600" height="180" rx="22" fill="#fff" fill-opacity=".8" stroke="${PK}" stroke-width="2.5"/><text x="40" y="96" font-family="'Source Han Serif CN'" font-weight="600" font-size="60" fill="${TX}">Galgame 美术风</text><text x="44" y="150" font-family="'Great Vibes'" font-size="46" fill="${PK}">Galgame Art</text>`;
    },
    update(lt) {
      const d = D(lt), pan = PAN(Math.min(lt, 6)), z = camZ(lt);
      const gx = GATEX - pan, gy = 620;
      this.cg.setAttribute('transform', zoomT(z, gx, gy - 260) + ` translate(${f1(-pan)},0)`);
      this.fg.setAttribute('transform', `translate(${f1(-((d * .9) % 900) - 300)},0)`);
      ride(this.pel, d);
      const bob = Math.sin(TAU * d / DPR * 2) * 5;
      at(this.spr, { transform: `translate(560,${f1(1090 + bob)}) scale(1.5)` });
      this.pe.forEach((e, i) => { const p = this.pp[i], k = fr(lt * (.12 + p[0] * .1) + p[1]); at(e, { transform: `translate(${f1(p[2] * 2200 - k * 500)},${f1(-30 + k * 1150)}) rotate(${f1(lt * 80 * (p[3] - .5) * 2 + p[1] * 360)}) scale(${f2(1 + p[3] * 1.4)})` }); });
      const ti = eo(inv(.15, .5, lt)), to = inv(1.8, 2.1, lt);
      at(this.title, { transform: `translate(1200,${f1(100 - (1 - ti) * 20)})`, opacity: f2(ti * (1 - to)) });
      at(this.box, { transform: `translate(0,${f1((1 - eo(inv(.2, .62, lt))) * 300)})` });
      vis(this.box, lt < 6);                       // 转场时对话框交给特效层：鼓起、变圆、像气泡一样弹开
      let str = '', name = '鹈鹕', tl = 0;
      if (lt < 1.95) { str = typed(TXT0, lt - .35, 14); tl = Array.from(TXT0).length; } else if (lt < 4.05) { name = '？？？'; str = typed(TXT1, lt - 2.0, 13); tl = Array.from(TXT1).length; } else str = typed('（——那就骑车，一起回家吧。）', lt - 4.1, 18);
      this.ln.textContent = str; this.npt.textContent = name;
      let wd = 0; try { wd = this.ln.getComputedTextLength(); } catch (e) { }
      at(this.tri, { transform: `translate(${f1(240 + wd)},${f1(902 + Math.sin(lt * 10) * 4)})`, opacity: Array.from(str).length >= tl && tl > 0 ? 1 : 0 });
      vis(this.ch, lt > 2.95 && lt < 4.0);
      const cout = inv(3.75, 4.0, lt);
      this.cb.forEach((g, i) => { const k = eob(inv(2.95 + i * .08, 3.2 + i * .08, lt)); at(g, { transform: `translate(${f1(1180 + (1 - k) * (i ? 300 : -300))},${280 + i * 120})`, opacity: f2(clamp(k) * (1 - cout * (i === 1 ? .2 : 1))) }); const on = i === 0 ? (lt > 3.2 && lt < 3.4) : lt > 3.45; op(q(g, '.hv'), on ? (i === 1 && lt > 3.6 ? .9 : .35) : 0); q(g, '.ct').setAttribute('fill', on && i === 1 && lt > 3.6 ? '#fff' : TX); });
      const m1 = eio(inv(3.0, 3.22, lt)), m2 = eio(inv(3.32, 3.5, lt));
      const cx = lerp(lerp(1700, 1380, m1), 1420, m2), cy = lerp(lerp(560, 290, m1), 410, m2);
      at(this.cur, { transform: `translate(${f1(cx)},${f1(cy)})` });
      const rp = inv(3.6, 3.85, lt); at(this.rip, { cx: f1(cx), cy: f1(cy), r: f1(10 + rp * 60), opacity: rp > 0 && rp < 1 ? f2(1 - rp) : 0 });
    },
    portal(lt) {
      const pan = PAN(6), gx = GATEX - pan, gy = 620, z = camZ(lt), cx = gx, cy = gy - 260;
      const mp = (x, y) => [cx + (x - cx) * z, cy + (y - cy) * z];
      const a = mp(gx - 270, gy - 470), b = mp(gx + 270, gy);
      return { d: rectD(a[0], a[1], b[0] - a[0], b[1] - a[1]), box: [a[0], a[1], b[0], b[1]], zmax: 6 };
    },
    exitFx: OLDSCENES[4].exitFx
  });
})();

/* ---------------- No.06 萌系 Q 版：等轴测的小镇地图，鹈鹕沿弯曲小路骑行，镜头跟随平移 ---------------- */
(function () {
  const LN = '#7a4a5a';
  const D = makeDist(CRUISE);
  const K = 0.62;                                          // 等轴测缩放
  const iso = (u, v, h) => [(u - v) * .866 * K, (u + v) * .5 * K - (h || 0) * K];
  // 小路（世界 u,v）：在糖果小镇里拐来拐去
  const PATH = [[-600, 900], [0, 900], [300, 700], [700, 700], [900, 400], [1300, 400], [1500, 100], [1900, 100], [2100, -200], [2600, -200]];
  let PL = null;
  function pathAt(s) {
    if (!PL) { PL = [0]; for (let i = 1; i < PATH.length; i++) PL.push(PL[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1])); }
    let i = 1; while (i < PL.length - 1 && PL[i] < s) i++;
    const k = clamp((s - PL[i - 1]) / (PL[i] - PL[i - 1]), -2, 3), a = PATH[i - 1], b = PATH[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, b[0] - a[0], b[1] - a[1]];
  }
  const S0 = 900;                                           // lt=0 时在路上的位置
  remake(5, {
    build(root) {
      const R = rng(6606);
      add(root, `<rect width="1920" height="1080" fill="#ffeef7"/>`);
      this.world = mk('g', {}, root);
      let w = '';
      // 地面格子
      for (let u = -1200; u < 3200; u += 200) for (let v = -1200; v < 2000; v += 200) { const a = iso(u, v), b = iso(u + 200, v), c = iso(u + 200, v + 200), d = iso(u, v + 200); w += `<path d="${P([a, b, c, d], true)}" fill="${((u + v) / 200) % 2 ? '#c9f2de' : '#d8f7e8'}"/>`; }
      // 小路
      const pw = 70;
      for (let i = 1; i < PATH.length; i++) { const a = PATH[i - 1], b = PATH[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = -dy / L * pw, ny = dx / L * pw; const q4 = [iso(a[0] + nx, a[1] + ny), iso(b[0] + nx, b[1] + ny), iso(b[0] - nx, b[1] - ny), iso(a[0] - nx, a[1] - ny)]; w += `<path d="${P(q4, true)}" fill="#ffc9dc"/>`; }
      PATH.forEach(p => { const c = iso(p[0], p[1]); w += `<ellipse cx="${f1(c[0])}" cy="${f1(c[1])}" rx="${f1(pw * .866 * K * 1.15)}" ry="${f1(pw * .5 * K * 1.15)}" fill="#ffc9dc"/>`; });
      for (let i = 0; i < 160; i++) { const s = R() * 3600; pathAt(0); const p = pathAt(s), off = (R() - .5) * 90, L = Math.hypot(p[2], p[3]) || 1; const c = iso(p[0] - p[3] / L * off, p[1] + p[2] / L * off); w += `<rect x="${f1(c[0])}" y="${f1(c[1])}" width="8" height="3" rx="1.5" fill="${['#ff5a7a', '#5fd0a8', '#ffb83a', '#6ab8ff', '#fff'][i % 5]}" transform="rotate(${f1(R() * 180)},${f1(c[0])},${f1(c[1])})"/>`; }
      // 圆滚滚的房子（等轴测方块 + 圆顶）
      const cols = [['#ffd0e2', '#ff8ab8'], ['#d8f6e8', '#5fd0a8'], ['#fff4b8', '#ffb83a'], ['#e8dcff', '#a888f0'], ['#d8eeff', '#6ab8ff']];
      const house = (u, v, s, c, shop) => {
        const hw = 120 * s, hh = 150 * s, a = iso(u - hw, v + hw), b = iso(u + hw, v + hw), cc = iso(u + hw, v - hw), dd = iso(u - hw, v - hw);
        const up = p => [p[0], p[1] - hh * K];
        let o = `<ellipse cx="${f1(iso(u, v)[0] + 10)}" cy="${f1(iso(u, v)[1] + 14)}" rx="${f1(hw * 1.5 * K)}" ry="${f1(hw * .8 * K)}" fill="#000" opacity=".08"/>`;
        o += `<path d="${P([a, b, up(b), up(a)], true)}" fill="${c[0]}" stroke="${LN}" stroke-width="3"/><path d="${P([b, cc, up(cc), up(b)], true)}" fill="${c[0]}" stroke="${LN}" stroke-width="3" style="filter:brightness(.9)"/>`;
        o += `<path d="${P([up(a), up(b), up(cc), up(dd)], true)}" fill="${c[0]}" stroke="${LN}" stroke-width="3"/>`;
        const top = iso(u, v, hh), rr = hw * 1.15 * K;
        if (shop) o += `<g transform="translate(${f1(top[0])},${f1(top[1] - 30)})"><path d="M-60,0L-44,70H44L60,0Z" fill="#ffb3cb" stroke="${LN}" stroke-width="4"/><path d="M-70,0C-80,-60 -30,-60 -20,-80C0,-110 40,-90 40,-70C80,-70 80,-10 70,0Z" fill="#fff" stroke="${LN}" stroke-width="4"/><circle cy="-96" r="16" fill="#ff5a7a" stroke="${LN}" stroke-width="4"/><text y="110" text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="900" font-size="30" fill="${LN}">甜点屋</text></g>`;
        else o += `<path d="M${f1(top[0] - rr)},${f1(top[1])}A${f1(rr)},${f1(rr * .9)} 0 0 1 ${f1(top[0] + rr)},${f1(top[1])}Z" fill="${c[1]}" stroke="${LN}" stroke-width="3"/><circle cx="${f1(top[0])}" cy="${f1(top[1] - rr * .9)}" r="8" fill="#fff" stroke="${LN}" stroke-width="3"/>`;
        const dr = iso(u - hw * .3, v + hw); o += `<rect x="${f1(dr[0] - 12)}" y="${f1(dr[1] - 50 * s)}" width="24" height="${f1(50 * s)}" rx="12" fill="#a86a4a" stroke="${LN}" stroke-width="2.5"/>`;
        const wn = iso(u + hw * .4, v + hw, 90 * s); o += `<circle cx="${f1(wn[0])}" cy="${f1(wn[1])}" r="12" fill="#9fd8ff" stroke="#fff" stroke-width="4"/>`;
        return o;
      };
      const hs = [[-300, 600], [200, 1150], [500, 450], [1050, 900], [1150, 150], [1700, 650], [1700, -150], [2300, 300], [100, 400], [2250, -500], [-200, 1250], [800, 1150]];
      const items = hs.map((h, i) => ({ v: h[0] + h[1], s: house(h[0], h[1], .8 + (i % 3) * .15, cols[i % 5], i === 4) }));
      for (let i = 0; i < 18; i++) { const u = -500 + R() * 3000, v = -600 + R() * 1900; let ok = true; for (let s = 0; s < 3600; s += 80) { const p = pathAt(s); if (Math.hypot(p[0] - u, p[1] - v) < 160) { ok = false; break; } } if (!ok) continue; const b = iso(u, v); items.push({ v: u + v, s: `<g transform="translate(${f1(b[0])},${f1(b[1])})"><path d="M0,0V-70" stroke="#fff" stroke-width="7"/><circle cy="-92" r="30" fill="${['#ff8ab8', '#5fd0a8', '#ffb83a', '#a888f0'][i % 4]}" stroke="${LN}" stroke-width="3"/><path d="M-18,-92a18,18 0 0 1 36,0a12,12 0 0 1 -24,0" fill="none" stroke="#fff" stroke-width="4"/></g>` }); }
      // 里程碑 No.06（棒棒糖）
      { const p = pathAt(S0 + 520), b = iso(p[0] + 60, p[1] + 100); items.push({ v: p[0] + p[1] + 160, s: `<g transform="translate(${f1(b[0])},${f1(b[1])})"><path d="M0,0V-80" stroke="#fff" stroke-width="8"/><circle cy="-120" r="44" fill="#fff19a" stroke="${LN}" stroke-width="4"/><text y="-112" text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="900" font-size="26" fill="#ff5a8a">No.06</text></g>` }); }
      // 出口：饼干拱门横跨小路
      const se = S0 + D(6), pe = pathAt(se), eb = iso(pe[0], pe[1]);
      this.archAt = eb;
      items.push({ v: pe[0] + pe[1] + 1, s: '' });
      items.sort((a, b) => a.v - b.v);
      this.sortV = items.map(i => i.v);
      w += `<g class="items">${items.map(i => i.s).join('')}</g>`;
      this.world.innerHTML = w;
      // 鹈鹕（插入到正确的遮挡层次：用一个独立层放在房子上面，避免频繁重排）
      this.pg = mk('g', {}, this.world);
      this.shadow = mk('ellipse', { rx: 40, ry: 14, fill: '#000', opacity: .1 }, this.pg);
      this.pw = mk('g', {}, this.pg);
      this.pel = PELICANS.s06(); this.pw.appendChild(this.pel.g);
      this.fx = mk('g', {}, this.world);
      this.fx.innerHTML = ['嘿咻', '嘿咻', '呼…'].map(t => `<g class="hx"><text text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="900" font-size="44" fill="#fff" stroke="${LN}" stroke-width="9" paint-order="stroke">${t}</text></g>`).join('');
      this.hx = qa(this.fx, '.hx');
      // 饼干拱门
      this.arch = mk('g', {}, this.world);
      let am = `<path d="M-220,0V-180A220,220 0 0 1 220,-180V0H170V-180A170,170 0 0 0 -170,-180V0Z" fill="#e8b070" stroke="${LN}" stroke-width="5"/>`;
      for (let i = 0; i < 20; i++) { const a = PI + i * PI / 19; am += `<circle cx="${f1(Math.cos(a) * 195)}" cy="${f1(-180 + Math.sin(a) * 195)}" r="5" fill="#a86a3a"/>`; }
      am += `<path d="M-205,-190A205,205 0 0 1 205,-190" fill="none" stroke="#fff" stroke-width="12" stroke-dasharray="24 18" stroke-linecap="round"/><g transform="translate(0,-440)"><circle r="40" fill="#e8b070" stroke="${LN}" stroke-width="5"/><text y="10" text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="900" font-size="26" fill="#fff">GO!</text></g>`;
      this.arch.innerHTML = am;
      // 棉花糖云（飘在小镇上空，地上有影子）
      this.clouds = mk('g', {}, root);
      let cl = ''; for (let i = 0; i < 7; i++) cl += `<g class="cl"><ellipse cx="0" cy="260" rx="120" ry="40" fill="#000" opacity=".06"/>${[[0, 0, 50], [45, -20, 60], [100, 0, 48], [50, 18, 50]].map(q2 => `<circle cx="${q2[0]}" cy="${q2[1]}" r="${q2[2]}" fill="${i % 2 ? '#ffd6ea' : '#d6eeff'}"/>`).join('')}<circle cx="30" cy="-26" r="20" fill="#fff" opacity=".8"/></g>`;
      this.clouds.innerHTML = cl; this.cls = qa(this.clouds, '.cl'); this.clp = this.cls.map(() => [R() * 2400 - 200, R() * 700]);
      // 地图框与标题
      add(root, `<path d="M0,0H1920V1080H0Z M26,26V1054H1894V26Z" fill="#ffb3d1" fill-rule="evenodd"/><rect x="26" y="26" width="1868" height="1028" fill="none" stroke="${LN}" stroke-width="5" stroke-dasharray="18 10"/><g transform="translate(1690,950)"><circle r="60" fill="#fff" stroke="${LN}" stroke-width="4"/><path d="M0,-46L12,0L0,46L-12,0Z" fill="#ff5a8a"/><text y="-52" text-anchor="middle" font-family="Nunito" font-weight="900" font-size="20" fill="${LN}" dy="-6">N</text></g><g transform="translate(70,1000)"><rect width="360" height="50" rx="25" fill="#fff" stroke="${LN}" stroke-width="4"/><text x="180" y="35" text-anchor="middle" font-family="'Alimama FangYuanTi VF'" font-weight="900" font-size="26" fill="${LN}">🗺 糖果镇 · 骑行路线</text></g>`);
      this.title = mk('g', {}, root);
      this.title.innerHTML = `<g class="tt"><text text-anchor="middle" font-family="'Alimama FangYuanTi VF','Nunito'" font-weight="900" font-size="112" fill="#ff8ab8" stroke="#fff" stroke-width="22" paint-order="stroke" stroke-linejoin="round">萌系 Q 版</text><text text-anchor="middle" font-family="'Alimama FangYuanTi VF','Nunito'" font-weight="900" font-size="112" fill="none" stroke="${LN}" stroke-width="4" stroke-linejoin="round">萌系 Q 版</text><text y="64" text-anchor="middle" font-family="'Pacifico'" font-size="52" fill="#5fd0a8" stroke="#fff" stroke-width="12" paint-order="stroke">Chibi!</text></g>`;
      this.tt = q(this.title, '.tt');
    },
    camAt(lt) { const p = pathAt(S0 + D(Math.min(lt, 6))), c = iso(p[0], p[1]); return [960 - c[0] - 80, 600 - c[1]]; },
    update(lt) {
      const d = D(lt), p = pathAt(S0 + d), c = iso(p[0], p[1]), cam = this.camAt(lt);
      this.world.setAttribute('transform', `translate(${f1(cam[0])},${f1(cam[1])})`);
      const sdx = (p[2] - p[3]) * .866, flip = sdx < 0;
      const hiK = ss(1.9, 2.3, lt) * (1 - ss(3.8, 4.2, lt));
      const wig = Math.sin(TAU * d / DPR) * (8 + 8 * hiK);
      ride(this.pel, d, { dangle: true, hip: [-26, -140], bodyRot: wig, rotPivot: [-26, -100], bob: 3 });
      at(this.pel.sweat, { opacity: f2(ss(2.3, 2.45, lt) * (1 - ss(3.85, 4.0, lt))) });
      const sc = .62 + .2 * eio(hiK);
      at(this.shadow, { cx: f1(c[0]), cy: f1(c[1] + 4) });
      at(this.pw, { transform: `translate(${f1(c[0])},${f1(c[1])}) scale(${f2(flip ? -sc : sc)},${f2(sc)})` });
      this.hx.forEach((g, i) => { const a = 2.5 + i * .5, k = inv(a, a + .45, lt); at(g, { transform: `translate(${f1(c[0] + (i % 2 ? 120 : -100))},${f1(c[1] - 260 - k * 40)}) scale(${f2(eob(clamp(k * 3)))})`, opacity: f2(k > 0 && k < 1 ? 1 - ss(.7, 1, k) : 0) }); });
      this.cls.forEach((e, i) => { const q0 = this.clp[i]; e.setAttribute('transform', `translate(${f1(((q0[0] + cam[0] * .6 + lt * 20) % 2400 + 2400) % 2400 - 250)},${f1(q0[1] + cam[1] * .3 - 200)})`); });
      at(this.arch, { transform: `translate(${f1(this.archAt[0])},${f1(this.archAt[1] + 10)}) scale(${f2(eob(inv(3.7, 4.1, lt)) * .9)})` });
      const ti = eob(inv(.15, .5, lt)), to = inv(1.8, 2.1, lt);
      vis(this.title, lt > .1 && to < 1);
      at(this.tt, { transform: `translate(960,${f1(220 - to * 400)}) scale(${f2(ti)})` });
    },
    portal(lt) {
      const cam = this.camAt(lt), x = this.archAt[0] + cam[0], y = this.archAt[1] + 10 + cam[1], s = .9;
      return { d: `M${f1(x - 170 * s)},${f1(y)}V${f1(y - 180 * s)}A${f1(170 * s)},${f1(170 * s)} 0 0 1 ${f1(x + 170 * s)},${f1(y - 180 * s)}V${f1(y)}Z`, box: [x - 170 * s, y - 350 * s, x + 170 * s, y], pv: [x, y - 160], zmax: 10 };
    },
    exitFx: OLDSCENES[5].exitFx
  });
})();

/* ---------------- No.07 偶像音游：游戏画面，轨道从远处的舞台延伸到判定线；鹈鹕骑在轨道上朝前 ---------------- */
(function () {
  const PK = '#ff3fa8', CY = '#2be8ff', YL = '#ffe14a', PU = '#b04aff';
  const D = makeDist(CRUISE);
  const CAM = { cx: 960, hy: 250, f: 900, h: 430, x: 0 };
  const ZP = 900, JZ = 1060;                                 // 鹈鹕与判定线的深度
  const NOTE_T = [.5, 1, 1.5, 2, 2.5, 3, 3.5], MISS_T = 3.9, LAST_T = 6.0;
  remake(6, {
    build(root) {
      const R = rng(7707);
      bigBg(root, '#1a0630');
      add(root, `<rect width="1920" height="1080" fill="url(#s07bg)"/>`);
      this.stage = mk('g', {}, root);
      // 舞台（局部坐标：台口中心为原点，宽 3200）
      this.stage.innerHTML = `<rect x="-1500" y="-1500" width="3000" height="1500" fill="#1a0630"/><rect x="-1150" y="-1300" width="2300" height="900" rx="30" fill="url(#s07led)" opacity=".9"/><rect x="-1150" y="-1300" width="2300" height="900" rx="30" fill="url(#s07dots)"/><text y="-760" text-anchor="middle" font-family="'Gilroy'" font-weight="900" font-style="italic" font-size="260" fill="#fff" opacity=".25">PELICAN LIVE</text>
        ${Array.from({ length: 9 }, (_, i) => `<circle cx="${-1200 + i * 300}" cy="-1420" r="34" fill="${[PK, CY, YL][i % 3]}" filter="url(#s07glow)"/>`).join('')}
        <path d="M-1600,0V-1500H1600V0H1000V-1100Q0,-1260 -1000,-1100V0Z" fill="#7a0a2a" stroke="${YL}" stroke-width="10"/>${Array.from({ length: 8 }, (_, i) => `<path d="M${-1580 + i * 70},0V-1480M${1020 + i * 70},0V-1480" stroke="#4a0418" stroke-width="16"/>`).join('')}<path d="M-1000,-1100Q0,-1260 1000,-1100" fill="none" stroke="${YL}" stroke-width="22"/><text y="-1280" text-anchor="middle" font-family="'Gilroy'" font-weight="900" font-style="italic" font-size="110" fill="${YL}">ENCORE ▸</text>`;
      this.beams = mk('g', { style: 'mix-blend-mode:screen' }, root);
      this.beams.innerHTML = Array.from({ length: 6 }, (_, i) => `<path d="M-24,0L24,0L240,1100L-240,1100Z" style="fill:${[PK, CY, '#fff', YL, PK, CY][i]};fill-opacity:.18"/>`).join('');
      this.bm = qa(this.beams, 'path');
      // 轨道（透视）
      this.lanes = mk('g', {}, root);
      this.lanes.innerHTML = `<path class="bed" fill="#12021c" stroke="${PK}" stroke-width="3"/>` + Array.from({ length: 4 }, () => `<path class="ld" stroke="#fff" stroke-opacity=".25" stroke-width="2"/>`).join('') + Array.from({ length: 22 }, () => `<path class="bt" stroke="${CY}" stroke-opacity=".45"/>`).join('');
      this.bed = q(this.lanes, '.bed'); this.ld = qa(this.lanes, '.ld'); this.bt = qa(this.lanes, '.bt');
      // 荧光棒观众（两侧，按深度排）
      this.crowd = [];
      const cg = mk('g', {}, root);
      for (let r = 0; r < 14; r++) for (const side of [-1, 1]) { const Zw = 600 + r * 330, X = side * (900 + (r % 2) * 60); let s = ''; for (let i = 0; i < 9; i++) { const c = [PK, CY, YL, PU, '#fff'][Math.floor(R() * 5)]; s += `<g transform="translate(${side * i * 90},0)"><path d="M0,0V-90" stroke="${c}" stroke-width="12" stroke-linecap="round"/><circle cy="30" r="34" fill="#1a0630"/></g>`; } this.crowd.push({ Zw, X, e: add(cg, `<g filter="url(#s07glow)"><g class="sw">${s}</g></g>`) }); }
      this.crowd.sort((a, b) => b.Zw - a.Zw).forEach(c => cg.appendChild(c.e));
      // 音符：铺在轨道上的方块；每一拍正好被前轮压到
      this.notes = mk('g', {}, root);
      this.nt = NOTE_T.concat([MISS_T, 4.5, 5.0, 5.5, LAST_T]).map((t, i) => ({ t, lane: t === MISS_T ? 3 : 2, last: t === LAST_T, e: add(this.notes, `<path fill="${t === LAST_T ? YL : i % 2 ? CY : PK}" stroke="#fff" stroke-width="${t === LAST_T ? 6 : 3}"/>`) }));
      this.judge = mk('path', { stroke: '#fff', 'stroke-width': 10, filter: 'url(#s07glow)' }, root); this.burst = mk('circle', { r: 10, fill: 'none', stroke: YL, 'stroke-width': 8, filter: 'url(#s07glow)' }, root);
      this.pg = mk('g', {}, root);
      this.pel = makePelicanFB({ line: '#2a1030', lw: 3, body: '#ffffff', wing: PK, beak: '#ffb02e', leg: '#ff9a3a', tire: '#2a1030', frame: PK, bar: '#2a1030', crestC: '#fff', rimC: CY, treadC: CY,
        upExtra: `<path d="M-60,-282C-30,-296 30,-296 60,-282L70,-190H-70Z" fill="${PK}" stroke="#2a1030" stroke-width="3"/>${Array.from({ length: 16 }, (_, i) => `<circle class="sq" cx="${-50 + (i % 6) * 20}" cy="${-268 + Math.floor(i / 6) * 26}" r="3" fill="#fff"/>`).join('')}<path d="M-20,-200L0,-176L20,-200" fill="none" stroke="${YL}" stroke-width="6"/><text y="-216" text-anchor="middle" font-family="'Gilroy'" font-weight="900" font-size="30" fill="${YL}">22</text>`,
        top: `<path d="${P(starPts(16, -384, 14, 6, 5), true)}" fill="${YL}" stroke="#2a1030" stroke-width="2.5"/>` }, 'back');
      this.pel.sq = qa(this.pel.g, '.sq');
      this.pg.appendChild(this.pel.g);
      // 界面（虚构）
      let ui = `<g transform="translate(60,40)"><rect width="520" height="96" rx="16" fill="#1a0630" fill-opacity=".75" stroke="${PK}" stroke-width="3"/><text x="24" y="40" font-family="'HarmonyOS Sans SC'" font-weight="900" font-size="28" fill="#fff">♪ 二十二种画法 (Live ver.)</text><text x="24" y="76" font-family="'Gilroy'" font-weight="800" font-size="22" fill="${YL}" letter-spacing="3">MASTER · LV.22</text><rect x="250" y="60" width="240" height="14" rx="7" fill="#3a1a4a"/><rect class="life" x="250" y="60" width="210" height="14" rx="7" fill="${CY}"/></g>`;
      ui += `<g transform="translate(1860,90)"><text text-anchor="end" font-family="'Gilroy'" font-weight="800" font-size="22" letter-spacing="4" fill="${CY}">SCORE</text><text class="sc" y="54" text-anchor="end" font-family="'Gilroy'" font-weight="900" font-size="54" fill="#fff">0000000</text></g>`;
      ui += `<g transform="translate(1560,560)"><text class="cb" text-anchor="middle" font-family="'Gilroy'" font-weight="900" font-style="italic" font-size="110" fill="#fff">0</text><text y="44" text-anchor="middle" font-family="'Gilroy'" font-weight="800" font-size="30" letter-spacing="8" fill="${YL}">COMBO</text></g>`;
      ui += `<g filter="url(#s07glow)"><text class="jt" font-family="'Gilroy'" font-weight="900" font-style="italic" font-size="78" text-anchor="middle" fill="#fff" stroke="${PK}" stroke-width="3" paint-order="stroke"></text></g>`;
      ui += `<g transform="translate(150,980)"><rect x="-90" y="-60" width="180" height="90" rx="12" fill="#1a0630" stroke="${CY}" stroke-width="4" filter="url(#s07glow)"/><text y="4" text-anchor="middle" font-family="'Gilroy'" font-weight="900" font-style="italic" font-size="46" fill="${CY}">No.07</text></g>`;
      const hud = hudOf(root);
      this.ui = mk('g', {}, hud); this.ui.innerHTML = ui;
      this.cbT = q(this.ui, '.cb'); this.scT = q(this.ui, '.sc'); this.jt = q(this.ui, '.jt'); this.life = q(this.ui, '.life');
      this.title = mk('g', {}, hud);
      this.title.innerHTML = `<g class="tt" filter="url(#s07glow)"><text text-anchor="middle" font-family="'Alimama ShuHeiTi','Source Han Sans CN'" font-weight="900" font-size="120" font-style="italic" fill="url(#s07title)" stroke="#fff" stroke-width="10" paint-order="stroke" transform="skewX(-10)">偶像音游风</text><text y="70" text-anchor="middle" font-family="'Gilroy','Poppins'" font-weight="900" font-style="italic" font-size="44" letter-spacing="10" fill="${YL}" stroke="#2a1030" stroke-width="6" paint-order="stroke">IDOL RHYTHM GAME</text></g>`;
      this.tt = q(this.title, '.tt');
    },
    update(lt) {
      const d = D(lt), camZw = d, pj = (X, Z, Y) => proj(CAM, X, Z, Y);
      const Zs = D(6) + ZP - camZw;                                    // 台口的深度（lt=6 时到达鹈鹕）
      const ps = pj(0, Zs);
      at(this.stage, { transform: `translate(${f1(ps[0])},${f1(ps[1])}) scale(${f2(ps[2])})` });
      this.bm.forEach((b, i) => b.setAttribute('transform', `translate(${f1(ps[0] + (-1000 + i * 400) * ps[2])},${f1(ps[1] - 1400 * ps[2])}) rotate(${f1(Math.sin(lt * 1.6 + i * 1.1) * 28)})`));
      const zN = 320, zF = Math.max(Zs, 400);
      const a = pj(-520, zN), b = pj(520, zN), c = pj(520, zF), e = pj(-520, zF);
      this.bed.setAttribute('d', P([a, b, c, e], true));
      this.ld.forEach((l, i) => { const X = -520 + (i + 1) * 208; l.setAttribute('d', P([pj(X, zN), pj(X, zF)])); });
      this.bt.forEach((l, i) => { const zw = Math.ceil((camZw + zN) / (SPEED / 2)) * (SPEED / 2) + i * SPEED / 2, z = zw - camZw; if (z > zF) { l.setAttribute('d', 'M0,0'); return; } const p0 = pj(-520, z), p1 = pj(520, z); at(l, { d: P([p0, p1]), 'stroke-width': f1(Math.max(1, 6 * p0[2])) }); });
      this.crowd.forEach(cw => { const z = cw.Zw - ((camZw * .0) % 1) - (camZw % 4620) + (cw.Zw < (camZw % 4620) ? 4620 : 0); const zz = ((cw.Zw - camZw) % 4620 + 4620) % 4620 + 300; const p = pj(cw.X, zz); at(cw.e, { transform: `translate(${f1(p[0])},${f1(p[1])}) scale(${f2(p[2])})`, opacity: zz > Zs ? 0 : 1 }); q(cw.e, '.sw').setAttribute('transform', `skewX(${f1(Math.sin(TAU * lt * .5 + cw.Zw) * 22)})`); });
      // 音符：静止在轨道上，前轮在拍点上压过它们
      let combo = 96, judge = '', jAge = 9, score = 960000;
      this.nt.forEach(n => {
        const zw = D(n.t) + JZ, z = zw - camZw, X = -520 + n.lane * 208 + 104;
        if (z < 260 || z > Math.min(zF, 5200) || (n.t !== MISS_T && lt > n.t + .04)) n.e.setAttribute('d', 'M0,0');
        else { const p0 = pj(X - 90, z), p1 = pj(X + 90, z), p2 = pj(X + 90, z + 60), p3 = pj(X - 90, z + 60); n.e.setAttribute('d', P([p0, p1, p2, p3], true)); op(n.e, n.t === MISS_T && lt > n.t ? .35 : 1); }
        if (lt >= n.t) { if (n.t === MISS_T) { combo = 0; judge = 'MISS'; } else { combo++; score += 12000 + combo * 50; judge = n.last ? 'FINISH!' : 'PERFECT'; } jAge = lt - n.t; }
      });
      const jl = pj(-520, JZ), jr = pj(520, JZ);
      this.judge.setAttribute('d', P([jl, jr])); op(this.judge, 1); const bk = judge !== 'MISS' ? inv(0, .25, jAge) : 1; at(this.burst, { cx: 960, cy: f1(jl[1]), r: f1(20 + bk * 160), opacity: f2(bk < 1 ? 1 - bk : 0) });
      this.cbT.textContent = String(combo); at(this.cbT, { transform: `scale(${f2(1 + bump(jAge, .07) * .25)})`, fill: combo === 0 ? '#aaa' : '#fff' });
      this.scT.textContent = String(Math.round(score)).padStart(7, '0');
      this.jt.textContent = jAge < .45 ? judge : '';
      at(this.jt, { x: 960, y: f1(jl[1] - 330 - jAge * 60), fill: judge === 'MISS' ? '#9a9aa8' : '#fff', stroke: judge === 'MISS' ? '#444' : PK, opacity: f2(1 - ss(.3, .45, jAge)) });
      at(this.life, { width: f1(judge === 'MISS' && lt > MISS_T ? 170 : 210) });
      // 鹈鹕（背影，朝舞台骑去）
      this.pel.update(d / DPR, d, {});
      this.pel.sq.forEach((s, i) => s.setAttribute('opacity', f2(.4 + .6 * Math.abs(Math.sin(lt * 5 + i * 1.3)))));
      const pp = pj(0, ZP);
      at(this.pg, { transform: `translate(${f1(pp[0])},${f1(pp[1])}) scale(${f2(pp[2])})` });
      op(this.ui, ss(0, .3, lt));
      const ti = eob(inv(.15, .45, lt)), to = inv(1.8, 2.05, lt);
      vis(this.title, lt > .1 && to < 1);
      at(this.tt, { transform: `translate(${f1(960 + to * 1400)},300) scale(${f2(ti)})` });
    },
    portal(lt) { const p = proj(CAM, 0, ZP), s = p[2]; const x0 = 960 - 1000 * s, x1 = 960 + 1000 * s, y1 = p[1], y0 = p[1] - 1100 * s; return { d: `M${f1(x0)},${f1(y1)}V${f1(y0)}Q960,${f1(p[1] - 1260 * s)} ${f1(x1)},${f1(y0)}V${f1(y1)}Z`, box: [x0, y0, x1, y1], late: true, zmax: 5 }; },
    exitFx: OLDSCENES[6].exitFx
  });
})();

/* ---------------- No.08 日系赛璐珞动画：老动画 4:3 画面，两侧黑边；侧面跟拍 ---------------- */
(function () {
  OLDSCENES[7]._ld = true;
  const old = OLDSCENES[7];
  const V8 = lt => SPEED * (1 + ss(1.9, 2.1, lt) * (1 - ss(3.9, 4.1, lt)));   // 迟到飞奔：速度与踏频一起翻倍
  const D = makeDist(V8);
  remake(7, {
    build(root) {
      bigBg(root, '#2f86e6');
      old.build.call(this, root);
      // 路一直铺到画面下方很远（转场时镜头会上下校正）
      this.Lr.g.insertAdjacentHTML('afterbegin', `<rect x="-800" y="${GY - 10}" width="6400" height="900" fill="#7a7a82"/>`);
      // 第 3 小节：路面爬上一个坡顶（强拍时鹈鹕正好在坡顶）
      const XC = PX + D(6), XS = XC - 1150, HH = 170;
      this.hillY = x => GY - HH * ss(XS, XC, x);
      let top = []; for (let x = XS - 200; x <= XC + 3200; x += 25) top.push([x, this.hillY(x)]);
      this.hill = add(this.Lr.g, `<g><path d="M${XS - 200},${GY + 900}L${top.map(p => f1(p[0]) + ',' + f1(p[1] - 10)).join('L')}L${XC + 3200},${GY + 900}Z" fill="#8a8a92"/><path d="M${top.map(p => f1(p[0]) + ',' + f1(p[1] - 10)).join('L')}" stroke="#6a6a72" stroke-width="12" fill="none"/><path d="M${top.map(p => f1(p[0]) + ',' + f1(p[1] + 95)).join('L')}" stroke="#fff" stroke-width="7" stroke-dasharray="80 60" fill="none"/><path d="M${top.map(p => f1(p[0]) + ',' + f1(p[1] + 175)).join('L')}" stroke="#7a7a82" stroke-width="60" fill="none"/></g>`);
      const hud = hudOf(root);
      hud.appendChild(this.title); hud.appendChild(this.late);
      this.gate = add(hud, `<g><path d="M0,0H240V1080H0ZM1680,0H1920V1080H1680Z" fill="#000"/><rect x="240" y="0" width="1440" height="1080" fill="none" stroke="#111" stroke-width="10"/><rect class="flk" x="240" y="0" width="1440" height="1080" fill="#fff" opacity="0"/><g class="dust"></g></g>`);
      this.flk = q(this.gate, '.flk'); this.dust2 = q(this.gate, '.dust');
      this.dust2.innerHTML = Array.from({ length: 6 }, () => `<circle r="2" fill="#222"/>`).join('');
      this.tt.parentNode.setAttribute('transform', 'translate(0,0)');
    },
    update(lt) {
      const d = D(lt), sc = d, hi = ss(1.95, 2.15, lt) * (1 - ss(3.9, 4.1, lt));
      // 坡：鹈鹕所在处的路面高度与坡度；镜头随它上坡（远景下沉到坡后面）
      const xw = PX + d, yR = this.hillY(xw), slope = Math.atan2(this.hillY(xw + 20) - this.hillY(xw - 20), 40) * 180 / PI, offY = (GY - yR) * .8;
      this.Lc.g.setAttribute('transform', `translate(${f1(-sc * .04)},${f1(offY * .15)})`);
      this.Ls.g.setAttribute('transform', `translate(${f1(-((sc * .35) % this.TILE) - this.TILE * .5)},${f1(offY * .9)})`);
      this.Lp.g.setAttribute('transform', `translate(${f1(-((sc * .75) % 700) - 350)},${f1(offY * .95)})`);
      this.Lr.g.setAttribute('transform', `translate(${f1(-sc)},${f1(offY)})`);
      op(this.spd, hi);
      if (hi > 0) this.spe.forEach((e, i) => { const p = this.spp[i]; at(e, { x: f1(1920 - fr(lt * (1.8 + p[0] * 2) + p[1]) * 3200), y: f1(80 + p[2] * 900), width: f1(300 + p[0] * 700) }); });
      ride(this.pel, d);
      op(this.pel.toast, ss(1.75, 1.9, lt) * (1 - ss(5.6, 5.8, lt)));
      at(this.pg, { transform: `translate(${f1(PX + hi * Math.sin(lt * 60) * 3)},${f1(yR + offY - hi * 6)}) rotate(${f2(-4 * hi + slope)})` });
      this.dc.forEach((dd, i) => { const k = fr(lt * 3 + i / 6); at(dd, { transform: `translate(${f1(PX - 160 - k * 300)},${f1(GY - 10 - k * 40)}) scale(${f2((1 - k) * hi * 1.2)})` }); });
      vis(this.gate, lt < 6);                       // 转场时黑边交给特效层（向外退开）
      const lk = eob(inv(2.05, 2.25, lt)) * (1 - inv(3.8, 4.0, lt));
      vis(this.late, lk > .01); at(this.late, { transform: `translate(1240,330) scale(${f2(lk)})` });
      const ti = eob(inv(.85, 1.15, lt)), to = inv(1.8, 1.98, lt);
      vis(this.title, lt > .8 && to < 1); at(this.tt, { transform: `translate(960,230) scale(${f2(ti * (1 - to))})` });
      vis(this.bridge, false);
      // 老胶片的闪烁与灰尘
      op(this.flk, (hash(Math.floor(lt * 24)) - .5) * .05 + .02);
      qa(this.dust2, 'circle').forEach((c, i) => { const k = Math.floor(lt * 12 + i * 3); at(c, { cx: f1(260 + hash(k * 3.1) * 1400), cy: f1(hash(k * 7.7) * 1080), r: f1(1 + hash(k) * 3), opacity: hash(k * 1.3) < .4 ? .6 : 0 }); });
    },
    openD(lt, cx) { return rectD(PX + D(6) - D(Math.min(lt, 6)) - 300, GY + 30 - 560, 600, 560); },
    ow: 600, oh: 560,
    exitFx: old.exitFx
  });
})();
