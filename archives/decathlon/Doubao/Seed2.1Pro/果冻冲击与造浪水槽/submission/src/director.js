'use strict';
/* 四段演示的编排：时间轴事件（放球、造浪、参数、慢放、镜头关键帧）。
 * 每段都有"视频时间 -> 仿真时间"映射（慢放区段通过 timeScale 实现）。
 */

const RUNS=['jelly-center','jelly-multi','jelly-offset','tank-full'];
const DURATIONS={'jelly-center':7.2,'jelly-multi':9.4,'jelly-offset':7.4,'tank-full':18.5};

class Director {
  constructor(app){
    this.app=app;
    this.active=null; // run id
    this.vtime=0;
    this.acc=0;
    this.shots=null;
  }

  begin(runId){
    this.active=runId;
    this.vtime=0; this.acc=0;
    const a=this.app;
    const def=this._make(runId);
    this.def=def;
    // 初始场景
    def.init(a);
    // 慢放时间尺度映射
    this.scaleMap=def.scaleMap||[];
    this.simAtV=v=>{
      let s=0,last=0,scale=1;
      for(const seg of this.scaleMap){
        if(v<=seg[0]) break;
        s+=(seg[0]-last)*scale; last=seg[0]; scale=seg[1];
      }
      s+=(v-last)*scale;
      return s;
    };
    // 事件按视频时间触发
    def.events.sort((x,y)=>x[0]-y[0]);
    this.evIdx=0;
    this.shots=def.cam;
    this._applyCam(0);
    this._fireUntil(0);
    return DURATIONS[runId];
  }

  /* 推进一帧视频 dt；内部按需要多步仿真到对应 sim 时间 */
  async advance(dt){
    const v0=this.vtime, v1=Math.min(this.vtime+dt,this.def.duration);
    this.vtime=v1;
    const sFrom=this.simAtV(v0), sTo=this.simAtV(v1);
    const a=this.app;
    const need=sTo-(this._simTime||0);
    if(need>1e-9){
      const h=1/240;
      let t=0;
      while(t<need-1e-9){
        const step=Math.min(h,need-t);
        await a.simStep(step);
        t+=step;
      }
      this._simTime=sTo;
    }
    this._fireUntil(v1);
    this._applyCam(v1);
  }

  _fireUntil(v){
    while(this.evIdx<this.def.events.length && this.def.events[this.evIdx][0]<=v+1e-7){
      const [t,fn]=this.def.events[this.evIdx++];
      fn(this.app);
    }
  }
  _applyCam(v){
    const a=this.app;
    if(this.shots) a.applyCam(this.shots.sample(v));
  }

  /* ===== 四段定义 ===== */
  _make(runId){
    const V=(x,y,z)=>APP.V3(x,y,z);
    if(runId==='jelly-center') return this._jellyCenter(V);
    if(runId==='jelly-multi') return this._jellyMulti(V);
    if(runId==='jelly-offset') return this._jellyOffset(V);
    return this._tankFull(V);
  }

  _commonCam(keys){ const t=new APP.CamTrack(); keys.forEach(k=>t.add(k[0],k[1],k[2],k[3]||42)); return t; }

  _jellyCenter(V){
    const duration=DURATIONS['jelly-center'];
    return {
      duration,
      scaleMap:[[1.35,0.22],[2.55,1.0]],  // 击中瞬间慢放
      cam:this._commonCam([
        [0,   V(3.1,2.2,4.1), V(0,0.6,0),46],
        [1.2, V(2.2,1.4,3.0), V(0,0.55,0),44],
        [1.9, V(1.35,0.95,2.05), V(0,0.45,0),38],
        [3.1, V(2.6,1.7,3.3), V(0,0.6,0),44],
        [duration,V(3.4,2.3,4.3),V(0,0.55,0),46]
      ]),
      init(a){
        a.toJelly();
        const js=a.jelly;
        js.softness=0.55; js.toughness=0.7; js.dropHeight=2.8;
        js.reset();
        a.clearBalls();
      },
      events:[
        [0.18,a=>{ a.jelly.dropBall('M',{x:0,z:0}); }]
      ]
    };
  }

