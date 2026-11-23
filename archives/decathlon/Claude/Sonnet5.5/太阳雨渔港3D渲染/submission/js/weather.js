'use strict';
/* 太阳雨：暖金色细雨丝、滴落水珠、涟漪、室外光柱 */
const BEAMS = [[-2.0, -2.5, 2.1], [6.0, 3.5, 2.5], [-9.5, 9.0, 1.8], [4.0, -7.2, 1.7]];

function buildRain(scene) {
  const N = 4600;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(N * 4); for (let i = 0; i < seeds.length; i++) seeds[i] = R();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = N;
  const beamU = BEAMS.map(b => new THREE.Vector4(b[0], b[1], b[2], 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: U.uTime, uRain: { value: 0.6 }, uGustA: U.uGustA, uGustB: U.uGustB, uSunDir: { value: Env.sunDir }, uBeam: { value: beamU }, uSun: U.uSun, uCloud: U.uCloud, uCloudE: U.uCloudE, uWindScale: { value: 1 } },
    vertexShader: `attribute vec4 aSeed; uniform float uTime; uniform float uRain; uniform vec4 uGustA; uniform vec4 uGustB; uniform vec3 uSunDir; uniform vec4 uBeam[4]; uniform vec4 uCloud; uniform vec2 uCloudE;
      varying float vA; varying float vT; varying float vB;
      float gustAtV(vec2 xz){ float u=dot(xz,uGustA.xy); float tt=uTime-uGustA.w-(u-uGustA.z)/uGustB.x; return uGustB.y*smoothstep(0.,.7,tt)*exp(-max(tt-.7,0.)/2.6)*step(0.,tt); }
      void main(){
        float vis = step(fract(aSeed.x*17.31+aSeed.z*5.17), uRain);
        float speed = 13.0 + aSeed.w*6.0; float H = 27.0;
        vec3 p; p.x=(aSeed.x-0.5)*62.0; p.z=(aSeed.z-0.5)*62.0;
        float ph = fract(aSeed.y - uTime*speed/H);
        p.y = ph*H - 1.2;
        float g = gustAtV(p.xz);
        float sl = 0.12 + 0.60*g;
        vec2 wd = uGustA.xy;
        p.xz += wd*sl*(p.y - 6.0);
        vec3 d = normalize(vec3(wd.x*sl, -1.0, wd.y*sl));
        float len = 0.40 + 0.55*aSeed.w;
        vec3 pos = p + d*len*position.y;
        vec3 cd = normalize(cameraPosition - pos);
        vec3 side = normalize(cross(d, cd));
        float dist = length(cameraPosition - pos);
        float wdt = 0.012 + dist*0.00038;
        pos += side*position.x*wdt;
        // 光柱中的雨丝更亮
        vec2 gq = pos.xz - uSunDir.xz*(pos.y/uSunDir.y);
        float inb = 0.0;
        for(int i=0;i<4;i++){ inb = max(inb, 1.0 - smoothstep(uBeam[i].z*0.55, uBeam[i].z, length(gq - uBeam[i].xy))); }
        vB = inb;
        float flick = 0.7+0.3*sin(uTime*(14.0+aSeed.x*10.0)+aSeed.z*60.0);
        vA = vis * (0.34 + 0.8*inb) * flick;
        vT = position.y;
        if (pos.y < -0.05) vA = 0.0;
        gl_Position = projectionMatrix*viewMatrix*vec4(pos,1.0);
      }`,
    fragmentShader: `uniform float uSun; varying float vA; varying float vT; varying float vB;
      void main(){
        float a = vA*sin(vT*3.14159)*(0.35+0.65*uSun);
        vec3 col = mix(vec3(1.0,0.82,0.42), vec3(1.0,0.92,0.62), vB);
        col = pow(col, vec3(2.2));
        gl_FragColor = vec4(col, min(1.0, a*1.7));
      }`
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.layers.set(LAYER.FX); m.renderOrder = 30;
  scene.add(m);
  Env.rainMat = mat;
}

function buildDrips(scene) {
  const NMAX = 64;
  const geo = new THREE.SphereGeometry(1, 6, 5);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#f4fdff', toneMapped: false, transparent: true, opacity: 0.9 }), NMAX);
  im.layers.set(LAYER.FX); im.frustumCulled = false; im.count = 0; scene.add(im);
  const drops = [], m4 = new M4(), q = new Q4(), sv = new V3(), pv = new V3();
  // 船舷滴水（动态源）
  const dyn = [];
  for (const b of Boats) {
    const L = b.cfg.L, B = b.cfg.B;
    for (const [lx, lz] of [[B * 0.5, L * 0.1], [-B * 0.5, -L * 0.2], [B * 0.4, -L * 0.35], [-B * 0.3, L * 0.3]]) dyn.push({ boat: b.g, local: new V3(lx * 0.97, 0.55, lz), next: rnd(0, 4), rate: 0.2 });
  }
  const tmp = new V3();
  let ra = 0, rp = 0;
  Systems.push((dt, t) => {
    // 雨点溅起的涟漪（水面 + 水洼）
    const rd = Env.rainNow;
    ra += dt * (18 * rd + 3 + 25 * Env.windAt(0, 0) * 0.2);
    while (ra > 1) { ra -= 1; Ripples.add(rnd(-5.8, 13.8), rnd(-13.8, 5.8), rnd(0.5, 1.0)); }
    rp += dt * (7 * rd + 1);
    while (rp > 1) { rp -= 1; const p = pick(PUDDLES); const a = rnd(0, TAU), r = Math.sqrt(R()) * 0.8; Ripples.add(p.x + Math.cos(a) * p.rx * r, p.z + Math.sin(a) * p.rz * r, rnd(0.5, 0.9)); }
    // 滴水源
    const rate = 0.55 + 0.9 * rd;
    for (const s of DripSources) {
      s.next -= dt * rate * s.rate * 2.0;
      if (s.next <= 0 && drops.length < NMAX) { s.next = rnd(0.6, 1.4); drops.push({ x: s.x, y: s.y, z: s.z, vy: 0, land: s.landY, rip: s.ripple, big: s.big }); }
    }
    for (const s of dyn) {
      s.next -= dt * rate * s.rate * 2.0;
      if (s.next <= 0 && drops.length < NMAX) { s.next = rnd(0.7, 1.6); tmp.copy(s.local); s.boat.localToWorld(tmp); drops.push({ x: tmp.x, y: tmp.y, z: tmp.z, vy: 0, land: 0.0, rip: true, big: 1 }); }
    }
    let n = 0;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]; d.vy -= 9.0 * dt; d.y += d.vy * dt;
      if (d.y <= d.land) {
        if (d.rip) Ripples.add(d.x, d.z, 0.9);
        drops.splice(i, 1); continue;
      }
    }
    for (const d of drops) {
      const sc = 0.028 * d.big; pv.set(d.x, d.y, d.z); sv.set(sc, sc * Math.min(3.2, 1 + Math.abs(d.vy) * 0.6), sc);
      m4.compose(pv, q, sv); im.setMatrixAt(n++, m4);
    }
    im.count = n; im.instanceMatrix.needsUpdate = true;
  });
}

