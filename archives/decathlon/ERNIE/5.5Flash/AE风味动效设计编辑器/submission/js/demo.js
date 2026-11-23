/* AE Forge Editor - demo project "锻字" (15s) */
(function (global) {
  'use strict';
  const A = global.AEAnim;
  const P = A.createProp;
  const U = global.AEUtil;

  function kf(prop, list) {
    for (const item of list) {
      const t = item[0], v = item[1], e = item[2];
      const k = A.setKey(prop, t, v);
      k.ho = [0.33, 0.33]; k.hi = [0.33, 0.33]; k.hold = false;
      if (e === 'ease') { k.ho = [0.42, 0.0]; k.hi = [0.42, 0.0]; }
      else if (e === 'hold') { k.hold = true; }
      else if (e === 'strike') { k.ho = [0.74, 0.0]; k.hi = [0.14, 0.0]; }
      else if (e === 'in') { k.ho = [0.7, 0.0]; }
      else if (e === 'out') { k.hi = [0.55, 0.0]; }
    }
  }

  function layer(comp, type, name, opts) {
    const l = U.createLayer(comp, type, opts);
    l.name = name;
    comp.layers.unshift(l);
    return l;
  }

  function build() {
    const comp = U.createComp('锻字 · 主合成', 1920, 1080, 30, 15);
    comp.name = '锻字';
    comp.background = { type: 'radial', color1: '#12100e', color2: '#030304', vignette: true };
    comp.workArea = [0, 15];
    comp.motionBlur = { enabled: true, shutter: 180, phase: 0 };

    // 炉火光晕（2D，位于所有三维图层之下）
    const glow = layer(comp, 'shape', '炉火光晕', {});
    glow.shapes = [{ kind: 'rect', x: 0, y: 0, w: 2600, h: 2000 }];
    glow.fill = { enabled: true, type: 'radial', color: 'rgba(255,110,40,0.30)', color2: 'rgba(255,50,0,0)', radius: 980, opacity: 100 };
    glow.stroke = { enabled: false };
    glow.blendMode = 'add';
    glow.transform.position.value = [0, 120, 0];
    glow.transform.opacity.value = 0;
    glow.transform.opacity.expr = '9 + wiggle(0.5, 3)';
    glow.startTime = 0; glow.inPoint = 0; glow.outPoint = 15;

    // 摄像机
    const cam = layer(comp, 'camera', '主机位', {});
    cam.transform.position.value = [0, 90, 1420];
    cam.camera.fov = P(38);
    cam.camera.focus = P(1420);
    cam.camera.aperture = P(0.2);
    cam.camera.target.value = [0, 60, 0];
    kf(cam.transform.position, [
      [0, [0, 90, 1420], 'ease'],
      [3.4, [0, 70, 1290], 'ease'],
      [6.0, [30, 55, 1230], 'ease'],
      [6.85, [40, 48, 1215]],
      [7.06, [24, 62, 1245], 'out'],
      [8.55, [10, 52, 1200]],
      [8.76, [-8, 64, 1235], 'out'],
      [10.35, [-20, 46, 1175]],
      [10.64, [-10, 66, 1225], 'out'],
      [12.4, [-6, 56, 1180], 'ease'],
      [15, [0, 58, 1170], 'ease'],
    ]);
    kf(cam.camera.focus, [[0, 1420], [6, 1230], [10.3, 1180], [12.5, 1170], [15, 1170]]);
    kf(cam.camera.aperture, [[0, 0.1], [4, 0.2], [6.8, 0.3], [10.3, 0.34], [13, 0.2], [15, 0.15]]);

    // 主光
    const key = layer(comp, 'light', '主光 · 暖白', {});
    key.light.kind = 'parallel';
    key.light.color = '#fff1dc';
    key.light.intensity = P(3.1);
    key.light.shadow = true;
    key.transform.position.value = [-500, 800, 900];
    key.transform.rotation.value = [-52, -28, 0];
    kf(key.light.intensity, [[0, 2.5], [3.5, 2.9], [6.8, 3.4], [10.35, 3.8], [12.5, 2.6], [15, 2.6]]);

    // 轮廓光
    const rim = layer(comp, 'light', '轮廓光 · 冷蓝', {});
    rim.light.kind = 'parallel';
    rim.light.color = '#5a7dff';
    rim.light.intensity = P(3.2);
    rim.light.shadow = false;
    rim.transform.position.value = [700, 300, -600];
    rim.transform.rotation.value = [24, 152, 0];

    // 炉火点光
    const fire = layer(comp, 'light', '炉火点光', {});
    fire.light.kind = 'point';
    fire.light.color = '#ff6a1e';
    fire.light.intensity = P(0);
    fire.light.shadow = false;
    fire.transform.position.value = [0, -180, 560];
    fire.light.intensity.expr = '2.4 + wiggle(1.4, 0.9) + 2.0 * clamp(sin(time*2.2)*0.5+0.5, 0, 1)';

    // 地面
    const ground = layer(comp, 'geo3d', '地面 · 铁砧台', {});
    ground.geo = { kind: 'plane', w: 4200, h: 4200 };
    ground.material = {
      color: '#0e0f13', metalness: 0.05, roughness: 0.92,
      emissive: '#ff6a1e', emissiveIntensity: 0, opacity: 100,
      grid: true, castShadow: false, receiveShadow: true, env: 0.30,
    };
    ground.transform.position.value = [0, -330, 0];
    ground.transform.rotation.value = [-90, 0, 0];
    ground.is3D = true;
    ground.locked = true;

    // 锻锤
    const hammer = layer(comp, 'geo3d', '锻锤', {});
    hammer.geo = {
      kind: 'custom',
      parts: [
        { kind: 'box', w: 430, h: 200, d: 220, x: 0, y: 0, z: 0 },
        { kind: 'box', w: 470, h: 58, d: 244, x: 0, y: 108, z: 0 },
        { kind: 'cylinder', r: 26, h: 520, x: 0, y: 330, z: 0 },
        { kind: 'cylinder', r: 35, h: 96, x: 0, y: 566, z: 0 },
      ],
    };
    hammer.material = { color: '#7c828c', metalness: 0.95, roughness: 0.26, emissive: '#ff7a2a', emissiveIntensity: P(0), opacity: 100 };
    hammer.transform.anchor.value = [0, 600, 0];
    hammer.transform.position.value = [620, 900, 40];
    hammer.transform.rotation.value = [0, 0, 16];
    hammer.is3D = true;
    kf(hammer.transform.rotation, [
      [0, [0, 0, 16], 'ease'],
      [4.6, [0, 0, 20], 'ease'],
      [5.7, [0, 0, 34], 'ease'],
      [6.15, [0, 0, 40]],
      [6.55, [0, 0, 6], 'strike'],
      [6.85, [0, 0, -42], 'out'],
      [7.02, [0, 0, -20], 'out'],
      [7.4, [0, 0, 10], 'ease'],
      [8.1, [0, 0, 26], 'ease'],
      [8.3, [0, 0, 30]],
      [8.48, [0, 0, 2], 'strike'],
      [8.55, [0, 0, -42], 'out'],
      [8.72, [0, 0, -18], 'out'],
      [9.1, [0, 0, 8], 'ease'],
      [9.7, [0, 0, 32], 'ease'],
      [9.95, [0, 0, 36]],
      [10.3, [0, 0, -2], 'strike'],
      [10.35, [0, 0, -44], 'out'],
      [10.55, [0, 0, -18], 'out'],
      [11.0, [0, 0, 12], 'ease'],
      [12.0, [0, 0, 24], 'ease'],
      [13.2, [0, 0, 30], 'ease'],
      [15, [0, 0, 30]],
    ]);
    kf(hammer.transform.position, [
      [0, [455, 1477, 30], 'ease'],
      [4.6, [355, 1384, 30], 'ease'],
      [5.7, [165, 1257, 40], 'ease'],
      [6.15, [44, 1160, 50], 'in'],
      [6.85, [541, 726, 60], 'out'],
      [7.02, [425, 1064, 55], 'out'],
      [7.4, [296, 1291, 40], 'ease'],
      [8.2, [157, 1239, 40], 'in'],
      [8.55, [321, 626, 60], 'out'],
      [8.72, [405, 1071, 55], 'out'],
      [9.2, [296, 1311, 40], 'ease'],
      [9.8, [92, 1229, 40], 'in'],
      [10.3, [477, 682, 60], 'out'],
      [10.6, [395, 1077, 55], 'out'],
      [11.2, [375, 1387, 40], 'ease'],
      [13.2, [460, 1620, 20], 'ease'],
      [15, [500, 1670, 0]],
    ]);
    kf(hammer.material.emissiveIntensity, [
      [6.78, 0], [6.9, 1.5], [7.3, 0], [8.5, 0], [8.6, 1.3], [9.0, 0],
      [10.28, 0], [10.4, 1.9], [10.9, 0], [15, 0],
    ]);

    // 锻字
    const block = layer(comp, 'text', '锻字', {});
    block.text.content = '锻';
    block.text.size = 500;
    block.text.weight = 900;
    block.text.family = 'sans';
    block.text.color = '#c9ccd2';
    block.text.align = 'center';
    block.is3D = true;
    block.geometryDepth = 86;
    block.material = {
      color: '#b9bec7', metalness: 0.92, roughness: 0.24,
      emissive: '#ff5a16', emissiveIntensity: P(0), opacity: 100,
    };
    block.transform.position.value = [0, -120, 0];
    block.transform.anchor.value = [0, 0, 0];
    block.transform.scale.value = [100, 100, 0.001];
    block.transform.opacity.value = 0;
    kf(block.transform.scale, [
      [0, [100, 100, 0.001]],
      [3.0, [100, 100, 0.001], 'in'],
      [3.9, [100, 100, 104], 'out'],
      [4.25, [100, 100, 96], 'ease'],
      [4.7, [100, 100, 100]],
      [6.8, [100, 100, 100]],
      [6.87, [103, 96, 100], 'out'],
      [7.15, [98.5, 102, 100], 'ease'],
      [7.55, [100, 100, 100]],
      [8.5, [100, 100, 100]],
      [8.57, [103.5, 95.5, 100], 'out'],
      [8.9, [98, 102.5, 100], 'ease'],
      [9.3, [100, 100, 100]],
      [10.3, [100, 100, 100]],
      [10.37, [104, 95, 100], 'out'],
      [10.75, [97.5, 103, 100], 'ease'],
      [11.3, [100, 100, 100]],
      [15, [100, 100, 100]],
    ]);
    kf(block.transform.opacity, [[0, 0], [3.0, 0], [3.55, 100], [15, 100]]);
    kf(block.material.emissiveIntensity, [
      [0, 0], [2.8, 0], [3.4, 0.7], [4.0, 1.35], [5.0, 1.05], [6.0, 1.3],
      [6.8, 1.9], [7.2, 1.35], [8.0, 1.15], [8.5, 1.7], [8.9, 1.2],
      [9.8, 1.1], [10.3, 2.1], [10.8, 1.15], [11.6, 0.5], [12.6, 0.12], [15, 0.03],
    ]);
    block.dents = [
      { t: 6.85, p: [140, 400, 86], r: 170, amp: 42 },
      { t: 8.55, p: [-80, 300, 86], r: 155, amp: 36 },
      { t: 10.35, p: [60, 370, 86], r: 190, amp: 48 },
    ];

    // 字形笔画（2D）
    const strokes = layer(comp, 'shape', '字形笔画', {});
    const glyphLayer = U.createLayer(comp, 'text', 'tmp');
    glyphLayer.text.content = '锻';
    glyphLayer.text.size = 500;
    glyphLayer.text.weight = 900;
    glyphLayer.text.family = 'sans';
    glyphLayer.text.align = 'center';
    const gcontours = global.AEText.textContours(glyphLayer, 0);
    strokes.shapes = [{ kind: 'contours', contours: gcontours, closed: true }];
    strokes.fill = { enabled: false, color: '#000', opacity: 100 };
    strokes.stroke = { enabled: true, color: '#ffb066', width: 7, opacity: 100 };
    strokes.modifiers = {
      trim: { enabled: true, start: P(0), end: P(6), offset: P(0), stagger: 3.4 },
      repeater: null, merge: null,
    };
    strokes.effects = [{ type: 'glow', enabled: true, params: { radius: 26, intensity: 1.1, color: '#ff8a3c' } }];
    strokes.transform.position.value = [0, -120, 0];
    kf(strokes.modifiers.trim.end, [[0, 6], [0.4, 24], [1.2, 50], [2.1, 76], [2.95, 100], [15, 100]]);
    kf(strokes.modifiers.trim.start, [[0, 0], [0.4, 2], [1.2, 22], [2.1, 48], [2.95, 100], [15, 100]]);
    kf(strokes.transform.opacity, [[0, 100], [2.9, 100], [3.5, 0], [15, 0]]);

    // 火星
    const sparks = layer(comp, 'particle', '锻打火星', {});
    sparks.particles = {
      emitters: [
        { start: 4.0, end: 12.0, rate: 14, speed: 100, spread: 55, direction: [0, 1, 0.35], pos: [0, 270, 92], life: 1.7 },
        { emitTime: 6.85, burst: 110, speed: 780, spread: 72, direction: [0, 0.55, 0.83], pos: [140, 280, 104] },
        { emitTime: 8.55, burst: 90, speed: 720, spread: 70, direction: [0, 0.6, 0.8], pos: [-80, 160, 104] },
        { emitTime: 10.35, burst: 150, speed: 860, spread: 76, direction: [0, 0.6, 0.8], pos: [60, 250, 104] },
      ],
      rate: 0, speed: 700, life: 1.25, size: 7, color: '#ffe6a8', colorEnd: '#ff3a0a',
      gravity: -1150, drag: 0.018, seed: 11, spread: 70, speedRandom: 0.55,
      collision: true, secondary: true, trail: 0.16, bounce: 0.4,
      colliders: [
        { type: 'plane', point: [0, -330, 0], normal: [0, 1, 0], restitution: 0.42, friction: 0.72 },
        { type: 'box', min: [-285, -220, 0], max: [285, 345, 86], restitution: 0.5, friction: 0.8 },
      ],
      emitTime: 0, emitDuration: 0,
    };
    sparks.material = { color: '#ffb15a', emissive: '#ff7a2a', emissiveIntensity: 4, metalness: 0, roughness: 1, opacity: 100 };
    sparks.blendMode = 'add';

    // 调整层
    const adj = layer(comp, 'adjust', '调整层 · 辉光', {});
    adj.effects = [{ type: 'glow', enabled: true, params: { radius: 30, intensity: 0.24, color: '#ff8a3c' } }];
    adj.transform.opacity.value = 100;

    // 音色
    const audio = layer(comp, 'audio', '锻字 · 配乐', {});
    audio.audio = {
      patch: 'forge', gain: 0.75, rate: 1,
      events: [
        { t: 0.0, type: 'drone', dur: 15, gain: 0.5 },
        { t: 0.55, type: 'whoosh', dur: 0.6, gain: 0.35 },
        { t: 1.4, type: 'write', dur: 1.6, gain: 0.25 },
        { t: 3.15, type: 'heat', dur: 2.8, gain: 0.5 },
        { t: 5.0, type: 'riser', dur: 1.85, gain: 0.6 },
        { t: 6.85, type: 'impact', gain: 1.0 },
        { t: 8.55, type: 'impact', gain: 0.85 },
        { t: 10.35, type: 'impact', gain: 1.25 },
        { t: 11.0, type: 'sizzle', dur: 2.2, gain: 0.5 },
        { t: 13.1, type: 'chime', gain: 0.6 },
      ],
    };
    audio.locked = true;

    const project = {
      version: 1,
      name: '锻字 · AE 风味动效设计',
      comps: [comp],
      activeCompId: comp.id,
    };
    return project;
  }

  global.AEDemo = { build };
})(window);