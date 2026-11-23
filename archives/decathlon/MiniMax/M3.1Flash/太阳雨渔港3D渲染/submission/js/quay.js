/* =====================================================================
   quay.js — 底座 / L 形码头 / 岸壁剖面 / 水下环境 / 消波块
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const G = U.G, T = U.T;

  const L = {
    base: 10,
    seabed: -2.4,
    water: 0,
    top: 1.25,
    west: { x0: -10, z0: -10, x1: -3.2, z1: 10 },
    south: { x0: -3.2, z0: 4.2, x1: 10, z1: 10 },
    waterRect: { x0: -3.2, z0: -10, x1: 10, z1: 4.2 },
    break: { x0: -3.2, z0: -10, x1: 5.8, z1: -7.6, top: 0.95 },
    farBreak: { x0: 8.9, z0: -9.7, x1: 9.9, z1: -6.4, top: 0.30 },
    hill: { x0: -10, z0: -10, x1: -5.4, z1: -4.6 },
    warehouse: { x0: -9.8, z0: -4.4, x1: -5.6, z1: 0.2, h: 4.0 },
    waiting: { x0: -9.2, z0: 0.6, x1: -5.6, z1: 3.3, h: 2.9 },
    steps: { x0: 1.2, z0: 4.2, x1: 2.6 },
    slip: { x0: 3.0, z0: 4.2, x1: 4.9 },
    lighthouse: { x: 5.0, z: -8.8 },
  };
  TY.LAYOUT = L;

  const quay = {
    group: null,
    fish: [],
    weed: [],
    tetra: [],
    chain: null,
  };

  /* 盒体：六面分别指定材质（BoxGeometry 组顺序 px,nx,py,ny,pz,nz） */
  function boxWithMats(w, h, d, mats, uvScale) {
    const g = new THREE.BoxGeometry(w, h, d);
    U.triplanarUV(g, uvScale === undefined ? 0.28 : uvScale);
    const m = new THREE.Mesh(g, mats);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  quay.build = function (scene) {
    const M = TY.M;
    const grp = new THREE.Group();
    grp.name = 'quay';
    scene.add(grp);
    quay.group = grp;

    /* ---------- 西侧长臂 ---------- */
    const ww = L.west.x1 - L.west.x0, wd = L.west.z1 - L.west.z0, wh = L.top - L.seabed;
    const west = boxWithMats(ww, wh, wd, [
      M.seawall,          // +x 面向港湾的岸壁
      M.concreteSide,     // -x 模型外侧
      M.concrete,         // +y 路面
      M.concreteSide,     // -y
      M.concreteSide,     // +z
      M.concreteSide,     // -z
    ], 0.26);
    west.position.set((L.west.x0 + L.west.x1) / 2, (L.seabed + L.top) / 2, (L.west.z0 + L.west.z1) / 2);
    grp.add(west);
    TY.outline.attach(west, 1.15);

    /* ---------- 南侧横臂 ---------- */
    const sw = L.south.x1 - L.south.x0, sd = L.south.z1 - L.south.z0;
    const south = boxWithMats(sw, wh, sd, [
      M.concreteSide,      // +x
      M.concreteSide,      // -x
      M.concrete,          // +y
      M.concreteSide,      // -y
      M.concreteSide,      // +z
      M.seawall,           // -z 面向泊位
    ], 0.26);
    south.position.set((L.south.x0 + L.south.x1) / 2, (L.seabed + L.top) / 2, (L.south.z0 + L.south.z1) / 2);
    grp.add(south);
    TY.outline.attach(south, 1.15);

    /* ---------- 防波堤 ---------- */
    quay.buildBreakwater(grp);

    /* ---------- 底座铭牌 ---------- */
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.78), TY.toon({
      color: 0xffffff, map: TY.tex.tex(TY.tex.plaqueCanvas(), 1, 1), steps: 2,
    }));
    plaque.position.set(5.2, -0.62, L.south.z1 + 0.03);
    grp.add(plaque);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.9, 0.05), M.brass);
    frame.position.set(5.2, -0.62, L.south.z1 + 0.01);
    grp.add(frame); TY.outline.attach(frame, 0.9);

    /* ---------- 护轮坎（黄黑警示条） ---------- */
    quay.buildCurb(grp);

    /* ---------- 岸壁构件 ---------- */
    quay.buildSeawallProps(grp);

    /* ---------- 水下环境 ---------- */
    quay.buildUnderwater(grp);

    /* ---------- 消波块 ---------- */
    quay.buildTetrapods(grp);

    TY.registerReflect(grp);
    return grp;
  };

  /* ---------------- 防波堤 ---------------- */
  quay.buildBreakwater = function (grp) {
    const M = TY.M;
    const b = L.break;
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    // 梯形棱台（堤身 + 斜坡）
    const shape = new THREE.Shape();
    shape.moveTo(b.x0, b.z0);
    shape.lineTo(b.x1, b.z0);
    shape.lineTo(b.x1, b.z1);
    shape.lineTo(b.x0, b.z1);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: b.top - L.seabed, bevelEnabled: true, bevelThickness: 0.55, bevelSize: 0.55,
      bevelSegments: 2, steps: 1,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    U.triplanarUV(geo, 0.22);
    const m = new THREE.Mesh(geo, [M.concreteSide, M.concrete]);
    m.position.y = b.top - (b.top - L.seabed);
    m.castShadow = true; m.receiveShadow = true;
    grp.add(m);
    TY.outline.attach(m, 1.1);

    // 堤顶步道
    const walk = new THREE.Mesh(new THREE.BoxGeometry(w - 0.9, 0.1, d - 1.0), M.concrete);
    walk.position.set((b.x0 + b.x1) / 2, b.top + 0.02, (b.z0 + b.z1) / 2);
    walk.receiveShadow = true;
    grp.add(walk);

    // 堤身外缘一排小护栏石
    const bld = new U.Builder();
    for (let i = 0; i < 9; i++) {
      const x = b.x0 + 0.9 + i * ((w - 1.8) / 8);
      bld.put(G.cyl(0.13, 0.15, 0.34, 8), M.concreteSide, x, b.top + 0.14, b.z0 + 0.62);
    }
    bld.build(grp, { outline: true, outlineWidth: 0.9 });

    // 远处更长的防波堤（淡雾中的轮廓）
    const fb = L.farBreak;
    const fg = new THREE.BoxGeometry(fb.x1 - fb.x0, fb.top - L.seabed, fb.z1 - fb.z0);
    U.triplanarUV(fg, 0.2);
    const far = new THREE.Mesh(fg, M.concreteSide);
    far.position.set((fb.x0 + fb.x1) / 2, (fb.top + L.seabed) / 2, (fb.z0 + fb.z1) / 2);
    far.castShadow = false; far.receiveShadow = true;
    grp.add(far);
    TY.outline.attach(far, 0.8);
    // 远堤上的小灯
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.55, 8), M.lighthouseWhite);
    fl.position.set(fb.x1 - 0.5, fb.top + 0.28, (fb.z0 + fb.z1) / 2);
    grp.add(fl);
    TY.outline.attach(fl, 0.8);
  };

  /* ---------------- 护轮坎 ---------------- */
  quay.buildCurb = function (grp) {
    const M = TY.M;
    const bld = new U.Builder();
    const curbH = 0.17, curbW = 0.30;
    const seg = (x0, z0, x1, z1, along) => {
      const len = along === 'x' ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const n = Math.max(1, Math.round(len / 1.0));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const cx = along === 'x' ? x0 + (x1 - x0) * (t0 + t1) / 2 : x0;
        const cz = along === 'x' ? z0 : z0 + (z1 - z0) * (t0 + t1) / 2;
        const w = along === 'x' ? (Math.abs(x1 - x0) / n) : curbW;
        const d = along === 'x' ? curbW : (Math.abs(z1 - z0) / n);
        bld.put(G.box(w, curbH, d), M.hazard, cx, L.top + curbH / 2, cz);
      }
    };
    // 西臂东侧（泊位边）
    seg(L.west.x1 - curbW / 2, L.west.z0, L.west.x1 - curbW / 2, L.south.z0, 'z');
    // 南臂北侧（泊位边）
    seg(L.south.x0, L.south.z0 + curbW / 2, L.slip.x0 + 0.2, L.south.z0 + curbW / 2, 'x');
    seg(L.steps.x1 + 0.2, L.south.z0 + curbW / 2, L.slip.x0 - 0.1, L.south.z0 + curbW / 2, 'x');
    // 混凝土底座（警示条下方）
    const bld2 = new U.Builder();
    const base = (x0, z0, x1, z1, along) => {
      const cx = along === 'x' ? (x0 + x1) / 2 : x0;
      const cz = along === 'x' ? z0 : (z0 + z1) / 2;
      const w = along === 'x' ? Math.abs(x1 - x0) : 0.36;
      const d = along === 'x' ? 0.36 : Math.abs(z1 - z0);
      bld2.put(G.box(w, 0.19, d), M.concreteSide, cx, L.top + 0.095, cz);
    };
    base(L.west.x1 - 0.18, L.west.z0, L.west.x1 - 0.18, L.south.z0, 'z');
    base(L.south.x0, L.south.z0 + 0.18, L.slip.x0 + 0.2, L.south.z0 + 0.18, 'x');
    base(L.steps.x1 + 0.2, L.south.z0 + 0.18, L.slip.x0 - 0.1, L.south.z0 + 0.18, 'x');
    bld.build(grp, { outline: true, outlineWidth: 0.85 });
    bld2.build(grp, { outline: true, outlineWidth: 0.85 });
  };

  /* ---------------- 岸壁构件：系船环 / 铁梯 / 海藻 ---------------- */
  quay.buildSeawallProps = function (grp) {
    const M = TY.M;
    const bld = new U.Builder();

    /* 系船环（西臂东侧壁） */
    for (let z = -9.2; z <= 3.2; z += 3.1) {
      bld.put(G.box(0.06, 0.20, 0.20), M.rustSolid, L.west.x1 + 0.03, 0.62, z);
      bld.put(G.tor(0.115, 0.028, 6, 14), M.iron, L.west.x1 + 0.10, 0.50, z, 0, 1.0);
    }
    /* 系船环（南臂北侧壁） */
    for (let x = -2.4; x < 9.2; x += 3.4) {
      if (x > L.steps.x0 - 0.5 && x < L.slip.x1 + 0.5) continue;
      bld.put(G.box(0.20, 0.20, 0.06), M.rustSolid, x, 0.62, L.south.z0 - 0.03);
      bld.put(G.tor(0.115, 0.028, 6, 14), M.iron, x, 0.50, L.south.z0 - 0.10);
    }
    bld.build(grp, { outline: true, outlineWidth: 0.8 });

    /* 锈蚀铁梯 */
    const ladder = new U.Builder();
    const mkLadder = (px, pz, ry) => {
      const M2 = T.m(px, 0, pz, 0, ry, 0);
      const rail = (off) => {
        const g = G.cyl(0.035, 0.035, 2.35, 6);
        const m = M2.clone().multiply(T.m(off, 0.15, 0.13, 0, 0, 0));
        ladder.add(g, M.rustSolid, m, 1.2);
      };
      rail(-0.22); rail(0.22);
      for (let i = 0; i < 7; i++) {
        const g = G.cyl(0.022, 0.022, 0.48, 5);
        const m = M2.clone().multiply(T.m(0, 0.15 - 1.0 + i * 0.33, 0.13, 0, 0, Math.PI / 2));
        ladder.add(g, M.rustSolid, m, 1.2);
      }
    };
    mkLadder(L.west.x1 + 0.06, 0.4, Math.PI / 2);
    mkLadder(L.west.x1 + 0.06, -5.6, Math.PI / 2);
    mkLadder(6.4, L.south.z0 - 0.06, 0);
    ladder.build(grp, { outline: true, outlineWidth: 0.8 });

    /* 附着海藻（随水摆动） */
    const weedGeo = new THREE.PlaneGeometry(0.13, 1.0, 1, 6);
    weedGeo.translate(0, 0.5, 0);
    const weedMat = TY.toon({
      color: 0x3f7a52, steps: 3, side: THREE.DoubleSide,
      rim: { color: 0xcfeebb, strength: 0.2, power: 2.6 },
    });
    const spots = [
      [L.west.x1 + 0.05, -8.6], [L.west.x1 + 0.05, -6.2], [L.west.x1 + 0.05, -3.4],
      [L.west.x1 + 0.05, 1.2], [L.west.x1 + 0.05, 2.8], [L.south.z0 - 0.05, -1.2],
      [L.south.z0 - 0.05, 2.6], [L.south.z0 - 0.05, 7.4], [L.south.z0 - 0.05, 9.0],
    ];
    spots.forEach((s, i) => {
      const g = weedGeo.clone();
      const m = new THREE.Mesh(g, weedMat);
      const sc = 0.8 + (i % 3) * 0.35;
      m.scale.set(sc, sc * (1.1 + (i % 4) * 0.25), 1);
      m.position.set(s[0], -0.75, s[1]);
      m.rotation.y = (i * 1.7) % Math.PI;
      m.castShadow = false; m.receiveShadow = false;
      grp.add(m);
      quay.weed.push({ m: m, phase: i * 1.3, base: m.rotation.y, x: s[0], z: s[1] });
    });
  };

  /* ---------------- 水下环境 ---------------- */
  quay.buildUnderwater = function (grp) {
    const M = TY.M;
    const r = L.waterRect;

    /* 海床 */
    const sb = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0, 1, 1);
    sb.rotateX(-Math.PI / 2);
    U.triplanarUV(sb, 0.22);
    const sbm = new THREE.Mesh(sb, M.seabed);
    sbm.position.set((r.x0 + r.x1) / 2, L.seabed + 0.02, (r.z0 + r.z1) / 2);
    sbm.receiveShadow = true;
    grp.add(sbm);

    /* 碎石 */
    const peb = new U.Builder();
    const rnd = U.mulberry32(2024);
    for (let i = 0; i < 130; i++) {
      const x = r.x0 + 0.5 + rnd() * (r.x1 - r.x0 - 1);
      const z = r.z0 + 0.5 + rnd() * (r.z1 - r.z0 - 1);
      const s = 0.07 + rnd() * 0.16;
      peb.put(G.sph(s, 6, 4), M.seabed, x, L.seabed + s * 0.4, z, rnd() * 3, 1.4);
    }
    peb.build(grp, { castShadow: false, outline: true, outlineWidth: 0.45 });

    /* 沉底旧轮胎 */
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.13, 8, 18), M.ironMatte);
    tire.position.set(-1.6, L.seabed + 0.16, 1.4);
    tire.rotation.set(Math.PI / 2 - 0.35, 0.6, 0.2);
    grp.add(tire); TY.outline.attach(tire, 0.9);
    const tire2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.11, 8, 16), M.ironMatte);
    tire2.position.set(3.4, L.seabed + 0.14, -2.6);
    tire2.rotation.set(Math.PI / 2 - 0.2, -0.4, 0.5);
    grp.add(tire2); TY.outline.attach(tire2, 0.9);

    /* 锚链 */
    const chain = new THREE.Group();
    const nlink = 26;
    for (let i = 0; i < nlink; i++) {
      const t = i / (nlink - 1);
      const x = -1.6 + t * 5.4;
      const y = L.seabed + 0.12 + Math.sin(t * Math.PI) * 0.28;
      const z = 1.4 - t * 2.4;
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.028, 5, 10), M.rustSolid);
      link.position.set(x, y, z);
      link.rotation.set(i % 2 ? Math.PI / 2 : 0, i * 0.4, 0.4);
      chain.add(link);
    }
    grp.add(chain);
    quay.chain = chain;
    // 锚
    const anchor = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), M.rustSolid);
    anchor.add(shaft);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 5, 12, Math.PI), M.rustSolid);
    arm.position.y = -0.5; arm.rotation.z = Math.PI;
    anchor.add(arm);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.03, 5, 10), M.rustSolid);
    ring.position.y = 0.56; ring.rotation.x = Math.PI / 2;
    anchor.add(ring);
    anchor.position.set(4.0, L.seabed + 0.5, -1.0);
    anchor.rotation.set(0.5, 0.9, 0.2);
    grp.add(anchor); TY.outline.attach(anchor, 0.9);

    /* 海草 */
    const weedMat = TY.toon({ color: 0x3e8a5c, steps: 3, side: THREE.DoubleSide });
    const wg = new THREE.PlaneGeometry(0.16, 0.9, 1, 5);
    wg.translate(0, 0.45, 0);
    const clumps = [[0.4, -5.2], [5.6, 0.6], [7.8, -4.4], [2.0, 3.0], [8.4, 2.6], [-2.2, -6.0]];
    clumps.forEach((c, i) => {
      for (let k = 0; k < 4; k++) {
        const m = new THREE.Mesh(wg.clone(), weedMat);
        const s = 0.8 + ((i + k) % 3) * 0.3;
        m.scale.set(s, s * 1.2, 1);
        m.position.set(c[0] + (k - 1.5) * 0.18, L.seabed + 0.03, c[1] + ((k % 2) - 0.5) * 0.22);
        m.rotation.y = k * 1.3 + i;
        grp.add(m);
        quay.weed.push({ m: m, phase: i * 2 + k, base: m.rotation.y, x: m.position.x, z: m.position.z, sub: true });
      }
    });

    /* 小鱼（实例化） */
    const fishGeo = mergeFishGeo();
    const fishMat = TY.toon({
      color: 0x9fd8e0, steps: 3, side: THREE.DoubleSide,
      spec: { color: 0xffffff, strength: 0.5, power: 60, thresh: 0.4 },
      rim: { color: 0xdcffff, strength: 0.3, power: 2.4 },
    });
    const N = 26;
    const inst = new THREE.InstancedMesh(fishGeo, fishMat, N);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst.frustumCulled = false;
    grp.add(inst);
    const rnd2 = U.mulberry32(99);
    for (let i = 0; i < N; i++) {
      quay.fish.push({
        p: new THREE.Vector3(-2.5 + rnd2() * 9, L.seabed + 0.35 + rnd2() * 0.9, -8 + rnd2() * 11),
        v: new THREE.Vector3((rnd2() - 0.5) * 0.4, 0, (rnd2() - 0.5) * 0.4),
        phase: rnd2() * 6.28, speed: 0.28 + rnd2() * 0.35, scat: 0, size: 0.7 + rnd2() * 0.6,
      });
    }
    quay.fishInst = inst;
  };

  function mergeFishGeo() {
    const body = new THREE.SphereGeometry(0.11, 8, 6);
    body.scale(1.9, 0.72, 0.5);
    const tail = new THREE.ConeGeometry(0.07, 0.14, 4);
    tail.rotateZ(Math.PI / 2);
    tail.rotateY(Math.PI / 2);
    tail.scale(1, 1, 0.4);
    tail.translate(-0.22, 0, 0);
    const fin = new THREE.ConeGeometry(0.05, 0.10, 3);
    fin.translate(0, 0.09, 0);
    return U.mergeGeos([body, tail, fin]);
  }

  /* ---------------- 消波块 ---------------- */
  quay.buildTetrapods = function (grp) {
    const M = TY.M;
    const dirs = [
      new THREE.Vector3(1, 1, 1).normalize(),
      new THREE.Vector3(1, -1, -1).normalize(),
      new THREE.Vector3(-1, 1, -1).normalize(),
      new THREE.Vector3(-1, -1, 1).normalize(),
    ];
    const proto = new U.Builder();
    dirs.forEach((d) => {
      const g = G.cyl(0.17, 0.10, 0.46, 8);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      m.compose(d.clone().multiplyScalar(0.23), q, new THREE.Vector3(1, 1, 1));
      proto.add(g, M.concreteSide, m, 0.9);
    });
    const tmp = new THREE.Group();
    proto.build(tmp, { outline: false });

    const spots = [
      [9.3, -9.1, 0.5], [9.1, -5.4, 1.2], [8.9, 2.9, 2.1], [-2.4, -9.0, 0.9],
      [7.3, -9.2, 1.7], [3.0, 3.4, 2.8],
    ];
    spots.forEach((s, i) => {
      const g = new THREE.Group();
      tmp.children.forEach((c) => {
        const n = new THREE.Mesh(c.geometry, c.material);
        n.position.copy(c.position); n.quaternion.copy(c.quaternion); n.scale.copy(c.scale);
        n.castShadow = true; n.receiveShadow = true;
        g.add(n);
        TY.outline.attach(n, 0.9);
      });
      g.position.set(s[0], -0.28, s[1]);
      g.rotation.y = s[2];
      g.scale.setScalar(0.95 + (i % 3) * 0.12);
      grp.add(g);
      quay.tetra.push(g);
    });
  };

  /* ---------------- 更新 ---------------- */
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();

  quay.update = function (t, dt, camera) {
    /* 海藻摆动 */
    for (const w of quay.weed) {
      const s = Math.sin(t * 1.35 + w.phase) * 0.18 + Math.sin(t * 2.7 + w.phase * 1.7) * 0.07;
      w.m.rotation.y = w.base + s * 0.9;
      w.m.rotation.x = s * 0.35;
    }
    /* 小鱼游动 */
    if (quay.fishInst) {
      const cam = camera.position;
      for (let i = 0; i < quay.fish.length; i++) {
        const f = quay.fish[i];
        // 靠近镜头时散开
        const d = f.p.distanceTo(cam);
        const target = d < 9 ? 1 : 0;
        f.scat += (target - f.scat) * Math.min(1, dt * 2.2);
        f.v.x += (Math.sin(t * 0.5 + f.phase) * 0.12 - f.v.x * 0.3) * dt;
        f.v.z += (Math.cos(t * 0.43 + f.phase * 1.3) * 0.12 - f.v.z * 0.3) * dt;
        const sp = f.speed * (1 + f.scat * 2.4);
        f.p.x += f.v.x * dt * sp * 2.0;
        f.p.z += f.v.z * dt * sp * 2.0;
        f.p.x += Math.sin(t * 2.2 + f.phase) * f.scat * dt * 2.2;
        f.p.z += Math.cos(t * 1.9 + f.phase) * f.scat * dt * 2.2;
        f.p.x = U.clamp(f.p.x, -2.9, 9.6);
        f.p.z = U.clamp(f.p.z, -9.6, 3.9);
        const yaw = Math.atan2(f.v.x, f.v.z) + Math.PI / 2;
        _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const wig = Math.sin(t * 6.0 + f.phase) * 0.22;
        _p.set(f.p.x, f.p.y + Math.sin(t * 0.8 + f.phase) * 0.05, f.p.z);
        _s.set(f.size, f.size, f.size);
        _m.compose(_p, _q, _s);
        quay.fishInst.setMatrixAt(i, _m);
      }
      quay.fishInst.instanceMatrix.needsUpdate = true;
    }
  };

  TY.quay = quay;
})();
