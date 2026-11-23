const world = new THREE.Scene(),
  cam = new THREE.PerspectiveCamera(33, 1, 0.05, 100),
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
document.querySelector('#viewport').appendChild(renderer.domElement);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
world.background = new THREE.Color('#24202e');
world.fog = new THREE.FogExp2('#221c2c', 0.03);
let studio = document.createElement('canvas');
studio.width = 1024;
studio.height = 512;
let ec = studio.getContext('2d');
let eg = ec.createLinearGradient(0, 0, 0, 512);
for (let [t, c] of [
  [0, '#717282'],
  [0.33, '#43404e'],
  [0.49, '#16151e'],
  [0.56, '#50465d'],
  [1, '#1a1820'],
])
  eg.addColorStop(t, c);
ec.fillStyle = eg;
ec.fillRect(0, 0, 1024, 512);
[
  [40, 75, 155, 95, '#fffaff'],
  [320, 105, 115, 72, '#fff7ef'],
  [620, 130, 210, 42, '#eae8ff'],
  [878, 75, 43, 150, '#c9ccff'],
  [452, 170, 26, 69, '#c4eaf1'],
].forEach(([x, y, w, h, c]) => {
  ec.fillStyle = c;
  ec.fillRect(x, y, w, h);
});
let env = new THREE.CanvasTexture(studio);
env.colorSpace = THREE.SRGBColorSpace;
env.mapping = THREE.EquirectangularReflectionMapping;
let pm = new THREE.PMREMGenerator(renderer);
world.environment = pm.fromEquirectangular(env).texture;
pm.dispose();
world.add(new THREE.HemisphereLight(0xe7dffa, 0x3d2a59, 0.92));
function lamp(x, y, z, color, p, sh) {
  let l = new THREE.DirectionalLight(color, p);
  l.position.set(x, y, z);
  if (sh) {
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    Object.assign(l.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6 });
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.012;
    l.shadow.radius = 3;
  }
  world.add(l);
}
lamp(-4, 9, 5, 0xfff6ff, 2.7, true);
lamp(4, 5, -5, 0xccadff, 3);
lamp(-6, 2, -2, 0xabebf1, 1);
let mats = (c, r = 0.4, m = 0.2) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
let baseMat = mats('#282632', 0.36, 0.57),
  sideMat = mats('#403c4d', 0.28, 0.67),
  darkMat = mats('#34323e', 0.48, 0.55);
function gelmat(color, atten) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.082,
    metalness: 0.035,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transmission: 0.73,
    thickness: 1.9,
    ior: 1.39,
    attenuationColor: new THREE.Color(atten),
    attenuationDistance: 1.65,
    envMapIntensity: 1.45,
    side: THREE.DoubleSide,
  });
}
let gelsMat = [
    gelmat('#be7aff', '#7222db'),
    gelmat('#81efcd', '#14a491'),
    gelmat('#ffb75e', '#ea7215'),
  ],
  chrome = new THREE.MeshPhysicalMaterial({
    color: 0xdedbea,
    metalness: 0.99,
    roughness: 0.105,
    envMapIntensity: 1.7,
    clearcoat: 0.8,
  });
let unitBall = new THREE.SphereGeometry(1, 48, 32);
function mesh(g, m, x, y, z, parent = world) {
  let o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function box(x, y, z, w, h, d, m, par) {
  return mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, par);
}
function line(pts, c, par, opacity = 1) {
  let o = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts.map((a) => new THREE.Vector3(...a))),
    new THREE.LineBasicMaterial({ color: c, transparent: true, opacity }),
  );
  par.add(o);
  return o;
}
function slab(w, d, y, h, mat, rad = 0.19) {
  let s = new THREE.Shape(),
    a = w / 2,
    b = d / 2;
  s.moveTo(-a + rad, -b);
  s.lineTo(a - rad, -b);
  s.quadraticCurveTo(a, -b, a, -b + rad);
  s.lineTo(a, b - rad);
  s.quadraticCurveTo(a, b, a - rad, b);
  s.lineTo(-a + rad, b);
  s.quadraticCurveTo(-a, b, -a, b - rad);
  s.lineTo(-a, -b + rad);
  s.quadraticCurveTo(-a, -b, -a + rad, -b);
  let g = new THREE.ExtrudeGeometry(s, {
    depth: h,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.035,
    bevelThickness: 0.035,
  });
  g.rotateX(-Math.PI / 2);
  return mesh(g, mat, 0, y, 0);
}
let floor = mesh(new THREE.PlaneGeometry(160, 160), mats('#1b1724', 0.74, 0.1), 0, -0.41, 0);
floor.rotation.x = -Math.PI / 2;
let floorGrid = new THREE.GridHelper(130, 116, 0x55515f, 0x55515f);
floorGrid.position.y = -0.405;
floorGrid.material.transparent = true;
floorGrid.material.opacity = 0.15;
world.add(floorGrid);
slab(9.25, 5.1, -0.36, 0.15, baseMat);
slab(9.25, 5.1, -0.195, 0.037, sideMat);
slab(9.28, 5.12, -0.15, 0.12, darkMat);
let topGrid = new THREE.Group();
world.add(topGrid);
for (let i = -4; i <= 4; i += 0.5)
  line(
    [
      [i, 0.008, -2.43],
      [i, 0.008, 2.43],
    ],
    0xaaa1ba,
    topGrid,
    0.13,
  );
