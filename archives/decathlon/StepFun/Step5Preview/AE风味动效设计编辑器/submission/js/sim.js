/* ============ 锻火 FORGE · sim.js : 场 / 变形 / 粒子 / 节点 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const G=APP.geom;
const A=APP.anim;
const P=APP.project;
const CT=APP.content;
const S=APP.sim={};

/* ================= 空间场 ================= */
S.newField=function(type,name){
  return {id:C.uid('F'),name:name||'场',type:type||'distance',
    enabled:true,
    pos:P.newProp([0,0,0]),
    radius:P.newProp(300),
    strength:P.newProp(1),
    falloff:P.newProp(1),
    freq:P.newProp(0.02),
    seed:P.newProp(3)
  };
};
S.compFields=function(comp){return comp.fields||[];};
S.fieldAt=function(f,comp,t,x,y,z){
  const ctx={comp,time:t};
  const p=A.eval(f.pos,t,ctx);
  const R0=A.evalNum(f.radius,t,ctx);
  const st=A.evalNum(f.strength,t,ctx);
  const fo=A.evalNum(f.falloff,t,ctx);
  const dx=x-p[0],dy=y-p[1],dz=z-(p[2]||0);
  const d=Math.hypot(dx,dy,dz);
  if(d>R0||d<1e-6)return [0,0,0];
  const k=1-Math.pow(d/R0,Math.max(0.2,fo));
  if(f.type==='distance'){
    // 距离衰减: 指向/背离场心
    const s=st*300*k;
    return [-dx/d*s,-dy/d*s,-dz/d*s];
  }
  if(f.type==='vortex'){
    const s=st*400*k;
    // 绕 Y 轴旋涡 + 轻微向内
    return [dy/d*s,-dx/d*s*0.6,-dz/d*s*0.3];
  }
  if(f.type==='noise'){
    const fr=A.evalNum(f.freq,t,ctx);
    const sd=A.evalNum(f.seed,t,ctx);
    const n=(ox,oy,oz)=>C.noise3(ox*fr+sd,oy*fr+sd,oz*fr+sd+t*0.3)*2-1;
    return [n(x,y,z)*st*400*k,n(x+31.7,y,z)*st*400*k,n(x,y,z+57.1)*st*300*k];
  }
  return [0,0,0];
};
S.fieldsAt=function(comp,t,x,y,z){
  let fx=0,fy=0,fz=0;
  for(const f of S.compFields(comp)){
    if(!f.enabled)continue;
    const v=S.fieldAt(f,comp,t,x,y,z);
    fx+=v[0];fy+=v[1];fz+=v[2];
  }
  return [fx,fy,fz];
};

/* ================= 几何变形 ================= */
/* 图钉: 每个图钉 {pos:Prop(3), rot:Prop, scale:Prop, rest:[x,y]} */
S.applyPins=function(mesh,pins,t,ctx){
  if(!pins||!pins.length)return mesh;
  const pos=mesh.pos;
  const n=pos.length/3;
  const pinData=pins.map(p=>({
    cur:A.eval(p.pos,t,ctx),rot:A.evalNum(p.rot,t,ctx),scale:A.eval(p.scale,t,ctx),
    rest:p.rest||[0,0]
  }));
  for(let i=0;i<n;i++){
    const x=pos[i*3],y=pos[i*3+1];
    let dx=0,dy=0;
    for(const pd of pinData){
      const ddx=x-pd.rest[0],ddy=y-pd.rest[1];
      const d=Math.hypot(ddx,ddy);
      const rad=pd.radius||220;
      if(d>rad)continue;
      const w=Math.pow(1-d/rad,2);
      // 平移
      dx+=(pd.cur[0]-pd.rest[0])*w;
      dy+=(pd.cur[1]-pd.rest[1])*w;
      // 旋转+缩放(绕 rest)
      const a=pd.rot*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
      const sx=(pd.scale?pd.scale[0]:100)/100,sy=(pd.scale?pd.scale[1]:100)/100;
      const rx=(ddx*sx)*ca-(ddy*sy)*sa+pd.rest[0];
      const ry=(ddx*sx)*sa+(ddy*sy)*ca+pd.rest[1];
      dx+=(rx-x)*w;dy+=(ry-y)*w;
    }
    pos[i*3]=x+dx;pos[i*3+1]=y+dy;
  }
  G.computeNormals(mesh);
  return mesh;
};
/* 弯曲 / 扭转 / 场驱动(作用于挤出后的实体) */
S.applyDeform3D=function(mesh,layer,comp,t){
  const ctx={comp,layer,time:t};
  const d=layer.geo3d&&layer.geo3d.deform;
  if(!d)return mesh;
  const bend=A.evalNum(d.bend,t,ctx);
  const twist=A.evalNum(d.twist,t,ctx);
  const pos=mesh.pos;
  const n=pos.length/3;
  const H=600;
  for(let i=0;i<n;i++){
    let x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];
    if(bend){
      const u=C.clamp((y+H/2)/H,-1,1);
      const ang=bend*Math.PI/180*u*u*0.5;
      const c=Math.cos(ang),s=Math.sin(ang);
      const nz=z*c-x*s,nx=z*s+x*c;
      x=nx;z=nz;
    }
    if(twist){
      const u=C.clamp((z+300)/600,-1,1);
      const a=twist*Math.PI/180*u;
      const c=Math.cos(a),s=Math.sin(a);
      const nx=x*c-y*s,ny=x*s+y*c;
      x=nx;y=ny;
    }
    pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;
  }
  if(bend||twist)G.computeNormals(mesh);
  return mesh;
};

