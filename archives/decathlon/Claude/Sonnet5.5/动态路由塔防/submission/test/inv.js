// 压力测试：随机隔离/撤下/道具 + Boss，检查不变量
const G = require('./load')(['data.js', 'maps.js', 'core.js', 'sim.js']);
const K = G.K; let fails = 0;
for (let mi = 0; mi < 3; mi++) for (let seed = 0; seed < 3; seed++) {
  const g = new G.Game(mi); g.compute = 5000; g.intel = 3000; g.leakScale = 0.01; g.core = 1e6; g.coreMax = 1e6; g.income = 20;
  let rs = seed * 7919 + 13; const rnd = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  // 一些防御
  const plats = []; for (let i = 0; i < g.N; i++) if (g.kind[i] === K.PLAT) plats.push(i);
  for (let k = 0; k < 14; k++) { const i = plats[Math.floor(rnd() * plats.length)]; const kind = ['interceptor', 'sandbox', 'repair'][k % 3]; g.deploy(kind, g.tx(i), g.ty(i), rnd() * 6); }
  let ticks = 0, jumps = 0; const last = {};
  g.on((t, d) => { if (t === 'reroute') { ticks++; g.lastReason = d.reason + '@' + d.tiles.map(i=>g.tx(i)+','+g.ty(i)); } });
  for (let n = 0; n < 30 * 60 * 14 && !g.over; n++) {
    g.step(1 / 30);
    if (n % 90 === 0) { // 随机操作
      const r = rnd();
      if (r < 0.35) { const nd = g.nodes[Math.floor(rnd() * g.nodes.length)]; const kind = rnd() < 0.5 ? 'airgap' : 'firewall'; const res = g.deploy(kind, g.tx(nd), g.ty(nd)); if (!res.ok && res.sealed === undefined && !res.cd && res.msg && res.msg.indexOf('封死') >= 0) { } }
      else if (r < 0.55) { const iso = g.towers.filter(t => t.onNode); if (iso.length) g.sell(iso[Math.floor(rnd() * iso.length)]); }
      else if (r < 0.7) { const nd = g.nodes[Math.floor(rnd() * g.nodes.length)]; g.useItem('isolator', g.tx(nd), g.ty(nd)); }
      else if (r < 0.85) { g.useItem('downgrade', Math.floor(rnd() * g.W), Math.floor(rnd() * g.H)); }
      g.itemCd.isolator = 0; g.itemCd.downgrade = 0;
    }
    // 不变量
    g.entrances.forEach(e => { if (!(g.field.dist[e.idx] < Infinity)) { console.log('FAIL entrance sealed', mi, seed, e.id, n); fails++; } });
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (!isFinite(e.x) || !isFinite(e.y)) { console.log('FAIL NaN pos', e.type); fails++; }
      if (!e.air) {
        // 敌人不得位于不可通行格的中心之外（站在被阻断格内允许）
        const ti = g.tileOf(e); if (!g.isRoadKind(g.kind[ti])) { console.log('FAIL off-road', mi, seed, e.type, e.x.toFixed(2), e.y.toFixed(2), n); fails++; }
        if (!g.enemyCanProceed(e, g.field) && !e.bl) { console.log('FAIL stranded', mi, seed, e.type, e.cur, e.nxt, n, 'mode', e.mode, 'goal', e.goal, 't', e.t.toFixed(2), 'blocked', g.nodes.filter(x=>g.blocked[x]).map(x=>g.tx(x)+','+g.ty(x)).join(' '), 'cur', g.tx(e.cur)+','+g.ty(e.cur), 'nxt', e.nxt>=0?g.tx(e.nxt)+','+g.ty(e.nxt):-1, 'dist', g.field.dist[e.cur], g.field.dist[e.nxt], 'lastReroute', g.lastReason); fails++; }
        const k = last[e.id]; if (k) { const d = Math.hypot(e.x - k[0], e.y - k[1]); if (d > 0.6) { jumps++; if (jumps < 4) console.log('JUMP', e.type, d.toFixed(2), 'at', n); } } last[e.id] = [e.x, e.y];
      }
    }
    if (fails > 2) break;
  }
  console.log('map', mi, 'seed', seed, 'time', g.time.toFixed(0), 'wave', g.waveIdx, 'reroutes', ticks, 'kills', g.stats.kills, 'jumps', jumps, 'iso-towers', g.towers.filter(t=>t.onNode).length);
}
console.log(fails ? 'FAILS ' + fails : 'ALL OK');
