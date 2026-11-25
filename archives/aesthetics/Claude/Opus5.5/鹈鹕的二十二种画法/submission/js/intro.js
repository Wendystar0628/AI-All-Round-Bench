'use strict';
/* ============================================================
   线稿鹈鹕（片头与片尾的领骑者）+ 片头
   ============================================================ */
function makeLinePelican(opts) {
  opts = Object.assign({ line: '#23222a', lw: 3.4, paper: '#fbf9f3' }, opts);
  const g = mk('g', { class: 'linepel' });
  const L = opts.line, W = opts.lw;
  const A = `fill="none" stroke="${L}" stroke-width="${W}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1"`;
  const { RW, FW, BB, ST, HTT, HTB, GRIP, SADDLE } = PG;
  // 部件与绘制顺序
  const parts = [
    ['wr', circD(RW[0], RW[1], 60)], ['wf', circD(FW[0], FW[1], 60)],
    ['fr', `M${RW}L${BB}L${ST}L${RW}M${ST}L${HTT}L${BB}M${HTT}L${FW}`],
    ['hb', `M${HTT}L84,-172L${GRIP}M${ST}L${SADDLE}M-56,-164L-20,-164`],
    ['bd', 'M-125,-222C-125,-250 -85,-270 -42,-270C0,-270 37,-248 37,-222C37,-196 0,-176 -42,-176C-85,-176 -125,-194 -125,-222Z'],
    ['nk', 'M14,-258C18,-290 26,-316 36,-334M33,-246C38,-280 44,-310 56,-334'],
    ['hd', circD(48, -348, 20)],
    ['bk', 'M66,-356L202,-318'],      // 上喙（歪）
    ['pc', 'M64,-340C100,-300 160,-298 202,-318'],
    ['wg', 'M8,-252C-34,-258 -78,-246 -104,-222M8,-232C30,-216 46,-200 62,-182'],
  ];
  let s = `<g class="lb">`;
  for (const [k, d] of parts) {
    const fill = (k === 'bd' || k === 'hd') ? `fill="${opts.paper}"` : '';
    if (fill) s += `<path class="f-${k}" d="${d}" ${fill} stroke="none" opacity="0"/>`;
    s += `<path class="p-${k}" d="${d}" ${A}/>`;
  }
  s += `<circle class="valve r" r="3" fill="${L}"/><circle class="valve f" r="3" fill="${L}"/>`;
  s += `<circle class="eye" cx="51" cy="-351" r="3.4" fill="${L}" opacity="0"/>`;
  s += `<path class="fish" d="${PS.fish}" fill="none" stroke="${L}" stroke-width="2.2" stroke-linejoin="round" opacity="0"/>`;
  s += `</g><path class="lf" ${A.replace('stroke-dasharray="1 1"', '')}/><path class="ln" ${A.replace('stroke-dasharray="1 1"', '')}/><path class="cr" ${A.replace('stroke-dasharray="1 1"', '')}/>`;
  g.innerHTML = s;
  const P = {}; parts.forEach(([k]) => { P[k] = q(g, '.p-' + k); });
  const fb = q(g, '.f-bd'), fh = q(g, '.f-hd'), eye = q(g, '.eye'), fish = q(g, '.fish');
  const vr = q(g, '.valve.r'), vf = q(g, '.valve.f'), lf = q(g, '.lf'), ln = q(g, '.ln'), cr = q(g, '.cr'), lb = q(g, '.lb');
  const o = { g };
  o.parts = parts.map(p => p[0]);
  o.setDraw = function (prog) {      // prog: {key: 0..1}
    for (const k in P) { const v = prog[k] === undefined ? 1 : prog[k]; P[k].setAttribute('stroke-dashoffset', f2(1 - v)); }
    const all = prog.legs === undefined ? 1 : prog.legs;
    op(fb, (prog.bd === undefined ? 1 : prog.bd) > .98 ? 1 : 0); op(fh, (prog.hd === undefined ? 1 : prog.hd) > .98 ? 1 : 0);
    op(eye, (prog.hd === undefined ? 1 : prog.hd) > .98 ? 1 : 0);
    op(fish, prog.fish === undefined ? 1 : prog.fish);
    lf.setAttribute('opacity', f2(all)); ln.setAttribute('opacity', f2(all)); cr.setAttribute('opacity', f2(all));
    vr.setAttribute('opacity', all > .5 ? 1 : 0); vf.setAttribute('opacity', all > .5 ? 1 : 0);
  };
  // 喙的歪斜程度：k=1 歪；k=0 正
  o.setBeak = function (k, wob) {
    const ty = lerp(-334, -318, k) + (wob || 0), tx = lerp(210, 202, k);
    P.bk.setAttribute('d', `M66,-356L${f1(tx)},${f1(ty)}`);
    P.pc.setAttribute('d', `M64,-340C100,${f1(lerp(-310, -300, k))} 160,${f1(lerp(-312, -298, k) + (wob || 0) * .5)} ${f1(tx)},${f1(ty)}`);
  };
  o.update = function (tau, roll, opt) {
    opt = opt || {};
    const ps = pelPose(tau, roll, { bob: 1.2 });
    lf.setAttribute('d', legD(ps.hip, ps.k2) + `l14,2`);
    ln.setAttribute('d', legD(ps.hip, ps.k1) + `l14,2`);
    cr.setAttribute('d', `M${f1(ps.p1[0])},${f1(ps.p1[1])}L${f1(ps.p2[0])},${f1(ps.p2[1])}`);
    const a = ps.wheel * PI / 180;
    at(vr, { cx: f1(RW[0] + Math.cos(a) * 52), cy: f1(RW[1] + Math.sin(a) * 52) });
    at(vf, { cx: f1(FW[0] + Math.cos(a + 1) * 52), cy: f1(FW[1] + Math.sin(a + 1) * 52) });
    lb.setAttribute('transform', `translate(0,${f2(ps.bob * .6)})`);
    fish.setAttribute('transform', `translate(140,-318) rotate(${f1(160 + Math.sin(TAU * tau * 2.5) * 20)})`);
    return ps;
  };
  o.setDraw({});
  o.setBeak(1);
  return o;
}
PELICANS.line = () => makeLinePelican();

