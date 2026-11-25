'use strict';
const palmPositions=[];
function rideFootprint(x,z,pad=0){
 return Math.hypot(x+72,z+64)<13.55+pad||Math.hypot((x+126.8)/(16.5+pad),(z+71)/(16+pad))<1||Math.abs(x+98)<12.5+pad&&Math.abs(z+61)<4.3+pad;
}
function plantingClear(x,z,pad,h=4){
 if(x>=6-pad&&x<=24+pad&&z>52.2-pad&&z<57.4+pad)return false;
 for(const dock of riverDocks){if(x>dock.x-dock.width*.5-1-pad&&x<dock.x+dock.width*.5+3.65+pad&&z>dock.centre+4-pad&&z<dock.centre+11.6+pad)return false}
 const ground=terrainY(x,z);if(!clearOfTracks(x,z,ground,ground+h,pad))return false;
 if(rideFootprint(x,z,pad)||waterKind(x,z,riverDist(x,z)))return false;
 return !hotSprings.some(([cx,cz,rx,rz])=>Math.hypot((x-cx)/(rx+pad),(z-cz)/(rz+pad))<1);
}
function palm(x,z,height=11,spread=1,base=terrainY(x,z)){
 if(base<-.1||!plantingClear(x,z,2.05,height+2.5)||(z>119&&z<141&&x> -74&&x< -16.5))return;
 palmPositions.push([x,z,height,base]);const yaw=rnd(0,TAU),bend=rnd(.4,1.6),bx=Math.cos(yaw)*bend,bz=Math.sin(yaw)*bend;
 const steps=Math.round(height/.72);
 oval(x,base+.18,z,1.15*spread,1.04*spread,.38,0xb5a379);
 for(let i=0;i<steps;i++){let u=(i+.5)/steps,px=x+bx*u*u,pz=z+bz*u*u,w=(1.02-.35*u+Math.max(0,.24-u)*2)*spread;
 box(px,base+height*u,pz,w,height/steps+.1,w,choice([0xc4ac80,0xbba47e,0xcab288,0xb7a380]));if(i%2===0)box(px,base+height*(i+.88)/steps,pz,w+.16,.18,w+.16,0xac9876,'solid',.125)}
 const cx=x+bx,cz=z+bz,cy=base+height;
 box(cx,cy-.1,cz,1.48,1.35,1.48,0x648655,'leaf');
 const count=10,ang0=rnd(0,TAU);
 for(let k=0;k<count;k++){
 const crown=k%3===0,a=ang0+k*TAU/count+rnd(-.12,.12),dx=Math.cos(a),dz=Math.sin(a);
 const l=height*(crown?rnd(.32,.45):rnd(.47,.62))*spread,tip=crown?rnd(.65,1.55):-rnd(1.45,2.75),rise=l*(crown?.54:.31),wid=l*(crown?.18:.21);
 const blade=crown?choice([0x83be5f,0x92c966,0x91bf56]):choice([0x489b64,0x60aa64,0x6db467,0x528f60,0x64a951]);
 const n=Math.max(9,Math.round(l/.46));
 for(let j=0;j<n;j++){const u=(j+.35)/n,dist=l*u,cyy=cy+Math.sin(PI*u)*rise+u*tip,xx=cx+dx*dist,zz=cz+dz*dist;
 const width=wid*Math.pow(Math.max(.01,Math.sin(PI*(u*.94+.025))),.79)*(1-.27*u);
 box(xx,cyy,zz,Math.abs(dx)*l/n+.23,.22,Math.abs(dz)*l/n+.23,tinted(blade,1.20),'leaf',.125);
 for(const side of [-1,1]){const len=width*((j%4===0)?.85:1),ex=-dz*side*len+dx*len*.63,ez=dx*side*len+dz*len*.63;
 const seg=len>.82?3:2;
 for(let m=0;m<seg;m++){const q=(m+.5)/seg,leafWidth=.11+.155*Math.sin(PI*q);box(xx+ex*q,cyy-.09-len*(.15*q+.42*q*q),zz+ez*q,Math.abs(ex)/seg+leafWidth,.19,Math.abs(ez)/seg+leafWidth,tinted(blade,1.025-q*.065),'leaf',.125)}}
 }}
 for(let k=0;k<3;k++)box(cx+Math.cos(k*2+.2)*.65,cy-.75,cz+Math.sin(k*2+.2)*.6,.62,.72,.6,choice([0x9b9561,0xb0a067,0xa8956a]));
}
const shrubCols=[0x84b86a,0x79b574,0x96c57a,0x6bb378,0x82ba73];
function shrub(x,z,r=1.5,h=r*1.25,c=choice(shrubCols),base=terrainY(x,z),flowers=0){
 if(base<-.5||!plantingClear(x,z,r*.50))return;
 const layers=Math.max(3,Math.ceil(h/.7));
 for(let j=0;j<layers;j++){const u=(j+.5)/layers,s=Math.sqrt(Math.max(.04,1-((u-.32)/.74)**2)),w=r*s,rr=.65;
 for(let dz=-w;dz<w;dz+=rr){const zz=dz+rr/2,ww=w*Math.sqrt(Math.max(.02,1-(zz/w)**2));box(x+(j%2)*.12,base+h*u,z+zz,ww*2,h/layers,rr,tinted(c,.9+u*.13+rnd(-.025,.025)),'leaf')}}
 if(flowers)for(let j=0;j<Math.ceil(r*3);j++){const a=rnd(0,TAU),rad=r*rnd(.18,.78),yy=base+h*(.86-.3*rad/r);box(x+rad*Math.cos(a),yy,z+rad*Math.sin(a),rnd(.3,.65),rnd(.3,.62),rnd(.3,.65),flowers,'leaf')}
}
function broadleaf(x,z,h=6){const y=terrainY(x,z);if(y<0||!plantingClear(x,z,1.5)||(z>117&&z<136&&x> -73&&x< -17))return;column(x,z,y,y+h*.74,.75,0xb59d77);const co=choice(shrubCols);shrub(x,z,h*.32,h*.47,co,y+h*.53);for(let i=0;i<3;i++){const a=rnd(0,TAU);shrub(x+h*.20*Math.cos(a),z+h*.2*Math.sin(a),h*.22,h*.36,tinted(co,rnd(.94,1.07)),y+h*.45)}}
function rosette(x,z,r=1,c=0x72b598,y=terrainY(x,z)){if(y<0||rideFootprint(x,z,r*.5))return;for(let i=0;i<8;i++){const a=i*2.4,dx=Math.cos(a)*r,dz=Math.sin(a)*r,h=r*rnd(.7,1.15);for(let j=0;j<4;j++){let u=(j+.5)/4;box(x+dx*u,y+.2+Math.sin(u*2.1)*h,z+dz*u,Math.abs(dx)*.3+.4*(1-u),.4,Math.abs(dz)*.3+.4*(1-u),tinted(c,1+u*.14),'leaf')}}}
function planter(x,z,w,d,h=.7,flowers=C.pink,base=terrainY(x,z)){slab(x,z,w,d,base,base+h,C.cream);slab(x,z,w-.75,d-.75,base+h,base+h+.13,0x899967);let count=Math.max(1,Math.floor(w/2.3));for(let i=0;i<count;i++){let xx=x+(i+.5)*w/count-w/2;shrub(xx,z,Math.min(1.45,d*.43),rnd(.8,1.45),choice(shrubCols),base+h,flowers)}}
function bench(x,z,base=terrainY(x,z),back=1,w=3.5){
 for(let s of [-1,1])box(x+s*w*.33,base+.37,z,.30,.75,1,C.navy);
 for(let j=0;j<3;j++)box(x,base+.79,z+(j-1)*.32,w,.25,.25,C.wood);
 for(let s of [-1,1])column(x+s*w*.34,z+back*.57,base+.65,base+1.70,.19,C.navy);
 for(let j=0;j<2;j++)box(x,base+1.23+j*.36,z+back*.59,w,.26,.21,C.wood,'solid',.125);
}
function lounger(x,z,c=C.ice,base=terrainY(x,z),dir=-1){for(let s of [-1,1]){box(x+s*.65,base+.30,z,.20,.60,2.65,C.teak,'solid',.125);box(x+s*.72,base+.56,z,.22,.25,3.1,C.cream,'solid',.125)}box(x,base+.62,z,1.35,.21,2.85,C.white,'solid',.125);
 for(let j=0;j<5;j++)box(x,base+.75+j*.18,z+dir*(.34+j*.25),1.38,.25,.32,j===2?C.snow:c,'solid',.125);box(x,base+.83,z-dir*.65,1.12,.125,.85,c,'solid',.125)}
