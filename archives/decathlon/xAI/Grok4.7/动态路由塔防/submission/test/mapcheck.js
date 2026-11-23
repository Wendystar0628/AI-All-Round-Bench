const fs = require('fs');
const vm = require('vm');
const context = { console: console, Math: Math, Set: Set, globalThis: {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'js', 'maps.js'), 'utf8'), context);
const TD = context.TD;

function nodesOn(map, route) {
  if (!route) return '-';
  const ids = [];
  route.path.forEach((k) => {
    const cell = map.cells[k];
    if (cell && cell.nodeId) ids.push(cell.nodeId);
  });
  const exit = map.exits.find((e) => e.c + ',' + e.r === route.exitKey);
  return ids.join('>') + ' => ' + (exit ? exit.id : '?') + ' cost=' + route.cost.toFixed(1);
}

let fail = 0;
TD.MAPS.forEach((map) => {
  const report = TD.validateMap(map);
  console.log('\n== ' + map.name + ' ==');
  map.entrances.forEach((e) => console.log('  ' + e.id + ' ' + nodesOn(map, report.base[e.id])));
  report.errors.forEach((er) => { console.log('  ERR ' + er); fail++; });
  map.nodes.forEach((node) => {
    const blk = new Set([node.c + ',' + node.r]);
    const alt = TD.allRoutes(map, blk, null);
    const bits = map.entrances.map((e) => {
      const a = report.base[e.id], b = alt[e.id];
      if (!a || !b) return e.id + ':SEAL';
      const same = a.path.join('|') === b.path.join('|');
      const ex = map.exits.find((x) => x.c + ',' + x.r === b.exitKey);
      return e.id + (same ? ':same' : ':chg=>' + (ex ? ex.id : '?'));
    }).join('  ');
    console.log('  iso ' + node.id + '  ' + bits);
  });
});

function assertPath(map, label, blocked, origin, expectExit, mustNodes, banNodes) {
  const exits = map.exits.map((e) => e.c + ',' + e.r);
  const r = TD.dijkstra(map, origin, exits, blocked, null);
  if (!r) { console.log('FAIL ' + label + ' no path'); fail++; return; }
  const ex = map.exits.find((e) => e.c + ',' + e.r === r.exitKey);
  const nodes = r.path.map((k) => map.cells[k].nodeId).filter(Boolean);
  let ok = true;
  if (ex.id !== expectExit) { ok = false; console.log('FAIL ' + label + ' exit ' + ex.id + ' != ' + expectExit); }
  (mustNodes || []).forEach((n) => { if (nodes.indexOf(n) < 0) { ok = false; console.log('FAIL ' + label + ' missing ' + n + ' has ' + nodes.join(',')); } });
  (banNodes || []).forEach((n) => { if (nodes.indexOf(n) >= 0) { ok = false; console.log('FAIL ' + label + ' banned ' + n); } });
  if (!ok) fail++;
  else console.log('OK ' + label + ' ' + nodes.join('>') + ' => ' + ex.id);
}

const m1 = TD.mapById('intranet');
assertPath(m1, 'm1 A default', null, '3,1', 'X', ['dmzW', 'west', 'core'], ['dmzE', 'east']);
assertPath(m1, 'm1 B default', null, '14,1', 'X', ['dmzE', 'east', 'core'], ['west']);
assertPath(m1, 'm1 A iso west', new Set(['3,10']), '3,1', 'X', ['dmzW', 'dmzE', 'east', 'core'], ['west']);
assertPath(m1, 'm1 office cell iso west', new Set(['3,10']), '3,8', 'X', ['dmzE', 'east'], ['west']);
assertPath(m1, 'm1 A iso core', new Set(['8,14']), '3,1', 'X', ['west'], ['core']);
assertPath(m1, 'm1 B iso core', new Set(['8,14']), '14,1', 'X', ['east'], ['core']);
assertPath(m1, 'm1 A iso dmzW', new Set(['3,4']), '3,1', 'X', [], ['dmzW', 'west']);

const m2 = TD.mapById('backbone');
assertPath(m2, 'm2 A default', null, '2,16', 'X', ['nA', 'nTunnel', 'nX'], ['nConv', 'nY']);
assertPath(m2, 'm2 C default', null, '11,16', 'Y', ['nConv', 'nOld', 'nY'], ['nTunnel']);
assertPath(m2, 'm2 B default', null, '18,16', 'Y', ['nConv', 'nOld', 'nY'], ['nTunnel']);
assertPath(m2, 'm2 C iso conv', new Set(['14,13']), '11,16', 'X', ['nTunnel'], ['nConv', 'nY']);
assertPath(m2, 'm2 B iso conv', new Set(['14,13']), '18,16', 'X', ['nTunnel'], ['nConv']);
assertPath(m2, 'm2 A iso tunnel', new Set(['2,7']), '2,16', 'Y', ['nConv', 'nY'], ['nTunnel', 'nX']);
assertPath(m2, 'm2 C iso old', new Set(['16,8']), '11,16', 'X', ['nTunnel'], ['nOld']);

const m3 = TD.mapById('ics');
assertPath(m3, 'm3 A default', null, '7,1', 'X', ['nN', 'nW', 'nSW'], ['nE']);
assertPath(m3, 'm3 B default', null, '1,11', 'X', ['nSW'], ['nW', 'nE']);
assertPath(m3, 'm3 C default', null, '16,3', 'Y', ['nE', 'nSE'], ['nN', 'nW']);
assertPath(m3, 'm3 A iso nN', new Set(['5,4']), '7,1', 'Y', ['nE', 'nSE'], ['nN', 'nW']);
assertPath(m3, 'm3 A iso nW', new Set(['3,8']), '7,1', 'Y', ['nE'], ['nW']);
assertPath(m3, 'm3 A iso nSW', new Set(['3,13']), '7,1', 'Y', [], ['nSW']);
assertPath(m3, 'm3 B iso nSW', new Set(['3,13']), '1,11', 'Y', ['nW', 'nE'], ['nSW']);
assertPath(m3, 'm3 C iso nE', new Set(['14,8']), '16,3', 'X', ['nN', 'nW'], ['nE']);
assertPath(m3, 'm3 C iso nSE', new Set(['14,13']), '16,3', 'X', [], ['nSE']);

console.log(fail ? '\nFAILED ' + fail : '\nALL OK');
process.exit(fail ? 1 : 0);
