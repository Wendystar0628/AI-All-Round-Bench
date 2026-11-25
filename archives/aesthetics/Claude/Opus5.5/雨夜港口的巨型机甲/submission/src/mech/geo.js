// Geometry toolkit for hard-surface modelling.
// All geometries produced here are non-indexed and carry: position, normal, aEdge.
import * as THREE from 'three';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';

export const PI = Math.PI, TAU = Math.PI * 2, DEG = Math.PI / 180;
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// smooth |x| (rounded ridge of radius ~k)
export const sabs = (x, k = 0.35) => Math.sqrt(x * x + k * k) - k;

// ------------------------------------------------------------------ 2D outlines
export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a * 0.5;
}
export function ccw(pts) { return signedArea(pts) < 0 ? pts.slice().reverse() : pts; }

// Round (seg>1) or chamfer (seg=1) corners of a closed polygon. r may be a number or per-vertex array.
export function fillet(pts, r, seg = 4) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const rad = Array.isArray(r) ? (r[i] || 0) : r;
    const p = pts[i];
    if (!rad) { out.push([p[0], p[1]]); continue; }
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let d1x = a[0] - p[0], d1y = a[1] - p[1]; const l1 = Math.hypot(d1x, d1y); d1x /= l1; d1y /= l1;
    let d2x = b[0] - p[0], d2y = b[1] - p[1]; const l2 = Math.hypot(d2x, d2y); d2x /= l2; d2y /= l2;
    const ang = Math.acos(Math.max(-1, Math.min(1, d1x * d2x + d1y * d2y)));
    if (ang > PI - 1e-3 || ang < 1e-3) { out.push([p[0], p[1]]); continue; }
    let t = rad / Math.tan(ang / 2);
    t = Math.min(t, l1 * 0.49, l2 * 0.49);
    const rr = t * Math.tan(ang / 2);
    const p1x = p[0] + d1x * t, p1y = p[1] + d1y * t, p2x = p[0] + d2x * t, p2y = p[1] + d2y * t;
    let bx = d1x + d2x, by = d1y + d2y; const bl = Math.hypot(bx, by); bx /= bl; by /= bl;
    const cd = rr / Math.sin(ang / 2);
    const cx = p[0] + bx * cd, cy = p[1] + by * cd;
    const a1 = Math.atan2(p1y - cy, p1x - cx);
    let da = Math.atan2(p2y - cy, p2x - cx) - a1;
    while (da > PI) da -= TAU; while (da < -PI) da += TAU;
    for (let k = 0; k <= seg; k++) {
      const aa = a1 + da * k / seg;
      out.push([cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr]);
    }
  }
  return out;
}

export function arc(cx, cy, r, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}

// Polygon offset with miter joins (d>0 grows a CCW polygon outward).
export function offsetPoly(pts, d) {
  const P = ccw(pts), n = P.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], p = P[i], b = P[(i + 1) % n];
    let e1x = p[0] - a[0], e1y = p[1] - a[1]; let l = Math.hypot(e1x, e1y) || 1; e1x /= l; e1y /= l;
    let e2x = b[0] - p[0], e2y = b[1] - p[1]; l = Math.hypot(e2x, e2y) || 1; e2x /= l; e2y /= l;
    const n1x = e1y, n1y = -e1x, n2x = e2y, n2y = -e2x; // outward normals for CCW
    let mx = n1x + n2x, my = n1y + n2y; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const cosh = Math.max(0.35, mx * n1x + my * n1y);
    out.push([p[0] + mx * d / cosh, p[1] + my * d / cosh]);
  }
  return out;
}

