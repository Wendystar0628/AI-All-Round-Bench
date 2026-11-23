'use strict';
const camera = new T.PerspectiveCamera(37,1,.075,150);
const canvas=renderer.domElement, viewportHeight={value:innerHeight};
const home=()=>({center:vec(.05,-2.14,.52),theta:.75,phi:1.012,distance:54.1});
let orbit=home(), target=home(), mode=null, drag=null, showTime=0, dtClock=performance.now();
let requestedLens=37;
function resize(){
 const w=innerWidth,h=innerHeight;
 viewportHeight.value=h;
 if(canvas.width===w&&canvas.height===h)return;
 camera.aspect=w/h; setLens(requestedLens); camera.updateProjectionMatrix(); renderer.setPixelRatio(1); renderer.setSize(w,h,false);
}
window.addEventListener('resize',resize);
const sight=new T.Vector3(), sightDelta=new T.Vector3();
const cutPlanes=[new T.Plane(vec(1,0,0),-14),new T.Plane(vec(-1,0,0),-14),new T.Plane(vec(0,0,1),-14),new T.Plane(vec(0,0,-1),-14)];
const pierPlane=new T.Plane(vec(0,1,0),-.87);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{
 if(mode)return;
 drag={x:e.clientX,y:e.clientY,pan:e.button!==0||e.shiftKey};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(!drag||mode)return;
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
 if(drag.pan){
   const units=2*target.distance*Math.tan(camera.fov*PI/360)/innerHeight;
   const ux=vec(Math.cos(target.theta),0,-Math.sin(target.theta));
   const uy=vec(-Math.sin(target.theta)*Math.cos(target.phi),Math.sin(target.phi),-Math.cos(target.theta)*Math.cos(target.phi));
   target.center.addScaledVector(ux,-dx*units).addScaledVector(uy,dy*units);
   target.center.clamp(vec(-17,-6,-17),vec(17,10,17));
 }else{
   target.theta-=dx*.006;
   target.phi=clamp(target.phi-dy*.005,.25,1.61);
 }
 drag.x=e.clientX;drag.y=e.clientY;
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null});
canvas.addEventListener('wheel',e=>{
 e.preventDefault();if(mode)return;
 target.distance=clamp(target.distance*Math.exp(e.deltaY*.00106),2.0,92);
 if(e.deltaY<0){
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(e.clientX/innerWidth*2-1,1-e.clientY/innerHeight*2),camera);
  let point=ray.ray.intersectPlane(pierPlane,new T.Vector3());
  if(point&&(Math.abs(point.x)>14||Math.abs(point.z)>14))point=null;
  let near=point?ray.ray.origin.distanceToSquared(point):Infinity;
  for(const plane of cutPlanes){
   if(plane.normal.dot(ray.ray.direction)>=0)continue;
   const hit=ray.ray.intersectPlane(plane,new T.Vector3());
   if(!hit||hit.y>WAT||hit.y<-3.29||Math.abs(hit.x)>14.01||Math.abs(hit.z)>14.01)continue;
   const dist=ray.ray.origin.distanceToSquared(hit);
   if(dist>=near)continue;
   near=dist;
   point=hit.addScaledVector(ray.ray.direction,.82);
  }
  if(point)target.center.lerp(point,clamp(-e.deltaY*.00105,.028,.22));
 }
},{passive:false});
canvas.addEventListener('dblclick',()=>{if(!mode)target=home()});
const viewingFov=37;
function setLens(fov){
 requestedLens=fov;
 const minVertical=2*Math.atan(Math.tan(fov*PI/360)*1.39/Math.max(.62,camera.aspect))*180/PI;
 const fitted=Math.max(fov,minVertical);
 if(camera.fov===fitted)return;
 camera.fov=fitted;
 camera.updateProjectionMatrix();
}
function orbitCamera(){
 setLens(viewingFov);
 camera.position.setFromSpherical(new T.Spherical(orbit.distance,orbit.phi,orbit.theta)).add(orbit.center);
 camera.lookAt(orbit.center);
}

