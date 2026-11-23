// Headless logic regressions. Run with: node verify-game.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function model() { return {g:{userData:{},scale:{setScalar(){}},position:{set(){}},rotation:{}},p:{rotation:{}},parts:{head:{rotation:{}}}}; }
const noop = () => {};
const View = new Proxy({makeTower:model,makeEnemy:model,actorGroup:{remove:noop},world:{remove:noop},ring:()=>({}),cylinder:()=>({})},{get:(o,k)=>k in o?o[k]:noop});
const UI = new Proxy({},{get:()=>noop});
const context = vm.createContext({console,View,UI,Math,Set,Map});
vm.runInContext(['data.js','routing.js','game.js'].map(p=>fs.readFileSync(__dirname+'/'+p,'utf8')).join('\n')+'\nthis.Game=Game;this.Data=Data;',context);
const {Game,Data}=context;
function start(id=0) {const s=Game.start(id);s.compute=5000;s.intel=1000;return s;}
function cell(s,x,z) {return s.network.cells.get(`${x},${z}`)||s.network.pads.find(p=>p.k===`${x},${z}`);}
function tick(seconds) {for(let t=0;t<seconds;t+=.025)Game.tick(.025);}

let s=start();
let e=Game.spawn('worm','A',cell(s,-7,-1));e.z=-.6;
const before={x:e.x,z:e.z};Game.place('gate',cell(s,-7,0));
assert.equal(e.x,before.x);assert.equal(e.z,before.z,'reroute must not teleport');
Game.tick(.1);assert.ok(Math.hypot(e.x-before.x,e.z-before.z)<=.116,'continuous motion');
assert.ok(e.next.z<e.z,'enemy turns back toward the DMZ');

s=start();e=Game.spawn('worm','A',cell(s,-7,-1));
e.next=cell(s,-7,0);e.edgeEnds=[e.cell,e.next];e.z=-.6;
Game.changed(null,false,'unrelated change');
assert.equal(e.next.k,'-7,0','unchanged shortest route keeps moving forward');
const forwardZ=e.z;Game.updateEnemy(e,.1);assert.ok(e.z>forwardZ,'no arbitrary reverse on convergence');
const partial={x:e.x,z:e.z};Game.reroute(e);
assert.equal(e.x,partial.x);assert.equal(e.z,partial.z,'mid-edge replan retains actual position');
assert.ok(Number.isFinite(s.network.remaining(e)),'exit distance field remains finite');

s=start(1);Game.place('gate',cell(s,-5,5));const compute=s.compute,intel=s.intel;
assert.equal(Game.canPlace('gate',cell(s,5,5)).valid,false,'reject final disconnection');
assert.equal(Game.place('gate',cell(s,5,5)),null);
assert.equal(s.compute,compute);assert.equal(s.intel,intel,'rejected operations cost nothing');

s=start();let wall=Game.place('firewall',cell(s,-7,2));wall.hp=40;
e=Game.spawn('worm','A',cell(s,-7,2));e.hp=e.maxHp=1000;tick(5);
assert.ok(!s.towers.includes(wall),'blocked worm destroys its blocker');

s=start();let gate=Game.place('gate',cell(s,-7,0));gate.hp=70;
e=Game.spawn('flood','A',cell(s,-7,-1));tick(2);
assert.ok(!s.towers.includes(gate));assert.equal(s.network.blocked.has('-7,0'),false,'destroyed node reopens');
assert.ok(s.network.cooldowns.get('-7,0')>0,'re-isolation cooldown');

s=start();let gun=Game.place('interceptor',cell(s,-6,0));
e=Game.spawn('ransom','A',cell(s,-7,0));tick(1.1);
assert.ok(gun.hp<gun.maxHp&&gun.encrypted>0,'ransom attacks platforms and encrypts');
const repair=Game.place('repair',cell(s,-5,1));Game.skill(repair);
assert.equal(gun.encrypted,0);assert.equal(gun.shield,220,'redundancy grants shield and purges');
const damaged=gun.hp;tick(1);assert.ok(gun.hp>damaged,'dedicated repair heals');

s=start();const honey=Game.place('honeypot',cell(s,-7,1));
e=Game.spawn('ransom','A',cell(s,-7,0));Game.damageTower(honey,20,e,true);
assert.equal(honey.encrypted,0,'honeypot encryption immunity');
Game.upgrade(honey,'mirror');const ehp=e.hp;Game.damageTower(honey,20,e);
assert.ok(e.hp<ehp,'mirror branch reflects actual damage');

s=start();gun=Game.place('interceptor',cell(s,-6,0),Math.PI*1.5);
e=Game.spawn('trojan','A',cell(s,-7,0));Game.updateTower(gun,.3);
assert.equal(e.hp,e.maxHp,'interceptor cannot select concealed trojan');
const sandbox=Game.place('sandbox',cell(s,-5,1));Game.updateTower(sandbox,.3);
assert.equal(e.revealed,true,'sandbox detects concealed trojan');
gun.cooldown=0;Game.upgrade(gun,'suppress');Game.updateTower(gun,.3);
assert.ok(e.hp<e.maxHp&&e.slow>0,'suppression branch slows on hit');

