// Node 测试：验证地图与改道规则（在临时目录运行，不依赖 DOM）
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ctx = { console, Math, Set, Map, Infinity, Object, Array, JSON };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/data.js', 'js/sim.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, S = G.Sim;
let problems = 0;
function fail(m) { problems++; console.log('  ✗ ' + m); }

for (const id of G.MAP_ORDER) {
  const def = G.MAPS[id];
  console.log('\n=== 地图 ' + id + ' ' + def.name + ' (' + def.w + 'x' + def.d + ') ===');
  def.layer0.forEach((r, i) => { if (r.length !== def.w) fail('layer0 第' + i + ' 行宽度 ' + r.length + ' != ' + def.w); });
  if (def.layer1) def.layer1.forEach((r, i) => { if (r.length !== def.w) fail('layer1 第' + i + ' 行宽度 ' + r.length); });
  const M = S.buildMap(def);
  const g = S.createGame(id, { seed: 1 });
  // 入口连通
  for (const en of M.entries) { if (!g.routes.dist.has(en.id)) fail('入口 ' + en.entryId + ' 不连通'); }
  console.log('  节点数 ' + M.nodes.length + '，入口 ' + M.entryIds.join(',') + '，出口 ' + M.exitIds.join(',') + '，平台 ' + M.platforms.length);
  const base = g.routes.byEntry;
  for (const k in base) {
    const len = base[k].length;
    const cost = routeCost(g, base[k]);
    console.log('  默认路线 ' + k + ' → ' + M.byId.get(base[k][len - 1]).exitId + ' : ' + len + ' 格, 代价 ' + cost.toFixed(1) + ' ; 经过节点 ' + base[k].filter(c => M.byId.get(c).type === 'node').map(c => M.byId.get(c).nodeId + '(' + M.byId.get(c).name + ')').join(' '));
  }
  // 每个节点单独隔离
  let multi = 0;
  for (const n of M.nodes) {
    const chk = S.checkIsolation(g, n.id);
    if (!chk.ok) { fail('隔离节点 ' + n.nodeId + ' 会封死: ' + chk.reason); continue; }
    const pr = S.previewRoutes(g, [n.id]);
    const changed = M.entryIds.filter(k => pr[k].join(',') !== base[k].join(','));
    if (!changed.length) fail('隔离节点 ' + n.nodeId + '(' + n.name + ') 没有改变任何入口的路线');
    if (changed.length > 1) multi++;
    const desc = changed.map(k => k + '→' + M.byId.get(pr[k][pr[k].length - 1]).exitId + '(' + pr[k].length + '格)').join(' ');
    console.log('  隔离节点 ' + n.nodeId + ' (' + n.name + ') 改变: ' + (desc || '无') + (changed.length ? '' : '  <<<') );
  }
  if (!multi) fail('没有同时改变多个入口的节点');
  // 旧链路代价确实更高
  const oldCells = M.cells.filter(c => c.type === 'old').length;
  console.log('  旧链路格数 ' + oldCells);
  // 波次数据检查
  const wc = def.waves.length;
  if (wc !== def.waveCount) fail('波次数 ' + wc + ' != ' + def.waveCount);
  for (const w of def.waves) for (const gr of w.groups) { if (!M.entryIds.includes(gr[0])) fail('波次入口不存在 ' + gr[0]); if (!G.ENEMIES[gr[1]]) fail('敌人类型不存在 ' + gr[1]); }
  // 快速模拟 3 波，确认不崩溃
  const g2 = S.createGame(id, { seed: 7, cpu: 2000 });
  S.callNextWave(g2);
  let err = null;
  try {
    for (let i = 0; i < 30 * 150; i++) {
      S.tick(g2, 1 / 30);
      if (i === 300) { S.deploy(g2, 'firewall', M.nodes[0].id); }
      if (i === 600 && g2.phase === 'inter') S.callNextWave(g2);
      if (i === 1200 && g2.phase === 'inter') S.callNextWave(g2);
      if (g2.finished) break;
    }
  } catch (e) { err = e; }
  if (err) fail('模拟异常: ' + err.stack);
  else console.log('  模拟 150 秒: t=' + g2.t.toFixed(0) + ' phase=' + g2.phase + ' wave=' + (g2.waveIdx + 1) + ' core=' + g2.core.toFixed(0) + ' cpu=' + g2.cpu.toFixed(0) + ' intel=' + g2.intel + ' towers=' + g2.towers.length + ' enemies=' + g2.enemies.length + ' kills=' + g2.stats.kills + ' leaks=' + g2.stats.leaks);
}
function routeCost(g, cells) { let c = 0; for (let i = 1; i < cells.length; i++) { const b = g.M.byId.get(cells[i]); const a = g.M.byId.get(cells[i - 1]); const len = Math.hypot(b.wx - a.wx, b.wy - a.wy, b.wz - a.wz) / S.CELL; c += len * (b.type === 'old' ? S.OLD_COST : 1); } return c; }
console.log('\n问题数: ' + problems);
process.exit(problems ? 1 : 0);
