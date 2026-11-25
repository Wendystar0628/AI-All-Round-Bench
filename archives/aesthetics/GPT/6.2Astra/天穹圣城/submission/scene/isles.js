'use strict';

const islands=[
  {id:'port',x:-45.2,y:1.37,z:13.75,rx:7.18,rz:5.89,depth:13.17},
  {id:'abbey',x:-41.9,y:-.61,z:-23.89,rx:7.45,rz:6.20,depth:12.68},
  {id:'mill',x:-20.25,y:12.17,z:-49.8,rx:5.81,rz:5.0,depth:12.10},
  {id:'horologe',x:35.7,y:1.93,z:-27.9,rx:5.38,rz:4.92,depth:14.18},
  {id:'ruin',x:46.6,y:-2.62,z:3.10,rx:6.16,rz:5.37,depth:11.9},
  {id:'pharos',x:27.8,y:-6.65,z:48.2,rx:4.82,rz:4.15,depth:10.4}
];
for(const a of islands){a.base=group(atlas,a.x,a.y,a.z);island(a.base,a.rx,a.rz,a.depth);}
const [port,abbey,mill,clockIsle,ruins,lighthouse]=islands.map(a=>a.base);
function yard(p,x,y,z,w,d){
  box(p,x,y+.079,z,w,.158,d,'paver');box(p,x,y+.167,z,w*.96,.036,d*.96,'road');
}
function keg(p,x,y,z,r=.34){
  lineProfile(p,x,y,z,r,r,[[.82,0],[.92,.20],[1,.65],[1,1.12],[.91,1.58],[.81,1.79]],'wood',12);
  cyl(p,x,y+r*1.79,z,r*.81,r*.81,r*.074,'plank',12);
  for(const [level,rr] of [[.25,.96],[.95,1.02],[1.54,.96]])torus(p,x,y+r*level,z,r*rr,r*.061,'iron',true,14);
}
function crate(p,x,y,z,s=.67){
  const g=group(p,x,y,z,rand(-.11,.11));box(g,0,s*.48,0,s,s*.96,s*.88,'wood');
  for(const side of [-1,1]){
    for(const xx of [-1,1])box(g,xx*s*.44,s*.48,side*s*.447,s*.092,.96*s,s*.074,'plank');
    timber(g,[-s*.39,s*.092,side*s*.461],[s*.39,s*.86,side*s*.461],s*.104,s*.084,'plank');
    box(g,0,s*.96,side*s*.331,s*.97,s*.085,s*.088,'walnut');
  }return g;
}
// A planked quay with exposed diagonal braces.
const docks=group(port,-2.40,.24,3.07,-.13);
for(let i=0;i<28;i++)box(docks,(i-13.5)*.40,0,0,.384,.18,2.10,'plank');
for(const z of [-.78,.78])box(docks,0,-.195,z,11.51,.31,.24,'walnut');
for(let i=0;i<5;i++){
  const x=-5.20+i*2.55;
  for(const s of [-1,1]){cyl(docks,x,-.33,s*.92,.156,.133,2.09,'walnut',9);torus(docks,x,.61,s*.92,.147,.034,'rope',true,12);}
  timber(docks,[x,.01,-.70],[x+.92,-1.60,-.70],.19,.19,'walnut');
  if(i%2===0)for(let j=0;j<3;j++)torus(docks,x+.37,.13+.039*j,.59,.22+j*.026,.035,'rope',true,16);
}
yard(port,.31,.035,-.48,8.68,4.36);
house(port,1.99,.23,-1.37,4.35,2.78,3.08,-.11,{roof:'seagreen',hip:false,chimney:false,workshop:true});
for(let i=0;i<12;i++){const x=rand(.15,3.45),z=rand(.44,2.13);if(i%3)crate(port,x,.24,z,rand(.45,.73));else keg(port,x,.24,z,rand(.22,.34));}
crate(port,.41,.82,1.02,.50);crate(port,.91,.79,1.14,.49);
const crane=group(port,-3.31,.31,1.76,-.31);
for(const x of [-.46,.46])for(const z of [-.46,.46])timber(crane,[x,0,z],[x*.38,3.98,z*.38],.22,.22,'walnut');
for(let j=0;j<3;j++)box(crane,0,.60+j*1.10,0,1.01-j*.15,.13,.91-j*.15,'wood');
timber(crane,[-1.88,3.17,0],[1.26,4.59,0],.25,.22,'walnut');
timber(crane,[.01,2.18,0],[1.13,4.47,0],.159,.18,'wood');
rod(crane,[-1.78,3.25,0],[.03,4.02,0],.042,.042,'rope',6);
const load=group(crane,1.19,0,0);crate(load,0,0,0,.68);
const hoist=rod(crane,[1.19,.78,0],[1.19,4.54,0],.039,.039,'rope',6);
const hmat=group(crane);crane.remove(hoist);hmat.add(hoist);
moving(load,t=>{const k=t%46;load.position.y=.23+(k>17&&k<25?1.76*sin(PI*(k-17)/8)**2:0);});
moving(hmat,t=>{const k=t%46,d=k>17&&k<25?1.76*sin(PI*(k-17)/8)**2:0;hmat.scale.y=1-d/3.76;hmat.position.y=4.54*(1-hmat.scale.y);});
const moor=group(port,-4.13,.06,-.82);
cyl(moor,0,.41,0,.93,.79,.82,'sand',10);
for(const xx of [-.52,.52])for(const zz of [-.52,.52])rod(moor,[xx,.78,zz],[xx*.38,4.72,zz*.38],.127,.087,'walnut');
for(let j=0;j<4;j++){const yy=.95+j*1.03;timber(moor,[-.50+j*.083,yy,.47-j*.079],[.41-j*.074,yy+.99,.37-j*.069],.089,.099,'wood');}
cyl(moor,0,4.78,0,.55,.56,.17,'wood',8);torus(moor,0,5.24,0,.45,.09,'brass',false,20);
tree(port,4.45,.02,-2.24,2.59);tree(port,5.30,0,-.51,2.21);
const signal=group(port,.18,.18,2.39);
for(const xx of [-3.7,3.7])cyl(signal,xx,1.79,0,.058,.048,3.58,'walnut',8);
tube(signal,[[-3.7,3.45,0],[-1.8,3.01,.12],[0,2.89,.19],[1.8,3.01,.12],[3.7,3.45,0]],.027,'rope',24,5);
for(let j=0;j<13;j++){
  const x=-3.36+j*.56,y=2.89+.56*(x/3.70)**2;
  const f=extrude(signal,[[-.21,0],[.23,0],[.065,-.55]],.027,pick(['wine','saffron','indigo','linen']),x,y,.16);
  f.rotation.x=rand(-.21,.21);
}

