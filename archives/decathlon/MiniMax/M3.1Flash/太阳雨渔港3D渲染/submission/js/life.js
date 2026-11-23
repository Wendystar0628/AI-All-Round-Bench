/* =====================================================================
   life.js — 海鸥 / 港猫 / 出港渔船 / 阵风 / 灯塔闪烁
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const G = U.G, T = U.T;
  const M = TY.M;
  const L = TY.LAYOUT;

  const life = {
    group: null,
    gulls: [],
    cat: null,
    gustAmount: 0,
    gustFront: 99,
    gustActive: 0,
    lighthouseBlink: 0,
    wake: [],
    departBoat: null,
    distantBoats: [],
    _t: 0,
  };

  /* ---------------- 构建 ---------------- */
  life.build = function (scene) {
    const grp = new THREE.Group();
    grp.name = 'life';
    scene.add(grp);
    life.group = grp;

    life.buildGulls(grp);
    life.buildCat(grp);
    life.buildDistantBoats(grp);
    life.buildWake(grp);
    return grp;
  };

  /* ---------------- 海鸥 ---------------- */
  function gullMesh(matBody, matWing) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 9), matBody);
    body.scale.set(1.5, 0.85, 0.8);
    body.position.z = 0.02;
    g.add(body); TY.outline.attach(body, 0.85);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), matBody);
    head.position.set(0, 0.09, 0.21);
    g.add(head); TY.outline.attach(head, 0.8);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.12, 6), M.yellow);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.07, 0.33);
    g.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), matWing);
    tail.rotation.x = -Math.PI / 2;
    tail.scale.set(1, 1, 0.35);
    tail.position.set(0, 0.03, -0.26);
    g.add(tail); TY.outline.attach(tail, 0.8);
    const wings = [];
    for (let s = -1; s <= 1; s += 2) {
      const w = new THREE.Group();
      const shape = new THREE.PlaneGeometry(0.58, 0.2, 4, 1);
      const p = shape.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setY(i, p.getY(i) * (1 - Math.abs(x) / 0.34) - 0.02);
      }
      shape.computeVertexNormals();
      const wm = new THREE.Mesh(shape, matWing);
      wm.material.side = THREE.DoubleSide;
      wm.position.x = s * 0.29;
      w.add(wm);
      TY.outline.attach(wm, 0.8);
      w.position.set(0, 0.08, 0.02);
      g.add(w);
      wings.push(w);
    }
    g.userData.wings = wings;
    return g;
  }

  life.buildGulls = function (grp) {
    const matBody = TY.toon({ color: 0xf6f6f0, steps: 3, rim: { color: 0xffffff, strength: 0.25, power: 2.6 } });
    const matWing = TY.toon({ color: 0xc3ccd2, steps: 3, side: THREE.DoubleSide });
    const rnd = U.mulberry32(88);
    for (let i = 0; i < 9; i++) {
      const m = gullMesh(matBody, matWing);
      m.scale.setScalar(0.72 + rnd() * 0.26);
      grp.add(m);
      life.gulls.push({
        m: m, state: 'fly', phase0: rnd() * 6.28, phaseLast: 0, radius: 4 + rnd() * 9,
        cx: -2 + rnd() * 8, cz: -4 + rnd() * 7, alt: 3 + rnd() * 7,
        speed: 0.22 + rnd() * 0.22, perch: null, until: 2 + rnd() * 7, cyc: 0,
        target: null, scale: 1, t0: 0,
      });
    }
    // 一只停在系船柱上的海鸥（特写用）
    const perchGull = gullMesh(matBody, matWing);
    perchGull.scale.setScalar(0.95);
    perchGull.rotation.y = 2.15;      // 面向港湾
    grp.add(perchGull);
    life.perchGull = {
      m: perchGull, state: 'perch', pos: new THREE.Vector3(L.west.x1 - 0.62, L.top + 0.72, -2.35),
      flap: 0, t0: 0, flyAway: false, home: new THREE.Vector3(L.west.x1 - 0.62, L.top + 0.72, -2.35),
    };
  };

  /* ---------------- 港猫 ---------------- */
  /* 落脚点：0 = 倒扣舢板下的窝，其余沿堤岸自东向西排开 */
  const CAT_SPOTS = [
    [6.56, 1.40, 5.66],
    [5.45, 1.40, 4.92],
    [3.45, 1.40, 5.55],
    [1.95, 1.40, 6.40],
    [-0.45, 1.40, 5.60],
    [-2.55, 1.40, 5.25],
    [-4.35, 1.40, 4.30],
    [-4.85, 1.40, 2.00],
    [-4.95, 1.40, -1.20],
    [-4.85, 1.40, -4.60],
    [-4.45, 1.40, -7.80],
    [-3.55, 1.40, -9.25],
  ];
  const CAT_HOME = CAT_SPOTS[0];

  /* 作息表：躲雨 / 溜达 交替，完全由时间决定，导出时可复现 */
  function buildCatSchedule() {
    const rnd = U.mulberry32(90521);
    const sch = [];
    // 首段留长：开场与特写时港猫都趴在舢板下
    sch.push({ t0: 0, t1: 27.5, hide: true, seed: 0 });
    let t = 27.5, i = 1;
    while (t < 1200) {
      const walkDur = 12 + rnd() * 10;
      const hideDur = 7 + rnd() * 11;
      sch.push({ t0: t, t1: t + walkDur, hide: false, seed: i });
      sch.push({ t0: t + walkDur, t1: t + walkDur + hideDur, hide: true, seed: i });
      t += walkDur + hideDur;
      i++;
    }
    return sch;
  }

  /* 每趟路线都不同：随机选落脚点 + 轻微偏移 */
  function tripPath(seed) {
    const rnd = U.mulberry32(4000 + seed * 91);
    const far = 2 + Math.floor(rnd() * 9);
    const stops = [];
    for (let i = 1; i <= far; i++) if (rnd() < 0.78) stops.push(i);
    if (!stops.length) stops.push(far);
    const path = [[CAT_HOME[0], CAT_HOME[1], CAT_HOME[2]]];
    stops.forEach((k) => {
      path.push([CAT_SPOTS[k][0], CAT_SPOTS[k][1], CAT_SPOTS[k][2]]);
    });
    path.push([CAT_HOME[0], CAT_HOME[1], CAT_HOME[2]]);
    for (let i = 1; i < path.length - 1; i++) {
      path[i][0] += (rnd() - 0.5) * 0.8;
      path[i][2] += (rnd() - 0.5) * 0.8;
    }
    return path;
  }

  life.buildCat = function (grp) {
    const g = new THREE.Group();
    const fur = TY.toon({
      color: 0xd9a869, steps: 3, emissive: 0x3c2c14, emissiveIntensity: 0.16,
      rim: { color: 0xfff0d8, strength: 0.34, power: 2.2 },
    });
    const furDark = TY.toon({ color: 0x9d7444, steps: 3 });
    const furLight = TY.toon({ color: 0xf0dcb8, steps: 3 });
    const nose = TY.toon({ color: 0x6b4a3a, steps: 2 });

    // 身体
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), fur);
    body.scale.set(1.48, 0.86, 0.92);
    g.add(body); TY.outline.attach(body, 0.85);
    // 胸腹浅色
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 9), furLight);
    belly.scale.set(0.95, 0.66, 0.85);
    belly.position.set(0, -0.035, 0.075);
    g.add(belly); TY.outline.attach(belly, 0.8);

    // 头（含口鼻）
    const head = new THREE.Group();
    head.position.set(0, 0.115, 0.155);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.078, 14, 10), fur);
    skull.scale.set(1.0, 0.94, 1.05);
    head.add(skull); TY.outline.attach(skull, 0.85);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.040, 10, 8), furLight);
    muzzle.scale.set(1.05, 0.8, 1.1);
    muzzle.position.set(0, -0.025, 0.062);
    head.add(muzzle); TY.outline.attach(muzzle, 0.75);
    const noseMesh = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), nose);
    noseMesh.position.set(0, -0.012, 0.096);
    head.add(noseMesh);
    for (let s = -1; s <= 1; s += 2) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.085, 4), fur);
      ear.position.set(s * 0.052, 0.072, 0.006);
      ear.rotation.set(-0.12, 0, s * 0.26);
      head.add(ear); TY.outline.attach(ear, 0.75);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.055, 4), furDark);
      inner.position.set(s * 0.052, 0.066, 0.016);
      inner.rotation.set(-0.12, 0, s * 0.26);
      head.add(inner);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), nose);
      eye.position.set(s * 0.034, 0.012, 0.058);
      head.add(eye);
    }
    g.add(head);

    // 尾巴（卷在身侧）
    const tail = new THREE.Group();
    tail.position.set(0, 0.02, -0.19);
    const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.19, 7), fur);
    t1.position.set(0, 0.05, -0.06);
    t1.rotation.x = 0.75;
    tail.add(t1); TY.outline.attach(t1, 0.8);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.025, 0.17, 7), fur);
    t2.position.set(0.05, 0.11, -0.14);
    t2.rotation.set(1.15, 0, -0.5);
    tail.add(t2); TY.outline.attach(t2, 0.8);
    g.add(tail);

    // 四肢
    const legs = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.11, 7), furDark);
      l.position.set((i % 2 ? 0.068 : -0.068), -0.078, (i < 2 ? 0.105 : -0.095));
      g.add(l);
      legs.push(l);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), furDark);
      paw.scale.set(1, 0.7, 1.25);
      paw.position.set(0, -0.058, 0.014);
      l.add(paw);
    }
    g.scale.setScalar(1.18);
    grp.add(g);
    life.cat = {
      m: g, body: body, belly: belly, legs: legs, tail: tail, head: head,
      state: 'hide',
      pos: new THREE.Vector3(CAT_HOME[0], CAT_HOME[1], CAT_HOME[2]),
      path: [], pathIdx: 0, pauseUntil: 0, look: 0, trip: -1,
      shelter: new THREE.Vector3(CAT_HOME[0], CAT_HOME[1], CAT_HOME[2]),
    };
    life.catSched = buildCatSchedule();
  };

  /* ---------------- 远处驶过的渔船 ---------------- */
  life.buildDistantBoats = function (grp) {
    const mk = (scale) => {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), M.hullGreen);
      hull.scale.set(2.6, 0.5, 0.66);
      g.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.6), M.whitePlain || M.whitePlastic);
      deck.position.y = 0.18;
      g.add(deck);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.46), M.whitePlastic);
      cab.position.set(0.15, 0.4, 0);
      g.add(cab);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.85, 5), M.steel);
      mast.position.set(0.3, 0.82, 0);
      g.add(mast);
      g.scale.setScalar(scale);
      return g;
    };
    for (let i = 0; i < 2; i++) {
      const b = mk(0.62);
      grp.add(b);
      life.distantBoats.push({ m: b, t: i * 33 + 10, dir: i ? 1 : -1, z: -6.9 - i * 1.4, x: 6.5 });
    }
  };

  /* ---------------- 阵风 ---------------- */
  life.updateGust = function (t) {
    const cycle = 19.5;
    const p = ((t + 7.5) % cycle) / cycle;
    let amt = 0;
    if (p < 0.30) {
      const q = p / 0.30;
      amt = Math.sin(Math.PI * Math.pow(q, 0.75)) * 0.95;
      life.gustFront = 11 - q * 24;
      life.gustActive = 1;
    } else {
      life.gustActive = 0;
      life.gustFront = 99;
    }
    life.gustAmount += (amt - life.gustAmount) * 0.25;
  };

  life.gustAt = function (x) {
    if (!life.gustActive) return life.gustAmount * 0.25;
    const d = life.gustFront - x;
    return life.gustAmount * U.smoothstep(-1.5, 1.5, d);
  };

  /* ---------------- 出港渔船 ---------------- */
  life.initDeparture = function () {
    const b = TY.boats.list.find((x) => x.spec.depart);
    if (!b) return;
    life.departBoat = b;
    b.home = new THREE.Vector3(b.spec.x, 0, b.spec.z);
    b.departState = 'dock';
    b.departT = 0;
    b.path = [
      new THREE.Vector3(-2.05, 0, -6.75),
      new THREE.Vector3(0.9, 0, -6.4),
      new THREE.Vector3(4.2, 0, -7.2),
      new THREE.Vector3(7.5, 0, -8.3),
      new THREE.Vector3(8.2, 0, -6.2),
      new THREE.Vector3(5.4, 0, -4.6),
      new THREE.Vector3(1.6, 0, -5.6),
      new THREE.Vector3(-1.0, 0, -6.7),
      new THREE.Vector3(-2.05, 0, -6.75),
    ];
    b.pathIdx = 0;
  };

  const DOCK_TIME = 43, OUT_TIME = 5, SAIL_TIME = 24, BACK_TIME = 6;
  const CYCLE = DOCK_TIME + OUT_TIME + SAIL_TIME + BACK_TIME;
  const WAKE_N = 40, WAKE_DT = 0.25;

  /* 渔船在时刻 time 的状态（时间的纯函数，帧率无关） */
  const _dep = { x: 0, z: 0, rot: 0, moving: false, phase: 'dock' };
  function departStateAt(time, out) {
    const b = life.departBoat;
    const c = ((time % CYCLE) + CYCLE) % CYCLE;
    if (c < DOCK_TIME) {
      out.x = b.home.x; out.z = b.home.z; out.rot = b.spec.rot;
      out.moving = false; out.phase = 'dock';
    } else if (c < DOCK_TIME + OUT_TIME) {
      const q = (c - DOCK_TIME) / OUT_TIME;
      const e = U.easeInOut(U.clamp(q, 0, 1));
      out.x = U.lerp(b.home.x, b.path[1].x, e);
      out.z = U.lerp(b.home.z, b.path[1].z, e);
      out.rot = b.spec.rot + e * 0.55;
      out.moving = true; out.phase = 'out';
    } else if (c < DOCK_TIME + OUT_TIME + SAIL_TIME) {
      const q = (c - DOCK_TIME - OUT_TIME) / SAIL_TIME;
      const total = b.path.length - 1;
      const seg = q * total;
      const i = Math.min(total - 1, Math.floor(seg));
      const f = seg - i;
      const p0 = b.path[i], p1 = b.path[i + 1];
      const e = U.easeInOut(U.clamp(f, 0, 1));
      out.x = U.lerp(p0.x, p1.x, e);
      out.z = U.lerp(p0.z, p1.z, e);
      out.rot = Math.atan2(-(p1.z - p0.z), p1.x - p0.x);
      out.moving = true; out.phase = 'sail';
    } else {
      const q = (c - DOCK_TIME - OUT_TIME - SAIL_TIME) / BACK_TIME;
      const e = U.easeInOut(U.clamp(q, 0, 1));
      const p0 = b.path[b.path.length - 2], p1 = b.path[b.path.length - 1];
      out.x = U.lerp(p0.x, p1.x, e);
      out.z = U.lerp(p0.z, p1.z, e);
      out.rot = U.lerp(Math.atan2(-(p1.z - p0.z), p1.x - p0.x), b.spec.rot, e);
      out.moving = true; out.phase = 'back';
    }
    return out;
  }

  /* 白色航迹带 */
  life.buildWake = function (grp) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(WAKE_N * 2 * 3);
    const uv = new Float32Array(WAKE_N * 2 * 2);
    const alp = new Float32Array(WAKE_N * 2);
    const idx = [];
    for (let i = 0; i < WAKE_N - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xf4fcfc) }, uTime: { value: 0 } },
      vertexShader: [
        'attribute float aAlpha; varying float vA; varying vec2 vUv;',
        'void main(){ vA = aAlpha; vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uTime; varying float vA; varying vec2 vUv;',
        'void main(){',
        '  float edge = smoothstep(0.0,0.34,vUv.y) * smoothstep(1.0,0.66,vUv.y);',
        '  float cell = floor(vUv.x*46.0 + floor(uTime*4.0)*0.37);',
        '  float n = fract(sin(cell*12.9898)*43758.5453);',
        '  float a = vA * edge * (0.45 + 0.55*step(0.34,n));',
        '  if(a < 0.03) discard;',
        '  gl_FragColor = vec4(uColor, a);',
        '}',
      ].join('\n'),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    grp.add(mesh);
    life.wakeMesh = mesh;
  };

  life.updateDeparture = function (t, dt) {
    const b = life.departBoat;
    if (!b) return;
    const g = b.group;
    const s = departStateAt(t, _dep);
    g.position.x = s.x; g.position.z = s.z; g.rotation.y = s.rot;

    // 缆绳：靠泊时系着，离泊瞬间解开，回到泊位时重新系上
    if (TY.boats.ropes) {
      const c = ((t % CYCLE) + CYCLE) % CYCLE;
      let vis = true;
      if (c >= DOCK_TIME && c < DOCK_TIME + OUT_TIME) vis = (c - DOCK_TIME) / OUT_TIME < 0.06;
      else if (c >= DOCK_TIME + OUT_TIME && c < DOCK_TIME + OUT_TIME + SAIL_TIME) vis = false;
      else if (c >= DOCK_TIME + OUT_TIME + SAIL_TIME) vis = ((c - DOCK_TIME - OUT_TIME - SAIL_TIME) / BACK_TIME) > 0.94;
      TY.boats.ropes.forEach((r) => { if (r.boat === b) r.m.visible = vis; });
    }

    // 航迹：由历史位置解析求得，与帧率无关
    const wake = life.wake;
    wake.length = 0;
    const tmp = { x: 0, z: 0, rot: 0, moving: false, phase: '' };
    for (let k = 0; k < WAKE_N; k++) {
      departStateAt(t - k * WAKE_DT, tmp);
      if (!tmp.moving) break;
      wake.push({ x: tmp.x, z: tmp.z, t: k * WAKE_DT, ang: tmp.rot });
    }
    life.updateWakeMesh(t, wake);
  };

  /* 把航迹点写进网格 */
  life.updateWakeMesh = function (t, wake) {
    const mesh = life.wakeMesh;
    if (!mesh) return;
    const geo = mesh.geometry;
    const pos = geo.attributes.position.array;
    const uv = geo.attributes.uv.array;
    const alp = geo.attributes.aAlpha.array;
    mesh.material.uniforms.uTime.value = t;
    const n = Math.min(wake.length, WAKE_N);
    if (n < 2) { geo.setDrawRange(0, 0); return; }
    for (let i = 0; i < WAKE_N; i++) {
      const w = wake[Math.min(i, n - 1)];
      const wPrev = wake[Math.max(0, Math.min(i, n - 1) - 1)];
      let dx = w.x - wPrev.x, dz = w.z - wPrev.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const age = w.t;
      const half = 0.55 + age * 0.16;
      const px = -dz, pz = dx;
      const y = (TY.water.waveH ? TY.water.waveH(w.x, w.z, t) : 0) + 0.035;
      const a = Math.pow(Math.max(0, 1 - age / 8.5), 1.6) * 0.92;
      const i0 = i * 2, i1 = i * 2 + 1;
      pos[i0 * 3] = w.x - px * half; pos[i0 * 3 + 1] = y; pos[i0 * 3 + 2] = w.z - pz * half;
      pos[i1 * 3] = w.x + px * half; pos[i1 * 3 + 1] = y; pos[i1 * 3 + 2] = w.z + pz * half;
      uv[i0 * 2] = age * 1.1; uv[i0 * 2 + 1] = 0;
      uv[i1 * 2] = age * 1.1; uv[i1 * 2 + 1] = 1;
      alp[i0] = a; alp[i1] = a;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
  };

  /* 航迹对浮标 / 船只的影响 */
  life.wakeBob = function (x, z, t) {
    let b = 0;
    for (const w of life.wake) {
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < 2.0) {
        const age = w.t;
        b += Math.sin(age * 3.4 - d * 1.6) * Math.exp(-age * 0.7) * Math.exp(-d * 0.7) * 0.05;
      }
    }
    return b;
  };

  /* ---------------- 海鸥更新 ---------------- */
  /* 全部由绝对时间决定：飞行轨迹是 t 的纯函数，状态切换用固定时刻 + 哈希取随机 */
  const _v = new THREE.Vector3();
  function grnd(i, salt, cyc) {
    return U.mulberry32(i * 7919 + salt * 104729 + cyc * 15485863)();
  }
  function flyPos(g, t, out) {
    const ph = g.phase0 + t * g.speed;
    out.set(
      g.cx + Math.cos(ph) * g.radius,
      g.alt + Math.sin(ph * 2.3) * 0.5,
      g.cz + Math.sin(ph) * g.radius * 0.7);
    return ph;
  }
  life.updateGulls = function (t, dt, camera) {
    const perchPts = [];
    for (let z = -9.4; z <= 3.6; z += 2.35) perchPts.push(new THREE.Vector3(L.west.x1 - 0.62, L.top + 0.72, z));
    TY.boats.list.forEach((b) => {
      perchPts.push(new THREE.Vector3(b.group.position.x, b.group.position.y + b.spec.depth * 0.95, b.group.position.z - b.spec.len * 0.3));
    });

    life.gulls.forEach((g, i) => {
      const m = g.m;
      if (g.state === 'fly') {
        const ph = flyPos(g, t, _v);
        m.position.copy(_v);
        const yaw = Math.atan2(-Math.sin(ph) * g.speed, Math.cos(ph) * g.radius * 0.7 * g.speed);
        m.rotation.y = yaw;
        m.rotation.z = -0.35 + Math.sin(ph * 2) * 0.12;
        // 偶尔降落
        if (t >= g.until) {
          g.cyc++;
          g.until = t + 5 + grnd(i, 1, g.cyc) * 9;
          if (grnd(i, 2, g.cyc) < 0.55 && perchPts.length) {
            g.target = perchPts[Math.floor(grnd(i, 3, g.cyc) * perchPts.length)].clone();
            g.state = 'land';
            g.t0 = t;
            g.from = m.position.clone();
            g.phaseLast = ph;
          }
        }
      } else if (g.state === 'land') {
        // 从降落点上方滑落到目标
        const k = U.clamp((t - g.t0) / 2.4, 0, 1);
        const e = U.easeInOut(k);
        const from = g.from;
        m.position.set(
          U.lerp(from.x, g.target.x, e),
          U.lerp(from.y + 1.0, g.target.y, e),
          U.lerp(from.z, g.target.z, e));
        m.rotation.z *= 0.9;
        if (k >= 1) {
          m.position.copy(g.target);
          g.state = 'perch';
          g.until = t + 3 + grnd(i, 4, g.cyc) * 6;
        }
      } else if (g.state === 'perch') {
        m.position.y = g.target.y + Math.sin(t * 2 + g.phase0) * 0.006;
        m.rotation.y += dt * 0.2;
        if (t >= g.until) {
          g.state = 'fly';
          g.cyc++;
          g.alt = 3.5 + grnd(i, 5, g.cyc) * 5;
          g.radius = 4 + grnd(i, 6, g.cyc) * 8;
          g.cx = -2 + grnd(i, 7, g.cyc) * 8;
          g.cz = -5 + grnd(i, 8, g.cyc) * 7;
          // 从停栖处接续飞行相位
          const want = Math.atan2((g.target.z - g.cz) / (g.radius * 0.7), (g.target.x - g.cx) / g.radius);
          g.phaseLast = want;
          g.phase0 = want - t * g.speed;
        }
      }
      // 翅膀
      const w = m.userData.wings;
      if (w) {
        const moving = g.state === 'fly';
        const target = moving ? Math.sin(t * 5.2 + g.phase0) * 0.42 : -0.1;
        w[0].rotation.z = U.lerp(w[0].rotation.z, -target, Math.min(1, dt * 6));
        w[1].rotation.z = U.lerp(w[1].rotation.z, target, Math.min(1, dt * 6));
      }
      // 镜头靠近时惊飞
      if (camera && g.state !== 'fly' && m.position.distanceTo(camera.position) < 2.6) {
        g.state = 'fly';
        g.cyc++;
        g.alt = 5 + grnd(i, 9, g.cyc) * 3;
        const want = Math.atan2((m.position.z - g.cz) / (g.radius * 0.7), (m.position.x - g.cx) / g.radius);
        g.phaseLast = want;
        g.phase0 = want - t * g.speed;
      }
    });

    // 系船柱上的海鸥
    const pg = life.perchGull;
    const m = pg.m;
    if (pg.state === 'perch') {
      m.position.lerp(pg.pos, Math.min(1, dt * 4));
      m.rotation.y = 2.15 + Math.sin(t * 0.32) * 0.42;
      m.rotation.z = 0;
      const w = m.userData.wings;
      if (w) { w[0].rotation.z = U.lerp(w[0].rotation.z, -0.08, dt * 5); w[1].rotation.z = U.lerp(w[1].rotation.z, 0.08, dt * 5); }
      // 镜头推近 → 扑翅飞走
      if (camera && camera.position.distanceTo(m.position) < 2.6 && t > pg.t0 + 0.4) {
        pg.state = 'fly';
        pg.t0 = t;
      }
    } else if (pg.state === 'fly') {
      // 起飞后沿固定环线飞走（时间的纯函数）
      const s = t - pg.t0;
      const u = (s % 19) / 19 * Math.PI * 2;
      const rise = U.clamp(s / 1.1, 0, 1);
      m.position.set(
        pg.pos.x + 2.1 * Math.sin(u) * (0.45 + 0.55 * rise) + 0.55 * Math.sin(u * 2),
        pg.pos.y + (0.12 + 3.1 * Math.abs(Math.sin(u))) * rise,
        pg.pos.z + 1.7 * Math.cos(u) * 0.75 - 1.1 * Math.sin(u * 2));
      m.rotation.y = Math.atan2(Math.cos(u) * 2.1, -Math.sin(u) * 1.7);
      m.rotation.z = -0.38;
      const w = m.userData.wings;
      if (w) {
        const target = Math.sin(t * 9) * 0.85;
        w[0].rotation.z = U.lerp(w[0].rotation.z, -target, Math.min(1, dt * 9));
        w[1].rotation.z = U.lerp(w[1].rotation.z, target, Math.min(1, dt * 9));
      }
    }
  };

  /* ---------------- 港猫更新 ---------------- */
  function catSegAt(t) {
    const s = life.catSched;
    for (let i = 0; i < s.length; i++) if (t < s[i].t1) return s[i];
    return s[s.length - 1];
  }

  const _catTarget = new THREE.Vector3();
  life.updateCat = function (t, dt, camera) {
    const c = life.cat;
    if (!c) return;
    const m = c.m;
    const rainNow = TY.weather.rainAt(t);
    const rainSoon = TY.weather.rainAt(t + 7);

    /* 作息切换 */
    const seg = catSegAt(t);
    if (c.trip !== seg.seed) {
      c.trip = seg.seed;
      if (!seg.hide && c.state === 'hide') {
        if (rainNow < 0.64) {           // 雨疏才出来
          c.state = 'walk';
          c.path = tripPath(seg.seed);
          c.pathIdx = 1;
          c.pauseUntil = 0;
        }
      } else if (seg.hide && c.state === 'walk') {
        c.state = 'run';
      }
    }

    /* 雨要变大 → 先跑回避雨处 */
    if ((c.state === 'walk' || c.state === 'run') && rainSoon > 0.70) c.state = 'run';

    if (c.state === 'hide') {
      m.position.lerp(c.shelter, Math.min(1, dt * 3));
      // 趴着：身体压低、四肢收拢、尾巴卷起
      c.body.position.y = U.lerp(c.body.position.y, -0.032, Math.min(1, dt * 4));
      c.legs.forEach((l) => {
        l.position.y = U.lerp(l.position.y, -0.086, Math.min(1, dt * 5));
        l.scale.y = U.lerp(l.scale.y, 0.62, Math.min(1, dt * 5));
      });
      c.tail.rotation.z = U.lerp(c.tail.rotation.z, 0.55, Math.min(1, dt * 3));
      c.tail.rotation.x = U.lerp(c.tail.rotation.x, 1.25, Math.min(1, dt * 3));
    } else if (c.state === 'walk') {
      if (t < c.pauseUntil) {
        c.legs.forEach((l) => { l.position.y = -0.078; l.scale.y = U.lerp(l.scale.y, 1, Math.min(1, dt * 6)); });
      } else {
        const wp = c.path[c.pathIdx];
        if (!wp) {
          c.state = 'run';
        } else {
          _catTarget.set(wp[0], wp[1], wp[2]);
          const d = _catTarget.clone().sub(m.position); d.y = 0;
          const dist = d.length();
          if (dist < 0.20) {
            c.pathIdx++;
            if (c.pathIdx >= c.path.length) {
              c.state = 'run';
            } else {
              const pr = U.mulberry32(7000 + c.trip * 131 + c.pathIdx)();
              c.pauseUntil = t + (pr < 0.45 ? 0.5 + pr * 1.6 : 0);
            }
          } else {
            d.normalize();
            m.position.addScaledVector(d, 0.78 * dt);
            m.position.y = U.lerp(m.position.y, _catTarget.y, Math.min(1, dt * 4));
            const yaw = Math.atan2(d.x, d.z);
            m.rotation.y += ((yaw - m.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 5);
            c.body.position.y = U.lerp(c.body.position.y, 0, Math.min(1, dt * 4));
            c.legs.forEach((l, i) => {
              l.position.y = -0.078 + Math.sin(t * 9 + (i % 2) * Math.PI) * 0.012;
              l.scale.y = U.lerp(l.scale.y, 1, Math.min(1, dt * 6));
            });
          }
        }
      }
      c.tail.rotation.z = Math.sin(t * 2.4) * 0.25;
      c.tail.rotation.x = U.lerp(c.tail.rotation.x, 0.9, Math.min(1, dt * 3));
    } else if (c.state === 'run') {
      _catTarget.copy(c.shelter);
      const d = _catTarget.clone().sub(m.position); d.y = 0;
      const dist = d.length();
      if (dist < 0.22) {
        c.state = 'hide';
      } else {
        d.normalize();
        m.position.addScaledVector(d, 1.45 * dt);
        m.position.y = U.lerp(m.position.y, _catTarget.y, Math.min(1, dt * 5));
        const yaw = Math.atan2(d.x, d.z);
        m.rotation.y += ((yaw - m.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 7);
        c.body.position.y = U.lerp(c.body.position.y, 0, Math.min(1, dt * 5));
        c.legs.forEach((l, i) => {
          l.position.y = -0.078 + Math.sin(t * 15 + (i % 2) * Math.PI) * 0.022;
          l.scale.y = U.lerp(l.scale.y, 1, Math.min(1, dt * 6));
        });
      }
      c.tail.rotation.z = Math.sin(t * 6) * 0.3;
    }

    /* 镜头靠近 → 抬头看一眼 */
    let near = false;
    if (camera) {
      near = camera.position.distanceTo(m.position) < 2.9;
      if (near) {
        const dir = camera.position.clone().sub(m.position);
        const yaw = Math.atan2(dir.x, dir.z);
        m.rotation.y += ((yaw - m.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 4);
      }
    }
    c.look = U.lerp(c.look, near ? 0.38 : 0, Math.min(1, dt * 4));
    c.head.rotation.x = -c.look;
    c.head.position.y = 0.115 + c.look * 0.035;
    c.head.position.z = 0.155 + c.look * 0.012;
  };

  /* ---------------- 灯塔闪烁 ---------------- */
  life.updateLighthouse = function (t) {
    const c = t % 25.0;
    let b = 0;
    if (c > 4.6 && c < 9.6) {
      const q = c - 4.6;
      if (q < 0.35) b = q / 0.35;
      else if (q < 0.8) b = 0;
      else if (q < 1.25) b = (1.25 - q) / 0.45;
      else b = 0;
      // 天色变暗
      TY.sky.darkness = Math.sin(Math.PI * U.clamp(q / 5.0, 0, 1)) * 0.8;
    } else {
      TY.sky.darkness += (0 - TY.sky.darkness) * 0.06;
    }
    life.lighthouseBlink = U.lerp(life.lighthouseBlink, b, 0.3);
  };

  /* ---------------- 远处渔船 ---------------- */
  life.updateDistant = function (t, dt) {
    life.distantBoats.forEach((d) => {
      d.t += dt * d.dir * 0.55;
      if (d.t > 60) d.t = -6;
      if (d.t < -6) d.t = 60;
      const x = 6.4 + d.t * 0.42;
      d.m.position.set(x, -0.12, d.z + Math.sin(d.t * 0.3) * 0.35);
      d.m.rotation.y = d.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      d.m.rotation.z = Math.sin(t * 1.1 + d.z) * 0.05;
    });
  };

  /* ---------------- 总更新 ---------------- */
  life.update = function (t, dt, camera) {
    life.updateGust(t);
    life.updateGulls(t, dt, camera);
    life.updateCat(t, dt, camera);
    life.updateDeparture(t, dt);
    life.updateDistant(t, dt);
    life.updateLighthouse(t);
  };

  TY.life = life;
})();
