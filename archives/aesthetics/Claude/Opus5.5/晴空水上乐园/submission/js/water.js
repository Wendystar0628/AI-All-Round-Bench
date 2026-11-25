'use strict';
/* ==========================================================================
   Water surfaces: pools, wave pool (analytic waves), lazy river, surf wave
   ========================================================================== */
(function () {
  const P = window.P, V = P.V, G = P.GLSL;
  const W = (P.W = {});

  /* ------------------------------------------------------------ maps (floor height, water level + shore distance) */
  W.buildMaps = function () {
    const T = P.terrain, n = T.W * T.D;
    const floor = new Float32Array(n);
    for (let i = 0; i < n; i++) floor[i] = T.H[i] * V;
    // shore distance (in metres) for water columns: chamfer transform
    const WL = P.waterLevel;
    const big = 99;
    const dist = new Float32Array(n);
    for (let i = 0; i < n; i++) dist[i] = WL[i] > -50 ? big : 0;
    const w = T.W, h = T.D, a = V, b = V * Math.SQRT2;
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = i + j * w; if (dist[k] === 0) continue;
      dist[k] = Math.min(dist[k], dist[k - 1] + a, dist[k - w] + a, dist[k - w - 1] + b, dist[k - w + 1] + b);
    }
    for (let j = h - 2; j > 0; j--) for (let i = w - 2; i > 0; i--) {
      const k = i + j * w; if (dist[k] === 0) continue;
      dist[k] = Math.min(dist[k], dist[k + 1] + a, dist[k + w] + a, dist[k + w + 1] + b, dist[k + w - 1] + b);
    }
    W.shoreDist = dist;
    const wm = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { wm[i * 2] = WL[i]; wm[i * 2 + 1] = Math.min(dist[i], 20); }
    const ft = new THREE.DataTexture(floor, T.W, T.D, THREE.RedFormat, THREE.FloatType);
    ft.minFilter = ft.magFilter = THREE.LinearFilter; ft.needsUpdate = true;
    const wt = new THREE.DataTexture(wm, T.W, T.D, THREE.RGFormat, THREE.FloatType);
    wt.minFilter = wt.magFilter = THREE.NearestFilter; wt.needsUpdate = true;
    P.U.uFloorMap.value = ft;
    P.U.uWaterMap.value = wt;
    P.U.uMapXf.value.set(T.x0 * V, T.z0 * V, 1 / (T.W * V), 1 / (T.D * V));
    W.floorArr = floor;
  };
  W.shoreAt = function (x, z) { const k = P.colIndex(x, z); return k < 0 ? 0 : W.shoreDist[k]; };

  /* ------------------------------------------------------------ wave pool model (shared JS + GLSL) */
  const WP = (W.wave = { NW: 5, A: new Float32Array(5), R: new Float32Array(5), WF: new Float32Array(5), WB: new Float32Array(5), swell: 0, shore: 88.5 });
  // precompute crest radius as function of travel time (shallow-water speed)
  (function () {
    const tab = [];
    let r = 33.5, t = 0;
    const dt = 0.05;
    while (r < 112 && t < 60) {
      const depth = Math.max(-0.1 - P.waveFloor(r), 0.0);
      const c = Math.max(1.3, Math.sqrt(9.81 * Math.max(depth, 0.05)) * 0.95);
      tab.push(r);
      r += c * dt; t += dt;
    }
    WP.tab = tab; WP.dt = dt;
  })();
  WP.crestR = function (tau) {
    if (tau <= 0) return 33.5 - 0.0;
    const f = tau / WP.dt, i = Math.floor(f);
    if (i >= WP.tab.length - 1) return WP.tab[WP.tab.length - 1] + (tau - (WP.tab.length - 1) * WP.dt) * 1.3;
    return WP.tab[i] + (WP.tab[i + 1] - WP.tab[i]) * (f - i);
  };
  // wave set state for time t given set start times
  WP.update = function (t, start) {
    const st = start;
    WP.swell = 0;
    for (let k = 0; k < WP.NW; k++) { WP.A[k] = 0; WP.R[k] = -100; WP.WF[k] = 3; WP.WB[k] = 6; }
    if (st == null) return;
    const lt = t - st;
    // pre-swell: surface bulges up gently before the first wave
    WP.swell = 0.14 * P.smooth(-3.0, 0.0, lt) * (1 - P.smooth(1.5, 5.0, lt));
    for (let k = 0; k < WP.NW; k++) {
      const tau = lt - 1.2 - k * 3.4;
      if (tau < -0.6) continue;
      const r = WP.crestR(Math.max(tau, 0));
      const A0 = 0.3 + 0.1 * k;
      const grow = P.smooth(-0.6, 1.4, tau);
      // shoaling: grows a bit toward shallow water, then breaks & spends itself on the beach
      const shoal = 1 + 0.35 * P.smooth(60, 84, r);
      const spend = Math.exp(-Math.max(r - WP.shore, 0) / 5.5);
      WP.A[k] = A0 * grow * shoal * spend;
      WP.R[k] = r;
      WP.WF[k] = P.lerp(3.8, 1.3, P.smooth(55, 88, r));
      WP.WB[k] = P.lerp(6.5, 4.0, P.smooth(55, 88, r));
    }
  };
  WP.height = function (x, z) { // relative to level
    const r = Math.hypot(x - P.L.wave.ax, z - P.L.wave.az);
    let h = WP.swell * Math.exp(-Math.pow((r - 40) / 16, 2));
    for (let k = 0; k < WP.NW; k++) {
      if (WP.A[k] <= 0) continue;
      const d = r - WP.R[k];
      const w = d > 0 ? WP.WF[k] : WP.WB[k];
      h += WP.A[k] * Math.exp(-(d * d) / (w * w));
    }
    return h;
  };
  W.waveUniforms = {
    uWA: { value: WP.A }, uWR: { value: WP.R }, uWF: { value: WP.WF }, uWB: { value: WP.WB },
    uSwell: { value: 0 }, uApex: { value: new THREE.Vector2(P.L.wave.ax, P.L.wave.az) },
  };

  /* ------------------------------------------------------------ water shader */
  const WATER_VS = `
  uniform float uKind;
  uniform float uWA[5]; uniform float uWR[5]; uniform float uWF[5]; uniform float uWB[5];
  uniform float uSwell; uniform vec2 uApex;
  attribute vec2 flowUV;
  varying vec3 vWorld;
  varying vec2 vFlowUV;
  varying vec3 vWN;
  varying float vCrest;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    float crest = 0.0;
    if (uKind > 0.5 && uKind < 1.5) {
      vec2 d = w.xz - uApex;
      float r = length(d);
      vec2 dir = d / max(r, 1e-3);
      float h = uSwell * exp(-pow((r - 40.0) / 16.0, 2.0));
      float dh = uSwell * exp(-pow((r - 40.0) / 16.0, 2.0)) * (-2.0 * (r - 40.0) / 256.0);
      for (int k = 0; k < 5; k++) {
        if (uWA[k] <= 0.0) continue;
        float x = r - uWR[k];
        float ww = x > 0.0 ? uWF[k] : uWB[k];
        float g = exp(-(x * x) / (ww * ww));
        h += uWA[k] * g;
        dh += uWA[k] * g * (-2.0 * x / (ww * ww));
        crest = max(crest, exp(-pow((x - 0.25) / 0.85, 2.0)) * smoothstep(0.12, 0.5, uWA[k]));
      }
      w.y += h;
      n = normalize(vec3(-dir.x * dh, 1.0, -dir.y * dh));
    }
    vWorld = w.xyz;
    vFlowUV = flowUV;
    vWN = n;
    vCrest = crest;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
  const WATER_FS = `
  uniform float uKind;    // 0 pool, 1 wave pool, 2 river, 3 spa, 4 surf
  uniform float uLevel;
  uniform float uFlow;    // river flow speed m/s
  uniform sampler2D uFloorMap;
  uniform float uFoamBoost;
  uniform vec4 uFoamSrc[8];
  varying vec3 vWorld;
  varying vec2 vFlowUV;
  varying vec3 vWN;
  varying float vCrest;
  ${G.COMMON}
  ${G.SHADOW}
  ${G.CAUSTIC}
  vec2 mapUV(vec2 xz){ return (xz - uMapXf.xy) * uMapXf.zw; }
  vec2 ripple(vec2 p, float t){
    float e = 0.12;
    vec2 q1 = p * 0.85 + vec2(t * 0.21, t * 0.13);
    vec2 q2 = p * 2.1 + vec2(-t * 0.37, t * 0.29);
    float a0 = vnoise(q1), ax = vnoise(q1 + vec2(e, 0.0)), az = vnoise(q1 + vec2(0.0, e));
    float b0 = vnoise(q2), bx = vnoise(q2 + vec2(e, 0.0)), bz = vnoise(q2 + vec2(0.0, e));
    return vec2((ax - a0) + (bx - b0) * 0.45, (az - a0) + (bz - b0) * 0.45) / e;
  }
  void main(){
    vec2 xz = vWorld.xz;
    float t = uTime;
    vec3 Vd = normalize(cameraPosition - vWorld);
    float dist = length(cameraPosition - vWorld);
    vec2 muv = mapUV(xz);
    float floorY = texture(uFloorMap, muv).r;
    vec2 wm = texture(uWaterMap, muv).rg;
    float shore = wm.y;
    float depth = max(vWorld.y - floorY, 0.0);
    // --- normal
    vec2 rp;
    vec2 flowDir = vec2(0.0);
    if (uKind > 1.5 && uKind < 2.5) {
      // river: ripples advected along the flow (flowUV.x = s, y = lateral)
      vec2 fp = vec2(vFlowUV.x - t * uFlow, vFlowUV.y);
      rp = ripple(fp * 1.2, t * 0.6) * 0.9;
    } else if (uKind > 3.5) {
      vec2 fp = xz + vec2(0.0, t * 3.2);
      rp = ripple(fp * 0.8, t * 1.4) * 1.3;
    } else {
      rp = ripple(xz, t);
    }
    float rs = (uKind > 2.5 && uKind < 3.5) ? 0.55 : 0.32;
    float fade = 1.0 - smoothstep(60.0, 420.0, dist) * 0.7;
    vec3 N = normalize(vWN + vec3(-rp.x, 0.0, -rp.y) * rs * fade);
    // --- body colour by depth
    vec3 shallowC = vec3(0.13, 0.86, 0.88);
    vec3 midC = vec3(0.03, 0.62, 0.90);
    vec3 deepC = vec3(0.01, 0.33, 0.84);
    float k1 = 1.0 - exp(-depth * 1.4);
    float k2 = 1.0 - exp(-max(depth - 0.6, 0.0) * 0.55);
    vec3 wc = mix(shallowC, midC, k1);
    wc = mix(wc, deepC, k2);
    float cs = cloudShadow(xz);
    float sh = shadowAt(vWorld + vec3(0.0, 0.05, 0.0), vec3(0.0, 1.0, 0.0));
    vec3 body = wc * (uSkyAmb * 0.62 + uSunCol * 0.62 * cs * (0.55 + 0.45 * sh));
    float alpha = mix(0.22, 0.9, 1.0 - exp(-depth * 1.25));
    // --- reflection
    float ndv = max(dot(N, Vd), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    vec3 R = reflect(-Vd, N);
    R.y = abs(R.y);
    vec3 sky = skyColor(R);
    sky = mix(sky, vec3(1.02), skyCloudMask(R) * 0.75);
    float cv = caveF(vWorld);
    body *= 1.0 - 0.7 * cv;
    sky *= 1.0 - 0.75 * cv;
    vec3 col = mix(body, sky, F * 0.92);
    alpha = mix(alpha, 1.0, F * 0.85);
    // --- sun highlight & glints
    vec3 Hh = normalize(uSunDir + Vd);
    float nh = max(dot(N, Hh), 0.0);
    float spec = pow(nh, 700.0) * 14.0 + pow(nh, 90.0) * 0.35;
    vec2 gp = xz * 5.0 + vec2(t * 0.35, -t * 0.27);
    float gl = smoothstep(0.78, 0.97, vnoise(gp)) * smoothstep(0.55, 0.95, vnoise(gp * 0.37 + 11.0 + t * 0.12));
    float gfade = 1.0 - smoothstep(0.06, 0.3, length(fwidth(xz)) * 5.0);
    float glint = gl * pow(nh, 18.0) * 6.0 * gfade;
    col += uSunCol * (spec + glint) * cs * (0.3 + 0.7 * sh) * (1.0 - cv);
    alpha = max(alpha, clamp((spec + glint) * 0.5, 0.0, 1.0));
    // --- foam: voxel-grid squares (stepped waterline, crests, sources)
    vec2 cp = xz / 0.25;
    if (uKind > 1.5 && uKind < 2.5) cp = vec2(vFlowUV.x - t * uFlow, vFlowUV.y) / 0.25;
    if (uKind > 3.5) cp = (xz + vec2(0.0, t * 2.6)) / 0.25;
    vec2 cid = floor(cp);
    vec2 cf = fract(cp);
    float rn = hash12(cid);
    float per = 1.6 + rn * 2.2;
    float cyc = t / per + rn * 9.0;
    float life = fract(cyc);
    float gen = floor(cyc);
    float prob = 0.0;
    prob += 0.78 * (1.0 - smoothstep(0.12, 0.5, shore));
    prob += 0.22 * (1.0 - smoothstep(0.5, 1.4, shore));
    if (uKind > 0.5 && uKind < 1.5) {
      prob += vCrest * 1.25;
      float thin = 1.0 - smoothstep(0.02, 0.14, depth);
      prob += thin * smoothstep(-0.05, 0.05, vWorld.y - uLevel) * 0.95;
    }
    if (uKind > 2.5 && uKind < 3.5) prob += 0.12;
    if (uKind > 3.5) prob += 0.14 + 0.95 * exp(-pow((vFlowUV.y - 0.6) / 0.045, 2.0)) + 0.35 * smoothstep(0.66, 0.95, vFlowUV.y);
    for (int i = 0; i < 8; i++) {
      vec4 s = uFoamSrc[i];
      if (s.w <= 0.0) continue;
      float d = length(xz - s.xy);
      prob += s.w * (1.0 - smoothstep(s.z * 0.3, s.z, d));
    }
    prob = clamp(prob * uFoamBoost, 0.0, 0.97);
    float on = step(hash12(cid * 1.31 + gen * 7.7), prob);
    float hs = 0.47 * (1.0 - life * 0.6);
    vec2 dd = abs(cf - 0.5);
    vec2 aa = fwidth(cp) * 0.75;
    float sq = (1.0 - smoothstep(hs - aa.x, hs + aa.x, dd.x)) * (1.0 - smoothstep(hs - aa.y, hs + aa.y, dd.y));
    float fa = sq * on * (1.0 - smoothstep(0.55, 1.0, life)) * smoothstep(0.0, 0.08, life);
    // distant: average foam coverage instead of tiny squares
    float far = smoothstep(0.35, 1.0, max(aa.x, aa.y));
    fa = mix(fa, prob * 0.45, far);
    vec3 foamC = vec3(0.93, 0.99, 1.0) * (uSkyAmb * 0.55 + uSunCol * 0.7 * cs * (0.5 + 0.5 * sh)) * 1.08 * (1.0 - 0.65 * cv);
    col = mix(col, foamC, fa * 0.95);
    alpha = max(alpha, fa * 0.97);
    col = applyFog(col, vWorld);
    gl_FragColor = vec4(col, alpha);
  }`;

  W.makeWaterMaterial = function (kind, level, extra) {
    const u = Object.assign({}, P.U, W.waveUniforms, {
      uKind: { value: kind }, uLevel: { value: level }, uFlow: { value: 1.2 },
      uFoamBoost: { value: 1 },
      uFoamSrc: { value: [] },
    }, extra || {});
    for (let i = 0; i < 8; i++) u.uFoamSrc.value.push(new THREE.Vector4(0, 0, 1, 0));
    return new THREE.ShaderMaterial({
      uniforms: u, vertexShader: WATER_VS, fragmentShader: WATER_FS,
      transparent: true, depthWrite: false,
    });
  };

  /* ------------------------------------------------------------ mesh builders */
  // flat water from mask of columns (pool id), dilated by one cell, merged rows
  function flatMesh(id, level) {
    const T = P.terrain, WID = P.waterId;
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (let j = 0; j < T.D; j++) for (let i = 0; i < T.W; i++) {
      if (WID[i + j * T.W] === id) { if (i < mnx) mnx = i; if (i > mxx) mxx = i; if (j < mnz) mnz = j; if (j > mxz) mxz = j; }
    }
    if (mnx > mxx) return null;
    const pos = [], uv = [], idx = [];
    const inMask = (i, j) => {
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= T.W || jj >= T.D) continue;
        if (WID[ii + jj * T.W] === id) return true;
      }
      return false;
    };
    for (let j = mnz - 1; j <= mxz + 1; j++) {
      let i = mnx - 1;
      while (i <= mxx + 1) {
        if (!inMask(i, j)) { i++; continue; }
        let e = i;
        while (e + 1 <= mxx + 1 && inMask(e + 1, j)) e++;
        const x0 = (i + T.x0) * V, x1 = (e + 1 + T.x0) * V, z0 = (j + T.z0) * V, z1 = (j + 1 + T.z0) * V;
        const b = pos.length / 3;
        pos.push(x0, level, z0, x1, level, z0, x1, level, z1, x0, level, z1);
        uv.push(0, 0, 0, 0, 0, 0, 0, 0);
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
        i = e + 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flowUV', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  // wave pool grid (0.5 m) covering water + beach run-up zone
  function waveMesh() {
    const w = P.L.wave;
    const pos = [], uv = [], idx = [];
    const st = 0.5;
    const x0 = -66, x1 = 66, z0 = -33, z1 = 46;
    const nx = Math.round((x1 - x0) / st), nz = Math.round((z1 - z0) / st);
    const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const inside = (x, z) => {
      const f = P.fan(x, z);
      return Math.abs(f.th) <= w.half + 0.02 && z >= w.backZ - 0.6 && f.r < 104;
    };
    const cellIn = (i, j) => {
      const x = x0 + (i + 0.5) * st, z = z0 + (j + 0.5) * st;
      return inside(x, z) || inside(x - 0.5, z) || inside(x + 0.5, z) || inside(x, z - 0.5) || inside(x, z + 0.5);
    };
    const vtx = (i, j) => {
      const k = i + j * (nx + 1);
      if (vid[k] >= 0) return vid[k];
      vid[k] = pos.length / 3;
      pos.push(x0 + i * st, w.level, z0 + j * st);
      uv.push(0, 0);
      return vid[k];
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!cellIn(i, j)) continue;
      const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i + 1, j + 1), d = vtx(i, j + 1);
      idx.push(a, c, b, a, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flowUV', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  // river ribbon along centreline
  function riverMesh() {
    const path = P.river, lv = P.L.river.level;
    const half = P.L.river.half + 0.6;
    const pos = [], uv = [], idx = [];
    const ds = 0.5, nw = 8;
    const n = Math.ceil(path.len / ds);
    for (let i = 0; i <= n; i++) {
      const s = i * ds;
      const p = path.at(s);
      const nx = -p.tz, nz = p.tx; // left normal
      for (let j = 0; j <= nw; j++) {
        const w = -half + (2 * half * j) / nw;
        pos.push(p.x + nx * w, lv, p.z + nz * w);
        uv.push(s, w);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < nw; j++) {
      const a = i * (nw + 1) + j, b = a + 1, c = a + nw + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flowUV', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
  // surf ramp sheet
  function surfMesh() {
    const s = P.L.surf;
    const pos = [], uv = [], idx = [];
    const nx = 34, nz = 88;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const dx = -7.75 + 15.5 * i / nx;
      const dz = 11 - 21 * j / nz; // front -> back
      const u = (11 - dz) / 22;
      let y = -0.5 + 2.9 * Math.pow(u, 1.8) + 0.3;
      // standing wave hump near u~0.55 (steep front, long back)
      const du = u - 0.58;
      y += 0.95 * Math.exp(-Math.pow(du / (du > 0 ? 0.055 : 0.11), 2)) * (0.85 + 0.15 * Math.sin(dx * 0.6));
      pos.push(s.cx + dx, y, s.cz + dz);
      uv.push(0, u);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('flowUV', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }

  W.build = function (scene) {
    W.buildMaps();
    W.meshes = {};
    W.mats = [];
    for (const pool of P.pools) {
      let g, mat;
      if (pool.kind === 'wave') { g = waveMesh(); mat = W.makeWaterMaterial(1, pool.level); }
      else if (pool.kind === 'river') { g = riverMesh(); mat = W.makeWaterMaterial(2, pool.level); }
      else { g = flatMesh(pool.id, pool.level); mat = W.makeWaterMaterial(pool.kind === 'spa' ? 3 : 0, pool.level); }
      if (!g) continue;
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 5;
      scene.add(m);
      W.meshes[pool.name] = m;
      W.mats.push(mat);
    }
    // surf sheet
    {
      const g = surfMesh();
      const mat = W.makeWaterMaterial(4, 0);
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 6;
      scene.add(m);
      W.meshes.surf = m;
      W.mats.push(mat);
    }
  };
  W.update = function (t, waveStart) {
    WP.update(t, waveStart);
    W.waveUniforms.uSwell.value = WP.swell;
  };
})();
