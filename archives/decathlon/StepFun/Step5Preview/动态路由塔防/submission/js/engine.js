/* 迷你 WebGL2 引擎：数学、几何、着色器、渲染器 */
(function (g) {
'use strict';
const TD = g.TD || (g.TD = {});

/* ---------------- 数学 ---------------- */
function m4() { return new Float32Array(16); }
function ident(o) { o = o || m4(); o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0; o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0; o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0; o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1; return o; }
function mul(a, b, o) {
  o = o || m4();
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return o;
}
function persp(fovy, aspect, near, far, o) {
  o = o || m4();
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
  o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
  return o;
}
function ortho(l, r, b, t, n, f, o) {
  o = o || m4();
  const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
  o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
  o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
  o[8] = 0; o[9] = 0; o[10] = 2 * nf; o[11] = 0;
  o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
  return o;
}
function lookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz, o) {
  o = o || m4();
  let zx = ex - cx, zy = ey - cy, zz = ez - cz;
  let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
  o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
  o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * ex + xy * ey + xz * ez);
  o[13] = -(yx * ex + yy * ey + yz * ez);
  o[14] = -(zx * ex + zy * ey + zz * ez);
  o[15] = 1;
  return o;
}
/* 由 位置/旋转(弧度 xyz)/缩放 组合 */
function compose(px, py, pz, rx, ry, rz, sx, sy, sz, o) {
  o = o || m4();
  const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
  // R = Rz*Ry*Rx
  const m00 = cz * cy, m01 = cz * syr * sxr - szr * cx, m02 = cz * syr * cx + szr * sxr;
  const m10 = szr * cy, m11 = szr * syr * sxr + cz * cx, m12 = szr * syr * cx - cz * sxr;
  const m20 = -syr, m21 = cy * sxr, m22 = cy * cx;
  o[0] = m00 * sx; o[1] = m10 * sx; o[2] = m20 * sx; o[3] = 0;
  o[4] = m01 * sy; o[5] = m11 * sy; o[6] = m21 * sy; o[7] = 0;
  o[8] = m02 * sz; o[9] = m12 * sz; o[10] = m22 * sz; o[11] = 0;
  o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
  return o;
}
function invert(m, o) {
  o = o || m4();
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return ident(o);
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
function normalMat3(m, o) {
  o = o || new Float32Array(9);
  const inv = invert(m, _tmpInv);
  // upper-left 3x3 of inverse, transposed
  o[0] = inv[0]; o[1] = inv[4]; o[2] = inv[8];
  o[3] = inv[1]; o[4] = inv[5]; o[5] = inv[9];
  o[6] = inv[2]; o[7] = inv[6]; o[8] = inv[10];
  return o;
}
const _tmpInv = m4();
function xformPoint(m, x, y, z, out) {
  out = out || [0, 0, 0];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
  out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return out;
}
TD.M4 = { m4, ident, mul, persp, ortho, lookAt, compose, invert, normalMat3, xformPoint };

/* ---------------- 几何 ---------------- */
/* 返回 {p:[],n:[],i:[]} */
function geoBox(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const p = [], n = [], idx = [];
  function face(a, b, c, d, nx, ny, nz) {
    const s = p.length / 3;
    p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let k = 0; k < 4; k++) n.push(nx, ny, nz);
    idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  face([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], 0, 0, 1);
  face([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], 0, 0, -1);
  face([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], 1, 0, 0);
  face([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], -1, 0, 0);
  face([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], 0, 1, 0);
  face([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], 0, -1, 0);
  return { p, n, i: idx };
}
function geoCyl(rt, rb, h, seg, capT, capB) {
  const p = [], n = [], idx = [];
  seg = seg || 10;
  for (let k = 0; k <= seg; k++) {
    const a = k / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    p.push(rt * ca, h / 2, rt * sa); n.push(ca, 0, sa);
    p.push(rb * ca, -h / 2, rb * sa); n.push(ca, 0, sa);
  }
  for (let k = 0; k < seg; k++) {
    const s = k * 2;
    idx.push(s, s + 1, s + 3, s, s + 3, s + 2);
  }
  function cap(y, r, ny) {
    const s = p.length / 3;
    p.push(0, y, 0); n.push(0, ny, 0);
    for (let k = 0; k <= seg; k++) {
      const a = k / seg * Math.PI * 2;
      p.push(r * Math.cos(a), y, r * Math.sin(a)); n.push(0, ny, 0);
    }
    for (let k = 0; k < seg; k++) idx.push(s, s + 1 + k, s + 2 + k);
  }
  if (capT !== false) cap(h / 2, rt, 1);
  if (capB !== false) cap(-h / 2, rb, -1);
  return { p, n, i: idx };
}
function geoSph(r, seg, ring) {
  seg = seg || 10; ring = ring || 7;
  const p = [], n = [], idx = [];
  for (let j = 0; j <= ring; j++) {
    const v = j / ring, phi = v * Math.PI;
    for (let k = 0; k <= seg; k++) {
      const u = k / seg, th = u * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
      p.push(x * r, y * r, z * r); n.push(x, y, z);
    }
  }
  for (let j = 0; j < ring; j++) for (let k = 0; k < seg; k++) {
    const a = j * (seg + 1) + k, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { p, n, i: idx };
}
function geoCone(r, h, seg) {
  seg = seg || 8;
  const p = [], n = [], idx = [];
  for (let k = 0; k <= seg; k++) {
    const a = k / seg * Math.PI * 2;
    p.push(r * Math.cos(a), -h / 2, r * Math.sin(a)); n.push(Math.cos(a) * .7, .5, Math.sin(a) * .7);
  }
  const s = p.length / 3;
  p.push(0, h / 2, 0); n.push(0, 1, 0);
  for (let k = 0; k < seg; k++) idx.push(k, s, k + 1);
  const b = p.length / 3;
  p.push(0, -h / 2, 0); n.push(0, -1, 0);
  for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; p.push(r * Math.cos(a), -h / 2, r * Math.sin(a)); n.push(0, -1, 0); }
  for (let k = 0; k < seg; k++) idx.push(b, b + 1 + k, b + 2 + k);
  return { p, n, i: idx };
}
/* 圆环（XY 平面，法线 +Z） */
function geoQuad(w, h) {
  return { p: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0], n: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], i: [0, 1, 2, 0, 2, 3] };
}
function geoRing(r, w, h) {
  const p = [], n = [], idx = [];
  for (let k = 0; k <= 24; k++) {
    const a = k / 24 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    p.push(r * c, 0, r * s, (r + w) * c, 0, (r + w) * s);
    n.push(0, 1, 0, 0, 1, 0);
  }
  for (let k = 0; k < 24; k++) { const a = k * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  return { p, n, i: idx };
}
function geoPrism(w, h, d) { /* 三棱柱，沿 z */ const p = [], n = [], idx = []; const a = [-w / 2, -h / 2, d / 2], b = [w / 2, -h / 2, d / 2], c = [0, h / 2, d / 2]; function tri(A, B, C, z) { const s = p.length / 3; p.push(A[0], A[1], z, B[0], B[1], z, C[0], C[1], z); n.push(0, 0, z > 0 ? 1 : -1, 0, 0, z > 0 ? 1 : -1, 0, 0, z > 0 ? 1 : -1); idx.push(s, s + 1, s + 2); } tri(a, b, c, d / 2); tri(c, b, a, -d / 2); function quad(A, B, z1, z2) { const s = p.length / 3; p.push(A[0], A[1], z1, B[0], B[1], z1, B[0], B[1], z2, A[0], A[1], z2); const nx = -(B[1] - A[1]), ny = (B[0] - A[0]); const l = Math.hypot(nx, ny) || 1; for (let k = 0; k < 4; k++) n.push(nx / l, ny / l, 0); idx.push(s, s + 1, s + 2, s, s + 2, s + 3); } quad(a, b, -d / 2, d / 2); quad(b, c, -d / 2, d / 2); quad(c, a, -d / 2, d / 2); return { p, n, i: idx }; }
TD.Geo = { geoBox, geoCyl, geoSph, geoCone, geoQuad, geoRing, geoPrism };

/* ---------------- 累加器 ---------------- */
function Acc() { this.p = []; this.n = []; this.c = []; this.e = []; this.b = []; this.idx = []; this.vc = 0; }
Acc.prototype.add = function (geo, m, col, emis, bill, nm) {
  const p = geo.p, n = geo.n, idx = geo.i, base = this.vc;
  if (!nm) nm = normalMat3(m);
  for (let k = 0; k < p.length; k += 3) {
    const x = p[k], y = p[k + 1], z = p[k + 2];
    this.p.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
    const nx = n[k], ny = n[k + 1], nz = n[k + 2];
    this.n.push(nm[0] * nx + nm[3] * ny + nm[6] * nz, nm[1] * nx + nm[4] * ny + nm[7] * nz, nm[2] * nx + nm[5] * ny + nm[8] * nz);
    this.c.push(col[0], col[1], col[2]);
    this.e.push(emis || 0);
    this.b.push(bill ? 1 : 0);
  }
  for (let k = 0; k < idx.length; k++) this.idx.push(idx[k] + base);
  this.vc += p.length / 3;
  return this;
};
Acc.prototype.build = function () {
  const vc = this.vc;
  if (!vc) return null;
  const verts = new Float32Array(vc * 11);
  for (let k = 0; k < vc; k++) {
    const o = k * 11;
    verts[o] = this.p[k * 3]; verts[o + 1] = this.p[k * 3 + 1]; verts[o + 2] = this.p[k * 3 + 2];
    verts[o + 3] = this.n[k * 3]; verts[o + 4] = this.n[k * 3 + 1]; verts[o + 5] = this.n[k * 3 + 2];
    verts[o + 6] = this.c[k * 3]; verts[o + 7] = this.c[k * 3 + 1]; verts[o + 8] = this.c[k * 3 + 2];
    verts[o + 9] = this.e[k]; verts[o + 10] = this.b[k];
  }
  return { verts, idx: new Uint32Array(this.idx), count: this.idx.length };
};
TD.Acc = Acc;

/* ---------------- 渲染器 ---------------- */
const VS_MAIN = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aEmis;
layout(location=4) in float aBill;
uniform mat4 uProj,uView,uModel,uLightVP;
uniform mat3 uNMat;
uniform vec3 uCamRight,uCamUp;
out vec3 vN; out vec3 vW; out vec4 vSC; out vec3 vC; out float vE;
void main(){
  vec4 wp;
  if(aBill>0.5){
    vec3 c = vec3(uModel[3][0],uModel[3][1],uModel[3][2]);
    float sc = length(vec3(uModel[0][0],uModel[0][1],uModel[0][2]));
    wp = vec4(c + uCamRight*(aPos.x*sc) + uCamUp*(aPos.y*sc) + vec3(0.0,0.0,aPos.z*sc),1.0);
    vN = vec3(0.0,0.0,1.0);
  } else {
    wp = uModel*vec4(aPos,1.0);
    vN = uNMat*aNrm;
  }
  vW = wp.xyz; vSC = uLightVP*wp; vC = aCol; vE = aEmis;
  gl_Position = uProj*uView*wp;
}`;
const FS_MAIN = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vN; in vec3 vW; in vec4 vSC; in vec3 vC; in float vE;
uniform vec3 uLightDir,uLightCol,uCamPos,uFog,uAmbTop,uAmbBot;
uniform float uFogDen,uAlpha,uEmis,uShadowOn;
uniform sampler2DShadow uShadow;
uniform vec2 uShadowTexel;
out vec4 outColor;
float shFactor(vec4 sc){
  if(uShadowOn<0.5) return 1.0;
  vec3 p = sc.xyz/sc.w;
  if(p.z>1.0||p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0) return 1.0;
  float s=0.0;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 o = vec2(float(x),float(y))*uShadowTexel*1.5;
    s += texture(uShadow, vec3(p.xy+o, p.z-0.0008));
  }
  return s/9.0;
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCamPos - vW);
  if(dot(N,V)<0.0) N = -N;
  vec3 L = uLightDir;
  float ndl = max(dot(N,L),0.0);
  vec3 H = normalize(L+V);
  float spec = pow(max(dot(N,H),0.0),40.0)*0.35;
  float sh = shFactor(vSC);
  vec3 amb = mix(uAmbBot,uAmbTop, clamp(N.y*0.5+0.5,0.0,1.0));
  vec3 col = vC*(amb + uLightCol*ndl*sh) + uLightCol*spec*sh + vC*vE*uEmis;
  float d = length(uCamPos - vW);
  float f = 1.0-exp(-pow(max(d*uFogDen,0.0),2.2));
  col = mix(col, uFog, clamp(f,0.0,1.0));
  outColor = vec4(col, uAlpha);
}`;
const VS_SHADOW = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
layout(location=3) in float aEmis;
layout(location=4) in float aBill;
uniform mat4 uLightVP,uModel;
void main(){ gl_Position = uLightVP*uModel*vec4(aPos,1.0); }`;
const FS_SHADOW = `#version 300 es
precision highp float;
void main(){}`;
const VS_SKY = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.999,1.0); }`;
const FS_SKY = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec3 uTop,uBot,uGlow;
uniform vec2 uSunPos;
out vec4 outColor;
float hash(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }
void main(){
  vec3 c = mix(uBot,uTop, pow(vUV.y,1.3));
  float d = length((vUV-uSunPos)*vec2(1.6,1.0));
  c += uGlow*exp(-d*4.5)*0.9;
  c += uGlow*exp(-d*16.0)*0.5;
  outColor = vec4(c,1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s), src);
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
  return p;
}

