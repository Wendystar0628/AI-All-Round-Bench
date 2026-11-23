/* demo.js — 默认示例「锻字」：全部由编辑器的图层、节点、关键帧、表达式、材质与模拟设置构成 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, G = AE.G, Model = AE.Model, Nodes = AE.Nodes;
  const D = AE.Demo = {};
  D.CHAR = '金';
  const DEG = U.DEG;

  // 关键帧工具：list 项 [t, v, 进入, 离开]；规格：'L' 线性 'H' 定格(仅离开) 'E' 缓入缓出 'S' 强缓动 [x,y] 自定义贝塞尔
  const spec = (k, which, s) => {
    if (s === undefined || s === 'L') { k[which === 'in' ? 'ii' : 'oi'] = 'linear'; return; }
    if (s === 'H') { k.oi = 'hold'; return; }
    const pair = s === 'E' ? [1 / 3, 0] : s === 'S' ? [0.62, 0] : s === 'F' ? [0.01, 0.55] : s === 'M' ? [0.5, 0.1] : s;
    if (which === 'in') { k.ii = 'bezier'; k.ie = { x: pair[0], y: pair[1] }; } else { k.oi = 'bezier'; k.oe = { x: pair[0], y: pair[1] }; }
  };
  const keys = (L, key, list, sm) => {
    const p = L.props[key]; const info = Model.propInfo(L, key); p.k = list.map(it => { const k = Model.defKey(it[0], Array.isArray(it[1]) ? it[1].slice() : it[1], info.spatial); if (sm && info.spatial) k.sm = sm; spec(k, 'in', it[2]); spec(k, 'out', it[3]); return k; }); Model.normalizeProp(p, info);
  };
  D.keys = keys;

  D.build = (opts = {}) => {
    const ch = opts.char || D.CHAR;
    const p = Model.newProject(); p.name = '锻字 · 示例工程';
    const c = p.comps[0]; c.name = '锻字'; c.w = 1920; c.h = 1080; c.fps = 30; c.dur = 15; c.work = [0, 15]; c.bg = [0.045, 0.05, 0.065]; c.mb = { on: true, angle: 180, phase: -90, samples: 10 };
    const mk = (type, name, o) => { const L = Model.newLayer(type, c, Object.assign({ name, out: 15 }, o || {})); c.layers.push(L); return L; };
    const TABLE = 640, DEPTH = 90, SIZE = 520, CZ = 300;
    const world = (lx, ly) => [960 + lx, TABLE - DEPTH, CZ - ly];

    // ---------- 控制器（跨图层表达式的驱动源）----------
    const ctl = mk('null', '控制器'); ctl.props['transform.anchor'].v = [0, 0, 0];
    const hits = [{ t: 6.85, lx: 0, ly: 83, amp: 0.55, th: -62 }, { t: 7.75, lx: -125, ly: 104, amp: 0.65 }, { t: 8.6, lx: 146, ly: 208, amp: 0.8 }, { t: 10.0, lx: 0, ly: -21, amp: 1.0 }];
    // 块厚(位置X) 温度(旋转) 冲击(不透明度)
    keys(ctl, 'transform.position', [[0, [0.5, 0, 0]], [3.4, [0.5, 0, 0], 'L', 'L'], [4.6, [DEPTH, 0, 0], 'E', 'L']], 'lin');
    keys(ctl, 'transform.rotation', [[0, 0], [3.5, 0, 'L', 'E'], [4.7, 100, 'E', 'L'], [10.9, 100, 'L', 'E'], [14.6, 0, 'E', 'L']]);
    const imp = []; imp.push([0, 0]); for (const h of hits) { imp.push([h.t - 0.034, 0, 'L', 'L'], [h.t, 100 * h.amp, 'L', 'L'], [h.t + 0.22, 0, 'L', 'L']); } keys(ctl, 'transform.opacity', imp);

    // ---------- 源文字（隐藏，作为几何/笔画的来源）----------
    const T = mk('text', '字'); T.text.text = ch; T.visible = false; T.props['text.size'].v = SIZE; T.props['transform.position'].v = [960, 540, 0];

    // ---------- 节点图 ----------
    const N = (t, x, y, data) => Nodes.create(p, t, x, y, data);
    const nThick = N('val.num', 20, 330); nThick.name = '块厚'; nThick.props.value.v = DEPTH; nThick.props.value.x = 'thisComp.layer("控制器").transform.position[0]';
    const nSrc = N('src.text', 20, 40, { layer: T.id, center: false }); nSrc.name = '文字源';
    const nTess = N('tess', 250, 40); nTess.props.spacing.v = 12; nTess.name = '三角网格化';
    const nPin = N('pin', 480, 40); nPin.name = '图钉变形'; nPin.props.radius.v = 70; nPin.props.power.v = 1.4; nPin.props.hold.v = 0;
    const nExt = N('extrude', 710, 40); nExt.props.bevel.v = 7; nExt.props.bevelSeg.v = 2; nExt.props.depthSeg.v = 4; nExt.name = '挤出';
    const nDef = N('fielddeform', 940, 40, { mode: 'normal' }); nDef.name = '场变形（凹痕）'; nDef.props.strength.v = 1;
    const nBend = N('bend', 1170, 40, { axis: 'x' }); nBend.name = '弯曲'; nBend.props.angle.v = 0;
    const nOut = N('output', 1400, 40); nOut.name = '显示：金块';
    Nodes.link(p, nTess, 'in', nSrc); Nodes.link(p, nPin, 'in', nTess); Nodes.link(p, nExt, 'in', nPin); Nodes.link(p, nExt, 'depth', nThick); Nodes.link(p, nDef, 'in', nExt); Nodes.link(p, nBend, 'in', nDef); Nodes.link(p, nOut, 'in', nBend);
    // 图钉：四角锚定 + 四个受击点
    const half = SIZE * 0.5;
    for (const [x, y] of [[-half, -half], [half, -half], [-half, half], [half, half]]) Nodes.addPin(nPin, [x, y]);
    const hitPins = hits.map(h => Nodes.addPin(nPin, [h.lx, h.ly]));
    hits.forEach((h, i) => { const id = hitPins[i]; keys(nPin, `pin.${id}.scale`, [[0, 100], [h.t - 0.02, 100, 'L', 'L'], [h.t + 0.04, 100 + 20 * h.amp, 'L', 'E'], [h.t + 0.5, 100 + 7 * h.amp, 'E', 'L']]); keys(nPin, `pin.${id}.rot`, [[0, 0], [h.t - 0.02, 0, 'L', 'L'], [h.t + 0.5, (i % 2 ? -1 : 1) * 3 * h.amp, 'E', 'L']]); });
    // 四个凹痕场（固定在受击位置，强度关键帧：撞击瞬间下陷后留下残余），混合后驱动顶点
    const dents = hits.map((h, i) => { const nd = N('field.falloff', 230 * i + 20, 560); nd.name = '凹痕场 ' + (i + 1); const w = world(h.lx, h.ly); nd.props.pos.v = w; nd.props.radius.v = 130 + 40 * h.amp; nd.props.power.v = 1.6; keys(nd, 'strength', [[0, 0], [h.t - 0.02, 0, 'L', 'L'], [h.t + 0.035, -46 * h.amp, 'L', 'E'], [h.t + 0.4, -17 * h.amp, 'E', 'L']]); return nd; });
    let mix = dents[0]; const mixes = []; for (let i = 1; i < dents.length; i++) { const mn = N('field.mix', 230 * i + 120, 440, { op: 'add' }); mn.name = '场混合 ' + i; Nodes.link(p, mn, 'a', mix); Nodes.link(p, mn, 'b', dents[i]); mix = mn; mixes.push(mn); }
    Nodes.link(p, nDef, 'field', mix);
    // 弯曲：高潮一击时略微弯折
    keys(nBend, 'angle', [[0, 0], [hits[3].t - 0.02, 0, 'L', 'L'], [hits[3].t + 0.05, 3.4, 'L', 'E'], [hits[3].t + 0.6, 1.1, 'E', 'L']]);
    // 冲击点（空对象：位置在各受击点之间跳变）与冲击场
    const spot = mk('null', '冲击点'); spot.is3D = true; spot.props['transform.anchor'].v = [0, 0, 0];
    { const list = []; hits.forEach((h, i) => { const w = world(h.lx, h.ly); list.push([h.t - 0.4, w, 'L', 'H']); }); keys(spot, 'transform.position', list, 'lin'); }
    const blast = N('field.falloff', 20, 760); blast.name = '冲击场'; blast.data.follow = spot.id; blast.props.pos.v = [0, 0, 0]; blast.props.radius.v = 230; blast.props.power.v = 1.0;
    { const l = [[0, 0]]; for (const h of hits) l.push([h.t - 0.03, 0, 'L', 'L'], [h.t, 1, 'L', 'L'], [h.t + 0.3, 0, 'L', 'L']); keys(blast, 'strength', l); }
    const nEm = N('emitter', 1630, 40, { part: 'front', space: null }); nEm.name = '火星发射源'; Nodes.link(p, nEm, 'in', nOut);
    const nCol = N('collider', 1630, 200, { space: null }); nCol.name = '字块碰撞体'; nCol.props.bounce.v = 0.38; nCol.props.friction.v = 0.35; Nodes.link(p, nCol, 'in', nOut);

    // ---------- 背景与氛围 ----------
    const bg = mk('shape', '背景'); bg.is3D = false; { const g = Model.addShapeItem(bg, 'group', null, { name: '渐变' }); Model.addShapeItem(bg, 'rect', g, { params: { size: [1980, 1140] } }); const f = Model.addShapeItem(bg, 'fill', g, {}); f.gradient = { type: 'radial', p0: [0, -60], p1: [1250, -60], stops: [[0, [0.15, 0.13, 0.15, 1]], [0.55, [0.06, 0.065, 0.085, 1]], [1, [0.02, 0.022, 0.03, 1]]] }; bg.props['transform.position'].v = [960, 540, 0]; }
    const glowBg = mk('shape', '炉火辉光'); { const g = Model.addShapeItem(glowBg, 'group', null, { name: '辉光' }); Model.addShapeItem(glowBg, 'ellipse', g, { params: { size: [2200, 900] } }); const f = Model.addShapeItem(glowBg, 'fill', g, {}); f.gradient = { type: 'radial', p0: [0, 0], p1: [1100, 0], stops: [[0, [1, 0.42, 0.12, 0.85]], [0.5, [0.8, 0.22, 0.05, 0.28]], [1, [0.2, 0.05, 0.02, 0]]] }; glowBg.props['transform.position'].v = [960, 760, 0]; glowBg.blend = 'add'; glowBg.props['transform.opacity'].x = 'linear(thisComp.layer("控制器").transform.rotation, 0, 100, 0, 38)'; }

    // ---------- 地面（铁砧台面）----------
    const nFl = N('prim.rect', 20, 900); nFl.name = '台面轮廓'; nFl.props.size.v = [3400, 2200]; nFl.props.round.v = 30;
    const nFlX = N('extrude', 250, 900); nFlX.props.depth.v = 60; nFlX.props.bevel.v = 8; nFlX.props.bevelSeg.v = 2; nFlX.props.spacing.v = 160; nFlX.name = '台面挤出'; Nodes.link(p, nFlX, 'in', nFl);
    const nFlO = N('output', 480, 900); nFlO.name = '显示：台面'; Nodes.link(p, nFlO, 'in', nFlX);
    const floor = mk('geo', '铁砧台面'); floor.geo.node = nFlO.id; floor.geo.cast = false; floor.props['transform.rotX'].v = -90; floor.props['transform.position'].v = [960, TABLE, 300];
    floor.props['mat.base'].v = [0.16, 0.165, 0.19, 1]; floor.props['mat.metal'].v = 0.85; floor.props['mat.rough'].v = 0.42; floor.props['mat.emitI'].v = 0;
    // ---------- 金块 ----------
    const blk = mk('geo', '金块'); blk.geo.node = nOut.id; blk.props['transform.rotX'].v = -90; blk.props['transform.position'].v = [960, TABLE, CZ]; blk.props['transform.anchor'].v = [0, 0, DEPTH]; blk.props['transform.anchor'].x = '[0, 0, thisComp.layer("控制器").transform.position[0]]';
    blk.props['mat.base'].v = [0.78, 0.8, 0.84, 1]; blk.props['mat.metal'].v = 1; blk.props['mat.rough'].v = 0.3;
    blk.props['mat.emit'].x = 'var T = thisComp.layer("控制器").transform.rotation; [1, linear(T, 0, 100, 0.12, 0.6), linear(T, 0, 100, 0.01, 0.24), 1]';
    blk.props['mat.emitI'].x = 'var T = thisComp.layer("控制器").transform.rotation; var I = thisComp.layer("控制器").transform.opacity; linear(T, 0, 100, 0, 3.6) + I / 100 * 2.4';
    keys(blk, 'mat.rough', [[0, 0.3], [11, 0.3, 'L', 'E'], [14.6, 0.36, 'E', 'L']]);
    blk.in = 3.3;
    // ---------- 笔画（3D 平面，写成阶段）----------
    const stk = mk('shape', '笔画'); stk.is3D = true; stk.props['transform.rotX'].v = -90; stk.props['transform.position'].v = [960, TABLE - 1.2, CZ];
    { const g = Model.addShapeItem(stk, 'group', null, { name: '笔画' }); const gl = Model.addShapeItem(stk, 'glyphs', g, { name: '文字笔画', params: { size: 100 } }); gl.source = T.id; gl.mode = 'strokes'; const st = Model.addShapeItem(stk, 'stroke', g, { index: 1 }); stk.props[`sh.${st.id}.width`].v = Math.round(SIZE * 0.085); st.cap = 'butt'; st.join = 'miter'; stk.props[`sh.${st.id}.color`].v = [1, 0.74, 0.38, 1]; const tr = Model.addShapeItem(stk, 'trim', g, { index: 2 }); tr.mode = 'seq'; keys(stk, `sh.${tr.id}.end`, [[0.4, 0], [3.4, 100, 'E', 'E']]); }
    Model.addEffect(stk, 'glow', { threshold: 35, radius: 38, intensity: 1.5, tint: [1, 0.6, 0.25, 1] }); Model.addEffect(stk, 'glow', { threshold: 20, radius: 120, intensity: 0.8, tint: [1, 0.4, 0.12, 1] });
    keys(stk, 'transform.opacity', [[0, 100], [3.55, 100, 'L', 'E'], [4.35, 0, 'E', 'L']]); stk.out = 4.4;

    // ---------- 锤 ----------
    const swing = mk('null', '锤摆'); swing.is3D = true; swing.props['transform.anchor'].v = [0, 0, 0];
    const rest = -62; const baseY = TABLE - DEPTH - 690;
    { const rot = [], pos = []; let prev = null;
      rot.push([0, rest, 'L', 'E']); pos.push([0, [world(hits[0].lx, hits[0].ly)[0] + 520, baseY - 300, CZ - hits[0].ly], 'L', 'L']);
      hits.forEach((h, i) => {
        const w = world(h.lx, h.ly); const pre = i === 3 ? 0.62 : 0.34; const back = i === 3 ? -80 : -72;
        const startT = h.t - pre - 0.5; const px = w[0], pz = w[2];
        if (i === 0) { pos.push([h.t - 1.4, [px, baseY - 160, pz], 'E', 'E']); }
        rot.push([h.t - pre - 0.14, rest, 'E', 'E'], [h.t - pre, back, 'E', [0.6, 0]], [h.t, 0, [0.01, 0.55], 'L'], [h.t + 0.10, -15, 'L', 'E'], [h.t + 0.55, rest, 'E', 'E']);
        pos.push([h.t - pre - 0.15, [px, baseY - 160, pz], 'E', 'L'], [h.t - 0.01, [px, baseY, pz], 'L', 'L'], [h.t + 0.03, [px, baseY + 22 * h.amp + 6, pz], 'L', 'E'], [h.t + 0.2, [px, baseY - 40, pz], 'E', 'E']);
        if (i < 3) { const n = hits[i + 1]; const nw = world(n.lx, n.ly); const lead = (n.t - (n.t === hits[3].t ? 0.62 : 0.34)) - 0.15; pos.push([h.t + 0.5, [px, baseY - 150, pz], 'E', 'E']); pos.push([lead, [nw[0], baseY - 160, nw[2]], 'E', 'E']); }
      });
      rot.push([hits[3].t + 1.4, -64, 'E', 'E'], [hits[3].t + 2.2, -88, 'E', 'L']); pos.push([hits[3].t + 1.4, [world(hits[3].lx, hits[3].ly)[0] + 150, baseY - 220, CZ - hits[3].ly], 'E', 'E'], [hits[3].t + 2.4, [2300, baseY - 700, CZ - 100], 'E', 'L']);
      const rots = rot.sort((a, b) => a[0] - b[0]); const poss = pos.sort((a, b) => a[0] - b[0]);
      keys(swing, 'transform.rotation', rots); keys(swing, 'transform.position', poss, 'lin'); }
    swing.props['transform.rotation'].k.forEach(k => { }); swing.mb = true;
    const nH = N('prim.rect', 20, 1100); nH.name = '锤头轮廓'; nH.props.size.v = [250, 130]; nH.props.round.v = 10; const nHX = N('extrude', 250, 1100); nHX.props.depth.v = 150; nHX.props.bevel.v = 11; nHX.props.bevelSeg.v = 2; nHX.props.spacing.v = 22; nHX.name = '锤头挤出'; Nodes.link(p, nHX, 'in', nH); const nHO = N('output', 480, 1100); nHO.name = '显示：锤头'; Nodes.link(p, nHO, 'in', nHX);
    const nS = N('prim.rect', 20, 1260); nS.name = '锤柄轮廓'; nS.props.size.v = [40, 560]; nS.props.round.v = 6; const nSX = N('extrude', 250, 1260); nSX.props.depth.v = 40; nSX.props.bevel.v = 5; nSX.props.bevelSeg.v = 2; nSX.props.spacing.v = 40; nSX.name = '锤柄挤出'; Nodes.link(p, nSX, 'in', nS); const nSO = N('output', 480, 1260); nSO.name = '显示：锤柄'; Nodes.link(p, nSO, 'in', nSX);
    const head = mk('geo', '锤头'); head.geo.node = nHO.id; head.parent = swing.id; head.props['transform.anchor'].v = [0, 0, 75]; head.props['transform.position'].v = [0, 625, 0]; head.props['mat.base'].v = [0.34, 0.36, 0.4, 1]; head.props['mat.metal'].v = 1; head.props['mat.rough'].v = 0.38; head.mb = true; head.props['mat.emitI'].v = 0;
    head.props['mat.emit'].v = [1, 0.4, 0.1, 1]; head.props['mat.emitI'].x = 'thisComp.layer("控制器").transform.opacity / 100 * 0.35';
    const handle = mk('geo', '锤柄'); handle.geo.node = nSO.id; handle.parent = swing.id; handle.props['transform.anchor'].v = [0, 0, 20]; handle.props['transform.position'].v = [0, 280, 0]; handle.props['mat.base'].v = [0.34, 0.2, 0.1, 1]; handle.props['mat.metal'].v = 0; handle.props['mat.rough'].v = 0.62; handle.mb = true;
    swing.in = 5.2; head.in = 5.2; handle.in = 5.2;

    // ---------- 火星粒子 ----------
    const sp = mk('particles', '火星'); sp.props['transform.position'].v = [0, 0, 0]; sp.mb = true;
    { const ps = sp.ps; ps.seed = 11; ps.max = 3600; ps.blend = 'add'; ps.fieldGain = 1;
      const em = Model.addEmitter(sp, { name: '字块表面', speed: 430, spread: 66, rate: 0 }); const e = ps.emitters[0]; e.kind = 'node'; e.node = nEm.id; e.part = 'front'; e.field = blast.id; sp.props[`em.${em}.speedVar`].v = 60; sp.props[`em.${em}.size`].v = 1; sp.props[`em.${em}.inherit`].v = 1;
      const l = [[0, 0]]; hits.forEach(h => { l.push([h.t - 0.03, 0, 'L', 'L'], [h.t, 1500 * h.amp * h.amp + 500, 'L', 'E'], [h.t + 0.16, 220 * h.amp, 'E', 'L'], [h.t + 0.55, 0, 'L', 'L']); }); keys(sp, `em.${em}.rate`, l);
      Model.addForce(sp, 'field', { node: blast.id, strength: 900 }); Model.addForce(sp, 'turbulence', { strength: 360, radius: 150 });
      Model.addCollider(sp, { kind: 'node', node: nCol.id, name: '字块' }); Model.addCollider(sp, { kind: 'layer', layer: floor.id, name: '台面' });
      sp.props['ps.life'].v = 1.55; sp.props['ps.lifeVar'].v = 55; sp.props['ps.drag'].v = 0.28; sp.props['ps.gravity'].v = [0, 1500, 0]; sp.props['ps.sizeStart'].v = 6.2; sp.props['ps.sizeEnd'].v = 1.4;
      sp.props['ps.colorStart'].v = [1, 0.93, 0.62, 1]; sp.props['ps.colorEnd'].v = [1, 0.28, 0.05, 1]; sp.props['ps.bounce'].v = 0.42; sp.props['ps.friction'].v = 0.28; sp.props['ps.trailLen'].v = 11; sp.props['ps.trailW'].v = 3.2; sp.props['ps.trailFade'].v = 1; sp.props['ps.trailColor'].v = [1, 0.55, 0.15, 1]; sp.props['ps.hitColor'].v = [1, 1, 0.9, 1]; sp.props['ps.hitLife'].v = 1.1; sp.props['ps.subRate'].v = 2; }
    sp.in = 6.3; sp.out = 14.2;
    const dust = mk('particles', '浮尘'); dust.mb = false; { const ps = dust.ps; ps.seed = 3; ps.max = 500; ps.blend = 'add'; const em = Model.addEmitter(dust, { name: '漂浮火屑', pos: [960, 600, 280], speed: 14, spread: 180, rate: 22, dir: [0, -1, 0] }); ps.emitters[0].kind = 'point'; dust.props[`em.${em}.size`].v = 0.9; dust.props['ps.life'].v = 5.5; dust.props['ps.lifeVar'].v = 40; dust.props['ps.gravity'].v = [0, -22, 0]; dust.props['ps.drag'].v = 0.6; dust.props['ps.sizeStart'].v = 2.6; dust.props['ps.sizeEnd'].v = 1.4; dust.props['ps.colorStart'].v = [1, 0.62, 0.3, 1]; dust.props['ps.colorEnd'].v = [0.9, 0.25, 0.08, 1]; dust.props['ps.alphaStart'].v = 0.55; dust.props['ps.trailLen'].v = 0; Model.addForce(dust, 'turbulence', { strength: 40, radius: 260 }); dust.props[`em.${em}.pos`].v = [960, 640, 200]; dust.props[`em.${em}.rate`].v = 30; ps.emitters[0].kind = 'point'; dust.props['transform.position'].v = [0, 0, 0]; }
    Model.addCollider(dust, { kind: 'layer', layer: floor.id });

    // ---------- 灯光 ----------
    const key = mk('light', '主光', { lightType: 'dir' }); key.props['transform.position'].v = [260, -1000, -900]; key.props['light.target'].v = [960, 600, 300]; key.props['light.intensity'].v = 3.1; key.props['light.color'].v = [1, 0.9, 0.78, 1]; key.props['light.soft'].v = 2.2;
    const rim = mk('light', '轮廓光', { lightType: 'dir' }); rim.props['transform.position'].v = [2100, -500, 1500]; rim.props['light.target'].v = [960, 600, 300]; rim.props['light.intensity'].v = 1.7; rim.props['light.color'].v = [0.5, 0.72, 1, 1]; rim.light.shadow = false;
    const forge = mk('light', '炉火光', { lightType: 'point' }); forge.light.type = 'point'; forge.props['transform.position'].v = [960, 330, 250]; forge.props['light.color'].v = [1, 0.5, 0.17, 1]; forge.props['light.radius'].v = 1700; forge.props['light.soft'].v = 3; forge.props['light.intensity'].x = 'thisComp.layer("控制器").transform.rotation / 100 * 3.2 + thisComp.layer("控制器").transform.opacity / 100 * 3.6 + 0.15';

    // ---------- 摄像机 ----------
    const cam = mk('camera', '摄像机'); cam.cam.dof = true; cam.props['cam.fov'].v = 30; cam.props['cam.aperture'].v = 20; cam.props['cam.focus'].x = 'length(thisLayer.transform.position, thisLayer.cameraOption.pointOfInterest)';
    const path = [ // t, az, el, D, target
      [0, 0, 82, 2250, [960, 640, 300]], [3.4, 0, 81, 1950, [960, 640, 300]], [4.6, -8, 66, 1760, [960, 600, 300]], [6.1, -22, 48, 1530, [960, 580, 300]], [6.8, -23, 41, 1400, [960, 570, 292]],
      [8.5, -15, 36, 1290, [980, 568, 330]], [9.4, -11, 34, 1190, [960, 566, 300]], [10.0, -6, 30, 1020, [960, 566, 290]], [10.9, 6, 36, 1230, [960, 575, 300]], [12.4, 22, 44, 1560, [960, 585, 300]], [14.0, 30, 40, 1760, [960, 590, 300]], [15, 30, 40, 1760, [960, 590, 300]]];
    const posK = [], tgK = []; path.forEach(([t, az, el, Dd, tg], i) => { const a = az * DEG, e = el * DEG; const pos = [tg[0] + Dd * Math.cos(e) * Math.sin(a), tg[1] - Dd * Math.sin(e), tg[2] - Dd * Math.cos(e) * Math.cos(a)]; const m = (i === 0 || i === path.length - 1) ? 'E' : 'E'; posK.push([t, pos, m, m]); tgK.push([t, tg, m, m]); });
    keys(cam, 'transform.position', posK); keys(cam, 'cam.target', tgK, 'lin');
    cam.props['cam.target'].x = 'var imp = thisComp.layer("控制器").transform.opacity; wiggle(24, 0.26 * imp)';
    cam.mb = true;

    // ---------- 后期 ----------
    const flash = mk('shape', '撞击闪光'); { const g = Model.addShapeItem(flash, 'group', null, { name: '闪光' }); Model.addShapeItem(flash, 'rect', g, { params: { size: [1980, 1140] } }); const f = Model.addShapeItem(flash, 'fill', g, { params: { color: [1, 0.9, 0.7, 1] } }); flash.props['transform.position'].v = [960, 540, 0]; flash.blend = 'add'; flash.props['transform.opacity'].x = 'thisComp.layer("控制器").transform.opacity * 0.2'; }
    const vig = mk('shape', '暗角'); { const g = Model.addShapeItem(vig, 'group', null, { name: '暗角' }); Model.addShapeItem(vig, 'rect', g, { params: { size: [1980, 1140] } }); const f = Model.addShapeItem(vig, 'fill', g, {}); f.gradient = { type: 'radial', p0: [0, 0], p1: [1150, 0], stops: [[0, [0, 0, 0, 0]], [0.55, [0, 0, 0, 0.12]], [1, [0, 0, 0, 0.72]]] }; vig.props['transform.position'].v = [960, 540, 0]; }
    const adj = mk('adjust', '辉光与调色'); Model.addEffect(adj, 'glow', { threshold: 62, radius: 70, intensity: 0.85, tint: [1, 0.82, 0.62, 1] }); Model.addEffect(adj, 'hsl', { hue: 0, sat: 6, light: 0 });

    // ---------- 声音 ----------
    const au = (name, voice, events, params, level) => { const L = mk('audio', name); L.au.voice = voice; L.au.events = events; L.au.params = params || {}; if (level !== undefined) L.props['au.level'].v = level; return L; };
    const strokeT = []; for (let i = 0; i < 8; i++) strokeT.push({ t: 0.4 + i * 0.375, v: 0.7 + (i % 3) * 0.1, p: 0.9 + (i % 4) * 0.08 });
    au('炉火低鸣', 'drone', [{ t: 0, v: 1, p: 1 }], { len: 15, swell: 4.5, freq: 46, rumble: 0.7 }, -9).props['au.level'].k = [Model.defKey(0, -9), Model.defKey(13.2, -9), Model.defKey(15, -30)];
    au('笔画沙沙', 'scribe', strokeT, { len: 0.3 }, -12);
    au('点燃', 'rise', [{ t: 3.2, v: 1, p: 1 }], { len: 1.4, f0: 120, f1: 1100 }, -14);
    au('蓄势', 'rise', hits.map(h => ({ t: h.t - (h === hits[3] ? 0.85 : 0.5), v: h === hits[3] ? 1.1 : 0.6, p: 1 })), { len: 0.5, f0: 160, f1: 700, noise: 0.35 }, -17);
    au('锤击', 'anvil', hits.map((h, i) => ({ t: h.t, v: 0.5 + 0.5 * h.amp, p: i === 3 ? 0.72 : 0.96 + i * 0.03 })), { ring: 1.7, thump: 1.2 }, -5);
    au('火星迸溅', 'sparkle', hits.map(h => ({ t: h.t + 0.01, v: 0.5 + 0.7 * h.amp, p: 1 })), { count: 34, span: 1.1 }, -14);
    au('淬火', 'hiss', [{ t: 11.3, v: 1, p: 1 }], { len: 3 }, -16);
    au('定音', 'bell', [{ t: 12.7, v: 0.9, p: 1 }], { base: 196, decay: 3.6 }, -13);

    // ---------- 工程状态 ----------
    // 图层自上而下：后期、特效、粒子、锤、金块、笔画、台面、灯光/相机、文字、控制器、背景…
    const order = ['辉光与调色', '暗角', '撞击闪光', '火星', '浮尘', '锤头', '锤柄', '锤摆', '金块', '笔画', '铁砧台面', '字', '冲击点', '控制器', '炉火光', '轮廓光', '主光', '摄像机', '炉火辉光', '背景', '炉火低鸣', '笔画沙沙', '点燃', '蓄势', '锤击', '火星迸溅', '淬火', '定音'];
    c.layers.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    // 文字层的颜色/标签
    for (const L of c.layers) { if (L.type === 'audio') L.label = 3; }
    p.active = c.id; p.demo = true;
    return p;
  };
  // 打开示例后默认选中并展开的内容
  D.prepareUI = (App) => {
    const L = App.comp.layers.find(l => l.name === '金块'); if (!L) return;
    App.sel.layers = [L.id]; AE.Timeline.open.add('L:' + L.id); AE.Timeline.open.add('L:' + L.id + ':material'); AE.Timeline.open.add('L:' + L.id + ':transform');
    const H = App.comp.layers.find(l => l.name === '控制器'); if (H) { AE.Timeline.open.add('L:' + H.id); AE.Timeline.open.add('L:' + H.id + ':transform'); }
    App.emit('select'); App.emit('struct');
  };
})();
