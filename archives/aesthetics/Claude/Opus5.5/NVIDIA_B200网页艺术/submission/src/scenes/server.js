// 三维场景③：服务器平台（厘米尺度）——八 GPU 的 HGX B200 基板，以及 GB200 计算托盘（Grace + 2 × Blackwell，液冷）
import * as THREE from 'three';
import { buildPackage, VOLT, ICE, AMBER, PKG_H } from './pkg.js';
import { pcbTexture, dotTexture } from '../textures.js';
import { rng } from '../util.js';

export const GPU_POS = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) GPU_POS.push([-195 + c * 130, r === 0 ? -98 : 98]);
export const SW_POS = [[-100, 0], [100, 0]];
export const BOARD_TOP = 4;
export const MOD_TOP = BOARD_TOP + 5;
export const TRAY_POS = new THREE.Vector3(1100, 0, 0);

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); return t;
})();
export function glowQuad(size, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** 发光的管线（NVLink 走线 / 冷却液管） */
export function tube(points, r, mat, seg = 64) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 6, false), mat);
  m.userData.curve = curve;
  return m;
}

/** GB200 计算托盘（1U）：两块板，每块 1 × Grace + 2 × B200，冷板与液冷管 */
export function buildComputeTray({ open = true } = {}) {
  const g = new THREE.Group();
  const R = rng(17);
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x1c1f24, metalness: 0.8, roughness: 0.55, anisotropy: 0.4 });
  const W = 540, Hh = 42, D = 820;
  // 底盘
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 2, D), metal); base.position.y = 1; g.add(base);
  for (const sx of [-1, 1]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(2, Hh, D), metal); wall.position.set(sx * (W / 2 - 1), Hh / 2, 0); g.add(wall); }
  const front = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, 6), new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.6, metalness: 0.5 })); front.position.set(0, Hh / 2, D / 2 - 3); g.add(front);
  // 前面板端口与指示灯
  const ledMat = new THREE.MeshBasicMaterial({ color: VOLT.clone().multiplyScalar(2), toneMapped: false });
  for (let i = 0; i < 8; i++) {
    const port = new THREE.Mesh(new THREE.BoxGeometry(22, 14, 4), new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 0.4 }));
    port.position.set(-200 + i * 30, 20, D / 2 + 0.5); g.add(port);
    const led = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 1), ledMat); led.position.set(-200 + i * 30, 32, D / 2 + 1); g.add(led);
  }
  const pcb = new THREE.MeshStandardMaterial({ map: pcbTexture(23, '#0c1410'), roughness: 0.75, metalness: 0.15 });
  const boards = [];
  const coldMat = new THREE.MeshPhysicalMaterial({ color: 0xc88d5a, metalness: 1, roughness: 0.28, transparent: true, opacity: 0.5, depthWrite: false });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1f6f9e, emissive: ICE, emissiveIntensity: 0.35, roughness: 0.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0x9e3a2a, emissive: new THREE.Color('#ff6a3d'), emissiveIntensity: 0.35, roughness: 0.4 });
  const c2c = new THREE.MeshBasicMaterial({ color: VOLT.clone().multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.9 });
  const pkgs = [], tubes = [];
  for (const bx of [-130, 130]) {
    const bg = new THREE.Group(); bg.position.set(bx, 3, -40);
    const b = new THREE.Mesh(new THREE.BoxGeometry(240, 3, 560), pcb); b.position.y = 1.5; bg.add(b);
    // Grace CPU + LPDDR5X
    const grace = new THREE.Group(); grace.position.set(0, 3, 170);
    const gs = new THREE.Mesh(new THREE.BoxGeometry(64, 2, 64), new THREE.MeshStandardMaterial({ color: 0x163024, roughness: 0.6 }));
    gs.position.y = 1; grace.add(gs);
    const gd = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 40), new THREE.MeshPhysicalMaterial({ color: 0x55606e, metalness: 0.6, roughness: 0.2, iridescence: 0.8, iridescenceThicknessRange: [200, 600] }));
    gd.position.y = 2.6; grace.add(gd);
    for (let i = 0; i < 16; i++) {
      const side = i < 8 ? -1 : 1, k = i % 8;
      const m = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.4, metalness: 0.4 }));
      m.position.set(side * 44, 2, -45 + k * 13); grace.add(m);
    }
    bg.add(grace);
    // 两颗 B200
    const gp = [];
    for (const gz of [-40, -180]) {
      const pk = buildPackage({ lite: true });
      pk.group.scale.setScalar(0.92);
      pk.group.position.set(0, 3 + 2.2, gz);
      bg.add(pk.group);
      gp.push(pk);
      pkgs.push(pk);
      // NVLink-C2C：Grace ↔ GPU
      const a = new THREE.Vector3(0, 6, 135), bb = new THREE.Vector3(0, 6, gz + 38);
      const ct = tube([a, new THREE.Vector3(18, 8, (a.z + bb.z) / 2), bb], 1.2, c2c, 24); ct.layers.set(1); tubes.push(ct); bg.add(ct);
      // 冷板
      const cp = new THREE.Mesh(new THREE.BoxGeometry(82, 9, 84), coldMat);
      cp.position.set(0, 13, gz); bg.add(cp);
    }
    const cpG = new THREE.Mesh(new THREE.BoxGeometry(60, 8, 62), coldMat); cpG.position.set(0, 12, 170); bg.add(cpG);
    // 液冷管：蓝进红出
    const tbB = tube([new THREE.Vector3(-30, 18, 400), new THREE.Vector3(-30, 20, 260), new THREE.Vector3(-30, 19, 170), new THREE.Vector3(-30, 19, -40), new THREE.Vector3(-30, 19, -180)], 3.2, blue, 48);
    const tbR = tube([new THREE.Vector3(30, 19, -180), new THREE.Vector3(30, 19, -40), new THREE.Vector3(30, 19, 170), new THREE.Vector3(30, 20, 260), new THREE.Vector3(30, 18, 400)], 3.2, red, 48);
    tubes.push(tbB, tbR); bg.add(tbB, tbR);
    boards.push({ bg, gp, grace });
    g.add(bg);
  }
  // 背部 NVLink 连接器
  for (let i = 0; i < 4; i++) {
    const cn = new THREE.Mesh(new THREE.BoxGeometry(70, 26, 18), new THREE.MeshStandardMaterial({ color: 0x3a3226, metalness: 0.7, roughness: 0.35 }));
    cn.position.set(-180 + i * 120, 16, -D / 2 + 12); g.add(cn);
  }
  void R;
  return { group: g, boards, pkgs, W, D, H: Hh, coldMat, tubes };
}

