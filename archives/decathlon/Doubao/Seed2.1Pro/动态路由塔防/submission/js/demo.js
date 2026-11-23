/* ================= 实战演示（脚本编排 + 确定性导出） ================= */
G.Demo=(function(){
'use strict';
var world,game,ui;
var scenarios={};
var current=null;
var cursorEl=null,targetCursor={x:-50,y:-50},curCursor={x:-50,y:-50};

function init(){
  world=G.main.world;game=G.main.game;ui=G.main.ui;
  window.$=window.$||function(id){return document.getElementById(id);};
  cursorEl=document.createElement('div');
  cursorEl.id='fake-cursor';
  cursorEl.style.cssText='position:fixed;z-index:200;width:26px;height:26px;margin:-3px 0 0 -4px;pointer-events:none;'+
    'transition:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6));font-size:22px;line-height:26px;';
  cursorEl.textContent='🖱';
  document.body.appendChild(cursorEl);
}
function cardCenter(type){
  var cards=document.querySelectorAll('#tower-cards .tcard, #item-cards .tcard');
  for(var i=0;i<cards.length;i++){
    if(cards[i].dataset.type===type){
      var r=cards[i].getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2};
    }
  }
  return {x:60,y:200};
}
function nodeScreen(id){
  var n=world.nodes[id];var v=new THREE.Vector3(n.def.x,1.2,n.def.z).project(world.camera);
  return {x:(v.x*.5+.5)*window.innerWidth,y:(-v.y*.5+.5)*window.innerHeight};
}
function slotScreen(slot,y){
  var v=new THREE.Vector3(slot.pos.x,y||1,slot.pos.z).project(world.camera);
  return {x:(v.x*.5+.5)*window.innerWidth,y:(-v.y*.5+.5)*window.innerHeight};
}
function towerScreen(t){
  return slotScreen(t.slot,t.slot.kind==='platform'?2.4:1.4);
}
function edgeScreen(ei,t){
  var p=world.edges[ei].curve.getPointAt(t||.5);
  var v=new THREE.Vector3(p.x,.6,p.z).project(world.camera);
  return {x:(v.x*.5+.5)*window.innerWidth,y:(-v.y*.5+.5)*window.innerHeight};
}
function nodeSlot(id){return world.nodes[id].slot;}
function platSlot(pid){var p=world.platforms.find(x=>x.def.id===pid);return p?p.slot:null;}
function linkSlot(edgeIdx,t0){
  return world.slots.find(s=>s.kind==='link'&&s.edge===edgeIdx&&Math.abs(s.t-(t0===undefined?.5:t0))<.2);
}

/* 鼠标移动补间（模拟正常人速） */
function moveTo(actions,t,dur,getTarget){
  actions.push({t:t,dur:dur,kind:'move',get:getTarget});
}
/* =========================================================
   场景一：分段取舍（18 秒）
========================================================= */
scenarios['demo-1']=function(){
  var A={duration:18,fps:30};
  game.startMap(0,901);
  game.deterministic=true;
  // 初始布防：玩家已部署若干设备
  game.scriptPlace('firewall',{kind:'link',edge:1,t:.5});            // n1-n3
  var link7=world.slots.filter(s=>s.kind==='link'&&s.edge===7);       // n7-n2 旧链路
  if(link7[0])game.scriptPlace('interceptor',{kind:'platform',plat:'p1'},{facing:Math.PI*.78});
  game.scriptPlace('interceptor',{kind:'platform',plat:'p3'},{facing:Math.PI*.2});
  game.scriptPlace('sandbox',{kind:'platform',plat:'p7'});
  // 第一波已经在打
  game.waveIndex=1;
  game.waveActive=true;
  game.spawnQueue=[
    {type:'worm',entry:'A',at:game.time+0.2},{type:'worm',entry:'A',at:game.time+1.4},
    {type:'worm',entry:'A',at:game.time+2.8},{type:'worm',entry:'A',at:game.time+5.2},
    {type:'worm',entry:'A',at:game.time+8.5},{type:'worm',entry:'B',at:game.time+3.4},
    {type:'worm',entry:'B',at:game.time+6.0},{type:'trojan',entry:'B',at:game.time+9.5}
  ];
  game.refreshRoutesVisual&&game.refreshRoutesVisual();
  ui.refreshBuildBar&&0;
  A.setup=function(){
    document.getElementById('btn-next-wave').style.visibility='hidden';
    $('demo-bar').classList.remove('hidden');$('demo-title').textContent='实战演示 01 · 分段取舍';
  };
  var acts=A.actions=[];
  acts.push({t:0,dur:0,kind:'cam',pos:new THREE.Vector3(6,30,30),tgt:new THREE.Vector3(0,0,2)});
  acts.push({t:0,dur:.2,kind:'sub',text:'分段内网 · 敌人沿办公网段（西侧）压向核心'});
  acts.push({t:3.2,dur:.2,kind:'sub',text:'拖入网闸，准备隔离西边界节点'});
  moveTo(acts,3.4,.7,()=>cardCenter('gate'));
  acts.push({t:4.1,dur:.1,kind:'mousedown'});
  moveTo(acts,4.2,2.0,()=>nodeScreen('n7'));
  acts.push({t:5.0,dur:0,kind:'preview',node:'n7',on:true});
  acts.push({t:5.0,dur:.1,kind:'sub',text:'白色虚线：A 将折向 DMZ 互联，与 B 汇流'});
  // 移动到聚焦视角（全程保持光标在节点附近）
  acts.push({t:6.0,dur:1.0,kind:'cam',pos:new THREE.Vector3(-14,15,6),tgt:new THREE.Vector3(-4,0,-1)});
  moveTo(acts,6.2,.6,()=>nodeScreen('n7'));
  acts.push({t:6.6,dur:.1,kind:'mouseup'});
  acts.push({t:6.7,dur:0,kind:'dropGate',node:'n7'});
  acts.push({t:6.8,dur:.2,kind:'sub',text:'确认隔离！办公网段的蠕虫正在掉头改道'});
  acts.push({t:7.0,dur:.3,kind:'cursorHide'});
  acts.push({t:9.5,dur:1.2,kind:'cam',pos:new THREE.Vector3(-2,17,2),tgt:new THREE.Vector3(0,0,-2)});
  acts.push({t:10.0,dur:.1,kind:'cursorShow'});
  moveTo(acts,10.2,.8,()=>cardCenter('sandbox'));
  acts.push({t:11.0,dur:.1,kind:'mousedown'});
  moveTo(acts,11.1,.9,()=>platScreenSafe('p2'));
  acts.push({t:12.0,dur:.1,kind:'mouseup'});
  acts.push({t:12.1,dur:0,kind:'dropTower',type:'sandbox',plat:'p2'});
  acts.push({t:12.1,dur:.2,kind:'sub',text:'汇流点补一台沙箱，处理汇聚流量并使木马显形'});
  acts.push({t:12.4,dur:.3,kind:'cursorHide'});
  acts.push({t:14.0,dur:2.6,kind:'cam',pos:new THREE.Vector3(6,22,26),tgt:new THREE.Vector3(0,0,3)});
  acts.push({t:14.2,dur:.2,kind:'sub',text:'改道后的流量在 DMZ 汇聚，防线稳住了这一波'});
  acts.push({t:17.6,dur:.3,kind:'sub',text:'演示结束'});
  return A;
};
function platScreenSafe(pid){var s=platSlot(pid);return s?slotScreen(s,2.4):{x:window.innerWidth/2,y:window.innerHeight/2};}

/* =========================================================
   场景二：旁路直通（20 秒）
========================================================= */
scenarios['demo-2']=function(){
  var A={duration:20,fps:30};
  game.startMap(1,902);
  game.deterministic=true;
  // 初始：汇聚节点 o1 已被网闸隔离（C 走 X，B 走 Y），洪峰波次进行中
  game.scriptPlace('firewall',{kind:'link',edge:6,t:.5});            // a1-m
  game.scriptPlace('interceptor',{kind:'platform',plat:'p3'},{facing:Math.PI*.15});
  game.scriptPlace('interceptor',{kind:'platform',plat:'p4'},{facing:Math.PI*1.1});
  game.scriptPlace('repair',{kind:'platform',plat:'p5'});
  var gate=game.scriptPlace('gate',{kind:'node',node:'o1'});
  game.sealNode('o1',gate);
  game.compute=400;game.intel=4;
  game.waveIndex=7;game.waveActive=true;
  game.spawnQueue=[
    {type:'flood',entry:'C',at:game.time+.4},
    {type:'worm',entry:'A',at:game.time+.8},{type:'worm',entry:'A',at:game.time+1.6},{type:'worm',entry:'A',at:game.time+2.5},
    {type:'worm',entry:'B',at:game.time+1.2},{type:'worm',entry:'B',at:game.time+2.2},
    {type:'flood',entry:'A',at:game.time+4.0},{type:'trojan',entry:'B',at:game.time+5.5}
  ];
  // 安排洪泛团冲垮 o1 网闸
  game.schedule(9.2,function(){
    var g=world.nodes.o1.slot.tower;
    if(g)game.destroyTower(g,null);
  });
  A.setup=function(){
    document.getElementById('btn-next-wave').style.visibility='hidden';
    $('demo-bar').classList.remove('hidden');$('demo-title').textContent='实战演示 02 · 旁路直通（洪峰）';
  };
  var acts=A.actions=[];
  acts.push({t:0,dur:0,kind:'cam',pos:new THREE.Vector3(2,26,24),tgt:new THREE.Vector3(0,0,4)});
  acts.push({t:0,dur:.2,kind:'sub',text:'骨干流域洪峰：汇聚节点被隔离，C→X、B→Y'});
  acts.push({t:2.2,dur:1.0,kind:'cam',pos:new THREE.Vector3(-12,14,2),tgt:new THREE.Vector3(-3,0,6)});
  acts.push({t:2.4,dur:.2,kind:'sub',text:'洪泛团脱离编队，向被隔离的汇聚节点冲锋'});
  // 玩家此时去拿协议降级道具
  moveTo(acts,3.6,.7,()=>cardCenter('downgrade'));
  acts.push({t:4.3,dur:.1,kind:'mousedown'});
  // 瞄准 A 路线 a1-m（边 6）
  moveTo(acts,4.4,1.6,()=>edgeScreen(6,.55));
  acts.push({t:5.6,dur:.1,kind:'sub',text:'在 A 的路线上确认协议降级：减速并使伪装显形'});
  acts.push({t:6.0,dur:.1,kind:'mouseup'});
  acts.push({t:6.1,dur:0,kind:'dropDowngrade',edge:6});
  acts.push({t:6.3,dur:.3,kind:'cursorHide'});
  acts.push({t:7.2,dur:1.4,kind:'cam',pos:new THREE.Vector3(-2,13,-2),tgt:new THREE.Vector3(-1,0,7)});
  acts.push({t:8.4,dur:.2,kind:'sub',text:'节点上的网闸被冲垮——旁路直通！'});
  acts.push({t:9.4,dur:.2,kind:'sub',text:'C、B 的路线重新收敛，回到原来的数据中心'});
  acts.push({t:10.0,dur:1.6,kind:'cam',pos:new THREE.Vector3(4,22,22),tgt:new THREE.Vector3(0,0,5)});
  // 玩家用备份还原支援西侧拦截器
  acts.push({t:11.5,dur:.1,kind:'cursorShow'});
  moveTo(acts,11.6,.7,()=>cardCenter('backup'));
  acts.push({t:12.3,dur:.1,kind:'mousedown'});
  var targetTower=null;
  moveTo(acts,12.4,.8,function(){
    targetTower=game.towers.find(t=>t.slot.kind==='platform'&&t.slot.plat==='p3');
    return targetTower?towerScreen(targetTower):{x:200,y:200};
  });
  acts.push({t:13.2,dur:.1,kind:'mouseup'});
  acts.push({t:13.3,dur:0,kind:'doBackup',plat:'p3'});
  acts.push({t:13.3,dur:.2,kind:'sub',text:'备份还原受损拦截器，守住降级后的 A 路线'});
  acts.push({t:13.7,dur:.3,kind:'cursorHide'});
  acts.push({t:15.0,dur:3.2,kind:'cam',pos:new THREE.Vector3(0,24,26),tgt:new THREE.Vector3(0,0,4)});
  acts.push({t:15.2,dur:.2,kind:'sub',text:'改道、减速与抢修连环奏效，洪峰被两座数据中心分流化解'});
  acts.push({t:19.6,dur:.3,kind:'sub',text:'演示结束'});
  return A;
};

/* =========================================================
   场景三：蛰影现身（20 秒）
========================================================= */
scenarios['demo-3']=function(){
  var A={duration:20,fps:30};
  game.startMap(2,903);
  game.deterministic=true;
  game.scriptPlace('firewall',{kind:'link',edge:0,t:.5});            // n1-n2
  game.scriptPlace('interceptor',{kind:'platform',plat:'p1'},{facing:Math.PI});
  game.scriptPlace('sandbox',{kind:'platform',plat:'p9'});
  game.scriptPlace('interceptor',{kind:'platform',plat:'p2'},{facing:Math.PI*.35});
  var repair=game.scriptPlace('repair',{kind:'platform',plat:'p7'});
  repair.cd=0;
  game.compute=500;game.intel=4;
  // 第 16 波：Boss 从 A 入场，已到环北侧
  game.waveIndex=15;game.waveActive=true;
  var boss=game.scriptSpawn('zheying','A',{edge:6,progress:.5,hpMul:4});
  boss.phase=1;boss._detected=true;boss.bossCd=999;
  // 直接编排阶段切换与锁死（关键事件由演示直接触发，之后逻辑实时演出）
  game.schedule(4.2,function(){
    if(boss.state==='dead')return;
    boss.phase=2;
    var ed=world.mapDef.edges.findIndex(e=>(e.a==='n1'&&e.b==='n2')||(e.a==='n2'&&e.b==='n1'));
    var pos=world.edges[ed].curve.getPointAt(.5).setY(.5);
    G.Units.FX.warnMarker(world.fxGroup,pos,0x7cff9e);
    game.log('★ 蛰影进入破坏阶段，前方运维环即将被锁死！','danger');
    G.Audio.sfx('bossRoar');
    game.schedule(2.4,function(){
      game.blockedEdges[ed]='lock';
      world.setEdgeBlocked(ed,'lock');
      game.rerouteAll();
      G.Audio.sfx('lock');
      game.log('运维环一段被锁死，路线重新收敛！','danger');
    });
  });
  game.spawnQueue=[
    {type:'trojan',entry:'A',at:game.time+1.2},{type:'trojan',entry:'A',at:game.time+3.0},
    {type:'flood',entry:'B',at:game.time+2.2},{type:'worm',entry:'C',at:game.time+4.0},
    {type:'ransom',entry:'C',at:game.time+6.5},{type:'worm',entry:'A',at:game.time+8}
  ];
  // 修一些塔的损伤以便技能有意义
  game.towers.forEach(function(t,i){t.hp=t.maxHp*(.55+.08*i);t.shield=0;});
  A.setup=function(){
    document.getElementById('btn-next-wave').style.visibility='hidden';
    $('demo-bar').classList.remove('hidden');$('demo-title').textContent='实战演示 03 · 蛰影现身';
  };
  var acts=A.actions=[];
  acts.push({t:0,dur:0,kind:'cam',pos:new THREE.Vector3(2,22,20),tgt:new THREE.Vector3(0,0,0)});
  acts.push({t:0,dur:.2,kind:'sub',text:'气隙深层第 16 波：Boss「蛰影」已被沙箱检测，沿运维环逼近'});
  acts.push({t:2.2,dur:1.4,kind:'cam',pos:new THREE.Vector3(-2,12,2),tgt:new THREE.Vector3(-2,0,-4)});
  acts.push({t:3.2,dur:.2,kind:'sub',text:'预警标记出现——蛰影准备锁死前方运维环'});
  acts.push({t:6.8,dur:.2,kind:'sub',text:'锁死完成，各入口的路线重新收敛，压力转向两侧通道'});
  acts.push({t:7.2,dur:1.2,kind:'cam',pos:new THREE.Vector3(-6,13,12),tgt:new THREE.Vector3(-2,0,6)});
  // 选中修复进程并放技能
  acts.push({t:8.6,dur:.1,kind:'cursorShow'});
  moveTo(acts,8.7,.8,function(){return towerScreen(repair);});
  acts.push({t:9.5,dur:.15,kind:'click'});
  acts.push({t:9.7,dur:0,kind:'inspect',tower:repair});
  // 移动到技能按钮
  function skillBtn(){
    var b=document.querySelector('#inspect [data-act="skill"]');
    var r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
  }
  moveTo(acts,10.0,.7,skillBtn);
  acts.push({t:10.7,dur:.15,kind:'click'});
  acts.push({t:10.9,dur:0,kind:'skill',tower:repair});
  acts.push({t:10.9,dur:.2,kind:'sub',text:'冗余切换！护盾展开、加密解除，南翼防线维持住了'});
  acts.push({t:11.3,dur:.3,kind:'cursorHide'});
  acts.push({t:12.2,dur:1.6,kind:'cam',pos:new THREE.Vector3(3,13,-3),tgt:new THREE.Vector3(-1,0,-3)});
  acts.push({t:13.2,dur:.2,kind:'sub',text:'火力在收窄的通道里集中，蛰影被持续压制'});
  acts.push({t:15.0,dur:3.2,kind:'cam',pos:new THREE.Vector3(2,22,22),tgt:new THREE.Vector3(0,0,2)});
  acts.push({t:15.4,dur:.2,kind:'sub',text:'两个核心相互牵制——改道、护盾与检测共同扛过了最危险的阶段'});
  acts.push({t:19.6,dur:.3,kind:'sub',text:'演示结束'});
  return A;
};

/* =========================================================
   动作执行
========================================================= */
function applyAction(a,timeIn){
  switch(a.kind){
    case 'sub':ui.subtitle(a.text);break;
    case 'cam':world.flyTo(a.pos.clone?a.pos.clone():a.pos,a.tgt.clone?a.tgt.clone():a.tgt,1.2);break;
    case 'moused':break;
    case 'mousedown':curCursor.down=true;cursorEl.textContent='🖱';break;
    case 'mouseup':curCursor.down=false;cursorEl.textContent='🖱';break;
    case 'click':curCursor.down=true;setTimeout(function(){curCursor.down=false;},60);break;
    case 'cursorHide':targetCursor={x:-50,y:-50};curCursor.off=true;break;
    case 'cursorShow':curCursor.off=false;break;
    case 'preview':{
      var pv=game.previewChange('seal',a.node);
      world.showPreview(pv.routes,pv.ok?null:{node:a.node});
      break;}
    case 'dropGate':{
      world.hidePreview();
      game.nodeCd=game.nodeCd||{};
      var t=game.scriptPlace('gate',{kind:'node',node:a.node});
      game.sealNode(a.node,t);
      G.Audio.sfx('seal');
      break;}
    case 'dropTower':{
      game.scriptPlace(a.type,{kind:'platform',plat:a.plat});
      G.Audio.sfx('build');
      G.Units.FX.ring(world.fxGroup,
        new THREE.Vector3(platSlot(a.plat).pos.x,2,platSlot(a.plat).pos.z),0x37e2ff,2);
      break;}
    case 'dropDowngrade':{
      var res=game.applyDowngrade(a.edge);
      if(!res.ok)ui.toast(res.reason,'danger');
      break;}
    case 'doBackup':{
      var tt=game.towers.find(t=>t.slot.kind==='platform'&&t.slot.plat===a.plat);
      if(tt){game.compute=Math.max(game.compute,80);game.applyBackup(tt);}
      break;}
    case 'inspect':ui.showTowerInspect(a.tower);break;
    case 'skill':{
      var r=game.useSkill(a.tower);
      if(!r.ok)ui.toast(r.reason,'danger');
      ui.showTowerInspect(a.tower);
      break;}
  }
}
function advanceMove(a,k){
  var from=a.from||(a.from={x:curCursor.x,y:curCursor.y});
  var to=a.get();
  var e=G.easeInOut(k);
  targetCursor.x=G.lerp(from.x,to.x,e);
  targetCursor.y=G.lerp(from.y,to.y,e);
  curCursor.off=false;
}

/* =========================================================
   运行控制
========================================================= */
function runScenario(id,exportMode){
  current={id:id,exportMode:!!exportMode};
  var build=scenarios[id];
  var A=build();
  current.A=A;current.time=0;
  A.setup&&A.setup();
  ui.mode='demo';
  game.paused=false;
  curCursor={x:-50,y:-50,off:true,down:false};targetCursor={x:-50,y:-50};
  // 归一化动作时间
  A.actions.forEach(function(a){a.firedStart=false;a.fired=false;a.from=null;});
  if(exportMode){
    // 导出：直接由 frame() 推进
  }else{
    current.raf=true;
    var last=performance.now();
    function loop(now){
      if(!current||!current.raf)return;
      var dt=Math.min(.05,(now-last)/1000);last=now;
      tick(dt);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }
  return A;
}
function tick(dt){
  if(!current)return;
  current.time+=dt;
  var t=current.time,A=current.A;
  // 推进游戏（1 倍速）
  if(!game.over)game.simAdvance(dt);
  // 动作：带持续时间的（移动/相机/字幕）在窗口内插值；瞬时动作在 t 触发
  A.actions.forEach(function(a){
    if(t>=a.t&&t<=a.t+a.dur){
      if(a.kind==='move'){advanceMove(a,(t-a.t)/a.dur);}
    }
    if(!a.fired&&t>=a.t){
      a.fired=true;
      if(a.kind!=='move')applyAction(a,0);
    }
  });
  // 光标
  curCursor.x=G.lerp(curCursor.x,targetCursor.x,Math.min(1,dt*16));
  curCursor.y=G.lerp(curCursor.y,targetCursor.y,Math.min(1,dt*16));
  cursorEl.style.left=curCursor.x+'px';cursorEl.style.top=curCursor.y+'px';
  cursorEl.style.display=curCursor.off?'none':'block';
  // 世界渲染由 main 主循环负责（demo 时 game.update 因 paused=false 也会走；为避免双推进，导出时主循环不推进）
  if(t>=A.duration){
    finish();
  }
}
function finish(){
  ui.subtitle(null);
  if(current&&!current.exportMode){
    current.raf=false;
    // 停留 1.2 秒后回到菜单
    setTimeout(function(){stopDemo();},1200);
  }
}
function stopDemo(){
  if(!current)return;
  var wasDemo=!!current;
  current=null;
  cursorEl.style.display='none';
  $('demo-bar').classList.add('hidden');
  ui.subtitle(null);
  var btn=document.getElementById('btn-next-wave');if(btn)btn.style.visibility='';
  game.dispose();
  ['hud-top','build-bar','forecast','log-console'].forEach(function(id){document.getElementById(id).classList.add('hidden');});
  ui.hideInspect&&ui.hideInspect();
  ui.showMenu();
}
document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('btn-demo-exit').addEventListener('click',function(){
    G.Audio.sfx('click');stopDemo();
  });
});