/* ================= 粒子系统 ================= */
const DT=1/120;
const MAXP=3000;
S.newParticleState=function(){
  return {parts:[],t:0,events:[],checkpoints:new Map()};
};
function rngFor(seed,i){
  return C.rng((seed*1000+i)|0);
}
/* 发射器几何采样: 返回点与法线 */
S.emitterSamples=function(layer,comp,t,count,seedBase){
  const em=layer.particle.emitter;
  const origin=A.layerOrigin(layer,comp,t);
  const m=A.worldMatrixAt(layer,comp,t);
  const ctx={comp,layer,time:t};
  const pts=[];
  const rnd=C.rng(seedBase);
  // 源图层(可指定其它图层作为发射几何)
  let srcLayer=layer;
  if(em.source==='layer'&&em.layerId){
    const l=comp.layers.find(x=>x.id===em.layerId);
    if(l)srcLayer=l;
  }
  if(em.type==='point'){
    for(let i=0;i<count;i++)pts.push({p:[origin.x,origin.y,origin.z],n:[0,-1,0]});
  }else if(em.type==='curve'){
    // 用源图层自身轮廓
    let rings=[];
    try{rings=CT.geoContours(srcLayer,comp,t);}catch(e){}
    if(!rings.length)rings=[[{x:-60,y:0},{x:60,y:0}]];
    const ring=rings[0];
    const sm=A.worldMatrixAt(srcLayer,comp,t);
    for(let i=0;i<count;i++){
      const idx=Math.floor(rnd()*ring.length);
      const a=ring[idx],b=ring[(idx+1)%ring.length];
      const k=rnd();
      const lp={x:C.lerp(a.x,b.x,k),y:C.lerp(a.y,b.y,k)};
      const w=C.m4transformPoint(sm,lp.x,lp.y,0);
      pts.push({p:[w.x,w.y,w.z],n:[0,-1,0]});
    }
  }else{ // surface
    let mesh=null;
    if(srcLayer.type==='geo3d'){
      const data=APP.render?APP.render.getLayerData(srcLayer,comp,t):null;
      if(data&&data.mesh)mesh=data.mesh;
    }
    if(!mesh){
      try{
        const contours=CT.geoContours(srcLayer,comp,t);
        if(contours.length)mesh=G.extrude(contours,{depth:20,bevel:0});
      }catch(e){}
    }
    if(mesh){
      const idx=mesh.idx,pos=mesh.pos;
      const triCount=idx.length/3;
      for(let i=0;i<count;i++){
        const ti=Math.floor(rnd()*triCount);
        const a=idx[ti*3]*3,b=idx[ti*3+1]*3,c=idx[ti*3+2]*3;
        let u1=rnd(),u2=rnd();
        if(u1+u2>1){u1=1-u1;u2=1-u2;}
        const u0=1-u1-u2;
        const px=pos[a]*u0+pos[b]*u1+pos[c]*u2;
        const py=pos[a+1]*u0+pos[b+1]*u1+pos[c+1]*u2;
        const pz=pos[a+2]*u0+pos[b+2]*u1+pos[c+2]*u2;
        const w=C.m4transformPoint(m,px,py,pz);
        const ax=pos[b]-pos[a],ay=pos[b+1]-pos[a+1],az=pos[b+2]-pos[a+2];
        const bx=pos[c]-pos[a],by=pos[c+1]-pos[a+1],bz=pos[c+2]-pos[a+2];
        let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;
        const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
        pts.push({p:[w.x,w.y,w.z],n:[nx,ny,nz]});
      }
    }else{
      for(let i=0;i<count;i++)pts.push({p:[origin.x,origin.y,origin.z],n:[0,-1,0]});
    }
  }
  return pts;
};
/* 推进模拟到时间 t (确定性, 从 0 积分) */
S.simulate=function(layer,comp,t){
  const key=comp.id+'|'+layer.id;
  const store=APP.app.particleCache;
  let st=store.get(key);
  if(!st){st=S.newParticleState();store.set(key,st);}
  // 检查点
  const ck=Math.floor(t/0.5);
  if(st.checkpoints.has(ck)&&ck>0){
    const cp=st.checkpoints.get(ck);
    st.parts=cp.parts.map(p=>Object.assign({},p));
    st.t=ck*0.5;
    st.events=[];
  }else if(st.t>t+1e-6){
    // 需要回溯: 找更早的检查点
    let found=null;
    for(let k=ck;k>=0;k--){if(st.checkpoints.has(k)){found=st.checkpoints.get(k);break;}}
    if(found){st.parts=found.parts.map(p=>Object.assign({},p));st.t=(found.t);st.events=[];}
    else{st.parts=[];st.t=0;st.events=[];}
  }
  let guard=0;
  while(st.t<t-1e-9&&guard++<20000){
    S.step(layer,comp,st);
  }
  return st;
};
S.step=function(layer,comp,st){
  const pt=layer.particle;
  const t=st.t;
  const ctx={comp,layer,time:t};
  const next=t+DT;
  const nctx={comp,layer,time:next};
  const life=A.evalNum(pt.life,next,nctx);
  const lifeVar=A.evalNum(pt.lifeVar,next,nctx);
  const birth=A.evalNum(pt.birth,next,nctx);
  const vel=A.evalNum(pt.vel,next,nctx);
  const velVar=A.evalNum(pt.velVar,next,nctx);
  const size0=A.evalNum(pt.size,next,nctx);
  const sizeVar=A.evalNum(pt.sizeVar,next,nctx);
  const drag=A.evalNum(pt.drag,next,nctx);
  const grav=A.evalNum(pt.grav,next,nctx);
  const gd=A.eval(pt.gravDir,next,nctx)||[0,1,0];
  const seed=Math.round(A.evalNum(pt.seed,next,nctx));
  const inherit=A.evalNum(pt.inherit,next,nctx);
  const em=pt.emitter;
  // 发射
  const emCount=Math.max(0,Math.round(birth*DT));
  const active=st.parts.filter(p=>p.age<p.life);
  if(emCount>0&&active.length<MAXP){
    const pts=S.emitterSamples(layer,comp,next,emCount,(seed*7919+Math.round(next*120))|0);
    const lm=A.worldMatrixAt(layer,comp,next);
    const lv={x:lm[12],y:lm[13],z:lm[14]};
    // 继承发射器运动
    const lmPrev=A.worldMatrixAt(layer,comp,Math.max(0,next-DT));
    const lvv={x:(lm[12]-lmPrev[12])/DT,y:(lm[13]-lmPrev[13])/DT,z:(lm[14]-lmPrev[14])/DT};
    for(let i=0;i<pts.length;i++){
      if(st.parts.length>=MAXP)break;
      const s=pts[i];
      const rnd=C.rng((seed*104729+st.parts.length*13+Math.round(next*1e6))|0);
      const sp=vel*(1+(rnd()*2-1)*velVar/Math.max(vel,1));
      let vx,vy,vz;
      if(em.fromNormal){
        // 沿表面法线发射
        const n=s.n;
        const jitter=0.55;
        vx=n[0]*sp+(rnd()*2-1)*sp*jitter;
        vy=n[1]*sp+(rnd()*2-1)*sp*jitter;
        vz=n[2]*sp+(rnd()*2-1)*sp*jitter;
      }else{
        const dir=em.direction||[0,-1,0];
        const arc=A.evalNum({v:em.arc!==undefined?em.arc:360},next,nctx)*Math.PI/180;
        const base=Math.atan2(dir[1],dir[0]);
        const ang=arc>=Math.PI*2?rnd()*Math.PI*2:base+(rnd()*2-1)*arc/2;
        const spread=A.evalNum({v:em.spread!==undefined?em.spread:0},next,nctx)*Math.PI/180;
        const el=(rnd()*2-1)*spread;
        vx=Math.cos(ang)*Math.cos(el)*sp;vy=Math.sin(ang)*Math.cos(el)*sp;vz=Math.sin(el)*sp;
      }
      const n=s.n;
      st.parts.push({
        p:[s.p[0],s.p[1],s.p[2]],
        v:[vx+lvv[0]*inherit,vy+lvv[1]*inherit,vz+lvv[2]*inherit],
        age:0,life:Math.max(0.05,life*(1+(rnd()*2-1)*lifeVar/Math.max(life,0.1))),
        size:Math.max(0.5,size0*(1+(rnd()*2-1)*sizeVar/Math.max(size0,1))),
        seed:rnd(),born:next,
        hit:0,trail:[]
      });
    }
  }
  // 更新
  const keep=[];
  for(const p of st.parts){
    if(p.age>=p.life){continue;}
    const nctx2={comp,layer,time:next};
    // 力
    let fx=0,fy=0,fz=0;
    fy+=grav*gd[1];fx+=grav*gd[0];fz+=grav*gd[2];
    const ff=S.fieldsAt(comp,next,p.p[0],p.p[1],p.p[2]);
    fx+=ff[0];fy+=ff[1];fz+=ff[2];
    const dmp=Math.max(0,1-drag*DT);
    p.v[0]=(p.v[0]+fx*DT)*dmp;
    p.v[1]=(p.v[1]+fy*DT)*dmp;
    p.v[2]=(p.v[2]+fz*DT)*dmp;
    const np=[p.p[0]+p.v[0]*DT,p.p[1]+p.v[1]*DT,p.p[2]+p.v[2]*DT];
    // 碰撞
    let collided=false;
    if(A.evalNum(pt.collide,next,nctx2)>0.5){
      const hit=S.collide(comp,next,p.p,np,p.v);
      if(hit){
        collided=true;
        np[0]=hit.p[0];np[1]=hit.p[1];np[2]=hit.p[2];
        const rest=A.evalNum(pt.bounce,next,nctx2);
        const fr=A.evalNum(pt.friction,next,nctx2);
        const vn=p.v[0]*hit.n[0]+p.v[1]*hit.n[1]+p.v[2]*hit.n[2];
        p.v[0]=(p.v[0]-hit.n[0]*vn*(1+rest))*(1-fr);
        p.v[1]=(p.v[1]-hit.n[1]*vn*(1+rest))*(1-fr);
        p.v[2]=(p.v[2]-hit.n[2]*vn*(1+rest))*(1-fr);
        p.hit++;
        if(pt.onHit==='spark'&&p.hit===1&&st.events.length<400){
          st.events.push({t:next,p:hit.p,n:hit.n,seed:p.seed,life:0.35,size:p.size*0.8});
        }
        if(pt.onHit==='die'){p.age=p.life;continue;}
      }
    }
    p.p=np;
    p.age+=DT;
    // 拖尾
    const tl=Math.round(A.evalNum(pt.trail.len,next,nctx2));
    if(tl>0){
      p.trail.push([p.p[0],p.p[1],p.p[2]]);
      while(p.trail.length>tl)p.trail.shift();
    }else p.trail.length=0;
    keep.push(p);
  }
  st.parts=keep;
  st.t=next;
  if(Math.abs(next/0.5-Math.round(next/0.5))<1e-6){
    st.checkpoints.set(Math.round(next/0.5),{t:next,parts:st.parts.map(p=>Object.assign({},p))});
    if(st.checkpoints.size>80){const k=st.checkpoints.keys().next().value;st.checkpoints.delete(k);}
  }
};
/* 与三维层碰撞 */
S.collideMeshes=null;
S.collide=function(comp,t,p,np,v){
  let best=null;
  for(const l of comp.layers){
    if(l.type!=='geo3d'||!A.layerActive(l,comp,t))continue;
    let mesh=null;
    try{
      const data=APP.render.getLayerData(l,comp,t);
      if(data&&data.mesh)mesh=data.mesh;
    }catch(e){}
    if(!mesh)continue;
    const m=A.worldMatrixAt(l,comp,t);
    const idx=mesh.idx,pos=mesh.pos;
    for(let i=0;i<idx.length;i+=3){
      const a=idx[i]*3,b=idx[i+1]*3,c=idx[i+2]*3;
      // 变换到世界
      const P=[];
      for(const o of [a,b,c]){
        const w=C.m4transformPoint(m,pos[o],pos[o+1],pos[o+2]);
        P.push([w.x,w.y,w.z]);
      }
      const hit=segTri(p,np,P);
      if(hit&&(!best||hit.t<best.t))best=hit;
    }
  }
  return best;
};
function segTri(p,np,tri){
  const [a,b,c]=tri;
  const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2];
  const vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const nl=Math.hypot(nx,ny,nz);
  if(nl<1e-9)return null;
  nx/=nl;ny/=nl;nz/=nl;
  const dx=np[0]-p[0],dy=np[1]-p[1],dz=np[2]-p[2];
  const den=nx*dx+ny*dy+nz*dz;
  if(Math.abs(den)<1e-9)return null;
  const tt=(nx*(a[0]-p[0])+ny*(a[1]-p[1])+nz*(a[2]-p[2]))/den;
  if(tt<0||tt>1)return null;
  const q=[p[0]+dx*tt,p[1]+dy*tt,p[2]+dz*tt];
  // 重心坐标
  const d00=ux*ux+uy*uy+uz*uz,d01=ux*vx+uy*vy+uz*vz,d11=vx*vx+vy*vy+vz*vz;
  const d20=(q[0]-a[0])*ux+(q[1]-a[1])*uy+(q[2]-a[2])*uz;
  const d21=(q[0]-a[0])*vx+(q[1]-a[1])*vy+(q[2]-a[2])*vz;
  const dd=d00*d11-d01*d01;
  if(Math.abs(dd)<1e-12)return null;
  const v=(d11*d20-d01*d21)/dd;
  const w=(d00*d21-d01*d20)/dd;
  const u=1-v-w;
  if(v<-0.02||w<-0.02||u<-0.02)return null;
  const n=[nx,ny,nz];
  // 保证法线朝向运动来源一侧
  if(n[0]*dx+n[1]*dy+n[2]*dz>0){n[0]=-n[0];n[1]=-n[1];n[2]=-n[2];}
  return {t:tt,p:q,n};
}
/* 粒子渲染数据 */
S.particleRenderData=function(layer,comp,t){
  const st=S.simulate(layer,comp,t);
  const pt=layer.particle;
  const ctx={comp,layer,time:t};
  const m=A.worldMatrixAt(layer,comp,t);
  const parts=st.parts;
  const out={quads:[],trails:[],events:st.events};
  const cA=A.eval(pt.colorA,t,ctx)||[1,1,1];
  const cB=A.eval(pt.colorB,t,ctx)||[1,1,1];
  for(const p of parts){
    if(p.age>=p.life)continue;
    const u=p.age/p.life;
    const col=[C.lerp(cA[0],cB[0],u),C.lerp(cA[1],cB[1],u),C.lerp(cA[2],cB[2],u)];
    const alpha=Math.sin(Math.min(1,u)*Math.PI)*0.9+0.1;
    const size=p.size*(1-u*0.5);
    const w=C.m4transformPoint(m,p.p[0],p.p[1],p.p[2]);
    out.quads.push({x:w.x,y:w.y,z:w.z,size,color:col,alpha});
    const tl=Math.round(A.evalNum(pt.trail.len,t,ctx));
    if(tl>1&&p.trail.length>1){
      const w0=C.m4transformPoint(m,p.trail[0][0],p.trail[0][1],p.trail[0][2]);
      out.trails.push({pts:[w0,{x:w.x,y:w.y,z:w.z}],color:col,alpha:alpha*0.6,
        width:size*(A.evalNum(pt.trail.width,t,ctx)||1)*0.8});
    }
  }
  // 火星事件(次级发射)
  for(const e of st.events){
    const dt=t-e.t;
    if(dt<0||dt>e.life)continue;
    const u=dt/e.life;
    const g=gravOf(pt,ctx);
    const px=e.p[0]+e.n[0]*dt*60,py=e.p[1]+e.n[1]*dt*60,pz=e.p[2]+e.n[2]*dt*60;
    const rnd=C.rng(Math.round(e.seed*1e6));
    for(let i=0;i<3;i++){
      const sp=60+rnd()*160;
      const a=rnd()*Math.PI*2;
      const vx=Math.cos(a)*sp,vy=Math.sin(a)*sp-40,vz=(rnd()-0.5)*sp*0.5;
      const qx=px+vx*dt,qy=py+vy*dt+0.5*g*dt*dt,qz=pz+vz*dt;
      const w=C.m4transformPoint(m,qx,qy,qz);
      out.quads.push({x:w.x,y:w.y,z:w.z,size:e.size*(1-u)*0.9,
        color:[1,0.75,0.35],alpha:(1-u)*0.9});
    }
  }
  return out;
};
function gravOf(pt,ctx){
  return A.evalNum(pt.grav,ctx.time,ctx);
}
/* 粒子绘制 */
S.renderParticles=function(layer,comp,t,scene,opt){
  const gl=APP.render.gl;
  const data=S.particleRenderData(layer,comp,t);
  if(!data.quads.length&&!data.trails.length)return;
  const view=APP.render._view;
  // 主粒子: 相机面向四边形
  const pr=APP.render.prog.part;
  APP.render.bindFBO(gl,scene,true);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE,gl.ONE); // 叠加发光
  gl.disable(gl.DEPTH_TEST);
  const n=data.quads.length;
  if(n){
    const arr=new Float32Array(n*6*3);   // corner, pos, color+size
    let o=0;
    const corners=[[-1,-1],[1,-1],[-1,1],[1,-1],[1,1],[-1,1]];
    for(const q of data.quads){
      for(const c of corners){
        arr[o++]=c[0];arr[o++]=c[1];arr[o++]=0;
        arr[o++]=q.x;arr[o++]=q.y;arr[o++]=q.z;
        arr[o++]=q.color[0];arr[o++]=q.color[1];arr[o++]=q.color[2];arr[o++]=q.alpha;
        arr[o++]=q.size;arr[o++]=q.size;
      }
    }
    let buf=S._pbuf;
    if(!buf||buf.length<n*6*18){buf=S._pbuf=gl.createBuffer();S._pbufN=n;}
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW);
    gl.useProgram(pr.p);
    const stride=18*4;
    gl.enableVertexAttribArray(pr.a.aCorner);gl.vertexAttribPointer(pr.a.aCorner,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(pr.a.aPos);gl.vertexAttribPointer(pr.a.aPos,3,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(pr.a.aColor);gl.vertexAttribPointer(pr.a.aColor,4,gl.FLOAT,false,stride,24);
    gl.enableVertexAttribArray(pr.a.aSize);gl.vertexAttribPointer(pr.a.aSize,2,gl.FLOAT,false,stride,40);
    gl.uniformMatrix4fv(pr.u.uProj,false,view.proj);
    gl.uniformMatrix4fv(pr.u.uView,false,view.view);
    gl.drawArrays(gl.TRIANGLES,0,n*6);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
};

/* ================= 程序节点 ================= */
S.NODE_DEFS={
  'source':{title:'源几何',inputs:[],outputs:[{name:'geo',type:'geometry'}]},
  'rect':{title:'矩形',inputs:[{name:'w',type:'scalar',def:200},{name:'h',type:'scalar',def:140}],outputs:[{name:'geo',type:'geometry'}]},
  'ellipse':{title:'椭圆',inputs:[{name:'rx',type:'scalar',def:120},{name:'ry',type:'scalar',def:120}],outputs:[{name:'geo',type:'geometry'}]},
  'star':{title:'星形',inputs:[{name:'R',type:'scalar',def:120},{name:'n',type:'scalar',def:5}],outputs:[{name:'geo',type:'geometry'}]},
  'text':{title:'文字',inputs:[{name:'str',type:'string',def:'金'}],outputs:[{name:'geo',type:'geometry'}]},
  'transform':{title:'变换',inputs:[{name:'geo',type:'geometry'},{name:'x',type:'scalar',def:0},{name:'y',type:'scalar',def:0},
    {name:'rot',type:'scalar',def:0},{name:'scale',type:'scalar',def:100}],outputs:[{name:'geo',type:'geometry'}]},
  'distribute':{title:'分布',inputs:[{name:'geo',type:'geometry'},{name:'count',type:'scalar',def:3},
    {name:'dx',type:'scalar',def:100},{name:'dy',type:'scalar',def:0},{name:'scale',type:'scalar',def:100}],outputs:[{name:'geo',type:'geometry'}]},
  'merge':{title:'合并',inputs:[{name:'a',type:'geometry'},{name:'b',type:'geometry'},
    {name:'mode',type:'scalar',def:0}],outputs:[{name:'geo',type:'geometry'}]},
  'trim':{title:'修剪',inputs:[{name:'geo',type:'geometry'},{name:'start',type:'scalar',def:0},{name:'end',type:'scalar',def:100}],outputs:[{name:'geo',type:'geometry'}]},
  'field':{title:'场',inputs:[{name:'strength',type:'scalar',def:1},{name:'radius',type:'scalar',def:300}],outputs:[{name:'field',type:'field'}]},
  'deform':{title:'变形',inputs:[{name:'geo',type:'geometry'},{name:'field',type:'field'},{name:'amount',type:'scalar',def:30}],outputs:[{name:'geo',type:'geometry'}]},
  'extrude':{title:'挤出',inputs:[{name:'geo',type:'geometry'},{name:'depth',type:'scalar',def:60}],outputs:[{name:'mesh',type:'geometry'}]},
  'display':{title:'显示输出',inputs:[{name:'geo',type:'geometry'}],outputs:[]},
  'emitter':{title:'发射器',inputs:[{name:'geo',type:'geometry'}],outputs:[]},
  'group':{title:'节点组',inputs:[],outputs:[]}
};
S.newNode=function(type,x,y){
  const def=S.NODE_DEFS[type]||{title:type,inputs:[],outputs:[]};
  const n={id:C.uid('N'),type,x:x||0,y:y||0,title:def.title,
    inputs:def.inputs.map(i=>({name:i.name,type:i.type,value:i.def!==undefined?i.def:0,link:null})),
    outputs:def.outputs.map(o=>({name:o.name,type:o.type})),
    params:{}};
  if(type==='source')n.params.layerId=null;
  if(type==='text')n.params.str='金';
  if(type==='group'){n.params.sub={nodes:[],links:[]};n.params.exposed=[];}
  return n;
};
/* 求值节点图 */
S.evalNodeGraph=function(graph,comp,t,ctx){
  const cache=new Map();
  const visiting=new Set();
  function val(nodeId,portName){
    const key=nodeId+':'+portName;
    if(cache.has(key))return cache.get(key);
    const node=graph.nodes.find(n=>n.id===nodeId);
    if(!node)return null;
    if(visiting.has(nodeId))throw new Error('节点图存在循环连接');
    visiting.add(nodeId);
    let r=null;
    try{r=compute(node);}catch(e){r=null;if(APP.app)APP.app.lastNodeError=e.message;}
    visiting.delete(nodeId);
    cache.set(key,r);
    return r;
  }
  function inVal(node,name){
    const port=node.inputs.find(i=>i.name===name);
    if(port&&port.link){
      const link=graph.links.find(l=>l.id===port.link);
      if(link)return val(link.from,link.fromPort);
    }
    if(port&&port.type==='geometry')return null;
    return port?port.value:0;
  }
  function geoOf(v){
    if(!v)return {contours:[]};
    if(v.contours)return v;
    if(v.mesh)return {contours:[],mesh:v.mesh};
    return {contours:[]};
  }
  function compute(node){
    const c={comp,time:t,layer:ctx&&ctx.layer};
    switch(node.type){
      case 'rect':return {contours:[CT.rectPath(inVal(node,'w'),inVal(node,'h')).contours[0].pts]};
      case 'ellipse':return {contours:[CT.ellipsePath(inVal(node,'rx'),inVal(node,'ry')).contours[0].pts]};
      case 'star':return {contours:[CT.starPath(inVal(node,'R'),Math.max(3,Math.round(inVal(node,'n')))).contours[0].pts]};
      case 'text':{
        const str=node.params.str||'金';
        const size=100;
        let all=[];
        let x=-(str.length-1)*size*0.55;
        for(const ch of str){
          const g=APP.font.glyph(ch);
          for(const cc of g.contours)all.push(cc.map(p=>({x:x+p.x*size/1000,y:p.y*size/1000})));
          x+=size*0.62;
        }
        return {contours:all};
      }
      case 'source':{
        const l=comp.layers.find(l=>l.id===node.params.layerId);
        if(!l)return {contours:[]};
        try{return {contours:CT.geoContours(l,comp,t)};}catch(e){return {contours:[]};}
      }
      case 'transform':{
        const g=geoOf(inVal(node,'geo'));
        const x=inVal(node,'x'),y=inVal(node,'y'),rot=inVal(node,'rot'),sc=inVal(node,'scale')/100;
        return {contours:g.contours.map(ring=>ring.map(p=>{
          const px=p.x*sc,py=p.y*sc;
          const a=rot*Math.PI/180;
          return {x:px*Math.cos(a)-py*Math.sin(a)+x,y:px*Math.sin(a)+py*Math.cos(a)+y};
        }))};
      }
      case 'distribute':{
        const g=geoOf(inVal(node,'geo'));
        const n=Math.max(1,Math.round(inVal(node,'count')));
        const dx=inVal(node,'dx'),dy=inVal(node,'dy'),sc=inVal(node,'scale')/100;
        const out=[];
        for(let i=0;i<n;i++){
          for(const ring of g.contours)out.push(ring.map(p=>({x:p.x*Math.pow(sc,i)+dx*i,y:p.y*Math.pow(sc,i)+dy*i})));
        }
        return {contours:out};
      }
      case 'merge':{
        const a=geoOf(inVal(node,'a')),b=geoOf(inVal(node,'b'));
        const mode=Math.round(inVal(node,'mode'));
        if(!a.contours.length)return b;
        if(!b.contours.length)return a;
        let acc=a.contours[0];
        for(let i=1;i<a.contours.length;i++)acc=G.unionContours(acc,a.contours[i]);
        for(const ring of b.contours){
          acc=mode===1?G.subtractContours(acc,ring):mode===2?G.intersectContours(acc,ring):G.unionContours(acc,ring);
        }
        return {contours:acc};
      }
      case 'trim':{
        const g=geoOf(inVal(node,'geo'));
        const s=inVal(node,'start'),e=inVal(node,'end');
        const out=[];
        for(const ring of g.contours){
          const r=CT.trimContour(ring.map(p=>({x:p.x,y:p.y})),true,s,e,0);
          if(r.length>1)out.push(r);
        }
        return {contours:out};
      }
      case 'field':{
        return {field:{strength:inVal(node,'strength'),radius:inVal(node,'radius'),type:'distance'}};
      }
      case 'deform':{
        const g=geoOf(inVal(node,'geo'));
        const f=inVal(node,'field');
        const amt=inVal(node,'amount');
        if(!f)return g;
        const out=g.contours.map(ring=>ring.map(p=>{
          const d=Math.hypot(p.x,p.y);
          const k=Math.max(0,1-d/Math.max(1,f.radius));
          const a=Math.atan2(p.y,p.x)+0.001;
          return {x:p.x+Math.cos(a)*amt*k*f.strength,y:p.y+Math.sin(a)*amt*k*f.strength};
        }));
        return {contours:out};
      }
      case 'extrude':{
        const g=geoOf(inVal(node,'geo'));
        if(!g.contours.length)return {mesh:null};
        const mesh=G.extrude(g.contours,{depth:inVal(node,'depth'),bevel:0});
        return {mesh,contours:g.contours};
      }
      default:return null;
    }
  }
  return {val,cache};
};
/* 图层通过节点图取几何 */
S.evalNodeGeometry=function(layer,comp,t){
  const comp2=P.comp(layer.node&&layer.node.compId)||comp;
  const graph=comp2.nodeGraph;
  if(!graph||!graph.nodes.length)return null;
  const ctx=S.evalNodeGraph(graph,comp2,t,{layer});
  // 找 display / extrude 输出
  for(const n of graph.nodes){
    if(n.type==='extrude'){
      const r=ctx.val(n.id,'geo');
      if(r&&r.mesh)return {mesh:r.mesh,contours:r.contours};
    }
    if(n.type==='display'){
      const port=n.inputs[0];
      if(port&&port.link){
        const link=graph.links.find(l=>l.id===port.link);
        if(link){const r=ctx.val(link.from,link.fromPort);if(r)return geo(r);}
      }
    }
  }
  return null;
  function geo(r){
    if(r.contours)return {contours:r.contours};
    if(r.mesh)return {mesh:r.mesh,contours:[]};
    return {contours:[]};
  }
};
APP.sim=S;
})();
