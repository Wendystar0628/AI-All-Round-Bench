// Faceted basalt on the fleet grid. Adjacent cells are assigned to the nearest fracture
// nucleus, so every separated slab has an exposed cross section and its own centre of rotation.
function rockMesh(radius,variant){
 const step=radius>50?4:radius>22?3:2,extent=Math.ceil(radius*1.37/step),side=extent*2+1;
 const volume=new Int8Array(side**3);volume.fill(-1);
 const pieces=Array.from({length:6},()=>new Model()),totals=pieces.map(()=>[0,0,0,0]);
 const centers=[[-.49,-.29,.1],[-.09,-.48,-.35],[.49,-.23,.12],[-.44,.31,-.29],[.06,.48,.38],[.49,.30,-.31]];
 const ink=[['#514c4e','#6c6663','#8d8072','#a69884','#77675c'],['#454c58','#606974','#80848a','#aaa39a','#68696b'],['#5c4d48','#816f5f','#a49078','#c4ae90','#85736b']][variant%3];
 const key=(i,j,k)=>i+extent+side*(j+extent+side*(k+extent));
 const shapes=[];
 for(let k=-extent;k<=extent;k++)for(let j=-extent;j<=extent;j++)for(let i=-extent;i<=extent;i++){
  let x=i*step/radius,y=j*step/radius,z=k*step/radius;
  let a=x+y*.16,b=y-z*.14,c=z+.17*Math.sin(x*2.6+variant);
  let contour=Math.hypot(a*.89,b*1.14,c*1.08)+.12*Math.sin(4*a+3*c+variant)*Math.cos(4*b-a)+.073*Math.cos(6.3*c-2*b)+.043*Math.sin(9*b+4*c);
  if(contour>1||a*.64+b*.71-c*.21>.91)continue;
  let bore=Math.hypot((x-.21-z*.28)*1.25,(y-.08-z*.22));
  if((variant===0||variant===4)&&bore<.205+.036*Math.cos(6*z+variant))continue;
  let p=[a+.07*Math.sin(b*7+c*3),b+.08*Math.sin(c*6+a*3),c],best=Infinity,second=Infinity,part=0;
  for(let n=0;n<6;n++){let center=centers[n],d=(p[0]-center[0])**2+(p[1]-center[1])**2+(p[2]-center[2])**2;
   if(d<best){second=best;best=d;part=n}else if(d<second)second=d}
  volume[key(i,j,k)]=part;shapes.push([i,j,k,part,second-best,contour]);
  let sum=totals[part];sum[0]+=i*step;sum[1]+=j*step;sum[2]+=k*step;sum[3]++;
 }
 for(let [i,j,k,part,gap,contour] of shapes){
  let idx=key(i,j,k),neighbors=[1,-1,side,-side,side*side,-side*side].map(o=>volume[idx+o]);
  if(neighbors.every(n=>n===part))continue;
  let internal=neighbors.every(n=>n>=0),x=i*step,y=j*step,z=k*step;
  let band=.51+.19*Math.sin(y*.18+x*.062+Math.sin(z*.11))+.17*Math.sin(x*.095+z*.067+variant)+.10*Math.cos(z*.16-y*.05);
  let shade=Math.min(4,Math.floor(clamp(band)*5)),seam=gap<.073||internal;
  let c=seam?(internal?'#564440':'#4c4041'):ink[shade];
  pieces[part].box(x,y,z,step,step,step,c,seam?-.85:0);
  // Shallow mineral beds crop out from the larger terraces at the native one-unit pitch.
  if(!seam&&neighbors[2]<0&&(i+2*k)%4===0)pieces[part].box(x,y+step/2,z,step-1,2,step,ink[Math.min(3,shade+1)]);
 }
 return pieces.map((m,n)=>{m.radius=radius;m.pivot=totals[n].slice(0,3).map(x=>x/totals[n][3]);return m.bake(step)})
}
const rocks=[rockMesh(69,0),rockMesh(44,1),rockMesh(27,2),rockMesh(14,3),rockMesh(76,4)],
 targets=[[1050,20,16],[986,67,170],[1137,-30,-137],[1245,84,94]],hits=[52.5,55.58,58.8,62.5],field=[];