  _jellyMulti(V){
    const duration=DURATIONS['jelly-multi'];
    return {
      duration,
      scaleMap:[[5.7,0.2],[7.3,1.0]],   // 开裂瞬间慢放
      cam:this._commonCam([
        [0,  V(3.2,2.4,4.2),V(0,0.6,0),46],
        [2.2,V(2.4,1.8,3.2),V(0,0.55,0),43],
        [5.6,V(1.5,1.1,2.2),V(0,0.45,0),38],
        [7.4,V(2.7,1.8,3.4),V(0,0.5,0),44],
        [duration,V(3.4,2.3,4.3),V(0,0.5,0),46]
      ]),
      init(a){
        a.toJelly();
        const js=a.jelly;
        js.softness=0.5; js.toughness=0.32; js.dropHeight=2.4;
        js.reset();
        a.clearBalls();
      },
      events:[
        [0.15,a=>a.jelly.dropBall('S',{x:0,z:0})],
        [1.6, a=>a.jelly.dropBall('M',{x:0.04,z:0.02})],
        [3.2, a=>a.jelly.dropBall('L',{x:-0.03,z:-0.02})],
        [5.55,a=>a.jelly.dropBall('L',{x:0.02,z:-0.03})]
      ]
    };
  }

  _jellyOffset(V){
    const duration=DURATIONS['jelly-offset'];
    return {
      duration,
      scaleMap:[[1.2,0.3],[2.2,1.0]],
      cam:this._commonCam([
        [0,  V(3.4,2.5,4.3),V(0.2,0.55,0.1),45],
        [1.0,V(2.6,1.8,3.3),V(0.25,0.5,0.1),42],
        [2.4,V(2.2,1.4,2.8),V(0.1,0.35,0.25),40],
        [4.0,V(3.0,1.9,3.6),V(-0.4,0.3,0.35),43],
        [duration,V(3.6,2.3,4.4),V(-0.2,0.35,0.3),46]
      ]),
      init(a){
        a.toJelly();
        const js=a.jelly;
        js.softness=0.62; js.toughness=0.72; js.dropHeight=2.4;
        js.reset();
        a.clearBalls();
      },
      events:[
        [0.15,a=>a.jelly.dropBall('L',{x:0.42,z:0.22,vx:-1.0,vz:-0.5})]
      ]
    };
  }

  _tankFull(V){
    const duration=DURATIONS['tank-full'];
    return {
      duration,
      scaleMap:[[1.2,0.35],[2.4,1.0],[12.3,0.4],[14.2,1.0]], // 入水 + 破浪慢放
      cam:this._commonCam([
        [0,  V(1.2,2.5,3.6),V(2.2,0.6,0.62),48],
        [1.1,V(1.6,1.7,2.7),V(2.2,0.6,0.62),44],
        [2.4,V(2.0,1.3,2.1),V(2.2,0.55,0.62),40],
        [5.5,V(2.3,1.5,2.4),V(2.3,0.55,0.62),44],
        [9.5,V(2.6,1.4,2.2),V(2.5,0.5,0.62),42],
        [12.2,V(2.9,1.0,1.7),V(2.9,0.5,0.62),36],
        [14.4,V(2.4,1.5,2.4),V(2.4,0.55,0.62),44],
        [duration,V(1.6,2.2,3.2),V(2.2,0.6,0.62),48]
      ]),
      init(a){
        a.toTank();
        const sim=a.tankSim, ts=a.tank;
        sim.resetWater();
        a.clearTankBalls();
        sim.setWave(false,0.5,0.7);
        ts.sprayPos.fill(0); ts.sprayCol.fill(-1);
      },
      events:[
        // 第一批：各组球从上方落入
        [0.25,a=>a.dropDemoBalls([[1.35,2.4,0.35],[2.05,2.9,0.9],[2.65,2.2,0.55]])],
        [0.65,a=>a.dropDemoBalls([[1.7,2.6,1.0],[2.4,3.1,0.25],[3.0,2.5,0.85]])],
        [1.05,a=>a.dropDemoBalls([[2.2,2.7,0.62],[1.5,2.3,0.7],[2.8,2.8,1.05]])],
        [1.5, a=>a.dropDemoBalls([[2.0,2.5,0.4],[2.5,2.7,0.8]])],
        // 造浪：幅度由小到大（运行时每段调）
        [3.0,a=>{ a.tankSim.setWave(true,0.22,0.6); Sound.waveStart(); }],
        [5.2,a=>a.tankSim.setWave(true,0.4,0.65)],
        [7.4,a=>a.tankSim.setWave(true,0.62,0.72)],
        [9.8,a=>a.tankSim.setWave(true,0.95,0.78)],
        [12.6,a=>a.tankSim.setWave(true,1.0,0.7)],
        // 停机
        [14.6,a=>{ a.tankSim.setWave(false); Sound.waveStop(); }],
        // 再补两个球丰富尾声
        [15.2,a=>a.dropDemoBalls([[2.3,2.2,0.6]])]
      ]
    };
  }
}

window.Director=Director; window.RUNS=RUNS; window.DURATIONS=DURATIONS;
