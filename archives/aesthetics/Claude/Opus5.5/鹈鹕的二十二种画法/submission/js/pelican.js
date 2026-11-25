'use strict';
/* ============================================================
   鹈鹕与自行车：统一的骨架、姿势与可换画法的渲染器
   局部坐标：原点在中轴正下方的地面，y 向上为负
   ============================================================ */
const PG = {
  R: 60, RW: [-110, -60], FW: [112, -60], BB: [-4, -62],
  ST: [-34, -152], SADDLE: [-38, -162], HTT: [84, -154], HTB: [94, -124], STEM: [84, -174], GRIP: [62, -180],
  CR: 22, HIP: [-20, -186], L1: 80, L2: 78
};
const PS = {   // 形状（上半身随呼吸起伏）
  body: 'M-128,-226C-106,-262 -46,-284 2,-272C26,-266 38,-250 38,-230C38,-204 20,-184 -12,-180C-52,-176 -90,-192 -108,-208Q-118,-216 -128,-226Z',
  neck: 'M0,-268C-4,-298 8,-328 30,-346L58,-338C44,-320 38,-300 38,-280C38,-264 34,-252 26,-246Z',
  head: 'M23,-350a23,20 0 1 0 46,0a23,20 0 1 0 -46,0Z',
  beak: 'M60,-364C104,-358 160,-346 208,-336C216,-334 218,-327 211,-323C172,-330 112,-340 62,-344Z',
  pouch: 'M62,-344C112,-338 172,-330 206,-325C192,-310 150,-296 112,-298C84,-300 62,-314 54,-332Z',
  wing: 'M10,-262C-30,-270 -84,-258 -118,-232L-100,-230L-122,-218L-98,-216L-112,-204C-72,-200 -30,-206 4,-212C28,-214 48,-204 64,-184C52,-210 36,-240 10,-262Z',
  crest: 'M26,-362C16,-372 8,-370 2,-366C10,-364 16,-360 22,-356Z',
  fish: 'M-5,-2C-9,6 -8,14 -3,19L-11,30L0,26L8,32L5,19C9,12 8,4 4,-2Z',
  saddle: 'M-60,-166C-50,-170 -30,-170 -18,-166C-24,-160 -50,-158 -60,-166Z'
};
const PEYE = [48, -354];
const HEADPIV = [40, -330];
const FISHPOS = [184, -323];

function legIK(hx, hy, fx, fy, L1, L2) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
  const dm = L1 + L2 - 0.5;
  if (d > dm) { fx = hx + dx / d * dm; fy = hy + dy / d * dm; dx = fx - hx; dy = fy - hy; d = dm; }
  const phi = Math.atan2(dy, dx);
  const a = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  return [hx + Math.cos(phi - a) * L1, hy + Math.sin(phi - a) * L1, fx, fy];
}
// 计算一帧的姿势
function pelPose(tau, roll, o) {
  o = o || {};
  const a = TAU * tau;
  const bob = (o.bob !== undefined ? o.bob : 1.8) * Math.sin(2 * a);
  const BB = PG.BB;
  const p1 = [BB[0] + Math.cos(a) * PG.CR, BB[1] + Math.sin(a) * PG.CR];
  const p2 = [BB[0] - Math.cos(a) * PG.CR, BB[1] - Math.sin(a) * PG.CR];
  const hip = [PG.HIP[0], PG.HIP[1] + bob];
  const k1 = legIK(hip[0], hip[1], p1[0], p1[1], PG.L1, PG.L2);
  const k2 = legIK(hip[0], hip[1], p2[0], p2[1], PG.L1, PG.L2);
  return { a, bob, p1, p2, hip, k1, k2, wheel: (roll / PG.R) * 180 / PI };
}
function legD(hip, k) { return `M${f1(hip[0])},${f1(hip[1])}L${f1(k[0])},${f1(k[1])}L${f1(k[2])},${f1(k[3])}`; }
function footD(x, y) { return `M${f1(x - 6)},${f1(y - 5)}L${f1(x + 20)},${f1(y + 1)}L${f1(x + 15)},${f1(y + 7)}L${f1(x - 8)},${f1(y + 5)}Z`; }
function spokesD(n, r) {
  let d = '';
  for (let i = 0; i < n / 2; i++) { const a = i * TAU / n; d += `M${f1(Math.cos(a) * r)},${f1(Math.sin(a) * r)}L${f1(-Math.cos(a) * r)},${f1(-Math.sin(a) * r)}`; }
  return d;
}
const FRAME_D = (() => {
  const { RW, BB, ST, HTT, HTB, FW } = PG;
  return `M${RW}L${BB}L${ST}L${RW}M${ST}L${HTT}L${HTB}L${BB}M${HTB}L${FW}`.replace(/,/g, ',');
})();
const FRAME_D2 = `M${PG.RW[0]},${PG.RW[1]}L${PG.BB[0]},${PG.BB[1]}L${PG.ST[0]},${PG.ST[1]}L${PG.RW[0]},${PG.RW[1]}M${PG.ST[0]},${PG.ST[1]}L${PG.HTT[0]},${PG.HTT[1]}L${PG.HTB[0]},${PG.HTB[1]}L${PG.BB[0]},${PG.BB[1]}M${PG.HTB[0]},${PG.HTB[1]}L${PG.FW[0]},${PG.FW[1]}`;
const BAR_D = `M${PG.HTT[0]},${PG.HTT[1]}L${PG.STEM[0]},${PG.STEM[1]}Q72,-184 ${PG.GRIP[0]},${PG.GRIP[1]}`;
const SEATPOST_D = `M${PG.ST[0]},${PG.ST[1]}L${PG.SADDLE[0]},${PG.SADDLE[1]}`;

