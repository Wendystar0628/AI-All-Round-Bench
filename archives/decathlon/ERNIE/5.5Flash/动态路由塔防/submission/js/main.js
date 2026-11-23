/* ============================================================
 * 主控：启动、相机、输入、主循环、实战演示、视频导出接口
 * ============================================================ */
class Main {
  constructor(){
    this.canvas=document.getElementById('gl');
    this.world=new World(this.canvas);
    this.ui=new UI();
    this.ui.world=this.world; this.ui.main=this;
    this.game=null;
    this.mode='menu';
    this.currentMapId='map1';
    this.exporting=false;
    this.demoRunner=null;
    this.placementStart=null;
    this.placementFacing=0;
    this.userRotated=false;
    this.orbit=null;
    this.pan=null;
    this.last=performance.now();
    this.acc=0;
    this.uiTimer=0;
    this.demoEndTimer=null;
    this.setupMenu();
    this.bindInput();
    const initAudio=()=>{ AudioSys.init(); AudioSys.resume(); };
    window.addEventListener('pointerdown',initAudio,{once:true});
    window.addEventListener('keydown',initAudio,{once:true});
    requestAnimationFrame(t=>this.loop(t));
  }

  setupMenu(){
    this.world.setMap(MAPS.byId('map1'));
    this.world.game=null;
    this.world.resetCamera();
    this.world.camRadius=104;
    this.world.camPhi=.8;
    this.world.applyCamera();
    this.ui.showScreen('menu');
  }

  startGame(mapId){
    this.stopDemo(true);
    this.acc=0; this.last=performance.now();
    this.mode='battle'; this.currentMapId=mapId;
    AudioSys.init(); AudioSys.resume(); AudioSys.ambient(mapId);
    const map=MAPS.byId(mapId);
    this.world.setMap(map);
    this.world.resetCamera();
    this.world.game=null;
    this.game=new Game(map,{world:this.world,ui:this.ui,seed:1000+Math.floor(Math.random()*999)});
    this.world.game=this.game;
    this.ui.showBattle(this.game);
    this.ui.el.toast.innerHTML='';
    this.ui.el.forecast.classList.remove('hidden');
    this.ui.showDemoControls(false);
    this.ui.demoCursor(0,0,false);
    this.ui.demoDragGhost(null,0,0,false);
    this.ui.subtitle('','SYS',0);
    this.ui.hideSubtitle();
    this.ui.toast('防御开始 · 先部署拦截器覆盖入口，再考虑节点隔离','good');
    AudioSys.sfx('wave');
  }

  restart(){
    if(!this.currentMapId) return;
    this.startGame(this.currentMapId);
  }
  quitToSelect(){
    this.stopDemo(true);
    this.mode='select';
    this.game=null; this.world.game=null;
    this.world.setMap(MAPS.byId('map1'));
    this.world.resetCamera(); this.world.camRadius=104; this.world.camPhi=.8; this.world.applyCamera();
    this.ui.showScreen('select');
    AudioSys.ambient('menu');
  }

  /* ---------- 相机输入 ---------- */
  bindInput(){
    const c=this.canvas;
    c.addEventListener('contextmenu',e=>e.preventDefault());
    c.addEventListener('pointerdown',e=>{
      if(this.exporting) return;
      if(this.mode==='demo') return;
      AudioSys.init(); AudioSys.resume();
      if(e.button===1){
        e.preventDefault();
        if(e.shiftKey) this.pan={x:e.clientX,y:e.clientY};
        else this.orbit={x:e.clientX,y:e.clientY};
        c.setPointerCapture(e.pointerId);
      } else if(e.button===2){
        e.preventDefault();
        if(this.ui.placeMode||this.ui.itemMode){ this.cancelModes(); return; }
        this.pan={x:e.clientX,y:e.clientY};
        c.setPointerCapture(e.pointerId);
      } else if(e.button===0){
        if(!this.game||this.game.over) return;
        if(this.ui.placeMode){
          const cell=this.world.screenToGround(e.clientX,e.clientY);
          if(cell){
            this.game.updatePlacement(cell,this.placementFacing);
            this.placementStart=this.placementStart||{x:e.clientX,y:e.clientY};
            this.confirmPlacement();
          }
        } else if(this.ui.itemMode){
          this.applyItemAt(e.clientX,e.clientY);
        } else {
          this.pickAt(e.clientX,e.clientY);
        }
      }
    });
    c.addEventListener('pointermove',e=>{
      if(this.exporting) return;
      if(this.orbit){
        const dx=e.clientX-this.orbit.x, dy=e.clientY-this.orbit.y;
        this.orbit.x=e.clientX; this.orbit.y=e.clientY;
        this.world.camTheta-=dx*.005;
        this.world.camPhi=Math.max(.18,Math.min(1.35,this.world.camPhi-dy*.004));
        this.world.applyCamera();
      }
      if(this.pan){
        const dx=e.clientX-this.pan.x, dy=e.clientY-this.pan.y;
        this.pan.x=e.clientX; this.pan.y=e.clientY;
        this.panCamera(dx,dy);
      }
      this.pointerMove(e);
    });
    const end=e=>{
      this.orbit=null; this.pan=null;
      try{c.releasePointerCapture(e.pointerId);}catch(_){}
    };
    c.addEventListener('pointerup',end);
    c.addEventListener('pointercancel',end);
    c.addEventListener('wheel',e=>{
      if(this.exporting) return;
      e.preventDefault();
      const k=Math.exp(e.deltaY*.001);
      this.world.camRadius=Math.max(18,Math.min(190,this.world.camRadius*k));
      this.world.applyCamera();
    },{passive:false});
    c.addEventListener('dblclick',()=>{ if(this.mode!=='demo') this.world.resetCamera(); });
  }

