// ---------- warehouse & waiting room with visible interiors ----------
const BUILD = {};

function texCorrugated() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const r = mulberry32(601);
    ctx.fillStyle = '#c3ccc9'; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, 'rgba(70,86,88,0.20)');
      g.addColorStop(0.35, 'rgba(255,255,252,0.28)');
      g.addColorStop(0.7, 'rgba(255,255,252,0.05)');
      g.addColorStop(1, 'rgba(70,86,88,0.22)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 16, h);
    }
    // rust streaks
    for (let i = 0; i < 22; i++) {
      const x = r() * w, len = 20 + r() * 150;
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(150,92,56,0.22)');
      g.addColorStop(1, 'rgba(150,92,56,0)');
      ctx.fillStyle = g; ctx.fillRect(x, r() * h * 0.5, 1 + r() * 4, len);
    }
    for (let i = 0; i < 1600; i++) {
      ctx.fillStyle = `rgba(80,92,90,${r() * 0.06})`;
      ctx.fillRect(r() * w, r() * h, 2, 2);
    }
    // bottom grime
    const gg = ctx.createLinearGradient(0, h * 0.7, 0, h);
    gg.addColorStop(0, 'rgba(70,88,80,0)');
    gg.addColorStop(1, 'rgba(60,80,72,0.30)');
    ctx.fillStyle = gg; ctx.fillRect(0, h * 0.7, w, h * 0.3);
  }, { repeat: [4, 2] });
}

