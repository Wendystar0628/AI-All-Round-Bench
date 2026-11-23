/* ============================================================
   base.js — 正方形底座、L形码头、岸壁剖面、水体、水下、消波块、远防波堤
   ============================================================ */
(function () {
'use strict';
const { scene, onUpdate, R, RR, RI, pick, MAT, toon, box, cyl, sph, toonMesh, outline,
  clamp, lerp, smoothstep, makeNoise2D, mulberry32, texFromCanvas, makeCanvas } = H;

/* ---------- 布局常量 ---------- */
const L = H.LAYOUT = {
  half: 30,
  deckY: 0,
  waterY: -0.45,
  floorY: -9,
  bedY: -7,
  // 南堤岸（前景宽阔堤岸）
  south: { x0: -30, x1: 30, z0: 4, z1: 30 },
  // 西堤岸（转角内侧臂）
  west: { x0: -30, x1: -12, z0: -30, z1: 4 },
  // 港池
  water: { x0: -12, x1: 30, z0: -30, z1: 4 },
  // 近端短防波堤（带灯塔）
  bw1: { x0: -12, x1: 4.5, z: -30 },
  // 开口 4.5 ~ 6.5
  // 远处长防波堤
  bw2: { x0: 6.5, x1: 30, z: -29.2 },
};

/* ---------- 水面波高函数（全局共享） ---------- */
H.waveHeight = function (x, z, t) {
  const g = H.gust || 0;
  return 0.10 * Math.sin(x * 0.31 + t * 1.15)
       + 0.07 * Math.sin(z * 0.27 - t * 0.9 + 1.7)
       + 0.045 * Math.sin((x + z) * 0.19 + t * 1.6)
       + g * 0.05 * Math.sin(x * 0.8 - t * 3.0);
};

/* ---------- 底座实体 ---------- */
const g = new THREE.Group();
g.name = 'base';
scene.add(g);

/* 外侧深色包边底板（保证底座侧壁清晰） */
const trimMat = toon(0x54616a);
const trim = new THREE.Mesh(new THREE.BoxGeometry(60.6, 0.5, 60.6), trimMat);
trim.position.y = -9.2;
trim.receiveShadow = true;
g.add(trim);

/* 混凝土陆地两块（L 形），带外轮廓 */
function outlinedLand(w, h, d, pos) {
  const grp = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, MAT.concrete);
  m.castShadow = true; m.receiveShadow = true;
  grp.add(m);
  const ol = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x414e54, side: THREE.BackSide }));
  ol.scale.setScalar(1.008);
  grp.add(ol);
  grp.position.copy(pos);
  g.add(grp);
  return grp;
}
outlinedLand(60, 9, 26, new THREE.Vector3(0, -4.5, 17));
outlinedLand(18, 9, 34, new THREE.Vector3(-21, -4.5, -13));

/* 南/西外侧面砌块纹理包覆（展示实体剖面感） */
const outerWallMat = toon(0xffffff, { map: texFromCanvas(H.quayWallCanvas(), 6, 1.6) });
function outerWall(w, h, pos, rotY) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), outerWallMat);
  m.position.copy(pos); m.rotation.y = rotY;
  m.receiveShadow = true;
  g.add(m);
}
outerWall(60, 9, new THREE.Vector3(0, -4.5, 30.06), 0);
outerWall(34, 9, new THREE.Vector3(-30.06, -4.5, -13), Math.PI / 2);

/* ---------- 海床 ---------- */
const [sandC, sandG] = makeCanvas(256, 256);
{
  const n = makeNoise22(8);
  const img = sandG.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    const v = H.fbm(x * 0.08, y * 0.08, n, 4);
    img.data[i] = 96 + v * 30; img.data[i + 1] = 112 + v * 28; img.data[i + 2] = 96 + v * 24; img.data[i + 3] = 255;
  }
  sandG.putImageData(img, 0, 0);
}
function makeNoise22(s) { return makeNoise2D(s); }
const sandMat = toon(0xffffff, { map: texFromCanvas(sandC, 6, 5) });
const bed = new THREE.Mesh(new THREE.BoxGeometry(42.4, 2, 34.4), sandMat);
bed.position.set(9, -8, -13);
bed.receiveShadow = true;
g.add(bed);

