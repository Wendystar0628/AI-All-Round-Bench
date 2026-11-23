/* ============================================================
 * 模拟层：路由、塔、敌人、波次、道具、Boss、胜负
 * ============================================================ */
class Game {
  constructor(map, opts={}){
    this.map=map;
    this.U=map.tile;
    this.world=opts.world||null;
    this.ui=opts.ui||null;
    this.time=0;
    this.speed=1;
    this.paused=false;
    this.over=false;
    this.won=false;
    this.compute=opts.compute!=null?opts.compute:450;
    this.intel=opts.intel!=null?opts.intel:45;
    this.core=opts.core!=null?opts.core:100;
    this.waveIndex=opts.waveIndex||0;
    this.waveActive=false;
    this.waveGroups=[];
    this.towers=[];
    this.enemies=[];
    this.projectiles=[];
    this.nodeStates=new Map();
    this.lockCells=new Map();
    this.downgrade={cells:new Set(),expires:0};
    this.routes={};
    this.routeVersion=0;
    this.nextId=1;
    this.seed=opts.seed||12345;
    this.stats={kills:0,built:0,lost:0,leaks:0,intelEarned:0,computeEarned:0,start:this.time};
    this.logs=[];
    this.selected=null;
    this.placement=null;
    this.itemTargeting=null;
    this.demo=null;
    this.intelHoldTimer=0;
    this.lastUi=0;
    this.itemCds={};
    this.previewList=[];
    this.pending=[];
    this.rng=mulberry32(this.seed);
    this.waves=DATA.WAVES[map.id];
    this.recomputeRoutes(true);
    if(this.world){ this.world.game=this; }
  }

  /* ---------- 基础工具 ---------- */
  key(c){ return c.x+','+c.z; }
  nodeState(cell){ return this.nodeStates.get(this.key(cell)); }
  activeNode(cell){ const s=this.nodeState(cell); return s&&s.active; }
  towerAt(cell){ return this.towers.find(t=>t.cell.x===cell.x && t.cell.z===cell.z); }
  towerById(id){ return this.towers.find(t=>t.id===id); }
  blockUsed(t){ let n=0; for(const id of t.blocked){ const e=this.enemyById(id); if(e && !e.dead) n+=(DATA.ENEMIES[e.type].blockUse||1); } return n; }
  enemyById(id){ return this.enemies.find(e=>e.id===id); }
  towerCellWorld(t){ return this.map.world(t.cell.x,t.cell.z); }
  towerY(t){ return this.map.cell(t.cell.x,t.cell.z)==='p'?1.21:.55; }
  enemyY(e){ return e.flying?3.4:0.0; }

  log(text,type='info'){
    this.logs.push({t:this.time,text,type});
    if(this.logs.length>200) this.logs.shift();
  }

  blockedNodes(){
    const s=new Set();
    for(const [k,v] of this.nodeStates) if(v.active) s.add(k);
    return s;
  }
  lockedCells(){
    const s=new Set();
    for(const [k,v] of this.lockCells) if(v.expires>this.time) s.add(k);
    return s;
  }

  /* ---------- 路由 ---------- */
  routeFor(entry, blocked, locked, preferred){
    const e=this.map.entryById(entry);
    let ex=preferred||e.defaultExit;
    let p=MAPS.findPath(this.map,e.cell,this.map.exitById(ex).cell,{blockedNodes:blocked,lockedCells:locked,downgrade:this.downgrade.expires>this.time?this.downgrade.cells:null});
    if(!p){
      for(const x of this.map.exits){
        if(x.id===ex) continue;
        const p2=MAPS.findPath(this.map,e.cell,x.cell,{blockedNodes:blocked,lockedCells:locked,downgrade:this.downgrade.expires>this.time?this.downgrade.cells:null});
        if(p2 && (!p || p2.length<p.length)){ p=p2; ex=x.id; }
      }
    }
    return p?{entryId:entry,exitId:ex,path:p,color:e.color}:null;
  }

  recomputeRoutes(initial=false){
    const blocked=this.blockedNodes(), locked=this.lockedCells();
    const prev=JSON.stringify(this.routes);
    const next={};
    let changed=false; const changedIds=[];
    for(const e of this.map.entries){
      const old=this.routes[e.id];
      const r=this.routeFor(e.id,blocked,locked,old?old.exitId:e.defaultExit);
      if(r) next[e.id]=r;
    }
    for(const e of this.map.entries){
      const a=prev?JSON.parse(prev)[e.id]:null;
      const b=next[e.id];
      if(!a || !b || JSON.stringify(a.path)!==JSON.stringify(b.path) || a.exitId!==b.exitId){ changed=true; changedIds.push(e.id); }
    }
    this.routes=next;
    if(changed && !initial){
      this.routeVersion++;
      this.rerouteEnemies();
      this.audio('reroute');
      if(this.world) this.world.flashRoutes(changedIds);
      if(this.ui && !this.demo){ this.ui.toast('路线已更新：'+changedIds.join(' / '),'intel'); }
      if(this.world) this.world.updateRoutes(this.routeList(),this.previewList||[]);
      if(this.ui) this.ui.onRoutesChanged();
    } else if(initial && this.world){
      this.world.updateRoutes(this.routeList(),[]);
    }
    return changed;
  }

  routeList(){
    return Object.values(this.routes).map(r=>({entryId:r.entryId,exitId:r.exitId,path:r.path,color:r.color}));
  }

  previewListFor(cell){
    const blocked=this.blockedNodes(); blocked.add(cell.x+','+cell.z);
    const locked=this.lockedCells();
    const out=[];
    for(const e of this.map.entries){
      const old=this.routes[e.id];
      const r=this.routeFor(e.id,blocked,locked,old?old.exitId:e.defaultExit);
      if(r) out.push(r);
    }
    return out;
  }

  validateIsolation(cell, opts={}){
    if(!opts.force){
      const s=this.nodeState(cell);
      if(s && s.active) return {ok:false,reason:'该节点已处于隔离状态'};
      if(s && s.reopenAt>this.time) return {ok:false,reason:'节点恢复直通后的再隔离间隔尚未结束（'+Math.ceil(s.reopenAt-this.time)+' 秒）'};
    }
    const blocked=this.blockedNodes(); blocked.add(cell.x+','+cell.z);
    const locked=this.lockedCells();
    // 每个入口必须仍有通往某个出口的道路
    for(const e of this.map.entries){
      let ok=false;
      for(const x of this.map.exits){
        const p=MAPS.findPath(this.map,e.cell,x.cell,{blockedNodes:blocked,lockedCells:locked,downgrade:this.downgrade.expires>this.time?this.downgrade.cells:null});
        if(p){ok=true;break;}
      }
      if(!ok) return {ok:false,reason:'入口 '+e.id+' 将被完全封死',blockAt:e.cell};
    }
    // 场上地面敌人必须有路
    for(const en of this.enemies){
      if(en.flying) continue;
      const from=this.nearestWalkable(en);
      let ok=false;
      for(const x of this.map.exits){
        const p=MAPS.findPath(this.map,[from.x,from.z],x.cell,{blockedNodes:blocked,lockedCells:locked});
        if(p){ok=true;break;}
      }
      if(!ok) return {ok:false,reason:'场上敌人 '+DATA.ENEMIES[en.type].name+' 将被困死',blockAt:from};
    }
    return {ok:true};
  }

  nearestWalkable(en){
    const cx=Math.round(en.pos.x/this.map.tile+(this.map.w-1)/2);
    const cz=Math.round(en.pos.z/this.map.tile+(this.map.h-1)/2);
    const cands=[[cx,cz],[cx+1,cz],[cx-1,cz],[cx,cz+1],[cx,cz-1],[cx+1,cz+1],[cx-1,cz-1],[cx+1,cz-1],[cx-1,cz+1]];
    for(const [x,z] of cands){ if(this.map.walkable(x,z)) return {x,z}; }
    return {x:cx,z:cz};
  }

