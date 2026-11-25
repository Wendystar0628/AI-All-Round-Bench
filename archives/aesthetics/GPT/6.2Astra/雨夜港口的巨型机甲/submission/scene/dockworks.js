"use strict";
function accessGantry(c, id) {
  const deck = H.steel,
    rail = H.rail,
    bracket = H.silver;
  // Cantilever catwalks, handrails, sheaves and a five-flight access stair.
  for (let sign of [-1, 1]) {
    let x = sign * 4.2;
    box(c, x, 45.24, 12.42, 1.07, 0.19, 102.5, deck);
    fence(c, [sign * 4.65, 45.38, -38.45], [sign * 4.65, 45.38, 63.0], 0.89, rail);
    for (let z = -37; z < 64; z += 9.22)
      beam(c, [sign * 3.44, 44.71, z], [sign * 4.52, 45.23, z], 0.12, 0.16, bracket);
    for (let z of [59.33, 61.1]) box(c, sign * 3.54, 46.85, z, 0.82, 2.41, 0.71, H.ivory);
    cutbox(c, sign * 3.49, 46.5, 63.3, 1.12, 2.4, 0.88, H.crane, 0.18, 0.06);
    cyl(c, sign * 3.11, 46.42, 62.7, 0.86, 0.86, 0.38, H.steel, "x", 20);
    for (let j = 0; j < 3; j++) box(c, sign * 4.72, 49.14, -35.15 + j * 1.05, 0.13, 1.88, 0.41, H.steel);
    for (let z of [-31.66, -24.44]) {
      box(c, sign * 5.24, 47.27, z, 1.52, 0.18, 4.53, deck);
      fence(c, [sign * 5.88, 47.42, z - 2.18], [sign * 5.88, 47.42, z + 2.18], 1.01, rail);
    }
  }
  for (let i = 0; i < 5; i++) {
    let y = 9.48 + i * 7.12,
      x = -10.3 + i * 0.64,
      z0 = i % 2 === 0 ? -12.9 : -4.88,
      z1 = i % 2 === 0 ? -4.88 : -12.9,
      x1 = x + 0.65;
    box(c, x, y, z0, 2.16, 0.22, 1.79, deck);
    for (let side of [-1, 1]) {
      beam(c, [x + side * 0.7, y, z0], [x1 + side * 0.7, y + 7.12, z1], 0.14, 0.2, bracket);
      rod(c, [x + side * 0.79, y + 1.06, z0], [x1 + side * 0.79, y + 8.18, z1], 0.068, rail, 6);
      for (let j = 0; j < 4; j++) {
        let f = j / 3;
        rod(
          c,
          [mix(x, x1, f) + side * 0.79, y + 7.12 * f, mix(z0, z1, f)],
          [mix(x, x1, f) + side * 0.79, y + 7.12 * f + 1.06, mix(z0, z1, f)],
          0.044,
          rail,
          6
        );
      }
    }
    for (let j = 0; j < 18; j++) {
      let f = j / 17;
      box(c, mix(x, x1, f), y + 7.12 * f, mix(z0, z1, f), 1.56, 0.11, 0.45, deck);
    }
  }
  box(c, -5.68, 42.87, 9.8, 2.9, 0.24, 5.43, deck);
  fence(c, [-6.96, 43, 7.12], [-6.96, 43, 12.49], 1.01, rail);
  for (let j = 0; j < 3; j++) {
    let x = -1.23 + j * 1.23;
    cyl(c, x, 49.26, 4.24, 0.86, 0.86, 1.09, H.steel, "x", 18);
    for (let k = 0; k < 4; k++) ring(c, x - 0.42 + k * 0.24, 49.26, 4.24, 0.858, 0.043, bracket, "x", 18);
  }
  let cab = group(c, -5.22, 36.25, 12.41);
  cutbox(cab, 0, 0, 0, 3.29, 3.67, 3.88, H.ivory, 0.3, 0.08);
  for (let j of [-1, 1]) {
    box(cab, j * 0.71, 0.42, 1.966, 1.21, 1.53, 0.066, H.glass);
    box(cab, j * 1.664, 0.43, 0.09, 0.051, 1.58, 2.94, H.glass);
  }
  box(cab, 0, 2.0, 0, 3.88, 0.21, 4.41, H.crane);
  box(cab, 0, -1.43, 2.01, 2.65, 0.28, 0.16, M.black);
  for (let j of [-1, 1]) {
    box(cab, j * 0.99, -1.42, 2.1, 0.51, 0.17, 0.06, M.gold);
    pin(cab, j * 0.99, -1.4, 2.22, 2.91, 0xffb36a, 1.52);
  }
  decal(cab, 0, -0.98, 1.98, 2.49, 0.51, writing(["BERTH  0" + id], "#4c5350"));
  // Weatherproof serials on the seaward crosshead.
  cutbox(c, 0, 10.88, 15.84, 9.19, 1.17, 0.29, H.ivory, 0.13, 0.05);
  decal(c, 0, 10.91, 16.05, 7.69, 0.79, writing(["EAST TERMINAL   /   0" + id], "#353d3e"));
}
function vesselFittings(p) {
  const fit = H.rail;
  // Bridge wings project beyond the deckhouse and expose their supporting knees.
  for (let s of [-1, 1]) {
    cutbox(p, 66.62, 32.84, s * 13.65, 9.55, 0.54, 4.5, H.ivory, 0.49, 0.09);
    beam(p, [63.71, 29.99, s * 11.25], [63.71, 32.61, s * 15.38], 0.29, 0.34, H.ivory);
    beam(p, [70.11, 29.99, s * 11.25], [70.11, 32.61, s * 15.38], 0.29, 0.34, H.ivory);
    fence(p, [61.94, 33.15, s * 15.8], [71.28, 33.15, s * 15.8], 1.19, H.silver);
    fence(p, [71.28, 33.15, s * 15.8], [71.28, 33.15, s * 12.32], 1.19, H.silver);
    const launch = group(p, 51.66, 25.12, s * 11.24);
    launch.rotation.z = 0.06;
    ell(launch, 0, 0, 0, 4.57, 1.32, 1.48, H.crane, 24);
    ell(launch, 0.35, 0.67, 0, 3.44, 0.96, 1.22, H.orange, 24);
    for (let i = 0; i < 5; i++) box(launch, -1.78 + i * 0.91, 0.86, s * 1.12, 0.51, 0.39, 0.13, H.glass);
    for (let x of [48.78, 54.82]) {
      beam(p, [x, 22.1, s * 11.42], [x, 26.91, s * 12.48], 0.31, 0.37, H.ivory);
      beam(p, [x, 26.91, s * 12.48], [x, 27.48, s * 10.83], 0.29, 0.34, H.ivory);
      rod(p, [x, 27.48, s * 10.83], [x, 26.42, s * 10.83], 0.054, fit, 6);
    }
    for (let k = 0; k < 11; k++) {
      let x = 57.33 + k * 1.79;
      cyl(p, x, 30.37, s * 11.94, 0.26, 0.26, 0.12, H.glass, "z", 16);
    }
    for (let x = 1; x < 105; x += 8.45) {
      cutbox(p, x, 21.12, s * (15.31 - Math.max(0, x - 45) * 0.015), 0.76, 0.27, 0.15, H.rail, 0.13, 0.025);
    }
  }
  const bow = group(p, 126.85, 20.67, 10.05);
  bow.rotation.y = 0.36;
  cutbox(bow, 0, 0.0, -0.03, 2.39, 2.04, 0.39, H.keel, 0.57, 0.16);
  ell(bow, 0, 0.0, 0.12, 0.83, 0.75, 0.21, M.black, 16);
  rod(bow, [0, 0.39, 0.31], [0, -1.12, 0.35], 0.18, H.rail);
  rod(bow, [-0.56, -0.72, 0.37], [0, -1.13, 0.35], 0.15, H.rail);
  rod(bow, [0.57, -0.72, 0.36], [0, -1.13, 0.35], 0.15, H.rail);
  for (let i = 0; i < 4; i++)
    rod(p, [65.2, 42.92 - i * 0.18, 0], [52.97 - i * 1.08, 32.83, -5.21 + i * 0.88], 0.046, H.rail, 6);
  ell(p, 61.05, 37.02, 5.84, 0.87, 1.04, 0.87, H.ivory);
  cyl(p, 61.05, 36.3, 5.84, 0.41, 0.47, 0.9, H.silver);
  for (let j = 0; j < 3; j++) box(p, 65.2, 39.27 + j * 1.02, 0, 5.58 - j * 0.49, 0.17, 0.22, H.silver);
  for (let s of [-1, 1]) {
    rod(p, [65.22, 44.43, 0], [65.22, 36.11, s * 9.94], 0.043, fit, 6);
    rod(p, [89, 31.67, 3.1], [103.31, 22.64, s * 9.6], 0.05, fit, 6);
  }
}
function rotorTrails(p) {
  let v = [],
    uv = [],
    idx = [];
  for (let j = 0; j < 5; j++) {
    let base = v.length / 3;
    for (let k = 0; k <= 8; k++) {
      let f = k / 8,
        a = (j * TAU) / 5 + f * 0.43 + 0.02,
        c = Math.cos(a),
        s = Math.sin(a);
      v.push(1.41 * c, -0.018, -1.41 * s, 8.56 * c, -0.018, -8.56 * s);
      uv.push(f, 0, f, 1);
      if (k) {
        let i = base + k * 2;
        idx.push(i - 2, i, i - 1, i, i + 1, i - 1);
      }
    }
  }
  let mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader:
      "varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:
      "varying vec2 st;void main(){float a=(1.-st.x)*smoothstep(0.,.27,st.y)*.14;gl_FragColor=vec4(.082,.115,.13,a);}",
  });
  mesh(p, surfaceGeo(v, idx, uv), mat).castShadow = false;
}
