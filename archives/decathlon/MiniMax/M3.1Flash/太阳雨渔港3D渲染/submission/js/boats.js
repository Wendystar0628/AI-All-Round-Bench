/* =====================================================================
   boats.js — 泊位船只 / 船体 / 驾驶舱内部
   ===================================================================== */
(function () {
  'use strict';
  const THREE = window.THREE;
  const TY = window.TY;
  const U = TY.util;
  const G = U.G, T = U.T;
  const M = TY.M;
  const L = TY.LAYOUT;

  const WHITE = new THREE.Color(0xf6f7f2);
  const TEAL = new THREE.Color(0x2c7d78);
  const DECK = new THREE.Color(0x8e9a96);

  /* ---------------- 船体生成 ---------------- */
  function makeHull(len, beam, depth, opts) {
    opts = opts || {};
    const NS = opts.ns || 34;
    const P = 13, k = 6, DECKROWS = 7;
    const e = opts.section || 2.55;
    const prof = opts.profile || [0.58, 0.88, 1.0, 0.99, 0.88, 0.62, 0.16, 0.0];

    function sampleProf(t) {
      const n = prof.length - 1;
      const x = U.clamp(t, 0, 1) * n;
      const i = Math.min(n - 1, Math.floor(x));
      const f = x - i;
      const p0 = prof[Math.max(0, i - 1)], p1 = prof[i], p2 = prof[Math.min(n, i + 1)], p3 = prof[Math.min(n, i + 2)];
      return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    }

    const stations = [];
    for (let s = 0; s <= NS; s++) {
      const t = s / NS;
      const hb = (beam / 2) * sampleProf(t);
      const sheerY = depth * (1 + 0.20 * Math.pow(t, 2.4) + 0.05 * Math.pow(1 - t, 2.2));
      const keelY = depth * (0.34 * Math.pow(1 - t, 2.8) + 0.24 * Math.pow(t, 3.2));
      stations.push({ t, hb, sheerY, keelY });
    }

    const draft = depth * 0.34;
    const rows = [];   // {v, c}
    // 每站的 v 分布不同（水线位置随船身变化）→ 每站单独算
    function rowList(st) {
      const out = [];
      let vwl = 0;
      if (st.keelY < draft && st.sheerY > draft) {
        const c = Math.pow((draft - st.keelY) / (st.sheerY - st.keelY), 1 / e);
        vwl = Math.acos(U.clamp(c, -1, 1)) / Math.PI;
      }
      const vs = [];
      for (let j = 0; j < P; j++) {
        let v;
        if (j <= k) v = vwl * Math.pow(j / k, 0.85);
        else v = vwl + (0.5 - vwl) * Math.pow((j - k) / (P - 1 - k), 1.12);
        vs.push(v);
      }
      const wlIdx = k;
      for (let j = 0; j <= wlIdx; j++) out.push({ v: vs[j], c: WHITE });
      out.push({ v: vs[wlIdx], c: TEAL });
      for (let j = wlIdx + 1; j < P; j++) out.push({ v: vs[j], c: TEAL });
      for (let j = P - 2; j >= wlIdx + 1; j--) out.push({ v: 1 - vs[j], c: TEAL });
      out.push({ v: 1 - vs[wlIdx], c: TEAL });
      out.push({ v: 1 - vs[wlIdx], c: WHITE });
      for (let j = wlIdx - 1; j >= 0; j--) out.push({ v: 1 - vs[j], c: WHITE });
      // 甲板
      for (let m = 1; m < DECKROWS; m++) {
        const u = m / DECKROWS;
        out.push({ v: 1 - 2 * u, deck: u, c: DECK });
      }
      return out;
    }

    const rowCounts = rowList(stations[0]).length;
    const pos = [], uv = [], col = [], idx = [];
    for (let s = 0; s <= NS; s++) {
      const st = stations[s];
      const rowsS = rowList(st);
      for (let r = 0; r < rowCounts; r++) {
        const rw = rowsS[r];
        let z, y;
        if (rw.deck !== undefined) {
          z = st.hb * rw.v;
          y = st.sheerY + 0.05 * depth * (1 - Math.pow(rw.deck * 2 - 1, 2)) * 0.5;
        } else {
          const c = Math.cos(Math.PI * rw.v);
          z = -st.hb * c;
          y = st.keelY + (st.sheerY - st.keelY) * Math.pow(Math.abs(c), e);
        }
        const x = -len / 2 + st.t * len;
        pos.push(x, y, z);
        uv.push(st.t * 3.0, rw.deck !== undefined ? (rw.deck * 0.5 + 0.5) : (rw.v));
        col.push(rw.c.r, rw.c.g, rw.c.b);
      }
    }
    const rowsPer = rowCounts;
    for (let s = 0; s < NS; s++) {
      for (let r = 0; r < rowsPer - 1; r++) {
        const a = s * rowsPer + r, b = a + 1, c2 = a + rowsPer, d = c2 + 1;
        idx.push(a, c2, b, b, c2, d);
      }
    }
    // 船尾封板
    const capCenter0 = pos.length / 3;
    {
      const st = stations[0];
      const rowsS = rowList(st);
      let cx = 0, cy = 0, cz = 0;
      for (const rw of rowsS) {
        const c = Math.cos(Math.PI * rw.v);
        const z = rw.deck !== undefined ? st.hb * rw.v : -st.hb * c;
        const y = rw.deck !== undefined ? st.sheerY + 0.02 * depth : st.keelY + (st.sheerY - st.keelY) * Math.pow(Math.abs(c), e);
        cx += -len / 2; cy += y; cz += z;
      }
      pos.push(cx / rowsS.length, cy / rowsS.length, cz / rowsS.length);
      uv.push(0.02, 0.5); col.push(DECK.r, DECK.g, DECK.b);
      for (let r = 0; r < rowsPer - 1; r++) idx.push(capCenter0, r + 1, r);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  TY.makeHull = makeHull;

  /* 舷缘（护栏管） */
  function gunwaleCurve(len, beam, depth, opts) {
    const NS = opts && opts.ns || 26;
    const prof = (opts && opts.profile) || [0.58, 0.88, 1.0, 0.99, 0.88, 0.62, 0.16, 0.0];
    function sampleProf(t) {
      const n = prof.length - 1;
      const x = U.clamp(t, 0, 1) * n;
      const i = Math.min(n - 1, Math.floor(x));
      const f = x - i;
      const p0 = prof[Math.max(0, i - 1)], p1 = prof[i], p2 = prof[Math.min(n, i + 1)], p3 = prof[Math.min(n, i + 2)];
      return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    }
    const pts = [];
    for (let s = 0; s <= NS; s++) {
      const t = s / NS;
      const hb = (beam / 2) * sampleProf(t);
      const sheerY = depth * (1 + 0.20 * Math.pow(t, 2.4) + 0.05 * Math.pow(1 - t, 2.2));
      pts.push(new THREE.Vector3(-len / 2 + t * len, sheerY, -hb));
    }
    for (let s = NS; s >= 0; s--) {
      const t = s / NS;
      const hb = (beam / 2) * sampleProf(t);
      const sheerY = depth * (1 + 0.20 * Math.pow(t, 2.4) + 0.05 * Math.pow(1 - t, 2.2));
      pts.push(new THREE.Vector3(-len / 2 + t * len, sheerY, hb));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  }

  /* ---------------- 船只 ---------------- */
  const boats = {
    group: null,
    list: [],
  };

  const SPECS = [
    { id: 'A', x: -2.05, z: 2.55, rot: Math.PI / 2, len: 3.9, beam: 1.34, depth: 0.72, cabin: false, tint: 0x3f8f86, style: 'work' },
    { id: 'B', x: -2.05, z: -2.25, rot: Math.PI / 2, len: 4.25, beam: 1.5, depth: 0.78, cabin: true, tint: 0x2f6f9c, style: 'cabin' },
    { id: 'C', x: -2.05, z: -6.75, rot: Math.PI / 2, len: 4.5, beam: 1.58, depth: 0.82, cabin: true, tint: 0x2c7d78, style: 'cabin', depart: true },
    { id: 'D', x: -0.35, z: 3.15, rot: 0, len: 3.55, beam: 1.22, depth: 0.66, cabin: true, tint: 0xe8e2d2, style: 'sport' },
  ];

  boats.build = function (scene) {
    const grp = new THREE.Group();
    grp.name = 'boats';
    scene.add(grp);
    boats.group = grp;
    SPECS.forEach((s) => {
      const b = buildBoat(s);
      b.group.position.set(s.x, 0, s.z);
      b.group.rotation.y = s.rot;
      grp.add(b.group);
      boats.list.push(b);
    });
    TY.registerReflect(grp);
    return grp;
  };

  function buildBoat(spec) {
    const g = new THREE.Group();
    g.name = 'boat_' + spec.id;
    const bld = new U.Builder();
    const hullMat = TY.toon({
      color: 0xffffff, vertexColors: true, steps: 3, contrast: 0.9,
      spec: { color: 0xffffff, strength: 0.40, power: 64, thresh: 0.40 },
      rim: { color: 0xeaf7ff, strength: 0.22, power: 3.0 },
    });

    const hull = new THREE.Mesh(makeHull(spec.len, spec.beam, spec.depth, {
      profile: spec.style === 'sport' ? [0.70, 0.94, 1.0, 0.98, 0.84, 0.52, 0.12, 0.0]
        : spec.style === 'work' ? [0.50, 0.84, 1.0, 0.99, 0.86, 0.58, 0.14, 0.0]
          : [0.62, 0.92, 1.0, 0.98, 0.88, 0.60, 0.16, 0.0],
    }), hullMat);
    hull.castShadow = true; hull.receiveShadow = true;
    g.add(hull);
    TY.outline.attach(hull, 1.15);

    const draft = spec.depth * 0.34;
    g.position.y = -draft;

    /* 舷缘 */
    const gc = gunwaleCurve(spec.len, spec.beam, spec.depth, {
      profile: spec.style === 'sport' ? [0.70, 0.94, 1.0, 0.98, 0.84, 0.52, 0.12, 0.0]
        : spec.style === 'work' ? [0.50, 0.84, 1.0, 0.99, 0.86, 0.58, 0.14, 0.0]
          : [0.62, 0.92, 1.0, 0.98, 0.88, 0.60, 0.16, 0.0],
    });
    const gw = new THREE.Mesh(new THREE.TubeGeometry(gc, 60, 0.035, 5, true), M.whitePlastic);
    g.add(gw); TY.outline.attach(gw, 0.95);

    /* 舷侧色带 */
    const band = new THREE.Mesh(new THREE.TubeGeometry(gc, 60, 0.028, 4, true), M.teal);
    band.scale.set(1, 0.965, 1.012);
    g.add(band);

    const sheerY = spec.depth * 1.0;
    const bwl = spec.beam / 2;

    /* 驾驶舱 / 船舱 */
    if (spec.cabin) {
      buildCabin(g, bld, spec, sheerY, bwl);
    } else {
      buildOpenBoat(g, bld, spec, sheerY, bwl);
    }

    /* 桅杆 / 天线 / 雷达罩 / 遮阳铁架 */
    buildDeckGear(g, bld, spec, sheerY, bwl);

    /* 救生圈 + 旧轮胎护舷 */
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.068, 8, 18), M.orange);
    ring.position.set(-spec.len * 0.28, sheerY + 0.2, bwl + 0.07);
    ring.rotation.set(0.12, 0, 0);
    g.add(ring); TY.outline.attach(ring, 0.95);
    // 救生圈白色绑带
    const bandB = new U.Builder();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      bandB.add(G.box(0.075, 0.075, 0.15), M.whitePlastic,
        T.m(-spec.len * 0.28 + Math.cos(a) * 0.21, sheerY + 0.2 + Math.sin(a) * 0.21, bwl + 0.07, 0, 0, a), 1.4);
    }
    bandB.build(g, { outline: false });

    const fenderTires = [];
    for (let i = 0; i < 2; i++) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.062, 7, 14), M.ironMatte);
      tire.position.set(spec.len * (0.16 - i * 0.42), sheerY - 0.14, bwl + 0.04);
      tire.rotation.set(Math.PI / 2, 0, 0.12 * (i ? 1 : -1));
      g.add(tire); TY.outline.attach(tire, 0.9);
      fenderTires.push(tire);
    }

    /* 船锚 + 小绞盘 */
    bld.put(G.box(0.26, 0.16, 0.2), M.steel, spec.len * 0.3, sheerY + 0.1, 0, 0, 1.2);
    bld.put(G.cyl(0.05, 0.05, 0.14, 8), M.steel, spec.len * 0.3, sheerY + 0.22, 0, 0, 1.2);

    bld.build(g, { outline: true, outlineWidth: 0.95 });

    return { spec: spec, group: g, hull: hull, draft: draft, fenders: fenderTires, home: new THREE.Vector3(spec.x, 0, spec.z) };
  }

  /* 无舱小渔船 */
  function buildOpenBoat(g, bld, spec, sheerY, bwl) {
    // 甲板板条
    bld.put(G.box(spec.len * 0.78, 0.04, spec.beam * 0.72), M.wood, -spec.len * 0.02, sheerY + 0.02, 0, 0, 1.0);
    // 驾驶台
    bld.put(G.box(0.62, 0.62, 0.72), M.whitePlastic, spec.len * 0.16, sheerY + 0.33, -0.18, 0, 1.1);
    bld.put(G.box(0.66, 0.06, 0.76), M.whitePlastic, spec.len * 0.16, sheerY + 0.66, -0.18, 0, 1.1);
    // 窗
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.3), M.glassDark);
    w.position.set(spec.len * 0.16 + 0.32, sheerY + 0.46, -0.18);
    w.rotation.y = Math.PI / 2;
    g.add(w);
    // 棚架
    for (let i = 0; i < 4; i++) {
      const px = spec.len * 0.16 + (i % 2 ? 0.24 : -0.24);
      const pz = -0.18 + (i < 2 ? 0.28 : -0.28);
      bld.put(G.cyl(0.022, 0.022, 0.9, 6), M.steel, px, sheerY + 1.08, pz);
    }
    bld.put(G.box(0.62, 0.04, 0.68), M.whitePlastic, spec.len * 0.16, sheerY + 1.54, -0.18, 0, 1.1);
    // 鱼箱
    bld.put(G.box(0.42, 0.24, 0.3), M.crateWhite, -spec.len * 0.22, sheerY + 0.14, 0.22, 0.2, 1.1);
    // 缆绳盘
    bld.add(G.tor(0.17, 0.035, 6, 14), M.rope, T.m(-spec.len * 0.3, sheerY + 0.06, -0.2, Math.PI / 2, 0.4, 0), 1.2);
  }

  /* 带驾驶舱的船 */
  function buildCabin(g, bld, spec, sheerY, bwl) {
    const isSport = spec.style === 'sport';
    const cw = isSport ? 1.12 : 1.22;     // 舱宽
    const cd = isSport ? 1.55 : 1.75;     // 舱长
    const ch = isSport ? 1.42 : 1.62;     // 舱高
    const cx = isSport ? -spec.len * 0.04 : -spec.len * 0.05;
    const cy = sheerY + 0.04;

    // 舱体下半部（腰板）
    bld.put(G.box(cd, ch * 0.42, cw), M.whitePlastic, cx, cy + ch * 0.21, 0, 0, 0.9);
    // 角柱
    const ph = ch * 0.58;
    for (let i = 0; i < 4; i++) {
      const sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
      bld.put(G.box(0.08, ph, 0.08), M.whitePlastic, cx + sx * (cd / 2 - 0.04), cy + ch * 0.42 + ph / 2, sz * (cw / 2 - 0.04), 0, 1.4);
    }
    // 舱顶
    bld.put(G.box(cd + 0.16, 0.09, cw + 0.14), M.whitePlastic, cx, cy + ch + 0.04, 0, 0, 0.9);
    // 顶棚内衬（用于接收水面粼光）
    const liner = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.12, cw - 0.1), TY.causticsMaterial ? TY.causticsMaterial() : M.whitePlastic);
    liner.rotation.x = Math.PI / 2;
    liner.position.set(cx, cy + ch - 0.02, 0);
    g.add(liner);
    if (liner.material !== M.whitePlastic) liner.material.side = THREE.DoubleSide;

    /* 玻璃 */
    const glassMat = M.glass;
    const wz = cy + ch * 0.42 + ph * 0.5;
    // 前窗（船首方向）
    const fw = new THREE.Mesh(new THREE.PlaneGeometry(cw - 0.14, ph * 0.82), glassMat);
    fw.position.set(cx + cd / 2 + 0.005, wz, 0);
    fw.rotation.y = Math.PI / 2;
    g.add(fw);
    // 侧窗
    for (let s = -1; s <= 1; s += 2) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(cd - 0.2, ph * 0.82), glassMat);
      sw.position.set(cx, wz, s * (cw / 2 + 0.005));
      sw.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(sw);
    }
    // 尾窗（留出舱门）
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.44, ph * 0.82), glassMat);
    bw.position.set(cx - cd / 2 - 0.005, wz, cw * 0.22);
    bw.rotation.y = -Math.PI / 2;
    g.add(bw);

    /* 舱门（敞开） */
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, ph * 0.92, cw * 0.42), M.whitePlastic);
    door.position.set(cx - cd / 2 - 0.02, wz, -cw * 0.28 - cw * 0.21 * Math.cos(0.9));
    door.rotation.y = 0.9;
    g.add(door); TY.outline.attach(door, 0.9);

    /* ---------------- 舱内陈设 ---------------- */
    const interior = new THREE.Group();
    interior.position.set(cx, cy, 0);
    g.add(interior);
    const ib = new U.Builder();
    // 地板
    ib.put(G.box(cd - 0.08, 0.05, cw - 0.08), M.woodDark, 0, 0.03, 0, 0, 1.2);
    // 操纵台
    ib.put(G.box(0.34, 0.72, cw - 0.26), M.woodDark, cd / 2 - 0.28, 0.38, 0, 0, 1.2);
    ib.put(G.box(0.42, 0.08, cw - 0.2), M.woodDark, cd / 2 - 0.3, 0.78, 0, 0, 1.2);
    // 座凳
    ib.put(G.box(0.34, 0.08, 0.4), M.woodDark, cd / 2 - 0.68, 0.44, 0, 0, 1.2);
    ib.put(G.box(0.08, 0.42, 0.08), M.steel, cd / 2 - 0.68, 0.22, 0.14, 0, 1.4);
    ib.put(G.box(0.08, 0.42, 0.08), M.steel, cd / 2 - 0.68, 0.22, -0.14, 0, 1.4);
    // 小桌
    ib.put(G.box(0.34, 0.05, 0.5), M.woodDark, -0.1, 0.5, -cw / 2 + 0.3, 0, 1.2);
    ib.put(G.box(0.06, 0.48, 0.06), M.steel, -0.1, 0.26, -cw / 2 + 0.3, 0, 1.4);
    // 挂衣钩上的黄色雨衣
    ib.put(G.cyl(0.012, 0.012, 0.1, 5), M.steel, cd / 2 - 0.44, ch * 0.62, -cw / 2 + 0.08, 0, 1.4);
    ib.build(interior, { outline: true, outlineWidth: 0.8 });

    // 船舵
    const wheel = new THREE.Group();
    const wr = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 18), M.woodDark);
    wheel.add(wr);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.30, 0.014), M.woodDark);
      sp.rotation.z = (i / 5) * Math.PI;
      wheel.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), M.steel);
    hub.rotation.x = Math.PI / 2;
    wheel.add(hub);
    wheel.position.set(cd / 2 - 0.46, 0.86, 0);
    wheel.rotation.y = Math.PI / 2;
    interior.add(wheel);
    TY.outline.attach(wr, 0.85);
    // 舵柱
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.44, 8), M.steel);
    col.position.set(cd / 2 - 0.36, 0.66, 0);
    interior.add(col);

    // 雷达屏
    const radar = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), TY.M.radarScreen);
    radar.position.set(cd / 2 - 0.48, 1.02, 0.0);
    radar.rotation.set(-0.22, -Math.PI / 2, 0);
    interior.add(radar);
    const radarCase = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.42), M.ironMatte);
    radarCase.position.set(cd / 2 - 0.5, 1.0, 0);
    interior.add(radarCase); TY.outline.attach(radarCase, 0.8);
    // 鱼探仪
    const finder = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), TY.M.finderScreen);
    finder.position.set(cd / 2 - 0.46, 0.96, -0.34);
    finder.rotation.set(-0.3, -Math.PI / 2, 0);
    interior.add(finder);
    // 仪表小灯
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), TY.toon({
      color: 0x9fffcf, steps: 2, emissive: 0x49ffa0, emissiveIntensity: 1.4,
    }));
    lamp.position.set(cd / 2 - 0.42, 1.1, 0.28);
    interior.add(lamp);

    // 夹在板上的海图
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.3), M.woodDark);
    board.position.set(-0.25, 0.78, -cw / 2 + 0.1);
    board.rotation.set(0.12, 0.2, 0);
    interior.add(board); TY.outline.attach(board, 0.8);
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.36), M.chart);
    chart.position.set(-0.23, 0.79, -cw / 2 + 0.1);
    chart.rotation.set(0.12, 0.2, 0);
    chart.rotateX(-Math.PI / 2);
    interior.add(chart);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.09), M.steel);
    clip.position.set(-0.24, 0.98, -cw / 2 + 0.06);
    interior.add(clip);
    // 潮汐表
    const tide = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), M.tide);
    tide.position.set(0.1, 0.86, -cw / 2 + 0.02);
    tide.rotation.y = Math.PI;
    interior.add(tide);

    // 保温壶 + 搪瓷杯
    const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.24, 12), M.steel);
    thermos.position.set(-0.12, 0.66, -cw / 2 + 0.28);
    interior.add(thermos); TY.outline.attach(thermos, 0.8);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.05, 12), M.teal);
    cap.position.set(-0.12, 0.8, -cw / 2 + 0.28);
    interior.add(cap);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.085, 12), M.whitePlastic);
    mug.position.set(0.04, 0.57, -cw / 2 + 0.3);
    interior.add(mug); TY.outline.attach(mug, 0.75);
    const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 5, 10, Math.PI * 1.3), M.bluePlastic);
    mugHandle.position.set(0.08, 0.57, -cw / 2 + 0.3);
    mugHandle.rotation.set(Math.PI / 2, 0, 0.5);
    interior.add(mugHandle);

    // 黄色雨衣（挂在钩上）
    const coat = new THREE.Group();
    const coatBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.52, 10, 1, true), M.yellowRain);
    coatBody.material.side = THREE.DoubleSide;
    coatBody.position.y = -0.26;
    coat.add(coatBody);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.yellowRain);
    hood.position.y = 0.02;
    coat.add(hood);
    coat.position.set(cd / 2 - 0.46, ch * 0.58, -cw / 2 + 0.12);
    coat.rotation.z = 0.1;
    interior.add(coat);
    TY.outline.attach(coatBody, 0.85);

    // 护身符 + 渔获照片（贴在窗边）
    const charm = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.09), M.charm);
    charm.position.set(cd / 2 - 0.42, ch * 0.66, cw / 2 - 0.03);
    charm.rotation.y = Math.PI;
    interior.add(charm);
    const ph1 = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.11), M.fishPhoto);
    ph1.position.set(cd / 2 - 0.62, ch * 0.62, cw / 2 - 0.03);
    ph1.rotation.y = Math.PI;
    interior.add(ph1);
    const ph2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), M.fishPhoto);
    ph2.position.set(cd / 2 - 0.5, ch * 0.58, cw / 2 - 0.03);
    ph2.rotation.y = Math.PI;
    interior.add(ph2);

    // 舱内小灯
    const ceil = new THREE.PointLight(0xffe3b0, 0.55, 2.4, 2);
    ceil.position.set(cx - 0.1, cy + ch - 0.12, 0);
    g.add(ceil);
  }

  /* 甲板设备：桅杆 / 天线 / 雷达罩 / 遮阳铁架 */
  function buildDeckGear(g, bld, spec, sheerY, bwl) {
    const isSport = spec.style === 'sport';
    const cx = isSport ? -spec.len * 0.04 : -spec.len * 0.05;
    const top = sheerY + (isSport ? 1.46 : 1.66);
    // 桅杆
    bld.put(G.cyl(0.032, 0.042, 1.55, 8), M.steel, cx + spec.len * 0.18, top + 0.78, 0, 0, 1.4);
    // 横桁
    bld.put(G.box(0.05, 0.05, 1.0), M.steel, cx + spec.len * 0.18, top + 1.34, 0, 0, 1.4);
    // 天线
    bld.put(G.cyl(0.008, 0.012, 0.85, 5), M.steel, cx - spec.len * 0.18, top + 0.42, 0.22, 0, 1.6);
    bld.put(G.cyl(0.006, 0.008, 0.6, 5), M.steel, cx - spec.len * 0.18, top + 0.3, -0.16, 0, 1.6);
    // 雷达罩
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.whitePlastic);
    dome.position.set(cx + spec.len * 0.05, top + 0.1, 0);
    g.add(dome); TY.outline.attach(dome, 0.9);
    bld.put(G.cyl(0.05, 0.06, 0.12, 8), M.steel, cx + spec.len * 0.05, top + 0.06, 0, 0, 1.4);
    // 遮阳铁架（雷达拱架）
    const aw = isSport ? 0.78 : 0.88;
    for (let i = 0; i < 2; i++) {
      const px = cx + (i ? spec.len * 0.26 : -spec.len * 0.3);
      bld.put(G.cyl(0.02, 0.022, 0.74, 6), M.whitePlastic, px, top + 0.37, 0);
    }
    bld.add(G.cyl(0.02, 0.02, spec.len * 0.58, 6), M.whitePlastic,
      T.m(cx - spec.len * 0.02, top + 0.72, 0, 0, 0, Math.PI / 2), 1.4);
    for (let i = 0; i < 2; i++) {
      const pz = (i ? 1 : -1) * (aw / 2);
      bld.add(G.cyl(0.015, 0.015, aw * 0.55, 5), M.whitePlastic,
        T.m(cx + spec.len * 0.02, top + 0.72, pz * 0.55, 0, 0, 0), 1.4);
    }
    // 顶灯
    const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), TY.toon({
      color: 0xffe0a0, steps: 2, emissive: 0xffcc66, emissiveIntensity: 1.0,
    }));
    navLight.position.set(cx + spec.len * 0.18, top + 1.58, 0);
    g.add(navLight);
  }

  /* ---------------- 系泊缆绳 ---------------- */
  boats.buildMooring = function (scene) {
    const grp = new THREE.Group();
    const bollards = [];
    for (let z = -9.4; z <= 3.6; z += 2.35) bollards.push([L.west.x1 - 0.62, z]);
    for (let x = -2.2; x <= 9.2; x += 2.6) {
      if (x > L.steps.x0 - 0.6 && x < L.slip.x1 + 0.4) continue;
      bollards.push([x, L.south.z0 + 0.62]);
    }
    const nearest = (x, z) => {
      let best = null, bd = 1e9;
      for (const b of bollards) {
        const d = (b[0] - x) * (b[0] - x) + (b[1] - z) * (b[1] - z);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    };
    boats.ropes = [];
    boats.list.forEach((b) => {
      const s = b.spec;
      const bowLocal = new THREE.Vector3(s.len * 0.42, s.depth * 0.72, 0);
      const sternLocal = new THREE.Vector3(-s.len * 0.42, s.depth * 0.72, 0);
      const cosr = Math.cos(s.rot), sinr = Math.sin(s.rot);
      const toWorld = (v) => new THREE.Vector3(
        s.x + v.x * cosr + v.z * sinr, v.y, s.z - v.x * sinr + v.z * cosr);
      const bow = toWorld(bowLocal), stern = toWorld(sternLocal);
      const b1 = nearest(bow.x, bow.z), b2 = nearest(stern.x, stern.z);
      const mkRope = (a, bpt) => {
        const mid1 = a.clone().lerp(bpt, 0.34); mid1.y -= 0.34;
        const mid2 = a.clone().lerp(bpt, 0.68); mid2.y -= 0.26;
        const curve = new THREE.CatmullRomCurve3([a, mid1, mid2, bpt]);
        const geo = new THREE.TubeGeometry(curve, 22, 0.028, 5, false);
        const m = new THREE.Mesh(geo, M.rope);
        m.castShadow = false;
        grp.add(m);
        boats.ropes.push({ m: m, curve: curve, base: a.clone(), boat: b });
      };
      mkRope(bow, new THREE.Vector3(b1[0], L.top + 0.5, b1[1]));
      mkRope(stern, new THREE.Vector3(b2[0], L.top + 0.5, b2[1]));
    });
    scene.add(grp);
    return grp;
  };

  /* ---------------- 更新 ---------------- */
  boats.update = function (t, dt) {
    for (let bi = 0; bi < boats.list.length; bi++) {
      const b = boats.list[bi];
      const s = b.spec;
      const wx = b.group.position.x, wz = b.group.position.z;
      const h = TY.water.waveH(wx, wz, t);
      const [gx, gz] = TY.water.waveGrad(wx, wz, t);
      if (s.phase === undefined) s.phase = (bi * 1.913 + 0.7) % 6.283;
      const ph = s.phase;
      const amp = s.depart ? 0.055 : 0.032;
      b.group.position.y = -b.draft + h + Math.sin(t * 0.9 + ph) * amp;
      b.group.rotation.z = (gx * 0.8 + Math.sin(t * 0.75 + ph) * 0.035) * (s.depart ? 0.8 : 1);
      b.group.rotation.x = (-gz * 0.8 + Math.cos(t * 0.63 + ph * 1.3) * 0.03) * (s.depart ? 0.8 : 1);
      b.group.rotation.y = s.rot + Math.sin(t * 0.42 + ph * 2.1) * 0.012;
    }
  };

  TY.boats = boats;
})();