  rerouteEnemies(){
    for(const en of this.enemies){
      if(en.dead) continue;
      if(en.blockedBy){ const old=this.towerById(en.blockedBy); if(old) old.blocked.delete(en.id); en.blockedBy=null; }
      if(en.flying){ const fr=this.routes[en.entryId]; if(fr) en.exit=fr.exitId; this.setFlyingPath(en); continue; }
      const from=this.nearestWalkable(en);
      let exit=en.exit;
      let p=MAPS.findPath(this.map,[from.x,from.z],this.map.exitById(exit).cell,{blockedNodes:this.blockedNodes(),lockedCells:this.lockedCells(),downgrade:this.downgrade.expires>this.time?this.downgrade.cells:null});
      if(!p){
        for(const x of this.map.exits){
          const p2=MAPS.findPath(this.map,[from.x,from.z],x.cell,{blockedNodes:this.blockedNodes(),lockedCells:this.lockedCells()});
          if(p2){ p=p2; exit=x.id; break; }
        }
      }
      if(p){
        en.exit=exit;
        en.path=p.map(c=>({x:c[0],z:c[1]}));
        en.pathIdx=1;
        en.cell=from;
        en.blockedBy=null;
      }
    }
  }

  setFlyingPath(en){
    const e=this.map.entryById(en.entryId);
    const x=this.map.exitById(en.exit);
    en.path=[{x:e.cell[0],z:e.cell[1]},{x:x.cell[0],z:x.cell[1]}];
    en.pathIdx=1;
  }

  /* ---------- 塔 ---------- */
  statsFor(t){
    const d=DATA.TOWERS[t.type];
    const s={
      range:d.range||0, dmg:d.dmg||0, rate:d.rate||1, block:d.block||0,
      heal:d.heal||0, aoe:d.aoe||0, detect:d.detect||0, lure:d.lure||0,
      arc:d.arc||0, pierce:!!d.pierce, slow:d.slow||0, slowDur:d.slowDur||0,
      reflect:0, regen:0, skillCd:d.skill?d.skill.cd:0, skillDur:3.5
    };
    if(t.level>=2 && d.level2) Object.assign(s,d.level2);
    if(t.branch && d.branches && d.branches[t.branch]){
      const b=d.branches[t.branch];
      if(b.hp) s.hp=b.hp;
      if(b.dmg) s.dmg=b.dmg;
      if(b.range) s.range=b.range;
      if(b.rate) s.rate=b.rate;
      if(b.block) s.block=b.block;
      if(b.lure) s.lure=b.lure;
      if(b.skillCd) s.skillCd=b.skillCd;
      if(b.skillDur) s.skillDur=b.skillDur;
      if(b.reflect) s.reflect=b.reflect;
      if(b.pierce) s.pierce=true;
      if(b.slow) s.slow=b.slow;
      if(b.slowDur) s.slowDur=b.slowDur;
    }
    return s;
  }

  canPlace(type,cell,opts={}){
    const d=DATA.TOWERS[type];
    if(!cell) return {ok:false,reason:'无效位置'};
    if(this.over) return {ok:false,reason:'战斗已结束'};
    if(this.map.entries.some(e=>e.cell[0]===cell.x&&e.cell[1]===cell.z) || this.map.exits.some(e=>e.cell[0]===cell.x&&e.cell[1]===cell.z)) return {ok:false,reason:'入口与出口不能部署设备'};
    const ch=this.map.cell(cell.x,cell.z);
    const kind=ch==='.'?'link':ch==='o'?'link':ch==='n'?'node':ch==='p'?'platform':ch;
    if(!d.build.includes(kind)) return {ok:false,reason:'该地形不能部署'+d.name};
    if(this.towerAt(cell)) return {ok:false,reason:'该位置已有设备'};
    if(this.compute<d.cost && !opts.ignoreCost) return {ok:false,reason:'算力不足'};
    if(this.map.cell(cell.x,cell.z)==='n'){
      const v=this.validateIsolation(cell);
      if(!v.ok) return v;
    }
    return {ok:true};
  }

  placeTower(type,cell,facing=0,opts={}){
    const chk=this.canPlace(type,cell,opts);
    if(!chk.ok) return {ok:false,...chk};
    const d=DATA.TOWERS[type];
    const t={
      id:'T'+this.nextId++, type, cell:{x:cell.x,z:cell.z}, level:1, branch:null,
      hp:d.hp, maxHp:d.hp, shield:0, encryptedUntil:0, cd:0, skillCd:0,
      facing, totalCost:d.cost, blocked:new Set(), selected:false, hitFlash:0,
      nodeIsolation:false, shots:0, healCd:0
    };
    this.towers.push(t);
    if(!opts.ignoreCost) this.compute-=d.cost;
    this.stats.built++;
    if(this.world){ this.world.addTower(t); }
    if(this.map.cell(cell.x,cell.z)==='n'){
      t.nodeIsolation=true;
      const ok=this.isolateNode(cell,'tower:'+t.id,{hp:d.hp,maxHp:d.hp,tower:t});
      if(!ok.ok){ this.towers.pop(); if(this.world) this.world.removeTower(t.id); this.compute+=d.cost; this.stats.built--; return ok; }
    }
    this.audio('place');
    this.log('部署 '+d.name+' @ '+(cell.x+1)+','+(cell.z+1));
    if(this.ui) this.ui.onTowerBuilt(t);
    return {ok:true,tower:t};
  }

  isolateNode(cell,source,opts={}){
    const v=this.validateIsolation(cell,{force:opts.force});
    if(!v.ok) return v;
    const hp=opts.hp||300, maxHp=opts.maxHp||hp;
    const st={
      active:true, expires:opts.expires||0, hp, maxHp,
      source, temp:!!opts.temp, tower:opts.tower||null,
      reopenAt:0, started:this.time
    };
    this.nodeStates.set(this.key(cell),st);
    if(this.world){
      this.world.setNodeVisual(cell,st);
      const w=this.map.world(cell.x,cell.z);
      this.world.ringPulse({x:w.x,z:w.z},0xff5d72,2.4,.5,.6);
    }
    this.audio('isolate');
    this.log('节点 '+cell.x+','+cell.z+' 隔离');
    this.recomputeRoutes();
    if(this.ui) this.ui.onIsolationChanged();
    return {ok:true};
  }

  releaseNode(cell,reason='解除隔离'){
    const k=this.key(cell), st=this.nodeStates.get(k);
    if(!st||!st.active) return;
    st.active=false; st.expires=0; st.reopenAt=this.time+8;
    if(this.world){
      this.world.setNodeVisual(cell,st);
      const w=this.map.world(cell.x,cell.z);
      this.world.ringPulse({x:w.x,z:w.z},0x6cf0a8,2.0,.45,.6);
    }
    this.log('节点 '+cell.x+','+cell.z+' 恢复直通（'+reason+'）');
    this.recomputeRoutes();
    if(this.ui) this.ui.onIsolationChanged();
  }

  damageIsolation(cell,dmg){
    const st=this.nodeState(cell);
    if(!st||!st.active) return;
    st.hp-=dmg;
    if(this.world){
      const w=this.map.world(cell.x,cell.z);
      this.world.ringPulse({x:w.x,z:w.z},0xffb85c,1.6,.35,.6);
    }
    if(st.hp<=0){
      if(st.tower){ this.damageTower(st.tower,9999,{node:true}); }
      else this.releaseNode(cell,'设备被冲毁');
    }
  }

  sellTower(id){
    const t=this.towerById(id); if(!t) return false;
    const refund=Math.floor(t.totalCost*.6);
    this.compute+=refund;
    if(t.nodeIsolation) this.releaseNode(t.cell,'撤下设备');
    this.towers=this.towers.filter(x=>x.id!==id);
    if(this.world) this.world.removeTower(id);
    this.selected=null;
    this.audio('sell');
    this.log('撤下 '+DATA.TOWERS[t.type].name+'，返还 '+refund+' 算力');
    if(this.ui) this.ui.onTowerRemoved();
    return true;
  }

