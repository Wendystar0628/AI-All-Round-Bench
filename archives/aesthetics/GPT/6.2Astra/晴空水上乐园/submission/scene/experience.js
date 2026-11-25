'use strict';
// Conservative camera clearance field, built from the actual painted solids and flumes.
const fenceGrid={x:-183,z:-123,s:1.5,n:245,m:205};
const clearance=new Float32Array(fenceGrid.n*fenceGrid.m);
function clearRect(x,z,w,d,h){
 const g=fenceGrid,x0=clamp(Math.floor((x-w/2-g.x)/g.s),0,g.n-1),x1=clamp(Math.floor((x+w/2-g.x)/g.s),0,g.n-1),z0=clamp(Math.floor((z-d/2-g.z)/g.s),0,g.m-1),z1=clamp(Math.floor((z+d/2-g.z)/g.s),0,g.m-1);
 for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++)clearance[j*g.n+i]=Math.max(h,clearance[j*g.n+i]);
}
for(const b of batches.values()){if(b.k==='far'||b.k==='leaf')continue;for(let i=0;i<b.a.length;i+=7){const a=b.a;if(Math.abs(a[i])>178||a[i+2]<-122||a[i+2]>180)continue;clearRect(a[i],a[i+2],a[i+3],a[i+5],a[i+1]+a[i+4]/2)}}
for(const r of rides){for(let i=0;i<=r.path.n;i+=6){const p=r.path.p[i];clearRect(p.x,p.z,r.rx*2+.55,r.rx*2+.55,p.y+r.ry)}}
clearRect(-125,-68,23,15,33);clearRect(-72,-64,23,23,23.5);
function safeCamera(p){
 const offset=Math.abs(p.z-(-42+riverWarp(-45)));
 if(p.x>=-55&&p.x<=-35&&offset<=3.8){
  const ceiling=1.1+5.8*Math.sqrt(1-(offset/6.5)**2);
  if(p.y<ceiling-.72){p.y=Math.max(1.42,p.y);return}
 }
 const g=fenceGrid,ix=Math.floor((p.x-g.x)/g.s),iz=Math.floor((p.z-g.z)/g.s);let floor=Math.max(-1,terrainY(p.x,p.z)+1.1);
 if(ix>1&&iz>1&&ix<g.n-2&&iz<g.m-2){for(let a=-1;a<2;a++)for(let b=-1;b<2;b++)floor=Math.max(floor,clearance[(iz+a)*g.n+ix+b]+1.35)}
 if(p.y<floor)p.y=floor;
}
setupSpray();setupStreams();setupActors();flushBoxes();
const viewpoints=[
 ['全园鸟瞰',[0,12,-9],[81,98,265],95,620],
 ['入口大门与广场',[0,7.5,90],[2.5,9.5,52],16,100],
 ['造浪池与沙滩',[0,2,-2],[20,24,76],18,132],
 ['漂流河与瀑布帘',[-46,6.1,-43],[-21,10,24],9,70],
 ['晴空塔与滑道山',[-2,37.5,-86],[44,28,81],25,135],
 ['垂直高速滑道',[-6.3,58,-83.5],[-15.5,9.5,25],16,90],
 ['回环与双螺旋',[-22,31,-72],[-15,16,52],16,108],
 ['彩虹竞速滑道',[32,23,-69],[22,24,60],16,103],
 ['极限滑道区',[-104,23,-69],[-23,25,64],23,124],
 ['家庭滑道区',[79,20,-74],[36,21,54],18,105],
 ['飞潮水上过山车',[133,17,-41],[48,25,44],19,120],
 ['飞浪冲浪场',[95,3.5,1],[17,13,32],10,74],
 ['儿童戏水城堡',[-96,9,77],[21,13,39],12,88],
 ['活动池与浮板跳跳',[-92,3,7],[-14,15,34],11,81],
 ['暖泉花园与凉亭',[-95,3.4,-19],[12,14.5,31],10,80],
 ['海滨餐饮街',[99,6,78],[21,21,40],13,103],
 ['塔顶俯瞰',[0,4,29],[-3,74,-115],53,190],
 ['水晶隧道',[-43.6,2.9,-42+riverWarp(-45)],[18.0,1.55,.29],5.5,48],
 ['喷水拱门与码头',[86,3.8,46+riverWarp(86)],[-19,3.1,-.9],5.5,56]
];
let current=0,focus=vec(),azimuth=.2,elevation=.4,radius=300,wantedR=300,flight=null,exporting=false,activeTouch=null;
let normalTime=8.8,lastWall=performance.now(),selectedPos=new T.Vector2(),orbitVelocityX=0,orbitVelocityY=0;
const menu=document.getElementById('directory'),nav=document.getElementById('views'),places=document.getElementById('places'),pick=document.getElementById('pick');
function viewPose(i){const v=viewpoints[i],tar=vec(...v[1]),off=vec(...v[2]);if(i===0){const ratio=innerWidth/innerHeight,fit=clamp(1.65/ratio,.88,1.85);off.multiplyScalar(fit)}return {tar,pos:tar.clone().add(off)}}
function syncOrbit(){const d=camera.position.clone().sub(focus);radius=d.length();wantedR=radius;azimuth=Math.atan2(d.x,d.z);elevation=Math.asin(d.y/radius)}
function setMenu(open){menu.hidden=!open;pick.setAttribute('aria-expanded',String(open));if(open){const b=places.children[current];if(b)b.scrollIntoView({block:'nearest'})}}
function selectView(i,instant=false){
 current=(i+viewpoints.length)%viewpoints.length;const pose=viewPose(current);safeCamera(pose.pos);
 document.getElementById('index').textContent=String(current+1).padStart(2,'0')+' / '+viewpoints.length;document.getElementById('place-name').textContent=viewpoints[current][0];for(let j=0;j<places.children.length;j++)places.children[j].setAttribute('aria-selected',String(j===current));setMenu(false);orbitVelocityX=orbitVelocityY=0;
 if(instant){focus.copy(pose.tar);camera.position.copy(pose.pos);camera.lookAt(focus);flight=null;syncOrbit();return}
 const len=camera.position.distanceTo(pose.pos);flight={start:performance.now(),duration:clamp(800+len*2.6,840,1800),from:camera.position.clone(),fromTar:focus.clone(),...pose,arch:Math.min(40,len*.14)};
}
for(let i=0;i<viewpoints.length;i++){const b=document.createElement('button'),num=document.createElement('span');num.className='num';num.textContent=String(i+1).padStart(2,'0');b.append(num,document.createTextNode(viewpoints[i][0]));b.setAttribute('role','option');b.addEventListener('click',()=>selectView(i));places.appendChild(b)}
pick.onclick=()=>setMenu(menu.hidden);document.getElementById('close').onclick=()=>setMenu(false);document.getElementById('prev').onclick=()=>selectView(current-1);document.getElementById('next').onclick=()=>selectView(current+1);
document.addEventListener('pointerdown',e=>{if(!nav.contains(e.target))setMenu(false)});
window.addEventListener('keydown',e=>{if(exporting)return;if(e.key==='ArrowRight'||e.key===']'){e.preventDefault();selectView(current+1)}if(e.key==='ArrowLeft'||e.key==='['){e.preventDefault();selectView(current-1)}if(e.key==='Escape')setMenu(false);if(e.key==='Home'){e.preventDefault();selectView(0)}});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(exporting)return;flight=null;syncOrbit();activeTouch={id:e.pointerId,mode:e.button===2||e.button===1||e.shiftKey?'pan':'orbit'};selectedPos.set(e.clientX,e.clientY);orbitVelocityX=orbitVelocityY=0;canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!activeTouch||activeTouch.id!==e.pointerId||exporting)return;const dx=e.clientX-selectedPos.x,dy=e.clientY-selectedPos.y;selectedPos.set(e.clientX,e.clientY);
 if(activeTouch.mode==='orbit'){azimuth-=dx*.0055;elevation=clamp(elevation+dy*.0044,.09,1.37);orbitVelocityX=-dx*.00045;orbitVelocityY=dy*.00035}
 else{const s=radius*.00165,ax=Math.cos(azimuth),az=-Math.sin(azimuth);focus.x+=(-dx*ax+dy*Math.sin(azimuth))*s;focus.z+=(-dx*az+dy*Math.cos(azimuth))*s;
 const origin=vec(...viewpoints[current][1]),delta=focus.clone().sub(origin),max=current===0?75:Math.min(38,viewpoints[current][4]*.31);if(delta.length()>max)focus.copy(origin).add(delta.setLength(max))}
});
function up(e){if(activeTouch&&activeTouch.id===e.pointerId){activeTouch=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)}}
canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',e=>{e.preventDefault();if(exporting)return;if(flight){flight=null;syncOrbit()}const v=viewpoints[current];wantedR=clamp(wantedR*Math.exp(clamp(e.deltaY,-220,220)*.00165),v[3],v[4])},{passive:false});
function updateOrbit(dt){
 if(flight){const p=clamp((performance.now()-flight.start)/flight.duration,0,1),e=p*p*(3-2*p);camera.position.lerpVectors(flight.from,flight.pos,e);camera.position.y+=Math.sin(PI*e)*flight.arch;focus.lerpVectors(flight.fromTar,flight.tar,e);safeCamera(camera.position);camera.lookAt(focus);if(p>=1){flight=null;syncOrbit()}return}
 if(!activeTouch){const frame=Math.min(3,dt*60);azimuth+=orbitVelocityX*frame;elevation=clamp(elevation+orbitVelocityY*frame,.09,1.37);orbitVelocityX*=Math.exp(-dt*12);orbitVelocityY*=Math.exp(-dt*12)}
 radius=mix(radius,wantedR,1-Math.exp(-dt*12));const h=Math.cos(elevation)*radius;camera.position.set(focus.x+Math.sin(azimuth)*h,focus.y+Math.sin(elevation)*radius,focus.z+Math.cos(azimuth)*h);safeCamera(camera.position);camera.lookAt(focus);
}
function frameScene(t){clockTime.value=t;for(const fn of perFrame)fn(t);animateActors(t);sky.position.copy(camera.position);paintScene()}
function size(){const w=innerWidth,h=innerHeight;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75,3840/w,2160/h));renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=46;camera.updateProjectionMatrix();resizeFilm()}
window.addEventListener('resize',()=>{size();if(!exporting&&current===0&&!activeTouch)selectView(0,true)});
size();selectView(0,true);frameScene(normalTime);nav.hidden=false;
// Fifteen shots. Each camera is already travelling at the cut.
const shots=[
 {d:7,p:[[103,146,305],[62,121,272]],g:[[-5,18,-4],[-2,16,-8]]},
 {d:5,p:[[6,6.45,117],[3.8,6.45,82]],g:[[-3,6.5,60],[0,7.6,31]]},
 {d:6,p:[[-23,8.8,34],[-12,5.5,20]],g:[[1,3,-24],[3,3,-29]]},
 {d:6,p:[[-74,17,-16],[-54,15.5,-18]],g:[[-49,6.3,-43],[-40,6.2,-44]]},
 {d:5,p:[[-31,69,-49],[-29,27,-38]],g:[[-8,60,-84],[-21,4,-57]],launch:true},
 {d:7,p:[[71,39,-39],[53,17,-25]],g:[[22,36,-78],[50,4,-51]],race:true},
 {d:6,arc:[-27,29,-71,44,-.61,.27,14],g:[[-27,28,-71],[-23,31,-73]]},
 {d:7,p:[[-150,38,-35],[-123,37,-32]],g:[[-121,25,-73],[-98,24,-69]]},
 {d:6,p:[[162,38,-98],[158,32,-46]],g:[[113,25,-81],[140,18,-37]]},
 {d:9,p:[[-117,20.2,110],[-100,17.4,106]],g:[[-98,12,75],[-96,10.5,77]]},
 {d:5,p:[[-120,19,-1],[-104,18.5,30]],g:[[-94,3,-20],[-89,3,6]]},
 {d:4.5,p:[[117,14,25],[104,12,26]],g:[[96,3,-2],[92,3,-5]]},
 {d:5.5,p:[[55,14.1,84],[93.5,14.1,84]],g:[[78.5,6.4,66],[114.5,6.5,65.6]]},
 {d:5,p:[[-4,78,-78],[7,76,-68]],g:[[8,4,35],[18,4,42]]},
 {d:6,arc:[0,17,-4,296,.32,.17,105],g:[[-2,19,0],[-3,21,0]]}
];
const duration=shots.reduce((n,s)=>n+s.d,0);
function tourCamera(t){
 let start=0,shot=shots.at(-1);for(let s of shots){if(t<start+s.d){shot=s;break}start+=s.d}
 const u=clamp((t-start)/shot.d,0,1);
 if(shot.arc){const [cx,cy,cz,r,a,b,h]=shot.arc,theta=mix(a,b,u);camera.position.set(cx+r*Math.sin(theta),cy+h,cz+r*Math.cos(theta))}
 else camera.position.lerpVectors(vec(...shot.p[0]),vec(...shot.p[1]),u);
 const tar=vec(...shot.g[0]).lerp(vec(...shot.g[1]),u);
 if(shot.race||shot.launch){const r=shot.launch?launchRide:raceRuns[2],rider=new T.Object3D(),local=(t-r.depart)*r.tempo;
  seatOnTrack(r,clamp(local,0,r.total),rider);rider.position.y+=1.15;
  tar.lerp(rider.position,.66);
 }
 camera.lookAt(tar);
}
let saved=null,exportFps=60,tourFrames=0;
function renderExport(i){const t=i/exportFps;tourCamera(t);frameScene(t);renderer.getContext().finish()}
window.videoExport={
 runs:['tour'],
 async begin(runId,options={}){if(runId!=='tour')throw new RangeError('Unknown run');const fps=Number(options.fps??60);if(!Number.isFinite(fps)||fps<=0)throw new RangeError('fps must be positive');
 await cloudsReady;if(!exporting)saved={pos:camera.position.clone(),target:focus.clone(),time:normalTime,view:current};exporting=true;activeTouch=null;flight=null;orbitVelocityX=orbitVelocityY=0;exportFps=fps;tourFrames=Math.round(duration*fps);setMenu(false);nav.hidden=true;size();renderExport(0);return {frames:tourFrames}},
 async frame(i){if(!exporting)throw new Error('Call begin first');if(!Number.isInteger(i)||i<0||i>=tourFrames)throw new RangeError('Invalid frame');renderExport(i)},
 end(){if(!exporting)return;exporting=false;normalTime=saved.time;current=saved.view;camera.position.copy(saved.pos);focus.copy(saved.target);camera.lookAt(focus);syncOrbit();nav.hidden=false;lastWall=performance.now();frameScene(normalTime);saved=null}
};
function tick(now){requestAnimationFrame(tick);const dt=clamp((now-lastWall)/1000,0,.13);lastWall=now;if(exporting||document.hidden)return;normalTime+=Math.max(0,dt);updateOrbit(dt);frameScene(normalTime)}
lastWall=performance.now();requestAnimationFrame(tick);