for (let z = -2; z <= 2; z += 0.5)
  line(
    [
      [-4.5, 0.008, z],
      [4.5, 0.008, z],
    ],
    0xaaa1ba,
    topGrid,
    0.13,
  );
function printLabel(str, x, z, w) {
  let can = document.createElement('canvas');
  can.width = 640;
  can.height = 64;
  let c = can.getContext('2d');
  c.fillStyle = '#d4cce0';
  c.font = 'bold 35px monospace';
  c.fillText(str, 2, 44);
  let tex = new THREE.CanvasTexture(can);
  tex.colorSpace = THREE.SRGBColorSpace;
  let o = mesh(
    new THREE.PlaneGeometry(w, w / 10),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.66, depthWrite: false }),
    x,
    0.014,
    z,
    topGrid,
  );
  o.rotation.x = -Math.PI / 2;
  o.castShadow = false;
}
printLabel('PHASE LAB   //   DYNAMICS', -2.93, 2.15, 2.45);
printLabel('TEST BED   /   01', 3.23, 2.15, 1.62);
for (let x of [-4.41, 4.41])
  for (let z of [-2.32, 2.32]) {
    mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.018, 16), sideMat, x, 0.014, z);
    line(
      [
        [x - 0.033, 0.026, z],
        [x + 0.033, 0.026, z],
      ],
      0x1a1823,
      world,
    );
  }
for (let k = 0; k < 2; k++) {
  let r = 1.82 + k * 0.09;
  line(
    Array.from({ length: 121 }, (_, i) => [
      r * Math.cos((i * TAU) / 120),
      0.013,
      r * Math.sin((i * TAU) / 120),
    ]),
    0xaa99b8,
    topGrid,
    0.32 - k * 0.13,
  );
}
for (let i = -20; i <= 20; i++)
  line(
    [
      [i * 0.21, 0.013, -2.43],
      [i * 0.21, 0.013, -2.43 + (i % 5 ? 0.07 : 0.14)],
    ],
    0xaca5b7,
    topGrid,
    0.55,
  );
let gels = [],
  balls = [],
  tank = new THREE.Group();
world.add(tank);
let tankMode = false,
  water = null,
  wave = false,
  wavePhase = 0,
  elapsed = 0,
  foam = [],
  bubbles = [],
  drops = [],
  ballMats = ['#ffac4e', '#72e3bf', '#b48df6'].map((c) => mats(c, 0.18, 0.25));