function canopy(x,y,z,r,c,alternate=C.white){
 for(let iz=-r+.25;iz<r;iz+=.5)for(let ix=-r+.25;ix<r;ix+=.5){
 const ang=Math.atan2(iz,ix),a=frac((ang+TAU)/(PI/4))-.5,rr=Math.hypot(ix,iz);
 const rad=r*Math.cos(PI/8)/Math.cos(a*PI/4);if(rr>rad)continue;
 const height=.30*r*(1-rr/rad),sector=Math.floor((ang+TAU)/(PI/4));box(x+ix,y+height,z+iz,.5,.25,.5,sector%2?alternate:c,'solid');
 if(rad-rr<.46)box(x+ix,y-.14,z+iz,.5,.36,.5,sector%2?alternate:c)}
 box(x,y+.35*r,z,.35,.5,.35,C.white,'solid',.125);
}
function umbrella(x,z,r=2.6,c=C.yellow,base=terrainY(x,z)){
 column(x,z,base,base+3.25,.25,C.teak);oval(x,base+.16,z,.5,.5,.25,C.cream);
 const key='shade'+c+'-'+r;template(key,()=>canopy(0,0,0,r,c));const ph=rnd(0,TAU);actor(key,(t,o)=>{o.position.set(x,base+3.18,z);o.rotation.z=.014*Math.sin(t*1.45+ph);o.rotation.x=.009*Math.cos(t*1.21+ph)});
}
function pennants(x1,y1,z1,x2,y2,z2,n,drop=.8){
 const cols=[C.yellow,C.coral,C.mint,C.sky,C.pink];
 for(let i=0;i<n;i++){const t=(i+.5)/n,t0=i/n,t1=(i+1)/n,fy=f=>mix(y1,y2,f)-4*f*(1-f)*drop;
 beam(mix(x1,x2,t0),fy(t0),mix(z1,z2,t0),mix(x1,x2,t1),fy(t1),mix(z1,z2,t1),.10,C.cream,'solid',.75);
 const key='flag'+(i%cols.length);template(key,()=>{for(let j=0;j<5;j++)box(0,-j*.25,0,1.5-j*.25,.25,.125,cols[i%5],'solid',.125)});
 const xx=mix(x1,x2,t),zz=mix(z1,z2,t),yy=fy(t),a=-Math.atan2(z2-z1,x2-x1);
 actor(key,(time,o)=>{o.position.set(xx,yy,zz);o.rotation.order='YXZ';o.rotation.y=a;o.rotation.x=.15+.21*Math.sin(time*2.3+i*.83)});
 }}