/* 碎石海床 */
const pebbleGeo = new THREE.DodecahedronGeometry(1, 0);
const pebbleMats = [toon(0x7d857c), toon(0x66706e), toon(0x8a8478)];
const pebbleGroup = new THREE.Group();
{
  const r = mulberry32(202);
  for (let i = 0; i < 90; i++) {
    const m = new THREE.Mesh(pebbleGeo, pebbleMats[i % 3]);
    const s = 0.12 + r() * 0.4;
    m.scale.set(s * (0.8 + r() * 0.6), s * 0.6, s * (0.8 + r() * 0.6));
    m.position.set(-11 + r() * 40, -6.9 + r() * 0.2, -29 + r() * 32);
    m.rotation.set(r() * 3, r() * 3, r() * 3);
    m.receiveShadow = true;
    pebbleGroup.add(m);
  }
}
g.add(pebbleGroup);

/* 沉底旧轮胎 */
const tireMat = toon(0x22282b);
for (const p of [[3.5, -6.4, 2.2, 0.5], [19, -6.5, -21, 1.3], [-6, -6.6, -12, 2.4]]) {
  const t = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.22, 8, 18), tireMat);
  t.position.set(p[0], p[1], p[2]);
  t.rotation.set(Math.PI / 2 + 0.3 * Math.sin(p[3]), p[3], 0.2 * p[3]);
  t.castShadow = true;
  g.add(t);
}
/* 锚链 */
const chainMat = MAT.rust;
{
  const pts = [];
  for (let i = 0; i < 14; i++) pts.push(new THREE.Vector3(-9 + i * 0.55, -6.6 + Math.sin(i * 0.9) * 0.1, -2 + Math.cos(i * 0.7) * 0.7));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 10), chainMat);
    link.position.copy(a).lerp(b, 0.5);
    link.lookAt(b);
    link.rotation.z += i % 2 ? Math.PI / 2 : 0;
    g.add(link);
  }
}

/* ---------- 海草（水下 + 岸壁水线） ---------- */
const seaweeds = [];
function seaweedBlade(h, col) {
  const geo = new THREE.PlaneGeometry(0.28, h, 1, 5);
  geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.92,
  }));
  return m;
}
{
  const r = mulberry32(71);
  for (let i = 0; i < 26; i++) {
    const grp = new THREE.Group();
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const b = seaweedBlade(0.8 + r() * 1.6, pick([0x3d6b4f, 0x4a7a55, 0x35604a]));
      b.position.set((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
      b.rotation.y = r() * 3;
      grp.add(b);
    }
    grp.position.set(-10 + r() * 38, -6.9, -28 + r() * 30);
    grp.userData.phase = r() * 7;
    g.add(grp); seaweeds.push(grp);
  }
}
/* 岸壁水线海藻（贴墙垂摆） */
const wallWeeds = [];
function wallWeedRow(edge /*'south'|'west'*/) {
  const r = mulberry32(edge === 'south' ? 81 : 82);
  const n = edge === 'south' ? 26 : 20;
  for (let i = 0; i < n; i++) {
    const h = 0.5 + r() * 0.9;
    const geo = new THREE.PlaneGeometry(0.22, h, 1, 4);
    geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x35594a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    if (edge === 'south') {
      m.position.set(-11 + (i / n) * 40 + r(), -0.9 - r() * 1.2, 4.02);
    } else {
      m.position.set(-12.02, -0.9 - r() * 1.2, -29 + (i / n) * 32 + r());
      m.rotation.y = Math.PI / 2;
    }
    m.userData = { ph: r() * 6, edge };
    g.add(m); wallWeeds.push(m);
  }
}
wallWeedRow('south'); wallWeedRow('west');

/* ---------- 岸壁（港池内侧，砌块+潮痕） ---------- */
const wallMat = MAT.quayWall;
const wallSouth = new THREE.Mesh(new THREE.BoxGeometry(42, 7.2, 0.5), wallMat);
wallSouth.position.set(9, -3.6, 4.15);
wallSouth.receiveShadow = true; wallSouth.castShadow = true;
g.add(wallSouth);
const wallWest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.2, 34), wallMat);
wallWest.position.set(-12.15, -3.6, -13);
wallWest.receiveShadow = true; wallWest.castShadow = true;
g.add(wallWest);

