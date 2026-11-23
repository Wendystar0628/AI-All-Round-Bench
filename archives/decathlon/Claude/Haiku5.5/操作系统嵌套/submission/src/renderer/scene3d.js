'use strict';
/*
 * 三维视图（宿主绘制）：Three.js 的一个共享渲染器，依次绘制每个三维视图并复制到其画布上。
 * 这样同时打开很多三维视图也不会超过 WebGL 上下文的数量上限。
 * 画面只由提交的状态决定：场景资源（地形、障碍、树木、停机坪）按版本缓存，每帧的直升机位姿、
 * 旋翼转角、残骸、烟尘与火光都来自系统提交的 st。宿主不推进任何场景状态。
 */
(function (global) {
  const views = new Set();
  let THREE = null;
  let loadingP = null;
  let renderer = null;
  let rcanvas = null;
  let contextLost = false;
  const worlds = new WeakMap();     // 场景资源 -> 世界（场景、灯光、直升机等）

  function loadThree() {
    if (!loadingP) {
      loadingP = import('./vendor/three.module.js').then((m) => { THREE = m; return m; });
    }
    return loadingP;
  }

  function makeRenderer() {
    rcanvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas: rcanvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rcanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); contextLost = true; });
    rcanvas.addEventListener('webglcontextrestored', () => { contextLost = false; renderer = null; });
  }

  function makeSky() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#26306a');
    gr.addColorStop(0.45, '#7d6fb4');
    gr.addColorStop(0.75, '#f5a878');
    gr.addColorStop(1, '#ffd9a6');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function softSprite() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function numberTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#7c3fd6';
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 96, 256, 10);
    g.fillStyle = '#ffd23f';
    g.font = 'bold 96px "Arial Black", "Segoe UI", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('24', 128, 56);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeWorld(res) {
    const scene = new THREE.Scene();
    scene.background = makeSky();
    const hemi = new THREE.HemisphereLight(0x9aa6e8, 0x3a2e28, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb27a, 1.9);
    sun.position.set(-60, 45, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    const sprite = softSprite();
    // 烟尘与火光用的精灵池
    const pool = [];
    for (let i = 0; i < 160; i++) {
      const m = new THREE.SpriteMaterial({ map: sprite, color: 0x6d6a72, transparent: true, opacity: 0.6, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      pool.push(s);
    }
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x4a4256, roughness: 0.7, metalness: 0.3 });
    const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
    const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, 48);
    debris.castShadow = true;
    debris.receiveShadow = true;
    debris.count = 0;
    scene.add(debris);
    // 直升机
    const heli = buildHeli(scene);
    const world = { scene, sun, hemi, pool, debris, heli, sprite, dummy: new THREE.Object3D(), prepared: null, cam: null };
    world.prepared = prepareResource(res);
    scene.add(world.prepared.terrain);
    for (const o of world.prepared.obstacles) scene.add(o);
    for (const q of world.prepared.pads) scene.add(q);
    scene.add(world.prepared.trees);
    worlds.set(res, world);
    return world;
  }

  function buildHeli(scene) {
    let discRef = null;
    const g = new THREE.Group();
    const numTex = numberTexture();
    const purple = new THREE.MeshStandardMaterial({ color: 0x7c3fd6, roughness: 0.42, metalness: 0.12 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2140, roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 });
    const body = new THREE.Group();
    body.position.y = 1.9;
    g.add(body);
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), purple);
    hull.scale.set(1.35, 1.25, 3.4);
    hull.castShadow = true;
    body.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 6.8), yellow);
    stripe.position.set(0, -0.2, 0.2);
    body.add(stripe);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    cab.scale.set(1.1, 0.95, 1.6);
    cab.position.set(0, 0.25, 2.2);
    body.add(cab);
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.05), new THREE.MeshStandardMaterial({ map: numTex, roughness: 0.5 }));
      decal.position.set(side * 1.36, 0.15, -0.2);
      decal.rotation.y = side * Math.PI / 2;
      body.add(decal);
    }
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 8.5, 12), purple);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.2, -7.2);
    boom.castShadow = true;
    body.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.4, 1.8), yellow);
    fin.position.set(0, 1.6, -11.3);
    body.add(fin);
    const tailRotor = new THREE.Group();
    tailRotor.position.set(0.5, 1.7, -11.6);
    body.add(tailRotor);
    const tdisc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshBasicMaterial({ color: 0xcfd6e6, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    tdisc.rotation.y = Math.PI / 2;
    tailRotor.add(tdisc);
    const tblade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3, 0.2), dark);
    tailRotor.add(tblade);
    // 主旋翼
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 10), dark);
    mast.position.set(0, 3.2, 0);
    body.add(mast);
    const rotor = new THREE.Group();
    rotor.position.set(0, 3.9, 0);
    body.add(rotor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.4, 12), dark);
    rotor.add(hub);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x2f2a3b, roughness: 0.4 });
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.06, 0.55), bladeMat);
      blade.rotation.y = i * Math.PI / 2 ;
      blade.castShadow = true;
      rotor.add(blade);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(7.2, 48), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    discRef = disc;
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    rotor.add(disc);
    // 起落架
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6.2, 8), dark);
      skid.rotation.x = Math.PI / 2;
      skid.position.set(side * 1.5, -1.2 - 0.6, 0.2);
      body.add(skid);
      for (const zz of [-1.6, 1.8]) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), dark);
        strut.position.set(side * 1.5, -0.9 - 0.6, zz);
        strut.rotation.z = side * 0.1;
        body.add(strut);
      }
    }
    g.userData = { body, rotor, tailRotor, hull, disc: discRef };
    scene.add(g);
    return g;
  }

  function prepareResource(res) {
    const T = THREE;
    const p = { terrain: null, obstacles: [], trees: null, pads: [] };
    const tr = res.terrain;
    const n = tr.n;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const step = tr.size / (n - 1);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = tr.x0 + i * step, z = tr.z0 + j * step;
        const h = tr.heights[k];
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      }
    }
    const idx = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // 颜色：按坡度与高度，停机坪附近为混凝土色
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const hl = i > 0 ? tr.heights[k - 1] : tr.heights[k];
        const hr = i < n - 1 ? tr.heights[k + 1] : tr.heights[k];
        const hd = j > 0 ? tr.heights[k - n] : tr.heights[k];
        const hu = j < n - 1 ? tr.heights[k + n] : tr.heights[k];
        const slope = Math.min(1, Math.hypot(hr - hl, hu - hd) / (2 * step) * 2.2);
        const x = pos[k * 3], z = pos[k * 3 + 2];
        let pad = 0;
        for (const q of res.helipads) {
          const dd = Math.hypot(x - q.x, z - q.z);
          if (dd < q.r + 12) pad = Math.max(pad, 1 - Math.max(0, dd - q.r) / 12);
        }
        const grass = [0.30 + 0.05 * Math.sin(x * 0.3), 0.46 + 0.05 * Math.cos(z * 0.2), 0.20];
        const rock = [0.42, 0.39, 0.34];
        const conc = [0.62, 0.6, 0.55];
        let r = grass[0] * (1 - slope) + rock[0] * slope;
        let gg = grass[1] * (1 - slope) + rock[1] * slope;
        let bb = grass[2] * (1 - slope) + rock[2] * slope;
        r = r * (1 - pad) + conc[0] * pad; gg = gg * (1 - pad) + conc[1] * pad; bb = bb * (1 - pad) + conc[2] * pad;
        col[k * 3] = r; col[k * 3 + 1] = gg; col[k * 3 + 2] = bb;
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
    mesh.receiveShadow = true;
    p.terrain = mesh;
    // 停机坪
    for (const q of res.helipads) {
      const disc = new T.Mesh(new T.CylinderGeometry(q.r, q.r, 0.12, 40), new T.MeshStandardMaterial({ color: 0xbfb9a2, roughness: 0.8 }));
      disc.position.set(q.x, q.y + 0.06, q.z);
      disc.receiveShadow = true;
      const ring = new T.Mesh(new T.RingGeometry(q.r - 0.7, q.r - 0.25, 40), new T.MeshBasicMaterial({ color: 0xffd23f }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(q.x, q.y + 0.13, q.z);
      p.pads.push(disc, ring);
    }
    // 障碍物
    const boxMat = { hangar: 0x8b8b96, tower: 0xe9ecf4, antenna: 0x5b6078, store: 0xc49a6c };
    for (const b of res.obstacles) {
      const kind = b.id || 'obstacle';
      const mat = new T.MeshStandardMaterial({ color: boxMat[kind] || 0x9a9aa6, roughness: 0.75 });
      const m = new T.Mesh(new T.BoxGeometry(b.sx, b.sy, b.sz), mat);
      m.position.set(b.x, b.y + b.sy / 2, b.z);
      m.rotation.y = b.rot || 0;
      m.castShadow = true;
      m.receiveShadow = true;
      p.obstacles.push(m);
      if (kind === 'tower') {
        const band = new T.Mesh(new T.BoxGeometry(b.sx + 0.1, 2.2, b.sz + 0.1), new T.MeshStandardMaterial({ color: 0xd6443a }));
        band.position.set(b.x, b.y + b.sy * 0.7, b.z);
        p.obstacles.push(band);
      }
    }
    // 树：实例化的圆锥
    const cone = new T.InstancedMesh(new T.ConeGeometry(1, 1, 7), new T.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 0.9 }), res.trees.length);
    cone.castShadow = true;
    cone.receiveShadow = true;
    const d = new T.Object3D();
    res.trees.forEach((t, i) => {
      const h = t[3];
      d.position.set(t[0], t[2] + h / 2, t[1]);
      d.scale.set(h * 0.42, h, h * 0.42);
      d.updateMatrix();
      cone.setMatrixAt(i, d.matrix);
    });
    cone.instanceMatrix.needsUpdate = true;
    p.trees = cone;
    return p;
  }

  function worldFor(res) {
    return worlds.get(res) || makeWorld(res);
  }

  // 每个视图的绘制状态
  function view(el, action, node, sys) {
    if (action === 'create') {
      const cv = document.createElement('canvas');
      cv.style.position = 'absolute';
      cv.style.left = '0'; cv.style.top = '0';
      el.appendChild(cv);
      el._cv = cv;
      el._ctx = cv.getContext('2d');
      views.add(el);
      loadThree();
      return;
    }
    if (action === 'update') {
      el._node = node;
      el._sys = sys;
      return;
    }
    if (action === 'remove') {
      views.delete(el);
      return;
    }
  }

  function applyCam(sh, cam, aspect) {
    if (!sh.cam) sh.cam = new THREE.PerspectiveCamera(42, aspect, 0.3, 3000);
    const c = sh.cam;
    c.aspect = aspect;
    c.fov = cam.fov || 42;
    c.updateProjectionMatrix();
    c.position.set(cam.p[0], cam.p[1], cam.p[2]);
    c.lookAt(cam.t[0], cam.t[1], cam.t[2]);
    return c;
  }

  function drawOne(el, now) {
    const node = el._node;
    if (!node || !el._cv || !THREE) return;
    const w = Math.max(1, Math.round(el.clientWidth));
    const h = Math.max(1, Math.round(el.clientHeight));
    if (el._cv.width !== w || el._cv.height !== h) {
      el._cv.width = w; el._cv.height = h;
      el._cv.style.width = w + 'px'; el._cv.style.height = h + 'px';
    }
    const st = node.st;
    const sysObj = el._sys;
    const res = sysObj && sysObj.res ? sysObj.res[node.res] : null;
    if (!st || !res) {
      el._ctx.fillStyle = '#101320';
      el._ctx.fillRect(0, 0, w, h);
      return;
    }
    const sh = worldFor(res);
    const cam = applyCam(sh, st.cam, w / h);
    const hel = st.heli;
    const ud = sh.heli.userData;
    if (hel) {
      sh.heli.position.set(hel.p[0], hel.p[1], hel.p[2]);
      sh.heli.rotation.order = 'YXZ';
      sh.heli.rotation.set(-hel.pitch, hel.yaw, -hel.roll);
      const spin = hel.rotor * 52;
      ud.rotor.rotation.y = (hel.t * spin) % (Math.PI * 2);
      ud.tailRotor.rotation.x = (hel.t * spin * 1.6) % (Math.PI * 2);
      ud.disc.material.opacity = Math.max(0, Math.min(0.35, (hel.rotor - 0.5) * 0.9));
      sh.sun.target.position.set(hel.p[0], hel.p[1], hel.p[2]);
      sh.sun.position.set(hel.p[0] - 60, hel.p[1] + 45, hel.p[2] + 40);
    }
    // 残骸与烟尘
    const fx = st.fx || { debris: [], smoke: [], dust: [] };
    const d = sh.dummy;
    let n = 0;
    for (const p of fx.debris || []) {
      if (n >= 48) break;
      d.position.set(p.p[0], p.p[1], p.p[2]);
      d.rotation.set(p.r * 0.7, p.r, p.r * 0.4);
      d.scale.set(p.s[0], p.s[1], p.s[2]);
      d.updateMatrix();
      sh.debris.setMatrixAt(n, d.matrix);
      n++;
    }
    sh.debris.count = n;
    sh.debris.instanceMatrix.needsUpdate = true;
    let k = 0;
    const puffs = (fx.smoke || []).concat(fx.dust || []);
    for (const q of puffs) {
      if (k >= sh.pool.length) break;
      const s = sh.pool[k++];
      s.visible = true;
      s.position.set(q.p[0], q.p[1], q.p[2]);
      const size = q.s;
      s.scale.set(size, size, 1);
      if (q.g === -1) {
        s.material.color.setHex(0xffa040);
        s.material.opacity = Math.max(0, Math.min(1, q.a));
      } else {
        const gray = q.g !== undefined ? q.g : 0.4;
        s.material.color.setRGB(0.42 + gray * 0.4, 0.4 + gray * 0.36, 0.42 + gray * 0.3);
        s.material.opacity = Math.max(0, Math.min(0.85, q.a));
      }
    }
    for (; k < sh.pool.length; k++) sh.pool[k].visible = false;
    // 渲染到共享画布，再复制到视图画布
    renderer.setSize(w, h, false);
    renderer.render(sh.scene, cam);
    el._ctx.drawImage(rcanvas, 0, 0, w, h);
  }

  function frame(now) {
    if (!THREE || !views.size) return;
    if (!renderer) {
      try { makeRenderer(); } catch (e) { console.warn('WebGL 不可用', e); return; }
    }
    if (contextLost) return;
    for (const el of views) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      try { drawOne(el, now); } catch (e) { console.warn('三维绘制失败', e); }
    }
  }

  global.NOSScene3D = { view, frame, loaded: () => !!THREE };
})(window);
