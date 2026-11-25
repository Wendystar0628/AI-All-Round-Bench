'use strict';

const basilica=group(city,0,upperY+.015,-2.87);
for(const [y,w,d,h,m] of [[.09,12.5,14.18,.18,'sand'],[.24,12.13,13.87,.15,'road'],[.38,11.79,13.53,.13,'ivory']])
  box(basilica,0,y,-.15,w,h,d,m);
const church=group(basilica,0,.445,0);
// Open nave, with a lit inner sanctuary beyond the doors.
for(const s of [-1,1]){
  box(church,s*3.29,3.99,-.10,.61,7.98,11.23,'chalk');
  box(church,s*4.31,2.49,-.36,1.87,4.97,10.84,'ashlar');
  roof(church,s*4.36,5.01,-.36,2.37,11.21,1.16,'seagreen');
  const clere=group(church,s*3.615,0,-.02,s*PI/2);
  for(let j=0;j<6;j++){
    const x=(j-2.5)*1.73;
    windowArch(clere,x,5.90,0,.92,1.68,true,true);
    column(clere,x+.84,5.61,.025,.105,2.07,'ivory');
  }
  box(church,s*3.285,7.84,-.08,.87,.24,11.53,'trim');
  for(let j=0;j<5;j++){
    const z=-4.72+j*2.24;
    const b=group(church,s*5.04,0,z,s*PI/2);
    windowArch(b,0,.84,.19,1.13,3.17,true,true);
    const y0=3.28;
    const support=extrude(church,[[5.95,y0],[6.45,y0],[6.45,y0+.68],[6.52,4.15],[6.27,4.81],[5.85,5.30],[5.02,5.83],[4.25,6.68],[3.67,7.64],[3.43,7.76],[3.43,6.96],[4.00,6.20],[4.70,5.50],[5.28,5.09],[5.68,4.60],[5.91,3.97]],.38,'ivory',0,0,z);
    support.scale.x=s;
    const out=s*6.22;
    box(church,out,1.91,z,.75,3.81,.81,'ashlar');box(church,out,.32,z,.99,.63,1.04,'sand');
    box(church,out,3.61,z,.96,.26,1.0,'trim');pinnacle(church,out,3.73,z,2.76,.286);
  }
}
roof(church,0,8.03,-.15,7.70,11.74,1.90,'copper',true);
const apse=group(church,0,0,-5.78);
cyl(apse,0,3.08,0,3.32,3.32,6.16,'ashlar',20);
for(let j=0;j<7;j++){
  const q=radial(apse,3.33,PI/2+j*PI/6);windowArch(q,0,1.24,0,.99,3.91,true,true);
}
dome(apse,0,6.14,0,3.44,1.89,'seagreen',false,false);
// Four domed subsidiary chapels, each with its own fenestrated drum.
for(const s of [-1,1])for(const rear of [-1,1]){
  const x=s*4.80,z=rear<0?-4.60:2.12,r=rear<0?1.91:1.68;
  cyl(church,x,3.20,z,r*.97,r*.91,6.41,'chalk',16);
  cyl(church,x,5.85,z,r*1.01,r*1.04,.42,'sand',16);
  drum(church,x,6.23,z,r,1.76,true,10);
  dome(church,x,7.99,z,r*1.102,r*1.28,rear<0?'copper2':'copper',false,true);
}
const front=group(church,0,0,5.29);
archWall(front,0,0,0,7.07,7.64,1.10,3.13,1.81,2.34,'chalk',true);
extrude(front,[[-3.90,0],[0,2.67],[3.90,0]],1.26,'ashlar',0,7.48,.02);
for(const s of [-1,1]){
  rod(front,[s*3.92,7.47,.69],[0,10.16,.69],.121,.121,'bone',8);
  rod(front,[s*3.44,7.52,.722],[0,9.83,.722],.054,.054,'gold',6);
  for(let j=0;j<5;j++)pinnacle(front,s*(.66+j*.65),9.52-j*.442,.70,.61,.082);
  column(front,s*3.27,.11,.70,.276,7.30,'ivory',true);
  for(const [dx,y] of [[2.27,1.13],[2.74,5.31]]){
    const alc=group(front,s*dx,y,.64);
    windowArch(alc,0,0,0,.69,1.40,true,false,'deep');
    box(alc,0,-.09,.10,.86,.18,.59,'trim');sculpture(alc,0,.035,.20,1.22,1,'statue');
  }
}
for(let i=0;i<5;i++)archBand(front,0,.035,.58+i*.146,1.558+i*.145,1.79,2.33+i*.16,.13,.27,i===1||i===3?'trim':'ivory',true);
for(const s of [-1,1])for(let j=0;j<3;j++)column(front,s*(1.64+j*.175),.02,.74+j*.124,.079,1.81,'chalk',false);
box(front,0,2.41,-4.33,4.90,4.82,.21,'deep');
windowArch(front,0,1.01,-4.20,1.13,3.11,true,true,'amber');
for(const dx of [-1,1])for(const zz of [-1.37,-2.95])column(front,dx*1.42,0,zz,.157,3.42,'sand',true);
box(front,0,.032,-1.22,3.36,.064,6.56,'paver');
for(const s of [-1,1])box(front,s*.63,.083,-1.33,.055,.031,6.20,'brass');
aura(front,0,1.80,-3.74,3.19,0xffb96b,.48);
const doorLeft=group(front,-1.55,.045,.29,-.54),doorRight=group(front,1.55,.045,.29,.76);
for(const [panel,s] of [[doorLeft,1],[doorRight,-1]]) {
  box(panel,s*.61,1.28,0,1.24,2.53,.12,'walnut');box(panel,s*.62,1.32,.076,.94,2.14,.051,'brass');
  for(let j=0;j<3;j++){box(panel,s*.62,.50+j*.73,.117,.77,.61,.041,'walnut');sunEmblem(panel,s*.62,.50+j*.73,.152,.16,'brass');}
}
function rose(p,x,y,z,r){
  const g=group(p,x,y,z);
  const circle=mesh(g,geometry('rosePane',()=>new T.CircleGeometry(1,48)),'deep');circle.scale.setScalar(r);
  torus(g,0,0,.023,r*1.07,r*.105,'trim',false,48);torus(g,0,0,.12,r*.965,r*.048,'gold',false,48);
  for(let i=0;i<12;i++){
    const a=i*TAU/12;
    const petal=group(g,0,0,.077);petal.rotation.z=a;
    const lens=orb(petal,0,r*.579,0,r*.164,r*.311,.039,i%3===0?'amber':i%3===1?'glass':'copper2',12);
    const tr=torus(petal,0,r*.579,.047,r*.20,r*.035,'bone',false,20);tr.scale.set(r*.20*.81,r*.20*1.55,r*.20);
    rod(petal,[0,r*.155,.034],[0,r*.925,.033],r*.027,r*.023,'gold',5);
  }
  torus(g,0,0,.135,r*.28,r*.05,'bone',false,24);
  orb(g,0,0,.142,r*.207,r*.207,.064,'amber',14);sunEmblem(g,0,0,.204,r*.131,'bone');
}
rose(front,0,6.64,.635,1.152);
sunEmblem(front,0,8.72,.70,.54,'gold',12);finial(front,0,10.13,.57,.74);
for(const s of [-1,1]){
  bellTower(church,s*4.45,.03,5.07,1.92,15.31,false,true);
  hangingBanner(church,s*4.44,6.24,6.035,.90,2.60,s===1?'wine':'indigo');
  const q=group(front,s*2.71,0,1.32);
  slab(q,0,0,0,.91,.67,.85,'sand');sculpture(q,0,.71,0,2.24,s+2);
}
// The crossing carries the drum on an octagonal transition under a ribbed cupola.
const crossing=group(church,0,0,-1.41);
cyl(crossing,0,7.66,0,4.74,4.65,2.27,'ashlar',8,PI/8);
cyl(crossing,0,8.78,0,4.82,4.82,.32,'trim',8,PI/8);
cyl(crossing,0,9.04,0,4.69,4.51,.32,'bone',24);
drum(crossing,0,9.13,0,4.39,3.10,true,18);
dome(crossing,0,12.23,0,4.81,5.28,'copper2',true,false);
drum(crossing,0,17.62,0,.91,1.89,true,8);
cyl(crossing,0,19.62,0,1.02,.75,.24,'gold',16);
for(let j=0;j<6;j++){
  const a=j*TAU/6;
  column(crossing,.59*sin(a),19.73,.59*cos(a),.094,1.37,'chalk',true);
  archBand(radial(crossing,.55,a,19.74),0,0,0,.204,.87,.41,.058,.14,'bone',true);
}
cyl(crossing,0,21.17,0,.77,.81,.24,'trim',12);
steeple(crossing,0,21.28,0,.82,2.28,8,'copper');
for(let i=0;i<4;i++){const a=i*PI/2;tube(crossing,[[.22*sin(a),23.44,.22*cos(a)],[.31*sin(a),23.83,.31*cos(a)],[.65*sin(a),24.13,.65*cos(a)],[.82*sin(a),24.61,.82*cos(a)]],.061,'gold',15,6);}
const orbHeight=25.59;
const glassBall=new T.MeshPhysicalMaterial({color:0x9de3e2,roughness:.065,metalness:.22,transparent:true,opacity:.53,depthWrite:false,clearcoat:1,clearcoatRoughness:.025,envMapIntensity:1.49});
const holy=orb(crossing,0,orbHeight,0,.86,.86,.86,glassBall,44);
const armillaryRigs=[];
aura(crossing,0,orbHeight,.20,4.78,0xa9faf0,.38);
const flare=aura(crossing,-.25,orbHeight+.22,.65,1.35,0xe2ffff,.74,true);
for(let i=0;i<3;i++){
  const rig=group(crossing,0,orbHeight,0),ring=group(rig);
  armillaryRigs.push(rig);
  rig.rotation.set([.71,-.73,.30][i],[.22,1.02,-.38][i],[.25,.88,-.77][i]);
  const r=1.20+i*.225;
  torus(ring,0,0,0,r,.025,'brass',false,64);
  const links=38+i*7;
  for(let j=0;j<links;j++){
    const a=j*TAU/links,link=group(ring,r*cos(a),r*sin(a),0);
    link.rotation.z=a+PI/2;
    const piece=torus(link,0,0,0,.105,.0265,'gold',false,12);
    piece.scale.x*=1.36;piece.scale.y*=.73;piece.rotation.x=j%2?.77:-.61;
    if(j%10===0)orb(link,0,0,0,.086,.086,.086,'bone',9);
  }
  moving(rig,t=>{rig.rotation.y=[.22,1.02,-.38][i]+t*(i%2?-.128:.103);rig.rotation.z=[.25,.88,-.77][i]+.22*sin(t*.19+i);});
}
ticking.push(t=>{M.jewel.emissiveIntensity=.57+.16*sin(t*.81);M.shard.emissiveIntensity=.39+.092*sin(t*.47+.8);flare.material.opacity=.48+.14*sin(t*1.28);});

