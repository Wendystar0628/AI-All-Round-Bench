/* Time-driven motion, orbit viewing, and the fixed tour export. */
(function () {
  var W = HR.W;
  var scene = HR.scene;

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0xd7eef0, 1);
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  document.body.appendChild(renderer.domElement);
  HR.renderer = renderer;

  var camera = new THREE.PerspectiveCamera(34, 1, 0.07, 480);
  camera.position.set(16.4, 11.4, 18.6);
  HR.camera = camera;

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(-0.8, 0.1, -2.2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.15;
  controls.maxDistance = 46;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.5 + 0.02;
  controls.enablePan = true;
  controls.zoomSpeed = 0.85;
  controls.rotateSpeed = 0.75;
  HR.controls = controls;

  function fit() {
    var w = window.innerWidth || 1280;
    var h = Math.max(1, window.innerHeight || 720);
    var pr = (w * h > 2560 * 1440) ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', fit);
  fit();

  var KEYS = [
    [50, -1.45, -8.05],
    [54, 2.0, -7.7],
    [58, 7.5, -9.2],
    [62, 13.5, -11.2],
    [66, 17.2, -14.0],
    [71, 17.0, -16.9],
    [78, 6.0, -16.9],
    [84, 2.0, -16.6],
    [88, 16.5, -15.2],
    [93, 11.2, -9.4],
    [97, 1.6, -8.1],
    [100, -1.45, -8.05]
  ];

  function sampleKeys(t) {
    if (t <= KEYS[0][0]) return { x: KEYS[0][1], z: KEYS[0][2] };
    for (var i = 0; i < KEYS.length - 1; i++) {
      if (t <= KEYS[i + 1][0]) {
        var u = (t - KEYS[i][0]) / (KEYS[i + 1][0] - KEYS[i][0]);
        u = u * u * (3 - 2 * u);
        return { x: HR.lerp(KEYS[i][1], KEYS[i + 1][1], u), z: HR.lerp(KEYS[i][2], KEYS[i + 1][2], u) };
      }
    }
    var l = KEYS[KEYS.length - 1];
    return { x: l[1], z: l[2] };
  }

  var yawTable = [];
  (function () {
    var prev = 0;
    for (var t = 50; t <= 100.05; t += 0.25) {
      var a = sampleKeys(t);
      var b = sampleKeys(Math.min(100, t + 0.2));
      var yaw = HR.yawFromDir(b.x - a.x, b.z - a.z);
      while (yaw - prev > Math.PI) yaw -= Math.PI * 2;
      while (prev - yaw > Math.PI) yaw += Math.PI * 2;
      prev = yaw;
      yawTable.push({ t: t, yaw: yaw });
    }
  })();

  function yawAt(t) {
    if (t <= yawTable[0].t) return yawTable[0].yaw;
    for (var i = 0; i < yawTable.length - 1; i++) {
      if (t <= yawTable[i + 1].t) {
        var u = (t - yawTable[i].t) / (yawTable[i + 1].t - yawTable[i].t);
        return HR.lerp(yawTable[i].yaw, yawTable[i + 1].yaw, u);
      }
    }
    return yawTable[yawTable.length - 1].yaw;
  }

  function cyc(t) { return ((t % 120) + 120) % 120; }

  function rainDensity(t) {
    var u = cyc(t);
    var r = 0.5 + 0.045 * Math.sin(t * 0.11);
    var w1 = HR.smooth(32, 36.5, u) * (1 - HR.smooth(47, 53, u));
    r = HR.lerp(r, 0.14, w1);
    var w2 = HR.smooth(78, 84, u) * (1 - HR.smooth(100, 108, u));
    r = HR.lerp(r, 0.16, w2);
    return HR.clamp(r, 0.08, 0.9);
  }

  function gustRaw(t) {
    var period = 26;
    var d = Math.abs(((t - 28) % period + period) % period);
    d = Math.min(d, period - d);
    if (d < 1.15) return 1;
    if (d < 4.4) return HR.lerp(1, 0.1, (d - 1.15) / 3.25);
    return 0.1;
  }

  function gustAt(x, z, t) {
    var delay = (18 - x) / 9.2 + (z + 14) * 0.015;
    return gustRaw(t - delay);
  }

  function weather(t) {
    var u = cyc(t);
    var deep = Math.exp(-Math.pow((u - 53) / 2.05, 2));
    return {
      cx: ((t * 2.35) % 92) - 36,
      cz: 2,
      dx: 1,
      dz: 0,
      amt: 0.95,
      sunVis: 1 - 0.5 * deep,
      deep: deep,
      rain: rainDensity(t),
      gust: gustRaw(t)
    };
  }

  function wakeRockAt(x, z, t) {
    var u = cyc(t);
    var e = 0;
    for (var k = 0; k < 8; k++) {
      var tt = u - k * 0.45;
      if (tt < 50 || tt > 100) continue;
      var p = sampleKeys(tt);
      var dx = p.x - x, dz = p.z - z;
      e += Math.exp(-(dx * dx + dz * dz) / 6.5) * (1 - k / 8);
    }
    return e;
  }

  function travelerPose(t) {
    var u = cyc(t);
    var bob = Math.sin(t * 0.92 + 0.3) * 0.038;
    if (u < 50 || u >= 100) {
      return { x: -1.45, z: -8.05, y: HR.WATER_Y + bob, yaw: 0, moving: 0, u: u };
    }
    var p = sampleKeys(u);
    return { x: p.x, z: p.z, y: HR.WATER_Y + bob * 0.65, yaw: yawAt(u), moving: 1, u: u };
  }

  function moorAmount(t) {
    var u = cyc(t);
    if (u < 49 || u > 101) return 1;
    if (u < 52.5) return 1 - (u - 49) / 3.5;
    if (u < 95) return 0;
    if (u < 100) return (u - 95) / 5;
    return 1;
  }

  var PATH_A = [
    [3.45, 0.08, 6.7], [3.15, 0.02, 8.7], [2.3, 0.02, 11.3],
    [0.7, 0.02, 13.7], [-2.0, 0.02, 14.5], [-5.0, 0.02, 13.1], [-3.8, 0.02, 11.2]
  ];
  var PATH_A_BACK = [
    [-3.8, 0.02, 11.2], [-0.8, 0.02, 12.2], [1.5, 0.02, 10.0], [3.45, 0.08, 6.7]
  ];
  var PATH_B = [
    [3.45, 0.08, 6.7], [5.5, -0.48, 6.55], [7.15, -0.48, 7.15],
    [4.6, 0.02, 9.5], [-0.4, 0.02, 8.1], [-6.2, 0.02, 9.0], [-9.0, 0.02, 13.2], [-6.2, 0.02, 15.6]
  ];
  var PATH_B_BACK = [
    [-6.2, 0.02, 15.6], [-1.5, 0.02, 15.0], [1.4, 0.02, 12.4], [3.45, 0.08, 6.7]
  ];

  function catPlan(t) {
    var u = cyc(t);
    if (u >= 34 && u < 46) return { mode: 'walk', path: PATH_A, u: (u - 34) / 12 };
    if (u >= 46 && u < 50.5) return { mode: 'run', path: PATH_A_BACK, u: (u - 46) / 4.5 };
    if (u >= 80 && u < 96) return { mode: 'walk', path: PATH_B, u: (u - 80) / 16 };
    if (u >= 96 && u < 102) return { mode: 'run', path: PATH_B_BACK, u: (u - 96) / 6 };
    return { mode: 'sit', path: PATH_A, u: 0 };
  }

  function pathPose(points, u, out) {
    u = HR.clamp(u, 0, 0.9999);
    var lens = [];
    var total = 0;
    for (var i = 0; i < points.length - 1; i++) {
      var L = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1], points[i + 1][2] - points[i][2]) || 0.001;
      lens.push(L);
      total += L;
    }
    var dist = u * total;
    for (i = 0; i < lens.length; i++) {
      if (dist <= lens[i] || i === lens.length - 1) {
        var tt = HR.clamp(dist / lens[i], 0, 1);
        var a = points[i], b = points[i + 1];
        out.set(HR.lerp(a[0], b[0], tt), HR.lerp(a[1], b[1], tt), HR.lerp(a[2], b[2], tt));
        return HR.yawFromDir(b[0] - a[0], b[2] - a[2]);
      }
      dist -= lens[i];
    }
    out.set(points[0][0], points[0][1], points[0][2]);
    return 0;
  }

  var _a = new THREE.Vector3();
  var _b = new THREE.Vector3();
  var _c = new THREE.Vector3();
  var _d = new THREE.Vector3();
  var _e = new THREE.Vector3();
  var _up = new THREE.Vector3(0, 1, 0);

  function updateBoats(t) {
    var pose = travelerPose(t);
    W.boats.forEach(function (boat, bi) {
      var ph = boat.spec.phase || 0;
      var bob = Math.sin(t * (0.72 + (bi % 3) * 0.08) + ph) * 0.04;
      var roll = Math.sin(t * 0.53 + ph) * 0.028;
      var pitch = Math.cos(t * 0.46 + ph * 1.3) * 0.018;
      var rk = wakeRockAt(boat.home.x, boat.home.z, t);
      if (boat === W.traveler && pose.moving) {
        boat.root.position.set(pose.x, pose.y, pose.z);
        boat.root.rotation.y = pose.yaw;
        boat.rock.rotation.z = Math.sin(t * 1.1) * 0.03;
        boat.rock.rotation.x = Math.cos(t * 0.9) * 0.02;
      } else {
        boat.root.position.set(boat.home.x, HR.WATER_Y + bob + rk * 0.06, boat.home.z);
        boat.root.rotation.y = boat.home.yaw;
        var bump = Math.pow(Math.max(0, -Math.sin(t * (0.65 + bi * 0.05) + ph)), 10);
        boat.rock.rotation.z = roll + rk * 0.1 + bump * 0.06;
        boat.rock.rotation.x = pitch + rk * 0.04;
      }
      boat.refl.position.y = (HR.WATER_Y - 0.035) - boat.root.position.y;
    });
    // wake ribbons
    for (var i = 0; i < W.wakes.length; i++) {
      var wm = W.wakes[i];
      if (!pose.moving) { wm.material.opacity = 0; continue; }
      var tt = pose.u - (i + 1) * 0.42;
      if (tt < 50) { wm.material.opacity = 0; continue; }
      var p = sampleKeys(tt);
      var p2 = sampleKeys(Math.min(100, tt + 0.3));
      wm.position.set(p.x, HR.WATER_Y + 0.03, p.z);
      wm.rotation.y = HR.yawFromDir(p2.x - p.x, p2.z - p.z);
      var age = (i + 1) / W.wakes.length;
      wm.material.opacity = (1 - age) * 0.75;
      wm.scale.set(0.7 + age * 1.6, 1, 0.5 + age);
    }
    return pose;
  }

  function updateRopes(t) {
    var moor = moorAmount(t);
    var sagBreath = 0.12 + Math.sin(t * 0.8) * 0.05;
    W.ropes.forEach(function (r) {
      var boll = W.bollards[r.bollard];
      var boat = W.boats[r.boat];
      if (!boll || !boat) return;
      _a.set(0, 0.5, 0);
      boll.localToWorld(_a);
      boat.cleat.getWorldPosition(_b);
      var hang = _c.set(boll.position.x + 0.15, HR.WATER_Y - 0.35, boll.position.z + 0.25);
      var m = (boat === W.traveler) ? moor : 1;
      _b.lerp(hang, 1 - m);
      var sag = 0.22 + (1 - m) * 0.55 + sagBreath;
      var n = r.rope.n;
      var mid = _d.copy(_a).lerp(_b, 0.5);
      mid.y -= sag;
      for (var i = 0; i < n; i++) {
        var t0 = i / n, t1 = (i + 1) / n;
        function bez(tt, out) {
          var u = 1 - tt;
          out.set(
            u * u * _a.x + 2 * u * tt * mid.x + tt * tt * _b.x,
            u * u * _a.y + 2 * u * tt * mid.y + tt * tt * _b.y,
            u * u * _a.z + 2 * u * tt * mid.z + tt * tt * _b.z
          );
        }
        bez(t0, _e);
        var p1 = _e.clone();
        bez(t1, _e);
        HR.orientY(r.rope.segs[i], p1, _e, 0.045);
        r.rope.segs[i].material = ((p1.y + _e.y) * 0.5 < HR.WATER_Y) ? HR.ropeWet : HR.ropeDry;
      }
    });
  }

  var gullOff = [0, 8, 13.2, 18, 4, 22, 14, 27];

  function perchPoint(p, out) {
    if (p.kind === 'bollard') {
      var b = W.bollards[p.i];
      out.set(b.position.x, 0.74, b.position.z);
      return;
    }
    if (p.kind === 'water') {
      out.set(p.x, HR.WATER_Y + 0.06 + Math.sin(HR.U.uTime.value * 1.5 + p.x) * 0.03, p.z);
      return;
    }
    var boat = W.boats[p.boat];
    boat.rock.updateWorldMatrix(true, false);
    out.set(p.local[0], p.local[1], p.local[2]).applyMatrix4(boat.rock.matrixWorld);
  }

  function updateGulls(t) {
    var period = 36;
    W.gulls.forEach(function (g, i) {
      var u = ((t + gullOff[i]) % period) / period;
      var ang = t * (0.26 + i * 0.02) + i * 1.15;
      var rad = 4.2 + (i % 4) * 1.35;
      var cx = -1 + (i % 3);
      var cz = -2 + (i % 2) * 2.5;
      var fx = cx + Math.cos(ang) * rad;
      var fz = cz + Math.sin(ang) * rad * 0.72;
      var fy = 3.5 + (i % 3) * 0.6 + Math.sin(t * 0.65 + i) * 0.22;
      var fyaw = HR.yawFromDir(-Math.sin(ang), Math.cos(ang) * 0.72);
      var perch = W.perches[i % W.perches.length];
      perchPoint(perch, _a);
      var dist = camera.position.distanceTo(_a);
      var spook = HR.smooth(5.4, 2.05, dist);
      var flyW, px, py, pz, yaw;
      if (u < 0.52) {
        flyW = 1; px = fx; py = fy; pz = fz; yaw = fyaw;
      } else if (u < 0.64) {
        var k = (u - 0.52) / 0.12;
        flyW = 1 - k;
        px = HR.lerp(fx, _a.x, k);
        py = HR.lerp(fy, _a.y, k);
        pz = HR.lerp(fz, _a.z, k);
        yaw = fyaw;
      } else if (u < 0.84) {
        flyW = 0; px = _a.x; py = _a.y; pz = _a.z; yaw = fyaw * 0.2;
      } else {
        var k2 = (u - 0.84) / 0.16;
        flyW = k2;
        px = HR.lerp(_a.x, fx, k2);
        py = HR.lerp(_a.y, fy, k2);
        pz = HR.lerp(_a.z, fz, k2);
        yaw = fyaw;
      }
      if (spook > 0.02 && u > 0.5 && u < 0.9) {
        _b.copy(_a).sub(camera.position); _b.y = 0;
        if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0); else _b.normalize();
        var fleeY = _a.y + 1.8 + spook * 1.4;
        var fleeX = _a.x + _b.x * (1.6 + spook * 2.2);
        var fleeZ = _a.z + _b.z * (1.6 + spook * 2.2);
        px = HR.lerp(px, fleeX, spook);
        py = HR.lerp(py, fleeY, spook);
        pz = HR.lerp(pz, fleeZ, spook);
        flyW = Math.max(flyW, spook);
        yaw = HR.yawFromDir(_b.x, _b.z);
      }
      g.g.position.set(px, py, pz);
      g.g.rotation.y = yaw;
      var flap = Math.sin(t * (flyW > 0.25 ? 10 : 2) + i) * (0.15 + flyW * 0.7);
      g.wL.rotation.z = HR.lerp(1.05, flap, flyW);
      g.wR.rotation.z = HR.lerp(-1.05, -flap, flyW);
      g.rock.rotation.z = Math.sin(t * 0.8 + i) * 0.08 * flyW;
    });
  }

  function updateCat(t) {
    var cat = W.cat;
    if (!cat) return;
    var plan = catPlan(t);
    var yaw = 0;
    if (plan.mode === 'sit') {
      _a.set(3.45, 0.05, 6.7);
      yaw = 0.4;
      cat.body.position.set(0, 0.06, 0);
      cat.body.rotation.x = 0.35;
      cat.body.scale.set(1, 1 + Math.sin(t * 2.1) * 0.03, 1);
      cat.legs.forEach(function (leg, i) { leg.rotation.x = 1.15; leg.rotation.z = (i % 2 ? 0.4 : -0.4); });
    } else {
      yaw = pathPose(plan.path, plan.u, _a);
      var step = Math.sin(t * (plan.mode === 'run' ? 14 : 7));
      cat.body.position.set(0, 0.16 + Math.abs(step) * 0.02, 0);
      cat.body.rotation.x = 0.05;
      cat.body.scale.set(1, 1, 1);
      cat.legs.forEach(function (leg, i) {
        var s = (i < 2 ? 1 : -1) * (i % 2 ? 1 : -1);
        leg.rotation.x = step * s * (plan.mode === 'run' ? 0.9 : 0.55);
        leg.rotation.z = 0;
      });
    }
    cat.root.position.copy(_a);
    cat.root.rotation.y = yaw;
    cat.tail.forEach(function (seg, i) {
      if (plan.mode === 'sit') {
        seg.rotation.y = 0.45 + i * 0.22;
        seg.rotation.x = -0.12;
      } else {
        seg.rotation.y = Math.sin(t * 2.4 + i) * 0.25;
        seg.rotation.x = -0.35 + Math.sin(t * 1.6 + i) * 0.12;
      }
    });
    var dist = camera.position.distanceTo(cat.root.position);
    var look = HR.smooth(6.2, 2.1, dist);
    cat.head.parent.updateWorldMatrix(true, false);
    _b.copy(camera.position);
    cat.head.parent.worldToLocal(_b);
    _b.sub(cat.head.position);
    var hy = Math.atan2(-_b.x, -_b.z);
    var hp = Math.atan2(_b.y, Math.hypot(_b.x, _b.z));
    cat.head.rotation.order = 'YXZ';
    var restX = plan.mode === 'sit' ? 0.25 : 0;
    cat.head.rotation.y = HR.clamp(hy, -1.2, 1.2) * look;
    cat.head.rotation.x = HR.lerp(restX, HR.clamp(-hp, -0.7, 0.9), look);
  }

  function updateFish(t) {
    W.fish.forEach(function (f) {
      var ang = t * f.speed + f.ph;
      var x = f.cx + Math.cos(ang) * f.rx;
      var z = f.cz + Math.sin(ang * 0.92) * f.rz;
      var y = f.cy + Math.sin(t * 1.7 + f.ph) * 0.1;
      var x2 = f.cx + Math.cos(ang + 0.07) * f.rx;
      var z2 = f.cz + Math.sin((ang + 0.07) * 0.92) * f.rz;
      _a.set(x, y, z);
      var dist = camera.position.distanceTo(_a);
      var close = HR.smooth(8.2, 3.0, dist);
      var cycN = (t * 0.2 + f.ph * 0.13) % 1;
      var env = cycN < 0.22 ? cycN / 0.22 : cycN < 0.42 ? 1 : Math.max(0, 1 - (cycN - 0.42) / 0.58);
      var s = close * env;
      _b.copy(_a).sub(camera.position);
      _b.y = 0;
      if (_b.lengthSq() < 1e-5) _b.set(1, 0, 0); else _b.normalize();
      _a.addScaledVector(_b, s * 1.35);
      _a.addScaledVector(f.scatter, s * 0.65);
      f.m.position.copy(_a);
      f.m.rotation.y = HR.yawFromDir(x2 - x, z2 - z);
    });
  }

  function updateWorldish(t, wth) {
    W.trees.forEach(function (tr, i) {
      var g = gustAt(tr.position.x, tr.position.z, t);
      tr.rotation.z = Math.sin(t * 1.3 + i) * 0.02 + g * 0.14;
      tr.rotation.x = g * 0.05 * Math.sin(t * 1.7 + i);
    });
    W.flags.forEach(function (f) {
      var g = gustAt(f.x, f.z, t);
      f.parts.forEach(function (p, i) {
        p.rotation.y = Math.sin(t * 2.4 + i * 0.7) * (0.12 + g * 0.85) * (0.35 + i * 0.25);
      });
    });
    if (W.windsock) {
      var gs = gustAt(-1.15, 7.7, t);
      W.windsock.forEach(function (p, i) {
        p.rotation.x = (1 - gs) * 0.55 + i * 0.04;
        p.rotation.y = -0.55 + Math.sin(t * 4 + i) * 0.12 * gs;
      });
    }
    if (W.floatRope) W.floatRope.rotation.z = Math.sin(t * 1.6) * (0.08 + gustAt(-5.3, 7.6, t) * 0.45);
    W.nets.forEach(function (net) {
      var g = gustAt(-6.4, 7.6, t);
      var arr = net.mesh.geometry.attributes.position.array;
      var base = net.base;
      for (var i = 0; i < arr.length; i += 3) {
        var x = base[i], y = base[i + 1];
        var amp = (1 - (y + 0.6)) * (0.04 + g * 0.28);
        arr[i] = x;
        arr[i + 1] = y;
        arr[i + 2] = base[i + 2] + Math.sin(t * 3.1 + x * 3 + y) * amp;
      }
      net.mesh.geometry.attributes.position.needsUpdate = true;
    });
    W.seaweed.forEach(function (s) {
      s.pivots.forEach(function (p, i) {
        p.rotation.z = Math.sin(t * 1.25 + s.phase + i * 0.6) * 0.22 * (i + 1) / 3;
        p.rotation.x = Math.cos(t * 1.05 + s.phase) * 0.12;
      });
    });
    W.foams.forEach(function (f) {
      var pulse = 0.82 + 0.18 * Math.sin(t * 1.7 + f.ph);
      var rk = wakeRockAt(f.x, f.z, t);
      var s = f.s * pulse * (1 + rk * 0.9);
      if (f.line) f.m.scale.set(s * 1.15, 0.07, s * 0.42);
      else f.m.scale.set(s, Math.max(0.04, f.s * 0.28), s * 0.72);
      f.m.position.y = HR.WATER_Y + 0.025 + Math.sin(t * 2.1 + f.ph) * 0.02 + rk * 0.05;
      f.m.material.opacity = 0.55 + rk * 0.4;
    });
    W.buoys.forEach(function (b) {
      var rk = wakeRockAt(b.x, b.z, t);
      b.g.position.y = HR.WATER_Y + Math.sin(t * 1.15 + b.ph) * 0.055 + rk * 0.14;
      b.g.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.1 + rk * 0.4;
      b.g.rotation.x = Math.cos(t * 0.8 + b.ph) * 0.08;
    });
    W.ripples.forEach(function (r) {
      var p = (t * 0.33 + r.ph) % 1;
      r.m.position.set(r.x, HR.WATER_Y + 0.035, r.z);
      r.m.scale.setScalar(0.35 + p * 2.4);
      r.m.material.opacity = (1 - p) * 0.38;
    });
    if (W.gustFront) {
      var cycG = ((t - 28) % 26 + 26) % 26;
      var spanG = 4.8;
      var ampG = 0;
      if (cycG < spanG) {
        var fadeIn = Math.min(1, cycG / 0.4);
        var fadeOut = Math.min(1, (spanG - cycG) / 1.05);
        ampG = Math.min(fadeIn, fadeOut);
      }
      // front starts at the east sea (x=18) and runs west toward the quay
      W.gustFront.position.x = 18 - cycG * 9.2;
      W.gustFront.position.y = HR.WATER_Y + 0.16;
      W.gustFront.material.opacity = ampG * 0.88;
      if (W.gustFront.material.map) W.gustFront.material.map.offset.y = -t * 0.04;
    }
    if (W.rainbow) {
      var rb = HR.smooth(0.32, 0.16, wth.rain) * (1 - wth.deep) * wth.sunVis;
      W.rainbow.material.opacity = rb * 0.2;
    }
    if (W.lighthouse) {
      var on = wth.deep;
      W.lighthouse.lamp.material.color.setRGB(1, 0.82 + on * 0.12, 0.55 + on * 0.25);
      W.lighthouse.mat.opacity = on * 0.42;
      W.lighthouse.pivot.rotation.y = t * 0.7;
    }
    if (W.clock) {
      var minutes = (10 * 60 + t * 0.45) % (12 * 60);
      W.clock.minute.rotation.z = -(minutes % 60) / 60 * Math.PI * 2;
      W.clock.hour.rotation.z = -minutes / (12 * 60) * Math.PI * 2;
    }
    (W.coats || []).forEach(function (c, i) {
      c.rotation.z = Math.sin(t * 0.7 + i) * 0.05;
    });
    if (W.shaftDrops) {
      W.shaftDrops.forEach(function (d) {
        var f = (t * 0.4 + d.ph) % 1;
        d.m.position.set(-15.2 + d.ox, 2.55 - f * 2.15, 12.35);
        d.m.material.opacity = Math.sin(f * Math.PI) * wth.sunVis * 0.85;
      });
    }
    W.shafts.forEach(function (mat) {
      mat.uniforms.uInt.value = (0.18 + 0.32 * wth.sunVis) * (0.9 + 0.1 * Math.sin(t * 1.4));
    });
    W.mist.forEach(function (m, i) {
      m.position.x = 3 + i * 3.2 + Math.sin(t * 0.12 + i) * 1.4;
      m.material.opacity = 0.14 + Math.sin(t * 0.2 + i) * 0.05;
    });
    W.distant.forEach(function (d) {
      var u = ((t + d.phase) % 48) / 48;
      var x = HR.lerp(19.5, -1.2, u);
      d.g.position.set(x, HR.WATER_Y, -17.2);
      d.g.rotation.y = Math.PI / 2;
      d.g.visible = u > 0.04 && u < 0.94;
    });
    // drips
    W.dripList.forEach(function (d, i) {
      var mesh = W.dripMeshes[i];
      if (!mesh || !d.obj) return;
      var p = ((t + d.off) % d.period) / d.period;
      d.obj.getWorldPosition(_c);
      if (p < 0.66) {
        mesh.position.copy(_c);
        mesh.scale.setScalar(0.016 + p * 0.01);
        mesh.material.opacity = 0.9;
      } else {
        var f = (p - 0.66) / 0.34;
        mesh.position.set(_c.x, HR.lerp(_c.y, Math.min(_c.y - 0.05, HR.WATER_Y + 0.02), f), _c.z);
        mesh.scale.setScalar(0.022);
        mesh.material.opacity = 1 - f;
      }
    });
    if (W.umbrella) {
      W.umbrella.beads.forEach(function (b, i) {
        b.scale.setScalar(0.02 * (0.75 + 0.25 * Math.sin(t * 1.5 + i)));
      });
    }
    // puddle gull reflection
    if (W.puddle) {
      var on = 0, gx = 0, gz = 0, best = 99;
      W.gulls.forEach(function (g) {
        var dx = g.g.position.x - W.puddle.x;
        var dz = g.g.position.z - W.puddle.z;
        var dd = dx * dx + dz * dz;
        if (dd < best && dd < 6 && g.g.position.y < 7 && g.g.position.y > 0.15) {
          best = dd; on = 1; gx = g.g.position.x; gz = g.g.position.z;
        }
      });
      W.puddle.mat.uniforms.uGull.value.set(gx, gz);
      W.puddle.mat.uniforms.uGullOn.value = on;
    }
  }

  var SHOTS = [
    { t0: 0, t1: 7, a: [17.4, 15.2, 21.2], b: [8.8, 8.4, 13.6], la: [3.2, 0.6, -7.4], lb: [-0.6, 0.2, -1.4], f0: 42, f1: 34 },
    { t0: 7, t1: 12, a: [8.2, 2.35, 7.2], b: [0.8, 2.1, 3.6], la: [-2.2, 0.05, -1.5], lb: [-2.0, 0.15, -6.2], f0: 36, f1: 33 },
    { t0: 12, t1: 16.5, a: [1.7, 2.05, 1.55], b: [-1.5, 0.98, -0.25], la: [-3.42, 0.7, -1.3], lb: [-3.42, 0.82, -1.3], f0: 34, f1: 26 },
    { t0: 16.5, t1: 21.5, a: [5.7, 2.05, 14.25], b: [4.45, 1.55, 13.25], la: [2.15, 0.4, 11.75], lb: [2.95, 0.62, 11.25], f0: 36, f1: 32 },
    { t0: 21.5, t1: 26, a: [5.15, 0.62, 8.05], b: [4.35, 0.38, 7.35], la: [3.4, 0.12, 6.65], lb: [3.42, 0.14, 6.6], f0: 32, f1: 24 },
    { t0: 26, t1: 31, a: [7.5, 1.35, -0.8], b: [3.8, 1.05, 1.0], la: [-0.8, 0.55, 6.8], lb: [-4.2, 0.85, 7.4], f0: 42, f1: 36 },
    { t0: 37, t1: 42.5, a: [-8.2, 1.72, 11.35], b: [-10.7, 1.42, 11.15], la: [-16.6, 1.25, 11.05], lb: [-17.3, 1.32, 11.2], f0: 38, f1: 32 },
    { t0: 42.5, t1: 47.5, a: [-14.6, 1.55, 20.05], b: [-17.2, 1.42, 19.85], la: [-15.6, 1.15, 14.75], lb: [-18.0, 1.35, 14.85], f0: 44, f1: 38 },
    { t0: 47.5, t1: 52.5, a: [11.2, -0.05, 23.15], b: [12.15, -1.25, 21.7], la: [10.2, -2.7, 16.6], lb: [11.9, -3.45, 15.6], f0: 36, f1: 32 },
    { t0: 52.5, t1: 56.5, a: [18.4, 2.8, -8.2], b: [15.6, 1.55, -11.4], la: [12.3, 2.0, -13.7], lb: [12.8, 0.9, -14.4], f0: 34, f1: 30 }
  ];

  function ease(t0, t1, t) {
    var u = HR.clamp((t - t0) / Math.max(0.0001, t1 - t0), 0, 1);
    return u * u * (3 - 2 * u);
  }

  function applyTour(t) {
    if (t >= 31 && t < 37) {
      var u = ease(31, 37, t);
      var boat = W.pleasure;
      boat.rock.updateWorldMatrix(true, false);
      _a.set(1.95, 1.3, 0.42).applyMatrix4(boat.rock.matrixWorld);
      _b.set(1.38, 1.0, 0.02).applyMatrix4(boat.rock.matrixWorld);
      _d.set(-0.02, 0.72, 0.02).applyMatrix4(boat.rock.matrixWorld);
      _e.set(0.02, 0.65, -0.22).applyMatrix4(boat.rock.matrixWorld);
      camera.position.lerpVectors(_a, _b, u);
      camera.lookAt(_d.lerp(_e, u));
      camera.fov = HR.lerp(32, 26, u);
      camera.updateProjectionMatrix();
      return;
    }
    if (t >= 56.5) {
      var u2 = ease(56.5, 60, t);
      var pose = travelerPose(t);
      camera.position.set(pose.x + HR.lerp(4.5, 8.2, u2), pose.y + HR.lerp(3.8, 9.2, u2), pose.z + HR.lerp(5.2, 7.5, u2));
      camera.lookAt(pose.x, pose.y + 0.7, pose.z);
      camera.fov = HR.lerp(36, 32, u2);
      camera.updateProjectionMatrix();
      return;
    }
    var s = SHOTS[0];
    for (var i = 0; i < SHOTS.length; i++) {
      if (t < SHOTS[i].t1) { s = SHOTS[i]; break; }
    }
    var u3 = ease(s.t0, s.t1, t);
    camera.position.set(HR.lerp(s.a[0], s.b[0], u3), HR.lerp(s.a[1], s.b[1], u3), HR.lerp(s.a[2], s.b[2], u3));
    camera.lookAt(HR.lerp(s.la[0], s.lb[0], u3), HR.lerp(s.la[1], s.lb[1], u3), HR.lerp(s.la[2], s.lb[2], u3));
    camera.fov = HR.lerp(s.f0, s.f1, u3);
    camera.updateProjectionMatrix();
  }

  function applyTime(t, tour) {
    HR.U.uTime.value = t;
    var wth = weather(t);
    HR.U.uSunVis.value = wth.sunVis;
    HR.U.uCloudCenter.value.set(wth.cx, 0, wth.cz);
    HR.U.uCloudDir.value.set(wth.dx, wth.dz);
    HR.U.uCloudAmt.value = wth.amt;
    HR.U.uSunDir.value.copy(HR.SUN);
    HR.U.uRain.value = wth.rain;
    HR.U.uSlant.value = 0.18 + gustAt(16, -6, t) * 0.95;
    updateBoats(t);
    scene.updateMatrixWorld(true);
    updateRopes(t);
    if (tour) applyTour(t);
    updateGulls(t);
    updateCat(t);
    updateFish(t);
    updateWorldish(t, wth);
  }
  HR.applyTime = applyTime;

  var TOUR_DURATION = 60;
  var exportMode = false;
  var liveOrigin = performance.now() / 1000;
  var saved = null;
  var exportFps = 30;

  window.videoExport = {
    runs: ['tour'],
    begin: async function (runId, opts) {
      if (runId !== 'tour') throw new Error('unknown run');
      exportMode = true;
      HR.exportMode = true;
      controls.enabled = false;
      exportFps = (opts && opts.fps) ? opts.fps : 30;
      saved = {
        pos: camera.position.clone(),
        quat: camera.quaternion.clone(),
        fov: camera.fov,
        target: controls.target.clone(),
        liveT: performance.now() / 1000 - liveOrigin
      };
      applyTime(0, true);
      renderer.render(scene, camera);
      return { frames: Math.round(TOUR_DURATION * exportFps) };
    },
    frame: async function (i) {
      var t = i / exportFps;
      applyTime(t, true);
      renderer.render(scene, camera);
    },
    end: function () {
      exportMode = false;
      HR.exportMode = false;
      controls.enabled = true;
      if (saved) {
        camera.position.copy(saved.pos);
        camera.quaternion.copy(saved.quat);
        camera.fov = saved.fov;
        camera.updateProjectionMatrix();
        controls.target.copy(saved.target);
        liveOrigin = performance.now() / 1000 - saved.liveT;
      }
      saved = null;
    }
  };

  window.__harborTest = function () {
    applyTime(0, false);
    var p0 = W.fish[0].m.position.clone();
    applyTime(4, false);
    var moved = p0.distanceTo(W.fish[0].m.position);
    applyTime(0, false);
    var nose = new THREE.Vector3(0, 0, -1).applyQuaternion(W.traveler.root.quaternion);
    var pose = travelerPose(58);
    return {
      fishMoved: moved,
      bowZ: nose.z,
      bowX: nose.x,
      travelerAt58: pose,
      frames3: Math.round(60 * 3),
      frames60: Math.round(60 * 60),
      boats: W.boats.length,
      gulls: W.gulls.length
    };
  };

  function loop() {
    requestAnimationFrame(loop);
    if (exportMode) return;
    var t = performance.now() / 1000 - liveOrigin;
    controls.update();
    applyTime(t, false);
    renderer.render(scene, camera);
  }
  applyTime(0, false);
  renderer.render(scene, camera);
  loop();
})();
