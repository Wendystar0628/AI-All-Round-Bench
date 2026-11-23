(function () {
  const $=id=>document.getElementById(id);
  const clamp=LabScenes.clamp,lerp=LabScenes.lerp,smooth=LabScenes.smooth;
  const DEMOS={
    'jelly-center':{scene:'jelly',duration:8,softness:.68,toughness:.94,mass:16,height:3.2,label:'正中单击'},
    'jelly-multi':{scene:'jelly',duration:10,softness:.68,toughness:.24,mass:17,height:5.2,label:'连续冲击'},
    'jelly-offset':{scene:'jelly',duration:8,softness:.52,toughness:.92,mass:7.5,height:3.6,label:'偏心冲击'},
    'tank-full':{scene:'tank',duration:20,label:'完整风浪'}
  };
  const state={scene:'jelly',paused:false,slow:false,running:false,run:null,runTime:0,accumulator:0,exporting:false,wave:false,impact:'center',softness:.55,toughness:.78,mass:8,height:3.2,amplitude:.62,frequency:.65,densities:[.45,.82,1,2.4],lastMetrics:0};
  let renderer,environment,jelly,tank,water,tankReady,active,last=performance.now(),toastTimer,resetToken=0;

  class SoundLab {
    constructor(){this.enabled=true;this.ctx=null;this.last={};this.waveGain=null;}
    ensure(){
      if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;this.ctx=new AC();const length=this.ctx.sampleRate;const buffer=this.ctx.createBuffer(1,length,this.ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=Math.random()*2-1;this.noise=buffer;}
      if(this.ctx.state==='suspended')this.ctx.resume();
    }
    tone(freq,duration,gain,type='sine',slide=.4){if(!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*slide),t+duration);g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g).connect(this.ctx.destination);o.start(t);o.stop(t+duration);}
    burst(duration,gain,frequency=800,q=.7,delay=0){if(!this.ctx)return;const t=this.ctx.currentTime+delay,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;f.type='bandpass';f.frequency.value=frequency;f.Q.value=q;g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(gain,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);s.connect(f).connect(g).connect(this.ctx.destination);s.start(t);s.stop(t+duration+.02);}
    play(type,value=1){
      if(!this.enabled||state.exporting)return;this.ensure();if(!this.ctx)return;const now=this.ctx.currentTime,min=type==='impact'?.12:.065;if(now-(this.last[type]||0)<min)return;this.last[type]=now;const v=clamp(value/80,.08,1);
      if(type==='impact'){this.tone(95,.5,.2*v,'sine',.32);this.burst(.16,.12*v,180,.8);}
      else if(type==='floor'){this.tone(72,.24,.1*v,'sine',.5);this.burst(.08,.045*v,330,1);}
      else if(type==='ball'){this.tone(620,.13,.04*v,'sine',.55);this.tone(970,.08,.018*v,'sine',.8);}
      else if(type==='crack'){for(let i=0;i<4;i++)this.burst(.09+i*.018,.1,1600+i*650,1.8,i*.025);this.tone(130,.25,.07,'triangle',.35);}
      else if(type==='splash'){this.burst(.38,.12*v,920,.45);this.burst(.2,.06*v,2400,.8,.025);this.tone(105,.22,.035*v,'sine',.6);}
    }
    updateWave(amount){if(!this.ctx||!this.noise)return;if(!this.waveGain){const s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();s.buffer=this.noise;s.loop=true;f.type='lowpass';f.frequency.value=520;g.gain.value=0;s.connect(f).connect(g).connect(this.ctx.destination);s.start();this.waveGain=g;this.waveFilter=f;}const target=this.enabled&&!state.exporting&&state.scene==='tank'?amount*.055:0;this.waveGain.gain.setTargetAtTime(target,this.ctx.currentTime,.15);this.waveFilter.frequency.setTargetAtTime(380+amount*500,this.ctx.currentTime,.2);}
  }
  const audio=new SoundLab();

  function notify(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1900);}
  function formatTime(t){const m=Math.floor(t/60),s=Math.floor(t%60),d=Math.floor((t%1)*10);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${d}`;}
  function updateRange(input){const min=+input.min,max=+input.max;input.style.setProperty('--value',`${(+input.value-min)/(max-min)*100}%`);}
  function syncPlayIcon(){$('playIcon').innerHTML=state.paused?'<path d="M8 5l11 7-11 7V5z"/>':'<path d="M8 5v14M16 5v14"/>';$('playBtn').title=state.paused?'继续':'暂停';$('liveText').textContent=state.paused?'模拟已暂停':'实时模拟';}

  function createDensityControls(){
    const names=['低密度','轻悬浮','中性','高密度'],colors=['#ff8b70','#f5cf66','#6ee7dc','#a893ff'],root=$('densityControls');root.innerHTML='';
    names.forEach((name,i)=>{const row=document.createElement('div');row.className='density-row';row.style.setProperty('--c',colors[i]);row.innerHTML=`<i></i><label for="density${i}">${name}</label><input id="density${i}" type="range" min="30" max="300" value="${Math.round(state.densities[i]*100)}"><output id="density${i}Out">${state.densities[i].toFixed(2)}</output>`;root.appendChild(row);const input=row.querySelector('input');updateRange(input);input.addEventListener('input',()=>{state.densities[i]=+input.value/100;row.querySelector('output').value=state.densities[i].toFixed(2);$('legend'+i).textContent=state.densities[i].toFixed(2);if(tank)tank.setDensities(state.densities);updateRange(input);});});
  }

  function updatePanel(){
    const isJelly=state.scene==='jelly';
    document.querySelectorAll('.scene-tab').forEach(b=>b.classList.toggle('active',b.dataset.scene===state.scene));
    $('experimentNo').textContent=isJelly?'EXPERIMENT 01':'EXPERIMENT 02';$('methodLabel').textContent=isJelly?'VOLUMETRIC XPBD':'3D PIC / FLIP · WEBGPU';
    $('sceneTitle').textContent=isJelly?'柔软，也有回响。':'密度之间，风浪成形。';$('sceneSubtitle').textContent=isJelly?'观察冲击如何在体积守恒的软体中传播、叠加与释放。':'从一滴入水，到一道破浪；看见流体与刚体的双向作用。';
    $('jellyControls').hidden=!isJelly;$('tankControls').hidden=isJelly;$('jellyPresets').hidden=!isJelly;$('tankPresets').hidden=isJelly;$('jellyAnnotations').hidden=!isJelly;$('densityLegend').hidden=isJelly;$('waveBtn').hidden=isJelly;
    $('actionLabel').textContent=isJelly?'释放重球':'再次释放小球';$('solverTitle').textContent=isJelly?'体积约束求解器':'粒子—网格混合求解器';$('solverDesc').textContent=isJelly?'XPBD · 四面体应力 · 裂纹扩展':'WebGPU · FLIP · 压力投影';$('solverFoot').textContent=isJelly?'形变来自节点位移与材料应力，而非预录动画。':'液面、飞溅和白水均由三维粒子状态重建。';
    $('metricLabel0').textContent=isJelly?'冲击能量':'水面变化';$('metricLabel1').textContent=isJelly?'最大形变':'白水活性';$('metricLabel2').textContent=isJelly?'体积保持':'最大流速';
    active=state.scene==='jelly'?jelly:tank;resize();
  }

  async function switchScene(scene,force=false){
    if(state.scene===scene&&!force)return;if(scene==='tank')await tankReady;state.scene=scene;state.run=null;state.runTime=0;state.accumulator=0;state.paused=false;state.wave=false;
    updatePanel();if(scene==='tank'&&tank){tank.arrangeBalls();water.setWave(false,state.amplitude,state.frequency);await water.step(.01,tank.balls);tank.syncWater();}else if(scene==='jelly')jelly.sync();
    $('runState').textContent='实验就绪';$('timelineProgress').value=0;$('timeLabel').textContent='00:00.0';updateWaveButton();syncPlayIcon();
  }

  function applyDemoControls(id){const d=DEMOS[id];if(!d||d.scene!=='jelly')return;state.softness=d.softness;state.toughness=d.toughness;state.mass=d.mass;state.height=d.height;$('softness').value=Math.round(d.softness*100);$('toughness').value=Math.round(d.toughness*100);$('ballMass').value=d.mass;$('dropHeight').value=d.height;for(const el of document.querySelectorAll('input[type=range]'))updateRange(el);updateControlOutputs();}
  function updateControlOutputs(){
    $('softnessOut').value=Math.round(state.softness*100)+'%';$('toughnessOut').value=Math.round(state.toughness*100)+'%';$('ballMassOut').value=state.mass.toFixed(1)+' kg';$('dropHeightOut').value=state.height.toFixed(1)+' m';$('waveAmplitudeOut').value=Math.round(state.amplitude*100)+'%';$('waveFrequencyOut').value=state.frequency.toFixed(2)+' Hz';
    $('materialHint').textContent=state.toughness<.4?'脆韧交界 · 强冲击可能开裂':state.softness>.65?'柔软慢回弹 · 凹陷与鼓出更明显':'适中回弹 · 重击下保持完整';
  }

  async function setupRun(id,forExport=false){
    const token=++resetToken,manual=id.startsWith('manual-'),d=DEMOS[id];state.run=id;state.runTime=0;state.accumulator=0;state.paused=false;
    if(d&&d.scene==='jelly')applyDemoControls(id);
    if((d&&d.scene==='tank')||id==='tank-drop'){
      await tankReady;if(token!==resetToken&&!forExport)return;tank.time=0;tank.bubbles=[];tank.setDensities(id==='tank-full'?[.45,.82,1,2.4]:state.densities);water.setWave(false,state.amplitude,state.frequency);await water.reset();tank.releaseBalls(id==='tank-full');tank.syncWater();tank.syncBalls();state.wave=false;
    }else{
      const impact=manual?id.split('-')[1]:state.impact;jelly.reset({softness:state.softness,toughness:state.toughness});
      if(id==='jelly-center')jelly.drop({mass:16,height:.32,speed:-6.5,radius:.5});
      else if(id==='jelly-multi')jelly.drop({mass:5.2,height:.04,speed:-4.8,radius:.38});
      else if(id==='jelly-offset')jelly.drop({mass:7.5,height:.06,offset:[.63,.02],velocity:[1.8,-6.4,-.65],radius:.41});
      else if(manual){
        if(impact==='center')jelly.drop({mass:state.mass,height:state.height});
        else if(impact==='offset')jelly.drop({mass:state.mass,height:state.height,offset:[.66,.06],velocity:[1.55,0,-.4]});
        else jelly.drop({mass:state.mass*.55,height:state.height*.8});
      }
    }
    state.running=true;$('runState').textContent=d?d.label:manual?'自定义冲击':'密度入水';document.querySelectorAll('[data-run]').forEach(b=>b.classList.toggle('active',b.dataset.run===id));updateWaveButton();syncPlayIcon();
  }

  function timeScaleAt(id,t){
    if(id==='jelly-center')return t<1.25?.27:t>4.2?1.65:1;
    if(id==='jelly-multi')return t<.65?.45:t>2.5&&t<3.9?.28:t>6.2?2.05:1;
    if(id==='jelly-offset')return t<1.05?.36:t>4.4?1.45:1;
    if(id==='tank-full')return t>8.7&&t<10.35?.42:t>15.5?1.45:1;
    return 1;
  }

  function waveScript(t){
    if(t<1||t>=14.5){water.setWave(false,state.amplitude,state.frequency);state.wave=false;return;}
    let amp;if(t<3)amp=lerp(.12,.32,(t-1)/2);else if(t<6)amp=lerp(.32,.58,(t-3)/3);else if(t<9)amp=lerp(.58,.96,(t-6)/3);else amp=.96;
    const freq=t<5?.52:t<10?.67:.78;water.setWave(true,amp,freq);state.wave=true;
  }

  function fireEvents(id,previous,t){
    const crossed=time=>previous<time&&t>=time;
    if(id==='jelly-multi'){
      if(crossed(1.35))jelly.drop({mass:9,height:.08,speed:-6.9,radius:.42,offset:[-.08,.03]});
      if(crossed(2.62))jelly.drop({mass:17,height:.05,speed:-10.5,radius:.47,offset:[.02,0]});
    }else if(id==='manual-multi'){
      if(crossed(1.25))jelly.drop({mass:state.mass*.85,height:state.height*.45,offset:[-.08,0]});
      if(crossed(2.45))jelly.drop({mass:state.mass*1.3,height:state.height*.35,speed:-2.5});
    }
    if(id==='tank-full')waveScript(t);
  }

  async function advanceSegment(id,dt,previous,t){
    if(dt<=0)return;fireEvents(id,previous,t);const scale=timeScaleAt(id,t),simDt=dt*scale;
    if((DEMOS[id]&&DEMOS[id].scene==='tank')||id==='tank-drop'){
      await tank.step(simDt);audio.updateWave(water.currentAmplitude);
    }else{
      const steps=Math.max(1,Math.ceil(simDt/(1/100))),h=simDt/steps;for(let i=0;i<steps;i++)jelly.step(h);jelly.sync();
    }
  }

  async function advanceTo(id,target,from=state.runTime){
    let current=from;const events=id==='jelly-multi'?[1.35,2.62]:id==='manual-multi'?[1.25,2.45]:id==='tank-full'?[1,3,6,9,14.5]:[];
    while(current<target-1e-8){let next=Math.min(target,current+1/45);for(const e of events)if(e>current+1e-8&&e<next)next=e;await advanceSegment(id,next-current,current,next);current=next;}
    state.runTime=target;const duration=DEMOS[id]?.duration||(id==='tank-drop'?8:10);$('timelineProgress').value=clamp(target/duration*100,0,100);$('timeLabel').textContent=formatTime(target);
    if(state.scene==='jelly')jelly.demoCamera(id,target);else tank.demoCamera(id,target);
    if(target>=duration&&!state.exporting){state.run=null;$('runState').textContent='自由观察';audio.updateWave(0);}
  }

  async function resetScene(){
    const id=state.run;state.run=null;state.runTime=0;state.accumulator=0;state.paused=false;state.wave=false;$('timelineProgress').value=0;$('timeLabel').textContent='00:00.0';$('runState').textContent='实验就绪';syncPlayIcon();
    if(state.scene==='jelly'){jelly.reset({softness:state.softness,toughness:state.toughness});jelly.cameraHome();}
    else{await tankReady;water.setWave(false,state.amplitude,state.frequency);await water.reset();tank.time=0;tank.bubbles=[];tank.arrangeBalls();tank.syncWater();tank.cameraHome();}
    updateWaveButton();syncPlayIcon();
  }

  function updateWaveButton(){const b=$('waveBtn');b.classList.toggle('running',state.wave);b.querySelector('span').textContent=state.wave?'停止造浪':'启动造浪';}

  function updateMetrics(){
    if(!active)return;
    if(state.scene==='jelly'&&jelly.world){
      const b=jelly.world.bodies[0],energy=jelly.world.impactEnergy,deform=b.deformation,vol=clamp(b.volumeRatio*100,0,199);$('metric0').innerHTML=energy.toFixed(energy<10?1:0)+'<small>J</small>';$('metric1').innerHTML=deform.toFixed(0)+'<small>%</small>';$('metric2').innerHTML=vol.toFixed(0)+'<small>%</small>';$('metricBar0').style.width=clamp(energy/4,0,100)+'%';$('metricBar1').style.width=clamp(deform,0,100)+'%';$('metricBar2').style.width=clamp(100-Math.abs(100-vol)*2,0,100)+'%';
    }else if(water){const level=(water.meanLevel-1.65)*100,foam=water.foamAmount*100,speed=water.maxSpeed;$('metric0').innerHTML=(level>=0?'+':'')+level.toFixed(1)+'<small>cm</small>';$('metric1').innerHTML=foam.toFixed(1)+'<small>%</small>';$('metric2').innerHTML=speed.toFixed(1)+'<small>m/s</small>';$('metricBar0').style.width=clamp(Math.abs(level)*4,0,100)+'%';$('metricBar1').style.width=clamp(foam*5,0,100)+'%';$('metricBar2').style.width=clamp(speed*16,0,100)+'%';}
  }

  function resize(){
    if(!renderer||!active)return;const width=state.exporting?window.innerWidth:$('viewport').clientWidth,height=state.exporting?window.innerHeight:$('viewport').clientHeight;if(!width||!height)return;active.resize(width,height,state.exporting?1:Math.min(devicePixelRatio,1.65));if(tank)tank.waterPoints.material.uniforms.uRatio.value=state.exporting?1:Math.min(devicePixelRatio,1.65);
  }

  let busy=false;
  async function tick(now){
    requestAnimationFrame(tick);const realDt=Math.min(.045,Math.max(0,(now-last)/1000));last=now;if(state.exporting||busy)return;
    if(!state.paused&&active){
      busy=true;try{
        const dt=realDt*(state.slow?.25:1);
        if(state.run){const next=Math.min((DEMOS[state.run]?.duration||10),state.runTime+dt);await advanceTo(state.run,next);}
        else if(state.scene==='jelly'){state.accumulator+=dt;let n=0;while(state.accumulator>=1/120&&n<7){jelly.step(1/120);state.accumulator-=1/120;n++;}jelly.sync();}
        else if(tank){await tank.step(dt);audio.updateWave(water.currentAmplitude);}
      }catch(error){console.error(error);notify('模拟已暂停，请重置后重试');state.paused=true;syncPlayIcon();}finally{busy=false;}
    }
    if(active){active.updateVisual(state.paused?0:realDt);updateMetrics();active.render();}
  }

  function bindInterface(){
    document.querySelectorAll('.scene-tab').forEach(b=>b.addEventListener('click',()=>switchScene(b.dataset.scene)));
    document.querySelectorAll('[data-run]').forEach(b=>b.addEventListener('click',async()=>{audio.ensure();const id=b.dataset.run;if((DEMOS[id]?.scene||'tank')!==state.scene)await switchScene(DEMOS[id]?.scene||'tank',true);await setupRun(id);}));
    $('actionBtn').addEventListener('click',async()=>{audio.ensure();if(state.scene==='jelly')await setupRun('manual-'+state.impact);else await setupRun('tank-drop');});
    $('resetBtn').addEventListener('click',resetScene);
    $('playBtn').addEventListener('click',()=>{state.paused=!state.paused;syncPlayIcon();$('liveText').textContent=state.paused?'模拟已暂停':'实时模拟';});
    $('slowBtn').addEventListener('click',()=>{state.slow=!state.slow;$('slowBtn').classList.toggle('active',state.slow);$('slowBadge').hidden=!state.slow;});
    $('waveBtn').addEventListener('click',async()=>{await tankReady;state.run=null;state.wave=!state.wave;water.setWave(state.wave,state.amplitude,state.frequency);updateWaveButton();syncPlayIcon();$('runState').textContent=state.wave?'连续造浪':'波浪衰减';});
    document.querySelectorAll('[data-impact]').forEach(b=>b.addEventListener('click',()=>{state.impact=b.dataset.impact;document.querySelectorAll('[data-impact]').forEach(x=>x.classList.toggle('active',x===b));}));
    const ranges=[['softness','softness',100],['toughness','toughness',100],['ballMass','mass',1],['dropHeight','height',1],['waveAmplitude','amplitude',100],['waveFrequency','frequency',100]];
    for(const [id,key,div] of ranges){const el=$(id);updateRange(el);el.addEventListener('input',()=>{state[key]=+el.value/div;updateRange(el);updateControlOutputs();if(key==='softness'||key==='toughness')jelly.setMaterial(state.softness,state.toughness);if(key==='amplitude'||key==='frequency'){if(water)water.setWave(state.wave,state.amplitude,state.frequency);}});}
    $('soundBtn').addEventListener('click',()=>{audio.enabled=!audio.enabled;if(audio.enabled)audio.ensure();$('soundBtn').classList.toggle('sound-on',audio.enabled);$('soundBtn').style.opacity=audio.enabled?1:.45;notify(audio.enabled?'声音已开启':'声音已静音');});
    $('helpBtn').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelp').addEventListener('click',()=>$('helpDialog').close());$('helpDialog').addEventListener('click',e=>{if(e.target===$('helpDialog'))$('helpDialog').close();});
    $('cameraHome').addEventListener('click',()=>active.cameraHome());$('cameraDetail').addEventListener('click',()=>active.cameraDetail());
    document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();resetScene();});
    $('collapseBtn').addEventListener('click',()=>{const panel=document.querySelector('.inspector');panel.classList.toggle('collapsed');document.querySelector('.workspace').style.gridTemplateColumns=panel.classList.contains('collapsed')?'minmax(0,1fr) 50px':'';$('collapseBtn').textContent=panel.classList.contains('collapsed')?'+':'—';setTimeout(resize,50);});
    window.addEventListener('resize',resize);
    window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT'||$('helpDialog').open)return;if(e.code==='Space'){e.preventDefault();$('playBtn').click();}else if(e.key.toLowerCase()==='r')resetScene();else if(e.key==='1')switchScene('jelly');else if(e.key==='2')switchScene('tank');});
    let drag=null;renderer.domElement.addEventListener('pointerdown',e=>{if(state.exporting)return;audio.ensure();drag={x:e.clientX,y:e.clientY,theta:active.desired.theta,phi:active.desired.phi};renderer.domElement.setPointerCapture(e.pointerId);});
    renderer.domElement.addEventListener('pointermove',e=>{if(!drag||state.exporting)return;active.desired.theta=drag.theta-(e.clientX-drag.x)*.005;active.desired.phi=clamp(drag.phi-(e.clientY-drag.y)*.004,.35,1.48);});
    renderer.domElement.addEventListener('pointerup',()=>drag=null);renderer.domElement.addEventListener('pointercancel',()=>drag=null);
    renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();if(state.exporting)return;active.desired.radius=clamp(active.desired.radius+e.deltaY*.006,state.scene==='jelly'?4.3:6.5,state.scene==='jelly'?12:15);},{passive:false});
  }

  async function init(){
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;$('viewport').appendChild(renderer.domElement);
    environment=LabScenes.makeEnvironment(renderer);jelly=new LabScenes.JellyScene(renderer,environment);jelly.onSound=(...args)=>audio.play(...args);active=jelly;jelly.reset({softness:state.softness,toughness:state.toughness});active.resize($('viewport').clientWidth,$('viewport').clientHeight,Math.min(devicePixelRatio,1.65));createDensityControls();bindInterface();updateControlOutputs();
    tankReady=(async()=>{try{water=await WaveWater.create();tank=new LabScenes.TankScene(renderer,environment,water);tank.onSound=(...args)=>audio.play(...args);await water.step(.01,tank.balls);tank.syncWater();tank.syncBalls();$('gpuLabel').textContent='WebGPU 计算核心已连接';return tank;}catch(error){console.error('WebGPU initialization:',error);$('gpuLabel').textContent='水体计算核心不可用';notify('请使用支持 WebGPU 的 Chrome 打开');throw error;}})();tankReady.catch(()=>{});
    requestAnimationFrame(tick);setTimeout(()=>{if(!state.exporting&&state.scene==='jelly')setupRun('jelly-center');},350);
  }

  window.videoExport={
    runs:['jelly-center','jelly-multi','jelly-offset','tank-full'],
    async begin(runId,{fps}={}){
      if(!this.runs.includes(runId))throw new Error('Unknown run: '+runId);fps=Math.max(1,Math.floor(fps||30));if(DEMOS[runId].scene==='tank')await tankReady;
      state.exporting=true;state.paused=true;state.scene=DEMOS[runId].scene;document.body.classList.add('exporting');updatePanel();audio.updateWave(0);await setupRun(runId,true);active.updateVisual(0);active.demoCamera(runId,0);resize();active.render();
      this.session={runId,fps,time:0,frames:Math.round(DEMOS[runId].duration*fps)};return{frames:this.session.frames};
    },
    async frame(i){
      const s=this.session;if(!s)throw new Error('Call begin first');if(!Number.isInteger(i)||i<0||i>=s.frames)throw new Error('Frame index out of range');const target=i/s.fps;
      if(target<s.time-1e-8)throw new Error('Frames must be requested in order');
      if(target>s.time+1e-8)await advanceTo(s.runId,target,s.time);s.time=target;
      if(state.scene==='jelly')jelly.sync();else{tank.syncWater();tank.syncBalls();}active.demoCamera(s.runId,target);active.updateVisual(0);resize();active.render();renderer.getContext().finish();
    },
    end(){
      if(!this.session)return;this.session=null;state.exporting=false;state.paused=false;state.run=null;document.body.classList.remove('exporting');updatePanel();active.cameraHome();resize();last=performance.now();$('runState').textContent='自由观察';syncPlayIcon();
    }
  };

  init().catch(error=>{console.error(error);notify('三维场景初始化失败');});
})();