function makeGels() {
  gels = [
    new Gel(0, 0, 0.05, 1.47, 1.67, gelsMat[0]),
    new Gel(1, -2.83, -0.2, 0.83, 1.18, gelsMat[1]),
    new Gel(2, 2.85, 0.07, 1.03, 1.05, gelsMat[2]),
  ];
  for (let g of gels) {
    embedBubbles(g);
    castGelLight(g);
  }
}
const tracerBand=new THREE.TorusGeometry(.994,.016,8,56);
const tracerInk=mats('#e4e0d7',.32,.28);
function newBall(x, y, z, r, m, mat, group = -1) {
  let o = mesh(unitBall, group<0?impactMetal:mat, x, y, z);
  o.scale.setScalar(r);
  let b = { x, y, z, r, m, group, o, vx: 0, vy: 0, vz: 0, held: false, cool: 0 };
  b.spinX=b.spinZ=0;
  if(group>=0){
    const band=new THREE.Mesh(tracerBand,tracerInk);
    band.rotation.set(.85,.34+group*.5,.3);
    o.add(band);
  }
  balls.push(b);
  return b;
}
function clearObjects() {
  for (let g of gels) {
    world.remove(g.mesh);
    g.geo.dispose();
    if (g.air) {
      world.remove(g.air);
      g.air.dispose();
    }
    if (g.caustic) {
      world.remove(g.caustic);
      g.caustic.geometry.dispose();
      g.caustic.material.map.dispose();
      g.caustic.material.dispose();
    }
    if (g.broken) g.mesh.material[1].dispose();
  }
  gels = [];
  for (let b of balls) world.remove(b.o);
  balls = [];
  foam = [];
  bubbles = [];
  drops = [];
  wave = false;
  wavePhase = 0;
  elapsed = 0;
}
let glass = new THREE.MeshPhysicalMaterial({
  color: '#b4cfe6',
  roughness: 0.12,
  metalness: 0.02,
  transparent: true,
  opacity: 0.075,
  depthWrite: false,
  side: THREE.DoubleSide,
});
for (let z of [-FW / 2, FW / 2]) box(0, 1.6, z, FL, 3.2, 0.026, glass, tank);
for (let x of [-FL / 2, FL / 2]) box(x, 1.6, 0, 0.026, 3.2, FW, glass, tank);
for (let y of [0.04, 3.2])
  line(
    [
      [-FL / 2, y, -FW / 2],
      [FL / 2, y, -FW / 2],
      [FL / 2, y, FW / 2],
      [-FL / 2, y, FW / 2],
      [-FL / 2, y, -FW / 2],
    ],
    0xbae6f5,
    tank,
    0.78,
  );
for (let x of [-FL / 2, FL / 2])
  for (let z of [-FW / 2, FW / 2])
    line(
      [
        [x, 0, z],
        [x, 3.2, z],
      ],
      0xd2f5ff,
      tank,
      0.8,
    );
let piston = box(-4.01, 1.16, 0, 0.13, 2.28, 3.06, mats('#697482', 0.32, 0.77), tank);
for (let k = 0; k < 8; k++) box(0, 0.0 + (k - 3.5) * 0.25, 0, 0.15, 0.055, 3.06, darkMat, piston);
let rod = box(-4.25, 1.63, 0, 0.55, 0.17, 0.17, chrome, tank);
let wg = new THREE.PlaneGeometry(FL, FW, 62, 24);
wg.rotateX(-Math.PI / 2);
let wm = new THREE.MeshPhysicalMaterial({
  color: '#349eac',
  roughness: 0.115,
  metalness: 0.13,
  transmission: 0.24,
  thickness: 0.4,
  transparent: true,
  opacity: 0.81,
  clearcoat: 1,
  ior: 1.333,
  side: THREE.DoubleSide,
});
let waterTop = mesh(wg, wm, 0, 0, 0, tank);
waterTop.castShadow = false;
let sideG = new THREE.BufferGeometry(),
  si = [],
  sa = [];
