/* =====================================================================
   util.js — 数学 / 几何 / 合并 基础库
   太阳雨中的小渔港堤岸
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = (window.TY = window.TY || {});
  TY.THREE = THREE;

  /* ---------------- math ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- geometry helpers ---------------- */
  const toNonIndexed = (g) => (g.index ? g.toNonIndexed() : g);

  function ensureUV(g) {
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    return g;
  }
  function ensureNormal(g) {
    if (!g.attributes.normal) g.computeVertexNormals();
    return g;
  }

  /* 把 UV 改成世界坐标投影，保证所有几何体纹理密度一致 */
  function triplanarUV(g, scale = 0.3, offsetU = 0, offsetV = 0) {
    ensureNormal(g); ensureUV(g);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
      let u, v;
      if (ny >= nx && ny >= nz) { u = x; v = z; }
      else if (nx >= nz) { u = z; v = y; }
      else { u = x; v = y; }
      uv[i * 2] = u * scale + offsetU;
      uv[i * 2 + 1] = v * scale + offsetV;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  /* 合并若干 geometry（position/normal/uv），保持世界尺度 */
  function mergeGeos(list) {
    const gs = [];
    for (const g of list) { ensureUV(g); ensureNormal(g); gs.push(toNonIndexed(g)); }
    let total = 0;
    for (const g of gs) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nor = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    let o = 0;
    for (const g of gs) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      uv.set(g.attributes.uv.array, o * 2);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  }

  /* 计算平滑法线写入 smoothNormal 属性（用于倒挂描边） */
  function smoothNormals(g) {
    const gg = toNonIndexed(g);
    ensureNormal(gg);
    const pos = gg.attributes.position.array;
    const nor = gg.attributes.normal.array;
    const n = pos.length / 3;
    const map = new Map();
    const key = (x, y, z) =>
      ((Math.round(x * 64) + 4096) * 8192 + (Math.round(y * 64) + 4096)) * 8192 + (Math.round(z * 64) + 4096);
    for (let i = 0; i < n; i++) {
      const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      let v = map.get(k);
      if (!v) { v = [0, 0, 0]; map.set(k, v); }
      v[0] += nor[i * 3]; v[1] += nor[i * 3 + 1]; v[2] += nor[i * 3 + 2];
    }
    const sn = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const v = map.get(k);
      let x = v[0], y = v[1], z = v[2];
      const l = Math.hypot(x, y, z) || 1;
      sn[i * 3] = x / l; sn[i * 3 + 1] = y / l; sn[i * 3 + 2] = z / l;
    }
    gg.setAttribute('smoothNormal', new THREE.BufferAttribute(sn, 3));
    return gg;
  }

  /* ---------------- geometry factory ---------------- */
  const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    cyl: (rt, rb, h, seg = 12, hs = 1, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, hs, open),
    sph: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
    cone: (r, h, seg = 12) => new THREE.ConeGeometry(r, h, seg),
    tor: (r, t, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
    plane: (w, h, ws = 1, hs = 1) => new THREE.PlaneGeometry(w, h, ws, hs),
    circle: (r, s = 20) => new THREE.CircleGeometry(r, s),
    ring: (ri, ro, s = 24) => new THREE.RingGeometry(ri, ro, s),
    /* 圆角盒 */
    roundBox: (w, h, d, r = 0.05, seg = 2) => {
      const shape = new THREE.Shape();
      const hw = w / 2 - r, hd = d / 2 - r;
      shape.moveTo(-hw, -d / 2);
      shape.lineTo(hw, -d / 2);
      shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -hd);
      shape.lineTo(w / 2, hd);
      shape.quadraticCurveTo(w / 2, d / 2, hw, d / 2);
      shape.lineTo(-hw, d / 2);
      shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, hd);
      shape.lineTo(-w / 2, -hd);
      shape.quadraticCurveTo(-w / 2, -d / 2, -hw, -d / 2);
      const bev = Math.min(r * 0.8, h * 0.24);
      const g = new THREE.ExtrudeGeometry(shape, {
        depth: h - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
        bevelSegments: seg, curveSegments: seg + 1, steps: 1,
      });
      g.translate(0, 0, -(h - bev * 2) / 2);
      g.rotateX(-Math.PI / 2);
      g.computeVertexNormals();
      return g;
    },
    /* 简易挤出：由 2D 点列沿 +Z 挤出 */
    extrude: (pts, depth, bevel = 0) => {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.closePath();
      return new THREE.ExtrudeGeometry(s, {
        depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
      });
    },
    lathe: (pts, seg = 16) => new THREE.LatheGeometry(pts, seg),
  };

  /* ---------------- transform helper ---------------- */
  const T = {
    m: (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
      return m;
    },
    at: (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z),
    rot: (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
  };

  /* ---------------- Builder：按材质合并几何体 ---------------- */
  function Builder() {
    this.groups = new Map();
  }
  Builder.prototype.add = function (geo, mat, mtx, uvScale) {
    const g = geo.clone();
    if (mtx) g.applyMatrix4(mtx);
    ensureNormal(g);
    triplanarUV(g, uvScale === undefined ? 0.32 : uvScale);
    const key = mat.uuid;
    let grp = this.groups.get(key);
    if (!grp) { grp = { mat: mat, list: [] }; this.groups.set(key, grp); }
    grp.list.push(g);
    return this;
  };
  /* 常用快捷方式：位置+旋转 */
  Builder.prototype.put = function (geo, mat, x, y, z, ry, uvScale) {
    return this.add(geo, mat, T.m(x, y, z, 0, ry || 0, 0), uvScale);
  };
  Builder.prototype.build = function (parent, opts) {
    opts = opts || {};
    const out = [];
    for (const grp of this.groups.values()) {
      const merged = mergeGeos(grp.list);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, grp.mat);
      mesh.castShadow = opts.castShadow !== false;
      mesh.receiveShadow = opts.receiveShadow !== false;
      if (opts.outline !== false) TY.outline.attach(mesh, opts.outlineWidth || 1);
      parent.add(mesh);
      out.push(mesh);
    }
    this.groups.clear();
    return out;
  };

  /* ---------------- misc ---------------- */
  function disposeObject(o) {
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => m.dispose());
      }
    });
  }

  TY.util = {
    clamp, lerp, smoothstep, easeInOut, easeOut, easeIn, easeOutBack, TAU, DEG,
    mulberry32, G, T, Builder, triplanarUV, mergeGeos, smoothNormals, toNonIndexed,
    ensureUV, ensureNormal, disposeObject,
  };
})();
