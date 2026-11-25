const ship = group(scene, -176, 0, -42.3);
ship.userData.collision = true;
ship.rotation.y = 0.095;
function hullBand(p, stations, top, bottom, mat) {
  let v = [],
    idx = [];
  for (let s of [-1, 1]) {
    let k = v.length / 3;
    stations.forEach(([x, w, h], i) => {
      v.push(x, bottom + (h - 22) * 0.15, s * w * 0.92, x, h + top - 22, s * w);
      if (i) {
        let a = k + i * 2;
        idx.push(a - 2, a, a - 1, a, a + 1, a - 1);
      }
    });
  }
  mat.side = T.DoubleSide;
  mesh(p, surfaceGeo(v, idx), mat);
}
const shipStations = [
  [-150, 8.1, 21.81],
  [-144, 13.36, 22],
  [-123, 15.51, 22],
  [-75, 15.55, 22],
  [50, 15.55, 22],
  [94, 14.76, 22.3],
  [122, 11.33, 23.49],
  [139, 6.39, 24.27],
  [150, 0.37, 25.23],
];
hullBand(ship, shipStations, 22, 11.8, H.hull);
hullBand(
  ship,
  shipStations.map(([x, w]) => [x, w * 0.918, 12.22]),
  22,
  6.02,
  H.keel
);
let vd = [],
  ind = [];
shipStations.forEach(([x, w, h], i) => {
  vd.push(x, h, -w, x, h, w);
  if (i) {
    let a = 2 * i;
    ind.push(a - 2, a - 1, a, a - 1, a + 1, a);
  }
});
mesh(ship, surfaceGeo(vd, ind), H.wet);
for (let s of [-1, 1]) {
  for (let i = 1; i < shipStations.length; i++) {
    let [xa, wa, ya] = shipStations[i - 1],
      [xb, wb, yb] = shipStations[i];
    let a = V(xa, ya, s * wa),
      b = V(xb, yb, s * wb);
    rod(ship, a, b, 0.14, H.silver);
    if (xb > 55) fence(ship, a, b, 0.95, H.rail);
    rod(ship, [xa, ya - 1.27, s * (wa * 0.984)], [xb, yb - 1.27, s * wb * 0.984], 0.088, H.ivory);
  }
  decal(
    ship,
    79.21,
    19.02,
    s * 15.09,
    18.66,
    2.34,
    writing(["KAIYO MARU", "Y O K O H A M A"], "#cfcdbb"),
    0,
    s === 1 ? 0.022 : Math.PI - 0.022
  );
  for (let j = 0; j < 6; j++)
    box(ship, 125.5, 14.03 + j * 0.68, s * (9.2 + j * 0.057), 0.94, 0.13, 0.11, H.ivory);
}
for (let i = 0; i < 16; i++) {
  let x = -132 + i * 14.06;
  if (Math.abs(x - 66.5) < 15) continue;
  for (let j = -3; j <= 3; j++) {
    let levels = i > 11 ? 1 + Math.floor(rand() * 2) : 2 + Math.floor(rand() * 3);
    if ((i + j + 2) % 9 === 0 && levels < 3) continue;
    for (let k = 0; k < levels; k++) can(ship, x, 22.11 + k * 2.61, j * 2.54);
  }
}
// Accommodations block, wing bridges, and funnel.
for (let j = 0; j < 4; j++) {
  let w = 14.84 - j * 0.45,
    d = 24.09 - j * 0.85;
  box(ship, 66.5, 23.54 + j * 2.76, 0, w, 2.73, d, H.ivory);
  box(ship, 66.5, 24.99 + j * 2.76, 0.0, w + 0.79, 0.24, d + 0.76, H.silver);
  for (let k = -2; k <= 2; k++)
    box(
      ship,
      66.48 + k * 2.54,
      23.68 + j * 2.76,
      d * 0.5 + 0.028,
      1.21,
      0.94,
      0.047,
      (j + k) % 3 ? H.window : H.glass
    );
  for (let k = -3; k <= 3; k++)
    box(ship, 66.5 + w * 0.5 + 0.03, 23.7 + j * 2.76, k * 2.63, 0.06, 0.9, 1.0, H.glass);
}
cutbox(ship, 66.66, 34.24, 0, 17.7, 2.9, 25.79, H.ivory, 0.45, 0.12);
for (let j = -3; j <= 3; j++)
  box(ship, 66.6 + j * 2.49, 34.68, 12.98, 2.06, 1.3, 0.059, j % 3 ? H.glass : H.window);
