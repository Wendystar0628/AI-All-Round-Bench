// All mountain routes are sampled once so that the earthworks and the ride share a centreline.
const mountainRoutes=new Map();
function mountainRoute(id,points,rx,ry){
 const path=tablePath(spline(points),.155);
 mountainRoutes.set(id,{path,rx,ry});
}
mountainRoute('drop',[[-8.5,62.05,-85.5],[-12.25,60.5,-84.3],[-17.0,52.5,-81.7],[-19.75,33,-78.5],[-20.6,14,-74.4],[-21.25,5.1,-68],[-21.35,2.45,-62.5],[-21.75,2.15,-52.8]],1.65,1.45);
for(let k=0;k<2;k++){
 const pts=[[k?-8.7:5.4,46.95,-90.9]];
 for(let j=0;j<=46;j++){const u=j/46,a=k*Math.PI-u*TAU,cx=-2.2+.8*u,cz=-91+24*u,r=11.25-2.5*u;pts.push([cx+r*Math.cos(a),46.5-29.3*u,cz+r*Math.sin(a)])}
 if(k)pts.push([-8.1,11.4,-61.5],[-3.2,6.5,-56.8],[4.7,2.14,-51.8]);
 else pts.push([12.7,11.4,-66],[17.1,5.0,-59.3],[16.8,2.14,-52.1]);
 mountainRoute(k?'sunTwist':'skyTwist',pts,1.6,1.6);
}
for(let lane=0;lane<6;lane++){
 const dx=(lane-2.5)*2.75;
 const pts=[[14,46.95,-86],[14,46.75,-82],[18,42,-78.5],[24,32,-75],[29,27.3,-72.6],[32,27,-70.7],[36.25,22,-67.8],[40,15.5,-64.7],[42,15.25,-62.6],[45,10.4,-59.5],[47.8,3.6,-55.5],[48,1.71,-50.5]];
 mountainRoute('race'+lane,pts.map(([x,y,z])=>[x+dx,y,z]),1.38,.85);
}
mountainRoute('night',[[-98,43.5,-89],[-109,40,-99],[-125,36,-100],[-134,31,-90],[-128,27,-83],[-116,24,-86],[-106,21,-93],[-116,16,-97],[-136.5,10,-87.5],[-135.5,7,-75],[-131,5,-64],[-124,2.12,-52.5]],1.75,1.75);
for(let j=0;j<3;j++){
 const dx=(j-1)*2.5,pts=[[64.2,20.7,-77.75],[63.7,20.4,-75.6],[62.3,16.3,-71],[62.5,15.6,-68.5],[63.4,11,-64.8],[63.8,10.8,-62.6],[65.2,5.5,-58.1],[66.4,1.8,-51.9]];
 mountainRoute('ripple'+j,pts.map(([x,y,z])=>[x+dx-4.5,y,z]),1.13,.85);
}
{
 const pts=[[88.1,35.65,-87.8],[93.6,34.8,-90.4],[98.9,33.4,-91.3]];
 for(let i=0;i<=35;i++){const u=i/35,a=-PI/2+TAU*1.28*u;pts.push([104+9.1*Math.cos(a),32.2-19.3*u,-82+7.8*u+9.1*Math.sin(a)])}
 pts.push([112.6,9.8,-65],[110.4,4.8,-58.3],[107.4,2.0,-51.7]);
 const centre=tablePath(spline(pts),1.10);
 for(let j=0;j<2;j++){
 const off=j?2.19:-2.19,points=centre.p.map((p,i)=>[p.x+centre.r[i].x*off,p.y,p.z+centre.r[i].z*off]);
 mountainRoute('duo'+j,points,1.52,1.52);
 }
}
mountainRoute('coaster',[[81,35.65,-94],[86,36.2,-99.3],[100,34.25,-105.3],[116,29,-103],[125,20,-91],[132,29.6,-78],[140,28,-70],[146,13.7,-57],[147,10.8,-49],[146.5,22.8,-36],[143,23.7,-31],[139,12.6,-20],[135,8.75,-13],[132,15.9,-3],[127,15,4],[123,7.3,13],[121,2.15,19]],2.1,1.5);
{
 const points=[[-7,61,-90],[-14,55,-92],[-27,41,-88],[-42,34,-81],[-46,22,-76],[-40,19,-73]];
 for(let i=0;i<=32;i++){const a=i*TAU/32;points.push([-31+10.25*Math.sin(a),29.75-10.25*Math.cos(a),-72+5.5*i/32])}
 points.push([-20,18.6,-65.8],[-16.6,14.5,-62.8],[-14.8,8.8,-58.4],[-12,3.8,-54.9],[-10,2.12,-51.9]);
 mountainRoute('halo',points,1.65,1.65);
}
mountainRoute('funnelIn',[[-98,42.9,-85],[-109,40.25,-83],[-112,39,-78],[-118,37.5,-73],[-128.1,37.0,-67.5],[-135.0,34.1,-64.6]],1.6,1.6);
mountainRoute('funnelOut',[[-127.5,19,-80],[-133,15,-84],[-143,13,-78],[-145,9,-66],[-141,5,-57],[-133,2.1,-52]],1.85,1.45);
mountainRoute('bowlIn',[[-88.5,42.6,-86],[-77,37,-88],[-65,31,-85],[-57,26.5,-77],[-57.8,25,-68],[-61,24,-61]],1.6,1.45);
mountainRoute('bowlOut',[[-72,12.85,-64],[-71,9,-62],[-73,6,-57],[-76,2.1,-51.8]],1.6,1.4);
mountainRoute('boardIn',[[-98,29.2,-83],[-103,28.5,-79],[-109,26.3,-75],[-109.6,23.8,-69],[-109.5,23.6,-63.3]],2.35,1.3);
mountainRoute('family',[[79,35.6,-84.3],[70,35,-86],[58,32.7,-82],[55,28.4,-74],[60.5,24,-68.5],[69,21.8,-68],[81,18.2,-73],[92,15.1,-69],[93,10.4,-61],[86,3.05,-52.7]],3.05,1.85);
mountainRoute('boardOut',[[-98,7.87,-58.2],[-98.0,6.15,-55.8],[-98.2,2.85,-52.8],[-98.4,2.05,-50.8]],2.10,1.35);