// resample along a polyline (closed) every `step`, returns [{x,y,tx,ty}]
export function samplePoly(pts, step, closed = true, startFrac = 0.5) {
  const segs = [], n = pts.length; let total = 0;
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push({ a, b, l, s: total }); total += l;
  }
  const count = Math.max(1, Math.floor(total / step));
  const real = total / count, out = [];
  for (let k = 0; k < count + (closed ? 0 : 1); k++) {
    let s = (k + (closed ? startFrac : 0)) * real;
    if (!closed && k === count) s = total - 1e-6;
    const sg = segs.find(q => s >= q.s && s <= q.s + q.l + 1e-9) || segs[segs.length - 1];
    const u = sg.l > 0 ? (s - sg.s) / sg.l : 0;
    const tx = (sg.b[0] - sg.a[0]) / (sg.l || 1), ty = (sg.b[1] - sg.a[1]) / (sg.l || 1);
    out.push({ x: sg.a[0] + (sg.b[0] - sg.a[0]) * u, y: sg.a[1] + (sg.b[1] - sg.a[1]) * u, tx, ty });
  }
  return out;
}

export function toShape(pts, holes = []) {
  const s = new THREE.Shape(ccw(pts).map(p => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  return s;
}

// ------------------------------------------------------------------ normals / finish
// Angle-weighted creased normals + aEdge attribute (how much a vertex sits on a rounded edge).
export function finish(g, creaseDeg = 35) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const pos = g.attributes.position.array;
  const nv = pos.length / 3, nf = nv / 3;
  const fu = new Float32Array(nf * 3), wA = new Float32Array(nv);
  for (let f = 0; f < nf; f++) {
    const o = f * 9;
    const ax = pos[o], ay = pos[o + 1], az = pos[o + 2];
    const bx = pos[o + 3], by = pos[o + 4], bz = pos[o + 5];
    const cx = pos[o + 6], cy = pos[o + 7], cz = pos[o + 8];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const lr = Math.hypot(nx, ny, nz), l = lr || 1;
    fu[f * 3] = nx / l; fu[f * 3 + 1] = ny / l; fu[f * 3 + 2] = nz / l;
    // corner angles
    const la = Math.hypot(e1x, e1y, e1z) || 1e-9, lc = Math.hypot(e2x, e2y, e2z) || 1e-9;
    const fx = cx - bx, fy = cy - by, fz = cz - bz, lb = Math.hypot(fx, fy, fz) || 1e-9;
    let angA = Math.acos(Math.max(-1, Math.min(1, (e1x * e2x + e1y * e2y + e1z * e2z) / (la * lc))));
    let angB = Math.acos(Math.max(-1, Math.min(1, (-e1x * fx - e1y * fy - e1z * fz) / (la * lb))));
    if (!(angA >= 0)) angA = 0; if (!(angB >= 0)) angB = 0;
    if (lr < 1e-12) { angA = 0; angB = 0; }
    wA[f * 3] = angA; wA[f * 3 + 1] = angB; wA[f * 3 + 2] = lr < 1e-12 ? 0 : Math.max(0, PI - angA - angB);
  }
  // spatial hash (2mm)
  let size = 1; while (size < nv * 2) size <<= 1;
  const table = new Int32Array(size).fill(-1);
  const gid = new Int32Array(nv), qx = new Int32Array(nv), qy = new Int32Array(nv), qz = new Int32Array(nv);
  let groups = 0;
  for (let i = 0; i < nv; i++) {
    const x = Math.round(pos[i * 3] * 500), y = Math.round(pos[i * 3 + 1] * 500), z = Math.round(pos[i * 3 + 2] * 500);
    qx[i] = x; qy[i] = y; qz[i] = z;
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (size - 1);
    for (;;) {
      const r = table[h];
      if (r === -1) { table[h] = i; gid[i] = groups++; break; }
      if (qx[r] === x && qy[r] === y && qz[r] === z) { gid[i] = gid[r]; break; }
      h = (h + 1) & (size - 1);
    }
  }
  const cnt = new Int32Array(groups + 1);
  for (let i = 0; i < nv; i++) cnt[gid[i] + 1]++;
  for (let i = 0; i < groups; i++) cnt[i + 1] += cnt[i];
  const fill = cnt.slice(0, groups), list = new Int32Array(nv);
  for (let i = 0; i < nv; i++) list[fill[gid[i]]++] = i;
  const cosC = Math.cos(creaseDeg * DEG);
  const nrm = new Float32Array(nv * 3), edge = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const f = (i / 3) | 0, fx = fu[f * 3], fy = fu[f * 3 + 1], fz = fu[f * 3 + 2];
    let sx = 0, sy = 0, sz = 0;
    const g0 = gid[i];
    for (let k = cnt[g0]; k < cnt[g0 + 1]; k++) {
      const j = list[k], f2 = (j / 3) | 0;
      const gx = fu[f2 * 3], gy = fu[f2 * 3 + 1], gz = fu[f2 * 3 + 2];
      if (fx * gx + fy * gy + fz * gz > cosC) { const w = wA[j]; sx += gx * w; sy += gy * w; sz += gz * w; }
    }
    let l = Math.hypot(sx, sy, sz);
    if (!(l > 1e-9)) { sx = fx; sy = fy; sz = fz; l = Math.hypot(sx, sy, sz); }
    if (!(l > 1e-9)) { sx = 0; sy = 1; sz = 0; l = 1; }
    sx /= l; sy /= l; sz /= l;
    nrm[i * 3] = sx; nrm[i * 3 + 1] = sy; nrm[i * 3 + 2] = sz;
    const dev = 1 - (sx * fx + sy * fy + sz * fz);
    edge[i] = Math.min(1, Math.max(0, (dev - 0.0015) / 0.016));
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
  return g;
}

// flat-shaded finish (hard faces)
export function finishFlat(g) { return finish(g, 1); }

export function setEdge(g, v) {
  const a = g.attributes.aEdge.array; a.fill(v); return g;
}

// ------------------------------------------------------------------ deformers
export function tess(g, maxEdge) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  return new TessellateModifier(maxEdge, 10).modify(g);
}

