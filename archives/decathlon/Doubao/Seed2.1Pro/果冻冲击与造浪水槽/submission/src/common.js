'use strict';
/* 公共工具：数学、确定性随机、缓动、共享常量 */

const V3 = (x=0,y=0,z=0)=> new THREE.Vector3(x,y,z);
const clamp = (x,a,b)=> x<a?a:(x>b?b:x);
const lerp = (a,b,t)=> a+(b-a)*t;
const smoothstep = (e0,e1,x)=>{ const t=clamp((x-e0)/(e1-e0),0,1); return t*t*(3-2*t); };
const G = 9.81;

function mulberry32(seed){
  let a = seed>>>0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a>>>15, 1 | a);
    t = t + Math.imul(t ^ t>>>7, 61 | t) ^ t;
    return ((t ^ t>>>14)>>>0) / 4294967296;
  };
}

const Ease = {
  linear: t=>t,
  smooth: t=> t*t*(3-2*t),
  inOut: t=> t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2,
  outCubic: t=> 1-Math.pow(1-t,3),
  inCubic: t=> t*t*t,
  outBack: t=>{ const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }
};

/* 关键帧镜头：轨道相机关键帧 [t, pos, target, fov, easeDur] */
class CamTrack {
  constructor(){ this.keys = []; }
  add(t, pos, target, fov=45){ this.keys.push({t,pos:pos.clone(),tgt:target.clone(),fov}); return this; }
  sample(time, out){
    const k=this.keys;
    if(time<=k[0].t){ out.pos.copy(k[0].pos); out.tgt.copy(k[0].tgt); out.fov=k[0].fov; return out; }
    for(let i=1;i<k.length;i++){
      if(time<=k[i].t){
        const a=k[i-1],b=k[i], u=Ease.inOut((time-a.t)/(b.t-a.t));
        out.pos.lerpVectors(a.pos,b.pos,u);
        out.tgt.lerpVectors(a.tgt,b.tgt,u);
        out.fov=lerp(a.fov,b.fov,u);
        return out;
      }
    }
    const e=k[k.length-1];
    out.pos.copy(e.pos); out.tgt.copy(e.tgt); out.fov=e.fov; return out;
  }
}

/* 统一环境贴图：程序化渐变 + 柔光箱，用于金属/玻璃反射 */
function makeEnvTexture(){
  const c=document.createElement('canvas'); c.width=256; c.height=128;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,128);
  g.addColorStop(0,'#9fc4e4'); g.addColorStop(0.42,'#3a5576'); g.addColorStop(0.5,'#243a58');
  g.addColorStop(0.52,'#182436'); g.addColorStop(1,'#0a0f18');
  ctx.fillStyle=g; ctx.fillRect(0,0,256,128);
  // 柔光箱
  ctx.fillStyle='rgba(255,255,255,.85)';
  ctx.fillRect(40,10,60,26); ctx.fillRect(150,16,44,18);
  ctx.fillStyle='rgba(180,220,255,.35)'; ctx.fillRect(0,54,256,3);
  const tex=new THREE.CanvasTexture(c);
  tex.mapping=THREE.EquirectangularReflectionMapping;
  tex.encoding=THREE.sRGBEncoding;
  return tex;
}

/* 后台径向渐变（挂在 scene.background 的平面用） */
function makeBackdropTexture(){
  const c=document.createElement('canvas'); c.width=16; c.height=512;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,0,512);
  g.addColorStop(0,'#101a2c'); g.addColorStop(0.45,'#0d1624'); g.addColorStop(0.75,'#0a111c'); g.addColorStop(1,'#070b12');
  ctx.fillStyle=g; ctx.fillRect(0,0,16,512);
  const tex=new THREE.CanvasTexture(c);
  tex.encoding=THREE.sRGBEncoding;
  return tex;
}

function makeSpotShadowTexture(){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(128,128,10,128,128,128);
  g.addColorStop(0,'rgba(0,0,0,.55)'); g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(c);
}

/* 简单碰撞球（刚体球）：重力积分 + 与平面/球的离散碰撞，由软体/流体场景共用思路 */
class RigidBall {
  constructor(radius, density, mat){
    this.r=radius;
    this.density=density; // kg/m3
    this.m = density * (4/3*Math.PI*radius*radius*radius);
    this.pos=new THREE.Vector3(); this.vel=new THREE.Vector3();
    this.ang=new THREE.Vector3();
    this.mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,40,28), mat);
    this.mesh.castShadow=this.mesh.receiveShadow=true;
    this.active=false;
    this.rest=0.28;
  }
  reset(p,v){ this.pos.copy(p); this.vel.copy(v||V3()); this.active=true; this.mesh.visible=true;
    this.mesh.position.copy(p); }
  hide(){ this.active=false; this.mesh.visible=false; }
  integrate(dt, groundY){
    if(!this.active) return;
    this.vel.y -= G*dt;
    this.pos.addScaledVector(this.vel,dt);
    if(this.pos.y-this.r < groundY){
      this.pos.y = groundY+this.r;
      if(this.vel.y<0){ this.vel.y=-this.vel.y*this.rest;
        this.vel.x*=0.82; this.vel.z*=0.82; }
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += this.ang.x*dt; this.mesh.rotation.z += this.ang.z*dt;
  }
}

window.APP = { clamp, lerp, smoothstep, mulberry32, Ease, CamTrack, V3,
  makeEnvTexture, makeBackdropTexture, makeSpotShadowTexture, G };
