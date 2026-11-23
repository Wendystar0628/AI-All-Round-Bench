/* 合成画布叠加层：选择框与手柄、运动路径与关键帧点、蒙版轮廓、摄像机 / 灯光 / 发射器图标；点选与直接拖动。
 * 二维图层按正交投影绘制，三维图层按当前摄像机投影绘制，与画面保持一致。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = AE.UI;
  const U = AE.U;
  const M = U.mat;
  const Model = AE.Model;
  const Anim = AE.Anim;
  const App = AE.App;
  const Shapes = AE.Shapes;
  const P = AE.Path;
  const V = (UI.viewer = {});

  let ov, g;
  let dragState = null;
  let cam = null;
  let camKey = null;

  // 合成坐标 -> 画布 CSS 坐标
  function toCss(p3, layer3d) {
    const c = App.comp();
    const f = App.cssFit || 1;
    if (!layer3d || !cam) return [p3[0] * f, p3[1] * f];
    const v = [p3[0], p3[1], p3[2] || 0, 1];
    const VP = cam.VP;
    const x = VP[0] * v[0] + VP[4] * v[1] + VP[8] * v[2] + VP[12];
    const y = VP[1] * v[0] + VP[5] * v[1] + VP[9] * v[2] + VP[13];
    const w = VP[3] * v[0] + VP[7] * v[1] + VP[11] * v[2] + VP[15];
    const nx = x / (w || 1), ny = y / (w || 1);
    const W = c.width * f, H = c.height * f;
    return [(nx + 1) / 2 * W, (1 - ny) / 2 * H];
  }
  V.toCss = toCss;

  function refreshCam() {
    const c = App.comp();
    const ctx = { world: new Map(), visiting: new Set(), stack: [c.id], Wr: 1, Hr: 1 };
    cam = App.renderer ? App.renderer.cameraOf(c, App.state.time, ctx) : null;
    camKey = App.state.time;
  }

  // 图层的世界矩阵（合成坐标）
  function worldOf(layer) {
    const c = App.comp();
    const R = AE.Renderer.prototype.worldOf;
    return R.call({ worldOf: R }, c, layer, App.state.time, { world: new Map(), visiting: new Set() });
  }

  // 图层局部包围盒（局部坐标，二维）与角点
  function localBounds(layer) {
    const c = App.comp();
    const t = App.state.time;
    if (layer.type === 'shape' || layer.type === 'text') {
      const draws = Shapes.evaluate(c, layer, t);
      const cont = draws.flatMap((d) => d.contours || []);
      const b = P.bounds(cont);
      if (b) return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, z: 0 };
    }
    if (layer.type === 'geo') {
      const geo = AE.Graph.geometryOf(App.project, c, layer, t);
      if (geo && geo.kind === 'mesh') {
        const b = AE.Mesh.bounds(geo);
        return { x0: b.min[0], y0: b.min[1], x1: b.max[0], y1: b.max[1], z: 0 };
      }
      if (geo && geo.kind === 'contours') {
        const b = P.bounds(geo.contours);
        if (b) return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, z: 0 };
      }
    }
    if (layer.type === 'precomp') {
      const ch = App.project.comps.find((q) => q.id === layer.pre.comp);
      if (ch) return { x0: -ch.width / 2, y0: -ch.height / 2, x1: ch.width / 2, y1: ch.height / 2, z: 0 };
    }
    return { x0: -60, y0: -60, x1: 60, y1: 60, z: 0 };
  }

  // 图层的屏幕包围框（CSS 坐标）
  function screenBox(layer) {
    const b = localBounds(layer);
    const w = worldOf(layer);
    const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].map(([x, y]) => M.transformPoint(w, [x, y, 0]));
    const is3 = layer.is3D;
    const css = pts.map((p) => toCss(p, is3));
    const xs = css.map((p) => p[0]), ys = css.map((p) => p[1]);
    return {
      corners: css,
      x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys),
      world: w,
      local: b,
      is3: is3,
    };
  }
  V.screenBox = screenBox;

  // 绘制
  function draw() {
    if (!ov) return;
    const f = App.cssFit || 1;
    const dpr = window.devicePixelRatio || 1;
    const cssW = parseFloat(ov.style.width) || ov.width / dpr, cssH = parseFloat(ov.style.height) || ov.height / dpr;
    if (ov.width !== Math.round(cssW * dpr)) {
      ov.width = Math.round(cssW * dpr);
      ov.height = Math.round(cssH * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    if (!App.comp()) return;
    refreshCam();
    const c = App.comp();
    const sel = App.state.selected.map((id) => App.layer(id)).filter(Boolean);
    // 图层标记（摄像机 / 灯光 / 发射点）
    c.layers.forEach((L) => {
      if (!L.enabled) return;
      if (L.type === 'camera' || L.type === 'light') {
        const w = worldOf(L);
        const p = toCss([w[12], w[13], w[14]], true);
        const on = sel.includes(L);
        drawIcon(p, L.type, on);
        if (on) drawLabel(p, L.name);
      }
      if (L.type === 'particles') {
        (L.particles.emitters || []).forEach((e) => {
          const w = worldOf(L);
          const pl = Anim.value(c, L, e.pos, App.state.time);
          const p = toCss(M.transformPoint(w, pl), true);
          g.fillStyle = '#7fd7f0';
          g.beginPath();
          g.arc(p[0], p[1], 4, 0, Math.PI * 2);
          g.fill();
        });
      }
    });
    // 选中图层：路径、蒙版、包围框、手柄
    sel.forEach((L, i) => {
      if (!Model.layerActive(L, App.state.time) && !i) {
        // 不活动的图层也显示框（半透明）
      }
      const box = screenBox(L);
      const primary = i === 0;
      drawMotionPath(L, primary);
      if (L.masks && L.masks.length && primary) drawMasks(L);
      g.strokeStyle = primary ? '#ff8a3d' : '#ffd08a';
      g.lineWidth = primary ? 1.5 : 1;
      g.setLineDash(primary ? [] : [4, 3]);
      g.beginPath();
      box.corners.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.stroke();
      g.setLineDash([]);
      if (primary) {
        drawHandles(box, L);
        if (L.type === 'shape') drawShapeNodes(L);
        if (L.type === 'geo' || L.type === 'particles') drawFieldRanges(L);
        if (L.type === 'geo') drawMeshWire(L);
        if (L.is3D && L.type !== 'light' && L.type !== 'camera') drawGizmo(L);
      }
    });
    // 活动选中图层的锚点
    if (sel.length) {
      const L = sel[0];
      const w = worldOf(L);
      const anc = Anim.value(c, L, L.tr.anchor, App.state.time);
      const p = toCss(M.transformPoint(w, [anc[0], anc[1], anc[2] || 0]), L.is3D);
      g.strokeStyle = '#ffffff';
      g.beginPath();
      g.arc(p[0], p[1], 4, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.moveTo(p[0] - 7, p[1]);
      g.lineTo(p[0] + 7, p[1]);
      g.moveTo(p[0], p[1] - 7);
      g.lineTo(p[0], p[1] + 7);
      g.stroke();
    }
    // 绘制预览（最上层）
    if (drawing || pen) drawDrawingPreview();
    void f;
  }

  function drawIcon(p, type, on) {
    g.save();
    g.translate(p[0], p[1]);
    g.fillStyle = on ? '#ff8a3d' : 'rgba(255,255,255,0.75)';
    g.strokeStyle = '#111';
    g.lineWidth = 1;
    if (type === 'camera') {
      g.fillRect(-12, -8, 18, 16);
      g.beginPath();
      g.moveTo(6, -4);
      g.lineTo(16, -9);
      g.lineTo(16, 9);
      g.lineTo(6, 4);
      g.fill();
    } else {
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
        g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
      }
      g.stroke();
    }
    g.restore();
  }
  function drawLabel(p, txt) {
    g.font = '12px sans-serif';
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(p[0] + 10, p[1] - 22, g.measureText(txt).width + 8, 16);
    g.fillStyle = '#fff';
    g.fillText(txt, p[0] + 14, p[1] - 10);
  }

  // 运动路径（空间位置关键帧）
  function drawMotionPath(L, primary) {
    const c = App.comp();
    const pos = L.tr.position;
    if (!pos.animated || pos.keys.length < 1) return;
    const w0 = (layer) => worldOf(layer);
    const f0 = pos.keys[0].t, f1 = pos.keys[pos.keys.length - 1].t;
    const N = Math.min(300, Math.max(30, Math.round((f1 - f0) * 60)));
    g.strokeStyle = primary ? 'rgba(255,200,120,0.85)' : 'rgba(255,200,120,0.4)';
    g.lineWidth = 1.5;
    g.beginPath();
    const cw = w0(L);
    void cw;
    for (let i = 0; i <= N; i++) {
      const lt = f0 + ((f1 - f0) * i) / N;
      const t = lt + (L.startTime || 0);
      const p = Anim.value(c, L, pos, t);
      const wp = M.transformPoint(parentWorld(L, t), p);
      const s = toCss(wp, L.is3D);
      if (i === 0) g.moveTo(s[0], s[1]);
      else g.lineTo(s[0], s[1]);
    }
    g.stroke();
    if (!primary) return;
    pos.keys.forEach((k) => {
      const pw = parentWorld(L, k.t + (L.startTime || 0));
      const p = toCss(M.transformPoint(pw, k.v), L.is3D);
      // 空间手柄：实线连接关键点与切线端点
      [['out', k.sOut], ['in', k.sIn]].forEach(([, h]) => {
        if (!h || k.corner) return;
        const q = toCss(M.transformPoint(pw, [k.v[0] + h[0], k.v[1] + h[1], k.v[2] || 0]), L.is3D);
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(q[0], q[1]);
        g.stroke();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(q[0], q[1], 3.5, 0, Math.PI * 2);
        g.fill();
      });
      // 关键点：方形为平滑，菱形为尖角
      g.fillStyle = k.corner ? '#ff7a7a' : '#ffc24a';
      g.beginPath();
      if (k.corner) {
        g.moveTo(p[0], p[1] - 6);
        g.lineTo(p[0] + 6, p[1]);
        g.lineTo(p[0], p[1] + 6);
        g.lineTo(p[0] - 6, p[1]);
      } else g.rect(p[0] - 4, p[1] - 4, 8, 8);
      g.fill();
    });
  }

  // 运动路径命中：关键点、入切线、出切线
  function pathHit(L, x, y) {
    const pos = L.tr.position;
    if (!pos.animated || !pos.keys.length) return null;
    const hits = [];
    pos.keys.forEach((k, i) => {
      const pw = parentWorld(L, k.t + (L.startTime || 0));
      const p = toCss(M.transformPoint(pw, k.v), L.is3D);
      hits.push({ kind: 'key', i, d: Math.hypot(x - p[0], y - p[1]) });
      if (k.corner) return;
      if (k.sOut) {
        const q = toCss(M.transformPoint(pw, [k.v[0] + k.sOut[0], k.v[1] + k.sOut[1], k.v[2] || 0]), L.is3D);
        hits.push({ kind: 'out', i, d: Math.hypot(x - q[0], y - q[1]) + 0.5 });
      }
      if (k.sIn) {
        const q = toCss(M.transformPoint(pw, [k.v[0] + k.sIn[0], k.v[1] + k.sIn[1], k.v[2] || 0]), L.is3D);
        hits.push({ kind: 'in', i, d: Math.hypot(x - q[0], y - q[1]) + 0.5 });
      }
    });
    hits.sort((a, b) => a.d - b.d);
    return hits[0] && hits[0].d < 8 ? hits[0] : null;
  }

  // 拖动路径：关键点移动该关键帧的位置；手柄改变空间切线
  function startPathDrag(e, hit, L) {
    e.preventDefault();
    const pos = L.tr.position;
    const k = pos.keys[hit.i];
    const k0 = k.v.slice();
    const h0 = hit.kind === 'out' ? (k.sOut || [0, 0, 0]).slice() : hit.kind === 'in' ? (k.sIn || [0, 0, 0]).slice() : null;
    const sx = e.clientX, sy = e.clientY;
    const f = App.cssFit || 1;
    App.beginAction();
    const move = (ev) => {
      const dx = (ev.clientX - sx) / f, dy = (ev.clientY - sy) / f;
      const pp = UI.findProp(App.layer(L.id), pos.id);
      const kk = pp.keys[hit.i];
      if (!kk) return;
      if (hit.kind === 'key') {
        kk.v = [k0[0] + dx, k0[1] + dy, k0[2] || 0];
      } else if (hit.kind === 'out') {
        kk.sOut = [h0[0] + dx, h0[1] + dy, h0[2] || 0];
        kk.outT = 'bezier';
      } else {
        kk.sIn = [h0[0] + dx, h0[1] + dy, h0[2] || 0];
        kk.inT = 'bezier';
      }
      App.liveChange();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      App.endAction('编辑运动路径');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // 双击关键点：在平滑与尖角之间切换；钢笔绘制中双击结束开放路径
  function onDblClick(e) {
    if (pen) {
      // 双击的第二次按下会多加一个重复节点，去掉
      if (pen.pts.length > 2) {
        const a = pen.pts[pen.pts.length - 1].p, b = pen.pts[pen.pts.length - 2].p;
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) pen.pts.pop();
      }
      finishPen();
      draw();
      return;
    }
    const [x, y] = localPoint(e);
    const sel = App.selectedLayer();
    if (!sel) return;
    const hit = pathHit(sel, x, y);
    if (!hit || hit.kind !== 'key') return;
    App.mutate('切换尖角', () => {
      const pp = UI.findProp(App.layer(sel.id), sel.tr.position.id);
      const kk = pp.keys[hit.i];
      kk.corner = !kk.corner;
      if (kk.corner) {
        kk.sOut = null;
        kk.sIn = null;
      }
    });
  }
  // 父级矩阵（不含自身变换）
  function parentWorld(L, t) {
    const c = App.comp();
    const par = L.parent ? Model.findLayer(c, L.parent) : null;
    if (!par) return M.ident();
    const R = AE.Renderer.prototype.worldOf;
    return R.call({ worldOf: R }, c, par, t, { world: new Map(), visiting: new Set() });
  }

  function drawMasks(L) {
    const c = App.comp();
    const w = worldOf(L);
    g.strokeStyle = '#7fe0a8';
    g.lineWidth = 1;
    L.masks.forEach((mk) => {
      const list = Anim.value(c, L, mk.path, App.state.time) || [];
      P.contoursFromBPaths(list, 0.8).forEach((ct) => {
        g.beginPath();
        ct.pts.forEach((p, i) => {
          const s = toCss(M.transformPoint(w, [p[0], p[1], 0]), L.is3D);
          if (i) g.lineTo(s[0], s[1]);
          else g.moveTo(s[0], s[1]);
        });
        g.closePath();
        g.stroke();
      });
    });
  }

  // 变换手柄：四角缩放、顶部旋转
  function drawHandles(box, L) {
    const cs = box.corners;
    const cx = (box.x0 + box.x1) / 2;
    g.fillStyle = '#fff';
    g.strokeStyle = '#ff8a3d';
    cs.forEach((p) => {
      g.fillRect(p[0] - 4, p[1] - 4, 8, 8);
      g.strokeRect(p[0] - 4, p[1] - 4, 8, 8);
    });
    g.beginPath();
    g.moveTo(cx, box.y0);
    g.lineTo(cx, box.y0 - 22);
    g.stroke();
    g.beginPath();
    g.arc(cx, box.y0 - 22, 5, 0, Math.PI * 2);
    g.fill();
    void L;
  }

  // ---------- 网格线框（几何图层：选中时显示三角形边，抽样绘制） ----------
  function drawMeshWire(L) {
    const geo = AE.Graph.geometryOf(App.project, App.comp(), L, App.state.time);
    if (!geo || geo.kind !== 'mesh') return;
    const w = worldOf(L);
    const pos = geo.pos;
    const triN = pos.length / 9;
    const step = Math.max(1, Math.ceil(triN / 2500));
    g.strokeStyle = 'rgba(160,200,255,0.35)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let t = 0; t < triN; t += step) {
      for (let e = 0; e < 3; e++) {
        const a = (t * 3 + e) * 3, b = (t * 3 + ((e + 1) % 3)) * 3;
        const pa = toCss(M.transformPoint(w, [pos[a], pos[a + 1], pos[a + 2]]), true);
        const pb = toCss(M.transformPoint(w, [pos[b], pos[b + 1], pos[b + 2]]), true);
        g.moveTo(pa[0], pa[1]);
        g.lineTo(pb[0], pb[1]);
      }
    }
    g.stroke();
  }

  // ---------- 三维轴：选中三维图层时，在锚点处显示世界 X / Y / Z 轴，沿轴拖动即可移动 ----------
  const GIZMO_LEN = 160;
  const AXIS_COLORS = ['#ff5d5d', '#7ee07e', '#6aa8ff'];
  const AXIS_NAMES = ['X', 'Y', 'Z'];
  function gizmoGeom(L) {
    const c = App.comp();
    const t = App.state.time;
    const w = worldOf(L);
    const anc = Anim.value(c, L, L.tr.anchor, t);
    const o3 = M.transformPoint(w, [anc[0], anc[1], anc[2] || 0]);
    // 世界坐标轴：端点为锚点世界坐标沿 X / Y / Z 方向偏移 GIZMO_LEN
    const ends = [0, 1, 2].map((k) => {
      const e = o3.slice();
      e[k] += GIZMO_LEN;
      return toCss(e, true);
    });
    return { o: toCss(o3, true), ends };
  }
  function drawGizmo(L) {
    const gm = gizmoGeom(L);
    [0, 1, 2].forEach((k) => {
      const e = gm.ends[k];
      g.strokeStyle = AXIS_COLORS[k];
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(gm.o[0], gm.o[1]);
      g.lineTo(e[0], e[1]);
      g.stroke();
      g.fillStyle = AXIS_COLORS[k];
      g.beginPath();
      g.arc(e[0], e[1], 4, 0, Math.PI * 2);
      g.fill();
      g.font = '11px sans-serif';
      g.fillText(AXIS_NAMES[k], e[0] + 6, e[1] - 4);
    });
  }
  function gizmoHit(L, x, y) {
    const gm = gizmoGeom(L);
    let best = null;
    [0, 1, 2].forEach((k) => {
      const a = gm.o, b = gm.ends[k];
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const L2 = vx * vx + vy * vy || 1;
      const u = U.clamp(((x - a[0]) * vx + (y - a[1]) * vy) / L2, 0, 1);
      const d = Math.hypot(a[0] + vx * u - x, a[1] + vy * u - y);
      if (d < 7 && (!best || d < best.d)) best = { axis: k, d };
    });
    return best ? best.axis : null;
  }
  // 沿世界轴拖动：屏幕位移投影到轴的屏幕方向，换算为合成单位
  function startAxisDrag(e, L, axis) {
    e.preventDefault();
    const gm = gizmoGeom(L);
    const o = gm.o, end = gm.ends[axis];
    const sx = end[0] - o[0], sy = end[1] - o[1];
    const lenCss = Math.hypot(sx, sy) || 1;
    const pos0 = Anim.keyValue(L.tr.position, App.state.time - (L.startTime || 0)).slice();
    const lt = App.state.time - (L.startTime || 0);
    const mx0 = e.clientX, my0 = e.clientY;
    App.beginAction();
    const move = (ev) => {
      const dxs = ev.clientX - mx0, dys = ev.clientY - my0;
      const amt = ((dxs * sx + dys * sy) / (lenCss * lenCss)) * GIZMO_LEN;
      const axisW = [0, 0, 0];
      axisW[axis] = amt;
      const pInv = M.invert(parentWorld(L, App.state.time)) || M.ident();
      const d = M.transformDir(pInv, axisW);
      Anim.write(App.layer(L.id), L.tr.position, lt, [pos0[0] + d[0], pos0[1] + d[1], (pos0[2] || 0) + d[2]]);
      App.liveChange();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      App.endAction('沿' + AXIS_NAMES[axis] + '轴移动');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // ---------- 绘制：矩形、椭圆、钢笔（写入形状内容或蒙版） ----------
  let drawing = null; // 拖拽中的矩形 / 椭圆：{ tool, x0, y0, x1, y1 }（合成坐标）
  let pen = null; // 钢笔：{ pts: [{ p, o, i }], closed, drag }
  let penMouse = null; // 钢笔预览的当前鼠标位置（合成坐标）

  function cssToComp(x, y) {
    const f = App.cssFit || 1;
    return [x / f, y / f];
  }
  // 合成坐标 -> 图层局部坐标（位移与旋转缩放均按图层的世界矩阵逆变换）
  function toLocalOf(L, cp) {
    const inv = M.invert(worldOf(L));
    return inv ? M.transformPoint(inv, [cp[0], cp[1], 0]) : cp;
  }
  // 局部偏移（切线）换算：只取线性部分
  function dirLocalOf(L, d) {
    const inv = M.invert(worldOf(L));
    return inv ? M.transformDir(inv, [d[0], d[1], 0]) : [d[0], d[1], 0];
  }

  // 把绘制结果写入工程。geomFor(L) 返回图层局部坐标下的几何；L 为目标图层（新建时为新形状图层）
  function commitDrawn(tool, sel, center, geomFor) {
    const asMask = App.state.drawTarget === 'mask';
    const targetId = sel ? sel.id : null;
    App.mutate(asMask ? '绘制蒙版' : '绘制形状', () => {
      const c = App.comp();
      let L = targetId ? c.layers.find((l) => l.id === targetId) : null;
      if (!asMask && (!L || L.type !== 'shape')) {
        L = Model.createLayer(c, 'shape', { name: '形状 ' + (c.layers.length + 1), tr: { position: [center[0], center[1]] } });
        L.contents = [];
        c.layers.unshift(L);
      }
      if (!L) return;
      const g = geomFor(L, !!(targetId && L.id === targetId));
      if (asMask) {
        const bp = tool === 'pen' ? Model.bpath(g.closed, g.v, g.i, g.o) : tool === 'rect' ? Model.rectPath(g.cx, g.cy, g.w, g.h, 0) : Model.ellipsePath(g.cx, g.cy, g.w, g.h);
        L.masks.push({ name: (tool === 'pen' ? '自由' : tool === 'rect' ? '矩形' : '椭圆') + '蒙版', mode: 'add', inv: false, path: Model.path([bp]), feather: Model.num(0), opacity: Model.num(100), expand: Model.num(0) });
      } else if (tool === 'rect') {
        L.contents.push({ type: 'rect', pos: Model.vec([g.cx, g.cy]), size: Model.vec([g.w, g.h]), round: Model.num(0) });
        L.contents.push({ type: 'fill', color: Model.color([0.95, 0.6, 0.25]), opacity: Model.num(100) });
      } else if (tool === 'ellipse') {
        L.contents.push({ type: 'ellipse', pos: Model.vec([g.cx, g.cy]), size: Model.vec([g.w, g.h]) });
        L.contents.push({ type: 'fill', color: Model.color([0.95, 0.6, 0.25]), opacity: Model.num(100) });
      } else {
        L.contents.push({ type: 'path', path: Model.path([Model.bpath(g.closed, g.v, g.i, g.o)]) });
        // 闭合路径填充；开放路径描边
        L.contents.push(g.closed ? { type: 'fill', color: Model.color([0.95, 0.6, 0.25]), opacity: Model.num(100) } : { type: 'stroke', color: Model.color([0.95, 0.6, 0.25]), opacity: Model.num(100), width: Model.num(6) });
      }
      App.state.selected = [L.id];
    });
  }

  // 矩形 / 椭圆：拖拽结束时提交
  function finishBox() {
    const d = drawing;
    drawing = null;
    if (!d) return;
    const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
    if (w < 2 || h < 2) return;
    const center = [(d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2];
    const sel = App.selectedLayer();
    commitDrawn(d.tool, sel, center, (L, existing) => {
      // 新建图层以绘制中心为原点；已有图层换算到其局部坐标
      const a = existing ? toLocalOf(L, [d.x0, d.y0, 0]) : [d.x0 - center[0], d.y0 - center[1], 0];
      const b = existing ? toLocalOf(L, [d.x1, d.y1, 0]) : [d.x1 - center[0], d.y1 - center[1], 0];
      return { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
    });
  }

  // 钢笔：点击加节点；拖动设定切线（镜像的平滑节点）；双击或回到起点结束
  function penDown(e, x, y) {
    if (!pen) pen = { pts: [], closed: false, drag: null };
    const cp = cssToComp(x, y);
    if (pen.pts.length >= 2) {
      const f0 = pen.pts[0].p;
      if (Math.hypot((f0[0] - cp[0]) * (App.cssFit || 1), (f0[1] - cp[1]) * (App.cssFit || 1)) < 8) {
        pen.closed = true;
        return finishPen();
      }
    }
    pen.pts.push({ p: cp, o: [0, 0], i: [0, 0] });
    pen.drag = { index: pen.pts.length - 1, sx: e.clientX, sy: e.clientY };
    const move = (ev) => {
      if (!pen || !pen.drag) return;
      const dx = (ev.clientX - pen.drag.sx) / (App.cssFit || 1), dy = (ev.clientY - pen.drag.sy) / (App.cssFit || 1);
      const pt = pen.pts[pen.drag.index];
      pt.o = [dx, dy];
      pt.i = [-dx, -dy];
      penMouse = cssToComp(ev.clientX - ov.getBoundingClientRect().left, ev.clientY - ov.getBoundingClientRect().top);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (pen) pen.drag = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  // 结束钢笔：至少两个节点才会生成路径
  function finishPen() {
    const p = pen;
    pen = null;
    if (!p || p.pts.length < 2) return;
    const sel = App.selectedLayer();
    const xs = p.pts.map((q) => q.p[0]), ys = p.pts.map((q) => q.p[1]);
    const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    commitDrawn('pen', sel, center, (L, existing) => {
      const ref = (q) => (existing ? toLocalOf(L, q) : [q[0] - center[0], q[1] - center[1], 0]);
      const dirOf = (d) => (existing ? dirLocalOf(L, d) : d);
      const v = p.pts.map((q) => {
        const r = ref(q.p);
        return [r[0], r[1]];
      });
      const o = p.pts.map((q) => {
        const d = dirOf(q.o);
        return [d[0], d[1]];
      });
      const i = p.pts.map((q) => {
        const d = dirOf(q.i);
        return [d[0], d[1]];
      });
      return { closed: p.closed, v, i, o };
    });
  }
  // 绘制预览（矩形、椭圆与钢笔路径）
  function drawDrawingPreview() {
    const toC = (cp) => toCss([cp[0], cp[1], 0], false);
    if (drawing) {
      const a = toC([drawing.x0, drawing.y0]), b = toC([drawing.x1, drawing.y1]);
      g.strokeStyle = '#ffd08a';
      g.lineWidth = 1;
      g.setLineDash([4, 3]);
      g.beginPath();
      if (drawing.tool === 'ellipse') g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]) / 2, 0, 0, Math.PI * 2);
      else g.rect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      g.stroke();
      g.setLineDash([]);
    }
    if (pen && pen.pts.length) {
      g.strokeStyle = '#ffd08a';
      g.lineWidth = 1.5;
      g.beginPath();
      pen.pts.forEach((q, k) => {
        const s = toC(q.p);
        if (k) g.lineTo(s[0], s[1]);
        else g.moveTo(s[0], s[1]);
        [q.i, q.o].forEach((h) => {
          if (!h[0] && !h[1]) return;
          const hp = toC([q.p[0] + h[0], q.p[1] + h[1]]);
          g.moveTo(s[0], s[1]);
          g.lineTo(hp[0], hp[1]);
        });
      });
      if (penMouse) {
        const last = toC(pen.pts[pen.pts.length - 1].p), m = toC(penMouse);
        g.moveTo(last[0], last[1]);
        g.lineTo(m[0], m[1]);
      }
      g.stroke();
      pen.pts.forEach((q) => {
        const s = toC(q.p);
        g.fillStyle = '#ffd08a';
        g.fillRect(s[0] - 3, s[1] - 3, 6, 6);
      });
    }
  }
  V.finishPen = () => finishPen();
  V.cancelDraw = () => {
    drawing = null;
    pen = null;
    penMouse = null;
  };
  V.hasDrawing = () => !!(drawing || pen);

  // ---------- 场的影响范围 ----------
  // 几何 / 粒子图层引用的衰减场（图节点）：中心与半径（图层本地坐标）
  function fieldRangesOf(L) {
    const c = App.comp();
    const t = App.state.time;
    const refs = [];
    if (L.type === 'geo' && L.geo.source) refs.push({ graph: L.geo.source.graph });
    if (L.type === 'particles') (L.particles.fields || []).forEach((f) => refs.push({ graph: f.graph, node: f.node }));
    const out = [];
    const num = (n, name) => {
      const v = n.params[name];
      if (v && typeof v === 'object' && v.kind) return Anim.value(c, L, v, t);
      return Number(v) || 0;
    };
    refs.forEach((r) => {
      const gr = (App.project.graphs || []).find((g) => g.id === r.graph);
      if (!gr) return;
      gr.nodes.forEach((n) => {
        if (r.node && n.id !== r.node) return;
        if (n.type !== 'fieldFalloff' && n.type !== 'fieldVortex') return;
        out.push({ cx: num(n, 'cx'), cy: num(n, 'cy'), cz: num(n, 'cz'), r: num(n, 'radius'), strength: num(n, 'strength') });
      });
    });
    return out;
  }
  // 绘制场范围：虚线圆（半径随投影缩放），强度为负时显示为吸引（不同颜色）
  function drawFieldRanges(L) {
    // 粒子的场按世界坐标作用；几何的场位于几何的本地坐标（随图层变换）
    const w = L.type === 'particles' ? M.ident() : worldOf(L);
    fieldRangesOf(L).forEach((f) => {
      const center = toCss(M.transformPoint(w, [f.cx, f.cy, f.cz]), L.is3D);
      const edge = toCss(M.transformPoint(w, [f.cx + f.r, f.cy, f.cz]), L.is3D);
      const rad = Math.max(2, Math.hypot(edge[0] - center[0], edge[1] - center[1]));
      g.strokeStyle = 'rgba(255,143,176,0.7)';
      g.lineWidth = 1;
      g.setLineDash([6, 4]);
      g.beginPath();
      g.arc(center[0], center[1], rad, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,143,176,0.9)';
      g.beginPath();
      g.arc(center[0], center[1], 3, 0, Math.PI * 2);
      g.fill();
    });
  }

  // ---------- 形状路径节点与切线 ----------
  // 形状内容中的路径项（组内递归）
  function shapePathItems(L) {
    const out = [];
    const walk = (items) => (items || []).forEach((it) => {
      if (it.type === 'path') out.push(it);
      if (it.type === 'group') walk(it.items);
    });
    if (L.type === 'shape') walk(L.contents);
    return out;
  }
  // 当前时间的节点列表（局部坐标）
  function pathNodes(L) {
    const c = App.comp();
    const t = App.state.time;
    const lt = t - (L.startTime || 0);
    const res = [];
    shapePathItems(L).forEach((it) => {
      const list = Anim.value(c, L, it.path, t) || [];
      list.forEach((bp, ci) => {
        bp.v.forEach((p, i) => {
          res.push({ it, ci, i, lt, x: p[0], y: p[1], hi: bp.i[i], ho: bp.o[i] });
        });
      });
    });
    return res;
  }
  // 绘制路径轮廓、节点与切线（选中形状图层时）
  function drawShapeNodes(L) {
    const c = App.comp();
    const t = App.state.time;
    const w = worldOf(L);
    const sp = (x, y) => toCss(M.transformPoint(w, [x, y, 0]), L.is3D);
    shapePathItems(L).forEach((it) => {
      const list = Anim.value(c, L, it.path, t) || [];
      list.forEach((bp) => {
        const pts = P.flattenBPath(bp, 0.8);
        g.strokeStyle = 'rgba(127,224,168,0.9)';
        g.lineWidth = 1;
        g.beginPath();
        pts.forEach((p, k) => {
          const s = sp(p[0], p[1]);
          if (k) g.lineTo(s[0], s[1]);
          else g.moveTo(s[0], s[1]);
        });
        if (bp.closed) g.closePath();
        g.stroke();
        bp.v.forEach((p, i) => {
          const s = sp(p[0], p[1]);
          [[bp.i[i]], [bp.o[i]]].forEach(([h]) => {
            if (!h || (!h[0] && !h[1])) return;
            const q = sp(p[0] + h[0], p[1] + h[1]);
            g.strokeStyle = 'rgba(255,255,255,0.5)';
            g.beginPath();
            g.moveTo(s[0], s[1]);
            g.lineTo(q[0], q[1]);
            g.stroke();
            g.fillStyle = '#fff';
            g.beginPath();
            g.arc(q[0], q[1], 3, 0, Math.PI * 2);
            g.fill();
          });
          g.fillStyle = '#7fe0a8';
          g.strokeStyle = '#0b0b0d';
          g.fillRect(s[0] - 4, s[1] - 4, 8, 8);
          g.strokeRect(s[0] - 4, s[1] - 4, 8, 8);
        });
      });
    });
  }
  // 命中节点或切线手柄
  function pathNodeHit(L, x, y) {
    const c = App.comp();
    const t = App.state.time;
    const w = worldOf(L);
    const sp = (px, py) => toCss(M.transformPoint(w, [px, py, 0]), L.is3D);
    let best = null;
    pathNodes(L).forEach((n) => {
      const s = sp(n.x, n.y);
      const cands = [{ kind: 'node', d: Math.hypot(x - s[0], y - s[1]) }];
      if (n.ho && (n.ho[0] || n.ho[1])) cands.push({ kind: 'out', d: Math.hypot(x - sp(n.x + n.ho[0], n.y + n.ho[1])[0], y - sp(n.x + n.ho[0], n.y + n.ho[1])[1]) + 0.5 });
      if (n.hi && (n.hi[0] || n.hi[1])) cands.push({ kind: 'in', d: Math.hypot(x - sp(n.x + n.hi[0], n.y + n.hi[1])[0], y - sp(n.x + n.hi[0], n.y + n.hi[1])[1]) + 0.5 });
      cands.forEach((cd) => {
        if (cd.d < 8 && (!best || cd.d < best.d)) best = Object.assign(cd, { n });
      });
    });
    void c;
    void t;
    return best;
  }
  // 拖动节点：把屏幕位移换算为图层局部位移，写入路径（有动画时写当前时刻的关键帧）
  function startNodeDrag(e, hit, L) {
    e.preventDefault();
    const n = hit.n;
    const c = App.comp();
    const t = App.state.time;
    const cur = Anim.value(c, L, n.it.path, t);
    const bp0 = JSON.parse(JSON.stringify(cur[n.ci]));
    const w = worldOf(L);
    const inv = M.invert(w);
    const sx = e.clientX, sy = e.clientY;
    const f = App.cssFit || 1;
    App.beginAction();
    const move = (ev) => {
      const dxC = (ev.clientX - sx) / f, dyC = (ev.clientY - sy) / f;
      const d = inv ? M.transformDir(inv, [dxC, dyC, 0]) : [dxC, dyC, 0];
      const list = JSON.parse(JSON.stringify(bp0));
      const bpNew = list;
      if (hit.kind === 'node') {
        bpNew.v[n.i] = [bp0.v[n.i][0] + d[0], bp0.v[n.i][1] + d[1]];
      } else if (hit.kind === 'out') {
        bpNew.o[n.i] = [bp0.o[n.i][0] + d[0], bp0.o[n.i][1] + d[1]];
      } else {
        bpNew.i[n.i] = [bp0.i[n.i][0] + d[0], bp0.i[n.i][1] + d[1]];
      }
      const full = Anim.value(c, L, n.it.path, t);
      const val = JSON.parse(JSON.stringify(full));
      val[n.ci] = bpNew;
      Anim.write(App.layer(L.id), UI.findProp(App.layer(L.id), n.it.path.id), n.lt, val);
      App.liveChange();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      App.endAction('编辑路径节点');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // ---------- 命中与拖动 ----------
  function localPoint(e) {
    const r = ov.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function handleAt(box, x, y) {
    const cs = box.corners;
    const cx = (box.x0 + box.x1) / 2;
    if (Math.hypot(x - cx, y - (box.y0 - 22)) < 9) return 'rot';
    const names = ['tl', 'tr', 'br', 'bl'];
    for (let i = 0; i < 4; i++) if (Math.abs(cs[i][0] - x) < 7 && Math.abs(cs[i][1] - y) < 7) return names[i];
    return null;
  }
  function insideBox(box, x, y) {
    const pad = 4;
    if (box.is3) {
      // 三维：使用投影凸包近似
      return x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad;
    }
    return x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad;
  }
  // 射线：从屏幕点经摄像机逆投影，得到合成空间中的起点与方向
  function screenRay(x, y) {
    const c = App.comp();
    const f = App.cssFit || 1;
    const W = c.width * f, H = c.height * f;
    const nx = (x / W) * 2 - 1, ny = 1 - (y / H) * 2;
    const inv = M.invert(cam.VP);
    if (!inv) return null;
    const unproject = (z) => {
      const v = [nx, ny, z, 1];
      const o = [0, 0, 0, 0];
      for (let r = 0; r < 4; r++) o[r] = inv[r] * v[0] + inv[4 + r] * v[1] + inv[8 + r] * v[2] + inv[12 + r] * v[3];
      return [o[0] / o[3], o[1] / o[3], o[2] / o[3]];
    };
    const a = unproject(-1), b = unproject(1);
    return { o: a, d: U.vnorm(U.vsub(b, a)) };
  }
  // 三维图层的最近命中距离（沿射线，合成坐标）；未命中为 Infinity
  function rayHitLayer(L, ray) {
    const items = [];
    const ctx = { project: App.project, world: new Map(), visiting: new Set(), stack: [App.comp().id], Wr: 1, Hr: 1 };
    try {
      App.renderer._collect3D(App.comp(), L, App.state.time, ctx, items);
    } catch (e) {
      return Infinity;
    }
    let best = Infinity;
    items.forEach((it) => {
      if (it.kind !== 'mesh' || !it.pos) return;
      const pos = it.pos;
      const W = (i) => M.transformPoint(it.model, [pos[i], pos[i + 1], pos[i + 2]]);
      for (let i = 0; i < pos.length; i += 9) {
        const t = rayTri(ray, W(i), W(i + 3), W(i + 6));
        if (t < best) best = t;
      }
    });
    return best;
  }
  // Möller–Trumbore：返回射线参数 t（无交点为 Infinity）
  function rayTri(ray, a, b, c) {
    const e1 = U.vsub(b, a), e2 = U.vsub(c, a);
    const p = U.vcross(ray.d, e2);
    const det = U.vdot(e1, p);
    if (Math.abs(det) < 1e-9) return Infinity;
    const inv = 1 / det;
    const s = U.vsub(ray.o, a);
    const u = U.vdot(s, p) * inv;
    if (u < 0 || u > 1) return Infinity;
    const q = U.vcross(s, e1);
    const v = U.vdot(ray.d, q) * inv;
    if (v < 0 || u + v > 1) return Infinity;
    const t = U.vdot(e2, q) * inv;
    return t > 1e-6 ? t : Infinity;
  }

  // 点选：三维图层按射线命中最近的可见表面；二维图层按包围框（列表靠前者优先）
  function pickLayer(x, y) {
    const c = App.comp();
    const ray = cam ? screenRay(x, y) : null;
    let rayBest = null, rayDist = Infinity;
    if (ray) {
      c.layers.forEach((L) => {
        if (!L.enabled || L.locked || !Model.layerActive(L, App.state.time)) return;
        if (!(L.is3D || L.type === 'geo')) return;
        if (L.type === 'light' || L.type === 'camera') return;
        const d = rayHitLayer(L, ray);
        if (d < rayDist) {
          rayDist = d;
          rayBest = L;
        }
      });
    }
    if (rayBest) return rayBest;
    let best = null, bestArea = Infinity;
    c.layers.forEach((L, idx) => {
      if (!L.enabled || L.locked) return;
      if (!Model.layerActive(L, App.state.time)) return;
      // 三维图层已由射线判定（未命中的三维表面不应因包围框而被选中）
      if (L.type === 'light' || L.type === 'camera') {
        const w = worldOf(L);
        const p = toCss([w[12], w[13], w[14]], true);
        if (Math.hypot(p[0] - x, p[1] - y) < 12) {
          best = { L, area: 0, idx };
          bestArea = -1;
        }
        return;
      }
      if (L.is3D || L.type === 'geo' || L.type === 'particles') return;
      const box = screenBox(L);
      if (!insideBox(box, x, y)) return;
      const area = Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0));
      if (area < bestArea || (best && idx < best.idx && area <= bestArea * 1.2)) {
        best = { L, area, idx };
        bestArea = area;
      }
    });
    return best ? best.L : null;
  }

  function onDown(e) {
    const [x, y] = localPoint(e);
    const tool = App.state.tool;
    // 绘制工具优先
    if (tool === 'rect' || tool === 'ellipse') {
      const cp = cssToComp(x, y);
      drawing = { tool, x0: cp[0], y0: cp[1], x1: cp[0], y1: cp[1] };
      const move = (ev) => {
        const q = localPoint(ev);
        const c2 = cssToComp(q[0], q[1]);
        drawing.x1 = c2[0];
        drawing.y1 = c2[1];
        draw();
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        finishBox();
        draw();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      return;
    }
    if (tool === 'pen') {
      penDown(e, x, y);
      draw();
      return;
    }
    const sel = App.selectedLayer();
    // 三维轴优先（三维图层）
    if (sel && !sel.locked && sel.is3D && sel.type !== 'light' && sel.type !== 'camera') {
      const ax = gizmoHit(sel, x, y);
      if (ax !== null) return startAxisDrag(e, sel, ax);
    }
    // 运动路径的关键点与切线手柄优先
    if (sel && !sel.locked && sel.tr.position.animated) {
      const ph = pathHit(sel, x, y);
      if (ph) return startPathDrag(e, ph, sel);
    }
    // 形状路径的节点与切线
    if (sel && !sel.locked && sel.type === 'shape') {
      const nh = pathNodeHit(sel, x, y);
      if (nh) return startNodeDrag(e, nh, sel);
    }
    if (sel && !sel.locked) {
      const box = screenBox(sel);
      const h = handleAt(box, x, y);
      if (h) return startDrag(e, 'handle', sel, h, box);
    }
    if (sel) {
      const box = screenBox(sel);
      if (insideBox(box, x, y) && !e.shiftKey) {
        return startDrag(e, e.altKey ? 'anchor' : 'move', sel, null, box);
      }
    }
    const hit = pickLayer(x, y);
    if (hit) {
      if (e.shiftKey) App.state.selected = App.state.selected.includes(hit.id) ? App.state.selected.filter((i) => i !== hit.id) : App.state.selected.concat([hit.id]);
      else App.state.selected = [hit.id];
      App.state.selProp = null;
      App.notify();
      App.requestRender();
      if (!hit.locked) startDrag(e, 'move', hit, null, screenBox(hit));
    } else if (!e.shiftKey) {
      App.state.selected = [];
      App.notify();
      App.requestRender();
    }
  }

  function startDrag(e, mode, layer, h, box) {
    e.preventDefault();
    const c = App.comp();
    const t = App.state.time;
    const lt = t - (layer.startTime || 0);
    const f = App.cssFit || 1;
    dragState = {
      mode,
      id: layer.id,
      handle: h,
      sx: e.clientX,
      sy: e.clientY,
      pos0: Anim.keyValue(layer.tr.position, lt).slice(),
      anc0: Anim.keyValue(layer.tr.anchor, lt).slice(),
      scale0: Anim.keyValue(layer.tr.scale, lt).slice(),
      rot0: Anim.keyValue(layer.tr.rotation, lt),
      lt,
      f,
      box,
      cx: (box.x0 + box.x1) / 2,
      cy: (box.y0 + box.y1) / 2,
      c,
    };
    App.beginAction();
    const move = (ev) => onMove(ev);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      dragState = null;
      App.endAction(mode === 'move' ? '移动图层' : mode === 'anchor' ? '锚点' : '变换');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }
  function onMove(e) {
    if (!dragState) return;
    const d = dragState;
    const layer = App.layer(d.id);
    if (!layer) return;
    const dxC = (e.clientX - d.sx) / d.f, dyC = (e.clientY - d.sy) / d.f;
    const set = (prop, v) => {
      const p = layer.tr[prop];
      Anim.write(layer, p, d.lt, v);
    };
    // 合成平面的位移换算到父级坐标（父级有旋转、缩放或动画时仍跟手）
    const pInv = M.invert(parentWorld(layer, App.state.time)) || M.ident();
    const dP = M.transformDir(pInv, [dxC, dyC, 0]);
    if (d.mode === 'move') {
      set('position', [d.pos0[0] + dP[0], d.pos0[1] + dP[1], d.pos0[2] || 0]);
    } else if (d.mode === 'anchor') {
      // 移动锚点时画面不动：位置随锚点移动 dP，锚点在本地坐标中移动 (旋转缩放)⁻¹·dP
      const RS = M.mul(M.rotZ(U.deg2rad(d.rot0)), M.scale(d.scale0[0] / 100, d.scale0[1] / 100, 1));
      const rsInv = M.invert(RS) || M.ident();
      const da = M.transformDir(rsInv, [dP[0], dP[1], 0]);
      set('anchor', [d.anc0[0] + da[0], d.anc0[1] + da[1], d.anc0[2] || 0]);
      set('position', [d.pos0[0] + dP[0], d.pos0[1] + dP[1], d.pos0[2] || 0]);
    } else if (d.mode === 'handle') {
      if (d.handle === 'rot') {
        const a0 = Math.atan2(d.sy - d.cy - 0, d.sx - d.cx);
        const a1 = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
        set('rotation', d.rot0 + U.rad2deg(a1 - a0));
      } else {
        const dist0 = Math.hypot(d.sx - d.cx, d.sy - d.cy) || 1;
        const dist1 = Math.hypot(e.clientX - d.cx, e.clientY - d.cy);
        const k = dist1 / dist0;
        set('scale', [d.scale0[0] * k, d.scale0[1] * k, d.scale0[2] !== undefined ? d.scale0[2] : 100]);
      }
    }
    App.liveChange();
  }

  V.init = () => {
    ov = document.getElementById('overlay');
    g = ov.getContext('2d');
    ov.addEventListener('mousedown', onDown);
    ov.addEventListener('dblclick', onDblClick);
    ov.addEventListener('mousemove', (e) => {
      const [x, y] = localPoint(e);
      const sel = App.selectedLayer();
      let cur = 'default';
      if (App.state.tool === 'rect' || App.state.tool === 'ellipse' || App.state.tool === 'pen') {
        ov.style.cursor = 'crosshair';
        if (pen && !pen.drag) {
          penMouse = cssToComp(x, y);
          draw();
        }
        return;
      }
      if (sel) {
        const h = handleAt(screenBox(sel), x, y);
        if (h === 'rot') cur = 'crosshair';
        else if (h) cur = 'nwse-resize';
        else if (insideBox(screenBox(sel), x, y)) cur = 'move';
      }
      ov.style.cursor = cur;
    });
    App.overlayDraw = draw;
    UI.register({ full: () => draw(), time: () => draw(), values: () => draw() });
  };
  void camKey;
})();
