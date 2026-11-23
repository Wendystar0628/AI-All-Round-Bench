/* Boats, buildings, props, creatures, and weather meshes. */
(function () {
  var scene = HR.scene;
  var W = HR.W;
  var A = HR.A;
  var CON = HR._CON, CONW = HR._CONW, WOOD = HR._WOOD, WOODD = HR._WOODD;
  var RUST = HR._RUST, BLACK = HR._BLACK, WHITE = HR._WHITE;

  function reflMat(color, phase) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: HR.U.uTime,
        uPhase: { value: phase || 0 },
        uSunVis: HR.U.uSunVis,
        uCloudCenter: HR.U.uCloudCenter,
        uCloudDir: HR.U.uCloudDir,
        uCloudAmt: HR.U.uCloudAmt,
        uAlpha: { value: 0.92 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: [
        'uniform float uTime; uniform float uPhase; varying vec2 vUv;',
        'void main(){',
        '  vec3 p = position;',
        '  float w1 = sin(p.x * 1.8 + uTime * 1.15 + uPhase);',
        '  float w2 = sin(p.z * 2.4 - uTime * 0.85 + uPhase * 1.7);',
        '  p.x += (w1 * 0.55 + w2 * 0.35) * 0.22;',
        '  p.z += w2 * 0.16;',
        '  p.y += w1 * 0.012;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
        '  vUv = uv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uAlpha; uniform float uSunVis;',
        'uniform vec3 uCloudCenter; uniform vec2 uCloudDir; uniform float uCloudAmt;',
        'void main(){',
        '  vec4 w = vec4(0.0);',
        '  float band = exp(-pow(abs(uCloudAmt), 2.0) * 0.0);',
        '  vec3 col = uColor * mix(0.78, 1.0, uSunVis);',
        '  gl_FragColor = vec4(col, uAlpha);',
        '}'
      ].join('\n')
    });
  }

  function addStrips(parent, L, B, phase, cabin) {
    var cols = [HR._DEEP, HR._TEAL, '#f4f8f6', HR._DEEP];
    var n = 4;
    for (var i = 0; i < n; i++) {
      var z = -L * 0.36 + i * (L * 0.78 / n);
      var geo = new THREE.BoxGeometry(B * 0.95, 0.012, L * 0.7 / n * 0.9);
      var m = new THREE.Mesh(geo, reflMat(cols[i % cols.length], phase + i));
      m.position.set(0, -0.28 - 0.02 * i, z);
      m.renderOrder = 3;
      parent.add(m);
    }
    if (cabin) {
      var c = new THREE.Mesh(new THREE.BoxGeometry(B * 0.48, 0.012, L * 0.22), reflMat('#f7fbfa', phase + 2.2));
      c.position.set(0, -0.24, -L * 0.02);
      c.renderOrder = 3;
      parent.add(c);
    }
  }

  function lifeRing(parent, x, y, z, ry) {
    var geo = new THREE.TorusGeometry(0.16, 0.045, 8, 18);
    var mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vL; void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'varying vec3 vL;',
        'void main(){',
        '  float a = atan(vL.y, vL.x);',
        '  float band = step(0.5, fract(a / 1.5708));',
        '  vec3 col = mix(vec3(0.93, 0.46, 0.18), vec3(0.97, 0.98, 0.96), band);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry || 0;
    parent.add(m);
    return m;
  }

  function screen(parent, x, y, z, w, h, ry, kind) {
    var geo = new THREE.PlaneGeometry(w, h);
    var mat = new THREE.ShaderMaterial({
      uniforms: { uTime: HR.U.uTime, uKind: { value: kind || 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform float uTime; uniform float uKind; varying vec2 vUv;',
        'void main(){',
        '  vec2 p = vUv - 0.5;',
        '  vec3 col = vec3(0.04, 0.16, 0.12);',
        '  if (uKind < 0.5) {',
        '    float ang = atan(p.y, p.x);',
        '    float sweep = fract(ang / 6.28318 - uTime * 0.25);',
        '    float line = smoothstep(0.0, 0.015, sweep) * smoothstep(0.12, 0.02, sweep);',
        '    col += vec3(0.25, 0.9, 0.55) * line;',
        '    float r = length(p);',
        '    col += vec3(0.1, 0.35, 0.25) * smoothstep(0.02, 0.0, abs(r - 0.18));',
        '    col += vec3(0.1, 0.35, 0.25) * smoothstep(0.02, 0.0, abs(r - 0.32));',
        '    col += vec3(0.7, 1.0, 0.8) * smoothstep(0.03, 0.0, length(p - vec2(0.12, 0.08)));',
        '  } else {',
        '    float wave = sin(p.x * 18.0 + uTime * 2.0) * 0.12;',
        '    col += vec3(0.35, 1.0, 0.6) * smoothstep(0.02, 0.0, abs(p.y - wave));',
        '    col += vec3(0.05, 0.2, 0.12);',
        '  }',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    return m;
  }

  function furnishCabin(rock, spec) {
    var g = new THREE.Group();
    var cw = Math.max(1.15, spec.B * 0.82);
    var cl = Math.max(1.15, spec.L * 0.36);
    var ch = spec.small ? 0.92 : 1.18;
    g.position.set(0.02, 0.3, spec.small ? 0.05 : -0.1);
    rock.add(g);
    var wallC = '#f3f0ea';
    var woodI = '#c6a27c';
    HR.box(g, cw, 0.05, cl, 0, 0.03, 0, woodI, { wet: 0.35, noLine: true });
    // roof overhang so the house reads as a cabin, not a box flush with the walls
    HR.box(g, cw * 1.14, 0.04, cl * 1.12, 0, ch + 0.02, 0, '#f7f4ee', { wet: 0.15 });
    // port wall
    HR.box(g, 0.045, ch, cl, -cw / 2, ch / 2, 0, wallC);
    // bow wall with window opening (built as frame)
    HR.box(g, cw, ch * 0.28, 0.045, 0, ch * 0.86, -cl / 2, wallC, { noLine: true });
    HR.box(g, cw, ch * 0.32, 0.045, 0, ch * 0.18, -cl / 2, wallC, { noLine: true });
    HR.box(g, cw * 0.18, ch, 0.045, -cw * 0.4, ch / 2, -cl / 2, wallC, { noLine: true });
    HR.box(g, cw * 0.18, ch, 0.045, cw * 0.4, ch / 2, -cl / 2, wallC, { noLine: true });
    var winG = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.46, ch * 0.36), HR.glass);
    winG.position.set(0, ch * 0.52, -cl / 2 + 0.02);
    g.add(winG);
    // starboard window
    HR.box(g, 0.04, ch * 0.22, cl, cw / 2, ch * 0.88, 0, wallC, { noLine: true });
    HR.box(g, 0.04, ch * 0.28, cl, cw / 2, ch * 0.16, 0, wallC, { noLine: true });
    HR.box(g, 0.04, ch * 0.5, cl * 0.18, cw / 2, ch * 0.5, -cl * 0.38, wallC, { noLine: true });
    HR.box(g, 0.04, ch * 0.5, cl * 0.18, cw / 2, ch * 0.5, cl * 0.38, wallC, { noLine: true });
    var sideWin = new THREE.Mesh(new THREE.PlaneGeometry(cl * 0.48, ch * 0.42), HR.glass);
    sideWin.position.set(cw / 2 - 0.01, ch * 0.5, 0);
    sideWin.rotation.y = Math.PI / 2;
    g.add(sideWin);
    // stern door ajar
    var doorPivot = new THREE.Group();
    doorPivot.position.set(-cw * 0.22, 0, cl / 2);
    doorPivot.rotation.y = -0.95;
    g.add(doorPivot);
    HR.box(doorPivot, cw * 0.42, ch * 0.78, 0.04, cw * 0.2, ch * 0.4, 0, '#d7c3a4', { wet: 0.1 });
    // remaining stern frame
    HR.box(g, cw * 0.28, ch, 0.045, cw * 0.36, ch / 2, cl / 2, wallC, { noLine: true });
    HR.box(g, cw * 0.5, ch * 0.18, 0.045, -cw * 0.1, ch * 0.9, cl / 2, wallC, { noLine: true });

    // helm wheel
    var wheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 14), HR.mat(WOODD, { wet: 0.1 }));
    wheel.position.set(-cw * 0.08, ch * 0.5, -cl * 0.32);
    wheel.rotation.set(0.85, -1.05, 0.15);
    g.add(wheel);
    for (var k = 0; k < 3; k++) {
      var sp = HR.box(wheel, 0.018, 0.28, 0.018, 0, 0, 0, WOODD, { noLine: true });
      sp.rotation.z = k * Math.PI / 3;
    }
    HR.sph(wheel, 0.035, 0, 0, 0, '#f0d7a0', { noLine: true });

    // dash
    HR.box(g, cw * 0.7, 0.08, 0.22, 0, ch * 0.36, -cl * 0.36, '#243036', { noLine: true });
    var radar = screen(g, cw * 0.14, ch * 0.48, -cl * 0.3, 0.2, 0.15, 0.28, 0);
    screen(g, -cw * 0.16, ch * 0.46, -cl * 0.28, 0.15, 0.11, 0.18, 1);
    A.radarLocal = radar;

    // chart clipboard on port wall
    var chart = HR.makeCanvas(256, 192, function (ctx, w, h) {
      ctx.fillStyle = '#efe6d2';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#7ea0a8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(20, 150); ctx.quadraticCurveTo(80, 40, 150, 80); ctx.quadraticCurveTo(200, 110, 230, 30);
      ctx.stroke();
      ctx.fillStyle = '#3d5c66';
      ctx.font = "24px 'Microsoft YaHei',sans-serif";
      ctx.fillText('海图', 16, 32);
      ctx.font = "20px 'Microsoft YaHei',sans-serif";
      ctx.fillText('潮汐  满 04:18', 16, 168);
      ctx.fillText('干 10:42   满 16:55', 16, 188);
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = '#8a7a62';
      ctx.fillRect(40, 50, 80, 30);
    });
    var chartM = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), new THREE.MeshBasicMaterial({ map: chart }));
    chartM.position.set(-cw / 2 + 0.04, ch * 0.52, 0.02);
    chartM.rotation.y = Math.PI / 2;
    g.add(chartM);
    HR.box(g, 0.02, 0.3, 0.38, -cw / 2 + 0.03, ch * 0.52, 0.02, '#8d9390', { noLine: true });

    // thermos + enamel cup sit on the dash so the cabin close-up includes them
    var dashTop = ch * 0.36 + 0.04;
    HR.cyl(g, 0.05, 0.055, 0.16, cw * 0.2, dashTop + 0.08, -cl * 0.28, '#d24b3a', { wet: 0.4 });
    HR.cyl(g, 0.04, 0.046, 0.035, cw * 0.2, dashTop + 0.175, -cl * 0.28, '#f2f2f0', { noLine: true });
    HR.cyl(g, 0.012, 0.012, 0.05, cw * 0.25, dashTop + 0.14, -cl * 0.28, '#c9c2b4', { rot: [0, 0, Math.PI / 2], noLine: true });
    HR.cyl(g, 0.038, 0.032, 0.06, cw * 0.33, dashTop + 0.03, -cl * 0.2, '#f4f7f2', { wet: 0.25 });
    HR.box(g, 0.016, 0.04, 0.012, cw * 0.36, dashTop + 0.045, -cl * 0.2, '#f4f7f2', { noLine: true });

    // yellow raincoat: body, sleeves, belt, hood, hanging from a hook
    HR.box(g, 0.035, 0.035, 0.035, -cw * 0.22, ch - 0.05, cl * 0.16, '#8d9390', { noLine: true });
    var coat = new THREE.Group();
    coat.position.set(-cw * 0.22, ch * 0.5, cl * 0.18);
    coat.rotation.y = 0.55;
    g.add(coat);
    HR.box(coat, 0.18, 0.5, 0.04, 0, -0.06, 0, '#f0c431', { wet: 0.25 });
    HR.box(coat, 0.22, 0.07, 0.045, 0, -0.28, 0.004, '#e4b42c', { wet: 0.2 });
    HR.box(coat, 0.185, 0.02, 0.046, 0, -0.08, 0.008, '#b8892a', { noLine: true });
    var sleeveL = new THREE.Group();
    sleeveL.position.set(-0.1, 0.06, 0);
    sleeveL.rotation.z = 0.22;
    coat.add(sleeveL);
    HR.box(sleeveL, 0.045, 0.3, 0.03, 0, -0.14, 0, '#f0c431', { wet: 0.2 });
    var sleeveR = new THREE.Group();
    sleeveR.position.set(0.1, 0.04, 0.01);
    sleeveR.rotation.z = -0.18;
    coat.add(sleeveR);
    HR.box(sleeveR, 0.045, 0.26, 0.03, 0, -0.12, 0, '#e8bc32', { wet: 0.2 });
    var hood = new THREE.Group();
    hood.position.set(0.05, 0.18, 0.02);
    hood.rotation.z = -0.9;
    coat.add(hood);
    HR.box(hood, 0.09, 0.07, 0.05, 0, 0, 0, '#f2d35a', { noLine: true });
    coat.name = 'coat';
    W.coats = W.coats || [];
    W.coats.push(coat);

    // omamori + photos by the window
    var oma = HR.makeCanvas(64, 96, function (ctx) {
      ctx.fillStyle = '#c84040'; ctx.fillRect(0, 0, 64, 96);
      ctx.fillStyle = '#f0d78a'; ctx.fillRect(8, 8, 48, 20);
      ctx.fillStyle = '#fff6d8'; ctx.font = "18px 'Microsoft YaHei',sans-serif";
      ctx.fillText('御守', 12, 70);
    });
    var om = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.12), new THREE.MeshBasicMaterial({ map: oma, side: THREE.DoubleSide }));
    om.position.set(cw / 2 - 0.03, ch * 0.62, -cl * 0.16);
    om.rotation.y = -0.4;
    g.add(om);
    var photo = HR.makeCanvas(96, 72, function (ctx) {
      ctx.fillStyle = '#f7f1e4'; ctx.fillRect(0, 0, 96, 72);
      ctx.fillStyle = '#7eb8c4'; ctx.fillRect(6, 6, 84, 48);
      ctx.fillStyle = '#e8eef0';
      ctx.beginPath(); ctx.ellipse(40, 30, 16, 8, 0.3, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.ellipse(62, 34, 10, 5, -0.4, 0, 6.28); ctx.fill();
      ctx.fillStyle = '#333'; ctx.fillRect(6, 56, 84, 12);
    });
    var ph = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), new THREE.MeshBasicMaterial({ map: photo }));
    ph.position.set(cw / 2 - 0.025, ch * 0.58, 0.05);
    ph.rotation.y = Math.PI / 2;
    g.add(ph);
    var ph2 = ph.clone();
    ph2.position.z = 0.16;
    ph2.position.y = 0.52 * ch;
    g.add(ph2);

    // light shaft through side window
    var shaftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uInt: { value: 0.35 }, uTime: HR.U.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: [
        'uniform float uInt; uniform float uTime; varying vec2 vUv;',
        'void main(){',
        '  float e = smoothstep(0.5, 0.05, abs(vUv.x - 0.5));',
        '  float a = e * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.4, vUv.y);',
        '  gl_FragColor = vec4(1.0, 0.93, 0.75, a * uInt);',
        '}'
      ].join('\n')
    });
    for (var si = 0; si < 3; si++) {
      var shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 1.05), shaftMat);
      shaft.position.set(cw * 0.02, ch * 0.5, 0.02);
      shaft.rotation.y = si * Math.PI / 3;
      shaft.rotation.z = 0.4;
      shaft.renderOrder = 6;
      g.add(shaft);
    }
    W.shafts.push(shaftMat);

    // ceiling caustic
    var cauMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: HR.U.uTime, uSunVis: HR.U.uSunVis },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: [
        'uniform float uTime; uniform float uSunVis; varying vec2 vUv;',
        'void main(){',
        '  float c = sin(vUv.x * 28.0 + uTime * 0.8) * sin(vUv.y * 24.0 - uTime * 0.6);',
        '  float b = step(0.55, c);',
        '  gl_FragColor = vec4(0.85, 0.95, 0.9, b * 0.28 * uSunVis);',
        '}'
      ].join('\n')
    });
    var cau = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.9, cl * 0.9), cauMat);
    cau.rotation.x = Math.PI / 2;
    cau.position.set(0, ch - 0.03, 0);
    cau.renderOrder = 6;
    g.add(cau);
    W.caustics.push(cauMat);

    // shelf
    HR.box(g, 0.28, 0.03, 0.16, cw * 0.28, 0.1, cl * 0.14, woodI, { noLine: true });

    g.userData.cw = cw;
    return g;
  }

  function buildBoat(spec) {
    var root = new THREE.Group();
    root.position.set(spec.x, HR.WATER_Y, spec.z);
    root.rotation.y = spec.yaw || 0;
    var rock = new THREE.Group();
    root.add(rock);
    var hullGeo = HR.makeHull(spec.L, spec.B, spec.D);
    var hull = HR.mesh(hullGeo, WHITE, rock, { wet: 0.62, shadow: '#5d8d98', edges: new THREE.EdgesGeometry(hullGeo, 28) });
    // lift the sheer clear of the water so the topsides read; keel stays under
    hull.position.y = 0.24;
    // rust on the visible topside
    HR.box(rock, 0.16, 0.07, 0.2, spec.B * 0.28, 0.1, spec.L * 0.18, RUST, { noLine: true });
    HR.box(rock, 0.1, 0.05, 0.14, -spec.B * 0.26, 0.08, -spec.L * 0.12, '#8d4e36', { noLine: true });
    // rub rails on the sheer, not a deck plate
    HR.box(rock, 0.04, 0.045, spec.L * 0.62, spec.B * 0.47, 0.32, 0.06, '#e7eeec', { wet: 0.55 });
    HR.box(rock, 0.04, 0.045, spec.L * 0.62, -spec.B * 0.47, 0.32, 0.06, '#e4ebe8', { wet: 0.55 });
    // cleat
    var cleat = new THREE.Group();
    cleat.position.set(-spec.B * 0.48, 0.38, spec.L * 0.12);
    rock.add(cleat);
    HR.box(cleat, 0.16, 0.04, 0.05, 0, 0, 0, '#cfd6d4', { noLine: true });
    HR.box(cleat, 0.04, 0.06, 0.04, 0, 0.04, 0, '#cfd6d4', { noLine: true });

    if (spec.cabin) furnishCabin(rock, spec);

    // mast / antenna / radar
    if (spec.mast) {
      HR.cyl(rock, 0.025, 0.03, spec.mast, 0, 0.34 + spec.mast / 2, -spec.L * 0.28, '#eceff0', { wet: 0.2 });
      HR.box(rock, 0.45, 0.02, 0.02, 0, 0.34 + spec.mast * 0.72, -spec.L * 0.28, '#d5dbde', { noLine: true });
    }
    if (spec.antenna) {
      HR.cyl(rock, 0.012, 0.012, spec.antenna, spec.B * 0.15, 0.35 + spec.antenna / 2, -spec.L * 0.05, '#bfc6c8', { noLine: true });
    }
    if (spec.radar) {
      HR.cyl(rock, 0.05, 0.07, 0.12, 0, spec.cabin ? 1.56 : 0.62, -0.05, '#f4f7f6', { noLine: true });
      HR.sph(rock, 0.16, 0, spec.cabin ? 1.72 : 0.78, -0.05, '#f7fbfa', { noLine: true });
    }
    if (spec.shade) {
      HR.box(rock, 0.04, 0.62, 0.04, spec.B * 0.32, 0.64, spec.L * 0.22, BLACK, { noLine: true });
      HR.box(rock, 0.04, 0.62, 0.04, -spec.B * 0.32, 0.64, spec.L * 0.22, BLACK, { noLine: true });
      HR.box(rock, 0.04, 0.62, 0.04, spec.B * 0.32, 0.64, spec.L * 0.02, BLACK, { noLine: true });
      HR.box(rock, 0.04, 0.62, 0.04, -spec.B * 0.32, 0.64, spec.L * 0.02, BLACK, { noLine: true });
      HR.box(rock, spec.B * 0.7, 0.03, 0.28, 0, 0.96, spec.L * 0.12, '#d9ddd8', { wet: 0.3 });
      HR.box(rock, spec.B * 0.72, 0.02, 0.02, 0, 0.94, spec.L * 0.24, BLACK, { noLine: true });
    }
    // tire fenders on port side
    var fGeo = new THREE.TorusGeometry(0.14, 0.05, 6, 12);
    for (var fi = 0; fi < (spec.fenders || 2); fi++) {
      var fz = -spec.L * 0.22 + fi * spec.L * 0.28;
      var fm = new THREE.Mesh(fGeo, HR.mat('#2e3236', { wet: 0.15 }));
      fm.position.set(-spec.B * 0.5, 0.08, fz);
      fm.rotation.y = Math.PI / 2;
      rock.add(fm);
    }
    lifeRing(rock, spec.B * 0.46, 0.38, spec.L * 0.05, Math.PI / 2);
    if (!spec.small) lifeRing(rock, -spec.B * 0.2, 0.42, -spec.L * 0.36, 0.2);

    // rail
    if (spec.cabin) {
      HR.cyl(rock, 0.015, 0.015, 0.32, spec.B * 0.42, 0.48, spec.L * 0.3, '#dfe6e6', { noLine: true });
      HR.cyl(rock, 0.015, 0.015, 0.32, -spec.B * 0.42, 0.48, spec.L * 0.3, '#dfe6e6', { noLine: true });
      HR.box(rock, spec.B * 0.86, 0.02, 0.02, 0, 0.64, spec.L * 0.3, '#e7eeec', { noLine: true });
    }

    if (spec.outboard) {
      HR.box(rock, 0.16, 0.28, 0.2, 0, 0.3, spec.L * 0.42, '#3a4144', { wet: 0.2 });
      HR.box(rock, 0.08, 0.22, 0.08, 0, 0.02, spec.L * 0.48, '#2e3436', { noLine: true });
    }
    if (spec.oars) {
      HR.box(rock, 0.04, 0.02, spec.L * 0.7, spec.B * 0.1, 0.38, 0, WOOD, { rot: [0, 0.2, 0.1], noLine: true });
    }

    var refl = new THREE.Group();
    root.add(refl);
    addStrips(refl, spec.L, spec.B, spec.phase || 0, !!spec.cabin);

    // gunwale drip marker
    var drip = new THREE.Object3D();
    drip.position.set(spec.B * 0.4, 0.34, spec.L * 0.15);
    rock.add(drip);

    scene.add(root);
    HR._blob(spec.x, HR.WATER_Y + 0.01, spec.z, spec.L * 0.7, spec.B * 0.9);

    var boat = { root: root, rock: rock, refl: refl, spec: spec, cleat: cleat, drip: drip, home: { x: spec.x, z: spec.z, yaw: spec.yaw || 0 } };
    W.boats.push(boat);
    return boat;
  }

  // positions chosen so hulls sit in the basin with a gap to the quay at x=-3
  var traveler = buildBoat({
    x: -1.45, z: -8.05, yaw: 0, L: 5.2, B: 1.8, D: 0.62,
    cabin: true, mast: 1.7, antenna: 0.9, radar: true, fenders: 3, phase: 0.2, id: 'traveler'
  });
  W.traveler = traveler;
  var pleasure = buildBoat({
    x: -1.35, z: -2.35, yaw: 0, L: 4.5, B: 1.85, D: 0.6,
    cabin: true, antenna: 0.75, radar: true, shade: true, fenders: 2, phase: 1.1, id: 'pleasure'
  });
  W.pleasure = pleasure;
  buildBoat({
    x: -1.7, z: 1.45, yaw: 0.04, L: 3.15, B: 1.28, D: 0.52,
    cabin: true, small: true, mast: 1.15, antenna: 0.55, fenders: 2, phase: 2.0, id: 'small'
  });
  buildBoat({
    x: -1.95, z: 3.85, yaw: -0.08, L: 1.9, B: 0.82, D: 0.42,
    fenders: 1, outboard: true, oars: true, phase: 2.6, id: 'skiff'
  });

  // ---------- bollards ----------
  W.bollards = [];
  var bollardZs = [3.4, 1.1, -1.3, -3.7, -6.3, -8.7];
  bollardZs.forEach(function (z, i) {
    var g = new THREE.Group();
    g.position.set(-3.42, 0, z);
    HR.cyl(g, 0.16, 0.18, 0.12, 0, 0.06, 0, BLACK, { wet: 0.06 });
    HR.cyl(g, 0.09, 0.1, 0.5, 0, 0.34, 0, BLACK, { wet: 0.05 });
    HR.cyl(g, 0.05, 0.05, 0.28, 0, 0.58, 0, BLACK, { rot: [0, 0, Math.PI / 2], noLine: true, wet: 0.05 });
    HR.sph(g, 0.07, 0.14, 0.58, 0, BLACK, { noLine: true });
    HR.sph(g, 0.07, -0.14, 0.58, 0, BLACK, { noLine: true });
    scene.add(g);
    W.bollards.push(g);
    for (var c = 0; c < 3; c++) {
      var coil = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.038, 6, 14), HR.mat('#d4653a', { wet: 0.35 }));
      coil.position.set(0, 0.16 + c * 0.055, 0);
      coil.rotation.x = Math.PI / 2;
      coil.rotation.z = c * 0.5;
      g.add(coil);
    }
  });

  function makeRope(n) {
    var grp = new THREE.Group();
    var segs = [];
    for (var i = 0; i < n; i++) {
      var m = HR.cyl(grp, 1, 1, 1, 0, -10, 0, '#d4653a', { noLine: true, wet: 0.2 });
      segs.push(m);
    }
    scene.add(grp);
    return { g: grp, segs: segs, n: n };
  }
  // ropes from bollards 1,2,4,5 toward boats
  [[1, 1], [2, 0], [4, 0], [3, 2]].forEach(function (pair) {
    W.ropes.push({ rope: makeRope(10), bollard: pair[0], boat: pair[1] });
  });
  HR.ropeDry = HR.mat('#d4653a', { wet: 0.2 });
  HR.ropeWet = HR.mat('#7a3a28', { wet: 0.05, shadow: '#4e2e28' });

  // ---------- buoys ----------
  [[4.6, -6.2, '3'], [8.4, -1.6, '7'], [5.8, 2.4, '12'], [12.5, -8.4, '4']].forEach(function (b, i) {
    var g = new THREE.Group();
    g.position.set(b[0], HR.WATER_Y, b[2] ? b[1] : b[1]);
    var num = b[2];
    var z = b[1];
    g.position.set(b[0], HR.WATER_Y, z);
    HR.sph(g, 0.28, 0, 0.12, 0, i % 2 ? '#e36a32' : '#f2f5f3', { noLine: true, wet: 0.4 });
    HR.cyl(g, 0.06, 0.06, 0.35, 0, -0.1, 0, '#666', { noLine: true });
    var tex = HR.makeCanvas(128, 64, function (ctx) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#6a5428';
      ctx.font = "bold 40px 'Microsoft YaHei',sans-serif";
      ctx.globalAlpha = 0.75;
      ctx.fillText(num, 36, 46);
    });
    var plate = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
    plate.position.set(0, 0.18, 0.26);
    g.add(plate);
    scene.add(g);
    W.buoys.push({ g: g, x: b[0], z: z, ph: i });
  });

  // ---------- buildings ----------
  // fishery warehouse
  (function () {
    var x0 = -18.4, x1 = -12.0, z0 = 8.7, z1 = 13.6, h = 3.55;
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    HR.box(scene, w, 0.12, d, cx, 0.06, cz, '#c8b89a', { wet: 0.85 });
    // walls: west, north, south, east with door
    HR.box(scene, 0.12, h, d, x0, h / 2, cz, '#e4e0d8', { wet: 0.25 });
    HR.box(scene, w, h, 0.12, cx, h / 2, z0, '#e7e2da', { wet: 0.25 });
    // south wall with a high window slot
    HR.box(scene, w, 2.15, 0.12, cx, 1.075, z1, '#e7e2da', { wet: 0.25 });
    HR.box(scene, w, 0.55, 0.12, cx, h - 0.28, z1, '#e7e2da', { wet: 0.2 });
    HR.box(scene, 2.2, 0.85, 0.12, x0 + 1.1, 2.55, z1, '#e7e2da', { noLine: true });
    HR.box(scene, 2.2, 0.85, 0.12, x1 - 1.1, 2.55, z1, '#e7e2da', { noLine: true });
    var hw = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), HR.glass);
    hw.position.set(cx, 2.55, z1 + 0.02);
    scene.add(hw);
    // east wall around door
    HR.box(scene, 0.12, h, 1.0, x1, h / 2, z0 + 0.5, '#e4dfd6', { wet: 0.25 });
    HR.box(scene, 0.12, h, 1.1, x1, h / 2, z1 - 0.55, '#e4dfd6', { wet: 0.25 });
    HR.box(scene, 0.12, 0.85, d - 2.1, x1, h - 0.42, cz, '#e4dfd6', { noLine: true });
    // shutter slats rolled to the top half of the opening
    for (var s = 0; s < 7; s++) {
      HR.box(scene, 0.08, 0.1, 2.3, x1 + 0.02, 2.15 + (s % 2) * 0.0 + s * 0.11, cz, s % 2 ? '#c8c2b6' : '#b7b1a4', { noLine: true, wet: 0.4 });
    }
    // ceiling
    HR.box(scene, w - 0.2, 0.08, d - 0.2, cx, h - 0.02, cz, '#d9d3c8', { noLine: true });
    // interior stacks
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 2; c++) {
        HR.box(scene, 0.7, 0.28, 0.45, -17.2 + c * 0.75, 0.2 + r * 0.3, 10.2, r % 2 ? '#f4f7f5' : '#d9e4e8', { wet: 0.5 });
      }
    }
    for (r = 0; r < 4; r++) {
      HR.box(scene, 0.55, 0.22, 0.4, -16.3, 0.16 + r * 0.24, 12.2, '#f7faf8', { wet: 0.45 });
    }
    // freezer
    HR.box(scene, 1.1, 0.9, 0.7, -14.2, 0.5, 10.0, '#f4f6f5', { wet: 0.3 });
    HR.box(scene, 1.05, 0.08, 0.65, -14.2, 0.98, 9.85, '#e8eeed', { rot: [0.4, 0, 0], noLine: true });
    // scale
    HR.box(scene, 0.55, 0.08, 0.4, -14.6, 0.1, 12.4, '#bfc6c4', { noLine: true });
    HR.cyl(scene, 0.04, 0.04, 0.55, -14.6, 0.4, 12.55, '#9aa', { noLine: true });
    var dial = HR.makeCanvas(64, 64, function (ctx) {
      ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(48, 22); ctx.stroke();
    });
    var dialM = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ map: dial }));
    dialM.position.set(-14.6, 0.72, 12.62);
    dialM.rotation.y = Math.PI;
    scene.add(dialM);
    // rain boots hanging on the west wall
    function hangBoot(x, y, z, col) {
      var g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = 0.35;
      HR.box(g, 0.14, 0.34, 0.1, 0, -0.1, 0, col, { wet: 0.35 });
      HR.box(g, 0.14, 0.08, 0.22, 0, -0.28, 0.07, col, { wet: 0.35 });
      HR.box(g, 0.15, 0.04, 0.11, 0, 0.07, 0, '#f3efe4', { noLine: true });
      scene.add(g);
    }
    hangBoot(-18.22, 1.62, 9.75, '#e2b133');
    hangBoot(-18.22, 1.28, 10.15, '#3d6b4f');
    // blackboard
    var board = HR.makeCanvas(256, 160, function (ctx, w, h) {
      ctx.fillStyle = '#24342a'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#efe6c8';
      ctx.font = "28px 'Microsoft YaHei',sans-serif";
      ctx.fillText('本日拍卖', 16, 36);
      ctx.font = "22px 'Microsoft YaHei',sans-serif";
      ctx.fillText('竹荚鱼    420', 16, 74);
      ctx.fillText('鱿鱼      680', 16, 104);
      ctx.fillText('鲭        510', 16, 134);
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff'; ctx.fillRect(20, 50, 40, 6);
    });
    var bm = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.72), new THREE.MeshBasicMaterial({ map: board }));
    bm.position.set(-17.9, 1.7, 11.3);
    bm.rotation.y = Math.PI / 2;
    scene.add(bm);
    HR.box(scene, 0.06, 0.8, 1.25, -18.15, 1.7, 11.3, '#6e6254', { noLine: true });
    // ice cubes
    for (var ic = 0; ic < 8; ic++) {
      HR.box(scene, 0.12, 0.08, 0.1, -15.6 + (ic % 4) * 0.18, 0.1, 11.15 + (ic % 3) * 0.16, '#e7f4f6', {
        noLine: true, material: new THREE.MeshBasicMaterial({ color: 0xe9f7f8, transparent: true, opacity: 0.8 })
      });
    }
    // wet floor sheen
    var wetFloor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.4, d - 0.4), HR.mat('#b7c5c6', {
      wet: 1, op: 0.45, dw: false, shadow: '#7fa4aa'
    }));
    wetFloor.rotation.x = -Math.PI / 2;
    wetFloor.position.set(cx, 0.13, cz);
    wetFloor.renderOrder = 2;
    scene.add(wetFloor);
    // shaft from high south window
    var sMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uInt: { value: 0.4 }, uTime: HR.U.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'uniform float uInt; varying vec2 vUv; void main(){ float e=smoothstep(0.5,0.08,abs(vUv.x-0.5)); float a=e*smoothstep(0.0,0.12,vUv.y)*smoothstep(1.0,0.35,vUv.y); gl_FragColor=vec4(1.0,0.94,0.78,a*uInt); }'
    });
    for (var si2 = 0; si2 < 3; si2++) {
      var sh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.4), sMat);
      sh.position.set(cx, 1.65, cz + 0.2);
      sh.rotation.y = si2 * Math.PI / 3 + 0.4;
      sh.rotation.x = 0.55;
      sh.renderOrder = 6;
      scene.add(sh);
    }
    W.shafts.push(sMat);
    // glittering drops inside the shaft
    var drops = [];
    for (var di = 0; di < 10; di++) {
      var dm = new THREE.Mesh(HR.GEO.box, new THREE.MeshBasicMaterial({ color: 0xfff2d2, transparent: true, opacity: 0.8 }));
      dm.scale.set(0.012, 0.16, 0.012);
      scene.add(dm);
      drops.push({ m: dm, ph: di * 0.37, ox: (di % 5) * 0.18 - 0.4 });
    }
    W.shaftDrops = drops;
    // ceiling caustic
    var cauMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: HR.U.uTime, uSunVis: HR.U.uSunVis },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'uniform float uTime; uniform float uSunVis; varying vec2 vUv; void main(){ float c=sin(vUv.x*22.0+uTime*0.7)*sin(vUv.y*18.0-uTime*0.5); gl_FragColor=vec4(0.9,0.97,0.95, step(0.45,c)*0.22*uSunVis); }'
    });
    var cau = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), cauMat);
    cau.rotation.x = Math.PI / 2;
    cau.position.set(cx, h - 0.08, cz);
    cau.renderOrder = 6;
    scene.add(cau);
    W.caustics.push(cauMat);
    A.warehouseDoor = new THREE.Vector3(x1 + 1.6, 1.3, cz);
    A.warehouseIn = new THREE.Vector3(cx + 0.4, 1.35, cz);
    HR._blob(cx, 0.02, cz + d * 0.55, w * 0.8, 1.2);
  })();

  // waiting room — glass south & east
  (function () {
    var x0 = -19.3, x1 = -13.7, z0 = 14.55, z1 = 17.95, h = 2.85;
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
    HR.box(scene, w, 0.1, d, cx, 0.05, cz, '#d8c8ae', { wet: 0.55 });
    HR.box(scene, w, 0.1, d, cx, h, cz, '#e6e2da', { wet: 0.2 });
    HR.box(scene, 0.1, h, d, x0, h / 2, cz, '#e5dfd6', { wet: 0.2 });
    HR.box(scene, w, h, 0.1, cx, h / 2, z0, '#efeae2', { wet: 0.15 });
    // mullions
    for (var i = 0; i < 4; i++) {
      HR.box(scene, 0.06, h, 0.06, x0 + 0.4 + i * (w / 4), h / 2, z1, '#8d8376', { noLine: true });
    }
    HR.box(scene, w, 0.08, 0.06, cx, h - 0.04, z1, '#8d8376', { noLine: true });
    HR.box(scene, w, 0.08, 0.06, cx, 0.12, z1, '#8d8376', { noLine: true });
    var gS = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, h - 0.3), HR.glass);
    gS.position.set(cx, h / 2, z1 + 0.02);
    scene.add(gS);
    for (i = 0; i < 3; i++) {
      HR.box(scene, 0.06, h, 0.06, x1, h / 2, z0 + 0.3 + i * (d / 3), '#8d8376', { noLine: true });
    }
    var gE = new THREE.Mesh(new THREE.PlaneGeometry(d - 0.2, h - 0.3), HR.glass);
    gE.position.set(x1 + 0.02, h / 2, cz);
    gE.rotation.y = Math.PI / 2;
    scene.add(gE);
    // bench
    HR.box(scene, 1.8, 0.08, 0.45, cx - 0.3, 0.48, z0 + 0.55, WOOD, { wet: 0.1 });
    HR.box(scene, 1.8, 0.5, 0.06, cx - 0.3, 0.75, z0 + 0.32, WOODD, { noLine: true });
    HR.box(scene, 0.08, 0.48, 0.4, cx - 1.15, 0.28, z0 + 0.55, WOODD, { noLine: true });
    HR.box(scene, 0.08, 0.48, 0.4, cx + 0.55, 0.28, z0 + 0.55, WOODD, { noLine: true });
    // timetable
    var tt = HR.makeCanvas(256, 180, function (ctx, w, h) {
      ctx.fillStyle = '#efe4cc'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5c4a32';
      ctx.font = "bold 28px 'Microsoft YaHei',sans-serif";
      ctx.fillText('出航时刻', 18, 36);
      ctx.font = "22px 'Microsoft YaHei',sans-serif";
      ctx.fillText('06:40   近海', 18, 78);
      ctx.fillText('09:10   离岛', 18, 110);
      ctx.fillText('13:30   返回', 18, 142);
      ctx.fillText('16:50   休航', 18, 172);
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#a89878'; ctx.fillRect(0, 0, w, h);
    });
    var poster = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), new THREE.MeshBasicMaterial({ map: tt }));
    poster.position.set(cx + 0.95, 1.7, z0 + 0.08);
    scene.add(poster);
    // crooked clock
    var clockG = new THREE.Group();
    clockG.position.set(cx - 1.3, 2.05, z0 + 0.1);
    clockG.rotation.z = 0.22;
    var face = HR.makeCanvas(128, 128, function (ctx) {
      ctx.fillStyle = '#f7f3ea'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#222';
      for (var i = 0; i < 12; i++) {
        var a = i / 12 * Math.PI * 2;
        ctx.fillRect(64 + Math.sin(a) * 48 - 2, 64 - Math.cos(a) * 48 - 2, 4, 4);
      }
    });
    var faceM = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ map: face }));
    clockG.add(faceM);
    var handM = HR.box(clockG, 0.015, 0.14, 0.01, 0, 0.05, 0.01, '#222', { noLine: true });
    var handH = HR.box(clockG, 0.02, 0.09, 0.01, 0, 0.03, 0.012, '#222', { noLine: true });
    W.clock = { g: clockG, minute: handM, hour: handH };
    scene.add(clockG);
    // radio
    HR.box(scene, 0.28, 0.18, 0.14, cx + 1.5, 0.7, z0 + 0.7, WOODD, { wet: 0.1 });
    var spk = HR.makeCanvas(64, 64, function (ctx) {
      ctx.fillStyle = '#c8b090'; ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.arc(32, 32, 18, 0, 6.28); ctx.stroke();
      ctx.beginPath(); ctx.arc(32, 32, 8, 0, 6.28); ctx.stroke();
    });
    var spkM = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshBasicMaterial({ map: spk }));
    spkM.position.set(cx + 1.5, 0.72, z0 + 0.78);
    scene.add(spkM);
    HR.cyl(scene, 0.008, 0.008, 0.28, cx + 1.62, 0.95, z0 + 0.7, '#888', { noLine: true });
    // kettle + pothos
    var kx = cx - 1.7, kz = z0 + 0.9;
    HR.cyl(scene, 0.07, 0.08, 0.12, kx, 0.2, kz, '#d9dde0', { wet: 0.4 });
    HR.box(scene, 0.08, 0.04, 0.02, kx + 0.1, 0.22, kz, '#111', { noLine: true });
    HR.cyl(scene, 0.1, 0.08, 0.12, kx + 0.32, 0.12, kz + 0.05, '#c46a45', { noLine: true });
    HR.sph(scene, 0.1, kx + 0.32, 0.28, kz + 0.05, '#3e8f55', { noLine: true });
    HR.sph(scene, 0.08, kx + 0.23, 0.34, kz + 0.12, '#57a86a', { noLine: true });
    HR.sph(scene, 0.07, kx + 0.4, 0.32, kz - 0.02, '#2f7a48', { noLine: true });
    A.waitA = new THREE.Vector3(x1 + 2.3, 1.35, z0 + 0.4);
    A.waitB = new THREE.Vector3(x1 + 2.3, 1.35, z1 - 0.3);
    A.waitLook = new THREE.Vector3(cx, 1.2, cz);
  })();

  // ---------- dock props ----------
  // lamps
  W.lamps = [];
  [[1.4, 14.2], [-2.1, 8.4], [-3.55, -1.2], [-3.55, -7.2], [8.6, -13.7], [-11.5, 16.6]].forEach(function (p, i) {
    var g = new THREE.Group();
    var yBase = (p[0] > 8 && p[1] < -12) ? 0.32 : 0;
    g.position.set(p[0], yBase, p[1]);
    HR.cyl(g, 0.06, 0.08, 2.15, 0, 1.05, 0, '#5c6568', { wet: 0.25 });
    var shade = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 16), HR.mat('#dfe6e4', { wet: 0.85 }));
    shade.position.y = 2.15;
    shade.rotation.x = Math.PI / 2;
    g.add(shade);
    var bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1cc }));
    bulb.position.y = 2.15;
    g.add(bulb);
    scene.add(g);
    var drip = new THREE.Object3D();
    drip.position.set(0.2, 2.12, 0);
    g.add(drip);
    W.lamps.push({ g: g, drip: drip });
    if (i === 0) A.lamp = g.position.clone();
  });

  // wires between lamps — static catenaries
  function wire(a, b) {
    var pts = [];
    for (var i = 0; i <= 10; i++) {
      var t = i / 10;
      var x = HR.lerp(a[0], b[0], t);
      var z = HR.lerp(a[1], b[1], t);
      var sag = Math.sin(t * Math.PI) * 0.35;
      pts.push(new THREE.Vector3(x, 2.2 - sag, z));
    }
    var curve = new THREE.CatmullRomCurve3(pts);
    var geo = new THREE.TubeGeometry(curve, 16, 0.012, 5, false);
    var m = new THREE.Mesh(geo, HR.mat('#4c585c', { wet: 0.1 }));
    scene.add(m);
  }
  wire([1.4, 14.2], [-2.1, 8.4]);
  wire([-2.1, 8.4], [-3.55, -1.2]);
  wire([-3.55, -1.2], [-3.55, -7.2]);
  wire([-3.55, -7.2], [8.6, -13.7]);
  wire([-11.5, 16.6], [1.4, 14.2]);

  // fish boxes & blue crates
  function crateStack(x, z, n, col, wet) {
    for (var i = 0; i < n; i++) {
      HR.box(scene, 0.62, 0.28, 0.42, x + (i % 2) * 0.04, 0.16 + i * 0.29, z, col, { wet: wet, rot: [0, (i % 2) * 0.08, 0] });
    }
  }
  crateStack(-10.6, 10.6, 4, '#f7faf8', 0.8);
  crateStack(-9.7, 10.9, 3, '#f4f7f6', 0.75);
  crateStack(-10.2, 11.5, 2, '#3a6fbf', 0.7);
  crateStack(-8.2, 13.4, 3, '#f6faf8', 0.85);
  crateStack(-7.4, 13.1, 2, '#2f62a8', 0.65);
  HR._blob(-10.2, 0.03, 11.0, 1.6, 1.2);

  // nets on a rack
  (function () {
    var rack = new THREE.Group();
    rack.position.set(-6.4, 0, 7.6);
    HR.box(rack, 0.06, 1.5, 0.06, -0.8, 0.75, 0, RUST, { wet: 0.3 });
    HR.box(rack, 0.06, 1.5, 0.06, 0.8, 0.75, 0, RUST, { wet: 0.3 });
    HR.box(rack, 1.7, 0.05, 0.05, 0, 1.5, 0, RUST, { noLine: true });
    var netGeo = new THREE.PlaneGeometry(1.5, 1.15, 10, 8);
    var netMat = new THREE.MeshBasicMaterial({
      color: 0xd7ddd4, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      map: HR.makeCanvas(128, 128, function (ctx) {
        ctx.clearRect(0, 0, 128, 128);
        ctx.strokeStyle = 'rgba(70,80,74,0.9)';
        ctx.lineWidth = 2;
        for (var i = 0; i <= 128; i += 10) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
        }
      })
    });
    netMat.map.wrapS = netMat.map.wrapT = THREE.RepeatWrapping;
    var net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, 0.9, 0);
    rack.add(net);
    scene.add(rack);
    var base = netGeo.attributes.position.array.slice(0);
    W.nets.push({ mesh: net, base: base });
    // float rope
    var ropeG = new THREE.Group();
    ropeG.position.set(-5.3, 1.35, 7.6);
    for (var i = 0; i < 7; i++) {
      HR.sph(ropeG, 0.07, i * 0.16, -i * 0.12, 0, i % 2 ? '#ef7a32' : '#f2f4f2', { noLine: true });
    }
    scene.add(ropeG);
    W.floatRope = ropeG;
  })();

  // winch + derrick
  (function () {
    var g = new THREE.Group();
    g.position.set(-8.0, 0, 5.7);
    HR.box(g, 0.5, 0.12, 0.35, 0, 0.1, 0, '#6e4a3c', { wet: 0.2 });
    var drum = HR.mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10), '#8a5a42', g, { pos: [0, 0.32, 0], rot: [0, 0, Math.PI / 2], wet: 0.15 });
    HR.box(g, 0.28, 0.03, 0.03, 0.28, 0.32, 0, '#5a4036', { noLine: true });
    HR.cyl(g, 0.03, 0.03, 0.2, 0.42, 0.32, 0, '#4a342c', { rot: [0.6, 0, 0], noLine: true });
    scene.add(g);
    W.winch = drum;
  })();
  (function () {
    var g = new THREE.Group();
    g.position.set(-5.2, 0, 5.35);
    HR.cyl(g, 0.06, 0.08, 1.5, 0, 0.75, 0, RUST, { wet: 0.25 });
    HR.box(g, 1.3, 0.06, 0.06, 0.4, 1.45, 0, '#7a5344', { rot: [0, 0, 0.15] });
    HR.cyl(g, 0.02, 0.02, 0.7, 0.9, 1.05, 0, '#444', { noLine: true });
    HR.mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 10), '#555', g, { pos: [0.9, 0.72, 0], rot: [Math.PI / 2, 0, 0], noLine: true });
    scene.add(g);
  })();

  // buckets + landing net leaning on warehouse
  HR.cyl(scene, 0.14, 0.12, 0.26, -12.15, 0.14, 9.3, '#6a90a8', { wet: 0.6 });
  HR.cyl(scene, 0.12, 0.1, 0.22, -12.35, 0.12, 9.65, '#c5ccd0', { wet: 0.5 });
  (function () {
    var g = new THREE.Group();
    g.position.set(-12.2, 0, 10.4);
    g.rotation.z = 0.35;
    g.rotation.y = 0.4;
    HR.cyl(g, 0.02, 0.02, 1.5, 0, 0.75, 0, WOOD, { noLine: true });
    var hoop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 12), HR.mat('#888', { wet: 0.2 }));
    hoop.position.y = 1.45;
    hoop.rotation.x = Math.PI / 2;
    g.add(hoop);
    var net = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), new THREE.MeshBasicMaterial({
      color: 0xd5ddd4, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      map: HR.makeCanvas(64, 64, function (ctx) {
        ctx.strokeStyle = '#667'; ctx.lineWidth = 2;
        for (var i = 0; i < 64; i += 8) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke(); }
      })
    }));
    net.position.y = 1.45;
    net.rotation.x = -Math.PI / 2.4;
    g.add(net);
    scene.add(g);
  })();

  // vending machine
  (function () {
    var g = new THREE.Group();
    g.position.set(-12.35, 0, 14.15);
    HR.box(g, 0.85, 1.7, 0.55, 0, 0.85, 0, '#d5d8d2', { wet: 0.35 });
    var face = HR.makeCanvas(128, 192, function (ctx, w, h) {
      ctx.fillStyle = '#1c3a44'; ctx.fillRect(0, 0, w, h);
      var cols = ['#e25b4a', '#f0c43a', '#4aa3d8', '#7ac07a', '#eee', '#d07a3a'];
      for (var i = 0; i < 6; i++) {
        ctx.fillStyle = cols[i];
        ctx.fillRect(14 + (i % 2) * 54, 20 + Math.floor(i / 2) * 48, 42, 36);
      }
      ctx.fillStyle = '#9fd0c8';
      ctx.font = "20px 'Microsoft YaHei',sans-serif";
      ctx.fillText('冷饮', 40, 176);
    });
    var panel = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.95), new THREE.MeshBasicMaterial({ map: face }));
    panel.position.set(0, 0.95, 0.28);
    g.add(panel);
    // rusty awning
    HR.box(g, 1.05, 0.05, 0.7, 0.05, 1.78, 0.15, RUST, { wet: 0.2, rot: [0.18, 0, 0] });
    HR.box(g, 0.04, 0.25, 0.04, -0.42, 1.62, 0.35, '#6e3e32', { noLine: true });
    HR.box(g, 0.04, 0.25, 0.04, 0.42, 1.62, 0.35, '#6e3e32', { noLine: true });
    scene.add(g);
    HR._blob(-12.35, 0.02, 14.5, 1.1, 0.7);
  })();

  // sign
  (function () {
    var tex = HR.makeCanvas(256, 160, function (ctx, w, h) {
      ctx.fillStyle = '#e6dcc4'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#5e513c';
      ctx.font = "bold 36px 'Microsoft YaHei',sans-serif";
      ctx.fillText('太阳雨渔港', 28, 58);
      ctx.font = "bold 40px 'Microsoft YaHei',sans-serif";
      ctx.fillStyle = '#8d3a32';
      ctx.fillText('注意落水', 42, 118);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#8a7b62';
      ctx.beginPath(); ctx.ellipse(40, 30, 30, 16, 0.4, 0, 6.28); ctx.fill();
      ctx.beginPath(); ctx.ellipse(180, 90, 40, 18, -0.3, 0, 6.28); ctx.fill();
    });
    var g = new THREE.Group();
    g.position.set(5.4, 0, 8.55);
    HR.box(g, 0.08, 1.15, 0.08, -0.55, 0.55, 0, WOODD, { noLine: true });
    HR.box(g, 0.08, 1.15, 0.08, 0.55, 0.55, 0, WOODD, { noLine: true });
    var board = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.78), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.y = 1.05;
    g.add(board);
    HR.box(g, 1.3, 0.82, 0.06, 0, 1.05, -0.02, '#cbb892', { noLine: true });
    scene.add(g);
  })();

  // windsock + flags
  (function () {
    var g = new THREE.Group();
    g.position.set(-1.15, 0, 7.7);
    HR.cyl(g, 0.04, 0.05, 2.4, 0, 1.2, 0, '#d9dde0', { wet: 0.2 });
    var sock = [];
    var parent = g;
    for (var i = 0; i < 5; i++) {
      var p = new THREE.Group();
      p.position.set(0, i === 0 ? 2.4 : 0, 0);
      parent.add(p);
      var cone = HR.cyl(p, 0.14 - i * 0.02, 0.1 - i * 0.015, 0.28, 0, 0, 0.14, i % 2 ? '#ef7a32' : '#f4f1ea', { noLine: true, rot: [Math.PI / 2, 0, 0] });
      sock.push(p);
      parent = p;
      if (i === 0) p.position.set(0, 2.4, 0);
      else p.position.set(0, 0, 0.26);
    }
    scene.add(g);
    W.windsock = sock;
  })();
  function flag(x, y, z, color) {
    var g = new THREE.Group();
    g.position.set(x, y, z);
    var parts = [];
    var parent = g;
    for (var i = 0; i < 4; i++) {
      var p = new THREE.Group();
      parent.add(p);
      HR.box(p, 0.16, 0.22, 0.012, 0.08, 0, 0, color, { noLine: true });
      p.position.x = i === 0 ? 0 : 0.15;
      parts.push(p);
      parent = p;
    }
    scene.add(g);
    W.flags.push({ parts: parts, x: x, z: z });
  }
  flag(-14.6, 3.7, 13.5, '#d64545');
  flag(-12.2, 3.65, 9.0, '#f0f3f2');
  flag(6.5, 0.85, -13.7, '#e2b423');
  flag(2.2, 0.7, -13.75, '#d64545');
  // pole for roof flags already colored cloth; add short poles
  HR.cyl(scene, 0.02, 0.02, 0.4, -14.6, 3.5, 13.5, '#888', { noLine: true });

  // instrument cases + umbrella + puddle
  function hardCase(x, z, len, yaw) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    var silver = '#e7eef2';
    var edge = '#2c3234';
    HR.box(g, 0.36, 0.14, len * 0.96, 0, 0.09, 0, silver, { wet: 1, shadow: '#7c98a2' });
    HR.box(g, 0.3, 0.012, len * 0.82, 0, 0.164, 0, '#f7fbfc', { noLine: true, wet: 1 });
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
      HR.box(g, 0.05, 0.155, 0.06, s[0] * 0.16, 0.09, s[1] * len * 0.46, edge, { noLine: true });
    });
    HR.box(g, 0.05, 0.04, 0.05, 0.12, 0.1, len * 0.18, '#d7b15a', { noLine: true });
    HR.box(g, 0.05, 0.04, 0.05, 0.12, 0.1, -len * 0.18, '#d7b15a', { noLine: true });
    HR.box(g, 0.02, 0.045, 0.14, -0.19, 0.15, 0, '#d5dee3', { noLine: true });
    HR.box(g, 0.04, 0.016, 0.14, -0.21, 0.175, 0, '#f4f7f8', { noLine: true, wet: 0.9 });
    scene.add(g);
    return g;
  }
  hardCase(1.55, 12.55, 1.12, 0.18);
  hardCase(2.15, 12.15, 0.72, 0.22);
  A.cases = new THREE.Vector3(1.9, 0.2, 12.3);

  // clear umbrella leaning on the side steps
  (function () {
    var g = new THREE.Group();
    g.position.set(3.25, 0, 11.35);
    g.rotation.order = 'YXZ';
    g.rotation.y = 0.35;
    g.rotation.z = -0.42;
    var pts = [];
    for (var i = 0; i <= 18; i++) {
      var t = i / 18;
      var r = Math.pow(Math.sin(t * Math.PI * 0.5), 0.9) * 0.7;
      var y = 0.3 * Math.cos(t * Math.PI * 0.5);
      pts.push(new THREE.Vector2(Math.max(0.001, r), y));
    }
    var geo = new THREE.LatheGeometry(pts, 20);
    var canMat = HR._glassRain.clone();
    canMat.uniforms.uOp.value = 0.32;
    canMat.uniforms.uBeads.value = 1.1;
    var can = new THREE.Mesh(geo, canMat);
    can.position.y = 1.02;
    g.add(can);
    var up = new THREE.Vector3(0, 1, 0);
    for (i = 0; i < 8; i++) {
      var a2 = i / 8 * Math.PI * 2;
      var hub = new THREE.Vector3(0, 1.3, 0);
      var tip = new THREE.Vector3(Math.cos(a2) * 0.66, 1.02, Math.sin(a2) * 0.66);
      var dir = tip.clone().sub(hub);
      var len = dir.length();
      var rib = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, len, 5), HR.mat('#5a6366', { wet: 0.15 }));
      rib.position.copy(hub).add(tip).multiplyScalar(0.5);
      rib.quaternion.setFromUnitVectors(up, dir.multiplyScalar(1 / len));
      g.add(rib);
    }
    HR.cyl(g, 0.016, 0.016, 0.95, 0, 0.5, 0, '#4e5658', { noLine: true });
    HR.mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12), '#3a4042', g, { pos: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0], noLine: true });
    var beads = [];
    for (i = 0; i < 12; i++) {
      var ba = i / 12 * Math.PI * 2;
      var b = HR.sph(g, 0.02, Math.cos(ba) * 0.68, 1.0, Math.sin(ba) * 0.68, '#fff6e0', {
        noLine: true,
        material: new THREE.MeshBasicMaterial({ color: 0xfff3d4, transparent: true, opacity: 0.92 })
      });
      beads.push(b);
    }
    var lip = new THREE.Object3D();
    lip.position.set(0.62, 0.98, 0.12);
    g.add(lip);
    scene.add(g);
    W.umbrella = { g: g, beads: beads, lip: lip };
    A.umbrella = new THREE.Vector3(3.25, 0.7, 11.35);
  })();

  // puddle
  (function () {
    var cx = 2.35, cz = 11.15;
    var mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: HR.U.uTime, uSunVis: HR.U.uSunVis,
        uGull: { value: new THREE.Vector2(10, 10) },
        uGullOn: { value: 0 }
      },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vUv=uv; gl_Position=projectionMatrix*viewMatrix*w; }',
      fragmentShader: [
        'uniform float uTime; uniform float uSunVis; uniform vec2 uGull; uniform float uGullOn;',
        'varying vec2 vUv; varying vec3 vW;',
        'void main(){',
        '  vec2 p = vUv - 0.5;',
        '  float e = length(p * vec2(1.08, 1.4));',
        '  if (e > 0.48) discard;',
        '  float warp = sin(p.x * 9.0 + uTime * 1.1) * 0.02 + sin(p.y * 7.0 - uTime * 0.8) * 0.016;',
        '  float q = (p.y + warp) * 8.0;',
        '  float m = mod(floor(q + 4.0), 3.0);',
        '  vec3 col = m < 0.5 ? vec3(0.92, 0.96, 0.95) : (m < 1.5 ? vec3(0.16, 0.44, 0.56) : vec3(0.40, 0.74, 0.72));',
        '  vec2 bp = p - vec2(warp * 3.0, 0.06);',
        '  float hull = smoothstep(0.18, 0.09, abs(bp.x * 1.15)) * smoothstep(0.0, 0.06, bp.y) * smoothstep(0.30, 0.16, bp.y);',
        '  float cabin = smoothstep(0.07, 0.03, abs(bp.x)) * smoothstep(0.12, 0.16, bp.y) * smoothstep(0.27, 0.21, bp.y);',
        '  col = mix(col, vec3(0.96, 0.98, 0.97), hull * 0.9);',
        '  col = mix(col, vec3(0.55, 0.78, 0.78), cabin);',
        '  float lamp = smoothstep(0.02, 0.0, abs(p.x + 0.16 + warp)) * step(p.y, -0.02) * step(-0.36, p.y);',
        '  float ring = smoothstep(0.035, 0.01, abs(length((p - vec2(-0.16, -0.06)) * vec2(1.0, 1.4)) - 0.045));',
        '  col = mix(col, vec3(0.22, 0.28, 0.30), lamp * 0.85);',
        '  col = mix(col, vec3(0.82, 0.9, 0.88), ring);',
        '  vec2 gp = (vW.xz - uGull);',
        '  float gull = uGullOn * smoothstep(0.28, 0.05, length(gp));',
        '  float wing = uGullOn * smoothstep(0.07, 0.0, abs(gp.y)) * smoothstep(0.32, 0.06, abs(gp.x));',
        '  col = mix(col, vec3(0.98, 0.98, 0.97), max(gull * 0.85, wing));',
        '  float rip = smoothstep(0.82, 1.0, sin(e * 36.0 - uTime * 2.2));',
        '  col += rip * 0.1 * uSunVis;',
        '  float edge = smoothstep(0.48, 0.28, e);',
        '  gl_FragColor = vec4(col, 0.8 * edge);',
        '}'
      ].join('\n')
    });
    var m = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.025, cz);
    m.renderOrder = 3;
    scene.add(m);
    W.puddle = { mesh: m, mat: mat, x: cx, z: cz };
    A.puddle = new THREE.Vector3(cx, 0.05, cz);
  })();

  // sampan upside down on the ramp, cat shelter
  (function () {
    var g = new THREE.Group();
    g.position.set(3.45, 0.22, 6.55);
    g.rotation.set(Math.PI + 0.15, 0.35, 0.15);
    var hull = HR.makeHull(2.15, 0.78, 0.28);
    HR.mesh(hull, WOOD, g, { wet: 0.35, edges: new THREE.EdgesGeometry(hull, 30) });
    // chocks so a gap remains
    scene.add(g);
    HR.box(scene, 0.12, 0.16, 0.2, 3.05, 0.08, 6.15, WOODD, { noLine: true });
    HR.box(scene, 0.12, 0.18, 0.2, 3.9, 0.09, 6.95, WOODD, { noLine: true });
    A.catHome = new THREE.Vector3(3.45, 0.06, 6.7);
    A.sampan = g.position.clone();
  })();

  // ---------- cat ----------
  (function () {
    var root = new THREE.Group();
    var body = new THREE.Group();
    root.add(body);
    var torso = HR.mesh(HR.GEO.sphere, '#b7b3ac', body, { scale: [0.16, 0.12, 0.28], noLine: true });
    var chest = HR.mesh(HR.GEO.sphere, '#f3f1ec', body, { pos: [0, -0.02, -0.08], scale: [0.1, 0.08, 0.12], noLine: true });
    var headP = new THREE.Group();
    headP.position.set(0, 0.06, -0.26);
    body.add(headP);
    HR.sph(headP, 0.1, 0, 0, 0, '#c4c0b8', { noLine: true });
    HR.sph(headP, 0.045, 0, -0.02, -0.07, '#f4f2ee', { noLine: true });
    HR.mesh(HR.GEO.cone, '#c4c0b8', headP, { pos: [-0.045, 0.07, 0], scale: [0.035, 0.07, 0.035], noLine: true });
    HR.mesh(HR.GEO.cone, '#c4c0b8', headP, { pos: [0.045, 0.07, 0], scale: [0.035, 0.07, 0.035], noLine: true });
    var eyeL = HR.sph(headP, 0.018, -0.035, 0.02, -0.08, '#1b1b1b', { noLine: true });
    var eyeR = HR.sph(headP, 0.018, 0.035, 0.02, -0.08, '#1b1b1b', { noLine: true });
    HR.sph(headP, 0.008, -0.03, 0.028, -0.09, '#f2c14e', { noLine: true });
    HR.sph(headP, 0.008, 0.04, 0.028, -0.09, '#f2c14e', { noLine: true });
    var legs = [];
    [[-0.08, -0.12], [0.08, -0.12], [-0.08, 0.12], [0.08, 0.12]].forEach(function (p) {
      var pivot = new THREE.Group();
      pivot.position.set(p[0], -0.05, p[1]);
      body.add(pivot);
      HR.cyl(pivot, 0.03, 0.035, 0.16, 0, -0.08, 0, '#b7b3ac', { noLine: true });
      legs.push(pivot);
    });
    var tailPiv = [];
    var tp = body;
    for (var i = 0; i < 4; i++) {
      var seg = new THREE.Group();
      seg.position.set(0, 0.02, i === 0 ? 0.26 : 0.08);
      tp.add(seg);
      HR.cyl(seg, 0.025 - i * 0.004, 0.02, 0.09, 0, 0, 0.04, i > 2 ? '#f3f1ec' : '#b7b3ac', { rot: [Math.PI / 2, 0, 0], noLine: true });
      tailPiv.push(seg);
      tp = seg;
    }
    scene.add(root);
    W.cat = { root: root, body: body, head: headP, legs: legs, tail: tailPiv, torso: torso };
  })();

  // ---------- gulls ----------
  function gullMesh() {
    var g = new THREE.Group();
    var rock = new THREE.Group();
    g.add(rock);
    HR.mesh(HR.GEO.sphere, '#f7f8f6', rock, { scale: [0.1, 0.08, 0.18], noLine: true });
    var head = new THREE.Group();
    head.position.set(0, 0.04, -0.16);
    rock.add(head);
    HR.sph(head, 0.055, 0, 0, 0, '#f7f8f6', { noLine: true });
    HR.mesh(HR.GEO.cone, '#e2b423', head, { pos: [0, -0.01, -0.06], scale: [0.02, 0.07, 0.02], rot: [Math.PI / 2, 0, 0], noLine: true });
    HR.sph(head, 0.012, 0.03, 0.02, -0.03, '#1a1a1a', { noLine: true });
    HR.sph(head, 0.012, -0.03, 0.02, -0.03, '#1a1a1a', { noLine: true });
    function wing(sign) {
      var p = new THREE.Group();
      p.position.set(sign * 0.08, 0.02, -0.02);
      rock.add(p);
      HR.box(p, 0.28, 0.015, 0.1, sign * 0.16, 0, 0, '#f4f6f5', { noLine: true });
      HR.box(p, 0.12, 0.012, 0.07, sign * 0.32, -0.01, 0.02, '#c5ccd0', { noLine: true });
      return p;
    }
    var wL = wing(-1), wR = wing(1);
    HR.box(rock, 0.08, 0.012, 0.08, 0, 0.01, 0.16, '#f7f8f6', { noLine: true });
    return { g: g, rock: rock, wL: wL, wR: wR, head: head };
  }
  for (var gi = 0; gi < 8; gi++) {
    var gm = gullMesh();
    scene.add(gm.g);
    W.gulls.push(gm);
  }
  // perches: bollard index, or water, or boat local
  W.perches = [
    { kind: 'bollard', i: 4 },
    { kind: 'bollard', i: 5 },
    { kind: 'bollard', i: 2 },
    { kind: 'boat', boat: 0, local: [0.55, 1.15, -0.3] },
    { kind: 'boat', boat: 1, local: [-0.4, 1.05, 0.35] },
    { kind: 'water', x: 6.2, z: -4.2 },
    { kind: 'water', x: 3.4, z: 0.6 },
    { kind: 'bollard', i: 5 }
  ];

  // ---------- fish ----------
  function fishMesh(col) {
    var g = new THREE.Group();
    HR.mesh(HR.GEO.sphere, col, g, { scale: [0.06, 0.045, 0.12], noLine: true });
    HR.mesh(HR.GEO.cone, col, g, { pos: [0, 0, 0.12], scale: [0.05, 0.07, 0.05], rot: [-Math.PI / 2, 0, 0], noLine: true });
    HR.mesh(HR.GEO.cone, col, g, { pos: [0, 0.055, -0.01], scale: [0.018, 0.07, 0.032], noLine: true });
    HR.sph(g, 0.012, 0.03, 0.015, -0.04, '#111', { noLine: true });
    return g;
  }
  var fishSpots = [
    { cx: 15.5, cz: 14.5, rx: 2.2, rz: 1.6, cy: -2.6 },
    { cx: 16.8, cz: 12.2, rx: 1.8, rz: 2.0, cy: -3.1 },
    { cx: 13.2, cz: 16.4, rx: 1.4, rz: 1.2, cy: -2.3 },
    { cx: 3.2, cz: -2.0, rx: 2.4, rz: 1.8, cy: -2.8 },
    { cx: 6.5, cz: -6.5, rx: 2.0, rz: 1.5, cy: -3.0 },
    { cx: 1.0, cz: 1.5, rx: 1.6, rz: 1.2, cy: -2.5 }
  ];
  fishSpots.forEach(function (s, si) {
    var n = si < 3 ? 4 : 3;
    for (var k = 0; k < n; k++) {
      var col = (si + k) % 2 ? '#d5e4e4' : '#8fd0c8';
      var m = fishMesh(col);
      scene.add(m);
      W.fish.push({
        m: m, cx: s.cx, cz: s.cz, rx: s.rx, rz: s.rz, cy: s.cy,
        ph: si * 1.3 + k * 0.8, speed: 0.35 + (k % 3) * 0.08,
        scatter: new THREE.Vector3(Math.cos(k + si), 0, Math.sin(k * 1.7 + si))
      });
    }
  });

  // ---------- rain ----------
  (function () {
    var N = 2600;
    var pos = new Float32Array(N * 6 * 3);
    var phase = new Float32Array(N * 6);
    var seed = new Float32Array(N * 6 * 3);
    var corner = new Float32Array(N * 6 * 2);
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (var i = 0; i < N; i++) {
      var sx = HR.rand() * 48 - 24;
      var sz = HR.rand() * 48 - 24;
      var sp = HR.rand();
      var ph = HR.rand();
      for (var v = 0; v < 6; v++) {
        var id = i * 6 + v;
        phase[id] = ph;
        seed[id * 3] = sx;
        seed[id * 3 + 1] = sz;
        seed[id * 3 + 2] = sp;
        corner[id * 2] = corners[v][0];
        corner[id * 2 + 1] = corners[v][1];
        pos[id * 3 + 1] = 0;
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    var mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: HR.U.uTime, uSlant: HR.U.uSlant, uRain: HR.U.uRain, uSunVis: HR.U.uSunVis },
      vertexShader: [
        'attribute float aPhase; attribute vec3 aSeed; attribute vec2 aCorner;',
        'uniform float uTime; uniform float uSlant; uniform float uRain;',
        'varying float vA;',
        'void main(){',
        '  float speed = 6.2 + aSeed.z * 4.0;',
        '  float fall = fract(aPhase + uTime * speed * 0.07);',
        '  float show = step(aSeed.z, mix(0.34, 1.0, uRain));',
        '  vec3 base = vec3(',
        '    mod(aSeed.x + uSlant * fall * 10.0 + 24.0, 48.0) - 24.0,',
        '    mix(13.0, -2.2, fall),',
        '    mod(aSeed.y + uSlant * fall * 2.5 + 24.0, 48.0) - 24.0);',
        '  vec3 side = vec3(0.014, 0.0, 0.0);',
        '  vec3 up = vec3(uSlant * 0.09, 0.2 + aSeed.z * 0.08, 0.025);',
        '  vec3 p = base + side * aCorner.x + up * aCorner.y;',
        '  vA = show * 0.55 * smoothstep(0.0, 0.04, fall) * smoothstep(1.0, 0.92, fall);',
        '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vA; uniform float uSunVis;',
        'void main(){ gl_FragColor = vec4(1.0, 0.94, 0.78, vA * (0.55 + 0.45 * uSunVis)); }'
      ].join('\n')
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    scene.add(mesh);
    W.rain = mesh;
  })();

  // sparkles on water
  (function () {
    var N = 70;
    var geo = new THREE.BufferGeometry();
    var pos = [], ph = [];
    for (var i = 0; i < N; i++) {
      pos.push(HR.randRange(-2, 19), HR.WATER_Y + 0.04, HR.randRange(-18, 18));
      ph.push(HR.rand() * 10);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
    var mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: HR.U.uTime, uSunVis: HR.U.uSunVis, uCloudCenter: HR.U.uCloudCenter, uCloudDir: HR.U.uCloudDir, uCloudAmt: HR.U.uCloudAmt },
      vertexShader: [
        'attribute float aPh; uniform float uTime; varying float vA;',
        'void main(){',
        '  vec3 p = position;',
        '  float f = sin(uTime * 3.0 + aPh);',
        '  vA = step(0.72, f);',
        '  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);',
        '  gl_PointSize = 3.5;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying float vA; uniform float uSunVis;',
        'void main(){ if (vA < 0.5) discard; gl_FragColor = vec4(1.0, 0.98, 0.9, 0.9 * uSunVis); }'
      ].join('\n')
    });
    var pts = new THREE.Points(geo, mat);
    pts.renderOrder = 5;
    scene.add(pts);
  })();

  // rainbow
  (function () {
    var N = 48, bands = 5;
    var cols = [[0.85, 0.55, 0.55], [0.9, 0.75, 0.55], [0.85, 0.85, 0.6], [0.6, 0.82, 0.65], [0.6, 0.75, 0.9]];
    var pos = [], col = [], idx = [];
    for (var i = 0; i <= N; i++) {
      var t = i / N;
      var ang = Math.PI * (0.08 + t * 0.84);
      for (var b = 0; b <= bands; b++) {
        var r = 15.5 + b * 0.42;
        pos.push(Math.cos(ang) * r, Math.sin(ang) * r, 0);
        var c = cols[Math.min(bands - 1, b)];
        col.push(c[0], c[1], c[2]);
      }
    }
    var stride = bands + 1;
    for (i = 0; i < N; i++) {
      for (b = 0; b < bands; b++) {
        var a0 = i * stride + b;
        idx.push(a0, a0 + 1, a0 + stride, a0 + 1, a0 + stride + 1, a0 + stride);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    var mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(6, 0.5, -6);
    mesh.rotation.y = -0.6;
    mesh.renderOrder = 1;
    scene.add(mesh);
    W.rainbow = mesh;
  })();

  // gust ripple: a downwind band that crosses the harbor with the gust
  (function () {
    var map = HR.makeCanvas(64, 8, function (ctx) {
      var g = ctx.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(6,40,62,0)');
      g.addColorStop(0.28, 'rgba(4,36,58,0.8)');
      g.addColorStop(0.46, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.54, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.72, 'rgba(4,36,58,0.8)');
      g.addColorStop(1, 'rgba(6,40,62,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 8);
    });
    map.wrapS = THREE.ClampToEdgeWrapping;
    map.wrapT = THREE.RepeatWrapping;
    var mat = new THREE.MeshBasicMaterial({
      map: map, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, fog: false
    });
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 42), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(18, HR.WATER_Y + 0.08, -1);
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    scene.add(mesh);
    W.gustFront = mesh;
  })();

  // wake quads
  W.wakes = [];
  for (var wi = 0; wi < 16; wi++) {
    var wm = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.35), new THREE.MeshBasicMaterial({
      color: 0xf7fffe, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide
    }));
    wm.rotation.x = -Math.PI / 2;
    wm.renderOrder = 5;
    scene.add(wm);
    W.wakes.push(wm);
  }

  // distant boats
  function distantBoat(phase) {
    var g = new THREE.Group();
    var hull = HR.makeHull(2.4, 0.7, 0.25);
    HR.mesh(hull, '#e7eef0', g, { wet: 0.2, noLine: true });
    HR.box(g, 0.45, 0.35, 0.55, 0, 0.28, 0.1, '#f4f7f6', { noLine: true });
    scene.add(g);
    W.distant.push({ g: g, phase: phase });
  }
  distantBoat(0);
  distantBoat(18);

  // ripples
  for (var ri = 0; ri < 8; ri++) {
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.22, 18), new THREE.MeshBasicMaterial({
      color: 0xe9f7f6, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = HR.WATER_Y + 0.03;
    ring.renderOrder = 5;
    scene.add(ring);
    W.ripples.push({
      m: ring,
      x: [14, 6, -1, 10, 16, 3, 8, 12][ri],
      z: [12, -4, -8, 3, 17, 1, -14, -10][ri],
      ph: ri * 0.7
    });
  }

  // drip list (world-updated markers)
  W.dripList = [];
  if (W.umbrella) W.dripList.push({ obj: W.umbrella.lip, period: 2.2, off: 0.3, intoPuddle: false });
  if (W.lamps[0]) W.dripList.push({ obj: W.lamps[0].drip, period: 2.8, off: 0.8 });
  if (W.lamps[1]) W.dripList.push({ obj: W.lamps[1].drip, period: 3.3, off: 1.4 });
  if (W.boats[0]) W.dripList.push({ obj: W.boats[0].drip, period: 2.5, off: 0.4 });
  if (W.boats[1]) W.dripList.push({ obj: W.boats[1].drip, period: 3.0, off: 1.1 });
  W.dripMeshes = [];
  for (var di2 = 0; di2 < W.dripList.length; di2++) {
    var dm2 = HR.sph(scene, 0.02, 0, -5, 0, '#fff6e0', {
      noLine: true,
      material: new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.9 })
    });
    W.dripMeshes.push(dm2);
  }

  // lighthouse — red and white, at the breakwater end
  (function () {
    var g = new THREE.Group();
    g.position.set(12.15, 0.32, -13.72);
    HR.cyl(g, 0.78, 0.92, 0.45, 0, 0.22, 0, '#d5dbd8', { wet: 0.45 });
    HR.cyl(g, 0.46, 0.55, 1.15, 0, 1.0, 0, '#f7faf8', { wet: 0.35 });
    HR.cyl(g, 0.46, 0.46, 0.42, 0, 1.75, 0, '#d64545', { wet: 0.3 });
    HR.cyl(g, 0.44, 0.46, 0.7, 0, 2.3, 0, '#f7faf8', { wet: 0.3 });
    HR.cyl(g, 0.46, 0.46, 0.28, 0, 2.72, 0, '#d64545', { wet: 0.3 });
    var rail = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 18), HR.mat('#e4eae8', { wet: 0.3 }));
    rail.position.y = 2.9;
    rail.rotation.x = Math.PI / 2;
    g.add(rail);
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2;
      HR.cyl(g, 0.015, 0.015, 0.16, Math.cos(a) * 0.58, 2.82, Math.sin(a) * 0.58, '#dfe4e2', { noLine: true });
    }
    var glassC = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.48, 8, 1, true), HR.glass);
    glassC.position.y = 3.2;
    g.add(glassC);
    var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    lamp.position.y = 3.2;
    g.add(lamp);
    HR.mesh(HR.GEO.cone, '#d64545', g, { pos: [0, 3.68, 0], scale: [0.52, 0.46, 0.52], edges: HR.GEO.coneEdges });
    HR.box(g, 0.18, 0.36, 0.05, 0, 0.58, 0.5, '#8c6248', { noLine: true });
    var pivot = new THREE.Group();
    pivot.position.y = 3.2;
    g.add(pivot);
    var beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1c4, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false
    });
    var beam = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.45), beamMat);
    beam.position.x = 3.6;
    pivot.add(beam);
    scene.add(g);
    // posterized reflection in the water beside the tower
    var refl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), new THREE.MeshBasicMaterial({
      color: 0xf4f8f6, transparent: true, opacity: 0.8, depthWrite: false
    }));
    refl.position.set(12.15, HR.WATER_Y - 0.02, -14.5);
    refl.renderOrder = 3;
    scene.add(refl);
    W.lighthouse = { g: g, lamp: lamp, pivot: pivot, beam: beam, mat: beamMat };
  })();

  A.bollardGull = W.bollards[2].position.clone();
  A.bollardGull.y = 0.72;
  A.lighthouse = new THREE.Vector3(12.15, 2.2, -13.72);
  A.section = new THREE.Vector3(14.5, -2.4, 16.5);
})();
