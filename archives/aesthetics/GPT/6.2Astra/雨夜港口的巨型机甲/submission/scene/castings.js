"use strict";
// Transverse press sections leave the inboard shoulder socket and the arm free.
const shoulderSections = [
  [8.55, 64.32, 63.71, 2.7, -2.88],
  [9.26, 65.66, 62.91, 3.62, -3.71],
  [10.39, 66.02, 62.39, 4.22, -4.16],
  [11.65, 66.1, 61.88, 4.62, -4.36],
  [12.65, 66.02, 61.15, 4.78, -4.41],
  [13.43, 65.94, 59.63, 4.84, -4.48],
  [14.43, 65.69, 58.53, 4.77, -4.4],
  [15.45, 65.3, 57.96, 4.59, -4.21],
  [16.33, 64.39, 57.91, 4.08, -3.78],
  [16.65, 63.16, 58.05, 3.59, -3.26],
];
function shoulderDie(s) {
  return (x, t) => {
    const [top, lo, front, back] = sectionValues(shoulderSections, x),
      a = t * 1.48,
      c = Math.cos(a);
    return V(
      s * (x + 0.31 * t * t),
      lo + ((top - lo) * (c - 0.09067)) / 0.90933 + 0.21 * Math.max(0, -t),
      t >= 0 ? front * Math.sin(a) : -back * Math.sin(a)
    );
  };
}
const bodyProjectors = [];
function buildShoulder(s) {
  const die = shoulderDie(s),
    sign = -s;
  axle(thorax, 12.05 * s, 61.14, -0.02, 2.81, 5.55, "x", M.iron);
  const socket = group(thorax, s * 11.71, 61.37, -0.02);
  socket.rotation.y = -s * 0.24;
  cyl(socket, 0, 0, 0.3, 2.23, 2.41, 3.64, M.dark, "z", 48);
  cyl(socket, 0, 0, 2.2, 1.91, 2.02, 0.34, armourPaint.navy, "z", 48);
  ring(socket, 0, 0, 2.4, 1.51, 0.19, M.iron, "z", 48);
  ring(socket, 0, 0, 2.47, 0.97, 0.09, M.edge, "z", 40);
  cyl(socket, 0, 0, 2.44, 0.78, 0.87, 0.24, M.dark, "z", 32);
  const armLip = [
    [12.44, 60.1],
    [14.18, 60.89],
    [16.0, 60.19],
    [16.3, 57.48],
    [15.81, 56.89],
    [14.22, 57.13],
    [12.92, 58.43],
  ];
  sidePlate(thorax, s, armLip, 3.41, 4.98, armourPaint.mid, 0.127, (x, y) => -0.22 * (x - 14.22) ** 2, 4);
  shellPanel(thorax, die, [8.55, 16.64], [-1, 1], M.dark, {
    sign,
    nu: 38,
    nv: 40,
    thick: 0.42,
    bevel: 0.08,
    lift: -0.145,
  });
  const cuts = [8.55, 9.55, 11.73, 13.78, 15.53, 16.64];
  for (let i = 1; i < cuts.length; i++)
    for (const v of [
      [-0.998, -0.44],
      [-0.434, 0.48],
      [0.486, 0.996],
    ]) {
      const u = [cuts[i - 1] + 0.022, cuts[i] - 0.022];
      shellPanel(thorax, die, u, v, i === 4 && v[0] > 0.4 ? armourPaint.mid : armourPaint.blue, {
        sign,
        nu: 10,
        nv: 12,
        thick: 0.34,
        bevel: 0.062,
      });
      for (const x of [u[0] + 0.14, u[1] - 0.14])
        bolt(surfaceSeat(thorax, die, x, v[1] - 0.044, sign, 0.018), 0, 0, 0, 0.057);
    }
  for (const v of [
    [-0.992, -0.447],
    [-0.428, 0.478],
    [0.488, 0.986],
  ]) {
    shellPanel(thorax, die, [10.09, 10.69], v, armourPaint.ivory, {
      sign,
      nu: 3,
      nv: 16,
      lift: 0.016,
      thick: 0.045,
      bevel: 0.009,
    });
    shellPanel(thorax, die, [10.814, 10.9], v, armourPaint.ivory, {
      sign,
      nu: 2,
      nv: 16,
      lift: 0.018,
      thick: 0.04,
      bevel: 0.008,
    });
  }
  shellPanel(thorax, die, [8.63, 16.58], [0.958, 1.004], armourPaint.mid, {
    sign,
    nu: 39,
    nv: 3,
    lift: 0.062,
    thick: 0.31,
    bevel: 0.034,
  });
  surfacePrint(
    thorax,
    die,
    [12.31, 16.11],
    [0.583, 0.933],
    s > 0 ? anchorPrint : writing(["07", "PACIFIC   //   DELTA"]),
    { lift: 0.041, sign, mirror: s < 0, flipY: true }
  );
  // Duplex horizontal boss on the outboard edge.
  const hub = group(thorax, s * 15.72, 62.82, -0.22);
  hub.rotation.y = (s * Math.PI) / 2;
  for (const [z, r, len, m] of [
    [0.12, 1.63, 1.39, M.dark],
    [0.81, 1.48, 0.36, M.iron],
    [1.03, 1.28, 0.31, M.edge],
    [1.25, 1.17, 0.21, M.iron],
  ]) {
    cyl(hub, 0, 0, z, r, r * 0.99, len, m, "z", 48);
  }
  ell(hub, 0, 0, 1.38, 1.08, 1.08, 0.38, M.pale, 36);
  ring(hub, 0, 0, 1.37, 1.105, 0.076, M.iron, "z", 48);
  const p = die(12.51, 0.325),
    lampSeat = group(thorax, p.x, p.y + 0.11, p.z);
  const up = V(s * 0.16, 0.803, 0.575).normalize();
  lampSeat.quaternion.setFromUnitVectors(V(0, 0, 1), up);
  cyl(lampSeat, 0, 0, -0.1, 0.42, 0.51, 0.37, armourPaint.navy, "z", 32);
  lamp(lampSeat, 0, 0, 0, 0.243);
  halo(lampSeat, 0, 0, 0.22, 2.22, 0xddeefe, 0.356);
  lampSeat.updateWorldMatrix(true, false);
  bodyProjectors.push([lampSeat.localToWorld(V(0, 0, 0.22)), lampSeat.localToWorld(V(0, 0, 24.5))]);
  dripPoint(thorax, ...die(15.88, 0.999).toArray(), 4);
  splashAt(thorax, s * 12.4, 66.09, 0, 3.31, 3.49);
}
for (const s of [-1, 1]) buildShoulder(s);