// fn(v:Vector3) -> modifies v in place
export function warp(g, fn) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  p.needsUpdate = true;
  return g;
}

// Surface warp: S(u, v, out) gives surface point; local z is pushed along the surface normal.
export function surf(S, eps = 0.004) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  return (v) => {
    const x = v.x, y = v.y, z = v.z;
    S(x, y, a); S(x + eps, y, b); S(x, y + eps, c);
    b.sub(a); c.sub(a); n.crossVectors(b, c).normalize();
    v.copy(a).addScaledVector(n, z);
  };
}
// common surfaces
export const S = {
  // height field z = f(x,y)
  hf: (f) => (x, y, o) => o.set(x, y, f(x, y)),
  // bend around a vertical axis (cylinder radius R, convex towards +z)
  cylV: (R, cx = 0) => (x, y, o) => o.set(cx + R * Math.sin((x - cx) / R), y, R * Math.cos((x - cx) / R) - R),
  // bend around a horizontal (x) axis, convex towards +z
  cylH: (R, cy = 0) => (x, y, o) => o.set(x, cy + R * Math.sin((y - cy) / R), R * Math.cos((y - cy) / R) - R),
  // doubly curved (paraboloid) surface convex towards +z
  dome: (Rx, Ry, cx = 0, cy = 0, z0 = 0) => (x, y, o) => o.set(x, y, z0 - (x - cx) * (x - cx) / (2 * Rx) - (y - cy) * (y - cy) / (2 * Ry)),
};

