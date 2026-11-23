/* 三维显示设备（宿主）：
 * - 单个 WebGL2 上下文，多个 3D 视图按可见矩形 scissor 绘制；
 * - 设备只按提交的场景资源与场景状态绘制，相同提交得到相同画面，不推进场景；
 * - 支持上下文丢失后从提交状态恢复。
 * 几何体完全由场景 JSON 数据构造（播放器/设备代码中没有特定直升机模型）。 */
'use strict';
window.NOS = window.NOS || {};

class Device3D {
  constructor(container) {
    this.container = container;
    this.views = new Map();   // key -> View
    this.renderer = null;
    this.sceneLib = new Map();
    this.textureLib = {};
    this._init();
  }

  _init() {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:500';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this._lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this._lost = false; this._rebuildAll = true; });
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  /* 装载场景资源（数据）。返回构建好的 THREE.Object3D 模板与静态数据。 */
  loadScene(key, sceneJson) {
    if (this.sceneLib.has(key)) return this.sceneLib.get(key);
    const built = this.buildScene(sceneJson);
    this.sceneLib.set(key, built);
    return built;
  }

  _texture(kind) {
    if (this.textureLib[kind]) return this.textureLib[kind];
    const dataUrl = NOS.fixtures.textures[kind === 'fuselage24' ? 'fuselage' : kind];
    const t = new THREE.TextureLoader().load(dataUrl);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    this.textureLib[kind] = t;
    return t;
  }

  buildScene(S) {
    const group = new THREE.Group();
    const colliders = [];
    const partMeshes = {};

    // 灯光
    const sky = S.sky || {};
    const sunPos = sunDir(sky.sun || { azimuth: 0.6, elevation: 0.2 });
    const sun = new THREE.DirectionalLight((sky.sun && sky.sun.color) || '#ffe9b0', (sky.sun && sky.sun.intensity) || 1.2);
    sun.position.copy(sunPos.multiplyScalar(120));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    sun.shadow.camera.far = 400;
    group.add(sun);
    group.add(new THREE.AmbientLight((sky.ambient && sky.ambient.color) || '#5a5a8c', (sky.ambient && sky.ambient.intensity) || 0.5));
    const hemi = sky.hemi && new THREE.HemisphereLight(sky.hemi.sky || '#caa9e8', sky.hemi.ground || '#3a2f22', sky.hemi.intensity || 0.6);
    if (hemi) group.add(hemi);

    // 地形
    const T = S.terrain;
    const terrain = this.buildTerrain(T, colliders);
    group.add(terrain.mesh);

    // 静态对象
    for (const o of S.objects || []) {
      const r = this.buildObject(o);
      group.add(r.mesh);
      if (o.collidable) colliders.push(...r.colliders);
    }

    // 飞行器（部件层级）
    const actorData = S.actor;
    const actor = this.buildActor(actorData, partMeshes);
    group.add(actor.root);

    // 粒子（烟/火/尘）
    const effects = new Effects(this.renderer, S.effects || {});

    return { json: S, group, partMeshes, colliders, sun, actorRoot: actor.root, actorParts: actor.parts, effects,
      skyData: sky, initial: actor.initial };
  }

  buildTerrain(T, colliders) {
    const size = T.size || 400, seg = T.segments || 64;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let h = 0;
      for (const [f, a] of (T.heightNoise || [])) h += Math.sin(x * f * 3.1) * Math.cos(z * f * 2.3) * a + Math.sin((x + z) * f) * a * 0.4;
      for (const fl of T.flatZones || []) {
        const d = Math.hypot(x - fl.x, z - fl.z);
        if (d < fl.r) h *= smooth(d - fl.r + 6) / 6;
      }
      pos.setY(i, h);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: (T.material && T.material.color) || '#4a6b2a', roughness: 0.95, metalness: 0
    });
    if (T.material && T.material.texture) {
      const tex = this._texture(T.material.texture);
      tex.repeat.set(size / 8, size / 8);
      mat.map = tex;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    const heightAt = (x, z) => {
      let h = 0;
      for (const [f, a] of (T.heightNoise || [])) h += Math.sin(x * f * 3.1) * Math.cos(z * f * 2.3) * a + Math.sin((x + z) * f) * a * 0.4;
      for (const fl of T.flatZones || []) {
        const d = Math.hypot(x - fl.x, z - fl.z);
        if (d < fl.r) h *= Math.max(0, Math.min(1, (d - fl.r + 6) / 6));
      }
      return Math.max(0, h);
    };
    this._heightAt = heightAt;
    colliders.push({ type: 'terrain', heightAt });
    return { mesh, heightAt };
  }