  panCamera(dx,dy){
    const scale=this.world.camRadius*.0016;
    const t=this.world.camTheta;
    this.world.camTarget.x += (dx*Math.sin(t) + dy*Math.cos(t))*scale;
    this.world.camTarget.z += (-dx*Math.cos(t) + dy*Math.sin(t))*scale;
    this.world.applyCamera();
  }

  pointerMove(e){
    if(!this.game) return;
    if(this.ui.placeMode){
      const cell=this.world.screenToGround(e.clientX,e.clientY);
      if(cell){
        let facing=this.placementFacing;
        if(this.game.placement && this.game.placement.type==='interceptor' && !this.userRotated && !this.placementStart){
          const cw=this.world.map.world(cell.x,cell.z);
          facing=Math.atan2(-cw.x,-cw.z);
        }
        if(this.placementStart){
          const dx=e.clientX-this.placementStart.x, dy=e.clientY-this.placementStart.y;
          if(Math.hypot(dx,dy)>18){ facing=Math.atan2(dx,-dy); this.userRotated=true; }
        }
        this.placementFacing=facing;
        this.game.updatePlacement(cell,facing);
        this.lastCell=cell;
        if(this.ui.ghost){ this.ui.ghost.style.left=e.clientX+'px'; this.ui.ghost.style.top=e.clientY+'px'; }
      }
    }
    if(this.ui.itemMode){ const cell=this.world.screenToGround(e.clientX,e.clientY); if(cell) this.previewItem(cell); }
  }

  pickAt(x,y){
    this.world.setPointer(x,y);
    const id=this.world.pickObject();
    if(id){
      if(id[0]==='T'){
        const t=this.game.towerById(id);
        if(t){ this.game.select('tower',id); this.ui.selEnemyId=null; return; }
      } else if(id[0]==='E'){
        const e=this.game.enemyById(id);
        if(e){ this.game.select(null,null); this.ui.selEnemyId=id; this.ui.onSelect('enemy',id); return; }
      }
    }
    const cell=this.world.pickGround();
    if(cell){
      this.game.select(null,null);
      this.ui.onSelect('cell',cell);
      this.ui.el.selectPanel.classList.remove('hidden');
    } else {
      this.game.select(null,null);
    }
  }

  /* ---------- 部署 / 道具 ---------- */
  beginPlacement(type){
    if(!this.game||this.game.over) return;
    if(this.game.itemTargeting) this.game.cancelItem();
    this.ui.onItemEnd();
    this.placementStart=null;
    this.placementFacing=0;
    this.userRotated=false;
    this.lastCell=null;
    this.game.beginPlacement(type);
    this.ui.onPlacementStart(type);
    this.ui.demoHighlightCard(type);
    AudioSys.sfx('click');
  }

  confirmPlacement(){
    if(!this.game||!this.game.placement) return;
    const cell=this.game.placement.cell;
    const res=this.game.confirmPlacement();
    if(res&&res.ok){
      AudioSys.sfx('place');
      this.ui.toast('已部署 '+DATA.TOWERS[this.game.towers[this.game.towers.length-1].type].name,'good');
    } else {
      AudioSys.sfx('error');
      this.ui.toast(res&&res.reason?res.reason:'无法部署','warn');
      if(cell) this.world.flashCell(res&&res.blockAt?res.blockAt:cell,0xff5d72,.7);
    }
    this.ui.onPlacementEnd();
    this.ui.demoHighlightCard(null);
    this.placementStart=null;
  }

  tryDropAt(x,y){
    if(!this.game) return;
    const cell=this.world.screenToGround(x,y);
    if(cell){
      if(this.game.placement && this.game.placement.type==='interceptor' && !this.userRotated){ const cw=this.world.map.world(cell.x,cell.z); this.placementFacing=Math.atan2(-cw.x,-cw.z); }
      this.game.updatePlacement(cell,this.placementFacing); this.confirmPlacement();
    }
  }

