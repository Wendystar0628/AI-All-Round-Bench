import * as THREE from 'three';

// Coarse solid world used to keep the viewer camera out of rock, ground and buildings.
export class Collider {
  constructor() {
    this.cell = 20;
    this.grid = new Map();
    this.prims = [];
    this.rocks = []; // {x,y,z, rad(y_local)->r, depth}
    this.grounds = []; // fn(x,z) -> y or -inf, bounded by {x,z,r}
  }
  _key(i, j) { return i * 73856093 ^ j * 19349663; }
  _insert(p, minx, maxx, minz, maxz) {
    const c = this.cell;
    for (let i = Math.floor(minx / c); i <= Math.floor(maxx / c); i++) for (let j = Math.floor(minz / c); j <= Math.floor(maxz / c); j++) {
      const k = this._key(i, j); let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(p);
    }
  }
  // oriented box (rotation about y), center at (cx, cy, cz), half extents
  addBox(cx, cy, cz, hx, hy, hz, ry = 0) {
    const p = { t: 0, cx, cy, cz, hx, hy, hz, c: Math.cos(ry), s: Math.sin(ry) };
    const R = Math.hypot(hx, hz);
    this.prims.push(p); this._insert(p, cx - R, cx + R, cz - R, cz + R);
  }
  addCyl(cx, cz, r, y0, y1) {
    const p = { t: 1, cx, cz, r, y0, y1 };
    this.prims.push(p); this._insert(p, cx - r, cx + r, cz - r, cz + r);
  }
  addRock(x, y, z, radiusFn, depth, R0) { this.rocks.push({ x, y, z, radiusFn, depth, R0 }); }
  addGround(fn, x, z, r) { this.grounds.push({ fn, x, z, r }); }

  inside(px, py, pz, m = 2) {
    for (const g of this.grounds) {
      const dx = px - g.x, dz = pz - g.z; if (dx * dx + dz * dz > g.r * g.r) continue;
      const gy = g.fn(px, pz); if (py < gy + m && py > gy - 60) return true;
    }
    for (const r of this.rocks) {
      const ly = py - r.y; if (ly > m || ly < -r.depth * 1.05 - m) continue;
      const dx = px - r.x, dz = pz - r.z; const d = Math.hypot(dx, dz);
      if (d > r.R0 * 1.3 + m) continue;
      const th = Math.atan2(dx, -dz);
      const rr = r.radiusFn(th < 0 ? th + Math.PI * 2 : th, Math.min(0, ly));
      if (d < rr + m) return true;
    }
    const a = this.grid.get(this._key(Math.floor(px / this.cell), Math.floor(pz / this.cell)));
    if (a) for (const p of a) {
      if (p.t === 0) {
        const dx = px - p.cx, dz = pz - p.cz, dy = py - p.cy;
        const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
        if (Math.abs(lx) < p.hx + m && Math.abs(lz) < p.hz + m && Math.abs(dy) < p.hy + m) return true;
      } else {
        const dx = px - p.cx, dz = pz - p.cz;
        if (dx * dx + dz * dz < (p.r + m) * (p.r + m) && py > p.y0 - m && py < p.y1 + m) return true;
      }
    }
    return false;
  }

  // Pull the camera toward the target until it is in free space. Returns corrected position or null.
  resolve(target, pos, m = 2.5) {
    const d = new THREE.Vector3().subVectors(pos, target); const len = d.length();
    if (len < 1e-3) return null;
    d.divideScalar(len);
    const targetInside = this.inside(target.x, target.y, target.z, 0.5);
    if (targetInside) {
      // only make sure the camera itself is free: push it further out / up
      if (!this.inside(pos.x, pos.y, pos.z, m)) return null;
      const p = pos.clone();
      for (let i = 0; i < 80; i++) { p.addScaledVector(d, 3); p.y += 1; if (!this.inside(p.x, p.y, p.z, m)) return p; }
      return p;
    }
    const step = Math.max(1.0, len / 100);
    const at = (t, mm) => this.inside(target.x + d.x * t, target.y + d.y * t, target.z + d.z * t, mm);
    let t = step;
    // ignore the target's own neighbourhood if it sits within a collider margin
    while (t < len * 0.5 && at(t, m * 0.6)) t += step;
    if (t >= len * 0.5) return null;
    let tFree = t, hit = false;
    for (; t <= len; t += step) {
      if (at(t, t < len - step ? m * 0.6 : m)) { hit = true; break; }
      tFree = t;
    }
    return new THREE.Vector3().copy(target).addScaledVector(d, Math.max(tFree - step * 0.5, Math.min(len, 2)));
  }
}
