/* 星际战舰编队 — main
 * Scene assembly, fleet motion, the round clock and the video export API.
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core, V = F.Vox, P = F.Palette, FX = F.FX, Dir = F.Director;
  const M4 = Core.M4, V3 = Core.V3;

  const ROUND = Dir.PERIOD;

  /* ---------------- speed profile ---------------- */
  const SPD = { base: 120, K: 2.2, s0: 66, s1: 78 };
  const NS = 1024;
  const distTable = new Float32Array(NS + 1);
  (function buildDist() {
    let acc = 0;
    distTable[0] = 0;
    for (let i = 1; i <= NS; i++) {
      const u0 = (i - 1) / NS * ROUND, u1 = i / NS * ROUND;
      const v = speedAt(0.5 * (u0 + u1));
      acc += v * (u1 - u0);
      distTable[i] = acc;
    }
  })();
  function speedAt(u) {
    const S = Core.smootherstep(SPD.s0, SPD.s1, u);
    return SPD.base * (1 + SPD.K * (S - 0.07692));
  }
  function distAt(u) {
    u = Core.wrap(u, ROUND);
    const f = (u / ROUND) * NS;
    const i = Math.min(NS - 1, Math.floor(f));
    return Core.lerp(distTable[i], distTable[i + 1], f - i);
  }
  const D_PER_ROUND = distTable[NS];

  /* ---------------- fleet layout ---------------- */
  /* the port lane (x -270..-100) is kept clear for the camera's flyby */
  const CLOSE_ESCORTS = [
    [-248, 78, -210, 0.30], [196, -44, -330, 1.1], [168, 30, -430, 2.3],
    [-206, 150, -330, 0.7], [156, -62, -96, 4.1], [206, 48, 268, 1.8],
    [96, 104, 236, 3.4], [-124, -86, -486, 5.2], [134, 88, -258, 2.8],
    [208, -32, -528, 4.7],
  ];
  const VANGUARDS = [
    [-820, 30, 980], [-640, -44, 1420], [-380, 62, 760], [-180, -60, 1860],
    [120, 40, 1180], [420, -50, 1560], [700, 72, 900], [-900, -20, 2240],
    [-300, 92, 2420], [260, -82, 2080], [640, 30, 2600], [-520, -72, 2900],
    [60, 112, 2760], [880, -30, 2100], [-740, 62, 3100], [340, -92, 3200],
    [-80, -102, 3400], [520, 104, 3500], [-980, 30, 1700], [960, 22, 1500],
  ];

  /* ---------------- world ---------------- */
  const world = {
    renderer: null,
    ships: [], turrets: [], ciws: [], missiles: [], rocks: [], clusters: [],
    drift: [], debris: [], craft: [], rings: [], parked: [],
    shieldGpu: null,
    beamTarget: [0, 0, 2600],
    pulseTargets: [], ciwsTargets: [], impacts: [],
    anchors: { rock: [0, 0, 2600], fleet: [0, 0, 0], muzzle: [0, 0, 574] },
    thrust: 1,
    hologram: [0, 150, 276], atriumCore: [0, 0, -300],
    corridor: true,
    shipList: [],
  };

  let renderer = null;
  let canvas = null;
  let liveTime = 0;
  let exportMode = null;   // {runId, fps, start, frames}
  let lastNow = 0;
  let started = false;

  /* ---------------- build ---------------- */
  function missileMesh() {
    const g = new V.VoxGrid();
    g.fill(-2, -2, -7, 2, 2, 5, P.hullMain);
    g.fill(-1, -1, -7, 1, 1, 5, P.hullMid);
    g.fill(-1, -1, 5, 1, 1, 8, P.warm);
    g.fill(-4, -1, -7, -2, 1, -3, P.trim);
    g.fill(2, -1, -7, 4, 1, -3, P.trim);
    g.fill(-1, -4, -7, 1, -2, -4, P.trim);
    g.fill(-1, 2, -7, 1, 4, -4, P.trim);
    g.fill(-1, -1, -8, 1, 1, -7, P.glow);
    const m = new V.VoxMesh('missile');
    V.emitGrid(m, g, { jitter: 0.05 });
    return m;
  }

  function buildWorld(r) {
    renderer = r;

    /* ---- flagship ---- */
    const fs = F.Fleet.buildFlagship();
    const fsGpu = r.upload(fs.mesh);
    const flagship = {
      kind: 'flagship', gpu: fsGpu, pos: [0, 0, 0], rot: [0, 0, 0],
      meta: fs.meta, hull: [140, 128, 585], shieldIndex: 0, seed: 0.1,
      thrustScale: 1.35, flameLen: 46,
      engineOffsets: fs.meta.engines.map(e => [e[0], e[1], e[2]]),
    };
    flagship.renderable = r.add(fsGpu, M4.create(), { kind: 'solid' });
    world.flagship = flagship;
    world.shipList.push(flagship);
    world.anchors.muzzle = [0, 0, fs.meta.muzzle[2]];

    /* pulse turrets */
    fs.meta.turrets.forEach((t, i) => {
      const gpu = r.upload(t.mesh);
      const item = {
        kind: 'pulse', gpu: gpu, pivot: t.pivot.slice(), idx: i,
        renderable: r.add(gpu, M4.create(), { kind: 'solid' }),
        muzzleWorld: [t.pivot[0], t.pivot[1], t.pivot[2] + 24],
      };
      world.turrets.push(item);
    });

    /* ---- escorts ---- */
    const closeMesh = F.Fleet.buildEscortClose();
    const closeGpu = r.upload(closeMesh.mesh);
    const vanMesh = F.Fleet.buildEscortVanguard();
    const vanGpu = r.upload(vanMesh.mesh);
    const ciwsProto = F.Fleet.buildCIWS();
    const ciwsGpu = r.upload(ciwsProto);

    CLOSE_ESCORTS.forEach((e, i) => {
      const ship = {
        kind: 'close', gpu: closeGpu, pos: [e[0], e[1], e[2]], base: [e[0], e[1], e[2]],
        rot: [0, 0, 0], phase: e[3], idx: i, shieldIndex: 1 + i, seed: i * 0.37,
        hull: [40, 32, 108], thrustScale: 1.0, flameLen: 26,
        engineOffsets: closeMesh.meta.engines.map(v => [v[0], v[1], v[2]]),
      };
      ship.renderable = r.add(closeGpu, M4.create(), { kind: 'solid' });
      world.shipList.push(ship);
      closeMesh.meta.ciws.forEach((c, ci) => {
        const item = {
          kind: 'ciws', gpu: ciwsGpu, pivot: c.pivot.slice(), ship: ship,
          side: c.pivot[0] < 0 ? -1 : 1, idx: world.ciws.length,
          renderable: r.add(ciwsGpu, M4.create(), { kind: 'solid' }),
        };
        world.ciws.push(item);
      });
    });
    VANGUARDS.forEach((e, i) => {
      const ship = {
        kind: 'vanguard', gpu: vanGpu, pos: [e[0], e[1], e[2]], base: [e[0], e[1], e[2]],
        rot: [0, 0, 0], phase: i * 0.83, idx: i, shieldIndex: 11 + i, seed: i * 0.21,
        hull: [42, 22, 112], thrustScale: 0.95, flameLen: 24,
        engineOffsets: vanMesh.meta.engines.map(v => [v[0], v[1], v[2]]),
      };
      ship.renderable = r.add(vanGpu, M4.create(), { kind: 'solid' });
      world.shipList.push(ship);
    });
    // every hull that burns thrust and raises a shield
    world.ships = world.shipList;

    /* missiles (a pool of bodies) */
    const misGpu = r.upload(missileMesh());
    for (let i = 0; i < 10; i++) {
      const item = {
        kind: 'missile', gpu: misGpu, idx: i, alive: false,
        renderable: r.add(misGpu, M4.create(), { kind: 'solid' }),
        launchWorld: [0, 0, 0], target: [0, 0, 0], pos: [0, 0, 0],
      };
      item.renderable.visible = false;
      world.missiles.push(item);
    }

    /* ---- interiors ---- */
    const bridge = F.Interiors.buildBridge();
    const atrium = F.Interiors.buildAtrium();
    const hangar = F.Interiors.buildHangar();
    const corridor = F.Interiors.buildCorridor();
    const dimAmb = [[0.42, 0.47, 0.58], [0.165, 0.185, 0.245]];
    world.interiors = {
      bridge: r.add(r.upload(bridge.mesh), M4.create(), { kind: 'solid', fogDensity: 0.0, amb: dimAmb, emissive: 1.25 }),
      atrium: r.add(r.upload(atrium.mesh), M4.create(), { kind: 'solid', fogDensity: 0.0, amb: dimAmb, emissive: 1.3 }),
      hangar: r.add(r.upload(hangar.mesh), M4.create(), { kind: 'solid', fogDensity: 0.0, amb: dimAmb, emissive: 1.2 }),
      corridor: r.add(r.upload(corridor.mesh), M4.create(), { kind: 'solid', fogDensity: 0.0, amb: dimAmb, emissive: 1.2 }),
    };
    world.hologram = bridge.meta.hologram.slice();
    world.atriumCore = atrium.meta.core.slice();
    atrium.rings.forEach(rg => {
      const gpu = r.upload(rg.mesh);
      const item = { gpu: gpu, y: rg.y, speed: rg.speed, renderable: r.add(gpu, M4.create(), { kind: 'solid', fogDensity: 0.0, amb: dimAmb }) };
      world.rings.push(item);
    });

    /* ---- asteroids ---- */
    const clusterA = F.Space.buildCluster(1337);
    const clusterB = F.Space.buildCluster(1337);   // same silhouette: the field repeats
    world.clusters = [];
    for (let ci = 0; ci < 2; ci++) {
      const rocks = ci === 0 ? clusterA : clusterB;
      const inst = { rocks: [], index: ci };
      for (const rk of rocks) {
        const pieces = rk.pieces.map(pc => {
          const gpu = r.upload(pc.mesh);
          return { gpu: gpu, dir: pc.dir, renderable: r.add(gpu, M4.create(), { kind: 'solid' }) };
        });
        inst.rocks.push({ pos: rk.pos.slice(), radius: rk.radius, spin: rk.spin, pieces: pieces, phase: Core.hash(ci * 13 + rk.pos[0]) * 6.28 });
      }
      world.clusters.push(inst);
    }
    world.anchorRock = world.clusters[0].rocks[0];

    /* fracture debris pool */
    const debrisMeshes = F.Space.buildDebrisPool(77, 26);
    const debrisGpu = debrisMeshes.map(m => r.upload(m));
    for (let i = 0; i < debrisGpu.length; i++) {
      const item = {
        gpu: debrisGpu[i], renderable: r.add(debrisGpu[i], M4.create(), { kind: 'solid' }),
        active: false, pos: [0, 0, 0], vel: [0, 0, 0], rot: [0, 0, 0], spin: [0, 0, 0], born: -99,
      };
      world.debris.push(item);
    }

    /* drifting near-field rubble */
    const drift = F.Space.buildDrift(4242, 46);
    drift.forEach(d => {
      const gpu = r.upload(d.mesh);
      d.renderable = r.add(gpu, M4.create(), { kind: 'solid' });
      world.drift.push(d);
    });

    /* ---- small craft ---- */
    const craftGpu = r.upload(F.Fleet.buildSmallCraft());
    for (let i = 0; i < 8; i++) {
      const item = { gpu: craftGpu, idx: i, renderable: r.add(craftGpu, M4.create(), { kind: 'solid' }), pos: [0, 0, 0], phase: i * 0.14 };
      world.craft.push(item);
    }
    /* ---- craft parked in the hangar bays: the scale reference for the room ---- */
    const PARK = [
      [-68, -49, 126, 0.03], [-70, -49, 68, -0.04], [-67, -49, 10, 0.06],
      [-69, -49, -48, -0.02], [-68, -49, -106, 0.04], [-66, -49, -164, -0.06],
      [-122, -49, 72, 3.12], [-121, -49, -44, 3.06],
    ];
    for (let i = 0; i < PARK.length; i++) {
      const p = PARK[i];
      world.parked.push({
        local: [p[0], p[1], p[2]], yaw: p[3], tmp: M4.create(),
        renderable: r.add(craftGpu, M4.create(), { kind: 'solid', fogDensity: 0.0 }),
      });
    }

    /* ---- shield shell ---- */
    world.shieldGpu = r.upload(FX.buildShieldMesh());

    /* pre-compute weapon targets from the rock layout */
    const rc = world.anchorRock.pos;
    world.pulseTargets = [
      [rc[0] + 380, rc[1] - 60, rc[2] + 40], [rc[0] - 250, rc[1] - 140, rc[2] + 220],
      [rc[0] + 180, rc[1] + 170, rc[2] - 180], [rc[0] - 560, rc[1] - 30, rc[2] - 220],
      [rc[0] + 540, rc[1] + 140, rc[2] - 300], [rc[0] - 120, rc[1] - 230, rc[2] - 320],
    ];
    world.ciwsTargets = [
      [rc[0] + 620, rc[1] - 180, rc[2] + 260], [rc[0] - 700, rc[1] + 120, rc[2] + 120],
      [rc[0] + 80, rc[1] + 330, rc[2] - 120], [rc[0] - 90, rc[1] - 350, rc[2] + 260],
      [rc[0] + 460, rc[1] - 280, rc[2] - 420], [rc[0] - 480, rc[1] - 260, rc[2] + 420],
    ];
  }

  /* ---------------- per-frame world update ---------------- */
  const _m = M4.create();
  function updateWorld(t) {
    const u = Core.wrap(t, ROUND);
    const s = distAt(u);
    const speed = speedAt(u);
    world.thrust = Core.lerp(0.85, 1.0, Core.smoothstep(0, 12, u)) +
      Core.smoothstep(FX.SCHED.accelStart, FX.SCHED.accelEnd, u) * 1.15;

    /* --- formation spread before the salvo, re-group after --- */
    const spread = Core.smoothstep(40, 61, u) * (1 - Core.smoothstep(72, 78, u) * 0.55);

    /* --- ships --- */
    for (const sh of world.shipList) {
      if (sh.kind === 'flagship') {
        sh.pos[0] = 0; sh.pos[1] = 0; sh.pos[2] = 0;
        sh.rot[0] = Math.sin(u * 0.11) * 0.006;
        sh.rot[1] = Math.sin(u * 0.08 + 1.2) * 0.004;
        sh.rot[2] = 0;
      } else {
        const ph = sh.phase;
        const ax = sh.base[0] * (1 + spread * 0.22);
        const ay = sh.base[1] * (1 + spread * 0.3) + Math.sin(u * 0.33 + ph) * 9;
        const az = sh.base[2] + Math.sin(u * 0.21 + ph * 1.7) * 16;
        sh.pos[0] = ax + Math.sin(u * 0.27 + ph) * 7;
        sh.pos[1] = ay;
        sh.pos[2] = az;
        sh.rot[1] = Math.sin(u * 0.19 + ph) * 0.055;
        sh.rot[0] = Math.sin(u * 0.14 + ph * 2.1) * 0.03;
        sh.rot[2] = Math.sin(u * 0.23 + ph * 0.7) * 0.03;
      }
      M4.compose(sh.renderable.m, sh.pos, sh.rot[1], sh.rot[0], sh.rot[2], 1);
      if (sh.kind === 'flagship') {
        // the muzzle sits on the raised bow cannon: take it straight off the model matrix
        const ml = sh.meta.muzzle, m = sh.renderable.m;
        sh.muzzleWorld = [
          sh.pos[0] + m[0] * ml[0] + m[4] * ml[1] + m[8] * ml[2],
          sh.pos[1] + m[1] * ml[0] + m[5] * ml[1] + m[9] * ml[2],
          sh.pos[2] + m[2] * ml[0] + m[6] * ml[1] + m[10] * ml[2],
        ];
        const cb = sh.meta.cannonBase;
        sh.cannonBaseWorld = cb ? [
          sh.pos[0] + m[0] * cb[0] + m[4] * cb[1] + m[8] * cb[2],
          sh.pos[1] + m[1] * cb[0] + m[5] * cb[1] + m[9] * cb[2],
          sh.pos[2] + m[2] * cb[0] + m[6] * cb[1] + m[10] * cb[2],
        ] : sh.muzzleWorld;
        world.anchors.muzzle = sh.muzzleWorld;
      }
      // shield transform
      const hs = sh.hull;
      const sm = M4.create();
      M4.compose(sm, sh.pos, sh.rot[1], sh.rot[0], sh.rot[2], 1);
      const sc = M4.create();
      M4.scaling(sc, hs[0] * 1.18, hs[1] * 1.30, hs[2] * 1.06);
      M4.multiply(sm, sm, sc);
      sh.shieldMatrix = sm;
      sh.shieldNormal = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      sh.shieldColor = sh.kind === 'flagship' ? [0.34, 0.82, 1.0] : [0.40, 0.72, 1.0];
    }
    // interior renderables follow the flagship
    for (const key of ['bridge', 'atrium', 'hangar', 'corridor']) {
      const ir = world.interiors[key];
      if (ir) M4.compose(ir.m, world.flagship.pos, world.flagship.rot[1], world.flagship.rot[0], world.flagship.rot[2], 1);
    }
    // craft parked inside the hangar ride with the hull
    const fm = world.flagship.renderable.m;
    for (const pc of world.parked) {
      M4.compose(pc.tmp, pc.local, pc.yaw, 0, 0, 1);
      M4.multiply(pc.renderable.m, fm, pc.tmp);
    }

    /* --- pulse turrets track their targets --- */
    for (const tu of world.turrets) {
      const tgt = world.pulseTargets[tu.idx % world.pulseTargets.length];
      const p = world.pulseTargets.length ? tgt : [0, 0, 0];
      const dx = p[0] - tu.pivot[0], dy = p[1] - tu.pivot[1], dz = p[2] - tu.pivot[2];
      const L = Math.hypot(dx, dy, dz) || 1;
      const yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / L);
      M4.compose(tu.renderable.m, tu.pivot, yaw, pitch, 0, 1);
      tu.muzzleWorld = [
        tu.pivot[0] + Math.sin(yaw) * Math.cos(pitch) * 24,
        tu.pivot[1] - Math.sin(pitch) * 24,
        tu.pivot[2] + Math.cos(yaw) * Math.cos(pitch) * 24,
      ];
    }

    /* --- CIWS barrels swing to small fragments --- */
    for (const c of world.ciws) {
      const sh = c.ship;
      const tgt = world.ciwsTargets[c.idx % world.ciwsTargets.length];
      const dx = tgt[0] - sh.pos[0] - c.pivot[0];
      const dy = tgt[1] - sh.pos[1] - c.pivot[1];
      const dz = tgt[2] - sh.pos[2] - c.pivot[2];
      const L = Math.hypot(dx, dy, dz) || 1;
      const yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / L);
      const wx = sh.pos[0] + c.pivot[0], wy = sh.pos[1] + c.pivot[1], wz = sh.pos[2] + c.pivot[2];
      M4.compose(c.renderable.m, [wx, wy, wz], sh.rot[1] + yaw, sh.rot[0] + pitch, 0, 1);
      c.muzzleWorld = [
        wx + Math.sin(yaw) * 14, wy - Math.sin(pitch) * 14, wz + Math.cos(yaw) * 14,
      ];
    }

    /* --- asteroids: three lattice instances (previous / current / next) --- */
    const Zc0 = 2600 + distAt(63.5);
    for (let ci = 0; ci < world.clusters.length; ci++) {
      const inst = world.clusters[ci];
      // ci 0 = the current target cluster, ci 1 = the next one down the lane
      const jOffset = ci === 0 ? 0 : 1;
      const rel = Zc0 + jOffset * D_PER_ROUND - s;
      inst.rocks.forEach((rk, ri) => {
        // the current cluster's anchor rock carries the split
        const isTarget = (ci === 0 && ri === 0);
        const broken = ci === 0 ? (u > 63.6) : false;
        const past = ci === 1 ? false : true;
        const bx = rk.pos[0], by = rk.pos[1], bz = rk.pos[2] + rel;
        rk.cur = [bx, by, bz];
        rk.rotY = u * rk.spin + rk.phase;
        rk.rotX = u * rk.spin * 0.6;
        const sep = isTarget && broken ? Math.min(1, (u - 63.6) / 3.2) : 0;
        rk.sep = sep;
        rk.broken = broken;
        rk.pieces.forEach((pc, pi) => {
          const off = sep * (pi === 0 ? 1 : -1) * (26 + ri * 4);
          const dx = pc.dir[0] * off, dy = pc.dir[1] * off, dz = pc.dir[2] * off;
          M4.compose(pc.renderable.m,
            [bx + dx, by + dy, bz + dz],
            rk.rotY + sep * (pi === 0 ? 0.5 : -0.5),
            rk.rotX, sep * (pi === 0 ? 0.3 : -0.3), 1);
          pc.renderable.visible = true;
        });
      });
    }
    const anchor = world.anchorRock;
    world.anchors.rock = anchor.cur ? anchor.cur.slice() : [0, 0, 2600];
    world.beamTarget = world.anchors.rock.slice();

    /* --- fracture debris --- */
    for (const d of world.debris) {
      if (!d.active) { d.renderable.visible = false; continue; }
      const age = u - d.born;
      if (age < 0) { d.renderable.visible = false; continue; }
      d.renderable.visible = true;
      const p = [
        d.pos[0] + d.vel[0] * age,
        d.pos[1] + d.vel[1] * age - 4 * age * age,
        d.pos[2] + d.vel[2] * age,
      ];
      M4.compose(d.renderable.m, p, d.rot[0] + d.spin[0] * age, d.rot[1] + d.spin[1] * age, d.rot[2] + d.spin[2] * age, 1);
    }
    // spawn debris when the target rock breaks
    if (u > 63.6 && !world._debrisSpawned) {
      world._debrisSpawned = true;
      const base = world.anchors.rock;
      let k = 0;
      for (const d of world.debris) {
        const a = Core.hash(k * 3.7) * 6.28, b = Core.hash(k * 5.1) * 2 - 1;
        const rr = Math.sqrt(1 - b * b);
        d.active = true;
        d.born = 63.6 + Core.hash(k * 9.1) * 0.7;
        d.pos = [base[0] + Math.cos(a) * rr * 40, base[1] + b * 40, base[2] + Math.sin(a) * rr * 40];
        d.vel = [Math.cos(a) * rr * (12 + Core.hash(k) * 26), b * 14, Math.sin(a) * rr * (12 + Core.hash(k) * 26) - 6];
        d.rot = [Core.hash(k * 2.2) * 6.28, Core.hash(k * 4.4) * 6.28, Core.hash(k * 6.6) * 6.28];
        d.spin = [(Core.hash(k) - 0.5) * 2.2, (Core.hash(k + 11) - 0.5) * 2.2, (Core.hash(k + 21) - 0.5) * 2.2];
        k++;
      }
      // impacts recorded for the blast effects
      world.impacts = [];
      for (let i = 0; i < 6; i++) {
        const a = Core.hash(i * 4.3) * 6.28;
        world.impacts.push({
          t: 63.7 + i * 0.22, scale: 22 + i * 3,
          p: [base[0] + Math.cos(a) * 70, base[1] + (Core.hash(i) - 0.5) * 70, base[2] + Math.sin(a) * 70],
          color: FX.AMBER,
        });
      }
    }
    if (u < 30) { world._debrisSpawned = false; world.debris.forEach(d => { d.active = false; }); }

    /* --- missiles --- */
    for (const mi of world.missiles) {
      const van = world.shipList.filter(s => s.kind === 'vanguard')[mi.idx % 20];
      const side = mi.idx % 2 === 0 ? 1 : -1;
      const local = [side * 40, 4, -20 + Math.floor(mi.idx / 2) * 6];
      const cy = Math.cos(van.rot[1]), sy = Math.sin(van.rot[1]);
      mi.launchWorld = [
        van.pos[0] + local[0] * cy + local[2] * sy,
        van.pos[1] + local[1],
        van.pos[2] - local[0] * sy + local[2] * cy,
      ];
      mi.target = world.pulseTargets[(mi.idx + 2) % world.pulseTargets.length].slice();
    }

    /* --- drifting rubble --- */
    for (const d of world.drift) {
      const z = Core.wrap(d.z - s + 400, 5200) - 400;
      M4.compose(d.renderable.m, [d.x, d.y, z], d.rot + u * d.spin, u * d.spin * 0.7, 0, 1);
    }

    /* --- small craft on their errands --- */
    for (const c of world.craft) {
      const cycle = 26;
      const start = 1.5 + c.idx * 3.4;
      const local = Core.wrap(u - start, cycle) / cycle;
      c.pos = craftPath(local, c.idx);
      const nx = craftPath(Math.min(0.999, local + 0.01), c.idx);
      const yaw = Math.atan2(nx[0] - c.pos[0], nx[2] - c.pos[2]);
      M4.compose(c.renderable.m, c.pos, yaw, 0, 0, 1);
      c.renderable.visible = local < 0.94;
    }

    /* --- atrium rings turn --- */
    for (const rg of world.rings) {
      const a = u * rg.speed * 6.283;
      M4.compose(rg.renderable.m, [0, 0, -300], a, 0, 0, 1);
    }
  }

  /* small craft flight path (hangar -> escort station -> hangar) */
  const CRAFT_PATH = [
    [-137, -20, 150], [-236, 4, 250], [-248, 12, 470], [-212, 6, 660],
    [-196, -4, 470], [-190, -14, 250], [-137, -20, 150],
  ];
  function craftPath(u, idx) {
    const P = CRAFT_PATH;
    const n = P.length;
    const f = Core.clamp(u, 0, 0.9999) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const lt = f - i;
    const g = (k) => P[Math.max(0, Math.min(n - 1, k))];
    const out = [0, 0, 0];
    Core.catmullVec(out, g(i - 1), g(i), g(i + 1), g(i + 2), lt);
    const bob = Math.sin(u * 40 + idx) * 1.6;
    out[1] += bob;
    return out;
  }

  /* ---------------- render ---------------- */
  function renderAt(t) {
    updateWorld(t);
    const cam = Dir.evaluate(t, world);
    const r = renderer;

    /* camera basis */
    const fwd = [0, 0, 0];
    V3.norm(fwd, V3.sub([0, 0, 0], cam.look, cam.pos));
    const right = [0, 0, 0];
    V3.norm(right, V3.cross([0, 0, 0], fwd, [0, 1, 0]));
    const up = [0, 0, 0];
    V3.cross(up, right, fwd);

    const aspect = r.width / Math.max(1, r.height);
    const proj = M4.perspective(M4.create(), cam.fov, aspect, 1.2, 42000);
    const view = M4.lookAt(M4.create(), cam.pos, cam.look, [0, 1, 0]);
    const vp = M4.multiply(M4.create(), proj, view);
    const inv = invert(M4.create(), vp);

    const inside = cam.space !== 'exterior';
    const keyDir = [-0.35, 0.62, 0.70];
    V3.norm(keyDir, keyDir);
    const planetDir = [0.80, -0.22, 0.56];
    V3.norm(planetDir, planetDir);
    const scene = {
      viewProj: vp, invViewProj: inv,
      camPos: cam.pos, camRight: right, camUp: up,
      keyDir: keyDir, planetDir: planetDir,
      keyColor: inside ? [0.36, 0.40, 0.50] : [1.22, 1.06, 0.88],
      ambTop: inside ? [0.42, 0.47, 0.58] : [0.105, 0.125, 0.195],
      ambBot: inside ? [0.165, 0.185, 0.245] : [0.042, 0.046, 0.082],
      rimColor: inside ? [0.26, 0.40, 0.56] : [0.24, 0.32, 0.50],
      fogColor: inside ? [0.03, 0.035, 0.055] : [0.05, 0.06, 0.11],
      fogDensity: inside ? 0.0 : 0.000075,
      emissiveBoost: 1.0,
      gridFade: 1.0,
      time: t,
      nebula: inside ? 0.0 : 1.0,
      bloom: inside ? 0.9 : 1.15,
      bloomThreshold: 0.78,
      exposure: 1.12,
    };

    /* effects */
    r.sprites.length = 0; r.beams.length = 0; r.shields.length = 0;
    FX.evaluate({ t: Core.wrap(t, ROUND), world: world, sprites: r.sprites, beams: r.beams, shields: r.shields });

    r.renderFrame(scene);
  }

  function invert(o, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return M4.identity(o);
    det = 1.0 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }

  /* ---------------- loop ---------------- */
  let paused = false;
  function loop(now) {
    if (!started) return;
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0.016;
    lastNow = now;
    if (!exportMode) {
      if (!paused) liveTime += dt;
      renderAt(liveTime);
    }
    requestAnimationFrame(loop);
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.floor(window.innerWidth * dpr);
    let h = Math.floor(window.innerHeight * dpr);
    const maxW = 3840, maxH = 2160;
    if (w > maxW) { h = Math.floor(h * maxW / w); w = maxW; }
    if (h > maxH) { w = Math.floor(w * maxH / h); h = maxH; }
    renderer.resize(w, h);
  }

  /* ---------------- export API ---------------- */
  const RUNS = ['tour'];
  function runStart(id) {
    if (id === 'tour') return 0;
    return 0;
  }
  window.videoExport = {
    runs: RUNS,
    async begin(runId, opts) {
      const fps = (opts && opts.fps) || 60;
      const start = runStart(runId);
      exportMode = { runId: runId, fps: fps, start: start };
      liveTime = start;
      // rebuild the global starting state of the chunk
      world._debrisSpawned = false;
      world.debris.forEach(d => { d.active = false; d.renderable.visible = false; });
      for (const mi of world.missiles) { mi.alive = false; mi.renderable.visible = false; }
      renderAt(start);
      const dur = ROUND;
      const frames = Math.max(1, Math.round(dur * fps));
      exportMode.frames = frames;
      return { frames: frames };
    },
    async frame(i) {
      if (!exportMode) return;
      const t = exportMode.start + i / exportMode.fps;
      renderAt(t);
      await new Promise(res => requestAnimationFrame(() => res()));
    },
    end() {
      if (!exportMode) return;
      const t = exportMode.start + (exportMode.frames - 1) / exportMode.fps;
      exportMode = null;
      liveTime = t;
      lastNow = 0;
      renderAt(liveTime);
    }
  };

  /* ---------------- boot ---------------- */
  function boot() {
    canvas = document.getElementById('gl');
    renderer = new F.Renderer(canvas);
    buildWorld(renderer);
    resize();
    window.addEventListener('resize', resize);
    started = true;
    requestAnimationFrame(loop);
    document.getElementById('boot').style.display = 'none';
    // QA hooks: ?t=12.5 freezes the round clock on a given moment
    const q = new URLSearchParams(location.search);
    if (q.has('t')) {
      const tv = parseFloat(q.get('t'));
      if (!isNaN(tv)) { liveTime = tv; paused = true; }
    }
    if (q.get('paused') === '1') paused = true;
    window.__fleet = {
      setTime: (v) => { liveTime = v; paused = true; renderAt(liveTime); },
      play: () => { paused = false; },
      pause: () => { paused = true; },
      state: () => ({ t: liveTime, paused: paused, draws: renderer.drawCalls, tris: renderer.tris }),
      world: world,
      audit: auditCamera,
    };
  }

  /* QA: walk the camera program and report any collision with a hull */
  function auditCamera() {
    const hits = [];
    const bands = world.flagship.meta.bands;
    const hg = world.flagship.meta.hangar || {};
    /* the port hangar mouth is a real opening in the skin: the camera is
       allowed to pass through it and the bay behind it is open as well */
    const inMouth = (p) => hg.z0 !== undefined &&
      p[2] > hg.z0 - 8 && p[2] < hg.z1 + 8 &&
      p[1] > hg.y0 - 12 && p[1] < hg.y1 + 12 &&
      p[0] < hg.x + 6 && p[0] > hg.x - 22;
    for (let t = 0; t < ROUND; t += 0.08) {
      const cam = Dir.evaluate(t, world);
      const shot = cam.shot;
      if (shot.space === 'exterior') {
        if (cam.pos[2] > -600 && cam.pos[2] < 545 && !inMouth(cam.pos)) {
          let b = bands[0];
          for (const bb of bands) if (cam.pos[2] >= bb.z0 && cam.pos[2] < bb.z1) { b = bb; break; }
          const hw = b.hw + 10;
          if (Math.abs(cam.pos[0]) < hw && cam.pos[1] > b.yBot - 10 && cam.pos[1] < b.yTop + 10) {
            hits.push({ t: +t.toFixed(2), what: 'flagship', pos: cam.pos.map(v => +v.toFixed(0)) });
          }
        }
      }
      for (const sh of world.shipList) {
        if (sh.kind === 'flagship') continue;
        const hx = sh.hull[0] + 8, hy = sh.hull[1] + 8, hz = sh.hull[2] + 8;
        if (Math.abs(cam.pos[0] - sh.pos[0]) < hx &&
          Math.abs(cam.pos[1] - sh.pos[1]) < hy &&
          Math.abs(cam.pos[2] - sh.pos[2]) < hz) {
          hits.push({ t: +t.toFixed(2), what: sh.kind + '#' + sh.idx, pos: cam.pos.map(v => +v.toFixed(0)) });
        }
      }
    }
    return hits;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