function bridge(x,z,style=0,alongX=false){
 const length=15,width=style===0?12:style===1?5.25:6.5,arch=style===0?1.72:style===2?2.6:1.1;
 const place=(u,h,v,w,ht,d,c)=>alongX?box(x+v,h,z+u,d,ht,w,c):box(x+u,h,z+v,w,ht,d,c);
 const deck=(v)=>.96+arch*(1-(v/(length/2))**2);
 for(let j=0;j<length*2;j++){const v=(j+.5)*.5-length/2,ht=deck(v),co=style===1?(j%3===0?C.teak:C.wood):(j%4===0?0xe6dabf:C.cream);
 place(0,ht-.22,v,width,.5,.5,co);
 for(let s of [-1,1]){place(s*(width/2-.2),ht-.32,v,.5,.75,.5,style===2?C.coral:style===0?C.sky:C.teak);place(s*(width/2-.18),ht+1.55,v,.24,.25,.5,style===1?C.teak:C.white);
 if(j%4===0){place(s*(width/2-.2),ht+.65,v,.34,1.7,.36,style===1?C.teak:C.white);place(s*(width/2-.18),ht+.62,v,.28,.15,1.9,style===1?C.wood:C.ice)}}
 }
 for(let s of [-1,1]){place(0,.45,s*6.4,width+.7,1.45,2,C.cream);for(let side of [-1,1]){place(side*(width/2-.23),1.92,s*6.5,.85,2,.85,C.white);place(side*(width/2-.23),3.09,s*6.5,1,.34,1,C.yellow)}}
}
bridge(0,46+riverWarp(0),0);bridge(-83,46+riverWarp(-83),1);bridge(-136,2,2,true);bridge(101,46+riverWarp(101),2);bridge(136,-14,1,true);
function dock(site){
 const {x,centre,width:w,code,label}=site,z=centre+8.65;
 slab(x,z,w,4.25,.55,1.02,C.wood);
 for(let j=0;j<Math.ceil(w/.5);j++)box(x-w*.5+.25+j*.5,1.09,z,.47,.18,4.25,j%3===0?0xe4c59c:0xdcb88e,'solid',.125);
 // Wide, gripped treads descend into a side bay. The main current passes outside the handrails.
 for(let k=0;k<6;k++){
  const h=1.05-k*.23,zz=z-2.2-k*.54;
  box(x,h-.17,zz,w-.58,.35,.64,C.cream);
  box(x,h+.035,zz-.20,w-.78,.125,.125,C.sky,'solid',.125);
 }
 for(let side of [-1,1]){
  const xx=x+side*(w*.5-.40);
  guard(xx,z+2,xx,z-1.65,1.12,C.white,1.35);
  beam(xx,2.43,z-1.7,xx,1.20,z-4.95,.20,C.metal,'solid',.25);
  for(let k of [0,3,5])column(xx,z-2.2-k*.54,.85-k*.23,2.32-k*.23,.20,C.white);
 }
 const rx=x+w*.5+1.75,rz=z+.5;
 slab(rx,rz,3.3,3.05,.72,1.04,C.white);
 for(let side of [-1,1]){box(rx+side*1.17,1.22,rz,.25,.35,2.65,C.deep);
  column(rx+side*1.26,rz-.92,1.04,3.36,.20,C.sky);
  column(rx+side*1.26,rz+.92,1.04,3.36,.20,C.sky);
  box(rx+side*1.26,3.4,rz,.25,.25,2.1,C.white)}
 column(rx,rz,1.05,3.56,.25,C.metal);
 for(let k=0;k<5;k++){const key=floatRing([C.coral,C.yellow,C.sky,C.mint,C.pink][k]);actor(key,(t,o)=>{o.position.set(rx,1.32+k*.43,rz);o.rotation.y=k*.64})}
 for(let side of [-1,1])column(x+side*1.7,z+2.16,1.01,3.66,.25,C.white);
 box(x,3.24,z+2.16,4.3,1.35,.38,C.white);lettering(x,3.24,z+2.39,4.05,1.19,label,'RIVER LANDING','#287f99','#fff9e8',0,code);
 lettering(x,3.24,z+1.92,4.05,1.19,'上岸出口','SHORE EXIT','#287f99','#fff9e8',PI,code);
}
riverDocks.forEach(dock);
const sprayParticles=[];
function jet(x,y,z,vx,vy,vz,life=.9,count=25,spread=.18,size=.25,mode=0,phase=0,repeat=1){
 for(let i=0;i<count;i++){const s=rnd(.64,1.35)*size;sprayParticles.push([x+rnd(-spread,spread),y+rnd(-spread*.3,spread*.3),z+rnd(-spread,spread),vx+rnd(-spread,spread)*2,vy*rnd(.90,1.08),vz+rnd(-spread,spread)*2,life*rnd(.91,1.05),(i+rnd(.1,.8))/count,s,mode,phase,repeat])}
}
const fountainNozzles=[];
function nozzleVelocity(nozzle,born){
 const {group,a,base}=nozzle,q=waveClock(born),dx=Math.cos(a),dz=Math.sin(a);
 const sweep=smooth(34.45,34.82,q)*(1-smooth(36.05,36.64,q));
 const fans=smooth(35.82,36.21,q)*(1-smooth(37.22,37.75,q));
 const crown=smooth(36.96,37.40,q)*(1-smooth(37.80,38.17,q));
 const v=base.clone();
 if(group===6){v.y+=.38*Math.sin(born*1.4)+4.86*crown;v.x*=.6;v.z*=.6;return v}
 if(group===7){
  const pair=.5+.5*Math.cos(2*a+(q-36)*4),out=.53*fans+.18*crown;
  v.y+=.26*Math.sin(born*1.31+a)+3.25*fans*(.31+.69*pair)+2.1*crown;v.x+=dx*out;v.z+=dz*out;
 }else{
  const chase=(.5+.5*Math.cos(a-(q-34.45)*4.6))**2,turn=2.18*sweep*chase+1.45*fans*Math.cos(2*a);
  v.y+=.23*Math.cos(born*1.19+a)+5.25*sweep*chase+1.88*fans;v.x-=dz*turn;v.z+=dx*turn;
 }
 return v;
}
function basinNozzle(px,py,pz,vx,vy,vz,count,size,group,a,surface){
 const nozzle={p:vec(px,py,pz),base:vec(vx,vy,vz),group,a,surface};fountainNozzles.push(nozzle);
 jet(px,py,pz,vx,vy,vz,3.15,count,.057,size,group,a,surface);
 const key=template('basin-ripple',()=>ellipseRing(0,0,0,.88,.88,.125,.125,0xc9f5ed,'wet',.125),foamMaterial);
 for(let i=0;i<5;i++){const phase=i/5+a/TAU,cycle=3.5;
  actor(key,(time,o)=>{
   const age=frac(time/cycle+phase)*cycle,born=time-age,v=nozzleVelocity(nozzle,born);
   const impact=(v.y+Math.sqrt(v.y*v.y+22.8*(py-surface)))/11.4,spent=age-impact;
   if(spent<0||spent>1.02){o.scale.setScalar(0);o.userData.opacity=0;return}
   o.position.set(px+v.x*impact,surface+.044,pz+v.z*impact);
   const r=.14+.68*spent;o.scale.set(r,.21,r);
   o.userData.opacity=.53*smooth(0,.12,spent)*(1-smooth(.27,1.02,spent));
  });
 }
}
function fountain(x,y,z,scale=1){
 const surface=y-.99,brass=0xd4b37e;
 oval(x,y+.06,z,.55,.55,.20,C.white,'solid',.25);
 box(x,y+.22,z,.43,.22,.43,brass,'wet',.125);
 basinNozzle(x,y+.29,z,0,6.8,0,145,.18,6,0,y+.05);
 for(let n=0;n<4;n++){
  const a=TAU*(n+.5)/4,dx=Math.cos(a),dz=Math.sin(a),xx=x+dx*1.41,zz=z+dz*1.41;
  box(xx,y+.075,zz,.40,.25,.40,brass,'wet',.125);
  basinNozzle(xx,y+.23,zz,dx*1.28,5.65,dz*1.28,82,.15,7,a,surface);
 }
 for(let n=0;n<8;n++){
  const a=TAU*n/8,dx=Math.cos(a),dz=Math.sin(a),xx=x+dx*4.18*scale,zz=z+dz*4.18*scale;
  oval(xx,surface+.03,zz,.39,.39,.20,C.white,'solid',.25);
  box(xx,surface+.19,zz,.32,.20,.32,brass,'wet',.125);
  basinNozzle(xx,surface+.31,zz,-dx*.80,3.45,-dz*.80,92,.155,8,a,surface);
 }
}
function splash(x,y,z,r=1.3,mode=0,ph=0){for(let j=0;j<8;j++){const a=rnd(0,TAU);jet(x+rnd(-.45,.45)*r,y,z+rnd(-.45,.45)*r,Math.cos(a)*r*1.25,rnd(2.9,4.7)*Math.sqrt(r),Math.sin(a)*r*1.25,rnd(.58,.86),6,.22,rnd(.15,.30)*Math.sqrt(r),mode,ph)}}
function setupSpray(){
 const g=cube.clone(),p=[],d=[],info=[],meta=[];for(const s of sprayParticles){p.push(s[0],s[1],s[2]);d.push(s[3],s[4],s[5]);info.push(s[6],s[7],s[8],s[9]);meta.push(s[10],s[11])}
 const ig=new T.InstancedBufferGeometry();ig.index=g.index;for(const k in g.attributes)ig.setAttribute(k,g.attributes[k]);ig.setAttribute('origin',new T.InstancedBufferAttribute(new Float32Array(p),3));ig.setAttribute('vel',new T.InstancedBufferAttribute(new Float32Array(d),3));ig.setAttribute('info',new T.InstancedBufferAttribute(new Float32Array(info),4));ig.setAttribute('ph',new T.InstancedBufferAttribute(new Float32Array(meta),2));ig.instanceCount=p.length/3;
 const material=new T.ShaderMaterial({uniforms:{tm:clockTime},transparent:true,depthWrite:false,vertexShader:`attribute vec3 origin,vel;attribute vec4 info;attribute vec2 ph;uniform float tm;varying float fade;varying vec3 N;
 void main(){float u=fract(tm/info.x+info.y);float life=u*info.x;vec3 v=vel;float s=1.;
 if(info.w>1.5&&info.w<2.5){float q=mod(tm,40.);s=smoothstep(20.0,20.8,q)*(1.-smoothstep(22.3,23.2,q));}
 if(info.w>2.5&&info.w<3.5){s=.28+.72*smoothstep(-.4,.4,sin(tm*.85+ph.x));}
 if(info.w>3.5&&info.w<4.5){v.y*=.8+.20*sin(tm*.82+ph.x);}
 if(info.w>4.5&&info.w<5.5){float a=mod(tm-ph.x,ph.y)-info.y*.24;u=clamp(a/info.x,0.,1.);life=u*info.x;
 s=smoothstep(0.,.045,a)*(1.-smoothstep(info.x*.76,info.x,a));}
 if(info.w>5.5){
  // A droplet retains the nozzle pressure and direction it had at emission.
  float age=fract(tm/3.15+info.y)*3.15,born=tm-age,q=mod(born,40.),angle=ph.x;
  float sweep=smoothstep(34.45,34.82,q)*(1.-smoothstep(36.05,36.64,q));
  float fans=smoothstep(35.82,36.21,q)*(1.-smoothstep(37.22,37.75,q));
  float crown=smoothstep(36.96,37.40,q)*(1.-smoothstep(37.80,38.17,q));
  if(info.w<6.5){v.y+=.38*sin(born*1.4)+4.86*crown;v.xz*=.6;}
  else if(info.w<7.5){
   float pair=.5+.5*cos(2.*angle+(q-36.)*4.);
   v.y+=.26*sin(born*1.31+angle)+3.25*fans*(.31+.69*pair)+2.1*crown;
   v.xz+=vec2(cos(angle),sin(angle))*( .53*fans+.18*crown);
  }else{
   float chase=pow(.5+.5*cos(angle-(q-34.45)*4.6),2.);
   v.y+=.23*cos(born*1.19+angle)+5.25*sweep*chase+1.88*fans;
   v.xz+=vec2(-sin(angle),cos(angle))*(2.18*sweep*chase+1.45*fans*cos(2.*angle));
  }
  float hit=(v.y+sqrt(v.y*v.y+22.8*max(.01,origin.y-ph.y)))/11.4;
  life=min(age,hit);u=clamp(age/hit,0.,1.);s=1.-smoothstep(hit-.055,hit,age);
 }
 vec3 pos=origin+v*life+vec3(0.,-5.7*life*life,0.);float sz=info.z*(1.-.78*u*u)*s;
 pos+=position*sz;N=normal;fade=(1.-u*u)*s;gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.);}`,fragmentShader:`varying float fade;varying vec3 N;void main(){vec3 c=mix(vec3(.54,.90,.95),vec3(1.,1.,.96),max(0.,dot(normalize(N),normalize(vec3(.4,.8,.48)))));gl_FragColor=vec4(c,(.32+.60*fade)*smoothstep(0.,.32,fade));
 #include <colorspace_fragment>
 }`});const obj=new T.Mesh(ig,material);obj.frustumCulled=false;obj.renderOrder=5;scene.add(obj);
}
const streams=[];
function waterfall(x,z,y0,y1,w,forward=.7,yaw=0){
 const n=Math.ceil(w/.55),cs=Math.cos(yaw),sn=Math.sin(yaw);
 for(let i=0;i<n;i++){
  const side=(i+.5)*w/n-w*.5,xx=x+side*cs,zz=z-side*sn,yy=y1+rnd(-.13,.13);
  box(xx,(y0+yy)/2,zz,w/n+.06,yy-y0,.48,choice([0x83dce1,0xb2edec,0x6dd0dc]),'spray');
  streams.push([xx,zz,y0,yy,w/n,forward,rnd(0,1),sn,cs]);
 }
 for(let j=.5;j<w;j+=1.8)splash(x+(j-w*.5)*cs+forward*sn,y0,z-(j-w*.5)*sn+forward*cs,1.05);
}
function setupStreams(){
 template('fall-strip',()=>box(0,0,0,1,1,1,C.ice,'wet'));
 for(const s of streams)for(let j=0;j<3;j++)actor('fall-strip',(t,o)=>{
  const u=frac(t*(.62+.07*s[6])+s[6]+j/3);
  o.position.set(s[0]+u*s[5]*s[7],mix(s[3],s[2],u*u),s[1]+u*s[5]*s[8]);
  o.scale.set(s[4]*(.47+.26*Math.sin(u*PI)),.45+u*u*(s[3]-s[2])*.15,.26);
 });
}
// Evaluate the emission time of each falling band so that the front of a pour reaches
// each deck before the water can spill from that deck's lower lip.
const sheetMaterial=new T.MeshPhongMaterial({vertexColors:true,transparent:true,opacity:.72,depthWrite:false,shininess:62,specular:0xc4f3ff});
function pulseCurtain(x,z,base,high,width,reach,start,stop,period=40,lip=null){
 const palette=[0x82d6e1,0x9de4eb,0xb5ebef];
 const names=palette.map((c,i)=>template('pour-sheet'+i,()=>box(0,0,0,1,1,1,c,'wet'),sheetMaterial));
 const flight=Math.sqrt((high-base)/5.7),bands=Math.ceil(width/.38),stages=10;
 for(let i=0;i<bands;i++){
  const offset=rnd(),side=(i+.5)/bands-.5;
  for(let j=0;j<stages;j++){
   const ph=rnd(0,TAU);
   actor(names[i%3],(time,o)=>{
    const u=frac(time/flight+(j+offset)/stages),emitted=time-flight*u,q=frac(emitted/period)*period;
    const flow=smooth(start,start+.40,q)*(1-smooth(stop-.42,stop,q));
    if(flow<.0001){o.scale.setScalar(0);return}
    const source=lip?lip(emitted):[high,z],H=source[0]-base;
    const edge=clamp(Math.min(u,1-u)*stages*2,.05,1);
    const spread=(.83+u*.31)*(.72+.28*flow);
    o.position.set(x+side*width*spread,source[0]-H*u*u,source[1]+reach*u+.19*u*Math.sin(ph+emitted*4.7));
    o.scale.set((width/bands+.025)*flow,(.09+2*u*H/stages)*edge*flow,(.16+.16*u)*flow);
   });
  }
 }
 for(let j=0;j<Math.ceil(width*2.4);j++){const side=rnd(-.5,.5),a=rnd(0,TAU),event=start+flight+.15;
  jet(x+width*side,base+.07,z+reach,rnd(1.5,3.6)*Math.cos(a),rnd(3.7,6.8),rnd(1.5,3.5)*Math.sin(a),1.05,12,.14,.19,5,event,period);
 }
}
function rocks(x,z,w,h,d,y=terrainY(x,z)){
 if(!clearOfTracks(x,z,y,y+h+.45,Math.hypot(w,d)*.5))return;
 slab(x,z,w,d,y,y+h,choice(cliff));slab(x-.35,z-.25,w*.9,d*.92,y+h,y+h+.45,choice(turf));
 for(let k=0;k<4;k++)box(x+rnd(-w*.38,w*.38),y+h*rnd(.15,.9),z+d/2,rnd(1,3.5),rnd(.5,1.2),rnd(.35,1),choice(cliff));
}
{
 const cx=-45,cz=-42+riverWarp(cx);
 for(let j=-7;j<7;j+=.5){const inner=snap(1.10+5.8*Math.sqrt(Math.max(0,1-(j/6.5)**2))),top=9+(Math.abs(j)>5?.8:0);
 slab(cx,cz+j,19.5,.5,inner,top,choice(cliff));if(Math.abs(j)<5.5)box(cx,top+.18,cz+j,18.5,.35,.5,0x9bc282)}
 for(let s of [-1,1]){if(s<0)slab(cx,cz+s*6.65,21,2,-1,9.5,0xb9b3a3);else{
 for(let j=-10;j<10;j+=.5){const h=1.1+5.7*Math.sqrt(Math.max(0,1-((j+.25)/7.2)**2));slab(cx+j+.25,cz+6.65,.5,2,h,9.7+.5*Math.sin(j*.4),cliff[Math.abs(Math.floor(j/2))%4])}}
 for(let xp=-8;xp<=8;xp+=2.5){const co=s===1?C.lilac:C.sky;column(cx+xp,cz+s*5.55,1.05,2.1,.6,co,'wet');column(cx+xp+.15,cz+s*5.55,2,2.8,.3,C.ice,'wet')}box(cx,4.9,cz+s*5.4,19,.25,.25,s===1?C.pink:C.sky,'wet')}
 for(let zz=-6;zz<7;zz+=.75)box(cx,10.02,cz+zz,4.2,.25,.75,C.wood);
 for(let side of [-1,1]){shrub(cx+side*6,cz,2.7,2.1,0x8cbb70,9.4);rosette(cx+side*4,cz+3.5,1,0x75b38f,9.25)}
 waterfall(cx+1.5,cz+7.98,.55,9.85,9.25,.95);
 rocks(-49,-64,13,8.5,7.5,6);waterfall(-48,-59.85,11.25,14.8,8.25,1.25);
 rocks(-47,-73,12,8,9,13);waterfall(-48,-68.15,13.1,21.5,6.75,.9);
 // A fluted aqueduct carries a transverse sheet of water across the elevated raft channel.
 for(const pz of [-74.5,-61.2]){
  const foot=terrainY(68.5,pz);
  slab(68.5,pz,3.75,2.75,foot,foot+.65,C.cream);
  slab(68.5,pz,3.2,2.24,foot+.65,foot+2.15,0xc6bfa5);
  for(const xx of [67.55,69.45]){
   column(xx,pz,foot+2,26.9,.78,C.white);
   for(let yy=foot+4;yy<26.8;yy+=5)box(xx,yy,pz,1,.50,1,C.sky);
  }
  for(let j=0;j<4;j++)box(68.5,25.4+j*.52,pz,2.5+j*.47,.62,1.15+j*.36,j===1?C.deep:C.white);
 }
 for(let j=0;j<18;j++){const zz=-74.6+j*.75,arch=.74*Math.sin(j*PI/18);
  slab(68.65,zz,3.95,.75,26.6+arch,27.2+arch,C.white);
  slab(68.65,zz,3.55,.75,27.2+arch,28.47,C.sky);
  slab(68.65,zz,4.20,.75,28.47,28.78,C.snow)}
 for(let j=0;j<13;j++){let zz=-71.7+j*.5;box(69.65,28.38,zz,2.82,.36,.5,0x86dadd,'wet');box(70.68,28.78,zz,.50,.5,.5,C.ice,'wet')}
  waterfall(71.16,-68.65,20.63,28.95,5.45,.65,PI/2);
}
for(let j=0;j<4;j++){const x=79+j*4.3,z=46+riverWarp(x),c=[C.blue,C.mint,C.yellow,C.coral][j];
 for(let q=0;q<=32;q++){const a=q*PI/32;box(x,1+7.5*Math.sin(a),z+5.3*Math.cos(a),.65,.65,.8,c,'wet')}
 for(let k=0;k<5;k++)jet(x,7.1+Math.cos(k)*.3,z-2+k,0,-1.9,0,1.12,14,.1,.17,3,j*.8)
}
for(let j=0;j<3;j++){const x=-122+j*8,z=44+riverWarp(x);column(x,z+8,.75,2.8,.75,C.white);beam(x,2.7,z+8,x,3.6,z+6.2,.65,[C.coral,C.yellow,C.sky][j],'wet',.25);jet(x,3.7,z+6,0,4.9,-5,1.35,38,.1,.25,3,j*1.52)}
const foamMaterial=new T.MeshPhongMaterial({vertexColors:true,transparent:true,opacity:.92,depthWrite:false,shininess:50,specular:0xb7ebf0});
foamMaterial.userData.instanceFade=true;
foamMaterial.onBeforeCompile=shader=>{
 shader.vertexShader='attribute float instanceFade;varying float foamFade;\n'+shader.vertexShader;
 shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfoamFade=instanceFade;');
 shader.fragmentShader='varying float foamFade;\n'+shader.fragmentShader;
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=foamFade;');
};
foamMaterial.customProgramCacheKey=()=>'water-foam-fade';
const ringPalette=[C.yellow,C.coral,C.sky,C.mint,C.pink,C.lilac];
template('froth',()=>box(0,0,0,1,.125,1,0xeafff9),foamMaterial);
template('ring-beads',()=>{
 for(let k=0;k<10;k++){const a=(k+.45)*TAU/10,r=k%2?.79:.91;
  box(r*Math.cos(a),.30,r*Math.sin(a),.125,.125,.125,k%3?C.foam:C.ice,'wet',.125)}
},foamMaterial);
const sprayStations=[];
function sprayStation(x,z,halfWidth,phase){
 const [station,offset]=riverCoordinates(x,z);sprayStations.push({station,offset,halfWidth,phase});
}
const tunnelZ=-42+riverWarp(-45);
waterfall(-35.13,tunnelZ+1.3,.58,8.95,.83,-.3,PI/2);
waterfall(-35.13,tunnelZ+2.70,.58,8.95,1.25,-.36,PI/2);
for(let j=0;j<19;j++)box(-45+j*.53,9.28,tunnelZ+1.95, .55,.25,2.85,0x87d5da,'wet');
sprayStation(-35.4,tunnelZ+2.0,1.43,null);
for(let i=0;i<4;i++)sprayStation(79+i*4.3,46+riverWarp(79+i*4.3),2.15,i*.8);
for(let i=0;i<3;i++)sprayStation(-122+i*8,43.3+riverWarp(-122+i*8),1.03,i*1.52);
function wetRing(station,offset,time){
 let amount=0;
 for(const jet of sprayStations){
  const downstream=frac(station-jet.station+.78/riverLength)*riverLength-.78;
  if(downstream>5.5)continue;
  const side=1-smooth(jet.halfWidth,jet.halfWidth+.75,Math.abs(offset-jet.offset));
  const emitted=time-Math.max(0,downstream)/riverSpeed;
  const pressure=jet.phase===null?1:.28+.72*smooth(-.4,.4,Math.sin(emitted*.85+jet.phase));
  amount=Math.max(amount,pressure*side*smooth(-.78,-.12,downstream)*Math.exp(-Math.max(0,downstream)*.65));
 }
 return amount;
}
for(let i=0;i<46;i++){
 const seed=i/46+rnd(-.004,.004),lane=rnd(-2.25,2.25),double=i%9===0,name=floatRing(ringPalette[i%6],double?'double':'ring');
 let cachedTime=-1,station=0,offset=0,y=0,yaw=0,wet=0,p;
 function sample(t){
  if(cachedTime===t)return;cachedTime=t;station=seed+t*riverRate;offset=lane+.15*Math.sin(t*.29+i);
  p=riverAt(station,offset);y=riverSurface(station,offset,p[0],p[1],t);
  yaw=p[2]+(double?.10*Math.sin(t*.25+i):i+.06*t);wet=wetRing(station,offset,t);
 }
 actor(name,(t,o)=>{sample(t);o.position.set(p[0],y+.17,p[1]);o.rotation.set(.027*Math.sin(t*.73+i),yaw,.026*Math.cos(i+t*.82))});
 actor('ring-beads',(t,o)=>{sample(t);o.position.set(p[0],y+.17,p[1]);o.rotation.set(.027*Math.sin(t*.73+i),yaw,.026*Math.cos(i+t*.82));o.scale.z=double?1.85:1;o.userData.opacity=wet});
 for(let j=0;j<4;j++){
  const side=j%2?1:-1,ph=rnd();
  actor('froth',(t,o)=>{sample(t);const age=frac(t*.68+ph),dist=(double?1.8:.95)+age*1.8;
   const f=station-dist/riverLength,shift=offset+side*(.63+.78*age),q=riverAt(f,shift);
   o.position.set(q[0],riverSurface(f,shift,q[0],q[1],t)+.070,q[1]);
   o.scale.set(.20+.30*age,.32,.28+.53*age);o.rotation.y=q[2];o.userData.opacity=Math.sin(age*PI)*(.31+.61*wet);
  });
 }
}
for(let i=0;i<330;i++){
 const source=rnd(),bank=(i%3?rnd(3.95,4.85):rnd(-3.4,3.4))*(i%2?1:-1),len=rnd(.28,1.52),life=rnd(4.7,8.3),phase=rnd(0,life);
 actor('froth',(t,o)=>{
  const born=Math.floor((t+phase)/life),u=frac((t+phase)/life);
  const f=source+(hash2(i,born)-.5)*4/riverLength+riverRate*u*life,off=bank+.20*(hash2(born,i)-.5);
  const p=riverAt(f,off),envelope=smooth(0,.17,u)*(1-smooth(.56,1,u));
  o.position.set(p[0],riverSurface(f,off,p[0],p[1],t)+.066,p[1]);
  o.rotation.y=p[2];o.scale.set(.24,.4,len*(.66+.34*envelope));o.userData.opacity=.85*envelope;
 });
}
for(let k=0;k<wavePacket.length;k++){
 const crest=wavePacket[k],count=96;
 for(let j=0;j<count;j++){const x=-54+108*(j+rnd(.08,.91))/count,spread=rnd(-.42,.42),len=rnd(.55,1.57),ph=rnd(0,TAU);
  actor('froth',(t,o)=>{
   const z=crestPosition(x,t,crest)+spread,margin=-waveDist(x,z),progress=(z+30)/(waveShore(x)+30);
   const alpha=smooth(0,1.0,margin)*(.30+.67*smooth(.54,.96,progress))*(.72+.28*Math.cos(ph+t*.9));
   o.position.set(x,waveY(x,z,t)+.068,z);o.scale.set(len,.42,.16+.24*smooth(.42,.96,progress));o.userData.opacity=alpha;
   if(alpha===0)o.scale.setScalar(0);
  });
 }
}
const waveFloatBases=[];
function boatFitsLagoon(x,z,radius){
 for(const sx of [-1,1])for(const sz of [-1,1])if(waveDist(x+sx*(radius+.32),z+sz*(radius+.52)+1.38)>0)return false;
 if([-8,12].some(line=>z+radius+1.94>line-.38&&z-radius-.52<line+.38))return false;
 return waveFloatBases.every(b=>Math.hypot(b.x-x,b.z-z)>b.radius+radius+1.55);
}
for(let i=0;i<26;i++){
 const type=i%6===2?'bed':i%9===0?'double':'ring',radius=type==='ring'?1.03:1.95;
 let x,z;
 for(let attempt=0;attempt<180;attempt++){z=rnd(-25.2,22);const w=Math.min(54,40+.5*z);x=rnd(-w,w);if(boatFitsLagoon(x,z,radius))break}
 const ph=rnd(0,TAU),key=floatRing(ringPalette[i%6],type);waveFloatBases.push({x,z,radius,ph});
 actor(key,(t,o)=>{
  const local=t-.14,xx=x+.26*Math.sin(t*.23+ph),zz=z+waveDrift(x,z,local)+.40*Math.sin(t*.28+ph),h=waveY(xx,zz,local);
  const dz=(waveY(xx,zz+1.0,local)-waveY(xx,zz-1.0,local))*.5;
  const dx=(waveY(xx+1.0,zz,local)-waveY(xx-1.0,zz,local))*.5;
  o.position.set(xx,h+.20,zz);o.rotation.order='ZXY';o.rotation.set(-Math.atan(dz)*.78,ph+.08*Math.sin(t*.47),Math.atan(dx)*.78+.015*Math.cos(t+ph));
 });
}
for(let i=0;i<182;i++){const f=rnd(),s=i%2?1:-1,p=riverAt(f,s*rnd(9.8,14));const [x,z]=p;if(Math.abs(x)<16&&z>0||Math.abs(x)<31&&z<0||x<-61&&x>-122&&z>48||Math.abs(x+45)<12&&z<0)continue;if(terrainY(x,z)<.2)continue;
 if(i%6===0)palm(x,z,rnd(8.5,12),rnd(.82,1));else if(i%3)shrub(x,z,rnd(1.1,2.45),rnd(1.2,2.9),choice(shrubCols),terrainY(x,z),i%7===0?C.pink:0);else rosette(x,z,rnd(.9,1.8))}
