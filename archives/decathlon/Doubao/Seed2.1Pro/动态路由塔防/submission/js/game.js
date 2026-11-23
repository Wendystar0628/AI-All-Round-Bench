/* ================= 战斗核心：寻路 / 塔 / 敌人 / Boss / 波次 / 道具 ================= */
G.Game=function(world){
'use strict';
var THREE=window.THREE;
var self=this;
this.world=world;
this.Bus=G.Bus;

/* ---------- 状态 ---------- */
this.time=0;this.real=0;
this.mapDef=null;this.running=false;this.paused=false;this.speed=1;
this.compute=220;this.intel=1;this.integrity=100;
this.waveIndex=0;this.waveActive=false;this.spawnQueue=[];
this.towers=[];this.enemies=[];this.fxList=[];
this.selected=null;this.nodeCd={};this.downEdges={};this.blockedEdges={};
this.stats={kills:0,leaks:0,built:0,sealTime:0,dmgTaken:0,sealsHeld:0};
this.itemCd={isolator:0,downgrade:0,backup:0};
this.logs=[];
this.over=null;
this.randSeed=12345;
this.rand=Math.random;
this.onRouteChanged=null;
this.scheduled=[];this.deterministic=false;

/* 可确定性调度：普通模式走真实计时器，导出/演示走模拟时间 */
this.schedule=function(sec,fn){
  if(this.deterministic){this.scheduled.push({at:this.time+sec,fn:fn});}
  else setTimeout(fn,sec*1000);
};

function rngFactory(seed){var f=G.RNG(seed);return function(){return f();};}

/* ---------- 生命周期 ---------- */
this.startMap=function(mapId,seed){
  var def=G.MAPS[mapId];
  this.mapDef=def;
  this.rand=rngFactory(seed||(mapId*7919+12345));
  this.time=0;this.running=true;this.paused=false;this.speed=1;this.over=null;
  this.compute=220;this.intel=1;this.integrity=100;
  this.waveIndex=0;this.waveActive=false;this.spawnQueue=[];
  this.towers=[];this.enemies=[];this.fxList=[];this.nodeCd={};this.downEdges={};this.blockedEdges={};
  this.stats={kills:0,leaks:0,built:0,sealTime:0,dmgTaken:0,sealsHeld:0};
  this.itemCd={isolator:0,downgrade:0,backup:0};this.logs=[];
  this._intelTick=0;this._sealIntel=0;this.scheduled=[];
  world.setMap(def);
  this.computeRoutes();
  world.showRoutes(this.routes);
  this.log('守护进程已挂载 · '+def.name+' · 等待作战指令','good');
  G.Audio.enterMap(def.theme);
  G.Bus.emit('game:start',this);
};

this.log=function(msg,cls){
  this.logs.push({t:this.time,msg:msg,cls:cls||''});
  if(this.logs.length>60)this.logs.shift();
  G.Bus.emit('log',{msg:msg,cls:cls||''});
};

/* =========================================================
   拓扑与寻路
========================================================= */
this._routingEdges=function(){
  var def=this.mapDef,self=this;
  return def.edges.map(function(e,i){
    var na=def.nodes.find(n=>n.id===e.a),nb=def.nodes.find(n=>n.id===e.b);
    var geo=Math.hypot(nb.x-na.x,nb.z-na.z);
    var cost;
    if(e.w!==undefined) cost=e.w*(geo/10);
    else cost=e.costMul?geo*Math.sqrt(e.costMul):geo;
    if(e.old)cost*=1.8;
    if(self.downEdges[i])cost*=1.8;
    if(self.blockedEdges[i])cost=1e7;
    return {a:e.a,b:e.b,cost:cost,index:i};
  });
};
this.nodeBlocked=function(id,extra){
  if(extra&&extra.node===id)return true;
  var n=this.world.nodes[id];
  if(n&&n.sealed)return true;
  return false;
};
this.computeRoutes=function(extra){
  var def=this.mapDef;var self=this;
  var exits=def.nodes.filter(function(n){return n.type==='exit';}).map(function(n){return n.id;});
  var edges=this._routingEdges();
  var res=G.dijkstra(def.nodes,edges,function(id){return self.nodeBlocked(id,extra);},exits,null);
  this.dist=res.dist;this.prev=res.prev;this.exits=exits;
  var routes={};
  def.nodes.filter(function(n){return n.type==='entry';}).forEach(function(en){
    routes[en.id]=G.pathFromPrev(res.prev,en.id,exits);
  });
  this.routes=routes;
  return routes;
};
this.pathFromNode=function(id){
  return G.pathFromPrev(this.prev,id,this.exits);
};
/* 预览：隔离某节点/降级某边后的路由；返回 {routes, ok, badNode} */
this.previewChange=function(kind,target){
  var savedDown=Object.assign({},this.downEdges), savedBlocked=Object.assign({},this.blockedEdges);
  var fakeSealed={};
  var n=this.world.nodes[target];
  var currentlySealed=n&&n.sealed;
  if(kind==='seal'&&!currentlySealed)fakeSealed[target]=true;
  if(kind==='downgrade')this.downEdges[target]=true;
  var def=this.mapDef,exits=this.exits;
  var edges=this._routingEdges();
  var blocked=function(id){return (self.world.nodes[id]&&self.world.nodes[id].sealed)||fakeSealed[id];};
  var res=G.dijkstra(def.nodes,edges,blocked,exits,null);
  var routes={},ok=true;
  def.nodes.filter(n=>n.type==='entry').forEach(function(en){
    var p=G.pathFromPrev(res.prev,en.id,exits);routes[en.id]=p;if(!p)ok=false;
  });
  // 场上地面敌人也必须有路
  if(ok){
    this.enemies.forEach(function(en){
      if(en.flying||en.state==='dead')return;
      if(!isFinite(res.dist[en.u]||Infinity)&&!isFinite(res.dist[en.v]||Infinity))ok=false;
    });
  }
  var badNode=ok?null:target;
  this.downEdges=savedDown;this.blockedEdges=savedBlocked;
  return {routes:routes,ok:ok,badNode:badNode};
};

this.rerouteAll=function(changedKind){
  var oldEdges=this._activeEdgeSet();
  this.computeRoutes();
  // 敌人就地重新寻路（必要时沿当前链路掉头）
  this.enemies.forEach(function(en){
    if(en.flying||en.state==='dead')return;
    if(en.state==='siege'){
      en.state='walk';en.siegeTarget=null;
      en.u=self.nearestNode(en.pos);en.progress=0;
    }
    en.luredBy=null;
    var path=self.pathFromNode(en.u);
    if(!path){
      path=self.pathFromNode(en.v);
      if(path){en.u=en.v;en.progress=0;}
    }
    en.path=path;en.pi=0;
    if(path){
      var next=path.nodes[1];
      if(next!==undefined&&next!==en.v){
        en.progress=1-en.progress;
        var tmp=en.u;en.u=en.v;en.v=tmp;
        en.path=self.pathFromNode(en.u);en.pi=0;
        if(en.path)en.v=en.path.nodes[1];
      }else{
        en.v=next;
      }
    }
  });
  if(this.onRouteChanged)this.onRouteChanged();
};
this._activeEdgeSet=function(){
  var s={};
  Object.keys(this.routes).forEach(function(e){
    var p=this.routes[e];if(p)p.edges.forEach(function(i){s[i]=1;});
  },this);
  return s;
};
this.refreshRoutesVisual=function(){
  world.showRoutes(this.routes);
};

/* =========================================================
   塔
========================================================= */
this.towerDef=function(t){
  var base=G.TOWERS[t.type];
  var L=t.level;
  var d={
    firewall:{1:{hp:300,dmg:12,rate:1.05,range:1.9,cap:3},2:{hp:520,dmg:22,rate:.9,range:2.3,cap:4}},
    honeypot:{1:{hp:150,lure:3.3,cd:20,trap:2.5,tr:2.2},'2_deep':{hp:230,lure:4.4,cd:18,trap:3.6,tr:3.2},
      '2_spike':{hp:230,lure:3.6,cd:19,trap:2.5,tr:2.2,thorns:16}},
    gate:{1:{hp:430},2:{hp:780}},
    interceptor:{1:{hp:120,dmg:16,range:5.6,fov:1.5,rate:.75},
      '2_pierce':{hp:190,dmg:24,range:7.2,fov:1.5,rate:.95,pierce:true},
      '2_suppress':{hp:180,dmg:13,range:5.8,fov:1.7,rate:.36,slow:true}},
    sandbox:{1:{hp:140,dmg:15,r:3.2,rate:1.1,reveal:3.9},2:{hp:230,dmg:26,r:3.9,rate:.9,reveal:4.8}},
    repair:{1:{hp:130,heal:9,r:3.4,cd:14,shield:50},2:{hp:210,heal:17,r:4.1,cd:12,shield:90}}
  };
  var key=t.type;
  var sk=String(L)+(L===2&&t.branch?'_'+t.branch:'');
  var set=(d[key][sk]||d[key][L]||d[key][1]);
  return set;
};
this.towerCost=function(type,level,branch){
  var base=G.TOWERS[type].cost;
  if(level===1)return {c:base.c||0,i:base.i||0};
  var c=Math.round((base.c||0)*.8);
  return {c:c,i:(branch?1:0)+(type==='gate'?1:0)};
};

this.canPlace=function(type,slot){
  if(slot.tower)return {ok:false,reason:'该位置已有设备'};
  var loc=G.TOWERS[type].loc;
  if(loc.indexOf(slot.kind)<0)return {ok:false,reason:'该进程不能部署在'+(slot.kind==='link'?'链路':slot.kind==='node'?'交换节点':'平台')};
  var cost=G.TOWERS[type].cost;
  if(this.compute<(cost.c||0))return {ok:false,reason:'算力不足'};
  if((cost.i||0)>0&&this.intel<cost.i)return {ok:false,reason:'情报不足'};
  if(slot.kind==='node'&&this.nodeCd[slot.node]&&this.nodeCd[slot.node]>this.time)
    return {ok:false,reason:'节点旁路重建中，暂不能再次隔离'};
  // 连通性预检
  if(slot.kind==='node'&&(type==='gate'||type==='firewall')){
    var pv=this.previewChange('seal',slot.node);
    if(!pv.ok)return {ok:false,reason:'该操作会封死入口/部队，无法执行',preview:pv};
  }
  return {ok:true};
};
this.placeTower=function(type,slot,facing){
  var chk=this.canPlace(type,slot);
  if(!chk.ok)return chk;
  var cost=G.TOWERS[type].cost;
  this.compute-=cost.c||0;this.intel-=cost.i||0;
  var t={id:G.uid(),type:type,level:1,branch:null,slot:slot,
    hp:G.TOWERS[type].hp,maxHp:G.TOWERS[type].hp,
    shield:0,encryptT:0,cd:0,facing:facing===undefined?Math.PI:facing,aim:facing===undefined?Math.PI:facing,
    atkT:0,firing:0,attacking:false,attackT:0,skillT:0,pulse:0,healPulse:0,lured:[],kills:0};
  var model=G.Units.makeTowerMesh(type,1,null,slot.kind);
  t.model=model;
  model.group.position.copy(slot.pos);
  if(slot.kind==='platform')model.group.position.y=1.32;
  world.unitGroup.add(model.group);
  slot.tower=t;this.towers.push(t);this.stats.built++;
  if(slot.kind==='node'&&(type==='gate'||type==='firewall'))this.sealNode(slot.node,t);
  G.Audio.sfx('build');
  G.Units.FX.ring(world.fxGroup,new THREE.Vector3(slot.pos.x,.4,slot.pos.z),0x37e2ff,1.6);
  G.Bus.emit('tower:changed',t);
  return {ok:true,tower:t};
};
this.upgradeTower=function(t,branch){
  if(t.level!==1)return {ok:false,reason:'已满级'};
  var cost=this.towerCost(t.type,2,branch);
  if(this.compute<cost.c)return {ok:false,reason:'算力不足'};
  if(cost.i>this.intel)return {ok:false,reason:'情报不足（分支选择消耗情报）'};
  this.compute-=cost.c;this.intel-=cost.i;
  t.level=2;t.branch=branch||null;
  var set=this.towerDef(t);
  var ratio=t.hp/t.maxHp;t.maxHp=set.hp;t.hp=Math.min(set.hp,t.hp+set.hp*.35);
  // 重建模型
  world.unitGroup.remove(t.model.group);
  var model=G.Units.makeTowerMesh(t.type,2,branch,t.slot.kind);
  t.model=model;model.group.position.copy(t.slot.pos);
  if(t.slot.kind==='platform')model.group.position.y=1.32;
  world.unitGroup.add(model.group);
  G.Audio.sfx('upgrade');
  G.Units.FX.ring(world.fxGroup,new THREE.Vector3(t.slot.pos.x,1,t.slot.pos.z),0x8fe8ff,2.2);
  G.Bus.emit('tower:changed',t);
  return {ok:true};
};
this.sellTower=function(t){
  var refund=Math.round((G.TOWERS[t.type].cost.c||0)*.5*t.level*.8);
  this.compute+=refund;
  this._removeTower(t,true);
  G.Audio.sfx('sell');
  return refund;
};
this._removeTower=function(t,sold){
  var slot=t.slot;
  if(slot.kind==='node'&&(t.type==='gate'||t.type==='firewall'||t.type==='isolator')){
    this.unsealNode(slot.node);
  }
  world.unitGroup.remove(t.model.group);
  slot.tower=null;
  var i=this.towers.indexOf(t);if(i>=0)this.towers.splice(i,1);
  // 被诱敌人恢复
  t.lured.forEach(function(e){e.luredBy=null;});
  G.Bus.emit('tower:changed',null);
};
this.damageTower=function(t,dmg,encrypt,src){
  if(t.type==='honeypot'&&encrypt)encrypt=false;
  var real=dmg;
  if(t.shield>0){var a=Math.min(t.shield,dmg);t.shield-=a;real-=a;}
  t.hp-=real;this.stats.dmgTaken+=real;
  if(encrypt)t.encryptT=Math.max(t.encryptT,2.6);
  var bp=t.slot.pos;
  G.Units.FX.flash(world.fxGroup,new THREE.Vector3(bp.x,(t.slot.kind==='platform'?2.2:1),bp.z),0xff5577,.35);
  if(t.hp<=0){
    this.destroyTower(t,src);
  }
};
this.destroyTower=function(t,src){
  if(t.type==='isolator')this.log('应急隔离器被冲毁，节点恢复旁路直通','danger');
  else this.log(G.TOWERS[t.type].name+' 被敌方摧毁！','danger');
  G.Audio.sfx('explode');
  G.Units.FX.burst(world.fxGroup,new THREE.Vector3(t.slot.pos.x,1,t.slot.pos.z),0xff6688,16);
  this._removeTower(t,false);
  G.Bus.emit('tower:changed',null);
};
this.healTower=function(t,amount){
  t.hp=Math.min(t.maxHp,t.hp+amount);
};

this.sealNode=function(nodeId,tower){
  var n=world.nodes[nodeId];
  world.setNodeSealed(nodeId,true);
  this.rerouteAll();
  var newSet=this._activeEdgeSet();
  G.Audio.sfx('seal');
  this.log('节点 ['+n.def.name+'] 已隔离，路由重新收敛','warn');
  G.Units.FX.ring(world.fxGroup,new THREE.Vector3(n.def.x,.6,n.def.z),0xff5577,2.4);
  G.Bus.emit('node:seal',nodeId);
};
this.unsealNode=function(nodeId){
  var n=world.nodes[nodeId];if(!n||!n.sealed)return;
  world.setNodeSealed(nodeId,false);
  this.nodeCd[nodeId]=this.time+8;
  this.rerouteAll();
  G.Audio.sfx('unseal');
  this.log('节点 ['+n.def.name+'] 解除隔离，旁路直通（8 秒内无法再次隔离）','good');
  G.Units.FX.ring(world.fxGroup,new THREE.Vector3(n.def.x,.6,n.def.z),0x37e2ff,2.4);
  G.Bus.emit('node:unseal',nodeId);
};

this.useSkill=function(t){
  if(t.encryptT>0)return {ok:false,reason:'设备已被加密，无法释放技能'};
  if(t.cd>this.time)return {ok:false,reason:'技能冷却中'};
  var set=this.towerDef(t);
  if(t.type==='honeypot'){
    t.cd=this.time+set.cd;
    var r=set.tr, dur=set.trap;
    this.enemies.forEach(function(e){
      if(e.flying||e.state==='dead')return;
      if(G.dist2D(e.pos,t.slot.pos)<=r){e.stunT=Math.max(e.stunT,dur);}
    });
    G.Audio.sfx('trap');
    G.Units.FX.web(world.fxGroup,new THREE.Vector3(t.slot.pos.x,.5,t.slot.pos.z),r);
    this.log('蜜罐释放诱捕，区域内敌人被定身','good');
  }else if(t.type==='repair'){
    t.cd=this.time+set.cd;
    this.towers.forEach(function(o){
      if(G.dist2D(o.slot.pos,t.slot.pos)<=set.r){o.shield=Math.max(o.shield,set.shield);o.encryptT=0;}
    });
    G.Audio.sfx('shield');
    G.Units.FX.shieldPulse(world.fxGroup,new THREE.Vector3(t.slot.pos.x,2,t.slot.pos.z),set.r);
    this.log('冗余切换：附近友塔获得护盾并解除加密','good');
  }
  G.Bus.emit('tower:changed',t);
  return {ok:true};
};

/* =========================================================
   敌人
========================================================= */
this.spawnEnemy=function(type,entryId,opts){
  opts=opts||{};
  var def=this.mapDef;
  var ed=G.ENEMIES[type];
  var path=this.routes[entryId];
  if(!ed.flying&&(!path)){return null;}
  var scale=1+.075*this.waveIndex+this.mapDef.id*.09;
  var e={
    id:G.uid(),type:type,entry:entryId,
    maxHp:Math.round(ed.hp*scale*(opts.hpMul||1)),hp:0,
    speed:ed.speed,baseDmg:ed.dmg,atkRate:ed.atkRate,atkCd:0,
    blockCap:ed.blockCap,leak:ed.leak,
    flying:!!ed.flying,state:'walk',stunT:0,revealed:ed.flying||type==='worm'||type==='flood'||type==='ransom'||type==='packer',
    shield:0,packerT:0,copyUsed:!!opts.clone,luredBy:null,slowT:0,
    boss:!!ed.boss,phase:0,bossCd:6,bossWarned:false,
    path:path,pi:0,u:null,v:null,progress:0,
    yaw:0,model:null,pos:new THREE.Vector3(),
    lateral:(this.rand()-.5)*.5,t:0,siegeTarget:null,siegePoint:null
  };
  e.hp=e.maxHp;
  if(ed.flying){
    var en=def.nodes.find(n=>n.id===entryId);
    // 最近出口
    var exitNode=def.nodes.filter(n=>n.type==='exit')
      .map(n=>({n:n,d:Math.hypot(n.x-en.x,n.z-en.z)})).sort((a,b)=>a.d-b.d)[0].n;
    e.u=entryId;e.v=exitNode.id;e.exitId=exitNode.id;
  }else{
    e.u=entryId;e.v=path.nodes[1];e.path=path;e.progress=0;
  }
  var m=G.Units.makeEnemyMesh(type);
  e.model=m;
  var start=def.nodes.find(n=>n.id===entryId);
  m.group.position.set(start.x,ed.flying?2.6:.1,start.z);
  if(ed.flying)m.group.userData.baseY=2.6;
  world.unitGroup.add(m.group);
  G.Units.FX.spawnPortal(world.fxGroup,new THREE.Vector3(start.x,ed.flying?2.5:.2,start.z),ed.color);
  this.enemies.push(e);
  return e;
};
this.enemyEdge=function(e){
  if(e.flying)return null;
  var idx=this.mapDef.edges.findIndex(ed=>(ed.a===e.u&&ed.b===e.v)||(ed.b===e.u&&ed.a===e.v));
  return idx;
};
this.distToExit=function(e){
  if(e.flying){
    var ex=this.mapDef.nodes.find(n=>n.id===e.exitId);
    return G.dist2D(e.pos,ex);
  }
  var ei=this.enemyEdge(e);
  var d=isFinite(this.dist[e.u])?this.dist[e.u]:(isFinite(this.dist[e.v])?this.dist[e.v]:Infinity);
  if(ei>=0&&this.edges2&&this.edges2[ei]&&isFinite(this.dist[e.u])){
    d-=e.progress*this.edges2[ei].cost;
  }
  return d;
};
this.killEnemy=function(e,byAoe){
  if(e.state==='dead')return;
  e.state='dead';
  var ed=G.ENEMIES[e.type];
  // 未显形木马被波及：释放载荷
  if(e.type==='trojan'&&!e.revealed&&byAoe){
    this.towers.forEach(function(t){
      if(G.dist2D(t.slot.pos,e.pos)<=2.4)self.damageTower(t,30,false);
    });
    this.log('伪装木马被波及消灭，载荷爆炸损伤了附近设备！','danger');
    G.Audio.sfx('explode');
  }
  this.compute+=ed.reward;
  this.stats.kills++;
  if(ed.intel)this._keyKills=(this._keyKills||0)+1;
  if(ed.intel&&this._keyKills%4===0){this.intel+=1;this.log('截获重点威胁情报 +1','good');}
  G.Units.FX.burst(world.fxGroup,e.pos.clone().setY(e.pos.y+.4),ed.color,e.boss?40:12);
  if(e.boss){G.Audio.sfx('explode');this.onBossDown(e);}
  world.unitGroup.remove(e.model.group);
  var i=this.enemies.indexOf(e);if(i>=0)this.enemies.splice(i,1);
  if(e.luredBy){var li=e.luredBy.lured.indexOf(e);if(li>=0)e.luredBy.lured.splice(li,1);}
};
this.leakEnemy=function(e){
  var ed=G.ENEMIES[e.type];
  this.integrity=Math.max(0,this.integrity-ed.leak);
  this.stats.leaks++;
  this.log('⚠ '+ed.name+' 突破防线，中枢完整度 -'+ed.leak,'danger');
  G.Audio.sfx('leak');
  G.Bus.emit('core:hit',ed.leak);
  world.unitGroup.remove(e.model.group);
  e.state='dead';
  var i=this.enemies.indexOf(e);if(i>=0)this.enemies.splice(i,1);
  if(this.integrity<=0)this.endGame(false);
};

/* =========================================================
   道具
========================================================= */
this.placeIsolator=function(nodeId){
  if(this.itemCd.isolator>this.time)return {ok:false,reason:'应急隔离器冷却中'};
  if(this.intel<2)return {ok:false,reason:'情报不足'};
  var slot=this.world.nodes[nodeId].slot;
  if(slot.tower)return {ok:false,reason:'节点上已有设备'};
  if(this.nodeCd[nodeId]&&this.nodeCd[nodeId]>this.time)return {ok:false,reason:'节点旁路重建中'};
  var pv=this.previewChange('seal',nodeId);
  if(!pv.ok)return {ok:false,reason:'隔离会封死入口，无法投放',preview:pv};
  this.intel-=2;this.itemCd.isolator=this.time+18;
  var t={id:G.uid(),type:'isolator',level:1,branch:null,slot:slot,hp:220,maxHp:220,
    shield:0,encryptT:0,expiresAt:this.time+25,item:true,lured:[],model:null};
  var model=G.Units.makeTowerMesh('gate',1,null,'node');
  t.model=model;model.group.position.copy(slot.pos);world.unitGroup.add(model.group);
  slot.tower=t;this.towers.push(t);
  this.sealNode(nodeId,t);
  this.log('应急隔离器已投放（25 秒有效，可被冲毁）','warn');
  return {ok:true,tower:t};
};
this.applyDowngrade=function(edgeIdx){
  if(this.itemCd.downgrade>this.time)return {ok:false,reason:'协议降级冷却中'};
  if(this.intel<2)return {ok:false,reason:'情报不足'};
  // 预览成本
  this.downEdges[edgeIdx]=true;
  var routes=this.computeRoutes();
  var bad=false;
  Object.keys(routes).forEach(function(k){if(!routes[k])bad=true;});
  if(bad){delete this.downEdges[edgeIdx];this.computeRoutes();return {ok:false,reason:'降级会导致封路'};}
  this.intel-=2;this.itemCd.downgrade=this.time+16;
  this.rerouteAll();
  var e=this.world.edges[edgeIdx];
  this.log('链路协议已降级为旧协议：地面敌人减速、伪装显形','warn');
  G.Audio.sfx('downgrade');
  G.Units.FX.ring(world.fxGroup,e.curve.getPoint(.5).setY(.5),0xffd25c,4);
  // 链路上敌人立即显形
  this.enemies.forEach(en=>{if(this.enemyEdge(en)===edgeIdx)en.revealed=true;});
  var self2=this;
  this.schedule(12,function(){
    delete self2.downEdges[edgeIdx];
    if(self2.running){self2.rerouteAll();self2.log('链路协议恢复，路由重新收敛','good');}
  });
  return {ok:true};
};
this.applyBackup=function(t){
  if(this.itemCd.backup>this.time)return {ok:false,reason:'备份还原冷却中'};
  if(this.compute<60)return {ok:false,reason:'算力不足'};
  this.compute-=60;this.itemCd.backup=this.time+14;
  this.healTower(t,t.maxHp*.6);t.encryptT=0;t.shield=Math.max(t.shield,20);
  G.Audio.sfx('heal');
  G.Units.FX.heal(world.fxGroup,new THREE.Vector3(t.slot.pos.x,1.5,t.slot.pos.z));
  this.log('备份还原完成：'+G.TOWERS[t.type].name+' 恢复 60% 生命','good');
  return {ok:true};
};

/* =========================================================
   波次
========================================================= */
this.forecast=function(){
  var w=this.mapDef.waves[this.waveIndex];
  if(!w)return null;
  var rows=[];
  (w.groups||[]).forEach(function(g){
    var ed=G.ENEMIES[g.type];
    for(var k=0;k<rows.length;k++){if(rows[k].type===g.type&&rows[k].entry===g.entry){rows[k].count+=g.count;return;}}
    rows.push({type:g.type,entry:g.entry,count:g.count,color:ed.color,name:ed.name});
  });
  if(w.boss){var bd=G.ENEMIES[w.boss];rows.unshift({type:w.boss,entry:'A',count:1,color:bd.color,name:'BOSS · '+bd.name});}
  return {wave:this.waveIndex+1,flood:!!w.flood,rows:rows,total:this.mapDef.waves.length};
};
this.startWave=function(){
  if(this.waveActive||this.over)return;
  var w=this.mapDef.waves[this.waveIndex];if(!w)return;
  this.waveActive=true;
  this.spawnQueue=[];
  var self=this;
  (w.groups||[]).forEach(function(g){
    for(var i=0;i<g.count;i++){
      self.spawnQueue.push({type:g.type,entry:g.entry,at:self.time+(g.delay||0)+i*g.interval});
    }
  });
  if(w.boss){
    this.spawnQueue.push({type:w.boss,entry:(w.bossEntry||'A'),at:self.time+2,boss:true});
    this.scheduleBoss(w.boss);
  }
  if(w.flood)this.log('警告：检测到「洪峰」——多入口同时大规模入侵！','danger');
  G.Audio.sfx('waveStart');
  G.Bus.emit('wave:start',this.waveIndex+1);
};
this.scheduleBoss=function(bossType){
  var name=G.ENEMIES[bossType].name;
  this.log('★ 高危威胁 ['+name+'] 正在建立连接！','danger');
  G.Audio.sfx('bossWarn');
  G.Bus.emit('boss:warn',bossType);
};
this.endWave=function(){
  this.waveActive=false;
  this.waveIndex++;
  this.intel+=1;
  this.log('第 '+this.waveIndex+' 波威胁已清除，情报 +1','good');
  G.Bus.emit('wave:end',this.waveIndex);
  if(this.waveIndex>=this.mapDef.waves.length){this.endGame(true);}
};
this.endGame=function(win){
  if(this.over)return;
  this.over=win?'win':'lose';this.waveActive=false;
  G.Audio.sfx(win?'win':'lose');
  G.Bus.emit('game:over',{win:win,stats:this.stats});
};

/* =========================================================
   Boss 行为
========================================================= */
this.bossPickBlackholeEdge=function(){
  // 在任一入口的活跃路径上选一条边，且封堵后不封死入口
  var ids=Object.keys(this.routes).sort(function(){return self.rand()-.5;});
  for(var k=0;k<ids.length;k++){
    var p=this.routes[ids[k]];if(!p)continue;
    var cand=p.edges.slice().sort(function(){return self.rand()-.5;});
    for(var i=0;i<cand.length;i++){
      var ei=cand[i];
      this.blockedEdges[ei]=1;
      var r=this.computeRoutes();var ok=true;
      Object.keys(r).forEach(function(a){if(!r[a])ok=false;});
      delete this.blockedEdges[ei];this.computeRoutes();
      if(ok)return ei;
    }
  }
  return -1;
};
this.bossDoBlackhole=function(e){
  var ed=this.world.edges[e];
  var pos=ed.curve.getPointAt(.5).setY(.5);
  G.Units.FX.warnMarker(world.fxGroup,pos,0x8f7cff);
  this.log('★ 蜃楼施放「伪路由」，前方链路将出现路由黑洞！','danger');
  G.Bus.emit('boss:warn',{kind:'blackhole',pos:pos});
  var self2=this,ei=e;
  this.schedule(2.6,function(){
    if(!self2.running)return;
    self2.blockedEdges[ei]='blackhole';
    self2.world.setEdgeBlocked(ei,'blackhole');
    self2.rerouteAll();
    G.Audio.sfx('blackhole');
    self2.log('路由黑洞形成，链路截断，各入口改道！','danger');
    self2.schedule(8,function(){
      if(!self2.running)return;
      delete self2.blockedEdges[ei];
      self2.world.setEdgeBlocked(ei,null);
      self2.rerouteAll();
      self2.log('黑洞消退，链路恢复','good');
    });
  });
};
this.bossDoLock=function(e){
  var ed=this.world.edges[e];
  var pos=ed.curve.getPointAt(.5).setY(.5);
  G.Units.FX.warnMarker(world.fxGroup,pos,0x7cff9e);
  this.log('★ 蛰影进入破坏阶段，前方运维环即将被锁死！','danger');
  G.Bus.emit('boss:warn',{kind:'lock',pos:pos});
  var self2=this,ei=e;
  this.schedule(2.6,function(){
    if(!self2.running)return;
    self2.blockedEdges[ei]='lock';
    self2.world.setEdgeBlocked(ei,'lock');
    self2.rerouteAll();
    G.Audio.sfx('lock');
    self2.log('运维环一段被锁死，路线重新收敛！','danger');
    self2.schedule(14,function(){
      if(!self2.running)return;
      delete self2.blockedEdges[ei];self2.world.setEdgeBlocked(ei,null);self2.rerouteAll();
    });
  });
};
this.onBossDown=function(e){
  this.log('★ '+G.ENEMIES[e.type].name+' 已被歼灭，网络恢复稳定','good');
  this.bossRef&&delete this.bossRef;
};

/* =========================================================
   主推进
========================================================= */
this.update=function(dt){
  if(!this.running||this.paused||this.over)return;
  var steps=Math.round(dt*60);
  var tick=1/60;
  for(var i=0;i<Math.min(steps,8);i++)this.step(tick);
};
this.simAdvance=function(gameDt){
  // 导出/演示确定性推进：固定步长
  var n=Math.round(gameDt*60);
  for(var i=0;i<n;i++)this.step(1/60);
};
this.step=function(dt){
  this.time+=dt;
  // 确定性调度
  if(this.scheduled.length){
    var due=this.scheduled.filter(x=>x.at<=this.time);
    this.scheduled=this.scheduled.filter(x=>x.at>this.time);
    due.forEach(x=>x.fn());
  }
  // 波次生成
  if(this.waveActive){
    while(this.spawnQueue.length&&this.spawnQueue[0].at<=this.time){
      var s=this.spawnQueue.shift();
      this.spawnEnemy(s.type,s.entry,s.opts);
    }
  }
  // 节点守住情报
  this._sealIntel=(this._sealIntel||0)+dt;
  var sealedCount=0;
  Object.keys(this.world.nodes).forEach(id=>{if(this.world.nodes[id].sealed)sealedCount++;});
  if(sealedCount>0&&this._sealIntel>=8){
    this._sealIntel=0;this.intel+=sealedCount;
    this.log('持续守住隔离节点，情报 +'+sealedCount,'good');
  }
  if(this._sealIntel===0){}
  // 隔离器到期
  for(var k=this.towers.length-1;k>=0;k--){
    var t=this.towers[k];
    if(t.type==='isolator'&&t.expiresAt<=this.time){
      this.log('应急隔离器失效，节点恢复直通','good');
      this._removeTower(t,false);
    }
    if(t.encryptT>0)t.encryptT-=dt;
    if(t.firing>0)t.firing-=dt*4;
    if(t.pulse>0)t.pulse-=dt*2;
    if(t.healPulse>0)t.healPulse-=dt*2;
  }
  this.towerLogic(dt);
  this.enemyLogic(dt);
  this.updateFX(dt);
  // 波次结束判定
  if(this.waveActive&&!this.spawnQueue.length&&!this.enemies.length)this.endWave();
};

/* ---------- 塔逻辑 ---------- */
this.towerLogic=function(dt){
  var self=this;
  this.edges2=this.edges2||this._buildEdgeCosts();
  this.towers.forEach(function(t){
    var set=self.towerDef(t);
    var pos=t.slot.pos;
    // 模型状态
    var mst={time:self.time,dt:dt,aim:t.aim,firing:t.firing,attacking:t.attacking,
      attackT:t.attackT,pulse:t.pulse,healPulse:t.healPulse,stage:0};
    if(t.model.update)t.model.update(dt,mst);
    G.Units.setHealthBar(t.model.bar,t.hp/t.maxHp,t.hp/t.maxHp>.5?0x33dd88:0xff5577);
    if(t.encryptT>0){
      if(!t._encRing){t._encRing=G.Units.attachEncryptRing(t.model.group);}
    }else if(t._encRing){t.model.group.remove(t._encRing);t._encRing=null;}
    if(t.shield>0){
      if(!t._shieldB){t._shieldB=G.Units.attachShieldBubble(t.model.group,
        t.slot.kind==='node'?1.5:1.0,0x6fb8ff);}
    }else if(t._shieldB){t.model.group.remove(t._shieldB);t._shieldB=null;}
    if(t.encryptT>0)return;
    t.attacking=false;

    if(t.type==='firewall'){
      t.atkT-=dt;
      // 目标：被本塔阻挡的敌人；节点塔攻击相邻敌人
      var targets=self.firewallBlockedList(t).filter(e=>e.state==='blocked'&&e._blocker===t);
      if(t.slot.kind==='node'){
        targets=self.enemies.filter(e=>!e.flying&&e.state!=='dead'&&G.dist2D(e.pos,pos)<=set.range+1.2);
      }
      if(targets.length&&t.atkT<=0){
        t.atkT=set.rate;t.firing=1;t.attacking=true;t.attackT=.18;
        var tg=targets.sort((a,b)=>self.distToExit(a)-self.distToExit(b))[0];
        self.hitEnemy(tg,set.dmg,t);
        G.Audio.sfx('shoot');
        G.Units.FX.beam(world.fxGroup,new THREE.Vector3(pos.x,t.slot.kind==='node'?1.2:.9,pos.z),
          tg.pos.clone().setY(tg.pos.y+.5),0x6fd4ff,.04);
      }
    }else if(t.type==='interceptor'){
      t.atkT-=dt;
      var tgt=self.pickInterceptorTarget(t,set);
      if(tgt){
        var desired=Math.atan2(-(tgt.pos.x-pos.x),-(tgt.pos.z-pos.z));
        t.aim=G.angleLerp(t.aim,desired,Math.min(1,dt*8));
        if(t.atkT<=0){
          t.atkT=set.rate;t.firing=1;
          if(set.pierce){
            // 贯穿：沿射线命中所有敌人
            var dir=new THREE.Vector3(Math.sin(t.aim),0,Math.cos(t.aim));
            var hitAny=false;
            self.enemies.forEach(function(e){
              if(e.state==='dead')return;
              if(e.type==='trojan'&&!e.revealed)return;
              if(e.boss&&e.type==='zheying'&&e.phase===0&&!e._detected)return;
              var dv=e.pos.clone().sub(new THREE.Vector3(pos.x,0,pos.z));
              var proj=dv.dot(dir);
              if(proj>0&&proj<=set.range){
                var perp=Math.abs(dv.x*dir.z-dv.z*dir.x);
                if(perp<.8){self.hitEnemy(e,set.dmg,t);if(set.slow)e.slowT=2;hitAny=true;}
              }
            });
            var end=new THREE.Vector3(pos.x,1.4,pos.z).addScaledVector(dir,set.range).setY(1.4);
            G.Units.FX.beam(world.fxGroup,new THREE.Vector3(pos.x,1.6,pos.z),end,0x9fffe4,.06);
            G.Audio.sfx('pierce');if(hitAny)G.Audio.sfx('hit');
          }else{
            self.hitEnemy(tgt,set.dmg,t);
            if(set.slow)tgt.slowT=2;
            G.Units.FX.projectile(world.fxGroup,new THREE.Vector3(pos.x,1.5,pos.z),
              tgt.pos.clone().setY(tgt.pos.y+.5),22,set.slow?0x8fb8ff:0x5ef0c0);
            G.Audio.sfx('shoot');
          }
        }
      }
    }else if(t.type==='sandbox'){
      t.atkT-=dt;
      var pulsing=false;
      self.enemies.forEach(function(e){
        if(e.flying||e.state==='dead')return;
        if(G.dist2D(e.pos,pos)<=set.reveal){
          if(!e.revealed&&e.type==='trojan'){e.revealed=true;G.Audio.sfx('reveal');
            G.Units.FX.ring(world.fxGroup,e.pos.clone().setY(.6),0xd6b3ff,1.4);}
          if(e.boss&&e.type==='zheying'&&e.phase===0)e._detected=true;
        }
      });
      if(t.atkT<=0){
        var grp=self.enemies.filter(e=>!e.flying&&e.state!=='dead'&&G.dist2D(e.pos,pos)<=set.r);
        if(grp.length){
          t.atkT=set.rate;t.pulse=1;pulsing=true;
          grp.forEach(e=>self.hitEnemy(e,set.dmg,t,true));
          G.Units.FX.ring(world.fxGroup,new THREE.Vector3(pos.x,1.6,pos.z),0xb08cff,set.r);
          G.Audio.sfx('shootBig');
        }else t.atkT=Math.min(t.atkT,.15);
      }
    }else if(t.type==='repair'){
      t.healPulseTick=(t.healPulseTick||0)+dt;
      self.towers.forEach(function(o){
        if(o===t||G.dist2D(o.slot.pos,pos)>set.r)return;
        if(o.hp<o.maxHp){o.hp=Math.min(o.maxHp,o.hp+set.heal*dt);
          if(t.healPulseTick>.8){t.healPulseTick=0;
            G.Units.FX.heal(world.fxGroup,new THREE.Vector3(o.slot.pos.x,1.6,o.slot.pos.z));}}
      });
    }else if(t.type==='honeypot'){
      // 荆棘反制
      if(set.thorns){
        t._thornT=(t._thornT||0)+dt;
        if(t._thornT>=.8){
          t._thornT=0;
          t.lured.forEach(function(e){
            if(e.state!=='dead'){self.hitEnemy(e,set.thorns,t);
              G.Units.FX.beam(world.fxGroup,new THREE.Vector3(pos.x,.9,pos.z),e.pos.clone().setY(.5),0xff7a5c,.035);}
          });
        }
      }
    }
  });
};
this.firewallBlockedList=function(t){return this.enemies;};
this.pickInterceptorTarget=function(t,set){
  var pos=t.slot.pos;
  var fwd=new THREE.Vector3(Math.sin(t.aim),0,Math.cos(t.aim));
  var best=null,bd=1e9;
  for(var i=0;i<this.enemies.length;i++){
    var e=this.enemies[i];if(e.state==='dead')continue;
    if(e.type==='trojan'&&!e.revealed)continue;
    if(e.boss&&e.type==='zheying'&&e.phase===0&&!e._detected)continue;
    var dv=new THREE.Vector3(e.pos.x-pos.x,0,e.pos.z-pos.z);var d=dv.length();
    if(d>set.range)continue;
    dv.normalize();
    var ang=Math.acos(G.clamp(dv.dot(fwd),-1,1));
    if(ang>set.fov/2)continue;
    var metric=this.distToExit(e);
    if(metric<bd){bd=metric;best=e;}
  }
  return best;
};
this.hitEnemy=function(e,dmg,tower,aoe){
  if(!e||e.state==='dead')return;
  var real=dmg;
  if(e.shield>0){var a=Math.min(e.shield,dmg);e.shield-=a;real-=a;}
  if(e.boss&&e.type==='zheying'&&e.phase===1)real*=.6;
  e.hp-=real;
  if(tower)tower.kills=(tower.kills||0);
  G.Units.FX.flash(world.fxGroup,e.pos.clone().setY(e.pos.y+.4),0xffdd88,.22);
  if(e.hp<=0)this.killEnemy(e,!!aoe);
};

/* ---------- 敌人逻辑 ---------- */
this.enemyLogic=function(dt){
  var self=this;
  var def=this.mapDef;
  // 先算每个链路基石防火墙阻挡分配
  var blockers={};
  this.enemies.forEach(function(e){e._blocker=null;});
  // 蜜罐吸引判定（被阻挡的地面攻塔敌人）
  this.towers.forEach(function(t){if(t.type==='honeypot')t.lured=t.lured||[];});

  for(var i=0;i<this.enemies.length;i++){
    var e=this.enemies[i];if(e.state==='dead')continue;
    e.t+=dt;
    var ed=G.ENEMIES[e.type];
    if(e.stunT>0){e.stunT-=dt;
      G.Units.updateEnemyModel(e.model,e.type,{time:e.t,dt:dt,revealed:e.revealed,attackT:0,stage:e.phase});
      this.updateEnemyBars(e);continue;}
    if(e.slowT>0)e.slowT-=dt;

    if(e.flying){this.updateFlying(e,dt,ed);}
    else{
      // 加壳器光环
      if(e.type==='packer'){
        e.packerT-=dt;
        if(e.packerT<=0){e.packerT=1.3;
          this.enemies.forEach(function(o){
            if(o!==e&&!o.boss&&G.dist2D(o.pos,e.pos)<=3.2&&o.shield<18){
              o.shield=18;
            }
          });
        }
      }
      // 勒索者远程攻塔
      if(ed.ranged&&!e.boss){
        e.atkCd-=dt;
        if(e.atkCd<=0){
          var tgt=this.pickRansomTarget(e,ed.range);
          if(tgt){
            e.atkCd=e.atkRate;
            G.Units.FX.projectile(world.fxGroup,e.pos.clone().setY(1),
              new THREE.Vector3(tgt.slot.pos.x,tgt.slot.kind==='platform'?2.2:1.2,tgt.slot.pos.z),10,0xffd23d,
              (function(tt,dd){return function(){self.damageTower(tt,dd,true,e);};})(tgt,e.baseDmg));
            G.Audio.sfx('encrypt');
          }
        }
      }
      // Boss
      if(e.boss){this.bossLogic(e,dt);}

      // 洪泛团冲节点
      if(e.type==='flood'&&e.state!=='siege'){
        var sealed=this.findSealedNodeNear(e,7);
        if(sealed&&(this.rand()<1)){
          e.state='siege';e.siegeTarget=sealed;
          var nd=this.mapDef.nodes.find(n=>n.id===sealed);
          var ang=Math.atan2(e.pos.z-nd.z,e.pos.x-nd.x);
          e.siegePoint=new THREE.Vector3(nd.x+Math.cos(ang)*1.5,0,nd.z+Math.sin(ang)*1.5);
          this.log('洪泛团脱离编队，重击被隔离节点 ['+this.world.nodes[sealed].def.name+']','warn');
        }
      }
      if(e.state==='siege'){
        var tower=this.world.nodes[e.siegeTarget]&&this.world.nodes[e.siegeTarget].slot.tower;
        if(!tower||!this.world.nodes[e.siegeTarget].sealed){
          e.state='walk';e.siegeTarget=null;
          // 就近重新寻路
          var near=this.nearestNode(e.pos);e.u=near;
          var p=this.pathFromNode(near);e.path=p;e.pi=0;
          if(p&&p.nodes[1])e.v=p.nodes[1];
        }else{
          var sp=e.speed*.9*dt;
          var d=e.pos.distanceTo(e.siegePoint);
          if(d>.15){e.pos.lerp(e.siegePoint,Math.min(1,sp/d));e.yaw=Math.atan2(e.siegePoint.x-e.pos.x,e.siegePoint.z-e.pos.z);}
          else{
            e.atkCd-=dt;
            if(e.atkCd<=0){e.atkCd=e.atkRate;
              this.damageTower(tower,e.baseDmg,false,e);
              G.Units.FX.beam(world.fxGroup,e.pos.clone().setY(.6),
                new THREE.Vector3(tower.slot.pos.x,1,tower.slot.pos.z),0x41d6ff,.06);
              G.Audio.sfx('wormHit');
            }
          }
        }
      }else{
        // 蜜罐吸引
        if((e.type==='worm'||e.type==='flood')&&!e.luredBy){
          var pot=this.findHoneypotFor(e);
          if(pot){e.luredBy=pot;pot.lured.push(e);}
        }
        if(e.luredBy&&this.towers.indexOf(e.luredBy)<0){e.luredBy=null;}
        if(e.luredBy&&(e.type==='worm'||e.type==='flood')){
          var pot2=e.luredBy,pp=new THREE.Vector3(pot2.slot.pos.x,0,pot2.slot.pos.z);
          var dd=e.pos.distanceTo(pp);
          if(dd>.55){
            var spd2=e.speed*dt;e.pos.lerp(pp,Math.min(1,spd2/dd));
            e.yaw=Math.atan2(pp.x-e.pos.x,pp.z-e.pos.z);
          }else{
            e.atkCd-=dt;
            if(e.atkCd<=0){e.atkCd=e.atkRate;this.damageTower(pot2,e.baseDmg,false,e);
              G.Audio.sfx('wormHit');}
          }
        }else{
          this.walkEnemy(e,dt,ed);
        }
      }
      // 护盾气泡
      if(e.shield>0){if(!e._sb){e._sb=G.Units.attachShieldBubble(e.model.group,.65*ed.scale,0x9db4ff);}}
      else if(e._sb){e.model.group.remove(e._sb);e._sb=null;}
    }
    // 模型
    G.Units.updateEnemyModel(e.model,e.type,{time:e.t,dt:dt,revealed:e.revealed,
      attackT:e.atkCd>e.atkRate-.2?.2:0,stage:e.phase});
    this.updateEnemyBars(e);
  }
};
this.updateEnemyBars=function(e){
  G.Units.setHealthBar(e.model.bar,e.hp/e.maxHp,e.boss?0xff5577:0xffaa44);
  e.model.bar.visible=(e.hp<e.maxHp)||e.boss;
};
this.updateFlying=function(e,dt,ed){
  var en=this.mapDef.nodes.find(n=>n.id===e.entry);
  var ex=this.mapDef.nodes.find(n=>n.id===e.exitId);
  if(e._ft===undefined)e._ft=0;
  e._ft+=dt*e.speed/Math.hypot(ex.x-en.x,ex.z-en.z);
  var k=Math.min(1,e._ft);
  e.pos.set(G.lerp(en.x,ex.x,k),2.6,G.lerp(en.z,ex.z,k));
  e.model.group.position.copy(e.pos);
  if(k>=1)this.leakEnemy(e);
};
this.walkEnemy=function(e,dt,ed){
  // 确保路径有效
  if(!e.path||!isFinite(this.dist[e.u]===undefined?Infinity:this.dist[e.u])){
    var p=this.pathFromNode(e.u);e.path=p;e.pi=0;
    if(p&&p.nodes[1])e.v=p.nodes[1];
  }
  if(e.v===undefined||e.v===null){
    var p2=this.pathFromNode(e.u);e.path=p2;e.pi=0;
    if(p2)e.v=p2.nodes[1];
  }
  var ei=this.enemyEdge(e);
  var slow=1;
  if(ei>=0){
    var edge=this.mapDef.edges[ei];
    if(edge.old||this.downEdges[ei]){slow=.55;if(edge.old||this.downEdges[ei])e.revealed=true;}
  }
  if(e.slowT>0)slow*=.5;
  // 阻挡检测
  if(e.blockCap>0&&!e.luredBy){
    var blocker=this.findBlocker(e,ei);
    if(blocker){
      e.state='blocked';e._blocker=blocker;
      e.atkCd-=dt;
      if(e.atkCd<=0){
        e.atkCd=e.atkRate;
        this.damageTower(blocker,e.baseDmg,false,e);
        G.Audio.sfx('wormHit');
        // 蠕虫在阻挡时显形无关；木马被阻挡则显形
        if(e.type==='trojan'&&!e.revealed){e.revealed=true;}
      }
      return;
    }else{e.state='walk';e._blocker=null;}
  }
  // 前进
  var curve=ei>=0?this.world.edges[ei].curve:null;
  if(!curve)return;
  var edgeLen=this.world.edges[ei].len;
  e.progress+=e.speed*slow*dt/edgeLen;
  if(e.progress>=1){
    var reached=e.v;
    // 到交换节点：蠕虫复制
    var nodeDef=this.mapDef.nodes.find(n=>n.id===reached);
    if(e.type==='worm'&&!e.copyUsed&&nodeDef&&nodeDef.type==='switch'&&!this.world.nodes[reached].sealed){
      e.copyUsed=true;
      var clone=this.spawnEnemy('worm',e.entry,{clone:true,hpMul:.85});
      if(clone){clone.u=reached;var cp=this.pathFromNode(reached);clone.path=cp;clone.pi=0;
        clone.v=cp?cp.nodes[1]:null;clone.progress=0;
        var np=this.nodePos(reached);clone.pos.set(np.x,.1,np.z);clone.model.group.position.copy(clone.pos);
        this.log('蠕虫在交换节点复制出同伴！','warn');}
    }
    if(nodeDef&&nodeDef.type==='exit'){
      e.pos.copy(curve.getPoint(1));e.model.group.position.copy(e.pos);
      this.leakEnemy(e);return;
    }
    e.u=reached;e.progress=0;
    var path=this.pathFromNode(e.u);e.path=path;e.pi=0;
    if(!path){return;}
    e.v=path.nodes[1];
    var curve2=this.world.edges[this.enemyEdge(e)].curve;
    e.pos.copy(curve2.getPoint(0));
  }else{
    var pt=curve.getPoint(e.progress);
    var tg=curve.getTangentAt(Math.min(1,e.progress+.01));
    e.pos.set(pt.x,pt.y,pt.z);
    e.yaw=Math.atan2(tg.x,tg.z);
  }
  // 横向偏移
  var c=this.world.edges[ei].curve;
  var tan=c.getTangentAt(Math.min(.99,e.progress));
  var off=new THREE.Vector3(-tan.z,0,tan.x).multiplyScalar(e.lateral*.5);
  var disp=e.pos.clone().add(off);
  disp.y+=Math.sin(e.t*8)*(e.type==='flood'?.12:.05);
  e.model.group.position.copy(disp);
  e.model.group.rotation.y=e.yaw;
};
this.nodePos=function(id){var n=this.mapDef.nodes.find(x=>x.id===id);return new THREE.Vector3(n.x,0,n.z);};
this.nearestNode=function(pos){
  var best=null,bd=1e9;
  this.mapDef.nodes.forEach(n=>{var d=Math.hypot(n.x-pos.x,n.z-pos.z);if(d<bd){bd=d;best=n.id;}});
  return best;
};
this.findBlocker=function(e,ei){
  if(ei<0)return null;
  // 找到当前链路上、位置在敌人前方且仍有余量的防火墙
  var slots=this.world.slots.filter(s=>s.kind==='link'&&s.edge===ei&&s.tower&&s.tower.type==='firewall');
  slots.sort((a,b)=>a.t-b.t);
  for(var i=0;i<slots.length;i++){
    var t=slots[i].tower,set=this.towerDef(t);
    if(t.t<e.progress+.02)continue;
    var used=this.enemies.filter(x=>x._blocker===t).reduce((s,x)=>s+x.blockCap,0);
    if(used+e.blockCap<=set.cap)return t;
  }
  return null;
};
this.findHoneypotFor=function(e){
  var best=null,bd=1e9;
  this.towers.forEach(function(t){
    if(t.type!=='honeypot')return;
    if(t.lured&&t.lured.length>=4)return;
    var d=G.dist2D(e.pos,t.slot.pos);var set=self.towerDef(t);
    // 被阻挡中或已经在蜜罐附近
    var blockedNow=e.state==='blocked'||d<1.2;
    if(blockedNow&&d<=set.lure&&d<bd){bd=d;best=t;}
  });
  return best;
};
this.pickRansomTarget=function(e,range){
  var pots=this.towers.filter(t=>t.type==='honeypot'&&G.dist2D(e.pos,t.slot.pos)<=range);
  var pool=pots.length?pots:this.towers.filter(t=>G.dist2D(e.pos,t.slot.pos)<=range);
  pool.sort((a,b)=>b.hp/b.maxHp-a.hp/a.maxHp);
  return pool[0]||null;
};
this.findSealedNodeNear=function(e,r){
  var best=null,bd=r;
  Object.keys(this.world.nodes).forEach(id=>{
    var n=self.world.nodes[id];
    if(n.def.type!=='switch'||!n.sealed)return;
    var d=Math.hypot(n.def.x-e.pos.x,n.def.z-e.pos.z);
    if(d<bd){bd=d;best=id;}
  });
  return best;
};
this._buildEdgeCosts=function(){
  return this._routingEdges().map(e=>({cost:e.cost}));
};

/* ---------- Boss 逻辑 ---------- */
this.bossLogic=function(e,dt){
  e.bossCd-=dt;
  if(e.type==='wankui'){
    // 阶段切换
    if(e.phase===0&&e.hp/e.maxHp<.5){
      e.phase=1;this.log('★ 万傀释放僵尸网络，成群蠕虫涌入！','danger');G.Audio.sfx('bossRoar');
      for(var i=0;i<8;i++){var c=this.spawnEnemy('worm',e.entry,{clone:true});if(c){c.u=e.u;c.v=e.v;c.progress=e.progress;c.pos.copy(e.pos);c.model.group.position.copy(e.pos);}}
    }
    if(e.bossCd<=0){
      e.bossCd=9;
      var sealed=this.findSealedNodeNear(e,16);
      if(sealed){
        var t=this.world.nodes[sealed].slot.tower;
        this.log('★ 万傀发动「洪峰」冲击隔离节点！','danger');
        G.Units.FX.ring(world.fxGroup,e.pos.clone().setY(.6),0xff3355,3);
        if(t){
          if(t.type==='isolator'){this.destroyTower(t,e);}
          else this.damageTower(t,130,false,e);
        }
      }
    }
  }else if(e.type==='shenlou'){
    if(e.phase===0&&e.hp/e.maxHp<.5){
      e.phase=1;this.log('★ 蜃楼发动「路由风暴」，剥夺附近塔的护盾！','danger');G.Audio.sfx('bossRoar');
      this.towers.forEach(t=>{if(G.dist2D(t.slot.pos,e.pos)<=7){t.shield=0;this.damageTower(t,18,false,e);}});
    }
    if(e.bossCd<=0){e.bossCd=11;
      var ei=this.bossPickBlackholeEdge();
      if(ei>=0)this.bossDoBlackhole(ei);
    }
  }else if(e.type==='zheying'){
    if(e.phase===0&&e.hp/e.maxHp<.7){
      e.phase=1;this.log('★ 蛰影提权：护甲强化，并放出木马！','danger');G.Audio.sfx('bossRoar');
      for(var i=0;i<4;i++){var c=this.spawnEnemy('trojan',e.entry);if(c){c.u=e.u;c.v=e.v;c.progress=e.progress;c.pos.copy(e.pos);c.model.group.position.copy(e.pos);}}
    }
    if(e.phase===1&&e.hp/e.maxHp<.35){
      e.phase=2;this.log('★ 蛰影进入破坏阶段！','danger');G.Audio.sfx('bossRoar');
      // 锁定前方边
      var path=this.pathFromNode(e.u);
      if(path&&path.edges.length){
        var idx=path.edges[Math.min(1,path.edges.length-1)];
        this.bossDoLock(idx);
      }
    }
    // 破坏阶段近战高伤
  }
};

/* ---------- 特效 ---------- */
this.updateFX=function(dt){
  for(var i=this.fxList.length-1;i>=0;i--){
    var f=this.fxList[i];f.life-=dt;
    var k=1-f.life/f.max;
    if(f.update)f.update(k,dt,this.time);
    var dead=f.life<=0;
    if(!dead&&f.obj&&f.obj.position&&f.to&&f.from){}
    if(dead){
      if(f.parts)f.parts.forEach(p=>world.fxGroup.remove(p));
      else if(f.obj)world.fxGroup.remove(f.obj);
      this.fxList.splice(i,1);
    }
  }
};
['beam','projectile','ring','burst','heal','shieldPulse','flash','web','warnMarker','spawnPortal'].forEach(function(n){
  var orig=G.Units.FX[n];
  G.Units.FX[n]=function(){var f=orig.apply(G.Units.FX,arguments);self.fxList.push(f);return f;};
});

this.pause=function(v){this.paused=v;G.Bus.emit('pause',v);};
this.setSpeed=function(s){this.speed=s;G.Bus.emit('speed',s);};
this.dispose=function(){
  this.running=false;
  this.scheduled=[];
  (this._timers||[]).forEach(t=>clearTimeout(t));
  G.Audio.suspend();
};
/* 演示/脚本专用：直接在槽位上放塔（不走资源），可指定等级/分支/朝向 */
this.scriptPlace=function(type,slotKey,opts){
  opts=opts||{};
  var slot=this.world.slots.find(s=>slotKey.kind==='node'?s.kind==='node'&&s.node===slotKey.node:
    slotKey.kind==='platform'?s.kind==='platform'&&s.plat===slotKey.plat:
    s.kind==='link'&&s.edge===slotKey.edge&&Math.abs(s.t-(slotKey.t||.5))<.2);
  if(!slot)return null;
  var t={id:G.uid(),type:type,level:opts.level||1,branch:opts.branch||null,slot:slot,
    hp:opts.hp||G.TOWERS[type].hp,maxHp:opts.hp||G.TOWERS[type].hp,
    shield:0,encryptT:0,cd:0,facing:opts.facing===undefined?Math.PI:opts.facing,aim:opts.facing===undefined?Math.PI:opts.facing,
    atkT:0,firing:0,attacking:false,attackT:0,skillT:0,pulse:0,healPulse:0,lured:[],kills:0,scripted:true};
  var model=G.Units.makeTowerMesh(type,t.level,t.branch,slot.kind);
  t.model=model;model.group.position.copy(slot.pos);
  if(slot.kind==='platform')model.group.position.y=1.32;
  world.unitGroup.add(model.group);
  slot.tower=t;this.towers.push(t);
  return t;
};
this.scriptSeal=function(nodeId){
  var slot=this.world.nodes[nodeId].slot;
  if(slot.tower)return slot.tower;
  var t=this.scriptPlace('gate',{kind:'node',node:nodeId});
  this.sealNode(nodeId,t);
  return t;
};
this.scriptUnseal=function(nodeId){
  var slot=this.world.nodes[nodeId].slot;
  if(slot.tower){
    var t=slot.tower;
    if(t.type==='isolator')this._removeTower(t,false);
    else this._removeTower(t,false);
  }
};
/* 脚本出兵（用于演示初始局面） */
this.scriptSpawn=function(type,entry,opts){
  opts=opts||{};
  var e=this.spawnEnemy(type,entry,opts);
  if(e&&opts.edge!==undefined){
    var ei=opts.edge;
    e.u=this.mapDef.edges[ei].a;e.v=this.mapDef.edges[ei].b;
    // 确定方向必须从入口路径可达
    e.progress=opts.progress||0;
    e.path=this.pathFromNode(e.u);
    if(e.path&&e.path.nodes[1]!==e.v){
      // 反向边
      e.v=this.mapDef.edges[ei].a;e.u=this.mapDef.edges[ei].b;
      e.path=this.pathFromNode(e.u);
    }
    var curve=this.world.edges[ei].curve;
    var p=curve.getPoint(e.progress);
    e.pos.set(p.x,p.y,p.z);e.model.group.position.copy(e.pos);
    if(opts.hpMul)e.maxHp=Math.round(e.maxHp*opts.hpMul),e.hp=e.maxHp;
  }
  return e;
};
};
