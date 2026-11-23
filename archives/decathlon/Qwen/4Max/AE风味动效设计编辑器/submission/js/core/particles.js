/* 铸帧 ForgeFrame · 确定性粒子模拟
   固定步长从 0 推进，快照缓存；任意时刻取样为纯函数，不重复推进。 */
"use strict";
(function(){
const FF=window.FF, V=FF.V, M4=FF.M4, Eval=FF.Eval, Geo=FF.Geo,
  clamp=FF.util.clamp, lerp=FF.util.lerp, rng=FF.rng;

const DT=1/60, SUB=2, SNAP_EVERY=30, MAX_P=4200, TRAIL_N=14;
const caches=new Map(); // layerId -> {sig, snaps:Map, builtTo}
const gridCache=new Map(); // layerId:timeBucket -> {mesh,grid,prev}
let globalSig=0;
FF.Particles={invalidate:()=>{caches.clear(); gridCache.clear(); globalSig++;}};

function colliderMesh(ctx,layer,t){
  const bucket=Math.round(t*30)/30;
  const key=layer.id+':'+bucket.toFixed(3)+':'+globalSig;
  if(gridCache.has(key)) return gridCache.get(key);
  let mesh=null;
  if(layer.type==='geo'){
    mesh=Geo.geoLayerMesh(ctx,layer,bucket);
  } else if(layer.type==='shape'){
    const sg=Geo.shapeLayerGeo(ctx,layer,bucket);
    mesh=Geo.extrude(sg.rings,4,0,0);
  } else if(layer.type==='text'){
    const tg=Geo.textGeo(ctx,layer,bucket);
    const rings=[];
    for(const c of tg.chars) for(const st of c.strokes){
      rings.push(Path_flat(st));
    }
    mesh=Geo.extrude(rings,4,0,0);
  }
  if(!mesh||!mesh.idx.length){ gridCache.set(key,null); return null; }
  const wm=Eval.worldMatrix(ctx,layer,bucket).m;
  const world=Geo.transformMesh(mesh,wm);
  const prevKey=layer.id+':'+(bucket-DT*2).toFixed(3)+':'+globalSig;
  const prevEntry=gridCache.get(prevKey);
  const grid=Geo.buildGrid(world,70);
  const entry={mesh:world,grid,prev:prevEntry?prevEntry.mesh:null,bucket};
  gridCache.set(key,entry);
  if(gridCache.size>400){ const first=gridCache.keys().next().value; gridCache.delete(first); }
  return entry;
}
function Path_flat(stroke){
  const sm=FF.glyphs.sampleStroke(stroke,2.5);
  const flat=[];
  const L=[],R=[];
  for(let i=0;i<sm.length;i++){
    const a=sm[Math.max(0,i-1)], b=sm[Math.min(sm.length-1,i+1)];
    let dx=b.x-a.x,dy=b.y-a.y; const l=Math.hypot(dx,dy)||1;
    const w=sm[i].w/2;
    L.push(sm[i].x-dy/l*w,sm[i].y+dx/l*w);
    R.push(sm[i].x+dy/l*w,sm[i].y-dx/l*w);
  }
  for(let i=0;i<L.length;i+=2) flat.push(L[i],L[i+1]);
  for(let i=R.length-2;i>=0;i-=2) flat.push(R[i],R[i+1]);
  return flat;
}
function surfaceVelocity(entry,point){
  if(!entry.prev) return [0,0,0];
  // 用最近三角形质心位移近似表面速度
  let best=1e18, bv=[0,0,0];
  const tris=entry.grid.tris, prev=entry.prev;
  const n=Math.min(tris.length, 400);
  const stride=Math.max(1,Math.floor(tris.length/n));
  for(let i=0;i<tris.length;i+=stride){
    const tr=tris[i];
    const cx=(tr.a[0]+tr.b[0]+tr.c[0])/3, cy=(tr.a[1]+tr.b[1]+tr.c[1])/3, cz=(tr.a[2]+tr.b[2]+tr.c[2])/3;
    const d=(cx-point[0])**2+(cy-point[1])**2+(cz-point[2])**2;
    if(d<best){ best=d;
      const j=i*3;
      if(j+2<prev.pos.length){
        const px=(prev.pos[j]+prev.pos[j+3]+prev.pos[j+6])/3;
        const py=(prev.pos[j+1]+prev.pos[j+4]+prev.pos[j+7])/3;
        const pz=(prev.pos[j+2]+prev.pos[j+5]+prev.pos[j+8])/3;
        bv=[(cx-px)/(DT*2),(cy-py)/(DT*2),(cz-pz)/(DT*2)];
      }
    }
  }
  return bv;
}

function makeSim(layer){
  return { parts:[], emAcc:[], burstDone:[], spawnCount:0, step:0 };
}
function cloneSim(sim){
  return {
    parts:sim.parts.map(p=>({...p, trail:p.trail.slice()})),
    emAcc:sim.emAcc.slice(), burstDone:sim.burstDone.slice(),
    spawnCount:sim.spawnCount, step:sim.step,
  };
}
function emitterWorld(ctx,layer,em,t){
  const src=em.sourceLayer?FF.layerByName(ctx.comp,em.sourceLayer)||FF.findLayer(ctx.comp,em.sourceLayer):null;
  const baseLayer=src||layer;
  const wm=Eval.worldMatrix(ctx,baseLayer,t).m;
  const off=em.offset||[0,0,0];
  const pos=M4.transformPoint(wm,off);
  const wm2=Eval.worldMatrix(ctx,baseLayer,t-DT).m;
  const pos2=M4.transformPoint(wm2,off);
  const vel=V.mul(V.sub(pos,pos2),1/DT);
  return {pos,vel,wm,layer:baseLayer};
}
function spawnParticle(ctx,layer,em,ei,t,rand,opts){
  const P=layer.particles;
  const speed=(Eval.prop(ctx,layer,'particles.emitters.'+ei+'.speed',t)||120)*(0.55+0.9*rand());
  const spread=(em.spread===undefined?35:em.spread)*Math.PI/180;
  let dir;
  const ew=emitterWorld(ctx,layer,em,t);
  let origin=ew.pos.slice();
  if(opts&&opts.pos) origin=opts.pos.slice();
  if(em.kind==='surface'&&em.sourceLayer){
    const src=FF.layerByName(ctx.comp,em.sourceLayer)||FF.findLayer(ctx.comp,em.sourceLayer);
    if(src){
      const entry=colliderMesh(ctx,src,t);
      if(entry&&entry.grid.tris.length){
        const smp=Geo.surfaceSamples(entry.mesh,1,rand)[0];
        if(smp){ origin=smp.p; dir=smp.n; }
      }
    }
  } else if(em.kind==='curve'&&em.sourceLayer){
    const src=FF.layerByName(ctx.comp,em.sourceLayer)||FF.findLayer(ctx.comp,em.sourceLayer);
    if(src&&src.type==='shape'){
      const sg=Geo.shapeLayerGeo(ctx,src,t);
      const all=[...sg.rings,...sg.opens];
      if(all.length){
        const ring=all[Math.floor(rand()*all.length)];
        const L=FF.Path.length(ring);
        const q=FF.Path.sampleFlat(ring,rand()*L,true);
        const wm=Eval.worldMatrix(ctx,src,t).m;
        origin=M4.transformPoint(wm,[q[0],q[1],0]);
        dir=M4.transformDir(wm,[q[2],q[3],0]);
        dir=V.norm(dir);
      }
    }
  }
  if(!dir){
    dir=em.direction?V.norm(em.direction):[0,-1,0];
    if(opts&&opts.dir) dir=opts.dir;
  }
  // 随机锥形散布
  const a=rand()*Math.PI*2, r=Math.tan(spread)*Math.sqrt(rand());
  const up=Math.abs(dir[1])<0.9?[0,1,0]:[1,0,0];
  const t1=V.norm(V.cross(dir,up)), t2=V.cross(dir,t1);
  let d=V.norm(V.add(dir,V.add(V.mul(t1,Math.cos(a)*r),V.mul(t2,Math.sin(a)*r))));
  const life=(Eval.prop(ctx,layer,'particles.emitters.'+ei+'.life',t)||1.2)*(0.7+0.6*rand());
  const inherit=em.inherit===undefined?0.6:em.inherit;
  const vel=V.add(V.mul(d,speed*(opts&&opts.speedMul?opts.speedMul:1)),V.mul(ew.vel,inherit));
  const p={
    x:origin[0],y:origin[1],z:origin[2],
    vx:vel[0],vy:vel[1],vz:vel[2],
    age:0, life:Math.max(0.05,life),
    seed:rand(), size:0.7+0.6*rand(),
    hit:0, gen:opts&&opts.gen?opts.gen:0,
    trail:[origin[0],origin[1],origin[2]],
  };
  return p;
}
function stepSim(ctx,layer,sim,t){
  const P=layer.particles;
  const dt=DT/SUB;
  const gravity=Eval.prop(ctx,layer,'particles.gravity',t)||[0,300,0];
  const wind=Eval.prop(ctx,layer,'particles.wind',t)||[0,0,0];
  const drag=Eval.prop(ctx,layer,'particles.drag',t)||0;
  const rest=Eval.prop(ctx,layer,'particles.restitution',t);
  const fric=Eval.prop(ctx,layer,'particles.friction',t);
  const hitLoss=Eval.prop(ctx,layer,'particles.hitLifeLoss',t)||0;
  const secondary=Math.round(Eval.prop(ctx,layer,'particles.secondary',t)||0);
  const fieldLayers=(P.fields||[]).map(f=>FF.findLayer(ctx.comp,f.layerId)).filter(Boolean);
  const colliders=(P.collideWith||[]).map(id=>FF.findLayer(ctx.comp,id)).filter(l=>l&&l.visible);
  const dragK=1/(1+drag*dt*3);
  // 发射
  for(let ei=0;ei<P.emitters.length;ei++){
    const em=P.emitters[ei];
    if(em.enabled===false) continue;
    const rate=Eval.prop(ctx,layer,'particles.emitters.'+ei+'.rate',t)||0;
    if(sim.emAcc[ei]===undefined) sim.emAcc[ei]=0;
    sim.emAcc[ei]+=rate*dt;
    let n=Math.floor(sim.emAcc[ei]);
    sim.emAcc[ei]-=n;
    const win=em.window;
    if(win&&(t<win[0]||t>win[1])) n=0;
    while(n-->0&&sim.parts.length<MAX_P){
      const rand=rng.mulberry(layer.particles.seed*7919+ei*104729+sim.spawnCount*2654435761);
      sim.parts.push(spawnParticle(ctx,layer,em,ei,t,rand,{}));
      sim.spawnCount++;
    }
    for(let bi=0;bi<(em.bursts||[]).length;bi++){
      const b=em.bursts[bi];
      const bk=ei*100+bi;
      if(!sim.burstDone[bk]&&t>=b.t){
        sim.burstDone[bk]=true;
        const rand=rng.mulberry(layer.particles.seed*31+bi*777+13);
        for(let k=0;k<b.count&&sim.parts.length<MAX_P;k++){
          const dir=b.dir||[0,-1,0];
          const a=rand()*Math.PI*2, el=rand()*Math.PI*(b.spread===undefined?0.5:b.spread);
          const up=Math.abs(dir[1])<0.9?[0,1,0]:[1,0,0];
          const t1=V.norm(V.cross(dir,up)), t2=V.cross(dir,t1);
          const d=V.norm(V.add(V.mul(dir,Math.cos(el)),V.add(V.mul(t1,Math.cos(a)*Math.sin(el)),V.mul(t2,Math.sin(a)*Math.sin(el)))));
          const sp=(b.speed||300)*(0.4+1.1*rand());
          const pos=b.pos||[0,0,0];
          sim.parts.push({
            x:pos[0]+(rand()-0.5)*(b.area||10), y:pos[1]+(rand()-0.5)*(b.area||10), z:pos[2]+(rand()-0.5)*(b.area||10),
            vx:d[0]*sp, vy:d[1]*sp, vz:d[2]*sp,
            age:0, life:(b.life||1.1)*(0.6+0.9*rand()), seed:rand(), size:0.6+0.8*rand(),
            hit:0, gen:0, trail:[pos[0],pos[1],pos[2]],
          });
          sim.spawnCount++;
        }
      }
    }
  }
  // 碰撞体（当前表面）
  const entries=colliders.map(l=>colliderMesh(ctx,l,t)).filter(Boolean);
  const parts=sim.parts;
  const newborn=[];
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];
    p.age+=dt;
    if(p.age>=p.life){ parts[i]=parts[parts.length-1]; parts.pop(); continue; }
    let ax=gravity[0]+wind[0], ay=gravity[1]+wind[1], az=(gravity[2]||0)+(wind[2]||0);
    for(const fl of fieldLayers){
      const f=Geo.fieldAt(ctx,fl,[p.x,p.y,p.z],t);
      ax+=f[0]; ay+=f[1]; az+=f[2];
    }
    p.vx=(p.vx+ax*dt)*dragK; p.vy=(p.vy+ay*dt)*dragK; p.vz=(p.vz+az*dt)*dragK;
    const p0=[p.x,p.y,p.z];
    const p1=[p.x+p.vx*dt,p.y+p.vy*dt,p.z+p.vz*dt];
    let hit=null, hitEntry=null;
    for(const en of entries){
      const h=Geo.collideSegment(en.grid,p0,p1,1);
      if(h&&(!hit||h.t<hit.t)){ hit=h; hitEntry=en; }
    }
    if(hit){
      const n=hit.normal;
      const sv=surfaceVelocity(hitEntry,hit.point);
      let rv=[p.vx-sv[0],p.vy-sv[1],p.vz-sv[2]];
      const vn=V.dot(rv,n);
      if(vn<0){
        const r=rest===undefined?0.35:rest;
        rv=V.sub(rv,V.mul(n,(1+r)*vn));
        const f=fric===undefined?0.75:fric;
        const tv=V.sub(rv,V.mul(n,V.dot(rv,n)));
        rv=V.add(V.mul(n,V.dot(rv,n)),V.mul(tv,clamp(1-f*0.6,0,1)));
        p.vx=rv[0]+sv[0]; p.vy=rv[1]+sv[1]; p.vz=rv[2]+sv[2];
      }
      p.x=hit.point[0]+n[0]*0.8; p.y=hit.point[1]+n[1]*0.8; p.z=hit.point[2]+n[2]*0.8;
      if(p.hit<=0){
        p.hit=0.18;
        p.age+=hitLoss*p.life;
        if(secondary>0&&p.gen<2&&parts.length+newborn.length<MAX_P){
          const rand=rng.mulberry(Math.floor(p.seed*1e9)+sim.step*17);
          for(let k=0;k<secondary;k++){
            const d=V.norm(V.add(n,[rand()-0.5,rand()-0.5,rand()-0.5]));
            const sp=60+140*rand();
            newborn.push({x:p.x,y:p.y,z:p.z,vx:d[0]*sp,vy:d[1]*sp,vz:d[2]*sp,
              age:0,life:0.25+0.4*rand(),seed:rand(),size:0.35+0.4*rand(),hit:0.1,gen:p.gen+1,
              trail:[p.x,p.y,p.z]});
          }
        }
      }
    } else { p.x=p1[0]; p.y=p1[1]; p.z=p1[2]; }
    if(p.hit>0) p.hit-=dt;
  }
  for(const nb of newborn) parts.push(nb);
  sim.step++;
  // 拖尾记录（每个整帧）
  if(sim.step%SUB===0){
    const trailLen=Math.max(2,Math.round(Eval.prop(ctx,layer,'particles.trails.length',t)||10));
    for(const p of parts){
      p.trail.push(p.x,p.y,p.z);
      const maxLen=trailLen*3;
      if(p.trail.length>maxLen) p.trail.splice(0,p.trail.length-maxLen);
    }
  }
}
function sigOf(layer){
  return globalSig+':'+layer.id;
}
function stateAt(ctx,layer,t){
  t=Math.max(0,t);
  let cache=caches.get(layer.id);
  const sig=sigOf(layer);
  if(!cache||cache.sig!==sig){
    cache={sig, snaps:new Map(), sim:makeSim(layer), builtTo:0};
    cache.snaps.set(0,cloneSim(cache.sim));
    caches.set(layer.id,cache);
  }
  const targetStep=Math.floor(t/DT+1e-6);
  if(targetStep<cache.builtTo){
    // 回退：找最近快照
    let best=0;
    for(const k of cache.snaps.keys()) if(k<=targetStep&&k>best) best=k;
    cache.sim=cloneSim(cache.snaps.get(best));
    cache.builtTo=best;
  }
  while(cache.builtTo<targetStep){
    const tt=(cache.builtTo+0.5)*DT;
    stepSim(ctx,layer,cache.sim,tt);
    cache.builtTo++;
    if(cache.builtTo%SNAP_EVERY===0) cache.snaps.set(cache.builtTo,cloneSim(cache.sim));
  }
  // 分数步（不提交）
  const frac=t-cache.builtTo*DT;
  if(frac>1e-5){
    const tmp=cloneSim(cache.sim);
    const savedStep=tmp.step;
    // 用半步近似：直接积分 frac
    const parts=tmp.parts;
    const gravity=Eval.prop(ctx,layer,'particles.gravity',t)||[0,300,0];
    for(const p of parts){
      p.x+=p.vx*frac; p.y+=p.vy*frac; p.z+=p.vz*frac;
      p.vx+=gravity[0]*frac; p.vy+=gravity[1]*frac;
      p.age+=frac;
    }
    tmp.parts=parts.filter(p=>p.age<p.life);
    return tmp;
  }
  return cache.sim;
}
/* 渲染数据 */
function renderData(ctx,layer,t){
  const sim=stateAt(ctx,layer,t);
  const P=layer.particles;
  const s0=Eval.prop(ctx,layer,'particles.sizeStart',t)||6;
  const s1=Eval.prop(ctx,layer,'particles.sizeEnd',t)||1;
  const layerOpa=(Eval.prop(ctx,layer,'transform.opacity',t)||100)/100;
  const o0=(Eval.prop(ctx,layer,'particles.opacityStart',t)||100)/100*layerOpa;
  const o1=(Eval.prop(ctx,layer,'particles.opacityEnd',t)||0)/100*layerOpa;
  const stops=P.colorStops||[[0,[1,1,1]],[1,[1,1,1]]];
  const inst=[];
  for(const p of sim.parts){
    const u=clamp(p.age/p.life,0,1);
    let col=[1,1,1];
    for(let i=0;i<stops.length-1;i++){
      if(u>=stops[i][0]&&u<=stops[i+1][0]){
        const f=(u-stops[i][0])/((stops[i+1][0]-stops[i][0])||1);
        col=V.lerp(stops[i][1],stops[i+1][1],f); break;
      }
    }
    if(u>stops[stops.length-1][0]) col=stops[stops.length-1][1];
    if(p.hit>0){ const f=p.hit/0.18; col=V.lerp(col,[1,1,0.95],f*0.8); }
    const size=lerp(s0,s1,u*u)*p.size;
    const alpha=lerp(o0,o1,u);
    inst.push(p.x,p.y,p.z,size,col[0],col[1],col[2],alpha);
  }
  // 拖尾
  let trails=null;
  if(P.trails&&P.trails.enabled){
    const width=Eval.prop(ctx,layer,'particles.trails.width',t)||2;
    const fade=Eval.prop(ctx,layer,'particles.trails.fade',t)||1.5;
    const tc=Eval.prop(ctx,layer,'particles.trails.color',t)||[1,0.6,0.2];
    const verts=[];
    const camPos=ctx.__camPos||[0,0,900];
    for(const p of sim.parts){
      const n=p.trail.length/3;
      if(n<2) continue;
      const u=clamp(p.age/p.life,0,1);
      const baseA=lerp(o0,o1,u)*0.7;
      for(let i=0;i<n-1;i++){
        const a=[p.trail[i*3],p.trail[i*3+1],p.trail[i*3+2]];
        const b=[p.trail[(i+1)*3],p.trail[(i+1)*3+1],p.trail[(i+1)*3+2]];
        const dir=V.norm(V.sub(b,a));
        const view=V.norm(V.sub(a,camPos));
        let side=V.cross(dir,view);
        const l=V.len(side); if(l<1e-5) continue;
        side=V.mul(side,1/l);
        const f0=Math.pow(i/(n-1),fade), f1=Math.pow((i+1)/(n-1),fade);
        const w0=width*f0*p.size*0.5, w1=width*f1*p.size*0.5;
        const a0=V.add(a,V.mul(side,w0)), a1=V.sub(a,V.mul(side,w0));
        const b0=V.add(b,V.mul(side,w1)), b1=V.sub(b,V.mul(side,w1));
        const al0=baseA*f0, al1=baseA*f1;
        verts.push(a0[0],a0[1],a0[2],tc[0],tc[1],tc[2],al0);
        verts.push(a1[0],a1[1],a1[2],tc[0],tc[1],tc[2],al0);
        verts.push(b0[0],b0[1],b0[2],tc[0],tc[1],tc[2],al1);
        verts.push(a1[0],a1[1],a1[2],tc[0],tc[1],tc[2],al0);
        verts.push(b1[0],b1[1],b1[2],tc[0],tc[1],tc[2],al1);
        verts.push(b0[0],b0[1],b0[2],tc[0],tc[1],tc[2],al1);
      }
    }
    trails=verts;
  }
  return {inst:new Float32Array(inst), trails:trails?new Float32Array(trails):null, count:sim.parts.length};
}
FF.Particles.stateAt=stateAt;
FF.Particles.renderData=renderData;
FF.Particles.DT=DT;
})();
