/* ============================================================
   life.js — 海鸥 / 港猫 / 鱼群 / 出港渔船与航迹
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  const L = {};

  /* ---------------- 海鸥 ---------------- */
  function makeGull() {
    const g = new THREE.Group();
    const white = S.toon(0xfdfdFA, { spec: 0.25, shin: 40, rim: 0.1 });
    const gray = S.toon(0xb9c6cc, { spec: 0.25, shin: 40 });
    const beakMat = S.toon(0xe8a03c, { spec: 0.3, shin: 40 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), white);
    body.scale.set(0.095, 0.095, 0.235);
    body.castShadow = true;
    g.add(body);
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), gray);
    back.scale.set(0.085, 0.06, 0.19);
    back.position.set(0, 0.055, 0.01);
    g.add(back);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), white);
    head.position.set(0, 0.05, -0.19);
    g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 5), beakMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, 0.04, -0.28);
    g.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), gray);
    tail.rotation.x = Math.PI / 2;
    tail.position.set(0, 0.01, 0.20);
    tail.scale.set(1, 1, 0.3);
    g.add(tail);
    // 翅膀
    const wingGeo = new THREE.PlaneGeometry(0.34, 0.16, 4, 1);
    wingGeo.translate(0.17, 0, 0);
    const wl = new THREE.Mesh(wingGeo, white);
    wl.rotation.x = -Math.PI / 2;
    wl.position.set(-0.06, 0.03, 0);
    wl.castShadow = true;
    const wr = new THREE.Mesh(wingGeo.clone(), white);
    wr.rotation.x = -Math.PI / 2;
    wr.rotation.z = Math.PI;
    wr.position.set(0.06, 0.03, 0);
    wr.castShadow = true;
    // 翼尖灰
    const tipGeo = new THREE.PlaneGeometry(0.12, 0.15);
    tipGeo.translate(0.29, 0, 0);
    const tl = new THREE.Mesh(tipGeo, gray);
    tl.rotation.x = -Math.PI / 2; tl.position.set(-0.06, 0.032, 0);
    const tr = new THREE.Mesh(tipGeo.clone(), gray);
    tr.rotation.x = -Math.PI / 2; tr.rotation.z = Math.PI; tr.position.set(0.06, 0.032, 0);
    g.add(wl, wr, tl, tr);
    g.userData.wings = [wl, wr];
    g.userData.tips = [tl, tr];
    g.scale.setScalar(1.9);
    return g;
  }

  S.buildGulls = function (scene) {
    const gulls = [];
    const perches = [
      { p: [-2.4, 0.80, 6.15], r: 0.5 },     // 系船柱
      { p: [0.9, 0.80, 6.15], r: -0.4 },
      { p: [-3.15, 1.55, 4.0], r: 0.2 },     // 船顶栏杆
      { p: [1.3, 1.55, 4.62], r: 1.2 },
      { p: [3.0, 0.05, 2.2], r: 0 },         // 水面
      { p: [5.5, 0.05, -1.5], r: 0 },
      { p: [-4.0, 0.80, -0.6], r: 0.3 }
    ];
    for (let i = 0; i < 7; i++) {
      const g = makeGull();
      const perch = perches[i % perches.length];
      g.userData.perch = new THREE.Vector3(perch.p[0], perch.p[1], perch.p[2]);
      g.userData.perchRot = perch.r;
      g.userData.idx = i;
      g.userData.startle = 0;
      g.userData.flap = 0;
      g.userData.cycle = 26 + i * 3.1;
      g.userData.offset = i * 5.7;
      g.userData.radius = 7 + (i % 3) * 2.2;
      g.userData.height = 7.5 + (i % 4) * 1.1;
      g.userData.center = new THREE.Vector3(-1 + (i % 3) * 2.0, 0, -1.5 + (i % 2) * 2.2);
      scene.add(g);
      gulls.push(g);
    }
    S.gulls = gulls;
    return gulls;
  };

  S.updateGulls = function (t, dt) {
    if (!S.gulls) return;
    const camPos = S.camera.position;
    for (const g of S.gulls) {
      const u = g.userData;
      const cyc = u.cycle;
      const ph = ((t + u.offset) % cyc) / cyc;
      // 停歇区间内的平滑起降
      const landIn = S.smooth(0.545, 0.60, ph);
      const takeOff = 1 - S.smooth(0.875, 0.935, ph);
      let perchedK = Math.min(landIn, takeOff);
      // 镜头靠近则惊飞（纯函数：最近 0.45s 内的最近距离）
      let close = 0;
      for (let k = 0; k < 5; k++) {
        const tt = Math.max(0, t - k * 0.09);
        const p = S.exportMode ? S.tourCameraPoseAt(tt).pos : camPos;
        const d = p.distanceTo(u.perch);
        close = Math.max(close, 1 - S.smooth(4.0, 5.6, d));
      }
      u.startle = perchedK * (1 - close);
      const k = S.clamp(u.startle, 0, 1);

      // 飞行路径
      const a = t * (0.30 + u.idx * 0.013) + u.idx * 1.7;
      const R = u.radius * (0.85 + 0.15 * Math.sin(t * 0.21 + u.idx));
      const fx = u.center.x + Math.cos(a) * R;
      const fz = u.center.z + Math.sin(a) * R * 0.8;
      const fy = u.height + Math.sin(t * 0.7 + u.idx * 2.1) * 1.2
        + Math.sin(a * 2.0) * 0.5 - Math.max(0, Math.sin(a * 1.0)) * 1.6;
      const tangent = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a) * 0.8).normalize();
      const yaw = Math.atan2(tangent.x, tangent.z);

      const px = u.perch.x, py = u.perch.y, pz = u.perch.z;
      g.position.set(
        S.lerp(px, fx, 1 - k),
        S.lerp(py, fy, 1 - k),
        S.lerp(pz, fz, 1 - k)
      );
      if (k > 0.5) {
        g.rotation.set(0, 0, 0);
        g.rotation.y = u.perchRot;
        g.rotation.z = Math.sin(t * 1.1 + u.idx) * 0.03;
      } else {
        g.rotation.set(0, yaw + Math.PI, 0);
        g.rotation.z = Math.sin(t * 1.3 + u.idx) * 0.25;
        g.rotation.x = Math.sin(t * 0.9 + u.idx) * 0.12;
      }
      // 翅膀
      const flap = Math.sin(t * 9.0 + u.idx) * 0.85 * (1 - k) - 1.35 * k;
      const fold = k;
      for (let w = 0; w < 2; w++) {
        const wing = u.wings[w];
        const tip = u.tips[w];
        const sgn = w === 0 ? 1 : -1;
        wing.rotation.y = sgn * flap * (1 - fold * 0.55);
        wing.rotation.z = sgn * (fold * 1.15 + 0.1);
        tip.rotation.y = sgn * flap * (1 - fold * 0.55);
        tip.rotation.z = sgn * (fold * 1.15 + 0.1);
      }
    }
  };

  /* ---------------- 港猫 ---------------- */
  S.buildCat = function (scene) {
    const g = new THREE.Group();
    const fur = S.toon(0xf2ede2, { spec: 0.25, shin: 30, rim: 0.12 });
    const patch = S.toon(0xd98a4a, { spec: 0.25, shin: 30 });
    const dark = S.toon(0x3a3a3c, { spec: 0.3, shin: 40 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), fur);
    body.scale.set(0.085, 0.085, 0.17);
    body.position.y = 0.12;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), fur);
    head.position.set(0, 0.20, -0.15);
    head.castShadow = true;
    g.add(head);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), patch);
    muzzle.position.set(0, 0.175, -0.215);
    g.add(muzzle);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.07, 4), patch);
      ear.position.set(sx * 0.045, 0.265, -0.15);
      ear.rotation.z = sx * 0.18;
      g.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), dark);
      eye.position.set(sx * 0.03, 0.215, -0.215);
      g.add(eye);
    }
    // 腿
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(S.cyl(0.018, 0.016, 0.12, 5), fur);
        leg.position.set(sx * 0.045, 0.06, sz * 0.10);
        leg.castShadow = true;
        g.add(leg);
      }
    }
    // 尾巴
    const tailPts = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      tailPts.push(new THREE.Vector3(0, 0.14 + Math.sin(u * 2.2) * 0.10, 0.14 + u * 0.20));
    }
    const tailCurve = new THREE.CatmullRomCurve3(tailPts);
    const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, 0.016, 5, false), patch);
    tail.castShadow = true;
    g.add(tail);
    // 花斑
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), patch);
    spot.scale.set(1, 0.55, 1.2);
    spot.position.set(0.03, 0.19, 0.03);
    g.add(spot);
    g.scale.setScalar(1.35);
    g.userData.legs = [];
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    S.cat = g;
    return g;
  };

  // 猫的行走路径（按趟生成，确定性）
  S.catPathAt = function (journey) {
    const rnd = S.mulberry32(1000 + journey * 37);
    const pts = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      pts.push(new THREE.Vector3(
        -8.0 + rnd() * 12.0,
        0,
        6.4 + rnd() * 5.6
      ));
    }
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.4);
  };

  S.updateCat = function (t, dt) {
    if (!S.cat) return;
    const cat = S.cat;
    const hide = new THREE.Vector3(-6.18, 0, 8.32);
    const rain = S.rain;
    const out = S.smooth(0.62, 0.40, rain);
    const JOURNEY = 16;
    const ji = Math.floor(t / JOURNEY);
    const lt = (t % JOURNEY) / JOURNEY;
    const curve = S.catPathAt(ji);
    const p = curve.getPoint(S.clamp(lt * 1.15, 0, 1));
    const p2 = curve.getPoint(S.clamp(lt * 1.15 + 0.02, 0, 1));
    const yaw = Math.atan2(p2.x - p.x, p2.z - p.z);

    const x = S.lerp(hide.x, p.x, out);
    const z = S.lerp(hide.z, p.z, out);
    cat.position.set(x, 0.0, z);
    // 看向镜头
    const toCam = S.camera.position.clone().sub(cat.position);
    const dCam = toCam.length();
    let lookYaw = yaw;
    if (dCam < 7.0 && out > 0.5) {
      lookYaw = Math.atan2(toCam.x, toCam.z);
    }
    cat.rotation.y = lookYaw;
    // 走路起伏
    const walk = out > 0.6 ? Math.sin(t * 7.0) * 0.012 : 0;
    cat.position.y = Math.abs(walk) * 0.6;
    cat.rotation.z = out > 0.6 ? Math.sin(t * 7.0) * 0.02 : 0;
    // 尾巴摆动
    cat.children.forEach((c, i) => {
      if (c.geometry && c.geometry.type === 'TubeGeometry') {
        c.rotation.y = Math.sin(t * 1.4) * 0.25;
      }
    });
  };

  /* ---------------- 鱼群 ---------------- */
  S.buildFish = function (scene) {
    const N = 46;
    const geo = S.fishGeo();
    const mat = S.toon(0xe8c06a, { spec: 0.4, shin: 60, rim: 0.2 });
    const mat2 = S.toon(0x9fd0d8, { spec: 0.4, shin: 60 });
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const inst2 = new THREE.InstancedMesh(geo, mat2, N);
    inst.frustumCulled = false; inst2.frustumCulled = false;
    const rnd = S.mulberry32(4321);
    const data = [];
    for (let i = 0; i < N; i++) {
      data.push({
        cx: -1 + rnd() * 8,
        cz: -6 + rnd() * 10,
        cy: -1.4 - rnd() * 1.8,
        r: 0.5 + rnd() * 1.6,
        sp: 0.35 + rnd() * 0.5,
        ph: rnd() * 6.28,
        dir: rnd() < 0.5 ? 1 : -1
      });
    }
    scene.add(inst, inst2);
    S.fish = { inst, inst2, data, rnd: 0 };
    return inst;
  };

  S.updateFish = function (t, dt) {
    if (!S.fish) return;
    const f = S.fish;
    const o = new THREE.Object3D();
    const camPos = S.camera.position;
    // 镜头靠近时散开
    let scatter = 0;
    const center = new THREE.Vector3(3, -1.8, -2);
    if (camPos.distanceTo(center) < 12) scatter = 1;
    if (f._s === undefined) f._s = 0;
    f._s += (scatter - f._s) * Math.min(1, (dt || 0.016) * 3.0);
    const sc = f._s;

    for (let i = 0; i < f.data.length; i++) {
      const d = f.data[i];
      const a = t * d.sp * d.dir + d.ph;
      const rr = d.r * (1 + sc * 1.8);
      const x = d.cx + Math.cos(a) * rr;
      const z = d.cz + Math.sin(a) * rr;
      const y = d.cy + Math.sin(a * 1.7 + d.ph) * 0.18;
      o.position.set(x, y, z);
      o.rotation.set(0, -a * d.dir + (d.dir > 0 ? 0 : Math.PI), Math.sin(a * 3) * 0.1);
      const s = 0.8 + (i % 3) * 0.25;
      o.scale.set(s, s, s);
      o.updateMatrix();
      if (i % 2 === 0) f.inst.setMatrixAt(i / 2, o.matrix);
      else f.inst2.setMatrixAt((i - 1) / 2, o.matrix);
    }
    f.inst.count = Math.ceil(f.data.length / 2);
    f.inst2.count = Math.floor(f.data.length / 2);
    f.inst.instanceMatrix.needsUpdate = true;
    f.inst2.instanceMatrix.needsUpdate = true;
  };

  /* ---------------- 出港渔船与航迹 ---------------- */
  S.buildHeroTrip = function (scene) {
    const pts = [
      new THREE.Vector3(1.3, 0, 4.62),
      new THREE.Vector3(2.1, 0, 2.2),
      new THREE.Vector3(4.6, 0, -1.8),
      new THREE.Vector3(5.6, 0, -6.2),
      new THREE.Vector3(6.0, 0, -9.6),
      new THREE.Vector3(5.2, 0, -11.8),
      new THREE.Vector3(2.6, 0, -12.2),
      new THREE.Vector3(-0.6, 0, -11.9),
      new THREE.Vector3(-1.8, 0, -11.0),
      new THREE.Vector3(0.4, 0, -10.6),
      new THREE.Vector3(2.6, 0, -10.2),
      new THREE.Vector3(4.2, 0, -8.6),
      new THREE.Vector3(4.9, 0, -5.0),
      new THREE.Vector3(4.6, 0, -1.0),
      new THREE.Vector3(3.2, 0, 2.0),
      new THREE.Vector3(1.3, 0, 4.62)
    ];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.25);
    S.heroCurve = curve;

    // 航迹带
    const SEG = 220;
    const pos = [], idx = [], aT = [], aSide = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const w = 0.55;
      pos.push(p.x - side.x * w, S.W.waterY + 0.03, p.z - side.z * w);
      pos.push(p.x + side.x * w, S.W.waterY + 0.03, p.z + side.z * w);
      aT.push(u, u);
      aSide.push(-1, 1);
      if (i < SEG) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    geo.setIndex(idx);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uProg: { value: -1 },
        uTime: { value: 0 },
        uOp: { value: 1 }
      },
      vertexShader: `
        attribute float aT; attribute float aSide;
        varying float vT; varying float vSide;
        void main(){
          vT = aT; vSide = aSide;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`,
      fragmentShader: `
        uniform float uProg; uniform float uTime; uniform float uOp;
        varying float vT; varying float vSide;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          if ( uProg < 0.0 ) discard;
          float d = uProg - vT;
          if ( d < 0.0 ) discard;
          float a = smoothstep( 0.0, 0.015, d ) * exp( -d * 16.0 );
          a *= smoothstep( 1.0, 0.55, abs( vSide ) );
          a *= 0.55 + 0.45 * hash( vec2( vT * 300.0, vSide * 3.0 ) );
          a *= uOp;
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( 0.96, 0.99, 1.0, a * 0.85 );
        }`,
      transparent: true, depthWrite: false
    });
    const wake = new THREE.Mesh(geo, mat);
    wake.layers.set(1);
    wake.renderOrder = 5;
    scene.add(wake);
    S.wake = { mesh: wake, mat };
    return wake;
  };

  S.updateHero = function (t, dt) {
    if (!S.heroBoat || !S.heroCurve) return;
    const CYCLE = 46;
    const u = ((t + 6) % CYCLE) / CYCLE;
    // 0..0.20 停泊, 0.20..0.88 航行, 0.88..1 停泊
    let s = 0;
    if (u > 0.20 && u < 0.88) {
      const k = (u - 0.20) / 0.68;
      s = S.ease(k);
    } else if (u >= 0.88) {
      s = 1;
    }
    const sailing = u > 0.21 && u < 0.87;
    S.heroSailing = sailing;
    const p = S.heroCurve.getPointAt(S.clamp(s, 0, 1));
    const p2 = S.heroCurve.getPointAt(S.clamp(s + 0.006, 0, 1));
    S.heroBoat.position.set(p.x, S.W.waterY + Math.sin(t * 0.8) * 0.02, p.z);
    S.heroBoat.rotation.y = Math.atan2(p2.x - p.x, p2.z - p.z) + Math.PI;
    S.heroBoat.rotation.z = Math.sin(t * 0.9) * 0.02 + 0.012 * Math.sin(t * 1.7);
    if (S.wake) {
      S.wake.mat.uniforms.uProg.value = sailing ? s : (u >= 0.88 ? 1 : -1);
      S.wake.mat.uniforms.uTime.value = t;
      S.wake.mat.uniforms.uOp.value = sailing ? 1 : S.clamp((1 - (u - 0.88) * 12), 0, 1);
    }
  };

  /* ---------------- 组装 ---------------- */
  S.buildLife = function (scene) {
    S.buildGulls(scene);
    S.buildCat(scene);
    S.buildFish(scene);
    S.buildHeroTrip(scene);
    return scene;
  };

  S.updateLife = function (t, dt) {
    S.updateGulls(t, dt);
    S.updateCat(t, dt);
    S.updateFish(t, dt);
    S.updateHero(t, dt);
    // 航迹扰动其它船
    if (S.heroBoat && S.boats) {
      const hp = S.heroBoat.position;
      for (const b of S.boats) {
        if (b === S.heroBoat) continue;
        const d = Math.hypot(b.position.x - hp.x, b.position.z - hp.z);
        if (d < 5.0 && S.heroSailing) {
          const k = (1 - d / 5.0);
          b.position.y += Math.sin(t * 3.1) * 0.03 * k;
          b.rotation.z += Math.sin(t * 2.7 + 1) * 0.02 * k;
        }
      }
    }
  };

})(window);