  cancelModes(){
    if(this.game){ this.game.cancelPlacement(); this.game.cancelItem(); this.game.previewList=[]; this.world.updateRoutes(this.game.routeList(),[]); }
    this.ui.onPlacementEnd(); this.ui.onItemEnd();
    this.ui.demoHighlightCard(null);
  }

  rotatePlacement(delta){
    if(!this.game||!this.game.placement) return;
    this.userRotated=true;
    this.placementFacing+=delta;
    if(this.game.placement.cell) this.game.updatePlacement(this.game.placement.cell,this.placementFacing);
  }

  previewItem(cell){
    const id=this.ui.itemMode; if(!id||!this.game) return;
    const U=this.game.map.tile;
    if(id==='isolator'){
      if(this.game.map.cell(cell.x,cell.z)==='n'){
        const v=this.game.validateIsolation(cell);
        this.world.showRange(cell,2.2*U,v.ok?0x5ce9ff:0xff5d72,v.ok);
        this.world.highlightCell(cell,v.ok?0x5ce9ff:0xff5d72);
        const preview=v.ok?this.game.previewListFor(cell):[];
        this.game.previewList=preview;
        this.world.updateRoutes(this.game.routeList(),preview);
      } else {
        this.world.showRange(cell,2.2*U,0xff5d72,false); this.world.highlightCell(cell,0xff5d72);
        this.game.previewList=[]; this.world.updateRoutes(this.game.routeList(),[]);
      }
    } else if(id==='downgrade'){
      this.world.showRange(cell,4.5*U,0xffb85c,true);
    } else if(id==='restore'){
      const t=this.game.towerAt(cell);
      if(t) this.world.showRange(cell,2.2*U,0x6cf0a8,true);
      else this.world.highlightCell(cell,0xff5d72);
    }
  }

  applyItemAt(x,y){
    if(!this.game) return;
    const cell=this.world.screenToGround(x,y);
    if(!cell){ this.ui.toast('无效位置','warn'); return; }
    const id=this.ui.itemMode;
    let target={cell};
    if(id==='restore'){
      const t=this.game.towerAt(cell);
      if(!t){ this.ui.toast('请选择一座塔','warn'); AudioSys.sfx('error'); return; }
      target={tower:t};
    }
    const res=this.game.useItem(id,target);
    if(res.ok){
      AudioSys.sfx('skill');
      this.ui.toast(DATA.ITEMS[id].name+' 已投放','good');
    } else {
      AudioSys.sfx('error');
      this.ui.toast(res.reason||'无法使用','warn');
    }
    this.game.cancelItem(); this.ui.onItemEnd();
    this.game.previewList=[]; this.world.updateRoutes(this.game.routeList(),[]);
    this.world.clearRange(); this.world.clearHighlight();
  }

  /* ---------- 主循环 ---------- */
  loop(now){
    requestAnimationFrame(t=>this.loop(t));
    const dt=Math.min(.05,(now-this.last)/1000); this.last=now;
    if(this.exporting) return;
    if(this.game && !this.game.paused && !this.game.over){
      this.acc+=dt*this.game.speed;
      let steps=0;
      while(this.acc>=1/60 && steps<10){ this.game.update(1/60); this.acc-=1/60; steps++; }
    } else this.acc=0;
    this.world.update(dt);
    if(this.mode==='menu'||this.mode==='select'){
      this.world.camTheta+=dt*.018;
      this.world.applyCamera();
    }
    this.uiTimer+=dt;
    if(this.uiTimer>.16){
      this.uiTimer=0;
      if(this.game){ this.ui.refreshAll(); }
      if(this.demoRunner){
        this.demoRunner.renderUI();
        if(this.demoRunner.finished && !this.demoEndTimer){
          this.demoEndTimer=setTimeout(()=>this.stopDemo(),1400);
        }
      }
    }
    this.world.render();
  }

  /* ---------- 实战演示 ---------- */
  startDemo(runId,opts={}){
    this.stopDemo(true);
    this.acc=0; this.last=performance.now();
    this.exporting=!!opts.export;
    if(this.exporting) document.body.classList.add('export-mode'); else document.body.classList.remove('export-mode');
    this.mode='demo';
    this.currentMapId=demoMapId(runId);
    AudioSys.init(); if(!opts.export) AudioSys.resume();
    AudioSys.ambient(this.currentMapId);
    const cfg=demoConfig(runId);
    const map=MAPS.byId(cfg.mapId);
    this.world.setMap(map);
    this.world.resetCamera();
    this.world.game=null;
    const game=new Game(map,{world:this.world,ui:this.ui,seed:777,compute:cfg.compute,intel:cfg.intel,core:100});
    this.game=game; this.world.game=game;
    this.ui.showBattle(game);
    this.ui.el.toast.innerHTML='';
    this.ui.el.forecast.classList.add('hidden');
    this.ui.showDemoControls(true);
    this.ui.demoCursor(0,0,false);
    this.ui.demoDragGhost(null,0,0,false);
    const runner=new DemoRunner(runId,game,this.world,this.ui,this,cfg,opts.fps||30);
    game.demo=runner;
    cfg.setup(game,runner);
    runner.init();
    this.demoRunner=runner;
    if(this.exporting){
      this.ui.hideSubtitle();
      this.ui.refreshAll();
      runner.render(0);
      this.world.render();
    }
  }

