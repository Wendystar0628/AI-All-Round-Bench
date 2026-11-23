/* 特效：粒子、冲击环、光束、闪电、路线带 */
(function (G) {
'use strict';
var T = window.THREE, gfx = G.gfx;
var fx = G.fx = {};
var MAXP = 5000, pPos, pCol, pSize, pAlpha, pVel, pLife, pMax, pGrav, pDrag, pGrow, geo, points, cnt = 0, scene;
fx.init = function (sc) {
  scene = sc; cnt = 0;
  pPos = new Float32Array(MAXP * 3); pCol = new Float32Array(MAXP * 3); pSize = new Float32Array(MAXP); pAlpha = new Float32Array(MAXP);
  pVel = new Float32Array(MAXP * 3); pLife = new Float32Array(MAXP); pMax = new Float32Array(MAXP); pGrav = new Float32Array(MAXP); pDrag = new Float32Array(MAXP); pGrow = new Float32Array(MAXP);
  geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pPos, 3)); geo.setAttribute('color', new T.BufferAttribute(pCol, 3));
  geo.setAttribute('size', new T.BufferAttribute(pSize, 1)); geo.setAttribute('alpha', new T.BufferAttribute(pAlpha, 1));
  geo.setDrawRange(0, 0);
  var mat = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    vertexShader: 'attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = size*(300./-mv.z); }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 c = gl_PointCoord-0.5; float d = length(c)*2.; float a = smoothstep(1.,0.0,d); a = a*a; gl_FragColor = vec4(vC, a*vA); }' });
  points = new T.Points(geo, mat); points.frustumCulled = false; sc.add(points);
  fx.rings = []; fx.beams = []; fx.bolts = [];
  ringPool.length = 0; beamPool.length = 0; boltPool.length = 0;
};
var _c = new T.Color();
fx.spawn = function (x, y, z, vx, vy, vz, color, size, life, o) {
  if (cnt >= MAXP) return; o = o || {};
  var i = cnt++, k = (o.k == null ? 1.35 : o.k);
  _c.set(color);
  pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz;
  pCol[i * 3] = _c.r * k; pCol[i * 3 + 1] = _c.g * k; pCol[i * 3 + 2] = _c.b * k;
  pSize[i] = size; pAlpha[i] = 1; pLife[i] = life; pMax[i] = life; pGrav[i] = o.g || 0; pDrag[i] = o.d == null ? 1.5 : o.d; pGrow[i] = o.grow || 0;
};
fx.burst = function (x, y, z, color, n, speed, life, size, o) {
  o = o || {};
  for (var i = 0; i < n; i++) {
    var a = G.rand() * Math.PI * 2, e = o.flat ? (G.rand() - 0.3) * 0.5 : (G.rand() - 0.3) * 1.6, s = speed * (0.4 + G.rand() * 0.8);
    fx.spawn(x, y, z, Math.cos(a) * s * (o.flat ? 1 : Math.cos(e)), (o.up != null ? o.up : Math.sin(e)) * s + (o.lift || 0), Math.sin(a) * s * (o.flat ? 1 : Math.cos(e)), color, size * (0.6 + G.rand() * 0.8), life * (0.6 + G.rand() * 0.7), o);
  }
};
fx.stream = function (x0, y0, z0, x1, y1, z1, color, n, size, life) {
  for (var i = 0; i < n; i++) { var t = G.rand(); fx.spawn(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, (G.rand() - 0.5) * 0.4, 0.2 + G.rand() * 0.5, (G.rand() - 0.5) * 0.4, color, size, life, { d: 1 }); }
};
fx.update = function (dt) {
  var i = 0;
  while (i < cnt) {
    pLife[i] -= dt;
    if (pLife[i] <= 0) { // swap with last
      var l = --cnt; if (i !== l) { for (var c = 0; c < 3; c++) { pPos[i * 3 + c] = pPos[l * 3 + c]; pVel[i * 3 + c] = pVel[l * 3 + c]; pCol[i * 3 + c] = pCol[l * 3 + c]; } pSize[i] = pSize[l]; pAlpha[i] = pAlpha[l]; pLife[i] = pLife[l]; pMax[i] = pMax[l]; pGrav[i] = pGrav[l]; pDrag[i] = pDrag[l]; pGrow[i] = pGrow[l]; }
      continue;
    }
    var dr = Math.max(0, 1 - pDrag[i] * dt);
    pVel[i * 3] *= dr; pVel[i * 3 + 1] = pVel[i * 3 + 1] * dr - pGrav[i] * dt; pVel[i * 3 + 2] *= dr;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    var u = pLife[i] / pMax[i]; pAlpha[i] = Math.min(1, u * 2.2); pSize[i] += pGrow[i] * dt;
    i++;
  }
  geo.setDrawRange(0, cnt);
  geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.alpha.needsUpdate = true;
  // 冲击环
  for (var r = fx.rings.length - 1; r >= 0; r--) {
    var o = fx.rings[r]; o.t += dt; var p = o.t / o.dur;
    if (p >= 1) { o.mesh.visible = false; ringPool.push(o.mesh); fx.rings.splice(r, 1); continue; }
    var e = o.ease ? 1 - Math.pow(1 - p, 2.2) : p; var rad = o.r0 + (o.r1 - o.r0) * e;
    o.mesh.scale.setScalar(rad); o.mesh.material.opacity = (1 - p) * o.a;
  }
  for (var b = fx.beams.length - 1; b >= 0; b--) {
    var bo = fx.beams[b]; bo.t += dt; var bp = bo.t / bo.dur;
    if (bp >= 1) { bo.mesh.visible = false; beamPool.push(bo.mesh); fx.beams.splice(b, 1); continue; }
    bo.mesh.material.opacity = (1 - bp) * bo.a; bo.mesh.scale.x = bo.w * (1 - bp * 0.6); bo.mesh.scale.y = bo.w * (1 - bp * 0.6);
  }
  for (var q = fx.bolts.length - 1; q >= 0; q--) {
    var bt = fx.bolts[q]; bt.t += dt; var qp = bt.t / bt.dur;
    if (qp >= 1) { bt.line.visible = false; boltPool.push(bt.line); fx.bolts.splice(q, 1); continue; }
    bt.line.material.opacity = (1 - qp) * 0.95;
    if (bt.jit && ((bt.t * 30) | 0) !== bt.last) { bt.last = (bt.t * 30) | 0; fillBolt(bt.line, bt.a, bt.b, bt.jit); }
  }
};
var ringPool = [], beamPool = [], boltPool = [];
fx.ring = function (x, y, z, r0, r1, dur, color, a, ease) {
  var m = ringPool.pop();
  if (!m) { m = new T.Mesh(gfx.ring(0.92, 1.0, 48), new T.MeshBasicMaterial({ transparent: true, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); }
  m.visible = true; m.position.set(x, y, z); m.material.color.set(color).multiplyScalar(1.5); m.material.opacity = a == null ? 0.9 : a;
  fx.rings.push({ mesh: m, t: 0, dur: dur, r0: r0, r1: r1, a: a == null ? 0.9 : a, ease: ease !== false });
};
var _v = new T.Vector3(), _u = new T.Vector3(), _q = new T.Quaternion();
fx.beam = function (x0, y0, z0, x1, y1, z1, color, w, dur, a) {
  var m = beamPool.pop();
  if (!m) { var g = new T.CylinderGeometry(0.5, 0.5, 1, 6, 1, true); g.rotateX(Math.PI / 2); m = new T.Mesh(g, new T.MeshBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false })); scene.add(m); }
  m.visible = true; m.material.color.set(color).multiplyScalar(1.8);
  _v.set(x0, y0, z0); _u.set(x1, y1, z1); var len = _v.distanceTo(_u);
  m.position.copy(_v).add(_u).multiplyScalar(0.5); m.lookAt(_u); m.scale.set(w, w, len);
  fx.beams.push({ mesh: m, t: 0, dur: dur, w: w, a: a == null ? 0.9 : a });
};
function fillBolt(line, a, b, jit) {
  var n = 9, arr = line.geometry.attributes.position.array, dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  for (var i = 0; i < n; i++) {
    var t = i / (n - 1), j = (i === 0 || i === n - 1) ? 0 : jit;
    arr[i * 3] = a[0] + dx * t + (G.rand() - 0.5) * j; arr[i * 3 + 1] = a[1] + dy * t + (G.rand() - 0.5) * j; arr[i * 3 + 2] = a[2] + dz * t + (G.rand() - 0.5) * j;
  }
  line.geometry.attributes.position.needsUpdate = true;
}
fx.bolt = function (a, b, color, dur, jit) {
  var l = boltPool.pop();
  if (!l) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(9 * 3), 3)); l = new T.Line(g, new T.LineBasicMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false })); l.frustumCulled = false; scene.add(l); }
  l.visible = true; l.material.color.set(color).multiplyScalar(2.5); fillBolt(l, a, b, jit || 0.2);
  fx.bolts.push({ line: l, t: 0, dur: dur, a: a, b: b, jit: jit || 0.2, last: -1 });
};

