'use strict';

const cityYaw=-.300,city=group(atlas,0,0,0,cityYaw);
const groundY=2.64,upperY=10.25;
function cityPoint(x,y,z){return [x*cos(cityYaw)+z*sin(cityYaw),y,-x*sin(cityYaw)+z*cos(cityYaw)];}
function cityFall(x,y,z,w,drop,ang=0,reach=1.2,mist=false){cascade(...cityPoint(x,y,z),w,drop,ang+cityYaw,reach,mist);}
island(city,23.75,23.65,31,true);

// Earlier foundations emerge from the new walls, then disappear into the rock.
for(let i=0;i<30;i++){
  const a=i*TAU/30,q=radial(city,22.45+rand(-.21,.30),a,-rand(2.5,4.25));
  if(i===0||i===2)continue;
  archWall(q,0,0,0,4.82,4.42,.90,2.73,.75,1.55,'aged');
  archBand(q,0,0,.49,1.365,.75,1.55,.19,.25,'sand');
  box(q,-2.24,1.55,.43,.68,3.13,.87,'aged');
}
const shrine=group(city,0,-13.25,19.05);
// A hollow, fluted conch behind the figure catches a little reflected daylight.
surface('cryptstone',0x596764,'carving',.95);
{
  const pos=[],idx=[],nx=52,ny=18,r=3.33,rise=3.82,c=(rise*rise-r*r)/(2*r);
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const u=2*i/nx-1,v=j/ny,x=r*u;
    const crown=5.42+Math.sqrt(Math.max(0,(r+c)**2-(Math.abs(x)+c)**2));
    const shell=Math.sqrt(Math.max(0,1-u*u));
    const flutes=.067*cos(PI*10*u*(1-v*.31))*shell;
    pos.push(x,.14+v*crown,.45-(1.73-flutes)*shell*(1-.46*v**3));
    const k=j*(nx+1)+i;
    if(i<nx&&j<ny)idx.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);
  }
  mesh(shrine,rawGeo(pos,idx),'cryptstone');
}
archBand(shrine,0,0,.60,3.30,5.37,3.80,.57,1.47,'aged',true);
archBand(shrine,0,.25,1.25,3.03,5.14,3.47,.19,.41,'trim',true);
for(const s of [-1,1]){
  column(shrine,s*3.69,-.15,1.12,.40,6.08,'aged',true);
  box(shrine,s*3.78,-.28,1.04,1.63,.85,2.16,'aged');
}
box(shrine,0,-.26,1.15,9.29,.80,3.57,'aged');box(shrine,0,.20,1.29,7.69,.23,2.91,'sand');
guardian(shrine,0,.25,1.13,7.44);
sunEmblem(shrine,0,7.03,.87,1.29,'brass',16);
torus(shrine,0,7.03,.93,1.05,.079,'bronze',false,32);
for(const s of [-1,1])ivy(shrine,s*3.53,6.47,1.59,3.11,.48,0,false);
const vault=radial(city,18.49,-.83,-11.33);
archWall(vault,0,0,0,6.68,5.95,2.60,4.63,2.50,2.62,'aged');
archBand(vault,0,0,1.38,2.315,2.50,2.62,.31,.41,'trim');
for(let j=0;j<3;j++){const k=-.28-j*.81;for(const side of [-1,1])column(vault,side*1.99,.06,k,.23,2.78,'aged');archBand(vault,0,0,k,1.90,2.70,2.18,.18,.30,'sand');}
mesh(vault,geometry('caveBack',()=>extrude(new T.Group(),arcline(2.35,2.65,2.54),.14,'deep').geometry),'deep',0,0,-2.57);
oldChain(city,-10.4,-9.36,19.48,43,-1);oldChain(city,12.77,-8.82,15.87,46,1);
for(let flight=0;flight<3;flight++){
  const steps=27,start=-1.35,end=-.30,route=[];
  for(let i=0;i<=steps;i++){
    const f=i/steps,a=mix(start,end,flight%2?1-f:f),y=-3.15-flight*2.96-f*2.83;
    const bearing=a+cityYaw,origin=V(34*sin(bearing),y,34*cos(bearing));
    const ray=new T.Raycaster(origin,V(-sin(bearing),0,-cos(bearing)));
    const hit=ray.intersectObject(inhabitedCliffs[0].shell,false)[0];
    let r=hit?Math.hypot(hit.point.x,hit.point.z)+.23:22.41-flight*1.72;
    if(flight===2&&Math.abs(a+.79)<.205)r=Math.max(r,19.71);
    route.push({x:r*sin(a),z:r*cos(a),y,a,r});
  }
  for(let i=0;i<steps;i++){
    const u=route[i],v=route[i+1],dx=v.x-u.x,dz=v.z-u.z,span=Math.hypot(dx,dz);
    const g=group(city,(u.x+v.x)*.5,u.y,(u.z+v.z)*.5,-Math.atan2(dz,dx));
    box(g,0,-.12,0,span+.13,.31,1.06,'aged');box(g,0,.022,0,span+.11,.081,1.13,'sand');
    if(i%4===0){
      const side=flight%2?-1:1;
      rod(g,[0,.065,side*.50],[0,.78,side*.50],.052,.040,'walnut',7);
      timber(g,[0,-.17,side*.42],[0,-1.02,-side*.68],.132,.146,'walnut');
    }
  }
  const turn=route[steps],q=radial(city,turn.r,turn.a,turn.y);
  box(q,0,-.10,.14,1.73,.28,1.62,'aged');
  balustrade(q,[-.80,.035,.87],[.80,.035,.87],.68,'wood',.78);
  if(flight<2){
    const glow=group(q,.59,.06,.65);lamp(glow,0,0,0,1.00);
  }
}
const walk=radial(city,19.32,-.76,-11.36);
for(let j=0;j<18;j++)box(walk,(j-8.5)*.36,0,.14,.345,.17,1.69,'wood');
balustrade(walk,[-3.18,.1,.94],[3.18,.1,.94],.79,'wood',1.28);
for(const x of [-2.8,0,2.8])timber(walk,[x,-.11,.85],[x,-1.97,-1.46],.19,.19,'walnut');

