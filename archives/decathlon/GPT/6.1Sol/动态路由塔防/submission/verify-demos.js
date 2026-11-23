async () => {
  const check=(value,message)=>{if(!value)throw new Error(message);};
  const pose=()=>[...View.target.toArray(),View.distance,View.yaw,View.pitch];
  const state=()=>JSON.stringify({time:Game.state.time,pose:pose(),cursor:DemoMotion.point,kills:Game.state.kills,enemies:Game.state.enemies.map(e=>[e.id,e.hp,e.x,e.z]),towers:Game.state.towers.map(t=>[t.id,t.hp,t.shield,t.encrypted]),caption:document.getElementById('demoCaption').textContent});
  check(Demo.defs.reduce((total,d)=>total+d.duration,0)<=60,'combined normal-speed duration exceeds 60 seconds');
  const results=[],damageTower=Game.damageTower;let naturalDamage=0;
  Game.damageTower=function(t,amount,...rest){const hp=t.hp+t.shield;const result=damageTower.call(this,t,amount,...rest);if(amount<1000)naturalDamage+=Math.max(0,hp-Math.max(0,t.hp)-t.shield);return result;};
  try{
    for(const [index,id] of videoExport.runs.entries()){
      naturalDamage=0;
      const {frames}=await videoExport.begin(id,{fps:30});
      check(frames===Demo.defs[index].duration*30,'frame count includes an unexpected tail');
      await videoExport.frame(0);
      check(Game.state.time===0&&Demo.time===0,'frame zero must be the starting instant');
      check(View.distance===27.2,'demo must open with the full-map view');
      const initial=state();await new Promise(resolve=>setTimeout(resolve,80));
      check(state()===initial,'realtime loop advanced an export session');
      const raf=window.requestAnimationFrame;let waits=0;
      window.requestAnimationFrame=(...args)=>{waits++;return raf.apply(window,args);};
      try{await videoExport.frame(1);}finally{window.requestAnimationFrame=raf;}
      check(waits===0,'frame() must render without waiting for requestAnimationFrame');
      if(index===0){
        await videoExport.frame(72);const a={...DemoMotion.point};
        await videoExport.frame(81);const b=DemoMotion.point;
        check(Math.hypot(a.x-b.x,a.y-b.y)>20&&DemoMotion.drag==='gate','gate drag must be visibly continuous');
        await videoExport.frame(120);
        check(UI.pending?.check.valid,'gate route preview missing');
        check(document.getElementById('routePreview').innerText.includes('路径改变'),'route comparison missing');
        await videoExport.frame(151);
        check(UI.pending&&DemoMotion.target.selector==='#confirmBtn','cursor must arrive at the confirm button before deployment');
        await videoExport.frame(159);
        check(!UI.pending&&Game.state.network.blocked.has('-7,0'),'confirmation must apply the isolation');
        check(DemoMotion.point.x>100&&DemoMotion.point.y>100,'cursor jumped away when the confirmation panel closed');
      }
      if(index===1){
        await videoExport.frame(225);
        check(UI.pending?.check.valid&&UI.pending.build.type==='downgrade','downgrade preview missing');
        check(Game.state.zones.length===0,'downgrade applied before visible confirmation');
        await videoExport.frame(267);
        check(Game.state.zones.length===1&&!Game.state.network.blocked.has('5,0'),'bypass and downgrade must both be active');
        check(Game.state.network.routes[1].at(-1).id==='Y','C must return to data center Y');
      }
      if(index===2){
        await videoExport.frame(201);
        check(Game.state.network.blocked.has('5,0')&&Game.state.network.blocked.has('5,1'),'boss must lock a continuous two-cell segment');
        check(Game.state.network.routes[1].at(-1).id==='X','B must reroute to X');
        await videoExport.frame(264);
        check(Game.state.towers.some(t=>t.encrypted>0),'skill must have a visible encryption problem to solve');
        check(DemoMotion.target.selector?.includes('inspector-actions'),'cursor must arrive at the skill button');
        await videoExport.frame(270);const repair=Game.state.towers.find(t=>t.type==='repair');
        check(repair.skillCd>0,'repair skill was not released');
        check(Game.state.towers.filter(t=>Math.hypot(t.cell.x-repair.cell.x,t.cell.z-repair.cell.z)<=repair.range).every(t=>t.encrypted<=0&&t.shield>0),'redundancy must shield and purge nearby towers');
      }
      await videoExport.frame(300);
      check(Math.abs(Game.state.time-10)<1e-8,'export time must equal i/fps');
      const replay=state();await videoExport.frame(300);
      check(state()===replay,'repeated frame advanced the battle or camera');
      check(View.distance<23,'camera must focus on combat after the opening');
      await videoExport.frame(frames-1);const s=Game.state;
      check(s.kills>=2,'defenders need visible kills');
      check(naturalDamage>150,'attackers need actual damage beyond the scripted gate collapse');
      check(s.enemies.length>0&&s.towers.length>0&&s.health>0,'neither side should be completely defeated');
      check(s.network.routes.every(Boolean),'all sources must remain connected');
      check(!document.getElementById('demoCaption').textContent.includes('?'),'caption encoding is corrupt');
      results.push({id,seconds:frames/30,kills:s.kills,leaks:s.leaks,enemySurvivors:s.enemies.length,towerSurvivors:s.towers.length,naturalDamage:Math.round(naturalDamage)});
    }
    videoExport.end();check(View.distance===27.2,'normal camera was not restored');UI.home(0);
    return {totalSeconds:results.reduce((sum,r)=>sum+r.seconds,0),runs:results};
  }finally{Game.damageTower=damageTower;}
}
