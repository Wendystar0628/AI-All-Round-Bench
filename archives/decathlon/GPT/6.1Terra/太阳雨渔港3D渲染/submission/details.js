// Hand-made finishing details for the harbor. All artwork is generated locally.
const detailAnimations = [];
const paleInk = mat(0x77918a), canvasWhite = mat(0xf1ecdc), paintRed = mat(0xc95d4f), paintBlue = mat(0x4e8191);
function stick(a,b,r,m,parent=root) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const mesh = cyl(0,0,0,r,r,va.distanceTo(vb),m,parent,8);
  mesh.position.copy(va.clone().add(vb).multiplyScalar(.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());
  return mesh;
}
// A waterline and articulated, poster-like reflection below each moored boat.
const reflections=[];
boats.forEach((boatData,index)=>{
  const group=new THREE.Group(); root.add(group);
  group.position.set(boatData.x,.119,boatData.z);
  const shades=[0x448b87,0x6eaaa1,0xd8ebe0,0x9acdc2,0x3f7e7e];
  for(let i=0;i<34;i++){
    const x=(rnd()-.5)*.9*boatData.g.scale.x;
    const z=(rnd()-.5)*2.05*boatData.g.scale.x;
    const width=(.13+rnd()*.43)*(1-Math.abs(z)*.24);
    const m=new THREE.MeshBasicMaterial({color:shades[i%shades.length],transparent:true,opacity:.34,depthWrite:false,side:THREE.DoubleSide});
    const depth=.025+rnd()*.055,shape=new THREE.Shape();
    shape.moveTo(-width*.5,-depth*.2);shape.lineTo(-width*.3,-depth*.5);shape.lineTo(width*.35,-depth*.45);
    shape.lineTo(width*.5,0);shape.lineTo(width*.26,depth*.45);shape.lineTo(-width*.4,depth*.5);shape.closePath();
    const shard=new THREE.Mesh(new THREE.ShapeGeometry(shape),m);shard.rotation.x=-Math.PI/2;
    shard.position.set(x,.001+i*.00002,z);group.add(shard);shard.userData.phase=rnd()*Math.PI*2;shard.userData.homeX=x;shard.userData.homeZ=z;
  }
  reflections.push([group,index]);
});
// Boat rails, fender lashings, colored waterline, equipment and legible wheel spokes.
boats.forEach(({g},index)=>{
  for(const side of [-1,1]){
    // Colored fine line catches the profile of the hull.
    line([[side*.49,.095,-.89],[side*.51,.095,.49],[side*.38,.095,.83],[0,.095,1.14]],0x628d8b,1,g);
    line([[side*.48,.39,-.25],[side*.65,.16,-.25]],0x6b7064,1,g);
    // Three white bindings around each orange life ring.
    for(let j=0;j<4;j++){
      const a=j*Math.PI/2;
      const tile=box(side*.565,.24+Math.cos(a)*.13,.48+Math.sin(a)*.13,.018,.038,.038,C.white,g);
      tile.rotation.x=-a;
    }
    for(let j=0;j<3;j++)stick([side*.47,.36,-.83+j*.25],[side*.47,.61,-.83+j*.25],.012,paleInk,g);
    stick([side*.47,.61,-.85],[side*.47,.61,-.3],.012,paleInk,g);
  }
  if(index<2){
    // Wheel, radar glow, a clipped chart and waterproofs behind the open doorway.
    for(let a=0;a<6;a++){
      const t=a*Math.PI/3;
      line([[.22,.75,.025],[.22+Math.cos(t)*.095,.75+Math.sin(t)*.095,.025]],0x314e4c,1,g);
    }
    const wheelAxle=cyl(.22,.75,.10,.012,.012,.14,C.dark,g,8);wheelAxle.rotation.x=Math.PI/2;
    const screen=box(-.2,.765,.257,.16,.12,.008,mat(0x276964,{emissive:0x3e9f8e,emissiveIntensity:.5}),g);
    for(let k=0;k<3;k++)line([[-.26,.73+k*.025,.263],[-.14,.73+k*.025,.263]],0x99dcca,1,g);
    const chart=box(-.18,.44,-.61,.28,.012,.20,canvasWhite,g); chart.rotation.y=-.18;
    line([[-.29,.448,-.62],[-.20,.449,-.58],[-.12,.449,-.65]],0x84a69b,1,g);
    // Vacuum flask and enamel mug sit together on the cabin floor.
    const flaskMetal=mat(0xc5d1c7,{metalness:.28,roughness:.38});
    cyl(.22,.523,-.24,.042,.047,.19,flaskMetal,g,16);
    cyl(.22,.626,-.24,.033,.038,.025,C.dark,g,16);
    cyl(.22,.644,-.24,.039,.039,.012,C.white,g,16);
    torus(.22,.468,-.24,.046,.004,paleInk,g);
    cyl(.33,.459,-.27,.037,.029,.068,C.white,g,16);
    cyl(.33,.495,-.27,.032,.032,.004,mat(0x708b80),g,16);
    torus(.33,.498,-.27,.036,.004,C.blue,g);
    torus(.37,.466,-.27,.020,.005,C.white,g,[0,0,0]);
    // A small hooded oilskin hangs just inside the open cabin door.
    // The flared hem, sleeves and stitched pockets give the silhouette a
    // recognisable garment shape even through the glass.
    const oilskin=new THREE.Group();oilskin.position.set(-.285,.72,-.375);g.add(oilskin);
    const oilskinMaterial=mat(0xe7bd56,{side:THREE.DoubleSide});
    const oilskinShadow=mat(0xc39c47,{side:THREE.DoubleSide});
    const garment=new THREE.Shape();
    garment.moveTo(-.055,.12);garment.lineTo(-.09,.105);garment.lineTo(-.12,.015);
    garment.lineTo(-.095,.002);garment.lineTo(-.07,.06);garment.lineTo(-.085,-.12);
    garment.lineTo(.085,-.12);garment.lineTo(.07,.06);garment.lineTo(.095,.002);
    garment.lineTo(.12,.015);garment.lineTo(.09,.105);garment.lineTo(.055,.12);garment.closePath();
    oilskin.add(new THREE.Mesh(new THREE.ShapeGeometry(garment),oilskinMaterial));
    const hood=new THREE.Shape();hood.moveTo(-.052,.105);hood.quadraticCurveTo(-.06,.205,0,.205);
    hood.quadraticCurveTo(.06,.205,.052,.105);hood.lineTo(.025,.075);hood.lineTo(-.025,.075);hood.closePath();
    const hoodMesh=new THREE.Mesh(new THREE.ShapeGeometry(hood),oilskinShadow);hoodMesh.position.z=-.001;oilskin.add(hoodMesh);
    line([[0,.095,-.002],[0,-.11,-.002]],0xb08b42,1,oilskin);
    for(const side of [-1,1]){
      line([[side*.035,-.015,-.002],[side*.063,-.015,-.002],[side*.061,-.055,-.002],[side*.035,-.055,-.002]],0xb08b42,1,oilskin);
    }
    torus(-.285,.946,-.37,.026,.006,C.dark,g,[0,0,0]);
    // Photographs and paper charms, attached to window frames.
    box(.37,.96,.12,.012,.15,.12,C.wood,g);
    box(.38,.96,.12,.012,.11,.08,mat(0x89ada3),g);
    box(-.36,.94,.08,.012,.16,.07,mat(0xe8d5a9),g);
    // Radar arch and fine antennas.
    stick([-.40,1.17,-.25],[-.40,1.42,-.25],.012,paleInk,g);
    stick([.40,1.17,-.25],[.40,1.42,-.25],.012,paleInk,g);
    stick([-.40,1.42,-.25],[.40,1.42,-.25],.012,paleInk,g);
    cyl(-.19,1.48,-.25,.09,.13,.09,C.white,g,16);
  }else{
    // Oars and a rolled net in the open skiffs.
    for(const side of [-1,1]){
      const oar=stick([side*.32,.41,-.58],[side*.45,.41,.5],.018,C.wood,g);
      const paddle=box(side*.46,.41,.55,.10,.026,.25,C.wood,g);paddle.rotation.y=side*.13;
    }
    torus(0,.4,-.25,.17,.04,C.green,g);
  }
});
// Framed warehouse openings and little signs give the rear wall a useful scale.
for(let i=0;i<4;i++){
  const zz=-3.65+i*.42;
  box(-2.22,1.77,zz,.025,.26,.30,C.glass);
  for(let dz of [-.15,.15]) box(-2.20,1.77,zz+dz,.035,.29,.025,paleInk);
  box(-2.20,1.91,zz,.035,.025,.32,paleInk);
}
// Chalk price lines, fishing association stationery, and the stacked trays.
for(let i=0;i<5;i++)box(-3.98+i*.17,1.32,-3.751,.10,.012,.006,canvasWhite);
for(let i=0;i<3;i++){
  box(-4.20+i*.23,.53,-2.56,.19,.035,.20,C.blue);
  box(-4.20+i*.23,.55,-2.56,.15,.015,.16,C.white);
}
// Waiting room details: a clock hand, slatted bench, potted vine and small notices.
line([[-3.02,1.71,-1.272],[-3.07,1.77,-1.272]],0x4e6864);
line([[-3.02,1.71,-1.272],[-2.96,1.68,-1.272]],0x4e6864);
for(let i=0;i<6;i++)box(-4.28+i*.28,.855,-.82,.025,.025,.35,mat(0x795e4c));
for(let i=0;i<5;i++){
  let leaf=sphere(-2.84+Math.cos(i*1.25)*.14,.98+Math.sin(i*1.25)*.12,-.40,.075,mat(i%2?0x729a77:0x97b786));
  leaf.scale.set(.75,.45,1.4);
}
sign('港の便り\n7月のお知らせ',-4.68,1.5,-.1,.30,.42,Math.PI/2,'#e3dfcc','#73908a',36);
// Detailed fish boxes, crates, a few small pieces of rope and wet gear.
for(let i=0;i<5;i++){
  let x=-4.34+(i%2)*.5, y=.72+Math.floor(i/2)*.28, z=1.24+(i%3)*.15;
  for(let j=0;j<4;j++)box(x-.15+j*.1,y,z+.201,.025,.12,.006,C.edge);
}
for(let i=0;i<6;i++)sphere(-4.47+i*.18,1.62,2.10,.045,i%2?C.orange:C.white);
// Waterline foam around the tetrapods: broken arcs instead of a single white band.
const foamBits=[];
for(let i=0;i<24;i++){
  const x=4.62+(rnd()-.5)*.60,z=-4.50+(rnd()-.5)*.48;
  const bit=box(x,.12,z,.06+rnd()*.20,.008,.025+rnd()*.04,C.foam);
  foamBits.push([bit,rnd()*6]);
}
// Several hanging ropes and hoops on the working face of the quay.
for(let x of [-.7,.9,2.6,4.15]){
  torus(x,.17,2.484,.115,.02,C.rust,root,[0,0,0]);
  tube([[x,.64,2.8],[x+.08,.42,2.52],[x+.12,.18,2.48]],.016,C.orange);
}
// Narrow faded seams, stains and shell clusters along the quay walls.
for(let i=0;i<80;i++){
  let x=-1.9+rnd()*6.75,y=-.63+rnd()*.85;
  let o=box(x,y,2.486,.012+rnd()*.025,.03+rnd()*.12,.008,i%4?C.edge:C.rust);
}
for(let i=0;i<42;i++){
  let z=-4.25+rnd()*6.5,y=-.66+rnd()*.45;
  let o=sphere(-1.956,y,z,.018+rnd()*.022,i%3?C.white:C.edge);o.scale.set(.35,.65,1);
}
// Dripping edges, each falling droplet has its own slow cycle.
const droplets=[];
for(let i=0;i<8;i++){
  let drop=sphere(0,0,0,.025,C.gold); drop.scale.set(.65,1.5,.65);
  const x=i<4?-1.8+Math.cos(i*Math.PI/2)*.45:3.6+Math.cos(i*Math.PI/2)*.23;
  const z=i<4?3.35+Math.sin(i*Math.PI/2)*.45:3.2+Math.sin(i*Math.PI/2)*.23;
  droplets.push([drop,x,z,i<4?1.27:2.49,i*.41]);
}
// A small breeze moves flags in sequence from the harbor to the quay.
const flags=[];
function littleFlag(x,z,col){
  const g=new THREE.Group();g.position.set(x,.45,z);root.add(g);
  cyl(0,.65,0,.016,.016,1.3,C.dark,g);
  let f=box(.18,1.17,0,.36,.19,.012,col,g);flags.push(f);
}
littleFlag(-2.5,-3.65,paintRed); littleFlag(-2.65,1.65,C.blue);
// Gentle caustic strokes under the cabin roof and warehouse ceiling.
const caustics=[];
for(let i=0;i<12;i++){
  const a=box(-4.55+i*.17,2.072,-3.12,.10,.008,.018,mat(0xc8e7d1,{emissive:0x9ac5a2,emissiveIntensity:.3}));
  caustics.push([a,i]);
}
// The cat takes its excursion in lighter rain, but returns to shelter before
// the larger event of the fishing boat leaving its berth.
function catChoreography(t){
  const cycleLength=Math.PI*2/.13,raw=t+12,phase=raw%cycleLength,trip=Math.floor(raw/cycleLength);
  let walk=phase<24?0:phase<30?(phase-24)/6:phase<39?1:phase<46?1-(phase-39)/7:0;
  walk=walk*walk*(3-2*walk);
  const boatPhase=t%60;
  const quiet=boatPhase<25||boatPhase>=50?1:boatPhase<28?1-THREE.MathUtils.smoothstep(boatPhase,25,28):boatPhase<48?0:THREE.MathUtils.smoothstep(boatPhase,48,50);
  const rainMoving=(phase>=24&&phase<30)||(phase>=39&&phase<46);
  const clearing=(boatPhase>=25&&boatPhase<28)||(boatPhase>=48&&boatPhase<50);
  const moving=walk*quiet>.001&&((rainMoving&&quiet>.001)||clearing);
  const turnRain=THREE.MathUtils.smoothstep(phase,38.5,39.5);
  const turnBoat=boatPhase>=25&&boatPhase<29?THREE.MathUtils.smoothstep(boatPhase,25,25.5)*(1-THREE.MathUtils.smoothstep(boatPhase,28,29)):0;
  return {walk:walk*quiet,moving,turn:Math.max(turnRain,turnBoat),trip};
}
function updateDetails(t){
  const gust=Math.pow(Math.max(0,Math.sin((t-3)*.17)),8);
  flags.forEach((f,i)=>{f.rotation.y=.14*Math.sin(t*1.2-i*.8)+gust*.3;});
  reflections.forEach(([g,index])=>{
    const b=boats[index].g;g.position.x=b.position.x;g.position.z=b.position.z;
    g.children.forEach((piece,i)=>{
      const wave=Math.sin(t*.7+piece.userData.phase),fragment=THREE.MathUtils.smoothstep(wave,-.75,-.20);
      piece.scale.x=.34+.66*fragment;piece.material.opacity=.34*fragment;
    });
  });
  foamBits.forEach(([o,p])=>{o.scale.x=.7+.35*Math.sin(t*.9+p);});
  droplets.forEach(([o,x,z,y,p])=>{let q=(t*.8+p)%2.4;o.visible=q<.9;o.position.set(x,y-q*.48,z);});
  caustics.forEach(([o,i])=>{o.position.z=-3.12+Math.sin(t*.6+i*.4)*.07;o.material.emissiveIntensity=.2+.13*Math.sin(t*.6+i*.3)});
  rain.material.opacity=.31+.12*(.5+.5*Math.sin(t*.13+Math.PI));
  rainGeo.setDrawRange(0,Math.floor((.72+.28*(.5+.5*Math.sin(t*.13+Math.PI)))*rainPos.length/6)*2);
  const catMotion=catChoreography(t),walk=catMotion.walk;
  cat.position.x=3.55-walk*1.3;cat.position.z=3.95+walk*.25;
  cat.rotation.y=walk>.001?.25+Math.PI*catMotion.turn:Math.sin(t*.3)*.12;
  cat.position.y=.5+(catMotion.moving?.015*Math.abs(Math.sin(t*5)):0);
}
// Subtle concrete grain is painted on canvas, so it also works from a file URL.
function concreteTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;
  const ctx=c.getContext('2d');ctx.fillStyle='#f4f5ec';ctx.fillRect(0,0,256,256);
  for(let i=0;i<3400;i++){
    const x=rnd()*256,y=rnd()*256,size=.25+rnd()*1.1;
    ctx.fillStyle=i%3?'rgba(91,119,109,.045)':'rgba(255,255,255,.26)';ctx.fillRect(x,y,size,size);
  }
  for(let i=0;i<45;i++){
    const x=rnd()*256,y=rnd()*256;ctx.strokeStyle='rgba(100,130,120,.075)';ctx.lineWidth=.5;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+3+rnd()*10,y+(rnd()-.5)*4);ctx.stroke();
  }
  // Independent deterministic flecks add soft, uneven aggregate and wear.
  const noise=(i,k)=>{const v=Math.sin((i+1)*12.9898+(k+1)*78.233)*43758.5453;return v-Math.floor(v)};
  for(let i=0;i<520;i++){
    const x=noise(i,0)*256,y=noise(i,1)*256,r=.7+noise(i,2)*3.3;
    ctx.fillStyle=i%4?'rgba(88,117,105,.025)':'rgba(255,255,249,.10)';
    ctx.beginPath();ctx.ellipse(x,y,r,r*(.3+noise(i,3)*.6),noise(i,4)*Math.PI,0,Math.PI*2);ctx.fill();
  }
  const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;
  tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(2,2);return tx;
}
const grain=concreteTexture();C.top.map=grain;C.top.needsUpdate=true;C.concrete.map=grain;C.concrete.needsUpdate=true;
// Slightly smoother scattered damp patches catch the sky without turning the
// entire concrete deck into a mirror.
const concreteRoughCanvas=document.createElement('canvas');concreteRoughCanvas.width=concreteRoughCanvas.height=128;
const concreteRoughContext=concreteRoughCanvas.getContext('2d');
concreteRoughContext.fillStyle='#e8e8e8';concreteRoughContext.fillRect(0,0,128,128);
for(let i=0;i<150;i++){
  const x=(i*47%127),y=(i*73%127),r=1+(i%5)*.65;
  concreteRoughContext.fillStyle='rgba(90,90,90,.055)';concreteRoughContext.beginPath();concreteRoughContext.ellipse(x,y,r*2,r*.8,i*.71,0,Math.PI*2);concreteRoughContext.fill();
}
const concreteRoughness=new THREE.CanvasTexture(concreteRoughCanvas);concreteRoughness.wrapS=concreteRoughness.wrapT=THREE.RepeatWrapping;concreteRoughness.repeat.set(2,2);
C.top.roughnessMap=concreteRoughness;C.top.needsUpdate=true;
// Irregular shallow puddles, each with soft edges and short sky-colored highlights.
const puddleRings=[],puddleGlints=[];
function puddle(x,z,s,seedOffset){
  const shape=new THREE.Shape();
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6, r=1+.16*Math.sin(i*2.4+seedOffset);
    const px=Math.cos(a)*r*s,pz=Math.sin(a)*r*s*.55;
    if(i===0)shape.moveTo(px,pz);else shape.lineTo(px,pz);
  }
  shape.closePath();
  const m=new THREE.MeshStandardMaterial({color:0x9ec6c2,transparent:true,opacity:.62,roughness:.23,metalness:.05,side:THREE.DoubleSide,depthWrite:false});
  const pool=new THREE.Mesh(new THREE.ShapeGeometry(shape),m);pool.rotation.x=-Math.PI/2;pool.position.set(x,.447,z);root.add(pool);
  const glintMaterial=new THREE.MeshBasicMaterial({color:0xf4f9eb,transparent:true,opacity:.7,depthWrite:false});
  for(let i=0;i<3;i++){let glint=box(x-s*.35+i*s*.3,.452,z-.05+i*.04,s*.20,.004,.012,glintMaterial);glint.rotation.y=.2;glint.castShadow=false;}
  puddleGlints.push({x,z,material:glintMaterial});
  const rippleMaterial=new THREE.MeshBasicMaterial({color:0xeaf8ed,transparent:true,opacity:0,depthWrite:false});
  const ring=torus(x+.05,.455,z,.08,.006,rippleMaterial);ring.castShadow=false;ring.scale.z=.65;puddleRings.push([ring,seedOffset]);
}
puddle(-.4,3.15,.55,1);puddle(1.10,4.5,.43,2);puddle(-3.65,4.1,.40,3);puddle(3.2,3.15,.35,4);
// Two silver instrument cases: rounded bodies, tapered necks, seams and latches.
function instrumentCase(x,z,variation){
  const g=new THREE.Group();g.position.set(x,.45,z);g.rotation.y=-.10;root.add(g);
  const shape=new THREE.Shape();
  shape.moveTo(-.12,-.50);shape.quadraticCurveTo(-.19,-.50,-.19,-.42);
  shape.lineTo(-.17,-.29);shape.quadraticCurveTo(-.18,-.24,-.23,-.19);
  shape.quadraticCurveTo(-.29,-.12,-.23,-.04);shape.quadraticCurveTo(-.20,.00,-.25,.06);
  shape.quadraticCurveTo(-.33,.17,-.27,.34);shape.quadraticCurveTo(-.23,.48,0,.49);
  shape.quadraticCurveTo(.23,.48,.27,.34);shape.quadraticCurveTo(.33,.17,.25,.06);
  shape.quadraticCurveTo(.20,.00,.23,-.04);shape.quadraticCurveTo(.29,-.12,.23,-.19);
  shape.quadraticCurveTo(.18,-.24,.17,-.29);shape.lineTo(.19,-.42);
  shape.quadraticCurveTo(.19,-.50,.12,-.50);shape.closePath();
  let shell=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.13,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:2,curveSegments:8}),mat(variation?0xb0bdb9:0xc3ceca,{metalness:.3,roughness:.46}));
  shell.rotation.x=-Math.PI/2;g.add(shell);shell.castShadow=true;
  const contour=shape.getPoints(10).map(p=>[p.x,.16,-p.y]);contour.push(contour[0]);line(contour,0x54716c,1,g);
  for(let v of [-.19,.16]){
    box(-.25,.13,v,.04,.045,.07,C.dark,g);box(.25,.13,v,.04,.045,.07,C.dark,g);
  }
  stick([.26,.10,-.06],[.32,.10,-.06],.011,C.dark,g);
  stick([.32,.10,-.06],[.32,.10,.12],.011,C.dark,g);
  stick([.32,.10,.12],[.26,.10,.12],.011,C.dark,g);
  box(0,.165,.26,.29,.009,.018,C.white,g);
  for(let z1 of [-.34,.30])box(0,.166,z1,.23,.009,.012,C.edge,g);
}
instrumentCase(-.43,4.30,0);instrumentCase(.30,4.30,1);
// Architectural finishing: gutter, downpipes, warehouse shelves and door guides.
for(let x of [-4.77,-2.27]){
  stick([x,2.23,-3.87],[x,2.23,-2.0],.025,paleInk);
  stick([x,2.23,-2.0],[x,.49,-2.0],.022,paleInk);
}
for(let x of [-4.65,-2.38])box(x,1.14,-2.04,.055,1.25,.05,C.rust);
box(-4.57,1.14,-3.55,.08,1.25,.55,C.wood);
for(let y of [.66,1.02,1.4,1.75])box(-4.33,y,-3.55,.58,.045,.52,C.wood);
for(let i=0;i<4;i++)crate(-4.33,.80+i*.34,-3.55,i%2?C.blue:C.white,.42,.21,.31);
// Folded tarpaulin, small loose ice and wet squeegee near the shutter.
box(-3.0,.54,-2.27,.55,.12,.25,C.blue);
stick([-2.75,.52,-2.18],[-2.51,1.43,-2.17],.018,C.wood);
box(-2.75,.51,-2.18,.35,.05,.07,C.dark);
// Animated seabirds with bodies, beaks, wing tips and individual perches.
function gull(){
  const g=new THREE.Group();root.add(g);
  let body=sphere(0,0,0,.09,C.white,g);body.scale.set(1.5,.75,.75);
  sphere(.12,.035,0,.055,C.white,g);
  let beak=new THREE.Mesh(new THREE.ConeGeometry(.025,.09,5),C.yellow);beak.rotation.z=-Math.PI/2;beak.position.set(.19,.035,0);g.add(beak);
  let wings=[];
  for(let side of [-1,1]){
    let pivot=new THREE.Group();g.add(pivot);pivot.position.set(0,.025,side*.03);
    let wing=box(-.015,0,side*.11,.14,.022,.23,C.white,pivot);wing.rotation.y=side*.18;
    box(-.025,0,side*.21,.12,.023,.045,C.dark,pivot);
    wings.push(pivot);
  }
  for(let side of [-1,1])stick([-.02,-.06,side*.035],[-.02,-.13,side*.035],.009,C.orange,g);
  return {g,wings};
}
const gulls=[gull(),gull(),gull(),gull()];
const perches=[[-1.3,.96,2.8],[-1.43,1.19,-2.25],[3.6,2.64,3.2],[2.15,.17,.90]];
// Eyes, paws, ears and a flexible tail make the cat readable even at miniature scale.
const catEye=mat(0x3e5146),catNose=mat(0xdcae9c);
for(let side of [-1,1]){
  sphere(-.09,.03,side*.055,.012,catEye,catHead);
  let inner=sphere(-.04,.10,side*.07,.018,catNose,catHead);inner.scale.set(.45,1,.7);
}
sphere(-.115,-.02,0,.014,catNose,catHead);
line([[-.11,-.02,-.02],[-.22,-.01,-.12]],0xc2c4b6,1,catHead);
line([[-.11,-.02,.02],[-.22,-.01,.12]],0xc2c4b6,1,catHead);
// Sequential animation extends the same deterministic time used by export.
const baseUpdateDetails=updateDetails;
updateDetails=function(t){
  baseUpdateDetails(t);
  puddleRings.forEach(([o,p])=>{let v=(t*.6+p)%1.9,size=.4+v;o.scale.set(size,size,.65);o.material.opacity=.38*THREE.MathUtils.smoothstep(v,0,.14)*(1-THREE.MathUtils.smoothstep(v,1.15,1.9));});
  gulls.forEach(({g,wings},i)=>{
    const perch=new THREE.Vector3(...perches[i]);
    const cycle=(t+(i===3?0:i*8)+2)%42,airborne=cycle>18&&cycle<32;
    let flight=0;
    g.position.copy(perch);g.rotation.y=.4+i*.7;
    if(airborne){
      const u=(cycle-18)/14,rise=Math.sin(Math.PI*u);
      g.position.set(perch.x+Math.sin(u*Math.PI*2)*1.2*rise,perch.y+rise*1.4,perch.z+rise*.8);
      g.rotation.y=-u*Math.PI*2;
      flight=THREE.MathUtils.smoothstep(rise,0,.25);
    }
    // The approach blends from the resting pose into a short upward flight.
    const distance=camera.position.distanceTo(perch);
    const startled=THREE.MathUtils.smoothstep(6-distance,0,3);
    if(startled>0){
      const away=perch.clone().sub(camera.position);away.y=0;
      if(away.lengthSq()<.0001)away.set(1,0,0);else away.normalize();
      const destination=perch.clone().addScaledVector(away,1.6);destination.y+=1.8;
      g.position.lerp(destination,startled);flight=Math.max(flight,startled);
    }
    const flutter=.35+.5*Math.sin(t*6+i);
    wings[0].rotation.x=THREE.MathUtils.lerp(-.85,flutter,flight);
    wings[1].rotation.x=THREE.MathUtils.lerp(.85,-flutter,flight);
    if(i===3&&flight<.05){g.position.y+=.012*Math.sin(t*.9);g.rotation.z=.025*Math.sin(t*.8);}
    else g.rotation.z=0;
  });
};
// A raised, wooded village at the far corner gives the harbor a distant backdrop.
let bank=sphere(-3.95,.94,-4.52,1,mat(0x9fba92));bank.scale.set(1.05,1.04,.46);
function hillsideTree(x,z,scale){
  cyl(x,1.91,z,.05*scale,.07*scale,.85*scale,C.wood);
  const crown=new THREE.Group();crown.position.set(x,2.28,z);root.add(crown);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;
    let leaf=sphere(Math.cos(a)*.16*scale,Math.sin(i*2)*.06*scale,Math.sin(a)*.12*scale,.28*scale,
      [mat(0x83a980),mat(0x99bb90),mat(0x6e9c80)][i%3],crown);
    leaf.scale.y=.9;
  }
  detailAnimations.push((t)=>{crown.rotation.z=.018*Math.sin(t*.8+x)+.035*Math.pow(Math.max(0,Math.sin((t-4)*.17)),8)});
}
function hillsideHouse(x,z,scale){
  const g=new THREE.Group();g.position.set(x,1.98,z);g.scale.setScalar(scale);root.add(g);
  box(0,.28,0,.72,.56,.52,mat(0xeee9d9),g);
  // A real pitched roof with separate ridges reads as a tiled village house.
  let roofGeo=new THREE.BufferGeometry();
  const verts=[-.46,.56,-.36, .46,.56,-.36, 0,.84,-.36, -.46,.56,.36, 0,.84,.36, .46,.56,.36,
    -.46,.56,-.36, 0,.84,-.36, 0,.84,.36, -.46,.56,-.36, 0,.84,.36, -.46,.56,.36,
    0,.84,-.36, .46,.56,-.36, .46,.56,.36, 0,.84,-.36, .46,.56,.36, 0,.84,.36];
  roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));roofGeo.computeVertexNormals();
  let roofMesh=new THREE.Mesh(roofGeo,mat(0x718c8a,{side:THREE.DoubleSide}));g.add(roofMesh);
  for(let i=-2;i<=2;i++){
    const zz=i*.12;line([[-.46,.57,zz],[0,.85,zz],[.46,.57,zz]],0x536f70,1,g);
  }
  box(-.18,.29,.265,.17,.2,.015,C.wood,g);box(.18,.22,.265,.14,.37,.015,C.wood,g);
  box(-.18,.29,.277,.11,.14,.008,C.glass,g);box(.18,.22,.275,.025,.03,.01,C.gold,g);
}
hillsideHouse(-4.38,-4.53,.74);hillsideHouse(-3.62,-4.58,.66);
hillsideTree(-4.80,-4.55,.95);hillsideTree(-3.13,-4.61,.85);hillsideTree(-4.04,-4.79,.68);
// The vessel rounds the short breakwater into the outer water, then returns to its berth.
// The same curve is sampled for the wake, so its trail follows the actual route.
const sailingRoute=new THREE.CatmullRomCurve3([
  new THREE.Vector3(3.35,.14,-.65),new THREE.Vector3(3.65,.14,-1.15),
  new THREE.Vector3(3.90,.14,-1.80),new THREE.Vector3(4.02,.14,-2.35),
  new THREE.Vector3(4.00,.14,-2.75),new THREE.Vector3(3.87,.14,-2.98),
  new THREE.Vector3(3.67,.14,-3.02),new THREE.Vector3(3.51,.14,-2.85),
  new THREE.Vector3(3.42,.14,-2.55),new THREE.Vector3(3.32,.14,-2.15),
  new THREE.Vector3(3.10,.14,-1.70),new THREE.Vector3(3.08,.14,-1.10),
  new THREE.Vector3(3.35,.14,-.65)
],false,'centripetal');
const previousDetails=updateDetails;
const smooth01=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
// Ease through the close turn, then pick up speed again on the straight water.
const loopProgress=x=>{const v=smooth01(x);return v+.55/(2*Math.PI)*Math.sin(2*Math.PI*v)};
const wakeEvents=[31.5,33.2,40.8,42.5].map(start=>({start,source:sailingRoute.getPointAt(loopProgress((start-30)/16))}));
function passingWake(phase,x,z){
  let response=0;
  wakeEvents.forEach(({start,source})=>{
    const arrival=start+Math.max(0,Math.hypot(x-source.x,z-source.z)-.20)/1.05;
    const age=phase-arrival;
    if(age>=0&&age<5)response+=Math.exp(-age/1.7)*Math.sin(age*5);
  });
  return THREE.MathUtils.clamp(response,-1,1);
}
const angleToward=(a,b,u)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*u;
updateDetails=function(t){
  previousDetails(t);
  detailAnimations.forEach(fn=>fn(t));
  let phase=t%60;
  if(phase>28&&phase<48){
    const boat=boats[1].g;
    let u=0,heading=0;
    const startTangent=sailingRoute.getTangentAt(0),endTangent=sailingRoute.getTangentAt(1);
    const startHeading=Math.atan2(startTangent.x,startTangent.z);
    const endHeading=Math.atan2(endTangent.x,endTangent.z);
    if(phase<30)heading=angleToward(.04,startHeading,smooth01((phase-28)/2));
    else if(phase<46)u=loopProgress((phase-30)/16);
    else{u=1;heading=angleToward(endHeading,.04,smooth01((phase-46)/2));}
    const pos=sailingRoute.getPointAt(u),tangent=sailingRoute.getTangentAt(u);
    boat.position.x=pos.x;boat.position.z=pos.z;
    if(phase>=30&&phase<46)heading=Math.atan2(tangent.x,tangent.z);
    boat.rotation.y=heading;
    wake.forEach((ring,i)=>{
      const wakeOffset=.07+(i+1)*.018;
      const wakeU=Math.max(0,u-wakeOffset);
      const point=sailingRoute.getPointAt(wakeU),wakeTangent=sailingRoute.getTangentAt(wakeU);
      ring.position.set(point.x,.13,point.z);
      ring.rotation.y=Math.atan2(wakeTangent.x,wakeTangent.z);
      ring.visible=phase>30&&u>wakeOffset;
      ring.children[0].material.opacity=(.80-i*.028)*THREE.MathUtils.smoothstep(phase,30,31)*(1-THREE.MathUtils.smoothstep(phase,46,48));
      ring.scale.setScalar(.55+i*.10);
    });
  }
  // Each wave reaches the buoys and tied boats according to its own distance.
  for(const i of [0,2,3]){
    const boat=boats[i];boat.g.rotation.z+=.04*passingWake(phase,boat.x,boat.z);
  }
  buoyGroups.forEach((buoy,i)=>{
    const pulse=passingWake(phase,buoy.position.x,buoy.position.z);
    buoy.rotation.z=.025*Math.sin(t*1.1+i)+pulse*.08;
    buoy.position.y=.16+.014*Math.sin(t*.9+i)+pulse*.018;
  });
  reflections[1][0].position.x=boats[1].g.position.x;
  reflections[1][0].position.z=boats[1].g.position.z;
};
// Fine ink outlines emphasize the hulls and roofs without obscuring their painted faces.
function inkEdges(object,threshold=38,opacity=.25){
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry,threshold),
    new THREE.LineBasicMaterial({color:0x668680,transparent:true,opacity,depthWrite:false}));
  object.add(outline);
}
// The same restrained ink edge defines major silhouettes without outlining glass.
landmarkEdges.forEach(mesh=>inkEdges(mesh,38,.18));
inkEdges(roof,38,.18);
boats.forEach(({g})=>{
  inkEdges(g.children[0],38,.31);
  for(let i=0;i<g.children.length;i++){
    const child=g.children[i];
    if(child.isMesh&&child.geometry.type==='BoxGeometry'&&i<15&&child.material!==C.glass)inkEdges(child,45,.20);
  }
});
// A light gust travels across the water before it reaches the flags on the quay.
const gustWave=new THREE.Group();root.add(gustWave);
for(let i=0;i<15;i++){
  let x=(i%3)*.23,z=-3.9+Math.floor(i/3)*.72;
  let piece=box(x,.132,z,.1+(i%4)*.06,.006,.022,mat(0xcaf0df,{transparent:true,opacity:.5}),gustWave);
  piece.rotation.y=.15;
}
const previousMotion=updateDetails;
updateDetails=function(t){
  previousMotion(t);
  let cycle=t%37, u=(cycle-4)/7;
  gustWave.visible=u>=0&&u<=1;
  if(gustWave.visible){
    gustWave.position.x=4-u*6;
    gustWave.children.forEach((piece,i)=>{piece.material.opacity=Math.sin(Math.PI*u)*(.23+.1*Math.sin(t*3+i));});
  }
  flags.forEach((flag,i)=>{
    let arrival=9+i*1.1, pulse=Math.exp(-Math.pow((cycle-arrival)/1.4,2));
    flag.rotation.y+=pulse*.35;
  });
  if(camera.position.distanceTo(cat.position)<3.8&&cat.position.x>3.4)cat.rotation.y=.7;
};