  upgradeTower(id,branch=null){
    const t=this.towerById(id); if(!t||t.level>=2) return {ok:false,reason:'已满级'};
    const d=DATA.TOWERS[t.type];
    if(d.branches && !branch) return {ok:false,reason:'需要选择升级分支',needBranch:true};
    if(branch && (!d.branches||!d.branches[branch])) return {ok:false,reason:'无效分支'};
    const cost=d.level2?d.level2.cost:100;
    if(this.compute<cost) return {ok:false,reason:'算力不足'};
    let intelCost=0;
    if(branch) intelCost=d.branches[branch].intel||0;
    if(this.intel<intelCost) return {ok:false,reason:'情报不足'};
    this.compute-=cost; this.intel-=intelCost;
    t.totalCost+=cost;
    t.level=2; t.branch=branch||null;
    const s=this.statsFor(t);
    t.maxHp=s.hp||d.hp; t.hp=t.maxHp;
    if(this.world) this.world.updateTowerVisual(t);
    this.audio('upgrade');
    this.log('升级 '+d.name+' → 2 级'+(branch?'（'+d.branches[branch].name+'）':''));
    if(this.ui) this.ui.onTowerUpgraded(t);
    return {ok:true};
  }

  useSkill(id){
    const t=this.towerById(id); if(!t) return {ok:false};
    if(t.encryptedUntil>this.time) return {ok:false,reason:'该塔已被加密'};
    if(t.skillCd>this.time) return {ok:false,reason:'技能冷却中'};
    const d=DATA.TOWERS[t.type];
    if(!d.skill) return {ok:false,reason:'该塔没有主动技能'};
    const s=this.statsFor(t);
    const w=this.towerCellWorld(t);
    if(t.type==='honeypot'){
      const r=((s.lure||7)+1.5)*this.U;
      let n=0;
      for(const e of this.enemies){ if(!e.flying && dist2(w,e.pos)<=r*r){ e.rootUntil=Math.max(e.rootUntil,this.time+(s.skillDur||3.5)); n++; } }
      this.world.ringPulse({x:w.x,z:w.z},0xffb85c,r,.6,.6);
      this.audio('skill');
      this.log('蜜罐技能「诱捕」命中 '+n+' 个目标');
    } else if(t.type==='repair'){
      let n=0;
      for(const o of this.towers){
        if(o===t) continue;
        const ow=this.towerCellWorld(o);
        if(dist2(w,ow)<=(s.range*this.U)**2){ o.shield=Math.max(o.shield,90); o.encryptedUntil=0; n++; this.world.shieldBurst({x:ow.x,y:this.towerY(o),z:ow.z}); }
      }
      this.world.shieldBurst({x:w.x,y:this.towerY(t),z:w.z},0xb6ffd8);
      this.audio('shield');
      this.log('修复进程「冗余切换」支援 '+n+' 座塔');
    } else if(t.type==='firewall'){
      for(const e of this.enemies){ if(!e.flying && dist2(w,e.pos)<=(5.5*this.U)**2) e.rootUntil=Math.max(e.rootUntil,this.time+2.2); }
      t.hp=Math.min(t.maxHp,t.hp+t.maxHp*.15);
      this.world.ringPulse({x:w.x,z:w.z},0x5ce9ff,5.5*this.U,.5,.6);
      this.audio('skill');
    } else if(t.type==='sandbox'){
      const r=(s.detect||8)*1.6*this.U;
      let n=0;
      for(const e of this.enemies){
        if(dist2(w,e.pos)<=r*r){
          if(e.disguised) e.revealed=true;
          this.damageEnemy(e,60,{source:t});
          n++;
        }
      }
      this.world.ringPulse({x:w.x,z:w.z},0xb58cff,r,.7,.6);
      this.audio('detect');
      this.log('沙箱「深度扫描」显形并打击 '+n+' 个目标');
    } else if(t.type==='netgate'){
      t.hp=Math.min(t.maxHp,t.hp+t.maxHp*.25); t.shield=Math.max(t.shield,80);
      this.world.shieldBurst({x:w.x,y:this.towerY(t),z:w.z},0x9be9ff);
      this.audio('shield');
    } else if(t.type==='interceptor'){
      t.overclockUntil=this.time+4;
      this.audio('skill');
      this.world.ringPulse({x:w.x,z:w.z},0xffd166,3,.4,.6);
    }
    const cd=s.skillCd||24;
    t.skillCd=this.time+cd;
    return {ok:true};
  }

  /* ---------- 道具 ---------- */
  itemCooldown(id){ return (this.itemCds&&this.itemCds[id])||0; }
  useItem(id,target){
    const d=DATA.ITEMS[id];
    if(this.time<this.itemCooldown(id)) return {ok:false,reason:'道具冷却中'};
    if(id==='isolator'){
      if(!target||!target.cell) return {ok:false,reason:'需要选择一个交换节点'};
      const cell=target.cell;
      if(this.map.cell(cell.x,cell.z)!=='n') return {ok:false,reason:'只能隔离交换节点'};
      if(this.intel<d.cost) return {ok:false,reason:'情报不足'};
      const v=this.validateIsolation(cell);
      if(!v.ok) return v;
      this.intel-=d.cost;
      this.itemCds=this.itemCds||{}; this.itemCds[id]=this.time+d.cd;
      this.isolateNode(cell,'item:isolator',{hp:300,maxHp:300,expires:this.time+22,temp:true});
      this.log('投放应急隔离器 @ '+cell.x+','+cell.z);
      return {ok:true};
    }
    if(id==='downgrade'){
      if(!target||!target.cell) return {ok:false,reason:'需要选择一片链路'};
      if(this.intel<d.cost) return {ok:false,reason:'情报不足'};
      const c=target.cell, r=4.5;
      const cells=new Set();
      for(let z=Math.max(0,c.z-5);z<=Math.min(this.map.h-1,c.z+5);z++) for(let x=Math.max(0,c.x-5);x<=Math.min(this.map.w-1,c.x+5);x++){
        if((x-c.x)**2+(z-c.z)**2<=r*r && ['.','n','o'].includes(this.map.cell(x,z))) cells.add(x+','+z);
      }
      this.downgrade.cells=new Set([...this.downgrade.cells,...cells]);
      this.downgrade.expires=this.time+14;
      this.intel-=d.cost;
      this.itemCds=this.itemCds||{}; this.itemCds[id]=this.time+d.cd;
      this.recomputeRoutes();
      const w=this.map.world(c.x,c.z);
      this.world.ringPulse({x:w.x,z:w.z},0xffb85c,4,.7,.6);
      this.world.areaOverlay([...cells].map(k=>{const [x,z]=k.split(',').map(Number); return {x,z};}),0xffb85c,14);
      this.log('协议降级覆盖 '+cells.size+' 格链路');
      return {ok:true};
    }
    if(id==='restore'){
      const t=target&&target.tower?target.tower:this.towerById(target&&target.id);
      if(!t) return {ok:false,reason:'需要选择一座塔'};
      if(this.compute<d.cost) return {ok:false,reason:'算力不足'};
      this.compute-=d.cost;
      t.hp=Math.min(t.maxHp,t.hp+t.maxHp*.55); t.encryptedUntil=0;
      this.itemCds=this.itemCds||{}; this.itemCds[id]=this.time+d.cd;
      const w=this.towerCellWorld(t);
      this.world.ringPulse({x:w.x,z:w.z},0x6cf0a8,2,.6,.6);
      this.world.healBeam({x:w.x,y:this.towerY(t)+2,z:w.z},{x:w.x,y:this.towerY(t)+.5,z:w.z},0x6cf0a8);
      this.log('备份还原 '+DATA.TOWERS[t.type].name);
      return {ok:true};
    }
    return {ok:false};
  }