let boundary = [];
for (let i = 0; i < 63; i++) boundary.push(i);
for (let i = 1; i < 25; i++) boundary.push(i * 63 + 62);
for (let i = 61; i >= 0; i--) boundary.push(24 * 63 + i);
for (let i = 23; i >= 0; i--) boundary.push(i * 63);
boundary.forEach((ix, k) => {
  sa.push(0, 0, 0, 0, 0, 0);
  let n = (k + 1) % boundary.length;
  si.push(k * 2, k * 2 + 1, n * 2, n * 2, k * 2 + 1, n * 2 + 1);
});
sideG.setAttribute('position', new THREE.Float32BufferAttribute(sa, 3));
sideG.setIndex(si);
let waterSide = mesh(
  sideG,
  new THREE.MeshPhysicalMaterial({
    color: '#349ba8',
    transparent: true,
    opacity: 0.31,
    roughness: 0.13,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  0,
  0,
  0,
  tank,
);
waterSide.castShadow = false;
let specks = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(1, 1),
  new THREE.MeshStandardMaterial({
    color: '#ddf9f6',
    roughness: 0.2,
    transparent: true,
    opacity: 0.75,
  }),
  1400,
);
tank.add(specks);
specks.count = 0;
const waterBeadGeo=new THREE.SphereGeometry(1,12,8);
const sprayBeads=new THREE.InstancedMesh(waterBeadGeo,new THREE.MeshPhysicalMaterial({
  color:'#9be1e9',roughness:.045,metalness:.13,clearcoat:1,transparent:true,opacity:.76,envMapIntensity:1.7
}),1200);
const entrainedAir=new THREE.InstancedMesh(waterBeadGeo,new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,
  vertexShader:`varying vec3 vN,vV;void main(){vec4 eye=modelViewMatrix*instanceMatrix*vec4(position,1.);
   vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vV=-eye.xyz;gl_Position=projectionMatrix*eye;}`,
  fragmentShader:`varying vec3 vN,vV;void main(){vec3 n=normalize(vN);float rim=pow(1.-max(0.,dot(n,normalize(vV))),2.);
   float shine=pow(max(0.,dot(n,normalize(vec3(-.35,.55,.76)))),17.);
   gl_FragColor=vec4(mix(vec3(.46,.82,.87),vec3(.95,1.,1.),shine),.08+.70*rim+.76*shine);}`
}),640);
tank.add(sprayBeads,entrainedAir);sprayBeads.count=entrainedAir.count=0;
for(const cloud of [specks,sprayBeads,entrainedAir])cloud.frustumCulled=false;
let dummy = new THREE.Object3D();
function drawWater() {
  skin.mesh.visible = !!water;
  waterTop.visible = waterSide.visible = !water;
  if (water) skin.rebuild(water);
  caustics(water);
  let a = wg.attributes.position;
  for (let i = 0; i < a.count; i++) a.setY(i, water?.smooth?.[i] || 1.52);
  a.needsUpdate = true;
  wg.computeVertexNormals();
  let sides = sideG.attributes.position;
  boundary.forEach((i, k) => {
    sides.setXYZ(k * 2, a.getX(i), 0.048, a.getZ(i));
    sides.setXYZ(k * 2 + 1, a.getX(i), a.getY(i), a.getZ(i));
  });
  sides.needsUpdate = true;
  sideG.computeVertexNormals();
  sideG.computeBoundingSphere();
  piston.position.x = -FL / 2 + (water?.piston || 0.23);
  rod.position.x = (piston.position.x - 4.52) * 0.5;
  rod.scale.x = (piston.position.x + 4.52) / 0.55;
  for (let sh of pistonRods) {
    sh.position.x = rod.position.x;
    sh.scale.y = (piston.position.x + 4.52) / 0.96;
  }
  let n = 0;
  function dot(x, y, z, r, sy) {
    if (n >= 1400) return;
    dummy.position.set(x, y, z);
    dummy.scale.set(r, sy, r);
    dummy.updateMatrix();
    specks.setMatrixAt(n++, dummy.matrix);
  }
  for (let i=0;i<foam.length;i+=3){const f=foam[i];dot(f.x,f.y,f.z,f.r*.64,f.r*f.aspect*.63);}
  if (water) {
    let s = water.state;
    for (let i = 0; i < s.length; i += 24) {
      let x = s[i] - FL / 2,
        y = s[i + 1],
        z = s[i + 2] - FW / 2,
        h = water.height(x, z);
      if (
        (y > h + 0.12 && Math.abs(s[i + 5]) > 1.5) ||
        (y > h - 0.045 && Math.abs(s[i + 4]) + Math.abs(s[i + 5]) > 3.1)
      )
        dot(x, y + 0.02, z, 0.019, 0.014);
    }
  }
  for(const [items,cloud,capacity] of [[bubbles,entrainedAir,640],[drops,sprayBeads,1200]]){
    cloud.count=Math.min(items.length,capacity);
    for(let j=0;j<cloud.count;j++){
      const d=items[j];dummy.position.set(d.x,d.y,d.z);
      const stretch=cloud===sprayBeads?1+Math.min(.48,Math.abs(d.vy)*.13):1;
      dummy.scale.set(d.r/Math.sqrt(stretch),d.r*stretch,d.r/Math.sqrt(stretch));
      dummy.updateMatrix();cloud.setMatrixAt(j,dummy.matrix);
    }
    cloud.instanceMatrix.needsUpdate=true;
  }
  specks.count = n;
  specks.instanceMatrix.needsUpdate = true;
}
let yaw = 0.3,
  pitch = 0.32,
  zoom = 1,
  targetY = 1.38;