const rearShell = group(thorax);
rearShell.rotation.y = Math.PI;
function napeFront(u, v) {
  const x = u * (2.23 + 1.92 * v);
  return V(
    x,
    62.65 + 8.51 * v - 0.79 * u * u * v,
    -3.38 - 1.13 * v + 0.083 * x * x - 0.16 * Math.sin(Math.PI * v)
  );
}
function buildNape() {
  const p = thorax;
  shellPanel(p, napeFront, [-1, 1], [0, 1], M.iron, {
    nu: 34,
    nv: 22,
    thick: 0.54,
    bevel: 0.1,
    lift: -0.035,
  });
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++) {
      const lo = -1 + i * 0.4 + 0.004,
        hi = lo + 0.392,
        bot = [0.012, 0.457, 0.774][j],
        top = [0.451, 0.769, 0.976][j];
      shellPanel(p, napeFront, [lo, hi], [bot, top], (i + j) % 4 ? armourPaint.mid : armourPaint.navy, {
        nu: 7,
        nv: 5,
        lift: 0.025,
        thick: 0.14,
        bevel: 0.032,
      });
      if (j)
        for (const u of [lo + 0.049, hi - 0.049])
          bolt(surfaceSeat(p, napeFront, u, bot + 0.022, 1, 0.036), 0, 0, 0, 0.066);
    }
  shellPanel(p, napeFront, [-1.003, 1.003], [0.976, 1.012], armourPaint.light, {
    nu: 36,
    nv: 3,
    lift: 0.087,
    thick: 0.69,
    bevel: 0.061,
  });
  const aft = (u, v) => {
    const q = napeFront(u, v);
    q.z -= 0.58 + 0.3 * (1 - u * u);
    return q;
  };
  for (const u of [
    [-0.986, -0.349],
    [-0.343, 0.343],
    [0.349, 0.986],
  ])
    for (const v of [
      [0.045, 0.537],
      [0.543, 0.982],
    ])
      shellPanel(p, aft, u, v, armourPaint.blue, { sign: -1, thick: 0.16, bevel: 0.052 });
  const rib = (u, v) => {
    const top = 0.84 - 0.15 * u * u,
      q = aft(u * (0.38 - 0.08 * v), v * top);
    q.z -= 0.12 + 0.54 * (1 - u * u);
    return q;
  };
  shellPanel(p, rib, [-1, 1], [0.012, 1], armourPaint.mid, {
    sign: -1,
    nu: 17,
    nv: 16,
    thick: 0.55,
    bevel: 0.09,
  });
  for (const [a, b, mat] of [
    [-0.25, -0.103, armourPaint.ivory],
    [-0.09, 0.155, armourPaint.red],
    [0.167, 0.246, armourPaint.ivory],
  ])
    shellPanel(p, rib, [a, b], [0.06, 0.997], mat, {
      sign: -1,
      nu: 3,
      nv: 14,
      lift: 0.025,
      thick: 0.075,
      bevel: 0.014,
    });
  for (const s of [-1, 1]) {
    const seat = surfaceSeat(p, napeFront, s * 0.923, 0.929, 1, 0.042);
    lamp(seat, 0, 0, 0, 0.117, s < 0 ? armourPaint.green : M.pilot);
    halo(seat, 0, 0, 0.18, 1.02, s < 0 ? 0x61ff97 : 0xff5141, 0.44);
  }
}
buildNape();
const wingStations = [
  [1.61, 60.37, -3.09, -5.33],
  [2.93, 61.8, -2.95, -6.05],
  [4.26, 64.52, -2.83, -6.66],
  [5.58, 67.14, -2.37, -7.05],
  [6.84, 68.69, -1.81, -7.28],
  [7.82, 69.13, -1.52, -7.17],
  [9.32, 69.01, -1.55, -6.9],
  [11.5, 68.57, -1.78, -6.37],
  [13.41, 67.98, -2.04, -5.82],
  [14.32, 67.61, -2.31, -5.55],
];
function wingDie(s) {
  return (x, t) => {
    const [y, front, back] = sectionValues(wingStations, x);
    return V(
      s * (x - 0.2 * Math.sin(Math.PI * t) ** 2 * Math.max(0, x - 13.4)),
      y + 0.12 - (2.57 + 0.54 * Math.sin((Math.PI * (x - 1.61)) / 12.7)) * t + 0.2 * Math.sin(t * Math.PI),
      mix(front, back, t)
    );
  };
}
function buildWing(s) {
  const die = wingDie(s);
  shellPanel(thorax, die, [1.61, 14.32], [0, 1], M.iron, {
    sign: s,
    nu: 54,
    nv: 11,
    thick: 0.78,
    bevel: 0.085,
    lift: -0.035,
  });
  const xs = [1.67, 3.57, 5.33, 6.97, 8.98, 11.38, 13.21, 14.28];
  for (let i = 1; i < xs.length; i++)
    for (const v of [
      [0.013, 0.525],
      [0.536, 0.988],
    ]) {
      const u = [xs[i - 1] + 0.02, xs[i] - 0.02];
      shellPanel(thorax, die, u, v, i % 4 === 1 ? armourPaint.mid : armourPaint.blue, {
        sign: s,
        nu: 8,
        nv: 6,
        thick: 0.22,
        lift: 0.055,
        bevel: 0.048,
      });
      for (const x of [u[0] + 0.12, u[1] - 0.12])
        bolt(surfaceSeat(thorax, die, x, v[0] + 0.063, s, 0.063), 0, 0, 0, 0.06);
    }
  for (const v of [
    [-0.013, 0.092],
    [0.927, 1.013],
  ])
    shellPanel(thorax, die, [1.74, 14.31], v, armourPaint.mid, {
      sign: s,
      nu: 54,
      nv: 4,
      thick: 0.87,
      lift: 0.073,
      bevel: 0.073,
    });
  const belly = (x, t) => die(x, t).addScaledVector(surfaceNormal(die, x, t, s), -0.836);
  for (let j = 1; j < xs.length; j++)
    for (const v of [
      [0.095, 0.445],
      [0.456, 0.897],
    ]) {
      const u = [xs[j - 1] + 0.034, xs[j] - 0.034];
      shellPanel(thorax, belly, u, v, j % 3 === 1 ? armourPaint.navy : armourPaint.mid, {
        sign: -s,
        nu: 8,
        nv: 5,
        thick: 0.12,
        bevel: 0.036,
      });
      const socket = surfaceSeat(thorax, belly, u[1] - 0.1, v[1] - 0.045, -s, 0.013);
      bolt(socket, 0, 0, 0, 0.068);
    }
  for (const band of [
    [0.065, 0.112],
    [0.436, 0.47],
  ])
    shellPanel(thorax, belly, [3.74, 14.13], band, armourPaint.mid, {
      sign: -s,
      nu: 46,
      nv: 3,
      thick: 0.14,
      lift: 0.086,
      bevel: 0.039,
    });
  // A shear web under the rolled front spar is broad at mid-span and dies
  // into the thin tip. Its sloping after-wall closes the folded section.
  const web = (x, t) => {
    const p = belly(x, 0.055),
      k = T.MathUtils.smoothstep(x, 3.2, 6.6) * (1 - T.MathUtils.smoothstep(x, 12.75, 14.24));
    const d = (1 - t) * k;
    return V(p.x - s * 0.71 * d, p.y - (1.95 + 0.26 * Math.sin((x - 4) * 0.48)) * d, p.z - 1.04 * d);
  };
  const webCuts = [3.85, 5.63, 7.32, 9.39, 11.68, 13.08, 14.11];
  for (let j = 1; j < webCuts.length; j++) {
    const u = [webCuts[j - 1] + 0.014, webCuts[j] - 0.014];
    shellPanel(thorax, web, u, [0.014, 0.996], j % 3 ? armourPaint.navy : armourPaint.mid, {
      sign: s,
      nu: 9,
      nv: 6,
      thick: 0.17,
      bevel: 0.039,
    });
    for (const x of [u[0] + 0.13, u[1] - 0.126])
      bolt(surfaceSeat(thorax, web, x, 0.81, s, 0.011), 0, 0, 0, 0.058);
  }
  const gusset = (x, v) => web(x, 0.014).lerp(belly(x, 0.855), v);
  shellPanel(thorax, gusset, [3.89, 14.09], [0.004, 0.999], armourPaint.mid, {
    sign: -s,
    nu: 40,
    nv: 6,
    thick: 0.145,
    bevel: 0.041,
  });
  const tip = die(14.27, 0.33);
  const end = group(thorax, tip.x, tip.y - 0.29, tip.z);
  end.rotation.y = s * 1.35;
  lamp(end, 0, 0, 0, 0.094);
  halo(end, 0, 0, 0.18, 0.79, 0xd0edff, 0.23);
  // Flat cleats on the aft wing root reach inwards to the spinal yoke.
  for (let j = 0; j < 3; j++) {
    const x = 2.49 + j * 0.14,
      y = 60.19 + j * 0.66;
    cutbox(rearShell, s * x, y, 5.61 + j * 0.06, 2.32, 0.41, 0.48, M.iron, 0.09, 0.069);
    bolt(rearShell, s * (x + 0.72), y, 5.91 + j * 0.06, 0.094);
  }
}
for (const s of [-1, 1]) buildWing(s);

