/* ============================================================
   environ.js — 天空、薄云、太阳雨、彩虹、光柱、远海雾气
   ============================================================ */
(function () {
'use strict';
const { scene, onUpdate, R, RR, RI, MAT, toon, clamp, smoothstep, makeNoise2D, fbm, mulberry32 } = H;

/* ---------- 天空：浅青白渐变穹顶 ---------- */
const skyGeo = new THREE.SphereGeometry(420, 32, 20);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: {
    top: { value: new THREE.Color(0xbfe0ea) },
    mid: { value: new THREE.Color(0xdff0f2) },
    bot: { value: new THREE.Color(0xf2f4ec) },
    sunDir: { value: new THREE.Vector3(0.5, 0.7, 0.35).normalize() },
    cloudCover: { value: 0 },
  },
  vertexShader: `
    varying vec3 vDir;
    void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader: `
    varying vec3 vDir;
    uniform vec3 top, mid, bot, sunDir;
    uniform float cloudCover;
    void main(){
      float h = clamp(vDir.y*0.5+0.5, 0.0, 1.0);
      vec3 col = mix(bot, mid, smoothstep(0.05,0.55,h));
      col = mix(col, top, smoothstep(0.5,0.95,h));
      float s = max(dot(vDir, sunDir), 0.0);
      col += vec3(1.0,0.93,0.72) * pow(s, 9.0) * 0.55;
      col += vec3(1.0,0.96,0.82) * pow(s, 60.0) * 0.6 * (1.0-cloudCover*0.7);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

/* ---------- 薄云（柔和贴花片，缓慢移过太阳） ---------- */
function cloudTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const n = mulberry32(seed);
  g.clearRect(0, 0, 256, 128);
  for (let k = 0; k < 16; k++) {
    const x = 40 + n() * 176, y = 40 + n() * 48, r = 22 + n() * 34;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
}
const clouds = [];
const sunDir = new THREE.Vector3(0.55, 0.62, 0.32).normalize();
{
  const r2 = mulberry32(902);
  for (let i = 0; i < 9; i++) {
    const mat = new THREE.SpriteMaterial({
      map: cloudTexture(300 + i), transparent: true, opacity: 0.55,
      depthWrite: false, fog: false,
    });
    const sp = new THREE.Sprite(mat);
    const scale = 70 + r2() * 70;
    sp.scale.set(scale * 1.8, scale, 1);
    // 云在高空平面上沿垂直于太阳方向漂移
    const ang = r2() * Math.PI * 2;
    sp.position.set(Math.cos(ang) * 200, 90 + r2() * 60, Math.sin(ang) * 200);
    sp.userData.speed = 1.6 + r2() * 1.4;
    sp.userData.phase = r2() * 100;
    scene.add(sp);
    clouds.push(sp);
  }
}

/* ---------- 云遮日：计算太阳被遮住程度 0~1 ---------- */
let sunCover = 0;
H.sunCover = () => sunCover;

/* ---------- 雨丝（斜落短线，暖金微光） ---------- */
const RAIN_N = 2600;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_N * 2 * 3);
const rainData = []; // x,y,z,len,spd
{
  const r = mulberry32(606);
  for (let i = 0; i < RAIN_N; i++) {
    rainData.push({
      x: (r() - 0.5) * 150, y: r() * 70 + 2, z: (r() - 0.5) * 150,
      len: 0.9 + r() * 1.4, spd: 26 + r() * 16,
    });
  }
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({
  color: 0xfff0c8, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
});
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);
H.rain = rain;

/* 雨势 0.35(细雨) ~ 1(稍密) */
function rainIntensity(t) {
  return 0.62
    + 0.26 * Math.sin(t * 0.072 + 1.2)
    + 0.12 * Math.sin(t * 0.19)
    - 0.18 * Math.exp(-Math.pow((t % 240 - 150) / 16, 2)); // 周期内一段转弱
}
H.rainIntensity = rainIntensity;

/* ---------- 彩虹（雨弱时极淡浮现） ---------- */
const rainbowMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  uniforms: { strength: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    varying vec2 vUv; uniform float strength;
    void main(){
      float r = distance(vUv, vec2(0.5,0.0));
      float band = 0.0;
      vec3 cols[7];
      cols[0]=vec3(1.0,0.45,0.45); cols[1]=vec3(1.0,0.72,0.42); cols[2]=vec3(1.0,0.95,0.5);
      cols[3]=vec3(0.55,0.9,0.55); cols[4]=vec3(0.5,0.8,0.95); cols[5]=vec3(0.55,0.6,1.0);
      cols[6]=vec3(0.78,0.55,0.95);
      vec3 col = vec3(0.0);
      for(int i=0;i<7;i++){
        float fi=float(i);
        col += cols[i] * exp(-pow((r-(0.66-fi*0.018))*60.0, 2.0));
      }
      float edge = smoothstep(0.0,0.1,r)*(1.0-smoothstep(0.5,0.68,r));
      gl_FragColor = vec4(col, edge*strength*0.32);
    }`,
});
const rainbow = new THREE.Mesh(new THREE.PlaneGeometry(95, 48), rainbowMat);
rainbow.position.set(28, 26, -62);
rainbow.visible = false;
scene.add(rainbow);
H.rainbow = rainbow;

/* ---------- 淡金色光柱（太阳方向体积光） ---------- */
function rayTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(255,240,190,0.9)');
  grd.addColorStop(0.5, 'rgba(255,236,180,0.35)');
  grd.addColorStop(1, 'rgba(255,236,180,0)');
  g.fillStyle = grd;
  // 中间宽两边窄
  g.beginPath();
  g.moveTo(20, 0); g.lineTo(44, 0); g.lineTo(62, 256); g.lineTo(2, 256); g.closePath();
  g.fill();
  return new THREE.CanvasTexture(c);
}
const rayTex = rayTexture();
const godRays = [];
function addGodRay(pos, target, w, len, baseOp) {
  const mat = new THREE.SpriteMaterial({
    map: rayTex, transparent: true, opacity: baseOp,
    blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffefc4,
  });
  const sp = new THREE.Sprite(mat);
  sp.position.copy(pos);
  sp.scale.set(w, len, 1);
  // sprite 朝向相机；光柱方向近似即可（相机总在南侧/外侧）
  sp.userData.baseOp = baseOp;
  scene.add(sp);
  godRays.push(sp);
  return sp;
}
H.addGodRay = addGodRay;
H.godRays = godRays;

/* ---------- 远海薄雾 ---------- */
function fogBandTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, 'rgba(220,238,240,0)');
  grd.addColorStop(0.5, 'rgba(220,238,240,0.8)');
  grd.addColorStop(1, 'rgba(220,238,240,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 64);
  return new THREE.CanvasTexture(c);
}
const fogBands = [];
{
  const r = mulberry32(441);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({
      map: fogBandTexture(), transparent: true, opacity: 0.5,
      depthWrite: false, fog: false, color: 0xe6f1f2,
    });
    const w = 90 + r() * 60;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 6 + r() * 5), m);
    pl.position.set(-10 + r() * 60, 1.6 + r() * 1.2, -44 - r() * 14);
    scene.add(pl);
    fogBands.push({ m: pl, sp: 0.4 + r() * 0.5, ph: r() * 10 });
  }
}

/* ---------- 更新 ---------- */
const windDir = new THREE.Vector3(1, 0, 0.18).normalize();
H.windDir = windDir;
H.gust = 0;

let rt = 0;
onUpdate((t, dt) => {
  /* 云移动 + 遮日 */
  let cover = 0;
  const sp2 = new THREE.Vector2(sunDir.x, sunDir.z).normalize();
  for (const c of clouds) {
    c.position.x += windDir.x * c.userData.speed * dt;
    c.position.z += windDir.z * c.userData.speed * dt;
    if (c.position.x > 260) c.position.x = -260;
    if (c.position.z > 260) c.position.z = -260;
    // 云到太阳方向投影点的距离
    const px = c.position.x, pz = c.position.z;
    const proj = px * sp2.x + pz * sp2.y;
    const perp = Math.abs(-px * sp2.y + pz * sp2.x);
    if (proj > 80 && proj < 240) {
      const k = Math.exp(-(perp * perp) / (60 * 60)) * clamp(1 - Math.abs(proj - 160) / 120, 0, 1);
      cover += k * 0.5;
    }
  }
  cover = clamp(cover, 0, 0.82);
  sunCover += (cover - sunCover) * Math.min(1, dt * 1.2);
  skyMat.uniforms.cloudCover.value = sunCover;
  const bright = 1 - sunCover * 0.45;
  H.sun.intensity = 2.15 * bright;
  H.hemi.intensity = 1.45 * (1 - sunCover * 0.18);
  H.sunDisc.material.opacity = 0.9 * (1 - sunCover * 0.85);

  /* 阵风 */
  const ge = H.gustEnvelope(t);
  H.gust += (ge - H.gust) * Math.min(1, dt * 2.2);

  /* 雨 */
  const ri = rainIntensity(t);
  H.curRain = ri;
  const density = clamp(0.25 + ri * 0.9, 0, 1);
  rainMat.opacity = 0.22 + ri * 0.34 * (1 - sunCover * 0.3);
  const gustSlant = H.gust * 0.5;
  let p = 0;
  for (let i = 0; i < RAIN_N; i++) {
    const d = rainData[i];
    if (i / RAIN_N > density) {
      // 隐藏：两点重合
      rainPos[p] = d.x; rainPos[p + 1] = -999; rainPos[p + 2] = d.z;
      rainPos[p + 3] = d.x; rainPos[p + 4] = -999; rainPos[p + 5] = d.z;
      p += 6; continue;
    }
    d.y -= d.spd * dt;
    const slant = 0.32 + gustSlant;
    const dx = slant * d.len, dz = 0.06 * d.len;
    if (d.y < 0) {
      // 以相机附近为中心重生
      const cc = H.camera.position;
      d.x = cc.x + (H.R() - 0.5) * 150;
      d.z = cc.z + (H.R() - 0.5) * 150;
      d.y = 55 + H.R() * 20;
    }
    rainPos[p] = d.x; rainPos[p + 1] = d.y; rainPos[p + 2] = d.z;
    rainPos[p + 3] = d.x + dx; rainPos[p + 4] = d.y - d.len * 2.2; rainPos[p + 5] = d.z + dz;
    p += 6;
  }
  rainGeo.attributes.position.needsUpdate = true;

  /* 彩虹：雨势弱 + 有阳光 */
  const weak = clamp((0.55 - ri) / 0.3, 0, 1);
  rainbow.visible = weak > 0.05;
  rainbow.material.uniforms.strength.value = weak * (1 - sunCover * 0.8);
  rainbow.lookAt(H.camera.position);

  /* 光柱呼吸 */
  for (const r of godRays) {
    r.material.opacity = r.userData.baseOp * bright * (0.85 + 0.15 * Math.sin(t * 1.3 + r.position.x));
    r.material.rotation = 0;
  }

  /* 远雾 */
  for (const f of fogBands) {
    f.m.position.x += f.sp * dt;
    if (f.m.position.x > 40) f.m.position.x = -40;
    f.m.material.opacity = 0.32 + 0.18 * Math.sin(t * 0.21 + f.ph) + H.gust * 0.1;
  }
});

})();