function resize() {
  let el = document.querySelector('#viewport'),
    w = el.clientWidth || 800,
    h = el.clientHeight || 450;
  renderer.setPixelRatio(
    typeof exporting != 'undefined' && exporting ? 1 : Math.min(window.devicePixelRatio || 1, 1.6),
  );
  renderer.setSize(w, h, false);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
function camera() {
  let dist =
    Math.max(
      8.3,
      10.65 / (2 * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect),
      (tankMode ? 6.0 : demo >= 0 ? 7.65 : 6.55) / (2 * Math.tan((cam.fov * Math.PI) / 360)),
    ) * zoom;
  const descentStart = demo === 1 ? 2.45 : 0.33;
  let follow = demo >= 0 ? clamp((presTime - descentStart) / 0.87, 0, 1) : 0;
  follow = follow * follow * (3 - 2 * follow);
  let h = targetY - (tankMode ? 0.14 : 0.9) * follow;
  if (demo === 1) {
    h += 0.23 * (1 - follow);
    dist *= 1 + 0.04 * (1 - follow);
  }
  if (demo < 0 && !tankMode) {
    let by = (gels[targetGel]?.h || 1.67) + config.height + 0.9;
    h = 1.36 + Math.max(0, by - 3.9) * 0.39;
    let ct = Math.cos(pitch),
      st = Math.sin(pitch),
      tangent = Math.tan((cam.fov * Math.PI) / 360);
    let fit = (x, y, z) => {
      let depth = x * Math.sin(yaw) + z * Math.cos(yaw);
      return (
        (depth * ct + (y - h) * st + (Math.abs((y - h) * ct - depth * st) * 1.05) / tangent) * zoom
      );
    };
    dist = Math.max(
      dist,
      fit(3.8, -0.04, 1.7),
      fit(-3.8, -0.04, 1.7),
      fit(gels[targetGel]?.x || 0, by + 0.12, 0),
    );
  }
  dist *= 1 - (tankMode ? 0.019 : 0.115) * follow;
  let heading=yaw,elevation=pitch,focus=0;
  if(demo===3){
    const ease=(lo,hi)=>{let t=clamp((presTime-lo)/(hi-lo),0,1);return t*t*(3-2*t)};
    const driver=ease(2,4)-ease(6,9),shore=ease(6,10)-ease(12.5,15.5),settled=ease(12.5,16.5);
    focus=-.40*driver+.48*shore;
    heading+=.10*driver-.26*shore-.10*settled;
    elevation+=.08*driver-.06*shore-.11*settled;
    dist*=1-.065*driver-.065*shore+.025*settled;
    h+=.09*driver-.13*settled;
  }
  cam.position.set(focus+Math.sin(heading)*Math.cos(elevation)*dist,
    h+Math.sin(elevation)*dist,Math.cos(heading)*Math.cos(elevation)*dist);
  cam.lookAt(focus,h,0);
}
function render() {
  if (!tankMode && gels[targetGel]) {
    gauge.position.x = gels[targetGel].x;
    gauge.position.z = gels[targetGel].z;
  }
  for (let g of gels) if (g.air) updateBubbles(g);
  gauge.visible = !tankMode && !exporting && balls.some((b) => b.held);
  camera();
  for (let b of balls) b.o.position.set(b.x, b.y, b.z);
  if (tankMode && water) captureRefraction();
  if(!tankMode && balls.length)captureGelReflection();
  renderer.render(world, cam);
}
function freshJelly(preview = true) {
  clearObjects();
  tankMode = false;
  tank.visible = false;
  topGrid.visible = true;
  makeGels();
  if (preview) {
    let r = 0.41 + 0.036 * config.mass,
      b = newBall(0, gels[0].h + config.height + r, 0.05, r, config.mass, chrome);
    b.held = true;
  }
  yaw = 0.26;
  pitch = 0.32;
  zoom = 1;
  targetY = demo >= 0 ? 2.08 : 1.48;
}
function freshTank() {
  clearObjects();
  tankMode = true;
  tank.visible = true;
  topGrid.visible = false;
  yaw = 0.29;
  pitch = 0.29;
  zoom = 1;
  targetY = 1.43;
  drawWater();
}
function softShadow(parent, x, z, w, h, opacity, y = 0.022) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  let ctx = c.getContext('2d'),
    gr = ctx.createRadialGradient(48, 48, 2, 48, 48, 46);
  gr.addColorStop(0, 'rgba(0,0,0,1)');
  gr.addColorStop(0.48, 'rgba(0,0,0,.80)');
  gr.addColorStop(0.79, 'rgba(0,0,0,.30)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 96, 96);
  let o = mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
    x,
    y,
    z,
    parent,
  );
  o.rotation.x = -Math.PI / 2;
  o.castShadow = false;
  return o;
}
softShadow(world, 0.2, 0, 12.5, 7.4, 0.78, -0.395);
for (let [x, z, r] of [
  [0, 0.05, 3.35],
  [-2.83, -0.2, 2.4],
  [2.85, 0.07, 2.5],
])
  softShadow(topGrid, x, z, r * 1.28, r, 0.72);
