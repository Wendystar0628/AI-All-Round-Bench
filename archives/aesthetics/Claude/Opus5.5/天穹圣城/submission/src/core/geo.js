import * as THREE from 'three';

// ---------------- basic primitives (base-aligned at y=0 unless noted) ----------------
export function box(w, h, d) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return g; }
export function boxC(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rt, rb, h, seg = 12, open = false, hseg = 1) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, hseg, open); g.translate(0, h / 2, 0); return g; }
export function cylC(rt, rb, h, seg = 12, open = false) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); }
export function cone(r, h, seg = 12) { const g = new THREE.ConeGeometry(r, h, seg, 1, true); g.translate(0, h / 2, 0); return meterUV(g, 2 * Math.PI * r, Math.hypot(r, h)); }
export function sphere(r, ws = 12, hs = 8) { return new THREE.SphereGeometry(r, ws, hs); }
export function torus(R, r, rs = 8, ts = 24, arc = Math.PI * 2) { return new THREE.TorusGeometry(R, r, rs, ts, arc); }
export function plane(w, h) { return new THREE.PlaneGeometry(w, h); }

export function meterUV(g, su, sv) {
  const uv = g.attributes.uv; if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

// Lathe from profile [[r,y],...] (bottom to top). meter UVs: u = arc length around at max radius, v = profile length.
export function lathe(profile, seg = 24, meters = true, phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y));
  const g = new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
  if (meters) {
    let L = 0, rmax = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    for (const p of pts) rmax = Math.max(rmax, p.x);
    meterUV(g, rmax * phiLength, L);
  }
  return g;
}

// dome profile generators (r = radius at base, h = height). Returns profile [[r,y],...]
export function domeProfile(r, h, n = 12, kind = 'round') {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n; // 0 base -> 1 top
    let x, y;
    if (kind === 'round') { const a = t * Math.PI / 2; x = r * Math.cos(a); y = h * Math.sin(a); }
    else if (kind === 'pointed') { const a = t * Math.PI / 2; x = r * Math.cos(a) * (1 - 0.18 * Math.sin(a * 2)); y = h * Math.pow(Math.sin(a), 0.85); }
    else if (kind === 'onion') { const a = t * Math.PI; x = r * (Math.sin(a * 0.9 + 0.35) * (1 - t) * 1.25 + 0.0); y = h * t; }
    else { x = r * (1 - t); y = h * t; }
    out.push([Math.max(x, 0.001), y]);
  }
  return out;
}

// ---------------- 2D shapes ----------------
export function roundArchPath(path, w, springH, x0 = 0, seg = 14) {
  // path at (x0 - w/2, 0) going up, arc, down to (x0 + w/2, 0); for holes we build full shape
  const r = w / 2;
  path.moveTo(x0 - r, 0); path.lineTo(x0 - r, springH);
  for (let i = 1; i <= seg; i++) { const a = Math.PI - (i / seg) * Math.PI; path.lineTo(x0 + Math.cos(a) * r, springH + Math.sin(a) * r); }
  path.lineTo(x0 + r, 0); path.lineTo(x0 - r, 0);
  return path;
}
export function pointedArchPath(path, w, springH, x0 = 0, seg = 8, k = 1.0) {
  // equilateral-ish gothic arch: two arcs with radius k*w centered at opposite springs
  const R = k * w, hw = w / 2;
  path.moveTo(x0 - hw, 0); path.lineTo(x0 - hw, springH);
  // left arc: center at (x0 + hw - R, springH)? For equilateral: center at right spring for left arc
  const cxL = x0 - hw + R, cxR = x0 + hw - R;
  const apexX = x0, apexY = springH + Math.sqrt(Math.max(R * R - (apexX - cxL) * (apexX - cxL), 0));
  const a0 = Math.PI, a1 = Math.atan2(apexY - springH, apexX - cxL);
  for (let i = 1; i <= seg; i++) { const a = a0 + (a1 - a0) * (i / seg); path.lineTo(cxL + Math.cos(a) * R, springH + Math.sin(a) * R); }
  const b0 = Math.atan2(apexY - springH, apexX - cxR), b1 = 0;
  for (let i = 1; i <= seg; i++) { const a = b0 + (b1 - b0) * (i / seg); path.lineTo(cxR + Math.cos(a) * R, springH + Math.sin(a) * R); }
  path.lineTo(x0 + hw, 0); path.lineTo(x0 - hw, 0);
  return path;
}
export function archHeight(w, springH, type = 'round', k = 1.0) {
  if (type === 'round') return springH + w / 2;
  const R = k * w, hw = w / 2; return springH + Math.sqrt(Math.max(R * R - (R - hw) * (R - hw), 0));
}

