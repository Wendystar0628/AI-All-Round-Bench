/* geometry helpers: painted primitives, merging, builder */
(function () {
  'use strict';
  var H = window.H;
  var G = H.G = {};
  var _c = new THREE.Color();
  var colCache = {};

  G.col = function (hex) {
    var c = colCache[hex];
    if (!c) { c = new THREE.Color(hex); colCache[hex] = c; }
    return c;
  };
  // hsl jitter of a hex colour -> hex
  G.jit = function (hex, amt, rnd) {
    rnd = rnd || H.brand; amt = amt === undefined ? 0.04 : amt;
    _c.setHex(hex, THREE.SRGBColorSpace);
    var hsl = {}; _c.getHSL(hsl, THREE.SRGBColorSpace);
    hsl.l = H.clamp(hsl.l + (rnd() - 0.5) * 2 * amt, 0, 1);
    hsl.s = H.clamp(hsl.s + (rnd() - 0.5) * amt, 0, 1);
    hsl.h = (hsl.h + (rnd() - 0.5) * amt * 0.25 + 1) % 1;
    _c.setHSL(hsl.h, hsl.s, hsl.l, THREE.SRGBColorSpace);
    return _c.getHex(THREE.SRGBColorSpace);
  };
  G.mix = function (a, b, t) {
    var ca = new THREE.Color(a), cb = new THREE.Color(b);
    // mix in sRGB space for predictable results
    var r = new THREE.Color();
    var A = {}, B = {};
    ca.getRGB(A, THREE.SRGBColorSpace); cb.getRGB(B, THREE.SRGBColorSpace);
    r.setRGB(A.r + (B.r - A.r) * t, A.g + (B.g - A.g) * t, A.b + (B.b - A.b) * t, THREE.SRGBColorSpace);
    return r.getHex(THREE.SRGBColorSpace);
  };

  function count(g) { return g.attributes.position.count; }

  G.paint = function (g, hex) {
    var n = count(g), a = new Float32Array(n * 3), c = G.col(hex);
    for (var i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  // vertical gradient (bottom -> top), optional axis 'x' | 'y' | 'z'
  G.grad = function (g, hexLo, hexHi, axis) {
    axis = axis || 'y';
    var ai = axis === 'x' ? 0 : (axis === 'y' ? 1 : 2);
    var p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
    var lo = Infinity, hi = -Infinity, i, v;
    for (i = 0; i < n; i++) { v = p.array[i * 3 + ai]; if (v < lo) lo = v; if (v > hi) hi = v; }
    var c0 = G.col(hexLo), c1 = G.col(hexHi), d = (hi - lo) || 1;
    for (i = 0; i < n; i++) {
      var t = (p.array[i * 3 + ai] - lo) / d;
      a[i * 3] = c0.r + (c1.r - c0.r) * t; a[i * 3 + 1] = c0.g + (c1.g - c0.g) * t; a[i * 3 + 2] = c0.b + (c1.b - c0.b) * t;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  // per-vertex colour by function(x,y,z) -> hex
  G.paintFn = function (g, fn) {
    var p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var c = G.col(fn(p.array[i * 3], p.array[i * 3 + 1], p.array[i * 3 + 2], i));
      a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  // fx id + gloss stored in the uv channel of solid geometry
  G.fx = function (g, id, gloss) {
    var n = count(g), a = new Float32Array(n * 2);
    for (var i = 0; i < n; i++) { a[i * 2] = id; a[i * 2 + 1] = gloss || 0; }
    g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
    return g;
  };
  // sway weight: fn(x,y,z) -> weight, constant phase
  G.sway = function (g, fn, phase) {
    var p = g.attributes.position, n = p.count, a = new Float32Array(n * 2);
    for (var i = 0; i < n; i++) {
      a[i * 2] = typeof fn === 'function' ? fn(p.array[i * 3], p.array[i * 3 + 1], p.array[i * 3 + 2]) : fn;
      a[i * 2 + 1] = phase || 0;
    }
    g.setAttribute('aSway', new THREE.BufferAttribute(a, 2));
    return g;
  };

  // ------------------------------------------------------------ primitives
  G.box = function (w, h, d, hex) { return G.paint(new THREE.BoxGeometry(w, h, d), hex); };
  G.boxB = function (w, h, d, hex) { return G.paint(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), hex); };
  // box from min/max corners
  G.boxMM = function (x0, y0, z0, x1, y1, z1, hex) {
    return G.paint(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
      .translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), hex);
  };
  G.cyl = function (rt, rb, h, seg, hex, open) { return G.paint(new THREE.CylinderGeometry(rt, rb, h, seg || 12, 1, !!open), hex); };
  G.cylB = function (rt, rb, h, seg, hex, open) { return G.paint(new THREE.CylinderGeometry(rt, rb, h, seg || 12, 1, !!open).translate(0, h / 2, 0), hex); };
  G.cone = function (r, h, seg, hex) { return G.paint(new THREE.ConeGeometry(r, h, seg || 12), hex); };
  G.sph = function (r, hex, ws, hs) { return G.paint(new THREE.SphereGeometry(r, ws || 12, hs || 8), hex); };
  G.ico = function (r, detail, hex) {
    var g = new THREE.IcosahedronGeometry(r, detail || 0);
    return G.paint(g, hex);
  };
  G.torus = function (R, r, hex, rs, ts, arc) { return G.paint(new THREE.TorusGeometry(R, r, rs || 8, ts || 16, arc === undefined ? Math.PI * 2 : arc), hex); };
  G.plane = function (w, h, hex) { return G.paint(new THREE.PlaneGeometry(w, h), hex); };
  G.disc = function (r, seg, hex) { return G.paint(new THREE.CircleGeometry(r, seg || 16), hex); };
  G.lathe = function (prof, seg, hex) {
    var pts = prof.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
    return G.paint(new THREE.LatheGeometry(pts, seg || 14), hex);
  };
  function V(p) { return new THREE.Vector3(p[0], p[1], p[2]); }
  G.tube = function (pts, r, hex, radial, tubular, closed, tension) {
    var curve = new THREE.CatmullRomCurve3(pts.map(V), !!closed, 'catmullrom', tension === undefined ? 0.5 : tension);
    return G.paint(new THREE.TubeGeometry(curve, tubular || pts.length * 4, r, radial || 6, !!closed), hex);
  };
  // straight pipe between two points
  G.pipe = function (a, b, r, hex, seg, r2) {
    var va = V(a), vb = V(b), d = vb.clone().sub(va), len = d.length();
    var g = new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, len, seg || 6, 1, false);
    g.translate(0, len / 2, 0);
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.applyQuaternion(q); g.translate(va.x, va.y, va.z);
    return G.paint(g, hex);
  };
  // polyline of pipes with sphere joints
  G.pipes = function (pts, r, hex, seg) {
    var list = [];
    for (var i = 0; i < pts.length - 1; i++) list.push(G.pipe(pts[i], pts[i + 1], r, hex, seg));
    for (i = 1; i < pts.length - 1; i++) list.push(G.sph(r * 1.02, hex, seg || 6, 4).translate(pts[i][0], pts[i][1], pts[i][2]));
    return G.merge(list);
  };
  // extrude a 2D polygon (xy) along z by depth, optional bevel
  G.extrude = function (pts, depth, hex, bevel) {
    var s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    var o = bevel ? { depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1 }
      : { depth: depth, bevelEnabled: false, steps: 1 };
    return G.paint(new THREE.ExtrudeGeometry(s, o), hex);
  };
  // rounded box (rounded in xz profile? -> rounded in x/y, extruded along z, centred)
  G.rbox = function (w, h, d, r, hex, bevel) {
    var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    bevel = bevel || 0;
    var o = { depth: d - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 5 };
    var g = new THREE.ExtrudeGeometry(s, o);
    g.translate(0, 0, -(d - bevel * 2) / 2);
    return G.paint(g, hex);
  };
  // arbitrary quad a,b,c,d (ccw), flat normal
  G.quad = function (a, b, c, d, hex) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([].concat(a, b, c, a, c, d)), 3));
    g.computeVertexNormals();
    return G.paint(g, hex);
  };
  G.tri = function (a, b, c, hex) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([].concat(a, b, c)), 3));
    g.computeVertexNormals();
    return G.paint(g, hex);
  };
  // grid surface from fn(u,v)->[x,y,z], smooth normals
  G.surf = function (nu, nv, fn, hex) {
    var pos = new Float32Array((nu + 1) * (nv + 1) * 3), idx = [], k = 0, i, j;
    for (j = 0; j <= nv; j++) for (i = 0; i <= nu; i++) {
      var p = fn(i / nu, j / nv); pos[k++] = p[0]; pos[k++] = p[1]; pos[k++] = p[2];
    }
    for (j = 0; j < nv; j++) for (i = 0; i < nu; i++) {
      var a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return G.paint(g, hex);
  };
  // twisted 3-strand rope along a polyline
  G.rope = function (pts, r, hex, tubular, twist) {
    var curve = new THREE.CatmullRomCurve3(pts.map(V), false, 'catmullrom', 0.5);
    var segs = tubular || Math.max(8, pts.length * 5), rad = 6;
    var fr = curve.computeFrenetFrames(segs, false);
    var pos = [], idx = [], i, j, P = new THREE.Vector3();
    twist = twist === undefined ? 5.0 : twist;
    var len = curve.getLength();
    for (i = 0; i <= segs; i++) {
      curve.getPointAt(i / segs, P);
      var N = fr.normals[i], B = fr.binormals[i];
      for (j = 0; j < rad; j++) {
        var a = j / rad * Math.PI * 2 + i / segs * len * twist;
        var rr = r * (j % 2 === 0 ? 1.0 : 0.72);
        var cx = Math.cos(a) * rr, sy = Math.sin(a) * rr;
        pos.push(P.x + cx * N.x + sy * B.x, P.y + cx * N.y + sy * B.y, P.z + cx * N.z + sy * B.z);
      }
    }
    for (i = 0; i < segs; i++) for (j = 0; j < rad; j++) {
      var a0 = i * rad + j, a1 = i * rad + (j + 1) % rad, b0 = a0 + rad, b1 = a1 + rad;
      idx.push(a0, a1, b0, a1, b1, b0);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx); g.computeVertexNormals();
    return G.paint(g, hex);
  };
  // catenary-ish sagging polyline between two points
  G.sagPts = function (a, b, sag, n) {
    var pts = [];
    n = n || 8;
    for (var i = 0; i <= n; i++) {
      var t = i / n, s = 4 * t * (1 - t);
      pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * s, a[2] + (b[2] - a[2]) * t]);
    }
    return pts;
  };

  // ------------------------------------------------------------ transforms
  var _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  G.m4 = function (px, py, pz, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _p.set(px || 0, py || 0, pz || 0);
    if (sx === undefined) sx = 1; if (sy === undefined) sy = sx; if (sz === undefined) sz = sx;
    _s.set(sx, sy, sz);
    return new THREE.Matrix4().compose(_p, _q, _s);
  };
  // place geometry: translate + rotate (YXZ order) + optional scale; returns g
  G.at = function (g, px, py, pz, rx, ry, rz, s) {
    return g.applyMatrix4(G.m4(px, py, pz, rx, ry, rz, s));
  };

  // ------------------------------------------------------------ merge
  function ensure(g) {
    var n = count(g), a, i;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) G.paint(g, 0xffffff);
    if (!g.attributes.uv || g._rawUV) {
      if (!g._keepUV) { a = new Float32Array(n * 2); g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); }
    }
    if (!g.attributes.aSway) g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    return g;
  }
  // primitives created by three carry real uvs; solid materials use uv as (fx, gloss) so reset them
  // unless G.fx() was called (flag) or geometry is meant for textured materials (keepUV)
  var _origSet = null;
  G.keepUV = function (g) { g._keepUV = true; return g; };
  var _fx = G.fx;
  G.fx = function (g, id, gloss) { _fx(g, id, gloss); g._keepUV = true; return g; };

  G.merge = function (list) {
    var total = 0, totalIdx = 0, i, g;
    var out = [];
    for (i = 0; i < list.length; i++) { g = list[i]; if (!g) continue; out.push(g); }
    list = out;
    var keep = false;
    for (i = 0; i < list.length; i++) {
      g = list[i];
      if (!g._keepUV) { g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count(g) * 2), 2)); g._keepUV = true; }
      ensure(g);
      total += count(g); totalIdx += g.index ? g.index.count : count(g);
    }
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    var uv = new Float32Array(total * 2), sw = new Float32Array(total * 2);
    var idx = total > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
    var vo = 0, io = 0, k;
    for (i = 0; i < list.length; i++) {
      g = list[i]; var n = count(g);
      pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
      nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
      col.set(g.attributes.color.array.subarray(0, n * 3), vo * 3);
      uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
      sw.set(g.attributes.aSway.array.subarray(0, n * 2), vo * 2);
      if (g.index) { var ia = g.index.array; for (k = 0; k < ia.length; k++) idx[io++] = ia[k] + vo; }
      else { for (k = 0; k < n; k++) idx[io++] = vo + k; }
      vo += n;
    }
    var m = new THREE.BufferGeometry();
    m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    m.setAttribute('color', new THREE.BufferAttribute(col, 3));
    m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    m.setAttribute('aSway', new THREE.BufferAttribute(sw, 2));
    m.setIndex(new THREE.BufferAttribute(idx, 1));
    m._keepUV = true;
    for (i = 0; i < list.length; i++) list[i].dispose();
    return m;
  };

  // ------------------------------------------------------------ builder
  // collects geometry per material bucket, optional transform stack, builds merged meshes
  function Builder() { this.b = {}; this.stack = []; this.cur = null; }
  Builder.prototype.add = function (g, key) {
    if (!g) return g;
    key = key || 'solid';
    if (this.cur) g.applyMatrix4(this.cur);
    (this.b[key] || (this.b[key] = [])).push(g);
    return g;
  };
  Builder.prototype.push = function (m) {
    this.stack.push(this.cur);
    this.cur = this.cur ? this.cur.clone().multiply(m) : m.clone();
    return this;
  };
  Builder.prototype.pop = function () { this.cur = this.stack.pop() || null; return this; };
  Builder.prototype.group = function (px, py, pz, rx, ry, rz, s, fn) {
    this.push(G.m4(px, py, pz, rx, ry, rz, s)); fn(this); this.pop(); return this;
  };
  Builder.prototype.build = function (parent, opts) {
    opts = opts || {};
    var res = {};
    for (var key in this.b) {
      var list = this.b[key]; if (!list.length) continue;
      var def = H.M[key];
      if (!def) { console.error('unknown material bucket', key); continue; }
      var geom = G.merge(list);
      var mesh = new THREE.Mesh(geom, def.mat);
      mesh.castShadow = opts.cast !== undefined ? opts.cast : def.cast;
      mesh.receiveShadow = opts.receive !== undefined ? opts.receive : def.receive;
      if (def.layer) mesh.layers.set(def.layer);
      if (def.order) mesh.renderOrder = def.order;
      if (opts.noCull) mesh.frustumCulled = false;
      mesh.name = (opts.name || 'part') + ':' + key;
      parent.add(mesh); res[key] = mesh;
    }
    this.b = {};
    return res;
  };
  H.Builder = Builder;
})();
