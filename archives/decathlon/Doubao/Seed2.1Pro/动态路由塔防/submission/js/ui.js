/* ================= 界面系统：菜单/选关/图鉴/HUD/部署/检查面板/报告 ================= */
G.UI=function(world,game){
'use strict';
var THREE=window.THREE;
var self=this;
this.world=world;this.game=game;
this.mode='menu'; // menu | battle | demo
var $=function(id){return document.getElementById(id);};
var ghost=null,dragType=null,dragKind=null,aimMode=false;
var hoverSlot=null,hoverEdge=null,hoverNode=null,hoverTower=null;
var rangeCircle=null,facingLine=null,previewShown=null;
var cursor={el:null,visible:true};

/* ---------- 模态层 ---------- */
function modal(html){
  var layer=$('modal-layer');layer.innerHTML='';
  var bg=G.el('<div class="modal-bg"><div class="modal"></div></div>');
  bg.querySelector('.modal').innerHTML=html;
  layer.appendChild(bg);
  return {bg:bg,root:bg.querySelector('.modal'),close:function(){layer.innerHTML='';}};
}

/* =========================================================
   主菜单
========================================================= */
this.showMenu=function(){
  this.mode='menu';
  G.Audio.suspend();
  var m=modal('');
  m.root.innerHTML=
    '<h1>网络安全攻防战</h1>'+
    '<div class="sub">动态路由塔防 · DYNAMIC ROUTING DEFENSE</div>'+
    '<div class="menu-grid">'+
      '<div class="menu-entry" data-act="start"><div class="me-ico">🛰</div><div class="me-name">开始值守</div><div class="me-desc">选择战场网络，守护中枢</div></div>'+
      '<div class="menu-entry" data-act="demo"><div class="me-ico">🎬</div><div class="me-name">实战演示</div><div class="me-desc">三段编排战局实时演出</div></div>'+
      '<div class="menu-entry" data-act="codex"><div class="me-ico">📖</div><div class="me-name">作战手册</div><div class="me-desc">设备手册 / 威胁档案</div></div>'+
    '</div>'+
    '<div class="menu-foot">'+
      '<button data-act="help">操作说明</button>'+
      '<button data-act="about">系统简介</button>'+
    '</div>'+
    '<div style="text-align:center;color:var(--text-dim);font-size:11px;margin-top:24px;letter-spacing:2px">汐域网络守护进程 v1.0 · 中键环绕 / Shift+中键平移 / 滚轮缩放</div>';
  m.root.querySelector('[data-act="start"]').onclick=function(){G.Audio.sfx('click');self.showMapSelect();};
  m.root.querySelector('[data-act="demo"]').onclick=function(){G.Audio.sfx('click');self.showDemoList();};
  m.root.querySelector('[data-act="codex"]').onclick=function(){G.Audio.sfx('click');self.showCodex();};
  m.root.querySelector('[data-act="help"]').onclick=function(){G.Audio.sfx('click');self.showHelp();};
  m.root.querySelector('[data-act="about"]').onclick=function(){G.Audio.sfx('click');self.showAbout();};
  // 菜单背景：一个空战场
  world.setMap(G.MAPS[0]);
};
this.showAbout=function(){
  var m=modal('');
  m.root.innerHTML=
    '<button class="x-close">✕</button><h2>系统简介</h2>'+
    '<div style="font-size:14px;line-height:2;color:var(--text-dim)">'+
    '自治域「汐域」遭攻击组织「蛰影」入侵：蠕虫、木马、勒索软件与僵尸网络混在正常流量中，涌向保存全域数据的「中枢」。<br><br>'+
    '你是汐域的<b style="color:var(--cyan)">守护进程</b>。在悬浮的立体网络中部署防火墙、蜜罐、拦截器等六种设备，抵御恶意程序；'+
    '通过隔离交换节点、投放情报道具，实时改变入侵路线。链路同时承载正常业务——任何操作都不能让入口彻底失去通往中枢的连通。<br><br>'+
    '三张战场：企业内网「分段内网」、跨网专线「骨干流域」、工控网「气隙深层」，各自面对一位 Boss：万傀、蜃楼与蛰影。'+
    '</div>';
  m.root.querySelector('.x-close').onclick=function(){G.Audio.sfx('click');self.showMenu();};
};
this.showHelp=function(){
  var m=modal('');
  m.root.innerHTML=
    '<button class="x-close">✕</button><h2>操作说明</h2>'+
    '<div class="codex-grid" style="grid-template-columns:1fr 1fr">'+
    '<div class="codex-item"><div class="ci-ico">🖱</div><div><div class="ci-name">镜头（同 Blender）</div><div class="ci-text">中键拖动：环绕；Shift + 中键：平移；滚轮：缩放。按 N 或点 ⌂ 回到默认视角，整张地图完整可见。</div></div></div>'+
    '<div class="codex-item"><div class="ci-ico">🧱</div><div><div class="ci-name">部署</div><div class="ci-text">从左侧把设备卡片拖到地图：防火墙可放链路或交换节点，蜜罐仅链路，网闸仅节点，拦截器/沙箱/修复进程放高台上。拖放时显示作用范围。</div></div></div>'+
    '<div class="codex-item"><div class="ci-ico">🎯</div><div><div class="ci-name">朝向</div><div class="ci-text">拦截器部署时由鼠标设定攻击朝向，左键确认、右键/Esc 取消。</div></div></div>'+
    '<div class="codex-item"><div class="ci-ico">🔀</div><div><div class="ci-name">改道与预览</div><div class="ci-text">在节点放防火墙/网闸即隔离节点，确认前白色虚线预览各入口新路线；会封死入口的操作会被拒绝。撤下节点设备后有 8 秒旁路重建间隔。</div></div></div>'+
    '<div class="codex-item"><div class="ci-ico">🔧</div><div><div class="ci-name">升级与撤下</div><div class="ci-text">点选已部署设备，在右侧面板升级（蜜罐、拦截器 2 级二选一）、释放主动技能或撤下（返还 50% 算力）。塔被摧毁不退款。</div></div></div>'+
    '<div class="codex-item"><div class="ci-ico">⏱</div><div><div class="ci-name">节奏</div><div class="ci-text">空格暂停，1×/2× 加速。右侧「流量预报」查看下一波威胁，点击开始。</div></div></div>'+
    '</div>';
  m.root.querySelector('.x-close').onclick=function(){G.Audio.sfx('click');self.showMenu();};
};

/* =========================================================
   选关
========================================================= */
this.showMapSelect=function(){
  var m=modal('');
  var cards=G.MAPS.map(function(d,i){
    return '<div class="map-card" data-i="'+i+'">'+
      '<div class="mc-preview"><canvas width="420" height="150" data-map="'+i+'"></canvas></div>'+
      '<div class="mc-body"><div class="mc-name">'+d.name+'</div>'+
      '<div class="mc-tag">'+d.sub+'</div>'+
      '<div class="mc-desc">'+d.desc+'</div>'+
      '<div class="mc-meta"><span>入口 '+d.nodes.filter(n=>n.type==='entry').length+'</span>'+
      '<span>出口 '+d.nodes.filter(n=>n.type==='exit').length+'</span>'+
      '<span>波次 '+d.waves.length+'</span></div></div></div>';
  }).join('');
  m.root.innerHTML='<button class="x-close">✕</button><h2>选择战场</h2>'+
    '<div class="sub">三张网络可直接进入，结构与布防思路各不相同</div><div class="map-cards">'+cards+'</div>';
  m.root.querySelector('.x-close').onclick=function(){G.Audio.sfx('click');self.showMenu();};
  Array.prototype.forEach.call(m.root.querySelectorAll('.map-card'),function(c){
    c.onclick=function(){G.Audio.sfx('click');self.enterMap(parseInt(c.dataset.i));};
  });
  // 小地图预览
  Array.prototype.forEach.call(m.root.querySelectorAll('canvas[data-map]'),function(cv){
    drawMapPreview(cv,G.MAPS[parseInt(cv.dataset.map)]);
  });
};
function drawMapPreview(cv,def){
  var g=cv.getContext('2d');
  g.fillStyle='#07121e';g.fillRect(0,0,cv.width,cv.height);
  var xs=def.nodes.map(n=>n.x),zs=def.nodes.map(n=>n.z);
  var minx=Math.min.apply(null,xs),maxx=Math.max.apply(null,xs),minz=Math.min.apply(null,zs),maxz=Math.max.apply(null,zs);
  var sc=Math.min((cv.width-40)/(maxx-minx),(cv.height-30)/(maxz-minz));
  function P(n){return [cv.width/2+(n.x-(minx+maxx)/2)*sc,cv.height/2+(n.z-(minz+maxz)/2)*sc];}
  g.lineWidth=3;
  def.edges.forEach(function(e){
    var a=def.nodes.find(n=>n.id===e.a),b=def.nodes.find(n=>n.id===e.b),pa=P(a),pb=P(b);
    g.strokeStyle=e.old?'#d99a3a':'#2f8fc0';g.setLineDash(e.old?[5,4]:[]);
    g.beginPath();g.moveTo(pa[0],pa[1]);g.lineTo(pb[0],pb[1]);g.stroke();
  });
  g.setLineDash([]);
  def.nodes.forEach(function(n){
    var p=P(n);g.beginPath();
    if(n.type==='entry'){g.fillStyle='#'+(def.entryColors[n.id]||0x37e2ff).toString(16).padStart(6,'0');g.arc(p[0],p[1],7,0,7);}
    else if(n.type==='exit'){g.fillStyle='#7dffd0';g.fillRect(p[0]-7,p[1]-7,14,14);}
    else{g.fillStyle='#9fc8e8';g.arc(p[0],p[1],4,0,7);}
    g.fill();
  });
  g.fillStyle='#7fa8c9';g.font='12px Consolas';g.textAlign='center';
  def.nodes.filter(n=>n.type!=='switch').forEach(n=>{var p=P(n);g.fillText(n.id,p[0],p[1]-12);});
}

/* =========================================================
   实战演示列表
========================================================= */
this.showDemoList=function(){
  var m=modal('');
  var rows=[
    {no:'01',name:'分段取舍',desc:'分段内网：网闸拖到西边界节点，A 折向 DMZ 与 B 汇流，办公网段敌人掉头',time:'约 18 秒',id:'demo-1'},
    {no:'02',name:'旁路直通',desc:'骨干流域洪峰：洪泛团冲垮网闸，C、B 回到原数据中心；A 路线投下协议降级',time:'约 20 秒',id:'demo-2'},
    {no:'03',name:'蛰影现身',desc:'气隙深层 Boss 战：蛰影锁死运维环，路线重新收敛，修复进程释放冗余切换',time:'约 20 秒',id:'demo-3'}
  ];
  m.root.innerHTML='<button class="x-close">✕</button><h2>实战演示</h2><div class="sub">在游戏真实逻辑上实时演出，共不超过 60 秒</div>'+
    '<div class="demo-list">'+rows.map(r=>
      '<div class="demo-row" data-id="'+r.id+'"><div class="dr-no">'+r.no+'</div>'+
      '<div><div class="dr-name">'+r.name+'</div><div class="dr-desc">'+r.desc+'</div></div>'+
      '<div class="dr-time">'+r.time+'</div></div>').join('')+'</div>';
  m.root.querySelector('.x-close').onclick=function(){G.Audio.sfx('click');self.showMenu();};
  Array.prototype.forEach.call(m.root.querySelectorAll('.demo-row'),function(r){
    r.onclick=function(){G.Audio.sfx('click');G.Demo.start(r.dataset.id);};
  });
};

/* =========================================================
   图鉴
========================================================= */
var CODEX_TOWERS=[
  ['firewall','阻挡 · 链路/节点','在链路上挡住至多 3 个地面敌人并还击；放在交换节点则隔离该节点，并攻击相邻链路上的敌人。2 级提升耐久、容量与火力。','HP 300/520 · 伤害 12/22'],
  ['honeypot','诱敌阻挡 · 链路','以伪造应答吸引附近会攻塔的地面敌人，替其他塔承受攻击；耐久较低，但永远免疫加密。主动「诱捕」定身区域敌人。','HP 150 · 诱敌 3.3 · 诱捕 2.5 秒'],
  ['gate','隔离 · 节点','低成本、高耐久、不攻击，专门用来隔离节点改变道路。仍会被洪泛团等敌人攻击破坏。','HP 430/780 · 1 情报'],
  ['interceptor','远程 · 平台 · 朝向','扇形朝向区域内远程单体攻击，地面飞行皆可打。2 级分支：贯穿（直线穿透伤害）/ 压制（高射速减速）。','伤害 16 · 射程 5.6 · 射速 0.75'],
  ['sandbox','检测/范围 · 平台','检测范围内伪装木马与潜伏 Boss 使其显形；周期性对范围内地面敌人造成范围伤害。','HP 140 · 范围 3.2 · 伤害 15'],
  ['repair','治疗 · 平台','不攻击，持续治疗范围内友塔。主动「冗余切换」给附近友塔护盾并解除加密。','治疗 9/秒 · 范围 3.4']
];
var CODEX_TOWER_BRANCH='2 级分支（蜜罐）：深度诱捕——更大范围、更长定身；荆棘蜜罐——周期性反伤被诱敌人。<br>2 级分支（拦截器）：磁轨贯穿——直线贯穿；脉冲压制——高射速并减速。';
var CODEX_ENEMIES=[
  ['worm','被阻挡时持续近战攻击防火墙；首次经过直通交换节点复制一只同伴（复制体不再复制）。'],
  ['flood','占用 3 点阻挡容量。会主动脱离路线冲向被隔离节点，重击网闸/防火墙；打通后沿重新开放的道路前进。'],
  ['trojan','伪装成正常数据包，显形前不能被远程单体主动选中。沙箱、旧链路（减速 45%）与阻挡使其显形；未显形被范围攻击消灭时引爆载荷伤害周围塔。'],
  ['ransom','行进中远程攻击射程内塔（含高台），造成伤害并施加加密；优先攻击蜜罐（但蜜罐免疫加密）。加密使塔暂停攻击/治疗/技能，但不解除阻挡或隔离。'],
  ['ap','飞行单位，沿无线层从入口直飞最近出口，无视地面道路、节点与阻挡，只能由拦截器等对空火力击落。'],
  ['packer','周期性为周围同伴施加可被打破的护盾，掩护敌群推进。'],
  ['wankui','BOSS · 分段内网第 14 波。「洪峰」重创被隔离节点、冲毁隔离器；生命低于 50% 释放成群蠕虫。'],
  ['shenlou','BOSS · 骨干流域第 15 波。「伪路由」在前方链路制造临时黑洞截断通行、迫使改道（先预警）；残血发动「路由风暴」剥夺附近塔的护盾。'],
  ['zheying','BOSS · 气隙深层第 16 波。潜伏（须沙箱检测才能被远程选中）→ 提权（60% 护甲、放出木马）→ 破坏（锁死前方运维环，先预警）。']
];
this.showCodex=function(tab){
  var m=modal('');
  function render(t){
    var html='<button class="x-close">✕</button><h2>作战手册</h2>'+
      '<div class="codex-tabs"><button class="codex-tab '+(t==='tower'?'on':'')+'" data-t="tower">设备手册</button>'+
      '<button class="codex-tab '+(t==='enemy'?'on':'')+'" data-t="enemy">威胁档案</button>'+
      '<button class="codex-tab '+(t==='terrain'?'on':'')+'" data-t="terrain">地形与状态</button></div>';
    if(t==='tower'){
      html+='<div class="codex-grid">'+CODEX_TOWERS.map(function(c){
        var d=G.TOWERS[c[0]];
        return '<div class="codex-item"><div class="ci-ico">'+d.icon+'</div><div>'+
          '<div class="ci-name">'+d.name+' <small style="color:var(--text-dim)">'+c[1]+'</small></div>'+
          '<div class="ci-text">'+c[2]+'</div><div class="ci-stats">'+c[3]+'</div></div></div>';
      }).join('')+'</div><div class="ci-text" style="margin-top:14px">'+CODEX_TOWER_BRANCH+'</div>';
      html+='<h2 style="margin-top:22px;font-size:17px">情报道具</h2><div class="codex-grid">'+
        itemCard('isolator')+itemCard('downgrade')+itemCard('backup')+'</div>';
    }else if(t==='enemy'){
      html+='<div class="codex-grid">'+CODEX_ENEMIES.map(function(c){
        var d=G.ENEMIES[c[0]];
        return '<div class="codex-item"><div class="ci-ico">'+d.icon+'</div><div>'+
          '<div class="ci-name">'+d.name+(d.boss?' <small style="color:var(--danger)">BOSS</small>':'')+'</div>'+
          '<div class="ci-text">'+c[1]+'</div></div></div>';
      }).join('')+'</div>';
    }else{
      html+='<div class="codex-grid">'+
        terrain('🔗','链路','恶意程序与业务流量经过的道路。防火墙、蜜罐可部署其上，阻挡敌人但不截断道路。旧链路（暖色）使地面敌人减速、伪装木马显形。')+
        terrain('⬡','设备平台','高出链路的部署位置，仅远程/支援设备可用，敌人不能通行。')+
        terrain('⬢','交换节点','链路交汇处。部署防火墙或网闸即隔离节点使其不可通行；撤下/被毁后恢复旁路直通，并有 8 秒再次隔离间隔。')+
        terrain('▞','障碍','数据设施、公网流、气隙等，不可通行也不能部署。')+
        terrain('🛡','护盾','吸收伤害；塔的护盾来自修复进程的冗余切换，敌人护盾来自加壳器。')+
        terrain('🔒','加密','勒索者施加：塔暂时停止攻击、治疗与技能，但阻挡和节点隔离仍然有效。可由修复技能或备份还原解除；蜜罐免疫加密。')+
        terrain('👁','显形','木马伪装状态下不能被远程单体主动选中；沙箱检测、旧链路、阻挡可使其显形。蛰影潜伏阶段同理。')+
        terrain('🕸','定身','蜜罐「诱捕」困住区域内地面敌人数秒。')+
        '</div>';
    }
    m.root.innerHTML=html;
    m.root.querySelector('.x-close').onclick=function(){G.Audio.sfx('click');self.showMenu();};
    Array.prototype.forEach.call(m.root.querySelectorAll('.codex-tab'),function(b){
      b.onclick=function(){G.Audio.sfx('click');render(b.dataset.t);};
    });
  }
  render(tab||'tower');
};
function terrain(icon,name,text){
  return '<div class="codex-item"><div class="ci-ico">'+icon+'</div><div><div class="ci-name">'+name+'</div><div class="ci-text">'+text+'</div></div></div>';
}
function itemCard(key){
  var d=G.ITEMS[key];
  var cost=Object.keys(d.cost).map(k=>'<span class="'+(k==='c'?'cost-c':'cost-i')+'">'+d.cost[k]+(k==='c'?' 算力':' 情报')+'</span>').join('');
  return '<div class="codex-item"><div class="ci-ico">'+d.icon+'</div><div><div class="ci-name">'+d.name+'</div>'+
    '<div class="ci-text">'+d.desc+'</div><div class="ci-stats">'+cost+'</div></div></div>';
}

/* =========================================================
   进入战斗
========================================================= */
this.enterMap=function(mapId){
  $('modal-layer').innerHTML='';
  ['hud-top','build-bar','forecast','log-console'].forEach(function(id){$(id).classList.remove('hidden');});
  this.mode='battle';
  game.startMap(mapId, (mapId+1)*12345);
  this.refreshBuildBar();
  this.refreshHUD();
  this.refreshForecast();
  G.Bus.emit('ui:battle');
};
this.exitToMenu=function(){
  game.dispose();
  ['hud-top','build-bar','forecast','log-console','inspect','demo-bar'].forEach(function(id){$(id).classList.add('hidden');});
  this.clearGhost();this.hideInspect();
  this.showMenu();
};

/* ---------- 顶部资源 ---------- */
this.refreshHUD=function(){
  $('res-compute').textContent=G.fmt(game.compute);
  $('res-intel').textContent=G.fmt(game.intel);
  var pct=G.clamp(game.integrity,0,100);
  $('integrity-fill').style.width=pct+'%';
  $('integrity-text').textContent=Math.round(pct)+'%';
  if(pct<30)$('integrity-fill').style.background='linear-gradient(90deg,#8a1a2a,#ff5577)';
  else if(pct<60)$('integrity-fill').style.background='linear-gradient(90deg,#a06a10,#ffb648)';
  else $('integrity-fill').style.background='linear-gradient(90deg,#16885f,#2af0c8 70%,#7dffd0)';
  $('wave-text').textContent='第 '+game.waveIndex+' / '+game.mapDef.waves.length+' 波';
  $('btn-pause').textContent=game.paused?'▶':'❚❚';
  $('btn-speed').textContent=game.speed+'×';
};

/* ---------- 部署栏 ---------- */
this.refreshBuildBar=function(){
  var box=$('tower-cards');box.innerHTML='';
  Object.keys(G.TOWERS).forEach(function(key){
    var d=G.TOWERS[key];
    var cost=Object.keys(d.cost).map(k=>'<span class="'+(k==='c'?'cost-c':'cost-i')+'">'+d.cost[k]+'</span>').join('<span class="sep">/</span>');
    var sub={firewall:'阻挡',honeypot:'诱敌',gate:'改道',interceptor:'对空/贯穿',sandbox:'检测/范围',repair:'治疗'}[key];
    var card=G.el('<div class="tcard" draggable="true"><div class="tc-ico">'+d.icon+'</div>'+
      '<div class="tc-info"><div class="tc-name">'+d.name+'</div><div class="tc-sub">'+sub+'</div></div>'+
      '<div class="tc-cost">'+cost+'</div></div>');
    card.dataset.type=key;
    attachDrag(card,key,'tower');
    box.appendChild(card);
  });
  var ibox=$('item-cards');ibox.innerHTML='';
  Object.keys(G.ITEMS).forEach(function(key){
    var d=G.ITEMS[key];
    var cost=Object.keys(d.cost).map(k=>'<span class="'+(k==='c'?'cost-c':'cost-i')+'">'+d.cost[k]+'</span>').join('<span class="sep">/</span>');
    var card=G.el('<div class="tcard"><div class="tc-ico">'+d.icon+'</div>'+
      '<div class="tc-info"><div class="tc-name">'+d.name+'</div><div class="tc-sub">'+
      {isolator:'临时隔离节点',downgrade:'一片链路减速/显形',backup:'回血+解密'}[key]+'</div></div>'+
      '<div class="tc-cost">'+cost+'</div></div>');
    card.dataset.type=key;
    attachDrag(card,key,'item');
    ibox.appendChild(card);
  });
};
function attachDrag(card,type,kind){
  card.addEventListener('dragstart',function(ev){
    ev.dataTransfer.effectAllowed='copy';
    ev.dataTransfer.setData('text/plain',type);
    beginAim(type,kind);
  });
  // 原生 HTML5 拖拽在 pointer 控制上不稳定，同时支持 pointer 按下
  card.addEventListener('pointerdown',function(ev){
    ev.preventDefault();
    beginAim(type,kind);
    var move=function(mv){updateAim(mv.clientX,mv.clientY);};
    var up=function(mv){
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);
      endAim(mv.clientX,mv.clientY);
    };
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
  });
}
function beginAim(type,kind){
  G.Audio.sfx('click');
  dragType=type;dragKind=kind;
  if(kind==='tower'){
    var d=G.TOWERS[type];
    ghost=G.Units.makeTowerMesh(type,1,null,'link');
    ghost.group.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.transparent=true;o.material.opacity=.6;}});
    world.unitGroup.add(ghost.group);
  }
  world.canvas.classList.add('aim');
}
function updateAim(cx,cy){
  var hits=world.pickAt(cx,cy,world.slots.map(s=>s.mesh).concat(world.edges.map(e=>e.ribbon)));
  hoverSlot=null;hoverEdge=null;hoverNode=null;
  if(ghost){
    var gpt=world.screenToGround(cx,cy,.6);
    ghost.group.position.copy(gpt);ghost.group.visible=true;
  }
  if(hits.length){
    var o=hits[0].object;
    if(o.userData.slot)hoverSlot=o.userData.slot;
    else if(o.userData.edgeIdx!==undefined)hoverEdge=o.userData.edgeIdx;
  }
  if(dragKind==='tower'&&hoverSlot&&ghost){
    ghost.group.position.copy(hoverSlot.pos);
    if(hoverSlot.kind==='platform')ghost.group.position.y=1.32;
    var chk=game.canPlace(dragType,hoverSlot);
    ghost.group.traverse(o=>{if(o.material&&o.material.color){o.material.color.setHex(chk.ok?0x37e2ff:0xff5577);}});
    showRangeFor(dragType,hoverSlot,chk);
    // 改道预览
    if(hoverSlot.kind==='node'&&(dragType==='gate'||dragType==='firewall')){
      var pv=game.previewChange('seal',hoverSlot.node);
      world.showPreview(pv.routes,pv.ok?null:{node:hoverSlot.node});
      previewShown=true;
    }else world.hidePreview(),previewShown=false;
  }else if(dragKind==='item'){
    world.hidePreview();previewShown=false;
    if(dragType==='downgrade'&&hoverEdge!==null){
      game.downEdges[hoverEdge]=true;var r=game.computeRoutes();
      world.showPreview(r,null);previewShown='downgrade';
      delete game.downEdges[hoverEdge];game.computeRoutes();
      showEdgeRange(hoverEdge);
    }else if(dragType==='isolator'){
      var hn=nodeFromRay(cx,cy);
      if(hn){var pv2=game.previewChange('seal',hn);world.showPreview(pv2.routes,pv2.ok?null:{node:hn});previewShown=true;hoverNode=hn;}
    }else if(dragType==='backup'){
      var ht=towerFromRay(cx,cy);
      if(ht){hoverTower=ht;showTowerRange(ht);}
    }
  }else{
    hideRange();world.hidePreview();previewShown=false;
  }
}
function endAim(cx,cy){
  world.canvas.classList.remove('aim');
  var ok=false;
  try{
    if(dragKind==='tower'){
      if(hoverSlot){
        var chk=game.canPlace(dragType,hoverSlot);
        if(!chk.ok){toast(chk.reason,'danger');G.Audio.sfx('deny');}
        else if(dragType==='interceptor'){
          startFacing(hoverSlot);
          return; // 等朝向确认，不清理 ghost
        }
        else{
          var r=game.placeTower(dragType,hoverSlot);
          ok=r.ok;
        }
      }
    }else{
      if(dragType==='isolator'&&hoverNode!==null){
        var r2=game.placeIsolator?null:null;
        var res=game.placeIsolator(hoverNode);
        if(!res.ok){toast(res.reason,'danger');G.Audio.sfx('deny');}else ok=true;
      }else if(dragType==='downgrade'&&hoverEdge!==null){
        var res2=game.applyDowngrade(hoverEdge);
        if(!res2.ok){toast(res2.reason,'danger');G.Audio.sfx('deny');}else ok=true;
      }else if(dragType==='backup'&&hoverTower){
        var res3=game.applyBackup(hoverTower);
        if(!res3.ok){toast(res3.reason,'danger');G.Audio.sfx('deny');}else ok=true;
      }
    }
  }finally{
    if(!aimMode)this.clearGhost();
    hideRange();world.hidePreview();
    dragType=null;dragKind=null;hoverSlot=null;hoverEdge=null;hoverNode=null;hoverTower=null;
  }
}
function startFacing(slot){
  aimMode=true;
  $('float-tip').classList.remove('hidden');
  $('float-tip').textContent='移动鼠标设定拦截器朝向 · 左键确认 / 右键或 Esc 取消';
  var move=function(ev){
    var p=world.screenToGround(ev.clientX,ev.clientY,.6);
    var ang=Math.atan2(-(p.x-slot.pos.x),-(p.z-slot.pos.z));
    ghost.group.rotation.y=ang;
    drawFacingArc(slot,ang);
  };
  var click=function(ev){
    if(ev.button===2){cancel();return;}
    var ang=ghost.group.rotation.y;
    var r=game.placeTower('interceptor',slot,ang);
    if(!r.ok){toast(r.reason,'danger');G.Audio.sfx('deny');}
    cancel();
  };
  var key=function(ev){if(ev.key==='Escape')cancel();};
  var ctx=function(ev){ev.preventDefault();cancel();};
  function cancel(){
    window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',click);
    window.removeEventListener('keydown',key);world.canvas.removeEventListener('contextmenu',ctx);
    aimMode=false;$('float-tip').classList.add('hidden');self.clearGhost();hideRange();
  }
  window.addEventListener('pointermove',move);
  window.addEventListener('pointerup',click);
  window.addEventListener('keydown',key);
  world.canvas.addEventListener('contextmenu',ctx);
  drawFacingArc(slot,Math.PI);
}
this.clearGhost=function(){
  if(ghost){world.unitGroup.remove(ghost.group);ghost=null;}
};