// The outer boat is tied up except while it is under way.
const outerMooring=tube([[3.35,.70,2.80],[3.45,.48,2.40],[3.55,.20,1.15],[3.38,.19,.12]],.018,C.orange);
const updateMooring=updateDetails;
updateDetails=function(t){updateMooring(t);const phase=t%60;outerMooring.visible=!(phase>28&&phase<48);};
// Thin cloud and sunlit rain: pale strokes and translucent shafts stay subordinate to the harbor.
const sunbeams=[];
for(let i=0;i<3;i++){
  let x=-2.8+i*1.7,z=-3.2+i*.5;
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    x-.18,5.1,z, x+.18,5.1,z, x+.92,.32,z+.45,
    x-.18,5.1,z, x+.92,.32,z+.45, x+.36,.32,z+.45
  ],3));geometry.computeVertexNormals();
  const beam=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xffedc1,transparent:true,opacity:.028,side:THREE.DoubleSide,depthWrite:false}));
  beam.renderOrder=5;root.add(beam);sunbeams.push(beam);
}
const skyClouds=[];
for(let i=0;i<3;i++){
  const group=new THREE.Group();group.position.set(-3.8+i*2.6,4.55+i*.16,-4.4);root.add(group);
  let m=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.12,depthWrite:false});
  for(let j=0;j<3;j++){
    let puff=sphere((j-1)*.34,(j%2)*.07,0,.35,m,group);puff.scale.set(1.6,.18,.42);puff.castShadow=false;
  }
  skyClouds.push([group,group.position.x,i]);
}
const fishHome=fishes.map(([fish])=>fish.position.z);
const fishFinMaterial=mat(0x598d90,{side:THREE.DoubleSide});
const fishEyeMaterial=mat(0x294f50);
fishes.forEach(([fish])=>{
  const finGeometry=new THREE.BufferGeometry();
  finGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.07,.028,0, -.02,.09,0, .055,.033,0],3));
  finGeometry.computeVertexNormals();fish.add(new THREE.Mesh(finGeometry,fishFinMaterial));
  for(const side of [-1,1])sphere(.105,.012,side*.046,.009,fishEyeMaterial,fish);
});
// Locate the first close pass on the built-in tour from the path itself, so
// the reaction is independent of frame rate and also works when seeking.
const fishViewPoint=new THREE.Vector3(5,-.3,-1);
function tourPositionAt(t){
  let i=0;while(i<path.length-2&&t>path[i+1].t)i++;
  const a=path[i],b=path[i+1];let u=THREE.MathUtils.clamp((t-a.t)/(b.t-a.t),0,1);u=u*u*(3-2*u);
  return new THREE.Vector3(...a.p).lerp(new THREE.Vector3(...b.p),u);
}
let tourFishStart=Infinity;
for(let t=0;t<=20;t+=.02){if(tourPositionAt(t).distanceTo(fishViewPoint)<8.2){tourFishStart=t;break;}}
let fishApproachArmed=true,fishApproachTime=-Infinity,fishLastTime=0;
function fishStartle(t){
  let start;
  if(exporting){start=run==='tour'?tourFishStart:Infinity;}
  else{
    if(t<fishLastTime){fishApproachArmed=true;fishApproachTime=-Infinity;}
    fishLastTime=t;
    const distance=camera.position.distanceTo(fishViewPoint);
    if(distance>9.4)fishApproachArmed=true;
    if(distance<8.2&&fishApproachArmed){fishApproachTime=t;fishApproachArmed=false;}
    start=fishApproachTime;
  }
  const age=t-start;
  if(!Number.isFinite(age)||age<0||age>6.4)return 0;
  return THREE.MathUtils.smoothstep(age,0,.65)*(1-THREE.MathUtils.smoothstep(age,2.5,6.4));
}
const updateWeather=updateDetails;
updateDetails=function(t){
  updateWeather(t);
  let cloud=.5+.5*Math.sin(t*.12+.5);
  sun.intensity=1.40+.28*cloud;
  sunbeams.forEach((beam,i)=>{beam.material.opacity=(.012+.025*cloud)*(1-.12*i)});
  skyClouds.forEach(([g,x,i])=>{g.position.x=x+.45*Math.sin(t*.055+i*.4);g.children.forEach(p=>p.material.opacity=.09+.05*cloud)});
  caustics.forEach(([o])=>{o.material.emissiveIntensity*=.65+.35*cloud});
  // A brief low-light passage lets the lighthouse beacon glow even in daytime.
  let beaconPulse=Math.pow(Math.max(0,Math.sin(t*.045-1.5)),18)*(1-cloud*.6);
  beacon.material.emissiveIntensity=.25+beaconPulse*1.6;
  weedClumps.forEach((g,i)=>{g.rotation.z=.05*Math.sin(t*.7+i*.6)});
  sideWeeds.forEach((g,i)=>{g.rotation.x=.06*Math.sin(t*.7+i*.55)});
  // A close approach sends the fish apart briefly, then they quietly return.
  const startled=fishStartle(t);
  fishes.forEach(([g,x,p],i)=>{
    const direction=i*2.4,swim=t*.45+p;
    g.position.x=THREE.MathUtils.clamp(x+.30*Math.cos(swim)+startled*Math.cos(direction)*.55,-1.75,4.8);
    g.position.z=THREE.MathUtils.clamp(fishHome[i]+.14*Math.sin(swim)+startled*Math.sin(direction)*.65,-4.25,2.2);
    g.position.y=-.4+.018*Math.sin(t*.65+p);
    g.rotation.y=Math.atan2(-.14*Math.cos(swim),-.30*Math.sin(swim));
    g.children[1].rotation.y=.24*Math.sin(t*4+p);
  });
  sideFish.forEach(([g,z,i])=>{
    g.position.z=THREE.MathUtils.clamp(g.position.z+startled*Math.sin(i*2.1)*.42,-4.25,2.2);
    g.children[1].rotation.y=.18*Math.sin(t*3.5+i);
  });
  // Rain slants more during the same gust that crosses the water and flags.
  let cycle=t%37, gust=Math.exp(-Math.pow((cycle-8)/2.5,2));
  let positions=rainGeo.attributes.position.array;
  for(let i=0;i<positions.length;i+=6){let lean=gust*(6-positions[i+1])*.065;positions[i]+=lean;positions[i+3]+=lean+gust*.02}
  rainGeo.attributes.position.needsUpdate=true;
};
// Objects on the side-facing interior walls remain legible from the guided close-up.
sign('本日の競り\n鯵 480　鯛 780',-4.705,1.57,-2.80,.76,.48,Math.PI/2,'#354e4b','#e9ead6',39);
sign('船便時刻表\n 8:20  12:40\n15:30  17:10',-4.705,1.55,-.75,.59,.68,Math.PI/2,'#eee3cd','#385e58',42);
// A slightly askew clock viewed through the waiting room glass.
const waitingClock=new THREE.Group();waitingClock.position.set(-4.69,1.68,-.20);waitingClock.rotation.x=.10;root.add(waitingClock);
let clockFace=cyl(0,0,0,.13,.13,.025,C.white,waitingClock);clockFace.rotation.z=Math.PI/2;
torus(.02,0,0,.14,.017,C.wood,waitingClock,[0,Math.PI/2,0]);
line([[.038,0,0],[.038,.07,.015]],0x405c59,1,waitingClock);line([[.038,0,0],[.038,-.018,.075]],0x405c59,1,waitingClock);
// Working scale with a readable round dial, a shallow tray and stacked fish boxes.
box(-3.95,.66,-2.45,.38,.22,.38,C.dark);
let scaleDial=cyl(-3.74,.79,-2.45,.13,.13,.035,C.white);scaleDial.rotation.z=Math.PI/2;
torus(-3.715,.79,-2.45,.13,.012,C.rust,root,[0,Math.PI/2,0]);
line([[-3.69,.79,-2.45],[-3.69,.86,-2.49]],0x486763);
box(-3.95,.84,-2.45,.48,.045,.44,C.white);
for(let i=0;i<6;i++){
  let level=Math.floor(i/2),z=-3.55+(i%2)*.43;
  crate(-4.22,.70+level*.25,z,i%3?C.white:C.blue,.43,.22,.37);
}
// A raincoat, hooks and work boots on the back wall.
for(let i=0;i<3;i++){
  const z=-2.19-i*.13;
  torus(-4.69,1.48,z,.038,.009,C.dark,root,[0,Math.PI/2,0]);
}
box(-4.66,1.25,-2.23,.06,.39,.22,C.yellow);
box(-4.64,1.12,-2.23,.07,.15,.32,C.yellow);
for(let i=0;i<2;i++){
  const z=-3.34+i*.20;
  box(-4.62,1.04,z,.12,.26,.12,C.dark);
  box(-4.56,.92,z,.23,.08,.13,C.dark);
}
// Melting ice on the damp warehouse floor and a glint on the open freezer lid.
let warehouseWet=cyl(-3.62,.568,-2.58,.34,.34,.008,mat(0xa6cbc6,{transparent:true,opacity:.5,roughness:.2}));warehouseWet.scale.z=.55;
for(let i=0;i<11;i++){
  let x=-3.75+(rnd()-.5)*.55,z=-2.64+(rnd()-.5)*.35;
  let cube=box(x,.59,z,.045+rnd()*.035,.04,.05,C.glass);cube.rotation.y=rnd()*2;
}
box(-2.99,1.135,-3.28,.48,.01,.025,C.white);

