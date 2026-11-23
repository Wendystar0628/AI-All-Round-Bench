const fs = require('fs');
const vm = require('vm');
const path = require('path');
const context = { console, Math, Set, Map, globalThis: {} };
context.globalThis = context;
vm.createContext(context);
['maps.js', 'content.js', 'sim.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), context);
});
const TD = context.TD;

function show(label, b) {
  console.log('\n' + label);
  b.map.entrances.forEach((e) => {
    const r = b.routes[e.id];
    if (!r) { console.log('  ' + e.id + ' SEALED'); return; }
    const ex = b.map.exits.find((x) => x.c + ',' + x.r === r.exitKey);
    console.log('  ' + e.id + ' => ' + (ex ? ex.id : '?') + ' cost ' + r.cost.toFixed(1) + ' via ' + r.path.filter((k, i) => i % 4 === 0).join(' '));
  });
}

const m2 = TD.mapById('backbone');
const b = TD.createBattle(m2, 1);
b.suppressEnd = true;
b.phase = 'combat';
b.spawnQ = [];
const g = b.place('gate', 14, 13, 0, { free: true });
console.log('gate', g.ok, g.tower && g.tower.hp);
show('conv isolated', b);
const floods = [[11, 16, 'C'], [12, 16, 'C'], [16, 16, 'B']].map((p) => {
  const e = b.spawnAt('flood', p[0], p[1], p[2]);
  e.pace = 0.72;
  return e;
});
for (let t = 0; t < 6.2; t += 0.1) b.update(0.1);
floods.forEach((e) => console.log('flood', e.ent, e.c, e.r, e.state, 'exit', e.exitKey, 'goal', e.goalNode));
b.forceBreakNode('nConv');
show('after break', b);
floods.forEach((e) => console.log('flood after', e.ent, e.c, e.r, e.state, 'wps', (e.wps || []).slice(e.wi, e.wi + 4).map((w) => w.c + ',' + w.r).join('>')));

const m3 = TD.mapById('ics');
const c = TD.createBattle(m3, 2);
c.suppressEnd = true;
c.phase = 'combat';
c.spawnQ = [];
const boss = c.spawnAt('shadow', 7, 4, 'A');
boss.phase = 2; boss.revealed = true; boss.armorOn = true; boss.hp = boss.maxHp * 0.66; boss.pace = 0.35;
c.place('repair', 13, 10, 0, { free: true });
const face = Math.atan2(1, -1);
const ic = c.place('intercept', 13, 7, face, { free: true });
ic.tower.encryptT = 20;
c.place('firewall', 14, 6, 0, { free: true, hpMul: 0.8 });
const ransom = c.spawnAt('ransom', 14, 4, 'C');
ransom.pace = 0;
const worm = c.spawnAt('worm', 3, 11, 'B');
worm.pace = 0.05;
const wormA = c.spawnAt('worm', 14, 5, 'C');
wormA.pace = 0.35;
const cells = ['3,5', '3,6', '3,7', '3,9', '3,10', '3,12', '3,14', '3,15'];
for (let t = 0; t < 3.2; t += 0.1) c.update(0.1);
console.log('\nbefore lock positions', 'boss', boss.c, boss.r, 'bw', worm.c, worm.r, 'rw', wormA.c, wormA.r, 'ransom', ransom.c, ransom.r);
c.warnLock(cells, 3, 12);
for (let t = 0; t < 3.2; t += 0.1) c.update(0.1);
console.log('tempBlocks', Array.from(c.tempBlocks.keys()).join(' '));
show('after lock', c);
console.log('boss', boss.c, boss.r, boss.state, 'wormB', worm.c, worm.r, worm.state, 'next', (worm.wps || []).slice(worm.wi, worm.wi + 5).map((w) => w.c + ',' + w.r).join('>'));
console.log('repair encrypt', c.towerAt(13, 10).encryptT, 'fw hp', c.towerAt(14, 6).hp.toFixed(0), 'ic encrypt', c.towerAt(13, 7).encryptT);
const skill = c.castSkill(c.towerAt(13, 10).id);
console.log('skill', skill.ok, skill.reason, 'ic encrypt after', c.towerAt(13, 7).encryptT, 'ic shield', c.towerAt(13, 7).shield, 'fw hp', c.towerAt(14, 6).hp.toFixed(0));

const m1 = TD.mapById('intranet');
const a = TD.createBattle(m1, 3);
a.suppressEnd = true;
a.phase = 'combat';
a.spawnQ = [];
a.waveIndex = 6;
a.place('firewall', 14, 8, 0, { free: true, hpMul: 0.85 });
a.place('intercept', 12, 8, Math.PI / 2, { free: true });
a.place('sandbox', 13, 8, 0, { free: true });
a.compute = 80; a.intel = 40;
[[3, 5], [3, 5], [3, 6]].forEach((p) => { const e = a.spawnAt('worm', p[0], p[1], 'A'); e.pace = 0.14; });
[[14, 3], [14, 4], [14, 5]].forEach((p) => a.spawnAt('worm', p[0], p[1], 'B'));
a.spawnAt('ransom', 14, 6, 'B');
for (let t = 0; t < 7.5; t += 0.05) a.update(0.05);
console.log('\nm1 worms', a.enemies.filter((e) => e.ent === 'A').map((e) => e.type + '@' + e.c + ',' + e.r + ' ' + e.state).join(' | '));
console.log('m1 can gate', JSON.stringify(a.canPlace('gate', 3, 10)));
const placed = a.place('gate', 3, 10, 0);
console.log('placed', placed.ok, placed.reason, 'A', a.routes.A && a.routes.A.path.join('>'));
a.enemies.forEach((e) => { if (e.ent === 'A' && e.type === 'worm') e.pace = 1; });
for (let t = 0; t < 4; t += 0.1) a.update(0.1);
console.log('m1 worms later', a.enemies.filter((e) => e.ent === 'A' && e.type === 'worm').map((e) => e.c + ',' + e.r + ' ' + e.state + ' wi' + e.wi).join(' | '));
console.log('east towers', a.towers.map((t) => t.type + ' hp' + Math.round(t.hp) + (t.dead ? ' DEAD' : '') + ' enc' + t.encryptT.toFixed(1)).join(' | '));