  buildObject(o) {
    const mesh = new THREE.Group();
    const colliders = [];
    if (o.type === 'helipad') {
      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(o.size, 0.3, o.size),
        new THREE.MeshStandardMaterial({ map: this._texture('concrete'), roughness: 0.9 }));
      slab.position.set(o.pos[0], o.pos[1], o.pos[2]);
      slab.receiveShadow = true; slab.castShadow = true;
      mesh.add(slab);
      // 中央 H
      const hmat = new THREE.MeshBasicMaterial({ color: '#facc15' });
      for (const [dx, dz, sx, sz] of [[-o.size * 0.22, 0, 0.12, 0.5], [o.size * 0.22, 0, 0.12, 0.5], [0, 0, 0.36, 0.12]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(o.size * sx, 0.05, o.size * sz), hmat);
        bar.position.set(o.pos[0] + dx * o.size / 4, o.pos[1] + 0.17, o.pos[2] + dz * o.size / 4);
        mesh.add(bar);
      }
      colliders.push({ type: 'box', pos: o.pos, size: [o.size, 0.3, o.size] });
    } else if (o.type === 'box') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...o.size), matFrom(o.material));
      m.position.set(...o.pos);
      m.castShadow = m.receiveShadow = true;
      mesh.add(m);
      colliders.push({ type: 'box', pos: o.pos, size: o.size, part: o.id });
    } else if (o.type === 'instanced-trees') {
      const { group, cols } = this.buildTrees(o);
      mesh.add(group);
      colliders.push(...cols);
    }
    return { mesh, colliders };
  }

  buildTrees(o) {
    const group = new THREE.Group();
    const cols = [];
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 6);
    const leafGeo = new THREE.ConeGeometry(1.4, 3.2, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: o.trunk.color, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: o.leaf.color, roughness: 0.9 });
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < o.count; i++) {
      const x = (rnd() - 0.5) * 480, z = (rnd() - 0.5) * 480;
      let ok = true;
      for (const ex of o.exclude || []) if (Math.hypot(x - ex.x, z - ex.z) < ex.r) { ok = false; break; }
      if (!ok) continue;
      const h = o.minH + rnd() * (o.maxH - o.minH);
      const ground = this._heightAt ? this._heightAt(x, z) : 0;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.scale.set(1, h * 0.5, 1);
      trunk.position.set(x, ground + h * 0.25, z);
      trunk.castShadow = true;
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.scale.setScalar(0.7 + rnd() * 0.6);
      leaf.position.set(x, ground + h, z);
      leaf.castShadow = true;
      group.add(trunk, leaf);
      cols.push({ type: 'cylinder', pos: [x, ground + h * 0.4, z], r: 0.6, h: h * 0.9 });
    }
    return { group, cols };
  }

  /* 按 actor.parts 数据构建部件层级（没有硬编码“直升机”形状） */
  buildActor(actorData, partMeshes) {
    const root = new THREE.Group();
    const parts = {};
    const init = actorData.root || { pos: [0, 1, 0], rot: [0, 0, 0] };
    root.position.set(...init.pos);
    root.rotation.set(init.rot[0] || 0, init.rot[1] || 0, init.rot[2] || 0);

    for (const p of actorData.parts || []) {
      let obj = null;
      const m = p.material || {};
      const material = m.texture
        ? new THREE.MeshStandardMaterial({ map: this._texture(m.texture === 'fuselage24' ? 'fuselage24' : m.texture), roughness: m.roughness ?? 0.5, metalness: m.metalness ?? 0.1 })
        : matFrom(m);
      if (p.type === 'compound-fuselage') {
        const grp = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(p.size[2] * 0.5, Math.max(0.1, p.size[0] - p.size[2]), 6, 12), material);
        body.rotation.z = Math.PI / 2;
        body.scale.z = p.size[2] / (p.size[2] + 0.6);
        body.castShadow = body.receiveShadow = true;
        grp.add(body);
        const belly = new THREE.Mesh(new THREE.BoxGeometry(p.size[0] * 0.7, p.size[1] * 0.5, p.size[2] * 0.9),
          new THREE.MeshStandardMaterial({ color: '#6d28d9', roughness: 0.5 }));
        belly.position.y = -0.35;
        belly.castShadow = true;
        grp.add(belly);
        obj = grp;
      } else if (p.type === 'cockpit') {
        obj = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), material);
        obj.scale.set(p.size[0], p.size[1], p.size[2]);
        obj.castShadow = true;
      } else if (p.type === 'tailboom') {
        obj = new THREE.Mesh(new THREE.CylinderGeometry(p.r1, p.r0, p.length, 8), material);
        obj.rotation.z = Math.PI / 2;
        obj.castShadow = true;
      } else if (p.type === 'fin') {
        obj = new THREE.Mesh(new THREE.BoxGeometry(...p.size), material);
        obj.castShadow = true;
      } else if (p.type === 'rotor') {
        const grp = new THREE.Group();
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 8), new THREE.MeshStandardMaterial({ color: '#222' }));
        if (p.rotor === 'tail') hub.rotation.x = Math.PI / 2;
        grp.add(hub);
        const blades = new THREE.Group();
        const bmat = new THREE.MeshStandardMaterial({ color: p.material.color, roughness: 0.4, transparent: true, opacity: 0.92 });
        for (let i = 0; i < p.blades; i++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(p.radius * 2, 0.05, p.bladeWidth), bmat);
          blade.position.x = 0;
          blade.rotation.y = (i / p.blades) * Math.PI * 2;
          const arm = new THREE.Group();
          arm.add(blade);
          const b2 = blade.clone();
          b2.rotation.y = Math.PI;
          arm.add(b2);
          arm.rotation.y = (i / p.blades) * Math.PI;
          blades.add(arm);
        }
        const blur = new THREE.Mesh(new THREE.CircleGeometry(p.radius, 32),
          new THREE.MeshBasicMaterial({ color: '#cfcfd8', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
        blur.rotation.x = -Math.PI / 2;
        if (p.rotor === 'tail') blur.rotation.x = 0;
        grp.add(blur);
        grp.add(blades);
        grp.userData.blades = blades;
        grp.userData.blur = blur;
        grp.userData.axis = p.axis;
        obj = grp;
      } else if (p.type === 'skid') {
        const grp = new THREE.Group();
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, p.length, 8), material);
        bar.rotation.z = Math.PI / 2;
        grp.add(bar);
        for (const dx of [-1.6, 1.6]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), material);
          leg.position.set(dx, 0.5, 0);
          grp.add(leg);
        }
        obj = grp;
      }
      if (!obj) continue;
      obj.position.set(...(p.offset || [0, 0, 0]));
      obj.userData.partId = p.id;
      parts[p.id] = { object: obj, def: p };
      partMeshes[p.id] = obj;
      root.add(obj);
    }
    return { root, parts, initial: init };
  }

  /* 注册一个视图（播放器/投送） */
  addView(key, view) { this.views.set(key, view); }
  removeView(key) { this.views.delete(key); }

  /* 每帧：根据提交更新各视图场景状态并按可见矩形绘制 */
  render(visibleRects) {
    if (this._lost) return;
    const r = this.renderer;
    const W = this.canvas.width, H = this.canvas.height;
    r.setScissorTest(false);
    r.clear(true, true, true);
    r.setScissorTest(true);
    for (const [key, view] of this.views) {
      const rect = visibleRects[key];
      if (!rect || rect.w <= 2 || rect.h <= 2) continue;
      const built = this.sceneLib.get(view.sceneKey);
      if (!built) continue;
      this.applyState(built, view);
      const camera = this.getCamera(built, view);
      const x = rect.x, y = H - rect.y - rect.h;
      r.setViewport(x, y, rect.w, rect.h);
      r.setScissor(x, y, rect.w, rect.h);
      r.clearDepth();
      r.render(built.group, camera);
    }
  }

  applyState(built, view) {
    const st = view.state;
    if (!st) return;
    const pos = st.pos || [0, 1, 0], rot = st.rot || [0, 0, 0];
    built.actorRoot.position.set(pos[0], pos[1], pos[2]);
    built.actorRoot.rotation.set(rot[0], rot[1], rot[2]);
    // 旋翼
    for (const id in built.actorParts) {
      const p = built.actorParts[id];
      if (p.def.type === 'rotor') {
        const blades = p.object.userData.blades;
        const speed = p.def.rotor === 'main' ? (st.rotorMain || 0) : (st.rotorTail || 0);
        const axis = p.object.userData.axis;
        if (axis[1] === 1) blades.rotation.y += speed * 0.05;
        else blades.rotation.x += speed * 0.05;
        p.object.userData.blur.material.opacity = Math.min(0.35, Math.abs(speed) / 60);
      }
      // 损坏：掉落/变暗
      const dmg = (st.damage || {})[id] || 0;
      if (dmg > 0) {
        p.object.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.85; o.material.color && o.material.color.multiplyScalar(1 - dmg / 300); } });
        if (dmg >= 100 && p.def.type === 'rotor') p.object.visible = false;
      }
    }
    built.effects.update(st, view.dt || 0.033, built);
  }

  getCamera(built, view) {
    if (!view._camera) {
      view._camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    }
    const cam = view._camera;
    const c = view.camera || { mode: 'cine', t: 0 };
    const S = built.json;
    if (c.mode === 'free') {
      const p = c.pos || [30, 18, 30];
      cam.position.set(p[0], p[1], p[2]);
      cam.lookAt(c.target || [0, 1, 0]);
    } else if (c.mode === 'follow') {
      const st = view.state || { pos: [0, 1, 0] };
      const f = S.cameras.follow || { distance: 20, height: 7 };
      const want = new THREE.Vector3(st.pos[0] + f.distance * 0.6, st.pos[1] + f.height, st.pos[2] + f.distance * 0.8);
      cam.position.lerp(want, f.smooth || 0.12);
      cam.lookAt(st.pos[0], st.pos[1], st.pos[2]);
    } else {
      const keys = S.cameras.cine;
      let a = keys[0], b = keys[keys.length - 1];
      const t = c.t || 0;
      for (let i = 0; i < keys.length - 1; i++) {
        if (t >= keys[i].t && t <= keys[i + 1].t) { a = keys[i]; b = keys[i + 1]; break; }
      }
      const u = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      cam.position.lerpVectors(v3(a.pos), v3(b.pos), u);
      const look = v3(a.look).lerp(v3(b.look), u);
      cam.lookAt(look);
    }
    const rect = view._rect;
    if (rect) { cam.aspect = rect.w / rect.h; cam.updateProjectionMatrix(); }
    return cam;
  }

  raycast(view, ndc) {
    const built = this.sceneLib.get(view.sceneKey);
    if (!built) return null;
    const cam = this.getCamera(built, view);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndc[0], ndc[1]), cam);
    const hits = ray.intersectObjects(built.group.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.partId) o = o.parent;
      if (o) return { part: o.userData.partId, point: [h.point.x, h.point.y, h.point.z], damage: (view.state.damage || {})[o.userData.partId] || 0 };
    }
    // 地面点
    if (hits.length) return { ground: true, point: [hits[hits.length - 1].point.x, hits[hits.length - 1].point.y, hits[hits.length - 1].point.z] };
    return null;
  }
}