/* ---------- 纸面滤镜（片头与片尾共用） ---------- */
function canvasDefs() {
  if (canvasDefs.done) return; canvasDefs.done = true;
  def(`<filter id="paperGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .45  0 0 0 0 .42  0 0 0 0 .36  0 0 0 -1.4 .9"/></filter>
  <linearGradient id="canvasEdgeIn" x1="0" x2="1"><stop offset="0" stop-color="#6a5a3a" stop-opacity="0"/><stop offset="1" stop-color="#6a5a3a" stop-opacity=".18"/></linearGradient>
  <radialGradient id="canvasVig" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#5a4a2a" stop-opacity="0"/><stop offset="1" stop-color="#5a4a2a" stop-opacity=".10"/></radialGradient>`);
}
function canvasMarkup(w, h) {
  return `<rect width="${w}" height="${h}" fill="#f8f5ed"/><rect width="${w}" height="${h}" filter="url(#paperGrain)" opacity=".55"/><rect width="${w}" height="${h}" fill="url(#canvasVig)"/>`;
}

SEG.intro = {
  zh: '片头', en: 'Prologue',
  build(root) {
    canvasDefs();
    const g = mk('g', {}, root);
    this.sheet = g;
    const PW = 4600;
    g.innerHTML = `${canvasMarkup(PW, 1080)}
      <g font-family="'JetBrains Mono','LXGW WenKai GB',monospace" fill="#23222a">
        <text class="pr" x="150" y="210" font-size="30" fill="#9a958a" letter-spacing="2">PROMPT ›</text>
        <text class="l1" x="150" y="290" font-size="64" letter-spacing="3"></text>
        <rect class="caret" x="150" y="238" width="5" height="64" fill="#d7261e"/>
        <text class="l2" x="150" y="380" font-size="64" letter-spacing="3" fill="#d7261e" opacity="0">再画一遍，换个画法。</text>
      </g>
      <path class="road" d="M-100,${GY}L1990,${GY}" stroke="#23222a" stroke-width="3" stroke-linecap="round" fill="none" pathLength="1" stroke-dasharray="1 1"/><path d="M1980,${GY}L${PW},${GY}" stroke="#23222a" stroke-width="3" stroke-linecap="round" fill="none"/>
      <g class="ticks" stroke="#23222a" stroke-width="2.4" stroke-linecap="round" opacity=".55"></g>
      <g class="pelslot"></g>
      <g class="eraser" opacity="0"><rect x="-34" y="-20" width="68" height="40" rx="6" fill="#f2b8b8" stroke="#23222a" stroke-width="3"/><rect x="-34" y="-20" width="26" height="40" rx="4" fill="#5a7fc0" stroke="#23222a" stroke-width="3"/><g class="crumbs" fill="#cfc4b0"></g></g>
      <g class="pencil"><path d="M0,0L14,-36L40,-26L26,10Z" fill="#f4c84a" stroke="#23222a" stroke-width="2.5" stroke-linejoin="round"/><path d="M0,0L14,-36L6,-38Z" fill="#23222a"/><path d="M0,0l4,-12l7,3Z" fill="#23222a"/></g>`;
    this.l1 = q(g, '.l1'); this.l2 = q(g, '.l2'); this.caret = q(g, '.caret'); this.road = q(g, '.road');
    this.pencil = q(g, '.pencil'); this.eraser = q(g, '.eraser'); this.ticks = q(g, '.ticks');
    let tk = '';
    for (let i = 0; i < 33; i++) { const x = 60 + i * 140; tk += `<path d="M${x},${GY + 20}l26,0"/>`; }
    this.ticks.innerHTML = tk;
    this.pel = makeLinePelican();
    root.insertBefore(mk('g'), null).appendChild(this.pel.g);
    root.appendChild(this.pencil); root.appendChild(this.eraser);
    this.pel.g.setAttribute('transform', `translate(${PX},${GY})`);
    // 预采样绘制路径，供铅笔笔尖跟随
    this.samp = {};
    const tmp = mk('path');
    for (const k of this.pel.parts) {
      const d = q(this.pel.g, '.p-' + k).getAttribute('d');
      this.samp[k] = samplePath(d, 40);
    }
    // 绘制时间表
    this.sched = [['wr', 1.0, 1.22], ['wf', 1.14, 1.36], ['fr', 1.3, 1.55], ['hb', 1.5, 1.62], ['bd', 1.6, 1.82], ['nk', 1.8, 1.92], ['hd', 1.9, 2.0], ['bk', 2.0, 2.1], ['pc', 2.08, 2.2], ['wg', 2.2, 2.32]];
  },
  // 强拍 t=3 起步：速度在两秒内从 0 加到巡航（片头结束时正好蹬完一整圈）
  dist: makeDist(t => SPEED * clamp((t - 3) / 2)),
  update(t) {
    const dd = this.dist(t);
    this.sheet.setAttribute('transform', `translate(${f1(-dd)},0)`);
    // 文字
    const s1 = '画一只骑自行车的鹈鹕。';
    const n1 = clamp(Math.floor((t - 0.12) / 0.072), 0, 11);
    this.l1.textContent = Array.from(s1).slice(0, n1).join('');
    let cx = 150;
    try { cx = 150 + (n1 > 0 ? this.l1.getComputedTextLength() + 6 : 0); } catch (e) { }
    const caretOn = t < 1.05 ? 1 : (Math.floor(t * 2.5) % 2 === 0 ? 1 : 0);
    at(this.caret, { x: f1(cx), opacity: t > 3 ? 0 : caretOn });
    const k2 = inv(3, 3.12, t);
    at(this.l2, { opacity: f2(k2), transform: `translate(0,${f1((1 - eob(k2)) * -30)})` });
    // 线稿绘制
    const prog = {};
    let pen = null;
    for (const [k, a, b] of this.sched) {
      const v = inv(a, b, t); prog[k] = v;
      if (v > 0 && v < 1) { const S = this.samp[k]; pen = S[Math.min(S.length - 1, Math.floor(v * (S.length - 1)))]; }
    }
    prog.legs = inv(2.3, 2.45, t); prog.fish = inv(2.4, 2.5, t);
    this.pel.setDraw(prog);
    this.road.setAttribute('stroke-dashoffset', f2(1 - eo(inv(1.0, 2.6, t))));
    op(this.ticks, inv(2.4, 2.8, t) * .55);
    // 铅笔
    if (pen && t < 2.4) { vis(this.pencil, 1); this.pencil.setAttribute('transform', `translate(${f1(PX + pen[0])},${f1(GY + pen[1])})`); }
    else if (t > 0.9 && t < 1.0) { vis(this.pencil, 1); this.pencil.setAttribute('transform', `translate(${f1(lerp(1500, PX - 50, eo(inv(.9, 1, t))))},${f1(GY - 60)})`); }
    else vis(this.pencil, 0);
    // 歪喙桥段：橡皮想擦正，喙又弹回去
    let crook = 1, wob = 0;
    if (t > 2.42 && t < 3.05) {
      const e = inv(2.42, 2.52, t), rub = Math.sin((t - 2.5) * 50) * 14 * (t > 2.5 && t < 2.7 ? 1 : 0);
      op(this.eraser, Math.min(e, 1 - inv(2.82, 2.95, t)));
      const ex = PX + 150 + rub, ey = GY - 360 - (1 - e) * 80 + (t > 2.75 ? -(t - 2.75) * 260 : 0);
      this.eraser.setAttribute('transform', `translate(${f1(ex)},${f1(ey)}) rotate(-20)`);
      crook = 1 - ss(2.55, 2.68, t);
      if (t > 2.8) { crook = 1; wob = Math.sin((t - 2.8) * 60) * 9 * Math.exp(-(t - 2.8) * 9); }
    } else op(this.eraser, 0);
    this.pel.setBeak(crook, wob);
    // 踏板与车轮都由走过的距离驱动（不打滑）
    this.pel.update(dd / DPR, dd);
  }
};
