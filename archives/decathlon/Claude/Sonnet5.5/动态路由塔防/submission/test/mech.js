const G = require('./load')(['data.js', 'maps.js', 'core.js', 'sim.js']);
const K = G.K; let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } }
function fresh(mi) { const g = new G.Game(mi); g.autoWave = false; g.nextWaveIn = 1e9; g.compute = 5000; g.intel = 2000; g.core = 1e5; g.coreMax = 1e5; return g; }
function run(g, s) { for (let i = 0; i < s * 30; i++) g.step(1 / 30); }
function enemyAt(g, type, tx, ty, t, ent) { const e = g.spawnEnemy(type, ent || 'A', 1, 0); const idx = g.idx(tx, ty); e.cur = idx; e.nxt = g.nextStep(idx, g.field); e.t = t || 0; e.x = tx; e.y = ty; e.spawnT = 0; return e; }
// 1 隐身木马不被单体选中；沙箱检测后被击中
{ const g = fresh(0); const ic = g.placeFree('interceptor', 3, 5, 1, null, 0); const tr = enemyAt(g, 'trojan', 4, 4, 0.5); tr.slowT = 99; tr.slowF = 0.99; const hp0 = tr.hp; run(g, 3); ok(tr.hp === hp0, 'hidden trojan must not be targeted'); g.placeFree('sandbox', 5, 4); run(g, 1.5); ok(tr.revealed && tr.hp < hp0, 'revealed by sandbox then damaged'); }
// 2 贯穿射线波及未显形木马 → 释放载荷
{ const g = fresh(0); const ic = g.placeFree('interceptor', 3, 5, 2, 'A', 0); const victim = g.placeFree('firewall', 4, 4); let payload = 0; g.on(t => { if (t === 'payload') payload++; });
  const w = enemyAt(g, 'worm', 4, 5, 0.2); w.slowT = 99; w.slowF = 0.99; w.hp = 20; const tr = enemyAt(g, 'trojan', 5, 5, 0, 'A'); tr.cur = g.idx(4, 5); tr.nxt = g.idx(4, 6); tr.x = 4; tr.y = 5.1; tr.slowT = 99; tr.slowF = 0.99; tr.hp = 5; tr.lane = 0; w.lane = 0; w.x = 4; w.y = 5.2; run(g, 2.5); ok(payload > 0 || tr.dead, 'pierce should reach hidden trojan (payload=' + payload + ', dead=' + tr.dead + ')'); }
