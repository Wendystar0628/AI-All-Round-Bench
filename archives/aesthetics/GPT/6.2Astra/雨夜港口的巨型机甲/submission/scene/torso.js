"use strict";
// Metre datum at the soles, facing +Z. The thorax turns about the waist bearing.
const delta = group(scene),
  thoraxJoint = group(delta, 0, 47.3, 0);
delta.userData.collision = true;
thoraxJoint.rotation.y = 0.075;
const thorax = group(thoraxJoint, 0, -47.3, 0);
const waterSources = [],
  splashSurfaces = [];
function dripPoint(p, x, y, z, amount = 1) {
  p.updateWorldMatrix(true, false);
  waterSources.push([p.localToWorld(V(x, y, z)), amount]);
}
function splashAt(p, x, y, z, w, d) {
  p.updateWorldMatrix(true, false);
  splashSurfaces.push([p.localToWorld(V(x, y, z)), w, d]);
}
function sidePlate(p, s, pts, z, d, mat, b = 0.12, bend = null, divisions = 1, openings = []) {
  return plate(
    p,
    mirrored(pts, s),
    z,
    d,
    mat,
    b,
    bend ? (x, y) => bend(Math.abs(x), y) : null,
    divisions,
    openings.map((outline) => mirrored(outline, s))
  );
}
const anchorPrint = printMaterial("unit crest", 640, 330, (c) => {
  c.fillStyle = "#e3e4d5";
  c.font = "900 254px Bahnschrift, Arial Black, Arial";
  c.fillText("07", 4, 239, 355);
  c.save();
  c.translate(477, 108);
  c.strokeStyle = "#daddcf";
  c.lineWidth = 12;
  c.beginPath();
  c.arc(0, -37, 15, 0, TAU);
  c.stroke();
  c.beginPath();
  c.moveTo(0, -21);
  c.lineTo(0, 79);
  c.moveTo(-33, -3);
  c.lineTo(33, -3);
  c.moveTo(-63, 26);
  c.quadraticCurveTo(-64, 61, 0, 79);
  c.quadraticCurveTo(60, 64, 66, 26);
  c.stroke();
  for (let s of [-1, 1]) {
    c.beginPath();
    c.moveTo(s * 73, 11);
    c.lineTo(s * 46, 31);
    c.lineTo(s * 68, 42);
    c.fill();
  }
  for (let k = 0; k < 2; k++) {
    c.lineWidth = 7;
    c.beginPath();
    for (let j = 0; j <= 80; j++) {
      let x = (j - 40) * 1.91,
        y = 86 + k * 15 + Math.sin(j * 0.18) * 5;
      j ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
  c.restore();
  c.fillRect(12, 256, 575, 4);
  c.font = "bold 33px Consolas, monospace";
  c.fillText("MARITIME  /  DIV. 07", 12, 308, 591);
});
const chestPrint = writing(["BREAKER DELTA", "B.D. 07   /   PACIFIC HEAVY INDUSTRIES"]);
const hatchPrint = printMaterial("pressure warning", 512, 210, (c) => {
  c.strokeStyle = c.fillStyle = "#d2d0bc";
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(12, 114);
  c.lineTo(55, 27);
  c.lineTo(101, 114);
  c.closePath();
  c.stroke();
  c.fillRect(51, 60, 8, 27);
  c.fillRect(51, 94, 8, 8);
  c.font = "bold 48px Bahnschrift, Arial";
  c.fillText("CAUTION", 126, 83);
  c.fillRect(125, 99, 340, 3);
  c.font = "bold 25px Consolas, monospace";
  c.fillText("HIGH PRESSURE", 125, 136);
  for (let i = 0; i < 47; i++) c.fillRect(12 + i * 10, 165, 2 + ((i * 7) % 5), 24);
});
const arrowPrint = writing(["↑  LIFT", "DESIGNATED HARDPOINT"]);
// The paired dished breast castings share a die with their edge rails, access plates and stencils.
const reactorHeight = 58.85;
function breastSection(a) {
  const k = Math.sin(a) ** 2,
    h = 1 - Math.cos(a);
  return [57.54 + 1.12 * k + 0.62 * h, 64.59 - 0.76 * k - 0.67 * h];
}
function breastDepth(a, v) {
  const [lo, hi] = breastSection(a),
    y = mix(lo, hi, v),
    x = 10.05 * Math.sin(a);
  const recess = 1 - T.MathUtils.smoothstep(Math.hypot(x, y - reactorHeight), 2.65, 3.83);
  return 0.03 + (6.24 + 0.72 * Math.sin(Math.PI * v) - 2.78 * v * v) * Math.cos(a) - 2.3 * recess;
}
function breastZ(x, y) {
  const a = Math.asin(Math.min(0.998, Math.abs(x) / 10.05)),
    [lo, hi] = breastSection(a);
  return breastDepth(a, (y - lo) / (hi - lo));
}
function breastDie(s) {
  return (a, v) => {
    const [lo, hi] = breastSection(a);
    return V(s * 10.05 * Math.sin(a), mix(lo, hi, v), breastDepth(a, v));
  };
}
const reactorTicks = printMaterial("pectoral index", 384, 640, (c) => {
  c.fillStyle = "#deded1";
  for (let j = 0; j < 11; j++) {
    const a = -0.1 + j * 0.071;
    c.save();
    c.translate(45 + 150 * (Math.cos(a) - 1), 559 - 747 * Math.sin(a));
    c.rotate(-a);
    c.fillRect(0, 0, j % 3 === 0 ? 270 : 192, j % 3 === 0 ? 11 : 8);
    c.restore();
  }
});
function deckHeight(x, z) {
  return 65.05 - 0.066 * (x - 5.88) ** 2 - 0.077 * z - 0.065 * z * z;
}
function clavicle(s) {
  const g = group(thorax);
  g.rotation.x = -Math.PI / 2;
  const footprint = [
    [3.2, 1.82],
    [5.36, 2.7],
    [8.29, 2.41],
    [10.19, 0.52],
    [9.64, -2.38],
    [8.38, -3.47],
    [4.49, -4.02],
    [3.48, -2.59],
  ];
  const cx = 6.78,
    cy = 0.15,
    hole = capsuleOutline(1.13, 2.35).map(([x, y]) => [cx + x, cy + y]);
  const die = (x, y) => deckHeight(x, -y);
  sidePlate(g, s, footprint, 0, 0.76, armourPaint.blue, 0.105, die, 6, [hole]);
  const wells = group(g, s * cx, cy, die(cx, cy) - 0.03);
  plate(wells, capsuleOutline(1.13, 2.34), -0.095, 0.22, M.dark, 0.055);
  plate(wells, capsuleOutline(1.2, 2.43), 0.08, 0.25, M.edge, 0.047, null, 1, [capsuleOutline(0.98, 2.19)]);
  for (const j of [-1, 1]) {
    const y = j * 0.57;
    cyl(wells, 0, y, -0.1, 0.434, 0.39, 0.1, M.black, "z", 32);
    ring(wells, 0, y, 0.018, 0.413, 0.051, M.iron, "z", 32);
    const profile = [
      [0.08, 0],
      [0.25, 0.015],
      [0.36, 0.085],
      [0.397, 0.15],
    ].map((q) => new T.Vector2(...q));
    mesh(wells, new T.LatheGeometry(profile, 32), M.edge, 0, y, -0.15).rotation.x = Math.PI / 2;
  }
  cutbox(wells, 0, 0, 0.005, 0.72, 0.103, 0.13, M.black, 0.034, 0.02);
  for (let j = 0; j < 3; j++) {
    const x = 5.05 + j * 0.95,
      z = 3.01 - j * 0.13,
      hood = group(thorax, s * x, deckHeight(x, z) + 0.2, z);
    hood.rotation.x = 1.96;
    hood.rotation.z = s * 0.05;
    loft(
      hood,
      [
        [-0.71, 0.28, 0.25],
        [-0.52, 0.41, 0.37],
        [-0.17, 0.44, 0.43],
        [0.37, 0.37, 0.34],
        [0.8, 0.215, 0.22],
      ],
      M.edge
    );
    loft(
      hood,
      [
        [0.7, 0.226, 0.225],
        [0.83, 0.196, 0.176],
      ],
      M.iron
    );
    cutbox(hood, 0, -0.09, 0.404, 0.28, 0.39, 0.038, M.pale, 0.04, 0.017);
  }
}
function buildBreast(s) {
  const die = breastDie(s),
    sign = s;
  shellPanel(thorax, die, [0, 1.89], [-0.1, 1], M.dark, {
    sign,
    nu: 46,
    nv: 19,
    thick: 0.51,
    bevel: 0.075,
    lift: -0.1,
  });
  const seams = [0.006, 0.395, 0.764, 1.107, 1.512, 1.882];
  for (let i = 0; i < seams.length - 1; i++) {
    const u = [seams[i] + 0.003, seams[i + 1] - 0.003],
      join = 0.38 + 0.07 * Math.sin(i * 1.38);
    shellPanel(thorax, die, u, [0.012, join - 0.004], i % 3 === 0 ? armourPaint.mid : armourPaint.blue, {
      sign,
      nu: 10,
      nv: 9,
      thick: 0.26,
      bevel: 0.039,
    });
    shellPanel(thorax, die, u, [join + 0.004, 0.997], armourPaint.blue, {
      sign,
      nu: 10,
      nv: 15,
      thick: 0.28,
      bevel: 0.045,
    });
    shellPanel(thorax, die, u, [-0.076, -0.008], armourPaint.navy, {
      sign,
      thick: 0.28,
      lift: 0.047,
      bevel: 0.033,
    });
    for (const a of [u[0] + 0.027, u[1] - 0.028])
      for (const v of [0.074, join + 0.047, 0.917])
        bolt(surfaceSeat(thorax, die, a, v, s, 0.022), 0, 0, 0, 0.052);
  }
  for (let i = 0; i < 24; i++)
    box(
      surfaceSeat(thorax, die, 0.389 + i * 0.0455, -0.058, s, 0.049),
      0,
      0,
      0,
      0.135,
      0.088,
      0.022,
      M.black
    );
  const strake = [
    [3.08, 63.55],
    [4.49, 64.39],
    [7.05, 64.0],
    [9.17, 63.06],
    [9.72, 62.27],
    [9.08, 62.19],
    [6.52, 62.57],
    [3.7, 62.72],
  ];
  const strakeFace = (x, y) => Math.max(breastZ(x, y), 4.69 - 0.073 * (x - 5.59) ** 2 - 0.15 * (y - 63.0));
  sidePlate(thorax, s, strake, 0.09, 0.96, M.dark, 0.079, strakeFace, 8);
  sidePlate(thorax, s, strake, 0.255, 0.18, armourPaint.mid, 0.079, strakeFace, 8);
  const stamp = (x, y) => V(s * x, y, strakeFace(x, y) + 0.35);
  surfacePrint(
    thorax,
    stamp,
    [4.33, 7.42],
    [62.85, 63.45],
    s > 0 ? chestPrint : writing(["BD–07", "HEAVY / MARITIME"]),
    { sign, mirror: s < 0 }
  );
  surfacePrint(thorax, (x, y) => V(s * x, y, breastZ(x, y)), [3.94, 4.99], [58.48, 61.27], reactorTicks, {
    sign,
  });
  for (let i = 0; i < 3; i++) {
    const g = surfaceSeat(thorax, die, 1.04 + i * 0.047, 0.72, s, 0.03);
    lamp(g, 0, 0, 0, 0.082);
    if (i === 1) halo(g, 0, 0, 0.16, 0.99, 0xd8ecff, 0.21);
  }
  sidePlate(
    thorax,
    s,
    [
      [3.08, 57.88],
      [4.68, 58.08],
      [6.66, 57.74],
      [8.43, 58.83],
      [8.56, 56.87],
      [7.66, 54.44],
      [6.34, 53.4],
      [5.66, 54.61],
      [5.31, 55.71],
      [3.45, 56.44],
    ],
    3.47,
    2.97,
    armourPaint.navy,
    0.17,
    (x, y) => -0.12 * (x - 5.7) ** 2 - 0.12 * (57.2 - y) ** 2,
    5
  );
  clavicle(s);
}
function buildTrunk() {
  loft(
    thorax,
    [
      [47.7, 4.18, 2.72],
      [50.8, 4.6, 3.12],
      [53.5, 5.49, 3.43],
      [56.2, 7.33, 4.04],
      [59.8, 8.69, 4.32],
      [62.4, 8.49, 3.92],
      [64.05, 5.5, 3.43],
    ],
    M.rubber
  );
  for (const s of [-1, 1]) {
    buildBreast(s);
    for (let j = 0; j < 3; j++) {
      const x = 4.47 + j * 0.58;
      piston(thorax, [s * x, 49.87 + j * 0.83, 1.31], [s * (x + 1.24), 55.39 + j * 0.46, 1.05], 0.31, M.iron);
      hose(
        thorax,
        [
          [s * x, 59.8, -2.47],
          [s * (x + 1.91), 58.36, -0.99],
          [s * (x + 1.39), 54.8, -0.37],
          [s * (x - 0.13), 51.32, -1.82],
        ],
        0.135 + j * 0.035
      );
    }
  }
  plate(
    thorax,
    [
      [-1.04, 64.19],
      [1.04, 64.19],
      [1.24, 62.69],
      [0.76, 61.83],
      [-0.76, 61.83],
      [-1.24, 62.69],
    ],
    0.14,
    0.49,
    armourPaint.mid,
    0.084,
    breastZ,
    6
  );
  buildCollar();
  for (const y of [47.08, 47.72, 48.49, 49.17])
    cyl(thorax, 0, y, 0, 4.9, 5.08, 0.55, M.iron, "y", 40).scale.z *= 0.73;
  for (const s of [-1, 1]) {
    for (let j = 0; j < 2; j++)
      piston(
        thorax,
        [s * (2.43 + j * 0.69), 44.18, 1.98],
        [s * (3.23 + j * 0.79), 52.41, 2.21],
        0.28,
        M.bronze
      );
    const bend = (x, y) => -0.09 * (x - 1.8) ** 2 + 0.16 * (y - 51.6);
    const ab = [
      [0.64, 54.67],
      [2.86, 55.26],
      [4.37, 55.48],
      [5.04, 54.26],
      [4.89, 51.46],
      [3.01, 48.29],
      [1.13, 47.12],
      [0.72, 48.82],
    ];
    sidePlate(thorax, s, ab, 3.67, 1.74, armourPaint.navy, 0.15, bend, 6);
    for (let j = 0; j < 3; j++) {
      const y = 49.18 + j * 1.91,
        w = 2.82 + j * 0.59;
      const panel = [
        [0.85, y + 1.18],
        [w - 0.13, y + 1.92],
        [w + 0.65, y + 1.61],
        [w + 0.45, y + 0.16],
        [w - 0.14, y - 0.46],
        [1.24, y - 0.74],
        [0.78, y - 0.24],
      ];
      sidePlate(
        thorax,
        s,
        panel,
        4.04 + j * 0.064,
        0.59,
        j === 1 ? armourPaint.mid : armourPaint.blue,
        0.1,
        bend,
        4
      );
      const lip = [
        [0.89, y + 0.88],
        [1.19, y + 0.97],
        [1.2, y + 0.04],
        [1.55, y - 0.25],
        [w - 0.25, y + 0.21],
        [w + 0.21, y + 0.67],
        [w + 0.14, y + 0.25],
        [w - 0.17, y - 0.13],
        [1.42, y - 0.57],
        [0.97, y - 0.29],
      ];
      sidePlate(thorax, s, lip, 4.18 + j * 0.064, 0.212, j % 2 ? M.iron : armourPaint.light, 0.059, bend, 5);
      bolt(thorax, s * 1.17, y - 0.11, 4.17 + j * 0.064 + bend(1.17, y - 0.11), 0.071);
    }
    rod(thorax, [s * 1.04, 47.97, 3.69], [s * 1.17, 53.85, 4.39], 0.17, M.iron);
  }
  const keel = (x, y) => 0.12 * (y - 51) - 0.24 * Math.abs(x);
  plate(
    thorax,
    [
      [-0.54, 55.49],
      [0.54, 55.49],
      [0.81, 54.39],
      [0.55, 51.02],
      [0.75, 49.76],
      [0.5, 47.69],
      [0, 47.07],
      [-0.5, 47.69],
      [-0.75, 49.76],
      [-0.55, 51.02],
      [-0.81, 54.39],
    ],
    4.46,
    0.85,
    armourPaint.mid,
    0.091,
    keel,
    4
  );
  for (let j = 0; j < 4; j++)
    cutbox(
      thorax,
      0,
      52.03 + j * 0.67,
      4.53 + 0.12 * (1.03 + j * 0.67),
      0.45,
      0.55,
      0.09,
      j % 2 ? armourPaint.red : armourPaint.ivory,
      0.046,
      0.02
    );
}
const coreCenter = V(0, reactorHeight, 5.97);
let turbine, coreLamp, coreDisc, reactorMount;
function buildReactor() {
  let g = group(thorax, coreCenter.x, coreCenter.y, coreCenter.z);
  reactorMount = g;
  g.scale.set(0.959, 0.959, 1);
  g.rotation.x = -0.07;
  cyl(g, 0, 0, -1.34, 4.03, 3.73, 0.97, M.dark, "z", 72);
  ring(g, 0, 0, 0.49, 3.82, 0.237, M.iron, "z", 80);
  ring(g, 0, 0, 0.72, 3.57, 0.19, M.rubber, "z", 72);
  for (let j = 0; j < 14; j++) {
    let a = (j * TAU) / 14 + 0.03,
      span = (TAU / 14) * 0.9,
      pts = [];
    for (let k = 0; k <= 5; k++) {
      let v = a + (k * span) / 5;
      pts.push([Math.cos(v) * 3.94, Math.sin(v) * 3.94]);
    }
    for (let k = 5; k >= 0; k--) {
      let v = a + (k * span) / 5;
      pts.push([Math.cos(v) * 3.28, Math.sin(v) * 3.28]);
    }
    plate(g, pts, 0.94, 0.42, j % 5 === 0 ? M.edge : M.iron, 0.053);
    let mid = a + span / 2;
    bolt(g, Math.cos(mid) * 3.65, Math.sin(mid) * 3.65, 1, 0.142);
    for (let k of [-1, 1]) {
      let aa = mid + k * 0.13;
      rod(
        g,
        [Math.cos(aa) * 3.48, Math.sin(aa) * 3.48, 1.005],
        [Math.cos(aa) * 3.79, Math.sin(aa) * 3.79, 1.005],
        0.032,
        M.black,
        5
      );
    }
  }
  ring(g, 0, 0, 0.95, 3.085, 0.174, armourPaint.brass, "z", 80);
  ring(g, 0, 0, 0.95, 2.96, 0.044, armourPaint.brass, "z", 80);
  const hearth = new T.ShaderMaterial({
    vertexShader:
      "varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec2 st;void main(){
      vec2 d=2.*st-1.;float r=clamp(length(d),0.,1.);
      float lava=pow(1.-r,4.45), fillet=.09*exp(-75.*abs(r-.965));
      vec3 light=mix(vec3(.092,.006,.0025),vec3(3.60,.66,.032),lava)+vec3(fillet,.024*fillet,0.);
      gl_FragColor=vec4(light,1.);}`,
  });
  const dishDepth = (r) => -0.57 + 0.99 * (r / 3.04) ** 1.72;
  const points = [],
    tris = [],
    coords = [],
    columns = 81;
  for (let j = 0; j <= 15; j++)
    for (let i = 0; i < columns; i++) {
      const r = 0.025 + (3.02 * j) / 15,
        a = (TAU * i) / (columns - 1),
        x = r * Math.cos(a),
        y = r * Math.sin(a);
      points.push(x, y, dishDepth(r));
      coords.push(0.5 + x / 6.09, 0.5 + y / 6.09);
      if (i && j) {
        const d = j * columns + i;
        tris.push(d - columns - 1, d - 1, d, d - columns - 1, d, d - columns);
      }
    }
  mesh(g, surfaceGeo(points, tris, coords), hearth);
  const throat = new T.LatheGeometry(
    [
      [3.09, 0.98],
      [2.95, 0.89],
      [2.92, 0.68],
      [2.94, 0.46],
      [3.02, 0.29],
    ].map((q) => new T.Vector2(...q)),
    96
  );
  mesh(g, throat, armourPaint.brass).rotation.x = Math.PI / 2;
  turbine = group(g, 0, 0, 0);
  turbine.userData.moving = true;
  const vanes = new T.ShaderMaterial({
    side: T.DoubleSide,
    uniforms: { time: clockUniform },
    vertexShader: `
      varying vec2 st;
      varying vec3 worldN, worldP;
      void main() {
        st = uv;
        worldP = (modelMatrix * vec4(position, 1.)).xyz;
        worldN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldP, 1.);
      }`,
    fragmentShader: `
      uniform float time;
      varying vec2 st;
      varying vec3 worldN, worldP;
      void main() {
        float span = clamp(st.y, 0., 1.);
        float chord = clamp(st.x, 0., 1.);
        float wall = 1. - step(0., st.x);
        vec3 N = normalize(worldN);
        vec3 E = normalize(cameraPosition - worldP);
        vec3 L = normalize(vec3(-.62, .69, .57));
        float glint = pow(max(0., dot(N, normalize(E + L))), 33.);
        float ridge = exp(-6. * abs(chord - .29));
        float toolMarks = .976 + .024 * cos(span * 310.);
        vec3 heat = mix(vec3(.137,.010,.0033),vec3(3.66,.73,.041),exp(-6.87*span));
        heat *= (.46 + .54 * ridge) * (1. + .052 * sin(2.2 * time));
        vec3 face = heat * toolMarks + glint * vec3(.49,.25,.11);
        face = mix(face, vec3(.109,.012,.005) + .14 * glint, .62 * smoothstep(.90, .99, span));
        gl_FragColor = vec4(mix(face, heat * .22, wall), 1.);
      }`,
  });

  // Four chord stations describe the camber. Two recessed stations close the foil edges.
  for (let blade = 0; blade < 14; blade++) {
    const vertices = [],
      indices = [],
      uv = [],
      leadingEdge = [];
    const chords = [0, 0.28, 0.68, 1, 1, 0];
    for (let station = 0; station <= 18; station++) {
      const span = station / 18;
      const radius = 0.59 + 2.38 * span;
      const angle = (blade * TAU) / 14 + 0.92 * span + 0.21 * span * span;
      const width = 0.205 + 0.09 * Math.sin(Math.PI * span);
      for (let row = 0; row < chords.length; row++) {
        const chord = chords[row],
          a = angle + width * chord;
        const depth =
          dishDepth(radius) +
          0.064 +
          0.077 * chord +
          (0.091 + 0.112 * Math.sin(Math.PI * span)) * Math.sin(Math.PI * chord);
        const x = radius * Math.cos(a),
          y = radius * Math.sin(a);
        vertices.push(x, y, depth - (row >= 4 ? 0.085 : 0));
        uv.push(row >= 4 ? -1 : chord, span);
        if (row === 0) leadingEdge.push([x, y, depth + 0.008]);
        if (!station) continue;
        const current = station * chords.length + row;
        const adjacent = station * chords.length + ((row + 1) % chords.length);
        indices.push(
          current - chords.length,
          current,
          adjacent,
          current - chords.length,
          adjacent,
          adjacent - chords.length
        );
      }
    }
    mesh(turbine, surfaceGeo(vertices, indices, uv), vanes);
    hose(turbine, leadingEdge, 0.018, M.iron);
  }
  bake(turbine);
  const hub = group(g, 0, 0, -1.42);
  hub.scale.set(0.79, 0.79, 1);
  cyl(hub, 0, 0, 1, 0.78, 0.95, 0.44, M.bronze, "z", 48);
  coreDisc = emit(0xffdd8c, 7);
  ell(hub, 0, 0, 1.19, 0.265, 0.265, 0.135, coreDisc, 28);
  ring(hub, 0, 0, 1.21, 0.445, 0.039, M.hot);
  for (let j = 0; j < 8; j++) {
    let a = (TAU * j) / 8;
    bolt(hub, Math.cos(a) * 0.704, Math.sin(a) * 0.704, 1.24, 0.067);
  }
  ring(hub, 0, 0, 1.17, 0.78, 0.055, M.iron);
  ring(hub, 0, 0, 1.06, 0.93, 0.063, M.edge);
  // A gently convex crystal catchlight crosses the fixed glass, never the rotating rim.
  let crystal = new T.MeshPhysicalMaterial({
    color: 0xf3c48e,
    roughness: 0.13,
    metalness: 0.41,
    transparent: true,
    opacity: 0.095,
    depthWrite: false,
    clearcoat: 1,
  });
  ell(g, 0, 0, 0.93, 2.93, 2.93, 0.28, crystal, 48).castShadow = false;
  halo(g, 0, 0, 1.39, 6.24, 0xff711d, 0.174);
  coreLamp = new T.PointLight(new T.Color(0xff7929).multiplyScalar(0.19), 112, 13, 1.7);
  coreLamp.position.set(0, 0, 2.48);
  g.add(coreLamp);
}
const helmetBaseY = 64.68,
  helmetYaw = -0.112,
  chinEquator = 2.95,
  chinRadius = 2.93,
  chinRise = 2.8;
function chinBottom(x) {
  const u = Math.min(1, Math.abs(x) / chinRadius);
  return (
    chinEquator - chinRise + chinRise * (0.47 * u ** 1.34 + 0.53 * (1 - Math.sqrt(Math.max(0, 1 - u * u))))
  );
}
function collarDie(a, t) {
  const c = Math.cos(a),
    s = Math.sin(a);
  return V(
    (3.05 + 2.03 * t) * s,
    66.27 - 1.34 * c - (1.68 + 0.47 * c) * t + 0.084 * Math.sin(t * Math.PI),
    0.22 + (3.18 + 1.95 * t + 0.38 * t * Math.max(0, c)) * c
  );
}
function buildCollar() {
  const cradle = group(thorax);
  cyl(cradle, 0, 64.52, 0.03, 1.69, 2.06, 2.29, M.rubber, "y", 64);
  const seal = (a, t) => {
    const v = collarDie(a, 0);
    v.x *= 0.87 + 0.13 * t;
    v.z = 0.22 + (v.z - 0.22) * (0.875 + 0.125 * t);
    v.y += 0.29 * (1 - t) - 0.078 * Math.sin(Math.PI * t);
    return v;
  };
  shellPanel(cradle, seal, [-Math.PI, Math.PI - 0.0001], [0, 1], M.rubber, {
    nu: 100,
    nv: 5,
    sign: -1,
    thick: 0.44,
    bevel: 0.038,
  });
  for (const [lo, hi] of [
    [0.08, 0.17],
    [0.69, 0.76],
  ])
    shellPanel(cradle, seal, [-Math.PI, Math.PI - 0.0001], [lo, hi], M.iron, {
      nu: 96,
      nv: 2,
      sign: -1,
      lift: 0.035,
      thick: 0.083,
      bevel: 0.012,
    });
  shellPanel(cradle, collarDie, [-Math.PI, Math.PI - 0.0001], [0, 1], M.dark, {
    nu: 100,
    nv: 9,
    sign: -1,
    lift: -0.095,
    thick: 0.42,
  });
  const joints = [-Math.PI, -2.43, -1.86, -1.27, -0.8, -0.37, 0.37, 0.8, 1.27, 1.86, 2.43, Math.PI];
  for (let i = 1; i < joints.length; i++) {
    const u = [joints[i - 1] + 0.006, joints[i] - 0.006];
    shellPanel(cradle, collarDie, u, [0.018, 0.985], i % 3 === 0 ? armourPaint.mid : armourPaint.blue, {
      sign: -1,
      thick: 0.38,
      bevel: 0.061,
    });
    shellPanel(cradle, collarDie, u, [0.003, 0.095], armourPaint.navy, {
      sign: -1,
      lift: 0.048,
      thick: 0.18,
      bevel: 0.026,
    });
    for (const a of [u[0] + 0.061, u[1] - 0.063])
      bolt(surfaceSeat(cradle, collarDie, a, 0.885, -1, 0.028), 0, 0, 0, 0.06);
  }
  for (const u of [
    [-0.137, -0.005],
    [0.005, 0.137],
  ])
    shellPanel(cradle, collarDie, u, [0.5, 1.034], armourPaint.mid, {
      sign: -1,
      nu: 5,
      nv: 8,
      lift: 0.066,
      thick: 0.28,
      bevel: 0.041,
    });
  const bonnet = group(cradle, 0, 64.75 * (1 - 0.73) - 0.13, 4.35 * (1 - 0.78) - 0.12);
  bonnet.scale.set(0.972, 0.73, 0.78);
  const cover = [
    [-1.3, 64.71],
    [-0.84, 65.11],
    [0, 65.71],
    [0.84, 65.11],
    [1.3, 64.71],
    [1.29, 64.13],
    [0.82, 63.82],
    [0, 63.68],
    [-0.82, 63.82],
    [-1.29, 64.13],
  ];
  const nose = (x, y) => 4.96 - 1.06 * (y - 64.1) - 0.181 * Math.abs(x);
  const vent = [
    [0.115, 65.18],
    [0.82, 64.75],
    [0.96, 64.47],
    [0.92, 64.4],
    [0.13, 64.52],
  ];
  const holes = [mirrored(vent, -1), vent];
  plate(bonnet, cover, -0.065, 0.69, M.dark, 0.057, nose, 7);
  plate(bonnet, cover, 0.084, 0.145, armourPaint.mid, 0.055, nose, 7, holes);
  for (const s of [-1, 1]) {
    for (let j = 0; j < 6; j++) {
      const x = 0.197 + j * 0.119,
        low = 64.53 - 0.019 * j,
        high = 65.1 - 0.078 * j,
        w = 0.027;
      sidePlate(
        bonnet,
        s,
        [
          [x - w, low],
          [x + w, low],
          [x + w, high],
          [x - w, high],
        ],
        0.059,
        0.147,
        M.iron,
        0.012,
        nose,
        3
      );
    }
  }
  plate(
    bonnet,
    [
      [-0.043, 65.62],
      [0.043, 65.62],
      [0.054, 63.77],
      [-0.055, 63.77],
    ],
    0.12,
    0.12,
    M.edge,
    0.017,
    nose,
    4
  );
  for (const s of [-1, 1]) {
    const seat = surfaceSeat(cradle, collarDie, s * 0.475, 0.717, -1, 0.037);
    seat.rotation.z += s * 0.075;
    cutbox(seat, 0, 0, 0, 1.61, 0.48, 0.2, M.iron, 0.082, 0.041);
    cutbox(seat, 0, 0, 0.104, 1.48, 0.375, 0.08, M.black, 0.048, 0.025);
    for (let k = 0; k < 6; k++)
      for (let j = 0; j < 2; j++)
        cutbox(seat, (k - 2.5) * 0.229, (j - 0.5) * 0.172, 0.152, 0.171, 0.116, 0.045, M.lamp, 0.018, 0.01);
    halo(seat, 0, 0, 0.19, 1.59, 0xe4eff5, 0.265, 1.9);
  }
}
let helmet;
function visorDepth(x, y) {
  const a = Math.abs(x);
  return (
    3.24 - 0.138 * a * a - 0.65 * Math.max(0, a - 1.58) - 0.89 * Math.max(0, a - 2.04) + 0.065 * (y - 3.62)
  );
}
function jawDepth(x, y) {
  return visorDepth(x, y) + 0.07 - 0.18 * Math.max(0, 2.82 - y) ** 1.64;
}
function cheekDepth(x, y) {
  return jawDepth(x, y) + 0.13 + 0.15 * Math.max(0, 2.5 - y);
}
function buildHelmet() {
  const h = group(thorax, 0, helmetBaseY, 0.2);
  helmet = h;
  h.rotation.y = helmetYaw;
  h.scale.set(0.865, 0.897, 0.885);
  // Close-spaced elliptical stations produce a continuously rounded chin,
  // with no flat bevel crossing the lowest point.
  const body = [];
  for (let i = 0; i <= 24; i++) {
    const a = 0.025 + ((Math.PI / 2 - 0.025) * i) / 24,
      span = Math.sin(a);
    body.push([chinBottom(chinRadius * span), 2.74 * span, 2.32 * span, 0, -0.61]);
  }
  body.push([4.18, 2.84, 2.87, 0, -0.28], [4.68, 2.84, 3.0, 0, -0.17], [4.94, 2.73, 3.01, 0, -0.14]);
  const skullSection = Array.from({ length: 64 }, (_, i) => {
    const angle = (i * TAU) / 64;
    return [Math.sin(angle), Math.cos(angle)];
  });
  loft(h, body, M.dark, skullSection);
  const c = texCanvas(640, 264),
    ct = c.getContext("2d"),
    grad = ct.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, "#514827");
  grad.addColorStop(0.21, "#c1ac61");
  grad.addColorStop(0.47, "#e6d68d");
  grad.addColorStop(0.78, "#b99b47");
  grad.addColorStop(1, "#725925");
  ct.fillStyle = grad;
  ct.fillRect(0, 0, c.width, c.height);
  for (let bar = 0; bar < 32; bar++) {
    ct.fillStyle = bar % 7 < 2 ? "rgba(255,237,172,.15)" : "rgba(34,56,19,.12)";
    ct.fillRect(bar * 20, 0, bar % 4 === 0 ? 7 : 2, c.height);
  }
  const edgeShade = ct.createLinearGradient(0, 0, 640, 0);
  edgeShade.addColorStop(0, "#253823a8");
  edgeShade.addColorStop(0.25, "#27351900");
  edgeShade.addColorStop(0.78, "#27351900");
  edgeShade.addColorStop(1, "#273519b8");
  ct.fillStyle = edgeShade;
  ct.fillRect(0, 0, c.width, c.height);
  ct.lineWidth = 1.05;
  ct.strokeStyle = "#86773e";
  for (let j = -2; j < 31; j++)
    for (let i = -2; i < 62; i++) {
      let r = 6.3,
        x = (i + (j & 1) * 0.5) * r * Math.sqrt(3),
        y = j * r * 1.5;
      ct.beginPath();
      for (let k = 0; k <= 6; k++) {
        let a = (k * TAU) / 6 + Math.PI / 2;
        let xx = x + r * Math.cos(a),
          yy = y + r * Math.sin(a);
        k ? ct.lineTo(xx, yy) : ct.moveTo(xx, yy);
      }
      ct.stroke();
    }
  const lensGrid = fromCanvas(c, false, true);
  // Use the same droplet slopes on the outer laminate and the surrounding armour.
  // The illuminated grid remains sharp underneath the wet specular surface.
  const wetPane = texCanvas(beads.image.width, beads.image.height);
  const wetPixels = beads.image.getContext("2d").getImageData(0, 0, wetPane.width, wetPane.height);
  for (let i = 0; i < wetPixels.data.length; i += 4) {
    const nx = (128 - wetPixels.data[i + 1]) / 127,
      ny = (wetPixels.data[i + 2] - 128) / 127;
    const scale = 127.5 / Math.hypot(nx, ny, 1);
    wetPixels.data[i] = 127.5 + nx * scale;
    wetPixels.data[i + 1] = 127.5 + ny * scale;
    wetPixels.data[i + 2] = 127.5 + scale;
  }
  wetPane.getContext("2d").putImageData(wetPixels, 0, 0);
  const rainNormals = fromCanvas(wetPane, true);
  rainNormals.repeat.set(1.56, 0.64);
  const visorMat = new T.MeshPhysicalMaterial({
    map: lensGrid,
    color: 0xc5a560,
    emissiveMap: lensGrid,
    emissive: 0xffe39a,
    emissiveIntensity: 0.35,
    metalness: 0.53,
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.085,
    clearcoatNormalMap: rainNormals,
    normalMap: rainNormals,
    normalScale: new T.Vector2(0.47, 0.47),
    side: T.DoubleSide,
  });
  // Tall floodlights reflect in the wet, compound-curved glass. The reflection
  // is evaluated in world directions, so it travels across the grid as the eye moves.
  visorMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      vec3 opticR=inverseTransformDirection(reflect(-normalize(vViewPosition),normal),viewMatrix);
      float azimuth=atan(opticR.x,opticR.z),elevation=asin(clamp(opticR.y,-1.,1.));
      float slitA=exp(-pow(abs(azimuth+.68)/.089,2.))*exp(-pow(abs(elevation+.16)/.76,4.));
      float slitB=exp(-pow(abs(azimuth-.98)/.075,2.))*exp(-pow(abs(elevation+.12)/.71,4.));
      float skyGlow=.17*exp(-pow(abs(elevation-.56)/.29,2.));
      outgoingLight+=vec3(2.86,2.27,1.12)*(slitA+.81*slitB)+skyGlow*vec3(.85,.88,.75);
      #include <opaque_fragment>`
    );
  };
  // The brow tip and central lower arch are part of a single uninterrupted window.
  // Heights are measured upward from the chin in the six-metre head envelope.
  const aperture = [
    [0, 3.48, 2.85],
    [0.115, 3.48, 2.84],
    [0.37, 3.75, 2.78],
    [0.72, 3.92, 2.63],
    [1.08, 4.05, 2.43],
    [1.4, 4.18, 2.23],
    [1.52, 4.23, 2.17],
    [1.63, 4.28, 2.47],
    [1.86, 4.38, 2.63],
    [2.14, 4.51, 2.93],
    [2.36, 4.61, 3.19],
    [2.51, 4.59, 3.46],
  ];
  function rimAt(x, which) {
    const a = Math.abs(x);
    for (let j = 1; j < aperture.length; j++) {
      const p = aperture[j - 1],
        q = aperture[j];
      if (a <= q[0]) return mix(p[which], q[which], (a - p[0]) / (q[0] - p[0]));
    }
    return aperture[aperture.length - 1][which];
  }
  const stations = aperture
    .slice(1)
    .reverse()
    .map(([x, hi, lo]) => [-x, hi, lo])
    .concat(aperture);
  const arc = [0],
    v = [],
    idx = [],
    uv = [];
  for (let i = 1; i < stations.length; i++) {
    const x = stations[i][0],
      prev = stations[i - 1][0];
    arc.push(arc[i - 1] + Math.hypot(x - prev, visorDepth(x, 3.6) - visorDepth(prev, 3.6)));
  }
  const rows = 7;
  stations.forEach(([x, hi, lo], i) => {
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1),
        y = mix(lo, hi, t);
      const camber = 0.128 * (hi - lo) * t * (1 - t);
      v.push(x, y, visorDepth(x, y) + camber);
      uv.push(arc[i] / arc.at(-1), (y - 1.88) / 2.96);
      if (i && j) {
        const d = i * rows + j,
          b = d - 1,
          c = d - rows,
          a = c - 1;
        idx.push(a, b, d, a, d, c);
      }
    }
  });
  mesh(h, surfaceGeo(v, idx, uv), visorMat);

  // A formed crown spans the entire depth; its central strip follows the
  // longitudinal arch from the forehead lamp to the rear heat-exchanger cover.
  function crown(beta, theta, lift) {
    const x = 2.97 * Math.sin(beta),
      sinB = Math.sin(beta),
      c = Math.cos(beta),
      t = Math.sin(theta);
    const edge = 4.54 + 0.36 * sinB * sinB;
    const y0 = edge - (0.12 * (1 - t)) / 2 + (1.41 - 0.29 * sinB * sinB) * c * Math.cos(theta);
    const z0 = -0.05 + (t < 0 ? 3.4 : 3.34) * c * t;
    const atEdge = Math.min(2.51, Math.abs(x)),
      front = Math.max(0, t) ** 4;
    const upperY = rimAt(atEdge, 1) + 0.375 + 0.17 * (1 - Math.min(1, Math.abs(x)));
    const depth = browDepth(x, upperY) - 0.055;
    return V(
      x,
      y0 + (upperY - edge) * front + lift,
      z0 + (depth - (-0.05 + 3.34 * c)) * front + lift * t * 0.7
    );
  }
  for (const s of [-1, 1]) {
    const cap = (u, v) => crown(s * u, v, 0),
      sign = -s;
    shellPanel(h, cap, [0.073, 1.535], [-Math.PI / 2, Math.PI / 2], M.dark, {
      sign,
      nu: 26,
      nv: 40,
      thick: 0.13,
      lift: -0.161,
      bevel: 0.03,
    });
    for (const [lo, hi, v0, v1] of [
      [0.077, 0.712, -1.566, 0.12],
      [0.077, 0.712, 0.128, 1.568],
      [0.718, 1.534, -1.566, 0.24],
      [0.718, 1.534, 0.88, 1.568],
      [1.204, 1.534, 0.244, 0.875],
    ]) {
      shellPanel(h, cap, [lo, hi], [v0, v1], armourPaint.blue, {
        sign,
        nu: 12,
        nv: 21,
        thick: 0.18,
        bevel: 0.035,
      });
    }
    for (let j = 0; j < 5; j++)
      shellPanel(h, cap, [0.735, 1.185], [0.29 + j * 0.109, 0.33 + j * 0.109], M.iron, {
        sign,
        nu: 8,
        nv: 2,
        lift: -0.092,
        thick: 0.066,
        bevel: 0.012,
      });
    shellPanel(h, cap, [0.156, 0.621], [-0.53, 0.067], armourPaint.mid, {
      sign,
      nu: 9,
      nv: 8,
      lift: 0.068,
      thick: 0.13,
      bevel: 0.068,
    });
  }
  const hood = (u, v) => crown(u, v, 0);
  shellPanel(h, hood, [-0.085, 0.085], [-1.568, 1.568], M.rubber, {
    sign: -1,
    nu: 6,
    nv: 43,
    lift: -0.03,
    thick: 0.16,
  });
  shellPanel(h, hood, [-0.066, 0.066], [-1.564, 1.558], armourPaint.red, {
    sign: -1,
    nu: 5,
    nv: 42,
    lift: 0.043,
    thick: 0.159,
    bevel: 0.028,
  });

  // The broad brow is one stamping; the short central flat is the end of its beak.
  const browBottom = stations.map(([x, y]) => [x, y - 0.018]);
  const upper = stations
    .slice()
    .reverse()
    .map(([x, y]) => [x, y + 0.35 + 0.17 * (1 - Math.min(1, Math.abs(x)))]);
  const brow = [
    [-2.99, 4.53],
    [-2.72, 4.57],
    ...browBottom,
    [2.72, 4.57],
    [2.99, 4.53],
    [3.0, 4.86],
    [2.73, 4.99],
    ...upper,
    [-2.73, 4.99],
    [-3.0, 4.86],
  ];
  function browDepth(x, y) {
    return visorDepth(x, y) + 0.305 + 0.06 * (1 - Math.min(1, Math.abs(x)));
  }
  plate(h, brow, 0, 0.49, armourPaint.mid, 0.058, browDepth, 5);
  for (const s of [-1, 1]) {
    const fine = aperture.filter((p) => p[0] >= 0.115).map(([x, y]) => [x, y + 0.235]);
    const trim = [
      ...fine,
      [2.81, 4.8],
      [2.8, 4.9],
      ...fine
        .slice()
        .reverse()
        .map(([x, y]) => [x, y + 0.071]),
    ];
    sidePlate(h, s, trim, 0.067, 0.108, armourPaint.light, 0.026, browDepth, 4);
    for (const x of [0.89, 1.73, 2.55]) {
      const y = rimAt(x, 1) + 0.237;
      bolt(h, s * x, y, browDepth(x, y) + 0.077, 0.052);
    }
  }

  const chinOutline = [];
  for (let i = 0; i <= 64; i++) {
    const angle = mix(-Math.PI / 2, Math.PI / 2, i / 64);
    chinOutline.push([chinRadius * Math.sin(angle), chinBottom(chinRadius * Math.sin(angle))]);
  }
  chinOutline.push([2.76, 3.24], [2.53, 3.12]);
  for (const [x, hi, lo] of stations.slice().reverse()) chinOutline.push([x, lo - 0.052]);
  chinOutline.push([-2.53, 3.12], [-2.76, 3.24]);
  const vents = [];
  for (const s of [-1, 1])
    for (let j = 0; j < 3; j++) {
      const x = 0.99 + j * 0.075,
        y = 1.14 + j * 0.32,
        w = 0.32 + j * 0.068;
      vents.push(
        [
          [-w, -0.043],
          [-w + 0.036, -0.079],
          [w - 0.032, -0.079],
          [w, -0.045],
          [w, 0.044],
          [w - 0.034, 0.079],
          [-w + 0.034, 0.079],
          [-w, 0.041],
        ].map(([a, b]) => [s * (x + a), y + b - 0.335 * a])
      );
      const socket = group(h, s * x, y, jawDepth(x, y) - 0.31);
      socket.rotation.z = -s * 0.324;
      cutbox(socket, 0, 0, 0, w * 2 + 0.17, 0.245, 0.1, M.black, 0.048, 0.023);
      box(socket, 0, -0.012, 0.073, w * 1.79, 0.034, 0.06, M.iron);
    }
  plate(h, chinOutline, 0, 0.66, armourPaint.blue, 0.044, jawDepth, 3, vents);
  // Both lower valleys rise into the continuous centre arch.
  const lipUpper = stations.map(([x, hi, lo]) => [x, lo + 0.027]);
  const lipLower = stations
    .slice()
    .reverse()
    .map(([x, hi, lo]) => [x, lo - 0.106]);
  plate(h, [...lipUpper, ...lipLower], 0.085, 0.14, M.iron, 0.016, visorDepth, 3);
  plate(
    h,
    [
      [-0.172, 2.74],
      [0.172, 2.74],
      [0.276, 2.4],
      [0.205, 0.62],
      [0.11, 0.42],
      [-0.11, 0.42],
      [-0.205, 0.62],
      [-0.276, 2.4],
    ],
    0.095,
    0.32,
    armourPaint.mid,
    0.072,
    (x, y) => jawDepth(x, y) + 0.095 * (1 - Math.min(1, Math.abs(x) / 0.34)),
    4
  );

  for (const s of [-1, 1]) {
    const shell = [
      [2.49, 4.55],
      [2.8, 4.74],
      [2.94, 4.57],
      [2.95, 3.02],
    ];
    for (let j = 0; j <= 20; j++) {
      const a = mix(Math.PI / 2, 0.5, j / 20);
      shell.push([chinRadius * Math.sin(a), chinBottom(chinRadius * Math.sin(a))]);
    }
    shell.push([1.36, 0.71], [1.49, 1.03], [2.06, 1.58], [2.38, 2.17], [2.48, 2.86]);
    sidePlate(h, s, shell, 0, 1.16, armourPaint.mid, 0.075, cheekDepth, 4);
    sidePlate(
      h,
      s,
      [
        [1.63, 0.91],
        [2.16, 1.38],
        [2.61, 2.04],
        [2.78, 2.67],
        [2.78, 3.15],
        [2.64, 2.91],
        [2.48, 2.13],
        [2.04, 1.51],
        [1.65, 1.09],
      ],
      0.079,
      0.095,
      armourPaint.red,
      0.021,
      cheekDepth,
      4
    );
    sidePlate(
      h,
      s,
      [
        [1.96, rimAt(1.96, 2)],
        [2.05, rimAt(2.05, 2)],
        [2.3, rimAt(2.3, 1)],
        [2.21, rimAt(2.21, 1)],
      ],
      0.068,
      0.135,
      M.dark,
      0.024,
      visorDepth,
      4
    );
    axle(h, s * 2.63, 2.64, -0.54, 0.81, 0.42, "x", M.edge);
    cyl(h, s * 2.57, 3.77, -0.1, 0.64, 0.71, 0.81, M.iron, "x");
  }
  const headLight = group(h);
  headLight.position.copy(crown(0, 1.12, 0.063));
  headLight.rotation.x = -0.79;
  lamp(headLight, 0, 0, 0, 0.16);
  halo(headLight, 0, 0, 0.19, 1.66, 0xe7f4ff, 0.41);
  lamp(h, -2.78, 4.12, 1.18, 0.084, armourPaint.green);
  halo(h, -2.78, 4.12, 1.36, 0.64, 0x54ff9a, 0.26);
  for (const s of [-1, 1]) {
    const seat = group(h);
    seat.position.copy(crown(s * 0.64, 1.11, 0.018));
    const across = crown(s * 0.64 + 0.001, 1.11, 0).sub(crown(s * 0.64 - 0.001, 1.11, 0));
    const fore = crown(s * 0.64, 1.111, 0).sub(crown(s * 0.64, 1.109, 0));
    seat.quaternion.setFromUnitVectors(V(0, 0, 1), fore.cross(across).normalize());
    bolt(seat, 0, 0, 0, 0.105);
  }
  for (const s of [-1, 1]) {
    const temple = group(h, s * 2.72, 2.99, -0.44);
    temple.rotation.y = (s * Math.PI) / 2;
    for (let k = 0; k < 5; k++)
      box(temple, -0.76 + k * 0.28, 0.58, 0.18, 0.105, 0.49, 0.081, M.iron).rotation.z = 0.26;
    decal(temple, 0, -0.07, 0.223, 1.26, 0.38, writing(["OPTIC  /  07"]));
    cyl(temple, 0.78, 0.04, 0.2, 0.096, 0.096, 0.062, M.iron, "z", 16);
  }
  splashAt(h, 0, 5.9, 0, 2.5, 2.3);
  dripPoint(h, -0.61, 0.23, jawDepth(0.61, 0.23) + 0.035, 2);
  h.updateWorldMatrix(true, false);
  return headLight.localToWorld(V(0, 0, 0.2));
}
buildTrunk();
buildReactor();
const helmetLamp = buildHelmet();