printLabel('B   /   ELASTIC', -2.71, 1.18, 1.75);
printLabel('A   /   VISCOELASTIC', 0.12, 1.82, 1.99);
printLabel('C   /   SOFT', 3, 1.32, 1.48);
const inlay = new THREE.MeshBasicMaterial({ color: '#ad8dd6' });
for (let x of [-3.85, 3.85]) box(x, -0.147, 2.589, 0.64, 0.021, 0.015, inlay);
let gauge = new THREE.Group();
world.add(gauge);
let guideCol = 0xc1aecf;
for (let j = 0; j < 17; j++) {
  let y = 1.94 + j * 0.083;
  line(
    [
      [0.012, y, 0.061],
      [0.012, y + 0.031, 0.061],
    ],
    guideCol,
    gauge,
    0.44,
  );
}
for (let j = 0; j < 14; j++) {
  let y = 0.1 + j * 0.236;
  line(
    [
      [-1.93, y, -0.91],
      [-1.93 + (j % 3 ? 0.061 : 0.128), y, -0.91],
    ],
    guideCol,
    gauge,
    0.47,
  );
}
line(
  [
    [-1.93, 0.1, -0.91],
    [-1.93, 3.16, -0.91],
  ],
  guideCol,
  gauge,
  0.24,
);
// Deposit a refracted bundle of rays onto the actual collision surface.
const lightW=168,lightH=64;
const causticCanvas=document.createElement('canvas');
causticCanvas.width=lightW; causticCanvas.height=lightH;
const lightCtx=causticCanvas.getContext('2d'), lightImage=lightCtx.createImageData(lightW,lightH);
const flux=new Float32Array(lightW*lightH),causticTex=new THREE.CanvasTexture(causticCanvas);
causticTex.colorSpace=THREE.SRGBColorSpace;
const bedGeometry=new THREE.PlaneGeometry(FL,FW,72,16);
bedGeometry.rotateX(-Math.PI/2);
const bedPos=bedGeometry.attributes.position;
for(let i=0;i<bedPos.count;i++)bedPos.setY(i,bedHeight(bedPos.getX(i)+FL/2));
bedGeometry.computeVertexNormals();
const bedMaterial=mats('#ffffff',.52,.13);bedMaterial.map=causticTex;
const bed=mesh(bedGeometry,bedMaterial,0,0,0,tank);
bed.castShadow=false;
function caustics(w){
  flux.fill(0);
  if(w){const h=w.smooth;
    for(let z=0;z<lightH;z++)for(let x=0;x<lightW;x++){
      const gx=1+x*(60/lightW),gz=1+z*(22/lightH),ix=Math.floor(gx),iz=Math.floor(gz),j=ix+iz*63;
      const ax=gx-ix,az=gz-iz;
      const sample=(k)=>(h[k]*(1-ax)+h[k+1]*ax)*(1-az)+(h[k+63]*(1-ax)+h[k+64]*ax)*az;
      const depth=Math.max(.1,sample(j)-bedHeight(x/lightW*FL));
      const dx=(sample(j+1)-sample(j-1))*31/FL,dz=(sample(j+63)-sample(j-63))*12/FW;
      const px=clamp(x+dx*depth*.24*lightW/FL,0,lightW-1.01);
      const pz=clamp(z+dz*depth*.24*lightH/FW,0,lightH-1.01);
      const f=px%1,g=pz%1,k=(px|0)+(pz|0)*lightW;
      flux[k]+=(1-f)*(1-g);flux[k+1]+=f*(1-g);flux[k+lightW]+=(1-f)*g;flux[k+lightW+1]+=f*g;
    }
  }
  const d=lightImage.data;
  for(let i=0;i<flux.length;i++){
    const x=i%lightW,z=i/lightW|0;
    const light=clamp(.6*flux[i]+.1*((flux[i-1]||0)+(flux[i+1]||0)+(flux[i-lightW]||0)+(flux[i+lightW]||0)),0,3);
    const grid=(x%12===0||z%12===0)?7:0;
    d[4*i]=43+light*19+grid;d[4*i+1]=66+light*23+grid;d[4*i+2]=74+light*21+grid;d[4*i+3]=255;
  }
  lightCtx.putImageData(lightImage,0,0);causticTex.needsUpdate=true;
}
for (let y = 0.2; y < 3.1; y += 0.2) {
  let major = Math.round(y * 5) % 5 == 0;
  line(
    [
      [FL / 2 - 0.05, y, FW / 2 + 0.02],
      [FL / 2 - (major ? 0.37 : 0.18), y, FW / 2 + 0.02],
    ],
    0xc2eeef,
    tank,
    major ? 0.85 : 0.5,
  );
}
let pistonRods = [];
let motor = box(-4.45, 1.72, 0, 0.44, 0.59, 0.82, darkMat, tank);
for (let z of [-0.29, 0.29]) {
  let shaft = mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.96, 16), chrome, -4.1, 1.72, z, tank);
  shaft.rotation.z = Math.PI / 2;
  pistonRods.push(shaft);
}
let bubbleGeo = new THREE.SphereGeometry(1, 9, 6),
  airMat = new THREE.MeshPhysicalMaterial({
    color: '#e1dbfc',
    metalness: 0.38,
    roughness: 0.09,
    envMapIntensity: 2.1,
  });
