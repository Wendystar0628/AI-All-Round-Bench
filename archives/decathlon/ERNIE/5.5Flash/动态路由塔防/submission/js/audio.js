/* ============================================================
 * 音频层：全部由 WebAudio 实时合成（环境声 / 音乐 / 音效）
 * ============================================================ */
const AudioSys = (() => {
  let ctx=null, master=null, busAmbient=null, busMusic=null, busSfx=null;
  let muted=false, ready=false;
  let vols={ambient:.45, music:.35, sfx:.7};
  let ambientNodes=[], musicTimer=null, musicStep=0, currentMap=null;
  let noiseBuf=null;

  function init(){
    if(ready) return;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted?0:1; master.connect(ctx.destination);
      busAmbient = ctx.createGain(); busAmbient.gain.value = vols.ambient; busAmbient.connect(master);
      busMusic = ctx.createGain(); busMusic.gain.value = vols.music; busMusic.connect(master);
      busSfx = ctx.createGain(); busSfx.gain.value = vols.sfx; busSfx.connect(master);
      const len = ctx.sampleRate*2;
      noiseBuf = ctx.createBuffer(1,len,ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
      ready=true;
    }catch(e){ console.warn('音频初始化失败',e); }
  }

  function resume(){ if(ctx && ctx.state==='suspended') ctx.resume(); }

  function setMuted(v){
    muted=!!v;
    if(master && ctx) master.gain.setTargetAtTime(muted?0:1, ctx.currentTime, .05);
  }
  function setVolumes(v){
    vols=Object.assign(vols,v);
    if(!ctx) return;
    if(busAmbient) busAmbient.gain.setTargetAtTime(vols.ambient,ctx.currentTime,.05);
    if(busMusic) busMusic.gain.setTargetAtTime(vols.music,ctx.currentTime,.05);
    if(busSfx) busSfx.gain.setTargetAtTime(vols.sfx,ctx.currentTime,.05);
  }

  function env(g, t, a, d, peak){
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002),t+a);
    g.gain.exponentialRampToValueAtTime(0.0001,t+a+d);
  }

  function tone({freq=440, freq2=null, dur=.2, type='sine', gain=.2, bus=null, when=0, attack=.005, detune=0, pan=0}){
    if(!ready) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    o.detune.value=detune;
    if(freq2!=null) o.frequency.exponentialRampToValueAtTime(Math.max(freq2,1),t+dur);
    let node=o;
    if(pan && ctx.createStereoPanner){ const p=ctx.createStereoPanner(); p.pan.value=Math.max(-1,Math.min(1,pan)); node.connect(p); node=p; }
    node.connect(g); g.connect(bus||busSfx);
    env(g,t,attack,dur,gain);
    o.start(t); o.stop(t+dur+attack+.05);
  }

  function noise({dur=.2, gain=.2, type='lowpass', freq=1200, q=.8, when=0, bus=null, sweep=null, attack=.005, pan=0}){
    if(!ready) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const f = ctx.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(freq,t); f.Q.value=q;
    if(sweep!=null) f.frequency.exponentialRampToValueAtTime(Math.max(sweep,20),t+dur);
    const g = ctx.createGain();
    let node=f;
    if(pan && ctx.createStereoPanner){ const p=ctx.createStereoPanner(); p.pan.value=Math.max(-1,Math.min(1,pan)); f.connect(p); node=p; }
    src.connect(f); node.connect(g); g.connect(bus||busSfx);
    env(g,t,attack,dur,gain);
    src.start(t); src.stop(t+dur+.05);
    return {src,g};
  }

  /* ---------- 环境声 ---------- */
  function stopAmbient(){
    for(const n of ambientNodes){ try{n.stop ? n.stop() : n.disconnect();}catch(e){} }
    ambientNodes=[];
    if(musicTimer){ clearInterval(musicTimer); musicTimer=null; }
  }

  function pad(freq, gain, type='sine', detune=0){
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type; o.frequency.value=freq; o.detune.value=detune;
    g.gain.value=0;
    g.gain.setTargetAtTime(gain, ctx.currentTime, 2.5);
    o.connect(g); g.connect(busAmbient); o.start();
    ambientNodes.push(o);
    return {o,g};
  }

  function ambient(mapId){
    if(!ready) return;
    if(currentMap===mapId) return;
    currentMap=mapId;
    stopAmbient();
    if(mapId==='map1'){
      pad(55,.055,'sine'); pad(82.4,.028,'triangle',6); pad(110,.018,'sine',-5);
      const n1=noise({dur:999,gain:.018,type:'bandpass',freq:420,q:.6,bus:busAmbient}); if(n1) ambientNodes.push(n1.src);
      ambientNodes.push((()=>{const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=700;f.Q.value=.4;const g=ctx.createGain();g.gain.value=.012;s.connect(f);f.connect(g);g.connect(busAmbient);s.start();return s;})());
    } else if(mapId==='map2'){
      pad(41.2,.06,'sine'); pad(61.7,.03,'sawtooth',4); pad(82.4,.022,'triangle',-8);
      const n2=noise({dur:999,gain:.02,type:'lowpass',freq:260,bus:busAmbient}); if(n2) ambientNodes.push(n2.src);
      ambientNodes.push((()=>{const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1100;f.Q.value=.5;const g=ctx.createGain();g.gain.value=.009;s.connect(f);f.connect(g);g.connect(busAmbient);s.start();return s;})());
    } else {
      pad(36.7,.06,'sine'); pad(55,.03,'square',5); pad(73.4,.02,'triangle',-6);
      const n3=noise({dur:999,gain:.025,type:'bandpass',freq:380,q:.5,bus:busAmbient}); if(n3) ambientNodes.push(n3.src);
      ambientNodes.push((()=>{const s=ctx.createBufferSource();s.buffer=noiseBuf;s.loop=true;const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=2200;const g=ctx.createGain();g.gain.value=.008;s.connect(f);f.connect(g);g.connect(busAmbient);s.start();return s;})());
    }
    startMusic(mapId);
  }

  /* ---------- 音乐：简单生成式 ---------- */
  const SCALES = {
    map1:[0,3,5,7,10,12,15],
    map2:[0,2,5,7,9,12,14],
    map3:[0,1,5,7,8,12,13]
  };
  function startMusic(mapId){
    if(musicTimer) clearInterval(musicTimer);
    musicStep=0;
    const bpm = mapId==='map1'?88 : mapId==='map2'?76 : 68;
    const stepMs = 60000/bpm/2;
    const base = mapId==='map1'?110 : mapId==='map2'?98 : 82.4;
    musicTimer=setInterval(()=>{
      if(!ready || muted) return;
      const scale=SCALES[mapId]||SCALES.map1;
      const n = scale[(musicStep*3+ (musicStep%5===0?2:0)) % scale.length];
      const oct = (musicStep%16<8)?0:12;
      const f = base*Math.pow(2,(n+oct)/12);
      tone({freq:f, dur:.55, type:'triangle', gain:.018, bus:busMusic, attack:.02});
      if(musicStep%8===0){
        tone({freq:base/2, dur:1.2, type:'sine', gain:.028, bus:busMusic, attack:.1});
      }
      if(musicStep%4===2){
        noise({dur:.08,gain:.008,type:'highpass',freq:3000,bus:busMusic});
      }
      musicStep++;
    }, stepMs);
  }

  /* ---------- 音效 ---------- */
  const SFX = {
    click(){ tone({freq:900,freq2:700,dur:.05,type:'square',gain:.05}); },
    hover(){ tone({freq:1200,dur:.03,type:'sine',gain:.025}); },
    place(){ tone({freq:220,freq2:440,dur:.16,type:'triangle',gain:.12}); noise({dur:.12,gain:.05,type:'bandpass',freq:1600}); },
    upgrade(){ [0,4,7,12].forEach((n,i)=>tone({freq:330*Math.pow(2,n/12),dur:.22,type:'triangle',gain:.07,when:i*.05})); },
    sell(){ tone({freq:520,freq2:260,dur:.18,type:'triangle',gain:.08}); },
    error(){ tone({freq:160,dur:.18,type:'square',gain:.08}); tone({freq:120,dur:.2,type:'square',gain:.06,when:.08}); },
    shoot(){ tone({freq:1400,freq2:500,dur:.08,type:'sawtooth',gain:.045}); },
    shootHeavy(){ tone({freq:300,freq2:90,dur:.18,type:'square',gain:.08}); noise({dur:.12,gain:.05,type:'lowpass',freq:800}); },
    hit(){ noise({dur:.06,gain:.04,type:'bandpass',freq:2200,q:1.2}); },
    explode(){ noise({dur:.4,gain:.16,type:'lowpass',freq:900,sweep:120}); tone({freq:90,freq2:40,dur:.35,type:'sine',gain:.12}); },
    heal(){ tone({freq:660,freq2:990,dur:.25,type:'sine',gain:.04}); tone({freq:990,dur:.2,type:'sine',gain:.025,when:.08}); },
    shield(){ tone({freq:520,freq2:780,dur:.3,type:'triangle',gain:.06}); },
    encrypt(){ tone({freq:300,freq2:180,dur:.3,type:'square',gain:.05}); noise({dur:.25,gain:.04,type:'bandpass',freq:900}); },
    detect(){ tone({freq:1200,freq2:1800,dur:.18,type:'sine',gain:.06}); },
    alarm(){ [0,.22,.44].forEach(w=>tone({freq:880,dur:.14,type:'square',gain:.06,when:w})); },
    boss(){ tone({freq:70,dur:1.6,type:'sawtooth',gain:.12}); tone({freq:105,dur:1.4,type:'sine',gain:.08,when:.2}); noise({dur:1.8,gain:.08,type:'lowpass',freq:400}); },
    isolate(){ tone({freq:440,freq2:220,dur:.25,type:'triangle',gain:.08}); noise({dur:.2,gain:.05,type:'bandpass',freq:700}); },
    reroute(){ tone({freq:700,freq2:1100,dur:.15,type:'sine',gain:.045}); tone({freq:1100,dur:.1,type:'sine',gain:.03,when:.1}); },
    leak(){ tone({freq:180,freq2:60,dur:.6,type:'sawtooth',gain:.14}); noise({dur:.5,gain:.1,type:'lowpass',freq:600}); },
    wave(){ [0,3,7].forEach((n,i)=>tone({freq:220*Math.pow(2,n/12),dur:.3,type:'triangle',gain:.07,when:i*.12})); },
    skill(){ tone({freq:400,freq2:1200,dur:.35,type:'triangle',gain:.08}); noise({dur:.3,gain:.05,type:'bandpass',freq:2000,sweep:4000}); },
    win(){ [0,4,7,12,16].forEach((n,i)=>tone({freq:330*Math.pow(2,n/12),dur:.6,type:'triangle',gain:.08,when:i*.14})); },
    lose(){ [0,-3,-7,-12].forEach((n,i)=>tone({freq:220*Math.pow(2,n/12),dur:.7,type:'sawtooth',gain:.08,when:i*.2})); }
  };

  function sfx(name, opts={}){
    if(!ready) return;
    if(opts.pan!=null){
      const orig = SFX[name];
      if(orig) orig();
      return;
    }
    const f = SFX[name];
    if(f) f();
  }

  function stopAll(){
    stopAmbient();
    currentMap=null;
  }

  return { init, resume, setMuted, setVolumes, ambient, sfx, stopAll, get ready(){return ready;} };
})();