  stopDemo(silent){
    if(this.demoEndTimer){ clearTimeout(this.demoEndTimer); this.demoEndTimer=null; }
    this.exporting=false;
    document.body.classList.remove('export-mode');
    if(this.game) this.game.demo=null;
    this.demoRunner=null;
    this.game=null;
    this.world.game=null;
    this.ui.showDemoControls(false);
    this.ui.demoCursor(0,0,false);
    this.ui.demoDragGhost(null,0,0,false);
    this.ui.demoHighlightItem(null);
    this.ui.hideSubtitle();
    if(!silent){
      this.mode='select';
      this.world.setMap(MAPS.byId('map1'));
      this.world.resetCamera(); this.world.camRadius=104; this.world.camPhi=.8; this.world.applyCamera();
      this.ui.showScreen('select');
    }
  }

  beginExport(runId,fps){
    this.startDemo(runId,{export:true,fps});
    return {frames:this.demoRunner.totalFrames};
  }
  exportFrame(i){
    const r=this.demoRunner; if(!r) return;
    const target=i/r.fps;
    let guard=0;
    while(this.game.time < target-1e-7 && guard<20000){
      const step=Math.min(1/120, target-this.game.time);
      this.game.update(step);
      this.world.update(step);
      guard++;
    }
    // 确保 demo 状态同步
    r.render(i);
    this.ui.refreshAll();
    this.ui.updateDemoProgress(Math.min(target,r.duration),r.duration);
    this.world.render();
  }
  endExport(){
    this.stopDemo(true);
    this.mode='menu';
    this.world.setMap(MAPS.byId('map1'));
    this.world.resetCamera(); this.world.camRadius=104; this.world.camPhi=.8; this.world.applyCamera();
    this.ui.showScreen('menu');
    this.ui.showDemoControls(false);
    this.ui.demoCursor(0,0,false);
    AudioSys.stopAll();
    AudioSys.ambient('menu');
  }
}

function demoMapId(runId){ return runId==='demo-1'?'map1':runId==='demo-2'?'map2':'map3'; }

/* ============================================================
 * 演示编排
 * ============================================================ */
