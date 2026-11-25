'use strict';

const shaftProf=[[1.36,0],[1.36,.044],[1.14,.067],[1.13,.091],[1.22,.112],[1.02,.145],[.91,.19],[.79,.797],[.80,.854],[.98,.86],[1.01,.884],[.93,.90],[1.30,.95],[1.34,1]];
function column(p,x,y,z,r,h,mat='chalk',fluted=false) {
  lineProfile(p,x,y,z,r,h,shaftProf,mat,fluted?18:12);
  box(p,x,y+.038*h,z,2.63*r,.074*h,2.63*r,'sand');
  box(p,x,y+.982*h,z,2.88*r,.062*h,2.88*r,'ivory');
  if(fluted){
    for(let j=0;j<9;j++){
      const a=j*TAU/9;
      rod(p,[x+sin(a)*r*.93,y+h*.17,z+cos(a)*r*.93],[x+sin(a)*r*.79,y+h*.84,z+cos(a)*r*.79],.074*r,.057*r,'bone',5);
    }
    for(const dx of [-1,1])for(const dz of [-1,1])orb(p,x+dx*.89*r,y+h*.931,z+dz*.88*r,r*.42,r*.34,r*.42,'trim',8);
  }
}
function slab(p,x,y,z,w,h,d,m='chalk') {
  box(p,x,y+h*.48,z,w,h,d,m);box(p,x,y+.092*h,z,w+.19,.12*h,d+.19,'joint');
  box(p,x,y+h,z,w+.26,.13*h,d+.26,'ivory');
}
function horizontalBand(p,y,r,m='ivory',thick=.17,n=64) {return cyl(p,0,y,0,r,r,thick,m,n);}
function finial(p,x,y,z,h=1.1,m='gold') {
  lineProfile(p,x,y,z,h*.18,h,[[.8,0],[.80,.11],[.46,.16],[.41,.29],[.84,.34],[1.0,.45],[.88,.56],[.42,.64],[.24,.68],[0,1]],m,10);
}
function pinnacle(p,x,y,z,h=2.4,r=.24){
  const g=group(p,x,y,z);box(g,0,.14*h,0,r*1.62,.28*h,r*1.62,'chalk',PI/4);
  cyl(g,0,.30*h,0,r*1.31,r*1.31,.10*h,'trim',4,PI/4);
  cyl(g,0,.54*h,0,r*1.38,r*.23,.42*h,'ivory',4,PI/4);
  finial(g,0,.73*h,0,h*.27);
}
function balustrade(p,a,b,h=.66,style='stone',spacing=.88) {
  const [x1,y1,z1]=a,[x2,y2,z2]=b,len=Math.hypot(x2-x1,z2-z1),num=Math.max(1,Math.ceil(len/spacing));
  const wood=style==='wood',iron=style==='iron',mat=wood?'walnut':iron?'iron':'chalk';
  const r=wood?.066:iron?.045:.094;
  for(let j=0;j<=num;j++){
    const t=j/num,x=mix(x1,x2,t),y=mix(y1,y2,t),z=mix(z1,z2,t);
    if(j===0||j===num||j%5===0){box(p,x,y+h*.5,z,r*2.6,h,r*2.6,mat);if(!wood&&!iron)cyl(p,x,y+h+.03,z,r*1.97,r*1.21,.095,'trim',4,PI/4);}
    else if(wood||iron)rod(p,[x,y,z],[x,y+h,z],r*.65,r*.65,mat,6);
    else lineProfile(p,x,y,z,r,h,[[.93,0],[.98,.13],[.60,.18],[.51,.32],[.85,.43],[.70,.56],[.36,.70],[.58,.85],[.80,.92],[.80,1]],'ivory',7);
  }
  timber(p,[x1,y1+h,z1],[x2,y2+h,z2],r*2.55,r*1.48,wood?'wood':iron?'brass':'trim');
  if(!iron&&!wood)timber(p,[x1,y1+.07,z1],[x2,y2+.07,z2],r*2.5,.13,'sand');
}
function lamp(p,x,y,z,h=1.75){
  const g=group(p,x,y,z);
  lineProfile(g,0,0,0,h*.085,h,[[1.12,0],[1.13,.085],[.65,.10],[.48,.19],[.28,.22],[.25,.71],[.51,.72],[.44,.76],[.68,.78]],'iron',8);
  cyl(g,0,h*.825,0,h*.064,h*.083,h*.135,'amber',6);
  cyl(g,0,h*.913,0,h*.11,h*.016,h*.065,'brass',6);finial(g,0,h*.948,0,h*.09);
}
function sunEmblem(p,x,y,z,r,m='gold',points=8) {
  const pts=[];for(let i=0;i<points*2;i++){const a=PI/2+i*PI/points,rr=i%2?r*.33:r*(i%4===0?1:.74);pts.push([rr*cos(a),rr*sin(a)]);}
  return extrude(p,pts,r*.095,m,x,y,z);
}
function hangingBanner(p,x,y,z,w,h,cloth='indigo'){
  rod(p,[x-w*.69,y+.06,z],[x+w*.69,y+.06,z],w*.045,w*.045,'gold',7);
  const pts=[[-w/2,0],[w/2,0],[w/2,-h*.85],[0,-h],[-w/2,-h*.85]];
  extrude(p,pts,.042,'bone',x,y,z);const q=extrude(p,pts,.048,cloth,x,y-.015,z+.029);q.scale.set(.86,.95,1);
  sunEmblem(p,x,y-h*.41,z+.084,w*.28,'bone');
  box(p,x,y-h*.63,z+.075,w*.47,h*.018,.025,'gold');
}
function flag(p,x,y,z,w=1.44,h=.66,cloth='wine',phase=0) {
  cyl(p,x,y+h*.95,z,.048,.038,h*1.9,'brass',8);finial(p,x,y+h*1.92,z,.29);
  const f=group(p,x,y+h*1.85,z),ps=[],ind=[];
  for(let j=0;j<=12;j++){const t=j/12,xx=w*t,zz=.16*w*sin(t*7+.4)*Math.pow(t,.65),dy=-h*t*.21+h*.10*sin(t*4);
    ps.push(xx,dy,zz,xx-(j===12?w*.20:0),dy-h*(1.-.31*t),zz+.045*sin(t*8));
    if(j<12){const k=j*2;ind.push(k,k+1,k+2,k+2,k+1,k+3);}
  }
  const material=M[cloth].clone();material.side=T.DoubleSide;material.onBeforeCompile=M[cloth].onBeforeCompile;material.customProgramCacheKey=M[cloth].customProgramCacheKey;
  mesh(f,rawGeo(ps,ind),material);
  moving(f,t=>{
    const gust=clamp(1.-Math.abs(((t+phase*.069)%46)-31.5)/2.8,0,1);
    f.rotation.y=-.26+.18*sin(.94*t+phase)+.085*sin(2.1*t+phase)-gust*.33;
    f.scale.z=.66+.29*sin(1.66*t+phase)+gust*.37;f.rotation.z=.065*sin(t*1.3+phase)+.15*gust;
  });
}
const capProfile=[[1.,0],[1.05,.045],[1.04,.081],[.95,.105],[.81,.20],[.61,.37],[.413,.55],[.25,.715],[.123,.86],[.068,1]];
function steeple(p,x,y,z,r,h,n=8,mat='copper') {
  lineProfile(p,x,y,z,r,h,capProfile,mat,n);
  cyl(p,x,y+h*.055,z,r*1.066,r*1.057,h*.059,'brass',n);
  for(let j=0;j<n;j++){const a=j*TAU/n;const pts=capProfile.slice(2).map(v=>[x+r*v[0]*sin(a),y+h*v[1],z+r*v[0]*cos(a)]);
    tube(p,pts,Math.min(.058,r*.036),'gold',12,4);}
  cyl(p,x,y+h,z,r*.105,r*.083,.13,'gold',n);finial(p,x,y+h+.04,z,Math.min(.92,h*.32));
}
function dome(p,x,y,z,r,h,mat='copper',rich=true,lantern=true) {
  const g=group(p,x,y,z);
  const profile=[[1.,0],[1.032,.028],[1.025,.069],[1.002,.086],[1.003,.135],[.987,.24],[.946,.365],[.876,.50],[.783,.628],[.666,.742],[.524,.839],[.365,.913],[.216,.960],[.125,1]];
  lineProfile(g,0,0,0,r,h,profile,mat,rich?56:32);
  cyl(g,0,h*.052,0,r*1.047,r*1.038,Math.max(.09,h*.046),'gold',rich?56:32);
  const n=rich?20:12;
  for(let j=0;j<n;j++){
    const a=j/n*TAU,points=profile.slice(2).map(v=>[sin(a)*v[0]*r,v[1]*h,cos(a)*v[0]*r]);
    tube(g,points,Math.max(.032,r*(rich?.014:.016)),'gold',rich?21:12,6);
    if(rich&&j%2===0)finial(g,r*1.013*sin(a),h*.073,r*1.013*cos(a),r*.105);
  }
  if(rich){for(const j of [6,9])torus(g,0,profile[j][1]*h,0,profile[j][0]*r,r*.006,'brass',true,64);}
  cyl(g,0,h*1.013,0,r*.176,r*.163,h*.085,'gold',16);
  if(lantern){
    cyl(g,0,h*1.14,0,r*.14,r*.124,h*.22,'deep',12);
    for(let j=0;j<6;j++){const a=j*TAU/6;column(g,sin(a)*r*.139,h*1.044,cos(a)*r*.139,r*.030,h*.203,'ivory');}
    lineProfile(g,0,h*1.249,0,r*.184,h*.18,[[1,0],[1.08,.13],[.93,.32],[.62,.67],[.14,1]],mat,16);
    finial(g,0,h*1.424,0,Math.max(.43,r*.20));
  }
  return g;
}
function drum(p,x,y,z,r,h,ornate=true,n=16) {
  const g=group(p,x,y,z);
  cyl(g,0,h*.49,0,r,r,h,'chalk',n*2);
  cyl(g,0,h*.07,0,r*1.055,r*1.055,h*.15,'sand',n*2);
  for(let j=0;j<n;j++){
    const q=radial(g,r*.992,j*TAU/n);const w=2*PI*r/n*.58;
    windowArch(q,0,h*.205,0,w,h*.65,ornate,ornate&&r>3);
    const b=radial(g,r*.988,(j+.5)*TAU/n);
    column(b,0,h*.125,0,Math.max(.075,r*.032),h*.758,'ivory');
  }
  cyl(g,0,h*.889,0,r*1.027,r*1.044,h*.098,'trim',n*2);
  cyl(g,0,h*.966,0,r*1.067,r*1.057,h*.069,'ivory',n*2);
  return g;
}
function roof(p,x,y,z,w,d,h,m='tile',hip=true) {
  const q=group(p,x,y,z),rw=w/2,rd=d/2,cut=hip?Math.min(w*.30,d*.41):0;
  const a=[-rw,0,-rd],b=[rw,0,-rd],c=[rw,0,rd],e=[-rw,0,rd],f=[-rw+cut,h,0],g=[rw-cut,h,0],verts=[];
  const tri=(a,b,c)=>verts.push(...a,...b,...c);
  tri(a,f,b);tri(f,g,b);tri(e,c,f);tri(c,g,f);
  if(hip){tri(a,e,f);tri(c,b,g);}else mesh(q,rawGeo([...a,...e,...f,...c,...b,...g],null),'ashlar');
  tri(a,b,c);tri(a,c,e);
  // Outward normals on both pitches and on both hips.
  const geo=rawGeo(verts,null);const normals=geo.attributes.normal;
  if(normals.getY(0)<0){const aa=geo.attributes.position;for(let i=0;i<aa.count;i+=3){const v=V().fromBufferAttribute(aa,i+1),u=V().fromBufferAttribute(aa,i+2);aa.setXYZ(i+1,u.x,u.y,u.z);aa.setXYZ(i+2,v.x,v.y,v.z);}geo.computeVertexNormals();}
  mesh(q,geo,m);
  rod(q,f,g,.062,.062,m==='tile'||m==='tile2'?'tile2':'brass',6);
  if(hip)for(const [from,to] of [[a,f],[b,g],[e,f],[c,g]])rod(q,from,to,.038,.035,m==='tile'||m==='tile2'?'tile2':'brass',5);
  box(q,0,.005,0,w,.097,d,'walnut');return q;
}
function door(p,x,y,z,w,h,mat='walnut',pointed=false) {
  windowArch(p,x,y,z,w,h,pointed,false,mat);
  box(p,x,y+h*.34,z+.075,w*.96,.034,.038,'iron');
  for(const dx of [-.19,.19])orb(p,x+w*dx,y+h*.44,z+.10,.041,.041,.036,'gold',7);
}
function house(p,x,y,z,w,d,h,angle=0,options={}) {
  const g=group(p,x,y,z,angle),roofMat=options.roof||pick(['tile','tile2','seagreen','copper']),wall=options.wall||pick(['ashlar','chalk','sand']);
  const hh=h*(options.tall?.81:.72),rh=h-hh;
  box(g,0,hh*.50,0,w,hh,d,wall);box(g,0,.12,0,w+.11,.24,d+.10,'aged');
  box(g,0,hh*.93,0,w+.12,.12,d+.12,'trim');
  const rows=hh>2.94?3:hh>1.56?2:1,storey=hh/rows;
  for(let floor=1;floor<rows;floor++)box(g,0,storey*floor-.035,0,w+.064,.072,d+.065,'sand');
  roof(g,0,hh+.03,0,w+.37,d+.37,rh,roofMat,options.hip!==false);
  const cols=Math.max(2,Math.round(w/1.07));
  for(let floor=0;floor<rows;floor++)for(let j=0;j<cols;j++){
    const xx=w*((j+.50)/cols-.5);
    if(floor===0&&j===0){door(g,xx,.06,d/2+.014,Math.min(.61,w/cols*.64),Math.min(1.07,storey*.92));continue;}
    const wy=floor*storey+(rows===1?.36:.235)*storey,ww=Math.min(.47,w/cols*.48),wh=storey*(rows===1?.39:.55);
    windowArch(g,xx,wy,d/2+.017,ww,wh,false,false,options.workshop?'amber':'deep');
    if(floor===rows-1&&j%2===0){
      for(const side of [-1,1]){
        const shutter=group(g,xx+side*ww*.76,wy+wh*.41,d/2+.076,side*.21);
        box(shutter,0,0,0,ww*.283,wh*.78,.043,roofMat==='tile'||roofMat==='tile2'?'seagreen':'walnut');
        for(const yy of [-.20,.20])box(shutter,0,wh*yy,.027,ww*.31,.029,.024,'wood');
      }
    }
    if(rows>1&&floor===rows-1&&j===cols-1){
      box(g,xx,wy-.095,d/2+.19,ww*1.47,.13,.47,'walnut');
      for(const dx of [-1,0,1])box(g,xx+dx*ww*.62,wy+.088,d/2+.37,.043,.31,.043,'walnut');box(g,xx,wy+.231,d/2+.37,ww*1.43,.053,.053,'wood');
    }
  }
  for(const side of [-1,1]){
    const f=group(g,side*(w/2+.018),0,0,side*PI/2);
    for(let floor=0;floor<rows;floor++)for(let j=0;j<(d>2.6?2:1);j++)windowArch(f,d>2.6?(j-.5)*d*.46:0,(floor+.25)*storey,0,.38,.51*storey,false);
  }
  const rear=group(g,0,0,-d/2-.02,PI);
  for(let floor=0;floor<rows;floor++)for(let j=0;j<cols;j++)windowArch(rear,w*((j+.5)/cols-.5),(floor+.25)*storey,0,.39,storey*.52,false);
  if(w>2.1&&rh>.54){
    const dx=-w*.17;box(g,dx,hh+rh*.43,d*.23,.66,rh*.52,.52,wall);
    roof(g,dx,hh+rh*.68,d*.23,.83,.69,.34,roofMat,false);
    box(g,dx,hh+rh*.46,d*.23+.27,.31,.31,.029,'deep');
  }
  if(options.chimney!==false) {
    box(g,w*.27,hh+rh*.78,-d*.15,.33,rh*.83+.32,.38,'aged');
    box(g,w*.27,hh+rh*1.18+.17,-d*.15,.46,.14,.50,'tile2');
  }
  if(options.workshop){
    rod(g,[w*.24,hh*.46,d*.5],[w*.24,hh*.46,d*.5+.73],.047,.047,'iron');
    box(g,w*.24,hh*.37,d*.5+.49,.07,.38,.47,'wine');orb(g,w*.24+.041,hh*.37,d*.5+.50,.029,.10,.12,'bone');
  }
  return g;
}
function bell(p,x,y,z,r,swing=false) {
  const g=group(p,x,y,z);
  lineProfile(g,0,-r*1.66,0,r,r,[[.96,0],[1.02,.08],[1.03,.18],[.85,.23],[.70,.40],[.64,.73],[.53,1.06],[.50,1.24],[.28,1.38],[.12,1.40]],'brass',24);
  cyl(g,0,-r*1.59,0,r*.91,r*.91,r*.08,'deep',18);
  const clapper=group(g,0,-r*.59,0);
  rod(clapper,[0,0,0],[0,-r*1.22,0],r*.085,r*.083,'iron',10);orb(clapper,0,-r*1.24,0,r*.18,r*.21,r*.18,'iron',10);
  box(g,0,-.07*r,0,r*.48,r*.30,r*.47,'walnut');
  if(swing){
    moving(g,t=>{const k=t%46;g.rotation.x=k>7&&k<12?.24*sin((k-7)*5)*Math.pow(sin((k-7)/5*PI),2):0;});
    moving(clapper,t=>{const k=t%46;clapper.rotation.x=k>7&&k<12?-.46*sin((k-7)*5-.59)*Math.pow(sin((k-7)/5*PI),2):0;});
  }
  return g;
}
function dialTexture(){
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  g.translate(256,256);g.fillStyle='#233e41';g.beginPath();g.arc(0,0,254,0,TAU);g.fill();
  for(const [r,color,w] of [[249,'#a17947',10],[235,'#e2c98a',3],[211,'#d5c7a0',3],[150,'#c8a168',4],[122,'#6d8881',2],[67,'#b69c69',2]]){
    g.strokeStyle=color;g.lineWidth=w;g.beginPath();g.arc(0,0,r,0,TAU);g.stroke();}
  for(let i=0;i<60;i++){g.save();g.rotate(i*TAU/60);g.fillStyle=i%5?'#c0b59a':'#e9d092';g.fillRect(-2,-229,i%5?3:6,i%5?8:15);g.restore();}
  g.font='bold 39px Georgia';g.textAlign='center';g.textBaseline='middle';g.fillStyle='#f3e2b4';
  const nums=['XII','I','II','III','IV','V','VI','VII','VIII','IX','X','XI'];
  for(let j=0;j<12;j++){g.save();g.rotate(j*TAU/12);g.fillText(nums[j],0,-184);g.restore();}
  for(let i=0;i<16;i++){g.save();g.rotate(i*TAU/16);g.fillStyle=i%2?'#a98953':'#c39c60';g.beginPath();g.moveTo(0,-119);g.lineTo(8,-27);g.lineTo(-7,-35);g.fill();g.restore();}
  const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
M.clock=new T.MeshStandardMaterial({map:dialTexture(),roughness:.57,metalness:.20});
function clockFace(p,x,y,z,r) {
  const g=group(p,x,y,z);
  const circle=mesh(g,geometry('dial',()=>new T.CircleGeometry(1,48)),'clock');circle.scale.setScalar(r);
  torus(g,0,0,.018,r,.052*r,'gold',false,40);
  for(const [ang,len] of [[-.93,.56],[1.12,.77]]) {
    const hand=extrude(g,[[0,len*r],[-.055*r,.29*r],[-.029*r,-.13*r],[.029*r,-.13*r],[.055*r,.29*r]],.028,'bone',0,0,.054);
    hand.rotation.z=ang;
  }
  orb(g,0,0,.086,.096*r,.096*r,.043,'gold',10);
}
function bellTower(p,x,y,z,w,h,hasClock=false,ornate=false,ringing=false) {
  const g=group(p,x,y,z),body=h*.54,bellH=h*.206,ss=w*.90;
  box(g,0,body*.50,0,w,body,w,'ashlar');
  for(const f of [.06,.30,.68,.96])box(g,0,body*f,0,w*(f===.06?1.15:1.06),h*.020,w*(f===.06?1.15:1.06),'trim');
  for(const dx of [-1,1])for(const dz of [-1,1])box(g,dx*w*.442,body*.50,dz*w*.443,w*.16,body,w*.16,'ivory');
  for(let j=0;j<4;j++){
    const f=radial(g,w*.50+.021,j*PI/2);
    windowArch(f,0,body*.19,0,w*.265,body*.32,true,ornate);
    if(hasClock)clockFace(f,0,body*.774,.026,w*.345);
    else windowArch(f,0,body*.66,0,w*.30,body*.236,true,ornate);
    const b=radial(g,ss*.44,j*PI/2,body);
    archWall(b,0,0,0,ss,bellH,.15*ss,ss*.66,bellH*.45,bellH*.40,'chalk',true);
    archBand(b,0,0,.084*ss,ss*.33,bellH*.45,bellH*.40,w*.041,.10,'bone',true);
  }
  bell(g,0,body+bellH*.89,0,w*.265,ringing);
  box(g,0,body+bellH,0,w*1.067,h*.035,w*1.067,'ivory');
  if(ornate)for(const dx of [-1,1])for(const dz of [-1,1])pinnacle(g,dx*w*.465,body+bellH+.02,dz*w*.465,w*.73,w*.083);
  steeple(g,0,body+bellH+h*.016,0,w*.713,h*.243,4,'copper');
  return g;
}
function arcade(p,x,y,z,bays,span,h,depth,angle=0,pointed=false) {
  const g=group(p,x,y,z,angle),s=h*.48,rise=h*.36,r=span*.397;
  for(let i=0;i<bays;i++){
    const xx=(i+.5-bays*.5)*span;
    archWall(g,xx,0,0,span,h,depth,r*2,s,rise,'ashlar',pointed);
    archBand(g,xx,0,depth*.50+.025,r,s,rise,.094,depth*.24,'ivory',pointed);
    if(i<bays-1)column(g,xx+span*.5,0,depth*.54,span*.064,s*1.19,'chalk');
  }
  box(g,0,h+.025,0,bays*span+.18,.15,depth+.16,'trim');return g;
}