/* 范围辅助显示 */
function showRangeFor(type,slot,chk){
  hideRange();
  var sets={firewall:2.2,interceptor:5.6,sandbox:3.2,repair:3.4,honeypot:3.3,gate:1.6};
  var r=sets[type]||2;
  if(type==='gate'){
    rangeCircle=circleAt(slot.pos,r,chk.ok?0xffd25c:0xff5577,true);
  }else{
    rangeCircle=circleAt(slot.pos,r,chk.ok?0x37e2ff:0xff5577,false);
  }
  world.fxGroup.add(rangeCircle);
  if(type==='interceptor'){
    facingLine=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,r),
      new THREE.MeshBasicMaterial({color:0x5ef0c0,transparent:true,opacity:.7}));
    facingLine.position.set(slot.pos.x,(slot.kind==='platform'?1.5:.5),slot.pos.z);
    facingLine.position.z-=r/2;
    world.fxGroup.add(facingLine);
  }
}
function drawFacingArc(slot,ang){
  hideRange();
  var r=5.6;
  rangeCircle=circleAt(slot.pos,r,0x5ef0c0,false,ang-1.5/2,1.5);
  world.fxGroup.add(rangeCircle);
}
function showTowerRange(t){
  hideRange();
  var set=game.towerDef(t);
  var r=set.range||set.r||set.lure||2;
  rangeCircle=circleAt(t.slot.pos,r,0x57e389,false);
  world.fxGroup.add(rangeCircle);
}
function showEdgeRange(ei){
  hideRange();
  var e=world.edges[ei];
  var nPts=20,pos=[];
  for(var i=0;i<=nPts;i++){var p=e.curve.getPointAt(i/nPts);pos.push(p.x,.3,p.z);}
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  rangeCircle=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffd25c}));
  world.fxGroup.add(rangeCircle);
}
function hideRange(){
  if(rangeCircle){world.fxGroup.remove(rangeCircle);rangeCircle=null;}
  if(facingLine){world.fxGroup.remove(facingLine);facingLine=null;}
}
function circleAt(pos,r,color,filled,startAngle,arcLen){
  var seg=40,ps=[],cs=[];
  var sa=startAngle!==undefined?startAngle:0,al=arcLen!==undefined?arcLen:Math.PI*2;
  for(var i=0;i<=seg;i++){var a=sa+al*i/seg;
    cs.push(pos.x+Math.sin(a)*r,pos.y+.35,pos.z+Math.cos(a)*r);}
  if(filled){
    var shape=new THREE.Shape();shape.absarc(0,0,r,0,Math.PI*2,false);
    var geo=new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI/2);
    var m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));
    m.position.set(pos.x,pos.y+.1,pos.z);
    return m;
  }
  var g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(cs,3));
  return new THREE.Line(g,new THREE.LineBasicMaterial({color:color,transparent:true,opacity:.9}));
}
function nodeFromRay(cx,cy){
  var hits=world.pickAt(cx,cy,world.slots.filter(s=>s.kind==='node').map(s=>s.mesh));
  if(hits.length){var s=hits[0].object.userData.slot;return s.node;}
  return null;
}
function towerFromRay(cx,cy){
  var h=world.pickAt(cx,cy,world.slots.map(s=>s.mesh));
  for(var i=0;i<h.length;i++){var s=h[i].object.userData.slot;if(s&&s.tower)return s.tower;}
  return null;
}

