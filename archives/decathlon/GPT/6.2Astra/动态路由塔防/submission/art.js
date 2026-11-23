const T = THREE,
  scene = new T.Scene(),
  cam = new T.OrthographicCamera(-10, 10, 7, -7, 0.1, 150),
  renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
$("canvasHost").appendChild(renderer.domElement);
scene.background = new T.Color(0xe0e7e9);
scene.fog = new T.Fog(0xe0e7ea, 23, 48);
function lights(sc, sh) {
  sc.add(new T.HemisphereLight(0xffffff, 0x778899, 1.85));
  let l = new T.DirectionalLight(0xfff4e3, 2.05);
  l.position.set(-6, 14, 7);
  l.castShadow = sh;
  if (sh) {
    l.shadow.mapSize.set(2048, 2048);
    Object.assign(l.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11 });
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.012;
    l.shadow.radius = 2;
  }
  sc.add(l);
  let rim = new T.DirectionalLight(0xc6e5ff, 0.82);
  rim.position.set(4, 5, -8);
  sc.add(rim);
}
lights(scene, true);
scene.environment = studioReflection();
let world,
  stat,
  units,
  details,
  routes,
  preview,
  rangeObj,
  labels = [],
  moving = [],
  bgDots = [],
  holo = [],
  linkSignals = [],
  rotors = [],
  picks = [],
  artTime = 0,
  matCache = {},
  geomCache = {};
const navy = 0x22364d,
  steel = 0x74899b,
  white = 0xe4e9e8,
  blue = 0x2854ba,
  cyan = 0x62e0ff,
  orange = 0xe87c27,
  gold = 0xf8bc53,
  red = 0xb72d49,
  black = 0x263041,
  green = 0x32a989;