class DemoRunner {
  constructor(runId,game,world,ui,main,cfg,fps){
    this.runId=runId; this.game=game; this.world=world; this.ui=ui; this.main=main;
    this.cfg=cfg; this.fps=fps; this.duration=cfg.duration;
    this.totalFrames=Math.ceil(this.duration*fps);
    this.actions=cfg.actions.map(a=>({...a,done:false})).sort((a,b)=>a.t-b.t);
    this.subs=cfg.subs||[];
    this.camKeys=cfg.camera||[];
    this.drag=null;
    this.nextAction=0;
    this.subIndex=-1;
    this.finished=false;
    this.endShown=false;
  }
  init(){
    this.applyCamera(0);
    this.ui.demoCursor(0,0,false);
  }
  cellScreen(cell){
    const w=this.world.map.world(cell.x,cell.z);
    return this.world.worldToScreen(w.x, 1.2, w.z);
  }
  cardCenter(type){
    const el=this.ui.el.deck.querySelector(`[data-type="${type}"]`);
    if(!el) return {x:window.innerWidth/2,y:window.innerHeight*.8};
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  }
  itemCenter(id){
    const el=this.ui.el.items.querySelector(`[data-item="${id}"]`);
    if(!el) return {x:window.innerWidth*.8,y:window.innerHeight*.85};
    const r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2};
  }
  dragTower(type,cell,dur=1.6){
    this.drag={kind:'tower',type,cell,start:this.game.time,dur,from:this.cardCenter(type),to:this.cellScreen(cell),facing:0,applied:false};
    this.ui.demoHighlightCard(type);
    this.ui.demoCursor(this.drag.from.x,this.drag.from.y,true);
  }
  dragItem(id,cell,dur=1.5){
    this.drag={kind:'item',item:id,cell,start:this.game.time,dur,from:this.itemCenter(id),to:this.cellScreen(cell),applied:false};
    this.ui.demoHighlightItem(id);
    this.ui.demoCursor(this.drag.from.x,this.drag.from.y,true);
  }
  clickWorld(cell,tag=''){
    const p=this.cellScreen(cell);
    this.ui.demoCursor(p.x,p.y,true);
    if(tag) this.ui.toast(tag);
  }
  clickTower(id){
    const t=this.game.towerById(id); if(!t) return;
    const w=this.world.map.world(t.cell.x,t.cell.z);
    const p=this.world.worldToScreen(w.x,2.0,w.z);
    this.ui.demoCursor(p.x,p.y,true);
    this.game.select('tower',id); this.ui.selEnemyId=null;
  }
  updateDrag(){
    if(!this.drag) return;
    const d=this.drag, t=this.game.time;
    const k=Math.max(0,Math.min(1,(t-d.start)/d.dur));
    const e=k*k*(3-2*k);
    const x=d.from.x+(d.to.x-d.from.x)*e, y=d.from.y+(d.to.y-d.from.y)*e;
    this.ui.demoCursor(x,y,true);
    if(d.kind==='tower'){
      if(k>.12 && !d.began){
        d.began=true;
        this.game.beginPlacement(d.type);
        this.ui.onPlacementStart(d.type);
      }
      if(d.began){
        const dx=d.to.x-d.from.x, dy=d.to.y-d.from.y;
        d.facing=Math.atan2(dx,-dy);
        this.game.updatePlacement(d.cell,d.facing);
        this.ui.demoDragGhost(d.type,x,y,true);
      }
      if(k>=1 && !d.applied){
        d.applied=true;
        const res=this.game.confirmPlacement();
        this.ui.onPlacementEnd();
        this.ui.demoDragGhost(null,0,0,false);
        this.ui.demoHighlightCard(null);
        this.drag=null;
        if(res&&res.ok){ this.ui.toast('已部署 '+DATA.TOWERS[d.type].name,'good'); this.ui.subtitle('设备已就位，路线开始收敛。','SYS',2); }
        else { this.ui.toast(res&&res.reason?res.reason:'部署失败','warn'); }
      }
    } else {
      if(k>=1 && !d.applied){
        d.applied=true;
        const res=this.game.useItem(d.item,{cell:d.cell});
        this.drag=null;
        this.ui.demoDragGhost(null,0,0,false);
        this.ui.demoHighlightItem(null);
        if(res&&res.ok){ this.ui.toast(DATA.ITEMS[d.item].name+' 已投放','good'); }
        else this.ui.toast(res&&res.reason?res.reason:'道具投放失败','warn');
      }
    }
  }
  applyCamera(t){
    if(!this.camKeys.length) return;
    let a=this.camKeys[0], b=this.camKeys[this.camKeys.length-1];
    for(let i=0;i<this.camKeys.length-1;i++){
      if(t>=this.camKeys[i].t && t<=this.camKeys[i+1].t){ a=this.camKeys[i]; b=this.camKeys[i+1]; break; }
    }
    let k=b.t===a.t?1:(t-a.t)/(b.t-a.t); k=Math.max(0,Math.min(1,k)); k=k*k*(3-2*k);
    const lerp=(x,y)=>x+(y-x)*k;
    this.world.camTarget.set(lerp(a.target[0],b.target[0]),0,lerp(a.target[1],b.target[1]));
    this.world.camRadius=lerp(a.r,b.r);
    this.world.camTheta=lerp(a.theta,b.theta);
    this.world.camPhi=lerp(a.phi,b.phi);
    this.world.applyCamera();
  }
  update(){
    const t=this.game.time;
    while(this.nextAction==null) this.nextAction=0;
    while(this.nextAction<this.actions.length && this.actions[this.nextAction].t<=t){
      const a=this.actions[this.nextAction++]; if(!a.done){ a.done=true; try{a.fn();}catch(e){console.warn('demo action',e);} }
    }
    this.updateDrag();
    this.applyCamera(t);
    let si=-1;
    for(let i=0;i<this.subs.length;i++){ if(t>=this.subs[i].t) si=i; }
    if(si!==this.subIndex){
      this.subIndex=si;
      if(si>=0 && t<=this.subs[si].t+this.subs[si].dur) this.ui.setSubtitle(this.subs[si].text,this.subs[si].tag||'SYS');
      else this.ui.hideSubtitle();
    } else if(si>=0 && t>this.subs[si].t+this.subs[si].dur){
      this.ui.hideSubtitle();
    }
    if(t>=this.duration && !this.finished){ this.finished=true; this.ui.setSubtitle('演示结束 · 可退出后继续防御。','SYS'); }
  }
  renderUI(){
    this.ui.updateDemoProgress(Math.min(this.game.time,this.duration),this.duration);
  }
  render(frameIndex){
    this.applyCamera(this.game.time);
    this.updateDrag();
    const t=this.game.time;
    let si=-1;
    for(let i=0;i<this.subs.length;i++){ if(t>=this.subs[i].t) si=i; }
    if(si>=0 && t<=this.subs[si].t+this.subs[si].dur) this.ui.setSubtitle(this.subs[si].text,this.subs[si].tag||'SYS');
    else this.ui.hideSubtitle();
    this.ui.updateDemoProgress(t,this.duration);
  }
}