/* ---------- 点选 ---------- */
world.canvas.addEventListener('pointerup',function(ev){
  if(ev.button!==0||dragType||aimMode)return;
  if(self.mode!=='battle'&&self.mode!=='demo')return;
  var hits=world.pickAt(ev.clientX,ev.clientY,world.slots.map(s=>s.mesh));
  var slot=null;
  for(var i=0;i<hits.length;i++){if(hits[i].object.userData.slot){slot=hits[i].object.userData.slot;break;}}
  // 敌人模型
  var emeshes=game.enemies.map(e=>e.model.group);
  var eh=world.pickAt(ev.clientX,ev.clientY,emeshes);
  if(!slot&&eh.length){
    var g0=eh[0].object;
    var enemy=game.enemies.find(e=>e.model.group===g0||e.model.group.children.indexOf(g0)>=0||g0.parent===e.model.group);
    if(!enemy){
      // 深层子节点
      enemy=game.enemies.find(function(e){var f=false;e.model.group.traverse(o=>{if(o===g0)f=true;});return f;});
    }
    if(enemy){showEnemyInspect(enemy);return;}
  }
  if(slot){
    if(slot.tower){showTowerInspect(slot.tower);return;}
    showSlotInspect(slot);return;
  }
  self.hideInspect();game.selected=null;
});

