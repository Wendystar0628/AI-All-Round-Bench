'use strict';
/* ============================================================
   引擎：时间轴、转场合成、播放控制、导出接口
   ============================================================ */
(function () {
  const svg = document.getElementById('svg');
  DEFS = document.getElementById('defs');
  const stage = document.getElementById('stage');
  const ovRoot = document.getElementById('ov');

  pelDefs();
  def(`<clipPath id="screenclip"><rect width="1920" height="1080"/></clipPath><clipPath id="brClipB" clipPathUnits="userSpaceOnUse"><path id="brClipBP" d="M0,0Z"/></clipPath>`);
  stage.setAttribute('clip-path', 'url(#screenclip)');
  const brClipBP = document.getElementById('brClipBP');
  // 覆盖层：转场特效（鹈鹕之下）/ 过渡中的鹈鹕 / 转场特效（鹈鹕之上）
  const ovFx = mk('g', { class: 'ovfx' }, ovRoot), ovBr = mk('g', { class: 'ovbr' }, ovRoot), ovFront = mk('g', { class: 'ovfront' }, ovRoot);
  const brOld = mk('g', {}, ovBr), brUse = mk('use', {}, brOld);
  brOld.style.display = 'none'; brOld._disp = 'none';

  const segs = [SEG.intro].concat(SCENES).concat([SEG.outro]);
  let acc = 0;
  segs.forEach((s, i) => {
    s.index = i; s.start = acc; s.dur = i === 0 ? INTRO_LEN : (i === segs.length - 1 ? OUTRO_LEN : SEC_LEN); acc += s.dur;
    s.wrap = mk('g', { class: 'wrap', 'data-seg': i }, stage);
    s.cam = mk('g', { class: 'cam' }, s.wrap);
    s.wrap.style.visibility = 'hidden'; s.wrap.style.opacity = '0'; s.wrap._vis = 'hidden';
    s.built = false;
  });
  window.SEGS = segs;

  /* ---------- 转场参数（版块 A 的 trans 描述“A 怎样变成下一版”） ---------- */
  const TDEF = { align: 'cam', hold: 1.0, blend: 2.0, move: [0.15, 1.0], hideA: 1.0, pel: { at: 0.75, dur: 0.3, wipe: 'up', edge: 0 } };
  function transOf(A) {
    if (A._T) return A._T;
    const T = Object.assign({}, TDEF, A.trans || {});
    T.pel = Object.assign({}, TDEF.pel, (A.trans && A.trans.pel) || {});
    const pe = T.pel.at + T.pel.dur;
    T.post = Math.max(T.align === 'cam' ? T.blend : T.align === 'move' ? T.move[1] : 0, pe, T.hideA, T.fx && T.fx.win ? T.fx.win[1] : 0, T.fx2 && T.fx2.win ? T.fx2.win[1] : 0, T.postMin || 0) + 0.02;
    A._T = T; return T;
  }
  window.transOf = transOf;

  /* ---------- 矩阵（直接读 transform 属性，不触发布局） ---------- */
  const MI = [1, 0, 0, 1, 0, 0];
  const mmul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const minv = m => { const d = m[0] * m[3] - m[1] * m[2]; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
  const map = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const mstr = m => 'matrix(' + m.map(v => Math.round(v * 1e4) / 1e4).join(',') + ')';
  function localM(el) {
    const L = el.transform && el.transform.baseVal; if (!L || !L.numberOfItems) return MI;
    let m = MI; for (let i = 0; i < L.numberOfItems; i++) { const t = L.getItem(i).matrix; m = mmul(m, [t.a, t.b, t.c, t.d, t.e, t.f]); } return m;
  }
  // el 的局部坐标 → stop（不含）的坐标；skip 里的节点不计
  function ctmTo(el, stop, skip) { let m = MI; for (let n = el; n && n !== stop; n = n.parentNode) { if (skip && skip.indexOf(n) >= 0) continue; m = mmul(localM(n), m); } return m; }
  // 姿态：原点（车轮着地点）、缩放、朝向、是否镜像
  function poseOf(m) { const det = m[0] * m[3] - m[1] * m[2]; return { o: [m[4], m[5]], s: Math.sqrt(Math.abs(det)), a: Math.atan2(m[1], m[0]) + (det < 0 ? 0 : 0), f: det < 0 ? -1 : 1 }; }
  const canon = p => { const c = Math.cos(p.a), s = Math.sin(p.a); return [p.s * c, p.s * s, -p.f * p.s * s, p.f * p.s * c, p.o[0], p.o[1]]; };
  const angD = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  function lerpPose(p, q, k) { return { o: [lerp(p.o[0], q.o[0], k), lerp(p.o[1], q.o[1], k)], s: p.s * Math.pow(q.s / p.s, k), a: p.a + angD(p.a, q.a) * k, f: k < .5 ? p.f : q.f }; }
  window.TRM = { mmul, minv, map, mstr, canon, poseOf, lerpPose, ctmTo, MI };

  /* ---------- 鹈鹕的包装层：引擎可以隐藏、平移、裁切它，而不动版块自己的代码 ---------- */
  let ridN = 0;
  function wrapRider(el) {
    if (!el) return null;
    if (el._rw) return el._rw;
    const outer = mk('g', { class: 'rw' }), inner = mk('g', { class: 'rwi' });
    el.parentNode.insertBefore(outer, el); outer.appendChild(inner); inner.appendChild(el);
    if (!el.id) el.id = 'rdr' + (++ridN);
    return (el._rw = { el, outer, inner });
  }
  function riderEl(s, which) {
    const v = which === 'in' ? (s.riderIn || s.rider) : (s.riderOut || s.rider);
    return v || (s.pel && s.pel.g);
  }

  function ensureBuilt(s) {
    if (s.built) return;
    s.built = true;
    s.build(s.cam);
    s._rIn = wrapRider(riderEl(s, 'in')); s._rOut = wrapRider(riderEl(s, 'out'));
    s._rws = [s._rIn, s._rOut].filter((r, i, a) => r && a.indexOf(r) === i);
    const T = s.trans;
    if (T && T.fx) { s.fxG = mk('g', { class: 'fx' }, T.fx.front ? ovFront : ovFx); s.fxG.style.display = 'none'; s.fxG._disp = 'none'; T.fx.build.call(s, s.fxG); }
    if (T && T.fx2) { s.fxG2 = mk('g', { class: 'fx' }, ovFront); s.fxG2.style.display = 'none'; s.fxG2._disp = 'none'; T.fx2.build.call(s, s.fxG2); }
  }

  /* ---------- 只在值变化时写属性（避免每帧触发整棵子树的样式重算） ---------- */
  function setA(el, name, val) {
    const key = '_a_' + name;
    if (el[key] === val) return;
    el[key] = val;
    if (val === null || val === '' || val === undefined) el.removeAttribute(name); else el.setAttribute(name, val);
  }
  function setD(el, on) { const v = on ? '' : 'none'; if (el._disp === v) return; el._disp = v; el.style.display = v; }
  // 场景容器用 visibility 切换：布局只在加载时做一次
  function setV(el, on) { const v = on ? 'visible' : 'hidden'; if (el._vis === v) return; el._vis = v; el.style.visibility = v; el.style.opacity = on ? '' : '0'; }
  function setClipCss(el, v) { if (el._clipc === v) return; el._clipc = v; el.style.clipPath = v || ''; }

  /* ---------- 鹈鹕换画法的扫过形状（鹈鹕局部坐标：原点在着地点，y 向上为负） ---------- */
  const BX0 = -620, BX1 = 620, BY0 = -760, BY1 = 110, BIG = 4000;
  function wipeFront(kind, k, edge, seed) {
    const N = 16, pts = [];
    const ed = i => edge ? (hash(i * 7.3 + seed * 3.1) - .5) * 2 * edge : 0;
    if (kind === 'up' || kind === 'down') {
      const y0 = kind === 'up' ? lerp(BY1, BY0, k) : lerp(BY0, BY1, k);
      for (let i = 0; i <= N; i++) pts.push([lerp(BX0, BX1, i / N), y0 + ed(i)]);
    } else {
      const x0 = kind === 'fwd' ? lerp(BX1, BX0, k) : lerp(BX0, BX1, k);
      for (let i = 0; i <= N; i++) pts.push([x0 + ed(i), lerp(BY0, BY1, i / N)]);
    }
    return pts;
  }
  function wipePolys(kind, k, edge, seed) {
    if (kind === 'radial') {
      const r = lerp(0, 900, k), n = 28, c = [0, -230], circ = [];
      for (let i = 0; i < n; i++) { const a = i / n * TAU, rr = r * (1 + (edge ? (hash(i * 5.1 + seed) - .5) * edge / 120 : 0)); circ.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]); }
      const box = [[BX0 - BIG, BY0 - BIG], [BX1 + BIG, BY0 - BIG], [BX1 + BIG, BY1 + BIG], [BX0 - BIG, BY1 + BIG]];
      return { nw: [circ], old: [box, circ.slice().reverse()] };
    }
    const f = wipeFront(kind, k, edge, seed);
    let nwSide, oldSide;
    if (kind === 'up') { nwSide = [[BX1 + BIG, BY1 + BIG], [BX0 - BIG, BY1 + BIG]]; oldSide = [[BX1 + BIG, BY0 - BIG], [BX0 - BIG, BY0 - BIG]]; }
    else if (kind === 'down') { nwSide = [[BX1 + BIG, BY0 - BIG], [BX0 - BIG, BY0 - BIG]]; oldSide = [[BX1 + BIG, BY1 + BIG], [BX0 - BIG, BY1 + BIG]]; }
    else if (kind === 'fwd') { nwSide = [[BX1 + BIG, BY1 + BIG], [BX1 + BIG, BY0 - BIG]]; oldSide = [[BX0 - BIG, BY1 + BIG], [BX0 - BIG, BY0 - BIG]]; }
    else { nwSide = [[BX0 - BIG, BY1 + BIG], [BX0 - BIG, BY0 - BIG]]; oldSide = [[BX1 + BIG, BY1 + BIG], [BX1 + BIG, BY0 - BIG]]; }
    const ext = f.slice();
    if (kind === 'up' || kind === 'down') { ext.unshift([BX0 - BIG, f[0][1]]); ext.push([BX1 + BIG, f[f.length - 1][1]]); }
    else { ext.unshift([f[0][0], BY0 - BIG]); ext.push([f[f.length - 1][0], BY1 + BIG]); }
    return { nw: [ext.concat(nwSide)], old: [ext.concat(oldSide)] };
  }
  const polyD = (polys, m) => polys.map(pl => 'M' + pl.map(p => { const q = map(m, p[0], p[1]); return f1(q[0]) + ',' + f1(q[1]); }).join('L') + 'Z').join('');
  window.wipePolys = wipePolys;

  /* ---------- 转场控制 ---------- */
  let want = {};
  const FULLCLIP = 'path("M-400,-400H2320V1480H-400Z") view-box';   // 始终保留一个裁切，避免切换时的整段重排
  const NOCLIP = 'path("M0,0Z") view-box';
  const W = i => (want[i] || (want[i] = { cam: '', clip: FULLCLIP, opacity: null, show: true, filter: null }));

  const upOf = p => Math.atan2(-p.f * Math.cos(p.a), p.f * Math.sin(p.a));
  const fromUp = (o, s, up, f) => ({ o, s, a: up + f * PI / 2, f });
  function transCtx(A, B, u, T) {
    const rA = A._rOut, rB = B._rIn;
    const camA = A._camWant || MI;
    const LA = mmul(camA, ctmTo(rA.el, A.cam, [rA.outer]));
    const LB = ctmTo(rB.el, B.cam, [rB.outer]);
    const pA = poseOf(LA), pB = poseOf(LB);
    if (T.poseA) T.poseA(pA, u); if (T.poseB) T.poseB(pB, u);
    const upA = upOf(pA), upB = upOf(pB);
    let C = MI, P, w = 0;
    if (T.align === 'cam') {
      w = u <= T.hold ? 1 : u >= T.blend ? 0 : 1 - eio((u - T.hold) / (T.blend - T.hold));
      // 校正：把 B 的鹈鹕对到 A 的鹈鹕上（着地点、缩放、竖直方向），再逐渐放回 B 自己的构图
      const k = Math.pow(pA.s / pB.s, w), th = angD(upB, upA) * w;
      const o = [lerp(pB.o[0], pA.o[0], w), lerp(pB.o[1], pA.o[1], w)];
      const c = Math.cos(th) * k, s = Math.sin(th) * k;
      C = [c, s, -s, c, o[0] - (c * pB.o[0] - s * pB.o[1]), o[1] - (s * pB.o[0] + c * pB.o[1])];
      P = { o, s: pB.s * k, a: pB.a + th, f: pB.f };
    } else if (T.align === 'move') {
      const m = T.moveEase ? T.moveEase(inv(T.move[0], T.move[1], u)) : eio(inv(T.move[0], T.move[1], u));
      const up = upA + angD(upA, upB) * m;
      P = fromUp([lerp(pA.o[0], pB.o[0], m), lerp(pA.o[1], pB.o[1], m)], pA.s * Math.pow(pB.s / pA.s, m), up, pB.f);
      if (T.movePath) T.movePath(P, pA, pB, m, u);
    } else P = pB;
    const PA2 = fromUp(P.o, P.s, upOf(P), pA.f);         // 旧画法的鹈鹕保持自己的朝向
    return { u, A, B, T, LA, LB, pA, pB, P, C, w, Pm: canon(P), PAm: canon(PA2), o: P.o, camA };
  }

  function render(t) {
    t = clamp(t, 0, TOTAL - 1e-4);
    let k = 0;
    while (k < segs.length - 1 && t >= segs[k + 1].start) k++;
    const act = new Set([k]);
    let A = null, B = null, T = null;
    if (k > 0) { const a = segs[k - 1]; ensureBuilt(a); const T0 = transOf(a); if (t < segs[k].start + T0.post) { act.add(k - 1); A = a; B = segs[k]; T = T0; } }
    want = {};
    act.forEach(i => { ensureBuilt(segs[i]); W(i); segs[i]._camWant = MI; });
    act.forEach(i => { const s = segs[i]; s.update(t - s.start); });
    // 鹈鹕包装层的默认状态
    const rst = new Map();
    act.forEach(i => { for (const rw of segs[i]._rws) rst.set(rw, { op: 1, T: null, clip: null }); });
    let camBump = 0, ctx = null, brOn = false;
    if (A) {
      const u = t - B.start;
      camBump = bump(u - 0.06, 0.32);
      if (T.camA) { const m = T.camA.call(A, u); if (m) { A._camWant = m; W(A.index).cam = mstr(m); } }
      ctx = transCtx(A, B, u, T);
      window._lastCtx = ctx;
      if (T.align === 'cam') { W(B.index).cam = mstr(ctx.C); B._camWant = ctx.C; }
      if (T.camB) { const m = T.camB.call(A, u, ctx); if (m) { B._camWant = m; W(B.index).cam = mstr(m); } }
      // B 的出现方式
      const rv = T.reveal ? T.reveal.call(A, u, ctx) : 'full';
      W(B.index).clip = rv === 'full' ? FULLCLIP : !rv ? NOCLIP : rv[0] === '!' ? 'path(evenodd, "' + rv.slice(1) + '") view-box' : 'path("' + rv + '") view-box';
      if (T.fadeB) W(B.index).opacity = f2(clamp(T.fadeB.call(A, u, ctx)));
      if (T.fadeA) W(A.index).opacity = f2(clamp(T.fadeA.call(A, u, ctx)));
      if (u >= T.hideA) W(A.index).show = false;
      if (T.filterA) W(A.index).filter = T.filterA.call(A, u, ctx) || null;
      if (T.filterB) W(B.index).filter = T.filterB.call(A, u, ctx) || null;
      // 鹈鹕：A 的鹈鹕交给覆盖层（显示在 P），B 的鹈鹕先藏起来，到点后扫过换成新画法
      const rA = A._rOut, rB = B._rIn;
      if (rst.has(rA)) rst.get(rA).op = 0;
      const pe = T.pel, kw = inv(pe.at, pe.at + pe.dur, u);
      const CB = B._camWant || MI;
      const DA = mmul(ctx.PAm, minv(canon(ctx.pA)));
      const DB = mmul(ctx.Pm, minv(mmul(CB, canon(ctx.pB))));
      const G = mmul(CB, ctmTo(rB.outer.parentNode, B.cam));
      const isI = m => Math.abs(m[0] - 1) + Math.abs(m[1]) + Math.abs(m[2]) + Math.abs(m[3] - 1) + Math.abs(m[4]) + Math.abs(m[5]) < 1e-3;
      const TB = isI(DB) ? null : mmul(minv(G), mmul(DB, G));
      const stB = rst.get(rB);
      stB.T = TB ? mstr(TB) : null;
      const wipe = pe.wipe;
      if (kw <= 0) { stB.op = 0; brOn = true; setD(brOld, true); setClipCss(brOld, ''); }
      else if (kw < 1 && wipe === 'fade') {
        brOn = true; setD(brOld, true); setClipCss(brOld, ''); stB.op = eio(kw);
      }
      else if (kw < 1) {
        brOn = true; setD(brOld, true);
        const wp = typeof wipe === 'function' ? wipe(kw, ctx) : wipePolys(wipe, kw, pe.edge, A.index);
        setClipCss(brOld, 'path(evenodd, "' + polyD(wp.old, ctx.Pm) + '")');
        const invIn = minv(TB ? mmul(G, TB) : G);
        brClipBP.setAttribute('d', polyD(wp.nw, mmul(invIn, ctx.Pm)));
        stB.clip = 'url(#brClipB)';
      }
      if (pe.newOpacity) stB.op = stB.op * clamp(pe.newOpacity(u, ctx));
      if (brOn) {
        setA(brUse, 'href', '#' + rA.el.id);
        const GA = mmul(A._camWant || MI, ctmTo(rA.el.parentNode, A.cam, [rA.outer]));
        setA(brUse, 'transform', mstr(mmul(DA, GA)));
        const oo = (pe.oldOpacity ? clamp(pe.oldOpacity(u, ctx)) : 1) * (wipe === 'fade' && kw > 0 ? 1 - eio(kw) : 1);
        setA(brOld, 'opacity', oo < 1 ? f2(oo) : null);
        setA(brOld, 'filter', pe.oldFilter ? pe.oldFilter(u, ctx) : null);
      }
    }
    if (!brOn) setD(brOld, false);
    // 包装层状态落到 DOM
    rst.forEach((st, rw) => { setA(rw.outer, 'opacity', st.op >= 1 ? null : f2(st.op)); setA(rw.outer, 'transform', st.T); setA(rw.inner, 'clip-path', st.clip); });
    segs.forEach((s, i) => {
      const w = want[i];
      setV(s.wrap, !!(w && w.show));
      // 隐藏的版块保持原样不动：改变其缩放会触发整段文字重新排版
      if (!w || !w.show) return;
      setClipCss(s.wrap, w.clip); setA(s.wrap, 'opacity', w.opacity); setA(s.wrap, 'filter', w.filter); setA(s.cam, 'transform', w.cam || null);
    });
    // 转场特效层（可以在强拍前就开始）
    segs.forEach((s, i) => {
      const T2 = s.trans; if (!T2) return;
      const nb = segs[i + 1]; if (!nb) return;
      const u = t - nb.start;
      for (const [fx, g] of [[T2.fx, s.fxG], [T2.fx2, s.fxG2]]) {
        if (!fx || !g) continue;
        const w = fx.win || [0, 1.2];
        const on = u >= w[0] && u <= w[1] && (s === A || (u < 0 && i === k));
        setD(g, on);
        if (on) fx.update.call(s, u, s === A ? ctx : preCtx(s, u));
      }
    });
    // 转场时镜头轻推：用根元素的 CSS 变换（不改变 SVG 内部的缩放，避免全部文字重新排版）
    const bz = 'scale(' + (1 + 0.035 * (camBump > 0.002 ? camBump : 0)).toFixed(4) + ')';
    if (svg._bz !== bz) { svg._bz = bz; svg.style.transform = bz; }
    curSeg = k;
  }
  // 强拍之前的特效只需要 A 的鹈鹕位置
  function preCtx(A, u) { const rA = A._rOut; const LA = ctmTo(rA.el, A.cam, [rA.outer]); const pA = poseOf(LA); return { u, A, pA, P: pA, Pm: canon(pA), PAm: canon(pA), o: pA.o, pre: true }; }
  window.renderAt = render;
  window.ensureSeg = ensureBuilt;
  window.setAttrCached = setA;
  let curSeg = 0;

  /* ---------- 播放控制 ---------- */
  const playBtn = document.getElementById('play'), playIcon = document.getElementById('playicon');
  const secName = document.getElementById('secname'), timeEl = document.getElementById('time');
  const track = document.getElementById('track'), bar = document.getElementById('bar'), fill = document.getElementById('fill'), knob = document.getElementById('knob'), tip = document.getElementById('tip');
  const controls = document.getElementById('controls'), start = document.getElementById('start'), info = document.getElementById('info');
  const astate = document.getElementById('audiostate');
  const SEGCOL = ['#f4efe2', '#d7261e', '#1b2552', '#4a9ad8', '#8fd0ff', '#f5a9c4', '#ffb3d9', '#c040ff', '#59b7f0', '#3aa0ff', '#b89060', '#f2c200', '#2058b0', '#555', '#2a4f8a', '#e8d8b0', '#7a9a50', '#ff2a2a', '#e86a20', '#40c040', '#ff2bd6', '#ff8ad8', '#20ffe0', '#f4efe2'];
  segs.forEach((s, i) => { const e = document.createElement('i'); e.style.width = (s.dur / TOTAL * 100) + '%'; e.style.background = SEGCOL[i] || '#888'; bar.appendChild(e); });

  let playing = false, tNow = 0, tStart = 0, clk0 = 0, useAudioClock = false, exporting = false, dirty = true;
  const fmt = x => { x = Math.max(0, x); const m = Math.floor(x / 60), s = Math.floor(x % 60); return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0'); };
  function segLabel(i) {
    const s = segs[i];
    if (i === 0) return '<span class="no">片头</span><b>一条指令</b><span class="en">PROLOGUE · THE PROMPT</span>';
    if (i === segs.length - 1) return '<span class="no">片尾</span><b>冲线</b><span class="en">EPILOGUE · PHOTO FINISH</span>';
    return `<span class="no">No.${String(i).padStart(2, '0')}</span><b>${s.zh}</b><span class="en">${s.en}</span>`;
  }
  let lastLabel = -1;
  function ui() {
    const p = tNow / TOTAL * 100;
    fill.style.width = p + '%'; knob.style.left = p + '%';
    timeEl.textContent = fmt(tNow) + ' / ' + fmt(TOTAL);
    if (curSeg !== lastLabel) { secName.innerHTML = segLabel(curSeg); lastLabel = curSeg; }
    playIcon.innerHTML = playing ? '<path d="M3 1.5h3.6v13H3zM9.4 1.5H13v13H9.4z" fill="currentColor"/>' : '<path d="M3 1.5v13l11-6.5z" fill="currentColor"/>';
  }
  function clockNow() {
    if (!playing) return tNow;
    if (useAudioClock && AUDIO.ctx) return tStart + (AUDIO.ctx.currentTime - clk0);
    return tStart + (performance.now() / 1000 - clk0);
  }
  async function play() {
    if (playing) return;
    if (tNow >= TOTAL - 0.05) tNow = 0;
    playing = true; start.style.display = 'none';
    tStart = tNow;
    const ok = await AUDIO.start(tNow);
    useAudioClock = !!ok;
    clk0 = useAudioClock ? AUDIO.ctx.currentTime : performance.now() / 1000;
    if (useAudioClock) clk0 = AUDIO.t0ctx;
    ui(); poke();
  }
  function pause() {
    if (!playing) return;
    tNow = clockNow(); playing = false; AUDIO.stop(); ui(); dirty = true; poke();
  }
  function seek(t) {
    tNow = clamp(t, 0, TOTAL);
    if (playing) { playing = false; AUDIO.stop(); play(); }
    dirty = true; render(tNow); ui();
  }
  window.player = { play, pause, seek, get t() { return tNow; } };
  playBtn.onclick = () => playing ? pause() : play();
  start.onclick = () => play();
  document.getElementById('infobtn').onclick = () => info.classList.toggle('on');
  document.getElementById('infox').onclick = () => info.classList.remove('on');
  // 进度条拖动
  let dragging = false;
  const posT = e => { const r = track.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * TOTAL; };
  track.addEventListener('pointerdown', e => { dragging = true; track.setPointerCapture(e.pointerId); seek(posT(e)); });
  track.addEventListener('pointermove', e => {
    const tt = posT(e); const r = track.getBoundingClientRect();
    let k = 0; while (k < segs.length - 1 && tt >= segs[k + 1].start) k++;
    tip.style.left = ((e.clientX - r.left)) + 'px';
    tip.textContent = fmt(tt) + '  ' + (k === 0 ? '片头' : k === segs.length - 1 ? '片尾' : `No.${String(k).padStart(2, '0')} ${segs[k].zh}`);
    if (dragging) seek(tt);
  });
  track.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('keydown', e => {
    if (exporting) return;
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    else if (e.code === 'ArrowRight') seek(clockNow() + 5);
    else if (e.code === 'ArrowLeft') seek(clockNow() - 5);
    else if (e.key === ']') { const k = Math.min(curSeg + 1, segs.length - 1); seek(segs[k].start); }
    else if (e.key === '[') { const t = clockNow(); let k = curSeg; if (t - segs[k].start < 1 && k > 0) k--; seek(segs[k].start); }
  });
  // 自动隐藏控制条
  let idleT = 0;
  function poke() { controls.classList.remove('hide'); clearTimeout(idleT); idleT = setTimeout(() => { if (playing && !dragging && !controls.matches(':hover')) controls.classList.add('hide'); }, 2200); }
  window.addEventListener('mousemove', poke);
  document.addEventListener('mouseleave', () => { if (playing) controls.classList.add('hide'); });

  AUDIO.onProgress = (done, total) => {
    astate.textContent = done < total ? `配乐合成中 ${Math.round(done / total * 100)}%` : '';
    const m = document.getElementById('startmeta');
    if (m) m.textContent = done < total ? `正在合成配乐… ${Math.round(done / total * 100)}%（可以先播放）` : 'SVG 动画短片 · 配乐全部由程序实时合成 · 空格键播放';
  };

  function loop() {
    if (!exporting) {
      if (playing) {
        tNow = clockNow();
        if (tNow >= TOTAL) { tNow = TOTAL; render(TOTAL); pause(); }
        else render(tNow);
        ui();
      } else if (dirty) { render(tNow); ui(); dirty = false; }
    }
    requestAnimationFrame(loop);
  }

  /* ---------- 导出接口 ---------- */
  let exFps = 60;
  const paint = () => new Promise(res => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    requestAnimationFrame(() => requestAnimationFrame(fin));
    setTimeout(fin, 120);
  });
  window.videoExport = {
    runs: ['film'],
    async begin(name, opts) {
      exFps = (opts && opts.fps) || 60;
      if (playing) pause();
      exporting = true; document.body.classList.add('exporting'); info.classList.remove('on');
      try { await document.fonts.ready; } catch (e) { }
      tNow = 0; render(0); await paint();
      return { frames: Math.round(TOTAL * exFps) };
    },
    async frame(i) {
      const t = i / exFps;
      render(t); tNow = t;
      await paint();
    },
    async audio() { return await AUDIO.wav(); },
    end() { exporting = false; document.body.classList.remove('exporting'); tNow = 0; dirty = true; render(0); ui(); }
  };

  // 预构建全部场景（分批，避免卡住首帧）
  render(0); ui();
  requestAnimationFrame(loop);
  let bi = 0;
  function prebuild() { const t0 = performance.now(); while (bi < segs.length && performance.now() - t0 < 30) { ensureBuilt(segs[bi]); bi++; } if (bi < segs.length) setTimeout(prebuild, 0); else setTimeout(warm, 30); }
  // 预热：每个版块先在后台画一帧（字体、图案、滤镜的首次光栅化放在开场卡片停留时完成）
  let wi = 0; const WT = [];
  function warm() {
    if (playing || exporting) { document.body.classList.remove('warming'); return; }
    if (wi === 0) document.body.classList.add('warming');
    if (!WT.length) segs.forEach((s, i) => { WT.push(s.start + Math.min(2.5, s.dur / 2)); if (i > 0) WT.push(s.start + .12, s.start + .7, s.start + 1.3); });
    if (wi < WT.length) { render(WT[wi++]); requestAnimationFrame(() => setTimeout(warm, 0)); }
    else { dirty = true; render(tNow); document.body.classList.remove('warming'); }
  }
  setTimeout(prebuild, 50);
  AUDIO.init();
})();