// ------------------------------------------------------------------ primitive builders
export function extrude(outline, { t = 0.4, bevel = 0.1, bseg = 2, holes = [], curveSeg = 2 } = {}) {
  const bt = Math.max(0, Math.min(bevel, t * 0.45));
  const depth = Math.max(t - 2 * bt, 0.0005);
  const geo = new THREE.ExtrudeGeometry(toShape(outline, holes), {
    depth, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt,
    bevelSegments: bseg, curveSegments: curveSeg, steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  return geo.index ? geo.toNonIndexed() : geo;
}

// Plate = extrude (+tessellate) (+warp) + finish
export function plate(outline, opts = {}) {
  let g = extrude(outline, opts);
  if (opts.tess) g = tess(g, opts.tess);
  if (opts.warp) warp(g, opts.warp);
  return finish(g, opts.crease ?? 38);
}

// Lathe around Y. profile: closed polygon [[r,y],...] (auto-closed, auto-oriented); partial sweeps get end caps.
export function lathe(profile, { seg = 32, phi0 = 0, phiLen = TAU, crease = 38 } = {}) {
  let P = profile.map(p => [Math.max(p[0], 0), p[1]]);
  // drop duplicate closing point
  if (P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-6) P.pop();
  if (signedArea(P) < 0) P = P.slice().reverse();
  const full = phiLen >= TAU - 1e-6;
  const n = P.length, pos = [];
  const pt = (i, k) => { const a = phi0 + phiLen * k / seg; const r = P[i][0]; return [r * Math.sin(a), P[i][1], r * Math.cos(a)]; };
  for (let k = 0; k < seg; k++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      if (P[i][0] < 1e-5 && P[i2][0] < 1e-5) continue;
      const a = pt(i, k), b = pt(i2, k), c = pt(i2, k + 1), d = pt(i, k + 1);
      if (P[i2][0] >= 1e-5) pos.push(...a, ...b, ...c);
      if (P[i][0] >= 1e-5) pos.push(...a, ...c, ...d);
    }
  }
  if (!full) {
    const faces = THREE.ShapeUtils.triangulateShape(P.map(p => new THREE.Vector2(p[0], p[1])), []);
    for (const k of [0, seg]) for (const f of faces) pos.push(...pt(f[0], k), ...pt(f[1], k), ...pt(f[2], k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return fixLatheWinding(finish(g, crease), P, phi0, phiLen, seg);
}
// orient faces so normals point away from the profile interior (robust for partial sweeps)
function fixLatheWinding(g, P, phi0, phiLen, seg) {
  // centroid of profile polygon in (r,y)
  let cr = 0, cy = 0; for (const p of P) { cr += p[0]; cy += p[1]; } cr /= P.length; cy /= P.length;
  const pos = g.attributes.position.array, nor = g.attributes.normal.array;
  const s = g.attributes.position.count;
  // per triangle: compare geometric normal with direction from the swept centroid
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3();
  let flipVotes = 0, keepVotes = 0;
  for (let i = 0; i < s; i += 3) {
    tmpA.fromArray(pos, i * 3); tmpB.fromArray(pos, i * 3 + 3); tmpC.fromArray(pos, i * 3 + 6);
    n.subVectors(tmpB, tmpA).cross(tmpC.clone().sub(tmpA));
    if (n.lengthSq() < 1e-12) continue;
    const m = tmpA.clone().add(tmpB).add(tmpC).multiplyScalar(1 / 3);
    const a = Math.atan2(m.x, m.z);
    c.set(cr * Math.sin(a), cy, cr * Math.cos(a));
    if (n.dot(m.sub(c)) < 0) flipVotes++; else keepVotes++;
  }
  if (flipVotes > keepVotes) flipWinding(g);
  return g;
}

// Chamfered cylinder along Y centered at 0
export function cyl(r, h, { seg = 24, ch = 0.06, r2 = null, crease = 38 } = {}) {
  const rt = r2 ?? r;
  const c = Math.min(ch, h * 0.3, r * 0.3);
  const prof = [[0, -h / 2], [r - c, -h / 2], [r, -h / 2 + c], [rt, h / 2 - c], [rt - c, h / 2], [0, h / 2]];
  return lathe(prof, { seg, crease });
}

// ring (washer) along Y
export function ring(rIn, rOut, h, { seg = 32, ch = 0.04 } = {}) {
  const c = Math.min(ch, (rOut - rIn) * 0.3, h * 0.3);
  return lathe([[rIn, h / 2], [rIn, -h / 2], [rOut - c, -h / 2], [rOut, -h / 2 + c], [rOut, h / 2 - c], [rOut - c, h / 2], [rIn, h / 2]], { seg });
}

export function rbox(w, h, d, r = 0.1, seg = 2) {
  r = Math.min(r, w * 0.49, h * 0.49, d * 0.49);
  // build a rounded box by extruding a filleted rectangle with bevel along z
  const outline = fillet([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], r, Math.max(1, seg));
  return plate(outline, { t: d, bevel: r, bseg: Math.max(1, seg) });
}

export function box(w, h, d) {
  return finish(new THREE.BoxGeometry(w, h, d), 30);
}

// Sweep a closed 2D section (in local XY, Y = "up" of section) along a polyline/curve path.
export function sweep(section, path, { closed = false, capStart = true, capEnd = true, up = V3(0, 1, 0), scaleFn = null, crease = 38 } = {}) {
  const pts = path; // array of Vector3
  const n = pts.length, m = section.length;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const t = new THREE.Vector3();
    if (i === 0) t.subVectors(pts[1], pts[0]);
    else if (i === n - 1) t.subVectors(pts[n - 1], pts[n - 2]);
    else t.subVectors(pts[i + 1], pts[i - 1]);
    t.normalize();
    let x = new THREE.Vector3().crossVectors(up, t);
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const y = new THREE.Vector3().crossVectors(t, x).normalize();
    frames.push({ t, x, y });
  }
  const rings = [];
  for (let i = 0; i < n; i++) {
    const s = scaleFn ? scaleFn(i / (n - 1)) : [1, 1];
    const sx = Array.isArray(s) ? s[0] : s, sy = Array.isArray(s) ? s[1] : s;
    rings.push(section.map(p => pts[i].clone().addScaledVector(frames[i].x, p[0] * sx).addScaledVector(frames[i].y, p[1] * sy)));
  }
  return loftRings(rings, { closedPath: closed, capStart, capEnd, crease });
}

// Build triangles from rings of Vector3 (each ring a closed loop with equal counts).
export function loftRings(rings, { closedPath = false, capStart = true, capEnd = true, crease = 38 } = {}) {
  const pos = [];
  const push = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const n = rings.length, m = rings[0].length;
  const segs = closedPath ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const A = rings[i], B = rings[(i + 1) % n];
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      push(A[j], B[j], B[j2]);
      push(A[j], B[j2], A[j2]);
    }
  }
  const cap = (R, flip) => {
    const c = new THREE.Vector3(); R.forEach(p => c.add(p)); c.multiplyScalar(1 / R.length);
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      if (flip) push(c, R[j2], R[j]); else push(c, R[j], R[j2]);
    }
  };
  if (!closedPath) { if (capStart) cap(rings[0], false); if (capEnd) cap(rings[n - 1], true); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return fixWinding(finish(g, crease));
}

// If the mesh is closed-ish, make normals point outward (based on signed volume).
export function fixWinding(g) {
  const p = g.attributes.position.array; let vol = 0;
  for (let i = 0; i < p.length; i += 9) {
    vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
  }
  if (vol < 0) flipWinding(g);
  return g;
}

export function flipWinding(g) {
  for (const k of Object.keys(g.attributes)) {
    const a = g.attributes[k], s = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) {
      for (let c = 0; c < s; c++) { const t = arr[(i + 1) * s + c]; arr[(i + 1) * s + c] = arr[(i + 2) * s + c]; arr[(i + 2) * s + c] = t; }
    }
  }
  if (g.attributes.normal) { const n = g.attributes.normal.array; for (let i = 0; i < n.length; i++) n[i] = -n[i]; }
  return g;
}