const Renderer = {
  canvas: null, gl: null, w: 1, h: 1, dpr: 1,
  shadowSize: 2048,
  env: null,
  init(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) { alert('需要支持 WebGL2 的浏览器'); return false; }
    this.gl = gl;
    this.pMain = program(gl, VS_MAIN, FS_MAIN);
    this.pShadow = program(gl, VS_SHADOW, FS_SHADOW);
    this.pSky = program(gl, VS_SKY, FS_SKY);
    this.u = {};
    for (const p of [this.pMain, this.pShadow, this.pSky]) {
      const o = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); o[info.name] = gl.getUniformLocation(p, info.name); }
      this.u[p === this.pMain ? 'main' : (p === this.pShadow ? 'shadow' : 'sky')] = o;
    }
    // sky quad
    this.skyVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBO);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.vaoEmpty = gl.createVertexArray();
    // shadow fb
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    return true;
  },
  resize(w, h, dpr) {
    this.w = Math.max(1, w); this.h = Math.max(1, h); this.dpr = dpr || 1;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
  },
  setStatic(mesh) { this.staticMesh = mesh; },
  _meshVAO(mesh) {
    const gl = this.gl;
    if (mesh.vao) return mesh.vao;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.STATIC_DRAW);
    const stride = 44;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    mesh.vao = vao; mesh.vbo = vbo; mesh.ibo = ibo;
    return vao;
  },
  _dynVAO(mesh) {
    const gl = this.gl;
    if (!this.dynRes) {
      const vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, 26 * 1024 * 1024, gl.DYNAMIC_DRAW);
      const stride = 44;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bindVertexArray(null);
      this.dynRes = { vao, vbo, ibo };
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynRes.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.verts);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.dynRes.ibo);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, mesh.idx);
    return this.dynRes.vao;
  },
  /* cam: {proj,view,pos,right,up} */
  render(cam, dynOpaque, dynTrans) {
    const gl = this.gl, u = this.u.main, env = this.env;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // ---- 阴影 ----
    if (env.shadows) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.pShadow);
      gl.uniformMatrix4fv(this.u.shadow.uLightVP, false, cam.lightVP);
      gl.disable(gl.CULL_FACE);
      const meshes = [this.staticMesh, dynOpaque];
      for (const m of meshes) {
        if (!m || !m.count) continue;
        const vao = m === this.staticMesh ? this._meshVAO(m) : this._dynVAO(m);
        gl.bindVertexArray(vao);
        gl.uniformMatrix4fv(this.u.shadow.uModel, false, ident(_m4));
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }
      gl.enable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // ---- 天空 ----
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.pSky);
    gl.bindVertexArray(this.vaoEmpty);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyVBO);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3fv(this.u.sky.uTop, env.skyTop);
    gl.uniform3fv(this.u.sky.uBot, env.skyBot);
    gl.uniform3fv(this.u.sky.uGlow, env.skyGlow);
    gl.uniform2f(this.u.sky.uSunPos, env.sunPos[0], env.sunPos[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    // ---- 主体 ----
    gl.useProgram(this.pMain);
    gl.uniformMatrix4fv(u.uProj, false, cam.proj);
    gl.uniformMatrix4fv(u.uView, false, cam.view);
    gl.uniform3fv(u.uCamPos, cam.pos);
    gl.uniform3fv(u.uCamRight, cam.right);
    gl.uniform3fv(u.uCamUp, cam.up);
    gl.uniform3fv(u.uLightDir, env.lightDir);
    gl.uniform3fv(u.uLightCol, env.lightCol);
    gl.uniform3fv(u.uFog, env.fog);
    gl.uniform3fv(u.uAmbTop, env.ambTop);
    gl.uniform3fv(u.uAmbBot, env.ambBot);
    gl.uniform1f(u.uFogDen, env.fogDen);
    gl.uniform1f(u.uEmis, env.emis || 1.0);
    gl.uniform1f(u.uShadowOn, env.shadows ? 1 : 0);
    gl.uniform1i(u.uShadow, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform2f(u.uShadowTexel, 1 / this.shadowSize, 1 / this.shadowSize);
    // 静态
    if (this.staticMesh && this.staticMesh.count) {
      gl.uniformMatrix4fv(u.uModel, false, ident(_m4));
      gl.uniformMatrix3fv(u.uNMat, false, ident(_m3));
      gl.bindVertexArray(this._meshVAO(this.staticMesh));
      gl.drawElements(gl.TRIANGLES, this.staticMesh.count, gl.UNSIGNED_INT, 0);
    }
    if (dynOpaque && dynOpaque.count) {
      gl.uniformMatrix4fv(u.uModel, false, ident(_m4));
      gl.uniformMatrix3fv(u.uNMat, false, ident(_m3));
      gl.bindVertexArray(this._dynVAO(dynOpaque));
      gl.drawElements(gl.TRIANGLES, dynOpaque.count, gl.UNSIGNED_INT, 0);
    }
    // ---- 透明 ----
    if (dynTrans && dynTrans.count) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.uniformMatrix4fv(u.uModel, false, ident(_m4));
      gl.uniformMatrix3fv(u.uNMat, false, ident(_m3));
      gl.uniform1f(u.uAlpha, 1.0);
      gl.bindVertexArray(this._dynVAO(dynTrans));
      gl.drawElements(gl.TRIANGLES, dynTrans.count, gl.UNSIGNED_INT, 0);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }
};
const _m4 = m4(), _m3 = new Float32Array(9);
TD.Renderer = Renderer;

/* 摄像机（Blender 风格环绕） */
function Camera() {
  this.target = [0, 0, 0]; this.dist = 200; this.yaw = 0.6; this.pitch = 0.85;
  this.pos = [0, 0, 0]; this.proj = m4(); this.view = m4(); this.lightVP = m4();
  this.right = [1, 0, 0]; this.up = [0, 1, 0];
  this.fov = 0.82; this.near = 1; this.far = 900;
}
Camera.prototype.update = function (aspect, lightDir, lightCenter, lightRadius) {
  const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
  const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
  this.pos[0] = this.target[0] + this.dist * cp * sy;
  this.pos[1] = this.target[1] + this.dist * sp;
  this.pos[2] = this.target[2] + this.dist * cp * cy;
  persp(this.fov, aspect, this.near, this.far, this.proj);
  lookAt(this.pos[0], this.pos[1], this.pos[2], this.target[0], this.target[1], this.target[2], 0, 1, 0, this.view);
  // right/up
  const zx = this.pos[0] - this.target[0], zy = this.pos[1] - this.target[1], zz = this.pos[2] - this.target[2];
  const l = Math.hypot(zx, zy, zz) || 1;
  const f = [zx / l, zy / l, zz / l];
  const r = [f[2], 0, -f[0]]; const rl = Math.hypot(r[0], r[2]) || 1;
  this.right = [r[0] / rl, 0, r[2] / rl];
  this.up = [this.right[1] * f[2] - this.right[2] * f[1], this.right[2] * f[0] - this.right[0] * f[2], this.right[0] * f[1] - this.right[1] * f[0]];
  const ul = Math.hypot(this.up[0], this.up[1], this.up[2]) || 1;
  this.up = [this.up[0] / ul, this.up[1] / ul, this.up[2] / ul];
  // 光源视锥
  const lx = lightCenter[0] - lightDir[0] * lightRadius * 2.2, ly = lightCenter[1] - lightDir[1] * lightRadius * 2.2, lz = lightCenter[2] - lightDir[2] * lightRadius * 2.2;
  lookAt(lx, ly, lz, lightCenter[0], lightCenter[1], lightCenter[2], 0, 1, 0, _lm);
  ortho(-lightRadius, lightRadius, -lightRadius, lightRadius, 1, lightRadius * 4.4, _lo);
  mul(_lo, _lm, this.lightVP);
  return this;
};
const _lm = m4(), _lo = m4();
TD.Camera = Camera;

/* 屏幕射线（用于拾取） */
Camera.prototype.ray = function (nx, ny, aspect) {
  const invProj = invert(this.proj, _ip);
  const invView = invert(this.view, _iv);
  const m = mul(invView, invProj, _im);
  const p0 = xformPoint(m, nx, ny, -1, _p0);
  const p1 = xformPoint(m, nx, ny, 1, _p1);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  return { o: [p0[0], p0[1], p0[2]], d: [dx / l, dy / l, dz / l] };
};
const _ip = m4(), _iv = m4(), _im = m4(), _p0 = [0, 0, 0], _p1 = [0, 0, 0];

})(typeof window !== 'undefined' ? window : globalThis);
