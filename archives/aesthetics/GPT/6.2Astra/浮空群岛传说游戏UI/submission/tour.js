'use strict';
/* Absolute seconds on the voyage clock. Every input is routed through the playable UI. */
const tourLength=90;
const tourCues=[
 [2.15,'start'],[4.65,'continue'],
 [6.72,'term:空行者'],[8.08,'termClose'],[8.68,'nextLine'],[10.87,'nextLine'],[12.71,'nextLine'],[14.72,'nextLine'],
 [17.22,'chapterNext'],[18.38,'diff:0'],[19.73,'diff:2'],[21.18,'quest:1'],[23.85,'depart'],
 [25.04,'roster:3'],[25.97,'recruit:4'],[27.02,'roster:3'],[27.86,'recruit:3'],[29.01,'detail:0'],
 [30.12,'pick:0'],[31.04,'choose:4'],[32.44,'equip'],[33.53,'tab:sigils'],[34.59,'pick:1'],[35.5,'choose:2'],[37.08,'equip'],[38.63,'toParty'],[40.5,'launch'],
 [43.31,'attack'],[44.86,'skill:3'],[46.27,'skill:1'],[48.52,'attack'],[52.47,'skill:0'],[56.23,'attack'],
 [60.25,'cast:0'],[61.47,'cast:1'],[63.19,'cast:2'],[64.91,'cast:3'],[72.47,'skill:2'],[74.04,'attack'],
 [77.53,'@result']
];
const tc=$('#tourCursor');
let tourFPS=60,cueIndex=0,restorePoint=null,lastTourTime=-1,anchor={x:668,y:592},anchorAt=-2,previousHover=null;
function targetFor(action){
 if(action.startsWith('@'))return null;
 const all=$$('[data-action="'+action+'"]',G.modal?overlayEl:deck);
 const relay=all.find(el=>el.classList.contains('relay-unit')&&el.offsetWidth&&!el.disabled);
 if(relay)return relay;
 if(action==='cast:0')return $('.ult-trigger')||all[0];
 return all.find(el=>el.offsetWidth&&!el.classList.contains('modal-scrim'));
}
function cursorPoint(el){
 const p=el.getBoundingClientRect(),r=deck.getBoundingClientRect(),s=r.width/1440;
 return {x:(p.left-r.left+p.width*.59)/s,y:(p.top-r.top+p.height*.56)/s};
}
function clearHover(){if(previousHover){previousHover.classList.remove('tour-hover');previousHover=null;}}
function resetTour(){
 clearPageTurn();clearHover();document.activeElement?.blur?.();Object.assign(G,freshGame(),{diff:1,quest:0});cueIndex=0;lastTourTime=-1;anchor={x:668,y:592};anchorAt=-2;render();tc.style.display='block';
}
function drawCursor(t){
 clearHover();let p={...anchor};const next=tourCues[cueIndex],d=next?next[0]-t:100;
 if(next&&d<.71&&d>=0){const el=targetFor(next[1]);if(el){const dest=cursorPoint(el),u=clamp(1-d/.71),k=u*u*(3-2*u);p={x:p.x+(dest.x-p.x)*k,y:p.y+(dest.y-p.y)*k};if(d<.22){el.classList.add('tour-hover');previousHover=el;}}}
 const pulse=clamp((t-anchorAt)/.37);tc.style.left=p.x+'px';tc.style.top=p.y+'px';tc.firstElementChild.style.transform='scale('+(t-anchorAt<.13?.85:1)+')';tc.lastElementChild.style.transform='scale('+(pulse*.9+.3)+')';tc.lastElementChild.style.opacity=t-anchorAt<.37?1-pulse:0;
 const cinematic=G.screen==='battle'&&battleModel(sceneAge()).inChain;
 tc.style.opacity=cinematic&&d>.72?.32:t-anchorAt>3&&d>1?.5:1;
}
function tourFrame(t){
 if(t<lastTourTime-1e-7)resetTour();
 while(cueIndex<tourCues.length&&tourCues[cueIndex][0]<=t+1e-8){
  const [at,action]=tourCues[cueIndex];tick(at,false);const el=targetFor(action);
  if(el){anchor=cursorPoint(el);anchorAt=at;}
  if(action==='@result')go('result');else handle(action);
  cueIndex++;
 }
 tick(t,false);drawCursor(t);lastTourTime=t;deck.getBoundingClientRect();
}
const decodedPlates=new WeakSet();
let paintedScene=null,paintedEffect=null,paintedModal=null;
async function settleExportFrame(){
 const pending=Array.from(document.images).filter(img=>!decodedPlates.has(img));
 if(pending.length){
  await Promise.all(pending.map(async img=>{await img.decode();decodedPlates.add(img);}));
 }
 if(document.fonts.status==='loading')await document.fonts.ready;
 deck.getBoundingClientRect();
 const scene=screenEl.firstElementChild,effect=$('#battleFX')?.firstElementChild,modal=overlayEl.lastElementChild;
 if(scene!==paintedScene||effect!==paintedEffect||modal!==paintedModal){
  // Allow newly mounted chart plates and composited cut-ins to paint once.
  // Presentation callbacks never advance the export clock.
  if(document.visibilityState==='visible')await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
  paintedScene=scene;paintedEffect=effect;paintedModal=modal;
 }
}
window.videoExport={
 runs:['tour'],
 async begin(runId,{fps=60}={}){
  if(runId!=='tour')throw new RangeError('未知录像片段');
  if(!Number.isFinite(fps)||fps<=0)throw new RangeError('帧率必须为正数');
  if(!exporting)restorePoint=structuredClone(G);
  exporting=true;tourFPS=fps;resetTour();tourFrame(0);
  await settleExportFrame();
  return {frames:Math.round(tourLength*fps)};
 },
 async frame(i){
  if(!exporting)throw new Error('请先调用 begin');
  if(!Number.isInteger(i)||i<0||i>=Math.round(tourLength*tourFPS))throw new RangeError('帧索引越界');
  tourFrame(i/tourFPS);
  await settleExportFrame();
 },
 end(){
  if(!exporting)return;
  paintedScene=paintedEffect=paintedModal=null;
  clearPageTurn();clearHover();tc.style.display='none';exporting=false;Object.assign(G,restorePoint||freshGame());restorePoint=null;lastFrame=performance.now();render();
 }
};
restore();render();requestAnimationFrame(liveLoop);

