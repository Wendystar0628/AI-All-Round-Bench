import * as THREE from 'three';

class FBuf {
  constructor(n = 4096) { this.a = new Float32Array(n); this.n = 0; }
  ensure(k) {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2; while (c < this.n + k) c *= 2;
    const b = new Float32Array(c); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  view() { return this.a.slice(0, this.n); }
}
class IBuf {
  constructor(n = 8192) { this.a = new Uint32Array(n); this.n = 0; }
  ensure(k) {
    if (this.n + k <= this.a.length) return;
    let c = this.a.length * 2; while (c < this.n + k) c *= 2;
    const b = new Uint32Array(c); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  view() { return this.a.slice(0, this.n); }
}

const _m3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
let _pieceSeed = 1;
function pieceRand() { _pieceSeed = (_pieceSeed * 16807) % 2147483647; return (_pieceSeed - 1) / 2147483646; }

// Accumulates transformed geometry per material key; merges into few large meshes.
export class Batch {
  constructor(name = 'batch') { this.name = name; this.groups = new Map(); }

  _group(key) {
    let g = this.groups.get(key);
    if (!g) {
      g = { pos: new FBuf(), nrm: new FBuf(), uv: new FBuf(), col: new FBuf(), aux: new FBuf(), idx: new IBuf(), vc: 0 };
      this.groups.set(key, g);
    }
    return g;
  }

  /**
   * @param key material key
   * @param geo BufferGeometry
   * @param m Matrix4|null
   * @param color THREE.Color | number | function(x,y,z,nx,ny,nz,out:Color) | null
   * @param opts { aux: fn(x,y,z,i)->[a,b] , rand, lowH }
   */
  add(key, geo, m = null, color = null, opts = {}) {
    const g = this._group(key);
    const P = geo.attributes.position; if (!P) return;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const N = geo.attributes.normal, UV = geo.attributes.uv, COL = geo.attributes.color;
    const nv = P.count;
    const base = g.vc;
    g.pos.ensure(nv * 3); g.nrm.ensure(nv * 3); g.uv.ensure(nv * 2); g.col.ensure(nv * 3); g.aux.ensure(nv * 2);
    let flip = false;
    if (m) { _m3.getNormalMatrix(m); flip = m.determinant() < 0; }
    let cr = 1, cg = 1, cb = 1; let cfn = null;
    if (typeof color === 'function') cfn = color;
    else if (color !== null && color !== undefined) {
      if (typeof color === 'number') _c.setHex(color); else _c.copy(color);
      cr = _c.r; cg = _c.g; cb = _c.b;
    }
    const rand = opts.rand !== undefined ? opts.rand : pieceRand();
    // first pass: positions (for low-factor we need minY)
    const pa = g.pos.a, na = g.nrm.a, ua = g.uv.a, ca = g.col.a, xa = g.aux.a;
    let p0 = g.pos.n, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < nv; i++) {
      _v.fromBufferAttribute(P, i); if (m) _v.applyMatrix4(m);
      pa[p0 + i * 3] = _v.x; pa[p0 + i * 3 + 1] = _v.y; pa[p0 + i * 3 + 2] = _v.z;
      if (_v.y < minY) minY = _v.y; if (_v.y > maxY) maxY = _v.y;
      _n.fromBufferAttribute(N, i); if (m) _n.applyMatrix3(_m3).normalize();
      na[p0 + i * 3] = _n.x; na[p0 + i * 3 + 1] = _n.y; na[p0 + i * 3 + 2] = _n.z;
    }
    const lowH = opts.lowH !== undefined ? opts.lowH : Math.min(3.0, Math.max(0.3, (maxY - minY) * 0.35));
    const u0 = g.uv.n, c0 = g.col.n, x0 = g.aux.n;
    for (let i = 0; i < nv; i++) {
      if (UV) { ua[u0 + i * 2] = UV.getX(i); ua[u0 + i * 2 + 1] = UV.getY(i); } else { ua[u0 + i * 2] = 0; ua[u0 + i * 2 + 1] = 0; }
      const x = pa[p0 + i * 3], y = pa[p0 + i * 3 + 1], z = pa[p0 + i * 3 + 2];
      if (cfn) {
        cfn(x, y, z, na[p0 + i * 3], na[p0 + i * 3 + 1], na[p0 + i * 3 + 2], _c, i);
        ca[c0 + i * 3] = _c.r; ca[c0 + i * 3 + 1] = _c.g; ca[c0 + i * 3 + 2] = _c.b;
      } else if (COL && (color === null || color === undefined)) {
        ca[c0 + i * 3] = COL.getX(i); ca[c0 + i * 3 + 1] = COL.getY(i); ca[c0 + i * 3 + 2] = COL.getZ(i);
      } else { ca[c0 + i * 3] = cr; ca[c0 + i * 3 + 1] = cg; ca[c0 + i * 3 + 2] = cb; }
      if (opts.aux) {
        const r = opts.aux(x, y, z, i, rand);
        xa[x0 + i * 2] = r[0]; xa[x0 + i * 2 + 1] = r[1];
      } else {
        const t = (y - minY) / lowH; const low = t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
        xa[x0 + i * 2] = low; xa[x0 + i * 2 + 1] = rand;
      }
    }
    g.pos.n += nv * 3; g.nrm.n += nv * 3; g.uv.n += nv * 2; g.col.n += nv * 3; g.aux.n += nv * 2;
    // indices
    const I = geo.index;
    const ni = I ? I.count : nv;
    g.idx.ensure(ni);
    const ia = g.idx.a; let k0 = g.idx.n;
    if (I) {
      const arr = I.array;
      for (let t = 0; t < ni; t += 3) {
        const a = arr[t] + base, b = arr[t + 1] + base, c = arr[t + 2] + base;
        if (flip) { ia[k0++] = a; ia[k0++] = c; ia[k0++] = b; } else { ia[k0++] = a; ia[k0++] = b; ia[k0++] = c; }
      }
    } else {
      for (let t = 0; t < ni; t += 3) {
        const a = t + base, b = t + 1 + base, c = t + 2 + base;
        if (flip) { ia[k0++] = a; ia[k0++] = c; ia[k0++] = b; } else { ia[k0++] = a; ia[k0++] = b; ia[k0++] = c; }
      }
    }
    g.idx.n = k0;
    g.vc += nv;
  }

