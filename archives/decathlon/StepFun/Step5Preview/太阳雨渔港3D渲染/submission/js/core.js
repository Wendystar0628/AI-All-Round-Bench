/* ============ core: constants, palette, helpers, materials ============ */
(function () {
  const HB = (window.HB = window.HB || {});

  // ---------- geometry of the diorama ----------
  HB.C = {
    HALF: 20,            // base is 40 x 40
    DECK: 0,             // quay deck top
    WATER: -0.28,        // sea level
    BOTTOM: -6.0,        // underside of base
    // quay (L shape): front strip z in [8,20]; east arm x in [6,20], z in [-20,8]
    QUAY_Z0: 8,
    QUAY_X0: 6,
    WATER_X1: 6,         // water region x in [-20,6]
    WATER_Z1: 8,         // water region z in [-20,8]
    HILL: { x0: -20, x1: -9.5, z0: -20, z1: -11 },
  };

  // ---------- palette ----------
  HB.P = {
    skyTop: 0xcfe9ee,
    skyMid: 0xe8f4f4,
    skyLow: 0xf6fbfa,
    sun: 0xfff2d4,
    hemiSky: 0xe9f6f8,
    hemiGround: 0x3d7f88,
    concrete: 0xc9cdc7,
    concreteDark: 0x9aa29b,
    concreteWet: 0xa9b0aa,
    wall: 0xb6bab3,
    waterTop: 0x74c6bd,
    waterMid: 0x3fa3a2,
    waterDeep: 0x1c6a6d,
    waterSide: 0x86cfc2,
    hullWhite: 0xf1f3f0,
    hullShade: 0xc6cdc9,
    cabin: 0xe9ece8,
    glass: 0xbfe0e2,
    wood: 0xb58c5c,
    woodDark: 0x8a6742,
    woodLight: 0xd3ae7c,
    rust: 0x9c5f3d,
    rustLight: 0xb87a52,
    iron: 0x2b2e31,
    ironLight: 0x4a4f53,
    tire: 0x32363a,
    rope: 0xd9704a,
    yellow: 0xf0c53f,
    red: 0xd8462f,
    orange: 0xe8703a,
    green: 0x6aa85a,
    greenDark: 0x4c8a4c,
    treeLight: 0x7cbb60,
    tile: 0x6d7d88,
    tileDark: 0x4d5a63,
    rubber: 0x3a3f44,
    outline: 0x1d3a42,
    gold: 0xffd98a,
  };
  HB.P.lifebuoy = 0xe8633a;

  // ---------- deterministic rng ----------
  HB.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  HB.rr = function (r, a, b) { return a + (b - a) * r(); };

  // ---------- canvas texture ----------
  HB.canvasTex = function (w, h, draw, opts) {
    opts = opts || {};
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    draw(ctx, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    if (opts.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
    if (opts.linear) { t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; }
    t.encoding = opts.srgb === false ? THREE.LinearEncoding : THREE.sRGBEncoding;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    t.anisotropy = 4;
    return t;
  };

  HB.valueNoise = function (seed, size) {
    // smooth-ish value noise canvas (grayscale), tiled
    const r = HB.rng(seed);
    const g = new Float32Array(size * size);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const sm = new Float32Array(size * size);
    const k = 4;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let s = 0, c = 0;
      for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
        const w = Math.exp(-(dx * dx + dy * dy) / (k * k * 0.7));
        s += g[(((y + dy) % size) + size) % size * size + (((x + dx) % size) + size) % size] * w;
        c += w;
      }
      sm[y * size + x] = s / c;
    }
    return sm;
  };

  // ---------- toon gradient ----------
  HB.gradientMap = (function () {
    const steps = 4;
    const data = new Uint8Array(steps * 4);
    const v = [0.58, 0.76, 0.90, 1.0];
    for (let i = 0; i < steps; i++) { const b = Math.round(255 * v[i]); data[i * 4] = b; data[i * 4 + 1] = b; data[i * 4 + 2] = b; data[i * 4 + 3] = 255; }
    const t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
    t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false; t.needsUpdate = true;
    return t;
  })();

  HB.toon = function (color, opts) {
    opts = opts || {};
    const m = new THREE.MeshToonMaterial({ color: color });
    m.gradientMap = HB.gradientMap;
    if (opts.map) { m.map = opts.map; }
    if (opts.side) m.side = opts.side;
    if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity !== undefined ? opts.opacity : 1; }
    if (opts.flat) m.flatShading = true;
    m.userData = opts;
    return m;
  };

  HB.flat = function (color, opts) {
    opts = opts || {};
    const m = new THREE.MeshBasicMaterial({ color: color });
    if (opts.map) m.map = opts.map;
    if (opts.side) m.side = opts.side;
    if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity !== undefined ? opts.opacity : 1; m.depthWrite = opts.depthWrite !== undefined ? opts.depthWrite : true; }
    if (opts.alphaMap) m.alphaMap = opts.alphaMap;
    if (opts.toneMapped === false) m.toneMapped = false;
    return m;
  };

  // ---------- mesh helpers ----------
  HB.mesh = function (geo, mat, x, y, z, parent) {
    const m = new THREE.Mesh(geo, mat);
    if (x !== undefined) m.position.set(x, y, z);
    if (parent) parent.add(m);
    return m;
  };
  HB.box = function (w, h, d, mat, x, y, z, parent) {
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (parent) parent.add(m);
    return m;
  };
  HB.cyl = function (rt, rb, h, seg, mat, x, y, z, parent) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (parent) parent.add(m);
    return m;
  };

  // enable shadows on a whole subtree
  HB.shadows = function (obj, cast, receive) {
    obj.traverse(function (o) {
      if (o.isMesh) { if (cast) o.castShadow = true; if (receive) o.receiveShadow = true; }
    });
    return obj;
  };

  // ---------- shared animated uniforms ----------
  HB.U = {
    time: { value: 0 },
    sun: { value: 1 },      // 0..1 sun strength (cloud shadows)
    rain: { value: 0.6 },   // 0..1 rain density
    wind: { value: 0 },     // -1..1 wind direction/strength
    gust: { value: 0 },     // 0..1 gust envelope
    camPos: { value: new THREE.Vector3() },
    refl: { value: null },
    block: { value: 22 },
  };

  // ---------- shared small textures ----------
  HB.TEX = {};
  HB.TEX.noise = HB.canvasTex(256, 256, function (c, w, h) {
    const n = HB.valueNoise(7, 64);
    const id = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = n[(y % 64) * 64 + (x % 64)];
      const i = (y * w + x) * 4;
      const b = 120 + v * 135;
      id.data[i] = b; id.data[i + 1] = b; id.data[i + 2] = b; id.data[i + 3] = 255;
    }
    c.putImageData(id, 0, 0);
  }, { repeat: true, srgb: false });
})();
