// The sanctuary axis and the studio footpath meet on the level forecourt.
// Their terrain surfaces and bordering stones are built from the same centrelines.
const gravelMap=canvasTex(512,512,(p,w,h)=>{
  p.fillStyle='#d6d0bd';p.fillRect(0,0,w,h);
  for(let i=0;i<27000;i++){
    let x=R(0,w),z=R(0,h),r=R(.44,2.9);
    p.fillStyle=pick(['#b1aa967d','#f4ebd48a','#a09c9170','#cec6ae','#b9b6a3','#e4ddc8']);
    p.beginPath();p.ellipse(x,z,r,r*R(.36,.73),R(-2,2),0,TAU);p.fill();
  }
});
gravelMap.wrapS=gravelMap.wrapT=T.RepeatWrapping;
function gravelSurface(points,y,tint){
  const g=new T.ShapeGeometry(footprintShape(points)),uv=g.attributes.uv,position=g.attributes.position;
  for(let i=0;i<uv.count;i++)uv.setXY(i,position.getX(i)*.57,position.getY(i)*.57);
  let o=mesh(g,0,0,y,0,new T.MeshToonMaterial({map:gravelMap,color:tint,gradientMap:grad,side:T.DoubleSide}));
  o.rotation.x=-Math.PI/2;o.castShadow=false;
}
const flags=Array.from({length:6},(_,k)=>{
  const shape=new T.Shape(),corners=[[-.50,-.33],[-.39,-.48],[.31,-.49],[.49,-.33],[.48,.35],[.34,.49],[-.38,.48],[-.5,.28]];
  corners.forEach(([x,y],j)=>{x+=.024*Math.cos(j*1.92+k);y+=.017*Math.sin(j*3.4-k);if(j)shape.lineTo(x,y);else shape.moveTo(x,y)});shape.closePath();
  const geo=new T.ExtrudeGeometry(shape,{depth:.058,bevelEnabled:true,bevelThickness:.012,bevelSize:.011,bevelSegments:1,curveSegments:1});geo.rotateX(-Math.PI/2);return geo;
});
const stoneTints=['#b2b3a3','#bbb7a6','#a7ab9b','#c2bdac','#adaea0','#b6b4a6'];
function flagstone(x,y,z,width,depth,turn,i){
  obj(flags[(i+60)%6],x,y,z,width,1,depth,stoneTints[(i+60)%6],0,turn,0,graniteFinish);
}
function walk(points,width,spacing,y,stoneDepth){
  const curve=new T.CatmullRomCurve3(points.map(([x,z])=>V(x,y,z)),false,'centripetal'),length=curve.getLength(),count=Math.max(1,Math.round(length/spacing));
  for(let j=0;j<=count;j++){let u=j/count,pt=curve.getPointAt(u),dir=curve.getTangentAt(u);
    flagstone(pt.x,y,pt.z,width*(.94+.06*Math.sin(j*2.73)),stoneDepth,Math.atan2(dir.x,dir.z)+.073*Math.sin(j*2.1),j);
  }
}
// Bring the gravel avenue to the new foot of the stairs. The moss shoulders stay uninterrupted.
const stairLanding=sitePoint('upper',[axisX,.12,stairFront+.16]);
gravelSurface([[3.75,6.98],[5.59,6.98],[5.66,stairLanding.z-.02],[3.68,stairLanding.z-.02]],.111,'#dedfd4');
for(let i=0;i<15;i++){
  const z=6.77-i*(6.77-stairLanding.z-.12)/14;
  flagstone(axisX,.12,z,1.22,.38,.011*Math.sin(i),i);
  for(let side of [-1,1]){
    if(side===-1&&z>1.32&&z<2.02)continue;
    flagstone(axisX+side*.94,.11,z,.085,.39,0,i+2);
  }
}
world=sites.studio;
gravelSurface([[-6.89,1.86],[-5.24,1.81],[-3.80,1.66],[-2.71,1.99],[-1.27,1.64],[-.07,1.54],[.11,.85],[.07,-4.97],[-6.89,-4.97]],.104,'#ddceb0');
for(let i=0;i<7;i++)flagstone(-6.65+i*.405,.104,1.84-i*.018,.38,.086,0,i);
world=gardenRoot;
walk([[-4.91,6.67],[-4.91,5.45],[-4.68,4.53],[-4.62,3.88],[-4.36,3.16]],.65,.37,.109,.322);
const studioStep=sitePoint('studio',[-2.61,.12,2.02]);
walk([[-4.24,2.88],[-4.02,2.20],[-3.66,1.55],[-3.18,1.00],[studioStep.x-.13,studioStep.z+.22]],.54,.39,.11,.30);
walk([[-3.18,1.00],[-2.66,1.61],[-2.13,2.09],[-1.40,2.44],[-.68,2.38],[-.31,2.24]],.48,.36,.11,.29);
walk([[2.51,2.65],[2.87,2.58],[3.34,2.21],[3.83,1.85],[4.26,1.69]],.48,.36,.11,.29);
world=sites.upper;
for(let i=0;i<4;i++){const x=3.22+i*.57;flagstone(x,terraceY+.003,-2.68,.552,.436,0,i+1)}
walk([[4.67,-2.69],[4.67,-3.02],[4.67,-3.34]],1.37,.32,terraceY+.011,.296);
walk([[5.26,-2.99],[5.71,-3.07],[6.12,-3.29],[6.30,-3.78],[6.34,-4.35],[6.36,-4.68]],.49,.345,terraceY+.008,.30);
walk([[3.86,-2.82],[3.58,-3.16],[3.25,-3.37],[2.90,-3.31]],.48,.33,terraceY+.009,.30);
world=sites.studio;
for(let j=0;j<2;j++){
  const y=.245+j*.214,z=1.45-j*.297;
  plank(-1.25,y,z,1.48,.085,.313,lightwood);
  for(let a of [-1,1])box(-1.25+a*.64,(y+.11)*.5,z,.081,y-.11,.097,wood);
  for(let k=0;k<4;k++){
    const x=-1.80+k*.365;
    pot(x,y+.05,z,.128,pick(['#a67553','#858577','#9f7b60']));
    const col=['#dab546','#f0e4bd','#ab94b8'][Math.min(2,Math.floor(k*.75))];
    for(let n=0;n<5;n++)bloom(x+.064*Math.sin(n*2.4),y+.164,z+.06*Math.cos(n*2.4),.18+.033*Math.cos(n+j),col,1);
  }
}
world=sites.treeGround;
for(let k=0;k<130;k++){
  let a=R(0,TAU),r=Math.sqrt(rand())*1.15,X=.55+r*Math.cos(a),Z=-3.13+r*Math.sin(a);
  if(X>-.11&&Z< -2.42)leaf(X,terraceY+.007,Z,R(.065,.12),1,null,true);
}
world=sites.upper;
for(let i=0;i<5;i++){let zz=-3.92+i*.365;fern(-.195,2.34-i*.069,zz,.29)}
world=gardenRoot;
// Two unbroken moss banks give the paths room to read from above.
function mossBank(x,z,w,d,h){
  let pos=[],idx=[],uv=[];
  for(let row=0;row<=10;row++)for(let k=0;k<=48;k++){
    let a=k*TAU/48,r=row/10,e=1+.059*Math.sin(a*3)+.041*Math.sin(a*5+.7);
    let X=x+w*r*e*Math.cos(a),Z=z+d*r*e*Math.sin(a);
    pos.push(X,.084+h*(1-r*r)**2,Z);uv.push((X+7)/14,(7-Z)/14);
    if(row&&k){let n=row*49+k;idx.push(n,n-1,n-50,n,n-50,n-49)}
  }
  let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();mesh(g,0,0,0,0,new T.MeshToonMaterial({map:mossTex,color:'#f5f5dd',gradientMap:grad,side:T.DoubleSide}));
}
mossBank(-.28,-.32,1.43,1.91,.105);
mossBank(-1.15,.93,.91,.77,.066);
mossBank(2.62,.19,.61,1.18,.075);
mossBank(-2.09,3.39,.62,.48,.065);
mossBank(6.23,4.47,.52,1.69,.057);