/* ---------- 演示配置 ---------- */
function demoConfig(runId){
  if(runId==='demo-1') return demo1();
  if(runId==='demo-2') return demo2();
  return demo3();
}

function demo1(){
  let runner;
  return {
    mapId:'map1', duration:18, compute:620, intel:90,
    setup(game,r){
      runner=r;
      game.demoAddTowers([
        {type:'firewall',cell:{x:4,z:4}},
        {type:'interceptor',cell:{x:5,z:6},facing:0},
        {type:'interceptor',cell:{x:14,z:6},facing:0},
        {type:'sandbox',cell:{x:9,z:8}},
        {type:'honeypot',cell:{x:12,z:4}},
        {type:'repair',cell:{x:8,z:13}}
      ]);
      for(let i=0;i<6;i++) game.spawnEnemy('worm','A');
      for(let i=0;i<3;i++) game.spawnEnemy('trojan','A');
      for(let i=0;i<2;i++) game.spawnEnemy('ransom','B');
    },
    actions:[
      {t:0.2,fn:()=>{ const r=runner; r.ui.setSubtitle('蛰影的蠕虫正从门户网站涌入。办公网段与 DMZ 之间，只有西边界节点可控。','SYS'); }},
      {t:1.0,fn:()=>{ runner.game.spawnEnemy('worm','A'); runner.game.spawnEnemy('worm','A'); }},
      {t:3.2,fn:()=>runner.dragTower('netgate',{x:5,z:4},1.9)},
      {t:3.0,fn:()=>{ runner.ui.demoHighlightCard('netgate'); runner.ui.toast('网闸：隔离西边界节点，预览 A 的新路线','intel'); }},
      {t:6.4,fn:()=>{ runner.ui.toast('A 的路线已改向 DMZ 互联','good'); }},
      {t:7.0,fn:()=>{ runner.game.spawnEnemy('worm','B'); runner.game.spawnEnemy('trojan','B'); runner.game.spawnEnemy('trojan','B'); }},
      {t:8.6,fn:()=>{ const rep=runner.game.towers.find(t=>t.type==='repair'); if(rep){ runner.clickTower(rep.id); runner.ui.toast('选中修复进程，准备释放冗余切换','good'); } }},
      {t:10.4,fn:()=>{ const rep=runner.game.towers.find(t=>t.type==='repair'); if(rep){ const res=runner.game.useSkill(rep.id); if(res.ok) runner.ui.toast('冗余切换：附近塔获得护盾并解除加密','good'); } }},
      {t:12.0,fn:()=>{ runner.game.spawnEnemy('ransom','A'); runner.game.spawnEnemy('worm','B'); }},
      {t:13.4,fn:()=>{ runner.ui.setSubtitle('勒索者仍在远程压制平台，但 A 的流量已经绕开西边界，防线正在恢复节奏。','SYS'); }},
      {t:16.0,fn:()=>{ runner.ui.setSubtitle('路线改变不是免费的：隔离器会被攻击，节点恢复后还有再隔离间隔。','SYS'); }}
    ],
    camera:[
      {t:0,target:[0,0],r:104,theta:1.5708,phi:.84},
      {t:2.6,target:[0,0],r:96,theta:1.5708,phi:.82},
      {t:4.2,target:[-18,0],r:42,theta:1.35,phi:.72},
      {t:7.2,target:[-10,2],r:52,theta:1.5,phi:.78},
      {t:10.5,target:[2,4],r:48,theta:1.6,phi:.8},
      {t:14.0,target:[0,2],r:78,theta:1.55,phi:.84},
      {t:18,target:[0,0],r:104,theta:1.5708,phi:.84}
    ],
    subs:[
      {t:.2,dur:3.0,tag:'SYS',text:'蛰影的蠕虫正从门户网站涌入。办公网段与 DMZ 之间，只有西边界节点可控。'},
      {t:3.6,dur:2.6,tag:'部署',text:'把网闸拖到西边界节点。预览显示 A 将从办公网段折向 DMZ 互联。'},
      {t:6.5,dur:2.8,tag:'路由',text:'隔离确认。A 的流量掉头，与 B 汇流。'},
      {t:9.2,dur:2.4,tag:'战斗',text:'勒索者正在远程压制平台。修复进程开始支援。'},
      {t:12.2,dur:2.8,tag:'战况',text:'防线仍在承受压力，但路线已经改变，火力覆盖重新形成。'},
      {t:15.4,dur:2.6,tag:'提示',text:'隔离会消耗情报；节点恢复直通后，还有短暂的再次隔离间隔。'}
    ]
  };
}