for(let s of [-1,1]){
 for(let z=-100;z<109;z+=rnd(7,12)){let x=s*rnd(152,164);palm(x,z,rnd(9,15),rnd(.86,1.1));for(let j=0;j<3;j++)shrub(x+rnd(-3,3),z+rnd(-4,4),rnd(1.5,3),rnd(1.5,3.5))}
 for(let x=27;x<153;x+=rnd(6,12)){let z=106+rnd(-2,2);if(x>53||x<29)palm(x*s,z,rnd(9,13),rnd(.86,1.08));shrub(s*x,z+rnd(0,3),rnd(1.5,2.4),rnd(1.4,2.7))}
 for(let z=111;z<187;z+=11){let x=s*16;if(coastDist(x,z)<-4){palm(x,z,rnd(10.5,14.5));planter(x,z+3.5,3.7,5,.5,s>0?C.pink:C.butter)}}
}
for(let i=0;i<260;i++){const x=rnd(-154,153),z=rnd(-111,-58);if(Math.abs(x)<12&&z>-98||Math.abs(x+90)<12&&Math.abs(z+87)<14||Math.abs(x-87)<12&&Math.abs(z+86)<14||Math.abs(x+47)<7&&z>-77)continue;let y=terrainY(x,z);if(y<0)continue;if(i%9===0)palm(x,z,rnd(6.5,10.5),rnd(.72,.94));else if(i%12===0)broadleaf(x,z,rnd(4.5,7));else if(i%3)shrub(x,z,rnd(1.2,3.2),rnd(1.2,3.5),choice(shrubCols),y,i%11===0?C.pink:0);else rocks(x,z,rnd(1.5,5),rnd(.75,2.5),rnd(1.5,3.6),y-.4)}
for(let i=0;i<180;i++){const x=rnd(-156,155),z=rnd(111,184);if(coastDist(x,z)>-2||Math.abs(x)<20)continue;if(i%8===0)palm(x,z,rnd(7.7,12.6));else if(i%3===0)broadleaf(x,z,rnd(4.2,7.8));else shrub(x,z,rnd(1.1,2.9),rnd(1.2,2.5),choice(shrubCols),terrainY(x,z),i%10===0?C.pink:0)}
// White resort boundary, with stepped posts and paired painted rails.
for(const s of [-1,1]){guard(s*160,-95,s*160,88,1.0,C.white,1.35);guard(s*148,101,s*56,101,1.0,C.white,1.35)}
