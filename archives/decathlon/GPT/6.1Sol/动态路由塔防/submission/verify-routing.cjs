// Run with: node verify-routing.cjs. No server or dependencies required.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({console});
vm.runInContext(fs.readFileSync(__dirname + '/data.js', 'utf8') + '\n' + fs.readFileSync(__dirname + '/routing.js', 'utf8') + '\nthis.maps = Data.maps; this.Network = Network;', context);
for (const map of context.maps) {
  const network = new context.Network(map);
  assert.ok(network.routes.every(Boolean), `${map.name}: disconnected baseline`);
  let shared = false;
  for (const node of network.nodes) {
    const preview = network.preview(node.k);
    assert.ok(preview.valid, `${map.name}/${node.name}: isolates a source`);
    const changes = preview.routes.filter((r, i) => r.map(c => c.k).join('|') !== network.routes[i].map(c => c.k).join('|'));
    assert.ok(changes.length, `${map.name}/${node.name}: no meaningful reroute`);
    shared ||= changes.length > 1;
    for (const route of preview.routes) {
      assert.ok(!route.some(c => c.k === node.k), 'route crosses an isolated node');
      for (let i = 1; i < route.length; i++) {
        assert.equal(Math.abs(route[i].x-route[i-1].x) + Math.abs(route[i].z-route[i-1].z), 1, 'route skips grid cells');
      }
    }
  }
  assert.ok(shared, `${map.name}: no node affects multiple sources`);
  const first = network.map.entries[0];
  const rejected = network.preview(`${first.x},${first.z}`);
  assert.equal(rejected.valid, false, 'cannot disconnect a source');
  const slow = new Set(network.routes[0].slice(2, 8).map(c => c.k));
  const slowPreview = network.preview(null, false, [], slow);
  assert.ok(slowPreview.valid);
  assert.ok(slowPreview.routes[0].cost >= network.routes[0].cost);
  console.log(`${map.name}: ${network.cells.size} chain cells, ${network.nodes.length} isolatable nodes; all route checks passed`);
}