/* 全局 clipPath（各部件形状，供两层阴影用） */
function pelDefs() {
  let s = '';
  for (const k of ['body', 'neck', 'head', 'beak', 'pouch', 'wing']) s += `<clipPath id="pk-${k}"><path d="${PS[k]}"/></clipPath>`;
  def(s);
}

/* ---------- 通用渲染器 ----------
   o: 颜色与线条配置；o.shade: {part: [color, dx, dy]}；o.shade2 同理（第二层）
*/
function partMk(name, fill, o, extraAttr) {
  const line = o.line, lw = o.lw, D = (o.shapes || PS)[name];
  const sh = o.shade && o.shade[name], sh2 = o.shade2 && o.shade2[name], rim = o.rim && o.rim[name];
  let s = '';
  if (sh || sh2 || rim) {
    s += `<g clip-path="url(#pk-${name})">`;
    if (rim) s += `<path d="${D}" fill="${rim[0]}"/><path d="${D}" fill="${(sh && sh[0]) || fill}" transform="translate(${rim[1]},${rim[2]})"/>`;
    else s += `<path d="${D}" fill="${sh ? sh[0] : fill}"/>`;
    if (sh2) s += `<path d="${D}" fill="${sh2[0]}" transform="translate(${sh2[1] * 0.5},${sh2[2] * 0.5})"/>`;
    if (sh) s += `<path d="${D}" fill="${fill}" transform="translate(${rim ? sh[1] + rim[1] : sh[1]},${rim ? sh[2] + rim[2] : sh[2]})"/>`;
    s += `</g>`;
    if (lw > 0) s += `<path d="${D}" fill="none" stroke="${line}" stroke-width="${lw}" stroke-linejoin="${o.join || 'round'}" ${extraAttr || ''}/>`;
  } else {
    s += `<path d="${D}" fill="${fill}" ${lw > 0 ? `stroke="${line}" stroke-width="${lw}" stroke-linejoin="${o.join || 'round'}"` : ''} ${extraAttr || ''}/>`;
  }
  return s;
}