// Gored linen envelope, axial frame, suspension rigging and a carved launch.
const airship=group(port,-5.56,9.34,1.42,-.28);
surface('silk',0xffffff,'plain',.89,.025,{vertexColors:true});
const airR=t=>Math.pow(Math.max(0,sin(PI*t)),.64)*(1.07-.10*t);
const envPoint=(t,a,d=0)=>[(t-.5)*12.26,(2.20*airR(t)+d)*cos(a),(2.20*airR(t)+d)*sin(a)];
{
  const ps=[],cs=[];const slices=40,gores=28;
  const fabrics=[0xeacfa0,0xf3dab0,0xe5c599,0xf0d6a6,0xdcbd8f,0xf2d8ab,0xe7cda1];
  for(let j=0;j<slices;j++)for(let k=0;k<gores;k++){
    const t=j/slices,tt=(j+1)/slices,a=k*TAU/gores,b=(k+1)*TAU/gores;
    let color=new T.Color(fabrics[k%7]);
    if(j<4||j>=36)color.set(k%2===0?0xac7250:0xbc865c);
    if(j===5||j===34||j===6||j===33)color.set(j===6||j===33?0x5d8981:0x956148);
    const pp=[envPoint(t,a),envPoint(t,b),envPoint(tt,a),envPoint(t,b),envPoint(tt,b),envPoint(tt,a)];
    for(const v of pp){ps.push(...v);const shade=.98+.028*sin(k*1.2)+.052*v[1]/2.2;cs.push(color.r*shade,color.g*shade,color.b*shade);}
  }
  // Longitude runs along X, so the exterior face winding is reversed.
  const geo=rawGeo(ps,null,cs);M.silk.side=T.DoubleSide;mesh(airship,geo,'silk');
}
for(const t of [.10,.19,.32,.46,.60,.74,.87,.93]){
  const r=2.20*airR(t),o=torus(airship,(t-.5)*12.26,0,0,r,.037,'brass',false,44);o.rotation.y=PI/2;
}
for(let k=0;k<14;k++){
  const a=k*TAU/14,path=[];for(let j=0;j<=14;j++)path.push(envPoint(.025+j*.95/14,a,.018));
  tube(airship,path,.026,k%2===0?'rope':'trim',24,5);
}
// Stitched panel repairs and a painted eight-point navigation star.
const patch=box(airship,-1.85,.22,2.07,.71,.48,.018,'linen');patch.rotation.z=-.15;
sunEmblem(airship,-.13,.08,2.237,.65,'brass',8);torus(airship,-.13,.08,2.250,.759,.031,'brass',false,28);
for(const s of [-1,1]){
  for(const t of [.24,.41,.58,.72])rod(airship,envPoint(t,s*1.91),[(t-.5)*6.35,-3.79,s*.64],.038,.026,'rope',5);
  tube(airship,[[-3.96,-1.3,s*1.28],[-2.70,-2.61,s*1.06],[0,-3.37,s*.87],[2.95,-2.52,s*1.09],[4.22,-1.25,s*1.10]],.034,'rope',23,5);
}
const keel=group(airship,0,-4.10,0);
const hullProfile=[[-3.60,.32],[-3.46,-.17],[-2.75,-.63],[-1.66,-.85],[1.81,-.85],[2.95,-.48],[3.32,.14],[2.84,.42],[-2.83,.42]];
extrude(keel,hullProfile,1.20,'walnut');box(keel,-.03,.22,0,6.35,.23,1.32,'brass');
box(keel,-.06,.59,0,4.51,.71,1.23,'copper');roof(keel,-.05,.98,0,4.93,1.67,.42,'seagreen');
for(const s of [-1,1]){
  balustrade(keel,[-3.12,.35,s*.63],[-2.16,.41,s*.63],.32,'iron',.29);
  tube(keel,[[-3.46,-.05,s*.60],[-2.73,-.39,s*.629],[.42,-.57,s*.629],[2.56,-.37,s*.629],[3.18,-.07,s*.60]],.052,'brass',21,5);
}
lamp(keel,-2.76,.39,0,.76);
for(let i=0;i<6;i++)for(const s of [-1,1]){const g=group(keel,-1.85+i*.73,.61,s*.63,s>0?0:PI);orb(g,0,0,0,.184,.178,.03,'amber',12);torus(g,0,0,.033,.193,.045,'brass',false,14);}
for(let j=0;j<2;j++){
  const f=group(airship,4.45,0,0);f.rotation.x=j===0?0:PI/2;
  for(const s of [-1,1]){
    const fin=extrude(f,[[0,s*.74],[.76,s*1.07],[2.31,s*2.20],[2.81,s*2.13],[2.03,s*.35],[.38,s*.15]],.12,'seagreen');
    rod(f,[.82,s*1.07,.082],[2.54,s*2.10,.082],.054,.045,'gold',6);
  }
}
for(const s of [-1,1]){
  const engine=group(keel,1.22,-.20,s*.91);
  orb(engine,0,0,0,.75,.31,.29,'brass',14);
  const prop=group(engine,.75,0,0);for(let j=0;j<3;j++){const q=group(prop);q.rotation.x=j*TAU/3;orb(q,0,.37,.061,.066,.42,.112,'walnut',9);}
  moving(prop,t=>{prop.rotation.x=t*5.8+s;});
}
moving(airship,t=>{airship.position.y=9.34+.23*sin(t*.41);airship.rotation.z=.029*sin(t*.39+.4);airship.rotation.y=-.28+.035*sin(t*.21);});
const tether=tube(port,[[-4.13,5.32,-.82],[-5.49,5.10,-.39],[-7.23,5.71,.29],[-8.34,6.52,.78]],.043,'rope',17,6);
const tug=group(port);port.remove(tether);tug.add(tether);moving(tug,t=>{tug.scale.y=1.+.021*sin(t*.41);});
pedestrian(docks,.19,.10,.11,.59,-.56,'indigo');