export function mirrorX(g) {
  const c = g.clone();
  c.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  // applyMatrix4 with negative determinant keeps winding -> flip
  const arrs = Object.keys(c.attributes);
  for (const k of arrs) {
    const a = c.attributes[k], s = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) for (let q = 0; q < s; q++) { const t = arr[(i + 1) * s + q]; arr[(i + 1) * s + q] = arr[(i + 2) * s + q]; arr[(i + 2) * s + q] = t; }
  }
  return c;
}

// ------------------------------------------------------------------ transforms
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();
export function xf(g, { p = [0, 0, 0], r = [0, 0, 0], s = 1, order = 'XYZ' } = {}) {
  _e.set(r[0], r[1], r[2], order); _q.setFromEuler(_e);
  if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.set(s, s, s);
  _m.compose(new THREE.Vector3(p[0], p[1], p[2]), _q, _s);
  g.applyMatrix4(_m);
  return g;
}
// Orient a Y-axis geometry so that it spans from a to b (geometry assumed centered, length L along Y)
export function between(g, a, b, { roll = 0 } = {}) {
  const dir = new THREE.Vector3().subVectors(b, a); const L = dir.length(); dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
  return g;
}
// Orient geometry whose "up" is +Y to point along normal n, located at p.
export function placeOn(g, p, n, spin = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin));
  g.applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)));
  return g;
}

