/* ============================================================
   demo.js — 「锻字」15 秒示例工程
   四个阶段：写成 → 成块 → 锻打 → 冷却
   全部由图层、节点、关键帧、表达式、材质与模拟设置生成
   ============================================================ */
(function (global) {
  'use strict';
  const M = MODEL;

  function K(prop, t, v, ease) { M.setKey(prop, t, v, ease); return prop; }
  function E(prop, expr) { prop.expr = expr; prop.exprOn = true; return prop; }
  function mk(type, name, comp) { return M.createLayer(comp, type, name); }
  function add(comp, L) { M.addLayer(comp, L); return L; }

  function build() {
    const P = M.newProject();
    P.name = '锻字 · 示例工程';
    const comp = M.createComp('锻字', 1920, 1080, 30, 15);
    comp.bgColor = '#0a0b10';
    comp.bgColor2 = '#04050a';
    comp.workArea = [0, 15];
    comp.mb = { on: true, shutter: 180, phase: 0, samples: 5 };
    P.comps[comp.id] = comp;
    P.order.push(comp.id);
    P.activeCompId = comp.id;

    /* ================= 节点图 ================= */
    const NG = comp.nodes;
    const nText = { id: 'n_text', type: 'text', x: 40, y: 40, params: { text: '锻', font: 'Microsoft YaHei', size: 420 } };
    const nExt = { id: 'n_ext', type: 'extrude', x: 250, y: 40, params: { depth: 92, bevel: 7, segs: 3 } };
    const nOut = { id: 'n_out', type: 'output', x: 460, y: 40, params: {} };
    const nCyl = { id: 'n_cyl', type: 'cylinder', x: 40, y: 210, params: { r: 17, h: 300, seg: 28 } };
    const nTr1 = { id: 'n_tr1', type: 'transform', x: 250, y: 210, params: { x: 0, y: 150, z: 0, rot: 0, scale: 100 } };
    const nBox = { id: 'n_box', type: 'box', x: 40, y: 350, params: { w: 170, h: 96, d: 96 } };
    const nTr2 = { id: 'n_tr2', type: 'transform', x: 250, y: 350, params: { x: 0, y: 330, z: 0, rot: 0, scale: 100 } };
    const nMerge = { id: 'n_merge', type: 'merge', x: 470, y: 280, params: {} };
    const nOut2 = { id: 'n_out2', type: 'output', x: 680, y: 280, params: {} };
    const nAnvil = { id: 'n_anvil', type: 'box', x: 40, y: 520, params: { w: 980, h: 160, d: 720 } };
    const nAnvilTr = { id: 'n_anvil_tr', type: 'transform', x: 250, y: 520, params: { x: 0, y: 0, z: 0, rot: 0, scale: 100 } };
    const nOut3 = { id: 'n_out3', type: 'output', x: 460, y: 520, params: {} };
    NG.nodes.push(nText, nExt, nOut, nCyl, nTr1, nBox, nTr2, nMerge, nOut2, nAnvil, nAnvilTr, nOut3);
    NG.links.push(
      { id: 'lk1', from: 'n_text', fromPort: 0, to: 'n_ext', toPort: 0 },
      { id: 'lk2', from: 'n_ext', fromPort: 0, to: 'n_out', toPort: 0 },
      { id: 'lk3', from: 'n_cyl', fromPort: 0, to: 'n_tr1', toPort: 0 },
      { id: 'lk4', from: 'n_tr1', fromPort: 0, to: 'n_merge', toPort: 0 },
      { id: 'lk5', from: 'n_box', fromPort: 0, to: 'n_tr2', toPort: 0 },
      { id: 'lk6', from: 'n_tr2', fromPort: 0, to: 'n_merge', toPort: 1 },
      { id: 'lk7', from: 'n_merge', fromPort: 0, to: 'n_out2', toPort: 0 },
      { id: 'lk8', from: 'n_anvil', fromPort: 0, to: 'n_anvil_tr', toPort: 0 },
      { id: 'lk9', from: 'n_anvil_tr', fromPort: 0, to: 'n_out3', toPort: 0 }
    );

    /* ================= 文字源 ================= */
    const txt = mk('text', '字源', comp);
    txt.text.content = M.newProp('锻');
    txt.text.fontFamily = 'Microsoft YaHei';
    txt.text.fontSize = M.newProp(420);
    txt.text.lineHeight = M.newProp(1.0);
    txt.text.color = M.newProp('#ffb347', { color: true });
    txt.transform.position.v = [960, 540, 0];
    txt.enabled = false;
    add(comp, txt);

    /* ================= 地面 ================= */
    const floor = mk('solid', '地面', comp);
    floor.solid.geometry = 'box';
    floor.solid.width = M.newProp(3200);
    floor.solid.height = M.newProp(24);
    floor.solid.depth = M.newProp(2600);
    floor.material.color = M.newProp('#0d0f14', { color: true });
    floor.material.metallic = M.newProp(0.35);
    floor.material.roughness = M.newProp(0.55);
    floor.material.env = M.newProp(0.5);
    floor.transform.position = M.newProp([960, 940, 100], { spatial: true, dims: 3 });
    add(comp, floor);

    /* ================= 铁砧 ================= */
    const anvil = mk('solid', '铁砧', comp);
    anvil.solid.geometry = 'node';
    anvil.solid.nodeSource = 'n_out3';
    anvil.material.color = M.newProp('#2a2c33', { color: true });
    anvil.material.metallic = M.newProp(0.85);
    anvil.material.roughness = M.newProp(0.42);
    anvil.material.env = M.newProp(0.8);
    anvil.transform.position = M.newProp([960, 850, 60], { spatial: true, dims: 3 });
    anvil.castShadow3D = true;
    add(comp, anvil);

    /* ================= 字块 ================= */
    const block = mk('solid', '字块', comp);
    block.solid.geometry = 'node';
    block.solid.nodeSource = 'n_out';
    block.material.color = M.newProp('#ff7a18', { color: true });
    block.material.metallic = M.newProp(0.92);
    block.material.roughness = M.newProp(0.26);
    block.material.emissive = M.newProp('#ff4d00', { color: true });
    block.material.emissiveIntensity = M.newProp(0);
    block.material.env = M.newProp(1.0);
    block.transform.position = M.newProp([960, 520, 0], { spatial: true, dims: 3 });
    block.transform.anchor = M.newProp([0, 0, -46]);
    block.transform.scale = M.newProp([100, 100, 0]);
    block.castShadow3D = true;
    block.solid.fieldIds = [];
    add(comp, block);

    /* ================= 笔画（写成） ================= */
    const strokes = mk('shape', '笔画', comp);
    strokes.sourceTextLayer = txt.id;
    strokes.transform.position = M.newProp([960, 520, 0], { spatial: true, dims: 3 });
    strokes.transform.scale = M.newProp([103, 103]);
    strokes.effects.push({ id: M.uid('fx'), type: 'glow', enabled: true, params: { threshold: M.newProp(0.2), intensity: M.newProp(1.6), radius: M.newProp(26) } });
    add(comp, strokes);

    /* ================= 锤子 ================= */
    const hammer = mk('solid', '锤子', comp);
    hammer.solid.geometry = 'node';
    hammer.solid.nodeSource = 'n_out2';
    hammer.material.color = M.newProp('#8d939e', { color: true });
    hammer.material.metallic = M.newProp(0.95);
    hammer.material.roughness = M.newProp(0.3);
    hammer.material.env = M.newProp(1.0);
    hammer.transform.position = M.newProp([1180, 210, -120], { spatial: true, dims: 3 });
    hammer.transform.rotation = M.newProp(-38);
    hammer.transform.scale = M.newProp([100, 100, 100]);
    hammer.castShadow3D = true;
    add(comp, hammer);

    /* ================= 场：锻打凹陷 ================= */
    const dent = mk('field', '锻击场', comp);
    dent.field.type = 'directional';
    dent.field.radius = M.newProp(230);
    dent.field.strength = M.newProp(0);
    dent.field.falloff = 'smooth';
    dent.field.axis = M.newProp([0, 0, -1]);
    dent.field.dir = M.newProp([0, 0, -1]);
    dent.field.blend = 'add';
    dent.field.color = M.newProp('#ff9f43', { color: true });
    dent.transform.position = M.newProp([1060, 470, 0], { spatial: true, dims: 3 });
    add(comp, dent);
    block.solid.fieldIds = [dent.id];

    /* ================= 火星 ================= */
    const sparks = mk('particle', '火星', comp);
    const sp = sparks.particles;
    sp.seed = M.newProp(11);
    sp.rate = M.newProp(24);
    sp.lifetime = M.newProp(1.3);
    sp.lifetimeVar = M.newProp(0.55);
    sp.speed = M.newProp(520);
    sp.speedVar = M.newProp(0.75);
    sp.size = M.newProp(7);
    sp.sizeVar = M.newProp(0.6);
    sp.sizeEnd = M.newProp(0.1);
    sp.color = M.newProp('#fff3c4', { color: true });
    sp.colorEnd = M.newProp('#ff3d00', { color: true });
    sp.opacity = M.newProp(1);
    sp.opacityEnd = M.newProp(1);
    sp.emitter.type = 'point';
    sp.emitter.radius = M.newProp(26);
    sp.emitter.spread = M.newProp(1.15);
    sp.emitter.dir = M.newProp([0, -1, -0.35]);
    sp.emitter.alongNormal = M.newProp(1);
    sp.forces.gravity = M.newProp([0, 780, 0]);
    sp.forces.drag = M.newProp(0.9);
    sp.forces.fields = [dent.id];
    sp.collision.on = true;
    sp.collision.layers = [block.id, anvil.id];
    sp.collision.bounce = M.newProp(0.5);
    sp.collision.friction = M.newProp(0.45);
    sp.collision.radius = M.newProp(4);
    sp.collision.onHit.color = M.newProp('#fff6d8', { color: true });
    sp.collision.onHit.lifetime = M.newProp(0.55);
    sp.collision.onHit.emit = M.newProp(2);
    sp.trail.on = true;
    sp.trail.length = M.newProp(0.22);
    sp.trail.width = M.newProp(2.2);
    sp.trail.fade = M.newProp(1);
    sp.maxParticles = 2600;
    sparks.transform.position = M.newProp([1060, 470, -10], { spatial: true, dims: 3 });
    add(comp, sparks);

    const sparks2 = mk('particle', '飞溅', comp);
    const s2 = sparks2.particles;
    s2.seed = M.newProp(5);
    s2.rate = M.newProp(50);
    s2.lifetime = M.newProp(0.9);
    s2.speed = M.newProp(260);
    s2.speedVar = M.newProp(0.8);
    s2.size = M.newProp(4.5);
    s2.sizeEnd = M.newProp(0.05);
    s2.color = M.newProp('#ffc46b', { color: true });
    s2.colorEnd = M.newProp('#ff2a00', { color: true });
    s2.emitter.type = 'surface';
    s2.emitter.source = block.id;
    s2.emitter.alongNormal = M.newProp(1);
    s2.emitter.spread = M.newProp(0.8);
    s2.forces.gravity = M.newProp([0, 420, 0]);
    s2.forces.drag = M.newProp(1.4);
    s2.collision.on = true;
    s2.collision.layers = [block.id, anvil.id];
    s2.collision.bounce = M.newProp(0.4);
    s2.trail.on = true;
    s2.trail.length = M.newProp(0.12);
    s2.trail.width = M.newProp(1.4);
    s2.maxParticles = 1400;
    sparks2.transform.position = M.newProp([960, 520, 0], { spatial: true, dims: 3 });
    add(comp, sparks2);

    /* ================= 背景光 ================= */
    const glowBg = mk('shape', '背景光', comp);
    glowBg.transform.position = M.newProp([960, 520, 0], { spatial: true, dims: 3 });
    glowBg.shapes.push({
      id: M.uid('sh'), name: '径向光',
      paths: [M.newProp(PT.ellipsePath(0, 0, 760, 620))],
      fill: { on: true, color: M.newProp('#ff7a18', { color: true }), opacity: M.newProp(100), gradient: { type: 'radial', stops: [[0, 'rgba(255,140,40,0.55)'], [0.45, 'rgba(180,60,10,0.20)'], [1, 'rgba(0,0,0,0)']] } },
      stroke: { on: false, color: M.newProp('#000', { color: true }), width: M.newProp(0), opacity: M.newProp(100) },
      ops: []
    });
    K(glowBg.transform.opacity, 0, 30); K(glowBg.transform.opacity, 1.2, 55); K(glowBg.transform.opacity, 4.0, 70); K(glowBg.transform.opacity, 6.2, 85);
    K(glowBg.transform.opacity, 11.0, 80); K(glowBg.transform.opacity, 13.5, 26); K(glowBg.transform.opacity, 15, 22);
    add(comp, glowBg);

    /* ================= 灯光 ================= */
    const key = mk('light', '主光', comp);
    key.light.kind = 'directional';
    key.light.color = M.newProp('#ffd9a8', { color: true });
    key.light.intensity = M.newProp(2.6);
    key.light.castShadow = M.newProp(true);
    key.light.shadowSoftness = M.newProp(1.6);
    key.transform.position = M.newProp([620, 180, -700], { spatial: true, dims: 3 });
    key.light.target = M.newProp([960, 540, 0], { spatial: true, dims: 3 });
    add(comp, key);

    const rim = mk('light', '轮廓光', comp);
    rim.light.kind = 'point';
    rim.light.color = M.newProp('#ff5a1a', { color: true });
    rim.light.intensity = M.newProp(1.1);
    rim.light.castShadow = M.newProp(false);
    rim.transform.position = M.newProp([1320, 380, -260], { spatial: true, dims: 3 });
    K(rim.light.intensity, 0, 0.4); K(rim.light.intensity, 4.6, 1.6); K(rim.light.intensity, 11.2, 1.4); K(rim.light.intensity, 13.4, 0.35);
    add(comp, rim);

    const fill = mk('light', '补光', comp);
    fill.light.kind = 'point';
    fill.light.color = M.newProp('#4a7cff', { color: true });
    fill.light.intensity = M.newProp(0.5);
    fill.light.castShadow = M.newProp(false);
    fill.transform.position = M.newProp([480, 760, -520], { spatial: true, dims: 3 });
    add(comp, fill);

    /* ================= 摄像机 ================= */
    const cam = mk('camera', '摄像机', comp);
    cam.camera.fov = M.newProp(38);
    cam.camera.focus = M.newProp(1500);
    cam.camera.aperture = M.newProp(26);
    cam.camera.target = M.newProp([960, 520, 0], { spatial: true, dims: 3 });
    cam.transform.position = M.newProp([960, 540, -1520], { spatial: true, dims: 3 });
    K(cam.transform.position, 0, [960, 545, -1520], 'auto');
    K(cam.transform.position, 3.6, [960, 535, -1380], 'auto');
    K(cam.transform.position, 5.6, [1170, 470, -1160], 'auto');
    K(cam.transform.position, 8.4, [1150, 495, -1090], 'auto');
    K(cam.transform.position, 10.8, [1030, 520, -1140], 'auto');
    K(cam.transform.position, 13.2, [960, 540, -1420], 'auto');
    K(cam.transform.position, 15, [960, 542, -1470], 'auto');
    K(cam.camera.focus, 0, 1450); K(cam.camera.focus, 5.6, 1180); K(cam.camera.focus, 10.8, 1160); K(cam.camera.focus, 13.2, 1380);
    // 撞击震动（表达式）
    E(cam.transform.position, 'value + wiggle(16, 7) * (linear(time,6.56,6.62,0,1)*linear(time,6.62,7.15,1,0) + linear(time,8.56,8.62,0,1)*linear(time,8.62,9.15,1,0) + linear(time,10.56,10.62,0,1)*linear(time,10.62,11.15,1,0))');
    comp.cameraId = cam.id;
    add(comp, cam);

    /* ================= 字幕 ================= */
    const title = mk('text', '题字', comp);
    title.text.content = M.newProp('以火塑形  ·  锻字成器');
    title.text.fontFamily = 'Microsoft YaHei';
    title.text.fontSize = M.newProp(34);
    title.text.tracking = M.newProp(320);
    title.text.color = M.newProp('#cfd6e4', { color: true });
    title.text.align = 'center';
    title.transform.position = M.newProp([960, 960, 0], { spatial: true, dims: 3 });
    title.transform.opacity = M.newProp(0);
    K(title.transform.opacity, 13.2, 0); K(title.transform.opacity, 14.2, 78); K(title.transform.opacity, 15, 78);
    add(comp, title);

    const title2 = mk('text', '英文题字', comp);
    title2.text.content = M.newProp('F O R G E');
    title2.text.fontFamily = 'Georgia';
    title2.text.fontSize = M.newProp(20);
    title2.text.color = M.newProp('#7d8798', { color: true });
    title2.text.align = 'center';
    title2.transform.position = M.newProp([960, 1000, 0], { spatial: true, dims: 3 });
    title2.transform.opacity = M.newProp(0);
    K(title2.transform.opacity, 13.5, 0); K(title2.transform.opacity, 14.4, 60); K(title2.transform.opacity, 15, 60);
    add(comp, title2);

    /* ================= 调整层 ================= */
    const adj = mk('adjust', '辉光与暗角', comp);
    adj.effects.push({ id: M.uid('fx'), type: 'glow', enabled: true, params: { threshold: M.newProp(0.62), intensity: M.newProp(0.75), radius: M.newProp(46) } });
    adj.transform.opacity = M.newProp(100);
    add(comp, adj);

    /* ================= 音色 ================= */
    const music = mk('audio', '锻打配乐', comp);
    music.audio.kind = 'music';
    music.audio.pattern = 'forge';
    music.audio.volume = M.newProp(72);
    music.inPoint = 0; music.outPoint = 15;
    add(comp, music);
    const sfx = mk('audio', '锤击音效', comp);
    sfx.audio.kind = 'sfx';
    sfx.audio.pattern = 'hit';
    sfx.audio.volume = M.newProp(85);
    sfx.inPoint = 0; sfx.outPoint = 15;
    add(comp, sfx);

    /* ================= 笔画写成动画 ================= */
    // 由 textSource 生成 5 个轮廓组，逐组 trim
    const glyph = FONT.textToPath('锻', { fontFamily: 'Microsoft YaHei', fontSize: 420, lineHeight: 1.0, tracking: 0, align: 'center' });
    const nContours = Math.min(glyph.path.contours.length, 8);
    for (let i = 0; i < nContours; i++) {
      const grp = {
        id: M.uid('sh'), name: '笔画 ' + (i + 1), textSource: txt.id, textIndex: i,
        paths: [M.newProp({ contours: [glyph.path.contours[i]] })],
        fill: { on: false, color: M.newProp('#ffb347', { color: true }), opacity: M.newProp(100) },
        stroke: { on: true, color: M.newProp('#ffcf7a', { color: true }), width: M.newProp(7), opacity: M.newProp(100), cap: 'round', join: 'round' },
        ops: [{ type: 'trim', enabled: true, start: M.newProp(0), end: M.newProp(0), offset: M.newProp(0) }]
      };
      const st = 0.12 + i * 0.26;
      K(grp.ops[0].end, st, 0); K(grp.ops[0].end, st + 0.62, 100);
      strokes.shapes.push(grp);
    }
    K(strokes.transform.opacity, 0, 100);
    K(strokes.transform.opacity, 4.05, 100);
    K(strokes.transform.opacity, 4.7, 0);
    // 描边宽度由细到粗
    for (const g of strokes.shapes) { K(g.stroke.width, 0, 2); K(g.stroke.width, 4.0, 9); K(g.stroke.width, 4.7, 2); }

    /* ================= 成块动画 ================= */
    const bs = block.transform.scale;
    K(bs, 0, [100, 100, 0]);
    K(bs, 3.9, [100, 100, 0]);
    K(bs, 4.75, [100, 100, 112], 'auto');
    K(bs, 5.15, [100, 100, 96], 'auto');
    K(bs, 5.6, [100, 100, 100], 'auto');
    const em = block.material.emissiveIntensity;
    K(em, 0, 0); K(em, 4.0, 0); K(em, 4.9, 2.6, 'auto'); K(em, 6.2, 1.35, 'auto');
    const mc = block.material.color;
    K(mc, 0, '#ff7a18', 'auto'); K(mc, 4.2, '#ff8a20', 'auto'); K(mc, 8.0, '#ff7a18', 'auto');
    K(mc, 11.0, '#ff7a18', 'auto'); K(mc, 12.6, '#c3c9d4', 'auto'); K(mc, 13.6, '#aeb6c4', 'auto');
    K(block.material.roughness, 0, 0.22); K(block.material.roughness, 8, 0.24); K(block.material.roughness, 12.6, 0.38);
    // 字块受击抖动
    K(block.transform.rotation, 0, 0);
    K(block.transform.rotation, 6.55, 0); K(block.transform.rotation, 6.62, -2.2); K(block.transform.rotation, 6.8, 0.8); K(block.transform.rotation, 7.1, 0);
    K(block.transform.rotation, 8.55, 0); K(block.transform.rotation, 8.62, 1.8); K(block.transform.rotation, 8.8, -0.6); K(block.transform.rotation, 9.1, 0);
    K(block.transform.rotation, 10.55, 0); K(block.transform.rotation, 10.62, -1.6); K(block.transform.rotation, 10.8, 0.5); K(block.transform.rotation, 11.1, 0);
    const bsc = block.transform.scale;
    K(bsc, 6.56, [100, 100, 100]); K(bsc, 6.62, [101.6, 99.2, 96]); K(bsc, 6.85, [99.6, 100.4, 101]); K(bsc, 7.1, [100, 100, 100]);
    K(bsc, 8.56, [100, 100, 100]); K(bsc, 8.62, [101.4, 99.4, 96]); K(bsc, 8.85, [99.7, 100.3, 101]); K(bsc, 9.1, [100, 100, 100]);
    K(bsc, 10.56, [100, 100, 100]); K(bsc, 10.62, [101.2, 99.5, 97]); K(bsc, 10.85, [99.8, 100.2, 101]); K(bsc, 11.1, [100, 100, 100]);

    /* ================= 锤击动画 ================= */
    const hr = hammer.transform.rotation;
    const hp = hammer.transform.position;
    const hits = [6.6, 8.6, 10.6];
    K(hr, 0, -46); K(hr, 5.6, -46);
    for (const h of hits) {
      const pre = h - 0.62, down = h - 0.06, hit = h, reb = h + 0.12, settle = h + 0.55;
      K(hr, pre, -30, 'auto');          // 预备：抬起
      K(hr, pre + 0.34, 16, 'auto');    // 蓄势后摆
      K(hr, down, 14, 'linear');        // 加速前保持
      K(hr, hit, -50, 'linear');        // 快速落下
      K(hr, reb, -40, 'auto');          // 反弹
      K(hr, settle, -46, 'auto');       // 收势
      K(hp, pre, [1180, 190, -120], 'auto');
      K(hp, pre + 0.34, [1230, 150, -120], 'auto');
      K(hp, down, [1230, 150, -120], 'linear');
      K(hp, hit, [1105, 300, -110], 'linear');
      K(hp, reb, [1120, 290, -112], 'auto');
      K(hp, settle, [1180, 190, -120], 'auto');
    }
    K(hr, 13.2, -46); K(hp, 13.2, [1180, 190, -120]);

    /* ================= 锻击场（凹陷） ================= */
    const ds = dent.field.strength;
    const dp = dent.transform.position;
    K(ds, 0, 0);
    const hitPts = [[1060, 470], [980, 610], [1120, 640]];
    hits.forEach((h, i) => {
      K(ds, h - 0.02, 0);
      K(ds, h + 0.03, -300, 'linear');
      K(ds, h + 0.55, 40, 'auto');
      K(ds, h + 0.9, 0, 'auto');
      K(dp, h - 0.1, [hitPts[i][0], hitPts[i][1], 0]);
      K(dp, h + 0.9, [hitPts[i][0], hitPts[i][1], 0]);
    });

    /* ================= 火星爆发 ================= */
    const sr = sparks.particles.rate;
    K(sr, 0, 6);
    hits.forEach((h, i) => {
      K(sr, h - 0.02, 6);
      K(sr, h + 0.02, 900, 'linear');
      K(sr, h + 0.45, 120, 'auto');
      K(sr, h + 1.1, 6, 'auto');
      K(sparks.transform.position, h - 0.05, [hitPts[i][0], hitPts[i][1], -30]);
      K(sparks.transform.position, h + 0.9, [hitPts[i][0] + 12, hitPts[i][1] + 18, -30]);
    });
    K(sr, 12.0, 4); K(sr, 15, 0);
    const sr2 = sparks2.particles.rate;
    K(sr2, 0, 0); K(sr2, 4.4, 20); K(sr2, 6.0, 55); K(sr2, 10.8, 60); K(sr2, 12.4, 18); K(sr2, 14, 0);

    /* ================= 灯光冷却 ================= */
    K(key.light.intensity, 0, 2.2); K(key.light.intensity, 6.0, 3.0); K(key.light.intensity, 11.2, 2.6); K(key.light.intensity, 13.4, 1.9);
    K(key.light.color, 0, '#ffd9a8', 'auto'); K(key.light.color, 6, '#ffd0a0', 'auto'); K(key.light.color, 12.6, '#dfe8ff', 'auto');
    K(glowBg.transform.opacity, 0, 30); K(glowBg.transform.opacity, 1.2, 55); K(glowBg.transform.opacity, 4.0, 70); K(glowBg.transform.opacity, 6.2, 85);
    K(glowBg.transform.opacity, 11.0, 80); K(glowBg.transform.opacity, 13.5, 26); K(glowBg.transform.opacity, 15, 22);

    /* ================= 入点/出点 ================= */
    for (const L of comp.layers) { L.outPoint = 15; L.inPoint = 0; }
    strokes.inPoint = 0; strokes.outPoint = 5.2;
    block.inPoint = 3.6; block.outPoint = 15;
    hammer.inPoint = 5.0; hammer.outPoint = 13.6;
    dent.inPoint = 6.0; dent.outPoint = 12.2;
    sparks.inPoint = 5.6; sparks.outPoint = 13.2;
    sparks2.inPoint = 3.8; sparks2.outPoint = 14.2;

    P.selection = [block.id];
    P.time = 0;
    return P;
  }

  global.DEMO = { build };
})(window);