function buildScapula(s) {
  const cage = group(rearShell, s * 3.13, 55.84, 4.95);
  cage.rotation.z = -s * 0.149;
  cage.rotation.x = -0.062;
  plate(cage, capsuleOutline(2.33, 6.42), -0.18, 1.65, armourPaint.navy, 0.15);
  capsuleGrille(cage, 2.1, 6.04, 14);
  const shape = [
    [4.16, 62.86],
    [5.23, 64.03],
    [7.42, 63.69],
    [9.15, 62.3],
    [9.66, 60.65],
    [9.23, 57.69],
    [8.38, 55.13],
    [6.88, 53.41],
    [5.27, 53.13],
    [4.87, 53.82],
    [5.18, 55.46],
    [6.34, 57.2],
    [6.65, 59.11],
    [6.2, 60.17],
    [4.37, 60.69],
  ];
  const curve = (x, y) => -0.12 * (x - 6.55) ** 2 - 0.091 * (y - 58.78) ** 2;
  sidePlate(rearShell, s, shape, 5.7, 2.23, armourPaint.navy, 0.22, curve, 6);
  sidePlate(rearShell, s, shape, 5.82, 0.32, armourPaint.blue, 0.12, curve, 6);
  const cap = [
    [5.13, 62.89],
    [5.81, 63.46],
    [7.12, 63.21],
    [8.72, 62.1],
    [9.19, 61.09],
    [8.94, 59.07],
    [8.47, 58.87],
    [7.91, 60.13],
    [6.81, 61.06],
    [5.49, 61.51],
  ];
  sidePlate(rearShell, s, cap, 5.99, 0.29, armourPaint.mid, 0.091, curve, 6);
  const die = (x, y) => V(s * x, y, 5.94 + curve(x, y));
  for (const [x, y] of [
    [6.18, 62.96],
    [8.29, 61.65],
    [8.58, 58.35],
    [6.66, 54.67],
  ])
    bolt(surfaceSeat(rearShell, die, x, y, s, 0.008), 0, 0, 0, 0.084);
  for (const line of [
    [
      [5.11, 62.39],
      [6.54, 62.13],
      [7.94, 61.57],
      [9.1, 60.36],
    ],
    [
      [6.65, 57.34],
      [7.9, 57.2],
      [8.83, 57.07],
    ],
  ])
    hose(
      rearShell,
      line.map(([x, y]) => die(x, y)),
      0.021,
      M.iron
    );
  for (let i = 0; i < 3; i++)
    hose(
      rearShell,
      [
        [s * (4.94 + i * 0.35), 54.02, 3.55],
        [s * (5.18 + i * 0.31), 51.91, 3.26],
        [s * (4.57 + i * 0.32), 50.04, 2.82],
        [s * (3.34 + i * 0.24), 47.38, 2.68],
      ],
      0.146
    );
}
for (const s of [-1, 1]) buildScapula(s);
for (let j = 0; j < 9; j++) {
  const y = 47.27 + j * 1.49,
    w = 0.78 + j * 0.085,
    z = 3.45 + j * 0.186;
  loft(
    rearShell,
    [
      [y - 0.82, w * 0.53, 0.66, 0, z],
      [y - 0.52, w * 0.74, 0.88, 0, z],
      [y + 0.16, w, 0.87, 0, z - 0.062],
      [y + 0.72, w * 1.1, 0.66, 0, z - 0.24],
    ],
    M.iron
  );
  for (const s of [-1, 1])
    sidePlate(
      rearShell,
      s,
      [
        [0.1, y + 0.33],
        [w * 0.69, y + 0.81],
        [w * 1.17, y + 0.68],
        [w * 1.02, y - 0.07],
        [0.38, y - 0.64],
        [0.12, y - 0.54],
      ],
      z + 0.79,
      0.65,
      j % 2 ? M.dark : M.iron,
      0.086,
      (x, yy) => -0.19 * x * x + 0.085 * Math.sin((yy - y) * 2.8),
      4
    );
}
cutbox(rearShell, 0, 61.15, 4.94, 2.22, 3.32, 1.55, M.iron, 0.43, 0.17);
for (const s of [-1, 1]) {
  const lumbar = (a, t) =>
    V(
      s * (4.73 + 0.73 * t) * Math.sin(a),
      47.72 + 5.59 * t - 0.28 * Math.cos(a),
      (3.13 + 0.69 * t) * Math.cos(a) - 0.05
    );
  for (const [lo, hi] of [
    [0.006, 0.279],
    [0.3, 0.602],
    [0.622, 0.994],
  ]) {
    shellPanel(rearShell, lumbar, [0.321, 1.91], [lo, hi], lo < 0.01 ? armourPaint.blue : armourPaint.navy, {
      sign: s,
      nu: 24,
      nv: 7,
      thick: 0.42,
      bevel: 0.093,
    });
    shellPanel(rearShell, lumbar, [0.332, 1.89], [hi - 0.077, hi], armourPaint.mid, {
      sign: s,
      nu: 24,
      nv: 3,
      lift: 0.071,
      thick: 0.16,
      bevel: 0.033,
    });
  }
}