function start(id){
  initOnce();
  $('modal-layer').innerHTML='';
  ['hud-top','build-bar','forecast','log-console'].forEach(function(id2){document.getElementById(id2).classList.remove('hidden');});
  runScenario(id,false);
}
var inited=false;
function initOnce(){if(!inited){inited=true;init();}}

/* =========================================================
   视频导出接口
========================================================= */
window.videoExport={
  runs:['demo-1','demo-2','demo-3'],
  begin:function(runId,opts){
    initOnce();
    opts=opts||{};
    var A=runScenario(runId,true);
    A.fps=opts.fps||30;
    current.fps=A.fps;
    var frames=Math.ceil(A.duration*A.fps);
    A.frames=frames;
    ui.subtitle(null);
    return Promise.resolve({frames:frames});
  },
  frame:function(i){
    if(!current)return;
    var A=current.A,dt=1/current.fps,t=i/current.fps;
    current.time=t;
    // 到时刻 t 的动作
    A.actions.forEach(function(a){
      if(!a.fired&&t>=a.t-1e-6){a.fired=true;if(a.kind!=='move')applyAction(a,0);}
      if(a.kind==='move'&&t>=a.t&&t<=a.t+a.dur){
        if(!a.from)a.from={x:curCursor.x,y:curCursor.y};
        advanceMove(a,(t-a.t)/a.dur);
      }
    });
    // 游戏推进到 t
    game.simAdvance(dt);
    // 光标直接到位（确定性）
    curCursor.x=targetCursor.x;curCursor.y=targetCursor.y;
    cursorEl.style.left=curCursor.x+'px';cursorEl.style.top=curCursor.y+'px';
    cursorEl.style.display=curCursor.off?'none':'block';
    // 立即渲染该帧（主循环在导出模式跳过渲染以避免重复推进）
    G.main.renderFrame();
  },
  end:function(){
    stopDemo();
    return Promise.resolve();
  }
};

return {start:start,init:initOnce,get current(){return current;}};
})();
