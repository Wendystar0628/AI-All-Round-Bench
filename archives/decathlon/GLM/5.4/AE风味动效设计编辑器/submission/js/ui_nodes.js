/* ============================================================
   ui_nodes.js — 节点编辑器：画布、连线、参数编辑、分组
   ============================================================ */
(function (global) {
  'use strict';
  const N = NODES;
  const $ = (s) => document.querySelector(s);
  const P_ = () => MODEL.Project;
  const NW = 176, HH = 22, PORT_H = 18;

  const NE = { pan: { x: 30, y: 20 }, zoom: 1, dragNode: null, dragLink: null, sel: [], hover: null, marquee: null };

  function comp() { return MODEL.activeComp(); }
  function graph() { const c = comp(); return c ? c.nodes : { nodes: [], links: [] }; }

  NE.resize = function () { NE.draw(); };

  NE.nodePos = function (n) {
    return { x: n.x * NE.zoom + NE.pan.x, y: n.y * NE.zoom + NE.pan.y, w: NW * NE.zoom, h: NE.nodeHeight(n) * NE.zoom };
  };
  NE.nodeHeight = function (n) {
    const def = N.DEFS[n.type];
    if (!def) return HH + 20;
    const rows = Math.max(def.inputs.length, def.outputs.length);
    const params = def.params.length ? def.params.length * 16 + 8 : 0;
    return HH + 8 + rows * PORT_H + params + 10;
  };
  NE.portPos = function (n, port, isOut) {
    const def = N.DEFS[n.type];
    const p = NE.nodePos(n);
    const list = isOut ? def.outputs : def.inputs;
    const i = list.findIndex((_, k) => k === port);
    const idx = list.findIndex((x) => x === list[port]);
    return {
      x: isOut ? p.x + p.w : p.x,
      y: p.y + HH + 8 + idx * PORT_H + PORT_H / 2
    };
  };

  NE.draw = function () {
    const cv = $('#node-canvas');
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // 网格
    ctx.strokeStyle = 'rgba(60,66,82,0.25)'; ctx.lineWidth = 1;
    const step = 24 * NE.zoom;
    const ox = NE.pan.x % step, oy = NE.pan.y % step;
    for (let x = ox; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = oy; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const g = graph();
    // 连线
    for (const lk of g.links) {
      const from = g.nodes.find(n => n.id === lk.from);
      const to = g.nodes.find(n => n.id === lk.to);
      if (!from || !to) continue;
      const a = NE.portPos(from, lk.fromPort, true);
      const b = NE.portPos(to, lk.toPort, false);
      const def = N.DEFS[from.type];
      const type = def.outputs[lk.fromPort] ? def.outputs[lk.fromPort].type : 'any';
      ctx.strokeStyle = N.PORT_COLOR[type] || '#9aa3b5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5);
      ctx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y);
      ctx.stroke();
    }
    // 拖动中的连线
    if (NE.dragLink) {
      const a = NE.dragLink.from;
      const b = NE.dragLink.cur;
      ctx.strokeStyle = N.PORT_COLOR[NE.dragLink.type] || '#fff';
      ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5);
      ctx.bezierCurveTo(a.x + dx, a.y, b.x - dx, b.y, b.x, b.y);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // 节点
    for (const n of g.nodes) {
      const def = N.DEFS[n.type];
      if (!def) continue;
      const p = NE.nodePos(n);
      const sel = NE.sel.includes(n.id);
      ctx.fillStyle = sel ? '#243447' : '#1c1e25';
      ctx.strokeStyle = sel ? '#3f8cff' : '#33363f';
      ctx.lineWidth = sel ? 2 : 1;
      roundRect(ctx, p.x, p.y, p.w, p.h, 5); ctx.fill(); ctx.stroke();
      // 标题
      ctx.fillStyle = def.color || '#2a2d36';
      roundRect(ctx, p.x, p.y, p.w, HH * NE.zoom, 5); ctx.fill();
      ctx.fillStyle = '#0d0e11'; ctx.font = `bold ${11 * NE.zoom}px sans-serif`; ctx.textAlign = 'left';
      ctx.fillText(def.label, p.x + 8, p.y + HH * NE.zoom * 0.7);
      // 端口
      ctx.font = `${10 * NE.zoom}px sans-serif`;
      def.inputs.forEach((ip, i) => {
        const pp = NE.portPos(n, i, false);
        ctx.fillStyle = N.PORT_COLOR[ip.type] || '#9aa3b5';
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 4.5 * NE.zoom, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a8aeba'; ctx.textAlign = 'left';
        ctx.fillText(ip.name, pp.x + 8, pp.y + 3.5);
        // 已连接的值
        const lk = g.links.find(l => l.to === n.id && l.toPort === i);
        if (lk) {
          const src = g.nodes.find(x => x.id === lk.from);
          if (src) { ctx.fillStyle = '#596073'; ctx.textAlign = 'right'; ctx.fillText('← ' + N.DEFS[src.type].label, p.x + p.w - 6, pp.y + 3.5); }
        }
      });
      def.outputs.forEach((op, i) => {
        const pp = NE.portPos(n, i, true);
        ctx.fillStyle = N.PORT_COLOR[op.type] || '#9aa3b5';
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 4.5 * NE.zoom, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a8aeba'; ctx.textAlign = 'right';
        ctx.fillText(op.name, pp.x - 8, pp.y + 3.5);
      });
      // 参数
      let py = p.y + HH * NE.zoom + 6 + Math.max(def.inputs.length, def.outputs.length) * PORT_H;
      for (const pd of def.params) {
        if (pd.type === 'layer') continue;
        const val = n.params[pd.key];
        ctx.fillStyle = '#7e8494'; ctx.textAlign = 'left'; ctx.font = `${9 * NE.zoom}px sans-serif`;
        ctx.fillText(pd.label, p.x + 8, py + 9);
        ctx.fillStyle = '#c6cad4'; ctx.textAlign = 'right';
        ctx.fillText(pd.type === 'select' ? val : (typeof val === 'number' ? (Math.round(val * 100) / 100) : val), p.x + p.w - 8, py + 9);
        py += 16 * NE.zoom;
      }
      // 图层参数行
      for (const pd of def.params) {
        if (pd.type !== 'layer') continue;
        const L = comp().layers.find(l => l.id === n.params[pd.key]);
        ctx.fillStyle = '#6fd0ff'; ctx.textAlign = 'left'; ctx.font = `${9 * NE.zoom}px sans-serif`;
        ctx.fillText('◈ ' + (L ? L.name : '未选择图层'), p.x + 8, py + 9);
        py += 16 * NE.zoom;
      }
    }
    // 框选
    if (NE.marquee) {
      const m = NE.marquee;
      ctx.strokeStyle = 'rgba(90,160,255,0.9)'; ctx.fillStyle = 'rgba(90,160,255,0.1)';
      const x = Math.min(m.x0, m.x1), y = Math.min(m.y0, m.y1);
      ctx.fillRect(x, y, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(m.x1 - m.x0), Math.abs(m.y1 - m.y0));
    }
  };
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  function hitNode(x, y) {
    const g = graph();
    for (let i = g.nodes.length - 1; i >= 0; i--) {
      const n = g.nodes[i];
      const p = NE.nodePos(n);
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return n;
    }
    return null;
  }
  function hitPort(x, y) {
    const g = graph();
    for (const n of g.nodes) {
      const def = N.DEFS[n.type];
      if (!def) continue;
      for (let i = 0; i < def.inputs.length; i++) {
        const p = NE.portPos(n, i, false);
        if (Math.hypot(p.x - x, p.y - y) < 8) return { node: n, port: i, out: false };
      }
      for (let i = 0; i < def.outputs.length; i++) {
        const p = NE.portPos(n, i, true);
        if (Math.hypot(p.x - x, p.y - y) < 8) return { node: n, port: i, out: true };
      }
    }
    return null;
  }
  function hitLink(x, y) {
    const g = graph();
    for (const lk of g.links) {
      const from = g.nodes.find(n => n.id === lk.from);
      const to = g.nodes.find(n => n.id === lk.to);
      if (!from || !to) continue;
      const a = NE.portPos(from, lk.fromPort, true), b = NE.portPos(to, lk.toPort, false);
      for (let t = 0.1; t < 1; t += 0.05) {
        const dx = Math.max(30, Math.abs(b.x - a.x) * 0.5);
        const mt = 1 - t;
        const px = mt * mt * mt * a.x + 3 * mt * mt * t * (a.x + dx) + 3 * mt * t * t * (b.x - dx) + t * t * t * b.x;
        const py = mt * mt * mt * a.y + 3 * mt * mt * t * a.y + 3 * mt * t * t * b.y + t * t * t * b.y;
        if (Math.hypot(px - x, py - y) < 6) return lk;
      }
    }
    return null;
  }

  NE.init = function () {
    const cv = $('#node-canvas');
    const sel = $('#node-add-select');
    for (const k in N.DEFS) {
      const o = document.createElement('option');
      o.value = k; o.textContent = N.DEFS[k].label;
      sel.appendChild(o);
    }
    $('#node-add').onclick = () => {
      const c = comp(); if (!c) return;
      MODEL.Undo.begin('添加节点');
      const n = N.createNode(sel.value, (60 - NE.pan.x) / NE.zoom, (40 - NE.pan.y) / NE.zoom);
      c.nodes.nodes.push(n);
      MODEL.Undo.end();
      NE.sel = [n.id];
      NE.draw(); UI.refresh();
    };
    $('#node-del').onclick = () => {
      const c = comp(); if (!c) return;
      MODEL.Undo.begin('删除节点');
      c.nodes.nodes = c.nodes.nodes.filter(n => !NE.sel.includes(n.id));
      c.nodes.links = c.nodes.links.filter(l => !NE.sel.includes(l.from) && !NE.sel.includes(l.to));
      NE.sel = [];
      MODEL.Undo.end(); NE.draw(); UI.refresh();
    };
    $('#node-group').onclick = () => NE.group();
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (e.button === 2) {
        const lk = hitLink(x, y);
        if (lk) { MODEL.Undo.begin('断开连线'); const g = graph(); g.links = g.links.filter(l => l !== lk); MODEL.Undo.end(); NE.draw(); UI.refresh(); return; }
        const n = hitNode(x, y);
        if (n) { NE.sel = [n.id]; NE.draw(); }
        return;
      }
      if (e.button === 1) { NE.panDrag = { x0: e.clientX, y0: e.clientY, px: NE.pan.x, py: NE.pan.y }; return; }
      const port = hitPort(x, y);
      if (port) {
        if (port.out) {
          const p = NE.portPos(port.node, port.port, true);
          NE.dragLink = { from: p, cur: { x, y }, fromNode: port.node, fromPort: port.port, type: N.DEFS[port.node.type].outputs[port.port].type };
        } else {
          // 断开已有连线
          const g = graph();
          const lk = g.links.find(l => l.to === port.node.id && l.toPort === port.port);
          if (lk) { MODEL.Undo.begin('断开连线'); g.links = g.links.filter(l => l !== lk); MODEL.Undo.end(); }
          const p = NE.portPos(port.node, port.port, false);
          NE.dragLink = { to: p, cur: { x, y }, toNode: port.node, toPort: port.port, type: N.DEFS[port.node.type].inputs[port.port].type };
        }
        return;
      }
      const n = hitNode(x, y);
      if (n) {
        if (e.shiftKey) { if (!NE.sel.includes(n.id)) NE.sel.push(n.id); }
        else if (!NE.sel.includes(n.id)) NE.sel = [n.id];
        NE.dragNode = { x0: e.clientX, y0: e.clientY, nodes: NE.sel.map(id => ({ n: graph().nodes.find(q => q.id === id), x: 0, y: 0 })).filter(o => o.n) };
        NE.dragNode.nodes.forEach(o => { o.x = o.n.x; o.y = o.n.y; });
        NE.draw();
        return;
      }
      NE.sel = [];
      NE.marquee = { x0: x, y0: y, x1: x, y1: y };
      NE.draw();
    });
    window.addEventListener('mousemove', (e) => {
      const cv = $('#node-canvas'); if (!cv) return;
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (NE.panDrag) { NE.pan.x = NE.panDrag.px + e.clientX - NE.panDrag.x0; NE.pan.y = NE.panDrag.py + e.clientY - NE.panDrag.y0; NE.draw(); return; }
      if (NE.dragLink) { NE.dragLink.cur = { x, y }; NE.draw(); return; }
      if (NE.dragNode) {
        const dx = (e.clientX - NE.dragNode.x0) / NE.zoom, dy = (e.clientY - NE.dragNode.y0) / NE.zoom;
        for (const o of NE.dragNode.nodes) { o.n.x = o.x + dx; o.n.y = o.y + dy; }
        NE.draw(); UI.invalidate(); return;
      }
      if (NE.marquee) {
        NE.marquee.x1 = x; NE.marquee.y1 = y;
        const x0 = Math.min(NE.marquee.x0, x), x1 = Math.max(NE.marquee.x0, x);
        const y0 = Math.min(NE.marquee.y0, y), y1 = Math.max(NE.marquee.y0, y);
        NE.sel = graph().nodes.filter(n => { const p = NE.nodePos(n); return p.x >= x0 && p.x + p.w <= x1 && p.y >= y0 && p.y + p.h <= y1; }).map(n => n.id);
        NE.draw();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (NE.dragLink) {
        const cv = $('#node-canvas');
        const r = cv.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        const port = hitPort(x, y);
        if (port) {
          const g = graph();
          let from, to, fromPort, toPort;
          if (NE.dragLink.fromNode) { from = NE.dragLink.fromNode; fromPort = NE.dragLink.fromPort; to = port.node; toPort = port.port; }
          else { from = port.node; fromPort = port.port; to = NE.dragLink.toNode; toPort = NE.dragLink.toPort; }
          if (from && to && from.id !== to.id && port.out !== (NE.dragLink.fromNode ? true : false)) {
            const ft = N.DEFS[from.type].outputs[fromPort].type;
            const tt = N.DEFS[to.type].inputs[toPort].type;
            if (ft === tt || ft === 'any' || tt === 'any' || (ft === 'mesh' && tt === 'geometry') || (ft === 'geometry' && tt === 'mesh')) {
              MODEL.Undo.begin('连接节点');
              g.links = g.links.filter(l => !(l.to === to.id && l.toPort === toPort));
              g.links.push({ id: MODEL.uid('lk'), from: from.id, fromPort, to: to.id, toPort });
              MODEL.Undo.end();
              UI.toast('已连接：' + N.DEFS[from.type].label + ' → ' + N.DEFS[to.type].label);
            } else UI.toast('端口类型不匹配：' + ft + ' → ' + tt);
          }
        }
        NE.dragLink = null; NE.draw(); UI.refresh(); return;
      }
      if (NE.dragNode) { if (NE.dragNode.nodes.some(o => o.n.x !== o.x || o.n.y !== o.y)) MODEL.Undo.push('移动节点'); NE.dragNode = null; }
      NE.panDrag = null; NE.marquee = null; NE.draw();
    });
    cv.addEventListener('dblclick', (e) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const n = hitNode(x, y);
      if (!n) return;
      const def = N.DEFS[n.type];
      const p = NE.nodePos(n);
      let py = p.y + HH * NE.zoom + 6 + Math.max(def.inputs.length, def.outputs.length) * PORT_H;
      for (const pd of def.params) {
        if (y >= py && y <= py + 16 * NE.zoom) {
          if (pd.type === 'layer') {
            const c = comp();
            const list = c.layers.filter(l => l.type === 'text' || l.type === 'shape' || l.type === 'solid' || l.type === 'field');
            const idx = list.findIndex(l => l.id === n.params[pd.key]);
            const s = list.map((l, i) => (i + 1) + '. ' + l.name).join('\n');
            const v = prompt('选择图层（输入序号）:\n' + s, idx >= 0 ? String(idx + 1) : '1');
            if (v) { const i = parseInt(v) - 1; if (list[i]) { MODEL.Undo.begin('节点参数'); n.params[pd.key] = list[i].id; MODEL.Undo.end(); NE.draw(); UI.refresh(); } }
          } else if (pd.type === 'select') {
            const v = prompt(pd.label + ' (' + pd.options.join(' / ') + ')', n.params[pd.key]);
            if (v !== null) { MODEL.Undo.begin('节点参数'); n.params[pd.key] = pd.options.includes(v) ? v : pd.options[0]; MODEL.Undo.end(); NE.draw(); UI.refresh(); }
          } else {
            const v = prompt(pd.label, n.params[pd.key]);
            if (v !== null) { MODEL.Undo.begin('节点参数'); n.params[pd.key] = pd.type === 'number' ? parseFloat(v) : v; MODEL.Undo.end(); NE.draw(); UI.refresh(); }
          }
          return;
        }
        py += 16 * NE.zoom;
      }
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      NE.zoom = U.clamp(NE.zoom * f, 0.4, 2.2);
      NE.draw();
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (document.querySelector('#right-tabs .tab.active')?.dataset.rtab !== 'nodes') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); NE.duplicate(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); NE.group(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { $('#node-del').click(); }
    });
  };

  NE.duplicate = function () {
    const c = comp(); if (!c) return;
    const g = c.nodes;
    MODEL.Undo.begin('复制节点');
    const map = {};
    const news = [];
    for (const n of g.nodes) {
      if (!NE.sel.includes(n.id)) continue;
      const copy = JSON.parse(JSON.stringify(n));
      copy.id = MODEL.uid('n');
      copy.x += 30; copy.y += 30;
      map[n.id] = copy.id;
      news.push(copy);
    }
    g.nodes.push(...news);
    for (const lk of g.links) {
      if (map[lk.from] && map[lk.to]) g.links.push({ id: MODEL.uid('lk'), from: map[lk.from], fromPort: lk.fromPort, to: map[lk.to], toPort: lk.toPort });
    }
    NE.sel = news.map(n => n.id);
    MODEL.Undo.end(); NE.draw(); UI.refresh();
  };
  NE.group = function () {
    const c = comp(); if (!c) return;
    const g = c.nodes;
    const selNodes = g.nodes.filter(n => NE.sel.includes(n.id));
    if (selNodes.length < 2) { UI.toast('请先选择两个以上节点'); return; }
    MODEL.Undo.begin('封装节点组');
    const inner = { nodes: JSON.parse(JSON.stringify(selNodes)), links: g.links.filter(l => NE.sel.includes(l.from) && NE.sel.includes(l.to)).map(l => JSON.parse(JSON.stringify(l))) };
    const minX = Math.min(...selNodes.map(n => n.x)), minY = Math.min(...selNodes.map(n => n.y));
    const groupNode = { id: MODEL.uid('ng'), type: 'group', x: minX, y: minY, params: {}, label: '节点组 ' + (g.groups.length + 1), group: inner };
    g.nodes = g.nodes.filter(n => !NE.sel.includes(n.id));
    g.links = g.links.filter(l => !NE.sel.includes(l.from) && !NE.sel.includes(l.to));
    g.nodes.push(groupNode);
    g.groups.push(groupNode.id);
    NE.sel = [groupNode.id];
    MODEL.Undo.end(); NE.draw(); UI.refresh();
    UI.toast('已封装 ' + selNodes.length + ' 个节点（可继续编辑内部参数）');
  };
  // 组求值
  const _origEval = NODES.evalNodeOutput;
  NODES.evalNodeOutput = function (comp, node, port, state, time, cache) {
    if (node.type === 'group' && node.group) {
      const sub = { nodes: node.group.nodes, links: node.group.links };
      const outNode = sub.nodes.find(n => n.type === 'output');
      if (!outNode) return null;
      const save = comp.nodes;
      comp.nodes = sub;
      let r = null;
      try { r = _origEval(comp, outNode, 0, state, time, cache); } catch (e) { }
      comp.nodes = save;
      return r;
    }
    return _origEval(comp, node, port, state, time, cache);
  };
  NODES.DEFS.group = { label: '节点组', cat: '组', color: '#7a5fd0', inputs: [], outputs: [{ name: '几何', type: 'geometry' }], params: [], eval: () => null };
  // 组绘制
  const _draw = NE.draw;
  NE.draw = function () { _draw(); const cv = $('#node-canvas'); const ctx = cv.getContext('2d'); const g = graph(); for (const n of g.nodes) { if (n.type !== 'group') continue; const p = NE.nodePos(n); ctx.fillStyle = 'rgba(122,95,208,0.12)'; ctx.strokeStyle = '#7a5fd0'; roundRect(ctx, p.x, p.y, p.w, p.h, 5); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#b9a6ff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('⬡ ' + n.group.nodes.length + ' 个内部节点', p.x + 8, p.y + HH + 14); } };

  global.UI_NODES = NE;
})(window);
