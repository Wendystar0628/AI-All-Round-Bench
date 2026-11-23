// Procedural details are kept in geometry so the project works from file://.
function detailTower(t) {
  const g = t.group;
  if (t.type === 'fire') {
    for (const x of [-.39, .39]) {
      box(.09, .62, .16, mats.dark, x, .48, 0, g);
      box(.11, .05, .2, mats.gold, x, .8, 0, g);
    }
    box(.28, .04, .025, mats.white, 0, .66, .17, g);
  } else if (t.type === 'gate') {
    for (const x of [-.39, .39]) {
      box(.11, .7, .22, mats.dark, x, .48, 0, g);
      box(.06, .33, .03, mats.gold, x, .5, .13, g);
    }
    box(.34, .045, .17, mats.green, 0, .91, 0, g);
  } else if (t.type === 'honey') {
    const orbit = new THREE.Group(); g.add(orbit); orbit.position.y = .55;
    let r = mesh(new THREE.TorusGeometry(.45, .025, 6, 6), mats.white, 0, 0, 0, orbit);
    r.rotation.x = Math.PI / 2; t.idleRotor = orbit;
    let signal=mesh(new THREE.TorusGeometry(.48,.018,6,24),new THREE.MeshBasicMaterial({color:0xe7c578,transparent:true,opacity:.35,depthWrite:false}),0,.2,0,g);
    signal.rotation.x=Math.PI/2;signal.visible=false;t.lureSignal=signal;
    cyl(.025, .04, .3, mats.dark, 0, .98, 0, g, 6);
    mesh(new THREE.SphereGeometry(.065, 8, 6), mats.gold, 0, 1.15, 0, g);
    if (t.branch === '坚守') for (const x of [-.3, .3]) box(.11, .5, .12, mats.white, x, .5, 0, g);
    if (t.branch === '诱捕') for (const z of [-.3, .3]) box(.16, .08, .16, mats.green, 0, .38, z, g);
  } else if (t.type === 'inter') {
    for (const x of [-.23, .23]) box(.08, .13, .38, mats.dark, x, .5, .05, t.turret);
    box(.18, .04, .1, mats.gold, 0, .66, .46, t.turret);
    mesh(new THREE.ConeGeometry(.12, .22, 4), mats.gold, 0, .26, .45, g).rotation.x = Math.PI / 2;
    if (t.branch === '贯穿') for (const x of [-.2, .2]) box(.07, .08, .42, mats.green, x, .55, .35, t.turret);
    if (t.branch === '压制') {let r=mesh(new THREE.TorusGeometry(.28,.025,6,12),mats.gold,0,.55,.48,t.turret);r.rotation.x=Math.PI/2}
  } else if (t.type === 'sandbox') {
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      box(.055, .58, .055, mats.white, Math.cos(a) * .33, .54, Math.sin(a) * .33, g);
    }
    let ring = mesh(new THREE.TorusGeometry(.29, .018, 6, 12), mats.white, 0, .65, 0, g);
    ring.rotation.y = Math.PI / 2;
  } else if (t.type === 'repair') {
    const orbit = new THREE.Group(); g.add(orbit); orbit.position.y = .49;
    let ring = mesh(new THREE.TorusGeometry(.43, .025, 6, 16), mats.green, 0, 0, 0, orbit);
    ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      mesh(new THREE.SphereGeometry(.055, 6, 4), mats.white, Math.cos(a)*.43, 0, Math.sin(a)*.43, orbit);
    }
    t.idleRotor = orbit;
  }
}

