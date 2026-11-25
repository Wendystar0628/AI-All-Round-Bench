'use strict';
/* ==========================================================================
   Shaders & materials
   ========================================================================== */
(function () {
  const P = window.P;

  // ---------------------------------------------------------------- globals
  const sunDir = new THREE.Vector3(0.37, 0.86, 0.35).normalize();
  P.sunDir = sunDir;
  const U = (P.U = {
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
    uSunCol: { value: new THREE.Color(0.74, 0.67, 0.56) },
    uSkyAmb: { value: new THREE.Color(0.43, 0.47, 0.62) },
    uGndAmb: { value: new THREE.Color(0.39, 0.47, 0.49) },
    uShS: { value: null },
    uShD: { value: null },
    uShMat: { value: new THREE.Matrix4() },
    uShTexel: { value: new THREE.Vector2(1 / 4096, 1 / 4096) },
    uShOn: { value: 0 },
    uWaterMap: { value: null },
    uFloorMap: { value: null },
    uMapXf: { value: new THREE.Vector4(0, 0, 1, 1) }, // x0,z0, 1/width(m), 1/depth(m)
    uClouds: { value: [] }, // cloud shadow blobs vec4(x,z,r,strength)
    uFogCol: { value: new THREE.Color(0.7, 0.85, 0.97) },
    uFogK: { value: 0.00032 },
    uSkyCloud: { value: [] }, // cloud reflection blobs: dir.xyz, angular radius
    uExposure: { value: 1.0 },
    uCave: { value: new THREE.Vector4(-97.5, -70.6, -58.8, -49.2) },
  });
  for (let i = 0; i < 8; i++) U.uClouds.value.push(new THREE.Vector4(0, 0, 1, 0));
  for (let i = 0; i < 10; i++) U.uSkyCloud.value.push(new THREE.Vector4(0, 1, 0, 0));

  // ---------------------------------------------------------------- GLSL chunks
  const COMMON = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uSkyAmb;
  uniform vec3 uGndAmb;
  uniform vec3 uFogCol;
  uniform float uFogK;
  uniform vec4 uClouds[8];
  uniform vec4 uSkyCloud[10];
  uniform vec4 uCave;
  float caveF(vec3 p){
    if (p.x < uCave.x || p.x > uCave.y || p.z < uCave.z || p.z > uCave.w || p.y > 4.6) return 0.0;
    float dx = min(p.x - uCave.x, uCave.y - p.x);
    return smoothstep(0.0, 5.0, dx) * smoothstep(4.6, 3.6, p.y);
  }
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
    return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5;} return s/.9375; }
  vec3 skyColor(vec3 d){
    float h = clamp(d.y, -0.2, 1.0);
    vec3 zen = vec3(0.045, 0.27, 0.86);
    vec3 mid = vec3(0.22, 0.56, 0.98);
    vec3 hor = vec3(0.70, 0.88, 0.99);
    float t = pow(clamp(h, 0.0, 1.0), 0.55);
    vec3 c = mix(hor, mid, smoothstep(0.0, 0.45, t));
    c = mix(c, zen, smoothstep(0.35, 1.0, t));
    float sd = max(dot(d, uSunDir), 0.0);
    c += uSunCol * (pow(sd, 6.0) * 0.12 + pow(sd, 60.0) * 0.35);
    if (d.y < 0.0) c = mix(hor, vec3(0.62, 0.82, 0.95), clamp(-d.y * 4.0, 0.0, 1.0));
    return c;
  }
  // soft reflection of big clouds (direction-space blobs)
  float skyCloudMask(vec3 d){
    float m = 0.0;
    for (int i = 0; i < 10; i++){
      vec4 c = uSkyCloud[i];
      if (c.w <= 0.0) continue;
      float a = acos(clamp(dot(d, c.xyz), -1.0, 1.0));
      m = max(m, 1.0 - smoothstep(c.w * 0.55, c.w, a));
    }
    return m;
  }
  float cloudShadow(vec2 xz){
    float s = 0.0;
    for (int i = 0; i < 8; i++){
      vec4 c = uClouds[i];
      if (c.w <= 0.0) continue;
      vec2 d = (xz - c.xy) / c.z;
      float n = vnoise(xz * 0.025 + float(i) * 7.0) * 0.5;
      float r = length(d * vec2(1.0, 1.35)) + n * 0.6;
      s = max(s, c.w * (1.0 - smoothstep(0.55, 1.0, r)));
    }
    return 1.0 - s;
  }
  vec3 applyFog(vec3 col, vec3 wp){
    vec3 dv = wp - cameraPosition;
    float d = length(dv);
    float f = 1.0 - exp(-max(d - 40.0, 0.0) * uFogK);
    vec3 fc = skyColor(normalize(vec3(dv.x, max(dv.y, 0.0) * 0.25, dv.z)));
    fc = mix(fc, uFogCol, 0.5);
    return mix(col, fc, clamp(f, 0.0, 0.96));
  }
  `;

  const SHADOW = /* glsl */ `
  uniform sampler2DShadow uShS;
  uniform sampler2DShadow uShD;
  uniform mat4 uShMat;
  uniform vec2 uShTexel;
  uniform float uShOn;
  const vec2 POIS[8] = vec2[8](vec2(-0.613,0.617), vec2(0.170,-0.040), vec2(-0.299,-0.792), vec2(0.645,0.493),
                               vec2(-0.651,-0.024), vec2(0.421,-0.627), vec2(-0.011,0.981), vec2(0.958,-0.230));
  float shadowAt(vec3 wp, vec3 n){
    if (uShOn < 0.5) return 1.0;
    vec4 sc = uShMat * vec4(wp + n * 0.07 + uSunDir * 0.05, 1.0);
    if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0;
    float s = 0.0;
    for (int i = 0; i < 8; i++){
      vec2 o = POIS[i] * uShTexel * 1.8;
      float a = texture(uShS, vec3(sc.xy + o, sc.z));
      float b = texture(uShD, vec3(sc.xy + o, sc.z));
      s += min(a, b);
    }
    return s / 8.0;
  }
  `;

  const CAUSTIC = /* glsl */ `
  uniform sampler2D uWaterMap;
  uniform vec4 uMapXf;
  float causticPat(vec2 p, float t){
    vec2 q = mod(p, 6.2831853) - 250.0;
    vec2 i = q; float c = 1.0; float inten = .005;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n+1)));
      i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0/length(vec2(q.x / (sin(i.x+tt)/inten), q.y / (cos(i.y+tt)/inten)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 7.0), 0.0, 2.0);
  }
  float waterLevelAt(vec2 xz){
    vec2 uv = (xz - uMapXf.xy) * uMapXf.zw;
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -100.0;
    return texture(uWaterMap, uv).r;
  }
  `;

  // ---------------------------------------------------------------- voxel material
  const VOX_VS = /* glsl */ `
  uniform sampler2D uPal;
  uniform float uTime;
  uniform float uWind;
  attribute vec4 data;
  attribute vec4 snrm;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vSN;
  varying float vAO;
  flat varying vec3 vN;
  flat varying vec3 vNL;
  flat varying float vMat;
  const vec3 NRM[6] = vec3[6](vec3(1.,0.,0.),vec3(-1.,0.,0.),vec3(0.,1.,0.),vec3(0.,-1.,0.),vec3(0.,0.,1.),vec3(0.,0.,-1.));
  void main(){
    mat4 M = modelMatrix;
    #ifdef USE_INSTANCING
      M = modelMatrix * instanceMatrix;
    #endif
    vec4 wp = M * vec4(position, 1.0);
    int mi = int(data.x + 0.5);
    float sway = texelFetch(uPal, ivec2(mi, 1), 0).w;
    if (sway > 0.0) {
      float ph = dot(wp.xz, vec2(0.11, 0.07));
      float s = sin(uTime * 1.1 + ph) * 0.55 + sin(uTime * 1.9 + ph * 1.7) * 0.25 + 0.3;
      wp.xz += vec2(-0.75, -0.55) * s * sway * 0.16 * uWind;
      wp.y += sin(uTime * 1.6 + ph * 2.3) * sway * 0.03 * uWind;
    }
    vWorld = wp.xyz;
    vLocal = position;
    vec3 n = NRM[int(data.z + 0.5)];
    vNL = n;
    mat3 M3 = mat3(M);
    vN = normalize(M3 * n);
    vSN = normalize(M3 * snrm.xyz);
    vAO = data.y;
    vMat = data.x;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;

  const VOX_FS = /* glsl */ `
  uniform sampler2D uPal;
  uniform float uVox;
  uniform float uEdge;
  uniform vec3 uTint;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vSN;
  varying float vAO;
  flat varying vec3 vN;
  flat varying vec3 vNL;
  flat varying float vMat;
  ${COMMON}
  ${SHADOW}
  ${CAUSTIC}
  void main(){
    int mi = int(vMat + 0.5);
    vec4 c0 = texelFetch(uPal, ivec2(mi,0), 0);
    vec4 c1 = texelFetch(uPal, ivec2(mi,1), 0);
    vec4 c2 = texelFetch(uPal, ivec2(mi,2), 0);
    vec4 c3 = texelFetch(uPal, ivec2(mi,3), 0);
    vec3 N = vN;
    vec3 albedo = c0.rgb * uTint;
    // ---- voxel cell identity & subtle per-voxel variation
    vec3 cellP = vLocal - vNL * 0.5;
    vec3 cell = floor(cellP + 1e-4);
    float h = hash13(cell + 17.0);
    float h2 = hash13(cell * 1.7 + 3.1);
    albedo *= 1.0 + (h - 0.5) * 2.0 * c2.x;
    // grain (sand etc.)
    if (c3.w > 0.0) {
      vec3 gp = floor(vLocal * 4.0 - vNL * 0.5);
      float g = hash13(gp);
      float fw = length(fwidth(vLocal)) * 4.0;
      albedo *= 1.0 + (g - 0.5) * c3.w * (1.0 - smoothstep(0.4, 1.2, fw));
    }
    // ---- in-face coordinates for edges / grout
    vec2 fu, dfu;
    if (abs(vNL.x) > 0.5) { fu = fract(vLocal.yz); dfu = fwidth(vLocal.yz); }
    else if (abs(vNL.y) > 0.5) { fu = fract(vLocal.xz); dfu = fwidth(vLocal.xz); }
    else { fu = fract(vLocal.xy); dfu = fwidth(vLocal.xy); }
    vec2 ed = min(fu, 1.0 - fu);
    float pxv = 1.0 / max(max(dfu.x, dfu.y), 1e-5); // pixels per voxel
    float vis = smoothstep(3.0, 9.0, pxv);
    // grout (tiles) — width relative to voxel, AA by derivatives
    float gw = 0.06;
    vec2 gl = smoothstep(vec2(gw) - dfu * 0.75, vec2(gw) + dfu * 0.75, ed);
    float grout = 1.0 - gl.x * gl.y;
    albedo = mix(albedo, albedo * vec3(0.80, 0.84, 0.88), grout * c1.x * smoothstep(2.0, 6.0, pxv));
    // soft bevel: darken edge band, lighten top-left rim
    float bev = 1.0 - smoothstep(0.0, 0.16, min(ed.x, ed.y));
    albedo *= 1.0 - bev * 0.05 * uEdge * vis;
    // ---- lighting
    float ndl = dot(N, uSunDir);
    float dif = clamp((ndl + 0.22) / 1.22, 0.0, 1.0);
    float sh = shadowAt(vWorld, N);
    float cs = cloudShadow(vWorld.xz);
    float ao = clamp(vAO / 3.0, 0.0, 1.0);
    float aoA = 1.0 - ao * 0.52;
    vec3 hemi = mix(uGndAmb, uSkyAmb, N.y * 0.5 + 0.5);
    // cyan bounce from below
    hemi += vec3(0.05, 0.12, 0.12) * max(-N.y, 0.0);
    float cv = caveF(vWorld);
    hemi *= 1.0 - 0.74 * cv;
    float lit = dif * sh * cs * (1.0 - cv);
    // leaf / warm-cool hue split
    vec3 aLit = albedo, aSh = albedo;
    if (c3.z > 0.0) { aLit = albedo * vec3(1.10, 1.06, 0.78); aSh = albedo * vec3(0.78, 0.98, 1.12); }
    vec3 col = mix(aSh, aLit, lit) * hemi * aoA + aLit * uSunCol * lit * (1.0 - ao * 0.2);
    // translucency for leaves when back-lit
    if (c3.z > 0.0) col += albedo * vec3(0.9, 1.0, 0.45) * c3.z * 0.25 * max(-ndl, 0.0) * cs;
    // ---- specular + sky reflection on glossy materials (smooth normal)
    vec3 Vd = normalize(cameraPosition - vWorld);
    vec3 SN = normalize(vSN);
    if (c1.y > 0.0) {
      vec3 Hh = normalize(uSunDir + Vd);
      float shin = mix(12.0, 260.0, c1.z);
      float sp = pow(max(dot(SN, Hh), 0.0), shin) * (shin + 8.0) / 60.0;
      col += uSunCol * sp * c1.y * sh * cs * 0.6;
      float fr = pow(1.0 - max(dot(SN, Vd), 0.0), 4.0);
      vec3 rd = reflect(-Vd, SN);
      vec3 sky = skyColor(rd);
      sky = mix(sky, vec3(1.0), skyCloudMask(rd) * 0.6);
      col = mix(col, sky * 0.95, clamp(fr * c1.y * 0.65 + c2.w * 0.12, 0.0, 0.6));
    }
    // ---- caustics under water
    float wl = waterLevelAt(vWorld.xz);
    if (vWorld.y < wl - 0.02) {
      float dep = wl - vWorld.y;
      float ca = causticPat(vWorld.xz * 1.35 + vec2(0.0, uTime * 0.05), uTime * 0.55);
      ca = ca * 0.75 + causticPat(vWorld.xz * 0.9 - 13.0, uTime * 0.45) * 0.35;
      col += albedo * uSunCol * ca * 0.55 * smoothstep(0.0, 0.25, dep) * exp(-dep * 0.28) * (0.35 + 0.65 * sh) * cs * max(N.y, 0.25);
      col *= mix(vec3(1.0), vec3(0.80, 0.95, 1.0), smoothstep(0.0, 2.5, dep));
    }
    // ---- emissive
    col += c0.rgb * c0.a * 1.6;
    col = applyFog(col, vWorld);
    gl_FragColor = vec4(col, 1.0);
  }`;

  P.makeVoxelMaterial = function (voxSize, opts) {
    opts = opts || {};
    const m = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, {
        uPal: { value: P.palTex },
        uVox: { value: voxSize },
        uEdge: { value: opts.edge != null ? opts.edge : 1 },
        uWind: { value: 1 },
        uTint: { value: opts.tint || new THREE.Color(1, 1, 1) },
      }),
      vertexShader: VOX_VS,
      fragmentShader: VOX_FS,
    });
    m.extensions = {};
    return m;
  };

  // ---------------------------------------------------------------- glass (transparent voxels)
  const GLASS_FS = /* glsl */ `
  uniform sampler2D uPal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vSN;
  varying float vAO;
  flat varying vec3 vN;
  flat varying vec3 vNL;
  flat varying float vMat;
  ${COMMON}
  ${SHADOW}
  void main(){
    int mi = int(vMat + 0.5);
    vec4 c0 = texelFetch(uPal, ivec2(mi,0), 0);
    vec4 c2 = texelFetch(uPal, ivec2(mi,2), 0);
    vec3 N = vN;
    vec3 Vd = normalize(cameraPosition - vWorld);
    vec3 SN = normalize(vSN);
    vec2 fu, dfu;
    if (abs(vNL.x) > 0.5) { fu = fract(vLocal.yz); dfu = fwidth(vLocal.yz); }
    else if (abs(vNL.y) > 0.5) { fu = fract(vLocal.xz); dfu = fwidth(vLocal.xz); }
    else { fu = fract(vLocal.xy); dfu = fwidth(vLocal.xy); }
    vec2 ed = min(fu, 1.0 - fu);
    float pxv = 1.0 / max(max(dfu.x, dfu.y), 1e-5);
    float edge = (1.0 - smoothstep(0.0, 0.1, min(ed.x, ed.y))) * smoothstep(3.0, 10.0, pxv);
    float cell = hash13(floor(vLocal - vNL * 0.5));
    float ndl = max(dot(N, uSunDir), 0.0);
    float cs = cloudShadow(vWorld.xz);
    vec3 col = c0.rgb * (mix(uGndAmb, uSkyAmb, N.y*0.5+0.5) * 0.9 + uSunCol * ndl * 0.7 * cs);
    float fr = pow(1.0 - abs(dot(SN, Vd)), 3.0);
    vec3 rd = reflect(-Vd, SN);
    vec3 sky = mix(skyColor(rd), vec3(1.0), skyCloudMask(rd) * 0.7);
    vec3 Hh = normalize(uSunDir + Vd);
    float sp = pow(max(dot(SN, Hh), 0.0), 180.0) * 3.0 * cs;
    col = mix(col, sky, 0.25 + fr * 0.5) + uSunCol * sp;
    col += vec3(1.0) * edge * 0.25;
    float a = c2.z + fr * 0.35 + edge * 0.22 + (cell - 0.5) * 0.04;
    col = applyFog(col, vWorld);
    gl_FragColor = vec4(col, clamp(a + sp * 0.3, 0.0, 0.92));
  }`;

  P.makeGlassMaterial = function (voxSize) {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uPal: { value: P.palTex }, uVox: { value: voxSize }, uWind: { value: 0 } }),
      vertexShader: VOX_VS,
      fragmentShader: GLASS_FS,
      transparent: true,
      depthWrite: false,
    });
  };

  // ---------------------------------------------------------------- slide water (voxel layer with flow)
  const SWATER_VS = VOX_VS.replace('attribute vec4 snrm;', 'attribute vec4 snrm;\n  attribute float flow;\n  varying float vFlow;')
    .replace('vMat = data.x;', 'vMat = data.x; vFlow = flow;');
  const SWATER_FS = /* glsl */ `
  uniform sampler2D uPal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec3 vSN;
  varying float vAO;
  varying float vFlow;
  flat varying vec3 vN;
  flat varying vec3 vNL;
  flat varying float vMat;
  ${COMMON}
  ${SHADOW}
  void main(){
    vec3 N = vN;
    vec3 Vd = normalize(cameraPosition - vWorld);
    float cs = cloudShadow(vWorld.xz);
    float sh = shadowAt(vWorld, N);
    float tau = vFlow;
    // streaks travelling with the water (tau = water travel time)
    float ph = tau * 2.2 - uTime * 2.2;
    vec2 cellxz = floor(vLocal.xz + vLocal.y * 0.37);
    float jitter = hash12(cellxz) * 0.35;
    float s1 = smoothstep(0.82, 0.96, fract(ph + jitter));
    float s2 = smoothstep(0.88, 0.98, fract(ph * 1.7 + 0.3 + jitter * 0.6));
    float streak = max(s1, s2 * 0.7);
    vec3 base = mix(vec3(0.35, 0.86, 0.95), vec3(0.62, 0.95, 1.0), 0.4 + 0.3 * N.y);
    vec3 col = base * (uSkyAmb * 0.75 + uSunCol * max(dot(N, uSunDir), 0.0) * 0.6 * sh * cs);
    vec3 rd = reflect(-Vd, N);
    float fr = pow(1.0 - max(dot(N, Vd), 0.0), 3.0);
    col = mix(col, skyColor(rd), 0.2 + fr * 0.4);
    col += vec3(0.95, 1.0, 1.0) * streak * (0.55 + 0.6 * sh * cs);
    float a = 0.4 + streak * 0.38 + fr * 0.18;
    col = applyFog(col, vWorld);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.95));
  }`;
  P.makeSlideWaterMaterial = function (voxSize) {
    return new THREE.ShaderMaterial({
      uniforms: Object.assign({}, U, { uPal: { value: P.palTex }, uVox: { value: voxSize }, uWind: { value: 0 } }),
      vertexShader: SWATER_VS,
      fragmentShader: SWATER_FS,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
  };

  // ---------------------------------------------------------------- shadow depth material
  P.makeDepthMaterial = function () {
    return new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
      void main(){
        mat4 M = modelMatrix;
        #ifdef USE_INSTANCING
          M = modelMatrix * instanceMatrix;
        #endif
        gl_Position = projectionMatrix * viewMatrix * M * vec4(position, 1.0);
      }`,
      fragmentShader: `void main(){ gl_FragColor = vec4(1.0); }`,
      colorWrite: false,
      side: THREE.DoubleSide,
    });
  };

  // ---------------------------------------------------------------- particles (axis aligned cubes)
  const PART_VS = /* glsl */ `
  attribute vec4 iPos;   // xyz, size
  attribute vec4 iCol;   // rgb tint, alpha
  varying vec3 vN;
  varying vec4 vCol;
  varying vec3 vWorld;
  varying vec3 vLoc;
  void main(){
    vec3 wp = iPos.xyz + position * iPos.w;
    vN = normal;
    vCol = iCol;
    vWorld = wp;
    vLoc = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
  const PART_FS = /* glsl */ `
  varying vec3 vN;
  varying vec4 vCol;
  varying vec3 vWorld;
  varying vec3 vLoc;
  ${COMMON}
  void main(){
    vec3 N = normalize(vN);
    float ndl = dot(N, uSunDir);
    float cs = cloudShadow(vWorld.xz);
    vec3 base = vCol.rgb;
    vec3 col = base * (mix(uGndAmb, uSkyAmb, N.y*0.5+0.5) * 1.05 + uSunCol * max(ndl, 0.0) * 0.75 * cs);
    // bright highlight on the sun-facing top edge
    vec2 e = abs(vLoc.xz);
    float edge = smoothstep(0.32, 0.5, max(e.x, e.y));
    col += vec3(1.0) * max(ndl, 0.0) * (0.25 + edge * 0.35) * cs;
    col = applyFog(col, vWorld);
    gl_FragColor = vec4(col, vCol.a);
  }`;
  P.makeParticleMaterial = function () {
    return new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: PART_VS,
      fragmentShader: PART_FS,
      transparent: true,
      depthWrite: false,
    });
  };

  // ---------------------------------------------------------------- water streams (instanced boxes)
  const STREAM_VS = /* glsl */ `
  attribute vec4 iPos;   // centre xyz, alpha
  attribute vec4 iSize;  // sx, sy, sz, seed
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLoc;
  varying float vA;
  varying float vSeed;
  void main(){
    vec3 wp = iPos.xyz + position * iSize.xyz;
    vN = normal; vWorld = wp; vLoc = position; vA = iPos.w; vSeed = iSize.w;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
  const STREAM_FS = /* glsl */ `
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLoc;
  varying float vA;
  varying float vSeed;
  ${COMMON}
  void main(){
    vec3 N = normalize(vN);
    vec3 Vd = normalize(cameraPosition - vWorld);
    float ndl = dot(N, uSunDir);
    float cs = cloudShadow(vWorld.xz);
    vec3 base = mix(vec3(0.42, 0.84, 0.95), vec3(0.88, 0.99, 1.0), vSeed);
    vec3 col = base * (mix(uGndAmb, uSkyAmb, N.y*0.5+0.5) * 0.95 + uSunCol * max(ndl, 0.0) * 0.95 * cs);
    float fr = pow(1.0 - abs(dot(N, Vd)), 2.0);
    col += vec3(0.9, 1.0, 1.0) * fr * 0.25;
    vec3 a3 = abs(vLoc);
    float edge = smoothstep(0.38, 0.5, max(max(min(a3.x, 0.5), 0.0), a3.z));
    col += vec3(1.0) * edge * 0.18;
    col = applyFog(col, vWorld);
    gl_FragColor = vec4(col, vA * (0.8 + fr * 0.15 + edge * 0.1));
  }`;
  P.makeStreamMaterial = function () {
    return new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: STREAM_VS,
      fragmentShader: STREAM_FS,
      transparent: true,
      depthWrite: false,
    });
  };

  P.GLSL = { COMMON, SHADOW, CAUSTIC };
})();
