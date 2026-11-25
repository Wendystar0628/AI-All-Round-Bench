"use strict";
// Service hardware follows the local face, including its draft angle.
const serialPlate = printMaterial("etched maker plate", 640, 262, (c) => {
  c.fillStyle = "#273237";
  c.fillRect(0, 0, 640, 262);
  c.strokeStyle = "#a2adae";
  c.lineWidth = 5;
  c.strokeRect(5, 5, 630, 252);
  c.fillStyle = "#dde0ce";
  c.font = "bold 59px Bahnschrift,Arial";
  c.fillText("PACIFIC HEAVY", 34, 76);
  c.font = "bold 23px Consolas";
  c.fillText("MARINE ENGINEERING DIVISION", 35, 112);
  c.fillRect(33, 130, 572, 3);
  c.font = "20px Consolas";
  c.fillText("UNIT   BD–07     /    RATED DEPTH  85 M", 35, 165);
  c.fillText("TYPE   DELTA IV  /    ASSEMBLY 0482", 35, 200);
  for (let i = 0; i < 80; i++) c.fillRect(35 + i * 6.47, 218, 1 + ((i * 7) % 4), 15);
});
const femurIndex = printMaterial("femoral pitch index", 256, 768, (c) => {
  c.strokeStyle = c.fillStyle = "#cbd1ca";
  c.lineWidth = 11;
  c.beginPath();
  c.moveTo(71, 69);
  c.lineTo(184, 69);
  c.lineTo(128, 122);
  c.closePath();
  c.stroke();
  c.fillStyle = "#bac1bb";
  c.font = "bold 23px Consolas";
  c.fillText("LD   /   07", 53, 47);
  for (let i = 0; i < 21; i++) c.fillRect(30, 256 + i * 21, i % 5 === 0 ? 71 : 31, i % 5 === 0 ? 7 : 5);
});
function seam(p, points, r, mat = M.dark) {
  for (let i = 1; i < points.length; i++) rod(p, points[i - 1], points[i], r, mat, 7);
}
function handle(p, x, y, z, w, h, lift = 0.16) {
  let a = V(x - w / 2, y - h / 2, z),
    b = V(x + w / 2, y + h / 2, z);
  let t = b.clone().sub(a).normalize();
  for (let v of [a, b]) {
    cyl(p, v.x, v.y, z + 0.038, 0.12, 0.17, 0.092, M.iron, "z", 10);
    rod(p, v, v.clone().add(V(0, 0, lift)), 0.073, M.edge, 8);
  }
  let q = a.clone().add(V(0, 0, lift));
  rod(p, q, b.clone().add(V(0, 0, lift)), 0.071, M.edge, 10);
}
function catchLock(p, x, y, z, angle = 0) {
  let g = group(p, x, y, z);
  g.rotation.z = angle;
  cutbox(g, 0, 0, 0, 0.47, 0.79, 0.13, M.dark, 0.085, 0.027);
  cutbox(g, 0, 0.035, 0.09, 0.25, 0.56, 0.1, M.edge, 0.053, 0.025);
  box(g, 0, 0.13, 0.17, 0.24, 0.15, 0.12, M.iron);
  rod(g, [-0.15, -0.25, 0.153], [0.15, -0.25, 0.153], 0.065, M.bronze, 8);
}
function exteriorChest() {
  for (const side of [-1, 1]) {
    const die = breastDie(side);
    for (const u of [0.58, 0.89, 1.29]) {
      shellPanel(thorax, die, [u - 0.079, u + 0.085], [0.069, 0.298], armourPaint.mid, {
        sign: side,
        nu: 5,
        nv: 4,
        thick: 0.13,
        lift: 0.061,
        bevel: 0.028,
      });
      const latch = surfaceSeat(thorax, die, u - 0.034, 0.123, side, 0.073);
      cutbox(latch, 0, 0, 0.017, 0.17, 0.21, 0.069, M.iron, 0.034, 0.017);
    }
  }
}
function armService(up, low, s, L) {
  for (let k of [-1, 1]) {
    let g = group(up, k * 2.24, -5.65, -0.28);
    g.rotation.y = (k * Math.PI) / 2;
    cutbox(g, 0, 0, 0, 2.99, 3.17, 0.57, armourPaint.mid, 0.54, 0.15);
    for (let j = 0; j < 4; j++)
      box(g, 0, -0.89 + j * 0.45, 0.35, 1.83, 0.12, 0.09, M.black).rotation.z = 0.035;
    piston(up, [k * 1.07, -8.18, 1.4], [k * 0.97, -11.64, 1.01], 0.232, M.bronze);
  }
  const bicep = (x, y) => 2.44 - 0.095 * x * x - 0.036 * Math.max(0, -y - 6) ** 2;
  const upperShell = [
    [-1.75, -3.73],
    [1.28, -3.3],
    [2.01, -4.41],
    [1.92, -7.81],
    [1.47, -9.23],
    [0.82, -9.8],
    [-0.94, -9.62],
    [-1.78, -8.71],
    [-1.97, -5.92],
  ];
  plate(up, upperShell, 0, 0.78, armourPaint.blue, 0.14, bicep, 6);
  const stripe = [
    [0.81, -3.68],
    [1.17, -3.6],
    [1.05, -6.58],
    [0.8, -9.38],
    [0.44, -9.47],
    [0.71, -6.42],
  ];
  sidePlate(up, -s, stripe, 0.121, 0.096, armourPaint.ivory, 0.024, bicep, 4);
  const tag = (x, y) => V(x, y, bicep(x, y) + 0.129);
  surfacePrint(
    up,
    tag,
    s < 0 ? [-1.46, -0.34] : [0.34, 1.46],
    [-4.94, -4.33],
    writing(["G 007", "SERVICE  /  BD"]),
    { lift: 0.013 }
  );
  for (const k of [-1, 1]) {
    const cheek = group(up, k * 1.85, -7.7, -0.15);
    cheek.rotation.y = (k * Math.PI) / 2;
    plate(
      cheek,
      [
        [-1.28, 0.93],
        [0.97, 1.13],
        [1.53, 0.29],
        [1.15, -2.1],
        [0.55, -2.96],
        [-0.38, -2.46],
        [-1.18, -0.68],
      ],
      0.19,
      0.65,
      armourPaint.mid,
      0.102,
      (x, y) => -0.054 * x * x,
      4
    );
  }
  const reverse = group(low);
  reverse.rotation.y = Math.PI;
  const aft = (x, y) => 2.61 + 0.08 * (y + 4) - 0.084 * x * x;
  plate(
    reverse,
    [
      [-2.02, -2.28],
      [-1.12, -1.81],
      [-0.86, -2.67],
      [0.91, -2.66],
      [1.25, -1.82],
      [2.11, -2.46],
      [2.13, -4.78],
      [1.71, -6.35],
      [-1.58, -6.42],
      [-2.23, -4.97],
    ],
    0.12,
    1.12,
    armourPaint.mid,
    0.136,
    aft,
    5
  );
  plate(
    reverse,
    [
      [-1.76, -6.12],
      [1.8, -6.12],
      [1.61, -8.32],
      [1.25, -L + 0.78],
      [-1.2, -L + 0.81],
      [-1.67, -8.76],
    ],
    0.068,
    0.78,
    armourPaint.navy,
    0.113,
    aft,
    5
  );
  sidePlate(
    reverse,
    s,
    [
      [1.45, -3.17],
      [1.88, -3.02],
      [1.88, -4.8],
      [1.57, -5.94],
      [1.18, -6.05],
    ],
    0.243,
    0.105,
    armourPaint.red,
    0.038,
    aft,
    4
  );
  const casing = group(low);
  casing.rotation.y = (s * Math.PI) / 2;
  const sections = [
    [-L + 0.4, 1.75],
    [-9.2, 2.3],
    [-5.1, 3.11],
    [-2.05, 3.23],
    [0.29, 2.94],
    [1.78, 2.8],
  ];
  const face = (x, y) => sectionValues(sections, y)[0] - 0.067 * x * x;
  const outline = [
    [1.4, 1.14],
    [1.74, 1.76],
    [2.14, 0.71],
    [2.27, -2.03],
    [2.16, -5.57],
    [1.72, -8.18],
    [1.16, -L + 0.63],
    [-1.12, -L + 0.77],
    [-1.87, -7.48],
    [-2.17, -5.86],
    [-2.01, -2.38],
    [-1.62, -1.28],
    [-1.29, -0.84],
    [-0.9, -1.33],
    [-0.42, -1.57],
    [0.28, -1.61],
    [0.91, -1.27],
    [1.31, -0.76],
    [1.42, 0.14],
  ].map(([x, y]) => [-s * x, y]);
  const channel = [
    [-0.46, -2.64],
    [-0.11, -1.91],
    [0.34, -2.21],
    [0.44, -3.46],
    [0.31, -5.72],
    [0.22, -8.61],
    [-0.18, -9.51],
    [-0.52, -8.79],
    [-0.68, -5.63],
    [-0.64, -3.26],
  ];
  plate(casing, outline, 0.058, 0.43, armourPaint.navy, 0.106, face, 5);
  plate(casing, outline, 0.243, 0.28, armourPaint.blue, 0.113, face, 6, [channel]);
  plate(casing, channel, 0.13, 0.18, M.iron, 0.04, face, 5);
  const bead = [
    [-0.39, -2.69],
    [-0.15, -2.25],
    [0.18, -2.49],
    [0.21, -3.37],
    [0.08, -7.91],
    [-0.15, -8.72],
    [-0.31, -8.19],
    [-0.39, -4.91],
  ];
  plate(casing, bead, 0.151, 0.16, armourPaint.mid, 0.048, face, 5);
  const deck = (x, y) => V(x, y, 0.336 + face(x, y));
  for (const [x, y] of [
    [-1.21, -1.81],
    [1.21, -2.18],
    [-1.54, -4.73],
    [1.38, -6.63],
    [-0.77, -9.41],
  ])
    bolt(surfaceSeat(casing, deck, x, y), 0, 0, 0, 0.071);
  for (const line of [
    [
      [-1.82, -3.05],
      [-1.08, -3.22],
      [-0.68, -3.26],
    ],
    [
      [0.46, -3.31],
      [1.04, -3.29],
      [1.89, -3.14],
    ],
    [
      [-1.72, -7.14],
      [-0.93, -7.34],
      [-0.54, -7.41],
    ],
    [
      [0.43, -7.39],
      [1.35, -7.2],
    ],
  ])
    hose(
      casing,
      line.map(([x, y]) => deck(x, y)),
      0.017,
      M.dark
    );
  surfacePrint(casing, deck, [0.61, 1.67], [-4.86, -4.38], serialPlate, { lift: 0.011 });
  const grip = surfaceSeat(casing, deck, 1.18, -6.16, 1, 0.057);
  handle(grip, 0, 0, 0.01, 0.4, 0.04, 0.083);
  surfacePrint(casing, deck, [-1.64, -0.81], [-5.96, -5.56], arrowPrint, { lift: 0.02 });
  for (let j = 0; j < 2; j++) catchLock(low, (j ? 1 : -1) * 1.41, -9.83, 1.96, 0.04);
  if (s < 0) {
    for (let k = 0; k < 3; k++)
      box(low, -0.67 + k * 0.41, -5.52, 2.42, 0.23, 0.34, 0.07, k < 2 ? M.bone : armourPaint.red).rotation.z =
        -0.3;
    let pts = [
      [-1.27, -6.08],
      [-1.46, -6.91],
      [-1.09, -9.19],
      [-0.81, -9.53],
    ];
    seam(
      low,
      pts.map(([x, y]) => [x, y, 2.66 + 0.09 * (y + 3) - 0.053 * x * x]),
      0.027,
      M.iron
    );
  }
}
exteriorChest();

