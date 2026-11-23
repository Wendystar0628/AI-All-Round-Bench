/* Scene construction. All meshes are procedural; nothing is loaded from image files. */
(function () {
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd7eef0, HR.FOG_NEAR, HR.FOG_FAR);
  HR.scene = scene;
  var A = HR.A;
  var W = HR.W;
  W.boats = [];
  W.ropes = [];
  W.gulls = [];
  W.fish = [];
  W.trees = [];
  W.flags = [];
  W.nets = [];
  W.foams = [];
  W.drips = [];
  W.ripples = [];
  W.shafts = [];
  W.seaweed = [];
  W.buoys = [];
  W.perches = [];
  W.mist = [];
  W.distant = [];
  W.slap = [];
  W.caustics = [];
  W.sparkles = [];

  var CON = '#d7ddda';
  var CONW = { wet: 0.78, map: HR.concreteMap, shadow: '#6d98a3' };
  var WOOD = '#b58962';
  var WOODD = '#8c6848';
  var RUST = '#a85b3c';
  var BLACK = '#2a2e30';
  var WHITE = '#f6faf8';
  var TEAL = '#3e9e98';
  var DEEP = '#1b5670';

  function gmat(opt) {
    opt = opt || {};
    var uniforms = {
      uTint: { value: new THREE.Color(opt.tint || '#e7f6f6') },
      uOp: { value: opt.op == null ? 0.12 : opt.op },
      uBeads: { value: opt.beads == null ? 0.6 : opt.beads },
      uTime: HR.U.uTime,
      uSunVis: HR.U.uSunVis
    };
    return new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: [
        'varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW;',
        'void main(){',
        '  vec4 w = modelMatrix * vec4(position,1.0);',
        '  vW = w.xyz; vec4 mv = viewMatrix * w; vV = -mv.xyz;',
        '  vN = normalize(normalMatrix * normal); vUv = uv;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTint; uniform float uOp; uniform float uBeads; uniform float uTime; uniform float uSunVis;',
        'varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW;',
        'void main(){',
        '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
        '  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.2);',
        '  float cell = fract(sin(dot(floor(vUv * vec2(26.0, 18.0)), vec2(12.9, 78.2))) * 43758.5);',
        '  float bead = smoothstep(0.90, 0.98, cell) * uBeads;',
        '  vec3 col = uTint + fres * vec3(1.0) * 0.35 + bead * vec3(1.0, 0.96, 0.86) * uSunVis;',
        '  float a = uOp + fres * 0.18 + bead * 0.25;',
        '  gl_FragColor = vec4(col, a);',
        '}'
      ].join('\n')
    });
  }
  var glass = gmat({ op: 0.08, beads: 0.35 });
  var glassRain = gmat({ op: 0.2, beads: 0.85, tint: '#e4f4f3' });
  HR.glass = glass;

  // ---------- sky ----------
  var skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uTime: HR.U.uTime, uSunDir: HR.U.uSunDir, uSunVis: HR.U.uSunVis },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vD; uniform float uTime; uniform vec3 uSunDir; uniform float uSunVis;',
      'void main(){',
      '  vec3 dir = normalize(vD);',
      '  float h = clamp(dir.y, 0.0, 1.0);',
      '  vec3 hor = vec3(0.90, 0.96, 0.96);',
      '  vec3 zen = vec3(0.78, 0.90, 0.93);',
      '  vec3 col = mix(hor, zen, pow(h, 0.65));',
      '  float n = sin(dir.x * 9.0 + uTime * 0.04) * sin(dir.z * 8.0 - uTime * 0.03);',
      '  float cld = smoothstep(0.25, 0.85, n * 0.5 + 0.5);',
      '  col = mix(col, vec3(1.0), cld * 0.28 * (1.0 - h * 0.4));',
      '  float sun = pow(max(dot(dir, normalize(uSunDir)), 0.0), 180.0);',
      '  float glow = pow(max(dot(dir, normalize(uSunDir)), 0.0), 10.0);',
      '  col += vec3(1.0, 0.97, 0.88) * sun * uSunVis;',
      '  col += vec3(1.0, 0.95, 0.85) * glow * 0.22 * uSunVis;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n')
  });
  var sky = new THREE.Mesh(new THREE.SphereGeometry(260, 20, 14), skyMat);
  scene.add(sky);

  // ---------- water ----------
  var waterUniforms = {
    uTime: HR.U.uTime,
    uSunVis: HR.U.uSunVis,
    uCloudCenter: HR.U.uCloudCenter,
    uCloudDir: HR.U.uCloudDir,
    uCloudAmt: HR.U.uCloudAmt,
    uSunDir: HR.U.uSunDir
  };
  var waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: [
      'uniform float uTime; varying vec3 vN; varying vec3 vW; varying vec3 vV; varying float vH;',
      'void main(){',
      '  vec3 p = position;',
      '  if (p.y > -0.05) {',
      '    p.y += sin(p.x * 0.55 + uTime * 0.9) * 0.035 + sin(p.z * 0.8 - uTime * 0.7) * 0.028;',
      '  }',
      '  vec4 w = modelMatrix * vec4(p, 1.0);',
      '  vW = w.xyz; vH = p.y;',
      '  vN = normalize(mat3(modelMatrix) * normal);',
      '  vec4 mv = viewMatrix * w; vV = -mv.xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime; uniform float uSunVis; uniform vec3 uCloudCenter; uniform vec2 uCloudDir; uniform float uCloudAmt; uniform vec3 uSunDir;',
      'varying vec3 vN; varying vec3 vW; varying vec3 vV; varying float vH;',
      'void main(){',
      '  vec3 N = normalize(vN); vec3 V = normalize(vV);',
      '  float up = smoothstep(0.22, 0.82, N.y);',
      '  float sunF = uSunVis * (1.0 - uCloudAmt * exp(-pow(abs(dot(vW.xz - uCloudCenter.xz, uCloudDir)), 2.0) / 70.0) * 0.45);',
      '  vec3 deep = vec3(0.14, 0.42, 0.52);',
      '  vec3 pale = vec3(0.62, 0.86, 0.84);',
      '  float dep = clamp(-vH / 3.4, 0.0, 1.0);',
      '  vec3 body = mix(pale, deep, dep);',
      '  float w1 = sin(vW.x * 0.46 + uTime * 0.48);',
      '  float w2 = sin(vW.z * 0.58 - uTime * 0.36);',
      '  float w3 = sin(vW.x * 1.25 + uTime * 0.7);',
      '  float q = vW.z * 0.42 + vW.x * 0.06 + w1 * 0.28 + w2 * 0.2 + w3 * 0.07;',
      '  float id = floor(q + 3.0);',
      '  float m = mod(id, 3.0);',
      '  vec3 blk = m < 0.5 ? vec3(0.94, 0.98, 0.96) : (m < 1.5 ? vec3(0.13, 0.40, 0.54) : vec3(0.38, 0.76, 0.73));',
      '  float fr = fract(q);',
      '  float seam = smoothstep(0.07, 0.0, fr) + smoothstep(0.93, 1.0, fr);',
      '  blk = mix(blk, blk * vec3(0.78, 0.86, 0.88), clamp(seam, 0.0, 1.0));',
      '  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.0);',
      '  vec3 col = mix(body, blk, up * 0.78);',
      '  col += fres * vec3(0.9, 0.97, 0.96) * up * 0.12;',
      '  float streak = sin(vW.x * 0.85 + vW.z * 3.6 - uTime * 1.05);',
      '  float lane = step(0.35, sin(vW.z * 0.55 + w1 + uTime * 0.25));',
      '  col += step(0.78, streak) * lane * up * sunF * vec3(1.0, 0.97, 0.86) * 0.42;',
      '  col = mix(col * vec3(0.8, 0.9, 0.92), col, clamp(sunF, 0.0, 1.0));',
      '  float fog = smoothstep(40.0, 92.0, length(vV));',
      '  col = mix(col, vec3(0.843, 0.933, 0.941), fog);',
      '  float alpha = mix(0.26, 0.58, up) + fres * up * 0.06;',
      '  alpha += dep * (1.0 - up) * 0.12;',
      '  gl_FragColor = vec4(col, alpha);',
      '}'
    ].join('\n')
  });
  HR.waterMat = waterMat;

  function waterGeo() {
    var pos = [], nor = [], idx = [];
    function addQuad(a, b, c, d, n) {
      var s = pos.length / 3;
      [a, b, c, d].forEach(function (p) {
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
      });
      idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    }
    var yT = 0, yB = -3.55;
    var rects = [
      [9, 20, 5, 20],
      [-3, 20, -12.2, 5],
      [13, 20, -15.2, -12.2],
      [-3, 20, -20, -15.2]
    ];
    rects.forEach(function (r) {
      var x0 = r[0], x1 = r[1], z0 = r[2], z1 = r[3];
      addQuad([x0, yT, z0], [x1, yT, z0], [x1, yT, z1], [x0, yT, z1], [0, 1, 0]);
    });
    // outer cut faces only
    addQuad([20, yT, 20], [20, yT, -20], [20, yB, -20], [20, yB, 20], [1, 0, 0]);
    addQuad([20, yT, -20], [-3, yT, -20], [-3, yB, -20], [20, yB, -20], [0, 0, -1]);
    addQuad([9, yT, 20], [20, yT, 20], [20, yB, 20], [9, yB, 20], [0, 0, 1]);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  }
  var water = new THREE.Mesh(waterGeo(), waterMat);
  water.position.y = HR.WATER_Y;
  water.renderOrder = 4;
  scene.add(water);

  // seabed
  function seabed() {
    var rects = [[9, 20, 5, 20], [-3, 20, -12.2, 5], [13, 20, -15.2, -12.2], [-3, 20, -20, -15.2]];
    rects.forEach(function (r) {
      var w = r[1] - r[0], d = r[3] - r[2];
      HR.box(scene, w, 0.18, d, (r[0] + r[1]) / 2, -4.62, (r[2] + r[3]) / 2, '#7d8b84', { wet: 0.1, noLine: true, shadow: '#5e7874' });
    });
  }
  seabed();

  function rock(x, y, z, s, c) {
    return HR.mesh(HR.GEO.ico, c || '#8b928c', scene, { pos: [x, y, z], scale: s, rot: [HR.rand(), HR.rand(), HR.rand()], noLine: true });
  }
  var rubble = [[15.2, -4.35, 14.4, 0.45], [16.8, -4.4, 12.2, 0.32], [13.4, -4.38, 16.2, 0.28], [17.5, -4.42, 16.8, 0.22],
    [2.2, -4.36, -2.4, 0.34], [0.4, -4.4, 1.2, 0.26], [6.5, -4.38, -6.2, 0.3], [11, -4.4, -8, 0.24],
    [8.2, -4.36, 8.4, 0.2], [-1.2, -4.4, -8.5, 0.22], [14.5, -4.4, -17.2, 0.26]];
  rubble.forEach(function (p) { rock(p[0], p[1], p[2], p[3], p[3] > 0.3 ? '#9aa29c' : '#6f7874'); });

  // sunken tire + chain
  function torusMesh(r, tube, x, y, z, color, rot) {
    var geo = new THREE.TorusGeometry(r, tube, 8, 16);
    return HR.mesh(geo, color, scene, { pos: [x, y, z], rot: rot || [Math.PI / 2, 0, 0], noLine: true, wet: 0.2 });
  }
  torusMesh(0.42, 0.14, 16.2, -4.28, 13.6, '#2c3034');
  torusMesh(0.36, 0.12, 1.2, -4.3, -1.1, '#34383c');
  for (var ci = 0; ci < 16; ci++) {
    var link = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.028, 6, 10), HR.mat('#8d9290', { wet: 0.4 }));
    link.position.set(12.4 + ci * 0.16, -4.42 + Math.sin(ci * 0.8) * 0.04, 10.2 + (ci % 5) * 0.05);
    link.rotation.set((ci % 2) * Math.PI * 0.5, ci * 0.35, 0);
    scene.add(link);
  }
  for (ci = 0; ci < 10; ci++) {
    link = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 8), HR.mat('#7e8584', { wet: 0.4 }));
    link.position.set(3.2 + ci * 0.15, -4.4, -5.5 + ci * 0.12);
    link.rotation.set((ci % 2) * 1.2, 0.4, 0);
    scene.add(link);
  }

  function seaweedAt(x, z, h, phase, col) {
    var g = new THREE.Group();
    g.position.set(x, -4.5, z);
    var seg = 4;
    var prev = g;
    for (var i = 0; i < seg; i++) {
      var m = HR.box(prev, 0.08, h / seg, 0.02, 0, (h / seg) * 0.5, 0, col || '#2f8f78', { noLine: true });
      m.position.y = (i === 0 ? 0.02 : h / seg);
      if (i > 0) {
        var pivot = new THREE.Group();
        prev.add(pivot);
        pivot.position.y = h / seg;
        m.position.y = (h / seg) * 0.5;
        pivot.add(m);
        prev = pivot;
      } else {
        prev = g;
        // first box already in g; rebuild simply below
      }
    }
    scene.add(g);
    W.seaweed.push({ g: g, phase: phase, h: h });
    return g;
  }
  // simpler seaweed ribbons built as single pivoting stacks
  function kelp(x, z, h, ph, col) {
    var root = new THREE.Group();
    root.position.set(x, -4.48, z);
    var pivots = [];
    var parent = root;
    var n = 4;
    for (var i = 0; i < n; i++) {
      var p = new THREE.Group();
      parent.add(p);
      HR.box(p, 0.07 + (n - i) * 0.012, h / n, 0.018, 0, (h / n) * 0.5, 0, col, { noLine: true });
      p.userData.len = h / n;
      pivots.push(p);
      parent = p;
      p.position.y = i === 0 ? 0 : h / n;
    }
    scene.add(root);
    W.seaweed.push({ pivots: pivots, phase: ph });
  }
  var kelpCols = ['#24856e', '#3aa088', '#1f6e62'];
  [[15.4, 15.2], [17.2, 11.4], [12.6, 13.8], [18.2, 17.4], [1.5, -3.2], [4.2, 2.4], [-0.6, -7.4], [7.5, -9.2], [9.4, 6.6], [14.2, -16.4], [6.2, -4.4], [17.6, 8.8]].forEach(function (p, i) {
    kelp(p[0], p[1], 0.7 + (i % 3) * 0.22, i * 0.7, kelpCols[i % 3]);
  });

  // ---------- land ----------
  function land(w, h, d, x, y, z) {
    return HR.box(scene, w, h, d, x, y, z, CON, CONW);
  }
  // tray lip
  land(41.1, 0.42, 41.1, 0, -5.06, 0);
  // foreground embankment
  land(29, 5, 11.7, -5.5, -2.5, 14.15);
  // west of platform, still high
  land(24.2, 5, 3.3, -7.9, -2.5, 6.65);
  // north quay arm
  land(17, 5, 18, -11.5, -2.5, -4);
  // northwest land under the hill
  land(17, 5, 7, -11.5, -2.5, -16.5);
  // boarding platform, lower
  land(4.8, 4.2, 3.2, 6.6, -2.65, 6.6);
  // breakwater, slightly raised
  HR.box(scene, 16.2, 5.32, 3.2, 5.1, -2.34, -13.75, '#d3d9d6', CONW);

  HR.hazardMap = HR.makeCanvas(128, 32, function (g, w, h) {
    g.fillStyle = '#d9ddd8';
    g.fillRect(0, 0, w, h);
    for (var x = -32; x < w + 32; x += 16) {
      g.fillStyle = (Math.floor(x / 16) % 2 === 0) ? '#1c1e1c' : '#e2b423';
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 8, h); g.lineTo(x - 8, h);
      g.fill();
    }
    g.fillStyle = 'rgba(190,196,192,0.9)';
    for (var i = 0; i < 8; i++) g.fillRect(HR.rand() * w, HR.rand() * h, 8 + HR.rand() * 16, 4);
  });
  HR.hazardMap.wrapS = THREE.RepeatWrapping;

  // curb with worn hazard stripes
  function curb(w, d, x, y, z, rep) {
    var tex = HR.hazardMap.clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(rep, 1);
    return HR.box(scene, w, 0.16, d, x, y, z, '#ddddd6', { map: tex, wet: 0.4, noLine: true });
  }
  // north edge of foreground dock (faces harbor), stop before the lower platform
  curb(7.2, 0.28, 0.6, 0.1, 5.12, 6);
  // east edge of high dock
  curb(0.28, 8.4, 8.92, 0.1, 13.6, 7);
  // platform lip
  curb(4.4, 0.22, 6.6, -0.42, 5.08, 4);

  // steps down to platform
  for (var si = 0; si < 4; si++) {
    var t = si / 3;
    var yTop = HR.lerp(-0.48, -0.02, t);
    var zc = HR.lerp(8.05, 9.15, t);
    HR.box(scene, 2.6, 0.16, 0.34, 6.55, yTop, zc, CON, CONW);
  }
  // side step on the west of the platform
  for (si = 0; si < 3; si++) {
    HR.box(scene, 0.36, 0.16, 1.1, 4.45 - si * 0.05, -0.48 + si * 0.16, 7.3, CON, CONW);
  }

  // ramp (slope) toward the platform
  var ramp = HR.box(scene, 1.5, 0.12, 3.4, 3.15, -0.15, 6.7, '#cfd6d3', { wet: 0.8, rot: [-0.28, 0.15, 0] });
  ramp.name = 'ramp';

  // ---------- concrete block courses on visible walls ----------
  var blockData = [];
  function pushCourse(x0, z0, x1, z1, y0, y1, nx, nz) {
    var dx = x1 - x0, dz = z1 - z0;
    var len = Math.hypot(dx, dz) || 1;
    var courses = Math.max(1, Math.floor((y1 - y0) / 0.46));
    for (var c = 0; c < courses; c++) {
      var y = y0 + 0.24 + c * ((y1 - y0) / courses);
      var n = Math.max(1, Math.floor(len / 0.95));
      for (var i = 0; i < n; i++) {
        var tt = (i + 0.5 + (c % 2) * 0.45) / n;
        tt = (tt % 1);
        var bw = (len / n) * 0.88;
        var bh = 0.34;
        var bd = 0.07 + ((i + c * 3) % 4) * 0.018;
        var x = x0 + dx * tt + nx * (0.02 + bd * 0.5);
        var z = z0 + dz * tt + nz * (0.02 + bd * 0.5);
        var sx, sz;
        if (Math.abs(nx) > 0.5) { sx = bd; sz = bw; }
        else { sx = bw; sz = bd; }
        blockData.push([x, y, z, sx, bh, sz]);
      }
    }
  }
  // south outer concrete (x -20..9 at z=20) — the cut face viewers see
  pushCourse(-20, 20, 9, 20, -4.7, -0.05, 0, 1);
  // west outer
  pushCourse(-20, -20, -20, 20, -4.7, -0.05, -1, 0);
  // north outer land
  pushCourse(-20, -20, -3, -20, -4.7, -0.05, 0, -1);
  // quay inner wall facing water (+x)
  pushCourse(-3, -12.1, -3, 4.9, -4.5, -0.05, 1, 0);
  // embankment face toward harbor (-z) along z=5, x=-3..4.2 (high) and platform face is lower
  pushCourse(-3, 5, 4.2, 5, -4.5, -0.05, 0, -1);
  pushCourse(4.2, 5, 9, 5, -4.5, -0.7, 0, -1);
  // east face of foreground into SE water
  pushCourse(9, 5, 9, 20, -4.5, -0.05, 1, 0);
  // breakwater sides
  pushCourse(-3, -12.2, 13, -12.2, -4.5, 0.2, 0, 1);
  pushCourse(13, -15.2, 13, -12.2, -4.5, 0.2, 1, 0);
  pushCourse(-3, -15.2, 13, -15.2, -4.5, 0.2, 0, -1);

  var blockMesh = new THREE.InstancedMesh(HR.GEO.box, HR.mat('#d9dfdc', { wet: 0.62, shadow: '#7b9aa2' }), blockData.length);
  var dummy = new THREE.Object3D();
  var bcol = new Float32Array(blockData.length * 3);
  blockData.forEach(function (b, i) {
    dummy.position.set(b[0], b[1], b[2]);
    dummy.scale.set(b[3], b[4], b[5]);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    blockMesh.setMatrixAt(i, dummy.matrix);
    var shade = 0.86 + (i % 7) * 0.02;
    bcol[i * 3] = 0.82 * shade;
    bcol[i * 3 + 1] = 0.85 * shade;
    bcol[i * 3 + 2] = 0.83 * shade;
  });
  blockMesh.instanceColor = new THREE.InstancedBufferAttribute(bcol, 3);
  blockMesh.instanceMatrix.needsUpdate = true;
  scene.add(blockMesh);

  // tide lines
  function tide(x0, z0, x1, z1, y, nx, nz, col, thick) {
    var mx = (x0 + x1) / 2 + nx * 0.06, mz = (z0 + z1) / 2 + nz * 0.06;
    var len = Math.hypot(x1 - x0, z1 - z0);
    var sx = Math.abs(nx) > 0.5 ? thick : len;
    var sz = Math.abs(nz) > 0.5 ? thick : len;
    HR.box(scene, sx, 0.07 + HR.rand() * 0.05, sz, mx, y + (HR.rand() - 0.5) * 0.08, mz, col, { noLine: true, wet: 0.3 });
  }
  [[0, 1], [1, 0], [0, -1]].forEach(function () {});
  tide(-20, 20, 9, 20, -1.35, 0, 1, '#8e7f68', 0.06);
  tide(-20, 20, 9, 20, -2.15, 0, 1, '#6f8e96', 0.08);
  tide(-20, 20, 9, 20, -3.15, 0, 1, '#5e7078', 0.07);
  tide(-3, -12, -3, 4.8, -1.55, 1, 0, '#8a7964', 0.06);
  tide(-3, -12, -3, 4.8, -2.4, 1, 0, '#6a8b93', 0.07);
  tide(-3, -12, -3, 4.8, -3.3, 1, 0, '#547078', 0.06);
  tide(9, 5, 9, 20, -1.7, 1, 0, '#867564', 0.06);
  tide(9, 5, 9, 20, -2.6, 1, 0, '#688892', 0.07);
  tide(-20, -20, -20, 20, -2.2, -1, 0, '#6c8a92', 0.07);
  tide(-20, -20, -3, -20, -1.9, 0, -1, '#7d8f86', 0.06);

  // barnacles + oysters
  var barnGeo = new THREE.ConeGeometry(1, 1, 5);
  barnGeo = barnGeo.toNonIndexed();
  barnGeo.computeVertexNormals();
  var barnCount = 180;
  var barn = new THREE.InstancedMesh(barnGeo, HR.mat('#ddd4c6', { wet: 0.2 }), barnCount);
  var bi = 0;
  function scatterBarn(x0, z0, x1, z1, y0, y1, nx, nz, count) {
    for (var i = 0; i < count && bi < barnCount; i++, bi++) {
      var tt = HR.rand();
      var x = HR.lerp(x0, x1, tt) + nx * 0.09;
      var z = HR.lerp(z0, z1, tt) + nz * 0.09;
      var y = HR.lerp(y0, y1, HR.rand());
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.055 + HR.rand() * 0.055);
      var dir = new THREE.Vector3(nx, HR.rand() * 0.3, nz).normalize();
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      dummy.updateMatrix();
      barn.setMatrixAt(bi, dummy.matrix);
    }
  }
  scatterBarn(-18, 20, 8, 20, -4.3, -2.6, 0, 1, 50);
  scatterBarn(-3, -10, -3, 4, -4.2, -2.4, 1, 0, 40);
  scatterBarn(9, 6, 9, 18, -4.2, -2.5, 1, 0, 30);
  scatterBarn(-20, -16, -20, 16, -4.2, -2.7, -1, 0, 30);
  scatterBarn(4, 5, 8.5, 5, -4.1, -2.2, 0, -1, 20);
  while (bi < barnCount) {
    dummy.position.set(0, -20, 0);
    dummy.scale.setScalar(0.0001);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    barn.setMatrixAt(bi++, dummy.matrix);
  }
  barn.instanceMatrix.needsUpdate = true;
  scene.add(barn);

  for (var oi = 0; oi < 26; oi++) {
    var ox = -16 + HR.rand() * 22;
    if (ox > 8.5) ox = 8.5;
    HR.mesh(HR.GEO.sphereSm, '#e7e0d4', scene, {
      pos: [ox, -3.6 - HR.rand() * 0.6, 20.08],
      scale: [0.08 + HR.rand() * 0.06, 0.03, 0.05],
      noLine: true
    });
  }

  // ladders + mooring rings
  function ladder(x, z, rotY, y0, y1) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    var h = y1 - y0;
    HR.box(g, 0.04, h, 0.04, -0.16, (y0 + y1) / 2, 0, RUST, { wet: 0.25 });
    HR.box(g, 0.04, h, 0.04, 0.16, (y0 + y1) / 2, 0, RUST, { wet: 0.25 });
    var steps = Math.floor(h / 0.32);
    for (var i = 0; i < steps; i++) {
      HR.box(g, 0.36, 0.03, 0.03, 0, y0 + 0.2 + i * 0.32, 0, '#8d5340', { noLine: true });
    }
    scene.add(g);
  }
  ladder(6.4, 20.06, 0, -3.8, 0.1);
  ladder(-2.92, -2.2, Math.PI / 2, -3.6, 0.05);
  function ring(x, y, z, rotY) {
    var m = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), HR.mat(RUST, { wet: 0.3 }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    scene.add(m);
  }
  ring(2.2, -0.7, 20.1, 0);
  ring(10.6, -1.35, 20.12, 0);
  ring(-4, -1.6, 20.1, 0);
  // props sitting in the south-wall cross-section view
  torusMesh(0.52, 0.16, 11.8, -3.95, 17.6, '#2c3034');
  rock(10.6, -4.28, 17.4, 0.36, '#8b928c');
  rock(13.2, -4.32, 15.8, 0.26, '#6f7874');
  rock(11.4, -4.3, 15.2, 0.18, '#9aa29c');
  kelp(12.4, 16.9, 0.95, 2.1, '#24856e');
  kelp(10.8, 15.4, 0.72, 0.6, '#3aa088');
  for (var si = 0; si < 9; si++) {
    var sl = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 10), HR.mat('#5c6568', { wet: 0.45 }));
    sl.position.set(12.4 + si * 0.18, -3.85, 16.8 + (si % 2) * 0.05);
    sl.rotation.set((si % 2) * Math.PI * 0.5, 0.2, 0);
    scene.add(sl);
  }
  for (var bk = 0; bk < 14; bk++) {
    HR.mesh(HR.GEO.cone, bk % 3 ? '#ddd4c6' : '#efe6d4', scene, {
      pos: [8.4 + (bk % 7) * 0.72, -2.7 - (bk % 3) * 0.45, 20.14],
      scale: 0.055 + (bk % 3) * 0.012,
      rot: [Math.PI / 2, 0, (bk % 5) * 0.2],
      noLine: true
    });
  }
  ladder(11.2, 20.08, 0, -3.6, 0.15);
  ring(-2.88, -0.85, 1.4, Math.PI / 2);
  ring(-2.88, -1.7, -6.2, Math.PI / 2);

  // ---------- tetrapods ----------
  function tetrapod(x, y, z, s, seed) {
    var g = new THREE.Group();
    var dirs = [new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, -1, -1), new THREE.Vector3(-1, 1, -1), new THREE.Vector3(-1, -1, 1)];
    var geo = new THREE.CylinderGeometry(0.18 * s, 0.36 * s, 1.05 * s, 6);
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();
    var edges = new THREE.EdgesGeometry(geo, 28);
    dirs.forEach(function (d, i) {
      d.normalize();
      var m = new THREE.Mesh(geo, HR.mat(i % 2 ? '#e7eeec' : '#c9d2d0', { wet: 0.45 }));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      m.position.copy(d).multiplyScalar(0.42 * s);
      m.add(new THREE.LineSegments(edges, HR.lineMat));
      g.add(m);
    });
    g.position.set(x, y, z);
    g.rotation.set(seed, seed * 1.3, seed * 0.6);
    scene.add(g);
    return g;
  }
  [[12.6, -0.7, -14.6, 0.85, 0.2], [13.5, -0.85, -13.1, 0.72, 1.1], [11.4, -0.6, -14.9, 0.66, 2.2],
    [14.2, -0.95, -14.2, 0.78, 0.6], [12.2, -0.45, -13.4, 0.55, 1.7], [15.1, -1.0, -15.0, 0.7, 2.8],
    [17.2, -0.85, 17.6, 0.8, 0.4], [18.4, -0.7, 16.4, 0.62, 1.4], [16.4, -0.55, 18.5, 0.7, 2.1],
    [18.8, -1.0, 18.6, 0.58, 0.9], [15.6, -0.9, 16.8, 0.5, 1.8]].forEach(function (p) {
    tetrapod(p[0], p[1], p[2], p[3], p[4]);
  });

  function foam(x, z, s, ph) {
    var m = HR.mesh(HR.GEO.sphereSm, '#f7fffe', scene, {
      pos: [x, HR.WATER_Y + 0.02, z], scale: [s, s * 0.35, s * 0.8], noLine: true,
      material: new THREE.MeshBasicMaterial({ color: 0xf4fffd, transparent: true, opacity: 0.85, depthWrite: false })
    });
    m.renderOrder = 5;
    W.foams.push({ m: m, x: x, z: z, s: s, ph: ph });
  }
  [[12.8, -14.2], [13.6, -13.6], [11.8, -14.4], [14.4, -14.8], [17.4, 17.2], [18.2, 17.8], [16.6, 17.6], [18.6, 16.8]].forEach(function (p, i) {
    foam(p[0], p[1], 0.28 + (i % 3) * 0.08, i);
  });

  // ---------- shoreline foam strip ----------
  (function () {
    var pts = [[-3, 4.95], [4.2, 4.95], [9, 4.95], [9, 8], [9, 14], [9, 19.6], [-3, -12.15], [4, -12.15], [10, -12.15], [13, -13.6]];
    // built as short dashes along inner waterline of the quay and east edge
    var path = [[-2.85, 4.2], [-2.85, 1], [-2.85, -2], [-2.85, -5], [-2.85, -8], [-2.85, -11.4],
      [0, -12.05], [5, -12.05], [10, -12.05], [12.7, -12.5],
      [4.5, 4.85], [7, 4.85], [9.15, 7], [9.15, 12], [9.15, 17]];
    path.forEach(function (p, i) {
      var m = new THREE.Mesh(HR.GEO.sphereSm, new THREE.MeshBasicMaterial({ color: 0xf7fffe, transparent: true, opacity: 0.7, depthWrite: false }));
      m.position.set(p[0], HR.WATER_Y + 0.03, p[1]);
      m.scale.set(0.35, 0.08, 0.18);
      m.renderOrder = 5;
      scene.add(m);
      W.foams.push({ m: m, x: p[0], z: p[1], s: 0.34, ph: i * 0.4, line: true });
    });
  })();

  // ---------- hill ----------
  function hillH(x, z) {
    var dx = x + 13.2, dz = z + 16.5;
    var h = 4.05 * Math.exp(-(dx * dx + dz * dz) / 20.5);
    var fadeX = 1 - HR.smooth(-8.4, -3.2, x);
    var fadeZ = 1 - HR.smooth(-15.6, -13.05, z);
    var fadeW = HR.smooth(-19.5, -17.4, x);
    var fadeN = HR.smooth(-19.5, -17.6, z);
    return Math.max(0, h * fadeX * fadeZ * fadeW * fadeN);
  }
  HR.hillH = hillH;
  (function () {
    var geo = new THREE.PlaneGeometry(18, 10, 28, 16);
    geo.rotateX(-Math.PI / 2);
    var p = geo.attributes.position;
    var col = new Float32Array(p.count * 3);
    for (var i = 0; i < p.count; i++) {
      var x = p.getX(i) - 13.2;
      var z = p.getZ(i) - 16.5;
      var hh = hillH(x, z);
      if (x > -3.05 || z > -13.02 || x < -19.85 || z < -19.85) hh = -0.45;
      p.setY(i, hh);
      p.setX(i, x);
      p.setZ(i, z);
      var g = 0.55 + hh * 0.06;
      var rockv = hh < 0.35 ? 0.35 : 0;
      col[i * 3] = 0.45 * g + rockv * 0.5;
      col[i * 3 + 1] = 0.68 * g + rockv * 0.4;
      col[i * 3 + 2] = 0.42 * g + rockv * 0.35;
    }
    geo.computeVertexNormals();
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // custom mat ignores vertex colors; tint the mesh a foliage green and let normals do toon
    var m = new THREE.Mesh(geo, HR.mat('#7eae78', { wet: 0.15, shadow: '#4f7f86' }));
    m.position.set(0, 0.02, 0);
    scene.add(m);
  })();

  function tree(x, z, s) {
    var y = hillH(x, z);
    if (y < 0.25) return;
    var g = new THREE.Group();
    g.position.set(x, y, z);
    HR.cyl(g, 0.06 * s, 0.09 * s, 0.55 * s, 0, 0.27 * s, 0, '#6d5344', { noLine: true });
    var cols = ['#8fbf86', '#69a06a', '#7eb37a'];
    for (var i = 0; i < 3; i++) {
      var cone = HR.mesh(HR.GEO.cone, cols[i], g, {
        pos: [0, 0.55 * s + i * 0.28 * s, 0],
        scale: [(0.55 - i * 0.1) * s, 0.48 * s, (0.55 - i * 0.1) * s],
        edges: HR.GEO.coneEdges
      });
    }
    scene.add(g);
    W.trees.push(g);
  }
  [[-16.5, -17.8, 1.3], [-12.4, -17.2, 1.15], [-15.2, -15.4, 1.0], [-10.6, -16.2, 0.9],
    [-17.6, -15.8, 0.85], [-13.8, -18.6, 1.05], [-11.2, -14.8, 0.75], [-18.4, -18.2, 0.95],
    [-9.4, -17.6, 0.8], [-16.8, -14.6, 0.7], [-12.8, -15.2, 0.82], [-14.6, -19.0, 0.88]].forEach(function (t) {
    tree(t[0], t[1], t[2]);
  });

  HR.tileMap = HR.makeCanvas(128, 64, function (g, w, h) {
    g.fillStyle = '#667480';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#46525c';
    g.lineWidth = 2;
    for (var y = 6; y < h; y += 8) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
  });

  function house(x, z, w, d, h, rot) {
    var y = hillH(x, z);
    var g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    HR.box(g, w, h, d, 0, h / 2, 0, '#e6d7bc', { wet: 0.12, shadow: '#7f96a0' });
    var shape = new THREE.Shape();
    shape.moveTo(-w * 0.62, 0); shape.lineTo(w * 0.62, 0); shape.lineTo(0, h * 0.48); shape.closePath();
    var roofG = new THREE.ExtrudeGeometry(shape, { depth: d * 1.15, bevelEnabled: false });
    roofG.translate(0, 0, -d * 0.575);
    roofG.computeVertexNormals();
    HR.mesh(roofG, '#5e6d78', g, { pos: [0, h, 0], map: HR.tileMap, edges: new THREE.EdgesGeometry(roofG, 24) });
    // door
    HR.box(g, w * 0.28, h * 0.55, 0.06, 0, h * 0.28, d / 2 + 0.02, '#8d6248', { noLine: true });
    // glowing windows — lights left on
    var winMat = new THREE.MeshBasicMaterial({ color: 0xffe1a8 });
    function win(px, py, pz) {
      var m = new THREE.Mesh(HR.GEO.plane, winMat);
      m.position.set(px, py, pz);
      m.scale.set(w * 0.16, h * 0.18, 1);
      g.add(m);
      HR.box(g, w * 0.2, h * 0.22, 0.04, px, py, pz - 0.01, '#6e5438', { noLine: true });
    }
    win(-w * 0.22, h * 0.55, d / 2 + 0.03);
    win(w * 0.22, h * 0.55, d / 2 + 0.03);
    // chimney
    HR.box(g, 0.18, 0.35, 0.18, w * 0.25, h + 0.28, -d * 0.1, '#b7a18e', { noLine: true });
    scene.add(g);
    // contact shadow
    var sh = new THREE.Mesh(HR.GEO.plane, W._shadowMat || (W._shadowMat = shadowMat()));
    sh.rotation.x = -Math.PI / 2;
    sh.position.set(x, y + 0.03, z);
    sh.scale.set(w * 1.3, d * 1.3, 1);
    sh.renderOrder = 1;
    scene.add(sh);
  }
  function shadowMat() {
    if (HR._sh) return HR._sh;
    var tex = HR.makeCanvas(64, 64, function (g) {
      var grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      grd.addColorStop(0, 'rgba(50,90,100,0.45)');
      grd.addColorStop(1, 'rgba(50,90,100,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    });
    HR._sh = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0x4a7c88 });
    return HR._sh;
  }
  W._shadowMat = shadowMat();
  function blob(x, y, z, sx, sz) {
    var m = new THREE.Mesh(HR.GEO.plane, W._shadowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.scale.set(sx, sz, 1);
    m.renderOrder = 1;
    scene.add(m);
    return m;
  }
  house(-15.4, -17.1, 1.7, 1.45, 1.25, 0.5);
  house(-12.2, -16.0, 1.35, 1.2, 1.05, 0.9);
  house(-17.2, -15.6, 1.15, 1.05, 0.95, 0.2);

  // distant breakwater + mist
  HR.box(scene, 16.5, 0.85, 0.55, 8.2, -1.55, -18.35, '#b7c9cc', { wet: 0.3, noLine: true });
  for (var pi = 0; pi < 8; pi++) {
    HR.box(scene, 0.08, 0.55, 0.08, 1.2 + pi * 2, -0.85, -18.35, '#9eb0b4', { noLine: true });
  }
  for (var mi = 0; mi < 4; mi++) {
    var mm = new THREE.Mesh(HR.GEO.plane, new THREE.MeshBasicMaterial({
      color: 0xe9f6f6, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide
    }));
    mm.position.set(4 + mi * 3, -0.4, -17.2 - (mi % 2));
    mm.scale.set(6, 1.4, 1);
    mm.renderOrder = 3;
    scene.add(mm);
    W.mist.push(mm);
  }

  // store partial API for props/sim
  HR._blob = blob;
  HR._glassRain = glassRain;
  HR._CON = CON;
  HR._CONW = CONW;
  HR._WOOD = WOOD;
  HR._WOODD = WOODD;
  HR._RUST = RUST;
  HR._BLACK = BLACK;
  HR._WHITE = WHITE;
  HR._TEAL = TEAL;
  HR._DEEP = DEEP;
  HR._gmat = gmat;
  HR._dummy = dummy;
})();
