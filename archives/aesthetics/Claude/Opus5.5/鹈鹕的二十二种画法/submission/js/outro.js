'use strict';
/* ============================================================
   片尾：冲线
   22 只不同画法的鹈鹕从画布四周骑进来，排成阵列，冲线定格
   ============================================================ */
(function () {
  const S = 0.4;                                   // 鹈鹕缩放
  const ROWS = [450, 610, 770, 930];               // 四条“车道”的地面
  const KEYS = [];
  for (let i = 1; i <= 22; i++) KEYS.push('s' + String(i).padStart(2, '0'));
  // 阵列：4 行，前排（最右）一列冲线；线稿鹈鹕在第 2 行最前
  const SLOTS = [];
  const order = ['line'].concat(KEYS);
  // 每行 6 个（最后一行 5 个），col 5 是最前
  const layout = [[1, 5]];
  const rest = [];
  for (let r = 0; r < 4; r++) for (let c = 5; c >= 0; c--) { if (r === 1 && c === 5) continue; if (r === 3 && c === 0) continue; rest.push([r, c]); }
  // 让风格交错分布
  const R = rng(4040);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const slots = layout.concat(rest);
  const SPEC = { s06: { dangle: true, hip: [-26, -140], rotPivot: [-26, -100] } };

  SEG.outro = {
    zh: '片尾', en: 'Epilogue',
    build(root) {
      canvasDefs();
      add(root, canvasMarkup(1920, 1080));
      // 画布上的铅笔车道线（滚动，提示前进）
      this.lanes = mk('g', { stroke: '#23222a', 'stroke-linecap': 'round', opacity: .5 }, root);
      let ln = ''; for (const y of ROWS) { ln += `<path d="M-200,${y + 2}H2200" stroke-width="2" opacity=".55"/>`; for (let i = 0; i < 30; i++) ln += `<path d="M${-200 + i * 90},${y + 16}h30" stroke-width="2"/>`; }
      this.lanes.innerHTML = ln;
      this.world = mk('g', {}, root);
      // 终点线
      this.finish = mk('g', {}, this.world);
      let fm = `<rect x="-14" y="300" width="28" height="720" fill="#fff"/>`;
      for (let j = 0; j < 36; j++) fm += `<rect x="${j % 2 ? 0 : -14}" y="${300 + j * 20}" width="14" height="20" fill="#23222a"/>`;
      fm += `<path d="M-14,300V1020M14,300V1020" stroke="#23222a" stroke-width="2"/><path d="M0,300V250" stroke="#23222a" stroke-width="4"/><path d="M0,250L70,268L0,286Z" fill="#d7261e"/><text x="0" y="230" text-anchor="middle" font-family="'JetBrains Mono','LXGW WenKai GB'" font-size="30" fill="#23222a">FINISH · 终点</text>`;
      this.finish.innerHTML = fm;
      // 鹈鹕们
      this.pels = order.map((k, i) => {
        const p = PELICANS[k]();
        const g = mk('g', {}, this.world);
        if (k === 's12') add(g, `<rect x="-200" y="-440" width="460" height="470" rx="16" fill="#1d4f9a"/><rect x="-200" y="-440" width="460" height="470" rx="16" fill="url(#s12G)"/>`);
        g.appendChild(p.g);
        if (p.gear) p.gear(1, 1, 1);
        if (p.toast) op(p.toast, 1);
        const bell = add(g, `<g class="bl" opacity="0"><path d="M60,-470q30,-30 60,0M40,-500q50,-50 100,0" stroke="#d7261e" stroke-width="7" fill="none" stroke-linecap="round"/><text x="150" y="-470" font-family="'Source Han Serif CN'" font-weight="900" font-size="64" fill="#d7261e">叮</text></g>`);
        const sl = slots[i];
        return { key: k, p, g, bell, row: sl[0], col: sl[1], seed: hash(i * 3.7 + 1) };
      });
      this.riderIn = this.pels[0].p.g;
      // 按行排序（后排先画）
      this.pels.slice().sort((a, b) => a.row - b.row).forEach(o => this.world.appendChild(o.g));
      this.world.appendChild(this.finish);
      this.finish.parentNode.insertBefore(this.finish, this.world.firstChild);
      // 字幕
      this.cap = mk('g', {}, root);
      this.cap.innerHTML = `<text x="960" y="170" text-anchor="middle" font-family="'JetBrains Mono','LXGW WenKai GB',monospace" font-size="78" letter-spacing="6" fill="#23222a">一只鹈鹕，二十二种画法。</text><text x="960" y="226" text-anchor="middle" font-family="'Cormorant Garamond',serif" font-style="italic" font-size="34" letter-spacing="6" fill="#77716a">One pelican, twenty-two ways to draw it.</text>`;
      // 冲线照片：闪光、网格、扫描线、成绩条
      this.photo = mk('g', {}, root);
      let ph = `<rect class="fl" width="1920" height="1080" fill="#fff"/><g class="grid" stroke="#23222a" stroke-width="1.5" opacity=".55"></g><rect class="scan" y="0" width="6" height="1080" fill="#d7261e" opacity=".8"/>`;
      ph += `<path class="frame" d="M0,0H1920V1080H0Z M26,26V1054H1894V26Z" fill="#fbf9f3" fill-rule="evenodd"/>`;
      ph += `<g class="strip"><rect x="26" y="968" width="1868" height="86" fill="#23222a"/><text x="60" y="1022" font-family="'JetBrains Mono'" font-size="30" fill="#f8f5ed">PHOTO FINISH · 02:29.00</text><text x="700" y="1022" font-family="'JetBrains Mono','LXGW WenKai GB'" font-size="30" fill="#ffd36a">1st · 线稿鹈鹕 No.00 · 领先半格</text><text x="1870" y="1022" text-anchor="end" font-family="'JetBrains Mono','LXGW WenKai GB'" font-size="24" fill="#a9a49a">2nd–23rd · +0.01s</text></g>`;
      ph += `<g class="mark"><circle r="58" fill="none" stroke="#d7261e" stroke-width="5"/><path d="M40,40L110,110" stroke="#d7261e" stroke-width="6"/><text x="120" y="150" font-family="'JetBrains Mono','LXGW WenKai GB'" font-size="26" fill="#d7261e">½ 格</text></g>`;
      this.photo.innerHTML = ph;
      this.fl = q(this.photo, '.fl'); this.grid = q(this.photo, '.grid'); this.scan = q(this.photo, '.scan'); this.frame = q(this.photo, '.frame'); this.strip = q(this.photo, '.strip'); this.mark = q(this.photo, '.mark');
    },
    // 片尾的“片中时间”：冲线前放慢，强拍定格
    le(t) { if (t < 9) return t; if (t < 10) return 9 + (t - 9) * .3; return 9.3; },
    slotPos(o, t) {
      const neat = ss(3.0, 5.0, t);
      const loose = [(o.seed - .5) * 120, (hash(o.seed * 9) - .5) * 30];
      const x = 300 + o.col * 230 + loose[0] * (1 - neat), y = ROWS[o.row] + loose[1] * (1 - neat);
      return [x, y];
    },
    update(t) {
      const le = this.le(t);
      // 车道线滚动
      this.lanes.setAttribute('transform', `translate(${f1(-((le * 260) % 90))},0)`);
      // 镜头：先近后拉远，冲线时推近终点
      const z = lerp(1.12, 0.94, eio(inv(2.8, 5.0, t))) + 0.16 * eio(inv(8.8, 10.0, t));
      const fxAt = (tt) => lerp(2300, 1520, eio(inv(6.0, 9.95, tt)));
      const xF = fxAt(le >= 9.3 ? 9.95 : Math.min(t, 9.95));
      const cxz = lerp(960, xF - 120, eio(inv(8.8, 10.0, t))), cyz = lerp(640, 660, eio(inv(8.8, 10.0, t)));
      this.world.setAttribute('transform', zoomT(z, cxz, cyz));
      this.lanes.parentNode && this.lanes.setAttribute('opacity', f2(.5));
      this.finish.setAttribute('transform', `translate(${f1(xF)},0)`);
      vis(this.finish, t > 5.6);
      // 冲刺：前排（col 5）喙尖贴近终点线；线稿鹈鹕领先半格（20px）
      const race = ss(6.0, 8.5, t);
      this.pels.forEach((o, i) => {
        const [sx, sy] = this.slotPos(o, t);
        // 入场：从四周骑进来
        const side = i === 0 ? -1 : i % 4;
        const a = i === 0 ? 0 : 0.15 + (i % 11) * 0.17;
        const k = i === 0 ? 1 : eo(inv(a, a + 1.4, t));
        let x0 = sx, y0 = sy;
        if (side === 0) x0 = -260 - (i % 3) * 80; else if (side === 1) { x0 = 2200 + (i % 3) * 60; } else if (side === 2) y0 = -180; else if (side === 3) y0 = 1260;
        let x = lerp(x0, sx, k), y = lerp(y0, sy, k);
        // 入场时的弧线
        if (side >= 2) x += Math.sin(k * PI) * (side === 2 ? -120 : 120);
        // 比赛中的你追我赶
        const jost = Math.sin(le * 1.7 + o.seed * 20) * 26 * race * (1 - ss(9.2, 9.3, le));
        x += jost;
        // 定格时：前排排出名次，线稿鹈鹕领先半格
        if (o.col === 5) {
          const tip = (o.key === 'line' ? 202 : 212) * S;
          const target = o.key === 'line' ? xF + 20 : xF - 20 - o.row * 6 - (o.row > 1 ? 10 : 0);
          const want = target - tip;
          x = lerp(x, want, ss(8.6, 9.3, le));
        } else x = lerp(x, x + (xF - 1520) * 0, 0);
        const tau = le + o.seed * 0; // 所有踏板同步对拍
        const roll = le * SPEED;
        const op2 = SPEC[o.key] || {};
        o.p.update(tau, roll, Object.assign({ lt: le, v: 260 }, op2));
        o.g.setAttribute('transform', `translate(${f1(x)},${f1(y)}) scale(${S})`);
        // 车铃齐响
        const bk = Math.max(bump(t - 10.02, .18), bump(t - 11.0, .16) * .9);
        at(o.bell, { opacity: f2(t > 9.98 ? clamp(bk * 1.6) : 0), transform: `rotate(${f1(Math.sin(t * 40 + i) * 8 * bk)},100,-470)` });
      });
      // 字幕
      const ck = ss(4.0, 4.4, t);
      at(this.cap, { opacity: f2(ck * (1 - ss(9.6, 9.9, t))), transform: `translate(0,${f1((1 - ck) * 20)})` });
      // 冲线照片
      const ph = t >= 9.98;
      vis(this.photo, t >= 9.9);
      op(this.fl, ph ? 1 - ss(10.0, 10.35, t) : bump(t - 9.98, .05));
      if (ph) {
        const toScr = (x) => (x - cxz) * z + cxz;
        const xs = toScr(xF), cell = 40 * z;
        let gd = ''; for (let n = -22; n <= 22; n++) gd += `<path d="M${f1(xs + n * cell)},26V968" ${n === 0 ? 'stroke="#d7261e" stroke-width="3"' : ''}/>`;
        this.grid.innerHTML = gd;
        op(this.grid, ss(10.1, 10.4, t) * .7);
        const sk = inv(10.05, 10.75, t);
        at(this.scan, { x: f1(lerp(26, 1894, sk)), opacity: sk > 0 && sk < 1 ? .85 : 0 });
        op(this.frame, ss(10.2, 10.5, t));
        at(this.strip, { opacity: f2(ss(10.5, 10.8, t)), transform: `translate(0,${f1((1 - ss(10.5, 10.8, t)) * 80)})` });
        const lp = this.pels[0];
        const ly = (ROWS[lp.row] - 350 * S - 140 * 0);
        const my = (ly - cyz) * z + cyz;
        at(this.mark, { opacity: f2(ss(10.8, 11.1, t)), transform: `translate(${f1(xs + 20 * z)},${f1(my + 18)})` });
      } else { op(this.grid, 0); op(this.frame, 0); op(this.strip, 0); op(this.mark, 0); op(this.scan, 0); }
    }
  };
})();