// Wall slab (length along x, height y, thickness z centered) with arched openings.
// openings: [{x, w, sh (spring height), y0 (sill), type:'round'|'pointed'}]
export function wallWithOpenings(len, h, thick, openings = [], curveSeg = 10) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0); s.lineTo(len / 2, h); s.lineTo(-len / 2, h); s.lineTo(-len / 2, 0);
  for (const o of openings) {
    const p = new THREE.Path();
    const sill = o.y0 || 0;
    if (o.type === 'rect') {
      p.moveTo(o.x - o.w / 2, sill); p.lineTo(o.x - o.w / 2, sill + o.sh); p.lineTo(o.x + o.w / 2, sill + o.sh); p.lineTo(o.x + o.w / 2, sill); p.lineTo(o.x - o.w / 2, sill);
    } else {
      const tmp = new THREE.Path();
      (o.type === 'pointed' ? pointedArchPath : roundArchPath)(tmp, o.w, o.sh, o.x, curveSeg);
      const pts = tmp.getPoints();
      p.moveTo(pts[0].x, pts[0].y + sill);
      for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y + sill);
    }
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: curveSeg });
  g.translate(0, 0, -thick / 2);
  return g;
}

// extrude a shape along z (centered)
export function extrude(shape, depth, bevel = 0, curveSegments = 10) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Arch ring (voussoir band) as an extruded annular arch: inner span w, thickness t, depth d
export function archRing(w, t, d, type = 'round', seg = 16, springH = 0) {
  const outer = new THREE.Shape();
  const hw = w / 2;
  const ptsIn = [], ptsOut = [];
  if (type === 'round') {
    for (let i = 0; i <= seg; i++) { const a = Math.PI - (i / seg) * Math.PI; ptsIn.push([Math.cos(a) * hw, springH + Math.sin(a) * hw]); ptsOut.push([Math.cos(a) * (hw + t), springH + Math.sin(a) * (hw + t)]); }
  } else {
    const R = w, cxL = -hw + R, cxR = hw - R;
    const apexY = Math.sqrt(R * R - hw * hw);
    const h2 = seg >> 1;
    for (let i = 0; i <= h2; i++) {
      const a = Math.PI + (Math.atan2(apexY, -cxL) - Math.PI) * (i / h2);
      ptsIn.push([cxL + Math.cos(a) * R, springH + Math.sin(a) * R]);
      ptsOut.push([cxL + Math.cos(a) * (R + t), springH + Math.sin(a) * (R + t)]);
    }
    for (let i = 1; i <= h2; i++) {
      const a0 = Math.atan2(apexY, -cxR); const a = a0 * (1 - i / h2);
      ptsIn.push([cxR + Math.cos(a) * R, springH + Math.sin(a) * R]);
      ptsOut.push([cxR + Math.cos(a) * (R + t), springH + Math.sin(a) * (R + t)]);
    }
  }
  outer.moveTo(ptsOut[0][0], ptsOut[0][1]);
  for (let i = 1; i < ptsOut.length; i++) outer.lineTo(ptsOut[i][0], ptsOut[i][1]);
  for (let i = ptsIn.length - 1; i >= 0; i--) outer.lineTo(ptsIn[i][0], ptsIn[i][1]);
  outer.lineTo(ptsOut[0][0], ptsOut[0][1]);
  return extrude(outer, d, 0, seg);
}

// spandrel / bridge span: rectangle (len x h) with one arch hole of span w (springing at sh); depth = width
export function archSpan(len, h, depth, w, sh, type = 'round', seg = 16) {
  return wallWithOpenings(len, h, depth, [{ x: 0, w, sh, y0: 0, type }], seg);
}

