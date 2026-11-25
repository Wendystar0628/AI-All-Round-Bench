"use strict";
const quay = group(scene);
quay.userData.collision = true;
const H = {
  concrete: coat(0x646966, 0.12, 0.67, 0.37),
  wet: coat(0x333e43, 0.28, 0.36, 0.26),
  steel: coat(0x454e50, 0.63, 0.47),
  crane: coat(0x986047, 0.58, 0.41),
  orange: coat(0xb47d41, 0.54, 0.43),
  ivory: coat(0xa6a59b, 0.49, 0.43),
  glass: standard(0x23404d, 0.81, 0.17),
  rail: standard(0x766857, 0.66, 0.45),
  hull: coat(0x293641, 0.72, 0.32),
  keel: coat(0x834136, 0.59, 0.39),
  window: emit(0xffbd78, 1.51),
  ice: emit(0xa1d2dc, 1.48),
  silver: coat(0x737b78, 0.63, 0.33),
};
const pinLights = [],
  reflections = [],
  shafts = [];
function pin(p, x, y, z, r, col, strength = 1, blink = 0) {
  p.updateWorldMatrix(true, false);
  pinLights.push({ v: p.localToWorld(V(x, y, z)), r, col: new T.Color(col).multiplyScalar(strength), blink });
}
function reflected(p, x, y, z, color, strength = 1, spread = 1) {
  p.updateWorldMatrix(true, false);
  reflections.push({ p: p.localToWorld(V(x, y, z)), c: new T.Color(color).multiplyScalar(strength), spread });
}
function shaft(a, b, color, width, opacity, phase = 0) {
  const uniforms = {
    start: { value: vec(a).clone() },
    end: { value: vec(b).clone() },
    tint: { value: new T.Color(color) },
    width: { value: width },
    strength: { value: opacity },
    time: clockUniform,
    phase: { value: phase },
    mist: { value: patina },
  };
  const mat = new T.ShaderMaterial({
    uniforms,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    side: T.DoubleSide,
    vertexShader: `uniform vec3 start,end;uniform float width;varying vec2 vUv;
 void main(){vUv=uv;vec3 dir=normalize(end-start);vec3 side=normalize(cross(dir,normalize(cameraPosition-(start+end)*.5)));
 vec3 w=mix(start,end,uv.y)+side*(uv.x-.5)*2.*mix(.19,width,uv.y);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader: `uniform sampler2D mist;uniform vec3 tint;uniform float strength,time,phase;varying vec2 vUv;
 void main(){float d=abs(vUv.x*2.-1.);float haze=texture2D(mist,vec2(vUv.x*.3+phase+time*.026,vUv.y*1.7-time*.036)).r;
 float pockets=texture2D(mist,vec2(vUv.y*.65+phase*.29-time*.015,vUv.x*.32-time*.019)).r;
 float body=pow(max(0.,1.-d*d),3.3)*pow(1.-smoothstep(.67,1.,vUv.y),1.42)*(.66+.75*smoothstep(.32,.66,pockets));
 gl_FragColor=vec4(tint,body/(1.+vUv.y*vUv.y*5.)*strength*(.56+.91*haze));}`,
  });
  const o = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
  o.frustumCulled = false;
  o.renderOrder = 4;
  scene.add(o);
  shafts.push(o);
  return uniforms;
}
function fence(p, a, b, height, mat = H.rail) {
  a = vec(a);
  b = vec(b);
  let steps = Math.ceil(a.distanceTo(b) / 3.1);
  for (let i = 0; i <= steps; i++) {
    let v = a.clone().lerp(b, i / steps);
    rod(p, v, v.clone().add(V(0, height, 0)), 0.046, mat, 6);
  }
  for (let f of [0.47, 1]) {
    let k = V(0, height * f, 0);
    rod(p, a.clone().add(k), b.clone().add(k), 0.052, mat, 6);
  }
}
function containerAtlas(index) {
  const palette = ["#864737", "#527482", "#aa7950", "#516c60", "#a6a8a0", "#475866", "#a95837", "#847e72"],
    titles = ["KAIYO", "NORTHLINE", "SEABORNE", "TIDEWAY", "POLARIS", "HARBOR UNITED", "ATLAS", "KOSHO"];
  const c = texCanvas(1024, 512),
    ctx = c.getContext("2d"),
    b = texCanvas(1024, 512),
    bump = b.getContext("2d");
  ctx.fillStyle = palette[index];
  ctx.fillRect(0, 0, 1024, 512);
  bump.fillStyle = "#888";
  bump.fillRect(0, 0, 1024, 512);
  function rib(x, y, w, h) {
    ctx.fillStyle = "#0a131749";
    ctx.fillRect(x, y, w * 0.22, h);
    ctx.fillStyle = "#dfe5d42b";
    ctx.fillRect(x + w * 0.24, y, w * 0.14, h);
    ctx.fillStyle = "#0002";
    ctx.fillRect(x + w * 0.66, y, w * 0.13, h);
    bump.fillStyle = "#646464";
    bump.fillRect(x, y, w * 0.21, h);
    bump.fillStyle = "#bcbcbc";
    bump.fillRect(x + w * 0.27, y, w * 0.39, h);
  }
  for (let j = 0; j < 42; j++) rib(14 + j * 23.9, 14, 24, 226);
  for (let j = 0; j < 37; j++) rib(525 + j * 13.1, 272, 13.1, 230);
  for (let j = 0; j < 12; j++) rib(8 + j * 41.4, 268, 41, 233);
  ctx.fillStyle = "#0006";
  ctx.fillRect(0, 244, 1024, 7);
  ctx.fillRect(250, 260, 8, 248);
  ctx.fillRect(0, 8, 1024, 4);
  ctx.fillStyle = "#d2cfc1";
  ctx.font = "900 44px Bahnschrift, Arial";
  ctx.fillText(titles[index], 53, 91, 494);
  ctx.fillRect(55, 104, 42, 4);
  ctx.font = "bold 13px Consolas, monospace";
  ctx.fillText("INTERMODAL  //  MARINE FREIGHT", 104, 112);
  ctx.font = "bold 21px Consolas, monospace";
  ctx.fillText("BDSU  " + (741208 + index * 747), 730, 59);
  ctx.font = "bold 14px Consolas";
  ctx.fillText("45G1    9'6 HIGH", 734, 86);
  ctx.font = "bold 33px Bahnschrift, Arial";
  ctx.fillText(titles[index], 275, 347, 220);
  ctx.font = "bold 15px Consolas";
  ctx.fillText("MAX. GROSS   30,480 KG", 263, 390);
  for (let j of [48, 184, 291, 445]) {
    ctx.fillStyle = "#333a39";
    ctx.fillRect(j, 274, 10, 226);
    ctx.fillStyle = "#989d91";
    ctx.fillRect(j + 2, 274, 4, 226);
    ctx.fillStyle = "#414745";
    for (let k = 0; k < 3; k++) ctx.fillRect(j - 6, 291 + k * 82, 22, 9);
    ctx.fillRect(j - 7, 428, 37, 7);
    bump.fillStyle = "#d6d6d6";
    bump.fillRect(j, 274, 8, 225);
  }
  for (let j = 0; j < 230; j++) {
    let x = rand() * 1024,
      y = rand() < 0.72 ? between(6, 29) : between(237, 252);
    ctx.fillStyle = "rgba(74,40,24," + between(0.08, 0.36) + ")";
    ctx.fillRect(x, y, between(1, 4), rand() ** 2 * 75 + 1);
  }
  for (let j = 0; j < 6000; j++) {
    ctx.fillStyle = rand() > 0.45 ? "#161b1a10" : "#c7c8b511";
    ctx.fillRect(rand() * 1024, rand() * 512, between(1, 5), between(0.7, 2));
  }
  return new T.MeshStandardMaterial({
    map: fromCanvas(c, false, true),
    bumpMap: fromCanvas(b),
    bumpScale: 0.064,
    roughness: 0.46,
    metalness: 0.49,
  });
}
const intermodal = Array.from({ length: 8 }, (_, i) => containerAtlas(i)),
  cargoBox = new T.BoxGeometry(1, 1, 1),
  cu = cargoBox.attributes.uv;
for (let k = 0; k < cu.count; k++) {
  let face = (k / 4) | 0,
    u = cu.getX(k),
    v = cu.getY(k);
  if (face < 2) cu.setXY(k, u * 0.49 + 0.003, v * 0.49 + 0.003);
  else if (face < 4) cu.setXY(k, 0.511 + u * 0.482, 0.003 + v * 0.49);
  else cu.setXY(k, u * 0.994 + 0.003, 0.504 + v * 0.489);
}
function can(p, x, y, z, mat = intermodal[Math.floor(rand() * 8)], len = 12) {
  let o = mesh(p, cargoBox, mat, x, y + 1.3, z);
  o.scale.set(len, 2.6, 2.45);
  return o;
}
box(quay, 0, 9.42, -128, 506, 12.95, 132, H.concrete);
box(quay, 0, 15.95, -128.2, 507, 0.63, 132, H.wet);
box(quay, 0, 16.296, -62.95, 505, 0.026, 0.28, M.yellow);
box(quay, 0, 15.12, -61.72, 506, 0.53, 0.42, H.silver);
for (let i = -31; i <= 31; i++) {
  let x = i * 8;
  box(quay, x, 13.83, -61.64, 0.15, 3.1, 0.33, M.dark);
  if (i % 2 === 0) {
    cutbox(quay, x, 13.82, -61.06, 3.11, 3.28, 1.05, M.rubber, 0.39, 0.13);
    for (let j = -1; j <= 1; j++) box(quay, x + j * 0.84, 13.83, -60.43, 0.13, 2.38, 0.17, M.iron);
    cyl(quay, x, 16.69, -63.5, 0.38, 0.53, 0.84, M.iron);
    cyl(quay, x, 17.1, -63.5, 0.65, 0.53, 0.25, M.yellow);
  }
  if (i % 3 === 0) {
    box(quay, x + 2.17, 15.2, -61.4, 1.87, 0.29, 0.09, H.window);
    pin(quay, x + 2.17, 15.26, -61.3, 1.7, 0xffac55, 0.62);
  }
}
for (let z of [-72, -99, -130, -166])
  for (let x = -240; x < 245; x += 8) box(quay, x, 16.29, z, 3.17, 0.018, 0.115, H.ivory);
for (let z of [-80, -111]) box(quay, 0, 16.31, z, 498, 0.095, 0.2, H.silver);
for (let r = 0; r < 5; r++)
  for (let i = -17; i <= 17; i++) {
    let x = i * 13.17 + (r % 2) * 3.81,
      z = -100 - r * 6.46;
    if ((i + r * 5) % 11 === 0 || (Math.abs(x - 30) < 6 && r < 2)) continue;
    let levels = 2 + Math.floor(rand() * 4);
    for (let j = 0; j < levels; j++) {
      can(quay, x + between(-0.1, 0.1), 16.28 + j * 2.61, z + between(-0.08, 0.08));
      if (r > 1) can(quay, x, 16.28 + j * 2.61, z - 2.65);
    }
  }
for (let i = 0; i < 26; i++) {
  let x = between(-245, 245);
  if (Math.abs(x - 12) > 10 && (x < -43 || x > -9)) can(quay, x, 16.28, between(-83, -91));
}
// Two reefer stacks frame the landside service lane.
for (let [x, z, n, m] of [
  [-32.79, -80.56, 4, 5],
  [-35.48, -80.55, 4, 4],
  [-17.54, -81.71, 4, 0],
  [-14.91, -81.76, 5, 3],
]) {
  const row = group(quay, x, 16.28, z);
  row.rotation.y = Math.PI / 2;
  for (let j = 0; j < n; j++) can(row, 0, j * 2.61, 0, intermodal[(m + j * 3) % 8]);
}
function serviceBuilding(x, z, w, d, h) {
  box(quay, x, 16.27 + h / 2, z, w, h, d, H.concrete);
  box(quay, x, 16.47 + h, z, w + 0.68, 0.42, d + 0.68, H.silver);
  for (let r = 0; r < 2; r++)
    for (let j = 0; j < Math.floor(w / 2.7); j++)
      box(
        quay,
        x - w / 2 + 1.6 + j * 2.68,
        18.55 + r * 2.25,
        z + d / 2 + 0.025,
        1.81,
        0.94,
        0.09,
        rand() > 0.44 ? H.window : H.glass
      );
  for (let j = 0; j < 3; j++) {
    let xx = x + between(-w * 0.37, w * 0.37);
    box(quay, xx, 17.24 + h, z, 2.3, 1.75, 2.3, H.steel);
    cyl(quay, xx, 18.41 + h, z, 0.56, 0.63, 0.67, H.rail);
  }
}
for (let i = -3; i <= 3; i++) serviceBuilding(i * 68 + 9, -153, 39 + rand() * 17, 17, 9 + rand() * 6);
function crane(x, z, id, angle) {
  let c = group(quay, x, 16.28, z);
  c.rotation.y = angle;
  const S = H.crane;
  for (let a of [-1, 1]) {
    for (let zz of [-17, 15]) {
      for (let j of [-1, 0, 1]) cyl(c, a * 9.85 + j * 1.34, 1.13, zz, 0.92, 0.92, 1.01, H.steel, "z", 16);
      cutbox(c, a * 10, 2.43, zz, 6.04, 2.02, 3.64, S, 0.38, 0.11);
      beam(c, [a * 10.15, 3.28, zz], [a * 5.43, 44.94, zz * 0.66], 2.08, 2.25, S);
      beam(c, [a * 9.09, 4.11, zz], [a * 4.97, 44.36, zz * 0.66], 0.41, 0.65, H.orange);
      beam(c, [a * 9.4, 10.8, zz], [a * 9.39, 10.8, -zz * 0.92], 1.02, 1.25, S);
      beam(c, [a * 9.4, 12.2, zz], [a * 6.99, 34.5, -zz * 0.62], 0.73, 0.79, S);
    }
    beam(c, [a * 5.1, 46.7, -12.55], [a * 1.95, 61.55, -6], 1.22, 1.47, S);
    beam(c, [a * 5.1, 46.3, 10.51], [a * 1.95, 61.55, -6], 1.19, 1.47, S);
    for (let zz of [-36, 25, 46.5, 62.4]) {
      rod(c, [a * 2.1, 60.98, -5.83], [a * 3.55, 47.27, zz], 0.125, H.steel, 8);
      rod(c, [a * 2.1 + 0.25, 60.6, -5.85], [a * 3.55 + 0.26, 47.1, zz], 0.078, H.rail, 6);
    }
    box(c, a * 3.53, 45.39, 12.4, 0.84, 1.04, 102, S);
    box(c, a * 3.53, 48.12, 12.49, 0.64, 0.65, 102, S);
    for (let j = 0; j < 22; j++) {
      let z0 = -38.4 + j * 4.61;
      beam(c, [a * 3.53, 45.75, z0], [a * 3.53, 47.92, z0 + 2.27], 0.31, 0.38, S);
      beam(c, [a * 3.53, 47.92, z0 + 2.27], [a * 3.53, 45.75, z0 + 4.61], 0.31, 0.38, S);
      if (j % 2 === 0) beam(c, [-3.57, 45.69, z0], [3.57, 45.69, z0], 0.36, 0.45, H.steel);
    }
    box(c, a * 6.67, 33.8, -0.5, 1.08, 0.34, 29, H.rail);
  }
  for (let zz of [-17, 15]) {
    box(c, 0, 10.8, zz, 19.53, 1.38, 1.42, S);
    beam(c, [-8.77, 11.5, zz], [5.45, 39.4, zz * 0.7], 0.63, 0.74, S);
    beam(c, [8.77, 11.5, zz], [-5.45, 39.4, zz * 0.7], 0.63, 0.74, S);
  }
  box(c, 0, 61.51, -6.01, 5.57, 1.03, 1.85, H.ivory);
  for (let zz of [-36.3, -30.7, -25.1]) {
    box(c, 0, 49.48, zz, 9.27, 4.17, 5.2, H.ivory);
    box(c, 0, 51.69, zz, 9.57, 0.25, 5.56, H.crane);
  }
  for (let sign of [-1, 1]) {
    let q = group(c, sign * 4.69, 49.52, -31.71);
    q.rotation.y = (sign * Math.PI) / 2;
    decal(q, 0, 0, 0.01, 5.4, 2.02, writing(["P – 0" + id, "EAST TERMINAL"], "#444d4d"));
  }
  let trolley = id === 2 ? 28.7 : id === 1 ? 36 : 14.5;
  box(c, 0, 44.57, trolley, 7.72, 1.44, 4.47, H.steel);
  box(c, 3.91, 43.16, trolley, 2.34, 2.32, 2.91, H.ivory);
  box(c, 3.93, 43.55, trolley + 1.47, 1.87, 1.09, 0.04, H.glass);
  let yy = id === 2 ? 29 : 17.5;
  for (let sx of [-1, 1])
    for (let sz of [-1, 1])
      rod(
        c,
        [sx * 2.09, 44.47, trolley + sz * 1.22],
        [sx * 5.23, yy + 0.62, trolley + sz * 1.04],
        0.06,
        M.dark,
        6
      );
  box(c, 0, yy + 0.28, trolley, 11.73, 0.57, 2.18, M.yellow);
  if (id === 2) can(c, 0, yy - 2.61, trolley, intermodal[0]);
  for (let zz of [-37.9, -25.05, -7.02, 11.35, 32.52, 50.3, 62.8])
    for (let k of [-1, 1]) {
      let warm = (id + (zz | 0)) % 3 !== 0;
      box(c, k * 3.75, 45.06, zz, 0.52, 0.39, 0.79, warm ? M.gold : M.lamp);
      pin(c, k * 3.76, 45.08, zz, 2.63, warm ? 0xffaf52 : 0xc5e9ff, 2);
    }
  accessGantry(c, id);
  pin(c, 0, 62.36, -6.03, 3.23, 0xff4a2c, 3, id * 0.7);
  cyl(c, 0, 62.19, -6.02, 0.24, 0.26, 0.48, M.pilot);
  c.updateWorldMatrix(true, false);
  let u = c.localToWorld(V(3.5, 45.04, 32.52));
  shaft(u, u.clone().add(V(-4, -32, 7)), 0xffc692, 6.1, 0.06, id);
  reflected(c, 3.54, 44.98, 32.52, 0xffaa51, 2.85, 2.1);
}
crane(-97, -92, 1, -0.56);
crane(-6, -95, 2, 0.51);
crane(65, -100, 3, 0.63);
function mast(x, z, index) {
  let h = 29 + (index % 3) * 2.6,
    y = 16.27;
  cutbox(quay, x, y + 0.76, z, 1.94, 1.4, 1.94, H.concrete, 0.21);
  cyl(quay, x, y + h * 0.5, z, 0.22, 0.46, h, H.silver, "y", 12);
  box(quay, x, y + h + 0.21, z, 4.72, 0.27, 0.83, H.steel);
  const warm = index % 4 !== 1,
    col = warm ? 0xffb164 : 0xd2eaff;
  for (let j of [-1, 1]) {
    box(quay, x + j * 1.56, y + h, z, 1.23, 0.61, 0.99, H.steel);
    box(quay, x + j * 1.56, y + h - 0.08, z + 0.51, 1.05, 0.44, 0.07, warm ? M.gold : M.lamp);
    pin(quay, x + j * 1.56, y + h - 0.07, z + 0.62, 4.4, col, 2.33);
  }
  shaft([x, y + h, z + 0.6], [x + 4, 16.3, z + 9], col, 4.31, 0.081, index * 0.2);
  if (index % 2 === 0) reflected(quay, x, y + h, z, col, 2.02, 1.43);
}
for (let i = 0; i < 12; i++) mast(-235 + i * 42.47, -91.4 - (i % 2) * 25, i);
for (let [x, z] of [
  [-58, -86],
  [41, -89],
  [99, -143],
]) {
  let g = group(quay, x, 16.28, z);
  for (let s of [-1, 1]) {
    for (let k of [-1, 1]) {
      cyl(g, s * 3, 1.2, k * 4, 1.14, 1.14, 0.91, M.rubber, "x");
      box(g, s * 3, 6.8, k * 4, 0.73, 10.66, 0.83, H.orange);
    }
    box(g, s * 3, 12.41, 0, 1.23, 1.71, 10.12, H.orange);
  }
  box(g, 0, 12.94, 0, 6, 1.16, 8.79, H.orange);
  box(g, 2.98, 11.52, 4.02, 2.02, 2.36, 2.14, H.ivory);
  box(g, 2.98, 11.82, 5.12, 1.61, 1.01, 0.06, H.glass);
}
bake(quay);
const city = group(scene),
  cityMats = [0x394550, 0x35444d, 0x48565c].map((c) => standard(c, 0.32, 0.66));
for (let i = 0; i < 148; i++) {
  let x = between(-572, 572),
    z = between(-480, -226),
    w = between(4, 21),
    h = between(4.4, 27.5) + (i % 17 === 0 ? 14 : 0),
    d = between(6, 17);
  box(city, x, 13.1 + h * 0.49, z, w, h, d, cityMats[i % 3]);
  if (i % 4 === 0) box(city, x, 13.4 + h, z, w * 0.51, 2.2, d * 0.47, cityMats[i % 3]);
  for (let y = 2.1; y < h - 1; y += 2.64)
    for (let xx = -w * 0.41; xx < w * 0.41; xx += 2.63)
      if (rand() < 0.54)
        box(
          city,
          x + xx,
          13 + y,
          z + d / 2 + 0.03,
          between(0.74, 1.65),
          0.72,
          0.051,
          rand() > 0.21 ? H.window : H.ice
        );
  if (i % 7 === 0) {
    cyl(city, x, 15 + h, z, 0.18, 0.31, 4.81, H.steel, "y", 8);
    pin(city, x, 17.5 + h, z, 2.68, 0xe07458, 0.8, 0.48 + i * 0.04);
  }
}
bake(city);
