// The distant mountain ranges are an original painted backdrop, kept softer than the miniature.
function backdrop(){let w=sky.width=innerWidth,h=sky.height=innerHeight,p=sky.getContext('2d');let g=p.createLinearGradient(0,0,w*.018,h);g.addColorStop(0,'#a7cdd3');g.addColorStop(.33,'#d6e3da');g.addColorStop(.59,'#f3e8ca');g.addColorStop(.86,'#eeeadc');g.addColorStop(1,'#f4eee0');p.fillStyle=g;p.fillRect(0,0,w,h);let glow=p.createRadialGradient(.14*w,.25*h,0,.14*w,.25*h,.42*w);glow.addColorStop(0,'rgba(255,239,196,.43)');glow.addColorStop(1,'rgba(255,239,196,0)');p.fillStyle=glow;p.fillRect(0,0,w,h);
let noise=(x,k)=>Math.sin(x*15+k)*.022+Math.cos(x*29+k*2)*.014+Math.sin(x*67+k)*.006+Math.sin(x*195+k)*.002;for(let k=0;k<3;k++){let level=.43+k*.07;let grd=p.createLinearGradient(0,(level-.1)*h,0,(level+.1)*h);grd.addColorStop(0,['#98b7b291','#a0b8a39c','#bac2a685'][k]);grd.addColorStop(1,'rgba(204,215,194,0)');p.fillStyle=grd;p.beginPath();p.moveTo(0,h);for(let x=0;x<=w+2;x+=2){let u=x/w;p.lineTo(x,h*(level+noise(u,k)+.05*Math.sin(u*5+k)))}p.lineTo(w,h);p.fill()}for(let k=0;k<17;k++){let u=(k*.618)%1,v=(k*.277)%1*.36;let len=w*(.06+.04*Math.sin(k));let cg=p.createLinearGradient(w*u,0,w*u+len,0);cg.addColorStop(0,'#ffffec00');cg.addColorStop(.45,'#fff9de88');cg.addColorStop(1,'#ffffed00');p.fillStyle=cg;p.beginPath();p.moveTo(w*u,h*v);p.bezierCurveTo(w*u+len*.44,h*v+5,w*u+len*.52,h*v-3,w*u+len,h*v-6);p.bezierCurveTo(w*u+len*.55,h*v+5,w*u+len*.3,h*v+3,w*u,h*v);p.fill()}
grain.width=350;grain.height=220;let q=grain.getContext('2d'),im=q.createImageData(350,220);for(let j=0;j<im.data.length;j+=4){let v=Math.floor(((Math.imul(j+2107,2654435761)>>>8)%150)+95);im.data[j]=im.data[j+1]=im.data[j+2]=v;im.data[j+3]=125}q.putImageData(im,0,0)}
const shadowTex=canvasTex(256,256,p=>{let g=p.createRadialGradient(128,128,20,128,128,126);g.addColorStop(0,'rgba(69,66,46,.55)');g.addColorStop(.53,'rgba(84,84,66,.32)');g.addColorStop(1,'rgba(119,117,90,0)');p.fillStyle=g;p.fillRect(0,0,256,256)});let shadow=mesh(new T.PlaneGeometry(25,22),0,0,-1.64,.3,new T.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
let falling=[];for(let j=0;j<44;j++){let typ=j%3!==0,x=typ?.51:(j%2?-5.87:5.95),z=typ?-3.02:(j%2?1.44:-1.54),h=typ?9.61:(j%2?2.47:2.74),a=R(0,TAU),r=R(.15,typ?1.56:.68),l=mesh(typ?fanGeo:mapleGeo,pick(typ?ginCols:mapCols));if(typ)sites.treeGround.add(l);l.scale.setScalar(R(.067,.12));falling.push({l,x:x+r*Math.cos(a),z:z+r*Math.sin(a),h,phase:rand(),a,typ})}
function tick(t){let wind=windStrength(t,1,-2);for(let {l,x,z,h,phase,a,typ} of falling){let u=(t*(typ?.081:.069)+phase)%1;const fx=x+Math.sin(u*9+a)*.4+wind*u*.7,fz=z+u*1.56+.3*Math.cos(u*8+a);
  const landingZ=z+1.56+.3*Math.cos(8+a),landingY=typ&&landingZ< -2.35&&x>-.24?terraceY+.026:.13;
  l.position.set(fx,landingY+(h-landingY)*(1-u),fz);
  l.rotation.set(u*7+a,typ?Math.sin(u*10):u*14,u*9);
  l.visible=u<.965&&!(fx>-.24&&fz< -2.35&&l.position.y<terraceY);
}for(let fn of anim)fn(t);sunlight.intensity=2.08-.29*Math.pow((1+Math.cos(t*.107-2.25))/2,9);halo.material.opacity*=.91+.09*Math.sin(t*1.13)}
flush();
// A shot is specified by its focus, eye offset and vertical field at the focus.
const views=[
  ['全景',[0,1.67,.15],[3.05,21.42,30.81],15.62],
  ['底座剖面',[.33,-.16,6.36],[1.53,1.68,8.6],4.89],
  ['鸟居与参道',[4.67,1.56,3.06],[.56,2.65,8.13],6.55],
  ['手水舍',[2.81,1.23,1.35],[-.94,.79,2.48],2.91,'purification'],
  ['星宮社殿',[4.40,3.46,-4.60],[.39,2.04,6.32],4.96,'hall'],
  ['稻荷小祠',[2.50,.88,-1.11],[1.78,1.06,1.41],3.06,'inari'],
  ['御神木与红毡长凳',[.62,4.60,-2.75],[.98,2.15,12.59],13.16],
  ['溪桥与枯山水',[-.43,.50,2.86],[.14,5.63,7.21],5.36],
  ['庭门与菊花台',[-4.99,1.04,3.4],[2.36,3.01,7.13],5.02],
  ['水果塔水池',[.41,.29,5.14],[.61,4.29,5.49],4.39],
  ['檐廊花摊',[-5.48,1.87,.53],[.32,.46,1.28],1.77],
  ['画室全貌',[-3.46,2.13,-2.03],[-.68,4.71,7.94],5.72],
  ['观星球',[-3.45,2.13,-2.15],[.48,.72,2.63],1.96],
  ['画架与茶席',[-3.48,1.67,-1.18],[-.09,1.13,2.40],2.88],
  ['观星书桌',[-1.64,2.04,-3.81],[-.47,.53,1.45],1.86],
  ['从拉门望庭院',[2.35,.97,5.34],[-5.74,1.02,-5.79],8.41],
  ['屋顶天窗',[-3.6,4.61,-3.44],[-.16,2.78,-1.43],2.35],
  ['石垣与树根',[.75,1.77,-2.29],[1.13,1.11,3.99],3.94],
  ['白砂与庭石',[-3.71,.35,4.59],[.49,1.79,1.85],2.23],
  ['狛犬与绘马',[3.48,3.24,-2.93],[.74,.39,.64],1.56]
];
function placeView(siteName,p,offset,size){
  if(!siteName)return [p,offset,size];
  const group=sites[siteName];
  return [sitePoint(siteName,p).toArray(),V(...offset).multiplyScalar(group.getWorldScale(V()).x).applyQuaternion(group.getWorldQuaternion(new T.Quaternion())).toArray(),size*group.getWorldScale(V()).x];
}
const viewSites={6:'upper',10:'studio',11:'studio',12:'studio',13:'studio',14:'studio',16:'studio',17:'upper',18:'sand',19:'upper'};
const mapViews=views.map((v,i)=>[v[0],...placeView(v[4]||viewSites[i],v[1],v[2],v[3])]);
const roomEye=sitePoint('studio',[-2.95,2.18,-1.21]),gardenFocus=V(2.10,.83,5.23);
mapViews[15]=[views[15][0],gardenFocus.toArray(),roomEye.sub(gardenFocus).toArray(),8.3];
let idx=0,target=new T.Vector3(),yaw,pitch,span,dist,tween=null,exporting=false,elapsed=0,t0=performance.now();
const gardenLimits=[];
for(let x of [-7.15,7.15])for(let z of [-7.15,7.15])gardenLimits.push(V(x,-1.62,z),V(x,.13,z));
gardenLimits.push(sitePoint('upper',[.88,10.56,-3.06]),V(-6.55,4.01,-4.6),V(6.47,5.21,-6.32),V(6.16,3.17,5.6));
function fitGarden(state,margin=.91){
  const back=V(Math.sin(state.a)*Math.cos(state.e),Math.sin(state.e),Math.cos(state.a)*Math.cos(state.e));
  const right=V(Math.cos(state.a),0,-Math.sin(state.a)),up=new T.Vector3().crossVectors(back,right);
  const ar=innerWidth/innerHeight,compensation=Math.max(1,1.38/ar);let required=0;
  for(const corner of gardenLimits){const v=corner.clone().sub(state.p),depth=state.d-v.dot(back),factor=2*state.d/depth;
    required=Math.max(required,factor*Math.abs(v.dot(up))/margin,factor*Math.abs(v.dot(right))/(ar*.94));
  }
  state.s=Math.max(state.s,required/compensation);return state;
}
function params(i){const v=mapViews[i],d=V(...v[2]);const state={p:V(...v[1]),a:Math.atan2(d.x,d.z),e:Math.asin(d.y/d.length()),s:v[3],d:d.length()};return i===0?fitGarden(state,.90):state}
function apply(v){target.copy(v.p);yaw=v.a;pitch=v.e;span=v.s;dist=v.d}
function snap(){return{p:target.clone(),a:yaw,e:pitch,s:span,d:dist}}
function visibleHeight(){return 2*dist/camera.projectionMatrix.elements[5]}
function cam(){
  camera.aspect=innerWidth/innerHeight;
  const field=span*Math.max(1,1.38/camera.aspect);
  camera.fov=T.MathUtils.radToDeg(2*Math.atan(field/(2*dist)));
  camera.updateProjectionMatrix();
  camera.position.copy(target).add(V(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)).multiplyScalar(dist));
  camera.lookAt(target);camera.updateMatrixWorld();
}
// The clapper and water hammer have short, unamplified sounds after first interaction.
let gardenAudio=null, lastAudibleTime=null;
function listenToGarden(event){
  if(!event.isTrusted||exporting)return;
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  if(!AudioEngine)return;
  if(!gardenAudio)gardenAudio=new AudioEngine();
  if(gardenAudio.state==='suspended')gardenAudio.resume().catch(()=>{});
}
document.addEventListener('pointerdown',listenToGarden,{passive:true});
function strikeNote(hz,tail,volume,type,detune=0){
  const start=gardenAudio.currentTime,oscillator=gardenAudio.createOscillator(),envelope=gardenAudio.createGain();
  oscillator.type=type;oscillator.frequency.setValueAtTime(hz,start);
  oscillator.detune.setValueAtTime(detune,start);
  envelope.gain.setValueAtTime(.00001,start);envelope.gain.exponentialRampToValueAtTime(volume,start+.005);
  envelope.gain.exponentialRampToValueAtTime(.00001,start+tail);
  oscillator.connect(envelope);envelope.connect(gardenAudio.destination);oscillator.start(start);oscillator.stop(start+tail+.015);
  oscillator.onended=()=>{oscillator.disconnect();envelope.disconnect()};
}
function soundAt(t){
  const prevTime=lastAudibleTime;lastAudibleTime=t;
  if(exporting||!gardenAudio||gardenAudio.state!=='running'||prevTime===null||t-prevTime>.4||t<=prevTime)return;
  const crossed=(period,offset)=>Math.floor((prevTime-offset)/period)<Math.floor((t-offset)/period);
  const distanceGain=(x,y,z)=>1/(1+.07*camera.position.distanceTo(V(x,y,z)));
  if(crossed(7,5.49)){
    const v=.019*distanceGain(1.47,.964,.32);
    strikeNote(242,.105,v,'sine');strikeNote(464,.052,v*.39,'triangle');
  }
  const arrive=4+(5+1.81)*.39+(3-.1)*.12+3.41;
  for(const delay of [0,.68,1.81]){
    if(crossed(42,arrive+delay)){
      const v=.011*distanceGain(...sitePoint('studio',[-1.81,3.31,.1]).toArray())/(1+delay*.47);
      strikeNote(1853,1.17,v,'sine');strikeNote(2719,.54,v*.26,'sine',4);strikeNote(3667,.22,v*.13,'sine');
    }
  }
}
// Measure attention at the depth of each animal in the perspective frustum.
let lastApproachTime=-100,filmShotTime=0;
const attentionPoint=new T.Vector4();
function viewerAttention(point,field,t){
  attentionPoint.set(point.x,point.y,point.z,1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  const w=attentionPoint.w;if(w<=0)return 0;
  const x=attentionPoint.x/w,y=attentionPoint.y/w,z=attentionPoint.z/w;
  if(Math.abs(x)>=1.06||Math.abs(y)>=1.06||z<-1||z>1)return 0;
  const extent=2*w/camera.projectionMatrix.elements[5];
  const closeness=1-T.MathUtils.smoothstep(extent,field*.36,field);
  const framing=1-T.MathUtils.smoothstep(Math.max(Math.abs(x),Math.abs(y)),.49,1.06);
  const dt=t-(exporting?filmShotTime:lastApproachTime);
  const response=T.MathUtils.smoothstep(dt,0,.57)*(1-T.MathUtils.smoothstep(dt,2.55,6.9));
  return closeness*framing*response;
}
function draw(t){cam();selectRoundDetail();tick(t);soundAt(t);renderInk()}
const menu=document.querySelector('#menu'),choose=document.querySelector('#choose'),nm=document.querySelector('#name');function hideMenu(){menu.hidden=true;choose.setAttribute('aria-expanded','false')}function updateUI(){nm.textContent=views[idx][0];count.textContent=String(idx+1).padStart(2,'0')+' / '+views.length;Array.from(menu.children).forEach((b,j)=>b.classList.toggle('active',j===idx))}
function selectView(i){if(exporting)return;lastApproachTime=elapsed;idx=(i+views.length)%views.length;let v=params(idx);v.a=yaw+Math.atan2(Math.sin(v.a-yaw),Math.cos(v.a-yaw));tween={from:snap(),to:v,start:performance.now()};updateUI();hideMenu()}
views.forEach((v,i)=>{let b=document.createElement('button');b.innerHTML='<small>'+String(i+1).padStart(2,'0')+'</small>'+v[0];b.onclick=()=>selectView(i);menu.appendChild(b)});prev.onclick=()=>selectView(idx-1);next.onclick=()=>selectView(idx+1);choose.onclick=()=>{menu.hidden=!menu.hidden;choose.setAttribute('aria-expanded',!menu.hidden)};document.addEventListener('keydown',e=>{if(e.key==='ArrowRight')selectView(idx+1);if(e.key==='ArrowLeft')selectView(idx-1);if(e.key==='Escape')hideMenu()});
let drag=null;stage.onpointerdown=e=>{if(exporting)return;hideMenu();tween=null;drag=[e.clientX,e.clientY];stage.setPointerCapture(e.pointerId)};stage.onpointermove=e=>{if(!drag||exporting)return;let a=params(idx);yaw-=(e.clientX-drag[0])*.006;pitch=clamp(pitch+(e.clientY-drag[1])*.005,.075,1.38);const limits={1:[1.23,.08,.73],2:[.94,.15,1.04],3:[.45,.09,.53],4:[.64,.13,.65],5:[.47,.35,.85],10:[.53,.12,.71],11:[.76,.20,.93],12:[.64,.12,.54],13:[.72,.12,.77],14:[.56,.15,.62],15:[.19,.12,.23],16:[.72,.76,1.34],17:[.72,.096,.72],18:[.79,.55,1.33],19:[.59,.16,.61]}[idx];if(limits){const offset=Math.atan2(Math.sin(yaw-a.a),Math.cos(yaw-a.a));yaw=a.a+clamp(offset,-limits[0],limits[0]);pitch=clamp(pitch,limits[1],limits[2])}drag=[e.clientX,e.clientY]};stage.onpointerup=stage.onpointercancel=()=>drag=null;stage.onwheel=e=>{
  e.preventDefault();if(exporting)return;tween=null;if(e.deltaY<0)lastApproachTime=elapsed;
  const v=params(idx),next=clamp(span*Math.exp(clamp(e.deltaY,-150,150)*.0012),v.s*.40,v.s*1.55);
  const safe=idx>=10&&idx<=16?[.68,1.13]:[.56,1.44];
  dist=clamp(dist*next/span,v.d*safe[0],v.d*safe[1]);span=next;
};
// All film tracks use one travel parameter for the eye, the aim and the lens.
function filmPose(eye,focus,fieldRatio){
  const offset=eye.sub(focus),distance=offset.length();
  return {p:focus,a:Math.atan2(offset.x,offset.z),e:Math.asin(offset.y/distance),d:distance,s:distance*fieldRatio};
}
function filmTrack(eye,focus,lastEye,lastFocus,fieldRatio,siteName){
  const point=p=>siteName?sitePoint(siteName,p):V(...p);
  const first=point(eye),last=point(lastEye),from=point(focus),to=point(lastFocus);
  return u=>filmPose(first.clone().lerp(last,u),from.clone().lerp(to,u),fieldRatio);
}
function filmOrbit(focus,lastFocus,fromAngle,toAngle,elevation,distance,field,siteName){
  const site=sites[siteName];
  const from=site?sitePoint(siteName,focus):V(...focus),to=site?sitePoint(siteName,lastFocus):V(...lastFocus);
  const scale=site?site.getWorldScale(V()).x:1;
  const siteAngle=site?Math.atan2(site.matrixWorld.elements[8],site.matrixWorld.elements[10]):0;
  return u=>({p:from.clone().lerp(to,u),a:siteAngle+fromAngle+(toAngle-fromAngle)*u,e:elevation,d:distance*scale,s:field*scale});
}
function gardenDolly(opening){
  return u=>{
    // Fit only the full view. From there a fixed lens makes the advancing
    // front edge and the growing buildings visible from the first dolly move.
    const state=fitGarden({p:V(0,1.36,.08),a:opening?.105:.245,e:opening?.575:.60,d:opening?24.8:26,s:0},opening?.958:.927);
    const inward=opening?u:1-u;
    state.p.lerp(opening?V(.88,2.57,-1.65):V(.42,.97,2.17),inward);
    const scale=1-(opening?.49:.51)*inward;
    state.d*=scale;state.s*=scale;
    return state;
  };
}
function roundedCorner(distance,radius){
  if(distance<=-radius)return 0;
  if(distance>=radius)return distance;
  return (distance+radius)**2/(4*radius);
}
function ascendShrine(u){
  const z=9.55-10.09*u,rise=clamp(roundedCorner(stairFront-z,.32)/(stairRun*stairN),0,1);
  const eye=sitePoint('upper',[axisX+.20*(1-u),1.60+(terraceY-.35)*rise,z]);
  const focus=sitePoint('upper',[axisX,3.74+.61*u,-4.26]);
  return filmPose(eye,focus,1.18);
}
function followWater(u){
  const lip=sitePoint('upper',[2.08,terraceY+.59,-2.35]),foot=streamLine.getPointAt(0);
  const downstream=roundedCorner(u-.28,.063);
  const focus=streamLine.getPointAt(clamp(downstream/.72,0,1));
  focus.addScaledVector(lip.sub(foot),1-(u-downstream)/.28);
  return filmPose(focus.clone().add(V(1.07,1.43+.39*u,1.63+.22*u)),focus,1.08);
}

// Durations set the rhythm across cuts. Most paths are traversed at constant image speed.
const shots=[
  { // Start on the complete silhouette, then push between the studio and the falls.
    path:gardenDolly(true),
    seconds:7
  },
  { // Descend with the gilded shower; read the rope as the leaves pass it.
    path:filmTrack([2.31,9.26,2.66],[.64,8.37,-3.07],[1.87,4.02,2.77],[.32,3.02,-2.93],.84,'treeGround'),
    seconds:4
  },
  { // Two passing foregrounds: the torii, then the lanterns on the ascent.
    path:ascendShrine,
    seconds:8
  },
  { // Follow the drop, round the dipper and carry the current under the bridge.
    path:followWater,
    seconds:5.5, slowdown:{from:3.6,to:4.7,endRate:.14}
  },
  { // Sweep around the pond. The near pine clears the fruit and the fluted cut edge.
    path:filmOrbit([.99,.39,4.78],[-.04,.24,5.78],.76,-.53,.705,8.38,5.83),
    seconds:7.5
  },
  { // A short slide off the silver blade, following the row of limes to the koi.
    path:filmTrack([2.65,1.97,7.96],[1.83,.47,6.06],[.35,1.91,7.37],[-.32,.45,5.42],.94),
    seconds:3.5
  },
  { // Lower past the bright rim until the fish are seen through the vertical section.
    path:filmTrack([1.54,3.29,9.63],[.68,.53,5.92],[.43,-.21,9.54],[.36,-.34,6.70],.89),
    seconds:5
  },
  { // Cut from the strata to tile courses. Draw back from the oculus to reveal the room.
    path:filmTrack([-4.42,8.62,-1.81],[-3.67,4.45,-3.83],[-4.38,7.36,3.81],[-3.46,2.28,-1.90],.82,'studio'),
    seconds:7
  },
  { // Truck along the veranda: the post slips by, then the bouquets and their reflection.
    path:filmTrack([-1.72,2.54,2.48],[-2.62,1.99,.41],[-4.91,2.40,1.76],[-5.51,1.90,.47],1.15,'studio'),
    seconds:4.5
  },
  { // Pass through the open shoji and approach the unfinished picture.
    path:filmTrack([-3.25,2.49,1.63],[-4.51,1.74,-1.26],[-4.05,2.23,-.12],[-4.97,1.94,-1.34],1.10,'studio'),
    seconds:6
  },
  { // A tabletop insert: steam at the kettle gives way to the little slice of tart.
    path:filmTrack([-1.03,2.19,-.06],[-1.08,1.54,-1.52],[-1.75,2.03,.34],[-1.88,1.56,-.68],.93,'studio'),
    seconds:3.5
  },
  { // Rise from the open observing notes, past the shelf, to the hanging planets.
    path:filmTrack([-2.29,2.34,-1.70],[-1.67,1.76,-3.40],[-2.21,3.76,-1.48],[-1.58,3.51,-3.10],.91,'studio'),
    seconds:6.5
  },
  { // Match the suspended planet to the globe. Sweep clear of the easel, then
    // sustain the turn through alignment at 74.6 s and the expanding light.
    path:filmOrbit([-3.79,1.98,-2.11],[-3.32,2.14,-2.22],-.83,.81,.235,2.68,2.07,'studio'),
    seconds:11, slowdown:{from:5.3,to:6.3,endRate:.70}
  },
  { // The close lattice moves across the lens and opens onto the distant torii and water.
    path:filmTrack(sitePoint('studio',[-1.75,2.20,-1.33]).toArray(),[3.28,1.02,5.23],
      sitePoint('studio',[-3.61,2.20,-1.24]).toArray(),[1.48,.79,5.46],.80),
    seconds:4.5
  },
  { // Pull out from the bridge and pond. Brake only as the whole plinth is composed.
    path:gardenDolly(false),
    seconds:6.5, slowdown:{from:5.1,to:6.5,endRate:0}
  }
];
let tourSeconds=0;
for(const cue of shots){
  cue.start=tourSeconds;
  tourSeconds+=cue.seconds;
  cue.end=tourSeconds;
}
// Express tracking, orbit and magnification in the current camera's frame.
// A tabletop close-up and the establishing shot can then carry the same
// apparent motion across a cut without sharing a world-space position.
function motionFrame(pose){
  const field=pose.s*Math.max(1,1.38*innerHeight/innerWidth);
  const angleUnit=2*field/pose.d;
  const rotation=new T.Quaternion().setFromEuler(new T.Euler(-pose.e,pose.a,0,'YXZ'));
  return {rotation,units:[field,field,pose.d,angleUnit/Math.cos(pose.e),angleUnit,2,2]};
}
function screenStep(from,to){
  const {rotation,units}=motionFrame(from);
  const shift=to.p.clone().sub(from.p).applyQuaternion(rotation.invert());
  const turn=Math.atan2(Math.sin(to.a-from.a),Math.cos(to.a-from.a));
  const delta=[shift.x,shift.y,shift.z,turn,to.e-from.e,Math.log(to.d/from.d),Math.log(to.s/from.s)];
  return delta.map((value,i)=>value/units[i]);
}
function cutTangent(index,u){
  const cue=shots[index],dt=u===0?.008:-.008,pose=cue.path(u);
  const next=cue.path(u+dt/cue.seconds);
  const velocity=screenStep(pose,next).map(step=>step/dt);
  return {pose,velocity,speed:Math.hypot(...velocity)};
}
function tangentCorrection(edge,direction){
  const {rotation,units}=motionFrame(edge.pose);
  const delta=edge.velocity.map((velocity,i)=>(direction[i]*edge.speed-velocity)*units[i]);
  const [x,y,z,a,e,d,s]=delta;
  return {p:V(x,y,z).applyQuaternion(rotation),a,e,d,s};
}
function motionPose(index,u){
  const cue=shots[index],pose=cue.path(u);
  const entry=u<.5,adjust=entry?cue.entryTangent:cue.exitTangent;
  const seconds=(entry?u:u-1)*cue.seconds;
  const phase=Math.abs(seconds)/Math.min(1.35,.24*cue.seconds);
  if(!adjust||phase>=1)return pose;
  // This Hermite tangent handle has zero displacement at the edit. It
  // rejoins the authored path with zero displacement, velocity and curvature offsets.
  const handle=seconds*(1-phase)**3*(1+3*phase);
  pose.p.addScaledVector(adjust.p,handle);
  pose.a+=adjust.a*handle;pose.e+=adjust.e*handle;
  pose.d*=Math.exp(adjust.d*handle);pose.s*=Math.exp(adjust.s*handle);
  return pose;
}
let motionAspect=0;
// Measure displacement in the projected image. A change in camera distance
// cancelled by a lens change should not count as a visible dolly.
const flowSamples=[];
for(const depth of [.72,1,1.40]){
  for(const x of [-.48,.48])for(const y of [-.24,.24])flowSamples.push([x,y,depth]);
}
function imageStep(from,to){
  const a=motionFrame(from),b=motionFrame(to);
  const eyeA=V(0,0,from.d).applyQuaternion(a.rotation).add(from.p);
  const eyeB=V(0,0,to.d).applyQuaternion(b.rotation).add(to.p);
  const inverse=b.rotation.invert();
  const offset=eyeA.sub(eyeB).applyQuaternion(inverse);
  const turn=inverse.multiply(a.rotation),point=V();
  let square=0;
  for(const [x,y,depth] of flowSamples){
    point.set(x*a.units[0]*depth,y*a.units[0]*depth,-from.d*depth).applyQuaternion(turn).add(offset);
    const project=to.d/(-point.z*b.units[0]);
    square+=(point.x*project-x)**2+(point.y*project-y)**2;
  }
  return Math.sqrt(square/flowSamples.length);
}
function prepareMotion(){
  for(let i=1;i<shots.length;i++){
    const left=cutTangent(i-1,1),right=cutTangent(i,0);
    let heading=left.velocity.map((v,k)=>v/left.speed+right.velocity[k]/right.speed);
    const length=Math.hypot(...heading);
    heading=length>1e-6?heading.map(x=>x/length):[0,0,0,0,0,0,-1];
    shots[i-1].exitTangent=tangentCorrection(left,heading);
    shots[i].entryTangent=tangentCorrection(right,heading);
  }
  for(const [i,cue] of shots.entries()){
    const arc=new Float64Array(193);
    let previous=motionPose(i,0);
    for(let k=1;k<arc.length;k++){
      const pose=motionPose(i,k/(arc.length-1));
      arc[k]=arc[k-1]+imageStep(previous,pose);
      previous=pose;
    }
    cue.arc=arc;
  }
  motionAspect=innerWidth/innerHeight;
}
function travelFraction(cue,seconds){
  if(!cue.slowdown)return seconds/cue.seconds;
  // Integrate one smooth change of speed at the reveal. Normalizing its
  // distance keeps both the original cut time and the final composition.
  const {from,to,endRate}=cue.slowdown,span=to-from;
  const u=clamp((seconds-from)/span,0,1);
  const blendArea=span*u**3*(1-.5*u)+Math.max(0,seconds-to);
  const fullArea=span*.5+cue.seconds-to;
  return (seconds-(1-endRate)*blendArea)/(cue.seconds-(1-endRate)*fullArea);
}
function shot(t){
  if(motionAspect!==innerWidth/innerHeight)prepareMotion();
  const found=shots.findIndex(cue=>t<cue.end);
  const i=found<0?shots.length-1:found,cue=shots[i];
  filmShotTime=cue.start;
  const seconds=clamp(t-cue.start,0,cue.seconds);
  const arc=cue.arc,distance=arc[arc.length-1]*travelFraction(cue,seconds);
  let lo=0,hi=arc.length-1;
  while(hi-lo>1){
    const mid=(lo+hi)>>1;
    if(arc[mid]<distance)lo=mid;else hi=mid;
  }
  const fraction=clamp((distance-arc[lo])/(arc[hi]-arc[lo]||1),0,1);
  apply(motionPose(i,(lo+fraction)/(arc.length-1)));
}
let fps=60,saved;window.videoExport={runs:['tour'],async begin(runId,opts={}){if(runId!=='tour')throw Error('Unknown tour');fps=Number(opts.fps)||60;if(!exporting)saved={state:snap(),time:elapsed,tween,tweenAge:tween?performance.now()-tween.start:0};exporting=true;if(gardenAudio?.state==='running')await gardenAudio.suspend();lastAudibleTime=null;tween=null;drag=null;hideMenu();document.querySelector('nav').hidden=true;shot(0);draw(0);renderer.getContext().finish();return{frames:Math.round(tourSeconds*fps)}},async frame(i){if(!exporting)throw Error('Call begin first');let t=clamp(i,0,Math.round(tourSeconds*fps)-1)/fps;shot(t);draw(t);renderer.getContext().finish()},end(){if(!exporting)return;exporting=false;if(gardenAudio?.state==='suspended')gardenAudio.resume().catch(()=>{});lastAudibleTime=null;apply(saved.state);tween=saved.tween;if(tween)tween.start=performance.now()-saved.tweenAge;elapsed=saved.time;t0=performance.now()-elapsed*1000;document.querySelector('nav').hidden=false;draw(elapsed)}};
function resize(){renderer.setSize(innerWidth,innerHeight,false);let sz=renderer.getDrawingBufferSize(new T.Vector2());const rasterScale=Math.min(1.5,Math.max(1,2560/sz.x));inkTarget.setSize(Math.round(sz.x*rasterScale),Math.round(sz.y*rasterScale));inkUniforms.pixel.value.set(.94/sz.x,.94/sz.y);backdrop();cam()}apply(params(0));updateUI();resize();cam();tick(0);preparePondReflection();addEventListener('resize',resize);
function loop(now){requestAnimationFrame(loop);if(exporting)return;elapsed=Math.max(0,(now-t0)/1000);if(tween){let u=clamp((now-tween.start)/1020,0,1),s=u*u*(3-2*u),a=tween.from,b=tween.to;apply({p:a.p.clone().lerp(b.p,s),a:a.a+(b.a-a.a)*s,e:a.e+(b.e-a.e)*s,s:a.s+(b.s-a.s)*s,d:a.d+(b.d-a.d)*s+Math.sin(Math.PI*s)*Math.min(3.4,a.p.distanceTo(b.p)*.28)});if(u===1)tween=null}draw(elapsed)}requestAnimationFrame(loop);