// gable roof: ridge along x. w = length (x), d = depth (z), h = ridge height. overhang o. returns roof slopes only
export function gableRoof(w, d, h, o = 0.4, thick = 0.18) {
  const hw = w / 2 + o, hd = d / 2 + o;
  const slope = Math.hypot(hd, h + o * h / (d / 2));
  const yE = -o * h / (d / 2); // eave drop due to overhang
  const pos = [], uv = [], idx = [];
  const quad = (a, b, c, dd, ua, ub, uc, ud) => {
    const n = pos.length / 3; pos.push(...a, ...b, ...c, ...dd); uv.push(...ua, ...ub, ...uc, ...ud); idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };
  // front slope (+z)
  quad([-hw, yE, hd], [hw, yE, hd], [hw, h, 0], [-hw, h, 0], [0, 0], [2 * hw, 0], [2 * hw, slope], [0, slope]);
  // back slope (-z)
  quad([hw, yE, -hd], [-hw, yE, -hd], [-hw, h, 0], [hw, h, 0], [0, 0], [2 * hw, 0], [2 * hw, slope], [0, slope]);
  // underside thickness (eave fascia)
  quad([-hw, yE - thick, hd], [hw, yE - thick, hd], [hw, yE, hd], [-hw, yE, hd], [0, 0], [2 * hw, 0], [2 * hw, 0.2], [0, 0.2]);
  quad([hw, yE - thick, -hd], [-hw, yE - thick, -hd], [-hw, yE, -hd], [hw, yE, -hd], [0, 0], [2 * hw, 0], [2 * hw, 0.2], [0, 0.2]);
  // underside planes
  quad([hw, yE - thick, hd], [-hw, yE - thick, hd], [-hw, h - thick, 0], [hw, h - thick, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  quad([-hw, yE - thick, -hd], [hw, yE - thick, -hd], [hw, h - thick, 0], [-hw, h - thick, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
  // gable end edges (verge)
  const tri = (a, b, c) => { const n = pos.length / 3; pos.push(...a, ...b, ...c); uv.push(0, 0, 1, 0, 0.5, 1); idx.push(n, n + 1, n + 2); };
  tri([hw, yE - thick, hd], [hw, yE, hd], [hw, h, 0]); tri([hw, yE - thick, hd], [hw, h, 0], [hw, h - thick, 0]);
  tri([hw, h - thick, 0], [hw, h, 0], [hw, yE, -hd]); tri([hw, h - thick, 0], [hw, yE, -hd], [hw, yE - thick, -hd]);
  tri([-hw, yE, hd], [-hw, yE - thick, hd], [-hw, h, 0]); tri([-hw, h, 0], [-hw, yE - thick, hd], [-hw, h - thick, 0]);
  tri([-hw, h, 0], [-hw, h - thick, 0], [-hw, yE, -hd]); tri([-hw, yE, -hd], [-hw, h - thick, 0], [-hw, yE - thick, -hd]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return toFlat(g);
}

// gable end wall triangle (for the house body), width d along z at x = ±w/2
export function gableWall(d, h, thick = 0.3) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
  const g = extrude(s, thick); g.rotateY(Math.PI / 2); return g;
}

// hip roof: rectangle w (x) by d (z), height h, overhang o
export function hipRoof(w, d, h, o = 0.4) {
  const hw = w / 2 + o, hd = d / 2 + o;
  const ridge = Math.max(0, hw - hd);
  const yE = -o * h / (Math.min(w, d) / 2);
  const P = [
    [-hw, yE, hd], [hw, yE, hd], [hw, yE, -hd], [-hw, yE, -hd], [-ridge, h, 0], [ridge, h, 0],
  ];
  const pos = [], uv = [];
  const tri = (a, b, c, ua, ub, uc) => { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); };
  const sl = Math.hypot(hd, h - yE);
  // front & back trapezoids
  tri(P[0], P[1], P[5], [0, 0], [2 * hw, 0], [hw + ridge, sl]); tri(P[0], P[5], P[4], [0, 0], [hw + ridge, sl], [hw - ridge, sl]);
  tri(P[2], P[3], P[4], [0, 0], [2 * hw, 0], [hw + ridge, sl]); tri(P[2], P[4], P[5], [0, 0], [hw + ridge, sl], [hw - ridge, sl]);
  // sides
  const sl2 = Math.hypot(hw - ridge, h - yE);
  tri(P[1], P[2], P[5], [0, 0], [2 * hd, 0], [hd, sl2]);
  tri(P[3], P[0], P[4], [0, 0], [2 * hd, 0], [hd, sl2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function pyramidRoof(w, d, h, o = 0.3) { return hipRoof(Math.min(w, d) + 0.0001, Math.min(w, d), h, o); }

// Convert indexed geometry to flat-shaded non-indexed (for crisp faceted roofs)
export function toFlat(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }

// tube along a list of Vector3
export function tube(points, r, radial = 6, segs = null, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segs || Math.max(4, points.length * 4), r, radial, closed);
}
// tapering tube (for roots, vines, branches): radius from r0 to r1
export function taperTube(points, r0, r1, radial = 6, segs = null) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const n = segs || Math.max(6, points.length * 5);
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false);
  const pos = g.attributes.position;
  // TubeGeometry vertex order: for each segment i (0..n), radial j (0..radial)
  const frames = curve.computeFrenetFrames(n, false);
  for (let i = 0; i <= n; i++) {
    const t = i / n; const r = r0 + (r1 - r0) * t; const P = curve.getPointAt(t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      const v = new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// baluster (lathe), height h, max radius r
export function baluster(h = 0.9, r = 0.09, seg = 7) {
  const p = [[r * 0.95, 0], [r * 0.95, 0.08 * h], [r * 0.6, 0.12 * h], [r * 1.0, 0.32 * h], [r * 0.95, 0.45 * h], [r * 0.45, 0.66 * h], [r * 0.4, 0.78 * h], [r * 0.7, 0.84 * h], [r * 0.95, 0.9 * h], [r * 0.95, h]];
  return lathe(p, seg, false);
}

// classical column: base + shaft + capital, total height h, shaft radius r
export function column(h, r, seg = 12, kind = 'doric') {
  const p = [];
  const bh = r * 0.7, ch = kind === 'corinth' ? r * 1.6 : r * 0.9;
  p.push([r * 1.45, 0], [r * 1.45, bh * 0.35], [r * 1.25, bh * 0.45], [r * 1.25, bh * 0.7], [r * 1.05, bh * 0.8], [r * 1.0, bh]);
  const sh = h - bh - ch;
  for (let i = 1; i <= 4; i++) { const t = i / 4; p.push([r * (1 - 0.12 * t * t), bh + sh * t]); }
  if (kind === 'corinth') {
    p.push([r * 0.98, bh + sh + ch * 0.08], [r * 1.25, bh + sh + ch * 0.55], [r * 1.55, bh + sh + ch * 0.85], [r * 1.55, h], [0.001, h]);
  } else {
    p.push([r * 1.05, bh + sh + ch * 0.15], [r * 1.3, bh + sh + ch * 0.55], [r * 1.45, bh + sh + ch * 0.62], [r * 1.45, h], [0.001, h]);
  }
  return lathe(p, seg, false);
}

// Gothic pinnacle (square shaft + pyramid + finial), base width w, height h
export function pinnacleParts(w, h) {
  const parts = [];
  parts.push({ g: box(w, h * 0.45, w), y: 0 });
  parts.push({ g: rotY45(new THREE.ConeGeometry(w * 0.72, h * 0.5, 4, 1)), y: h * 0.45 + h * 0.25, centered: true });
  parts.push({ g: new THREE.SphereGeometry(w * 0.16, 6, 4), y: h * 0.97, centered: true });
  return parts;
}
export function rotY45(g) { g.rotateY(Math.PI / 4); return g; }

// chain link (elongated torus) length L along Y, width W, wire radius r
export function chainLink(L, W, r, rs = 6, ts = 16) {
  const g = new THREE.TorusGeometry(1, r, rs, ts);
  // torus in XY plane with radius 1; stretch along Y to make stadium shape
  const pos = g.attributes.position; const half = (L - W) / 2;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i);
    // map ring of radius 1 to radius W/2
    const ang = Math.atan2(y, x); const rad = Math.hypot(x, y);
    const scale = (W / 2 - r) + (rad - 1);
    let nx = Math.cos(ang) * scale, ny = Math.sin(ang) * scale;
    ny += Math.sign(ny) * half;
    pos.setXY(i, nx, ny);
  }
  g.computeVertexNormals();
  return g;
}

// helper: merge simple geometries (no attributes check) — returns a new geometry with position/normal/uv
export function mergeSimple(list) {
  let nv = 0, ni = 0;
  const prepared = list.map(({ g, m }) => {
    const gg = g.index ? g : (() => { const c = g.clone(); const idx = []; for (let i = 0; i < c.attributes.position.count; i++) idx.push(i); c.setIndex(idx); return c; })();
    const c = gg.clone(); if (m) c.applyMatrix4(m);
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    if (!c.attributes.normal) c.computeVertexNormals();
    nv += c.attributes.position.count; ni += c.index.count; return c;
  });
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const c of prepared) {
    pos.set(c.attributes.position.array, vo * 3); nrm.set(c.attributes.normal.array, vo * 3); uv.set(c.attributes.uv.array, vo * 2);
    const I = c.index.array; for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
    vo += c.attributes.position.count; io += I.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ring segment helpers (polar placement)
export function polar(r, ang, y = 0) { return new THREE.Vector3(Math.sin(ang) * r, y, -Math.cos(ang) * r); }
// angle from clock hour (12 = back/-z, 3 = right/+x, 6 = front/+z, 9 = left/-x)
export function clockAng(h) { return h * Math.PI / 6; }
export function clockDir(h) { const a = clockAng(h); return new THREE.Vector3(Math.sin(a), 0, -Math.cos(a)); }
// rotation (ry) so that a local +z axis faces outward at polar angle ang
export function faceOut(ang) { return Math.PI - ang; }