// The rear shell carries its own service apertures, embossing and heat shielding.
function aftOutfit() {
  const hood = group(helmet);
  hood.rotation.y = Math.PI;
  const hatchCamber = (x, y) => -0.118 * x * x - 0.23 * Math.max(0, y - 3.52);
  const hatchInk = writing(["BD / 07"]).clone();
  hatchInk.side = T.FrontSide;
  for (let s of [-1, 1]) {
    sidePlate(
      hood,
      s,
      [
        [0.13, 4.89],
        [1.14, 4.97],
        [2.29, 4.17],
        [2.49, 2.56],
        [1.83, 1.64],
        [0.43, 1.25],
        [0.16, 1.92],
      ],
      3.13,
      0.57,
      armourPaint.blue,
      0.092,
      hatchCamber,
      4
    );
    louvers(hood, s * 0.99, 2.79, 3.13, 1.09, 1.39, 5, s * 0.09, M.black, M.iron);
    const stencil = new T.PlaneGeometry(1.24, 0.41, 12, 4);
    const pos = stencil.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = s * 1.09 + pos.getX(i),
        y = 3.99 + pos.getY(i);
      pos.setXYZ(i, x, y, 3.205 + hatchCamber(x, y));
    }
    stencil.computeVertexNormals();
    mesh(hood, stencil, hatchInk).castShadow = false;
    for (let i = 0; i < 2; i++)
      bolt(hood, s * (0.52 + i * 1.24), 1.97, 3.19 - 0.118 * (0.52 + i * 1.24) ** 2, 0.063);
    let side = group(helmet, s * 2.62, 3.32, -0.62);
    side.rotation.y = (s * Math.PI) / 2;
    plate(
      side,
      [
        [-1.17, 0.16],
        [-0.77, 1.18],
        [0.28, 1.47],
        [1.11, 1.03],
        [1.39, 0.23],
        [0.81, -0.39],
        [-0.81, -0.49],
      ],
      0.12,
      0.69,
      armourPaint.blue,
      0.084
    );
    plate(
      side,
      [
        [-0.91, 0.14],
        [-0.59, 0.84],
        [0.32, 1.12],
        [0.91, 0.66],
        [0.99, 0.26],
        [0.63, 0.1],
      ],
      0.23,
      0.2,
      armourPaint.mid,
      0.047
    );
    decal(side, s * 0.17, 0.79, 0.273, 0.96, 0.32, writing(["SENSOR", "ARRAY 07"]));
  }
}
aftOutfit();