function embedBubbles(g) {
  let rnd = (() => {
    let i = 920 + g.kind;
    return () => (i = (Math.imul(i, 1664525) + 1013904223) >>> 0) / 4294967296;
  })();
  g.seeds = [];
  g.air = new THREE.InstancedMesh(bubbleGeo, airMat, g.kind == 0 ? 125 : 58);
  for (let i = 0; i < g.air.count; i++) {
    let t = 0.06 + 0.87 * rnd(),
      k = 0.28 + 0.66 * Math.sqrt(rnd()),
      a = rnd() * TAU,
      base = g.point(k, a, t),
      ix = g.id(Math.round(t * g.L), Math.round(k * g.R), Math.round((a * g.N) / TAU)) * 3;
    g.seeds.push({ base, ix, r: (0.006 + 0.022 * rnd() ** 2) * g.r });
  }
  world.add(g.air);
  updateBubbles(g);
}
function updateBubbles(g) {
  g.air.visible = true;
  let t = 1 + (g.compression || 0),
    s = 1 / Math.sqrt(t);
  for (let i = 0; i < g.seeds.length; i++) {
    let { base, ix, r } = g.seeds[i];
    let x = base[0] + g.p[ix] - g.rest[ix],
      y = base[1] + g.p[ix + 1] - g.rest[ix + 1],
      z = base[2] + g.p[ix + 2] - g.rest[ix + 2];
    dummy.position.set(g.x + (x - g.x) * s + ((g.shear || 0) * y) / g.h, y * t, g.z + (z - g.z) * s);
    if(g.broken){
      const {nodes,weights}=g.seeds[i].binding;
      for(let axis=0;axis<3;axis++){
        let position=0;
        for(let k=0;k<4;k++)position+=weights[k]*g.p[nodes[k]*3+axis];
        dummy.position.setComponent(axis,position);
      }
    }
    dummy.scale.set(r, r * 1.13, r);
    dummy.updateMatrix();
    g.air.setMatrixAt(i, dummy.matrix);
  }
  g.air.instanceMatrix.needsUpdate = true;
}
function castGelLight(g) {
  let can = document.createElement('canvas');
  can.width = 256;
  can.height = 256;
  let c = can.getContext('2d'),
    colors = ['159,70,251', '32,202,170', '255,157,48'],
    rgb = colors[g.kind];
  for (let j = 0; j < 26; j++) {
    let a = (TAU * j) / 26,
      x = 128 + Math.cos(a) * (75 + 8 * Math.sin(a * 6)),
      y = 128 + Math.sin(a) * 67;
    let grad = c.createRadialGradient(x, y, 2, x, y, 46);
    grad.addColorStop(0, 'rgba(' + rgb + ',.32)');
    grad.addColorStop(0.27, 'rgba(' + rgb + ',.14)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = grad;
    c.fillRect(x - 47, y - 47, 94, 94);
  }
  let o = mesh(
    new THREE.PlaneGeometry(g.r * 3.5, g.r * 2.93),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(can),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.58,
    }),
    g.x,
    0.03,
    g.z,
    world,
  );
  o.rotation.x = -Math.PI / 2;
  o.castShadow = false;
  g.caustic = o;
}