box(ship, 66.56, 35.88, 0, 18.62, 0.39, 26.43, H.ivory);
fence(ship, [57.47, 36.08, 13.05], [75.7, 36.08, 13.05], 0.91, H.rail);
cyl(ship, 65.22, 40.07, 0, 0.36, 0.75, 8.21, H.silver);
beam(ship, [62.73, 36.1, 1.5], [65.22, 43.99, 0], 0.42, 0.43, H.silver);
box(ship, 65.2, 41.86, 0, 6.61, 0.44, 0.49, H.ivory);
box(ship, 65.22, 44.52, 0, 4.43, 0.35, 0.3, H.silver);
cutbox(ship, 52.6, 27.65, -3.56, 6.17, 11.13, 5.67, H.crane, 0.55, 0.15);
cutbox(ship, 52.61, 33.14, -3.56, 6.21, 1.63, 5.78, H.hull, 0.54, 0.11);
for (let j = 0; j < 7; j++) {
  cyl(ship, 109 + j * 2.95, 23.16 + j * 0.032, 0, 0.63, 0.77, 1.63, H.steel);
  cyl(ship, 109 + j * 2.95, 24.01 + j * 0.032, 0, 0.83, 0.73, 0.24, H.rail);
}
for (let xx of [29, 89, 130]) {
  cyl(ship, xx, 27.26, 3.1, 0.13, 0.34, 8.85, H.silver, "y", 12);
  box(ship, xx, 31.68, 3.1, 3.13, 0.24, 0.4, H.silver);
  lamp(ship, xx + 1.27, 31.55, 3.14, 0.22, M.gold);
  halo(ship, xx + 1.27, 31.6, 3.46, 3.4, 0xffb56c, 0.54);
}
vesselFittings(ship);
bake(ship);
const aircraft = [],
  flightMats = {
    skin: coat(0x34444a, 0.68, 0.32),
    panel: coat(0x4f6266, 0.67, 0.3),
    glass: new T.MeshPhysicalMaterial({
      color: 0x203b4d,
      metalness: 0.56,
      roughness: 0.105,
      clearcoat: 1,
      clearcoatRoughness: 0.09,
      side: T.DoubleSide,
    }),
    rubber: standard(0x172127, 0.12, 0.59),
  };
