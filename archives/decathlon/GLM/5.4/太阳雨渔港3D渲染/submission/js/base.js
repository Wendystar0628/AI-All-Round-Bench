/* ============================================================
   base.js — 底座 / 混凝土码头 / 水体 / 海床 / 防波堤 / 山坡
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  /* ---------------- 世界常量 ---------------- */
  const W = S.W = {
    half: 13,
    bottom: -4.6,
    dockY: 0,
    waterY: -0.62,
    seabedY: -3.72,
    front: { x0: -13, x1: 13, z0: 5.5, z1: 13 },     // 前景堤岸
    left: { x0: -13, x1: -4, z0: -13, z1: 5.5 },     // 左侧堤岸
    hill: { x0: 8, x1: 13, z0: -13, z1: -7.5 },      // 远端山坡
    water: [
      { x0: -4, x1: 13, z0: -7.5, z1: 5.5 },
      { x0: -4, x1: 8, z0: -13, z1: -7.5 }
    ],
    bw: { x0: -4, x1: 2.2, z0: -10.2, z1: -7.8, top: 0.32 },  // 防波堤
    lighthouse: { x: 2.55, z: -9.0 }
  };

  /* ---------------- 材质缓存 ---------------- */
  const M = S.M = {};

  S.initMaterials = function () {
    // 混凝土（堤面）
    const cTop = S.texConcrete(512, 512, { base: [203, 208, 202], seed: 12, stains: 34 });
    M.dockTop = S.toon(0xffffff, {
      map: S.tex(cTop, { repeat: [6, 6] }), spec: 0.42, shin: 60, rim: 0.12, rimPow: 3.5
    });
    M.dockTop.map.anisotropy = 8;

    // 混凝土（外侧壁）
    const cSide = S.texConcrete(512, 512, { base: [196, 201, 196], seed: 44, stains: 44, cracks: true });
    M.concSide = S.toon(0xffffff, { map: S.tex(cSide, { repeat: [4, 2] }), spec: 0.08, shin: 20 });

    // 底座剖面（外侧切割面）
    M.cutFace = S.toon(0xffffff, { map: S.tex(S.texCutSection(512, 512), { repeat: [2, 1] }), spec: 0.06, shin: 16 });

    // 岸壁（潮痕）
    const qw = S.texQuayWall(1024, 512, { seed: 5, wl: 0.135 });
    M.quayWall = S.toon(0xffffff, { map: S.tex(qw, { repeat: [3, 1] }), spec: 0.12, shin: 24 });

    // 海床
    M.seabed = S.toon(0xffffff, {
      map: S.tex(S.texConcrete(512, 512, { base: [178, 188, 182], seed: 77, stains: 34, cracks: false }), { repeat: [3, 3] }),
      spec: 0.02
    });

    // 水体剖面
    M.waterSide = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color(0x8fd8d2) },
        uMid: { value: new THREE.Color(0x4aa6b4) },
        uDeep: { value: new THREE.Color(0x1d5a70) },
        uSun: { value: 1 }
      },
      vertexShader: `
        varying vec3 vWorld; varying vec3 vN; varying vec3 vV;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xyz;
          vN = normalize( mat3(modelMatrix) * normal );
          vV = normalize( cameraPosition - wp.xyz );
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform float uSun;
        varying vec3 vWorld; varying vec3 vN; varying vec3 vV;
        void main(){
          float depth = clamp( ( -0.62 - vWorld.y ) / 3.4, 0.0, 1.0 );
          vec3 col = mix( uShallow, uMid, smoothstep(0.0,0.55,depth) );
          col = mix( col, uDeep, smoothstep(0.45,1.0,depth) );
          col = mix( col, vec3(0.35,0.72,0.78), 0.22 );
          float fres = pow( 1.0 - abs( dot( normalize(vN), normalize(vV) ) ), 2.2 );
          // 水面附近更亮
          float top = smoothstep( -1.1, -0.62, vWorld.y );
          col = mix( col, uShallow * 1.12, top * 0.55 );
          // 缓慢的水体光斑
          float ca = sin( vWorld.x * 2.1 + uTime * 0.7 ) * sin( vWorld.z * 1.7 - uTime * 0.55 );
          col += vec3(0.05,0.11,0.11) * ca * (0.4 + 0.6*uSun);
          // 水线高光
          float wl = smoothstep( 0.10, 0.0, abs( vWorld.y + 0.62 ) );
          col += vec3( 0.55, 0.75, 0.78 ) * wl * 0.55;
          float a = 0.20 + fres * 0.34 + top * 0.10;
          gl_FragColor = vec4( col, clamp(a,0.0,0.72) );
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });

    // 水面
    M.water = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRefl: { value: null },
        uReflM: { value: new THREE.Matrix4() },
        uSun: { value: 1 },
        uRain: { value: 0.5 },
        uShallow: { value: new THREE.Color(0x8ad8d4) },
        uMid: { value: new THREE.Color(0x3f9fae) },
        uDeep: { value: new THREE.Color(0x226a80) },
        uInk: { value: new THREE.Color(0x1b4f63) },
        uWhite: { value: new THREE.Color(0xe2f4f4) },
        uMode: { value: 0 }
      },
      vertexShader: `
        varying vec3 vWorld;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime; uniform sampler2D uRefl; uniform mat4 uReflM;
        uniform float uSun; uniform float uRain;
        uniform vec3 uShallow, uMid, uDeep, uInk, uWhite;
        uniform float uMode;
        varying vec3 vWorld;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec4 rp = uReflM * vec4(vWorld,1.0);
          vec2 uv = rp.xy / rp.w;
          // 波纹扰动
          float w1 = sin( vWorld.x * 1.9 + uTime * 0.85 ) + sin( vWorld.z * 2.7 - uTime * 0.62 );
          float w2 = sin( (vWorld.x + vWorld.z) * 3.3 + uTime * 1.15 ) + sin( (vWorld.x - vWorld.z) * 4.1 - uTime * 0.9 );
          uv += vec2( w1, w2 ) * 0.0038;
          uv += vec2( sin(vWorld.z*7.0+uTime*1.7), cos(vWorld.x*6.4-uTime*1.3) ) * 0.0016;
          vec3 refl = texture2D( uRefl, uv ).rgb;
          if ( uMode > 0.5 ) { gl_FragColor = vec4( refl, 1.0 ); return; }
          // 色块化：亮度 -> 4 段
          float lum = dot( refl, vec3(0.299,0.587,0.114) );
          float lv = floor( clamp( lum, 0.0, 0.999 ) * 4.0 );
          vec3 band = lv < 0.5 ? uInk : ( lv < 1.5 ? uDeep : ( lv < 2.5 ? uMid : uWhite ) );
          band = mix( band, refl, 0.12 );
          // 岸边浅水
          float shore = min( vWorld.x + 4.0, 5.5 - vWorld.z );
          shore = min( shore, 8.0 - vWorld.x );
          shore = min( shore, vWorld.z + 13.0 );
          shore = max( shore, 0.0 );
          float shal = smoothstep( 0.0, 2.6, shore );
          vec3 base = mix( uShallow, uMid, shal );
          float fres = pow( 1.0 - abs( dot( vec3(0.0,1.0,0.0), normalize( cameraPosition - vWorld ) ) ), 1.6 );
          float mixAmt = 0.40 + fres * 0.50;
          vec3 col = mix( base, band, mixAmt );
          col = mix( col, uShallow * 1.02, (1.0 - shal) * 0.35 );
          // 粼光
          float sp = pow( max( 0.0, sin( vWorld.x * 5.3 + uTime * 1.9 ) * sin( vWorld.z * 4.7 - uTime * 1.5 ) ), 26.0 );
          col += vec3(1.0,0.98,0.9) * sp * 0.10 * uSun;
          // 雨点涟漪
          float rip = 0.0;
          vec2 g = vWorld.xz * 3.6;
          vec2 id = floor( g );
          vec2 f = fract( g ) - 0.5;
          float h = hash( id );
          float ph = fract( uTime * (0.25 + h*0.2) + h * 7.0 );
          float r = length( f );
          rip = smoothstep( 0.05, 0.0, abs( r - ph * 0.42 ) ) * (1.0 - ph) * step( 0.62, h );
          col += vec3(0.88,0.96,0.96) * rip * 0.11 * uRain;
          gl_FragColor = vec4( col, 1.0 );
        }`,
      transparent: false, depthWrite: true
    });

    // 水洼
    M.puddle = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRefl: { value: null },
        uReflM: { value: new THREE.Matrix4() },
        uSun: { value: 1 },
        uRain: { value: 0.5 },
        uSky: { value: new THREE.Color(0xdcf2f4) }
      },
      vertexShader: `
        varying vec3 vWorld; varying vec2 vUv;
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0);
          vWorld = wp.xyz; vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime; uniform sampler2D uRefl; uniform mat4 uReflM;
        uniform float uSun; uniform float uRain; uniform vec3 uSky;
        varying vec3 vWorld; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec2 c = vUv - 0.5;
          float d = length( c ) * 2.0;
          float edge = smoothstep( 1.0, 0.82, d );
          if ( edge <= 0.001 ) discard;
          vec4 rp = uReflM * vec4(vWorld,1.0);
          vec2 uv = rp.xy / rp.w;
          uv += vec2( sin(vWorld.z*9.0+uTime*1.6), cos(vWorld.x*8.0-uTime*1.2) ) * 0.004;
          vec3 refl = texture2D( uRefl, uv ).rgb;
          float lum = dot( refl, vec3(0.299,0.587,0.114) );
          float lv = floor( clamp(lum,0.0,0.999) * 4.0 );
          vec3 band = lv < 0.5 ? vec3(0.16,0.34,0.40) : ( lv < 1.5 ? vec3(0.30,0.55,0.60) : ( lv < 2.5 ? vec3(0.62,0.82,0.84) : vec3(0.95,0.99,1.0) ) );
          vec3 col = mix( uSky, band, 0.55 );
          // 涟漪
          float rip = 0.0;
          vec2 g = vWorld.xz * 5.0;
          vec2 id = floor(g); vec2 f = fract(g)-0.5;
          float h = hash(id);
          float ph = fract( uTime*(0.3+h*0.25) + h*9.0 );
          rip = smoothstep(0.07,0.0,abs(length(f)-ph*0.5))*(1.0-ph)*step(0.6,h);
          col += vec3(1.0) * rip * 0.35 * uRain;
          gl_FragColor = vec4( col, edge * 0.80 );
        }`,
      transparent: true, depthWrite: false
    });
  };

  /* ---------------- 混凝土底座 ---------------- */
  S.buildConcrete = function (scene) {
    const g = new THREE.Group(); g.name = 'concrete';
    const B = W.bottom, T = W.dockY, H = T - B;
    const side = [M.concSide, M.concSide, M.dockTop, M.concSide, M.quayWall, M.concSide];

    // 前景堤岸：留出台阶凹口
    const f = W.front;
    const stepGap = { x0: 6.0, x1: 9.2, z0: 5.5, z1: 7.4 };
    const parts = [
      { x0: f.x0, x1: stepGap.x0, z0: f.z0, z1: f.z1 },
      { x0: stepGap.x1, x1: f.x1, z0: f.z0, z1: f.z1 },
      { x0: stepGap.x0, x1: stepGap.x1, z0: stepGap.z1, z1: f.z1 }
    ];
    for (const p of parts) {
      const w = p.x1 - p.x0, d = p.z1 - p.z0;
      const geo = new THREE.BoxGeometry(w, H, d);
      const mats = [
        M.cutFace, M.cutFace, M.dockTop, M.concSide,
        M.cutFace,   // +z 外侧剖面
        M.quayWall    // -z 面向水域
      ];
      const m = new THREE.Mesh(geo, mats);
      m.position.set((p.x0 + p.x1) / 2, (B + T) / 2, (p.z0 + p.z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }

    // 左侧堤岸
    const l = W.left;
    {
      const geo = new THREE.BoxGeometry(l.x1 - l.x0, H, l.z1 - l.z0);
      const mats = [M.quayWall, M.cutFace, M.dockTop, M.concSide, M.cutFace, M.cutFace];
      const m = new THREE.Mesh(geo, mats);
      m.position.set((l.x0 + l.x1) / 2, (B + T) / 2, (l.z0 + l.z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }

    // 山坡基座
    const hl = W.hill;
    {
      const geo = new THREE.BoxGeometry(hl.x1 - hl.x0, H, hl.z1 - hl.z0);
      const mats = [M.cutFace, M.quayWall, M.dockTop, M.concSide, M.cutFace, M.cutFace];
      const m = new THREE.Mesh(geo, mats);
      m.position.set((hl.x0 + hl.x1) / 2, (B + T) / 2, (hl.z0 + hl.z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }

    // 台阶（凹口内）
    {
      const n = 5, rise = 0.46 / n, run = 0.30;
      for (let i = 0; i < n; i++) {
        const y = -rise * (i + 1);
        const z = stepGap.z1 - run * (i + 1);
        const geo = new THREE.BoxGeometry(stepGap.x1 - stepGap.x0, rise, run);
        const m = new THREE.Mesh(geo, [M.concSide, M.concSide, M.dockTop, M.concSide, M.concSide, M.quayWall]);
        m.position.set((stepGap.x0 + stepGap.x1) / 2, y + rise / 2, z + run / 2);
        m.castShadow = true; m.receiveShadow = true;
        g.add(m);
      }
      // 下层平台
      const plat = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.22, 1.5), M.concSide);
      plat.position.set(7.6, -0.55, 4.9);
      plat.castShadow = true; plat.receiveShadow = true;
      g.add(plat);
      // 支撑桩
      for (const px of [6.1, 9.1]) {
        for (const pz of [4.4, 5.3]) {
          const leg = new THREE.Mesh(S.cyl(0.10, 0.10, 3.2, 8), M.concSide);
          leg.position.set(px, -2.2, pz);
          leg.castShadow = true;
          g.add(leg);
        }
      }
    }

    scene.add(g);
    return g;
  };

  /* ---------------- 堤岸细节 ---------------- */
  S.buildDockDetail = function (scene) {
    const g = new THREE.Group(); g.name = 'dockDetail';
    const T = W.dockY;

    // ---- 护轮坎（黄黑警示条）----
    const hazTex = S.tex(S.texHazard(256, 64), { repeat: [8, 1] });
    const hazMat = S.toon(0xffffff, { map: hazTex, spec: 0.25, shin: 30 });
    const hazTop = S.toon(0xdfdfd8, { spec: 0.3, shin: 40 });
    function curb(x, z, len, rotY, gap) {
      const geo = new THREE.BoxGeometry(len, 0.20, 0.34);
      const m = new THREE.Mesh(geo, [hazMat, hazMat, hazTop, M.concSide, hazMat, hazMat]);
      m.position.set(x, T + 0.10, z);
      m.rotation.y = rotY;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }
    // 前景堤岸北侧，留出台阶与滑道
    curb(-5.6, 5.62, 14.6, 0);
    curb(11.2, 5.62, 3.4, 0);
    // 左侧堤岸东侧
    curb(-4.12, 0.6, 9.6, Math.PI / 2);

    // ---- 斜坡滑道 ----
    {
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.22, 4.6), M.concSide);
      ramp.position.set(-1.2, -0.35, 6.6);
      ramp.rotation.x = -0.19;
      ramp.castShadow = true; ramp.receiveShadow = true;
      g.add(ramp);
      // 滑道边缘
      for (const sx of [-2.75, 0.35]) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.30, 4.6), M.concSide);
        e.position.set(sx, -0.22, 6.6); e.rotation.x = -0.19;
        e.castShadow = true; g.add(e);
      }
    }

    // ---- 系船环 ----
    const ringMat = S.toon(0x4a4f52, { spec: 0.45, shin: 30, rim: 0.1 });
    const rings = [
      { p: [1.4, -0.30, 5.47], r: [Math.PI / 2, 0, 0] },
      { p: [-2.9, -0.30, 5.47], r: [Math.PI / 2, 0, 0] },
      { p: [9.9, -0.30, 5.47], r: [Math.PI / 2, 0, 0] },
      { p: [-4.03, -0.30, 2.4], r: [0, Math.PI / 2, 0] },
      { p: [-4.03, -0.30, -1.6], r: [0, Math.PI / 2, 0] }
    ];
    for (const r of rings) {
      const grp = new THREE.Group();
      const plate = new THREE.Mesh(S.rbox(0.34, 0.34, 0.06, 0.02), ringMat);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.032, 6, 14), ringMat);
      tor.position.z = 0.09;
      grp.add(plate, tor);
      grp.position.set(r.p[0], r.p[1], r.p[2]);
      grp.rotation.set(r.r[0], r.r[1], r.r[2]);
      grp.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
      g.add(grp);
    }

    // ---- 锈蚀铁梯 ----
    {
      const rustMat = S.toon(0xffffff, { map: S.tex(S.texRust(256, 256, { base: [120, 118, 112], rust: [150, 84, 48], lo: 0.42, hi: 0.66 }), { repeat: [1, 3] }), spec: 0.3, shin: 26 });
      const grp = new THREE.Group();
      for (const dx of [-0.28, 0.28]) {
        const rail = new THREE.Mesh(S.cyl(0.035, 0.035, 3.9, 6), rustMat);
        rail.position.set(dx, -1.95, 0);
        rail.castShadow = true;
        grp.add(rail);
      }
      for (let i = 0; i < 12; i++) {
        const rung = new THREE.Mesh(S.cyl(0.026, 0.026, 0.56, 6), rustMat);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, -0.25 - i * 0.31, 0);
        rung.castShadow = true;
        grp.add(rung);
      }
      grp.position.set(-0.4, 0, 5.44);
      const ladderMeshes = [];
      grp.traverse(o => { if (o.isMesh) ladderMeshes.push(o); });
      ladderMeshes.forEach(o => S.addOutline(o, 0.7));
      g.add(grp);
    }

    // ---- 水洼 ----
    const puddles = [
      { x: 3.2, z: 8.2, rx: 2.1, rz: 1.2, rot: 0.3 },
      { x: -6.4, z: 7.6, rx: 1.5, rz: 0.9, rot: -0.5 },
      { x: 10.6, z: 9.4, rx: 1.2, rz: 0.7, rot: 0.9 },
      { x: -6.0, z: 2.6, rx: 1.3, rz: 0.8, rot: 1.2 },
      { x: 0.6, z: 10.6, rx: 1.7, rz: 0.8, rot: -0.2 },
      { x: 12.0, z: 7.2, rx: 0.9, rz: 0.6, rot: 0.4 }
    ];
    const pudMat = M.puddle;
    for (const p of puddles) {
      const geo = new THREE.CircleGeometry(1, 40);
      const m = new THREE.Mesh(geo, pudMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = p.rot;
      m.scale.set(p.rx, p.rz, 1);
      m.position.set(p.x, T + 0.012, p.z);
      m.renderOrder = 3;
      m.layers.set(1);
      g.add(m);
    }

    // ---- 伸缩缝 ----
    {
      const lineMat = S.toon(0xb7bdb8, { spec: 0.1 });
      for (let i = -2; i <= 2; i++) {
        const ln = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 7.4), lineMat);
        ln.position.set(i * 5.2, T + 0.006, 9.2);
        g.add(ln);
      }
      for (let i = -1; i <= 1; i++) {
        const ln = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.01, 0.05), lineMat);
        ln.position.set(-8.5, T + 0.006, i * 4.6 + 1.0);
        g.add(ln);
      }
    }

    // ---- 岸壁海藻（贴在墙面）----
    scene.add(g);
    return g;
  };

  /* ---------------- 水体 ---------------- */
  S.buildWater = function (scene) {
    const g = new THREE.Group(); g.name = 'water';

    // 水面
    const surf = [];
    for (const r of W.water) {
      const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0, 1, 1);
      const m = new THREE.Mesh(geo, M.water);
      m.rotation.x = -Math.PI / 2;
      m.position.set((r.x0 + r.x1) / 2, W.waterY, (r.z0 + r.z1) / 2);
      m.layers.set(1);
      m.renderOrder = 2;
      g.add(m); surf.push(m);
    }

    // 剖面：右侧
    {
      const r = W.water[0];
      const geo = new THREE.PlaneGeometry(r.z1 - r.z0, W.waterY - W.bottom);
      const m = new THREE.Mesh(geo, M.waterSide);
      m.rotation.y = -Math.PI / 2;
      m.position.set(r.x1, (W.waterY + W.bottom) / 2, (r.z0 + r.z1) / 2);
      m.renderOrder = 6;
      g.add(m);
    }
    // 剖面：远端
    {
      const r = W.water[1];
      const geo = new THREE.PlaneGeometry(r.x1 - r.x0, W.waterY - W.bottom);
      const m = new THREE.Mesh(geo, M.waterSide);
      m.position.set((r.x0 + r.x1) / 2, (W.waterY + W.bottom) / 2, r.z0);
      m.renderOrder = 6;
      g.add(m);
    }
    // 底面
    {
      const r = W.water[0];
      const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
      const m = new THREE.Mesh(geo, M.waterSide);
      m.rotation.x = Math.PI / 2;
      m.position.set((r.x0 + r.x1) / 2, W.bottom + 0.01, (r.z0 + r.z1) / 2);
      m.renderOrder = 6;
      g.add(m);
    }

    scene.add(g);
    return g;
  };

  /* ---------------- 海床与水下 ---------------- */
  S.buildSeabed = function (scene) {
    const g = new THREE.Group(); g.name = 'seabed';
    const y = W.seabedY;

    for (const r of W.water) {
      const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0);
      const m = new THREE.Mesh(geo, M.seabed);
      m.rotation.x = -Math.PI / 2;
      m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
      m.receiveShadow = true;
      g.add(m);
    }

    // 碎石
    const rockMat = S.toon(0x8a9488, { spec: 0.05 });
    const rockMat2 = S.toon(0x9aa398, { spec: 0.05 });
    const rnd = S.mulberry32(404);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const inst = new THREE.InstancedMesh(rockGeo, rockMat, 90);
    const inst2 = new THREE.InstancedMesh(rockGeo, rockMat2, 70);
    const d = new THREE.Object3D();
    for (let i = 0; i < 90; i++) {
      const r = W.water[i % 2];
      d.position.set(S.lerp(r.x0 + 0.3, r.x1 - 0.3, rnd()), y + 0.03, S.lerp(r.z0 + 0.3, r.z1 - 0.3, rnd()));
      const s = 0.08 + rnd() * 0.22;
      d.scale.set(s, s * (0.5 + rnd() * 0.4), s);
      d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
    }
    for (let i = 0; i < 70; i++) {
      const r = W.water[i % 2];
      d.position.set(S.lerp(r.x0 + 0.3, r.x1 - 0.3, rnd()), y + 0.02, S.lerp(r.z0 + 0.3, r.z1 - 0.3, rnd()));
      const s = 0.05 + rnd() * 0.13;
      d.scale.set(s, s * 0.6, s);
      d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      d.updateMatrix(); inst2.setMatrixAt(i, d.matrix);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    inst2.castShadow = true; inst2.receiveShadow = true;
    g.add(inst, inst2);

    // 旧轮胎
    const tireMat = S.toon(0x2f3436, { spec: 0.25, shin: 18 });
    const tires = [
      { p: [1.6, y + 0.30, -3.0], r: [0.3, 0.5, 0.2] },
      { p: [1.2, y + 0.20, -3.4], r: [1.4, 0.2, 0.3] },
      { p: [6.4, y + 0.26, 1.2], r: [0.2, 0.9, 1.2] },
      { p: [-2.2, y + 0.24, -10.4], r: [1.3, 0.4, 0.2] }
    ];
    for (const t of tires) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 8, 18), tireMat);
      m.position.set(t.p[0], t.p[1], t.p[2]);
      m.rotation.set(t.r[0], t.r[1], t.r[2]);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
    }

    // 锚链
    {
      const chainMat = S.toon(0x4b4a45, { spec: 0.3, shin: 20 });
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        pts.push(new THREE.Vector3(
          S.lerp(-3.0, 2.2, t) + Math.sin(t * 5) * 0.35,
          y + 0.10 + Math.sin(t * 9) * 0.05,
          S.lerp(-11.2, -8.4, t)
        ));
      }
      const linkGeo = new THREE.TorusGeometry(0.13, 0.045, 5, 10);
      const inst3 = new THREE.InstancedMesh(linkGeo, chainMat, 34);
      const dd = new THREE.Object3D();
      for (let i = 0; i < 34; i++) {
        const t = i / 33;
        const p = pts[Math.min(20, Math.round(t * 20))];
        dd.position.copy(p);
        dd.position.x += (i % 2 ? 0.06 : -0.06);
        dd.rotation.set(i % 2 ? Math.PI / 2 : 0, 0.4, i % 2 ? 0 : Math.PI / 2);
        dd.scale.setScalar(1);
        dd.updateMatrix();
        inst3.setMatrixAt(i, dd.matrix);
      }
      inst3.castShadow = true;
      g.add(inst3);
    }

    scene.add(g);
    return g;
  };

  /* ---------------- 浪花泡沫 ---------------- */
  S.buildFoam = function (scene) {
    const g = new THREE.Group(); g.name = 'foam';
    const c = S.makeCanvas(128, 128), ctx = c.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.45, 'rgba(240,252,252,0.55)');
    grd.addColorStop(1, 'rgba(230,250,250,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    const rnd = S.mulberry32(6060);
    const spots = [
      [11.0, 4.9, 1.0], [12.1, 4.0, 0.8], [10.2, 4.6, 0.7], [12.4, 5.1, 0.6],
      [-3.6, 5.0, 0.9], [-3.5, 2.4, 0.7], [-3.6, -1.2, 0.8], [-3.5, -6.4, 0.7],
      [3.0, -10.4, 1.2], [-1.0, -10.5, 1.0], [1.6, -10.6, 0.9], [4.0, -7.9, 0.8],
      [-3.6, -10.8, 1.0], [7.8, -7.6, 0.8]
    ];
    S.foams = [];
    for (const [x, z, s] of spots) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.5, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, W.waterY + 0.02, z);
      m.scale.set(1.6 * s, 1.1 * s, 1);
      m.layers.set(1);
      m.renderOrder = 4;
      g.add(m);
      S.foams.push({ m, ph: rnd() * 6.28, s });
    }
    scene.add(g);
    return g;
  };

  /* ---------------- 海草 ---------------- */
  S.buildSeaweed = function (scene) {
    const g = new THREE.Group(); g.name = 'seaweed';
    const rnd = S.mulberry32(2727);
    const y = S.seabedY || W.seabedY;
    const mat = S.toon(0x3f7a4e, { spec: 0.15, side: THREE.DoubleSide });
    const mat2 = S.toon(0x5a9a5e, { spec: 0.15, side: THREE.DoubleSide });
    const spots = [
      [-3.2, -2.0], [-2.6, 3.2], [1.2, -5.5], [4.2, 2.6], [7.2, -3.2],
      [2.2, 1.2], [-1.4, -7.8], [6.0, 3.6], [0.4, -10.5], [5.2, -8.2]
    ];
    S.seaweeds = [];
    for (let i = 0; i < spots.length; i++) {
      const grp = new THREE.Group();
      const n = 4 + (rnd() * 4 | 0);
      for (let k = 0; k < n; k++) {
        const h = 0.35 + rnd() * 0.55;
        const geo = new THREE.PlaneGeometry(0.07, h, 1, 4);
        geo.translate(0, h / 2, 0);
        const m = new THREE.Mesh(geo, k % 2 ? mat : mat2);
        m.position.set((rnd() - 0.5) * 0.28, 0, (rnd() - 0.5) * 0.28);
        m.rotation.y = rnd() * 3.14;
        grp.add(m);
      }
      grp.position.set(spots[i][0], y + 0.02, spots[i][1]);
      grp.userData.phase = rnd() * 6.28;
      g.add(grp);
      S.seaweeds.push(grp);
    }
    scene.add(g);
    return g;
  };

  /* ---------------- 消波块 ---------------- */
  S.tetrapodGeo = function () {
    const geos = [];
    const dirs = [
      [1, 1, 1], [-1, 1, -1], [-1, -1, 1], [1, -1, -1]
    ];
    for (const d of dirs) {
      const g = new THREE.CylinderGeometry(0.10, 0.34, 1.15, 5, 1);
      g.translate(0, 0.575, 0);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d).normalize());
      m.compose(new THREE.Vector3(0, 0, 0), q, new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      geos.push(g);
    }
    // 合并
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    let off = 0;
    for (const g of geos) {
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      pos.set(p, off * 3); nor.set(n, off * 3);
      off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    return out;
  };

  S.buildBreakwater = function (scene) {
    const g = new THREE.Group(); g.name = 'breakwater';
    const b = W.bw;
    const h = b.top - W.bottom;
    // 堤身（四周为带潮痕的混凝土沉箱）
    const bwWall = S.toon(0xffffff, { map: S.tex(S.texQuayWall(1024, 512, { seed: 9, wl: 0.19, barnacles: 90 }), { repeat: [2, 1] }), spec: 0.12, shin: 24 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, h, b.z1 - b.z0), [bwWall, bwWall, M.dockTop, M.concSide, bwWall, bwWall]);
    body.position.set((b.x0 + b.x1) / 2, W.bottom + h / 2, (b.z0 + b.z1) / 2);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    // 堤顶步道
    const walk = new THREE.Mesh(new THREE.BoxGeometry(b.x1 - b.x0, 0.14, b.z1 - b.z0 - 0.2), M.dockTop);
    walk.position.set((b.x0 + b.x1) / 2, b.top + 0.07, (b.z0 + b.z1) / 2);
    walk.castShadow = true; walk.receiveShadow = true;
    g.add(walk);
    // 外侧护面块
    const tpGeo = S.tetrapodGeo();
    const tpMat = S.toon(0xd7dad3, { spec: 0.16, shin: 26 });
    const inst = new THREE.InstancedMesh(tpGeo, tpMat, 26);
    const rnd = S.mulberry32(88);
    const d = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < 26; i++) {
      const x = S.lerp(b.x0 + 0.3, b.x1 - 0.3, rnd());
      const z = S.lerp(b.z0 - 0.55, b.z0 + 0.25, rnd());
      d.position.set(x, W.waterY - 0.25 + rnd() * 0.3, z);
      const s = 0.55 + rnd() * 0.35;
      d.scale.set(s, s, s);
      d.rotation.set(rnd() * 3.14, rnd() * 3.14, rnd() * 3.14);
      d.updateMatrix();
      inst.setMatrixAt(k++, d.matrix);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    g.add(inst);

    // 底座边角的消波块
    const corner = [
      [11.3, 4.7, 0.85, 0.4], [12.2, 3.8, 0.7, 1.1], [10.5, 4.3, 0.65, 2.2],
      [12.4, 5.0, 0.55, 0.7]
    ];
    for (const [x, z, sc, ry] of corner) {
      const tp = new THREE.Mesh(tpGeo, tpMat);
      tp.position.set(x, W.waterY - 0.18, z);
      tp.scale.setScalar(sc);
      tp.rotation.set(0.3, ry, 0.2);
      tp.castShadow = true; tp.receiveShadow = true;
      g.add(tp);
    }

    scene.add(g);
    return g;
  };

  /* ---------------- 灯塔 ---------------- */
  S.buildLighthouse = function (scene) {
    const g = new THREE.Group(); g.name = 'lighthouse';
    const p = W.lighthouse;
    const baseY = W.bw.top + 0.14;

    const white = S.toon(0xe9ece6, { spec: 0.3, shin: 40 });
    const red = S.toon(0xd8503f, { spec: 0.3, shin: 40 });
    const dark = S.toon(0x3b4448, { spec: 0.4, shin: 30 });

    // 基座
    const base = new THREE.Mesh(S.cyl(0.62, 0.75, 0.30, 16), white);
    base.position.y = baseY + 0.15;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);

    // 塔身（红白相间）
    const segs = 5, sh = 0.40;
    for (let i = 0; i < segs; i++) {
      const r0 = 0.52 - i * 0.028, r1 = 0.52 - (i + 1) * 0.028;
      const m = new THREE.Mesh(S.cyl(r1, r0, sh, 16), i % 2 === 0 ? white : red);
      m.position.y = baseY + 0.30 + sh * (i + 0.5);
      m.castShadow = true; m.receiveShadow = true;
      S.addOutline(m, 0.9);
      g.add(m);
    }
    const topY = baseY + 0.30 + sh * segs;

    // 环廊
    const gallery = new THREE.Mesh(S.cyl(0.66, 0.66, 0.08, 16), dark);
    gallery.position.y = topY + 0.04;
    gallery.castShadow = true;
    g.add(gallery);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      const post = new THREE.Mesh(S.cyl(0.018, 0.018, 0.26, 5), dark);
      post.position.set(Math.cos(a) * 0.62, topY + 0.20, Math.sin(a) * 0.62);
      g.add(post);
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 5, 20), dark);
    rail.rotation.x = Math.PI / 2; rail.position.y = topY + 0.33;
    g.add(rail);

    // 灯室
    const lampY = topY + 0.10;
    const lampGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.40, 0.44, 0.52, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff3c8, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    lampGlass.position.y = lampY + 0.26;
    g.add(lampGlass);
    const lampCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.20, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff6d0 })
    );
    lampCore.position.y = lampY + 0.26;
    g.add(lampCore);
    // 顶盖
    const cap = new THREE.Mesh(S.cyl(0.06, 0.50, 0.34, 12), red);
    cap.position.y = lampY + 0.69;
    cap.castShadow = true;
    S.addOutline(cap, 0.9);
    g.add(cap);
    const finial = new THREE.Mesh(S.cyl(0.03, 0.05, 0.16, 6), dark);
    finial.position.y = lampY + 0.92;
    g.add(finial);

    // 光晕（白天暗时亮）
    const glowMat = new THREE.SpriteMaterial({
      color: 0xfff0b8, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(2.4, 2.4, 1);
    glow.position.y = lampY + 0.26;
    glow.layers.set(1);
    g.add(glow);
    g.userData.glow = glow;
    g.userData.lampCore = lampCore;
    g.userData.lampGlass = lampGlass;

    g.position.set(p.x, 0, p.z);
    scene.add(g);
    S.lighthouse = g;
    return g;
  };

  /* ---------------- 山坡 ---------------- */
  S.hillHeight = function (x, z) {
    const h = W.hill;
    const u = (x - h.x0) / (h.x1 - h.x0);
    const v = (z - h.z0) / (h.z1 - h.z0);
    const t = S.clamp(u * 0.62 + (1 - v) * 0.38, 0, 1);
    let hh = Math.pow(t, 1.45) * 3.1;
    hh += S.fbm(x * 0.42 + 10, z * 0.42 + 3, 3) * 0.55;
    hh *= S.smooth(0, 0.30, Math.min(u * 2.2, (1 - v) * 2.2));
    return hh;
  };

  S.buildHill = function (scene) {
    const g = new THREE.Group(); g.name = 'hill';
    const h = W.hill;
    const cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2;
    const w = h.x1 - h.x0, dd = h.z1 - h.z0;

    const geo = new THREE.PlaneGeometry(w, dd, 20, 20);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
      pos.setY(i, S.hillHeight(x, z) + 0.04);
    }
    geo.computeVertexNormals();
    const hillMat = S.toon(0x9dc08a, { spec: 0.02 });
    const m = new THREE.Mesh(geo, hillMat);
    m.position.set(cx, W.dockY, cz);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);

    // 挡土墙
    const wallMat = S.toon(0xc9cfc8, { spec: 0.1 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.3), wallMat);
    wall.position.set(cx, 0.45, h.z1 - 0.15);
    wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);

    scene.add(g);
    return g;
  };

  /* ---------------- 更新 ---------------- */
  S.updateBase = function (t) {
    if (S.foams) {
      for (const f of S.foams) {
        const k = 0.5 + 0.5 * Math.sin(t * 1.6 + f.ph);
        f.m.material.opacity = 0.22 + k * 0.38;
        const sc = f.s * (0.85 + k * 0.25);
        f.m.scale.set(1.6 * sc, 1.1 * sc, 1);
        f.m.position.y = W.waterY + 0.02 + Math.sin(t * 1.1 + f.ph) * 0.01;
      }
    }
    if (S.seaweeds) {
      for (const sw of S.seaweeds) {
        const p = sw.userData.phase;
        sw.rotation.z = Math.sin(t * 0.9 + p) * 0.16;
        sw.rotation.x = Math.cos(t * 0.7 + p * 1.3) * 0.12;
      }
    }
    if (M.water) {
      M.water.uniforms.uTime.value = t;
      M.water.uniforms.uSun.value = S.sun;
      M.water.uniforms.uRain.value = S.rain;
    }
    if (M.waterSide) M.waterSide.uniforms.uTime.value = t;
    if (M.puddle) {
      M.puddle.uniforms.uTime.value = t;
      M.puddle.uniforms.uRain.value = S.rain;
    }
  };

})(window);
