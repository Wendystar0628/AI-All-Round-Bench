// A lacquered plinth and a continuous hand-speckled soil section.
const px=.46,pz=5.32,pr=2.27,waterY=.495,poolFloor=-.858,frontCut=7;
function tartFootprint(a,b,dx=0,dz=0){
  const center=[px+dx,pz+dz],raw=[center],n=Math.ceil((b-a)*40);
  for(let j=0;j<=n;j++){const t=a+(b-a)*j/n;raw.push([center[0]+pr*Math.cos(t),center[1]+pr*Math.sin(t)])}
  const result=[];
  for(let i=0;i<raw.length;i++){
    const A=raw[i],B=raw[(i+1)%raw.length];
    if(A[1]<=frontCut)result.push(A);
    if((A[1]<frontCut)!==(B[1]<frontCut)){
      const fraction=(frontCut-A[1])/(B[1]-A[1]);
      result.push([A[0]+(B[0]-A[0])*fraction,frontCut]);
    }
  }
  return result;
}
function footprintShape(points){
  const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();return shape;
}
const basinFoot=tartFootprint(.68,TAU+.09);
const frontEnds=basinFoot.filter(p=>p[1]===frontCut).sort((a,b)=>a[0]-b[0]);
const firstCut=basinFoot.indexOf(frontEnds[0]);
const basinArc=basinFoot.slice(firstCut).concat(basinFoot.slice(0,firstCut));
// Leave a narrow bedding joint between the soil and the watertight basin liner.
const excavatedArc=basinArc.map((pt,i)=>{
  let before=basinArc[Math.max(0,i-1)],after=basinArc[Math.min(basinArc.length-1,i+1)];
  let dx=after[0]-before[0],dz=after[1]-before[1],length=Math.hypot(dx,dz);
  return [pt[0]+.019*dz/length,pt[1]===frontCut?frontCut:pt[1]-.019*dx/length];
});
const landOutline=footprintShape([[-7,7],...excavatedArc,[7,7],[7,-7],[-7,-7]]);
const cutBank=new T.ExtrudeGeometry(landOutline,{depth:1.38,bevelEnabled:false,curveSegments:1});
let soilMass=mesh(cutBank,'#84705a',0,-1.31,0);soilMass.rotation.x=-Math.PI/2;
box(0,-1.52,0,14.16,.16,14.16,'#454748');box(0,-1.41,0,14.22,.07,14.22,'#ab8550');box(0,-1.32,0,14.12,.12,14.12,'#634c3b');box(.46,-1.235,0,3.3,.15,14,'#746454');
const soilTex=canvasTex(1400,172,(p,w,h)=>{let bands=['#798350','#9b8156','#8e694e','#a98160','#745f52','#7e7162','#585753'];p.fillStyle=bands[0];p.fillRect(0,0,w,h);for(let k=1;k<7;k++){p.fillStyle=bands[k];p.beginPath();p.moveTo(0,h);for(let x=0;x<=w;x+=3)p.lineTo(x,[0,10,31,55,96,122,153][k]+6*Math.sin(x*.014+k)+3*Math.sin(x*.057));p.lineTo(w,h);p.fill()}for(let i=0;i<9500;i++){let x=R(0,w),y=R(0,h),s=R(.4,y>101?5:2.2);p.fillStyle=pick(['#d9ca9760','#3f382e60','#b3947566']);p.beginPath();p.ellipse(x,y,s*1.6,s*.64,R(-.6,.6),0,TAU);p.fill()}for(let j=0;j<23;j++){let x=R(0,w),y=0;p.strokeStyle='#665137';p.lineWidth=R(.8,3);p.beginPath();p.moveTo(x,y);for(let i=0;i<10;i++){x+=R(-8,12);y+=R(3,12);p.lineTo(x,y)}p.stroke()}});for(let a=1;a<4;a++){let o=mesh(new T.PlaneGeometry(14,1.39),0,7.008*Math.sin(a*Math.PI/2),-.625,7.008*Math.cos(a*Math.PI/2),new T.MeshLambertMaterial({map:soilTex}));o.rotation.y=a*Math.PI/2}
function soilSection(left,right,low,high){
  const g=new T.PlaneGeometry(right-left,high-low),uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++){const x=left+uv.getX(i)*(right-left),y=low+uv.getY(i)*(high-low);uv.setXY(i,(x+7)/14,(y+1.32)/1.39)}
  mesh(g,0,(left+right)/2,(low+high)/2,7.008,new T.MeshLambertMaterial({map:soilTex}));
}
soilSection(-7,frontEnds[0][0],-1.32,.07);
soilSection(frontEnds[1][0],7,-1.32,.07);
soilSection(frontEnds[0][0],frontEnds[1][0],-1.32,-1.161);
const mossTex=canvasTex(1200,1200,(p,w,h)=>{p.fillStyle='#9bb58b';p.fillRect(0,0,w,h);
for(let j=0;j<48;j++){
  const x=(.5+.5*Math.sin(j*17.24))*w,y=(.5+.5*Math.sin(j*49.32+.5))*h;
  const wash=p.createRadialGradient(x,y,0,x,y,64+61*(1+Math.sin(j*2.3)));
  wash.addColorStop(0,['#6f946c60','#d7d3a04b','#72966b56'][j%3]);wash.addColorStop(1,'#a2ae7300');p.fillStyle=wash;p.fillRect(0,0,w,h);
}
for(let i=0;i<16000;i++){let s=R(.8,5.6);p.fillStyle=pick(['#657e503d','#f0dc9b3e','#8ca16b45','#c3c88455','#95995735']);p.beginPath();p.ellipse(R(0,w),R(0,h),s,s*.55,R(-2,2),0,TAU);p.fill()}});const turfGeometry=new T.ShapeGeometry(landOutline),turfUV=turfGeometry.attributes.uv;for(let i=0;i<turfUV.count;i++)turfUV.setXY(i,(turfGeometry.attributes.position.getX(i)+7)/14,(turfGeometry.attributes.position.getY(i)+7)/14);let ground=mesh(turfGeometry,0,0,.083,0,new T.MeshToonMaterial({map:mossTex,gradientMap:grad}));ground.rotation.x=-Math.PI/2;
sign(-4.1,-.665,7.024,4.36,.74,'秋 庭 観 星 画 室','#3e4940','#efcf91','A K I N I W A     /     A S T R O N O M I C A L   A T E L I E R');for(let x of [-6.18,-2.02])for(let y of [-.4,-1])ball(x,y,7.033,.027,.027,.012,gold);
function moss(x,z,r){rock(x,.105,z,r,R(.08,.19)*r,r*R(.55,.9),pick(['#848d50','#95a15e','#a2a864','#717f4d']))}
for(let i=0;i<35;i++){let z=R(3.23,5.28);moss(-5.93+R(-.09,.06),z,R(.06,.14))}
// A dry-stacked retaining wall with battered courses and chipped, beveled faces.
const wallBlocks = Array.from({length:9}, (_, k)=>{
  const d=i=>.5+.5*Math.sin(i*15.17+k*6.91);
  const outline=[[-.5,-.32-d(1)*.08],[-.38,-.48],[.10,-.49],[.41,-.45],[.495,-.30],[.47,.34],[.31,.47],[-.17,.49],[-.43,.41],[-.495,.22]];
  const shape=new T.Shape();
  outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));
  shape.closePath();
  const geom=new T.ExtrudeGeometry(shape,{depth:.68,bevelEnabled:true,bevelThickness:.13,bevelSize:.033,bevelSegments:1,curveSegments:1});
  geom.translate(0,0,-.34);return geom;
});
const wallStoneColors=['#858777','#929583','#9c9986','#8d9180','#a09c89','#7d8578','#a6a28b'];
function masonry(x,z,w,d,h){
  box(x,h*.5,z,w-.13,h,d-.13,'#646c61');
  for(let side=0;side<4;side++){
    const angle=side*Math.PI/2, nx=Math.sin(angle),nz=Math.cos(angle),tx=Math.cos(angle),tz=-Math.sin(angle);
    const length=side%2?d:w,halfDepth=(side%2?w:d)*.5;
    for(let row=0;row<5;row++){
      const hh=h/5,yy=(row+.5)*hh;
      let start=-length*.5;
      for(let k=0;start<length*.5-.012;k++){
        let width=hh*(1.46+.75*(.5+.5*Math.sin(k*6.74+row*1.57+side)));
        if(!k&&row%2)width*=.58;
        width=Math.min(width,length*.5-start);
        if(length*.5-start-width<hh*.51)width=length*.5-start;
        const center=start+width*.5,depth=halfDepth+.018-.012*row;
        obj(wallBlocks[(3*k+row+side)%9],x+tx*center+nx*depth,yy,z+tz*center+nz*depth,width*.967,hh*.94,.145,
            wallStoneColors[(k+3*row+side*2)%wallStoneColors.length],0,angle,Math.sin(k+row*2)*.026);
        if((k+row+side)%3===0){
          let along=center+width*.23,xx=x+tx*along+nx*(depth+.075),zz=z+tz*along+nz*(depth+.075);
          obj(rockG,xx,yy+hh*.3,zz,width*.13,.019,.045,'#858c65',0,angle);
        }
        start+=width;
      }
    }
  }
  box(x,h+.04,z,w+.08,.12,d+.08,'#999b72');
}
world=sites.upper;
masonry(3.35,-4.48,7.18,4.26,terraceY-.10);
// The return of the stone wall dies into a rounded, moss-covered bank.
{
  const pos=[],uv=[],faces=[],rows=24,cols=12;
  for(let j=0;j<=rows;j++){
    const u=j/rows,z=-6.60+4.19*u;
    const width=.13+1.81*Math.sin(Math.PI*u)**.69;
    for(let k=0;k<=cols;k++){
      const v=k/cols,x=-.19-width*v;
      const top=.105+(terraceY-.105)*(.91+.07*Math.sin(u*Math.PI))*Math.sin(Math.PI*u)**.35;
      const y=.088+(top-.088)*(1-v*v)**2;
      pos.push(x,y,z);uv.push((x+7)/14,(7-z)/14);
      if(k&&j){const n=j*(cols+1)+k;faces.push(n,n-cols-1,n-1,n-1,n-cols-1,n-cols-2)}
    }
  }
  const slope=new T.BufferGeometry();slope.setAttribute('position',new T.Float32BufferAttribute(pos,3));slope.setAttribute('uv',new T.Float32BufferAttribute(uv,2));slope.setIndex(faces);slope.computeVertexNormals();
  mesh(slope,0,0,0,0,new T.MeshToonMaterial({map:mossTex,gradientMap:grad,side:T.DoubleSide}));
}
world=gardenRoot;
function treadSurface(dx,dz){
  const wear=Math.exp(-dx*dx*2.1)*(.66+.34*Math.cos((dz-.095)*6.));
  return .084-.037*wear;
}
function tread(x,y,z,i){
  let vertices=[],indices=[];
  const columns=14,rows=4;
  for(let j=0;j<=rows;j++)for(let k=0;k<=columns;k++){
    const dx=(k/columns-.5)*2.23,dz=(j/rows-.5)*.318;
    vertices.push([x+dx,y+treadSurface(dx,dz),z+dz]);
    if(k&&j){const n=j*(columns+1)+k;indices.push(n,n-columns-1,n-columns-2,n,n-columns-2,n-1)}
  }
  face(vertices,indices,i%3?'#b1b0a0':'#a4a697');
  const front=[],frontIndices=[];
  for(let k=0;k<=columns;k++){
    const a=vertices[rows*(columns+1)+k];front.push(a,[a[0],y-.012,a[2]]);
    if(k){let v=k*2;frontIndices.push(v-2,v,v+1,v-2,v+1,v-1)}
  }
  face(front,frontIndices,i%2?'#94998b':'#898f84');
}
const stairN=16,stairFront=2.18,stairRun=.307,stairRise=(terraceY-.20)/(stairN-1);
function stairLevel(i){return .12+i*stairRise}
function stairIndex(z){return clamp(Math.round((stairFront-z)/stairRun),0,stairN-1)}
world=sites.upper;
for(let i=0;i<stairN;i++){
  const y=stairLevel(i),z=stairFront-i*stairRun;
  box(axisX,y*.5,z,2.06,y,stairRun+.012,'#8c8e81');tread(axisX,y,z,i);
  for(let j=0;j<3;j++){const dx=R(-1.03,1.03),dz=R(-.13,.13);leaf(axisX+dx,y+treadSurface(dx,dz)+.006,z+dz,R(.050,.108),j%2,null,true)}
  for(let side of [-1,1]){
    const X=axisX+side*1.24;
    box(X,y*.5,z,.46,y+.014,stairRun-.009,i%2?'#959886':'#888f7d');
    obj(wallBlocks[i%9],X,y+.043,z,.50,.117,stairRun+.023,'#a3a58c');
    if(i%3===0)rock(X+side*.19,y+.102,z,.13,.033,.085,'#81905e');
  }
}
world=gardenRoot;
function torii(x,y,z,s){for(let a of [-1,1]){rod(x+a*1.02*s,y,z,x+a*.91*s,y+2.65*s,z,.135*s,red,.95,20);cyl(x+a*1.02*s,y+.23*s,z,.168*s,.44*s,'#363d39');cyl(x+a*1.02*s,y+.04*s,z,.22*s,.09*s,'#888781')}box(x,y+2.04*s,z,2.58*s,.17*s,.19*s,red);box(x,y+2.39*s,z,.19*s,.54*s,.2*s,red);for(let i=-8;i<=8;i++){let u=i/8;box(x+i*.165*s,y+(2.72+.16*u*u)*s,z,.182*s,.22*s,.28*s,red,0,0,u*.15);box(x+i*.178*s,y+(2.88+.16*u*u)*s,z,.197*s,.11*s,.36*s,'#353c39',0,0,u*.16)}rope(x,y+2.04*s,z+.09*s,1.82*s,.18*s)}
atSite('gate',()=>{torii(4.75,.12,3.45,1.27);sign(4.75,3.09,3.66,.42,.67,'星宮');box(6.28,.85,3.75,.39,1.53,.37,'#a49f8d');sign(6.28,.87,3.942,.34,1.12,'星宮社','#a49f8d','#443f36');});
world=sites.upper;
for(const i of [2,8,14])for(let side of [-1,1])lantern(axisX+side*1.25,stairLevel(i)+.104,stairFront-stairRun*i,.65);
world=gardenRoot;
// Trim any straight rafter or tile seam against the projected circular skylight.
function roofMember(a,b,r,color,sides=10){
  const ax=a[0]+3.6,az=(a[2]+3.44)/.925,dx=b[0]-a[0],dz=(b[2]-a[2])/.925;
  const A=dx*dx+dz*dz,B=2*(ax*dx+az*dz),C=ax*ax+az*az-.502*.502;
  const determinant=B*B-4*A*C;
  if(determinant<=0||A<1e-9){rod(...a,...b,r,color,1,sides);return}
  const cut0=clamp((-B-Math.sqrt(determinant))/(2*A),0,1),cut1=clamp((-B+Math.sqrt(determinant))/(2*A),0,1);
  function point(t){return a.map((v,k)=>v+(b[k]-v)*t)}
  if(cut0>.001)rod(...a,...point(cut0),r,color,1,sides);
  if(cut1<.999)rod(...point(cut1),...b,r,color,1,sides);
}
function perforatedRoof(x,y,z,w,d,rise,color){
  const ox=-3.6,oz=-3.44;
  const corners=[[x-w/2,z],[x+w/2,z],[x+w/2+.19,z-d/2],[x-w/2-.19,z-d/2]];
  let angles=Array.from({length:128},(_,i)=>i*TAU/128);
  for(const [X,Z] of corners)angles.push((Math.atan2(Z-oz,X-ox)+TAU)%TAU);
  angles.sort((a,b)=>a-b);
  const count=angles.length,rows=18,vertices=[],indices=[];
  for(let i=0;i<count;i++){
    const dx=Math.cos(angles[i]),dz=Math.sin(angles[i]);
    const inside=.502/Math.hypot(dx,dz/.925);
    let outside=Infinity;
    for(let k=0;k<4;k++){
      const A=corners[k],B=corners[(k+1)%4],ex=B[0]-A[0],ez=B[1]-A[1],den=dx*ez-dz*ex;
      if(Math.abs(den)<1e-8)continue;
      const rx=A[0]-ox,rz=A[1]-oz,t=(rx*ez-rz*ex)/den,v=(rx*dz-rz*dx)/den;
      if(t>0&&v>=-1e-7&&v<=1+1e-7)outside=Math.min(outside,t);
    }
    for(let k=0;k<=rows;k++){
      const radius=inside+(outside-inside)*k/rows,xx=ox+dx*radius,zz=oz+dz*radius;
      const u=clamp((z-zz)/(d/2),0,1),v=(xx-x)/(w*.5+.19*u);
      vertices.push([xx,y+rise*(1-u)**1.5+.14*v*v*u,zz]);
      if(k){let a=i*(rows+1)+k,b=((i+1)%count)*(rows+1)+k;indices.push(a,b,b-1,a,b-1,a-1)}
    }
  }
  face(vertices,indices,color);
}
function roof(x,y,z,w,d,rise,col='#515d5e',half=false){let eaves='#434542';for(let side of (half?[-1]:[-1,1])){let pts=[],inds=[];for(let j=0;j<=8;j++){let u=j/8;for(let k=0;k<=16;k++){let v=k/8-1;pts.push([x+v*(w*.5+.19*u),y+rise*(1-u)**1.5+.14*v*v*u,z+side*u*d/2]);if(k&&j){let n=j*17+k;inds.push(n,n-1,n-18,n,n-18,n-17)}}}if(!half)face(pts,inds,col);else perforatedRoof(x,y,z,w,d,rise,col);for(let k=0;k<=Math.round(w/.16);k++){let v=k/Math.round(w/.16)*2-1,pp=[];for(let j=0;j<=6;j++){let u=j/6;pp.push([x+v*(w*.5+.19*u),y+rise*(1-u)**1.5+.14*v*v*u+.025,z+side*u*d/2])}let tileColor=pick(['#6f7776','#677274','#758181']);for(let m=1;m<pp.length;m++){let A=pp[m-1],B=pp[m];if(half)roofMember(A,B,.035,tileColor);else rod(...A,...B,.035,tileColor)}ball(...pp[6],.065,.061,.055,'#596365')}for(let j=1;j<=5;j++){let u=j/6,A=[x-(w*.5+.19*u),y+rise*(1-u)**1.5+.045,z+side*u*d/2],B=[x+w*.5+.19*u,A[1],A[2]];if(half)roofMember(A,B,.019,'#4b5355');else rod(...A,...B,.019,'#4b5355')}box(x,y-.025,z+side*d/2,w+.35,.13,.12,eaves)}rod(x-w/2-.14,y+rise+.08,z,x+w/2+.14,y+rise+.08,z,.103,eaves)}
// Shrine, offertory box, mirror, ema, folded fortunes and sake barrels.
function shrine(x,y,z,s){let b=(a,h,d,w,hh,dd,c)=>box(x+a*s,y+h*s,z+d*s,w*s,hh*s,dd*s,c);b(0,.2,0,2.55,.32,2.05,wood);for(let j=0;j<13;j++)b(0,.39,-.95+j*.16,2.68,.11,.153,lightwood);b(0,1.18,-.91,2.26,1.6,.13,'#9c5639');for(let side of [-1,1]){b(side*1.05,1.21,0,.13,1.7,1.86,'#bd7a48');for(let zz of [-.87,.73])b(side*1.08,1.28,zz,.17,1.9,.17,red);b(side*.75,1.2,.7,.55,1.45,.085,'#cbac78');for(let i=0;i<5;i++)b(side*.75+(i-2)*.11,1.22,.76,.038,1.42,.06,wood);for(let i=0;i<4;i++)b(side*.75,.68+i*.32,.76,.55,.045,.06,wood)}b(0,2.1,0,2.65,.17,2.1,red);b(0,2.27,0,2.8,.15,2.18,wood);roof(x,y+2.27*s,z,3.13*s,2.98*s,.91*s,'#536062');for(let side of [-1,1]){for(let zz of [-1,1])rod(x+side*1.14*s,y+2.92*s,z+zz*.55*s,x+side*1.14*s,y+3.63*s,z-zz*.34*s,.072*s,lightwood)}for(let i=-2;i<=2;i++)rod(x+i*.38*s,y+3.26*s,z-.24*s,x+i*.38*s,y+3.26*s,z+.24*s,.08*s,gold);ring(x,y+1.38*s,z-.56*s,.32*s,.047*s,gold);ball(x,y+1.38*s,z-.58*s,.31*s,.31*s,.03*s,'#c4dcda');rope(x,y+1.99*s,z+.91*s,2.1*s,.22*s);ball(x,y+1.76*s,z+.97*s,.12*s,.14*s,.12*s,gold);for(let i=0;i<11;i++)ball(x,y+(1.65-i*.08)*s,z+1*s,.043*s,.075*s,.045*s,i%2?red:paper);b(0,.53,1.13,1.07,.53,.45,'#855c42');for(let i=-4;i<=4;i++)b(i*.11,.82,1.13,.061,.058,.45,wood);for(let i=0;i<2;i++)b(0,.13-i*.10,1.26+i*.21,1.65,.15,.26,'#978678')}
atSite('hall',()=>{shrine(4.4,1.98,-4.86,1.13);});
// Komainu and kitsune have distinct silhouettes even before the facial details resolve.
function beast(x,y,z,s,fox){
  const turn=fox?(x<2.49?.12:-.12):(x<4.45?.18:-.18),sn=Math.sin(turn),cs=Math.cos(turn);
  const opened=x<4.45;
  const P=(dx,dy,dz)=>[x+s*(cs*dx+sn*dz),y+s*dy,z+s*(cs*dz-sn*dx)];
  const sphere=(dx,dy,dz,w,h,d,color,rx=0,rz=0)=>obj(sphereG,...P(dx,dy,dz),w*s,h*s,d*s,color,rx,turn,rz,fox?paint:graniteFinish);
  const strand=(points,r,color)=>{let o=rootCurve(points.map(p=>P(...p)),r*s,color);if(!fox)mineralWashOn(o.material);return o};
  const cut=(points,faces,color)=>face(points.map(p=>P(...p)),faces,color);
  const grey='#90998a',shadow='#738071',ridge='#a4ab98',ivory='#efe2c8';
  slab(x,y+.063*s,z,.81*s,.69*s,.126*s,fox?'#9c9784':'#808b7d');
  box(x,y+.147*s,z,.716*s,.047*s,.591*s,'#abae98');
  if(fox){
    sphere(0,.373,-.025,.139,.239,.147,ivory,-.13);
    for(let side of [-1,1]){
      sphere(side*.108,.266,-.073,.091,.121,.132,'#e2d5bb');
      strand([[side*.078,.449,.061],[side*.078,.338,.085],[side*.074,.183,.122]],.031,'#ece0c6');
      sphere(side*.077,.195,.138,.041,.026,.058,'#e4d8bd');
    }
    sphere(0,.626,.022,.147,.137,.127,ivory);
    for(let side of [-1,1]){
      const tip=[side*.104,.87,-.009],left=[side*.152,.679,.015],right=[side*.041,.697,.029],back=[side*.102,.683,-.069];
      cut([tip,left,right,back],[0,1,2,0,3,1,0,2,3],'#e8dcc5');
      cut([[side*.103,.835,-.002],[side*.128,.712,.031],[side*.072,.718,.034]],[0,1,2],'#aa836b');
      strand([[side*.094,.656,.117],[side*.076,.641,.134],[side*.047,.635,.141]],.009,'#564b43');
      strand([[side*.136,.603,.067],[side*.116,.594,.113],[side*.091,.592,.135]],.009,red);
    }
    cut([[-.092,.613,.10],[.09,.613,.10],[0,.646,.141],[0,.562,.137],[0,.582,.235]],[0,2,4,2,1,4,1,3,4,3,0,4],'#eee2cb');
    sphere(0,.585,.23,.026,.017,.017,'#62554a');
    strand([[.078,.218,-.119],[.167,.25,-.152],[.211,.343,-.128],[.211,.437,-.044],[.175,.516,-.023]],.066,'#e1d5bc');
    cut([[-.115,.538,.099],[.115,.538,.099],[.078,.443,.134],[0,.408,.153],[-.074,.444,.134]],[0,1,3,1,2,3,0,3,4],red);
    return;
  }
  sphere(0,.481,-.048,.212,.289,.223,grey,-.26);
  sphere(0,.626,.076,.201,.219,.174,ridge,-.14);
  for(let side of [-1,1]){
    sphere(side*.144,.331,-.124,.124,.169,.157,grey,.18);
    strand([[side*.138,.57,.11],[side*.156,.42,.15],[side*.139,.241,.184]],.066,grey);
    sphere(side*.144,.21,.198,.074,.049,.109,ridge);
    for(let n=-1;n<=1;n++)sphere(side*.144+n*.028,.208,.276-Math.abs(n)*.009,.021,.029,.04,grey);
  }
  sphere(0,.853,.083,.193,.183,.162,grey,-.09);
  sphere(0,.801,.217,.158,.087,.103,grey);
  for(let side of [-1,1]){
    sphere(side*.093,.88,.222,.057,.039,.033,ridge);
    sphere(side*.091,.881,.25,.023,.021,.014,'#5c695e');
    strand([[side*.043,.911,.224],[side*.092,.931,.222],[side*.147,.93,.193],[side*.179,.907,.162]],.024,grey);
    sphere(side*.162,.976,.027,.053,.082,.043,grey,.18,-side*.46);
    sphere(side*.162,.98,.064,.028,.043,.013,shadow);
    sphere(side*.072,.809,.275,.086,.055,.054,ridge);
  }
  sphere(0,.835,.302,.073,.044,.045,shadow);
  for(let side of [-1,1])sphere(side*.032,.836,.34,.013,.008,.006,'#526056');
  if(opened){
    sphere(0,.742,.261,.111,.047,.074,'#5d675d');
    sphere(0,.711,.246,.116,.039,.084,grey);
    for(let side of [-1,1])obj(cylG(0,7),...P(side*.077,.756,.313),.013*s,.036*s,.013*s,'#bebda6',Math.PI,turn);
  }else strand([[-.092,.767,.288],[-.047,.751,.306],[0,.75,.311],[.057,.756,.305],[.097,.768,.289]],.009,shadow);
  // Spiral locks wrap the sides of the head and tumble onto the chest.
  for(let k=0;k<15;k++){
    const angle=k*TAU/15,dx=.182*Math.sin(angle),dz=.075+.151*Math.cos(angle);
    const yy=.839+.188*Math.sin(angle+.8)**2,rr=.041+(k%3)*.005;
    if(dz>.16&&yy<.936)continue;
    sphere(dx,yy,dz,.054,.058,.05,grey);
    let curl=[];for(let j=0;j<=13;j++){let u=j/13,a=u*TAU*1.31,r=rr*(1-.72*u);curl.push([dx+Math.cos(a)*r,yy+Math.sin(a)*r,dz+.038])}
    strand(curl,.012,ridge);
  }
  for(let k=0;k<7;k++){
    const dx=(k-3)*.046,yy=.68+.043*Math.cos(k*1.5);
    strand([[dx,yy,.196],[dx-.021,yy-.038,.217],[dx+.014,yy-.083,.223],[dx+.017,yy-.12,.212]],.021,grey);
  }
  strand([[.085,.301,-.176],[.166,.344,-.234],[.207,.465,-.252],[.179,.59,-.195],[.124,.656,-.178],[.115,.709,-.223]],.083,grey);
  for(let n=0;n<4;n++)strand([[.179,.465+n*.027,-.259],[.201,.52+n*.033,-.246],[.186,.591+n*.035,-.217]],.021,ridge);
  sphere(opened?-.213:.204,.224,.225,.064,.064,.064,opened?'#8a9385':'#9ba28e');
}
atSite('hall',()=>{for(let a of [-1,1])beast(4.45+a*1.39,2.01,-2.99,.88,false);});
atSite('barrels',()=>{for(let i=0;i<6;i++){let x=6.15+(i%2)*.43,y=2.19+Math.floor(i/2)*.4,z=-5.04;cyl(x,y,z,.21,.37,'#e4cb98');for(let d of [-.12,.12])ring(x,y+d,z,.211,.017,wood,Math.PI/2);sign(x,y,z+.208,.25,.16,i%2?'奉 納':'清 酒','#ead6ab','#5d5140')}});
// Wish plaques have a pitched shoulder, a real cord hole and small ink drawings.
const emaOutline=new T.Shape();emaOutline.moveTo(-.49,-.48);emaOutline.lineTo(.49,-.48);emaOutline.lineTo(.49,.29);emaOutline.lineTo(0,.50);emaOutline.lineTo(-.49,.29);emaOutline.closePath();
const emaHole=new T.Path();emaHole.absarc(0,.333,.038,0,TAU,true);emaOutline.holes.push(emaHole);
const emaWood=new T.ExtrudeGeometry(emaOutline,{depth:.14,bevelEnabled:true,bevelSize:.013,bevelThickness:.015,bevelSegments:1,curveSegments:5});
const emaFront=new T.ShapeGeometry(emaOutline);for(let i=0;i<emaFront.attributes.uv.count;i++)emaFront.attributes.uv.setXY(i,emaFront.attributes.position.getX(i)+.5,emaFront.attributes.position.getY(i)+.5);
function votivePainting(variant){
  return canvasTex(256,208,(p,w,h)=>{
    p.fillStyle=['#dfb686','#dcaf7b','#e7c495','#ddb789','#e4bd88'][variant];p.fillRect(0,0,w,h);
    for(let j=0;j<47;j++){const y=j*h/46;p.lineWidth=j%6===0?1.3:.5;p.strokeStyle=j%2?'#9c774b55':'#fff0c055';p.beginPath();p.moveTo(0,y);p.bezierCurveTo(71,y+3*Math.cos(j),167,y-3,256,y+1);p.stroke()}
    p.save();p.translate(111,111);p.strokeStyle='#7b563a';p.lineWidth=3.5;p.lineJoin='round';p.lineCap='round';
    if(variant===0){
      const stars=[[-53,14],[-32,-14],[-9,1],[18,-26],[48,-11],[59,16]];
      p.beginPath();stars.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.stroke();
      stars.forEach(([x,y],i)=>{p.fillStyle=i%2?'#f3e0a0':'#956535';p.beginPath();for(let k=0;k<10;k++){let a=k*TAU/10-Math.PI/2,r=k%2?3:8;p.lineTo(x+r*Math.cos(a),y+r*Math.sin(a))}p.fill()});
    }else if(variant===1){
      p.fillStyle='#efe3c8';p.beginPath();p.moveTo(-45,-40);p.lineTo(-13,-24);p.quadraticCurveTo(7,-32,19,-23);p.lineTo(47,-43);p.lineTo(40,-3);p.quadraticCurveTo(42,21,2,45);p.quadraticCurveTo(-30,28,-41,7);p.closePath();p.fill();p.stroke();
      for(let side of [-1,1]){p.beginPath();p.moveTo(side*34,-7);p.quadraticCurveTo(side*21,1,side*12,2);p.stroke();p.strokeStyle='#b65c3d';p.beginPath();p.moveTo(side*35,7);p.lineTo(side*18,13);p.stroke();p.strokeStyle='#7b563a'}p.fillStyle='#554438';p.beginPath();p.arc(1,21,4,0,TAU);p.fill();
    }else if(variant===2){
      p.fillStyle='#b96842';p.beginPath();const leaf=[[-3,41],[-1,19],[-43,21],[-26,3],[-51,-8],[-22,-11],[-32,-40],[-9,-21],[0,-53],[9,-20],[27,-40],[22,-10],[48,-10],[29,3],[43,16],[6,19]];leaf.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();p.fill();p.beginPath();p.moveTo(-4,47);p.lineTo(0,-37);p.stroke();
    }else if(variant===3){
      p.fillStyle='#e7ce83';p.beginPath();p.moveTo(-9,-39);p.bezierCurveTo(-56,-23,-44,33,-4,38);p.bezierCurveTo(15,43,32,31,37,24);p.bezierCurveTo(-4,38,-34,-11,-9,-39);p.fill();p.stroke();for(let [x,y] of [[34,-29],[52,-6],[16,-15]]){p.beginPath();p.moveTo(x-5,y);p.lineTo(x+5,y);p.moveTo(x,y-5);p.lineTo(x,y+5);p.stroke()}
    }else{
      p.fillStyle='#c3a44e';p.beginPath();p.moveTo(0,29);p.quadraticCurveTo(-39,5,-48,-21);p.quadraticCurveTo(-35,-42,-4,-41);p.lineTo(0,-25);p.lineTo(7,-42);p.quadraticCurveTo(38,-38,49,-16);p.quadraticCurveTo(27,7,0,29);p.fill();p.stroke();p.beginPath();p.moveTo(0,28);p.quadraticCurveTo(4,36,-4,47);p.stroke();
    }
    p.restore();p.fillStyle='#826242';p.font='19px SimSun';p.fillText('星',201,103);p.fillText('宮',201,123);
    p.strokeStyle='#a55a40';p.lineWidth=2;p.strokeRect(203,145,20,20);p.font='14px SimSun';p.fillText('秋',206,160);
  });
}
const emaPaint=Array.from({length:5},(_,i)=>new T.MeshToonMaterial({map:votivePainting(i),gradientMap:grad,side:T.DoubleSide}));
atSite('votive',()=>{
for(let side of [-1,1])box(2.39+side*.66,2.62,-3.05,.07,1.25,.07,wood);
for(let row=0;row<2;row++){
  const railY=2.65+row*.45;box(2.39,railY,-3.05,1.5,.055,.06,wood);
  for(let i=0;i<5;i++){
    let X=1.87+i*.26,Y=railY-.207-.015*Math.sin(i*2.1+row),Z=-2.997,tilt=.055*Math.sin(i*2.14-row);
    suspended(X,railY,Z,.34,()=>{
      const holeY=Y+.333*.193;
      pipe([[X-.021,railY+.016,Z-.017],[X-.014,railY-.032,Z+.006],[X,holeY,Z+.016],[X+.018,railY-.029,Z],[X+.019,railY+.016,Z-.017]],.006,i%3===0?'#93593e':'#907854');
      obj(emaWood,X,Y,Z,.216,.193,.175,'#b89163',0,0,tilt);
      obj(emaFront,X,Y,Z+.028,.216,.193,.175,'#fff9eb',0,0,tilt,emaPaint[(i+2*row)%5]);
    });
  }
}
roof(2.39,3.22,-3.05,1.51,.48,.15);

});
// A short rise at the end of the subsidiary approach keeps the little shrine visible.
atSite('inari',()=>{
for(let j=0;j<3;j++)torii(2.55,.12+j*.06,-.02-j*.42,.344);
for(let j=0;j<5;j++){
  const z=-1.075-j*.167,top=.366+j*.043;
  box(2.49,top*.5,z,1.18,top,.178,'#8d9380');
  for(let k=0;k<3;k++)obj(wallBlocks[(j+k)%9],2.49+(k-1)*.39,top+.008,z,.393,.057,.178,['#aca893','#a2a68f','#b3ad99'][(j+k)%3]);
}
shrine(2.49,.526,-1.86,.367);
for(let side of [-1,1]){
  const X=2.49+side*.49;
  slab(X,.203,-.962,.27,.256,.186,'#989d88');
  beast(X,.296,-.962,.34,true);
}

});
// Stream with pebbled banks.
const streamHead=sitePoint('upper',[1.96,0,-2.24]);
const stream=[[streamHead.x,streamHead.z],[2.06,-1.89],[1.57,-1.02],[1.39,.37],[1.55,1.13],[1.11,2.18],[.87,2.75],[.61,3.17]];
function streamSurface(z){return .495+Math.max(0,3.17-z)*.069}
function streamRibbon(){
  const section=(i)=>{
    const [x,z]=stream[i],previous=stream[Math.max(0,i-1)],next=stream[Math.min(stream.length-1,i+1)];
    const angle=Math.atan2(next[0]-previous[0],next[1]-previous[1]);
    return {x,z,y:streamSurface(z),nx:Math.cos(angle),nz:-Math.sin(angle)};
  };
  for(let i=1;i<stream.length;i++){
    const a=section(i-1),b=section(i);
    let pt=(v,offset,level)=>[v.x+v.nx*offset,level,v.z+v.nz*offset];
    const quad=(left,right,color)=>face([pt(a,left,a.y),pt(a,right,a.y),pt(b,right,b.y),pt(b,left,b.y)],[0,1,2,0,2,3],color);
    quad(-.245,.245,'#7ab4ad');
    for(let side of [-1,1]){
      const lip=side*.25,outer=side*.64;
      face([pt(a,lip,a.y-.011),pt(b,lip,b.y-.011),pt(b,outer,.108),pt(a,outer,.108)],[0,1,2,0,2,3],'#8e9c73');
      const count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.097);
      for(let j=0;j<count;j++){
        const u=j/count,xx=a.x+(b.x-a.x)*u,zz=a.z+(b.z-a.z)*u,yy=streamSurface(zz);
        const nx=a.nx+(b.nx-a.nx)*u,nz=a.nz+(b.nz-a.nz)*u;
        rock(xx+nx*lip,yy-.014,zz+nz*lip,.102,.054,.112,pick(['#7b8d76','#8f9d83','#a8aa8f','#a1a389']));
        if(j%2===0)rock(xx+nx*lip*1.56,yy*.67+.027,zz+nz*lip*1.56,.113,.074,.114,'#8e996b');
        if(j%4===0)ball(xx+R(-.11,.11),yy+.007,zz,.012,.004,.078,'#c8dfc7',0,Math.atan2(b.x-a.x,b.z-a.z));
      }
    }
  }
}
streamRibbon();
function bridge(x,z){for(let i=-7;i<=7;i++){let u=i/7,y=.672+.23*(1-u*u);box(x+i*.109,y,z,.108,.1,.87,red);for(let side of [-1,1]){if(i%3===0)box(x+i*.109,y+.22,z+side*.42,.063,.48,.065,'#a73628');if(i<7)rod(x+i*.109,y+.43,z+side*.42,x+(i+1)*.109,1.102+.23*(1-((i+1)/7)**2),z+side*.42,.037,red)}}}bridge(1.11,2.18);
function basin(x,y,z,s){cyl(x,y+.18*s,z,.29*s,.32*s,'#797e70',1.6);cyl(x,y+.42*s,z,.48*s,.24*s,'#979989',1.07);cyl(x,y+.545*s,z,.44*s,.014*s,'#96bdac');ring(x,y+.553*s,z,.48*s,.041*s,'#adae9b',Math.PI/2)}
atSite('purification',()=>{basin(2.81,.14,1.35,1.12);for(let a of [-1,1])for(let b of [-1,1])box(2.81+a*.59,1.04,1.35+b*.44,.07,1.8,.07,wood);roof(2.81,1.89,1.35,1.56,1.32,.4);for(let j=0;j<3;j++)rod(2.62+j*.15,.79,1.19,2.62+j*.15,.79,1.68,.02,lightwood);});
// Forked boughs support clouds of individually cut maple and ginkgo leaves.
const barkWash=canvasTex(512,512,(p,w,h)=>{
  p.fillStyle='#d0bf99';p.fillRect(0,0,w,h);
  for(let j=0;j<340;j++){
    const x=R(0,w),y=R(-40,h),length=R(13,184),wave=R(1,6);
    p.lineWidth=R(.65,2.8);p.strokeStyle=pick(['#665d4c8c','#968569a6','#f3dfad92','#786f595c']);
    p.beginPath();p.moveTo(x,y);p.bezierCurveTo(x-wave*2,y+length*.27,x+wave*1.7,y+length*.49,x+wave*.3,y+length);p.stroke();
  }
  for(let j=0;j<34;j++){
    const x=R(0,w),y=R(0,h);p.strokeStyle='#756c545e';p.lineWidth=1.4;p.beginPath();p.ellipse(x,y,R(.7,3.1),R(5,15),R(-.22,.22),.24,5.76);p.stroke();
  }
});barkWash.wrapS=barkWash.wrapT=T.RepeatWrapping;
function ancientTrunk(x,y,z,h,lean,type){
  let vertices=[],indices=[],uvs=[],rows=20,sides=40;
  for(let j=0;j<=rows;j++){
    const u=j/rows,yy=h*.642*u;
    const cx=x+lean*u+.009*h*Math.sin(u*TAU),cz=z-.06*u-.012*h*Math.sin(u*Math.PI);
    for(let k=0;k<=sides;k++){
      let a=TAU*k/sides;
      const flare=Math.exp(-u*12)*(.023+.07*(.5+.5*Math.cos(a*7+.42))**4);
      const furrow=.0028*Math.cos(a*11+u*1.3)+.0022*Math.sin(a*5-u*2.2);
      const radius=h*(.055-.025*u+flare+furrow);
      vertices.push(cx+Math.cos(a)*radius,y+yy,cz+Math.sin(a)*radius*.91);
      uvs.push(k/sides*2.2,u*2.8);
      if(k&&j){let n=j*(sides+1)+k;indices.push(n,n-1,n-sides-2,n,n-sides-2,n-sides-1)}
    }
  }
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geom.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geom.setIndex(indices);geom.computeVertexNormals();
  mesh(geom,0,0,0,0,new T.MeshToonMaterial({color:type?'#928467':'#846d59',map:barkWash,side:T.DoubleSide,gradientMap:grad}));
}
function deciduous(x,y,z,h,r,type=0){
  const bark=type?'#78694e':'#705944',pal=type?ginCols:mapCols;
  let top=y+h,lean=h*.055;
  ancientTrunk(x,y,z,h,lean,type);
function foliage(cx,cy,cz,sz){let shade=pick(type?['#c1972b','#cda434','#d5ac32']:['#a74328','#af4525','#b75127']);rock(cx,cy-.07*sz,cz,sz*.64,sz*.21,sz*.56,shade);for(let k=0;k<165;k++){let a=R(0,TAU),rad=Math.sqrt(rand()),xx=Math.cos(a)*rad,zz=Math.sin(a)*rad,yy=(type?.44:.32)*(1-rad*rad)+R(type?-.32:-.19,type?.23:.13),idx=clamp(Math.floor(2.3+yy*4-xx*.9+R(-2,2)),0,5);leaf(cx+xx*sz,cy+yy*sz,cz+zz*sz*.87,R(.095,.205)*Math.sqrt(sz),type,pal[idx])}}
for(let j=0;j<12;j++){let a=j*2.4+R(-.24,.24),u=j/12,span=r*(.93-.59*u),yy=y+h*(.42+.45*u),mid=[x+lean+Math.cos(a)*span*.55,yy+h*.10,z+Math.sin(a)*span*.55],end=[x+lean+Math.cos(a)*span,yy+h*.18,z+Math.sin(a)*span];rod(x+lean*.7,yy-h*.13,z,...mid,h*.027*(1-u*.53),bark,.52);rod(...mid,...end,h*.014,bark,.36);for(let k=0;k<3;k++){let b=a+(k-1)*1.15;let sz=r*R(.29,.44),cx=end[0]+Math.cos(b)*sz*.57,cz=end[2]+Math.sin(b)*sz*.57,cy=end[1]+R(-.14,.29);rod(...mid,cx,cy,cz,h*.009,bark,.2);foliage(cx,cy,cz,sz)}}foliage(x+lean,top,z,r*.55);
  if(type){
    const initialSeed=seed;
    const fork=[x+lean,y+h*.62,z-.08],tip=[x+lean*.91,y+h*.94,z+.06];
    rod(...fork,...tip,h*.021,bark,.29);
    for(let j=0;j<12;j++){
      const u=j/11,angle=2.40*j+.7,length=r*(.44-.21*u);
      const by=y+h*(.49+.40*u),cx=x+lean+length*Math.cos(angle),cz=z+length*Math.sin(angle);
      const cy=by+h*(.081+.018*Math.cos(angle));
      rod(x+lean,by,z,cx,cy,cz,h*.0093,bark,.25);
      foliage(cx,cy,cz,r*(.46-.11*u));
    }
    seed=initialSeed;
  }
}
deciduous(-5.42,.11,-5.18,3.36,.87);deciduous(5.95,.11,-1.54,2.63,.61);deciduous(-5.87,.10,1.44,2.36,.69);
atSite('ginkgo',()=>{deciduous(.37,.11,-4.09,7.17,1.56,1);
for(let strand=0;strand<3;strand++){
  let points=[];
  for(let k=0;k<=120;k++){
    const a=k*TAU/120,twist=a*18+strand*TAU/3,rr=.403+.019*Math.cos(twist);
    points.push([.577+rr*Math.cos(a),2.257+.045*Math.cos(a+.31)+.022*Math.sin(twist),-4.215+rr*.92*Math.sin(a)]);
  }
  pipe(points,.015,['#a68b58','#d2b482','#baa06f'][strand]);
}
for(let j=0;j<7;j++){
  const a=j*TAU/7+.33,X=.577+.416*Math.cos(a),Z=-4.215+.386*Math.sin(a);
  suspended(X,2.24,Z,.14,()=>{
    for(let k=0;k<3;k++)box(X+.028*(k%2),2.18-k*.068,Z,.068,.098,.011,paper,0,a,.24);
  });
}
});
// Cryptomeria branchlets: the silhouette follows each bough's upswept tip.
const cedarSpray = polygon([[0,0],[-.3,.14],[-.16,.17],[-.4,.36],[-.19,.33],[-.29,.52],[-.11,.48],[-.15,.68],[0,.95],[.12,.63],[.10,.47],[.24,.55],[.19,.34],[.35,.42],[.21,.19],[.3,.22]]);
function cedar(x,z,h) {
  const colors=['#4c6c5b','#537362','#688774','#7c9380'];
  rod(x,.09,z,x,h,z,h*.024,'#756a50',.08);
  for(let level=0;level<15;level++) {
    const u=level/15, y=h*(.18+.8*u), width=h*(.148-.13*u);
    for(let k=0;k<8;k++) {
      const a=k*TAU/8+level*1.76, dx=Math.cos(a), dz=Math.sin(a);
      const radius=width*R(.73,1.12);
      rod(x,y,z,x+dx*radius,y-.07*h*(1-u),z+dz*radius,.018,'#65755a',.14,5);
      for(let i=0;i<7;i++) {
        const t=(i+.36)/7, xx=x+dx*radius*t, zz=z+dz*radius*t;
        const yy=y-h*.071*(1-u)*Math.sin(t*1.86);
        const size=h*(.1-.053*u)*(1-.4*t);
        for(let side of [-1,1])obj(cedarSpray,xx,yy,zz,size*.95,size,size,colors[clamp(Math.floor(1.2+t*.8-dx*.52+R(-.89,.9)),0,3)],-.58,1.57-a+side*.58,side*.36);
      }
    }
  }
}
for(let j=0;j<7;j++)atSite('hall',()=>{const old=world,trees=new T.Group();old.add(trees);trees.position.y=1.9;world=trees;try{cedar(1.94+j*.58,-7.14+R(-.06,.06),R(3.0,4.40))}finally{world=old}});
for(let i=0;i<28;i++){let x=-5.99+i*.141+R(-.025,.025),z=-5.86+R(-.11,.11),h=R(2.54,3.72);rod(x,.11,z,x+.11,h,z,.045,'#8c9963',.66);for(let j=1;j<10;j++){let y=h*j/10;cyl(x+.11*j/10,y,z,.049,.027,'#636f4c');if(j>4){let a=R(0,TAU);for(let k=0;k<6;k++)ball(x+.09+k*.06*Math.cos(a),y+.07*k,z+k*.06*Math.sin(a),.055,.02,.18,'#839463',.4,a+k*.14)}}}
// Paired needles grow from a bent black pine that leans over the water.
const pineTuft=(()=>{
  const xyz=[],col=[],idx=[],color=new T.Color();
  const bases=['#456b57','#42634e','#547052'],tips=['#7e9a72','#8a9f74','#739168'];
  for(let j=0;j<17;j++){
    const a=j*2.4,y=.36+.79*(.5+.5*Math.sin(j*2.18)),r=.53+.34*Math.cos(j*2.68);
    for(let twin of [-1,1]){
      const b=a+twin*.069,x=Math.cos(b)*r,z=Math.sin(b)*r,width=.048,first=xyz.length/3;
      xyz.push(-Math.sin(b)*width,0,Math.cos(b)*width,Math.sin(b)*width,0,-Math.cos(b)*width,x*.54,y*.48,z*.54,x,y,z);
      for(let c of [bases[j%3],bases[j%3],tips[j%3],tips[(j+1)%3]]){color.set(c);col.push(color.r,color.g,color.b)}
      idx.push(first,first+1,first+2,first,first+2,first+3);
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(xyz,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g;
})();
const pineInk=new T.MeshToonMaterial({vertexColors:true,gradientMap:grad,side:T.DoubleSide});
function pine(x,z,s){
  const stems=[[0,.11,0],[.11,.43,-.13],[-.08,.76,-.34],[-.52,1.02,-.52],[-.55,1.49,-.63],[-.91,1.75,-.86],[-1.35,1.84,-.98],[-1.59,2.24,-1.14]];
  const pt=([dx,y,dz])=>[x+dx*s,y*s,z+dz*s];
  rootCurve(stems.map(pt),.173*s,'#78624c');
  for(let j=0;j<6;j++){
    const a=j*TAU/6;
    rootCurve([[x,.26,z],[x+.22*s*Math.sin(a),.149,z+.22*s*Math.cos(a)],[x+.35*s*Math.sin(a+.25),.115,z+.34*s*Math.cos(a+.25)]],.057*s,'#756247');
  }
  const pads=[[2,.56,1.13,-.27,.51],[3,-.77,1.27,.08,.5],[3,-.05,1.54,-1.07,.58],[4,-1.25,1.62,-.59,.59],[4,-.37,1.75,-.06,.48],[5,-.64,2.12,-1.3,.48],[6,-1.94,2.04,-.88,.58],[7,-1.61,2.37,-1.16,.47]];
  for(let [base,X,Y,Z,width] of pads){
    const p=stems[base],elbow=[p[0]*.44+X*.56,Y-.19,p[2]*.44+Z*.56];
    rootCurve([pt(p),pt(elbow),pt([X,Y,Z])],s*.053,'#735e48');
    for(let k=0;k<5;k++){
      const a=k*2.41+.6*base,xx=X+Math.cos(a)*width*.47,zz=Z+Math.sin(a)*width*.38,yy=Y+.06*Math.sin(k*2.67);
      rod(...pt(elbow),...pt([xx,yy,zz]),s*.024,'#6d614b',.32,7);
      obj(rockG,...pt([xx,yy+.025,zz]),s*width*.46,s*.074,s*width*.38,pick(['#52694f','#526e55','#617651']),.1,a,.08);
      for(let j=0;j<30;j++){
        const aa=j*2.39996,rad=Math.sqrt((j+.3)/30),dx=Math.cos(aa)*rad*width*.54,dz=Math.sin(aa)*rad*width*.46;
        let q=s*R(.105,.179);
        obj(pineTuft,...pt([xx+dx,yy+.088*(1-rad*rad)+R(-.025,.017),zz+dz]),q,q*.84,q,'#fcfae9',R(-.31,.31),aa,R(-.29,.29),pineInk);
      }
    }
  }
}
pine(2.82,5.55,.72);
function grass(x,y,z,s,plume=false){suspended(x,y,z,-.25,()=>{for(let i=0;i<10;i++){let a=R(0,TAU),r=s*R(.26,.65),h=s*R(.43,1);let X=x+Math.cos(a)*r,Z=z+Math.sin(a)*r;rod(x,y,z,X,y+h,Z,.012*s,pick(['#79824e','#93965b','#b4a66c']),.16,4);if(plume&&i%2===0)ball(X,y+h,Z,.033*s,.145*s,.04*s,'#e5d3a5',Math.sin(a)*.55,0,-Math.cos(a)*.55)}},2.3)}
for(const [cx,cz] of [[-5.84,3.64],[-4.02,5.40],[2.40,4.06],[1.57,1.33],[5.89,1.69]])for(let k=0;k<5;k++)grass(cx+R(-.18,.18),.11,cz+R(-.2,.2),R(.16,.36),k===0);
// Raked sand, bench, paper parasol.
world=sites.sand;
// Shallow raked furrows are cut into one continuous bed of sand.
const sandX=-3.68,sandZ=4.61;
function furrowDistance(x,z){
  const circle=Math.hypot(x+.225,(z+.071)*1.12);
  const blend=T.MathUtils.smoothstep(x,.37,1.05);
  return circle*(1-blend)+(x+.20+.055*z)*blend;
}
const sandGrain=canvasTex(512,512,(p,w,h)=>{
  p.fillStyle='#e6dbc2';p.fillRect(0,0,w,h);
  let value=51821;const sample=()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296};
  for(let n=0;n<28000;n++){let u=sample();p.fillStyle=u>.68?'#f7ebd183':u>.23?'#978e7159':'#afa6887a';let x=sample()*w,y=sample()*h;p.fillRect(x,y,.5+sample()*1.8,.5+sample())}
});
sandGrain.wrapS=sandGrain.wrapT=T.RepeatWrapping;sandGrain.repeat.set(2,1.4);
function sandSurface(){
  const rings=90,angles=196,points=[],uv=[],idx=[],colors=[];let col=new T.Color();
  for(let k=0;k<=rings;k++)for(let i=0;i<=angles;i++){
    const a=i/angles*TAU,u=k/rings,edge=1+.029*Math.sin(a*3+.2)+.019*Math.cos(a*5);
    const x=Math.cos(a)*1.37*edge*u,z=Math.sin(a)*.93*edge*u;
    const ridge=.5+.5*Math.cos(furrowDistance(x,z)*TAU/.113);
    const fade=1-T.MathUtils.smoothstep(u,.92,1);
    const y=.123+.041*fade+.011*Math.pow(ridge,2)*fade;
    points.push(sandX+x,y,sandZ+z);uv.push((x+1.5)/3,(z+1.02)/2.04);
    const tint=.91+.089*ridge*fade;col.setRGB(tint,tint*.993,tint*.97);colors.push(col.r,col.g,col.b);
    if(k&&i){const n=k*(angles+1)+i;idx.push(n,n-1,n-angles-2,n,n-angles-2,n-angles-1)}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();
  mesh(g,0,0,0,0,new T.MeshLambertMaterial({map:sandGrain,vertexColors:true,side:T.DoubleSide}));
}
sandSurface();
function gardenBoulder(x,z,w,h,d,variant){
  const rows=7,n=12,verts=[],indices=[];
  for(let j=0;j<=rows;j++)for(let k=0;k<n;k++){
    const u=j/rows,a=k*TAU/n,y=.116+u*h;
    const width=[.77,.97,1,.945,.822,.66,.46,.147][j];
    const rough=1+.085*Math.sin(a*3+variant*1.63)+.053*Math.sin(a*5+u*.7);
    verts.push([x+Math.cos(a)*w*width*rough+u*u*w*.22,y+.039*h*Math.sin(a*2.1+variant)*Math.sin(u*Math.PI),z+Math.sin(a)*d*width*rough-u*d*.18]);
    if(j){let q=j*n+k,r=j*n+(k+1)%n;indices.push(q,r,r-n,q,r-n,q-n)}
  }
  for(let k=1;k<n-1;k++)indices.push(rows*n,rows*n+k,rows*n+k+1);
  const o=face(verts,indices,['#828a7e','#8c9082','#93998b'][variant%3]);o.geometry.computeVertexNormals();mineralWashOn(o.material);
  for(let k=0;k<7;k++){let a=k*2.399+variant;obj(rockG,x+w*.76*Math.cos(a),.17,z+d*.76*Math.sin(a),w*.41,.034,d*.38,['#879563','#929b6a','#7e8b5a'][k%3],0,a)}
}
gardenBoulder(sandX-.27,sandZ-.08,.274,.576,.221,0);
gardenBoulder(sandX+.074,sandZ+.068,.232,.267,.169,1);
gardenBoulder(sandX-.55,sandZ+.101,.172,.203,.162,2);
gardenBoulder(sandX+.58,sandZ-.41,.112,.145,.099,1);
for(let j=0;j<6;j++){let a=j*1.967+.18;obj(mapleGeo,sandX+Math.cos(a)*(.76+.05*j),.18,sandZ+Math.sin(a)*.61,.085,.085,.085,['#ae5034','#c1733c','#b74e32'][j%3],-1.55,0,a)}
world=gardenRoot;
function parasol(x,y,z,r,h){rod(x,y,z,x,y+h,z,.028,wood);let verts=[],ind=[];for(let i=0;i<40;i++){let a=i*TAU/40,b=(i+1)*TAU/40;let pp=[[x,y+h+.39*r,z],[x+Math.cos(a)*r,y+h,z+Math.sin(a)*r],[x+Math.cos(b)*r,y+h,z+Math.sin(b)*r]];face(pp,[0,1,2],i%2?'#bb3c2c':'#c84b36');rod(x,y+h+.405*r,z,pp[1][0],y+h+.008,pp[1][2],.009,'#a96344')}cyl(x,y+h+.44*r,z,.045,.09,ink)}
atSite('rest',()=>{parasol(.48,.12,-.98,1.08,2.07);box(.32,.51,-.63,1.65,.13,.57,wood);box(.3,.593,-.63,1.23,.052,.59,red);for(let a of [-1,1])for(let b of [-1,1])box(.32+a*.65,.29,-.63+b*.18,.11,.43,.12,wood);});
function fence(x,z,len,along=false){let P=(u,v)=>along?[x+v,z+u]:[x+u,z+v];for(let i=0;i<=len/.16;i++){let [X,Z]=P(i*.16,0),h=R(.52,.62);cyl(X,h/2+.1,Z,.045,h,'#b6a16c');if(i%5===0)cyl(X,.44,Z,.052,.09,'#665b43')}for(let h of [.29,.56]){let [X,Z]=P(0,.04),[xx,zz]=P(len,.04);rod(X,h,Z,xx,h,zz,.033,'#8e8054')}}
world=sites.entry;
fence(-6.83,5.81,.49);fence(-4.81,5.81,1.62);fence(-6.78,2.53,3.27,true);
for(let a of [-1,1]){box(-5.54+a*.71,1,5.84,.14,1.83,.15,wood);box(-5.54+a*.71,.21,5.84,.24,.24,.26,'#939082')}box(-5.54,1.83,5.84,1.78,.14,.26,lightwood);roof(-5.54,1.91,5.84,1.82,.93,.31);cyl(-4.5,.53,6.13,.07,.84,ink);cyl(-4.5,1.04,6.13,.18,.54,red);ball(-4.5,1.32,6.13,.21,.09,.21,red);sign(-4.5,1.13,6.312,.21,.16,'〒','#b34330','#fff1ce');
function bicycle(x,z,s){for(let a of [-1,1]){ring(x+a*.41*s,.37*s+.1,z,.31*s,.034*s,ink);ring(x+a*.41*s,.37*s+.1,z,.28*s,.012*s,'#bbc2b9');for(let k=0;k<12;k++){let t=k*TAU/12;rod(x+a*.41*s,.37*s+.1,z,x+(a*.41+.28*Math.cos(t))*s,.1+(.37+.28*Math.sin(t))*s,z,.006*s,'#b7b6a7')}}let P=(a,b)=>[x+a*s,.1+b*s,z];pipe([P(-.41,.37),P(-.16,.76),P(.07,.35),P(-.41,.37)],.024*s,'#527566');pipe([P(.07,.35),P(.29,.79),P(-.16,.76)],.023*s,'#527566');pipe([P(.41,.37),P(.29,.79),P(.26,.94),P(.15,.94)],.018*s,ink);ball(x-.17*s,.91*s,z,.12*s,.034*s,.07*s,wood);pot(x+.42*s,.74*s,z,.13*s,'#ae936a')}bicycle(-3.96,6.09,1);
// Courses of separate voussoirs leave a visible well shaft beneath the half-open lid.
function wellStone(inner,outer,span,h){
  const sh=new T.Shape();
  sh.moveTo(inner,0);sh.lineTo(outer,0);sh.absarc(0,0,outer,0,span,false);sh.lineTo(inner*Math.cos(span),inner*Math.sin(span));sh.absarc(0,0,inner,span,0,true);sh.closePath();
  const g=new T.ExtrudeGeometry(sh,{depth:h,bevelEnabled:true,bevelSegments:1,bevelSize:.009,bevelThickness:.008,curveSegments:16});g.rotateX(-Math.PI/2);return g;
}
for(let row=0;row<4;row++){
  const blocks=row===3?12:10,h=row===3?.121:.164,y=.127+row*.172;
  const geom=wellStone(row===3?.337:.346,row===3?.497:.466,TAU/blocks-.026,h);
  for(let k=0;k<blocks;k++){let a=TAU*(k+.47*(row%2))/blocks;obj(geom,-5.87,y,4.03,1,1,1,['#9a9e8e','#a0a190','#8b9587','#a6a594'][(k*3+row)%4],0,a,0,graniteFinish)}
}
cyl(-5.87,.314,4.03,.343,.016,'#72958f',1,36);
for(let j=0;j<4;j++){let X=-6.22+j*.089;plank(X,.804,4.03,.087,.044,.745,j%2?'#ad8b65':'#9f805d')}
for(let z of [3.76,4.31])box(-6.084,.829,z,.354,.028,.051,wood);
for(let a of [-1,1])box(-5.87+a*.49,1.08,4.03,.057,.85,.06,wood);rod(-6.39,1.45,4.03,-5.32,1.45,4.03,.081,lightwood);
world=gardenRoot;
let flowerPalette=['#b83d43','#d26238','#e58c4b','#eeb44a','#a584c3','#7c74ab','#ece4be'];
function bloom(x,y,z,s,c,kind=0){rod(x,y,z,x,y+s,z,.009,'#5e7749',.58,5);for(let i=0;i<3;i++){let a=i*2.4;ball(x+.033*Math.cos(a),y+s*(.35+.16*i),z+.032*Math.sin(a),.025,.014,.076,'#6a885a',.48,a)}let petals=kind===1?12:kind===2?5:8;for(let k=0;k<petals;k++){let a=k*TAU/petals;ball(x+Math.cos(a)*.043,y+s+Math.sin(a)*.021,z+Math.sin(a)*.038,.042,kind===1?.043:.021,.029,c,.3,a)}ball(x,y+s+.025,z,.028,.023,.028,kind===2?ink:'#dcaa52')}
world=sites.upper;
for(let step of [1,5,11,14])for(let side of [-1,1])for(let j=0;j<5;j++){let X=axisX+side*(1.32+R(-.09,.09)),Z=stairFront-step*stairRun+R(-.1,.1);bloom(X,stairLevel(step)+.099,Z,R(.18,.32),pick(['#c73f30','#d54b32']),2)}
world=gardenRoot;
atSite('bonsai',()=>{for(let j=0;j<3;j++){let y=.36+j*.22,z=2.66-j*.34;box(-4.38,y,z,2.37,.095,.36,wood);for(let k=0;k<5;k++){let x=-5.3+k*.46;pot(x,y+.05,z,.15,pick(['#8f6550','#aa795a','#737b73']));if(j===2){rod(x,y+.16,z,x+.06,y+.5,z,.04,wood,.5);for(let f=0;f<5;f++)rock(x+R(-.12,.15),y+.51+R(-.08,.1),z+R(-.08,.08),.12,.065,.11,'#647a4e')}else for(let f=0;f<7;f++)bloom(x+R(-.09,.09),y+.18,z+R(-.08,.08),R(.1,.23),flowerPalette[(k+j+3)%7],1)}}});
// Slice the tart against the front face of the landscape; the server draws one sector outwards.

const pastryGrain=canvasTex(384,192,(p,w,h)=>{
  p.fillStyle='#f7e9cc';p.fillRect(0,0,w,h);
  let state=7623;function noise(){state=(1664525*state+1013904223)>>>0;return state/4294967296}
  for(let k=0;k<5100;k++){
    const x=noise()*w,y=noise()*h,r=.3+noise()**3*2.3;
    p.fillStyle=noise()>.4?'#c49a675f':'#fff6d9b3';p.beginPath();p.ellipse(x,y,r*1.36,r*.55,noise()*1.8,0,TAU);p.fill();
  }
  for(let k=0;k<180;k++){let x=noise()*w,y=noise()*h;p.strokeStyle='#b8875a66';p.lineWidth=.65;p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+2.9,y-1.2,x+5.1,y-.2);p.stroke()}
});pastryGrain.wrapS=pastryGrain.wrapT=T.RepeatWrapping;
function flutedPastry(start,end,dx,dz){
  const cx=px+dx,cz=pz+dz;
  const pos=[],uv=[],colors=[],indices=[],cuts=[[],[]];
  const tones=['#b98449','#c28d50','#deb16a','#edc888','#f1d397','#e8bc79','#d3a25f'];
  function profile(angle,layer){
    const flute=.5+.5*Math.cos(angle*80),roast=.95+.055*Math.sin(7*angle+.49)+.022*Math.cos(23*angle);
    const r=pr+[.032,.089,.116,.061,-.014,-.075,-.097][layer]+flute*[.015,.046,.057,.061,.049,.032,.021][layer];
    const h=[.152,.286,.494,.566,.575,.535,.445][layer]+flute*[.0,.011,.037,.057,.055,.044,.025][layer];
    const c=new T.Color(tones[layer]).multiplyScalar(roast*(.98+.045*flute));
    return [cx+r*Math.cos(angle),h,cz+r*Math.sin(angle),angle*2.8,layer/6,c.r,c.g,c.b];
  }
  function clippedFace(input){
    const pts=[];
    for(let i=0;i<input.length;i++){
      const A=input[i],B=input[(i+1)%input.length];if(A[2]<=frontCut)pts.push(A);
      if((A[2]<frontCut)!==(B[2]<frontCut)){
        const t=(frontCut-A[2])/(B[2]-A[2]),p=A.map((v,k)=>v+t*(B[k]-v));p[2]=frontCut;pts.push(p);cuts[p[0]<cx?0:1].push([p[0],p[1]]);
      }
    }
    if(pts.length<3)return;
    const base=pos.length/3;
    for(const v of pts){pos.push(v[0],v[1],v[2]);uv.push(v[3],v[4]);colors.push(v[5],v[6],v[7])}
    for(let i=1;i<pts.length-1;i++)indices.push(base,base+i,base+i+1);
  }
  const n=Math.ceil((end-start)*114);
  for(let i=0;i<n;i++){
    const a=start+(end-start)*i/n,b=start+(end-start)*(i+1)/n;
    for(let k=0;k<6;k++)clippedFace([profile(a,k),profile(b,k),profile(b,k+1),profile(a,k+1)]);
  }
  for(const angle of [start,end])clippedFace(Array.from({length:7},(_,k)=>profile(angle,k)));
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setIndex(indices);geo.computeVertexNormals();
  mesh(geo,0,0,0,0,new T.MeshToonMaterial({map:pastryGrain,vertexColors:true,side:T.DoubleSide,gradientMap:grad}));
  for(let vertices of cuts){
    if(vertices.length<3)continue;
    let unique=Array.from(new Map(vertices.map(v=>[v.map(x=>x.toFixed(5)).join('/'),v])).values());
    const mx=unique.reduce((n,p)=>n+p[0],0)/unique.length,my=unique.reduce((n,p)=>n+p[1],0)/unique.length;
    unique.sort((a,b)=>Math.atan2(a[1]-my,a[0]-mx)-Math.atan2(b[1]-my,b[0]-mx));
    let g=polygon(unique);
    const tex=g.attributes.uv;for(let j=0;j<tex.count;j++)tex.setXY(j,tex.getX(j)*3.1,tex.getY(j)*2.8);
    mesh(g,0,0,0,frontCut+.0007,new T.MeshToonMaterial({map:pastryGrain,color:'#e0ad69',gradientMap:grad,side:T.DoubleSide}));
  }
}
function tartSector(a,b,dx,dz,cut){
  const center=[px+dx,pz+dz],points=cut?tartFootprint(a,b,dx,dz):basinFoot;
  const shape=footprintShape(points),water=mesh(new T.ShapeGeometry(shape),'#68bcc6',0,waterY,0);
  water.rotation.x=-Math.PI/2;water.userData.separatedSlice=cut;
  if(!cut){
    for(const [bottom,height,color] of [[-1.162,.226,'#cc9756'],[-.936,.078,'#edc88a']]){
      const crust=mesh(new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}),0,0,bottom,0,new T.MeshToonMaterial({map:pastryGrain,color,side:T.DoubleSide,gradientMap:grad}));
      crust.rotation.x=-Math.PI/2;
    }
  }
  const shell=[],shellIndices=[],shellColors=[];
  const deep=new T.Color('#528f9b').toArray(),rim=new T.Color('#86c7bd').toArray();
  for(let i=0;i<points.length;i++){
    const A=points[i],B=points[(i+1)%points.length],front=A[1]===frontCut&&B[1]===frontCut;
    if(front&&!cut){
      const glazing=mesh(new T.PlaneGeometry(Math.abs(A[0]-B[0]),waterY-poolFloor),0,(A[0]+B[0])*.5,(waterY+poolFloor)*.5,frontCut+.002,new T.MeshBasicMaterial({color:'#99d8d8',transparent:true,opacity:.15,side:T.DoubleSide,depthWrite:false}));
      glazing.castShadow=false;glazing.receiveShadow=false;glazing.renderOrder=2;
      continue;
    }
    const bottom=cut?.145:poolFloor;
    const k=shell.length;
    shell.push([A[0],bottom,A[1]],[B[0],bottom,B[1]],[B[0],waterY,B[1]],[A[0],waterY,A[1]]);
    shellIndices.push(k,k+1,k+2,k,k+2,k+3);
    if(!cut)shellColors.push(...deep,...deep,...rim,...rim);
  }
  const lining=face(shell,shellIndices,'#73b8b7');
  if(!cut){
    lining.geometry.setAttribute('color',new T.Float32BufferAttribute(shellColors,3));
    lining.material.dispose();lining.material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});
    lining.castShadow=false;
  }
  if(cut)flutedPastry(a,b,dx,dz);
  else{
    const inlet=Math.atan2(3.17-pz,.61-px)+TAU;
    flutedPastry(a,inlet-.122,dx,dz);flutedPastry(inlet+.122,b,dx,dz);
  }
}
tartSector(.68,TAU+.09,0,0,false);tartSector(.11,.66,.57,.31,true);
const limeMap=canvasTex(256,256,(p,w)=>{p.translate(128,128);p.fillStyle='#6f9442';p.fillRect(-128,-128,256,256);for(let [r,c] of [[121,'#cfda7e'],[116,'#f5e7ad'],[110,'#d6dd81']]){p.fillStyle=c;p.beginPath();p.arc(0,0,r,0,TAU);p.fill()}for(let j=0;j<10;j++){let a=j*TAU/10,b=a+.58;p.fillStyle=j%2?'#c3d272':'#abbf65';p.beginPath();p.moveTo(5*Math.cos(a+.3),5*Math.sin(a+.3));p.arc(0,0,107,a+.025,b);p.fill();for(let k=0;k<120;k++){let t=R(a+.027,b),r=Math.sqrt(rand())*96+9;p.fillStyle=pick(['#eff0a7aa','#e6e295cc','#cbd881']);p.beginPath();p.ellipse(Math.cos(t)*r,Math.sin(t)*r,3.4,1.4,t,0,TAU);p.fill()}}});
const limeMat=new T.MeshToonMaterial({map:limeMap,gradientMap:grad,side:T.DoubleSide}),limeG=new T.CircleGeometry(1,36);
function lime(x,y,z,r,front=false){
  const face=mesh(limeG,0,x,y,z,limeMat);
  face.rotation.x=front?0:-Math.PI/2;
  face.rotation.z=R(0,6);face.scale.setScalar(r);
  const rind=mesh(new T.CylinderGeometry(r,r,front?.031:.066,36),'#97ad58');
  const fruit=new T.Group();world.add(fruit);fruit.position.set(x,y,z);
  fruit.add(face,rind);
  const phase=x*1.46+z;
  if(front){
    face.position.set(0,0,.017);rind.position.set(0,0,0);rind.rotation.x=Math.PI/2;
    anim.push(t=>{fruit.position.y=y+.012*Math.sin(t*.54+phase);fruit.rotation.set(-.26+.045*Math.sin(t*.3+phase),.29*Math.sin(phase)+.04*Math.cos(t*.23),.12*Math.cos(phase))});
  }else{
    face.position.set(0,0,0);rind.position.set(0,-.034,0);
    anim.push(t=>{
      fruit.position.set(x+.011*Math.sin(t*.31+phase),y+.008*Math.sin(t*.84+phase),z+.012*Math.cos(t*.32+phase));
      fruit.rotation.set(.016*Math.sin(t*.64+phase),.027*Math.sin(t*.23+phase),.014*Math.cos(t*.52+phase));
    });
  }
  return face;
}
for(let [x,z,r] of [[-1.14,5.43,.34],[-.66,5.09,.3],[-.11,4.81,.34],[.48,4.62,.38],[1.04,4.24,.26],[1.63,5.55,.26],[-.39,6.42,.32],[2.2,6.33,.19]])lime(x,.557,z,r);lime(.15,-.21,6.71,.192,true);lime(1.26,-.49,6.82,.16,true);
let st=polygon(Array.from({length:10},(_,i)=>[Math.sin(i*Math.PI/5)*(i%2?.51:1),Math.cos(i*Math.PI/5)*(i%2?.51:1)]));
for(let [x,z,r] of [[.55,5.74,.23],[-1.32,4.82,.17],[1.43,6.57,.21],[-.32,3.79,.2]]){obj(st,x,.551,z,r,r,r,'#eac15b',-Math.PI/2);obj(st,x,.555,z,r*.75,r*.75,r,'#f4d97e',-Math.PI/2);ball(x,.56,z,.024,.012,.017,wood)}
for(let i=0;i<88;i++){let a=R(0,TAU),r=Math.sqrt(rand())*2.07,x=px+r*Math.cos(a),z=pz+r*Math.sin(a);if(z>6.99||a<.68)continue;if(i%7===0){ball(x,.55,z,.078,.062,.079,'#545d8a');ring(x,.61,z,.026,.009,'#3f4a70',1.57)}else if(i%4===0)leaf(x,.536,z,R(.08,.16),i%2,null,true);else ball(x,.502,z,R(.03,.19),.004,.012,'#bce3cf')}
const swimPath=new T.CatmullRomCurve3([
  [-1.51,.53],[-1.53,-.51],[-.96,-1.30],[.04,-1.42],[1.12,-1.16],[1.42,-.67],
  [.86,-.47],[-.11,-.41],[-.47,.03],[-.28,.54],[.34,.91],[.61,1.25],
  [.11,1.31],[-.54,1.17],[-1.03,1.04]
].map(([x,z])=>V(px+x,0,pz+z)),true);
const fishViewCentre=V(px,.42,pz);
// Body colour, scales and lateral markings share the curved skin of each fish.
const koiSkin=[0,1,2].map(variant=>canvasTex(512,256,(p,w,h)=>{
  p.fillStyle=variant===2?'#e5b563':'#f0e3c4';p.fillRect(0,0,w,h);
  const marks=variant===0?[[.19,.055,.072,.22],[.36,-.058,.081,.25],[.51,.077,.103,.26],[.72,-.021,.091,.31],[.842,.044,.079,.22]]:
    variant===1?[[.25,-.024,.083,.27],[.443,.097,.112,.23],[.57,-.101,.084,.19],[.817,.016,.093,.275]]:
    [[.17,.032,.091,.21],[.38,-.091,.112,.248],[.63,.087,.113,.26],[.79,-.051,.096,.24]];
  marks.forEach(([u,v,rx,ry],k)=>{
    for(let wrap=-1;wrap<=1;wrap++){
      const xx=u*w,yy=(v+wrap)*h;
      p.fillStyle=variant===2?['#c98e42','#d69845','#dfaa50'][k%3]:['#c34a32','#ca5438','#be4931'][k%3];
      p.beginPath();for(let j=0;j<=38;j++){let a=j*TAU/38,shape=1+.19*Math.sin(3*a+k)+.11*Math.cos(5*a+variant);p.lineTo(xx+w*rx*shape*Math.cos(a),yy+h*ry*shape*Math.sin(a))}p.closePath();p.fill();
    }
  });
  p.lineWidth=1.1;
  for(let row=0;row<21;row++)for(let col=0;col<29;col++){
    const x=col*16+(row%2)*8,y=row*12.8;let angle=TAU*y/h;
    p.strokeStyle=Math.cos(angle)>.38?'#917d5d72':'#b2a18365';
    p.beginPath();p.moveTo(x+4,y-5);p.quadraticCurveTo(x-8,y,x+4,y+5);p.stroke();
  }
}));
const fishLengths=[-.304,-.264,-.211,-.143,-.066,.023,.094,.159,.219,.251,.272];
const fishWidths=[.015,.024,.043,.067,.082,.09,.088,.077,.059,.043,.017];
const fishHeights=[.019,.032,.047,.067,.077,.081,.077,.068,.052,.036,.014];
const koiBody=(()=>{
  const pos=[],uv=[],ids=[],morph=[],sides=24;
  for(let i=0;i<fishLengths.length;i++)for(let j=0;j<=sides;j++){
    const u=(fishLengths[i]+.304)/.576,v=j/sides,a=v*TAU;
    let x=fishLengths[i],y=fishHeights[i]*Math.cos(a),z=fishWidths[i]*Math.sin(a);
    pos.push(x,y,z);uv.push(u,v);morph.push(0,0,.054*(1-u)**3);
    if(i&&j){let n=i*(sides+1)+j;ids.push(n,n-sides-1,n-sides-2,n,n-sides-2,n-1)}
  }
  let geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ids);geo.computeVertexNormals();geo.morphTargetsRelative=true;geo.morphAttributes.position=[new T.Float32BufferAttribute(morph,3)];return geo;
})();
function koi(x,y,z,s,a,front=false){
  const variant=front?(x<0?2:0):Math.round(a/2.4)%3,g=new T.Group();world.add(g);
  const material=new T.MeshToonMaterial({map:koiSkin[variant],gradientMap:grad,side:T.DoubleSide});
  const body=new T.Mesh(koiBody,material);body.castShadow=false;g.add(body);
  const finColor=variant===2?'#d6ae69':'#ddc7a4',fins=new T.MeshToonMaterial({color:finColor,gradientMap:grad,side:T.DoubleSide});
  const tail=new T.Group();tail.position.x=-.284;g.add(tail);
  function membrane(parent,xyz,index,material){
    let geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(xyz.flat(),3));geo.setIndex(index);geo.computeVertexNormals();let o=new T.Mesh(geo,material);parent.add(o);return o;
  }
  membrane(tail,[[.006,.025,0],[-.069,.067,.004],[-.122,.106,.013],[-.111,.059,.011],[-.075,0,.018],[-.119,-.075,.014],[-.133,-.098,.012],[-.056,-.057,.004],[.006,-.024,0]], [0,1,4,1,2,3,1,3,4,0,4,8,8,4,7,4,5,7,5,6,7],fins);
  membrane(g,[[.099,.074,0],[.018,.127,-.007],[-.062,.116,-.012],[-.158,.066,-.004],[-.16,.051,0],[.05,.077,.006]],[0,1,5,1,2,5,2,3,5,3,4,5],fins);
  const eyeMat=new T.MeshBasicMaterial({color:'#373e36'}),iris=new T.MeshToonMaterial({color:'#c1a86b',gradientMap:grad});
  function ellipsoid(px,py,pz,sx,sy,sz,mat){let o=new T.Mesh(sphereG,mat);o.position.set(px,py,pz);o.scale.set(sx,sy,sz);g.add(o);return o}
  const pectorals=[];
  for(let side of [-1,1]){
    let fin=new T.Group();fin.position.set(.087,-.012,side*.069);g.add(fin);pectorals.push(fin);
    membrane(fin,[[0,.007,0],[.026,-.005,side*.037],[.009,-.017,side*.094],[-.034,-.019,side*.117],[-.061,-.015,side*.096],[-.066,-.009,side*.048],[-.033,.001,0]], [0,1,6,1,2,6,2,3,6,3,4,6,4,5,6],fins);
    ellipsoid(.197,.021,side*.062,.017,.017,.009,iris);ellipsoid(.199,.021,side*.069,.010,.012,.005,eyeMat);
    membrane(g,[[.241,-.018,side*.032],[.255,-.023,side*.038],[.262,-.041,side*.049],[.245,-.022,side*.036]],[0,1,2,0,2,3],fins);
  }
  g.scale.setScalar(s);
  anim.push(t=>{
    if(front){
      const phase=t*.21+a;
      g.position.set(x+.29*Math.sin(phase),y+.063*Math.sin(phase*.69+a),z+.095*Math.cos(phase));
      g.rotation.set(.075*Math.sin(phase),a+.26*Math.cos(phase),.036*Math.sin(phase*.8));
    }else{
      const index=Math.round(a/2.4),near=viewerAttention(fishViewCentre,7.1,t);
      const u=(t*.023+(index<4?.06:.54)+(index%4)*.043+.011*Math.sin(t*.25+a)*near)%1;
      const pathPoint=swimPath.getPointAt(u),direction=swimPath.getTangentAt(u);
      const sideways=.084*Math.sin(a)+near*.147*Math.sin(index*1.7+.24);
      let X=pathPoint.x-sideways*direction.z,Z=pathPoint.z+sideways*direction.x;
      let heading=Math.atan2(-direction.z,direction.x),approach=0;
      for(const impact of pondVisitors){
        const time=(t+impact.phase)%31,dist=Math.hypot(X-impact.x,Z-impact.z);
        if(time<4||time>11.9||dist>.83)continue;
        approach=Math.sin((time-4)/7.9*Math.PI)**2*(1-dist/.83)*.71;
        const goal=Math.atan2(Z-impact.z,impact.x-X);
        heading+=Math.atan2(Math.sin(goal-heading),Math.cos(goal-heading))*approach;
        X+=(impact.x-X)*approach;Z+=(impact.z-Z)*approach;break;
      }
      const phase=u*TAU;
      g.position.set(X,.323+.041*Math.sin(phase*2+a)+.037*approach,Z);
      g.rotation.set(.06*Math.sin(phase),heading,0);
    }
    const beat=Math.sin(t*3.15+a);body.morphTargetInfluences[0]=beat;tail.position.z=.046*beat;tail.rotation.y=.46*Math.sin(t*3.15+a-.48);pectorals.forEach((fin,i)=>fin.rotation.x=(i?1:-1)*.12*Math.sin(t*1.83+a));
  });
}
for(let j=0;j<7;j++){let a=j*2.4;koi(px+Math.cos(a)*1.18,.523,pz+Math.sin(a)*1.03,R(.7,1),a)}koi(.69,-.346,6.76,1.04,-.18,true);koi(-.47,-.489,6.71,.77,.26,true);
for(let j=0;j<20;j++){let x=R(-.82,1.74),y=R(-.75,.33);ball(x,y,6.62+.284*Math.sin(j*2.4),.012,.016,.012,'#b1dacf')}
lantern(-2.07,.1,5.22,.85,true);for(let i=0;i<6;i++)grass(2.59+R(-.31,.3),.11,4.07+R(-.2,.25),R(.55,.87),true);
for(let a of [-1,1])for(let b of [-1,1])rod(-2.36+a*.24,.1,6.3+b*.19,-2.36-a*.22,.55,6.3+b*.19,.035,wood);box(-2.36,.56,6.3,.68,.069,.51,'#9e7451');box(-2.37,.61,6.31,.42,.032,.3,paper,0,.18);box(-2.37,.63,6.31,.008,.009,.3,wood,0,.18);
for(let j=0;j<9;j++)rock(-2.27+R(-.3,.31),.13,4.8+R(-.31,.31),R(.06,.19),R(.04,.14),R(.08,.15),sage);
atSite('junction',()=>{for(let i=0;i<4;i++){let x=3.35+i*.28,z=2.34;ball(x,.37,z,.109,.18,.105,'#92998b');ball(x,.58,z,.118,.122,.112,'#a4a89b');ball(x,.671,z,.121,.069,.115,red);box(x,.455,z+.104,.15,.1,.016,red)}
for(let a of [-1,1])box(3.56+a*.65,.83,2.02,.06,1.48,.063,wood);for(let j=0;j<3;j++){box(3.56,.77+j*.28,2.02,1.36,.037,.05,wood);for(let k=0;k<5;k++){let x=3.02+k*.27,y=.77+j*.28;let g=new T.Group();world.add(g);g.position.set(x,y,2.065);for(let u=0;u<4;u++){let o=new T.Mesh(polygon([[0,0],[.11,.05],[.064,.123]]),new T.MeshBasicMaterial({color:pick([red,paper,'#d69946','#e2ba64']),side:T.DoubleSide}));o.rotation.z=u*TAU/4;g.add(o)}anim.push(t=>{const phase=((t+42-(4-k)*.16)%42)/42,progress=clamp((phase-.138)/.166,0,1);g.rotation.z=k*.73+j*.32+TAU*3*progress*progress*(3-2*progress)+.05*Math.sin(t*.6+k)})}}
});
