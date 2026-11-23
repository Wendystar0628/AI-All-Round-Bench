import * as THREE from 'three';
import { KINDS } from './materials.js';

// 几何体收集器：把大量小部件按“材质种类”合并成少量网格，减少绘制调用。
// 每个部件用顶点色上色，位置/朝向由 o = {x,y,z, rx,ry,rz, s | sx,sy,sz, k} 给出。
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n3 = new THREE.Matrix3();
const _c = new THREE.Color();

export function xform(o = {}) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'XYZ');
  _q.setFromEuler(_e);
  _p.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.s !== undefined) _s.set(o.s, o.s, o.s);
  else _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
  return _m.clone().compose(_p, _q, _s);
}

export class Builder {
  constructor() {
    this.bins = new Map();
  }

  bin(k) {
    let b = this.bins.get(k);
    if (!b) {
      b = { p: [], n: [], c: [] };
      this.bins.set(k, b);
    }
    return b;
  }

  // 把任意几何体烘焙进对应的合并桶
  add(geo, color, o = {}) {
    const m = xform(o);
    _n3.getNormalMatrix(m);
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const bin = this.bin(o.k || 'solid');
    _c.set(color);
    const { r, g: gg, b } = _c;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m);
      bin.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
      bin.n.push(_v.x, _v.y, _v.z);
      bin.c.push(r, gg, b);
    }
    return this;
  }

  box(w, h, d, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  cyl(rt, rb, h, color, o, seg = 12) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, o); }
  sph(r, color, o, ws = 12, hs = 8) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, o); }
  // 椭球：先缩放几何体本身，再摆放
  ell(rx, ry, rz, color, o, ws = 12, hs = 8) {
    const g = new THREE.SphereGeometry(1, ws, hs);
    g.scale(rx, ry, rz);
    return this.add(g, color, o);
  }
  cone(r, h, color, o, seg = 12) { return this.add(new THREE.ConeGeometry(r, h, seg), color, o); }
  tor(R, r, color, o, seg = 8, rad = 20, arc = Math.PI * 2) {
    return this.add(new THREE.TorusGeometry(R, r, seg, rad, arc), color, o);
  }
  // 旋转体：pts 为 [半径, 高度] 列表
  lathe(pts, color, o, seg = 16) {
    return this.add(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg), color, o);
  }
  // 沿折线的圆管（用于缆绳、电线、链条等）
  tube(points, r, color, o, seg = 24, rad = 5) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return this.add(new THREE.TubeGeometry(curve, seg, r, rad, false), color, o);
  }
  // 平面（默认朝 +Z）
  plane(w, h, color, o) { return this.add(new THREE.PlaneGeometry(w, h), color, o); }
  disc(r, color, o, seg = 24) { return this.add(new THREE.CircleGeometry(r, seg), color, o); }

  // 把各桶合并为网格挂到 parent 上；返回生成的网格列表
  finish(parent) {
    const out = [];
    for (const [k, b] of this.bins) {
      if (!b.p.length) continue;
      const spec = KINDS[k];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, spec.mat());
      mesh.castShadow = spec.cast;
      mesh.receiveShadow = spec.receive;
      mesh.renderOrder = spec.order || 0;
      mesh.name = k;
      parent.add(mesh);
      out.push(mesh);
      if (spec.outline) {
        const om = new THREE.Mesh(g, KINDS.outlineMat);
        om.name = k + '-outline';
        parent.add(om);
      }
    }
    return out;
  }
}