/* ---------- 检查面板 ---------- */
this.hideInspect=function(){$('inspect').classList.add('hidden');hideRange();};
function showPanel(html){
  var p=$('inspect');p.innerHTML=html;p.classList.remove('hidden');
}
this.showTowerInspect=function(t){
  game.selected=t;showTowerRange(t);
  var d=G.TOWERS[t.type];var set=game.towerDef(t);
  var badges=[];
  if(t.shield>0)badges.push('<span class="badge shield">护盾 '+Math.round(t.shield)+'</span>');
  if(t.encryptT>0)badges.push('<span class="badge encrypt">加密 '+t.encryptT.toFixed(1)+'s</span>');
  var html='<div class="ix-title">'+d.icon+' '+d.name+(t.level>1?' <small style="color:var(--cyan)">Lv.'+t.level+(t.branch?(' · '+{pierce:'贯穿',suppress:'压制',deep:'深度诱捕',spike:'荆棘'}[t.branch]):'')+'</small>':'')+'</div>'+
    '<div class="ix-sub">'+d.desc+'</div>'+
    '<div class="ix-hpbar"><i style="width:'+(t.hp/t.maxHp*100)+'%"></i></div>'+
    '<div class="ix-stat"><span>生命</span><b>'+Math.round(t.hp)+' / '+t.maxHp+'</b></div>';
  if(t.type==='firewall')html+='<div class="ix-stat"><span>伤害 / 射速</span><b>'+set.dmg+' / '+set.rate.toFixed(2)+'s</b></div><div class="ix-stat"><span>阻挡容量</span><b>'+set.cap+'</b></div>';
  if(t.type==='interceptor')html+='<div class="ix-stat"><span>伤害 / 射速</span><b>'+set.dmg+(set.pierce?'（贯穿）':set.slow?'（减速）':'')+' / '+set.rate.toFixed(2)+'s</b></div><div class="ix-stat"><span>射程 / 扇区</span><b>'+set.range+' / '+(set.fov*180/Math.PI).toFixed(0)+'°</b></div>';
  if(t.type==='sandbox')html+='<div class="ix-stat"><span>范围伤害 / 周期</span><b>'+set.dmg+' / '+set.rate.toFixed(2)+'s</b></div><div class="ix-stat"><span>检测/攻击半径</span><b>'+set.reveal+' / '+set.r+'</b></div>';
  if(t.type==='repair')html+='<div class="ix-stat"><span>治疗/秒 · 范围</span><b>'+set.heal+' · '+set.r+'</b></div>';
  if(t.type==='honeypot')html+='<div class="ix-stat"><span>诱敌半径</span><b>'+set.lure+'</b></div>';
  if(t.type==='isolator')html+='<div class="ix-stat"><span>有效期</span><b>'+Math.max(0,(t.expiresAt-game.time)).toFixed(1)+'s</b></div>';
  html+='<div class="ix-badges">'+badges.join('')+'</div><div class="ix-btns">';
  var skillName={honeypot:'诱捕',repair:'冗余切换'}[t.type];
  if(skillName){var cd=t.cd>game.time;
    html+='<button class="skill" data-act="skill" '+(cd?'disabled':'')+'>'+skillName+(cd?' ('+Math.ceil(t.cd-game.time)+')':'')+'</button>';}
  if(t.type!=='isolator'&&t.level===1){
    html+='<button data-act="upgrade">升级'+((t.type==='honeypot'||t.type==='interceptor')?' ◈':'')+'</button>';
  }
  html+='<button class="danger" data-act="sell">撤下</button></div>';
  // 分支选择
  if(t.type==='honeypot'||t.type==='interceptor'){
    var cost=game.towerCost(t.type,2,true);
    html+='<div class="branch-pick"><div class="bp-title">2 级需要选择分支（'+cost.c+' 算力 / '+cost.i+' 情报）</div></div>';
  }
  showPanel(html);
  var p=$('inspect');
  var bp=p.querySelector('.branch-pick');
  if(bp){
    if(t.type==='honeypot'){
      bp.innerHTML+='<button data-br="deep">深度诱捕<small>诱敌范围更大，诱捕持续更久</small></button>';
      bp.innerHTML+='<button data-br="spike">荆棘蜜罐<small>周期性反伤被诱敌人</small></button>';
    }else{
      bp.innerHTML+='<button data-br="pierce">磁轨贯穿<small>直线贯穿整条射线的敌人</small></button>';
      bp.innerHTML+='<button data-br="suppress">脉冲压制<small>极高射速并减速目标</small></button>';
    }
    Array.prototype.forEach.call(bp.querySelectorAll('button'),function(b){
      b.onclick=function(){
        var r=game.upgradeTower(t,b.dataset.br);
        if(!r.ok){toast(r.reason,'danger');G.Audio.sfx('deny');}
        else self.showTowerInspect(t);
      };
    });
  }
  p.querySelector('[data-act="sell"]').onclick=function(){
    var n=game.sellTower(t);toast('撤下设备，回收 '+n+' 算力','good');self.hideInspect();
  };
  var sk=p.querySelector('[data-act="skill"]');
  if(sk)sk.onclick=function(){var r=game.useSkill(t);if(!r.ok){toast(r.reason,'danger');G.Audio.sfx('deny');}else self.showTowerInspect(t);};
  var up=p.querySelector('[data-act="upgrade"]');
  if(up&&t.type!=='honeypot'&&t.type!=='interceptor')up.onclick=function(){
    var r=game.upgradeTower(t);if(!r.ok){toast(r.reason,'danger');G.Audio.sfx('deny');}else self.showTowerInspect(t);
  };
  if(up&&(t.type==='honeypot'||t.type==='interceptor'))up.onclick=function(){toast('该设备升级需要在下方二选一分支','warn');};
};
function showEnemyInspect(e){
  game.selected=e;
  var d=G.ENEMIES[e.type];
  var badges=[];
  if(e.shield>0)badges.push('<span class="badge shield">护盾 '+Math.round(e.shield)+'</span>');
  if(e.type==='trojan')badges.push(e.revealed?'<span class="badge reveal">已显形</span>':'<span class="badge" style="color:#d88cff;border-color:#6a43a0">伪装中</span>');
  if(e.stunT>0)badges.push('<span class="badge stun">定身 '+e.stunT.toFixed(1)+'s</span>');
  if(e.slowT>0)badges.push('<span class="badge" style="color:#6fb8ff;border-color:#2a6da0">减速</span>');
  if(e.boss)badges.push('<span class="badge stun">阶段 '+(e.phase+1)+'</span>');
  var html='<div class="ix-title">'+d.icon+' '+d.name+'</div>'+
    '<div class="ix-sub">'+d.desc+'</div>'+
    '<div class="ix-hpbar"><i style="width:'+(e.hp/e.maxHp*100)+'%;background:linear-gradient(90deg,#a03050,#ff5577)"></i></div>'+
    '<div class="ix-stat"><span>生命</span><b>'+Math.round(e.hp)+' / '+e.maxHp+'</b></div>'+
    '<div class="ix-stat"><span>移动速度</span><b>'+e.speed.toFixed(2)+'</b></div>'+
    '<div class="ix-stat"><span>进入入口</span><b>'+e.entry+'</b></div>'+
    '<div class="ix-stat"><span>状态</span><b>'+{walk:'推进中',blocked:'被阻挡',siege:'冲击节点',dead:'已消灭'}[e.state]||e.state+'</b></div>'+
    '<div class="ix-badges">'+badges.join('')+'</div>';
  showPanel(html);
}
function showSlotInspect(s){
  var name={link:'链路',node:'交换节点',platform:'设备平台'}[s.kind];
  var info='';
  if(s.kind==='node'){var n=world.nodes[s.node];info=(n.sealed?'<b style="color:var(--danger)">节点已隔离 · 不可通行</b>':'节点直通 · 正常通行')+
    (game.nodeCd[s.node]&&game.nodeCd[s.node]>game.time?'<br>旁路重建中：'+Math.ceil(game.nodeCd[s.node]-game.time)+' 秒':'');}
  if(s.kind==='link'){var e=world.edges[s.edge];info=e.old?'<b style="color:var(--warn)">旧链路：地面敌人减速 45%，木马显形</b>':
    (game.downEdges[s.edge]?'<b style="color:var(--warn)">已协议降级（旧协议效果）</b>':'标准链路');}
  if(s.kind==='platform')info='高出链路的部署位，仅拦截器/沙箱/修复进程可用，敌人无法通行。';
  showPanel('<div class="ix-title">⬡ '+name+'</div><div class="ix-sub">'+info+'</div>'+
    '<div class="ix-sub" style="color:var(--text-dim)">'+(s.kind==='node'?'部署防火墙或网闸可隔离节点，改道效果以白色虚线预览。':'从左侧拖放可部署的设备到此位置。')+'</div>');
}

