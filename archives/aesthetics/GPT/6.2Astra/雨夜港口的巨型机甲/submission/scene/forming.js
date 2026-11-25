"use strict";
// Colours belong to the machine. Port equipment keeps its own original finishes.
const armourPaint = {
  navy: coat(0x223244, 0.65, 0.343),
  mid: coat(0x35485e, 0.63, 0.328),
  blue: coat(0x44596f, 0.62, 0.332),
  light: coat(0x52667a, 0.62, 0.35),
  red: coat(0x924038, 0.6, 0.335),
  ivory: coat(0xb9b9ab, 0.53, 0.38),
  brass: coat(0x786440, 0.84, 0.32, 0.55),
  grille: coat(0x514932, 0.8, 0.44, 0.55),
  green: emit(0x67ff9a, 3.5),
};
function surfaceNormal(at, u, v, sign = 1) {
  const du = at(u + 0.0001, v).sub(at(u - 0.0001, v));
  const dv = at(u, v + 0.0001).sub(at(u, v - 0.0001));
  return du.cross(dv).normalize().multiplyScalar(sign);
}
function surfaceSeat(parent, at, u, v, sign = 1, lift = 0) {
  const p = at(u, v),
    n = surfaceNormal(at, u, v, sign);
  const x = at(u + 0.0001, v)
    .sub(at(u - 0.0001, v))
    .normalize();
  const g = group(parent);
  g.position.copy(p).addScaledVector(n, lift);
  g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, V().crossVectors(n, x).normalize(), n));
  return g;
}
// A rectangular portion of a forming die with a rolled edge, a wall and
// an underside. Adjacent plates use independent ranges of the same die.
function shellPanel(parent, at, us, vs, mat, opt = {}) {
  const { nu = 10, nv = 8, thick = 0.2, bevel = 0.043, lift = 0, sign = 1 } = opt;
  const [u0, u1] = us,
    [v0, v1] = vs,
    um = (u0 + u1) / 2,
    vm = (v0 + v1) / 2;
  const bu = Math.min(
    (u1 - u0) * 0.15,
    (bevel * 0.0002) / Math.max(0.000001, at(um + 0.0001, vm).distanceTo(at(um - 0.0001, vm)))
  );
  const bv = Math.min(
    (v1 - v0) * 0.15,
    (bevel * 0.0002) / Math.max(0.000001, at(um, vm + 0.0001).distanceTo(at(um, vm - 0.0001)))
  );
  const pos = [],
    idx = [],
    wear = [];
  function point(i, j, inset, depth, w) {
    const u = mix(u0 + bu * inset, u1 - bu * inset, i / nu),
      v = mix(v0 + bv * inset, v1 - bv * inset, j / nv);
    const p = at(u, v).addScaledVector(surfaceNormal(at, u, v, sign), lift - depth);
    pos.push(p.x, p.y, p.z);
    wear.push(w);
    return wear.length - 1;
  }
  function quadFace(a, b, c, d) {
    idx.push(a, b, c, a, c, d);
  }
  const stride = nv + 1,
    layer = (nu + 1) * stride;
  for (let side = 0; side < 2; side++)
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) {
        const d = point(i, j, side ? 0.45 : 1, side ? thick : 0, 0);
        if (i && j) {
          const a = d - stride - 1,
            b = d - 1,
            c = d - stride;
          if (side) quadFace(a, c, d, b);
          else quadFace(a, b, d, c);
        }
      }
  const perimeter = [];
  for (let i = 0; i < nu; i++) perimeter.push([i, 0]);
  for (let j = 0; j < nv; j++) perimeter.push([nu, j]);
  for (let i = nu; i > 0; i--) perimeter.push([i, nv]);
  for (let j = nv; j > 0; j--) perimeter.push([0, j]);
  let prev = perimeter.map(([i, j]) => i * stride + j);
  for (const [inset, depth, w] of [
    [0.22, bevel * 0.26, 0.78],
    [0, bevel, 0.48],
    [0, thick - bevel * 0.25, 0.18],
    [0.45, thick, 0],
  ]) {
    const next = perimeter.map(([i, j]) =>
      depth === thick ? layer + i * stride + j : point(i, j, inset, depth, w)
    );
    for (let i = 0; i < prev.length; i++) {
      const k = (i + 1) % prev.length;
      quadFace(prev[i], next[i], next[k], prev[k]);
    }
    prev = next;
  }
  if (sign < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return mesh(parent, surfaceGeo(pos, idx, null, wear), mat);
}
function surfacePrint(
  parent,
  at,
  us,
  vs,
  mat,
  { lift = 0.018, sign = 1, mirror = false, flipY = false } = {}
) {
  const pos = [],
    uv = [],
    idx = [],
    nu = 18,
    nv = 9;
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const a = i / nu,
        b = j / nv,
        u = mix(...us, a),
        v = mix(...vs, b);
      pos.push(
        ...at(u, v)
          .addScaledVector(surfaceNormal(at, u, v, sign), lift)
          .toArray()
      );
      uv.push(mirror ? 1 - a : a, flipY ? 1 - b : b);
      if (i && j) {
        const d = i * (nv + 1) + j,
          c = d - nv - 1,
          l = c - 1,
          r = d - 1;
        if (sign < 0) idx.push(l, c, d, l, d, r);
        else idx.push(l, r, d, l, d, c);
      }
    }
  const m = mesh(parent, surfaceGeo(pos, idx, uv), mat);
  m.castShadow = false;
  return m;
}
// Hermite interpolation of production sections. End slopes continue slightly
// past each end so surface fixtures have well-defined tangents on the lips.
function sectionValues(rows, x) {
  let i = 0;
  while (i < rows.length - 2 && x > rows[i + 1][0]) i++;
  const p = rows[i],
    q = rows[i + 1],
    a = rows[Math.max(0, i - 1)],
    b = rows[Math.min(rows.length - 1, i + 2)];
  const dx = q[0] - p[0],
    t = (x - p[0]) / dx,
    t2 = t * t,
    t3 = t2 * t;
  return p.slice(1).map((v, j) => {
    const k = j + 1,
      d0 = (dx * (q[k] - a[k])) / (q[0] - a[0]),
      d1 = (dx * (b[k] - p[k])) / (b[0] - p[0]);
    return (2 * t3 - 3 * t2 + 1) * v + (t3 - 2 * t2 + t) * d0 + (-2 * t3 + 3 * t2) * q[k] + (t3 - t2) * d1;
  });
}
function capsuleOutline(w, h, n = 10) {
  const pts = [],
    r = w / 2,
    e = (h - w) / 2;
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n;
    pts.push([r * Math.cos(a), e + r * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (Math.PI * i) / n;
    pts.push([r * Math.cos(a), -e + r * Math.sin(a)]);
  }
  return pts;
}
function capsuleGrille(parent, w, h, blades) {
  const outer = capsuleOutline(w, h),
    inner = capsuleOutline(w - 0.29, h - 0.29);
  plate(parent, outer, 0, 0.34, M.iron, 0.056, null, 1, [inner]);
  plate(parent, inner, -0.16, 0.16, M.black, 0.02);
  const r = (w - 0.32) / 2,
    end = (h - w) / 2;
  for (let j = 0; j < blades; j++) {
    const y = (j + 0.5) * ((h - 0.41) / blades) - (h - 0.41) / 2;
    const span = 2 * Math.sqrt(Math.max(0.008, r * r - Math.max(0, Math.abs(y) - end) ** 2));
    const slat = cutbox(
      parent,
      0,
      y,
      -0.082,
      span,
      ((h - 0.41) / blades) * 0.69,
      0.115,
      armourPaint.grille,
      0.028,
      0.018
    );
    slat.rotation.x = -0.28;
  }
}
