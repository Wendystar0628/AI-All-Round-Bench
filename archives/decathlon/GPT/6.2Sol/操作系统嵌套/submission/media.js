import {btn,ico,esc,select,on,set,get,stamp,num} from './ui.js';
import {SCENE,FLIGHT} from './fixtures.js';
import {readFile,writeFile,rule,spawn,endProc,enqueue,byId,effective,fileName,reserveMemory} from './runtime.js';
import {clone,bytes} from './vm.js';
import {region,rect,colName,bookTitle} from './sheet.js';
import {sample,evolve,takeFlight,flightRow,phase,clamp,contact,validateScene,cameraOrbit} from './flight.js';
import {paint,point} from './graphics.js';
function assetFingerprint(text){
 let hash=2166136261;
 for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 return 'scene-'+text.length+'-'+(hash>>>0).toString(36);
}
const frameID=(d,w)=>w.id+':'+String(d.asset?.assetId??'')+'-'+(++d.frameSerial);
export function loadScene(s,w,path=SCENE){
 const content=readFile(s,path),raw=JSON.parse(content);
 const src=raw?.scene??raw;
 const record=raw?.scene?raw.record:src?.record;
 validateScene(src,record);
 const id=assetFingerprint(content);
 const declared=Number(raw.duration??src.duration);
 const duration=Number.isFinite(declared)&&declared>0?Math.max(.033,declared):record?.frames?.at(-1)?.[0]||15;
 const estimate=a=>a?(a.parts.length+(a.decor?.length??0)+(a.obstacles?.length??0))*18100+(a.terrain?.grass??0)*100+(a.terrainProps?.pines??0)*1800+600000+bytes(a):0;
 reserveMemory(s,estimate(src)-estimate(w.data.asset)+(raw.scene?bytes(raw.record):0));
 Object.assign(w.data,{path,asset:{...src,assetId:id},assetBytes:content.length*2,record,isDefault:src.camera?.mode==='cinema',duration,playbackDuration:duration,
    fps:clamp(+src.fps||30,1,120),position:0,wanted:0,last:s.time,rate:1,loop:false,playing:false,mode:'record',camera:{mode:'cinema',angle:.82,tilt:.29,distance:13},
    frameSerial:w.data.frameSerial??0,epoch:(w.data.epoch??0)+1,airSample:null,fxSample:null,effectsFrozen:false,selection:'',frame:sample(src,0,record),flight:null,log:null,controllerPath:FLIGHT});
}
export function playerSetup(s,w,path){
 loadScene(s,w,path);
 w.data.timeline=spawn(s,'/System/timeline.str',{},w.id).pid;
 w.data.airframe=spawn(s,'/System/airframe.str',{},w.id).pid;
 w.data.effects=spawn(s,'/System/effects.str',{},w.id).pid;
}
function currentPacket(s,w,api,change=true){
 const d=w.data;
 const frame={...d.frame,fxIntensity:d.fxIntensity??1};
 if(d.effectsFrozen&&d.effectsFrame){
   const {t,fault,impact,x,y,z}=d.effectsFrame;
   Object.assign(frame,{fxTime:t,fxFault:fault,fxImpact:impact,fxX:x,fxY:y,fxZ:z});
 }
 const packet={resource:d.asset,frame,camera:clone(d.camera),isDefault:d.isDefault,revision:frameID(d,w),state:d.playing?'playing':d.position===d.duration?'ended':d.position===0?'ready':'paused',
   position:d.position,duration:d.duration,fps:d.fps,rate:d.rate,loop:d.loop,path:d.path,selection:d.selection,mode:d.mode,wind:d.flight?.wind??0,
   heading:(d.flight?.heading??0)*180/Math.PI,target:d.flight?.target??4,controllerPath:d.controllerPath,controller:d.controller,
   goalDistance:d.flight?Math.hypot((d.flight.goalX??0)-frame.x,d.flight.goalZ-frame.z):0,
   horizontalSpeed:d.flight?Math.hypot(d.flight.vx,d.flight.vz):0,
   title:d.asset.title,controllerState:s.procs[d.controller]?.state??'未启动',sensorTime:d.flight?.t??0,lag:d.mode==='flight'?Math.max(0,d.wanted-d.position):0};
 api.submit(s,w,packet,change);
}
export function initialPlayer(s,w,api){currentPacket(s,w,api);}
function post(s,pid,message,coalesce=false){
 const proc=s.procs[pid];if(!proc||proc.state==='ended'||proc.state==='error')return false;
 if(coalesce&&(proc.inbox.length>1||proc.state==='suspended'))return false;
 return enqueue(s,pid,message).ok;
}
export function playerClock(s,w){
 const d=w.data;
 if(d.playing)post(s,d.timeline,{verb:'tick',time:s.time,epoch:d.epoch},true);
}
function applyFlightInput(f,name,value){
 if(name==='fault'){if(f.fault==null)f.fault=f.t;}
 else if(name==='target'){f.goalX=value[0];f.goalZ=value[2];f.heading=Math.atan2(value[0]-f.x,value[2]-f.z);}
 else if(name==='landing'){f.goalX=value[0];f.goalZ=value[2];f.target=value[1];}
 else f[name==='altitude'?'target':name]=value;
}
function finishPhysics(s,w,message,api){
 const d=w.data,f=d.flight;
 if(!f)return;
 d.airSample={frame:{...f},at:message.clock??message.time};d.duration=Math.max(d.duration,f.t);
 d.log.impact=f.impact;d.log.fault=f.fault;
 if(f.impact!=null&&f.t>f.impact+4||f.t>=180)d.playing=false;
 present(s,w,api);
}
export function physicsDevice(s,w,p,kind,value,api){
 const d=w.data,f=d.flight;
 if(p.pid!==d.airframe||d.mode!=='flight'||!f)return null;
 if(value?.epoch!==undefined&&value.epoch!==d.epoch)return null;
 if(kind==='physicsActive')return value?.verb==='sample';
 if(kind==='physicsFloor')return contact(d.asset,value.x,value.z)+1.02;
 if(kind==='physicsEnd'){finishPhysics(s,w,value,api);return true;}
 if(kind==='physicsInput'){
   if(f.t+1/60>Math.min(value.time,d.wanted)+1e-7)return null;
   const frame=clone(f);
   let controls=0,inputs=0;
   for(const entry of d.controlTimeline??[]){
     if(entry.t>f.t+1e-8)break;
     controls++;frame.control=entry.control;
   }
   for(const item of d.inputTimeline??[]){
     if(item.t>f.t+1e-8)break;
     inputs++;applyFlightInput(frame,item.name,item.value);
   }
   return {epoch:d.epoch,base:f.t,frame,controls,inputs};
 }
 if(kind==='physicsCommit'&&value.base===f.t&&value.frame.t>f.t){
   d.controlTimeline?.splice(0,value.controls);d.inputTimeline?.splice(0,value.inputs);
   d.flight=value.frame;d.log.frames.push(flightRow(value.frame));
   return true;
 }
 return null;
}
export function playerProcess(s,w,p,kind,message,api){
 const d=w.data,v=message?.value,verb=message?.verb;
 if(message?.epoch!==undefined&&message.epoch!==d.epoch)return false;
 if(kind==='timeline'){
   if(verb==='tick'&&d.playing){
     const elapsed=Math.max(0,message.time-d.last);d.last=message.time;
     d.wanted+=elapsed*d.rate;
     if(d.mode!=='flight'){
       if(d.loop)d.wanted%=d.duration;
       else if(d.wanted>=d.duration){d.wanted=d.duration;d.playing=false;}
     }
     post(s,d.airframe,{verb:'sample',time:d.wanted,clock:message.time},true);
     post(s,d.effects,{verb:'fx',time:d.wanted,clock:message.time},true);
   }
   return true;
 }
 if(kind==='airframe'){
   if(verb!=='sample')return;
   if(d.mode==='flight'){
     const f=d.flight,target=Math.min(message.time,d.wanted);
     let n=0;
     while(f.t+1/60<=target+1e-7&&n++<6){
       while(d.controlTimeline?.length&&d.controlTimeline[0].t<=f.t+1e-8)f.control=d.controlTimeline.shift().control;
       while(d.inputTimeline?.length&&d.inputTimeline[0].t<=f.t+1e-8){
         const {name,value}=d.inputTimeline.shift();
         applyFlightInput(f,name,value);
       }
       if(p.source.includes('function integrate(')&&f.impact==null){
         f.t+=1/60;
         Object.assign(f,rule(s,p.pid,'integrate',[f,1/60],f));
         Object.assign(f,rule(s,p.pid,'settle',[f,contact(d.asset,f.x,f.z)+1.02],f));
       }else evolve(d.asset,f,1/60);
       d.log.frames.push(flightRow(f));
     }
     if(f.t+1/60<target&&d.playing)post(s,d.airframe,message,true);
     finishPhysics(s,w,message,api);return true;
   }
   d.airSample={frame:sample(d.asset,message.time,d.record),at:message.clock??message.time};
   present(s,w,api);
   return true;
 }
 if(kind==='effects'){
   d.fxIntensity=clamp(+rule(s,p.pid,'intensity',[1],1),0,2);
   d.fxSample={at:message.clock??message.time};
   present(s,w,api);
   return true;
 }
 return playerCommand(s,w,verb,v,api);
}
function present(s,w,api){
 const d=w.data,air=d.airSample;
 if(!air)return;
 const effectState=s.procs[d.effects]?.state;
 d.effectsFrozen=['suspended','ended','error'].includes(effectState);
 if(!d.effectsFrozen&&(!d.fxSample||d.fxSample.at+1e-7<air.at))return;
 d.frame=air.frame;d.position=air.frame.t;d.airSample=null;
 if(!d.effectsFrozen)d.effectsFrame={...d.frame};
 currentPacket(s,w,api,false);
}
export function playerCommand(s,w,verb,v,api){
 const d=w.data;
 if(d.mode==='flight'&&(verb==='seek'||verb==='step'))return false;
 if(['pause','seek','step','stop','rehearse'].includes(verb)){d.epoch=(d.epoch??0)+1;d.airSample=null;d.fxSample=null;}
 switch(verb){
  case 'open':{
    const previous=d.controller;
    loadScene(s,w,v);
    if(previous)endProc(s,s.procs[previous]);
    d.controller=null;d.controlTimeline=[];d.inputTimeline=[];
    api.notify(s,'已载入 '+fileName(v));break;
  }
  case 'play':if(d.mode!=='flight'&&d.position>=d.duration){d.position=d.wanted=0;d.frame=sample(d.asset,0,d.record);}d.playing=true;d.last=s.time;break;
  case 'pause':d.playing=false;d.wanted=d.mode==='flight'?Math.max(d.position,d.flight.t):d.position;for(const pid of [d.timeline,d.airframe,d.effects])if(s.procs[pid])s.procs[pid].inbox=[];break;
  case 'stop':if(d.controller)endProc(s,s.procs[d.controller]);d.mode='record';d.playing=false;d.duration=d.playbackDuration;d.wanted=d.position=0;d.frame=sample(d.asset,0,d.record);d.last=s.time;break;
  case 'seek':
  case 'step':{
    if(d.mode==='flight')return;
    const here=verb==='step'?d.position+1/d.fps:clamp(+v||0,0,d.duration);
    d.wanted=d.position=Math.min(d.duration,here);d.last=s.time;
    for(const pid of [d.timeline,d.airframe,d.effects])if(s.procs[pid])s.procs[pid].inbox=[];
    d.frame=sample(d.asset,d.position,d.record);break;
  }
  case 'rate':d.rate=clamp(+rule(s,w.pid,'rate',[+v],+v)||1,.125,8);d.last=s.time;break;
  case 'loop':d.loop=!!v;break;
  case 'camera':d.camera.mode=v;if(v==='follow')delete d.camera.offset;break;
  case 'orbit':Object.assign(d.camera,v,{mode:'orbit'});break;
  case 'select':if(v){d.selection=v.name+(v.aircraft?(d.frame.damaged?' · 受损':' · 正常'):'');if(v.ground&&d.mode==='flight')recordInput(s,d,'target',v.point);}else d.selection='';break;
  case 'rehearse':{
    const next=spawn(s,d.controllerPath??FLIGHT,{flightWindow:w.id},w.id);
    if(d.controller)endProc(s,s.procs[d.controller]);
    const startPosition=d.position;
    if(d.isDefault&&d.camera.mode==='cinema'){
      const {angle,tilt,distance}=cameraOrbit(d.asset,d.frame,d.camera,true);
      d.camera={mode:'follow',offset:angle+d.frame.yaw,angle,tilt,distance};
    }
    d.mode='flight';d.wanted=d.position=0;d.duration=0;d.playing=true;d.last=s.time;
    d.flight=takeFlight(d.frame,s.time);
    const initial=d.record?.initial;
    if(initial){
      for(const key of ['wind','heading','goalX','goalZ','target'])if(Number.isFinite(initial[key]))d.flight[key]=initial[key];
      if(initial.control)d.flight.control=clone(initial.control);
    }
   if(d.record?.frames?.length>1&&startPosition>0&&!Number.isFinite(d.frame.vy)){
     const prev=sample(d.asset,Math.max(0,startPosition-.03),d.record), dt=Math.max(.001,startPosition-prev.t);
     for(const key of ['x','y','z','roll','pitch'])d.flight['v'+key]=(d.frame[key]-prev[key])/dt;
   }
    if(d.frame.fault!=null&&startPosition>=d.frame.fault)d.flight.fault=d.frame.fault-startPosition;
   if(d.frame.damaged){d.flight.impact=(d.frame.impact??startPosition)-startPosition;d.flight.damaged=true;}
   for(const entry of d.record?.inputs??[])if(entry.t<=startPosition){
     if(entry.name==='wind'||entry.name==='heading')d.flight[entry.name]=entry.value;
     if(entry.name==='altitude')d.flight.target=entry.value;
     if(entry.name==='target'||entry.name==='landing'){
       d.flight.goalX=entry.value[0];d.flight.goalZ=entry.value[2];
       if(entry.name==='landing')d.flight.target=entry.value[1];
     }
   }
   const latest=(d.record?.controls??[]).findLast(c=>c.t<=startPosition);
   if(latest)d.flight.control={lift:latest.lift,pitch:latest.pitch,roll:latest.roll,yaw:latest.yaw};
   d.controlTimeline=[];d.inputTimeline=[];
   d.log={frames:[flightRow(d.flight)],inputs:[],controls:[],impact:d.flight.impact,fault:d.flight.fault,initial:clone(d.flight)};
    d.frame={...d.flight};d.controller=next.pid;
    break;
  }
  case 'wind':if(d.flight)recordInput(s,d,'wind',+v);break;
  case 'heading':if(d.flight)recordInput(s,d,'heading',+v*Math.PI/180);break;
  case 'target':if(d.flight)recordInput(s,d,'altitude',+v);break;
  case 'fault':if(d.flight&&d.flight.fault==null)recordInput(s,d,'fault',true);break;
  case 'pad':{
    if(!d.flight)break;
    const pad=d.asset.pads?.[1];
    if(!pad)throw Error('场景未定义第二停机坪');
    recordInput(s,d,'target',[pad.x,0,pad.z]);break;
  }
  case 'land':{
    if(!d.flight)break;
    const f=d.flight,x=f.goalX??0,z=f.goalZ;
    if(Math.hypot(x-f.x,z-f.z)>3||Math.hypot(f.vx,f.vz)>2.5)throw Error('请先飞至目标上方并减速，再开始降落');
    recordInput(s,d,'landing',[x,contact(d.asset,x,z)+1.02,z]);break;
  }
  case 'controller':{
    if(d.mode==='flight'){
      const next=spawn(s,v,{flightWindow:w.id},w.id);
      if(d.controller)endProc(s,s.procs[d.controller]);
      d.controller=next.pid;
    }
    d.controllerPath=v;break;
  }
  case 'save':{
    if(!d.log||!d.flight)throw Error('尚无排演记录');
    const path=v.startsWith('/')?v:'/Documents/'+v;
    const scene=clone(d.asset);delete scene.assetId;
    writeFile(s,path,JSON.stringify({version:1,scene,duration:d.flight.t,record:d.log}));api.notify(s,'已保存排演 · '+fileName(path));api.refreshFiles(s);break;
  }
 }
 currentPacket(s,w,api,false);return true;
}
const controlTime=(s,d)=>Math.max(d.flight.t,d.wanted+(d.playing?Math.max(0,s.time-d.last)*d.rate:0));
function recordInput(s,d,name,v){
  const row={t:controlTime(s,d),name,value:v};
  d.log?.inputs.push(row);d.inputTimeline??=[];d.inputTimeline.push(row);
}
export function flightCall(s,p,op,value){
 const w=s.wins[p.winId??p.vars.flightWindow],d=w?.data,f=d?.flight;
 if(!f||d.mode!=='flight'||d.controller!==p.pid||!d.playing||f.impact!=null)return null;
 if(op==='sensor'){
  const {t,x,y,z,roll,pitch,yaw,vx,vy,vz,vroll,vpitch,wind,heading,goalX,goalZ,target,power}=f;
  return {t,time:s.time,x,y,z,roll,pitch,yaw,vx,vy,vz,vroll,vpitch,wind,heading,goalX,goalZ,target,power};
 }
 const n=(x,a,b)=>clamp(Number.isFinite(+x)?+x:0,a,b);
 if(!value||typeof value!=='object')return false;
 const control={lift:n(value.lift,0,2.5),roll:n(value.roll,-8,8),pitch:n(value.pitch,-8,8),yaw:n(value.yaw,-12,12)};
 const t=controlTime(s,d);d.controlTimeline??=[];d.controlTimeline.push({t,control});
 d.log.controls.push({t,time:s.time,...control});return true;
}
const timeStr=t=>String(Math.floor(t/60)).padStart(2,'0')+':'+(t%60).toFixed(2).padStart(5,'0');
export function mountPlayer(s,w,e,api,source=w){
 const acted=(cmd,v)=>api.mediaInput(s,w,cmd,v);
 const p=()=>api.packet(w);
 const action=(label,id,icon)=>btn(label,id,{icon,only:true,cls:'icon-button'});
 e.innerHTML='<div class="player-app app-column"><div class="player-top"><div><span class="eyebrow">STRATA / FLIGHT LAB</span><b class="player-title"></b></div><div>'+btn('打开场景','player-open',{icon:'files'})+select('player-camera',[['cinema','演出镜头'],['follow','跟随镜头'],['orbit','自由环绕']],'cinema',{title:'镜头'})+(w===source?btn('投送窗口','window-project',{icon:'projection'}):'')+'</div></div>'+
 '<div class="viewport"><canvas data-testid="player-view" aria-label="三维直升机场景"></canvas><div class="viewport-mark"><span></span> <b>高地观测站</b><small>FLIGHT TEST / 24</small></div><div class="telemetry"><span class="phase"></span><label>ALT <b class="alt"></b></label><label>HDG <b class="heading"></b></label></div><div class="view-paused" hidden></div><div class="view-corners"></div></div>'+
 '<div class="transport"><div class="scrub"><input type="range" min="0" max="15" value="0" step=".01" data-testid="player-seek" aria-label="播放进度"></div><div class="transport-row">'+
 action('播放','player-play','play')+action('暂停','player-pause','pause')+action('停止','player-stop','stop')+action('前进一帧','player-step','next')+'<span class="play-time"><input data-testid="player-time" aria-label="当前时间（秒）" value="0.00"><span class="duration">/ 00:15.00</span></span>'+
 select('player-rate',[['0.25','0.25×'],['0.5','0.5×'],['1','1×'],['1.5','1.5×'],['2','2×'],['4','4×']],'1',{title:'播放速率'})+'<label class="loop-label"><input type="checkbox" data-testid="player-loop" aria-label="循环播放">循环</label><span class="player-selection" data-testid="player-selection"></span></div></div>'+
 '<div class="rehearsal"><div class="rehearsal-main">'+btn('进入飞行排演','rehearsal-start',{icon:'terminal'})+btn('保存记录','rehearsal-save')+btn('飞控程序','rehearsal-controller')+'<span class="flight-status"></span></div><div class="rehearsal-controls" hidden><label>风 <input type="number" min="-20" max="20" step=".2" value="0" data-testid="rehearsal-wind" aria-label="风速"></label><label>航向 <input type="number" min="-360" max="360" value="0" data-testid="rehearsal-heading" aria-label="目标航向"></label><label>高度 <input type="number" min="0" max="30" step=".5" value="4" data-testid="rehearsal-target" aria-label="目标高度"></label>'+btn('飞往 02','rehearsal-pad')+btn('在目标降落','rehearsal-land')+btn('触发旋翼故障','rehearsal-fault')+'</div></div></div>';
 stamp(e,s.id,w.id);
 const canvas=get(e,'player-view'), seek=get(e,'player-seek'),time=get(e,'player-time');
 for(const [id,cmd] of [['player-play','play'],['player-pause','pause'],['player-stop','stop'],['player-step','step'],['rehearsal-start','rehearse'],['rehearsal-fault','fault'],['rehearsal-pad','pad'],['rehearsal-land','land']])on(e,id,()=>acted(cmd));
 const sourceSystem=()=>byId(w.sourceSystemId??w.systemId);
 on(e,'player-open',()=>api.pick(sourceSystem(),'打开场景',p=>/\.(scene|flight)$/.test(p),path=>acted('open',path),s));
 on(e,'rehearsal-controller',()=>api.pick(sourceSystem(),'选择飞控程序',p=>p.endsWith('.str'),path=>acted('controller',path),s));
 on(e,'rehearsal-save',async()=>{const name=await api.ask(s,'保存排演记录','文件名称','排演-24.flight');if(name)acted('save',name.endsWith('.flight')?name:name+'.flight');});
 on(e,'window-project',ev=>api.projectMenu(s,w,ev));
 set(e,'player-camera',v=>acted('camera',v));set(e,'player-rate',v=>acted('rate',v));set(e,'player-seek',v=>acted('seek',+v));
 let scrubbing=false;
 seek.onpointerdown=()=>scrubbing=true;
 seek.onpointerup=()=>scrubbing=false;
 seek.onpointercancel=()=>scrubbing=false;
 on(e,'player-loop',ev=>acted('loop',ev.target.checked),'change');
 time.onchange=()=>acted('seek',+time.value);time.onkeydown=ev=>{if(ev.key==='Enter')time.blur();};
 for(const name of ['wind','heading','target'])set(e,'rehearsal-'+name,v=>acted(name,+v));
 let orbit=null;
 canvas.onpointerdown=ev=>{if(!p()||effective(sourceSystem())!=='running')return;canvas.setPointerCapture(ev.pointerId);orbit={x:ev.clientX,y:ev.clientY,c:p().camera,moved:false};};
 canvas.onpointermove=ev=>{
   if(!orbit)return;const dx=ev.clientX-orbit.x,dy=ev.clientY-orbit.y;
   if(Math.hypot(dx,dy)>4){
     orbit.moved=true;
     orbit.next={angle:(orbit.c.angle??.82)-dx*.012,tilt:clamp((orbit.c.tilt??.29)+dy*.006,-.03,1),distance:orbit.c.distance};
     if(!orbit.sent||performance.now()-orbit.sent>65){orbit.sent=performance.now();acted('orbit',orbit.next);}
   }
 };
 canvas.onpointerup=ev=>{if(!orbit)return;if(orbit.moved)acted('orbit',orbit.next);else acted('select',point(canvas,p(),ev.clientX,ev.clientY));orbit=null;};
 canvas.onpointercancel=()=>orbit=null;
 canvas.onwheel=ev=>{if(!p())return;ev.preventDefault();const cfg=p().camera;acted('orbit',{...cfg,distance:clamp((cfg.distance??13)*Math.exp(ev.deltaY*.001),5,38)});};
 let prev='',st='';
 e.refresh=()=>{
   const packet=p();if(!packet)return;
   const paused=effective(sourceSystem())!=='running';
   if(st!==String(paused)+packet.mode){
     st=String(paused)+packet.mode;for(const n of e.querySelectorAll('button,input,select'))n.disabled=paused;
     get(e,'rehearsal-save').disabled=paused||packet.mode!=='flight';get(e,'rehearsal-fault').disabled=paused||packet.mode!=='flight';
     seek.disabled=paused||packet.mode==='flight';time.disabled=seek.disabled;
     e.querySelector('.rehearsal-controls').hidden=packet.mode!=='flight';
   }
   const overlay=e.querySelector('.view-paused');overlay.hidden=!paused;if(paused)overlay.textContent='源系统 '+sourceSystem().id+' · '+(effective(sourceSystem())==='paused'?'已暂停':'不可用');
   if(packet.revision!==prev){
     prev=packet.revision;
     const text=(sel,v)=>e.querySelector(sel).textContent=v;
     text('.player-title',packet.title??fileName(packet.path));
     text('.phase',packet.mode==='flight'?(packet.frame.damaged?'接地 / 受损':'排演 / 实时'):phase(packet.position,packet.frame.fault??Infinity,packet.frame.impact??Infinity));
     text('.alt',num(packet.frame.y,1)+' m');text('.heading',num(((packet.frame.yaw*180/Math.PI)%360+360)%360)+'°');
     text('.duration','/ '+timeStr(packet.duration));text('.player-selection',packet.selection||'单击部件查看状态');
     for(const key of ['wind','heading','target']){const input=get(e,'rehearsal-'+key);if(document.activeElement!==input)input.value=Number(packet[key].toFixed(2));}
     text('.flight-status',packet.mode==='flight'?'飞控 '+packet.controller+' · 距目标 '+num(packet.goalDistance,1)+' m · '+num(packet.horizontalSpeed,1)+' m/s'+(packet.lag>.1?' · '+num(packet.lag,2)+' s 待算':''):packet.fps+' FPS · '+({playing:'播放中',paused:'已暂停',ended:'已结束',ready:'就绪'})[packet.state]);
     if(!scrubbing){seek.max=packet.duration;seek.value=packet.position;}
     if(document.activeElement!==time)time.value=num(packet.position,2);
     get(e,'player-rate').value=packet.rate;get(e,'player-camera').value=packet.camera.mode;get(e,'player-loop').checked=packet.loop;
   }
   try{paint(canvas,packet);}catch(err){if(!e.dataset.renderError){e.dataset.renderError='1';api.notify(s,'场景绘制失败 · '+err.message,'error');}}
 };
 e.refresh();
}
const colors=['#087e78','#cf764b','#7b64bc','#448fc3','#a37c11','#bd617e'];
const CHART_PAGE=32;
const maxPage=rows=>Math.max(0,Math.ceil((rows?.length??0)/CHART_PAGE)-1);
export function chartSetup(s,w){
 Object.assign(w.data,{source:'',sourceTitle:'',range:'A1:D4',label:'A',series:'D',chartType:'bar',connectionState:'未连接',version:0,rows:[],link:null,serial:0});
 w.data.receiver=spawn(s,'/System/data.str',{peer:w.pid},w.id).pid;
}
const pausedUpdates=new Map();
let pendingUpdateBytes=0;
export const chartBacklogMemory=()=>pendingUpdateBytes;
export function clearChartUpdates(w){
 const list=pausedUpdates.get(w);
 if(list)pendingUpdateBytes-=list.reduce((n,entry)=>n+entry.size,0);
 pausedUpdates.delete(w);
}
export function clearAllChartUpdates(){pausedUpdates.clear();pendingUpdateBytes=0;}
function chartRows(d,time){
 const a=d.transition;
 if(!a)return d.rows;
 const T=clamp((time-a.start)/a.duration,0,1);
 if(T===1)return d.rows;
 const t=T*T*(3-2*T);
 return d.rows.map((row,i)=>row.map((x,k)=>{
   const base=a.from[i]?.[k]??0;
   return Math.round((base+(x-base)*t)*100)/100;
 }));
}
function chartSubmit(s,w,api){
 const d=w.data;
 const packet=clone({title:d.sourceTitle,range:d.range,label:d.label,series:d.series,chartType:d.chartType,connectionState:d.connectionState,
   version:d.version,dataRange:d.dataRange,rows:chartRows(d,s.time),labels:d.labels,keys:d.keys,source:d.source,selected:d.selected,page:d.page??0,revision:w.id+'-chart-'+(++d.serial)});
 api.submit(s,w,packet,false);
}
export function initialChart(s,w,api){chartSubmit(s,w,api);}
export function chartInput(s,w,verb,v,api){
 const d=w.data;
 if(verb==='type')d.chartType=rule(s,w.pid,'type',[v],v);
 if(verb==='config')Object.assign(d,v);
 if(verb==='disconnect'){clearChartUpdates(w);d.link=null;d.connectionState='已断开';}
 if(verb==='sourceClosed'){if(d.link?.identity!==v)return;d.link=null;d.connectionState='数据源已关闭';}
 if(verb==='select')d.selected=v;
 if(verb==='page'){d.page=clamp((d.page??0)+v,0,maxPage(d.rows));d.selected=null;}
 if(verb==='connect'){
   const b=api.books().find(x=>x.identity===v.source);
   if(!b){if(!d.link)d.connectionState='请先打开根桌面工作簿';chartSubmit(s,w,api);return;}
   const receiver=s.procs[d.receiver];
   if(!receiver||['ended','error'].includes(receiver.state))d.receiver=spawn(s,'/System/data.str',{peer:w.pid},w.id).pid;
   const r=rect(v.range),allowed=Array.from({length:r.w},(_,i)=>colName(r.x+i)),fields=v.series.split(/[,，\s]+/);
   if(!allowed.includes(v.label)||!fields.every(x=>allowed.includes(x)))throw Error('标签列与数值列必须位于所选区域内');
   clearChartUpdates(w);Object.assign(d,v);d.page=0;d.selected=null;
   d.link={identity:b.identity,token:++d.serial,range:d.range,label:d.label,series:d.series};d.sourceTitle=bookTitle(b);d.connectionState='等待数据';d.linkVersion=0;
   chartPublish(s,w,b);
 }
 if(verb==='data'){
   if(d.link&&v.token!==d.link.token)return;
   if(!d.link&&d.connectionState!=='已恢复，待重新连接')return;
   if(d.link&&v.version<=(d.linkVersion??0))return;
   const {matrix,range,label,series}=v;
   const r=rect(range),cols=Array.from({length:r.w},(_,i)=>colName(r.x+i)),labelI=cols.indexOf(label),fields=series.split(/[,，\s]+/).map(x=>cols.indexOf(x)).filter(x=>x>=0);
   if(labelI<0||!fields.length)throw Error('列超出所选区域');
   const hasHeader=matrix.length>1&&fields.some(i=>typeof matrix[0][i]==='string'&&!Number.isFinite(Number(matrix[0][i])));
   const data=matrix.slice(hasHeader?1:0);
   d.transition={start:s.time,duration:.28,from:chartRows(d,s.time)};
   d.keys=fields.map(i=>hasHeader?String(matrix[0][i]||cols[i]):cols[i]);d.labels=data.map((row,i)=>String(row[labelI]||i+1));
   const numeric=x=>Number.isFinite(Number(x))?Number(x):0;
   d.rows=Array.isArray(v.rows)?v.rows.map(row=>row.map(numeric)):data.map(row=>fields.map(i=>numeric(rule(s,w.pid,'value',[row[i]],Number(row[i])))));
   d.page=clamp(d.page??0,0,maxPage(d.rows));
   if(d.selected&&!d.rows[d.selected.i])d.selected=null;
   d.version=v.version;d.dataRange=range;d.linkVersion=v.version;if(d.link)d.connectionState='已连接';
 }
 if(verb==='transition'&&d.transition&&s.time>=d.transition.start+d.transition.duration)d.transition=null;
 chartSubmit(s,w,api);return true;
}
export function chartPublish(s,w,book){
 const d=w.data;if(d.link?.identity!==book.identity)return;
 const {range=d.range,label=d.label,series=d.series,token}=d.link;
 const matrix=region(book,range),r=rect(range),cols=Array.from({length:r.w},(_,i)=>colName(r.x+i));
 const fields=series.split(/[,，\s]+/).map(x=>cols.indexOf(x)).filter(x=>x>=0);
 const header=matrix.length>1&&fields.some(i=>typeof matrix[0][i]==='string'&&!Number.isFinite(Number(matrix[0][i])));
 const packet={verb:'data',value:{matrix,range,label,series,fields,header,token,version:book.version}};
 const size=bytes(packet)+32;reserveMemory(byId('outer'),size);
 const list=pausedUpdates.get(w)??[];list.push({packet,size});pausedUpdates.set(w,list);
 pendingUpdateBytes+=size;
}
export function chartClock(s,w,api){
 const d=w.data,list=pausedUpdates.get(w);
 if(d.link&&['ended','error'].includes(s.procs[d.receiver]?.state)){
   d.link=null;d.connectionState='接收进程未运行';clearChartUpdates(w);chartSubmit(s,w,api);
 }else if(list?.length){
   const {packet,size}=list[0];
   let delivered=false;
   pendingUpdateBytes-=size;
   try{delivered=post(s,d.receiver,packet);}
   catch(err){
     if(d.backlogError!==err.message){d.backlogError=err.message;api.notify(s,'数据接收等待 · '+err.message,'error');}
   }finally{if(!delivered)pendingUpdateBytes+=size;}
   if(delivered)d.backlogError=null;
   if(delivered){list.shift();if(!list.length)pausedUpdates.delete(w);}
 }
 if(d.transition)post(s,w.pid,{verb:'transition'},true);
}
function graph(p){
 const start=(p.page??0)*CHART_PAGE,labels=(p.labels??[]).slice(start,start+CHART_PAGE),rows=(p.rows??[]).slice(start,start+CHART_PAGE),keys=p.keys??[];
 if(!rows.length)return '<div class="chart-empty"><div class="chart-art">'+ico('charts')+'</div><b>等待数据源</b><small>选择根系统的工作簿和区域，然后连接。</small></div>';
 const shown=rows.length,W=700,H=246,l=57,r=15,t=19,b=38;
 let vmax=0,vmin=0;
 for(const row of p.rows)for(const n of row){vmax=Math.max(vmax,n);vmin=Math.min(vmin,n);}
 const raw=(vmax-vmin||1)/4, pow=10**Math.floor(Math.log10(raw)),step=Math.ceil(raw/pow)*pow;
 const hi=Math.ceil(vmax/step)*step||step, low=Math.floor(vmin/step)*step;
 const y=n=>t+(hi-n)/(hi-low)*(H-t-b), dx=(W-l-r)/shown;
 let out='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="数据图表">';
 for(let j=0;j<=12&&low+j*step<=hi+1e-8;j++){
   const value=low+j*step, yy=y(value);
   out+='<path d="M'+l+' '+yy+'H'+(W-r)+'" class="grid-line"/><text x="'+(l-9)+'" y="'+(yy+4)+'" text-anchor="end">'+esc(Number(value.toFixed(4)))+'</text>';
 }
 for(let i=0;i<shown;i++){
   const x=l+(i+.5)*dx;
   if(i%Math.ceil(shown/12)===0)out+='<text x="'+x+'" y="'+(H-13)+'" text-anchor="middle">'+esc(labels[i]?.slice(0,15))+'</text>';
 }
 keys.forEach((key,k)=>{
   const c=colors[k%colors.length],x=i=>l+(i+.5)*dx;
   if(p.chartType==='line')out+='<polyline fill="none" stroke="'+c+'" stroke-width="2.5" stroke-linejoin="round" points="'+rows.slice(0,shown).map((row,i)=>x(i)+','+y(row[k])).join(' ')+'"/>';
   for(let i=0;i<shown;i++){
     const value=rows[i][k],yy=y(value), selected=p.selected?.i===start+i&&p.selected?.k===k, title='<title>'+esc(labels[i]+' · '+key+' · '+value)+'</title>';
     if(p.chartType==='line')out+='<circle data-point="'+(start+i)+':'+k+'" cx="'+x(i)+'" cy="'+yy+'" r="'+(selected?7:5)+'" fill="'+c+'" stroke="white" stroke-width="1.7" tabindex="0">'+title+'</circle>';
     else {const bw=Math.min(54,dx*.62/keys.length);out+='<rect data-point="'+(start+i)+':'+k+'" x="'+(x(i)-bw*keys.length*.5+bw*k)+'" y="'+Math.min(yy,y(0))+'" width="'+Math.max(1,bw-3)+'" height="'+Math.max(2,Math.abs(yy-y(0)))+'" rx="3" fill="'+c+'" opacity="'+(selected?'.63':'1')+'" tabindex="0">'+title+'</rect>';}
   }
 });
 return out+'</svg>';
}
export function mountChart(s,w,e,api,source=w){
 const send=(cmd,value)=>api.mediaInput(s,w,cmd,value), p=()=>api.packet(w);
 e.innerHTML='<div class="chart-app app-column"><div class="chart-top"><div><div class="eyebrow">STRATA / DATA STUDIO</div><h2>图表工作台</h2></div>'+(w===source?btn('投送窗口','window-project',{icon:'projection'}):'')+'</div>'+
 '<div class="chart-config"><label>工作簿<select data-testid="chart-source" aria-label="工作簿"></select></label><label>选区<input data-testid="chart-range" aria-label="选区" value="A1:D4"></label><label>标签列<input data-testid="chart-label-column" aria-label="标签列" value="A"></label><label>数值列<input data-testid="chart-series" aria-label="数值列" value="D"></label>'+btn('连接','chart-connect',{cls:'primary'})+btn('断开','chart-disconnect')+'</div>'+
 '<div class="chart-lab"><div class="chart-heading"><div><strong class="chart-title">工作簿数据</strong><small class="chart-subtitle"></small></div>'+select('chart-type',[['bar','分组柱状图'],['line','折线图']],'bar',{title:'图表类型'})+'</div><div class="chart-plot"></div><div class="chart-legend"></div><div class="chart-pages" hidden>'+btn('上一页','chart-prev',{icon:'back',only:true})+'<span></span>'+btn('下一页','chart-next',{icon:'next',only:true})+'</div></div><footer class="status-line"><span class="chart-state"></span><span class="chart-selected"></span></footer></div>';
 stamp(e,s.id,w.id);
 const sourceSelect=get(e,'chart-source'), range=get(e,'chart-range'),label=get(e,'chart-label-column'),series=get(e,'chart-series');
 const config=()=>({source:sourceSelect.value,range:range.value.toUpperCase().trim(),label:label.value.toUpperCase().trim(),series:series.value.toUpperCase().trim()});
 for(const n of [sourceSelect,range,label,series])n.onchange=()=>send('config',config());
 on(e,'chart-connect',()=>send('connect',config()));on(e,'chart-disconnect',()=>send('disconnect'));on(e,'window-project',ev=>api.projectMenu(s,w,ev));
 set(e,'chart-type',v=>send('type',v));
 on(e,'chart-prev',()=>send('page',-1));on(e,'chart-next',()=>send('page',1));
 let prev='',books='',lastPlot='';
 e.refresh=()=>{
   const d=p();if(!d)return;
   const list=api.books(),bk=list.map(b=>b.identity+bookTitle(b)).join();
   if(books!==bk||!sourceSelect.options.length){books=bk;sourceSelect.innerHTML='<option value="">选择工作簿…</option>'+list.map(b=>'<option value="'+b.identity+'">'+esc(bookTitle(b))+'</option>').join('');sourceSelect.value=d.source||list[0]?.identity||'';}
   const frozen=effective(byId(w.sourceSystemId??w.systemId))!=='running';
   for(const n of e.querySelectorAll('button,input,select'))n.disabled=frozen;
   const pages=e.querySelector('.chart-pages'), page=d.page??0, end=maxPage(d.rows);
   pages.hidden=end===0;pages.querySelector('span').textContent=(page+1)+' / '+(end+1);
   get(e,'chart-prev').disabled=frozen||page===0;get(e,'chart-next').disabled=frozen||page>=end;
   e.querySelector('.chart-state').textContent=frozen?'源系统已暂停':d.connectionState+' · 数据版本 '+d.version;
   if(prev===d.revision)return;prev=d.revision;
   if(d.source&&document.activeElement!==sourceSelect)sourceSelect.value=d.source;
   for(const [n,v] of [[range,d.range],[label,d.label],[series,d.series]])if(document.activeElement!==n)n.value=v;
   get(e,'chart-type').value=d.chartType;
   e.querySelector('.chart-title').textContent=d.title||'工作簿数据';e.querySelector('.chart-subtitle').textContent=(d.dataRange??d.range)+' / '+(d.rows?.length??0)+' 条记录';
   const plot=e.querySelector('.chart-plot'), markup=graph(d);
   if(lastPlot!==markup){
     lastPlot=markup;plot.innerHTML=markup;
     for(const n of plot.querySelectorAll('[data-point]'))n.onclick=()=>{const [i,k]=n.dataset.point.split(':').map(Number);send('select',{i,k});};
   }
   e.querySelector('.chart-legend').innerHTML=(d.keys??[]).map((k,i)=>'<span><i style="background:'+colors[i%colors.length]+'"></i>'+esc(k)+'</span>').join('');
   const x=d.selected;e.querySelector('.chart-selected').textContent=x&&d.rows?.[x.i]?(d.labels[x.i]+' · '+d.keys[x.k]+' · '+d.rows[x.i][x.k]):'';
 };
 e.refresh();
}
