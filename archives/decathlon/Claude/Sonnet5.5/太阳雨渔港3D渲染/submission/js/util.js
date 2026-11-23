'use strict';
/* 基础工具：随机数、噪声、几何合并构建器、画布纹理 */
const V3 = THREE.Vector3, M4 = THREE.Matrix4, Col = THREE.Color, Q4 = THREE.Quaternion, Eul = THREE.Euler;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const R = mulberry32(20240607);          // 场景构建用的确定性随机
const rnd = (a = 0, b = 1) => a + (b - a) * R();
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(R() * arr.length)];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };

function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm2(x, y, o = 4) {
  let a = 0.5, s = 0;
  for (let i = 0; i < o; i++) { s += a * noise2(x, y); x = x * 2.03 + 5.1; y = y * 2.03 + 1.7; a *= 0.5; }
  return s;
}

/* ---------- 颜色 ---------- */
const _cc = new Col();
function toColor(c) {
  if (c instanceof Col) return c;
  return new Col(c);
}
function mixHex(a, b, t) { return toColor(a).clone().lerp(toColor(b), t); }

/* ---------- 几何缓存 ---------- */
const _gc = {};
function cached(key, fn) { return _gc[key] || (_gc[key] = fn()); }

/* ---------- Parts: 把大量小几何合并为一个带顶点色的 BufferGeometry ---------- */
class Parts {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.u = []; this.s = []; this.i = [];
    this.cnt = 0; this.xf = new M4(); this.stack = []; this.jit = 0.035; this.swayOn = false;
    this._m = new M4(); this._q = new Q4(); this._e = new Eul(); this._v = new V3(); this._nm = new THREE.Matrix3();
  }
  // 局部坐标系变换（可嵌套）
  T(pos, rot, scale, fn) {
    this.stack.push(this.xf.clone());
    const m = this._m.compose(
      new V3(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0),
      this._q.setFromEuler(this._e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ')),
      new V3(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1));
    this.xf.multiply(m);
    fn();
    this.xf = this.stack.pop();
  }
  // 加入一个几何；color 可为颜色或 (x,y,z)=>Color；sway 为 (x,y,z)=>[weight,phase]
  add(geo, pos, rot, scale, color, sway) {
    const m = new M4().compose(
      new V3(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0),
      new Q4().setFromEuler(new Eul(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ')),
      new V3(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1));
    m.premultiply(this.xf);
    const nm = this._nm.getNormalMatrix(m);
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    const isFn = typeof color === 'function';
    let base = null;
    if (!isFn) {
      base = toColor(color).clone();
      const j = 1 + (R() - 0.5) * 2 * this.jit; base.multiplyScalar(j);
    }
    const v = this._v;
    for (let k = 0; k < P.count; k++) {
      v.fromBufferAttribute(P, k).applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
      const x = v.x, y = v.y, z = v.z;
      v.fromBufferAttribute(N, k).applyMatrix3(nm).normalize();
      this.n.push(v.x, v.y, v.z);
      const c = isFn ? color(x, y, z) : base;
      this.c.push(c.r, c.g, c.b);
      if (U) this.u.push(U.getX(k), U.getY(k)); else this.u.push(0, 0);
      if (sway) { const sw = sway(x, y, z); this.s.push(sw[0], sw[1]); this.swayOn = true; } else this.s.push(0, 0);
    }
    if (geo.index) { for (let k = 0; k < geo.index.count; k++) this.i.push(geo.index.getX(k) + this.cnt); }
    else { for (let k = 0; k < P.count; k++) this.i.push(k + this.cnt); }
    this.cnt += P.count;
    return this;
  }
  box(w, h, d, pos, color, rot, sway) { return this.add(cached(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), pos, rot, null, color, sway); }
  cyl(rt, rb, h, seg, pos, color, rot, open, sway) { return this.add(cached(`c${rt},${rb},${h},${seg},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!open)), pos, rot, null, color, sway); }
  sph(r, pos, color, scale, ws = 14, hs = 10, sway) { return this.add(cached(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)), pos, null, scale, color, sway); }
  cone(r, h, seg, pos, color, rot) { return this.add(cached(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), pos, rot, null, color); }
  tor(Rr, r, pos, color, rot, seg = 18, tseg = 8, arc = TAU) { return this.add(cached(`t${Rr},${r},${seg},${tseg},${arc}`, () => new THREE.TorusGeometry(Rr, r, tseg, seg, arc)), pos, rot, null, color); }
  plane(w, h, pos, color, rot, sway) { return this.add(cached(`p${w},${h}`, () => new THREE.PlaneGeometry(w, h)), pos, rot, null, color, sway); }
  geo(g, pos, color, rot, scale, sway) { return this.add(g, pos, rot, scale, color, sway); }
  // 沿 x 轴放置的圆柱 / 沿 z 轴放置的圆柱 的便捷封装
  cylX(rt, rb, len, seg, pos, color, open) { return this.cyl(rt, rb, len, seg, pos, color, [0, 0, Math.PI / 2], open); }
  cylZ(rt, rb, len, seg, pos, color, open) { return this.cyl(rt, rb, len, seg, pos, color, [Math.PI / 2, 0, 0], open); }
  // 两点之间的圆柱杆
  rod(a, b, r, color, seg = 6) {
    const A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]);
    const mid = A.clone().add(B).multiplyScalar(0.5), dir = B.clone().sub(A), len = dir.length();
    const q = new Q4().setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
    const e = new Eul().setFromQuaternion(q, 'YXZ');
    return this.cyl(r, r, len, seg, [mid.x, mid.y, mid.z], color, [e.x, e.y, e.z]);
  }
  // 两点之间的锥形杆：a 端半径 r0，b 端半径 r1
  taper(a, b, r0, r1, color, seg = 8) {
    const A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]);
    const mid = A.clone().add(B).multiplyScalar(0.5), dir = B.clone().sub(A), len = dir.length();
    const q = new Q4().setFromUnitVectors(new V3(0, 1, 0), dir.normalize());
    const e = new Eul().setFromQuaternion(q, 'YXZ');
    return this.cyl(r1, r0, len, seg, [mid.x, mid.y, mid.z], color, [e.x, e.y, e.z]);
  }
  // 两点之间的长方杆（截面 w×h）
  beam(a, b, w, h, color) {
    const A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]);
    const mid = A.clone().add(B).multiplyScalar(0.5), dir = B.clone().sub(A), len = dir.length();
    const q = new Q4().setFromUnitVectors(new V3(0, 0, 1), dir.normalize());
    const e = new Eul().setFromQuaternion(q, 'YXZ');
    return this.box(w, h, len, [mid.x, mid.y, mid.z], color, [e.x, e.y, e.z]);
  }
  build() {
    for (let k = 0; k < this.p.length; k++) if (!isFinite(this.p[k])) { console.error('NaN in Parts at vertex', (k / 3) | 0, new Error().stack); break; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.swayOn) g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 2));
    g.setIndex(this.cnt > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/* ---------- 画布纹理 ---------- */
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(c, opt = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opt.repeat[0], opt.repeat[1]); }
  if (opt.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  t.needsUpdate = true;
  return t;
}
const FONT_CJK = '"Yu Gothic","Meiryo","Microsoft YaHei","Noto Sans CJK SC","SimHei",sans-serif';
const FONT_HAND = '"Ink Free","Segoe Print","KaiTi","STKaiti","Microsoft YaHei",cursive';

/* 局部网格辅助 */
function mesh(geo, mat, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast !== false; m.receiveShadow = opts.recv !== false;
  if (opts.layer) { m.layers.set(opts.layer); }
  if (opts.name) m.name = opts.name;
  return m;
}
const LAYER = { WORLD: 0, GLASS: 1, WATER: 2, FX: 3, SKY: 4 };