// A low monastery wraps around a well. Dry-stone terraces carry the vines.
const cloister=group(abbey,-.82,.11,-.52,-.27);yard(cloister,0,0,0,6.7,5.4);
for(const [x,z,n,span,ry] of [[0,2.06,5,1.11,0],[0,-2.06,5,1.11,PI],[-2.76,0,4,1.03,-PI/2],[2.76,0,4,1.03,PI/2]]){
  const a=arcade(cloister,x,.19,z,n,span,1.58,.54,ry);roof(a,0,1.64,0,n*span+.36,1.19,.45,'tile2');
}
cyl(cloister,0,.51,0,.68,.68,.64,'ashlar',14);cyl(cloister,0,.82,0,.50,.50,.024,'deep',14);
torus(cloister,0,.85,0,.60,.103,'trim',true,16);
for(const s of [-1,1])cyl(cloister,s*.54,1.27,0,.073,.073,.91,'walnut',8);
roof(cloister,0,1.74,0,1.53,1.04,.47,'copper');
const chapel=group(abbey,-.40,.12,-2.86,-.27);
box(chapel,0,1.68,0,3.12,3.36,4.27,'chalk');roof(chapel,0,3.39,0,4.69,3.59,1.45,'seagreen',false).rotation.y=PI/2;
extrude(chapel,[[-1.77,0],[0,1.62],[1.77,0]],.25,'ashlar',0,3.30,2.25);
for(const s of [-1,1])rod(chapel,[s*1.83,3.30,2.39],[0,4.97,2.39],.076,.066,'bone',7);
finial(chapel,0,4.93,2.27,.55);sunEmblem(chapel,0,3.94,2.391,.32,'gold');
door(chapel,0,.11,2.153,.94,1.93,'walnut',true);rose(chapel,0,2.85,2.18,.562);
for(const s of [-1,1]){const b=group(chapel,s*1.583,0,0,s*PI/2);for(let j=-1;j<=1;j++)windowArch(b,j*1.17,.90,0,.58,1.50,true,true);}
bellTower(abbey,-3.60,.10,-2.03,1.27,6.48,false,true);
for(let j=0;j<3;j++){
  const width=6.63-j*.91,z=2.72+j*1.05,y=.39-j*.31,shift=.64+j*.44;
  box(abbey,shift,y-.37,z,width,.76,1.23,'aged');box(abbey,shift,y+.034,z,width-.12,.10,1.11,'moss');
  for(let i=0;i<6-j;i++){const x=shift-width*.42+i*width*.84/(5-j);cyl(abbey,x,y+.48,z,.052,.049,.96,'wood',7);shrub(abbey,x+.11,y+.30,z,.37);}
  for(const h of [.38,.69])rod(abbey,[shift-width*.45,y+h,z],[shift+width*.45,y+h,z],.027,.027,'rope',5);
}
house(abbey,4.76,.07,1.03,1.59,1.57,2.03,.63,{roof:'tile',chimney:false});
// Gnarled cordons carry fruit below the wires on the sunny side of each row.
surface('grape',0x514361,'plain',.76,.035);
const vineyardSeed=seed;
for(let row=0;row<3;row++){
  const width=6.63-row*.91,z=2.72+row*1.05,y=.39-row*.31,centre=.64+row*.44;
  for(let vine=0;vine<5-row;vine++){
    const x=centre+width*.84*((vine+.5)/(5-row)-.5);
    tube(abbey,[[x-.13,y+.07,z],[x-.04,y+.34,z+.04],[x-.08,y+.55,z],[x+.16,y+.63,z],[x+.40,y+.67,z-.02]],.043,'bark',10,5);
    for(const side of [-1,1]){
      const xx=x+side*.25,yy=y+.59;
      rod(abbey,[x,y+.62,z],[xx,yy,z+.13],.028,.019,'bark',5);
      const leaves=mesh(abbey,sprays('bush',(vine+row)%5),'oliveLeaves',xx,yy-.06,z);
      leaves.scale.set(.31,.245,.22);
      for(let k=0;k<10;k++){
        const a=k*2.40,r=.066*(1-k/13);
        orb(abbey,xx+r*cos(a),yy-.042-k*.015,z+.174+r*sin(a),.044,.052,.044,'grape',7);
      }
    }
  }
}
const press=group(abbey,4.54,.10,2.26,.22);
cyl(press,0,.19,0,.51,.53,.38,'wood',14);
for(const h of [.12,.31])torus(press,0,h,0,.52,.032,'iron',true,16);
for(const s of [-1,1])box(press,s*.49,.68,0,.14,1.34,.17,'walnut');
box(press,0,1.34,0,1.19,.19,.23,'walnut');
cyl(press,0,.88,0,.091,.091,.88,'walnut',10);
cyl(press,0,.48,0,.46,.46,.14,'plank',16);
for(let i=0;i<8;i++)torus(press,0,.65+i*.074,0,.095,.016,'brass',true,12);
rod(press,[-.40,1.49,0],[.40,1.49,0],.042,.042,'wood',7);
keg(abbey,5.46,.09,2.12,.255);basket(abbey,4.22,.11,2.83,.23);
seed=vineyardSeed;
for(const [x,z,h] of [[-4.73,1.78,3.44],[-5.30,.21,2.89],[3.80,-2.11,3.06],[3.89,-3.25,2.66]])tree(abbey,x,.05,z,h);