/* 藤壶/牡蛎壳点 */
{
  const r = mulberry32(512);
  const barGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xc9c4b4 });
  const dummy = new THREE.Object3D();
  const inst = new THREE.InstancedMesh(barGeo, barMat, 220);
  let id = 0;
  for (let i = 0; i < 110; i++) {
    dummy.position.set(-11 + r() * 40, -1.1 - r() * 2.6, 4.32);
    dummy.scale.setScalar(0.5 + r() * 1.1);
    dummy.updateMatrix(); inst.setMatrixAt(id++, dummy.matrix);
  }
  for (let i = 0; i < 110; i++) {
    dummy.position.set(-12.32, -1.1 - r() * 2.6, -29 + r() * 32);
    dummy.scale.setScalar(0.5 + r() * 1.1);
    dummy.updateMatrix(); inst.setMatrixAt(id++, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  g.add(inst);
}

/* 系船环（岸壁上） */
const ringMat = MAT.rust;
for (const x of [-6, 2, 10, 20, 27]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 14), ringMat);
  ring.position.set(x, -0.9, 4.36);
  g.add(ring);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.18, 8), ringMat);
  bolt.rotation.x = Math.PI / 2; bolt.position.set(x, -0.9, 4.3);
  g.add(bolt);
}
for (const z of [-24, -16, -8, 0]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 14), ringMat);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(-12.36, -0.9, z);
  g.add(ring);
}

/* 锈蚀铁梯（南壁一处，从堤岸伸入水中） */
(function ironLadder() {
  const ladder = new THREE.Group();
  const railGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8);
  for (const dx of [-0.22, 0.22]) {
    const rl = new THREE.Mesh(railGeo, ringMat);
    rl.position.set(dx, -1.5, 0);
    ladder.add(rl);
  }
  for (let i = 0; i < 7; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 8), ringMat);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, -0.1 - i * 0.46, 0);
    ladder.add(rung);
  }
  ladder.position.set(15, 0, 4.4);
  g.add(ladder);
})();

/* ---------- 护轮坎 + 黄黑警示条 ---------- */
const curbMat = MAT.concreteDark;
const curbS = box(42, 0.35, 0.5, curbMat, 0x39434a);
curbS.position.set(9, 0.18, 4.05);
g.add(curbS);
const curbW = box(0.5, 0.35, 34, curbMat, 0x39434a);
curbW.position.set(-12.05, 0.18, -13);
g.add(curbW);
const hazardMat = toon(0xffffff, { map: texFromCanvas(H.hazardCanvas(), 9, 1) });
function hazardStrip(w, d, pos) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), hazardMat);
  m.position.copy(pos); m.receiveShadow = true;
  g.add(m);
}
hazardStrip(41.6, 0.34, new THREE.Vector3(9, 0.38, 4.05));
const hz2m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 33.6),
  toon(0xffffff, { map: texFromCanvas(H.hazardCanvas(), 7, 1) }));
hz2m.position.set(-12.05, 0.38, -13);
g.add(hz2m);

/* ---------- 台阶 + 上下船平台 ---------- */
(function stepsAndLanding() {
  // 矮台阶从堤岸伸向水边（南壁 x≈ -2）
  for (let i = 0; i < 4; i++) {
    const st = box(3.4, 0.22, 0.7, MAT.concrete, 0x5a666a);
    st.position.set(-2, 0.11 - i * 0.16, 4.9 - i * 0.62);
    g.add(st);
  }
  // 略低的上下船平台（西壁一处）
  const plat = box(3.2, 0.5, 4.2, MAT.concreteDark, 0x5a666a);
  plat.position.set(-13.9, -0.18, -6);
  g.add(plat);
  const platTop = box(3.3, 0.08, 4.3, MAT.concrete, 0x5a666a);
  platTop.position.set(-13.9, 0.1, -6);
  g.add(platTop);
})();