function lightShaft(len, rTop, rBot, color, opacity) {
  const geo = new THREE.CylinderGeometry(rTop, rBot, len, 18, 1, true);
  geo.translate(0, -len / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color || 0xffe6ae) },
      uOpacity: { value: opacity === undefined ? 0.16 : opacity }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position,1.0);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 0.65);
        float a = uOpacity * edge * smoothstep(0.0, 0.35, vUv.y) * (0.55 + 0.45 * vUv.y);
        gl_FragColor = vec4(uColor, a);
      }`
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 12;
  return m;
}

function initBuildings(scene) {
  buildWarehouse(scene);
  buildWaitingRoom(scene);
}

function buildWarehouse(scene) {
  const g = new THREE.Group();
  const x0 = -21.6, x1 = -12.4, z0 = 13.4, z1 = 22.6, H = 4.6;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  const wallMat = toon(0xdde3dd, { map: texCorrugated(), spec: 0.12, shine: 34, rim: 0.10 });
  const wallIn = toon(0xcfd6ce, { map: cloneRepeat(TEX.concrete, 2, 1), spec: 0.05, rim: 0.06 });
  const frameMat = toon(0x6f7f82, { spec: 0.25, shine: 40, rim: 0.10 });
  const concrete = toon(0xc9cbc2, { map: cloneRepeat(TEX.concrete, 2, 2), spec: 0.10, rim: 0.08 });

  // floor
  const floor = box(9.4, 0.24, 9.4, toon(0xa9b0a8, { map: cloneRepeat(TEX.wetGround, 2.4, 2.4), spec: 0.42, shine: 60, rim: 0.10 }), cx, 0.02, cz);
  floor.receiveShadow = true;
  g.add(floor);

  // walls
  const back = box(9.2, H, 0.28, wallMat, cx, H / 2 + 0.1, z1);
  back.castShadow = true; back.receiveShadow = true; g.add(back);
  addOutline(back, 0.025);
  const left = box(0.28, H, 9.2, wallMat, x0, H / 2 + 0.1, cz);
  left.castShadow = true; left.receiveShadow = true; g.add(left);
  addOutline(left, 0.025);
  const right = box(0.28, H, 9.2, wallMat, x1, H / 2 + 0.1, cz);
  right.castShadow = true; right.receiveShadow = true; g.add(right);
  addOutline(right, 0.025);
  // front with opening (opening x -19.1..-14.1, y 0..3.15)
  const fL = box(2.5, H, 0.28, wallMat, -20.35, H / 2 + 0.1, z0);
  const fR = box(1.7, H, 0.28, wallMat, -13.25, H / 2 + 0.1, z0);
  const lintel = box(5.0, 1.35, 0.28, wallMat, -16.6, 3.85, z0);
  fL.castShadow = fR.castShadow = lintel.castShadow = true;
  fL.receiveShadow = fR.receiveShadow = lintel.receiveShadow = true;
  g.add(fL); g.add(fR); g.add(lintel);
  addOutline(fL, 0.025); addOutline(fR, 0.025); addOutline(lintel, 0.025);

  // interior wall liners (lighter)
  const inBack = box(9.0, H - 0.2, 0.06, wallIn, cx, H / 2 + 0.1, z1 - 0.17);
  inBack.receiveShadow = true; g.add(inBack);
  const inLeft = box(0.06, H - 0.2, 9.0, wallIn, x0 + 0.17, H / 2 + 0.1, cz);
  g.add(inLeft);
  const inRight = box(0.06, H - 0.2, 9.0, wallIn, x1 - 0.17, H / 2 + 0.1, cz);
  g.add(inRight);

  // roller shutter (half raised) + slats
  const shutMat = toon(0xb9c2bf, { map: cloneRepeat(TEX.concrete, 4, 1), spec: 0.30, shine: 50, rim: 0.12 });
  const shutter = box(4.9, 1.20, 0.10, shutMat, -16.6, 2.55, z0 - 0.16);
  shutter.castShadow = true;
  addOutline(shutter, 0.02);
  g.add(shutter);
  for (let i = 0; i < 7; i++) {
    const s = box(4.94, 0.035, 0.14, frameMat, -16.6, 1.98 + i * 0.17, z0 - 0.17);
    g.add(s);
  }
  // shutter side rails
  [-19.15, -14.05].forEach(x => {
    const rail = box(0.12, 3.2, 0.16, frameMat, x, 1.6, z0 - 0.14);
    g.add(rail);
  });

  // roof (gable, ridge along z)
  const roofMat = toon(0x8fa0ac, { map: cloneRepeat(TEX.roof, 4, 2), spec: 0.16, shine: 34, rim: 0.10 });
  const eaveY = 4.62, ridgeY = 6.0;
  const slope = Math.atan2(ridgeY - eaveY, 4.7);
  const slopeLen = Math.hypot(ridgeY - eaveY, 4.7) + 0.5;
  const rL = box(slopeLen, 0.16, 10.0, roofMat, -19.35, (eaveY + ridgeY) / 2 + 0.06, cz);
  rL.rotation.z = slope;
  const rR = box(slopeLen, 0.16, 10.0, roofMat, -14.65, (eaveY + ridgeY) / 2 + 0.06, cz);
  rR.rotation.z = -slope;
  rL.castShadow = rR.castShadow = true;
  g.add(rL); g.add(rR);
  addOutline(rL, 0.03); addOutline(rR, 0.03);
  const ridge = cyl(0.10, 0.10, 10.1, 8, frameMat, cx, ridgeY + 0.12, cz);
  ridge.rotation.x = Math.PI / 2;
  g.add(ridge);
  // gable triangles
  const tri = new THREE.Shape();
  tri.moveTo(-4.6, 0); tri.lineTo(4.6, 0); tri.lineTo(0, 1.38); tri.closePath();
  const triGeo = new THREE.ShapeGeometry(tri);
  [z0 - 0.02, z1 + 0.02].forEach((z, i) => {
    const m = new THREE.Mesh(triGeo, wallMat);
    m.position.set(cx, 4.6, z);
    if (i === 1) m.rotation.y = Math.PI;
    m.castShadow = true;
    g.add(m);
  });

  // high window on east wall
  const winW = 2.6, winH = 1.05, winY = 3.55, winZ = 16.6;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), MAT.glass);
  glass.rotation.y = -Math.PI / 2;
  glass.position.set(x1 + 0.16, winY, winZ);
  glass.renderOrder = 8;
  g.add(glass);
  // frame
  const fr = 0.07;
  [[winZ - winW / 2, 0], [winZ + winW / 2, 0]].forEach(p => {
    g.add(box(0.10, winH + fr * 2, fr, frameMat, x1 + 0.18, winY, p[0]));
  });
  g.add(box(0.10, fr, winW + fr * 2, frameMat, x1 + 0.18, winY + winH / 2, winZ));
  g.add(box(0.10, fr, winW + fr * 2, frameMat, x1 + 0.18, winY - winH / 2, winZ));
  g.add(box(0.06, winH, 0.05, frameMat, x1 + 0.18, winY, winZ));

  // ---- interior ----
  // ceiling
  const ceil = box(9.0, 0.12, 9.0, toon(0xd9d8ca, { spec: 0.05, rim: 0.06 }), cx, 4.42, cz);
  ceil.receiveShadow = true; g.add(ceil);
  for (let i = 0; i < 4; i++) {
    g.add(box(9.0, 0.16, 0.14, toon(0x8d8a78), cx, 4.30, z0 + 1.3 + i * 2.2));
  }
  // caustics on ceiling
  const causMat = new THREE.MeshBasicMaterial({
    map: TEX.caustic, transparent: true, opacity: 0.32, color: 0xffe9b8,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });
  const caus = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 8.6), causMat);
  caus.rotation.x = Math.PI / 2;
  caus.position.set(cx, 4.35, cz);
  caus.renderOrder = 4;
  g.add(caus);
  BUILD.warehouseCaustic = causMat;

  // fish crate stacks
  const crateMats = [MAT.fishBox, MAT.fishBoxBlue];
  const cr = mulberry32(611);
  function crate(x, y, z, ry, blue) {
    const m = box(0.78, 0.34, 0.56, blue ? MAT.fishBoxBlue : MAT.fishBox, x, y, z);
    m.rotation.y = ry || 0;
    m.castShadow = true; m.receiveShadow = true;
    // slat lines
    g.add(m);
    const lid = box(0.80, 0.03, 0.58, toon(0xd8ded6, { spec: 0.2 }), x, y + 0.175, z);
    lid.rotation.y = ry || 0;
    g.add(lid);
    return m;
  }
  const stacks = [
    [-20.3, 19.7, 3], [-19.2, 20.6, 2], [-20.5, 21.4, 4], [-18.2, 19.2, 2],
    [-15.2, 21.3, 3], [-14.3, 20.2, 2], [-20.0, 16.4, 2], [-13.6, 17.6, 3]
  ];
  stacks.forEach(s => {
    for (let i = 0; i < s[2]; i++) {
      crate(s[0] + (cr() - 0.5) * 0.1, 0.21 + i * 0.35, s[1] + (cr() - 0.5) * 0.12, (cr() - 0.5) * 0.25, cr() < 0.4);
    }
  });

  // freezer chest
  const frz = box(2.0, 0.95, 0.95, toon(0xe9ece6, { spec: 0.35, shine: 60, rim: 0.14 }), -20.2, 0.6, 21.6);
  frz.castShadow = true; frz.receiveShadow = true; g.add(frz);
  const lid = box(2.02, 0.10, 0.98, toon(0xdfe5de, { spec: 0.4, shine: 70 }), -20.2, 1.12, 21.6);
  lid.rotation.x = -0.06;
  g.add(lid);
  g.add(box(0.28, 0.06, 0.10, frameMat, -19.6, 1.02, 21.1));

  // weighing scale
  const sc = new THREE.Group();
  sc.add(box(0.9, 0.10, 0.7, toon(0x8d9a98, { spec: 0.35, shine: 60 }), 0, 0.05, 0));
  sc.add(cyl(0.05, 0.06, 1.25, 8, frameMat, -0.4, 0.68, -0.25));
  const dial = cyl(0.22, 0.22, 0.07, 16, toon(0xe8e6d8, { spec: 0.2 }), -0.4, 1.25, -0.2);
  dial.rotation.x = Math.PI / 2;
  sc.add(dial);
  const needle = box(0.02, 0.18, 0.01, MAT.red, -0.4, 1.28, -0.16);
  needle.rotation.z = 0.5;
  sc.add(needle);
  sc.position.set(-14.2, 0.13, 19.4);
  sc.rotation.y = 0.4;
  sc.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(sc);

  // rain boots
  [-20.9, -20.55].forEach((x, i) => {
    const b = cyl(0.13, 0.15, 0.5, 8, toon(0x3f5f58, { spec: 0.4, shine: 60 }), x, 0.37, 14.6 + i * 0.05);
    g.add(b);
    g.add(box(0.18, 0.10, 0.30, toon(0x334f49, { spec: 0.3 }), x + 0.03, 0.14, 14.72 + i * 0.05));
  });

  // blackboard on back wall
  const bb = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.80), new THREE.MeshBasicMaterial({ map: TEX.blackboard }));
  bb.position.set(-17.2, 1.45, z1 - 0.24);
  bb.rotation.y = Math.PI;
  g.add(bb);
  const bbFrame = box(3.6, 1.98, 0.06, toon(0x7b5c3b, { map: TEX.wood }), -17.2, 1.45, z1 - 0.20);
  g.add(bbFrame);

  // shelf + tools on left wall
  g.add(box(0.5, 0.06, 3.0, MAT.woodDark, x0 + 0.45, 2.3, 18.2));
  for (let i = 0; i < 5; i++) {
    const t = box(0.05, 0.5 + cr() * 0.3, 0.05, MAT.rust, x0 + 0.45, 1.9, 17.1 + i * 0.5);
    t.rotation.z = (cr() - 0.5) * 0.2;
    g.add(t);
  }

  // wet floor sheen
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 4.2), new THREE.MeshBasicMaterial({
    color: 0x6f8f8a, transparent: true, opacity: 0.28, depthWrite: false
  }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(-17.4, 0.155, 17.6);
  wet.renderOrder = 2;
  g.add(wet);
  // pale reflected streaks on wet floor
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + cr() * 1.4, 0.10), new THREE.MeshBasicMaterial({
      color: 0xfff0c8, transparent: true, opacity: 0.10 + cr() * 0.08, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    s.rotation.x = -Math.PI / 2; s.rotation.z = cr() * 0.6;
    s.position.set(-19 + cr() * 5, 0.16, 16 + cr() * 4);
    g.add(s);
  }

  // scattered ice
  for (let i = 0; i < 14; i++) {
    const s = 0.06 + cr() * 0.07;
    const ice = box(s, s * 0.7, s, new THREE.MeshPhysicalMaterial({
      color: 0xe8fbff, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.0
    }), -19 + cr() * 6, 0.17 + s * 0.3, 15 + cr() * 5);
    ice.rotation.set(cr(), cr(), cr());
    g.add(ice);
  }

  // hanging work lamp
  const lampCord = cyl(0.012, 0.012, 0.9, 4, MAT.black, -17.2, 4.0, 18.4);
  g.add(lampCord);
  const shade = cyl(0.10, 0.34, 0.26, 12, toon(0x4a5a5c, { spec: 0.3, side: THREE.DoubleSide }), -17.2, 3.48, 18.4);
  g.add(shade);
  const bulb = sph(0.09, new THREE.MeshBasicMaterial({ color: 0xffe2a6 }), -17.2, 3.38, 18.4, 8, 6);
  g.add(bulb);
  const lglow = makeGlow(0xffd89a, 2.4, 0.45);
  lglow.position.set(-17.2, 3.36, 18.4);
  g.add(lglow);

  // interior point light
  const p = new THREE.PointLight(0xffd9a8, 1.15, 14, 2);
  p.position.set(-17.4, 3.3, 18.2);
  g.add(p);
  BUILD.warehouseLight = p;
  const p2 = new THREE.PointLight(0xbfe6ef, 0.55, 10, 2);
  p2.position.set(-14.0, 3.2, 16.2);
  g.add(p2);

  // light shaft from high window
  const shaft = lightShaft(7.0, 0.7, 1.5, 0xffe4ae, 0.20);
  shaft.position.set(x1 + 0.5, winY + 0.2, winZ);
  const dir = new THREE.Vector3(-1.0, -0.75, -0.25).normalize();
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  g.add(shaft);
  BUILD.shaft = shaft;

  // dust motes
  const dustGeo = new THREE.BufferGeometry();
  const dp = [];
  const dr = mulberry32(613);
  for (let i = 0; i < 70; i++) {
    const u = dr();
    dp.push(x1 - 0.5 - u * 5.5 + (dr() - 0.5) * 0.8, winY - u * 2.6 + (dr() - 0.5) * 0.8, winZ - 0.4 - u * 1.2 + (dr() - 0.5) * 1.4);
  }
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xffe9bd, size: 0.035, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  g.add(dust);
  BUILD.dust = dust;

  // exterior sign above shutter
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.62), new THREE.MeshBasicMaterial({ map: signTexture({
    w: 512, h: 128, bg: '#e9e6d8', fg: '#3c545c', border: true, borderWidth: 6,
    lines: [{ text: '日凪 漁協', size: 52 }], seed: 617
  }) }));
  sign.position.set(-16.6, 4.1, z0 - 0.19);
  sign.rotation.y = Math.PI;
  g.add(sign);
  const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.62), new THREE.MeshBasicMaterial({ map: signTexture({
    w: 512, h: 128, bg: '#e9e6d8', fg: '#3c545c', border: true, borderWidth: 6,
    lines: [{ text: '日凪 漁協', size: 52 }], seed: 617
  }) }));
  sign2.position.set(-16.6, 4.1, z0 - 0.20);
  sign2.rotation.y = 0;
  g.add(sign2);

  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  g.userData.tag = 'warehouse';
  scene.add(g);
  BUILD.warehouse = g;
}

function buildWaitingRoom(scene) {
  const g = new THREE.Group();
  const x0 = -6.6, x1 = 0.6, z0 = 16.6, z1 = 23.2, H = 3.35;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  const frameMat = toon(0x5d6f72, { spec: 0.3, shine: 50, rim: 0.10 });
  const wallMat = toon(0xe3e1d4, { map: cloneRepeat(TEX.concrete, 2, 1), spec: 0.08, rim: 0.08 });
  const woodMat = toon(0xb98f62, { map: TEX.wood, spec: 0.10, rim: 0.08 });

  // floor
  const floor = box(7.3, 0.22, 6.7, toon(0xc9b795, { map: cloneRepeat(TEX.wood, 3, 3), spec: 0.18, shine: 40, rim: 0.08 }), cx, 0.02, cz);
  floor.receiveShadow = true; g.add(floor);

  // back + west walls solid
  const back = box(7.2, H, 0.22, wallMat, cx, H / 2 + 0.1, z1);
  back.castShadow = true; back.receiveShadow = true; g.add(back);
  addOutline(back, 0.025);
  const west = box(0.22, H, 6.5, wallMat, x0, H / 2 + 0.1, cz);
  west.castShadow = true; west.receiveShadow = true; g.add(west);
  addOutline(west, 0.025);

  // glass north + east
  const glassN = new THREE.Mesh(new THREE.PlaneGeometry(7.2, H - 0.3), MAT.glass);
  glassN.position.set(cx, H / 2 + 0.12, z0 + 0.02);
  glassN.renderOrder = 8;
  g.add(glassN);
  const glassE = new THREE.Mesh(new THREE.PlaneGeometry(6.5, H - 0.3), MAT.glass);
  glassE.rotation.y = -Math.PI / 2;
  glassE.position.set(x1 - 0.02, H / 2 + 0.12, cz);
  glassE.renderOrder = 8;
  g.add(glassE);
  // faint reflection streaks on glass
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + i * 0.4, H - 0.5), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    s.position.set(x0 + 1.0 + i * 1.6, H / 2 + 0.12, z0 + 0.03);
    g.add(s);
  }

  // frames
  const post = 0.09;
  for (let i = 0; i <= 4; i++) {
    const x = x0 + i * (x1 - x0) / 4;
    g.add(box(post, H, post, frameMat, x, H / 2 + 0.1, z0));
  }
  for (let i = 0; i <= 4; i++) {
    const z = z0 + i * (z1 - z0) / 4;
    g.add(box(post, H, post, frameMat, x1, H / 2 + 0.1, z));
  }
  g.add(box(7.3, post, 0.14, frameMat, cx, 0.12, z0));
  g.add(box(7.3, post, 0.14, frameMat, cx, H + 0.08, z0));
  g.add(box(0.14, post, 6.7, frameMat, x1, 0.12, cz));
  g.add(box(0.14, post, 6.7, frameMat, x1, H + 0.08, cz));
  g.add(box(7.3, 0.10, 0.10, frameMat, cx, 2.35, z0));

  // roof
  const roof = box(8.0, 0.22, 7.4, toon(0x8c9aa2, { map: cloneRepeat(TEX.roof, 4, 1.5), spec: 0.16, rim: 0.10 }), cx, H + 0.26, cz);
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);
  addOutline(roof, 0.03);
  g.add(box(8.1, 0.16, 0.16, frameMat, cx, H + 0.15, z0 - 0.1));
  g.add(box(8.1, 0.16, 0.16, frameMat, cx, H + 0.15, z1 + 0.1));

  // door on east glass
  const doorFrame = toon(0x4c5f62, { spec: 0.3 });
  g.add(box(0.10, 2.3, 0.10, doorFrame, x1 - 0.05, 1.25, z0 + 4.9));
  g.add(box(0.10, 2.3, 0.10, doorFrame, x1 - 0.05, 1.25, z0 + 6.2));
  g.add(box(0.10, 0.10, 1.4, doorFrame, x1 - 0.05, 2.36, z0 + 5.55));
  const handle = cyl(0.025, 0.025, 0.22, 6, frameMat, x1 - 0.12, 1.15, z0 + 6.05);
  g.add(handle);

  // ---- interior ----
  // bench along back wall
  const bench = new THREE.Group();
  bench.add(box(5.0, 0.10, 0.55, woodMat, 0, 0.46, 0));
  bench.add(box(5.0, 0.55, 0.09, woodMat, 0, 0.78, -0.25));
  for (let i = 0; i < 4; i++) {
    bench.add(box(0.10, 0.46, 0.5, frameMat, -2.2 + i * 1.45, 0.23, 0));
  }
  bench.position.set(cx, 0.12, z1 - 0.62);
  bench.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(bench);

  // timetable on west wall
  const tt = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.8), new THREE.MeshBasicMaterial({ map: TEX.timetable }));
  tt.rotation.y = Math.PI / 2;
  tt.position.set(x0 + 0.14, 1.95, cz + 0.6);
  g.add(tt);
  g.add(box(0.04, 1.9, 1.45, frameMat, x0 + 0.12, 1.95, cz + 0.6));

  // clock (slightly crooked)
  const clock = new THREE.Group();
  const rim = cyl(0.30, 0.30, 0.06, 20, toon(0x6f7c7c, { spec: 0.3 }), 0, 0, 0);
  rim.rotation.x = Math.PI / 2;
  clock.add(rim);
  const face = cyl(0.26, 0.26, 0.062, 20, toon(0xf0ede0, { spec: 0.1 }), 0, 0, 0.005);
  face.rotation.x = Math.PI / 2;
  clock.add(face);
  clock.add(box(0.015, 0.16, 0.01, MAT.black, 0, 0.07, 0.045));
  const hand = box(0.10, 0.015, 0.01, MAT.black, 0.045, 0.0, 0.045);
  hand.rotation.z = 0.5;
  clock.add(hand);
  clock.position.set(cx + 1.5, 2.45, z1 - 0.14);
  clock.rotation.z = 0.07;
  g.add(clock);

  // shelf + radio
  const shelf = box(2.2, 0.07, 0.38, woodMat, x0 + 1.6, 1.45, z1 - 0.25);
  g.add(shelf);
  const radio = new THREE.Group();
  radio.add(box(0.62, 0.36, 0.22, toon(0x8a6f52, { map: TEX.wood, spec: 0.2 }), 0, 0, 0));
  const spk = cyl(0.11, 0.11, 0.02, 14, toon(0x4a4038, { spec: 0.1 }), -0.15, 0, 0.12);
  spk.rotation.x = Math.PI / 2;
  radio.add(spk);
  radio.add(box(0.18, 0.09, 0.02, new THREE.MeshBasicMaterial({ color: 0xd8c68a }), 0.16, 0.04, 0.12));
  radio.add(cyl(0.012, 0.012, 0.5, 4, MAT.metal, 0.22, 0.36, 0));
  radio.position.set(x0 + 1.3, 1.66, z1 - 0.3);
  g.add(radio);

  // kettle + cup on small table
  const table = new THREE.Group();
  table.add(box(0.9, 0.06, 0.7, woodMat, 0, 0.62, 0));
  [[-0.36, -0.26], [0.36, -0.26], [-0.36, 0.26], [0.36, 0.26]].forEach(p => {
    table.add(box(0.06, 0.62, 0.06, frameMat, p[0], 0.31, p[1]));
  });
  const kettle = cyl(0.14, 0.17, 0.24, 12, toon(0xd9ded8, { spec: 0.5, shine: 80, rim: 0.2 }), -0.15, 0.78, 0);
  table.add(kettle);
  const spout = cyl(0.025, 0.035, 0.18, 6, MAT.metal, 0.02, 0.82, 0);
  spout.rotation.z = -0.9;
  table.add(spout);
  const cup = cyl(0.07, 0.06, 0.10, 10, toon(0xf2efe2, { spec: 0.3 }), 0.22, 0.70, 0.06);
  table.add(cup);
  table.position.set(x0 + 4.7, 0.12, z1 - 1.1);
  table.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(table);

  // potted pothos
  const plant = new THREE.Group();
  const pot = cyl(0.18, 0.13, 0.26, 10, toon(0xb07a55, { spec: 0.1 }), 0, 0.13, 0);
  plant.add(pot);
  const lr = mulberry32(631);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), toon(0x5f9a6b, { spec: 0.1, rim: 0.1, flat: true }));
    leaf.scale.set(1.5, 0.22, 0.8);
    leaf.position.set((lr() - 0.5) * 0.42, 0.34 + lr() * 0.38, (lr() - 0.5) * 0.42);
    leaf.rotation.set(lr() * TAU, lr() * TAU, lr() * TAU);
    plant.add(leaf);
  }
  plant.position.set(x1 - 0.55, 0.12, z1 - 0.55);
  g.add(plant);

  // ceiling light
  const shade = cyl(0.16, 0.28, 0.18, 12, toon(0xf0ead8, { emissive: 0x6a5a35, emissiveIntensity: 0.5, spec: 0.2 }), cx, H - 0.25, cz);
  g.add(shade);
  const glow = makeGlow(0xffe6b0, 2.2, 0.4);
  glow.position.set(cx, H - 0.36, cz);
  g.add(glow);
  const pl = new THREE.PointLight(0xffe2b4, 0.95, 11, 2);
  pl.position.set(cx, H - 0.5, cz);
  g.add(pl);

  // sign above door
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({ map: signTexture({
    w: 512, h: 128, bg: '#e8e5d6', fg: '#3c545c', border: true, borderWidth: 6,
    lines: [{ text: '待 合 室', size: 52 }], seed: 641
  }) }));
  sign.position.set(x1 + 0.03, 2.75, z0 + 4.6);
  sign.rotation.y = Math.PI / 2;
  g.add(sign);

  // exterior bench? no
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  g.userData.tag = 'waiting';
  scene.add(g);
  BUILD.waiting = g;
}