function mat(c) {
  return (matCache[c] ??= new T.MeshStandardMaterial({
    color: c,
    roughness: c === steel ? .32 : c === white ? .48 : .65,
    metalness: c === steel ? .48 : c === navy ? .31 : .15,
    emissive: c === cyan ? 0x1b7897 : 0,
    emissiveIntensity: .42,
    envMapIntensity: .34,
  }));
}
function mesh(g, geo, c, x, y, z) {
  let m = new T.Mesh(geo, mat(c));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
const boxGeo = new T.BoxGeometry(1, 1, 1),
  bevelBox = makeBevel();
function box(g, x, y, z, w, h, d, c) {
  let m = mesh(
    g,
    w > 0.085 && h > 0.08 && d > 0.085 && Math.max(w, h, d) < 3 ? bevelBox : boxGeo,
    c,
    x,
    y,
    z,
  );
  m.scale.set(w, h, d);
  return m;
}
function cyl(g, x, y, z, r, h, c, n = 12, r2 = r) {
  let k = [n, r2 / r];
  let m = mesh(g, (geomCache[k] ??= new T.CylinderGeometry(1, r2 / r, 1, n)), c, x, y, z);
  m.scale.set(r, h, r);
  return m;
}
function group(g, x = 0, y = 0, z = 0) {
  let o = new T.Group();
  o.position.set(x, y, z);
  g.add(o);
  return o;
}
function tor(g, x, y, z, r, t, c, flat = true) {
  let k = "tor" + t / r;
  let m = mesh(g, (geomCache[k] ??= new T.TorusGeometry(1, t / r, 6, 28)), c, x, y, z);
  m.scale.setScalar(r);
  if (flat) m.rotation.x = Math.PI / 2;
  return m;
}
function beam(g, a, b, r, c, n = 6) {
  let A = new T.Vector3(...a),
    B = new T.Vector3(...b),
    d = B.clone().sub(A),
    mid = A.add(B).multiplyScalar(0.5);
  let m = cyl(g, mid.x, mid.y, mid.z, r, d.length(), c, n);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
  return m;
}
function merge(g) {
  g.updateWorldMatrix(true, true);
  let inv = g.matrixWorld.clone().invert(),
    all = new Map();
  g.traverse((m) => {
    if (!m.isMesh) return;
    let geo = m.geometry,
      idx = geo.index,
      pos = geo.attributes.position,
      nrm = geo.attributes.normal,
      arr = all.get(m.material) || [[], []];
    all.set(m.material, arr);
    let mx = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld),
      nm = new T.Matrix3().getNormalMatrix(mx),
      p = new T.Vector3(),
      n = new T.Vector3();
    for (let i = 0; i < (idx ? idx.count : pos.count); i++) {
      let j = idx ? idx.getX(i) : i;
      p.fromBufferAttribute(pos, j).applyMatrix4(mx);
      n.fromBufferAttribute(nrm, j).applyMatrix3(nm);
      arr[0].push(p.x, p.y, p.z);
      arr[1].push(n.x, n.y, n.z);
    }
  });
  g.clear();
  for (let [mt, [p, n]] of all) {
    let geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    geo.setAttribute("normal", new T.Float32BufferAttribute(n, 3));
    geo.userData.owned = true;
    let m = new T.Mesh(geo, mt);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
}
function tile(g, x, z, y, sz, c) {
  let a = box(g, x, y, z, sz, 0.07, sz, c);
  return a;
}
function vent(g, x, y, z, w, d) {
  box(g, x, y, z, w, 0.035, d, navy);
  for (let i = 0; i < 6; i++)
    box(g, x - w * 0.38 + i * w * 0.15, y + 0.025, z, w * 0.065, 0.025, d * 0.87, steel);
}
function base(g, c = navy) {
  cyl(g, 0, 0.08, 0, 0.44, 0.16, navy, 8);
  cyl(g, 0, 0.18, 0, 0.39, 0.07, c, 8);
  cyl(g, 0, 0.235, 0, 0.32, 0.08, steel, 8);
}
function deviceArt(t, level = 1, branch = 0) {
  let g = new T.Group(),
    top = group(g);
  base(top, t == 2 ? orange : blue);
  let h = level == 2 ? 0.13 : 0;
  if (h) {
    cyl(top, 0, 0.31, 0, 0.36, 0.14, gold, 8);
    tor(top, 0, 0.4, 0, 0.32, 0.028, blue);
  }
  let head = group(top, 0, 0.23 + h, 0);
  g.userData.head = head;
  if (t === 0) {
    for (let i = -1; i <= 1; i++) {
      let x = i * 0.26;
      box(head, x, 0.35, 0, 0.24, 0.63, 0.29, navy);
      box(head, x, 0.39, 0.055, 0.22, 0.58, 0.26, i == 0 ? blue : white);
      box(head, x, 0.62, 0.2, 0.16, 0.045, 0.02, cyan);
      box(head, x, 0.16, 0.2, 0.19, 0.075, 0.04, steel);
    }
  }
  if (t === 1) {
    cyl(head, 0, 0.13, 0, 0.31, 0.26, blue, 6);
    cyl(head, 0, 0.48, 0, 0.21, 0.5, gold, 6);
    for (let i = 0; i < 3; i++) tor(head, 0, 0.28 + i * 0.2, 0, 0.235, 0.035, navy);
    cyl(head, 0, 0.78, 0, 0.28, 0.09, white, 6);
    cyl(head, 0, 0.91, 0, 0.055, 0.24, steel);
  }
  if (t === 2) {
    for (let s of [-1, 1]) {
      box(head, s * 0.29, 0.38, 0, 0.18, 0.77, 0.34, white);
      box(head, s * 0.29, 0.74, 0, 0.21, 0.13, 0.37, orange);
    }
    for (let i = 0; i < 4; i++) {
      box(head, 0, 0.17 + i * 0.15, 0, 0.5, 0.09, 0.12, i % 2 ? gold : navy);
    }
  }
  if (t === 3) {
    cyl(head, 0, 0.18, 0, 0.2, 0.35, steel, 10);
    box(head, 0, 0.43, 0, 0.46, 0.33, 0.52, blue);
    for (let s of [-1, 1]) {
      box(head, s * 0.215, 0.47, -0.08, 0.12, 0.27, 0.46, white);
      box(head, s * 0.12, 0.47, -0.42, 0.1, 0.12, level > 1 ? 0.68 : 0.5, navy);
      box(head, s * 0.12, 0.47, -0.67, 0.12, 0.14, 0.13, branch ? cyan : steel);
    }
    box(head, 0, 0.64, 0.02, 0.18, 0.075, 0.21, navy);
    box(head, 0, 0.685, -0.01, 0.13, 0.02, 0.1, cyan);
  }
  if (t === 4) {
    cyl(head, 0, 0.22, 0, 0.25, 0.38, blue, 8);
    let bowl = group(head, 0, 0.46, 0);
    bowl.rotation.x = -0.62;
    cyl(bowl, 0, 0.02, 0, 0.45, 0.18, white, 16, 0.14);
    cyl(bowl, 0, 0.12, 0, 0.38, 0.025, navy, 16);
    tor(bowl, 0, 0.14, 0, 0.29, 0.025, cyan);
    beam(bowl, [0, 0.13, 0], [0, 0.41, 0], 0.034, steel);
    cyl(bowl, 0, 0.42, 0, 0.074, 0.08, orange);
  }
  if (t === 5) {
    box(head, 0, 0.24, 0, 0.45, 0.47, 0.38, white);
    for (let s of [-1, 1]) {
      cyl(head, s * 0.27, 0.35, 0, 0.12, 0.51, green, 8);
      cyl(head, s * 0.27, 0.64, 0, 0.14, 0.11, white, 8);
    }
    box(head, 0, 0.53, 0, 0.39, 0.12, 0.4, green);
    box(head, 0, 0.6, 0, 0.22, 0.02, 0.07, white);
    box(head, 0, 0.605, 0, 0.07, 0.02, 0.22, white);
  }
  if (t === 6) {
    cyl(head, 0, 0.2, 0, 0.23, 0.4, orange, 4);
    tor(head, 0, 0.48, 0, 0.23, 0.035, gold);
  }
  if (t === 7) {
    for (let i = 0; i < 3; i++) tor(head, 0, 0.1 + i * 0.18, 0, 0.36 - i * 0.06, 0.045, orange);
    cyl(head, 0, 0.26, 0, 0.08, 0.5, white);
  }
  if (t === 8) {
    box(head, 0, 0.25, 0, 0.65, 0.44, 0.44, green);
    box(head, 0, 0.49, 0, 0.35, 0.04, 0.1, white);
    box(head, 0, 0.49, 0, 0.1, 0.04, 0.31, white);
  }
  if (level > 1) {
    box(head, 0.27, 0.4, 0.17, 0.08, 0.4, 0.08, branch ? cyan : gold);
    if (branch) tor(head, 0, 0.27, 0, 0.35, 0.028, cyan);
  }
  if (level === 2) upgradeHardware(head,t,branch);
  deviceDetail(head, t);
  merge(head);
  return g;
}
function payloadPacket(parent) {
  const shell = group(parent);
  box(shell,0,.12,0,.33,.15,.45,navy);
  box(shell,0,.235,0,.29,.10,.38,0x8faaaa);
  const lids = [];
  for (const side of [-1,1]) {
    const hinge = group(shell,side*.171,.19,0);
    box(hinge,-side*.083,.074,0,.169,.11,.42,white);
    box(hinge,-side*.076,.136,.10,.105,.016,.045,blue);
    lids.push(hinge);
  }
  box(shell,0,.162,-.234,.15,.045,.025,cyan);
  shell.userData.lids = lids;
  return shell;
}
function upgradeHardware(head, t, branch) {
  if (t === 0) {
    for (const side of [-1,1]) {
      const shield = box(head,side*.43,.33,.07,.16,.65,.34,blue);
      shield.rotation.z = side*-.14;
      box(head,side*.425,.51,.25,.105,.075,.025,cyan);
    }
  } else if (t === 1 && branch === 0) {
    for (const side of [-1,1]) {
      beam(head,[side*.19,.19,0],[side*.37,.51,0],.04,steel);
      tor(head,side*.37,.53,0,.14,.035,gold,false);
    }
  } else if (t === 1) {
    for (const side of [-1,1]) {
      cyl(head,side*.32,.31,0,.115,.48,white,6);
      cyl(head,side*.32,.57,0,.14,.10,blue,6);
    }
  } else if (t === 2) {
    for (const side of [-1,1]) beam(head,[side*.3,.13,.14],[-side*.3,.69,.14],.043,navy);
    box(head,0,.84,0,.8,.12,.34,white);
  } else if (t === 3 && branch === 0) {
    box(head,0,.47,-.69,.135,.16,.62,white);
    box(head,0,.47,-1,.18,.19,.095,navy);
    box(head,0,.47,-1.05,.087,.075,.015,cyan);
  } else if (t === 3) {
    for(const side of [-1,1]) for(let j=0;j<3;j++)
      tor(head,side*.14,.48,-.40-j*.105,.115,.033,cyan,false);
  } else if (t === 4) {
    for(const side of [-1,1]) {
      const sensor=group(head,side*.34,.53,.1);
      sensor.rotation.z=-side*.52;
      cyl(sensor,0,.05,0,.155,.10,white,8,.08);
      cyl(sensor,0,.112,0,.12,.02,cyan,8);
    }
  } else if (t === 5) {
    for(const side of [-1,1]){
      beam(head,[side*.19,.5,.17],[side*.37,.7,.23],.043,navy);
      cyl(head,side*.37,.74,.23,.09,.12,green,8);
      tor(head,side*.37,.82,.23,.083,.018,white);
    }
  }
}
function enemyArt(t) {
  let g = new T.Group(),
    body = group(g),
    limbs = [];
  let col = [
    0xd5533c, 0x7e9f9f, 0xa43645, 0x99328a, 0xec672b, 0x813b9b, 0x9e273d, 0x7052bc, 0x70214c,
  ][t];
  if (t === 0 || t == 6) {
    for (let i = 0; i < (t == 6 ? 5 : 3); i++) {
      let seg = group(body, 0, 0.18, i * 0.17 - 0.18);
      cyl(seg, 0, 0, 0, 0.2 - i * 0.013, 0.2, i % 2 ? navy : col, 6);
      for (let s of [-1, 1]) beam(seg, [s * 0.13, 0, 0], [s * 0.29, -0.13, 0.05], 0.035, col);
      limbs.push(seg);
    }
    box(body, 0, 0.19, -0.31, 0.19, 0.09, 0.07, gold);
  } else if (t === 1) {
    body.userData.packet = payloadPacket(body);
  } else if (t == 4 || t == 7) {
    let m = cyl(body, 0, 0.2, 0, 0.24, 0.43, col, 4, 0.06);
    m.rotation.x = Math.PI / 2;
    for (let s of [-1, 1]) {
      let w = group(body, s * 0.23, 0.2, 0);
      box(w, 0, 0, 0.03, 0.37, 0.06, 0.15, navy).rotation.y = s * 0.4;
      tor(w, s * 0.1, 0.04, 0, 0.13, 0.04, col);
      limbs.push(w);
    }
  } else {
    cyl(body, 0, 0.18, 0, t == 2 ? 0.36 : 0.25, 0.26, col, t == 1 ? 4 : 6);
    cyl(body, 0, 0.36, 0, 0.19, 0.16, t == 1 ? white : navy, 4);
    box(body, 0, 0.34, -0.19, 0.19, 0.055, 0.04, t == 1 ? cyan : gold);
    for (let s of [-1, 1])
      for (let z of [-0.15, 0.15]) {
        let leg = group(body, s * 0.19, 0.18, z);
        beam(leg, [0, 0, 0], [s * 0.18, -0.14, 0.075], 0.05, col);
        limbs.push(leg);
      }
    if (t == 5 || t == 8) tor(body, 0, 0.53, 0, 0.23, 0.045, col, false);
    if (t == 3) beam(body, [0.12, 0.28, 0], [0.19, 0.34, -0.4], 0.058, navy);
  }
  if (t === 2) {
    for (const side of [-1,1]) {
      box(body,side*.30,.14,0,.16,.20,.56,navy);
      for(let j=0;j<4;j++) box(body,side*.385,.12,-.20+j*.14,.035,.12,.065,steel);
    }
    const ram=group(body,0,.19,-.29);
    box(ram,0,0,-.10,.54,.25,.18,col);
    for(const side of [-1,1]) box(ram,side*.19,0,-.21,.09,.18,.08,gold);
    body.userData.ram=ram;
  } else if (t === 3) {
    const mount=group(body,0,.39,0);
    box(mount,0,.12,.07,.20,.27,.21,col);
    beam(mount,[0,.21,0],[0,.23,-.43],.085,navy);
    cyl(mount,0,.29,.02,.112,.06,0xe787c4,6);
    body.userData.mount=mount;
  } else if (t === 5) {
    const rotor=group(body,0,.43,0);
    for(let i=0;i<3;i++){
      const angle=i*Math.PI*2/3, wing=group(rotor,Math.sin(angle)*.26,.08,Math.cos(angle)*.26);
      wing.rotation.y=angle;
      box(wing,0,0,0,.22,.27,.055,col);
      box(wing,0,.095,.036,.17,.045,.022,cyan);
    }
    body.userData.rotor=rotor;
  }
  if (t >= 6) {
    bossArt(t, body, limbs);
    g.scale.setScalar(t === 6 ? 1.83 : t === 7 ? 1.94 : 2.14);
    for (let i = -1; i <= 1; i++)
      cyl(body, i * 0.14, 0.55, 0, 0.06, 0.45 + 0.1 * Math.cos(i), gold, 4, 0.1);
  }
  g.userData = { body, limbs };
  return g;
}
function facility(g, x, z, type, m = 0) {
  let a = group(g, x, 0.15, z);
  a.scale.set(1.04, type == 0 ? 1.65 : 1.12, 1.04);
  base(a, steel);
  if (type == 0) {
    for (let i = -1; i <= 1; i++) {
      box(a, i * 0.29, 0.51, 0, 0.25, 0.8 - Math.abs(i) * 0.15, 0.56, navy);
      box(a, i * 0.29, 0.86 - Math.abs(i) * 0.075, 0, 0.26, 0.09, 0.58, white);
      for (let j = 0; j < 4; j++) {
        box(a, i * 0.29, 0.3 + j * 0.13, 0.285, 0.2, 0.065, 0.025, steel);
        box(a, i * 0.29 + 0.055, 0.31 + j * 0.13, 0.307, 0.05, 0.03, 0.012, cyan);
      }
    }
  } else if (type == 1) {
    box(a, 0, 0.44, 0, 0.76, 0.6, 0.68, white);
    box(a, 0, 0.54, 0, 0.78, 0.11, 0.7, navy);
    vent(a, -0.1, 0.755, 0, 0.42, 0.5);
    for (let s of [-1, 1]) {
      cyl(a, s * 0.27, 0.84, -0.18, 0.065, 0.25, steel);
      cyl(a, s * 0.27, 0.98, -0.18, 0.08, 0.035, orange);
    }
  } else {
    for (let s of [-1, 1]) {
      cyl(a, s * 0.2, 0.48, 0, 0.21, 0.6, m == 2 ? orange : steel, 12);
      tor(a, s * 0.2, 0.7, 0, 0.21, 0.032, white);
      cyl(a, s * 0.2, 0.81, 0, 0.19, 0.09, navy, 12);
      cyl(a, s * 0.2, 0.87, 0, 0.11, 0.07, gold, 8);
    }
    beam(a, [-0.2, 0.87, 0], [0.2, 0.87, 0], 0.05, steel);
  }
}
function endpoint(g, c, idx) {
  let a = group(g, c.x, 0.05, c.z);
  if (c.exit && S.mapid === 1) {
    cyl(a, 0,.12,0,.62,.24,navy,8);
    for(const side of [-1,1]){
      box(a,side*.25,.85,0,.41,1.46,.63,white);
      box(a,side*.25,.85,.3,.34,1.27,.07,navy);
      for(let j=0;j<7;j++){
        box(a,side*.25,.33+j*.16,.35,.28,.092,.04,steel);
        box(a,side*.25+.09,.35+j*.16,.38,.052,.029,.016,cyan);
      }
      vent(a, side*.25,1.61,0,.29,.48);
    }
    box(a,0,1.31,0,1.07,.12,.68,blue);
    cyl(a,0,1.67,0,.19,.17,blue,6);
  } else if(c.exit && S.mapid === 2){
    base(a,orange);
    cyl(a,0,.77,0,.34,1.03,steel,12);
    for(let j=0;j<4;j++)tor(a,0,.35+j*.24,0,.34,.046,j%2?navy:orange);
    for(const side of [-1,1]){
      cyl(a,side*.4,.48,0,.14,.83,white,8);
      beam(a,[side*.4,.91,0],[side*.22,1.17,0],.08,orange);
    }
    cyl(a,0,1.33,0,.38,.15,navy,8);
    cyl(a,0,1.52,0,.23,.23,c.exit===1?orange:green,8);
    tor(a,0,1.65,0,.23,.038,white);
  } else if (c.exit) {
    a.scale.set(1.22, 1.28, 1.22);
    cyl(a, 0, 0.12, 0, 0.59, 0.25, navy, 8);
    cyl(a, 0, 0.29, 0, 0.54, 0.12, blue, 8);
    for (let j = 0; j < 4; j++) {
      box(a, 0, 0.43 + j * 0.19, 0, 0.68 - j * 0.035, 0.15, 0.68 - j * 0.035, j % 2 ? navy : blue);
      box(a, 0, 0.48 + j * 0.19, 0, 0.69 - j * 0.035, 0.025, 0.69 - j * 0.035, cyan);
    }
    for (let s of [-1, 1])
      for (let v of [-1, 1]) {
        box(a, s * 0.35, 0.67, v * 0.35, 0.13, 0.82, 0.13, white);
        box(a, s * 0.35, 1.11, v * 0.35, 0.15, 0.09, 0.15, blue);
      }
    cyl(a, 0, 1.21, 0, 0.29, 0.24, white, 4);
    cyl(a, 0, 1.39, 0, 0.18, 0.14, cyan, 4);
  } else {
    let color = [orange, blue, green][idx];
    box(a, 0, 0.17, 0, 0.94, 0.31, 0.76, navy);
    tor(a, 0, 0.65, 0, 0.41, 0.105, color, false);
    tor(a, 0, 0.65, 0.06, 0.31, 0.03, white, false);
    for (let s of [-1, 1]) {
      box(a, s * 0.37, 0.37, 0.06, 0.21, 0.51, 0.45, white);
      box(a, s * 0.38, 0.26, 0.3, 0.13, 0.1, 0.03, color);
    }
    box(a, 0, 0.33, 0.35, 0.36, 0.045, 0.14, color);
  }
}
function makeLabel(c, code, name, color, height) {
  let e = document.createElement("div");
  e.className = "maplabel";
  e.style.setProperty("--lc", color);
  e.innerHTML = "<b>" + code + "</b><span>" + name + "</span>";
  $("labels").append(e);
  labels.push({ p: new T.Vector3(c.x, height, c.z), e });
}
function clearGroup(g) {
  if (!g) return;
  g.traverse((o) => {
    if (o.geometry?.userData.owned) o.geometry.dispose();
    if (o.material?.userData.owned) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
  g.removeFromParent();
}
function board(s) {
  clearGroup(world);
  world = group(scene);
  stat = group(world);
  units = group(world);
  details = group(world);
  routes = group(world);
  preview = group(world);
  rangeObj = group(world);
  labels = [];
  moving = [];
  picks = [];
  bgDots = [];
  holo = [];
  linkSignals = [];
  rotors = [];
  $("labels").innerHTML = "";
  const floorColor = [0xcdd9dd, 0xafcbd6, 0xc6c2b7][s.mapid];
  scene.background.setHex([0xe0e7e9, 0xcbdde7, 0xdbd7cd][s.mapid]);
  scene.fog.color.copy(scene.background);
  let floor = box(stat, 0, -2.65, 0, 160, 0.1, 160, floorColor);
  floor.receiveShadow = true;
  let grid = new T.GridHelper(160, 160, 0xbac8cf, 0xc7d3d9);
  grid.geometry.userData.owned = grid.material.userData.owned = true;
  grid.position.y = -2.593;
  world.add(grid);
  for (let i = 0; i < 60; i++) {
    let x = ((i * 73) % 53) - 26,
      z = ((i * 43) % 37) - 18;
    if (Math.abs(x) < 9 && Math.abs(z) < 7) continue;
    let h = 0.06 + (i % 5) * 0.11;
    box(stat, x, -2.52 + h / 2, z, 0.4 + (i % 3) * 0.4, h, 0.4 + (i % 2) * 0.6, 0xc0cdd3);
    if (i % 3 == 0) box(stat, x, -2.43 + h, z, 0.45, 0.13, 0.38, 0xafc1cc);
  }
  for (let i = 0; i < 17; i++) {
    let x = i * 0.88 - 7,
      z = i % 2 == 0 ? -5.6 : 5.6;
    box(stat, x, -1.44, z, 0.034, 0.025, 3.5, 0x99b1c0);
    box(stat, x + 1, -1.44, z + 1.74, 2, 0.025, 0.034, 0x99b1c0);
    let p = box(details, x, -1.4, z, 0.05, 0.035, 0.19, cyan);
    bgDots.push({ p, x, z });
  }
  box(stat, 0, -0.69, 0, 12.18, 0.18, 9.29, navy);
  box(stat, 0, -0.53, 0, 12.48, 0.17, 9.54, steel);
  box(stat, 0, -0.34, 0, 12.35, 0.21, 9.42, navy);
  box(stat, 0, -0.19, 0, 12.53, 0.09, 9.57, white);
  for (let x = -5.8; x < 6; x += 0.46) {
    for (let z of [-4.77, 4.77]) {
      box(stat, x, -0.44, z, 0.28, 0.1, 0.075, steel);
      if (Math.round(x * 10) % 3 == 0) box(stat, x, -0.39, z, 0.19, 0.043, 0.08, orange);
    }
  }
  for (let f of s.map.fac) {
    if (!s.grid[key(f[0], f[1])]) facility(stat, ...f, s.mapid);
  }
  for (let x = -6; x <= 6; x++)
    for (let z = -4; z <= 4; z++) {
      let k = key(x, z),
        c = s.grid[k],
        fac = s.map.fac.some((v) => v[0] == x && v[1] == z),
        edge = Math.abs(x) == 6;
      let blocked =
        (s.mapid == 2 && Math.abs(x) <= 1 && Math.abs(z) <= 1) || (s.mapid == 1 && z == 0);
      let platform =
        !c &&
        !fac &&
        !edge &&
        !blocked &&
        Object.values(s.grid).some((a) => a.road && Math.hypot(a.x - x, a.z - z) < 1.1) &&
        ((x + z) % 3 != 0 || s.map.pref.some((a) => a[0] == x && a[1] == z));
      if (!c) {
        c = s.grid[k] = { k, x, z, platform, road: false, adj: [] };
      }
      let w = edge ? 0.7 : 0.98,
        xx = edge ? x * 0.971 : x;
      box(stat, xx, -0.08, z, w, 0.13, 0.98, c.road ? navy : 0xa0adb6);
      if (c.road) {
        box(stat, x, 0.002, z, 0.97, 0.055, 0.97, c.old ? 0x677674 : 0x46586a);
        for (let a of c.adj) {
          if (a.x < c.x || a.z < c.z) continue;
          let dx = a.x - x,
            dz = a.z - z;
          for (let side of [-0.27, 0.27])
            box(
              stat,
              x + dx * 0.5 + dz * side,
              0.047,
              z + dz * 0.5 + dx * side,
              dx ? 1 : 0.025,
              0.012,
              dz ? 1 : 0.025,
              0x94acbd,
            );
        }
        for (const [dx,dz] of [[1,0],[0,1]]) {
          const neighbor = s.grid[key(x+dx,z+dz)];
          if (neighbor?.road && !c.adj.includes(neighbor))
            box(stat,x+dx*.5,.095,z+dz*.5,dx?.075:.88,.12,dz?.075:.88,steel);
        }
        if (c.old) {
          for (let j = -1; j <= 1; j++)
            box(stat, x + j * 0.21, 0.042, z, 0.08, 0.014, 0.51, 0xa29e79);
        }
        if (c.node) {
          cyl(stat, x, 0.059, z, 0.43, 0.08, orange, 4);
          cyl(stat, x, 0.107, z, 0.32, 0.035, navy, 4);
          cyl(stat, x, 0.135, z, 0.185, 0.04, gold, 4);
          for (let j = 0; j < 4; j++) {
            let a = (j * Math.PI) / 2;
            box(
              stat,
              x + Math.cos(a) * 0.37,
              0.1,
              z + Math.sin(a) * 0.37,
              0.075,
              0.1,
              0.075,
              white,
            );
          }
        }
        if (c.entry || c.exit) {
          endpoint(stat, c, c.entry - 1);
          makeLabel(
            c,
            c.entry ? "ABC"[c.entry - 1] : "XY"[c.exit - 1],
            s.map.names[c.entry ? c.entry - 1 : s.map.ins.length + c.exit - 1],
            c.entry ? ["#bd641f", "#315fc1", "#248777"][c.entry - 1] : "#314354",
            c.exit ? 2.18 : 1.43,
          );
        }
      } else if (platform) {
        tile(stat, x, z, 0.068, 0.89, steel);
        tile(stat, x, z, 0.14, 0.81, 0xdce4e4);
        for (let i of [-1, 1])
          for (let j of [-1, 1]) {
            box(stat, x + i * 0.3, 0.19, z + j * 0.3, 0.12, 0.023, 0.035, 0x718aa5);
            box(stat, x + i * 0.34, 0.19, z + j * 0.26, 0.035, 0.023, 0.12, 0x718aa5);
          }
        box(stat, x, 0.181, z, 0.18, 0.012, 0.028, 0x8799aa);
        box(stat, x, 0.182, z, 0.028, 0.012, 0.18, 0x8799aa);
      } else if (!fac) {
        let col = blocked ? 0x4d6776 : (x + z) % 4 == 0 ? 0xb3c1ca : 0xcad2d4;
        tile(stat, xx, z, 0.01, w * 0.95, col);
        if (blocked) {
          for (let j = -1; j <= 1; j++)
            box(stat, xx + j * 0.2, 0.06, z, 0.025, 0.018, 0.81, s.mapid == 1 ? cyan : steel);
        } else if ((x * 3 + z) % 5 == 0) {
          vent(stat, xx, 0.065, z, 0.4, 0.55);
        } else if ((x - z) % 4 == 0) {
          for (let j = -1; j <= 1; j++)
            box(stat, xx + j * 0.09, 0.06, z, 0.045, 0.015, 0.26, orange);
        } else {
          box(stat, xx, 0.05, z + 0.31, 0.37, 0.018, 0.019, 0x8fa2ad);
        }
      }
      picks.push(c);
    }
  protocolStations(s);
  boardDetail(s);
  mapArt(s);
  merge(stat);
  boardPrint(s);
  addCoreFX(s);
  addSiteMarks(s);
  boardShading(s);
  runningHardware(s);
  homeCam();
  updateRoutes();
}
const routeColors = [0xf58b31, 0x3775ff, 0x19b493];
function routeDraw(g, paths2, ghost = false) {
  for (let n = 0; n < paths2.length; n++) {
    let p = paths2[n];
    if (!p) continue;
    let col = ghost ? [0xffaf36,0x64b6ff,0x58dfbc][n] : routeColors[n],
      off = (n - 0.7) * 0.13;
    for (let i = 1; i < p.length; i++) {
      let a = p[i - 1],
        b = p[i],
        dx = b.x - a.x,
        dz = b.z - a.z,
        h = ghost ? 0.198 : 0.095;
      let x = (a.x + b.x) / 2 + off,
        z = (a.z + b.z) / 2 + off;
      box(
        g,
        x,
        h,
        z,
        dx ? (ghost ? 0.65 : 1.03) : 0.073,
        0.025,
        dz ? (ghost ? 0.65 : 1.03) : 0.073,
        col,
      );
      if (ghost) {
        box(g,x+dx*.28,h+.02,z+dz*.28,dx?.10:.085,.018,dz?.10:.085,white);
      }
      if (i % 2 == 1) {
        let arrow = cyl(g, x, h + 0.027, z, 0.132, 0.02, col, 3);
        arrow.rotation.y = Math.atan2(dx, dz);
      }
    }
  }
  merge(g);
}
function updateRoutes() {
  clearGroup(routes);
  routes = group(world);
  routeDraw(routes, S.paths);
  moving = [];
  for (let n = 0; n < S.paths.length; n++)
    for (let j = 0; j < 3; j++) {
      let o = j===1 ? payloadPacket(routes) : cyl(routes, 0, 0.14, 0, 0.075, 0.04, 0xfff7d3, 4);
      moving.push({ o, n, j });
    }
}
let yaw = 0.48,
  pitch = 0.69,
  zoom = 1,
  focus = new T.Vector3(),
  cw = 0,
  ch = 0;
function homeCam() {
  yaw = 0.46;
  pitch = 0.72;
  zoom = 1;
  focus.set(0, 0, 0);
  placeCam();
}
function zoomCam(k) {
  zoom = Math.max(0.55, Math.min(3.3, zoom * k));
  placeCam();
}
function placeCam() {
  let h = $("viewport").clientHeight,
    w = $("viewport").clientWidth;
  if (!w || !h) return;
  let aspect = w / h,
    span = Math.max(11, 16.7 / aspect) / zoom;
  Object.assign(cam, {
    left: (-span * aspect) / 2,
    right: (span * aspect) / 2,
    top: span / 2,
    bottom: -span / 2,
  });
  cam.position
    .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    .multiplyScalar(24)
    .add(focus);
  cam.lookAt(focus);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  if (cw != w || ch != h) {
    renderer.setSize(w, h, false);
    cw = w;
    ch = h;
  }
}
function project(x, y, z) {
  let p = new T.Vector3(x, y, z).project(cam);
  return { x: ((p.x + 1) * cw) / 2, y: ((1 - p.y) * ch) / 2 };
}
function render() {
  placeCam();
  if (selectedMarker && sel?.obj) selectedMarker.position.set(sel.x,.24,sel.z);
  positionLabels();
  for (let { o, n, j } of moving) {
    let p = S.paths[n];
    if (p?.length > 1) {
      let f = (S.time * 1.2 + (j * p.length) / 3) % (p.length - 1),
        a = p[Math.floor(f)],
        b = p[Math.ceil(f)],
        t = f % 1;
      if (j === 1 && a !== b) o.rotation.y=Math.atan2(a.x-b.x,a.z-b.z);
      o.position.set(
        a.x + (b.x - a.x) * t + (n - 0.7) * 0.13,
        0.14,
        a.z + (b.z - a.z) * t + (n - 0.7) * 0.13,
      );
    }
  }
  for (let h of holo) {
    h.r.rotation.y = S.time * 0.75;
    h.r.position.y = h.base + Math.sin(S.time * 2) * 0.065;
  }
  for (let { p, z, x } of bgDots) p.position.z = z + ((S.time * 0.4 + x + 8) % 3.5) - 1.75;
  for (const {o, path, span, phase} of linkSignals) {
    const progress = ((S.time*.48 + phase) % span);
    let left = progress;
    for (let i=1;i<path.length;i++) {
      const a=path[i-1], b=path[i], length=a.distanceTo(b);
      if (left<=length) {
        o.position.copy(a).lerp(b,left/length);
        break;
      }
      left-=length;
    }
  }
  for (const rotor of rotors) rotor.rotation.y=S.time*rotor.userData.speed;
  renderer.render(scene, cam);
}
function tCardAngle(i) {
  return i == 3 ? 2.5 : i == 4 ? 1.8 : 0.35;
}
function thumbnails() {
  let sc = new T.Scene();
  lights(sc, false);
  sc.environment=scene.environment;
  let ca = new T.OrthographicCamera(-0.88, 0.88, 0.75, -0.75, 0.1, 20);
  ca.position.set(2, 1.8, 2.7);
  ca.lookAt(0, 0.45, 0);
  let rr = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  rr.setSize(192, 158);
  rr.setClearColor(0, 0);
  let arr = [];
  for (let i = 0; i < 18; i++) {
    let o = i < 9 ? deviceArt(i) : enemyArt(i - 9);
    if (i >= 9) {
      o.scale.multiplyScalar(i >= 15 ? 0.85 : 1.8);
      o.position.y = 0.06;
    }
    o.rotation.y = i < 9 ? tCardAngle(i) : 2.2;
    sc.add(o);
    rr.render(sc, ca);
    arr.push(rr.domElement.toDataURL());
    clearGroup(o);
  }
  rr.dispose();
  rr.forceContextLoss();
  return arr;
}
function deviceDetail(g, t) {
  if (t == 0 || t == 2) {
    for (let side of [-1, 1]) {
      box(g, side * 0.29, 0.28, 0.206, 0.115, 0.42, 0.035, navy);
      for (let j = 0; j < 4; j++)
        box(g, side * 0.29, 0.17 + j * 0.084, 0.231, 0.099, 0.032, 0.03, t == 2 ? gold : cyan);
      box(g, side * 0.28, 0.64, 0.09, 0.1, 0.11, 0.25, white);
    }
    if (t == 0) box(g, 0, 0.38, 0.2, 0.16, 0.19, 0.024, blue);
  }
  if (t == 3) {
    for (let s of [-1, 1]) {
      box(g, s * 0.26, 0.42, 0, 0.07, 0.21, 0.33, navy);
      for (let j = 0; j < 3; j++)
        box(g, s * 0.3, 0.44, -0.085 + j * 0.083, 0.025, 0.11, 0.03, white);
      box(g, s * 0.12, 0.51, -0.55, 0.075, 0.032, 0.13, cyan);
    }
    cyl(g, -0.17, 0.72, 0.14, 0.024, 0.28, steel, 6);
    cyl(g, -0.17, 0.87, 0.14, 0.03, 0.035, orange);
  }
  if (t == 4) {
    for (let i = 0; i < 3; i++) {
      let a = (i * Math.PI * 2) / 3;
      beam(g, [0, 0.35, 0], [0.32 * Math.cos(a), 0.085, 0.32 * Math.sin(a)], 0.042, white);
    }
  }
  if (t == 5) {
    box(g, 0, 0.28, 0.204, 0.092, 0.24, 0.04, green);
    box(g, 0, 0.28, 0.21, 0.25, 0.084, 0.04, green);
  }
}
function stamp(txt, w, h, sz, color = "#3e5264", bg = "") {
  let cn = document.createElement("canvas");
  cn.width = 512;
  cn.height = 96;
  let ctx = cn.getContext("2d");
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 96);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold " + sz + "px Consolas,monospace";
  ctx.fillText(txt, 256, 50);
  let tx = new T.CanvasTexture(cn);
  tx.colorSpace = T.SRGBColorSpace;
  let m = new T.MeshBasicMaterial({
    map: tx,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  m.userData.owned = true;
  let geo = new T.PlaneGeometry(w, h);
  geo.userData.owned = true;
  return new T.Mesh(geo, m);
}
function boardPrint(s) {
  let m = stamp(
    "NEXUS  //  " + pad(s.mapid + 1) + "   " + ["INTRANET", "BACKBONE", "AIR-GAP"][s.mapid],
    3.35,
    0.42,
    33,
    "#e3eaf1",
    "#34475b",
  );
  m.position.set(-2.9, -0.46, 4.84);
  world.add(m);
  for (let c of picks) {
    if (!c.node && !c.platform) continue;
    let m = stamp(
      c.node ? "SW-" + pad(c.node) : "P " + pad((c.x + 6) * 9 + c.z + 4),
      c.node ? 0.53 : 0.43,
      0.115,
      70,
      c.node ? "#ffe6aa" : "#6b808e",
    );
    m.position.set(c.x, c.node ? 0.106 : 0.186, c.z + 0.27);
    m.rotation.x = -Math.PI / 2;
    world.add(m);
  }
}
function boardDetail(s) {
  for (let zz of [-4.75, 4.75]) {
    box(stat, 0, -0.65, zz, 12.57, 0.31, 0.18, navy);
    for (let i = 0; i < 7; i++) {
      let x = -5.5 + i * 1.8;
      box(stat, x, -0.59, zz, 0.85, 0.25, 0.27, steel);
      box(stat, x, -0.58, zz * 1.026, 0.61, 0.14, 0.07, black);
      for (let j = 0; j < 6; j++)
        box(
          stat,
          x - 0.23 + j * 0.09,
          -0.58,
          zz * 1.034,
          0.029,
          0.085,
          0.025,
          i % 3 ? 0xadbac2 : gold,
        );
      box(stat, x + 0.6, -0.6, zz * 1.027, 0.25, 0.055, 0.02, cyan);
    }
  }
  for (let xx of [-6.23, 6.23]) {
    beam(stat, [xx, -0.47, -4.65], [xx, -0.47, 4.65], 0.095, steel);
    for (let j = 0; j < 8; j++) {
      let z = -4.1 + j * 1.16;
      box(stat, xx, -0.43, z, 0.25, 0.31, 0.27, navy);
      box(stat, xx, -0.26, z, 0.27, 0.095, 0.21, white);
      box(stat, xx, -0.2, z, 0.21, 0.035, 0.09, orange);
    }
  }
  for (let x of [-5.65, 5.65])
    for (let z of [-4.16, 4.16]) {
      cyl(stat, x, -0.83, z, 0.31, 0.55, navy, 8);
      cyl(stat, x, -1.08, z, 0.23, 0.075, cyan, 8);
      cyl(stat, x, -1.17, z, 0.18, 0.11, steel, 8);
    }
  for (let c of picks) {
    if (!c.platform && !c.road && !s.map.fac.some((p) => p[0] == c.x && p[1] == c.z)) {
      if (Math.abs(c.x) == 6) {
        for (let j = 0; j < 2; j++) {
          let x = c.x * 0.97 + 0.09 * j;
          box(stat, x, 0.064, c.z - 0.11, 0.018, 0.009, 0.55, steel);
          box(stat, x - 0.09, 0.064, c.z + 0.16, 0.17, 0.009, 0.018, steel);
          cyl(stat, x - 0.18, 0.065, c.z + 0.16, 0.033, 0.013, steel, 8);
        }
      } else if ((c.x + c.z) % 4 == 1) {
        for (let j = 0; j < 2; j++) {
          box(stat, c.x + 0.04 + j * 0.14, 0.11, c.z, 0.095, 0.11, 0.25, navy);
          box(stat, c.x + 0.04 + j * 0.14, 0.172, c.z, 0.08, 0.028, 0.11, gold);
        }
      }
    }
    if (c.node) {
      for (let s of [-1, 1])
        for (let j of [-1, 1])
          box(stat, c.x + s * 0.34, 0.09, c.z + j * 0.34, 0.1, 0.08, 0.1, steel);
    }
  }
  for (let i = 0; i < 18; i++) {
    let x = ((i * 19) % 31) - 15,
      z = ((i * 11) % 23) - 11;
    if (Math.abs(x) < 8 && Math.abs(z) < 6) continue;
    let y = -2.55;
    for (let j = 0; j < 3; j++) {
      let h = 0.3 + ((i + j * 3) % 5) * 0.16;
      box(stat, x + j * 0.36, y + h / 2, z, 0.3, h, 0.63, 0x9aafbd);
      box(stat, x + j * 0.36, y + h * 0.8, z, 0.31, 0.05, 0.64, 0xb4c9d0);
    }
    for (let l = 0; l < 2; l++) {
      let xx = x + l * 0.12;
      box(stat, xx, y, z + 1.4, 0.032, 0.012, 2.8, 0x96b0bc);
      box(stat, xx + 0.6, y, z + 2.78, 1.2, 0.012, 0.032, 0x96b0bc);
    }
  }
}
function bossArt(t, g, limbs) {
  if (t == 6) {
    for (let i = 0; i < 3; i++)
      for (let s of [-1, 1]) {
        let wing = group(g, s * 0.23, 0.24, i * 0.21 - 0.22);
        beam(wing, [0, 0, 0], [s * 0.23, 0.14, 0.04], 0.075, navy);
        cyl(wing, s * 0.29, 0.16, 0.06, 0.17, 0.13, red, 6);
        cyl(wing, s * 0.29, 0.24, 0.06, 0.095, 0.04, orange, 6);
        limbs.push(wing);
      }
    box(g, 0, 0.31, -0.24, 0.32, 0.15, 0.21, black);
    box(g, 0, 0.33, -0.36, 0.24, 0.045, 0.04, orange);
  }
  if (t == 7) {
    let rot = group(g, 0, 0.5, 0);
    for (let j = 0; j < 3; j++) {
      let a = (j * Math.PI * 2) / 3;
      let k = cyl(
        rot,
        Math.cos(a) * 0.31,
        0.12,
        Math.sin(a) * 0.31,
        0.035,
        0.57,
        0x9b66c5,
        4,
        0.14,
      );
      k.rotation.z = Math.cos(a) * 0.37;
      k.rotation.x = -Math.sin(a) * 0.37;
    }
    tor(g, 0, 0.48, 0, 0.46, 0.027, 0x96dce8);
    g.userData.rotor = rot;
  }
  if (t == 8) {
    for (let s of [-1, 1])
      for (let j = 0; j < 3; j++) {
        let leg = group(g, s * 0.16, 0.22, (j - 1) * 0.18);
        beam(leg, [0, 0, 0], [s * 0.3, 0.21, 0.03], 0.074, 0x7c264b);
        beam(leg, [s * 0.3, 0.21, 0.03], [s * 0.51, -0.12, 0.16], 0.042, navy);
        cyl(leg, s * 0.29, 0.22, 0.03, 0.084, 0.083, orange, 6);
        limbs.push(leg);
      }
    let rot = group(g, 0, 0.53, 0);
    for (let j = 0; j < 3; j++) {
      let m = cyl(rot, 0, 0.16, 0, 0.18, 0.23, 0xab3974, 4, 0.07);
      m.rotation.z = Math.PI / 2;
      m.rotation.y = (j * Math.PI * 2) / 3;
      m.position.set(Math.sin(m.rotation.y) * 0.23, 0.17, Math.cos(m.rotation.y) * 0.23);
    }
    g.userData.rotor = rot;
    box(g, 0, 0.32, -0.22, 0.27, 0.06, 0.09, 0xff8866);
  }
}
function mapArt(s) {
  if (s.mapid == 0) {
    for (let [x, z] of [
      [-4, -1],
      [1, -2],
    ]) {
      let t = group(stat, x, 0.12, z);
      for (let j = 0; j < 3; j++) box(t, -0.35 + j * 0.34, 1.36, -0.05, 0.15, 0.04, 0.44, steel);
      for (let side of [-1, 1]) {
        box(t, side * 0.46, 0.57, 0, 0.06, 0.83, 0.44, steel);
        box(t, side * 0.46, 0.73, 0.19, 0.08, 0.3, 0.07, blue);
      }
      box(t, 0, 1.43, 0, 0.8, 0.1, 0.46, white);
      vent(t, 0, 1.49, 0, 0.57, 0.29);
    }
  }
  if (s.mapid == 1) {
    for (let x = -5; x <= 5; x++)
      if (!s.grid[key(x, 0)].road) {
        for (let j = 0; j < 3; j++)
          box(stat, x, 0.074, (j - 1) * 0.19, 0.92, 0.045, 0.068, j == 1 ? 0x219db3 : 0x76d8de);
      }
    for (let x of [-3, 3]) {
      for (let s of [-1, 1]) {
        let g = group(stat, x + s * 0.45, 0.06, 0);
        for (let j of [-1, 1]) {
          box(g, 0, 0.57, j * 0.84, 0.095, 1.12, 0.125, white);
          box(g, 0, 1.1, j * 0.84, 0.12, 0.17, 0.16, orange);
          beam(g, [0, 1.13, j * 0.84], [0, 0.27, j * 0.13], 0.032, steel);
          beam(g, [0, 1.13, j * 0.84], [0, 0.27, j * 1.35], 0.032, steel);
        }
        beam(g, [0, 1.08, -0.84], [0, 1.08, 0.84], 0.045, blue);
        box(g, 0, 0.26, 0, 0.065, 0.12, 2.8, navy);
      }
    }
  }
  if (s.mapid == 2) {
    for (let x of [-1.56, 1.56])
      for (let z of [-1.25, 1.25]) {
        cyl(stat, x, 0.43, z, 0.21, 0.73, navy, 8);
        cyl(stat, x, 0.61, z, 0.24, 0.14, orange, 8);
        cyl(stat, x, 0.84, z, 0.16, 0.15, white, 8);
        cyl(stat, x, 0.97, z, 0.07, 0.13, gold, 8);
      }
    for (let z of [-1.3, 1.3]) {
      beam(stat, [-1.5, 0.87, z], [1.5, 0.87, z], 0.09, orange);
      beam(stat, [-1.5, 0.6, z], [1.5, 0.6, z], 0.055, steel);
      for (let j = 0; j < 7; j++)
        beam(stat, [j * 0.43 - 1.5, 0.6, z], [j * 0.43 - 1.13, 0.87, z], 0.028, steel);
    }
    let a = group(stat, 0, 0.13, 0);
    cyl(a, 0, 0.12, 0, 0.54, 0.2, navy, 8);
    for (let j = 0; j < 4; j++) {
      cyl(a, 0, 0.27 + j * 0.19, 0, 0.32, 0.17, j % 2 ? steel : orange, 10);
      tor(a, 0, 0.3 + j * 0.19, 0, 0.35, 0.034, black);
    }
    cyl(a, 0, 1.11, 0, 0.22, 0.3, steel, 8);
  }
}
function addCoreFX(s) {
  s.outs.forEach((c) => {
    let r = group(units, c.x, 2.04, c.z),
      m = new T.MeshBasicMaterial({
        color: 0x51c9eb,
        wireframe: true,
        transparent: true,
        opacity: 0.8,
      });
    m.userData.owned = true;
    let geo = new T.OctahedronGeometry(0.16, 0);
    geo.userData.owned = true;
    r.add(new T.Mesh(geo, m));
    holo.push({ r, base: 2.04 });
  });
}
function makeBevel() {
  let p = [],
    b = 0.5,
    k = 0.455;
  function face(v) {
    let a = new T.Vector3(...v[0]),
      n = new T.Vector3(...v[1]).sub(a).cross(new T.Vector3(...v[2]).sub(a));
    if (n.dot(a) < 0) v.reverse();
    for (let i = 1; i < v.length - 1; i++) p.push(...v[0], ...v[i], ...v[i + 1]);
  }
  for (let ax = 0; ax < 3; ax++) {
    let u = (ax + 1) % 3,
      v = (ax + 2) % 3;
    for (let s of [-1, 1]) {
      let verts = [
        [-1, -1],
        [-1, 1],
        [1, 1],
        [1, -1],
      ].map(([i, j]) => {
        let a = [];
        a[ax] = s * b;
        a[u] = i * k;
        a[v] = j * k;
        return a;
      });
      face(verts);
    }
    for (let i of [-1, 1])
      for (let j of [-1, 1]) {
        let verts = [
          [-1, k, b],
          [-1, b, k],
          [1, b, k],
          [1, k, b],
        ].map(([s, a, b]) => {
          let q = [];
          q[ax] = s * k;
          q[u] = a * i;
          q[v] = b * j;
          return q;
        });
        face(verts);
      }
  }
  for (let x of [-1, 1])
    for (let y of [-1, 1])
      for (let z of [-1, 1])
        face([
          [b * x, k * y, k * z],
          [k * x, b * y, k * z],
          [k * x, k * y, b * z],
        ]);
  let geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
  geo.computeVertexNormals();
  return geo;
}
function addSiteMarks(s) {
  let g = group(world);
  for (let i = 0; i < 3; i++) {
    let [x, z] = [
      [-5.6, 4.18],
      [5.5, 4.18],
      [0, -4.25],
    ][i];
    let txt = [
      ["LEGACY  //  07", "DR - RING", "DMZ  /  01"],
      ["WAN - A", "DC - Y", "BACKBONE"],
      ["ICS - X", "SIS - Y", "MAINT. BUS"],
    ][s.mapid][i];
    let m = stamp(txt, 1.04, 0.23, 50, "#3a5265", "#cad5d9");
    m.position.set(x, 0.1, z);
    m.rotation.x = -Math.PI / 2;
    g.add(m);
  }
  if (s.mapid == 1) {
    let p = group(world);
    for (let side of [-1, 1]) {
      for (let j = 0; j < 3; j++)
        box(p, side * 8.2, -0.59, (j - 1) * 0.22, 4, 0.036, 0.08, j == 1 ? 0x64c6ce : 0x93babc);
    }
    merge(p);
  }
}
function studioReflection() {
  const w=192,h=96,pixels=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const u=x/w,v=y/h, band=(u>.14&&u<.37||u>.62&&u<.68)&&v>.32&&v<.72;
    const l=band?205:32+90*Math.max(0,v-.33);
    const i=(y*w+x)*4;
    pixels.set([l*.94,l,Math.min(255,l*1.08),255],i);
  }
  const texture=new T.DataTexture(pixels,w,h);
  texture.mapping=T.EquirectangularReflectionMapping;
  texture.colorSpace=T.SRGBColorSpace;
  texture.needsUpdate=true;
  return texture;
}
function protocolStations(s) {
  const accent=[0x7993a7,0x5c9fa9,0xaa967a][s.mapid];
  const sites=[[-8.25,-2.6,-1], [8.6,1.65,1], [1.35,-7.35,1]];
  for(const [x,z,side] of sites) {
    const bay=group(stat,x,-2.27,z);
    box(bay,0,.05,0,1.42,.11,1.00,0x859aa7);
    box(bay,0,.16,0,1.34,.095,.92,0xc3cdd0);
    for(let j=-1;j<=1;j++) {
      const ht=.38+(j===0?.24:0);
      box(bay,j*.38,.22+ht/2,0,.31,ht,.56,0x8196a3);
      box(bay,j*.38,.24+ht,0,.33,.07,.58,0xbccbd0);
      for(let row=0;row<3;row++) box(bay,j*.38,.28+row*.09,.287,.23,.028,.02,accent);
    }
    const endX=Math.abs(x)>6?side*6.24:x+.7;
    const endZ=Math.abs(z)>5?-4.77:z*.60;
    const points=[[x,-2.12,z],[x,-2.12,z+.86],[endX+side*.75,-2.12,z+.86],
      [endX+side*.32,-1.18,endZ],[endX,-.49,endZ]];
    for(let j=1;j<points.length;j++) {
      beam(stat,points[j-1],points[j],.049,accent);
      beam(stat,points[j-1].map((v,k)=>k===2?v+.13:v),points[j].map((v,k)=>k===2?v+.13:v),.025,0xb3c5cc);
    }
    const path=points.map(v=>new T.Vector3(...v)),span=path.slice(1).reduce((n,v,i)=>n+v.distanceTo(path[i]),0);
    for(let i=0;i<2;i++) {
      const o=cyl(details,x,-2.12,z,.066,.07,0x95e1e7,6);
      linkSignals.push({o,path,span,phase:span*i/2});
    }
  }
}
function boardShading(s) {
  const tex=document.createElement("canvas"), scale=80;
  tex.width=13*scale;tex.height=9*scale;
  const ctx=tex.getContext("2d");
  function contact(x,z,r) {
    const px=(x+6.5)*scale,py=(z+4.5)*scale;
    const grad=ctx.createRadialGradient(px,py,r*.25*scale,px,py,r*scale);
    grad.addColorStop(0,"rgba(21,35,51,.40)");grad.addColorStop(.65,"rgba(21,35,51,.20)");grad.addColorStop(1,"rgba(21,35,51,0)");
    ctx.fillStyle=grad;ctx.fillRect(px-r*scale,py-r*scale,2*r*scale,2*r*scale);
  }
  for(const [x,z] of s.map.fac) contact(x,z,.63);
  for(const c of [...s.ins,...s.outs]) contact(c.x,c.z,.68);
  for(const c of picks) if (!c.road&&!c.platform&&Math.abs(c.x)<6) {
    const x=(c.x+6.5)*scale,z=(c.z+4.5)*scale;
    ctx.strokeStyle="rgba(49,75,88,.23)";ctx.lineWidth=1;
    for(let j=0;j<3;j++) {
      ctx.beginPath();ctx.moveTo(x-29+j*3,z-25);ctx.lineTo(x-29+j*3,z-13);
      ctx.lineTo(x-17+j*3,z-1);ctx.lineTo(x-17+j*3,z+13);ctx.stroke();
      ctx.beginPath();ctx.arc(x-17+j*3,z+15,1.45,0,2*Math.PI);ctx.stroke();
    }
  }
  const map=new T.CanvasTexture(tex);
  map.colorSpace=T.SRGBColorSpace;
  const material=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const geometry=new T.PlaneGeometry(13,9);
  geometry.userData.owned=material.userData.owned=true;
  const plate=new T.Mesh(geometry,material);
  plate.rotation.x=-Math.PI/2;plate.position.y=.067;world.add(plate);
}
function runningHardware(s) {
  function fan(x,y,z,r,speed) {
    const hub=group(details,x,y,z);
    cyl(hub,0,0,0,r,.028,navy,18);
    tor(hub,0,.022,0,r*.94,.018,steel);
    const rotor=group(hub,0,.032,0);
    for(let i=0;i<5;i++) {
      const wing=group(rotor);wing.rotation.y=i*2*Math.PI/5;
      const blade=box(wing,r*.45,0,0,r*.61,.018,r*.24,0xb7cbd0);
      blade.rotation.y=-.44;
    }
    cyl(rotor,0,.016,0,r*.21,.036,orange,8);
    rotor.userData.speed=speed;rotors.push(rotor);
  }
  if(s.mapid===0) for(const [x,z] of [[-4,-1],[1,-2]]) fan(x,1.68,z,.195,4.8);
  if(s.mapid===2) fan(0,1.52,0,.25,2.8);
  if(s.mapid===1) {
    const path=[new T.Vector3(-9.8,-.54,0),new T.Vector3(-6.3,-.54,0),
      new T.Vector3(-6,.12,0),new T.Vector3(6,.12,0),new T.Vector3(6.3,-.54,0),new T.Vector3(9.8,-.54,0)];
    const span=path.slice(1).reduce((a,b,i)=>a+b.distanceTo(path[i]),0);
    for(let j=0;j<9;j++){
      const o=box(details,0,0,0,.23,.025,.08,0x93f3ec);
      linkSignals.push({o,path,span,phase:j*span/9});
    }
  }
}
function positionLabels(){
  const host=$("viewport").getBoundingClientRect();
  const occupied=[];
  for(const el of document.querySelectorAll(".viewheading,.viewtools,.viewfoot,#bossHud,#context,#sub,#notice")){
    const box=el.getBoundingClientRect();
    if(box.width) occupied.push([box.left-host.left-3,box.top-host.top-2,box.right-host.left+3,box.bottom-host.top+2]);
  }
  for(const label of labels){
    const {e,p}=label;
    const v=project(p.x,p.y,p.z);
    const w=e.offsetWidth,h=e.offsetHeight;
    let found=false;
    if(v.x>=0&&v.x<=cw&&v.y>=-3&&v.y<=ch) {
      for(const [dx,dy] of [[0,0],[0,-12],[0,16],[-18,6],[18,6],[-24,-13],[24,-13],[0,30]]) {
        const x=Math.max(w/2+4,Math.min(cw-w/2-4,v.x+dx)),y=v.y+dy;
        const bounds=[x-w/2,y-h,x+w/2,y];
        if(bounds[1]<4||bounds[3]>ch-4||occupied.some(b=>bounds[0]<b[2]&&bounds[2]>b[0]&&bounds[1]<b[3]&&bounds[3]>b[1]))continue;
        e.style.left=x+"px";e.style.top=y+"px";occupied.push(bounds);
        found=true;break;
      }
    }
    e.style.visibility=found?"visible":"hidden";
  }
}
const statusMaterials = new Map();
function statusGlyph(name) {
  if(statusMaterials.has(name))return statusMaterials.get(name);
  const canvas=document.createElement("canvas");
  canvas.width=canvas.height=64;
  const ctx=canvas.getContext("2d");
  const colors={shield:"#9cecff",lock:"#f5a6ff",trap:"#ffd379",block:"#ffba75",slow:"#b4c6ff"};
  ctx.fillStyle="#223348";ctx.beginPath();ctx.roundRect(4,4,56,56,10);ctx.fill();
  ctx.strokeStyle=colors[name];ctx.lineWidth=4;ctx.lineJoin="round";ctx.lineCap="round";
  ctx.beginPath();
  if(name==="shield"){
    ctx.moveTo(32,12);ctx.lineTo(48,18);ctx.lineTo(46,34);ctx.quadraticCurveTo(43,44,32,51);ctx.quadraticCurveTo(18,42,18,30);ctx.lineTo(16,18);ctx.closePath();
  } else if(name==="lock"){
    ctx.moveTo(22,29);ctx.lineTo(22,23);ctx.arc(32,23,10,Math.PI,2*Math.PI);ctx.lineTo(42,29);ctx.rect(16,29,32,20);ctx.moveTo(32,36);ctx.lineTo(32,42);
  } else if(name==="trap"){
    ctx.rect(16,16,32,32);ctx.moveTo(16,16);ctx.lineTo(48,48);ctx.moveTo(48,16);ctx.lineTo(16,48);
  } else if(name==="slow"){
    ctx.moveTo(30,17);ctx.lineTo(18,32);ctx.lineTo(30,47);ctx.moveTo(47,17);ctx.lineTo(35,32);ctx.lineTo(47,47);
  } else {
    ctx.moveTo(22,16);ctx.lineTo(22,48);ctx.moveTo(42,16);ctx.lineTo(42,48);ctx.moveTo(16,32);ctx.lineTo(48,32);
  }
  ctx.stroke();
  const texture=new T.CanvasTexture(canvas);
  texture.colorSpace=T.SRGBColorSpace;
  const material=new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false});
  statusMaterials.set(name,material);
  return material;
}
