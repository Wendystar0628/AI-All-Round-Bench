// A shelf of filled sketchbooks and a bundle of garden studies.
function fieldPage(ctx,w,h,subject) {
  ctx.fillStyle='#e6d9b6';ctx.fillRect(0,0,w,h);
  for(let i=0;i<1400;i++){ctx.fillStyle=i%3?'#ab987b19':'#fff1ca64';ctx.fillRect(R(0,w),R(0,h),R(.4,2.4),1)}
  ctx.strokeStyle='#8a826d';ctx.lineWidth=w*.003;
  ctx.strokeRect(w*.08,h*.07,w*.84,h*.85);
  ctx.fillStyle='#625f50';ctx.font='italic '+w*.047+'px Georgia';ctx.fillText('Carnet de terrain',w*.13,h*.16);
  ctx.fillStyle='#aa6749';ctx.fillRect(w*.77,h*.115,w*.067,w*.067);
  ctx.save();ctx.translate(w*.5,h*.47);
  if(subject==='leaf'){
    let points=[[0,-.8],[.09,-.32],[.32,-.57],[.25,-.16],[.58,-.24],[.34,.01],[.57,.16],[.12,.19],[0,.35],[-.1,.19],[-.54,.12],[-.31,-.01],[-.55,-.27],[-.24,-.16],[-.31,-.57],[-.08,-.31]];
    let r=w*.48;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(r*x,r*y):ctx.moveTo(r*x,r*y));ctx.closePath();ctx.fillStyle='#b86f4670';ctx.fill();ctx.stroke();
    points.forEach(([x,y],i)=>{if(i%2===0){ctx.beginPath();ctx.moveTo(0,r*.17);ctx.lineTo(r*x*.91,r*y*.91);ctx.stroke()}})
    ctx.beginPath();ctx.moveTo(0,r*.16);ctx.quadraticCurveTo(r*.051,r*.31,-r*.09,r*.41);ctx.stroke();
  }else if(subject==='gate'){
    for(let d of [-1,1]){ctx.beginPath();ctx.moveTo(d*w*.18,-h*.135);ctx.lineTo(d*w*.201,h*.135);ctx.stroke();ctx.beginPath();ctx.moveTo(d*w*.16,-h*.135);ctx.lineTo(d*w*.18,h*.135);ctx.stroke()}
    for(let y of [-.17,-.14,-.079]){ctx.beginPath();ctx.moveTo(-w*.32,h*y);ctx.quadraticCurveTo(0,h*(y+.038),w*.32,h*y);ctx.stroke()}
    for(let i=0;i<5;i++){let y=h*(.13+i*.022);ctx.beginPath();ctx.moveTo(-w*(.22+i*.016),y);ctx.lineTo(w*(.22+i*.016),y);ctx.stroke()}
  }else{
    for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(0,0,w*(.095+i*.041),h*.13,i*.54,0,TAU);ctx.stroke()}
    for(let i=0;i<22;i++){let a=R(0,TAU),r=R(.05,.27)*w;ctx.fillRect(Math.cos(a)*r,Math.sin(a)*r,2,2)}
  }
  ctx.restore();ctx.fillStyle='#756d59';ctx.font='italic '+w*.037+'px Georgia';
  ctx.fillText({leaf:'Acer palmatum',gate:'Sanctuaire du jardin',stars:'Sphère armillaire'}[subject],w*.15,h*.735);
  for(let j=0;j<3;j++){ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w*.15,h*(.79+.031*j));for(let k=0;k<45;k++)ctx.lineTo(w*(.15+k*.012),h*(.79+.031*j)+R(-1.4,1.4));ctx.stroke()}
}
world=sites.studio;
let paperStudies=world.children.filter(o=>o.geometry?.type==='PlaneGeometry'&&o.geometry.parameters.width>.3&&o.geometry.parameters.width<.41&&o.material.map);
paperStudies.filter(o=>o.position.x< -1&&o.position.z<0).forEach((o,i)=>{o.material.map=canvasTex(300,375,(p,w,h)=>fieldPage(p,w,h,['leaf','gate','stars'][i%3]));o.material.needsUpdate=true});
world=gardenRoot;
const openingSketch=art(-2.36,.637,6.31,.395,.272,(p,w,h)=>{p.fillStyle='#e8ddbf';p.fillRect(0,0,w,h);p.save();p.scale(.5,1);fieldPage(p,w,h,'leaf');p.translate(w,0);fieldPage(p,w,h,'gate');p.restore();p.fillStyle='#a4997c';p.fillRect(w*.5-1,0,2,h)},-Math.PI/2);openingSketch.rotation.z=.18;
for(let i=0;i<3;i++){let x=-2.54+i*.032;rod(x,.614,6.08,x+.11,.614,6.27,.008,i%2?'#b89057':'#726b50');rod(x+.11,.614,6.27,x+.121,.614,6.289,.008,'#6a5a43',.14)}
// Rake, new bamboo work, and implements left where their owners used them.
world=sites.sand;
rod(-4.64,.155,4.84,-4.87,.76,5.04,.023,'#a88d59');rod(-4.86,.152,4.83,-4.43,.152,4.83,.026,'#ac9765');for(let j=0;j<8;j++)rod(-4.83+j*.052,.152,4.83,-4.83+j*.052,.119,4.69,.011,'#ae9d72');
world=gardenRoot;
world=sites.studio;
for(let a of [-1,1]){rod(-6.14,1.109,-1.39,-6.17,1.9,-1.56,.027,lightwood);box(-6.08+a*.18,1.57,-1.38,.043,.73,.05,wood,0,0,-.11)}box(-6.08,1.9,-1.38,.41,.052,.052,lightwood);box(-6.02,1.215,-1.38,.41,.052,.052,lightwood);
function drawerHandle(x,y,z){ring(x,y,z,.031,.006,'#be995d');ball(x,y+.029,z,.016,.012,.017,'#9d784a')}
for(let a of [-1,1])drawerHandle(-5.55+a*.37,1.55,-3.781);
const studyMat=art(-1.62,1.768,-3.411,.43,.289,(p,w,h)=>{p.fillStyle='#eddfb7';p.fillRect(0,0,w,h);p.save();p.scale(.54,1);fieldPage(p,w,h,'stars');p.restore();p.fillStyle='#6c6655';p.font=w*.037+'px Georgia';p.fillText('X I  /  1 8',w*.6,h*.18);for(let i=0;i<8;i++){p.fillRect(w*.57,h*(.25+.084*i),w*R(.22,.37),1.2)}},-1.57);
for(let a of [-1,1])rod(-2.09,1.747,-3.52,-2.09+a*.051,1.747,-3.35,.009,'#ad956a',.6);
ring(-1.43,1.751,-3.2,.047,.007,gold,Math.PI/2);rod(-1.39,1.751,-3.18,-1.314,1.751,-3.12,.01,wood);
for(let j=0;j<4;j++){let x=-2.96+j*.098;rod(x,1.13,-3.81,x,1.55,-3.86,.035,paper);ring(x,1.414,-3.84,.036,.006,'#987b5c',Math.PI/2)}
// A tied paper parasol leans against the veranda post.
function foldedParasol(x,y,z) {
  let holder=new T.Group();holder.position.set(x,y,z);holder.rotation.z=-.23;world.add(holder);
  function attach(geo,material,px,py,pz){let o=new T.Mesh(geo,material);o.position.set(px,py,pz);o.castShadow=true;holder.add(o);return o}
  let shaft=attach(new T.CylinderGeometry(.017,.021,.96,9),new T.MeshToonMaterial({color:wood,gradientMap:grad}),0,.52,0);
  for(let k=0;k<18;k++){let a=k*TAU/18,b=(k+1)*TAU/18;let g=new T.BufferGeometry();let v=[[.022*Math.cos(a),1.01,.022*Math.sin(a)],[.105*Math.cos(a),.56,.105*Math.sin(a)],[.129*Math.cos((a+b)/2),.28,.129*Math.sin((a+b)/2)],[.103*Math.cos(b),.56,.103*Math.sin(b)],[.022*Math.cos(b),1.01,.022*Math.sin(b)]];g.setAttribute('position',new T.Float32BufferAttribute(v.flat(),3));g.setIndex([0,1,2,0,2,3,0,3,4]);g.computeVertexNormals();attach(g,new T.MeshToonMaterial({color:k%2?'#b55e43':'#ca7955',side:T.DoubleSide,gradientMap:grad}),0,0,0)}
  attach(new T.CylinderGeometry(.085,.086,.039,18),new T.MeshToonMaterial({color:'#ceb783'}),0,.68,0);
}
foldedParasol(-.41,1.082,.13);
world=gardenRoot;
function sakeLabel(ctx,w,h,k){ctx.fillStyle='#decb9f';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#927c59';ctx.lineWidth=4;ctx.strokeRect(5,4,w-10,h-8);ctx.fillStyle=k%2?'#97503d':'#586c67';ctx.beginPath();ctx.arc(w*.23,h*.51,h*.22,0,TAU);ctx.fill();ctx.fillStyle='#e6d3a6';ctx.font='bold '+h*.26+'px SimSun';ctx.fillText('星',w*.14,h*.60);ctx.fillStyle='#4c4a3e';ctx.font=h*.38+'px SimSun';ctx.fillText(k%2?'秋泉':'奉納',w*.43,h*.62)}
atSite('barrels',()=>{for(let j=0;j<6;j++){let x=6.15+(j%2)*.43,y=2.19+Math.floor(j/2)*.4;art(x,y,-4.826,.295,.21,(p,w,h)=>sakeLabel(p,w,h,j))}});
atSite('hall',()=>{for(let a of [-1,1]){let x=4.4+a*.37;cup(x,2.467,-5.17,.67);cyl(x,2.472,-5.17,.098,.03,'#a98b64');ball(x,2.509,-5.17,.059,.033,.059,'#ded6c4');ball(x+.021,2.561,-5.17,.043,.032,.043,paper)}});
// Cut a side of the pool in layers: small stones and weeds lie below the floating fruit.
for(let j=0;j<75;j++){let x=R(-.96,1.89),y=poolFloor+.016+R(-.009,.019);ball(x,y,6.61+.31*Math.cos(j*1.49),R(.019,.049),R(.013,.028),.012,pick(['#8da9a2','#9fb8a6','#c7b991','#719a95']))}
for(let j=0;j<8;j++){let x=R(-.91,1.84),height=R(.10,.23);for(let k=0;k<3;k++)obj(blade,x+(k-1)*.02,poolFloor+height*.5,6.61+.26*Math.sin(j*1.63),.07,height,.04,pick(['#79a397','#83ae9a','#85b19b']),0,0,.27*(k-1))}
const weatherClock = {value:0};
const studioInverse={value:sites.studio.matrixWorld.clone().invert()};
function paperWeather(material) {
  if (material.userData.passingCloud || !material.isMeshToonMaterial) return;
  material.userData.passingCloud = true;
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this,shader,renderer);
    shader.uniforms.weatherClock=weatherClock;shader.uniforms.studioInverse=studioInverse;
    shader.vertexShader='varying vec3 gardenPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
      vec4 gardenPoint=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        gardenPoint=instanceMatrix*gardenPoint;
      #endif
      gardenPosition=(modelMatrix*gardenPoint).xyz;
      #include <project_vertex>
    `);
    shader.fragmentShader='varying vec3 gardenPosition;uniform float weatherClock;uniform mat4 studioInverse;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      vec2 groundPoint=gardenPosition.xz;
      float sweep=mod(weatherClock+.5,56.)*1.8-55.;
      float drift=groundPoint.x+.52*groundPoint.y+.2*gardenPosition.y;
      float cloud=1.-smoothstep(2.5,9.,abs(sweep-drift)+1.3*sin(groundPoint.y*.74+weatherClock*.17));
      float mottling=sin(groundPoint.x*4.7+sin(groundPoint.y*3.1)+weatherClock*.19)*sin(groundPoint.y*4.2+sin(groundPoint.x*1.7));
      float shade=smoothstep(.12,.78,mottling)*smoothstep(1.,4.,6.-gardenPosition.y)*.085;
      vec3 worldNormal=inverseTransformDirection(normal,viewMatrix);
      vec3 roomPoint=(studioInverse*vec4(gardenPosition,1.)).xyz;
      bool ceiling=roomPoint.x>-6.6&&roomPoint.x<-.4&&roomPoint.z>-4.78&&roomPoint.z<.15&&roomPoint.y>3.59&&roomPoint.y<5.04&&worldNormal.y<-.22;
      float shoreRadius=length(groundPoint-vec2(.46,5.32));
      bool pastry=shoreRadius>2.03&&shoreRadius<2.47&&gardenPosition.y>.16&&gardenPosition.y<.62;
      if(ceiling||pastry){
        vec2 caustic=groundPoint*(ceiling?4.8:8.2)+vec2(gardenPosition.y*1.8,0.);
        float moment=weatherClock*.41;
        float waveA=sin(caustic.x+.59*sin(caustic.y*1.44+moment)-moment*.41);
        float waveB=cos(caustic.y*1.09+.71*sin(caustic.x*1.61-moment)+moment*.38);
        float shimmer=1.-smoothstep(.035,.205,abs(waveA-waveB));
        float lightPool=smoothstep(.11,.69,sin(caustic.x*.43+moment*.21)*cos(caustic.y*.73-moment*.31)*.5+.5);
        outgoingLight+=vec3(.071,.113,.091)*shimmer*lightPool*(1.-cloud*.85)*(ceiling?1.:.77);
      }
      outgoingLight*=mix(vec3(1.-shade),vec3(.69,.76,.84),cloud*.81);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=>key+'-cloud';
  material.needsUpdate=true;
}
for(const batch of batches.values())paperWeather(batch.mat);
world.traverse(o=>{if(o.material)paperWeather(o.material)});
anim.push(t=>{
  weatherClock.value=t;
  for(let i=0;i<rays.length;i++){
    let x=.15+i*.42,cloud=1-T.MathUtils.smoothstep(Math.abs((t+.5)%56*1.8-55-x),2.5,9);
    rays[i].material.opacity=(.36+.09*Math.sin(t*.29+i))*(1-cloud*.91);
  }
});
// The occupied part of each shower is offset along the path of the gust.
world=sites.treeGround;
const leafRain=new T.InstancedMesh(fanGeo,paint,96),rainTransform=new T.Object3D(),rainPhases=[];
world.add(leafRain);leafRain.castShadow=false;leafRain.frustumCulled=false;
for(let j=0;j<leafRain.count;j++){
  rainPhases.push({x:R(-.72,1.87),z:R(-3.67,-2.47),height:R(7.96,9.74),start:R(0,3.4),a:R(0,TAU),s:R(.055,.118)});
  leafRain.setColorAt(j,new T.Color(pick(ginCols)));
}
anim.push(t=>{
  const moment=(t+42)%42-6.36;
  leafRain.visible=moment>0&&moment<11;
  if(!leafRain.visible)return;
  rainPhases.forEach((d,j)=>{
    let u=clamp((moment-d.start)/7.5,0,1);
    rainTransform.position.set(d.x-u*1.6+.24*Math.sin(u*12+d.a),.14+(1-u)*d.height,d.z+u*2.96);
    rainTransform.scale.setScalar(d.s*Math.min(1,u*22,(1-u)*18));
    rainTransform.rotation.set(-.81+Math.sin(u*8+d.a),u*4+d.a,u*6);
    rainTransform.updateMatrix();leafRain.setMatrixAt(j,rainTransform.matrix);
  });
  leafRain.instanceMatrix.needsUpdate=true;
});
world=gardenRoot;
// A leaf lands on the water. Its ripples and nearby koi use the same impact time.
const pondVisitors=[];
for(let j=0;j<4;j++){
  const x=[-.76,-.11,-.07,1.12][j],z=[5.65,4.9,6.14,4.95][j],maple=j%2===0;
  let leaf=mesh(maple?mapleGeo:fanGeo,pick(maple?mapCols:ginCols)),rings=[];
  leaf.scale.setScalar(.125);
  for(let k=0;k<2;k++){
    let r=mesh(new T.TorusGeometry(1,.014,4,52),0,x,.516,z,new T.MeshBasicMaterial({color:'#d9efd6',transparent:true,depthWrite:false}));
    r.rotation.x=-Math.PI/2;r.castShadow=false;rings.push(r);
  }
  pondVisitors.push({x,z,leaf,rings,phase:j*6.9});
}
anim.push(t=>pondVisitors.forEach(({x,z,leaf,rings,phase})=>{
  let u=(t+phase)%31,flight=clamp(u/4,0,1);
  leaf.visible=u<19;
  let floating=Math.max(0,u-4);
  leaf.position.set(x+.54*(1-flight)*Math.sin(flight*7+phase)+.045*Math.sin(floating*.45),.537+2.05*(1-flight),z+.44*(1-flight)+.018*floating);
  leaf.scale.setScalar(.124*Math.min(1,u*4,Math.max(0,19-u)));
  leaf.rotation.set(-1.54+Math.sin(flight*Math.PI)*1.4,0,.4+flight*5+floating*.045);
  rings.forEach((r,i)=>{let ripple=clamp((u-4-i*.29)/1.8,0,1);r.visible=ripple>0&&ripple<1;r.scale.setScalar(.035+ripple*.35);r.material.opacity=(1-ripple)*.78});
}));
function spillway(){
  const waterY=terraceY+.61;
  const footY=sites.upper.worldToLocal(V(streamHead.x,streamSurface(streamHead.z),streamHead.z)).y;
  // A masonry flume receives the basin overflow at the lip of the rear terrace.
  const path=[[2.11,waterY,-2.50],[2.08,waterY-.028,-2.36],[2.03,waterY-.091,-2.247],[1.99,waterY-.37,-2.213],[1.97,2.18,-2.20],[1.95,1.43,-2.19],[1.96,footY+.021,-2.24]];
  const curve=new T.CatmullRomCurve3(path.map(p=>V(...p)));
  for(let k=0;k<2;k++)box(2.09+(k-.5)*.32,waterY-.12,-2.435,.071,.214,.33,'#8c9487');
  box(2.09,waterY-.172,-2.436,.36,.097,.35,'#829085');
  const verts=[],ids=[],uv=[];
  for(let j=0;j<=32;j++){let u=j/32,p=curve.getPointAt(u),w=.092+.033*Math.sin(u*Math.PI)+.042*u;
    for(let side of [-1,1]){verts.push(p.x+side*w,p.y,p.z+.005*Math.sin(u*12+side));uv.push((side+1)/2,u)}
    if(j){let n=j*2;ids.push(n-2,n,n+1,n-2,n+1,n-1)}
  }
  let geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ids);
  const clock={value:0},mat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,uniforms:{t:clock},vertexShader:'varying vec2 q;void main(){q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`uniform float t;varying vec2 q;void main(){float thread=smoothstep(.51,.91,sin(37.*q.x+1.1*sin(q.y*12.-t*3.)));float flash=smoothstep(.72,.96,sin(22.*q.y-t*4.7));gl_FragColor=vec4(mix(vec3(.33,.68,.68),vec3(.83,.94,.86),.54*thread+.31*flash),.69+.22*thread);
  #include <colorspace_fragment>
  }`});
  let sheet=mesh(geo,0,0,0,0,mat);sheet.castShadow=false;anim.push(t=>clock.value=t);
  for(let j=0;j<12;j++){let drop=mesh(sphereG,'#d5e8d6');drop.scale.set(.009,.045,.009);drop.castShadow=false;anim.push(t=>{let u=(t*.65+j/12)%1;drop.position.copy(curve.getPointAt(u));drop.position.x+=.116*Math.sin(j*2.4);drop.position.z+=.012})}
  for(let j=0;j<3;j++){let ripple=mesh(new T.TorusGeometry(1,.022,4,38),'#c6e2d1',1.96,footY+.014,-2.23);ripple.rotation.x=-Math.PI/2;ripple.castShadow=false;anim.push(t=>{let u=(t*.66+j/3)%1;ripple.scale.set(.04+.19*u,.026+.095*u,.02);ripple.visible=u<.93})}
}
atSite('upper',spillway);
world=sites.studio;
const litStars=new T.Group();world.add(litStars);litStars.position.set(-3.77,2.81,-4.456);
let dots=[[-.47,.48],[-.19,.35],[-.08,.56],[.08,.29],[.39,.38],[.49,.14],[.72,.19]];
let coords=[];dots.forEach(([x,y],i)=>{let star=new T.Mesh(sphereG,new T.MeshBasicMaterial({color:'#f8efbc',transparent:true,opacity:.71}));star.scale.setScalar(i%3===0?.017:.01);star.position.set(x,y,0);litStars.add(star);if(i)coords.push(...dots[i-1],0,x,y,0)});
let lineG=new T.BufferGeometry();lineG.setAttribute('position',new T.Float32BufferAttribute(coords,3));let constellation=new T.LineSegments(lineG,new T.LineBasicMaterial({color:'#dedbac',transparent:true,opacity:.54}));litStars.add(constellation);
anim.push(t=>{litStars.rotation.z=.021*Math.sin(t*.27);litStars.position.x=-3.77+.049*Math.sin(t*.17);constellation.material.opacity=.30+.22*Math.sin(t*.23)**2});
world=gardenRoot;
for(const water of [...world.children]){
  if(water.geometry?.type!=='ShapeGeometry'||water.position.y!==waterY)continue;
  const bed=mesh(water.geometry,0,0,water.userData.separatedSlice?.149:poolFloor+.002,0,new T.MeshBasicMaterial({map:topWater,color:water.userData.separatedSlice?'#a3ccc0':'#8ac3c6',side:T.DoubleSide}));
  bed.rotation.x=-Math.PI/2;bed.castShadow=false;
  water.material.transparent=true;water.material.opacity=.42;water.material.depthWrite=false;
  water.material.color.set('#ddf3e9');water.castShadow=false;water.renderOrder=1;
}
for(let j=0;j<55;j++){let a=R(.78,6.18),r=R(1.56,2.17),x=px+Math.cos(a)*r,z=pz+Math.sin(a)*r;if(z<6.89)rock(x,poolFloor+.017,z,R(.035,.075),.016,R(.04,.095),pick(['#a1c3aa','#a2beb1','#87ab9c','#a7c3ae']))}
for(let j=0;j<3;j++){
  let x=px-.59+j*.48,z=pz-.26+j*.36,o=mesh(limeG,0,x,.29+j*.03,z,limeMat);
  o.scale.setScalar(.122+j*.016);o.rotation.set(-1.01+j*.19,.18,j*2.19);
}
world=sites.studio;
// Glass shoji panels carry a subdued, locally painted reflection of the bouquets.
function reflectedGarden(p,w,h){
  p.clearRect(0,0,w,h);let grad=p.createLinearGradient(0,0,w,h);grad.addColorStop(0,'rgba(175,208,204,.24)');grad.addColorStop(.57,'rgba(222,224,197,.12)');grad.addColorStop(1,'rgba(87,119,99,.32)');p.fillStyle=grad;p.fillRect(0,0,w,h);
  for(let i=0;i<3;i++){p.fillStyle='#f8eac120';p.beginPath();p.moveTo(w*(.2+i*.31),0);p.lineTo(w*(.28+i*.31),0);p.lineTo(w*(.16+i*.31),h);p.lineTo(w*(.08+i*.31),h);p.fill()}
}
for(let [x,w] of [[-5.91,1.065],[-.97,.79]]){
  const glass=mesh(new T.PlaneGeometry(w,2.01),0,x,2.61,front+.044,new T.MeshBasicMaterial({map:canvasTex(256,480,reflectedGarden),transparent:true,depthWrite:false,opacity:.71}));
  glass.castShadow=false;
}
world=gardenRoot;
// Mossed roadside figures, a pulley well and a wrapped bouquet for the bicycle.
atSite('junction',()=>{
for(let i=0;i<4;i++){
  const x=3.35+i*.28,z=2.34;
  for(let side of [-1,1]){
    ball(x+side*.041,.59,z+.103,.018,.004,.006,'#666e61');
    ball(x+side*.027,.436,z+.124,.032,.036,.027,'#a0a497',0,0,-side*.25);
  }
  ball(x,.568,z+.115,.016,.02,.012,'#989d8c');
  for(let j=0;j<7;j++)box(x+(j-3)*.028,.674,z+.10-.003*Math.abs(j-3),.008,.038,.008,'#ac4936',0,0,.12);
  ball(x-.061,.184,z+.166,.043,.039,.045,'#df9253');
  cyl(x+.048,.15,z+.157,.026,.009,'#ada17b',1,12);
}

});

world=sites.entry;
for(let k=0;k<4;k++){let a=k*TAU/4;rod(-5.31,1.45,4.03,-5.31,1.45+.143*Math.cos(a),4.03+.143*Math.sin(a),.013,'#986f4b')}
ring(-5.31,1.45,4.03,.152,.018,wood,0,Math.PI/2);rod(-5.31,1.45,4.18,-5.25,1.45,4.18,.025,lightwood);
for(let j=0;j<10;j++)ring(-5.92+j*.018,1.45,4.03,.088,.01,'#ae9b6d',0,Math.PI/2);
rod(-5.86,1.43,4.115,-5.86,.438,4.115,.01,'#b4a174');
ring(-5.86,.366,4.115,.073,.007,'#888e78');cyl(-5.86,.315,4.115,.063,.106,'#957a54',1.19,12);ring(-5.86,.367,4.115,.072,.005,'#839284',Math.PI/2);cyl(-5.86,.368,4.115,.061,.003,'#8fafa4');
pot(-5.27,.11,4.36,.139,'#977c5e');ring(-5.27,.271,4.36,.114,.009,'#7b7968',Math.PI/2);ring(-5.27,.321,4.36,.1,.012,wood);
const bouquetX=-3.54,bouquetZ=6.09;
obj(cylG(1.9,7),bouquetX,.961,bouquetZ,.044,.245,.053,'#c1a37b',.14,0,-.45);
for(let j=0;j<8;j++){let x=bouquetX+.052+R(-.05,.055);flowersOfSeason(x,.985,bouquetZ+R(-.04,.04),R(.087,.147),j%3,pick(['#ce986a','#b38da7','#e0b273']))}
world=gardenRoot;
world=sites.sweep;
for(let j=0;j<2;j++){let x=.85+j*.17;ball(x,.221,-.005,.118,.069,.066,'#946348',.1,.34);ball(x+.083,.214,.018,.049,.045,.048,'#c38d59')}
world=gardenRoot;
function smallWaysideShrine(x,y,z){
  slab(x,y+.061,z,.57,.45,.121,'#969184');
  box(x,y+.292,z,.466,.365,.339,'#8a8d7d');
  box(x,y+.289,z+.174,.285,.255,.013,'#535f55');
  box(x,y+.446,z+.199,.367,.051,.07,'#a4a18c');
  for(let side of [-1,1])box(x+side*.174,y+.288,z+.194,.049,.29,.066,'#a4a38c');
  let top=cyl(x,y+.537,z,.442,.2,'#818778',.32,4);
  ball(x,y+.318,z+.196,.055,.073,.036,'#b3b19a');
  bowlOffering(x+.109,y+.131,z+.201);
}
function bowlOffering(x,y,z){cyl(x,y+.019,z,.039,.038,'#e0d4ae',1.22);ball(x,y+.041,z,.031,.013,.031,'#bb9370')}
atSite('ginkgo',()=>smallWaysideShrine(.91,.12,-3.89));
// Carved and woven surfaces hold their detail when the camera comes in close.
world=sites.studio;
for(let side of [-1,1]){
  let x=-2.03+side*.95,z=-.86;
  let pad=art(x,1.234,z,.475,.475,(p,w,h)=>{
    p.fillStyle=side<0?'#8c9c93':'#b97d65';p.fillRect(0,0,w,h);
    for(let i=0;i<80;i++){p.fillStyle=i%2?'#e5d6ad1a':'#625b5119';p.fillRect(i*w/80,0,1,h);p.fillRect(0,i*h/80,w,1)}
    p.strokeStyle='#e1ceae';p.lineWidth=2;p.strokeRect(14,14,w-28,h-28);p.setLineDash([6,5]);p.strokeRect(23,23,w-46,h-46);
    for(let a of [-1,1])for(let b of [-1,1]){p.save();p.translate(w*.5+a*w*.39,h*.5+b*h*.39);p.rotate(Math.PI/4);p.strokeRect(-9,-9,18,18);p.restore()}
  },-Math.PI/2);
}
cyl(-2.52,1.516,-1.145,.105,.026,'#c7b390');for(let j=0;j<3;j++){let x=-2.59+j*.062;ball(x,1.561,-1.146,.043,.041,.044,['#a2ad7e','#e3c2aa','#d7d4bb'][j])}rod(-2.68,1.557,-1.146,-2.39,1.557,-1.146,.008,'#b99362');
cyl(-1.57,1.521,-1.18,.127,.049,'#a0865d',1.18);for(let j=0;j<4;j++){let a=j*2.4,X=-1.57+.067*Math.sin(a),Z=-1.18+.059*Math.cos(a);ball(X,1.578,Z,.059,.053,.059,'#dc9847');ball(X,1.628,Z,.014,.008,.012,'#82905c')}
for(let j=0;j<7;j++){let a=j*TAU/7;let x=-2.23+.139*Math.sin(a),z=-1.03+.126*Math.cos(a);ball(x,1.599+.021*Math.sin(a*2),z,.017,.011,.018,'#b4b4a0')}
for(let j=0;j<8;j++){let a=j*TAU/8;ball(-1.02+.127*Math.sin(a),1.379,-1.6+.127*Math.cos(a),.034,.016,.035,pick(['#a55f3c','#be6e39','#645549']))}
for(let j=0;j<3;j++){
  let x=-6.31+j*.134,y=1.152,z=-1.01+j*.048;
  box(x,y,z,.112,.037,.048,'#c3baa2',0,.23);
  box(x+.009,y+.023,z,.049,.013,.044,['#b46950','#8489ab','#b9a16b'][j],0,.23);
  ball(x+.065,y,z,.014,.014,.015,'#675f52');
}
for(let j=0;j<3;j++)box(-5.08+j*.062,1.154,-.66,.112,.014,.01,'#907958',0,-.31+j*.17);
for(let j=0;j<12;j++)rock(-4.99+R(-.09,.14),1.124,-.61+R(-.05,.04),.012,.004,.006,'#c6b89d');
for(let a of [-1,1])for(let b of [-1,1])box(-2.97+a*.704,2.77+b*.633,-4.474,.037,.037,.009,gold);
world=gardenRoot;
// The sacred mirror sits on a cypress stand with two paper wands and a pair of offerings.
atSite('hall',()=>{
plank(4.4,2.87,-5.23,1.46,.09,.42,'#aa7a50');
for(let a of [-1,1]){
  box(4.4+a*.58,2.69,-5.23,.083,.31,.25,wood);
  let X=4.4+a*.48;
  rod(X,2.9,-5.27,X+a*.047,3.45,-5.27,.014,lightwood);
  for(let j=0;j<4;j++){
    let xx=X+a*(.029+j*.033),yy=3.409-j*.064;
    box(xx,yy,-5.265,.095,.076,.014,paper,0,0,a*.46);
    box(xx+a*.017,yy-.055,-5.263,.046,.083,.013,'#e9dabe',0,0,-a*.22);
  }
  cyl(X,2.908,-5.06,.087,.023,'#a88b65');
  ball(X,2.956,-5.06,.062,.046,.062,'#e6ddbc');
}
cyl(4.4,2.96,-5.43,.17,.074,gold,.7);rod(4.4,2.96,-5.43,4.4,3.31,-5.44,.035,gold);
let reflectionTex=canvasTex(256,256,(p,w,h)=>{
  let grad=p.createLinearGradient(0,0,w*.84,h);grad.addColorStop(0,'#e3d5aa');grad.addColorStop(.3,'#d3d8c0');grad.addColorStop(.64,'#91a9a4');grad.addColorStop(1,'#637d7c');p.fillStyle=grad;p.fillRect(0,0,w,h);
  for(let k=0;k<3;k++){p.fillStyle=['#b3beb09c','#9aaea699','#829c9277'][k];p.beginPath();p.moveTo(0,190);for(let x=0;x<=w;x+=2)p.lineTo(x,122+k*19+14*Math.sin(x*.025+k)+12*Math.cos(x*.042));p.lineTo(w,256);p.lineTo(0,256);p.fill()}
  p.strokeStyle='#e6debd88';p.lineWidth=2;for(let r of [112,119]){p.beginPath();p.arc(128,128,r,0,TAU);p.stroke()}
  for(let i=0;i<7;i++){p.strokeStyle='#edf0d072';p.beginPath();p.moveTo(41+i*13,165-i*6);p.lineTo(65+i*14,158-i*6);p.stroke()}
});
let polishedMirror=mesh(new T.CircleGeometry(.329,48),0,4.4,3.539,-5.46,new T.MeshBasicMaterial({map:reflectionTex}));polishedMirror.castShadow=false;

});
world=sites.studio;
const catFeet=cat.children.slice(-2);
let caughtLeaf=mesh(mapleGeo,'#d67d3b');caughtLeaf.scale.setScalar(.093);
anim.push(t=>{
  const moment=t%88,stretch=Math.sin(Math.PI*clamp((moment-40)/3,0,1));
  const reach=Math.sin(Math.PI*clamp((moment-59)/2.1,0,1));
  const walking=moment>43&&moment<54||moment>66&&moment<79;
  cat.scale.x=1+stretch*.24;cat.scale.z=1-.06*stretch;
  cat.scale.y-=.12*stretch;
  catFeet.forEach((foot,i)=>{
    foot.position.x=.12+.059*stretch+(walking?Math.sin(t*6.1+i*Math.PI)*.047:0)+(i?.08*reach:0);
    foot.position.y=.028+(walking?.025*Math.max(0,Math.sin(t*6.1+i*Math.PI)):0)+(i?.12*reach:0);
  });
  caughtLeaf.visible=moment>57.3&&moment<63;
  let u=clamp((moment-57.3)/5.7,0,1);
  caughtLeaf.position.copy(cat.position);caughtLeaf.position.x+=.16+Math.sin(u*8)*.073;caughtLeaf.position.y+=.69*(1-u)+.13;caughtLeaf.position.z+=.13;
  caughtLeaf.rotation.set(u*6,u*7,2*u);
});
world=gardenRoot;
const settledCount=86,settled=new T.InstancedMesh(fanGeo,paint,settledCount),settleData=[];
world.add(settled);settled.frustumCulled=false;
for(let i=0;i<settledCount;i++){
  let x,y,z;
  if(i%3===0){let step=i%stairN;x=axisX+R(-.99,.99);z=stairFront-stairRun*step+R(-.13,.13);y=stairLevel(step)+.008+treadSurface(x-axisX,z-(stairFront-stairRun*step))}
  else if(i%3===1){let u=R(.08,.94);x=R(-6.3,-.53);z=-2.65-2.3*u;if(Math.hypot(x+3.6,(z+3.44)/.925)<.66)x=-4.34;y=4.14+.81*(1-u)**1.5+.14*((x+3.48)/3.275)**2*u+.06}
  else{x=R(-.08,1.62);z=R(-3.74,-2.44);y=terraceY+.014}
  const parent=['upper','studio','treeGround'][i%3];
  const landed=sitePoint(parent,[x,y,z]);x=landed.x;y=landed.y;z=landed.z;
  settleData.push({x,y,z,turn:R(0,TAU),phase:R(0,77),s:R(.046,.111)});
  settled.setColorAt(i,new T.Color(pick(ginCols)));
}
anim.push(t=>{
  settleData.forEach((d,i)=>{
    let u=(t+d.phase)%80,flight=clamp(u/2.6,0,1);
    rainTransform.position.set(d.x+.16*(1-flight)*Math.sin(flight*8+i),d.y+(1-flight)*1.23,d.z);
    rainTransform.rotation.set(-1.56+(1-flight)*.8,0,d.turn+(1-flight)*4);
    rainTransform.scale.setScalar(d.s*Math.min(1,u*3,clamp((70-u)/8,0,1)));
    rainTransform.updateMatrix();settled.setMatrixAt(i,rainTransform.matrix);
  });
  settled.instanceMatrix.needsUpdate=true;
});
world=sites.studio;
for(const page of world.children.filter(o=>o.geometry?.type==='PlaneGeometry'&&o.geometry.parameters.width===.32&&o.position.y<1.14)){
  const geo=new T.PlaneGeometry(.32,.41,5,6);page.geometry.dispose();page.geometry=geo;
  const rest=geo.attributes.position.array.slice();
  anim.push(t=>{
    const lift=windStrength(t-2.7,page.position.x,page.position.z)*(.067+.017*Math.sin(t*3.38));
    for(let i=0;i<geo.attributes.position.count;i++){
      const x=rest[i*3],y=rest[i*3+1],corner=Math.max(0,x/.32+y/.41);
      geo.attributes.position.setZ(i,lift*corner*corner);
    }
    geo.attributes.position.needsUpdate=true;
  });
}
world=gardenRoot;
atSite('purification',()=>{
const basinY=.14+.545*1.12;
for(let i=0;i<28;i++){
  const angle=i*2.39996, radius=i<18?R(.27,.44):R(.07,.27),x=2.81+Math.cos(angle)*radius,z=1.35+Math.sin(angle)*radius;
  if(i%4===0){leaf(x,basinY+.015,z,.069,0,pick(mapCols),true);continue}
  const color=pick(['#be6764','#eed5a0','#db9c66','#ac779c','#e4b696']);
  for(let j=0;j<7;j++){
    const a=j*TAU/7;ball(x+Math.cos(a)*.026,basinY+.013,z+Math.sin(a)*.026,.028,.012,.016,color,0,-a);
  }
  ball(x,basinY+.028,z,.014,.011,.014,'#d4af61');
}
for(let i=0;i<3;i++){
  const x=2.62+i*.15;
  cyl(x,.806,1.18,.069,.065,'#c0a572',1.03);
  cyl(x,.837,1.18,.054,.004,'#947b52');
  ring(x,.841,1.18,.063,.008,'#d7c49a',Math.PI/2);
}
let basinRing=mesh(new T.TorusGeometry(1,.018,4,38),'#d1e5c7',2.77,basinY+.021,1.34);basinRing.rotation.x=-Math.PI/2;
anim.push(t=>{let u=(t*.71)%1;basinRing.scale.setScalar(.027+.124*u);basinRing.visible=u<.86});

});
world=sites.studio;
function apronTexture(p,w,h){
  p.fillStyle='#778a85';p.fillRect(0,0,w,h);
  for(let i=0;i<400;i++){p.fillStyle=i%2?'#d4c7ab32':'#3c514038';p.fillRect(R(0,w),R(0,h),R(1,3),R(2,5))}
  p.strokeStyle='#d6c8a8';p.lineWidth=2;p.setLineDash([7,4]);p.strokeRect(w*.17,h*.57,w*.67,h*.23);
  for(let i=0;i<43;i++){p.fillStyle=pick(['#c48a54','#9a6265','#b8c0a6','#cab99a','#9099aa']);p.beginPath();p.ellipse(R(w*.12,w*.91),R(h*.38,h*.91),R(1,5),R(1,3),R(-2,2),0,TAU);p.fill()}
}
let apronShape=new T.Shape();[[-.075,.25],[.075,.25],[.099,.13],[.144,.077],[.165,-.26],[.05,-.28],[-.043,-.258],[-.16,-.27],[-.144,.078],[-.1,.13]].forEach(([x,y],i)=>i?apronShape.lineTo(x,y):apronShape.moveTo(x,y));apronShape.closePath();
let apronGeometry=new T.ShapeGeometry(apronShape);let apos=apronGeometry.attributes.position,auv=apronGeometry.attributes.uv;
for(let i=0;i<apos.count;i++)auv.setXY(i,(apos.getX(i)+.17)/.34,(apos.getY(i)+.28)/.53);
mesh(apronGeometry,0,-4.9,2.18,-4.43,new T.MeshToonMaterial({map:canvasTex(220,300,apronTexture),gradientMap:grad,side:T.DoubleSide}));
ring(-4.9,2.49,-4.428,.067,.008,'#647a70',0,0,0,1.63);ball(-4.9,2.588,-4.426,.021,.022,.025,wood);
for(let a of [-1,1])rod(-4.9+a*.14,2.24,-4.425,-4.9+a*.215,2.02,-4.414,.008,'#7b8880');
// A slender brass sextant, with tangent arm, arc, index mirror and sighting tube.
const sx=-3.88,sz=-1.51,sy=1.145;
for(let a of [-1,1])rod(sx,sy+.209,sz,sx+a*.106,sy+.029,sz,.009,gold);
let arc=[];for(let j=0;j<=16;j++){let a=(-.58+j*.0725);arc.push([sx+Math.sin(a)*.205,sy+.209-Math.cos(a)*.205,sz]);if(j%2===0)rod(sx+Math.sin(a)*.189,sy+.209-Math.cos(a)*.189,sz,sx+Math.sin(a)*.206,sy+.209-Math.cos(a)*.206,sz,.003,'#715e42')}
pipe(arc,.008,gold);rod(sx,sy+.207,sz+.006,sx+.041,sy+.014,sz+.006,.009,gold);box(sx-.049,sy+.148,sz,.041,.032,.011,'#bec9bb',0,0,.21);rod(sx+.01,sy+.166,sz,sx+.085,sy+.186,sz,.013,'#9e814f');
world=gardenRoot;
// The stream's banks carry the bridge ends down to the path in shallow steps.
for(let side of [-1,1]){
  for(let i=0;i<4;i++){
    let x=1.11+side*(.849+i*.151),z=2.18+(side>0?i*.133:0);
    let elevation=.611-i*.131;
    let w=.22,d=.81-i*.039;
    box(x,elevation*.5,z,w,elevation,d,'#8d8b73');
    obj(wallBlocks[(i+(side+1)*2)%9],x,elevation+.019,z,w+.05,.07,d,'#aaa58c');
    if(i%2===0)leaf(x,elevation+.064,z+.21,.064,false,'#aa6338',true);
  }
}
for(let z of [2.98,3.12])for(let x of [.76,1.44]){
  rod(x,.122,z,x,streamSurface(z)+.068,z,.039,wood);
  stone(x,.115,z,.095);
}
atSite('dipper',()=>{
for(let k=0;k<8;k++){
  let a=k*TAU/8;
  rock(1.06+Math.sin(a)*.194,.295,2.39+Math.cos(a)*.171,.144,.183,.116,pick(['#889381','#979b83','#7e8c75']));
}

});
// Rounded, tapering roots follow the exposed rock and the soil cut.
for(let j=0;j<7;j++){
  let z=-5.88+j*.91,side=j%2?1:-1;
  rootCurve([[7.013,.061,z],[7.022,-.087,z+side*.23],[7.024,-.245,z+side*.53],[7.03,-.406,z+side*.49],[7.028,-.536,z+side*.69],[7.035,-.787,z+side*.82]],.048,'#796549');
  rootCurve([[7.027,-.26,z+side*.52],[7.029,-.347,z+side*.33],[7.029,-.511,z+side*.31],[7.031,-.644,z+side*.15]],.017,'#8e7556');
}
world=sites.treeGround;
for(let j=0;j<7;j++){
  const x=.13+.17*j,z=-2.275;
  rootCurve([[.61,3.22,-3.05],[.48+.12*j,2.78,-2.78],[x,2.735,-2.43],[x+.06,2.53,z],[x-.08,2.12,z+.013],[x+.09,1.78,z],[x+.21,1.53,z+.018]],.089,'#796548');
}
world=gardenRoot;
function shard(x,y,z,rx,ry,scale,color){
  let outline=polygon([[-.61,-.21],[-.4,.38],[.07,.46],[.55,.14],[.38,-.39],[-.23,-.47]]);
  obj(outline,x,y,z,scale,scale,scale,color,rx,ry,-.24);
}
for(let k=0;k<6;k++)shard(7.039,-.64-.055*(k%3),-1.95+k*.19,0,Math.PI/2,.087+k*.008,k%2?'#ad7658':'#c78e68');
for(let k=0;k<3;k++){
  let x=4.85+k*.142,y=-.807+k*.032;
  let coin=new T.Shape();coin.absarc(0,0,.052,0,TAU,false);
  let square=new T.Path();square.moveTo(-.012,-.012);square.lineTo(-.012,.012);square.lineTo(.012,.012);square.lineTo(.012,-.012);square.closePath();coin.holes.push(square);
  let disc=mesh(new T.ShapeGeometry(coin),'#a59b6f',x,y,7.034);
  disc.rotation.z=.24*k;ring(x,y,7.038,.043,.004,'#857e60');
}
// Cut rafter ends, hinoki planks and weathered copper fittings on the shrine's gables.
function gableDetails(x,y,z,s){
  for(let side of [-1,1]){
    let X=x+side*1.39*s,E=y+2.346*s;
    face([[X,E,z-1.05*s],[X,E,z+1.05*s],[X,E+.74*s,z]],side>0?[0,1,2]:[0,2,1],'#b68a5d');
    for(let j=-5;j<=5;j++){let u=j/5,ht=.71*(1-Math.abs(u));if(ht>.03)box(X+side*.013*s,E+ht*s*.5,z+.99*u*s,.024*s,ht*s,.021*s,'#8c6949')}
    for(let sg of [-1,1]){
      rod(X,E+.72*s,z,X,E,z+sg*1.065*s,.051*s,wood,1,4);
      rod(X+side*.056*s,E+.62*s,z+sg*.04*s,X+side*.056*s,E+.025*s,z+sg*.96*s,.018*s,'#d3aa73');
    }
    box(X+side*.041*s,E+.066*s,z,.095*s,.095*s,2.13*s,wood);
    box(X+side*.057*s,E+.341*s,z,.09*s,.602*s,.083*s,wood);
    for(let j=0;j<12;j++){
      let zz=z-.85*s+j*.153*s,xx=x+side*1.125*s;
      box(xx,y+1.24*s,zz,.025*s,1.52*s,.143*s,['#ae7950','#a5714d','#af7e55'][j%3]);
    }
    for(let h of [.57,1.67])box(x+side*1.145*s,y+h*s,z,.052*s,.065*s,1.77*s,'#8b583f');
  }
  for(let i=-5;i<=5;i++){
    let xx=x+i*.188*s;
    box(xx,y+1.24*s,z-.995*s,.178*s,1.56*s,.025*s,i%2?'#a7734d':'#af7b52');
    if(i%2===0)for(let zz of [-1,1])box(xx,y+2.222*s,z+zz*1.19*s,.063*s,.117*s,.37*s,'#a87d53');
  }
  for(let h of [.62,1.84])box(x,y+h*s,z-1.023*s,2.19*s,.091*s,.061*s,wood);
  for(let side of [-1,1]){
    const xx=x+side*1.53*s;
    ring(xx,y+3.244*s,z,.105*s,.016*s,'#b79358',0,Math.PI/2);
    for(let j=-1;j<=1;j++)ball(xx+side*.031*s,y+3.248*s+j*.034*s,z,.032*s,.013*s,.021*s,'#c4a86b');
  }
}
atSite('hall',()=>gableDetails(4.4,1.98,-4.86,1.13));atSite('inari',()=>gableDetails(2.49,.526,-1.86,.367));
world=sites.studio;
// A narrow run of tools and vessels fits between the platform's foundation piers.
for(let j=0;j<3;j++){
  let x=-5.82+j*.59,z=-.17;
  pot(x,.116,z,.178+j*.021,['#977863','#65796b','#a27b58'][j]);
  ring(x,.297+j*.017,z,.17+j*.019,.009,'#b19973',Math.PI/2);
}
for(let j=0;j<4;j++){
  let x=-6.05+j*.14;
  box(x,.236,-1.62,.121,.23,.39,'#9f7a55');
  box(x,.284,-1.41,.116,.038,.022,'#c1a17a');
}
for(let k=0;k<7;k++){
  let xx=-1.89+k*.148,yy=.244+(k%2)*.103;
  rod(xx,yy,-.28,xx,yy,.13,.084,wood);
  cyl(xx,yy,.15,.036,.014,'#b99a73');
  ring(xx,yy,.142,.057,.006,'#ba9d73');
}
for(let side of [-1,1]){
  roofMember([-3.6+side*.575,4.77,-2.92],[-3.6+side*.575,4.339,-4.02],.04,wood,4);
  const z=-3.44+side*.545,y=4.605+side*.22;
  roofMember([-4.18,y-.085,z],[-3.021,y-.085,z],.044,wood,4);
}
for(let j=0;j<16;j++){
  let a=j*TAU/16,z=-3.44+.504*Math.sin(a);
  ball(-3.6+.544*Math.cos(a),4.655+.207*Math.sin(a),z,.019,.014,.019,'#dec898');
}
const aperture=V(-3.6,4.608,-3.44),illumination=V(ox,oy+.12,oz),shaftAxis=aperture.clone().sub(illumination);
const shaftMaterial=new T.ShaderMaterial({
  uniforms:{sunAmount:{value:1}},transparent:true,depthWrite:false,side:T.FrontSide,
  vertexShader:'varying vec2 openingUV;varying vec3 normalEye;varying vec3 viewRay;void main(){openingUV=uv;normalEye=normalMatrix*normal;vec4 pt=modelViewMatrix*vec4(position,1.);viewRay=-pt.xyz;gl_Position=projectionMatrix*pt;}',
  fragmentShader:`uniform float sunAmount;varying vec2 openingUV;varying vec3 normalEye;varying vec3 viewRay;
  void main(){float sides=abs(dot(normalize(normalEye),normalize(viewRay)));float height=smoothstep(.0,.22,openingUV.y)*(1.-smoothstep(.89,1.,openingUV.y));
  float opacity=.073*sunAmount*height*pow(sides,.72);gl_FragColor=vec4(.98,.86,.54,opacity);
  #include <colorspace_fragment>
  }`
});
const skyShaft=mesh(new T.CylinderGeometry(.477,.27,shaftAxis.length(),36,1,true),0,0,0,0,shaftMaterial);
skyShaft.position.copy(aperture).lerp(illumination,.5);skyShaft.quaternion.setFromUnitVectors(V(0,1,0),shaftAxis.normalize());skyShaft.castShadow=false;
const lightPetals=canvasTex(128,128,(p,w,h)=>{
  let g=p.createRadialGradient(64,64,3,64,64,60);g.addColorStop(0,'rgba(246,233,174,.40)');g.addColorStop(.71,'rgba(245,230,169,.32)');g.addColorStop(.85,'rgba(247,234,179,.15)');g.addColorStop(1,'rgba(245,230,169,0)');
  p.fillStyle=g;p.fillRect(0,0,w,h);
});
const brightMat=mesh(new T.PlaneGeometry(1.16,1.67),0,ox,1.127,oz+.45,new T.MeshBasicMaterial({map:lightPetals,transparent:true,opacity:.68,depthWrite:false}));
brightMat.rotation.x=-Math.PI/2;brightMat.castShadow=false;
anim.push(t=>{
  const front=(t+.5)%56*1.8-55;
  const cover=1-T.MathUtils.smoothstep(Math.abs(front+4.5),2.5,9);
  shaftMaterial.uniforms.sunAmount.value=1-cover*.83;
  brightMat.material.opacity=.57*(1-cover*.74);
});
world=gardenRoot;
const mistMap=canvasTex(256,64,(p,w,h)=>{
  for(let n=0;n<6;n++){
    p.save();p.translate(39+n*34,32+Math.sin(n*1.6)*3);p.scale(1,.19);
    let grad=p.createRadialGradient(0,0,0,0,0,47);grad.addColorStop(0,'rgba(209,223,205,.17)');grad.addColorStop(.55,'rgba(212,226,207,.105)');grad.addColorStop(1,'rgba(218,228,210,0)');
    p.fillStyle=grad;p.fillRect(-47,-47,94,94);p.restore();
  }
});
for(let j=0;j<6;j++){
  const fog=new T.Sprite(new T.SpriteMaterial({map:mistMap,transparent:true,opacity:.47,depthWrite:false}));
  world.add(fog);fog.position.set(j<3?-5.85+j*1.65:2.11+(j-3)*1.59,(j<3?1.68:3.8)+(j%3)*.23,-6.49+(j%2)*.11);fog.scale.set(3.12,.86,1);
  anim.push(t=>{fog.position.x=(j<3?-5.85+j*1.65:2.11+(j-3)*1.59)+.21*Math.sin(t*.083+j*.91);fog.material.opacity=.36+.1*Math.cos(t*.12+j)});
}
// A moving wash of cirrus; all positions come from the same clock as the cloud shadow.
const cloudLayer=document.createElement('canvas');cloudLayer.setAttribute('aria-hidden','true');cloudLayer.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';stage.before(cloudLayer);
const wisps=document.createElement('canvas');wisps.width=640;wisps.height=106;
{
  const p=wisps.getContext('2d');
  for(let n=0;n<120;n++){
    const u=R(.04,.75),x=u*640,y=55-24*u+R(-7,7),len=R(47,171);
    const grad=p.createLinearGradient(x,y,x+len,y);grad.addColorStop(0,'rgba(255,252,228,0)');grad.addColorStop(.41,'rgba(255,252,228,.12)');grad.addColorStop(1,'rgba(255,252,228,0)');
    p.fillStyle=grad;p.beginPath();p.moveTo(x,y);p.bezierCurveTo(x+len*.3,y+2,x+len*.57,y-6,x+len,y-12);p.bezierCurveTo(x+len*.65,y-4,x+len*.22,y+5,x,y+.6);p.fill();
  }
}
let lastSkySample=-1;
function drawClouds(t){
  const w=Math.ceil(innerWidth*.65),h=Math.ceil(innerHeight*.65),sample=Math.floor(t*12);
  if(w!==cloudLayer.width||h!==cloudLayer.height){cloudLayer.width=w;cloudLayer.height=h;lastSkySample=-1}
  if(sample===lastSkySample)return;lastSkySample=sample;
  const p=cloudLayer.getContext('2d');p.clearRect(0,0,w,h);
  for(let j=0;j<5;j++){
    const u=((j*.268+sample/12*.00094)%1.35)-.28;
    p.globalAlpha=.46+.1*Math.sin(j*2.7);
    p.drawImage(wisps,w*u,h*(.07+.059*(j%3)),w*(.23+.054*(j%3)),h*(.11+.023*(j%2)));
  }
}
anim.push(drawClouds);
const mineralSurface=paint.clone();
mineralSurface.onBeforeCompile=shader=>{
  shader.vertexShader='varying vec3 mineralP;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n mineralP=(instanceMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=`
  varying vec3 mineralP;
  float stoneHash(vec2 p){return fract(sin(dot(p,vec2(21.73,193.27)))*15943.37);}
  float stoneNoise(vec2 p){vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(stoneHash(cell),stoneHash(cell+vec2(1,0)),f.x),mix(stoneHash(cell+vec2(0,1)),stoneHash(cell+vec2(1)),f.x),f.y);}
  `+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  vec2 strata=vec2(mineralP.x+mineralP.z*.87,mineralP.y+mineralP.z*.31);
  float grains=stoneNoise(strata*53.);float patches=stoneNoise(strata*5.3+stoneNoise(strata*9.));
  diffuseColor.rgb*=.91+.12*grains+.091*patches;
  float lichen=smoothstep(.59,.83,patches+.16*grains);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.82,.99,.69),lichen*.55);
  `);
};mineralSurface.customProgramCacheKey=()=>'rock-lichen';paperWeather(mineralSurface);
for(const batch of batches.values())if(wallBlocks.includes(batch.g)||batch.g===rockG)batch.mat=mineralSurface;
// A silver pastry server follows the wedge's curved back and tapers to a fine tip.
const wedgeX=px+.57,wedgeZ=pz+.31,wedgeAngle=.385;
function flatSilhouette(points,height,depth,color){
  const shape=new T.Shape();
  points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:2,bevelSize:.009,bevelThickness:.006,curveSegments:3});
  let o=mesh(geo,color,0,height,0);o.rotation.x=-Math.PI/2;return o;
}
const serverEdge=[[wedgeX-.12,wedgeZ-.039]];
for(let i=0;i<=18;i++){
  const a=.082+i*(.687-.082)/18;
  serverEdge.push([wedgeX+Math.cos(a)*(pr+.091),Math.min(6.999,wedgeZ+Math.sin(a)*(pr+.091))]);
}
flatSilhouette(serverEdge,.144,.035,'#afb9b4');
const dx=.32,dz=-.9474,neckX=wedgeX+Math.cos(.25)*(pr+.047),neckZ=wedgeZ+Math.sin(.25)*(pr+.047);
function onHandle(length,offset){
  return [neckX+dx*length-dz*offset,neckZ+dz*length+dx*offset];
}
let silhouette=[];
for(const [length,width] of [[-.09,.087],[.12,.068],[.28,.038],[.43,.052],[.88,.093],[1.00,.129],[1.09,.105],[1.14,.06]])silhouette.push(onHandle(length,width));
for(const [length,width] of [[1.16,0],[1.14,-.06],[1.09,-.105],[1,-.129],[.88,-.093],[.43,-.052],[.28,-.038],[.12,-.068],[-.09,-.087]])silhouette.push(onHandle(length,width));
flatSilhouette(silhouette,.158,.053,'#b5bdb4');
for(let side of [-1,1]){
  let line=[];for(let j=0;j<12;j++){const len=.35+j*.066,p=onHandle(len,side*(.029+.033*Math.sin(j/11*Math.PI)));line.push([p[0],.218,p[1]])}pipe(line,.008,'#e1dfc7');
}
let tip=onHandle(1.018,0);ring(tip[0],.219,tip[1],.043,.009,'#808a83',Math.PI/2);
for(const a of [.11,.66]){
  const sign=a>.4?1:-1,nx=-Math.sin(a)*sign,nz=Math.cos(a)*sign,v=Math.cos(a),w=Math.sin(a);
  function pos(d,h,n=.009){return [wedgeX+v*d+nx*n,h,wedgeZ+w*d+nz*n]}
  face([pos(0,.18),pos(pr,.18),pos(pr,.239),pos(0,.239)],[0,1,2,0,2,3],'#cd9653');
  face([pos(0,.24),pos(pr,.24),pos(pr,.266),pos(0,.266)],[0,1,2,0,2,3],'#e5c384');
  for(let j=0;j<26;j++){let p=pos(R(.055,pr-.03),R(.19,.237),.014);ball(...p,.011,.006,.009,'#ab7b49')}
  for(let j=0;j<4;j++){
    let p=pos(.36+j*.49,.34+Math.sin(j)*.026,.012);
    let geometry=j%2?st:limeG,material=j%2?new T.MeshToonMaterial({color:'#dfc177',gradientMap:grad,side:T.DoubleSide}):limeMat;
    const slice=mesh(geometry,0,...p,material);slice.scale.set(.074,.066,.074);slice.rotation.y=Math.atan2(nx,nz);slice.rotation.z=.24*j;
  }
}
// The bamboo dipper fills at its pivot, pours into the stone bowl and falls back against its stop.
const bore=new T.Mesh(new T.CircleGeometry(.05,22),new T.MeshToonMaterial({color:'#53634b',side:T.DoubleSide,gradientMap:grad}));
bore.position.x=-.322;bore.rotation.y=-Math.PI/2;dripper.add(bore);
const bambooRim=new T.Mesh(new T.TorusGeometry(.056,.0075,6,24),new T.MeshToonMaterial({color:'#c3bf85',gradientMap:grad}));
bambooRim.position.x=-.324;bambooRim.rotation.y=Math.PI/2;dripper.add(bambooRim);
atSite('dipper',()=>{
rod(1.59,.41,2.52,1.59,1.155,2.52,.038,'#8f9963',1,11);
rod(1.59,1.143,2.53,1.64,1.102,2.294,.036,'#adb278',1,12);
for(let j=0;j<2;j++)ring(1.59,.69+j*.29,2.52,.039,.006,'#6f8054',Math.PI/2);
rock(1.829,.639,2.299,.115,.119,.13,'#8e9485');
for(let j=0;j<5;j++){
  let drop=mesh(sphereG,'#bfddc9');drop.castShadow=false;
  anim.push(t=>{
    let u=(t*2.17+j/5)%1;
    drop.position.set(1.64,1.09-.216*u*u,2.294);
    drop.scale.set(.007,.012+u*.007,.008);
  });
}
const dipperBowlY=.43+.545*.6;
for(let j=0;j<10;j++){
  let water=mesh(sphereG,'#bddccd');water.castShadow=false;
  anim.push(t=>{
    let phase=t%7,flow=clamp((phase-4.99)/.48,0,1)*(1-clamp((phase-5.52)/.51,0,1));
    water.visible=flow>.02;
    let u=(t*2.7+j/10)%1,ang=dripper.rotation.z;
    let lipX=1.53-.328*Math.cos(ang),lipY=.827-.328*Math.sin(ang);
    water.position.set(lipX-u*.146,lipY+(dipperBowlY+.01-lipY)*u*u,2.29+u*.067);
    water.scale.set(.015*flow,.012*flow,.012*flow);
  });
}
const bowlRipple=mesh(new T.TorusGeometry(1,.021,4,36),'#cee2c7',1.066,dipperBowlY+.013,2.366);
bowlRipple.castShadow=false;bowlRipple.rotation.x=-Math.PI/2;
anim.push(t=>{const u=clamp((t%7-5.25)/1.49,0,1);bowlRipple.visible=u>0&&u<1;bowlRipple.scale.setScalar(.031+.166*u)});

});
world=sites.studio;
// The cut flowers share the artist's palette but each species has its own corolla.
const botanicalPaint=new T.MeshToonMaterial({vertexColors:true,gradientMap:grad,side:T.DoubleSide});
const varieties=[
  {name:'rose',outer:'#d07969',inner:'#9d484b',layers:5,petals:7,shape:.75,points:0,center:'#d5a16c'},
  {name:'ranunculus',outer:'#f1be83',inner:'#dc864e',layers:6,petals:13,shape:.82,points:0,center:'#c49354'},
  {name:'anemone',outer:'#f2e6d5',inner:'#dfc6be',layers:1,petals:8,shape:1.15,points:0,center:'#393943'},
  {name:'dahlia',outer:'#c75b50',inner:'#a0463f',layers:4,petals:14,shape:.78,points:1,center:'#c58c49'},
  {name:'cosmos',outer:'#bb9bc5',inner:'#b286b1',layers:1,petals:8,shape:1.08,points:0,center:'#e4b654'},
  {name:'chrysanthemum',outer:'#e4bd62',inner:'#d5a346',layers:5,petals:18,shape:.61,points:.7,center:'#d5a955'}
];
function corolla(kind){
  const spec=varieties[kind],positions=[],colors=[],indices=[];
  const edgeColor=new T.Color(spec.outer),heartColor=new T.Color(spec.inner),color=new T.Color();
  const rows=7,columns=6;
  for(let row=0;row<spec.layers;row++){
    const inward=row/Math.max(1,spec.layers-1);
    const n=Math.max(3,Math.round(spec.petals*(1-inward*.47))),radius=1-inward*.62;
    for(let petal=0;petal<n;petal++){
      const theta=(petal+.37*row)*TAU/n+.09*Math.sin(petal*2.13+row);
      const start=positions.length/3;
      for(let k=0;k<=rows;k++){
        const u=k/rows;
        for(let j=0;j<=columns;j++){
          const v=j/columns*2-1;
          let taper=Math.sin(Math.pow(u,.86)*Math.PI*.86);
          if(spec.points)taper*=1-spec.points*Math.pow(u,3);
          let halfWidth=(Math.PI/n)*radius*spec.shape*taper*(kind===2?.87:kind===4?.85:1);
          let reach=(kind===0?.21:.08)+radius*.91*u;
          let bend=.13+row*.073+.33*u-.22*u*u+.12*v*v*u;
          if(kind===0){reach=.245*(1-inward)+.027*inward+radius*(.59*u+.14*Math.sin(Math.PI*u));bend=.17+.56*u-.37*u**3+row*.09}
          if(kind===1)bend=.11+.5*u-.26*u*u+row*.056;
          if(kind===2||kind===4)bend=.08+.14*u-.27*u*u+.12*v*v*u;
          if(kind===3)bend+=v*v*u*.32;
          if(kind===5)bend+=.27*Math.sin(Math.PI*u)+.18*u*u;
          if(kind===4)reach-=.069*(1-v*v)*u**7;
          const a=theta+(kind===0?.46*(1-u):.028*Math.sin(Math.PI*u+petal));
          positions.push(Math.cos(a)*reach-Math.sin(a)*v*halfWidth,bend,Math.sin(a)*reach+Math.cos(a)*v*halfWidth);
          const rim=Math.min(1,.21+.58*u+.12*Math.abs(v)+.09*Math.sin(petal+row*.51));
          color.copy(heartColor).lerp(edgeColor,rim).multiplyScalar(.92+.1*u+.035*Math.cos(v*5));
          colors.push(color.r,color.g,color.b);
          if(k&&j){const h=start+k*(columns+1)+j;indices.push(h,h-1,h-columns-2,h,h-columns-2,h-columns-1)}
        }
      }
    }
  }
  if(kind===0||kind===1){
    // Curled central petals close the bud in one continuous spiral.
    const start=positions.length/3,segments=60;
    for(let j=0;j<=segments;j++){
      const u=j/segments,theta=u*TAU*2.18,r=.018+.225*u;
      const top=.62+.12*u-.047*Math.cos(theta);
      for(let side=0;side<2;side++){
        const radius=r+(side?.056:-.013);
        positions.push(radius*Math.cos(theta),top+(side?.027:-.133),radius*Math.sin(theta));
        color.copy(heartColor).lerp(edgeColor,side?.73:.34);colors.push(color.r,color.g,color.b);
      }
      if(j){const a=start+j*2;indices.push(a-2,a,a+1,a-2,a+1,a-1)}
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
const corollas=varieties.map((_,kind)=>corolla(kind));
const tinWash=canvasTex(384,256,(p,w,h)=>{
  const g=p.createLinearGradient(0,0,w,0);
  for(const [n,c] of [[0,'#929f9d'],[.09,'#bcc7bd'],[.18,'#a9b3a9'],[.43,'#a1aaa2'],[.52,'#c3cbbd'],[.61,'#a4b2a9'],[.86,'#899792'],[1,'#929f9d']])g.addColorStop(n,c);
  p.fillStyle=g;p.fillRect(0,0,w,h);
  for(let i=0;i<2000;i++){p.fillStyle=pick(['#ecede016','#5967661a','#d8e6dc2b']);p.fillRect(R(0,w),R(0,h),R(1,7),R(.5,1.2))}
  p.fillStyle='#667776';p.fillRect(19,0,1,h);p.fillStyle='#d1d7ca';p.fillRect(21,0,2,h);
});
function tinBucket(x,y,z,r,h,painted){
  const profile=[[.05,.012],[.72,.012],[.78,.03],[.79,.09],[.98,.92],[1,.96],[1,.991],[.954,.999],[.928,.97],[.728,.12],[.05,.12]];
  const geo=new T.LatheGeometry(profile.map(([a,b])=>new T.Vector2(a*r,b*h)),32);
  const material=new T.MeshToonMaterial({color:painted||'#fbfcf7',map:tinWash,side:T.DoubleSide,gradientMap:grad});
  mesh(geo,0,x,y,z,material);
  cyl(x,y+h*.63,z,r*.867,.008,'#526265');
  for(let f of [.08,.83,.96])ring(x,y+h*f,z,r*(.766+f*.228),r*.027,'#a9b5ad',Math.PI/2);
  let wire=[];for(let k=0;k<=15;k++){let a=k*Math.PI/15;wire.push([x+r*Math.cos(a),y+h*.79-.082*Math.sin(a),z+r*.99*Math.sin(a)])}
  pipe(wire,.0056,'#778783');
  for(let s of [-1,1])ball(x+s*r*.96,y+h*.79,z,.011,.012,.012,'#c1c7b8');
}
function cutStem(x,y,z,r,h,kind,j,count){
  const a=j*2.39996+.07*kind,rad=r*(.28+.92*Math.sqrt((j+.29)/count)),height=h*(1.12-(rad/r)*.22)+R(-.043,.047);
  let X=x+rad*Math.cos(a),Z=z+rad*Math.sin(a),Y=y+height;
  const bx=x+rad*.24*Math.cos(a),bz=z+rad*.24*Math.sin(a);
  rod(bx,y-.07,bz,X,Y,Z,.0058,'#60835e',.65,6);
  for(let f=0;f<(kind===6?3:4);f++){
    const t=.16+.16*f,q=a+f*2.2,X0=bx+(X-bx)*t,Y0=y+height*t,Z0=bz+(Z-bz)*t;
    obj(blade,X0+.025*Math.cos(q),Y0,Z0+.025*Math.sin(q),kind===6?.022:.047,.081,.046,pick(['#648260','#7a946c','#648967']),-.68,q,.55*(f%2?1:-1));
  }
  if(kind===6){
    for(let k=0;k<8;k++){
      const taper=1-k*.076,bend=.019*(k/7)**2;
      for(let m=0;m<3;m++){let a=m*TAU/3+k*.89;ball(X+bend+Math.cos(a)*.015*taper,Y+k*.018,Z+Math.sin(a)*.015*taper,.013*taper,.019*taper,.013*taper,pick(['#9884b6','#a598c7','#746c9b']),.1,k*.37)}
    }
    return;
  }
  const size=[.075,.066,.082,.084,.081,.071][kind]*R(.82,1.06),tilt=.37+.57*(.5+.5*Math.sin(a+.38)),roll=.25*Math.cos(a);
  obj(corollas[kind],X,Y,Z,size,size,size,pick(['#fffdfa','#fffbef','#fff5e5']),tilt,.18*Math.sin(j),roll,botanicalPaint);
  if(kind===0||kind===1||kind===3){
    const blush=kind===0?'#d48a7b':kind===1?'#ebaf77':'#bf6c58';
    ball(X,Y+size*.46,Z+size*.24,size*.19,size*.21,size*.18,blush,tilt,.05,roll);
    for(let f=0;f<5;f++){
      const a=f*TAU/5+.44*j,rr=size*.136;
      obj(petalG,X+rr*Math.cos(a),Y+size*.425,Z+rr*Math.sin(a)+size*.27,size*.32,size*.33,size*.33,blush,.47,a,.16);
    }
  }
  if(kind===2||kind===4||kind===5){
    const radius=kind===2?.018:kind===4?.021:.016;
    let cx=X-.004*Math.sin(roll),cy=Y+.012*Math.cos(tilt),cz=Z+.012*Math.sin(tilt);
    ball(cx,cy,cz,radius,.012,radius,varieties[kind].center,tilt,0,roll);
    for(let m=0;m<13;m++){
      let a=m*TAU/13,rr=radius*(kind===2?1.27:.73);
      ball(cx+rr*Math.cos(a),cy+.006-rr*Math.sin(a)*Math.sin(tilt),cz+.006+rr*Math.sin(a)*Math.cos(tilt),.0038,.0048,.0038,kind===2?'#766d65':'#f0cb71');
    }
  }
}
const reflectionBatchStart=new Map([...batches].map(([key,batch])=>[key,batch.m.length]));
const reflectionObjectStart=world.children.length;
for(const [kind,x,y,z,r,h,length,count,tint] of [
  [0,-6.28,1.65,.39,.16,.286,.338,8,'#e6ded0'],[1,-5.858,1.65,.37,.145,.24,.305,9,'#e1e7d3'],
  [6,-5.36,1.65,.323,.151,.359,.31,18,'#cbd8d1'],[3,-4.88,1.65,.382,.15,.267,.336,8,'#d6dcd5'],
  [2,-6.056,1.65,.634,.111,.203,.246,7,'#d4d7c9'],[4,-5.64,1.65,.635,.13,.195,.288,7,'#e3dbcf'],
  [5,-5.105,1.65,.619,.131,.196,.256,9,'#d4dfd6'],[0,-6.21,1.078,.722,.134,.227,.246,6,'#d3c9b7'],
  [6,-4.85,1.078,.675,.128,.26,.254,12,'#d8ddd4']
]){
  tinBucket(x,y,z,r,h,tint);
  suspended(x,y+h*.78,z,-.22,()=>{
    for(let j=0;j<count;j++)cutStem(x,y+h*.83,z,r,length,kind,j,count);
  });
}
// Paint the glass reflection from the actual arrangement, viewed from inside the atelier.
function recordBouquets(){
  const stillLife=new T.Scene();
  for(const [key,batch] of batches){
    const start=reflectionBatchStart.get(key)||0,count=batch.m.length-start;
    if(count<1)continue;
    const group=new T.InstancedMesh(batch.g,batch.mat,count);
    for(let i=0;i<count;i++){
      group.setMatrixAt(i,batch.m[start+i]);
      group.setColorAt(i,new T.Color(batch.c[start+i]));
    }
    stillLife.add(group);
  }
  for(const object of world.children.slice(reflectionObjectStart)){
    if(object.isMesh)stillLife.add(object.clone());
  }
  const sun=new T.DirectionalLight('#ffedc4',1.8);sun.position.set(-3,6,2);
  stillLife.add(sun,new T.HemisphereLight('#f3f4dc','#a5afad',1.65));
  const reflectedCamera=new T.PerspectiveCamera(37.6,1.065/2.01,.05,12);
  reflectedCamera.position.set(-6.06,2.73,-2.9);reflectedCamera.lookAt(-5.91,2.61,.04);
  const portrait=new T.WebGLRenderTarget(320,600,{samples:2});
  renderer.setRenderTarget(portrait);renderer.clear();renderer.render(stillLife,reflectedCamera);renderer.setRenderTarget(null);
  portrait.texture.wrapS=T.RepeatWrapping;portrait.texture.repeat.x=-1;portrait.texture.offset.x=1;
  const reflection=mesh(new T.PlaneGeometry(1.065,2.01),0,-5.91,2.61,front+.048,
    new T.MeshBasicMaterial({map:portrait.texture,color:'#bfcfc5',transparent:true,depthWrite:false,opacity:.37}));
  reflection.castShadow=false;reflection.receiveShadow=false;
  for(const obj of stillLife.children)if(obj.isInstancedMesh)obj.dispose();
  stillLife.clear();
}
recordBouquets();
for(let x of [-5.68,-5.2])box(x,1.232,.926,.037,.314,.037,wood,-.12);
// A moving aurora is drawn over the engraved celestial chart on the central globe.
const planetShader=new T.ShaderMaterial({
  uniforms:{chart:{value:starGlobe},clock:{value:0},crossing:{value:0}},
  vertexShader:`
    varying vec2 surfaceUV;varying vec3 viewNormal;varying vec3 towardsEye;
    void main(){surfaceUV=uv;viewNormal=normalMatrix*normal;vec4 eye=modelViewMatrix*vec4(position,1.);towardsEye=-eye.xyz;gl_Position=projectionMatrix*eye;}
  `,
  fragmentShader:`
    uniform sampler2D chart;uniform float clock;uniform float crossing;
    varying vec2 surfaceUV;varying vec3 viewNormal;varying vec3 towardsEye;
    void main(){
      vec2 uv=surfaceUV;
      uv.x=fract(uv.x+.009*sin(uv.y*9.+clock*.22)+.004*sin(uv.y*16.-clock*.13));
      vec3 ink=texture2D(chart,uv).rgb;
      vec3 n=normalize(viewNormal),v=normalize(towardsEye);
      float light=dot(n,normalize(vec3(-.48,.64,.74)));
      float rim=pow(1.-max(dot(n,v),0.),2.4);
      float line=.41+.17*sin(uv.x*6.283+clock*.23)+.053*sin(uv.x*18.849-clock*.18);
      float aurora=exp(-pow((uv.y-line)*38.,2.))*.53+exp(-pow((uv.y-line-.047)*74.,2.))*.17;
      vec3 shaded=ink*(.62+.43*smoothstep(-.29,.82,light)) + vec3(.006,.033,.056);
      shaded+=vec3(.20,.42,.35)*aurora+vec3(.18,.29,.18)*rim;
      shaded=mix(shaded,shaded*1.09+vec3(.13,.16,.105),crossing);
      gl_FragColor=vec4(shaded,1.);
      #include <colorspace_fragment>
    }
  `
});
// The original chart texture is also used by the globe's flowing surface.
core.material.dispose();core.material=planetShader;
anim.push(t=>{planetShader.uniforms.clock.value=t;planetShader.uniforms.crossing.value=crossingLight(t);});
const brass='#b38d52',brightBrass='#e4c78b';
for(let i=0;i<12;i++){
  const a=i*TAU/12+Math.PI/12,x=ox+Math.sin(a)*.486,z=oz+Math.cos(a)*.486;
  const plaque=polygon([[-.092,0],[-.054,.041],[0,.061],[.054,.041],[.092,0],[.054,-.04],[0,-.061],[-.054,-.04]]);
  obj(plaque,x,1.245,z,1,1,1,'#ac8958',0,a);
  obj(st,x+.004*Math.sin(a),1.247,z+.004*Math.cos(a),.031,.031,.031,'#67533d',0,a,.28);
  for(let j of [-1,1])ball(x+j*.063*Math.cos(a)+.005*Math.sin(a),1.245,z-j*.063*Math.sin(a)+.005*Math.cos(a),.008,.008,.008,brightBrass);
}
for(let i=0;i<40;i++){
  const a=TAU*i/40,rr=.438,x=ox+Math.cos(a)*rr,z=oz+Math.sin(a)*rr;
  rod(x,1.416,z,ox+Math.cos(a)*(rr-(i%5?.024:.052)),1.416,oz+Math.sin(a)*(rr-(i%5?.024:.052)),.0037,'#826c4b',1,5);
}
for(let side of [-1,1]){
  let X=ox+side*.59;rod(X-.032,oy,oz,X+.032,oy,oz,.051,brass,1,14);
  for(let k of [-1,0,1])ring(X+k*.028,oy,oz,.056,.007,brightBrass,0,Math.PI/2);
  for(let j=0;j<2;j++){
    let line=[];for(let k=0;k<=24;k++){let u=k/24,a=u*TAU*.79,rr=.102*(1-u*.79);line.push([ox+side*(.29+j*.078+.089*u)+Math.cos(a)*rr,1.517+j*.094+Math.sin(a)*rr,oz+.021])}
    pipe(line,.011,'#bb965e');
  }
}
// The ring pendant is fixed to its rotating meridian.
for(const i of [2,4]){
  const axis=orbs[i],R=.448+i*.045;
  for(let k=0;k<12;k++){
    let a=(k+.5)*TAU/12,rivet=new T.Mesh(sphereG,giltFinish);rivet.scale.set(.0065,.0065,.005);
    rivet.position.set(R*Math.cos(a),R*Math.sin(a),.012);axis.add(rivet);
  }
}
// A shallow paintbox with crimped tubes, a hinged lid and a pocket watercolour tin.
const paintDeskY=1.647,paintBoxX=-5.94,paintBoxZ=-1.947;
function paintBox(x,y,z,w,d,h){
  box(x,y+.012,z,w,.024,d,'#9b7650');
  for(let side of [-1,1]){
    box(x+side*(w*.5-.012),y+h/2,z,.022,h,d,'#977047');
    box(x,y+h/2,z+side*(d*.5-.012),w-.04,h,.022,'#b18a5e');
  }
  box(x,y+h*.59,z+d*.5+.005,.057,.038,.008,'#bb9a62');
  for(let side of [-1,1])ball(x+side*.198,y+h*.72,z+d*.5+.004,.007,.007,.004,'#86734b');
  box(x,y+.184,z-.144,w-.008,.028,d-.012,'#976f48',-1.16);
  box(x,y+.188,z-.122,w-.052,.008,d-.055,'#bc9c74',-1.16);
}
paintBox(paintBoxX,paintDeskY,paintBoxZ,.49,.246,.095);
for(let j=0;j<6;j++){
  const x=paintBoxX-.187+j*.074,z=paintBoxZ+.009,y=paintDeskY+.058,a=R(-.16,.16);
  let tube=new T.Group();world.add(tube);tube.position.set(x,y,z);tube.rotation.y=a;
  let foil=animalPart(tube,0,0,0,.028,.016,.068,'#c6ccbf');
  animalPart(tube,0,.011,-.006,.028,.012,.037,'#e5dfc8');
  animalPart(tube,0,.016,-.005,.028,.009,.018,['#c07e42','#c25c4f','#a57792','#657faf','#6b906a','#97805a'][j]);
  animalPart(tube,0,0,.071,.016,.014,.018,'#747f73');
  animalPart(tube,0,.001,-.064,.061,.012,.015,'#a3b0a6',boxG);
}
const paletteX=-5.663,paletteZ=-1.737;
box(paletteX,paintDeskY+.018,paletteZ,.263,.031,.134,'#505f61');
box(paletteX,paintDeskY+.033,paletteZ,.25,.008,.123,'#d2d2bb');
for(let row=0;row<2;row++)for(let col=0;col<6;col++){
  const x=paletteX-.103+col*.041,z=paletteZ-.031+row*.061;
  box(x,paintDeskY+.044,z,.034,.015,.048,'#a2a496');
  ball(x,paintDeskY+.052,z,.014,.005,.021,['#a54e49','#d18b4b','#d0b359','#8c9759','#658a78','#6b899d','#93666c','#9b7d54','#a9a271','#778798','#666e88','#554d48'][row*6+col]);
}
for(let i=0;i<4;i++)box(-5.526+i*.021,1.655,-1.979,.009,.01,.141,['#805e40','#ba9b66','#8a8070','#95755c'][i],0,.09);
const washWater=mesh(new T.CircleGeometry(.075,26),0,-4.68,1.223,-.25,new T.MeshToonMaterial({color:'#9ca7a0',gradientMap:grad}));
washWater.rotation.x=-Math.PI/2;
rod(-4.696,1.19,-.261,-4.611,1.426,-.328,.007,'#926f4e',.82,8);ring(-4.68,1.228,-.25,.083,.005,'#c9cabc',Math.PI/2);
// A little kraft paper and clipped eucalyptus distinguish the packing end of the stand.
const paperFold=face([[-4.86,1.657,.51],[-4.58,1.657,.522],[-4.62,1.659,.721],[-4.92,1.661,.69]],[0,1,2,0,2,3],'#c5aa81');
face([[-4.86,1.657,.51],[-4.83,1.69,.453],[-4.575,1.68,.457],[-4.58,1.657,.522]],[0,1,2,0,2,3],'#d1b68a');
for(let k=0;k<4;k++)ring(-4.704,1.673+k*.007,.57,.033,.0045,'#b59b72',Math.PI/2);
for(let i=0;i<3;i++)obj(blade,-4.81+i*.035,1.668,.661,.041,.068,.04,pick(greens),-1.57,0,i*1.8);
for(let i=0;i<5;i++){
  let x=-5.997+i*.084;
  box(x,1.135,.713,.075,.117,.164,'#ac875b');
}
for(let y of [1.128,1.2])box(-5.837,y,.805,.453,.032,.022,lightwood);
for(let a of [-1,1])box(-5.837+a*.205,1.157,.816,.024,.127,.024,wood);
// A twin-lens camera stands beside the radio, its strap hanging over the cabinet.
const cameraShelf=1.799,cameraBodyX=-5.59,cameraBodyZ=-3.955;
box(cameraBodyX,cameraShelf+.129,cameraBodyZ,.173,.255,.123,'#434641');
box(cameraBodyX,cameraShelf+.13,cameraBodyZ+.064,.15,.229,.019,'#6e7066');
for(let j=0;j<2;j++){
  const y=cameraShelf+.073+j*.108;
  rod(cameraBodyX,y,cameraBodyZ+.066,cameraBodyX,y,cameraBodyZ+.103,.044,'#474b49',1,24);
  ring(cameraBodyX,y,cameraBodyZ+.105,.039,.005,'#b7baab');
  ball(cameraBodyX,y,cameraBodyZ+.106,.03,.03,.009,'#536f70');
  ball(cameraBodyX-.008,y+.01,cameraBodyZ+.115,.009,.005,.002,'#bfcec3',0,0,.34);
}
box(cameraBodyX,cameraShelf+.257,cameraBodyZ,.159,.014,.11,'#a7ab9e');
box(cameraBodyX,cameraShelf+.282,cameraBodyZ-.048,.138,.049,.012,'#565b53',-.19);
for(let side of [-1,1]){
  box(cameraBodyX+side*.066,cameraShelf+.276,cameraBodyZ,.011,.033,.094,'#888c80');
  ring(cameraBodyX+side*.089,cameraShelf+.198,cameraBodyZ,.018,.004,'#b4b4a2',0,Math.PI/2);
}
rod(cameraBodyX+.08,cameraShelf+.155,cameraBodyZ,cameraBodyX+.104,cameraShelf+.155,cameraBodyZ,.034,'#858a80',1,18);
pipe([[cameraBodyX-.09,2.001,cameraBodyZ],[cameraBodyX-.145,1.848,-3.876],[cameraBodyX-.16,1.797,-3.804],[cameraBodyX-.11,1.657,-3.787],[cameraBodyX+.042,1.615,-3.779],[cameraBodyX+.134,1.715,-3.785],[cameraBodyX+.126,1.876,-3.893],[cameraBodyX+.089,1.995,cameraBodyZ]],.012,'#6e5542');
const opticalStart=V(-.94,1.94,.57),opticalEnd=V(-.366,2.219,.271),opticalAxis=opticalEnd.clone().sub(opticalStart).normalize();
const lensCenter=opticalEnd.clone().addScaledVector(opticalAxis,.019);
function opticalDisc(position,r,color,thickness=.006){
  let end=position.clone().addScaledVector(opticalAxis,thickness);
  rod(...position.toArray(),...end.toArray(),r,color,1,32);
}
opticalDisc(lensCenter,.102,'#65787d');opticalDisc(lensCenter.clone().addScaledVector(opticalAxis,.006),.084,'#779aa5',.003);
const lensFrame=new T.Quaternion().setFromUnitVectors(V(0,0,1),opticalAxis),glassRotation=new T.Euler().setFromQuaternion(lensFrame);
let glass=mesh(new T.CircleGeometry(.081,38),0,...lensCenter.clone().addScaledVector(opticalAxis,.011).toArray(),new T.MeshBasicMaterial({map:canvasTex(192,192,(p,w,h)=>{
  const g=p.createLinearGradient(24,0,159,h);g.addColorStop(0,'#c7dcce');g.addColorStop(.39,'#779b9b');g.addColorStop(.74,'#526978');g.addColorStop(1,'#547e80');p.fillStyle=g;p.fillRect(0,0,w,h);
  p.strokeStyle='#d0e1ce';p.lineWidth=4;p.beginPath();p.arc(w*.47,h*.49,w*.34,3.5,4.72);p.stroke();p.fillStyle='#e9e6bb';p.beginPath();p.ellipse(109,56,11,5,-.49,0,TAU);p.fill()
})}));glass.quaternion.copy(lensFrame);
for(let u of [.08,.16,.64,.73,.91]){
  const p=opticalStart.clone().lerp(opticalEnd,u);
  ring(...p.toArray(),.081+u*.02,.0075,u>.85?'#5f6862':'#ad8954',glassRotation.x,glassRotation.y,glassRotation.z);
}
let eyepieceBase=opticalStart.clone().addScaledVector(opticalAxis,-.139);
rod(...eyepieceBase.toArray(),...opticalStart.toArray(),.033,'#48514e',1.15,16);
for(let j=0;j<4;j++){const p=eyepieceBase.clone().addScaledVector(opticalAxis,j*.014);ring(...p.toArray(),.036,.004,'#898d7c',glassRotation.x,glassRotation.y,glassRotation.z)}
rod(-.729,1.966,.441,-.729,1.966,.599,.025,brass);
ring(-.729,1.966,.602,.058,.015,'#a7844d');for(let k=0;k<3;k++)rod(-.729,1.966,.602,-.729+.051*Math.cos(k*TAU/3),1.966+.051*Math.sin(k*TAU/3),.602,.007,gold);
function dessertLayer(x,z,y,r,a,b,height,color){
  let shape=new T.Shape();shape.moveTo(0,0);shape.absarc(0,0,r,a,b,false);shape.lineTo(0,0);
  const piece=mesh(new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelSize:.0018,bevelThickness:.0015,bevelSegments:1,curveSegments:18}),color,x,y,z);
  piece.rotation.x=-Math.PI/2;
}
dessertLayer(-1.817,-.643,1.548,.127,-.26,1.09,.025,'#b08046');
dessertLayer(-1.817,-.643,1.573,.124,-.26,1.09,.015,'#efcf89');
dessertLayer(-1.817,-.643,1.588,.119,-.26,1.09,.017,'#e2ae63');
for(let j=0;j<9;j++){
  let a=-.25+j*.162;
  ball(-1.817+.124*Math.cos(a),1.585,-.643-.124*Math.sin(a),.009,.029,.008,'#d6a05a');
}
for(let j=0;j<3;j++)ball(-1.751+j*.018,1.619,-.668-.017*(j%2),.014,.015,.014,pick(['#975563','#64627d','#727a8c']));
obj(st,-1.737,1.61,-.697,.026,.026,.026,'#ebd47a',-Math.PI/2,0,.26);
rod(-1.656,1.574,-.991,-1.642,1.574,-.991,.005,ink);for(let side of [-1,1])pipe([[-1.65+side*.096,1.578,-.99],[-1.65+side*.099,1.574,-1.038],[-1.65+side*.089,1.565,-1.076]],.0046,'#6a6050');
ring(-1.02,1.605,-1.609,.128,.014,'#4a514c');for(let side of [-1,1])ball(-1.02+side*.128,1.536,-1.609,.019,.019,.018,'#798179');
for(let j=0;j<7;j++){let a=j*TAU/7;ball(-1.02+.119*Math.cos(a),1.48,-1.61+.111*Math.sin(a),.009,.009,.009,'#878a77')}
for(let k=0;k<3;k++){
  const a=2.5+k*1.49,X=-5.90+Math.cos(a)*(.19+k*.031),Y=2.3+.086*k,Z=-4.09+Math.sin(a)*.12;
  rod(-5.89,1.935,-4.1,X,Y,Z,.011,'#795842',.37,6);
  for(let j=0;j<7;j++){
    const u=.36+j*.098,x=-5.89+(X+5.89)*u,z=-4.1+(Z+4.1)*u,y=1.935+(Y-1.935)*u;
    let tip=[x+Math.cos(a+j)*.056,y+.029,z+Math.sin(a+j)*.049];
    rod(x,y,z,...tip,.005,'#87694a',.53,5);obj(mapleGeo,...tip,.081,.081,.081,pick(['#bc4936','#c8603b','#b94132','#db8042']),-.8,R(0,TAU),R(-1.8,1.8));
  }
}
world=gardenRoot;
atSite('inari',()=>{
for(let j=0;j<3;j++){
  const top=.12+j*.06,z=-.02-j*.42;
  box(2.55,(top+.087)/2,z,1.12,top-.087,.417,'#8b8d7b');
  for(let col=0;col<3;col++){
    obj(wallBlocks[(col+j*3)%9],2.55+(col-1)*.357,top-.012,z,.36,.039,.396,['#b2ad97','#a4aa91','#aaa58f'][(col+j)%3]);
  }
}
});
world=sites.studio;
for(let side of [-1,1]){
  const clipX=ex+side*.25;
  box(clipX,2.452,ez-.014,.067,.037,.018,'#857751',-.12);
  ring(clipX,2.474,ez-.014,.011,.003,'#c2ab78');
}
for(let j=0;j<4;j++){
  const a=1.42*j,X=-1.36+.093*Math.sin(a),Z=.56+.084*Math.cos(a),Y=1.297;
  if(j%2){
    obj(rockG,X,Y+.008,Z,.041,.047,.037,'#905b3c',.33,a,.17);
    ball(X,Y-.014,Z+.018,.026,.014,.015,'#c19b6c');
    rod(X+.012,Y+.032,Z,X+.014,Y+.059,Z+.004,.011,'#795339',.12,6);
  }else{
    ball(X,Y+.032,Z,.036,.062,.033,'#705a43',.19,a);
    for(let k=0;k<26;k++){let u=k/26,t=k*2.41,r=.032*Math.sin(Math.PI*(.08+.84*u));ball(X+r*Math.sin(t),Y-.013+.092*u,Z+r*Math.cos(t),.013,.016,.009,pick(['#987953','#9e805b','#816448']),.35,t)}
  }
}
world=gardenRoot;

// Below the exposed surface the same lights travel over sediment and fruit, with
// the pale film at the cut kept transparent enough for depth parallax.
const pondClock={value:0};
anim.push(t=>{pondClock.value=t});
function preparePondReflection(){
  const surfaces=world.children.filter(o=>o.geometry?.type==='ShapeGeometry'&&o.position.y===waterY);
  const capture=new T.WebGLCubeRenderTarget(256,{generateMipmaps:true,minFilter:T.LinearMipmapLinearFilter,magFilter:T.LinearFilter});
  const eye=new T.CubeCamera(.06,45,capture);eye.position.set(px,.57,pz);
  const skyDome=new T.Mesh(new T.SphereGeometry(34,40,24),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,
    vertexShader:'varying vec3 sight;void main(){sight=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec3 sight;void main(){vec3 ray=normalize(sight);float a=atan(ray.z,ray.x);float ridge=.015+.012*sin(a*13.)+.018*sin(a*5.);
      vec3 sky=mix(vec3(.80,.79,.64),vec3(.41,.64,.71),smoothstep(0.,.74,ray.y));
      sky=mix(vec3(.45,.57,.49),sky,smoothstep(ridge-.015,ridge+.018,ray.y));gl_FragColor=vec4(sky,1.);}`
  }));
  skyDome.position.copy(eye.position);skyDome.frustumCulled=false;skyDome.renderOrder=-100;scene.add(skyDome);
  const previousPlanes=renderer.clippingPlanes,previousAuto=renderer.shadowMap.autoUpdate;
  let masked=[];
  // Only the landscape above the lip belongs in the reflected sky.
  for(const o of world.children){
    if(o.isSprite||o===skyShaft||o===brightMat||surfaces.includes(o)){
      masked.push([o,o.visible]);o.visible=false;
    }
  }
  try{
    renderer.clippingPlanes=[new T.Plane(V(0,1,0),-.668)];
    renderer.shadowMap.autoUpdate=false;
    eye.update(renderer,scene);
  }finally{
    renderer.clippingPlanes=previousPlanes;
    renderer.shadowMap.autoUpdate=previousAuto;
    for(const [o,visible] of masked)o.visible=visible;
    scene.remove(skyDome);skyDome.geometry.dispose();skyDome.material.dispose();
  }
  for(let water of surfaces){
    const material=water.material,previous=material.onBeforeCompile,oldKey=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,r){
      previous.call(this,shader,r);
      shader.uniforms.gardenReflection={value:capture.texture};shader.uniforms.pondTime=pondClock;
      shader.vertexShader='varying vec3 waterWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','waterWorld=(modelMatrix*vec4(transformed,1.)).xyz;\n#include <project_vertex>');
      shader.fragmentShader='uniform samplerCube gardenReflection;uniform float pondTime;varying vec3 waterWorld;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
        vec2 waterPoint=waterWorld.xz;
        vec3 nWater=normalize(vec3(.018*sin(waterPoint.x*7.+waterPoint.y*3.+pondTime*.68)+.009*sin(waterPoint.y*13.-pondTime*.52),1.,.022*cos(waterPoint.y*5.8+pondTime*.61)+.008*sin(waterPoint.x*12.-pondTime*.44)));
        
        vec3 eyeRay=normalize(cameraPosition-waterWorld);
        vec3 reflected=textureCube(gardenReflection,reflect(-eyeRay,nWater)).rgb;
        float fresnel=pow(1.-abs(dot(eyeRay,nWater)),2.);
        outgoingLight=mix(outgoingLight,reflected,min(.57,.27+.36*fresnel));
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey=()=>oldKey+'-pond-reflection';
    material.needsUpdate=true;
  }
}
const cutFilm=world.children.find(o=>o.geometry?.type==='PlaneGeometry'&&Math.abs(o.position.z-frontCut-.002)<1e-5&&o.renderOrder===2);
if(cutFilm){
  const previous=cutFilm.material;cutFilm.material=new T.ShaderMaterial({
    uniforms:{pondTime:pondClock},transparent:true,side:T.DoubleSide,depthWrite:false,
    vertexShader:'varying vec2 surfaceUV;void main(){surfaceUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float pondTime;varying vec2 surfaceUV;void main(){
      float line=fract(surfaceUV.y*5.8+.16*sin(surfaceUV.x*12.+pondTime*.25)+.055*sin(surfaceUV.x*33.-pondTime*.34));
      float strip=(1.-smoothstep(.012,.051,abs(line-.55)))*smoothstep(.38,.82,.5+.5*sin(surfaceUV.x*17.+.51*pondTime+surfaceUV.y*8.));
      float lip=smoothstep(.978,.999,surfaceUV.y);
      vec3 pigment=mix(vec3(.24,.65,.67),vec3(.71,.90,.78),max(strip,lip));
      gl_FragColor=vec4(pigment,.105+.055*(1.-surfaceUV.y)+.126*strip+.18*lip);
      #include <colorspace_fragment>
    }`
  });previous.dispose();
}