// A few foam fragments react after the returning wake reaches the outer blocks.
const updateShoreFoam=updateDetails;
updateDetails=function(t){
  updateShoreFoam(t);
  const phase=t%60;
  foamBits.forEach(([bit])=>{
    const pulse=Math.max(0,passingWake(phase,bit.position.x,bit.position.z));
    bit.scale.x+=pulse*.42;bit.scale.z=1+pulse*.28;
  });
};
// A curved clear-vinyl umbrella, built panel by panel with fine ribs and droplets.
canopy.visible=false;
umb.children.filter(o=>o.isLine).forEach(o=>umb.remove(o));
const umbrellaGlass=new THREE.MeshStandardMaterial({color:0xccebe4,transparent:true,opacity:.19,side:THREE.DoubleSide,roughness:.12,depthWrite:false});
const umbrellaRib=mat(0xb8d8d1,{transparent:true,opacity:.8,roughness:.4});
const umbrellaDrops=[];
for(let i=0;i<12;i++){
  let a=i*Math.PI/6,b=(i+1)*Math.PI/6;
  let vertices=[];
  const at=(r,theta)=>[Math.cos(theta)*r,1.20-.29*Math.pow(r/.53,1.55),Math.sin(theta)*r];
  for(let j=0;j<5;j++){
    let r0=.53*j/5,r1=.53*(j+1)/5;
    vertices.push(...at(r0,a),...at(r1,a),...at(r1,b),...at(r0,a),...at(r1,b),...at(r0,b));
  }
  let geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  let panel=new THREE.Mesh(geometry,umbrellaGlass);panel.renderOrder=3;umb.add(panel);
  tube([at(0,a),at(.18,a),at(.36,a),at(.53,a)],.006,umbrellaRib,umb);
  for(let j=0;j<2;j++){
    let theta=a+.10+j*.18, r=.17+.11*((i+j)%3);let p=at(r,theta);
    let bead=sphere(p[0],p[1]+.009,p[2],.012,j===0?C.white:C.gold,umb);bead.scale.set(.7,.55,.7);
  }
  if(i%3===0){let drop=sphere(0,0,0,.018,C.gold,umb);drop.scale.set(.7,1.35,.7);umbrellaDrops.push([drop,a,i*.31]);}
}
torus(0,.91,0,.53,.006,umbrellaRib,umb);
tube([[0,.08,0],[0,-.02,0],[.05,-.06,0],[.12,-.04,0],[.14,.01,0]],.013,C.wood,umb);
// The cat's paws alternate as it leaves its shelter; each excursion varies slightly.
const catPaws=[];
for(let x of [-.13,.13])for(let z of [-.085,.085]){
  const leg=cyl(x,.015,z,.033,.038,.08,body.material,cat,8);
  let paw=sphere(x,-.025,z,.045,mat(0xa2a394),cat);paw.scale.set(1.35,.65,.9);catPaws.push([paw,x,z,leg]);
}
for(let i=0;i<3;i++){
  let stripe=sphere(-.08+i*.10,.18,0,.05,mat(0x6c756c),cat);stripe.scale.set(.35,.12,1.85);
}
const catTail=cat.children.find(o=>o.geometry&&o.geometry.type==='TubeGeometry');
const catShadow=cyl(0,.448,0,.20,.20,.004,mat(0x718e85,{transparent:true,opacity:.18,depthWrite:false}));catShadow.scale.z=.6;
// Seaweed grows in small tufts from the submerged side of both quay walls.
const quayWeeds=[];
for(let i=0;i<19;i++){
  let g=new THREE.Group();
  if(i<11)g.position.set(-1.75+i*.57,-.60,2.465);
  else g.position.set(-1.97,-.60,-3.5+(i-11)*.73);
  root.add(g);
  let direction=i<11?1:-1;
  for(let j=0;j<3;j++){
    let h=.18+.08*((i+j)%3);
    tube([[0,0,0],[.025*(j-1),h*.55,.025*direction],[.06*(j-1),h,.04*direction]],.009,[C.green,C.deep,mat(0x88a78a)][j],g);
  }
  quayWeeds.push(g);
}
const updateNearDetails=updateDetails;
updateDetails=function(t){
  updateNearDetails(t);
  umbrellaDrops.forEach(([drop,a,p])=>{
    let q=(t*.8+p)%3.1;drop.visible=q<.85;
    drop.position.set(Math.cos(a)*.52,.91-q*.35,Math.sin(a)*.52);
  });
  const catMotion=catChoreography(t),trip=catMotion.trip;
  const stride=catMotion.moving?1:0;
  catPaws.forEach(([paw,x,z,leg],i)=>{
    const v=Math.sin(t*8+(i===0||i===3?0:Math.PI));
    paw.position.x=x+v*.035*stride;paw.position.y=-.025+Math.max(0,v)*.025*stride;
    leg.position.x=x+v*.018*stride;leg.position.y=.015+Math.max(0,v)*.012*stride;leg.rotation.z=-v*.20*stride;
  });
  if(catTail)catTail.rotation.y=.12*Math.sin(t*1.3);
  const look=Math.max(0,Math.min(1,(3.8-camera.position.distanceTo(cat.position))/1.4));
  catHead.rotation.z=-.26*look;catHead.position.y=.13+.035*look;
  const gaze=camera.position.clone().sub(cat.position).applyAxisAngle(new THREE.Vector3(0,1,0),-cat.rotation.y);
  catHead.rotation.y=THREE.MathUtils.clamp(Math.atan2(gaze.z,-gaze.x),-1.1,1.1)*look;
  let travel=Math.max(0,Math.min(1,(3.55-cat.position.x)/1.3));
  cat.position.z+=travel*.16*Math.sin(trip*2.17);
  catShadow.position.set(cat.position.x,.448,cat.position.z);
  quayWeeds.forEach((g,i)=>{g.rotation.z=.06*Math.sin(t*.8+i*.7)});
};
// Painted boat names, rubbing strakes, cleats and working deck fittings.
boats.forEach(({g},index)=>{
  const names=['汐見丸','あさなぎ','第三丸','しおかぜ'];
  for(const side of [-1,1]){
    sign(names[index],side*.565,.205,-.05,.46,.12,side*Math.PI/2,'#e4ece4','#4c7775',52,g);
    line([[side*.50,.10,-.88],[side*.51,.10,.50],[side*.35,.10,.91],[0,.10,1.17]],0x4c8889,1,g);
    for(let j=0;j<3;j++){
      const zz=-.72+j*.54;
      let streak=box(side*.538,.15,zz,.007,.05+j*.012,.018,C.rust,g);streak.rotation.x=.06;
    }
    // Tire fenders hang from slender rope, with a small worn rim.
    tube([[side*.48,.34,-.27],[side*.65,.27,-.27],[side*.65,.17,-.27]],.009,C.wood,g);
    torus(side*.67,.14,-.27,.08,.008,paleInk,g,[0,Math.PI/2,0]);
  }
  for(let side of [-1,1]){
    box(side*.34,.36,.68,.14,.035,.05,C.dark,g);
    box(side*.34,.385,.68,.06,.025,.14,C.dark,g);
  }
  // The bow locker has a seam and a brass pull.
  box(0,.312,.74,.38,.012,.24,C.white,g);
  line([[-.19,.32,.62],[.19,.32,.62],[.19,.32,.86],[-.19,.32,.86],[-.19,.32,.62]],0x96aaa4,1,g);
  box(0,.326,.72,.08,.01,.025,C.gold,g);
  if(index<2){
    // Radar trace, a weather note and the folded seat cushion.
    torus(-.2,.77,.264,.045,.005,C.gold,g,[0,0,0]);
    line([[-.20,.77,.269],[-.17,.80,.269]],0xd6f6df,1,g);
    box(-.30,.80,-.335,.09,.15,.008,mat(0xd5b98e),g);
    box(-.16,.54,-.23,.29,.05,.26,mat(0xb6a080),g);
    for(let i=0;i<2;i++){
      let boot=box(-.28+i*.12,.43,-.34,.08,.14,.09,C.yellow,g);
      box(-.28+i*.12,.37,-.29,.08,.035,.17,C.yellow,g);
    }
  }else{
    crate(0,.48,-.55,C.blue,.31,.18,.26,g);
    for(let j=0;j<3;j++)sphere(-.12+j*.1,.58,-.55,.035,j%2?C.orange:C.white,g);
  }
});
// The water cutaway includes a loose anchor and a broken length of chain at the seabed.
for(let i=0;i<8;i++){
  let z=.15+i*.20;
  let link=torus(5.07,-.69+.018*Math.sin(i*1.4),z,.075,.012,C.rust,root,[i%2?.3:0,Math.PI/2,0]);
  link.scale.y=.75;
}
stick([5.075,-.72,1.65],[5.075,-.42,1.65],.014,C.rust);
stick([5.075,-.53,1.52],[5.075,-.53,1.78],.014,C.rust);
torus(5.075,-.40,1.65,.035,.009,C.rust,root,[0,Math.PI/2,0]);
tube([[5.075,-.65,1.48],[5.075,-.72,1.65],[5.075,-.65,1.82]],.015,C.rust);
// Small shells and tide marks in the sheltered quay corners.
for(let i=0;i<34;i++){
  let x=-1.9+i*.20,y=-.40-.06*(i%3),z=2.485;
  let shell=sphere(x,y,z,.025,i%2?C.white:C.edge);shell.scale.set(.8,.52,.25);
}