/* ---------- 流量预报 ---------- */
this.refreshForecast=function(){
  var f=game.forecast();
  if(!f){
    $('forecast').classList.add('hidden');return;
  }
  $('forecast').classList.remove('hidden');
  $('fc-wave').textContent='第 '+f.wave+' / '+f.total+' 波'+(f.flood?' · ⚠ 洪峰':'');
  $('fc-list').innerHTML=f.rows.map(function(r){
    return '<div class="fc-row"><span class="dot" style="background:#'+r.color.toString(16).padStart(6,'0')+'"></span>'+
      '<b>'+r.name+'</b><span class="cnt">×'+r.count+' · 入口 '+r.entry+'</span></div>';
  }).join('');
  $('btn-next-wave').disabled=game.waveActive;
  $('btn-next-wave').textContent=game.waveActive?('交战中… 剩余 '+game.enemies.length):'开始第 '+f.wave+' 波 ▶';
};
$('btn-next-wave').addEventListener('click',function(){game.startWave();self.refreshForecast();});

/* ---------- 日志 ---------- */
G.Bus.on('log',function(d){
  var box=$('log-console');
  var line=G.el('<div class="log-line '+d.cls+'">['+game.time.toFixed(1)+'] '+d.msg+'</div>');
  box.insertBefore(line,box.firstChild);
  while(box.children.length>6)box.removeChild(box.lastChild);
});