// The enceinte is an annulus, broken at the city gate and the outlets.
const wallR=22.45,wallH=3.48,wallN=84;
function notchedTerrace(r,bottom,top,mat){
  const a0=Math.asin(2.33/r),outline=[];
  for(let i=0;i<=96;i++){const a=a0+(TAU-2*a0)*i/96;outline.push([r*sin(a),-r*cos(a)]);}
  outline.push([-2.33,-17.60],[2.33,-17.60]);
  const ledge=extrude(city,outline,top-bottom,mat,0,(top+bottom)/2,0);ledge.rotation.x=-PI/2;
}
notchedTerrace(21.62,-.21,groundY-.18,'aged');notchedTerrace(21.76,groundY-.18,groundY,'road');
for(let j=0;j<wallN;j++){
  const a=(j+.50)*TAU/wallN,ad=Math.min(a,TAU-a),w=2*wallR*Math.tan(PI/wallN)+.012;
  if(ad<.119||Math.abs(a-.411)<.063||Math.abs(a-(TAU-.710))<.045)continue;
  const outlets=[[-45.2,13.75],[-41.9,-23.89],[35.7,-27.9],[46.6,3.10]];
  if(outlets.some(([x,z])=>Math.abs(Math.atan2(sin(a+cityYaw-Math.atan2(x,z)),cos(a+cityYaw-Math.atan2(x,z))))<.049))continue;
  const f=radial(city,wallR,a,-.51);
  box(f,0,wallH*.5,0,w,wallH,1.11,'ashlar');
  box(f,0,.45,.08,w+.02,.42,1.34,'sand');
  box(f,0,wallH-.29,.03,w+.04,.16,1.30,'joint');
  box(f,0,wallH-.085,.025,w+.04,.27,1.45,'ivory');
  box(f,0,wallH+.116,.43,w+.015,.32,.39,'trim');
  box(f,0,wallH+.48,.43,.72,.59,.46,'chalk');
  if(j%3===0){box(f,.40,1.28,.62,.46,2.73,.70,'sand');box(f,.40,2.54,.60,.61,.16,.73,'ivory');}
  else if(j%3===1){windowArch(f,-.10,1.36,.575,.19,.74,true,false,'deep');}
}
function roundTurret(p,x,y,z,r,h,flagged=false) {
  const g=group(p,x,y,z),n=16;
  cyl(g,0,h*.47,0,r*1.045,r,h*.94,'ashlar',n);
  cyl(g,0,h*.087,0,r*1.19,r*1.11,h*.17,'sand',n);
  for(const f of [.38,.70,.91])cyl(g,0,h*f,0,r*1.08,r*1.08,h*.030,'trim',n);
  cyl(g,0,h*.90,0,r,r*1.21,h*.14,'ivory',n);
  cyl(g,0,h*.981,0,r*1.22,r*1.22,h*.07,'sand',n);
  for(let j=0;j<6;j++){
    const ff=radial(g,r*.994,j*TAU/6);
    windowArch(ff,0,h*.55,0,r*.29,h*.185,true);
  }
  steeple(g,0,h*1.013,0,r*1.34,h*.437,12,'copper');
  if(flagged)flag(g,0,h*1.451+.20,0,r*1.40,r*.67,'wine',x+z);
  return g;
}
for(let i=1;i<13;i++){
  const a=i*TAU/13;
  if(i===1)continue;
  roundTurret(city,wallR*sin(a),-.51,wallR*cos(a),i%3===0?1.17:.99,4.96+(i%3)*.22,i%2===0);
}
const gate=group(city,0,.73,22.26);
archWall(gate,0,0,0,6.75,5.09,2.41,3.53,1.87,2.18,'chalk',true);
for(let i=0;i<3;i++)archBand(gate,0,.055,i*.22+1.03,1.76+i*.15,1.84,2.12+i*.12,.16,.37,i%2===0?'trim':'ivory',true);
for(let d=0;d<3;d++)archBand(gate,0,.026,-d*.7-.35,1.75,1.86,2.10,.15,.19,'sand',true);
box(gate,0,5.16,-.02,7.18,.27,2.75,'trim');
for(let j=-3;j<=3;j++)box(gate,j*.98,5.48,1.04,.54,.49,.43,'chalk');
for(const s of [-1,1]){
  roundTurret(gate,s*3.36,-.09,.20,1.28,5.72,true);
  hangingBanner(gate,s*2.49,4.46,1.35,.70,1.70,s<0?'indigo':'wine');lamp(gate,s*2.17,.19,1.80,1.65);
}
sunEmblem(gate,0,4.66,1.43,.49,'gold',12);
for(let j=0;j<12;j++)box(gate,0,-.085-j*.081,1.37+j*.385,4.73,.22,.41,'road');
box(gate,0,-1.17,6.29,5.73,.61,1.54,'sand');
balustrade(gate,[-2.68,-.86,6.94],[2.68,-.86,6.94],.59,'iron',.74);
for(const sg of [-1,1]){
  balustrade(gate,[sg*2.39,.04,1.52],[sg*2.39,-.85,5.91],.63,'stone',.79);
  lamp(gate,sg*2.46,-.85,6.34,1.50);
  timber(gate,[sg*1.68,-1.42,6.73],[sg*1.68,-3.16,3.76],.44,.51,'aged');
  box(gate,sg*1.95,1.13,-1.86,.55,2.25,3.05,'aged');
  const leaf=group(gate,sg*1.61,0,-.54,-sg*1.28);
  box(leaf,-sg*.73,1.19,0,1.48,2.38,.18,'walnut');
  for(const yy of [.25,.94,1.75,2.21]){box(leaf,-sg*.73,yy,.112,1.42,.117,.08,'iron');for(let m=0;m<4;m++)orb(leaf,-sg*(.18+m*.35),yy,.167,.041,.043,.03,'brass',7);}
}
for(let j=0;j<17;j++)box(city,0,.76+j*(groundY-.76)/16-.065,23.66-j*.368,4.36,.15,.39,'paver');
for(let j=0;j<9;j++){const xx=(j-4)*.32;const hh=1.0-.64*Math.abs(j-4)/4;cyl(gate,xx,3.86,-.94,.034,.037,hh,'iron',7);cyl(gate,xx,3.82-hh*.52,-.94,0,.088,.19,'iron',4);}
for(let i=0;i<13;i++)box(city,-3.17,groundY+.04+i*.06,21.58-i*.25,1.65,.13,.27,'road');
function lookout(a) {
  const q=radial(city,23.21,a,2.31);
  cyl(q,0,-.12,.50,1.79,2.22,.56,'trim',28);
  cyl(q,0,.215,.50,2.23,2.24,.18,'road',28);
  for(const x of [-.87,.87])timber(q,[x,-.29,1.88],[x,-2.1,-.67],.39,.41,'sand');
  for(let i=0;i<12;i++){const a1=-PI*.61+i*PI*1.22/12,a2=a1+PI*1.22/12;balustrade(q,[2.13*sin(a1),.31,.5+2.13*cos(a1)],[2.13*sin(a2),.31,.5+2.13*cos(a2)],.63,'iron',.85);}
  for(const s of [-1,1]){box(q,s*.95,.61,.66,.59,.13,1.09,'wood');box(q,s*1.21,.82,.66,.10,.56,1.10,'wood');for(const zz of [.28,1.0])box(q,s*.95,.45,zz,.42,.28,.16,'iron');}
}
lookout(-1.22);lookout(1.24);

