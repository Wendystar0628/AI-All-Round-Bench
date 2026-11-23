(function(){
'use strict';
const VE=window.VE, M4=VE.M4, MODELS=window.MODELS, VOX=window.VOX;
const gl=VE.gl;

const DURATION=84.0;
const FLEET_STEP=6000;
const INTERIOR_OFFSET={
  bridge:[-9000,0,0],
  core:[9000,0,0],
  hangar:[0,-9000,0],
  corridor:[0,9000,0]
};

let models=null;
let ships=[];
let shuttles=[];
let asteroids=[];
let coreRings=[];
let bridgeOutside=[];
let missileModel=null;
let shuttleModel=null;

let frame={ships:[], shuttles:[], missiles:[], flagship:null, bridgeOutside:[]};

/* ------------------------------------------------------------------ */
/* small math                                                          */
/* ------------------------------------------------------------------ */
function clamp(x,a,b){ return x<a?a:(x>b?b:x); }
function smoothstep(a,b,x){ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); }
function lerp(a,b,t){ return a+(b-a)*t; }
function lerp3(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function sub(a,b){ return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
function add(a,b){ return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]; }
function len(a){ return Math.hypot(a[0],a[1],a[2]); }
function norm(a){ const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; }
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function bezier(p0,p1,p2,u){ const v=1-u; return [v*v*p0[0]+2*v*u*p1[0]+u*u*p2[0], v*v*p0[1]+2*v*u*p1[1]+u*u*p2[1], v*v*p0[2]+2*v*u*p1[2]+u*u*p2[2]]; }
function bezierD(p0,p1,p2,u){ const v=1-u; return [2*v*(p1[0]-p0[0])+2*u*(p2[0]-p1[0]), 2*v*(p1[1]-p0[1])+2*u*(p2[1]-p1[1]), 2*v*(p1[2]-p0[2])+2*u*(p2[2]-p1[2])]; }
function orientZ(pos,dir,sx,sy,sz){
  const d=norm(dir);
  const up=Math.abs(d[1])>0.95?[1,0,0]:[0,1,0];
  const right=norm(cross(up,d));
  const up2=cross(d,right);
  return new Float32Array([
    right[0]*sx,right[1]*sx,right[2]*sx,0,
    up2[0]*sy,up2[1]*sy,up2[2]*sy,0,
    d[0]*sz,d[1]*sz,d[2]*sz,0,
    pos[0],pos[1],pos[2],1
  ]);
}
function pushSprite(p,c,a,s,rot){ VE.state.sprites.push({p,c,a,s,rot:rot||0}); }
function pushStreak(o){ VE.state.streaks.push(o); }
function astNear(ast,cycle){ return [ast.pos[0],ast.pos[1],ast.pos[2]+cycle*FLEET_STEP-ast.radius*0.82]; }

/* ------------------------------------------------------------------ */
/* camera                                                              */
/* ------------------------------------------------------------------ */
const CAM_KEYS=[
  {t:0,    space:'ext',      pos:[-560,80,1520], tgt:[0,60,1000],    cut:true},
  {t:3.5,  space:'ext',      pos:[-320,80,1250], tgt:[0,60,850]},
  {t:7,    space:'ext',      pos:[-120,120,1050],tgt:[0,60,650]},
  {t:10.5, space:'ext',      pos:[220,90,800],   tgt:[0,40,450]},
  {t:14.5, space:'ext',      pos:[340,100,350],  tgt:[0,30,0]},
  {t:18,   space:'ext',      pos:[420,200,-500], tgt:[0,30,0]},
  {t:18,   space:'bridge',   pos:[48,38,118],    tgt:[-8,18,42],     cut:true},
  {t:22,   space:'bridge',   pos:[-48,36,112],   tgt:[8,18,45]},
  {t:26,   space:'bridge',   pos:[-20,32,122],   tgt:[0,26,320]},
  {t:28,   space:'bridge',   pos:[0,34,110],     tgt:[0,30,620]},
  {t:28,   space:'core',     pos:[100,45,55],    tgt:[0,45,0],       cut:true},
  {t:31,   space:'core',     pos:[95,95,45],     tgt:[0,95,0]},
  {t:34,   space:'core',     pos:[100,145,-30],  tgt:[0,145,0]},
  {t:37,   space:'core',     pos:[85,195,35],    tgt:[0,195,0]},
  {t:38,   space:'core',     pos:[60,235,10],    tgt:[0,235,0]},
  {t:38,   space:'hangar',   pos:[0,36,20],      tgt:[0,30,300],     cut:true},
  {t:41,   space:'hangar',   pos:[0,34,100],     tgt:[0,28,340]},
  {t:44,   space:'hangar',   pos:[0,32,200],     tgt:[0,30,360]},
  {t:47,   space:'hangar',   pos:[0,36,300],     tgt:[0,34,420]},
  {t:47,   space:'corridor', pos:[0,35,20],     tgt:[0,35,200],     cut:true},
  {t:50,   space:'corridor', pos:[0,36,100],    tgt:[0,36,280]},
  {t:53,   space:'corridor', pos:[0,38,220],    tgt:[0,36,380]},
  {t:56,   space:'corridor', pos:[0,40,330],    tgt:[0,40,520]},
  {t:56,   space:'ext',      pos:[300,240,700], tgt:[100,80,1400],  cut:true},
  {t:59,   space:'ext',      pos:[-180,170,1020],tgt:[120,80,1450]},
  {t:62,   space:'ext',      pos:[-250,180,1000],tgt:[140,80,1450]},
  {t:65,   space:'ext',      pos:[-220,170,980],tgt:[80,80,1450]},
  {t:66.5, space:'ext',      pos:[-400,250,800],tgt:[-150,150,520], cut:true},
  {t:68,   space:'ext',      pos:[400,300,0],   tgt:[-300,50,1200], cut:true},
  {t:70,   space:'ext',      pos:[-260,60,950], tgt:[150,120,1400], cut:true},
  {t:73,   space:'ext',      pos:[-420,100,900],tgt:[-100,100,1850]},
  {t:76,   space:'ext',      pos:[-600,280,1150],tgt:[0,60,400]},
  {t:80,   space:'ext',      pos:[700,340,1550],tgt:[0,40,250]},
  {t:84,   space:'ext',      pos:[420,190,1250],tgt:[0,50,600]}
];

function catmull(p0,p1,p2,p3,u){
  const u2=u*u,u3=u2*u;
  const f=(a,b,c,d)=>0.5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u2+(-a+3*b-3*c+d)*u3);
  return [f(p0[0],p1[0],p2[0],p3[0]), f(p0[1],p1[1],p2[1],p3[1]), f(p0[2],p1[2],p2[2],p3[2])];
}

function makeCamera(pos,tgt,up,fov,near,far){
  const view=M4.lookAt(pos,tgt,up);
  const aspect=VE.size.w/Math.max(1,VE.size.h);
  const proj=M4.perspective(fov*Math.PI/180,aspect,near,far);
  const vp=M4.mul(proj,view);
  const invVP=M4.invert(vp);
  const right=[view[0],view[4],view[8]];
  const upv=[view[1],view[5],view[9]];
  return {pos,target:tgt,view,proj,vp,invVP,right,up:upv,fov};
}

function getCamera(t,cycle,advance){
  let i=0;
  for(let k=0;k<CAM_KEYS.length-1;k++){
    if(t>=CAM_KEYS[k].t && t<CAM_KEYS[k+1].t){ i=k; break; }
    if(k===CAM_KEYS.length-2) i=k;
  }
  const k0=CAM_KEYS[i], k1=CAM_KEYS[i+1];
  const u=clamp((t-k0.t)/Math.max(0.0001,k1.t-k0.t),0,1);
  const p0=k0.cut?k0:CAM_KEYS[Math.max(0,i-1)];
  const p1=k0;
  const p2=k1;
  const p3=(i+2<CAM_KEYS.length && !k1.cut)?CAM_KEYS[i+2]:k1;
  let pos=catmull(p0.pos,p1.pos,p2.pos,p3.pos,u);
  let tgt=catmull(p0.tgt,p1.tgt,p2.tgt,p3.tgt,u);
  const space=k0.space;
  if(space==='ext'){
    pos=[pos[0],pos[1],pos[2]+cycle*FLEET_STEP+advance];
    tgt=[tgt[0],tgt[1],tgt[2]+cycle*FLEET_STEP+advance];
    return Object.assign(makeCamera(pos,tgt,[0,1,0],55,1.0,40000),{space});
  }
  const off=INTERIOR_OFFSET[space];
  pos=[pos[0]+off[0],pos[1]+off[1],pos[2]+off[2]];
  tgt=[tgt[0]+off[0],tgt[1]+off[1],tgt[2]+off[2]];
  return Object.assign(makeCamera(pos,tgt,[0,1,0],62,0.5,40000),{space});
}

/* ------------------------------------------------------------------ */
/* ship states                                                         */
/* ------------------------------------------------------------------ */
function getShipState(s,t,cycle,advance){
  let spread=1;
  if(t>54) spread=1+0.30*smoothstep(54,58,t)-0.30*smoothstep(76,80,t);
  const bx=s.base[0]*spread, by=s.base[1]*spread;
  const isFlag=s.kind==='flagship';
  const bobX=isFlag?0:Math.sin(t*0.21+s.phase)*3;
  const bobY=isFlag?Math.sin(t*0.13)*1.5:Math.sin(t*0.17+s.phase*1.7)*2.5;
  const yaw=s.yaw+Math.sin(t*0.12+s.phase)*0.015;
  const roll=Math.sin(t*0.09+s.phase)*0.008;
  return {pos:[bx+bobX, by+bobY, s.base[2]+advance+cycle*FLEET_STEP], yaw, pitch:0, roll};
}

function getShuttleState(sh,t,cycle,advance){
  const ang=sh.phase+t*sh.speed;
  const x=sh.center[0]+Math.cos(ang)*sh.radius;
  const z=sh.center[2]+Math.sin(ang)*sh.radius*1.35;
  const y=sh.center[1]+Math.sin(ang*1.7+sh.phase)*sh.height;
  const dx=-Math.sin(ang)*sh.radius*sh.speed;
  const dz=Math.cos(ang)*sh.radius*1.35*sh.speed;
  const yaw=Math.atan2(dx,dz);
  return {pos:[x,y,z+advance+cycle*FLEET_STEP], yaw, pitch:Math.sin(ang*2)*0.05, roll:Math.cos(ang*1.5)*0.08};
}

/* ------------------------------------------------------------------ */
/* init                                                                */
/* ------------------------------------------------------------------ */
function init(){
  const flagship=MODELS.buildFlagship();
  const guards=[MODELS.buildGuard(0),MODELS.buildGuard(1)];
  const vanguards=[MODELS.buildVanguard(0),MODELS.buildVanguard(1)];
  shuttleModel=MODELS.buildShuttle();
  missileModel=MODELS.buildMissile();
  models={
    flagship, guards, vanguards,
    bridge:MODELS.buildBridge(),
    core:MODELS.buildCore(),
    hangar:MODELS.buildHangar(),
    corridor:MODELS.buildCorridor()
  };
  coreRings=[
    {mesh:MODELS.buildCoreRing(36,5,64), y:58, speed:0.55, tilt:[0.10,0,0.05], phase:0.0},
    {mesh:MODELS.buildCoreRing(44,4,72), y:128, speed:-0.38, tilt:[-0.07,0,0.10], phase:1.3},
    {mesh:MODELS.buildCoreRing(31,4,56), y:190, speed:0.68, tilt:[0.06,0,-0.05], phase:2.1}
  ];
  asteroids=MODELS.buildAsteroidField();
  // dust / debris data
  for(const ast of asteroids){
    ast.dust=[]; ast.debris=[];
    if(ast.hit>=0){
      const rnd=VOX.mulberry32(ast.seed*77+5);
      for(let i=0;i<60;i++){
        const a=rnd()*Math.PI*2, r=ast.radius*(0.25+0.75*rnd());
        const init=[Math.cos(a)*r,(rnd()-0.5)*ast.radius,Math.sin(a)*r];
        const sp=8+rnd()*32;
        const vel=[Math.cos(a)*sp,(rnd()-0.5)*sp,Math.sin(a)*sp];
        ast.dust.push({init,vel,size:1.5+rnd()*5,c:[0.95,0.55,0.25],a:0.45+rnd()*0.5});
      }
      for(let i=0;i<18;i++){
        const a=rnd()*Math.PI*2, r=ast.radius*(0.2+0.6*rnd());
        const init=[Math.cos(a)*r,(rnd()-0.5)*ast.radius,Math.sin(a)*r];
        const vel=[Math.cos(a)*(10+rnd()*22),(rnd()-0.5)*22,Math.sin(a)*(10+rnd()*22)];
        ast.debris.push({init,vel,size:1+rnd()*3,rot:[rnd()*6,rnd()*6,rnd()*6],spin:[rnd()*2,rnd()*2,rnd()*2]});
      }
    }
  }
  buildFormation();
  buildShuttles();
  bridgeOutside=[
    {model:guards[0], pos:[-120,30,380], yaw:0.22, scale:1, phase:0.2},
    {model:vanguards[0], pos:[180,60,600], yaw:-0.30, scale:1, phase:1.4},
    {model:guards[1], pos:[40,-20,900], yaw:0.10, scale:1, phase:2.5}
  ];
  resizeDone=true;
}

let resizeDone=false;

function buildFormation(){
  ships=[];
  ships.push({kind:'flagship', model:models.flagship, base:[0,0,0], yaw:0, phase:0, scale:1});
  const guardPos=[];
  for(let i=0;i<4;i++){
    const z=-620+i*300;
    guardPos.push([-300-(i%2)*45,(i%3-1)*32,z]);
    guardPos.push([300+(i%2)*45,(i%3-1)*32,z]);
  }
  guardPos.push([-150,-70,-980],[150,70,-980],[-280,40,-1120],[280,-40,-1120],[0,-90,-1240]);
  guardPos.push([-220,85,780],[220,-85,780],[-340,30,900],[340,-30,900],[0,110,1020]);
  for(let i=0;i<guardPos.length;i++){
    ships.push({kind:'guard', model:models.guards[i%2], base:guardPos[i], yaw:(i%2?0.12:-0.12)+Math.sin(i)*0.05, phase:i*0.73, scale:1});
  }
  const vanPos=[];
  for(let i=0;i<4;i++){
    const z=900+i*190;
    vanPos.push([-380-(i%2)*80,(i%3-1)*45,z]);
    vanPos.push([380+(i%2)*80,(i%3-1)*45,z]);
  }
  vanPos.push([-560,20,400],[560,-20,400],[-650,60,700],[650,-60,700],[-520,-60,-700]);
  vanPos.push([520,60,-700],[-600,80,-1000],[600,-80,-1000],[-700,0,-1300],[700,0,-1300]);
  for(let i=0;i<vanPos.length;i++){
    ships.push({kind:'vanguard', model:models.vanguards[i%2], base:vanPos[i], yaw:(i%2?-0.10:0.10)+Math.cos(i)*0.06, phase:i*0.91+1.3, scale:1});
  }
}

function buildShuttles(){
  shuttles=[
    {center:[-350,60,850], radius:120, speed:0.40, phase:0.25, height:18, scale:1},
    {center:[380,120,500], radius:140, speed:-0.28, phase:2.2, height:26, scale:1},
    {center:[0,190,760], radius:520, speed:0.13, phase:1.1, height:40, scale:1},
    {center:[-300,40,300], radius:170, speed:0.22, phase:3.4, height:22, scale:1},
    {center:[320,-60,420], radius:190, speed:-0.20, phase:4.1, height:18, scale:1},
    {center:[0,-90,620], radius:430, speed:0.16, phase:5.2, height:20, scale:1},
    {center:[440,70,220], radius:150, speed:0.26, phase:2.8, height:24, scale:1},
    {center:[-440,-20,720], radius:150, speed:-0.24, phase:0.9, height:16, scale:1},
    {center:[-450,80,1350], radius:120, speed:0.60, phase:0.0, height:15, scale:1},
    {center:[250,120,600], radius:100, speed:0.30, phase:1.7, height:18, scale:1}
  ];
}

/* ------------------------------------------------------------------ */
/* prepare frame                                                       */
/* ------------------------------------------------------------------ */
function prepareFrame(t,cycle,advance){
  frame.ships=[]; frame.shuttles=[]; frame.missiles=[]; frame.flagship=null; frame.bridgeOutside=[];
  for(const s of ships){
    const state=getShipState(s,t,cycle,advance);
    const model=M4.compose(state.pos,[state.pitch,state.yaw,state.roll],[s.scale,s.scale,s.scale]);
    const f={s,state,model};
    frame.ships.push(f);
    if(s.kind==='flagship') frame.flagship=f;
  }
  for(const sh of shuttles){
    const state=getShuttleState(sh,t,cycle,advance);
    const model=M4.compose(state.pos,[state.pitch,state.yaw,state.roll],[sh.scale,sh.scale,sh.scale]);
    frame.shuttles.push({sh,state,model});
  }
  frame.missiles=computeMissiles(t,cycle);
}

function computeMissiles(t,cycle){
  const out=[];
  const astD=asteroids.find(a=>a.name==='D');
  if(!astD) return out;
  const vs=frame.ships.filter(f=>f.s.kind==='vanguard' && f.s.base[0]<0).slice(0,6);
  for(let j=0;j<vs.length;j++){
    const f=vs[j];
    const side=f.s.base[0]<0?-1:1;
    const launch=72.2+j*0.32, dur=2.0;
    if(t<launch || t>launch+dur+0.8) continue;
    const start=M4.transformPoint(f.model,[side*58,22,82]);
    const near=astNear(astD,cycle);
    const target=[near[0]+Math.sin(j*2.1)*26, near[1]+Math.cos(j*1.7)*20, near[2]+Math.sin(j)*16];
    const ctrl=[(start[0]+target[0])/2+side*90, Math.max(start[1],target[1])+150, (start[2]+target[2])/2-110];
    if(t>=launch && t<=launch+dur){
      const u=(t-launch)/dur;
      const pos=bezier(start,ctrl,target,u);
      const vel=bezierD(start,ctrl,target,u);
      out.push({pos,vel,model:orientZ(pos,vel,1,1,1),u,start,ctrl,target,launch,dur,side});
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* draw opaque                                                         */
/* ------------------------------------------------------------------ */
function drawAsteroids(t,cycle){
  for(const ast of asteroids){
    const base=[ast.pos[0],ast.pos[1],ast.pos[2]+cycle*FLEET_STEP];
    const common=ast.baseRot+t*0.012;
    const dt=ast.hit>=0?t-ast.hit:-1;
    for(const ch of ast.chunks){
      let model;
      if(dt<=0){
        model=M4.mul(M4.translation(base),M4.mul(M4.rotY(common),M4.translation(ch.offset)));
      } else {
        const p=[ch.offset[0]+ch.vel[0]*dt, ch.offset[1]+ch.vel[1]*dt, ch.offset[2]+ch.vel[2]*dt];
        const rot=[ch.spin[0]*dt+ch.phase,ch.spin[1]*dt,ch.spin[2]*dt];
        model=M4.mul(M4.translation(base),M4.mul(M4.rotY(common),M4.mul(M4.translation(p),M4.compose([0,0,0],rot,null))));
      }
      VE.drawMesh(ch.mesh,model,[0.90,0.87,0.82],t);
    }
  }
}

function drawAsteroidDebris(t,cycle){
  for(const ast of asteroids){
    if(ast.hit<0) continue;
    const dt=t-ast.hit;
    if(dt<=0 || dt>8) continue;
    const base=[ast.pos[0],ast.pos[1],ast.pos[2]+cycle*FLEET_STEP];
    for(const d of ast.debris){
      const p=[base[0]+d.init[0]+d.vel[0]*dt, base[1]+d.init[1]+d.vel[1]*dt-0.30*dt*dt, base[2]+d.init[2]+d.vel[2]*dt];
      const rot=[d.rot[0]+d.spin[0]*dt,d.rot[1]+d.spin[1]*dt,d.rot[2]+d.spin[2]*dt];
      const m=M4.compose(p,rot,[d.size,d.size,d.size]);
      VE.drawMesh(VE.cubeMesh,m,[0.62,0.52,0.43],t);
    }
  }
}

function drawExterior(t,cycle,advance){
  for(const f of frame.ships){
    VE.drawMesh(f.s.model.mesh,f.model,[1,1,1],t);
  }
  for(const f of frame.shuttles){
    VE.drawMesh(shuttleModel.mesh,f.model,[1,1,1],t);
  }
  for(const m of frame.missiles){
    VE.drawMesh(missileModel.mesh,m.model,[1,1,1],t);
  }
  drawAsteroids(t,cycle);
  drawAsteroidDebris(t,cycle);
}

function drawInterior(space,t,cycle,advance){
  const off=INTERIOR_OFFSET[space];
  const base=M4.translation(off);
  if(space==='bridge'){
    VE.drawMesh(models.bridge.mesh,base,[1,1,1],t);
    frame.bridgeOutside=[];
    for(const bo of bridgeOutside){
      const m=M4.mul(M4.translation([off[0]+bo.pos[0],off[1]+bo.pos[1],off[2]+bo.pos[2]]),
                     M4.mul(M4.rotY(bo.yaw+Math.sin(t*0.1+bo.phase)*0.02),M4.scaling(bo.scale,bo.scale,bo.scale)));
      VE.drawMesh(bo.model.mesh,m,[1,1,1],t);
      frame.bridgeOutside.push({bo,model:m});
    }
  } else if(space==='core'){
    VE.drawMesh(models.core.mesh,base,[1,1,1],t);
    for(const r of coreRings){
      const m=M4.mul(M4.translation([off[0],off[1]+r.y,off[2]]),
                     M4.mul(M4.rotY(t*r.speed+r.phase),M4.rotX(r.tilt[0])));
      VE.drawMesh(r.mesh,m,[0.85,1.0,1.05],t);
    }
  } else if(space==='hangar'){
    VE.drawMesh(models.hangar.mesh,base,[1,1,1],t);
    const parked=[[-28,12,50],[28,12,130],[-28,12,210],[28,12,290]];
    for(const p of parked){
      const m=M4.mul(M4.translation([off[0]+p[0],off[1]+p[1],off[2]+p[2]]),M4.rotY(p[0]<0?0.05:Math.PI-0.05));
      VE.drawMesh(shuttleModel.mesh,m,[1,1,1],t);
    }
    const u=clamp((t-38)/9,0,1);
    const z1=300-u*280;
    const m1=M4.mul(M4.translation([off[0]-15,off[1]+28,off[2]+z1]),M4.rotY(Math.PI));
    VE.drawMesh(shuttleModel.mesh,m1,[1,1,1],t);
    const z2=20+u*230;
    const m2=M4.mul(M4.translation([off[0]+14,off[1]+42,off[2]+z2]),M4.rotY(0));
    VE.drawMesh(shuttleModel.mesh,m2,[1,1,1],t);
    frame.hangarShuttles=[{model:m1,phase:0.4},{model:m2,phase:1.7}];
  } else if(space==='corridor'){
    VE.drawMesh(models.corridor.mesh,base,[1,1,1],t);
    for(const z of [100,200,300]){
      const m=M4.mul(M4.translation([off[0],off[1]+35,off[2]+z]),
                     M4.mul(M4.rotY(t*0.45+z*0.013),M4.scaling(0.6,0.6,0.6)));
      VE.drawMesh(coreRings[2].mesh,m,[0.7,0.95,1.0],t);
    }
    for(let i=0;i<24;i++){
      const z=(t*20+i*17)%360;
      const x=(i%2?1:-1)*(18+(i%3)*5);
      const y=20+(i%2)*10;
      const m=M4.mul(M4.translation([off[0]+x,off[1]+y,off[2]+z]),
                     M4.mul(M4.rotY(t*1.5+i),M4.scaling(1.5,1.5,1.5)));
      VE.drawMesh(VE.cubeMesh,m,[0.30,0.90,1.0],t);
    }
  }
}

/* ------------------------------------------------------------------ */
/* additive                                                            */
/* ------------------------------------------------------------------ */
function addEngineTrails(model,nozzles,t,phase,kind){
  let boost=0;
  if(t>=78) boost=smoothstep(78,82,t);
  else if(t<5) boost=1-smoothstep(0,5,t);
  const baseLen=kind==='flagship'?250:(kind==='guard'?80:(kind==='vanguard'?105:22));
  const baseW=kind==='flagship'?34:(kind==='guard'?9:(kind==='vanguard'?11:3.5));
  const mult=kind==='flagship'?1.35:1.0;
  for(let i=0;i<nozzles.length;i++){
    const n=nozzles[i];
    const p=M4.transformPoint(model,n);
    const d=norm(M4.transformDir(model,[0,0,-1]));
    const ph=phase+i*0.37;
    const len=baseLen*(1+1.45*boost)*(0.92+0.08*Math.sin(t*2.6+ph));
    const w=baseW*(1+0.55*boost);
    const inten=(0.55+0.75*boost)*mult;
    pushStreak({p:[p[0]+d[0]*len*0.5,p[1]+d[1]*len*0.5,p[2]+d[2]*len*0.5],d,l:len,w,c:[0.30,0.80,1.0],a:inten*0.55});
    pushStreak({p:[p[0]+d[0]*len*0.24,p[1]+d[1]*len*0.24,p[2]+d[2]*len*0.24],d,l:len*0.48,w:w*0.42,c:[0.78,0.96,1.0],a:inten*0.85});
    pushSprite(p,[0.60,0.92,1.0],inten*1.1,[w*1.7,w*1.7],0);
    // sparks
    const side=norm(cross(d,[0,1,0]));
    for(let k=0;k<2;k++){
      const q=(t*0.9+ph*0.7+k*0.5)%1;
      const off=Math.sin(q*17+ph)*w*0.8;
      const sp=[p[0]+d[0]*len*q+side[0]*off, p[1]+d[1]*len*q+side[1]*off, p[2]+d[2]*len*q+side[2]*off];
      pushSprite(sp,[0.55,0.9,1.0],(1-q)*inten*0.55,[2.0,2.0],0);
    }
  }
}

function addBeam(t,cycle){
  const astA=asteroids.find(a=>a.name==='A');
  const f=frame.flagship;
  if(!astA || !f) return;
  const start=M4.transformPoint(f.model,f.s.model.beamOrigin);
  const end=astNear(astA,cycle);
  const charge=smoothstep(59.3,61.5,t);
  const fire=smoothstep(61.5,61.9,t)*(1-smoothstep(65.8,66.4,t));
  if(charge>0){
    for(let i=0;i<=6;i++){
      const wp=M4.transformPoint(f.model,[0,50,900+i*33]);
      pushSprite(wp,[0.35,0.85,1.0],charge*0.48*(0.35+0.65*i/6),[11+charge*10,11+charge*10],0);
    }
    pushSprite(start,[0.65,0.96,1.0],charge*1.5,[18+charge*32,18+charge*32],0);
  }
  if(fire>0){
    const dir=norm(sub(end,start));
    const L=len(sub(end,start));
    VE.drawBeam(orientZ(start,dir,23,23,L),[0.14,0.52,0.90],0.22*fire,t);
    VE.drawBeam(orientZ(start,dir,13,13,L),[0.22,0.78,1.0],0.60*fire,t);
    VE.drawBeam(orientZ(start,dir,4.6,4.6,L),[0.85,0.99,1.0],1.25*fire,t);
    const pulse=0.72+0.28*Math.sin(t*18);
    pushSprite(end,[1.0,0.9,0.7],2.4*fire,[28+22*pulse,28+22*pulse],0);
    pushSprite(end,[0.45,0.90,1.0],1.8*fire,[48+26*pulse,48+26*pulse],0);
    for(let i=0;i<8;i++){
      const a=t*4.0+i*0.8;
      const off=[Math.cos(a)*18,Math.sin(a*1.3)*12,Math.sin(a)*18];
      pushSprite([end[0]+off[0],end[1]+off[1],end[2]+off[2]],[1.0,0.68,0.3],fire*0.85,[2.2,2.2],0);
    }
  }
}

function addPulse(t,cycle){
  const astB=asteroids.find(a=>a.name==='B');
  const f=frame.flagship;
  if(!astB || !f) return;
  const target=astNear(astB,cycle);
  const turrets=f.s.model.turrets;
  for(let j=0;j<turrets.length;j++){
    const tr=turrets[j];
    const start=M4.transformPoint(f.model,[tr[0],tr[1]+15,tr[2]+35]);
    for(let k=0;k<3;k++){
      const spawn=66.0+j*0.10+k*0.18;
      const travel=0.55;
      const tgt=[target[0]+Math.sin(j*3.1+k)*25, target[1]+Math.cos(j*2.3+k)*20, target[2]+Math.sin(j*1.7+k)*25];
      if(t>=spawn && t<=spawn+travel){
        const u=(t-spawn)/travel;
        const p=lerp3(start,tgt,u);
        const d=norm(sub(tgt,start));
        pushSprite(p,[1.0,0.72,0.32],1.3,[4.2,4.2],0);
        pushStreak({p,d,l:15,w:2.3,c:[1.0,0.65,0.25],a:0.9});
      }
      const imp=spawn+travel;
      if(t>=imp && t<=imp+0.35){
        const a=1-(t-imp)/0.35;
        pushSprite(tgt,[1.0,0.76,0.36],1.7*a,[10+32*(1-a),10+32*(1-a)],0);
      }
      if(t>=spawn && t<=spawn+0.12){
        pushSprite(start,[1.0,0.9,0.7],1.3,[8,8],0);
      }
    }
  }
}

function addCIWS(t,cycle){
  const astC=asteroids.find(a=>a.name==='C');
  if(!astC) return;
  const target=astNear(astC,cycle);
  const guards=frame.ships.filter(f=>f.s.kind==='guard' && f.s.base[0]<0 && f.s.base[2]>600).slice(0,4);
  for(let j=0;j<guards.length;j++){
    const g=guards[j];
    const start=M4.transformPoint(g.model,[0,78,80]);
    const base=69.0+j*0.10;
    for(let k=0;k<26;k++){
      const spawn=base+k/10;
      const travel=0.25;
      const tgt=[target[0]+Math.sin(k*1.7+j)*12, target[1]+Math.cos(k*2.1+j)*10, target[2]+Math.sin(k*2.7)*12];
      if(t>=spawn && t<=spawn+travel){
        const u=(t-spawn)/travel;
        const p=lerp3(start,tgt,u);
        const d=norm(sub(tgt,start));
        pushStreak({p,d,l:27,w:1.3,c:[1.0,0.70,0.30],a:0.95});
        pushSprite(p,[1.0,0.9,0.6],0.75,[1.8,1.8],0);
      }
      const imp=spawn+travel;
      if(t>=imp && t<=imp+0.20){
        const a=1-(t-imp)/0.20;
        pushSprite(tgt,[1.0,0.60,0.25],1.3*a,[4+12*(1-a),4+12*(1-a)],0);
      }
      if(t>=spawn && t<=spawn+0.06){
        pushSprite(start,[1.0,0.82,0.55],1.5,[5.5,5.5],0);
      }
    }
  }
}

function addMissileFX(t,cycle){
  for(const m of frame.missiles){
    for(let k=1;k<=5;k++){
      const u2=Math.max(0,m.u-k*0.02);
      const p2=bezier(m.start,m.ctrl,m.target,u2);
      const d=norm(sub(m.pos,p2));
      const L=len(sub(m.pos,p2));
      pushStreak({p:lerp3(p2,m.pos,0.5),d,l:L,w:2.8*(1-k/6),c:[1.0,0.55,0.20],a:0.8*(1-k/6)});
    }
    pushSprite(m.pos,[1.0,0.72,0.32],1.1,[4.5,4.5],0);
    const imp=m.launch+m.dur;
    if(t>=imp && t<=imp+1.0){
      const a=1-(t-imp)/1.0;
      pushSprite(m.target,[1.0,0.62,0.25],2.8*a,[32+85*(1-a),32+85*(1-a)],0);
      pushSprite(m.target,[1.0,0.9,0.7],2.2*a,[10+32*(1-a),10+32*(1-a)],0);
    }
  }
}

function addAsteroidFX(t,cycle){
  for(const ast of asteroids){
    if(ast.hit<0) continue;
    const dt=t-ast.hit;
    const base=astNear(ast,cycle);
    if(dt>=0 && dt<1.5){
      const a=1-dt/1.5;
      pushSprite(base,[1.0,0.86,0.62],3.2*a,[32+75*dt,32+75*dt],0);
      pushSprite(base,[0.55,0.90,1.0],1.9*a,[52+85*dt,52+85*dt],0);
    }
    if(dt>=0 && dt<8){
      for(const d of ast.dust){
        const p=[base[0]+d.init[0]+d.vel[0]*dt, base[1]+d.init[1]+d.vel[1]*dt-0.40*dt*dt, base[2]+d.init[2]+d.vel[2]*dt];
        const a=(1-dt/8)*d.a;
        pushSprite(p,d.c,a,[d.size*(1+dt*0.25),d.size*(1+dt*0.25)],0);
      }
    }
  }
}

function addShields(t){
  for(let i=0;i<frame.ships.length;i++){
    const f=frame.ships[i];
    const s=f.s;
    if(!s.model.shield) continue;
    let op=0, grow=1;
    if(t<5){ op=1-smoothstep(0,4.5,t); grow=1; }
    else if(t>76){
      const act=76.0+i*0.05;
      grow=smoothstep(act,act+0.7,t);
      op=grow;
    }
    if(op<=0.002) continue;
    const sc0=s.model.shield;
    const gs=0.72+0.28*grow;
    const sc=[sc0[0]*gs,sc0[1]*gs,sc0[2]*gs];
    const m=M4.mul(M4.translation(f.state.pos),
                   M4.mul(M4.rotY(f.state.yaw),
                   M4.mul(M4.translation(0,0,s.model.centerZ),
                   M4.scaling(sc[0],sc[1],sc[2]))));
    const nm=M4.normalMat(m);
    const col=s.kind==='flagship'?[0.35,0.90,1.0]:[0.24,0.78,1.0];
    VE.drawShield(m,nm,col,op*0.95,t);
  }
}

function drawExteriorAdditive(t,cycle,advance){
  for(const f of frame.ships){
    addEngineTrails(f.model,f.s.model.nozzles,t,f.s.phase,f.s.kind);
  }
  for(const f of frame.shuttles){
    addEngineTrails(f.model,shuttleModel.nozzles,t,f.sh.phase,'shuttle');
  }
  addBeam(t,cycle);
  addPulse(t,cycle);
  addCIWS(t,cycle);
  addMissileFX(t,cycle);
  addAsteroidFX(t,cycle);
  addShields(t);
  // a few foreground motes for parallax
  const rnd=VOX.mulberry32(9001);
  for(let i=0;i<28;i++){
    const ph=(t*0.12+i*0.137)%1;
    const p=[(rnd()-0.5)*900, (rnd()-0.5)*400, 200+ph*1200+cycle*FLEET_STEP];
    pushSprite(p,[0.55,0.75,0.9],0.16*(1-ph),[1.2,1.2],0);
  }
}

function drawInteriorAdditive(space,t,cycle,advance){
  const off=INTERIOR_OFFSET[space];
  if(space==='bridge'){
    // holo fleet
    for(let i=0;i<28;i++){
      const a=i*2.399+t*0.45;
      const r=7+(i%5)*3.5;
      const p=[off[0]+Math.cos(a)*r, 22+(i%4)*3.2+Math.sin(t*2+i)*1.2, off[2]+50+Math.sin(a)*r];
      pushSprite(p,(i%3===0)?[1.0,0.65,0.30]:[0.30,0.85,1.0],0.85,[1.6,1.6],0);
    }
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2+t*0.2;
      pushStreak({p:[off[0],18,off[2]+50],d:[Math.cos(a)*0.25,1,Math.sin(a)*0.25],l:22,w:1.2,c:[0.3,0.85,1.0],a:0.28});
    }
    pushSprite([off[0],30,off[2]+129],[0.45,0.70,1.0],0.42,[50,38],0);
    // outside ship engine glow
    for(const bo of frame.bridgeOutside){
      for(const n of bo.bo.model.nozzles){
        const p=M4.transformPoint(bo.model,n);
        const d=norm(M4.transformDir(bo.model,[0,0,-1]));
        pushSprite(p,[0.5,0.9,1.0],0.9,[10,10],0);
        pushStreak({p:[p[0]+d[0]*30,p[1]+d[1]*30,p[2]+d[2]*30],d,l:60,w:4,c:[0.3,0.8,1.0],a:0.45});
      }
    }
  } else if(space==='core'){
    pushSprite([off[0],130,off[2]],[0.55,0.95,1.0],0.85,[68,68],0);
    pushSprite([off[0],130,off[2]],[0.85,1.0,1.0],0.58,[30,30],0);
    for(let i=0;i<14;i++){
      const yy=20+i*16;
      pushSprite([off[0]+Math.sin(i*1.7+t*0.6)*10,off[1]+yy,off[2]+Math.cos(i*1.3+t*0.5)*10],[0.45,0.92,1.0],0.30,[16,26],0);
    }
    for(let i=0;i<26;i++){
      const a=i*2.1+t*0.8;
      const y=12+((t*26+i*11)%224);
      const r=28+Math.sin(i*1.7)*5;
      const p=[off[0]+Math.cos(a)*r,off[1]+y,off[2]+Math.sin(a)*r];
      pushSprite(p,[0.35,0.9,1.0],0.55,[2.5,2.5],0);
    }
    for(const y of [20,70,120,170,220]){
      pushStreak({p:[off[0]-95,off[1]+y+5,off[2]],d:[1,0,0],l:190,w:2.0,c:[0.3,0.8,1.0],a:0.18});
    }
  } else if(space==='hangar'){
    pushSprite([off[0],35,off[2]+362],[0.80,0.96,1.0],0.95,[70,55],0);
    pushSprite([off[0],35,off[2]+350],[0.45,0.85,1.0],0.55,[90,45],0);
    for(const z of [40,120,200,280]){
      pushSprite([off[0],72,off[2]+z],[0.4,0.85,1.0],0.35,[30,8],0);
    }
    for(const h of (frame.hangarShuttles||[])){
      for(const n of shuttleModel.nozzles){
        const p=M4.transformPoint(h.model,n);
        const d=norm(M4.transformDir(h.model,[0,0,-1]));
        pushSprite(p,[0.5,0.92,1.0],1.0,[6,6],0);
        pushStreak({p:[p[0]+d[0]*16,p[1]+d[1]*16,p[2]+d[2]*16],d,l:32,w:2.0,c:[0.35,0.85,1.0],a:0.6});
      }
    }
  } else if(space==='corridor'){
    pushSprite([off[0],38,off[2]+366],[0.85,0.98,1.0],1.0,[85,70],0);
    for(let i=0;i<18;i++){
      const z=(t*24+i*21)%360;
      pushStreak({p:[off[0]+(i%2?38:-38),off[1]+60,off[2]+z],d:[0,0,1],l:45,w:1.5,c:[0.3,0.85,1.0],a:0.28});
    }
    for(let i=0;i<20;i++){
      const z=(t*20+i*17)%360;
      const x=(i%2?1:-1)*(18+(i%3)*5);
      const y=20+(i%2)*10;
      pushSprite([off[0]+x,off[1]+y,off[2]+z],[0.4,0.9,1.0],0.45,[5,5],0);
    }
  }
}

/* ------------------------------------------------------------------ */
/* lights                                                              */
/* ------------------------------------------------------------------ */
function getExtLights(t,cycle,advance){
  const lights=[];
  const f=frame.flagship;
  if(f){
    if(t<56 || t>78){
      const stern=M4.transformPoint(f.model,[0,80,-8]);
      lights.push({p:stern,c:[0.30,0.80,1.0],i:2.2});
    }
    if(t<56 || t>78){
      const bow=M4.transformPoint(f.model,[0,110,760]);
      lights.push({p:bow,c:[0.42,0.62,0.85],i:2.4});
    }
  }
  if(t>56 && t<78){
    lights.push({p:[-350,190,1000+cycle*FLEET_STEP],c:[0.52,0.66,0.86],i:3.6});
    lights.push({p:[420,210,900+cycle*FLEET_STEP],c:[0.55,0.68,0.88],i:3.2});
  }
  const astA=asteroids.find(a=>a.name==='A');
  const astB=asteroids.find(a=>a.name==='B');
  const astC=asteroids.find(a=>a.name==='C');
  const astD=asteroids.find(a=>a.name==='D');
  if(astA && t>63.3 && t<66.5){
    lights.push({p:astNear(astA,cycle),c:[0.40,0.90,1.0],i:9*(1-smoothstep(66.0,66.5,t))});
  }
  if(astB && t>67.0 && t<69.5){
    lights.push({p:astNear(astB,cycle),c:[1.0,0.72,0.36],i:5});
  }
  if(astC && t>70.0 && t<72.5){
    lights.push({p:astNear(astC,cycle),c:[1.0,0.62,0.30],i:3.2});
  }
  if(astD && t>74.8 && t<77.5){
    lights.push({p:astNear(astD,cycle),c:[1.0,0.55,0.22],i:8*(1-smoothstep(76.5,77.5,t))});
  }
  if(t>56 && t<78){
    lights.push({p:[0,120,1250+cycle*FLEET_STEP],c:[0.55,0.68,0.86],i:4.2});
  }
  if(f){
    let op=0;
    if(t<5) op=1-smoothstep(0,4.5,t);
    else if(t>76) op=smoothstep(76.0,77.2,t);
    if(op>0.01) lights.push({p:f.state.pos,c:[0.30,0.85,1.0],i:3.5*op});
  }
  return lights.slice(0,8);
}

function getInteriorLights(space){
  const off=INTERIOR_OFFSET[space];
  if(space==='bridge') return [
    {p:[off[0],off[1]+26,off[2]+52],c:[0.30,0.82,1.0],i:2.2},
    {p:[off[0]-50,off[1]+22,off[2]+92],c:[1.0,0.60,0.30],i:1.6},
    {p:[off[0]+50,off[1]+22,off[2]+92],c:[0.30,0.82,1.0],i:1.6},
    {p:[off[0],off[1]+30,off[2]+128],c:[0.55,0.75,1.0],i:3.0},
    {p:[off[0],off[1]+46,off[2]+80],c:[1.0,0.72,0.42],i:1.8}
  ];
  if(space==='core') return [
    {p:[off[0],off[1]+130,off[2]],c:[0.30,0.90,1.0],i:7.0},
    {p:[off[0]+62,off[1]+80,off[2]],c:[1.0,0.60,0.30],i:2.6},
    {p:[off[0]-62,off[1]+180,off[2]],c:[0.30,0.82,1.0],i:2.6},
    {p:[off[0],off[1]+40,off[2]],c:[1.0,0.50,0.20],i:2.0}
  ];
  if(space==='hangar') return [
    {p:[off[0],off[1]+30,off[2]+100],c:[0.30,0.82,1.0],i:3.6},
    {p:[off[0],off[1]+30,off[2]+260],c:[1.0,0.60,0.30],i:2.8},
    {p:[off[0],off[1]+35,off[2]+360],c:[0.85,0.97,1.0],i:4.0},
    {p:[off[0],off[1]+30,off[2]+60],c:[0.40,0.80,1.0],i:2.2},
    {p:[off[0],off[1]+30,off[2]+180],c:[1.0,0.65,0.35],i:2.2},
    {p:[off[0],off[1]+30,off[2]+100],c:[0.40,0.80,1.0],i:2.0},
    {p:[off[0],off[1]+30,off[2]+300],c:[1.0,0.68,0.38],i:2.2}
  ];
  return [
    {p:[off[0],off[1]+30,off[2]+60],c:[0.30,0.82,1.0],i:3.2},
    {p:[off[0],off[1]+30,off[2]+180],c:[1.0,0.60,0.30],i:2.6},
    {p:[off[0],off[1]+30,off[2]+300],c:[0.30,0.82,1.0],i:3.2},
    {p:[off[0],off[1]+35,off[2]+366],c:[0.85,0.97,1.0],i:4.0},
    {p:[off[0],off[1]+30,off[2]+120],c:[0.40,0.80,1.0],i:2.0},
    {p:[off[0],off[1]+30,off[2]+240],c:[1.0,0.65,0.35],i:1.8}
  ];
}

function getSceneUniforms(space,t,cycle,advance){
  if(space==='ext'){
    return {
      lights:getExtLights(t,cycle,advance),
      fogColor:[0.005,0.010,0.022],
      fogDensity:0.00016,
      ambient:[0.20,0.23,0.28],
      lightDir:[-0.55,0.45,0.35],
      lightColor:[1.35,1.20,1.02]
    };
  }
  const base={
    fogColor:[0.005,0.011,0.022],
    fogDensity:0.0011,
    ambient:[0.18,0.20,0.24],
    lightDir:[0.15,0.35,0.95],
    lightColor:[0.42,0.50,0.60],
    lights:getInteriorLights(space)
  };
  if(space==='core'){ base.ambient=[0.22,0.26,0.32]; base.fogDensity=0.0009; }
  if(space==='hangar'){ base.ambient=[0.20,0.20,0.22]; base.lightDir=[0.2,0.6,0.8]; }
  if(space==='corridor'){ base.ambient=[0.16,0.17,0.20]; base.lightDir=[0.2,0.5,0.9]; }
  for(const l of base.lights) l.i*=0.58;
  return base;
}

/* ------------------------------------------------------------------ */
/* render                                                              */
/* ------------------------------------------------------------------ */
function renderAt(t,opts){
  opts=opts||{};
  let cycle=opts.cycle;
  if(cycle===undefined) cycle=Math.floor(t/DURATION);
  const local=t-cycle*DURATION;
  const advance=1300*Math.pow(smoothstep(78,84,local),2);
  const cam=getCamera(local,cycle,advance);
  const u=getSceneUniforms(cam.space,local,cycle,advance);
  if(cam.space!=='ext' && u.lights.length<8){ u.lights.push({p:cam.pos,c:[0.55,0.65,0.78],i:0.9}); }
  VE.setSceneUniforms(u);
  VE.setCamera(cam);
  VE.beginScene();
  VE.drawSky(local);
  if(cam.space==='ext') prepareFrame(local,cycle,advance);
  if(cam.space==='ext') drawExterior(local,cycle,advance);
  else drawInterior(cam.space,local,cycle,advance);
  // additive pass
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE,gl.ONE);
  gl.depthMask(false);
  if(cam.space==='ext') drawExteriorAdditive(local,cycle,advance);
  else drawInteriorAdditive(cam.space,local,cycle,advance);
  VE.endScene(local);
}

window.SCENE={
  init, renderAt,
  get duration(){ return DURATION; },
  get models(){ return models; },
  get frame(){ return frame; }
};
})();