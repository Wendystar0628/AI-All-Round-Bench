const armStations = {},
  legStations = {};
function makeSword(arm, L) {
  let mount = group(arm, 0, -L, 2.58);
  cutbox(mount, 0, 4.63, 0, 3.58, 10.4, 1.43, M.navy, 0.67, 0.2);
  for (let s of [-1, 1]) {
    sidePlate(
      mount,
      s,
      [
        [0.42, 0.15],
        [1.41, -0.45],
        [1.97, 0.28],
        [1.97, 7.45],
        [1.43, 9.22],
        [0.72, 8.58],
      ],
      0.89,
      0.64,
      armourPaint.light,
      0.094
    );
    for (let j = 0; j < 4; j++) bolt(mount, s * 1.52, 1.16 + j * 1.72, 1.02, 0.112);
    rod(mount, [s * 1.79, 1.03, -0.87], [s * 1.78, 8.11, -0.87], 0.23, M.iron);
  }
  louvers(mount, 0, 5.45, 1.01, 1.15, 3.92, 7);
  decal(mount, 0, 2.06, 1.14, 1.43, 1.0, writing(["C–28", "CHAIN  /  DRIVE"]));
  cutbox(mount, 0, -0.36, 0.0, 4.01, 0.99, 1.4, M.dark, 0.2, 0.135);
  box(mount, 0, -0.86, 0.0, 3.48, 0.11, 0.68, M.black);
  let blade = group(mount, 0, -0.79, 0.13);
  const pitch = 1.16,
    count = 20;
  const spine = (t) =>
    V(
      1.32 * Math.sin(TAU * t) * Math.abs(Math.sin(Math.PI * t)) ** 0.48 - 0.2 * Math.sin(Math.PI * t),
      -28 * t,
      0.58 * Math.sin(1.6 * Math.PI * t)
    );
  const linkOutline = [
    [-0.64, 0.71],
    [-0.64, -0.06],
  ];
  for (let i = 1; i <= 18; i++) {
    const a = Math.PI + (Math.PI * i) / 18;
    linkOutline.push([0.64 * Math.cos(a), -0.06 + 0.64 * Math.sin(a)]);
  }
  linkOutline.push([0.64, 0.71], [0.416, 0.71], [0.416, -0.06]);
  for (let i = 1; i <= 18; i++) {
    const a = (-Math.PI * i) / 18;
    linkOutline.push([0.416 * Math.cos(a), -0.06 + 0.416 * Math.sin(a)]);
  }
  linkOutline.push([-0.416, 0.71]);
  const steel = coat(0x737778, 0.86, 0.302, 0.54),
    toothSteel = coat(0x999c99, 0.87, 0.302, 0.46);
  for (let j = 0; j < count; j++) {
    const d = (j + 0.32) * pitch,
      t = d / 28,
      link = group(blade);
    link.position.copy(spine(t));
    const tangent = spine(t + 0.001)
      .sub(spine(t - 0.001))
      .normalize();
    link.quaternion.setFromUnitVectors(V(0, -1, 0), tangent);
    link.rotateY(0.14 * Math.sin(t * TAU - 0.39));
    plate(link, linkOutline, 0.305, 0.69, steel, 0.047);
    cutbox(link, 0, 0.46, -0.08, 1.18, 0.37, 0.56, M.dark, 0.056, 0.043);
    cyl(link, 0, -0.048, 0.017, 0.393, 0.393, 0.64, armourPaint.brass, "z", 40);
    cyl(link, 0, -0.048, 0.341, 0.337, 0.354, 0.058, j % 5 === 1 ? M.edge : armourPaint.brass, "z", 32);
    for (const side of [-1, 1]) {
      const g = group(link, side * 1.115, 0.215, -0.034);
      g.rotation.y = side * 0.052;
      cutbox(g, 0, 0, 0, 1.06, 0.508, 0.67, toothSteel, 0.04, 0.049);
    }
  }
  const tip = group(blade);
  tip.position.copy(spine((count * pitch) / 28));
  const flank = [
    [0.68, 0.23],
    [1.46, 0.28],
    [1.58, -0.21],
    [1.55, -0.92],
    [1.4, -1.9],
    [1.15, -2.88],
    [0.77, -3.69],
    [0.36, -4.34],
    [0.038, -4.8],
  ];
  const point = [
    ...flank,
    ...flank
      .slice()
      .reverse()
      .map(([x, y]) => [-x, y]),
    [-0.58, 0.02],
    [-0.36, -0.2],
    [0, -0.314],
    [0.36, -0.2],
    [0.58, 0.02],
  ];
  plate(
    tip,
    point,
    0.15,
    0.37,
    steel,
    0.061,
    (x, y) => 0.129 * (1 - Math.min(1, Math.abs(x) / 1.58)) + 0.035 * y,
    6
  );
  for (const k of [-1, 1]) {
    const grind = flank.slice(1).map(([x, y]) => [x, y]);
    grind.push(
      ...flank
        .slice(1, -1)
        .reverse()
        .map(([x, y]) => [Math.max(0.023, x - 0.123), y - 0.035])
    );
    sidePlate(
      tip,
      k,
      grind,
      0.171,
      0.06,
      M.pale,
      0.018,
      (x, y) => 0.129 * (1 - Math.min(1, Math.abs(x) / 1.58)) + 0.035 * y,
      5
    );
  }
  runnel(
    tip,
    [
      [-0.51, -3.94, 0.139],
      [-0.26, -4.48, 0.129],
      [-0.034, -4.77, 0.125],
    ],
    0.015
  );
  dripPoint(tip, 0, -4.8, 0, 7);
}
function hand(p, s, open, L) {
  const hand = group(p, 0, -L - 0.28, 0.13);
  hand.rotation.x = open ? -0.15 : -0.095;
  hand.rotation.z = open ? s * 0.047 : 0;
  axle(hand, 0, 0.03, 0, 0.78, 3.45, "x", M.edge);
  loft(
    hand,
    [
      [-3.38, 1.77, 0.84],
      [-2.83, 2.09, 1.18],
      [-0.84, 1.95, 1.09],
      [-0.41, 1.44, 0.79],
    ],
    M.dark
  );
  plate(
    hand,
    [
      [-1.73, -0.56],
      [1.51, -0.49],
      [2.02, -1.33],
      [1.84, -2.75],
      [1.34, -3.05],
      [-1.68, -2.88],
      [-2.02, -2.11],
    ],
    1.14,
    0.68,
    armourPaint.blue,
    0.107
  );
  // The split palm pads follow the bases of the fingers, leaving each flexor joint free.
  for (let j = 0; j < 3; j++)
    plate(
      hand,
      [
        [-1.71, -0.69 - j * 0.67],
        [-1.13, -0.48 - j * 0.67],
        [1.54, -0.66 - j * 0.67],
        [1.71, -1.08 - j * 0.67],
        [1.16, -1.23 - j * 0.67],
        [-1.62, -1.18 - j * 0.67],
      ],
      1.27 + j * 0.035,
      0.22,
      j === 1 ? armourPaint.mid : armourPaint.blue,
      0.053,
      (x, y) => -0.042 * x * x,
      3
    );
  const palm = group(hand, 0, -1.88, -1.07);
  palm.rotation.y = Math.PI;
  plate(
    palm,
    [
      [-1.75, 0.67],
      [-1.39, 1.14],
      [1.29, 1.09],
      [1.87, 0.47],
      [1.76, -0.81],
      [0.98, -1.22],
      [-1.45, -1.1],
      [-1.83, -0.52],
    ],
    0.16,
    0.38,
    M.iron,
    0.105
  );
  const pad = [
    [0.22, 0.64],
    [1.09, 0.81],
    [1.59, 0.43],
    [1.52, -0.49],
    [1.11, -0.83],
    [0.39, -0.64],
  ];
  for (const side of [-1, 1]) {
    sidePlate(palm, side, pad, 0.31, 0.21, M.rubber, 0.073);
    for (let j = 0; j < 3; j++) {
      const tread = cutbox(
        palm,
        side * 0.94,
        0.33 - j * 0.32,
        0.405,
        0.81,
        0.073,
        0.11,
        M.dark,
        0.025,
        0.015
      );
      tread.rotation.z = side * 0.22;
    }
    bolt(palm, side * 1.52, 0.68, 0.248, 0.085);
    hose(
      hand,
      [
        [side * 1.28, -0.39, -0.65],
        [side * 1.57, -0.82, -0.95],
        [side * 1.75, -1.65, -1.01],
        [side * 1.58, -2.87, -0.71],
      ],
      0.085,
      M.rubber
    );
  }
  cyl(palm, 0, 0.22, 0.31, 0.27, 0.3, 0.081, M.bronze, "z", 20);
  cyl(palm, 0, 0.22, 0.373, 0.17, 0.17, 0.048, M.dark, "z", 6);
  for (let f = 0; f < 4; f++) {
    let x = (f - 1.5) * 1.01,
      fy = -3.03 + Math.abs(f - 1.5) * 0.08,
      len = 1.23 - Math.abs(f - 1) * 0.086;
    let g = group(hand, x, fy, 0);
    g.rotation.z = open ? (f - 1.5) * 0.116 : 0;
    g.rotation.x = open ? 0.055 + 0.045 * f : 0.73;
    for (let k = 0; k < 3; k++) {
      const ll = len * (1 - 0.085 * k);
      axle(g, 0, 0, 0, 0.374, 0.84, "x", M.edge);
      cutbox(g, 0, -ll * 0.49, 0.01, 0.77, ll * 0.9, 0.75, M.iron, 0.134, 0.068);
      cutbox(
        g,
        0,
        -ll * 0.48,
        0.423,
        0.82,
        ll * 0.75,
        0.37,
        k === 2 ? armourPaint.mid : armourPaint.blue,
        0.14,
        0.063
      );
      cutbox(g, 0, -ll * 0.5, -0.389, 0.6, ll * 0.61, 0.14, M.rubber, 0.094, 0.041);
      for (const y of [0.34, 0.57]) box(g, 0, -ll * y, -0.464, 0.44, 0.052, 0.046, M.iron);
      plate(
        g,
        [
          [-0.29, -ll * 0.15],
          [0.26, -ll * 0.12],
          [0.381, -ll * 0.37],
          [0.31, -ll * 0.77],
          [-0.26, -ll * 0.79],
          [-0.38, -ll * 0.46],
        ],
        0.628,
        0.101,
        k === 2 ? M.edge : armourPaint.mid,
        0.044,
        (x, y) => -0.19 * Math.abs(x),
        3
      );
      if (k === 0) {
        box(g, 0, -ll * 0.41, 0.658, 0.37, 0.054, 0.029, M.bone);
        bolt(g, 0.17, -ll * 0.61, 0.638, 0.033);
      }
      g = group(g, 0, -ll, 0);
      g.rotation.x = open ? 0.118 + 0.043 * f + 0.057 * k : 1.17 - k * 0.18;
    }
    dripPoint(g, 0, -0.085, 0, open ? 1.5 : 1);
  }
  let t = group(hand, -s * 1.74, -1.2, 0.05);
  t.rotation.z = -s * (open ? 1.03 : 0.49);
  t.rotation.x = open ? 0.31 : 1.0;
  for (let i = 0; i < 2; i++) {
    axle(t, 0, 0, 0, 0.441, 1.04);
    cutbox(t, 0, -0.63, 0.02, 0.99, 1.26, 0.9, M.iron, 0.21, 0.075);
    cutbox(t, 0, -0.59, 0.48, 0.93, 1.01, 0.26, armourPaint.blue, 0.185, 0.074);
    t = group(t, 0, -1.21, 0);
    t.rotation.z = s * 0.33;
    t.rotation.x = open ? 0.24 : 0.45;
  }
}
function buildArm(s) {
  const a = V(s * 12.46, 61.19, 0.02),
    b = V(s * (s === 1 ? 15.38 : 14.98), 49.04, -0.64),
    c = V(s * (s === 1 ? 20.24 : 16.64), s === 1 ? 38.38 : 37.38, s === 1 ? 1.53 : 1.71);
  const up = limb(thorax, a, b),
    low = limb(thorax, b, c),
    L = b.distanceTo(c);
  armStations[s] = { a, b, c };
  cyl(up, 0, -5.73, 0, 1.72, 1.51, 11.05, M.dark, "y", 18);
  for (let x of [-1.36, 1.36]) piston(up, [x, -2.29, -1.24], [x, -10.96, -1.19], 0.39);
  loft(
    up,
    [
      [-8.04, 1.74, 1.63],
      [-7.49, 2.2, 2.11],
      [-6.59, 2.49, 2.23],
      [-3.54, 2.44, 2.28],
      [-2.51, 1.94, 1.78],
    ],
    M.navy
  );
  for (let i = 0; i < 2; i++) {
    let y = -2.84 - i * 2.29;
    plate(
      up,
      [
        [-1.75, y - 0.19],
        [0.95, y + 0.32],
        [2.25, y - 0.49],
        [2.27, y - 2.44],
        [1.3, y - 3.16],
        [-1.78, y - 2.55],
        [-2.13, y - 1.4],
      ],
      2.16 - i * 0.13,
      1.55,
      i ? armourPaint.mid : armourPaint.blue,
      0.14,
      (x, y) => -0.064 * x * x
    );
    let o = box(up, 0, y - 2.54, 2.27 - i * 0.13, 2.55, 0.088, 0.087, M.edge);
    o.rotation.z = 0.11;
  }
  for (let k = -1; k <= 1; k++) {
    cyl(up, k * 0.86, -8.75, -1.53, 0.3, 0.3, 5.28, M.chrome, "y", 16);
    cyl(up, k * 0.86, -7.19, -1.57, 0.43, 0.44, 2.8, M.dark, "y", 16);
    for (const y of [-8.23, -8.54, -10.39]) cyl(up, k * 0.86, y, -1.53, 0.336, 0.335, 0.11, M.iron, "y", 20);
  }
  for (let k = -1; k <= 1; k++) piston(up, [k * 0.83, -6.93, 0.96], [k * 0.76, -11.77, 0.87], 0.238, M.iron);
  const workLamp = group(up, 0, -5.5, 2.59);
  lamp(workLamp, 0, 0, 0, 0.218);
  halo(workLamp, 0, 0, 0.21, 1.54, 0xe6eff1, 0.34);
  axle(low, 0, 0, 0, 1.58, 4.68, "x", M.edge);
  const outer = group(low, s * 2.99, 0, 0);
  outer.rotation.y = (s * Math.PI) / 2;
  cyl(outer, 0, 0, 0.21, 1.3, 1.49, 0.39, M.iron, "z", 48);
  cyl(outer, 0, 0, 0.445, 1.02, 1.24, 0.19, M.dark, "z", 48);
  ring(outer, 0, 0, 0.55, 0.884, 0.098, M.edge, "z", 48);
  cyl(outer, 0, 0, 0.548, 0.779, 0.83, 0.1, M.iron, "z", 40);
  cutbox(outer, 0, 0.045, 0.611, 0.92, 0.141, 0.053, M.black, 0.034, 0.016);
  for (let x of [-2.35, 2.35]) {
    let g = group(low, x, -0.3, 0);
    g.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    decal(g, 0, 0, 0.19, 1.48, 0.75, writing(["03", "HINGE A"]));
  }
  loft(
    low,
    [
      [-L + 0.83, 1.69, 1.38],
      [-L + 1.71, 1.98, 1.62],
      [-6.19, 2.57, 2.36],
      [-3.46, 2.85, 2.55],
      [-1.94, 2.83, 2.29],
      [-1.06, 2.24, 1.84],
    ],
    M.dark
  );
  for (let k of [-1, 1]) {
    const cheek = [
      [2.04, 1.19],
      [2.81, 1.85],
      [3.16, -2.15],
      [3.01, -5.31],
      [2.16, -10.36],
      [1.88, -10.85],
      [1.39, -9.69],
      [1.8, -4.12],
    ];
    if (k !== s) {
      cheek[0] = [1.81, -1.29];
      cheek[1] = [2.47, -1.53];
    }
    if (k === s) {
      // The outer casting is split across its depth to leave the actuator passage open.
      sidePlate(low, k, cheek, 1.22, 1.08, M.navy, 0.13);
      sidePlate(low, k, cheek, -0.53, 1.36, armourPaint.mid, 0.13);
    } else {
      sidePlate(low, k, cheek, 1.22, 3.11, M.navy, 0.16);
    }
    sidePlate(
      low,
      k,
      [
        [1.68, -1.65],
        [2.57, -1.36],
        [2.88, -3.29],
        [2.75, -5.28],
        [1.98, -9.84],
        [1.68, -9.77],
        [1.88, -5.07],
      ],
      2.04,
      1.67,
      armourPaint.light,
      0.115
    );
    rod(low, [k * 2.35, -2.7, 1.99], [k * 1.66, -10.46, 1.51], 0.129, M.edge);
    piston(low, [k * 1.4, -2.85, -1.88], [k * 1.02, -11.01, -1.44], 0.3);
    for (let j of [2.42, 4.96, 8.44]) bolt(low, k * (2.63 - j * 0.065), -j, 2.17, 0.096);
  }
  plate(
    low,
    [
      [-2.15, -1.74],
      [-1.54, -0.98],
      [1.61, -1.09],
      [2.35, -2.37],
      [2.07, -5.88],
      [1.43, -10.62],
      [-1.47, -10.62],
      [-2.23, -5.01],
    ],
    2.52,
    1.3,
    armourPaint.blue,
    0.169,
    (x, y) => 0.09 * (y + 3) - 0.053 * x * x
  );
  if (s === -1) {
    const panelFace = (x, y) => 2.57 + 0.09 * (y + 3) - 0.053 * x * x;
    const label = (x, y) => V(x, y, panelFace(x, y) + 0.125);
    surfacePrint(low, label, [-1.22, 0.57], [-5.14, -4.38], writing(["BD–07", "SERVICE  /  R"]), {
      lift: 0.012,
    });
    const jet = group(low, 0, -0.6, -2.39);
    jet.rotation.x = -0.23;
    const bellShape = [
      [0.52, 0.6],
      [0.84, 0.58],
      [0.94, 1.08],
      [1.02, 1.52],
      [1.13, 2.42],
      [1.2, 2.89],
      [1.14, 3.08],
      [0.94, 3.09],
      [0.81, 2.78],
      [0.59, 2.37],
      [0.4, 2.28],
    ];
    const alloy = coat(0x655e55, 0.87, 0.287, 0.61);
    mesh(
      jet,
      new T.LatheGeometry(
        bellShape.map((q) => new T.Vector2(...q)),
        56
      ),
      alloy
    );
    cyl(jet, 0, 0.73, 0, 1.05, 0.83, 0.66, armourPaint.mid, "y", 40);
    ring(jet, 0, 2.97, 0, 1.13, 0.083, M.edge, "y", 48);
    ring(jet, 0, 1.23, 0, 0.948, 0.092, M.iron, "y", 48);
    cyl(jet, 0, 2.27, 0, 0.63, 0.58, 0.1, M.black, "y", 36);
    ring(jet, 0, 2.34, 0, 0.48, 0.05, armourPaint.brass, "y", 40);
    for (let i = 0; i < 12; i++) {
      const a = (i * TAU) / 12,
        at = (r, y) => [r * Math.cos(a), y, r * Math.sin(a)];
      rod(jet, at(0.99, 1.32), at(1.14, 2.79), 0.065, M.iron, 10);
    }
    axle(jet, 0, 0.56, 0, 0.62, 2.39, "x", M.edge);
    for (const k of [-1, 1]) {
      const deflector = group(jet, k * 0.78, 0.79, -0.31);
      deflector.rotation.y = k * 0.54;
      plate(
        deflector,
        [
          [-0.53, -0.71],
          [0.36, -0.53],
          [0.54, 1.37],
          [0.21, 1.88],
          [-0.39, 1.15],
        ],
        -0.44,
        0.21,
        armourPaint.mid,
        0.066
      );
    }
    dripPoint(jet, 0, -0.1, -1, 3);
  } else makeSword(low, L);
  for (let j = 0; j < 2; j++)
    cyl(
      low,
      0,
      -L + 0.72 + j * 0.42,
      0.015,
      1.84 + j * 0.06,
      1.77 + j * 0.07,
      0.3,
      j ? M.edge : M.rubber,
      "y",
      16
    );
  const cuff = (x, y) => 2.68 + 0.09 * (y + 3) - 0.053 * x * x;
  const trim = [
    [0.11, -1.063],
    [1.28, -1.14],
    [1.96, -1.61],
    [2.09, -2.39],
    [1.93, -4.45],
    [1.56, -7.23],
    [1.22, -9.99],
    [0.65, -10.37],
    [0.83, -7.35],
    [1.17, -4.48],
    [1.29, -2.52],
    [1.01, -1.69],
  ];
  sidePlate(low, -s, trim, 0, 0.17, armourPaint.red, 0.039, cuff, 6);
  const white = [
    [0.06, -1.06],
    [0.22, -1.045],
    [1.08, -1.67],
    [1.34, -2.48],
    [1.23, -4.54],
    [0.878, -7.37],
    [0.708, -10.26],
    [0.56, -10.32],
    [0.72, -7.34],
    [1.06, -4.47],
    [1.18, -2.58],
    [0.934, -1.74],
  ];
  sidePlate(low, -s, white, 0.017, 0.122, armourPaint.ivory, 0.018, cuff, 5);
  if (s < 0) {
    lamp(outer, 0, 1.18, 0.37, 0.08, armourPaint.green);
    halo(outer, 0, 1.18, 0.56, 0.73, 0x6aff97, 0.3);
  }
  armService(up, low, s, L);
  hand(low, s, s === -1, L);
  dripPoint(low, -1.61, -L + 1.02, 1.14, 2);
}
for (let s of [-1, 1]) buildArm(s);
function buildLeg(s) {
  const hip = V(s * 5.76, 43.98, -0.3),
    knee = V(s * 10.04, 25.46, s === 1 ? 2.84 : 1.56),
    ankle = V(s * 15.03, 5.56, s === 1 ? 0.12 : -1.55);
  const thigh = limb(delta, hip, knee),
    shin = limb(delta, knee, ankle);
  const D = hip.distanceTo(knee),
    L = knee.distanceTo(ankle);
  legStations[s] = { hip, knee, ankle };
  axle(thigh, 0, -0.18, 0, 1.34, 4.67, "x");
  rod(thigh, [0, -0.77, 0], [0, -D + 0.9, 0.04], 1.46, M.dark, 16);
  for (let j = -1; j <= 1; j++) piston(thigh, [j * 0.92, -1.15, 2.6], [j * 0.83, -7.42, 2.75], 0.32);
  for (let k of [-1, 1]) {
    piston(thigh, [k * 1.78, -3.14, -1.65], [k * 1.35, -D + 1.39, -1.27], 0.54);
    hose(
      thigh,
      [
        [k * 2.06, -2.42, -1.65],
        [k * 2.61, -6.45, -2.06],
        [k * 2.27, -12.36, -2.29],
        [k * 1.49, -D + 0.81, -1.62],
      ],
      0.22
    );
  }
  const signedPower = (x, p) => Math.sign(x) * Math.abs(x) ** p;
  const femurRadii = [
    [0, 2.62, 2.25],
    [0.12, 2.81, 2.49],
    [0.31, 3.08, 2.71],
    [0.59, 3.57, 3.11],
    [0.78, 3.68, 3.27],
    [0.93, 3.56, 3.13],
    [1, 3.3, 2.96],
  ];
  const femur = (a, v) => {
    const cs = Math.cos(a),
      sn = Math.sin(a),
      [rx, rz] = sectionValues(femurRadii, v);
    const y = mix(
      -D + 1.72 + 1.59 * Math.max(0, -cs) ** 2,
      -1.87 - 1.65 * Math.max(0, cs) ** 3 - 2.45 * Math.max(0, -cs) ** 4,
      v
    );
    return V(rx * signedPower(sn, 0.86), y, rz * signedPower(cs, 0.91) - 0.12 + 0.15 * v);
  };
  shellPanel(thigh, femur, [-Math.PI, Math.PI - 0.0003], [0, 1], M.dark, {
    nu: 68,
    nv: 23,
    thick: 0.43,
    lift: -0.11,
    bevel: 0.09,
  });
  const seams = [-Math.PI, -2.39, -1.55, -0.93, -0.54, 0.54, 0.93, 1.55, 2.39, Math.PI];
  for (let j = 1; j < seams.length; j++) {
    const u = [seams[j - 1] + 0.006, seams[j] - 0.006],
      front = Math.abs((u[0] + u[1]) / 2) < 0.54,
      split = front ? 0.3 : 0.42;
    for (const v of [
      [0.006, split - 0.006],
      [split + 0.006, 0.993],
    ]) {
      shellPanel(thigh, femur, u, v, front ? armourPaint.navy : armourPaint.blue, {
        nu: 9,
        nv: 13,
        thick: 0.26,
        bevel: 0.061,
      });
      for (const a of [u[0] + 0.045, u[1] - 0.045])
        bolt(surfaceSeat(thigh, femur, a, v[0] + 0.036, 1, 0.019), 0, 0, 0, 0.057);
    }
  }
  // Recessed longitudinal insert, visually separated from the wraparound outer shells.
  shellPanel(thigh, femur, [-0.408, 0.408], [0.292, 0.849], M.dark, {
    nu: 14,
    nv: 17,
    thick: 0.2,
    lift: 0.078,
    bevel: 0.065,
  });
  shellPanel(thigh, femur, [-0.358, 0.358], [0.326, 0.817], armourPaint.mid, {
    nu: 13,
    nv: 16,
    thick: 0.15,
    lift: 0.152,
    bevel: 0.078,
  });
  for (const band of [
    [-0.433, -0.385],
    [0.385, 0.433],
  ])
    shellPanel(thigh, femur, band, [0.298, 0.855], M.edge, {
      nu: 3,
      nv: 16,
      lift: 0.122,
      thick: 0.14,
      bevel: 0.026,
    });
  surfacePrint(thigh, femur, [-0.21, 0.2], [0.382, 0.794], femurIndex, { lift: 0.164 });
  const thighLamp = surfaceSeat(thigh, femur, 0, 0.903, 1, 0.052);
  cutbox(thighLamp, 0, 0, 0, 1.0, 0.46, 0.31, M.iron, 0.1, 0.053);
  for (let k = -1; k <= 1; k++) box(thighLamp, k * 0.249, 0, 0.174, 0.193, 0.142, 0.059, M.lamp);
  halo(thighLamp, 0, 0, 0.205, 1.93, 0xdcecf3, 0.34);
  for (let k = -1; k <= 1; k++)
    rod(thigh, [k * 0.78, -D + 3.9, -1.6], [k * 0.82, -D + 0.73, -1.48], 0.187, M.chrome, 16);
  // Forked open knee, the pivot and its small green sector are visible through the gap.
  axle(shin, 0, 0, 0, 1.58, 5.57, "x", M.iron);
  axle(shin, 0, -1.57, -1.48, 0.7, 4.64, "x", M.edge);
  for (const side of [-1, 1]) {
    const clevis = group(shin, side * 2.41, -0.51, -0.07);
    clevis.rotation.y = (side * Math.PI) / 2;
    plate(
      clevis,
      [
        [-1.65, 0.34],
        [-0.97, 1.44],
        [0.62, 1.54],
        [1.44, 0.81],
        [1.48, -0.76],
        [0.71, -2.73],
        [-0.45, -3.47],
        [-1.18, -3.01],
        [-1.66, -1.31],
      ],
      0.26,
      0.73,
      armourPaint.navy,
      0.117
    );
  }
  for (const k of [-1, 1]) {
    const fork = group(shin, k * 1.11, 0.4, 1.2);
    cutbox(fork, 0, 0.55, -0.05, 0.78, 1.69, 0.87, armourPaint.navy, 0.18, 0.083);
    cyl(fork, 0, 0, 0.38, 0.49, 0.49, 0.88, M.iron, "x", 28);
    cyl(fork, k * 0.44, 0, 0.38, 0.38, 0.41, 0.089, M.edge, "x", 28);
    cutbox(fork, 0, -1.18, 0.25, 0.59, 0.59, 0.76, M.iron, 0.136, 0.062);
    piston(fork, [0, -1.89, 0.04], [0, -0.43, 0.28], 0.183, M.bronze);
  }
  const patella = group(shin, s * 3.15, 0, 0);
  patella.rotation.y = (s * Math.PI) / 2;
  cyl(patella, 0, 0, 0.1, 1.09, 1.24, 0.32, M.edge, "z", 48);
  cyl(patella, 0, 0, 0.283, 0.83, 0.99, 0.14, M.iron, "z", 48);
  cyl(patella, 0, 0, 0.375, 0.61, 0.65, 0.095, M.dark, "z", 40);
  const indicator = mesh(
    patella,
    new T.TorusGeometry(0.487, 0.058, 8, 25, 1.62),
    armourPaint.green,
    0,
    0,
    0.431
  );
  indicator.rotation.z = 0.43;
  cutbox(shin, 0, -1.11, 0.63, 2.86, 0.83, 1.38, M.iron, 0.19, 0.091);
  for (const k of [-1, 1]) piston(shin, [k * 1.76, -2.19, 0.85], [k * 1.42, -0.53, 1.02], 0.28);
  const tibialRadii = [
    [0, 2.29, 1.96],
    [0.15, 2.26, 1.88],
    [0.33, 2.46, 2.01],
    [0.47, 2.82, 2.49],
    [0.59, 3.26, 3.39],
    [0.7, 3.59, 3.83],
    [0.86, 3.67, 3.72],
    [1, 3.39, 3.06],
  ];
  const tibia = (a, v) => {
    const cs = Math.cos(a),
      sn = Math.sin(a),
      [w, d] = sectionValues(tibialRadii, v);
    const y = mix(-L + 1.22 + 0.27 * sn * sn, -2.36 - 0.78 * sn * sn - 0.19 * cs, v);
    const planes = [
      [0, 0, 1],
      [0.412, 0.445, 0.984],
      [0.9, 0.81, 0.702],
      [1.65, 0.995, -0.014],
      [2.37, 0.789, -0.691],
      [Math.PI, 0, -1],
    ];
    const angle = Math.abs(a),
      i = Math.max(
        1,
        planes.findIndex((row) => row[0] >= angle)
      );
    const p = planes[i - 1],
      q = planes[i],
      f = (angle - p[0]) / (q[0] - p[0]),
      sx = mix(p[1], q[1], f),
      sz = mix(p[2], q[2], f);
    return V(Math.sign(a) * w * sx, y, (sz > 0 ? d : 2.15 + 0.48 * v) * sz - 0.04);
  };
  const division = (a) => 0.502 + 0.147 * (1 - Math.cos(a));
  const lower = (a, t) => tibia(a, mix(0.003, division(a) - 0.01, t));
  const upper = (a, t) => tibia(a, mix(division(a) + 0.011, 0.998, t));
  shellPanel(shin, tibia, [-2.37, 2.37], [0, 1], M.iron, {
    nu: 50,
    nv: 28,
    thick: 0.46,
    lift: -0.137,
    bevel: 0.068,
  });
  const cuts = [-2.36, -1.65, -0.9, -0.412, 0.412, 0.9, 1.65, 2.36];
  for (let j = 1; j < cuts.length; j++) {
    const u = [cuts[j - 1] + 0.006, cuts[j] - 0.006],
      central = j === 4;
    shellPanel(shin, upper, u, [0, 1], central ? armourPaint.mid : armourPaint.blue, {
      nu: 8,
      nv: 13,
      thick: 0.37,
      lift: 0.058,
      bevel: 0.083,
    });
    shellPanel(shin, lower, u, [0, 1], central ? armourPaint.mid : armourPaint.navy, {
      nu: 8,
      nv: 15,
      thick: 0.27,
      bevel: 0.055,
    });
    for (const a of [u[0] + 0.045, u[1] - 0.045]) {
      bolt(surfaceSeat(shin, upper, a, 0.102, 1, 0.076), 0, 0, 0, 0.065);
      bolt(surfaceSeat(shin, lower, a, 0.087, 1, 0.012), 0, 0, 0, 0.058);
    }
  }
  shellPanel(shin, lower, [-0.329, 0.329], [0.13, 0.86], armourPaint.blue, {
    nu: 10,
    nv: 10,
    thick: 0.15,
    lift: 0.074,
    bevel: 0.073,
  });
  surfacePrint(shin, lower, [-0.208, 0.216], [0.61, 0.76], writing(["BD / 07"]), { lift: 0.095 });

  // A folded front shoe overlaps the lower tibial casting. Its side wings
  // turn back sharply, leaving a stepped, pentagonal bottom edge at the shin.
  const shoe = (a, t) => {
    const k = Math.abs(a),
      low = 0.022 + 0.35 * Math.max(0, k - 0.38),
      hi = 0.94 + 0.048 * Math.cos(5 * a);
    const v = mix(low, hi, t),
      q = upper(a, v),
      n = surfaceNormal(upper, a, v);
    return q.addScaledVector(n, 0.118 + 0.084 * (1 - t) + 0.122 * Math.max(0, 1 - k / 0.48));
  };
  for (const [a, b] of [
    [-1.4, -0.51],
    [-0.495, 0.495],
    [0.51, 1.4],
  ])
    shellPanel(shin, shoe, [a, b], [0, 1], Math.abs(a) < 0.5 ? armourPaint.blue : armourPaint.mid, {
      nu: 9,
      nv: 12,
      thick: 0.29,
      bevel: 0.093,
    });
  shellPanel(shin, shoe, [-0.39, 0.39], [0.13, 0.79], armourPaint.mid, {
    nu: 9,
    nv: 10,
    lift: 0.075,
    thick: 0.17,
    bevel: 0.061,
  });
  for (let j = 0; j < 3; j++)
    shellPanel(shin, shoe, [-0.337, 0.337], [0.831 + j * 0.048, 0.841 + j * 0.048], M.iron, {
      nu: 8,
      nv: 2,
      lift: 0.033,
      thick: 0.047,
      bevel: 0.004,
    });
  surfacePrint(shin, shoe, [-0.223, 0.223], [0.55, 0.64], writing(["MARITIME / 07"]), { lift: 0.092 });
  for (const k of [-1, 1]) {
    const flank = (a, t) => {
      const v = mix(0.101 + 0.2 * a, 0.72 + 0.21 * a, t);
      return lower(k * (0.63 + a * 0.8), v);
    };
    shellPanel(shin, flank, [0, 1], [0, 1], armourPaint.blue, {
      sign: k,
      nu: 9,
      nv: 9,
      thick: 0.185,
      lift: 0.093,
      bevel: 0.062,
    });
    const upperSide = (a, t) => {
      const v = mix(0.34 + 0.12 * a, 0.88 + 0.072 * a, t);
      return femur(k * (0.72 + 1.38 * a), v);
    };
    shellPanel(thigh, upperSide, [0, 1], [0, 1], armourPaint.blue, {
      sign: k,
      nu: 15,
      nv: 12,
      thick: 0.21,
      lift: 0.079,
      bevel: 0.069,
    });
    const backLip = (a, t) => femur(k * (1.82 + 0.99 * a), mix(0.076 + 0.06 * a, 0.244 + 0.086 * a, t));
    shellPanel(thigh, backLip, [0, 1], [0, 1], armourPaint.mid, {
      sign: k,
      nu: 10,
      nv: 7,
      lift: 0.09,
      thick: 0.2,
      bevel: 0.046,
    });
  }
  const stencil = surfaceSeat(thigh, femur, s * 1.12, 0.51, 1, 0.095);
  decal(stencil, 0, 0, 0.011, 0.91, 0.45, hatchPrint);
  const backDrum = group(shin, 0, -3.78, -2.58);
  backDrum.rotation.y = Math.PI;
  cyl(backDrum, 0, 0, -0.22, 1.76, 1.91, 1.93, M.iron, "z", 48);
  cyl(backDrum, 0, 0, 0.84, 1.58, 1.65, 0.31, M.dark, "z", 48);
  ring(backDrum, 0, 0, 1.022, 1.15, 0.189, armourPaint.brass, "z", 48);
  cyl(backDrum, 0, 0, 1.07, 0.77, 0.85, 0.17, M.iron, "z", 40);
  ring(backDrum, 0, 0, 1.18, 0.72, 0.047, M.edge, "z", 40);
  const calf = group(shin, 0, -0.6 * L, -2.28);
  calf.rotation.y = Math.PI;
  const dorsal = group(shin);
  dorsal.rotation.y = Math.PI;
  const backFace = (x, y) => 2.22 - 0.076 * x * x + 0.054 * (y + 10);
  plate(
    dorsal,
    [
      [-1.55, -4.33],
      [1.61, -4.39],
      [1.92, -5.88],
      [1.62, -8.96],
      [0.98, -10.09],
      [-1.02, -10.09],
      [-1.75, -9.13],
      [-1.91, -5.91],
    ],
    0.11,
    0.83,
    armourPaint.navy,
    0.12,
    backFace,
    6
  );
  for (const k of [-1, 1])
    sidePlate(
      dorsal,
      k,
      [
        [0.06, -5.19],
        [1.39, -5.11],
        [1.65, -6.02],
        [1.47, -8.8],
        [0.92, -9.72],
        [0.07, -9.93],
      ],
      0.26,
      0.34,
      armourPaint.blue,
      0.091,
      backFace,
      4
    );
  plate(
    dorsal,
    [
      [-1.71, -15.11],
      [-1.04, -15.58],
      [1.02, -15.58],
      [1.71, -15.11],
      [2.07, -16.58],
      [1.72, -17.64],
      [-1.63, -17.64],
      [-2.03, -16.71],
    ],
    2.39,
    0.58,
    armourPaint.mid,
    0.1,
    (x, y) => -0.087 * x * x,
    4
  );
  for (const k of [-1, 1]) {
    piston(shin, [k * 2.1, -3.93, -2.62], [k * 1.75, -L + 1.81, -2.21], 0.515, M.iron);
    piston(shin, [k * 2.6, -5.47, -1.13], [k * 1.99, -L + 3.18, -1.34], 0.287, armourPaint.brass);
    const duct = group(calf, k * 0.72, -0.53, 0.31);
    duct.rotation.z = -k * 0.037;
    capsuleGrille(duct, 1.22, 5.08, 14);
    const wedge = group(shin, k * 1.91, -L + 2.86, -0.36);
    wedge.rotation.y = (k * Math.PI) / 2;
    const profile = [
      [-1.67 * k, -1.02],
      [-1.38 * k, 2.59],
      [1.5 * k, 3.44],
      [3.77 * k, 0.9],
      [4.33 * k, -0.41],
      [3.44 * k, -1.2],
      [1.21 * k, -0.79],
      [0.09 * k, -1.07],
    ];
    plate(wedge, profile, 0.35, 1.01, armourPaint.mid, 0.138, (x, y) => -0.056 * x * x, 5);
  }
  axle(shin, 0, -L, 0, 1.36, 4.72, "x", M.iron);
  for (const k of [-1, 1]) {
    const main = group(shin, k * 2.63, -L, 0);
    main.rotation.y = (k * Math.PI) / 2;
    cyl(main, 0, 0, 0.04, 1.29, 1.38, 0.34, M.dark, "z", 48);
    cyl(main, 0, 0, 0.241, 1.075, 1.16, 0.16, armourPaint.brass, "z", 48);
    ring(main, 0, 0, 0.343, 1.03, 0.061, M.edge, "z", 48);
    for (let j = 0; j < 14; j++) {
      const a = (j * TAU) / 14;
      const spoke = box(main, 0.75 * Math.cos(a), 0.75 * Math.sin(a), 0.347, 0.44, 0.074, 0.074, M.iron);
      spoke.rotation.z = a;
    }
    cyl(main, 0, 0, 0.37, 0.49, 0.55, 0.13, M.iron, "z", 36);
  }
  // The centre bridge leaves an open notch between forefoot and heel.
  let foot = group(delta, ankle.x, 0, ankle.z);
  foot.rotation.y = s * 0.185;
  loft(
    foot,
    [
      [0.08, 3.27, 4.92, 0, 3.18],
      [0.69, 3.54, 5.12, 0, 3.19],
      [1.39, 3.5, 5.09, 0, 3.12],
      [1.96, 3.05, 4.77, 0, 2.97],
    ],
    M.rubber
  );
  loft(
    foot,
    [
      [1.34, 3.32, 4.95, 0, 3.13],
      [1.99, 3.4, 4.87, 0, 3.1],
      [2.59, 3.12, 4.35, 0, 2.67],
      [3.91, 2.56, 2.74, 0, 1.61],
      [4.92, 2.15, 1.65, 0, 0.83],
    ],
    armourPaint.blue
  );
  loft(
    foot,
    [
      [0.12, 2.62, 1.71, 0, -3.29],
      [0.62, 2.72, 1.86, 0, -3.28],
      [1.35, 2.65, 1.80, 0, -3.27],
      [1.73, 2.39, 1.55, 0, -3.17],
    ],
    M.iron
  );
  loft(
    foot,
    [
      [1.48, 2.43, 1.58, 0, -3.18],
      [2.17, 2.34, 1.43, 0, -3.01],
      [3.26, 1.96, 1.02, 0, -2.82],
      [3.62, 1.77, 0.81, 0, -2.70],
    ],
    armourPaint.navy
  );
  for (const k of [-1, 1]) {
    const pad = group(foot, k * 3.43, 0, 1.51);
    loft(
      pad,
      [
        [0.14, 0.7, 3.28],
        [0.47, 0.79, 3.62],
        [0.91, 0.74, 3.56],
        [1.19, 0.56, 3.32],
      ],
      M.rubber
    );
    loft(
      pad,
      [
        [0.78, 0.77, 3.48],
        [1.14, 0.75, 3.41],
        [1.44, 0.48, 3.04],
      ],
      armourPaint.navy
    );
  }
  axle(foot, 0, 3.86, -1.47, 0.7, 4.34, "x", armourPaint.brass);
  for (const side of [-1, 1]) {
    const idler = group(foot, side * 2.64, 3.86, -1.47);
    idler.rotation.y = (side * Math.PI) / 2;
    cyl(idler, 0, 0, -0.07, 0.59, 0.62, 0.23, M.iron, "z", 32);
    ring(idler, 0, 0, 0.064, 0.468, 0.058, armourPaint.brass, "z", 32);
    cyl(idler, 0, 0, 0.066, 0.351, 0.398, 0.095, M.edge, "z", 32);
  }
  cyl(foot, 0, 3.38, -4.39, 0.76, 0.76, 3.75, M.iron, "x", 32);
  for (let j = -3; j <= 3; j++) cyl(foot, j * 0.52, 3.38, -4.39, 0.83, 0.83, 0.26, M.dark, "x", 32);
  const bootStations = [
    [-1.54, 5.48, 2.31],
    [-0.67, 5.57, 2.35],
    [0.49, 5.34, 2.28],
    [1.67, 4.87, 2.39],
    [2.82, 4.05, 2.59],
    [4.14, 3.31, 2.72],
    [5.82, 2.86, 3.04],
    [6.77, 2.68, 3.22],
    [8.26, 2.26, 2.88],
  ];
  const instep = (u, z) => {
    const [y, w] = sectionValues(bootStations, z);
    return V(u * w, y - 0.39 * u * u - 0.27 * Math.abs(u) ** 5, z);
  };
  for (const [a, b] of [
    [-1.48, -0.51],
    [-0.41, 1.62],
    [1.76, 3.91],
    [4.05, 5.91],
    [6.05, 8.24],
  ]) {
    shellPanel(foot, instep, [-1, 1], [a, b], a > 6 ? armourPaint.mid : armourPaint.blue, {
      sign: -1,
      nu: 12,
      nv: 9,
      thick: 0.49,
      bevel: 0.103,
    });
    for (const side of [-1, 1]) {
      shellPanel(
        foot,
        instep,
        side < 0 ? [-0.996, -0.742] : [0.742, 0.996],
        [a + 0.044, b - 0.044],
        armourPaint.navy,
        { sign: -1, nu: 4, nv: 8, thick: 0.27, lift: 0.091, bevel: 0.057 }
      );
      bolt(surfaceSeat(foot, instep, 0.837 * side, b - 0.21, -1, 0.122), 0, 0, 0, 0.066);
    }
  }
  for (const side of [-1, 1]) {
    const cheek = group(foot);
    cheek.rotation.y = (side * Math.PI) / 2;
    const width = (x, y) => {
      const z = clamp(-side * x, -1.54, 8.26),
        [top, w] = sectionValues(bootStations, z);
      return w + 0.035 + 0.115 * Math.max(0, top - y);
    };
    const panels = [
      [
        [0.62, 5.66],
        [1.49, 5.43],
        [2.78, 4.63],
        [3.64, 3.89],
        [3.12, 3.47],
        [2.39, 3.4],
        [1.51, 3.98],
        [0.84, 4.18],
        [0.29, 4.84],
      ],
      [
        [2.39, 3.25],
        [3.19, 3.35],
        [3.83, 3.76],
        [5.26, 3.12],
        [6.16, 2.76],
        [5.57, 1.79],
        [3.02, 1.68],
        [2.16, 2.36],
      ],
      [
        [5.56, 2.92],
        [6.37, 2.83],
        [7.62, 2.47],
        [8.38, 2.11],
        [8.45, 1.67],
        [7.86, 1.47],
        [5.83, 1.62],
        [6.29, 2.63],
      ],
    ];
    for (let j = 0; j < panels.length; j++) {
      const shape = panels[j].map(([z, y]) => [-side * z, y]);
      plate(cheek, shape, 0.08, 0.42, j === 1 ? armourPaint.blue : armourPaint.mid, 0.065, width, 5);
    }
    const plane = (x, y) => V(x, y, width(x, y) + 0.142);
    for (const [z, y] of [
      [1.57, 4.83],
      [3.13, 2.23],
      [4.9, 2.67],
      [7.37, 1.89],
    ])
      bolt(surfaceSeat(cheek, plane, -side * z, y), 0, 0, 0, 0.06);
    const hanger = group(foot, side * 1.96, 2.6, -3.54);
    hanger.rotation.y = (side * Math.PI) / 2;
    plate(
      hanger,
      [
        [-0.94, -0.61],
        [-0.6, 0.99],
        [0.52, 1.23],
        [1.12, 0.41],
        [0.94, -0.42],
        [0.08, -0.71],
      ],
      0.1,
      0.41,
      armourPaint.mid,
      0.083
    );
  }
  for (const z of [1.67, 3.98, 5.97]) {
    const y = instep(0, z).y - 0.15;
    cyl(foot, 0, y, z, 0.19, 0.19, 3.79, M.iron, "x", 24);
    for (const x of [-1.24, 0.0, 1.24]) cyl(foot, x, y, z, 0.207, 0.207, 0.53, M.edge, "x", 24);
  }
  for (const side of [-1, 1]) {
    const cheek = group(foot, side * 2.31, 4.79, -0.29);
    cheek.rotation.y = (side * Math.PI) / 2;
    plate(
      cheek,
      [
        [-2.1, -1.41],
        [-1.38, 0.01],
        [-0.63, 0.25],
        [0.59, 0.01],
        [1.57, -0.74],
        [2.17, -1.58],
        [1.08, -1.69],
        [-0.3, -0.77],
        [-1.17, -1.58],
      ],
      0.11,
      0.45,
      M.navy,
      0.11
    );
    piston(foot, [side * 1.74, 3.41, -2.98], [side * 1.82, 5.57, -1.21], 0.27);
    const gaiter = group(foot, side * 2.23, 4.36, 0.21);
    gaiter.rotation.y = (side * Math.PI) / 2;
    plate(
      gaiter,
      [
        [-2.3, -0.94],
        [-1.74, 0.18],
        [-1.12, 1.08],
        [-0.5, 1.5],
        [0.63, 1.37],
        [1.4, 0.48],
        [1.91, -0.63],
        [1.55, -1.11],
        [0.83, -0.61],
        [0.27, -0.04],
        [-0.48, 0.02],
        [-1.35, -0.91],
      ],
      0.086,
      0.51,
      armourPaint.blue,
      0.101,
      (x, y) => -0.065 * x * x,
      4
    );
  }
  for (let j = 0; j < 4; j++) box(foot, 0, 1.03, 4.34 + j * 0.94, 6.76 - j * 0.09, 0.23, 0.19, M.dark);
  runnel(
    shin,
    [
      [0.57, 0.93],
      [0.59, 0.74],
      [0.6, 0.57],
      [0.58, 0.33],
      [0.57, 0.018],
    ].map(([a, t]) => upper(s * a, t).addScaledVector(surfaceNormal(upper, s * a, t), 0.085)),
    0.021
  );
  splashAt(shin, 0, -2.58, 1.74, 2.18, 1.32);
}
for (let s of [-1, 1]) buildLeg(s);
bake(delta);
// Keep the established pier, container stacks and weather sequence independent of armour detailing.
seed = 334120781;