// Streets climb from the outer tradesmen's ring to the collegiate precinct.
for(let j=0;j<35;j++){
  const a=j*TAU/35,ang=Math.atan2(sin(a),cos(a));
  if((ang>-.22&&ang<.92)||(ang<-1.11&&ang>-1.70)||(ang>1.28&&ang<1.62)||Math.abs(ang+.72)<.074)continue;
  const r=rand(18.32,19.04);
  house(city,r*sin(a),groundY,r*cos(a),rand(2.30,3.10),rand(2.38,3.19),rand(3.17,4.82),a+rand(-.10,.10),{workshop:j%6===0});
}
for(let j=0;j<26;j++){
  const a=(j+.42)*TAU/26,ang=Math.atan2(sin(a),cos(a));
  if((ang>-.27&&ang<.73)||(ang<-.65&&ang>-1.97)||(ang>1.09&&ang<1.56)||Math.abs(ang-PI)<.38)continue;
  const r=rand(14.17,15.54);
  cyl(city,r*sin(a),groundY+.25,r*cos(a),2.04,1.91,.5,'sand',12);
  house(city,r*sin(a),groundY+.50,r*cos(a),rand(2.25,3.04),rand(2.30,2.85),rand(3.62,4.95),a+rand(-.13,.13),{hip:j%3!==0});
}
for(let i=0;i<31;i++){
  const a=(i+.38)*TAU/31;
  if(Math.abs(Math.atan2(sin(a),cos(a)))<.21||Math.abs(a-.43)<.14)continue;
  tree(city,20.74*sin(a),groundY,20.74*cos(a),rand(2.02,3.47),'cypress',i%8===1);
}
// Terraced acropolis and a continuous loggia supporting the upper court.
const podium=group(city,0,0,-2.28);
cyl(podium,0,3.87,0,13.15,12.95,2.53,'sand',64);
cyl(podium,0,5.18,0,13.20,13.27,.30,'road',64);
cyl(podium,0,7.52,0,11.58,11.40,4.45,'ashlar',64);
for(let i=0;i<32;i++){
  const a=i*TAU/32,f=radial(podium,11.46,a,5.29);
  windowArch(f,0,.26,.025,1.26,3.22,true,false,'deep');
  column(f,-1.05,.03,.08,.171,3.72,'ivory');
  if(i%3===0)hangingBanner(f,.01,3.43,.22,.68,1.74,i%2?'wine':'indigo');
}
for(const [y,r,h,m] of [[9.14,11.60,.29,'joint'],[9.46,11.83,.39,'trim'],[9.81,12.03,.34,'chalk'],[10.12,12.10,.26,'road']])horizontalBand(podium,y,r,m,h,80);
for(let j=0;j<30;j++){
  const a=(j+.5)*TAU/30;
  if(Math.abs(Math.atan2(sin(a),cos(a)))<.23)continue;
  const r=12.98;
  tree(podium,r*sin(a),5.34,r*cos(a),rand(2.35,3.89),'cypress',j%11===0);
  shrub(podium,r*sin(a+.06),5.31,r*cos(a+.06),rand(.42,.70));
  ivy(podium,13.20*sin(a+.03),5.28,13.20*cos(a+.03),rand(1.24,2.67),.51,a,true);
}
// Three flights with a level landing between them.
let treadZ=18.43,treadY=groundY;
for(let f=0;f<3;f++){
  const z0=treadZ,y0=treadY;
  for(let k=0;k<10;k++){
    treadY+=(upperY-groundY)/30;
    box(city,0,(treadY+groundY)*.5-.015,treadZ,4.66,treadY-groundY+.08,.327,'road');
    box(city,0,treadY-.037,treadZ+.158,4.73,.084,.079,'ivory');
    treadZ-=.311;
  }
  for(const s of [-1,1]){
    balustrade(city,[s*2.39,y0+.14,z0+.08],[s*2.39,treadY,treadZ+.23],.73,'stone',.62);
    box(city,s*2.56,y0+.33,z0+.10,.62,.65,.65,'trim');lamp(city,s*2.56,y0+.66,z0+.10,1.39);
  }
  if(f<2){box(city,0,(groundY+treadY)*.5,treadZ-.27,4.91,treadY-groundY,.93,'paver');treadZ-=.88;}
}
function medallion(p,x,y,z,r) {
  cyl(p,x,y,z,r,r,.059,'seagreen',48);torus(p,x,y+.043,z,r*.95,r*.035,'gold',true,48);
  const g=group(p,x,y+.052,z);g.rotation.x=-PI/2;sunEmblem(g,0,0,.01,r*.83,'bone',16);
  for(let j=0;j<16;j++){const a=j*TAU/16;rod(p,[x+r*1.10*sin(a),y-.005,z+r*1.10*cos(a)],[x+r*1.65*sin(a),y-.005,z+r*1.65*cos(a)],.035,.028,'brass',5);}
}
medallion(city,0,upperY+.032,6.17,1.62);
for(const s of [-1,1])for(let j=0;j<3;j++) {
  const x=s*(3.09+j*.20),z=7.60-j*2.01;
  box(city,x,upperY+.38,z,.99,.76,.96,'sand');box(city,x,upperY+.82,z,1.12,.17,1.09,'chalk');
  const st=sculpture(city,x,upperY+.90,z,1.77+(j%2)*.13,s<0?j+1:j+4);st.rotation.y=-s*.44;
}
for(let j=0;j<24;j++){
  const a=j*TAU/24;if(Math.abs(Math.atan2(sin(a),cos(a)))<.31)continue;
  const a2=a+TAU/24;balustrade(podium,[11.91*sin(a),upperY,11.91*cos(a)],[11.91*sin(a2),upperY,11.91*cos(a2)],.62,'stone',.82);
}

