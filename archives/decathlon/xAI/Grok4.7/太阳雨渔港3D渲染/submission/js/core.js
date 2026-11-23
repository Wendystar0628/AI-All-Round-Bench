/* Shared renderer, toon materials, and math for the harbor diorama. */
var HR = {
  WATER_Y: -1.2,
  BASE: 20,
  FOG_NEAR: 40,
  FOG_FAR: 92,
  FOG_COL: new THREE.Color(0xd7eef0),
  SUN: new THREE.Vector3(0.42, 0.82, 0.38).normalize(),
  U: {},
  A: {},
  W: {},
  _mats: {},
  GEO: {}
};

(function () {
  var rngState = 20261116;
  HR.rand = function () {
    rngState |= 0;
    rngState = (rngState + 0x6D2B79F5) | 0;
    var t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  HR.randRange = function (a, b) { return a + (b - a) * HR.rand(); };
  HR.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  HR.lerp = function (a, b, t) { return a + (b - a) * t; };
  HR.smooth = function (a, b, x) {
    var t = HR.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  HR.TAU = Math.PI * 2;

  function whiteTex() {
    var c = document.createElement('canvas');
    c.width = 2; c.height = 2;
    var g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 2, 2);
    var t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }
  HR.whiteTex = whiteTex();

  HR.makeCanvas = function (w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };

  HR.U.uTime = { value: 0 };
  HR.U.uSunVis = { value: 1 };
  HR.U.uSunDir = { value: new THREE.Vector3(0.42, 0.82, 0.38) };
  HR.U.uCloudCenter = { value: new THREE.Vector3() };
  HR.U.uCloudDir = { value: new THREE.Vector2(1, 0) };
  HR.U.uCloudAmt = { value: 0 };
  HR.U.uSlant = { value: 0.35 };
  HR.U.uRain = { value: 0.5 };

  var VS = [
    'varying vec3 vN;',
    'varying vec3 vW;',
    'varying vec3 vV;',
    'varying vec2 vUv;',
    'varying vec3 vCol;',
    'uniform vec3 uColor;',
    'void main() {',
    '  #ifdef USE_INSTANCING',
    '    vec4 lp = instanceMatrix * vec4(position, 1.0);',
    '    #ifdef USE_INSTANCING_COLOR',
    '      vCol = instanceColor;',
    '    #else',
    '      vCol = uColor;',
    '    #endif',
    '    vec4 wp = modelMatrix * lp;',
    '    mat3 im = mat3(instanceMatrix);',
    '    vec3 n = normalize(mat3(modelMatrix) * im * normal);',
    '  #else',
    '    vec4 wp = modelMatrix * vec4(position, 1.0);',
    '    vec3 n = normalize(mat3(modelMatrix) * normal);',
    '    vCol = uColor;',
    '  #endif',
    '  vW = wp.xyz;',
    '  vec4 mv = viewMatrix * wp;',
    '  vV = -mv.xyz;',
    '  vN = n;',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var FS = [
    'uniform vec3 uShadow;',
    'uniform vec3 uEmissive;',
    'uniform float uWet;',
    'uniform float uOpacity;',
    'uniform float uUseMap;',
    'uniform sampler2D uMap;',
    'uniform vec3 uSunDir;',
    'uniform float uSunVis;',
    'uniform vec3 uCloudCenter;',
    'uniform vec2 uCloudDir;',
    'uniform float uCloudAmt;',
    'varying vec3 vN;',
    'varying vec3 vW;',
    'varying vec3 vV;',
    'varying vec2 vUv;',
    'varying vec3 vCol;',
    'float cloudShade(vec3 w) {',
    '  vec2 d = w.xz - uCloudCenter.xz;',
    '  float s = abs(dot(d, uCloudDir));',
    '  float band = exp(-s * s / 70.0);',
    '  return clamp(uSunVis * (1.0 - uCloudAmt * band * 0.38), 0.42, 1.0);',
    '}',
    'void main() {',
    '  vec3 N = normalize(vN);',
    '  vec3 L = normalize(uSunDir);',
    '  vec3 V = normalize(vV);',
    '  float ndl = dot(N, L);',
    '  float band = ndl > 0.52 ? 1.0 : (ndl > 0.1 ? 0.86 : 0.64);',
    '  float up = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);',
    '  float belly = smoothstep(0.15, -0.55, N.y);',
    '  vec3 base = vCol;',
    '  if (uUseMap > 0.5) base *= texture2D(uMap, vUv).rgb;',
    '  vec3 lit = mix(uShadow, base, band);',
    '  lit = mix(lit, uShadow, belly * 0.72 * (1.0 - band + 0.25));',
    '  lit = mix(lit, base, up * 0.18);',
    '  float sunF = cloudShade(vW);',
    '  lit = mix(lit * vec3(0.78, 0.88, 0.92), lit, sunF);',
    '  vec3 H = normalize(L + V);',
    '  float spec = pow(max(dot(N, H), 0.0), mix(60.0, 22.0, uWet));',
    '  float sheen = pow(max(dot(N, H), 0.0), 7.0);',
    '  lit += step(0.62, spec) * uWet * sunF * vec3(1.0, 0.97, 0.88) * 0.42;',
    '  lit += sheen * uWet * sunF * 0.05;',
    '  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.6);',
    '  lit += rim * vec3(1.0, 0.97, 0.9) * 0.045 * sunF;',
    '  lit += uEmissive;',
    '  float fd = length(vV);',
    '  float fog = smoothstep(40.0, 92.0, fd);',
    '  lit = mix(lit, vec3(0.843, 0.933, 0.941), fog);',
    '  gl_FragColor = vec4(lit, uOpacity);',
    '}'
  ].join('\n');

  HR.VS = VS;
  HR.FS = FS;

  HR.mat = function (color, o) {
    o = o || {};
    var op = o.op == null ? 1 : o.op;
    var key = [color, o.wet || 0, op, o.em || '', o.shadow || '', o.map ? o.map.uuid : '', o.side || 0, o.dw == null ? '' : o.dw].join('|');
    if (HR._mats[key]) return HR._mats[key];
    var uniforms = {
      uColor: { value: new THREE.Color(color) },
      uShadow: { value: new THREE.Color(o.shadow || '#6e98a2') },
      uEmissive: { value: new THREE.Color(o.em || '#000000') },
      uWet: { value: o.wet || 0 },
      uOpacity: { value: op },
      uUseMap: { value: o.map ? 1 : 0 },
      uMap: { value: o.map || HR.whiteTex },
      uSunDir: HR.U.uSunDir,
      uSunVis: HR.U.uSunVis,
      uCloudCenter: HR.U.uCloudCenter,
      uCloudDir: HR.U.uCloudDir,
      uCloudAmt: HR.U.uCloudAmt
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: VS,
      fragmentShader: FS,
      transparent: op < 0.999,
      depthWrite: o.dw != null ? o.dw : op > 0.85,
      side: o.side || THREE.FrontSide
    });
    HR._mats[key] = mat;
    return mat;
  };

  HR.lineMat = new THREE.LineBasicMaterial({ color: 0x35515c, fog: true });

  function flatGeo(g) {
    var n = g.index ? g.toNonIndexed() : g.clone();
    n.computeVertexNormals();
    return n;
  }

  HR.GEO.box = flatGeo(new THREE.BoxGeometry(1, 1, 1));
  HR.GEO.boxEdges = new THREE.EdgesGeometry(HR.GEO.box, 20);
  HR.GEO.cyl = flatGeo(new THREE.CylinderGeometry(1, 1, 1, 8, 1));
  HR.GEO.cylEdges = new THREE.EdgesGeometry(HR.GEO.cyl, 25);
  HR.GEO.cyl12 = flatGeo(new THREE.CylinderGeometry(1, 1, 1, 12, 1));
  HR.GEO.cone = flatGeo(new THREE.ConeGeometry(1, 1, 7, 1));
  HR.GEO.coneEdges = new THREE.EdgesGeometry(HR.GEO.cone, 20);
  HR.GEO.sphere = new THREE.SphereGeometry(1, 16, 12);
  HR.GEO.sphereSm = new THREE.SphereGeometry(1, 10, 8);
  HR.GEO.ico = flatGeo(new THREE.IcosahedronGeometry(1, 0));
  HR.GEO.torus = new THREE.TorusGeometry(1, 0.18, 8, 18);
  HR.GEO.plane = new THREE.PlaneGeometry(1, 1);

  HR.concreteMap = HR.makeCanvas(256, 256, function (g) {
    g.fillStyle = '#e6ebe8';
    g.fillRect(0, 0, 256, 256);
    var i;
    for (i = 0; i < 2800; i++) {
      var v = 188 + ((i * 17) % 52);
      g.fillStyle = 'rgba(' + v + ',' + (v + 4) + ',' + (v + 2) + ',0.2)';
      g.fillRect((i * 97) % 256, (i * 53) % 256, 1, 1 + (i % 2));
    }
    g.globalAlpha = 0.14;
    for (i = 0; i < 36; i++) {
      g.fillStyle = i % 5 === 0 ? '#8aa4a8' : '#c9d2ce';
      g.beginPath();
      var cx = (i * 67) % 256, cy = (i * 91) % 256;
      var rx = 2.5 + (i % 6);
      g.ellipse(cx, cy, rx, rx * 0.55, (i % 7) * 0.4, 0, 6.28);
      g.fill();
    }
    g.globalAlpha = 0.22;
    g.strokeStyle = '#93a8aa';
    g.lineWidth = 1;
    for (i = 0; i < 6; i++) {
      g.beginPath();
      var x = (i * 41) % 220, y = (i * 73) % 220;
      g.moveTo(x, y);
      g.lineTo(x + 28 + (i % 5) * 8, y + ((i % 3) - 1) * 4);
      g.stroke();
    }
    g.globalAlpha = 1;
    // Keep the same HR.rand consumption as the previous stain pass so later layout stays put.
    for (i = 0; i < 140; i++) HR.rand();
  });
  HR.concreteMap.wrapS = HR.concreteMap.wrapT = THREE.RepeatWrapping;
  HR.concreteMap.repeat.set(7, 7);

  function addLines(mesh, edges) {
    if (!edges) return;
    var ls = new THREE.LineSegments(edges, HR.lineMat);
    ls.renderOrder = 2;
    ls.raycast = function () {};
    mesh.add(ls);
    return ls;
  }

  HR.mesh = function (geo, color, parent, o) {
    o = o || {};
    var material = o.material || HR.mat(color, o);
    var m = new THREE.Mesh(geo, material);
    if (o.scale) {
      if (typeof o.scale === 'number') m.scale.setScalar(o.scale);
      else m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    }
    if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    if (o.name) m.name = o.name;
    if (!o.noLine) addLines(m, o.edges || null);
    if (parent) parent.add(m);
    return m;
  };

  HR.box = function (parent, w, h, d, x, y, z, color, o) {
    o = o || {};
    o.scale = [w, h, d];
    o.pos = [x, y, z];
    if (!o.noLine && !o.edges) o.edges = HR.GEO.boxEdges;
    return HR.mesh(HR.GEO.box, color, parent, o);
  };

  HR.cyl = function (parent, rt, rb, h, x, y, z, color, o) {
    o = o || {};
    var geo = (Math.abs(rt - rb) < 1e-4 && !o.geo) ? HR.GEO.cyl : (o.geo || HR.GEO.cyl12);
    // unit cylinder radius 1 height 1. Non-uniform: x=avg radius, y=height. Taper needs unique geo.
    if (Math.abs(rt - rb) > 1e-3) {
      geo = new THREE.CylinderGeometry(Math.max(0.001, rt), Math.max(0.001, rb), h, o.seg || 8, 1);
      geo = geo.toNonIndexed();
      geo.computeVertexNormals();
      o.scale = null;
      o.edges = new THREE.EdgesGeometry(geo, 28);
      o.pos = [x, y, z];
      return HR.mesh(geo, color, parent, o);
    }
    o.scale = [rt, h, rt];
    o.pos = [x, y, z];
    if (!o.noLine) o.edges = HR.GEO.cylEdges;
    return HR.mesh(HR.GEO.cyl, color, parent, o);
  };

  HR.sph = function (parent, r, x, y, z, color, o) {
    o = o || {};
    o.scale = r;
    o.pos = [x, y, z];
    o.noLine = o.noLine !== false;
    return HR.mesh(o.sm ? HR.GEO.sphereSm : HR.GEO.sphere, color, parent, o);
  };

  HR.v3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };

  HR.makeHull = function (L, B, D) {
    var segL = 14, segG = 8;
    var pos = [], uv = [], idx = [];
    function vid(i, j) { return i * (segG + 1) + j; }
    for (var i = 0; i <= segL; i++) {
      var zt = i / segL;
      var z = -L / 2 + zt * L;
      var bow = Math.sin(Math.min(1, zt / 0.24) * Math.PI * 0.5);
      var stern = zt > 0.9 ? HR.lerp(1, 0.86, (zt - 0.9) / 0.1) : 1;
      var beam = B * (0.18 + 0.82 * bow) * stern;
      var keelLift = (1 - Math.min(1, zt / 0.3)) * D * 0.62;
      var sheer = Math.cos((zt - 0.45) * Math.PI) * D * 0.08;
      for (var j = 0; j <= segG; j++) {
        var a = j / segG;
        var side = Math.cos(a * Math.PI);
        var around = Math.sin(a * Math.PI);
        var y = -D * around + keelLift * around + sheer * (1 - around);
        var flare = 1 - 0.42 * around;
        var x = side * (beam / 2) * flare;
        pos.push(x, y, z);
        uv.push(zt, a);
      }
    }
    for (i = 0; i < segL; i++) {
      for (j = 0; j < segG; j++) {
        var a0 = vid(i, j), b0 = vid(i + 1, j), c0 = vid(i + 1, j + 1), d0 = vid(i, j + 1);
        idx.push(a0, d0, b0, b0, d0, c0);
      }
    }
    // deck cap
    var deckStart = pos.length / 3;
    var deckJ = [0, segG];
    for (i = 0; i <= segL; i++) {
      for (var k = 0; k < 2; k++) {
        var p = vid(i, deckJ[k]);
        pos.push(pos[p * 3], Math.max(0.02, pos[p * 3 + 1] + 0.02), pos[p * 3 + 2]);
        uv.push(i / segL, k);
      }
    }
    for (i = 0; i < segL; i++) {
      var a1 = deckStart + i * 2;
      var b1 = a1 + 1;
      var c1 = a1 + 2;
      var d1 = a1 + 3;
      idx.push(a1, c1, b1, b1, c1, d1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  HR.orientY = function (mesh, a, b, radius) {
    var dir = b.clone().sub(a);
    var len = dir.length();
    if (len < 1e-5) return;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, len, radius);
    mesh.quaternion.setFromUnitVectors(HR._up, dir.multiplyScalar(1 / len));
  };
  HR._up = new THREE.Vector3(0, 1, 0);

  // Facing yaw for a mesh whose nose is local -Z.
  // Check: dir (0,0,-1) -> yaw 0; dir (1,0,0) -> yaw -PI/2.
  HR.yawFromDir = function (dx, dz) {
    return Math.atan2(-dx, -dz);
  };
})();
