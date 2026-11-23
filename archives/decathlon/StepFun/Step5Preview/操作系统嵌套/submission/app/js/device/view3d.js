// ============================================================
// 显示设备（三维）：单一 WebGL 2 上下文 + 多视口
// - 场景由程序提交的资源数据构建（几何/材质/贴图/灯光/相机）
// - 每帧按提交的时刻绘制；不推进场景状态
// - 视口矩形经遮挡计算后用 scissor 分别绘制，
//   因此同时打开的三维视图数量不受上下文上限限制
// - 上下文丢失后从系统状态恢复重建
// ============================================================
import * as THREE from '../../vendor/three.module.js';

const DEG = Math.PI / 180;

export class View3D {
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'gl';
    this.canvas.style.position = 'fixed';
    this.canvas.style.left = '0'; this.canvas.style.top = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '9999';
    document.body.appendChild(this.canvas);
    this.scenes = new Map();     // key -> {scene, camera, parts, res, renderer}
    this.views = [];             // 本帧待绘制视图
    this.ready = false;
    this.lost = false;
    this.init();
    window.addEventListener('resize', () => this.resize());
  }

  init() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.autoClear = false;
      this.ready = true;
      this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.ready = false; });
      this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); this.scenes.clear(); });
    } catch (e) {
      console.warn('WebGL 初始化失败', e);
      this.ready = false;
    }
    this.resize();
  }

  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
  }

  // ---------------- 场景构建 ----------------
  getScene(key, resource) {
    let s = this.scenes.get(key);
    if (s && s.res === resource) return s;
    if (s) { this.disposeScene(s); }
    s = this.build(resource);
    s.res = resource;
    this.scenes.set(key, s);
    return s;
  }

  disposeScene(s) {
    s.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  }

  build(res) {
    const scene = new THREE.Scene();
    const env = res.env || {};
    scene.background = null;
    scene.fog = new THREE.Fog(new THREE.Color(env.sky ? env.sky[1] : '#0d1320').getHex(), env.fogNear || 90, env.fogFar || 340);
    const sunDir = env.sunDir || [-0.45, -0.85, -0.3];
    const sun = new THREE.DirectionalLight(new THREE.Color(env.sunColor || '#ffe7c2'), 2.1);
    sun.position.set(-sunDir[0] * 120, -sunDir[1] * 120, -sunDir[2] * 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 320;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(new THREE.Color(env.sky ? env.sky[0] : '#33507c'), new THREE.Color(env.groundColor || '#55623f'), 0.85));
    scene.add(new THREE.AmbientLight(new THREE.Color(env.ambient || '#48587c'), 0.5));

    // 地形
    const t = res.terrain || {};
    const size = t.size || 420, seg = t.segments || 84;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(env.grassColor || '#6c7f4a');
    const cGround = new THREE.Color(env.groundColor || '#55623f');
    const cRock = new THREE.Color('#6b6f63');
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainH(x, z, t);
      pos.setY(i, h);
      const n = Math.abs(Math.sin(x * 0.11) * Math.cos(z * 0.13));
      tmp.copy(cGrass).lerp(cGround, Math.min(1, n * 1.2));
      if (h > 6) tmp.lerp(cRock, Math.min(0.7, (h - 6) / 12));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 }));
    terrain.receiveShadow = true;
    scene.add(terrain);

    // 停机坪
    for (const pad of res.pads || []) {
      const h = terrainH(pad.x, pad.z, t);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.r, pad.r * 1.04, pad.h || 0.45, 28),
        new THREE.MeshStandardMaterial({ color: pad.c || '#3d4457', roughness: 0.85 })
      );
      m.position.set(pad.x, h + (pad.h || 0.45) / 2, pad.z);
      m.receiveShadow = true; m.castShadow = true;
      scene.add(m);
      // 标识环
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(pad.r * 0.55, pad.r * 0.68, 24),
        new THREE.MeshBasicMaterial({ color: '#ffd23f', side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pad.x, h + (pad.h || 0.45) + 0.02, pad.z);
      scene.add(ring);
    }

    // 场景物件
    for (const p of res.props || []) {
      const h = terrainH(p.x, p.z, t);
      if (p.type === 'building') {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(p.w, p.h, p.d),
          new THREE.MeshStandardMaterial({ color: p.c || '#78808f', roughness: 0.8 })
        );
        m.position.set(p.x, h + p.h / 2, p.z);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
      } else if (p.type === 'tower') {
        const m = new THREE.Mesh(
          new THREE.CylinderGeometry(p.r, p.r * 1.3, p.h, 10),
          new THREE.MeshStandardMaterial({ color: p.c || '#565d6d', roughness: 0.85 })
        );
        m.position.set(p.x, h + p.h / 2, p.z);
        m.castShadow = true;
        scene.add(m);
      } else if (p.type === 'tree') {
        const s = p.s || 1;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18 * s, 0.26 * s, 2.2 * s, 7),
          new THREE.MeshStandardMaterial({ color: '#6b4f33', roughness: 0.9 })
        );
        trunk.position.set(p.x, h + 1.1 * s, p.z);
        trunk.castShadow = true;
        scene.add(trunk);
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(1.5 * s, 10, 8),
          new THREE.MeshStandardMaterial({ color: '#3f6b34', roughness: 0.9 })
        );
        crown.position.set(p.x, h + 2.6 * s, p.z);
        crown.castShadow = true;
        scene.add(crown);
      } else if (p.type === 'rock') {
        const m = new THREE.Mesh(
          new THREE.DodecahedronGeometry(p.r, 0),
          new THREE.MeshStandardMaterial({ color: '#7b7f78', roughness: 0.95, flatShading: true })
        );
        m.position.set(p.x, h + p.r * 0.5, p.z);
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
      } else if (p.type === 'fence') {
        const mat = new THREE.MeshStandardMaterial({ color: '#8a8f9c', roughness: 0.7 });
        for (let i = -1; i <= 1; i++) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 0.14), mat);
          post.position.set(p.x + i * (p.len / 3), h + 0.65, p.z);
          post.castShadow = true;
          scene.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(p.len, 0.08, 0.08), mat);
        rail.position.set(p.x, h + 1.1, p.z);
        scene.add(rail);
      }
    }

    // 直升机部件
    const parts = new Map();
    const heli = res.heli || {};
    const buildParts = (list, parent) => {
      for (const def of list) {
        const g = new THREE.Group();
        const mesh = this.partMesh(def);
        if (mesh) { g.add(mesh); }
        const pos = def.pos || [0, 0, 0];
        g.position.set(pos[0], pos[1], pos[2]);
        const rot = def.rot || [0, 0, 0];
        g.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
        const sc2 = def.scale;
        if (sc2) g.scale.set(sc2[0], sc2[1], sc2[2]);
        g.userData.name = def.name;
        g.userData.spin = def.spin || '';
        g.userData.axis = def.axis || 'y';
        parent.add(g);
        parts.set(def.name, g);
        if (def.children) buildParts(def.children, g);
      }
    };
    const root = new THREE.Group();
    scene.add(root);
    buildParts(heli.parts || [], root);

    // 旋翼模糊盘
    const blurMat = new THREE.MeshBasicMaterial({ color: '#dfe6f2', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    const mainBlur = new THREE.Mesh(new THREE.CircleGeometry(5.3, 28), blurMat);
    mainBlur.rotation.x = -Math.PI / 2;
    const tailBlur = new THREE.Mesh(new THREE.CircleGeometry(1.45, 16), blurMat);
    tailBlur.rotation.y = Math.PI / 2;

    // 粒子（尘土/烟/火焰 三组）
    const mkPoints = (color, size) => {
      const g2 = new THREE.BufferGeometry();
      const pos2 = new Float32Array(maxP * 3);
      const size2 = new Float32Array(maxP);
      const alpha2 = new Float32Array(maxP);
      g2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
      g2.setAttribute('aSize', new THREE.BufferAttribute(size2, 1));
      g2.setAttribute('aAlpha', new THREE.BufferAttribute(alpha2, 1));
      const m2 = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { map: { value: softTexture(color) } },
        vertexShader: `
          attribute float aSize; attribute float aAlpha; varying float vA;
          void main(){ vA=aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
            gl_PointSize = aSize * 340.0 / max(0.001,-mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `
          uniform sampler2D map; varying float vA;
          void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(t.rgb, t.a*vA); if(gl_FragColor.a<0.01) discard; }`
      });
      const pts = new THREE.Points(g2, m2);
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts, pos: pos2, size: size2, alpha: alpha2, geo: g2 };
    };
    const pGroups = [mkPoints('#c9b895', 1), mkPoints('#9aa0ab', 1), mkPoints('#ff9a3c', 1)];

    // 碎片（少量实体）
    const debris = [];
    const debrisMat = new THREE.MeshStandardMaterial({ color: '#4a4460', roughness: 0.6, metalness: 0.3 });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.42), debrisMat);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      debris.push(m);
    }

    const camera = new THREE.PerspectiveCamera(55, 1.4, 0.4, 700);
    return { scene, camera, parts, root, mainBlur, tailBlur, pGroups, maxP, debris, res, updateParticles(ns) {
      for (let gi = 0; gi < 3; gi++) {
        const g = this.pGroups[gi];
        const n = ns[gi];
        g.geo.setDrawRange(0, n);
        g.geo.attributes.position.needsUpdate = true;
        g.geo.attributes.aSize.needsUpdate = true;
        g.geo.attributes.aAlpha.needsUpdate = true;
      }
    } };
  }

  partMesh(def) {
    const geo = def.geo || {};
    const mat = def.mat || {};
    const color = new THREE.Color(mat.c || '#888888');
    const material = new THREE.MeshStandardMaterial({
      color, roughness: mat.rough === undefined ? 0.6 : mat.rough,
      metalness: mat.metal === undefined ? 0.2 : mat.metal,
      transparent: mat.opacity !== undefined && mat.opacity < 1,
      opacity: mat.opacity === undefined ? 1 : mat.opacity
    });
    let g = null;
    switch (geo.type) {
      case 'box': g = new THREE.BoxGeometry(geo.w || 1, geo.h || 1, geo.d || 1); break;
      case 'cyl': g = new THREE.CylinderGeometry(geo.r || 0.3, geo.r || 0.3, geo.h || 1, 14); break;
      case 'sph': g = new THREE.SphereGeometry(geo.r || 0.5, 16, 12); break;
      case 'cone': g = new THREE.ConeGeometry(geo.r || 0.4, geo.h || 1, 12); break;
      case 'tube': {
        g = new THREE.CylinderGeometry(geo.r || 0.1, geo.r || 0.1, geo.len || 1, 8);
        g.rotateX(Math.PI / 2);
        break;
      }
      case 'blade': {
        const n = geo.n || 2, len = geo.len || 3, w = geo.w || 0.2;
        const grp = new THREE.Group();
        for (let i = 0; i < n; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, len), material);
          b.position.z = len / 2;
          b.castShadow = true;
          const arm = new THREE.Group();
          arm.rotation.y = (i / n) * Math.PI * 2;
          arm.add(b);
          grp.add(arm);
        }
        return grp;
      }
      case 'plate': {
        const decal = mat.decal;
        const tex = decal ? decalTexture(decal) : null;
        const m2 = new THREE.MeshStandardMaterial({
          color: tex ? '#ffffff' : color, roughness: mat.rough === undefined ? 0.4 : mat.rough,
          metalness: mat.metal === undefined ? 0.2 : mat.metal, map: tex,
          side: THREE.DoubleSide
        });
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(geo.w || 1, geo.h || 1), m2);
        return pl;
      }
      default: g = new THREE.BoxGeometry(1, 1, 1);
    }
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  // ---------------- 帧收集与绘制 ----------------
  collect(system, frame, view) {
    if (!this.ready) return;
    const el = view.el;
    const base = el.getBoundingClientRect();
    for (const win of frame.wins || []) {
      if (!win.view3d) continue;
      const rect = win.view3dRect || [0, 26, win.w - 2, win.h - 27];
      const x = base.left + win.x + rect[0];
      const y = base.top + win.y + 26 + rect[1];
      const w = rect[2], h = rect[3];
      if (w < 8 || h < 8) continue;
      const vis = this.visibleRects(x, y, w, h, system, win);
      if (vis.length) this.views.push({ key: system.id + ':' + win.view3d, resource: (system.views3d[win.view3d] || {}).resource, state: (system.views3d[win.view3d] || {}).state, rects: vis });
    }
  }

  collectProjection(proj, targetSystem, frame, view) {
    if (!this.ready || !proj.payload || !proj.payload.state) return;
    for (const win of frame.wins || []) {
      if (win.kind !== 'proj' || win.projId !== proj.id) continue;
      const el = view.el;
      const base = el.getBoundingClientRect();
      const x = base.left + win.x + 1, y = base.top + win.y + 26;
      const w = win.w - 2, h = win.h - 27;
      if (w < 8 || h < 8) continue;
      const vis = this.visibleRects(x, y, w, h, targetSystem, win);
      if (vis.length) this.views.push({ key: 'proj:' + proj.id, resource: proj.payload.resource, state: proj.payload.state, rects: vis });
    }
  }

  // 遮挡计算：同一系统与祖先系统中 z 更高的窗口
  visibleRects(x, y, w, h, system, win) {
    let rects = [[x, y, w, h]];
    const subtract = (list, ox, oy, ow, oh) => {
      const out = [];
      for (const [rx, ry, rw, rh] of list) {
        const x1 = Math.max(rx, ox), y1 = Math.max(ry, oy);
        const x2 = Math.min(rx + rw, ox + ow), y2 = Math.min(ry + rh, oy + oh);
        if (x1 >= x2 || y1 >= y2) { out.push([rx, ry, rw, rh]); continue; }
        if (y1 > ry) out.push([rx, ry, rw, y1 - ry]);
        if (y2 < ry + rh) out.push([rx, y2, rw, ry + rh - y2]);
        if (x1 > rx) out.push([rx, y1, x1 - rx, y2 - y1]);
        if (x2 < rx + rw) out.push([x2, y1, rx + rw - x2, y2 - y1]);
      }
      return out;
    };
    const screenRectOf = (sys, w2) => {
      const v = this.host.view2d.views.get(sys.id);
      if (!v) return null;
      const b = v.el.getBoundingClientRect();
      return [b.left + w2.x, b.top + w2.y, w2.w, w2.h];
    };
    // 本系统
    const f = system.frame2d;
    if (f && f.wins) {
      for (const other of f.wins) {
        if (other.id === win.id || other.min === 1) continue;
        if ((other.z || 0) > (win.z || 0)) {
          const r = screenRectOf(system, other);
          if (r) rects = subtract(rects, r[0], r[1], r[2], r[3]);
        }
      }
    }
    // 祖先系统
    let cur = system;
    let childWinZ = win.z || 0;
    while (cur && cur.parentId) {
      const parent = this.host.systems.get(cur.parentId);
      if (!parent) break;
      const pf = parent.frame2d;
      if (pf && pf.wins) {
        const pv = this.host.view2d.views.get(parent.id);
        if (pv) {
          const b = pv.el.getBoundingClientRect();
          for (const other of pf.wins) {
            if (other.min === 1) continue;
            if ((other.z || 0) > childWinZ) {
              rects = subtract(rects, b.left + other.x, b.top + other.y, other.w, other.h);
            }
          }
        }
      }
      // 找到父系统中承载 cur 的窗口 z
      if (pf && pf.wins) {
        const host2 = pf.wins.find(w2 => w2.sys === cur.id);
        if (host2) childWinZ = host2.z || 0;
      }
      cur = parent;
    }
    // 根桌面 DOM 窗口
    if (this.host.rootWindowRects) {
      for (const r of this.host.rootWindowRects()) rects = subtract(rects, r[0], r[1], r[2], r[3]);
    }
    return rects.filter(r => r[2] > 2 && r[3] > 2);
  }

  render() {
    if (!this.ready || this.views.length === 0) { this.views = []; return; }
    const r = this.renderer;
    r.setScissorTest(true);
    r.clear(true, true, true);
    for (const v of this.views) {
      if (!v.state) continue;
      let s = this.scenes.get(v.key);
      if (!s || s.res !== v.resource) {
        if (!v.resource) continue;
        s = this.getScene(v.key, v.resource);
      }
      this.applyState(s, v.state);
      const aspect = v.rects.length ? v.rects[0][2] / Math.max(1, v.rects[0][3]) : 1.4;
      s.camera.aspect = aspect;
      s.camera.updateProjectionMatrix();
      for (const [x, y, w, h] of v.rects) {
        r.setViewport(x, window.innerHeight - y - h, w, h);
        r.setScissor(x, window.innerHeight - y - h, w, h);
        r.clear(true, true, true);
        r.render(s.scene, s.camera);
      }
    }
    r.setScissorTest(false);
    this.views = [];
  }

  applyState(s, st) {
    // 部件
    for (const p of st.parts || []) {
      const g = s.parts.get(p.n);
      if (!g) continue;
      g.visible = p.v !== 0;
      g.position.set(p.wx, p.wy, p.wz);
      const rot = [p.rx || 0, p.ry || 0, p.rz || 0];
      if (p.ang !== undefined && g.userData.spin) {
        if (g.userData.axis === 'y') rot[1] = p.ang;
        else rot[0] = p.ang;
      }
      g.rotation.set(rot[0], rot[1], rot[2]);
    }
    // 旋翼模糊
    const rpm = st.rotor === undefined ? 1 : st.rotor;
    const main = s.parts.get('主旋翼');
    if (main) {
      s.mainBlur.visible = rpm > 0.55 && main.visible;
      s.mainBlur.position.copy(main.position);
      s.mainBlur.material.opacity = Math.min(0.22, (rpm - 0.5) * 0.45);
    }
    const tail = s.parts.get('尾桨');
    if (tail) {
      s.tailBlur.visible = rpm > 0.55 && tail.visible;
      s.tailBlur.position.copy(tail.position);
      s.tailBlur.material.opacity = Math.min(0.2, (rpm - 0.5) * 0.4);
    }
    // 相机
    const cam = st.camera;
    if (cam) {
      s.camera.fov = cam.fov || 55;
      s.camera.position.set(cam.p[0], cam.p[1], cam.p[2]);
      s.camera.lookAt(cam.t[0], cam.t[1], cam.t[2]);
    }
    // 粒子
    const ps = st.particles || [];
    const counts = [0, 0, 0];
    for (const p of ps) {
      const type = (p[5] === undefined ? 0 : p[5]);
      if (type > 2) continue;
      const gi = type;
      const i = counts[gi];
      if (i >= s.maxP) continue;
      const g = s.pGroups[gi];
      g.pos[i * 3] = p[0]; g.pos[i * 3 + 1] = p[1]; g.pos[i * 3 + 2] = p[2];
      g.size[i] = (p[3] || 0.5) * (type === 1 ? 1.5 : 1);
      g.alpha[i] = Math.max(0, Math.min(1, p[4] === undefined ? 1 : p[4])) * (type === 0 ? 0.55 : 0.75);
      counts[gi]++;
    }
    s.updateParticles(counts);
    // 碎片
    let di = 0;
    for (const p of ps) {
      if (p[5] === 3 && di < s.debris.length) {
        const m = s.debris[di++];
        m.visible = true;
        m.position.set(p[0], p[1], p[2]);
        m.rotation.set(p[6] || 0, p[7] || 0, p[8] || 0);
        m.scale.setScalar(0.6 + (p[3] || 0.3));
      }
    }
    for (let i = di; i < s.debris.length; i++) s.debris[i].visible = false;
  }
}

// 与场景程序、地形网格一致的高度函数
export function terrainH(x, z, t) {
  const waves = t.waves || [[0.021, 0.55, 0.4, 0.019, 1.1], [0.037, 0.3, 1.9, 0.041, 0.3], [0.083, 0.15, 0.8, 0.071, 2.2]];
  const amp = t.amp === undefined ? 8.0 : t.amp;
  const base = (xx, zz) => {
    let h = 0;
    for (const w of waves) h += w[1] * Math.sin(xx * w[0] + w[2]) * Math.cos(zz * w[3] + w[4]);
    return h * amp;
  };
  let h = base(x, z);
  for (const f of t.flats || []) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r) {
      const w = 1 - smooth(d / f.r);
      h = h + (base(f.x, f.z) - h) * w;
    }
  }
  return h;
}

function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

function decalTexture(decal) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 160;
  const c = cv.getContext('2d');
  c.fillStyle = decal.bg || '#ffd23f';
  c.fillRect(0, 0, 256, 160);
  c.fillStyle = decal.fg || '#33195e';
  c.font = 'bold ' + (decal.font || 110) + 'px "Arial Black", "Microsoft YaHei", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(decal.text || '24', 128, 84);
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 6;
  c.strokeRect(3, 3, 250, 154);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

function softTexture(color) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(0.5, color + 'cc');
  g.addColorStop(1, color + '00');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
