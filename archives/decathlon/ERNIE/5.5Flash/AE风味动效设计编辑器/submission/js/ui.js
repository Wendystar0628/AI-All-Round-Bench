/* AE Forge Editor - app shell, stage interaction, playback, shortcuts, export API */
(function (global) {
  'use strict';
  const A = global.AEAnim;
  const P = global.AEProject;
  const M4 = AEMath.M4;
  const { clamp } = AEMath;

  const UI = {
    selected: [],
    tlTab: 'layers',
    tlZoom: 1,
    tool: 'select',
    zoom: 1,
    panX: 0, panY: 0,
    fit: 1,
    dirty: true,
    playing: false,
    exporting: false,
    showPaths: true,
    drag: null,
    penPoints: null,
    fpsSmooth: 60,
    lastPropsUpdate: 0,
    mouse: [0, 0],
    ready: false,
  };
  window.UI = UI;

  const App = {
    canvas: null, overlay: null, octx: null, buffer: null,
    lastTime: 0,
  };

  function toast(msg, err) { global.AppToast(msg, err); }

  // ---------------- boot ----------------
  function boot() {
    P.init(global.AEDemo.build());
    P.state.activeCompId = P.project.comps[0].id;
    P.invalidate();
    App.canvas = document.getElementById('compCanvas');
    App.overlay = document.getElementById('overlay');
    App.octx = App.overlay.getContext('2d');
    App.buffer = document.createElement('canvas');
    initMenus();
    setupMenus();
    setupTools();
    setupTimeline();
    setupStage();
    setupKeys();
    setupTopbar();
    AETL.init();
    AEPanels.renderAll();
    updateStageSize();
    P.state.time = 0;
    UI.ready = true;
    renderAt(0);
    requestAnimationFrame(loop);
    setTimeout(() => { AETL.draw(); AETL.drawMini(); }, 60);
    setTimeout(() => toast('已载入示例工程「锻字」· 按空格播放'), 400);
  }

  // ---------------- stage sizing ----------------
  function updateStageSize() {
    const comp = P.activeComp();
    const stage = document.getElementById('stageWrap');
    if (!stage || !App.canvas) return;
    const r = stage.getBoundingClientRect();
    const pad = 34;
    const fit = Math.max(0.05, Math.min((r.width - pad * 2) / comp.width, (r.height - pad * 2) / comp.height));
    UI.fit = fit;
    const z = UI.zoom || 1;
    const w = Math.max(20, comp.width * fit * z);
    const h = Math.max(20, comp.height * fit * z);
    const frame = document.getElementById('compFrame');
    frame.style.width = w + 'px';
    frame.style.height = h + 'px';
    frame.style.transform = 'translate(' + (UI.panX || 0) + 'px,' + (UI.panY || 0) + 'px)';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = clamp((w * dpr) / comp.width, 0.35, 1.6);
    UI.renderScale = scale;
    const bw = Math.max(2, Math.round(comp.width * scale));
    const bh = Math.max(2, Math.round(comp.height * scale));
    if (App.canvas.width !== bw || App.canvas.height !== bh) {
      App.canvas.width = bw; App.canvas.height = bh;
      App.overlay.width = bw; App.overlay.height = bh;
    }
    App.buffer.width = bw; App.buffer.height = bh;
    const zl = document.getElementById('zoomLabel');
    if (zl) zl.textContent = Math.round(fit * z * 100) + '%';
    UI.dirty = true;
  }

  function updateStageSizeIfNeeded() {
    const comp = P.activeComp();
    const stage = document.getElementById('stageWrap');
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    const pad = 34;
    const fit = Math.max(0.05, Math.min((r.width - pad * 2) / comp.width, (r.height - pad * 2) / comp.height));
    if (Math.abs(fit - UI.fit) > 0.001 || UI._lastW !== Math.round(r.width) || UI._lastH !== Math.round(r.height)) {
      UI._lastW = Math.round(r.width); UI._lastH = Math.round(r.height);
      updateStageSize();
    }
  }

  // ---------------- render ----------------
  function renderAt(time) {
    const comp = P.activeComp();
    P.state.time = time;
    P.state.currentTime = time;
    updateStageSizeIfNeeded();
    const scale = UI.renderScale || 1;
    let out = null;
    try {
      out = global.AE2D.render(comp, time, { scale, canvas: App.buffer });
    } catch (e) {
      console.error(e);
      const ctx0 = App.canvas.getContext('2d');
      ctx0.fillStyle = '#300'; ctx0.fillRect(0, 0, App.canvas.width, App.canvas.height);
      ctx0.fillStyle = '#f88'; ctx0.font = '20px sans-serif';
      ctx0.fillText('渲染错误: ' + e.message, 30, 60);
    }
    const ctx = App.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, App.canvas.width, App.canvas.height);
    if (out) ctx.drawImage(out, 0, 0, App.canvas.width, App.canvas.height);
    drawOverlay(time);
    updateTimeUI(time);
    AETL.needsDraw = true;
    AETL.drawMini();
    UI.dirty = false;
  }

  function screenToComp(clientX, clientY) {
    const comp = P.activeComp();
    const r = App.canvas.getBoundingClientRect();
    const x = (clientX - r.left) / Math.max(1, r.width) * comp.width;
    const y = (clientY - r.top) / Math.max(1, r.height) * comp.height;
    return [x - comp.width / 2, comp.height / 2 - y];
  }

  function overlayText(ctx, text, x, y, color, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1);
    ctx.fillStyle = color;
    ctx.font = (size || 14) + 'px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawOverlay(time) {
    const ctx = App.octx;
    const comp = P.activeComp();
    const W = App.overlay.width, H = App.overlay.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (UI.exporting) return;
    const s = W / comp.width;
    ctx.setTransform(s, 0, 0, -s, W / 2, H / 2);
    for (const l of comp.layers) {
      if (!l.field || !l.field.enabled) continue;
      const p = A.evalProp(l.transform.position, time, P.makeCtx(comp, l, time));
      ctx.strokeStyle = 'rgba(120,200,255,0.35)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(p[0], p[1], l.field.radius || 400, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      overlayText(ctx, '场', p[0] + 8, p[1] - 8, 'rgba(120,200,255,0.8)', 14);
    }
    const sel = comp.layers.filter(l => UI.selected.includes(l.id));
    if (UI.showPaths) {
      for (const l of sel) {
        if (l.transform.position.keys.length > 1) drawMotionPath(ctx, comp, l, time);
      }
    }
    for (const l of sel) {
      if (l.type === 'camera') drawCameraGizmo(ctx, comp, l, time);
      if (l.type === 'light') drawLightGizmo(ctx, comp, l, time);
    }
    for (const l of sel) {
      if (l.locked || l.type === 'camera' || l.type === 'light') continue;
      drawSelection(ctx, comp, l, time);
    }
    if (UI.penPoints && UI.penPoints.length) {
      ctx.strokeStyle = '#ffcf9e';
      ctx.lineWidth = 2 / s;
      ctx.beginPath();
      ctx.moveTo(UI.penPoints[0][0], UI.penPoints[0][1]);
      for (let i = 1; i < UI.penPoints.length; i++) ctx.lineTo(UI.penPoints[i][0], UI.penPoints[i][1]);
      ctx.stroke();
    }
    if (UI.drag && UI.drag.type === 'draw') {
      const d = UI.drag;
      ctx.strokeStyle = '#ffcf9e';
      ctx.lineWidth = 2 / s;
      ctx.setLineDash([8, 6]);
      if (d.kind === 'rect' || d.kind === 'ellipse') {
        const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
        const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
        if (d.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); ctx.stroke(); }
        else ctx.strokeRect(x, y, w, h);
      }
      ctx.setLineDash([]);
    }
  }

  function layerCorners(comp, l, time) {
    const wm = P.worldMatrix(comp, l, time);
    let bb;
    if (l.type === 'text') {
      const t = l.text;
      const w = Math.max(40, global.AEText.measureLine(String(t.content).split('\n')[0] || '文', t, t.size));
      bb = [-w / 2, -t.size * 0.2, w / 2, t.size * 0.78];
    } else if (l.type === 'shape') {
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const c of global.AE2D.buildShapeContours(l, time)) {
        for (const p of c.pts) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
      }
      bb = minX > maxX ? [-50, -50, 50, 50] : [minX, minY, maxX, maxY];
    } else if (l.type === 'geo3d') {
      const g = l.geo || {};
      let w = g.w || 200, h = g.h || 200;
      if (g.kind === 'cylinder') { w = (g.r || 60) * 2; h = g.h || 200; }
      if (g.kind === 'custom' && g.parts) {
        let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
        for (const p of g.parts) {
          const pw = (p.w || 0) / 2, ph = (p.h || 0) / 2;
          minX = Math.min(minX, (p.x || 0) - pw); maxX = Math.max(maxX, (p.x || 0) + pw);
          minY = Math.min(minY, (p.y || 0) - ph); maxY = Math.max(maxY, (p.y || 0) + ph);
        }
        bb = [minX, minY, maxX, maxY];
      } else bb = [-w / 2, -h / 2, w / 2, h / 2];
    } else {
      bb = [-60, -60, 60, 60];
    }
    const pts = [];
    for (const x of [bb[0], bb[2]]) for (const y of [bb[1], bb[3]]) {
      pts.push(M4.transformPoint(wm, [x, y, 0]));
    }
    return pts;
  }

  function drawSelection(ctx, comp, l, time) {
    const pts = layerCorners(comp, l, time);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = UI.renderScale || 1;
    ctx.strokeStyle = '#63b3ff';
    ctx.lineWidth = 1.6 / s;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const hs = 7 / s;
    ctx.fillStyle = '#0d0d12';
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
      ctx.strokeRect(x - hs / 2, y - hs / 2, hs, hs);
    }
    const ctx2 = P.makeCtx(comp, l, time);
    const anchor = A.evalProp(l.transform.anchor, time, ctx2);
    const wm = P.worldMatrix(comp, l, time);
    const ap = M4.transformPoint(wm, [anchor[0] || 0, anchor[1] || 0, anchor[2] || 0]);
    ctx.strokeStyle = '#ff9b4d';
    ctx.lineWidth = 1.5 / s;
    ctx.beginPath();
    ctx.arc(ap[0], ap[1], 5 / s, 0, 7);
    ctx.moveTo(ap[0] - 9, ap[1]); ctx.lineTo(ap[0] + 9, ap[1]);
    ctx.moveTo(ap[0], ap[1] - 9); ctx.lineTo(ap[0], ap[1] + 9);
    ctx.stroke();
    const tw = (l.name.length + 1) * 9 + 10;
    ctx.fillStyle = 'rgba(12,14,20,0.85)';
    ctx.fillRect(x0, y0 - 26, tw, 20);
    overlayText(ctx, l.name, x0 + 6, y0 - 16, '#cfe3ff', 14);
  }

  function drawMotionPath(ctx, comp, l, time) {
    const prop = l.transform.position;
    const keys = prop.keys;
    if (keys.length < 2) return;
    const samples = [];
    const t0 = keys[0].t, t1 = keys[keys.length - 1].t;
    for (let i = 0; i <= 60; i++) {
      const t = t0 + (t1 - t0) * i / 60;
      const w = P.worldMatrix(comp, l, t);
      samples.push([w[12], w[13]]);
    }
    ctx.strokeStyle = 'rgba(255,155,77,0.85)';
    ctx.lineWidth = 1.8 / (UI.renderScale || 1);
    ctx.beginPath();
    samples.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.stroke();
    for (const k of keys) {
      const w = P.worldMatrix(comp, l, k.t);
      ctx.fillStyle = '#ffcf9e';
      ctx.beginPath();
      ctx.arc(w[12], w[13], 4 / (UI.renderScale || 1), 0, 7);
      ctx.fill();
    }
  }

  function drawCameraGizmo(ctx, comp, l, time) {
    const wm = P.worldMatrix(comp, l, time);
    const x = wm[12], y = wm[13];
    const s = UI.renderScale || 1;
    ctx.strokeStyle = '#8fd0ff';
    ctx.fillStyle = 'rgba(20,40,60,0.75)';
    ctx.lineWidth = 1.5 / s;
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.7); ctx.lineTo(x + r * 0.4, y - r * 0.7);
    ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.4, y + r * 0.7);
    ctx.lineTo(x - r, y + r * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    overlayText(ctx, '摄像机', x - r, y - r - 12, '#8fd0ff', 14);
  }

  function drawLightGizmo(ctx, comp, l, time) {
    const wm = P.worldMatrix(comp, l, time);
    const x = wm[12], y = wm[13];
    const s = UI.renderScale || 1;
    ctx.strokeStyle = '#ffd27a';
    ctx.fillStyle = 'rgba(60,45,20,0.7)';
    ctx.lineWidth = 1.5 / s;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16);
      ctx.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22);
      ctx.stroke();
    }
    overlayText(ctx, '灯光', x + 18, y + 18, '#ffd27a', 13);
  }

  function hitTest(comp, pt, time) {
    const [x, y] = pt;
    for (const l of comp.layers) {
      if (!l.enabled || l.locked) continue;
      if (l.type === 'camera' || l.type === 'light' || l.type === 'null' || l.type === 'adjust' || l.type === 'audio') continue;
      const pts = layerCorners(comp, l, time);
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x >= x0 - 8 && x <= x1 + 8 && y >= y0 - 8 && y <= y1 + 8) return l;
    }
    return null;
  }

  // ---------------- stage events ----------------
  function setupStage() {
    const cv = App.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (UI.exporting) return;
      global.AEAudio.uiClick();
      try { cv.setPointerCapture(e.pointerId); } catch (err) { }
      const comp = P.activeComp();
      const pt = screenToComp(e.clientX, e.clientY);
      if (UI.tool === 'hand' || e.button === 1) {
        UI.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, px: UI.panX, py: UI.panY };
        return;
      }
      if (UI.tool === 'zoom') {
        zoomAt(e.altKey ? 1 / 1.2 : 1.2, e.clientX, e.clientY);
        return;
      }
      if (UI.tool === 'rect' || UI.tool === 'ellipse') {
        UI.drag = { type: 'draw', kind: UI.tool, x0: pt[0], y0: pt[1], x1: pt[0], y1: pt[1] };
        return;
      }
      if (UI.tool === 'pen') {
        UI.penPoints = [pt];
        UI.drag = { type: 'pen' };
        return;
      }
      if (UI.tool === 'text') {
        P.pushUndo();
        const l = P.addLayer('text', {});
        l.transform.position.value = [pt[0], pt[1], 0];
        l.text.content = '文字';
        l.text.size = 180;
        UI.selected = [l.id];
        UI.tool = 'select';
        document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', b.dataset.tool === 'select'));
        AEPanels.renderAll();
        UI.dirty = true;
        return;
      }
      if (UI.tool === 'pin') {
        P.pushUndo();
        const l = P.addLayer('null', {});
        l.transform.position.value = [pt[0], pt[1], 0];
        l.name = '图钉';
        UI.selected = [l.id];
        AEPanels.renderAll();
        return;
      }
      const hit = hitTest(comp, pt, P.state.time);
      if (hit) {
        if (e.shiftKey) {
          const i = UI.selected.indexOf(hit.id);
          if (i >= 0) UI.selected.splice(i, 1); else UI.selected.push(hit.id);
        } else if (!UI.selected.includes(hit.id)) {
          UI.selected = [hit.id];
        }
        AEPanels.renderProps();
        const ctx = P.makeCtx(comp, hit, P.state.time);
        const pos = A.evalProp(hit.transform.position, P.state.time, ctx);
        UI.drag = { type: 'move', layerId: hit.id, start: pt, pos0: pos.slice(), moved: false };
      } else {
        if (!e.shiftKey) { UI.selected = []; AEPanels.renderProps(); }
      }
    });

    cv.addEventListener('pointermove', (e) => {
      const pt = screenToComp(e.clientX, e.clientY);
      UI.mouse = pt;
      const info = document.getElementById('mouseInfo');
      if (info) info.textContent = 'x: ' + pt[0].toFixed(0) + '  y: ' + pt[1].toFixed(0);
      if (!UI.drag) return;
      const d = UI.drag;
      if (d.type === 'pan') {
        UI.panX = d.px + (e.clientX - d.sx);
        UI.panY = d.py + (e.clientY - d.sy);
        document.getElementById('compFrame').style.transform = 'translate(' + UI.panX + 'px,' + UI.panY + 'px)';
        return;
      }
      if (d.type === 'draw') { d.x1 = pt[0]; d.y1 = pt[1]; UI.dirty = true; return; }
      if (d.type === 'pen') {
        const last = UI.penPoints[UI.penPoints.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 4) UI.penPoints.push(pt);
        return;
      }
      if (d.type === 'move') {
        const comp = P.activeComp();
        const l = P.layer(comp, d.layerId);
        if (!l) return;
        const dx = pt[0] - d.start[0], dy = pt[1] - d.start[1];
        if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
        if (!d.moved) return;
        const nv = [d.pos0[0] + dx, d.pos0[1] + dy, d.pos0[2] || 0];
        if (l.transform.position.keys.length) A.setKey(l.transform.position, P.state.time, nv);
        else l.transform.position.value = nv;
        P.invalidate();
        UI.dirty = true;
      }
    });

    const up = (e) => {
      const d = UI.drag;
      if (!d) return;
      if (d.type === 'move' && d.moved) { P.pushUndo(); AEPanels.renderProps(); }
      if (d.type === 'draw') {
        const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
        if (w > 4 && h > 4) {
          P.pushUndo();
          const l = P.addLayer('shape', {});
          l.name = d.kind === 'rect' ? '矩形' : '椭圆';
          l.shapes = [{ kind: d.kind, x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2, w, h, round: 0 }];
          l.fill = { enabled: true, color: '#e8e8ea', opacity: 100 };
          UI.selected = [l.id];
          AEPanels.renderAll();
        }
      }
      if (d.type === 'pen' && UI.penPoints && UI.penPoints.length > 1) {
        P.pushUndo();
        const l = P.addLayer('shape', {});
        l.name = '路径';
        l.shapes = [{ kind: 'path', pts: UI.penPoints.map(p => [p[0], p[1]]), closed: false, smooth: true }];
        l.fill = { enabled: false, color: '#fff' };
        l.stroke = { enabled: true, color: '#ffb066', width: 6, opacity: 100 };
        UI.selected = [l.id];
        UI.penPoints = null;
        AEPanels.renderAll();
      }
      UI.drag = null;
      UI.dirty = true;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('dblclick', () => {
      if (UI.tool === 'pen' && UI.penPoints && UI.penPoints.length > 2) {
        P.pushUndo();
        const l = P.addLayer('shape', {});
        l.name = '路径';
        l.shapes = [{ kind: 'path', pts: UI.penPoints.map(p => [p[0], p[1]]), closed: false, smooth: true }];
        l.stroke = { enabled: true, color: '#ffb066', width: 6, opacity: 100 };
        l.fill = { enabled: false, color: '#fff' };
        UI.selected = [l.id];
        UI.penPoints = null;
        AEPanels.renderAll();
      }
    });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      if (UI.exporting) return;
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    }, { passive: false });
    window.addEventListener('pointermove', (e) => {
      if (UI.drag && UI.drag.type === 'pan') {
        UI.panX = UI.drag.px + (e.clientX - UI.drag.sx);
        UI.panY = UI.drag.py + (e.clientY - UI.drag.sy);
        const frame = document.getElementById('compFrame');
        if (frame) frame.style.transform = 'translate(' + UI.panX + 'px,' + UI.panY + 'px)';
      }
    });
    window.addEventListener('pointerup', () => { if (UI.drag && UI.drag.type === 'pan') UI.drag = null; });
    window.addEventListener('resize', () => { updateStageSize(); UI.dirty = true; });
  }

  function zoomAt(factor, clientX, clientY) {
    const old = UI.zoom || 1;
    const z = clamp(old * factor, 0.15, 8);
    if (Math.abs(z - old) < 1e-4) return;
    const frame = document.getElementById('compFrame');
    const r = frame.getBoundingClientRect();
    const px = clientX - (r.left + r.width / 2), py = clientY - (r.top + r.height / 2);
    const k = z / old;
    UI.panX = (UI.panX || 0) - px * (k - 1);
    UI.panY = (UI.panY || 0) - py * (k - 1);
    UI.zoom = z;
    updateStageSize();
    UI.dirty = true;
  }

  function setupTools() {
    document.querySelectorAll('.tool').forEach(b => {
      b.onclick = () => {
        UI.tool = b.dataset.tool;
        document.querySelectorAll('.tool').forEach(x => x.classList.toggle('active', x === b));
        if (UI.tool !== 'pen') UI.penPoints = null;
      };
    });
    const fit = document.getElementById('btnFit');
    if (fit) fit.onclick = () => { UI.zoom = 1; UI.panX = 0; UI.panY = 0; updateStageSize(); };
  }

  // ---------------- playback ----------------
  function loop(now) {
    const dt = Math.min(0.12, (now - (App.lastTime || now)) / 1000);
    App.lastTime = now;
    const comp = P.activeComp();
    if (UI.playing && !UI.exporting) {
      let t = P.state.time + dt;
      const wa = comp.workArea || [0, comp.duration];
      if (UI.loopWorkArea && t > wa[1]) { t = wa[0] + (t - wa[1]) % Math.max(0.1, wa[1] - wa[0]); global.AppSyncAudio && global.AppSyncAudio(); }
      else if (t > comp.duration) {
        if (UI.loop !== false) { t = t % comp.duration; global.AppSyncAudio && global.AppSyncAudio(); }
        else { t = comp.duration; setPlaying(false); }
      }
      P.state.time = t;
      UI.dirty = true;
    }
    if (UI.dirty || UI.playing) {
      try { renderAt(P.state.time); } catch (e) { console.error(e); }
      AETL.draw();
      AETL.drawMini();
      if (now - UI.lastPropsUpdate > 160) {
        UI.lastPropsUpdate = now;
        AEPanels.updateLive && AEPanels.updateLive();
        updateTimeUI(P.state.time);
      }
    }
    requestAnimationFrame(loop);
  }

  function updateTimeUI(time) {
    const comp = P.activeComp();
    const fps = comp.fps || 30;
    const f = Math.round(time * fps);
    const ff = f % fps;
    const totalSec = Math.floor(f / fps);
    const ss = totalSec % 60;
    const mm = Math.floor(totalSec / 60) % 60;
    const hh = Math.floor(totalSec / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    const tc = document.getElementById('timecode');
    if (tc) tc.textContent = pad(hh) + ':' + pad(mm) + ':' + pad(ss) + ':' + pad(ff);
    const ts = document.getElementById('timeSub');
    if (ts) ts.textContent = time.toFixed(2) + ' s / ' + comp.duration.toFixed(2) + ' s';
    const sl = document.getElementById('statusSel');
    if (sl) {
      const sel = comp.layers.filter(l => UI.selected.includes(l.id));
      sl.textContent = sel.length ? sel.map(l => l.name).join('、') : '无';
    }
    const st = document.getElementById('stageStatus');
    if (st) st.textContent = UI.playing ? '播放中' : (UI.exporting ? '导出取样' : '就绪');
    const fpsEl = document.getElementById('fpsInfo');
    if (fpsEl) fpsEl.textContent = fps + ' fps';
  }

  function setPlaying(v) {
    if (UI.exporting) return;
    UI.playing = v;
    const btn = document.getElementById('btnPlay');
    if (btn) btn.textContent = v ? '⏸' : '▶';
    const st = document.getElementById('stageStatus');
    if (st) st.textContent = v ? '播放中' : '就绪';
    if (v) global.AEAudio.playFrom(P.state.time);
    else global.AEAudio.stop();
    UI.dirty = true;
  }
  window.AppSyncAudio = function () {
    if (UI.playing) global.AEAudio.playFrom(P.state.time);
  };

  // ---------------- timeline setup ----------------
  function setupTimeline() {
    const play = document.getElementById('btnPlay');
    if (play) play.onclick = () => setPlaying(!UI.playing);
    const start = document.getElementById('btnStart');
    if (start) start.onclick = () => { P.state.time = 0; UI.dirty = true; };
    const end = document.getElementById('btnEnd');
    if (end) end.onclick = () => { P.state.time = P.activeComp().duration; UI.dirty = true; };
    const pf = document.getElementById('btnPrevFrame');
    if (pf) pf.onclick = () => { P.state.time = Math.max(0, P.state.time - 1 / P.activeComp().fps); UI.dirty = true; };
    const nf = document.getElementById('btnNextFrame');
    if (nf) nf.onclick = () => { P.state.time = Math.min(P.activeComp().duration, P.state.time + 1 / P.activeComp().fps); UI.dirty = true; };
    const pk = document.getElementById('btnPrevKey');
    if (pk) pk.onclick = () => jumpKey(-1);
    const nk = document.getElementById('btnNextKey');
    if (nk) nk.onclick = () => jumpKey(1);
    const loopBtn = document.getElementById('btnLoop');
    if (loopBtn) { loopBtn.classList.add('active'); loopBtn.onclick = () => { UI.loop = UI.loop === false; loopBtn.classList.toggle('active', UI.loop !== false); }; }
    const wa = document.getElementById('btnWorkArea');
    if (wa) wa.onclick = () => { UI.loopWorkArea = !UI.loopWorkArea; wa.classList.toggle('active', UI.loopWorkArea); };
    const zo = document.getElementById('btnZoomOut');
    if (zo) zo.onclick = () => setTlZoom((UI.tlZoom || 1) / 1.25);
    const zi = document.getElementById('btnZoomIn');
    if (zi) zi.onclick = () => setTlZoom((UI.tlZoom || 1) * 1.25);
    const zr = document.getElementById('tlZoom');
    if (zr) zr.oninput = () => setTlZoom(parseFloat(zr.value));
    document.querySelectorAll('.tl-tab').forEach(t => {
      t.onclick = () => {
        UI.tlTab = t.dataset.tl;
        document.querySelectorAll('.tl-tab').forEach(x => x.classList.toggle('active', x === t));
        AETL.draw();
      };
    });
  }

  function setTlZoom(z) {
    UI.tlZoom = z;
    const zr = document.getElementById('tlZoom');
    if (zr) zr.value = z;
    AETL.draw();
  }

  function jumpKey(dir) {
    const comp = P.activeComp();
    const sel = comp.layers.filter(l => UI.selected.includes(l.id));
    let times = [];
    for (const l of sel) {
      for (const p of [l.transform.position, l.transform.rotation, l.transform.scale, l.transform.opacity]) {
        for (const k of p.keys) times.push(k.t);
      }
      if (l.type === 'shape' && l.modifiers && l.modifiers.trim) for (const k of (l.modifiers.trim.end.keys || [])) times.push(k.t);
    }
    if (!times.length) {
      for (const l of comp.layers) for (const k of l.transform.position.keys) times.push(k.t);
    }
    times = [...new Set(times)].sort((a, b) => a - b);
    const t = P.state.time;
    let target = dir > 0 ? times.find(x => x > t + 1e-4) : times.slice().reverse().find(x => x < t - 1e-4);
    if (target === undefined) target = dir > 0 ? comp.duration : 0;
    P.state.time = target;
    UI.dirty = true;
  }

  // ---------------- topbar ----------------
  function setupTopbar() {
    const u = document.getElementById('btnUndo');
    if (u) u.onclick = () => { if (P.undo()) { AEPanels.renderAll(); UI.dirty = true; toast('撤销'); } };
    const r = document.getElementById('btnRedo');
    if (r) r.onclick = () => { if (P.redo()) { AEPanels.renderAll(); UI.dirty = true; toast('重做'); } };
    const s = document.getElementById('btnSave');
    if (s) s.onclick = () => saveProject();
    const ex = document.getElementById('btnExport');
    if (ex) ex.onclick = () => exportProject();
    const nc = document.getElementById('btnNewComp');
    if (nc) nc.onclick = () => {
      P.pushUndo();
      P.addComp('合成 ' + (P.project.comps.length + 1), 1920, 1080, 30, 5);
      UI.selected = [];
      AEPanels.renderAll();
      updateStageSize();
      toast('已新建合成');
    };
    document.querySelectorAll('#fxPanel [data-add-layer]').forEach(b => {
      b.onclick = () => {
        P.pushUndo();
        const l = P.addLayer(b.dataset.addLayer, {});
        if (l.type === 'precomp') l.compId = P.activeComp().id;
        UI.selected = [l.id];
        AEPanels.renderAll();
      };
    });
    document.querySelectorAll('#fxPanel [data-add-shape]').forEach(b => {
      b.onclick = () => {
        P.pushUndo();
        const l = P.addLayer('shape', {});
        const kind = b.dataset.addShape;
        l.name = kind === 'rect' ? '矩形' : kind === 'ellipse' ? '椭圆' : '路径';
        l.shapes = [kind === 'path'
          ? { kind: 'path', pts: [[-200, -100], [200, -140], [160, 140], [-160, 100]], closed: true, smooth: true }
          : { kind, x: 0, y: 0, w: 360, h: 260, round: 0 }];
        UI.selected = [l.id];
        AEPanels.renderAll();
      };
    });
  }

  // ---------------- menus ----------------
  const MENUS = {
    file: [
      { label: '新建工程', fn: () => { P.pushUndo(); P.init(P.createEmptyProject()); UI.selected = []; AEPanels.renderAll(); updateStageSize(); } },
      { label: '打开工程…', fn: openProject },
      { label: '保存', k: 'Ctrl+S', fn: saveProject },
      { sep: true },
      { label: '导出工程 (.json)', fn: exportProject },
      { label: '导入工程…', fn: openProject },
      { sep: true },
      { label: '重新载入示例「锻字」', fn: () => { P.pushUndo(); P.init(global.AEDemo.build()); UI.selected = []; AEPanels.renderAll(); updateStageSize(); toast('已载入示例'); } },
    ],
    edit: [
      { label: '撤销', k: 'Ctrl+Z', fn: () => { P.undo(); AEPanels.renderAll(); UI.dirty = true; } },
      { label: '重做', k: 'Ctrl+Shift+Z', fn: () => { P.redo(); AEPanels.renderAll(); UI.dirty = true; } },
      { sep: true },
      { label: '复制图层', k: 'Ctrl+D', fn: duplicateSel },
      { label: '删除图层', k: 'Delete', fn: deleteSel },
      { label: '全选', k: 'Ctrl+A', fn: () => { UI.selected = P.activeComp().layers.map(l => l.id); AEPanels.renderProps(); AETL.draw(); } },
      { label: '取消选择', k: 'Esc', fn: () => { UI.selected = []; AEPanels.renderProps(); AETL.draw(); } },
    ],
    comp: [
      { label: '新建合成', fn: () => { P.pushUndo(); P.addComp('合成 ' + (P.project.comps.length + 1), 1920, 1080, 30, 5); AEPanels.renderAll(); updateStageSize(); } },
      { label: '合成设置', fn: compSettings },
      { label: '预合成所选图层', k: 'Ctrl+Shift+C', fn: precompose },
      { label: '修剪合成到工作区', fn: () => { const c = P.activeComp(); P.pushUndo(); c.duration = Math.max(0.5, (c.workArea || [0, c.duration])[1]); c.layers.forEach(l => { l.outPoint = Math.min(l.outPoint, c.duration); }); P.invalidate(); AEPanels.renderAll(); } },
    ],
    layer: [
      { label: '新建形状图层', fn: () => { P.pushUndo(); const l = P.addLayer('shape', {}); UI.selected = [l.id]; AEPanels.renderAll(); } },
      { label: '新建文字图层', fn: () => { P.pushUndo(); const l = P.addLayer('text', {}); l.text.size = 200; UI.selected = [l.id]; AEPanels.renderAll(); } },
      { label: '新建空对象', fn: () => { P.pushUndo(); const l = P.addLayer('null', {}); UI.selected = [l.id]; AEPanels.renderAll(); } },
      { sep: true },
      { label: '预合成', k: 'Ctrl+Shift+C', fn: precompose },
      { label: '复制', k: 'Ctrl+D', fn: duplicateSel },
      { label: '删除', k: 'Delete', fn: deleteSel },
      { sep: true },
      { label: '显示/隐藏', fn: () => { const s = P.activeComp().layers.filter(l => UI.selected.includes(l.id)); P.pushUndo(); for (const l of s) l.enabled = !l.enabled; P.invalidate(); AEPanels.renderAll(); } },
      { label: '锁定/解锁', fn: () => { const s = P.activeComp().layers.filter(l => UI.selected.includes(l.id)); P.pushUndo(); for (const l of s) l.locked = !l.locked; P.invalidate(); AEPanels.renderAll(); } },
      { label: '三维开关', fn: () => { const s = P.activeComp().layers.filter(l => UI.selected.includes(l.id)); P.pushUndo(); for (const l of s) l.is3D = !l.is3D; P.invalidate(); AEPanels.renderAll(); } },
    ],
    view: [
      { label: '适合窗口', fn: () => { UI.zoom = 1; UI.panX = 0; UI.panY = 0; updateStageSize(); } },
      { label: '放大', fn: () => zoomAt(1.25, window.innerWidth / 2, window.innerHeight / 2) },
      { label: '缩小', fn: () => zoomAt(0.8, window.innerWidth / 2, window.innerHeight / 2) },
      { sep: true },
      { label: '显示运动路径', fn: () => { UI.showPaths = !UI.showPaths; toast('运动路径：' + (UI.showPaths ? '开' : '关')); } },
    ],
    window: [
      { label: '重置布局', fn: () => { UI.zoom = 1; UI.panX = 0; UI.panY = 0; UI.tlZoom = 1; updateStageSize(); AETL.draw(); } },
      { label: '切换曲线编辑器', fn: () => { const b = document.querySelector('.tl-tab[data-tl="graph"]'); if (b) b.click(); } },
    ],
    help: [
      { label: '快捷键一览', fn: showHelp },
      { label: '关于本作品', fn: () => toast('AE 风味动效设计编辑器 · 示例「锻字」') },
    ],
  };

  function setupMenus() {
    const bar = document.getElementById('menuBar');
    if (!bar) return;
    bar.querySelectorAll('.menu-item').forEach(item => {
      item.onclick = (e) => {
        e.stopPropagation();
        const menu = MENUS[item.dataset.menu];
        if (!menu) return;
        const r = item.getBoundingClientRect();
        UIMenu.open(r.left, r.bottom + 2, menu);
      };
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#dropdown')) UIMenu.close();
    });
  }

  function deleteSel() {
    if (!UI.selected.length) return;
    P.pushUndo();
    P.removeLayers(UI.selected.slice());
    UI.selected = [];
    AEPanels.renderAll();
    toast('已删除所选图层');
  }
  function duplicateSel() {
    if (!UI.selected.length) return;
    P.pushUndo();
    const copies = P.duplicateLayers(UI.selected);
    AEPanels.renderAll();
    toast('已复制 ' + copies.length + ' 个图层');
  }
  function compSettings() {
    const c = P.activeComp();
    const w = prompt('合成宽度', c.width);
    if (w === null) return;
    const h = prompt('合成高度', c.height);
    const fps = prompt('帧率', c.fps);
    const dur = prompt('时长（秒）', c.duration);
    P.pushUndo();
    c.width = Math.max(16, parseInt(w) || 1920);
    c.height = Math.max(16, parseInt(h) || 1080);
    c.fps = Math.max(1, parseInt(fps) || 30);
    c.duration = Math.max(0.5, parseFloat(dur) || 5);
    c.workArea = [0, c.duration];
    P.invalidate();
    updateStageSize();
    AEPanels.renderAll();
    AETL.draw();
  }
  function precompose() {
    const comp = P.activeComp();
    const sel = comp.layers.filter(l => UI.selected.includes(l.id));
    if (sel.length < 1) { toast('请先选择图层', true); return; }
    P.pushUndo();
    const child = P.addComp('预合成 · ' + sel[0].name, comp.width, comp.height, comp.fps, comp.duration);
    child.background = { type: 'gradient', color1: 'rgba(0,0,0,0)', color2: 'rgba(0,0,0,0)' };
    for (const l of sel) {
      comp.layers = comp.layers.filter(x => x !== l);
      child.layers.push(l);
    }
    const first = Math.min.apply(null, sel.map(l => l.startTime || 0));
    const pre = global.AEUtil.createLayer(comp, 'precomp', {});
    pre.name = '预合成 · ' + sel[0].name;
    pre.compId = child.id;
    pre.startTime = first;
    pre.inPoint = 0;
    pre.outPoint = comp.duration;
    comp.layers.unshift(pre);
    UI.selected = [pre.id];
    P.state.activeCompId = comp.id;
    P.invalidate();
    AEPanels.renderAll();
    updateStageSize();
    toast('已预合成 ' + sel.length + ' 个图层');
  }

  function saveProject() {
    const ok = P.saveLocal();
    toast(ok ? '工程已保存到本地' : '保存失败', !ok);
  }
  function exportProject() {
    const blob = new Blob([P.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (P.project.name || 'project') + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('工程已导出');
  }
  function openProject() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { P.pushUndo(); P.importJSON(String(r.result)); UI.selected = []; AEPanels.renderAll(); updateStageSize(); toast('已打开工程'); }
        catch (e) { toast('打开失败：' + e.message, true); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  function showHelp() {
    const w = window.open('', '_blank');
    if (!w) { toast('快捷键：空格播放 · F9 缓动 · Ctrl+Z 撤销 · Ctrl+Shift+C 预合成'); return; }
    w.document.write('<html><head><title>快捷键</title></head><body style="font-family:sans-serif;padding:24px;line-height:1.9">' +
      '<h2>AE 风味动效设计编辑器 · 快捷键</h2>' +
      ['空格 播放/暂停', '← / → 逐帧', 'Shift+← / → 10 帧', 'Home / End 首/尾', 'F9 缓入缓出', 'Ctrl+Z 撤销', 'Ctrl+Shift+Z 重做', 'Ctrl+D 复制图层', 'Delete 删除图层', 'Ctrl+Shift+C 预合成', 'Ctrl+S 保存工程', 'V 选择 / H 手形 / Z 缩放 / T 文字', '滚轮 缩放画布', '时间轴滚轮 横向滚动，Ctrl+滚轮 缩放'].map(s => '<div>· ' + s + '</div>').join('') + '</body></html>');
  }

  // ---------------- keyboard ----------------
  function isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  function setupKeys() {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      const k = e.key;
      if (k === ' ' && !UI.exporting) { e.preventDefault(); setPlaying(!UI.playing); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) { P.redo(); } else { P.undo(); }
        AEPanels.renderAll(); UI.dirty = true; return;
      }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') { e.preventDefault(); P.redo(); AEPanels.renderAll(); UI.dirty = true; return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's') { e.preventDefault(); saveProject(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && k.toLowerCase() === 'c') { e.preventDefault(); precompose(); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'd') { e.preventDefault(); duplicateSel(); return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); UI.selected = P.activeComp().layers.map(l => l.id); AEPanels.renderProps(); AETL.draw(); return; }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSel(); return; }
      if (k === 'Escape') { UI.selected = []; AEPanels.renderProps(); AETL.draw(); UI.penPoints = null; return; }
      if (k === 'F9') { e.preventDefault(); easeSelected(); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); P.state.time = Math.max(0, P.state.time - (e.shiftKey ? 10 : 1) / P.activeComp().fps); UI.dirty = true; return; }
      if (k === 'ArrowRight') { e.preventDefault(); P.state.time = Math.min(P.activeComp().duration, P.state.time + (e.shiftKey ? 10 : 1) / P.activeComp().fps); UI.dirty = true; return; }
      if (k === 'Home') { P.state.time = 0; UI.dirty = true; return; }
      if (k === 'End') { P.state.time = P.activeComp().duration; UI.dirty = true; return; }
      if (k === 'v' || k === 'V') { selectTool('select'); return; }
      if (k === 'h' || k === 'H') { selectTool('hand'); return; }
      if (k === 'z' || k === 'Z') { selectTool('zoom'); return; }
      if (k === 't' || k === 'T') { selectTool('text'); return; }
    });
  }
  function selectTool(t) {
    const b = document.querySelector('.tool[data-tool="' + t + '"]');
    if (b) b.click();
  }
  function easeSelected() {
    const comp = P.activeComp();
    const sel = comp.layers.filter(l => UI.selected.includes(l.id));
    if (!sel.length) return;
    P.pushUndo();
    for (const l of sel) {
      for (const p of [l.transform.position, l.transform.scale, l.transform.rotation, l.transform.opacity]) A.easeKeys(p, 'ease');
    }
    P.invalidate();
    AEPanels.renderProps();
    toast('已应用缓入缓出 (F9)');
  }

  // ---------------- export API ----------------
  function beginExport(runId, opts) {
    opts = opts || {};
    const fps = opts.fps || 30;
    UI.exporting = true;
    UI.exportFps = fps;
    setPlaying(false);
    UI.selected = [];
    UI.tlTab = 'layers';
    document.querySelectorAll('.tl-tab').forEach(x => x.classList.toggle('active', x.dataset.tl === 'layers'));
    if (!P.project.comps.length) P.init(global.AEDemo.build());
    P.state.time = 0;
    updateStageSize();
    renderAt(0);
    AETL.draw();
    return { frames: Math.round(P.activeComp().duration * fps), fps, duration: P.activeComp().duration };
  }
  function frameExport(i) {
    const fps = UI.exportFps || 30;
    const t = Math.min(P.activeComp().duration - 1e-6, i / fps);
    P.state.time = t;
    renderAt(t);
    AETL.draw();
    AETL.drawMini();
    updateTimeUI(t);
    return true;
  }
  function endExport() {
    UI.exporting = false;
    UI.exportFps = null;
    AETL.draw();
    UI.dirty = true;
  }
  global.videoExport = {
    runs: ['demo'],
    begin: async function (runId, opts) {
      const r = beginExport(runId, opts);
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      return { frames: r.frames };
    },
    frame: async function (i) {
      frameExport(i);
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      return true;
    },
    end: function () { endExport(); },
  };

  // ---------------- misc ----------------
  window.AppToast = function (msg, err) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('err', !!err);
    t.hidden = false;
    clearTimeout(App._toastT);
    App._toastT = setTimeout(() => { t.hidden = true; }, 2200);
  };

  function initMenus() {
    window.UIMenu = {
      open(x, y, items) {
        const dd = document.getElementById('dropdown');
        dd.innerHTML = '';
        for (const it of items) {
          if (it.sep) { const s = document.createElement('div'); s.className = 'dropdown-sep'; dd.appendChild(s); continue; }
          const d = document.createElement('div');
          d.className = 'dropdown-item';
          const a = document.createElement('span'); a.textContent = it.label;
          d.appendChild(a);
          if (it.k) { const b = document.createElement('span'); b.className = 'k'; b.textContent = it.k; d.appendChild(b); }
          d.onclick = (e) => { e.stopPropagation(); UIMenu.close(); it.fn(); };
          dd.appendChild(d);
        }
        dd.hidden = false;
        const r = dd.getBoundingClientRect();
        dd.style.left = Math.min(window.innerWidth - r.width - 6, x) + 'px';
        dd.style.top = Math.min(window.innerHeight - r.height - 6, y) + 'px';
      },
      close() { const dd = document.getElementById('dropdown'); if (dd) dd.hidden = true; },
    };
  }

  window.App = { boot, renderAt, updateStageSize, updateStageSizeIfNeeded, setPlaying, toast, precompose };
  window.addEventListener('DOMContentLoaded', boot);
})(window);