for(let j=0;j<36;j++)field.push([1250+rnd()*1200,rnd()*590-310,rnd()*1110-620,1+Math.floor(rnd()*3)]);
let debris=new Model();debris.box(0,0,0,4,3,5,'#9c8874');debris.box(2,1,0,2,2,3,'#76665f');debris=debris.bake();const dust=[];for(let i=0;i<85;i++)dust.push([rnd()*3000-1500,rnd()*740-420,rnd()*2100-1050]);
let missile=new Model();missile.box(0,0,0,9,2,2,pearl);missile.box(-4,0,0,2,3,4,slate);missile=missile.bake();
bakeShadow(flagship,2048,580);bakeShadow(guard,512,105);bakeShadow(lancer,512,112);
let pulseMount=new Model(),closeMount=new Model();battery(pulseMount,0,0,0,.82);battery(closeMount,0,0,0,.52);pulseMount=pulseMount.bake();closeMount=closeMount.bake();
flagship.shipClass=3;lancer.shipClass=2;guard.shipClass=1;
const duration=80;let shipPos=[],rot=[],boost=0;
function path(t,keys){let i=0;while(i<keys.length-2&&t>keys[i+1][0])i++;let a=keys[i],b=keys[i+1];let s=clamp((t-a[0])/(b[0]-a[0])),p=keys[Math.max(i-1,0)],q=keys[Math.min(i+2,keys.length-1)];return a.slice(1).map((v,j)=>{let k=j+1;let d1=(b[k]-p[k])*(b[0]-a[0])/(b[0]-p[0]),d2=(q[k]-a[k])*(b[0]-a[0])/(q[0]-a[0]);return mix(v,b[k],s*s*(3-2*s))+s*(1-s)*((1-s)*d1-s*d2)})}
// A single tracking move from the prow, around the engine fan, beneath the outboard shoulder
// and through the actual 03 aperture. The interior deck and the exterior share a coordinate frame.
const exteriorEye=[
 [0,760,563,773],[5,461,462,905],[10,-106,262,804],[14,-511,131,523],
 [16.7,-582,31,375],[18.7,-429,-35,316],[20.3,-264,-30,282],[21.9,-112,-9,249],
 [23.2,-53,-1,187],[25.5,-37,-4,110],[27.7,-52,-2,30],[29.8,-61,0,-50]
],exteriorLook=[
 [0,4,4,0],[5,-14,8,0],[10,-75,15,0],[14,-173,12,21],
 [16.7,-235,-5,52],[18.7,-145,-10,140],[20.3,-79,-8,163],[21.9,-47,-9,166],
 [23.2,-43,-10,116],[25.5,-53,-10,37],[27.7,-55,-5,-65],[29.8,-44,0,-159]
];
function intoWorld(p,angles,offset=zero){
 let [x,y,z]=p,[roll,yaw,pitch]=angles;
 [y,z]=[y*Math.cos(roll)-z*Math.sin(roll),y*Math.sin(roll)+z*Math.cos(roll)];
 [x,z]=[x*Math.cos(yaw)-z*Math.sin(yaw),x*Math.sin(yaw)+z*Math.cos(yaw)];
 return add(offset,[x*Math.cos(pitch)-y*Math.sin(pitch),x*Math.sin(pitch)+y*Math.cos(pitch),z]);
}
function shipPoint(i,local){return intoWorld(local,rot[i],shipPos[i])}
const slotPosition=(j,k)=>[-42+j*14,18,k*(50-j*2.5)];
const rocketsLoaded=new Model();
for(let k of [-1,1])for(let j=0;j<6;j++){let [x,y,z]=slotPosition(j,k);rocketsLoaded.box(x,y,z,9,2,3,bronze);rocketsLoaded.box(x+4,y,z,2,2,2,ivory)}
rocketsLoaded.bake();
function motion(t){let spread=sm(44,52,t)*(1-sm(65,77,t));boost=sm(69,75,t)*(1-sm(76,85,t))+(t<5?1-sm(76,85,t+80):0);
ships.forEach((s,i)=>{let p=s.p;shipPos[i]=i?[p[0]+Math.sin(t*TAU/80+i)*17-boost*(i%5)*7,p[1]+Math.sin(t*TAU/40+i*1.3)*6,p[2]*(1+spread*.11)+Math.sin(i+t*TAU/80)*8]:zero;rot[i]=i?[Math.sin(t*TAU/40+i)*.018,Math.sin(t*TAU/80+i)*.013,0]:zero});
}
function exhaust(p,w,len){
 let seed=p[2]*.071+p[1]*.05;
 len*=1+.028*Math.sin(tm*2.4+seed);
 const end=add(p,[-len,0,0]);
 ray(p,end,w*.66,w*.17,'#267cc8',.86,1);
 ray(p,add(p,[-len*.74,0,0]),w*.36,w*.09,'#4ad5f6',1.12,1);
 ray(p,add(p,[-len*.32,0,0]),w*.15,w*.045,'#d5ffff',1.65,1);
 for(let k of [-1,1]){
  let a=add(p,[-1,0,k*w*.28]);
  for(let j=1;j<=5;j++){
   let u=j/5,b=add(p,[-len*u*(1.04+.07*k),Math.sin(tm*1.8-u*4+seed)*w*.10*u,k*w*(.28-.17*u)+Math.sin(u*4+seed)*w*.06*u]);
   ray(a,b,w*.068*(1-u*.58),w*.062*(1-u*.64),'#5bcce9',.68*(1-u*.90),2);a=b;
  }
 }
 if(w>25){
  for(let j=0;j<8;j++){
   let u=(tm*(.73+j%3*.08)+j*.127+seed)%1;if(u<0)u++;
   let a=j*2.399+seed,r=w*(.26+u*.19);
   let q=add(p,[-len*(.15+u*1.1),Math.cos(a)*r*.65,Math.sin(a)*r]);
   ray(q,add(q,[4+6*u,0,0]),.65,.36,'#a9f6ff',Math.sin(Math.PI*u)*.76,2)
  }
 }
}
function fleet(){for(let i=0;i<ships.length;i++){let s=ships[i],p=shipPos[i];if(dot(sub(p,eye),fw)<(i?-110:-600))continue;draw(i?s.type?lancer:guard:flagship,p,rot[i],shieldPhase(tm,i),-1,i===22||i===28);if(!i){for(let k of [-1,1])for(let j=0;j<6;j++){let base=[-375+j*91,40,k*(133-j*3)],d=sub(targets[1],base),q=sm(49,54,tm)*(1-sm(59,66,tm));draw(pulseMount,base,[0,q*Math.atan2(d[2],d[0]),q*Math.atan2(d[1],d[0])])}
for(let o of outlets)exhaust(o.slice(0,3),o[3],(109+o[3])*(1+boost*1.6))}else{if(s.type===0)for(let k of [-1,1]){let base=add(p,[-12,17,k*28]),d=sub(targets[2],base),q=sm(54,57,tm)*(1-sm(61,67,tm));draw(closeMount,base,[0,q*Math.atan2(d[2],d[0]),q*Math.atan2(d[1],Math.hypot(d[0],d[2]))])}if(s.type===1){
 if(i!==28||tm<58.8||tm>74)draw(rocketsLoaded,p,rot[i]);
 else for(let side of [-1,1])for(let j=0;j<6;j++){
  let slot=slotPosition(j,side);
  if(side===1&&tm>=58.8+j*.35){let load=sm(70+j*.35,71+j*.35,tm);if(load===0)continue;slot[1]-=5*(1-load)}
  draw(missile,shipPoint(i,slot),rot[i])
 }
}
for(let k of [-1,0,1]){
 let w=k?(s.type?12:19):18,x=k?(s.type?-89:-82):(s.type?-86:-91);
 let lag=.67*waveDelay(i),thrust=sm(69+lag,75+lag,tm)*(1-sm(76,85,tm))+(tm<5?1-sm(76,85,tm+80):0);
 exhaust(shipPoint(i,[x,k?2:0,k*(s.type?57:28)]),w,(42+w)*(1+thrust*1.7));
}}}
for(let j=2;j<shuttles.length;j++){
 let a=shuttles[j],q=tm*TAU/40+j*.55,p=[a[0]+Math.sin(q)*80,a[1]+Math.sin(q*2)*12+7,a[2]+Math.cos(q)*22+55];draw(skiff,p,[0,.09*Math.cos(q),0]);exhaust(add(p,[-15,1,0]),4,20)
}}
const returningCraft=[[0,-918,37,364],[6,-815,32,354],[11,-731,21,343],[14.4,-644,12,329],[17.3,-510,-7,305],[19.2,-314,-16,282],[20.8,-160,-12,258],[21.8,-81,-10,215],
 [22.7,-45,-10,170],[24.8,-45,-12,89],[26.8,-57,-12,12],[28.2,-58,-8,-86],[29.8,-48,0,-217],[35,311,32,-344],[44,712,53,-509],[53,889,84,-690],[62,-415,57,-790],[70,-1024,42,-432],[75,-1002,39,293],[80,-918,37,364]];
