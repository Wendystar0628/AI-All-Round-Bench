// 节点视图：创建、连接、断开、分支、复制、封装节点组；端口按类型着色，连线含义与当前结果可悬停查看
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const App = MF.App, h = MF.h, W = MF.W, C = MF.Cmd;
  const NW = 156, HD = 20, RH = 16, PH = 15, FT = 17;
  const CAT = { 输入: '#3b6e8f', 数值: '#6b6b74', 路径: '#4f7a4a', 分布: '#7a6a3a', 网格: '#2f7d74', 实体: '#8a5a2c', 变形: '#8a3f5c', 场: '#a23a5a', 输出: '#b5501f', 组: '#5a4f8f' };

  const NV = (MF.NodeView = {
    view: { x: 30, y: 20, scale: 0.8 }, lay: new Map(), wires: [], focused: false, wire: null, selWire: null, marquee: null, fitted: false,
    init(panel) {
      NV.panel = panel; const body = panel._body; body.style.overflow = 'hidden'; NV.cv = h('canvas', { tabIndex: 0, style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', outline: 'none' } }); body.appendChild(NV.cv); NV.ctx = NV.cv.getContext('2d');
      NV.empty = h('div', { class: 'empty' }); body.appendChild(NV.empty);
      NV.crumb = h('span', { class: 'hint', style: { marginLeft: '4px' } });
      const tb = (ic, tip, fn) => { const b = h('button', { class: 'tbtn sm', onclick: (e) => fn(e, b) }, W.icon(ic)); W.tip(b, tip); return b; };
      const legend = h('span', { style: { display: 'flex', gap: '7px', marginRight: '6px', alignItems: 'center' } }, ['num', 'vec', 'color', 'geo', 'field'].map((t) => h('span', { style: { display: 'flex', alignItems: 'center', gap: '3px', color: '#a79f94', fontSize: '10px' } }, h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: MF.Nodes.typeColor(t) } }), MF.Nodes.typeName(t))));
      panel._head.append(NV.crumb, h('span', { class: 'sp' }), legend, tb('plus', '添加节点（双击空白处）', (e, b) => { const r = b.getBoundingClientRect(); NV.addMenu(r.left, r.bottom + 2, null); }), tb('group', '封装为节点组 (Ctrl+G)', () => NV.group()), tb('fit', '适合全部节点', () => NV.fit()));
      new ResizeObserver(() => NV.resize()).observe(body);
      const cv = NV.cv;
      cv.addEventListener('pointerdown', (e) => { NV.focused = true; NV.down(e); }); cv.addEventListener('pointermove', (e) => NV.hover(e)); cv.addEventListener('pointerleave', () => W.hideTip());
      cv.addEventListener('dblclick', (e) => NV.dbl(e)); cv.addEventListener('contextmenu', (e) => { e.preventDefault(); NV.context(e); });
      cv.addEventListener('wheel', (e) => { e.preventDefault(); const m = NV.pos(e); const f = Math.exp(-e.deltaY * 0.0015); const v = NV.view; const ns = MF.clamp(v.scale * f, 0.2, 2.5), k = ns / v.scale; v.x = m[0] - (m[0] - v.x) * k; v.y = m[1] - (m[1] - v.y) * k; v.scale = ns; NV.draw(); }, { passive: false });
      document.addEventListener('pointerdown', (e) => { if (!panel.contains(e.target)) NV.focused = false; }, true);
      App.on('project', (o) => { if (o && o.reset) { NV.fitted = false; } NV.draw(); }); App.on('time', () => NV.draw()); App.on('selection', () => NV.draw()); App.on('layout', () => NV.resize());
      NV.resize();
    },
    resize() { const r = NV.cv.parentNode.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; NV.w = Math.max(20, r.width); NV.h = Math.max(20, r.height); NV.cv.width = Math.round(NV.w * dpr); NV.cv.height = Math.round(NV.h * dpr); NV.dpr = dpr; if (!NV.fitted) NV.fit(); else NV.draw(); },
    pos(e) { const r = NV.cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; },
    s2g(m) { return [(m[0] - NV.view.x) / NV.view.scale, (m[1] - NV.view.y) / NV.view.scale]; },
    // 当前编辑的图（可进入节点组）
    cur() {
      const c = App.comp(); if (!c) return null; let ctx = MF.Nodes.top(c); const path = [];
      for (const id of App.nodeCtx) { const g = MF.Nodes.find(ctx, id); if (!g || g.type !== 'group') break; path.push(g); ctx = { comp: c, nodes: g.sub.nodes, outer: { ctx, node: g } }; }
      ctx.path = path; return ctx;
    },
    setNodes(ctx, nodes) { if (ctx.outer) ctx.outer.node.sub.nodes = nodes; else ctx.comp.nodes = nodes; },
    layout(n) {
      const N = MF.Nodes, ports = N.ports(n); const rows = Math.max(ports.ins.length, ports.outs.length);
      const L = { x: n.x, y: n.y, w: NW, ins: [], outs: [], params: [] };
      ports.ins.forEach((p, i) => L.ins.push(Object.assign({ px: n.x, py: n.y + HD + i * RH + RH / 2 }, p)));
      ports.outs.forEach((p, i) => L.outs.push(Object.assign({ px: n.x + NW, py: n.y + HD + i * RH + RH / 2 }, p)));
      ports.params.forEach((p, i) => L.params.push(Object.assign({ px: n.x, py: n.y + HD + rows * RH + i * PH + PH / 2 + 2 }, p)));
      L.h = HD + rows * RH + ports.params.length * PH + FT + (ports.params.length ? 3 : 0); return L;
    },
    fit() {
      const ctx = NV.cur(); if (!ctx || !ctx.nodes.length || !NV.w) { NV.draw(); return; } let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of ctx.nodes) { const L = NV.layout(n); x0 = Math.min(x0, L.x); y0 = Math.min(y0, L.y); x1 = Math.max(x1, L.x + L.w); y1 = Math.max(y1, L.y + L.h); }
      const s = MF.clamp(Math.min((NV.w - 30) / (x1 - x0), (NV.h - 24) / (y1 - y0)), 0.2, 1.1); NV.view.scale = s; NV.view.x = (NV.w - (x1 - x0) * s) / 2 - x0 * s; NV.view.y = (NV.h - (y1 - y0) * s) / 2 - y0 * s; NV.fitted = true; NV.draw();
    },
    reveal(id) { const c = App.comp(); const ctxN = MF.Nodes.ctxOf(c, id); if (!ctxN) return; const path = []; let o = ctxN.outer; while (o) { path.unshift(o.node.id); o = o.ctx.outer; } App.nodeCtx = path; const n = MF.Nodes.find(ctxN, id); const L = NV.layout(n); const s = NV.view.scale; if (L.x * s + NV.view.x < 0 || (L.x + L.w) * s + NV.view.x > NV.w || L.y * s + NV.view.y < 0 || (L.y + L.h) * s + NV.view.y > NV.h) { NV.view.x = NV.w / 2 - (L.x + L.w / 2) * s; NV.view.y = NV.h / 2 - (L.y + L.h / 2) * s; } NV.draw(); },
    draw() {
      const g = NV.ctx; if (!g || !NV.w) return; const dpr = NV.dpr || 1; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, NV.w, NV.h); g.fillStyle = '#131211'; g.fillRect(0, 0, NV.w, NV.h);
      const ctx = NV.cur(); NV.lay = new Map(); NV.wires = [];
      NV.empty.style.display = ctx && ctx.nodes.length ? 'none' : ''; if (!ctx) { NV.empty.innerHTML = '<b>节点视图</b>没有打开的合成'; NV.crumb.textContent = ''; return; }
      if (!ctx.nodes.length) NV.empty.innerHTML = '<b>还没有节点</b>双击空白处或点 ＋ 添加节点<br>新建“三维几何”图层会自动生成一条节点链';
      NV.crumb.innerHTML = ''; if (ctx.path.length) { const root = h('span', { class: 'chip', onclick: () => { App.nodeCtx = []; NV.fitted = false; NV.fit(); } }, '合成'); NV.crumb.appendChild(root); ctx.path.forEach((gn, i) => { NV.crumb.appendChild(document.createTextNode(' ▸ ')); NV.crumb.appendChild(h('span', { class: 'chip' + (i === ctx.path.length - 1 ? ' on' : ''), onclick: () => { App.nodeCtx = App.nodeCtx.slice(0, i + 1); NV.fitted = false; NV.fit(); } }, gn.name)); }); }
      const v = NV.view, N = MF.Nodes, t = App.time; g.save(); g.translate(v.x, v.y); g.scale(v.scale, v.scale);
      // 点阵背景
      const gs = 40; g.fillStyle = 'rgba(255,255,255,.045)'; const gx0 = Math.floor(-v.x / v.scale / gs) * gs, gy0 = Math.floor(-v.y / v.scale / gs) * gs; if (v.scale > 0.35) for (let x = gx0; x < gx0 + NV.w / v.scale + gs; x += gs) for (let y = gy0; y < gy0 + NV.h / v.scale + gs; y += gs) g.fillRect(x - 1, y - 1, 2, 2);
      for (const n of ctx.nodes) NV.lay.set(n.id, NV.layout(n));
      // 连线
      for (const n of ctx.nodes) { const L = NV.lay.get(n.id); for (const p of L.ins.concat(L.params)) { const l = n.in[p.key]; if (!l) continue; (Array.isArray(l) ? l : [l]).forEach((x, idx) => { const sL = NV.lay.get(x.n); if (!sL) return; const sp = sL.outs.find((o) => o.key === x.p); if (!sp) return; const w = { from: x.n, fp: x.p, to: n.id, tp: p.key, idx: Array.isArray(l) ? idx : undefined, x0: sp.px, y0: sp.py, x1: p.px, y1: p.py, type: sp.type, plabel: p.label, slabel: sp.label }; NV.wires.push(w); const sel = NV.selWire && NV.selWire.to === w.to && NV.selWire.tp === w.tp && NV.selWire.from === w.from && NV.selWire.fp === w.fp; NV.wirePath(g, w.x0, w.y0, w.x1, w.y1); g.strokeStyle = sel ? '#fff' : N.typeColor(sp.type); g.lineWidth = sel ? 3 : 2; g.globalAlpha = sel ? 1 : 0.85; g.stroke(); g.globalAlpha = 1; }); } }
      if (NV.wire) { const w = NV.wire; NV.wirePath(g, w.x0, w.y0, w.x1, w.y1); g.strokeStyle = w.ok === false ? '#ff5a5a' : N.typeColor(w.type); g.setLineDash([5, 4]); g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
      // 节点
      g.textBaseline = 'middle';
      for (const n of ctx.nodes) {
        const L = NV.lay.get(n.id), d = N.types[n.type]; const sel = App.sel.nodes.includes(n.id); const col = CAT[d.cat] || '#555';
        g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10; g.shadowOffsetY = 3; g.fillStyle = '#211f1d'; rr(g, L.x, L.y, L.w, L.h, 6); g.fill(); g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
        g.fillStyle = col; rr2(g, L.x, L.y, L.w, HD, 6); g.fill();
        g.strokeStyle = sel ? '#ffb347' : 'rgba(0,0,0,.8)'; g.lineWidth = sel ? 2 : 1; rr(g, L.x, L.y, L.w, L.h, 6); g.stroke();
        g.fillStyle = '#fff'; g.font = '600 11px ' + FONT; g.textAlign = 'left'; g.fillText(clip(g, n.name, L.w - 44), L.x + 8, L.y + HD / 2 + 0.5);
        g.fillStyle = 'rgba(255,255,255,.6)'; g.font = '9px ' + FONT; g.textAlign = 'right'; g.fillText(n.type === 'group' ? '组 ▸' : d.label === n.name ? d.cat : d.label, L.x + L.w - 7, L.y + HD / 2 + 0.5);
        g.font = '10.5px ' + FONT;
        for (const p of L.ins) { NV.port(g, p, !!n.in[p.key]); g.fillStyle = '#cfc8be'; g.textAlign = 'left'; g.fillText(p.label + (p.multi ? ' ⋯' : ''), p.px + 9, p.py); }
        for (const p of L.outs) { NV.port(g, p, true); g.fillStyle = '#cfc8be'; g.textAlign = 'right'; g.fillText(p.label, p.px - 9, p.py); }
        // 参数行（可被标量/向量/颜色连线驱动）
        let res = null; try { res = N.evalNode(ctx, n, t); } catch (e) { res = { _err: String(e) }; }
        for (const p of L.params) { const linked = !!n.in[p.key]; NV.port(g, p, linked, true); g.textAlign = 'left'; g.fillStyle = '#8f877d'; g.fillText(clip(g, p.label, 62), p.px + 8, p.py); g.textAlign = 'right'; const pr = n.p[p.param.key]; let val; try { val = linked ? null : MF.Eval.val(pr, t); } catch (e) { val = pr.v; } g.fillStyle = linked ? N.typeColor(p.type) : pr.x !== undefined && pr.xOn !== false ? '#ff8f8f' : pr.k ? '#f0c060' : '#ffb347'; g.font = '10px ' + MONO; let txt = linked ? '← 连线' : fmtV(val, p.param); if (p.param.type === 'color' && !linked && val) { g.fillStyle = MF.cssColor(val, 1); g.fillRect(L.x + L.w - 26, p.py - 5, 18, 10); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(L.x + L.w - 26.5, p.py - 5.5, 19, 11); } else g.fillText(clip(g, txt, 78), L.x + L.w - 7, p.py); g.font = '10.5px ' + FONT; }
        // 结果摘要
        const fy = L.y + L.h - FT / 2 - 1; g.fillStyle = 'rgba(0,0,0,.3)'; rr3(g, L.x + 1, L.y + L.h - FT, L.w - 2, FT - 1, 5); g.fill();
        let sum = ''; if (res && res._err) sum = '⚠ ' + res._err; else if (d.terminal) { const Lr = MF.Model.getLayer(ctx.comp, n.s.layer); sum = Lr ? '→ 图层 “' + Lr.name + '”' : '（图层已删除）'; } else { const o0 = L.outs[0]; sum = o0 && res ? N.G.describe(res[o0.key]).replace(/^(路径|平面网格|实体|点集|场|数值|向量|颜色) · ?/, (m) => m) : ''; }
        g.font = '9.5px ' + FONT; g.textAlign = 'left'; g.fillStyle = res && res._err ? '#ff8f8f' : '#8f877d'; g.fillText(clip(g, sum, L.w - 12), L.x + 7, fy);
      }
      if (NV.marquee) { const m = NV.marquee; g.fillStyle = 'rgba(88,199,224,.12)'; g.strokeStyle = '#58c7e0'; g.setLineDash([4, 3]); g.lineWidth = 1 / v.scale; g.fillRect(m[0], m[1], m[2] - m[0], m[3] - m[1]); g.strokeRect(m[0], m[1], m[2] - m[0], m[3] - m[1]); g.setLineDash([]); }
      g.restore();
    },
    wirePath(g, x0, y0, x1, y1) { const dx = Math.max(30, Math.abs(x1 - x0) * 0.5); g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + dx, y0, x1 - dx, y1, x1, y1); },
    port(g, p, filled, small) { const r = small ? 3.2 : 4.6; g.beginPath(); g.arc(p.px, p.py, r, 0, 6.2832); g.fillStyle = filled ? MF.Nodes.typeColor(p.type) : '#131211'; g.fill(); g.strokeStyle = MF.Nodes.typeColor(p.type); g.lineWidth = 1.5; g.stroke(); },
    // ---------- 命中 ----------
    hitPort(gp) { let best = null, bd = 9; for (const [id, L] of NV.lay) { for (const kind of ['ins', 'params', 'outs']) for (const p of L[kind]) { const d = Math.hypot(p.px - gp[0], p.py - gp[1]); if (d < bd) { bd = d; best = { node: id, port: p, out: kind === 'outs' }; } } } return best; },
    hitNode(gp) { const ctx = NV.cur(); if (!ctx) return null; for (let i = ctx.nodes.length - 1; i >= 0; i--) { const L = NV.lay.get(ctx.nodes[i].id); if (L && gp[0] >= L.x && gp[0] <= L.x + L.w && gp[1] >= L.y && gp[1] <= L.y + L.h) return ctx.nodes[i]; } return null; },
    hitWire(gp) { let best = null, bd = 6; for (const w of NV.wires) { const dx = Math.max(30, Math.abs(w.x1 - w.x0) * 0.5); for (let i = 0; i <= 24; i++) { const s = i / 24; const x = MF.bez.pt(w.x0, w.x0 + dx, w.x1 - dx, w.x1, s), y = MF.bez.pt(w.y0, w.y0, w.y1, w.y1, s); const d = Math.hypot(x - gp[0], y - gp[1]); if (d < bd) { bd = d; best = w; } } } return best; },
    hover(e) {
      if (NV._drag) return; const m = NV.pos(e), gp = NV.s2g(m); const ctx = NV.cur(); if (!ctx) return; const N = MF.Nodes; const hp = NV.hitPort(gp);
      if (hp) { const n = N.find(ctx, hp.node); const p = hp.port; let cur = ''; try { if (hp.out) cur = N.G.describe(N.out(ctx, n, p.key, App.time)); else { const l = n.in[p.key]; if (l) { const srcs = (Array.isArray(l) ? l : [l]).map((x) => { const s = N.find(ctx, x.n); return (s ? s.name : '?') + ' · ' + N.G.describe(N.linkVal(ctx, x, App.time)); }); cur = '来自 ' + srcs.join('\n来自 '); } else cur = p.param ? '未连接（使用参数值，可被' + N.typeName(p.type) + '连线驱动）' : '未连接'; } } catch (er) { cur = String(er); }
        W.showTip(null, '<b>' + (hp.out ? '输出' : '输入') + ' · ' + p.label + '</b>　类型：' + N.typeName(p.type) + (p.multi ? '（可接多条）' : '') + '\n' + cur, e.clientX, e.clientY); NV.cv.style.cursor = 'crosshair'; return; }
      const w = NV.hitWire(gp);
      if (w) { const a = N.find(ctx, w.from), b = N.find(ctx, w.to); let val = ''; try { val = N.G.describe(N.out(ctx, a, w.fp, App.time)); } catch (er) { val = ''; } W.showTip(null, '<b>' + N.typeName(w.type) + '连线</b>\n' + a.name + ' · ' + w.slabel + '  →  ' + b.name + ' · ' + w.plabel + '\n传递：' + val + '\n（Alt+单击 断开；单击选中后按 Delete）', e.clientX, e.clientY); NV.cv.style.cursor = 'pointer'; return; }
      W.hideTip(); NV.cv.style.cursor = NV.hitNode(gp) ? 'move' : 'default';
    },
    // ---------- 交互 ----------
    down(e) {
      const ctx = NV.cur(); if (!ctx) return; const m = NV.pos(e), gp = NV.s2g(m); const N = MF.Nodes; W.hideTip(); NV.cv.focus();
      const dragWith = (mv, end) => { NV._drag = true; W.drag(e, (ev) => mv(NV.pos(ev), ev), (ev) => { NV._drag = false; if (end) end(NV.pos(ev), ev); NV.draw(); }); };
      if (e.button === 1 || (e.button === 0 && MF.Viewport.space)) { const v0 = Object.assign({}, NV.view); dragWith((p) => { NV.view.x = v0.x + p[0] - m[0]; NV.view.y = v0.y + p[1] - m[1]; NV.draw(); }); return; }
      if (e.button === 2) return;
      const hp = NV.hitPort(gp);
      if (hp) {
        // 从输出拖出；或从已连接的输入“拔下”连线
        let from = null; const n = N.find(ctx, hp.node);
        if (hp.out) from = { node: hp.node, port: hp.port };
        else { const l = n.in[hp.port.key]; const link = Array.isArray(l) ? l[l.length - 1] : l; if (link) { const sL = NV.lay.get(link.n); const sp = sL && sL.outs.find((o) => o.key === link.p); if (sp) { from = { node: link.n, port: sp, detach: { node: n, key: hp.port.key, index: Array.isArray(l) ? l.length - 1 : undefined, link } }; } } else from = { reverse: true, node: hp.node, port: hp.port }; }
        if (!from) return;
        NV.wire = { x0: from.port.px, y0: from.port.py, x1: gp[0], y1: gp[1], type: from.port.type };
        let detached = false;
        dragWith((p) => { const q = NV.s2g(p); if (from.detach && !detached && Math.hypot(q[0] - gp[0], q[1] - gp[1]) > 6) { detached = true; App.beginDrag('改接连线'); N.disconnect(from.detach.node, from.detach.key, from.detach.index); App.changed(); }
          const tgt = NV.hitPort(q); NV.wire.ok = undefined;
          if (from.reverse) { NV.wire.x0 = q[0]; NV.wire.y0 = q[1]; NV.wire.x1 = from.port.px; NV.wire.y1 = from.port.py; if (tgt && tgt.out) { NV.wire.x0 = tgt.port.px; NV.wire.y0 = tgt.port.py; NV.wire.ok = N.compatible(tgt.port.type, from.port.type) && tgt.node !== from.node; NV.wire.type = tgt.port.type; } }
          else { NV.wire.x1 = q[0]; NV.wire.y1 = q[1]; if (tgt && !tgt.out) { NV.wire.x1 = tgt.port.px; NV.wire.y1 = tgt.port.py; NV.wire.ok = N.compatible(from.port.type, tgt.port.type) && tgt.node !== from.node; } }
          NV.draw(); },
        (p) => { const q = NV.s2g(p); const tgt = NV.hitPort(q); NV.wire = null; let err = null, did = false;
          const conn = (a, ap, b, bp) => { err = N.connect(ctx, a, ap, b, bp); did = !err; };
          if (from.reverse) { if (tgt && tgt.out) { if (!detached && !App._drag) App.beginDrag('连接节点'); conn(tgt.node, tgt.port.key, from.node, from.port.key); } }
          else if (tgt && !tgt.out) { if (!App._drag) App.beginDrag('连接节点'); conn(from.node, from.port.key, tgt.node, tgt.port.key); }
          if (err) App.toast('无法连接：' + err, 'err');
          if (App._drag) { App._drag.label = did ? '连接节点' : '断开连线'; App.endDrag(); } });
        return;
      }
      const n = NV.hitNode(gp);
      if (n) {
        NV.selWire = null; let ids = App.sel.nodes.slice();
        if (e.shiftKey || e.ctrlKey) { const i = ids.indexOf(n.id); if (i >= 0) ids.splice(i, 1); else ids.push(n.id); App.selectNodes(ids); } else if (!ids.includes(n.id)) { ids = [n.id]; App.selectNodes(ids); }
        // 选中终端节点时同步选中它绑定的图层
        const d = N.types[n.type]; if (d.terminal && n.s.layer && !e.shiftKey) { if (!App.sel.layers.includes(n.s.layer)) { App.sel.layers = [n.s.layer]; App.emit('selection'); } }
        const sel = ctx.nodes.filter((x) => App.sel.nodes.includes(x.id)); const o = sel.map((x) => [x.x, x.y]); let started = false;
        dragWith((p) => { if (!started) { if (Math.hypot(p[0] - m[0], p[1] - m[1]) < 3) return; started = true; App.beginDrag('移动节点'); } const dx = (p[0] - m[0]) / NV.view.scale, dy = (p[1] - m[1]) / NV.view.scale; sel.forEach((x, i) => { x.x = Math.round(o[i][0] + dx); x.y = Math.round(o[i][1] + dy); }); NV.draw(); }, () => { if (started) App.endDrag({ audio: false }); });
        return;
      }
      const w = NV.hitWire(gp);
      if (w) { if (e.altKey) { const tn = N.find(ctx, w.to); App.edit('断开连线', () => N.disconnect(tn, w.tp, w.idx)); NV.selWire = null; } else { NV.selWire = w; NV.draw(); } return; }
      NV.selWire = null; if (!e.shiftKey) App.selectNodes([]);
      NV.marquee = [gp[0], gp[1], gp[0], gp[1]];
      dragWith((p) => { const q = NV.s2g(p); NV.marquee[2] = q[0]; NV.marquee[3] = q[1]; NV.draw(); }, () => { const q = NV.marquee; NV.marquee = null; const x0 = Math.min(q[0], q[2]), x1 = Math.max(q[0], q[2]), y0 = Math.min(q[1], q[3]), y1 = Math.max(q[1], q[3]); if (x1 - x0 > 4 || y1 - y0 > 4) { const ids = []; for (const [id, L] of NV.lay) if (L.x + L.w >= x0 && L.x <= x1 && L.y + L.h >= y0 && L.y <= y1) ids.push(id); App.selectNodes(ids); } });
    },
    dbl(e) { const ctx = NV.cur(); if (!ctx) return; const gp = NV.s2g(NV.pos(e)); const n = NV.hitNode(gp); if (n && n.type === 'group') { App.nodeCtx = App.nodeCtx.concat([n.id]); App.selectNodes([]); NV.fitted = false; NV.fit(); return; } if (!n) NV.addMenu(e.clientX, e.clientY, gp); },
    addMenu(x, y, gp) {
      const ctx = NV.cur(); if (!ctx) { App.toast('请先新建合成'); return; } const N = MF.Nodes; const items = []; const cats = {};
      for (const k of Object.keys(N.types)) { const d = N.types[k]; if (d.terminal) continue; if (d.inner && !ctx.outer) continue; if (k === 'group') continue; (cats[d.cat] = cats[d.cat] || []).push(k); }
      for (const cat of Object.keys(cats)) { items.push({ hd: cat }); for (const k of cats[cat]) items.push({ label: N.types[k].label, run: () => NV.add(k, gp) }); }
      W.menu(x, y, items);
    },
    add(type, gp) {
      const ctx = NV.cur(); if (!ctx) return; if (!gp) gp = NV.s2g([NV.w / 2 - 60, NV.h / 2 - 40]); let n;
      App.edit('添加节点 ' + MF.Nodes.types[type].label, () => { const c = ctx.comp; const o = { x: Math.round(gp[0]), y: Math.round(gp[1]) }; n = MF.Nodes.create(App.project, type, o);
        // 合理的默认值：场的中心取合成中心；图层引用取所选图层
        if (n.p.center && n.type !== 'rectN' && n.type !== 'ellipseN' && MF.Nodes.types[type].isField) n.p.center.v = [c.w / 2, c.h / 2, 0];
        const selL = App.selLayers()[0]; const d = MF.Nodes.types[type]; for (const s of d.statics) if (s.kind === 'layer' && s.options && selL && s.options.includes(selL.type)) n.s[s.key] = selL.id;
        let nm = n.name, i = 2; const all = []; MF.Nodes.eachNode(c.nodes, (x) => all.push(x.name)); while (all.includes(nm)) nm = n.name + ' ' + i++; n.name = nm; ctx.nodes.push(n); });
      App.selectNodes([n.id]); return n;
    },
    del() {
      const ctx = NV.cur(); if (!ctx) return false; const N = MF.Nodes;
      if (NV.selWire) { const w = NV.selWire; const tn = N.find(ctx, w.to); if (tn) App.edit('断开连线', () => N.disconnect(tn, w.tp, w.idx)); NV.selWire = null; return true; }
      const ids = App.sel.nodes.filter((id) => N.find(ctx, id)); if (!ids.length) return false; const term = ids.filter((id) => N.types[N.find(ctx, id).type].terminal);
      if (term.length) App.toast('“显示/粒子”节点与图层绑定，删除图层时会一并移除');
      const rm = ids.filter((id) => !term.includes(id)); if (!rm.length) return true;
      App.edit('删除节点', () => { for (const id of rm) N.removeNode(ctx, id); }); App.selectNodes([]); return true;
    },
    copy() { const ctx = NV.cur(); if (!ctx) return; const ns = ctx.nodes.filter((n) => App.sel.nodes.includes(n.id) && !MF.Nodes.types[n.type].terminal); if (!ns.length) return; C.clipboard = { kind: 'nodes', nodes: MF.clone(ns) }; App.toast('已复制 ' + ns.length + ' 个节点'); },
    paste(offset) { const ctx = NV.cur(); const cb = C.clipboard; if (!ctx || !cb || cb.kind !== 'nodes') return; let made; App.edit('粘贴节点', () => { made = MF.Nodes.cloneNodes(App.project, cb.nodes, true); for (const n of made) { n.x += offset === undefined ? 30 : offset; n.y += offset === undefined ? 30 : offset; ctx.nodes.push(n); }
      // 外部连线若在当前图中不存在则丢弃
      for (const n of made) for (const k of Object.keys(n.in)) { const l = n.in[k]; const ok = (x) => !!MF.Nodes.find(ctx, x.n); if (Array.isArray(l)) { n.in[k] = l.filter(ok); if (!n.in[k].length) delete n.in[k]; } else if (!ok(l)) delete n.in[k]; } }); App.selectNodes(made.map((n) => n.id)); },
    duplicate() { const keep = C.clipboard; NV.copy(); if (C.clipboard && C.clipboard.kind === 'nodes') NV.paste(40); C.clipboard = keep; },
    selectAll() { const ctx = NV.cur(); if (ctx) App.selectNodes(ctx.nodes.map((n) => n.id)); },
    group() { const ctx = NV.cur(); if (!ctx) return; const ids = App.sel.nodes.filter((id) => MF.Nodes.find(ctx, id)); if (!ids.length) { App.toast('请先选择要封装的节点'); return; } let res; App.edit('封装节点组', () => { res = MF.Nodes.makeGroup(App.project, ctx, ids); if (res) NV.setNodes(ctx, res.nodes); }); if (res) { App.selectNodes([res.group.id]); App.toast('已封装为节点组（双击进入）'); } },
    ungroup() { const ctx = NV.cur(); if (!ctx) return; const g = ctx.nodes.find((n) => App.sel.nodes.includes(n.id) && n.type === 'group'); if (!g) { App.toast('请先选择一个节点组'); return; } const inner = g.sub.nodes.filter((s) => s.type !== 'groupIn' && s.type !== 'groupOut').map((s) => s.id); App.edit('解散节点组', () => NV.setNodes(ctx, MF.Nodes.ungroup(ctx, g))); App.selectNodes(inner); },
    context(e) {
      const ctx = NV.cur(); if (!ctx) return; const gp = NV.s2g(NV.pos(e)); const n = NV.hitNode(gp); const N = MF.Nodes;
      if (n) { if (!App.sel.nodes.includes(n.id)) App.selectNodes([n.id]); const term = N.types[n.type].terminal;
        W.menu(e.clientX, e.clientY, [{ hd: n.name }, { label: '重复', key: 'Ctrl+D', dis: term, run: () => NV.duplicate() }, { label: '复制', key: 'Ctrl+C', dis: term, run: () => NV.copy() }, { label: '删除', key: 'Delete', dis: term, run: () => NV.del() }, '-', { label: '断开全部输入', run: () => App.edit('断开全部输入', () => { n.in = {}; }) }, { label: '封装为节点组', key: 'Ctrl+G', run: () => NV.group() }, n.type === 'group' ? { label: '进入节点组', run: () => { App.nodeCtx = App.nodeCtx.concat([n.id]); NV.fitted = false; NV.fit(); } } : null, n.type === 'group' ? { label: '解散节点组', key: 'Ctrl+Shift+G', run: () => NV.ungroup() } : null,
          n.type === 'pins' ? { label: '用图钉工具放置图钉', run: () => MF.Tools.setTool('pin') } : null]); return; }
      const w = NV.hitWire(gp); if (w) { W.menu(e.clientX, e.clientY, [{ label: '断开这条连线', run: () => App.edit('断开连线', () => N.disconnect(N.find(ctx, w.to), w.tp, w.idx)) }]); return; }
      const items = [{ label: '粘贴', key: 'Ctrl+V', dis: !(C.clipboard && C.clipboard.kind === 'nodes'), run: () => NV.paste() }, { label: '适合全部', run: () => NV.fit() }];
      if (ctx.outer) items.push({ label: '返回上一级', run: () => { App.nodeCtx = App.nodeCtx.slice(0, -1); NV.fitted = false; NV.fit(); } });
      W.menu(e.clientX, e.clientY, items.concat(['-', { label: '添加节点…', run: () => NV.addMenu(e.clientX, e.clientY, gp) }]));
    },
  });
  const FONT = '"PingFang SC","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif', MONO = '"JetBrains Mono","Cascadia Mono",Consolas,monospace';
  function fmtV(v, meta) { if (v === null || v === undefined) return ''; if (typeof v === 'number') return MF.W.fmtNum(v, meta) + (meta.unit && meta.unit.length <= 2 ? meta.unit : ''); if (Array.isArray(v)) return v.slice(0, 3).map((x) => MF.fmt(x, Math.abs(x) >= 100 ? 0 : 1)).join(', '); return ''; }
  function clip(g, s, w) { s = String(s); if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
  function rr(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function rr2(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.lineTo(x + w, y + hh); g.lineTo(x, y + hh); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function rr3(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.closePath(); }
})();
