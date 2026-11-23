/* 节点编辑器：创建 / 连接 / 断开 / 移动 / 复制 / 删除节点，端口按类型着色，显示当前结果摘要，参数可转为关键帧。 */
(function () {
  'use strict';
  const AE = (window.AE = window.AE || {});
  const UI = AE.UI;
  const U = AE.U;
  const Model = AE.Model;
  const Anim = AE.Anim;
  const App = AE.App;
  const G = AE.Graph;
  const E = UI.el;
  const ND = (UI.nodes = {});

  let root, bar, canvasEl, svgEl, paramsEl, dragLink = null, nodeDrag = null, selNode = null;
  const NODE_W = 170;
  const HEAD_H = 24;
  const PORT_H = 18;

  function currentGraph() {
    const gid = App.state.selectedGraph || (App.project.graphs[0] && App.project.graphs[0].id);
    return G.findGraph(App.project, gid) || null;
  }
  function geoLayerContext() {
    const L = App.selectedLayer();
    return L && (L.type === 'geo' || L.type === 'particles') ? L : null;
  }

  // 结果摘要（当前时间）
  function summary(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v.toFixed(2);
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] === 'number') return '[' + v.map((x) => x.toFixed(1)).join(', ') + ']';
      if (v.length && v[0] && v[0].rx !== undefined) return '图钉 ' + v.length;
      if (v.length && v[0] && v[0].p) return '采样点 ' + v.length;
      return '列表 ' + v.length;
    }
    if (typeof v === 'function') return '场';
    if (v.kind === 'contours') {
      const n = v.contours.reduce((s, c) => s + c.pts.length, 0);
      return '轮廓 ' + v.contours.length + ' · 点 ' + n;
    }
    if (v.kind === 'mesh') return '网格 ' + Math.round(v.pos.length / 9) + ' 三角形';
    return '…';
  }
  function portType(node, port, dir) {
    const list = dir === 'in' ? G.nodeInputs(node) : G.nodeOutputs(node);
    const p = list.find((x) => x.name === port);
    return p ? p.type : 'scalar';
  }
  function typeColor(t) {
    return G.TYPE_COLOR[t] || '#aaa';
  }

  // 节点图渲染
  function render() {
    if (!canvasEl) return;
    const gr = currentGraph();
    UI.clear(canvasEl);
    svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('class', 'wires');
    canvasEl.appendChild(svgEl);
    if (!gr) {
      canvasEl.appendChild(E('div', { class: 'empty', style: { padding: '30px' } }, [E('div', { class: 'big', text: '还没有节点图' }), E('div', { class: 'muted', text: '点击上方“新建节点图”开始，或选中几何 / 粒子图层后使用。' })]));
      return;
    }
    const ctx = { project: App.project, comp: App.comp(), layer: geoLayerContext(), salt: '' };
    const t = App.state.time;
    // 节点
    gr.nodes.forEach((node) => {
      const def = G.typeInfo(node.type);
      const ins = G.nodeInputs(node), outs = G.nodeOutputs(node);
      const h = HEAD_H + Math.max(ins.length, outs.length, 1) * PORT_H + 26;
      const el = E('div', { class: 'node' + (selNode === node.id ? ' sel' : ''), style: { left: node.x + 'px', top: node.y + 'px', width: NODE_W + 'px', minHeight: h + 'px' }, data: { id: node.id } });
      el.append(E('div', { class: 'nhead', style: { background: nodeHue(def.cat) }, text: def.label || node.type }));
      const body = E('div', { class: 'nbody' });
      const rows = Math.max(ins.length, outs.length);
      for (let i = 0; i < rows; i++) {
        const inp = ins[i], out = outs[i];
        const r = E('div', { class: 'nrow' });
        if (inp) {
          const port = E('span', { class: 'port in', title: inp.name + ' · ' + (G.TYPE_LABEL[inp.type] || inp.type), style: { background: typeColor(inp.type) }, data: { node: node.id, port: inp.name, dir: 'in', type: inp.type } });
          port.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (node.ins[inp.name]) {
              // 从输入端拖出：断开现有连线
              const from = node.ins[inp.name];
              App.mutate('断开连线', () => G.disconnect(currentGraph(), node.id, inp.name));
              startLink(e, { node: from.node, port: from.port, type: portType(G.findNode(gr, from.node), from.port, 'out') });
            } else startLinkFromIn(e, node.id, inp.name, inp.type);
          });
          r.append(port, E('span', { class: 'pname', text: inp.name }));
        } else r.append(E('span', { class: 'pname dim', text: '' }));
        if (out) {
          r.append(E('span', { class: 'grow' }));
          r.append(E('span', { class: 'pname', text: out.name }));
          const port = E('span', { class: 'port out', title: out.name + ' · ' + (G.TYPE_LABEL[out.type] || out.type), style: { background: typeColor(out.type) }, data: { node: node.id, port: out.name, dir: 'out', type: out.type } });
          port.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            startLink(e, { node: node.id, port: out.name, type: out.type });
          });
          r.append(port);
        }
        body.append(r);
      }
      // 结果摘要
      let resultText = '';
      try {
        const outv = G.output(ctx, gr, node.id, t, undefined);
        resultText = outs.length ? summary(outv) : '';
      } catch (e) {
        resultText = '错误：' + e.message;
      }
      body.append(E('div', { class: 'nres', text: resultText }));
      el.append(body);
      el.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('port')) return;
        selNode = node.id;
        nodeDrag = { id: node.id, sx: e.clientX, sy: e.clientY, x0: node.x, y0: node.y, moved: false };
        const move = (ev) => {
          if (!nodeDrag) return;
          const n = G.findNode(currentGraph(), nodeDrag.id);
          if (!n) return;
          n.x = nodeDrag.x0 + (ev.clientX - nodeDrag.sx);
          n.y = nodeDrag.y0 + (ev.clientY - nodeDrag.sy);
          nodeDrag.moved = true;
          drawWires();
          el.style.left = n.x + 'px';
          el.style.top = n.y + 'px';
        };
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
          if (nodeDrag && nodeDrag.moved) App.mutate('移动节点', () => {});
          nodeDrag = null;
          renderParams();
          render();
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
      canvasEl.appendChild(el);
    });
    drawWires();
    renderParams();
  }

  function nodeHue(cat) {
    const m = { 几何源: '#2f5f48', 几何: '#2e5a4f', 变形: '#5a3a6e', 场: '#6b3350', 发射: '#6b5a2e', 数据: '#3c4a6e', 组: '#4a4a4a' };
    return m[cat] || '#3a3a44';
  }

  // 连线：SVG 贝塞尔
  function portCenter(nodeId, port, dir) {
    const el = canvasEl.querySelector('.port[data-node="' + nodeId + '"][data-port="' + port + '"][data-dir="' + dir + '"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const c = canvasEl.getBoundingClientRect();
    return [r.left - c.left + r.width / 2 + canvasEl.scrollLeft, r.top - c.top + r.height / 2 + canvasEl.scrollTop];
  }
  function drawWires() {
    if (!svgEl) return;
    UI.clear(svgEl);
    const gr = currentGraph();
    if (!gr) return;
    gr.nodes.forEach((n) => {
      Object.keys(n.ins).forEach((pn) => {
        const link = n.ins[pn];
        const a = portCenter(link.node, link.port, 'out');
        const b = portCenter(n.id, pn, 'in');
        if (!a || !b) return;
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
        p.setAttribute('d', 'M' + a[0] + ',' + a[1] + ' C' + (a[0] + dx) + ',' + a[1] + ' ' + (b[0] - dx) + ',' + b[1] + ' ' + b[0] + ',' + b[1]);
        p.setAttribute('stroke', typeColor(portType(G.findNode(gr, link.node), link.port, 'out')));
        p.setAttribute('stroke-width', '2');
        p.setAttribute('fill', 'none');
        p.setAttribute('class', 'wire');
        p.addEventListener('dblclick', () => App.mutate('断开连线', () => G.disconnect(currentGraph(), n.id, pn)));
        svgEl.appendChild(p);
      });
    });
    if (dragLink) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M' + dragLink.a[0] + ',' + dragLink.a[1] + ' L' + dragLink.b[0] + ',' + dragLink.b[1]);
      p.setAttribute('stroke', '#fff');
      p.setAttribute('stroke-dasharray', '4 3');
      p.setAttribute('fill', 'none');
      svgEl.appendChild(p);
    }
  }

  // 连线：从输出端开始
  function startLink(e, from) {
    const c = canvasEl.getBoundingClientRect();
    const a = portCenter(from.node, from.port, 'out');
    if (!a) return;
    dragLink = { from, a, b: a, mode: 'out' };
    trackLink(e);
  }
  // 连线：从输入端开始（反向）
  function startLinkFromIn(e, nodeId, port, type) {
    const b = portCenter(nodeId, port, 'in');
    dragLink = { from: { node: nodeId, port, type, dir: 'in' }, a: b, b, mode: 'in' };
    trackLink(e);
  }
  function trackLink(e0) {
    const move = (ev) => {
      if (!dragLink) return;
      const c = canvasEl.getBoundingClientRect();
      const pt = [ev.clientX - c.left + canvasEl.scrollLeft, ev.clientY - c.top + canvasEl.scrollTop];
      if (dragLink.mode === 'out') dragLink.b = pt;
      else dragLink.b = pt;
      drawWires();
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const port = target && target.closest ? target.closest('.port') : null;
      const dl = dragLink;
      dragLink = null;
      if (port && dl) {
        const dir = port.dataset.dir;
        const tnode = port.dataset.node, tport = port.dataset.port, ttype = port.dataset.type;
        if (dl.mode === 'out' && dir === 'in') connectChecked(tnode, tport, ttype, dl.from);
        else if (dl.mode === 'in' && dir === 'out') connectChecked(dl.from.node, dl.from.port, dl.from.type, { node: tnode, port: tport, type: ttype, dir: 'out' }, true);
      }
      drawWires();
      render();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    void e0;
  }
  // 连接：inNode.inPort <- outNode.outPort
  function connectChecked(inNode, inPort, inType, from, reversed) {
    const gr = currentGraph();
    const toNode = G.findNode(gr, inNode);
    if (!toNode) return;
    const outNode = G.findNode(gr, from.node);
    if (!outNode) return;
    if (reversed) {
      // 从输入端拖出到输出端（参数顺序已是 (输入节点, 输入端口)，来源为输出）
    }
    const outT = portType(outNode, from.port, 'out');
    const inT = portType(toNode, inPort, 'in');
    if (outT !== inT && !(outT === 'geometry' && inT === 'geometry')) {
      return App.toast('类型不匹配：' + (G.TYPE_LABEL[outT] || outT) + ' → ' + (G.TYPE_LABEL[inT] || inT));
    }
    if (inNode === from.node) return App.toast('不能连接到自身');
    App.mutate('连线', () => G.connect(currentGraph(), inNode, inPort, from.node, from.port));
  }

  // 参数编辑
  function renderParams() {
    if (!paramsEl) return;
    UI.clear(paramsEl);
    const gr = currentGraph();
    const node = gr && selNode ? G.findNode(gr, selNode) : null;
    if (!node) {
      paramsEl.append(E('div', { class: 'muted', text: '选择一个节点以编辑参数。' }));
      return;
    }
    const def = G.typeInfo(node.type);
    paramsEl.append(E('div', { class: 'expr-title', text: def.label + ' · ' + def.cat }));
    const lay = geoLayerContext();
    (def.params || []).forEach((pd) => {
      const cur = node.params[pd.name];
      const isProp = cur && typeof cur === 'object' && cur.kind && cur.id;
      const val = isProp ? Anim.value(App.comp(), lay || null, cur, App.state.time) : cur;
      let input;
      if (pd.kind === 'text') {
        input = UI.textInput(val, (v) => App.mutate('节点参数', () => (G.findNode(currentGraph(), node.id).params[pd.name] = v)));
      } else if (pd.kind === 'enum') {
        const opts = (pd.options || [pd.def]).map((o) => [o, o]);
        input = UI.select(opts, val, (v) => App.mutate('节点参数', () => (G.findNode(currentGraph(), node.id).params[pd.name] = v)));
      } else {
        input = UI.num({
          value: typeof val === 'number' ? val : Number(val) || 0,
          decimals: 2,
          step: Math.abs(val) > 20 ? 1 : 0.01,
          onSet: (v) => {
            const n = G.findNode(currentGraph(), node.id);
            if (isProp) UI.writeProp({ id: lay ? lay.id : '' }, cur, v, pd.label);
            else App.mutate('节点参数', () => (n.params[pd.name] = v));
          },
        });
      }
      const key = E('button', {
        class: 'kbtn diamond' + (isProp && cur.animated ? ' on' : ''),
        title: '关键帧化：在当前时间记录关键帧（几何图层时间）',
        onclick: () => {
          App.mutate('参数关键帧', () => {
            const n = G.findNode(currentGraph(), node.id);
            const lt = App.state.time - ((lay && lay.startTime) || 0);
            let p = n.params[pd.name];
            if (!(p && typeof p === 'object' && p.kind)) p = n.params[pd.name] = Model.num(Number(p) || 0);
            if (!p.animated) Anim.enable(p, lt, Anim.keyValue(p, lt));
            else Anim.setKey(p, lt, Anim.keyValue(p, lt));
          });
        },
      }, UI.ICON.key);
      paramsEl.append(E('div', { class: 'frow' }, [E('span', { class: 'flabel', text: pd.label }), input, key]));
    });
    // 操作
    const set = E('button', { class: 'btn small primary', onclick: () => {
      const l = geoLayerContext();
      if (!l || l.type !== 'geo') return App.toast('请先选择一个几何图层');
      App.mutate('设为几何来源', () => (App.layer(l.id).geo.source = { graph: currentGraph().id, node: node.id }));
    } }, '设为所选几何图层的输出');
    const dup = E('button', { class: 'btn small', onclick: () => App.mutate('复制节点', () => G.duplicateNode(currentGraph(), node.id)) }, '复制');
    const del = E('button', { class: 'btn small danger', onclick: () => App.mutate('删除节点', () => { G.removeNode(currentGraph(), node.id); selNode = null; }) }, '删除');
    paramsEl.append(E('div', { class: 'inline' }, [set, dup, del]));
    if (node.type === 'group') paramsEl.append(E('div', { class: 'muted small', text: '组节点：内部节点图已封装。' }));
  }

  // 添加节点（按类别菜单）
  function addNodeMenu() {
    const types = Object.values(G.types).filter((d) => d.name !== 'group');
    const sel = E('select', { class: 'sel' }, [E('option', { value: '' }, '添加节点…')].concat(types.map((d) => E('option', { value: d.name }, d.cat + ' · ' + d.label))));
    sel.addEventListener('change', () => {
      const type = sel.value;
      if (!type) return;
      const gr = currentGraph();
      if (!gr) return App.toast('请先新建节点图');
      App.mutate('添加节点', () => {
        const n = G.newNode(currentGraph(), type, 40 + Math.random() * 60, 40 + Math.random() * 40);
        selNode = n.id;
      });
      sel.value = '';
    });
    return sel;
  }
  // 封装组：以所选节点为输出，把它的全部上游节点收进一个组节点（内部图独立保存）；
  // 外部连入的输入成为组的输入端口，依赖所选节点的外部连线改接到组的输出端口。
  function encapsulate() {
    const gr = currentGraph();
    if (!gr || !selNode) return App.toast('先选择一个作为输出的节点');
    const outId = selNode;
    App.mutate('封装组', () => {
      const g = currentGraph();
      const set = new Set();
      const stack = [outId];
      while (stack.length) {
        const id = stack.pop();
        if (set.has(id)) continue;
        set.add(id);
        const n = G.findNode(g, id);
        if (n) Object.values(n.ins).forEach((l) => stack.push(l.node));
      }
      const inside = g.nodes.filter((n) => set.has(n.id));
      const groupIn = [];
      inside.forEach((n) => {
        Object.keys(n.ins).forEach((p) => {
          const l = n.ins[p];
          if (set.has(l.node)) return;
          const name = 'in' + (groupIn.length + 1);
          groupIn.push({ name, type: portType(n, p, 'in'), to: { node: n.id, port: p }, from: { node: l.node, port: l.port } });
        });
      });
      const outNode = G.findNode(g, outId);
      const outType = portType(outNode, 'out', 'out');
      const cx = Math.min(...inside.map((n) => n.x)), cy = Math.min(...inside.map((n) => n.y));
      const gnode = { id: U.uid('n'), type: 'group', x: cx, y: cy, params: {}, ins: {}, groupIn: groupIn.map((x) => ({ name: x.name, type: x.type, to: x.to })), groupOut: [{ name: 'out', type: outType, from: { node: outId, port: 'out' } }], inner: { id: U.uid('g'), nodes: inside } };
      // 外部输入接到组的输入端口
      groupIn.forEach((gi) => (gnode.ins[gi.name] = gi.from));
      // 内部节点的外部连线移除（由组端口取代）
      inside.forEach((n) => Object.keys(n.ins).forEach((p) => { if (!set.has(n.ins[p].node)) delete n.ins[p]; }));
      // 外部节点原先依赖输出节点的连线改接到组的输出
      g.nodes = g.nodes.filter((n) => !set.has(n.id));
      g.nodes.forEach((n) => Object.keys(n.ins).forEach((p) => { if (n.ins[p].node === outId) n.ins[p] = { node: gnode.id, port: 'out' }; }));
      g.nodes.push(gnode);
      // 引用该输出节点的图层（几何来源、粒子发射源）改指向组节点
      App.project.comps.forEach((c) =>
        c.layers.forEach((l) => {
          if (l.geo && l.geo.source && l.geo.source.graph === g.id && l.geo.source.node === outId) l.geo.source.node = gnode.id;
          if (l.particles) {
            (l.particles.emitters || []).forEach((e) => {
              if (e.src && e.src.graph === g.id && e.src.node === outId) e.src.node = gnode.id;
            });
          }
        })
      );
      selNode = gnode.id;
    });
  }

  ND.full = () => {
    if (!bar || !App.project) return;
    UI.clear(bar);
    const graphs = App.project.graphs || [];
    const gr = currentGraph();
    const gSel = UI.select(graphs.length ? graphs.map((g) => [g.id, g.name]) : [['', '（无节点图）']], gr ? gr.id : '', (v) => {
      App.state.selectedGraph = v;
      selNode = null;
      App.notify();
    });
    bar.append(
      E('span', { class: 'muted small', text: '节点图' }),
      gSel,
      E('button', { class: 'btn small', onclick: () => App.mutate('新建节点图', () => {
        const ng = G.newGraph('节点图 ' + (App.project.graphs.length + 1));
        App.project.graphs.push(ng);
        App.state.selectedGraph = ng.id;
      }) }, '+ 新建节点图'),
      addNodeMenu(),
      E('button', { class: 'btn small', onclick: encapsulate, title: '封装组（简化）' }, '封装组'),
      E('span', { class: 'grow' }),
      E('span', { class: 'muted small', text: '从输出端拖到输入端连线；双击连线断开；端口颜色表示类型' }),
    );
    // 类型图例
    const legend = E('div', { class: 'legend' }, Object.keys(G.TYPE_COLOR).map((k) => E('span', { class: 'lg' }, [E('i', { style: { background: G.TYPE_COLOR[k] } }), G.TYPE_LABEL[k]])));
    bar.append(legend);
    render();
  };
  ND.values = () => {
    // 仅在可见时更新结果摘要（每帧重建，控制频率）
    if (!canvasEl || App.state.bottomTab !== 'nodes' || App.state.playing) return;
    render();
  };

  ND.init = () => {
    const host = document.getElementById('bottomBody');
    root = E('div', { class: 'nodes-root' });
    bar = E('div', { class: 'nodes-bar' });
    const main = E('div', { class: 'nodes-main' });
    canvasEl = E('div', { class: 'ncanvas' });
    paramsEl = E('div', { class: 'nparams' });
    main.append(canvasEl, paramsEl);
    root.append(bar, main);
    host.appendChild(root);
    canvasEl.addEventListener('mousedown', (e) => {
      if (e.target === canvasEl || e.target === svgEl) {
        selNode = null;
        renderParams();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (App.state.bottomTab !== 'nodes') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selNode && !(e.target.matches && e.target.matches('input,textarea'))) {
        App.mutate('删除节点', () => { G.removeNode(currentGraph(), selNode); selNode = null; });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selNode) {
        e.preventDefault();
        App.mutate('复制节点', () => G.duplicateNode(currentGraph(), selNode));
      }
    });
    UI.register({ full: () => ND.full(), time: () => ND.values(), values: () => {} });
  };
  void U;
  void encapsulate;
})();