export function merge(list) {
  const geos = list.filter(Boolean);
  let total = 0; for (const g of geos) total += g.attributes.position.count;
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), E = new Float32Array(total);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) N.set(g.attributes.normal.array, o * 3);
    if (g.attributes.aEdge) E.set(g.attributes.aEdge.array, o);
    o += c;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(P, 3));
  r.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  r.setAttribute('aEdge', new THREE.BufferAttribute(E, 1));
  return r;
}

// ------------------------------------------------------------------ detail generators
let _boltGeo = null;
export function boltGeo() {
  if (_boltGeo) return _boltGeo;
  const head = cyl(1, 0.55, { seg: 6, ch: 0.18 });
  xf(head, { p: [0, 0.35, 0] });
  const washer = cyl(1.35, 0.18, { seg: 12, ch: 0.05 });
  xf(washer, { p: [0, 0.09, 0] });
  _boltGeo = merge([head, washer]);
  return _boltGeo;
}
// bolt with radius r at point p, normal n
export function bolt(p, n, r = 0.16, spin = 0) {
  const g = boltGeo().clone();
  g.applyMatrix4(new THREE.Matrix4().makeScale(r, r, r));
  return placeOn(g, p, n, spin);
}

// collect bolts along an inset outline of a plate (plate local coords)
export function plateBolts(outline, { inset = 0.35, step = 1.0, z = 0.2, r = 0.14, warpFn = null, start = 0.5, filter = null } = {}) {
  const inner = offsetPoly(outline, -inset);
  const pts = samplePoly(inner, step, true, start);
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (const s of pts) {
    if (filter && !filter(s.x, s.y)) continue;
    a.set(s.x, s.y, z); b.set(s.x, s.y, z + (z < 0 ? -0.05 : 0.05));
    if (warpFn) { warpFn(a); warpFn(b); }
    const n = b.clone().sub(a).normalize();
    out.push(bolt(a.clone(), n, r, Math.atan2(s.ty, s.tx)));
  }
  return out.length ? merge(out) : null;
}

// grid of bolts on a line from a to b with normal n
export function boltLine(a, b, n, count, r = 0.14) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push(bolt(new THREE.Vector3().lerpVectors(a, b, t), n, r, i * 0.7));
  }
  return merge(out);
}

// Louvered grille: frame outline in XY (local), slats horizontal. Returns {frame, slats, back}
export function louvers(w, h, n, { depth = 0.5, slatT = 0.12, tilt = 35 * DEG, inset = 0.25 } = {}) {
  const slats = [];
  const innerW = w - inset * 2, innerH = h - inset * 2;
  for (let i = 0; i < n; i++) {
    const y = -innerH / 2 + innerH * (i + 0.5) / n;
    const s = rbox(innerW, innerH / n * 0.95, slatT, 0.03, 1);
    xf(s, { r: [PI / 2 - tilt, 0, 0], p: [0, y, -depth * 0.35] });
    slats.push(s);
  }
  return merge(slats);
}

