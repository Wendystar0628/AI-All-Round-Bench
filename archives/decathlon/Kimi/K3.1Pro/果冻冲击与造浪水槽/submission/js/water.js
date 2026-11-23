(function () {
  const shader = `
struct Params {
  dims: vec4<u32>,
  dmin: vec4<f32>,
  dmax: vec4<f32>,
  motion: vec4<f32>,
  fluid: vec4<f32>,
  counts: vec4<u32>,
}
struct Ball { pos: vec4<f32>, vel: vec4<f32>, }
@group(0) @binding(0) var<uniform> U: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> momentum: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> gridVel: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> oldVel: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read_write> pressure0: array<f32>;
@group(0) @binding(7) var<storage, read_write> pressure1: array<f32>;
@group(0) @binding(8) var<storage, read> balls: array<Ball>;

fn cellIndex(x: i32, y: i32, z: i32) -> i32 {
  return x + i32(U.dims.x) * (y + i32(U.dims.y) * z);
}
fn inGrid(x: i32, y: i32, z: i32) -> bool {
  return x >= 0 && y >= 0 && z >= 0 && x < i32(U.dims.x) && y < i32(U.dims.y) && z < i32(U.dims.z);
}
fn cellPos(x: i32, y: i32, z: i32) -> vec3<f32> {
  return U.dmin.xyz + (vec3<f32>(f32(x), f32(y), f32(z)) + vec3<f32>(.5)) * U.dmin.w;
}
fn terrain(x: f32, z: f32) -> f32 {
  let shoal = smoothstep(1.0, 3.45, x) * .58;
  let hump = .19 * exp(-((x + .35) * (x + .35) / .8 + z * z / .65));
  return .045 + shoal + hump;
}
fn solidAt(x: i32, y: i32, z: i32) -> bool {
  if (!inGrid(x,y,z)) { return true; }
  let p = cellPos(x,y,z);
  return p.y < terrain(p.x,p.z) || p.x < -3.6 + U.motion.y || p.x > 3.6 || abs(p.z) > 1.45;
}
fn velocityAt(x: i32, y: i32, z: i32) -> vec3<f32> {
  if (solidAt(x,y,z)) {
    let p = cellPos(x,y,z);
    if (p.x < -3.6 + U.motion.y + U.dmin.w) { return vec3<f32>(U.motion.z,0.,0.); }
    return vec3<f32>(0.);
  }
  return gridVel[cellIndex(x,y,z)].xyz;
}
fn pressureAt(x: i32, y: i32, z: i32, center: f32, parity: u32) -> f32 {
  if (solidAt(x,y,z)) { return center; }
  let idx = cellIndex(x,y,z);
  if (gridVel[idx].w < .00008) { return 0.; }
  if (parity == 0u) { return pressure0[idx]; }
  return pressure1[idx];
}
fn sampleGrid(p: vec3<f32>, old: bool) -> vec4<f32> {
  let g = (p - U.dmin.xyz) / U.dmin.w - vec3<f32>(.5);
  let b = vec3<i32>(floor(g));
  let f = fract(g);
  var result = vec4<f32>(0.);
  for (var k=0u; k<8u; k++) {
    let ox = i32(k & 1u); let oy = i32((k >> 1u) & 1u); let oz = i32((k >> 2u) & 1u);
    let x=b.x+ox; let y=b.y+oy; let z=b.z+oz;
    if (!inGrid(x,y,z)) { continue; }
    let w = (1.-abs(f.x-f32(ox))) * (1.-abs(f.y-f32(oy))) * (1.-abs(f.z-f32(oz)));
    let idx=cellIndex(x,y,z);
    if (old) { result += vec4<f32>(oldVel[idx].xyz,gridVel[idx].w) * w; }
    else { result += gridVel[idx] * w; }
  }
  return result;
}

@compute @workgroup_size(64)
fn clearGrid(@builtin(global_invocation_id) id: vec3<u32>) {
  let i=id.x; let cells=U.dims.x*U.dims.y*U.dims.z;
  if (i>=cells) { return; }
  atomicStore(&momentum[i*4u],0); atomicStore(&momentum[i*4u+1u],0);
  atomicStore(&momentum[i*4u+2u],0); atomicStore(&momentum[i*4u+3u],0);
  gridVel[i]=vec4<f32>(0.); oldVel[i]=vec4<f32>(0.); pressure0[i]=0.; pressure1[i]=0.;
}

@compute @workgroup_size(64)
fn particleToGrid(@builtin(global_invocation_id) id: vec3<u32>) {
  let i=id.x; if(i>=U.dims.w){return;}
  let p=particles[i].xyz; let v=velocities[i].xyz;
  let g=(p-U.dmin.xyz)/U.dmin.w-vec3<f32>(.5);
  let b=vec3<i32>(floor(g)); let f=fract(g);
  for(var k=0u;k<8u;k++){
    let ox=i32(k&1u);let oy=i32((k>>1u)&1u);let oz=i32((k>>2u)&1u);
    let x=b.x+ox;let y=b.y+oy;let z=b.z+oz;
    if(!inGrid(x,y,z)){continue;}
    let w=(1.-abs(f.x-f32(ox)))*(1.-abs(f.y-f32(oy)))*(1.-abs(f.z-f32(oz)));
    let idx=u32(cellIndex(x,y,z))*4u;
    atomicAdd(&momentum[idx],i32(w*1000000.));
    atomicAdd(&momentum[idx+1u],i32(w*v.x*1000000.));
    atomicAdd(&momentum[idx+2u],i32(w*v.y*1000000.));
    atomicAdd(&momentum[idx+3u],i32(w*v.z*1000000.));
  }
}

@compute @workgroup_size(64)
fn normalizeGrid(@builtin(global_invocation_id) id: vec3<u32>) {
  let i=id.x;let cells=U.dims.x*U.dims.y*U.dims.z;if(i>=cells){return;}
  let mass=f32(atomicLoad(&momentum[i*4u]))/1000000.;
  var v=vec3<f32>(0.);
  if(mass>.000001){
    v=vec3<f32>(f32(atomicLoad(&momentum[i*4u+1u])),f32(atomicLoad(&momentum[i*4u+2u])),f32(atomicLoad(&momentum[i*4u+3u])))/1000000./mass;
    v.y-=9.81*U.dmax.w;
    v*=exp(-U.fluid.y*U.dmax.w);
  }
  let x=i32(i%U.dims.x);let y=i32((i/U.dims.x)%U.dims.y);let z=i32(i/(U.dims.x*U.dims.y));let p=cellPos(x,y,z);
  if(solidAt(x,y,z)){
    if(p.x < -3.6+U.motion.y+U.dmin.w){v=vec3<f32>(U.motion.z,0.,0.);}else{v=vec3<f32>(0.);}
  }else if(mass>.00008){
    let paddleDistance=max(0.,p.x-(-3.6+U.motion.y));
    let drive=(1.-smoothstep(0.,U.dmin.w*3.2,paddleDistance))*.9;
    v.x=mix(v.x,U.motion.z,drive);
  }
  gridVel[i]=vec4<f32>(v,mass);oldVel[i]=vec4<f32>(v,0.);
}

@compute @workgroup_size(64)
fn divergence(@builtin(global_invocation_id) id: vec3<u32>) {
  let i=id.x;let cells=U.dims.x*U.dims.y*U.dims.z;if(i>=cells){return;}
  pressure0[i]=0.;pressure1[i]=0.;
  if(gridVel[i].w<.00008){oldVel[i].w=0.;return;}
  let x=i32(i%U.dims.x);let y=i32((i/U.dims.x)%U.dims.y);let z=i32(i/(U.dims.x*U.dims.y));
  let d=(velocityAt(x+1,y,z).x-velocityAt(x-1,y,z).x+velocityAt(x,y+1,z).y-velocityAt(x,y-1,z).y+velocityAt(x,y,z+1).z-velocityAt(x,y,z-1).z)/(2.*U.dmin.w);
  oldVel[i].w=d;
}

fn pressureSolve(i:u32, parity:u32){
  let cells=U.dims.x*U.dims.y*U.dims.z;if(i>=cells){return;}
  if(gridVel[i].w<.00008){if(parity==0u){pressure1[i]=0.;}else{pressure0[i]=0.;}return;}
  let x=i32(i%U.dims.x);let y=i32((i/U.dims.x)%U.dims.y);let z=i32(i/(U.dims.x*U.dims.y));
  var center=0.;if(parity==0u){center=pressure0[i];}else{center=pressure1[i];}
  let sum=pressureAt(x+1,y,z,center,parity)+pressureAt(x-1,y,z,center,parity)+pressureAt(x,y+1,z,center,parity)+pressureAt(x,y-1,z,center,parity)+pressureAt(x,y,z+1,center,parity)+pressureAt(x,y,z-1,center,parity);
  let p=(sum-oldVel[i].w*U.dmin.w*U.dmin.w)/6.;
  if(parity==0u){pressure1[i]=p;}else{pressure0[i]=p;}
}
@compute @workgroup_size(64) fn pressureEven(@builtin(global_invocation_id) id:vec3<u32>){pressureSolve(id.x,0u);}
@compute @workgroup_size(64) fn pressureOdd(@builtin(global_invocation_id) id:vec3<u32>){pressureSolve(id.x,1u);}

@compute @workgroup_size(64)
fn project(@builtin(global_invocation_id) id:vec3<u32>){
  let i=id.x;let cells=U.dims.x*U.dims.y*U.dims.z;if(i>=cells){return;}
  if(gridVel[i].w<.00008){return;}
  let x=i32(i%U.dims.x);let y=i32((i/U.dims.x)%U.dims.y);let z=i32(i/(U.dims.x*U.dims.y));let center=pressure0[i];
  let gradient=vec3<f32>(pressureAt(x+1,y,z,center,0u)-pressureAt(x-1,y,z,center,0u),pressureAt(x,y+1,z,center,0u)-pressureAt(x,y-1,z,center,0u),pressureAt(x,y,z+1,center,0u)-pressureAt(x,y,z-1,center,0u))/(2.*U.dmin.w);
  var v=oldVel[i].xyz-gradient;
  if(solidAt(x,y,z)){v=vec3<f32>(0.);}
  gridVel[i]=vec4<f32>(v,gridVel[i].w);
}

@compute @workgroup_size(64)
fn gridToParticle(@builtin(global_invocation_id) id:vec3<u32>){
  let i=id.x;if(i>=U.dims.w){return;}
  var p=particles[i];var v=velocities[i].xyz;
  let old=sampleGrid(p.xyz,true).xyz;let current=sampleGrid(p.xyz,false);
  v=mix(current.xyz,v+current.xyz-old,.97);
  let dt=U.dmax.w;
  for(var b=0u;b<U.counts.x;b++){
    let bp=balls[b].pos.xyz;let br=balls[b].pos.w;let bv=balls[b].vel.xyz;
    let delta=p.xyz-bp;let dist=length(delta);let minDist=br+.047;
    if(dist<minDist&&dist>.0001){
      let n=delta/dist;let rel=dot(bv-v,n);let impact=max(0.,rel)*clamp(balls[b].vel.w,.5,2.5);
      p.xyz=bp+n*minDist;
      v+=n*impact*1.32;
      let horizontal=normalize(vec3<f32>(n.x,.12,n.z)+vec3<f32>(.0001,0.,0.));
      if(bp.y>p.y-.05&&impact>.65){v+=horizontal*impact*.22+vec3<f32>(0.,impact*.2,0.);p.w=min(1.,p.w+impact*.24);}
    }
    let radial=vec2<f32>(p.x-bp.x,p.z-bp.z);let ring=max(.001,length(radial));
    let impactSpeed=max(0.,-bv.y)*clamp(balls[b].vel.w,.5,2.5);
    let crown=(1.-smoothstep(br*.55,br*2.35,ring))*(1.-smoothstep(.08,.3,abs(p.y-U.fluid.w)))*(1.-smoothstep(.08,.36,abs(bp.y-U.fluid.w)));
    if(crown>.005&&impactSpeed>.7){
      let direction=vec3<f32>(radial.x/ring,0.,radial.y/ring);
      v+=(direction*impactSpeed*crown*2.8+vec3<f32>(0.,impactSpeed*crown*4.8,0.))*dt;
      p.w=min(1.,p.w+crown*.9*dt);
    }
  }
  let shoal=smoothstep(.65,1.55,p.x)*(1.-smoothstep(2.75,3.5,p.x));
  let crest=smoothstep(-.18,.22,p.y-U.fluid.w);
  let breaking=shoal*crest*(1.-smoothstep(.16,.82,current.w))*smoothstep(.35,1.05,v.x)*smoothstep(.42,.82,U.motion.w);
  if(breaking>.002){
    v.x+=breaking*5.2*dt;
    if(p.y<U.fluid.w+.42){v.y+=breaking*4.4*dt;}else{v.y-=breaking*3.2*dt;}
    p.w=min(1.,p.w+breaking*.9*dt);
  }
  p.xyz+=v*dt;
  let piston=-3.6+U.motion.y+.042;
  if(p.x<piston){p.x=piston;v.x=max(U.motion.z,v.x*-.18);}
  if(p.x>3.558){p.x=3.558;v.x=-abs(v.x)*.28;}
  if(abs(p.z)>1.405){p.z=sign(p.z)*1.405;v.z=-v.z*.28;}
  let floorY=terrain(p.x,p.z)+.038;
  if(p.y<floorY){p.y=floorY;v.y=abs(v.y)*.12;v.x*=.985;v.z*=.985;}
  if(p.y>4.7){p.y=4.7;v.y=-abs(v.y)*.2;}
  let mass=sampleGrid(p.xyz,false).w;
  let exposed=1.-smoothstep(.1,.9,mass);
  let speed=length(v);
  var foam=p.w*exp(-mix(.85,.24,clamp(U.motion.w*2.,0.,1.))*dt);
  let activity=max(U.motion.w,clamp((speed-1.35)*.55,0.,1.));
  if(speed>.7){foam+=exposed*(speed-.7)*dt*(1.1+U.motion.w*2.2)*activity;}
  if(p.y>U.fluid.w+.18&&speed>2.2){foam+=dt*.35;}
  p.w=clamp(foam,0.,1.);
  particles[i]=p;
  velocities[i]=vec4<f32>(v,mass);
}
`;

  class WaveWater {
    constructor(device, adapter) {
      this.device=device;this.adapter=adapter;this.ready=false;this.busy=false;
      this.nx=56;this.ny=30;this.nz=24;this.cells=this.nx*this.ny*this.nz;this.dx=.14;
      this.min=[-3.92,0,-1.68];this.max=[3.92,4.2,1.68];
      this.time=0;this.phase=0;this.running=false;this.amplitude=.62;this.currentAmplitude=0;this.frequency=.65;
      this.foamAmount=0;this.meanLevel=1.65;this.maxSpeed=0;this.energy=0;
      this.uniformData=new ArrayBuffer(96);this.f32=new Float32Array(this.uniformData);this.u32=new Uint32Array(this.uniformData);
    }

    static async create() {
      if(!navigator.gpu)throw new Error('WebGPU unavailable');
      const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
      if(!adapter)throw new Error('WebGPU adapter unavailable');
      const device=await adapter.requestDevice();
      const water=new WaveWater(device,adapter);await water.init();return water;
    }

    buffer(size,usage){return this.device.createBuffer({size,usage});}

    async init(){
      const d=this.device;
      this.uniform=this.buffer(96,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
      const positions=[],velocities=[];
      const sx=.134,sy=.134,sz=.134;
      const nx=50,ny=13,nz=21;
      this.count=nx*ny*nz;
      let id=0;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const jx=Math.sin(id*12.9898)*.014,jz=Math.sin(id*7.131)*.014;
        positions.push(-3.04+x*sx+jx,.09+y*sy,-1.32+z*sz+jz,0);
        velocities.push(0,0,0,1);id++;
      }
      this.positions=new Float32Array(positions);this.velocities=new Float32Array(velocities);
      const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC;
      this.particleBuffer=this.buffer(this.positions.byteLength,storage);
      this.velocityBuffer=this.buffer(this.velocities.byteLength,storage);
      this.momentumBuffer=this.buffer(this.cells*4*4,storage);
      this.gridBuffer=this.buffer(this.cells*4*4,storage);
      this.oldGridBuffer=this.buffer(this.cells*4*4,storage);
      this.pressure0Buffer=this.buffer(this.cells*4,storage);
      this.pressure1Buffer=this.buffer(this.cells*4,storage);
      this.ballBuffer=this.buffer(16*32,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
      this.readPosition=this.buffer(this.positions.byteLength,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
      this.readVelocity=this.buffer(this.velocities.byteLength,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST);
      d.queue.writeBuffer(this.particleBuffer,0,this.positions);d.queue.writeBuffer(this.velocityBuffer,0,this.velocities);
      const module=d.createShaderModule({code:shader});
      const entries=['clearGrid','particleToGrid','normalizeGrid','divergence','pressureEven','pressureOdd','project','gridToParticle'];
      const info=await module.getCompilationInfo();const errors=Array.from(info.messages).filter(m=>m.type==='error');
      if(errors.length)throw new Error(errors.map(e=>e.message).join('\n'));
      const bindLayout=d.createBindGroupLayout({entries:[
        {binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'uniform'}},
        {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
        {binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
        {binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:6,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},
        {binding:7,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}},{binding:8,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}}
      ]});
      const pipelineLayout=d.createPipelineLayout({bindGroupLayouts:[bindLayout]});
      this.pipelines={};
      for(const entry of entries)this.pipelines[entry]=d.createComputePipeline({layout:pipelineLayout,compute:{module,entryPoint:entry}});
      this.bindGroup=d.createBindGroup({layout:bindLayout,entries:[
        {binding:0,resource:{buffer:this.uniform}},{binding:1,resource:{buffer:this.particleBuffer}},{binding:2,resource:{buffer:this.velocityBuffer}},
        {binding:3,resource:{buffer:this.momentumBuffer}},{binding:4,resource:{buffer:this.gridBuffer}},{binding:5,resource:{buffer:this.oldGridBuffer}},
        {binding:6,resource:{buffer:this.pressure0Buffer}},{binding:7,resource:{buffer:this.pressure1Buffer}},{binding:8,resource:{buffer:this.ballBuffer}}
      ]});
      this.ready=true;
    }

    setWave(running,amplitude=this.amplitude,frequency=this.frequency){if(running)this.hasWaved=true;this.running=running;this.amplitude=amplitude;this.frequency=frequency;}

    async reset(){
      if(!this.ready)return;
      this.time=0;this.phase=0;this.currentAmplitude=0;this.hasWaved=false;
      let id=0;const nx=50,ny=13,nz=21,s=.134;
      for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
        const k=id*4;this.positions[k]=-3.04+x*s+Math.sin(id*12.9898)*.014;this.positions[k+1]=.09+y*s;this.positions[k+2]=-1.32+z*s+Math.sin(id*7.131)*.014;this.positions[k+3]=0;
        this.velocities[k]=this.velocities[k+1]=this.velocities[k+2]=0;this.velocities[k+3]=1;id++;
      }
      this.device.queue.writeBuffer(this.particleBuffer,0,this.positions);this.device.queue.writeBuffer(this.velocityBuffer,0,this.velocities);
      await this.step(.001,[]);
    }

    updateUniform(dt){
      this.u32[0]=this.nx;this.u32[1]=this.ny;this.u32[2]=this.nz;this.u32[3]=this.count;
      this.f32[4]=this.min[0];this.f32[5]=this.min[1];this.f32[6]=this.min[2];this.f32[7]=this.dx;
      this.f32[8]=this.max[0];this.f32[9]=this.max[1];this.f32[10]=this.max[2];this.f32[11]=dt;
      const amp=this.currentAmplitude*.72;
      const paddle=Math.max(.08,.45+amp*Math.sin(this.phase)),paddleV=amp*Math.cos(this.phase)*this.frequency*Math.PI*2;
      this.f32[12]=this.time;this.f32[13]=paddle;this.f32[14]=paddleV;this.f32[15]=this.currentAmplitude;
      this.f32[16]=-9.81;this.f32[17]=this.running?.065:this.hasWaved?2.2:.35;this.f32[18]=this.amplitude;this.f32[19]=this.meanLevel;
      this.u32[20]=this.ballCount||0;this.u32[21]=0;this.u32[22]=0;this.u32[23]=0;
      this.device.queue.writeBuffer(this.uniform,0,this.uniformData);
    }

    encodeStep(encoder,dt,balls){
      this.updateUniform(dt);
      const data=new Float32Array(16*8);
      this.ballCount=Math.min(16,balls.length);this.u32[20]=this.ballCount;
      for(let i=0;i<this.ballCount;i++){
        const b=balls[i],k=i*8;data[k]=b.position.x;data[k+1]=b.position.y;data[k+2]=b.position.z;data[k+3]=b.radius;
        data[k+4]=b.velocity.x;data[k+5]=b.velocity.y;data[k+6]=b.velocity.z;data[k+7]=b.density||1;
      }
      this.device.queue.writeBuffer(this.ballBuffer,0,data);this.device.queue.writeBuffer(this.uniform,0,this.uniformData);
      const pass=encoder.beginComputePass(),dispatchCells=Math.ceil(this.cells/64),dispatchParticles=Math.ceil(this.count/64);
      pass.setBindGroup(0,this.bindGroup);
      const run=(name,dispatch)=>{pass.setPipeline(this.pipelines[name]);pass.dispatchWorkgroups(dispatch);};
      run('clearGrid',dispatchCells);run('particleToGrid',dispatchParticles);run('normalizeGrid',dispatchCells);run('divergence',dispatchCells);
      for(let i=0;i<32;i++)run(i%2===0?'pressureEven':'pressureOdd',dispatchCells);
      run('project',dispatchCells);run('gridToParticle',dispatchParticles);pass.end();
    }

    async step(dt,balls=[]){
      if(!this.ready||this.busy)return;this.busy=true;
      try{
        const steps=Math.max(1,Math.ceil(dt/(1/60))),h=dt/steps;
        for(let s=0;s<steps;s++){
          this.time+=h;this.phase+=h*this.frequency*Math.PI*2;
          const target=this.running?this.amplitude:0;this.currentAmplitude+=(target-this.currentAmplitude)*(1-Math.exp(-(this.running?1.4:1.8)*h));
          const encoder=this.device.createCommandEncoder();this.encodeStep(encoder,h,balls);
          if(s===steps-1){encoder.copyBufferToBuffer(this.particleBuffer,0,this.readPosition,0,this.positions.byteLength);encoder.copyBufferToBuffer(this.velocityBuffer,0,this.readVelocity,0,this.velocities.byteLength);}
          this.device.queue.submit([encoder.finish()]);
        }
        await Promise.all([this.readPosition.mapAsync(GPUMapMode.READ),this.readVelocity.mapAsync(GPUMapMode.READ)]);
        this.positions.set(new Float32Array(this.readPosition.getMappedRange()));this.velocities.set(new Float32Array(this.readVelocity.getMappedRange()));
        this.readPosition.unmap();this.readVelocity.unmap();this.updateStats();
      }finally{this.busy=false;}
    }

    updateStats(){
      let foam=0,maxSpeed=0,energy=0;
      for(let i=0;i<this.count;i++){
        const k=i*4;foam+=this.positions[k+3];const speed=Math.hypot(this.velocities[k],this.velocities[k+1],this.velocities[k+2]);maxSpeed=Math.max(maxSpeed,speed);energy+=speed*speed;
      }
      this.foamAmount=foam/this.count;this.maxSpeed=maxSpeed;this.energy=energy/this.count;
    }

    surface(nx=65,nz=27){
      const top=new Float32Array(nx*nz),foam=new Float32Array(nx*nz),second=new Float32Array(nx*nz);
      top.fill(-1);second.fill(-1);
      for(let i=0;i<this.count;i++){
        const k=i*4,x=this.positions[k],y=this.positions[k+1],z=this.positions[k+2],mass=this.velocities[k+3];
        if(mass<.24||y>3.15)continue;
        const ix=Math.max(0,Math.min(nx-1,Math.round((x+3.6)/7.2*(nx-1)))),iz=Math.max(0,Math.min(nz-1,Math.round((z+1.45)/2.9*(nz-1)))),id=ix+nx*iz;
        if(y>top[id]){second[id]=top[id];top[id]=y+.05;foam[id]=this.positions[k+3];}else if(y>second[id])second[id]=y;
        if(Math.abs(y-top[id])<.24)foam[id]=Math.max(foam[id],this.positions[k+3]);
      }
      for(let i=0;i<top.length;i++)if(second[i]>0&&top[i]-second[i]>.24)top[i]=(top[i]+second[i]*2)/3;
      for(let pass=0;pass<6;pass++){
        const next=new Float32Array(top),nf=new Float32Array(foam);
        for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
          const i=x+nx*z;let sum=top[i]>0?top[i]*2:this.meanLevel*2,fs=foam[i]*2,w=2;
          for(const q of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]])if(q[0]>=0&&q[0]<nx&&q[1]>=0&&q[1]<nz){const j=q[0]+nx*q[1];if(top[j]>0){sum+=top[j];fs+=foam[j];w++;}}
          next[i]=sum/w;nf[i]=fs/w;
        }
        top.set(next);foam.set(nf);
      }
      let level=0;for(let i=0;i<top.length;i++)level+=top[i];this.meanLevel=level/top.length;
      return{top,foam,nx,nz};
    }
  }

  window.WaveWater=WaveWater;
})();
