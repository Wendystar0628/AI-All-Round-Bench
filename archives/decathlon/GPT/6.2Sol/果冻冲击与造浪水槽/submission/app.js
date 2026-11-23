'use strict';
const $=id=>document.getElementById(id);
const icons={
  play:'<path d="m8 5 11 7-11 7z"/>',pause:'<path d="M9 5v14m6-14v14"/>',reset:'<path d="M3 10a9 9 0 1 1 2 8m-2-8V4m0 6h6"/>',
  speaker:'<path d="M3 9v6h4l5 4V5L7 9zm13-.5a5 5 0 0 1 0 7m3-10a9 9 0 0 1 0 13"/>',
  mute:'<path d="M3 9v6h4l5 4V5L7 9zm13 1 5 5m0-5-5 5"/>',view:'<circle cx="12" cy="12" r="4"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  sliders:'<path d="M5 4v16m7-16v16m7-16v16M2 9h6m1 6h6m1-7h6"/>',drop:'<path d="M12 3v12m-4-4 4 4 4-4M5 20h14"/>',
  center:'<path d="M4 18h16l-2 3H6zM12 8v7m-3-3 3 3 3-3"/><circle cx="12" cy="5" r="2"/>',
  multi:'<path d="M4 19h6l2-3 1 3h7M7 6v8m5-11v9m5-6v8"/><path d="m5 12 2 2 2-2m6 0 2 2 2-2"/>',
  offset:'<path d="m6 5 8 8m-5-.5 5 .5-.5-5M5 18l13-2 1 4H5z"/><circle cx="5" cy="4" r="2"/>',
  wave:'<path d="M2 16c3-1 3-9 8-9 2 0 4 1 5 3-4-1-5 2-2 4 3 2 6 1 9-1M2 20c3 0 4-3 7-3s4 3 7 3 4-2 6-2"/>',
};
const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[name]+'</svg>';
$('homeView').innerHTML=svg('view');$('slidersIcon').innerHTML=svg('sliders');
$('reset').innerHTML=svg('reset')+' 重置';
const demos=[
  {id:'jelly-center',name:'正中单击',seconds:6.3,kind:'jelly',mode:'center',icon:'center',color:'#65eacc',params:{soft:.71,tough:.92,mass:3.65,height:1.35}},
  {id:'jelly-multi',name:'递进连击',seconds:8.8,kind:'jelly',mode:'multi',icon:'multi',color:'#ffb76e',params:{soft:.74,tough:.43,mass:3.2,height:1.4}},
  {id:'jelly-offset',name:'偏心冲击',seconds:6.4,kind:'jelly',mode:'offset',icon:'offset',color:'#b5a1ff',params:{soft:.75,tough:.95,mass:4.7,height:1.28}},
  {id:'tank-full',name:'从静水到破浪',seconds:19.5,kind:'tank',mode:'',icon:'wave',color:'#79caff',params:{amplitude:.14,frequency:.59,densities:[.48,1.0,2.50]}}
];
$('demoCards').innerHTML=demos.map(d=>'<button class="demo" data-run="'+d.id+'" style="--glyph:'+d.color+'"><span class="demoGlyph">'+svg(d.icon)+'</span><span><strong>'+d.name+'</strong><small>'+d.seconds.toFixed(1)+' s</small></span>'+svg('play')+'</button>').join('');
let gpuPromise=null,engine=new JellyTest(),kind='jelly',mode='center',paused=false,slow=false,reel=null,exporting=false;
let history=[], historyStep=-1;
let switching=false,busy=false,waterError='',switchVersion=0,sceneTime=0,displayTime=0,stepNumber=0,clock=performance.now();
const userParams={jelly:{...engine.params},tank:{amplitude:.61,frequency:.65,densities:[.49,1.0,2.52]}};
const userMaterials=engine.materials.map(pair=>pair.slice());
const orbit={az:0,el:0,zoom:1};
const audio=window.labAudio={enabled:false,silent:false,ctx:null,noise:null};
function updateSound(){
  $('sound').innerHTML=svg(audio.enabled?'speaker':'mute')+' '+(audio.enabled?'音效开启':'音效关闭');$('sound').classList.toggle('active',audio.enabled);
}
updateSound();
$('sound').onclick=async()=>{
  if(!audio.ctx){
    audio.ctx=new AudioContext();
    const noise=audio.ctx.createBuffer(1,audio.ctx.sampleRate,audio.ctx.sampleRate),raw=noise.getChannelData(0),rng=randomSource(572);
    for(let i=0;i<raw.length;i++)raw[i]=rng()*2-1;
    audio.noise=noise;
  }
  if(!audio.enabled)await audio.ctx.resume();
  audio.enabled=!audio.enabled;updateSound();
};
function param(key,label,value,min,max,step,unit='',color=''){
  const fmt=v=>Number(v).toFixed(step<.1?2:1)+unit;
  return '<label class="param" style="'+(color?'--slider:'+color:'')+'"><span><em>'+label+'</em><output>'+fmt(value)+'</output></span><input data-param="'+key+'" data-unit="'+unit+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" style="--fill:'+((value-min)/(max-min)*100)+'%"></label>';
}
function ui(){
  const jelly=kind==='jelly',p=engine?.params||userParams[kind];
  const specimen=jelly?engine.target:0;
  const [soft,tough]=jelly&&specimen?engine.materials[specimen]:[p.soft,p.tough];
  $('jtab').classList.toggle('selected',jelly);$('wtab').classList.toggle('selected',!jelly);
  $('jtab').setAttribute('aria-pressed',jelly);$('wtab').setAttribute('aria-pressed',!jelly);
  $('eyebrow').textContent=jelly?'01 / SOFT BODY':'02 / FLUID DYNAMICS';
  $('title').textContent=jelly?'重球冲击果冻':'多密度球与造浪水槽';
  $('description').textContent=jelly?'观察重球如何压缩、弹开或撕裂不同硬度的果冻。':'释放三组同尺寸小球，观察浮沉、造浪和破碎后的水体运动。';
  $('specimens').innerHTML=(jelly?[['#5de5bb','A 主样品'],['#ffbe55','B 硬质参照'],['#b59af5','C 软质参照']]:[['#ffbe55','低密度组'],['#57edd8','中性组'],['#c990ff','高密度组']]).map(([c,s],i)=>'<span><i style="--dot:'+c+'"></i>'+s+(jelly?'':'<output id="layer'+i+'" aria-label="该组平均高度"></output>')+'</span>').join('');
  const st=jelly?
  '<div class="controlSection"><div class="rowTitle"><span>冲击方式</span><select id="targetGel" aria-label="受击样品"><option value="0">A 主样品</option><option value="1">B 硬质参照</option><option value="2">C 软质参照</option></select></div><div class="choices">'+[['center','正中'],['offset','偏心'],['multi','连续']].map(([m,s])=>'<button data-mode="'+m+'" aria-pressed="'+(mode===m)+'" class="'+(mode===m?'isOn':'')+'">'+s+'</button>').join('')+'</div>'+(mode==='offset'?'<div class="aimParam">'+param('offset','预定落点偏移',p.offset??-.83,-1.20,1.20,.01,' m')+'</div>':'')+'<button class="trigger" id="trigger">'+svg('drop')+' 释放重球</button></div>'+
  '<div class="controlSection"><div class="rowTitle">果冻材料 <span>'+['A','B','C'][specimen]+' 样品</span></div>'+param('soft','柔软度',soft,0,1,.01)+param('tough','结实程度',tough,0,1,.01)+'</div>'+
  '<div class="controlSection"><div class="rowTitle">重球设置</div>'+param('mass','重球质量',p.mass,.9,11,.1,' kg')+param('height','下落高度',p.height,.45,4.6,.05,' m')+'</div>':
  '<div class="controlSection"><div class="rowTitle">水槽操作</div><div class="tankActions"><button class="trigger" id="trigger">'+svg('drop')+' 释放小球</button><button class="trigger secondary" id="toggleWave">'+svg('wave')+' 开始造浪</button></div></div>'+
  '<div class="controlSection"><div class="rowTitle">造浪设置</div>'+param('amplitude','造浪幅度',p.amplitude,0,1,.01)+param('frequency','造浪频率',p.frequency,.25,1.3,.01,' Hz')+'</div>'+
  '<div class="controlSection"><div class="rowTitle">小球相对密度 <span>水 = 1.00</span></div>'+param('0','低密度组',p.densities[0],.22,3.2,.01,'','#ffbe55')+param('1','中性组',p.densities[1],.22,3.2,.01,'','#57edd8')+param('2','高密度组',p.densities[2],.22,3.2,.01,'','#c990ff')+'</div>';
  $('controlsBody').innerHTML=st;
  if(jelly){
    const target=$('targetGel');
    target.value=String(engine.target);
    target.onchange=()=>{
      if(switching||exporting)return;
      stopReel();engine.target=Number(target.value);
      history=[];historyStep=-1;
      ui();$('targetGel').focus({preventScroll:true});render();
    };
  }
  for(const el of document.querySelectorAll('[data-mode]'))el.onclick=()=>{
    if(switching||exporting)return;
    stopReel();mode=el.dataset.mode;engine.mode=mode;ui();
    document.querySelector('[data-mode="'+mode+'"]').focus({preventScroll:true});render();
  };
  for(const el of document.querySelectorAll('[data-param]')) el.oninput=()=>{
    if(switching||exporting)return;
    stopReel();
    const k=el.dataset.param, v=Number(el.value);
    if(k.length===1){engine.params.densities[+k]=v;userParams[kind].densities[+k]=v;if(engine.balls.length)engine.active=true;}
    else if(jelly&&engine.target&&(k==='soft'||k==='tough')){
      const column=k==='soft'?0:1;
      engine.materials[engine.target][column]=v;userMaterials[engine.target][column]=v;
    }else{engine.params[k]=v;userParams[kind][k]=v;}
    el.previousElementSibling.querySelector('output').textContent=v.toFixed(Number(el.step)<.1?2:1)+el.dataset.unit;
    el.style.setProperty('--fill',100*(v-el.min)/(el.max-el.min)+'%');
    if(!busy)render();
  };
  $('trigger').onclick=()=>{
    if(switching||exporting)return;
    stopReel();paused=false;
    if(kind==='jelly')engine.launch(mode);
    else engine.release();
    updateUIState();
  };
  if(!jelly)$('toggleWave').onclick=()=>{if(!switching&&!exporting){stopReel();paused=false;engine.toggleWave();updateUIState();}};
  updateUIState();
}
function updateTrace(){
  if(exporting)return;
  const jelly=kind==='jelly';
  let value;
  if(jelly){
    const g=engine.gels[engine.target],restHeight=g.dims[1]+.017;let height=0;
    for(const a of g.boundary)height=Math.max(height,g.p[a+1]);
    value=clamp((restHeight-height)/restHeight,0,1);
    $('measureLabel').textContent=['A','B','C'][g.kind]+' 样品压缩率';
    $('measureValue').textContent=(value*100).toFixed(1)+' %';
    $('auxLabel').textContent='体积 / 初始体积';
    $('auxValue').textContent=(g.volumeRatio()*100).toFixed(1)+' %';
  }else{
    const field=engine.surface.lvl;let peak=0;
    for(const h of field)peak=Math.max(peak,h);
    value=peak;
    $('measureLabel').textContent='最高水面';
    $('measureValue').textContent=peak.toFixed(2)+' m';
    const observingWall=engine.wave||engine.waveEnvelope>.025;
    $('auxLabel').textContent=observingWall?'远端壁面水位':'平均水位 / 初始';
    $('auxValue').textContent=observingWall?engine.wallRunup.toFixed(2)+' m':engine.averageLevel.toFixed(2)+' / '+engine.startLevel.toFixed(2)+' m';
    const sums=[0,0,0],counts=[0,0,0];
    for(const {group,p} of engine.balls){sums[group]+=p.y;counts[group]++;}
    for(let i=0;i<3;i++)$('layer'+i).textContent=counts[i]?(sums[i]/counts[i]).toFixed(2)+' m':'';
  }
  if(stepNumber!==historyStep){
    historyStep=stepNumber;history.push(value);if(history.length>115)history.shift();
  }
  const c=$('trace'),ctx=c.getContext('2d'),w=c.width,h=c.height;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='#20383e';ctx.lineWidth=1;ctx.beginPath();
  for(let x=.5;x<w;x+=26){ctx.moveTo(x,0);ctx.lineTo(x,h);}
  for(let y=10.5;y<h;y+=12){ctx.moveTo(0,y);ctx.lineTo(w,y);}
  ctx.stroke();ctx.beginPath();
  ctx.moveTo(0,h-4-(h-8)*clamp((history[0]||0)/(jelly?.60:3.4),0,1));
  for(let i=0;i<history.length;i++)ctx.lineTo(w-(history.length-1-i)*w/115,h-4-(h-8)*clamp(history[i]/(jelly?.60:3.4),0,1));
  ctx.strokeStyle=jelly?'#67dfc4':'#8bcdf7';ctx.lineWidth=1.35;ctx.stroke();
}
function updateUIState(){
  updateTrace();
  const text=switching?'载入场景…':waterError&&kind==='tank'?waterError:paused?'已暂停':reel?(displayTime>=reel.seconds?'演示结束':'演示进行中'):engine.active?(kind==='tank'?(engine.wave?'造浪中':'水槽运行中'):(engine.gels.some(g=>g.fractured)?'样品已开裂':'实验运行中')):'待触发';
  $('status').textContent=text;
  $('pause').innerHTML=svg(paused?'play':'pause')+(paused?' 继续':' 暂停');
  $('slow').textContent=slow?'0.35×':'1×';
  $('slow').classList.toggle('active',slow);
  if($('toggleWave')){$('toggleWave').innerHTML=svg('wave')+(engine.wave?' 停止造浪':' 开始造浪');$('toggleWave').classList.toggle('active',!!engine.wave);}
  if(reel){
    $('demoProgress').textContent=displayTime.toFixed(1)+' / '+reel.seconds.toFixed(1)+' s';
    const card=document.querySelector('[data-run="'+reel.id+'"]');
    card?.style.setProperty('--progress',clamp(displayTime/reel.seconds,0,1)*100+'%');
  }else $('demoProgress').textContent='';
}
function stopReel(){
  if(!reel)return;
  const card=document.querySelector('[data-run="'+reel.id+'"]');
  card?.classList.remove('active');card?.style.removeProperty('--progress');
  reel=null;
  displayTime=sceneTime=stepNumber*(kind==='jelly'?1/120:1/60);
}
function disposeScene(obj){
  const shared=new Set([shotMat,metal,blackMetal,trim,orange,aqua,stageMat,sphereGeo,softShadow,shotMap,env,backdrop]);
  obj.scene.traverse(o=>{
    if(o.isDirectionalLight)o.shadow.map?.dispose();
    if(o.isInstancedMesh)o.dispose();
    if(o.geometry&&!shared.has(o.geometry))o.geometry.dispose();
    for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])if(!shared.has(m)){
      if(m.map&&!shared.has(m.map))m.map.dispose();m.dispose();
    }
  });
}
function resetOrbit(){orbit.az=0;orbit.el=0;orbit.zoom=1;}
async function loadScene(which,nextRun=null){
  const ticket=++switchVersion;
  switching=true;
  if(!exporting)updateUIState();
  while(busy)await new Promise(r=>setTimeout(r,8));
  if(ticket!==switchVersion)return false;
  let replacement=null;
  try{
    if(which==='tank'){
      gpuPromise ||= FluidGPU.build().catch(error=>{gpuPromise=null;throw error;});
      const gpu=await gpuPromise;
      if(ticket!==switchVersion)return false;
      replacement=new TankTest(gpu);
    }else replacement=new JellyTest();
  }catch(error){
    console.error(error);waterError=error.message;switching=false;updateUIState();return false;
  }
  const target=kind==='jelly'&&which==='jelly'&&!reel?engine.target:0;
  stopReel();
  disposeScene(engine);
  kind=which;engine=replacement;waterError='';
  if(which==='jelly'&&!nextRun){engine.target=target;engine.mode=mode;engine.materials=userMaterials.map(pair=>pair.slice());}
  resetOrbit();history=[];historyStep=-1;sceneTime=0;displayTime=0;stepNumber=0;paused=false;clock=performance.now();
  const params=nextRun?nextRun.params:userParams[kind];
  engine.params={...params};if(params.densities)engine.params.densities=[...params.densities];
  reel=nextRun;
  if(reel){
    mode=reel.mode||mode;
    if(kind==='jelly')engine.launch(reel.mode,true);
    else engine.release(true);
    document.querySelector('[data-run="'+reel.id+'"]')?.classList.add('active');
  }
  switching=false;
  ui();render();
  return true;
}
$('jtab').onclick=()=>{if(kind!=='jelly'||reel)loadScene('jelly');};
$('wtab').onclick=()=>{if(kind!=='tank'||reel)loadScene('tank');};
$('reset').onclick=()=>loadScene(kind);
$('pause').onclick=()=>{paused=!paused;clock=performance.now();updateUIState();};
$('slow').onclick=()=>{slow=!slow;updateUIState();};
$('homeView').onclick=()=>{resetOrbit();render();};
for(const card of document.querySelectorAll('.demo'))card.onclick=()=>loadScene(demos.find(d=>d.id===card.dataset.run).kind,demos.find(d=>d.id===card.dataset.run));
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!['BUTTON','INPUT'].includes(e.target.tagName)&&!exporting){e.preventDefault();$('pause').click();}
  if(e.key.toLowerCase()==='r'&&!exporting&&e.target.tagName!=='INPUT')$('reset').click();
});
let dragPoint=null;
stageEl.onpointerdown=e=>{if(exporting||e.button!==0)return;dragPoint=[e.clientX,e.clientY];stageEl.setPointerCapture(e.pointerId);};
stageEl.onpointermove=e=>{
  if(!dragPoint||exporting)return;
  orbit.az-=(e.clientX-dragPoint[0])*.006;
  orbit.el=clamp(orbit.el+(e.clientY-dragPoint[1])*.005,-.48,.71);
  dragPoint=[e.clientX,e.clientY];render();
};
stageEl.onpointerup=stageEl.onpointercancel=()=>{dragPoint=null;};
stageEl.addEventListener('wheel',e=>{
  if(exporting)return;e.preventDefault();orbit.zoom=clamp(orbit.zoom*Math.exp(e.deltaY*.00082),.63,1.66);render();
},{passive:false});
let measuredW=0,measuredH=0;
function cameraPose(){
  const t=displayTime;
  let focus,eye;
  if(kind==='jelly'){
    if(reel){
      const transition=smooth(.15,.92,t),end=smooth(reel.seconds-2.35,reel.seconds,t);
      const offset=reel.mode==='offset',multi=reel.mode==='multi';
      const shot=engine.balls[0];
      const x=offset?-.34+clamp(shot?.p.x||0,-4.60,0)*.31*smooth(.48,1.55,t):0;
      let high=0;
      for(const b of engine.balls)high=Math.max(high,b.p.y+b.r);
      const follow=smooth(3.72,5.55,high)*.76;
      const closing=multi?smooth(3.05,3.61,t)*(1-smooth(4.75,5.7,t)):0;
      focus=v3(x,mix(1.87,.94,transition)+end*.24+follow,-closing*.24);
      eye=v3(mix(4.2,offset?3.25:2.96,transition)+end*.92-closing*.76,mix(5.7,4.4,transition)+end*.7+follow*.79,mix(13.75,offset?11.32:multi?11.1:10.58,transition)+end*2.5+follow*.86);
    }else{
      const shotY=engine.active?Math.max(2.9,...engine.balls.map(b=>b.p.y)):engine.preview.position.y;
      const x=engine.dropTarget().x*.27;
      focus=v3(x,mix(1.52,2.46,smooth(4.85,6.6,shotY)),0);
      eye=v3(5.05+x,6.36,15.0);
    }
  }else if(reel){
    const entry=(1-smooth(1.15,2.06,t));
    const layers=smooth(1.13,2.35,t)*(1-smooth(3.62,5.04,t));
    const breaker=smooth(5.26,7.3,t)*(1-smooth(10.65,12.55,t));
    const wall=smooth(9.52,11.38,t)*(1-smooth(14.02,16.54,t));
    const crestX=clamp(engine.crestX+.47,-1.32,1.32)*breaker*(1-wall);
    const crestY=clamp(engine.crestY-1.56,0,2.10)*breaker;
    focus=v3(-.47-1.02*entry-.15*breaker+2.09*wall+crestX*.67,1.55+.12*entry-.33*layers+.13*breaker-.13*wall+crestY*.19,0);
    eye=focus.clone().add(v3(5.5-1.53*entry-1.90*layers-.28*breaker+.24*wall,
      4.62-.36*entry-1.95*layers-1.07*breaker-1.2*wall,
      14.82-2.8*entry-1.58*layers-1.04*breaker-2.55*wall));
  }else{focus=v3(0,1.47,0);eye=v3(6.95,7.3,16.7);}
  const d=eye.sub(focus);
  const r=d.length(),az=Math.atan2(d.x,d.z)+orbit.az,el=clamp(Math.asin(d.y/r)+orbit.el,-.035,1.34);
  const aspectComp=Math.max(1,1.58/camera.aspect);
  d.set(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(r*orbit.zoom*aspectComp);
  camera.position.copy(focus).add(d);camera.lookAt(focus);
}
function render(){
  const w=Math.max(1,stageEl.clientWidth),h=Math.max(1,stageEl.clientHeight);
  if(w!==measuredW||h!==measuredH){
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();measuredW=w;measuredH=h;
  }
  engine.prepare();cameraPose();renderer.render(engine.scene,camera);
}
const timeCurves={
  center:[[0,0],[.26,.25],[1.23,.72],[2.05,1.12],[3.0,2.12],[6.3,6.0]],
  offset:[[0,0],[.22,.23],[1.25,.68],[2.0,1.19],[3.6,2.81],[6.4,6.1]],
  multi:[[0,0],[.56,.42],[1.43,1.1],[2.20,1.70],[2.72,2.17],[3.40,2.52],[4.43,2.94],[5.76,4.29],[7.35,7.6],[8.8,11.0]],
};
function simulationTime(t){
  if(!reel)return t;
  if(kind==='tank'){
    const q=timeCurves.tank||[[0,0],[.40,.40],[1.32,1.04],[4.65,4.18],[9.35,8.30],[12.5,10.30],[15.5,13.3],[19.5,18.5]];
    return warp(q,t);
  }
  return warp(timeCurves[reel.mode],t);
}
function warp(curve,t){
  for(let i=1;i<curve.length;i++)if(t<=curve[i][0]){
    const [a,x]=curve[i-1],[b,y]=curve[i];return mix(x,y,(t-a)/(b-a));
  }
  return curve.at(-1)[1];
}
function waterDirection(t){
  const e=engine;
  if(!reel)return;
  if(t>=2.48&&t<12.05){
    if(!e.wave)e.toggleWave(true);
    e.params.amplitude=mix(.16,.99,smooth(3.45,7.65,t));
    e.params.frequency=mix(.48,.43,smooth(5.1,8.5,t));e.drag=.085;
  }else if(t>=12.05){
    if(e.wave)e.toggleWave(false);
    e.drag=mix(.22,.98,smooth(12.05,15.8,t));
  }
}
async function advance(target){
  // Display and export use the same fixed step counts, independent of presentation fps.
  const dt=kind==='jelly'?1/120:1/60;
  const n=Math.floor(target/dt+1e-7);
  if(kind==='jelly'){
    for(;stepNumber<n;stepNumber++)engine.step(dt);
  }else if(!engine.active)stepNumber=n;
  else for(;stepNumber<n;stepNumber++){
    waterDirection(stepNumber*dt);
    engine.advance(dt);
    await engine.sync();
  }
}
async function tick(ts){
  requestAnimationFrame(tick);
  if(exporting||switching||busy)return;
  const delta=clamp((ts-clock)/1000,0,.066);clock=ts;
  if(paused||(!engine.active&&!reel))return;
  if(reel&&displayTime>=reel.seconds)return;
  busy=true;
  try{
    displayTime=reel?Math.min(reel.seconds,displayTime+delta*(slow?.35:1)):displayTime+delta*(slow?.35:1);
    sceneTime=simulationTime(displayTime);
    await advance(sceneTime);
    if(!switching&&!exporting){render();updateUIState();}
  }catch(e){console.error(e);paused=true;updateUIState();}
  finally{busy=false;}
}
window.videoExport={
  runs:demos.map(d=>d.id),
  async begin(runId,{fps=30}={}){
    const run=demos.find(d=>d.id===runId);
    if(!run)throw new Error('未知的演示 '+runId);
    if(!Number.isInteger(fps)||fps<=0)throw new Error('帧率必须为正整数。');
    exporting=true;audio.silent=true;document.body.classList.add('export');
    if(!await loadScene(run.kind,run)){
      this.end();
      throw new Error(waterError||'演示载入失败。');
    }
    this.fps=fps;
    return {frames:Math.ceil(run.seconds*fps)};
  },
  async frame(i){
    if(!exporting||!reel)throw new Error('请先调用 begin。');
    if(!Number.isInteger(i)||i<0||i>=Math.ceil(reel.seconds*this.fps))throw new Error('帧序号越界。');
    displayTime=i/this.fps;sceneTime=simulationTime(displayTime);
    await advance(sceneTime);
    render();
    renderer.getContext().finish();
  },
  end(){
    exporting=false;audio.silent=false;paused=true;stopReel();clock=performance.now();
    document.body.classList.remove('export');render();updateUIState();
  }
};
new ResizeObserver(()=>{if(!switching&&!busy&&!exporting)render();}).observe(stageEl);
ui();render();requestAnimationFrame(tick);


