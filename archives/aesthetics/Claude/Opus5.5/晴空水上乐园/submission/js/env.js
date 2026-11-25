'use strict';
/* ==========================================================================
   Environment: sky dome, cumulus clouds, sea, far land, ridge, city skyline
   ========================================================================== */
(function () {
  const P = window.P;
  const G = P.GLSL;

  /* ---------------------------------------------------------------- sky dome */
  P.makeSky = function () {
    const mat = new THREE.ShaderMaterial({
      uniforms: P.U,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `varying vec3 vD; ${G.COMMON}
      void main(){
        vec3 d = normalize(vD);
        vec3 c = skyColor(d);
        // cirrus: thin wispy streaks high in the sky
        if (d.y > 0.05) {
          vec2 p = d.xz / (d.y + 0.15);
          vec2 q = vec2(p.x * 0.9 + p.y * 0.45, p.y * 2.6 - p.x * 0.3) * 1.3 + vec2(uTime * 0.0015, 0.0);
          float n = fbm(q * 1.2 + vec2(0.0, fbm(q * 0.7) * 1.6));
          float streak = smoothstep(0.55, 0.85, n) * smoothstep(0.08, 0.35, d.y) * (1.0 - smoothstep(0.75, 1.0, d.y));
          float band = smoothstep(0.2, 0.6, fbm(p * 0.35 + 3.0));
          c = mix(c, vec3(0.97, 0.99, 1.0) * 1.05, streak * band * 0.45);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(30000, 48, 24), mat);
    m.frustumCulled = false;
    m.renderOrder = -1000;
    m.onBeforeRender = (r, s, cam) => m.position.copy(cam.position);
    return m;
  };

  /* ---------------------------------------------------------------- clouds (puff impostors) */
  const CLOUD_VS = `
  attribute vec4 iC;  // centre xyz, radius
  attribute vec4 iP;  // base y, top y, seed, brightness
  uniform vec3 uWindOff;
  varying vec2 vUv;
  varying vec4 vC;
  varying vec4 vP;
  varying vec3 vCam;
  void main(){
    vec3 c = iC.xyz + uWindOff;
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = c + (camR * position.x + camU * position.y) * iC.w * 1.08;
    vUv = position.xy * 1.08;
    vC = vec4(c, iC.w); vP = iP;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
  const CLOUD_FS = `
  varying vec2 vUv;
  varying vec4 vC;
  varying vec4 vP;
  ${G.COMMON}
  void main(){
    float r2 = dot(vUv, vUv);
    float ang = atan(vUv.y, vUv.x);
    float wob = 1.0 + (vnoise(vec2(ang * 2.5 + vP.z * 10.0, vP.z * 3.0)) - 0.5) * 0.12;
    float rr = sqrt(r2) / wob;
    if (rr > 1.0) discard;
    // sphere normal in view space -> world
    vec3 nv = vec3(vUv / wob, sqrt(max(1.0 - rr * rr, 0.0)));
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 camF = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    vec3 n = normalize(camR * nv.x + camU * nv.y + camF * nv.z);
    vec3 wp = vC.xyz + n * vC.w;
    // flat bottom
    float base = vP.x;
    float below = base - wp.y;
    if (below > vC.w * 0.05) discard;
    float hgt = clamp((wp.y - base) / max(vP.y - base, 1.0), 0.0, 1.0);
    float ndl = dot(n, uSunDir);
    float lit = smoothstep(-0.35, 0.55, ndl);
    vec3 shadowC = vec3(0.60, 0.70, 0.88);
    vec3 baseC = vec3(0.70, 0.78, 0.92);
    vec3 litC = vec3(1.04, 1.03, 1.0);
    vec3 col = mix(shadowC, litC, lit);
    col = mix(baseC, col, smoothstep(0.0, 0.25, hgt) * 0.75 + 0.25);
    // flat underside band
    col = mix(col, baseC * 0.95, smoothstep(vC.w * 0.25, -vC.w * 0.02, wp.y - base) * 0.75);
    // rim light (silver lining) on silhouette
    vec3 vd = normalize(cameraPosition - wp);
    float rim = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
    float sunBehind = max(dot(-vd, uSunDir), 0.0);
    col += vec3(1.0, 0.98, 0.92) * rim * (0.35 + sunBehind * 0.9) * (0.4 + 0.6 * lit);
    col *= vP.w;
    // aerial haze
    float d = length(wp - cameraPosition);
    vec3 fc = mix(skyColor(normalize(vec3(wp - cameraPosition) * vec3(1.0, 0.3, 1.0))), uFogCol, 0.35);
    col = mix(col, fc, clamp(1.0 - exp(-d * 0.000075), 0.0, 0.72));
    float edge = 1.0 - smoothstep(0.82, 1.0, rr);
    float a = edge * smoothstep(vC.w * 0.05, -vC.w * 0.02, below);
    gl_FragColor = vec4(col, a);
  }`;

  P.makeClouds = function () {
    const rnd = P.rng(4242);
    const puffs = [];
    const bigClouds = [];
    // tower cumulus: (x, z, base y, width, height)
    const defs = [
      [-1800, -5200, 520, 1500, 1900], [1400, -4600, 480, 1300, 1500], [-5200, -2400, 520, 1600, 1300],
      [4400, -3000, 500, 1500, 1700], [5600, 1800, 520, 1300, 1100], [-4800, 3200, 520, 1300, 900],
      [300, -7600, 560, 1800, 1400], [-200, 5600, 520, 1600, 1000], [3000, -6800, 520, 1300, 1200],
      [-3400, -6400, 540, 1400, 1300],
      // smaller fair-weather cumulus
      [-900, -2300, 650, 420, 260], [1200, -2000, 700, 500, 300], [2600, -1200, 680, 450, 260],
      [-2600, -600, 700, 520, 300], [2000, 900, 720, 420, 220], [-1600, 1700, 700, 460, 240], [500, -3200, 680, 600, 340],
    ];
    for (const d of defs) {
      const [cx, cz, by, w, h] = d;
      const n = Math.round(14 + (w / 1600) * 34 + (h / 1900) * 20);
      bigClouds.push({ x: cx, y: by + h * 0.45, z: cz, r: Math.max(w, h) * 0.5 });
      for (let i = 0; i < n; i++) {
        // stacked dome: height fraction u, radial spread shrinks with height
        const u = Math.pow(rnd(), 1.25);
        const spread = (1 - u * 0.62) * w * 0.5;
        const a = rnd() * Math.PI * 2;
        const rr = Math.sqrt(rnd()) * spread;
        const pr = (0.16 + rnd() * 0.12) * w * (1 - u * 0.35);
        const y = by + u * h * 0.95 + pr * 0.25;
        puffs.push([cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr * 0.75, pr, by, by + h, rnd(), 0.97 + rnd() * 0.06]);
      }
      // base layer for a flat bottom
      for (let i = 0; i < Math.round(6 + w / 160); i++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * w * 0.42;
        const pr = (0.14 + rnd() * 0.08) * w;
        puffs.push([cx + Math.cos(a) * rr, by + pr * 0.55, cz + Math.sin(a) * rr * 0.75, pr, by, by + h, rnd(), 0.96]);
      }
    }
    const N = puffs.length;
    const base = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const iC = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    const iP = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    iC.setUsage(THREE.DynamicDrawUsage); iP.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iC', iC); geo.setAttribute('iP', iP);
    geo.instanceCount = N;
    const uWindOff = { value: new THREE.Vector3() };
    const mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, P.U, { uWindOff }),
      vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS,
      transparent: true, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -900;
    const order = new Uint32Array(N);
    const dist = new Float32Array(N);
    for (let i = 0; i < N; i++) order[i] = i;
    let lastCam = new THREE.Vector3(1e9, 0, 0);
    function sort(cam) {
      const cp = cam.position;
      if (cp.distanceToSquared(lastCam) < 4) return;
      lastCam.copy(cp);
      for (let i = 0; i < N; i++) { const p = puffs[i]; dist[i] = (p[0] - cp.x) ** 2 + (p[1] - cp.y) ** 2 + (p[2] - cp.z) ** 2; }
      const arr = Array.from(order);
      arr.sort((a, b) => dist[b] - dist[a]);
      for (let i = 0; i < N; i++) {
        const p = puffs[arr[i]];
        iC.array[i * 4] = p[0]; iC.array[i * 4 + 1] = p[1]; iC.array[i * 4 + 2] = p[2]; iC.array[i * 4 + 3] = p[3];
        iP.array[i * 4] = p[4]; iP.array[i * 4 + 1] = p[5]; iP.array[i * 4 + 2] = p[6]; iP.array[i * 4 + 3] = p[7];
      }
      iC.needsUpdate = true; iP.needsUpdate = true;
    }
    mesh.onBeforeRender = (r, s, cam) => sort(cam);
    const wind = new THREE.Vector3(2.2, 0, -1.2);
    P.cloudsUpdate = function (t) {
      uWindOff.value.copy(wind).multiplyScalar(t);
      // reflection blobs from park centre
      const arr = P.U.uSkyCloud.value;
      for (let i = 0; i < arr.length; i++) {
        const c = bigClouds[i];
        if (!c) { arr[i].set(0, 1, 0, 0); continue; }
        const x = c.x + uWindOff.value.x, y = c.y, z = c.z + uWindOff.value.z;
        const d = Math.hypot(x, y, z);
        arr[i].set(x / d, y / d, z / d, Math.atan(c.r * 0.8 / d));
      }
    };
    P.cloudsUpdate(0);
    return mesh;
  };

  /* ---------------------------------------------------------------- cloud shadows (overhead clouds) */
  P.cloudShadowDefs = [
    // x0, z0, radius, strength, speed multiplier, phase
    [-660, 60, 78, 0.32, 1.0, 0], [-400, -70, 92, 0.3, 1.0, 0], [-140, 95, 62, 0.3, 1.0, 0],
    [120, -55, 86, 0.32, 1.0, 0], [390, 80, 66, 0.28, 1.0, 0], [640, -15, 82, 0.3, 1.0, 0],
  ];
  P.updateCloudShadows = function (t) {
    const arr = P.U.uClouds.value;
    const wx = 3.4, wz = 0.0; // m/s, drifting east across the park
    const span = 2400;
    P.cloudShadowDefs.forEach((d, i) => {
      let x = d[0] + wx * t * d[4];
      let z = d[1] + wz * t * d[4];
      // wrap along wind direction so shadows keep passing over the park (wrap happens far offshore)
      const k = Math.floor((x + 1200) / span);
      x -= k * span; z -= k * span * (wz / wx);
      arr[i].set(x, z, d[2], d[3]);
    });
  };

  /* ---------------------------------------------------------------- sea */
  P.makeSea = function () {
    const mat = new THREE.ShaderMaterial({
      uniforms: P.U,
      vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying vec3 vWorld; ${G.COMMON} ${G.SHADOW}
      float coastD(vec2 p){
        float d;
        if (p.x > 158.0 && p.y < -108.0) d = length(p - vec2(158.0, -108.0)) - 20.0;
        else d = max(-128.0 - p.y, p.x - 178.0);
        if (p.x < -172.0) d = min(d, -(p.y + 168.0 + (p.x + 172.0) * 0.6));
        if (p.x < -900.0) d = min(d, -(p.y + 600.0 + (p.x + 900.0) * 0.35));
        return d;
      }
      void main(){
        vec2 p = vWorld.xz;
        float d = coastD(p);
        float t = uTime;
        vec3 V = normalize(cameraPosition - vWorld);
        float dist = length(cameraPosition - vWorld);
        // ripples (normal from noise gradients), fading with distance
        float fade = 1.0 - smoothstep(150.0, 2500.0, dist);
        vec2 q = p * 0.22 + vec2(t * 0.15, t * 0.08);
        float e = 0.15;
        float n0 = fbm(q), nx = fbm(q + vec2(e, 0.0)), nz = fbm(q + vec2(0.0, e));
        vec2 q2 = p * 0.9 + vec2(-t * 0.35, t * 0.22);
        float m0 = vnoise(q2), mx = vnoise(q2 + vec2(e, 0.0)), mz = vnoise(q2 + vec2(0.0, e));
        vec3 N = normalize(vec3(-((nx - n0) * 0.28 + (mx - m0) * 0.1) / e * fade, 1.0, -((nz - n0) * 0.28 + (mz - m0) * 0.1) / e * fade));
        vec3 shallow = vec3(0.16, 0.80, 0.80);
        vec3 midc = vec3(0.03, 0.56, 0.84);
        vec3 deep = vec3(0.012, 0.25, 0.62);
        vec3 col = mix(shallow, midc, smoothstep(2.0, 70.0, d));
        col = mix(col, deep, smoothstep(70.0, 1400.0, d));
        float cs = cloudShadow(p);
        col *= (uSkyAmb * 0.55 + uSunCol * 0.62 * cs);
        float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 R = reflect(-V, N);
        R.y = abs(R.y);
        vec3 sky = skyColor(R);
        sky = mix(sky, vec3(1.0), skyCloudMask(R) * 0.65);
        col = mix(col, sky, clamp(F * 0.9, 0.0, 0.9));
        // sun glitter
        vec3 H = normalize(uSunDir + V);
        float sp = pow(max(dot(N, H), 0.0), 900.0) * 12.0;
        float glit = smoothstep(0.9, 0.98, vnoise(p * 3.1 + vec2(t * 0.9, -t * 0.6))) * pow(max(dot(N, H), 0.0), 220.0) * 3.0;
        col += uSunCol * (sp + glit * fade) * cs;
        // shore foam bands
        float wave = sin(d * 1.6 - t * 1.4 + vnoise(p * 0.08) * 6.0);
        float foam = smoothstep(2.5, 0.0, d) + smoothstep(0.75, 1.0, wave) * smoothstep(9.0, 2.0, d) * 0.7;
        vec2 cell = floor(p / 0.25);
        float fc = step(0.35, hash12(cell + floor(t * 1.5)));
        col = mix(col, vec3(0.95, 1.0, 1.0), clamp(foam * fc, 0.0, 1.0) * 0.85 * smoothstep(-1.0, 0.0, d));
        col = applyFog(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
      }`,
    });
    const g = new THREE.PlaneGeometry(60000, 60000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.y = P.L.seaY;
    m.frustumCulled = false;
    m.renderOrder = -500;
    return m;
  };

  /* ---------------------------------------------------------------- far land (outside terrain grid) */
  const LAND_FS = `varying vec3 vWorld; varying vec3 vCol; varying vec3 vN; varying float vForest; ${G.COMMON}
  void main(){
    vec3 N = normalize(vN);
    vec2 p = vWorld.xz;
    float d = length(cameraPosition - vWorld);
    // field patchwork (grid-aligned blocks) and forest canopy texture
    vec2 cell = floor(p / 22.0);
    float h = hash12(cell);
    vec3 a = vCol;
    float fieldK = (1.0 - vForest) * smoothstep(3000.0, 900.0, d);
    a *= 1.0 + (h - 0.5) * 0.16 * fieldK;
    float canopy = fbm(p * 0.09) * 0.6 + vnoise(p * 0.45) * 0.4;
    a = mix(a, a * (0.78 + canopy * 0.42), vForest * smoothstep(2600.0, 500.0, d));
    float ndl = max(dot(N, uSunDir), 0.0);
    float cs = cloudShadow(p);
    vec3 col = a * (mix(uGndAmb, uSkyAmb, N.y * 0.5 + 0.5) + uSunCol * ndl * 1.05 * cs);
    // stronger, bluer aerial perspective for land
    vec3 dv = vWorld - cameraPosition;
    float f = 1.0 - exp(-max(d - 80.0, 0.0) * 0.0003);
    vec3 haze = mix(vec3(0.66, 0.84, 0.97), skyColor(normalize(vec3(dv.x, 0.03, dv.z))), 0.55);
    col = mix(col, haze, clamp(f, 0.0, 0.85));
    gl_FragColor = vec4(col, 1.0);
  }`;
  const LAND_VS = `attribute vec3 color; attribute float forest; varying vec3 vWorld; varying vec3 vCol; varying vec3 vN; varying float vForest;
  void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; vCol = color; vForest = forest; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
  P.LAND_VS = LAND_VS;
  // land height outside the park grid (metres)
  function landH(x, z) {
    // coast: sea east of x=178 and north of the coast line
    let dl = Math.min(z + 128, 178 - x);
    if (x < -172) dl = Math.max(dl, z + 168 + (x + 172) * 0.6);
    if (x < -900) dl = Math.max(dl, z + 600 + (x + 900) * 0.35);
    if (dl < 0) return -6 + Math.max(-12, dl * 0.05);
    const dist = Math.max(0, Math.max(-196 - x, z - 250, Math.hypot(Math.max(0, -196 - x), Math.max(0, z - 250))));
    const rise = P.smooth(0, 700, dist);
    let h = (P.fbm2(x * 0.0022, z * 0.0022, 4) - 0.45) * 46 * rise + (P.fbm2(x * 0.008 + 7, z * 0.008, 3) - 0.5) * 8 * rise;
    // low ridge far west (long, gentle)
    const rx = x + 3700 + Math.sin(z * 0.00055) * 420;
    const ridge = Math.exp(-Math.pow(rx / 900, 2)) * (115 + 60 * P.fbm2(z * 0.0009, 2.7, 3));
    h = Math.max(h, ridge);
    // south hills
    const sh = Math.exp(-Math.pow((z - 3600) / 1300, 2)) * (60 + 50 * P.fbm2(x * 0.0012, 9.1, 3));
    h = Math.max(h, sh);
    h *= P.smooth(0, 60, dl);
    if (dist < 2) h = Math.min(h, 0);
    return Math.max(h, -0.5);
  }
  P.landH = landH;
  P.makeFarLand = function () {
    const group = new THREE.Group();
    const mat = new THREE.ShaderMaterial({ uniforms: P.U, vertexShader: LAND_VS, fragmentShader: LAND_FS });
    // variable-resolution grid: fine near the park, coarse far away
    const xs = [], zs = [];
    const push = (arr, a, b, st) => { for (let v = a; v < b; v += st) arr.push(v); };
    push(xs, -9000, -2400, 120); push(xs, -2400, -700, 40); push(xs, -700, -196, 12); push(xs, -196, 200, 8); push(xs, 200, 2600, 60); xs.push(2600);
    push(zs, -4000, -700, 80); push(zs, -700, -150, 20); push(zs, -150, 250, 8); push(zs, 250, 900, 12); push(zs, 900, 3200, 40); push(zs, 3200, 9000, 120); zs.push(9000);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), forest = new Float32Array(nx * nz);
    const cField = new THREE.Color('#9ee05c'), cMeadow = new THREE.Color('#84d356'), cForest = new THREE.Color('#47ab5c'), cDry = new THREE.Color('#c2e275'), cSand = new THREE.Color('#f2e2bd'), cTown = new THREE.Color('#e9eef2'), cRidge = new THREE.Color('#58ad64');
    const tmp = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j];
      const k = i + j * nx;
      const inGrid = x > -195 && x < 195 && z > -149 && z < 249;
      let h = inGrid ? -8 : landH(x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const fn = P.fbm2(x * 0.004 + 3, z * 0.004 - 2, 3);
      const fo = P.smooth(0.5, 0.62, fn) * (h > 0 ? 1 : 0);
      let c = tmp.copy(cField).lerp(cMeadow, P.smooth(0.35, 0.6, P.fbm2(x * 0.01, z * 0.01, 2)));
      c.lerp(cDry, P.smooth(0.62, 0.8, P.fbm2(x * 0.006 + 11, z * 0.006, 2)) * 0.6);
      c.lerp(cForest, fo);
      c.lerp(cRidge, P.smooth(40, 110, h) * 0.7);
      // small towns (light blocks) here and there
      const tn = P.fbm2(x * 0.0035 - 20, z * 0.0035 + 4, 2);
      if (tn > 0.7 && h < 25 && Math.hypot(x, z) > 600) c.lerp(cTown, P.smooth(0.7, 0.78, tn) * 0.75);
      // avenue/road south from the gate and a coastal road west
      if (Math.abs(x) < 7 && z > 240) c.set('#cdd6dd');
      if (Math.abs(z - 420 - Math.sin(x * 0.002) * 60) < 6 && x < 0) c.set('#d6dde2');
      {
        let dl = Math.min(z + 128, 178 - x);
        if (x < -172) dl = Math.max(dl, z + 168 + (x + 172) * 0.6);
        if (x < -900) dl = Math.max(dl, z + 600 + (x + 900) * 0.35);
        if (dl > -2 && dl < 14) c.lerp(cSand, 0.75 * (1 - P.smooth(6, 14, dl)));
      }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      forest[k] = fo;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let q = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = i + j * nx, b = a + 1, c = a + nx, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('forest', new THREE.BufferAttribute(forest, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const land = new THREE.Mesh(g, mat);
    land.frustumCulled = false;
    group.add(land);
    // NE far shore with city skyline
    {
      const shore = new THREE.BufferGeometry();
      const sp = [], sc = [], sn = [], si = [];
      const c = new THREE.Color('#9fd36a');
      // land strip across the bay (north-east), slightly raised
      const pts = [[900, -4200], [5200, -4200], [5200, -1400], [2600, -1700], [1700, -2300], [1100, -3000]];
      const b = 0;
      for (const q of pts) { sp.push(q[0], 2, q[1]); sc.push(c.r, c.g, c.b); sn.push(0, 1, 0); }
      si.push(0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4);
      shore.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      shore.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
      shore.setAttribute('normal', new THREE.Float32BufferAttribute(sn, 3));
      shore.setAttribute('forest', new THREE.Float32BufferAttribute(new Float32Array(sp.length / 3), 1));
      shore.setIndex(si);
      const sm = new THREE.Mesh(shore, mat); sm.frustumCulled = false; group.add(sm);
      // buildings
      const rnd = P.rng(77);
      const bp = [], bc = [], bn = [], bi = [];
      const cw = new THREE.Color('#f6fbff'), cb = new THREE.Color('#bfe2f7'), cg = new THREE.Color('#9fd0f0');
      const box = (x, z, w, d, h, color) => {
        const b0 = bp.length / 3;
        const xs = [x - w / 2, x + w / 2], zs = [z - d / 2, z + d / 2];
        const faces = [
          [[1, 0, 0], [[1, 0, 0], [1, h, 0], [1, h, 1], [1, 0, 1]]],
          [[-1, 0, 0], [[0, 0, 1], [0, h, 1], [0, h, 0], [0, 0, 0]]],
          [[0, 0, 1], [[1, 0, 1], [1, h, 1], [0, h, 1], [0, 0, 1]]],
          [[0, 0, -1], [[0, 0, 0], [0, h, 0], [1, h, 0], [1, 0, 0]]],
          [[0, 1, 0], [[0, h, 0], [0, h, 1], [1, h, 1], [1, h, 0]]],
        ];
        for (const f of faces) {
          const v0 = bp.length / 3;
          for (const v of f[1]) { bp.push(xs[v[0]], 2 + v[1], zs[v[2]]); bc.push(color.r, color.g, color.b); bn.push(f[0][0], f[0][1], f[0][2]); }
          bi.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
        }
      };
      for (let i = 0; i < 170; i++) {
        const u = rnd();
        const x = 1500 + u * 3200 + (rnd() - 0.5) * 300;
        const zEdge = -2100 - Math.max(0, 2600 - x) * 0.35;
        const z = zEdge - 60 - rnd() * 900;
        const centre = Math.exp(-Math.pow((x - 2900) / 900, 2));
        const h = 25 + rnd() * 50 + centre * (90 + rnd() * 160);
        const w = 30 + rnd() * 45, d = 30 + rnd() * 45;
        const cc = rnd() < 0.55 ? cw : rnd() < 0.6 ? cb : cg;
        box(x, z, w, d, h, cc);
        if (h > 120 && rnd() < 0.6) box(x, z, w * 0.6, d * 0.6, h + 25 + rnd() * 30, cc);
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
      bg.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
      bg.setIndex(bi);
      const cityMat = new THREE.ShaderMaterial({
        uniforms: P.U, vertexShader: LAND_VS,
        fragmentShader: `varying vec3 vWorld; varying vec3 vCol; varying vec3 vN; ${G.COMMON}
        void main(){
          vec3 N = normalize(vN);
          float ndl = max(dot(N, uSunDir), 0.0);
          vec3 a = vCol;
          if (abs(N.y) < 0.5) {
            float fl = fract(vWorld.y / 3.6);
            float win = smoothstep(0.35, 0.45, fl) * (1.0 - smoothstep(0.8, 0.9, fl));
            a = mix(a, vec3(0.55, 0.78, 0.95), win * 0.55);
          }
          vec3 col = a * (mix(uGndAmb, uSkyAmb, N.y * 0.5 + 0.5) * 1.05 + uSunCol * ndl * 0.95);
          col = applyFog(col, vWorld);
          gl_FragColor = vec4(col, 1.0);
        }`,
      });
      const bm = new THREE.Mesh(bg, cityMat); bm.frustumCulled = false; group.add(bm);
    }
    return group;
  };
})();
