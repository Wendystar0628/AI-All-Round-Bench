  // ===== 节点组 =====
  def('group', { name: '节点组', cat: 'group', outputs: [], params: {}, statics: {}, eval() { return { out: null }; } });
  function evalGroup(c, node, ins) {
    const inner = node.data.inner; const virtual = {};
    for (const i of node.data.ins || []) virtual['__' + i.id] = ins[i.id] === undefined ? null : ins[i.id];
    const c2 = { ev: c.ev, comp: c.comp, t: c.t, proj: { graph: { nodes: inner.nodes } }, memo: new Map(), virtual };
    const outs = {}; let first = null;
    for (const o of node.data.outs || []) { const sn = inner.nodes.find(n => n.id === o.from.node); if (!sn) continue; const r = Nodes.evalNode(c2, sn); const v = r ? (r.outs && o.from.port in r.outs ? r.outs[o.from.port] : r.out) : null; outs[o.id] = v; if (first === null) first = v; }
    return { out: first, outs, info: `${inner.nodes.length} 个内部节点` };
  }
  Nodes.makeGroup = (proj, ids) => {
    const sel = proj.graph.nodes.filter(n => ids.includes(n.id)); if (sel.length < 1) return null;
    const idset = new Set(sel.map(n => n.id)); const ins = [], outs = []; const inner = { nodes: [] };
    let k = 0;
    for (const n of sel) for (const [port, v] of Object.entries(n.inputs)) {
      const arr = [].concat(v); const keep = [];
      arr.forEach(l => {
        if (idset.has(l.node)) { keep.push(l); return; }
        const src = proj.graph.nodes.find(x => x.id === l.node); const pt = Nodes.outPorts(src).find(o => o.id === l.port); const id = 'in' + (++k);
        ins.push({ id, type: pt ? pt.type : 'geo', label: src.name + (l.port !== 'out' ? '.' + l.port : ''), ext: { node: l.node, port: l.port } }); keep.push({ node: '__' + id, port: 'out' });
      });
      n.inputs[port] = Array.isArray(v) ? keep : keep[0];
    }
    let o = 0; const consumers = proj.graph.nodes.filter(n => !idset.has(n.id)); const outMap = new Map();
    for (const cn of consumers) for (const [port, v] of Object.entries(cn.inputs)) {
      [].concat(v).forEach(l => { if (!idset.has(l.node)) return; const key = l.node + '|' + l.port; if (!outMap.has(key)) { const src = sel.find(x => x.id === l.node); const pt = Nodes.outPorts(src).find(q => q.id === l.port); outMap.set(key, { id: 'out' + (++o), type: pt ? pt.type : 'geo', label: src.name, from: { node: l.node, port: l.port } }); } });
    }
    // 几何图层直接引用的显示节点也作为输出
    for (const cp of proj.comps) for (const L of cp.layers) if (L.geo && idset.has(L.geo.node)) { const key = L.geo.node + '|out'; if (!outMap.has(key)) { const src = sel.find(x => x.id === L.geo.node); outMap.set(key, { id: 'out' + (++o), type: 'geo', label: src.name, from: { node: L.geo.node, port: 'out' } }); } }
    for (const v of outMap.values()) outs.push(v);
    const cx = sel.reduce((a, n) => a + n.x, 0) / sel.length, cy = sel.reduce((a, n) => a + n.y, 0) / sel.length;
    const gnode = { id: U.uid('N'), nodeType: 'group', name: '节点组', x: cx, y: cy, props: {}, data: { inner: { nodes: sel }, ins: ins.map(i => ({ id: i.id, type: i.type, label: i.label })), outs }, inputs: {} };
    for (const i of ins) gnode.inputs[i.id] = { node: i.ext.node, port: i.ext.port };
    for (const cn of consumers) for (const [port, v] of Object.entries(cn.inputs)) { const mapped = [].concat(v).map(l => { const key = l.node + '|' + l.port; if (outMap.has(key)) return { node: gnode.id, port: outMap.get(key).id }; return l; }); cn.inputs[port] = Array.isArray(v) ? mapped : mapped[0]; }
    proj.graph.nodes = proj.graph.nodes.filter(n => !idset.has(n.id)); proj.graph.nodes.push(gnode);
    for (const cp of proj.comps) for (const L of cp.layers) if (L.geo && idset.has(L.geo.node)) { const oo = outs.find(q => q.from.node === L.geo.node); if (oo) { L.geo.port = oo.id; L.geo.node = gnode.id; } }
    return gnode;
  };
  Nodes.ungroup = (proj, node) => {
    if (node.nodeType !== 'group') return false; const d = node.data;
    for (const n of d.inner.nodes) for (const [port, v] of Object.entries(n.inputs)) {
      const arr = [].concat(v).map(l => { if (l.node.startsWith('__')) { const i = (d.ins || []).find(x => '__' + x.id === l.node); const ext = i && node.inputs[i.id]; return ext ? { node: ext.node, port: ext.port } : null; } return l; }).filter(Boolean);
      if (arr.length) n.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete n.inputs[port];
    }
    for (const cn of proj.graph.nodes) for (const [port, v] of Object.entries(cn.inputs)) {
      const arr = [].concat(v).map(l => { if (l.node !== node.id) return l; const o = (d.outs || []).find(q => q.id === l.port); return o ? { node: o.from.node, port: o.from.port } : null; }).filter(Boolean);
      if (arr.length) cn.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete cn.inputs[port];
    }
    proj.graph.nodes = proj.graph.nodes.filter(n => n !== node); proj.graph.nodes.push(...d.inner.nodes);
    for (const cp of proj.comps) for (const L of cp.layers) if (L.geo && L.geo.node === node.id) { const o = (d.outs || []).find(q => q.id === L.geo.port) || (d.outs || [])[0]; L.geo.node = o ? o.from.node : null; delete L.geo.port; }
    return true;
  };
  Nodes.duplicate = (proj, ids) => {
    const sel = proj.graph.nodes.filter(n => ids.includes(n.id)); const map = new Map(); const out = [];
    for (const n of sel) { const cp = JSON.parse(JSON.stringify(n)); cp.id = U.uid('N'); cp.x += 40; cp.y += 40; cp.name = n.name + ' 副本'; map.set(n.id, cp.id); out.push(cp); }
    for (const cp of out) for (const [port, v] of Object.entries(cp.inputs)) { const arr = [].concat(v).filter(l => map.has(l.node)).map(l => ({ node: map.get(l.node), port: l.port })); if (arr.length) cp.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete cp.inputs[port]; }
    proj.graph.nodes.push(...out); return out;
  };
  Nodes.remove = (proj, ids) => {
    const set = new Set(ids); proj.graph.nodes = proj.graph.nodes.filter(n => !set.has(n.id));
    for (const n of proj.graph.nodes) for (const [port, v] of Object.entries(n.inputs)) { const arr = [].concat(v).filter(l => !set.has(l.node)); if (arr.length) n.inputs[port] = Array.isArray(v) ? arr : arr[0]; else delete n.inputs[port]; }
    for (const cp of proj.comps) for (const L of cp.layers) { if (L.geo && set.has(L.geo.node)) L.geo.node = null; if (L.ps) { for (const em of L.ps.emitters) { if (set.has(em.node)) em.node = null; if (set.has(em.field)) em.field = null; } for (const f of L.ps.forces) if (set.has(f.node)) f.node = null; for (const cl of L.ps.colliders) if (set.has(cl.node)) cl.node = null; } }
  };