// Hydraulic cylinder between a and b (world/rest coordinates). Returns { sleeve, rod, ends }
export function piston(a, b, { r = 0.45, rodR = 0.24, sleeveFrac = 0.55, eye = true } = {}) {
  const dir = new THREE.Vector3().subVectors(b, a); const L = dir.length(); dir.normalize();
  const sl = L * sleeveFrac;
  const sleeve = merge([
    cyl(r, sl, { seg: 20, ch: 0.06 }),
    xf(ring(r * 0.98, r * 1.12, 0.16, { seg: 20 }), { p: [0, sl / 2 - 0.12, 0] }),
    xf(ring(r * 0.98, r * 1.12, 0.16, { seg: 20 }), { p: [0, -sl / 2 + 0.25, 0] }),
    xf(cyl(r * 0.62, 0.25, { seg: 16 }), { p: [0, sl / 2 + 0.1, 0] }),
  ]);
  xf(sleeve, { p: [0, -L / 2 + sl / 2 + r * 0.6, 0] });
  const rodL = L - sl * 0.5;
  const rod = cyl(rodR, rodL, { seg: 18, ch: 0.03 });
  xf(rod, { p: [0, L / 2 - rodL / 2 - rodR, 0] });
  const ends = [];
  if (eye) {
    const e1 = cyl(r * 0.9, r * 1.2, { seg: 16 }); xf(e1, { r: [0, 0, PI / 2], p: [0, -L / 2 + r * 0.6, 0] });
    const e2 = cyl(rodR * 1.6, rodR * 2.6, { seg: 16 }); xf(e2, { r: [0, 0, PI / 2], p: [0, L / 2 - rodR, 0] });
    ends.push(e1, e2);
  }
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const M = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
  sleeve.applyMatrix4(M); rod.applyMatrix4(M);
  const endG = ends.length ? merge(ends).applyMatrix4(M) : null;
  return { sleeve, rod, ends: endG };
}

// Cable along points (CatmullRom) with radius; returns geometry
export function cable(points, r = 0.2, { seg = 40, radial = 10, tension = 0.5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', tension);
  const g = new THREE.TubeGeometry(curve, seg, r, radial, false);
  return finish(g, 60);
}
export function clampsAlong(points, r, count, { width = 0.25, thick = 0.08 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const p = curve.getPointAt(t), d = curve.getTangentAt(t);
    const c = ring(r * 0.95, r + thick, width, { seg: 12, ch: 0.02 });
    out.push(placeOn(c, p, d));
  }
  return out.length ? merge(out) : null;
}

// ------------------------------------------------------------------ section lofting
// sections: [{c, pts:[[a,b],...], da=0, db=0}] ; polygons must have equal point counts.
// axis 'y': (a,c,b)->(x,y,z); axis 'z': (a,b,c); axis 'x': (c,a,b)
function mapAxis(axis, a, b, c) {
  if (axis === 'y') return new THREE.Vector3(a, c, b);
  if (axis === 'z') return new THREE.Vector3(a, b, c);
  return new THREE.Vector3(c, a, b);
}
export function loft(sections, { axis = 'y', capStart = true, capEnd = true, crease = 38 } = {}) {
  const secs = sections.map(s => ({ c: s.c, pts: ccw(s.pts).map(p => [p[0] + (s.da || 0), p[1] + (s.db || 0)]) }));
  const m = secs[0].pts.length;
  const pos = [];
  const tri = (A, B, C, want) => {
    // want: desired normal direction (Vector3) or null
    if (want) {
      const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
      if (n.dot(want) < 0) { const t = B; B = C; C = t; }
    }
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z, C.x, C.y, C.z);
  };
  const rings = secs.map(s => s.pts.map(p => mapAxis(axis, p[0], p[1], s.c)));
  for (let i = 0; i < secs.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], P = secs[i].pts, Q = secs[i + 1].pts;
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      // outward 2D normal of the edge (average of both sections), for CCW polygon: (dy, -dx)
      const ea = (P[j2][0] - P[j][0]) + (Q[j2][0] - Q[j][0]), eb = (P[j2][1] - P[j][1]) + (Q[j2][1] - Q[j][1]);
      const want = mapAxis(axis, eb, -ea, 0).sub(mapAxis(axis, 0, 0, 0));
      if (want.lengthSq() < 1e-12) { tri(A[j], B[j], B[j2], null); tri(A[j], B[j2], A[j2], null); continue; }
      tri(A[j], B[j], B[j2], want);
      tri(A[j], B[j2], A[j2], want);
    }
  }
  const cap = (idx, dirSign) => {
    const s = secs[idx];
    const contour = s.pts.map(p => new THREE.Vector2(p[0], p[1]));
    const faces = THREE.ShapeUtils.triangulateShape(contour, []);
    const want = mapAxis(axis, 0, 0, dirSign).sub(mapAxis(axis, 0, 0, 0));
    for (const f of faces) tri(rings[idx][f[0]], rings[idx][f[1]], rings[idx][f[2]], want);
  };
  const dir = Math.sign(secs[secs.length - 1].c - secs[0].c) || 1;
  if (capStart) cap(0, -dir);
  if (capEnd) cap(secs.length - 1, dir);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return finish(g, crease);
}