const localProbe=new THREE.WebGLCubeRenderTarget(96,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter});
const reflectionCamera=new THREE.CubeCamera(.12,35,localProbe);
const impactMetal=chrome.clone();
impactMetal.onBeforeCompile=shader=>{
  shader.uniforms.specimens={value:localProbe.texture};
  shader.vertexShader='varying vec3 probePoint;\n'+shader.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\nprobePoint=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader='varying vec3 probePoint;uniform samplerCube specimens;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',
    `vec3 reflected=reflect(normalize(probePoint-cameraPosition),inverseTransformDirection(normal,viewMatrix));
     vec3 localLight=textureCube(specimens,reflected).rgb;
     outgoingLight=mix(outgoingLight,localLight,.61*(1.-smoothstep(-.24,.13,reflected.y)));
     #include <opaque_fragment>`);
};
const reflectionGels=gelsMat.map(m=>new THREE.MeshStandardMaterial({color:m.color,roughness:.26,metalness:.12}));
function captureGelReflection(){
  const ball=balls[balls.length-1],saved=gels.map(g=>g.mesh.material);
  const shadows=renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate=false;
  for(const b of balls)b.o.visible=false;
  for(const g of gels)g.mesh.material=reflectionGels[g.kind];
  reflectionCamera.position.set(ball.x,Math.max(.17,ball.y),ball.z);
  reflectionCamera.update(renderer,world);
  gels.forEach((g,i)=>g.mesh.material=saved[i]);
  for(const b of balls)b.o.visible=true;
  renderer.shadowMap.autoUpdate=shadows;
}

// Close the submerged ramp down to the base, including the glass contact edge.
for(const z of [-FW/2,FW/2]){
  const vertices=[],ix=[];
  for(let i=0;i<=72;i++){
    const x=i*FL/72;
    vertices.push(x-FL/2,.015,z,x-FL/2,bedHeight(x),z);
    if(i){const a=i*2-2;ix.push(a,a+1,a+2,a+2,a+1,a+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setIndex(ix);geo.computeVertexNormals();
  const m=mats('#454f58',.46,.32);m.side=THREE.DoubleSide;
  mesh(geo,m,0,0,0,tank);
  box(0,.056,z,FL+.08,.075,.065,sideMat,tank);
}
for(const x of [-FL/2,FL/2]){
  box(x,.05,0,.07,.09,FW+.10,sideMat,tank);
  for(const z of [-FW/2,FW/2]){
    box(x,.16,z,.14,.24,.13,sideMat,tank);
    mesh(new THREE.CylinderGeometry(.035,.035,.02,12),chrome,x,.292,z,tank);
  }
}
for(let k=1;k<=3;k++){
  const c=document.createElement('canvas');c.width=144;c.height=48;
  const ctx=c.getContext('2d');ctx.fillStyle='#e1eeee';ctx.font='30px monospace';ctx.fillText(k+'.0',3,34);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
  const o=mesh(new THREE.PlaneGeometry(.39,.13),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:.82,depthWrite:false}),FL/2-.52,k,FW/2+.035,tank);
  o.castShadow=false;
}