function buildSunBeams(scene) {
  const sd = Env.sunDir, H = 16;
  for (const [cx, cz, r] of BEAMS) {
    const ox = cx + sd.x * (H / sd.y), oz = cz + sd.z * (H / sd.y);
    const top = [new V3(ox - r, H, oz - r * 0.2), new V3(ox + r * 0.2, H, oz - r), new V3(ox + r, H, oz + r * 0.2), new V3(ox - r * 0.2, H, oz + r)];
    const dir = sd.clone().negate();
    scene.add(makeShaft(top, dir, H / sd.y, { amt: 0.2, color: '#ffd486', pow: 1.0, fadeTop: true, normal: true }));
  }
}

var buildWeather = function (scene) {
  buildRain(scene); buildDrips(scene); buildSunBeams(scene);
  Systems.push((dt, t) => {
    Env.rainMat.uniforms.uRain.value = Env.rainNow;
    updateLightFx(dt, t);
  });
};

/* 暖金色的星芒闪光：水面粼光、船舷与雨珠上间歇一闪 */
function buildGlints(scene) {
  const c = mkCanvas(64, 64), x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 14); g.addColorStop(0, 'rgba(255,248,214,1)'); g.addColorStop(1, 'rgba(255,230,160,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const gv = x.createLinearGradient(32, 0, 32, 64); gv.addColorStop(0, 'rgba(255,236,170,0)'); gv.addColorStop(0.5, 'rgba(255,250,225,0.95)'); gv.addColorStop(1, 'rgba(255,236,170,0)');
  x.fillStyle = gv; x.fillRect(30.5, 0, 3, 64);
  const gh = x.createLinearGradient(0, 32, 64, 32); gh.addColorStop(0, 'rgba(255,236,170,0)'); gh.addColorStop(0.5, 'rgba(255,250,225,0.95)'); gh.addColorStop(1, 'rgba(255,236,170,0)');
  x.fillStyle = gh; x.fillRect(0, 30.5, 64, 3);
  const tex = canvasTex(c);
  const N = 30, sprites = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color: '#ffe7a8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(m); s.layers.set(LAYER.FX); s.renderOrder = 25; scene.add(s);
    sprites.push({ s, ph: rnd(0, 6.28), rate: rnd(0.5, 1.4), life: 0, kind: 0 });
  }
  const spots = () => {
    const r = R();
    if (r < 0.62) return [rnd(-5.5, 13.5), 0.04, rnd(-13, 5.5)];                 // 水面
    if (r < 0.8) { const b = pick(Boats); return [b.g.position.x + rnd(-0.4, 0.4), 0.8, b.g.position.z + rnd(-1.8, 1.8)]; }   // 船顶/舷
    const p = pick(PUDDLES); return [p.x + rnd(-0.5, 0.5), QH + 0.05, p.z + rnd(-0.4, 0.4)];                      // 水洼
  };
  sprites.forEach(o => { const p = spots(); o.s.position.set(...p); });
  Systems.push((dt, t) => {
    for (const o of sprites) {
      const k = Math.sin(t * o.rate + o.ph);
      const on = Math.max(0, k);
      if (k < -0.9 && !o.moved) { const p = spots(); o.s.position.set(...p); o.moved = true; }
      if (k > -0.5) o.moved = false;
      const sun = Env.sunAt(o.s.position.x, o.s.position.z);
      const a = Math.pow(on, 5) * sun;
      o.s.material.opacity = a * 0.95; const sc = 0.15 + 0.5 * a; o.s.scale.set(sc, sc, 1);
    }
  });
}
const _bwOld = buildWeather;
buildWeather = function (scene) { _bwOld(scene); buildGlints(scene); };