/* 粒子效果（设备层视觉，不推进场景状态：粒子初值由提交状态决定） */
class Effects {
  constructor(renderer, cfg) {
    this.cfg = cfg;
    this.smoke = new ParticleCloud(0x3a3a42, 220, 0.6, 9, true);
    this.fire = new ParticleCloud(0xff7a1e, 90, 0.9, 3.5, false);
    this.dust = new ParticleCloud(0xc8b48c, 260, 0.5, 7, true);
  }
  update(st, dt, built) {
    // 坠毁烟/火
    if (st.impact || st.smoke > 0) {
      const origin = st.impact ? st.impact.pos || st.pos : st.pos;
      this.smoke.emit(origin, Math.min(3, (st.smoke || 30) * dt), dt, 2.2, 1.4);
      this.fire.emit(origin, Math.min(2, (st.fire || 0) * dt), dt, 3.5, 0.4);
    }
    this.smoke.tick(dt, built.group);
    this.fire.tick(dt, built.group);
    // 下洗尘土
    const downwash = (this.cfg && this.cfg.downwash) || {};
    if (downwash.dust && st.pos && st.pos[1] < 18 && (st.rotorMain > 10)) {
      const strength = downwash.strengthByHeight ? piecewise(downwash.strengthByHeight, st.pos[1]) : 0.5;
      this.dust.emit([st.pos[0], 0.2, st.pos[2]], strength * 60 * dt, dt, 4.0, 1.2, true);
    }
    this.dust.tick(dt, built.group);
  }
}