  /* ---------- 波次 ---------- */
  startWave(){
    if(this.over||this.waveActive) return false;
    if(this.waveIndex>=this.waves.length) return false;
    const w=this.waves[this.waveIndex];
    this.waveGroups=w.groups.map(g=>({entry:g.entry,type:g.type,n:g.n,gap:g.gap||.8,delay:g.delay||0,timer:g.delay||0,spawned:0,done:false}));
    this.waveActive=true;
    this.audio(w.boss?'boss':(w.peak?'alarm':'wave'));
    this.log('第 '+(this.waveIndex+1)+' 波：'+w.label);
    if(this.ui) this.ui.onWaveStart(w);
    return true;
  }

  updateWaves(dt){
    if(!this.waveActive) return;
    let allSpawned=true;
    for(const g of this.waveGroups){
      if(g.spawned<g.n){
        allSpawned=false;
        g.timer-=dt;
        if(g.timer<=0){
          this.spawnEnemy(g.type,g.entry);
          g.spawned++;
          g.timer+=g.gap;
        }
      }
    }
    if(allSpawned && this.enemies.length===0){
      this.waveActive=false;
      const w=this.waves[this.waveIndex];
      const reward=w.intel||6;
      this.intel+=reward; this.stats.intelEarned+=reward;
      const cb=24+this.waveIndex*5;
      this.compute+=cb; this.stats.computeEarned+=cb;
      this.log('第 '+(this.waveIndex+1)+' 波清空，情报 +'+reward+'，算力 +'+cb,'ok');
      this.waveIndex++;
      if(this.waveIndex>=this.waves.length){ this.gameOver(true); }
      else if(this.ui) this.ui.onWaveClear();
    }
  }

  spawnEnemy(type,entryId,opts={}){
    const def=DATA.ENEMIES[type];
    const e=this.map.entryById(entryId);
    const scale=1+this.waveIndex*0.035;
    const en={
      id:'E'+this.nextId++, type, entryId, exit:e.defaultExit,
      hp:Math.round(def.hp*scale), maxHp:Math.round(def.hp*scale),
      shield:0, pos:{x:e.world.x,z:e.world.z}, cell:{x:e.cell[0],z:e.cell[1]},
      path:[], pathIdx:0, flying:!!def.flying, boss:!!def.boss,
      disguised:!!def.disguised, revealed:false, slowUntil:0, rootUntil:0,
      hitFlash:0, attackCd:0, detour:null, blockedBy:null, phase:1, shieldCd:1.5, splitDone:false, noSplit:!!opts.noSplit, dead:false, deathT:0, spawnT:0,
      spawnedAt:this.time, exitId:e.defaultExit, abilityCd:6, addSpawned:false,
      lastPos:{x:e.world.x,z:e.world.z}, angle:0
    };
    if(opts.revealed) en.revealed=true;
    const route=this.routes[entryId];
    if(route) en.exit=route.exitId;
    if(en.flying) this.setFlyingPath(en);
    else {
      if(route){ en.exit=route.exitId; en.exitId=route.exitId; en.path=route.path.map(p=>({x:p[0],z:p[1]})); }
      else { en.path=[]; }
      en.pathIdx=1;
    }
    en.spawnT=0;
    this.enemies.push(en);
    if(this.world) this.world.ringPulse({x:e.world.x,z:e.world.z},def.color||0x5ce9ff,1.3,.35,.6);
    if(!this.seenTypes) this.seenTypes=new Set();
    if(!this.seenTypes.has(type)){
      this.seenTypes.add(type);
      if(this.ui && !def.boss && type!=='worm') this.ui.toast('新威胁：'+def.name+' 进入战场','warn');
    }
    if(this.world) this.world.addEnemy(en);
    if(def.boss){
      this.audio('boss');
      if(this.ui) this.ui.onBossSpawn(en);
    }
    return en;
  }

  /* ---------- 主更新 ---------- */
  update(dt){
    if(this.over||this.paused) return;
    this.time+=dt;
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateItems(dt);
    this.updateIntel(dt);
    this.computeAcc=(this.computeAcc||0)+dt;
    if(this.computeAcc>=5){ this.computeAcc-=5; this.compute+=2; this.stats.computeEarned+=2; }
    for(let i=this.pending.length-1;i>=0;i--){
      if(this.time>=this.pending[i].at){ const fn=this.pending[i].fn; this.pending.splice(i,1); fn(); }
    }
    if(this.demo) this.demo.update(this,dt);
    if(this.core<=0) this.gameOver(false);
  }

  schedule(delay,fn){ this.pending.push({at:this.time+delay,fn}); }

  updateIntel(dt){
    this.intelHoldTimer+=dt;
    if(this.intelHoldTimer<5) return;
    this.intelHoldTimer=0;
    let hold=false;
    for(const [k,st] of this.nodeStates){
      if(!st.active) continue;
      const [cx,cz]=k.split(',').map(Number);
      const w=this.map.world(cx,cz);
      for(const en of this.enemies){
        if(en.dead) continue;
        if(dist2(w,en.pos)<=(5*this.U)**2){ hold=true; break; }
      }
      if(hold) break;
    }
    if(hold){ this.intel+=2; this.stats.intelEarned+=2; }
  }

  updateItems(dt){
    for(const [k,st] of this.nodeStates){
      if(st.active && st.expires>0 && this.time>=st.expires){ this.releaseNode({x:+k.split(',')[0],z:+k.split(',')[1]},'隔离器有效期结束'); }
    }
    if(this.downgrade.expires && this.time>=this.downgrade.expires){ this.downgrade={cells:new Set(),expires:0}; this.recomputeRoutes(); }
    for(const [k,v] of this.lockCells){ if(this.time>=v.expires){ this.lockCells.delete(k); this.recomputeRoutes(); } }
  }