function detailEnemy(e) {
  const g=e.group, m=e.material;
  if(e.type==='worm') {
    for(let i=0;i<3;i++) {
      let r=mesh(new THREE.TorusGeometry(.13-i*.018,.018,5,8),mats.dark,0,.18,-i*.2,g);
      r.rotation.x=Math.PI/2;
    }
    for(const x of [-.07,.07]) mesh(new THREE.SphereGeometry(.035,6,4),mats.white,x,.24,.13,g);
  } else if(e.type==='flood') {
    const swarm=new THREE.Group();g.add(swarm);swarm.position.y=.32;e.swarm=swarm;
    for(let i=0;i<4;i++) {
      let a=i*Math.PI/2, shard=mesh(new THREE.OctahedronGeometry(.12),m,Math.cos(a)*.36,0,Math.sin(a)*.36,swarm);
      shard.rotation.y=a;
    }
    box(.32,.055,.035,mats.dark,0,.31,.25,g);
  } else if(e.type==='trojan') {
    box(.27,.035,.025,mats.white,0,.31,.195,g);
    box(.035,.24,.025,mats.white,0,.25,.195,g);
    box(.24,.035,.025,mats.dark,0,.18,.197,g);
    e.flaps=[];
    for(const side of [-1,1]){
      let hinge=new THREE.Group();hinge.position.set(side*.18,.25,.2);g.add(hinge);
      box(.16,.3,.035,mats.gold,side*-.08,0,0,hinge);e.flaps.push({hinge,side});
    }
  } else if(e.type==='ransom') {
    e.arms=[];for(const x of [-.26,.26]) {let arm=box(.09,.25,.1,mats.dark,x,.29,0,g);arm.rotation.z=x<0?-.55:.55;e.arms.push(arm)}
    cyl(.09,.1,.12,mats.gold,0,.36,.2,g,6);
    box(.1,.1,.04,mats.dark,0,.33,.27,g);
  } else if(e.type==='fly') {
    const rotor=new THREE.Group();g.add(rotor);rotor.position.y=.3;
    for(let i=0;i<3;i++){let a=i*Math.PI*2/3,blade=box(.6,.025,.06,mats.white,0,0,0,rotor);blade.rotation.y=a}
    e.rotor=rotor;
  } else if(e.type==='shield') {
    for(let i=0;i<4;i++){let a=i*Math.PI/2,plate=box(.16,.32,.045,mats.dark,Math.sin(a)*.28,.3,Math.cos(a)*.28,g);plate.rotation.y=a}
  } else if(e.type==='boss') {
    if(game.index===0) {
      for(let i=0;i<6;i++){let a=i*Math.PI/3;let spire=mesh(new THREE.ConeGeometry(.11,.55,4),mats.dark,Math.cos(a)*.55,.9,Math.sin(a)*.55,g);spire.rotation.z=Math.cos(a)*.28}
      cyl(.08,.16,.55,mats.gold,0,1.12,0,g,6);
    } else if(game.index===1) {
      const rotor=new THREE.Group();g.add(rotor);rotor.position.y=.55;
      for(let i=0;i<3;i++){let r=mesh(new THREE.TorusGeometry(.7+i*.1,.025,6,24),i===1?mats.gold:mats.white,0,0,0,rotor);r.rotation.x=Math.PI/2+i*.38}
      e.rotor=rotor;
    } else {
      for(let i=0;i<6;i++){let a=i*Math.PI/3,spike=mesh(new THREE.ConeGeometry(.12,.62,4),mats.dark,Math.cos(a)*.55,.9,Math.sin(a)*.55,g);spike.rotation.z=Math.cos(a)*.55;spike.rotation.x=Math.sin(a)*.55}
      let crown=mesh(new THREE.TorusGeometry(.42,.04,6,6),mats.gold,0,1.2,0,g);crown.rotation.x=Math.PI/2;
      let flare=mesh(new THREE.TorusGeometry(.94,.045,6,8),mats.red,0,.8,0,g);flare.rotation.x=Math.PI/2;flare.visible=false;e.phaseGlow=flare;
    }
  }
}

function turnEnemy(e, vector, dt) {
  if(vector.x*vector.x+vector.z*vector.z<.00001)return;
  const target=Math.atan2(vector.x,vector.z),delta=Math.atan2(Math.sin(target-e.group.rotation.y),Math.cos(target-e.group.rotation.y));
  e.group.rotation.y+=delta*Math.min(1,dt*6);
}

function markTemporaryIsolation(t){
  let ring=mesh(new THREE.TorusGeometry(.52,.035,6,8),mats.gold,0,1.03,0,t.group);
  ring.rotation.x=Math.PI/2;t.temporaryRing=ring;
  let cap=mesh(new THREE.OctahedronGeometry(.12),mats.gold,0,1.2,0,t.group);
  ring.userData.tower=t;cap.userData.tower=t;
}

// Articulated pieces are driven by simulation time so replay exports match play.
function animateEnemyModel(e,time,dt){
  if(e.type==='worm')e.parts.forEach((part,i)=>{part.position.x=Math.sin(time*9-i*.8)*i*.035});
  if(e.swarm)e.swarm.rotation.y+=dt*2.2;
  if(e.flaps)for(let {hinge,side} of e.flaps){let target=e.revealed?side*1.15:0;hinge.rotation.y+=(target-hinge.rotation.y)*Math.min(1,dt*7)}
  if(e.arms)e.arms.forEach((arm,i)=>{arm.rotation.x=-Math.sin((e.attackPulse||0)*Math.PI/.28)*.9;arm.rotation.z=(i?1:-1)*(.55+Math.sin(time*3)*.08)});
  if(e.phaseGlow&&e.phaseGlow.visible){e.phaseGlow.rotation.z+=dt*1.8;e.phaseGlow.scale.setScalar(1+.08*Math.sin(time*6))}
}