class ParticleCloud {
  constructor(color, max, opacity, size, rise) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.vel = [];
    this.life = new Float32Array(max);
    this.n = 0;
    this.color = color; this.opacity = opacity; this.size = size; this.rise = rise;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
  }
  emit(origin, count, dt, speed, spread, radial) {
    count = Math.round(count);
    for (let i = 0; i < count; i++) {
      if (this.n >= this.max) break;
      const idx = this.n++;
      this.positions[idx * 3] = origin[0] + (Math.random() - 0.5) * spread;
      this.positions[idx * 3 + 1] = origin[1] + Math.random();
      this.positions[idx * 3 + 2] = origin[2] + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      this.vel[idx] = radial
        ? [Math.cos(a) * speed * Math.random(), 0.6 + Math.random(), Math.sin(a) * speed * Math.random()]
        : [(Math.random() - 0.5) * speed * 0.4, speed * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * speed * 0.4];
      this.life[idx] = 2 + Math.random() * 2;
    }
  }
  tick(dt, parent) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const v = this.vel[i];
      this.positions[w * 3] = this.positions[i * 3] + v[0] * dt;
      this.positions[w * 3 + 1] = this.positions[i * 3 + 1] + v[1] * dt;
      this.positions[w * 3 + 2] = this.positions[i * 3 + 2] + v[2] * dt;
      v[1] += (this.color === 0x3a3a42 ? 1.2 : 0) * dt;
      this.vel[w] = v;
      this.life[w] = this.life[i];
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, this.n);
    this.points.geometry.attributes.position.needsUpdate = true;
    if (this.n > 0 && this.points.parent !== parent) { try { parent.add(this.points); } catch (e) {} }
  }
}

function matFrom(m) {
  return new THREE.MeshStandardMaterial({
    color: (m && m.color) || '#888', roughness: m && m.roughness != null ? m.roughness : 0.7,
    metalness: m && m.metalness != null ? m.metalness : 0.1,
    transparent: m && m.glass ? true : false, opacity: m && m.glass ? 0.55 : 1
  });
}
function sunDir(s) {
  const az = s.azimuth || 0.6, el = s.elevation || 0.3;
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}
function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
function smooth(x) { return x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x); }
function piecewise(table, x) {
  let v = table[0][1];
  for (const [xx, vv] of table) { if (x >= xx) v = vv; }
  return v;
}

NOS.Device3D = Device3D;
