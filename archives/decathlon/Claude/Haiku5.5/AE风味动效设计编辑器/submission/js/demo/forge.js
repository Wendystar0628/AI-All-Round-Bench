/* 默认示例「锻字」（15 秒）：由编辑器的图层、关键帧、表达式、材质、灯光、摄像机、节点图与粒子生成。
 * 主题字为「火」。四个阶段：写成（0–3.2s）→ 成块（3.0–4.8s）→ 锻打（5.8–8.4s，锤击于 7.35s）→ 冷却（9–15s）。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const Model = AE.Model;
  const Anim = AE.Anim;
  const G = AE.Graph;
  const Demo = (AE.Demo = {});
  const W = 1920, H = 1080;
  const CX = W / 2, CY = H / 2;
  const CHAR = '火';
  const FONT = 'hans-bold';
  const FONT_SIZE = 300;

  // 关键帧快捷方式：ease 为 'ease' | 'lin' | 'hold'
  const EASE = {
    ease: { inT: 'bezier', outT: 'bezier', inI: 0.33, outI: 0.33, inS: 0, outS: 0 },
    lin: { inT: 'linear', outT: 'linear' },
    hold: { inT: 'linear', outT: 'hold' },
    ein: { inT: 'bezier', outT: 'bezier', inI: 0.7, outI: 0.2, inS: 0, outS: 0 },
    eout: { inT: 'bezier', outT: 'bezier', inI: 0.2, outI: 0.7, inS: 0, outS: 0 },
  };
  // 把若干 [t, v, 缓动] 写成动画属性
  function anim(prop, list) {
    prop.animated = true;
    prop.keys = list.map(([t, v, e]) => Model.key(t, v, Object.assign({}, EASE[e || 'ease'])));
    prop.keys.sort((a, b) => a.t - b.t);
    return prop;
  }
  // 参数（图节点用）：可动画数值
  function animNum(v, list) {
    return anim(Model.num(v), list);
  }
  function animVec(v, list) {
    return anim(Model.vec(v), list);
  }
  function animColor(v, list) {
    return anim(Model.color(v), list);
  }
  // 矩形遮罩路径（用于写成阶段的笔画显现）
  const rectMask = (cx, cy, w, h) => [Model.rectPath(cx, cy, Math.max(0.01, w), Math.max(0.01, h), 0)];

  // 计算字形在排版后的包围盒（字形局部坐标，以字块中心为原点）
  function glyphBox() {
    const lay = AE.Text.layout({ text: CHAR, font: FONT, size: FONT_SIZE, leading: FONT_SIZE * 1.15, tracking: 0, align: 'center' });
    const b = lay.bounds || { x0: -150, y0: -150, x1: 150, y1: 150 };
    return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, w: b.x1 - b.x0, h: b.y1 - b.y0, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };
  }

  Demo.build = () => {
    const p = Model.newProject('锻字示例');
    const comp = Model.newComp({ name: '锻字', width: W, height: H, fps: 30, duration: 15, bg: [0.05, 0.035, 0.03] });
    p.comps.push(comp);
    p.activeComp = comp.id;
    const gb = glyphBox();
    // 字块中心与地面、字块顶面的画面位置
    const BLOCK_Y = 520;
    const FLOOR_Y = 700;
    const TOP_Y = BLOCK_Y - gb.h / 2;
    const L = [];
    const add = (layer) => {
      L.push(layer);
      return layer;
    };

    // ----- 图节点：字块 = 文字 -> 挤出 -> 细分 -> 锤击场位移 -----
    const graph = G.newGraph('锻字字块');
    const txt = G.newNode(graph, 'text', 30, 30, { text: CHAR, font: FONT, size: FONT_SIZE, tracking: 0 });
    const ext = G.newNode(graph, 'extrude', 230, 30, { depth: animNum(2, [[3.0, 2, 'lin'], [4.6, 120, 'ease'], [15, 120, 'hold']]), bevel: animNum(0, [[3.0, 0, 'lin'], [4.6, 9, 'ease'], [15, 9, 'hold']]) });
    ext.ins.geo = { node: txt.id, port: 'out' };
    const sub = G.newNode(graph, 'subdivide', 420, 30, { levels: 1 });
    sub.ins.geo = { node: ext.id, port: 'out' };
    // 击打点位于字块顶面中部偏上，场为排斥衰减：顶点被推开形成凹陷，并向外挤出
    const fld = G.newNode(graph, 'fieldFalloff', 230, 200, {
      cx: -20,
      cy: -gb.h / 2 + 30,
      cz: 0,
      radius: 150,
      strength: animNum(0, [[7.3, 0, 'lin'], [7.5, 48, 'ease'], [8.4, 36, 'ease'], [15, 36, 'hold']]),
      attract: 0,
    });
    const dis = G.newNode(graph, 'displace', 610, 120, { amount: 1 });
    dis.ins.geo = { node: sub.id, port: 'out' };
    dis.ins.field = { node: fld.id, port: 'out' };
    p.graphs.push(graph);

    // ----- 背景（二维，位于三维通道之下） -----
    const bgRect = add(Model.createLayer(comp, 'shape', { name: '工坊底色', tr: { position: [CX, CY] } }));
    bgRect.contents = [
      { type: 'rect', pos: Model.vec([0, 0]), size: Model.vec([W * 1.2, H * 1.2]), round: Model.num(0) },
      { type: 'fill', color: Model.color([0.05, 0.035, 0.03]), opacity: Model.num(100) },
    ];
    const glow = add(Model.createLayer(comp, 'shape', { name: '炉火光晕', tr: { position: [CX, FLOOR_Y + 40], opacity: 42 } }));
    glow.blend = 'add';
    glow.contents = [
      { type: 'ellipse', pos: Model.vec([0, 0]), size: Model.vec([1500, 620]), round: Model.num(0) },
      { type: 'fill', color: Model.color([1, 0.42, 0.1]), opacity: Model.num(100) },
    ];
    glow.effects = [{ type: 'blur', name: '模糊', on: true, params: { radius: animNum(0, [[0, 150, 'hold']]) } }];

    // ----- 写成：二维文字，笔画依次显现（矩形遮罩扩展） -----
    const write = add(Model.createLayer(comp, 'text', { name: '火 · 写成', text: CHAR, font: FONT, size: FONT_SIZE, color: [1, 0.86, 0.62], tr: { position: [CX, BLOCK_Y] } }));
    write.tr.opacity = animNum(100, [[0, 100, 'hold'], [3.0, 100, 'lin'], [3.4, 0, 'lin']]);
    // 字形底稿：开场即可见的暗淡字形，书写时笔画在其上逐笔亮起，并在成块前淡出
    const ghost = add(Model.createLayer(comp, 'text', { name: '字形底稿', text: CHAR, font: FONT, size: FONT_SIZE, color: [0.9, 0.5, 0.22], tr: { position: [CX, BLOCK_Y], opacity: 16 } }));
    ghost.tr.opacity = animNum(16, [[0, 16, 'hold'], [3.0, 16, 'lin'], [3.5, 0, 'lin']]);

    // 笔画：开启“自动笔画”，按当前文字的字形笔画生成遮罩，依次展开（改字后自动按新字生成）
    write.autoStroke = { start: 0.25, span: 2.6 };
    write.effects = [
      { type: 'glow', name: '发光', on: true, params: { threshold: Model.num(35), radius: Model.num(24), intensity: Model.num(140), color: Model.color([1, 0.45, 0.12]) } },
    ];
    write.blend = 'normal';

    // ----- 地面（接收阴影的三维平面） -----
    const ground = add(Model.createLayer(comp, 'shape', { name: '铁砧面', is3D: true, tr: { position: [CX, FLOOR_Y, 0] } }));
    ground.tr.rotationX = Model.num(90);
    ground.contents = [
      { type: 'rect', pos: Model.vec([0, 0]), size: Model.vec([5200, 5200]), round: Model.num(0) },
      { type: 'fill', color: Model.color([0.075, 0.068, 0.062]), opacity: Model.num(100) },
    ];
    ground.mat.color = Model.color([0.075, 0.068, 0.062]);
    ground.mat.rough = Model.num(0.9);
    ground.castShadow = false;

    // ----- 字块（三维几何，由节点图生成） -----
    const block = add(Model.createLayer(comp, 'geo', { name: '字块 · 锻造', is3D: true, inPoint: 3.0, outPoint: 15, tr: { position: [CX, BLOCK_Y, 0] }, source: { graph: graph.id, node: dis.id } }));
    block.geo.mat = {
      color: animColor([0.95, 0.86, 0.72], [[3.0, [0.95, 0.86, 0.72], 'ease'], [4.6, [1, 0.66, 0.34], 'ease'], [8.0, [1, 0.6, 0.3], 'ease'], [10.5, [0.7, 0.58, 0.5], 'ease'], [13.0, [0.6, 0.6, 0.64], 'ease']]),
      metal: animNum(0, [[3.0, 0, 'lin'], [9.5, 0.1, 'ease'], [13.0, 0.92, 'ease']]),
      rough: animNum(0.5, [[3.0, 0.5, 'lin'], [13.0, 0.3, 'ease']]),
      emit: animNum(0.2, [[3.0, 0.3, 'lin'], [4.6, 0.95, 'ease'], [7.4, 1.25, 'lin'], [9.5, 0.6, 'ease'], [12.5, 0.08, 'ease'], [13.2, 0, 'hold']]),
      emitColor: Model.color([1, 0.42, 0.1]),
      alpha: Model.num(100),
    };
    // 炉火闪动：抖动幅度与发光强度成正比，冷却后不再闪动（最后几帧停稳）
    block.geo.mat.emit.expr = 'wiggle(5, 0.14 * value)';
    block.geo.mat.emit.exprOn = true;

    // ----- 锤（三维形状，锤击于 7.35s） -----
    // 锤头底面与字块顶面在 7.35s 接触（TOP_Y 为字块顶面的画面 y，锤头中心 = TOP_Y - 60）
    const hx = CX - 20, hz = -20;
    const hy = (d) => TOP_Y - 60 - d;
    const hammer = add(Model.createLayer(comp, 'shape', { name: '锤', is3D: true, tr: { position: [hx, hy(230), hz] } }));
    hammer.tr.position = animVec([hx, hy(230), hz], [
      [4.6, [hx, hy(230), hz], 'ease'],
      [6.8, [hx, hy(290), hz], 'ein'],
      [7.35, [hx, hy(0), hz], 'lin'],
      [7.62, [hx, hy(50), hz], 'eout'],
      [8.3, [hx, hy(0), hz], 'ease'],
      [9.6, [hx, hy(700), hz], 'ease'],
    ]);
    hammer.tr.position.spatial = true; // 空间路径：锤子沿直线下落（可在画布上编辑路径）
    hammer.tr.rotation = animNum(0, [[4.6, 0, 'ease'], [6.8, -22, 'ease'], [7.35, 0, 'lin'], [9.0, 0, 'hold']]);
    hammer.contents = [
      { type: 'rect', pos: Model.vec([0, 0]), size: Model.vec([300, 120]), round: Model.num(12) },
      { type: 'rect', pos: Model.vec([0, -190]), size: Model.vec([46, 300]), round: Model.num(10) },
      // 锤头与锤柄并集为一个轮廓：避免两个挤出体的前表面在交界处共面重叠（深度相等会互相争用）
      { type: 'merge', mode: 'add' },
      { type: 'fill', color: Model.color([0.22, 0.21, 0.23]), opacity: Model.num(100) },
    ];
    hammer.extrude = { depth: Model.num(120), bevel: Model.num(14) };
    hammer.mat = { color: Model.color([0.3, 0.29, 0.32]), metal: Model.num(0.9), rough: Model.num(0.3), emit: Model.num(0), emitColor: Model.color([1, 0.5, 0.2]), alpha: Model.num(100) };

    // ----- 火花（粒子，发射点位于锤击处，与字块表面碰撞） -----
    const sparks = add(Model.createLayer(comp, 'particles', { name: '火花', is3D: true, inPoint: 7.2, outPoint: 10.5, tr: { position: [hx, TOP_Y, 0] } }));
    const pr = sparks.particles;
    pr.emitters = [AE.Particles.newEmitter('锤击火花', { pos: [0, 0, -10], dir: [0, -0.55, -0.85], rate: 0, speed: 640, spread: 62, life: 0.9, seed: 5 })];
    pr.emitters[0].rate = animNum(0, [[7.25, 0, 'lin'], [7.36, 1500, 'lin'], [7.65, 320, 'lin'], [8.4, 0, 'lin']]);
    pr.gravity = Model.vec([0, 1500, 0]);
    pr.drag = Model.num(0.8);
    pr.restitution = Model.num(0.35);
    pr.hitLife = Model.num(0.55); // 火星撞上字块后很快熄灭
    pr.friction = Model.num(0.35);
    pr.colliders = [{ kind: 'geo', layer: block.id }];
    pr.size = Model.num(9);
    pr.sizeEnd = Model.num(1.6);
    pr.color = Model.color([1, 0.92, 0.5]);
    pr.colorEnd = Model.color([1, 0.34, 0.06]);
    pr.trail = { on: true, length: Model.num(5), width: Model.num(4), fade: Model.num(100) };
    pr.seed = 11;
    pr.maxParticles = 2500;
    pr.glow = 1;

    // ----- 灯光：主光（平行光，投影）、补光（点光源）、闪光（链接锤子位置） -----
    const key = add(Model.createLayer(comp, 'light', { name: '主光', kind: 'parallel', color: [1, 0.86, 0.7], intensity: 110, poi: [CX, BLOCK_Y, 0], position: [-1500, -1900, -1700], shadow: true }));
    key.light.shadowDark = Model.num(55);
    const fill = add(Model.createLayer(comp, 'light', { name: '补光', kind: 'point', color: [1, 0.55, 0.3], intensity: 70, poi: [CX, BLOCK_Y, 0], position: [2600, 260, -900] }));
    const flash = add(Model.createLayer(comp, 'light', { name: '闪光', kind: 'point', color: [1, 0.72, 0.38], intensity: 0, poi: [CX, BLOCK_Y, 0], position: [CX, TOP_Y - 120, -200] }));
    flash.light.intensity = animNum(0, [[7.3, 0, 'lin'], [7.36, 1100, 'lin'], [7.7, 60, 'ease'], [15, 0, 'hold']]);
    flash.tr.position.expr = 'var h = thisComp.layer("锤").transform.position; [h[0], h[1] - 40, -150]';
    flash.tr.position.exprOn = true;
    flash.tr.position.animated = false;

    // ----- 摄像机：推进、冲击时轻微震动、景深 -----
    // 镜头略微俯视，使字块顶面可见；推进、冲击后回到定格机位
    const cam = add(Model.createLayer(comp, 'camera', { name: '镜头', poi: [CX, BLOCK_Y - 10, 0], position: [CX, TOP_Y - 120, -2600], zoom: W * 1.389 }));
    cam.cam.poi = animVec([CX, BLOCK_Y - 10, 0], [[0, [CX, BLOCK_Y - 10, 0], 'ease'], [13.5, [CX, BLOCK_Y - 30, 0], 'ease'], [15, [CX, BLOCK_Y - 30, 0], 'hold']]);
    // 景别：全景（0s）→ 中景推进（4.5s）→ 锤击前特写（7.1–7.9s）→ 拉开定格（9.5s 起）
    cam.tr.position = animVec([CX, TOP_Y - 120, -2600], [
      [0, [CX, TOP_Y - 120, -2600], 'ease'],
      [4.5, [CX, TOP_Y - 160, -2250], 'ease'],
      [7.1, [CX, TOP_Y - 150, -1980], 'ease'],
      [7.9, [CX, TOP_Y - 140, -2010], 'ease'],
      [9.5, [CX, TOP_Y - 190, -2220], 'ease'],
      [13.5, [CX, TOP_Y - 200, -2180], 'ease'],
      [15, [CX, TOP_Y - 200, -2180], 'hold'],
    ]);
    cam.tr.position.expr = 'wiggle(14, 9 * ease(time, 7.3, 7.42, 0, 1) * linear(time, 7.42, 8.6, 1, 0))';
    cam.tr.position.exprOn = true;
    cam.tr.position.spatial = true; // 镜头沿空间路径推进
    cam.cam.dof = true;
    cam.cam.aperture = animNum(0, [[0, 0, 'hold'], [4.2, 0, 'lin'], [6.0, 16, 'ease'], [15, 16, 'hold']]);
    cam.cam.focus = animNum(2400, [[0, 2400, 'hold'], [7.1, 1990, 'ease'], [9.5, 2300, 'ease'], [13.5, 2420, 'ease']]);

    // ----- 音色：炉火底噪、锤击、火星（事件时间为图层时间，与画面同步） -----
    const sparkEvents = [];
    for (let i = 0; i < 16; i++) sparkEvents.push({ t: 7.42 + i * 0.055 + (i % 3) * 0.012, pitch: 0.9 + (i % 4) * 0.12, gain: 0.55 - (i / 16) * 0.3 });
    const bed = add(Model.createLayer(comp, 'sound', { name: '炉火底噪', instrument: 'bed', events: [{ t: 0, pitch: 1, gain: 0.9, dur: 15 }] }));
    const hit = add(Model.createLayer(comp, 'sound', { name: '锤击音', instrument: 'hit', events: [{ t: 7.35, pitch: 1, gain: 1 }, { t: 7.64, pitch: 1.12, gain: 0.45 }] }));
    const sparkSnd = add(Model.createLayer(comp, 'sound', { name: '火星音', instrument: 'spark', events: sparkEvents }));
    // 升温：3.0–4.6 秒的音调渐强（音色图层的音量关键帧）
    const warm = add(Model.createLayer(comp, 'sound', { name: '升温音', instrument: 'tone', events: [{ t: 3.1, pitch: 0.7, gain: 0.5, dur: 1.4 }, { t: 4.0, pitch: 0.9, gain: 0.6, dur: 1.4 }] }));
    warm.sound.volume = animNum(100, [[0, 100, 'hold'], [4.8, 100, 'lin'], [5.2, 0, 'hold']]);
    bed.sound.volume = animNum(100, [[0, 60, 'ease'], [4.5, 100, 'ease'], [13.0, 40, 'ease'], [15, 0, 'hold']]);

    // 运动模糊：快门区间内取样，仅锤子、火花与字块开启
    hammer.mb = true;
    sparks.mb = true;
    block.mb = true;
    comp.motionBlur = true;
    comp.mbSamples = 4;

    // 图层顺序：上层在前（列表靠前者绘制在上方）
    comp.layers = [write, ghost, sparks, hammer, block, ground, flash, fill, key, cam, glow, bgRect, bed, hit, sparkSnd, warm];
    void L;
    return p;
  };

  Demo.ready = () => Promise.resolve();
  Demo.CHAR = CHAR;
})();
