'use strict';

const localView=(x,y,z)=>cityPoint(x,y,z);
function islandView(index,x,y,z){const isle=islands[index];return [isle.x+x,isle.y+y,isle.z+z];}
const stops=[
  ['天穹圣城 · 全景','Citadel panorama',[0,-.4,0],0,14.3,153,89,220,PI,5,54],
  ['岛底守望','The stone guardian',localView(-.5,-18.25,8.15),9,-4,66,18,83,1.07,-20,40],
  ['白石城门','The southern gate',localView(0,3.42,22.25),10,14,24.9,9,40,.96,5,59],
  ['下城集市','The fountain market',localView(6.74,3.74,14.97),18,32,16.2,7.3,33,1.10,16,68],
  ['学院回廊','The scholars’ court',localView(-13.31,5.59,3.49),-114,43,22.2,9.1,36,1.10,23,69],
  ['星纹礼庭','The processional stair',localView(0,9.48,7.76),5,19,28.3,12.4,48,.91,8,55],
  ['圣穹主殿','The high basilica',localView(0,21.60,-2.95),22,13,55.5,18,72,PI,7,67],
  ['天仪水晶','The celestial orrery',localView(.13,36.12,-4.31),17,8,8.65,4.8,26,PI,-18,66],
  ['层泉水庭','The cascade gardens',localView(10.88,6.42,.91),78,26,26.0,11.0,50,1.40,12,68],
  ['西风飞艇港','The western aerodrome',[-47.16,5.25,14.68],11,15,32.8,12.1,53,PI,4,65],
  ['鸣钟悬桥','The belfry crossing',islandView(3,-1.53,5.29,1.31),25,16,30.9,10.4,55,PI,6,63],
  ['葡萄园修院','The vineyard cloister',islandView(1,.13,1.72,-.09),28,29,22.7,8.8,46,PI,9,68],
  ['水车源庭','The mill headrace',[-20.0,14.14,-49.28],8,17,19.5,7.8,43,PI,5,65],
  ['云海灯塔','The cloudsea beacon',islandView(5,.22,6.56,-.64),23,13,29.8,9.5,47,PI,3,64],
  ['断桥遗殿','The broken sanctuary',[45.6,-.25,3.11],20,23,22.4,8.2,45,PI,8,66],
  ['六岛环廊','The outer promenade',[1.65,-3.32,35.82],-15,14,45.1,18,86,1.46,5,61],
  ['守护神龛','The guardian niche',localView(0,-8.97,20.30),5,4,21.3,7.5,43,.96,-14,31],
  ['圣殿分水庭','The upper cistern',localView(.64,10.53,-14.12),155,34,23.3,9.6,44,1.43,17,68]
];
const deg=PI/180,vec=a=>V(...a);
const nav=document.getElementById('wayfinder'),panel=document.getElementById('index-panel'),currentButton=document.getElementById('current');
const strip=document.getElementById('stops'),canvas=renderer.domElement;
let currentStop=0,focus=vec(stops[0][2]),az=0,el=0,radius=stops[0][5],wantAz=0,wantEl=0,wantR=radius,travel=null;
let exportMode=false,fpsExport=60,liveTime=0,lastTime=performance.now(),saved=null,initShadows=true;
function fitView(i){return Math.max(1,(i===0?1.68:1.24)/camera.aspect);}
function aim(point,yaw,pitch,dist){
  const r=dist*cos(pitch);camera.position.set(point.x+sin(yaw)*r,point.y+sin(pitch)*dist,point.z+cos(yaw)*r);camera.lookAt(point);camera.updateMatrixWorld();
}
function resize(){
  const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),old=camera.aspect;
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  resizeFilm(w,h);
  const res=Math.min(.73,1400/w,870/h)*Math.min(devicePixelRatio,1.18);
  skyBuffer.setSize(Math.max(2,Math.round(w*res)),Math.max(2,Math.round(h*res)));skyLast=-1000;
  if(!exportMode&&old>0&&currentStop===0&&!travel){const k=Math.max(1,1.68/camera.aspect)/Math.max(1,1.68/old);wantR*=k;radius*=k;}
}
resize();
function updateStop(){
  document.getElementById('stop-name').textContent=stops[currentStop][0];
  document.getElementById('stop-en').textContent=stops[currentStop][1].toUpperCase();
  [...strip.children].forEach((b,i)=>{b.setAttribute('aria-current',String(i===currentStop));});
}
function menu(open){panel.hidden=!open;currentButton.setAttribute('aria-expanded',String(open));}
function choose(i,instant=false){
  if(exportMode)return;
  menu(false);currentStop=(i+stops.length)%stops.length;const s=stops[currentStop],target=vec(s[2]);
  const b=s[3]*deg,e=s[4]*deg,r=s[5]*fitView(currentStop);
  if(instant){travel=null;focus.copy(target);az=wantAz=b;el=wantEl=e;radius=wantR=r;aim(focus,az,el,radius);}
  else{
    const strt=camera.position.clone(),hor=r*cos(e),end=V(target.x+hor*sin(b),target.y+r*sin(e),target.z+hor*cos(b));
    const gap=strt.distanceTo(end),duration=clamp(.78+gap*.009,1.08,2.35);
    const mid=strt.clone().lerp(end,.5);
    mid.y+=Math.min(32,Math.max(2.3,gap*.28));
    // High crossings clear the dome, while adjacent streets stay close.
    if(Math.hypot(mid.x,mid.z)<21&&gap>37)mid.y=Math.max(mid.y,45);
    travel={elapsed:0,duration,strt,end,mid,startFocus:focus.clone(),endFocus:target,b,e,r};
  }
  updateStop();
}
stops.forEach((s,i)=>{
  const button=document.createElement('button');button.className='stop';
  const number=document.createElement('i');number.textContent=String(i+1).padStart(2,'0');
  const label=document.createElement('span');label.textContent=i===0?'全城远眺':s[0];button.append(number,label);
  button.addEventListener('click',()=>{choose(i);currentButton.focus({preventScroll:true});});strip.appendChild(button);
});
document.getElementById('prev').onclick=()=>choose(currentStop-1);document.getElementById('next').onclick=()=>choose(currentStop+1);
currentButton.onclick=()=>menu(panel.hidden);
window.addEventListener('keydown',e=>{
  if(exportMode)return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();choose(currentStop+(e.key==='ArrowLeft'?-1:1));}
  if(e.key==='Home'){e.preventDefault();choose(0);}
  if(e.key==='Escape'){menu(false);currentButton.focus({preventScroll:true});}
});
let pointer=null;
function cancelTravel(){
  if(!travel)return;
  const d=camera.position.clone().sub(focus);az=wantAz=Math.atan2(d.x,d.z);radius=wantR=d.length();el=wantEl=Math.asin(clamp(d.y/radius,-1,1));travel=null;
}
canvas.addEventListener('pointerdown',e=>{
  if(exportMode||e.button!==0)return;
  menu(false);cancelTravel();unlockChime();pointer={x:e.clientX,y:e.clientY,id:e.pointerId};
  canvas.setPointerCapture(e.pointerId);canvas.parentElement.classList.add('dragging');
});
canvas.addEventListener('pointermove',e=>{
  if(!pointer||e.pointerId!==pointer.id||exportMode)return;
  const s=stops[currentStop],cp=s[3]*deg;
  wantAz-=(e.clientX-pointer.x)*.0052;wantEl+=(e.clientY-pointer.y)*.00425;
  if(s[8]<PI)wantAz=clamp(wantAz,cp-s[8],cp+s[8]);wantEl=clamp(wantEl,s[9]*deg,s[10]*deg);
  pointer.x=e.clientX;pointer.y=e.clientY;
});
const release=()=>{pointer=null;canvas.parentElement.classList.remove('dragging');};
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);
canvas.addEventListener('wheel',e=>{
  e.preventDefault();if(exportMode)return;
  cancelTravel();menu(false);const s=stops[currentStop];
  wantR=clamp(wantR*Math.exp(clamp(e.deltaY*(e.deltaMode===1?15:1),-330,330)*.00126),s[6],s[7]*fitView(currentStop));
},{passive:false});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
// A broad-phase grid retains the masonry envelopes before static batching.
// It also protects oblique approaches to a neighboring roof or bridge tower.
const masonryGrid=new Map();
function surveyBuildings(){
  atlas.updateWorldMatrix(true,true);
  const solid=new Set(['ashlar','chalk','aged','sand','copper','copper2','seagreen','tile','tile2','walnut','road']);
  atlas.traverse(o=>{
    if(!o.isMesh||!solid.has(o.material.name))return;
    const ge=o.geometry;if(!ge.boundingBox)ge.computeBoundingBox();
    const b=ge.boundingBox.clone().applyMatrix4(o.matrixWorld),dim=b.getSize(V());
    if(dim.x<.42||dim.y<.67||dim.z<.42||dim.x>15.5||dim.z>15.5)return;
    b.expandByScalar(.19);
    for(let z=Math.floor(b.min.z/4);z<=Math.floor(b.max.z/4);z++)for(let x=Math.floor(b.min.x/4);x<=Math.floor(b.max.x/4);x++){
      const key=x+','+z;if(!masonryGrid.has(key))masonryGrid.set(key,[]);masonryGrid.get(key).push(b);
    }
  });
}
function clearStone(){
  const P=camera.position;let y=-Infinity;
  const x=P.x*cos(cityYaw)-P.z*sin(cityYaw),z=P.x*sin(cityYaw)+P.z*cos(cityYaw),r=Math.hypot(x,z);
  if(currentStop!==1&&currentStop!==16){
    if(r<23.26)y=4.15;
    if(r<20.58&&r>13.28)y=7.78;
    if(Math.hypot(x,z+2.28)<12.26)y=10.82;
    if(Math.abs(x)<6.67&&z>-10.97&&z<3.57)y=Math.max(y,21.05);
    if(Math.hypot(x,z+4.28)<5.05)y=Math.max(y,28.61);
    if(Math.hypot(x,z+4.28)<1.19)y=Math.max(y,35.4);
    for(const a of islands){
      if(((P.x-a.x)/a.rx)**2+((P.z-a.z)/a.rz)**2<1.02)y=Math.max(y,a.y+1.03);
    }
  }
  if(P.y<y){P.y=y;camera.lookAt(focus);}
  const outward=P.clone().sub(focus).normalize();
  if(outward.lengthSq()===0)outward.set(0,1,0);
  // Each step leaves at least one finite solid behind along the same ray.
  // Check the next cell too, since a bridge pier can meet the cliff itself.
  while(true){
    let clearance=0;
    const cliff=inhabitedCliffs.find(c=>c.bounds.containsPoint(P));
    if(cliff){
      const hit=new T.Raycaster(P,outward).intersectObject(cliff.shell,false)[0];
      if(hit&&hit.face.normal.clone().transformDirection(cliff.shell.matrixWorld).dot(outward)>0){
        clearance=hit.distance+.42;
      }
    }
    const candidates=masonryGrid.get(Math.floor(P.x/4)+','+Math.floor(P.z/4));
    for(const block of candidates||[]){
      if(!block.containsPoint(P))continue;
      let exit=Infinity;
      for(const axis of ['x','y','z']){
        const d=outward[axis];if(Math.abs(d)<.0001)continue;
        const end=d>0?block.max[axis]:block.min[axis];exit=Math.min(exit,(end-P[axis])/d);
      }
      if(Number.isFinite(exit))clearance=Math.max(clearance,exit+.08);
    }
    if(clearance<=0)break;
    P.addScaledVector(outward,clearance);camera.lookAt(focus);
  }
}
function moveView(dt){
  if(travel){
    const f=travel;f.elapsed=Math.min(f.duration,f.elapsed+dt);
    let t=f.elapsed/f.duration;t=t*t*(3-2*t);const u=1-t;
    focus.lerpVectors(f.startFocus,f.endFocus,t);
    camera.position.copy(f.strt).multiplyScalar(u*u).addScaledVector(f.mid,2*t*u).addScaledVector(f.end,t*t);
    clearStone();camera.lookAt(focus);
    if(f.elapsed>=f.duration){az=wantAz=f.b;el=wantEl=f.e;radius=wantR=f.r;travel=null;}
  }else{
    const k=1-Math.exp(-dt*16);az=mix(az,wantAz,k);el=mix(el,wantEl,k);radius=mix(radius,wantR,k);
    aim(focus,az,el,radius);clearStone();
  }
  camera.updateMatrixWorld();
}
let audioCtx=null,lastChime=-1;
function unlockChime(){try{if(!audioCtx)audioCtx=new AudioContext();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});}catch{}}
nav.addEventListener('pointerdown',unlockChime,{once:true});
function chime(t){
  const n=Math.floor(t),k=n%46;if(n===lastChime||(k!==8&&k!==10))return;lastChime=n;
  if(!audioCtx||audioCtx.state!=='running')return;
  const d=camera.position.distanceTo(V(36.4,12.8,-28.8)),volume=.080/(1+d*.024),now=audioCtx.currentTime;
  for(const [freq,weight,decay] of [[196,.90,3.6],[398,.35,2.79],[546,.22,2.13],[824,.13,1.48]]){
    const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.frequency.value=freq;osc.type='sine';
    gain.gain.setValueAtTime(.00001,now);gain.gain.exponentialRampToValueAtTime(volume*weight,now+.016);gain.gain.exponentialRampToValueAtTime(.00001,now+decay);
    osc.connect(gain).connect(audioCtx.destination);osc.start(now);osc.stop(now+decay+.01);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
}
// Takes normally run at constant subject-relative arc speed. An optional
// [start, end, exit/entry speed] specifies a single motivated change of pace.
const tour=[
  // Western orbit: the moored envelope crosses the rock silhouette, then the
  // five radial bridges separate. Enter the orbit already at travelling speed.
  [7,[-3.1,1.42,.70],stops[0][2],[-78,13.6,151],[-7,14.7,154]],
  // Climb alongside the chain; carry the slower vertical drift past the face.
  [5,localView(-1.1,-28.4,12.9),localView(-.25,-8.82,17.9),[-4,1.5,23.6],[1,2.7,22.4]],
  // Truck past the gate tower: the market awnings appear through the gap.
  [4.25,localView(-3.0,3.75,22.32),localView(7.11,3.99,14.75),[12,25,18.7],[16,26,18.0], [.30,.48,.68]],
  // Round the cloister towards the sundial and the inner arcade.
  [3.75,localView(-13.55,5.28,3.51),localView(-13.26,5.13,3.67),[-137,41,19.1],[-81,40,18.8]],
  // Ride the grade of the aqueduct from the turning buckets to the head tank.
  [7,islandView(2,.03,2.64,.83),localView(-.45,10.75,-14.88),[-134,25,21.3],[-127,27,22.1]],
  // Descend with the spillwater, from the terrace bowls to the cliff lip.
  [4.5,localView(11.66,8.75,.30),localView(9.43,-2.60,21.34),[73,18,23.4],[69,15,23.9]],
  // Pull off the gondola: rope, envelope and finally the quay share the frame.
  [5.75,islandView(0,-4.85,5.35,1.47),islandView(0,-2.75,4.95,.35),[13,12,12.2],[16,13.5,33.2]],
  // A short lateral look through the vines into the monastery courtyard.
  [3.75,islandView(1,3.15,1.02,2.73),islandView(1,-1.44,1.92,-.04),[31,26,14.5],[28,27,14.2]],
  // Principal reveal: one crane lift. Pass the statues, read the rose window,
  // lift again over the drum, then glide along the gold ribs of the cupola.
  [10.5,localView(.81,10.25,4.95),localView(.40,27.45,-2.85),[14,-1.2,28.1],[19,8.4,30.6]],
  // Cut on the gilt rib to a close orbit between the moving armillary rings.
  [3.5,localView(.10,35.18,-4.28),localView(.13,36.30,-4.30),[-27,7,8.9],[15,8,8.4]],
  // Follow the suspension cables into the sounding belfry and the rising flock.
  [6.5,[23.40,3.61,-18.88],islandView(3,.40,7.62,-.69),[23,16,22.2],[25,17,21.4]],
  // Cross the break in the causeway; the surviving colonnade clears its pier.
  [4.5,[37.82,-1.38,2.76],islandView(4,.30,1.72,-.39),[20,20,18.4],[16,22,17.9]],
  // Skim the outer parapet past the projecting belvedere.
  [6,[-20.6,-4.61,40.0],[8.4,-7.87,47.8],[-17,14,20.2],[-13,15,21.1]],
  // Circle the lantern: the gallery posts slide across the beam and cloud bank.
  [6.5,islandView(5,.44,5.44,-.49),islandView(5,.58,6.14,-.73),[-43,12,28.2],[26,13,28.7]],
  // Pull back from the basilica through the passing cloud shadow. First the
  // wall, then the island roots and the outer ring enter the final composition.
  [11.5,localView(0,14.0,2.45),stops[0][2],[6,14,57.8],[1.8,15,154.8], [.86,1,0]]
];
const tourLength=tour.reduce((a,s)=>a+s[0],0);
// Measure a dolly in subject distances and a turn in radians. Matching in
// this frame carries the apparent movement across a cut between different scales.
function filmAxes(p){
  const a=p[3],e=p[4],ce=cos(e),se=sin(e);
  return [V(cos(a),0,-sin(a)),V(-sin(a)*se,ce,-cos(a)*se),V(sin(a)*ce,se,cos(a)*ce)];
}
function localMotion(p,delta){
  const shift=V(...delta.slice(0,3)),r=p[5];
  return [...filmAxes(p).map(axis=>axis.dot(shift)/r),delta[3]*cos(p[4]),delta[4],delta[5]/r];
}
function worldMotion(p,local){
  const shift=V();
  filmAxes(p).forEach((axis,i)=>shift.addScaledVector(axis,local[i]*p[5]));
  return [...shift.toArray(),local[3]/cos(p[4]),local[4],local[5]*p[5]];
}
function tangentWeight(u){
  const width=.20;
  return u<width?u*(1-u/width)**3:0;
}
function filmPose(shot,u){
  const incoming=tangentWeight(u),outgoing=tangentWeight(1-u);
  return shot.from.map((v,i)=>v+shot.delta[i]*u+incoming*shot.entry[i]-outgoing*shot.exit[i]);
}
const filmIntervals=96;
let filmAspect=0,filmTracks=[];
function prepareFilmTracks(){
  filmAspect=camera.aspect;
  filmTracks=tour.map(([duration,start,end,a,b,pace],i)=>{
    const scale=Math.max(1,(i===0||i===tour.length-1?1.68:1.28)/filmAspect);
    const from=[...start,a[0]*deg,a[1]*deg,a[2]*scale],to=[...end,b[0]*deg,b[1]*deg,b[2]*scale];
    return {duration,from,to,pace,delta:to.map((v,k)=>v-from[k]),entry:Array(6).fill(0),exit:Array(6).fill(0)};
  });
  for(let i=1;i<filmTracks.length;i++){
    const prev=filmTracks[i-1],next=filmTracks[i];
    const a=localMotion(prev.to,prev.delta),b=localMotion(next.from,next.delta);
    const la=Math.hypot(...a),lb=Math.hypot(...b);
    const bisector=a.map((v,k)=>v/la+b[k]/lb),length=Math.hypot(...bisector);
    const heading=bisector.map(v=>v/length);
    prev.exit=worldMotion(prev.to,heading.map(v=>v*la)).map((v,k)=>v-prev.delta[k]);
    next.entry=worldMotion(next.from,heading.map(v=>v*lb)).map((v,k)=>v-next.delta[k]);
  }
  // Arc-length pacing includes the short tangent blends. Both authored end
  // poses and the central portion of every original polar path stay on their marks.
  for(const shot of filmTracks){
    shot.arc=[0];let prev=shot.from;
    for(let j=1;j<=filmIntervals;j++){
      const cur=filmPose(shot,j/filmIntervals),mid=cur.map((v,k)=>(v+prev[k])*.5);
      const step=localMotion(mid,cur.map((v,k)=>v-prev[k]));
      shot.arc.push(shot.arc[j-1]+Math.hypot(...step));prev=cur;
    }
    shot.length=shot.arc[filmIntervals];
  }
}
function filmDistance(shot,time){
  const k=clamp(time/shot.duration,0,1);
  if(!shot.pace)return shot.length*k;
  // Integrate a smooth transition between two constant speeds. Normalizing
  // by the total area keeps the original end composition and cut time exact.
  const [start,end,exitRate]=shot.pace,width=end-start;
  const u=clamp((k-start)/width,0,1);
  const rampArea=width*u*u*u*(1-.5*u)+Math.max(0,k-end);
  const total=1+(exitRate-1)*(1-(start+end)*.5);
  return shot.length*clamp((k+(exitRate-1)*rampArea)/total,0,1);
}
function filmTime(t){
  if(filmAspect!==camera.aspect)prepareFilmTracks();
  let local=clamp(t,0,tourLength),index=0;
  while(index<filmTracks.length-1&&local>=filmTracks[index].duration)local-=filmTracks[index++].duration;
  const shot=filmTracks[index];
  const distance=filmDistance(shot,local);
  let j=0;
  while(j<filmIntervals-1&&shot.arc[j+1]<distance)j++;
  const fraction=(distance-shot.arc[j])/(shot.arc[j+1]-shot.arc[j]);
  const p=filmPose(shot,(j+fraction)/filmIntervals);
  aim(V(p[0],p[1],p[2]),p[3],p[4],p[5]);
}
function paint(t,force=false){
  timeUniform.value=t;for(const f of ticking)f(t);drawSky(t,force);
  if(initShadows){renderer.shadowMap.needsUpdate=true;initShadows=false;}
  composite();
}
function loop(now){
  requestAnimationFrame(loop);const dt=Math.min(.15,(now-lastTime)*.001);lastTime=now;
  if(exportMode||document.hidden)return;
  liveTime+=dt;moveView(dt);paint(liveTime);chime(liveTime);
}
const shown=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
async function filmFrame(i){
  const t=i/fpsExport;filmTime(t);paint(t,true);renderer.getContext().finish();await shown();
}
window.videoExport={
  runs:['tour'],
  async begin(runId,{fps=60}={}){
    await sceneReady;
    if(runId!=='tour')throw new RangeError('Unknown run');if(!Number.isFinite(fps)||fps<=0)throw new RangeError('fps must be positive');
    if(!exportMode)saved={currentStop,focus:focus.clone(),az,el,radius,wantAz,wantEl,wantR,liveTime,travel,cam:camera.position.clone(),rot:camera.quaternion.clone(),menu:!panel.hidden,aspect:camera.aspect};
    exportMode=true;fpsExport=fps;nav.hidden=true;
    if(pointer&&canvas.hasPointerCapture(pointer.id))canvas.releasePointerCapture(pointer.id);
    release();travel=null;
    await filmFrame(0);return {frames:Math.round(tourLength*fps)};
  },
  async frame(i){if(!exportMode)throw new Error('Call begin first');if(!Number.isInteger(i)||i<0||i>=Math.round(tourLength*fpsExport))throw new RangeError('Frame outside tour');await filmFrame(i);},
  end(){
    if(!exportMode)return;exportMode=false;
    ({currentStop,az,el,radius,wantAz,wantEl,wantR,liveTime,travel}=saved);focus.copy(saved.focus);camera.position.copy(saved.cam);camera.quaternion.copy(saved.rot);
    if(currentStop===0&&!travel&&saved.aspect!==camera.aspect){
      const k=fitView(0)/Math.max(1,1.68/saved.aspect);radius*=k;wantR*=k;aim(focus,az,el,radius);
    }
    menu(saved.menu);saved=null;nav.hidden=false;lastTime=performance.now();updateStop();paint(liveTime,true);
  }
};
window.addEventListener('resize',()=>{resize();if(exportMode){filmTime(timeUniform.value);paint(timeUniform.value,true);}else{moveView(0);paint(liveTime,true);}});
surveyBuildings();bake(atlas);
choose(0,true);
const sceneReady=platesReady.then(()=>{photographOrrery();paint(0,true);nav.hidden=false;lastTime=performance.now();requestAnimationFrame(loop);});