const cabinRainRoofs={value:boats.slice(0,3).map(b=>vec(b.g.position.y,b.wide,b.len))};
function makeRain(){
 const positions=[], data=[], stroke=[], indices=[];
 function addStreak(x,y,z,speed,opacity,length,ceiling){
  const a=positions.length/3;
  for(const end of [0,1])for(const side of [-1,1]){
   positions.push(x,y,z);data.push(end,speed,opacity,length);stroke.push(side,ceiling);
  }
  indices.push(a,a+1,a+2,a+1,a+3,a+2);
 }
 for(let i=0;i<2500;i++){
  const x=rr(-14,15),z=rr(-14,15),y=rr(0,15),speed=rr(1.82,4.72),op=rr(.29,1),len=rr(.117,.283);
  addStreak(x,y,z,speed,op,len,14);
 }
 for(let i=1;i<=380;i++){
  const x=-10.8+17.1*((i*.61803398875)%1),z=-3.8+17.5*((i*.7548776662)%1);
  const y=5.8*((i*.41421356237)%1),speed=2.18+1.7*((i*.569840296)%1);
  addStreak(x,y,z,speed,.31+.57*((i*.38196601125)%1),.094+.095*((i*.43846)%1),5.8);
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geo.setAttribute('properties',new T.Float32BufferAttribute(data,4));
 geo.setAttribute('stroke',new T.Float32BufferAttribute(stroke,2));
 geo.setIndex(indices);
 const material=new T.ShaderMaterial({
 uniforms:{t:renderTime,l:cloudLight,density:rainDensity,viewportHeight,boatPosition:waterPositions,boatRoof:cabinRainRoofs},
 transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true,
 vertexShader:`
 attribute vec4 properties; attribute vec2 stroke;
 uniform float t,l,density,viewportHeight;
 varying float opacity,warm,streakSide,streakAlong;
 uniform vec3 boatPosition[4],boatRoof[3];
 float footprint(vec2 p,vec2 halfSize){return 1.-smoothstep(-.06,.09,max(abs(p.x)-halfSize.x,abs(p.y)-halfSize.y));}
 void main(){
  float id=properties.z; vec3 p=position;
  float y=mod(p.y-t*properties.y,stroke.y);
  float lag=(14.-p.x)*.072+(p.z+10.)*.017;
  float a=mod(t,60.)-25.-lag;
  float g=smoothstep(0.,2.,a)*(1.-smoothstep(4.1,7.5,a));
  p.x+=(.22+g*.10)*(stroke.y-y)+sin(t*.41+p.z*.11)*.24;
  p.z+=.096*(stroke.y-y);
  p.y=y;
  vec3 rise=vec3(-.38-g*.48,1.,-.15)*properties.w;
  vec4 bottom=projectionMatrix*modelViewMatrix*vec4(p,1.);
  vec4 top=projectionMatrix*modelViewMatrix*vec4(p+rise,1.);
  p+=properties.x*rise;
  float land=max(step(p.x,-5.),max(step(p.x,5.)*step(p.z,-7.15),step(p.x,-.65)*step(7.15,p.z)));
  float jetty=footprint(p.xz-vec2(6.71,-10.21),vec2(1.71,.84));
  float fade=smoothstep(0.,3.7,min(14.4-abs(p.x),14.1-abs(p.z)))*(1.-smoothstep(7.,13.4,y));
  float humid=density+.04*sin(p.z*.47+p.x*.27+t*.33);
  float floorY=max(land*.99,jetty*.85);
  vec2 warehouse=p.xz-vec2(-9.7,-2.74), waiting=p.xz-vec2(-9.53,5.21);
  float whRoof=5.67-abs(warehouse.x)*.448;
  float wsRoof=4.39-abs(waiting.x)*.320;
  floorY=max(floorY,whRoof*footprint(warehouse,vec2(2.42,3.79)));
  floorY=max(floorY,wsRoof*footprint(waiting,vec2(1.88,2.79)));
  vec2 parasol=p.xz-vec2(-3.68,7.69);
  floorY=max(floorY,(1.88-.31*dot(parasol,parasol))*footprint(parasol,vec2(.60,.65)));
  for(int i=0;i<3;i++){
    vec2 a=p.xz-boatPosition[i].xy;
    vec2 dir=vec2(sin(boatPosition[i].z),cos(boatPosition[i].z));
    vec2 v=vec2(dot(a,vec2(dir.y,-dir.x)),dot(a,dir));
    vec3 hull=boatRoof[i];
    float plate=footprint(v+vec2(0.,.50*hull.z),vec2(.98*hull.y,1.025*hull.z));
    floorY=max(floorY,(hull.x+2.33*hull.y)*plate);
    if(i==1){
     float awning=footprint(v-vec2(0.,1.73*hull.z),vec2(.71*hull.y,.44*hull.z));
     floorY=max(floorY,(hull.x+1.50*hull.y)*awning);
    }
  }
  float silhouette=smoothstep(floorY-.06,floorY+.12,p.y);
  opacity=fade*id*mix(.78,.19,properties.x)*(.48+.52*l)*smoothstep(id*.73,id*.73+.12,humid)*silhouette;
  float slant=sin(p.x*.42+p.z*.29)*.27+sin(p.z*.52-p.y*.51)*.23;
  float shaft=exp(-abs(p.x-5.0-.42*p.z+.64*p.y)*.105);
  warm=smoothstep(.48,.98,shaft+slant)*l;
  vec4 clip=mix(bottom,top,properties.x);
  vec2 aspect=vec2(projectionMatrix[1][1]/projectionMatrix[0][0],1.);
  vec2 axis=(top.xy/max(top.w,.08)-bottom.xy/max(bottom.w,.08))*aspect;
  vec2 across=vec2(-axis.y,axis.x)/max(.000001,length(axis));
  float width=max(1.04,viewportHeight/1080.*(1.07+.69*id));
  width*=mix(1.12,.48,properties.x);
  clip.xy+=across/aspect*stroke.x*width*clip.w/viewportHeight;
  streakSide=stroke.x;streakAlong=properties.x;
  gl_Position=clip;
 }`,
 fragmentShader:`
  varying float opacity,warm,streakSide,streakAlong;
  void main(){
    float core=1.-smoothstep(.30,1.,abs(streakSide));
    float tip=smoothstep(0.,.165,streakAlong);
    gl_FragColor=vec4(mix(vec3(.76,.91,.90),vec3(1.,.926,.69),warm),opacity*core*tip);
  }`
 });
 const o=new T.Mesh(geo,material);o.frustumCulled=false;o.renderOrder=50;stage.add(o);
}
makeRain();
function suspendedSand(){
 const count=236,data=[],phases=[];
 for(let i=0;i<count;i++){
  const x=-4.79+18.57*((i*.61803398875)%1),z=-6.91+20.70*((i*.7548776662)%1);
  const y=-3.03+2.65*((i*.41421356237)%1);
  if(x<-.65&&z>7.15)continue;
  data.push(x,y,z);
  phases.push(i*.732,(i*.28143)%1);
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(data,3));
 g.setAttribute('phaseSize',new T.Float32BufferAttribute(phases,2));
 const mat=new T.ShaderMaterial({
  uniforms:{time:renderTime,sunlight:cloudLight,viewportHeight},
  transparent:true,depthWrite:false,
  vertexShader:`
   attribute vec2 phaseSize;uniform float time,sunlight,viewportHeight;
   varying float alpha;
   void main(){
    vec3 p=position;
    float s=phaseSize.x;
    p.x+=sin(time*.24+s)*.23;
    p.z+=cos(time*.21+s*1.12)*.14;
    p.y+=sin(time*.39+s*1.3)*.11;
    vec4 eye=modelViewMatrix*vec4(p,1.);
    float relation=1.-smoothstep(.90,4.85,cameraPosition.y);
    float shafts=sin(p.x*3.7+sin(p.z*2.+time*.69))+cos(p.z*3.9-time*.65);
    float lit=smoothstep(-.52,1.0,shafts);
    alpha=relation*(.11+.19*lit)*sunlight*(1.-smoothstep(3.,22.,-eye.z));
    gl_PointSize=clamp((5.4+phaseSize.y*5.8)/max(1.,-eye.z),.82,3.7)*viewportHeight/1080.;
    gl_Position=projectionMatrix*eye;
   }`,
  fragmentShader:`varying float alpha; void main(){
   float a=1.-smoothstep(.16,.51,length(gl_PointCoord-.5));
   gl_FragColor=vec4(.80,.99,.86,a*alpha);
  }`
 });
 const cloud=new T.Points(g,mat);
 cloud.renderOrder=4;stage.add(cloud);
}
suspendedSand();

function makeWaterMark(amount,foam=false){
 const data=new Float32Array(amount*3), fade=new Float32Array(amount);
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(data,3).setUsage(T.DynamicDrawUsage));
 geo.setAttribute('a',new T.BufferAttribute(fade,1).setUsage(T.DynamicDrawUsage));
 const material=new T.ShaderMaterial({
 transparent:true,depthWrite:false,
 uniforms:{c:{value:foam?vec(1,1,.88):vec(.79,.98,.91)}},
 vertexShader:'attribute float a; varying float op; void main(){op=a;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:'uniform vec3 c; varying float op;void main(){gl_FragColor=vec4(c,op);}'
 });
 const m=new T.LineSegments(geo,material);m.frustumCulled=false;m.renderOrder=16;stage.add(m);
 return {geo,data,fade};
}
function readMarks(mark){mark.geo.attributes.position.needsUpdate=true;mark.geo.attributes.a.needsUpdate=true}
for(let i=0;i<135;i++){
 const x=rr(-4.86,13.76),z=rr(-9.84,13.76);
 if((x<-.65&&z>7.14)||(x<5&&z<-7.15))continue;
 ripples.push({x,z,period:rr(1.8,4.7),phase:rr(0,6),scale:rr(.56,1.35)});
}
for(const p of puddles)for(let j=0;j<4;j++){
 const u=rr(-.64,.64),v=rr(-.61,.61),inside=Math.min(1,.65/Math.max(Math.hypot(u,v),.01));
 const x=u*p.a*inside,z=v*p.b*inside;
 const outline=p.footprint.attributes.position;
 let clearance=Infinity;
 for(let k=1;k<outline.count;k++){
  const next=k===outline.count-1?1:k+1;
  const ax=outline.getX(k),az=outline.getZ(k);
  const dx=outline.getX(next)-ax,dz=outline.getZ(next)-az;
  const f=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
  clearance=Math.min(clearance,Math.hypot(x-ax-dx*f,z-az-dz*f));
 }
 ripples.push({x:p.x+x,z:p.z+z,period:rr(2.2,4.7),phase:rr(0,6),scale:rr(.52,.87),limit:.93*clearance});
}
const dropMarks=makeWaterMark(ripples.length*28);
const dripMarks=makeWaterMark(beads.length*40,true);
const gullWaterMarks=makeWaterMark(4*32,true);
const foamMarks=makeWaterMark(shoreFoam.length*24);
const foamPearls=[];
for(const item of shoreFoam)for(let j=0;j<2;j++){
 const o=ball(item.x,.054,item.z,.04,.01,.017,alpha('#f4f5dd',.67),stage,false);
 o.renderOrder=17;
 foamPearls.push({o,item,phase:rr(0,TAU),drift:rr(.03,.21)});
}
const washSegments=13;
const shorelineWash=(()=>{
 const meters=[
  ...shoreFoam.map((p,i)=>({...p,angle:p.z<0?.23+.12*Math.sin(i*2):PI/2+.36*Math.sin(i*2),strength:.67})),
  ...[-5.5,-3.1,-.35,2.7,5.39].map((z,i)=>({x:-4.88,z,r:.56,phase:i*1.84,angle:PI/2,strength:.34})),
  ...[-3.6,-.8,1.48,3.86].map((x,i)=>({x,z:-7.05,r:.75,phase:i*1.39+.77,angle:0,strength:.32})),
  {x:outerPier.end+.035,z:-10.19,r:.59,phase:1.59,angle:-PI/2,strength:.79},
  {x:outerPier.end+.11,z:-10.74,r:.36,phase:3.43,angle:-PI/2,strength:.67}
 ];
 const geom=new T.BufferGeometry();
 const count=meters.length*(washSegments+1)*2;
 const pos=new T.BufferAttribute(new Float32Array(count*3),3).setUsage(T.DynamicDrawUsage);
 const strength=new T.BufferAttribute(new Float32Array(count),1).setUsage(T.DynamicDrawUsage);
 const uv=[],indices=[];
 for(let k=0;k<meters.length;k++)for(let j=0;j<=washSegments;j++){
  const i=(k*(washSegments+1)+j)*2;
  uv.push(j/washSegments,0,j/washSegments,1);
  if(j)indices.push(i-2,i-1,i,i,i-1,i+1);
 }
 geom.setAttribute('position',pos);
 geom.setAttribute('strength',strength);
 geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 geom.setIndex(indices);
 const shader=new T.ShaderMaterial({
  uniforms:{time:renderTime,light:cloudLight},
  transparent:true,depthWrite:false,side:T.DoubleSide,
  vertexShader:'attribute float strength;varying vec2 u;varying float v;void main(){u=uv;v=strength;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform float time,light;varying vec2 u;varying float v;
   void main(){
    float fringe=sin(u.x*75.+time*3.2)*.08+cos(u.x*29.-time*1.8)*.13;
    float line=1.-smoothstep(.10,.39,abs(u.y-.62+fringe));
    float trail=(1.-smoothstep(.12,.52,abs(u.y-.44)))*.44;
    float froth=smoothstep(-.58,.63,sin(u.x*20.3-time*1.71)+cos(u.x*53.+time*1.53)*.31);
    float taper=smoothstep(0.,.15,u.x)*(1.-smoothstep(.82,1.,u.x));
    gl_FragColor=vec4(.95,.99,.87,max(line*froth,trail)*taper*v*light);
   }`
 });
 const o=mesh(geom,shader,0,0,0,stage,false);o.frustumCulled=false;o.renderOrder=17;
 return {meters,pos,strength};
})();
function renderShorelineWash(t){
 const {meters,pos,strength}=shorelineWash;
 let i=0;
 for(const p of meters){
  const phase=t*.87+p.phase, rise=.5+.5*Math.sin(phase);
  const swell=wakeAt(p.x,p.z,t);
  const edge=.072+.09*rise+swell*.19;
  const ax=Math.cos(p.angle),az=Math.sin(p.angle);
  const width=p.r*(.78+.29*rise+Math.abs(swell)*.24);
  for(let j=0;j<=washSegments;j++){
   const u=j/washSegments,h=(u*2-1)*width,k=Math.sin(u*PI);
   const dist=edge+.067*Math.sin(u*8.4+phase)+.034*Math.cos(u*16.1-phase*.8);
   for(let row=0;row<2;row++){
    const cut=dist+(row===0?-.058:.119)*k;
    pos.setXYZ(i,p.x+ax*h-az*cut,.077+rise*.024+swell*.047,p.z+az*h+ax*cut);
    strength.setX(i++,p.strength*(.31+.45*rise+Math.abs(swell)*.57));
   }
  }
 }
 pos.needsUpdate=true;strength.needsUpdate=true;
}
function renderMarks(t){
 renderShorelineWash(t);
 drawGullWaterMarks(t);
 let q=0;
 for(const p of ripples){
  const f=((t+p.phase)%p.period)/p.period;
  const puddle=p.limit!==undefined;
  const radius=lerp(.030*p.scale,Math.min(p.limit??Infinity,(puddle?.275:.335)*p.scale),f);
  for(let j=0;j<28;j++){
   const angle=Math.floor(j/2)*TAU/14+(j%2)*.387+p.phase;
   const k=1+.066*Math.sin(angle*3+t);
   const x=p.x+Math.cos(angle)*radius*k,z=p.z+Math.sin(angle)*radius*k;
   dropMarks.data[3*q]=x;
   dropMarks.data[3*q+1]=puddle?SHORE+.024:waterHeight(x,z,t)+.025;
   dropMarks.data[3*q+2]=z;
   dropMarks.fade[q++]=Math.sin(PI*f)*(.59-.35*f)*(puddle?.72:.80)*(.39+.79*rainDensity.value);
  }
 }
 readMarks(dropMarks);
 q=0;
 for(const p of shoreFoam){
  const wave=wakeAt(p.x,p.z,t);
  const f=t*.77+p.phase;
  for(let j=0;j<24;j++){
   const a=Math.floor(j/2)*TAU/12+(j%2)*.365;
   const r=p.r*(.92+.15*Math.sin(a*3+f)+.085*Math.cos(a*4-f*.62)+Math.abs(wave)*.22);
   foamMarks.data[3*q]=p.x+Math.cos(a)*r;
   foamMarks.data[3*q+1]=.075+Math.sin(a*2+f)*.024;
   foamMarks.data[3*q+2]=p.z+Math.sin(a)*r*.65;
   foamMarks.fade[q++]=(.4+.39*Math.sin(f+a*2)**2)*(.71+.23*windPower.value+.32*Math.abs(wave));
  }
 }
 readMarks(foamMarks);
 for(const {o,item,phase,drift} of foamPearls){
   o.position.x=item.x+Math.sin(t*.88+phase)*item.r;
   o.position.z=item.z+Math.cos(t*.88+phase)*drift;
   o.material.opacity=(.39+.35*Math.sin(t+phase)**2)*cloudLight.value;
 }
}
function newBird(){
 const g=group(),body=group(0,0,0,g);
 ball(-.018,0,0,.223,.068,.078,'#f0ede0',body,false);
 ball(.099,.033,0,.126,.073,.060,'#f4f1e3',body,false);
 ball(.152,.078,0,.072,.064,.056,'#f7f2e2',body,false);
 const beak=cyl(.232,.057,0,.006,.024,.102,'#d2a461',body,7,false);beak.rotation.z=-PI/2;
 beam([.194,.047,0],[.26,.044,0],.005,'#977a52',body,5,false);
 for(const side of [-1,1]){
  ball(.179,.091,side*.048,.011,.012,.010,'#3b4f49',body,false);
  ball(.183,.095,side*.056,.003,.003,.003,'#eee9d5',body,false);
 }
 const wings=[];
 for(const s of [-1,1]){
  const p=group(-.012,.036,s*.032,body);
  function feather(verts,ix,color){
   const geo=new T.BufferGeometry();
   geo.setAttribute('position',new T.Float32BufferAttribute(verts.flatMap(([x,y,z])=>[x,y,s*z]),3));geo.setIndex(ix);geo.computeVertexNormals();
   const f=mat(color).clone();f.side=T.DoubleSide;return mesh(geo,f,0,0,0,p,false);
  }
  feather([[.082,0,0],[.094,.045,.18],[.06,.068,.31],[-.036,.048,.465],[-.216,.005,.37],[-.229,-.016,.13],[-.144,-.018,0]], [0,1,5,0,5,6,1,2,4,1,4,5,2,3,4],'#edede1');
  feather([[-.036,.048,.465],[-.154,.036,.562],[-.268,.019,.445],[-.216,.006,.37],[.009,.067,.400]], [0,1,2,0,2,3,4,0,3],'#6b807d');
  wings.push(p);
 }
 const tail=ico(-.224,.018,0,.096,.019,.076,'#b9c5bc',body,1,false);tail.rotation.z=.12;
 const legs=[];
 for(const s of [-1,1]){
  const l=group(.003,-.057,s*.034,body);
  beam([0,0,0],[0,-.065,0],.011,'#ad8756',l,6,false);
  beam([0,-.066,0],[.06,-.068,0],.009,'#ad8756',l,5,false);
  legs.push(l);
 }
 return {g,wings,legs,body};
}
const gulls=Array.from({length:6},(_,i)=>{
 const bird=newBird();bird.g.scale.setScalar([1,.88,.93,.82,1.13,.92][i]);return bird;
});
const resting=vec(-1.01,1.50,10.27);
const gullWaterPhase=22.8, gullTouch=29.46, gullLift=35;
function gullWaterX(t){return 8.4+.095*Math.sin(t*.72);}
function gullWaterZ(t){return 3.5+.12*Math.sin(t*.57+.94);}
function drawGullWaterMarks(t){
 const phase=(t+gullWaterPhase)%60, response=gulls[3].response;
 const eventAge=t-(response?.time??-1000);
 const reacted=!mode&&response?.water&&eventAge>=0&&eventAge<8;
 const moments=[[gullTouch-.15,1.82,.72],[gullTouch+.28,1.49,.38],[gullLift+.035,1.42,.57]];
 gullWaterMarks.fade.fill(0);
 for(let i=0;i<4;i++){
  const [start,duration,power]=moments[i]??[phase-eventAge,1.43,.61];
  const age=phase-start,f=age/duration;
  if(f<=0||f>=1||(i===2&&reacted)||(i===3&&!reacted))continue;
  const x0=i===3?response.origin.x:gullWaterX(t-age);
  const z0=i===3?response.origin.z:gullWaterZ(t-age);
  const radius=.052+f*.56, strength=power*smooth(0,.09,f)*(1-smooth(.25,1,f))*cloudLight.value;
  for(let j=0;j<32;j++){
   const a=Math.floor(j/2)*TAU/16+(j%2)*.344, k=1+.07*Math.cos(a*3+f);
   const x=x0+Math.cos(a)*radius*k-.068*f,z=z0+Math.sin(a)*radius*.72*k;
   const n=i*32+j;
   gullWaterMarks.data[3*n]=x;
   gullWaterMarks.data[3*n+1]=waterHeight(x,z,t)+.030;
   gullWaterMarks.data[3*n+2]=z;
   gullWaterMarks.fade[n]=strength*(.81+.19*Math.sin(a*3+i));
  }
 }
 readMarks(gullWaterMarks);
}
function turnHeading(a,b,t){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t}
function notice(state,position,t,radius,eligible=true){
 if(mode)return false;
 sightDelta.copy(position).sub(camera.position);
 const d=sightDelta.length();
 const cursor=sightDelta.dot(sight)/Math.max(d,1e-5);
 if(!eligible||d>radius*1.18||cursor<.78)state.near=false;
 if(!eligible||state.near||d>=radius||cursor<.89)return false;
 state.near=true;state.time=t;
 return true;
}
function pulse(state,t,length){
 const age=t-(state.time??-1000);
 return smooth(0,.29,age)*(1-smooth(length*.37,length,age));
}
const catAttention={}, fishAttention=[{},{}], schoolPoints=[vec(6.6,-2.3,10.8),vec(9.5,-2.3,5.55)];
function flyGulls(t){
 for(let i=0;i<gulls.length;i++){
  const b=gulls[i],p=(t+(i===3?gullWaterPhase:i?i*7.6:1))%60;
  const circle=t*(.23+i*.009)+1.32*i;
  let x=1.55+(8.0-i*.23)*Math.cos(circle),z=.99+7.3*Math.sin(circle),y=5.7+Math.sin(circle*1.4+i)*.97, bank=.16*Math.sin(circle), flap=.11, fold=0, perched=false;
  let heading=-Math.atan2(7.3*Math.cos(circle),-(8-i*.23)*Math.sin(circle)), floating=false;
  const freeX=x,freeY=y,freeZ=z,freeHeading=heading;
  const glide=smooth(.10,.72,Math.sin(t*.71+i*1.88));
  flap+=glide*.66*Math.sin(t*(7.48+i*.4)+i);
  if(i===0&&p>52){
   const settle=smooth(52,60,p);
   x=lerp(x,resting.x,settle);y=lerp(y,resting.y,settle);z=lerp(z,resting.z,settle);
   bank*=1-settle;heading=turnHeading(heading,-.91,settle);
   flap=Math.sin(t*10.3)*(.7-.33*settle);
   fold=smooth(.83,.998,settle);perched=settle>.99;
  }
  if(i===0 && p<16){
   const rise=smooth(8.47,14.5,p);
   if(!rise && p<8.48){
    x=resting.x;z=resting.z;y=resting.y;heading=-.91;bank=0;fold=1;perched=true;

   }else{
    const v=smooth(8.47,15,p);
    x=lerp(resting.x,x,v);z=lerp(resting.z,z,v);y=lerp(resting.y,y,rise);heading=turnHeading(-.91,heading,v);
    flap=Math.sin(t*11.2)*(.78-v*.34);fold=1-smooth(8.47,8.91,p);bank*=v;
   }
  }
  if(i===2&&p>21&&p<34){
   const f=smooth(21,26,p)*(1-smooth(31,34,p));
   const rail=boatB.g.localToWorld(vec(.88,1.24,-1.81));
   x=lerp(x,rail.x,f);z=lerp(z,rail.z,f);y=lerp(y,rail.y,f);bank*=1-f;
   fold=smooth(.86,.999,f);
   perched=f>.997;if(perched)heading=.53;
  }
  if(i===4){
   const q=t%60;
   const pass=smooth(11.8,13.65,q)*(1-smooth(15.8,18.5,q));
   const travel=smooth(12.5,16.8,q);
   x=lerp(x,lerp(-7.25,-10.05,travel),pass);
   z=lerp(z,lerp(8.68,8.20,travel),pass);
   y=lerp(y,2.12+.12*Math.sin(travel*PI),pass);
   heading=turnHeading(heading,2.97,pass);bank=lerp(bank,-.12,pass);
  }
  if(i===3&&p>24&&p<39){
   const f=smooth(24,gullTouch,p)*(1-smooth(gullLift,39,p));
   const sx=gullWaterX(t),sz=gullWaterZ(t);
   x=lerp(x,sx,f);z=lerp(z,sz,f);y=lerp(y,waterHeight(sx,sz,t)+.056,f);bank*=1-f;
   fold=smooth(.86,.999,f);
   floating=f>.994;perched=f>.998;
   heading=turnHeading(heading,-.21+.11*Math.sin(t*.53),smooth(.79,1,f));
  }
  if(!mode){
   const response=b.response??={};
   if(notice(response,vec(x,y,z),t,5.25,perched)){
    const away=vec(x-camera.position.x,0,z-camera.position.z).normalize();
    response.origin=vec(x,y,z);response.away=away;response.water=floating;
   }
   const age=t-(response.time??-1000);
   if(age>=0&&age<9&&response.origin){
    const blendOut=1-smooth(5.9,9,age);
    const arc=smooth(.33,2.96,age), lift=smooth(0,1.09,age), run=smooth(0,1.48,age);
    const liftOff=response.origin.clone().addScaledVector(response.away,run*2.7);
    liftOff.y+=lift*2.47;
    x=lerp(x,lerp(liftOff.x,freeX,arc),blendOut);
    y=lerp(y,lerp(liftOff.y,freeY,arc),blendOut);
    z=lerp(z,lerp(liftOff.z,freeZ,arc),blendOut);
    heading=turnHeading(-Math.atan2(response.away.z,response.away.x),freeHeading,arc);
    perched=age<.045;floating=age<.11&&response.water;fold*=1-blendOut*smooth(0,.29,age);
    flap=lerp(.76*Math.sin(age*13),flap,arc);bank+=Math.sin(age*4)*.13*blendOut;
   }
  }
  b.g.position.set(x,y,z);b.g.rotation.set(bank,heading,perched?.021:Math.sin(t*.7+i)*.08,'YXZ');
  b.wings.forEach((w,j)=>{
   const s=j?1:-1;
   w.rotation.x=lerp(flap,.50,fold)*s;
   w.rotation.y=lerp(.07*(1+Math.sin(t+i)),1.24,fold)*-s;
   w.scale.z=lerp(1,.51,fold);
  });
  b.legs.forEach(l=>{l.rotation.z=lerp(-1.3,floating?-1.54:0,fold)});
 }
}
function makeRainbow(){
 const o=group(2.1,1.72,-11.55);o.rotation.set(.045,.44,-.09);
 const bands=['#f5a691','#f4c094','#f7df9c','#cfdfb0','#a7d8c9','#9bced9','#b4b9db'];
 const ms=[];
 for(let b=0;b<7;b++){
  const p=[],ids=[],r=9.24+b*.105;
  for(let i=0;i<=100;i++){
   const a=PI*(.118+i/100*.744);
   for(let j=0;j<2;j++)p.push(Math.cos(a)*(r+j*.108),Math.sin(a)*(r+j*.108)-2.08,0);
   if(i){const q=i*2;ids.push(q,q-1,q-2,q,q+1,q-1)}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(ids);
  const m=alpha(bands[b],0);
  const arc=mesh(g,m,0,0,0,o,false);arc.renderOrder=30;ms.push(m);
 }
 return {o,ms};
}
const rainbow=makeRainbow();
const mistArt=canvasMat(256,64,(c,w,h)=>{
 const q=c.createRadialGradient(w/2,h/2,.5,w/2,h/2,h*.47);
 q.addColorStop(0,'#e3f5ee95');q.addColorStop(1,'#e4f5ed00');
 c.save();c.translate(w/2,0);c.scale(3.9,1);c.translate(-w/2,0);c.fillStyle=q;c.fillRect(w*.36,0,w*.28,h);c.restore();
},false,true);
const skyBrush=canvasMat(576,144,(c,w,h)=>{
 for(let i=0;i<33;i++){
  const x=rr(w*.10,w*.92),y=rr(h*.20,h*.79);
  c.save();c.translate(x,y);c.scale(rr(2.6,7.3),rr(.34,.74));
  const radius=rr(12,42);
  const fill=c.createRadialGradient(0,0,0,0,0,radius);
  fill.addColorStop(0,i<8?'#abc9c55c':'#fffdf4bf');
  fill.addColorStop(.42,i<8?'#bcdbd042':'#fffdf4a7');
  fill.addColorStop(1,'#fffdf400');
  c.fillStyle=fill;c.fillRect(-radius,-radius,2*radius,2*radius);
  c.restore();
 }
},false,true);
skyBrush.alphaTest=0;
const skyPlumes=[
 [-26,10,-12,17,2.4,.18],[-22,17,-28,26,3.8,.24],[-1,13,-29,21,3.0,.26],
 [12,12,-29,22,3.8,.24],[-36,12,0,14,2.8,.11]
].map(([x,y,z,w,h,o],i)=>{
 const p=plane(x,y,z,w,h,skyBrush.clone());
 p.material.opacity=o;p.renderOrder=-10;
 return {p,x,y,z,o,phase:i*1.43};
});
const mists=[];
for(let i=0;i<6;i++){
 const q=plane(2+i*2.09,.35+(i%2)*.32,-13.36,5.35,1.07,mistArt.clone());
 q.material.opacity=.47;q.renderOrder=11;mists.push(q);
}
for(const d of beads){
 const n=Math.sin(d.phase*54.173+d.x*12.79+d.z*27.1)*7162.18;
 d.interval=3.06+(n-Math.floor(n))*2.21;
 d.o=ball(0,0,0,.018,.031,.019,alpha('#fff4cc',.79),stage,false);d.o.renderOrder=28;
}

const sailPoints=[
 [2.18,0,-2.88],[3.67,0,-3.10],[5.62,0,-4.15],[8.72,0,-4.83],
 [10.17,0,-5.86],[10.423,0,-8.205],[10.402,0,-9.852],[10.502,0,-10.274],
 [10.717,0,-10.644],[11.012,0,-10.938],[11.345,0,-11.045],
 [11.667,0,-10.938],[11.920,0,-10.644],[12.075,0,-10.274],
 [12.114,0,-9.852],[12.06,0,-7.750],[12.26,0,-2.14],
 [10.95,0,.91],[8.37,0,2.02],[5.31,0,1.31],[3.11,0,-.20],[2.18,0,-2.88]
];
const sailing=new T.CatmullRomCurve3(sailPoints.map(p=>vec(...p)),false,'centripetal');
const wakeRows=72, wakeCols=12, wakeDuration=3.64;
const wakeRibbon=(()=>{
 const points=new Float32Array(wakeRows*(wakeCols+1)*3), power=new Float32Array(wakeRows*(wakeCols+1)),coords=[],ids=[];
 const geo=new T.BufferGeometry();
 for(let i=0;i<wakeRows;i++)for(let j=0;j<=wakeCols;j++){
  coords.push(j/wakeCols,i/(wakeRows-1));
  if(i&&j){const a=i*(wakeCols+1)+j,b=a-wakeCols-1;ids.push(a,b-1,b,a,a-1,b-1)}
 }
 geo.setAttribute('position',new T.BufferAttribute(points,3).setUsage(T.DynamicDrawUsage));
 geo.setAttribute('uv',new T.Float32BufferAttribute(coords,2));
 geo.setAttribute('crest',new T.BufferAttribute(power,1).setUsage(T.DynamicDrawUsage));
 geo.setIndex(ids);
 const m=new T.ShaderMaterial({
  uniforms:{time:renderTime,light:cloudLight},transparent:true,depthWrite:false,side:T.DoubleSide,
  vertexShader:`attribute float crest;varying vec2 u;varying vec2 wp;varying float strength;
   void main(){u=uv;wp=position.xz;strength=crest;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
  `,
  fragmentShader:`varying vec2 u;varying vec2 wp;varying float strength;uniform float time,light;
  void main(){

   if(max(abs(wp.x),abs(wp.y))>14.)discard;
   float age=u.y,x=abs(2.*u.x-1.);
   float bubble=sin(wp.x*61.+sin(wp.y*21.+time*.72)*.87)*cos(wp.y*48.+wp.x*7.-time*.80);
   float lobe=sin(wp.x*11.-wp.y*7.+time*.49)+.28*sin(wp.y*22.+wp.x*17.);
   float crest=1.-smoothstep(.050,.17,abs(x-.74+sin(age*30.-time*1.9)*.07+sin(age*72.)*.045));
   float broken=smoothstep(-.72,.69,lobe);
   float edgeGloss=crest*(.23+.72*broken)*(.79+.21*bubble);
   float churn=(1.-smoothstep(.10,.48,x))*smoothstep(-.52,.78,.50*bubble+.46*lobe)*(.87-age*.55);
   float fade=(1.-smoothstep(.24,1.,age))*smoothstep(0.,.08,age);
   float opacity=max(edgeGloss,churn)*fade*strength*light;
   gl_FragColor=vec4(mix(vec3(.66,.91,.83),vec3(1.,.99,.88),max(crest,churn)),opacity);
  }`
 });
 const o=mesh(geo,m,0,0,0,stage,false);o.frustumCulled=false;o.renderOrder=15;
 return {points,power,geo,o};
})();
const farWake=makeWaterMark(28,true);
const farBoat=group(7,0,-13.81);
farBoat.rotation.y=-PI/2;farBoat.scale.setScalar(.168);
const smallHull=[[-2.7,0,.37],[-2.3,.58,.2],[-1.5,.91,.08],[.5,.93,0],[1.6,.87,.03],[2.4,.69,.06]];
hullShape(smallHull,[[.57,-.38,.25],[1,-.04,.69],[1.02,.54,1]],'#e4e4d3',farBoat);
deckShape(smallHull,'#abbeb3',farBoat);
box(-.03,.89,-.47,1.32,.81,1.63,'#cbd6c9',farBoat);
box(-.03,1.315,-.47,1.45,.137,1.80,'#7d9c94',farBoat);
box(-.74,.98,-.47,.045,.35,1.48,'#749796',farBoat);
beam([0,1.29,-.63],[0,3.21,-.70],.061,'#789890',farBoat,7,false);
beam([-.38,2.33,-.68],[.38,2.33,-.68],.034,'#7f9b92',farBoat,7,false);
box(0,3.11,-.68,.42,.13,.24,'#b0c4b5',farBoat);
const distantPaint=new Map();
farBoat.traverse(o=>{
 if(!o.isMesh)return;
 if(!distantPaint.has(o.material)){
  const fogged=o.material.clone();
  fogged.color.lerp(new T.Color('#a6c5bf'),.38);
  fogged.transparent=true;
  distantPaint.set(o.material,fogged);
 }
 o.material=distantPaint.get(o.material);
});
const puddleLevel=1.053;
const mirrorCamera=new T.PerspectiveCamera();
const mirrorRay=new T.Vector3(), mirrorUp=new T.Vector3();
function createMirror(y,layer,height,matrix=new T.Matrix4()){
 const target=new T.WebGLRenderTarget(1,1,{minFilter:T.LinearFilter,magFilter:T.LinearFilter});
 return {y,layer,height,matrix,target,clip:[new T.Plane(vec(0,1,0),-y-.014)]};
}
const puddleMirror=createMirror(puddleLevel,1,352);
const seaMirror=createMirror(WAT,2,384,harborProjection.value);
harborReflection.value=seaMirror.target.texture;
function addToMirror(layer,roots){
 for(const root of roots)root.traverse(o=>{
  if((o.isMesh||o.isLine)&&!o.material.isShaderMaterial&&o.renderOrder<13)o.layers.enable(layer);
 });
}
const mirrorSubjects=[...lamps,...boats.map(b=>b.g),...gulls.map(b=>b.g),waiting];
addToMirror(1,[...mirrorSubjects,umbrella]);
addToMirror(2,[...mirrorSubjects,warehouse,tower,windsock,crane,outerWall,farBoat]);
function drawMirror(mirror){
 camera.getWorldDirection(mirrorRay);mirrorRay.y*=-1;
 mirrorUp.set(0,1,0).applyQuaternion(camera.quaternion);mirrorUp.y*=-1;
 mirrorCamera.up.copy(mirrorUp).negate();
 mirrorCamera.position.copy(camera.position);
 mirrorCamera.position.y=2*mirror.y-camera.position.y;
 mirrorCamera.lookAt(mirrorRay.add(mirrorCamera.position));
 mirrorCamera.aspect=camera.aspect;
 mirrorCamera.fov=camera.fov;
 mirrorCamera.layers.set(mirror.layer);
 mirrorCamera.updateProjectionMatrix();
 mirrorCamera.updateMatrixWorld();
 mirror.matrix.multiplyMatrices(mirrorCamera.projectionMatrix,mirrorCamera.matrixWorldInverse);
 const width=Math.round(mirror.height*camera.aspect);
 if(mirror.target.width!==width)mirror.target.setSize(width,mirror.height);
 renderer.clippingPlanes=mirror.clip;
 renderer.setRenderTarget(mirror.target);
 renderer.render(scene,mirrorCamera);
}
function updateMirrors(){
 const puddlesVisible=camera.position.y>puddleLevel;
 puddleReflection.uniforms.cover.value=Number(puddlesVisible);
 if(camera.position.y<=WAT)return;
 camera.updateMatrixWorld();
 renderer.shadowMap.enabled=false;
 drawMirror(seaMirror);
 if(puddlesVisible)drawMirror(puddleMirror);
 renderer.setRenderTarget(null);
 renderer.shadowMap.enabled=true;
 renderer.clippingPlanes=[];
}
const puddleReflection=new T.ShaderMaterial({
 uniforms:{t:renderTime,l:cloudLight,overcast:cloudPass,cloudBand,reflection:{value:puddleMirror.target.texture},mapping:{value:puddleMirror.matrix},cover:{value:1}},
 transparent:true,depthWrite:false,
 vertexShader:`
 attribute float puddleDepth; varying float wetInterior;
 varying vec4 reflected; varying vec3 wp; uniform mat4 mapping;
 void main(){
  wetInterior=puddleDepth;
  vec4 p=modelMatrix*vec4(position,1.);
  wp=p.xyz;
  reflected=mapping*p;
  gl_Position=projectionMatrix*viewMatrix*p;
 }`,
 fragmentShader:`
 varying float wetInterior; varying vec4 reflected; varying vec3 wp;
 uniform float t,l,overcast,cover; uniform sampler2D reflection;
 ${sunlightField}
 void main(){
  float light=l*cloudTransmission(wp.xz,overcast);
  float mask=smoothstep(.015,.19,wetInterior);
  float rim=smoothstep(.012,.045,wetInterior)*(1.-smoothstep(.052,.13,wetInterior));
  vec2 uv=reflected.xy/reflected.w*.5+.5;
  uv+=vec2(.0032*sin(wp.z*31.+t*3.)+.0018*cos(wp.x*42.-t*2.),.0016*sin(wp.x*15.-t*2.));
  vec4 colors=texture2D(reflection,uv);
  float edge=smoothstep(.005,.025,min(uv.x,uv.y))*smoothstep(.005,.025,1.-max(uv.x,uv.y));
  float fresnel=1.-clamp(dot(normalize(cameraPosition-wp),vec3(0.,1.,0.)),0.,1.);
  float luminance=dot(colors.rgb,vec3(.2126,.7152,.0722));
  float band=floor(sqrt(clamp(luminance,0.,1.))*7.)/7.;
  vec3 picture=mix(vec3(.34,.54,.52),vec3(.91,.97,.91),band);
  float drift=sin(wp.x*5.+wp.z*7.5)*cos(wp.z*12.-wp.x*3.7+t*.33);
  float sheen=smoothstep(-.30,.64,drift)*(.024+.11*rim)*light;
  float a=colors.a*edge*(.35+.50*fresnel)*light;
  float film=clamp(mask*(a+sheen)+rim*.075*light,0.,.94);
  gl_FragColor=vec4(mix(picture,vec3(.87,.95,.88),rim*.34),film*cover);
 }`});
for(const p of puddles)if(p.reflection){
 const geo=p.footprint.clone();
 const depth=new Float32Array(geo.attributes.position.count);depth[0]=1;
 geo.setAttribute('puddleDepth',new T.BufferAttribute(depth,1));
 const reflection=mesh(geo,puddleReflection,p.x,SHORE+.019,p.z,stage,false);
 reflection.renderOrder=14;
}
const catPaths=[
 [[-3.46,13.105],[-3.34,11.43],[-3.84,10.97],[-4.44,10.39],[-5.39,9.80],[-5.55,8.88],[-4.87,8.35],[-4.29,8.94],[-4.20,10.01],[-4.14,11.18],[-3.46,13.105]],
 [[-3.46,13.105],[-2.92,11.87],[-2.60,10.89],[-2.79,10.37],[-3.33,10.1],[-4.31,9.81],[-5.30,10.31],[-5.46,11.21],[-4.72,11.75],[-3.46,13.105]],
 [[-3.46,13.105],[-4.37,11.63],[-4.86,10.93],[-5.55,10.47],[-6.42,10.29],[-6.88,9.20],[-6.20,8.07],[-5.69,8.45],[-5.60,9.72],[-4.89,10.98],[-3.46,13.105]]
].map(route=>new T.CatmullRomCurve3(route.map(([x,z])=>vec(x,1.06,z))));
function catMove(t){
 const cycle=Math.floor(t/60),q=t%60;
 const f=smooth(20.75,28.20,q)*.43+smooth(28.8,34.9,q)*.24+smooth(34.1,38.5,q)*.33;
 const moving=f>0&&f<.99998;
 const route=catPaths[cycle%catPaths.length];
 const p=moving?route.getPointAt(f):catHide;
 cat.position.copy(p);
 cat.rotation.y=moving?-Math.atan2(route.getTangentAt(f).z,route.getTangentAt(f).x):-.92;
 const wake=smooth(17,18.3,q)*(1-smooth(20.3,21.1,q));
 if(!mode)notice(catAttention,cat.position,t,4.55,!moving);
 const attention=mode?wake:Math.max(wake,pulse(catAttention,t,2.9));
 const crouch=moving?0:1-attention*.43;
 catBody.scale.set(1,1-crouch*.54,1);
 catBody.position.y=moving?.022*Math.abs(Math.sin(t*14)):-.028;
 catHead.position.set(.247,.234-crouch*.112+(moving?Math.sin(t*17)*.020:0),.028);
 const delta=camera.position.clone().sub(cat.position);
 catHead.rotation.y=moving?.16*Math.sin(t*2.05):clamp(-Math.atan2(delta.z,delta.x)-cat.rotation.y,-.75,.8)*attention;
 catHead.rotation.z=.24*attention;
 const gait=t*16.2;
 catLegs.forEach((g,i)=>{
   const step=gait+[0,PI,PI*.82,PI*1.82][i];
   g.rotation.z=moving?Math.cos(step)*.37:1.1*crouch*(i<2?-1:1);
   g.position.y=.174+(moving?.041*Math.max(0,Math.sin(step)):0);
 });
 const blinkClock=(t+.43)%4.82;
 const blink=smooth(2.70,2.79,blinkClock)*(1-smooth(2.82,2.99,blinkClock));
 catEyes.forEach(e=>{e.scale.y=1-.92*blink});
 catEars.forEach((e,i)=>{
   e.rotation.x=(i===0?.17:-.17)+.035*Math.sin(t*1.6+i*2)+.13*Math.sin(t*5.7+i)*smooth(.76,.99,Math.sin(t*.91+i*2.1));
 });
 catTail.rotation.y=Math.sin(t*1.7)*(.13+(moving?.34:.03));
 catTail.rotation.z=moving?-.17+.16*Math.sin(t*3):.05*Math.sin(t*2.3);
}
function shoals(t){
 const q=t%60;
 if(!mode)fishAttention.forEach((a,i)=>notice(a,schoolPoints[i],t,8.2));
 const pressure=fishAttention.map((a,i)=>1.38*(mode?
   smooth(44.58+i*.32,45.48+i*.40,q)*(1-smooth(46.85+i*.20,49.12,q)):pulse(a,t,4.3)));
 for(const f of fish){
  const p=t*(f.school?.26:.33)+f.school*PI*.8, a=pressure[f.school];
  const center=schoolPoints[f.school], spread=1+a;
  f.g.position.set(center.x+Math.cos(p)*2.16+f.dx*spread,center.y+Math.sin(p*1.15)*.3+f.dy*spread+Math.sin(t*1.6+f.phase)*.065,center.z+Math.sin(p)*1.02+f.dz*spread);
  f.g.rotation.y=-Math.atan2(Math.cos(p)*1.02,-Math.sin(p)*2.16)+(.11+.26*a)*Math.sin(t*2.8+f.phase);
  f.tail.rotation.y=(.61+.14*a)*Math.sin(t*9+f.phase+.85*a);
 }
}
const ropeSides=7, ropeLength=10;
function mooringGeometry(m,a,b,sag,start,end){
 const geo=m.geometry, row=ropeSides+1;
 if(!geo.attributes.position){
  const total=(ropeLength+1)*row;
  const uv=[],iv=[];
  for(let i=0;i<=ropeLength;i++)for(let j=0;j<=ropeSides;j++){
   uv.push(i/ropeLength,j/ropeSides);
   if(i<ropeLength&&j<ropeSides){const q=i*row+j;iv.push(q,q+row,q+1,q+1,q+row,q+row+1)}
  }
  geo.setAttribute('position',new T.BufferAttribute(new Float32Array(total*3),3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('normal',new T.BufferAttribute(new Float32Array(total*3),3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setIndex(iv);m.frustumCulled=false;
 }
 const {position,normal}=geo.attributes;
 const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y;
 const h=Math.hypot(dx,dz),nx=h>1e-7?-dz/h:0,nz=h>1e-7?dx/h:1;
 for(let i=0;i<=ropeLength;i++){
  const t=lerp(start,end,i/ropeLength),s=Math.sin(t*PI),yd=dy-PI*Math.cos(t*PI)*sag;
  const len=Math.hypot(h,yd)||1;
  const ux=-nz*yd/len,uy=h/len,uz=nx*yd/len;
  const x=a.x+dx*t,y=a.y+dy*t-s*sag,z=a.z+dz*t;
  for(let j=0;j<=ropeSides;j++){
   const angle=j/ropeSides*TAU, c=Math.cos(angle),s=Math.sin(angle);
   const X=nx*c+ux*s,Y=uy*s,Z=nz*c+uz*s;
   const idx=i*row+j;
   position.setXYZ(idx,x+X*.021,y+Y*.021,z+Z*.021);
   normal.setXYZ(idx,X,Y,Z);
   geo.attributes.uv.setX(idx,t);
  }
 }
 position.needsUpdate=true;normal.needsUpdate=true;geo.attributes.uv.needsUpdate=true;
}
const wakeSamples=Array.from({length:swellField.value.length},()=>({p:new T.Vector3(),age:0,force:0}));
function sampleSwell(t){
 for(let i=0;i<wakeSamples.length;i++){
  const w=wakeSamples[i],age=.25+i*.44;
  const q=(t-age+60)%60;
  w.age=age;
  w.force=t<age?0:smooth(46,46.7,q)*(1-smooth(58.6,60,q))*(1-age/5.3);
  if(w.force>0)sailing.getPointAt(smooth(46,60,q),w.p);
  swellField.value[i].set(w.p.x,w.p.z,age,w.force);
 }
}
function wakeAt(x,z,t){
 let sum=0;
 for(const w of wakeSamples){
  if(w.force<=0)continue;
  const margin=Math.hypot(x-w.p.x,z-w.p.z)-w.age*1.59;
  if(Math.abs(margin)>.88)continue;
  sum+=w.force*Math.exp(-margin*margin*5.2)*Math.cos(margin*6.4+t*.42);
 }
 return clamp(sum*.44,-.60,.60);
}
function waterHeight(x,z,t){
 return WAT+.023*Math.sin(x*2+z*1.25+t*1.8)+.012*Math.cos(-z*2.1-t*1.3);
}
const wakePoint=new T.Vector3(),wakeDirection=new T.Vector3();
function renderWake(t){
 const {points,power,geo,o}=wakeRibbon;
 const phaseNow=t%60;
 o.visible=phaseNow>=46||(t>=60&&phaseNow<wakeDuration);
 if(!o.visible)return;
 let v=0;
 for(let i=0;i<wakeRows;i++){
  const age=i/(wakeRows-1),q=(t-age*wakeDuration+60)%60;
  const phase=clamp((q-46)/14,0,1), progress=phase*phase*(3-2*phase);
  const throttle=Math.sin(PI*phase)**.89;
  sailing.getPointAt(progress,wakePoint);
  sailing.getTangentAt(progress,wakeDirection);
  const heading=turnHeading(traveler.heading,Math.atan2(-wakeDirection.x,-wakeDirection.z),smooth(0,.043,progress)*(1-smooth(.956,1,progress)));
  const xAxis=Math.cos(heading),zAxis=-Math.sin(heading),sx=-zAxis,sz=xAxis;
  const width=.44+age*1.43,stern=traveler.len*2.49+age*.13;
  for(let j=0;j<=wakeCols;j++){
   const d=(j/wakeCols*2-1)*width;
   const x=wakePoint.x+sx*stern+xAxis*d,z=wakePoint.z+sz*stern+zAxis*d;
   power[v/3]=throttle;
   points[v++]=x;points[v++]=waterHeight(x,z,t)+.024;points[v++]=z;
  }
 }
 geo.attributes.crest.needsUpdate=true;
 geo.attributes.position.needsUpdate=true;
}
function ropeWaterSpan(a,b,sag,t){
 const delta=b.y-a.y;
 const center=Math.acos(clamp(delta/(PI*sag),-1,1))/PI;
 function clearance(u){
  const x=lerp(a.x,b.x,u), z=lerp(a.z,b.z,u);
  return lerp(a.y,b.y,u)-Math.sin(u*PI)*sag-waterHeight(x,z,t);
 }
 if(clearance(center)>=0)return null;
 function crossing(dry,wet){
  for(let k=0;k<10;k++){
   const u=(dry+wet)*.5;
   if(clearance(u)>0)dry=u;else wet=u;
  }
  return (dry+wet)*.5;
 }
 return [clearance(0)<=0?0:crossing(0,center),clearance(1)<=0?1:crossing(1,center)];
}
function boatMotion(t){
 const q=t%60;
 const active=q>=46 && q<59.99;
 const run=smooth(46,60,q);
 sampleSwell(t);
 const citySwell=windPower.value;
 const p=active ? sailing.getPointAt(run) : null;
 const castAway=smooth(45.24,46.1,q)*(1-smooth(59.37,59.94,q));
 for(let i=0;i<boats.length;i++){
  const b=boats[i],out=b===traveler&&active;
  const incoming=wakeAt(b.x,b.z,t),wave=Math.abs(incoming);
  const phase=t*.81+i*.98;
  const y=.106+Math.sin(phase)*(.036+citySwell*.023+wave*.035)+Math.sin(t*1.83+b.phase)*.014+(out?0:incoming*.061);
  if(out){
   b.g.position.set(p.x,y,p.z);
   const tangent=sailing.getTangentAt(run);
   const forward=Math.atan2(-tangent.x,-tangent.z);
   const diff=Math.atan2(Math.sin(forward-b.heading),Math.cos(forward-b.heading));
   b.g.rotation.y=b.heading+diff*(smooth(0,.043,run)*(1-smooth(.956,1,run)))+Math.sin(phase)*.012;
  }else{
   const sway=i<2?.125:.044;
   b.g.position.set(b.x+sway*Math.sin(phase*.91),y,b.z+.040*Math.sin(phase*.73+b.phase));
   b.g.rotation.y=b.heading+Math.sin(phase)*.012;
  }
  b.g.rotation.x=Math.sin(phase*1.17)*(.012+wave*.016);
  b.g.rotation.z=Math.cos(phase*.89)*(.019+wave*.016+citySwell*.013)+(out?0:incoming*.034);
  b.g.updateMatrixWorld(true);
  waterPositions.value[i].set(b.g.position.x,b.g.position.z,b.g.rotation.y);
  if(i<cabinRainRoofs.value.length)cabinRainRoofs.value[i].x=b.g.position.y;
  for(const r of b.ropes){
   const detach=b===traveler?castAway:0;
   const attached=detach<.978;
   r.s.visible=r.wet.visible=attached;
   if(r.other)r.other.visible=attached;
   if(!attached)continue;
   const end=b.g.localToWorld(r.local.clone());
   const lock=r.lock.clone().lerp(end,detach);
   lock.y+=Math.sin(detach*PI)*.22;
   const sag=(.87+.17*Math.sin(phase*.88)+Math.min(Math.abs(end.z-r.lock.z)*.088,.23))*(1-detach*.86);
   const wet=ropeWaterSpan(lock,end,sag,t);
   if(!wet){
    mooringGeometry(r.s,lock,end,sag,0,1);
    r.wet.visible=false;
    if(r.other)r.other.visible=false;
    continue;
   }
   mooringGeometry(r.s,lock,end,sag,0,wet[0]);
   mooringGeometry(r.wet,lock,end,sag,wet[0],wet[1]);
   if(!r.other)r.other=mesh(new T.BufferGeometry(),dampRope,0,0,0,stage,false);
   r.other.visible=true;
   mooringGeometry(r.other,lock,end,sag,wet[1],1);
  }
  for(const item of b.g.children)if(item.userData.fenderSide){
   const swing=Math.sin(phase*1.45+item.userData.phase);
   let x=item.userData.fenderSide*(1.12+swing*.073);
   const wallLimit=(-4.88-b.g.position.x)/b.wide;
   const contact=i<2&&x<0?Math.max(0,wallLimit-x):0;
   if(contact)x=wallLimit;
   item.scale.z=1-Math.min(.21,contact*2.4);
   item.position.x=x;
   item.rotation.z=.08+swing*.15*(1+wave);
  }
 }
 renderWake(t);
 for(const b of buoys){
  const near=wakeAt(b.x,b.z,t);
  b.g.position.set(b.x+.05*Math.sin(t+b.phase),waterHeight(b.x,b.z,t)+.020+.042*Math.sin(t*1.39+b.phase)+near*.16,b.z+.08*Math.sin(t*.95+b.phase));
  b.g.rotation.set(Math.sin(t*1.31+b.phase)*(.07+.17*Math.abs(near)),.19*Math.sin(t*.84+b.phase),.06*Math.sin(t*.89+b.phase));
 }
 makeDistantWake(t,q);
}
function makeDistantWake(t,q){
 farBoat.visible=q>41&&q<54.3;
 farBoat.position.x=lerp(5.07,13.41,clamp((q-41)/13.3,0,1));
 const visibility=smooth(41,42.9,q)*(1-smooth(52.71,54.3,q));
 for(const m of distantPaint.values())m.opacity=visibility;
 farBoat.position.y=.065+.026*Math.sin(t*1.65);
 for(let i=0;i<28;i++){
  const s=Math.floor(i*.5)/13;
  const direction=i%4<2?-1:1;
  farWake.data[i*3]=farBoat.position.x-.40-s*1.29;
  farWake.data[i*3+1]=.073;
  farWake.data[i*3+2]=-13.80+(.022+s*.085)*direction+.015*Math.sin(s*30.0+t*3.0);
  farWake.fade[i]=visibility*(1-s)*.51;
 }
 readMarks(farWake);
}
function windLag(x,z){return (14-x)*.072+(z+10)*.017}
function breeze(t,pathDelay=0){
 const q=(t-pathDelay+60)%60;
 return smooth(25,28.2,q)*(1-smooth(30.1,34.9,q));
}
const dripOrigin=new T.Vector3(), dripEnd=new T.Vector3();
function dripSurface(x,z,t){
 if(x<=-5||(x<=5&&z<-7.15)||(x<-.65&&z>7.15))return SHORE;
 if(x<=-3.50&&z>=5.25&&z<=7.15)return .58;
 if(x<=-4.06&&z>=4.62&&z<5.25)return .30;
 if(x>=5&&x<=outerPier.end&&z>=outerPier.sea&&z<=outerPier.harbor)return .85;
 if(z>=10.53&&z<=12.95&&x<1.52&&x>-.65)return lerp(SHORE,WAT,(x+.65)/2.17);
 return waterHeight(x,z,t);
}
function renderDrips(t){
 const count=40;
 dripMarks.fade.fill(0);
 for(let j=0;j<beads.length;j++){
  const d=beads[j], frame=(t+d.phase)%d.interval;
  d.o.visible=false;
  if(frame>1.95)continue;
  d.p.localToWorld(dripOrigin.set(d.x,d.y,d.z));
  const dx=.024+.044*windPower.value,dz=.012;
  dripEnd.set(dripOrigin.x+dx,0,dripOrigin.z+dz);
  dripEnd.y=dripSurface(dripEnd.x,dripEnd.z,t);
  if(d.deck)d.p.localToWorld(dripEnd.set(d.x,.55,d.z));
  const h=Math.max(.035,dripOrigin.y-dripEnd.y);
  const release=.23,flight=Math.sqrt(h*.225),age=frame-release-flight;
  if(age<0){
   const fall=clamp((frame-release)/flight,0,1);
   d.o.position.copy(dripOrigin).lerp(dripEnd,fall*fall);
   d.o.visible=true;
   const gather=lerp(.62,1,smooth(0,.22,frame));
   d.o.scale.set(.016*gather,.022*gather+.026*fall,.016*gather);
   d.o.material.opacity=.86*smooth(0,.16,frame)*smooth(.32,1.34,d.o.position.distanceTo(camera.position))*cloudLight.value;
  }else if(age<.62){
   const fade=(1-smooth(.07,.62,age))*cloudLight.value;
   const r=.023+age*(d.deck?.19:.37);
   for(let i=0;i<count;i++){
    const a=Math.floor(i/2)*TAU/20+i%2*.245+d.phase, q=j*count+i;
    const jitter=1+.08*Math.sin(a*3+d.phase);
    dripMarks.data[q*3]=dripEnd.x+Math.cos(a)*r*jitter;
    dripMarks.data[q*3+1]=dripEnd.y+.020+(i<8?.066*Math.sin(PI*clamp(age/.19,0,1))*(i%2):0);
    dripMarks.data[q*3+2]=dripEnd.z+Math.sin(a)*r*jitter;
    dripMarks.fade[q]=fade*(i<8?.68:.58);
   }
  }
 }
 readMarks(dripMarks);
}
function atmosphere(t){
 const q=t%60;
 const towerCloud=smooth(47.8,50.2,q)*(1-smooth(52.3,54.8,q));
 const cloud=Math.max(smooth(34,38,q)*(1-smooth(40.5,44.1,q)),towerCloud*.92);
 const thinCloud=.045*Math.sin(t*.42+.4);
 const curl=.05*Math.sin(t*1.1);
 cloudPass.value=cloud;
 cloudBand.value=q<46?(q-39.3)*4.8:10.0+(q-50.8)*5.35;
 const earlyDry=(.53+.47*smooth(0,3.8,q))*(1-smooth(11.8,17.3,q));
 const clearPatch=smooth(18,22,q)*(1-smooth(37.2,41.3,q));
 rainDensity.value=.69+.11*Math.cos(q*.18+.96)-earlyDry*.22-clearPatch*.29+.06*windPower.value;
 cloudLight.value=1-cloud*.28+thinCloud;
 sun.intensity=2.22-cloud*.59+thinCloud;
 sun.color.set('#ffebcd').lerp(new T.Color('#e7f1ee'),cloud*.52);
 hemi.intensity=2.03-cloud*.26;
 const towerShade=towerCloud*smooth(.26,.64,1-cloudAt(outerPier.towerX,outerPier.towerZ));
 beaconMat.emissiveIntensity=.21+towerShade*(1.45+.76*Math.sin(t*3.2)**2);
 beaconTurn.rotation.y=.70+t*.78;
 beaconAura.material.opacity=.20*towerShade*(.73+.27*Math.sin(t*3.2)**2);
 beaconAura.quaternion.copy(camera.quaternion);
 const rainbowAmount=((.39+.61*smooth(0,2.45,q))*(1-smooth(8.5,15.7,q))*.31+
  smooth(30.8,33.6,q)*(1-smooth(35,37.6,q))*.24);
 const rainbowWindow=1-smooth(.54,.73,rainDensity.value);
 rainbow.ms.forEach((m,i)=>{m.opacity=rainbowAmount*rainbowWindow*(.96-.055*i)});
 for(const {p,x,y,z,o,phase} of skyPlumes){
   p.position.set(x+1.89*Math.sin(t*.047+phase),y+.87*Math.sin(t*.061+phase),z+.91*Math.sin(t*.041+phase*1.16));
   p.quaternion.copy(camera.quaternion);
   p.material.opacity=o*(.78+.22*cloud);
 }
 for(let i=0;i<mists.length;i++){
   const o=mists[i];o.position.x=2.7+i*2.09+.79*Math.sin(t*.19+i);
   o.position.y=.40+i%2*.17+Math.sin(t*.26+i)*.13;o.material.opacity=.47+cloud*.19;
  o.rotation.y=.14+.12*Math.sin(t*.11+i*.62);
 }
 for(const f of foliage){
   const gust=f.under?windPower.value*.065:breeze(t,windLag(f.x,f.z))*.115;
   f.g.rotation.z=f.a*Math.sin(f.phase+t*(f.under?1.11:.83))-(f.under?1.0:.8)*gust;
   f.g.rotation.x=.53*f.a*Math.cos(f.phase+t*(f.under?.87:1.01));
 }
 for(const f of netFloats){
   const pos=f.getWorldPosition(mirrorUp);
   const w=breeze(t,windLag(pos.x,pos.z));
   f.rotation.x=.019*Math.sin(t*2.0+f.position.z)+w*.061*Math.sin(t*4.4);
   f.rotation.y=.017*Math.sin(t*1.62)+w*.065;
 }
 for(const item of cloth){
   const pos=item.o.geometry.attributes.position;
   const a=item.original;
   const world=item.o.getWorldPosition(mirrorUp);
   const d=breeze(t,windLag(world.x,world.z));
   for(let i=0;i<pos.count;i++){
     const x=a[i*3],y=a[i*3+1],z=a[i*3+2];
     const k=item.net?clamp((2.1-y)/1.53,0,1):clamp(x/item.w,0,1);
     const b=Math.sin(x*4.4-t*(2.7+d*.46)+item.phase);
     pos.setXYZ(i,x,y+(item.sock?-(.44-d*.39)*k*k+.052*b*k:0),z+(b*(item.net?.055:.085)+.132*d+curl)*k);
   }
   pos.needsUpdate=true;if(!item.net)item.o.geometry.computeVertexNormals();
 }
 for(const m of shaftMotes){
   const inlet=m.p.localToWorld(mirrorUp.copy(m.l));
   m.illumination.value=cloudLight.value*cloudAt(inlet.x,inlet.z);
   for(let i=0;i<m.dust.length;i++){
     const [u,angle,r,rate]=m.dust[i], f=(u+t*.091*rate)%1;
     const k=lerp(m.w0,m.w1,f)*r;
     const a=angle+t*.25*rate;
     mirrorUp.copy(m.l).addScaledVector(m.axis,f).addScaledVector(m.x,Math.cos(a)*k).addScaledVector(m.z,Math.sin(a)*k);
     m.pos.setXYZ(i,mirrorUp.x,mirrorUp.y,mirrorUp.z);
   }
   m.pos.needsUpdate=true;
   for(let i=0;i<m.spray.count/2;i++){
    const tap=i*3+2;
    mirrorUp.fromBufferAttribute(m.pos,tap);
    const len=.028+.032*Math.sin(t*.83+i*2.1)**2;
    m.spray.setXYZ(i*2,mirrorUp.x,mirrorUp.y,mirrorUp.z);
    m.spray.setXYZ(i*2+1,mirrorUp.x-len*.29,mirrorUp.y+len,mirrorUp.z-len*.24);
   }
   m.spray.needsUpdate=true;
   m.material.opacity=.29*m.illumination.value*rainDensity.value;
 }
 renderDrips(t);
}

const shots=[
 {t:0,span:7.3,from:[35.5,23.7,37.8,.14,-2.14,.65],to:[30,24.5,35.5,-.32,-1.99,.43]},
 {t:7.3,span:5.0,from:[2.0,2.71,13.2,-1.1,1.46,10.16],to:[.71,2.33,12.0,-.95,1.49,10.18]},
 {t:12.3,span:4.7,from:[.94,4.67,11.22,-3.22,1.21,8.42],to:[-.55,3.55,10.49,-3.31,1.32,8.25]},
 {t:17,span:4.8,from:[-2.74,1.39,15.29,-3.49,1.26,13.02],to:[-3.18,1.26,14.48,-3.45,1.24,13.04]},
 {t:21.8,span:5.4,from:[3.72,3.36,9.22,-1.26,.52,5.18],to:[.65,3.22,2.17,-3.38,1.20,.79],entryFov:44},
 {t:27.2,span:4.8,from:[8.15,5.69,-2.40,3.05,2.68,-9.30],to:[.10,6.69,-7.00,-5.35,2.80,-10.66],entryFov:43,fov:41},
 {t:32,span:4.5,from:[-2.94,1.65,6.22,-3.53,1.32,2.44],to:[-3.65,1.58,4.79,-3.51,1.35,2.44]},
 {t:36.5,span:4.5,from:[-3.72,2.61,-.42,-9.10,2.18,-2.29],to:[-7.96,2.20,-2.68,-9.90,2.865,-2.97],fov:44},
 {t:41,span:3.5,from:[-6.19,2.68,7.92,-9.11,2.11,5.91],to:[-6.45,2.53,4.8,-9.23,2.08,4.65],entryFov:46,fov:45},
 {t:44.5,span:3.95,from:[11.98,1.04,17.81,6.7,-1.47,11.97],to:[9.00,-1.31,17.17,6.92,-2.09,10.94]},
 {t:48.45,span:2.80,from:[18.52,5.82,-9.53,9.08,2.40,-11.08],to:[17.39,5.18,-10.19,9.43,2.61,-11.46],entryFov:46,fov:45},
 {t:51.25,span:2.5,from:[16.72,6.52,-2.16,8.29,2.76,-9.77],to:[15.59,6.04,-3.02,8.52,2.72,-9.70]},
 {t:53.75,span:6.25,from:[23.6,14.8,10.5,7.8,.9,-1.4],to:[32.4,27,37,.18,-2.17,.48],track:true}
];
function tourCamera(t){
 const shot=shots.findLast(s=>t>=s.t)||shots[0];
 const f=clamp((t-shot.t)/shot.span,0,1);
 const k=shot.track?1-(1-f)**1.42:.88*f+.12*f*f*(3-2*f);
 const a=shot.from.map((v,i)=>lerp(v,shot.to[i],k));
 setLens(lerp(shot.entryFov??viewingFov,shot.fov??viewingFov,smooth(.22,1,f)));
 camera.position.set(...a.slice(0,3));
 if(shot.track){
  const ship=sailing.getPointAt(smooth(46,60,t));
  const follow=.31*(1-smooth(.21,.73,f));
  a[3]=lerp(a[3],ship.x,follow);
  a[5]=lerp(a[5],ship.z,follow);
 }
 camera.lookAt(a[3],a[4],a[5]);
}
function present(t){
 renderTime.value=t;
 if(!mode)camera.getWorldDirection(sight);
 windPower.value=breeze(t);
 boatMotion(t);
 atmosphere(t);
 flyGulls(t);
 catMove(t);
 shoals(t);
 renderMarks(t);
 updateMirrors();
 renderer.render(scene,camera);
}
function tick(now){
 requestAnimationFrame(tick);
 if(mode)return;
 const dt=Math.min((now-dtClock)/1000,.065);
 dtClock=now;showTime+=dt;
 const ease=1-Math.exp(-dt*12.5);
 orbit.center.lerp(target.center,ease);
 orbit.distance=lerp(orbit.distance,target.distance,ease);
 orbit.theta=lerp(orbit.theta,target.theta,ease);
 orbit.phi=lerp(orbit.phi,target.phi,ease);


 orbitCamera();
 present(showTime);
}
function still(i){
 resize();
 const t=i/mode.fps;
 tourCamera(t);
 present(t);
 renderer.getContext().flush();
}
window.videoExport={
 runs:['tour'],
 async begin(runId,{fps}={}){
  if(runId!=='tour'||!Number.isFinite(fps)||fps<=0)throw new RangeError('Use tour with a positive fps');
  mode={fps,frames:Math.round(60*fps)};
  drag=null;
  still(0);
  return {frames:mode.frames};
 },
 async frame(i){
  if(!mode||!Number.isInteger(i)||i<0||i>=mode.frames)throw new RangeError('Frame outside the current run');
  still(i);
 },
 end(){
  mode=null;
  dtClock=performance.now();
  orbitCamera();
  present(showTime);
 }
};
function combineStaticMeshes(){
 stage.updateMatrixWorld(true);
 const moving=new Set([
   ...boats.map(b=>b.g), ...buoys.map(b=>b.g), ...fish.map(f=>f.g),
   ...foliage.map(f=>f.g), ...gulls.map(g=>g.g), ...cloth.map(c=>c.o),
   ...netFloats, farBoat,cat
 ]);
 const buckets=new Map();
 const normalMatrix=new T.Matrix3(),v=new T.Vector3();
 function collect(o){
  if(moving.has(o))return;
  for(const c of o.children)collect(c);
  if(!o.isMesh||o.children.length||Array.isArray(o.material)||o.material.transparent||
     o.material.isShaderMaterial||!o.geometry.attributes.position?.count||o.renderOrder||
     !o.geometry.attributes.normal||!o.geometry.attributes.uv||!o.geometry.index)return;
  const world=o.getWorldPosition(v);
  const key=[o.material.uuid,+o.castShadow,+o.receiveShadow,o.layers.mask,
     Math.floor((world.x+14)/8),Math.floor((world.z+14)/8)].join('/');
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(o);
 }
 collect(stage);
 for(const parts of buckets.values()){
  if(parts.length<4)continue;
  let count=0,n=0;
  for(const o of parts){count+=o.geometry.attributes.position.count;n+=o.geometry.index.count}
  const ps=new Float32Array(count*3),ns=new Float32Array(count*3),uv=new Float32Array(count*2);
  const faces=count>65535?new Uint32Array(n):new Uint16Array(n);
  let offset=0,faceOffset=0;
  for(const o of parts){
    const {position,normal,uv:tex}=o.geometry.attributes;
    normalMatrix.getNormalMatrix(o.matrixWorld);
    for(let j=0;j<position.count;j++){
     v.fromBufferAttribute(position,j).applyMatrix4(o.matrixWorld).toArray(ps,(offset+j)*3);
     v.fromBufferAttribute(normal,j).applyNormalMatrix(normalMatrix).toArray(ns,(offset+j)*3);
     uv[(offset+j)*2]=tex.getX(j);uv[(offset+j)*2+1]=tex.getY(j);
    }
    for(const i of o.geometry.index.array)faces[faceOffset++]=i+offset;
    offset+=position.count;
    o.removeFromParent();
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.BufferAttribute(ps,3));
  g.setAttribute('normal',new T.BufferAttribute(ns,3));
  g.setAttribute('uv',new T.BufferAttribute(uv,2));
  g.setIndex(new T.BufferAttribute(faces,1));
  const original=parts[0];
  const o=mesh(g,original.material,0,0,0,stage,original.castShadow);
  o.receiveShadow=original.receiveShadow;
  o.layers.mask=original.layers.mask;
 }
}
combineStaticMeshes();
resize();
orbitCamera();
present(0);
requestAnimationFrame(tick);