// Grain lines follow the curvature of the upturned skiff's wooden planking.
for(let x of [-.26,-.13,0,.13,.26]){
  let pts=[];
  for(let j=0;j<=12;j++){
    const z=-.78+j*.13, k=1-(x/.42)*(x/.42)-(z/.90)*(z/.90);
    if(k>0)pts.push([3.8+x,.535+.21*Math.sqrt(k),3.9+z]);
  }
  if(pts.length>1)line(pts,0xa98968);
}
line([[3.38,.54,3.9],[3.46,.54,3.35],[3.80,.54,3.0],[4.14,.54,3.35],[4.22,.54,3.9],[4.14,.54,4.45],[3.80,.54,4.8],[3.46,.54,4.45],[3.38,.54,3.9]],0x9a7c5f);
// Detailed radio and kettle on the waiting-room shelf.
const radioFace=mat(0x425d58),radioDial=mat(0xe7dfc4);
box(-2.907,1.12,-.97,.012,.18,.29,radioFace);
for(let i=0;i<5;i++)line([[-2.898,1.06+i*.025,-1.08],[-2.898,1.06+i*.025,-.98]],0xb8c8b5);
for(let z of [-.90,-.86]){let dial=cyl(-2.895,1.14,z,.023,.023,.014,radioDial);dial.rotation.z=Math.PI/2;}
stick([-3.16,1.24,-.98],[-3.27,1.56,-1.00],.009,C.dark);
torus(-4.22,.78,-.48,.10,.014,C.dark,root,[0,0,0]);
stick([-4.12,.76,-.48],[-4.02,.79,-.48],.018,C.white);
cyl(-4.34,.57,-.36,.045,.045,.12,C.white);torus(-4.34,.63,-.36,.046,.008,C.blue);
// Distinct leaves and trailing stems turn the corner plant into a hanging pothos.
for(let i=0;i<12;i++){
  let a=i*Math.PI*2/12, h=.91+.13*Math.sin(i*1.8);
  let x=-2.82+Math.cos(a)*.16,z=-.42+Math.sin(a)*.13;
  stick([-2.82,.74,-.42],[x,h,z],.008,C.green);
  let leaf=sphere(x,h,z,.075,mat(i%3===0?0x6f9b75:i%3===1?0x94b88b:0xb2c99b));
  leaf.scale.set(1.1,.24,.65);leaf.rotation.y=-a;
}
for(let i=0;i<3;i++){
  let a=i*2.1;let x=-2.82+Math.cos(a)*.17,z=-.42+Math.sin(a)*.13;
  tube([[x,.83,z],[x+.03,.69,z+.03],[x+.05,.57,z+.04]],.007,C.green);
  for(let j=0;j<2;j++){let leaf=sphere(x+.03,.68-j*.08,z+.03,.045,C.green);leaf.scale.set(1.3,.35,.65)}
}
// Extra rope turns on the bollards, with a darker band where the line is wet.
for(let x=-1.3;x<4.8;x+=1.55){torus(x,.62,2.8,.115,.014,C.orange);torus(x,.72,2.8,.113,.014,C.wood)}
for(let z=-3.6;z<2;z+=1.5){torus(-2.35,.62,z,.115,.014,C.orange);torus(-2.35,.72,z,.113,.014,C.wood)}
const updateNetBreeze=updateDetails;
updateDetails=function(t){
  updateNetBreeze(t);
  let phase=t%37,arrival=10.4,pulse=Math.exp(-Math.pow((phase-arrival)/1.8,2));
  fishingNet.rotation.x=.025*Math.sin(t*.9)+.12*pulse;
  fishingNet.rotation.z=.008*Math.sin(t*.7+.6)+.018*pulse;
};
// Raindrops gather on the gunwales and drip independently as each boat rocks.
const boatDrops=[],cabinCaustics=[];
boats.forEach(({g},index)=>{
  for(let i=0;i<4;i++){
    const side=i%2?1:-1, z=-.65+Math.floor(i/2)*1.25;
    let drop=sphere(side*.51,.28,z,.014,i%2?C.white:C.gold,g);drop.scale.set(.65,1.45,.65);
    boatDrops.push([drop,index,i,side,z]);
  }
  if(index<2){
    for(let j=0;j<4;j++){
      const material=new THREE.MeshBasicMaterial({color:0xd2f3da,transparent:true,opacity:.33,depthWrite:false});
      let stroke=box(-.25+j*.16,1.063,-.04,.10,.004,.014,material,g);
      cabinCaustics.push([stroke,j,index]);
    }
  }
});
const updateBoatRain=updateDetails;
updateDetails=function(t){
  updateBoatRain(t);
  boatDrops.forEach(([drop,index,i,side,z])=>{
    const q=(t*.72+index*.7+i*.59)%3.7;
    drop.visible=q<.85;drop.position.set(side*.51,.32-q*.31,z);
  });
  cabinCaustics.forEach(([stroke,j,index])=>{
    stroke.position.z=-.04+.06*Math.sin(t*.65+j*.9+index);
    stroke.material.opacity=.22+.1*Math.sin(t*.55+j*.8+index);
  });
  // A flying bird stays a comfortable distance from the lens on close passes.
  gulls.forEach(({g})=>{
    let delta=g.position.clone().sub(camera.position),distance=delta.length();
    if(distance<4.5&&distance>.001)g.position.copy(camera.position).addScaledVector(delta,4.5/distance);
  });
};
// The hand winch has a spoked wheel and an offset crank handle.
for(let i=0;i<4;i++){
  const a=i*Math.PI/2;
  stick([2.09,.83,3.6],[2.09,.83+Math.cos(a)*.20,3.6+Math.sin(a)*.20],.012,C.dark);
}
stick([2.08,.83,3.6],[2.08,1.05,3.6],.018,C.rust);
stick([2.08,1.05,3.6],[1.99,1.05,3.6],.022,C.wood);
// Painted buoy numbers use transparent canvas, so the faded marks follow each bobbing buoy.
function buoyNumber(number){
  const c=document.createElement('canvas');c.width=128;c.height=64;const q=c.getContext('2d');
  q.clearRect(0,0,128,64);q.fillStyle='rgba(244,235,204,.75)';q.font='bold 42px sans-serif';q.textAlign='center';q.textBaseline='middle';q.fillText(number,64,34);
  const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({map:tx,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false});
}
buoyGroups.forEach((g,i)=>{
  const number=String(i+1).padStart(2,'0'),m=buoyNumber(number);
  let front=new THREE.Mesh(new THREE.PlaneGeometry(.17,.085),m);front.position.set(0,.02,.132);g.add(front);
  let side=new THREE.Mesh(new THREE.PlaneGeometry(.17,.085),m);side.position.set(.132,.02,0);side.rotation.y=Math.PI/2;g.add(side);
});
// Quiet, graphic fragments of reflected lamps, boats and gulls in the puddles.
function puddleReflection(x,z,s){
  const y=.455;
  line([[x-.03*s,y,z-.22*s],[x+.02*s,y,z+.15*s]],0x789c98);
  line([[x-.13*s,y,z-.20*s],[x+.08*s,y,z-.20*s]],0x89aaa5);
  line([[x-.19*s,y,z+.06*s],[x-.07*s,y,z+.11*s],[x+.08*s,y,z+.10*s]],0xf0f5e7);
  line([[x+.06*s,y,z-.02*s],[x+.12*s,y,z-.05*s],[x+.18*s,y,z-.02*s]],0x8ca8a0);
}
puddleReflection(-.4,3.15,1);puddleReflection(1.10,4.5,.8);puddleReflection(-3.65,4.1,.75);puddleReflection(3.2,3.15,.65);
// A moving, translucent cloud shadow is clipped to the L-shaped quay and water.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=256;
const shadowContext=shadowCanvas.getContext('2d');
const shadowTexture=new THREE.CanvasTexture(shadowCanvas);shadowTexture.colorSpace=THREE.SRGBColorSpace;
const shadowMaterial=new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
function shadowSurface(cx,cz,w,d,y){
  const geometry=new THREE.PlaneGeometry(w,d),p=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++){
    const worldX=cx+p.getX(i),worldZ=cz-p.getY(i);
    uv.setXY(i,(worldX+5)/10,(5-worldZ)/10);
  }
  let plane=new THREE.Mesh(geometry,shadowMaterial);plane.rotation.x=-Math.PI/2;plane.position.set(cx,y,cz);plane.renderOrder=4;root.add(plane);
}
shadowSurface(0,3.75,10,2.5,.446);
shadowSurface(-3.5,-1.25,3,7.5,.446);
shadowSurface(1.5,-1.25,7,7.5,.132);
function cloudCoverAt(x,z,t){
  const worldX=-7+14*((t%48)/48),worldZ=-.4+1.1*Math.sin(t*.045);
  return Math.exp(-1.5*(Math.pow((x-worldX)/3.5,2)+Math.pow((z-worldZ)/2.3,2)));
}
const updateCloudShadow=updateDetails;
updateDetails=function(t){
  updateCloudShadow(t);
  const phase=(t%48)/48,worldX=-7+14*phase,worldZ=-.4+1.1*Math.sin(t*.045);
  const x=(worldX+5)*25.6,y=(worldZ+5)*25.6;
  shadowContext.clearRect(0,0,256,256);
  shadowContext.save();shadowContext.translate(x,y);shadowContext.scale(1,.65);
  const gradient=shadowContext.createRadialGradient(0,0,0,0,0,90);
  gradient.addColorStop(0,'rgba(85,119,110,.18)');gradient.addColorStop(.55,'rgba(94,128,118,.09)');gradient.addColorStop(1,'rgba(94,128,118,0)');
  shadowContext.fillStyle=gradient;shadowContext.beginPath();shadowContext.arc(0,0,90,0,Math.PI*2);shadowContext.fill();shadowContext.restore();shadowTexture.needsUpdate=true;
  const coverage=Math.exp(-Math.pow(worldX/4.3,2));
  sun.intensity=1.65-.24*coverage;
  sunbeams.forEach((beam,i)=>{beam.material.opacity=(.034-.018*coverage)*(1-.12*i)});
  reflections.forEach(([g])=>{
    const shade=cloudCoverAt(g.position.x,g.position.z,t);
    g.children.forEach(piece=>{piece.material.opacity*=1-.40*shade});
  });
  caustics.forEach(([stroke])=>{stroke.material.emissiveIntensity*=1-.45*cloudCoverAt(stroke.position.x,stroke.position.z,t)});
  cabinCaustics.forEach(([stroke,,index])=>{
    const boat=boats[index].g;stroke.material.opacity*=1-.45*cloudCoverAt(boat.position.x,boat.position.z,t);
  });
  puddleGlints.forEach(({x,z,material})=>{material.opacity=.7*(1-.7*cloudCoverAt(x,z,t))});
};
// A few warm, irregular sparkles appear and disappear independently on the harbor.
const waterSparkles=[];
for(let i=0;i<22;i++){
  const group=new THREE.Group();group.position.set(-1.75+rnd()*6.45,.145,-4.35+rnd()*6.4);root.add(group);
  const m=new THREE.MeshBasicMaterial({color:i%4===0?0xffe5ab:0xeaf9ec,transparent:true,opacity:0,depthWrite:false});
  box(0,0,0,.13,.003,.012,m,group);box(0,.001,0,.012,.003,.065,m,group);
  waterSparkles.push([group,m,rnd()*8]);
}
const updateWaterSparkle=updateDetails;
updateDetails=function(t){
  updateWaterSparkle(t);
  waterSparkles.forEach(([group,material,phase],i)=>{
    const glint=Math.pow(Math.max(0,Math.sin(t*.8+phase)),12);
    const shade=cloudCoverAt(group.position.x,group.position.z,t);
    material.opacity=.65*glint*(1-.8*shade);group.scale.setScalar(.55+.45*glint);
  });
};
// A second, much smaller boat occasionally passes behind the distant breakwater.
const remoteBoat=new THREE.Group();remoteBoat.position.set(.4,.10,-4.77);root.add(remoteBoat);
let remoteHull=box(0,.06,0,.42,.11,.13,C.white,remoteBoat);
let bow=new THREE.Mesh(new THREE.ConeGeometry(.065,.13,6),C.white);bow.rotation.z=-Math.PI/2;bow.position.set(.27,.06,0);remoteBoat.add(bow);
box(-.04,.17,0,.15,.12,.11,C.white,remoteBoat);
box(.04,.18,0,.012,.07,.095,C.glass,remoteBoat);
box(-.04,.24,0,.18,.025,.14,C.blue,remoteBoat);
cyl(-.08,.34,0,.008,.008,.19,C.dark,remoteBoat);sphere(-.08,.44,0,.018,C.orange,remoteBoat);
box(-.35,.025,0,.20,.005,.015,C.foam,remoteBoat);
for(let i=0;i<8;i++){
  let x=.18+i*.55;
  box(x,.105,-4.80,.15,.003,.018,i%2?C.white:C.edge);
}
const updateRemoteBoat=updateDetails;
updateDetails=function(t){
  updateRemoteBoat(t);
  const phase=t%70,active=phase>=3&&phase<20;
  remoteBoat.visible=active;
  let u=THREE.MathUtils.clamp((phase-3)/17,0,1);
  remoteBoat.position.x=.25+3.55*u;remoteBoat.position.y=.10+.012*Math.sin(t*.8);remoteBoat.rotation.z=.015*Math.sin(t*.7);
};
// A very shallow moving surface sits over the translucent water volume.
function makeWaterSurface(cx,cz,w,d,nx,nz){
  const geometry=new THREE.PlaneGeometry(w,d,nx,nz);
  const material=new THREE.MeshStandardMaterial({color:0xb7e8dc,transparent:true,opacity:.18,roughness:.18,metalness:.02,side:THREE.DoubleSide,depthWrite:false});
  const mesh=new THREE.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(cx,.091,cz);mesh.receiveShadow=true;root.add(mesh);
  return {mesh,cx,cz};
}
const waterSurfaces=[makeWaterSurface(1.48,-1.05,7.02,6.95,40,40),makeWaterSurface(1.48,-4.76,7.02,.48,40,4)];
const updateWaterSurface=updateDetails;
updateDetails=function(t){
  updateWaterSurface(t);
  waterSurfaces.forEach(({mesh,cx,cz})=>{
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++){
      const x=cx+positions.getX(i),z=cz-positions.getY(i);
      const wave=.006+.003*Math.sin(x*1.7+t*.8)+.003*Math.sin(z*2.1-t*.65+x*.25);
      positions.setZ(i,wave);
    }
    positions.needsUpdate=true;mesh.geometry.computeVertexNormals();
  });
};