/* 水下气泡 + 候船室热水壶的蒸汽：细小的“生活气息” */
function buildAmbientBits(scene) {
  const NB = 36, geo = new THREE.SphereGeometry(1, 6, 5);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#e8fbff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }), NB);
  im.layers.set(LAYER.FX); im.frustumCulled = false; im.renderOrder = 9; scene.add(im);
  const src = [[3.9, -3.5], [10.8, 2.3], [-3.1, -1.0], [11.8, 10.4], [8.2, -5.5], [1.5, 3.8]];
  const bs = []; for (let i = 0; i < NB; i++) { const s = src[i % src.length]; bs.push({ x: s[0] + rnd(-0.4, 0.4), z: s[1] + rnd(-0.4, 0.4), y: rnd(-2.7, -0.2), v: rnd(0.25, 0.5), r: rnd(0.018, 0.04), ph: rnd(0, 6.3), s }); }
  const m4 = new M4(), q = new Q4(), sv = new V3(), pv = new V3();
  // 蒸汽
  const sprites = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    sp.layers.set(LAYER.FX); sp.renderOrder = 26; scene.add(sp); sprites.push({ sp, t: i / 6 });
  }
  Systems.push((dt, t) => {
    for (let i = 0; i < NB; i++) {
      const b = bs[i]; b.y += b.v * dt;
      if (b.y > -0.05) { b.y = rnd(-2.8, -2.5); b.x = b.s[0] + rnd(-0.4, 0.4); b.z = b.s[1] + rnd(-0.4, 0.4); }
      pv.set(b.x + Math.sin(t * 1.7 + b.ph) * 0.06, b.y, b.z + Math.cos(t * 1.3 + b.ph) * 0.05); sv.set(b.r, b.r, b.r);
      m4.compose(pv, q, sv); im.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true;
    for (const s of sprites) {
      s.t = (s.t + dt * 0.28) % 1;
      s.sp.position.set(-13.0 + Math.sin(s.t * 6 + t) * 0.04 + s.t * 0.12, 1.92 + s.t * 0.55, 1.26);
      const a = Math.sin(s.t * Math.PI); s.sp.material.opacity = a * 0.32; const sc = 0.1 + s.t * 0.22; s.sp.scale.set(sc, sc, 1);
    }
  });
}
const _bw2 = buildWeather;
buildWeather = function (scene) { _bw2(scene); buildAmbientBits(scene); };
