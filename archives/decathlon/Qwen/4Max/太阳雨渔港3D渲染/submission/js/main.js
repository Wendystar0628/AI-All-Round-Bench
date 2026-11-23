/* 渲染器、轨道控制、每帧视觉更新、主循环 */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const main = {};
  H.main = main;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.setClearColor(0xe9f4f0);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 420);

  // ---------- 场景搭建 ----------
  H.buildTerrain(scene);
  H.buildBoats(scene);
  H.buildBuildings(scene);
  H.buildProps(scene);
  H.fx.init(scene, renderer, camera);
  H.life.init(scene);
  H.sim.reset();

  // ---------- 轨道控制 ----------
  const ctrl = {
    target: new THREE.Vector3(0, 0.6, 0),
    theta: 0.68, phi: 1.12, dist: 30,
    dTheta: 0.68, dPhi: 1.12, dDist: 30,
    dTarget: new THREE.Vector3(0, 0.6, 0),
    dragging: false, panning: false, lastX: 0, lastY: 0,
    idle: true
  };
  function applyOrbit() {
    ctrl.theta += (ctrl.dTheta - ctrl.theta) * 0.12;
    ctrl.phi += (ctrl.dPhi - ctrl.phi) * 0.12;
    ctrl.dist += (ctrl.dDist - ctrl.dist) * 0.12;
    ctrl.target.lerp(ctrl.dTarget, 0.12);
    const sp = Math.sin(ctrl.phi);
    camera.position.set(
      ctrl.target.x + ctrl.dist * sp * Math.sin(ctrl.theta),
      ctrl.target.y + ctrl.dist * Math.cos(ctrl.phi),
      ctrl.target.z + ctrl.dist * sp * Math.cos(ctrl.theta)
    );
    camera.lookAt(ctrl.target);
  }
  const dom = renderer.domElement;
  dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  dom.addEventListener('pointerdown', function (e) {
    ctrl.idle = false;
    ctrl.dragging = true;
    ctrl.panning = (e.button === 2 || e.button === 1);
    ctrl.lastX = e.clientX; ctrl.lastY = e.clientY;
    dom.classList.add('dragging');
    try { dom.setPointerCapture(e.pointerId); } catch (err) {}
  });
  dom.addEventListener('pointermove', function (e) {
    if (!ctrl.dragging) return;
    const dx = e.clientX - ctrl.lastX, dy = e.clientY - ctrl.lastY;
    ctrl.lastX = e.clientX; ctrl.lastY = e.clientY;
    if (ctrl.panning) {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const s = ctrl.dist * 0.0016;
      ctrl.dTarget.addScaledVector(right, -dx * s);
      ctrl.dTarget.addScaledVector(up, dy * s);
      ctrl.dTarget.x = H.clamp(ctrl.dTarget.x, -14, 14);
      ctrl.dTarget.y = H.clamp(ctrl.dTarget.y, -2.2, 6);
      ctrl.dTarget.z = H.clamp(ctrl.dTarget.z, -14, 14);
    } else {
      ctrl.dTheta -= dx * 0.0052;
      ctrl.dPhi = H.clamp(ctrl.dPhi - dy * 0.0052, 0.14, 1.72);
    }
  });
  dom.addEventListener('pointerup', function (e) {
    ctrl.dragging = false;
    dom.classList.remove('dragging');
  });
  dom.addEventListener('wheel', function (e) {
    e.preventDefault();
    ctrl.idle = false;
    ctrl.dDist = H.clamp(ctrl.dDist * Math.exp(e.deltaY * 0.0011), 3.2, 72);
  }, { passive: false });

  // ---------- 每帧视觉更新 ----------
  const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _q = new THREE.Quaternion();
  const YAXIS = new THREE.Vector3(0, 1, 0);

  function updateRope(rope, t) {
    const bt = rope.boat.boat;
    const cfg = bt.userData.cfg;
    // 出港的船解缆
    if (cfg.id === 'C') {
      const bc = H.sim.boatCState(t);
      rope.group.visible = bc.speed < 0.2;
      if (!rope.group.visible) return;
    }
    _v0.copy(rope.boat.local);
    bt.updateMatrixWorld(true);
    bt.localToWorld(_v0);
    _v1.copy(rope.p1);
    const heave = bt.position.y - L.waterY;
    const sag = H.clamp(rope.sag - heave * 0.7, 0.1, 0.42);
    const n = rope.links.length;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const ax = H.lerp(_v0.x, _v1.x, t0), ay = H.lerp(_v0.y, _v1.y, t0) - Math.sin(t0 * Math.PI) * sag, az = H.lerp(_v0.z, _v1.z, t0);
      const bx = H.lerp(_v0.x, _v1.x, t1), by = H.lerp(_v0.y, _v1.y, t1) - Math.sin(t1 * Math.PI) * sag, bz = H.lerp(_v0.z, _v1.z, t1);
      const link = rope.links[i];
      link.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
      _q.setFromUnitVectors(YAXIS, new THREE.Vector3(dx / len, dy / len, dz / len));
      link.quaternion.copy(_q);
      link.scale.y = len * 1.06;
      link.material = (ay + by) / 2 < L.waterY + 0.07 ? rope.wetM : rope.dryM;
    }
  }

  function updateCloth(t) {
    // 旗与网
    (H.anim.flags || []).forEach(function (f) {
      const wind = H.sim.windAt(t, f.pole.x, f.pole.z);
      const pos = f.mesh.geometry.attributes.position;
      const base = f.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const k = x / 0.44;
        pos.array[i * 3 + 2] = Math.sin(x * 9 - t * (4 + wind * 7) + f.phase) * 0.045 * k * (0.35 + wind);
        pos.array[i * 3 + 1] = y + Math.sin(x * 6 - t * 3.4) * 0.012 * k * wind;
      }
      pos.needsUpdate = true;
      f.mesh.geometry.computeVertexNormals();
    });
    (H.anim.nets || []).forEach(function (nt) {
      const wind = H.sim.windAt(t, -7.4, 2.9);
      const pos = nt.mesh.geometry.attributes.position;
      const base = nt.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        const sag = -Math.cos(x * 1.6) * 0.06 - (0.55 - Math.abs(y)) * 0.04;
        pos.array[i * 3 + 2] = sag + Math.sin(x * 3.2 + t * 2.1 + nt.phase) * 0.035 * (0.3 + wind) + Math.sin(y * 2.4 + t * 1.6) * 0.02 * wind;
      }
      pos.needsUpdate = true;
      nt.mesh.geometry.computeVertexNormals();
    });
    // 风向袋
    const ws = H.anim.windsock;
    if (ws) {
      const wind = H.sim.windAt(t, -5.95, -5.35);
      const wn = H.clamp((wind - 0.12) / 0.95, 0, 1);
      ws.pivot.rotation.y = -0.78 + Math.sin(t * 2.6) * 0.12 * (0.3 + wn);
      ws.pivot.rotation.z = -(1 - wn) * 0.55 + Math.sin(t * 3.1) * 0.05 * wn;
      ws.sock.scale.x = 1 + Math.sin(t * 5.2) * 0.06 * wn;
    }
    // 浮球
    (H.anim.floatBalls || []).forEach(function (fb) {
      const wind = H.sim.windAt(t, fb.base.x, fb.base.z);
      fb.mesh.position.y = fb.base.y - 0.06 + Math.sin(t * 1.6 + fb.phase) * 0.02 * (0.5 + wind);
      fb.mesh.position.x = fb.base.x + Math.sin(t * 1.1 + fb.phase) * 0.015 * wind;
    });
    // 树冠
    (H.anim.trees || []).forEach(function (tr) {
      const wind = H.sim.windAt(t, tr.x, tr.z);
      tr.node.rotation.z = Math.sin(t * 1.05 + tr.phase) * 0.018 + wind * 0.07 * Math.sin(t * 3.4 + tr.phase);
      tr.node.rotation.x = Math.sin(t * 0.85 + tr.phase * 1.7) * 0.014 + wind * 0.04 * Math.cos(t * 2.9 + tr.phase);
    });
    // 海藻
    (H.anim.seaweed || []).forEach(function (sw) {
      sw.mesh.rotation.x = Math.sin(t * 1.15 + sw.phase) * sw.amp;
      sw.mesh.rotation.z = Math.cos(t * 0.9 + sw.phase * 1.3) * sw.amp * 0.6;
    });
  }

  main.updateVisuals = function (t) {
    // 系泊船（轻微向岸壁涌动，护舷偶尔轻碰）
    ['A', 'B', 'D'].forEach(function (id) {
      const bt = H.refs.boats[id];
      const cfg = bt.userData.cfg;
      const m = H.sim.boatMotion(id, t);
      const surge = Math.max(0, Math.sin(t * 0.37 + cfg.seed)) * 0.035;
      bt.position.y = L.waterY + m.heave;
      bt.position.x = cfg.x - (id === 'A' ? 0 : surge);
      bt.position.z = cfg.z + (id === 'A' ? surge : 0);
      bt.rotation.y = cfg.ry + m.yaw;
      bt.userData.bob.rotation.z = m.roll;
      bt.userData.bob.rotation.x = m.pitch;
    });
    // 出港船 C
    const C = H.refs.boats.C;
    const bc = H.sim.boatCState(t);
    const heaveC = H.sim.wave(t, bc.x, bc.z);
    const surgeC = bc.speed < 0.2 ? Math.max(0, Math.sin(t * 0.37 + 74)) * 0.035 : 0;
    C.position.set(bc.x, L.waterY + heaveC, bc.z + surgeC);
    C.rotation.y = bc.heading;
    C.userData.bob.rotation.z = 0.02 * Math.sin(t * 0.8) + (bc.speed > 0.3 ? 0.03 * Math.sin(t * 1.7) : 0);
    C.userData.bob.rotation.x = bc.speed > 0.3 ? -0.02 : 0.012 * Math.sin(t * 0.6);
    // 缆绳
    H.anim.ropes.forEach(function (r) { updateRope(r, t); });
    // 浮标
    H.anim.buoys.forEach(function (b) {
      const m = H.sim.buoyMotion(b, t);
      b.group.position.y = L.waterY + m.heave;
      b.group.rotation.z = m.tilt;
      b.group.rotation.x = m.tilt * 0.6;
    });
    updateCloth(t);
    // 灯塔
    const lf = H.sim.lampFade;
    H.refs.lighthouseLamp.material.color.setRGB(1, 0.9 + 0.08 * lf, 0.75 + 0.15 * lf);
    H.refs.lighthouseGlow.visible = lf > 0.04;
    H.refs.lighthouseGlow.material.opacity = lf * (0.75 + 0.2 * Math.sin(t * 2.2));
    const gs = 1.2 + lf * 0.5 + Math.sin(t * 2.2) * 0.1 * lf;
    H.refs.lighthouseGlow.scale.set(gs, gs, 1);
    // 贩卖机微光
    H.refs.vmGlow.material.opacity = 0.4 + 0.08 * Math.sin(t * 1.9) + 0.04 * Math.sin(t * 7.3);
    // 生物
    H.life.update(t, {
      gulls: H.sim.gulls, cat: H.sim.cat, fish: sim_fish(), distantBoat: H.sim.distantBoat,
      camPos: camera.position
    });
    // 视觉特效
    H.fx.update(t, H.sim.env(t));
  };
  function sim_fish() { return H.sim.fish; }

  main.renderFrame = function () {
    H.fx.renderReflections(camera);
    renderer.render(scene, camera);
  };

  main.applyCamera = function (pos, look) {
    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateMatrixWorld();
  };

  let exportMode = false;
  main.setExport = function (v) { exportMode = v; };

  main.camera = camera;
  main.renderer = renderer;
  main.scene = scene;

  // ---------- 主循环 ----------
  let acc = 0;
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    if (exportMode) { last = now; return; }
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (ctrl.idle) ctrl.dTheta += dt * 0.03;
    applyOrbit();
    acc += dt;
    let steps = 0;
    while (acc >= H.sim.DT && steps < 8) {
      H.sim.step(camera.position);
      acc -= H.sim.DT;
      steps++;
    }
    if (steps === 8) acc = 0;
    main.updateVisuals(H.sim.time);
    main.renderFrame();
  }

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  applyOrbit();
  main.updateVisuals(0);
  main.renderFrame();
  requestAnimationFrame(loop);

})(window.HARBOR);