  updateEnemies(dt){
    const blocked=this.blockedNodes(), locked=this.lockedCells();
    for(const en of [...this.enemies]){
      en.spawnT=(en.spawnT||0)+dt;
      if(en.dead){
        en.deathT=(en.deathT||0)+dt;
        if(en.deathT>.55){ this.enemies=this.enemies.filter(x=>x.id!==en.id); if(this.world) this.world.removeEnemy(en.id); }
        continue;
      }
      if(en.hp<=0) continue;
      en.hitFlash=Math.max(0,en.hitFlash-dt);
      en.attackCd=Math.max(0,en.attackCd-dt);
      if(en.disguised && !en.revealed){
        const old=this.map.cell(en.cell.x,en.cell.z)==='o';
        if(old){ en.revealed=true; this.world.detectPulse({x:en.pos.x,z:en.pos.z}); }
      }
      // 检测
      for(const t of this.towers){
        if(t.type==='sandbox' && en.disguised && !en.revealed){
          const w=this.towerCellWorld(t), s=this.statsFor(t);
          if(dist2(w,en.pos)<=(s.detect*this.U)**2){ en.revealed=true; this.world.detectPulse({x:en.pos.x,z:en.pos.z}); }
        }
      }
      if(en.boss) this.updateBoss(en,dt);
      if(en.hp<=0) continue;

      if(en.blockedBy){
        const bt=this.towerById(en.blockedBy);
        if(!bt){ en.blockedBy=null; }
        else {
          this.enemyAttack(en,bt);
          if(en.attackCd<=0) en.attackCd=1/(DATA.ENEMIES[en.type].attackTower?DATA.ENEMIES[en.type].attackTower.rate:1);
          continue;
        }
      }

      if(en.rootUntil>this.time){ continue; }

      // 加壳器护盾光环
      if(en.type==='shielder'){
        en.shieldCd-=dt;
        if(en.shieldCd<=0){
          en.shieldCd=DATA.ENEMIES.shielder.shieldAura.interval;
          const R=DATA.ENEMIES.shielder.shieldAura.range*this.U;
          for(const o of this.enemies){
            if(o.hp>0 && !o.dead && dist2(o.pos,en.pos)<=R*R) o.shield=Math.min(90,o.shield+DATA.ENEMIES.shielder.shieldAura.amount);
          }
          this.world.ringPulse({x:en.pos.x,z:en.pos.z},0x4fc3ff,R,.5,.6);
        }
      }

      // 勒索者边移动边远程攻击
      if(en.type==='ransom' && !en.blockedBy && en.attackCd<=0){
        const rt=this.findRangedTarget(en);
        if(rt) this.enemyAttack(en,rt);
      }

      // 洪泛团改道攻击隔离节点
      if(en.type==='flood' && !en.detour){
        const target=this.findFloodTarget(en);
        if(target){ en.detour={node:target.node,towerId:target.towerId,until:this.time+14}; en.path=this.pathToAdjacent(en,target.node).map(c=>({x:c[0],z:c[1]})); en.pathIdx=1; en.cell=this.nearestWalkable(en); }
      }
      if(en.detour){
        if(this.time>en.detour.until || !this.activeNode(en.detour.node)){ en.detour=null; this.rerouteEnemies(); }
        else {
          const tw=this.towerById(en.detour.towerId);
          if(!tw){
            const nw=this.map.world(en.detour.node.x,en.detour.node.z);
            if(dist2(nw,en.pos)<=(this.map.tile*1.8)**2){
              if(en.attackCd<=0){
                this.damageIsolation(en.detour.node,48);
                this.world.ringPulse({x:nw.x,z:nw.z},0xff8a5c,2.4,.4,.6);
                this.audio('hit');
                en.attackCd=1/1.35;
              }
              continue;
            }
          } else {
            const w=this.towerCellWorld(tw);
            if(dist2(w,en.pos)<=(this.map.tile*1.6)**2){ this.enemyAttack(en,tw); continue; }
          }
        }
      }

      if(en.path.length===0){ this.rerouteEnemies(); if(en.path.length===0){ this.leakEnemy(en); continue; } }
      const target=en.path[en.pathIdx];
      if(!target){ this.leakEnemy(en); continue; }
      const tw=this.map.world(target.x,target.z);
      let dx=tw.x-en.pos.x, dz=tw.z-en.pos.z;
      let d=Math.hypot(dx,dz);
      if(d<0.001){ en.cell={x:target.x,z:target.z}; en.pathIdx++; continue; }
      en.angle=Math.atan2(dx,dz);
      // 阻挡
      if(!en.flying){
        const bt=this.towerAt(target);
        if(bt && !bt.nodeIsolation && (DATA.TOWERS[bt.type].block||0)>0){
          const st=this.statsFor(bt);
          const used=this.blockUsed(bt);
          if(used+(DATA.ENEMIES[en.type].blockUse||1)<=st.block){
            bt.blocked.add(en.id);
            en.blockedBy=bt.id;
            this.world.ringPulse({x:en.pos.x,z:en.pos.z},0xffb85c,1.3,.35,.8);
            if(en.disguised){ en.revealed=true; this.world.detectPulse({x:en.pos.x,z:en.pos.z}); }
            this.enemyAttack(en,bt);
            if(en.attackCd<=0) en.attackCd=1/(DATA.ENEMIES[en.type].attackTower?DATA.ENEMIES[en.type].attackTower.rate:1);
            continue;
          }
        }
      }
      let speed=DATA.ENEMIES[en.type].speed*this.U;
      if(en.slowUntil>this.time) speed*=.55;
      if(en.type==='trojan' && !en.revealed) speed*=1.05;
      const cur=this.map.cell(en.cell.x,en.cell.z), nxt=this.map.cell(target.x,target.z);
      const dg=this.downgrade.expires>this.time?this.downgrade.cells:null;
      const curOld=cur==='o'||(dg&&dg.has(en.cell.x+','+en.cell.z));
      const nxtOld=nxt==='o'||(dg&&dg.has(target.x+','+target.z));
      if(curOld||nxtOld) speed*=.62;
      if(en.disguised && !en.revealed && (curOld||nxtOld)){ en.revealed=true; this.world.detectPulse({x:en.pos.x,z:en.pos.z}); }
      if(en.boss) speed*=.95;
      const step=speed*dt;
      if(d<=step){
        en.pos.x=tw.x; en.pos.z=tw.z; en.cell={x:target.x,z:target.z}; en.pathIdx++;
        if(!en.flying && en.type==='worm' && !en.noSplit && !en.splitDone && this.map.cell(target.x,target.z)==='n'){
          en.splitDone=true;
          const copy=this.spawnEnemy('worm',en.entryId,{revealed:true,noSplit:true});
          if(copy){
            copy.pos={x:en.pos.x,z:en.pos.z}; copy.cell={x:target.x,z:target.z};
            copy.path=en.path.map(p=>({x:p.x,z:p.z})); copy.pathIdx=en.pathIdx;
            this.world.ringPulse({x:en.pos.x,z:en.pos.z},0x9dff5c,2.0,.45,.6);
            this.log('蠕虫在交换节点复制出同伴','bad');
          }
        }
        if(en.pathIdx>=en.path.length) this.leakEnemy(en);
      } else {
        en.pos.x+=dx/d*step; en.pos.z+=dz/d*step;
      }
    }
    // 清理阻挡关系
    for(const t of this.towers){
      if(t.blocked.size){
        for(const id of [...t.blocked]){ const e=this.enemyById(id); if(!e || e.dead) t.blocked.delete(id); }
      }
    }
  }

  findRangedTarget(en){
    const at=DATA.ENEMIES[en.type].attackTower;
    const range=(at&&at.range?at.range:6.5)*this.U;
    let best=null;
    for(const t of this.towers){
      const w=this.towerCellWorld(t);
      const d=dist2(w,en.pos);
      if(d<=range*range){
        if(at&&at.preferHoneypot && t.type==='honeypot') return t;
        if(!best||d<best.d) best={t,d};
      }
    }
    return best?best.t:null;
  }

  findFloodTarget(en){
    let best=null;
    for(const [k,st] of this.nodeStates){
      if(!st.active) continue;
      const [x,z]=k.split(',').map(Number);
      const w=this.map.world(x,z);
      if(dist2(w,en.pos)<=(6.5*this.U)**2){
        if(!best || dist2(w,en.pos)<best.d) best={node:{x,z},towerId:st.tower?st.tower.id:null,d:dist2(w,en.pos)};
      }
    }
    return best;
  }

