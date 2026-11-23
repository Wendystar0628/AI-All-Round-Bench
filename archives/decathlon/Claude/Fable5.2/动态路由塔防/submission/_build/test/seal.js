const { TD } = require('./bot.js');
const s = new TD.Sim('intranet', {}); s.compute = 999; s.intel = 99;
const at = (x, y) => y * s.W + x; let rej = null; s.on('reject', d => rej = d);
console.log('iso 办公接入:', !!s.place('gateway', at(5, 3), 0), 'A cost', s.routes.A.cost);
const chk = s.checkPlace('gateway', at(17, 3)); console.log('iso 业务接入 chk:', chk.ok, chk.sealed, chk.reason, chk.ev.sealedEntries);
const c0 = s.compute, i0 = s.intel; const r = s.place('gateway', at(17, 3), 0); console.log('placed?', !!r, 'resources unchanged:', s.compute === c0 && s.intel === i0, 'reject evt:', rej && rej.reason);
// 再次隔离间隔与撤下返还
const t = s.towers[0]; s.sell(t.id); console.log('sell refund ->', s.compute - c0, 'reT', s.nodes[at(5, 3)].reT, 'chk again:', s.checkPlace('gateway', at(5, 3)).reason);
// 道具
console.log('isolator:', s.checkItem('isolator', at(8, 8)).ok, 'downgrade cells:', s.checkItem('downgrade', at(5, 5)).cells.length);
// 敌人在场时的封死校验
const s2 = new TD.Sim('airgap', {}); s2.compute = 9999; s2.intel = 99; const a2 = (x, y) => y * s2.W + x;
s2.startWave(true); for (let i = 0; i < 60 * 14; i++) s2.step();
console.log('airgap enemies', s2.enemies.map(e => e.x.toFixed(1) + ',' + e.y.toFixed(1)).join(' '));
console.log(!!s2.place('gateway', a2(7, 6), 0), !!s2.place('gateway', a2(7, 11), 0), s2.checkPlace('gateway', a2(17, 6)).ok, JSON.stringify(Object.keys(s2.routes).map(k => k + '>' + s2.routes[k].exit + ':' + s2.routes[k].cost.toFixed(1))));
for (let i = 0; i < 60 * 30; i++) s2.step(); console.log('after 30s: enemies', s2.enemies.length, 'integ', s2.integrity, 'kills', s2.stats.killN);
