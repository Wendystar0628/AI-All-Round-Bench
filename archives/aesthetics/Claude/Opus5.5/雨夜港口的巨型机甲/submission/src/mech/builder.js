// Skeleton + part registry + static baking into merged meshes per material.
import * as THREE from 'three';
import { mirrorX } from './geo.js';

let _rs = 9137;
export function brand() { _rs = (_rs * 1103515245 + 12345) & 0x7fffffff; return _rs / 0x7fffffff; }

export const PAL = {
  navy: 0x1d2c48,
  navy2: 0x22345a,
  navyDark: 0x16223a,
  steel: 0x41597a,
  steel2: 0x4d6687,
  gun: 0x3a3e46,
  gunDark: 0x24272d,
  gunLight: 0x5a5f69,
  red: 0xa81d18,
  orange: 0xc9441a,
  yellow: 0xd9a01a,
  white: 0xd7d6cf,
  black: 0x0c0d0f,
  rubber: 0x101113,
};

export class Builder {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'mechRoot';
    this.J = {};
    this.parts = [];
    this.markers = {};
    this.dynamic = [];
    this.later = [];
    this.named = {};
    const r = new THREE.Object3D(); r.name = 'root'; r.userData.rest = new THREE.Vector3();
    this.root.add(r); this.J.root = r;
  }
  joint(name, parent, rest) {
    const o = new THREE.Object3D(); o.name = name;
    const p = this.J[parent];
    o.userData.rest = rest.clone();
    o.position.copy(rest).sub(p.userData.rest);
    p.add(o);
    this.J[name] = o;
    return o;
  }
  // geometry authored in REST world coordinates, attached to joint
  add(jn, geo, mat = 'paint', color = PAL.navy, opts = {}) {
    if (!geo) return null;
    const j = this.J[jn];
    const m = new THREE.Mesh(geo, null);
    m.position.copy(j.userData.rest).negate();
    m.userData = { mat, color: new THREE.Color(color), vary: opts.vary ?? 1, seed: opts.seed ?? brand(), mirror: false };
    j.add(m);
    this.parts.push(m);
    return m;
  }
  // add geometry for the left side and its mirror for the right side (joint names with L/R suffix)
  addLR(jnBase, geo, mat = 'paint', color = PAL.navy, opts = {}) {
    const a = this.add(jnBase + 'L', geo, mat, color, opts);
    const b = this.add(jnBase + 'R', mirrorX(geo), mat, color, opts);
    return [a, b];
  }
  // symmetric piece attached to a central joint, mirrored across x
  addSym(jn, geo, mat = 'paint', color = PAL.navy, opts = {}) {
    const a = this.add(jn, geo, mat, color, opts);
    const b = this.add(jn, mirrorX(geo), mat, color, { ...opts, seed: (opts.seed ?? brand()) + 0.37 });
    return [a, b];
  }
  // geometry already in POSED world coordinates
  addW(geo, mat = 'metal', color = PAL.gun, opts = {}) {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, null);
    m.userData = { mat, color: new THREE.Color(color), vary: opts.vary ?? 1, seed: opts.seed ?? brand() };
    this.J.root.add(m);
    this.parts.push(m);
    return m;
  }
  marker(jn, name, rest) {
    const j = this.J[jn];
    const o = new THREE.Object3D();
    o.position.copy(rest).sub(j.userData.rest);
    j.add(o);
    (this.markers[name] ||= []).push(o);
    return o;
  }
  pw(jn, rest) {
    const j = this.J[jn];
    this.root.updateMatrixWorld(true);
    return j.localToWorld(rest.clone().sub(j.userData.rest));
  }
  markerWorld(name) {
    this.root.updateMatrixWorld(true);
    return (this.markers[name] || []).map(o => o.getWorldPosition(new THREE.Vector3()));
  }
  // set a joint's world rotation (keeps hierarchy)
  setWorldQuat(jn, q) {
    const j = this.J[jn];
    this.root.updateMatrixWorld(true);
    const pq = new THREE.Quaternion();
    j.parent.getWorldQuaternion(pq);
    j.quaternion.copy(pq.invert().multiply(q));
  }

  // Merge all static parts into one geometry per material key.
  bake(materials) {
    this.root.updateMatrixWorld(true);
    const buckets = {};
    const tmpC = new THREE.Color();
    const nm = new THREE.Matrix3();
    for (const m of this.parts) {
      if (m.userData.dynamic) continue;
      const key = m.userData.mat;
      (buckets[key] ||= []).push(m);
    }
    const out = new THREE.Group(); out.name = 'mechBaked';
    const stats = {};
    for (const key of Object.keys(buckets)) {
      const list = buckets[key];
      let total = 0;
      for (const m of list) total += m.geometry.attributes.position.count;
      const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3), E = new Float32Array(total), Sd = new Float32Array(total);
      let o = 0;
      const v = new THREE.Vector3();
      for (const m of list) {
        const g = m.geometry, pa = g.attributes.position, na = g.attributes.normal, ea = g.attributes.aEdge;
        const M = m.matrixWorld; nm.getNormalMatrix(M);
        const seed = m.userData.seed;
        const vary = m.userData.vary;
        tmpC.copy(m.userData.color);
        if (vary) {
          const hsl = {}; tmpC.getHSL(hsl);
          const r1 = fract(Math.sin(seed * 91.7) * 43758.5), r2 = fract(Math.sin(seed * 37.3) * 12345.6);
          tmpC.setHSL(hsl.h + (r1 - 0.5) * 0.012 * vary, hsl.s * (1 + (r2 - 0.5) * 0.12 * vary), hsl.l * (1 + (r1 - 0.5) * 0.16 * vary));
        }
        for (let i = 0; i < pa.count; i++, o++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(M);
          P[o * 3] = v.x; P[o * 3 + 1] = v.y; P[o * 3 + 2] = v.z;
          v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize();
          N[o * 3] = v.x; N[o * 3 + 1] = v.y; N[o * 3 + 2] = v.z;
          C[o * 3] = tmpC.r; C[o * 3 + 1] = tmpC.g; C[o * 3 + 2] = tmpC.b;
          E[o] = ea ? ea.array[i] : 0;
          Sd[o] = seed;
        }
        m.removeFromParent();
        g.dispose();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.BufferAttribute(C, 3));
      g.setAttribute('aEdge', new THREE.BufferAttribute(E, 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(Sd, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, materials[key] || materials.paint);
      mesh.name = 'mech_' + key;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.matKey = key;
      out.add(mesh);
      stats[key] = total / 3;
    }
    this.parts = this.parts.filter(m => m.userData.dynamic);
    return { group: out, stats };
  }
}

function fract(x) { return x - Math.floor(x); }