  pathToAdjacent(en,node){
    const blocked=this.blockedNodes(), locked=this.lockedCells();
    const cands=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>({x:node.x+dx,z:node.z+dz})).filter(c=>this.map.walkable(c.x,c.z));
    let best=null;
    const from=this.nearestWalkable(en);
    for(const c of cands){
      const p=MAPS.findPath(this.map,[from.x,from.z],[c.x,c.z],{blockedNodes:blocked,lockedCells:locked});
      if(p && (!best||p.length<best.length)) best=p;
    }
    return best||[{x:from.x,z:from.z},{x:node.x,z:node.z}];
  }

  enemyAttack(en,tw){
    const def=DATA.ENEMIES[en.type];
    const at=def.attackTower; if(!at) return;
    if(en.attackCd>0) return;
    // 目标选择：蜜罐优先
    let target=tw;
    if(at.preferHoneypot || en.type==='flood'){
      let best=null;
      for(const o of this.towers){
        if(o.type!=='honeypot') continue;
        const w=this.towerCellWorld(o);
        const r=(this.statsFor(o).lure||7)*this.U;
        if(dist2(w,en.pos)<=r*r && (!best||dist2(w,en.pos)<best.d)) best={t:o,d:dist2(w,en.pos)};
      }
      if(best) target=best.t;
    }
    if(at.type==='ranged'){
      this.world.beam({x:en.pos.x,y:this.enemyY(en)+1,z:en.pos.z},{x:this.towerCellWorld(target).x,y:this.towerY(target)+1.2,z:this.towerCellWorld(target).z},0xff5d72,.06,.18);
      this.damageTower(target,at.dmg,{source:en});
      if(at.encrypt && target.type!=='honeypot'){ target.encryptedUntil=Math.max(target.encryptedUntil,this.time+at.encrypt); this.world.encryptBurst({x:this.towerCellWorld(target).x,y:this.towerY(target),z:this.towerCellWorld(target).z}); }
      this.audio('hit');
    } else {
      this.world.beam({x:en.pos.x,y:this.enemyY(en)+.8,z:en.pos.z},{x:this.towerCellWorld(target).x,y:this.towerY(target)+1,z:this.towerCellWorld(target).z},0xff8a5c,.05,.14);
      this.damageTower(target,at.dmg,{source:en});
      this.audio('hit');
    }
    en.attackCd=1/(at.rate||1);
    if(en.disguised) en.revealed=true;
  }

  damageTower(t,dmg,opts={}){
    if(!t||t.hp<=0) return;
    const st=this.statsFor(t);
    if(st.reflect && opts.source && opts.source.hp>0){ this.damageEnemy(opts.source,dmg*st.reflect,{noReflect:true}); }
    if(t.shield>0){ const a=Math.min(t.shield,dmg); t.shield-=a; dmg-=a; }
    t.hp-=dmg; t.hitFlash=.12;
    if(this.world){
      const w=this.towerCellWorld(t);
      this.world.ringPulse({x:w.x,z:w.z},0xff5d72,1.1,.28,this.towerY(t)+.5);
    }
    if(t.hp<=0) this.destroyTower(t);
  }

  destroyTower(t){
    if(!t) return;
    const w=this.towerCellWorld(t);
    if(t.nodeIsolation) this.releaseNode(t.cell,'节点设备被摧毁');
    this.towers=this.towers.filter(x=>x.id!==t.id);
    if(this.world){ this.world.explosion({x:w.x,y:this.towerY(t)+.6,z:w.z},0xff8a5c,1.2); this.world.wreckTower(t.id); }
    this.audio('explode');
    this.stats.lost++;
    this.log('设备损毁：'+DATA.TOWERS[t.type].name,'bad');
    if(this.selected===t.id){ this.selected=null; if(this.ui) this.ui.onSelectionCleared(); }
  }

  damageEnemy(e,dmg,opts={}){
    if(!e||e.hp<=0||e.dead) return;
    if(e.shield>0){ const a=Math.min(e.shield,dmg); e.shield-=a; dmg-=a; }
    if(e.boss){
      const def=DATA.ENEMIES[e.type];
      const armor=e.armor!=null?e.armor:(def.armor||0);
      dmg*=(1-armor);
    }
    e.hp-=dmg; e.hitFlash=.1;
    if(this.world && Math.random()<.5){ this.world.burst({x:e.pos.x,y:this.enemyY(e)+.6,z:e.pos.z},0xffd166,3,.4); }
    if(e.hp<=0) this.killEnemy(e);
  }

  killEnemy(e){
    if(!e||e.dead || e.hp<=-9999) return;
    e.dead=true; e.deathT=0; e.hp=-9999; e.blockedBy=null;
    const def=DATA.ENEMIES[e.type];
    this.stats.kills++;
    this.compute+=def.bounty; this.stats.computeEarned+=def.bounty;
    if(e.boss){ this.intel+=18; this.stats.intelEarned+=18; }
    if(['trojan','ransom','flood','shielder'].includes(e.type)){ this.intel+=1; this.stats.intelEarned+=1; }
    if(e.type==='trojan' && e.disguised && !e.revealed){
      for(const t of [...this.towers]){
        const w=this.towerCellWorld(t);
        if(dist2(w,e.pos)<=def.payload.radius**2){ this.damageTower(t,def.payload.dmg,{source:e}); }
      }
      this.world.explosion({x:e.pos.x,y:.6,z:e.pos.z},0xb58cff,1.4);
    } else {
      this.world.explosion({x:e.pos.x,y:this.enemyY(e)+.5,z:e.pos.z},def.color||0xff8a5c,e.boss?2:0.7);
    }
    this.audio(e.boss?'explode':'hit');
    if(e.boss){ this.log('Boss '+def.name+' 被击退','ok'); if(this.ui) this.ui.onBossKilled(e); }
  }

  leakEnemy(en){
    if(!en) return;
    const def=DATA.ENEMIES[en.type];
    const dmg=en.boss?(def.coreDamage||30):4;
    this.core=Math.max(0,this.core-dmg);
    this.stats.leaks++;
    if(this.ui) this.ui.damageFlash();
    if(this.world){
      const ex=this.map.exitById(en.exit);
      this.world.ringPulse({x:ex.world.x,z:ex.world.z},0xff5d72,4,.6,1.2);
      this.world.explosion({x:en.pos.x,y:1,z:en.pos.z},0xff5d72,1.3);
    }
    this.audio('leak');
    this.enemies=this.enemies.filter(x=>x.id!==en.id);
    if(this.world) this.world.removeEnemy(en.id);
    this.log('敌人突破至 '+this.map.exitById(en.exit).name+'，中枢完整度 -'+dmg,'bad');
    if(this.core<=0) this.gameOver(false);
  }

  /* ---------- 塔攻击 ---------- */
  updateTowers(dt){
    for(const t of this.towers){
      if(t.hp<=0) continue;
      const s=this.statsFor(t);
      if(s.regen && t.hp<t.maxHp) t.hp=Math.min(t.maxHp,t.hp+s.regen*dt);
      if(t.encryptedUntil>this.time) continue;
      if(t.type==='repair'){
        t.healCd-=dt;
        if(t.healCd<=0){
          t.healCd=1;
          const w=this.towerCellWorld(t);
          let healed=false;
          for(const o of this.towers){
            if(o===t) continue;
            const ow=this.towerCellWorld(o);
            if(dist2(w,ow)<=(s.range*this.U)**2 && o.hp<o.maxHp){
              o.hp=Math.min(o.maxHp,o.hp+(s.heal||20)); healed=true;
              this.world.healBeam({x:w.x,y:this.towerY(t)+2.2,z:w.z},{x:ow.x,y:this.towerY(o)+1.2,z:ow.z},0x6cf0a8);
            }
          }
          if(healed) this.audio('heal');
        }
        continue;
      }
      if(t.type==='honeypot'||t.type==='netgate') continue;
      t.cd-=dt;
      if(t.cd>0) continue;
      const targets=this.findTargets(t,s);
      if(!targets.length) continue;
      const target=targets[0];
      const w=this.towerCellWorld(t);
      const tp={x:target.pos.x,y:this.enemyY(target)+.8,z:target.pos.z};
      if(t.type==='firewall'){
        this.world.beam({x:w.x,y:this.towerY(t)+.9,z:w.z},tp,0x5ce9ff,.07,.14);
        this.world.muzzleFlash(t,0x5ce9ff);
        this.damageEnemy(target,s.dmg,{source:t});
        t.cd=1/(s.rate||1.1);
        if(t.model && t.model.userData.parts && t.model.userData.parts.barrels){ const b=t.model.userData.parts.barrels[0]; b.userData.recoil=.2; b.userData.baseZ=b.position.z; }
      } else if(t.type==='interceptor'){
        const rate=s.rate*(t.overclockUntil>this.time?2:1);
        t.cd=1/rate;
        if(s.pierce){
          const dir=new THREE.Vector2(Math.sin(t.facing),Math.cos(t.facing));
          const end={x:w.x+dir.x*(s.range||11)*this.U,z:w.z+dir.y*(s.range||11)*this.U};
          this.world.beam({x:w.x,y:this.towerY(t)+1.6,z:w.z},{x:end.x,y:1.2,z:end.z},0xffd166,.16,.22);
          let hits=0;
          for(const e of [...this.enemies]){
            if(hits>=3) break;
            const ex=e.pos.x-w.x, ez=e.pos.z-w.z;
            const along=ex*dir.x+ez*dir.y;
            const perp=Math.abs(ex*dir.y-ez*dir.x);
            if(along>0 && along<(s.range||11)*this.U && perp<1.1*this.U){ this.damageEnemy(e,s.dmg,{source:t}); hits++; }
          }
          this.audio('shootHeavy');
        } else {
          this.projectiles.push({from:{x:w.x,y:this.towerY(t)+1.6,z:w.z},to:tp,targetId:target.id,speed:45,dmg:s.dmg,type:'interceptor',color:0xffd166,slow:s.slow,slowDur:s.slowDur,source:t});
          t.recoil=.16; this.world.muzzleFlash(t,0xffd166);
          this.audio('shoot');
        }
      } else if(t.type==='sandbox'){
        t.cd=1/(s.rate||1.3);
        const cx=target.pos.x, cz=target.pos.z;
        for(const e of [...this.enemies]){
          if(e.flying) continue;
          if((e.pos.x-cx)**2+(e.pos.z-cz)**2<=((s.aoe||2.4)*this.U)**2){
            if(e.disguised) e.revealed=true;
            this.damageEnemy(e,s.dmg,{source:t});
          }
        }
        this.world.ringPulse({x:cx,z:cz},0xb58cff,(s.aoe||2.4)*this.U,.4,.5);
        this.world.beam({x:w.x,y:this.towerY(t)+1.8,z:w.z},{x:cx,y:.6,z:cz},0xb58cff,.08,.2);
        this.world.muzzleFlash(t,0xb58cff);
        this.audio('shoot');
      }
    }
  }

  findTargets(t,s){
    const w=this.towerCellWorld(t);
    const out=[];
    for(const e of this.enemies){
      if(e.hp<=0) continue;
      const d2=(e.pos.x-w.x)**2+(e.pos.z-w.z)**2;
      if(d2>((s.range||0)*this.U)**2) continue;
      if(e.flying && !DATA.TOWERS[t.type].air) continue;
      if(e.disguised && !e.revealed && t.type==='interceptor') continue;
      if(e.cloaked && t.type==='interceptor') continue;
      if(DATA.TOWERS[t.type].directional){
        const ang=Math.atan2(e.pos.x-w.x,e.pos.z-w.z);
        let diff=Math.abs(((ang-t.facing+Math.PI*3)%(Math.PI*2))-Math.PI);
        if(diff>(s.arc||110)*Math.PI/360) continue;
      }
      out.push(e);
    }
    out.sort((a,b)=>this.remaining(a)-this.remaining(b));
    return out;
  }

  remaining(en){
    let d=0;
    if(en.path && en.path.length && en.pathIdx<en.path.length){
      const first=en.path[en.pathIdx], fw=this.map.world(first.x,first.z);
      d=Math.hypot(fw.x-en.pos.x,fw.z-en.pos.z);
      for(let i=en.pathIdx+1;i<en.path.length;i++){
        const a=this.map.world(en.path[i-1].x,en.path[i-1].z);
        const b=this.map.world(en.path[i].x,en.path[i].z);
        d+=Math.hypot(b.x-a.x,b.z-a.z);
      }
    }
    return d;
  }

  updateProjectiles(dt){
    for(let i=this.projectiles.length-1;i>=0;i--){
      const p=this.projectiles[i];
      const target=this.enemyById(p.targetId);
      if(!target){ this.projectiles.splice(i,1); continue; }
      const to={x:target.pos.x,y:this.enemyY(target)+.8,z:target.pos.z};
      p.to=to;
      const dx=to.x-p.from.x, dy=to.y-p.from.y, dz=to.z-p.from.z;
      const d=Math.hypot(dx,dy,dz);
      const step=p.speed*dt;
      if(d<=step+0.15){
        this.damageEnemy(target,p.dmg,{source:p.source});
        if(p.slow && target.hp>0) target.slowUntil=this.time+p.slowDur;
        if(this.world) this.world.explosion({x:to.x,y:to.y,z:to.z},p.color,.35);
        this.projectiles.splice(i,1);
      } else {
        p.from.x+=dx/d*step; p.from.y+=dy/d*step; p.from.z+=dz/d*step;
      }
    }
  }

  /* ---------- Boss ---------- */
  updateBoss(en,dt){
    const def=DATA.ENEMIES[en.type];
    const hpRatio=en.hp/en.maxHp;
    if(en.type==='boss_wankui'){
      if(hpRatio<=.6 && !en.addSpawned){
        en.addSpawned=true;
        const wm=this.world&&this.world.enemyMeshes.get(en.id); if(wm) wm.model.scale.setScalar(1.12);
        for(let i=0;i<5;i++) this.spawnEnemy('worm',en.entryId,{revealed:true});
        this.audio('alarm'); this.log('万傀释放成群蠕虫','bad'); if(this.ui) this.ui.toast('万傀 · 洪峰释放：成群蠕虫','warn');
        if(this.world) this.world.ringPulse({x:en.pos.x,z:en.pos.z},0xff5d72,6,.8,.6);
      }
      en.abilityCd-=dt;
      if(en.abilityCd<=0){
        en.abilityCd=9;
        let best=null;
for(const [k,st] of this.nodeStates){
      if(!st.active || st.temp) continue;
          const [x,z]=k.split(',').map(Number), w=this.map.world(x,z);
          const d=dist2(w,en.pos);
          if(d<(14*this.U)**2 && (!best||d<best.d)) best={cell:{x,z},st,d};
        }
        if(best){
          if(best.st.tower){ this.damageTower(best.st.tower,90,{source:en}); }
          else this.damageIsolation(best.cell,90);
          this.world.ringPulse({x:best.cell.x?this.map.world(best.cell.x,best.cell.z).x:en.pos.x,z:best.cell.z?this.map.world(best.cell.x,best.cell.z).z:en.pos.z},0xff5d72,4,.6,.6);
          this.log('万傀「洪峰」冲击隔离节点','bad');
        }
      }
    }
    if(en.type==='boss_shenlou'){
      const phase=hpRatio<=.3?3:hpRatio<=.62?2:1;
      if(phase!==en.phase){ en.phase=phase; const mm=this.world&&this.world.enemyMeshes.get(en.id); if(mm){ const parts=mm.model.userData.parts||{}; if(parts.core) parts.core.material.emissiveIntensity=1.4+phase*.35; } this.audio('alarm'); this.log('蜃楼进入「'+['','路由欺骗','路由风暴','全域误导'][phase]+'」阶段','bad'); if(this.ui) this.ui.toast('蜃楼 · '+['','路由欺骗','路由风暴','全域误导'][phase],'warn'); }
      en.abilityCd-=dt;
      if(en.abilityCd<=0){
        en.abilityCd=phase===3?7:phase===2?9:11;
        this.shenlouBlackhole(en,phase===3?2:1);
        if(phase>=2){
          for(const t of this.towers){
            const w=this.towerCellWorld(t);
            if(dist2(w,en.pos)<=(10*this.U)**2) t.shield=0;
          }
          if(this.world) this.world.ringPulse({x:en.pos.x,z:en.pos.z},0xb58cff,9,.6,.6);
        }
      }
    }
    if(en.type==='boss_zheying'){
      const phase=en.forcedPhase||(hpRatio<=.35?3:hpRatio<=.7?2:1);
      if(phase!==en.phase){
        en.phase=phase;
        const mm=this.world&&this.world.enemyMeshes.get(en.id);
        if(mm){ if(phase===2) mm.model.scale.setScalar(1.08); if(phase===3) mm.model.scale.setScalar(1.16); const parts=mm.model.userData.parts||{}; if(parts.core&&parts.core.material) parts.core.material.emissiveIntensity=1.6+phase*.4; }
        if(phase===2){
          en.armor=.45;
          const parts=this.world && this.world.enemyMeshes.get(en.id)? this.world.enemyMeshes.get(en.id).model.userData.parts:null;
          if(parts && parts.armor) for(const o of parts.armor) o.visible=true;
          for(let i=0;i<3;i++) this.spawnEnemy('trojan',en.entryId,{revealed:true});
          this.audio('alarm'); this.log('蛰影进入「提权」阶段，释放木马','bad'); if(this.ui) this.ui.toast('蛰影 · 提权：护甲强化，释放木马','warn');
        }
        if(phase===3){
          this.audio('alarm'); this.log('蛰影进入「破坏」阶段，锁死前方运维环','bad'); if(this.ui) this.ui.toast('蛰影 · 破坏：锁死运维环','warn');
          this.zheyingLock(en);
        }
      }
      // 潜伏检测
      if(en.phase===1){
        let detected=false;
        for(const t of this.towers){
          const s=this.statsFor(t);
          const w=this.towerCellWorld(t);
          if((t.type==='sandbox' && dist2(w,en.pos)<=(s.detect*this.U)**2) || dist2(w,en.pos)<=(3.2*this.U)**2){ detected=true; break; }
        }
        en.cloaked=!detected;
      } else en.cloaked=false;
    }
  }

  shenlouBlackhole(en,count){
    const blocked=this.blockedNodes(), locked=this.lockedCells();
    const route=this.routes[en.entryId];
    if(!route) return;
    const cands=[];
    for(const c of route.path){
      const node=this.map.nodes.find(n=>n.x===c[0]&&n.z===c[1]);
      if(node && !blocked.has(node.x+','+node.z)) cands.push(node);
    }
    cands.sort((a,b)=>{
      const da=(a.x-en.cell.x)**2+(a.z-en.cell.z)**2;
      const db=(b.x-en.cell.x)**2+(b.z-en.cell.z)**2;
      return da-db;
    });
    let made=0;
    for(const node of cands){
      if(made>=count) break;
      const cell={x:node.x,z:node.z};
      const v=this.validateIsolation(cell,{force:true});
      if(!v.ok) continue;
      const w=this.map.world(cell.x,cell.z);
      this.world.warning(cell,2.5,0xff5d72);
      this.schedule(2.5,()=>{ if(this.over) return; this.lockCells.set(this.key(cell),{expires:this.time+8,source:'shenlou'}); this.recomputeRoutes(); });
      this.log('蜃楼预警：路由黑洞将封锁 '+cell.x+','+cell.z,'bad');
      made++;
    }
  }

  zheyingLock(en){
    const route=this.routes[en.entryId];
    if(!route) return;
    const cands=[];
    for(const c of route.path){
      const node=this.map.nodes.find(n=>n.x===c[0]&&n.z===c[1]);
      if(node) cands.push(node);
    }
    cands.sort((a,b)=>((a.x-en.cell.x)**2+(a.z-en.cell.z)**2)-((b.x-en.cell.x)**2+(b.z-en.cell.z)**2));
    for(const node of cands.slice(0,4)){
      const cells=[{x:node.x,z:node.z}];
      const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
      for(const [dx,dz] of dirs){
        const c={x:node.x+dx,z:node.z+dz};
        if(this.map.walkable(c.x,c.z) && this.map.cell(c.x,c.z)!=='n') cells.push(c);
      }
      const blocked=new Set([...this.blockedNodes(),...cells.map(c=>this.key(c))]);
      const locked=new Set(this.lockedCells());
      let ok=true;
      for(const e of this.map.entries){ let any=false; for(const x of this.map.exits){ if(MAPS.findPath(this.map,e.cell,x.cell,{blockedNodes:blocked,lockedCells:locked})){any=true;break;} } if(!any){ok=false;break;} }
      if(ok){
        for(const en of this.enemies){
          if(en.flying) continue;
          const from=this.nearestWalkable(en);
          let any=false;
          for(const x of this.map.exits){ if(MAPS.findPath(this.map,[from.x,from.z],x.cell,{blockedNodes:blocked,lockedCells:locked})){any=true;break;} }
          if(!any){ ok=false; break; }
        }
      }
      if(!ok) continue;
      for(const c of cells){ const w=this.map.world(c.x,c.z); this.world.warning(c,3.0,0xff5d72); }
      this.schedule(3.0,()=>{ if(this.over) return; for(const c of cells) this.lockCells.set(this.key(c),{expires:this.time+10,source:'zheying'}); this.recomputeRoutes(); });
      this.log('蛰影锁死运维环 '+cells.length+' 格，路线即将收敛','bad');
      return;
    }
  }

  /* ---------- 胜负 ---------- */
  gameOver(win){
    if(this.over) return;
    this.over=true; this.won=win;
    this.audio(win?'win':'lose');
    this.log(win?'全部波次击退，汐域恢复连通':'中枢完整度归零，防御终止',win?'ok':'bad');
    if(this.ui) this.ui.onGameOver(win,this);
  }

  /* ---------- 选择 / 放置 ---------- */
  select(kind,id){
    this.selected=kind==='tower'?id:null;
    if(this.world) this.world.selectTower(this.selected);
    if(this.ui) this.ui.onSelect(kind,id);
  }

  beginPlacement(type){
    this.placement={type,facing:0,cell:null,valid:false};
    if(this.ui) this.ui.onPlacementStart(type);
  }
  updatePlacement(cell,facing){
    if(!this.placement) return;
    this.placement.cell=cell;
    if(facing!=null) this.placement.facing=facing;
    const chk=this.canPlace(this.placement.type,cell);
    this.placement.valid=chk.ok;
    if(this.world && cell){
      const s=this.statsFor({type:this.placement.type,level:1,branch:null});
      const previewRange=this.placement.type==='honeypot'?(s.lure||s.range||0):(s.range||0);
      this.world.showPlacementPreview(this.placement.type,cell,facing,chk.ok,previewRange*this.U);
      const preview=chk.ok && this.map.cell(cell.x,cell.z)==='n'?this.previewListFor(cell):[];
      this.previewList=preview;
      this.world.updateRoutes(this.routeList(),preview);
    }
  }
  confirmPlacement(){
    if(!this.placement||!this.placement.cell) return {ok:false};
    const p=this.placement;
    const res=this.placeTower(p.type,p.cell,p.facing);
    this.cancelPlacement();
    return res;
  }
  cancelPlacement(){
    this.placement=null; this.previewList=[];
    if(this.world){ this.world.clearPlacement(); this.world.clearRange(); this.world.updateRoutes(this.routeList(),[]); }
    if(this.ui) this.ui.onPlacementEnd();
  }

  beginItem(id){
    this.itemTargeting=id;
    if(this.ui) this.ui.onItemStart(id);
  }
  cancelItem(){ this.itemTargeting=null; if(this.ui) this.ui.onItemEnd(); }

  /* ---------- 演示辅助 ---------- */
  demoAddTowers(list){
    for(const x of list){
      const r=this.placeTower(x.type,x.cell,x.facing||0,{ignoreCost:true});
      if(r.ok && x.level===2){ this.upgradeTower(r.tower.id,x.branch); }
      if(r.ok && x.encrypted) r.tower.encryptedUntil=this.time+x.encrypted;
    }
  }
  demoSelectTower(t){
    this.select('tower',t.id);
  }
  demoSkill(t){ return this.useSkill(t.id); }
  demoPlace(type,cell,facing=0){ return this.placeTower(type,cell,facing,{ignoreCost:true}); }

  /* ---------- 音频 ---------- */
  audio(name){ if(this.world && this.world.audio) this.world.audio(name); else if(window.AudioSys) AudioSys.sfx(name); }
}

function dist2(a,b){ const dx=a.x-b.x, dz=a.z-b.z; return dx*dx+dz*dz; }

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}