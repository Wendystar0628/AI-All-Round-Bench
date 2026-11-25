'use strict';

const routes=group(atlas);
function spanFrame(p,a,b){
  return group(p,(a[0]+b[0])/2,a[1],(a[2]+b[2])/2,-Math.atan2(b[2]-a[2],b[0]-a[0]));
}
function landing(p,x,y,z,az,scale=1) {
  const g=group(p,x,y,z,az);g.scale.setScalar(scale);
  archWall(g,0,.01,0,2.11,2.05,1.07,1.36,.91,.83,'chalk');
  for(const s of [-1,1]){archBand(g,0,.01,s*.57,.68,.91,.83,.094,.15,'trim');column(g,s*.91,.01,.53,.108,1.88,'ivory');}
  box(g,0,2.087,0,2.30,.155,1.33,'trim');cyl(g,0,2.27,0,.72,.70,.26,'chalk',12);
  dome(g,0,2.40,0,.79,.56,'copper2',false,false);finial(g,0,2.99,0,.30);
  return g;
}
function stonePier(p,x,y,z,width,depth,drop,old=false) {
  const mat=old?'aged':'ashlar',g=group(p,x,y,z);
  box(g,0,-drop*.43,0,width,drop*.86,depth,mat);
  box(g,0,-.115,0,width*1.19,.22,depth*1.11,'trim');
  box(g,0,-drop*.83,0,width*1.13,.17,depth*1.069,old?'aged':'sand');
  const taper=cyl(g,0,-drop*1.10,0,.11,width*.70,drop*.55,mat,4,PI/4);
  taper.scale.z*=depth/width;
}
function bay(p,a,b,width,opts={}) {
  const len=Math.hypot(b[0]-a[0],b[2]-a[2]),dy=b[1]-a[1],q=spanFrame(p,a,b),half=len/2;
  const rise=opts.rise??len*.34,rr=half*(opts.single?.948:.91),floorAt=x=>(x/len+.5)*dy;
  const sill=opts.thick||.29,base=-sill-rise,mat=opts.old?'aged':'ashlar';
  const outer=[[-half,0],[half,dy],[half,dy+base-.05],[rr,floorAt(rr)+base-.05]];
  for(let j=0;j<=20;j++){const t=j/20,x=rr*cos(t*PI);outer.push([x,base+floorAt(x)+rise*sin(t*PI)]);}
  outer.push([-half,base-.05]);
  extrude(q,outer,width,mat);
  // Separate dressed voussoirs cast narrow shadows around the intrados.
  const stones=opts.single?31:opts.high?13:9;
  for(let i=0;i<stones;i++){
    const aa=i/stones*PI+.009,bb=(i+1)/stones*PI-.009,ringThick=(opts.single?.31:.15)*(i===(stones>>1)?1.33:1);
    const point=(ang,offset)=>{const x=(rr+offset)*cos(ang);return [x,base+floorAt(x)+(rise+offset)*sin(ang)];};
    const pts=[point(aa,0),point(bb,0),point(bb,ringThick),point(aa,ringThick)];
    extrude(q,pts,width+.09+(i%2)*.021,i%3===0?'trim':opts.old?'aged':'chalk');
  }
  const deck=(y,thick,ww,m)=>extrude(q,[[-half-.01,y],[half+.01,dy+y],[half+.01,dy+y-thick],[-half-.01,y-thick]],ww,m);
  deck(.115,.155,width+.169,'road');deck(-.132,.091,width+.128,'trim');
  if(Math.abs(dy)/len>.23){
    const steps=Math.ceil(Math.abs(dy)/.205);
    for(let j=0;j<steps;j++){
      const xa=-half+len*j/steps,xb=-half+len*(j+1)/steps,top=Math.max(floorAt(xa),floorAt(xb))+.172;
      extrude(q,[[xa,top],[xb,top],[xb,floorAt(xb)+.09],[xa,floorAt(xa)+.09]],width+.16,'road');
    }
  }
  if(opts.rail!==false)for(const s of [-1,1]){
    const z=s*(width/2+.024);
    if(s===opts.balcony){
      const mouth=Math.min(.84,half*.56),railH=opts.high?.73:.53;
      balustrade(q,[-half,.115,z],[-mouth,floorAt(-mouth)+.115,z],railH,'stone',.82);
      balustrade(q,[mouth,floorAt(mouth)+.115,z],[half,dy+.115,z],railH,'stone',.82);
      const plan=[[-mouth,-.095],[mouth,-.095],[mouth,.64],[mouth*.60,1.14],[-mouth*.60,1.14],[-mouth,.64]];
      const floor=extrude(q,plan.map(([x,d])=>[x,-s*d]),.29,'road',0,dy*.5-.02,z);
      floor.rotation.x=-PI/2;
      for(let j=1;j<plan.length;j++){
        const u=plan[j],v=plan[(j+1)%plan.length];
        balustrade(q,[u[0],dy*.5+.125,z+s*u[1]],[v[0],dy*.5+.125,z+s*v[1]],railH,'iron',.47);
      }
      for(const x of [-mouth*.55,mouth*.55])timber(q,[x,dy*.5-.17,z+s*.91],[x,dy*.5-1.15,z-s*.46],.22,.23,'sand');
      lamp(q,-mouth*.57,dy*.5+.14,z+s*1.09,opts.high?1.41:1.1);
      continue;
    }
    if(opts.damaged&&s===1){balustrade(q,[-half,.115,z],[-half+len*.35,dy*.35+.115,z],.50,'stone',.89);continue;}
    balustrade(q,[-half,.115,z],[half,dy+.115,z],width>1.8?.73:.53,'stone',width>1.8?.82:1.13);
  }
  if(opts.pier!==false)stonePier(q,-half,base+.09,0,opts.single?.90:.42,width*1.04,opts.stem??1.18,opts.old);
  if(opts.lamp)lamp(q,-half,.118,-width*.50,opts.high?1.59:1.08);
  return q;
}
function interp3(a,b,t){return a.map((v,j)=>mix(v,b[j],t));}
function islandEdge(a,dx,dz,amount=1){
  const len=Math.sqrt(dx*dx/(a.rx*a.rx)+dz*dz/(a.rz*a.rz));
  return [a.x+dx/len*amount,a.y+.23,a.z+dz/len*amount];
}
const termini=islands.map(()=>[]);
for(let k=0;k<6;k++){
  const a=islands[k],b=islands[(k+1)%6];
  const cx=k===1?-50.4:(a.x+b.x)*.56,cz=k===1?-54.9:k===5?53.8:(a.z+b.z)*.57;
  const A=islandEdge(a,cx-a.x,cz-a.z,.92),B=islandEdge(b,cx-b.x,cz-b.z,.92);
  const C=[cx,0,cz],distance=Math.hypot(B[0]-A[0],B[2]-A[2]);
  const lengthEstimate=.5*(distance+Math.hypot(A[0]-cx,A[2]-cz)+Math.hypot(B[0]-cx,B[2]-cz));
  const n=Math.max(3,Math.round(lengthEstimate/4.61));
  const curve=t=>{const u=1-t;return [u*u*A[0]+2*u*t*C[0]+t*t*B[0],mix(A[1],B[1],t*t*(3-2*t))-(k===5?4.85*sin(PI*t)**2:0),u*u*A[2]+2*u*t*C[2]+t*t*B[2]];};
  const azStart=Math.atan2(C[0]-A[0],C[2]-A[2]),azEnd=Math.atan2(B[0]-C[0],B[2]-C[2]);
  landing(routes,...A,azStart,.84);landing(routes,...B,azEnd,.84);
  termini[k].push(A);termini[(k+1)%6].push(B);
  for(let j=0;j<n;j++){
    const aa=curve(j/n),bb=curve((j+1)/n);
    const belvedere=(k===5&&j===Math.floor(n*.57))||(k===1&&j===2);
    const q=bay(routes,aa,bb,1.24,{stem:1.12+j%2*.30,lamp:j%2===0,old:k===4&&j<3,damaged:k===4&&j===1,balcony:belvedere?1:0});
    if(k===4&&j===1){
      const len=Math.hypot(bb[0]-aa[0],bb[2]-aa[2]);
      for(let k=0;k<4;k++){
        const f=.20+k*.152,x=(f-.5)*len;
        const stone=box(q,x,(bb[1]-aa[1])*f+.149,.21+.039*(k%2),.51,.08,.45,'aged',.025*(k-1.5));
        stone.rotation.z=Math.atan2(bb[1]-aa[1],len)+.038*cos(k);
      }
    }
  }
}
// Within each island the promenade skirts its central building.
function flatLane(p,a,b,w) {
  const q=spanFrame(p,a,b),len=Math.hypot(b[0]-a[0],b[2]-a[2]);
  box(q,0,.009,0,len+.17,.12,w,'road');
  for(const s of [-1,1])box(q,0,.049,s*w*.47,len+.15,.075,w*.075,'trim');
}
for(let j=0;j<6;j++){
  const a=islands[j],u=termini[j][0],v=termini[j][1],r=Math.hypot(a.x,a.z);
  const control=[a.x+a.rx*.74*a.x/r,a.y+.19,a.z+a.rz*.72*a.z/r];
  flatLane(routes,u,control,1.12);flatLane(routes,control,v,1.12);
}
function spoke(a){
  const r=Math.hypot(a.x,a.z);return {outer:islandEdge(a,-a.x,-a.z,.83),inner:[a.x/r*22.04,2.85,a.z/r*22.04],angle:Math.atan2(a.x,a.z)};
}
// The two-tier western viaduct carries a broad street over a lighter lower arcade.
{
  const {outer:A,inner:B,angle}=spoke(islands[0]),n=6;
  for(let i=0;i<n;i++)bay(routes,interp3(A,B,i/n),interp3(A,B,(i+1)/n),2.08,{high:true,stem:1.61,rise:1.28,lamp:i%2===0,balcony:i===1?1:i===4?-1:0});
  const A2=A.slice(),B2=B.slice();A2[1]-=3.0;B2[1]-=3.0;
  for(let j=0;j<3;j++){
    const u=interp3(A2,B2,j/3),v=interp3(A2,B2,(j+1)/3);
    bay(routes,u,v,1.59,{rise:2.33,rail:false,stem:2.13,thick:.39});
  }
  landing(routes,...B,angle,1.05);
}
{
  const {outer,inner,angle}=spoke(islands[1]);
  bay(routes,outer,inner,1.46,{single:true,rise:5.66,thick:.45,stem:1.49});
  landing(routes,...inner,angle,.98);
}
// The mill leat slopes gently all the way to the raised city cistern.
{
  const A=[islands[2].x+millOutlet[0],islands[2].y+millOutlet[1],islands[2].z+millOutlet[2]];
  const B=poolRim(cityPoint(...headBasin),headRadius,A);
  const n=8;
  for(let i=0;i<n;i++){
    const u=interp3(A,B,i/n),v=interp3(A,B,(i+1)/n),ua=u.slice(),va=v.slice();ua[1]-=.51;va[1]-=.51;
    const q=bay(routes,ua,va,1.39,{rise:1.70,stem:2.80+(i%2)*.88,rail:false});
    trough(routes,u,v,1.08,.42);
    if(i%3===1){box(q,0,.24,1.05,1.80,.24,.86,'wood');balustrade(q,[-.89,.37,1.44],[.89,.37,1.44],.53,'wood',.67);}
  }
}
{
  const {outer:A,inner:B,angle}=spoke(islands[3]),len=Math.hypot(B[0]-A[0],B[2]-A[2]),q=spanFrame(routes,A,B),dy=B[1]-A[1];
  const Y=t=>dy*t-.43*sin(PI*t),X=t=>(t-.5)*len,w=1.38;
  const n=Math.ceil(len/.32);
  for(let i=0;i<n;i++){const t=(i+.5)/n;box(q,X(t),Y(t),0,len/n-.018,.133,1.47,i%4?'plank':'wood');}
  for(const s of [-1,1]){
    const z=s*w*.54,points=[],ropeRail=[];
    for(let j=0;j<=24;j++){const t=j/24;points.push([X(t),dy*t+4.50-3.18*4*t*(1-t),z]);ropeRail.push([X(t),Y(t)+.68,z]);}
    tube(q,points,.074,'iron',48,7);tube(q,ropeRail,.039,'rope',38,6);
    tube(q,ropeRail.map(v=>[v[0],v[1]-.35,v[2]]),.023,'rope',38,5);
    for(let j=0;j<=18;j++){
      const t=j/18;rod(q,[X(t),Y(t)-.12,z],[X(t),dy*t+4.50-3.18*4*t*(1-t),z],.032,.032,'iron',6);
    }
    for(let j=0;j<35;j++){const t=j/35,tt=(j+1)/35;rod(q,[X(t),Y(t)+.16,z],[X(tt),Y(tt)+.63,z],.018,.018,'rope',4);}
  }
  for(const t of [0,1]){
    const q2=group(q,X(t),dy*t,0,PI/2);
    archWall(q2,0,0,0,2.66,4.41,.69,1.55,2.12,1.48,'ashlar',true);
    archBand(q2,0,0,.38,.775,2.12,1.48,.14,.17,'ivory',true);
    for(const s of [-1,1]){box(q2,s*1.13,2.10,0,.52,4.20,1.13,'chalk');pinnacle(q2,s*1.11,4.16,0,1.14,.24);}
    for(const s of [-1,1])rod(q,[X(t),dy*t+4.6,s*.84],[X(t)+(t?2.43:-2.43),dy*t+.19,s*1.13],.061,.061,'iron',7);
  }
}
{
  const {outer:A,inner:B,angle}=spoke(islands[4]);
  for(const [t1,t2] of [[0,.206],[.206,.38],[.65,.83],[.83,1]])bay(routes,interp3(A,B,t1),interp3(A,B,t2),1.63,{rise:1.40,old:true,damaged:t1===.206,stem:1.43});
  const u=interp3(A,B,.38),v=interp3(A,B,.65),q=spanFrame(routes,u,v),len=Math.hypot(u[0]-v[0],u[2]-v[2]),dy=v[1]-u[1];
  for(let j=0;j<16;j++){const t=j/15,k=box(q,(t-.5)*len,dy*t-.24*sin(PI*t),rand(-.09,.09),len/16*.91,.115,1.27+rand(-.13,.14),'wood');k.rotation.y=rand(-.075,.075);}
  for(const s of [-1,1]){
    tube(q,[[-len/2,.64,s*.70],[0,dy*.5+.24,s*.71],[len/2,dy+.69,s*.67]],.039,'rope',16,6);
    rod(q,[-len/2,-.17,s*.39],[len/2,dy-.17,s*.39],.105,.097,'walnut',7);
  }
  for(let j=0;j<6;j++){
    const xx=rand(-len*.39,len*.38),yy=dy*.5-rand(.9,3.47),zz=rand(-.44,.50);
    rockChip(q,xx,yy,zz,rand(.17,.59),rand(.17,.44),rand(.19,.51),j);
    if(j<3)tube(q,[[xx-.49,dy*.5-.3,zz],[xx-.27,yy+.45,zz+.04],[xx,yy+.10,zz]],.032,'rope',10,5);
  }
  landing(routes,...B,angle,.91);
}

