/* audio.js — 内置音色合成（WebAudio） */
(function(){
'use strict';
const A = { ctx:null, master:null, noiseBuf:null, started:false };
window.AudioEngine = A;

A.ensure=function(){
  if(A.ctx) { if(A.ctx.state==='suspended') A.ctx.resume(); return true; }
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;
    A.ctx=new Ctx();
    A.master=A.ctx.createGain(); A.master.gain.value=0.85;
    const comp=A.ctx.createDynamicsCompressor();
    A.master.connect(comp); comp.connect(A.ctx.destination);
    const len=A.ctx.sampleRate*1.2;
    A.noiseBuf=A.ctx.createBuffer(1,len,A.ctx.sampleRate);
    const d=A.noiseBuf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    A.started=true;
    return true;
  }catch(e){ return false; }
};
A.now=function(){ return A.ctx? A.ctx.currentTime:0; };

function env(g,t,a,peak,dur){
  g.gain.setValueAtTime(0.0001,t);
  g.gain.linearRampToValueAtTime(peak,t+a);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
}
function osc(type,freq,t,dur,peak,dest,detune){
  const o=A.ctx.createOscillator(); o.type=type; o.frequency.setValueAtTime(freq,t); o.detune.value=detune||0;
  const g=A.ctx.createGain(); env(g,t,0.004,peak,dur);
  o.connect(g); g.connect(dest||A.master);
  o.start(t); o.stop(t+dur+0.05);
  return o;
}
function noise(t,dur,peak,filterFreq,type,dest,q){
  const s=A.ctx.createBufferSource(); s.buffer=A.noiseBuf; s.loop=true;
  const f=A.ctx.createBiquadFilter(); f.type=type||'bandpass'; f.frequency.value=filterFreq||2000; f.Q.value=q||1;
  const g=A.ctx.createGain(); env(g,t,0.003,peak,dur);
  s.connect(f); f.connect(g); g.connect(dest||A.master);
  s.start(t); s.stop(t+dur+0.05);
  return {s,f,g};
}

/* 单个音色事件 */
A.playEvent=function(preset,opts={}){
  if(!A.ensure()) return;
  const t=(opts.when!==undefined? opts.when : A.now());
  const vol=opts.volume!==undefined?opts.volume:0.7;
  const note=opts.note||55;
  const dur=opts.duration||0.6;
  const detune=opts.detune||0;
  const out=A.master;
  const peak=vol;
  switch(preset){
    case 'anvil':{
      const partials=[1,2.76,5.4,8.9];
      for(let i=0;i<partials.length;i++){
        const f=note*partials[i]*2;
        const o=osc('sine',f,t,dur*(1-i*0.18),peak*(0.5/(i+1)),out,detune*(i+1));
      }
      noise(t,0.09,peak*0.5,5200,'highpass',out,0.7);
      noise(t,0.35,peak*0.22,1400,'bandpass',out,1.2);
      break;
    }
    case 'hum':{
      osc('sine',note,t,dur,peak*0.5,out);
      osc('sine',note*1.005,t,dur,peak*0.35,out,8);
      osc('triangle',note*2,t,dur*0.7,peak*0.12,out);
      noise(t,dur,peak*0.05,300,'lowpass',out);
      break;
    }
    case 'whoosh':{
      const n=noise(t,dur,peak*0.5,400,'bandpass',out,1.5);
      n.f.frequency.setValueAtTime(200,t);
      n.f.frequency.exponentialRampToValueAtTime(4000,t+dur*0.5);
      n.f.frequency.exponentialRampToValueAtTime(300,t+dur);
      break;
    }
    case 'spark':{
      for(let i=0;i<4;i++){
        noise(t+i*0.012,0.05,peak*0.35,6000+i*1500,'highpass',out,2);
      }
      osc('square',note*8,t,0.06,peak*0.1,out);
      break;
    }
    case 'drone':{
      for(let i=0;i<3;i++){
        const o=A.ctx.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(note*(i+1)*0.5,t); o.detune.value=(i-1)*7;
        const f=A.ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(300,t);
        f.frequency.linearRampToValueAtTime(900,t+dur*0.6); f.frequency.linearRampToValueAtTime(220,t+dur);
        const g=A.ctx.createGain();
        g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(peak*0.22,t+0.1);
        g.gain.setValueAtTime(peak*0.22,t+dur*0.7); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
        o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t+dur+0.1);
      }
      break;
    }
    case 'chime':{
      const fs=[1,2.02,3.01,4.5];
      for(let i=0;i<fs.length;i++) osc('sine',note*4*fs[i],t,dur*(1-i*0.15),peak*0.3/(i+1),out);
      break;
    }
    case 'drum':{
      const o=A.ctx.createOscillator(); o.frequency.setValueAtTime(note*3,t);
      o.frequency.exponentialRampToValueAtTime(note*0.8,t+0.12);
      const g=A.ctx.createGain(); env(g,t,0.002,peak*0.9,0.28);
      o.connect(g); g.connect(out); o.start(t); o.stop(t+0.4);
      noise(t,0.12,peak*0.4,900,'bandpass',out,0.8);
      break;
    }
    default:{
      osc('sine',note*2,t,dur,peak*0.5,out);
    }
  }
};

/* 根据合成时间触发音色图层 */
A._lastTrigger=new Map();
A.update=function(comp,time,playing){
  if(!A.ctx) return;
  if(!playing){ A._lastTrigger.clear(); return; }
  for(const layer of comp.layers){
    if(layer.type!=='audio') continue;
    const a=layer.values['audio'];
    const start=layer.inPoint;
    const end=layer.outPoint;
    const key=layer.id;
    const last=A._lastTrigger.get(key);
    const dur=a.duration||0.6;
    // 简单节奏型
    const pattern=(a.pattern||'1').split('').map(c=>c==='1');
    const bpm=a.tempo||120;
    const beat=60/bpm;
    const cycles=Math.max(1,Math.ceil((end-start)/ (beat*pattern.length)));
    for(let c=0;c<cycles;c++){
      for(let i=0;i<pattern.length;i++){
        if(!pattern[i]) continue;
        const tt=start+c*beat*pattern.length+i*beat;
        if(tt>end) continue;
        if(time>=tt-0.02 && (last===undefined||last<tt-0.5)){
          A._lastTrigger.set(key,tt);
          A.playEvent(a.preset,{when:A.now()+(tt-time),volume:(a.volume||0.7),note:(a.note||55),duration:dur,detune:(a.detune||0)});
        }
      }
    }
    if(time<start-0.1) A._lastTrigger.delete(key);
  }
};
A.stopAll=function(){
  if(!A.ctx) return;
  A.master.gain.cancelScheduledValues(A.now());
  A.master.gain.setValueAtTime(0.0001,A.now());
  A.master.gain.linearRampToValueAtTime(0.85,A.now()+0.05);
  A._lastTrigger.clear();
};
A.resume=function(){ if(A.master) A.master.gain.setTargetAtTime(0.85,A.now(),0.05); };

})();