const sternum = group(delta);
sternum.rotation.y = Math.PI;
// The broad outboard housings and the central Y are separated by real openings.
loft(
  delta,
  [
    [40.18, 1.23, 2.18],
    [42.92, 2.08, 2.92],
    [45.15, 3.12, 2.98],
    [47.74, 4.49, 2.9],
  ],
  M.dark
);
plate(
  sternum,
  [
    [-6.17, 46.55],
    [-2.02, 46.85],
    [-1.47, 45.91],
    [1.47, 45.91],
    [2.02, 46.85],
    [6.17, 46.55],
    [5.38, 43.72],
    [3.07, 40.18],
    [-3.07, 40.18],
    [-5.38, 43.72],
  ],
  3.33,
  1.73,
  armourPaint.blue,
  0.18,
  (x, y) => -0.046 * x * x + 0.1 * (y - 43),
  5
);
for (const s of [-1, 1]) {
  const yoke = [
    [0.84, 46.84],
    [4.12, 49.29],
    [6.72, 49.8],
    [6.37, 48.09],
    [4.79, 47.46],
    [2.01, 44.87],
    [0.7, 45.23],
  ];
  sidePlate(
    delta,
    s,
    yoke,
    3.98,
    2.38,
    armourPaint.mid,
    0.149,
    (x, y) => -0.057 * x * x + 0.13 * (y - 46),
    6
  );
  const print = (x, y) => V(s * x, y, 4.1 - 0.057 * x * x + 0.13 * (y - 46));
  for (const [x, y] of [
    [1.84, 46.63],
    [4.66, 48.83],
    [6.11, 49.17],
  ])
    bolt(surfaceSeat(delta, print, x, y, s), 0, 0, 0, 0.07);
  cyl(delta, s * 5.38, 43.98, -0.28, 1.68, 1.68, 7.06, M.iron, "x", 48);
  for (let i = 0; i < 7; i++)
    cyl(delta, s * (3.14 + i * 0.71), 43.98, -0.28, 1.81, 1.81, 0.27, i % 3 === 0 ? M.edge : M.dark, "x", 40);
  for (const k of [0, 1]) {
    const x = 4.18 + k * 1.19;
    piston(delta, [s * (x - 0.36), 40.91, 0.88], [s * x, 45.77, 1.06], 0.34, M.iron);
    piston(delta, [s * (x - 0.45), 41.23, -1.43], [s * (x + 0.12), 45.6, -1.3], 0.263, M.bronze);
  }
  for (const z of [-0.94, 0.97]) {
    piston(delta, [s * 5.15, 43.82, z], [s * 5.82, 48.52, z - 0.22], 0.471, M.iron);
    cutbox(delta, s * 5.76, 48.18, z - 0.2, 1.15, 0.62, 0.89, M.dark, 0.16, 0.074);
  }
  cyl(delta, s * 5.73, 42.95, 1.43, 0.61, 0.66, 4.74, M.iron, "x", 32);
  for (let j = 0; j < 6; j++)
    cyl(delta, s * (3.84 + j * 0.72), 42.95, 1.43, 0.73, 0.73, 0.265, j % 3 === 1 ? M.edge : M.dark, "x", 32);
  const flank = [
    [7.14, 44.95],
    [8.32, 46.26],
    [8.2, 49.17],
    [8.61, 48.92],
    [9.33, 46.68],
    [9.85, 44.0],
    [10.01, 41.2],
    [9.63, 39.16],
    [8.57, 38.06],
    [7.69, 37.7],
    [7.18, 38.3],
    [7.73, 40.87],
  ];
  const camber = (x, y) =>
    -0.255 * (x - 8.26) ** 2 - 0.076 * Math.max(0, y - 44.2) ** 2 + 0.031 * Math.max(0, 43 - y);
  sidePlate(delta, s, flank, 3.86, 5.58, armourPaint.mid, 0.139, camber, 7);
  const strip = [
    [7.42, 38.39],
    [7.93, 38.63],
    [8.7, 39.3],
    [9.19, 40.45],
    [9.42, 42.44],
    [9.38, 43.62],
    [9.55, 43.04],
    [9.57, 41.03],
    [9.29, 39.63],
    [8.59, 38.51],
    [7.65, 37.97],
  ];
  sidePlate(delta, s, strip, 0.105, 0.12, armourPaint.red, 0.034, (x, y) => 3.86 + camber(x, y), 5);
  sidePlate(
    delta,
    s,
    [
      [7.42, 38.43],
      [8.1, 38.81],
      [8.81, 39.55],
      [9.09, 40.56],
      [9.34, 42.61],
      [9.37, 42.39],
      [9.22, 40.36],
      [8.91, 39.37],
      [8.1, 38.65],
      [7.48, 38.28],
    ],
    0.117,
    0.079,
    armourPaint.ivory,
    0.02,
    (x, y) => 3.86 + camber(x, y),
    5
  );
  const sideWall = group(delta, s * 9.48, 43.77, -0.33);
  sideWall.rotation.y = (s * Math.PI) / 2;
  const flankFace = (x, y) => 0.22 - 0.035 * x * x - 0.036 * y * y;
  plate(
    sideWall,
    [
      [-2.62, 1.71],
      [-2.26, 2.97],
      [-0.73, 3.66],
      [1.32, 2.85],
      [2.48, 1.27],
      [2.37, -1.4],
      [1.51, -3.54],
      [-0.25, -4.32],
      [-2.13, -2.8],
    ],
    0.03,
    0.77,
    armourPaint.blue,
    0.112,
    flankFace,
    5
  );
  for (const pts of [
    [
      [-2.16, 1.7],
      [-0.85, 1.48],
      [1.95, 0.89],
    ],
    [
      [-1.95, -1.53],
      [-0.62, -1.44],
      [1.62, -2.04],
    ],
  ])
    hose(
      sideWall,
      pts.map(([x, y]) => [x, y, flankFace(x, y) + 0.127]),
      0.022,
      M.dark
    );
  const hipCap = group(delta, s * 9.83, 43.93, -0.34);
  hipCap.rotation.y = (s * Math.PI) / 2;
  cyl(hipCap, 0, 0, 0, 1.21, 1.34, 0.59, M.iron, "z", 48);
  cyl(hipCap, 0, 0, 0.31, 1.01, 1.13, 0.14, armourPaint.brass, "z", 48);
  ring(hipCap, 0, 0, 0.39, 0.78, 0.065, M.iron, "z", 40);
  ring(hipCap, 0, 0, 0.39, 1.033, 0.051, M.edge, "z", 48);
}
const pubic = [
  [0, 47.04],
  [1.77, 46.44],
  [1.62, 44.97],
  [1.16, 40.28],
  [0.78, 39.98],
  [-0.78, 39.98],
  [-1.16, 40.28],
  [-1.62, 44.97],
  [-1.77, 46.44],
];
const pelvicDepth = (x, y) => 0.14 * (y - 43.9) - 0.22 * Math.abs(x);
plate(delta, pubic, 4.16, 1.94, armourPaint.navy, 0.16, pelvicDepth, 6);
for (const s of [-1, 1])
  sidePlate(
    delta,
    s,
    [
      [0.035, 46.86],
      [1.5, 46.28],
      [1.39, 44.83],
      [0.99, 40.58],
      [0.14, 40.36],
    ],
    4.34,
    0.36,
    armourPaint.blue,
    0.073,
    pelvicDepth,
    4
  );

