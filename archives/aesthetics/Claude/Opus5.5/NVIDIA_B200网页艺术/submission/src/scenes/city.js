// 三维场景②：硅城（亚毫米尺度）——晶粒版图生长成街区，148 个 SM 是 148 栋楼；
// 一项任务被切成 1024 块，分 7 个波次投向各个 SM，算完再升回原位拼成结果。
import * as THREE from 'three';
import { LAYOUT, DIE_W, DIE_D, GAP, REGIONS, toXZ } from '../floorplan.js';
import { pkgTextures, hbmPositions, HBM_W, HBM_D, VOLT, ICE } from './pkg.js';
import { rng } from '../util.js';

export const TILE_N = 32;            // 32×32 = 1024 个线程块
export const N_SM = LAYOUT.sms.length; // 148
export const WAVES = Math.ceil((TILE_N * TILE_N) / N_SM); // 7
export const PLANE_Y = 12;
export const PLANE = [44, 28];

export function createCityScene(gl) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x040506);
  scene.fog = new THREE.FogExp2(0x040506, 0.006);
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 1500);
  const T = pkgTextures();
  const R = rng(99);

  // 晶粒底板（与封装场景同一张版图贴图）
  const baseMat = (t) => new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emi, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.55, metalness: 0.3 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.5, metalness: 0.5 });
  const dies = [];
  for (let d = 0; d < 2; d++) {
    const x = d === 0 ? -(DIE_W / 2 + GAP / 2) : DIE_W / 2 + GAP / 2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(DIE_W, 0.9, DIE_D), sideMat);
    box.position.set(x, -0.45, 0);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(DIE_W, DIE_D), baseMat(d === 0 ? T.die : T.dieR));
    top.rotation.x = -Math.PI / 2;
    top.position.set(x, 0.001, 0);
    scene.add(box, top);
    dies.push(top);
  }
  // 周边：HBM 堆栈与中介层（与封装场景位置一致，保证俯视承接时画面连续）
  const HB = hbmPositions();
  const hbmMats = [];
  for (const hp of HB) {
    const hbmMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.35, metalness: 0.5, emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0 });
    hbmMats.push(hbmMat);
    const m = new THREE.Mesh(new THREE.BoxGeometry(HBM_W, 0.82, HBM_D), hbmMat);
    m.position.set(hp.x, -0.49, hp.z);
    scene.add(m);
  }
  const ip = new THREE.Mesh(new THREE.BoxGeometry(54.8, 0.6, 58.8), new THREE.MeshStandardMaterial({ map: T.ip, roughness: 0.4, metalness: 0.5 }));
  ip.position.y = -1.2;
  scene.add(ip);
  scene.add(new THREE.HemisphereLight(0x9fb4c8, 0x050605, 0.6));
  const key = new THREE.DirectionalLight(0xffe6c8, 1.2);
  key.position.set(-30, 50, 20);
  scene.add(key);

  // ── SM 楼宇 ──
  const sms = LAYOUT.sms;
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1));
  geo.instanceCount = sms.length;
  const aI = new Float32Array(sms.length), aH = new Float32Array(sms.length), aSeed = new Float32Array(sms.length);
  const aOff = new Float32Array(sms.length * 4);
  sms.forEach((s, i) => {
    aI[i] = i; aH[i] = 0.55 + R() * 0.55; aSeed[i] = R();
    aOff.set([s.x, s.z, s.w, s.d], i * 4);
  });
  geo.setAttribute('aI', new THREE.InstancedBufferAttribute(aI, 1));
  geo.setAttribute('aH', new THREE.InstancedBufferAttribute(aH, 1));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(aOff, 4));
  const stackOf = sms.map((sm) => { let bi = 0, bd = 1e9; HB.forEach((hp, k) => { const d = (hp.x - sm.x) ** 2 + (hp.z - sm.z) ** 2 * 0.6; if (d < bd) { bd = d; bi = k; } }); return bi; });
  geo.setAttribute('aStack', new THREE.InstancedBufferAttribute(new Float32Array(stackOf), 1));
  const bU = {
    uGrow: { value: 0 }, uTime: { value: 0 }, uWave: { value: -1 }, uBusyAmt: { value: 0 },
    uFeed: { value: new Array(8).fill(0) }, uFeedMode: { value: 0 },
    uHi: { value: -1 }, uHiAmt: { value: 0 }, uRem: { value: (TILE_N * TILE_N) - (WAVES - 1) * N_SM }, uLast: { value: WAVES - 1 },
    uIdle: { value: 0.25 }, uWin: { value: VOLT.clone() }, uFogC: { value: new THREE.Color(0x040506) }, uFogD: { value: 0.006 },
  };
  const bMat = new THREE.ShaderMaterial({
    uniforms: bU,
    vertexShader: /* glsl */ `
      attribute float aI, aH, aSeed, aStack; attribute vec4 aOff;
      uniform float uGrow, uWave, uBusyAmt, uHi, uHiAmt, uRem, uLast, uTime, uFeedMode;
      uniform float uFeed[8];
      varying vec3 vN, vL, vW; varying float vBusy, vH, vHi, vSeed, vWait;
      void main(){
        float h = mix(0.02, aH, uGrow);
        vec3 p = position;
        vL = p + 0.5;
        p.y = (p.y + 0.5) * h;
        p.x *= aOff.z; p.z *= aOff.w;
        p.x += aOff.x; p.z += aOff.y;
        vH = h; vSeed = aSeed;
        float w = floor(uWave), l = uWave - w;
        float land = 0.3 + aSeed*0.08;
        float b = smoothstep(land, land+0.05, l) * (1.0 - smoothstep(0.62+aSeed*0.06, 0.7+aSeed*0.06, l));
        float valid = (uWave < 0.0 || w > uLast) ? 0.0 : (w < uLast ? 1.0 : step(aI, uRem - 0.5));
        vBusy = b * valid * uBusyAmt;
        // 河流：楼的忙闲取决于它的显存堆栈供得上多少数据
        float fd = uFeed[int(aStack + 0.5)];
        float fb = smoothstep(0.12 + aSeed*0.25, 0.55 + aSeed*0.3, fd);
        vBusy = mix(vBusy, fb, uFeedMode);
        vWait = uFeedMode * (1.0 - fb);
        vHi = (abs(aI - uHi) < 0.5 ? 1.0 : 0.0) * uHiAmt;
        vN = normal;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uIdle, uFogD; uniform vec3 uWin, uFogC;
      varying vec3 vN, vL, vW; varying float vBusy, vH, vHi, vSeed, vWait;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec3 n = normalize(vN);
        float diff = max(dot(n, normalize(vec3(-0.5,0.9,0.35))), 0.0);
        vec3 base = vec3(0.05,0.058,0.07) * (0.35 + 0.9*diff);
        vec3 col = base;
        float lit;
        if (n.y > 0.5) {
          // 屋顶：2×2 张量核心 + 边框
          vec2 q = vL.xz;
          vec2 c = fract(q*2.0);
          float tc = step(0.2,c.x)*step(c.x,0.8)*step(0.22,c.y)*step(c.y,0.78) * step(q.y, 0.999);
          float edge = 1.0 - step(0.04, min(min(q.x,1.0-q.x), min(q.y,1.0-q.y)));
          float fl = 0.75 + 0.25*sin(uTime*14.0 + vSeed*40.0 + q.x*9.0);
          col += uWin * tc * (uIdle*0.25 + vBusy*1.9*fl);
          col += vec3(0.85,0.9,0.95) * edge * 0.12;
          col += vec3(1.0,0.7,0.28) * edge * vHi * 3.0;
          // 空等：屋顶边缘缓慢闪烁的琥珀色信标
          col += vec3(1.0,0.62,0.22) * edge * vWait * (0.25 + 0.75*pow(0.5 + 0.5*sin(uTime*1.7 + vSeed*9.0), 3.0)) * 1.6;
        } else {
          // 侧面：成排的窗（线程束）
          vec2 q = abs(n.x) > 0.5 ? vec2(vL.z, vL.y) : vec2(vL.x, vL.y);
          vec2 g = vec2(q.x*6.0, q.y*vH*9.0);
          vec2 cell = floor(g), f = fract(g);
          float win = step(0.18,f.x)*step(f.x,0.82)*step(0.3,f.y)*step(f.y,0.7);
          float r = hash(cell + vSeed*31.0);
          float on = step(0.35, r);
          float fl = 0.6 + 0.4*sin(uTime*(6.0+r*10.0) + r*30.0);
          col += mix(vec3(1.0,0.78,0.45), uWin, 0.35 + 0.65*vBusy) * win * on * (uIdle*0.22 + vBusy*1.6*fl);
          col += vec3(1.0,0.7,0.28) * vHi * 0.25;
        }
        float fd = 1.0 - exp(-uFogD*uFogD*dot(vW - cameraPosition, vW - cameraPosition));
        gl_FragColor = vec4(mix(col, uFogC, fd), 1.0);
      }`,
  });
  const buildings = new THREE.Mesh(geo, bMat);
  buildings.frustumCulled = false;
  scene.add(buildings);

  // ── NV-HBI：跨缝的光桥 ──
  const bridgeN = 64;
  const brG = new THREE.InstancedBufferGeometry().copy(new THREE.BoxGeometry(1, 1, 1));
  brG.instanceCount = bridgeN;
  const brZ = new Float32Array(bridgeN);
  for (let i = 0; i < bridgeN; i++) brZ[i] = -DIE_D * 0.42 + (i / (bridgeN - 1)) * DIE_D * 0.84;
  brG.setAttribute('aZ', new THREE.InstancedBufferAttribute(brZ, 1));
  const brU = { uTime: { value: 0 }, uAmt: { value: 1 } };
  const bridges = new THREE.Mesh(brG, new THREE.ShaderMaterial({
    uniforms: brU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aZ; varying vec3 vL; varying float vZ;
      void main(){ vL = position + 0.5; vZ = aZ; vec3 p = position*vec3(3.2, 0.08, 0.16); p.z += aZ; p.y += 0.12;
        gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform float uTime, uAmt; varying vec3 vL; varying float vZ;
      void main(){ float f = fract(vL.x*1.0 - uTime*1.4 + vZ*0.37); float pulse = smoothstep(0.0,0.15,f)*smoothstep(0.35,0.15,f);
        float f2 = fract(-vL.x*1.0 - uTime*1.1 + vZ*0.61); float pulse2 = smoothstep(0.0,0.15,f2)*smoothstep(0.35,0.15,f2);
        vec3 c = vec3(0.72,0.95,0.29)*(0.35 + 2.6*(pulse+pulse2));
        gl_FragColor = vec4(c*uAmt, 1.0); }`,
  }));
  bridges.frustumCulled = false;
  scene.add(bridges);

  // ── 任务块：1024 个线程块 ──
  const tileGeo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const NT = TILE_N * TILE_N;
  tileGeo.instanceCount = NT;
  const aGrid = new Float32Array(NT * 2), aTgt = new Float32Array(NT * 3), aWave = new Float32Array(NT), aTs = new Float32Array(NT);
  // SM 的派发顺序打乱一点，看起来像调度器在填空位
  const perm = [...Array(N_SM).keys()].sort((a, b) => ((a * 61) % 148) - ((b * 61) % 148));
  for (let k = 0; k < NT; k++) {
    const gx = k % TILE_N, gy = Math.floor(k / TILE_N);
    aGrid[k * 2] = gx; aGrid[k * 2 + 1] = gy;
    const w = Math.floor(k / N_SM), sm = sms[perm[k % N_SM]];
    aWave[k] = w;
    aTgt.set([sm.x, aH[perm[k % N_SM]] + 0.05, sm.z], k * 3);
    aTs[k] = R();
  }
  tileGeo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(aGrid, 2));
  tileGeo.setAttribute('aTgt', new THREE.InstancedBufferAttribute(aTgt, 3));
  tileGeo.setAttribute('aWave', new THREE.InstancedBufferAttribute(aWave, 1));
  tileGeo.setAttribute('aTs', new THREE.InstancedBufferAttribute(aTs, 1));
  const tU = {
    uWave: { value: -1 }, uShow: { value: 0 }, uPlaneY: { value: PLANE_Y }, uSize: { value: new THREE.Vector2(...PLANE) },
    uN: { value: TILE_N }, uGrow: { value: 1 }, uTime: { value: 0 },
  };
  const tiles = new THREE.Mesh(tileGeo, new THREE.ShaderMaterial({
    uniforms: tU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec2 aGrid; attribute vec3 aTgt; attribute float aWave, aTs;
      uniform float uWave, uPlaneY, uN, uGrow, uShow; uniform vec2 uSize;
      varying vec2 vUv, vG; varying float vState, vA;
      float eio(float t){ return t<0.5 ? 4.0*t*t*t : 1.0-pow(-2.0*t+2.0,3.0)/2.0; }
      void main(){
        vec3 home = vec3(((aGrid.x+0.5)/uN - 0.5)*uSize.x, uPlaneY, ((aGrid.y+0.5)/uN - 0.5)*uSize.y);
        float l = uWave - aWave - aTs*0.1;
        vec3 pos; float sc = 1.0; vState = 0.0;
        vec3 tgt = vec3(aTgt.x, aTgt.y*uGrow + 0.05, aTgt.z);
        if (l <= 0.0) { pos = home; }
        else if (l < 0.3) { float k = eio(l/0.3); pos = mix(home, tgt, k); pos.y += sin(k*3.14159)*1.6; sc = mix(1.0, 0.45, k); }
        else if (l < 0.7) { pos = tgt; sc = 0.0; }
        else if (l < 1.0) { float k = eio((l-0.7)/0.3); pos = mix(tgt, home, k); pos.y += sin(k*3.14159)*1.6; sc = mix(0.45, 1.0, k); vState = 1.0; }
        else { pos = home; vState = 1.0; }
        vec2 ts = uSize / uN;
        vec3 p = position * vec3(ts.x, 1.0, ts.y) * 0.9 * sc + pos;
        vUv = uv; vG = aGrid / uN; vA = uShow * step(0.001, sc);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vUv, vG; varying float vState, vA;
      void main(){
        // 输入：冷色的“矩阵”纹样；输出：暖亮的结果
        float v = 0.5 + 0.5*sin(vG.x*9.0 + sin(vG.y*7.0)*1.5) * cos(vG.y*6.0 - vG.x*3.0);
        vec3 inC = mix(vec3(0.08,0.2,0.32), vec3(0.42,0.85,1.0), v);
        vec3 outC = mix(vec3(0.5,0.75,0.12), vec3(0.95,1.0,0.6), v);
        vec3 c = mix(inC, outC*0.95, vState);
        float e = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
        c += smoothstep(0.08, 0.0, e) * 0.35;
        gl_FragColor = vec4(c, vA * (0.5 + 0.3*vState));
      }`,
  }));
  tiles.frustumCulled = false;
  scene.add(tiles);

  const RIV = (() => {
    const per = 64, back = 18;
    const N = sms.length * (per + back);
    const A = new Float32Array(N * 3), B = new Float32Array(N * 3), C = new Float32Array(N * 3), D = new Float32Array(N * 3), SD = new Float32Array(N * 4);
    let k = 0;
    sms.forEach((sm, i) => {
      const hp = HB[stackOf[i]];
      const side = hp.side;
      for (let j = 0; j < per + back; j++) {
        const out = j >= per ? 1 : 0;
        const jx = (R() - 0.5);
        A.set([hp.x + jx * HBM_W * 0.7, 0.05, hp.z + (R() - 0.5) * HBM_D * 0.6], k * 3);
        B.set([hp.x + jx * HBM_W * 0.8, 0.25, side * (DIE_D / 2 - 0.9)], k * 3);
        C.set([sm.x * 0.7 + (R() - 0.5) * 3, 0.3, side * (0.6 + R() * 1.0)], k * 3);
        D.set([sm.x + (R() - 0.5) * sm.w * 0.5, aH[i] + 0.12, sm.z + (R() - 0.5) * sm.d * 0.5], k * 3);
        SD.set([R(), stackOf[i], out, R()], k * 4);
        k++;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aA', new THREE.BufferAttribute(A, 3)); g.setAttribute('aB', new THREE.BufferAttribute(B, 3));
    g.setAttribute('aC', new THREE.BufferAttribute(C, 3)); g.setAttribute('aD', new THREE.BufferAttribute(D, 3));
    g.setAttribute('aS', new THREE.BufferAttribute(SD, 4));
    const U = { uTime: { value: 0 }, uFeed: { value: new Array(8).fill(0) }, uAmt: { value: 0 }, uScale: { value: 1 }, uGrow: { value: 1 }, uMap: { value: pkgTextures().dot } };
    const m = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aA, aB, aC, aD; attribute vec4 aS;
        uniform float uTime, uAmt, uScale, uGrow; uniform float uFeed[8];
        varying float vA; varying vec3 vC;
        void main(){
          float fd = uFeed[int(aS.y + 0.5)];
          float vis = step(aS.x, mix(0.05, 1.0, fd));
          float spd = mix(0.045, 0.2, fd) * (0.8 + aS.w*0.4);
          float t = fract(uTime*spd + aS.x*17.31);
          if (aS.z > 0.5) t = 1.0 - t;
          vec3 d = vec3(aD.x, mix(0.1, aD.y, uGrow), aD.z);
          vec3 p;
          if (t < 0.18) { float u = t/0.18; p = mix(aA, aB, u); }
          else if (t < 0.58) { float u = (t-0.18)/0.4; p = mix(aB, aC, u); p.y += sin(u*3.14159)*(1.6 + aS.w*1.2); }
          else { float u = (t-0.58)/0.42; p = mix(aC, d, u); p.y += sin(u*3.14159)*(1.2 + aS.w); }
          vA = vis*uAmt*smoothstep(0.0, 0.04, t)*smoothstep(1.0, 0.94, t)*(aS.z > 0.5 ? 0.55 : 1.0);
          vC = aS.z > 0.5 ? vec3(0.49, 0.88, 1.0) : mix(vec3(1.0, 0.7, 0.28), vec3(0.85, 1.0, 0.45), smoothstep(0.2, 0.8, t));
          vec4 mv = modelViewMatrix*vec4(p, 1.0);
          gl_PointSize = uScale*(1.2 + 1.8*aS.w)*(60.0/-mv.z);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: /* glsl */ `uniform sampler2D uMap; varying float vA; varying vec3 vC;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a*vA; gl_FragColor = vec4(vC*a*1.35, a); }`,
    }));
    m.frustumCulled = false;
    scene.add(m);
    return { m, U };
  })();

  const def = { scene, camera, buildings, tiles, bU, tU, brU, dies, aH, HB, hbmMats, RIV };
  def.update = (t, o = {}) => {
    bU.uTime.value = t; brU.uTime.value = t; tU.uTime.value = t;
    bU.uGrow.value = o.grow ?? 1;
    tU.uGrow.value = o.grow ?? 1;
    bU.uWave.value = o.wave ?? -1;
    tU.uWave.value = o.wave ?? -1;
    bU.uBusyAmt.value = o.busy ?? 0;
    bU.uIdle.value = o.idle ?? 0.25;
    bU.uHi.value = o.hi ?? -1;
    bU.uHiAmt.value = o.hiAmt ?? 0;
    tU.uShow.value = o.tiles ?? 0;
    tiles.visible = (o.tiles ?? 0) > 0.001;
    brU.uAmt.value = o.bridge ?? 1;
    for (const d of dies) d.material.emissiveIntensity = o.dieEmi ?? 0.35;
    const fd = o.fog ?? 0.006;
    scene.fog.density = fd; bU.uFogD.value = fd;
    // 河流
    const feeds = o.feeds || null;
    bU.uFeedMode.value = o.feedMode ?? 0;
    RIV.U.uAmt.value = o.streams ?? 0;
    RIV.m.visible = (o.streams ?? 0) > 0.001;
    RIV.U.uTime.value = t; RIV.U.uGrow.value = o.grow ?? 1;
    RIV.U.uScale.value = Math.max(0.6, gl.renderer.getPixelRatio() * (window.innerHeight / 1080)) * 2.6;
    for (let k = 0; k < 8; k++) {
      const f = feeds ? feeds[k] : 0;
      bU.uFeed.value[k] = f; RIV.U.uFeed.value[k] = f;
      hbmMats[k].emissiveIntensity = (o.hbmGlow ?? 0) * (0.015 + 0.1 * f);
    }
  };
  /** SM i 的屋顶四角（世界坐标） */
  def.roof = (i, out = []) => {
    const s = sms[i], h = (bU.uGrow.value * (aH[i] - 0.02) + 0.02);
    out[0] = new THREE.Vector3(s.x - s.w / 2, h, s.z - s.d / 2);
    out[1] = new THREE.Vector3(s.x + s.w / 2, h, s.z + s.d / 2);
    return out;
  };
  return def;
}