// Cloister, sundial, a shaded quadrangle and the college bell tower.
const college=group(city,-13.32,groundY,3.72,-.24);
box(college,0,.21,0,7.30,.42,7.63,'paver');box(college,0,.433,0,4.10,.047,4.10,'grass');
for(let j=0;j<4;j++){
  const q=radial(college,2.73,j*PI/2,.43);
  arcade(q,0,0,0,4,1.385,1.83,.53,0,false);roof(q,0,1.91,-.07,6.50,1.43,.64,'tile2',true);
}
house(college,0,.43,-3.18,5.72,1.70,3.80,0,{roof:'copper',chimney:false});
tree(college,-1.04,.45,-.74,3.10,'olive');
cyl(college,1.17,.65,.81,.38,.29,.38,'ivory',12);cyl(college,1.17,.92,.81,.47,.47,.13,'gold',24);
extrude(college,[[0,0],[.28,0],[0,.45]],.06,'brass',1.17,.99,.81);
bellTower(college,-2.49,.43,3.09,1.80,8.78,true,true);
// The fountain court and the market awnings.
function fountain(p,x,y,z,r){
  const g=group(p,x,y,z);
  cyl(g,0,.12,0,r*1.15,r*1.15,.22,'sand',20);cyl(g,0,.29,0,r,r*.94,.29,'chalk',24);
  cyl(g,0,.442,0,r*.87,r*.87,.034,'water',32);torus(g,0,.46,0,r*.931,r*.075,'ivory',true);
  lineProfile(g,0,.45,0,r*.31,r*1.2,[[1,0],[.9,.09],[.41,.19],[.38,.39],[.75,.46],[1.42,.55],[1.47,.62],[.4,.64],[.22,.84],[.61,.89],[.64,.94],[.21,1]],'chalk',20);
  for(let i=0;i<6;i++){const a=i*TAU/6;const pts=[];for(let j=0;j<7;j++){const t=j/6;pts.push([sin(a)*r*(.13+.59*t),.45+r*(.86+.59*t-1.45*t*t),cos(a)*r*(.13+.59*t)]);}tube(g,pts,.029,'jewel',12,4);}
}
function basket(p,x,y,z,r,fruit=false){
  cyl(p,x,y+r*.46,z,r*.73,r,r*.92,'wood',10);torus(p,x,y+r*.92,z,r,r*.075,'rope',true,12);
  if(fruit)for(let i=0;i<8;i++){const a=i*2.40,rr=(i/8)*r*.71;orb(p,x+rr*sin(a),y+r*(.95+.17*(1-i/8)),z+rr*cos(a),r*.29,r*.27,r*.28,i%3?'saffron':'wine',7);}
}
function stall(p,x,y,z,angle,col){
  const g=group(p,x,y,z,angle),w=2.23,d=1.40;
  box(g,0,.67,.05,w*.94,.15,d*.72,'plank');box(g,0,.38,.42,w*.85,.47,.14,'wood');
  for(const xx of [-1,1])for(const zz of [-1,1]){
    cyl(g,xx*w*.46,.90,zz*d*.43,.047,.038,1.80,'walnut',6);
    box(g,xx*w*.411,.34,zz*d*.29,.086,.69,.086,'walnut');
  }
  for(let j=0;j<7;j++){
    const xx=w*((j+.5)/7-.5),m=j%2?'linen':col;
    const ps=[],ind=[];
    const soffit=t=>1.98-.23*t-.188*sin(t*PI);
    for(let k=0;k<=8;k++){
      const t=k/8;
      for(const side of [-1,1]){const xx2=xx+side*w/14;ps.push(xx2,soffit(t)+.029*cos((xx2/w+.5)*TAU*4.0)*(1.-.42*sin(t*PI)),(t-.5)*d*1.16);}
      if(k<8){const id=k*2;ind.push(id,id+2,id+1,id+1,id+2,id+3);}
    }
    mesh(g,rawGeo(ps,ind),m);
    const pts=[[-w/14,0],[w/14,0],[w/14,-.13],[w/14*.76,-.198],[0,-.228],[-w/14*.76,-.198],[-w/14,-.13]];
    extrude(g,pts,.026,m,xx,1.77,d*.575);
    box(g,xx,1.702,d*.587,w/7,.023,.018,'bone');
  }
  basket(g,-.60,.75,.15,.24,true);basket(g,.02,.75,.15,.22,true);
  for(let i=0;i<3;i++)cyl(g,.52+i*.13,.86,.13,.085,.047,.24,i%2?'tile':'copper',8);
  if(col==='indigo'){
    for(let j=0;j<4;j++){
      const roll=cyl(g,-.61+j*.33,.23,.61,.134,.134,.82,pick(['wine','indigo','saffron','linen']),12);roll.rotation.z=PI/2;
      torus(g,-.61+j*.33,.23,.61,.14,.017,'rope',false,14).rotation.y=PI/2;
    }
  }else{
    for(const s of [-1,1]){const pot=group(g,s*.88,.01,.73);lineProfile(pot,0,0,0,.154,.49,[[.60,0],[.81,.08],[1.11,.34],[1.06,.61],[.65,.79],[.58,.93],[.70,.96],[.70,1]],'tile2',12);torus(pot,.147,.31,.01,.084,.027,'tile2',false,10);}
  }
}
const market=group(city,6.53,groundY,14.93,-.22);
box(market,0,.035,0,6.3,.07,5.31,'paver');fountain(market,0,.09,.22,.88);
stall(market,-2.46,.09,.68,PI/2,'wine');stall(market,2.42,.09,.52,-PI/2,'indigo');
stall(market,.17,.09,-1.99,0,'saffron');stall(market,-1.39,.09,2.41,PI,'seagreen');
const bakery=house(city,13.67,groundY,10.98,2.60,2.43,3.62,.69,{roof:'tile',workshop:true});
for(let i=0;i<4;i++)basket(bakery,-.85+i*.37,.03,1.65+rand(-.10,.2),rand(.17,.23),true);
const forge=house(city,-7.05,groundY,16.12,3.0,2.38,3.40,-.65,{roof:'seagreen',workshop:true});
for(let i=0;i<6;i++){
  const sp=fogPuff(forge,.80,3.71,-.36,.94,1.12,.19,0xafaaa0);const ph=i/6;
  ticking.push(t=>{const u=(t*.19+ph)%1;sp.position.set(.81+u*.98,3.66+u*2.28,-.36+u*.12);sp.scale.set(.44+u*1.31,.56+u*1.43,1);sp.material.opacity=.27*sin(PI*u);});
}
for(const [x,z,h] of [[-8.9,13.1,3.0],[14.7,7.3,2.8],[3.7,17.0,2.65],[-17.0,-4.7,3.00],[10.3,-12.7,3.34],[-7.8,10.1,2.71]])tree(city,x,groundY,z,h,'olive');
// A covered passage above the ascending lane.
const passage=group(city,-5.11,groundY,12.57,-.79);
archWall(passage,0,0,0,3.29,2.18,1.39,1.96,.89,1.00,'ashlar');archBand(passage,0,0,.72,.98,.89,1,.16,.21,'trim');
box(passage,0,2.72,0,3.37,1.08,1.47,'chalk');roof(passage,0,3.27,0,3.77,1.87,.77,'tile');for(const xx of [-.92,0,.92])windowArch(passage,xx,2.35,.75,.40,.68,false);
