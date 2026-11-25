// 三维场景④：GB200 NVL72 整机柜与数据中心机房（米尺度）
// 18 个计算托盘 + 9 个 NVLink 交换托盘 + 电源架；背后是铜缆背板、母排与液冷歧管
import * as THREE from 'three';
import { buildComputeTray, glowQuad, tube } from './server.js';
import { panelTextures } from '../textures.js';
import { VOLT, ICE, AMBER } from './pkg.js';
import { rng } from '../util.js';

const U = 44.45;
export const RACK = { W: 600, H: 2236, D: 1100 };
// 从下到上的槽位
export const SLOTS = (() => {
  const s = [];
  let u = 2;
  const add = (kind, n) => { for (let i = 0; i < n; i++) s.push({ kind, u: u++ }); };
  add('power', 4); u += 1; add('compute', 8); add('switch', 9); add('compute', 10); u += 1; add('power', 4); add('mgmt', 2);
  return s;
})();
export const HERO_SLOT = SLOTS.findIndex((s, i) => s.kind === 'compute' && SLOTS.slice(0, i).filter((q) => q.kind === 'compute').length === 12);
export const slotY = (sl) => sl.u * U + U / 2;

function rackFrontTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#0d0f12'; x.fillRect(0, 0, 256, 1024);
  const R = rng(4);
  const uPx = 1024 / (RACK.H / U);
  for (const sl of SLOTS) {
    const y = 1024 - (sl.u + 1) * uPx;
    x.fillStyle = sl.kind === 'switch' ? '#1b2027' : sl.kind === 'power' ? '#20211f' : '#16191d';
    x.fillRect(8, y + 1, 240, uPx - 2);
    for (let i = 0; i < 10; i++) {
      x.fillStyle = sl.kind === 'switch' ? (R() > 0.3 ? '#b8f24a' : '#7ce0ff') : sl.kind === 'power' ? '#ffb347' : (R() > 0.5 ? '#b8f24a' : '#2a3b20');
      if (R() > 0.35) x.fillRect(20 + i * 22, y + uPx * 0.35, 6, Math.max(1.5, uPx * 0.3));
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createRackScene(gl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040506);
  scene.environment = gl.env;
  scene.environmentIntensity = 0.25;
  scene.fog = new THREE.FogExp2(0x040506, 0.000045);
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 5, 200000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 200000);
  const key = new THREE.DirectionalLight(0xffe2c0, 2.4); key.position.set(-3000, 5000, 4000); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd4ff, 1.5); rim.position.set(4000, 2500, -5000); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x060706, 0.5));

  const rack = new THREE.Group();
  const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1f24, metalness: 0.85, roughness: 0.45, anisotropy: 0.4 });
  const { W, H, D } = RACK;
  // 立柱与顶底
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(30, H, 30), frameMat); p.position.set(sx * (W / 2 - 15), H / 2, sz * (D / 2 - 15)); rack.add(p); }
  for (const y of [15, H - 15]) { const b = new THREE.Mesh(new THREE.BoxGeometry(W, 30, D), frameMat); b.position.y = y; rack.add(b); }
  // 侧板（半透明，便于看见内部）
  const sideMat = new THREE.MeshPhysicalMaterial({ color: 0x101317, metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) { const sp = new THREE.Mesh(new THREE.PlaneGeometry(D - 60, H - 60), sideMat); sp.rotation.y = Math.PI / 2; sp.position.set(sx * (W / 2 - 2), H / 2, 0); rack.add(sp); }

  // 托盘
  const P = { compute: panelTextures('compute'), switch: panelTextures('switch'), power: panelTextures('power'), mgmt: panelTextures('switch') };
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x17191d, metalness: 0.7, roughness: 0.45 });
  const trays = [];
  SLOTS.forEach((sl, i) => {
    if (i === HERO_SLOT) { trays.push(null); return; }
    const pm = new THREE.MeshStandardMaterial({ map: P[sl.kind].map, emissiveMap: P[sl.kind].emi, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.5, metalness: 0.5 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(W - 70, U - 3, D - 120), [bodyMat, bodyMat, bodyMat, bodyMat, pm, bodyMat]);
    m.position.set(0, slotY(sl), 30);
    rack.add(m);
    trays.push({ m, pm, sl });
  });
  // 主角托盘：可以抽出
  const hero = buildComputeTray();
  const heroSl = SLOTS[HERO_SLOT];
  const heroScale = (U - 3) / hero.H;
  hero.group.scale.setScalar((W - 70) / hero.W); // 等比缩放：机柜里的 GPU 与开场的封装同一比例
  void heroScale;
  const heroBase = new THREE.Vector3(0, slotY(heroSl) - (U - 3) / 2, 30);
  hero.group.position.copy(heroBase);
  rack.add(hero.group);

  // ── 背面：NVLink 铜缆背板（4 个线缆盒）──
  const spine = new THREE.Group();
  const cableN = 4 * 18;
  const cableU = { uTime: { value: 0 }, uAmt: { value: 0 }, uBase: { value: 0.25 } };
  const cableMat = new THREE.ShaderMaterial({
    uniforms: cableU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime, uAmt, uBase; varying vec2 vUv;
      void main(){ float f = fract(vUv.x*3.0 - uTime*0.9); float p = smoothstep(0.0,0.08,f)*smoothstep(0.3,0.08,f);
        vec3 c = vec3(0.85,0.6,0.32)*uBase + vec3(0.72,0.95,0.29)*p*uAmt*3.0; gl_FragColor = vec4(c, 1.0); }`,
  });
  const swSlots = SLOTS.map((s, i) => ({ s, i })).filter((q) => q.s.kind === 'switch');
  const cSlots = SLOTS.map((s, i) => ({ s, i })).filter((q) => q.s.kind === 'compute');
  const R = rng(8);
  cSlots.forEach((c, ci) => {
    for (let k = 0; k < 4; k++) {
      const sw = swSlots[(ci + k * 2) % swSlots.length];
      const x = -210 + k * 140 + (R() - 0.5) * 40;
      const y0 = slotY(c.s), y1 = slotY(sw.s);
      const zb = -D / 2 + 40 + k * 8;
      const pts = [new THREE.Vector3(x, y0, zb + 30), new THREE.Vector3(x, y0, zb - 20), new THREE.Vector3(x + (R() - 0.5) * 30, (y0 + y1) / 2, zb - 40 - R() * 30), new THREE.Vector3(x, y1, zb - 20), new THREE.Vector3(x, y1, zb + 30)];
      spine.add(tube(pts, 3.2, cableMat, 32));
    }
  });
  spine.traverse((c) => c.layers.set(1));
  rack.add(spine);
  // 母排（供电）
  const busU = { uTime: { value: 0 }, uAmt: { value: 0 } };
  const busMat = new THREE.ShaderMaterial({
    uniforms: busU,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime, uAmt; varying vec2 vUv;
      void main(){ float f = fract(vUv.y*6.0 - uTime*0.8); float p = smoothstep(0.0,0.1,f)*smoothstep(0.35,0.1,f);
        vec3 c = vec3(0.42,0.24,0.12) + vec3(1.0,0.62,0.22)*p*uAmt*3.0; gl_FragColor = vec4(c,1.0); }`,
  });
  const bus = new THREE.Mesh(new THREE.BoxGeometry(46, H - 200, 14), busMat);
  bus.position.set(0, H / 2, -D / 2 + 14); rack.add(bus);
  // 液冷歧管（蓝：供液，红：回液）与支管
  const flowMat = (c1, c2) => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) }, uDir: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uTime, uAmt, uDir; uniform vec3 uC1, uC2; varying vec2 vUv;
      void main(){ float f = fract(vUv.x*8.0 - uDir*uTime*0.7); float p = smoothstep(0.0,0.1,f)*smoothstep(0.4,0.1,f);
        vec3 c = uC1*0.35 + uC2*p*uAmt*2.6; gl_FragColor = vec4(c,1.0); }`,
  });
  const supMat = flowMat('#1d5f86', '#7ce0ff'), retMat = flowMat('#7a2e22', '#ff6a3d');
  supMat.uniforms.uDir.value = -1;
  const manifolds = [];
  for (const [sx, mat] of [[-1, supMat], [1, retMat]]) {
    const x = sx * (W / 2 - 70), z = -D / 2 + 30;
    manifolds.push(tube([new THREE.Vector3(x, H - 40, z), new THREE.Vector3(x, H / 2, z), new THREE.Vector3(x, 80, z)], 16, mat, 24));
    rack.add(manifolds[manifolds.length - 1]);
    SLOTS.forEach((sl) => {
      if (sl.kind !== 'compute' && sl.kind !== 'switch') return;
      const y = slotY(sl);
      rack.add(tube([new THREE.Vector3(x, y, z), new THREE.Vector3(x - sx * 40, y, z + 30), new THREE.Vector3(x - sx * 60, y, z + 70)], 5, mat, 6));
    });
  }
  // 机柜背后的冷却分配单元（CDU）与地下管道
  const cdu = new THREE.Mesh(new THREE.BoxGeometry(1200, H, D), new THREE.MeshStandardMaterial({ color: 0x1a1d22, metalness: 0.6, roughness: 0.55 }));
  cdu.position.set(-1360, H / 2, 0); // 与主角机柜同排，占两个机位
  const cduLed = new THREE.Mesh(new THREE.PlaneGeometry(800, 50), new THREE.MeshBasicMaterial({ color: ICE.clone().multiplyScalar(1.5), toneMapped: false }));
  cduLed.position.set(-1360, 1750, -D / 2 - 1); cduLed.rotation.y = Math.PI;
  const cduLed2 = cduLed.clone(); cduLed2.position.z = D / 2 + 1; cduLed2.rotation.y = 0;
  scene.add(cdu, cduLed, cduLed2);
  const pipeS = tube([new THREE.Vector3(-1100, 160, -D / 2 - 10), new THREE.Vector3(-500, 50, -720), new THREE.Vector3(110, 80, -D / 2 + 30)], 22, supMat, 32);
  const pipeR = tube([new THREE.Vector3(570, 80, -D / 2 + 30), new THREE.Vector3(-300, 30, -820), new THREE.Vector3(-1600, 160, -D / 2 - 10)], 22, retMat, 32);
  scene.add(pipeS, pipeR);
  scene.add(rack);
  // 与开场呼应：机柜脚下同样有一圈绿色的光
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uAmt: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uAmt; void main(){ vec2 d = vUv-0.5; float r = length(d);
      float a = exp(-r*r*40.0)*0.22 + exp(-r*r*300.0)*0.2; gl_FragColor = vec4(vec3(0.45,0.62,0.2)*a*uAmt, 1.0); }`,
  }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 2, 0);
  pool.layers.set(1);
  rack.add(pool);
  // 电源架发光
  const powerGlow = glowQuad(900, AMBER); powerGlow.rotation.set(0, 0, 0); powerGlow.position.set(0, H / 2, -D / 2 - 30); powerGlow.layers.set(1); rack.add(powerGlow);

  // ── 机房：成排的机柜 ──
  const hall = new THREE.Group();
  const rows = 8, perRow = 14, gapX = 680, gapZ = 3200;
  const frontTex = rackFrontTexture();
  const rGeo = new THREE.BoxGeometry(W, H, D);
  const rMat = [frameMat, frameMat, frameMat, frameMat, new THREE.MeshStandardMaterial({ map: frontTex, emissiveMap: frontTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.5, metalness: 0.5 }), frameMat];
  const list = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < perRow; c++) {
    const x = (c - (perRow - 1) / 2) * gapX, z = (r - 2) * gapZ;
    if (r === 2 && (c === Math.floor(perRow / 2) || c === 4 || c === 5)) continue; // 主角机柜与 CDU 的位置
    list.push([x, z, r % 2 ? Math.PI : 0]);
  }
  // 机柜从地面依次升起：按到主角机柜的距离错开（逐实例矩阵）
  const heroXZ = [gapX * (Math.floor(perRow / 2) - (perRow - 1) / 2), 0];
  const hallFrame = new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.45, roughness: 0.72 }); rMat[0] = rMat[1] = rMat[2] = rMat[3] = rMat[5] = hallFrame;
  const im = new THREE.InstancedMesh(rGeo, rMat, list.length);
  const o = new THREE.Object3D();
  let lastRise = -1;
  const setRise = (rise) => {
    if (Math.abs(rise - lastRise) < 1e-5) return;
    lastRise = rise;
    list.forEach(([x, z, ry], i) => {
      const dd = Math.hypot(x - heroXZ[0], z - heroXZ[1]);
      let rr = Math.min(1, Math.max(0, (rise * 26000 - dd) / 5000)); rr = rr * rr * (3 - 2 * rr);
      const sy = Math.max(rr, 0.0005);
      o.position.set(x, (H * sy) / 2, z); o.rotation.y = ry; o.scale.set(1, sy, 1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
  };
  setRise(1);
  hall.add(im);
  rack.position.set(gapX * (Math.floor(perRow / 2) - (perRow - 1) / 2), 0, 0);
  // 天花板上的管道与线槽
  const pipeMatB = new THREE.MeshStandardMaterial({ color: 0x1d4f6e, emissive: ICE, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.5 });
  const pipeMatR = new THREE.MeshStandardMaterial({ color: 0x6e2a1d, emissive: new THREE.Color('#ff6a3d'), emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.5 });
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.7, roughness: 0.5 });
  for (let r = 0; r < rows; r++) {
    const z = (r - 2) * gapZ;
    const len = perRow * gapX + 1200;
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, len, 12), pipeMatB); p1.rotation.z = Math.PI / 2; p1.position.set(0, H + 700, z - 300); hall.add(p1);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, len, 12), pipeMatR); p2.rotation.z = Math.PI / 2; p2.position.set(0, H + 700, z + 300); hall.add(p2);
    const ct = new THREE.Mesh(new THREE.BoxGeometry(len, 40, 400), trayMat); ct.position.set(0, H + 400, z); hall.add(ct);
  }
  scene.add(hall);
  // 地面
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000), new THREE.ShaderMaterial({
    uniforms: { uFog: { value: 0.000045 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vW; uniform float uFog; float grid(vec2 p, float s){ vec2 g = abs(fract(p/s-0.5)-0.5)/fwidth(p/s); return 1.0-min(min(g.x,g.y),1.0); }
      void main(){ float d = length(vW.xz - cameraPosition.xz); float a = grid(vW.xz, 600.0)*0.1; vec3 c = vec3(0.02,0.023,0.026) + vec3(0.3,0.36,0.4)*a; float f = 1.0 - exp(-uFog*uFog*d*d); gl_FragColor = vec4(mix(c, vec3(0.016,0.02,0.024), f), 1.0); }`,
  }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const overhead = hall.children.filter((c) => c !== im);
  const def = { scene, camera, ortho, rack, hero, heroBase, hall, trays, cableU, busU, supMat, retMat, hallIM: im, rackX: rack.position.x };
  def.update = (t, o = {}) => {
    hero.group.position.z = heroBase.z + (o.pull ?? 0);
    cableU.uTime.value = t; cableU.uAmt.value = o.nvlink ?? 0; cableU.uBase.value = 0.18 + 0.2 * (o.spineLit ?? 0);
    busU.uTime.value = t; busU.uAmt.value = o.power ?? 0;
    for (const m of [supMat, retMat]) { m.uniforms.uTime.value = t; m.uniforms.uAmt.value = o.cool ?? 0; }
    powerGlow.material.opacity = (o.power ?? 0) * 0.25;
    pool.material.uniforms.uAmt.value = o.pool ?? 1;
    const lit = o.lit ?? 1;
    for (const tr of trays) if (tr) tr.pm.emissiveIntensity = 0.3 + 1.2 * lit * (0.75 + 0.25 * Math.sin(t * 2 + tr.sl.u));
    rMat[4].emissiveIntensity = 0.4 + 0.8 * (o.hallLit ?? 1) * (0.8 + 0.2 * Math.sin(t * 1.3));
    for (const pk of hero.pkgs) for (const top of pk.parts.dieTops) top.material.emissiveIntensity = 0.35 + (o.heroGlow ?? 0) * 1.2;
    scene.fog.density = o.fog ?? 0.000045;
    floor.material.uniforms.uFog.value = o.floorFog ?? 0.000045;
    const rise = o.rise ?? 1;
    setRise(rise);
    im.visible = rise > 0.001;
    hero.coldMat.opacity = 0.5 * (o.cold ?? 1);
    hero.coldMat.visible = (o.cold ?? 1) > 0.01;
    for (const tb of hero.tubes) tb.visible = (o.cold ?? 1) > 0.05;
    for (const c of overhead) c.visible = rise > 0.85 && (o.overhead ?? 1) > 0.5;
  };
  return def;
}
