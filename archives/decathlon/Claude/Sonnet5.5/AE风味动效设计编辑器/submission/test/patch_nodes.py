import re
p = 'js/nodes.js'
s = open(p, encoding='utf-8').read()

s = s.replace("""  Nodes.inPorts = node => { const d = ND[node.nodeType]; const ports = [];""", """  Nodes.outPorts = node => { if (node.nodeType === 'group') return (node.data.outs || []).map(o => ({ id: o.id, type: o.type, label: o.label })); return ND[node.nodeType].outputs; };
  Nodes.inPorts = node => { const d = ND[node.nodeType]; const ports = []; if (node.nodeType === 'group') { for (const i of node.data.ins || []) ports.push({ id: i.id, type: i.type, label: i.label, param: false }); return ports; }""")

s = s.replace("const d = ND[toNode.nodeType]; const pin = Nodes.inPorts(toNode).find(p => p.id === port); const fd = ND[fromNode.nodeType]; const fo = fd.outputs.find(o => o.id === fromPort);", "const pin = Nodes.inPorts(toNode).find(p => p.id === port); const fo = Nodes.outPorts(fromNode).find(o => o.id === fromPort);")

s = s.replace("""    const gets = l => { const sn = find(l.node); if (!sn) return null; const r = Nodes.evalNode(c, sn); return r ? r.out : null; };""", """    const gets = l => { if (c.virtual && l.node in c.virtual) return c.virtual[l.node]; const sn = find(l.node); if (!sn) return null; const r = Nodes.evalNode(c, sn); if (!r) return null; return r.outs && l.port in r.outs ? r.outs[l.port] : r.out; };""")

s = s.replace("""    const p = {};
    for (const [k, pd] of Object.entries(d.params)) {""", """    if (node.nodeType === 'group') { const res = evalGroup(c, node, ins); c.memo.set(node.id, res); return res; }
    const p = {};
    for (const [k, pd] of Object.entries(d.params)) {""")

group_code = open('test/group_code.js', encoding='utf-8').read()
s = s.replace("  // ===== 求值 =====\n  const caches = new WeakMap();", group_code + "\n  // ===== 求值 =====\n  const caches = new WeakMap();")
open(p, 'w', encoding='utf-8').write(s)
print('patched', 'makeGroup' in s)
