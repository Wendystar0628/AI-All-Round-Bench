window.APP = window.APP || {};
(function () {
  'use strict';
  const APP = window.APP;
  const U = APP.util;
  const H_SIM = 1 / 120;

  let R, scenes = {}, current = null, currentId = 'jelly';
  let paused = false, slowIdx = 0;
  const SLOWS = [1, 0.5, 0.25];
  let demoT = 0, simT = 0, demo = null, demoEnded = false;
  let exporting = false, expState = null;
  let last = 0, fpsAcc = 0, fpsN = 0, fpsT = 0;
  const canvas = document.getElementById('c');

  function scene() { return current; }

  function lightCfg() { return APP.scenes.LIGHT; }
  function envCfg() {
    const e = Object.assign({}, APP.scenes.ENV_BASE);
    if (currentId === 'tank') {
      const D = APP.F.dims();
      e.waterLevel = D.WATER_Y; e.gridOrigin = [0, 0, 0]; e.cellH = D.H;
      e.gridDim = [D.NX, D.NY, D.NZ]; e.restDensity = 5;
    } else {
      e.waterLevel = -999;
    }
    return e;
  }
  function shadowCfg() {
    if (currentId === 'tank') return { center: [1.0, 0.35, 0.5], radius: 1.7, strength: 0.95 };
    return { center: [-0.1, 0.3, 0.05], radius: 2.7, strength: 1.0 };
  }

  function render() {
    const cam = current.cam;
    const size = R.size();
    cam.computeMats(size[0] / size[1]);
    R.begin(cam, lightCfg(), shadowCfg(), envCfg());
    current.render();
    R.present();
  }

  function advanceSim(target) {
    let steps = 0;
    while (simT + H_SIM <= target + 1e-9) {
      current.step(H_SIM);
      simT += H_SIM;
      steps++;
      if (!exporting && steps >= 10) break;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.06, (now - last) / 1000 || 0.016);
    last = now;
    if (!paused && !exporting) {
      const sc = current.timeScaleAt(demoT);
      demoT += dt * SLOWS[slowIdx] * (demo ? 1 : 1);
      if (demo) {
        if (demoT < APP.scenes.demoTarget(demo.id)) {
          advanceSim(current.simTarget(demoT));
          current.demoAdvance(demoT);
        } else if (!demoEnded) {
          demoEnded = true;
          setDemoLabel('演示结束 · 可重置或重新运行');
        }
      } else {
        advanceSim(demoT);
      }
    }
    render();
    window.__frameCount++;
    fpsAcc += dt; fpsN++;
    if (now - fpsT > 500) {
      const el = document.getElementById('fps');
      if (el) el.textContent = (fpsN / fpsAcc).toFixed(0) + ' fps';
      fpsAcc = 0; fpsN = 0; fpsT = now;
    }
  }

  function switchScene(id) {
    if (id === currentId) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.scene === id));
    document.getElementById('panelJelly').classList.toggle('hidden', id !== 'jelly');
    document.getElementById('panelTank').classList.toggle('hidden', id !== 'tank');
    currentId = id;
    current = scenes[id];
    demo = null; demoEnded = false; demoT = 0; simT = 0;
    setDemoLabel('自由模式');
    if (id === 'tank' && !current.ready) {
      current.init().then(() => { current.reset(); });
    }
  }

  function playDemo(id) {
    const sc = id === 'tank-full' ? scenes.tank : scenes.jelly;
    if (sc !== current) switchScene(sc.id);
    if (sc.id === 'tank' && !sc.ready) {
      sc.init().then(() => { sc.startDemo(id); });
    } else sc.startDemo(id);
    demo = sc.demo; demoT = 0; simT = 0; demoEnded = false;
    paused = false;
    setPlayBtn();
    setDemoLabel('演示：' + ({ 'jelly-center': '正中单击', 'jelly-multi': '连击', 'jelly-offset': '偏击', 'tank-full': '风浪' })[id]);
  }

  function restartDemo() { if (demo) playDemo(demo.id); else { current.reset(); demoT = 0; simT = 0; } }
  function resetScene() {
    current.reset();
    demo = null; demoEnded = false; demoT = 0; simT = 0;
    setDemoLabel('自由模式');
  }
  function togglePause() { paused = !paused; setPlayBtn(); }
  function setPlayBtn() { document.getElementById('playBtn').textContent = paused ? '继续' : '暂停'; }
  function cycleSlow() {
    slowIdx = (slowIdx + 1) % SLOWS.length;
    document.getElementById('slowBtn').textContent = '慢放 ' + SLOWS[slowIdx] + '×';
  }
  function toggleAudio() {
    const on = !APP.audio.isEnabled();
    APP.audio.setEnabled(on);
    document.getElementById('audioBtn').textContent = '音效：' + (on ? '开' : '关');
  }
  function toggleWave() {
    const sc = current;
    if (!sc.startWave) return;
    const on = !sc.waveOn;
    sc.startWave(on);
    document.getElementById('waveBtn').textContent = on ? '停止造浪' : '开始造浪';
  }
  function setDemoLabel(t) { const el = document.getElementById('demoLabel'); if (el) el.textContent = t; }

  async function beginExport(runId, fps) {
    const sc = runId === 'tank-full' ? scenes.tank : scenes.jelly;
    if (sc !== current) switchScene(sc.id);
    if (sc.id === 'tank' && !sc.ready) await sc.init();
    slowIdx = 0;
    sc.startDemo(runId);
    demo = sc.demo; demoT = 0; simT = 0; demoEnded = false;
    exporting = true;
    document.body.classList.add('exporting');
    expState = { runId, fps };
    render();
    await R.onDone();
  }
  async function exportFrame(i) {
    if (!expState) return;
    const t = i / expState.fps;
    const target = current.simTarget(t);
    advanceSim(target);
    current.demoAdvance(t);
    render();
    await R.onDone();
  }
  function endExport() {
    exporting = false;
    expState = null;
    document.body.classList.remove('exporting');
    paused = false;
    setPlayBtn();
    setDemoLabel('演示结束');
  }

  async function boot() {
    const ld = document.getElementById('loading');
    try {
      R = APP.R;
      await R.init(canvas);
      R.resize(innerWidth, innerHeight, 1);
      addEventListener('resize', () => { if (!exporting) R.resize(innerWidth, innerHeight, 1); });
      scenes.jelly = APP.scenes.create('jelly');
      scenes.tank = APP.scenes.create('tank');
      await scenes.jelly.init();
      current = scenes.jelly;
      APP.ui.init(api);
      APP.exportApi.install(api);
      if (ld) { ld.style.opacity = 0; setTimeout(() => ld.remove(), 450); }
      window.__booted = Date.now();
      requestAnimationFrame(frame);
      window.__frameCount = 0;
    } catch (e) {
      if (ld) ld.innerHTML = '<div style="text-align:center"><div>初始化失败：' + (e && e.message ? e.message : e) + '</div><div style="font-size:11px;margin-top:8px;color:#8fa">需要支持 WebGPU 的 Chrome</div></div>';
      console.error(e);
    }
  }

  const api = {
    scene, switchScene, playDemo, restartDemo, resetScene, togglePause, cycleSlow, toggleAudio, toggleWave,
    beginExport, exportFrame, endExport,
  };
  APP.main = api;
  addEventListener('pointerdown', () => APP.audio.resume(), { once: true });
  addEventListener('keydown', () => APP.audio.resume(), { once: true });
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else boot();
})();