// Braided mooring lines move with their boats; the dipped fibres are darker with water.
const ropeCanvas=document.createElement('canvas');ropeCanvas.width=64;ropeCanvas.height=64;
const ropeContext=ropeCanvas.getContext('2d');
ropeContext.fillStyle='#e6d9c4';ropeContext.fillRect(0,0,64,64);
ropeContext.lineWidth=5;
for(let x=-96;x<128;x+=16){
  ropeContext.strokeStyle='rgba(112,82,60,.25)';ropeContext.beginPath();ropeContext.moveTo(x,0);ropeContext.lineTo(x+64,64);ropeContext.stroke();
  ropeContext.strokeStyle='rgba(255,249,229,.34)';ropeContext.beginPath();ropeContext.moveTo(x+6,0);ropeContext.lineTo(x+70,64);ropeContext.stroke();
}
const ropeTexture=new THREE.CanvasTexture(ropeCanvas);ropeTexture.wrapS=ropeTexture.wrapT=THREE.RepeatWrapping;ropeTexture.repeat.set(8,1);ropeTexture.colorSpace=THREE.SRGBColorSpace;
const ropeMaterial=new THREE.MeshStandardMaterial({color:0xffffff,map:ropeTexture,vertexColors:true,roughness:1});
const dryRope=new THREE.Color(0xdca06b),wetRope=new THREE.Color(0x715a49),ropeColor=new THREE.Color();
const movingMoorings=[
  {mesh:innerMooring,boat:boats[0].g,start:new THREE.Vector3(-2.3,.7,-2.1),end:new THREE.Vector3(-.43,.15,-.3),sag:.40},
  {mesh:quayMooring,boat:boats[3].g,start:new THREE.Vector3(.25,.7,2.8),end:new THREE.Vector3(.45,.12,.72),sag:.42},
  {mesh:outerMooring,boat:boats[1].g,start:new THREE.Vector3(3.35,.70,2.80),end:new THREE.Vector3(0,.20,1.05),sag:.45}
];
movingMoorings.forEach(({mesh})=>{
  mesh.material=ropeMaterial;mesh.frustumCulled=false;
  mesh.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count*3),3));
});
const updateRopeMotion=updateDetails;
updateDetails=function(t){
  updateRopeMotion(t);
  movingMoorings.forEach(({mesh,boat,start,end,sag})=>{
    boat.updateWorldMatrix(true,false);
    const tip=boat.localToWorld(end.clone());
    const first=start.clone().lerp(tip,.34),second=start.clone().lerp(tip,.72);
    first.y-=sag*.82;second.y-=sag;
    const curve=new THREE.CatmullRomCurve3([start,first,second,tip]);
    const segments=32,sides=6,frames=curve.computeFrenetFrames(segments,false);
    const positions=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal,colors=mesh.geometry.attributes.color;
    const radius=mesh.geometry.parameters.radius;
    for(let i=0;i<=segments;i++){
      const point=curve.getPointAt(i/segments),normal=frames.normals[i],binormal=frames.binormals[i];
      const wet=THREE.MathUtils.smoothstep(.16-point.y,0,.12);
      ropeColor.copy(dryRope).lerp(wetRope,wet);
      for(let j=0;j<=sides;j++){
        const angle=j/sides*Math.PI*2,c=-Math.cos(angle),s=Math.sin(angle),index=i*(sides+1)+j;
        const nx=c*normal.x+s*binormal.x,ny=c*normal.y+s*binormal.y,nz=c*normal.z+s*binormal.z;
        positions.setXYZ(index,point.x+radius*nx,point.y+radius*ny,point.z+radius*nz);
        normals.setXYZ(index,nx,ny,nz);colors.setXYZ(index,ropeColor.r,ropeColor.g,ropeColor.b);
      }
    }
    positions.needsUpdate=normals.needsUpdate=colors.needsUpdate=true;
  });
};

