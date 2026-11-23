'use strict';
/* 程序化音效：撞击、回弹、开裂、球体碰撞、入水、造浪。全部由 WebAudio 合成。 */

class SoundEngine {
  constructor(){
    this.ctx=null; this.enabled=true; this.master=null; this.waveGain=null; this.waveSrc=null;
    this.noiseBuf=null;
  }
  _ensure(){
    if(this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain();
    this.master.gain.value=0.9;
    const comp=this.ctx.createDynamicsCompressor();
    comp.threshold.value=-18; comp.ratio.value=6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len=this.ctx.sampleRate*1.2;
    this.noiseBuf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=this.noiseBuf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  }
  resume(){ this._ensure(); if(this.ctx && this.ctx.state==='suspended') this.ctx.resume(); }
  setEnabled(v){ this.enabled=v; if(v) this.resume(); if(this.master) this.master.gain.setTargetAtTime(v?0.9:0,this.ctx.currentTime,0.02); }

  _pan(pos){
    // 简单横向声像
    const p=APP.clamp((pos&&pos.x!==undefined)?pos.x/3:0,-1,1);
    const s=this.ctx.createStereoPanner?this.ctx.createStereoPanner():null;
    if(s) s.pan.value=p;
    return s;
  }
  _env(g,t0,a,peak,d){ g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(peak,t0+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+a+d); }

  /* 重球砸中果冻 / 台面：低频咚 + 噪声拍 */
  impact(intensity=0.6, pos){
    if(!this.enabled) return; this._ensure(); if(!this.ctx) return;
    const t0=this.ctx.currentTime;
    const f=lerp(60,150,APP.clamp(intensity,0,1));
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(f*1.7,t0); o.frequency.exponentialRampToValueAtTime(f,t0+0.12);
    this._env(g,t0,0.005,0.9*APP.clamp(intensity*0.8+0.2,0.1,1),0.32);
    o.connect(g);
    const pan=this._pan(pos); if(pan){g.connect(pan);pan.connect(this.master);} else g.connect(this.master);
    o.start(t0); o.stop(t0+0.5);
    // 果冻吸能的噗声
    const n=this.ctx.createBufferSource(); n.buffer=this.noiseBuf;
    const nf=this.ctx.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value=lerp(300,900,intensity);
    const ng=this.ctx.createGain(); this._env(ng,t0,0.004,0.25+0.35*intensity,0.16);
    n.connect(nf); nf.connect(ng);
    const p2=this._pan(pos); if(p2){ng.connect(p2);p2.connect(this.master);} else ng.connect(this.master);
    n.start(t0); n.stop(t0+0.3);
  }
  /* 果冻回弹 boing */
  boing(intensity=0.5,pos){
    if(!this.enabled) return; this._ensure(); if(!this.ctx) return;
    const t0=this.ctx.currentTime;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    const f0=lerp(180,420,intensity);
    o.type='sine';
    o.frequency.setValueAtTime(f0,t0);
    o.frequency.exponentialRampToValueAtTime(f0*0.6,t0+0.22);
    this._env(g,t0,0.01,0.18+0.2*intensity,0.28);
    o.connect(g);
    const pan=this._pan(pos); if(pan){g.connect(pan);pan.connect(this.master);} else g.connect(this.master);
    o.start(t0); o.stop(t0+0.35);
  }
  /* 开裂：脆裂噪声 + 高频碎裂 */
  crack(intensity=0.7,pos){
    if(!this.enabled) return; this._ensure(); if(!this.ctx) return;
    const t0=this.ctx.currentTime;
    const n=this.ctx.createBufferSource(); n.buffer=this.noiseBuf; n.playbackRate.value=0.8+Math.random()*0.4;
    const nf=this.ctx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=1800; nf.Q.value=0.8;
    const ng=this.ctx.createGain(); this._env(ng,t0,0.003,0.5+0.4*intensity,0.2);
    n.connect(nf); nf.connect(ng);
    const pan=this._pan(pos); if(pan){ng.connect(pan);pan.connect(this.master);} else ng.connect(this.master);
    n.start(t0); n.stop(t0+0.3);
    // 噼啪碎点
    for(let i=0;i<5;i++){
      const tt=t0+0.02+i*0.03+Math.random()*0.02;
      const o=this.ctx.createOscillator(), og=this.ctx.createGain();
      o.type='triangle'; o.frequency.value=900+Math.random()*2600;
      this._env(og,tt,0.002,0.10+0.08*intensity,0.05);
      o.connect(og);
      const pp=this._pan(pos); if(pp){og.connect(pp);pp.connect(this.master);} else og.connect(this.master);
      o.start(tt); o.stop(tt+0.08);
    }
  }
  /* 球-球 / 球-硬物 碰撞 */
  clink(intensity=0.4,pos,kind='metal'){
    if(!this.enabled) return; this._ensure(); if(!this.ctx) return;
    const t0=this.ctx.currentTime;
    const base=kind==='stone'?520:880;
    [1, 2.02, 3.1].forEach((m,i)=>{
      const o=this.ctx.createOscillator(), g=this.ctx.createGain();
      o.type='sine'; o.frequency.value=base*m*(0.97+Math.random()*0.06);
      this._env(g,t0,0.002,(0.22-i*0.06)*APP.clamp(intensity,0.05,1),0.1+i*0.05);
      o.connect(g);
      const pan=this._pan(pos); if(pan){g.connect(pan);pan.connect(this.master);} else g.connect(this.master);
      o.start(t0); o.stop(t0+0.3);
    });
  }
  /* 入水：哗—— 带通噪声 */
  splash(intensity=0.6,pos){
    if(!this.enabled) return; this._ensure(); if(!this.ctx) return;
    const t0=this.ctx.currentTime;
    const n=this.ctx.createBufferSource(); n.buffer=this.noiseBuf; n.playbackRate.value=0.6+intensity*0.5;
    const nf=this.ctx.createBiquadFilter(); nf.type='bandpass';
    nf.frequency.setValueAtTime(500+intensity*1400,t0);
    nf.frequency.exponentialRampToValueAtTime(350,t0+0.5);
    nf.Q.value=0.7;
    const ng=this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001,t0);
    ng.gain.exponentialRampToValueAtTime(0.25+0.4*intensity,t0+0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001,t0+0.55+intensity*0.3);
    n.connect(nf); nf.connect(ng);
    const pan=this._pan(pos); if(pan){ng.connect(pan);pan.connect(this.master);} else ng.connect(this.master);
    n.start(t0); n.stop(t0+1);
  }
  /* 造浪：循环低鸣，幅度驱动音量 */
  waveStart(){
    if(!this.enabled) return; this._ensure(); if(!this.ctx||this.waveSrc) return;
    const src=this.ctx.createBufferSource(); src.buffer=this.noiseBuf; src.loop=true;
    const f1=this.ctx.createBiquadFilter(); f1.type='lowpass'; f1.frequency.value=500;
    const f2=this.ctx.createBiquadFilter(); f2.type='bandpass'; f2.frequency.value=180; f2.Q.value=0.6;
    const g=this.ctx.createGain(); g.gain.value=0.0001;
    src.connect(f1); f1.connect(g); src.connect(f2); f2.connect(g); g.connect(this.master);
    src.start();
    this.waveSrc=src; this.waveGain=g;
  }
  waveLevel(v){ if(this.waveGain && this.ctx) this.waveGain.gain.setTargetAtTime(0.04+0.16*v,this.ctx.currentTime,0.15); }
  waveStop(){ if(this.waveSrc){ try{this.waveGain.gain.setTargetAtTime(0.0001,this.ctx.currentTime,0.1);
    const s=this.waveSrc; setTimeout(()=>{try{s.stop();}catch(e){}},500);}catch(e){}
    this.waveSrc=null; this.waveGain=null; } }
}

window.Sound = new SoundEngine();