function demo2(){
  let runner;
  return {
    mapId:'map2', duration:21, compute:720, intel:110,
    setup(game,r){
      runner=r;
      game.demoAddTowers([
        {type:'netgate',cell:{x:13,z:5}},
        {type:'firewall',cell:{x:8,z:4}},
        {type:'interceptor',cell:{x:6,z:6},facing:Math.PI/2},
        {type:'interceptor',cell:{x:9,z:8},facing:0},
        {type:'sandbox',cell:{x:2,z:9}},
        {type:'honeypot',cell:{x:12,z:10}},
        {type:'repair',cell:{x:6,z:12}}
      ]);
      for(let i=0;i<4;i++) game.spawnEnemy('worm','C');
      for(let i=0;i<3;i++) game.spawnEnemy('trojan','B');
      for(let i=0;i<2;i++) game.spawnEnemy('ransom','A');
      game.spawnEnemy('flood','C');
      game.spawnEnemy('flood','B');
    },
    actions:[
      {t:.2,fn:()=>{ runner.ui.setSubtitle('骨干流域的洪峰正在三个入口同时施压。C 与 B 被网闸逼向数据中心 X。','SYS'); }},
      {t:1.2,fn:()=>{ runner.ui.toast('洪泛团正在冲击节点上的网闸','warn'); }},
      {t:4.6,fn:()=>{ const g=runner.game.towers.find(t=>t.type==='netgate'); if(g){ runner.game.damageTower(g,9999,{source:null}); runner.world.explosion({x:runner.world.map.world(13,5).x,y:1,z:runner.world.map.world(13,5).z},0xff8a5c,1.6); runner.ui.toast('网闸被冲垮，C、B 的路线重新收敛','warn'); } }},
      {t:6.2,fn:()=>{ runner.ui.toast('玩家准备在 A 的路线上投放协议降级','intel'); }},
      {t:7.0,fn:()=>runner.dragItem('downgrade',{x:7,z:4},1.7)},
      {t:9.4,fn:()=>{ runner.ui.setSubtitle('协议降级让 A 的路段暂时使用旧协议，敌人减速并显形，路线随通行速度重新选择。','SYS'); }},
      {t:12.0,fn:()=>{ const rep=runner.game.towers.find(t=>t.type==='repair'); if(rep){ runner.clickTower(rep.id); const res=runner.game.useSkill(rep.id); if(res.ok) runner.ui.toast('冗余切换：护盾与解密已覆盖防线','good'); } }},
      {t:15.0,fn:()=>{ runner.game.spawnEnemy('worm','A'); runner.game.spawnEnemy('worm','A'); }},
      {t:17.0,fn:()=>{ runner.ui.setSubtitle('C、B 回到 Y 的路线，A 被旧协议拖慢。改道的收益与风险同时出现。','SYS'); }},
      {t:19.2,fn:()=>{ runner.ui.setSubtitle('双活数据中心的备份关系，让每个入口都有第二条路。','SYS'); }}
    ],
    camera:[
      {t:0,target:[0,0],r:104,theta:1.5708,phi:.84},
      {t:2.0,target:[14,1],r:46,theta:1.35,phi:.72},
      {t:5.5,target:[14,1],r:42,theta:1.5,phi:.7},
      {t:8.0,target:[-18,2],r:48,theta:1.35,phi:.74},
      {t:11.0,target:[-10,4],r:52,theta:1.5,phi:.78},
      {t:15.0,target:[0,2],r:72,theta:1.55,phi:.82},
      {t:21,target:[0,0],r:104,theta:1.5708,phi:.84}
    ],
    subs:[
      {t:.2,dur:3.0,tag:'洪峰',text:'骨干流域的洪峰正在三个入口同时施压。C 与 B 被网闸逼向数据中心 X。'},
      {t:3.2,dur:2.0,tag:'警报',text:'洪泛团离开路线，冲向被隔离的汇聚节点。'},
      {t:5.2,dur:2.4,tag:'事件',text:'网闸被冲垮。C、B 的路线改回原来的数据中心 Y。'},
      {t:7.4,dur:2.8,tag:'道具',text:'玩家在 A 的路线上投放协议降级，拖慢并暴露经过的敌人。'},
      {t:10.2,dur:2.6,tag:'战况',text:'A 的路线随通行速度重新选择，压力被分摊到两侧。'},
      {t:13.4,dur:2.4,tag:'支援',text:'修复进程释放冗余切换，为防线提供护盾并解除加密。'},
      {t:16.8,dur:2.6,tag:'提示',text:'双活中心互为备份：一次隔离改变的不只是路线，还有交战分布。'}
    ]
  };
}