/* ---------- 水洼（湿地高光 + 倒映色块） ---------- */
const puddles = [];
function puddleTexture(seed) {
  const [c, cx] = makeCanvas(128, 128);
  const r = mulberry32(seed);
  cx.clearRect(0, 0, 128, 128);
  cx.fillStyle = 'rgba(70,110,120,0.55)';
  cx.beginPath();
  const pts = 14;
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = 42 + Math.sin(a * 3 + seed) * 10 + (r() - 0.5) * 12;
    const x = 64 + Math.cos(a) * rr, y = 64 + Math.sin(a) * rr * 0.7;
    i ? cx.lineTo(x, y) : cx.moveTo(x, y);
  }
  cx.closePath(); cx.fill();
  // 天光高光
  const grd = cx.createLinearGradient(20, 20, 100, 100);
  grd.addColorStop(0, 'rgba(220,240,245,0.5)');
  grd.addColorStop(1, 'rgba(180,215,225,0.05)');
  cx.fillStyle = grd; cx.fill();
  return new THREE.CanvasTexture(c);
}
function addPuddle(x, z, rx, rz, seed) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 26),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(rx, rz, 1);
  m.position.set(x, 0.035, z);
  m.renderOrder = 3;
  g.add(m);
  puddles.push({ m, cv, cx, tex, x, z, rx, rz, seed });
}
H.addPuddle = addPuddle;
H.puddles = puddles;
addPuddle(4, 8.5, 2.6, 1.3, 1);
addPuddle(-18, -2, 2.0, 1.1, 2);
addPuddle(18, 11, 1.8, 1.0, 3);
addPuddle(-24, 18, 2.4, 1.4, 4);
addPuddle(10, 22, 1.5, 0.9, 5);

/* ---------- 半透明水体体积（剖面） ---------- */
const waterVolMat = new THREE.MeshPhysicalMaterial({
  color: 0x3fa8a0, roughness: 0.25, metalness: 0,
  transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
});
const waterVol = new THREE.Mesh(new THREE.BoxGeometry(42, 6.55, 34), waterVolMat);
waterVol.position.set(9, -3.72, -13);
waterVol.renderOrder = 1;
g.add(waterVol);

