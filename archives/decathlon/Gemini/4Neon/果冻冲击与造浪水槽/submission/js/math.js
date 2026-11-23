// js/math.js — Core 3D Math, Symmetric 3x3 Eigensolver, Geometry & Deterministic PRNG
(function (global) {
  'use strict';
  const App = (global.App = global.App || {});

  function createRNG(seed) {
    let s = (seed >>> 0) || 1;
    return function rand() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function smootherstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  // Column-major 4x4 matrix utilities (WebGPU NDC z in [0, 1])
  const Mat4 = {
    create() {
      const m = new Float32Array(16);
      m[0] = m[5] = m[10] = m[15] = 1;
      return m;
    },
    identity(out) {
      out.fill(0);
      out[0] = out[5] = out[10] = out[15] = 1;
      return out;
    },
    multiply(out, a, b) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
      out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
      out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
      out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
      out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      return out;
    },
    perspectiveZO(out, fovyRad, aspect, near, far) {
      const f = 1.0 / Math.tan(fovyRad * 0.5);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[11] = -1;
      const nf = 1 / (near - far);
      out[10] = far * nf;
      out[14] = far * near * nf;
      return out;
    },
    orthoZO(out, left, right, bottom, top, near, far) {
      const lr = 1 / (left - right);
      const bt = 1 / (bottom - top);
      const nf = 1 / (near - far);
      out.fill(0);
      out[0] = -2 * lr;
      out[5] = -2 * bt;
      out[10] = nf;
      out[12] = (left + right) * lr;
      out[13] = (top + bottom) * bt;
      out[14] = near * nf;
      out[15] = 1;
      return out;
    },
    lookAt(out, eye, target, up) {
      let zx = eye[0] - target[0];
      let zy = eye[1] - target[1];
      let zz = eye[2] - target[2];
      let len = Math.hypot(zx, zy, zz);
      if (len < 1e-6) { zz = 1; len = 1; }
      zx /= len; zy /= len; zz /= len;

      let xx = up[1] * zz - up[2] * zy;
      let xy = up[2] * zx - up[0] * zz;
      let xz = up[0] * zy - up[1] * zx;
      len = Math.hypot(xx, xy, xz);
      if (len < 1e-6) { xx = 1; xy = 0; xz = 0; len = 1; }
      xx /= len; xy /= len; xz /= len;

      const yx = zy * xz - zz * xy;
      const yy = zz * xx - zx * xz;
      const yz = zx * xy - zy * xx;

      out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
      out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
      out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
      out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
      out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
      out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
      out[15] = 1;
      return out;
    },
    invert(out, a) {
      const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
      const b00 = a00 * a11 - a01 * a10;
      const b01 = a00 * a12 - a02 * a10;
      const b02 = a00 * a13 - a03 * a10;
      const b03 = a01 * a12 - a02 * a11;
      const b04 = a01 * a13 - a03 * a11;
      const b05 = a02 * a13 - a03 * a12;
      const b06 = a20 * a31 - a21 * a30;
      const b07 = a20 * a32 - a22 * a30;
      const b08 = a20 * a33 - a23 * a30;
      const b09 = a21 * a32 - a22 * a31;
      const b10 = a21 * a33 - a23 * a31;
      const b11 = a22 * a33 - a23 * a32;
      let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (Math.abs(det) < 1e-12) return Mat4.identity(out);
      det = 1.0 / det;
      out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return out;
    },
    fromRotationTranslationScale(out, q, t, s) {
      const x = q[0], y = q[1], z = q[2], w = q[3];
      const x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2;
      const yy = y * y2, yz = y * z2, zz = z * z2;
      const wx = w * x2, wy = w * y2, wz = w * z2;
      const sx = s[0], sy = s[1], sz = s[2];
      out[0] = (1 - (yy + zz)) * sx;
      out[1] = (xy + wz) * sx;
      out[2] = (xz - wy) * sx;
      out[3] = 0;
      out[4] = (xy - wz) * sy;
      out[5] = (1 - (xx + zz)) * sy;
      out[6] = (yz + wx) * sy;
      out[7] = 0;
      out[8] = (xz + wy) * sz;
      out[9] = (yz - wx) * sz;
      out[10] = (1 - (xx + yy)) * sz;
      out[11] = 0;
      out[12] = t[0];
      out[13] = t[1];
      out[14] = t[2];
      out[15] = 1;
      return out;
    }
  };

  // Quaternion helper: [x, y, z, w]
  const Quat = {
    integrate(q, wx, wy, wz, dt) {
      const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
      const h = 0.5 * dt;
      let nx = qx + h * (wx * qw + wy * qz - wz * qy);
      let ny = qy + h * (wy * qw + wz * qx - wx * qz);
      let nz = qz + h * (wz * qw + wx * qy - wy * qx);
      let nw = qw + h * (-wx * qx - wy * qy - wz * qz);
      const inv = 1 / (Math.hypot(nx, ny, nz, nw) || 1);
      q[0] = nx * inv;
      q[1] = ny * inv;
      q[2] = nz * inv;
      q[3] = nw * inv;
    }
  };

  // Exact Jacobi Eigensolver for Symmetric 3x3 Matrix:
  // A = [a00, a11, a22, a01, a02, a12]
  // Returns { evals: [l1 >= l2 >= l3], maxVec: [vx, vy, vz] }
  const _symResult = { l1: 0, l2: 0, l3: 0, vx: 1, vy: 0, vz: 0 };
  function symmetricEigen3x3(a00, a11, a22, a01, a02, a12) {
    let m00 = a00, m11 = a11, m22 = a22, m01 = a01, m02 = a02, m12 = a12;
    let v00 = 1, v01 = 0, v02 = 0;
    let v10 = 0, v11 = 1, v12 = 0;
    let v20 = 0, v21 = 0, v22 = 1;

    for (let iter = 0; iter < 6; iter++) {
      const a = Math.abs(m01), b = Math.abs(m02), c = Math.abs(m12);
      if (a < 1e-7 && b < 1e-7 && c < 1e-7) break;
      let p, q, mpq, mpp, mqq;
      if (a >= b && a >= c) { p = 0; q = 1; mpq = m01; mpp = m00; mqq = m11; }
      else if (b >= c) { p = 0; q = 2; mpq = m02; mpp = m00; mqq = m22; }
      else { p = 1; q = 2; mpq = m12; mpp = m11; mqq = m22; }

      const tau = (mqq - mpp) / (2 * mpq);
      const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
      const cos = 1 / Math.sqrt(1 + t * t);
      const sin = t * cos;

      if (p === 0 && q === 1) {
        const n00 = m00 - t * m01;
        const n11 = m11 + t * m01;
        const n02 = cos * m02 - sin * m12;
        const n12 = sin * m02 + cos * m12;
        m00 = n00; m11 = n11; m01 = 0; m02 = n02; m12 = n12;
        let a0 = cos * v00 - sin * v01, a1 = sin * v00 + cos * v01; v00 = a0; v01 = a1;
        a0 = cos * v10 - sin * v11; a1 = sin * v10 + cos * v11; v10 = a0; v11 = a1;
        a0 = cos * v20 - sin * v21; a1 = sin * v20 + cos * v21; v20 = a0; v21 = a1;
      } else if (p === 0 && q === 2) {
        const n00 = m00 - t * m02;
        const n22 = m22 + t * m02;
        const n01 = cos * m01 - sin * m12;
        const n12 = sin * m01 + cos * m12;
        m00 = n00; m22 = n22; m02 = 0; m01 = n01; m12 = n12;
        let a0 = cos * v00 - sin * v02, a2 = sin * v00 + cos * v02; v00 = a0; v02 = a2;
        a0 = cos * v10 - sin * v12; a2 = sin * v10 + cos * v12; v10 = a0; v12 = a2;
        a0 = cos * v20 - sin * v22; a2 = sin * v20 + cos * v22; v20 = a0; v22 = a2;
      } else {
        const n11 = m11 - t * m12;
        const n22 = m22 + t * m12;
        const n01 = cos * m01 - sin * m02;
        const n02 = sin * m01 + cos * m02;
        m11 = n11; m22 = n22; m12 = 0; m01 = n01; m02 = n02;
        let a1 = cos * v01 - sin * v02, a2 = sin * v01 + cos * v02; v01 = a1; v02 = a2;
        a1 = cos * v11 - sin * v12; a2 = sin * v11 + cos * v12; v11 = a1; v12 = a2;
        a1 = cos * v21 - sin * v22; a2 = sin * v21 + cos * v22; v21 = a1; v22 = a2;
      }
    }

    // Find max, mid, min eigenvalues & eigenvector of max
    if (m00 >= m11 && m00 >= m22) {
      _symResult.l1 = m00;
      _symResult.l2 = m11 >= m22 ? m11 : m22;
      _symResult.l3 = m11 >= m22 ? m22 : m11;
      _symResult.vx = v00; _symResult.vy = v10; _symResult.vz = v20;
    } else if (m11 >= m22) {
      _symResult.l1 = m11;
      _symResult.l2 = m00 >= m22 ? m00 : m22;
      _symResult.l3 = m00 >= m22 ? m22 : m00;
      _symResult.vx = v01; _symResult.vy = v11; _symResult.vz = v21;
    } else {
      _symResult.l1 = m22;
      _symResult.l2 = m00 >= m11 ? m00 : m11;
      _symResult.l3 = m00 >= m11 ? m11 : m00;
      _symResult.vx = v02; _symResult.vy = v12; _symResult.vz = v22;
    }
    return _symResult;
  }

  // Closest point on triangle ABC to point P (Ericson, Real-Time Collision Detection)
  // Writes result into out: { x, y, z, u, v, w } where P_closest = u*A + v*B + w*C
  const _triRes = { x: 0, y: 0, z: 0, u: 1, v: 0, w: 0 };
  function closestPointOnTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) {
      _triRes.x = ax; _triRes.y = ay; _triRes.z = az;
      _triRes.u = 1; _triRes.v = 0; _triRes.w = 0;
      return _triRes;
    }
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
      _triRes.x = bx; _triRes.y = by; _triRes.z = bz;
      _triRes.u = 0; _triRes.v = 1; _triRes.w = 0;
      return _triRes;
    }
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      _triRes.x = ax + v * abx; _triRes.y = ay + v * aby; _triRes.z = az + v * abz;
      _triRes.u = 1 - v; _triRes.v = v; _triRes.w = 0;
      return _triRes;
    }
    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) {
      _triRes.x = cx; _triRes.y = cy; _triRes.z = cz;
      _triRes.u = 0; _triRes.v = 0; _triRes.w = 1;
      return _triRes;
    }
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      _triRes.x = ax + w * acx; _triRes.y = ay + w * acy; _triRes.z = az + w * acz;
      _triRes.u = 1 - w; _triRes.v = 0; _triRes.w = w;
      return _triRes;
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
      _triRes.x = bx + w * (cx - bx); _triRes.y = by + w * (cy - by); _triRes.z = bz + w * (cz - bz);
      _triRes.u = 0; _triRes.v = 1 - w; _triRes.w = w;
      return _triRes;
    }
    const denom = 1 / (va + vb + vc);
    const v = vb * denom;
    const w = vc * denom;
    const u = 1 - v - w;
    _triRes.x = ax + abx * v + acx * w;
    _triRes.y = ay + aby * v + acy * w;
    _triRes.z = az + abz * v + acz * w;
    _triRes.u = u; _triRes.v = v; _triRes.w = w;
    return _triRes;
  }

  // Smooth Catmull-Rom / Keyframe Evaluator for Camera Choreography
  function evalKeyframes(keys, t) {
    if (t <= keys[0].t) return keys[0];
    const last = keys[keys.length - 1];
    if (t >= last.t) return last;
    let idx = 0;
    for (let i = 0; i < keys.length - 1; i++) {
      if (t >= keys[i].t && t <= keys[i + 1].t) { idx = i; break; }
    }
    const k0 = keys[idx];
    const k1 = keys[idx + 1];
    const u = smoothstep(k0.t, k1.t, t);
    return {
      eye: [lerp(k0.eye[0], k1.eye[0], u), lerp(k0.eye[1], k1.eye[1], u), lerp(k0.eye[2], k1.eye[2], u)],
      target: [lerp(k0.target[0], k1.target[0], u), lerp(k0.target[1], k1.target[1], u), lerp(k0.target[2], k1.target[2], u)],
      fov: lerp(k0.fov || 38, k1.fov || 38, u)
    };
  }

  // Interactive Orbit Camera Controller
  class OrbitCamera {
    constructor(opts) {
      this.target = opts.target ? opts.target.slice() : [0, 0.5, 0];
      this.yaw = opts.yaw !== undefined ? opts.yaw : 0.35;
      this.pitch = opts.pitch !== undefined ? opts.pitch : 0.32;
      this.distance = opts.distance !== undefined ? opts.distance : 5.5;
      this.fov = opts.fov !== undefined ? opts.fov : 38;
      this.minDist = opts.minDist || 1.6;
      this.maxDist = opts.maxDist || 18.0;
      this.override = null; // { eye, target, fov } when demo controls camera
      this.eye = [0, 2, 5];
      this.view = Mat4.create();
      this.proj = Mat4.create();
      this.viewProj = Mat4.create();
      this.invViewProj = Mat4.create();
      this.invProj = Mat4.create();
      this.invView = Mat4.create();
    }

    setPose(eye, target, fov) {
      this.override = { eye: eye.slice(), target: target.slice(), fov: fov || 38 };
    }

    clearOverride() {
      if (this.override) {
        // Sync orbit params smoothly to last override pose
        const e = this.override.eye, t = this.override.target;
        this.target = t.slice();
        const dx = e[0] - t[0], dy = e[1] - t[1], dz = e[2] - t[2];
        this.distance = Math.max(this.minDist, Math.hypot(dx, dy, dz));
        this.pitch = clamp(Math.asin(clamp(dy / this.distance, -0.98, 0.98)), 0.02, 1.45);
        this.yaw = Math.atan2(dx, dz);
        this.fov = this.override.fov;
        this.override = null;
      }
    }

    updateMatrices(aspect) {
      let eye, target, fov;
      if (this.override) {
        eye = this.override.eye;
        target = this.override.target;
        fov = this.override.fov;
      } else {
        const cp = Math.cos(this.pitch);
        eye = [
          this.target[0] + this.distance * cp * Math.sin(this.yaw),
          this.target[1] + this.distance * Math.sin(this.pitch),
          this.target[2] + this.distance * cp * Math.cos(this.yaw)
        ];
        target = this.target;
        fov = this.fov;
      }
      this.eye[0] = eye[0]; this.eye[1] = eye[1]; this.eye[2] = eye[2];
      Mat4.lookAt(this.view, eye, target, [0, 1, 0]);
      Mat4.perspectiveZO(this.proj, (fov * Math.PI) / 180, aspect, 0.08, 120.0);
      Mat4.multiply(this.viewProj, this.proj, this.view);
      Mat4.invert(this.invViewProj, this.viewProj);
      Mat4.invert(this.invProj, this.proj);
      Mat4.invert(this.invView, this.view);
    }
  }

  App.Math = {
    createRNG,
    clamp,
    lerp,
    smoothstep,
    smootherstep,
    Mat4,
    Quat,
    symmetricEigen3x3,
    closestPointOnTriangle,
    evalKeyframes,
    OrbitCamera
  };
})(window);