function makePelican(o) {
  o = Object.assign({
    line: '#1d1d24', lw: 4, body: '#fbfaf6', wing: '#e8e4da', beak: '#f2a43a', pouch: '#f6c46e', eye: '#1d1d24',
    leg: '#ee8a2a', legFar: '#c46a18', legW: 9, tire: '#24242c', tireW: 7, rim: null, spoke: '#5a5a66', spokeW: 1.6, spokes: 16,
    frame: '#2f6fd6', frameW: 7, saddle: '#24242c', bar: '#3a3a44', crank: '#3a3a44', fish: '#6aa7c8', footLine: null,
    wheelFill: 'none', ringFill: 'none'
  }, o);
  const g = mk('g', { class: 'pelican' });
  const R = PG.R;
  const wheel = (c, cls) => `<g transform="translate(${c[0]},${c[1]})">${o.wheelBack ? o.wheelBack(R) : ''}<circle r="${R}" fill="${o.wheelFill}" stroke="${o.tire}" stroke-width="${o.tireW}"/>${o.rimW ? `<circle r="${R - o.tireW / 2 - o.rimW / 2}" fill="none" stroke="${o.rimC}" stroke-width="${o.rimW}"/>` : ''}<g class="${cls}"><path d="${spokesD(o.spokes, R - 4)}" stroke="${o.spoke}" stroke-width="${o.spokeW}" fill="none"/>${o.wheelDeco ? o.wheelDeco(R) : ''}</g><circle r="${o.hubR || 6}" fill="${o.hub || o.tire}"/>${o.wheelFront ? o.wheelFront(R) : ''}</g>`;
  let s = '';
  s += `<g class="pfar"><path class="lf" fill="none" stroke="${o.legFar}" stroke-width="${o.legW}" stroke-linecap="round" stroke-linejoin="round"/><path class="ff" fill="${o.legFar}" ${o.footLine ? `stroke="${o.footLine}" stroke-width="2"` : ''}/><path class="cf" stroke="${o.crank}" stroke-width="5" stroke-linecap="round"/></g>`;
  s += `<g class="pbike">${o.bikeBack || ''}${wheel(PG.RW, 'sr')}${wheel(PG.FW, 'sf')}`;
  if (o.frameUnder) s += `<path d="${FRAME_D2}" fill="none" stroke="${o.frameUnder}" stroke-width="${o.frameW + 2 * (o.frameUnderW || 2.5)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  s += `<path d="${FRAME_D2}" fill="none" stroke="${o.frame}" stroke-width="${o.frameW}" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (o.frameLine) s += `<path d="${FRAME_D2}" fill="none" stroke="${o.frameLine}" stroke-width="${o.frameLineW || 1.5}" stroke-linejoin="round" stroke-linecap="round" ${o.frameLineAttr || ''}/>`;
  s += `<path d="${SEATPOST_D}" stroke="${o.bar}" stroke-width="5"/><path d="${PS.saddle}" fill="${o.saddle}" ${o.saddleLine ? `stroke="${o.saddleLine}" stroke-width="2"` : ''}/>`;
  s += `<path d="${BAR_D}" fill="none" stroke="${o.bar}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  s += `<circle cx="${PG.BB[0]}" cy="${PG.BB[1]}" r="15" fill="${o.ringFill}" stroke="${o.crank}" stroke-width="3"/>${o.bikeFront || ''}</g>`;
  s += `<g class="pup">${o.upBack || ''}`;
  s += partMk('body', o.body, o);
  s += partMk('neck', o.neck || o.body, o);
  s += `<g class="phead">`;
  s += partMk('head', o.head || o.body, o);
  if (o.crestC) s += `<path d="${PS.crest}" fill="${o.crestC}"/>`;
  s += partMk('pouch', o.pouch, o);
  s += partMk('beak', o.beak, o);
  s += `<g class="pfish" transform="translate(${(o.fishPos || FISHPOS)[0]},${(o.fishPos || FISHPOS)[1]})"><path class="pfisht" d="${PS.fish}" fill="${o.fish}" ${o.lw > 0 ? `stroke="${o.line}" stroke-width="${Math.min(o.lw, 2.5)}" stroke-linejoin="round"` : ''}/></g>`;
  s += o.eyeMk ? o.eyeMk() : `<circle cx="${PEYE[0]}" cy="${PEYE[1]}" r="4.2" fill="${o.eye}"/>`;
  s += (o.headExtra || '') + `</g>${o.upFront || ''}</g>`;
  s += `<g class="pnear"><path class="cn" stroke="${o.crank}" stroke-width="5" stroke-linecap="round"/><path class="ln" fill="none" stroke="${o.leg}" stroke-width="${o.legW}" stroke-linecap="round" stroke-linejoin="round"/><path class="fn" fill="${o.leg}" ${o.footLine ? `stroke="${o.footLine}" stroke-width="2"` : ''}/></g>`;
  s += `<g class="pwing">${partMk('wing', o.wing, o)}${o.wingExtra || ''}</g>`;
  s += o.top || '';
  g.innerHTML = s;
  const r = {
    lf: q(g, '.lf'), ff: q(g, '.ff'), cf: q(g, '.cf'), ln: q(g, '.ln'), fn: q(g, '.fn'), cn: q(g, '.cn'),
    sr: q(g, '.sr'), sf: q(g, '.sf'), up: q(g, '.pup'), wing: q(g, '.pwing'), head: q(g, '.phead'), fish: q(g, '.pfisht')
  };
  const P0 = { g, r, o };
  P0.update = function (tau, roll, opt) {
    opt = opt || {};
    const ps = pelPose(tau, roll, opt);
    const BB = PG.BB;
    r.cf.setAttribute('d', `M${BB[0]},${BB[1]}L${f1(ps.p2[0])},${f1(ps.p2[1])}`);
    r.cn.setAttribute('d', `M${BB[0]},${BB[1]}L${f1(ps.p1[0])},${f1(ps.p1[1])}`);
    if (opt.dangle) {
      // 腿够不着踏板：悬空晃荡
      const sw = Math.sin(TAU * tau * 2) * 10;
      const h = opt.hip || ps.hip;
      r.lf.setAttribute('d', `M${f1(h[0])},${f1(h[1])}l${f1(4 - sw)},22l${f1(10 - sw * .5)},14`);
      r.ln.setAttribute('d', `M${f1(h[0] + 6)},${f1(h[1])}l${f1(4 + sw)},22l${f1(10 + sw * .5)},14`);
      r.ff.setAttribute('d', footD(h[0] + 14 - sw * 1.5, h[1] + 36));
      r.fn.setAttribute('d', footD(h[0] + 20 + sw * 1.5, h[1] + 36));
    } else {
      r.lf.setAttribute('d', legD(ps.hip, ps.k2));
      r.ln.setAttribute('d', legD(ps.hip, ps.k1));
      r.ff.setAttribute('d', footD(ps.k2[2], ps.k2[3]));
      r.fn.setAttribute('d', footD(ps.k1[2], ps.k1[3]));
    }
    r.sr.setAttribute('transform', `rotate(${f1(ps.wheel)})`);
    r.sf.setAttribute('transform', `rotate(${f1(ps.wheel)})`);
    const upT = `translate(0,${f2(ps.bob)})` + (opt.bodyRot ? ` rotate(${f2(opt.bodyRot)},${(opt.rotPivot || [-30, -170]).join(',')})` : '');
    r.up.setAttribute('transform', upT);
    r.wing.setAttribute('transform', upT + (opt.wingRot ? ` rotate(${f2(opt.wingRot)},6,-250)` : ''));
    r.head.setAttribute('transform', opt.headRot ? `rotate(${f2(opt.headRot)},${HEADPIV[0]},${HEADPIV[1]})` : '');
    r.fish.setAttribute('transform', `rotate(${f1(Math.sin(TAU * tau * 2) * 16)})`);
    if (P0.onUpdate) P0.onUpdate(ps, tau, roll, opt);
    return ps;
  };
  return P0;
}

/* ---------- 真实前进：一切由“走过的距离 d”驱动 ----------
   曲柄每转一圈前进 DPR（局部单位）；车轮转角 = d / R；巡航时一圈正好两拍 */
const DPR = SPEED;
function ride(p, d, opt) { return p.update(d / DPR, d, opt); }
/* 速度曲线 v(lt) → 距离 d(lt)（d(0)=0，向前向后都可延伸） */
function makeDist(vfn) {
  const t0 = -3, t1 = 8, dt = 0.002, n = Math.round((t1 - t0) / dt);
  const tab = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) { const t = t0 + (i - .5) * dt; tab[i] = tab[i - 1] + vfn(t) * dt; }
  const z = tab[Math.round((0 - t0) / dt)];
  const f = function (lt) { const x = (clamp(lt, t0, t1) - t0) / dt, i = clamp(Math.floor(x), 0, n - 1), fr2 = x - i; return tab[i] + (tab[i + 1] - tab[i]) * fr2 - z; };
  f.v = vfn;
  return f;
}
const CRUISE = lt => SPEED;

/* ---------- 正面 / 背面视角的鹈鹕（骑向镜头或骑离镜头） ----------
   facing: 'front' | 'back'；局部坐标原点在车轮着地点 */
function makePelicanFB(o, facing) {
  o = Object.assign({ line: '#1d1d24', lw: 3.5, body: '#fbfaf6', belly: null, wing: '#e8e4da', beak: '#f2a43a', pouch: '#f6c46e', eye: '#1d1d24', leg: '#ee8a2a', tire: '#24242c', frame: '#2f6fd6', bar: '#3a3a44', fish: '#6aa7c8', shade: 'rgba(40,50,90,.16)' }, o);
  const L = o.line, W = o.lw, back = facing === 'back';
  const g = mk('g', { class: 'pelfb' });
  const st = W > 0 ? `stroke="${L}" stroke-width="${W}" stroke-linejoin="round"` : '';
  let s = '';
  // 车：正对/背对镜头时车轮是一道窄椭圆
  s += `<g class="fbw"><ellipse cx="0" cy="-62" rx="11" ry="62" fill="${o.wheelFill || 'none'}" stroke="${o.tire}" stroke-width="${Math.max(6, W * 2)}"/>${o.rimC ? `<ellipse cx="0" cy="-62" rx="7" ry="56" fill="none" stroke="${o.rimC}" stroke-width="2"/>` : ''}<g class="tread"></g></g>`;
  s += `<path d="M-8,-62L-5,-136M8,-62L5,-136" stroke="${o.frame}" stroke-width="6" stroke-linecap="round"/>`;
  s += `<path class="lgL" fill="none" stroke="${o.leg}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path class="lgR" fill="none" stroke="${o.leg}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path class="ftL" fill="${o.leg}" ${st}/><path class="ftR" fill="${o.leg}" ${st}/>`;
  s += `<g class="fbup">`;
  if (back) {
    s += `<path d="M-92,-176Q0,-190 92,-176" fill="none" stroke="${o.bar}" stroke-width="7" stroke-linecap="round"/><circle cx="-92" cy="-176" r="7" fill="${o.bar}"/><circle cx="92" cy="-176" r="7" fill="${o.bar}"/>`;
    s += `<path d="M-14,-152H14L10,-140H-10Z" fill="${o.saddle || L}"/>`;
    s += `<path d="M-30,-168L0,-128L30,-168Z" fill="${o.wing}" ${st}/>`;                                     // 尾羽
    s += `<ellipse cx="0" cy="-238" rx="66" ry="72" fill="${o.wing}" ${st}/>`;                               // 背
    s += `<path d="M-60,-270C-80,-230 -84,-200 -86,-178M60,-270C80,-230 84,-200 86,-178" fill="none" stroke="${o.wing}" stroke-width="22" stroke-linecap="round"/>`;
    if (W > 0) s += `<path d="M-60,-270C-80,-230 -84,-200 -86,-178M60,-270C80,-230 84,-200 86,-178" fill="none" stroke="${L}" stroke-width="${W * .7}" stroke-linecap="round" opacity=".6"/>`;
    s += `<path d="M-40,-280C-20,-250 -12,-220 -14,-190M40,-280C20,-250 12,-220 14,-190M0,-300V-200" stroke="${L}" stroke-width="${Math.max(1, W * .5)}" fill="none" opacity=".35"/>`;
    s += `<g class="fbhd"><rect x="-17" y="-334" width="34" height="44" rx="14" fill="${o.body}" ${st}/><circle cx="0" cy="-352" r="27" fill="${o.body}" ${st}/><path d="M-8,-378C-4,-392 8,-394 10,-380Z" fill="${o.crestC || o.body}" ${st}/>`;
    s += `<path d="M18,-356C40,-352 60,-344 76,-334L70,-328C54,-334 36,-338 22,-342Z" fill="${o.beak}" ${st}/></g>`;
  } else {
    s += `<path d="M-12,-150H12L9,-140H-9Z" fill="${o.saddle || L}"/>`;
    s += `<ellipse cx="0" cy="-236" rx="64" ry="72" fill="${o.body}" ${st}/>`;
    if (o.belly) s += `<ellipse cx="0" cy="-222" rx="40" ry="50" fill="${o.belly}"/>`;
    s += `<ellipse cx="14" cy="-226" rx="44" ry="58" fill="${o.shade}"/>`;
    s += `<path d="M-90,-178Q0,-192 90,-178" fill="none" stroke="${o.bar}" stroke-width="7" stroke-linecap="round"/>`;
    s += `<path d="M-48,-280C-82,-262 -96,-220 -92,-180C-80,-186 -72,-206 -64,-228C-58,-246 -50,-262 -40,-270Z" fill="${o.wing}" ${st}/><path d="M48,-280C82,-262 96,-220 92,-180C80,-186 72,-206 64,-228C58,-246 50,-262 40,-270Z" fill="${o.wing}" ${st}/>`;
    s += `<g class="fbhd"><rect x="-17" y="-336" width="34" height="50" rx="14" fill="${o.body}" ${st}/><circle cx="0" cy="-354" r="27" fill="${o.body}" ${st}/><path d="M-8,-380C-4,-394 8,-396 10,-382Z" fill="${o.crestC || o.body}" ${st}/>`;
    s += o.eyeMk ? o.eyeMk() : `<circle cx="-13" cy="-360" r="4.6" fill="${o.eye}"/><circle cx="13" cy="-360" r="4.6" fill="${o.eye}"/>`;
    // 朝着镜头的长喙：从脸上垂到胸前，下面兜着喉囊
    s += `<g class="fbbk"><path d="M-14,-336C-26,-300 -24,-272 0,-250C24,-272 26,-300 14,-336Z" fill="${o.pouch}" ${st}/><path d="M-11,-344C-9,-300 -5,-268 0,-246C5,-268 9,-300 11,-344Z" fill="${o.beak}" ${st}/>`;
    s += `<g class="fbfish" transform="translate(0,-248)"><path d="M-5,-2C-9,6 -8,14 -3,19L-11,30L0,26L8,32L5,19C9,12 8,4 4,-2Z" fill="${o.fish}" ${W > 0 ? `stroke="${L}" stroke-width="2"` : ''}/></g></g>`;
    s += (o.headExtra || '') + `</g>`;
  }
  s += (o.upExtra || '') + `</g>` + (o.top || '');
  g.innerHTML = s;
  const r = { lgL: q(g, '.lgL'), lgR: q(g, '.lgR'), ftL: q(g, '.ftL'), ftR: q(g, '.ftR'), up: q(g, '.fbup'), hd: q(g, '.fbhd'), tread: q(g, '.tread'), fish: q(g, '.fbfish') };
  r.tread.innerHTML = [0, 1, 2, 3].map(() => `<path stroke="${o.treadC || '#fff'}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`).join('');
  const tr = qa(r.tread, 'path');
  const P0 = { g, r, o, facing };
  P0.update = function (tau, roll, opt) {
    opt = opt || {};
    const a = TAU * tau, bob = 1.6 * Math.sin(2 * a);
    const leg = (side, ph) => {
      const hx = side * 26, hy = -184 + bob, fx = side * 34, fy = -62 + 22 * Math.cos(a + ph);
      const dx = fx - hx, dy = fy - hy, dd = Math.hypot(dx, dy), L1 = 80, L2 = 78;
      const k = Math.sqrt(Math.max(0, L1 * L1 - (dd / 2) * (dd / 2)));
      const kx = (hx + fx) / 2 + side * k * .55, ky = (hy + fy) / 2 - 6;
      return [`M${f1(hx)},${f1(hy)}L${f1(kx)},${f1(ky)}L${f1(fx)},${f1(fy)}`, fx, fy];
    };
    const lL = leg(-1, 0), lR = leg(1, PI);
    r.lgL.setAttribute('d', lL[0]); r.lgR.setAttribute('d', lR[0]);
    const foot = (x, y, side) => back ? `M${f1(x - 9)},${f1(y)}L${f1(x + 9)},${f1(y)}L${f1(x + 6)},${f1(y + 9)}L${f1(x - 6)},${f1(y + 9)}Z` : `M${f1(x - 12)},${f1(y + 6)}L${f1(x)},${f1(y - 4)}L${f1(x + 12)},${f1(y + 6)}L${f1(x)},${f1(y + 12)}Z`;
    r.ftL.setAttribute('d', foot(lL[1], lL[2], -1)); r.ftR.setAttribute('d', foot(lR[1], lR[2], 1));
    r.up.setAttribute('transform', `translate(0,${f2(bob)})` + (opt.sway ? ` rotate(${f2(opt.sway)},0,-150)` : ''));
    const look = opt.lookUp || 0;
    r.hd.setAttribute('transform', look ? `translate(0,${f2(-look * 14)})` + (back ? '' : ` translate(0,-300) scale(1,${f2(1 - look * .35)}) translate(0,300)`) : '');
    // 车轮滚动：胎面标记沿椭圆移动（不打滑）
    const w = roll / PG.R;
    tr.forEach((p, i) => { const ph = w + i * PI / 2, c = Math.cos(ph), sn = Math.sin(ph); const vis2 = back ? sn < 0 : sn > 0; const y = -62 - 62 * c, x = 11 * sn * (back ? -1 : 1); p.setAttribute('d', vis2 ? `M${f1(x - 5)},${f1(y)}L${f1(x + 5)},${f1(y)}` : 'M0,0'); });
    if (r.fish) r.fish.setAttribute('transform', `translate(0,-248) rotate(${f1(Math.sin(TAU * tau * 2) * 14)})`);
    if (P0.onUpdate) P0.onUpdate(tau, roll, opt);
  };
  return P0;
}

