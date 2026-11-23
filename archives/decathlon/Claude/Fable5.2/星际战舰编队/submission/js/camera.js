// camera.js — the lens programme: one global timeline of shots (positions in fleet / flagship coordinates)
(function () {
  'use strict';
  const SF = window.SF, { v3, sstep, mix, pmod } = SF, T = SF.T, Track = SF.Track;
  const tr = keys => new Track(keys);
  const cyl = (deg, r, y) => [Math.cos(deg * Math.PI / 180) * r, y, Math.sin(deg * Math.PI / 180) * r];

  const hangarLights = []; for (let z = -310; z < 60; z += 60) hangarLights.push({ p: [-160, 16, z], r: 50, c: [1.5, 1.3, 1.0] });
  const bridgeLights = [{ p: [0, 112, 10], r: 42, c: [0.85, 0.85, 0.9] }, { p: [0, 98, 64], r: 38, c: [0.55, 0.72, 1.0] }, { p: [-45, 100, 20], r: 30, c: [1.0, 0.9, 0.75] }, { p: [45, 100, 20], r: 30, c: [1.0, 0.9, 0.75] }, { p: [0, 104, -36], r: 30, c: [0.8, 0.8, 0.8] }];
  const corridorLights = [{ p: [0, 62, 50], r: 44, c: [1.1, 1.0, 0.86] }, { p: [0, 62, 130], r: 44, c: [1.1, 1.0, 0.86] }, { p: [0, 62, 210], r: 44, c: [1.1, 1.0, 0.86] }, { p: [0, 62, 290], r: 44, c: [1.1, 1.0, 0.86] }];

  const SH = SF.shots = [];
  // ---- S1: long take — escort fly-by, down the fork bow, flank, belly, stern, then behind a shuttle into the hangar
  SH.push({
    name: 'reveal', t0: 7.0, t1: 31.0, set: 'ext', near: 1.2, lights: hangarLights,
    pos: tr([[7.0, [-470, 170, 40]], [8.6, [-404, 132, 330]], [10.2, [-256, 92, 612]], [11.6, [-112, 57, 604]], [12.8, [-118, 52, 420]], [14.2, [-186, 40, 214]], [15.8, [-288, 6, 92]], [17.8, [-300, -50, -170]], [19.6, [-292, -40, -470]], [21.2, [-214, -12, -716]],
      [22.6, [-180, 2, -606]], [24.2, [-162, -2, -446]], [25.6, [-160, -5, -356]], [27.5, [-162, -8, -262]], [29.3, [-158, -7, -180]], [30.4, [-155, -6, -136]], [31.0, [-150.5, -6, -117.5]]]),
    tgt: tr([[7.0, [-300, 80, 420]], [8.6, [-150, 40, 560]], [10.2, [0, 0, 520]], [11.6, [-30, 6, 380]], [12.8, [-60, 10, 150]], [14.2, [-112, -4, -150]], [15.8, [-176, -10, -190]], [17.8, [-130, -30, -520]], [19.6, [-46, -8, -560]], [21.2, [-40, 0, -545]],
      [22.6, [-158, -5, -390]], [24.2, [-160, -7, -300]], [25.6, [-160, -10, -200]], [27.5, [-159, -11, -120]], [29.3, [-168, -10, -40]], [30.4, [-176, -8, 0]], [31.0, [-178, -8, 10]]]),
    fov: tr([[7, 46], [11.6, 52], [15.8, 52], [19.6, 50], [22.6, 46], [25.6, 58], [31, 60]]),
    exposure: tr([[7, 1.0], [24.6, 1.0], [26.6, 1.3], [31, 1.3]]),
  });
  // ---- S3: power-core atrium — rise along the core past platform edges, rings and supports
  SH.push({
    name: 'atrium', t0: 31.0, t1: 38.4, set: 'atrium', near: 0.5, far: 3000, env: 'int',
    pos: tr([[31.0, cyl(236, 84, -70)], [33.0, cyl(244, 83, -40)], [35.0, cyl(252, 81, -3)], [36.8, cyl(268, 80, 30)], [38.4, cyl(286, 84, 56)]]),
    tgt: tr([[31.0, [0, -42, 0]], [33.0, [0, -20, 0]], [35.0, [0, 0, 0]], [36.8, [0, 22, 0]], [38.4, [0, 40, 0]]]),
    fov: tr([[31, 66], [35, 60], [38.4, 64]]), exposure: tr([[31, 1.1], [38.4, 1.1]]),
  });
  // ---- S4: bridge — from behind the rear consoles, over the rail, past the hub and displays to the hologram and window
  SH.push({
    name: 'bridge', t0: 38.4, t1: 45.0, set: 'ext', near: 0.5, lights: bridgeLights, holo: true,
    pos: tr([[38.4, [-35, 87.4, -41.5]], [40.2, [-30, 92.5, -22]], [42.0, [-27, 85, 2]], [43.6, [-21, 80.5, 25]], [45.0, [-16, 79.5, 40]]]),
    tgt: tr([[38.4, [-4, 80, 40]], [40.2, [0, 78, 32]], [42.0, [4, 79, 54]], [43.6, [7, 81, 72]], [45.0, [10, 84, 94]]]),
    fov: tr([[38.4, 64], [42, 60], [45, 56]]), exposure: tr([[38.4, 1.15], [45, 1.15]]),
  });
  // ---- S5: energy loading gallery — weave between devices and through the suspended fork guides toward the breech
  SH.push({
    name: 'corridor', t0: 45.0, t1: 51.4, set: 'corridor', near: 0.5, far: 3000, env: 'int', lights: corridorLights,
    pos: tr([[45.0, [-21, 30, 12]], [46.0, [-19.5, 29, 54]], [47.2, [-5.5, 26.5, 108]], [48.4, [3.5, 30, 163]], [49.5, [6, 34, 218]], [50.6, [3.5, 37, 273]], [51.4, [3, 37.5, 316]]]),
    tgt: tr([[45.0, [-6, 38, 120]], [46.0, [-4, 38, 170]], [47.2, [2, 40, 230]], [48.4, [2, 40, 300]], [49.5, [0, 40, 360]], [50.6, [0, 40, 392]], [51.4, [0, 40, 392]]]),
    fov: tr([[45, 64], [49, 60], [51.4, 54]]), exposure: tr([[45, 1.05], [51.4, 1.05]]),
  });
  // ---- S6a: cannon charge along the barrel, the beam, and the run down the beam to the splitting rock
  SH.push({
    name: 'fire', t0: 51.4, t1: 59.3, set: 'ext', near: 1.5,
    pos: tr([[51.4, [-13, 31, 306]], [52.6, [-36, 41, 424]], [53.6, [-86, 52, 566]], [54.4, [-112, 56, 612]], [55.5, [-122, 54, 770]], [57.5, [-172, 72, 1150]], [59.3, [-246, 112, 1436]]]),
    tgt: tr([[51.4, [0, 3, 500]], [52.6, [0, 0, 540]], [53.6, [0, 0, 532]], [54.4, [0, 0, 590]], [55.5, [20, -4, 1500]], [57.5, [44, -22, 1640]], [59.3, [30, -20, 1600]]]),
    fov: tr([[51.4, 56], [53.6, 52], [55.5, 48], [57.5, 44], [59.3, 46]]), exposure: tr([[51.4, 1.0], [59.3, 1.0]]),
  });
  // ---- S6b: beside a guard — close-in guns in the foreground, missiles converging on the upper rock
  SH.push({
    name: 'guard', t0: 59.3, t1: 64.3, set: 'ext', near: 1.0, attach: 2,
    pos: tr([[59.3, [42, 58, -112]], [61.4, [30, 60, -92]], [64.3, [0, 66, -76]]]),
    tgt: tr([[59.3, [-130, 6, 290]], [60.7, [-120, 20, 300]], [62.3, [90, 190, 600]], [64.3, [120, 210, 640]]]),
    fov: tr([[59.3, 56], [64.3, 50]]), exposure: tr([[59.3, 1.0], [64.3, 1.0]]),
  });
  // ---- S7/S0 (wraps the loop): between the split halves looking back, shields cascade, the fleet surges past, pull out wide
  SH.push({
    name: 'surge', t0: 64.3, t1: 85.0, wrap: true, set: 'ext', near: 2,
    pos: tr([[64.3, [26, 14, 1690]], [67.5, [60, 50, 1590]], [70.5, [150, 110, 1380]], [73.0, [-180, 190, 980]], [75.5, [-560, 260, 620]], [77.0, [-650, 285, 110]], [78.5, [-730, 320, -520]], [81.0, [-830, 365, -1120]], [85.0, [-900, 400, -1500]]]),
    tgt: tr([[64.3, [0, 0, 600]], [67.5, [0, 10, 400]], [70.5, [0, 0, 300]], [73.0, [40, 0, 200]], [75.5, [0, 0, 60]], [77.0, [0, 0, 80]], [78.5, [0, 0, 220]], [81.0, [0, 0, 440]], [85.0, [0, 10, 700]]]),
    fov: tr([[64.3, 42], [70.5, 46], [75.5, 48], [78.5, 50], [85, 44]]), exposure: tr([[64.3, 1.0], [85, 1.0]]),
  });

  SF.cameraAt = function (t) {
    t = pmod(t, T);
    let sh = null, u = t;
    for (const s of SH) { if (s.wrap) { if (t >= s.t0) { sh = s; u = t; break; } if (t + T < s.t1) { sh = s; u = t + T; break; } } else if (t >= s.t0 && t < s.t1) { sh = s; break; } }
    if (!sh) sh = SH[0];
    let pos = sh.pos.at(u), tgt = sh.tgt.at(u);
    if (sh.attach !== undefined) { const sp = SF.shipState(SF.W.ships[sh.attach], t).pos; pos = v3.add(pos, sp); tgt = v3.add(tgt, sp); }
    return { shot: sh, u, cam: { pos, tgt, up: [0, 1, 0], fov: sh.fov.at(u), near: sh.near || 2, far: sh.far || 30000 }, exposure: sh.exposure ? sh.exposure.at(u) : 1 };
  };
})();