// Two oak rims flank the bucket wheel. Its lower race supplies the paddles,
// and a timber collector takes the high-side discharge into the head tank.
const wheelBase=group(mill,-.58,.10,.46,.04);
cistern(mill,1.08,1.89,-.89,2.36,.04,[[1.20,1.18],[0,.74]]);house(mill,-2.76,.07,-1.20,2.70,2.42,3.06,-.12,{roof:'tile2',chimney:false});
const wheel=group(wheelBase,0,3.08,1.75);
for(const side of [-1,1]){
  torus(wheel,0,0,side*.43,2.76,.16,'walnut',false,42);
  torus(wheel,0,0,side*.45,2.47,.12,'wood',false,42);
  for(let j=0;j<16;j++){
    const a=j*TAU/16;timber(wheel,[cos(a)*.26,sin(a)*.26,side*.43],[cos(a)*2.70,sin(a)*2.70,side*.43],.12,.145,'wood');
    orb(wheel,cos(a)*2.69,sin(a)*2.69,side*.562,.085,.085,.040,'brass',8);
  }
}
for(let j=0;j<24;j++){
  const a=j*TAU/24,pad=group(wheel,2.77*cos(a),2.77*sin(a),0);pad.rotation.z=a-.24;
  box(pad,0,0,0,.51,.099,1.18,'plank');box(pad,.20,.105,0,.086,.21,1.18,'wood');
  box(pad,-.01,.068,0,.32,.021,1.0,'water');
}
rod(wheelBase,[0,3.08,-.01],[0,3.08,2.87],.25,.25,'iron',12);
for(const z of [.94,2.60])for(const s of [-1,1])timber(wheelBase,[s*.97,.09,z],[s*.17,3.06,z],.23,.24,'walnut');
moving(wheel,t=>{wheel.rotation.z=-t*.28;});
const millTail=group(mill,-.46,.07,2.30,.04);
box(millTail,0,.09,0,3.15,.19,1.84,'aged');
box(millTail,0,.195,0,2.91,.047,1.62,'water');
for(const side of [-1,1])box(millTail,0,.24,side*.87,3.17,.29,.17,'sand');
function oakFlume(a,b,width){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz);
  const race=group(mill,(a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5,Math.atan2(dx,dz));
  race.rotation.order='YXZ';race.rotation.x=-Math.atan2(dy,Math.hypot(dx,dz));
  box(race,0,-.09,0,width+.16,.18,length+.05,'plank');
  box(race,0,.015,0,width,.059,length+.06,'water');
  for(const s of [-1,1])box(race,s*(width*.5+.048),.081,0,.10,.27,length+.07,'walnut');
}
oakFlume([1.26,4.62,2.17],[2.52,4.38,1.73],.61);
oakFlume([2.52,4.38,1.73],[2.61,4.04,.38],.61);
for(const zz of [.44,1.72]){
  for(const side of [-1,1])timber(mill,[2.56+side*.38,.12,zz],[2.56+side*.38,zz<1?3.91:4.26,zz],.121,.143,'walnut');
}
timber(mill,[2.94,1.66,.43],[2.94,4.16,1.70],.111,.095,'wood');
cascade(islands[2].x+2.61,islands[2].y+4.09,islands[2].z+.36,.58,2.18,PI,.61);
// The descending buckets empty at the lip of the collector.
const wheelDrops=[];
for(let i=0;i<14;i++){const drop=orb(waterFx,0,0,0,.054,.115,.054,'jewel',6);wheelDrops.push(drop);}
ticking.push(t=>{wheelDrops.forEach((d,j)=>{const f=(t*1.4+j/14)%1;d.position.set(islands[2].x+1.10+f*.53,islands[2].y+5.40-f*f*.75,islands[2].z+2.18+sin(j*2.91)*.25);});});
cascade(islands[2].x+1.07,islands[2].y+1.9,islands[2].z+1.33,.68,2.66,.11,.44);
const millOutlet=[3.73,1.84,.14];
trough(mill,poolRim([1.08,1.89,-.89],2.36,millOutlet),millOutlet,1.01,.42);
sluice(mill,3.47,1.86,.047,1.01,1.20);
for(const [x,z] of [[-4.15,-1.99],[3.83,-2.29]])tree(mill,x,.07,z,2.21);

