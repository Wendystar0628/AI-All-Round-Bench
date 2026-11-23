/* particles.js ?确定性粒子模拟：发射、力场、碰撞、拖?*/
(function(){
'use strict';
const P = { sims:new Map() };
window.Particles = P;

P.invalidate=function(layerId){ if(layerId){ P.sims.delete(layerId); } else P.sims.clear(); };
P.invalidateAll=function(){ P.sims.clear(); };

P.getSim=function(layer,comp){
  let sim=P.sims.get(layer.id);
  const ver=P.version(layer,comp);
  if(sim && sim.version!==ver){ P.sims.delete(layer.id); sim=null; }
  if(!sim){
    sim={ layer, comp, version:ver, frames:[], hist:new Map(), time:-1, dt:1/comp.fps,
          acc:{}, total:0, bvhCache:new Map(), bvhFrame:-1 };
    P.sims.set(layer.id,sim);
  }
  return sim;
};
P.version=function(layer,comp){
  // 与粒子相关的参数指纹
  const keys=['particle.rate','particle.life','particle.speed','particle.speedRandom','particle.size','particle.sizeRandom',
    'particle.gravity','particle.resistance','particle.seed','particle.colorStart','particle.colorEnd','particle.collide',
    'particle.bounce','particle.friction','particle.subEmit','particle.emitters','particle.force','particle.attractors',
    'transform.position','transform.rotation','transform.scale','transform.rotationX','transform.rotationY'];
  let h=0;
  for(const k of keys){
    let v;
    if(k.indexOf('.')===0||k.indexOf('particle.')===0||k.indexOf('transform.')===0){ try{ v=Model.evalProperty(layer,k,0,comp);}catch(e){v=null;} }
    else v=layer.values[k];
    const sv=JSON.stringify(v);
    h=(h*31+(sv?sv.length:0)+hashStr(sv||''))>>>0;
  }
  if(comp.fields) for(const f of comp.fields) h=(h*31+hashStr(JSON.stringify(f)))>>>0;
  return h;
};
function hashStr(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }

/* ==================== 发射 ==================== */
function emitterParam(layer,idx,key,t,dv){
  const path='particle.emitters.'+idx+'.'+key;
  const kf=layer.kf[path];
  if(kf&&kf.keys&&kf.keys.length) return U.evalKeys(kf.keys,t);
  const em=(layer.values['particle'].emitters||[])[idx];
  return em? em[key]:dv;
}
function emitterWorld(em, layer, comp, t, idx){
  const pos=emitterParam(layer,idx,'position',t,[0,0,0]);
  const d0=emitterParam(layer,idx,'direction',t,[0,1,0]);
  const m=Model.worldMatrix(layer,t,comp);
  const p=U.m4mulV(m,[pos[0],pos[1],pos[2]||0,1]);
  const d=U.m4mulV(m,[d0[0],d0[1],d0[2]||0,0]);
  return {pos:[p[0],p[1],p[2]], dir:U.vnorm([d[0],d[1],d[2]])};
}
function sampleEmitter(em, layer, comp, t, rand, idx){
  const ew=emitterWorld(em,layer,comp,t,idx);
  let pos=ew.pos, dir=ew.dir;
  if(em.surface && em.sourceLayerId){
    const g=Composite.sourceGeometry(em.sourceLayerId, comp, t);
    if(g && g.tris.length){
      const tri=g.tris[Math.floor(rand()*g.tris.length)%g.tris.length];
      const u=rand(), v=rand();
      const a=tri[0],b=tri[1],c=tri[2];
      const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
      pos=[a[0]+ab[0]*u+ac[0]*v, a[1]+ab[1]*u+ac[1]*v, a[2]+ab[2]*u+ac[2]*v];
      const n=U.vnorm(U.vcross(ab,ac));
      dir=n;
    } else if(g && g.contours.length){
      const c=g.contours[Math.floor(rand()*g.contours.length)%g.contours.length];
      const p=c.pts[Math.floor(rand()*c.pts.length)%c.pts.length];
      pos=[p[0],p[1],0];
    }
  } else if(em.type==='line'){
    const l=em.length||200;
    const s=rand()*2-1;
    const perp=U.vnorm([ew.dir[1],-ew.dir[0],0]);
    pos=[ew.pos[0]+perp[0]*s*l, ew.pos[1]+perp[1]*s*l, ew.pos[2]+(em.position[2]||0)];
  }
  return {pos,dir};
}

/* ==================== 模拟 ==================== */
P.simulate=function(layer,comp,t){
  const sim=P.getSim(layer,comp);
  const ps=Model.evalObj(layer,'particle',0,comp);
  const dt=sim.dt;
  const startFrame=Math.max(0,Math.floor(layer.inPoint/dt));
  const targetFrame=Math.min(Math.ceil(comp.duration/dt), Math.ceil(t/dt));
  if(sim.frames.length && sim.time> t+1e-9){
    sim.frames.length=0; sim.hist.clear(); sim.time=-1; sim.acc={}; sim.total=0; sim.bvhCache.clear(); sim.bvhFrame=-1;
  }
  if(sim.time<0){
    sim.time=startFrame*dt;
    sim.frames.length=0;
    for(let i=0;i<startFrame;i++) sim.frames.push(null);
  }
  const emitters=ps.emitters||[];
  const maxFrames=Math.min(Math.ceil(comp.duration/dt)+2, 2000);
  let guard=0;
  while(sim.time < t-1e-9 && guard++<maxFrames){
    const f=Math.round(sim.time/dt);
    if(sim.frames.length<=f) sim.frames.push(null);
    const newParts=[];
    for(let ei=0;ei<emitters.length;ei++){
      const em=emitters[ei];
      if(em.enabled===false) continue;
      const rate=emitterParam(layer,ei,'rate',sim.time, em.rate!==undefined?em.rate:ps.rate);
      if(rate<=0) continue;
      const key=ei;
      sim.acc[key]=(sim.acc[key]||0)+rate*dt;
      let n=Math.floor(sim.acc[key]);
      if(n>200) n=200;
      sim.acc[key]-=n;
      for(let k=0;k<n;k++){
        const idx=sim.total++;
        const rng=U.mulberry32((hashStr(layer.id)+idx*7919+((ps.seed|0)||1))>>>0);
        const s=sampleEmitter(em,layer,comp,sim.time,rng,ei);
        const spd=(ps.speed||0)*(1+(rng()*2-1)*(ps.speedRandom||0));
        const vel=U.vscale(s.dir,spd);
        if(em.velocity){
          // 继承发射器运动速度（近似）
          const t2=sim.time+dt;
          const p1=emitterWorld(em,layer,comp,sim.time,ei).pos;
          const p2=emitterWorld(em,layer,comp,t2,ei).pos;
          vel=U.vadd(vel,[(p2[0]-p1[0])/dt,(p2[1]-p1[1])/dt,(p2[2]-p1[2])/dt]);
        }
        const life=Math.max(0.05,(ps.life||1)*(0.7+rng()*0.6));
        newParts.push({
          id:idx, x:s.pos[0],y:s.pos[1],z:s.pos[2],
          vx:vel[0],vy:vel[1],vz:vel[2],
          age:0, life, size:(ps.size||5)*(1+(rng()*2-1)*(ps.sizeRandom||0)),
          seed:rng()*1000, emit:ei, flags:0, r:0,g:0,b:0,a:0,
        });
      }
    }
    const prev=sim.frames[f]||null;
    const next=[];
    if(prev){
      for(const p of prev){
        if(p.age>=p.life) continue;
        p.age+=dt;
        let ax=ps.force?ps.force[0]:0, ay=(ps.force?ps.force[1]:0)+(ps.gravity||0), az=ps.force?ps.force[2]:0;
        if(ps.attractors) for(const at of ps.attractors){
          const dx=at.pos[0]-p.x, dy=at.pos[1]-p.y, dz=(at.pos[2]||0)-p.z;
          const d=Math.hypot(dx,dy,dz)+1e-6;
          const s=at.strength/(d*d*0.001+100);
          ax+=dx/d*s*1000; ay+=dy/d*s*1000; az+=dz/d*s*1000;
        }
        if(comp.fields) for(const fd of comp.fields){
          const disp=Geo.evalField(fd,[p.x,p.y,p.z],sim.time);
          if(disp){ ax+=disp[0]; ay+=disp[1]; az+=disp[2]; }
        }
        p.vx+=ax*dt; p.vy+=ay*dt; p.vz+=az*dt;
        const res=Math.max(0,1-(ps.resistance||0)*dt);
        p.vx*=res; p.vy*=res; p.vz*=res;
        p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
        // 碰撞
        if(ps.collide){
          const hit=collide(layer,comp,p,sim,f);
          if(hit){
            if(ps.subEmit && !(p.flags&1)){
              p.flags|=1;
              // 次级发射
              const n=2+Math.floor(Math.random()*2);
              for(let k=0;k<n;k++){
                const rng=U.mulberry32((p.seed*131+k*17)>>>0);
                const sp=U.vnorm([rng()*2-1,rng()*2-1,rng()*2-1]);
                const idx2=sim.total++;
                newParts.push({id:idx2,x:p.x,y:p.y,z:p.z,vx:sp[0]*120,vy:sp[1]*120,vz:sp[2]*120,
                  age:0,life:0.4,size:p.size*0.6,seed:rng()*1000,emit:p.emit,flags:2,r:0,g:0,b:0,a:0});
              }
            }
          }
        }
        const lifeT=U.clamp(p.age/p.life,0,1);
        const cs=ps.colorStart||[1,1,1], ce=ps.colorEnd||cs;
        p.r=U.lerp(cs[0],ce[0],lifeT); p.g=U.lerp(cs[1],ce[1],lifeT); p.b=U.lerp(cs[2],ce[2],lifeT);
        p.a=U.lerp((ps.opacityStart===undefined?100:ps.opacityStart)/100,(ps.opacityEnd===undefined?0:ps.opacityEnd)/100,lifeT);
        if(p.flags&2) p.a*=0.8;
        next.push(p);
      }
    }
    for(const p of newParts){ next.push(p); }
    sim.frames[f]=next;
    sim.time=(f+1)*dt;
    // 历史（用于拖尾）
    const hist=sim.hist;
    for(const p of next){
      let h=hist.get(p.id);
      if(!h){ h=[]; hist.set(p.id,h); }
      h.push([f,p.x,p.y,p.z,p.size,p.r,p.g,p.b,p.a]);
      const maxHist=(ps.trailLength||0)+2;
      while(h.length>maxHist) h.shift();
    }
  }
  return sim;
};

function collide(layer,comp,p,sim,frame){
  const ps=Model.evalObj(layer,'particle',0,comp);
  const radius=Math.max(0.5,(ps.size||5)*0.5);
  // 平面
  if(ps.planes) for(const pl of ps.planes){
    const d=(p.x-pl.pos[0])*pl.normal[0]+(p.y-pl.pos[1])*pl.normal[1]+(p.z-(pl.pos[2]||0))*pl.normal[2];
    if(d<radius && d>-radius*2){
      const vn=p.vx*pl.normal[0]+p.vy*pl.normal[1]+p.vz*pl.normal[2];
      if(vn<0){
        const bounce=ps.bounce===undefined?0.4:ps.bounce;
        const fric=ps.friction===undefined?0.2:ps.friction;
        p.vx-=(1+bounce)*vn*pl.normal[0];
        p.vy-=(1+bounce)*vn*pl.normal[1];
        p.vz-=(1+bounce)*vn*pl.normal[2];
        p.vx*=(1-fric); p.vy*=(1-fric); p.vz*=(1-fric);
        const push=radius-d;
        p.x+=pl.normal[0]*push; p.y+=pl.normal[1]*push; p.z+=pl.normal[2]*push;
        return true;
      }
    }
  }
  // 网格
  if(ps.collisionLayers && ps.collisionLayers.length){
    for(const lid of ps.collisionLayers){
      const key=lid;
      let entry=sim.bvhCache.get(key);
      if(!entry || entry.frame!==frame){
        const g=Composite.sourceGeometry(lid,comp,sim.time);
        if(!g||!g.tris||!g.tris.length){ entry=null; }
        else entry={bvh:Geo.buildBVH(g.tris), frame};
        sim.bvhCache.set(key,entry);
      }
      if(!entry) continue;
      const res=Geo.closestOnMesh(entry.bvh,[p.x,p.y,p.z],radius+2);
      if(res.dist<=radius && res.normal){
        const vn=p.vx*res.normal[0]+p.vy*res.normal[1]+p.vz*res.normal[2];
        if(vn<0){
          const bounce=ps.bounce===undefined?0.4:ps.bounce;
          const fric=ps.friction===undefined?0.2:ps.friction;
          p.vx-=(1+bounce)*vn*res.normal[0];
          p.vy-=(1+bounce)*vn*res.normal[1];
          p.vz-=(1+bounce)*vn*res.normal[2];
          p.vx*=(1-fric); p.vy*=(1-fric); p.vz*=(1-fric);
          const push=radius-res.dist;
          p.x+=res.normal[0]*push; p.y+=res.normal[1]*push; p.z+=res.normal[2]*push;
          return true;
        }
      }
    }
  }
  return false;
}

/* 采样某一时刻的粒?*/
P.sample=function(layer,comp,t){
  const sim=P.simulate(layer,comp,t);
  const f=t/sim.dt;
  const f0=Math.floor(f), f1=Math.min(sim.frames.length-1,f0+1);
  const a=sim.frames[f0], b=sim.frames[f1];
  const k=f-f0;
  const out=[];
  if(a) for(const p of a){
    let x=p.x,y=p.y,z=p.z,vx=p.vx,vy=p.vy,vz=p.vz,size=p.size;
    if(b){
      const q=b.find(pp=>pp.id===p.id);
      if(q){ x=U.lerp(p.x,q.x,k); y=U.lerp(p.y,q.y,k); z=U.lerp(p.z,q.z,k); vx=U.lerp(p.vx,q.vx,k); vy=U.lerp(p.vy,q.vy,k); vz=U.lerp(p.vz,q.vz,k); size=U.lerp(p.size,q.size,k); }
    }
    out.push({id:p.id,pos:[x,y,z],vel:[vx,vy,vz],size,color:[p.r,p.g,p.b],alpha:p.a,age:p.age,life:p.life,flags:p.flags,emit:p.emit});
  }
  return {particles:out, hist:sim.hist};
};
/* 拖尾几何（世界空间三角带?*/
P.buildTrails=function(layer,comp,t,hist,camPos,viewProj,viewport){
  const ps=Model.evalObj(layer,'particle',0,comp);
  const len=ps.trailLength||0;
  if(len<=0) return [];
  const tris=[];
  const maxPts=len+1;
  for(const [id,h] of hist){
    if(h.length<2) continue;
    const last=h[h.length-1];
    const p=last;
    const alpha=p[8];
    if(alpha<0.02) continue;
    const pts=h.slice(-maxPts);
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1];
      const pa=[a[1],a[2],a[3]], pb=[b[1],b[2],b[3]];
      let dir=[pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]];
      const dl=U.vlen(dir);
      if(dl<1e-5) continue;
      dir=U.vscale(dir,1/dl);
      let toCam=U.vnorm(U.vsub(camPos,pa));
      let side=U.vnorm(U.vcross(dir,toCam));
      const w0=ps.trailWidth*(i/pts.length)*0.5;
      const w1=ps.trailWidth*((i+1)/pts.length)*0.5;
      const a0=[pa[0]-side[0]*w0,pa[1]-side[1]*w0,pa[2]-side[2]*w0];
      const a1=[pa[0]+side[0]*w0,pa[1]+side[1]*w0,pa[2]+side[2]*w0];
      const b0=[pb[0]-side[0]*w1,pb[1]-side[1]*w1,pb[2]-side[2]*w1];
      const b1=[pb[0]+side[0]*w1,pb[1]+side[1]*w1,pb[2]+side[2]*w1];
      const fade0=1-i/pts.length, fade1=1-(i+1)/pts.length;
      tris.push([a0[0],a0[1],a0[2],0,fade0],[b0[0],b0[1],b0[2],0,fade1],[b1[0],b1[1],b1[2],1,fade1]);
      tris.push([a0[0],a0[1],a0[2],0,fade0],[b1[0],b1[1],b1[2],1,fade1],[a1[0],a1[1],a1[2],1,fade0]);
    }
  }
  return tris;
};

})();
