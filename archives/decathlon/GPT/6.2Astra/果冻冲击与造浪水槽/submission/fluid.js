const FH = 0.225,
  FX = 40,
  FY = 18,
  FZ = 16,
  FS = FX * FY * FZ,
  FL = 8.55,
  FW = 3.16;
const shoalStart=4.7, shoalSpan=3.45, shoalRise=.72;
function bedHeight(x) {
  const t=clamp((x-shoalStart)/shoalSpan,0,1);
  return .06+shoalRise*t*t*(3-2*t);
}
function bedSlope(x) {
  const t=clamp((x-shoalStart)/shoalSpan,0,1);
  return 6*shoalRise*t*(1-t)/shoalSpan;
}
const fluidShader = `
struct Cell {m:atomic<i32>,x:atomic<i32>,y:atomic<i32>,z:atomic<i32>,head:atomic<i32>};
struct Particle {p:vec4f,v:vec4f};
struct Param {s:vec4f,impacts:array<vec4f,8>,medium:vec4f};
struct Collider {sphere:vec4f,motion:vec4f};
@group(0) @binding(0) var<storage,read_write> particles:array<Particle>;
@group(0) @binding(1) var<storage,read_write> grid:array<Cell>;
@group(0) @binding(2) var<storage,read_write> velocities:array<vec4f>;
@group(0) @binding(3) var<storage,read_write> pressures:array<vec2f>;
@group(0) @binding(4) var<storage,read_write> result:array<vec4f>;
@group(0) @binding(5) var<uniform> par:Param;
@group(0) @binding(6) var<storage,read_write> shift:array<vec4f>;
fn floorHeight(x:f32)->f32{return .06+${shoalRise}*smoothstep(${shoalStart},${shoalStart+shoalSpan},x);}
fn floorSlope(x:f32)->f32{let t=clamp((x-${shoalStart})/${shoalSpan},0.,1.);return 6.*${shoalRise}*t*(1.-t)/${shoalSpan};}
@group(0) @binding(7) var<storage,read> colliders:array<Collider>;
const h=.225;const dims=vec3i(40,18,16);
fn idx(p:vec3i)->u32 {let c=clamp(p,vec3i(0),dims-1);return u32(c.x+(c.y+c.z*18)*40);}
fn coord(i:u32)->vec3i{return vec3i(vec3u(i%40u,i/40u%18u,i/720u));}
fn wgt(f:vec3f,d:vec3i)->f32{let b=mix(1.-f,f,vec3f(d));return b.x*b.y*b.z;}
@compute @workgroup_size(128) fn clear(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=11520u){return;}atomicStore(&grid[i].head,-1);atomicStore(&grid[i].m,0);atomicStore(&grid[i].x,0);atomicStore(&grid[i].y,0);atomicStore(&grid[i].z,0);pressures[i]=vec2f(0);}
@compute @workgroup_size(128) fn deposit(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=arrayLength(&particles)){return;}let p=particles[i];let c=p.p.xyz/h;let base=vec3i(floor(c));let f=fract(c);particles[i].v.w=f32(atomicExchange(&grid[idx(base)].head,i32(i)));for(var k=0;k<8;k++){let d=vec3i(k&1,(k>>1)&1,k>>2);let j=idx(base+d);let m=wgt(f,d)*4096.;atomicAdd(&grid[j].m,i32(m));atomicAdd(&grid[j].x,i32(m*p.v.x));atomicAdd(&grid[j].y,i32(m*p.v.y));atomicAdd(&grid[j].z,i32(m*p.v.z));}}
@compute @workgroup_size(128) fn normalizeG(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=11520u){return;}let m=f32(atomicLoad(&grid[i].m));
let center=vec3f(coord(i))*h;
var solid=0.;for(var j=0u;j<u32(par.s.w);j++){
  let b=colliders[j].sphere;if(center.y>colliders[j].motion.w+.11){continue;}
  solid+=1.-smoothstep(b.w-.5*h,b.w+.5*h,distance(center,b.xyz));
}
velocities[i]=vec4f(vec3f(f32(atomicLoad(&grid[i].x)),f32(atomicLoad(&grid[i].y)),f32(atomicLoad(&grid[i].z)))/max(1.,m),m/4096.+min(1.,solid)*4.25);}
fn dir(k:i32)->vec3i{switch k{case 0:{return vec3i(-1,0,0);}case 1:{return vec3i(1,0,0);}case 2:{return vec3i(0,-1,0);}case 3:{return vec3i(0,1,0);}case 4:{return vec3i(0,0,-1);}default:{return vec3i(0,0,1);}}}
fn relax(i:u32,side:u32)->f32{let v=velocities[i];if(v.w<.2){return 0.;}let c=coord(i);var sum=0.;var div=0.;for(var k=0;k<6;k++){let d=dir(k);let j=idx(c+d);sum+=pressures[j][side];div+=dot(velocities[j].xyz,vec3f(d));}return max(0.,(sum-div*.5+clamp(v.w-(4.25-par.medium.y),0.,9.)*2.8)/6.);}
@compute @workgroup_size(128) fn jacobiA(@builtin(global_invocation_id) id:vec3u){if(id.x<11520u){pressures[id.x].y=relax(id.x,0u);}}
@compute @workgroup_size(128) fn jacobiB(@builtin(global_invocation_id) id:vec3u){if(id.x<11520u){pressures[id.x].x=relax(id.x,1u);}}
@compute @workgroup_size(128) fn separate(@builtin(global_invocation_id) id:vec3u){
let i=id.x;if(i>=arrayLength(&particles)){return;}let p=particles[i].p.xyz;let c=vec3i(floor(p/h));var dp=vec3i(0);for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){let cc=c+vec3i(x,y,z);if(any(cc<vec3i(0))||any(cc>=dims)){continue;}var j=atomicLoad(&grid[idx(cc)].head);var n=0;while(j>=0&&n<110){let other=particles[j];let d=p-other.p.xyz;let l2=dot(d,d);if(l2<.021025&&l2>.000001){let l=sqrt(l2);dp+=vec3i(round(d*(.145-l)/l*330000.));}j=i32(other.v.w);n++;}}}}
shift[i]=vec4f(clamp(vec3f(dp)*.000001,vec3f(-.04),vec3f(.04)),0);}
@compute @workgroup_size(128) fn project(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=11520u){return;}let c=coord(i);var grad=vec3f(0);for(var k=0;k<6;k++){let d=dir(k);grad+=pressures[idx(c+d)].x*vec3f(d)*.5;}var v=velocities[i].xyz-grad;v.y-=9.8*par.s.x;let loc=vec3f(c)*h;let floorY=floorHeight(loc.x);
if(loc.y<floorY+.10){v.y=max(v.y,v.x*floorSlope(loc.x));}if(loc.x<par.s.y+.09){v.x=max(v.x,par.s.z);}if(loc.x>8.43){v.x=min(v.x,0.);}if(loc.z<.10){v.z=max(v.z,0.);}if(loc.z>3.02){v.z=min(v.z,0.);}result[i]=vec4f(v,0);}
@compute @workgroup_size(128) fn advect(@builtin(global_invocation_id) id:vec3u){let i=id.x;if(i>=arrayLength(&particles)){return;}let dt=par.s.x;var p=particles[i].p.xyz;let c=p/h;let base=vec3i(floor(c));let f=fract(c);var v=vec3f(0);var change=vec3f(0);for(var k=0;k<8;k++){let d=vec3i(k&1,(k>>1)&1,k>>2);let j=idx(base+d);let w=wgt(f,d);v+=result[j].xyz*w;change+=(result[j].xyz-velocities[j].xyz)*w;}v=mix(v,particles[i].v.xyz+change,par.medium.x);v*=select(.984,.9995,par.medium.x>.9);p+=v*dt+shift[i].xyz;
let bottom=floorHeight(p.x);
if(p.y<bottom){p.y=bottom;let normal=normalize(vec3f(-floorSlope(p.x),1.,0.));v-=1.12*min(0.,dot(v,normal))*normal;}if(p.x<par.s.y+.055){p.x=par.s.y+.055+min(.045,(par.s.y+.055-p.x)*.55);v.x=max(v.x,par.s.z)*.98;}if(p.x>8.51){p.x=8.51-min(.06,(p.x-8.51)*.6);v.x=-abs(v.x)*.3;v.y+=abs(v.x)*.2;}if(p.z<.055||p.z>3.11){p.z=select(.055+min(.05,.055-p.z),3.11-min(.05,p.z-3.11),p.z>3.11);v.z*=-.5;}
for(var j=0u;j<u32(par.s.w);j++){let b=colliders[j].sphere;let d=p-b.xyz;let len=length(d);let flow=colliders[j].motion;if(flow.y<-.65&&abs(flow.w-b.y)<b.w+.045&&abs(p.y-flow.w)<.15){let r=length(d.xz);let rim=exp(-pow((r-b.w)*11.,2.)-pow((p.y-flow.w)*9.,2.));let kick=min(7.,-flow.y)*rim*dt*16.;v+=vec3f(d.x/max(.01,r)*.42,1.,d.z/max(.01,r)*.42)*kick;}if(len<b.w&&len>.00001){let n=d/len;p+=n*(b.w-len);v+=n*((b.w-len)/dt*.7+max(0.,dot(colliders[j].motion.xyz-v,n))*.5);}}
for(var k=0u;k<8u;k++){let drop=par.impacts[k];if(drop.w<.00001){break;}let d=p-drop.xyz;let gain=exp(-dot(d,d)*65.)*drop.w;v+=gain*vec3f(d.x*3.,-1.,d.z*3.);}p.x=clamp(p.x,par.s.y+.04,8.52);p.z=clamp(p.z,.04,3.12);if(p.y>3.78){v.y=min(v.y,0.);}p.y=clamp(p.y,bottom,3.78);particles[i].p=vec4f(p,1);particles[i].v=vec4f(clamp(v,vec3f(-10),vec3f(10)),0);}
`;
class Liquid {
  async init() {
    if (!Liquid.device) {
      let adapter = await navigator.gpu.requestAdapter();
      Liquid.device = await adapter.requestDevice();
    }
    let dev = (this.dev = Liquid.device);
    let arr = [],
      seed = 378;
    function rnd() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }
    for (let z = 0.09; z < 3.12; z += 0.137)
      for (let y = 0.09; y < 1.58; y += 0.137)
        for (let x = 0.31; x < 8.5; x += 0.137) {
          if (y < bedHeight(x)) continue;
          arr.push(
            x + (rnd() - 0.5) * 0.04,
            y + (rnd() - 0.5) * 0.04,
            z + (rnd() - 0.5) * 0.04,
            1,
            0,
            0,
            0,
            0,
          );
        }
    this.state = new Float32Array(arr);
    this.count = arr.length / 8;
    this.size = arr.length * 4;
    let mk = (size, usage) => dev.createBuffer({ size, usage });
    let S = GPUBufferUsage.STORAGE,
      C = GPUBufferUsage.COPY_DST;
    this.colliderCapacity=32;
    this.b = [
      mk(this.size, S | C | GPUBufferUsage.COPY_SRC),
      mk(FS * 20, S),
      mk(FS * 16, S),
      mk(FS * 8, S),
      mk(FS * 16, S),
      mk(160, GPUBufferUsage.UNIFORM | C),
      mk(this.count * 16, S),
      mk(this.colliderCapacity*32,S|C),
    ];
    this.read = mk(this.size, GPUBufferUsage.MAP_READ | C);
    dev.queue.writeBuffer(this.b[0], 0, this.state);
    let layout = this.layout = dev.createBindGroupLayout({
      entries: this.b.map((b, i) => ({
        binding: i,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: i === 5 ? 'uniform' : i === 7 ? 'read-only-storage' : 'storage' },
      })),
    });
    this.bind = dev.createBindGroup({
      layout,
      entries: this.b.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });
    let mod = dev.createShaderModule({ code: fluidShader });
    let info = await mod.getCompilationInfo();
    if (info.messages.some((m) => m.type == 'error'))
      throw Error(info.messages.map((m) => m.message).join(' '));
    let pl = dev.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipe = {};
    for (let name of [
      'clear',
      'deposit',
      'normalizeG',
      'separate',
      'jacobiA',
      'jacobiB',
      'project',
      'advect',
    ])
      this.pipe[name] = dev.createComputePipeline({
        layout: pl,
        compute: { module: mod, entryPoint: name },
      });
    this.piston = 0.23;
    if (Liquid.resting) {
      this.state.set(Liquid.resting);
      dev.queue.writeBuffer(this.b[0], 0, this.state);
    } else {
      for (let i = 0; i < 78; i++) await this.step(1 / 60, 0.23, []);
      Liquid.resting = this.state.slice();
    }
    this.surface();
    this.referenceVolume=this.occupiedVolume();
    this.densityBias=0;
    return this;
  }
  async step(dt, piston, balls, impacts = []) {
    let data = new Float32Array(40);
    data.set([dt, piston, (piston - this.piston) / dt, balls.length]);
    // Compensate residual volume drift from the finite pressure iteration budget.
    // The correction enters the grid pressure RHS, leaving free-surface motion to the particles.
    if(this.referenceVolume && this.smooth){
      let immersed=0;
      for(const b of balls){
        const depth=clamp(this.height(b.x,b.z)-b.y+b.r,0,2*b.r);
        immersed+=Math.PI*depth*depth*(b.r-depth/3);
      }
      const error=(this.referenceVolume+immersed-this.occupiedVolume())/this.referenceVolume;
      const response=wave?.55:3.6;
      this.densityBias=clamp(this.densityBias+error*dt*response,-.22,.32);
      data[37]=clamp(this.densityBias+error*(wave?.6:3.5),-.4,.5);
    }
    this.piston = piston;
    if(balls.length>this.colliderCapacity){
      this.colliderCapacity=2**Math.ceil(Math.log2(balls.length));
      this.b[7].destroy();
      this.b[7]=this.dev.createBuffer({size:this.colliderCapacity*32,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
      this.bind=this.dev.createBindGroup({layout:this.layout,entries:this.b.map((buffer,binding)=>({binding,resource:{buffer}}))});
    }
    if(balls.length){
      const shapes=new Float32Array(balls.length*8);
      balls.forEach((b,i)=>shapes.set([b.x+FL/2,b.y,b.z+FW/2,b.r+.025,b.vx,b.vy,b.vz,this.height(b.x,b.z)],i*8));
      this.dev.queue.writeBuffer(this.b[7],0,shapes);
    }
    data[36]=wave?.94:.68;
    impacts.slice(0,8).forEach((hit,i)=>data.set(hit,4+i*4));
    let dev = this.dev;
    dev.queue.writeBuffer(this.b[5], 0, data);
    let e = dev.createCommandEncoder(),
      pass = e.beginComputePass();
    pass.setBindGroup(0, this.bind);
    for (let n of [
      'clear',
      'deposit',
      'normalizeG',
      'separate',
      ...Array(13).fill(['jacobiA', 'jacobiB']).flat(),
      'project',
      'advect',
    ]) {
      pass.setPipeline(this.pipe[n]);
      pass.dispatchWorkgroups(
        Math.ceil((n == 'deposit' || n == 'advect' || n == 'separate' ? this.count : FS) / 128),
      );
    }
    pass.end();
    e.copyBufferToBuffer(this.b[0], 0, this.read, 0, this.size);
    dev.queue.submit([e.finish()]);
    await this.read.mapAsync(GPUMapMode.READ);
    this.state.set(new Float32Array(this.read.getMappedRange()));
    this.read.unmap();
    this.surface();
  }
  surface() {
    let nx = 63,
      nz = 25,
      heights = this.heights || new Float32Array(nx * nz),
      weights = new Float32Array(nx * nz);
    heights.fill(0);
    let a = this.state;
    for (let i = 0; i < a.length; i += 8) {
      let x = clamp(Math.round((a[i] / FL) * (nx - 1)), 0, nx - 1),
        z = clamp(Math.round((a[i + 2] / FW) * (nz - 1)), 0, nz - 1),
        j = x + z * nx;
      heights[j] = Math.max(heights[j], a[i + 1]);
      weights[j]++;
    }
    this.heights = heights;
    this.smooth = this.smooth || new Float32Array(nx * nz);
    for (let z = 0; z < nz; z++)
      for (let x = 0; x < nx; x++) {
        let sum = 0,
          w = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            let j = clamp(z + dz, 0, nz - 1) * nx + clamp(x + dx, 0, nx - 1),
              k = (2 - Math.abs(dx)) * (2 - Math.abs(dz));
            if (weights[j]) {
              sum += heights[j] * k;
              w += k;
            }
          }
        this.smooth[x + nx * z] = w ? sum / w : 1.52;
      }
  }
  occupiedVolume(){
    let sum=0;
    const dx=FL/62,dz=FW/24;
    for(let z=0;z<24;z++)for(let x=0;x<62;x++){
      const width=clamp((x+1)*dx-this.piston,0,dx);
      const j=x+63*z;
      const height=(this.smooth[j]+this.smooth[j+1]+this.smooth[j+63]+this.smooth[j+64])*.25;
      sum+=width*dz*Math.max(0,height-bedHeight((x+.5)*dx));
    }
    return sum;
  }
  height(x, z) {
    let ix = clamp(Math.round((x / FL + 0.5) * 62), 2, 60),
      iz = clamp(Math.round((z / FW + 0.5) * 24), 2, 22),
      j = ix + iz * 63,
      s = this.smooth;
    return (s[j] * 2 + s[j - 2] + s[j + 2] + s[j - 126] + s[j + 126]) / 6;
  }
  destroy() {
    this.b?.forEach((b) => b.destroy());
    this.read?.destroy();
  }
}
