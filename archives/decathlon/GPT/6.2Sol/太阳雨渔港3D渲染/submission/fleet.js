'use strict';
function hullShape(stations,rings,material,g){
 const a=[],ids=[];
 for(const b of rings)for(const [z,w,k] of stations){
   const f=typeof b[2]==='number'?b[2]:1;
   for(const side of [-1,1])a.push(w*b[0]*side,b[1]+k*f,z*(1-(b[3]||0)));
 }
 const n=stations.length*2;
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<stations.length-1;i++){
   const c=j*n+2*i;
   ids.push(c,c+2,c+n,c+2,c+2+n,c+n, c+1,c+1+n,c+3,c+3,c+1+n,c+3+n);
 }
 for(let j=0;j<rings.length-1;j++)for(const k of [0,stations.length-1]){
   const i=j*n+k*2;ids.push(i,i+n,i+1,i+1,i+n,i+n+1)
 }
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute(a,3));geo.setIndex(ids);geo.computeVertexNormals();
 const source=mat(material),m=source.clone();m.onBeforeCompile=source.onBeforeCompile;m.side=T.DoubleSide;
 return mesh(geo,m,0,0,0,g);
}
function deckShape(stations,m,g){
 const s=new T.Shape();
 stations.forEach(([z,w],i)=>i?s.lineTo(w*.918,-z):s.moveTo(w*.918,-z));
 for(let j=stations.length-1;j>=0;j--){const [z,w]=stations[j];s.lineTo(-w*.918,-z)}
 s.closePath();
 const o=mesh(new T.ShapeGeometry(s),m,0,.49,0,g);o.rotation.x=-PI/2;return o;
}
function lifering(x,y,z,r,g,rotate=0){
 const t=group(x,y,z,g);t.rotation.y=rotate;
 tor(0,0,0,r,r*.23,'#d4683f',t);
 for(let i=0;i<4;i++){
   const a=i*TAU/4+.42;
   const m=box(Math.cos(a)*r,Math.sin(a)*r,.007,r*.45,r*.24,r*.42,'#eee7d4',t);
   m.rotation.z=a;
 }
 return t;
}
function cleat(x,y,z,g){
 box(x,y,z,.205,.033,.106,ink,g);
 cyl(x,y+.05,z,.03,.043,.096,metal,g,8);
 beam([x-.107,y+.10,z],[x+.107,y+.10,z],.029,ink,g);
}
function scopeSweep(sonar){
 return new T.ShaderMaterial({
  uniforms:{time:renderTime,sonar:{value:sonar?1:0}},transparent:true,depthWrite:false,
  vertexShader:'varying vec2 p;void main(){p=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec2 p;uniform float time,sonar;
  void main(){
   vec2 q=(p-.5)*vec2(1.34,1.);
   float phase=mod(time*.61+2.,6.28318);
   float sector=exp(-mod(phase-atan(q.y,q.x)+6.28318,6.28318)*4.)*(1.-smoothstep(.35,.43,length(q)));
   float scan=1.-smoothstep(.003,.035,abs(p.x-fract(time*.24)));
   gl_FragColor=vec4(.49,1.,.73,mix(sector*.49,scan*.44,sonar));
  }`
 });
}
const radarScan=scopeSweep(false),sonarScan=scopeSweep(true);
function screen(g,x,y,z,w,h,type){
 box(x,y,z,w+.059,h+.044,.055,'#334f51',g);
 const m=canvasMat(128,92,(c,W,H)=>{
   c.fillStyle=type?'#103e49':'#24534d';c.fillRect(0,0,W,H);
   c.strokeStyle=type?'#327974':'#58997a';c.lineWidth=1;
   for(let j=1;j<6;j++){c.beginPath();c.moveTo(0,j*15);c.lineTo(W,j*15);c.stroke()}
   if(type){
     c.strokeStyle='#8ad2a4';c.lineWidth=3;c.beginPath();c.moveTo(0,67);
     for(let k=0;k<16;k++)c.lineTo(k*9,rr(49,72));c.stroke();
     c.strokeStyle='#d6d288';c.beginPath();c.moveTo(18,37);c.lineTo(56,41);c.lineTo(74,32);c.stroke();
   }else{
     for(let k=1;k<=3;k++){c.beginPath();c.arc(63,47,k*13,0,TAU);c.stroke()}
     c.beginPath();c.moveTo(10,47);c.lineTo(116,47);c.moveTo(63,8);c.lineTo(63,86);c.stroke();
     c.fillStyle='#5fba88';c.beginPath();c.moveTo(63,47);c.arc(63,47,39,-1.32,-.62);c.fill();
   }
   linesText(c,type?'03.7 m':'52°  N',10,8,9,'#b9edc0');
 });
 plane(x,y,z+.029,w,h,m,g);
 const scanner=plane(x,y,z+.031,w,h,type?sonarScan:radarScan,g);
 scanner.renderOrder=10;
}
const chartArt=canvasMat(128,160,(c,w,h)=>{
 c.fillStyle='#e6e4bd';c.fillRect(0,0,w,h);c.fillStyle='#94b8ad';c.fillRect(7,39,114,83);
 c.strokeStyle='#738f80';c.lineWidth=1;
 for(let k=1;k<7;k++){c.beginPath();c.moveTo(4,k*18+12);c.lineTo(w-4,k*18+12);c.stroke()}
 c.fillStyle='#d5d3a6';c.beginPath();c.moveTo(8,39);c.lineTo(95,39);c.lineTo(64,65);c.lineTo(75,81);c.lineTo(40,96);c.lineTo(8,82);c.fill();
 c.strokeStyle='#a96a54';c.lineWidth=2;c.beginPath();c.moveTo(47,77);c.lineTo(102,111);c.stroke();
 linesText(c,'汐凪 海図',12,18,19,'#577672','left',true);
 linesText(c,'満潮  14:36',12,140,14,'#577672');
});
const tideSlip=canvasMat(160,128,(c,w,h)=>{
 c.fillStyle='#e4ddbf';c.fillRect(0,0,w,h);
 c.fillStyle='#7f9c92';c.fillRect(8,8,w-16,36);
 linesText(c,'潮汐表',80,27,23,'#f2efcf','center',true);
 ['干潮　09:06','満潮　14:36','干潮　21:10'].forEach((row,i)=>linesText(c,row,13,56+i*23,15,'#526f6a'));
});
const helmGrain=mat('#526e69',.62);
function cabin(g,color){
 const c=group(0,.51,-.49,g);
 const x=.84, y=1.66, z0=-.92,z1=.89, dz=z1-z0, frame='#647e7e';
 box(0,.052,-.03,1.69,.103,1.82,'#c6c6af',c);
 for(const side of [-1,1]){
   box(x*side,.32,-.02,.106,.60,dz,color,c);
   box(x*side,1.548,-.02,.097,.207,dz,color,c);
   for(const z of [z0,-.07,z1])box(x*side,1.11,z,.09,1.12,.096,frame,c);
   for(const z of [-.49,.405]){
     const gl=plane(x*side,1.06,z,.768,.785,glazing,c);gl.rotation.y=side*PI/2;gl.renderOrder=9;
     const glint=box(x*side*1.051,1.197,z-.04,.008,.528,.021,alpha('#ddf8ef',.45),c,false);glint.rotation.x=-.61;
   }
 }
 box(0,.249,z0,1.69,.47,.107,color,c);
 box(0,1.603,z0,1.69,.13,.094,color,c);
 for(const x0 of [-.81,-.28,.28,.81])box(x0,1.078,z0,.058,1.021,.086,frame,c);
 for(const x0 of [-.548,0,.548]){
   const gl=plane(x0,1.053,z0,.498,1.03,glazing,c);gl.renderOrder=9;
 }
 for(const s of [-1,1]){
   box(s*.645,.292,z1,.382,.55,.095,color,c);
   box(s*.45,1.02,z1,.066,1.28,.087,frame,c);
   box(s*.645,1.524,z1,.39,.162,.084,color,c);
   const gl=plane(s*.645,1.065,z1,.335,.75,glazing,c);gl.renderOrder=9;
 }
 const open=group(-.447,.05,z1+.028,c);open.rotation.y=-1.08;
 box(-.245,.29,0,.46,.54,.062,color,open);
 box(-.46,.92,0,.054,1.31,.057,frame,open);
 box(-.03,.92,0,.052,1.31,.056,frame,open);
 box(-.243,1.515,0,.477,.06,.055,frame,open);
 plane(-.244,1.05,0,.386,.819,glazing,open).renderOrder=9;
 box(-.373,.64,.05,.099,.03,.042,'#cbd4c4',open);
 edge(box(0,y+.064,-.013,1.965,.151,2.065,color,c),'#5b7776',.48);
 box(0,y-.034,-.013,1.985,.046,2.062,'#849d97',c);
 causticPanel(0,y-.06,-.019,1.60,1.77,c);
 box(-.291,.556,-.571,.92,.42,.46,'#53716a',c);
 edge(box(-.246,.803,-.605,.94,.096,.49,helmGrain,c),'#3a5754',.42).rotation.x=-.10;
 box(-.298,.66,-.327,.72,.029,.040,'#7c9588',c);
 for(const x of [-.597,.002])cyl(x,.67,-.302,.013,.013,.010,'#b2b8a1',c,7,false).rotation.x=PI/2;
 screen(c,-.418,1,-.64,.29,.197,0);
 screen(c,-.065,.965,-.632,.257,.164,1);
 for(let n=0;n<6;n++)ball(-.58+n*.094,.852,-.401,.023,.015,.023,n%3?'#b7c0a9':'#bf8652',c,false);
 const wheel=group(-.43,.928,-.269,c);wheel.rotation.x=-.38;
 tor(0,0,0,.177,.022,'#4a544c',wheel);
 for(let j=0;j<3;j++){
   const a=j*TAU/3;beam([0,0,-.018],[.171*Math.cos(a),.171*Math.sin(a),0],.012,'#77847c',wheel,6);
 }
 cyl(0,0,.006,.052,.052,.032,'#8d9f8e',wheel,10).rotation.x=PI/2;
 cyl(-.315,.272,.238,.038,.06,.414,'#6c8277',c);
 box(-.315,.5,.238,.436,.112,.40,benchOak,c);
 edge(box(-.315,.71,.457,.437,.34,.096,benchOak,c),'#847459',.30);
 for(const x of [-.462,-.171])cyl(x,.649,.507,.015,.015,.008,'#979885',c,8,false).rotation.x=PI/2;
 box(.46,.49,-.30,.60,.052,.87,benchOak,c);
 beam([.171,.515,-.73],[.171,.515,.132],.012,'#7a7b65',c,6);
 const board=group(.246,.682,-.381,c);board.rotation.x=-.66;board.rotation.z=.04;
 box(0,0,0,.30,.365,.029,'#8a795d',board);
 plane(0,-.01,.017,.263,.327,chartArt,board);
 box(0,.157,.03,.106,.04,.022,'#a0a895',board);
 const sheet=plane(.512,.913,-.712,.218,.174,tideSlip,c);sheet.rotation.set(-.19,-.23,-.067);
 for(const sx of [-.07,.07])box(.512+sx,.997,-.707,.045,.014,.010,'#b9a78c',c,false);
 const provisions=group(.415,.516,.056,c);
 cyl(0,.134,0,.061,.076,.248,'#bdc0ae',provisions);
 cyl(0,.275,0,.064,.067,.045,'#746d56',provisions);
 cyl(0,.201,0,.064,.064,.023,'#83a8a1',provisions,12);
 tor(-.067,.168,0,.062,.012,'#778176',provisions);
 cyl(-.165,.043,.012,.064,.058,.086,'#e5e1c4',provisions,13);
 cyl(-.165,.089,.012,.062,.062,.007,'#5d857f',provisions,13,false);
 tor(-.231,.052,.012,.032,.007,'#dbddc7',provisions);
 const raincoat=group(.759,1.13,.605,c);raincoat.rotation.y=-1.19;
 beam([0,.203,0],[0,.127,0],.014,'#67746c',raincoat);
 ball(0,.072,0,.098,.098,.056,'#d4a341',raincoat);
 const coatShape=new T.Shape();
 [[-.12,.049],[-.22,-.09],[-.18,-.25],[-.117,-.215],[-.116,-.421],[.135,-.42],[.127,-.18],[.184,-.26],[.223,-.115],[.124,.06]].forEach(([a,b],i)=>i?coatShape.lineTo(a,b):coatShape.moveTo(a,b));
 const geo=new T.ExtrudeGeometry(coatShape,{depth:.036,bevelEnabled:true,bevelThickness:.012,bevelSize:.012,bevelSegments:1,steps:1});
 mesh(geo,'#ddb443',0,0,0,raincoat);
 box(0,-.193,.05,.018,.435,.008,'#967747',raincoat);
 for(let j=0;j<3;j++)ball(.025,-.105-j*.098,.054,.011,.011,.006,'#dace80',raincoat,false);
 box(.665,1.20,-.804,.095,.186,.024,'#b65b46',c);
 beam([.665,1.3,-.786],[.705,1.378,-.831],.008,'#b69761',c,5);
 const fishPhoto=canvasMat(112,76,(p,w,h)=>{
  p.fillStyle='#e5ddbc';p.fillRect(0,0,w,h);p.fillStyle='#64888b';p.fillRect(7,7,98,57);p.fillStyle='#b9b597';
  p.beginPath();p.ellipse(53,37,28,10,-.17,0,TAU);p.fill();p.beginPath();p.moveTo(28,37);p.lineTo(14,26);p.lineTo(15,49);p.fill();
  p.fillStyle='#455d5b';p.beginPath();p.arc(73,34,2,0,TAU);p.fill();
  linesText(p,'8.18',83,61,9,'#e3d5b4','center');
 });
 plane(.646,1.37,-.833,.229,.149,fishPhoto,c).rotation.z=.108;
 shaft([.78,1.45,-.46],[-.53,.32,.57],.075,.18,c,.09);
 return c;
}
function flagCloth(g,x,y,z,w,h,color,phase=0,banner=false){
 const geo=new T.PlaneGeometry(w,h,12,4);geo.translate(w/2,0,0);
 const p=geo.attributes.position;
 const m=mat(color).clone();m.side=T.DoubleSide;
 const o=mesh(geo,m,x,y,z,g,false);
 cloth.push({o,original:p.array.slice(),w,phase,banner});
 return o;
}
function fitFishingDeck(g){
 const wood='#9c9477', frame='#718988', canvas='#a0b7af';
 const rack=group(0,0,1.92,g);
 for(const side of [-1,1]){
  const x=side*.69;
  beam([x,.56,-.63],[x,1.44,-.62],.028,frame,rack,8);
  beam([x,.56,.25],[x,1.43,.25],.028,frame,rack,8);
  path([[x,1.44,-.63],[x,1.46,-.17],[x,1.43,.25]],.027,frame,rack);
 }
 for(const z of [-.62,.25])path([[-.71,1.44,z],[0,1.53,z],[.71,1.44,z]],.023,frame,rack);
 const skin=new T.BufferGeometry(), vertices=[],indices=[];
 for(let j=0;j<12;j++){
  const s=j/11*2-1, y=1.533-.074*Math.abs(s)**1.68;
  vertices.push(s*.715,y,-.63,s*.715,y-.009,.24);
  if(j){const i=j*2;indices.push(i-2,i-1,i,i,i-1,i+1)}
 }
 skin.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
 skin.setIndex(indices);skin.computeVertexNormals();
 const canvasMat=mat(canvas,.80).clone();canvasMat.side=T.DoubleSide;
 mesh(skin,canvasMat,0,0,0,rack);
 for(const x of [-.48,-.25,0,.25,.48]){
  const y=1.539-.074*Math.abs(x/.715)**1.68;
  beam([x,y,-.61],[x,y-.009,.224],.007,'#ced5bf',rack,5,false);
 }
 for(const side of [-1,1])box(.42*side,.634,-.011,.043,.187,.42,frame,rack);
 edge(box(0,.75,-.017,1.04,.055,.44,wood,rack),'#767e69',.31);
 for(let i=0;i<3;i++){
  const x=.643-.085*i,z=2.21-i*.073;
  beam([x,.605,z],[x+.068,.86,z-.04],.032,'#899b8f',g,9);
  beam([x+.042,.74,z-.027],[x+.39,2.10+i*.07,z-.58-i*.17],.013,'#657b71',g,6);
  tor(x+.086,.909,z-.10,.036,.009,'#9a916f',g).rotation.y=PI/2;
 }
}
const hullEnamel=new T.MeshStandardMaterial({
 color:0xefeddb,roughness:.38,metalness:.025,envMap:harborSky.texture,envMapIntensity:.43
});
hullEnamel.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec3 paintP;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n paintP=position;');
 shader.fragmentShader='varying vec3 paintP;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 p=paintP;
   float streaks=sin(p.z*51.2+sin(p.z*127.6+p.y*20.4)*1.03)*sin(p.y*11.2+p.z*5.1);
   float hits=smoothstep(.33,.87,streaks)*exp(-max(p.y,0.)*7.5);
   float salt=smoothstep(.55,.87,sin(p.z*31.7+p.y*22.)*cos(p.z*81.9-p.y*41.));
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.30,.19),hits*.096);
   diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.89,.77),salt*.065);
 `);
};
function boat(x,z,len,wide,col,nm,kind,heading){
 const g=group(x,.11,z);g.rotation.y=heading;
 const shape=[[-3.08,.042,.43],[-2.75,.46,.27],[-2.28,.83,.125],[-1.58,1.03,.028],[-.75,1.04,0],[.3,1.04,-.016],[1.25,1.02,-.02],[1.99,.976,0],[2.45,.886,.07],[2.5,.86,.083]];
 hullShape(shape,[[.54,-.61,.2],[.845,-.47,.4],[.985,-.173,.75]],col,g);
 hullShape(shape,[[.985,-.173,.75],[1.01,-.066,.84]],'#687f78',g);
 hullShape(shape,[[1.01,-.066,.84],[1.055,.29,.95],[1.036,.555,1]],hullEnamel,g);
 hullShape(shape,[[1.036,.555,1],[1.042,.612,1]],col,g);
 hullShape(shape,[[1.042,.612,1],[.931,.594,1,.014],[.928,.49,0,.018]],'#dee1c9',g);
 deckShape(shape,kind===3?'#a99673':'#a6b6a8',g);
 for(const s of [-1,1]){
   path(shape.map(([z,w,k])=>[s*w*1.049,.569+k,z]),.027,'#849a91',g);
   path(shape.slice(0,8).map(([z,w,k])=>[s*w*1.043,.204+k*.89,z]),.027,col,g);
   for(let i=0;i<10;i++){
     const z=rr(-1.54,2.22),bw=z>1.99?.96-(z-1.99)*.20:1.065;
     const rust=box(s*bw,rr(.002,.150),z,.014,rr(.007,.042),rr(.035,.13),pick(['#a27156','#b28a65','#a7a189']),g,false);
     rust.rotation.x=rr(-.17,.17);
   }
   const name=group(s*1.111,.388,.81,g);name.rotation.y=s*PI/2;
   sign(nm,kind===2?'SN  04':'汐凪',0,0,0,1.02,.190,name,['#eeeeda',col,'#7a8b79']);
   for(const z of [1.72,-1.31]){
     const t=tor(s*1.12,.299,z,.198,.066,'#465759',g);t.rotation.set(.06,s*PI/2,.08);
     t.userData.phase=rr(0,TAU);
     t.userData.fenderSide=s;
     path([[s*.98,.65,z],[s*1.13,.57,z],[s*1.14,.455,z]],.019,'#ad9973',g);
   }
 }
 for(const z of [2.3,-2.65])for(const x of [-.40,.4])cleat(x,.603+(z<0?.23:.025),z,g);
 for(const side of [-1,1]){
   const railPts=[[-2.91,.20],[-2.51,.66],[-1.99,.90],[-1.48,.97]];
   for(const [z,x] of railPts)beam([side*x,.62+(z<-2.7?.32:.16),z],[side*x,.96+(z<-2.7?.28:.11),z],.025,'#849f97',g,8);
   path(railPts.map(([z,x])=>[side*x,.96+(z<-2.7?.28:.11),z]),.028,'#90a6a0',g);
 }
 if(kind!==3){
   const c=cabin(g,'#ede9d5');
   const roofPaint=kind===1?'#a6bebe':kind===2?'#aac9bc':'#d5e3d7';
   box(0,2.317,-.503,1.75,.018,1.81,roofPaint,g,false);
   for(const side of [-1,1])box(side*.759,2.328,-.483,.023,.008,1.64,'#e6e6ce',g,false);
   if(kind===0){
    const tarp=group(.464,.704,1.661,g);tarp.rotation.y=.19;
    ico(0,0,0,.35,.119,.275,'#789e9a',tarp,1);
    path([[-.24,.01,-.10],[-.19,.103,-.14],[.065,.111,-.111],[.25,.025,-.072]],.012,'#aec1a3',tarp);
   }
   lifering(.99,1.272,.132,.239,g,PI/2);
   const mast=group(-.12,2.23,-.65,g);
   cyl(0,.49,0,.026,.053,.98,'#738e86',mast,10);
   beam([-.49,.61,0],[.47,.61,0],.032,'#6e8d80',mast,8);
   for(let j=0;j<2;j++){
     ball(j?.46:-.47,.68,0,.047,.06,.047,j?'#b96e4c':'#6f9a79',mast);
     beam([j?.42:-.42,.3,0],[j?.30:-.30,1.02,.06],.013,'#6c8981',mast,6);
   }
   cyl(0,1.0,0,.204,.178,.12,'#e4e5cf',mast,20);
   ball(0,1.069,0,.196,.069,.196,'#f3efdb',mast);
   beam([.34,.04,-.12],[.46,1.51,-.18],.014,'#6b8882',mast,6);
   beam([-.34,.04,.2],[-.6,1.77,.2],.012,'#6b8882',mast,5);
   flagCloth(mast,-.02,.91,.05,.43,.232,kind===1?'#dfa954':'#c86b53',2+kind);
   if(kind===1)fitFishingDeck(g);
   if(kind!==1){
     for(const side of [-1,1]){
       beam([side*.71,.53,2.13],[side*.71,1.82,2.12],.026,'#76928a',g);
       beam([side*.71,1.82,.49],[side*.71,1.82,2.12],.028,'#76928a',g);
     }
     for(let i=0;i<4;i++)beam([-.71,1.82,.51+i*.53],[.71,1.82,.51+i*.53],.024,'#76928a',g);
   }
   for(const [xx,zz] of [[.5,1.52],[-.44,1.83],[.36,-2.1]])crate(g,xx,.529,zz,.49,.39,.21,kind===1?'#7ca6b5':'#bed0c5',false);
   path([[-.64,.59,1.46],[-.22,.60,1.2],[-.29,.68,1.02],[-.54,.65,1.11],[-.44,.63,1.28],[-.23,.62,1.25]],.027,'#b19567',g);
   box(0,.58,-2.0,.72,.16,.66,'#c5cbad',g);
   box(0,.667,-2.0,.75,.035,.69,'#d2d7b7',g);
   for(const xx of [-.94,.94])beads.push({p:g,x:xx,y:2.20,z:rr(-1.0,.43),phase:rr(0,8),deck:true});
   beads.push({p:g,x:1.11,y:.60,z:.22,phase:2.71+kind*.97});
 }else{
   for(let j=0;j<5;j++)box(0,.507,j*.83-1.62,1.51,.071,.081,'#7b9b91',g);
   for(const zz of [-1.02,.9,1.85])box(0,.639,zz,1.67,.068,.32,'#d1d4c2',g);
   for(const side of [-1,1])beam([side*.58,.84,1.85],[side*.87,.89,-.41],.034,'#a37e55',g);
   lifering(.83,.898,.95,.176,g,PI/2);
   crate(g,.11,.56,-.05,.61,.51,.22,'#aac7c0',true);
   box(0,.91,2.38,.39,.27,.28,'#516c69',g);
 }
 g.scale.set(wide,wide,len);
 const rec={g,x,z,len,wide,heading,kind,phase:rr(0,TAU),ropes:[]};boats.push(rec);
 return rec;
}
const boatA=boat(-3.52,3.31,1.02,1.01,'#407c87','しおかぜ',0,-.055);
const boatB=boat(-3.46,-3.45,1.06,.94,'#516d85','第二 汐丸',1,.04);
const traveler=boat(2.18,-2.88,.83,.89,'#438b81','朝 凪 丸',2,-.29);
const skiff=boat(7.15,-7.27,.69,.69,'#b86f52','つばめ',3,1.43);

const castIron=mat('#394c4a',.96,.08);
function bollard(x,z){
 const g=group(x,SHORE,z);
 cyl(0,.037,0,.22,.25,.076,'#596f69',g);
 cyl(0,.186,0,.103,.134,.28,castIron,g,13);
 cyl(0,.324,0,.178,.162,.088,castIron,g);
 beam([-.17,.28,0],[.157,.28,0],.073,castIron,g,11);
 for(let i=0;i<4;i++){
   const a=i*TAU/4+.52;
   cyl(.18*Math.sin(a),.088,.18*Math.cos(a),.028,.033,.035,'#9b825e',g,7,false);
 }
 return g;
}
const tideIron=oxidizedIron('#8c8270'), submergedIron=oxidizedIron('#5d7d73');
function ironLadder(z){
 const g=group(-4.86,0,z);
 for(const s of [-1,1]){
   path([[-.27,1.055,s*.236],[.029,1.16,s*.236],[.14,.88,s*.236],[.14,-.53,s*.236],[.102,-1.65,s*.236]],.039,tideIron,g,true);
 }
 for(let i=0;i<10;i++)beam([.139,1.0-i*.275,-.23],[.139,1.0-i*.275,.23],.028,i>3?submergedIron:tideIron,g,7);
}
ironLadder(6.58);ironLadder(-5.91);
for(const z of [-6.43,-3.24,-.6,1.7,4.5])bollard(-5.49,z);
for(const x of [-2.7,.40,3.8])bollard(x,-7.67);
bollard(-1.02,10.28);bollard(-1.02,12.72);
for(const z of [-5.3,-2.1,1.1,4.35,7.37]){
 const t=tor(-4.83,.53,z,.117,.031,'#726b56');t.rotation.y=PI/2;
 box(-4.91,.624,z,.102,.13,.09,'#847157');
}
function ropeFinish(color,roughness){
 const m=mat(color,roughness).clone();
 m.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec2 ropeUV;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n ropeUV=uv;');
  shader.fragmentShader='varying vec2 ropeUV;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   float braid=sin(ropeUV.x*134.-ropeUV.y*18.85);
   float strand=cos(ropeUV.x*261.+ropeUV.y*31.42);
   diffuseColor.rgb*=.94+.16*smoothstep(-.54,.92,braid)+.07*strand;
  `);
 };
 return m;
}
const dryRope=ropeFinish('#c6976c',.79);
const dampRope=ropeFinish('#9b674d',.58);
const wetRope=ropeFinish('#745c48',.43);
function moor(b,ax,az,x,z){
 const lock=vec(ax,1.28,az), local=vec(x,.676,z);
 for(let n=0;n<3;n++)tor(ax,1.16+n*.041,az,.128,.019,n===0?'#9d6846':'#bb8559').rotation.x=PI/2;
 const s=mesh(new T.BufferGeometry(),dryRope,0,0,0,stage,false);
 const wet=mesh(new T.BufferGeometry(),wetRope,0,0,0,stage,false);
 b.ropes.push({lock,local,s,wet});
}
moor(boatA,-5.49,.45,-.78,-2.22);
moor(boatA,-5.49,4.5,-.78,2.27);
moor(boatB,-5.49,-6.43,-.79,-2.23);
moor(boatB,-5.49,-.6,-.82,2.31);
moor(traveler,.40,-7.67,.4,-2.65);
moor(skiff,3.8,-7.67,-.42,-2.47);
function buoyPaint(id){
 return canvasMat(512,112,(c,w,h)=>{
  c.fillStyle='#ba7754';c.fillRect(0,0,w,h);
  c.fillStyle='#d4a47730';c.fillRect(0,9,w,12);
  for(let i=0;i<3;i++)linesText(c,id,86+i*171,h*.51,62,'#e6d7ad','center',true);
  for(let i=0;i<220;i++){
   const x=(i*113+23)%w,y=(i*71+27)%h;
   c.fillStyle=i%3?'#aa73563c':'#d7b08750';c.fillRect(x,y,2+(i*19)%17,1+(i%3));
  }
 },true);
}
for(const [x,z,s,id] of [[-.25,6.5,.9,'07'],[5.21,1.98,1,'12'],[8.48,-3.95,.89,'16'],[-.34,-5.50,.69,'03'],[9.78,5.97,.73,'23']]){
 const g=group(x,0,z);g.scale.setScalar(s);
 cyl(0,.102,0,.261,.187,.24,buoyPaint(id),g,24);
 tor(0,.079,0,.216,.012,'#99674f',g,false).rotation.x=PI/2;
 cyl(0,.24,0,.186,.265,.072,'#e6dfbf',g,18);
 cyl(0,.31,0,.104,.191,.101,'#cb8755',g,18);
 tor(0,.402,0,.062,.016,'#686d59',g);
 for(let j=0;j<3;j++)tor(0,-.065-j*.067,0,.036,.011,'#796c55',g,false).rotation.y=j%2?PI/2:0;
 buoys.push({g,x,z,phase:rr(0,TAU)});
}