function aircraftBody(p, rows, mat) {
  const section = [
    [0, 1],
    [0.62, 0.86],
    [0.95, 0.48],
    [1, -0.07],
    [0.8, -0.58],
    [0.34, -0.94],
    [-0.34, -0.94],
    [-0.8, -0.58],
    [-1, -0.07],
    [-0.95, 0.48],
    [-0.62, 0.86],
  ];
  let v = [],
    idx = [],
    n = section.length;
  rows.forEach(([z, y, w, h], j) =>
    section.forEach(([xx, yy], i) => {
      v.push(xx * w, y + yy * h, z);
      if (j) {
        let a = (j - 1) * n + i,
          b = (j - 1) * n + ((i + 1) % n);
        idx.push(a, a + n, b + n, a, b + n, b);
      }
    })
  );
  for (let j = 1; j < n - 1; j++)
    idx.push(0, j + 1, j, (rows.length - 1) * n, (rows.length - 1) * n + j, (rows.length - 1) * n + j + 1);
  mat.side = T.DoubleSide;
  return mesh(p, surfaceGeo(v, idx), mat);
}
function helicopter(pos, heading, call, scale, target) {
  let g = group(scene, ...pos);
  g.rotation.y = heading;
  g.scale.setScalar(scale);
  const A = flightMats;
  aircraftBody(
    g,
    [
      [-5.0, 0.69, 0.9, 0.89],
      [-3.29, 0.31, 1.42, 1.38],
      [-1.34, 0, 1.64, 1.61],
      [1.61, -0.03, 1.66, 1.61],
      [3.22, -0.15, 1.44, 1.36],
      [4.61, -0.43, 0.95, 0.94],
      [5.23, -0.52, 0.34, 0.4],
    ],
    A.skin
  );
  aircraftBody(
    g,
    [
      [-14.14, 2.35, 0.21, 0.28],
      [-12.09, 1.93, 0.3, 0.44],
      [-8.75, 1.32, 0.49, 0.6],
      [-4.43, 0.64, 0.87, 0.86],
    ],
    A.panel
  );
  let fin = group(g, 0, 0, -12.42);
  fin.rotation.y = Math.PI / 2;
  plate(
    fin,
    [
      [-0.94, 1.96],
      [1.73, 2.26],
      [2.48, 4.98],
      [1.67, 5.26],
      [-0.51, 3.51],
    ],
    0.18,
    0.38,
    A.skin,
    0.068
  );
  box(g, 0, 1.87, -9.96, 4.68, 0.13, 0.86, A.panel).rotation.x = -0.08;
  for (let s of [-1, 1]) {
    let panel = (pts) => {
      const ps = pts.map(([x, y, z]) => [s * x, y, z]);
      quad(g, ...ps, A.glass);
      for (let j = 0; j < 4; j++) rod(g, ps[j], ps[(j + 1) % 4], 0.059, A.panel, 6);
    };
    panel([
      [0.12, -0.1, 4.99],
      [1.21, -0.2, 4.16],
      [1.31, 0.88, 2.68],
      [0.13, 1.48, 2.19],
    ]);
    panel([
      [1.29, -0.18, 4.11],
      [1.69, -0.05, 1.64],
      [1.47, 1.13, 1.35],
      [1.3, 0.89, 2.53],
    ]);
    panel([
      [1.69, -0.04, 1.38],
      [1.68, -0.03, -0.49],
      [1.52, 1.04, -0.58],
      [1.49, 1.12, 1.31],
    ]);
    panel([
      [1.66, -0.03, -0.77],
      [1.57, 0.03, -2.3],
      [1.38, 1.04, -2.49],
      [1.49, 1.02, -0.79],
    ]);
    let cabin = group(g, s * 1.64, -0.63, -0.76);
    cabin.rotation.y = (s * Math.PI) / 2;
    decal(cabin, 0, 0, 0.028, 2.61, 0.72, writing(["SAR " + call, "COASTAL AIR SERVICE"]));
    ell(g, s * 0.96, 1.29, -0.7, 0.65, 0.61, 2.32, A.panel, 16);
    cyl(g, s * 0.98, 1.38, -2.72, 0.45, 0.57, 0.98, M.iron, "z", 20);
    cyl(g, s * 0.98, 1.38, -3.21, 0.37, 0.38, 0.07, M.black, "z", 20);
    for (let z of [-2.18, 2.07]) {
      rod(g, [s * 1.13, -0.81, z], [s * 1.74, -2.08, z + 0.32], 0.129, H.silver);
      cyl(g, s * 1.79, -2.28, z + 0.32, 0.48, 0.48, 0.33, A.rubber, "x", 20);
      cyl(g, s * 1.96, -2.28, z + 0.32, 0.19, 0.19, 0.05, H.silver, "x", 12);
    }
    box(g, s * 1.51, -0.68, -2.19, 0.1, 0.28, 1.29, M.red);
    lamp(g, s * 1.64, 0.35, -2.48, 0.13, s === 1 ? emit(0x74d3ac, 5) : M.pilot, "x");
    halo(g, s * 1.75, 0.38, -2.47, 1.21, s === 1 ? 0x73d4b6 : 0xff5031, 0.41);
  }
  cyl(g, 0, 2.18, -0.26, 0.24, 0.33, 1.27, M.iron);
  cyl(g, 0, 2.78, -0.26, 0.49, 0.44, 0.31, A.skin);
  let rotor = group(g, 0, 2.91, -0.26);
  rotor.userData.moving = true;
  for (let j = 0; j < 5; j++) {
    let blade = group(rotor);
    blade.rotation.y = (j * TAU) / 5;
    let pl = plate(
      blade,
      [
        [0.35, -0.12],
        [1.85, -0.26],
        [8.23, -0.47],
        [8.54, -0.33],
        [8.57, -0.038],
        [1.94, 0.14],
        [0.35, 0.13],
      ],
      0,
      0.065,
      A.skin,
      0.023
    );
    pl.rotation.x = Math.PI / 2;
    box(blade, 8.29, 0, 0.21, 0.43, 0.047, 0.36, H.ivory);
  }
  rotorTrails(rotor);
  bake(rotor);
  let tr = group(g, 0.34, 2.67, -13.53);
  tr.userData.moving = true;
  for (let j = 0; j < 4; j++) {
    let b = group(tr);
    b.rotation.x = (j * TAU) / 4;
    box(b, 0.0, 0.87, 0, 0.064, 1.71, 0.18, A.skin);
    box(b, 0.0, 1.54, 0, 0.072, 0.26, 0.2, H.ivory);
  }
  bake(tr);
  ell(g, 0, -1.47, 2.11, 0.49, 0.45, 0.48, M.iron, 16);
  lamp(g, 0.0, -1.61, 2.45, 0.3, M.lamp);
  halo(g, 0.0, -1.59, 2.67, 3.06, 0xd2e9ff, 0.84);
  bake(g);
  let start = g.localToWorld(V(0, -1.64, 2.56)),
    dst = V(...target),
    cone = shaft(start, dst, 0xc6e2ff, 5.8, 0.215, call * 0.07);
  const searchLight = new T.SpotLight(0xc2ddfc, 1780, 98, 0.195, 0.67, 2);
  searchLight.position.copy(start);
  searchLight.target.position.copy(dst);
  scene.add(searchLight, searchLight.target);
  aircraft.push({
    g,
    rotor,
    tr,
    cone,
    searchLight,
    pos: V(...pos),
    heading,
    phase: call * 0.47,
    target: dst,
  });
}
helicopter([-38.3, 57.73, 7.8], 1.13, 12, 0.79, [-8.8, 52.2, 0.76]);
helicopter([39.71, 68.74, -26.42], -1.0, 24, 0.76, [6.1, 59.64, 1.94]);
// The three fixed projectors on the machine illuminate the rain above it.
const headBeam = shaft(helmetLamp, helmetLamp.clone().add(V(-0.65, 16.0, 18.9)), 0xe2eeff, 3.94, 0.22, 2);
for (const [start, end] of bodyProjectors) shaft(start, end, 0xe3efff, 3.76, 0.2, 3.3 + Math.sign(start.x));
// Per-light world radiance and a distance-corrected diffraction halo, in one draw call.
let pp = [],
  pc = [],
  ps = [],
  pb = [];