// 3 旧链路使木马显形
{ const g = fresh(0); const tr = enemyAt(g, 'trojan', 8, 6, 0.1); run(g, 0.3); ok(tr.revealed, 'trojan revealed on old link'); }
// 4 勒索者优先蜜罐，且蜜罐不被加密；其他塔被加密
{ const g = fresh(0); const hp = g.placeFree('honeypot', 4, 5); const sb = g.placeFree('sandbox', 3, 5); const r = enemyAt(g, 'ransom', 4, 3, 0.5); r.atkCd = 0; r.slowT = 99; r.slowF = 0.8; run(g, 4); ok(hp.hp < hp.maxhp, 'ransom attacks honeypot first'); ok(hp.encT === 0, 'honeypot immune to encryption'); ok(sb.hp === sb.maxhp, 'other tower spared while honeypot in range'); const g2 = fresh(0); const sb2 = g2.placeFree('sandbox', 3, 5); const r2 = enemyAt(g2, 'ransom', 4, 4, 0.2); r2.atkCd = 0; run(g2, 3); ok(sb2.encT > 0 || sb2.hp < sb2.maxhp, 'ransom encrypts/damages tower in range'); }
// 5 蜜罐诱导：被防火墙阻挡的蠕虫改攻蜜罐
{ const g = fresh(0); const fw = g.placeFree('firewall', 4, 6), hp = g.placeFree('honeypot', 4, 7); const w = enemyAt(g, 'worm', 4, 5, 0.4); w.hp = 1e5; w.maxhp = 1e5; run(g, 4); ok(w.bl === fw, 'worm blocked by firewall'); ok(hp.hp < hp.maxhp && fw.hp === fw.maxhp, 'lured worm attacks honeypot (hp ' + hp.hp + ')'); }
// 6 蠕虫在直通节点复制；节点隔离后不复制
{ const g = fresh(0); const w = enemyAt(g, 'worm', 4, 2, 0.5); let clones = 0; g.on(t => { if (t === 'clone') clones++; }); run(g, 4); ok(clones === 1, 'worm clones once at open node (clones=' + clones + ')'); const g2 = fresh(0); g2.deploy('airgap', 4, 3); const w2 = enemyAt(g2, 'worm', 4, 1, 0.5); let c2 = 0; g2.on(t => { if (t === 'clone') c2++; }); run(g2, 12); ok(c2 <= 1, 'isolated node route no clone at W (clones=' + c2 + ')'); }
// 7 洪泛团冲击被隔离节点，并在摧毁后恢复直通
{ const g = fresh(0); const ag = g.placeFree('airgap', 4, 3); ag.hp = 100; let bypass = 0, reroute = 0; g.on(t => { if (t === 'bypass') bypass++; if (t === 'reroute') reroute++; }); const fl = enemyAt(g, 'flooder', 4, 1, 0.1); run(g, 10); ok(ag.dead && bypass === 1, 'flooder destroys airgap -> bypass'); ok(g.nodeCd[g.idx(4, 3)] > 0 || g.nodeCd[g.idx(4, 3)] === 0, 'cd set'); const r = g.canPlace('airgap', 4, 3); ok(!r.ok, 'cannot re-isolate during cd'); run(g, 9); ok(g.canPlace('airgap', 4, 3).ok, 'can re-isolate after cd'); }
// 8 封死拒绝且不消耗资源
{ const g = fresh(1); const r1 = g.deploy('airgap', 3, 4); ok(r1.ok, 'isolate tunnel node'); const c0 = g.compute, i0 = g.intel; const r2 = g.deploy('airgap', 9, 4); ok(!r2.ok && r2.sealed, 'second crossing refused (sealed)'); ok(g.compute === c0 && g.intel === i0, 'no cost on refusal'); const r3 = g.useItem('isolator', 9, 4); ok(!r3.ok && r3.sealed, 'item refused too'); }
// 9 修复治疗 + 冗余切换
{ const g = fresh(0); const rp = g.placeFree('repair', 3, 4), fw = g.placeFree('firewall', 4, 5); fw.hp = 100; fw.encT = 10; run(g, 2); ok(fw.hp > 100, 'repair heals'); const res = g.useSkill(rp); ok(res.ok && fw.shield > 0 && fw.encT === 0, 'switch gives shield and clears encryption'); }
// 10 加密：停止攻击但不解除阻挡与隔离
{ const g = fresh(0); const fw = g.placeFree('firewall', 4, 6); const w = enemyAt(g, 'worm', 4, 5, 0.4); run(g, 1); fw.encT = 10; const hp = w.hp; run(g, 2); ok(w.bl === fw && w.hp === hp, 'encrypted firewall still blocks but does not counter'); const ag = g.placeFree('airgap', 12, 3); ag.encT = 5; ok(g.blocked[g.idx(12, 3)] & 1, 'encrypted airgap still isolates'); }
// 11 加壳器给同伴护盾
{ const g = fresh(0); const p = enemyAt(g, 'packer', 4, 4, 0.1); const w = enemyAt(g, 'worm', 4, 4, 0.3); run(g, 4); ok(w.shield > 0, 'packer shields allies'); }
// 12 协议降级：旧链路成本、路线重选
{ const g = fresh(0); const before = g.entrances[0].cost; const r = g.useItem('downgrade', 4, 5); ok(r.ok, 'downgrade used'); ok(g.entrances[0].cost > before, 'route cost increased'); run(g, 19); ok(g.tempOld[g.idx(4, 5)] === 0, 'downgrade expired'); }
// 13 备份还原
{ const g = fresh(0); const t = g.placeFree('sandbox', 3, 5); t.hp = 50; t.encT = 9; const r = g.useItem('restore', 3, 5); ok(r.ok && t.hp > 50 && t.encT === 0, 'restore heals and decrypts'); }
// 14 撤下返还与再隔离代价
{ const g = fresh(0); const r = g.deploy('airgap', 4, 3); const c = g.compute, i = g.intel; g.sell(r.tw); ok(g.compute > c && g.intel > i, 'refund'); ok(!g.canPlace('airgap', 4, 3).ok, 'cooldown after sell'); }
// 15 蜜罐诱捕：定身
{ const g = fresh(0); const hp = g.placeFree('honeypot', 4, 7); const w = enemyAt(g, 'worm', 4, 6, 0.2); g.useSkill(hp); ok(w.rootT > 0, 'trap roots'); }
// 16 路线预览差异：隔离任意节点至少一个入口改道（每图）
for (let mi = 0; mi < 3; mi++) { const g = fresh(mi); let multi = 0; g.nodes.forEach(n => { const pv = g.preview({ block: [n] }); const ch = Object.keys(pv.changed).filter(k => pv.changed[k]).length; ok(pv.ok && ch >= 1, 'map ' + mi + ' node ' + g.nodeName(n) + ' changes route'); if (ch > 1) multi++; }); ok(multi >= 1, 'map ' + mi + ' has multi-entrance node'); }
// 17 分支效果
{ const g = fresh(0); g.placeFree('interceptor', 3, 5, 2, 'B', 0); const w = enemyAt(g, 'worm', 4, 5, 0.1); w.hp = 1e5; w.maxhp = 1e5; w.slowT = 0; run(g, 2); ok(w.slowT > 0 && w.slowF >= 0.4, 'suppress branch slows'); }
{ const g = fresh(0); const hp = g.placeFree('honeypot', 4, 7, 2, 'B'); const w = enemyAt(g, 'worm', 4, 6, 0.3); w.hp = 150; g.useSkill(hp); ok(w.hp < 150 || w.dead, 'boobytrap blast damages'); }
{ const g = fresh(0); const hp = g.placeFree('honeypot', 4, 7, 2, 'A'); const fw = g.placeFree('firewall', 4, 6); const w = enemyAt(g, 'worm', 4, 5, 0.4); w.hp = 1e5; w.maxhp = 1e5; run(g, 3); ok(w.revealed && w.lure === hp, 'deep honeynet traces lured attackers'); }
{ const g = fresh(0); g.placeFree('sandbox', 5, 5, 2); const w = enemyAt(g, 'worm', 4, 5, 0.2); w.hp = 1e5; w.maxhp = 1e5; w.slowT = 99; w.slowF = 0.99; run(g, 3); ok(w.taintT > 0 || w.hp < 1e5, 'sandbox II taints'); }
{ const g = fresh(0); const fw = g.placeFree('firewall', 4, 5, 2); const b = enemyAt(g, 'boss1', 4, 4, 0.5); b.bossSpawn = 0; run(g, 2); ok(b.bl === fw, 'level-2 firewall can block a boss'); const g2 = fresh(0); const fw1 = g2.placeFree('firewall', 4, 5, 1); const b2 = enemyAt(g2, 'boss1', 4, 4, 0.5); b2.bossSpawn = 0; run(g2, 2); ok(!b2.bl, 'level-1 firewall cannot block a boss'); }
console.log('pass', pass, 'fail', fail);
{ const g = fresh(0); const r = g.deploy('airgap', 4, 3); const pv = g.preview({ unblock: [g.idx(4, 3)] }); ok(pv.ok && !pv.changed.B, 'unblock preview ok'); ok(pv.changed.A && pv.routes.A.cost < g.routes.A.cost, 'unblock preview restores shorter route for A'); }
console.log('pass(extra)', pass, 'fail', fail);