// ---------- 路线带 ----------
function offsetPoly(pts, d) {
  var n = pts.length, out = [];
  for (var i = 0; i < n; i++) {
    var p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    var d1x = p[0] - a[0], d1z = p[1] - a[1], d2x = b[0] - p[0], d2z = b[1] - p[1];
    var l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    var n1x = l1 ? -d1z / l1 : 0, n1z = l1 ? d1x / l1 : 0, n2x = l2 ? -d2z / l2 : n1x, n2z = l2 ? d2x / l2 : n1z;
    if (!l1) { n1x = n2x; n1z = n2z; }
    var mx = n1x + n2x, mz = n1z + n2z, ml = Math.hypot(mx, mz);
    if (ml < 1e-4) { mx = n1x; mz = n1z; ml = 1; }
    mx /= ml; mz /= ml; var cos = mx * n1x + mz * n1z; var s = d / Math.max(0.5, cos);
    out.push([p[0] + mx * s, p[1] + mz * s]);
  }
  return out;
}
fx.makeRibbon = function (tileXY, off, width, y) {
  var c = tileXY, L = offsetPoly(c, off - width / 2), R = offsetPoly(c, off + width / 2);
  var pos = [], uv = [], idx = [], acc = 0;
  for (var i = 0; i < c.length; i++) {
    if (i > 0) acc += Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
    pos.push(L[i][0], y, L[i][1], R[i][0], y, R[i][1]); uv.push(acc, -1, acc, 1);
    if (i > 0) { var k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
};
fx.ribbonMat = function (color, style) {
  return new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uTime: { value: 0 }, uColor: { value: new T.Color(color) }, uAlpha: { value: 1 }, uStyle: { value: style || 0 }, uBoost: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; uniform float uTime,uAlpha,uStyle,uBoost; uniform vec3 uColor;\nvoid main(){ float v = abs(vUv.y); float edge = smoothstep(1.0,0.55,v); float a;\n if (uStyle < 0.5) { float x = fract(vUv.x*1.7 - uTime*0.85 - v*0.42); a = smoothstep(0.0,0.1,x)*smoothstep(0.55,0.35,x); a = 0.22 + 0.78*a; }\n else if (uStyle < 1.5) { float x = fract(vUv.x*2.4 - uTime*1.4); a = step(0.5,x)*0.9 + 0.1; }\n else { float x = fract(vUv.x*1.7 - uTime*0.85 - v*0.42); a = 0.4 + 0.6*smoothstep(0.55,0.2,x); }\n float pulse = 1.0 + uBoost*(0.6+0.4*sin(uTime*9.0 - vUv.x*3.0));\n gl_FragColor = vec4(uColor*(1.3+a*1.5)*pulse, a*edge*uAlpha); }' });
};
})(window.G = window.G || {});