/* ---------- 暂停 / 速度 ---------- */
$('btn-pause').onclick=function(){game.pause(!game.paused);self.refreshHUD();};
$('btn-speed').onclick=function(){game.setSpeed(game.speed===1?2:1);self.refreshHUD();};
$('btn-camera').onclick=function(){world.resetCamera();world.camManual();};
$('btn-menu').onclick=function(){self.pauseMenu();};
window.addEventListener('keydown',function(ev){
  if(self.mode!=='battle'&&self.mode!=='demo')return;
  if(ev.code==='Space'){ev.preventDefault();if(self.mode==='battle'){game.pause(!game.paused);self.refreshHUD();}}
  if(ev.key==='n'||ev.key==='N'){world.resetCamera();world.camManual();}
  if(ev.key==='Escape'){self.hideInspect();}
});
this.pauseMenu=function(){
  game.pause(true);
  var m=modal('');
  m.root.className='modal pause-menu';
  m.root.innerHTML='<h2>作战暂停</h2>'+
    '<button data-a="resume">继续作战</button>'+
    '<button data-a="restart">重开本图</button>'+
    '<button data-a="maps">返回关卡选择</button>'+
    '<button data-a="menu">返回主菜单</button>'+
    '<button data-a="codex">作战手册</button>';
  m.root.querySelector('[data-a="resume"]').onclick=function(){G.Audio.sfx('click');m.close();game.pause(false);};
  m.root.querySelector('[data-a="restart"]').onclick=function(){G.Audio.sfx('click');m.close();self.enterMap(game.mapDef.id);};
  m.root.querySelector('[data-a="maps"]').onclick=function(){G.Audio.sfx('click');m.close();game.dispose();
    ['hud-top','build-bar','forecast','log-console'].forEach(id=>$(id).classList.add('hidden'));
    self.hideInspect();self.showMapSelect();};
  m.root.querySelector('[data-a="menu"]').onclick=function(){G.Audio.sfx('click');m.close();self.exitToMenu();};
  m.root.querySelector('[data-a="codex"]').onclick=function(){G.Audio.sfx('click');m.close();self.showCodex();};
};