function dockMovements(t){
 
 for(let i=0;i<8;i++)for(let side of [-1,1]){
  if(i===4&&side===1)continue;
  draw(skiff,add(dockOrigin,[side*45,7,152-i*44]),[0,side===1?2.83:.32,0])
 }
 function flight(p,dir,bank,thrust=1){
  const yaw=Math.atan2(dir[2],dir[0]),pitch=clamp(Math.atan2(dir[1],Math.hypot(dir[0],dir[2])),-.18,.18),angles=[bank,yaw,pitch];
  draw(skiff,p,angles);for(let k of [-1,1]){let start=intoWorld([-15,1,k*7],angles,p),end=intoWorld([-15-19*thrust,1,k*7],angles,p);
   ray(start,end,2.4,.6,'#49caff',1.3*thrust,1)
  }
 }
 {
  let p=path(t,returningCraft),v=sub(path(t+.04,returningCraft),path(t-.04,returningCraft));
  flight(p,v,.16*Math.sin(t*1.2));
 }
 // Two continuous shifts per loop. The outbound tender lifts clear of its cradle before turning.
 let u=t%40,sortie=[[0,45,7,-24],[7,45,7,-24],[9,45,16,-24],[12,14,16,-16],[16,10,18,60],
 [20,16,20,199],[24,64,23,263],[28,148,35,281],[31,162,42,284],[33,98,35,259],[35,15,20,205],[38,19,14,13],[39.4,45,12,-24],[40,45,7,-24]];
 if(u<=7){draw(skiff,add(dockOrigin,[45,7,-24]),[0,2.83,0]);return}
 let p=add(dockOrigin,path(u,sortie)),v=sub(path(u+.025,sortie),path(u-.025,sortie)),inFlight=sm(8.5,11,u)*(1-sm(37.3,39.4,u));
 let attitude=vp([-.95,0,.31],unit(v),inFlight);
 flight(p,attitude,Math.sin(t*.9)*inFlight*.13,sm(7,9,u)*(1-sm(39,40,u)))
}
function drawDock(t){
 const saved=[inside,lightPos,localLight,power];inside=1;lightPos=add(dockOrigin,[-23,27,93]);localLight=[.29,.79,.99];power=580;
 solids();draw(dock,dockOrigin);dockMovements(t);
 [inside,lightPos,localLight,power]=saved;solids()
}
function stones(t,previous=false){let pass=Math.max(0,t-66),travel=pass*(8+21*pass),slide=Math.max(0,49-t)*12-travel;for(let i=0;i<field.length;i++){let a=field[i],v=[a[0]+slide,a[1],a[2]-travel*.21];if(dot(sub(v,eye),fw)<0)continue;for(let m of rocks[a[3]])draw(m,v,[.1,i+t*.016,i*.56])}
for(let j=0;j<4;j++){
 let dt=t-hits[j],age=clamp(dt,0,25),p=add(targets[j],[slide,0,-travel*.21]),parts=rocks[j===3?4:j];
 for(let i=0;i<parts.length;i++){
  let part=parts[i],pivot=part.pivot,d=unit(pivot),speed=(j===3?17:12)*(1+.23*Math.sin(i*6.4+j));
  let u=Math.max(0,age-(.06+i*.045)),distance=speed*u*sm(0,.62,u);
  let rot=[d[2]*u*.17,d[0]*u*.22,d[1]*u*.15];
  let offset=add(p,add(mul(d,distance),sub(pivot,intoWorld(pivot,rot))));
  draw(part,offset,rot,-1,dt);
 }
 if(age>0)for(let k=0;k<28;k++){
  let dir=unit([Math.sin(k*7.3+j)-.24,Math.cos(k*5.1+j),Math.cos(k*3.2)+.23]);
  let speed=14+((k*37)%43),time=Math.max(0,age-(k%4)*.048);
  let pos=add(p,mul(dir,parts[0].radius*.63+time*speed));
  draw(debris,pos,[k+time*.8,k,time*1.35]);
  if(time<1.8)ray(pos,add(pos,mul(dir,-6)),1.7,.3,'#ff9c56',1.4-time*.68,1);
  if(k%2===0&&time<5){
   let plume=add(p,mul(dir,parts[0].radius*.72+Math.sqrt(time)*speed*.8));
   dustCloud(plume,(6+time*10)*(1+.22*Math.sin(k)),k*13+j,[.49,.41,.36],.24*sm(0,.18,time)*(1-sm(.8,5,time)));
  }
 }
}
if(previous)return;if(t<8)stones(t+80,true);for(let [x,y,z] of dust){let v=[((x+1500-t*37.5-3000*sm(66,80,t)+9000)%3000)-1500,y,z];if(dot(sub(v,eye),fw)<0)continue;draw(debris,v,[x*.03,t*.017,z*.03])}}
function fx(t){let start=[538,7,0],target=targets[0],charge=sm(49,52,t)*(1-sm(53.4,54.8,t));if(charge>0){flare(start,10+charge*33,'#ffab54',charge);for(let i=0;i<12;i++){let q=sm(49+i*.17,50+i*.17,t)*charge;ray([203+i*25,29,0],[224+i*25,29,0],6,6,'#ffb247',q)}}
let strength=sm(51.9,52.35,t)*(1-sm(54.15,55,t));if(strength>0){let muzzle=vp(start,add(target,[-46,3,9]),sm(54.55,55,t)),end=vp(start,add(target,[-46,3,9]),sm(51.9,52.5,t)),w=strength*(1+.08*Math.sin(t*37));ray(muzzle,end,25*w,15*w,'#ff681c',.78);ray(muzzle,end,8*w,6*w,'#ffc677',1.4);ray(muzzle,end,3*w,2*w,'#ffffeb',2);for(let i=0;i<5;i++){let f=(t*1.6+i*.2)%1,p=vp(muzzle,end,f);ray(p,add(p,[22,0,0]),9*w,5*w,'#ffdb7e',.7)}flare(end,36*w,'#ffb453',1);for(let j=0;j<3;j++){let q=(t*2+j/3)%1;let rad=(7+q*21)*w;for(let i=0;i<24;i++){let a=i*TAU/24,b=(i+1)*TAU/24;ray(add(start,[15+q*90,rad*Math.cos(a),rad*Math.sin(a)]),add(start,[15+q*90,rad*Math.cos(b),rad*Math.sin(b)]),1.2,1.2,'#ffb354',1-q)}}}
if(t>54.35&&t<55.7)for(let i=0;i<16;i++){
 let u=(t-54.35)*.85+i*.054;if(u>=1)continue;
 let p=vp(start,targets[0],u);p[1]+=Math.sin(i*3.31)*8*u;p[2]+=Math.cos(i*7.1)*7*u;
 ray(p,add(p,[-12,0,0]),1.4,.4,'#ffbb69',(1-u)*.9,1)
}
for(let j=0;j<4;j++)for(let i=0;i<6;i++){let fire=54.1+j*.14+i*.47,age=t-fire;if(age<0||age>1.48)continue;let base=[-375+j*91,40,133-j*3],direction=unit(sub(targets[1],base)),a=add(add(base,[0,6,(i%2?1:-1)*5]),mul(direction,28)),b=add(targets[1],[Math.sin(i)*16,Math.cos(j)*12,4]),p=vp(a,b,age/1.48);ray(vp(a,b,clamp((age-.078)/1.48)),p,3,6,'#53deff',1.35);flare(p,5,'#afffff',1.2);if(age<.13)flare(a,10,'#55eaff',1-age/.13);if(age>1.32)flare(b,12,'#ffbf83',1.25)}
let gi=22,g=shipPos[gi];for(let j=0;j<27;j++){let age=t-57.15-j*.098;if(age<0||age>1.65)continue;let a=add(add(g,[-12,21,28+(j%2)*3]),mul(unit(sub(targets[2],g)),18)),b=add(targets[2],[Math.sin(j*2)*18,Math.cos(j)*11,16]),p=vp(a,b,age/1.65);ray(vp(a,b,clamp((age-.044)/1.65)),p,1.6,1.1,'#ffe6a1',2);if(age<.09)flare(a,8,'#ffb665',1-age/.1);if(age>1.54)flare(b,5,'#ffc274',1)}
let li=28;for(let i=0;i<6;i++){let age=t-58.8-i*.35,D=3.7;if(age<0||age>D+.96)continue;function curve(u){u=clamp(u);let p=vp(shipPoint(li,slotPosition(i,1)),add(targets[3],[i*5-10,13-i*4,20]),u*(.5+.5*u));p[1]+=Math.sin(u*Math.PI)*(70+i*11);p[2]+=Math.sin(u*Math.PI)*(i*17-30);return p}let u=age/D;if(u<1){let v=sub(curve(u+.001),curve(u-.001));draw(missile,curve(u),[0,Math.atan2(v[2],v[0]),Math.atan2(v[1],Math.hypot(v[2],v[0]))]);flare(curve(u),3,'#ffd994',.8*sm(.11,.32,age))}for(let n=0;n<18;n++){let u1=u-n*.013,u2=u1-.013;if(u2>=1||u1<.045)continue;ray(curve(u1),curve(u2),4.1-n*.13,4.1-n*.13,'#ff985e',(1-n/19)*.93,2);ray(curve(u1),curve(u2),1.4,1.2,'#ffdbc1',(1-n/19)*1.08,2);
 if(n%3===0)dustCloud(curve(u2),2+n*.41,i*19+n,[.58,.49,.43],.18*(1-n/21))}if(age>D&&age<D+.53)flare(curve(1),44*(1-(age-D)/.53),'#ffad59',1.3)}
for(let j=0;j<4;j++){let age=t-hits[j];if(age>=0&&age<.94){let p=add(targets[j],[-20,4,32]);flare(p,(j===0||j===3?70:34)*(.4+.6*Math.sin(Math.PI*age/.94)),'#ffb26c',1.6*(1-age/.94));for(let i=0;i<26;i++){let a=i*TAU/26,b=(i+1)*TAU/26;let ring=u=>add(p,add(mul(rt,Math.cos(u)*(16+age*91)),mul(up,Math.sin(u)*(16+age*91))));ray(ring(a),ring(b),2,2,'#ffa35c',1-age/.94)}}}}
function waveDelay(i){return i?.72+1.76*clamp((ships[i].p[0]+1400)/3500)+Math.abs(ships[i].p[2])*.00041:0}
function shieldPhase(t,i){return (t<3?t+80:t)-65.15-waveDelay(i)}
function shields(t){if(t<3||t>65){use(shieldP);gl.bindVertexArray(sv);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);for(let i=0;i<ships.length;i++){let ph=shieldPhase(t,i);if(ph<=0)continue;let open=sm(0,1.8,ph),amp=open*(1-sm(74,81.8,t<3?t+80:t));shield(add(shipPos[i],i?[0,6,0]:[5,22,0]),mul(i?[126,40,ships[i].type?73:57]:[602,153,278],.78+.22*open),ph,amp)}gl.depthMask(true);gl.disable(gl.BLEND)}}
function exterior(t){inside=0;localLight= t>49&&t<65?[1,.48,.16]:[.19,.77,1];lightPos=t>49&&t<65?(t<54?[520,6,0]:targets[t<57?1:t<61?2:3]):[-495,0,130];power=t>49&&t<65?18000*(.26+.74*Math.abs(Math.sin(t*3))):2500*(1+boost);
if(t>=49&&t<65){let a=hits.map((h,i)=>Math.max(0,t-h)<.001?0:Math.exp(-(t-h)*(i===0?1.0:2.5))),j=a.indexOf(Math.max(...a));
if(t<52.5){lightPos=[538,7,0];power=12000*sm(49.1,52.45,t)}else{lightPos=add(targets[j],[-30,8,28]);power=24500*a[j]+(t<54.25?6400:0)}}
if(t<29.8)camera(path(t,exteriorEye),path(t,exteriorLook),43+23*sm(15,22,t),-.031+.02*sm(17,23,t));
else if(t<55.3){camera(path(t,[[49,813,105,253],[50.5,742,110,418],[52.3,590,141,629],[55.3,626,154,652]]),
 path(t,[[49,457,9,0],[50.5,488,13,2],[52.3,703,18,5],[55.3,802,25,13]]),49,-.045)}
else if(t<57.3){let s=(t-55.3)/2;camera(vp([-245,128,400],[60,147,498],s),vp([110,35,100],[425,42,109],s),62,-.041)}
else if(t<62.4){let e=path(t,[[57.3,217,79,693],[58.9,362,87,736],[60.2,590,101,719],[62.4,885,158,584]]),v=path(t,[[57.3,474,-27,355],[58.9,620,-10,295],[60.2,880,16,297],[62.4,1176,83,136]]);camera(e,v,64,-.051)}
else if(t<66){let s=(t-62.4)/3.6;camera(vp([918,156,494],[987,128,434],s),vp([1202,76,111],[1228,73,93],s),52,-.043)}
else{let e=path(t,[[66,-783,296,1120],[70,-523,378,1283],[74,140,456,1240],[77.7,795,598,780],[78.9,814,583,755],[80,760,563,773]]),v=path(t,[[66,50,12,0],[73,31,9,0],[80,4,4,0]]);camera(e,v,43,-.031)}
sky();solids();fleet();drawDock(t);stones(t);if(t>=49&&t<66)fx(t)}
function room(t){inside=1;localLight=[.13,.81,.97];let s;
if(t<36.3){
 s=(t-29.8)/6.5;
 camera(path(t,[[29.8,-37,33,65],[32.4,-16,34,48],[34.7,7,33,39],[36.3,24,31,38]]),
        vp([5,24,-15],[-3,26,-14],s),66-6*s,-.012);
 lightPos=[0,28,-8];power=410;sky();solids();
 for(let j=0;j<6;j++)draw(j%2?lancer:guard,[-330+j*121+s*(45+j*7),21+j%3*19,-421-j*78],[0,-.43,0]);
 draw(command);
 let turn=-.65+.39*s;
 gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);fl('holographic',1);
 draw(hologram,[0,28+.4*Math.sin(t),-8],[.13,turn,.045]);
 fl('holographic',0);gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
 function chart(a,r,y,tilt=0){let dz=r*Math.sin(a);return [Math.cos(a)*r,y+dz*tilt,-8+dz*.84]}
 for(let k=0;k<2;k++)for(let j=0;j<96;j++){
  if(j%24>20)continue;
  let a=j*TAU/96,kTilt=k?.50:0,yy=k?29:18;
  ray(chart(a,k?18:17,yy,kTilt),chart(a+TAU/96,k?18:17,yy,kTilt),.16,.16,k?'#5acadb':'#8ae7eb',.85,2);
  if(j%4===0)ray(chart(a,17,18),chart(a,j%12?17.6:18.4,18),.16,.16,'#a5e5de',.9,2)
 }
 for(let j=-2;j<=2;j++){ray([j*4,16,-21],[j*4,16,5],.14,.14,'#83f5ff',.6);ray([-11,16,-8+j*5],[11,16,-8+j*5],.14,.14,'#83f5ff',.6)}
 for(let i=0;i<9;i++){let a=t*.27+i*TAU/9,p=chart(a,16.8,18.3);flare(p,.7,i%3?aqua:amber,.85);
  ray([p[0]*.29,16,-8+(p[2]+8)*.29],p,.38,.09,'#56cfdf',.32)}
}
else if(t<43.6){s=(t-36.3)/7.3;camera([85*Math.cos(.61+s*.84),59+s*145,88*Math.sin(.61+s*.84)],[0,97+s*23,0],76,.018);lightPos=[0,91+s*54,0];power=5800*(.9+.1*Math.sin(t*3));localLight=[1,.50,.16];sky();solids();draw(atrium);draw(spindle,zero,[0,t*.19,0]);
 for(let j=0;j<7;j++){
  let y=[16,46,83,121,161,199,233][j]+Math.sin(t*.9+j)*1.8;
  draw(j%3===0?greatCollar:collar,[0,y,0],[Math.sin(t*.44+j)*.16,t*(j%2?.24:-.21)+j*.63,Math.sin(t*.38-j)*.20]);
 }
 for(let i=0;i<3;i++)for(let j=0;j<60;j++){
  let y=j*4,phi=t*.55+y*.036+i*TAU/3,r=13+5*Math.cos(y*.045);
  let q=[Math.cos(phi)*r,y,Math.sin(phi)*r],p=[Math.cos(phi+.144)*r,y+4,Math.sin(phi+.144)*r];
  let pulse=.6+.4*Math.cos(y*.10-t*3.8);
  ray(q,p,1.8,.9,i===1?'#83ecf5':'#ffc365',.35+pulse*.56,2)
 }
 for(let y of [51,186])for(let k of [-1,1]){let q=(t*.43+y*.03)%1,p=[k*(25+q*67),y+(1-q)*16+7,-29];ray(p,add(p,[k*9,-2,0]),2,1.3,'#ffcb68',1.2)}
}