s=start();const scanner=Game.place('sandbox',cell(s,-2,1));
e=Game.spawn('trojan','A');Game.skill(scanner);
assert.equal(e.revealed,false);assert.equal(e.scanTime,8,'global scan is temporary');
Game.updateEnemy(e,8.1);assert.equal(e.scanTime,0);assert.equal(e.revealed,false,'unreached concealed target re-hides after scan');

s=start(2);const detector=Game.place('sandbox',cell(s,6,-1));e=Game.spawn('boss2','C',cell(s,5,-2));
Game.updateTower(detector,.1);assert.ok(Game.visible(e),'sandbox detects latent boss');
detector.encrypted=4;Game.updateEnemy(e,.4);assert.equal(Game.visible(e),false,'latent boss needs ongoing detection');
s=start(1);const peak=Game.wavePlan(9).filter(p=>p.time===0);assert.equal(new Set(peak.map(p=>p.entry)).size,3,'flood peak starts all three entrances together');

s=start();const artillery=Game.place('sandbox',cell(s,-2,1));e=Game.spawn('worm','A',cell(s,-3,2));
Game.updateTower(artillery,.3);assert.equal(s.pendingHits.length,1);assert.equal(e.hp,e.maxHp,'bomb damage waits for impact');
Game.tick(.1);assert.equal(e.hp,e.maxHp,'bomb remains in flight');Game.tick(.2);assert.ok(e.hp<e.maxHp,'splash applies at the visible impact');

s=start();e=Game.spawn('worm','A');e.shield=50;let hp=e.hp;
Game.damageEnemy(e,40);assert.equal(e.hp,hp);assert.equal(e.shield,10);
Game.damageEnemy(e,30);assert.equal(e.hp,hp-20,'shield absorbs before HP');

s=start();Game.useItem('isolator',cell(s,-7,0));assert.ok(s.network.blocked.has('-7,0'));
tick(18.2);assert.equal(s.network.blocked.has('-7,0'),false,'isolator expires and reroutes');
Game.useItem('downgrade',cell(s,-7,-2));assert.ok(s.network.slow.size>0);
tick(14.2);assert.equal(s.network.slow.size,0,'temporary protocol restores');

s=start(2);e=Game.spawn('boss2','C',cell(s,5,-2));e.rooted=10;e.abilityCd=100;
Game.scheduleHazard(e,'lock',cell(s,5,0));tick(2.6);
assert.equal(s.hazards.length,1);assert.equal(s.hazards[0].cells.length,2,'boss locks a continuous segment');
assert.ok(s.network.routes.every(Boolean),'boss terrain keeps all sources connected');
assert.equal(Game.canPlace('firewall',cell(s,5,1)).valid,false,'cannot deploy into locked terrain');
tick(13.2);assert.equal(s.hazards.length,0);assert.equal(s.network.blocked.size,0,'all locked cells reopen');

for(let id=0;id<3;id++) {
  s=start(id);s.wave=s.map.waves-1;Game.nextWave();Game.tick(.025);
  assert.ok(s.enemies.some(e=>e.type==='boss'+id),'final wave spawns the domain boss');
  for(const e of [...s.enemies])Game.damageEnemy(e,99999);
  s.spawnQueue=[];Game.tick(.025);assert.equal(s.outcome,'win','final cleanup produces incident report');
  s=start(id);Game.nextWave();s.health=1;e=Game.spawn('worm','A');Game.leak(e);
  assert.equal(s.outcome,'lose','core zero triggers failure');
  s=start(id);assert.equal(s.wave,0);assert.equal(s.enemies.length,0);assert.equal(s.towers.length,0);assert.equal(s.health,100,'restart resets the domain');
}
console.log('Combat regressions passed: continuous rerouting, no-cost rejection, melee, node breakthrough, encryption, repair, branches, shields, items, all final waves, win/lose, restart.');
module.exports={Game,Data};

if(process.argv.includes('--campaign')) {
  for(let id=0;id<3;id++) {
    s=start(id);
    for(let i=0;i<s.network.pads.length;i++) {
      const p=s.network.pads[i];
      const near=[...s.network.cells.values()].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
      const direction=Math.round(Math.atan2(near.x-p.x,-(near.z-p.z))/(Math.PI/2))*Math.PI/2;
      const type=i%5===0?'repair':i%3===0?'sandbox':'interceptor';
      const tower=Game.place(type,p,direction);Game.upgrade(tower,type==='interceptor'?(i%2?'pierce':'suppress'):null);
    }
    Game.nextWave();let frames=0;
    while(!s.outcome&&frames<50000) {
      Game.tick(.05);frames++;
      if(!s.waveActive)Game.nextWave();
      if(frames%200===0)for(const t of s.towers)if(t.skillCd<=0)Game.skill(t);
      for(const e of s.enemies)assert.ok(e.flying||s.network.safePosition(e),'every ground threat retains a route');
    }
    assert.ok(s.outcome,'campaign must settle instead of deadlocking');
    console.log(`${s.map.name}: ${s.outcome} / wave ${s.wave}, kills ${s.kills}, leaks ${s.leaks}, time ${s.time.toFixed(1)}s`);
  }
}