/* ---------- 结算 ---------- */
this.showReport=function(win){
  var s=game.stats;
  var m=modal('');
  var logHtml=game.logs.slice(-18).map(l=>'<div style="color:'+({good:'#9ff0bd',warn:'#ffd98a',danger:'#ff9db0'}[l.cls]||'#7fa8c9')+'">['+l.t.toFixed(1)+'] '+l.msg+'</div>').join('');
  m.root.innerHTML=
    '<div class="report-head"><div class="sub">EVENT REPORT · 事件报告</div>'+
    '<div class="verdict '+(win?'win':'lose')+'">'+(win?'防御成功':'中枢沦陷')+'</div>'+
    '<div style="color:var(--text-dim)">'+game.mapDef.name+' · 完成波次 '+game.waveIndex+' / '+game.mapDef.waves.length+' · 中枢完整度 '+Math.round(game.integrity)+'%</div></div>'+
    '<div class="report-stats">'+
      '<div class="rstat"><b>'+s.kills+'</b><span>歼灭威胁</span></div>'+
      '<div class="rstat"><b>'+s.leaks+'</b><span>突破次数</span></div>'+
      '<div class="rstat"><b>'+s.built+'</b><span>部署设备</span></div>'+
      '<div class="rstat"><b>'+Math.round(s.dmgTaken)+'</b><span>设备承伤</span></div>'+
      '<div class="rstat"><b>'+game.waveIndex+'/'+game.mapDef.waves.length+'</b><span>波次</span></div>'+
      '<div class="rstat"><b>'+Math.round(game.compute)+'</b><span>剩余算力</span></div>'+
    '</div>'+
    '<div class="report-log">'+logHtml+'</div>'+
    '<div class="menu-foot" style="margin-top:22px"><button id="r-restart">重开本图</button>'+
    '<button id="r-maps">返回关卡选择</button><button id="r-menu">返回主菜单</button></div>';
  m.root.querySelector('#r-restart').onclick=function(){G.Audio.sfx('click');m.close();self.enterMap(game.mapDef.id);};
  m.root.querySelector('#r-maps').onclick=function(){G.Audio.sfx('click');m.close();
    ['hud-top','build-bar','forecast','log-console'].forEach(id=>$(id).classList.add('hidden'));
    self.hideInspect();self.showMapSelect();};
  m.root.querySelector('#r-menu').onclick=function(){G.Audio.sfx('click');m.close();self.exitToMenu();};
};

