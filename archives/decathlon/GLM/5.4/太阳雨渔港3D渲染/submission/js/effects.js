/* ============================================================
   effects.js — 雨 / 光柱 / 云影 / 彩虹 / 远景 / 滴水
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  const FX = {};

  /* ---------------- 雨 ---------------- */
  S.buildRain = function (scene) {
    const N = 2600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const seed = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    const rnd = S.mulberry32(1234);
    for (let i = 0; i < N; i++) {
      const x = (rnd() * 2 - 1) * 20;
      const y = rnd();
      const z = (rnd() * 2 - 1) * 20;
      for (let k = 0; k < 2; k++) {
        const idx = (i * 2 + k);
        seed[idx * 3] = x; seed[idx * 3 + 1] = y; seed[idx * 3 + 2] = z;
        end[idx] = k;
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: 0 },
        uRain: { value: 0.5 },
        uColor: { value: new THREE.Color(0xfff2cc) }
      },
      vertexShader: `
        attribute vec3 aSeed;
        attribute float aEnd;
        uniform float uTime; uniform float uWind; uniform float uRain;
        varying float vA;
        varying float vWy;
        void main(){
          float speed = 13.0 + aSeed.y * 3.0;
          float span = 22.0;
          float t = fract( uTime * speed / span + aSeed.y * 7.13 );
          vec3 p;
          p.x = aSeed.x + uWind * 1.6 + t * (1.1 + uWind * 2.2);
          p.y = 15.0 - t * span;
          p.z = aSeed.z + t * 0.55;
          // 雨丝长度
          float len = 0.42 + aSeed.x * 0.01;
          p.y += aEnd * len;
          p.x -= aEnd * len * 0.28;
          p.z -= aEnd * len * 0.12;
          // 稀疏（雨势）
          float vis = step( aSeed.y, 0.35 + uRain * 0.65 );
          vA = vis * ( 0.16 + 0.30 * uRain ) * ( 0.55 + 0.45 * aSeed.x );
          // 落到水面附近渐隐（水面 y=-0.62）
          vA *= smoothstep( -0.66, -0.30, p.y );
          vWy = p.y;
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vA;
        varying float vWy;
        void main(){
          if ( vWy < -0.62 ) discard;
          gl_FragColor = vec4( uColor, vA );
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    rain.layers.set(1);
    rain.renderOrder = 8;
    scene.add(rain);
    FX.rain = mat;
    return rain;
  };

  /* ---------------- 光柱 ---------------- */
  S.makeShaft = function (opts) {
    const geo = new THREE.CylinderGeometry(0.02, opts.radius || 0.8, opts.length || 4, 14, 1, true);
    geo.translate(0, -(opts.length || 4) / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color === undefined ? 0xfff0c8 : opts.color) },
        uStr: { value: opts.strength === undefined ? 0.30 : opts.strength },
        uTime: { value: 0 },
        uSun: { value: 1 }
      },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          vN = normalize( normalMatrix * normal );
          vV = normalize( -mv.xyz );
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uStr; uniform float uTime; uniform float uSun;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          float along = pow( 1.0 - vUv.y, 1.6 );
          float edge = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 1.3 );
          float flick = 0.90 + 0.10 * sin( uTime * 1.7 + vUv.x * 9.0 );
          float a = along * edge * uStr * uSun * flick;
          gl_FragColor = vec4( uColor, a );
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    const m = new THREE.Mesh(geo, mat);
    m.layers.set(1);
    m.renderOrder = 7;
    S.shafts = S.shafts || [];
    S.shafts.push(mat);
    return m;
  };

  /* ---------------- 云影 ---------------- */
  S.buildCloudShadow = function (scene) {
    const geo = new THREE.PlaneGeometry(30, 30, 1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSun: { value: 1 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uSun;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          vec2 u = f*f*(3.0-2.0*f);
          return mix( mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y );
        }
        void main(){
          vec2 p = vUv * 3.2 + vec2( uTime * 0.030, uTime * 0.017 );
          float n = noise(p) * 0.6 + noise(p * 2.3) * 0.3 + noise(p * 5.1) * 0.1;
          float a = smoothstep( 0.52, 0.86, n ) * 0.30 * ( 1.0 - uSun * 0.35 );
          gl_FragColor = vec4( 0.09, 0.20, 0.24, a );
        }`,
      transparent: true, depthWrite: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.02, 0);
    m.layers.set(1);
    m.renderOrder = 4;
    scene.add(m);
    FX.cloud = mat;
    return m;
  };

  /* ---------------- 彩虹 ---------------- */
  S.buildRainbow = function (scene) {
    const geo = new THREE.TorusGeometry(30, 2.2, 8, 60, Math.PI * 0.72);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uOp: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uOp; uniform float uTime;
        varying vec2 vUv;
        void main(){
          float band = fract( vUv.y * 3.0 + vUv.x * 0.6 );
          vec3 col = 0.5 + 0.5 * cos( 6.2832 * ( band + vec3( 0.0, 0.33, 0.67 ) ) );
          float edge = smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 1.0, 0.75, vUv.y );
          float a = uOp * edge * 0.30;
          gl_FragColor = vec4( col, a );
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(-2, 2, -46);
    m.rotation.z = 0.25;
    m.layers.set(1);
    m.renderOrder = 6;
    scene.add(m);
    FX.rainbow = mat;
    return m;
  };

  /* ---------------- 远处防波堤 ---------------- */
  S.buildDistantBreakwater = function (scene) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xcfe4ea, transparent: true, opacity: 0.55, depthWrite: false });
    const mat2 = new THREE.MeshBasicMaterial({ color: 0xdceef2, transparent: true, opacity: 0.5, depthWrite: false });
    const bw = new THREE.Mesh(new THREE.BoxGeometry(110, 1.1, 3.0), mat);
    bw.position.set(0, -0.85, -62);
    g.add(bw);
    const top = new THREE.Mesh(new THREE.BoxGeometry(110, 0.22, 3.3), mat2);
    top.position.set(0, -0.25, -62);
    g.add(top);
    // 小灯塔
    const lh = new THREE.Group();
    const body = new THREE.Mesh(S.cyl(0.55, 0.7, 4.2, 8), mat2);
    body.position.y = 2.0;
    lh.add(body);
    const band = new THREE.Mesh(S.cyl(0.57, 0.6, 1.0, 8), new THREE.MeshBasicMaterial({ color: 0xcf7a62, transparent: true, opacity: 0.55 }));
    band.position.y = 2.6;
    lh.add(band);
    const cap = new THREE.Mesh(S.cyl(0.08, 0.62, 0.7, 8), mat2);
    cap.position.y = 4.4;
    lh.add(cap);
    lh.position.set(-24, -0.3, -62);
    g.add(lh);
    // 远处的渔船剪影
    const boats = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.9), mat2);
      hull.position.y = 0.28;
      b.add(hull);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.75, 0.75), mat2);
      cab.position.set(-0.3, 0.9, 0);
      b.add(cab);
      b.position.set(-40 + i * 20, -0.35, -70 - i * 4);
      b.userData.speed = 0.20 + i * 0.07;
      b.userData.phase = i * 2.1;
      boats.add(b);
      if (!S.distantBoats) S.distantBoats = [];
      S.distantBoats.push(b);
    }
    g.add(boats);
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    scene.add(g);
    return g;
  };

  /* ---------------- 滴水 ---------------- */
  S.buildUnderwater = function (scene) {
    // 水下光柱
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.CylinderGeometry(0.25 + i * 0.1, 1.4 + i * 0.2, 4.2, 10, 1, true);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uSun: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uSun;
          varying vec2 vUv;
          void main(){
            float a = (1.0 - vUv.y) * 0.16 * uSun;
            a *= 0.7 + 0.3 * sin( uTime * 0.9 + vUv.x * 12.0 );
            gl_FragColor = vec4( 0.75, 0.95, 0.95, a );
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(1.5 + i * 2.2, -2.4, -2.0 + i * 1.6);
      m.layers.set(1);
      m.renderOrder = 6;
      scene.add(m);
      if (!S.uwShafts) S.uwShafts = [];
      S.uwShafts.push(mat);
    }
    // 悬浮颗粒
    const N = 160;
    const geo = new THREE.SphereGeometry(0.022, 4, 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xdff2f4, transparent: true, opacity: 0.55 });
    const inst = new THREE.InstancedMesh(geo, mat, N);
    inst.frustumCulled = false;
    const rnd = S.mulberry32(31337);
    const data = [];
    for (let i = 0; i < N; i++) {
      data.push({ x: -3.4 + rnd() * 15, y: -3.6 + rnd() * 3.0, z: -12 + rnd() * 16, s: 0.5 + rnd() * 1.4, ph: rnd() * 6.28 });
    }
    scene.add(inst);
    S.uwParticles = { inst, data };
  };

  S.buildDrips = function (scene) {
    const N = 60;
    const geo = new THREE.SphereGeometry(0.022, 5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xeafcff, transparent: true, opacity: 0.75 });
    const inst = new THREE.InstancedMesh(geo, mat, N);
    inst.frustumCulled = false;
    inst.layers.set(1);
    const rnd = S.mulberry32(555);
    const sources = [
      { p: [9.62, 1.30, 6.30], r: 0.62 },   // 雨伞
      { p: [-3.15, 0.72, 4.0], r: 0.5 },    // 船舷
      { p: [1.3, 0.72, 4.2], r: 0.5 },
      { p: [11.2, 3.3, 6.4], r: 0.36 },     // 灯罩
      { p: [-6.6, 3.3, 6.4], r: 0.36 }
    ];
    const data = [];
    for (let i = 0; i < N; i++) {
      const s = sources[i % sources.length];
      data.push({
        x: s.p[0] + (rnd() * 2 - 1) * s.r,
        y: s.p[1],
        z: s.p[2] + (rnd() * 2 - 1) * s.r,
        t: rnd(),
        sp: 0.5 + rnd() * 0.7
      });
    }
    scene.add(inst);
    FX.drips = { inst, data };
    return inst;
  };

  /* ---------------- 组装 ---------------- */
  S.buildEffects = function (scene) {
    S.buildRain(scene);
    S.buildCloudShadow(scene);
    S.buildRainbow(scene);
    S.buildDistantBreakwater(scene);
    S.buildDrips(scene);
    S.buildUnderwater(scene);

    // 仓库光柱（从东面开口射入）
    const shaft = S.makeShaft({ radius: 2.2, length: 6.0, color: 0xffe9b8, strength: 0.22 });
    shaft.position.set(-8.6, 2.6, 2.8);
    shaft.rotation.set(0, 0, 1.15);
    shaft.rotation.x = 0.15;
    scene.add(shaft);
    // 高窗光柱
    const shaft2 = S.makeShaft({ radius: 1.1, length: 4.2, color: 0xfff2cc, strength: 0.16 });
    shaft2.position.set(-8.5, 3.55, 2.8);
    shaft2.rotation.set(0.12, 0, 1.25);
    scene.add(shaft2);
    // 候船室光柱
    const shaft3 = S.makeShaft({ radius: 0.9, length: 3.4, color: 0xfff0c0, strength: 0.12 });
    shaft3.position.set(-8.7, 1.8, -2.6);
    shaft3.rotation.set(0.1, 0, 1.3);
    scene.add(shaft3);

    return scene;
  };

  S.updateEffects = function (t) {
    if (FX.rain) {
      FX.rain.uniforms.uTime.value = t;
      FX.rain.uniforms.uWind.value = S.wind;
      FX.rain.uniforms.uRain.value = S.rain;
    }
    if (FX.cloud) {
      FX.cloud.uniforms.uTime.value = t;
      FX.cloud.uniforms.uSun.value = S.sun;
    }
    if (FX.rainbow) {
      const weak = S.clamp((0.52 - S.rain) / 0.3, 0, 1);
      const fade = S.smooth(0.0, 1.0, weak);
      FX.rainbow.uniforms.uOp.value = fade * 0.85;
      FX.rainbow.uniforms.uTime.value = t;
    }
    if (S.shafts) {
      for (const m of S.shafts) {
        m.uniforms.uTime.value = t;
        m.uniforms.uSun.value = S.sun;
      }
    }
    if (FX.drips) {
      const d = FX.drips;
      const o = new THREE.Object3D();
      for (let i = 0; i < d.data.length; i++) {
        const p = d.data[i];
        const tt = (t * p.sp + p.t) % 1.0;
        const fall = tt * tt * 2.6;
        o.position.set(p.x, p.y - fall, p.z);
        const s = 0.6 + 0.8 * Math.sin(tt * Math.PI);
        o.scale.set(s, s * 1.8, s);
        o.updateMatrix();
        d.inst.setMatrixAt(i, o.matrix);
      }
      d.inst.instanceMatrix.needsUpdate = true;
    }
    if (S.uwShafts) for (const m of S.uwShafts) { m.uniforms.uTime.value = t; m.uniforms.uSun.value = S.sun; }
    if (S.uwParticles) {
      const u = S.uwParticles;
      const o = new THREE.Object3D();
      for (let i = 0; i < u.data.length; i++) {
        const d = u.data[i];
        o.position.set(d.x + Math.sin(t * 0.3 + d.ph) * 0.12, d.y + Math.sin(t * 0.45 + d.ph * 2) * 0.10, d.z + Math.cos(t * 0.25 + d.ph) * 0.12);
        o.scale.setScalar(d.s);
        o.updateMatrix();
        u.inst.setMatrixAt(i, o.matrix);
      }
      u.inst.instanceMatrix.needsUpdate = true;
    }
    if (S.distantBoats) {
      for (const b of S.distantBoats) {
        const sp = b.userData.speed;
        b.position.x = ((b.position.x + sp * 0.016 + 40) % 80) - 40;
        b.position.y = -0.2 + Math.sin(t * 0.5 + b.userData.phase) * 0.05;
        b.rotation.z = Math.sin(t * 0.45 + b.userData.phase) * 0.02;
      }
    }
    // 灯塔白天偶尔亮起
    if (S.lighthouse) {
      const lh = S.lighthouse;
      const dark = S.clamp((0.55 - S.sun) / 0.25, 0, 1);
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.2);
      lh.userData.glow.material.opacity = dark * 0.55 * pulse;
      lh.userData.lampCore.material.color.setHex(0xfff6d0);
      lh.userData.lampGlass.material.opacity = 0.35 + dark * 0.5;
    }
  };

})(window);