// Open channels and intermediate cisterns join the high inlet to both outfalls.
function trough(p,a,b,w,deep=.37,style='ashlar') {
  const [x1,y1,z1]=a,[x2,y2,z2]=b,dx=x2-x1,dz=z2-z1,dy=y2-y1;
  const len=Math.hypot(dx,dy,dz),g=group(p,(x1+x2)/2,(y1+y2)/2,(z1+z2)/2,Math.atan2(dx,dz));
  g.rotation.order='YXZ';g.rotation.x=-Math.atan2(dy,Math.hypot(dx,dz));
  box(g,0,-deep*.53,0,w+.25,deep,len+.08,style);box(g,0,.01,0,w,.074,len+.13,'water');
  for(const s of [-1,1]){box(g,s*(w*.50+.092),.061,0,.183,.29,len+.13,'sand');box(g,s*(w*.50+.092),.218,0,.23,.08,len+.15,'ivory');}
  return g;
}
function cistern(p,x,y,z,r,floor=0,openings=[]) {
  cyl(p,x,(y+floor)*.5,z,r*.89,r,y-floor,'ashlar',32);
  cyl(p,x,y-.26,z,r*1.045,r*1.045,.38,'trim',32);
  cyl(p,x,y-.019,z,r*.988,r*.988,.11,'water',40);
  if(!openings.length){torus(p,x,y+.12,z,r,r*.054,'ivory',true,40);return;}
  for(let i=0;i<48;i++){
    const a=i*TAU/48,b=(i+1)*TAU/48,mid=(a+b)*.5;
    const open=openings.some(([bearing,width])=>Math.abs(Math.atan2(sin(mid-bearing),cos(mid-bearing)))<width/(2*r));
    if(!open)rod(p,[x+r*sin(a),y+.12,z+r*cos(a)],[x+r*sin(b),y+.12,z+r*cos(b)],r*.055,r*.055,'ivory',8);
  }
}
// Place the lips of each conduit at the rim, leaving the mixing basin open.
function poolRim(centre,radius,toward){
  const dx=toward[0]-centre[0],dz=toward[2]-centre[2],scale=(radius-.09)/Math.hypot(dx,dz);
  return [centre[0]+dx*scale,centre[1],centre[2]+dz*scale];
}
function supportedLeat(p,a,b,width,thickness){
  trough(p,a,b,width,thickness);
  const length=Math.hypot(b[0]-a[0],b[2]-a[2]),bays=Math.ceil(length/5.65);
  for(let i=0;i<bays;i++){
    const f=(i+.5)/bays,x=mix(a[0],b[0],f),z=mix(a[2],b[2],f);
    const radius=Math.hypot(x,z+2.28);
    if(radius<11.39)continue;
    const base=radius<13.14?5.31:groundY,span=length/bays,h=mix(a[1],b[1],f)-thickness-base;
    if(h<.73)continue;
    const bearing=-Math.atan2(b[2]-a[2],b[0]-a[0]),opening=span*.73;
    const g=group(p,x,base,z,bearing),rise=Math.min(opening*.48,h*.54),spring=h-rise-.36;
    archWall(g,0,0,0,span+.04,h+.06,width+.09,opening,spring,rise,'sand');
    for(const side of [-1,1])archBand(g,0,0,side*(width*.50+.068),opening*.50,spring,rise,.126,.107,'ivory');
    box(g,0,h-.033,0,span+.09,.16,width+.30,'trim');
  }
}
function sluice(p,x,y,z,width,bearing){
  const g=group(p,x,y,z,bearing);
  for(const side of [-1,1]){
    box(g,side*(width*.5+.10),.52,0,.186,1.31,.22,'walnut');
    box(g,side*(width*.5+.10),.12,0,.28,.19,.33,'iron');
  }
  box(g,0,1.09,0,width+.49,.164,.24,'wood');
  for(let j=0;j<3;j++)box(g,0,.46+j*.164,0,width+.022,.153,.113,'plank');
  for(const side of [-1,1])box(g,side*width*.32,.614,.088,.056,.46,.049,'iron');
  rod(g,[0,.69,0],[0,1.39,0],.038,.038,'iron',8);
  torus(g,0,1.42,0,.24,.035,'brass',true,16);
  for(let i=0;i<4;i++){const a=i*PI/2;rod(g,[0,1.42,0],[.236*sin(a),1.42,.236*cos(a)],.024,.024,'brass',6);}
}
const headBasin=[-.45,10.77,-14.85],headRadius=2.51;
cistern(city,...headBasin,headRadius,groundY,[[-2.30,1.32],[1.29,1.25],[-1.14,1.06]]);
const highRoute=[[4.32,10.65,-13.41],[8.77,10.53,-10.35],[11.09,10.41,-6.10],[11.55,10.33,-2.59]];
highRoute.unshift(poolRim(headBasin,headRadius,highRoute[0]));
for(let i=1;i<highRoute.length;i++)supportedLeat(city,highRoute[i-1],highRoute[i],1.14,.67);
sluice(city,2.11,10.72,-14.04,1.14,1.29);
cistern(city,11.63,7.93,-.75,1.50,groundY,[[PI,1.24],[.33,1.41]]);
cityFall(11.55,10.36,-2.50,1.15,2.48,.07,1.65);
trough(city,poolRim([11.63,7.96,-.75],1.50,[12.32,7.90,1.25]),[12.32,7.90,1.25],1.30,.48);
cistern(city,12.74,5.58,3.13,1.46,groundY,[[-2.92,1.39],[.09,1.47]]);
cityFall(12.32,7.94,1.25,1.31,2.39,.25,1.65);
trough(city,poolRim([12.74,5.61,3.13],1.46,[12.88,5.53,4.68]),[12.88,5.53,4.68],1.37,.43);
cistern(city,12.80,2.92,6.23,1.31,groundY,[[3.09,1.40],[-.22,1.52]]);
cityFall(12.88,5.57,4.68,1.33,2.68,-.055,1.46);
const canal=[[12.08,2.91,9.5],[10.60,2.90,12.11],[10.7,2.88,16.03],[9.08,2.86,20.50],[9.41,2.83,21.85]];
canal.unshift(poolRim([12.80,2.94,6.23],1.31,canal[0]));
for(let i=1;i<canal.length;i++)trough(city,canal[i-1],canal[i],1.43,.24);
for(const [x,z,ry] of [[11.67,10.10,-.36],[10.63,13.02,.03],[9.90,18.26,-.36]]){
  const b=group(city,x,groundY+.06,z,ry);
  archWall(b,0,0,0,2.72,.94,1.04,1.80,.12,.60,'ashlar');
  archBand(b,0,.015,.54,.90,.12,.60,.14,.13,'trim');for(const ss of [-1,1])balustrade(b,[-1.33,.94,ss*.51],[1.33,.94,ss*.51],.40,'stone',.53);
}
cityFall(9.41,2.88,21.85,2.10,36.9,.412,2.06,true);
cityFall(10.57,2.73,21.31,.69,35.2,.44,1.97,true);
const sideRoute=[[-8.35,10.23,-11.09],[-11.52,9.94,-7.10]];
sideRoute.unshift(poolRim(headBasin,headRadius,sideRoute[0]));
for(let i=1;i<sideRoute.length;i++)supportedLeat(city,sideRoute[i-1],sideRoute[i],.77,.38);
sluice(city,-3.29,10.57,-13.42,.77,-1.14);
cistern(city,-12.55,5.38,-6.84,1.38,groundY,[[1.82,.90],[-1.14,1.03]]);cityFall(-11.52,9.99,-7.10,.81,4.64,-1.39,1.18);
trough(city,poolRim([-12.55,5.38,-6.84],1.38,[-14.74,5.20,-5.83]),[-14.74,5.20,-5.83],.92,.51);
cityFall(-14.72,5.24,-5.84,.94,2.45,-.66,.83);
const lowRoute=[[-15.28,2.86,-5.16],[-17.89,2.80,.56],[-17.45,2.79,7.70],[-16.22,2.77,12.93],[-15.33,2.74,17.90]];
for(let i=1;i<lowRoute.length;i++)trough(city,lowRoute[i-1],lowRoute[i],.86,.19);
cityFall(-15.38,2.79,17.93,1.50,35.51,-.711,1.82,true);
cityFall(-16.13,2.62,17.10,.44,28.7,-.71,1.99);
// A faint spectrum at the foot of the falls.
{
  const ps=[],cs=[],ind=[];const cols=[0xf2a090,0xf5c78c,0xe8df9c,0xa7d8a6,0x98dbe0,0xa9afe2];
  for(let i=0;i<=40;i++){
    const a=.19+2.46*i/40;
    for(let j=0;j<6;j++){const r=7.1+j*.16;ps.push(11.9+r*cos(a),-33.9+r*sin(a),25.2);const c=new T.Color(cols[j]);cs.push(c.r,c.g,c.b);
      if(i<40&&j<5){const id=i*6+j;ind.push(id,id+1,id+6,id+1,id+7,id+6);}}
  }
  const rainbow=mesh(waterFx,rawGeo(ps,ind,cs),new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,blending:T.AdditiveBlending,transparent:true,depthWrite:false,opacity:.083}));
  rainbow.rotation.y=cityYaw;rainbow.castShadow=false;
}
function pedestrian(p,x,y,z,h=.62,angle=0,cloak='indigo') {
  const g=group(p,x,y,z,angle);
  h*=1.31;
  for(const s of [-1,1]){rod(g,[s*h*.09,.013,s*h*.031],[s*h*.075,h*.44,0],h*.045,h*.056,'deep',6);rod(g,[s*h*.12,h*.72,0],[s*h*.17,h*.45,.03],h*.052,h*.039,cloak,7);}
  cyl(g,0,h*.49,0,h*.155,h*.102,h*.51,cloak,7);
  orb(g,0,h*.72,0,h*.156,h*.125,h*.112,cloak,8);
  orb(g,0,h*.878,0,h*.086,h*.108,h*.086,'wood',8);
  cyl(g,0,h*.96,0,h*.103,h*.066,h*.099,'walnut',8);
}
for(let j=0;j<19;j++){const a=rand(0,TAU),r=rand(1.3,2.24);pedestrian(market,cos(a)*r,.10,sin(a)*r,rand(.47,.65),a,pick(['wine','indigo','saffron','linen','seagreen']));}
for(let j=0;j<7;j++)pedestrian(city,rand(-2.19,2.19),upperY+.04,rand(4.82,7.92),rand(.48,.63),rand(0,TAU),pick(['wine','indigo','linen']));