// Environmental equipment lives around the board, outside deployable cells.
function decorateInfrastructure(index,g){
  game.facilitySignals=[];
  if(index===0){
    // Segmented enterprise: rack banks, indicator strips and a service bus.
    for(let side of [-1,1])for(let n=0;n<3;n++){
      let x=side*6.75,z=-3.4+n*3.1,h=.55+n*.08;
      box(.48,h,.68,mats.dark,x,h/2-.32,z,g);
      for(let j=0;j<4;j++)box(.28,.028,.025,j===n?mats.gold:mats.green,x,-.13+j*.12,z+.35,g);
      let lamp=mesh(new THREE.SphereGeometry(.035,6,4),mats.green,x+.16,.16,z+.35,g);game.facilitySignals.push({part:lamp,phase:n+side});
    }
    line([new THREE.Vector3(-6.75,-.31,-4.6),new THREE.Vector3(-6.75,-.31,4.6)],0x68aa94,.75,g);
    line([new THREE.Vector3(6.75,-.31,-4.6),new THREE.Vector3(6.75,-.31,4.6)],0x68aa94,.75,g);
  }else if(index===1){
    // Dual data centres are connected by exterior fibre loops and moving light.
    for(let side of [-1,1]){
      let x=side*6.95;box(.65,.48,1.25,mats.dark,x,-.06,2.9,g);
      for(let j=0;j<5;j++)box(.43,.025,.025,mats.signal,x,-.17+j*.095,3.54,g);
      for(let j=0;j<2;j++){let ring=mesh(new THREE.TorusGeometry(.55+j*.14,.018,6,32),mats.signal,x,.05,2.9,g);ring.rotation.y=Math.PI/2;game.facilitySignals.push({part:ring,phase:j+side,rotate:true})}
      let points=[];for(let n=0;n<=24;n++){let q=n/24;points.push(new THREE.Vector3(x,-.25+Math.sin(q*Math.PI)*.38,-4.3+q*6.7))}line(points,0x68d4e8,.65,g);
    }
  }else{
    // Industrial safety perimeter surrounds the physical air gap, never a road.
    let a=1.66,y=.46;
    line([new THREE.Vector3(-a,y,-a),new THREE.Vector3(a,y,-a),new THREE.Vector3(a,y,a),new THREE.Vector3(-a,y,a),new THREE.Vector3(-a,y,-a)],0xe7c578,.9,g);
    for(let side of [-1,1])for(let n=0;n<6;n++){
      let x=side*1.57,z=-1.38+n*.55,mark=box(.1,.025,.27,mats.gold,x,y+.01,z,g);mark.rotation.y=Math.PI/4;
    }
    for(let side of [-1,1]){
      let x=side*6.9;box(.16,.16,8.1,mats.edge,x,-.34,0,g);
      for(let z of [-3,0,3]){let valve=mesh(new THREE.TorusGeometry(.24,.03,6,10),mats.gold,x,.03,z,g);valve.rotation.y=Math.PI/2;game.facilitySignals.push({part:valve,phase:z,rotate:true})}
    }
  }
}
function animateInfrastructure(time){
  for(const item of game.facilitySignals||[]){
    if(item.rotate)item.part.rotation.z=time*.35+item.phase;
    else item.part.scale.setScalar(.75+.25*Math.sin(time*2+item.phase));
  }
}

// Endpoint infrastructure is distinct from deployable towers and stays within its cell.
function decorateEndpoint(g,p,entry){
  const group=new THREE.Group();world.add(group);group.position.set(p.x,.12,p.z);
  const material=entry?mats.green:mats.gold;
  let base=mesh(new THREE.TorusGeometry(.47,.028,6,entry?8:6),material,0,.035,0,group);base.rotation.x=Math.PI/2;
  let orbit=new THREE.Group();orbit.position.y=entry?.25:.3;group.add(orbit);
  for(let i=0;i<(entry?3:4);i++){
    let a=i*Math.PI*2/(entry?3:4),x=Math.cos(a)*.38,z=Math.sin(a)*.38;
    if(entry)mesh(new THREE.OctahedronGeometry(.045),material,x,0,z,orbit);
    else {let fin=box(.07,.22,.07,material,x,.02,z,orbit);fin.rotation.y=-a}
  }
  if(!entry){let ring=mesh(new THREE.TorusGeometry(.3,.016,6,6),mats.white,0,.32,0,group);ring.rotation.x=Math.PI/2}
  g.endpointSignals.push({part:orbit,speed:entry?.7:-.5});
}
