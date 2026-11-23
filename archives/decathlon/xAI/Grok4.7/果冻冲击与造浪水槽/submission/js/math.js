/* global JW */
var JW = JW || {};

JW.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
JW.lerp = function (a, b, t) { return a + (b - a) * t; };
JW.smooth = function (a, b, x) {
  var t = JW.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

JW.v3 = function (x, y, z) { return { x: x, y: y, z: z }; };

JW.dot = function (a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; };
JW.cross = function (a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
};
JW.len = function (a) { return Math.hypot(a.x, a.y, a.z); };
JW.norm = function (a) {
  var l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
JW.add = function (a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; };
JW.sub = function (a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; };
JW.mul = function (a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; };

JW.quatFromAngVel = function (q, w, dt) {
  var hw = 0.5 * dt;
  var x = q.x + hw * (w.x * q.w + w.y * q.z - w.z * q.y);
  var y = q.y + hw * (w.y * q.w + w.z * q.x - w.x * q.z);
  var z = q.z + hw * (w.z * q.w + w.x * q.y - w.y * q.x);
  var ww = q.w + hw * (-w.x * q.x - w.y * q.y - w.z * q.z);
  var l = Math.hypot(x, y, z, ww) || 1;
  return { x: x / l, y: y / l, z: z / l, w: ww / l };
};

JW.mat4 = function () {
  var m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

JW.mulMat = function (a, b) {
  var o = new Float32Array(16);
  for (var c = 0; c < 4; c++) {
    for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
};

JW.perspective = function (fovY, aspect, near, far) {
  var m = new Float32Array(16);
  var f = 1 / Math.tan(fovY * 0.5);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (far * near) / (near - far);
  return m;
};

JW.ortho = function (left, right, bottom, top, near, far) {
  var m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = 1 / (near - far);
  m[12] = (right + left) / (left - right);
  m[13] = (top + bottom) / (bottom - top);
  m[14] = near / (near - far);
  m[15] = 1;
  return m;
};

JW.lookAt = function (eye, target, up) {
  var zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  var zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  var xx = up[1] * zz - up[2] * zy;
  var xy = up[2] * zx - up[0] * zz;
  var xz = up[0] * zy - up[1] * zx;
  var xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  var yx = zy * xz - zz * xy;
  var yy = zz * xx - zx * xz;
  var yz = zx * xy - zy * xx;
  var m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
};

JW.invertMat = function (m) {
  var inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!det) return JW.mat4();
  det = 1 / det;
  for (var i = 0; i < 16; i++) inv[i] *= det;
  return inv;
};

JW.cameraMatrices = function (cam, aspect) {
  var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  var eye = [
    cam.target[0] + cam.dist * cp * sy,
    cam.target[1] + cam.dist * sp,
    cam.target[2] + cam.dist * cp * cy
  ];
  var view = JW.lookAt(eye, cam.target, [0, 1, 0]);
  var proj = JW.perspective(cam.fov, aspect, 0.05, 80);
  var viewProj = JW.mulMat(proj, view);
  return { eye: eye, view: view, proj: proj, viewProj: viewProj, invView: JW.invertMat(view), invProj: JW.invertMat(proj) };
};
