const { runBot, TD } = require('./bot.js');
const sim = new TD.Sim('backbone', {});
const at = (x, y) => y * sim.W + x;
// 手工布防：X 前的走廊
console.log(!!sim.place('firewall', at(5, 10), 0), !!sim.place('interceptor', at(6, 9), 3), !!sim.place('interceptor', at(4, 10), 0));
sim.startWave(true);
let t = 0; const ev = [];
sim.on('leak', d => ev.push('leak ' + d.enemy.type + ' @' + sim.time.toFixed(1)));
sim.on('towerDie', d => ev.push('towerDie ' + d.tower.type + ' @' + sim.time.toFixed(1)));
while (sim.phase === 'active' && t < 60 * 120) { sim.step(); t++; if (t % 300 === 0) console.log(sim.time.toFixed(0), 'en', sim.enemies.length, sim.enemies.slice(0, 4).map(e => e.type + ':' + e.x.toFixed(1) + ',' + e.y.toFixed(1) + ':' + Math.round(e.hp) + (e.blockedBy ? 'B' : '')).join(' '), 'tw', sim.towers.map(t => t.type[0] + Math.round(t.hp)).join(' ')); }
console.log(ev.join('; '), 'integ', sim.integrity, 'kills', sim.stats.killN);
