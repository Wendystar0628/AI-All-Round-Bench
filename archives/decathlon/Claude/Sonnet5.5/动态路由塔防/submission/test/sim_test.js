const G = require('./load')(['data.js', 'maps.js', 'core.js', 'sim.js']);
const mi = +process.argv[2] || 0;
const g = new G.Game(mi);
let evs = {};
g.on((t, d) => { evs[t] = (evs[t] || 0) + 1; });
// 无塔跑一遍：应该全部漏掉，核心被打穿，且不报错
const dt = 1 / 30; let n = 0;
while (!g.over && n < 30 * 60 * 20) { g.step(dt); n++; }
console.log('map', mi, 'ended', g.over, 'win', g.win, 'time', g.time.toFixed(0), 'core', g.core, 'wave', g.waveIdx, 'enemies', g.enemies.length);
console.log(JSON.stringify(evs));
console.log(g.stats);