// Keep the water channel on the inside of the vertical loop, including its inverted crown.
{
 const path=mountainRoutes.get('halo').path;
 for(let i=0;i<=path.n;i++){
  const p=path.p[i],d=path.t[i];
  if(p.z< -72.05||p.z> -66.40||p.x< -42.1||p.x> -20.3)continue;
  const side=vec(0,0,1).addScaledVector(d,-d.z).normalize();
  path.r[i].copy(side);path.up[i].crossVectors(side,d).normalize();
 }
}
function terrainClearances(g,n,m){
 const limit=new Float32Array(n*m).fill(Infinity);
 for(const {path,rx,ry} of mountainRoutes.values()){
  const reach=rx+5.25;
  for(let k=0;k<=path.n;k+=3){
   const p=path.p[k];if(p.y-ry>24)continue;
   const x0=Math.max(0,Math.floor((p.x-reach-g.left)/g.step)),x1=Math.min(n-1,Math.ceil((p.x+reach-g.left)/g.step));
   const z0=Math.max(0,Math.floor((p.z-reach-g.back)/g.step)),z1=Math.min(m-1,Math.ceil((p.z+reach-g.back)/g.step));
   for(let j=z0;j<=z1;j++)for(let i=x0;i<=x1;i++){
    const dx=g.left+(i+.5)*g.step-p.x,dz=g.back+(j+.5)*g.step-p.z;
    const d=Math.hypot(dx,dz);if(d>reach)continue;
    const ceiling=p.y-ry-.78+Math.max(0,d-rx-.5)*1.65;
    limit[j*n+i]=Math.min(limit[j*n+i],Math.floor(ceiling*4)/4);
   }
  }
 }
 return limit;
}
// Spatial index for testing piers, planting and footbridges against the elevated channels.
const trackCells=new Map();
for(const route of mountainRoutes.values()){
 const {path,rx}=route;
 for(let i=0;i<=path.n;i+=5){const p=path.p[i],reach=rx+.9;
  for(let x=Math.floor((p.x-reach)/4);x<=Math.floor((p.x+reach)/4);x++)
  for(let z=Math.floor((p.z-reach)/4);z<=Math.floor((p.z+reach)/4);z++){
   const key=x*4096+z;if(!trackCells.has(key))trackCells.set(key,[]);
   trackCells.get(key).push({route,i});
  }
 }
}
function clearOfTracks(x,z,bottom,top,pad=.5,own=null,station=-1000){
 const reach=Math.max(0,pad-.7);
 for(let a=Math.floor((x-reach)/4);a<=Math.floor((x+reach)/4);a++)
 for(let b=Math.floor((z-reach)/4);b<=Math.floor((z+reach)/4);b++){
  const entries=trackCells.get(a*4096+b);if(!entries)continue;
  for(const {route,i} of entries){
   if(route.path===own&&Math.abs(station-i)<45)continue;
   const p=route.path.p[i];
   if(p.y-route.ry>top||p.y+route.ry<bottom)continue;
   if(Math.hypot(x-p.x,z-p.z)<route.rx+pad)return false;
  }
 }
 return true;
}
