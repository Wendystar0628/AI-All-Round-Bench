window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  function m4() { return new Float32Array(16); }
  function m4id(o) {
    o = o || m4();
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  }
  function m4perspective(fovy, aspect, near, far, o) {
    o = o || m4();
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    const n11 = f / aspect;
    o[0] = n11; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = far * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = far * near * nf; o[15] = 0;
    return o;
  }
  function m4ortho(l, r, b, t, n, f, o) {
    o = o || m4();
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = nf; o[11] = 0;
    o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = n * nf; o[15] = 1;
    return o;
  }
  function m4lookAt(ex, ey, ez, tx, ty, tz, ux, uy, uz, o) {
    o = o || m4();
    let zx = ex - tx, zy = ey - ty, zz = ez - tz;
    let len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;
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
  function m4mul(a, b, o) {
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
  function m4invert(m, o) {
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
    if (!det) return m4id(o);
    det = 1.0 / det;
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
  function m4compose(px, py, pz, rx, ry, rz, sx, sy, sz, o) {
    o = o || m4();
    const cx = Math.cos(rx), sxr = Math.sin(rx), cy = Math.cos(ry), syr = Math.sin(ry), cz = Math.cos(rz), szr = Math.sin(rz);
    const m00 = cy * cz + syr * sxr * szr, m01 = -cy * szr + syr * sxr * cz, m02 = syr * cx;
    const m10 = cx * szr, m11 = cx * cz, m12 = -sxr;
    const m20 = -syr * cz + cy * sxr * szr, m21 = syr * szr + cy * sxr * cz, m22 = cy * cx;
    o[0] = m00 * sx; o[1] = m10 * sx; o[2] = m20 * sx; o[3] = 0;
    o[4] = m01 * sy; o[5] = m11 * sy; o[6] = m21 * sy; o[7] = 0;
    o[8] = m02 * sz; o[9] = m12 * sz; o[10] = m22 * sz; o[11] = 0;
    o[12] = px; o[13] = py; o[14] = pz; o[15] = 1;
    return o;
  }
  function xformPoint(m, x, y, z, out) {
    out = out || { x: 0, y: 0, z: 0 };
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    out.x = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    out.y = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    out.z = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    return out;
  }
  function xformDir(m, x, y, z, out) {
    out = out || { x: 0, y: 0, z: 0 };
    out.x = m[0] * x + m[4] * y + m[8] * z;
    out.y = m[1] * x + m[5] * y + m[9] * z;
    out.z = m[2] * x + m[6] * y + m[10] * z;
    return out;
  }

  class OrbitCam {
    constructor() {
      this.target = { x: 0, y: 0.4, z: 0 };
      this.yaw = 0.75; this.pitch = 0.30; this.dist = 3.2;
      this.fov = 42 * DEG;
      this.near = 0.03; this.far = 60;
      this.pos = { x: 0, y: 0, z: 0 };
      this.scripted = false;
      this.sp = { x: 0, y: 0, z: 0 };
      this.st = { x: 0, y: 0, z: 0 };
      this.sfov = this.fov;
      this.minPitch = -1.45; this.maxPitch = 1.45;
      this.view = m4(); this.proj = m4(); this.viewProj = m4();
      this.update();
    }
    update() {
      if (this.scripted) {
        this.pos.x = this.sp.x; this.pos.y = this.sp.y; this.pos.z = this.sp.z;
        this.target.x = this.st.x; this.target.y = this.st.y; this.target.z = this.st.z;
        this.fov = this.sfov;
      } else {
        const cp = Math.cos(this.pitch), sp2 = Math.sin(this.pitch);
        this.pos.x = this.target.x + this.dist * cp * Math.sin(this.yaw);
        this.pos.y = this.target.y + this.dist * sp2;
        this.pos.z = this.target.z + this.dist * cp * Math.cos(this.yaw);
      }
      return this;
    }
    setScripted(pos, target, fov) {
      this.scripted = true;
      this.sp.x = pos.x; this.sp.y = pos.y; this.sp.z = pos.z;
      this.st.x = target.x; this.st.y = target.y; this.st.z = target.z;
      if (fov) this.sfov = fov;
      this.update();
    }
    setFree() { this.scripted = false; this.update(); }
    orbit(dx, dy) {
      if (this.scripted) { this.scripted = false; }
      this.yaw -= dx * 0.005;
      this.pitch = clamp(this.pitch + dy * 0.005, this.minPitch, this.maxPitch);
      this.update();
    }
    zoom(d) {
      if (this.scripted) this.scripted = false;
      this.dist = clamp(this.dist * (1 + d * 0.0012), 0.4, 40);
      this.update();
    }
    pan(dx, dy) {
      if (this.scripted) this.scripted = false;
      const cp = Math.cos(this.pitch);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const s = this.dist * 0.0016;
      this.target.x -= (rx * dx - rz * dy) * s;
      this.target.z -= (rz * dx + rx * dy) * s;
      this.target.y += dy * cp * s * 0.9;
      this.update();
    }
    computeMats(aspect) {
      m4perspective(this.fov, aspect, this.near, this.far, this.proj);
      m4lookAt(this.pos.x, this.pos.y, this.pos.z, this.target.x, this.target.y, this.target.z, 0, 1, 0, this.view);
      m4mul(this.proj, this.view, this.viewProj);
      return this;
    }
  }

  APP.util = { clamp, lerp, smoothstep, TAU, DEG, m4, m4id, m4perspective, m4ortho, m4lookAt, m4mul, m4invert, m4compose, xformPoint, xformDir, OrbitCam };
})();
