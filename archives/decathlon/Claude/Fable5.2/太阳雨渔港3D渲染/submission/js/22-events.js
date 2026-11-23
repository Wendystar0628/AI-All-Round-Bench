/* dynamics + director: boats, hawsers, buoys, wake, the trip to sea, gusts, cloud shadow, rain, rainbow, lighthouse, far boat */
(function () {
  'use strict';
  var H = window.H, G = H.G, C = H.C, L = H.L, U = H.U;
  var QY = L.QUAY_Y, HALF = L.HALF;
  var V3 = THREE.Vector3;
  var _a = new V3(), _b = new V3(), _c = new V3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new V3(), _e = new THREE.Euler();

  // ------------------------------------------------------------------ path of the boat that puts to sea
  var PATH = [[-2.9, 10.3], [-5.6, 9.7], [-9.5, 8.0], [-13.6, 4.4], [-16.9, -1.5], [-17.7, -8.0], [-17.4, -13.6], [-15.4, -18.3], [-11.3, -20.5], [-5.0, -20.7], [1.5, -20.5],
    [5.5, -21.3], [7.3, -23.4], [5.3, -25.3], [0.5, -25.6], [-7.0, -25.4], [-14.0, -24.6], [-20.0, -22.0], [-23.6, -16.5], [-24.2, -9.0], [-22.6, -2.4], [-18.6, 0.9],
    [-12.0, 1.6], [-4.0, 1.0], [3.2, 0.9], [6.5, 2.1], [7.3, 4.4], [5.7, 6.3], [2.2, 7.5], [-0.8, 9.3], [-2.9, 10.3]];
  var pathLUT = [], pathLen = 0;
  (function () {
    var pts = PATH.map(function (p) { return new V3(p[0], 0, p[1]); });
    // extend ends so the tangent at the berth points west (boat heading)
    pts.unshift(new V3(PATH[0][0] + 3, 0, PATH[0][1])); pts.push(new V3(PATH[PATH.length - 1][0] - 3, 0, PATH[PATH.length - 1][1]));
    var curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    var N = 1400, u0 = 0, u1 = 1, i, prev = null, acc = 0, raw = [];
    for (i = 0; i <= N; i++) raw.push(curve.getPoint(i / N));
    // trim to the real end points
    var iS = 0, iE = N, dS = 1e9, dE = 1e9;
    for (i = 0; i <= N; i++) {
      var d0 = Math.hypot(raw[i].x - PATH[0][0], raw[i].z - PATH[0][1]); if (i < N / 4 && d0 < dS) { dS = d0; iS = i; }
      var d1 = Math.hypot(raw[i].x - PATH[PATH.length - 1][0], raw[i].z - PATH[PATH.length - 1][1]); if (i > N * 3 / 4 && d1 < dE) { dE = d1; iE = i; }
    }
    for (i = iS; i <= iE; i++) {
      if (prev) acc += raw[i].distanceTo(prev);
      pathLUT.push({ x: raw[i].x, z: raw[i].z, s: acc }); prev = raw[i];
    }
    pathLen = acc;
  })();
  function pathAt(s, out) {
    s = H.clamp(s, 0, pathLen);
    var lo = 0, hi = pathLUT.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (pathLUT[mid].s < s) lo = mid; else hi = mid; }
    var a = pathLUT[lo], b = pathLUT[hi], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
    out.hx = b.x - a.x; out.hz = b.z - a.z; var l = Math.hypot(out.hx, out.hz) || 1; out.hx /= l; out.hz /= l;
    return out;
  }
  H.tripPathAt = pathAt; H.tripPathLen = function () { return pathLen; };
  // cruise speed allowed at a path position (slow in the basin near the berth, faster outside)
  function pathSpeed(s) {
    var a = H.smooth(0, 9, s), b = H.smooth(0, 24, pathLen - s);
    return 0.7 + 2.7 * Math.min(a, b);
  }

  H.buildEvents = function (scene) {
    var i, boats = H.BOATS, buoys = H.BUOYS, B = H.boatById.B, far = H.FARBOAT;

    // ================================================================= wind-sock, pennants, float strings
    var EB = new H.Builder();
    var WS = { x: 9.9, z: 26.0, h: 4.6 };
    EB.add(G.fx(G.cylB(0.05, 0.075, WS.h, 8, 0xe9ece6).translate(WS.x, QY, WS.z), 0, 0.3));
    EB.add(G.fx(G.cylB(0.2, 0.26, 0.16, 10, C.conc3).translate(WS.x, QY, WS.z), 1, 0));
    for (i = 0; i < 4; i++) { var cy = QY + 0.6 + i * 1.0; EB.add(G.cylB(0.056, 0.056, 0.45, 8, i % 2 ? 0xe9ece6 : C.red).translate(WS.x, cy, WS.z)); }
    var P2 = { x: 16.6, z: 28.0, h: 4.2 };
    EB.add(G.fx(G.cylB(0.045, 0.06, P2.h, 8, 0x9a8a78).translate(P2.x, QY, P2.z), 8, 0));
    EB.add(G.fx(G.cylB(0.16, 0.2, 0.14, 8, C.conc3).translate(P2.x, QY, P2.z), 1, 0));
    // pennant line between the two poles
    var la = [WS.x, QY + WS.h - 1.3, WS.z], lb = [P2.x, QY + P2.h - 0.1, P2.z];
    var lpts = G.sagPts(la, lb, 0.5, 12);
    EB.add(G.tube(lpts, 0.01, 0xdccba0, 3, 24), 'solidNC');
    var pcol = [0xd9503f, 0xf4cb3c, 0x3f8fb6, 0xf7f8f3, 0x4fa283, 0xf08a2c, 0xd9503f, 0x3f8fb6, 0xf4cb3c, 0xf7f8f3];
    var ldir = Math.atan2(lb[0] - la[0], lb[2] - la[2]);
    for (i = 1; i < 11; i++) {
      var t = i / 11.5, s4 = 4 * t * (1 - t);
      var px = la[0] + (lb[0] - la[0]) * t, py = la[1] + (lb[1] - la[1]) * t - 0.5 * s4, pz = la[2] + (lb[2] - la[2]) * t;
      var f = new THREE.BufferGeometry();
      f.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.16, 0, 0, 0.16, 0, 0, 0, -0.2, 0, -0.16, 0, 0, 0, -0.2, 0, 0.16, 0, 0, 0, -0.42, 0, 0, -0.2, 0, 0.16, 0, 0, 0, -0.42, 0, -0.16, 0, 0, 0, -0.2, 0].slice(0, 18)), 3));
      f = new THREE.PlaneGeometry(0.32, 0.42, 2, 3);
      var pa = f.attributes.position;
      for (var k = 0; k < pa.count; k++) { var yy = pa.getY(k) - 0.21; pa.setY(k, yy); pa.setX(k, pa.getX(k) * (1 + yy / 0.44)); }
      f.computeVertexNormals();
      G.paint(f, pcol[i % pcol.length]); G.fx(f, 6, 0); G.sway(f, function (x, y) { return -y / 0.42; }, i * 1.3);
      f.rotateY(ldir + Math.PI / 2); f.translate(px, py, pz);
      EB.add(f, 'solidDS');
    }
    EB.build(scene, { name: 'windyard' });
    // wind-sock: ring chain updated on the CPU
    var sock = (function () {
      var NR = 8, NS = 10, nv = NR * NS, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = [];
      var cOr = new THREE.Color(0xf08a2c), cWh = new THREE.Color(0xf9faf5);
      for (var r = 0; r < NR; r++) for (var s = 0; s < NS; s++) {
        var c = (r % 2 === 0) ? cOr : cWh, k = (r * NS + s) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
        if (r < NR - 1) { var a = r * NS + s, b = r * NS + (s + 1) % NS, c2 = a + NS, d = b + NS; idx.push(a, c2, b, b, c2, d); }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2)); g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
      g.setIndex(idx);
      var m = new THREE.Mesh(g, H.M.solidDS.mat); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
      // swivel hoop
      var hoop = new THREE.Mesh(G.merge([G.torus(0.26, 0.014, 0x8f9da1, 4, 16).rotateY(Math.PI / 2), G.pipe([0, 0, 0], [-0.3, -0.26, 0], 0.012, 0x8f9da1, 3), G.pipe([0, 0, 0], [-0.3, 0.26, 0], 0.012, 0x8f9da1, 3)]), H.M.solid.mat);
      scene.add(hoop);
      return { NR: NR, NS: NS, pos: pos, nor: nor, geom: g, hoop: hoop, w: 0.2, yaw: 0 };
    })();
    function updateSock(t, dt) {
      var w = H.windAtCPU(WS.x, WS.z);
      sock.w += (w - sock.w) * Math.min(1, dt * 2.2);
      var wv = sock.w, top = QY + WS.h - 0.28;
      var wyaw = Math.atan2(H.WIND.x, H.WIND.z) + Math.sin(t * 0.5) * 0.28 * (1 - Math.min(1, wv)) + Math.sin(t * 2.3) * 0.05;
      sock.yaw = wyaw;
      var dx = Math.sin(wyaw), dz = Math.cos(wyaw);
      var lift = H.clamp(0.26 + wv * 0.85, 0.05, 0.98);
      var cx = WS.x + dx * 0.3, cy = top, cz = WS.z + dz * 0.3, NR = sock.NR, NS = sock.NS, seg = 0.22;
      var px = -dz, pz = dx;
      for (var r = 0; r < NR; r++) {
        var tt = r / (NR - 1);
        var kk = H.clamp(lift - tt * (1 - lift) * 0.55, 0.0, 1);
        var fl = Math.sin(t * (4 + wv * 7) - r * 0.9) * (0.02 + 0.07 * Math.min(1.3, wv)) * tt;
        var hx = dx * kk, hy = -(1 - kk) * (0.9 + tt * 0.5) + fl * 0.6, hz = dz * kk;
        var hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
        if (r > 0) { cx += hx * seg + px * fl * 0.35; cy += hy * seg; cz += hz * seg + pz * fl * 0.35; }
        // frame perpendicular to heading
        var ux = -hx * hy, uy = 1 - hy * hy, uz = -hz * hy; var ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
        var sx = uy * hz - uz * hy, sy = uz * hx - ux * hz, sz = ux * hy - uy * hx;
        var rad = 0.26 * (1 - tt * 0.6) * (0.75 + 0.25 * Math.min(1, wv * 1.4 + (1 - tt)));
        for (var s = 0; s < NS; s++) {
          var a = s / NS * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = (r * NS + s) * 3;
          var nx = ux * ca + sx * sa, ny = uy * ca + sy * sa, nz = uz * ca + sz * sa;
          sock.pos[k] = cx + nx * rad; sock.pos[k + 1] = cy + ny * rad * (0.55 + 0.45 * Math.min(1, wv * 1.6 + 0.3)); sock.pos[k + 2] = cz + nz * rad;
          sock.nor[k] = nx; sock.nor[k + 1] = ny; sock.nor[k + 2] = nz;
        }
      }
      sock.geom.attributes.position.needsUpdate = true; sock.geom.attributes.normal.needsUpdate = true;
      sock.hoop.position.set(WS.x + dx * 0.3, top, WS.z + dz * 0.3); sock.hoop.rotation.y = wyaw - Math.PI / 2;
    }
    // float strings: each swings about the line through its two posts
    var strings = [];
    H.FLOAT_STRINGS.forEach(function (d, k) {
      var a = new V3().fromArray(d.a), b = new V3().fromArray(d.b), len = a.distanceTo(b);
      var grp = new THREE.Group(); grp.position.copy(a);
      var xAxis = b.clone().sub(a).normalize();
      var qAlign = new THREE.Quaternion().setFromUnitVectors(new V3(1, 0, 0), xAxis);
      var bd = new H.Builder(), r = H.mulberry(d.seed), pts = [], cols = [0xf08a2c, 0xf4cb3c, 0xf7f8f3, 0x3f8fb6, 0xf08a2c, 0xd9503f];
      for (var j = 0; j <= 14; j++) { var t2 = j / 14; pts.push([t2 * len, -d.sag * 4 * t2 * (1 - t2), 0]); }
      bd.add(G.rope(pts, 0.022, 0xdccba0, 30, 14));
      for (j = 0; j < d.n; j++) {
        var t3 = (j + 0.6) / (d.n + 0.2), y = -d.sag * 4 * t3 * (1 - t3), rad = 0.085 + r() * 0.035;
        var fl = r() < 0.25 ? G.cyl(rad * 0.8, rad * 0.8, rad * 2.2, 8, cols[j % cols.length]).rotateZ(Math.PI / 2) : G.sph(rad, cols[Math.floor(r() * cols.length)], 8, 6);
        bd.add(G.fx(fl.translate(t3 * len, y - rad * 0.75, 0), 0, 0.55));
      }
      bd.build(grp, { name: 'floats' });
      scene.add(grp);
      var mid = a.clone().add(b).multiplyScalar(0.5);
      // sign of the downwind direction relative to the string's local +z
      var zAxis = new V3(0, 0, 1).applyQuaternion(qAlign);
      var sgn = (zAxis.x * H.WIND.x + zAxis.z * H.WIND.z) >= 0 ? 1 : -1;
      strings.push({ grp: grp, q: qAlign, mid: mid, ang: 0, vel: 0, ph: k * 2.1, sgn: sgn });
    });
    var X1 = new V3(1, 0, 0);
    function updateStrings(t, dt) {
      for (var k = 0; k < strings.length; k++) {
        var s = strings[k], w = H.windAtCPU(s.mid.x, s.mid.z);
        var target = -s.sgn * Math.min(1.1, w * 0.62) + Math.sin(t * 2.0 + s.ph) * 0.04 * (1 + w * 1.5);
        s.vel += ((target - s.ang) * 7.0 - s.vel * 1.6) * dt; s.ang += s.vel * dt;
        _q.setFromAxisAngle(X1, s.ang); s.grp.quaternion.copy(s.q).multiply(_q);
      }
    }

    // ================================================================= foam surging between the tetrapods
    var foamN = 0; H.TETRA.forEach(function (tp) { foamN += tp.n + 2; });
    var foamMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(0.93, 0.985, 0.975), toneMapped: false }), foamN);
    foamMesh.layers.set(1); foamMesh.frustumCulled = false; foamMesh.renderOrder = 14; scene.add(foamMesh);
    var foams = [], fr = H.mulberry(606);
    H.TETRA.forEach(function (tp, ti) {
      for (var k = 0; k < tp.n + 2; k++) {
        var a = fr() * 6.283, r = tp.r * (0.45 + fr() * 0.65);
        foams.push({ x: tp.x + Math.cos(a) * r, z: tp.z + Math.sin(a) * r, s: 0.3 + fr() * 0.32, ph: fr() * 6.283, w: 0.55 + fr() * 0.5, ti: ti });
      }
    });
    var tetraKick = H.TETRA.map(function () { return 0; });

    // ================================================================= lighthouse lamp + beam
    var lh = H.LIGHTHOUSE;
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xcfd8d4, toneMapped: false });
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 8), lampMat); lamp.position.set(lh.x, lh.y, lh.z); lamp.scale.set(1, 1.3, 1); scene.add(lamp);
    var beamMat = H.makeAdd({ uA: { value: 0 } }, 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      'varying vec2 vUv; uniform float uA; void main(){ float a = (1.0 - vUv.y) * uA; a = floor(a * 4.0 + 0.5) / 4.0 * 0.5 + a * 0.5; gl_FragColor = vec4(vec3(1.0, 0.95, 0.72) * a, a); }');
    var beam = new THREE.Group(); beam.position.set(lh.x, lh.y, lh.z); scene.add(beam);
    [0, Math.PI].forEach(function (ry) {
      var cg = new THREE.CylinderGeometry(1.5, 0.12, 13, 14, 1, true).translate(0, 6.5, 0).rotateZ(-Math.PI / 2 + 0.06).rotateY(ry);
      var m = new THREE.Mesh(cg, beamMat); m.layers.set(1); m.renderOrder = 33; beam.add(m);
    });
    var halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), H.makeAdd({ uA: beamMat.uniforms.uA }, 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      'varying vec3 vN; varying vec3 vV; uniform float uA; void main(){ float f = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 2.0); float a = step(0.35, f) * 0.35 + step(0.7, f) * 0.35; gl_FragColor = vec4(vec3(1.0, 0.93, 0.66) * a * uA, a * uA); }'));
    halo.position.copy(lamp.position); halo.layers.set(1); halo.renderOrder = 34; scene.add(halo);
    beam.visible = false; halo.visible = false;

    // ================================================================= far boat materials (clipped at the cut face of the base)
    var farClip = { value: new THREE.Vector2(HALF - 0.02, HALF - 0.02) };
    function farPos(u, out) { var s = H.smooth(0.5, 1.0, u); out.x = -37.5 + 46 * u; out.z = -30.8 - 7.6 * Math.pow(s, 1.5); return out; }
    function farMat(params, defs) {
      return H.makeToon(params, { defines: defs, key: 'far', uniforms: { uFarClip: farClip }, fragPars: '\nuniform vec2 uFarClip;\n', fragAlbedo: '\nif (abs(vWPos.x) > uFarClip.x || abs(vWPos.z) > uFarClip.y) discard;\n' });
    }
    var fm = { solid: farMat({}, { FX_UV: 1 }), solidDS: farMat({ side: THREE.DoubleSide }, { FX_UV: 1 }), atlas: farMat({ map: H.Atlas.tex, alphaTest: 0.35, side: THREE.DoubleSide }, {}) };
    fm.solidNC = fm.solid;
    for (var key in far.meshes) { if (fm[key]) far.meshes[key].material = fm[key]; else far.meshes[key].visible = false; }

    // ================================================================= state
    var S = H.ev = {};
    var rng = H.mulberry(7);
    var wake = [];         // trail samples {x,z,hx,hz,t,sp,w}
    var trip, farS, gust, cloud, dark, ease, rainPh, queue, active, nextAt, lastKind, script, mode;
    var tmpP = {};

    function resetAll(m) {
      mode = m;
      rng = H.mulberry(m === 'tour' ? 99173 : ((Date.now() >>> 3) & 0xfffff) + 5);
      wake.length = 0;
      trip = { state: 'moored', s: 0, v: 0, t: 0, lastSample: 0 };
      farS = { on: false, u: 0, x: -40, z: -30.8, hx: 1, hz: 0, t: 0, lastSample: 0, dir: 1 };
      gust = { on: false, front: -1000, strength: 0, t: 0 };
      cloud = { on: false, lead: -999, trail: -1000, speed: 5.5, pass: 0 };
      dark = { on: false, t: 0, v: 0 };
      ease = { on: false, t: 0, k: 0 };
      rainPh = [rng() * 6.28, rng() * 6.28];
      active = null; lastKind = ''; nextAt = 5 + rng() * 4;
      script = null;
      if (m === 'tour') {
        script = [{ t: 0.0, kind: 'cloud', lead: -16, width: 34, speed: 9.5 }, { t: 9.0, kind: 'far' }, { t: 19.6, kind: 'gust' }, { t: 45.0, kind: 'ease' }, { t: 49.5, kind: 'trip' }];
        rainPh = [0.9, 2.0];
      }
      H.state.rain = 0.55; H.state.rainbow = 0; H.state.dark = 0; H.state.lighthouse = 0; H.state.sunVis = 1;
      H.windState.front = -1000; H.windState.strength = 0;
      H.cloudState.lead = -999; H.cloudState.trail = -1000; H.cloudState.sunK = 1;
      boats.forEach(function (b, k) {
        b.x = b.berth.x; b.z = b.berth.z; b.ry = b.berth.ry; b.moored = true; b.kick = 0; b.kickV = 0; b.drift = 0; b.driftV = 0; b.bump = 0; b.turn = 0;
        b.lines.forEach(function (ln) { ln.cast = 0; ln.rope.mesh.visible = true; });
        if (b.shafts) b.shafts.visible = true;
        b.group.position.set(b.x, 0, b.z); b.group.rotation.y = b.ry; b.inner.rotation.set(0, 0, 0); b.inner.position.y = 0;
        b.group.updateMatrixWorld(true);
      });
      buoys.forEach(function (bu) { bu.kick = 0; bu.kickV = 0; });
      far.group.visible = false;
      for (var k = 0; k < tetraKick.length; k++) tetraKick[k] = 0;
      sock.w = 0.2; strings.forEach(function (s) { s.ang = 0; s.vel = 0; });
      beam.visible = false; halo.visible = false; lampMat.color.setHex(0xcfd8d4);
    }

    // ----------------------------------------------------------------- events
    function start(kind, o) {
      o = o || {};
      if (kind === 'gust') { gust.on = true; gust.front = -62; gust.t = 0; gust.strength = 0; gust.peak = o.peak || (0.95 + rng() * 0.25); }
      else if (kind === 'cloud') { cloud.on = true; cloud.width = o.width || (46 + rng() * 22); cloud.lead = o.lead !== undefined ? o.lead : -58; cloud.speed = o.speed || (5.2 + rng() * 1.6); }
      else if (kind === 'dark') { dark.on = true; dark.t = 0; }
      else if (kind === 'ease') { ease.on = true; ease.t = 0; }
      else if (kind === 'trip') { trip.state = 'castoff'; trip.t = 0; trip.s = 0; trip.v = 0; }
      else if (kind === 'far') { farS.on = true; farS.dir = (o.dir !== undefined ? o.dir : (rng() < 0.5 ? 1 : -1)); farS.u = farS.dir > 0 ? 0 : 1; farS.t = 0; far.group.visible = true; return; }
      active = kind; lastKind = kind;
    }
    function busy() { return gust.on || cloud.on || dark.on || ease.on || trip.state !== 'moored'; }
    function direct(dt, t) {
      var k;
      if (script) {
        for (k = 0; k < script.length; k++) if (!script[k].done && t >= script[k].t) { script[k].done = true; start(script[k].kind, script[k]); }
        return;
      }
      if (busy()) { nextAt = t + 5 + rng() * 6; return; }
      if (t < nextAt) return;
      // weighted pick, never the same thing twice in a row; the trip to sea is the centre-piece
      var opts = [['gust', 4], ['cloud', 3], ['trip', 2.4], ['ease', 2.2], ['dark', 0.7]];
      function skip(o) { return o[0] === lastKind || (o[0] === 'trip' && farS.on); }
      var tot = 0; opts.forEach(function (o) { if (!skip(o)) tot += o[1]; });
      var r = rng() * tot, pick = 'gust';
      for (k = 0; k < opts.length; k++) { if (skip(opts[k])) continue; r -= opts[k][1]; if (r <= 0) { pick = opts[k][0]; break; } }
      if (S.count === undefined) S.count = 0;
      S.count++;
      if (S.count === 1) pick = 'gust';
      // the darker spell is rare, but make sure it does come round once in a long while
      if (pick === 'dark') S.lastDark = S.count;
      else if (S.count - (S.lastDark || 0) >= 13 && lastKind !== 'dark') { pick = 'dark'; S.lastDark = S.count; }
      start(pick);
      // a far boat slips past now and then, never during the trip
      if (!farS.on && pick !== 'trip' && rng() < 0.4) start('far');
    }

    // ----------------------------------------------------------------- wake influence on floating things
    var WAKE_SPREAD = 1.15, WAKE_LIFE = 15;
    function wakeAt(x, z, t) {
      var sum = 0;
      for (var k = 0; k < wake.length; k++) {
        var w = wake[k], age = t - w.t; if (age > WAKE_LIFE) continue;
        var vx = x - w.x, vz = z - w.z, along = vx * w.hx + vz * w.hz, lat = Math.abs(-vx * w.hz + vz * w.hx);
        if (Math.abs(along) > 1.0) continue;
        var dArm = 0.5 + age * WAKE_SPREAD, dd = Math.abs(lat - dArm);
        if (dd < 0.7) sum += (1 - dd / 0.7) * w.sp / (1 + age * 0.22);
      }
      return sum;
    }

    // ----------------------------------------------------------------- per step
    function update(dt, t) {
      var k, b;
      direct(dt, t);
      // --- rain: slow swell between drizzle and denser rain; eases right off for the rainbow
      var base = 0.56 + 0.26 * Math.sin(t * (2 * Math.PI / 96) + rainPh[0]) + 0.08 * Math.sin(t * (2 * Math.PI / 33) + rainPh[1]);
      if (mode === 'tour') base = 0.6 + 0.07 * Math.sin(t * 0.21 + rainPh[0]);
      if (ease.on) {
        ease.t += dt;
        var ek = H.smooth(0, 4.5, ease.t) * (1 - H.smooth(14.5, 20, ease.t));
        ease.k = ek;
        H.state.rainbow = H.smooth(3.2, 6.6, ease.t) * (1 - H.smooth(12.2, 16.0, ease.t));
        if (ease.t > 20) { ease.on = false; ease.k = 0; H.state.rainbow = 0; }
      }
      var rain = H.clamp(base, 0.1, 0.96) * (1 - ease.k * 0.88);
      if (dark.on) rain = Math.min(0.98, rain + dark.v * 0.3);
      H.state.rain += (rain - H.state.rain) * Math.min(1, dt * 1.5);

      // --- gust front marching in from the sea
      if (gust.on) {
        gust.t += dt; gust.front += H.GUST_SPEED * dt;
        gust.strength = gust.peak * H.smooth(0, 1.2, gust.t) * (1 - H.smooth(13.5, 18.5, gust.t));
        if (gust.t > 18.5) { gust.on = false; gust.front = -1000; gust.strength = 0; }
      }
      H.windState.front = gust.front; H.windState.strength = gust.strength;
      H.windState.breeze = 0.2 + 0.05 * Math.sin(t * 0.23) + 0.03 * Math.sin(t * 0.71 + 1.0);
      U.uGust.value.x = gust.front; U.uGust.value.y = gust.strength; U.uBreeze.value = H.windState.breeze;

      // --- cloud shadow sweeping over the base
      if (cloud.on) {
        cloud.lead += cloud.speed * dt; cloud.trail = cloud.lead - cloud.width;
        if (cloud.trail > 60) { cloud.on = false; cloud.lead = -999; cloud.trail = -1000; }
      }
      H.cloudState.lead = cloud.lead; H.cloudState.trail = cloud.trail;
      U.uCloud.value.x = cloud.lead; U.uCloud.value.y = cloud.trail;
      var sunHere = H.cloudSunCPU(-6, 6) / Math.max(0.05, H.cloudState.sunK);
      H.state.sunVis += (sunHere - H.state.sunVis) * Math.min(1, dt * 2);

      // --- a darker spell: the lighthouse wakes up in daytime
      if (dark.on) {
        dark.t += dt;
        dark.v = H.smooth(0, 7, dark.t) * (1 - H.smooth(21, 29, dark.t));
        if (dark.t > 29) { dark.on = false; dark.v = 0; }
      }
      H.state.dark = dark.v;
      var lit = dark.v > 0.55 ? 1 : 0;
      H.state.lighthouse += (lit - H.state.lighthouse) * Math.min(1, dt * 2.5);

      // --- the trip to sea
      b = B;
      if (trip.state === 'castoff') {
        trip.t += dt;
        b.lines.forEach(function (ln) { ln.cast = H.smooth(0.2, 2.2, trip.t); });
        if (trip.t > 2.6) { trip.state = 'underway'; b.moored = false; b.lines.forEach(function (ln) { ln.rope.mesh.visible = false; }); if (b.shafts) b.shafts.visible = false; }
      } else if (trip.state === 'underway') {
        var vmax = pathSpeed(trip.s);
        trip.v += (vmax - trip.v) * Math.min(1, dt * 0.9);
        trip.s += trip.v * dt;
        pathAt(trip.s, tmpP);
        var yaw = Math.atan2(tmpP.hx, tmpP.hz);
        var dy = yaw - b.ry; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        b.turn += (dy / Math.max(dt, 1e-4) - b.turn) * Math.min(1, dt * 3);
        b.ry = yaw; b.x = tmpP.x; b.z = tmpP.z;
        if (t - trip.lastSample > 0.22 && trip.v > 0.25) {
          trip.lastSample = t;
          wake.push({ x: b.x - tmpP.hx * 3.9, z: b.z - tmpP.hz * 3.9, hx: tmpP.hx, hz: tmpP.hz, t: t, sp: trip.v, w: 1 });
          if (wake.length > 150) wake.shift();
        }
        if (trip.s >= pathLen - 0.02) { trip.state = 'tieup'; trip.t = 0; b.x = b.berth.x; b.z = b.berth.z; b.ry = b.berth.ry; b.moored = true; trip.v = 0; b.turn = 0; b.lines.forEach(function (ln) { ln.rope.mesh.visible = true; }); }
      } else if (trip.state === 'tieup') {
        trip.t += dt;
        b.lines.forEach(function (ln) { ln.cast = 1 - H.smooth(0.3, 2.4, trip.t); });
        if (trip.t > 2.8) { trip.state = 'moored'; if (b.shafts) b.shafts.visible = true; }
      }
      S.tripState = trip.state; S.tripV = trip.v; S.tripS = trip.s;

      // --- far boat beyond the long breakwater
      if (farS.on) {
        farS.t += dt; farS.u += farS.dir * 1.6 * dt / 47.0;
        farPos(farS.u, _a); farPos(farS.u + farS.dir * 0.004, _b);
        farS.x = _a.x; farS.z = _a.z; farS.hx = _b.x - _a.x; farS.hz = _b.z - _a.z; var fl = Math.hypot(farS.hx, farS.hz) || 1; farS.hx /= fl; farS.hz /= fl;
        if (t - farS.lastSample > 0.3 && Math.abs(farS.x) < HALF && Math.abs(farS.z) < HALF - 0.4) { farS.lastSample = t; wake.push({ x: farS.x - farS.hx * 3.0, z: farS.z - farS.hz * 3.0, hx: farS.hx, hz: farS.hz, t: t, sp: 1.2, w: 0.6 }); if (wake.length > 150) wake.shift(); }
        if (farS.u > 1 || farS.u < 0) { farS.on = false; far.group.visible = false; }
      }
      while (wake.length && t - wake[0].t > WAKE_LIFE + 4) wake.shift();

      // --- boats: rocking, drifting on their lines, nudging the fenders against the wall
      for (k = 0; k < boats.length; k++) {
        b = boats[k];
        var wk = wakeAt(b.x, b.z, t) * (b === B && trip.state === 'underway' ? 0 : 1);
        b.kickV += (wk * 5.2 - b.kick * 9.0 - b.kickV * 1.3) * dt; b.kick += b.kickV * dt;
        var gw = H.gustAtCPU(b.x, b.z);
        var a = b.amp, ph = b.ph, w = b.w;
        b.rollT = a * (0.030 * Math.sin(t * w[0] + ph[0]) + 0.017 * Math.sin(t * w[1] * 1.7 + ph[1])) + b.kick * 0.085 + gw * 0.02 * Math.sin(t * 2.1 + ph[2]);
        b.pitchT = a * 0.010 * Math.sin(t * w[2] * 1.3 + ph[2]) + b.kick * 0.022 * Math.sin(t * 1.9 + ph[1]);
        b.heaveT = a * 0.028 * Math.sin(t * w[0] * 0.9 + ph[3]) + b.kick * 0.05;
        if (b.moored) {
          // drift relative to the berth: + is towards the quay; the fenders stop it
          var want = 0.10 * Math.sin(t * w[3] + ph[1]) + 0.07 * Math.sin(t * w[3] * 2.3 + ph[0]) + gw * 0.22 + b.kick * 0.10;
          b.driftV += ((want - b.drift) * 2.4 - b.driftV * 1.2) * dt; b.drift += b.driftV * dt;
          var lim = 0.17;
          if (b.drift > lim) { b.drift = lim; if (b.driftV > 0.02) b.bump = Math.min(1, b.bump + b.driftV * 5); b.driftV *= -0.3; }
          b.bump += (0 - b.bump) * Math.min(1, dt * 3.5);
          var surge = 0.08 * Math.sin(t * w[3] * 1.4 + ph[2]);
          // quay normal in world: local x * side
          var nx = Math.cos(b.berth.ry) * b.side, nzq = -Math.sin(b.berth.ry) * b.side;
          var fx = Math.sin(b.berth.ry), fz = Math.cos(b.berth.ry);
          b.x = b.berth.x + nx * b.drift + fx * surge; b.z = b.berth.z + nzq * b.drift + fz * surge;
          b.ry = b.berth.ry + 0.012 * Math.sin(t * w[3] * 1.9 + ph[3]);
          b.rollT += -b.side * b.bump * 0.03;
        } else {
          b.rollT += H.clamp(b.turn * trip.v * 0.05, -0.12, 0.12);
          b.pitchT += -0.012 * trip.v;
          b.heaveT += 0.02 * trip.v * 0.3;
        }
      }
      // --- buoys
      for (k = 0; k < buoys.length; k++) {
        var bu = buoys[k], wv = wakeAt(bu.x, bu.z, t);
        bu.kickV += (wv * 7.0 - bu.kick * 10.0 - bu.kickV * 1.1) * dt; bu.kick += bu.kickV * dt;
      }
      // --- tetrapod foam reacts when the wake reaches it
      for (k = 0; k < H.TETRA.length; k++) {
        var tp = H.TETRA[k], wt = wakeAt(tp.x, tp.z, t);
        tetraKick[k] += (Math.min(1.6, wt * 1.4) - tetraKick[k]) * Math.min(1, dt * (wt > tetraKick[k] ? 6 : 0.7));
      }
      updateSock(t, dt); updateStrings(t, dt);
    }

    // ----------------------------------------------------------------- per rendered frame
    function present(t) {
      var k, b, i2;
      for (k = 0; k < boats.length; k++) {
        b = boats[k];
        b.group.position.set(b.x, 0, b.z); b.group.rotation.y = b.ry;
        b.inner.rotation.set(b.pitchT || 0, 0, b.rollT || 0); b.inner.position.y = b.heaveT || 0;
        b.fenders.rotation.z = -b.side * (b.bump || 0) * 0.0;
        b.group.updateMatrixWorld(true);
        for (i2 = 0; i2 < b.lines.length; i2++) {
          var ln = b.lines[i2];
          if (!ln.rope.mesh.visible) continue;
          _a.copy(ln.local).applyMatrix4(b.inner.matrixWorld);
          // when cast off the shore end is hauled back on board
          _b.copy(ln.bollard).lerp(_a, ln.cast); _c.copy(ln.edge).lerp(_a, ln.cast);
          if (ln.cast > 0.01) { _b.y += Math.sin(ln.cast * Math.PI) * 0.45; _c.y += Math.sin(ln.cast * Math.PI) * 0.3; }
          ln.rope.update(_a, _b, ln.rest * (1 - ln.cast * 0.9) + 0.03, _c);
        }
      }
      for (k = 0; k < buoys.length; k++) {
        var bu = buoys[k];
        var bob = Math.sin(t * 1.15 + bu.ph) * 0.035 + bu.kick * 0.09;
        bu.group.position.y = 0.03 + bob;
        bu.group.rotation.x = Math.sin(t * 0.83 + bu.ph * 2) * 0.05 + bu.kick * 0.2 * Math.sin(t * 2.6 + bu.ph);
        bu.group.rotation.z = Math.cos(t * 0.71 + bu.ph) * 0.05 + bu.kick * 0.2 * Math.cos(t * 2.3 + bu.ph);
      }
      // far boat
      if (far.group.visible) {
        far.group.position.set(farS.x, 0, farS.z); far.group.rotation.y = Math.atan2(farS.hx, farS.hz);
        far.inner.rotation.set(Math.sin(t * 1.1) * 0.012 - 0.01, 0, Math.sin(t * 0.8 + 1) * 0.03); far.inner.position.y = Math.sin(t * 0.9) * 0.03;
      }
      // lighthouse
      var lhK = H.state.lighthouse;
      lampMat.color.setRGB(0.80 + 0.2 * lhK, 0.84 + 0.14 * lhK, 0.83 - 0.18 * lhK);
      beam.visible = lhK > 0.02; halo.visible = beam.visible;
      if (beam.visible) { beam.rotation.y = t * 0.85; beamMat.uniforms.uA.value = lhK * 0.42; }
      // foam between tetrapods
      for (k = 0; k < foams.length; k++) {
        var f = foams[k], kk = tetraKick[f.ti];
        var s = Math.max(0, Math.sin(t * f.w + f.ph)); s = s * s * f.s * (0.8 + kk * 1.1);
        _a.set(f.x + Math.sin(t * 0.4 + f.ph) * 0.15, 0.02 + s * 0.16 + kk * 0.1, f.z + Math.cos(t * 0.35 + f.ph) * 0.15); _s.set(s * 1.5, s * 0.5 + kk * 0.12 * (s > 0.01 ? 1 : 0), s * 1.5);
        _m.compose(_a, _q.identity(), _s); foamMesh.setMatrixAt(k, _m);
      }
      foamMesh.instanceMatrix.needsUpdate = true;
      drawDist(t);
    }

    // ----------------------------------------------------------------- disturbance map (R: foam, G: wake lines, B: gust ripples)
    function drawDist(t) {
      var D = H.Dist, c = D.ctx, k;
      D.begin();
      // gust band: fine ripples in the ~3.5 s just behind the front
      if (gust.on && gust.strength > 0.02) {
        var wx = H.WIND.x, wz = H.WIND.z, f = gust.front, bandW = 26;
        var g = c.createLinearGradient(wx * (f - bandW), wz * (f - bandW), wx * (f + 1.5), wz * (f + 1.5));
        var st = Math.min(1, gust.strength);
        g.addColorStop(0, 'rgba(0,0,255,0)'); g.addColorStop(0.55, 'rgba(0,0,255,' + (0.5 * st).toFixed(3) + ')'); g.addColorStop(0.93, 'rgba(0,0,255,' + (0.95 * st).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,255,0)');
        c.fillStyle = g; c.fillRect(-HALF, -HALF, HALF * 2, HALF * 2);
      }
      // wake: churned foam down the middle, two spreading arms
      c.lineCap = 'round';
      for (k = 1; k < wake.length; k++) {
        var a = wake[k - 1], b = wake[k], age = t - b.t;
        if (Math.hypot(a.x - b.x, a.z - b.z) > 3) continue;
        if (age < 11) {
          var al = (1 - age / 11); al = al * al * 0.95 * b.w;
          c.strokeStyle = 'rgba(255,0,0,' + al.toFixed(3) + ')'; c.lineWidth = (0.55 + age * 0.2) * (0.6 + 0.4 * b.w);
          c.beginPath(); c.moveTo(a.x, a.z); c.lineTo(b.x, b.z); c.stroke();
        }
        if (age < WAKE_LIFE) {
          var d0 = 0.5 + (t - a.t) * WAKE_SPREAD, d1 = 0.5 + age * WAKE_SPREAD, al2 = (1 - age / WAKE_LIFE) * 0.9 * b.w;
          c.strokeStyle = 'rgba(0,255,0,' + al2.toFixed(3) + ')'; c.lineWidth = 0.34;
          for (var sgn = -1; sgn <= 1; sgn += 2) {
            c.beginPath(); c.moveTo(a.x - a.hz * d0 * sgn, a.z + a.hx * d0 * sgn); c.lineTo(b.x - b.hz * d1 * sgn, b.z + b.hx * d1 * sgn); c.stroke();
          }
        }
      }
      // prop wash right at the stern while under way
      if (trip.state === 'underway' && trip.v > 0.3) {
        pathAt(trip.s, tmpP);
        c.fillStyle = 'rgba(255,0,0,0.9)'; c.beginPath(); c.arc(B.x - tmpP.hx * 4.6, B.z - tmpP.hz * 4.6, 0.75 + trip.v * 0.12, 0, 7); c.fill();
        // bow wave
        c.strokeStyle = 'rgba(255,0,0,0.8)'; c.lineWidth = 0.3;
        for (var sg = -1; sg <= 1; sg += 2) { c.beginPath(); c.moveTo(B.x + tmpP.hx * 4.5, B.z + tmpP.hz * 4.5); c.lineTo(B.x + tmpP.hx * 2.0 - tmpP.hz * 1.7 * sg, B.z + tmpP.hz * 2.0 + tmpP.hx * 1.7 * sg); c.stroke(); }
      }
      if (trip.state === 'castoff' && trip.t > 1.2) { c.fillStyle = 'rgba(255,0,0,0.6)'; c.beginPath(); c.arc(B.x + 4.6, B.z, 0.6, 0, 7); c.fill(); }
      // gulls sitting on the water leave soft rings
      if (H.GULLS) for (k = 0; k < H.GULLS.length; k++) {
        var gu = H.GULLS[k]; if (gu.state !== 'float') continue;
        var rr = 0.35 + ((t * 0.5 + k * 0.37) % 1) * 0.6;
        c.strokeStyle = 'rgba(0,255,0,0.5)'; c.lineWidth = 0.1; c.beginPath(); c.arc(gu.pos.x, gu.pos.z, rr, 0, 7); c.stroke();
      }
      D.end();
    }

    S.start = start; S.busy = busy;
    S.info = function () { return { trip: trip, gust: gust, cloud: cloud, dark: dark, ease: ease, far: farS, wake: wake.length }; };
    H.addSystem({ reset: resetAll, update: update, present: present });
  };
})();