// Overlay plates step down into the rear pelvic notch, clear of the external journals.
for (const s of [-1, 1]) {
  const aft = (x, y) => -0.046 * x * x + 0.1 * (y - 43);
  sidePlate(
    sternum,
    s,
    [
      [0.12, 45.76],
      [1.55, 45.71],
      [2.21, 46.42],
      [5.6, 46.21],
      [4.59, 43.54],
      [3.12, 41.09],
      [0.17, 40.9],
    ],
    3.49,
    0.52,
    armourPaint.mid,
    0.109,
    aft,
    5
  );
  sidePlate(
    sternum,
    s,
    [
      [3.49, 45.94],
      [5.92, 46.28],
      [5.48, 44.62],
      [4.57, 42.99],
      [3.87, 41.43],
      [3.22, 41.32],
      [3.53, 43.5],
    ],
    3.62,
    0.46,
    armourPaint.blue,
    0.088,
    aft,
    4
  );
  for (const [x, y] of [
    [0.36, 41.39],
    [2.1, 45.64],
    [4.56, 44.36],
  ])
    bolt(sternum, s * x, y, 3.68 + aft(x, y), 0.066);
  for (const [x, y] of [
    [1.32, 46.13],
    [0.91, 40.92],
    [0.3, 46.69],
  ])
    bolt(delta, s * x, y, 4.433 + pelvicDepth(x, y), 0.071);
}
