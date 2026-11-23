const G = require('./load')(['data.js', 'maps.js', 'core.js']);
function show(game, routes, title) {
  const W = game.W, H = game.H; const rows = [];
  for (let y = 0; y < H; y++) { let s = ''; for (let x = 0; x < W; x++) { s += game.map.rows[y][x]; } rows.push(s.split('')); }
  const marks = { A: 'a', B: 'b', C: 'c' };
  for (const id in routes) { const r = routes[id].tiles || routes[id].route; for (const t of r) { const x = t % W, y = (t / W) | 0; const ch = rows[y][x]; if (ch === 'r' || ch === 'o' || ch === 't') rows[y][x] = marks[id]; else if (ch === 'N') rows[y][x] = '#'; } }
  console.log(title); console.log(rows.map(r => r.join('')).join('\n'));
}
for (let mi = 0; mi < 3; mi++) {
  const g = new G.Game(mi);
  console.log('==== MAP', mi, g.map.name, g.W + 'x' + g.H);
  const base = {}; g.entrances.forEach(e => base[e.id] = e);
  show(g, base, 'default routes (a/b/c; # = node on route)');
  g.entrances.forEach(e => console.log(e.id, 'exit', e.exit, 'cost', e.cost.toFixed(1), 'len', e.route.length, g.routeZones(e.route).join('>')));
  let multi = 0;
  for (const n of g.nodes) {
    const pv = g.preview({ block: [n] });
    const ch = Object.keys(pv.changed).filter(k => pv.changed[k]);
    console.log('node', g.nodeName(n), 'ok', pv.ok, 'changed', ch.join(','), ch.map(k => k + ':' + (pv.routes[k].cost - g.routes[k].cost).toFixed(1) + '->' + pv.routes[k].exit).join(' '));
    if (!pv.ok || ch.length === 0) console.log('  !!! PROBLEM');
    if (ch.length > 1) multi++;
  }
  console.log('multi-entrance nodes:', multi);
  if (process.argv[2] === 'v') for (const n of g.nodes) { const pv = g.preview({ block: [n] }); show(g, pv.routes, 'iso ' + g.nodeName(n)); }
}