else{s=(t-43.6)/5.4;camera(vp([-13,24,148],[9,32,7],s),vp([4,31,-109],[-3,28,-172],s),66,-.018);lightPos=[0,30,67-s*120];power=1200;localLight=[1,.53,.18];sky();solids();draw(conduit);for(let k of [-1,1])for(let i=0;i<12;i++){let z=152-i*28,q=.5+.5*Math.sin(t*2+i*.7);draw(clampJaw,[k*(24+3*q),39-4*q,z]);for(let y of [6,59])draw(charge,[k*25,y,z-((t*21+i%3*2)%28)]);
 if(i%3===0){let p=[k*15,6,158-((i*28+t*43+k*13)%336)];draw(transferCradle,p);ray(add(p,[0,1,6]),add(p,[0,1,18]),2,.6,'#ffab4e',.6,1)}ray([k*27,22,z],[k*27,42,z],3,3,'#ff9e40',.39+.18*q)}}}
function render(t){tm=((t%duration)+duration)%duration;let w=Math.round(innerWidth*devicePixelRatio),h=Math.round(innerHeight*devicePixelRatio);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}lensStart(w,h);gl.viewport(0,0,w,h);gl.clearColor(.02,.03,.05,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);motion(tm);if(tm>=29.8&&tm<49)room(tm);else exterior(tm);lensFinish(w,h);gl.flush()}
let base=performance.now(),exporting=false,exportFps=60,lastTime=0;
window.videoExport={runs:['tour'],async begin(id,{fps=60}={}){if(id!=='tour')throw Error('Unknown run');exporting=true;exportFps=fps;lastTime=0;render(0);return {frames:Math.round(duration*fps)}},async frame(i){lastTime=i/exportFps;render(lastTime);gl.finish()},end(){base=performance.now()-lastTime*1000;exporting=false}};
function animate(now){if(!exporting){lastTime=(now-base)/1000;render(lastTime)}requestAnimationFrame(animate)}render(0);requestAnimationFrame(animate);
