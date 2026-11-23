/* ============ 锻火 FORGE · audio.js : 内置音色合成 ============ */
(function(){
const APP=window.APP=window.APP||{};
const A=APP.anim;
const AU=APP.audio={};
AU.ctx=null;
AU.master=null;
AU.nodes=[];
AU.playing=false;

AU.init=function(){
  if(AU.ctx)return AU.ctx;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  AU.ctx=new AC();
  AU.master=AU.ctx.createGain();
  AU.master.gain.value=0.5;
  // 轻度总线压缩 + 混响近似
  const comp=AU.ctx.createDynamicsCompressor();
  comp.threshold.value=-18;comp.ratio.value=6;
  AU.master.connect(comp);comp.connect(AU.ctx.destination);
  return AU.ctx;
};
AU.resume=function(){
  if(!AU.ctx)AU.init();
  if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
};
AU.noiseBuf=function(){
  if(AU._nb)return AU._nb;
  const ctx=AU.ctx;
  const b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
  const d=b.getChannelData(0);
  let seed=12345;
  for(let i=0;i<d.length;i++){seed=(seed*1103515245+12345)&0x7fffffff;d[i]=(seed/0x3fffffff)-1;}
  AU._nb=b;return b;
};
/* 单音合成 */
AU.voice=function(inst,freq,dur,vel,when,lpf){
  const ctx=AU.ctx;
  const out=ctx.createGain();
  out.gain.value=0;
  const dest=ctx.createGain();
  dest.gain.value=vel;
  const filt=ctx.createBiquadFilter();
  filt.type='lowpass';filt.frequency.value=lpf||6000;filt.Q.value=0.8;
  out.connect(filt);filt.connect(dest);dest.connect(AU.master);
  const t=when;
  const stop=t+dur+0.3;
  if(inst==='metal'){
    // 锤击金属: 3 个非谐分音 + 噪声瞬态
    const parts=[1,1.58,2.31,3.43];
    const dec=[dur*0.9,dur*0.6,dur*0.4,dur*0.25];
    parts.forEach((r,i)=>{
      const o=ctx.createOscillator();o.type='sine';o.frequency.value=freq*r;
      const g=ctx.createGain();
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.6/(i+1),t+0.004);
      g.gain.exponentialRampToValueAtTime(0.0008,t+dec[i]);
      o.connect(g);g.connect(out);o.start(t);o.stop(t+dec[i]+0.05);
    });
    const n=ctx.createBufferSource();n.buffer=AU.noiseBuf();
    const ng=ctx.createGain();
    ng.gain.setValueAtTime(0.5,t);
    ng.gain.exponentialRampToValueAtTime(0.001,t+0.09);
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=freq*4;bp.Q.value=1.2;
    n.connect(bp);bp.connect(ng);ng.connect(out);n.start(t);n.stop(t+0.12);
  }else if(inst==='drone'){
    const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=freq;
    const o2=ctx.createOscillator();o2.type='sine';o2.frequency.value=freq*0.5;
    const g=ctx.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(0.5,t+Math.min(0.6,dur*0.3));
    g.gain.setValueAtTime(0.5,t+dur*0.7);
    g.gain.linearRampToValueAtTime(0,t+dur);
    const lfo=ctx.createOscillator();lfo.frequency.value=0.3;
    const lg=ctx.createGain();lg.gain.value=freq*0.01;
    lfo.connect(lg);lg.connect(o.frequency);
    o.connect(g);o2.connect(g);g.connect(out);
    o.start(t);o2.start(t);lfo.start(t);
    o.stop(t+dur+0.1);o2.stop(t+dur+0.1);lfo.stop(t+dur+0.1);
  }else if(inst==='noise'){
    const n=ctx.createBufferSource();n.buffer=AU.noiseBuf();n.loop=true;
    const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.Q.value=0.7;
    bp.frequency.setValueAtTime(freq*2,t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(120,freq*0.5),t+dur);
    const g=ctx.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(0.7,t+dur*0.35);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    n.connect(bp);bp.connect(g);g.connect(out);
    n.start(t);n.stop(t+dur+0.05);
  }else if(inst==='bell'){
    const parts=[1,2.01,3.02,4.5];
    parts.forEach((r,i)=>{
      const o=ctx.createOscillator();o.type='sine';o.frequency.value=freq*r;
      const g=ctx.createGain();
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.45/(i+1),t+0.01);
      g.gain.exponentialRampToValueAtTime(0.001,t+dur*(1-i*0.18));
      o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+0.1);
    });
  }else{ // pluck
    const o=ctx.createOscillator();o.type='triangle';o.frequency.value=freq;
    const g=ctx.createGain();
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(0.7,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    filt.frequency.setValueAtTime(freq*6,t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(200,freq),t+dur);
    o.connect(g);g.connect(out);o.start(t);o.stop(t+dur+0.05);
  }
  AU.nodes.push({out,dest,stop});
  return {out,dest,stop};
};
/* 调度一个合成的所有音色层 */
AU.schedule=function(comp,fromTime){
  AU.stop();
  AU.resume();
  if(!AU.ctx)return;
  const now=AU.ctx.currentTime+0.06;
  const layers=comp.layers.filter(l=>l.type==='audio'&&l.visible);
  let count=0;
  for(const l of layers){
    const au=l.audio;
    if(!au||!au.pattern)continue;
    for(const n of au.pattern){
      if(n.t+n.dur<fromTime-0.05)continue;
      if(n.t>comp.duration+1)continue;
      const when=now+Math.max(0,n.t-fromTime);
      const vel=(n.vel!==undefined?n.vel:1)*A.evalNum(au.gain,n.t,{comp,layer:l,time:n.t});
      const lpf=A.evalNum(au.lpf,n.t,{comp,layer:l,time:n.t});
      AU.voice(au.inst,n.f,Math.max(0.05,n.dur),vel,when,lpf);
      count++;
      if(count>900)return;
    }
  }
  AU.playing=true;
};
AU.stop=function(){
  if(!AU.ctx)return;
  const now=AU.ctx.currentTime;
  for(const n of AU.nodes){
    try{
      n.dest.gain.cancelScheduledValues(now);
      n.dest.gain.setTargetAtTime(0,now,0.02);
      n.out.stop?(n.out.stop&&0):0;
    }catch(e){}
  }
  setTimeout(()=>{
    for(const n of AU.nodes){try{n.dest.disconnect();}catch(e){}}
    AU.nodes.length=0;
  },120);
  AU.playing=false;
};
AU.audition=function(inst,freq,dur){
  AU.resume();
  if(!AU.ctx)return;
  const now=AU.ctx.currentTime+0.03;
  AU.voice(inst,freq,dur||0.6,0.5,now,6000);
};
/* 导出模式下静音 */
AU.mute=function(m){
  if(AU.master)AU.master.gain.value=m?0:0.5;
};
})();