// Outlying fragments and atmospheric silhouettes establish the scale of the sea.
const fragments=[[-27,-4,32,2.15],[-59.5,-.85,-13.5,2.39],[18,5,-43,2.61],[54,-9,29,1.78]];
for(let i=0;i<fragments.length;i++){
  const [x,y,z,r]=fragments[i],g=group(atlas,x,y,z);
  island(g,r,r*.81,r*2.24);if(i===2)landing(g,0,.03,0,.25,.69);else tree(g,-.14,.06,.07,r*1.29,i%2?'cypress':'olive');
  moving(g,t=>{g.position.y=y+.23*sin(t*.20+i*1.8);g.rotation.y=.047*sin(t*.19+i);});
}
for(let j=0;j<33;j++){
  let a=rand(0,TAU);
  const orbit=rand(16.4,29.1),yy=rand(-28.1,-5.7),bearing=Math.atan2(sin(a-cityYaw),cos(a-cityYaw));
  if(yy> -15.5&&Math.abs(bearing)<.43)a=cityYaw+(bearing<0?-1:1)*(.78+Math.abs(bearing));
  const fraction=-yy/31,r=Math.max(orbit,25.8*(1.-.2*fraction-.76*fraction**1.47)+2.);
  const xx=r*sin(a),zz=r*cos(a);
  const f=group(atlas,xx,yy,zz),s=rand(.18,.91);
  rockChip(f,0,0,0,s,s*rand(.76,1.83),s*.78,j);
  moving(f,t=>{f.position.y=yy+.29*sin(t*.29+j);f.rotation.y=t*(.036+.003*(j%7))+j;f.rotation.z=.11*sin(t*.22+j);});
}
for(const [x,y,z,r] of [[-127.1,16.5,-201,7.93],[134,17.7,-216,9.44],[-68,8.1,-228,4.97]]){
  const far=group(atlas,x,y,z);island(far,r,r*.67,r*2.07,false,true);
  for(let i=0;i<12;i++){const xx=rand(-r*.68,r*.68),zz=rand(-r*.39,r*.39);tree(far,xx,.03,zz,rand(2.01,3.66));}
  for(let j=0;j<5;j++){
    const a=(j-2)*.46+PI;
    rockChip(far,r*.55*sin(a),r*.028,r*.44*cos(a),r*.19,r*(.105+.075*cos(j)),r*.16,j);
  }
  if(r>7.5){bellTower(far,-r*.19,.15,-.21,1.26,5.66,false);house(far,1.01,.08,.06,3.32,2.26,2.73,-.41,{roof:'seagreen'});}
}
// Flocks are updated in a single small vertex buffer. Wing motion and the
// response to the bell are sampled from film time, just like the machinery.
{
  const specs=[],triCount=10;
  for(let j=0;j<31;j++)specs.push({flock:j<14?0:j<24?1:2,phase:rand(-.73,.76),rad:rand(-2.9,3.4),h:rand(-1.42,1.43),size:rand(.30,.55),offset:rand(0,TAU)});
  const points=new Float32Array(specs.length*triCount*9),cs=new Float32Array(points.length);
  const c1=new T.Color(0xf4e7cc),c2=new T.Color(0x464c47),c3=new T.Color(0x9b9784);
  for(let i=0;i<cs.length/3;i++){const k=Math.floor(i/3)%10;(k===2||k===5?c2:k>6?c3:c1).toArray(cs,i*3);}
  const geo=rawGeo(points,null,cs),o=mesh(scene,geo,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,fog:true}));
  o.frustumCulled=false;o.castShadow=false;o.receiveShadow=false;
  ticking.push(t=>{
    let id=0;
    specs.forEach((s,i)=>{
      const f=s.flock,r=(f===0?18.4:f===1?9.1:10.3)+s.rad,an=t*(f===1?.123:.086)+s.phase+(f===0?2.17:f===1?.41:3.47);
      const xx=(f===0?0:f===1?islands[3].x:islands[0].x)+r*cos(an),zz=(f===0?0:f===1?islands[3].z:islands[0].z)+r*.71*sin(an);
      const chime=t%46,flight=f===1&&chime>7&&chime<15?2.9*sin((chime-7)*PI/8):0;
      const yy=(f===0?23.8:f===1?11.4:7.9)+s.h+1.15*sin(an*1.30+s.offset*.21)+flight;
      const flap=sin(t*(4.1+i%4*.33)+s.offset)*.36+.12;
      const h=[0,0,.33],tail=[0,.04,-.69],body=[0,.16,.05];
      const tlist=[];
      for(const side of [-1,1]){const root=[side*.10,0,.09],w=[side*.68,flap+.17,.065],aft=[side*.57,flap+.10,-.29],tip=[side*1.25,flap*1.74-.12,-.42];tlist.push([root,w,aft],[root,aft,tail],[w,tip,aft]);}
      tlist.push([h,[.14,0,-.13],body],[h,body,[-.14,0,-.13]],[body,[.16,0,-.15],tail],[body,tail,[-.16,0,-.15]]);
      const ca=cos(-an),sa=sin(-an);
      for(const tri of tlist)for(const v of tri){const s2=s.size;points[id++]=xx+s2*(v[0]*ca+v[2]*sa);points[id++]=yy+s2*v[1];points[id++]=zz+s2*(v[2]*ca-v[0]*sa);}
    });
    geo.attributes.position.array.set(points);geo.attributes.position.needsUpdate=true;
  });
}