// Alternating cloth bands make the little windsock legible even from the overview.
// Its open mouth stays attached to the pole as the passing breeze stretches it.
const sockGeometry=new THREE.CylinderGeometry(.025,.14,.65,16,16,true);
const sockPositions=sockGeometry.attributes.position;
const sockColors=new Float32Array(sockPositions.count*3);
const sockOrange=new THREE.Color(0xe78e6f),sockIvory=new THREE.Color(0xf3e8cf);
for(let i=0;i<sockPositions.count;i++){
  const height=(sockPositions.getY(i)+.325)/.65;
  const band=Math.min(3,Math.floor(height*4));
  const color=band%2?sockIvory:sockOrange;
  sockColors[i*3]=color.r;sockColors[i*3+1]=color.g;sockColors[i*3+2]=color.b;
}
sockGeometry.setAttribute('color',new THREE.BufferAttribute(sockColors,3));
sock.geometry.dispose();sock.geometry=sockGeometry;
sock.material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.9});
torus(0,-.325,0,.14,.009,C.white,sock,[Math.PI/2,0,0]);
const updateSock=updateDetails;
updateDetails=function(t){
  updateSock(t);
  const cycle=t%37,pulse=Math.exp(-Math.pow((cycle-10.1)/1.8,2));
  const stretch=.9+.035*Math.sin(t*.85)+.13*pulse;
  sock.scale.y=stretch;sock.position.x=-2.775+.325*stretch;
  sock.rotation.z=-Math.PI/2+.05*Math.sin(t*.75)+.09*pulse;
  sock.rotation.y=.07*Math.sin(t*.9)+.14*pulse;
};

// Wake crests keep travelling after the boat has passed. Their broken painted
// arcs reach the quay in sequence and leave a brief trace of foam at the wall.
const outgoingWaves=wakeEvents.map(({start,source})=>{
  const pieces=[],splashes=[];
  for(let i=0;i<24;i++){
    const material=new THREE.MeshBasicMaterial({color:i%3?0xd9f4e7:0xf6faf0,transparent:true,opacity:0,depthWrite:false});
    const piece=box(0,.135,0,.10+(i%4)*.035,.004,.015,material);piece.castShadow=false;pieces.push(piece);
  }
  for(let i=0;i<6;i++){
    const material=new THREE.MeshBasicMaterial({color:0xf4fbef,transparent:true,opacity:0,depthWrite:false});
    const piece=box(0,.139,2.43,.14+(i%3)*.055,.005,.025,material);piece.castShadow=false;splashes.push(piece);
  }
  return {start,source,pieces,splashes};
});
const updateWakeCrests=updateDetails;
updateDetails=function(t){
  updateWakeCrests(t);
  const phase=t%60;
  outgoingWaves.forEach(({start,source,pieces,splashes})=>{
    const age=phase-start,active=age>=0&&age<4.8;
    const radius=.20+Math.max(age,0)*1.05;
    const fade=active?Math.sin(Math.PI*age/4.8)*.42:0;
    pieces.forEach((piece,i)=>{
      const angle=i*Math.PI*2/24+.04*Math.sin(i*2.3),x=source.x+radius*Math.cos(angle),z=source.z+radius*Math.sin(angle);
      piece.visible=active&&x>-1.9&&x<4.9&&z>-4.08&&z<2.42&&!(x>2.03&&x<2.84&&z< -3.16);
      if(piece.visible){piece.position.set(x,.135,z);piece.rotation.y=-angle-Math.PI/2;piece.material.opacity=fade*(.65+.35*Math.sin(i*2.1+age));}
    });
    const wallDistance=2.43-source.z,arrival=(wallDistance-.20)/1.05;
    const impact=active?Math.exp(-Math.pow((age-arrival)/.6,2)):0;
    const spread=Math.sqrt(Math.max(0,radius*radius-wallDistance*wallDistance));
    splashes.forEach((piece,i)=>{
      const side=i<3?-1:1,x=source.x+side*spread+(i%3-1)*.15;
      piece.visible=impact>.015&&x>-1.85&&x<4.85;
      if(piece.visible){piece.position.x=x;piece.position.z=2.43-(i%3)*.028;piece.material.opacity=impact*.48;}
    });
  });
};

// A few rain threads catch warm sunlight against the pale sky and water.
// They follow the same falling volume and gust as the quieter base rain.
const litRainCount=150,litRainGeometry=new THREE.BufferGeometry();
litRainGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(litRainCount*6),3));
const litRain=new THREE.LineSegments(litRainGeometry,new THREE.LineBasicMaterial({color:0xdbb784,transparent:true,opacity:.22,depthWrite:false}));
litRain.frustumCulled=false;root.add(litRain);
const updateSunlitRain=updateDetails;
updateDetails=function(t){
  updateSunlitRain(t);
  const source=rainGeo.attributes.position.array,dest=litRainGeometry.attributes.position.array;
  for(let i=0;i<litRainCount;i++){
    const from=i*3*6,to=i*6;
    dest[to]=source[from]+.055;dest[to+1]=source[from+1];dest[to+2]=source[from+2]+.03;
    dest[to+3]=source[from+3]+.055;dest[to+4]=source[from+4];dest[to+5]=source[from+5]+.03;
  }
  litRainGeometry.attributes.position.needsUpdate=true;
  litRainGeometry.setDrawRange(0,Math.floor(litRainCount*rainGeo.drawRange.count/(rainPos.length/3))*2);
  litRain.material.opacity=.12+.15*(sun.intensity/1.65);
};