// Clock house and its freestanding, four-sided astronomical dial.
const belfort=group(clockIsle,.73,.10,-.89,-.20);
belfort.scale.setScalar(.81);
for(let i=0;i<4;i++)box(belfort,0,.105+i*.18,0,4.45-i*.28,.205,4.39-i*.28,'road');
bellTower(belfort,0,.73,0,2.74,14.59,true,true,true);
const vane=group(belfort,0,16.13,0,-.38);
rod(vane,[-.77,0,0],[.81,0,0],.044,.044,'gold',7);
extrude(vane,[[.63,-.19],[1.06,0],[.63,.20]],.08,'gold');
const gatehouse=group(clockIsle,-2.01,.09,2.21,-.91);
archWall(gatehouse,0,0,0,2.18,2.21,1.27,1.27,.92,.85,'ashlar',true);roof(gatehouse,0,2.20,0,2.57,1.62,.73,'copper2');
for(let i=0;i<5;i++){const a=-1.1+i*.55;tree(clockIsle,3.92*sin(a),.09,-3.39*cos(a),rand(2.19,3.15));}
lamp(clockIsle,1.83,.12,2.61,1.61);tree(clockIsle,2.98,.04,.84,2.73,'olive');

// An interrupted pediment, fallen drums and a timber restoration scaffold.
const ruin=group(ruins,.07,.03,-.18,-.34);
for(let i=0;i<3;i++)box(ruin,0,.14+i*.25,0,6.18-i*.31,.26,5.29-i*.34,'aged');
for(const s of [-1,1])for(let j=0;j<4;j++){
  const x=(j-1.5)*1.50,z=s*1.79;
  if((s>0&&j===1)||(s<0&&j===3)){
    cyl(ruin,x,1.30,z,.32,.29,1.24,'aged',12);const cap=rockChip(ruin,x,1.93,z,.301,.23,.282);continue;
  }
  column(ruin,x,.75,z,.288,3.66,'aged',true);
}
for(const s of [-1,1])column(ruin,s*2.25,.75,0,.288,3.66,'aged',true);
box(ruin,-.81,4.54,-1.79,3.96,.41,.82,'sand');box(ruin,-.81,4.83,-1.79,4.15,.18,.94,'ivory');
box(ruin,1.52,4.60,1.79,2.34,.45,.79,'aged');box(ruin,1.58,4.89,1.79,2.50,.14,.92,'trim');
extrude(ruin,[[.37,0],[2.87,0],[.22,1.26],[.40,.87],[.21,.60],[.43,.47]],.72,'aged',0,4.97,1.79);
rod(ruin,[.23,6.24,2.18],[2.91,4.97,2.18],.106,.106,'trim',7);
extrude(ruin,[[-2.72,0],[1.18,0],[.88,.27],[1.05,.51],[.12,1.15],[-.05,1.33]],.75,'sand',0,4.93,-1.79);
for(let j=0;j<10;j++){
  const x=rand(-2.75,2.74),z=rand(-1.20,2.83);
  const o=cyl(ruin,x,.91+rand(.04,.20),z,rand(.22,.37),rand(.22,.38),rand(.33,.73),'aged',12);o.rotation.set(rand(.68,1.38),rand(0,TAU),rand(.1,1.1));
}
const fallen=group(ruin,-1.91,.98,2.45,-.68);fallen.rotation.z=-1.32;column(fallen,0,0,0,.26,2.30,'sand',true);
const scaffold=group(ruin,2.91,.24,-.21);
for(const x of [-.48,.48])for(const z of [-1.77,0,1.77])cyl(scaffold,x,2.34,z,.059,.053,4.68,'wood',7);
for(const y of [1.53,3.10,4.21]){
  for(const x of [-.47,.47]){box(scaffold,x,y,0,.109,.12,3.79,'walnut');timber(scaffold,[x,y-.02,-1.75],[x,y+1.30,.00],.085,.08,'wood');}
  for(let j=0;j<4;j++)box(scaffold,-.40+j*.266,y+.09,0,.246,.091,3.65,'plank');
}
timber(scaffold,[-.63,4.56,.49],[1.38,4.72,.49],.145,.14,'walnut');rod(scaffold,[1.22,4.72,.49],[1.22,2.37,.49],.028,.028,'rope',6);
box(scaffold,1.22,2.12,.49,.62,.49,.53,'aged');
for(const side of [-1,1])tube(scaffold,[[1.22,2.65,.49],[1.22+side*.333,2.38,.49],[1.22+side*.333,1.866,.49],[1.22,1.84,.49]],.022,'rope',9,5);
torus(scaffold,1.22,4.63,.49,.132,.039,'brass',false,14);
box(scaffold,-.06,3.40,-1.22,.41,.115,.20,'walnut',.23);
rod(scaffold,[-.04,3.37,-1.20],[.36,3.29,-.91],.038,.027,'wood',6);
for(let j=0;j<3;j++)rod(scaffold,[-.30+j*.10,4.378,-.78],[-.19+j*.10,4.369,-.43],.025,.013,'iron',6);
const ladderBay=group(scaffold,.55,.03,-1.24);
ladderBay.rotation.x=.15;
for(const s of [-1,1])box(ladderBay,0,2.12,s*.235,.075,4.24,.079,'walnut');
for(let i=0;i<15;i++)box(ladderBay,0,.22+i*.278,0,.064,.062,.462,'wood');
for(let i=0;i<4;i++)ivy(ruin,-2.12+i*.20,4.45,-1.31,rand(1.35,3.23),.30,.03);
tree(ruins,-3.70,.05,-1.24,2.88,'olive');tree(ruins,2.23,.04,2.20,1.48,'olive');
for(let i=0;i<12;i++)shrub(ruins,rand(-3.9,3.79),.05,rand(-2.7,2.92),rand(.24,.56));

