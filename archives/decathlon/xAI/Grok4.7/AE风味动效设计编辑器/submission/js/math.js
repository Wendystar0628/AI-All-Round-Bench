/* Forge math — vectors, matrices, curves, noise. Column-major mat4, Y-up, right-handed. */
(function (G) {
  const AE = (G.AE = G.AE || {});
  const M = (AE.math = {});

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const hypot3 = (x, y, z) => Math.hypot(x, y, z);

  function v2(x, y) { return { x, y }; }
  function add2(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function sub2(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function mul2(a, s) { return { x: a.x * s, y: a.y * s }; }
  function dot2(a, b) { return a.x * b.x + a.y * b.y; }
  function len2(a) { return Math.hypot(a.x, a.y); }
  function norm2(a) {
    const L = len2(a) || 1;
    return { x: a.x / L, y: a.y / L };
  }
  function cross2(a, b) { return a.x * b.y - a.y * b.x; }

  function vec(v, dim) {
    if (typeof v === "number") {
      if (dim <= 1) return v;
      const a = new Array(dim).fill(0);
      a[0] = v;
      return a;
    }
    const a = Array.isArray(v) ? v.slice() : [v];
    while (a.length < dim) a.push(a.length === 0 ? 0 : a[a.length - 1]);
    if (a.length > dim) a.length = dim;
    return dim === 1 ? a[0] : a;
  }
  function addN(a, b) {
    if (typeof a === "number" && typeof b === "number") return a + b;
    const A = Array.isArray(a) ? a : [a];
    const B = Array.isArray(b) ? b : [b];
    const n = Math.max(A.length, B.length);
    const o = new Array(n);
    for (let i = 0; i < n; i++) o[i] = (A[i] || 0) + (B[i] || 0);
    return o;
  }
  function mulN(a, s) {
    if (typeof a === "number") return a * s;
    return a.map((v) => v * s);
  }
  function lerpN(a, b, t) {
    if (typeof a === "number" && typeof b === "number") return lerp(a, b, t);
    const A = Array.isArray(a) ? a : [a];
    const B = Array.isArray(b) ? b : [b];
    const n = Math.max(A.length, B.length);
    const o = new Array(n);
    for (let i = 0; i < n; i++) o[i] = lerp(A[i] || 0, B[i] || 0, t);
    return o;
  }
  function cloneN(v) {
    return Array.isArray(v) ? v.slice() : v;
  }

  function id4() {
    const m = new Float64Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }
  function mul4(a, b) {
    const o = new Float64Array(16);
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  }
  function trans4(x, y, z) {
    const m = id4();
    m[12] = x; m[13] = y; m[14] = z || 0;
    return m;
  }
  function scale4(x, y, z) {
    const m = id4();
    m[0] = x; m[5] = y == null ? x : y; m[10] = z == null ? (y == null ? x : 1) : z;
    return m;
  }
  function rotX(a) {
    const m = id4(), c = Math.cos(a), s = Math.sin(a);
    m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
    return m;
  }
  function rotY(a) {
    const m = id4(), c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
    return m;
  }
  function rotZ(a) {
    const m = id4(), c = Math.cos(a), s = Math.sin(a);
    m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
    return m;
  }
  function deg(r) { return r * 180 / Math.PI; }
  function rad(d) { return d * Math.PI / 180; }

  /** Local matrix: T(pos) * Rz * Ry * Rx * S * T(-anchor). Angles in degrees. */
  function trs(pos, rot, scale, anchor) {
    const px = pos[0] || 0, py = pos[1] || 0, pz = pos[2] || 0;
    const ax = anchor ? anchor[0] || 0 : 0, ay = anchor ? anchor[1] || 0 : 0, az = anchor ? anchor[2] || 0 : 0;
    const sx = scale[0] == null ? 1 : scale[0];
    const sy = scale[1] == null ? sx : scale[1];
    const sz = scale[2] == null ? 1 : scale[2];
    const rx = rad((rot[0] || 0)), ry = rad((rot[1] || 0)), rz = rad((rot[2] || 0));
    let m = mul4(rotZ(rz), mul4(rotY(ry), rotX(rx)));
    m = mul4(m, scale4(sx, sy, sz));
    m = mul4(trans4(px, py, pz), m);
    if (ax || ay || az) m = mul4(m, trans4(-ax, -ay, -az));
    return m;
  }

  function transformPoint(m, p) {
    const x = p[0], y = p[1], z = p[2] || 0;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const iw = w === 0 ? 1 : 1 / w;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) * iw,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) * iw,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) * iw,
    ];
  }
  function transformDir(m, p) {
    const x = p[0], y = p[1], z = p[2] || 0;
    return [
      m[0] * x + m[4] * y + m[8] * z,
      m[1] * x + m[5] * y + m[9] * z,
      m[2] * x + m[6] * y + m[10] * z,
    ];
  }
  function invert4(a) {
    const o = new Float64Array(16);
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
    if (Math.abs(det) < 1e-12) return id4();
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

  function lookAt(eye, target, up) {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    let xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-8) {
      xx = 1; xy = 0; xz = 0; xl = 1;
    }
    xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const m = id4();
    m[0] = xx; m[1] = yx; m[2] = zx;
    m[4] = xy; m[5] = yy; m[6] = zy;
    m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    return m;
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const m = new Float64Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }
  function ortho(l, r, b, t, n, f) {
    const m = id4();
    m[0] = 2 / (r - l);
    m[5] = 2 / (t - b);
    m[10] = 2 / (n - f);
    m[12] = (l + r) / (l - r);
    m[13] = (b + t) / (b - t);
    m[14] = (n + f) / (n - f);
    return m;
  }

  function decomposeTRS(m) {
    const t = [m[12], m[13], m[14]];
    let sx = Math.hypot(m[0], m[1], m[2]) || 1;
    let sy = Math.hypot(m[4], m[5], m[6]) || 1;
    let sz = Math.hypot(m[8], m[9], m[10]) || 1;
    const r00 = m[0] / sx, r01 = m[1] / sx, r02 = m[2] / sx;
    const r10 = m[4] / sy, r11 = m[5] / sy, r12 = m[6] / sy;
    const r20 = m[8] / sz, r21 = m[9] / sz, r22 = m[10] / sz;
    // If the matrix has a reflection, fold it into scale X.
    const det = r00 * (r11 * r22 - r12 * r21) - r01 * (r10 * r22 - r12 * r20) + r02 * (r10 * r21 - r11 * r20);
    if (det < 0) sx = -sx;
    let rx, ry, rz;
    if (Math.abs(r02) < 0.999999) {
      ry = Math.asin(clamp(-r02, -1, 1));
      rx = Math.atan2(r12, r22);
      rz = Math.atan2(r01, r00);
    } else {
      ry = r02 < 0 ? Math.PI / 2 : -Math.PI / 2;
      rx = Math.atan2(-r10, r11);
      rz = 0;
    }
    return {
      position: t,
      rotation: [deg(rx), deg(ry), deg(rz)],
      scale: [sx, sy, sz],
    };
  }

  function bezier2(p0, p1, p2, t) {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }
  function bezier3(p0, p1, p2, p3, t) {
    const u = 1 - t;
    const uu = u * u, tt = t * t;
    return {
      x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
      y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
    };
  }
  function bezier3n(p0, p1, p2, p3, t) {
    const u = 1 - t, uu = u * u, tt = t * t;
    const n = p0.length;
    const o = new Array(n);
    for (let i = 0; i < n; i++) {
      o[i] = uu * u * p0[i] + 3 * uu * t * p1[i] + 3 * u * tt * p2[i] + tt * t * p3[i];
    }
    return o;
  }
  /** Solve cubic bezier x(s)=target, handles in 0..1 x. Returns s. */
  function solveBezierX(target, x1, x2) {
    if (target <= 0) return 0;
    if (target >= 1) return 1;
    let s = target;
    for (let i = 0; i < 8; i++) {
      const u = 1 - s;
      const x = 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s;
      const dx = 3 * u * u * x1 + 6 * u * s * (x2 - x1) + 3 * s * s * (1 - x2);
      const diff = x - target;
      if (Math.abs(diff) < 1e-6) return s;
      if (Math.abs(dx) < 1e-6) break;
      s = clamp(s - diff / dx, 0, 1);
    }
    let lo = 0, hi = 1;
    s = target;
    for (let i = 0; i < 14; i++) {
      const u = 1 - s;
      const x = 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s;
      if (x < target) lo = s; else hi = s;
      s = (lo + hi) * 0.5;
    }
    return s;
  }
  function bezierY(s, y1, y2) {
    const u = 1 - s;
    return 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s;
  }

  function polyLen(pts, closed) {
    let L = 0;
    const n = pts.length;
    const m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) L += Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y);
    return L;
  }
  function signedArea(pts) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a * 0.5;
  }
  function pointInRings(pt, rings) {
    let w = 0;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j], b = ring[i];
        if ((a.y > pt.y) !== (b.y > pt.y)) {
          const x = a.x + ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y);
          if (pt.x < x) w += b.y > a.y ? 1 : -1;
        }
      }
    }
    return w;
  }

  function segIntersect(a, b, c, d, eps) {
    const rpx = b.x - a.x, rpy = b.y - a.y;
    const spx = d.x - c.x, spy = d.y - c.y;
    const den = rpx * spy - rpy * spx;
    if (Math.abs(den) < 1e-12) return null;
    const qpx = c.x - a.x, qpy = c.y - a.y;
    const t = (qpx * spy - qpy * spx) / den;
    const u = (qpx * rpy - qpy * rpx) / den;
    const e = eps == null ? 1e-8 : eps;
    if (t >= -e && t <= 1 + e && u >= -e && u <= 1 + e) {
      return {
        t: clamp(t, 0, 1),
        u: clamp(u, 0, 1),
        x: a.x + rpx * clamp(t, 0, 1),
        y: a.y + rpy * clamp(t, 0, 1),
      };
    }
    return null;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(ix, iy, seed) {
    let n = Math.imul(ix ^ Math.imul(iy, 374761393) ^ seed, 1274126177);
    n = (n ^ (n >>> 13)) >>> 0;
    return n / 4294967296;
  }
  function valueNoise1(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = hash2(i, seed, 0x9e3779b9) * 2 - 1;
    const b = hash2(i + 1, seed, 0x9e3779b9) * 2 - 1;
    return a * (1 - u) + b * u;
  }

  // Compact 3D value noise (not simplex, smooth enough for fields).
  function noise3(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const uz = fz * fz * (3 - 2 * fz);
    const h = (dx, dy, dz) => hash2(ix + dx + Math.imul(iy + dy, 73856093) + Math.imul(iz + dz, 19349663), seed, 0x85ebca6b);
    const n000 = h(0, 0, 0), n100 = h(1, 0, 0), n010 = h(0, 1, 0), n110 = h(1, 1, 0);
    const n001 = h(0, 0, 1), n101 = h(1, 0, 1), n011 = h(0, 1, 1), n111 = h(1, 1, 1);
    const nx00 = n000 * (1 - ux) + n100 * ux;
    const nx10 = n010 * (1 - ux) + n110 * ux;
    const nx01 = n001 * (1 - ux) + n101 * ux;
    const nx11 = n011 * (1 - ux) + n111 * ux;
    const nxy0 = nx00 * (1 - uy) + nx10 * uy;
    const nxy1 = nx01 * (1 - uy) + nx11 * uy;
    return (nxy0 * (1 - uz) + nxy1 * uz) * 2 - 1;
  }

  function rayTriangle(orig, dir, a, b, c) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
    const px = dir[1] * acz - dir[2] * acy;
    const py = dir[2] * acx - dir[0] * acz;
    const pz = dir[0] * acy - dir[1] * acx;
    const det = abx * px + aby * py + abz * pz;
    if (Math.abs(det) < 1e-8) return null;
    const inv = 1 / det;
    const tx = orig[0] - a[0], ty = orig[1] - a[1], tz = orig[2] - a[2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = ty * abz - tz * aby;
    const qy = tz * abx - tx * abz;
    const qz = tx * aby - ty * abx;
    const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const t = (acx * qx + acy * qy + acz * qz) * inv;
    if (t < 0) return null;
    return { t, u, v, w: 1 - u - v };
  }

  Object.assign(M, {
    clamp, lerp, smooth, hypot3,
    v2, add2, sub2, mul2, dot2, len2, norm2, cross2,
    vec, addN, mulN, lerpN, cloneN,
    id4, mul4, trans4, scale4, rotX, rotY, rotZ, deg, rad, trs,
    transformPoint, transformDir, invert4, lookAt, perspective, ortho, decomposeTRS,
    bezier2, bezier3, bezier3n, solveBezierX, bezierY,
    polyLen, signedArea, pointInRings, segIntersect,
    mulberry32, hash2, valueNoise1, noise3, rayTriangle,
  });
})(typeof window !== "undefined" ? window : globalThis);
