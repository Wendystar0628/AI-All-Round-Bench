"use strict";
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clockText=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0');
function routesFor(map,closed,slow,ends=map.exits.map(c=>c.id)){
 const d=Array(165).fill(Infinity),next=Array(165).fill(-1),exit=Array(165).fill(-1);
 const open=new Set(map.cells.filter(c=>c.edges.length&&!closed.has(c.id)).map(c=>c.id));
 const weight=id=>map.cells[id].type==='legacy'||slow.has(id)?1.75:1;
 for(const end of ends)if(open.has(end)){d[end]=0;exit[end]=end;}
 while(open.size){
  let closest=-1,best=Infinity;
  for(const id of open){if(d[id]<best){best=d[id];closest=id;}}
  if(closest<0)break;
  open.delete(closest);
  for(const n of map.cells[closest].edges){
   const value=best+(weight(n)+weight(closest))*.5;
   if(open.has(n)&&value<d[n]){d[n]=value;next[n]=closest;exit[n]=exit[closest];}
  }
 }
 return {d,next,exit,weight};
}
function routePath(t,id){
 const path=[id];
 while(t.next[id]>=0&&path.length<166){id=t.next[id];path.push(id);}
 return path;
}
class Battle{
 constructor(map){
  this.map=map;this.time=0;this.wave=0;this.active=false;this.autoAt=0;this.ended=null;this.paused=false;this.speed=1;
  this.cpu=420;this.intel=6;this.core=24;this.capCore=24;this.towers=new Map();this.isolators=new Map();this.downs=new Map();this.holes=new Map();this.locks=new Map();
  this.enemies=[];this.queue=[];this.logs=[];this.effects=[];this.cooldowns={};this.warning=null;this.uid=0;this.routeVersion=0;this.lastChange=-100;this.lastChanged=[];this.jobs=[];this.notice=null;
  this.stats={kills:0,leaks:0,changes:0,built:0,lost:0,healed:0};
  this.breachByRoute=map.entries.map(()=>map.exits.map(()=>0));this.coreHits=new Map();this.seen=new Set();this.income=0;
  this.recompute(false);
  for(const [type,x,z,dir] of map.starters)this.addTower(type,key(x,z),dir??0);
  this.log('入口链路探测完成，业务连通正常。','good');
  this.log('预置设备在线，等待发起第一波防御。');
 }
 get closed(){return new Set([...this.holes.keys(),...this.isolators.keys(),...this.map.nodes.filter(c=>this.towers.has(c.id)).map(c=>c.id)]);}
 get slow(){return new Set(this.downs.keys());}
 log(text,kind='',cell=null){
  const serial=this.logVersion=(this.logVersion||0)+1;
  this.logs.unshift({text,time:this.time,kind,cell,serial});
  if(this.logs.length>32)this.logs.pop();
 }
 effect(kind,a,b=a,opts={}){
  this.effectVersion=(this.effectVersion||0)+1;
  this.effects.push({kind,from:{x:a.x,z:a.z,y:a.y??(a.type&&TOWERS[a.type]?1.04:.4)},to:{x:b.x,z:b.z,y:b.y??(b.type&&TOWERS[b.type]?1.04:.4)},at:this.time,dur:.46,...opts});
 }
 recompute(report=true){
  const former=this.route;this.route=routesFor(this.map,this.closed,this.slow);this.routeVersion++;this.localRoutes=new Map();
  this.routeUsers=new Map();
  const changed=[];
  for(const c of this.map.entries){
   const path=routePath(this.route,c.id);
   for(const id of path){
    if(!this.routeUsers.has(id))this.routeUsers.set(id,[]);
    this.routeUsers.get(id).push(c.letter);
   }
   if(former&&routePath(former,c.id).join()!==path.join())changed.push(c);
  }
  if(report){
   this.lastChange=this.time; this.lastChanged=changed.map(c=>c.letter);
   if(changed.length){this.stats.changes++;this.log(changed.map(c=>c.letter+' → '+this.map.cells[this.route.exit[c.id]].letter).join(' / ')+' 路由重新收敛。','good');}
   for(const e of this.enemies)if(!e.spec.air){
    e.seek=null;e.seekAt=this.time;e.lure=null;
    if(e.block!==null&&!this.towers.has(e.block))e.block=null;
   }
   this.onSound?.('route');
  }
 }
 groundChoice(e,table){
  if(e.to===null||e.to===e.at)return table.d[e.at]<Infinity?e.at:-1;
  const a=this.map.cells[e.at],b=this.map.cells[e.to],weight=(table.weight(a.id)+table.weight(b.id))*.5;
  const ca=table.d[a.id]+dist(e,a)*weight, cb=table.d[b.id]+dist(e,b)*weight;
  if(!Number.isFinite(Math.min(ca,cb)))return -1;
  return ca+.00001<cb?a.id:b.id;
 }
 preview(ids=[],slow=[],opening=[]){
  const closed=this.closed;
  for(const id of opening)closed.delete(id);
  for(const id of ids)closed.add(id);
  const table=routesFor(this.map,closed,new Set([...this.slow,...slow]));
  const bad=new Set();
  for(const c of this.map.entries)if(!Number.isFinite(table.d[c.id]))bad.add(c.id);
  for(const e of this.enemies){
   if(e.dead||e.spec.air)continue;
   const cell=key(Math.round(e.x),Math.round(e.z));
   if(ids.includes(cell)||this.groundChoice(e,table)<0)bad.add(cell);
  }
  const changed=[],weighted=[];
  for(const c of this.map.entries){
   if(routePath(table,c.id).join()!==routePath(this.route,c.id).join())changed.push(c.letter);
   else if(Math.abs(table.d[c.id]-this.route.d[c.id])>.00001)weighted.push(c.letter);
  }
  return {table,ok:bad.size===0,bad:[...bad],changed,weighted};
 }
 affected(id,r){
  const center=this.map.cells[id];return this.map.cells.filter(c=>['link','legacy','node'].includes(c.type)&&dist(center,c)<=r).map(c=>c.id);
 }
 addTower(type,id,dir){
  const c=this.map.cells[id],d=TOWERS[type];
  const t={type,id,uid:++this.uid,x:c.x,z:c.z,y:c.type==='platform'?1.05:.69,hp:d.hp,max:d.hp,dir,lv:1,branch:-1,shield:0,enc:0,skillAt:0,fireAt:0,hit:-10,action:-10};
  this.towers.set(id,t);return t;
 }
 expense(selection,id){
  const [mode,type]=selection.split(':');
  if(mode==='tower')return {cpu:TOWERS[type].cpu,intel:this.map.cells[id]?.type==='node'?1:0};
  if(mode==='item'){
   const d=ITEMS[type];return {cpu:d.res==='cpu'?d.cost:0,intel:d.res==='intel'?d.cost:0};
  }
  return {cpu:0,intel:0};
 }
 validate(selection,id){
  const c=this.map.cells[id];if(!c)return {ok:false,why:'请选择地图格点。'};
  const [mode,type]=selection.split(':');const t=this.towers.get(id);
  if(mode==='remove'){
   if(!t||String(t.uid)!==type)return {ok:false,why:'该设备已离线。'};
   return {ok:true,p:this.preview([],[],[id]),area:[],why:''};
  }
  const d=mode==='tower'?TOWERS[type]:ITEMS[type],cost=this.expense(selection,id);
  let why='',p=null,area=[];
  if(mode==='tower'){
   const allowed={firewall:['node','link','legacy'],honey:['link','legacy'],gate:['node']};
   if(!(allowed[type]||['platform']).includes(c.type))why='该设备无法部署在此类地块。';
   else if(t||this.isolators.has(id)||this.holes.has(id))why='此位置已占用。';
   else if(c.type==='node'&&this.locks.get(id)>this.time)why='节点旁路冷却中，剩余 '+Math.ceil(this.locks.get(id)-this.time)+' 秒。';
   else if(this.cpu<cost.cpu||this.intel<cost.intel)why='算力或情报不足。';
   if(c.type==='node'&&!this.closed.has(id)&&['firewall','gate'].includes(type))p=this.preview([id]);
  }else{
   if(this.time<(this.cooldowns[type]||0))why='道具冷却中。';
   else if(this.cpu<cost.cpu||this.intel<cost.intel)why='资源不足。';
   else if(type==='backup'&&!t)why='请选择一座已部署的塔。';
   else if(type==='isolate'&&(c.type!=='node'||this.closed.has(id)))why='请选择直通的交换节点。';
   else if(type==='isolate'&&this.locks.get(id)>this.time)why='节点旁路冷却中，剩余 '+Math.ceil(this.locks.get(id)-this.time)+' 秒。';
   else if(type==='downgrade'&&!['link','node','legacy'].includes(c.type))why='请选择链路或交换节点。';
   if(type==='isolate'&&c.type==='node'&&!this.closed.has(id))p=this.preview([id]);
   if(type==='downgrade'&&['link','node','legacy'].includes(c.type)){area=this.affected(id,d.r);p=this.preview([],area);}
  }
  if(p&&!p.ok)why='操作将封死入口或在场敌人。';
  return {ok:!why,why,p,area,cost};
 }
 place(selection,id,dir=0){
  const validation=this.validate(selection,id);if(!validation.ok)return validation;
  const c=this.map.cells[id],[mode,type]=selection.split(':');
  if(mode==='remove'){this.remove(id);return {ok:true};}
  this.cpu-=validation.cost.cpu;this.intel-=validation.cost.intel;
  if(mode==='tower'){
   const d=TOWERS[type];this.stats.built++;
   this.addTower(type,id,dir);
   if(c.type==='node')this.recompute();
   this.effect('place',c,c,{color:d.color,dur:.73});this.log(d.name+' 已部署至 '+(c.name||('X'+c.x+' / Z'+c.z))+'。','good',id);
  }else{
   const d=ITEMS[type];this.cooldowns[type]=this.time+d.cd;
   if(type==='isolate'){this.isolators.set(id,{id,x:c.x,z:c.z,y:.62,hp:130,max:130,until:this.time+d.dur,shield:0});this.recompute();}
   if(type==='downgrade'){for(const at of validation.area)this.downs.set(at,this.time+d.dur);this.recompute();}
   if(type==='backup'){const t=this.towers.get(id);this.heal(t,t.max*.55);t.enc=0;this.effect('heal',t,t,{color:'#a6fbe1',dur:.72});}
   this.effect('pulse',c,c,{color:'#b5a0ff',radius:d.r||.65,dur:.85});
   this.log('应急道具 '+d.name+' 已执行。','good',id);
  }
  this.onSound?.(mode==='tower'?'deploy':type,c);return {ok:true};
 }
 refund(t){return Math.floor(TOWERS[t.type].cpu*.44)+(t.lv===2?28:0);}
 remove(id,broken=false,recalculate=true){
  const tower=this.towers.get(id),isolator=this.isolators.get(id),c=this.map.cells[id];
  if(!tower&&!isolator)return;
  this.towers.delete(id);this.isolators.delete(id);
  for(const e of this.enemies){
   if(e.block===id)e.block=null;
   if(e.lure===id)e.lure=null;
  }
  if(tower&&!broken)this.cpu+=this.refund(tower);
  if(broken)this.onSound?.('destroy',c);
  if(tower&&broken){this.stats.lost++;this.effect('burst',tower,tower,{color:'#ff8957',radius:.94,dur:.8,model:tower});}
  if(isolator){
   if(broken)this.effect('burst',isolator,isolator,{color:'#ff9077',radius:.76,dur:.75});
   this.log(c.name+' · 应急隔离器'+(broken?'已被冲毁。':'已到期。'),broken?'danger':'alert',id);
  }
  if(c.type==='node'){
   this.locks.set(id,this.time+7);
   this.effect('place',c,c,{dur:.86,color:'#55e8c2'});this.log(c.name+' · 设备旁路直通。','alert',id);
   if(recalculate)this.recompute();
  }
  if(tower)this.log(TOWERS[tower.type].name+(broken?' 已被摧毁。':' 已撤下，算力已回收。'),broken?'danger':'',id);
 }
 upgrade(t,branch=0){
  if(!t||this.towers.get(t.id)!==t)return '设备已离线。';
  if(t.lv===2)return '设备已满级。';
  const d=TOWERS[t.type],cost=this.upgradeCost(t);
  if(d.branches&&!d.branches[branch])return '???????????';
  if(this.cpu<cost||d.branches&&this.intel<2)return '升级资源不足。';
  this.cpu-=cost;if(d.branches)this.intel-=2;
  t.lv=2;t.branch=d.branches?branch:-1;
  const stats=deviceProfile(t.type,t.lv,t.branch);
  t.max=stats.max;this.heal(t,t.max-d.hp+24);
  if(t.type==='gate')t.shield=stats.shield;
  this.log(d.name+' 已升级'+(d.branches?' · '+d.branches[branch][0]:'')+'。','good',t.id);
  this.effect('place',t,t,{color:d.color,dur:1});this.onSound?.('deploy',t);return '';
 }
 upgradeCost(t){return Math.round(TOWERS[t.type].cpu*.72+23);}
 blockingReach(type,id){
  return type==='honey'?.61:this.map.cells[id].type==='node'?1.15:.52;
 }
 radius(t){
  if(t.type==='firewall')return this.blockingReach(t.type,t.id);
  return deviceProfile(t.type,t.lv,t.branch).radius;
 }
 skillTargets(t){
  const radius=this.radius(t);
  if(t.type==='repair')return [...this.towers.values()].filter(ally=>ally!==t&&dist(ally,t)<=radius);
  if(t.type==='honey')return this.enemies.filter(e=>!e.dead&&(e.block===t.id||e.lure===t.id&&dist(e,t)<=radius));
  return [];
 }
 skill(t){
  if(!t||this.towers.get(t.id)!==t||!TOWERS[t.type].skill)return '此设备无可用的主动技能。';
  if(t.enc>this.time)return '设备被加密，技能离线。';
  if(t.skillAt>this.time)return '技能冷却中。';
  const stats=deviceProfile(t.type,t.lv,t.branch),r=stats.radius,targets=this.skillTargets(t);
  if(!targets.length)return t.type==='repair'?'支援范围内没有其他设备。':'诱引范围内没有可困住的威胁。';
  t.skillAt=this.time+stats.skillCd;t.action=this.time;
  this.effect('pulse',t,t,{color:TOWERS[t.type].color,radius:r,dur:.85});
  if(t.type==='repair'){
   for(const ally of targets){
    ally.enc=0;ally.shield=Math.max(ally.shield,stats.shield);this.heal(ally,stats.burst);
    this.effect('heal',t,ally,{color:'#71ffc3',dur:.7});
   }
  }else for(const e of targets){
   e.root=this.time+stats.trap;
   this.effect('tether',t,e,{color:TOWERS[t.type].color,dur:.72});
   if(stats.trapDamage){this.absorbShield(e,e.shield);this.damageEnemy(e,stats.trapDamage);}
  }
  const count=targets.length+(t.type==='repair'?' 座友塔':' 个威胁');
  this.log(TOWERS[t.type].skill+' 已执行 · '+count+'。','good',t.id);this.onSound?.(t.type==='repair'?'skill':'trap',t);return '';
 }
 heal(t,amt){const add=Math.max(0,Math.min(t.max-t.hp,amt));t.hp+=add;this.stats.healed+=add;}
 start(){
  if(this.active||this.ended)return false;
  if(this.wave>=this.map.waves)return false;
  this.wave++;this.active=true;this.autoAt=0;this.waveAt=this.time;this.queue=wavePlan(this.map,this.wave);
  const brief=waveBrief(this.map,this.wave);
  this.log('第 '+String(this.wave).padStart(2,'0')+' 波 · '+brief.name+'。',brief.alert?'danger':'alert');
  this.onSound?.('wave');return true;
 }
 airExit(origin){
  return this.map.exits.reduce((best,c)=>dist(origin,c)<dist(origin,best)?c:best);
 }
 spawn(type,entry,at=this.map.entries[entry].id,opts={}){
  const spec=ENEMIES[type],c=this.map.cells[at],boss=spec.boss;
  const max=spec.hp*(boss?1:1+Math.max(0,this.wave-1)*.024);
  const e={uid:++this.uid,type,spec,entry,at,to:null,x:c.x,z:c.z,y:spec.air?1.65:.45,hp:max,max,shield:0,seen:!spec.stealth,
   clone:false,dead:false,phase:1,fireAt:this.time+.6,specialAt:this.time+(boss?3:1),hit:-10,action:-10,dir:0,block:null,lure:null,root:0,slowed:0,...opts};
  e.dest=spec.air?this.airExit(e).id:null;
  this.enemies.push(e);
  if(!this.seen.has(type)){this.seen.add(type);this.log((boss?'BOSS 接入 · ':'威胁已识别 · ')+spec.name,boss?'danger':'alert',at);if(boss){
   this.notice={title:spec.name,tag:'首领签名已确认',at:this.time,dur:2.45,color:spec.color};
   this.effect('pulse',e,e,{color:spec.color,radius:1.8,dur:1.08});this.onSound?.('boss',e);
  }else this.onSound?.('identify',e);}
  return e;
 }
 absorbShield(unit,amount){
  const absorbed=Math.min(unit.shield,amount);
  if(!absorbed)return 0;
  unit.shield-=absorbed;
  const broken=unit.shield<=0;
  this.effect(broken?'shield-break':'shield-hit',unit,unit,{
   color:unit.spec?'#ffe293':'#84f5d5',radius:unit.spec?.boss?.62:.38,dur:broken?.48:.28
  });
  if(broken)this.onSound?.('shieldBreak',unit);
  return absorbed;
 }
 damageTower(t,amount,source,encrypt=false){
  if(!t||t.hp<=0)return;
  const absorbed=this.absorbShield(t,amount),lost=Math.min(t.hp,amount-absorbed);
  t.hp-=amount-absorbed;
  if(lost)t.hit=this.time;
  t.contactAt=this.time;
  const delta=Math.ceil(lost||absorbed);
  if(delta)this.effect('integrity',t,t,{color:lost?'#ff9a7e':'#ffd48e',delta,shielded:!lost,dur:.67});
  if(encrypt&&t.type&&t.type!=='honey'){t.enc=this.time+4.5;this.effect('pulse',t,t,{color:'#ca8fff',radius:.67,dur:.52});}
  if(lost)this.effect('impact',t,t,{color:encrypt?'#d991ff':'#ff9868',radius:.35});
  if(t.hp<=0)this.remove(t.id,true);
 }
 reveal(e,source,color){
  if(e.dead||e.seen)return;
  e.seen=true;e.revealAt=this.time;e.revealBy=source;
  this.effect('pulse',e,e,{color,radius:.66,dur:.65});
  if(e.spec.boss&&source==='sandbox')this.log(e.spec.name+' · 潜伏签名已揭示。','good',e.at);
  this.onSound?.('detect',e);
 }
 damageEnemy(e,amount){
  if(e.dead)return;
  if(e.type==='shadow'&&e.phase>=2)amount*=.78;
  const absorbed=this.absorbShield(e,amount),damage=amount-absorbed;
  e.hp-=damage;
  if(damage){
   e.hit=this.time;
   this.effect('impact',e,e,{color:e.spec.color,radius:.29,dur:.27});
  }
  if(e.hp>0)return;
  e.dead=true;this.stats.kills++;this.cpu+=e.spec.cost;this.intel+=e.spec.intel||0;
  if(e.type==='trojan'&&!e.seen){
   for(const t of [...this.towers.values()])if(dist(t,e)<1.45)this.damageTower(t,33,e);
   this.effect('pulse',e,e,{color:'#ef79ec',radius:1.45,dur:.62});
  }
  this.effect('burst',e,e,{color:e.spec.color,radius:e.spec.boss?1.8:.65,dur:e.spec.boss?1.1:.65,model:e});
  if(e.spec.boss)this.log(e.spec.name+' 已被清除。','good',e.at);
 }
 leak(e,exitId=e.at){
  e.dead=true;const n=e.spec.boss?7:e.type==='flood'?2:1;this.core=Math.max(0,this.core-n);this.stats.leaks++;
  const exit=this.map.cells[exitId],entry=this.map.entries[e.entry];
  if(exit?.exit!==undefined){this.breachByRoute[e.entry][exit.exit]++;this.coreHits.set(exit.id,this.time);}
  const route=entry&&exit?.letter?' · '+entry.letter+' → '+exit.letter:'';
  this.log(e.spec.name+' 突破'+route+'，完整度 −'+n+'。','danger',exitId);
  this.effect('pulse',exit||e,exit||e,{color:'#ff6955',radius:1.08,dur:.8});this.onSound?.('breach',exit||e);
  if(!this.core)this.end(false);
 }
 end(win){this.ended=win?'win':'loss';this.active=false;this.log(win?'事件已封存 · 所有入侵波次处理完毕。':'中枢完整度归零 · 网络防御失效。',win?'good':'danger');this.onSound?.(win?'victory':'defeat');}
 availableBlock(t,e){
  const cap=deviceProfile(t.type,t.lv,t.branch).cap;
  let used=0;
  for(const other of this.enemies)if(other!==e&&!other.dead&&other.block===t.id)used+=other.spec.mass||1;
  return used+(e.spec.mass||1)<=cap;
 }
 blockTarget(e){
  if(e.spec.air)return null;
  for(const t of this.towers.values()){
   if(!TOWERS[t.type].cap)continue;
   const onNode=this.map.cells[t.id].type==='node';
   const reach=this.blockingReach(t.type,t.id);
   if(onNode&&!this.map.cells[t.id].edges.includes(key(Math.round(e.x),Math.round(e.z))))continue;
   if(dist(e,t)<reach&&this.availableBlock(t,e))return t;
  }
  return null;
 }
  pursue(e){
  const options=[...this.isolators.values(),...this.towers.values()].filter(t=>this.map.cells[t.id].type==='node'&&dist(e,t)<3.3);
  options.sort((a,b)=>dist(e,a)-dist(e,b));
  for(const target of options){
   const ends=this.map.cells[target.id].edges.filter(id=>!this.closed.has(id));
   if(!this.localRoutes.has(target.id))this.localRoutes.set(target.id,routesFor(this.map,this.closed,this.slow,ends));
   const seek=this.localRoutes.get(target.id);
   const from=this.groundChoice(e,seek);
   if(from>=0&&seek.d[from]<4.5)return {target,route:seek};
  }
  return null;
 }
 updateEnemy(e,dt){
  if(e.dead)return;
  const spec=e.spec;let table=this.route, factor=e.slowed>this.time?SUPPRESSION_SPEED:1;
  if(spec.boss)this.boss(e);
  if(e.type==='shell'&&e.specialAt<=this.time){
   e.specialAt=this.time+3.8;e.action=this.time;
   const escorts=this.enemies.filter(a=>a!==e&&!a.dead&&dist(a,e)<1.75);
   for(const a of escorts){a.shield=Math.max(a.shield,26);this.effect('heal',e,a,{color:'#f4ce67',dur:.6});}
   if(escorts.length)this.onSound?.('shield',e);
  }
  if(e.type==='ransom'&&e.fireAt<=this.time){
   const targets=[...this.towers.values()].filter(t=>dist(t,e)<=3.05).sort((a,b)=>Number(b.type==='honey')-Number(a.type==='honey')||dist(a,e)-dist(b,e));
   if(targets.length){
    const target=targets[0];e.fireAt=this.time+2.25;e.action=this.time;
    e.attackBearing=Math.atan2(target.x-e.x,target.z-e.z);
    const launch={x:e.x+Math.sin(e.attackBearing)*.24,z:e.z+Math.cos(e.attackBearing)*.24,y:e.y+.08};
    this.effect('ransom',launch,target,{color:'#e192ff',dur:.41});
    this.damageTower(target,spec.damage,e,true);this.onSound?.('ransom',launch);
   }
  }
  if(spec.air){
   const end=this.map.cells[e.dest],d=dist(e,end),step=dt*spec.s*factor;
   if(d<=step){this.leak(e,e.dest);return;}
   facing(e,Math.atan2(end.x-e.x,end.z-e.z),this.time);e.x+=(end.x-e.x)*step/d;e.z+=(end.z-e.z)*step/d;return;
  }
  if(e.type==='trojan'&&this.route.weight(key(Math.round(e.x),Math.round(e.z)))>1)this.reveal(e,'protocol','#e8af72');
  if((e.type==='flood'||e.type==='legion')&&(e.seekAt??0)<=this.time){e.seek=this.pursue(e);e.seekAt=this.time+.28;}
  const objective=e.seek?.target;
  if(objective&&objective.hp>0){
   table=e.seek.route;
   if(dist(e,objective)<=1.13&&this.map.cells[objective.id].edges.includes(key(Math.round(e.x),Math.round(e.z)))){e.block=null;this.enemyHit(e,objective,1.03);return;}
  }
  const block=this.blockTarget(e);
  e.block=block?.id??null;
  if(block){
   if(e.type==='trojan')this.reveal(e,'block','#ffc18c');
   if(spec.damage)this.enemyHit(e,block,.92);
   return;
  }
  if(e.root>this.time)return;
  let lure=null;
  if(spec.damage&&!spec.boss&&e.type!=='flood'){
   for(const t of this.towers.values())if(t.type==='honey'&&dist(e,t)<=this.radius(t)&&this.availableBlock(t,e)){
    const lookup='h'+t.id;
    if(!this.localRoutes.has(lookup))this.localRoutes.set(lookup,routesFor(this.map,this.closed,this.slow,[t.id]));
    const candidate=this.localRoutes.get(lookup),from=this.groundChoice(e,candidate);
    if(from>=0&&candidate.d[from]<=this.radius(t)+.75){lure=t.id;table=candidate;break;}
   }
  }
  e.lure=lure;
  const a=this.map.cells[e.at];
  if(e.to!==null){
   const chosen=this.groundChoice(e,table);
   if(chosen===e.at){const previous=e.to;e.to=e.at;e.at=previous;}
  }else{
   const towards=table.next[e.at];
   if(towards<0){if(a.type==='exit'&&!objective&&lure===null)this.leak(e);return;}
   e.to=towards;
  }
  const target=this.map.cells[e.to],d=dist(e,target);
  const step=dt*spec.s*factor/(this.route.weight(e.at)+this.route.weight(e.to))*2;
  if(d>.001)facing(e,Math.atan2(target.x-e.x,target.z-e.z),this.time);
  if(d>step){e.x+=(target.x-e.x)*step/d;e.z+=(target.z-e.z)*step/d;return;}
  e.x=target.x;e.z=target.z;e.at=e.to;e.to=null;
  if(e.type==='worm'&&!e.clone&&target.type==='node'&&!this.closed.has(target.id)){
   e.clone=true;this.spawn('worm',e.entry,e.at,{clone:true,hp:e.max*.68});this.effect('place',e,e,{color:spec.color,dur:.58});
  }
  if(target.type==='exit')this.leak(e,target.id);
 }
 enemyHit(e,t,cadence){
  facing(e,Math.atan2(t.x-e.x,t.z-e.z),this.time);
  if(e.fireAt>this.time)return;
  e.fireAt=this.time+cadence;e.action=this.time;
  this.effect(e.type==='flood'||e.type==='legion'?'shock':'melee',e,t,{color:e.spec.color,dur:.36});
  this.damageTower(t,e.spec.damage,e);
  this.onSound?.(e.type==='flood'||e.type==='legion'?'slam':'melee',e);
 }
 gunArc(t,target,near=dist(t,target)){
  const angle=t.dir*Math.PI/180;
  return near<.15||((target.x-t.x)*Math.sin(angle)+(target.z-t.z)*Math.cos(angle))/near>=.12;
 }
 laneReport(index,table=this.route){
  const inlet=this.map.entries[index],path=routePath(table,inlet.id);
  const routeCells=path.slice(1,-1).map(id=>this.map.cells[id]);
  const weapons=[...this.towers.values()].filter(t=>t.enc<=this.time&&['gun','sandbox'].includes(t.type));
  const covered=new Set();
  for(const c of routeCells){
   if(weapons.some(t=>{
    const near=dist(t,c);
    return near<=this.radius(t)&&(t.type==='sandbox'||this.gunArc(t,c,near));
   }))covered.add(c.id);
  }
  return {inlet,exit:this.map.cells[table.exit[inlet.id]],routeCells,covered,length:path.length-1,weight:table.d[inlet.id]};
 }
 towerTick(t){
  if(t.enc>this.time)return;
  const d=TOWERS[t.type],stats=deviceProfile(t.type,t.lv,t.branch),r=this.radius(t);
  if(t.type==='sandbox')for(const e of this.enemies)if(!e.dead&&!e.seen&&dist(e,t)<=r){
   this.reveal(e,'sandbox',d.color);
  }
  if(t.fireAt>this.time)return;
  if(t.type==='repair'){
   const targets=[...this.towers.values()].filter(a=>a!==t&&dist(a,t)<=r&&a.hp<a.max-.1).sort((a,b)=>a.hp/a.max-b.hp/b.max).slice(0,stats.targets);
   if(targets.length){
    t.fireAt=this.time+stats.interval;t.action=this.time;
    for(const a of targets){this.heal(a,stats.repair);this.effect('heal',t,a,{color:d.color,dur:.48});}
    this.onSound?.('heal',t);
   }
   return;
  }
  if(t.type==='gate'||t.type==='honey')return;
  const targets=this.enemies.filter(e=>{
   if(e.dead)return false;
   if(t.type==='firewall')return e.block===t.id;
   if(dist(e,t)>r)return false;
   if(t.type==='sandbox')return !e.spec.air;
   if(!e.seen)return false;
   return this.gunArc(t,e);
  }).sort((a,b)=>this.remaining(a)-this.remaining(b)||a.uid-b.uid);
  if(!targets.length)return;
  const e=targets[0];t.action=this.time;t.aim=Math.atan2(e.x-t.x,e.z-t.z);t.target=e.uid;
  if(t.type==='gun'){
   t.fireAt=this.time+stats.interval;
   const muzzle={x:t.x+Math.sin(t.aim)*.52,y:t.y+.115,z:t.z+Math.cos(t.aim)*.52};
   this.effect('shot',muzzle,e,{color:d.color,dur:.39});this.damageEnemy(e,stats.damage);
   if(stats.slow)e.slowed=this.time+stats.slow;
   if(stats.pierce){
    const len=dist(t,e)||1,dx=(e.x-t.x)/len,dz=(e.z-t.z)/len;
    for(const other of this.enemies){
     if(other===e||other.dead||other.spec.air!==e.spec.air)continue;
     const ox=other.x-t.x,oz=other.z-t.z,along=ox*dx+oz*dz;
     if(along>.25&&dist(t,other)<=r&&Math.abs(ox*dz-oz*dx)<.44){
      this.damageEnemy(other,stats.pierce);this.effect('shot',muzzle,other,{color:'#d9bbff',dur:.34});
     }
    }
   }
   this.onSound?.('gun',muzzle);
  }else if(t.type==='sandbox'){
   const impact={x:e.x,y:e.y,z:e.z};
   t.fireAt=this.time+stats.interval;
   this.effect('shell',{x:t.x,y:t.y+.16,z:t.z},impact,{color:d.color,dur:stats.flight,radius:stats.blast});
   this.onSound?.('shellLaunch',t);
   this.jobs.push({time:this.time+stats.flight,run:()=>{
    this.effect('pulse',impact,impact,{color:d.color,radius:stats.blast,dur:.63});
    this.onSound?.('sandbox',impact);
    for(const other of this.enemies)if(!other.dead&&!other.spec.air&&dist(other,impact)<stats.blast)this.damageEnemy(other,stats.damage);
   }});
  }else{
   t.fireAt=this.time+stats.interval;this.damageEnemy(e,stats.damage);
   this.effect('melee',t,e,{color:d.color,dur:.34});
  }
 }
 enemyTrail(e){
  if(e.spec.air)return [e,this.map.cells[e.dest]];
  const target=e.seek?.target;
  const lure=e.lure!==null&&this.towers.has(e.lure)?this.localRoutes.get('h'+e.lure):null;
  const table=target?.hp>0?e.seek.route:lure||this.route;
  const start=this.groundChoice(e,table);
  return start<0?[e]:[e,...routePath(table,start).map(id=>this.map.cells[id])];
 }
 remaining(e){
  if(e.spec.air)return dist(e,this.map.cells[e.dest]);
  const where=this.groundChoice(e,this.route);
  if(where<0)return Infinity;
  const weight=e.to===null?1:(this.route.weight(e.at)+this.route.weight(e.to))*.5;
  return this.route.d[where]+dist(e,this.map.cells[where])*weight;
 }
 pickClosure(e,preferred){
  const sorted=this.map.cells.filter(c=>['link','legacy'].includes(c.type)&&!this.closed.has(c.id)&&!this.towers.has(c.id)&&dist(e,c)>1.15).sort((a,b)=>dist(a,e)-dist(b,e));
  const pool=preferred?[...preferred,...sorted.map(c=>c.id)]:
   [...routePath(this.route,this.groundChoice(e,this.route)).slice(2,7),...sorted.map(c=>c.id)];
  for(const id of pool){
   const c=this.map.cells[id];if(!c||!['link','legacy'].includes(c.type)||this.closed.has(id)||this.towers.has(id))continue;
   const p=this.preview([id]);
   if(!p.ok||!p.changed.length)continue;
   if(e.type==='shadow'){
    const forward=this.route.next[id];
    const neighbours=c.edges.slice().sort((a,b)=>Number(b===forward)-Number(a===forward));
    for(const n of neighbours){
     if(!['link','legacy'].includes(this.map.cells[n].type)||this.closed.has(n))continue;
     if(this.preview([id,n]).ok)return [id,n];
    }
   }
   return [id];
  }
  return null;
 }
 warnClosure(e,preferred){
  const ids=this.pickClosure(e,preferred);if(!ids)return false;
  this.warning={id:ids[0],ids,until:this.time+1.7,boss:e.type,src:e,preferred};this.log(ENEMIES[e.type].name+' · '+(e.type==='mirage'?'伪路由黑洞':'运维环锁死')+'预警。','danger',ids[0]);this.onSound?.('boss',this.map.cells[ids[0]]);return true;
 }
 shearShields(e){
  for(const t of this.towers.values()){
   if(dist(t,e)>=3.9||!t.shield)continue;
   this.effect('integrity',t,t,{delta:Math.ceil(t.shield),shielded:true,color:'#caa3ff',dur:.7});
   this.absorbShield(t,t.shield);
  }
  this.effect('pulse',e,e,{color:e.spec.color,radius:3.9,dur:1});
 }
 nearbyOpenCell(e){
  const id=this.groundChoice(e,this.route);
  if(id>=0&&this.map.cells[id].type!=='exit')return id;
  let closest=this.map.entries[e.entry],distance=Infinity;
  for(const c of this.map.cells){
   if(c.type==='exit'||!Number.isFinite(this.route.d[c.id]))continue;
   const value=dist(e,c);
   if(value<distance){distance=value;closest=c;}
  }
  return closest.id;
 }
 bossAlert(e,tag){
  this.notice={title:e.spec.name,tag,at:this.time,dur:1.85,color:e.spec.color};
 }
 boss(e){
  const p=e.hp/e.max;
  if(e.type==='legion'){
   if(e.phase===1&&p<.57){
    e.phase=2;e.action=this.time;
    this.log('万傀进入第二阶 · 群控复制。','danger',e.at);this.bossAlert(e,'第 II 阶段 · 群控复制');
    this.effect('pulse',e,e,{color:e.spec.color,radius:2.4,dur:1});
    for(let i=0;i<3;i++)this.jobs.push({time:this.time+.45+i*.30,run:()=>this.spawn('worm',e.entry,this.nearbyOpenCell(e),{clone:true})});
    this.onSound?.('boss',e);
   }
   if(e.surge&&this.time>=e.surge.until){
    const surge=e.surge;e.surge=null;e.action=this.time;
    for(const id of surge.targets){
     const t=this.towers.get(id)||this.isolators.get(id);
     if(t){this.effect('shock',e,t,{color:e.spec.color,dur:.8});this.damageTower(t,t.type?90:180,e);}
    }
    if(e.phase===2)for(let i=0;i<3;i++)this.jobs.push({time:this.time+i*.38,run:()=>this.spawn('worm',e.entry,this.nearbyOpenCell(e),{clone:true})});
   }
   if(this.time>=e.specialAt){
    e.specialAt=this.time+(e.phase===2?5.3:7.5);
    const targets=[...this.isolators.values(),...this.towers.values()].filter(t=>this.map.cells[t.id].type==='node'&&dist(t,e)<=5).map(t=>t.id);
    e.surge={targets,until:this.time+1.25};
    if(targets.length){
     this.log('万傀 · 洪峰冲击预警。','danger',targets[0]);
     this.onSound?.('boss',e);
     for(const id of targets){const c=this.map.cells[id];this.effect('pulse',c,c,{color:'#ff695d',radius:.52,dur:1.25});}
    }
   }
  }
  if(e.type==='mirage'){
   if(e.phase===1&&p<.55){
    e.phase=2;e.action=this.time;
    this.log('蜃楼进入第二阶 · 路由风暴。','danger',e.at);this.bossAlert(e,'第 II 阶段 · 路由风暴');
    this.shearShields(e);this.onSound?.('boss',e);
   }
   if(this.time>=e.specialAt&&!this.warning&&(e.casts||0)<4){
    e.specialAt=this.time+15.4;
    if(this.warnClosure(e))e.casts=(e.casts||0)+1;
    if(e.phase===2)this.shearShields(e);
   }
  }
  if(e.type==='shadow'){
   if(e.phase===1&&p<.73){
    e.phase=2;this.reveal(e,'escalation',e.spec.color);this.log('蛰影 · 提权完成，强化护甲。','danger',e.at);this.bossAlert(e,'第 II 阶段 · 提权');this.onSound?.('boss',e);
    for(let i=0;i<3;i++)this.jobs.push({time:this.time+.42+i*.45,run:()=>this.spawn('trojan',e.entry,this.nearbyOpenCell(e))});
   }
   if(e.phase===2&&p<.43){
    e.phase=3;this.log('蛰影 · 转入破坏阶段。','danger',e.at);
    this.bossAlert(e,'第 III 阶段 · 区段封锁');e.specialAt=this.time;
   }
   if(e.phase===3&&e.specialAt<=this.time&&!this.warning&&(e.casts||0)<3){
    e.specialAt=this.time+16.5;
    if(this.warnClosure(e,e.preferred))e.casts=(e.casts||0)+1;
   }
  }
 }
 tick(dt){
  if(this.ended)return;
  this.time+=dt;
  this.income+=dt;
  if(this.income>=1){this.income-=1;if(this.active&&this.time-this.waveAt<36)this.cpu+=3;}
  let recalc=false,opened=false;
  for(const [id,t] of this.isolators)if(t.until<=this.time){this.remove(id,false,false);recalc=true;}
  for(const [id,until] of this.downs)if(this.time>=until){this.downs.delete(id);recalc=true;}
  for(const [id,until] of this.holes)if(this.time>=until){
   this.holes.delete(id);recalc=true;this.effect('place',this.map.cells[id],undefined,{color:'#55e8c2',dur:.65});
   opened=true;
  }
  if(opened)this.log('临时封锁解除 · 链路直通。','good');
  if(recalc)this.recompute();
  if(this.warning&&this.time>=this.warning.until){
   const w=this.warning;this.warning=null;
   if(!w.src.dead){
    const closed=this.closed;
    const valid=!this.towers.has(w.id)&&w.ids.every(id=>!closed.has(id))&&this.preview(w.ids).ok;
    if(!valid)this.warnClosure(w.src,w.preferred);
    else{
     for(const id of w.ids){
      this.holes.set(id,this.time+(w.boss==='shadow'?9:7));
      this.effect('pulse',this.map.cells[id],undefined,{color:'#ff5365',radius:w.ids.length>1?.86:1.25,dur:.91});
     }
     this.recompute();this.log('封锁已生效 · 地面流量改道。','danger',w.id);
    }
   }
  }
  if(this.active){
   while(this.queue.length&&this.waveAt+this.queue[0].time<=this.time){const n=this.queue.shift();this.spawn(n.type,n.entry);}
  }else if(this.autoAt&&this.time>=this.autoAt)this.start();
  const jobs=this.jobs.filter(job=>job.time<=this.time);this.jobs=this.jobs.filter(job=>job.time>this.time);for(const job of jobs)job.run();
  for(const e of [...this.enemies]){this.updateEnemy(e,dt);if(this.ended)break;}
  if(!this.ended)for(const t of this.towers.values()){
   this.towerTick(t);
   if(this.active&&this.map.cells[t.id].type==='node'&&this.time-(t.contactAt??t.hit)<3.4&&this.enemies.some(e=>!e.dead&&dist(e,t)<2.3)){
    t.hold=(t.hold||0)+dt;if(t.hold>=6){t.hold-=6;this.intel++;this.log('驻守隔离节点 · 情报 +1。','good',t.id);}
   }
  }
  this.enemies=this.enemies.filter(e=>!e.dead);
  this.effects=this.effects.filter(f=>f.at+f.dur+(f.delay||0)>this.time);
  if(this.active&&!this.demo&&!this.ended&&!this.queue.length&&!this.enemies.length&&!this.jobs.length){
   this.active=false;this.intel+=2;this.cpu+=74+this.wave*3;
   if(this.wave===this.map.waves)this.end(true);
   else {this.log('波次清理完成 · 算力及情报到账。','good');this.autoAt=this.time+15;}
  }
 }
}

function facing(e,dir,time){
 if(Math.abs(e.dir-dir)<1e-6)return;
 const shortest=a=>Math.atan2(Math.sin(a),Math.cos(a));
 e.turnFrom=e.turnAt===undefined?e.dir:e.turnFrom+shortest(e.dir-e.turnFrom)*clamp((time-e.turnAt)/.17,0,1);
 e.turnAt=time;e.dir=dir;
}






