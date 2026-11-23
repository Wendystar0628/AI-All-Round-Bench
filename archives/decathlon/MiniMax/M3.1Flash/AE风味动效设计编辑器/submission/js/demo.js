/* ============================================================
   demo.js — 默认示例工程《锻字》15 秒
   全部由编辑器自身的数据结构生成：图层 / 关键帧 / 表达式 / 材质 / 模拟
   阶段：写成 → 成块 → 锻打 → 冷却
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const D = AE.demo = {};

  const CHAR = '锻';

  /* ---------------- 工具 ---------------- */
  function track(keys, spatial) {
    const tr = { keys: [], spatial: !!spatial };
    for (const k of keys) {
      tr.keys.push({
        t: k.t, v: Array.isArray(k.v) ? k.v.slice() : k.v,
        inInterp: k.interp || 'bezier', outInterp: k.interp || 'bezier',
        inEase: k.ease || null, outEase: k.ease || null,
        hi: { dt: 0, dv: 0 }, ho: { dt: 0, dv: 0 }, sp: null, selected: false
      });
    }
    AE.anim.refreshHandles(tr);
    if (spatial) AE.anim.autoSpatial(tr);
    return tr;
  }
  function setProp(layer, key, value, tr) {
    layer.props[key] = { v: Array.isArray(value) ? value.slice() : value, tr: tr || null, ex: null };
  }
  function setExpr(layer, key, expr) {
    if (!layer.props[key]) layer.props[key] = { v: 0, tr: null, ex: null };
    layer.props[key].ex = expr;
  }

  /* ---------------- 字形 → 笔画 ---------------- */
  function characterStrokes(char, size) {
    const fontOpts = { family: 'Microsoft YaHei', weight: 700 };
    const gl = AE.text.glyph(char, fontOpts);
    let contours = gl.contours.map(c => ({ pts: c.pts, hole: c.hole }));
    // 判定孔洞（包含关系）
    contours = contours.map(c => {
      let depth = 0;
      for (const o of contours) {
        if (o === c) continue;
        if (AE.path.containsPoint(o.pts, c.pts[0])) depth++;
      }
      return { pts: c.pts, hole: depth % 2 === 1 };
    });
    // 缩放并居中（em 的 y 轴向上，图形空间 y 向下 → 取反）
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of contours) for (const p of c.pts) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const scale = size / Math.max(1e-6, (y1 - y0));
    for (const c of contours) {
      c.pts = c.pts.map(p => [(p[0] - cx) * scale, -(p[1] - cy) * scale]);
      let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
      for (const p of c.pts) {
        sx0 = Math.min(sx0, p[0]); sy0 = Math.min(sy0, p[1]);
        sx1 = Math.max(sx1, p[0]); sy1 = Math.max(sy1, p[1]);
      }
      c.cx = (sx0 + sx1) / 2; c.cy = (sy0 + sy1) / 2;
      c.h = sy1 - sy0;
    }
    // 书写顺序：左部（偏左）先写，再写右部；组内自上而下
    const mid = contours.reduce((s, c) => s + c.cx, 0) / contours.length;
    const left = contours.filter(c => c.cx < mid).sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    const right = contours.filter(c => c.cx >= mid).sort((a, b) => a.cy - b.cy || a.cx - b.cx);
    return { strokes: left.concat(right), scale, cx, cy, fontOpts };
  }

  /* ---------------- 构建工程 ---------------- */
  D.build = function () {
    const project = AE.model.createProject('锻字');
    const comp = project.comps[0];
    comp.name = '锻字 · 主合成';
    comp.w = 1920; comp.h = 1080; comp.fps = 30; comp.duration = 15;
    comp.workStart = 0; comp.workEnd = 15;
    comp.bgColor = '#070a0e';
    comp.motionBlur = { enabled: false, shutter: 180, phase: 50 };

    const CENTER = [960, 470];
    const charInfo = characterStrokes(CHAR, 560);
    const strokes = charInfo.strokes;

    /* ---------- 1. 锻字（实体，笔画逐写、逐成块、锤击变形、冷却） ---------- */
    const charL = AE.model.createLayer('solid3d', '锻字', comp);
    charL.threeD = true;
    setProp(charL, 'position', [CENTER[0], CENTER[1], 0]);
    setProp(charL, 'anchor', [0, 0]);
    setProp(charL, 'scale', [100, 100]);
    setProp(charL, 'extrude', 0, track([
      { t: 3.95, v: 0, ease: 'easeInOut' },
      { t: 5.0, v: 26, ease: 'easeOut' },
      { t: 5.75, v: 168, ease: 'easeInOut' },
      { t: 6.3, v: 158, ease: 'easeInOut' },
      { t: 14.0, v: 160 }
    ]));
    setProp(charL, 'bevel', 7, track([
      { t: 4.6, v: 0 },
      { t: 5.6, v: 9 }
    ]));
    // 材质：冷铁 → 炽热 → 冷却
    setProp(charL, 'baseColor', '#ffb066', track([
      { t: 0, v: '#ffb066' },
      { t: 3.9, v: '#ffb066' },
      { t: 5.2, v: '#d2701f' },
      { t: 8.8, v: '#8a4a18' },
      { t: 11.4, v: '#7d8894' },
      { t: 15, v: '#8d97a4' }
    ]));
    setProp(charL, 'metallic', 92, track([
      { t: 0, v: 60 }, { t: 4.4, v: 55 }, { t: 5.4, v: 72 }, { t: 11.0, v: 95 }, { t: 15, v: 93 }
    ]));
    setProp(charL, 'roughness', 26, track([
      { t: 0, v: 40 }, { t: 5.2, v: 44 }, { t: 7.0, v: 52 }, { t: 11.2, v: 24 }, { t: 15, v: 21 }
    ]));
    setProp(charL, 'emissive', '#ff6a18');
    setProp(charL, 'emissiveIntensity', 0, track([
      { t: 0, v: 0.22 },
      { t: 3.8, v: 0.28 },
      { t: 5.0, v: 0.5 },
      { t: 6.2, v: 0.72 },
      { t: 6.52, v: 1.35, ease: 'expoOut' },
      { t: 6.9, v: 0.62 },
      { t: 7.52, v: 1.45, ease: 'expoOut' },
      { t: 7.9, v: 0.62 },
      { t: 8.52, v: 1.6, ease: 'expoOut' },
      { t: 9.1, v: 0.66 },
      { t: 10.4, v: 0.3 },
      { t: 12.0, v: 0.09 },
      { t: 13.6, v: 0.015 },
      { t: 15, v: 0 }
    ]));
    // 表达式：热度带延迟与微颤（wiggle 的增量用 wiggle-value 取）
    setExpr(charL, 'emissiveIntensity', 'valueAtTime(time - 0.12) + (wiggle(2.4, 0.18) - value)');
    // 整体姿态
    setProp(charL, 'rotation', 0, track([
      { t: 0, v: 0 }, { t: 4.0, v: 0 },
      { t: 6.0, v: -7 }, { t: 9.6, v: -4 },
      { t: 12.6, v: 2 }, { t: 15, v: 0 }
    ]));
    setProp(charL, 'rotationX', 0, track([
      { t: 0, v: 0 }, { t: 4.6, v: 0 },
      { t: 6.2, v: -13 }, { t: 9.8, v: -9 },
      { t: 12.8, v: -2 }, { t: 15, v: -4 }
    ]));
    setProp(charL, 'rotationY', 0, track([
      { t: 0, v: 0 }, { t: 4.6, v: 0 },
      { t: 6.2, v: 22 }, { t: 9.8, v: 17 },
      { t: 12.8, v: 7 }, { t: 15, v: 9 }
    ]));
    setProp(charL, 'scale', [100, 100], track([
      { t: 0, v: [100, 100] },
      { t: 4.0, v: [104, 104] },
      { t: 5.0, v: [99, 99] },
      { t: 5.8, v: [103, 103] },
      { t: 6.55, v: [101, 100] },
      { t: 7.55, v: [100, 99] },
      { t: 8.55, v: [99, 98] },
      { t: 10.6, v: [100, 100] },
      { t: 12.6, v: [102, 102] },
      { t: 15, v: [100, 100] }
    ]));
    // 图钉：锤击点受击变形
    const pinDefs = [
      { id: 'p1', x: 150, y: -40, z: 0, rot: 0, scale: 100 },
      { id: 'p2', x: -40, y: 120, z: 0, rot: 0, scale: 100 }
    ];
    charL.solid = { paths: [], pins: [] };
    for (let i = 0; i < strokes.length; i++) {
      const st = strokes[i];
      charL.solid.paths.push({ id: 's' + i, pts: st.pts, hole: st.hole });
    }
    // 逐笔书写：骨架分析得到的笔画顺序 + 显现时间场
    charL.solid.reveal = {
      char: CHAR, family: charInfo.fontOpts.family, weight: charInfo.fontOpts.weight,
      scale: charInfo.scale, cx: charInfo.cx, cy: charInfo.cy,
      start: 0.22, end: 3.85
    };
    // 三次锤击分别作用于两个图钉
    const strikes = [6.55, 7.55, 8.55];
    for (const pd of pinDefs) {
      const keys = [];
      for (const s of strikes) {
        keys.push({ t: s - 0.16, v: { x: pd.x, y: pd.y, z: 0, rot: 0, scale: 100 } });
        keys.push({ t: s, v: { x: pd.x, y: pd.y, z: 0, rot: pd.id === 'p1' ? -13 : 9, scale: 86 } });
        keys.push({ t: s + 0.22, v: { x: pd.x, y: pd.y, z: 0, rot: pd.id === 'p1' ? -6 : 4, scale: 94 } });
      }
      keys.push({ t: 0, v: { x: pd.x, y: pd.y, z: 0, rot: 0, scale: 100 } });
      keys.push({ t: 15, v: { x: pd.x, y: pd.y, z: 0, rot: 0, scale: 100 } });
      keys.sort((a, b) => a.t - b.t);
      const pin = { id: pd.id, props: {}, enabled: true };
      pin.props = {
        x: { v: pd.x, tr: null, ex: null },
        y: { v: pd.y, tr: null, ex: null },
        z: { v: 0, tr: null, ex: null },
        rotation: { v: 0, tr: null, ex: null },
        scale: { v: 100, tr: null, ex: null }
      };
      // 用关键帧轨道驱动 rot / scale
      pin.props.rotation.tr = track(keys.map(k => ({ t: k.t, v: k.v.rot })));
      pin.props.scale.tr = track(keys.map(k => ({ t: k.t, v: k.v.scale })));
      charL.solid.pins.push(pin);
    }
    charL.inPoint = 0; charL.outPoint = 15;

    /* ---------- 2. 铁砧（承接阴影与火星碰撞） ---------- */
    const anvil = AE.model.createLayer('solid3d', '铁砧', comp);
    anvil.threeD = true;
    setProp(anvil, 'position', [CENTER[0], 880, 180]);
    setProp(anvil, 'extrude', 90);
    setProp(anvil, 'bevel', 10);
    setProp(anvil, 'baseColor', '#2b3138');
    setProp(anvil, 'metallic', 72);
    setProp(anvil, 'roughness', 58);
    anvil.solid = {
      paths: [{ id: 'a1', pts: [[-620, -46], [620, -46], [620, 46], [-620, 46]], hole: false }],
      pins: []
    };
    anvil.inPoint = 0; anvil.outPoint = 15;

    /* ---------- 3. 锤（下落与回弹） ---------- */
    const hammer = AE.model.createLayer('solid3d', '锤', comp);
    hammer.threeD = true;
    const HX = CENTER[0] + 60, HY = CENTER[1] - 30;
    setProp(hammer, 'position', [HX, -320, 240]);
    setProp(hammer, 'rotation', 0, track([
      { t: 0, v: -18 }, { t: 5.6, v: -18 },
      { t: 6.55, v: -6 }, { t: 6.75, v: -12 },
      { t: 7.55, v: -6 }, { t: 7.75, v: -12 },
      { t: 8.55, v: -5 }, { t: 8.8, v: -13 },
      { t: 10.5, v: -22 }, { t: 15, v: -20 }
    ]));
    setProp(hammer, 'rotationX', 0, track([
      { t: 0, v: 12 }, { t: 6.4, v: 6 }, { t: 6.75, v: 18 },
      { t: 7.4, v: 6 }, { t: 7.75, v: 18 },
      { t: 8.4, v: 6 }, { t: 8.8, v: 20 }, { t: 15, v: 14 }
    ]));
    setProp(hammer, 'extrude', 150);
    setProp(hammer, 'bevel', 8);
    setProp(hammer, 'baseColor', '#4a5158');
    setProp(hammer, 'metallic', 88);
    setProp(hammer, 'roughness', 34);
    const hammerKeys = [];
    for (const s of strikes) {
      hammerKeys.push({ t: s - 0.75, v: -330 });
      hammerKeys.push({ t: s - 0.22, v: -300, ease: 'expoIn' });
      hammerKeys.push({ t: s - 0.055, v: 6, ease: 'expoIn' });
      hammerKeys.push({ t: s + 0.02, v: -46, ease: 'expoOut' });
      hammerKeys.push({ t: s + 0.34, v: -270, ease: 'bounceOut' });
    }
    hammerKeys.push({ t: 0, v: -360 });
    hammerKeys.push({ t: 15, v: -340 });
    hammerKeys.sort((a, b) => a.t - b.t);
    setProp(hammer, 'position', [HX, HY, 240], track(hammerKeys));
    hammer.solid = {
      paths: [
        { id: 'h1', pts: [[-190, -60], [190, -60], [190, 60], [-190, 60]], hole: false },
        { id: 'h2', pts: [[-30, 60], [30, 60], [26, 320], [-26, 320]], hole: false }
      ],
      pins: []
    };
    hammer.inPoint = 0; hammer.outPoint = 15;

    /* ---------- 4. 火星（粒子） ---------- */
    const spark = AE.model.createLayer('particle', '火星', comp);
    spark.threeD = true;
    spark.emitter = { type: 'point', position: [0, 0, 0], follow: null, surfaceLayer: null, curvePoints: [] };
    const sparkPos = [];
    for (const s of strikes) {
      sparkPos.push({ t: s - 0.02, v: [CENTER[0] + 40, CENTER[1] - 30, 200] });
      sparkPos.push({ t: s + 0.5, v: [CENTER[0] + 40, CENTER[1] - 30, 200] });
    }
    sparkPos.push({ t: 0, v: [CENTER[0] + 40, CENTER[1] - 30, 200] });
    sparkPos.push({ t: 15, v: [CENTER[0] + 40, CENTER[1] - 30, 200] });
    sparkPos.sort((a, b) => a.t - b.t);
    setProp(spark, 'position', [CENTER[0] + 40, CENTER[1] - 30, 200], track(sparkPos));
    setProp(spark, 'pRate', 0, track([
      { t: 0, v: 0 },
      { t: 6.52, v: 0 },
      { t: 6.54, v: 520, ease: 'expoOut' },
      { t: 6.95, v: 90 },
      { t: 7.2, v: 0 },
      { t: 7.52, v: 0 },
      { t: 7.54, v: 620, ease: 'expoOut' },
      { t: 7.95, v: 110 },
      { t: 8.2, v: 0 },
      { t: 8.52, v: 0 },
      { t: 8.54, v: 700, ease: 'expoOut' },
      { t: 8.98, v: 120 },
      { t: 9.3, v: 0 },
      { t: 15, v: 0 }
    ]));
    setProp(spark, 'pSpeed', 560, track([
      { t: 6.5, v: 420 }, { t: 6.56, v: 760, ease: 'expoOut' },
      { t: 8.54, v: 860 }, { t: 15, v: 860 }
    ]));
    setProp(spark, 'pLife', 1.35, track([
      { t: 6.5, v: 1.0 }, { t: 6.56, v: 1.55, ease: 'expoOut' }, { t: 15, v: 1.55 }
    ]));
    setProp(spark, 'pSpread', 46);
    setProp(spark, 'pDrag', 0.55);
    setProp(spark, 'pGravity', 1500);
    setProp(spark, 'pSize', 7.5, track([
      { t: 6.5, v: 4 }, { t: 6.56, v: 9, ease: 'expoOut' }, { t: 15, v: 9 }
    ]));
    setProp(spark, 'pSizeEnd', 0.4);
    setProp(spark, 'pColor', '#ffd08a');
    setProp(spark, 'pColorEnd', '#c02a00');
    setProp(spark, 'pOpacity', 100);
    setProp(spark, 'pSeed', 17);
    setProp(spark, 'pTrail', 16);
    setProp(spark, 'pTrailWidth', 3.4);
    setProp(spark, 'pTrailColor', '#ff7a24');
    setProp(spark, 'pEmitter', 'point');
    spark.collider = anvil.id;
    spark.inPoint = 0; spark.outPoint = 15;

    /* ---------- 5. 炉火光晕 ---------- */
    const glow = AE.model.createLayer('shape', '炉火', comp);
    glow.shape.groups[0].paths.push({
      id: 'g1',
      path: AE.path.ellipse(0, 0, 420, 420),
      fill: { enabled: true, color: '#ff7a20', opacity: 26 },
      stroke: { enabled: false, color: '#ffffff', width: 0 }
    });
    setProp(glow, 'position', [CENTER[0], CENTER[1] + 30, 260]);
    setProp(glow, 'blendMode', 'add');
    setProp(glow, 'opacity', 0, track([
      { t: 3.9, v: 0 }, { t: 4.6, v: 42 }, { t: 5.4, v: 78 },
      { t: 6.55, v: 100 }, { t: 7.0, v: 62 },
      { t: 7.55, v: 100 }, { t: 8.0, v: 58 },
      { t: 8.55, v: 100 }, { t: 9.2, v: 56 },
      { t: 11.0, v: 30 }, { t: 13.0, v: 12 }, { t: 15, v: 8 }
    ]));
    // 炉火随锤击（控制器）起伏
    setExpr(glow, 'opacity', 'value + thisComp.layer("控制器").transform.opacity * 0.55');
    glow.inPoint = 0; glow.outPoint = 15;

    /* ---------- 6. 控制器（表达式引用） ---------- */
    const ctrl = AE.model.createLayer('null', '控制器', comp);
    setProp(ctrl, 'position', [CENTER[0], CENTER[1], 0]);
    setProp(ctrl, 'opacity', 0, track([
      { t: 0, v: 0 },
      { t: 6.5, v: 0 }, { t: 6.55, v: 100, ease: 'expoOut' },
      { t: 6.95, v: 0 },
      { t: 7.5, v: 0 }, { t: 7.55, v: 100, ease: 'expoOut' },
      { t: 7.95, v: 0 },
      { t: 8.5, v: 0 }, { t: 8.55, v: 100, ease: 'expoOut' },
      { t: 9.05, v: 0 },
      { t: 15, v: 0 }
    ]));
    ctrl.inPoint = 0; ctrl.outPoint = 15;

    /* ---------- 7. 余烬（loopOut 循环） ---------- */
    const ember = AE.model.createLayer('null', '余烬', comp);
    setProp(ember, 'position', [CENTER[0], CENTER[1], 0]);
    setProp(ember, 'opacity', 40, track([
      { t: 0, v: 40 }, { t: 1.15, v: 86 }, { t: 2.3, v: 40 }
    ]));
    setExpr(ember, 'opacity', 'loopOut("pingpong")');
    ember.inPoint = 0; ember.outPoint = 15;

    /* ---------- 8. 摄像机 ---------- */
    const cam = AE.model.createLayer('camera', '摄像机', comp);
    setProp(cam, 'camPosition', [960, 470, -2250], track([
      { t: 0, v: [960, 470, -2250] },
      { t: 3.9, v: [960, 470, -2060] },
      { t: 5.9, v: [1180, 560, -1860] },
      { t: 8.9, v: [1290, 520, -1790] },
      { t: 10.6, v: [1210, 520, -1900] },
      { t: 13.0, v: [1040, 500, -1960] },
      { t: 15, v: [1005, 492, -1990] }
    ]));
    // 摄像机抖动：取 wiggle 相对关键帧的增量，再按控制器强度缩放
    setExpr(cam, 'camPosition', 'value + (wiggle(15, 9) - value) * (thisComp.layer("控制器").transform.opacity / 100)');
    setProp(cam, 'camPoint', [960, 470, 0], track([
      { t: 0, v: [960, 470, 0] },
      { t: 5.9, v: [960, 470, 0] },
      { t: 8.9, v: [960, 460, 0] },
      { t: 13.0, v: [960, 470, 0] },
      { t: 15, v: [960, 470, 0] }
    ]));
    setProp(cam, 'camFov', 46, track([
      { t: 0, v: 46 }, { t: 4.2, v: 44 },
      { t: 6.0, v: 40 }, { t: 9.0, v: 38 },
      { t: 12.6, v: 36 }, { t: 15, v: 36 }
    ]));
    setProp(cam, 'camFocus', 1420, track([
      { t: 0, v: 1500 }, { t: 5.9, v: 1330 }, { t: 9.0, v: 1290 },
      { t: 13.0, v: 1400 }, { t: 15, v: 1420 }
    ]));
    // 表达式：锤击瞬间轻微拉焦
    setExpr(cam, 'camFocus', 'value + thisComp.layer("控制器").transform.opacity * 0.07');
    setProp(cam, 'camAperture', 0.0035);
    setProp(cam, 'camNear', 50);
    setProp(cam, 'camFar', 9000);
    cam.inPoint = 0; cam.outPoint = 15;

    /* ---------- 9. 灯光 ---------- */
    const key = AE.model.createLayer('light', '主光', comp);
    setProp(key, 'lightType', 'parallel');
    setProp(key, 'lightColor', '#fff1dc');
    setProp(key, 'lightIntensity', 1.45, track([
      { t: 0, v: 1.5 }, { t: 4.4, v: 1.35 },
      { t: 6.5, v: 1.7 }, { t: 6.6, v: 2.6, ease: 'expoOut' },
      { t: 7.2, v: 1.5 }, { t: 7.6, v: 2.8, ease: 'expoOut' },
      { t: 8.2, v: 1.5 }, { t: 8.6, v: 3.0, ease: 'expoOut' },
      { t: 9.4, v: 1.6 }, { t: 12.0, v: 1.35 }, { t: 15, v: 1.3 }
    ]));
    setProp(key, 'lightDir', [-0.42, -0.72, -0.55]);
    setProp(key, 'lightShadow', true);
    key.inPoint = 0; key.outPoint = 15;

    const fire = AE.model.createLayer('light', '炉火光', comp);
    setProp(fire, 'lightType', 'point');
    setProp(fire, 'lightColor', '#ff7a26');
    setProp(fire, 'lightIntensity', 0, track([
      { t: 0, v: 0 }, { t: 4.2, v: 0.4 }, { t: 5.6, v: 1.5 },
      { t: 6.6, v: 2.6, ease: 'expoOut' }, { t: 7.2, v: 1.3 },
      { t: 7.6, v: 2.8, ease: 'expoOut' }, { t: 8.2, v: 1.3 },
      { t: 8.6, v: 3.1, ease: 'expoOut' }, { t: 9.4, v: 1.4 },
      { t: 11.4, v: 0.6 }, { t: 13.0, v: 0.18 }, { t: 15, v: 0.08 }
    ]));
    setProp(fire, 'lightPos', [CENTER[0] + 40, CENTER[1] - 20, 320]);
    setProp(fire, 'lightFalloff', 1500);
    setProp(fire, 'lightShadow', false);
    fire.inPoint = 0; fire.outPoint = 15;

    const rim = AE.model.createLayer('light', '冷光', comp);
    setProp(rim, 'lightType', 'point');
    setProp(rim, 'lightColor', '#63b8ef');
    setProp(rim, 'lightIntensity', 1.05);
    setProp(rim, 'lightPos', [260, 240, 820]);
    setProp(rim, 'lightFalloff', 2600);
    setProp(rim, 'lightShadow', false);
    rim.inPoint = 0; rim.outPoint = 15;

    /* ---------- 10. 字幕 ---------- */
    const sub = AE.model.createLayer('text', '字幕', comp);
    sub.text.content = '一字成器';
    sub.text.animator = {
      mode: 'chars', from: 0, to: 100, offset: 0, smoothness: 0.4,
      position: [0, 34], rotation: 0, scale: 100, opacity: 100,
      enabled: true, startTime: 12.2, endTime: 13.4
    };
    setProp(sub, 'fontSize', 54);
    setProp(sub, 'leading', 1.4);
    setProp(sub, 'tracking', 0.55);
    setProp(sub, 'align', 'center');
    setProp(sub, 'fontFamily', 'Microsoft YaHei');
    setProp(sub, 'fontWeight', '400');
    setProp(sub, 'fillColor', '#cfd8e3');
    setProp(sub, 'position', [960, 900, 0], track([
      { t: 12.0, v: [960, 900, 0] }, { t: 13.0, v: [960, 900, 0] }, { t: 15, v: [960, 900, 0] }
    ]));
    setProp(sub, 'opacity', 0, track([
      { t: 12.0, v: 0 }, { t: 12.8, v: 0 }, { t: 13.5, v: 92 }, { t: 15, v: 92 }
    ]));
    setExpr(sub, 'opacity', 'linear(time, 12.6, 13.4, 0, 92) * (value / 92)');
    sub.inPoint = 11.9; sub.outPoint = 15;

    /* ---------- 11. 调整层（调色） ---------- */
    const adj = AE.model.createLayer('adjustment', '调色', comp);
    setProp(adj, 'adjType', 'hsl');
    setProp(adj, 'adjHue', 0, track([
      { t: 0, v: 0 }, { t: 5.2, v: 8 }, { t: 8.8, v: 14 }, { t: 11.6, v: 0 }, { t: 15, v: -4 }
    ]));
    setProp(adj, 'adjSat', 0, track([
      { t: 0, v: -6 }, { t: 5.0, v: 12 }, { t: 8.8, v: 18 }, { t: 11.8, v: -4 }, { t: 15, v: -8 }
    ]));
    setProp(adj, 'adjLight', 0, track([
      { t: 0, v: -2 }, { t: 5.2, v: 4 }, { t: 8.6, v: 7 }, { t: 11.8, v: -1 }, { t: 15, v: -2 }
    ]));
    adj.inPoint = 0; adj.outPoint = 15;

    /* ---------- 12. 声音 ---------- */
    const snd = AE.model.createLayer('audio', '配乐', comp);
    setProp(snd, 'sndWave', 'metal');
    snd.sound = {
      events: [
        { time: 0.05, wave: 'sine', freq: 58, freqEnd: 52, dur: 4.2, vol: 0.42 },
        { time: 0.05, wave: 'sine', freq: 87, freqEnd: 78, dur: 4.0, vol: 0.16 },
        { time: 4.05, wave: 'noise', freq: 900, dur: 0.85, vol: 0.30 },
        { time: 4.15, wave: 'sine', freq: 120, freqEnd: 300, dur: 1.1, vol: 0.24 },
        { time: 6.55, wave: 'metal', freq: 520, dur: 1.5, vol: 0.85, seed: 11 },
        { time: 6.58, wave: 'noise', freq: 2600, dur: 0.45, vol: 0.42 },
        { time: 7.55, wave: 'metal', freq: 430, dur: 1.6, vol: 0.80, seed: 23 },
        { time: 7.58, wave: 'noise', freq: 2100, dur: 0.5, vol: 0.38 },
        { time: 8.55, wave: 'metal', freq: 640, dur: 1.9, vol: 0.95, seed: 37 },
        { time: 8.58, wave: 'noise', freq: 3200, dur: 0.6, vol: 0.45 },
        { time: 9.6, wave: 'shimmer', freq: 3200, dur: 2.6, vol: 0.22 },
        { time: 12.1, wave: 'sine', freq: 196, freqEnd: 98, dur: 3.0, vol: 0.34 },
        { time: 12.2, wave: 'sine', freq: 294, freqEnd: 147, dur: 2.8, vol: 0.18 }
      ]
    };
    snd.inPoint = 0; snd.outPoint = 15;

    /* ---------- 叠放顺序（索引 0 在最上层） ---------- */
    const order = [sub, spark, glow, adj, charL, hammer, anvil, ctrl, ember, key, fire, rim, cam, snd];
    comp.layers = order;

    /* ---------- 空间场 ---------- */
    const field = AE.fields.create('noise', '热浪');
    field.props.strength = { v: 34, tr: null, ex: null };
    field.props.radius = { v: 720, tr: null, ex: null };
    field.props.seed = { v: 5, tr: null, ex: null };
    field.props.position = { v: [960, 470, 120], tr: null, ex: null };
    comp.fields = [field];

    project.activeComp = comp.id;
    return project;
  };

  /** 替换示例中的字（保持工程化：字形、字块、变形与火星全部重算） */
  D.setCharacter = function (project, ch) {
    const comp = AE.model.activeComp(project);
    const layer = comp.layers.find(l => l.name === '锻字');
    if (!layer) return false;
    const info = characterStrokes(ch, 560);
    layer.solid.paths = info.strokes.map((st, i) => ({ id: 's' + i, pts: st.pts, hole: st.hole }));
    layer.solid.reveal = {
      char: ch, family: info.fontOpts.family, weight: info.fontOpts.weight,
      scale: info.scale, cx: info.cx, cy: info.cy, start: 0.22, end: 3.85
    };
    layer.name = ch;
    return true;
  };
})(window);