// The rainbow appears only as the shower relaxes; a rare cloud passage
// also coaxes the harbor light on briefly in the middle of the day.
const beaconHaloCanvas=document.createElement('canvas');beaconHaloCanvas.width=beaconHaloCanvas.height=128;
const beaconHaloContext=beaconHaloCanvas.getContext('2d');
const beaconHaloGradient=beaconHaloContext.createRadialGradient(64,64,1,64,64,62);
beaconHaloGradient.addColorStop(0,'rgba(255,251,215,.95)');
beaconHaloGradient.addColorStop(.16,'rgba(255,223,151,.6)');
beaconHaloGradient.addColorStop(1,'rgba(255,219,145,0)');
beaconHaloContext.fillStyle=beaconHaloGradient;beaconHaloContext.fillRect(0,0,128,128);
const beaconHaloTexture=new THREE.CanvasTexture(beaconHaloCanvas);beaconHaloTexture.colorSpace=THREE.SRGBColorSpace;
const beaconHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:beaconHaloTexture,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
beaconHalo.position.set(lx,2.28,lz);beaconHalo.scale.set(1.0,1.0,1);root.add(beaconHalo);
const beaconLight=new THREE.PointLight(0xffd58b,0,2.5,2);beaconLight.position.set(lx,2.30,lz);root.add(beaconLight);
const updateWeatherMoments=updateDetails;
updateDetails=function(t){
  updateWeatherMoments(t);
  const rainfall=.5+.5*Math.sin(t*.13+Math.PI);
  const rainbowStrength=THREE.MathUtils.smoothstep(.45-rainfall,0,.38);
  rainbow.visible=rainbowStrength>.001;
  rainbow.children.forEach((arc,i)=>{arc.material.opacity=rainbowStrength*(.10-i*.008)});
  const cloudPass=t%192,beaconPulse=Math.exp(-Math.pow((cloudPass-32)/2.8,2));
  beacon.material.emissiveIntensity=.25+beaconPulse*2.1;
  beaconHalo.material.opacity=beaconPulse*.48;
  beaconLight.intensity=beaconPulse*.9;
};

// Fine shafts entering the cabin glass echo those inside the fish warehouse.
const cabinBeams=[];
for(const index of [0,1]){
  const boat=boats[index].g;
  for(let i=0;i<2;i++){
    const z=-.24+i*.27,geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([
      .36,.98,z, .36,.98,z+.12, -.16,.43,z+.20,
      .36,.98,z, -.16,.43,z+.20, -.16,.43,z+.05
    ],3));geometry.computeVertexNormals();
    const material=new THREE.MeshBasicMaterial({color:0xffeac0,transparent:true,opacity:.045,side:THREE.DoubleSide,depthWrite:false});
    const shaft=new THREE.Mesh(geometry,material);shaft.renderOrder=3;boat.add(shaft);cabinBeams.push([shaft,index,i]);
  }
}
const updateInteriorShafts=updateDetails;
updateDetails=function(t){
  updateInteriorShafts(t);
  warehouseBeams.forEach((shaft,i)=>{
    const shade=cloudCoverAt(shaft.position.x,shaft.position.z,t);
    shaft.material.opacity=.055*(1-.6*shade)*(1-.06*i);
  });
  cabinBeams.forEach(([shaft,index,i])=>{
    const boat=boats[index].g,shade=cloudCoverAt(boat.position.x,boat.position.z,t);
    shaft.material.opacity=.05*(1-.6*shade)*(1-.12*i);
  });
};

// The harbor light has a small weathered entrance and a glazed porthole.
// Both sit on the outward-facing diagonal, readable from the harbor overview.
const lighthouseFace=new THREE.Group();lighthouseFace.rotation.y=Math.PI/4;
lighthouseFace.position.set(lx+Math.SQRT1_2*.355,.94,lz+Math.SQRT1_2*.355);root.add(lighthouseFace);
const lighthouseDoor=mat(0x78928a),lighthouseTrim=mat(0xe5e7d9),lighthouseMetal=mat(0x5f7770);
box(0,.15,.005,.25,.31,.025,lighthouseTrim,lighthouseFace);
box(0,.15,.023,.205,.275,.018,lighthouseDoor,lighthouseFace);
box(0,.15,.034,.165,.23,.005,mat(0x849b91),lighthouseFace);
box(-.055,.15,.039,.008,.22,.005,lighthouseMetal,lighthouseFace);
sphere(.068,.13,.044,.012,C.gold,lighthouseFace);
box(0,.005,.04,.31,.035,.16,C.concrete,lighthouseFace);
const portRing=torus(0,.84,-.025,.075,.012,lighthouseMetal,lighthouseFace,[0,0,0]);
const portGlass=cyl(0,.84,-.03,.061,.061,.012,C.glass,lighthouseFace,16);portGlass.rotation.x=Math.PI/2;
box(-.065,.84,-.020,.01,.13,.01,lighthouseTrim,lighthouseFace);
box(.065,.84,-.020,.01,.13,.01,lighthouseTrim,lighthouseFace);
// Narrow mooring-side steps and a dark metal handrail on the beacon pier.
for(let i=0;i<3;i++)box(2.82,.25+i*.15,-3.28-i*.21,.42,.14,.25,C.concrete);
for(let i=0;i<3;i++)stick([3.05,.42+i*.15,-3.28-i*.21],[3.05,.72+i*.15,-3.28-i*.21],.012,lighthouseMetal);
stick([3.05,.72,-3.28],[3.05,1.02,-3.70],.012,lighthouseMetal);

// The outside vending machine faces the quay, beneath its weathered rain hood.
sign('\u3064\u3081\u305f\u3044\u98f2\u307f\u3082\u306e',-4.55,1.615,.386,.40,.10,0,'#e4e9d9','#be735c',36,vendingMachine);
box(-4.335,1.04,.387,.055,.30,.018,mat(0xb9c9bf),vendingMachine);
for(let i=0;i<4;i++){
  let button=cyl(-4.335,1.15-i*.055,.403,.012,.012,.008,i===0?C.orange:C.white,vendingMachine,8);
  button.rotation.x=Math.PI/2;
}
box(-4.335,.91,.402,.035,.045,.012,C.dark,vendingMachine);
for(let i=0;i<5;i++)box(-4.80+i*.12,1.782,.08,.045,.005,.52,i%2?C.rust:C.edge,vendingMachine);

// A short stack of fish trays sits beside, rather than in front of, the scale.
const crateLabel=mat(0x7b9d99),crateBlue=mat(0x80aeb2);
for(let level=0;level<2;level++){
  const x=-3.06,y=.69+level*.235,z=-2.08;
  crate(x,y,z,level?crateBlue:C.white,.38,.215,.34);
  box(x+.198,y+.025,z,.009,.035,.16,crateLabel);
  box(x+.204,y+.025,z,.007,.012,.10,C.dark);
  box(x+.199,y-.05,z-.09,.008,.028,.035,crateBlue);
}

// A tiny printed chart and tide card sit clipped to each cabin boat's board.
const chartCanvas=document.createElement('canvas');chartCanvas.width=512;chartCanvas.height=320;
const chartContext=chartCanvas.getContext('2d');
chartContext.fillStyle='#f5f1df';chartContext.fillRect(0,0,512,320);
chartContext.fillStyle='#cbe5df';chartContext.fillRect(15,38,300,265);
chartContext.fillStyle='#bdcfb6';chartContext.beginPath();chartContext.moveTo(15,38);chartContext.lineTo(140,38);chartContext.lineTo(125,90);chartContext.lineTo(170,130);chartContext.lineTo(128,164);chartContext.lineTo(100,240);chartContext.lineTo(15,275);chartContext.fill();
chartContext.strokeStyle='#7aa6a0';chartContext.lineWidth=3;
for(let i=0;i<3;i++){chartContext.beginPath();chartContext.moveTo(16,278+i*7);chartContext.bezierCurveTo(120,260+i*5,180,150+i*8,302,150+i*8);chartContext.stroke();}
chartContext.setLineDash([7,6]);chartContext.strokeStyle='#c97860';chartContext.lineWidth=3;chartContext.beginPath();chartContext.moveTo(128,240);chartContext.lineTo(205,210);chartContext.lineTo(268,105);chartContext.stroke();chartContext.setLineDash([]);
chartContext.fillStyle='#426c69';chartContext.font='bold 20px sans-serif';chartContext.fillText('\u6e2f\u5185\u56f3',18,27);chartContext.fillText('\u6f6e\u6c50\u8868',336,27);
chartContext.font='16px sans-serif';
['06:20  1.4m','11:45  0.6m','17:30  1.5m','23:10  0.5m'].forEach((row,i)=>chartContext.fillText(row,326,75+i*48));
chartContext.strokeStyle='#9bb5a8';chartContext.lineWidth=2;chartContext.strokeRect(320,38,180,265);
const chartTexture=new THREE.CanvasTexture(chartCanvas);chartTexture.colorSpace=THREE.SRGBColorSpace;
const chartMaterial=new THREE.MeshBasicMaterial({map:chartTexture,side:THREE.DoubleSide});
// A green fish-finder display complements the round radar trace on the console.
const sonarCanvas=document.createElement('canvas');sonarCanvas.width=256;sonarCanvas.height=192;
const sonarContext=sonarCanvas.getContext('2d');sonarContext.fillStyle='#315f5c';sonarContext.fillRect(0,0,256,192);
sonarContext.strokeStyle='#649e91';sonarContext.lineWidth=2;
for(let y=30;y<192;y+=35){sonarContext.beginPath();sonarContext.moveTo(0,y);sonarContext.lineTo(256,y);sonarContext.stroke();}
sonarContext.strokeStyle='#d8d596';sonarContext.lineWidth=5;sonarContext.beginPath();sonarContext.moveTo(0,151);sonarContext.bezierCurveTo(40,135,63,165,102,143);sonarContext.bezierCurveTo(142,123,175,150,256,115);sonarContext.stroke();
sonarContext.fillStyle='#dcdfa7';for(const [x,y] of [[50,70],[92,98],[162,62],[184,83]])sonarContext.fillRect(x,y,9,4);
const sonarTexture=new THREE.CanvasTexture(sonarCanvas);sonarTexture.colorSpace=THREE.SRGBColorSpace;
const sonarMaterial=new THREE.MeshBasicMaterial({map:sonarTexture,side:THREE.DoubleSide});
for(const index of [0,1]){
  const boat=boats[index].g;
  const chart=new THREE.Mesh(new THREE.PlaneGeometry(.27,.185),chartMaterial);chart.rotation.set(-Math.PI/2,0,-.18);chart.position.set(-.18,.451,-.61);boat.add(chart);
  box(-.18,.456,-.708,.07,.012,.018,C.dark,boat);
  const sonar=new THREE.Mesh(new THREE.PlaneGeometry(.12,.10),sonarMaterial);sonar.position.set(.06,.76,.258);boat.add(sonar);
}

// Low ribbons of mist drift behind the breakwater, staying almost transparent.
const seaMistCanvas=document.createElement('canvas');seaMistCanvas.width=256;seaMistCanvas.height=64;
const seaMistContext=seaMistCanvas.getContext('2d');
seaMistContext.save();seaMistContext.translate(128,32);seaMistContext.scale(1,.23);
const seaMistGradient=seaMistContext.createRadialGradient(0,0,0,0,0,124);
seaMistGradient.addColorStop(0,'rgba(235,249,242,.6)');seaMistGradient.addColorStop(.45,'rgba(227,245,237,.28)');seaMistGradient.addColorStop(1,'rgba(227,245,237,0)');
seaMistContext.fillStyle=seaMistGradient;seaMistContext.beginPath();seaMistContext.arc(0,0,124,0,Math.PI*2);seaMistContext.fill();seaMistContext.restore();
const seaMistTexture=new THREE.CanvasTexture(seaMistCanvas);seaMistTexture.colorSpace=THREE.SRGBColorSpace;
const seaMist=[];
for(let i=0;i<4;i++){
  const material=new THREE.SpriteMaterial({map:seaMistTexture,transparent:true,opacity:.16,depthWrite:false});
  const sprite=new THREE.Sprite(material),x=.62+i*1.17;
  sprite.position.set(x,.27+i*.035,-4.78);sprite.scale.set(1.45,.38,1);root.add(sprite);
  seaMist.push([sprite,x,i*.9]);
}
const updateSeaMist=updateDetails;
updateDetails=function(t){
  updateSeaMist(t);
  seaMist.forEach(([sprite,x,phase])=>{
    sprite.position.x=x+.13*Math.sin(t*.09+phase);
    sprite.position.y=.27+.035*(phase/.9)+.015*Math.sin(t*.12+phase);
    sprite.material.opacity=.12+.035*(.5+.5*Math.sin(t*.1+phase));
  });
};