  // Build meshes. mats: { key: Material }. flags: { key: {cast, receive, layer, renderOrder} }
  build(parent, mats, flags = {}) {
    const out = [];
    for (const [key, g] of this.groups) {
      if (g.vc === 0) continue;
      const mat = mats[key];
      if (!mat) { console.warn('missing material', key); continue; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos.view(), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.nrm.view(), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv.view(), 2));
      geo.setAttribute('color', new THREE.BufferAttribute(g.col.view(), 3));
      geo.setAttribute('aux', new THREE.BufferAttribute(g.aux.view(), 2));
      geo.setIndex(new THREE.BufferAttribute(g.idx.view(), 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = this.name + ':' + key;
      const f = flags[key] || {};
      mesh.castShadow = f.cast !== undefined ? f.cast : true;
      mesh.receiveShadow = f.receive !== undefined ? f.receive : true;
      if (f.layer !== undefined) mesh.layers.set(f.layer);
      if (f.renderOrder !== undefined) mesh.renderOrder = f.renderOrder;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  }

  triCount() { let t = 0; for (const g of this.groups.values()) t += g.idx.n / 3; return t; }
}

// ---- matrix helpers ----
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
export function mat(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}
export function matQ(pos, quat, scale) { return new THREE.Matrix4().compose(pos, quat, scale || new THREE.Vector3(1, 1, 1)); }
// matrix mapping +Y axis onto direction from a to b (for beams/columns/links), with length scale on Y
const _up = new THREE.Vector3(0, 1, 0);
export function matBetween(a, b, sx = 1, sz = 1, lenScale = true) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(sx, lenScale ? len : 1, sz));
}
export function mul(...ms) { const r = new THREE.Matrix4(); for (const m of ms) r.multiply(m); return r; }

// Basis matrix for a segment: local X spans a->b (unit length geometry with x in [0,1]),
// local Y is 'up' made orthogonal, local Z = X x Y. Scales X by the segment length.
export function matSeg(a, b, up = new THREE.Vector3(0, 1, 0), sy = 1, sz = 1) {
  const X = new THREE.Vector3().subVectors(b, a); const len = X.length(); X.divideScalar(len || 1);
  let Y = up.clone().addScaledVector(X, -up.dot(X)); if (Y.lengthSq() < 1e-6) Y.set(0, 0, 1).addScaledVector(X, -X.z);
  Y.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  const m = new THREE.Matrix4().makeBasis(X.multiplyScalar(len), Y.multiplyScalar(sy), Z.multiplyScalar(sz));
  m.setPosition(a);
  return m;
}
// frame from explicit axes (X, Y, Z unit) and origin
export function matFrame(o, X, Y, Z) { const m = new THREE.Matrix4().makeBasis(X, Y, Z); m.setPosition(o); return m; }
// invert winding + normals (for inward-facing interior surfaces)
export function invertGeo(g) {
  const gg = g.index ? g : g.toNonIndexed();
  if (gg.index) { const a = gg.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } }
  else { const p = gg.attributes.position; for (let i = 0; i < p.count; i += 3) { for (const k of ['position', 'normal', 'uv']) { const at = gg.attributes[k]; if (!at) continue; const n = at.itemSize; for (let c = 0; c < n; c++) { const t = at.array[(i + 1) * n + c]; at.array[(i + 1) * n + c] = at.array[(i + 2) * n + c]; at.array[(i + 2) * n + c] = t; } } } }
  const n = gg.attributes.normal; if (n) for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return gg;
}
