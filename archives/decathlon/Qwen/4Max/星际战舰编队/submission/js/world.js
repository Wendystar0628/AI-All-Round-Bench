/* 陨石群（体素 + 预置裂面碎块）与近景漂浮岩。碎裂是时间 t 的确定函数。 */
'use strict';

SF.world = { rocks: [], minis: [], clusterZ: 3720 };

SF.makeRock = function (seed, r, nPlanes) {
  const rng = SF.mulberry32(seed), P = SF.PAL;
  const b = new SF.VoxelBuilder(seed);
  const h = [];
  for (let i = 0; i < 5; i++) h.push({ f: 1 + rng() * 3, p: rng() * SF.TAU, a: 0.10 + rng() * 0.16 });
  // 裂面（先于填充生成，裂面附近的体素保留以形成实体断面）
  const planes = [];
  for (let i = 0; i < nPlanes; i++) {
    const n = SF.norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]);
    planes.push({ n, d: (rng() - 0.5) * r * 0.7 });
  }
  const thick = r < 12 ? r : Math.max(3, Math.min(4.5, r * 0.09));
  const R = Math.ceil(r * 1.2);
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) {
    const d = Math.hypot(x, y, z);
    if (d > r * 1.15 || d < 0.5) continue;
    const nx = x / d, ny = y / d, nz = z / d;
    let rad = r * 0.82;
    for (const q of h) rad += r * q.a * Math.sin(nx * q.f + ny * q.f * 1.7 + q.p) * Math.cos(nz * q.f * 1.3 + q.p);
    if (d > rad) continue;
    let nearPlane = false;
    for (const p of planes) if (Math.abs(x * p.n[0] + y * p.n[1] + z * p.n[2] - p.d) < 2.6) nearPlane = true;
    if (d < rad - thick && !nearPlane) continue; // 外壳 + 断面
    const k = SF.hash1(x * 3.1 + y * 7.7 + z * 13.3 + seed);
    let c = k < 0.3 ? P.rockDark : (k > 0.82 ? P.rockLite : P.rock);
    if (ny > 0.55) c = SF.mixc(c, P.rockLite, 0.35);
    b.set(x, y, z, c);
  }
  // 裂隙与贯通空隙（只遍历已有体素）
  const toDel = [];
  for (let i = 0; i < 2; i++) {
    const ax = rng() - 0.5, ay = rng() - 0.5, az = rng() - 0.5;
    const off = (rng() - 0.5) * r * 0.8;
    for (let j = 0; j < b.px.length; j++) {
      const x = b.px[j], y = b.py[j], z = b.pz[j];
      if (Math.abs(x * ax + y * ay + z * az - off) < 1.1 && Math.hypot(x, y, z) < r * 0.9) toDel.push([x, y, z]);
    }
  }
  const tun = rng();
  const cy = r * 0.3 * Math.sin(tun * 9), cz = r * 0.25 * Math.cos(tun * 7);
  for (let j = 0; j < b.px.length; j++) {
    if (Math.hypot(b.py[j] - cy, b.pz[j] - cz) < r * 0.22) toDel.push([b.px[j], b.py[j], b.pz[j]]);
  }
  for (const [x, y, z] of toDel) b.del(x, y, z);

  // 裂面分块
  const groups = new Map();
  for (let i = 0; i < b.px.length; i++) {
    const x = b.px[i], y = b.py[i], z = b.pz[i];
    let id = 0;
    for (let p = 0; p < planes.length; p++) {
      if (x * planes[p].n[0] + y * planes[p].n[1] + z * planes[p].n[2] > planes[p].d) id |= (1 << p);
    }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(i);
  }
  const chunks = [];
  for (const [, idxs] of groups) {
    if (idxs.length < 6) continue;
    let cx = 0, cy = 0, cz = 0;
    for (const i of idxs) { cx += b.px[i]; cy += b.py[i]; cz += b.pz[i]; }
    cx /= idxs.length; cy /= idxs.length; cz /= idxs.length;
    const cb = new SF.VoxelBuilder(seed + chunks.length + 7);
    for (const i of idxs) {
      const x = b.px[i], y = b.py[i], z = b.pz[i];
      let nearPlane = 0;
      for (const p of planes) {
        if (Math.abs(x * p.n[0] + y * p.n[1] + z * p.n[2] - p.d) < 2.4) nearPlane = 1;
      }
      cb.set(x - Math.round(cx), y - Math.round(cy), z - Math.round(cz),
        [b.cr[i], b.cg[i], b.cb[i]], b.em[i], nearPlane);
    }
    const dir = SF.norm([cx + (rng() - 0.5) * r * 0.5, cy + (rng() - 0.5) * r * 0.5, cz + (rng() - 0.5) * r * 0.5]);
    chunks.push({
      built: cb.build(),
      rest: [Math.round(cx), Math.round(cy), Math.round(cz)],
      vel: SF.add(SF.scale(dir, 7 + rng() * 22), [(rng() - 0.5) * 6, (rng() - 0.5) * 6, (rng() - 0.5) * 6]),
      axis: SF.norm([rng() - 0.5, rng() - 0.5, rng() - 0.5]),
      spin: (rng() - 0.5) * 0.9,
      frac: Infinity, delay: rng() * 1.3
    });
  }
  return { chunks, r };
};

