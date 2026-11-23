// 三维渲染：程序化环境光照与反射、PBR 材质、平行光/点光、阴影贴图、平面图层、粒子与拖尾、景深
(function () {
  'use strict';
  const MF = (window.MF = window.MF || {});
  const M4 = MF.M4;
  const SHADOW_RES = 4096;

  const VS_SOLID = `#version 300 es
  in vec3 aPos; in vec3 aNrm; in float aHeat;
  uniform mat4 uModel; uniform mat4 uVP; uniform mat3 uNM;
  out vec3 vPos; out vec3 vNrm; out float vHeat; out vec3 vLocal;
  void main(){ vec4 w = uModel * vec4(aPos,1.); vPos = w.xyz; vNrm = uNM * aNrm; vHeat = aHeat; vLocal = aPos; gl_Position = uVP * w; }`;
  const ENV_FN = `
  uniform sampler2D uEnv; uniform float uEnvInt; uniform float uEnvRot; uniform float uEnvMips;
  vec3 envS(vec3 d, float lod){ float u = atan(d.z, d.x) / 6.28318530718 + 0.5 + uEnvRot; float v = acos(clamp(-d.y, -1., 1.)) / 3.14159265359; return textureLod(uEnv, vec2(u, v), lod).rgb; }`;
  const SHADOW_FN = `
  uniform highp sampler2DShadow uShadow; uniform mat4 uShadowVP; uniform vec4 uShadowP; // 启用, 深度, 柔和(纹素), 光源序号
  float shadowAt(vec3 wp, vec3 N, vec3 L){
    float ndl = clamp(dot(N, L), 0., 1.);
    vec3 p = wp + N * (1.5 + 4.0 * (1. - ndl));
    vec4 sc = uShadowVP * vec4(p, 1.); vec3 s = sc.xyz / sc.w * 0.5 + 0.5;
    if (s.x < 0. || s.x > 1. || s.y < 0. || s.y > 1. || s.z > 1. || s.z < 0.) return 1.;
    float r = uShadowP.z / ${SHADOW_RES}.0; float sum = 0.;
    const vec2 P[12] = vec2[12](vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696,0.457), vec2(-0.203,0.621), vec2(0.962,-0.195), vec2(0.473,-0.480), vec2(0.519,0.767), vec2(0.185,-0.893), vec2(0.507,0.064), vec2(0.896,0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));
    float ang = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853; float ca = cos(ang), sa = sin(ang);
    for (int i = 0; i < 12; i++) { vec2 q = vec2(P[i].x*ca - P[i].y*sa, P[i].x*sa + P[i].y*ca) * r; sum += texture(uShadow, vec3(s.xy + q, s.z - 0.0006)); }
    return mix(1., sum / 12., uShadowP.y);
  }`;
  const FS_SOLID = `#version 300 es
  precision highp float;
  in vec3 vPos; in vec3 vNrm; in float vHeat; in vec3 vLocal;
  uniform vec3 uCam; uniform vec3 uBase; uniform float uMetal; uniform float uRough; uniform vec3 uEmis; uniform float uOpacity; uniform float uHeatGlow; uniform vec3 uHeatCol;
  uniform int uNL; uniform vec4 uLPos[8]; uniform vec4 uLCol[8]; uniform float uExposure; uniform float uReceive;
  ${ENV_FN} ${SHADOW_FN}
  out vec4 o;
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
    return mix(mix(mix(hash3(i), hash3(i+vec3(1,0,0)), f.x), mix(hash3(i+vec3(0,1,0)), hash3(i+vec3(1,1,0)), f.x), f.y), mix(mix(hash3(i+vec3(0,0,1)), hash3(i+vec3(1,0,1)), f.x), mix(hash3(i+vec3(0,1,1)), hash3(i+vec3(1,1,1)), f.x), f.y), f.z); }
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }
  void main(){
    vec3 N = normalize(vNrm); vec3 Vv = normalize(uCam - vPos); if (dot(N, Vv) < 0.) N = -N;
    vec3 base = pow(max(uBase, 0.), vec3(2.2));
    float micro = vnoise(vLocal * 0.09) * 0.6 + vnoise(vLocal * 0.31) * 0.4;
    float rough = clamp(uRough + (micro - 0.5) * 0.10 * (0.3 + uRough), 0.03, 1.); float a = rough * rough;
    vec3 F0 = mix(vec3(0.04), base, uMetal); vec3 diff = base * (1. - uMetal);
    float NoV = max(dot(N, Vv), 1e-3); vec3 col = vec3(0.); float keyShadow = 1.;
    for (int i = 0; i < 8; i++) { if (i >= uNL) break;
      vec3 L; float att = 1.;
      if (uLPos[i].w < 0.5) L = normalize(uLPos[i].xyz);
      else { vec3 d = uLPos[i].xyz - vPos; float dist = length(d); L = d / max(dist, 1e-3); float f = clamp(1. - dist / uLCol[i].w, 0., 1.); att = f * f; }
      float sh = 1.; if (uShadowP.x > 0.5 && abs(float(i) - uShadowP.w) < 0.5 && uReceive > 0.5) { sh = shadowAt(vPos, N, L); keyShadow = sh; }
      float NoL = max(dot(N, L), 0.); if (NoL <= 0.) continue;
      vec3 Hh = normalize(L + Vv); float NoH = max(dot(N, Hh), 0.), VoH = max(dot(Vv, Hh), 0.);
      float a2 = a * a; float dd = NoH * NoH * (a2 - 1.) + 1.; float D = a2 / (3.14159265 * dd * dd);
      float k = (rough + 1.) * (rough + 1.) / 8.; float Vis = 1. / ((NoV * (1. - k) + k) * (NoL * (1. - k) + k) * 4.);
      vec3 F = F0 + (1. - F0) * pow(1. - VoH, 5.);
      col += (diff / 3.14159265 + min(D * Vis, 40.) * F) * uLCol[i].rgb * NoL * att * sh;
    }
    // 环境照明与反射（随法线与视角变化）
    vec3 R = reflect(-Vv, N);
    vec3 spec = envS(R, rough * uEnvMips); vec3 irr = envS(N, uEnvMips);
    vec4 r = rough * vec4(-1., -0.0275, -0.572, 0.022) + vec4(1., 0.0425, 1.04, -0.04);
    float a004 = min(r.x * r.x, exp2(-9.28 * NoV)) * r.x + r.y; vec2 ab = vec2(-1.04, 1.04) * a004 + r.zw;
    float amb = mix(1., keyShadow, 0.45);
    col += (irr * diff + spec * (F0 * ab.x + ab.y)) * uEnvInt * amb;
    vec3 em = pow(max(uEmis, 0.), vec3(2.2));
    float h = clamp(vHeat, 0., 4.);
    col += em + pow(max(uHeatCol, 0.), vec3(2.2)) * h * uHeatGlow * (0.6 + 0.8 * h);
    col = aces(col * uExposure); col = pow(col, vec3(1. / 2.2));
    col += (hash3(vec3(gl_FragCoord.xy, 1.7)) - 0.5) / 255.;
    o = vec4(col * uOpacity, uOpacity);
  }`;
  const VS_DEPTH = `#version 300 es
  in vec3 aPos; uniform mat4 uModel; uniform mat4 uVP; void main(){ gl_Position = uVP * uModel * vec4(aPos,1.); }`;
  const FS_DEPTH = `#version 300 es
  precision highp float; out vec4 o; void main(){ o = vec4(1.); }`;
  const VS_PLANE = `#version 300 es
  in vec2 aPos; in vec2 aUV; uniform mat4 uModel; uniform mat4 uVP; out vec2 vUV; out vec3 vPos;
  void main(){ vec4 w = uModel * vec4(aPos, 0., 1.); vPos = w.xyz; vUV = aUV; gl_Position = uVP * w; }`;
  const FS_PLANE = `#version 300 es
  precision highp float; in vec2 vUV; in vec3 vPos; uniform sampler2D uT0; uniform float uOpacity; uniform int uPass; uniform float uReceive; uniform vec3 uLDir;
  ${SHADOW_FN}
  out vec4 o;
  void main(){ vec4 c = texture(uT0, vUV) * uOpacity;
    if (uPass == 0) { if (c.a < 0.985) discard; } else if (uPass == 1) { if (c.a >= 0.985 || c.a < 0.002) discard; } else { if (c.a < 0.5) discard; o = vec4(1.); return; }
    if (uReceive > 0.5 && uShadowP.x > 0.5) { float sh = shadowAt(vPos, uLDir, uLDir); c.rgb *= sh; }
    o = c; }`;
  const VS_PART = `#version 300 es
  in vec2 aCorner; in vec3 iPos; in vec3 iVel; in float iSize; in vec4 iCol;
  uniform mat4 uVP; uniform vec2 uHalf; uniform float uZoom; uniform float uStreak; uniform float uNear;
  out vec2 vUV; out float vAsp; out vec4 vCol;
  void main(){ vec4 c = uVP * vec4(iPos, 1.); vec4 c2 = uVP * vec4(iPos + iVel * uStreak, 1.);
    if (c.w < uNear || c2.w < uNear) { gl_Position = vec4(2., 2., 2., 1.); return; }
    vec2 p = c.xy / c.w * uHalf, p2 = c2.xy / c2.w * uHalf; vec2 d = p2 - p; float len = length(d);
    float r = iSize * uZoom / c.w * 0.5; float fade = min(1., r / 0.7); r = max(r, 0.7);
    vec2 ax = len > 1e-3 ? d / len : vec2(1., 0.); vec2 ay = vec2(-ax.y, ax.x);
    vec2 off = ax * (aCorner.x * (r + len * 0.5) - len * 0.5) + ay * aCorner.y * r;
    gl_Position = vec4((p + off) / uHalf * c.w, c.z, c.w);
    vUV = aCorner; vAsp = (r + len * 0.5) / r; vCol = vec4(iCol.rgb, iCol.a * fade); }`;
  const FS_PART = `#version 300 es
  precision highp float; in vec2 vUV; in float vAsp; in vec4 vCol; uniform float uOpacity; uniform float uAdd; out vec4 o;
  void main(){ float x = abs(vUV.x) * vAsp; float d = length(vec2(max(x - (vAsp - 1.), 0.), vUV.y));
    float a = smoothstep(1., 0.15, d); a *= a; float al = vCol.a * a * uOpacity; o = vec4(vCol.rgb * al, al * (1. - uAdd)); }`;
  const VS_TRAIL = `#version 300 es
  in vec2 aCorner; in vec3 iA; in vec3 iB; in vec2 iW; in vec4 iCA; in vec4 iCB;
  uniform mat4 uVP; uniform vec2 uHalf; uniform float uZoom; uniform float uNear;
  out float vSide; out vec4 vCol;
  void main(){ vec4 ca = uVP * vec4(iA, 1.), cb = uVP * vec4(iB, 1.);
    if (ca.w < uNear || cb.w < uNear) { gl_Position = vec4(2., 2., 2., 1.); return; }
    vec2 pa = ca.xy / ca.w * uHalf, pb = cb.xy / cb.w * uHalf; vec2 d = pb - pa; float l = length(d); vec2 n = l > 1e-4 ? vec2(-d.y, d.x) / l : vec2(0., 1.);
    float t = aCorner.x; vec4 c = mix(ca, cb, t); float w = mix(iW.x, iW.y, t) * uZoom / c.w * 0.5; float fade = min(1., w / 0.6); w = max(w, 0.6);
    vec2 p = mix(pa, pb, t) + n * aCorner.y * w;
    gl_Position = vec4(p / uHalf * c.w, c.z, c.w); vSide = aCorner.y; vCol = mix(iCA, iCB, t); vCol.a *= fade; }`;
  const FS_TRAIL = `#version 300 es
  precision highp float; in float vSide; in vec4 vCol; uniform float uOpacity; uniform float uAdd; out vec4 o;
  void main(){ float a = 1. - vSide * vSide; float al = vCol.a * a * uOpacity; o = vec4(vCol.rgb * al, al * (1. - uAdd)); }`;
  const FS_DOF = `#version 300 es
  precision highp float; in vec2 vUV; uniform sampler2D uT0; uniform highp sampler2D uT1; uniform vec2 uRes; uniform vec4 uCam; // 对焦距离, 光圈*zoom*缩放, A, B
  uniform float uMaxR; out vec4 o;
  float coc(vec2 uv){ float d = texture(uT1, uv).r; float w = uCam.w / (d * 2. - 1. - uCam.z); return clamp(uCam.y * abs(1. / uCam.x - 1. / w) * 0.5, 0., uMaxR); }
  float depthAt(vec2 uv){ float d = texture(uT1, uv).r; return uCam.w / (d * 2. - 1. - uCam.z); }
  void main(){ float cr = coc(vUV); float cd = depthAt(vUV); vec4 acc = texture(uT0, vUV); float tot = 1.; float rad = 0.7; vec2 px = 1. / uRes;
    for (float ang = 0.; rad < uMaxR; ang += 2.39996323) { vec2 tc = vUV + vec2(cos(ang), sin(ang)) * px * rad; float sr = coc(tc); float sd = depthAt(tc);
      if (sd > cd) sr = clamp(sr, 0., cr * 2.);
      float m = smoothstep(rad - 0.5, rad + 0.5, sr); acc += mix(acc / tot, texture(uT0, tc), m); tot += 1.; rad += 0.75 / rad; }
    o = acc / tot; }`;
  const FS_ENVGEN = `#version 300 es
  precision highp float; in vec2 vUV; uniform int uPreset; out vec4 o;
  float spot(vec3 d, vec3 c, float size, float soft){ return smoothstep(cos(size + soft), cos(size), dot(d, normalize(c))); }
  float box(vec3 d, vec3 c, vec3 up, float w, float h, float soft){ vec3 f = normalize(c); vec3 r = normalize(cross(up, f)); vec3 u = cross(f, r); float z = dot(d, f); if (z <= 0.) return 0.; vec2 q = vec2(dot(d, r), dot(d, u)) / z; vec2 e = smoothstep(vec2(w, h) + soft, vec2(w, h), abs(q)); return e.x * e.y; }
  void main(){ float ph = (vUV.x - 0.5) * 6.28318530718; float th = vUV.y * 3.14159265359; vec3 d = vec3(cos(ph) * sin(th), -cos(th), sin(ph) * sin(th)); // y 向下：-y 为上
    float up = -d.y; vec3 c = vec3(0.);
    if (uPreset == 0) { // 影棚
      c = mix(vec3(0.03, 0.03, 0.035), vec3(0.22, 0.23, 0.26), smoothstep(-0.6, 0.6, up));
      c += vec3(7.0, 6.9, 6.6) * box(d, vec3(0.1, -1., -0.25), vec3(0., 0., 1.), 0.75, 0.5, 0.25);
      c += vec3(2.6, 2.8, 3.2) * box(d, vec3(-1., -0.25, -0.2), vec3(0., -1., 0.), 0.25, 0.9, 0.2);
      c += vec3(3.0, 2.7, 2.3) * box(d, vec3(1., -0.35, 0.5), vec3(0., -1., 0.), 0.2, 0.8, 0.2);
      c += vec3(1.2) * box(d, vec3(0., -0.2, 1.), vec3(0., -1., 0.), 1.2, 0.12, 0.1);
    } else if (uPreset == 1) { // 锻炉：暗场 + 暖色炉火 + 冷色轮廓光
      c = mix(vec3(0.012, 0.010, 0.010), vec3(0.05, 0.055, 0.07), smoothstep(-0.2, 0.9, up));
      c += vec3(9.0, 3.4, 0.9) * spot(d, vec3(-0.9, -0.12, -0.35), 0.28, 0.55);
      c += vec3(2.2, 0.7, 0.18) * spot(d, vec3(-0.6, 0.3, -0.5), 0.6, 0.9);
      c += vec3(3.4, 4.2, 5.6) * box(d, vec3(0.75, -0.8, 0.45), vec3(0., 0., 1.), 0.55, 0.3, 0.25);
      c += vec3(5.5, 5.4, 5.0) * box(d, vec3(-0.15, -1., -0.1), vec3(0., 0., 1.), 0.34, 0.2, 0.3);
      c += vec3(1.0, 1.1, 1.3) * box(d, vec3(0.2, -0.25, 1.), vec3(0., -1., 0.), 1.4, 0.08, 0.1);
    } else if (uPreset == 2) { // 天空
      c = mix(vec3(0.16, 0.13, 0.10), mix(vec3(0.75, 0.85, 1.0), vec3(0.18, 0.38, 0.85), smoothstep(0., 0.9, up)), smoothstep(-0.04, 0.04, up));
      c += vec3(30., 26., 20.) * spot(d, vec3(0.5, -0.75, -0.4), 0.035, 0.03) + vec3(1.2, 1.0, 0.7) * spot(d, vec3(0.5, -0.75, -0.4), 0.05, 0.5);
    } else { c = vec3(0.6); }
    o = vec4(c, 1.); }`;

  class R3D {
    constructor(glx, r2d) {
      this.x = glx; this.r2d = r2d; const gl = (this.gl = glx.gl);
      this.pSolid = glx.prog('solid', VS_SOLID, FS_SOLID, ['aPos', 'aNrm', 'aHeat']);
      this.pDepth = glx.prog('depth', VS_DEPTH, FS_DEPTH, ['aPos']);
      this.pPlane = glx.prog('plane', VS_PLANE, FS_PLANE, ['aPos', 'aUV']);
      this.pPart = glx.prog('part', VS_PART, FS_PART, ['aCorner', 'iPos', 'iVel', 'iSize', 'iCol']);
      this.pTrail = glx.prog('trail', VS_TRAIL, FS_TRAIL, ['aCorner', 'iA', 'iB', 'iW', 'iCA', 'iCB']);
      this.meshes = new Map(); this.frame = 0; this.envKey = '';
      // 阴影贴图
      this.shadowTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.shadowTex); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_RES, SHADOW_RES);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      this.shadowFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // 平面四边形
      this.pvao = gl.createVertexArray(); this.pvbo = gl.createBuffer(); gl.bindVertexArray(this.pvao); gl.bindBuffer(gl.ARRAY_BUFFER, this.pvbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      // 粒子实例
      this.cornerBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      this.trailCorner = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.trailCorner); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
      this.partVao = gl.createVertexArray(); this.partBuf = gl.createBuffer(); gl.bindVertexArray(this.partVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf); const st = 44;
      [[1, 3, 0], [2, 3, 12], [3, 1, 24], [4, 4, 28]].forEach(([loc, n, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, st, off); gl.vertexAttribDivisor(loc, 1); });
      this.trailVao = gl.createVertexArray(); this.trailBuf = gl.createBuffer(); gl.bindVertexArray(this.trailVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailCorner); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf); const st2 = 64;
      [[1, 3, 0], [2, 3, 12], [3, 2, 24], [4, 4, 32], [5, 4, 48]].forEach(([loc, n, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, st2, off); gl.vertexAttribDivisor(loc, 1); });
      gl.bindVertexArray(null);
    }
    // ---- 环境贴图（等距柱状 + 逐级模糊的 mip，用于按粗糙度取样）----
    env(preset) {
      const idx = { studio: 0, forge: 1, sky: 2, neutral: 3 }[preset] || 0; if (this.envTex && this.envKey === preset) return this.envTex;
      const gl = this.gl, x = this.x; const W = 512, Hh = 256, levels = 8;
      if (!this.envTex) { this.envTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.envTex); gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA16F, W, Hh); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
      gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      let cur = x.target(W, Hh, 'rgba16f'); x.pass(x.full('envgen', FS_ENVGEN), cur, [], (g, u) => g.uniform1i(u.uPreset, idx));
      for (let l = 0; l < levels; l++) {
        x.bind(cur); gl.bindTexture(gl.TEXTURE_2D, this.envTex); gl.copyTexSubImage2D(gl.TEXTURE_2D, l, 0, 0, 0, 0, cur.w, cur.h);
        if (l === levels - 1) break;
        const half = x.target(Math.max(1, cur.w >> 1), Math.max(1, cur.h >> 1), 'rgba16f'); x.blit(cur, half); x.release(cur);
        cur = this.r2d.blur(half, 1.6 + l * 0.25);
      }
      x.release(cur); this.envKey = preset; this.envLevels = levels;
      return this.envTex;
    }
    // ---- 网格缓冲 ----
    meshBuf(m) {
      let r = this.meshes.get(m); if (r) { r.used = this.frame; return r; }
      const gl = this.gl; const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vp = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vp); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const vn = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vn); gl.bufferData(gl.ARRAY_BUFFER, m.nrm, gl.STATIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      let vh = null; if (m.heat) { vh = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vh); gl.bufferData(gl.ARRAY_BUFFER, m.heat, gl.STATIC_DRAW); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0); }
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      r = { vao, bufs: [vp, vn, vh, ib], count: m.idx.length, used: this.frame, heat: !!m.heat }; this.meshes.set(m, r); return r;
    }
    gc() {
      this.frame++; if (this.frame % 30) return; const gl = this.gl;
      for (const [m, r] of this.meshes) if (this.frame - r.used > 90) { gl.deleteVertexArray(r.vao); for (const b of r.bufs) if (b) gl.deleteBuffer(b); this.meshes.delete(m); }
    }
    // 阴影：按投射物包围盒拟合正交视锥
    shadowSetup(scene) {
      const light = scene.lights.find((l) => l.kind === 'parallel' && l.shadows); const li = scene.lights.indexOf(light);
      const casters = scene.objects.filter((o) => (o.kind === 'mesh' || o.kind === 'plane') && o.cast);
      if (!light || !casters.length) return null;
      const dir = light.dir; const lw = M4.lookAt([0, 0, 0], dir, 0), lv = M4.invert(lw);
      let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      const add = (p) => { const q = M4.tp(lv, p); for (let d = 0; d < 3; d++) { if (q[d] < mn[d]) mn[d] = q[d]; if (q[d] > mx[d]) mx[d] = q[d]; } };
      for (const o of casters) {
        if (o.kind === 'mesh') { const b = o.mesh._bb || (o.mesh._bb = MF.Solid.bbox(o.mesh)); for (let i = 0; i < 8; i++) add(M4.tp(o.model, [b[i & 1 ? 3 : 0], b[i & 2 ? 4 : 1], b[i & 4 ? 5 : 2]])); }
        else { const r = o.rect; add(M4.tp(o.model, [r[0], r[1], 0])); add(M4.tp(o.model, [r[2], r[1], 0])); add(M4.tp(o.model, [r[2], r[3], 0])); add(M4.tp(o.model, [r[0], r[3], 0])); }
      }
      // 限制范围，避免巨大的地面稀释分辨率：以可见实体为主
      const lim = scene.shadowExtent || 2600; const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2;
      let hx = Math.min((mx[0] - mn[0]) / 2 + 20, lim), hy = Math.min((mx[1] - mn[1]) / 2 + 20, lim);
      let fx = cx, fy = cy;
      if (scene.focus) { const f = M4.tp(lv, scene.focus); if ((mx[0] - mn[0]) / 2 + 20 > lim) fx = f[0]; if ((mx[1] - mn[1]) / 2 + 20 > lim) fy = f[1]; }
      const zn = mn[2] - 50, zf = mx[2] + 50;
      const P = new Float64Array(16); P[0] = 1 / hx; P[5] = 1 / hy; P[10] = 2 / (zf - zn); P[12] = -fx / hx; P[13] = -fy / hy; P[14] = -(zf + zn) / (zf - zn); P[15] = 1;
      return { vp: M4.mul(P, lv), light, li, casters };
    }
    // 渲染一个三维场景到纹理（预乘 RGBA，显示空间）
    // scene: { W,H, cam:{vp,pos,zoom,near,far,focus,aperture}, lights, env, objects, rs }
    render(scene) {
      const gl = this.gl, x = this.x, W = scene.W, Hh = scene.H, cam = scene.cam;
      const envTex = this.env(scene.env.preset);
      // 1. 阴影
      const sh = this.shadowSetup(scene);
      if (sh) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo); gl.viewport(0, 0, SHADOW_RES, SHADOW_RES); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 3.0);
        const svp = new Float32Array(sh.vp);
        for (const o of sh.casters) {
          if (o.kind === 'mesh') { const p = x.use(this.pDepth); gl.uniformMatrix4fv(p.u.uVP, false, svp); gl.uniformMatrix4fv(p.u.uModel, false, new Float32Array(o.model)); const mb = this.meshBuf(o.mesh); gl.bindVertexArray(mb.vao); gl.drawElements(gl.TRIANGLES, mb.count, gl.UNSIGNED_INT, 0); }
          else this.drawPlane(o, svp, 2, null, null);
        }
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.bindVertexArray(null);
      }
      // 2. 主通道
      const ms = x.msTarget(W, Hh, 'scene');
      gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fbo); gl.viewport(0, 0, W, Hh); gl.colorMask(true, true, true, true); gl.depthMask(true); gl.clearColor(0, 0, 0, 0); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      const vpOf = (o) => new Float32Array(o.vp || cam.vp), camPosOf = (o) => o.camPos || cam.pos;
      const setLights = (p) => {
        const n = Math.min(8, scene.lights.length); const lp = new Float32Array(32), lc = new Float32Array(32);
        for (let i = 0; i < n; i++) { const l = scene.lights[i]; if (l.kind === 'parallel') { lp[i * 4] = -l.dir[0]; lp[i * 4 + 1] = -l.dir[1]; lp[i * 4 + 2] = -l.dir[2]; lp[i * 4 + 3] = 0; } else { lp[i * 4] = l.pos[0]; lp[i * 4 + 1] = l.pos[1]; lp[i * 4 + 2] = l.pos[2]; lp[i * 4 + 3] = 1; }
          const k = l.intensity * (l.kind === 'parallel' ? 3.0 : 6.0); lc[i * 4] = Math.pow(l.color[0], 2.2) * k; lc[i * 4 + 1] = Math.pow(l.color[1], 2.2) * k; lc[i * 4 + 2] = Math.pow(l.color[2], 2.2) * k; lc[i * 4 + 3] = l.range; }
        gl.uniform1i(p.u.uNL, n); gl.uniform4fv(p.u.uLPos, lp); gl.uniform4fv(p.u.uLCol, lc);
      };
      const setShadow = (p) => {
        x.tex(3, this.shadowTex); gl.uniform1i(p.u.uShadow, 3);
        if (sh) { gl.uniformMatrix4fv(p.u.uShadowVP, false, new Float32Array(sh.vp)); gl.uniform4f(p.u.uShadowP, 1, sh.light.shadowDark, Math.max(0.3, sh.light.shadowSoft), sh.li); }
        else gl.uniform4f(p.u.uShadowP, 0, 0, 0, -1);
      };
      const drawMesh = (o) => {
        const p = x.use(this.pSolid); const mat = o.mat;
        gl.uniformMatrix4fv(p.u.uVP, false, vpOf(o)); gl.uniformMatrix4fv(p.u.uModel, false, new Float32Array(o.model));
        const nm = M4.invert(o.model); gl.uniformMatrix3fv(p.u.uNM, false, new Float32Array([nm[0], nm[4], nm[8], nm[1], nm[5], nm[9], nm[2], nm[6], nm[10]]));
        const cp = camPosOf(o); gl.uniform3f(p.u.uCam, cp[0], cp[1], cp[2]);
        gl.uniform3f(p.u.uBase, mat.baseColor[0], mat.baseColor[1], mat.baseColor[2]); gl.uniform1f(p.u.uMetal, mat.metallic); gl.uniform1f(p.u.uRough, mat.roughness);
        const ei = mat.emissiveInt; gl.uniform3f(p.u.uEmis, mat.emissive[0] * Math.pow(ei, 1 / 2.2), mat.emissive[1] * Math.pow(ei, 1 / 2.2), mat.emissive[2] * Math.pow(ei, 1 / 2.2));
        gl.uniform3f(p.u.uHeatCol, mat.emissive[0], mat.emissive[1], mat.emissive[2]); gl.uniform1f(p.u.uHeatGlow, mat.heatGlow || 0);
        gl.uniform1f(p.u.uOpacity, mat.opacity); gl.uniform1f(p.u.uExposure, scene.env.exposure === undefined ? 1 : scene.env.exposure); gl.uniform1f(p.u.uReceive, o.receive ? 1 : 0);
        x.tex(2, envTex); gl.uniform1i(p.u.uEnv, 2); gl.uniform1f(p.u.uEnvInt, scene.env.intensity); gl.uniform1f(p.u.uEnvRot, (scene.env.rotation || 0) / 360); gl.uniform1f(p.u.uEnvMips, this.envLevels - 1.5);
        setLights(p); setShadow(p);
        const mb = this.meshBuf(o.mesh); gl.bindVertexArray(mb.vao); if (!mb.heat) { gl.disableVertexAttribArray(2); gl.vertexAttrib1f(2, 0); }
        gl.drawElements(gl.TRIANGLES, mb.count, gl.UNSIGNED_INT, 0);
      };
      // 不透明实体与平面的不透明部分
      for (const o of scene.objects) if (o.kind === 'mesh' && o.mat.opacity >= 0.999) drawMesh(o);
      for (const o of scene.objects) if (o.kind === 'plane') this.drawPlane(o, vpOf(o), 0, sh, setShadow);
      // 透明：按到摄像机的距离从远到近
      const trans = scene.objects.filter((o) => o.kind === 'plane' || o.kind === 'particles' || (o.kind === 'mesh' && o.mat.opacity < 0.999));
      const distOf = (o) => { const c = o.center || [0, 0, 0]; return MF.V3.dist(c, cam.pos); };
      trans.sort((a, b) => distOf(b) - distOf(a));
      gl.enable(gl.BLEND);
      for (const o of trans) {
        if (o.kind === 'mesh') { gl.colorMask(false, false, false, false); gl.depthMask(true); gl.disable(gl.BLEND); drawMesh(o); gl.colorMask(true, true, true, true); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthFunc(gl.EQUAL); drawMesh(o); gl.depthFunc(gl.LEQUAL); }
        else if (o.kind === 'plane') { gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); this.drawPlane(o, vpOf(o), 1, sh, setShadow); gl.depthMask(true); }
        else this.drawParticles(o, vpOf(o), scene, W, Hh);
      }
      gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
      // 3. 解析
      const color = x.target(W, Hh, 'rgba16f'); const dof = cam.aperture > 0.01;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, color.fbo); gl.blitFramebuffer(0, 0, W, Hh, 0, 0, W, Hh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      let out = color;
      if (dof) {
        const depth = x.target(W, Hh, 'depth'); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depth.fbo); gl.blitFramebuffer(0, 0, W, Hh, 0, 0, W, Hh, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST);
        const A = (cam.far + cam.near) / (cam.far - cam.near), B = (-2 * cam.far * cam.near) / (cam.far - cam.near);
        out = x.target(W, Hh, 'rgba16f');
        x.pass(x.full('dof', FS_DOF), out, [color, depth], (g, u) => { g.uniform4f(u.uCam, cam.focus, cam.aperture * cam.zoom * scene.rs, A, B); g.uniform1f(u.uMaxR, Math.min(26, 22 * Math.max(0.5, scene.rs))); });
        x.release(color); x.release(depth);
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST);
      return out;
    }
    drawPlane(o, vp, pass, sh, setShadow) {
      const gl = this.gl, p = this.x.use(this.pPlane); const r = o.rect;
      gl.uniformMatrix4fv(p.u.uVP, false, vp); gl.uniformMatrix4fv(p.u.uModel, false, new Float32Array(o.model)); gl.uniform1f(p.u.uOpacity, pass === 2 ? 1 : o.opacity); gl.uniform1i(p.u.uPass, pass);
      this.x.tex(0, o.tex.tex); gl.uniform1i(p.u.uT0, 0);
      if (setShadow) { setShadow(p); gl.uniform1f(p.u.uReceive, o.receive && sh ? 1 : 0); if (sh) gl.uniform3f(p.u.uLDir, -sh.light.dir[0], -sh.light.dir[1], -sh.light.dir[2]); } else { this.x.tex(3, null); gl.uniform1i(p.u.uShadow, 3); gl.uniform4f(p.u.uShadowP, 0, 0, 0, -1); gl.uniform1f(p.u.uReceive, 0); }
      gl.bindVertexArray(this.pvao); gl.bindBuffer(gl.ARRAY_BUFFER, this.pvbo);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([r[0], r[1], 0, 0, r[2], r[1], 1, 0, r[0], r[3], 0, 1, r[2], r[3], 1, 1]), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    drawParticles(o, vp, scene, W, Hh) {
      const gl = this.gl, d = o.data, cam = scene.cam; const add = d.blend !== 'normal';
      gl.depthMask(false); gl.blendFunc(gl.ONE, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
      if (d.segCount) {
        const p = this.x.use(this.pTrail); gl.uniformMatrix4fv(p.u.uVP, false, vp); gl.uniform2f(p.u.uHalf, W / 2, Hh / 2); gl.uniform1f(p.u.uZoom, cam.zoom * scene.rs); gl.uniform1f(p.u.uNear, cam.near); gl.uniform1f(p.u.uOpacity, o.opacity); gl.uniform1f(p.u.uAdd, add ? 1 : 0);
        gl.bindVertexArray(this.trailVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuf); gl.bufferData(gl.ARRAY_BUFFER, d.segs, gl.STREAM_DRAW); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, d.segCount);
      }
      if (d.count) {
        const p = this.x.use(this.pPart); gl.uniformMatrix4fv(p.u.uVP, false, vp); gl.uniform2f(p.u.uHalf, W / 2, Hh / 2); gl.uniform1f(p.u.uZoom, cam.zoom * scene.rs); gl.uniform1f(p.u.uNear, cam.near); gl.uniform1f(p.u.uOpacity, o.opacity); gl.uniform1f(p.u.uAdd, add ? 1 : 0); gl.uniform1f(p.u.uStreak, d.shape === 'dot' ? 0 : 0.012);
        gl.bindVertexArray(this.partVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.partBuf); gl.bufferData(gl.ARRAY_BUFFER, d.inst, gl.STREAM_DRAW); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, d.count);
      }
      gl.depthMask(true); gl.bindVertexArray(null);
    }
  }
  MF.R3D = R3D;
})();