/* 东侧、北侧水体外壁加强剖面色调 */
const secMat = new THREE.MeshBasicMaterial({ color: 0x2f9c98, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
const secE = new THREE.Mesh(new THREE.PlaneGeometry(34, 6.55), secMat);
secE.position.set(30.04, -3.72, -13); secE.rotation.y = -Math.PI / 2; secE.renderOrder = 2;
g.add(secE);
const secN = new THREE.Mesh(new THREE.PlaneGeometry(23.5, 6.55), secMat);
secN.position.set(18.25, -3.72, -30.04); secN.rotation.y = Math.PI; secN.renderOrder = 2;
g.add(secN);

/* ---------- 水面（自定义 shader：波、色块倒影、粼光） ---------- */
const reflCanvas = document.createElement('canvas');
reflCanvas.width = 512; reflCanvas.height = 412;
const reflG = reflCanvas.getContext('2d');
const reflTex = new THREE.CanvasTexture(reflCanvas);
reflTex.wrapS = reflTex.wrapT = THREE.ClampToEdgeWrapping;
reflTex.colorSpace = THREE.SRGBColorSpace;

H.reflectors = [];
H.addReflector = function (getPos, rx, rz, color, weight) {
  H.reflectors.push({ getPos, rx, rz, color: new THREE.Color(color), w: weight || 1 });
};

const waterUniforms = {
  uTime: { value: 0 },
  uSun: { value: new THREE.Vector3(0.55, 0.62, 0.32).normalize() },
  uRefl: { value: reflTex },
  uCover: { value: 0 },
  uShallow: { value: new THREE.Color(0x8fd2c4) },
  uDeep: { value: new THREE.Color(0x1d6a72) },
  uGlint: { value: 1 },
};
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: waterUniforms,
  vertexShader: `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWPos;
    varying float vWave;
    float wh(vec2 p){
      return 0.10*sin(p.x*0.31+uTime*1.15)
           + 0.07*sin(p.y*0.27-uTime*0.9+1.7)
           + 0.045*sin((p.x+p.y)*0.19+uTime*1.6);
    }
    void main(){
      vUv = uv;
      vec3 p = position;
      float e = 0.15;
      float h = wh(p.xy);
      float hx = wh(p.xy+vec2(e,0.0));
      float hz = wh(p.xy+vec2(0.0,e));
      p.z += h;
      vWave = h;
      vec4 wp = modelMatrix*vec4(p,1.0);
      vWPos = wp.xyz;
      vec3 n = normalize(vec3(-(hx-h)/e, 1.0, -(hz-h)/e));
      vWPos.y += n.y*0.0;
      gl_Position = projectionMatrix*viewMatrix*wp;
    }`,
  fragmentShader: `
    precision highp float;
    uniform float uTime, uCover, uGlint;
    uniform vec3 uSun, uShallow, uDeep;
    uniform sampler2D uRefl;
    varying vec2 vUv;
    varying vec3 vWPos;
    varying float vWave;
    void main(){
      // 法线重建
      float e = 0.25;
      float hx = 0.10*sin((vWPos.x+e)*0.31+uTime*1.15)+0.045*sin((vWPos.x+e+vWPos.z)*0.19+uTime*1.6);
      float hz = 0.07*sin((vWPos.z+e)*0.27-uTime*0.9+1.7)+0.045*sin((vWPos.x+vWPos.z+e)*0.19+uTime*1.6);
      vec3 n = normalize(vec3(-(hx-vWave)*0.6, 1.0, -(hz-vWave)*0.6));
      vec3 vdir = normalize(cameraPosition - vWPos);
      float fres = pow(1.0 - clamp(dot(n, vdir), 0.0, 1.0), 2.2);
      vec3 col = mix(uDeep, uShallow, 0.5 + vWave*1.6);
      col = mix(col, vec3(0.74,0.88,0.86), fres*0.55);
      // 色块化倒影（带波动扭曲）
      vec2 ruv = vUv;
      ruv.x += sin(ruv.y*22.0+uTime*1.4)*0.006 + sin(ruv.y*51.0-uTime*2.2)*0.003;
      ruv.y += sin(ruv.x*18.0+uTime*1.1)*0.006;
      vec4 rc = texture2D(uRefl, ruv);
      // 波谷处倒影被切碎
      float bands = smoothstep(0.62, 0.7, sin(vWPos.x*1.7+uTime*1.2)*0.5+0.5);
      col = mix(col, rc.rgb, rc.a * (0.55+0.45*bands));
      // 暖金粼光
      vec3 h2 = normalize(uSun + vdir);
      float spec = pow(max(dot(n, h2), 0.0), 60.0);
      float glint = step(0.72, fract(sin(dot(floor(vWPos.xz*3.0), vec2(12.9898,78.233)))*43758.5453)*0.5+0.5
                    + sin(uTime*2.0+vWPos.x*0.9)*0.5);
      col += vec3(1.0,0.9,0.62) * (spec*1.2*(1.0-uCover) + glint*0.10*(1.0-uCover));
      float alpha = 0.72 + fres*0.22;
      gl_FragColor = vec4(col, alpha);
    }`,
});
const waterGeo = new THREE.PlaneGeometry(42, 34, 90, 70);
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(9, L.waterY, -13);
water.renderOrder = 4;
g.add(water);
H.water = water;

/* 倒影画布绘制 */
function drawReflections(t) {
  const W = reflCanvas.width, HH = reflCanvas.height;
  reflG.clearRect(0, 0, W, HH);
  const WX0 = L.water.x0, WZ0 = L.water.z0, WW = 42, WD = 34;
  for (const r of H.reflectors) {
    const p = r.getPos();
    if (p.x < WX0 - 2 || p.x > WX0 + WW + 2 || p.z < WZ0 - 2 || p.z > WZ0 + 2) continue;
    const u = (p.x - WX0) / WW * W;
    const v = (p.z - WZ0) / WD * HH;
    // 碎块化：数个错位椭圆
    const chunks = 5;
    for (let i = 0; i < chunks; i++) {
      const fi = i / chunks;
      const wob = Math.sin(t * 1.4 + i * 2.1 + p.x) * 10;
      const a = r.rx * (0.5 + 0.5 * Math.abs(Math.sin(t * 0.9 + i))) * 2.4;
      const b = r.rz * (0.4 + fi * 0.5) * 2.2;
      const off = (fi - 0.5) * r.rz * 3.2 + wob * 0.15;
      let shade = r.color.clone();
      const tone = [0.45, 0.7, 1.0, 0.6, 0.85][i];
      shade.multiplyScalar(tone);
      reflG.fillStyle = `rgba(${(shade.r * 255) | 0},${(shade.g * 255) | 0},${(shade.b * 255) | 0},${0.28 * r.w})`;
      reflG.beginPath();
      reflG.ellipse(u + wob * 0.4, v + off, a * 0.26, b * 0.5, 0, 0, 7);
      reflG.fill();
    }
  }
  reflTex.needsUpdate = true;
}

