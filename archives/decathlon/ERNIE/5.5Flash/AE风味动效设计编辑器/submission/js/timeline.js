/* AE Forge Editor - timeline & curve editor */
(function (global) {
  'use strict';
  const A = global.AEAnim;
  const P = global.AEProject;
  const UI = () => global.UI;

  const AETL = {
    canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
    rowH: 22, rulerH: 22, nameW: 214,
    scroll: 0, hover: null, drag: null,
    expanded: new Set(),
    graphProp: null,
    showSpeed: true,
    needsDraw: true,
  };

  function pxPerSec() {
    const c = P.activeComp();
    const w = Math.max(80, AETL.W - AETL.nameW);
    return (w / c.duration) * (UI().tlZoom || 1);
  }
  function xOf(t) { return AETL.nameW + (t - AETL.scroll) * pxPerSec(); }
  function tOf(x) { return AETL.scroll + (x - AETL.nameW) / pxPerSec(); }

  function resize() {
    const body = document.getElementById('tlBody');
    if (!body || !AETL.canvas) return;
    const r = body.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    AETL.W = Math.max(100, r.width);
    AETL.H = Math.max(60, r.height);
    AETL.dpr = dpr;
    const cv = AETL.canvas;
    if (cv.width !== Math.round(AETL.W * dpr) || cv.height !== Math.round(AETL.H * dpr)) {
      cv.width = Math.round(AETL.W * dpr);
      cv.height = Math.round(AETL.H * dpr);
    }
    AETL.ctx = cv.getContext('2d');
    AETL.needsDraw = true;
  }

  function layerRows() {
    const comp = P.activeComp();
    const rows = [];
    for (const l of comp.layers) {
      rows.push({ kind: 'layer', layer: l, depth: 0 });
      if (AETL.expanded.has(l.id)) {
        for (const p of animatableProps(l)) {
          rows.push({ kind: 'prop', layer: l, prop: p.prop, label: p.label, depth: 1 });
        }
      }
    }
    return rows;
  }

  function animatableProps(l) {
    const out = [];
    const t = l.transform;
    out.push({ prop: t.anchor, label: '锚点' });
    out.push({ prop: t.position, label: '位置' });
    out.push({ prop: t.scale, label: '缩放' });
    out.push({ prop: t.rotation, label: '旋转' });
    out.push({ prop: t.opacity, label: '不透明度' });
    if (l.type === 'text' && l.animator && l.animator.enabled) {
      const an = l.animator;
      out.push({ prop: an.start, label: '动画器 起点' });
      out.push({ prop: an.end, label: '动画器 终点' });
      out.push({ prop: an.position, label: '动画器 位置' });
    }
    if (l.type === 'shape' && l.modifiers && l.modifiers.trim) {
      out.push({ prop: l.modifiers.trim.end, label: '修剪路径 末' });
      out.push({ prop: l.modifiers.trim.start, label: '修剪路径 始' });
    }
    if (l.material && l.material.emissiveIntensity && l.material.emissiveIntensity.keys) {
      out.push({ prop: l.material.emissiveIntensity, label: '发光强度' });
    }
    if (l.type === 'light' && l.light && l.light.intensity && l.light.intensity.keys) {
      out.push({ prop: l.light.intensity, label: '强度' });
    }
    return out.filter(p => p.prop && (p.prop.keys && p.prop.keys.length || p.prop.expr));
  }

  // ---------- drawing ----------
  function draw() {
    if (!AETL.ctx) return;
    const ctx = AETL.ctx;
    const W = AETL.W, H = AETL.H;
    const comp = P.activeComp();
    ctx.setTransform(AETL.dpr, 0, 0, AETL.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#15151a';
    ctx.fillRect(0, 0, W, H);
    const tl = UI().tlTab;
    if (tl === 'graph') { drawGraph(ctx, W, H, comp); return; }

    const rows = layerRows();
    const rowY = (i) => AETL.rulerH + i * AETL.rowH;
    const maxScroll = Math.max(0, comp.duration - (W - AETL.nameW) / pxPerSec());
    AETL.scroll = Math.max(0, Math.min(maxScroll, AETL.scroll));

    // ruler
    ctx.fillStyle = '#1b1b21';
    ctx.fillRect(0, 0, W, AETL.rulerH);
    ctx.fillStyle = '#1e1e25';
    ctx.fillRect(0, 0, AETL.nameW, AETL.rulerH);
    ctx.strokeStyle = '#2b2b34';
    ctx.beginPath(); ctx.moveTo(0, AETL.rulerH - 0.5); ctx.lineTo(W, AETL.rulerH - 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(AETL.nameW - 0.5, 0); ctx.lineTo(AETL.nameW - 0.5, H); ctx.stroke();

    const pps = pxPerSec();
    const t0 = AETL.scroll, t1 = AETL.scroll + (W - AETL.nameW) / pps;
    const step = pps > 140 ? 0.5 : pps > 70 ? 1 : pps > 30 ? 2 : 5;
    ctx.font = '10px Consolas, monospace';
    ctx.textBaseline = 'top';
    for (let t = Math.floor(t0 / step) * step; t <= t1 + 1e-6; t += step) {
      const x = xOf(t);
      if (x < AETL.nameW) continue;
      ctx.strokeStyle = '#2f2f39';
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, AETL.rulerH); ctx.stroke();
      ctx.fillStyle = '#7b7b88';
      const label = formatRuler(t, step);
      ctx.fillText(label, x + 3, 4);
    }
    // work area
    const wa = comp.workArea || [0, comp.duration];
    const wx0 = xOf(wa[0]), wx1 = xOf(wa[1]);
    ctx.fillStyle = 'rgba(255,155,77,0.16)';
    ctx.fillRect(wx0, 0, Math.max(0, wx1 - wx0), AETL.rulerH - 3);
    ctx.fillStyle = '#c8792f';
    ctx.fillRect(wx0, AETL.rulerH - 3, Math.max(0, wx1 - wx0), 2);

    // rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const y = rowY(i);
      if (y > H) break;
      const l = row.layer;
      const sel = UI().selected.includes(l.id);
      const hov = AETL.hover && AETL.hover.layerId === l.id;
      ctx.fillStyle = sel ? '#2a3444' : (i % 2 ? '#17171c' : '#141419');
      ctx.fillRect(0, y, W, AETL.rowH);
      if (hov && !sel) { ctx.fillStyle = 'rgba(90,110,140,0.15)'; ctx.fillRect(0, y, W, AETL.rowH); }
      // name column
      ctx.fillStyle = sel ? '#2a3444' : '#1a1a20';
      ctx.fillRect(0, y, AETL.nameW, AETL.rowH);
      ctx.strokeStyle = '#26262e';
      ctx.beginPath(); ctx.moveTo(0, y + AETL.rowH - 0.5); ctx.lineTo(W, y + AETL.rowH - 0.5); ctx.stroke();

      if (row.kind === 'layer') {
        // expand arrow
        const hasProps = animatableProps(l).length > 0;
        const ex = AETL.expanded.has(l.id);
        ctx.fillStyle = hasProps ? (ex ? '#c9a06a' : '#6f6f7c') : '#3a3a44';
        ctx.beginPath();
        const ax = 7, ay = y + AETL.rowH / 2;
        if (ex) { ctx.moveTo(ax, ay - 2); ctx.lineTo(ax + 5, ay - 2); ctx.lineTo(ax + 2.5, ay + 3); }
        else { ctx.moveTo(ax, ay - 3); ctx.lineTo(ax + 5, ay); ctx.lineTo(ax, ay + 3); }
        ctx.fill();
        // icons
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = l.enabled ? (sel ? '#ffd0a0' : '#8fa0b8') : '#4a4a56';
        ctx.textBaseline = 'middle';
        ctx.fillText(typeGlyph(l), 18, y + AETL.rowH / 2 + 0.5);
        // eye / lock
        ctx.fillStyle = l.enabled ? '#9a9aa8' : '#4a4a56';
        ctx.fillText(l.enabled ? '◉' : '○', 34, y + AETL.rowH / 2 + 0.5);
        ctx.fillStyle = l.locked ? '#c9a06a' : '#44444e';
        ctx.fillText(l.locked ? '▣' : '▢', 48, y + AETL.rowH / 2 + 0.5);
        ctx.fillStyle = sel ? '#f0f0f6' : '#b9b9c6';
        ctx.fillText(l.name, 62, y + AETL.rowH / 2 + 0.5);
        // in/out
        drawLayerBar(ctx, l, y, comp);
      } else {
        ctx.fillStyle = '#5a5a68';
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText('◂ ' + row.label, 30, y + AETL.rowH / 2 + 0.5);
        drawPropBar(ctx, row, y, comp);
      }
    }

    // playhead
    const px = xOf(P.state.time);
    if (px >= AETL.nameW - 2) {
      ctx.strokeStyle = '#ff9b4d';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, H); ctx.stroke();
      ctx.fillStyle = '#ff9b4d';
      ctx.beginPath();
      ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8); ctx.closePath(); ctx.fill();
    }
    // scroll indicator
    if (pps * comp.duration > W - AETL.nameW) {
      const totalW = pps * comp.duration;
      const visW = W - AETL.nameW;
      const sx = AETL.nameW + (AETL.scroll / comp.duration) * visW * (totalW / visW) * (visW / totalW);
      ctx.fillStyle = 'rgba(255,155,77,0.25)';
      ctx.fillRect(AETL.nameW, H - 3, visW, 3);
    }
  }

  function formatRuler(t, step) {
    const s = Math.floor(t);
    const f = Math.round((t - s) * 30);
    if (step >= 1) return String(s) + 's';
    return s + '+' + String(Math.round((t - s) * 10)).padStart(1, '0');
  }
  function typeGlyph(l) {
    return { shape: '◇', text: 'T', null: '□', adjust: '◐', precomp: '▤', camera: 'C', light: '☼', geo3d: '⬢', particle: '⁙', audio: '♪' }[l.type] || '•';
  }

  function drawLayerBar(ctx, l, y, comp) {
    const x0 = xOf(l.startTime || 0);
    const dur = Math.max(0.04, (l.outPoint - l.inPoint) / 100 * Math.abs(l.stretch || 100) / 100);
    const x1 = xOf((l.startTime || 0) + (l.outPoint - l.inPoint) * Math.abs((l.stretch || 100) / 100));
    const yy = y + 4, hh = AETL.rowH - 8;
    const col = l.type === 'audio' ? '#3d5a3d' : l.is3D ? '#3d4a5e' : l.type === 'adjust' ? '#4a3f5a' : '#3c4657';
    ctx.fillStyle = l.enabled ? col : '#2a2a32';
    ctx.fillRect(x0, yy, Math.max(2, x1 - x0), hh);
    ctx.strokeStyle = l.enabled ? 'rgba(150,170,200,0.35)' : '#33333b';
    ctx.strokeRect(x0 + 0.5, yy + 0.5, Math.max(1, x1 - x0 - 1), hh - 1);
    // source in/out markers
    const sx = xOf(l.startTime + (l.inPoint) * Math.abs((l.stretch || 100) / 100));
    ctx.fillStyle = '#c9a06a';
    ctx.fillRect(sx, yy, 1, hh);
    // keyframes
    for (const p of animatableProps(l)) {
      for (const k of p.prop.keys) {
        const kx = xOf(k.t);
        if (kx < AETL.nameW - 3 || kx > AETL.W + 3) continue;
        drawDiamond(ctx, kx, y + AETL.rowH / 2, 3.2, '#ffcf9e');
      }
      if (p.prop.expr) {
        const kx = xOf(P.state.time);
        ctx.fillStyle = '#63b3ff';
        ctx.fillRect(kx - 1, y + 3, 2, AETL.rowH - 6);
      }
    }
  }

  function drawPropBar(ctx, row, y, comp) {
    const p = row.prop;
    const x0 = xOf(Math.min(p.keys.length ? p.keys[0].t : 0, comp.duration));
    const x1 = xOf(Math.min(p.keys.length ? p.keys[p.keys.length - 1].t : 0, comp.duration));
    ctx.fillStyle = 'rgba(255,155,77,0.12)';
    ctx.fillRect(Math.min(x0, x1), y + 5, Math.max(1, Math.abs(x1 - x0)), AETL.rowH - 10);
    for (const k of p.keys) {
      const kx = xOf(k.t);
      drawDiamond(ctx, kx, y + AETL.rowH / 2, 3.4, UI().selected.includes(row.layer.id) ? '#ffcf9e' : '#c9a06a');
    }
  }

  function drawDiamond(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill();
  }

  // ---------- graph editor ----------
  function currentGraph() {
    if (AETL.graphProp) return AETL.graphProp;
    const sel = P.activeComp().layers.filter(l => UI().selected.includes(l.id));
    const l = sel[0];
    if (!l) return null;
    const props = animatableProps(l);
    return props.length ? { layer: l, prop: props[0].prop, label: props[0].label } : null;
  }

  function drawGraph(ctx, W, H, comp) {
    const g = currentGraph();
    ctx.fillStyle = '#121217';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1b1b21';
    ctx.fillRect(0, 0, W, AETL.rulerH);
    ctx.strokeStyle = '#2b2b34';
    ctx.beginPath(); ctx.moveTo(0, AETL.rulerH - 0.5); ctx.lineTo(W, AETL.rulerH - 0.5); ctx.stroke();
    ctx.fillStyle = '#1e1e25';
    ctx.fillRect(0, 0, 150, AETL.rulerH);
    ctx.fillStyle = '#c9c9d6';
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(g ? (g.label + ' · ' + g.layer.name) : '曲线视图', 8, AETL.rulerH / 2);
    if (!g) {
      ctx.fillStyle = '#5a5a68';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText('选择一个图层与属性查看曲线', 16, AETL.rulerH + 30);
      return;
    }
    const pps = pxPerSec();
    const t0 = AETL.scroll, t1 = AETL.scroll + (W) / pps;
    const top = AETL.rulerH + 10, bottom = H - 24;
    const left = 46;
    // sample values
    const N = 240;
    const samples = [];
    let vmin = Infinity, vmax = -Infinity;
    const comp2 = P.activeComp();
    const ctx2 = P.makeCtx(comp2, g.layer, 0);
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * i / N;
      let v = A.evalProp(g.prop, t, P.makeCtx(comp2, g.layer, t));
      if (Array.isArray(v)) v = v[0] || 0;
      samples.push({ t, v });
      vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    if (!isFinite(vmin)) { vmin = 0; vmax = 1; }
    if (vmax - vmin < 1e-4) { vmax = vmin + 1; }
    const pad = (vmax - vmin) * 0.15;
    vmin -= pad; vmax += pad;
    const yOf = (v) => bottom - (v - vmin) / (vmax - vmin) * (bottom - top);

    // grid
    ctx.strokeStyle = '#22222a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = top + (bottom - top) * i / 4;
      ctx.beginPath(); ctx.moveTo(left, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
      ctx.fillStyle = '#5c5c69';
      ctx.font = '9px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText((vmax - (vmax - vmin) * i / 4).toFixed(1), left - 5, y + 3);
    }
    ctx.textAlign = 'left';
    const step = pps > 140 ? 0.5 : pps > 70 ? 1 : pps > 30 ? 2 : 5;
    for (let t = Math.floor(t0 / step) * step; t <= t1 + 1e-6; t += step) {
      const x = xOf(t);
      ctx.strokeStyle = '#1e1e26';
      ctx.beginPath(); ctx.moveTo(x + 0.5, AETL.rulerH); ctx.lineTo(x + 0.5, H); ctx.stroke();
      ctx.fillStyle = '#6a6a78';
      ctx.font = '9px Consolas, monospace';
      ctx.fillText(formatRuler(t, step), x + 3, 8);
    }

    // speed curve
    if (AETL.showSpeed) {
      ctx.strokeStyle = 'rgba(99,179,255,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let smax = 0.0001;
      const speeds = samples.map((s, i) => {
        const a = samples[Math.max(0, i - 1)], b = samples[Math.min(N, i + 1)];
        const dt = b.t - a.t || 1e-6;
        const va = Array.isArray(A.evalProp(g.prop, a.t, P.makeCtx(comp2, g.layer, a.t))) ? 0 : A.evalProp(g.prop, a.t, P.makeCtx(comp2, g.layer, a.t));
        const sp = Math.abs(b.v - a.v) / dt;
        smax = Math.max(smax, sp);
        return sp;
      });
      for (let i = 0; i <= N; i++) {
        const s = samples[i];
        const y = bottom - (speeds[i] / smax) * (bottom - top) * 0.8;
        if (i === 0) ctx.moveTo(xOf(s.t), y); else ctx.lineTo(xOf(s.t), y);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(99,179,255,0.7)';
      ctx.font = '9px "Microsoft YaHei"';
      ctx.fillText('速度', 8, H - 10);
    }

    // value curve
    ctx.strokeStyle = '#ff9b4d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const s = samples[i];
      if (i === 0) ctx.moveTo(xOf(s.t), yOf(s.v)); else ctx.lineTo(xOf(s.t), yOf(s.v));
    }
    ctx.stroke();

    // keyframes + handles
    const keys = p.keys;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.t < t0 - 1 || k.t > t1 + 1) continue;
      const x = xOf(k.t), y = yOf(k.v[0] !== undefined ? k.v[0] : k.v);
      // handles
      const prev = keys[i - 1], next = keys[i + 1];
      ctx.strokeStyle = 'rgba(255,207,158,0.5)';
      ctx.lineWidth = 1;
      if (prev) {
        const dt = k.t - prev.t || 1;
        const dv = ((k.v[0] !== undefined ? k.v[0] : k.v) - (prev.v[0] !== undefined ? prev.v[0] : prev.v)) || 1e-6;
        const hx = xOf(k.t - k.hi[0] * dt), hy = yOf((k.v[0] !== undefined ? k.v[0] : k.v) - k.hi[1] * dv);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = '#ffcf9e';
        ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, 7); ctx.fill();
      }
      if (next) {
        const dt = next.t - k.t || 1;
        const dv = ((next.v[0] !== undefined ? next.v[0] : next.v) - (k.v[0] !== undefined ? k.v[0] : k.v)) || 1e-6;
        const hx = xOf(k.t + k.ho[0] * dt), hy = yOf((k.v[0] !== undefined ? k.v[0] : k.v) + k.ho[1] * dv);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(hx, hy); ctx.stroke();
        ctx.fillStyle = '#ffcf9e';
        ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, 7); ctx.fill();
      }
      drawDiamond(ctx, x, y, 4, '#ffcf9e');
    }
    // playhead
    const px = xOf(P.state.time);
    if (px > 0 && px < W) {
      ctx.strokeStyle = '#ff9b4d';
      ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, H); ctx.stroke();
    }
    AETL._graphMap = { vmin, vmax, top, bottom, left, yOf };
  }

  function drawMiniGraph() {
    const cv = document.getElementById('miniGraph');
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    const g = currentGraph();
    if (!g) return;
    const comp = P.activeComp();
    const t0 = Math.max(0, P.state.time - 2), t1 = Math.min(comp.duration, P.state.time + 2);
    const N = 80;
    let vmin = Infinity, vmax = -Infinity;
    const vals = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * i / N;
      let v = A.evalProp(g.prop, t, P.makeCtx(comp, g.layer, t));
      if (Array.isArray(v)) v = v[0] || 0;
      vals.push(v); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
    }
    if (!isFinite(vmin)) return;
    if (vmax - vmin < 1e-6) { vmax += 1; vmin -= 1; }
    ctx.strokeStyle = '#2a2a33';
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.strokeStyle = '#ff9b4d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const x = W * i / N;
      const y = H - 6 - (vals[i] - vmin) / (vmax - vmin) * (H - 12);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // ---------- interactions ----------
  function localPos(e) {
    const r = AETL.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function hitKey(x, y, rows) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const yy = AETL.rulerH + i * AETL.rowH;
      if (y < yy || y > yy + AETL.rowH) continue;
      const props = row.kind === 'layer' ? animatableProps(row.layer) : [row];
      for (const p of props) {
        for (const k of p.prop.keys) {
          const kx = xOf(k.t);
          if (Math.abs(kx - x) < 6) return { row, prop: p.prop, key: k, index: p.prop.keys.indexOf(k) };
        }
      }
    }
    return null;
  }

  function init() {
    AETL.canvas = document.getElementById('timelineCanvas');
    if (!AETL.canvas) return;
    AETL.ctx = AETL.canvas.getContext('2d');
    resize();
    window.addEventListener('resize', () => { resize(); draw(); });

    const cv = AETL.canvas;
    cv.addEventListener('pointerdown', (e) => {
      const { x, y } = localPos(e);
      if (x < AETL.nameW) {
        const rows = layerRows();
        const i = Math.floor((y - AETL.rulerH) / AETL.rowH);
        const row = rows[i];
        if (row) {
          if (row.kind === 'layer') {
            const l = row.layer;
            if (x < 14) { AETL.expanded.has(l.id) ? AETL.expanded.delete(l.id) : AETL.expanded.add(l.id); draw(); return; }
            if (x >= 30 && x < 42) { P.pushUndo(); l.enabled = !l.enabled; P.invalidate(); AEPanels.renderAll(); return; }
            if (x >= 44 && x < 56) { P.pushUndo(); l.locked = !l.locked; P.invalidate(); return; }
            selectLayer(l.id, e);
            return;
          }
        }
        return;
      }
      if (y < AETL.rulerH) {
        AETL.drag = { type: 'scrub' };
        P.state.time = Math.max(0, Math.min(P.activeComp().duration, tOf(x)));
        AETL.needsDraw = true;
        return;
      }
      const rows = layerRows();
      const hit = hitKey(x, y, rows);
      if (hit) {
        if (UI().tlTab === 'graph') {
          AETL.drag = { type: 'graphKey', hit, startX: x, startY: y };
        } else {
          AETL.drag = { type: 'key', hit, startX: x };
          P.pushUndo();
        }
        draw();
        return;
      }
      if (UI().tlTab === 'graph') {
        const g = currentGraph();
        if (g && AETL._graphMap) {
          const t = Math.max(0, Math.min(P.activeComp().duration, tOf(x)));
          const v = AETL._graphMap.vmin + (AETL._graphMap.bottom - y) / (AETL._graphMap.bottom - AETL._graphMap.top) * (AETL._graphMap.vmax - AETL._graphMap.vmin);
          P.pushUndo();
          A.setKey(g.prop, t, Array.isArray(g.prop.value) ? g.prop.value.map((_, i) => i === 0 ? v : g.prop.value[i]) : v);
          P.invalidate();
          draw();
        }
        return;
      }
      // select row
      const i = Math.floor((y - AETL.rulerH) / AETL.rowH);
      const row = rows[i];
      if (row) selectLayer(row.layer.id, e);
      else { UI().selected = []; AEPanels.renderProps(); draw(); }
    });

    cv.addEventListener('pointermove', (e) => {
      const { x, y } = localPos(e);
      if (!AETL.drag) {
        const rows = layerRows();
        const i = Math.floor((y - AETL.rulerH) / AETL.rowH);
        AETL.hover = (UI().tlTab !== 'graph' && rows[i] && x >= AETL.nameW) ? { layerId: rows[i].layer.id } : null;
        draw();
        return;
      }
      const d = AETL.drag;
      const t = Math.max(0, Math.min(P.activeComp().duration, tOf(x)));
      if (d.type === 'scrub') {
        P.state.time = t;
        global.AppSyncAudio && global.AppSyncAudio();
      } else if (d.type === 'key') {
        const p = d.hit.prop, k = d.hit.key;
        const dt = Math.max(1 / 30, t - k.t);
        k.t = Math.round(t * 1000) / 1000;
        A.sortKeys(p);
        P.invalidate();
      } else if (d.type === 'graphKey') {
        const g = currentGraph();
        if (!g || !AETL._graphMap) return;
        const v = AETL._graphMap.vmin + (AETL._graphMap.bottom - y) / (AETL._graphMap.bottom - AETL._graphMap.top) * (AETL._graphMap.vmax - AETL._graphMap.vmin);
        const k = d.hit.key;
        k.t = Math.round(t * 1000) / 1000;
        if (Array.isArray(k.v)) k.v = k.v.map((vv, i) => i === 0 ? v : vv);
        else k.v = v;
        A.sortKeys(g.prop);
        P.invalidate();
      } else if (d.type === 'handle') {
        const g = currentGraph();
        if (!g || !AETL._graphMap) return;
        const k = d.hit.key;
        const prev = g.prop.keys[d.hit.index - 1], next = g.prop.keys[d.hit.index + 1];
        const v0 = Array.isArray(k.v) ? k.v[0] : k.v;
        const v = AETL._graphMap.vmin + (AETL._graphMap.bottom - y) / (AETL._graphMap.bottom - AETL._graphMap.top) * (AETL._graphMap.vmax - AETL._graphMap.vmin);
        if (d.side === 'out' && next) {
          const dt = next.t - k.t || 1;
          const dv = ((Array.isArray(next.v) ? next.v[0] : next.v) - v0) || 1e-6;
          k.ho = [Math.max(0, Math.min(1, (t - k.t) / dt)), Math.max(-2, Math.min(2, (v - v0) / dv))];
        } else if (d.side === 'in' && prev) {
          const dt = k.t - prev.t || 1;
          const dv = (v0 - (Array.isArray(prev.v) ? prev.v[0] : prev.v)) || 1e-6;
          k.hi = [Math.max(0, Math.min(1, (k.t - t) / dt)), Math.max(-2, Math.min(2, (v0 - v) / dv))];
        }
        P.invalidate();
      }
      draw();
    });

    const endDrag = () => {
      if (AETL.drag && (AETL.drag.type === 'key' || AETL.drag.type === 'graphKey' || AETL.drag.type === 'handle')) {
        P.invalidate();
        AEPanels.renderProps();
      }
      AETL.drag = null;
      draw();
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointerleave', endDrag);
    cv.addEventListener('dblclick', (e) => {
      const { x, y } = localPos(e);
      if (x < AETL.nameW) return;
      if (UI().tlTab === 'graph') {
        const g = currentGraph();
        if (!g || !AETL._graphMap) return;
        const t = Math.max(0, Math.min(P.activeComp().duration, tOf(x)));
        const v = AETL._graphMap.vmin + (AETL._graphMap.bottom - y) / (AETL._graphMap.bottom - AETL._graphMap.top) * (AETL._graphMap.vmax - AETL._graphMap.vmin);
        P.pushUndo();
        A.setKey(g.prop, t, v);
        P.invalidate(); draw();
      }
    });
    cv.addEventListener('wheel', (e) => {
      if (e.ctrlKey || UI().tlTab === 'graph') {
        e.preventDefault();
        const old = pxPerSec();
        UI().tlZoom = Math.max(0.4, Math.min(8, (UI().tlZoom || 1) * (e.deltaY < 0 ? 1.12 : 0.89)));
        const np = pxPerSec();
        const r = cv.getBoundingClientRect();
        const x = e.clientX - r.left;
        const t = AETL.scroll + (x - AETL.nameW) / old;
        AETL.scroll = Math.max(0, t - (x - AETL.nameW) / np);
        draw();
      } else {
        AETL.scroll = Math.max(0, AETL.scroll + (e.deltaY > 0 ? 0.5 : -0.5) * 0.5);
        draw();
      }
    }, { passive: false });
  }

  function selectLayer(id, e) {
    if (e && e.shiftKey) {
      const i = UI().selected.indexOf(id);
      if (i >= 0) UI().selected.splice(i, 1); else UI().selected.push(id);
    } else if (e && (e.ctrlKey || e.metaKey)) {
      if (!UI().selected.includes(id)) UI().selected.push(id);
    } else {
      UI().selected = [id];
    }
    AEPanels.renderProps();
    draw();
  }

  // redraw helper used by app
  AETL.draw = draw;
  AETL.resize = resize;
  AETL.drawMini = drawMiniGraph;
  AETL.init = init;
  AETL.selectLayer = selectLayer;
  AETL.currentGraph = currentGraph;
  AETL.setGraph = (layer, prop, label) => { AETL.graphProp = { layer, prop, label }; draw(); };

  global.AETL = AETL;
})(window);