// Thin, optically clear runnels follow the leading edges and break away below them.
const flowingFilm = new T.ShaderMaterial({
  uniforms: { time: clockUniform },
  transparent: true,
  depthWrite: false,
  side: T.DoubleSide,
  vertexShader: `varying vec3 surfaceN,eyeDir,wp;varying vec2 runUV;void main(){
 vec4 w=modelMatrix*vec4(position,1.);wp=w.xyz;surfaceN=normalize(mat3(modelMatrix)*normal);
 eyeDir=normalize(cameraPosition-w.xyz);runUV=uv;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: `uniform float time;varying vec3 surfaceN,eyeDir,wp;varying vec2 runUV;
 void main(){vec3 n=normalize(surfaceN),v=normalize(eyeDir);float grazing=pow(1.-abs(dot(v,n)),2.);
 float crest=pow(.5+.5*cos(runUV.x*37.-time*5.7+wp.x*.79),5.);
 float shine=pow(max(0.,dot(reflect(-v,n),normalize(vec3(-.4,.81,.51)))),13.);
 vec3 c=mix(vec3(.046,.087,.118),vec3(.68,.84,.94),clamp(shine+grazing*.67+crest*.23,0.,1.));
 gl_FragColor=vec4(c,(.14+shine*.45+grazing*.32+crest*.12)*(1.-smoothstep(.87,1.,runUV.x)));}`,
});
function runnel(p, points, r) {
  let o = hose(p, points, r, flowingFilm);
  o.castShadow = false;
}
for (let s of [-1, 1]) {
  runnel(
    helmet,
    [
      [2.72, 4.63],
      [2.85, 4.41],
      [2.87, 3.76],
      [2.86, 3.02],
      [2.77, 2.29],
      [2.61, 1.85],
      [2.39, 1.52],
      [2.09, 1.22],
      [1.65, 0.79],
    ].map(([x, y]) => [s * x, y, cheekDepth(x, y) + 0.075]),
    0.018
  );
  const shoulder = shoulderDie(s);
  runnel(
    thorax,
    [
      [14.47, 0.22],
      [14.51, 0.37],
      [14.58, 0.55],
      [14.62, 0.78],
      [14.62, 0.99],
    ].map(([x, t]) => shoulder(x, t).addScaledVector(surfaceNormal(shoulder, x, t, -s), 0.025)),
    0.019
  );
  runnel(
    thorax,
    [
      [15.4, 0.53],
      [15.42, 0.67],
      [15.44, 0.78],
      [15.42, 0.89],
      [15.41, 0.99],
    ].map(([x, t]) => shoulder(x, t).addScaledVector(surfaceNormal(shoulder, x, t, -s), 0.019)),
    0.022
  );
  const breast = breastDie(s);
  runnel(
    thorax,
    [
      [0.76, 0.85],
      [0.78, 0.7],
      [0.76, 0.52],
      [0.767, 0.38],
      [0.747, 0.21],
      [0.739, 0.004],
    ].map(([a, v]) => breast(a, v).addScaledVector(surfaceNormal(breast, a, v, s), 0.026)),
    0.018
  );
}
const reactorScale = printMaterial("BX-56 calibration ring", 1024, 1024, (c, w, h) => {
  c.translate(w * 0.5, h * 0.5);
  for (let k = 0; k < 112; k++) {
    let a = (TAU * k) / 112;
    c.save();
    c.rotate(a);
    c.fillStyle = k % 8 === 0 ? "#d4b27c" : "#b9b4a1";
    c.fillRect(-1.2, -420, 2.4, k % 8 === 0 ? 12 : 6);
    c.restore();
  }
  function legend(label, a, increment, r) {
    c.fillStyle = "#c5c6b5";
    c.font = "bold 13px Consolas,monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (let i = 0; i < label.length; i++) {
      c.save();
      c.rotate(a + (i - (label.length - 1) / 2) * increment);
      c.fillText(label[i], 0, -r);
      c.restore();
    }
  }
  legend("B X – 5 6    /    THERMAL ASSEMBLY", 0, 0.022, 485);
  legend("DANGER   //   ROTATING MASS", Math.PI, 0.024, 485);
  for (let j = 0; j < 14; j++) {
    c.save();
    c.rotate(((j + 0.85) * TAU) / 14);
    c.fillStyle = "#c0ad84";
    c.font = "bold 11px Consolas";
    c.textAlign = "center";
    c.fillText(String(j + 1).padStart(2, "0"), 0, -439);
    c.restore();
  }
  c.fillStyle = "#c76a48";
  c.beginPath();
  c.moveTo(-7, -444);
  c.lineTo(7, -444);
  c.lineTo(0, -424);
  c.fill();
});
decal(reactorMount, 0, 0, 1.005, 8.05, 8.05, reactorScale);