// The shore-side tire rocks outward briefly as the moored boat meets a ripple.
const shoreFender=boats[0].g.children.find(o=>o.geometry&&o.geometry.type==='TorusGeometry'&&o.geometry.parameters.radius===.13&&o.position.x<0&&o.position.z===-.27);
const shoreFenderRim=boats[0].g.children.find(o=>o.geometry&&o.geometry.type==='TorusGeometry'&&o.geometry.parameters.radius===.08&&o.position.x<0&&o.position.z===-.27);
const updateFenderContact=updateDetails;
updateDetails=function(t){
  updateFenderContact(t);
  const bump=Math.pow(Math.max(0,Math.sin(t*.48+boats[0].phase)),10)*.03;
  shoreFender.position.x=-.65-bump;shoreFenderRim.position.x=-.67-bump;
};

// Small graphic bird reflections are projected onto the wet ground. They are
// shown only inside a puddle, so they move with both the bird and the viewpoint.
const reflectionPools=[[-.4,3.15,.55],[1.10,4.5,.43],[-3.65,4.1,.40],[3.2,3.15,.35]];
const reflectedGulls=[];
reflectionPools.forEach(([x,z,size],poolIndex)=>{
  gulls.forEach((bird,birdIndex)=>{
    const geometry=new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-.085,0,.02),new THREE.Vector3(0,0,-.012),new THREE.Vector3(.085,0,.02)
    ]);
    const material=new THREE.LineBasicMaterial({color:0x668e88,transparent:true,opacity:0,depthWrite:false});
    const silhouette=new THREE.Line(geometry,material);silhouette.position.y=.461;root.add(silhouette);
    reflectedGulls.push({silhouette,poolIndex,birdIndex,x,z,size});
  });
});
const updateGullReflections=updateDetails;
updateDetails=function(t){
  updateGullReflections(t);
  reflectedGulls.forEach(({silhouette,birdIndex,x,z,size})=>{
    const {g,wings}=gulls[birdIndex],eye=camera.position,mirrorY=.91-g.position.y;
    const denominator=eye.y-mirrorY,factor=(eye.y-.455)/denominator;
    const px=eye.x+(g.position.x-eye.x)*factor,pz=eye.z+(g.position.z-eye.z)*factor;
    const distance=Math.pow((px-x)/size,2)+Math.pow((pz-z)/(size*.55),2);
    const inside=1-THREE.MathUtils.smoothstep(distance,.26,.64);
    const flying=THREE.MathUtils.smoothstep(wings[0].rotation.x,-.85,-.55);
    silhouette.visible=denominator>0&&factor>0&&factor<1&&inside>.01&&flying>.01;
    if(silhouette.visible){
      silhouette.position.set(px,.461,pz);silhouette.rotation.y=g.rotation.y;
      silhouette.material.opacity=.5*inside*flying;
    }
  });
};

// Irregular tide staining follows both wet faces of the L-shaped quay.
// The translucent bands stay behind the shells and rope rings on the wall.
function tidalBand(axis,start,end,face,top,bottom,color,opacity){
  const positions=[],segments=64;
  function vertex(u,y){return axis==='x'?[u,y,face]:[face,y,u];}
  for(let i=0;i<segments;i++){
    const a=start+(end-start)*i/segments,b=start+(end-start)*(i+1)/segments;
    const topA=top+.018*Math.sin(a*3.7)+.008*Math.sin(a*9.1);
    const topB=top+.018*Math.sin(b*3.7)+.008*Math.sin(b*9.1);
    const lowA=bottom+.025*Math.sin(a*2.8+1.2),lowB=bottom+.025*Math.sin(b*2.8+1.2);
    const p=vertex(a,topA),q=vertex(b,topB),r=vertex(b,lowB),s=vertex(a,lowA);
    positions.push(...p,...q,...r,...p,...r,...s);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
  root.add(new THREE.Mesh(geometry,material));
}
tidalBand('x',-1.96,4.93,2.492,-.08,-.39,0x86a89b,.13);
tidalBand('x',-1.96,4.93,2.491,-.46,-.72,0x668f82,.12);
tidalBand('z',-3.82,2.44,-1.991,-.08,-.39,0x86a89b,.13);
tidalBand('z',-3.82,2.44,-1.990,-.46,-.72,0x668f82,.12);
// Soft rust bleeds down from the iron rings in narrow, uneven streaks.
const rustWash=new THREE.MeshBasicMaterial({color:0xa7795b,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide});
for(const x of [-.7,.9,2.6,4.15]){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    x-.034,.12,2.487, x+.036,.12,2.487, x+.008,-.32,2.487,
    x-.034,.12,2.487, x+.008,-.32,2.487, x-.008,-.32,2.487
  ],3));geometry.computeVertexNormals();root.add(new THREE.Mesh(geometry,rustWash));
}
// Uneven oyster clusters break up the otherwise straight submerged edge.
const shellIvory=mat(0xd7e0cf),shellGrey=mat(0xa9c1b2);
for(let i=0;i<8;i++){
  const x=-1.6+i*.78,y=-.57+.035*Math.sin(i*2.4);
  for(let j=0;j<3;j++){
    const shell=sphere(x+(j-1)*.055,y+.018*(j%2),2.476,.043+(j%2)*.012,j===1?shellIvory:shellGrey);
    shell.scale.set(1.25,.68,.28);shell.rotation.z=(j-1)*.35;
  }
}

// The water-perching gull leaves a very small ripple while it rests.
const gullWaterRingMaterial=new THREE.MeshBasicMaterial({color:0xe9f8ec,transparent:true,opacity:.24,depthWrite:false});
const gullWaterRing=torus(2.15,.133,.90,.16,.006,gullWaterRingMaterial);
gullWaterRing.castShadow=false;
const updateFloatingGull=updateDetails;
updateDetails=function(t){
  updateFloatingGull(t);
  const bird=gulls[3].g,atWater=bird.position.y<.28&&Math.hypot(bird.position.x-2.15,bird.position.z-.90)<.28;
  gullWaterRing.visible=atWater;
  if(atWater){
    gullWaterRing.position.x=bird.position.x;gullWaterRing.position.z=bird.position.z;
    const ripple=(t*.36)%1.5;gullWaterRing.scale.setScalar(.6+ripple*.55);
    gullWaterRing.material.opacity=.28*(1-ripple/1.5);
  }
};

// Rotate the distribution of each reflection with its hull while keeping the
// individual painted strokes horizontal and gently displaced by the water.
const updateReflectionDirection=updateDetails;
updateDetails=function(t){
  updateReflectionDirection(t);
  reflections.forEach(([group,index])=>{
    const boat=boats[index].g,angle=boat.rotation.y,c=Math.cos(angle),s=Math.sin(angle);
    group.position.x=boat.position.x;group.position.z=boat.position.z;
    group.children.forEach(piece=>{
      const phase=piece.userData.phase;
      const x=piece.userData.homeX+.035*Math.sin(t*.55+phase);
      const z=piece.userData.homeZ+.020*Math.sin(t*.4+phase*.7);
      piece.position.x=c*x+s*z;piece.position.z=-s*x+c*z;
    });
  });
};

// Windings, flanges and a small hook give the old hand winch a working purpose.
const winchCable=mat(0x5f7770),winchIron=mat(0x6d7770),winchRust=mat(0x9a6650);
for(let i=0;i<7;i++)torus(2.235+i*.055,.83,3.6,.198,.010,winchCable,root,[0,Math.PI/2,0]);
for(const x of [2.165,2.635]){
  const flange=cyl(x,.83,3.6,.225,.225,.028,winchIron,root,16);flange.rotation.z=Math.PI/2;
  torus(x+(x<2.4?-.016:.016),.83,3.6,.19,.011,winchRust,root,[0,Math.PI/2,0]);
  for(let i=0;i<5;i++){
    const a=i*Math.PI*2/5;
    sphere(x+(x<2.4?-.018:.018),.83+Math.cos(a)*.18,3.6+Math.sin(a)*.18,.012,C.gold);
  }
}
// Short reddish marks show the paint wearing away on the drum and brackets.
for(let i=0;i<20;i++){
  const a=i*2.4,x=2.20+(i%7)*.065;
  const mark=box(x,.83+Math.cos(a)*.202,3.6+Math.sin(a)*.202,.025+(i%3)*.012,.008,.018,winchRust);
  mark.rotation.x=a;
}
for(let i=0;i<5;i++)box(2.12+i*.14,.568,3.79,.055,.006,.03,winchRust);
tube([[2.62,.93,3.6],[2.78,1.06,3.6],[2.78,1.62,3.6],[2.31,2.08,3.6]],.008,winchCable);
const hookGeometry=new THREE.TorusGeometry(.055,.011,6,18,Math.PI*1.55);
const winchHook=new THREE.Mesh(hookGeometry,winchIron);winchHook.position.set(2.3,1.055,3.6);winchHook.rotation.z=-.65;root.add(winchHook);

// The landing net has a shallow mesh bag rather than only a bare hoop.
const landingMesh=new THREE.Group();landingMesh.position.set(-2.94,1.76,1.45);root.add(landingMesh);
for(let i=-2;i<=2;i++){
  const x=i*.062,half=Math.sqrt(.19*.19-x*x);
  line([[x,-half,0],[x*.85,-half*.5,-.075],[x*.7,0,-.12],[x*.85,half*.5,-.075],[x,half,0]],0x88a49a,1,landingMesh);
}
for(let i=-2;i<=2;i++){
  const y=i*.062,half=Math.sqrt(.19*.19-y*y);
  line([[-half,y,0],[-half*.5,y*.85,-.075],[0,y*.7,-.12],[half*.5,y*.85,-.075],[half,y,0]],0x88a49a,1,landingMesh);
}
const bucketHandleGeometry=new THREE.TorusGeometry(.16,.008,6,24,Math.PI);
const bucketHandle=new THREE.Mesh(bucketHandleGeometry,paleInk);bucketHandle.position.set(-3.05,.73,1.62);root.add(bucketHandle);
for(const side of [-1,1])sphere(-3.05+side*.16,.73,1.62,.014,C.dark);

// A tiny fish photograph and a paper charm sit at the cabin window frames.
const catchCanvas=document.createElement('canvas');catchCanvas.width=catchCanvas.height=128;
const catchContext=catchCanvas.getContext('2d');
catchContext.fillStyle='#eee9d9';catchContext.fillRect(0,0,128,128);
catchContext.fillStyle='#8ab8b1';catchContext.fillRect(8,8,112,87);
catchContext.fillStyle='#d8bc83';catchContext.beginPath();catchContext.ellipse(63,53,34,16,-.12,0,Math.PI*2);catchContext.fill();
catchContext.beginPath();catchContext.moveTo(31,53);catchContext.lineTo(17,39);catchContext.lineTo(18,67);catchContext.closePath();catchContext.fill();
catchContext.beginPath();catchContext.moveTo(53,39);catchContext.lineTo(61,27);catchContext.lineTo(72,39);catchContext.closePath();catchContext.fill();
catchContext.fillStyle='#466b65';catchContext.beginPath();catchContext.arc(85,49,2.5,0,Math.PI*2);catchContext.fill();
catchContext.strokeStyle='#b89c70';catchContext.lineWidth=2;catchContext.beginPath();catchContext.moveTo(52,42);catchContext.lineTo(49,63);catchContext.stroke();
catchContext.fillStyle='#617e73';catchContext.font='bold 13px sans-serif';catchContext.fillText('SHIOMI 07',20,114);
const catchTexture=new THREE.CanvasTexture(catchCanvas);catchTexture.colorSpace=THREE.SRGBColorSpace;
const catchMaterial=new THREE.MeshBasicMaterial({map:catchTexture,side:THREE.DoubleSide});
const charmCanvas=document.createElement('canvas');charmCanvas.width=64;charmCanvas.height=160;
const charmContext=charmCanvas.getContext('2d');charmContext.fillStyle='#f0dfb9';charmContext.fillRect(0,0,64,160);
charmContext.strokeStyle='#bf775b';charmContext.lineWidth=4;charmContext.strokeRect(4,4,56,152);
charmContext.fillStyle='#8e5a4d';charmContext.font='bold 35px sans-serif';charmContext.textAlign='center';
charmContext.fillText('\u5927',32,65);charmContext.fillText('\u6f01',32,115);
const charmTexture=new THREE.CanvasTexture(charmCanvas);charmTexture.colorSpace=THREE.SRGBColorSpace;
const charmMaterial=new THREE.MeshBasicMaterial({map:charmTexture,side:THREE.DoubleSide});
for(const index of [0,1]){
  const boat=boats[index].g;
  const photo=new THREE.Mesh(new THREE.PlaneGeometry(.075,.10),catchMaterial);photo.position.set(.389,.96,.12);photo.rotation.y=Math.PI/2;boat.add(photo);
  const charm=new THREE.Mesh(new THREE.PlaneGeometry(.055,.13),charmMaterial);charm.position.set(-.35,.94,.08);charm.rotation.y=Math.PI/2;boat.add(charm);
}
