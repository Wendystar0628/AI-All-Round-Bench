/* 铸帧 ForgeFrame · 内置音色引擎（WebAudio 合成，无外部音频资源） */
"use strict";
(function(){
const FF=window.FF, clamp=FF.util.clamp, Eval=FF.Eval;

const A={
  ctx:null, master:null, muted:false, playing:false, nodes:[],
  ensure(){
    if(this.ctx) { if(this.ctx.state==='suspended') this.ctx.resume(); return; }
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    this.ctx=new AC();
    this.master=this.ctx.createGain();
    this.master.gain.value=this.muted?0:0.85;
    const comp=this.ctx.createDynamicsCompressor();
    comp.threshold.value=-14; comp.ratio.value=6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    // 预生成噪声缓冲
    const len=this.ctx.sampleRate*2;
    this.noiseBuf=this.ctx.createBuffer(1,len,this.ctx.sampleRate);
    const d=this.noiseBuf.getChannelData(0);
    let s=12345;
    for(let i=0;i<len;i++){ s=(s*1103515245+12345)&0x7fffffff; d[i]=(s/0x7fffffff)*2-1; }
  },
  setMuted(m){
    this.muted=m;
    if(this.master) this.master.gain.setTargetAtTime(m?0:0.85,this.ctx.currentTime,0.03);
  },
  noiseSrc(){
    const s=this.ctx.createBufferSource();
    s.buffer=this.noiseBuf; s.loop=true;
    return s;
  },
  env(g,t0,a,peak,dec,end){
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.linearRampToValueAtTime(peak,t0+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+a+dec);
    if(end) g.gain.setValueAtTime(0.0001,t0+a+dec+0.01);
  },
  /* 金属锤击：非谐泛音 + 噪声冲击 + 低频锤体 */
  hit(t0,vel,freq,decay,tone,noiseAmt,filterF){
    const c=this.ctx;
    const out=c.createGain(); out.gain.value=clamp(vel,0,1.5)*0.9; out.connect(this.master);
    const ratios=[1,2.756,5.404,8.933,13.34];
    const gains=[1,0.55,0.32,0.18,0.09];
    ratios.forEach((r,i)=>{
      const o=c.createOscillator(); o.type='sine';
      o.frequency.value=freq*r*(1+(i?0.002*i:0));
      const g=c.createGain();
      const pk=gains[i]*(0.5+tone*0.7);
      this.env(g,t0,0.002,pk,decay*(1-i*0.13));
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0+decay+0.2);
      this.nodes.push(o);
    });
    // 冲击噪声
    const n=this.noiseSrc();
    const bp=c.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.value=filterF; bp.Q.value=0.8;
    const ng=c.createGain();
    this.env(ng,t0,0.001,noiseAmt*0.9,0.09);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    n.start(t0); n.stop(t0+0.2); this.nodes.push(n);
    // 低频锤体
    const lo=c.createOscillator(); lo.type='sine';
    lo.frequency.setValueAtTime(150,t0);
    lo.frequency.exponentialRampToValueAtTime(48,t0+0.12);
    const lg=c.createGain();
    this.env(lg,t0,0.002,0.7*(1-tone*0.4),0.22);
    lo.connect(lg); lg.connect(out);
    lo.start(t0); lo.stop(t0+0.4); this.nodes.push(lo);
  },
  /* 挥锤风声 */
  whoosh(t0,vel,dur){
    const c=this.ctx;
    const n=this.noiseSrc();
    const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.Q.value=1.4;
    bp.frequency.setValueAtTime(260,t0);
    bp.frequency.exponentialRampToValueAtTime(1600,t0+dur*0.6);
    bp.frequency.exponentialRampToValueAtTime(420,t0+dur);
    const g=c.createGain();
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.linearRampToValueAtTime(vel*0.4,t0+dur*0.55);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t0); n.stop(t0+dur+0.1); this.nodes.push(n);
  },
  /* 淬火嘶鸣 */
  hiss(t0,vel,dur){
    const c=this.ctx;
    const n=this.noiseSrc();
    const hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=2600;
    const lp=c.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.setValueAtTime(9000,t0);
    lp.frequency.exponentialRampToValueAtTime(1800,t0+dur);
    const g=c.createGain();
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.linearRampToValueAtTime(vel*0.34,t0+0.08);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.master);
    n.start(t0); n.stop(t0+dur+0.1); this.nodes.push(n);
  },
  /* 笔触 */
  brush(t0,vel,freq){
    const c=this.ctx;
    const n=this.noiseSrc();
    const bp=c.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.value=freq||900; bp.Q.value=1.1;
    const g=c.createGain();
    this.env(g,t0,0.02,vel*0.22,0.16);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t0); n.stop(t0+0.3); this.nodes.push(n);
    // 轻拨弦
    const o=c.createOscillator(); o.type='triangle'; o.frequency.value=(freq||900)*0.5;
    const og=c.createGain(); this.env(og,t0,0.005,vel*0.1,0.3);
    o.connect(og); og.connect(this.master);
    o.start(t0); o.stop(t0+0.5); this.nodes.push(o);
  },
  /* 持续氛围：双锯齿 + 次低频 + 滤波 LFO，幅度按属性自动化 */
  drone(layer,comp,fromTime,ctx){
    const c=this.ctx;
    const t0=c.currentTime+0.03;
    const endT=comp.workArea[1];
    const out=c.createGain(); out.gain.value=0.0001; out.connect(this.master);
    const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.Q.value=0.7;
    lp.connect(out);
    const freq0=Eval.prop(ctx,layer,'audio.freq',fromTime)||55;
    const o1=c.createOscillator(); o1.type='sawtooth'; o1.frequency.value=freq0;
    const o2=c.createOscillator(); o2.type='sawtooth'; o2.frequency.value=freq0*1.007;
    const sub=c.createOscillator(); sub.type='sine'; sub.frequency.value=freq0*0.5;
    const g1=c.createGain(); g1.gain.value=0.16;
    const g2=c.createGain(); g2.gain.value=0.13;
    const gs=c.createGain(); gs.gain.value=0.22;
    o1.connect(g1); g1.connect(lp); o2.connect(g2); g2.connect(lp);
    sub.connect(gs); gs.connect(lp);
    // 火焰噪声成分
    const n=this.noiseSrc();
    const nbp=c.createBiquadFilter(); nbp.type='bandpass'; nbp.frequency.value=340; nbp.Q.value=0.5;
    const ng=c.createGain(); ng.gain.value=0.05;
    n.connect(nbp); nbp.connect(ng); ng.connect(lp);
    // 自动化（幅度 / 滤波 / 频率）
    const step=0.08;
    for(let t=fromTime;t<=endT+step;t+=step){
      const at=t0+(t-fromTime);
      const amp=(Eval.prop(ctx,layer,'audio.amp',Math.min(t,endT))||0)/100;
      const flt=Eval.prop(ctx,layer,'audio.filter',Math.min(t,endT))||900;
      const fr=Eval.prop(ctx,layer,'audio.freq',Math.min(t,endT))||freq0;
      out.gain.linearRampToValueAtTime(clamp(amp,0,1)*0.9,at);
      lp.frequency.linearRampToValueAtTime(clamp(flt,80,12000),at);
      o1.frequency.linearRampToValueAtTime(fr,at);
      o2.frequency.linearRampToValueAtTime(fr*1.007,at);
      sub.frequency.linearRampToValueAtTime(fr*0.5,at);
    }
    o1.start(t0); o2.start(t0); sub.start(t0); n.start(t0);
    const stopT=t0+(endT-fromTime)+0.3;
    o1.stop(stopT); o2.stop(stopT); sub.stop(stopT); n.stop(stopT);
    this.nodes.push(o1,o2,sub,n);
  },
  play(comp,fromTime,project){
    this.ensure();
    if(!this.ctx) return;
    this.stop();
    this.playing=true;
    const ctx=Eval.frame(project,comp,fromTime);
    const c=this.ctx;
    const t0=c.currentTime+0.03;
    for(const layer of comp.layers){
      if(layer.type!=='audio'||!layer.visible) continue;
      if(layer.outPoint<=fromTime) continue;
      const a=layer.audio;
      if(a.instrument==='drone'){
        this.drone(layer,comp,Math.max(fromTime,layer.inPoint),ctx);
        continue;
      }
      for(const ev of (a.events||[])){
        if(ev.t<fromTime-0.02||ev.t>comp.workArea[1]) continue;
        if(ev.t<layer.inPoint||ev.t>layer.outPoint) continue;
        const at=t0+(ev.t-fromTime);
        const vel=(ev.vel===undefined?1:ev.vel);
        const freq=ev.note||Eval.prop(ctx,layer,'audio.freq',ev.t)||220;
        const decay=Eval.prop(ctx,layer,'audio.decay',ev.t)||1.2;
        const tone=Eval.prop(ctx,layer,'audio.tone',ev.t);
        const noise=Eval.prop(ctx,layer,'audio.noise',ev.t);
        const flt=Eval.prop(ctx,layer,'audio.filter',ev.t)||2200;
        if(a.instrument==='hit') this.hit(at,vel,freq,decay,tone===undefined?0.5:tone,noise===undefined?0.4:noise,flt);
        else if(a.instrument==='whoosh') this.whoosh(at,vel,ev.dur||0.34);
        else if(a.instrument==='hiss') this.hiss(at,vel,ev.dur||2.2);
        else if(a.instrument==='brush') this.brush(at,vel,freq);
        else if(a.instrument==='bell'){
          const ratios=[1,2.0,2.98,4.2];
          ratios.forEach((r,i)=>{
            const o=c.createOscillator(); o.type='sine'; o.frequency.value=freq*r;
            const g=c.createGain();
            this.env(g,at,0.004,vel*0.3/(i+1),decay*(1.4-i*0.2));
            o.connect(g); g.connect(this.master);
            o.start(at); o.stop(at+decay*1.6); this.nodes.push(o);
          });
        }
      }
    }
  },
  stop(){
    this.playing=false;
    for(const n of this.nodes){ try{ n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} }
    this.nodes=[];
  },
};
FF.Audio=A;
})();
