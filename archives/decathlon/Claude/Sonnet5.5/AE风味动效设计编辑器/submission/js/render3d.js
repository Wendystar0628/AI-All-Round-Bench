/* render3d.js — 三维场景：网格(PBR+环境反射)、平面图层、阴影贴图、粒子/拖尾、景深 */
(function () {
  const AE = globalThis.AE = globalThis.AE || {};
  const U = AE.U, M = U.M, Model = AE.Model, Nodes = AE.Nodes;
  const R = AE.Renderer.prototype;

  const LIGHT_CHUNK = `
const float PI = 3.14159265;
uniform vec3 uCam; uniform vec3 uEnvSky, uEnvHor, uEnvGnd; uniform float uEnvI; uniform vec3 uLobeDir[3]; uniform vec3 uLobeCol[3]; uniform float uLobePow[3];
uniform int uNL; uniform int uLT[4]; uniform vec3 uLP[4]; uniform vec3 uLD[4]; uniform vec3 uLC[4]; uniform float uLR[4]; uniform int uLS[4];
uniform sampler2D uSh2D0, uSh2D1; uniform samplerCube uShC0, uShC1;
uniform mat4 uShVP[2]; uniform int uShType[2]; uniform vec3 uShPos[2]; uniform float uShFar[2]; uniform float uShSoft[2]; uniform float uShTexel[2];
vec3 envColor(vec3 d, float rough){
  float up = -d.y * 0.5 + 0.5;
  vec3 c = mix(uEnvGnd, mix(uEnvHor, uEnvSky, smoothstep(0.5, 0.95, up)), smoothstep(0.38, 0.52, up));
  float bl = mix(1.0, 0.04, rough * rough);
  for (int i = 0; i < 3; i++) { float p = max(uLobePow[i] * bl, 1.5); float lobe = pow(max(dot(d, normalize(uLobeDir[i])), 0.0), p) * (p + 2.0) / (2.0 * 6.2832) * 6.0; c += uLobeCol[i] * lobe * (0.25 + 0.75 * bl); }
  return c * uEnvI;
}
float sh2(sampler2D tex, int slot, vec3 wp, vec3 n){
  vec4 p = uShVP[slot] * vec4(wp + n * uShTexel[slot] * 2.5, 1.0); vec3 q = p.xyz * 0.5 + 0.5; if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0 || q.z > 1.0) return 1.0;
  float sum = 0.0; float cnt = 0.0; float rad = uShSoft[slot];
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) { float d = texture(tex, q.xy + vec2(float(x), float(y)) * uShTexel[slot] * rad).r; sum += (q.z - 0.0015 > d) ? 0.0 : 1.0; cnt += 1.0; }
  return sum / cnt;
}
float shc(samplerCube tex, int slot, vec3 wp, vec3 n){
  vec3 dv = wp + n * 1.5 - uShPos[slot]; float dist = length(dv); vec3 dn = dv / dist; float rad = uShSoft[slot] * 0.012; float sum = 0.0;
  vec3 t1 = normalize(cross(dn, abs(dn.y) > 0.9 ? vec3(1,0,0) : vec3(0,1,0))); vec3 t2 = cross(dn, t1);
  for (int i = 0; i < 6; i++) { vec3 off = (i == 0 ? vec3(0.0) : (t1 * cos(float(i) * 2.094) + t2 * sin(float(i) * 2.094))) * rad * dist; float d = texture(tex, dn + off / dist).r * uShFar[slot]; sum += (dist - 2.0 > d) ? 0.0 : 1.0; }
  return sum / 6.0;
}
float shadowFor(int slot, vec3 wp, vec3 n){
  if (slot == 0) return uShType[0] == 0 ? sh2(uSh2D0, 0, wp, n) : shc(uShC0, 0, wp, n);
  if (slot == 1) return uShType[1] == 0 ? sh2(uSh2D1, 1, wp, n) : shc(uShC1, 1, wp, n);
  return 1.0;
}
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 shade(vec3 wp, vec3 N, vec3 V, vec3 albedo, float metal, float rough, float recv){
  rough = clamp(rough, 0.04, 1.0); vec3 F0 = mix(vec3(0.04), albedo, metal); float NV = max(dot(N, V), 1e-3);
  vec3 kd = albedo * (1.0 - metal); vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NV, 5.0);
  vec3 col = envColor(N, 1.0) * kd * (1.0 - Fe) / PI * 3.0;
  vec3 Rf = reflect(-V, N); col += envColor(Rf, rough) * Fe;
  for (int i = 0; i < 4; i++) {
    if (i >= uNL) break;
    vec3 L; vec3 rad;
    if (uLT[i] == 0) { L = -normalize(uLD[i]); rad = uLC[i]; }
    else { vec3 lv = uLP[i] - wp; float d = length(lv); L = lv / max(d, 1e-3); float k = clamp(1.0 - pow(d / uLR[i], 2.0), 0.0, 1.0); rad = uLC[i] * k * k * 4.0; }
    float NL = max(dot(N, L), 0.0); if (NL <= 0.0) continue;
    float vis = 1.0; if (uLS[i] >= 0 && recv > 0.5) vis = shadowFor(uLS[i], wp, N);
    vec3 H = normalize(L + V); float NH = max(dot(N, H), 0.0), VH = max(dot(V, H), 0.0); float a = rough * rough, a2 = a * a; float dd = NH * NH * (a2 - 1.0) + 1.0; float D = a2 / (PI * dd * dd);
    float k = (rough + 1.0) * (rough + 1.0) / 8.0; float Gs = (NL / (NL * (1.0 - k) + k)) * (NV / (NV * (1.0 - k) + k)); vec3 F = F0 + (1.0 - F0) * pow(1.0 - VH, 5.0);
    vec3 spec = D * Gs * F / (4.0 * NL * NV + 1e-4); vec3 diff = (1.0 - F) * kd / PI;
    col += (diff + spec) * rad * NL * vis;
  }
  return col;
}`;
  const SH3 = {};
  SH3.meshVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; uniform mat4 uVP, uModel, uView; uniform mat3 uNM; out vec3 vW, vN; out float vVZ;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = normalize(uNM * aNrm); vVZ = (uView * w).z; gl_Position = uVP * w; }`;
  SH3.meshFS = `#version 300 es
precision highp float; in vec3 vW, vN; in float vVZ; layout(location=0) out vec4 oC; layout(location=1) out vec4 oA;
uniform vec4 uBase; uniform float uMetal, uRough, uOpacity, uPass; uniform vec3 uEmit; uniform float uRecv;
` + LIGHT_CHUNK + `
void main(){
  if (uPass < 0.5 && uOpacity < 0.999) discard; if (uPass > 0.5 && uOpacity >= 0.999) discard;
  vec3 N = normalize(vN); vec3 V = normalize(uCam - vW);
  vec3 albedo = pow(max(uBase.rgb, 0.0), vec3(2.2));
  vec3 c = shade(vW, N, V, albedo, uMetal, uRough, uRecv) + uEmit;
  c = pow(aces(c), vec3(1.0 / 2.2));
  oC = vec4(c * uOpacity, uOpacity); oA = vec4(vVZ, 0.0, 0.0, 1.0);
}`;
  SH3.planeVS = `#version 300 es
layout(location=0) in vec2 aPos; uniform mat4 uVP, uModel, uView; uniform vec4 uRect; out vec3 vW; out vec2 vUV; out float vVZ;
void main(){ vec4 w = uModel * vec4(aPos, 0.0, 1.0); vW = w.xyz; vUV = (aPos - uRect.xy) / uRect.zw; vVZ = (uView * w).z; gl_Position = uVP * w; }`;
  SH3.planeFS = `#version 300 es
precision highp float; in vec3 vW; in vec2 vUV; in float vVZ; layout(location=0) out vec4 oC; layout(location=1) out vec4 oA;
uniform sampler2D uTex; uniform float uOp, uPass, uLit, uRecv; uniform vec3 uPN; uniform float uRough;
` + LIGHT_CHUNK + `
void main(){
  vec4 t = texture(uTex, vec2(vUV.x, 1.0 - vUV.y)); float a = t.a * uOp;
  if (uPass < 0.5) { if (a < 0.985) discard; } else if (uPass < 1.5) { if (a >= 0.985 || a < 0.003) discard; } else { if (a < 0.003) discard; }
  vec3 col = t.rgb * uOp;
  if (uLit > 0.5) { vec3 N = normalize(uPN); vec3 V = normalize(uCam - vW); if (dot(N, V) < 0.0) N = -N; vec3 alb = pow(max(t.rgb / max(t.a, 1e-4), 0.0), vec3(2.2)); vec3 c = shade(vW, N, V, alb, 0.0, uRough, uRecv); c = pow(aces(c), vec3(1.0 / 2.2)); col = c * t.a * uOp; }
  oC = vec4(col, a); oA = vec4(vVZ, 0.0, 0.0, 1.0);
}`;
  SH3.partVS = `#version 300 es
layout(location=0) in vec2 aC; layout(location=1) in vec4 aPS; layout(location=2) in vec4 aCol; uniform mat4 uVP; uniform vec3 uRight, uDown; out vec2 vC; out vec4 vCol;
void main(){ vC = aC; vCol = aCol; vec3 p = aPS.xyz + (uRight * aC.x + uDown * aC.y) * aPS.w; gl_Position = uVP * vec4(p, 1.0); }`;
  SH3.partFS = `#version 300 es
precision highp float; in vec2 vC; in vec4 vCol; layout(location=0) out vec4 oC; uniform float uSoft;
void main(){ float r = length(vC); if (r > 1.0) discard; float core = exp(-r * r * 3.5); float edge = smoothstep(1.0, 0.55, r); float a = vCol.a * mix(edge, core, 0.55); vec3 hot = mix(vCol.rgb, vec3(1.0, 0.95, 0.85), core * core * 0.6); oC = vec4(hot * a, a); }`;
  SH3.trailVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uVP; out vec4 vCol; void main(){ vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
  SH3.trailFS = `#version 300 es
precision highp float; in vec4 vCol; layout(location=0) out vec4 oC; void main(){ oC = vec4(vCol.rgb * vCol.a, vCol.a); }`;
  SH3.shVS = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uVP, uModel; out vec3 vW; void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; gl_Position = uVP * w; }`;
  SH3.shFS = `#version 300 es
precision highp float; in vec3 vW; out vec4 o; uniform int uMode; uniform vec3 uLP; uniform float uFar; uniform mat4 uVP;
void main(){ if (uMode == 0) { vec4 c = uVP * vec4(vW, 1.0); o = vec4(c.z / c.w * 0.5 + 0.5, 0.0, 0.0, 1.0); } else { o = vec4(length(vW - uLP) / uFar, 0.0, 0.0, 1.0); } }`;
  SH3.shPlaneVS = `#version 300 es
layout(location=0) in vec2 aPos; uniform mat4 uVP, uModel; uniform vec4 uRect; out vec3 vW; out vec2 vUV; void main(){ vec4 w = uModel * vec4(aPos, 0.0, 1.0); vW = w.xyz; vUV = (aPos - uRect.xy) / uRect.zw; gl_Position = uVP * w; }`;
  SH3.shPlaneFS = `#version 300 es
precision highp float; in vec3 vW; in vec2 vUV; out vec4 o; uniform sampler2D uTex; uniform int uMode; uniform vec3 uLP; uniform float uFar; uniform mat4 uVP;
void main(){ if (texture(uTex, vec2(vUV.x, 1.0 - vUV.y)).a < 0.5) discard; if (uMode == 0) { vec4 c = uVP * vec4(vW, 1.0); o = vec4(c.z / c.w * 0.5 + 0.5, 0.0, 0.0, 1.0); } else { o = vec4(length(vW - uLP) / uFar, 0.0, 0.0, 1.0); } }`;
  SH3.dofFS = `#version 300 es
precision highp float; in vec2 vUV; out vec4 o; uniform sampler2D uC, uA; uniform vec2 uPx; uniform float uFocus, uAper, uK, uMaxR; 
float cocOf(float z){ if (z > 9e4) return 0.0; return min(uAper * abs(z - uFocus) / max(z, 1.0) * uK, uMaxR); }
void main(){
  vec4 c0 = texture(uC, vUV); float z0 = texture(uA, vUV).r; float coc0 = cocOf(z0);
  vec4 sum = c0; float ws = 1.0; float R = uMaxR;
  for (int i = 1; i < 64; i++) {
    float fi = float(i); float r = sqrt(fi / 64.0) * R; float ang = fi * 2.39996; vec2 off = vec2(cos(ang), sin(ang)) * r;
    vec2 uv = vUV + off * uPx; float zq = texture(uA, uv).r; float cq = cocOf(zq);
    float cov = smoothstep(r - 1.0, r + 1.0, cq); if (cov <= 0.0) continue;
    float w = cov / (cq * cq + 1.0);
    if (zq > z0 + 1.0) w *= smoothstep(0.0, 1.5, coc0);
    sum += texture(uC, uv) * w; ws += w;
  }
  float w0 = 1.0 / (coc0 * coc0 + 1.0); o = (sum - c0 + c0 * w0 ) / (ws - 1.0 + w0);
}`;

  const meshGPU = new Map(); let frameNo = 0;
  R.gpuMesh = function (mesh) {
    const gl = this.gl; let e = meshGPU.get(mesh.uid);
    if (!e) {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); const n = mesh.nrm || Nodes.displayMesh(mesh).nrm;
      const inter = new Float32Array(mesh.pos.length * 2); for (let i = 0, v = mesh.pos.length / 3; i < v; i++) { inter.set(mesh.pos.subarray(3 * i, 3 * i + 3), 6 * i); inter.set(n.subarray(3 * i, 3 * i + 3), 6 * i + 3); }
      gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
      e = { vao, vb, ib, count: mesh.idx.length }; meshGPU.set(mesh.uid, e);
    }
    e.used = frameNo; return e;
  };
  R.gcMeshes = function () {
    frameNo++; if (meshGPU.size < 24) return; const gl = this.gl;
    for (const [k, e] of meshGPU) if (frameNo - e.used > 2) { gl.deleteBuffer(e.vb); gl.deleteBuffer(e.ib); gl.deleteVertexArray(e.vao); meshGPU.delete(k); }
  };
  R.planeVAO = function () { if (!this._pvao) { const gl = this.gl; this._pvao = gl.createVertexArray(); this._pbuf = gl.createBuffer(); } return this._pvao; };
  R.drawPlane = function (rect) {
    const gl = this.gl; const vao = this.planeVAO(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, this._pbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[1], rect[2], rect[3], rect[0], rect[3]]), gl.STREAM_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disableVertexAttribArray(1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  const normalMat = m => { const inv = M.invert(m); return [inv[0], inv[4], inv[8], inv[1], inv[5], inv[9], inv[2], inv[6], inv[10]]; }; // 逆转置的3x3（列主序: 转置 inv）
  const aabbWorld = (b, m) => { const out = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < 8; i++) { const p = M.pt(m, [i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]]); for (let k = 0; k < 3; k++) { if (p[k] < out[k]) out[k] = p[k]; if (p[k] > out[3 + k]) out[3 + k] = p[k]; } } return out; };

  // ---- 阴影贴图 ----
  R.shadowTargets = function () {
    if (this._sh) return this._sh; const gl = this.gl; const sh = { map: [], cube: [], depthRB: {} };
    sh.dummy2D = this.g._tex(1, 1, null); gl.bindTexture(gl.TEXTURE_2D, sh.dummy2D); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1])); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    sh.dummyCube = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, sh.dummyCube); for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1])); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    for (let s = 0; s < 2; s++) {
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 2048, 2048, 0, gl.RED, gl.FLOAT, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer(); const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, 2048, 2048);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
      sh.map.push({ tex, fbo, size: 2048 });
      const ct = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, ct); for (let f = 0; f < 6; f++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, 0, gl.R32F, 1024, 1024, 0, gl.RED, gl.FLOAT, null); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const cf = gl.createFramebuffer(); const crb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, crb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, 1024, 1024);
      gl.bindFramebuffer(gl.FRAMEBUFFER, cf); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, crb);
      sh.cube.push({ tex: ct, fbo: cf, size: 1024 });
    }
    this._sh = sh; return sh;
  };
  const CUBE_DIRS = [[[1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]], [[0, 0, 1], [0, -1, 0]], [[0, 0, -1], [0, -1, 0]]];
  const lookAtGL = (eye, dir, up) => { // 标准 GL lookAt（右手，-z 向前）
    const f = U.V.norm(dir); const s = U.V.norm(U.V.cross(f, up)); const u = U.V.cross(s, f);
    return [s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -U.V.dot(s, eye), -U.V.dot(u, eye), U.V.dot(f, eye), 1];
  };
  const persp90 = (n, f) => { const A = -(f + n) / (f - n), B = -2 * f * n / (f - n); return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, A, -1, 0, 0, B, 0]; };

  R.renderShadows = function (items, lights) {
    const gl = this.gl, g = this.g; const sh = this.shadowTargets(); const slots = []; const casters = items.filter(i => i.cast && (i.kind === 'mesh' || i.kind === 'plane'));
    let bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const it of casters) { const b = it.kind === 'mesh' ? aabbWorld(Mesh_bounds(it.mesh), it.M) : aabbWorld([it.rect[0], it.rect[1], 0, it.rect[2], it.rect[3], 0], it.M); for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], b[k]); bb[3 + k] = Math.max(bb[3 + k], b[3 + k]); } }
    if (!casters.length) return slots;
    const cen = [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2]; const rad = Math.max(Math.hypot(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]) / 2 * 1.05, 10);
    const pr = this.P('shmesh', SH3.shVS, SH3.shFS), pp = this.P('shplane', SH3.shPlaneVS, SH3.shPlaneFS);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.colorMask(true, true, true, true);
    const drawCasters = (VP, mode, lpos, far) => {
      pr.use().m4('uVP', VP).i('uMode', mode).v3('uLP', lpos).f('uFar', far);
      for (const it of casters) if (it.kind === 'mesh') { const e = this.gpuMesh(it.mesh); pr.m4('uModel', it.M); gl.bindVertexArray(e.vao); gl.drawElements(gl.TRIANGLES, e.count, gl.UNSIGNED_INT, 0); }
      pp.use().m4('uVP', VP).i('uMode', mode).v3('uLP', lpos).f('uFar', far).i('uTex', 0);
      for (const it of casters) if (it.kind === 'plane') { pp.m4('uModel', it.M).v4('uRect', [it.rect[0], it.rect[1], it.rect[2] - it.rect[0], it.rect[3] - it.rect[1]]); g.tex(0, it.rt.tex, gl.LINEAR); this.drawPlane(it.rect); }
    };
    let slot = 0;
    for (const lt of lights) {
      if (!lt.shadow || slot >= 2) { slots.push(-1); continue; }
      if (lt.type === 'dir') {
        const f = lt.dir; const up = Math.abs(f[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]; const s = U.V.norm(U.V.cross(f, up)); const u = U.V.cross(s, f);
        // 视图：行 s,u,f，原点 cen；正交缩放 1/rad
        const V = [s[0], u[0], f[0], 0, s[1], u[1], f[1], 0, s[2], u[2], f[2], 0, -U.V.dot(s, cen), -U.V.dot(u, cen), -U.V.dot(f, cen), 1];
        const S = M.scale(1 / rad, 1 / rad, 1 / rad); const VP = M.mul(S, V); const T = sh.map[slot];
        gl.bindFramebuffer(gl.FRAMEBUFFER, T.fbo); gl.viewport(0, 0, T.size, T.size); gl.clearColor(1, 1, 1, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        drawCasters(VP, 0, [0, 0, 0], 1);
        slots.push(slot); lt.sh = { slot, type: 0, vp: VP, texel: 1 / T.size, soft: Math.max(0.5, lt.soft), pos: lt.pos, far: rad * 2, tex: T.tex }; slot++;
      } else {
        const far = Math.max(lt.radius, 100); const T = sh.cube[slot];
        for (let f = 0; f < 6; f++) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, T.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + f, T.tex, 0);
          gl.viewport(0, 0, T.size, T.size); gl.clearColor(1, 1, 1, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          const VP = M.mul(persp90(2, far), lookAtGL(lt.pos, CUBE_DIRS[f][0], CUBE_DIRS[f][1]));
          drawCasters(VP, 1, lt.pos, far);
        }
        slots.push(slot); lt.sh = { slot, type: 1, vp: M.id(), texel: 1 / T.size, soft: Math.max(0.5, lt.soft), pos: lt.pos, far, tex: T.tex }; slot++;
      }
    }
    return slots;
  };
  const Mesh_bounds = m => AE.Mesh.bounds(m);

  R.bindLighting = function (pr, cam, lights, slots, env) {
    const gl = this.gl, g = this.g; const sh = this.shadowTargets();
    pr.v3('uCam', cam.pos); pr.v3('uEnvSky', env.sky).v3('uEnvHor', env.horizon).v3('uEnvGnd', env.ground).f('uEnvI', env.intensity);
    const ld = [], lc = [], lp = [], lo = [], lr = [], lt = [], ls = [];
    for (let i = 0; i < 3; i++) { const l = env.lobes[i] || { dir: [0, -1, 0], color: [0, 0, 0], power: 8, gain: 0 }; ld.push(...l.dir); lc.push(l.color[0] * l.gain, l.color[1] * l.gain, l.color[2] * l.gain); lo.push(l.power); }
    pr.v3v('uLobeDir', new Float32Array(ld)).v3v('uLobeCol', new Float32Array(lc)).fv('uLobePow', new Float32Array(lo));
    const n = Math.min(4, lights.length); const P = [], D = [], C = [], Rr = [], T = [], S = [];
    for (let i = 0; i < 4; i++) { const l = lights[i]; if (l) { P.push(...l.pos); D.push(...l.dir); C.push(...l.color); Rr.push(l.radius); T.push(l.type === 'dir' ? 0 : 1); S.push(l.sh ? l.sh.slot : -1); } else { P.push(0, 0, 0); D.push(0, 1, 0); C.push(0, 0, 0); Rr.push(1); T.push(0); S.push(-1); } }
    pr.i('uNL', n).v3v('uLP', new Float32Array(P)).v3v('uLD', new Float32Array(D)).v3v('uLC', new Float32Array(C)).fv('uLR', new Float32Array(Rr)).iv('uLT', new Int32Array(T)).iv('uLS', new Int32Array(S));
    const type = [0, 0], far = [1, 1], soft = [1, 1], texel = [1e-3, 1e-3], pos = [0, 0, 0, 0, 0, 0]; const vps = [M.id(), M.id()];
    let b2 = [sh.dummy2D, sh.dummy2D], bc = [sh.dummyCube, sh.dummyCube];
    for (const l of lights) if (l.sh) { const s = l.sh; type[s.slot] = s.type; far[s.slot] = s.far; soft[s.slot] = s.soft; texel[s.slot] = s.texel; pos[s.slot * 3] = s.pos[0]; pos[s.slot * 3 + 1] = s.pos[1]; pos[s.slot * 3 + 2] = s.pos[2]; vps[s.slot] = s.vp; if (s.type === 0) b2[s.slot] = s.tex; else bc[s.slot] = s.tex; }
    pr.iv('uShType', new Int32Array(type)).fv('uShFar', new Float32Array(far)).fv('uShSoft', new Float32Array(soft)).fv('uShTexel', new Float32Array(texel)).v3v('uShPos', new Float32Array(pos));
    const l0 = pr.l('uShVP[0]'); if (l0) gl.uniformMatrix4fv(l0, false, new Float32Array([...vps[0], ...vps[1]]));
    pr.i('uSh2D0', 5).i('uSh2D1', 6).i('uShC0', 7).i('uShC1', 8);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, b2[0]); gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, b2[1]);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_CUBE_MAP, bc[0]); gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_CUBE_MAP, bc[1]);
    gl.activeTexture(gl.TEXTURE0);
  };

  // 构建场景条目
  R.gather3D = function (comp, t, group, W, H, ctx, tOf, cam) {
    const ev = this.ev, proj = ev.project; const items = [];
    for (const L of group) {
      const tL = tOf(L);
      if (L.type === 'geo') {
        const gout = Nodes.geoOut(ev, comp, tL, L); const mesh = gout ? Nodes.displayMesh(gout) : null; if (!mesh || !mesh.idx.length) continue;
        const gv = k => ev.value(comp, L, k, tL); const base = gv('mat.base'), em = gv('mat.emit'), ei = gv('mat.emitI');
        items.push({ kind: 'mesh', L, mesh, M: ev.worldMatrix(comp, L, tL), base, metal: gv('mat.metal'), rough: gv('mat.rough'), emit: [em[0] * ei, em[1] * ei, em[2] * ei], opacity: gv('mat.opacity') * ev.value(comp, L, 'transform.opacity', tL) / 100, cast: L.geo.cast !== false, receive: L.geo.receive !== false });
      } else if (L.type === 'particles') {
        const st = AE.Sim ? AE.Sim.render(ev, comp, L, tL, cam) : null; if (st) items.push({ kind: 'particles', L, st, opacity: ev.value(comp, L, 'transform.opacity', tL) / 100 });
      } else {
        const Mw = ev.worldMatrix(comp, L, tL); const c = M.pt(Mw, [0, 0, 0]); const vz = Math.max(U.V.dot(U.V.sub(c, cam.pos), cam.fwd), 10);
        const ppu = H / (2 * vz * cam.tanHalf); const sx = Math.hypot(Mw[0], Mw[1], Mw[2]);
        const pl = this.layerPlane(comp, L, tL, ppu * sx * (ctx && ctx.planeQ || 1), Object.assign({}, ctx, { noMB: true })); if (!pl) continue;
        const n = M.dir(Mw, [0, 0, 1]);
        items.push({ kind: 'plane', L, rt: pl.rt, rect: pl.rect, M: Mw, opacity: ev.value(comp, L, 'transform.opacity', tL) / 100, cast: !!(L.geo && L.geo.cast) || L.castShadow === true, lit: !!L.lit, receive: true, nrm: U.V.norm(n), blend: L.blend });
      }
    }
    return items;
  };

  // 单次渲染
  R.render3DOnce = function (comp, t, tOf, group, W, H, ctx) {
    const gl = this.gl, g = this.g, ev = this.ev; const aspect = comp.w / comp.h;
    const tc = ev.activeCamera(comp, t); const tCam = tc ? tOf(tc) : t;
    const cam = ev.cameraMatrices(comp, tCam, aspect); const lights = ev.lights(comp, t); const env = ev.project.env || Model.defaultEnv();
    const items = this.gather3D(comp, t, group, W, H, ctx, tOf, cam);
    const meshes = items.filter(i => i.kind === 'mesh'), planes = items.filter(i => i.kind === 'plane'), parts = items.filter(i => i.kind === 'particles');
    const slots = this.renderShadows(items, lights);
    const ms = g.ms(W, H, { aux: true });
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms.fbo); gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.colorMask(true, true, true, true); gl.depthMask(true);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [1e5, 0, 0, 0]); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
    const mp = this.P('mesh3', SH3.meshVS, SH3.meshFS), pp = this.P('plane3', SH3.planeVS, SH3.planeFS);
    const drawMeshes = (pass) => {
      mp.use(); this.bindLighting(mp, cam, lights, slots, env); mp.m4('uVP', cam.vp).m4('uView', cam.view).f('uPass', pass);
      for (const it of meshes) {
        if (pass === 0 && it.opacity < 0.999 || pass === 1 && it.opacity >= 0.999) continue; const e = this.gpuMesh(it.mesh);
        mp.m4('uModel', it.M).m3('uNM', normalMat(it.M)).v4('uBase', it.base).f('uMetal', it.metal).f('uRough', it.rough).f('uOpacity', Math.max(0, Math.min(1, it.opacity))).v3('uEmit', it.emit).f('uRecv', it.receive ? 1 : 0);
        gl.bindVertexArray(e.vao); gl.drawElements(gl.TRIANGLES, e.count, gl.UNSIGNED_INT, 0);
      }
    };
    const drawPlanes = (pass, list) => {
      pp.use(); this.bindLighting(pp, cam, lights, slots, env); pp.m4('uVP', cam.vp).m4('uView', cam.view).f('uPass', pass).i('uTex', 0);
      for (const it of list || planes) {
        pp.m4('uModel', it.M).v4('uRect', [it.rect[0], it.rect[1], it.rect[2] - it.rect[0], it.rect[3] - it.rect[1]]).f('uOp', Math.max(0, it.opacity)).f('uLit', it.lit ? 1 : 0).f('uRecv', 1).v3('uPN', it.nrm).f('uRough', 0.6);
        g.tex(0, it.rt.tex, gl.LINEAR); this.drawPlane(it.rect);
      }
    };
    // 不透明
    drawMeshes(0); drawPlanes(0, planes.filter(p => !p.blend || p.blend === 'normal'));
    // 半透明：不写深度、不写辅助
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const tr = []; for (const it of meshes) if (it.opacity < 0.999) tr.push({ d: U.V.dot(U.V.sub(M.pt(it.M, [0, 0, 0]), cam.pos), cam.fwd), f: () => { }, it, k: 'm' });
    for (const it of planes) tr.push({ d: U.V.dot(U.V.sub(M.pt(it.M, [(it.rect[0] + it.rect[2]) / 2, (it.rect[1] + it.rect[3]) / 2, 0]), cam.pos), cam.fwd), it, k: 'p' });
    for (const it of parts) tr.push({ d: U.V.dot(U.V.sub(it.st.center || cam.pos, cam.pos), cam.fwd) + 1e6 * 0, it, k: 'x' });
    tr.sort((a, b) => b.d - a.d);
    for (const e of tr) {
      if (e.k === 'm') { // 单个半透明网格
        mp.use(); this.bindLighting(mp, cam, lights, slots, env); const it = e.it; const gm = this.gpuMesh(it.mesh);
        mp.m4('uVP', cam.vp).m4('uView', cam.view).f('uPass', 1).m4('uModel', it.M).m3('uNM', normalMat(it.M)).v4('uBase', it.base).f('uMetal', it.metal).f('uRough', it.rough).f('uOpacity', Math.max(0, Math.min(1, it.opacity))).v3('uEmit', it.emit).f('uRecv', it.receive ? 1 : 0);
        gl.bindVertexArray(gm.vao); gl.drawElements(gl.TRIANGLES, gm.count, gl.UNSIGNED_INT, 0);
      } else if (e.k === 'p') {
        const it = e.it;
        if (it.blend && it.blend !== 'normal') { // 相加/滤色/正片叠底
          const f = { add: [gl.ONE, gl.ONE], screen: [gl.ONE, gl.ONE_MINUS_SRC_COLOR], multiply: [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA], overlay: [gl.ONE, gl.ONE_MINUS_SRC_ALPHA] }[it.blend]; gl.blendFuncSeparate(f[0], f[1], gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          drawPlanes(2, [it]); gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else drawPlanes(1, [it]);
      } else if (e.k === 'x') this.drawParticles(e.it, cam, W, H);
    }
    gl.depthMask(true); gl.disable(gl.BLEND); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const col = g.rt(W, H), aux = g.rt(W, H); g.resolve(ms, col, aux); g.releaseMS(ms);
    gl.disable(gl.DEPTH_TEST);
    let out = col;
    if (cam.aperture > 0.01) {
      out = g.rt(W, H); const k = H / (2 * Math.max(cam.focus, 1) * cam.tanHalf); const maxR = 22 * H / 1080;
      this.pass(this.fsProg('dof', SH3.dofFS), out, pr => { pr.i('uC', 0).i('uA', 1).v2('uPx', [1 / W, 1 / H]).f('uFocus', cam.focus).f('uAper', cam.aperture).f('uK', k).f('uMaxR', maxR); g.tex(0, col.tex, gl.LINEAR); g.tex(1, aux.tex, gl.LINEAR); });
      g.release(col);
    }
    g.release(aux); this.last3D = { cam, items }; this.gcMeshes();
    return out;
  };
  // 粒子与拖尾
  R.drawParticles = function (it, cam, W, H) {
    const gl = this.gl, st = it.st; const addBlend = st.blend !== 'normal';
    if (addBlend) gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (st.trailVerts && st.trailVerts.length) {
      const pr = this.P('trail3', SH3.trailVS, SH3.trailFS).use(); pr.m4('uVP', cam.vp);
      if (!this._tvao) { this._tvao = gl.createVertexArray(); this._tbuf = gl.createBuffer(); }
      gl.bindVertexArray(this._tvao); gl.bindBuffer(gl.ARRAY_BUFFER, this._tbuf); gl.bufferData(gl.ARRAY_BUFFER, st.trailVerts, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12); gl.disableVertexAttribArray(2);
      gl.drawArrays(gl.TRIANGLES, 0, st.trailVerts.length / 7);
    }
    if (st.count > 0) {
      const pr = this.P('part3', SH3.partVS, SH3.partFS).use(); pr.m4('uVP', cam.vp).v3('uRight', cam.right).v3('uDown', cam.down);
      if (!this._pcvao) { this._pcvao = gl.createVertexArray(); this._pcq = gl.createBuffer(); this._pci = gl.createBuffer(); gl.bindVertexArray(this._pcvao); gl.bindBuffer(gl.ARRAY_BUFFER, this._pcq); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW); }
      gl.bindVertexArray(this._pcvao); gl.bindBuffer(gl.ARRAY_BUFFER, this._pcq); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this._pci); gl.bufferData(gl.ARRAY_BUFFER, st.inst, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, st.count);
      gl.vertexAttribDivisor(1, 0); gl.vertexAttribDivisor(2, 0);
    }
  };

  // 3D 组渲染（含运动模糊）
  R.render3DGroup = function (comp, t, group, W, H, ctx) {
    const g = this.g, ev = this.ev;
    const tc = ev.activeCamera(comp, t);
    const mbLayers = group.filter(L => this.mbOn(comp, L, ctx)); const camMB = tc && this.mbOn(comp, tc, ctx);
    if (!mbLayers.length && !camMB) return this.render3DOnce(comp, t, () => t, group, W, H, ctx);
    const [a, b] = this.shutter(comp);
    // 检测运动幅度（取若干局部点在快门两端的世界位移）
    let maxd = 0; const probe = [[0, 0, 0], [200, 0, 0], [0, 200, 0], [0, 0, 200]];
    const set0 = new Set(mbLayers); if (camMB) set0.add(tc);
    for (const L of set0) {
      if (L.type === 'camera') { const c0 = ev.cameraData(comp, t + a), c1 = ev.cameraData(comp, t + b); maxd = Math.max(maxd, U.V.len(U.V.sub(c0.pos, c1.pos)) * 0.5, U.V.len(U.V.sub(c0.target, c1.target)) * 0.3); continue; }
      const m0 = ev.worldMatrix(comp, L, t + a), m1 = ev.worldMatrix(comp, L, t + b);
      for (const q of probe) { const d = U.V.len(U.V.sub(M.pt(m0, q), M.pt(m1, q))); if (d > maxd) maxd = d; }
      if (L.type === 'particles') maxd = Math.max(maxd, 30);
    }
    if (maxd < 1.2) return this.render3DOnce(comp, t, () => t, group, W, H, ctx);
    const N = Math.max(3, Math.min(comp.mb.samples || 12, Math.ceil(maxd / 14) + 2, 9));
    const acc = g.rt(W, H); g.bind(acc); g.clear(0, 0, 0, 0);
    // 检查是否有运动：粗略比较矩阵
    for (let k = 0; k < N; k++) {
      const tk = t + a + (b - a) * (k + 0.5) / N; const set = new Set(mbLayers); if (camMB) set.add(tc);
      const rt = this.render3DOnce(comp, t, L => set.has(L) ? tk : t, group, W, H, ctx); this.addAccum(acc, rt, 1 / N); g.release(rt);
    }
    return acc;
  };
})();