export function createServerScene(gl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050607);
  scene.environment = gl.env;
  scene.environmentIntensity = 0.22;
  scene.fog = new THREE.Fog(0x050607, 900, 3200);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 2, 20000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 200000);
  const key = new THREE.DirectionalLight(0xffe2c0, 2.2); key.position.set(-400, 700, 300); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd4ff, 1.8); rim.position.set(500, 300, -600); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x080a08, 0.4));

  // ── HGX B200 基板 ──
  const hgx = new THREE.Group();
  const pcb = new THREE.MeshStandardMaterial({ map: pcbTexture(5), roughness: 0.78, metalness: 0.12 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(600, BOARD_TOP, 440), pcb); board.position.y = BOARD_TOP / 2; hgx.add(board);
  const modMat = new THREE.MeshStandardMaterial({ map: pcbTexture(9, '#0b120e'), roughness: 0.7, metalness: 0.2 });
  const gpus = [];
  GPU_POS.forEach(([x, z], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(110, 5, 132), modMat); m.position.set(x, BOARD_TOP + 2.5, z); hgx.add(m);
    const pk = buildPackage({ lite: true });
    pk.group.scale.setScalar(1);
    pk.group.position.set(x, MOD_TOP + PKG_H.subT, z);
    hgx.add(pk.group);
    const halo = glowQuad(150, VOLT); halo.position.set(x, MOD_TOP + 6, z); halo.layers.set(1); hgx.add(halo);
    gpus.push({ pk, halo, x, z });
  });
  // 供电电感（VRM）
  {
    const geo = new THREE.BoxGeometry(7, 6, 7);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.5, metalness: 0.6 });
    const list = [];
    GPU_POS.forEach(([x, z]) => { for (let k = 0; k < 10; k++) { list.push([x - 49 + k * 10.8, z + (z > 0 ? 58 : -58)]); } });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const o = new THREE.Object3D();
    list.forEach(([x, z], i) => { o.position.set(x, MOD_TOP + 3, z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    hgx.add(im);
  }
  // NVLink 交换芯片 ×2
  const swMat = new THREE.MeshPhysicalMaterial({ color: 0x5c6168, metalness: 1, roughness: 0.42, anisotropy: 0.6 });
  const switches = SW_POS.map(([x, z]) => {
    const gg = new THREE.Group(); gg.position.set(x, BOARD_TOP, z);
    const s = new THREE.Mesh(new THREE.BoxGeometry(52, 2, 52), new THREE.MeshStandardMaterial({ color: 0x163024, roughness: 0.6 })); s.position.y = 1; gg.add(s);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(40, 3, 40), swMat); lid.position.y = 3.5; gg.add(lid);
    const halo = glowQuad(110, VOLT); halo.position.y = 6; halo.layers.set(1); gg.add(halo);
    hgx.add(gg);
    return { g: gg, halo };
  });
  // 边缘连接器
  for (let i = 0; i < 10; i++) {
    const cn = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 12), new THREE.MeshStandardMaterial({ color: 0x2b2620, metalness: 0.6, roughness: 0.4 }));
    cn.position.set(-260 + i * 58, BOARD_TOP + 7, -214); hgx.add(cn);
  }
  // NVLink 走线：每颗 GPU 连到两颗交换芯片
  const traces = [];
  const traceMats = GPU_POS.map(() => new THREE.MeshBasicMaterial({ color: VOLT.clone().multiplyScalar(1.6), transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
  GPU_POS.forEach(([x, z], i) => {
    SW_POS.forEach(([sx, sz], j) => {
      const y = BOARD_TOP + 0.8;
      const ez = z > 0 ? z - 66 : z + 66;
      const pts = [new THREE.Vector3(x + (j ? 18 : -18), y, ez), new THREE.Vector3(x + (j ? 18 : -18), y, (ez + sz) / 2 + (z > 0 ? 6 : -6)), new THREE.Vector3((x + sx) / 2, y, sz + (z > 0 ? 24 : -24)), new THREE.Vector3(sx + (x > sx ? 22 : -22), y, sz + (z > 0 ? 18 : -18))];
      const tb = tube(pts, 1.1, traceMats[i], 40);
      tb.layers.set(1);
      hgx.add(tb);
      traces.push({ gi: i, sj: j, curve: tb.userData.curve });
    });
  });
  scene.add(hgx);
  // 归约粒子
  const NP = traces.length * 10;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
  pGeo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(NP), 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: dotTexture() }, uScale: { value: 1 } },
    vertexShader: `attribute float aA; uniform float uScale; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = uScale*7.0*(900.0/-mv.z); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a*vA; gl_FragColor = vec4(vec3(0.85,1.0,0.6)*2.2*a, a); }`,
  });
  const parts = new THREE.Points(pGeo, pMat); parts.frustumCulled = false; parts.layers.set(1); scene.add(parts);

  // ── GB200 计算托盘 ──
  const tray = buildComputeTray();
  tray.group.position.copy(TRAY_POS);
  tray.group.scale.setScalar(530 / 540); // 与机柜里的主角托盘同一比例（等比）
  scene.add(tray.group);
  const trayGlow = tray.pkgs.map((pk) => { const q = glowQuad(130, VOLT); q.layers.set(1); pk.group.add(q); q.position.y = 8; return q; });

  // 地面
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uC: { value: new THREE.Vector3(500, 0, 0) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vW; uniform vec3 uC; float grid(vec2 p, float s){ vec2 g = abs(fract(p/s-0.5)-0.5)/fwidth(p/s); return 1.0-min(min(g.x,g.y),1.0); }
      void main(){ float a = (grid(vW.xz, 50.0)*0.08 + grid(vW.xz, 250.0)*0.18) * smoothstep(2200.0, 300.0, length(vW.xz - uC.xz)); gl_FragColor = vec4(vec3(0.43,0.48,0.53)*a, a); }`,
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -60; scene.add(floor);

  const def = { scene, camera, ortho, gpus, switches, traces, traceMats, tray, trayGlow, hgx };
  const posA = pGeo.attributes.position.array, aA = pGeo.attributes.aA.array;
  /** o.glow[i]：GPU i 的计算强度；o.flow：归约进度（0..1，<0 表示无）；o.active：参与的 GPU 数 */
  def.update = (t, o = {}) => {
    const glow = o.glow || [];
    const active = o.active ?? 8;
    gpus.forEach((g, i) => {
      const k = glow[i] || 0;
      for (const top of g.pk.parts.dieTops) top.material.emissiveIntensity = 0.35 + k * 2.2;
      g.halo.material.opacity = k * 0.55;
      traceMats[i].opacity = i < active ? 0.18 + 0.5 * (o.links ?? 0.5) : 0.04;
    });
    const fl = o.flow ?? -1;
    switches.forEach((s) => { s.halo.material.opacity = fl > 0 && fl < 1 ? 0.6 * Math.sin(fl * Math.PI) : 0.05; });
    let k = 0;
    traces.forEach((tr) => {
      for (let m = 0; m < 10; m++) {
        let a = 0, f = 0;
        if (fl > 0 && fl < 1 && tr.gi < active) {
          const lag = m * 0.035;
          const ff = fl - lag;
          if (ff > 0 && ff < 0.62) { f = ff < 0.31 ? ff / 0.31 : 1 - (ff - 0.31) / 0.31; a = 1; }
        }
        const pnt = tr.curve.getPointAt(Math.min(0.999, Math.max(0, f)));
        posA[k * 3] = pnt.x; posA[k * 3 + 1] = pnt.y + 1.5; posA[k * 3 + 2] = pnt.z;
        aA[k] = a;
        k++;
      }
    });
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aA.needsUpdate = true;
    pMat.uniforms.uScale.value = Math.max(0.6, gl.renderer.getPixelRatio() * (window.innerHeight / 1080));
    const tg = o.trayGlow ?? 0;
    trayGlow.forEach((q, i) => { q.material.opacity = tg * (0.35 + 0.25 * Math.sin(t * 3 + i)); });
    for (const pk of tray.pkgs) for (const top of pk.parts.dieTops) top.material.emissiveIntensity = 0.35 + tg * 1.2;
  };
  return def;
}