/* ---------- toast ---------- */
function toast(msg,cls){
  var t=G.el('<div class="toast '+cls+'">'+msg+'</div>');
  $('toast-layer').appendChild(t);
  setTimeout(function(){t.style.opacity='0';t.style.transition='.4s';setTimeout(()=>t.remove(),400);},2200);
}
this.toast=toast;
this.subtitle=function(text,dur){
  var s=$('subtitle');
  if(text){s.textContent=text;s.classList.remove('hidden');}
  else s.classList.add('hidden');
};

/* ---------- 总线 ---------- */
G.Bus.on('game:over',function(d){
  setTimeout(function(){self.showReport(d.win);},900);
});
G.Bus.on('core:hit',function(){self.refreshHUD();});

/* ---------- 音频控制 ---------- */
$('btn-mute').onclick=function(){
  var m=!G.Audio.isMuted();G.Audio.setMuted(m);
  $('btn-mute').textContent=m?'🔇':'🔊';
};
$('volume').oninput=function(){G.Audio.setVolume(this.value/100);};

/* ---------- 每帧刷新 ---------- */
this.update=function(dt){
  if(this.mode!=='battle'&&this.mode!=='demo')return;
  this.refreshHUD();
  this.refreshForecast();
  // 选中单位面板动态数据：每秒重绘一次
  this._up=(this._up||0)+dt;
  if(this._up>.25){this._up=0;
    if(game.selected&&$('inspect').classList.contains('hidden')===false){
      if(game.selected.slot)this.showTowerInspect(game.selected);
      else if(game.selected.type&&game.enemies.indexOf(game.selected)>=0)showEnemyInspect(game.selected);
      else game.selected=null;
    }
  }
};
};