SF.initWorld = function () {
  const W = SF.world;
  const defs = [
    // [x, y, z偏移, 半径, 裂面数, 角色]
    [0, 12, 0, 54, 4, 'beam'],
    [300, 45, 260, 46, 4, 'missile'],
    [-340, -25, 180, 40, 4, 'missile'],
    [150, -60, -230, 27, 3, 'pulse'],
    [-190, 70, -170, 24, 3, 'pulse'],
    [430, -15, -90, 21, 3, 'pulse'],
    [-460, 35, -40, 19, 2, 'pulse'],
    [90, 105, 330, 17, 2, 'pulse'],
    [-120, -95, 380, 14, 2, 'ciws'],
    [230, 80, -330, 13, 2, 'ciws'],
    [-300, -70, -300, 12, 2, 'ciws'],
    [520, 60, 200, 14, 2, 'ciws'],
    [-540, -45, 260, 12, 2, 'ciws'],
    [60, -130, -120, 10, 1, 'ciws'],
    [-80, 140, 60, 9, 1, 'ciws'],
    [380, 120, 420, 9, 1, 'none'],
    [-420, 110, 440, 8, 1, 'none'],
    [180, -160, 160, 8, 1, 'none'],
    [-240, -150, -420, 7, 1, 'none'],
    [560, -90, -260, 7, 1, 'none'],
    [-580, 90, -380, 6, 1, 'none'],
    [30, 180, -200, 6, 1, 'none'],
    [-160, -190, 300, 6, 1, 'none'],
    [480, 160, 60, 5, 1, 'none']
  ];
  defs.forEach((d, i) => {
    const rock = SF.makeRock(500 + i * 17, d[3], d[4]);
    rock.off = [d[0], d[1], d[2]];
    rock.role = d[5];
    rock.idx = i;
    rock.hit = Infinity; rock.frac = Infinity; rock.heatT0 = Infinity;
    W.rocks.push(rock);
  });
  // 攻击时间表（世界时）
  const setHit = (idx, hit, frac, spread) => {
    const r = W.rocks[idx];
    r.hit = hit; r.frac = frac; r.heatT0 = hit;
    r.chunks.forEach(c => { c.frac = frac + c.delay * spread; });
  };
  setHit(0, 47.6, 50.9, 1.0);          // 光束主炮目标
  setHit(1, 55.0, 56.2, 1.0);          // 导弹目标 1
  setHit(2, 56.4, 57.5, 1.0);          // 导弹目标 2
  setHit(3, 49.6, 50.4, 0.7);
  setHit(4, 50.5, 51.2, 0.7);
  setHit(5, 51.6, 52.2, 0.6);
  setHit(6, 52.4, 53.0, 0.6);
  setHit(7, 53.2, 53.8, 0.6);
  // 近防炮剥落小块
  for (let i = 8; i <= 14; i++) {
    const r = W.rocks[i];
    r.hit = 50.4 + (i - 8) * 0.7; r.heatT0 = r.hit;
    r.frac = r.hit + 0.5;
    r.chunks.forEach((c, j) => { c.frac = j < 2 ? r.hit + 0.4 + j * 0.3 : Infinity; });
  }
  W.rocks.forEach(r => r.chunks.forEach(c => { if (c.frac === Infinity && r.frac !== Infinity && r.role !== 'ciws') c.frac = r.frac + c.delay; }));

  // 近景漂浮小岩（随航程环绕，速度参照）
  const rng = SF.mulberry32(777);
  for (let i = 0; i < 10; i++) {
    const rock = SF.makeRock(900 + i, 2.2 + rng() * 2.6, 0);
    W.minis.push({
      rock,
      x: (rng() - 0.5) * 700, y: (rng() - 0.5) * 360,
      z0: rng() * SF.travelTotal, spin: (rng() - 0.5) * 0.4
    });
  }
};

SF.rockWorldPos = function (r, t, nextLoop) {
  // 下一轮陨石群：t=78 时恰好回到 t=0 的位置（无缝循环）
  const trav = nextLoop ? SF.travel(t) - SF.travelTotal : SF.travel(t);
  const z = SF.world.clusterZ - trav;
  return [r.off[0], r.off[1] + 18, r.off[2] + z];
};

SF.rockHeat = function (r, t) {
  if (t < r.heatT0) return 0;
  const rise = SF.smooth(r.heatT0, r.heatT0 + 1.2, t);
  const fall = 1 - SF.smooth(r.frac + 2.5, r.frac + 9, t);
  return rise * Math.max(0.12, fall);
};