// Convenience: chamfered prism from a 2D polygon along an axis between c0..c1 with chamfer ch at both ends
export function prism(pts, c0, c1, { axis = 'y', ch = 0.15, ch0 = null, ch1 = null, crease = 38 } = {}) {
  const a = ch0 ?? ch, b = ch1 ?? ch;
  const P = ccw(pts);
  const secs = [];
  const sgn = Math.sign(c1 - c0) || 1;
  if (a > 0) secs.push({ c: c0, pts: offsetPoly(P, -a) });
  secs.push({ c: c0 + sgn * a, pts: P });
  secs.push({ c: c1 - sgn * b, pts: P });
  if (b > 0) secs.push({ c: c1, pts: offsetPoly(P, -b) });
  return loft(secs, { axis, crease });
}

// Tapered prism: sections given as list of [c, pts] with chamfered ends
export function taper(list, { axis = 'y', ch = 0.15, crease = 38 } = {}) {
  const secs = [];
  const first = list[0], last = list[list.length - 1];
  const sgn = Math.sign(last[0] - first[0]) || 1;
  if (ch > 0) secs.push({ c: first[0], pts: offsetPoly(first[1], -ch) });
  list.forEach(([c, pts], i) => {
    let cc = c;
    if (i === 0 && ch > 0) cc = c + sgn * ch;
    if (i === list.length - 1 && ch > 0) cc = c - sgn * ch;
    secs.push({ c: cc, pts });
  });
  if (ch > 0) secs.push({ c: last[0], pts: offsetPoly(last[1], -ch) });
  return loft(secs, { axis, crease });
}

// resample closed polygon to exactly n points (by arc length)
export function resample(pts, n) {
  const P = ccw(pts);
  const L = [], segs = []; let tot = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push([a, b, tot, l]); tot += l; }
  const out = [];
  // start at point with max x+small y bias for stable alignment
  for (let k = 0; k < n; k++) {
    const s = tot * k / n;
    const sg = segs.find(q => s >= q[2] && s <= q[2] + q[3] + 1e-9) || segs[segs.length - 1];
    const u = sg[3] > 0 ? (s - sg[2]) / sg[3] : 0;
    out.push([sg[0][0] + (sg[1][0] - sg[0][0]) * u, sg[0][1] + (sg[1][1] - sg[0][1]) * u]);
  }
  return out;
}
// superellipse section (a: half width, b: half depth, e: exponent), n points, CCW, starting at +a
export function superEllipse(a, b, e = 4, n = 48, cx = 0, cy = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = TAU * i / n, c = Math.cos(t), s = Math.sin(t);
    out.push([cx + a * Math.sign(c) * Math.abs(c) ** (2 / e), cy + b * Math.sign(s) * Math.abs(s) ** (2 / e)]);
  }
  return out;
}
// rounded rectangle with exactly 4*(seg+1) points
export function rrect(w, h, r, seg = 3, cx = 0, cy = 0) {
  return fillet([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]], r, seg);
}
