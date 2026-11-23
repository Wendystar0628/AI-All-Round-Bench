// An ordinary-resource, fully automated playthrough policy. No free builds,
// stat overrides, restored core HP, skipped waves or forced kills are used.
const assert=require('node:assert/strict');
const {Game,Data}=require('./verify-game.cjs');
const N=0,E=Math.PI/2,S=Math.PI,W=Math.PI*1.5;
const plans=[
 [['gate',-7,0],['firewall',-1,2],['sandbox',-2,1],['repair',0,1],['interceptor',2,3,N],['interceptor',0,4,N],['sandbox',-4,-1],['repair',-5,1],['interceptor',-6,0,N],['interceptor',4,0,W],['interceptor',4,-3,W],['sandbox',-3,4],['interceptor',6,3,W],['interceptor',-6,4,N],['interceptor',-6,-4,S],['honeypot',-3,1],['interceptor',-2,-1,N]],
 [['gate',5,0],['firewall',-5,4],['sandbox',-4,2],['repair',-6,2],['interceptor',6,5,N],['interceptor',-4,5,N],['sandbox',-2,2],['repair',6,1],['sandbox',4,-1],['interceptor',-7,0,N],['interceptor',7,2,W],['interceptor',-2,-1,W],['interceptor',1,5,N],['interceptor',7,-4,W],['interceptor',1,-4,S],['interceptor',-7,-4,S],['interceptor',-2,-4,S]],
 [['gate',4,5],['firewall',-4,4],['sandbox',-6,2],['repair',-3,5],['interceptor',3,5,N],['interceptor',-5,4,N],['sandbox',3,3],['interceptor',6,2,N],['repair',6,-1],['sandbox',-6,-1],['interceptor',4,-2,N],['interceptor',2,-2,N],['interceptor',-6,-4,S],['interceptor',0,-4,S],['interceptor',-2,-4,S],['interceptor',7,4,W],['interceptor',7,-4,S]]
];
function cell(s,x,z){return s.network.cells.get(`${x},${z}`)||s.network.pads.find(p=>p.k===`${x},${z}`);}
function policy(s,plan){
 const missing=plan.filter(([type,x,z])=>!s.towers.some(t=>t.cell.k===`${x},${z}`));
 // Keep the core repair/blocking/anti-air structure online before expanding.
 for(const [type,x,z,dir=0] of missing){const c=cell(s,x,z);if(!c)continue;const check=Game.canPlace(type,c);if(check.valid){Game.place(type,c,dir);break;}}
 if(s.wave>=3){const upgrades=s.towers.filter(t=>t.level===1&&!t.isolator).sort((a,b)=>['repair','firewall','sandbox','interceptor','gate','honeypot'].indexOf(a.type)-['repair','firewall','sandbox','interceptor','gate','honeypot'].indexOf(b.type));for(const t of upgrades){const d=Data.towers[t.type],cost=Math.round(d.cost*.75);if(s.compute>=cost+60&&s.intel>=(d.branches?25:12)+20){Game.upgrade(t,t.type==='honeypot'?'mirror':t.type==='interceptor'?'suppress':null);break;}}}
 for(const t of s.towers){const nearby=s.enemies.filter(e=>Math.hypot(e.x-t.cell.x,e.z-t.cell.z)<Math.max(2,t.range));if(t.skillCd<=0&&t.encrypted<=0&&nearby.length){if(t.type!=='repair'||s.towers.some(a=>a.encrypted>0||a.hp<a.maxHp*.8))Game.skill(t);}}
 const critical=s.towers.filter(t=>t.hp<t.maxHp*.42||t.encrypted>0&&['repair','sandbox'].includes(t.type)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
 if(critical&&s.compute>=115&&(s.itemCooldowns.restore||0)<=0)Game.useItem('restore',critical.cell);
 if(s.intel>=65&&(s.itemCooldowns.downgrade||0)<=0){const crowd=s.enemies.filter(e=>!e.flying).sort((a,b)=>a.remaining-b.remaining)[0];if(crowd&&s.enemies.filter(e=>Math.hypot(e.x-crowd.x,e.z-crowd.z)<2.5).length>=6)Game.useItem('downgrade',crowd.cell);}
}
const summaries=[];
for(let mapId=0;mapId<3;mapId++){
 const s=Game.start(mapId),plan=plans[mapId];
 // First deployment costs are paid from the normal 500 compute / 90 intel.
 for(let i=0;i<5;i++)policy(s,plan);
 const opening=s.compute;Game.nextWave();let ticks=0;
 while(!s.outcome&&ticks<42000){Game.tick(.05);ticks++;if(ticks%10===0)policy(s,plan);if(!s.waveActive&&s.nextIn>0&&s.nextIn<12)Game.nextWave();}
 assert.ok(s.outcome,`${s.map.name}: no settlement`);
 assert.ok(s.network.routes.every(Boolean));
 const summary={map:s.map.name,outcome:s.outcome,wave:s.wave,total:s.map.waves,kills:s.kills,leaks:s.leaks,health:s.health,time:+s.time.toFixed(1),towers:s.towers.length,openingComputeLeft:opening};summaries.push(summary);console.log(JSON.stringify(summary));
}
if(process.argv.includes('--require-win'))assert.ok(summaries.every(s=>s.outcome==='win'),'all domains must be winnable with the ordinary-resource policy');
