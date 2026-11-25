/* 秋庭观星画室 — core: uniforms, toon shader, builder, render pipeline */
(function () {
  'use strict';
  const W = (window.W = window.W || {});
  W.ready = new Promise((res) => { W._readyResolve = res; });
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion, E = THREE.Euler;
  W.V3 = V3; W.M4 = M4;

  // ---------- deterministic random ----------
  W.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    const f = function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296; };
    f.range = (a, b) => a + (b - a) * f();
    f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    return f;
  };
  W.R = W.rng(20261122);
  W.clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  W.lerp = (a, b, t) => a + (b - a) * t;
  W.smooth = (a, b, x) => { const t = W.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  W.ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  W.easeS = (t) => t * t * (3 - 2 * t);
  W.hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------- color helpers ----------
  const colCache = new Map();
  W.C = function (hex) {
    if (hex && hex.isColor) return hex;
    let c = colCache.get(hex);
    if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); }
    return c;
  };
  W.mixC = (a, b, t) => W.C(a).clone().lerp(W.C(b), t);
  W.jit = function (hex, amt, r) {
    const c = W.C(hex).clone();
    const hsl = {}; c.getHSL(hsl);
    r = r || W.R;
    let h = hsl.h + (r() - 0.5) * amt * 0.15;
    if (hsl.h < 0.12 && hsl.s > 0.4) h = W.clamp(h, 0.004, 0.2); else h = (h + 1) % 1;
    c.setHSL(h, W.clamp(hsl.s + (r() - 0.5) * amt * 0.4, 0, 1), W.clamp(hsl.l + (r() - 0.5) * amt * 0.5, 0, 1));
    return c;
  };

  // ---------- shared uniforms ----------
  const U = (W.U = {
    uTime: { value: 0 },
    uPass: { value: 0 },
    uSunDir: { value: new V3(-0.22, 0.56, -0.8).normalize() },
    uSunCol: { value: new THREE.Color(1.0, 0.82, 0.58).multiplyScalar(1.3) },
    uShadeCol: { value: new THREE.Color(0.45, 0.43, 0.63) },
    uSkyCol: { value: new THREE.Color(0.62, 0.7, 0.86) },
    uRimCol: { value: new THREE.Color(1.0, 0.72, 0.42) },
    uShadowMap: { value: null },
    uShadowMat: { value: new M4() },
    uShadowTexel: { value: 1 / 4096 },
    uAtlas: { value: null },
    uCloud: { value: new THREE.Vector4(999, 999, 14, 0) }, // center xz, radius, amount
    uCloudDir: { value: new THREE.Vector2(1, 0) },
    uWind: { value: new THREE.Vector4(0.12, -999, 0, 6) }, // breeze, gust front, gust amp, decay
    uWindDir: { value: new THREE.Vector2(-0.97, -0.24) },
    uPL: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -100, 0, 0.001)) },
    uPLc: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uInMin: { value: new V3(-16.2, 1.2, -11.2) },
    uInMax: { value: new V3(-5.9, 6.8, -3.0) },
    uInDark: { value: 0.0 },
    uOrrC: { value: new V3(-11, 3.4, -9.2) },
    uOrrRot: { value: new THREE.Matrix3() },
    uStarAmt: { value: 0.35 },
    uCaustic: { value: 1.0 },
    uSand: { value: [new THREE.Vector3(-7.55, 7.3, 0.85), new THREE.Vector3(-6.9, 9.9, 0.62), new THREE.Vector3(-8.4, 10.3, 0.45)] },
    uDapple: { value: 1.0 },
    uFlash: { value: 0.0 },
  });

  // ---------- GLSL library ----------
  const GL_NOISE = /* glsl */ `
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz+33.33); return fract((p3.xxy + p3.yxx)*p3.zyx); }
  float vnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.-2.*f);
    float a=hash13(i), b=hash13(i+vec3(1,0,0)), c=hash13(i+vec3(0,1,0)), d=hash13(i+vec3(1,1,0));
    float e=hash13(i+vec3(0,0,1)), g=hash13(i+vec3(1,0,1)), h=hash13(i+vec3(0,1,1)), k=hash13(i+vec3(1,1,1));
    return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(h,k,f.x),f.y), f.z); }
  float vnoise2(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.-2.*f);
    float a=hash12(i), b=hash12(i+vec2(1,0)), c=hash12(i+vec2(0,1)), d=hash12(i+vec2(1,1));
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
  float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise2(p); p=p*2.03+vec2(17.1,9.3); a*=.5; } return s; }
  float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.07+vec3(7.1,3.3,1.7); a*=.5; } return s; }
  `;

  const GL_WIND = /* glsl */ `
  uniform vec4 uWind; uniform vec2 uWindDir; uniform float uTime;
  float gustAt(vec3 wp){ float s = dot(wp.xz, uWindDir); float d = uWind.y - s;
    return uWind.z * smoothstep(-1.0, 1.5, d) * exp(-max(d, 0.0) / uWind.w); }
  vec3 windOffset(vec3 wp, float w){
    float t = uTime;
    float ph = wp.x * 0.37 + wp.z * 0.29;
    float br = uWind.x * (sin(t * 1.1 + ph) * 0.55 + sin(t * 2.3 + ph * 2.7 + wp.y) * 0.3 + sin(t * 4.7 + ph * 5.3) * 0.15);
    float g = gustAt(wp);
    float fl = sin(t * 9.0 + wp.x * 6.0 + wp.y * 4.0 + wp.z * 5.0);
    vec3 d = vec3(uWindDir.x, 0.0, uWindDir.y);
    vec3 side = vec3(-uWindDir.y, 0.0, uWindDir.x);
    return (d * (br + g * (0.9 + 0.25 * fl)) + side * br * 0.5 * sin(t * 1.7 + ph * 3.0)) * w - vec3(0.0, w * w * g * 0.35, 0.0);
  }
  `;

  const VERT = /* glsl */ `
  attribute vec4 fx;
  varying vec3 vWP; varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying vec4 vFx; varying vec3 vVP;
  ${GL_WIND}
  void main(){
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
    #endif
    vec4 wp = modelMatrix * p;
    if (fx.y > 0.0) wp.xyz += windOffset(wp.xyz, fx.y);
    vWP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    vUv = uv;
    vCol = color.rgb;
    #ifdef USE_INSTANCING_COLOR
      vCol *= instanceColor;
    #endif
    vFx = fx;
    vec4 mv = viewMatrix * wp;
    vVP = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }`;

  const FRAG = /* glsl */ `
  #include <packing>
  uniform float uPass;
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uShadeCol; uniform vec3 uSkyCol; uniform vec3 uRimCol;
  uniform sampler2D uShadowMap; uniform mat4 uShadowMat; uniform float uShadowTexel;
  uniform sampler2D uAtlas;
  uniform vec4 uCloud; uniform vec2 uCloudDir;
  uniform vec4 uPL[8]; uniform vec4 uPLc[8];
  uniform vec3 uInMin; uniform vec3 uInMax; uniform float uInDark;
  uniform vec3 uOrrC; uniform mat3 uOrrRot; uniform float uStarAmt; uniform float uFlash;
  uniform float uCaustic; uniform vec3 uSand[3]; uniform float uDapple;
  uniform float uTime;
  varying vec3 vWP; varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying vec4 vFx; varying vec3 vVP;
  ${GL_NOISE}

  float cloudAt(vec2 p){
    vec2 d = p - uCloud.xy;
    vec2 a = vec2(dot(d, uCloudDir), dot(d, vec2(-uCloudDir.y, uCloudDir.x)));
    float wob = fbm2(p * 0.08 + uCloud.xy * 0.02) * 0.5;
    float r = length(a / vec2(1.25, 0.8)) / uCloud.z + wob * 0.35;
    return 1.0 - uCloud.w * (1.0 - smoothstep(0.62, 0.95, r));
  }
  float shadowAt(vec3 wp, vec3 N){
    vec4 sc = uShadowMat * vec4(wp + N * 0.035, 1.0);
    vec3 c = sc.xyz / sc.w * 0.5 + 0.5;
    if (c.x < 0.001 || c.x > 0.999 || c.y < 0.001 || c.y > 0.999 || c.z > 1.0) return 1.0;
    float d = c.z - 0.0006;
    float s = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
      s += step(d, unpackRGBAToDepth(textureLod(uShadowMap, c.xy + vec2(float(i), float(j)) * uShadowTexel, 0.0)));
    }
    s /= 9.0;
    return smoothstep(0.28, 0.72, s);
  }
  float causticAt(vec3 wp, float t){
    vec2 q = wp.xz * 2.2 + vec2(wp.y * 1.6, -wp.y * 0.7);
    q += vec2(sin(q.y * 1.7 + t * 0.55), cos(q.x * 1.3 - t * 0.45)) * 0.55;
    q += vec2(sin(q.y * 2.9 - t * 0.4), cos(q.x * 2.3 + t * 0.5)) * 0.25;
    float lx = 1.0 - smoothstep(0.06, 0.16, abs(sin(q.x * 2.4)));
    float ly = 1.0 - smoothstep(0.06, 0.16, abs(sin(q.y * 2.4)));
    return max(lx, ly) * (0.6 + 0.4 * vnoise2(q * 0.7 + t * 0.1));
  }
  float starsAt(vec3 wp){
    vec3 d = wp - uOrrC; float dist = length(d); d /= dist;
    d = uOrrRot * d;
    vec3 q = d * 8.5; vec3 i = floor(q); vec3 f = fract(q);
    float m = 0.0;
    for (int x = 0; x <= 1; x++) for (int y = 0; y <= 1; y++) for (int z = 0; z <= 1; z++) {
      vec3 cell = i + vec3(float(x), float(y), float(z)) - 0.5;
      vec3 h = hash33(cell);
      vec3 sp = cell + 0.15 + h * 0.7;
      float r = (h.x > 0.8 ? 0.16 : 0.095);
      vec3 dq = q - sp;
      float k = length(dq);
      float spark = 1.0 - smoothstep(r * 0.6, r, k);
      m = max(m, spark * step(0.36, h.y) * (h.x > 0.8 ? 1.0 : 0.7));
    }
    return m * smoothstep(9.0, 3.5, dist);
  }
  vec3 inBoxMask(vec3 p){ return step(uInMin, p) * step(p, uInMax); }

  void main(){
    float nlen = length(vN);
    vec3 N = nlen > 1e-6 ? vN / nlen : vec3(0.0, 1.0, 0.0);
    if (!gl_FrontFacing) N = -N;
    float pid = floor(vFx.w + 0.01);
    float sub = fract(vFx.w + 0.01);

    if (uPass > 1.5) {
      // shadow depth
      if (pid == 8.0 && uDapple > 0.0) {
        float n = vnoise(vWP * 1.7 + vec3(sin(uTime * 0.7) * 0.1, 0.0, cos(uTime * 0.6) * 0.1));
        if (n > 0.62) discard;
      }
      gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
      return;
    }
    if (uPass > 0.5) {
      vec3 vn = normalize((viewMatrix * vec4(N, 0.0)).xyz);
      float lw = 1.0;
      if (pid == 8.0) lw = 0.55;
      if (pid == 4.0) lw = 0.5;
      if (vFx.x > 0.5) lw = 0.35;
      gl_FragColor = vec4(vn * 0.5 + 0.5, lw);
      return;
    }

    vec3 V = normalize(cameraPosition - vWP);
    vec4 tex = texture2D(uAtlas, vUv);
    vec3 alb = vCol * tex.rgb;
    float spec = 0.0; float specPow = 0.0; float wrap = 0.0; float trans = 0.0;
    vec3 wp = vWP;

    // ----- procedural patterns -----
    if (pid == 1.0) { // wood grain; sub selects axis
      vec3 q = sub < 0.2 ? wp.yzx : (sub < 0.4 ? wp.zxy : wp.xyz);
      float g = vnoise(vec3(q.x * 22.0, q.y * 22.0, q.z * 0.9));
      float g2 = vnoise(vec3(q.x * 3.0, q.y * 3.0, q.z * 0.25));
      float band = smoothstep(0.55, 0.62, g) * 0.12 + smoothstep(0.4, 0.7, g2) * 0.08;
      alb *= 1.0 - band;
      spec = 0.12; specPow = 0.86;
    } else if (pid == 3.0) { // stone
      float n = fbm3(wp * 2.3);
      float n2 = vnoise(wp * 9.0);
      alb *= 0.86 + 0.24 * smoothstep(0.35, 0.65, n) - 0.06 * step(0.72, n2);
      float mossy = smoothstep(0.45, 0.85, N.y) * smoothstep(0.5, 0.62, fbm3(wp * 1.3 + 4.0));
      alb = mix(alb, vec3(0.16, 0.24, 0.07), mossy * 0.75 * (1.0 - sub));
      float wet = smoothstep(0.62, 0.7, vnoise(vec3(wp.x * 1.5, wp.y * 0.4, wp.z * 1.5)));
      alb *= 1.0 - wet * 0.12;
    } else if (pid == 4.0) { // moss
      float n = vnoise(wp * 7.0); float n2 = vnoise(wp * 23.0);
      alb *= 0.85 + 0.25 * n;
      alb = mix(alb, alb * vec3(1.25, 1.2, 0.7), step(0.78, n2) * 0.6);
      wrap = 0.35;
    } else if (pid == 5.0) { // tart crust
      float n = fbm3(wp * 4.0);
      float n2 = vnoise(wp * 26.0);
      float top = smoothstep(0.2, 0.9, N.y);
      alb = mix(alb, alb * vec3(0.78, 0.6, 0.42), smoothstep(0.45, 0.75, n) * 0.55 + top * 0.18);
      alb *= 1.0 - step(0.8, n2) * 0.15;
      alb = mix(alb, alb * vec3(1.15, 1.08, 0.9), step(n2, 0.12) * 0.5);
      spec = 0.06; specPow = 0.9;
    } else if (pid == 6.0) { // glazed tile
      spec = 0.22; specPow = 0.975;
      alb *= 0.92 + 0.12 * vnoise(wp * 3.0);
    } else if (pid == 7.0) { // paper (translucent)
      trans = 0.5;
      alb *= 0.97 + 0.05 * vnoise(wp * 30.0);
    } else if (pid == 8.0) { // foliage
      trans = 0.9; wrap = 0.25;
      float n = vnoise(wp * 2.2);
      alb *= 0.9 + 0.2 * n;
    } else if (pid == 9.0) { // brass
      spec = 1.0; specPow = 0.9;
      alb *= 0.9 + 0.15 * vnoise(wp * 18.0);
    } else if (pid == 10.0) { // vermilion lacquer w/ wear
      float n = fbm3(wp * vec3(3.0, 1.2, 3.0));
      float wear = smoothstep(0.58, 0.66, n);
      alb = mix(alb, alb * vec3(1.12, 0.92, 0.85) + vec3(0.05, 0.02, 0.0), wear * 0.6);
      alb *= 1.0 - smoothstep(0.7, 0.76, vnoise(wp * vec3(9.0, 2.0, 9.0))) * 0.12;
      spec = 0.18; specPow = 0.92;
    } else if (pid == 12.0) { // tin / metal
      spec = 0.8; specPow = 0.88;
    } else if (pid == 13.0) { // soil
      float n = vnoise(wp * vec3(5.0, 9.0, 5.0)); float n2 = vnoise(wp * 31.0);
      alb *= 0.88 + 0.2 * n - 0.1 * step(0.8, n2);
    } else if (pid == 14.0) { // raked sand
      float lines = 0.0;
      float best = 1e3; vec3 sc = vec3(0.0);
      for (int i = 0; i < 3; i++) { float dd = length(wp.xz - uSand[i].xy) - uSand[i].z; if (dd < best) { best = dd; } }
      float ring = best < 1.7 ? best * 9.0 : (wp.z + wp.x * 0.15) * 9.0;
      float r = abs(fract(ring) - 0.5);
      float groove = smoothstep(0.18, 0.26, r);
      alb *= 0.86 + 0.14 * groove;
      if (best < 0.06) alb *= 0.9;
    } else if (pid == 15.0) { // tatami boost
      alb *= 0.95 + 0.08 * vnoise(wp * 40.0);
      spec = 0.08; specPow = 0.9;
    } else if (pid == 16.0) { // polished floorboards
      vec3 q = sub < 0.2 ? wp.yzx : (sub < 0.4 ? wp.zxy : wp.xyz);
      float g = vnoise(vec3(q.x * 26.0, q.y * 26.0, q.z * 1.1));
      alb *= 1.0 - smoothstep(0.55, 0.62, g) * 0.1;
      spec = 0.55; specPow = 0.93;
    } else if (pid == 18.0) { // stone slab paving with mossy joints
      vec2 g = wp.xz * vec2(1.05, 1.5);
      float row = floor(g.y);
      g.x += hash12(vec2(row, 3.0)) * 0.8;
      vec2 f = fract(g); vec2 id = floor(g);
      float edge = min(min(f.x, 1.0 - f.x) / 1.05, min(f.y, 1.0 - f.y) / 1.5);
      float grout = 1.0 - smoothstep(0.01, 0.028, edge);
      alb *= 0.88 + 0.2 * hash12(id) + 0.06 * vnoise(wp * 6.0);
      alb = mix(alb, vec3(0.2, 0.27, 0.1), grout * 0.75);
      float mossy = smoothstep(0.62, 0.7, fbm3(vec3(wp.xz * 0.9, 1.0)));
      alb = mix(alb, vec3(0.24, 0.33, 0.12), mossy * 0.6);
    } else if (pid == 17.0) { // bark
      float g = vnoise(vec3(wp.x * 9.0, wp.y * 1.6, wp.z * 9.0));
      alb *= 0.8 + 0.3 * smoothstep(0.3, 0.7, g);
    }

    // ----- sun lighting (toon) -----
    float ndl = dot(N, uSunDir);
    float w = fwidth(ndl) * 1.2 + 0.015;
    float lam = smoothstep(-wrap - w, -wrap + w, ndl);
    float sh = shadowAt(wp, N);
    float cl = cloudAt(wp.xz);
    vec3 ib = inBoxMask(wp);
    float inside = ib.x * ib.y * ib.z;
    float sunVis = lam * sh;
    float L = sunVis * cl;
    float insideSun = mix(1.0, 0.62, inside);
    L *= insideSun;
    float hi = smoothstep(0.55 - w, 0.55 + w, ndl) * sunVis * cl;

    float up = N.y * 0.5 + 0.5;
    vec3 amb = mix(uShadeCol * vec3(0.92, 0.9, 1.0), uSkyCol, up * 0.38);
    amb *= mix(1.0, 0.72 - uInDark * 0.18, inside);
    amb *= 1.0 - (1.0 - cl) * 0.18;
    vec3 col = alb * amb;
    col = mix(col, alb * uSunCol, L);
    col += alb * uSunCol * hi * 0.09;

    // specular (toon highlight shape)
    if (spec > 0.0) {
      vec3 H = normalize(uSunDir + V);
      float nh = dot(N, H);
      float s = smoothstep(specPow - 0.006, specPow + 0.006, nh);
      col += uSunCol * spec * s * sunVis * cl * 0.85;
      if (pid == 9.0) {
        float env = smoothstep(0.35, 0.4, N.y) * 0.25 + smoothstep(0.7, 0.75, dot(N, V)) * 0.2;
        col += alb * env;
      }
    }
    // translucency / back light glow on leaves, petals, paper
    if (trans > 0.0) {
      float bl = pow(max(dot(-V, uSunDir), 0.0), 3.0);
      float back = smoothstep(0.0, 0.25, -ndl + 0.15);
      col += alb * uSunCol * trans * bl * (0.35 + 0.65 * back) * sh * cl * 0.9 * insideSun;
    }
    // rim light (warm edge)
    float nv = dot(N, V);
    float rim = smoothstep(0.62, 0.7, 1.0 - max(nv, 0.0)) * smoothstep(0.0, 0.25, ndl) * sh * cl;
    float backView = 0.45 + 0.55 * max(dot(-V, uSunDir), 0.0);
    col += uRimCol * alb * rim * backView * 0.75 * insideSun;

    // point lights (lanterns, orrery)
    for (int i = 0; i < 8; i++) {
      vec4 pl = uPL[i]; vec4 pc = uPLc[i];
      if (pc.a <= 0.0) continue;
      vec3 dv = pl.xyz - wp; float dl = length(dv);
      float att = clamp(1.0 - dl / pl.w, 0.0, 1.0);
      if (att <= 0.0) continue;
      float nd = dot(N, dv / dl);
      float band = smoothstep(0.0, 0.06, att) * 0.45 + smoothstep(0.35, 0.42, att) * 0.35 + smoothstep(0.7, 0.75, att) * 0.2;
      col += alb * pc.rgb * pc.a * band * (0.35 + 0.65 * smoothstep(-0.1, 0.1, nd));
    }

    // caustic light ripples
    if (vFx.z > 0.0) {
      float c = causticAt(wp, uTime);
      col += uSunCol * vec3(0.85, 1.0, 1.05) * c * vFx.z * 0.16 * cl * uCaustic;
    }
    // star projection from orrery
    if (inside > 0.5 && vFx.x < 0.5 && N.y < 0.35) {
      float s = starsAt(wp);
      col += vec3(0.55, 0.78, 1.0) * s * uStarAmt * (0.6 + uFlash) * 0.9;
    }
    // emissive
    col = mix(col, alb * (1.0 + vFx.x * 1.6), clamp(vFx.x, 0.0, 1.0));

    // aerial perspective
    float dist = length(vVP);
    col = mix(col, vec3(0.86, 0.85, 0.88), smoothstep(40.0, 140.0, dist) * 0.35);
    col = max(col, vec3(0.0));
    if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
    gl_FragColor = vec4(min(col, vec3(32.0)), 1.0);
  }`;

  W.makeToon = function (opts) {
    opts = opts || {};
    const m = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: VERT,
      fragmentShader: FRAG,
      vertexColors: true,
      side: opts.side || THREE.FrontSide,
    });
    m.extensions = { derivatives: true };
    return m;
  };
  W.GL_NOISE = GL_NOISE;
  W.GL_WIND = GL_WIND;

  // ---------- growable typed array ----------
  class FA {
    constructor(T, n) { this.T = T || Float32Array; this.a = new this.T(n || 4096); this.n = 0; }
    ensure(k) { if (this.n + k > this.a.length) { let L = this.a.length * 2; while (L < this.n + k) L *= 2; const b = new this.T(L); b.set(this.a.subarray(0, this.n)); this.a = b; } }
    get() { return this.a.subarray(0, this.n); }
  }

  // ---------- geometry bucket (merge static stuff) ----------
  const _v = new V3(), _n = new V3(), _nm = new THREE.Matrix3();
  W.WHITE_UV = [0.5 / 4096 * 6, 1 - 0.5 / 4096 * 6];
  class Bucket {
    constructor(name) {
      this.name = name;
      this.pos = new FA(Float32Array, 1 << 16); this.nor = new FA(Float32Array, 1 << 16);
      this.uv = new FA(Float32Array, 1 << 15); this.col = new FA(Float32Array, 1 << 16);
      this.fx = new FA(Float32Array, 1 << 16); this.idx = new FA(Uint32Array, 1 << 16);
      this.count = 0;
    }
    add(geo, m, color, fx, region, colorFn) {
      const P = geo.attributes.position, NN = geo.attributes.normal, UV = geo.attributes.uv, I = geo.index;
      const n = P.count;
      _nm.getNormalMatrix(m);
      const flip = m.determinant() < 0;
      this.pos.ensure(n * 3); this.nor.ensure(n * 3); this.uv.ensure(n * 2); this.col.ensure(n * 3); this.fx.ensure(n * 4);
      const c = color && color.isColor ? color : W.C(color === undefined ? 0xffffff : color);
      const fxFn = typeof fx === 'function' ? fx : null;
      let f = fxFn ? [0, 0, 0, 0] : (fx || [0, 0, 0, 0]);
      const pa = this.pos.a, na = this.nor.a, ua = this.uv.a, ca = this.col.a, xa = this.fx.a;
      let p3 = this.pos.n, p2 = this.uv.n, p4 = this.fx.n;
      for (let i = 0; i < n; i++) {
        _v.fromBufferAttribute(P, i);
        const lx = _v.x, ly = _v.y, lz = _v.z;
        _v.applyMatrix4(m);
        pa[p3] = _v.x; pa[p3 + 1] = _v.y; pa[p3 + 2] = _v.z;
        if (NN) { _n.fromBufferAttribute(NN, i).applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
        na[p3] = _n.x; na[p3 + 1] = _n.y; na[p3 + 2] = _n.z;
        if (colorFn) {
          const cc = colorFn(lx, ly, lz, _v, _n, c);
          ca[p3] = cc.r; ca[p3 + 1] = cc.g; ca[p3 + 2] = cc.b;
        } else { ca[p3] = c.r; ca[p3 + 1] = c.g; ca[p3 + 2] = c.b; }
        if (region && UV) {
          const u = UV.getX(i), vv = UV.getY(i);
          ua[p2] = region[0] + (region[2] - region[0]) * u; ua[p2 + 1] = region[1] + (region[3] - region[1]) * vv;
        } else { ua[p2] = W.WHITE_UV[0]; ua[p2 + 1] = W.WHITE_UV[1]; }
        if (fxFn) f = fxFn(lx, ly, lz);
        xa[p4] = f[0]; xa[p4 + 1] = f[1]; xa[p4 + 2] = f[2]; xa[p4 + 3] = f[3];
        p3 += 3; p2 += 2; p4 += 4;
      }
      this.pos.n = p3; this.nor.n = p3; this.col.n = p3; this.uv.n = p2; this.fx.n = p4;
      const base = this.count;
      if (I) {
        const ic = I.count; this.idx.ensure(ic); const ia = this.idx.a; let k = this.idx.n;
        for (let t = 0; t < ic; t += 3) {
          const a = I.getX(t) + base, b = I.getX(t + 1) + base, d = I.getX(t + 2) + base;
          if (flip) { ia[k++] = a; ia[k++] = d; ia[k++] = b; } else { ia[k++] = a; ia[k++] = b; ia[k++] = d; }
        }
        this.idx.n = k;
      } else {
        this.idx.ensure(n); const ia = this.idx.a; let k = this.idx.n;
        for (let t = 0; t < n; t += 3) {
          if (flip) { ia[k++] = base + t; ia[k++] = base + t + 2; ia[k++] = base + t + 1; } else { ia[k++] = base + t; ia[k++] = base + t + 1; ia[k++] = base + t + 2; }
        }
        this.idx.n = k;
      }
      this.count += n;
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos.get().slice(), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(this.nor.get().slice(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(this.uv.get().slice(), 2));
      g.setAttribute('color', new THREE.BufferAttribute(this.col.get().slice(), 3));
      g.setAttribute('fx', new THREE.BufferAttribute(this.fx.get().slice(), 4));
      g.setIndex(new THREE.BufferAttribute(this.idx.get().slice(), 1));
      g.computeBoundingSphere();
      return g;
    }
    mesh(mat) {
      const m = new THREE.Mesh(this.geometry(), mat || W.matDS);
      m.matrixAutoUpdate = true;
      return m;
    }
  }
  W.Bucket = Bucket;

  // ---------- transform helpers ----------
  const _e = new E(), _q = new Q(), _s = new V3(), _p = new V3();
  W.T = function (p, r, s) {
    const m = new M4();
    _p.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0);
    if (r) { _e.set(r[0] || 0, r[1] || 0, r[2] || 0, r[3] || 'YXZ'); _q.setFromEuler(_e); } else _q.identity();
    if (s === undefined || s === null) _s.set(1, 1, 1); else if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    return m.compose(_p, _q, _s);
  };

  // context: builder with matrix
  class Ctx {
    constructor(bucket, m) { this.b = bucket; this.m = m || new M4(); }
    at(p, r, s) { return new Ctx(this.b, this.m.clone().multiply(W.T(p, r, s))); }
    to(bucket) { return new Ctx(bucket, this.m.clone()); }
    add(geo, color, p, r, s, fx, region, colorFn) {
      const m = (p || r || s !== undefined) ? this.m.clone().multiply(W.T(p, r, s)) : this.m;
      this.b.add(geo, m, color, fx, region, colorFn);
      return this;
    }
    addM(geo, color, mLocal, fx, region, colorFn) { this.b.add(geo, this.m.clone().multiply(mLocal), color, fx, region, colorFn); return this; }
    box(w, h, d, color, p, r, fx, region) { return this.add(W.g.box(w, h, d), color, p, r, undefined, fx, region); }
    cyl(rt, rb, h, color, p, r, fx, seg, region) { return this.add(W.g.cyl(rt, rb, h, seg || 14), color, p, r, undefined, fx, region); }
    sph(rad, color, p, s, fx, seg) { return this.add(W.g.sph(1, seg || 12), color, p, null, typeof s === 'object' ? [s[0] * rad, s[1] * rad, s[2] * rad] : rad * (s || 1), fx); }
    worldPos(p) { return new V3(p[0], p[1], p[2]).applyMatrix4(this.m); }
  }
  W.Ctx = Ctx;

  // ---------- geometry library ----------
  const gcache = new Map();
  const cached = (key, fn) => { let g = gcache.get(key); if (!g) { g = fn(); gcache.set(key, g); } return g; };
  const g = (W.g = {});
  g.box = (w, h, d) => cached('b' + w + '_' + h + '_' + d, () => new THREE.BoxGeometry(w, h, d));
  g.boxS = (w, h, d, sx, sy, sz) => cached('bs' + [w, h, d, sx, sy, sz].join('_'), () => new THREE.BoxGeometry(w, h, d, sx, sy, sz));
  g.cyl = (rt, rb, h, seg, open) => cached('c' + [rt, rb, h, seg, open].join('_'), () => new THREE.CylinderGeometry(rt, rb, h, seg || 14, 1, !!open));
  g.sph = (r, seg) => cached('s' + r + '_' + seg, () => new THREE.SphereGeometry(r, seg || 12, Math.max(6, Math.round((seg || 12) * 0.7))));
  g.ico = (r, d) => cached('i' + r + '_' + d, () => new THREE.IcosahedronGeometry(r, d || 1));
  g.cone = (r, h, seg) => cached('k' + [r, h, seg].join('_'), () => new THREE.ConeGeometry(r, h, seg || 12));
  g.torus = (R, r, rs, ts, arc) => cached('t' + [R, r, rs, ts, arc].join('_'), () => new THREE.TorusGeometry(R, r, rs || 8, ts || 32, arc || Math.PI * 2));
  g.plane = (w, h, sx, sy) => cached('p' + [w, h, sx, sy].join('_'), () => new THREE.PlaneGeometry(w, h, sx || 1, sy || 1));
  g.circle = (r, seg) => cached('ci' + r + '_' + seg, () => new THREE.CircleGeometry(r, seg || 24));
  g.lathe = (pts, seg, key) => {
    const f = () => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg || 18);
    return key ? cached('l' + key + seg, f) : f();
  };
  g.extrude = (shape, depth, bevel, key, curveSeg) => {
    const f = () => {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: curveSeg || 10 });
      geo.translate(0, 0, -depth / 2);
      return geo;
    };
    return key ? cached('e' + key, f) : f();
  };
  g.shape = (shape, key, seg) => { const f = () => new THREE.ShapeGeometry(shape, seg || 10); return key ? cached('sh' + key, f) : f(); };
  // rounded / soft box: subdivided box pushed toward superellipsoid
  g.soft = (w, h, d, r, seg) => cached('so' + [w, h, d, r, seg].join('_'), () => {
    seg = seg || 4;
    const geo = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
    const P = geo.attributes.position; const v = new V3();
    const hx = w / 2, hy = h / 2, hz = d / 2;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const x = v.x * 2, y = v.y * 2, z = v.z * 2;
      const ix = W.clamp(x, -1, 1) * (hx - r), iy = W.clamp(y, -1, 1) * (hy - r), iz = W.clamp(z, -1, 1) * (hz - r);
      const dir = new V3(x * hx - ix, y * hy - iy, z * hz - iz);
      // project onto rounded corner
      const ox = x * hx, oy = y * hy, oz = z * hz;
      const cx = W.clamp(ox, -(hx - r), hx - r), cy = W.clamp(oy, -(hy - r), hy - r), cz = W.clamp(oz, -(hz - r), hz - r);
      dir.set(ox - cx, oy - cy, oz - cz);
      if (dir.lengthSq() > 1e-9) dir.normalize().multiplyScalar(r);
      P.setXYZ(i, cx + dir.x, cy + dir.y, cz + dir.z);
    }
    geo.computeVertexNormals();
    return geo;
  });
  // tapered tube along points with radius function
  g.tube = (pts, r0, r1, radial, tubular, closed) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new V3(p[0], p[1], p[2]))));
    radial = radial || 7; tubular = tubular || Math.max(4, pts.length * 4);
    const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, !!closed);
    const P = geo.attributes.position;
    const fr = curve.computeFrenetFrames(tubular, !!closed);
    const v = new V3();
    for (let i = 0; i <= tubular; i++) {
      const t = i / tubular; const c = curve.getPointAt(t);
      const rr = typeof r0 === 'function' ? r0(t) : W.lerp(r0, r1 === undefined ? r0 : r1, t);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        v.fromBufferAttribute(P, k).sub(c).multiplyScalar(rr).add(c);
        P.setXYZ(k, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    return geo;
  };
  // blob (noise displaced icosphere)
  g.blob = (r, detail, amp, seed, sq) => {
    const geo = new THREE.IcosahedronGeometry(r, detail || 2);
    const P = geo.attributes.position; const v = new V3();
    const rr = W.rng(seed || 1);
    const o = [rr() * 10, rr() * 10, rr() * 10];
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const n = Math.sin(v.x * 3.1 + o[0]) * Math.sin(v.y * 2.7 + o[1]) * Math.sin(v.z * 3.3 + o[2]);
      const n2 = Math.sin(v.x * 7.3 + o[1]) * Math.sin(v.y * 6.1 + o[2]) * Math.sin(v.z * 6.9 + o[0]);
      v.multiplyScalar(1 + (amp || 0.15) * (n * 0.7 + n2 * 0.3));
      if (sq) v.y *= sq;
      P.setXYZ(i, v.x, v.y, v.z);
    }
    const ng = THREE.BufferGeometryUtils ? geo : geo;
    ng.deleteAttribute('normal');
    const m = mergeVerts(ng);
    m.computeVertexNormals();
    return m;
  };
  function mergeVerts(geo) {
    // simple vertex weld for non-indexed geometry (positions only)
    const P = geo.attributes.position; const map = new Map(); const pos = []; const idx = [];
    const uvA = geo.attributes.uv; const uvs = [];
    for (let i = 0; i < P.count; i++) {
      const key = Math.round(P.getX(i) * 1e4) + '_' + Math.round(P.getY(i) * 1e4) + '_' + Math.round(P.getZ(i) * 1e4);
      let k = map.get(key);
      if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(P.getX(i), P.getY(i), P.getZ(i)); if (uvA) uvs.push(uvA.getX(i), uvA.getY(i)); }
      idx.push(k);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (uvA) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    out.setIndex(idx);
    return out;
  }
  g.weld = mergeVerts;
  // leaf shapes
  g.mapleShape = () => {
    const s = new THREE.Shape();
    const lobes = [[0, 1.0], [0.62, 0.72], [0.98, 0.18], [0.5, -0.35], [0.0, -0.08], [-0.5, -0.35], [-0.98, 0.18], [-0.62, 0.72]];
    // star-ish maple leaf: tips with valleys
    const tips = [[0, 1.0, 0.26], [0.72, 0.6, 0.24], [0.92, -0.05, 0.22], [0.42, -0.42, 0.3], [-0.42, -0.42, 0.3], [-0.92, -0.05, 0.22], [-0.72, 0.6, 0.24]];
    const pts = [];
    for (let i = 0; i < tips.length; i++) {
      const a = tips[i], b = tips[(i + 1) % tips.length];
      pts.push([a[0], a[1]]);
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      const k = i === 3 ? 0.18 : 0.36;
      pts.push([mx * k, my * k + (i === 3 ? -0.2 : 0)]);
    }
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return s;
  };
  g.ginkgoShape = () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.55);
    s.lineTo(0.06, -0.15);
    s.quadraticCurveTo(0.75, 0.15, 0.82, 0.62);
    s.quadraticCurveTo(0.5, 0.9, 0.08, 0.86);
    s.lineTo(0, 0.7);
    s.lineTo(-0.08, 0.86);
    s.quadraticCurveTo(-0.5, 0.9, -0.82, 0.62);
    s.quadraticCurveTo(-0.75, 0.15, -0.06, -0.15);
    s.closePath();
    return s;
  };
  g.leafShape = (wd) => {
    wd = wd || 0.35;
    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.quadraticCurveTo(wd, -0.1, 0, 0.5);
    s.quadraticCurveTo(-wd, -0.1, 0, -0.5);
    return s;
  };
  g.leaf = (kind) => cached('leaf' + kind, () => {
    let geo;
    if (kind === 'maple') geo = new THREE.ShapeGeometry(g.mapleShape(), 2);
    else if (kind === 'ginkgo') geo = new THREE.ShapeGeometry(g.ginkgoShape(), 4);
    else geo = new THREE.ShapeGeometry(g.leafShape(kind === 'narrow' ? 0.18 : 0.35), 4);
    // slight cup
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i); P.setZ(i, (x * x) * 0.18 + y * 0.05); }
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  });
  g.starG = (ro, ri, n) => cached('starG' + [ro, ri, n].join('_'), () => new THREE.ShapeGeometry(g.star(ro, ri, n)));
  g.star = (ro, ri, n) => cached('star' + [ro, ri, n].join('_'), () => {
    const s = new THREE.Shape();
    n = n || 5;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2; const r = i % 2 ? ri : ro;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    return s;
  });

  // ---------- atlas ----------
  const AT = (W.atlas = { size: 4096, regions: {}, x: 16, y: 0, rowH: 16 });
  AT.canvas = document.createElement('canvas');
  AT.canvas.width = AT.canvas.height = AT.size;
  AT.ctx = AT.canvas.getContext('2d');
  AT.ctx.fillStyle = '#ffffff';
  AT.ctx.fillRect(0, 0, AT.size, AT.size);
  AT.alloc = function (name, w, h, draw) {
    const pad = 6;
    if (AT.x + w + pad > AT.size) { AT.x = 0; AT.y += AT.rowH + pad; AT.rowH = 0; }
    const x = AT.x + pad, y = AT.y + pad;
    AT.x += w + pad * 2; AT.rowH = Math.max(AT.rowH, h + pad);
    const c = AT.ctx;
    c.save(); c.beginPath(); c.rect(x - 2, y - 2, w + 4, h + 4); c.clip(); c.translate(x, y);
    draw(c, w, h);
    c.restore();
    // edge bleed
    const r = [(x + 0.5) / AT.size, 1 - (y + h - 0.5) / AT.size, (x + w - 0.5) / AT.size, 1 - (y + 0.5) / AT.size];
    AT.regions[name] = r;
    return r;
  };
  AT.get = (n) => AT.regions[n];
  AT.finish = function (renderer) {
    const t = new THREE.CanvasTexture(AT.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    U.uAtlas.value = t;
    AT.texture = t;
  };

  // ---------- scene objects registry ----------
  W.dyn = []; // updaters: fn(t, dt)
  W.onUpdate = (fn) => W.dyn.push(fn);
})();
