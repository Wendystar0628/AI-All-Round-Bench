'use strict';
const rides=[],raceRuns=[];
function rideSheen(ride,c){
 const {path,rx,ry,duration,axis}=ride,pos=[],uv=[],top=[],indices=[];
 const level=-ry+.49,halfWidth=rx*Math.sqrt(Math.max(.24,1-(level/ry)**2))*.85;
 const sections=[0];for(let i=2;i<path.n;i+=2)sections.push(i);sections.push(path.n);
 for(const i of sections){
  const p=path.p[i],u=axis?vec(0,1,0):path.up[i],r=axis?vec(1,0,0):path.r[i];
  const cross=[[-1,level-.27,0],[-1,level,1],[0,level+.025,1],[1,level,1],[1,level-.27,0]],first=pos.length/3;
  for(const [side,y,lit] of cross){const q=p.clone().addScaledVector(u,y).addScaledVector(r,side*halfWidth);
   if(!lit)q.set(snap(q.x,.125),snap(q.y,.125),snap(q.z,.125));
   pos.push(q.x,q.y,q.z);uv.push(side,duration[i]);top.push(lit);
  }
  if(first)for(let k=0;k<4;k++){const j=first+k;indices.push(j-5,j-4,j,j,j-4,j+1)}
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setAttribute('surface',new T.Float32BufferAttribute(top,1));g.setIndex(indices);g.computeBoundingSphere();
 const m=new T.ShaderMaterial({side:T.DoubleSide,transparent:true,depthWrite:false,uniforms:{tm:clockTime,rate:{value:ride.tempo},tint:{value:color(c).clone().lerp(color(0x94efed),.33)}},
 vertexShader:`attribute float surface;varying vec2 coord;varying float lit;void main(){coord=uv;lit=surface;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform vec3 tint;uniform float tm,rate;varying vec2 coord;varying float lit;
 void main(){float t=(coord.y-tm*rate)*10.;float rip=sin(t*2.5+coord.x*3.2)+.5*cos(t-coord.x*5.);float shine=smoothstep(1.27,1.49,rip)*lit;
 gl_FragColor=vec4(mix(tint,vec3(.9,1.,.98),shine*.78),mix(.34,.46,lit)+shine*.36);
 #include <colorspace_fragment>
 }`});
 const mesh=new T.Mesh(g,m);mesh.renderOrder=4;scene.add(mesh);
}
function basinFilm(across,along,point,tint){
 const pos=[],uv=[],index=[];
 for(let j=0;j<=along;j++)for(let i=0;i<=across;i++){
  const u=i/across,v=j/along,p=point(u,v);pos.push(p.x,p.y,p.z);uv.push(u,v);
  if(i&&j){const b=j*(across+1)+i;index.push(b-across-2,b-across-1,b,b-across-2,b,b-1)}
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(index);
 const mat=new T.ShaderMaterial({uniforms:{tm:clockTime,body:{value:color(tint).clone().lerp(color(C.ice),.32)}},
  side:T.DoubleSide,transparent:true,depthWrite:false,vertexShader:`varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 st;uniform float tm;uniform vec3 body;
  void main(){float a=st.x*37.6991+.94*sin(st.y*15.-tm*.75),b=st.y*79.-tm*6.;
   float light=smoothstep(1.65,1.96,sin(a+.24*b)+cos(b+1.7*sin(a*.5)));
   gl_FragColor=vec4(mix(body,vec3(.92,1.,.97),light*.71),.25+light*.46);
   #include <colorspace_fragment>
  }`});
 const mesh=new T.Mesh(geo,mat);mesh.renderOrder=4;scene.add(mesh);
}
function flume(name,points,opt={}){
 const plan=typeof points==='string'?mountainRoutes.get(points):null;
 const path=plan?plan.path:tablePath(spline(points),.155),rx=plan?.rx??opt.rx??1.8,ry=plan?.ry??opt.ry??rx,co=opt.color||C.blue,closed=!!opt.tube,lip=opt.lip||C.snow;
 const bb=new T.Box3().setFromPoints(path.p);bb.expandByScalar(Math.max(rx,ry)+1);
 const solids=new VoxelForm(bb.min.toArray(),bb.max.toArray()),glass=closed&&opt.windows!==false?new VoxelForm(bb.min.toArray(),bb.max.toArray()):null;
 solids.norms=new Uint32Array(solids.cells.length);if(glass)glass.norms=new Uint32Array(glass.cells.length);
 const body=solids.paint(co),stripe=solids.paint(opt.band||tinted(co,.88)),rim=solids.paint(lip),glow=solids.paint(tinted(co,1.095)),glassID=glass?glass.paint(0x9fe8ee):0;
 const arc=closed?TAU:PI*1.06,K=Math.ceil(arc*Math.max(rx,ry)/.145),profile=[];
 for(let k=0;k<=K;k++){const a=-arc/2+k*arc/K;profile.push([Math.sin(a),-Math.cos(a),Math.abs(k-K/2)/(K/2)])}
 for(let i=0;i<=path.n;i++){const p=path.p[i],r=opt.axis?vec(1,0,0):path.r[i],u=opt.axis?vec(0,1,0):path.up[i],ds=path.len*i/path.n,band=ds%(opt.pitch||5.75),end=i<2||i>path.n-3;
 for(const q of profile){const isGlass=glass&&!end&&((opt.clear&&band>.49)||(ds%18>10.5&&ds%18<15.6))&&q[1]>-.42&&Math.abs(q[0])>.008&&!(Math.abs(q[0])>.97&&opt.clear);
 const field=isGlass?glass:solids,id=isGlass?glassID:end?rim:!closed&&q[2]>.95?rim:closed&&band<.43? (opt.ribColor?solids.paint(opt.ribColor):rim):closed&&band<.67?stripe:q[0]>.81&&q[0]<.90?glow:body;
 const hq=q[0]/rx,vq=q[1]/ry,inv=1/Math.hypot(hq,vq);
 const nx=(r.x*hq+u.x*vq)*inv,ny=(r.y*hq+u.y*vq)*inv,nz=(r.z*hq+u.z*vq)*inv;
 field.ref=(Math.round((nx+1)*127)<<16)|(Math.round((ny+1)*127)<<8)|Math.round((nz+1)*127);
 const starRow=(Math.floor(ds/3.35)*7)%13+2,du=Math.abs(band-1.65),dv=Math.abs(q[2]*16-starRow);
 const paint=opt.stars&&((du<.145&&dv<1.18)||(du<.39&&dv<.41))?solids.paint(ds%6.7<3.35?C.ice:C.butter):id;
 let outer=(closed&&band<.42||!closed&&q[2]>.95)?.13:0;
 for(let layer=0;layer<2;layer++){let dr=outer-layer*.175,xx=(rx+dr)*q[0],yy=(ry+dr)*q[1];field.dot(p.x+r.x*xx+u.x*yy,p.y+r.y*xx+u.y*yy,p.z+r.z*xx+u.z*yy,paint)}
 }}
 solids.finish();if(glass)glass.finish('glass');
 if(opt.support!==false){const gap=opt.gap||12;
 for(let distance=gap*.67;distance<path.len-4;distance+=gap){let i=Math.floor(distance/path.len*path.n),p=path.p[i],floor=Math.max(.25,terrainY(p.x,p.z)),top=p.y-ry-.22;if(top<floor+1.7||rideFootprint(p.x,p.z,1))continue;
 const width=rx>2?.9:.65,c=opt.supportColor||0x97caca,side=opt.axis?vec(1,0,0):path.r[i];
 for(const offset of [0,rx+1.25,-rx-1.25,rx+2.5,-rx-2.5]){
  const xx=p.x+side.x*offset,zz=p.z+side.z*offset,base=Math.max(.25,terrainY(xx,zz));
  if(!clearOfTracks(xx,zz,base,top-.24,width*.65,path,i))continue;
  column(xx,zz,base,top,width,c);box(xx,base+.25,zz,width+1.08,.5,width+1.08,C.cream);
  beam(xx,top-.3,zz,p.x,top-.3,p.z,width,C.white);
  if(top-base>5){const dx=side.x*rx*.72,dz=side.z*rx*.72;
   beam(xx,top-2,zz,p.x+dx,top+.1,p.z+dz,.35,c);
   if(!offset)beam(xx,top-2,zz,p.x-dx,top+.1,p.z-dz,.35,c)}
  break;
 }
 }}
 // Distance travelled is integrated from local slope and available potential energy.
 const duration=[0];for(let i=1;i<=path.n;i++){const slope=path.t[i].y,v=Math.max(2.9,(opt.launch?2.9:7)+Math.sqrt(Math.max(0,path.p[0].y-path.p[i].y)*9.5)-slope*3.8);duration.push(duration[i-1]+path.len/path.n/v)}
 const total=duration[path.n],tempo=opt.race===undefined?1:1.02+opt.race*.010;
 const scheduled=opt.race!==undefined||opt.launch,period=scheduled?40:Math.max(opt.cycle||0,total+7);
 let depart=opt.launch?25.2:opt.race!==undefined?30:.75-(opt.delay??rnd(0,9));
 if(points==='coaster'){
  const crest=vec(132,29.6,-78);let index=0;
  for(let i=1;i<=path.n;i++)if(path.p[i].distanceToSquared(crest)<path.p[index].distanceToSquared(crest))index=i;
  depart=50.7-duration[index];
 }
 if(points==='halo'){
  const bottom=vec(-31,19.5,-72);let index=0;
  for(let i=1;i<=path.n;i++)if(path.p[i].distanceToSquared(bottom)<path.p[index].distanceToSquared(bottom))index=i;
  depart=37.35-duration[index];
 }
 const ride={name,path,rx,ry,axis:opt.axis,duration,total,tempo,period,depart};
 rides.push(ride);rideSheen(ride,co);
 if(opt.race!==undefined)raceRuns[opt.race]=ride;
 if(opt.raft!==false)rideVehicle(ride,opt);
 if(opt.splash!==false){const p=path.p[path.n];splash(p.x,Math.max(.6,p.y-ry+.12),p.z,Math.min(1.4,rx*.52))}
 return ride;
}
const trackBasis=new T.Matrix4();
function seatOnTrack(ride,seconds,o){
 const {path,duration}=ride;
 let lo=0,hi=path.n;
 while(hi-lo>1){const mid=(hi+lo)>>1;if(duration[mid]<=seconds)lo=mid;else hi=mid}
 const f=clamp((seconds-duration[lo])/(duration[hi]-duration[lo]),0,1);
 const d=path.t[lo].clone().lerp(path.t[hi],f).normalize(),side=path.r[lo].clone().lerp(path.r[hi],f).normalize();
 const up=vec().crossVectors(side,d).normalize(),localX=vec().crossVectors(up,d).normalize();
 o.position.lerpVectors(path.p[lo],path.p[hi],f).addScaledVector(ride.axis?vec(0,1,0):up,-ride.ry+.51);
 o.quaternion.setFromRotationMatrix(trackBasis.makeBasis(localX,up,d));
 const next=path.t[Math.min(lo+8,path.n)],turn=side.dot(next)-side.dot(d);
 o.position.addScaledVector(side,-clamp(turn*ride.rx*2.6,-ride.rx*.23,ride.rx*.23));
 o.rotateZ(clamp(turn*1.4,-.30,.30));
}
function runout(ride,age,t,o){
 const p=ride.path,end=p.p[p.n],heading=p.t[p.n],direction=vec(heading.x,0,heading.z).normalize();
 let drift=4.1*(1-Math.exp(-1.08*age));
 const basin=landings.find(([x,z,rx,rz])=>Math.abs(end.x-x)<rx&&Math.abs(end.z-z)<rz);
 if(basin){const [x,z,rx,rz]=basin;
  for(const [origin,delta,centre,radius] of [[end.x,direction.x,x,rx],[end.z,direction.z,z,rz]]){
   if(Math.abs(delta)>.001)drift=Math.min(drift,Math.max(0,((centre+Math.sign(delta)*(radius-.85))-origin)/delta));
  }
 }
 o.position.addScaledVector(direction,drift);
 o.position.y=mix(o.position.y,.85+.065*Math.sin(t*1.6),smooth(0,.72,age));
 const flat=new T.Quaternion().setFromAxisAngle(vec(0,1,0),Math.atan2(direction.x,direction.z));
 o.quaternion.slerp(flat,smooth(0,.8,age));
}
function impact(ride,finish,period,strength){
 const p=ride.path.p[ride.path.n];
 for(let j=0;j<12;j++){const a=j*TAU/12+.15,spread=.1*strength;
  jet(p.x+Math.cos(a)*.45,.7,p.z+Math.sin(a)*.45,Math.cos(a)*strength*2.7,4.65*strength,Math.sin(a)*strength*2.7,.9,8,spread,.18,5,finish,period)}
}
function rideVehicle(ride,opt){
 const key=floatRing(opt.floatColor||C.yellow,opt.type||'ring');
 const trip=ride.total/ride.tempo;impact(ride,ride.depart+trip,ride.period,opt.type==='raft'?1.25:.95);
 actor(key,(time,o)=>{
  const local=frac((time-ride.depart+2.65)/ride.period)*ride.period-2.65;
  seatOnTrack(ride,clamp(local*ride.tempo,0,ride.total),o);
  let scale=(opt.scale||Math.min(1,(ride.rx-.18)/1.06))*smooth(-2.65,-2.15,local);
  if(local<0){const pending=1-smooth(-2.45,-1.15,local);o.position.addScaledVector(ride.path.t[0],-pending*.85);
   if(opt.launch)o.position.y=61.55}
  else if(opt.launch&&local<.35)o.position.y=mix(61.55,o.position.y,smooth(0,.35,local));
  if(local>trip){const age=local-trip;runout(ride,age,time,o);scale*=1-smooth(3.45,4.18,age)}
  o.scale.setScalar(scale);
 });
}
function linkedRaft(inlet,outlet,key,bodyDuration,bodyPose,phase,scale=1){
 const join=new T.Object3D(),period=inlet.total+bodyDuration+outlet.total+6.2;
 const finish=inlet.total+bodyDuration+outlet.total;impact(outlet,finish-phase,period,1.12);
 actor(key,(time,o)=>{
  const elapsed=frac((time+phase+.9)/period)*period-.9;
  if(elapsed<inlet.total){seatOnTrack(inlet,Math.max(0,elapsed),o)}
  else if(elapsed<inlet.total+bodyDuration){
   const t=elapsed-inlet.total;bodyPose(t/bodyDuration,o);
   if(t<.40){seatOnTrack(inlet,inlet.total,join);const u=smooth(0,.4,t);o.position.lerp(join.position,1-u);o.quaternion.slerp(join.quaternion,1-u)}
   if(t>bodyDuration-.44){seatOnTrack(outlet,0,join);const u=smooth(bodyDuration-.44,bodyDuration,t);o.position.lerp(join.position,u);o.quaternion.slerp(join.quaternion,u)}
  }else{const t=elapsed-inlet.total-bodyDuration;seatOnTrack(outlet,Math.min(t,outlet.total),o);if(t>outlet.total)runout(outlet,t-outlet.total,time,o)}
  o.scale.setScalar(scale*smooth(-.9,-.35,elapsed)*(1-smooth(finish+3.5,finish+4.2,elapsed)));
 });
}
function tower(x,z,base,levels,width,accent,name,num){
 const d=width*.86,top=levels.at(-1),post=width>13?1.05:.85;
 slab(x,z,width+2.25,d+2.5,Math.min(base-3,terrainY(x,z)-1),base+.5,0xd8d3b9);slab(x,z,width+2.7,d+3,base+.5,base+1,C.white);
 for(let ix of [-1,1])for(let iz of [-1,1]){const xx=x+ix*(width/2-.72),zz=z+iz*(d/2-.72);
 column(xx,zz,base,top+1,post,C.white);box(xx,base+1.75,zz,post+1,2.85,post+1,0xb0d7d8);
 for(let y=base+5.25;y<top;y+=8){box(xx,y,zz,post+.25,.75,post+.25,accent)}
 }
 let prev=base+1;for(let i=0;i<levels.length;i++){let y=levels[i];
 slab(x,z,width+1.45,d+1.5,y-.85,y-.27,accent);slab(x,z,width+1.9,d+2,y-.27,y+.17,C.snow);
 for(let sz of [-1,1]){let zz=z+sz*(d/2-.75);beam(x-width/2+.75,prev+.3,zz,x+width/2-.75,y-.67,zz,.45,0xb0d8d9);if(i%2===0)beam(x+width/2-.75,prev+.3,zz,x-width/2+.75,y-.67,zz,.43,0xbedfe0)}
 guard(x-width/2-.6,z-d/2-.65,x+width/2+.6,z-d/2-.65,y+.18,C.white,1.65);guard(x-width/2-.6,z+d/2+.65,x-width*.14,z+d/2+.65,y+.18,C.white,1.65);
 guard(x-width/2-.59,z-d/2-.62,x-width/2-.59,z+d/2+.62,y+.18,C.white,1.65);
 for(let k=0;k<3;k++)box(x+width/2+.65,y-.61,z+(k-1)*d*.29,.5,.45,1.7,C.yellow);
 prev=y+.17;
 }
 // Four-sided central stair, with continuous stepped handrails.
 const b=width*.24,sideSteps=Math.max(8,Math.round(b*2/.62)),n=Math.ceil((top-base-.5)/.25);
 for(let i=0;i<n;i++){const j=i%(sideSteps*4),s=Math.floor(j/sideSteps),u=(j%sideSteps+.5)/sideSteps,rx=[mix(-b,b,u),b,mix(b,-b,u),-b][s],rz=[-b,mix(-b,b,u),b,mix(b,-b,u)][s],y=base+.5+i*.25;
 box(x+rx,y,z+rz,s%2?1.85:.75,.4,s%2?.75:1.85,i%4?C.cream:C.white);
 const xx=x+rx+(s===1?.93:s===3?-.93:0),zz=z+rz+(s===0?-.93:s===2?.93:0);if(i%3===0)column(xx,zz,y,y+1.24,.125,accent);box(xx,y+1.24,zz,s%2?.24:.75,.18,s%2?.75:.24,accent,'solid',.125);
 }
 for(let ix of [-1,1])for(let iz of [-1,1])column(x+ix*(width/2-.72),z+iz*(d/2-.72),top,top+4.6,post*.79,C.white);
 for(let j=0;j<5;j++){slab(x,z,width+3.0-j*1.36,d+3.3-j*1.25,top+4.58+j*.42,top+5.05+j*.42,j===0?C.white:j===1?accent:tinted(accent,1.08))}
 box(x,top+3.73,z+d/2+1.05,width*.93,2.2,.5,accent);
 lettering(x,top+3.7,z+d/2+1.32,width*.9,1.85,name,name==='晴空塔'?'S K Y   T O W E R':name==='海旋塔'?'C O R A L   C A P E':'F A M I L Y   B A Y','#197995','#fff9e4',0,num);
 return {x,z,top,width,base};
}
const skyTower=tower(-2,-91,21,[33.75,46,60.5],14.25,C.blue,'晴空塔','01');
const westTower=tower(-94,-88,15,[28.5,43],11,C.coral,'海旋塔','02');
const eastTower=tower(83,-88,13.5,[23.5,34.75],11,C.mint,'浅湾塔','03');
{
 const x=-2,z=-91,y=67.35;slab(x,z,8.75,6.5,y-.6,y+.43,C.deep);
 for(let s of [-1,1])column(x+s*3,z,y,y+2,.72,C.white);
 faceHoop(x,y+6.15,z,5.45,1.18,1.65,C.yellow);
 for(let j=0;j<38;j++){const xx=-5.55+j*.3,yy=y+3.9+.72*Math.sin(xx*.58-.2);box(x+xx,yy,z+.75,.35,1.02,1.5,C.white);box(x+xx,yy-.89,z+.75,.35,.56,1.5,C.blue)}
 column(x+5.95,z,y-.75,y+11.15,.25,C.white);template('windsock',()=>{for(let j=0;j<9;j++)box(j*.5,-Math.sin(j*.19)*.48,0,.6,1.3-j*.09,1.3-j*.09,j%3===1?C.white:C.coral)});
 actor('windsock',(t,o)=>{o.position.set(x+6.1,y+10.65,z);o.rotation.y=-.35+.31*Math.sin(t*1.42);o.rotation.z=.03+.10*Math.cos(t*1.61)});
}
function conveyor(x,z,top,base,run,c){
 const N=Math.ceil((top-base)*2.5);for(let j=0;j<N;j++){let u=j/N;box(x,mix(base,top,u),z+run*(1-u),2.75,.45,run/N+.25,j%4===0?C.metal:C.navy);for(let s of [-1,1])box(x+s*1.56,mix(base,top,u)+.23,z+run*(1-u),.43,.6,run/N+.28,c)}
 for(let j=0;j<5;j++){let u=(j+.2)/5,zz=z+run*(1-u);column(x,zz,terrainY(x,zz),mix(base,top,u),.7,C.white)}
 const key=floatRing(c);for(let i=0;i<4;i++)actor(key,(t,o)=>{const q=frac(t*.035+i*.25);o.position.set(x,mix(base,top,q)+.48,z+run*(1-q));o.rotation.x=Math.atan((top-base)/run);o.scale.setScalar(.92)})
}
conveyor(-10.5,-90,46,4.6,29,C.yellow);conveyor(-100.5,-89,42.9,5.5,27,C.coral);conveyor(76,-90,34.5,5,25,C.mint);
function attractionBoard(x,y,z,num,title,en,c='#157f9b',w=5.1){column(x-w*.36,z,y,y+2.72,.25,C.white);column(x+w*.36,z,y,y+2.72,.25,C.white);box(x,y+2.18,z,w,2.18,.44,C.white);lettering(x,y+2.18,z+.238,w-.3,1.9,title,en,c,'#fffbed',0,num)}
const launchRide=flume('垂直高速滑道','drop',{rx:1.65,ry:1.45,color:0xff9569,lip:C.butter,launch:true,floatColor:C.sky});
{
 const x=-8.5,z=-85.5;for(let s of [-1,1]){box(x+s*1.7,63.5,z,.25,4.75,3.5,C.ice,'glass');column(x+s*1.75,z+1.6,61.25,66,.32,C.white)}
 box(x,63.6,z-1.65,3.5,4.75,.25,C.ice,'glass');box(x,66,z,4,.5,4,C.yellow);
 template('trapdoor',()=>box(0,0,.9,3.1,.26,1.8,C.deep));actor('trapdoor',(t,o)=>{let tt=t%40,a=smooth(25.18,25.52,tt)*(1-smooth(27.0,27.8,tt));o.position.set(x,61.28,z-.85);o.rotation.x=a*1.35});
 for(let j=0;j<3;j++){const m=new T.MeshBasicMaterial({color:C.navy}),o=new T.Mesh(cube,m);o.scale.set(.7,.7,.25);o.position.set(x-1.05+j*1.05,65.8,z+2.2);scene.add(o);perFrame.push(t=>m.color.setHex(t%40>22.2+j*.92&&t%40<25.7?[C.coral,C.yellow,C.mint][j]:0x48808c))}
}
flume('日晕回环','halo',{tube:true,clear:true,color:0xeb99bc,ribColor:C.pink,lip:C.pink,pitch:3.9,floatColor:C.yellow,gap:15,delay:6.4});
for(let k=0;k<2;k++)flume(k?'柠檬螺旋':'晴空螺旋',k?'sunTwist':'skyTwist',{color:k?C.yellow:C.blue,tube:true,ribColor:k?C.butter:C.ice,floatColor:k?C.pink:C.yellow,gap:15,delay:k*3.45});
const raceColor=[0xf98286,0xffad65,0xffdb50,0x85d99f,0x66cce3,0xb29bdb];
{
 const w=2.75;slab(12.4,-86.4,20,6.4,45.25,45.95,C.ice);slab(12.4,-86.4,20.6,6.7,45.95,46.25,C.white);guard(3.0,-89.6,21.9,-89.6,46.25);for(let x of [4.1,12.5,21]){column(x,-88,terrainY(x,-88),46,.8,C.white);column(x,-88,46,50,.46,C.white)}
 for(let j=0;j<6;j++){const dx=(j-2.5)*w;box(14+dx,50.15,-86.6,w,.50,5.8,raceColor[j]);
 flume('彩虹竞速 '+(j+1),'race'+j,{axis:true,rx:1.38,ry:.85,color:raceColor[j],lip:tinted(raceColor[j],1.09),race:j,type:'mat',scale:.82,floatColor:j%2?C.ice:C.yellow,support:j===0||j===5,gap:10});
 }
 for(let x of [38.75,57.25]){column(x,-49,.75,6.8,.65,C.white);box(x,6.8,-49,.9,.45,1,C.yellow)}
 box(48,6.15,-49,19,1.35,.85,C.deep);lettering(48,6.16,-48.55,18.5,1.0,'R A I N B O W    R U N','','#2689a2','#fffbdf');
 const ranked=[...raceRuns].sort((a,b)=>a.total/a.tempo-b.total/b.tempo);
 for(let j=0;j<6;j++){
  const track=raceRuns[j],xx=48+(j-2.5)*w,finish=track.depart+track.total/track.tempo;
  const lens=new T.Mesh(cube,new T.MeshBasicMaterial({color:0x356575}));lens.position.set(xx,5.05,-49);lens.scale.set(1.70,.90,.60);scene.add(lens);
  const digit=plaque(xx,5.08,-48.67,1.37,.76,(g,W,H)=>{g.fillStyle='#ffdd71';g.fillRect(0,0,W,H);g.fillStyle='#25576c';g.textAlign='center';g.font='900 '+H*.90+'px Arial';g.fillText(String(ranked.indexOf(track)+1),W/2,H*.82)},0,64);
  perFrame.push(t=>{const on=t%40>=finish&&t%40<38.5;digit.visible=on;lens.material.color.setHex(on?C.butter:0x356575)})
 }
}
flume('星际暗河','night',{tube:true,rx:1.75,ry:1.75,color:0x344c73,windows:false,stars:true,lip:C.lilac,ribColor:0xafa2d2,pitch:3.35,floatColor:C.mint,gap:14,type:'double'});
const funnelIn=flume('日光漏斗进水道','funnelIn',{raft:false,tube:true,rx:1.6,ry:1.6,color:C.orange,lip:C.butter,floatColor:C.pink,gap:11,splash:false});
{
 const orig=vec(-127.5,18.8,-80),axis=vec(.17,.35,1).normalize(),rt=vec().crossVectors(axis,vec(0,1,0)).normalize(),up=vec().crossVectors(rt,axis).normalize();
 const form=new VoxelForm([-148,7,-87],[-106,46,-52]),col=[0xffbc4c,0xffd96a,0xf79754,0xffca50].map(c=>form.paint(c)),white=form.paint(C.white);
 for(let j=0;j<=139;j++){const u=j/139,r=2.4+12.35*Math.pow(u,.85),len=18.1*u,cen=orig.clone().addScaledVector(axis,len),n=Math.ceil(TAU*r/.145);
 for(let k=0;k<n;k++){const a=k*TAU/n,ca=Math.cos(a),sa=Math.sin(a),id=u>.97||u<.045||Math.abs(u-.35)<.016?white:col[(Math.floor(k/n*12)+Math.floor(u*1.95))%4];
 for(let layer=0;layer<2;layer++){let rr=r-layer*.19,xx=ca*rr,yy=sa*rr;form.dot(cen.x+rt.x*xx+up.x*yy,cen.y+rt.y*xx+up.y*yy,cen.z+rt.z*xx+up.z*yy,id)}
 }}
 form.finish();for(const u of [.22,.61,.91])for(const side of [-1,1]){
 const a=-PI/2+side*.60,r=2.45+12.35*u**.85,foot=orig.clone().addScaledVector(axis,18.1*u).addScaledVector(rt,(r+.3)*Math.cos(a)).addScaledVector(up,(r+.3)*Math.sin(a));
 const base=terrainY(foot.x,foot.z);column(foot.x,foot.z,base,foot.y-.16,.85,C.white);box(foot.x,base+.2,foot.z,1.7,.45,1.7,C.cream);
 }
 basinFilm(60,44,(u,v)=>{
  const axial=1-v,angle=-PI*.5+(u-.5)*2.8,r=2.0+12.35*axial**.85;
  return orig.clone().addScaledVector(axis,18.1*axial).addScaledVector(rt,r*Math.cos(angle)).addScaledVector(up,r*Math.sin(angle));
 },C.yellow);
 const drain=flume('漏斗出口','funnelOut',{raft:false,rx:1.85,ry:1.45,color:C.butter,lip:C.orange,type:'ring',floatColor:C.pink});
 linkedRaft(funnelIn,drain,floatRing(C.pink),6.65,(u,o)=>{
  const axial=1-u,angle=-PI*.5+2.29*Math.cos(PI*5.4*u)*Math.exp(-1.55*u);
  const r=1.72+12.35*axial**.85;
  o.position.copy(orig).addScaledVector(axis,18.1*axial).addScaledVector(rt,r*Math.cos(angle)).addScaledVector(up,r*Math.sin(angle));
  o.rotation.set(-.18*Math.sin(angle),.14,.86*Math.cos(angle));
 },funnelIn.total+2.45-45.6,.94);
}
const bowlIn=flume('珊瑚巨碗进水道','bowlIn',{raft:false,rx:1.6,ry:1.45,tube:true,color:C.pink,ribColor:C.cream,floatColor:C.mint,splash:false});
{
 const x=-72,z=-64,base=12.8,R=13.2,form=new VoxelForm([x-R-1,11,z-R-1],[x+R+1,28,z+R+1]),co=[C.pink,0xf5a5ae,C.cream,C.coral,C.snow].map(c=>form.paint(c));
 for(let j=0;j<=116;j++){const u=j/116,r=1.6+(R-1.6)*u,y=base+3.15*u+7.45*u**3.05,n=Math.ceil(TAU*r/.15);
 for(let k=0;k<n;k++){let a=k/n*TAU,id=u>.95||u<.07?co[4]:u>.55&&u<.68?co[2]:u>.85?co[3]:co[Math.floor(k/n*12)%2];for(let q=0;q<2;q++)form.dot(x+r*Math.cos(a),y-q*.22,z+r*Math.sin(a),id)}}
 form.finish();for(let j=0;j<7;j++){let a=j/7*TAU,xx=x+10*Math.cos(a),zz=z+10*Math.sin(a);column(xx,zz,terrainY(xx,zz),17.2,.85,C.white);beam(xx,15.5,zz,x+12*Math.cos(a),21.6,z+12*Math.sin(a),.55,C.ice)}
 basinFilm(96,28,(u,v)=>{const s=1-v,r=1.62+(R-1.95)*s,a=u*TAU;
  return vec(x+r*Math.cos(a),base+3.15*s+7.45*s**3.05+.25,z+r*Math.sin(a));
 },C.pink);
 const drain=flume('巨碗落水管','bowlOut',{raft:false,rx:1.6,ry:1.4,tube:true,color:C.pink,floatColor:C.yellow,support:false});
 linkedRaft(bowlIn,drain,floatRing(C.yellow),6.95,(u,o)=>{
  const r=mix(11.95,1.26,u),a=.258+TAU*(u*1.08+u*u*1.82),s=clamp((r-1.6)/(R-1.6),0,1);
  o.position.set(x+r*Math.cos(a),base+3.15*s+7.45*s**3.05+.55,z+r*Math.sin(a));
  o.rotation.set(.29*Math.sin(a)*s,-a,.40*Math.cos(a)*s);
 },bowlIn.total+3.1-46.6,.91);
}
{
 const cx=-98,z=-61,w=7.5;for(let j=-47;j<=47;j++){let x=j*.25,u=x/11.75,y=6.3+16.5*Math.pow(Math.abs(u),2.38);
 box(cx+x,y,z,.25,.72,w,j%23===0?C.snow:Math.abs(u)>.79?C.lilac:0x99a9e2,'wet');
 for(let s of [-1,1])if(s<0||Math.abs(x)>2.25)box(cx+x,y+.75,z+s*w/2,.25,1.9,.52,C.white,'wet');
 if(j%14===0){column(cx+x,z-2.45,terrainY(cx+x,z-2.45),y-.4,.7,C.ice);column(cx+x,z+2.45,terrainY(cx+x,z+2.45),y-.4,.7,C.ice)}
 }
 for(const side of [-1,1])basinFilm(18,55,(u,v)=>{const dx=(1-v)*11.75;
  return vec(cx+side*dx,6.78+16.5*(dx/11.75)**2.38,z+(u-.5)*6.65);
 },C.lilac);
 const inlet=flume('月牙滑板入口','boardIn',{raft:false,rx:2.35,ry:1.3,color:C.lilac,lip:C.white,floatColor:C.yellow,splash:false});
 const drain=flume('月牙减速水道','boardOut',{raft:false,color:C.lilac,lip:C.white,gap:4});
 linkedRaft(inlet,drain,floatRing(C.yellow,'raft'),7.15,(u,o)=>{
  const pos=-.967*Math.cos(2.5*PI*u)*Math.exp(-.66*u)*(1-smooth(.78,1,u));
  o.position.set(cx+11.75*pos,6.94+16.5*Math.abs(pos)**2.38,mix(-63.3,-58.2,smooth(0,1,u)));
  o.rotation.z=Math.atan(3.34*Math.sign(pos)*Math.abs(pos)**1.38);
 },1.6,.95);
}
flume('翡翠家庭筏','family',{rx:3.05,ry:1.85,color:0x65d4bc,lip:0xc3f3d0,type:'raft',floatColor:C.yellow,gap:13});
for(let j=0;j<2;j++)flume('亲子双人管道','duo'+j,{tube:true,color:j?C.lilac:C.coral,ribColor:j?0xc9bdeb:0xffb098,floatColor:j?C.yellow:C.mint,type:'double',scale:.72,gap:15});
for(let j=0;j<3;j++)flume('短波浪滑梯','ripple'+j,{color:[C.yellow,C.sky,C.pink][j],lip:C.white,support:j===0,type:'mat',scale:.62,floatColor:C.cream});
// A sloping timber gangway connects the low family deck to the three short lanes.
{
 const rows=44;
 for(let i=0;i<=rows;i++){
  const f=i/rows,x=mix(77.25,63.2,f),z=mix(-86,-80.1,f),y=snap(mix(23.55,19.82,f));
  box(x,y,z,.65,.36,2.55,i%3===0?C.cream:C.wood);
  for(let sign of [-1,1]){box(x,y+1.26,z+sign*1.16,.68,.21,.25,C.white,'solid',.125);
   if(i%6===0)column(x,z+sign*1.16,y,y+1.3,.22,C.white)}
 }
 slab(59.6,-79.8,9.25,4.75,19.20,19.85,C.sky);slab(59.6,-79.8,9.65,5.1,19.85,20.05,C.white);
 for(let side of [-1,1]){const xx=59.6+side*4.25;column(xx,-81.66,terrainY(xx,-81.66),24.05,.55,C.white);column(xx,-77.95,terrainY(xx,-77.95),20.10,.52,C.ice)}
 for(let j=0;j<7;j++)box(59.6+(j-3)*1.37,24.0,-80.1,1.4,.40,4.9,j%2?C.snow:C.sky);
 guard(55,-82.1,64,-82.1,20.05,C.white);
 slab(81.1,-94.1,4.85,3.1,34.05,34.78,C.white);
}
const coaster=flume('飞潮水上过山车','coaster',{rx:2.1,ry:1.5,color:0xffbc55,lip:C.cream,type:'double',floatColor:C.blue,gap:11,cycle:16});
for(let j=3;j<coaster.path.n-4;j+=16){const p=coaster.path.p[j],d=coaster.path.t[j];if(d.y>.26){box(p.x,p.y-1.03,p.z,1,.25,.35,C.sky,'wet');jet(p.x,p.y-.93,p.z,d.x*2.2,d.y*2.5,d.z*2.2,.4,6,.07,.17)}}
attractionBoard(-15,3,-55,'04','疾速坠落','FREE FALL','#d77f5a');attractionBoard(36.2,2,-52,'06','彩虹竞速','RAINBOW RUN','#408eab');attractionBoard(-111,5.2,-56,'08','日光漏斗','SUN FUNNEL','#d69840');attractionBoard(94,2,-52,'09','翡翠湾','FAMILY RAFT','#479a8d');
