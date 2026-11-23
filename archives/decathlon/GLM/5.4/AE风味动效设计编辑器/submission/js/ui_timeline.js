/* ============================================================
   ui_timeline.js — 时间轴：图层行、关键帧、标尺、曲线视图
   ============================================================ */
(function (global) {
  'use strict';
  const M = MODEL;
  const $ = (s) => document.querySelector(s);
  const P_ = () => MODEL.Project;
  const ROW_H = 24;
  const PAD_L = 8;

  const T = { pxPerSec: 90, scrollX: 0, dragKey: null, marquee: null, graphMode: 'value', scrub: false };

  function comp() { return M.activeComp(); }
  function rows() {
    const c = comp(); if (!c) return [];
    const out = [];
    for (const L of c.layers) {
      out.push({ type: 'layer', layer: L });
      if (L._expanded) {
        for (const path of UI.animPaths(L)) {
          const p = M.getPropAt(L, path);
          if (p && p.keys && p.keys.length) out.push({ type: 'prop', layer: L, path });
        }
      }
    }
    return out;
  }
  T.rows = rows;

  /* ---------------- 图层列表 ---------------- */
  T.buildLayerRows = function () {
    const c = comp();
    const wrap = $('#layer-rows');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!c) return;
    const pr = P_();
    const rs = rows();
    for (const r of rs) {
      const L = r.layer;
      if (r.type === 'prop') {
        const p = M.getPropAt(L, r.path);
        const d = document.createElement('div');
        d.className = 'lrow child prop-row-tl';
        d.style.height = ROW_H + 'px';
        const label = M.propLabel(r.path);
        d.innerHTML = `<span class="lvis"></span><span class="llock"></span><span class="lsolo"></span><span class="licon">◦</span><span class="lname">${label}</span><span class="lmode">${p.keys.length} 关键帧</span>`;
        wrap.appendChild(d);
        continue;
      }
      const d = document.createElement('div');
      d.className = 'lrow' + (pr.selection.includes(L.id) ? ' sel' : '') + (L.enabled ? '' : ' hidden-layer');
      d.dataset.id = L.id;
      const typeLabel = M.LAYER_TYPES[L.type].label;
      const blend = ({ normal: '正常', add: '相加', screen: '滤色', multiply: '正片叠底', overlay: '叠加' })[L.blend] || '正常';
      const color = layerColor(L);
      d.innerHTML = `
        <span class="lvis" title="显示/隐藏">${L.enabled ? '●' : '○'}</span>
        <span class="llock" title="锁定">${L.locked ? '🔒' : ''}</span>
        <span class="lsolo" title="独奏">${L.solo ? '◎' : ''}</span>
        <span class="licon">${icon(L.type)}</span>
        <span class="lname">${esc(L.name)}</span>
        <span class="lcolor" style="background:${color}"></span>
        <span class="lmode">${blend}</span>`;
      d.querySelector('.lvis').onclick = (e) => { e.stopPropagation(); L.enabled = !L.enabled; UI.refresh(); };
      d.querySelector('.llock').onclick = (e) => { e.stopPropagation(); L.locked = !L.locked; UI.refresh(); };
      d.querySelector('.lsolo').onclick = (e) => { e.stopPropagation(); L.solo = !L.solo; UI.refresh(); };
      d.onclick = (e) => {
        if (e.shiftKey) { const s = P_().selection.slice(); const i = s.indexOf(L.id); if (i >= 0) s.splice(i, 1); else s.push(L.id); P_().selection = s; }
        else if (e.ctrlKey || e.metaKey) { const s = P_().selection.slice(); if (!s.includes(L.id)) s.push(L.id); P_().selection = s; }
        else P_().selection = [L.id];
        UI.refresh();
      };
      d.ondblclick = (e) => { if (e.target.classList.contains('lname')) UI.renameLayer(L); };
      d.oncontextmenu = (e) => { e.preventDefault(); P_().selection = [L.id]; UI.refresh(); UI.layerContextMenu(e.clientX, e.clientY, L); };
      // 展开箭头
      const arrow = document.createElement('span');
      arrow.className = 'lvis';
      arrow.style.cssText = 'cursor:pointer;font-size:9px;color:#6c7282';
      arrow.textContent = L._expanded ? '▾' : '▸';
      arrow.onclick = (e) => { e.stopPropagation(); L._expanded = !L._expanded; UI.refresh(); };
      d.insertBefore(arrow, d.firstChild);
      // 拖动排序
      d.draggable = true;
      d.ondragstart = (e) => { e.dataTransfer.setData('text/plain', L.id); };
      d.ondragover = (e) => e.preventDefault();
      d.ondrop = (e) => {
        e.preventDefault();
        const srcId = e.dataTransfer.getData('text/plain');
        const src = c.layers.find(l => l.id === srcId);
        if (!src || src === L) return;
        M.Undo.begin('调整图层顺序');
        const i = c.layers.indexOf(src);
        c.layers.splice(i, 1);
        const j = c.layers.indexOf(L);
        c.layers.splice(j, 0, src);
        M.Undo.end(); UI.refresh();
      };
      wrap.appendChild(d);
    }
  };
  function icon(t) { return ({ shape: 'arti', text: 'T', null: '◌', adjust: '◐', precomp: '▣', solid: '▦', particle: '✦', field: '◈', camera: '◧', light: '☀', audio: '♪' })[t] || '·'; }
  function esc(s) { return String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
  function layerColor(L) {
    if (L.type === 'shape' && L.shapes[0] && L.shapes[0].fill) return M.evalKeyframes(L.shapes[0].fill.color, P_().time);
    if (L.type === 'text') return M.evalKeyframes(L.text.color, P_().time);
    if (L.type === 'solid') return M.evalKeyframes(L.material.color, P_().time);
    return '#4a5568';
  }
  T.buildLayerRows();

  /* ---------------- 标尺 ---------------- */
  function timeToX(t) { return (t - T.scrollX) * T.pxPerSec + PAD_L; }
  function xToTime(x) { return (x - PAD_L) / T.pxPerSec + T.scrollX; }
  T.timeToX = timeToX; T.xToTime = xToTime;

  T.drawRuler = function () {
    const c = comp();
    const cv = $('#ruler-canvas');
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!c) return;
    const dur = c.duration;
    const step = T.pxPerSec > 160 ? 0.1 : T.pxPerSec > 70 ? 0.25 : T.pxPerSec > 30 ? 0.5 : 1;
    ctx.font = '10px Consolas, monospace';
    ctx.textAlign = 'left';
    for (let t = Math.max(0, Math.ceil(T.scrollX / step) * step); t <= Math.min(dur, T.scrollX + w / T.pxPerSec); t += step) {
      const x = timeToX(t);
      const isMajor = Math.abs(t - Math.round(t)) < 1e-6;
      ctx.strokeStyle = isMajor ? 'rgba(140,150,175,0.35)' : 'rgba(120,130,155,0.14)';
      ctx.beginPath(); ctx.moveTo(x + 0.5, isMajor ? 8 : 14); ctx.lineTo(x + 0.5, h); ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = '#8a90a0';
        ctx.fillText(t.toFixed(0) + 's', x + 3, 12);
      }
    }
    // 工作区
    const wa = c.workArea || [0, c.duration];
    ctx.fillStyle = 'rgba(63,140,255,0.10)';
    ctx.fillRect(timeToX(wa[0]), 0, (wa[1] - wa[0]) * T.pxPerSec, h);
    ctx.strokeStyle = 'rgba(63,140,255,0.5)';
    ctx.strokeRect(timeToX(wa[0]) + 0.5, 0.5, (wa[1] - wa[0]) * T.pxPerSec - 1, h - 1);
    // 播放头
    const px = timeToX(P_().time);
    ctx.strokeStyle = '#3f8cff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke();
    ctx.fillStyle = '#3f8cff';
    ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 7); ctx.closePath(); ctx.fill();
  };

  /* ---------------- 关键帧画布 ---------------- */
  T.drawKeys = function () {
    const c = comp();
    const cv = $('#key-canvas');
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!c) return;
    const dur = c.duration;
    const scrollY = $('#layer-rows') ? $('#layer-rows').scrollTop : 0;
    const rs = rows();
    // 行分隔线
    for (let i = 0; i < rs.length; i++) {
      const y = i * ROW_H - scrollY;
      if (y > h || y + ROW_H < 0) continue;
      ctx.strokeStyle = 'rgba(40,42,50,0.8)';
      ctx.beginPath(); ctx.moveTo(0, y + ROW_H + 0.5); ctx.lineTo(w, y + ROW_H + 0.5); ctx.stroke();
    }
    // 入出点条
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (r.type !== 'layer') continue;
      const L = r.layer;
      const y = i * ROW_H - scrollY;
      const x0 = timeToX(Math.max(0, L.inPoint)), x1 = timeToX(Math.min(dur, L.outPoint));
      ctx.fillStyle = P_().selection.includes(L.id) ? 'rgba(63,140,255,0.20)' : 'rgba(90,100,125,0.13)';
      ctx.fillRect(x0, y + 4, Math.max(2, x1 - x0), ROW_H - 8);
      ctx.strokeStyle = 'rgba(120,140,180,0.5)';
      ctx.strokeRect(x0 + 0.5, y + 4.5, Math.max(2, x1 - x0) - 1, ROW_H - 9);
    }
    // 关键帧
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      const y = i * ROW_H - scrollY + ROW_H / 2;
      if (y < -10 || y > h + 10) continue;
      if (r.type === 'layer') {
        const L = r.layer;
        for (const path of UI.animPaths(L)) {
          const p = M.getPropAt(L, path);
          if (!p || !p.keys || !p.keys.length) continue;
          for (const k of p.keys) {
            const x = timeToX(k.t);
            if (x < -10 || x > w + 10) continue;
            const sel = UI.selectedKeys.some(s => s.layer === L.id && s.path.join('.') === path.join('.') && Math.abs(s.t - k.t) < 1e-4);
            drawDiamond(ctx, x, y, sel);
          }
        }
      } else {
        const p = M.getPropAt(r.layer, r.path);
        if (!p || !p.keys) continue;
        for (const k of p.keys) {
          const x = timeToX(k.t);
          if (x < -10 || x > w + 10) continue;
          const sel = UI.selectedKeys.some(s => s.layer === r.layer.id && s.path.join('.') === r.path.join('.') && Math.abs(s.t - k.t) < 1e-4);
          drawDiamond(ctx, x, y, sel, k.ease);
        }
      }
    }
    // 播放头
    const px = timeToX(P_().time);
    ctx.strokeStyle = 'rgba(63,140,255,0.9)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px + 0.5, 0); ctx.lineTo(px + 0.5, h); ctx.stroke();
    // 框选
    if (T.marquee) {
      const m = T.marquee;
      ctx.strokeStyle = 'rgba(90,160,255,0.9)'; ctx.fillStyle = 'rgba(90,160,255,0.12)';
      const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
      ctx.fillRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    }
  };
  function drawDiamond(ctx, x, y, sel, ease) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    const s = sel ? 5 : 4;
    ctx.fillStyle = sel ? '#ffffff' : (ease === 'hold' ? '#8a8f9c' : ease === 'linear' ? '#9fb6d8' : '#e8c56a');
    ctx.strokeStyle = sel ? '#3f8cff' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.strokeRect(-s + 0.5, -s + 0.5, s * 2 - 1, s * 2 - 1);
    ctx.restore();
  }

  /* ---------------- 曲线视图 ---------------- */
  T.drawGraph = function () {
    const c = comp();
    const cv = $('#graph-canvas');
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!c) return;
    const t0 = T.scrollX, t1 = T.scrollX + w / T.pxPerSec;
    // 收集曲线
    const curves = [];
    const sel = UI.selLayers();
    for (const L of sel) {
      for (const path of UI.animPaths(L)) {
        const p = M.getPropAt(L, path);
        if (!p || !p.keys || p.keys.length < 1) continue;
        curves.push({ L, path, p, color: curveColor(curves.length) });
      }
    }
    if (!curves.length) {
      ctx.fillStyle = '#4a4f5c'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('选择带关键帧的图层以查看曲线', w / 2, h / 2);
      return;
    }
    // 值范围
    let vmin = Infinity, vmax = -Infinity;
    for (const cu of curves) {
      const vals = cu.p.keys.map(k => Array.isArray(k.v) ? Math.max(...k.v) : k.v);
      const vals2 = cu.p.keys.map(k => Array.isArray(k.v) ? Math.min(...k.v) : k.v);
      vmin = Math.min(vmin, ...vals2); vmax = Math.max(vmax, ...vals);
      if (cu.p.exprOn && cu.p.expr) {
        const st = new EVAL.EvalState(c, P_().time);
        for (let i = 0; i <= 40; i++) {
          const t = t0 + (t1 - t0) * i / 40;
          const v = st.getProp(cu.L, cu.path, t);
          const n = Array.isArray(v) ? Math.max(...v) : v;
          vmin = Math.min(vmin, n); vmax = Math.max(vmax, n);
        }
      }
    }
    if (!isFinite(vmin) || !isFinite(vmax)) { vmin = 0; vmax = 1; }
    if (vmax - vmin < 1e-3) { vmax = vmin + 1; }
    const pad = (vmax - vmin) * 0.15;
    vmin -= pad; vmax += pad;
    const top = 16, bottom = h - 24;
    const ty = (v) => top + (1 - (v - vmin) / (vmax - vmin)) * (bottom - top);
    // 网格
    ctx.strokeStyle = 'rgba(70,76,92,0.35)'; ctx.lineWidth = 1;
    ctx.font = '9px Consolas, monospace'; ctx.fillStyle = '#5b6170'; ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const v = vmin + (vmax - vmin) * i / 4;
      const y = ty(v);
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
      ctx.fillText(v.toFixed(1), 40, y + 3);
    }
    ctx.textAlign = 'center';
    for (let t = Math.ceil(t0); t <= t1; t++) {
      const x = timeToX(t);
      ctx.strokeStyle = 'rgba(70,76,92,0.2)';
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
      ctx.fillText(t + 's', x, h - 8);
    }
    // 曲线
    for (const cu of curves) {
      ctx.strokeStyle = cu.color; ctx.lineWidth = 1.8;
      ctx.beginPath();
      const st = new EVAL.EvalState(c, P_().time);
      const N = Math.max(60, Math.round(w / 3));
      for (let i = 0; i <= N; i++) {
        const t = t0 + (t1 - t0) * i / N;
        let v;
        if (cu.p.exprOn && cu.p.expr) v = st.getProp(cu.L, cu.path, t);
        else v = M.evalKeyframes(cu.p, t);
        if (Array.isArray(v)) v = Math.hypot(...v);
        if (T.graphMode === 'speed') {
          const e = 1 / 120;
          let a = M.evalKeyframes(cu.p, Math.max(0, t - e)), b = M.evalKeyframes(cu.p, t + e);
          if (cu.p.exprOn && cu.p.expr) { a = st.getProp(cu.L, cu.path, Math.max(0, t - e)); b = st.getProp(cu.L, cu.path, t + e); }
          v = (Array.isArray(b) ? Math.hypot(...b) : b) - (Array.isArray(a) ? Math.hypot(...a) : a);
          v = Math.abs(v) / (2 * e);
        }
        const y = ty(v);
        if (i === 0) ctx.moveTo(timeToX(t), y); else ctx.lineTo(timeToX(t), y);
      }
      ctx.stroke();
      // 关键帧
      if (T.graphMode === 'value') {
        for (const k of cu.p.keys) {
          const x = timeToX(k.t);
          const v = Array.isArray(k.v) ? Math.hypot(...k.v) : k.v;
          const y = ty(v);
          const selk = UI.selectedKeys.some(s => s.layer === cu.L.id && s.path.join('.') === cu.path.join('.') && Math.abs(s.t - k.t) < 1e-4);
          ctx.fillStyle = selk ? '#fff' : cu.color;
          ctx.strokeStyle = '#0d0e11'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, selk ? 5 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          // 手柄
          const nx = timeToX(k.t + k.outT[0]), ny = ty(v + (Array.isArray(k.outT[1]) ? k.outT[1][0] : k.outT[1]));
          ctx.strokeStyle = cu.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = cu.color;
          ctx.beginPath(); ctx.arc(nx, ny, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    // 图例
    ctx.textAlign = 'left'; ctx.font = '10px sans-serif';
    let lx = 50;
    for (const cu of curves) {
      ctx.fillStyle = cu.color;
      ctx.fillRect(lx, 4, 8, 8);
      ctx.fillStyle = '#a8aeba';
      ctx.fillText((cu.L.name + ' · ' + M.propLabel(cu.path)).slice(0, 18), lx + 12, 12);
      lx += 130;
      if (lx > w - 100) break;
    }
  };
  function curveColor(i) { return ['#e8c56a', '#6fd0ff', '#8be28b', '#ff8fa3', '#c39bff', '#ff9f43'][i % 6]; }

  /* ---------------- 交互 ---------------- */
  T.resize = function () {
    T.drawRuler(); T.drawKeys(); T.drawGraph();
  };
  T.zoom = function (f) {
    T.pxPerSec = U.clamp(T.pxPerSec * f, 8, 800);
    T.drawRuler(); T.drawKeys(); T.drawGraph();
  };

  function initCanvasEvents() {
    const ruler = $('#ruler');
    ruler.addEventListener('mousedown', (e) => {
      const rect = ruler.getBoundingClientRect();
      T.scrub = true;
      UI.setTime(U.clamp(xToTime(e.clientX - rect.left), 0, comp() ? comp().duration : 0));
      const move = (ev) => { UI.setTime(U.clamp(xToTime(ev.clientX - ruler.getBoundingClientRect().left), 0, comp().duration)); };
      const up = () => { T.scrub = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    const kc = $('#key-canvas');
    kc.addEventListener('mousedown', (e) => {
      const c = comp(); if (!c) return;
      const rect = kc.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const scrollY = $('#layer-rows').scrollTop;
      const hit = hitKey(mx, my, scrollY);
      if (hit) {
        if (e.shiftKey) {
          const i = UI.selectedKeys.findIndex(s => s.layer === hit.layer.id && s.path.join('.') === hit.path.join('.') && Math.abs(s.t - hit.t) < 1e-4);
          if (i >= 0) UI.selectedKeys.splice(i, 1); else UI.selectedKeys.push(hit);
        } else if (!UI.selectedKeys.some(s => s.layer === hit.layer.id && s.path.join('.') === hit.path.join('.') && Math.abs(s.t - hit.t) < 1e-4)) {
          UI.selectedKeys = [hit];
        }
        T.dragKey = { x0: mx, keys: UI.selectedKeys.map(s => ({ ...s })), moved: false, dup: e.altKey };
        UI.overlayDirty = true;
        T.drawKeys();
        return;
      }
      // 空白：框选或定位
      T.marquee = { x0: mx, y0: my, x1: mx, y1: my };
      if (!e.shiftKey) { UI.selectedKeys = []; }
      T.drawKeys();
    });
    window.addEventListener('mousemove', (e) => {
      const kc = $('#key-canvas');
      if (!kc) return;
      const rect = kc.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (T.dragKey) {
        const dt = (mx - T.dragKey.x0) / T.pxPerSec;
        if (Math.abs(dt) > 0.001) T.dragKey.moved = true;
        T.dragKey.dt = dt;
        T.drawKeys();
        return;
      }
      if (T.marquee) {
        T.marquee.x1 = mx; T.marquee.y1 = my;
        // 选择框内关键帧
        const scrollY = $('#layer-rows').scrollTop;
        const x0 = Math.min(T.marquee.x0, mx), x1 = Math.max(T.marquee.x0, mx);
        const y0 = Math.min(T.marquee.y0, my), y1 = Math.max(T.marquee.y0, my);
        const sel = [];
        const rs = rows();
        for (let i = 0; i < rs.length; i++) {
          const cy = i * ROW_H - scrollY + ROW_H / 2;
          if (cy < y0 || cy > y1) continue;
          const r = rs[i];
          if (r.type !== 'layer') continue;
          for (const path of UI.animPaths(r.layer)) {
            const p = M.getPropAt(r.layer, path);
            if (!p || !p.keys) continue;
            for (const k of p.keys) {
              const kx = timeToX(k.t);
              if (kx >= x0 && kx <= x1) sel.push({ layer: r.layer.id, path, t: k.t });
            }
          }
        }
        UI.selectedKeys = sel;
        T.drawKeys();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (T.dragKey) {
        if (T.dragKey.moved) {
          M.Undo.begin('移动关键帧');
          const c = comp();
          for (const k of T.dragKey.keys) {
            const L = c.layers.find(l => l.id === k.layer);
            if (!L) continue;
            const p = M.getPropAt(L, k.path);
            const kk = p.keys.find(x => Math.abs(x.t - k.t) < 1e-4);
            if (!kk) continue;
            const nt = U.clamp(k.t + (T.dragKey.dt || 0), 0, c.duration);
            if (T.dragKey.dup) { const copy = JSON.parse(JSON.stringify(kk)); copy.t = nt; p.keys.push(copy); p.keys.sort((a, b) => a.t - b.t); }
            else { kk.t = nt; p.keys.sort((a, b) => a.t - b.t); }
            M.recomputeTangents(p);
          }
          M.Undo.end();
          UI.selectedKeys = T.dragKey.keys.map(k => ({ layer: k.layer, path: k.path, t: U.clamp(k.t + (T.dragKey.dt || 0), 0, comp().duration) }));
          UI.refresh();
        }
        T.dragKey = null;
      }
      if (T.marquee) { T.marquee = null; T.drawKeys(); }
    });
    // 图形视图
    const gc = $('#graph-canvas');
    gc.addEventListener('mousedown', (e) => {
      const rect = gc.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const c = comp(); if (!c) return;
      const curves = graphCurves();
      for (const cu of curves) {
        for (const k of cu.p.keys) {
          const x = timeToX(k.t);
          const v = Array.isArray(k.v) ? Math.hypot(...k.v) : k.v;
          const y = graphY(v, curves);
          if (Math.hypot(x - mx, y - my) < 7) {
            UI.selectedKeys = [{ layer: cu.L.id, path: cu.path, t: k.t }];
            T.dragGraph = { cu, k, y0: my, v0: v, t0: k.t, x0: mx };
            T.drawGraph(); T.drawKeys();
            return;
          }
          // 手柄
          const hx = timeToX(k.t + k.outT[0]);
          const hv = v + (Array.isArray(k.outT[1]) ? k.outT[1][0] : k.outT[1]);
          const hy = graphY(hv, curves);
          if (Math.hypot(hx - mx, hy - my) < 6) {
            T.dragHandle = { cu, k, side: 'out', idx: 0 };
            return;
          }
        }
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (T.dragGraph) {
        const c = comp();
        const rect = $('#graph-canvas').getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const cu = T.dragGraph.cu, k = T.dragGraph.k;
        const curves = graphCurves();
        const v = graphVal(my, curves);
        k.t = U.clamp(xToTime(mx), 0, c.duration);
        if (Array.isArray(k.v)) k.v = k.v.map((x, i) => i === 0 ? v : x); else k.v = v;
        M.recomputeTangents(cu.p);
        T.drawGraph(); T.drawKeys(); UI.invalidate();
      }
      if (T.dragHandle) {
        const rect = $('#graph-canvas').getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const { cu, k } = T.dragHandle;
        const curves = graphCurves();
        const dt = xToTime(mx) - k.t;
        const v = graphVal(my, curves) - (Array.isArray(k.v) ? k.v[0] : k.v);
        k.outT = [Math.max(0.001, dt), Array.isArray(k.v) ? k.v.map((_, i) => i === 0 ? v : 0) : v];
        T.drawGraph(); UI.invalidate();
      }
    });
    window.addEventListener('mouseup', () => { T.dragGraph = null; T.dragHandle = null; });
    // 滚轮
    kc.addEventListener('wheel', (e) => { e.preventDefault(); T.scrollX = Math.max(0, T.scrollX + e.deltaY * 0.001); T.drawRuler(); T.drawKeys(); T.drawGraph(); }, { passive: false });
    gc.addEventListener('wheel', (e) => { e.preventDefault(); T.scrollX = Math.max(0, T.scrollX + e.deltaY * 0.001); T.drawRuler(); T.drawKeys(); T.drawGraph(); }, { passive: false });
    const lr = $('#layer-rows');
    if (lr) lr.addEventListener('scroll', () => { T.drawKeys(); });
  }
  function hitKey(mx, my, scrollY) {
    const rs = rows();
    const c = comp();
    for (let i = 0; i < rs.length; i++) {
      const cy = i * ROW_H - scrollY + ROW_H / 2;
      if (Math.abs(cy - my) > 10) continue;
      const r = rs[i];
      if (r.type !== 'layer') continue;
      for (const path of UI.animPaths(r.layer)) {
        const p = M.getPropAt(r.layer, path);
        if (!p || !p.keys) continue;
        for (const k of p.keys) {
          if (Math.abs(timeToX(k.t) - mx) < 6) return { layer: r.layer.id, path, t: k.t };
        }
      }
    }
    return null;
  }
  let _curvesCache = null, _curvesTime = 0;
  function graphCurves() {
    const c = comp(); if (!c) return [];
    const sel = UI.selLayers();
    const out = [];
    for (const L of sel) for (const path of UI.animPaths(L)) {
      const p = M.getPropAt(L, path);
      if (p && p.keys && p.keys.length) out.push({ L, path, p });
    }
    return out;
  }
  function graphRange(curves) {
    let vmin = Infinity, vmax = -Infinity;
    for (const cu of curves) {
      for (const k of cu.p.keys) { const v = Array.isArray(k.v) ? Math.max(...k.v) : k.v; const v2 = Array.isArray(k.v) ? Math.min(...k.v) : k.v; vmin = Math.min(vmin, v2); vmax = Math.max(vmax, v); }
    }
    if (!isFinite(vmin)) { vmin = 0; vmax = 1; }
    if (vmax - vmin < 1e-3) vmax = vmin + 1;
    const pad = (vmax - vmin) * 0.15;
    return [vmin - pad, vmax + pad];
  }
  function graphY(v, curves) { const [a, b] = graphRange(curves); return 16 + (1 - (v - a) / (b - a)) * ($('#graph-canvas').clientHeight - 40); }
  function graphVal(y, curves) { const [a, b] = graphRange(curves); const h = $('#graph-canvas').clientHeight - 40; return a + (1 - (y - 16) / h) * (b - a); }

  T.init = function () {
    initCanvasEvents();
    // 曲线模式切换
    const tl = document.querySelector('.tl-tools');
    if (tl) {
      const b = document.createElement('button');
      b.className = 'tbtn'; b.textContent = '值/速'; b.title = '切换值曲线 / 速度曲线';
      b.onclick = () => { T.graphMode = T.graphMode === 'value' ? 'speed' : 'value'; T.drawGraph(); };
      tl.insertBefore(b, tl.firstChild);
    }
    // 工作区拖动（在标尺上按住 shift 拖动）
    window.addEventListener('resize', () => T.resize());
  };

  global.UI_TIMELINE = T;
})(window);
