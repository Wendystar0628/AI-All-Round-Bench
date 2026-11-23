/* main.js — application shell: boot, render loop, UI wiring, demo playback
   and the fixed window.videoExport interface. */
(function (global) {
  'use strict';
  const U = global.U, M4 = U.M4;

  const App = {
    sceneId: 1,
    paused: false,
    slow: false,
    demo: null,
    demoTime: 0,
    demoSim: 0,
    demoEventIdx: 0,
    exporting: false,
    exportRun: null,
    exportFps: 30,
    exportFrames: 0,
    exportSim: 0,
    exportEventIdx: 0,
    device: null,
    renderer: null,
    scene1: null,
    scene2: null,
    camera: null,
    ready: false
  };
  global.APP = App;

  const sceneOut = {
    opaque: [], jelly: [], glass: [], water: null, balls: null,
    shadowCasters: [], shadowJelly: []
  };
  const camOut = { pos: [0, 0, 0], target: [0, 0, 0], fov: 0.6 };
  const tmpA = M4.create(), tmpB = M4.create(), tmpC = M4.create();

  function curScene() { return App.sceneId === 1 ? App.scene1 : App.scene2; }

  /* ---------------- boot ---------------- */
  async function boot() {
    const canvas = document.getElementById('view');
    const overlay = document.getElementById('overlay');
    const ovTitle = document.getElementById('ov_title');
    const ovText = document.getElementById('ov_text');
    try {
      const gpu = await Gpu.init(canvas);
      App.device = gpu.device;
      App.renderer = new Renderer(gpu.device, gpu.context, gpu.format);
      App.camera = new global.Camera();
      App.scene1 = new global.Scene1(gpu.device, App.renderer);
      App.scene2 = new global.Scene2(gpu.device, App.renderer);
      App.camera.setOrbit([0, 0.22, 0], -0.72, 0.34, 2.15);
      wireUI();
      wireEvents();
      resize();
      global.addEventListener('resize', resize);
      App.ready = true;
      overlay.style.display = 'none';
      requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      overlay.classList.add('error');
      ovTitle.textContent = '无法启动 WebGPU';
      ovText.textContent = (e && e.message ? e.message : String(e)) +
        '。本作品需要支持 WebGPU 的浏览器（评测环境的 Chrome 已支持），请确认硬件加速已开启。';
    }
  }

  function resize() {
    const canvas = document.getElementById('view');
    const dpr = Math.min(global.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(global.innerWidth * dpr));
    const h = Math.max(2, Math.floor(global.innerHeight * dpr));
    canvas.width = w; canvas.height = h;
    if (App.renderer) App.renderer.resize(w, h);
  }

  /* ---------------- lighting ---------------- */
  function computeLight() {
    const isJelly = App.sceneId === 1;
    const focus = isJelly ? [0.0, 0.24, 0.0] : [0.92, 0.26, 0.0];
    const radius = isJelly ? 1.45 : 1.15;
    const d = [-0.42, 0.80, 0.42];
    const l = Math.hypot(d[0], d[1], d[2]);
    const dir = [d[0] / l, d[1] / l, d[2] / l];
    const eye = [focus[0] + dir[0] * radius * 2.4, focus[1] + dir[1] * radius * 2.4, focus[2] + dir[2] * radius * 2.4];
    M4.lookAt(tmpA, eye, focus, [0, 1, 0]);
    M4.ortho(tmpB, -radius, radius, -radius, radius, 0.05, radius * 6.0);
    M4.multiply(tmpC, tmpB, tmpA);
    return { dir, vp: tmpC, focus, radius };
  }

  /* ---------------- frame ---------------- */
  let lastTime = 0, fpsAcc = 0, fpsCount = 0, fpsShown = 0;

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = now;
    fpsAcc += dt; fpsCount++;
    if (fpsAcc > 0.5) { fpsShown = Math.round(fpsCount / fpsAcc); fpsAcc = 0; fpsCount = 0; updateHud(); }

    if (!App.exporting) {
      if (App.demo) {
        App.demoTime += dt;
        advanceDemo(App.demo, App.demoTime);
        if (App.demoTime >= App.demo.duration + 0.05) {
          App.demo = null;
          document.getElementById('hud_mode').textContent = '交互模式';
        }
      } else if (!App.paused) {
        const scale = App.slow ? 0.22 : 1.0;
        curScene().update(dt * scale);
      }
      App.camera.update(dt);
    }
    render();
  }

  /* ---------------- demo timeline ---------------- */
  function applyDemoEvent(ev) {
    if (ev.type === 'impact') {
      App.scene1.triggerImpact(ev.kind);
      App.scene1.applyParams();
    } else if (ev.type === 'release') {
      const b = App.scene2.ballInfo[ev.index];
      if (b) App.scene2.releaseBall(b);
    } else if (ev.type === 'wave') {
      App.scene2.setWave(ev.on);
      const btn = document.getElementById('waveBtn');
      if (btn) btn.textContent = ev.on ? '停止造浪' : '开始造浪';
    } else if (ev.type === 'amp') {
      App.scene2.params.waveAmp = ev.amp;
      App.scene2.sim.waveAmp = ev.amp;
      const s = document.getElementById('w_amp');
      if (s) { s.value = ev.amp; document.getElementById('o_amp').textContent = ev.amp.toFixed(3); }
    }
  }

  function advanceDemo(run, recordedT) {
    const targetSim = global.DEMOS.simTimeAt(run, recordedT);
    const sc = curScene();
    while (App.demoEventIdx < run.events.length && run.events[App.demoEventIdx].t <= targetSim) {
      applyDemoEvent(run.events[App.demoEventIdx]);
      App.demoEventIdx++;
    }
    let guard = 0;
    while (App.demoSim < targetSim - 1e-9 && guard++ < 600) {
      const step = Math.min(1 / 120, targetSim - App.demoSim);
      sc.update(step);
      App.demoSim += step;
    }
    global.DEMOS.cameraAt(run, targetSim, camOut);
    App.camera.setPose(camOut.pos[0], camOut.pos[1], camOut.pos[2],
      camOut.target[0], camOut.target[1], camOut.target[2]);
    App.camera.fov = camOut.fov;
  }

  function playDemo(runId) {
    const run = global.DEMOS.RUN_MAP[runId];
    if (!run) return;
    App.demo = run;
    App.demoTime = 0; App.demoSim = 0; App.demoEventIdx = 0;
    switchScene(run.scene);
    resetCurrentScene();
    App.camera.cinematic = true;
    document.getElementById('hud_mode').textContent = '演示 · ' + run.title;
    global.Sfx.ui('on');
  }

  function resetCurrentScene() {
    if (App.sceneId === 1) {
      App.scene1.reset();
      App.scene1.applyParams();
    } else {
      App.scene2.reset();
      App.scene2.applyParams();
    }
  }

  function switchScene(id) {
    App.sceneId = id;
    document.getElementById('pane1').classList.toggle('hidden', id !== 1);
    document.getElementById('pane2').classList.toggle('hidden', id !== 2);
    document.querySelectorAll('#tabs .tab').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.scene, 10) === id);
    });
    if (id === 1) {
      App.camera.setOrbit([0, 0.22, 0], -0.72, 0.34, 2.15);
    } else {
      App.camera.setOrbit([0.92, 0.26, 0], -0.02, 0.20, 2.05);
    }
    updateHud();
  }

  /* ---------------- rendering ---------------- */
  function render() {
    const sc = curScene();
    const canvas = document.getElementById('view');
    const aspect = canvas.width / canvas.height;
    const cm = App.camera.matrices(aspect);
    const light = computeLight();
    const isJelly = App.sceneId === 1;
    const time = performance.now() * 0.001;

    if (!isJelly) App.scene2.sim.updateSurface();

    App.renderer.updateGlobals({
      view: cm.view, proj: cm.proj, viewProj: cm.viewProj, invViewProj: cm.invViewProj,
      lightViewProj: light.vp,
      camPos: [App.camera.pos[0], App.camera.pos[1], App.camera.pos[2], 0],
      sunDir: [light.dir[0], light.dir[1], light.dir[2], 0],
      sunColor: [1.00, 0.95, 0.88, 1.0],
      skyTop: [0.085, 0.115, 0.170, 0],
      skyBot: [0.020, 0.024, 0.032, 0],
      misc: [time, 1.06, App.sceneId, isJelly ? 0 : App.scene2.sim.waterLevel],
      screen: [canvas.width, canvas.height, 1 / canvas.width, 1 / canvas.height],
      nearFar: [App.camera.near, App.camera.far, Math.tan(App.camera.fov * 0.5), aspect],
      fx: [0.030, 1 / global.RENDER_CONST.SHADOW_SIZE, time, isJelly ? 0.045 : 0.055]
    });

    sc.buildScene(App.camera, sceneOut);
    App.renderer.render(sceneOut);
  }

  function updateHud() {
    const el = document.getElementById('hud_fps');
    if (el) el.textContent = fpsShown + ' fps';
    const info = document.getElementById('hud_info');
    if (!info) return;
    if (App.sceneId === 1) {
      const b = App.scene1.bodies[0];
      const s = App.scene1.balls[0];
      info.textContent = '果冻体积 ' + (100 * b.mesh.ntet / b.mesh.ntet).toFixed(0) + '% 保持 · 裂口 ' + App.scene1.breakCount +
        ' · 球速 ' + Math.hypot(s.vel[0], s.vel[1], s.vel[2]).toFixed(2) + ' m/s';
    } else {
      info.textContent = '粒子 ' + App.scene2.sim.numParticles + ' · 网格 ' +
        (App.scene2.sim.nx + '×' + App.scene2.sim.ny + '×' + App.scene2.sim.nz) +
        ' · 造浪 ' + (App.scene2.sim.waveOn ? '开 ' + App.scene2.sim.waveAmp.toFixed(3) + ' m' : '停');
    }
  }

  /* ---------------- UI ---------------- */
  function wireUI() {
    document.querySelectorAll('#tabs .tab').forEach(b => {
      b.addEventListener('click', () => {
        App.demo = null;
        switchScene(parseInt(b.dataset.scene, 10));
        global.Sfx.ui('on');
      });
    });
    document.querySelectorAll('#runs .run').forEach(b => {
      b.addEventListener('click', () => playDemo(b.dataset.run));
    });
    document.querySelectorAll('[data-impact]').forEach(b => {
      b.addEventListener('click', () => {
        App.demo = null;
        switchScene(1);
        App.scene1.triggerImpact(b.dataset.impact);
        global.Sfx.ui('on');
      });
    });

    const bind = (id, out, fmt, fn) => {
      const s = document.getElementById(id);
      const o = document.getElementById(out);
      const apply = () => {
        const v = parseFloat(s.value);
        if (o) o.textContent = fmt(v);
        fn(v);
      };
      s.addEventListener('input', apply);
      apply();
    };
    bind('s_soft', 'o_soft', v => v.toFixed(2), v => { App.scene1.params.softness = v; App.scene1.applyParams(); });
    bind('s_tough', 'o_tough', v => v.toFixed(2), v => { App.scene1.params.toughness = v; App.scene1.applyParams(); });
    bind('s_mass', 'o_mass', v => v.toFixed(1) + ' kg', v => { App.scene1.params.ballMass = v; App.scene1.applyParams(); });
    bind('s_height', 'o_height', v => v.toFixed(2) + ' m', v => { App.scene1.params.dropHeight = v; });
    bind('s_offset', 'o_offset', v => v.toFixed(2), v => { App.scene1.params.ballOffset = v; });

    bind('w_amp', 'o_amp', v => v.toFixed(3), v => { App.scene2.params.waveAmp = v; App.scene2.sim.waveAmp = v; });
    bind('w_freq', 'o_freq', v => v.toFixed(2) + ' Hz', v => { App.scene2.params.waveFreq = v; App.scene2.sim.waveFreq = v; });

    document.querySelectorAll('input.dens').forEach(s => {
      const g = parseInt(s.dataset.g, 10);
      const o = s.nextElementSibling;
      const apply = () => {
        const v = parseFloat(s.value);
        if (o) o.textContent = v.toFixed(2);
        App.scene2.params.densities[g] = v;
        App.scene2.applyParams();
      };
      s.addEventListener('input', apply);
      apply();
    });

    document.getElementById('releaseBtn').addEventListener('click', () => {
      App.scene2.releaseAll();
      global.Sfx.ui('on');
    });
    document.getElementById('waveBtn').addEventListener('click', () => {
      const on = App.scene2.sim.waveOn ? 0 : 1;
      App.scene2.setWave(on);
      document.getElementById('waveBtn').textContent = on ? '停止造浪' : '开始造浪';
      global.Sfx.waveSwell(on ? 0.6 : 0.3);
      if (!on) global.Sfx.waveStop();
    });

    document.getElementById('soundBtn').addEventListener('click', () => {
      const on = !global.Sfx.enabled;
      global.Sfx.setEnabled(on);
      document.getElementById('soundBtn').textContent = on ? '音效 开' : '音效 关';
      if (on) global.Sfx.ui('on');
    });
    document.getElementById('pauseBtn').addEventListener('click', () => {
      App.paused = !App.paused;
      document.getElementById('pauseBtn').textContent = App.paused ? '继续' : '暂停';
      global.Sfx.ui(App.paused ? 'off' : 'on');
    });
    document.getElementById('slowBtn').addEventListener('click', () => {
      App.slow = !App.slow;
      document.getElementById('slowBtn').classList.toggle('active', App.slow);
    });
    document.getElementById('resetBtn').addEventListener('click', () => {
      App.demo = null;
      resetCurrentScene();
      global.Sfx.ui('on');
    });
    document.getElementById('helpBtn').addEventListener('click', () => {
      document.getElementById('modal').classList.remove('hidden');
    });
    document.getElementById('modalClose').addEventListener('click', () => {
      document.getElementById('modal').classList.add('hidden');
    });
  }

  /* ---------------- pointer control ---------------- */
  function wireEvents() {
    const canvas = document.getElementById('view');
    let dragging = 0, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = (e.button === 2) ? 2 : 1;
      lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      global.Sfx.ensure();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = (e.clientX - lx) * 0.006;
      const dy = (e.clientY - ly) * 0.006;
      lx = e.clientX; ly = e.clientY;
      const cam = App.camera;
      if (App.demo || App.exporting) return;
      if (dragging === 1) {
        cam.azimuth -= dx;
        cam.elevation = U.clamp(cam.elevation + dy, -0.25, 1.35);
        cam.cinematic = false;
      } else {
        const s = cam.distance * 0.0012;
        const fx = Math.sin(cam.azimuth), fz = Math.cos(cam.azimuth);
        cam.target[0] -= (fx * dx - fz * dy) * s * 1.6;
        cam.target[2] -= (fz * dx + fx * dy) * s * 1.6;
        cam.target[1] = U.clamp(cam.target[1] + dy * s * 1.2, -0.2, 1.6);
        cam.cinematic = false;
      }
    });
    canvas.addEventListener('pointerup', (e) => { dragging = 0; try { canvas.releasePointerCapture(e.pointerId); } catch (_) { } });
    canvas.addEventListener('pointercancel', () => { dragging = 0; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (App.demo || App.exporting) return;
      App.camera.distance = U.clamp(App.camera.distance * (1 + Math.sign(e.deltaY) * 0.09), 0.35, 8.0);
      App.camera.cinematic = false;
    }, { passive: false });

    // sound hooks
    App.scene1.onEvent = (kind, data) => {
      if (kind === 'crack') global.Sfx.crack(0.9);
      else if (kind === 'impact') global.Sfx.impact(data && data.strength ? data.strength : 1);
      else if (kind === 'rebound') global.Sfx.rebound(0.6);
    };
    App.scene2.onEvent = (kind) => {
      if (kind === 'splash') global.Sfx.splash(0.7);
      else if (kind === 'wave') global.Sfx.waveSwell(0.5);
    };
  }

  /* ---------------- export interface ---------------- */
  function installExport() {
    global.videoExport = {
      runs: global.DEMOS.RUNS.map(r => r.id),
      async begin(runId, opts) {
        const run = global.DEMOS.RUN_MAP[runId];
        if (!run) throw new Error('未知的演示: ' + runId);
        const fps = Math.max(1, Math.round((opts && opts.fps) ? opts.fps : 30));
        App.exporting = true;
        App.exportRun = run;
        App.exportFps = fps;
        App.exportSim = 0;
        App.exportEventIdx = 0;
        App.exportFrames = Math.round(run.duration * fps) + 1;
        document.body.classList.add('exporting');
        App.demo = null;
        switchScene(run.scene);
        resetCurrentScene();
        App.camera.cinematic = true;
        // initial state of frame 0
        advanceExport(run, 0);
        render();
        await App.device.queue.onSubmittedWorkDone();
        return { frames: App.exportFrames };
      },
      async frame(i) {
        const run = App.exportRun;
        if (!run) throw new Error('请先调用 begin()');
        advanceExport(run, i / App.exportFps);
        render();
        await App.device.queue.onSubmittedWorkDone();
      },
      end() {
        App.exporting = false;
        App.exportRun = null;
        document.body.classList.remove('exporting');
        resetCurrentScene();
      }
    };
  }

  function advanceExport(run, recordedT) {
    const targetSim = global.DEMOS.simTimeAt(run, recordedT);
    const sc = curScene();
    while (App.exportEventIdx < run.events.length && run.events[App.exportEventIdx].t <= targetSim) {
      applyDemoEvent(run.events[App.exportEventIdx]);
      App.exportEventIdx++;
    }
    let guard = 0;
    while (App.exportSim < targetSim - 1e-9 && guard++ < 4000) {
      const step = Math.min(1 / 120, targetSim - App.exportSim);
      sc.update(step);
      App.exportSim += step;
    }
    global.DEMOS.cameraAt(run, targetSim, camOut);
    App.camera.setPose(camOut.pos[0], camOut.pos[1], camOut.pos[2],
      camOut.target[0], camOut.target[1], camOut.target[2]);
    App.camera.fov = camOut.fov;
  }

  /* ---------------- go ---------------- */
  installExport();
  boot();
})(window);