for (let l of pinLights) {
  pp.push(...l.v.toArray());
  pc.push(...l.col.toArray());
  ps.push(l.r);
  pb.push(l.blink);
}
let pg = new T.BufferGeometry();
for (let [key, arr, n] of [
  ["position", pp, 3],
  ["color", pc, 3],
  ["radius", ps, 1],
  ["blink", pb, 1],
])
  pg.setAttribute(key, new T.Float32BufferAttribute(arr, n));
const pixels = { value: 720 };
const pinMat = new T.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: T.AdditiveBlending,
  uniforms: { time: clockUniform, pixels },
  vertexShader: `attribute vec3 color;attribute float radius,blink;uniform float pixels,time;varying vec3 tint;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);
    gl_Position=projectionMatrix*mv;gl_PointSize=clamp(radius*pixels*projectionMatrix[1][1]/max(2.,-mv.z)*.89,2.,140.);
    float flash=blink>0.?.12+.88*pow(max(0.,sin(time*2.7+blink)),10.):1.;
    tint=color*flash*exp(-max(0.,-mv.z)*.0043);}`,
  fragmentShader: `varying vec3 tint;void main(){vec2 q=(gl_PointCoord-.5)*2.;float r=length(q);
    float f=exp(-r*7.8)+.28*exp(-r*r*16.)+.74*exp(-r*r*290.);
    f+=.12*exp(-abs(q.y)*70.-abs(q.x)*3.);
    gl_FragColor=vec4(tint,f*(1.-smoothstep(.74,1.,r)));}`,
});
const lightsInRain = new T.Points(pg, pinMat);
lightsInRain.renderOrder = 7;
scene.add(lightsInRain);