// Pale limestone and terracotta courses below the glass lantern.
const pharos=group(lighthouse,.59,.08,-.79,.14);
cyl(pharos,0,.26,0,1.69,1.62,.52,'sand',24);
for(let j=0;j<9;j++){
  const r=1.29-j*.064,rb=r-.064;
  cyl(pharos,0,.52+(j+.5)*1.018,0,r,rb,1.018,j===1||j===4||j===7?'tile2':'chalk',24);
  if(j%2===0){const w=radial(pharos,r-.029,(j%3-1)*.75,.52+j*1.018);windowArch(w,0,.17,.02,.28,.57,true);}
}
door(pharos,0,.55,1.255,.67,1.46,'walnut',true);
cyl(pharos,0,9.81,0,.84,1.38,.39,'sand',24);cyl(pharos,0,10.08,0,1.49,1.49,.19,'ivory',24);
for(let j=0;j<16;j++){
  const a=j*TAU/16,c=(j+1)*TAU/16;
  rod(pharos,[1.38*sin(a),10.16,1.38*cos(a)],[1.38*sin(a),10.77,1.38*cos(a)],.041,.037,'iron',6);
  rod(pharos,[1.38*sin(a),10.75,1.38*cos(a)],[1.38*sin(c),10.75,1.38*cos(c)],.037,.037,'brass',6);
}
for(let j=0;j<8;j++){const a=j*TAU/8;column(pharos,.89*sin(a),10.19,.89*cos(a),.082,1.83,'brass');}
const panes=new T.MeshPhysicalMaterial({color:0xadcfbd,transparent:true,opacity:.20,roughness:.10,metalness:.12,side:T.DoubleSide,depthWrite:false});
cyl(pharos,0,11.07,0,.91,.91,1.75,panes,8);
orb(pharos,0,11.06,0,.49,.66,.49,'amber',16);aura(pharos,0,11.08,.16,4.46,0xffcc79,.77,true);
for(let j=0;j<4;j++)torus(pharos,0,10.64+j*.24,0,.51,.039,'gold',true,24);
dome(pharos,0,12.07,0,1.15,.92,'copper',false,false);finial(pharos,0,13.06,0,.63);
const beam=group(pharos,0,11.12,0),beamMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,blending:T.AdditiveBlending,
  vertexShader:`varying vec3 local,eye,normalV;void main(){local=position;
    vec4 view=modelViewMatrix*vec4(position,1.);eye=-view.xyz;normalV=normalMatrix*normal;
    gl_Position=projectionMatrix*view;}`,
  fragmentShader:`varying vec3 local,eye,normalV;void main(){
    float edge=abs(dot(normalize(eye),normalize(normalV)));
    float falloff=1.-smoothstep(1.,62.,local.z);
    gl_FragColor=vec4(1.26,.93,.43,.128*edge*falloff);}`});
