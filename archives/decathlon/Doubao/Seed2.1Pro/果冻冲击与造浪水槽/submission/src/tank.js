'use strict';
/* WebGPU MPM 水体求解器宿主：缓冲、管线、子步推进、刚球 CPU 积分与读回。 */

const MAX_BALLS = 8;

class TankSim {
  constructor(){
    this.ready=false;
  }
  async init(){
    if(!navigator.gpu) throw new Error('WebGPU 不可用');
    this.adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
    this.device=await this.adapter.requestDevice();
    const C=this.cfg={
      nx:72, ny:28, nz:20, h:0.0625,
      waterLevel:0.62,
      x0:0.35, z0:0.14,
      length:72*0.0625, // 4.5
      width:20*0.0625,  // 1.25
      height:28*0.0625 // 1.75
    };
    C.rampStart=3.45; C.reefX=2.55; C.reefZ=0.625; C.reefR=0.42;
    this.N=(C.nx+1)*(C.ny+1)*(C.nz+1);
    // —— 粒子：在初始水域内按 h*0.5 间距填充 ——
    const spacing=C.h*0.5;
    const positions=[];
    const rng=APP.mulberry32(12345);
    const xStart=C.x0+spacing, xEnd=C.rampStart-0.08;
    const zEnd=C.width-C.z0-spacing;
    for(let x=xStart;x<xEnd;x+=spacing)
    for(let y=spacing;y<C.waterLevel-spacing*0.5;y+=spacing)
    for(let z=C.z0+spacing;z<zEnd;z+=spacing){
      // 地形之下不放
      const ty=this._terrainY(x,z,C);
      if(y<ty+spacing*1.2) continue;
      positions.push([x+(rng()-0.5)*spacing*0.4,y+(rng()-0.5)*spacing*0.4,z+(rng()-0.5)*spacing*0.4]);
    }
    this.np=positions.length;
    // 缓冲
    const D=this.device, n=this.N;
    this.bGridM=D.createBuffer({size:n*4, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.bGridV=D.createBuffer({size:n*16, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    const pbytes=this.np*16;
    this.bPos=D.createBuffer({size:pbytes, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.bVel=D.createBuffer({size:pbytes, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.bC0=D.createBuffer({size:pbytes, usage:GPUBufferUsage.STORAGE});
    this.bC1=D.createBuffer({size:pbytes, usage:GPUBufferUsage.STORAGE});
    this.bC2=D.createBuffer({size:pbytes, usage:GPUBufferUsage.STORAGE});
    this.bJp=D.createBuffer({size:pbytes, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.bBalls=D.createBuffer({size:MAX_BALLS*32, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.bForce=D.createBuffer({size:MAX_BALLS*16, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.bStats=D.createBuffer({size:n*4, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    this.paramsBuf=D.createBuffer({size:128, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.stagingBuf=D.createBuffer({size:n*4, usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    this.forceStage=D.createBuffer({size:MAX_BALLS*16, usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});

    // 初始数据
    const posArr=new Float32Array(this.np*4);
    const velArr=new Float32Array(this.np*4);
    const jpArr=new Float32Array(this.np*4);
    positions.forEach((p,i)=>{posArr[i*4]=p[0];posArr[i*4+1]=p[1];posArr[i*4+2]=p[2];posArr[i*4+3]=1;
      jpArr[i*4]=1;});
    D.queue.writeBuffer(this.bPos,0,posArr);
    D.queue.writeBuffer(this.bVel,0,velArr);
    D.queue.writeBuffer(this.bJp,0,jpArr);

    // 管线
    const mod=D.createShaderModule({code:TANK_WGSL});
    const mk=(entry,count)=>{
      const pipe=D.createComputePipeline({layout:'auto',
        compute:{module:mod,entryPoint:entry}});
      const bind=D.createBindGroup({layout:pipe.getBindGroupLayout(0), entries:[
        {binding:0,resource:{buffer:this.paramsBuf}},
        {binding:1,resource:{buffer:this.bGridM}},
        {binding:2,resource:{buffer:this.bGridV}},
        {binding:3,resource:{buffer:this.bPos}},
        {binding:4,resource:{buffer:this.bVel}},
        {binding:5,resource:{buffer:this.bC0}},
        {binding:6,resource:{buffer:this.bC1}},
        {binding:7,resource:{buffer:this.bC2}},
        {binding:8,resource:{buffer:this.bJp}},
        {binding:9,resource:{buffer:this.bBalls}},
        {binding:10,resource:{buffer:this.bForce}},
        {binding:11,resource:{buffer:this.bStats}},
      ]});
      return {pipe,bind,count};
    };
    this.kClear=mk('clearGrid',Math.ceil(n/64));
    this.kP2G=mk('p2g',Math.ceil(this.np/64));
    this.kForce=mk('gridForces',Math.ceil(n/64));
    this.kG2P=mk('g2p',Math.ceil(this.np/64));
    this.kStats=mk('sampleStats',Math.ceil(n/64));

    // 球状态（CPU）
    this.balls=[];
    for(let i=0;i<MAX_BALLS;i++) this.balls.push({active:false,r:0.06,m:1,
      pos:new THREE.Vector3(99,99,99), vel:new THREE.Vector3(), density:1000, group:i%5, spin:0});

    this.time=0;
    this.paddleX=C.x0; this.paddleV=0;
    this.waveAmp=0; this.waveFreq=0.7; this.waveOn=false; this.wavePhase=0;
    this.damping=0.9995;
    this.lastSplashT=-10;
    this.events=[];
    this.ready=true;
  }

  _terrainY(x,z,C){
    C=C||this.cfg;
    let ty=0;
    const t=APP.smoothstep(C.rampStart-0.05,C.rampStart+0.55,x);
    ty=t*APP.clamp((x-C.rampStart)*0.95,0,0.95);
    const dx=(x-C.reefX)/C.reefR, dz=(z-C.reefZ)/(C.reefR*0.85);
    const d2=dx*dx+dz*dz;
    if(d2<1){ const hh=0.42*Math.sqrt(1-d2); ty=Math.max(ty,hh); }
    return ty;
  }

  resetWater(){
    if(!this.ready) return;
    const C=this.cfg;
    const spacing=C.h*0.5;
    const rng=APP.mulberry32(12345);
    const positions=[];
    const xStart=C.x0+spacing, xEnd=C.rampStart-0.08, zEnd=C.width-C.z0-spacing;
    for(let x=xStart;x<xEnd;x+=spacing)
    for(let y=spacing;y<C.waterLevel-spacing*0.5;y+=spacing)
    for(let z=C.z0+spacing;z<zEnd;z+=spacing){
      const ty=this._terrainY(x,z,C);
      if(y<ty+spacing*1.2) continue;
      positions.push([x+(rng()-0.5)*spacing*0.4,y+(rng()-0.5)*spacing*0.4,z+(rng()-0.5)*spacing*0.4]);
    }
    const posArr=new Float32Array(this.np*4);
    const velArr=new Float32Array(this.np*4);
    const jpArr=new Float32Array(this.np*4);
    positions.forEach((p,i)=>{ if(i>=this.np)return;
      posArr[i*4]=p[0];posArr[i*4+1]=p[1];posArr[i*4+2]=p[2];posArr[i*4+3]=1;
      jpArr[i*4]=1;});
    // 粒子数可能与初次一致（同种子），多余粒子藏到地形下
    for(let i=positions.length;i<this.np;i++){ posArr[i*4]=-99;posArr[i*4+1]=-99;posArr[i*4+2]=-99; }
    this.device.queue.writeBuffer(this.bPos,0,posArr);
    this.device.queue.writeBuffer(this.bVel,0,velArr);
    this.device.queue.writeBuffer(this.bJp,0,jpArr);
    this.balls.forEach(b=>b.active=false);
    this.time=0; this.paddleX=C.x0; this.paddleV=0; this.waveOn=false;
  }

  /* 密度 5 组（相对水），由 UI 调 */
  setDensityGroup(g, rel){
    this.balls.forEach(b=>{ if(b.group===g){ b.density=rel*1000;
      b.m=b.density*4/3*Math.PI*b.r**3; }});
  }
  setWave(on,amp,freq){
    this.waveOn=on; if(amp!==undefined)this.waveAmp=amp;
    if(freq!==undefined)this.waveFreq=freq;
  }

  spawnBalls(list){
    // list: [{group, x,y,z, vx,vy,vz}]
    let slot=0;
    for(const item of list){
      while(slot<MAX_BALLS && this.balls[slot].active) slot++;
      if(slot>=MAX_BALLS) break;
      const b=this.balls[slot++];
      b.active=true; b.group=item.group;
      b.r=item.r||0.075;
      b.density=(item.density??1000);
      b.m=b.density*4/3*Math.PI*b.r**3;
      b.pos.set(item.x,item.y,item.z);
      b.vel.set(item.vx||0,item.vy||0,item.vz||0);
      b.spin=0;
    }
  }

  _writeParams(dt){
    const C=this.cfg;
    const f=new Float32Array(32);
    f[0]=dt; f[1]=C.nx;f[2]=C.ny;f[3]=C.nz;
    f[4]=C.h; f[5]=1/C.h; f[6]=9.81; f[7]=1000;
    f[8]=1.2e5; f[9]=0.12;
    f[10]=this.paddleX; f[11]=this.paddleV;
    f[12]=C.x0; f[13]=C.rampStart; f[14]=C.waterLevel; f[15]=C.z0;
    f[16]=C.width-C.z0;
    f[17]=this.balls.filter(b=>b.active).length;
    f[18]=C.rampStart;
    f[19]=C.reefX; f[20]=C.reefZ; f[21]=C.reefR;
    const dens=[400,700,1000,1300,1800];
    for(let g=0;g<5;g++){
      const bb=this.balls.find(b=>b.group===g);
      f[22+g]=bb?bb.density:dens[g];
    }
    f[27]=this.damping;
    this.device.queue.writeBuffer(this.paramsBuf,0,f);
  }
  _writeBalls(){
    const arr=new Float32Array(MAX_BALLS*8);
    this.balls.forEach((b,i)=>{
      if(b.active){
        arr[i*8]=b.pos.x;arr[i*8+1]=b.pos.y;arr[i*8+2]=b.pos.z;arr[i*8+3]=b.r;
        arr[i*8+4]=b.vel.x;arr[i*8+5]=b.vel.y;arr[i*8+6]=b.vel.z;arr[i*8+7]=b.m;
      }else{
        arr[i*8]=99;arr[i*8+1]=99;arr[i*8+2]=99;arr[i*8+3]=0.001;
        arr[i*8+7]=1e6;
      }
    });
    this.device.queue.writeBuffer(this.bBalls,0,arr);
    const zero=new Float32Array(MAX_BALLS*4);
    this.device.queue.writeBuffer(this.bForce,0,zero);
  }

  /* 推进 dt 秒（内部多子步）。readback=true 时返回 Promise，resolve 后 stats 与球位就绪 */
  async advance(dt, readback){
    if(!this.ready) return;
    const sub=8, h=dt/sub;
    const C=this.cfg;
    for(let s=0;s<sub;s++){
      // 造浪板运动
      if(this.waveOn){
        this.wavePhase += this.waveFreq*h*2*Math.PI;
        const target=C.x0 + this.waveAmp*0.28*(0.5-0.5*Math.cos(this.wavePhase));
        const prev=this.paddleX;
        this.paddleX += (target-this.paddleX)*Math.min(1,h*this.waveFreq*8+0.12);
        this.paddleV=(this.paddleX-prev)/h;
        this.damping=0.9995;
      }else{
        this.paddleV*=Math.pow(0.0001,h/0.5);
        this.paddleX += (C.x0-this.paddleX)*Math.min(1,h*1.2);
        this.damping=0.9991;
      }
      this._writeParams(h);
      this._writeBalls();
      const enc=this.device.createCommandEncoder();
      const run=(k)=>{ const pass=enc.beginComputePass();
        pass.setPipeline(k.pipe); pass.setBindGroup(0,k.bind);
        pass.dispatchWorkgroups(Math.ceil(k.count/64)); pass.end(); };
      run(this.kClear); run(this.kP2G); run(this.kForce); run(this.kG2P);
      if(readback && s===sub-1){ run(this.kStats); }
      if(readback && s===sub-1){
        enc.copyBufferToBuffer(this.bStats,0,this.stagingBuf,0,this.N*4);
        enc.copyBufferToBuffer(this.bForce,0,this.forceStage,0,MAX_BALLS*16);
      }
      this.device.queue.submit([enc.finish()]);

      // 球：读取上一子步 GPU 累加的力并 CPU 积分（首步力为 0）
      if(readback && s===sub-1){
        await this.device.queue.onSubmittedWorkDone();
        await this.forceStage.mapAsync(GPUMapMode.READ);
        const f=new Float32Array(this.forceStage.getMappedRange());
        this._integrateBalls(h,f);
        this.forceStage.unmap();
      }else{
        // 非读回帧：用上一次缓存的力（近似，且不阻塞）
        this._integrateBalls(h,this._lastForce||new Float32Array(MAX_BALLS*4));
      }
      this.time+=h;
    }
    if(readback){
      await this.device.queue.onSubmittedWorkDone();
      await this.stagingBuf.mapAsync(GPUMapMode.READ);
      const bytes=new Uint8Array(this.stagingBuf.getMappedRange().slice(0));
      this.stagingBuf.unmap();
      this.statsBytes=bytes;
      return bytes;
    }
  }

  _integrateBalls(dt, forces){
    const C=this.cfg;
    this._lastForce=new Float32Array(forces);
    for(let i=0;i<MAX_BALLS;i++){
      const b=this.balls[i]; if(!b.active) continue;
      const fx=forces[i*4],fy=forces[i*4+1],fz=forces[i*4+2];
      b.vel.y -= 9.81*dt;
      b.vel.x += fx/b.m*dt; b.vel.y += fy/b.m*dt; b.vel.z += fz/b.m*dt;
      // 水中附加阻尼（力模型未完全覆盖粘滞）：浅作用
      b.pos.addScaledVector(b.vel,dt);
      // 地形/壁碰撞
      const r=b.r;
      const ty=this._terrainY(b.pos.x,b.pos.z)+r;
      if(b.pos.y<ty){ b.pos.y=ty;
        if(b.vel.y<0){ b.vel.y*=-0.25; b.vel.x*=0.8;b.vel.z*=0.8;
          b.spin=Math.hypot(b.vel.x,b.vel.z); }
      }
      if(b.pos.z<C.z0+r){b.pos.z=C.z0+r;b.vel.z=Math.abs(b.vel.z)*0.4;}
      if(b.pos.z>C.width-C.z0-r){b.pos.z=C.width-C.z0-r;b.vel.z=-Math.abs(b.vel.z)*0.4;}
      if(b.pos.x>C.length-C.x0-r){b.pos.x=C.length-C.x0-r;b.vel.x=-Math.abs(b.vel.x)*0.4;}
      if(b.pos.x<this.paddleX+r){ b.pos.x=this.paddleX+r;
        if(b.vel.x<this.paddleV){ const rel=this.paddleV-b.vel.x; b.vel.x=this.paddleV+rel*0.3; } }
      // 出水/入水事件：用缓存水面高度近似
      const surf=this._surfaceApprox(b.pos.x,b.pos.z);
      if(b._lastSurf===undefined) b._lastSurf=b.pos.y>surf;
      const nowAir=b.pos.y-r>surf+0.01;
      if(b._lastSurf===false && nowAir===false && b.vel.y<-1.4){
        this.events.push({type:'splash',pos:b.pos.clone(),intensity:APP.clamp(-b.vel.y/7,0.15,1)});
      }
      b._lastSurf=nowAir;
      if(b.pos.y>C.height+2) b.active=false;
    }
    // 球-球
    const act=this.balls.filter(b=>b.active);
    for(let i=0;i<act.length;i++)for(let j=i+1;j<act.length;j++){
      const A=act[i],B=act[j];
      const d=A.pos.distanceTo(B.pos), rr=A.r+B.r;
      if(d<rr&&d>1e-6){
        const n=B.pos.clone().sub(A.pos).divideScalar(d);
        const pen=rr-d;
        A.pos.addScaledVector(n,-pen*0.5);B.pos.addScaledVector(n,pen*0.5);
        const rv=B.vel.clone().sub(A.vel).dot(n);
        if(rv<0){ const e=0.4,j=-(1+e)*rv/(1/A.m+1/B.m);
          A.vel.addScaledVector(n,-j/A.m);B.vel.addScaledVector(n,j/B.m);
          if(-rv>1) this.events.push({type:'clink',pos:A.pos.clone().lerp(B.pos,0.5),
            intensity:APP.clamp(-rv/5,0.2,1)});
        }
      }
    }
  }

  _surfaceApprox(x,z){
    // 粗略：静水面 + 由粒子统计估计太昂贵，导出前用静水面判事件即可
    return this.cfg.waterLevel;
  }
}

window.TankSim=TankSim;
