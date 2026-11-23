'use strict';
/* WebGPU MPM（物质点法）水体求解的 WGSL 源码。
 * 弱可压流体 MLS-MPM + APIC 仿射动量；二次 B 样条核；
 * 网格累加使用定点原子（f32 原子不可移植）。
 * 造浪板、槽壁、远端斜坡与水下礁石为解析边界；刚球通过网格动量双向耦合。
 */

const TANK_WGSL = /* wgsl */`
struct Params {
  dt: f32,
  nx: f32, ny: f32, nz: f32,
  h: f32, invH: f32,
  gravity: f32, restDensity: f32,
  bulk: f32, visc: f32,
  px: f32, pvx: f32,
  waterX0: f32, waterX1: f32, waterY: f32, waterZ0: f32, waterZ1: f32,
  nballs: f32,
  rampStart: f32,
  reefX: f32, reefZ: f32, reefR: f32,
  ballDens0: f32, ballDens1: f32, ballDens2: f32, ballDens3: f32, ballDens4: f32,
  damping: f32
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read_write> gridM: array<i32>;
@group(0) @binding(2) var<storage, read_write> gridV: array<vec4<i32>>;
@group(0) @binding(3) var<storage, read_write> pPos: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> pVel: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> pC0: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> pC1: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> pC2: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> pJp: array<vec4<f32>>;
@group(0) @binding(9) var<storage, read_write> balls: array<vec4<f32>>;   // pos+r, vel+mass
@group(0) @binding(10) var<storage, read_write> ballForce: array<vec4<f32>>;
@group(0) @binding(11) var<storage, read_write> stats: array<u32>;

const QM: f32 = 65536.0;
const QV: f32 = 4096.0;
fn qm(x: f32)->i32 { return i32(x*QM + sign(x)*0.5); }
fn qv(x: f32)->i32 { return i32(x*QV + sign(x)*0.5); }

fn terrainY(x: f32, z: f32)->f32 {
  var ty = 0.0;
  let ramp = smoothstep(P.rampStart-0.05, P.rampStart+0.55, x);
  ty = ramp * clamp((x-P.rampStart)*0.95, 0.0, 0.95);
  let dx=(x-P.reefX)/P.reefR; let dz=(z-P.reefZ)/(P.reefR*0.85);
  let d2=dx*dx+dz*dz;
  if(d2<1.0){ let hh=0.42*sqrt(1.0-d2); if(hh>ty){ty=hh;} }
  return ty;
}

fn w1(t:f32)->f32{return 0.5*(1.5-t)*(1.5-t);}
fn w2(t:f32)->f32{return 0.75-(t-1.0)*(t-1.0);}
fn w3(t:f32)->f32{return 0.5*(t-0.5)*(t-0.5);}
fn wtOf(i:i32,t:f32)->f32{
  if(i==0){return w1(t);} if(i==1){return w2(t);} return w3(t);
}

/* ---------- 1) 清空网格 ---------- */
@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) gid: vec3<u32>){
  let n=i32(gid.x);
  let total=i32((P.nx+1.0)*(P.ny+1.0)*(P.nz+1.0));
  if(n>=total){return;}
  gridM[n]=0;
  gridV[n]=vec4<i32>(0,0,0,0);
}

/* ---------- 2) P2G ---------- */
@compute @workgroup_size(64)
fn p2g(@builtin(global_invocation_id) gid: vec3<u32>){
  let i=i32(gid.x);
  let ncount=arrayLength(&pPos);
  if(i>=ncount){return;}
  let pos=pPos[i].xyz;
  let vel=pVel[i].xyz;
  let Jp=clamp(pJp[i].x,0.5,1.6);

  let bf = floor(pos*P.invH - 0.5);
  let cell=vec3<i32>(i32(bf.x),i32(bf.y),i32(bf.z));
  let f = pos*P.invH - bf;

  let mp = P.restDensity * P.h*P.h*P.h;
  // 弱可压：压力沿静水项，对角刚度矩阵
  let pressure = P.bulk * (Jp - 1.0);
  let Kp = -4.0*P.dt*mp*pressure/Jp;
  let Kv = P.dt*mp*P.visc; // 粘性刚度量级
  let D = mat3x3<f32>(
    Kp,0.0,0.0,
    0.0,Kp,0.0,
    0.0,0.0,Kp
  );
  let C0=pC0[i].xyz; let C1=pC1[i].xyz; let C2=pC2[i].xyz;
  let ny1=i32(P.ny)+1; let nz1=i32(P.nz)+1;

  for(var ix=0; ix<3; ix++){
    for(var iy=0; iy<3; iy++){
      for(var iz=0; iz<3; iz++){
        let node=cell+vec3<i32>(ix,iy,iz);
        if(node.x<0||node.y<0||node.z<0||node.x>i32(P.nx)||node.y>i32(P.ny)||node.z>i32(P.nz)){continue;}
        let dpos=(vec3<f32>(f32(ix),f32(iy),f32(iz))-f)*P.h;
        let wt=wtOf(ix,f.x)*wtOf(iy,f.y)*wtOf(iz,f.z);
        let idx=(node.x*ny1+node.y)*nz1+node.z;
        var mv = vel + D*dpos;
        mv = mv + vec3<f32>(dot(C0,dpos),dot(C1,dpos),dot(C2,dpos));
        let imp = mp*wt;
        let mom = mv*imp;
        atomicAdd(&gridM[idx], qm(imp));
        atomicAdd(&gridV[idx].x, qv(mom.x));
        atomicAdd(&gridV[idx].y, qv(mom.y));
        atomicAdd(&gridV[idx].z, qv(mom.z));
      }
    }
  }
}

/* ---------- 3) 网格节点：重力、刚球双向耦合、边界 ---------- */
@compute @workgroup_size(64)
fn gridForces(@builtin(global_invocation_id) gid: vec3<u32>){
  let n=i32(gid.x);
  let total=i32((P.nx+1.0)*(P.ny+1.0)*(P.nz+1.0));
  if(n>=total){return;}
  let mq=gridM[n];
  if(mq<=0){return;}
  let nz1=i32(P.nz)+1; let ny1=i32(P.ny)+1;
  let nodeZ=n%nz1;
  let nodeY=(n/nz1)%ny1;
  let nodeX=n/(nz1*ny1);
  let pos=vec3<f32>(f32(nodeX),f32(nodeY),f32(nodeZ))*P.h;
  let m=f32(mq)/QM;
  var mv=vec3<f32>(f32(gridV[n].x)/QV,f32(gridV[n].y)/QV,f32(gridV[n].z)/QV);

  mv.y -= m*P.gravity*P.dt;

  let nb=i32(P.nballs);
  for(var b=0;b<8;b++){
    if(b>=nb){break;}
    let bp=balls[b*2].xyz; let br=balls[b*2].w;
    let bv=balls[b*2+1].xyz;
    let bm=balls[b*2+1].w;
    let rel=pos-bp;
    let d2=dot(rel,rel);
    let eff=br+P.h*0.55;
    if(d2<eff*eff && d2>1e-9){
      let d=sqrt(d2); let nrm=rel/d;
      let vf=mv/m;
      let rv=bv-vf;
      let vn=dot(rv,nrm);
      if(vn<0.0){
        let e=0.0;
        let wnode=1.0/m;
        let jimp=-(1.0+e)*vn/(wnode+1.0/bm);
        mv -= jimp*wnode*nrm;
        atomicAdd(&ballForce[b].x, jimp*nrm.x/P.dt);
        atomicAdd(&ballForce[b].y, jimp*nrm.y/P.dt);
        atomicAdd(&ballForce[b].z, jimp*nrm.z/P.dt);
      }
    }
  }

  var vv=mv/m;
  // 底/地形
  let ty=terrainY(pos.x,pos.z);
  if(pos.y<ty+P.h*0.5){
    if(vv.y<0.0){ vv.y=-vv.y*0.02; vv.x*=0.95; vv.z*=0.95; }
  }
  if(pos.z<P.h*0.5){if(vv.z<0.0){vv.z=-vv.z*0.02;vv.x*=0.95;}}
  if(pos.z>P.nz*P.h-P.h*0.5){if(vv.z>0.0){vv.z=-vv.z*0.02;vv.x*=0.95;}}
  if(pos.x>P.nx*P.h-P.h*0.5){if(vv.x>0.0){vv.x=-vv.x*0.1;vv.z*=0.95;}}
  // 造浪板
  if(pos.x<P.px+P.h*0.5 && pos.y<2.3){
    vv.x=max(vv.x,P.pvx);
  }
  if(pos.y>P.ny*P.h){if(vv.y>0.0){vv.y=0.0;}}
  // 微弱整体阻尼（造浪停止后平息）
  vv = vv*P.damping;

  mv=vv*m;
  gridV[n]=vec4<i32>(qv(mv.x),qv(mv.y),qv(mv.z),gridV[n].w);
}

/* ---------- 4) G2P + 平流 + 边界 ---------- */
@compute @workgroup_size(64)
fn g2p(@builtin(global_invocation_id) gid: vec3<u32>){
  let i=i32(gid.x);
  let ncount=arrayLength(&pPos);
  if(i>=ncount){return;}
  let pos=pPos[i].xyz;
  let bf=floor(pos*P.invH-0.5);
  let cell=vec3<i32>(i32(bf.x),i32(bf.y),i32(bf.z));
  let f=pos*P.invH-bf;
  let nz1=i32(P.nz)+1; let ny1=i32(P.ny)+1;

  var v=vec3<f32>(0.0);
  var Cx=vec3<f32>(0.0),Cy=vec3<f32>(0.0),Cz=vec3<f32>(0.0);
  for(var ix=0; ix<3; ix++){
    for(var iy=0; iy<3; iy++){
      for(var iz=0; iz<3; iz++){
        let node=cell+vec3<i32>(ix,iy,iz);
        if(node.x<0||node.y<0||node.z<0||node.x>i32(P.nx)||node.y>i32(P.ny)||node.z>i32(P.nz)){continue;}
        let idx=(node.x*ny1+node.y)*nz1+node.z;
        let mq=gridM[idx];
        if(mq<=0){continue;}
        let wt=wtOf(ix,f.x)*wtOf(iy,f.y)*wtOf(iz,f.z);
        let gv=vec3<f32>(f32(gridV[idx].x)/QV,f32(gridV[idx].y)/QV,f32(gridV[idx].z)/QV)/(f32(mq)/QM);
        v += gv*wt;
        let dpos=(vec3<f32>(f32(ix),f32(iy),f32(iz))-f)*P.h;
        Cx += gv.x*dpos*wt; Cy += gv.y*dpos*wt; Cz += gv.z*dpos*wt;
      }
    }
  }
  let inv=4.0/(P.h*P.h);
  pC0[i]=vec4<f32>(Cx*inv,0.0);
  pC1[i]=vec4<f32>(Cy*inv,0.0);
  pC2[i]=vec4<f32>(Cz*inv,0.0);

  let old=pVel[i].xyz;
  v = mix(old, v, 0.95);

  var newpos=pos+v*P.dt;
  let ty=terrainY(newpos.x,newpos.z);
  if(newpos.y<ty+P.h*0.55){ newpos.y=ty+P.h*0.55; if(v.y<0.0){v.y=0.0; v.x*=0.9;v.z*=0.9;} }
  if(newpos.z<P.h*0.55){newpos.z=P.h*0.55;if(v.z<0.0){v.z=0.0;v.x*=0.9;}}
  if(newpos.z>P.nz*P.h-P.h*0.55){newpos.z=P.nz*P.h-P.h*0.55;if(v.z>0.0){v.z=0.0;v.x*=0.9;}}
  if(newpos.x>P.nx*P.h-P.h*0.55){newpos.x=P.nx*P.h-P.h*0.55;if(v.x>0.0){v.x=0.0;v.z*=0.9;}}
  if(newpos.x<P.px+P.h*0.55 && newpos.y<2.3){ newpos.x=P.px+P.h*0.55; v.x=max(v.x,P.pvx); }
  if(newpos.y>P.ny*P.h-0.02){newpos.y=P.ny*P.h-0.02;if(v.y>0.0)v.y=0.0;}
  // 刚球推出
  let nb=i32(P.nballs);
  for(var b=0;b<8;b++){
    if(b>=nb){break;}
    let bp=balls[b*2].xyz; let br=balls[b*2].w;
    let rel=newpos-bp; let d2=dot(rel,rel);
    let rr=br+P.h*0.25;
    if(d2<rr*rr && d2>1e-9){
      let d=sqrt(d2); let nrm=rel/d;
      newpos=bp+nrm*rr;
      let rv=v-balls[b*2+1].xyz;
      if(dot(rv,nrm)<0.0){ v=v-(1.03)*dot(rv,nrm)*nrm; }
    }
  }

  pPos[i]=vec4<f32>(newpos,pPos[i].w);
  pVel[i]=vec4<f32>(v,0.0);
  // 体积比估计：粒子所在格质量密度 / 静止密度
  // 用网格质量近似更新（相邻节点平均）
  var dens=0.0; var dw=0.0;
  for(var ix=0; ix<3; ix++)for(var iy=0; iy<3; iy++)for(var iz=0; iz<3; iz++){
    let node=cell+vec3<i32>(ix,iy,iz);
    if(node.x<0||node.y<0||node.z<0||node.x>i32(P.nx)||node.y>i32(P.ny)||node.z>i32(P.nz)){continue;}
    let idx=(node.x*ny1+node.y)*nz1+node.z;
    let wt=wtOf(ix,f.x)*wtOf(iy,f.y)*wtOf(iz,f.z);
    dens+=f32(gridM[idx])/QM*wt; dw+=wt;
  }
  if(dw>0.0){
    let nodeDens=(dens/dw)/(P.h*P.h*P.h);
    let target=clamp(nodeDens/P.restDensity,0.6,1.5);
    pJp[i].x=mix(pJp[i].x,target,0.3);
  }
}

/* ---------- 5) 统计：占有度/白水（低字节 occ，高字节 foam） ---------- */
@compute @workgroup_size(64)
fn sampleStats(@builtin(global_invocation_id) gid: vec3<u32>){
  let n=i32(gid.x);
  let total=i32((P.nx+1.0)*(P.ny+1.0)*(P.nz+1.0));
  if(n>=total){return;}
  let mq=gridM[n];
  var occ=0u; var foam=0u;
  if(mq>0){
    let m=f32(mq)/QM;
    let mrest=P.restDensity*P.h*P.h*P.h*8.0;
    occ=u32(clamp(m/mrest*320.0,0.0,255.0));
    let vv=vec3<f32>(f32(gridV[n].x),f32(gridV[n].y),f32(gridV[n].z))/QV/(f32(mq)/QM);
    let speed=length(vv);
    if(speed>1.05){
      let nz1=i32(P.nz)+1;
      let up=n+nz1, dn=n-nz1;
      if(up<total && dn>=0 && gridM[dn]>mq && gridM[up]<mq/2){
        foam=u32(clamp((speed-1.05)*130.0,0.0,255.0));
      }
    }
  }
  stats[n]=occ|(foam<<8u);
}
`;

window.TANK_WGSL=TANK_WGSL;
