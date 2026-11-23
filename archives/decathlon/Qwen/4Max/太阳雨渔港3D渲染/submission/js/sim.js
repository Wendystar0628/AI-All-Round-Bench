/* 确定性固定步长模拟：天气、阵风、船、海鸥、猫、鱼群、涟漪 */
'use strict';
(function (H) {
  const P = H.PAL, L = H.LAYOUT;
  const DT = 1 / 60;
  const sim = {};
  H.sim = sim;
  sim.DT = DT;

  // ---------- 纯环境函数 ----------
  const rainKeys = [[0, 0.6], [8, 0.72], [14, 0.5], [20, 0.25], [28, 0.2], [36, 0.4], [44, 0.68], [52, 0.8], [60, 0.5], [66, 0.28], [72, 0.4], [80, 0.65], [88, 0.75], [94, 0.5], [100, 0.6]];
  sim.rainI = function (t) { return H.keyCurve(rainKeys, t); };
  sim.cloudF = function (t) {
    const c1 = H.pulse(t % 47, 18, 30, 4) * 0.5;
    const c2 = H.pulse(t % 160, 55, 63, 2.5) * 0.7;
    return H.clamp(1 - c1 - c2, 0.22, 1);
  };
  sim.cloudShadowPos = function (t) {
    if (H.pulse(t % 160, 55, 63, 2.5) > 0.05) return H.smoothstep(50, 68, t % 160);
    return H.smoothstep(14, 34, t % 47);
  };
  sim.gustStart = function (t) {
    if (t < 10) return -100;
    return Math.floor((t - 10) / 22) * 22 + 10;
  };
  sim.gustEnv = function (local) {
    if (local < 0 || local > 9) return 0;
    return H.pulse(local, 0.8, 6.2, 1.3);
  };
  sim.windAt = function (t, x, z) {
    const gs = sim.gustStart(t);
    const delay = ((11 - x) + (11 - z)) * 0.055;
    return 0.12 + sim.gustEnv(t - gs - delay) * 0.95;
  };
  sim.wave = function (t, x, z) {
    return 0.02 * Math.sin(t * 0.9 + x * 0.5) + 0.015 * Math.sin(t * 1.3 + z * 0.7) + 0.008 * Math.sin(t * 0.5 + (x + z) * 0.3);
  };

  // ---------- 船 C 航线 ----------
  const routePts = [
    new THREE.Vector3(4.2, 0, 3.12), new THREE.Vector3(5.7, 0, 3.0), new THREE.Vector3(7.3, 0, 1.2),
    new THREE.Vector3(8.7, 0, -2.2), new THREE.Vector3(8.4, 0, -5.8), new THREE.Vector3(6.2, 0, -8.6),
    new THREE.Vector3(2.6, 0, -10.0), new THREE.Vector3(-1.2, 0, -9.6), new THREE.Vector3(-2.9, 0, -7.8),
    new THREE.Vector3(-2.4, 0, -5.2), new THREE.Vector3(0.4, 0, -2.6), new THREE.Vector3(3.0, 0, 0.2),
    new THREE.Vector3(4.7, 0, 1.9), new THREE.Vector3(4.2, 0, 3.0)
  ];
  const route = new THREE.CatmullRomCurve3(routePts, false, 'catmullrom', 0.35);
  sim.route = route;
  const routeLen = route.getLength();
  sim.boatCState = function (t) {
    const T = t % 110;
    const out = { x: 4.2, z: 3.12, heading: Math.PI / 2, speed: 0, cruising: false };
    if (T >= 56 && T <= 94) {
      const u = H.clamp((T - 56) / 38, 0, 1);
      const p = route.getPointAt(u);
      const tan = route.getTangentAt(u);
      out.x = p.x; out.z = p.z;
      out.heading = Math.atan2(tan.x, tan.z);
      out.speed = routeLen / 38;
      out.cruising = true;
    } else if (T > 94 && T < 97) {
      const k = H.smooth((T - 94) / 3);
      const p = route.getPointAt(1);
      const tan = route.getTangentAt(0.999);
      out.x = H.lerp(p.x, 4.2, k); out.z = H.lerp(p.z, 3.12, k);
      out.heading = H.lerp(Math.atan2(tan.x, tan.z), Math.PI / 2, k);
      out.speed = (1 - k) * 0.4;
    } else if (T >= 53 && T < 56) {
      const k = H.smooth((T - 53) / 3);
      out.x = 4.2 + k * 0.25; out.z = 3.12 - k * 0.1;
      out.heading = Math.PI / 2 - k * 0.12;
      out.speed = k * 0.15;
    }
    return out;
  };

  // ---------- 状态 ----------
  sim.reset = function () {
    sim.time = 0;
    sim.rng = H.mulberry32(20260714);
    sim.wakePoints = [];
    sim.wakeTimer = 0;
    sim.rainbowFade = 0;
    sim.lampFade = 0;
    sim.scatter = 0;
    // 海鸥
    sim.gulls = [];
    const perches = [
      { pos: H.refs.bollardGullPos.clone(), type: 'perch' },
      { pos: new THREE.Vector3(-3.28, L.waterY + 1.32, -1.9), type: 'perch' },
      null, null,
      { pos: new THREE.Vector3(6.4, L.waterY + 0.03, -5.6), type: 'water' }
    ];
    for (let i = 0; i < 5; i++) {
      sim.gulls.push({
        mode: perches[i] ? perches[i].type : 'circle',
        home: perches[i] ? perches[i].pos.clone() : null,
        pos: perches[i] ? perches[i].pos.clone() : new THREE.Vector3(0, 5, 0),
        heading: 0, bank: 0, pitch: 0, glide: false,
        phase: i * 1.7, stateT: 0, cooldown: 0, lookCam: false,
        circleC: new THREE.Vector3(i === 2 ? 1 : -2, i === 2 ? 4.8 : 5.8, i === 2 ? 0.5 : -3),
        circleR: i === 2 ? 7 : 6, circleR2: i === 2 ? 4.5 : 5,
        circleDir: i === 3 ? -1 : 1,
        flyFrom: new THREE.Vector3(), flyTo: new THREE.Vector3()
      });
    }
    // 猫
    sim.cat = {
      mode: 'curled', pos: new THREE.Vector3(8.8, 0.5, 2.95), heading: 2.2,
      speed: 0, lookCam: false, dryTimer: 0, tripT: 0, wpIdx: 0, pauseT: 0,
      waypoints: [], tripSeed: 0
    };
    // 鱼
    const fr = H.mulberry32(99);
    sim.fish = {
      center: new THREE.Vector3(3.2, -0.7, -3),
      angles: [], speeds: [], radii: [], yOff: [], scatter: 0
    };
    for (let i = 0; i < 12; i++) {
      sim.fish.angles.push(fr() * 6.28);
      sim.fish.speeds.push(0.25 + fr() * 0.3);
      sim.fish.radii.push(0.5 + fr() * 0.9);
      sim.fish.yOff.push((fr() - 0.5) * 0.5);
    }
    sim.distantBoat = { visible: false, x: 0, z: -11.4, heading: Math.PI / 2 };
    sim.dripTimers = (H.anim.dripPoints || []).map(function () { return sim.rng() * 2; });
  };

  sim.catWaypoints = function (seed) {
    const r = H.mulberry32(seed);
    const base = [[9.0, 4.6], [7.6, 5.6], [6.2, 6.3], [7.0, 7.6], [8.8, 6.9], [9.6, 5.6]];
    return base.map(function (p, i) {
      return new THREE.Vector3(p[0] + (i === 0 ? 0 : (r() - 0.5) * 0.9), L.quayY, p[1] + (i === 0 ? 0 : (r() - 0.5) * 0.9));
    });
  };

  // ---------- 单步 ----------
  sim.step = function (camPos) {
    const t = sim.time;
    H.fx.time = t;   // 保证快进/重置时生成的涟漪时间戳正确
    const rain = sim.rainI(t);
    const cloud = sim.cloudF(t);
    const rng = sim.rng;

    // 彩虹淡入淡出
    const rbTarget = (rain < 0.33 && sim.rainI(t - 5) > 0.42) ? 1 : 0;
    sim.rainbowFade += (rbTarget - sim.rainbowFade) * Math.min(1, DT * (rbTarget > sim.rainbowFade ? 0.35 : 0.5));
    // 灯塔
    const lampTarget = cloud < 0.42 ? 1 : 0;
    sim.lampFade += (lampTarget - sim.lampFade) * Math.min(1, DT * 1.2);

    // 船 C 与航迹
    const bc = sim.boatCState(t);
    if (bc.cruising && bc.speed > 0.3) {
      sim.wakeTimer -= DT;
      if (sim.wakeTimer <= 0) {
        sim.wakePoints.push({ x: bc.x - Math.sin(bc.heading) * 1.4, z: bc.z - Math.cos(bc.heading) * 1.4, t: t });
        sim.wakeTimer = 0.16;
        if (rng() < 0.3) H.fx.spawnRipple(bc.x - Math.sin(bc.heading) * 1.8, bc.z - Math.cos(bc.heading) * 1.8, L.waterY + 0.02, 0.3, 1.8);
      }
    }
    while (sim.wakePoints.length && t - sim.wakePoints[0].t > 7.5) sim.wakePoints.shift();

    // 海鸥
    sim.gulls.forEach(function (gs, i) {
      gs.stateT += DT;
      gs.cooldown = Math.max(0, gs.cooldown - DT);
      const distCam = gs.pos.distanceTo(camPos);
      gs.lookCam = (gs.mode === 'perch' || gs.mode === 'water') && distCam < 4.5;
      if ((gs.mode === 'perch' || gs.mode === 'water') && distCam < 2.3 && gs.cooldown <= 0) {
        // 惊飞
        gs.mode = 'startle'; gs.stateT = 0;
        gs.flyFrom.copy(gs.pos);
        const away = gs.pos.clone().sub(camPos); away.y = 0;
        if (away.lengthSq() < 0.01) away.set(1, 0, 1);
        away.normalize().multiplyScalar(6);
        gs.flyTo.copy(gs.pos).add(away).add(new THREE.Vector3(0, 3.5, 0));
      } else if (gs.mode === 'startle') {
        const k = Math.min(1, gs.stateT / 2.2);
        const e = H.easeInOut(k);
        gs.pos.lerpVectors(gs.flyFrom, gs.flyTo, e);
        gs.pos.y += Math.sin(k * Math.PI) * 1.2;
        const d = gs.flyTo.clone().sub(gs.flyFrom);
        gs.heading = Math.atan2(d.x, d.z);
        gs.pitch = -0.25 * (1 - k);
        gs.glide = false;
        if (k >= 1) { gs.mode = 'circle'; gs.stateT = 0; gs.circleC.copy(gs.flyTo); gs.circleR = 3; gs.circleR2 = 2.5; }
      } else if (gs.mode === 'circle') {
        const a = gs.stateT * 0.55 * gs.circleDir + gs.phase;
        // 偶尔低空掠过水面
        const skim = Math.pow(Math.max(0, Math.sin(t * 0.09 + gs.phase * 2.1)), 3) * 3.8;
        const alt = Math.max(L.waterY + 0.3, gs.circleC.y + Math.sin(gs.stateT * 0.7) * 0.4 - skim);
        gs.pos.set(gs.circleC.x + Math.cos(a) * gs.circleR, alt, gs.circleC.z + Math.sin(a) * gs.circleR2);
        gs.heading = Math.atan2(-Math.sin(a) * gs.circleR * gs.circleDir, Math.cos(a) * gs.circleR2 * gs.circleDir);
        gs.bank = 0.28 * gs.circleDir;
        gs.glide = Math.sin(gs.stateT * 0.23 + gs.phase) > 0.25;
        gs.pitch = 0.03 * Math.sin(gs.stateT * 0.7);
        const dur = gs.home ? 4.5 : 1e9;
        if (gs.home && gs.stateT > dur) {
          gs.mode = 'return'; gs.stateT = 0;
          gs.flyFrom.copy(gs.pos); gs.flyTo.copy(gs.home);
        }
      } else if (gs.mode === 'return') {
        const k = Math.min(1, gs.stateT / 3);
        gs.pos.lerpVectors(gs.flyFrom, gs.flyTo, H.easeInOut(k));
        gs.pos.y += Math.sin(k * Math.PI) * 0.8;
        const d = gs.flyTo.clone().sub(gs.flyFrom);
        gs.heading = Math.atan2(d.x, d.z);
        gs.pitch = 0.15 * (1 - k);
        gs.glide = k > 0.6;
        if (k >= 1) {
          gs.mode = gs.home && gs.home.y < L.quayY ? 'water' : 'perch';
          gs.pos.copy(gs.home); gs.cooldown = 9; gs.bank = 0; gs.pitch = 0;
        }
      } else if (gs.mode === 'perch' || gs.mode === 'water') {
        gs.pos.copy(gs.home);
        if (gs.mode === 'perch' && i === 1) gs.pos.y = L.waterY + 1.32 + sim.wave(t, -3.28, -1.9);
        gs.heading = (i * 1.3 + Math.sin(t * 0.1 + i) * 0.3) % 6.28;
        gs.bank = 0; gs.pitch = 0;
      }
    });

    // 猫
    const cat = sim.cat;
    const catDistCam = cat.pos.distanceTo(camPos);
    if (cat.mode === 'curled') {
      cat.speed = 0; cat.lookCam = false;
      if (rain < 0.36) cat.dryTimer += DT; else cat.dryTimer = 0;
      if (cat.dryTimer > 1.5) {
        cat.mode = 'walk'; cat.tripT = 0; cat.wpIdx = 0; cat.dryTimer = 0;
        cat.tripSeed = (cat.tripSeed || 0) + 1;
        cat.waypoints = sim.catWaypoints(cat.tripSeed * 17 + 3);
        cat.pos.set(8.8, 0.5, 2.95);
      }
    } else if (cat.mode === 'walk' || cat.mode === 'run') {
      cat.tripT += DT;
      const predictRain = sim.rainI(t + 2.5);
      if ((predictRain > 0.5 || cat.tripT > 21) && cat.mode === 'walk') {
        cat.mode = 'run';
        cat.waypoints = [new THREE.Vector3(9.0, L.quayY, 4.6), new THREE.Vector3(8.8, 0.5, 2.95)];
        cat.wpIdx = 0;
      }
      // 镜头靠近 → 停步抬头
      if (catDistCam < 2.6 && cat.mode === 'walk' && cat.pauseT <= 0 && cat.lookCool <= 0) {
        cat.pauseT = 1.9; cat.lookCool = 6;
      }
      cat.lookCool = Math.max(0, (cat.lookCool || 0) - DT);
      if (cat.pauseT > 0) {
        cat.pauseT -= DT; cat.speed = 0; cat.lookCam = true;
      } else {
        cat.lookCam = false;
        const wp = cat.waypoints[cat.wpIdx];
        if (wp) {
          const d = wp.clone().sub(cat.pos);
          const dist = d.length();
          const spd = cat.mode === 'run' ? 1.5 : 0.55;
          cat.speed = spd;
          if (dist < 0.12) {
            cat.wpIdx++;
            if (cat.wpIdx >= cat.waypoints.length) {
              if (cat.mode === 'run') { cat.mode = 'curled'; cat.pos.set(8.8, 0.5, 2.95); cat.speed = 0; }
              else { cat.wpIdx = 1; }  // 循环漫步
            }
          } else {
            d.normalize();
            cat.pos.addScaledVector(d, spd * DT);
            cat.heading = Math.atan2(d.x, d.z);
          }
        }
      }
    }

    // 鱼群散开
    const fc = sim.fish.center;
    fc.set(3.2 + Math.sin(t * 0.11) * 2.2, -0.7 + Math.sin(t * 0.15) * 0.2, -3 + Math.cos(t * 0.09) * 2);
    const fishDist = fc.distanceTo(camPos);
    const scTarget = fishDist < 3.4 ? 1 : 0;
    sim.fish.scatter += (scTarget - sim.fish.scatter) * Math.min(1, DT * (scTarget > sim.fish.scatter ? 2.2 : 0.5));

    // 远处渔船
    const dT = t % 47;
    if (dT >= 8 && dT <= 26) {
      sim.distantBoat.visible = true;
      sim.distantBoat.x = H.lerp(-3.5, 13.5, (dT - 8) / 18);
    } else sim.distantBoat.visible = false;

    // 涟漪（雨点）
    if (rng() < rain * 0.55) {
      const x = -4 + rng() * 14.6, z = -10.6 + rng() * 14.6;
      H.fx.spawnRipple(x, z, L.waterY + 0.018, 0.1 + rng() * 0.14, 1.3 + rng() * 0.6);
    }
    if (rng() < rain * 0.3) {
      const puddles = [[1.15, 6.15], [-2.3, 7.9], [5.9, 6.8], [-6.1, 2.3]];
      const p = puddles[(rng() * 4) | 0];
      H.fx.spawnRipple(p[0] + (rng() - 0.5) * 0.7, p[1] + (rng() - 0.5) * 0.5, L.quayY + 0.022, 0.07 + rng() * 0.08, 1.0);
    }
    // 滴水
    (H.anim.dripPoints || []).forEach(function (dp, i) {
      sim.dripTimers[i] -= DT * (0.4 + rain);
      if (sim.dripTimers[i] <= 0) {
        sim.dripTimers[i] = (1 / Math.max(0.05, dp.rate)) * (0.6 + rng() * 0.8);
        H.fx.spawnDrop(dp.pos, dp.groundY, dp.water);
      }
    });

    sim.time += DT;
  };

  sim.advanceTo = function (target, camPosFn) {
    if (target < sim.time - 1e-6) sim.reset();
    let guard = 0;
    const cp = new THREE.Vector3();
    while (sim.time < target - 1e-6 && guard < 200000) {
      camPosFn(sim.time, cp);
      sim.step(cp);
      guard++;
    }
  };

  // ---------- 环境汇总 ----------
  sim.env = function (t) {
    const gs = sim.gustStart(t);
    const gLocal = t - gs;
    const gStrength = sim.gustEnv(gLocal);
    const frontD = Math.max(0, gLocal) * 4.2;
    const bc = sim.boatCState(t);
    return {
      cloud: sim.cloudF(t),
      rain: sim.rainI(t),
      wind: 0.12 + gStrength * 0.9,
      gustStrength: gStrength,
      gustX: 11 - 0.7 * frontD,
      gustZ: -11 + 0.7 * frontD,
      gustRadius: 2.6,
      rainbow: sim.rainbowFade,
      cloudShadowPos: sim.cloudShadowPos(t),
      wakePoints: sim.wakePoints,
      boatMoving: bc.speed > 0.35,
      boatX: bc.x, boatZ: bc.z,
      boatDirX: Math.sin(bc.heading), boatDirZ: Math.cos(bc.heading),
      wakeNear: bc.speed > 0.5 ? 0.5 : 0,
      dt: DT
    };
  };

  // ---------- 船体运动（含航迹浪） ----------
  sim.boatMotion = function (id, t) {
    const cfg = H.refs.boats[id].userData.cfg;
    const phase = cfg.seed;
    let heave = sim.wave(t, cfg.x, cfg.z);
    let roll = 0.022 * Math.sin(t * 0.7 + phase);
    let pitch = 0.016 * Math.sin(t * 0.55 + phase * 1.3);
    let yaw = 0.012 * Math.sin(t * 0.3 + phase);
    // 航迹浪
    for (let i = 0; i < sim.wakePoints.length; i++) {
      const wp = sim.wakePoints[i];
      const dx = cfg.x - wp.x, dz = cfg.z - wp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const arrival = wp.t + dist / 3.2;
      const k = t - arrival;
      if (k > 0 && k < 2.6) {
        const amp = 0.055 * Math.exp(-dist * 0.1) * Math.sin(k * 5.5) * (1 - k / 2.6);
        heave += amp;
        roll += amp * 0.9;
      }
    }
    return { heave: heave, roll: roll, pitch: pitch, yaw: yaw };
  };

  sim.buoyMotion = function (b, t) {
    let heave = sim.wave(t, b.x, b.z) * 1.6;
    let tilt = 0.06 * Math.sin(t * 0.8 + b.phase);
    for (let i = 0; i < sim.wakePoints.length; i++) {
      const wp = sim.wakePoints[i];
      const dx = b.x - wp.x, dz = b.z - wp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const arrival = wp.t + dist / 3.2;
      const k = t - arrival;
      if (k > 0 && k < 2.6) {
        const amp = 0.09 * Math.exp(-dist * 0.08) * Math.sin(k * 5.5) * (1 - k / 2.6);
        heave += amp; tilt += amp * 1.4;
      }
    }
    return { heave: heave, tilt: tilt };
  };

})(window.HARBOR);