const beamGeo=new T.ConeGeometry(3.90,62,40,1,true);beamGeo.rotateX(-PI/2);beamGeo.translate(0,0,31);
const beamObj=new T.Mesh(beamGeo,beamMaterial);beam.add(beamObj);
moving(beam,t=>{beam.rotation.order='YXZ';beam.rotation.x=.405;beam.rotation.y=-1.13+t*.18;});
house(lighthouse,-1.90,.07,.46,2.46,1.83,2.28,-.28,{roof:'tile',hip:false});
const ladder=group(lighthouse,-1.75,.10,1.60,-.20);ladder.rotation.x=-.29;
for(const s of [-1,1])box(ladder,s*.237,1.14,0,.072,2.28,.081,'wood');
for(let i=0;i<9;i++)box(ladder,0,.23+i*.24,0,.45,.058,.062,'walnut');
for(const x of [-2.93,-.08])cyl(lighthouse,x,.91,2.15,.047,.043,1.82,'walnut',7);
tube(lighthouse,[[-2.93,1.69,2.15],[-1.54,1.44,2.15],[-.08,1.69,2.15]],.024,'rope',12,5);
for(let i=0;i<4;i++){const c=box(lighthouse,-2.49+i*.54,1.20,2.15,.34,.61,.033,i===3?'indigo':'linen');c.rotation.z=rand(-.12,.12);}
tree(lighthouse,-2.55,.02,-1.56,2.57);shrub(lighthouse,2.63,.06,.52,.61);
