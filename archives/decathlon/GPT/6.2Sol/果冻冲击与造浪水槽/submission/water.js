'use strict';
const waterColors=[0xffbe55,0x57edd8,0xc990ff];
const gx=49, gy=24, gz=19, gridSize=gx*gy*gz;
const leftWall=-5.68,rightWall=4.22,halfTank=1.92;
const guideStart=1.98,guideEnd=rightWall,guideInset=.52;
const waterHalfWidth=x=>halfTank-guideInset*smooth(guideStart,guideEnd,x);
const rampStart=1.23,rampEnd=rightWall,rampRise=.45;
const ramp = x => .13+clamp((x-rampStart)/(rampEnd-rampStart),0,1)*rampRise+
  .69*Math.pow(clamp((x-rightWall+.82)/.82,0,1),2);
const bedSlope=x=>x<rampStart?0:rampRise/(rampEnd-rampStart)+1.68*clamp((x-rightWall+.82)/.82,0,1);
const baseLevel=1.44;
// Particle momentum is scattered onto staggered MAC faces. Cell mass
// identifies the free boundary for the pressure solve.
const fluidCode = /* wgsl */ `
const G = vec3i(49,24,19);
const H = .26;
const ORIGIN = vec3f(-6.24,-.52,-2.34);
const N = 22344u;
const EAST = ${rightWall};
const RAMP_START = ${rampStart};
const RISE = ${rampRise};
const SLOPE = RISE/(EAST-RAMP_START);
const GUIDE_START=${guideStart};
const GUIDE_INSET=${guideInset};
struct Particle { p: vec4f, v: vec4f }
struct Accum { x: atomic<i32>, y: atomic<i32>, z: atomic<i32>, w: atomic<i32>, mx: atomic<i32>, my: atomic<i32>, mz: atomic<i32>, pad: atomic<i32> }
struct Node { old: vec4f, vel: vec4f, rigid: vec4f }
struct Ball { p: vec4f, v: vec4f }
struct Params { step: vec4f, mode: vec4f, impacts: vec4f, returns: array<vec4f,12> }
@group(0) @binding(0) var<storage,read_write> parts:array<Particle>;
@group(0) @binding(1) var<storage,read_write> acc:array<Accum>;
@group(0) @binding(2) var<storage,read_write> grid:array<Node>;
@group(0) @binding(3) var<storage,read_write> src:array<f32>;
@group(0) @binding(4) var<storage,read_write> dst:array<f32>;
@group(0) @binding(5) var<storage,read> balls:array<Ball>;
@group(0) @binding(6) var<uniform> u:Params;
fn idx(v:vec3i)->u32{return u32(v.x+G.x*(v.y+G.y*v.z));}
fn xyz(i:u32)->vec3i{return vec3i(i32(i)%G.x,i32(i)/G.x%G.y,i32(i)/(G.x*G.y));}
fn valid(v:vec3i)->bool{return all(v>=vec3i(0))&&all(v<G);}
fn runup(x:f32)->f32{return clamp((x-EAST+.82)/.82,0.,1.);}
fn bottom(x:f32)->f32{return .13+clamp((x-RAMP_START)/(EAST-RAMP_START),0.,1.)*RISE+.69*pow(runup(x),2.);}
fn slopeAt(x:f32)->f32{return select(0.,SLOPE,x>RAMP_START)+1.68*runup(x);}
fn widthAt(x:f32)->f32{return 1.92-GUIDE_INSET*smoothstep(GUIDE_START,EAST,x);}
fn solid(p:vec3f)->bool{
  return p.x<u.step.y-.10||p.x>EAST+.06||p.y<bottom(p.x)-.07||abs(p.z)>widthAt(p.x)+.07;
}
fn limit(p:vec3f,initial:vec3f)->vec3f{
  var v=initial;
  if(p.x<u.step.y+.18){v.x=max(v.x,u.step.z*max(0.,1.-(p.x-u.step.y)/.42));}
  if(p.x>EAST-.62){
    let turn=smoothstep(EAST-.62,EAST,p.x);
    v.y+=max(0.,v.x-.31)*turn*.55;
    if(p.x>EAST-.12){v.x=min(v.x,0.);}
  }
  if(p.y<bottom(p.x)+.13){
    let slope=slopeAt(p.x);
    v.y=max(v.y,max(0.,v.x*slope));v.x*=.981;v.z*=.981;
  }
  if(abs(p.z)>widthAt(p.x)-.11){
    let taper=clamp((p.x-GUIDE_START)/(EAST-GUIDE_START),0.,1.);
    let n=normalize(vec3f(6.*GUIDE_INSET*taper*(1.-taper)/(EAST-GUIDE_START),0.,sign(p.z)));
    v-=max(0.,dot(v,n))*n;
  }
  for(var k=0u;k<u32(u.mode.x);k++){
    let b=balls[k];let d=p-b.p.xyz;let l=length(d);
    if(l<b.p.w+.09 && l>.001){
      let n=d/l;let toward=dot(v-b.v.xyz,n);
      if(toward<0.){v-=toward*n*.91;}
    }
  }
  return v;
}
fn axis(k:u32)->vec3i {
  return vec3i(select(0,1,k==0u),select(0,1,k==1u),select(0,1,k==2u));
}
fn faceSolid(c:vec3i,k:u32)->bool{
  let a=ORIGIN+vec3f(c)*H;
  return solid(a)||solid(a+vec3f(axis(k))*H);
}
fn wallVelocity(p:vec3f,k:u32)->f32{
  return select(0.,u.step.z,k==0u&&p.x<u.step.y+.07);
}
fn collidingBall(p:vec3f)->i32{
  for(var k=0u;k<u32(u.mode.x);k++){
    let b=balls[k];let d=p-b.p.xyz;let r=b.p.w*.87;
    if(dot(d,d)<r*r){return i32(k);}
  }
  return -1;
}
fn closedFace(i:u32,k:u32)->bool{return (u32(grid[i].rigid.w)&(1u<<k))!=0u;}
// Deposit the unresolved momentum of a returning drop on nearby liquid faces.
fn reentryImpulse(p:vec3f)->vec3f{
  var impulse=vec3f(0.);
  for(var j=0u;j<u32(u.impacts.x);j++){
    let hit=u.returns[j];let d=p-hit.xyz;
    let r=dot(d.xz,d.xz);
    if(r>.32||abs(d.y)>.34){continue;}
    let kernel=max(0.,1.-r/.32)*max(0.,1.-abs(d.y)/.34);
    impulse+=vec3f(d.x*2.7,-1.35*max(0.,1.-r/.14),d.z*2.7)*(kernel*hit.w);
  }
  return clamp(impulse,vec3f(-.85),vec3f(.85));
}
@compute @workgroup_size(64)
fn scatter(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=u32(u.step.w)){return;}
  let p=parts[i];
  for(var q=0u;q<4u;q++){
    let g=(p.p.xyz-ORIGIN)/H-vec3f(axis(q))*.5;
    let a=vec3i(floor(g));let s=fract(g);
    for(var k=0u;k<8u;k++){
      let d=vec3i(i32(k&1u),i32((k>>1u)&1u),i32(k>>2u));
      let w=mix(1.-s,s,vec3f(d));let weight=w.x*w.y*w.z;
      let c=a+d;
      if(!valid(c)||weight<.0002){continue;}
      let j=idx(c);let fi=weight*4096.;
      switch q {
        case 0u:{atomicAdd(&acc[j].mx,i32(fi));atomicAdd(&acc[j].x,i32(fi*p.v.x));}
        case 1u:{atomicAdd(&acc[j].my,i32(fi));atomicAdd(&acc[j].y,i32(fi*p.v.y));}
        case 2u:{atomicAdd(&acc[j].mz,i32(fi));atomicAdd(&acc[j].z,i32(fi*p.v.z));}
        default:{atomicAdd(&acc[j].w,i32(fi));}
      }
    }
  }
}
@compute @workgroup_size(64)
fn normalizeGrid(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=N){return;}
  let c=xyz(i);let p=ORIGIN+vec3f(c)*H;
  let amount=f32(atomicLoad(&acc[i].w));
  let weights=max(vec3f(1.),vec3f(f32(atomicLoad(&acc[i].mx)),f32(atomicLoad(&acc[i].my)),f32(atomicLoad(&acc[i].mz))));
  let v=vec3f(f32(atomicLoad(&acc[i].x)),f32(atomicLoad(&acc[i].y)),f32(atomicLoad(&acc[i].z)))/weights;
  grid[i].old=vec4f(v,amount/4096.);
  let centerBody=collidingBall(p);
  var mask=select(0u,8u,centerBody>=0||solid(p));
  var boundary=vec3f(0.);
  var next=v*exp(-u.step.x*u.mode.y)+vec3f(0.,-14.*u.step.x,0.);
  for(var k=0u;k<3u;k++){
    let direction=vec3f(axis(k));
    let spot=p+direction*H*.5;
    let endBody=collidingBall(p+direction*H);
    if(faceSolid(c,k)){
      mask|=1u<<k;boundary[k]=wallVelocity(spot,k);
    }else if(centerBody>=0||endBody>=0){
      let body=select(endBody,centerBody,centerBody>=0);
      mask|=1u<<k;boundary[k]=balls[u32(body)].v[k];
    }else{
      let impulse=reentryImpulse(spot);
      next[k]=limit(spot,next+impulse)[k];
    }
    if((mask&(1u<<k))!=0u){next[k]=boundary[k];}
  }
  grid[i].rigid=vec4f(boundary,f32(mask));
  grid[i].vel=vec4f(next,0.);
}
@compute @workgroup_size(64)
fn divergence(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=N){return;}
  if(grid[i].old.w<.23){grid[i].vel.w=0.;return;}
  let c=xyz(i);var flux=0.;
  for(var k=0u;k<3u;k++){
    let a=c-axis(k);
    flux+=grid[i].vel[k];
    if(valid(a)){flux-=grid[idx(a)].vel[k];}
  }
  grid[i].vel.w=flux-min(1.25,max(0.,grid[i].old.w-u.mode.z)*.33);
}
fn pressure(c:vec3i)->f32{
  if(!valid(c)){return 0.;}
  return src[idx(c)];
}
@compute @workgroup_size(64)
fn solvePressure(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=N){return;}
  let c=xyz(i);
  if(grid[i].old.w<.23||(u32(grid[i].rigid.w)&8u)!=0u){dst[i]=0.;return;}
  var terms=0.;var sum=0.;
  for(var k=0u;k<3u;k++){
    let a=axis(k);
    if(!closedFace(i,k)&&valid(c+a)){terms+=1.;sum+=pressure(c+a);}
    if(valid(c-a)&&!closedFace(idx(c-a),k)){terms+=1.;sum+=pressure(c-a);}
  }
  dst[i]=clamp((sum-grid[i].vel.w)/max(1.,terms),-1.5,5.4);
}
@compute @workgroup_size(64)
fn project(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=N){return;}
  let c=xyz(i);let pos=ORIGIN+vec3f(c)*H;let p=src[i];
  var velocity=grid[i].vel.xyz;
  for(var k=0u;k<3u;k++){
    let a=axis(k);let spot=pos+vec3f(a)*H*.5;
    if(closedFace(i,k)){velocity[k]=grid[i].rigid[k];}
    else{velocity[k]-=pressure(c+a)-p;velocity[k]=limit(spot,velocity)[k];}
  }
  grid[i].vel=vec4f(velocity,0.);
}
@compute @workgroup_size(64)
fn advect(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=u32(u.step.w)){return;}
  let pt=parts[i];
  var v=vec3f(0.);var prev=vec3f(0.);var mass=0.;var sum=vec3f(0.);
  for(var q=0u;q<4u;q++){
    let g=(pt.p.xyz-ORIGIN)/H-vec3f(axis(q))*.5;
    let a=vec3i(floor(g));let s=fract(g);
    for(var k=0u;k<8u;k++){
      let d=vec3i(i32(k&1u),i32((k>>1u)&1u),i32(k>>2u));let c=a+d;
      let w=mix(1.-s,s,vec3f(d));let weight=w.x*w.y*w.z;
      if(!valid(c)){continue;}
      let iNode=idx(c);
      let n=grid[iNode];
      if(q==3u){mass+=weight*n.old.w;continue;}
      if(n.old.w<.042&&valid(c+axis(q))&&grid[idx(c+axis(q))].old.w<.042&&!faceSolid(c,q)){continue;}
      v[q]+=n.vel[q]*weight;prev[q]+=n.old[q]*weight;sum[q]+=weight;
    }
  }
  v/=max(sum,vec3f(.01));prev/=max(sum,vec3f(.01));
  var out=mix(v,pt.v.xyz+v-prev,select(.77,.95,mass<1.1));
  out=select(pt.v.xyz+vec3f(0.,-14.*u.step.x,0.),out,sum>vec3f(.01));
  out=clamp(out*exp(-u.step.x*u.mode.y*.42),vec3f(-13.),vec3f(13.));
  var p=pt.p.xyz+out*u.step.x;
  var foam=max(0.,pt.p.w-u.step.x*select(.44,1.32,mass>2.35));
  var splash=mass<1.75 && length(out)>2.25 && p.y>u.mode.w-.25;
  if(p.x<u.step.y+.035){p.x=u.step.y+.035;out.x=max(u.step.z,out.x);}
  if(p.x>EAST-.045){
    p.x=EAST-.045;splash=splash||(out.x>1.55&&p.y>1.23);
    out.y+=max(0.,out.x-.76)*.67;out.x=min(0.,-out.x*.32);
  }
  if(p.y<bottom(p.x)+.043){
    p.y=bottom(p.x)+.043;
    out.y=max(out.y,out.x*slopeAt(p.x));out.x*=.977;out.z*=.977;
  }
  if(p.x>EAST-.44 && mass<1.9 && p.y>u.mode.w-.06 && out.y>.40){
    foam=max(foam,clamp(length(out)*.38,0.,.76));
  }
  let guide=widthAt(p.x)-.043;
  if(abs(p.z)>guide){
    p.z=clamp(p.z,-guide,guide);
    let taper=clamp((p.x-GUIDE_START)/(EAST-GUIDE_START),0.,1.);
    let n=normalize(vec3f(6.*GUIDE_INSET*taper*(1.-taper)/(EAST-GUIDE_START),0.,sign(p.z)));
    out-=max(0.,dot(out,n))*n*1.19;
  }
  for(var k=0u;k<u32(u.mode.x);k++){
    let b=balls[k];let d=p-b.p.xyz;let l=length(d);let r=b.p.w+.047;
    if(l<r&&l>.0001){
      let n=d/l;let rel=b.v.xyz-out;
      out+=n*max(0.,dot(rel,n))*.97;
      p+=n*(r-l);
      if(length(rel)>3.15&&mass<2.55 && p.y>.8){
        splash=true;out.y+=max(0.,1.-abs(n.y))*.39*length(rel);
      }
    }
    let localDepth=p.y-u.mode.w;
    if(l>=r && l<r+.30 && b.v.y < -2.05 && mass<2.72 && localDepth > -.37 && localDepth < .35 && d.y > -.19){
      let shell=(1.-(l-r)/.30)*max(0.,1.-abs(d.y)*2.8);
      let force=clamp(-b.v.y-1.,0.,8.)*sqrt(b.v.w)*shell;
      let direction=normalize(vec3f(d.x,.73,d.z));
      out+=direction*(force*u.step.x*29.);
      if(mass<2.25&&localDepth>-.19){
        let ejection=smoothstep(.85,3.8,force)*smoothstep(-.19,-.025,localDepth);
        out.y+=ejection*1.68;
      }
      if(force>.48){
        foam=max(foam,clamp(.25+force*.13,0.,1.));
        splash=splash||(out.y>1.3 && mass<1.75);
      }
    }
  }
  p.x=clamp(p.x,u.step.y+.035,EAST-.045);
  let finalWidth=widthAt(p.x)-.043;
  p.z=clamp(p.z,-finalWidth,finalWidth);p.y=clamp(p.y,bottom(p.x)+.044,4.98);
  if(splash){foam=max(foam,clamp(.26+length(out)*.073,0.,1.));}
  parts[i]=Particle(vec4f(p,foam),vec4f(out,mass));
}
`;
class FluidGPU {
  static async build(){
    if(!navigator.gpu)throw new Error('此浏览器未提供 WebGPU。');
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)throw new Error('无法连接 WebGPU 适配器。');
    const device=await adapter.requestDevice();
    const mod=device.createShaderModule({label:'PIC/FLIP water solver',code:fluidCode});
    const issues=(await mod.getCompilationInfo()).messages.filter(m=>m.type==='error');
    if(issues.length)throw new Error(issues.map(m=>m.lineNum+' '+m.message).join('\n'));
    device.pushErrorScope('validation');
    const fluid=new FluidGPU(device,mod);
    const error=await device.popErrorScope();
    if(error)throw new Error(error.message);
    await fluid.equilibrate();
    return fluid;
  }
  constructor(device,mod){
    this.device=device;
    this.initial=this.seed();
    const S=GPUBufferUsage.STORAGE,C=GPUBufferUsage.COPY_DST,U=GPUBufferUsage.UNIFORM;
    const buf=(size,usage)=>device.createBuffer({size,usage});
    this.particles=buf(this.initial.byteLength,S|C|GPUBufferUsage.COPY_SRC);
    this.acc=buf(gridSize*32,S|C);this.grid=buf(gridSize*48,S);
    this.p=[buf(gridSize*4,S|C),buf(gridSize*4,S|C)];
    this.ball=buf(32*32,S|C);this.uniform=buf(240,U|C);
    this.read=buf(this.initial.byteLength,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);

    const uses={scatter:[0,1,6],normalizeGrid:[1,2,5,6],divergence:[2,6],solvePressure:[2,3,4],project:[2,3,5,6],advect:[0,2,5,6]};
    this.pipes={};
    for(const [name,bindings] of Object.entries(uses)){
      const pipe=device.createComputePipeline({layout:'auto',compute:{module:mod,entryPoint:name}});
      const b=[0,1].map(i=>{
        const resources=[this.particles,this.acc,this.grid,this.p[i],this.p[1-i],this.ball,this.uniform];
        return device.createBindGroup({layout:pipe.getBindGroupLayout(0),entries:bindings.map(binding=>({binding,resource:{buffer:resources[binding]}}))});
      });
      this.pipes[name]={pipe,b};
    }
    this.reset();
  }
  seed(){
    const rng=randomSource(404623), samples=[],s=.174;
    for(let x=leftWall+.08;x<rightWall-.09;x+=s)for(let z=-1.82;z<1.87;z+=s){
      if(Math.abs(z)>waterHalfWidth(x)-.05)continue;
      const y0=ramp(x);
      for(let y=.19;y<baseLevel+.04;y+=s){
        if(y-y0<.046)continue;
        samples.push(x+(rng()-.5)*.049,y+(rng()-.5)*.040,z+(rng()-.5)*.046,0,0,0,0,2.7);
      }
    }
    return new Float32Array(samples);
  }
  reset(){this.device.queue.writeBuffer(this.particles,0,this.initial);return this.initial.slice();}
  async equilibrate(){
    // Let the initial lattice find hydrostatic balance before the first release.
    for(let i=0;i<204;i++)this.submit(1/60,leftWall,0,[],.16,baseLevel,[]);
    const calm=await this.readback();
    for(let a=0;a<calm.length;a+=8){
      calm[a+3]=0;calm[a+4]=0;calm[a+5]=0;calm[a+6]=0;
    }
    this.initial=calm;this.reset();
  }
  submit(dt,piston,speed,balls,drag,level,returns){
    const {device:d}=this, data=new Float32Array(32*8);
    for(let i=0;i<balls.length;i++){
      const b=balls[i];data.set([b.p.x,b.p.y,b.p.z,b.r,b.v.x,b.v.y,b.v.z,b.rho],i*8);
    }
    const count=this.initial.length/8;
    d.queue.writeBuffer(this.ball,0,data);
    const params=new Float32Array(60);
    params.set([dt,piston,speed,count,balls.length,drag,2.94,level,returns.length]);
    for(let i=0;i<returns.length;i++)params.set(returns[i],12+i*4);
    d.queue.writeBuffer(this.uniform,0,params);
    const cmd=d.createCommandEncoder();
    cmd.clearBuffer(this.acc);cmd.clearBuffer(this.p[0]);cmd.clearBuffer(this.p[1]);
    const pass=cmd.beginComputePass();
    const send=(key,items,i=0)=>{
      const {pipe,b}=this.pipes[key];pass.setPipeline(pipe);pass.setBindGroup(0,b[i]);pass.dispatchWorkgroups(Math.ceil(items/64));
    };
    send('scatter',count);send('normalizeGrid',gridSize);send('divergence',gridSize);
    for(let i=0;i<24;i++)send('solvePressure',gridSize,i%2);
    send('project',gridSize);send('advect',count);pass.end();
    d.queue.submit([cmd.finish()]);
  }
  async readback(){
    const cmd=this.device.createCommandEncoder();cmd.copyBufferToBuffer(this.particles,0,this.read,0,this.initial.byteLength);
    this.device.queue.submit([cmd.finish()]);
    await this.read.mapAsync(GPUMapMode.READ);
    const arr=new Float32Array(this.read.getMappedRange()).slice();
    this.read.unmap();return arr;
  }
}
const netCorners=[0,1,2,3,4,5,6,7];
const netEdges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
class WaterSurface {
  constructor(scene){
    const material=new T.MeshPhysicalMaterial({color:0xb8eeec,roughness:.093,metalness:.021,ior:1.333,transmission:.965,thickness:1.02,attenuationColor:new T.Color(0x8ed9dc),attenuationDistance:5.8,clearcoat:.55,clearcoatRoughness:.095,side:T.FrontSide,envMapIntensity:1.18});
    material.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float surfaceFoam; varying float vWhitewater; varying vec3 vWaterPoint;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWhitewater=surfaceFoam; vWaterPoint=position;');
      shader.fragmentShader='varying float vWhitewater; varying vec3 vWaterPoint;\n'+shader.fragmentShader
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec3 w=vWaterPoint*36.;
          float cells=.5+.5*sin(w.x+cos(w.y*1.7))*sin(w.z-sin(w.y*.84));
          float whitening=smoothstep(.15,.66,vWhitewater*(.78+.33*cells));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.79,.89,.91),whitening*.94);`)
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.58,whitening);')
        .replace('#include <transmission_fragment>',T.ShaderChunk.transmission_fragment.replace('material.transmission = transmission;','material.transmission = transmission*(1.-.92*whitening);'));
    };
    this.geo=new T.BufferGeometry();
    this.nx=83;this.ny=36;this.nz=32;this.ds=.145;this.origin=[-5.95,-.10,-2.25];
    const count=this.nx*this.ny*this.nz;
    this.field=new Float32Array(count);
    this.froth=new Float32Array(count);
    this.vertex=new Int32Array(count);
    this.positions=new Float32Array(70000*3);this.normals=new Float32Array(70000*3);
    this.whitewater=new Float32Array(70000);
    this.indices=new Uint32Array(430000);this.lvl=new Float32Array(40*15);
    this.geo.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    this.geo.setAttribute('normal',new T.BufferAttribute(this.normals,3).setUsage(T.DynamicDrawUsage));
    this.geo.setAttribute('surfaceFoam',new T.BufferAttribute(this.whitewater,1).setUsage(T.DynamicDrawUsage));
    this.geo.setIndex(new T.BufferAttribute(this.indices,1).setUsage(T.DynamicDrawUsage));
    this.m=mesh(scene,this.geo,material,0,0,0,false);this.m.frustumCulled=false;this.m.renderOrder=1;
    const drop=new T.MeshPhysicalMaterial({color:0xa0e4e7,roughness:.12,metalness:.21,clearcoat:1,envMapIntensity:1.2});
    const foam=new T.MeshStandardMaterial({color:0xe8ffff,roughness:.67,emissive:0x3a6b72,emissiveIntensity:.32});
    const bubble=new T.MeshPhysicalMaterial({color:0xacffff,roughness:.18,transparent:true,opacity:.30,metalness:.20,depthWrite:false,side:T.FrontSide});
    this.spray=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),drop,3400);
    this.foam=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),foam,4000);
    this.bubble=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),bubble,1800);
    for(const o of [this.spray,this.foam,this.bubble]){o.count=0;o.frustumCulled=false;o.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(o);}
    this.bubble.renderOrder=4;
    this.dummy=new T.Object3D();
  }
  height(x,z){
    let m=0,c=0;
    const a=clamp(Math.floor((x+5.7)/11.4*40),0,39),b=clamp(Math.floor((z+1.92)/3.84*15),0,14);
    for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++){
      const q=this.lvl[clamp(a+j,0,39)+40*clamp(b+k,0,14)];
      if(q>0){m+=q;c++;}
    }
    return c?m/c:ramp(x);
  }
  update(data,piston){
    // Reconstruct a three-dimensional isosurface, including overhangs.
    const {nx,ny,nz,ds,field,froth,vertex,positions,normals,whitewater,indices,lvl}=this;
    const [ox,oy,oz]=this.origin, stride=nx*ny, inv=1/ds;
    field.fill(0);froth.fill(0);lvl.fill(0);vertex.fill(-1);
    const radius=.24,rr=radius*radius;
    for(let a=0;a<data.length;a+=8){
      const x=data[a],y=data[a+1],z=data[a+2],px=(x-ox)*inv,py=(y-oy)*inv,pz=(z-oz)*inv,foam=data[a+3],mass=data[a+7];
      if(data[a+7]>.95){
        const cell=clamp(Math.floor((x+5.7)/11.4*40),0,39)+40*clamp(Math.floor((z+1.92)/3.84*15),0,14);
        lvl[cell]=Math.max(lvl[cell],y+.067);
      }
      if(mass<.96&&foam>.13)continue;
      const x0=Math.max(1,Math.ceil(px-radius*inv)),x1=Math.min(nx-2,Math.floor(px+radius*inv));
      const y0=Math.max(1,Math.ceil(py-radius*inv)),y1=Math.min(ny-2,Math.floor(py+radius*inv));
      const z0=Math.max(1,Math.ceil(pz-radius*inv)),z1=Math.min(nz-2,Math.floor(pz+radius*inv));
      for(let iz=z0;iz<=z1;iz++){
        const dz=(iz-pz)*ds;
        for(let iy=y0;iy<=y1;iy++){
          const dy=(iy-py)*ds, yz=rr-dz*dz-dy*dy,j=nx*iy+stride*iz;
          if(yz<=0)continue;
          for(let ix=x0;ix<=x1;ix++){
            const dx=(ix-px)*ds, q=(yz-dx*dx)/rr;
            if(q>0){field[j+ix]+=q*q;if(foam>.10)froth[j+ix]+=q*q*foam;}
          }
        }
      }
    }
    const offsets=[0,1,nx,nx+1,stride,stride+1,stride+nx,stride+nx+1];
    const iso=.61, s=new Float32Array(8);
    let vc=0, ic=0;
    for(let iz=0;iz<nz-1;iz++)for(let iy=0;iy<ny-1;iy++)for(let ix=0;ix<nx-1;ix++){
      const base=ix+iy*nx+iz*stride;let mask=0;
      for(const k of netCorners){s[k]=field[base+offsets[k]];if(s[k]>=iso)mask|=1<<k;}
      if(mask===0||mask===255)continue;
      let cx=0,cy=0,cz=0,w=0;
      for(const [a,b] of netEdges){
        if(((mask>>a)^(mask>>b))%2===0)continue;
        const t=clamp((iso-s[a])/(s[b]-s[a]),0,1), k=1-t;
        cx+=(a&1)*k+(b&1)*t;cy+=((a>>1)&1)*k+((b>>1)&1)*t;cz+=(a>>2)*k+(b>>2)*t;w++;
      }
      if(!w||vc>=69999)continue;
      const p=vc*3;
      const x=clamp(ox+(ix+cx/w)*ds,piston+.005,rightWall);
      positions[p]=x;positions[p+1]=Math.max(ramp(x)+.006,oy+(iy+cy/w)*ds);
      const width=waterHalfWidth(x);
      positions[p+2]=clamp(oz+(iz+cz/w)*ds,-width,width);
      let dx=s[0]+s[2]+s[4]+s[6]-s[1]-s[3]-s[5]-s[7];
      let dy=s[0]+s[1]+s[4]+s[5]-s[2]-s[3]-s[6]-s[7];
      let dz=s[0]+s[1]+s[2]+s[3]-s[4]-s[5]-s[6]-s[7];
      const z=positions[p+2], depth=positions[p+1];
      if(Math.abs(z)>width-.08&&depth<this.height(x,z)-.145&&depth>ramp(x)+.06&&Math.sign(z)*dz>.25){
        const blend=smooth(width-.08,width,Math.abs(z))*.91;
        dx*=1-blend;dy*=1-blend;dz=mix(dz,Math.sign(z)*2.0,blend);
      }
      const norm=Math.hypot(dx,dy,dz)||1;
      normals[p]=dx/norm;normals[p+1]=dy/norm;normals[p+2]=dz/norm;
      let white=0,mass=0;
      for(const k of offsets){white+=froth[base+k];mass+=field[base+k];}
      whitewater[vc]=white/Math.max(.01,mass)*smooth(-.16,.29,dy/norm)*1.48;
      vertex[base]=vc++;
      for(const [bit,u,v] of [[1,nx,stride],[2,stride,1],[4,1,nx]]){
        if(((mask&1)>0)===((mask&1<<bit)>0))continue;
        const a=vertex[base],b=vertex[base-u],c=vertex[base-u-v],d=vertex[base-v];
        if(a<0||b<0||c<0||d<0||ic+6>=indices.length)continue;
        if(mask&1){indices[ic++]=a;indices[ic++]=b;indices[ic++]=c;indices[ic++]=a;indices[ic++]=c;indices[ic++]=d;}
        else{indices[ic++]=a;indices[ic++]=c;indices[ic++]=b;indices[ic++]=a;indices[ic++]=d;indices[ic++]=c;}
      }
    }
    this.geo.setDrawRange(0,ic);
    for(const a of [this.geo.attributes.position,this.geo.attributes.normal,this.geo.attributes.surfaceFoam,this.geo.index])a.needsUpdate=true;
    const o=this.dummy;
    this.spray.count=0;this.foam.count=0;this.bubble.count=0;
    for(let a=0;a<data.length;a+=8){
      const x=data[a],y=data[a+1],z=data[a+2],f=data[a+3],m=data[a+7];
      if(f<.07&&m>.63)continue;
      const h=this.height(x,z),r=.029+.041*((a*359%915)/915),fade=clamp(f*1.65,.12,1);
      if(m<1.40&&y>h-.10&&f>.10&&this.spray.count<3400){
        o.position.set(x,y,z);
        const velocity=v3(data[a+4],data[a+5],data[a+6]);
        if(velocity.lengthSq()>.001)o.quaternion.setFromUnitVectors(v3(0,1,0),velocity.clone().normalize());
        o.scale.set(r*.85,r*(.94+.20*velocity.length()),r*.85);o.updateMatrix();
        this.spray.setMatrixAt(this.spray.count++,o.matrix);
      }
      o.quaternion.identity();
      if(f>.18&&y>h-.12&&m>.67&&m<3.2&&this.foam.count<4000){
        o.position.set(x,y+.076,z);o.scale.set(r*fade*1.21,r*fade*.52,r*fade*1.19);o.updateMatrix();
        this.foam.setMatrixAt(this.foam.count++,o.matrix);
      }
      if(f>.25&&a%24===0&&y<h-.15&&this.bubble.count<1800){
        o.position.set(x,y,z);o.scale.setScalar(r*fade*.62);o.updateMatrix();
        this.bubble.setMatrixAt(this.bubble.count++,o.matrix);
      }
    }
    for(const b of [this.spray,this.foam,this.bubble])b.instanceMatrix.needsUpdate=true;
  }
}
function tankHardware(scene){
  plinth(scene,12.78,4.85,'WAVE CHANNEL','RECIRCULATION / ML-02');
  const outerRight=rightWall+.11, outerLeft=leftWall-.11;
  const span=outerRight-outerLeft,middle=(outerLeft+outerRight)*.5;
  const floorMat=new T.MeshStandardMaterial({color:0x416e75,metalness:.35,roughness:.40});
  const heights=new T.DataTexture(new Float32Array(40*15),40,15,T.RedFormat,T.FloatType);
  heights.magFilter=T.LinearFilter;heights.minFilter=T.LinearFilter;heights.needsUpdate=true;
  const caustic={value:0}, amp={value:0};
  floorMat.onBeforeCompile=s=>{
    s.uniforms.causticTime=caustic;s.uniforms.causticAmp=amp;s.uniforms.waveHeight={value:heights};
    s.vertexShader='varying vec3 tankWorld;\n'+s.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\ntankWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    s.fragmentShader='varying vec3 tankWorld; uniform float causticTime,causticAmp; uniform sampler2D waveHeight;\n'+s.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      vec2 lensUV=(tankWorld.xz+vec2(5.70,1.92))/vec2(11.4,3.84);
      float localHeight=texture2D(waveHeight,lensUV).x;
      vec2 dh=vec2(texture2D(waveHeight,lensUV+vec2(.025,0.)).x-localHeight,texture2D(waveHeight,lensUV+vec2(0.,.0667)).x-localHeight);
      vec2 q=(tankWorld.xz-dh*.36)*4.7;
      float t=causticTime;
      float a=sin(q.x+sin(q.y*.8+t*1.5)+t*.9);
      float b=sin(q.y*1.2+sin(q.x*.76-t*1.3)-t*.78);
      float c=sin(q.x*.76+q.y*.58+t*.74);
      float rays=pow(1.-min(1.,abs(a*b*.70+c*.45)*2.7),6.);
      totalEmissiveRadiance+=vec3(.08,.33,.37)*rays*(.36+causticAmp*.54)*smoothstep(.02,.25,localHeight-tankWorld.y)*(1.+min(.6,length(dh)*.7));
    `);
  };
  floorMat.addEventListener('dispose',()=>heights.dispose());
  box(scene,span+.12,.14,4.0,floorMat,middle,.062,0);
  const rampLength=rampEnd-rampStart;
  const bedGeo=new T.BufferGeometry(), profile=[], tri=[];
  for(let i=0;i<=36;i++){
    const x=mix(rampStart,rampEnd+.08,i/36),y=ramp(x);
    profile.push(x,y,-1.918,x,y,1.918,x,.13,-1.918,x,.13,1.918);
    if(!i)continue;
    const a=(i-1)*4,b=i*4;
    tri.push(a,a+1,b,b,a+1,b+1,a,b,a+2,a+2,b,b+2,a+1,a+3,b+1,a+3,b+3,b+1);
  }
  bedGeo.setAttribute('position',new T.Float32BufferAttribute(profile,3));bedGeo.setIndex(tri);bedGeo.computeVertexNormals();
  mesh(scene,bedGeo,floorMat);
  const rampCoords=[];
  for(let i=0;i<14;i++){
    const x=rampStart+i*rampLength/14,y=ramp(x)+.023;rampCoords.push(x,y,-1.9,x,y,1.9);
  }
  line(scene,rampCoords,0xa4d5d3,.30);
  const glass=new T.MeshPhysicalMaterial({color:0x94c4cc,transparent:true,opacity:.10,roughness:.095,metalness:.12,depthWrite:false,side:T.DoubleSide});
  const guideGlass=new T.MeshPhysicalMaterial({color:0x91cbd5,transparent:true,opacity:.18,roughness:.18,metalness:.08,depthWrite:false,side:T.DoubleSide});
  for(const side of [-1,1]){
    const positions=[],indices=[],rim=[];
    for(let i=0;i<=14;i++){
      const x=mix(guideStart,guideEnd+.055,i/14),z=side*waterHalfWidth(x);
      positions.push(x,ramp(x)+.028,z,x,3.08,z);
      if(!i)continue;
      const a=(i-1)*2,b=i*2;
      indices.push(a,b,a+1,a+1,b,b+1);
      const last=mix(guideStart,guideEnd+.055,(i-1)/14);
      rim.push(last,3.08,side*waterHalfWidth(last),x,3.08,z);
    }
    const guideGeo=new T.BufferGeometry();
    guideGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));guideGeo.setIndex(indices);guideGeo.computeVertexNormals();
    mesh(scene,guideGeo,guideGlass,0,0,0,false).renderOrder=4;
    line(scene,rim,0x5daec2,.70).renderOrder=6;
  }
  for(const z of [-1.98,1.98]){
    const wall=box(scene,span,3.46,.070,glass,middle,1.88,z,false);wall.renderOrder=5;
    box(scene,span+.12,.13,.13,metal,middle,.18,z);
    box(scene,span+.13,.071,.089,trim,middle,3.63,z);
    box(scene,span-.04,.016,.014,aqua,middle,.272,z+(z>0?.049:-.049),false);
  }
  for(const x of [outerLeft,outerRight]){
    const wall=box(scene,.07,3.46,3.94,glass,x,1.88,0,false);wall.renderOrder=5;
    box(scene,.139,.105,4.09,metal,x,.18,0);
    box(scene,.105,.072,4.02,trim,x,3.63,0);
    for(const z of [-1.99,1.99]){
      box(scene,.114,3.55,.114,trim,x,1.88,z);
      box(scene,.32,.21,.28,blackMetal,x,3.61,z);
      box(scene,.32,.29,.28,blackMetal,x,.22,z);
    }
  }
  const scaleTexture=canvasTexture(128,1024,(c,w,h)=>{
    c.clearRect(0,0,w,h);c.font='46px Consolas';c.textAlign='left';c.textBaseline='middle';
    c.fillStyle='#d3eeec';
    for(let y=.5;y<=3;y+=.5)c.fillText(y.toFixed(1),3,(3.45-y)/3.2*h);
  });
  const scaleMaterial=new T.MeshBasicMaterial({map:scaleTexture,transparent:true,depthWrite:false});
  const waterlineMarkers=[];
  for(const [index,x] of [-4.85,rightWall-.88].entries()){
    const ticks=[];
    for(let j=4;j<=33;j++){
      const h=j*.1,w=j%5===0?.19:.085;
      ticks.push(x,h,2.024,x+w,h,2.024);
    }
    line(scene,ticks,0xc5eeee,.66).renderOrder=7;
    mesh(scene,new T.PlaneGeometry(.38,3.2),scaleMaterial,x+.41,1.85,2.026,false).renderOrder=7;
    const needle=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([-0.22,.04,0,-0.22,-.04,0,-0.045,0,0],3));
    waterlineMarkers.push(mesh(scene,needle,new T.MeshBasicMaterial({color:index?0xffc16b:0x64f2d2,side:T.DoubleSide}),x,baseLevel,2.043,false));
  }
  const floorTicks=[];
  for(let x=-5.26;x<rightWall-.36;x+=.32)floorTicks.push(x,.205,1.91,x,.205,1.72);
  line(scene,floorTicks,0x91c5c9,.55);
  const piston=new T.Group();scene.add(piston);
  box(piston,.15,2.72,3.77,metal,-.08,1.48,0);
  box(piston,.067,2.61,3.57,orange,.018,1.48,0);
  box(piston,.17,.14,3.78,trim,-.022,2.84,0);
  for(const z of [-1.35,-.67,0,.67,1.35])box(piston,.11,2.42,.055,blackMetal,.057,1.47,z);
  for(const z of [-1.41,1.41]){
    box(scene,2.32,.15,.16,blackMetal,-5.03,3.33,z);
    box(scene,2.32,.036,.043,trim,-5.03,3.43,z);
    box(piston,.27,.65,.24,metal,-.025,3.02,z);
    box(piston,.30,.097,.23,orange,-.025,3.42,z);
    const rail=cyl(scene,.075,.075,2.35,trim,-4.95,3.17,z);rail.rotation.z=Math.PI/2;
  }
  box(scene,.51,.56,3.53,blackMetal,-6.07,3.13,0);
  box(scene,.38,.13,3.2,orange,-6.09,3.46,0);
  for(let z=-1.35;z<=1.4;z+=.31)box(scene,.07,.018,.071,aqua,-6.09,3.538,z,false);
  typographicPlate(scene,2.52,.30,'WAVEMAKER','VARIABLE STROKE',-5.17,-.05,2.44,'front');
  const output=rightWall+.91;
  box(scene,1.32,.57,3.40,blackMetal,output,.27,0);
  box(scene,1.37,.10,3.49,metal,output,.60,0);
  for(let z=-1.38;z<=1.40;z+=.19)box(scene,.82,.021,.059,trim,output,.657,z,false);
  for(const x of [output-.52,output+.52])box(scene,.04,.035,3.18,orange,x,.661,0,false);
  typographicPlate(scene,1.07,.31,'RETURN','FILTER',output,.26,1.706,'front');
  return {piston,caustic,amp,heights,waterlineMarkers};
}
class TankTest {
  constructor(gpu){
    this.scene=labScene();this.hardware=tankHardware(this.scene);
    this.gpu=gpu;this.surface=new WaterSurface(this.scene);
    this.balls=[];this.queue=[];this.t=0;this.wave=false;this.active=false;this.phase=0;this.stroke=0;this.piston=leftWall;this.speed=0;
    this.params={amplitude:.61,frequency:.65,densities:[.49,1.00,2.52]};
    this.waveEnvelope=0;this.level=baseLevel;this.drag=.12;
    const tracerMap=canvasTexture(512,256,(c,w,h)=>{
      c.fillStyle='#fff';c.fillRect(0,0,w,h);
      c.fillStyle='#a2b6ba';c.fillRect(0,120,w,16);
      c.fillStyle='#d3e0df';c.fillRect(0,121,w,2);c.fillRect(0,133,w,2);
      c.fillStyle='#f6ffff';for(let x=0;x<w;x+=64)c.fillRect(x,124,19,8);
    });
    this.colors=waterColors.map(color=>new T.MeshPhysicalMaterial({color,map:tracerMap,metalness:.22,roughness:.19,clearcoat:1,clearcoatRoughness:.16,envMapIntensity:1.07}));
    this.preview=[];this.bubbles=[];this.rng=randomSource(9408);
    this.returns=[];this.returnedDrops=0;this.wallRunup=baseLevel;this.wallSoundAt=0;
    this.crestX=0;this.crestY=baseLevel;
    this.previousLevel=new Float32Array(this.surface.lvl.length);
    for(let i=0;i<9;i++){
      const x=-3.60+i*.93,z=[.73,-.67,.02][i%3],y=2.17+(i%3)*.21;
      const m=mesh(this.scene,sphereGeo,this.colors[i%3],x,y,z);m.scale.setScalar(.30);this.preview.push(m);
    }
    this.data=gpu.reset();this.splashes=0;
    this.surface.update(this.data,leftWall);
    this.wallRunup=0;
    for(let a=0;a<this.data.length;a+=8)if(this.data[a]>rightWall-.42&&this.data[a+7]>1.15){
      this.wallRunup=Math.max(this.wallRunup,this.data[a+1]);
    }
    this.startLevel=this.measuredLevel();
    this.averageLevel=this.startLevel;
    this.dataChanged=false;
    this.hardware.piston.position.x=leftWall;
    this.sampleField=new Int32Array(27*12*11);this.sampleNext=new Int32Array(this.data.length/8);
    this.makeSampleField();
  }
  measuredLevel(){
    const grid=this.surface.lvl;
    let sum=0,count=0;
    for(let z=0;z<15;z++)for(let x=0;x<40;x++){
      const px=(x+.5)*11.4/40-5.7,pz=(z+.5)*3.84/15-1.92;
      if(px<this.piston+.15||px>rightWall-.19||Math.abs(pz)>waterHalfWidth(px)-.11)continue;
      const y=grid[x+40*z];
      if(y<=ramp(px)+.08)continue;
      sum+=y;count++;
    }
    return count?sum/count:baseLevel;
  }
  makeSampleField(){
    const A=this.sampleField, B=this.sampleNext;
    A.fill(-1);
    for(let a=0;a<this.data.length;a+=8){
      const x=clamp(Math.floor((this.data[a]+5.8)*2.3),0,26),y=clamp(Math.floor(this.data[a+1]*2.3),0,11),z=clamp(Math.floor((this.data[a+2]+2.0)*2.3),0,10);
      const k=x+27*(y+12*z);B[a/8]=A[k];A[k]=a/8;
    }
  }
  sample(b){
    const {p}=b,d=this.data,r=b.r+.38,bodyShell=b.r+.14;
    let vx=0,vy=0,vz=0,m=0,max=0,velocityWeight=0;
    const loX=clamp(Math.floor((p.x-r+5.8)*2.3),0,26),hiX=clamp(Math.floor((p.x+r+5.8)*2.3),0,26);
    const loY=clamp(Math.floor((p.y-r)*2.3),0,11),hiY=clamp(Math.floor((p.y+r)*2.3),0,11);
    const loZ=clamp(Math.floor((p.z-r+2.0)*2.3),0,10),hiZ=clamp(Math.floor((p.z+r+2.0)*2.3),0,10);
    for(let z=loZ;z<=hiZ;z++)for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
      let a=this.sampleField[x+27*(y+12*z)];
      while(a!==-1){
        const k=a*8,dx=p.x-d[k],dy=p.y-d[k+1],dz=p.z-d[k+2],dd=dx*dx+dy*dy+dz*dz;
        if(dd<r*r){
          const w=1-dd/(r*r);
          const rw=w*(dd<bodyShell*bodyShell?.48:1)*smooth(.22,.86,d[k+7]);
          vx+=rw*d[k+4];vy+=rw*d[k+5];vz+=rw*d[k+6];velocityWeight+=rw;
          m+=w;if(d[k+7]>.57)max=Math.max(max,d[k+1]);
        }
        a=this.sampleNext[a];
      }
    }
    return {vx:vx/(velocityWeight||1),vy:vy/(velocityWeight||1),vz:vz/(velocityWeight||1),m,max};
  }
  release(demo=false){
    this.active=true;
    this.preview.forEach(m=>m.visible=false);
    const k=this.balls.length===0?0:this.balls.length;
    for(let i=0;i<12;i++){
      const group=(i+Math.floor(i/3))%3;
      const x=-3.53+(i%6)*1.38+.20*Math.sin(i*5.2+k);
      const z=(i>=6?.85:-.59)+.32*Math.sin(i*3.8+k*.3);
      const delay=demo&&i<3?0:i<6?i*.066:.28+(i-6)*.083;
      const height=demo&&group===1?this.startLevel+.52+(i%4)*.11:
        2.41+(i%4)*.25+(group===2?.45:0)-(group===1?.39:0);
      this.queue.push({at:this.t+delay,group,x,z,height,vx:.36*Math.sin(i*6.7+k),vz:.22*Math.cos(i*3.2)});
    }
    this.queue.sort((a,b)=>a.at-b.at);
    this.spawn();
  }
  spawn(){
    while(this.queue.length&&this.queue[0].at<=this.t+1e-8){
      const q=this.queue.shift();
      if(this.balls.length>=30){
        const old=this.balls.shift();this.scene.remove(old.obj);
      }
      const obj=mesh(this.scene,sphereGeo,this.colors[q.group]);obj.scale.setScalar(.30);
      obj.rotation.set(.32,q.x,.55);
      const p=v3(q.x,q.height,q.z);
      this.balls.push({obj,r:.30,p,previous:p.clone(),v:v3(q.vx,q.group===1?-1.05:-1.70,q.vz),group:q.group,rho:this.params.densities[q.group],wet:false,ground:false,entrain:0,addedMass:0});
    }
  }
  toggleWave(val=!this.wave){
    this.wave=val;this.active=true;if(val)soundEvent('wave',.8);
  }
  advance(dt){
    this.spawn();
    this.t+=dt;
    const depth=this.params.amplitude, hz=this.params.frequency;
    const former=this.piston;
    this.waveEnvelope=mix(this.waveEnvelope,this.wave?depth:0,1-Math.exp(-dt*(this.wave?4:2.1)));
    if(this.wave||this.waveEnvelope>.002)this.phase+=dt*hz;
    const phase=(this.phase%1);
    const hold=mix(.40,.55,smooth(.45,.94,depth));
    const pulse=phase<.35?smooth(0,.35,phase):1-smooth(hold,1,phase);
    this.stroke=this.waveEnvelope*2.67*pulse;
    this.piston=leftWall+this.stroke;this.speed=(this.piston-former)/dt;
    if(this.wave&&phase<dt*hz)soundEvent('wave',.35+depth);
    let displacement=0;
    for(const b of this.balls){
      b.rho=this.params.densities[b.group];
      const {p,v,r,rho}=b;
      b.previous.copy(p);
      const f=this.sample(b);
      const mean=this.surface.height(p.x,p.z);
      const h=f.m>2.0? Math.min(mean+.24,Math.max(f.max+.034,mean-.14)):mean;
      const immersion=clamp((h-p.y+r)/(2*r),0,1);
      const wet=(immersion*immersion*(3-2*immersion))*smooth(.5,4.5,f.m);
      if(!b.wet&&wet>.16&&v.y<-1.35){
        soundEvent('splash',(.3+.23*rho)*Math.abs(v.y)*.28);
        b.wet=true;b.entrain=.34;this.splashes++;
      }
      if(wet<.02)b.wet=false;
      if(b.entrain>0){
        b.entrain-=dt;
        if(wet>.23&&this.bubbles.length<1300){
          for(let j=0;j<2;j++){
            const a=this.rng()*Math.PI*2, r1=r*(.6+.34*this.rng()), h1=.04+.15*this.rng();
            this.bubbles.push({p:v3(p.x+r1*Math.cos(a),p.y+h1,p.z+r1*Math.sin(a)),v:v3(f.vx*.55+r1*Math.cos(a)*.72,-.46-this.rng()*.72,f.vz*.55+r1*Math.sin(a)*.72),size:.020+.030*this.rng(),life:.55+.67*this.rng()});
          }
        }
      }
      displacement+=wet*.113;
      // An entering sphere entrains an increasing mass of water. Couple that growth to its relative momentum.
      const addedMass=.52*wet;
      const entrainment=clamp((addedMass-b.addedMass)/(rho+addedMass),0,.44);
      v.x+=(f.vx-v.x)*entrainment;v.y+=(f.vy-v.y)*entrainment;v.z+=(f.vz-v.z)*entrainment;
      b.addedMass=addedMass;
      const relativeSpeed=Math.hypot(v.x-f.vx,v.y-f.vy,v.z-f.vz);
      const viscosity=.92+1.66*Math.exp(-((rho-1)**2)/.055);
      const hydrodynamic=(viscosity+relativeSpeed*.96)*wet/Math.sqrt(rho+addedMass);
      v.x+=(f.vx-v.x)*Math.min(.85,dt*hydrodynamic*2);
      v.y+=(f.vy-v.y)*Math.min(.85,dt*hydrodynamic*2)+dt*14*(wet-rho)/(rho+addedMass);
      v.z+=(f.vz-v.z)*Math.min(.85,dt*hydrodynamic*2);
      const clearance=p.y-ramp(p.x)-r;
      if(clearance<.27){
        const flow=Math.hypot(f.vx-v.x,f.vz-v.z);
        const proximity=1-smooth(.015,.27,clearance);
        const lift=(flow*flow*8.8+Math.max(0,f.vy)*3.10)*wet/rho*proximity;
        v.y+=dt*Math.min(25,lift);
      }
      p.addScaledVector(v,dt);
    }
    for(let pass=0;pass<2;pass++)for(let i=0;i<this.balls.length;i++){
      const b=this.balls[i],{p,v,r}=b;
      for(let j=0;j<i;j++){
        const a=this.balls[j],d=p.clone().sub(a.p),l=d.length(),mr=r+a.r;
        if(l>=mr||l<.0001)continue;
        d.multiplyScalar(1/l);const k=a.rho/(a.rho+b.rho);
        p.addScaledVector(d,(mr-l)*k);a.p.addScaledVector(d,-(mr-l)*(1-k));
        const closing=v.clone().sub(a.v).dot(d);
        if(closing<0){
          v.addScaledVector(d,-1.37*closing*k);a.v.addScaledVector(d,1.37*closing*(1-k));
          if(pass===0&&closing<-1.1)soundEvent('metal',-closing*.21);
        }
      }
      const floor=ramp(p.x)+r;
      b.ground=p.y<floor+.004&&v.y<.12;
      if(p.y<floor){
        if(v.y<-1.25&&pass===0)soundEvent('metal',Math.max(.2,-v.y*.08));
        p.y=floor;
        const slope=bedSlope(p.x), normal= v3(-slope,1,0).normalize(), approach=v.dot(normal);
        if(approach<0)v.addScaledVector(normal,-approach*1.10);
        v.x*=.981;v.z*=.981;
      }
      if(p.x<this.piston+r){p.x=this.piston+r;v.x=Math.max(v.x,this.speed*1.08);}
      if(p.x>rightWall-r){p.x=rightWall-r;v.x=-Math.abs(v.x)*.47;}
      const guide=waterHalfWidth(p.x)-r;
      if(Math.abs(p.z)>guide){
        const t=clamp((p.x-guideStart)/(guideEnd-guideStart),0,1);
        const normal=v3(6*guideInset*t*(1-t)/(guideEnd-guideStart),0,Math.sign(p.z)).normalize();
        p.z=clamp(p.z,-guide,guide);
        v.addScaledVector(normal,-Math.max(0,v.dot(normal))*1.49);
      }
      p.y=Math.min(4.7,p.y);
    }
    for(const b of this.balls){
      const dx=b.p.x-b.previous.x,dz=b.p.z-b.previous.z,travel=Math.hypot(dx,dz);
      if(travel<.00001)continue;
      const axis=v3(dz,0,-dx).multiplyScalar(1/travel);
      b.obj.rotateOnWorldAxis(axis,travel/b.r*(b.ground?1:.26));
    }
    const bubblePhase=Math.round(this.t/dt)%4;
    for(let i=0;i<this.bubbles.length;i++){
      const b=this.bubbles[i];
      if(i%4===bubblePhase){
        const current=this.sample({p:b.p,r:.035});
        b.v.x=mix(b.v.x,current.vx,.25);
        b.v.z=mix(b.v.z,current.vz,.25);
        b.flowY=clamp(current.vy,-.42,1.2);
      }
      b.life-=dt;b.v.y=mix(b.v.y,.50+(b.flowY||0),1-Math.exp(-dt*3.5));
      b.p.addScaledVector(b.v,dt);
      if(b.p.y>this.surface.height(b.p.x,b.p.z)+.025||b.p.y<ramp(b.p.x)||Math.abs(b.p.z)>waterHalfWidth(b.p.x))b.life=0;
    }
    this.bubbles=this.bubbles.filter(b=>b.life>0);
    this.level=this.startLevel+displacement/((rightWall-leftWall)*3.84)+this.stroke*.13;
    this.gpu.submit(dt,this.piston,this.speed,this.balls,this.drag,this.level,this.returns);
  }
  async sync(){
    const old=this.data;
    this.data=await this.gpu.readback();this.dataChanged=true;this.makeSampleField();
    const lvl=this.surface.lvl;
    this.previousLevel.set(lvl);lvl.fill(0);
    const returns=[];let runup=0,crestY=0,crestX=this.crestX;
    for(let a=0;a<this.data.length;a+=8){
      const x=this.data[a],y=this.data[a+1],z=this.data[a+2],mass=this.data[a+7];
      if(mass<=.95)continue;
      const cell=clamp(Math.floor((x+5.7)/11.4*40),0,39)+40*clamp(Math.floor((z+1.92)/3.84*15),0,14);
      lvl[cell]=Math.max(lvl[cell],y+.067);
      if(x>rightWall-.42&&mass>1.15)runup=Math.max(runup,y);
      if(y>crestY&&mass>1.44&&x>this.piston+.25){crestY=y;crestX=x;}
      const formerHeight=this.previousLevel[cell]||baseLevel;
      if(old[a+7]<1.26&&mass>1.26&&old[a+3]>.25&&old[a+5]<-.32&&y>formerHeight-.20&&y<formerHeight+.24){
        returns.push([x,y,z,clamp(-old[a+5]*.19,.075,.82)]);
      }
    }
    this.returns=returns.sort((a,b)=>b[3]-a[3]).slice(0,12);
    this.returnedDrops+=this.returns.length;
    this.averageLevel=this.measuredLevel();
    this.crestX=mix(this.crestX,crestX,.083);
    this.crestY=mix(this.crestY,crestY,.14);
    if(runup>1.61&&runup-this.wallRunup>.012&&this.t>this.wallSoundAt){
      soundEvent('splash',.42+(runup-1.61)*.8);this.wallSoundAt=this.t+.48;
    }
    this.wallRunup=runup;
  }
  prepare(){
    if(this.dataChanged){this.surface.update(this.data,this.piston);this.dataChanged=false;
      const {bubble,dummy}=this.surface;
      for(const b of this.bubbles){
        if(bubble.count>=1800)break;
        dummy.position.copy(b.p);dummy.scale.setScalar(b.size*clamp(b.life*4,0,1));dummy.updateMatrix();
        bubble.setMatrixAt(bubble.count++,dummy.matrix);
      }
      bubble.instanceMatrix.needsUpdate=true;}
    this.hardware.piston.position.x=this.piston;
    this.hardware.waterlineMarkers[0].position.y=clamp(this.averageLevel,.31,3.48);
    this.hardware.waterlineMarkers[1].position.y=clamp(this.wallRunup,.31,3.48);
    this.hardware.caustic.value=this.t;
    this.hardware.heights.image.data.set(this.surface.lvl);
    this.hardware.heights.needsUpdate=true;
    this.hardware.amp.value=this.waveEnvelope;
    for(const b of this.balls){
      b.obj.position.copy(b.p);
    }
  }
}