function demo3(){
  let runner;
  return {
    mapId:'map3', duration:21, compute:900, intel:130,
    setup(game,r){
      runner=r;
      game.demoAddTowers([
        {type:'sandbox',cell:{x:12,z:12}},
        {type:'interceptor',cell:{x:8,z:12},facing:Math.PI},
        {type:'interceptor',cell:{x:16,z:12},facing:Math.PI},
        {type:'repair',cell:{x:7,z:11}},
        {type:'firewall',cell:{x:5,z:4}},
        {type:'honeypot',cell:{x:15,z:10}}
      ]);
      const boss=game.spawnEnemy('boss_zheying','B');
      boss.hp=Math.round(boss.maxHp*.92);
      for(let i=0;i<4;i++) game.spawnEnemy('worm','B');
      for(let i=0;i<2;i++) game.spawnEnemy('trojan','A');
      for(let i=0;i<2;i++) game.spawnEnemy('ransom','C');
      runner.boss=boss;
    },
    actions:[
      {t:.2,fn:()=>{ runner.ui.setSubtitle('气隙深层的第 16 波。蛰影从办公网下行进入，沙箱开始检测它的伪装。','SYS'); }},
      {t:1.2,fn:()=>{ if(runner.boss){ runner.boss.forcedPhase=2; runner.ui.toast('蛰影进入「提权」阶段，护甲强化并释放木马','warn'); } }},
      {t:2.8,fn:()=>{ if(runner.boss){ runner.boss.forcedPhase=3; runner.ui.toast('蛰影进入「破坏」阶段，前方运维环即将锁死','warn'); } }},
      {t:3.0,fn:()=>{ runner.ui.setSubtitle('蛰影锁死前方一段运维环。各入口的路线将重新收敛，注意红色预警位置。','SYS'); }},
      {t:8.2,fn:()=>{ const rep=runner.game.towers.find(t=>t.type==='repair'); if(rep){ runner.clickTower(rep.id); runner.ui.toast('选中修复进程，准备释放冗余切换','good'); } }},
      {t:10.0,fn:()=>{ const rep=runner.game.towers.find(t=>t.type==='repair'); if(rep){ const res=runner.game.useSkill(rep.id); if(res.ok) runner.ui.toast('冗余切换：附近塔获得护盾并解除加密','good'); } }},
      {t:12.0,fn:()=>{ runner.game.spawnEnemy('trojan','B'); runner.game.spawnEnemy('trojan','B'); }},
      {t:14.0,fn:()=>{ runner.ui.setSubtitle('两个核心的防守相互牵制：运维环被锁死后，流量挤入两侧狭窄通道。','SYS'); }},
      {t:17.0,fn:()=>{ runner.ui.setSubtitle('修复进程维持关键节点的防守，蛰影的破坏阶段仍在持续。','SYS'); }},
      {t:19.2,fn:()=>{ runner.ui.setSubtitle('路线再次收敛。气隙深层的防御，取决于你愿意守住哪一侧。','SYS'); }}
    ],
    camera:[
      {t:0,target:[0,0],r:104,theta:1.5708,phi:.84},
      {t:1.6,target:[-6,2],r:48,theta:1.4,phi:.72},
      {t:4.0,target:[0,2],r:50,theta:1.5,phi:.76},
      {t:7.5,target:[0,4],r:44,theta:1.55,phi:.72},
      {t:11.0,target:[-4,5],r:46,theta:1.5,phi:.76},
      {t:15.0,target:[0,2],r:72,theta:1.55,phi:.8},
      {t:21,target:[0,0],r:104,theta:1.5708,phi:.84}
    ],
    subs:[
      {t:.2,dur:3.0,tag:'第 16 波',text:'气隙深层的第 16 波。蛰影从办公网下行进入，沙箱开始检测它的伪装。'},
      {t:3.0,dur:2.8,tag:'破坏',text:'蛰影锁死前方一段运维环。各入口的路线重新收敛，红色位置是预警。'},
      {t:6.2,dur:2.4,tag:'路由',text:'路线已收敛：流量挤入两侧狭窄通道，两个核心同时承压。'},
      {t:8.8,dur:2.6,tag:'操作',text:'玩家选中修复进程，准备释放冗余切换。'},
      {t:11.2,dur:2.6,tag:'技能',text:'护盾展开，加密解除。关键节点的防守得以维持。'},
      {t:14.2,dur:2.8,tag:'战况',text:'两侧通道的攻防互相牵制，蛰影的破坏阶段仍在持续。'},
      {t:17.6,dur:2.8,tag:'提示',text:'路线再次收敛。气隙深层的防御，取决于你愿意守住哪一侧。'}
    ]
  };
}

/* ============================================================
 * 启动 & 视频导出接口
 * ============================================================ */
let APP=null;
window.addEventListener('load',()=>{
  APP=new Main();
  window.__APP=APP;
});

window.videoExport={
  runs:['demo-1','demo-2','demo-3'],
  async begin(runId,opts={}){
    if(!APP) throw new Error('app not ready');
    return APP.beginExport(runId, opts.fps||30);
  },
  async frame(i){
    if(!APP) throw new Error('app not ready');
    APP.exportFrame(i);
  },
  end(){
    if(APP) APP.endExport();
  }
};