/* 水洼倒影：船/灯柱的色块 + 掠过海鸥的小影 */
function drawPuddleReflections(t) {
  for (const p of puddles) {
    const cx = p.cx;
    cx.clearRect(0, 0, 128, 128);
    // 水洼本体（不规则青灰）
    const rnd2 = mulberry32(p.seed * 99 + 7);
    cx.fillStyle = 'rgba(58,96,106,0.5)';
    cx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = 44 + Math.sin(a * 3 + p.seed) * 9 + (rnd2() - 0.5) * 10;
      const x = 64 + Math.cos(a) * rr, y = 64 + Math.sin(a) * rr * 0.66;
      i ? cx.lineTo(x, y) : cx.moveTo(x, y);
    }
    cx.closePath(); cx.fill();
    // 天光高光
    const grd = cx.createLinearGradient(24, 30, 104, 96);
    grd.addColorStop(0, 'rgba(220,240,245,0.55)');
    grd.addColorStop(1, 'rgba(180,215,225,0.05)');
    cx.fillStyle = grd; cx.fill();
    // 倒影：收集水洼附近的船、灯柱、海鸥
    const items = [];
    if (H.boats) for (const b of H.boats) {
      const bp = b.position;
      const d = Math.hypot(bp.x - p.x, bp.z - p.z);
      if (d < 14) items.push({ wx: bp.x, wz: bp.z, h: 1.2, col: 'rgba(232,238,238,', pr: 0.5 });
    }
    if (H.lamps) for (const L of H.lamps) {
      const d = Math.hypot(L.x - p.x, L.z - p.z);
      if (d < 12) items.push({ wx: L.x + 0.85, wz: L.z, h: 4.6, col: 'rgba(255,240,190,', pr: 0.85, lamp: true });
    }
    if (H.gulls) for (const gu of H.gulls) {
      const gp = gu.b.position;
      const d = Math.hypot(gp.x - p.x, gp.z - p.z);
      if (d < 9 && gp.y > 3 && gp.y < 24)
        items.push({ wx: gp.x, wz: gp.z, h: 0.4, col: 'rgba(60,70,72,', pr: 0.4, bird: true });
    }
    for (const it of items) {
      // 世界->水洼局部：以水洼中心为 64,64，z 向下
      const dx = it.wx - p.x, dz = it.wz - p.z;
      const u = 64 + dx / p.rx * 52;
      const v = 64 + dz / p.rz * 40;
      if (u < 4 || u > 124 || v < 4 || v > 124) continue;
      const wob = Math.sin(t * 2 + it.wx) * 2;
      if (it.bird) {
        cx.fillStyle = it.col + '0.5)';
        cx.beginPath();
        cx.ellipse(u + wob, v + Math.sin(t * 3) * 2, 5, 2, 0, 0, 7); cx.fill();
      } else if (it.lamp) {
        cx.fillStyle = it.col + '0.5)';
        cx.fillRect(u - 1.5 + wob, v - 26, 3, 26);
        cx.fillStyle = 'rgba(255,244,200,0.7)';
        cx.beginPath(); cx.arc(u + wob, v - 27, 2.6, 0, 7); cx.fill();
      } else {
        for (let k = 0; k < 4; k++) {
          const kk = (k / 3);
          cx.fillStyle = it.col + (0.12 + 0.16 * Math.abs(Math.sin(t + k)) * it.pr) + ')';
          cx.beginPath();
          cx.ellipse(u + wob * (k + 1) * 0.5, v - 2 + kk * 16,
            7 - kk * 2, 2.4, 0, 0, 7);
          cx.fill();
        }
      }
    }
    p.tex.needsUpdate = true;
  }
}
H.drawPuddleReflections = drawPuddleReflections;