/* 透视：地面点 (X,Z) 投到屏幕；cam = {cx, hy(地平线), f, h(机位高度), x(横向)} */
function proj(cam, X, Z, Y) { const s = cam.f / Z; return [cam.cx + (X - (cam.x || 0)) * s, cam.hy + (cam.h - (Y || 0)) * s, s]; }

/* 摆位：位置/缩放/旋转（绕后轮着地点等） */
function placeT(x, y, s, rot, flip) {
  return `translate(${f2(x)},${f2(y)})` + (rot ? ` rotate(${f2(rot)})` : '') + ` scale(${f2((flip ? -1 : 1) * (s || 1))},${f2(s || 1)})`;
}

/* 风格注册表：每种画法的鹈鹕都可以独立实例化（片尾要同时出现 23 只） */
const PELICANS = {};
/* 由平滑形状派生的折线形状（剪纸、拼贴等锋利轮廓） */
function angularShapes(seed, jit, counts) {
  const R = rng(seed), o = {};
  counts = Object.assign({ body: 16, neck: 12, head: 10, beak: 9, pouch: 11, wing: 30, crest: 5 }, counts || {});
  for (const k in PS) {
    if (!counts[k]) { o[k] = PS[k]; continue; }
    const pts = samplePath(PS[k], counts[k] + 1).slice(0, -1).map(p => [p[0] + (R() - .5) * jit, p[1] + (R() - .5) * jit]);
    o[k] = P(pts, true);
  }
  return o;
}
/* 变速滚动：给定速度函数 v(lt)，预积分得到位移 s(lt)，s(0)=0，lt>6 时冻结 */
function makeScroll(vfn) {
  const t0 = -3, t1 = 7, dt = 0.002, n = Math.round((t1 - t0) / dt);
  const tab = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) { const t = t0 + (i - .5) * dt; tab[i] = tab[i - 1] + vfn(t) * dt; }
  const z = tab[Math.round((0 - t0) / dt)];
  return function (lt) {
    lt = Math.min(lt, 6);
    const x = (lt - t0) / dt, i = clamp(Math.floor(x), 0, n - 1), f = x - i;
    return tab[i] + (tab[i + 1] - tab[i]) * f - z;
  };
}
/* 场景通用：视差层 */
function scrollL(ls, s) { for (const l of ls) l.g.setAttribute('transform', `translate(${f1(-s * l.p)},0)`); }
function layer(parent, p, markup, attrs) { const g = mk('g', attrs || {}, parent); if (markup) g.innerHTML = markup; return { g, p }; }
/* 星屑/尘土类粒子：固定发射网格，保证同一时刻画面相同 */
function trailParticles(lt, opts) {
  const dt = opts.dt || 0.03, life = opts.life || 1.2, out = [];
  const n = Math.ceil(life / dt);
  const base = Math.floor(lt / dt);
  for (let j = 0; j < n; j++) {
    const id = base - j, te = id * dt, age = lt - te;
    if (age < 0 || age > life) continue;
    out.push({ id, age, k: age / life, r1: hash(id * 1.37 + (opts.seed || 0)), r2: hash(id * 2.71 + 5 + (opts.seed || 0)), r3: hash(id * 4.13 + 9 + (opts.seed || 0)) });
  }
  return out;
}