/* ---------- 消波块（テトラポッド） ---------- */
function tetrapod(s, mat) {
  const grp = new THREE.Group();
  const legGeo = new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.25 * s, 10);
  const dirs = [
    new THREE.Vector3(1, 1, 1), new THREE.Vector3(-1, -1, 1),
    new THREE.Vector3(-1, 1, -1), new THREE.Vector3(1, -1, -1),
  ];
  for (const d of dirs) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.copy(d).multiplyScalar(0.32 * s);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    leg.castShadow = true; leg.receiveShadow = true;
    grp.add(leg);
  }
  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 * s, 0), mat);
  core.castShadow = true;
  grp.add(core);
  const ol = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.62 * s, 1)),
    new THREE.LineBasicMaterial({ color: 0x3a464c }));
  grp.add(ol);
  return grp;
}
H.tetrapod = tetrapod;
const tetraMat = toon(0xb9c0c0);
H.foamSpots = [];
function tetraCluster(cx, z, n, onLand, seed) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const t = tetrapod(1.5 + r() * 0.8, tetraMat);
    const dx = (r() - 0.5) * 7, dz = (r() - 0.5) * 4;
    t.position.set(cx + dx, onLand ? 0.5 : -0.9 + r() * 0.4, z + dz);
    t.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(t);
    if (!onLand && i < 5) H.foamSpots.push(new THREE.Vector3(cx + dx, L.waterY + 0.05, z + dz));
  }
}
/* 东南角、开口两侧、内转角 */
tetraCluster(28.4, 5.2, 6, false, 11);
tetraCluster(3.2, -29.6, 5, false, 12);
tetraCluster(7.8, -29.5, 4, false, 13);
tetraCluster(-11, 3.2, 4, true, 14);
tetraCluster(18, -29.6, 3, false, 15);

/* ---------- 防波堤 ---------- */
/* 近端短堤：块石堤身 + 堤顶步道 */
(function nearBreakwater() {
  const rubble = toon(0x9aa2a2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(16.5, 6.4, 2.4), rubble);
  body.position.set(-3.75, -3.4, -30);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  const top = box(16.8, 0.5, 2.8, MAT.concrete, 0x4a5458);
  top.position.set(-3.75, 0.05, -30);
  g.add(top);
  // 堤头圆台
  const head = cyl(1.5, 1.8, 0.7, 14, MAT.concrete, 0x4a5458);
  head.position.set(4.5, 0.1, -30);
  g.add(head);
})();

/* 远处长防波堤：低矮、灰蓝、雾化 */
(function farBreakwater() {
  const m = toon(0x8ea6ad);
  const body = new THREE.Mesh(new THREE.BoxGeometry(23.5, 1.4, 1.8), m);
  body.position.set(18.25, -1.0, L.bw2.z);
  g.add(body);
  const r = mulberry32(333);
  for (let i = 0; i < 18; i++) {
    const t = tetrapod(0.9, m);
    t.position.set(7 + r() * 22, -0.5 + r() * 0.3, L.bw2.z + (r() - 0.5) * 1.6);
    t.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(t);
  }
})();

/* ---------- 更新 ---------- */
let frame = 0;
onUpdate((t, dt) => {
  waterUniforms.uTime.value = t;
  waterUniforms.uCover.value = H.sunCover();
  // 顶点波
  const pos = waterGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 9, y = pos.getY(i) - 13;
    pos.setZ(i, H.waveHeight(x, -y, t));
  }
  pos.needsUpdate = true;
  waterGeo.computeVertexNormals();
  if ((frame++ % 3) === 0) {
    drawReflections(t);
    drawPuddleReflections(t);
  }
  // 海草摆动
  for (const sw of seaweeds) {
    sw.rotation.z = Math.sin(t * 1.1 + sw.userData.phase) * 0.12;
    sw.rotation.x = Math.cos(t * 0.8 + sw.userData.phase) * 0.06;
  }
  for (const w of wallWeeds) {
    const s = Math.sin(t * 1.4 + w.userData.ph);
    w.rotation.x = w.userData.edge === 'south' ? 0 : Math.PI / 2;
    w.scale.set(1 + s * 0.12, 1, 1);
    w.rotation.z = s * 0.18;
  }
});

})();
