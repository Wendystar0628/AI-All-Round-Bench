// main.js — build everything, then loop the 78 s global timeline; exposes the deterministic videoExport interface
(function () {
  'use strict';
  const SF = window.SF, v3 = SF.v3, m4 = SF.m4, T = SF.T;
  const canvas = document.getElementById('view');
  const qs = new URLSearchParams(location.search);

  // ---------------------------------------------------------------- export interface (available immediately)
  const RUNS = [['voyage', 0, 25], ['interior', 25, 51], ['attack', 51, 65], ['surge', 65, 78]];
  let readyResolve, exporting = false, exFps = 60, exStart = 0, tStart = 0, lastT = 0, started = false;
  const ready = new Promise(r => { readyResolve = r; });
  const present = () => new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; requestAnimationFrame(() => requestAnimationFrame(fin)); setTimeout(fin, 150); });
  window.videoExport = {
    runs: RUNS.map(r => r[0]),
    async begin(runId, opts) {
      await ready;
      const run = RUNS.find(r => r[0] === runId) || RUNS[0];
      exFps = (opts && opts.fps) || 60; exStart = run[1]; exporting = true;
      renderAt(exStart); SF.R.gl.finish(); await present();
      return { frames: Math.round((run[2] - run[1]) * exFps) };
    },
    async frame(i) {
      await ready;
      const t = exStart + i / exFps; lastT = t;
      renderAt(t); SF.R.gl.finish(); await present();
    },
    end() { exporting = false; tStart = performance.now() - lastT * 1000; },
    duration: T,
  };

  let R;
  try { R = SF.R = new SF.Renderer(canvas); } catch (e) { document.getElementById('bootText').textContent = 'WebGL2 不可用'; throw e; }
  const sun = SF.SUN;
  const envExt = {
    sunDir: sun, sunCol: [1.85, 1.63, 1.34], ambHi: [0.042, 0.066, 0.100], ambLo: [0.024, 0.029, 0.052],
    fillDir: v3.norm([0.6, -0.3, -0.45]), fillCol: [0.035, 0.095, 0.125], fog: [0.004, 0.006, 0.012, 0.0],
    sky: true, skyK: 1, planet: [...v3.norm([0.74, -0.30, 0.42]), 0.40], exposure: 1.0, bloom: 0.9,
    glowA: [0.30, 1.9, 2.5], glowB: [1.9, 1.5, 1.05], glowC: [0.7, 2.8, 3.8], core: 1, ambInt: [0.085, 0.092, 0.105],
  };
  const envInt = Object.assign({}, envExt, { sunCol: [0, 0, 0], ambHi: [0.030, 0.045, 0.060], ambLo: [0.016, 0.022, 0.030], fillCol: [0, 0, 0], fog: [0.004, 0.010, 0.016, 0.0016], sky: false, bloom: 0.8 });
  SF.envExt = envExt; SF.envInt = envInt;

  const models = SF.models = {};
  const tick = () => new Promise(r => setTimeout(r, 0));
  const bar = document.getElementById('bootBar'), boot = document.getElementById('boot');
  const prog = p => { if (bar) bar.style.width = Math.round(p * 100) + '%'; };

  function build(name, fn, o) {
    o = o || {};
    const res = fn(), mesh = SF.meshGrid(res.g);
    if (o.sun !== false) SF.bakeSun(mesh, sun);
    SF.bakeGlow(mesh, o.glow || { cs: 6, range: 2 });
    const md = models[name] = R.upload(mesh); md.meta = res.meta || {};
    if (o.keep) md.grid = res.g;
    return md;
  }
  function buildRock(name, seed, Rr, opts) {
    const res = SF.buildRock(seed, Rr, opts);
    if (!res.pieces) { const mesh = SF.meshGrid(res.g); SF.bakeSun(mesh, sun); const md = models[name] = R.upload(mesh); md.meta = res.meta; return md; }
    const meshes = [];
    for (const p of res.pieces) { if (p.n < 6) { p.mesh = null; continue; } p.mesh = SF.meshGrid(res.g, { piece: res.piece, pid: p.id, bbox: p.bbox }); meshes.push(p.mesh); }
    SF.bakeSun(meshes, sun);
    for (const p of res.pieces) { if (p.mesh) { p.model = R.upload(p.mesh); p.mesh = null; } }
    models[name] = { meta: res.meta, pieces: res.pieces, grid: res.g };
    return models[name];
  }

  async function init() {
    const t0 = performance.now();
    const steps = [];
    const NM = SF.rockMedN = 9;
    steps.push(() => build('flag', SF.buildFlagship, { glow: { cs: 8, range: 2 } }));
    steps.push(() => { build('guard', SF.buildGuard); build('van', SF.buildVanguard); build('shuttle', SF.buildShuttle); build('turret', SF.buildTurret); build('ciws', SF.buildCIWS); build('missile', SF.buildMissile); });
    steps.push(() => build('atrium', SF.buildAtrium, { sun: false, glow: { cs: 10, range: 2 } }));
    steps.push(() => {
      build('ringA', () => SF.buildRing(38, 42, 3, 4, 0.2, true), { sun: false }); build('ringB', () => SF.buildRing(50, 54, 2, 3, 0.22, false), { sun: false }); build('ringC', () => SF.buildRing(66, 72, 4, 6, 0.24, true), { sun: false });
      build('corridor', SF.buildCorridor, { sun: false, glow: { cs: 10, range: 2 } }); build('eblock', SF.buildEBlock, { sun: false }); build('clamp', SF.buildClamp, { sun: false });
    });
    const nA = v3.norm([0.86, -0.5, 0.06]);
    steps.push(() => buildRock('rockA', 11, [104, 86, 94], { lobes: 3, craters: 6, cracks: 4, tunnels: 1, pieces: { k: 6, plane: { n: nA }, focus: [0, -6, -86], focusN: 7, focusR: 0.34 } }));
    steps.push(() => { buildRock('rockB', 23, [74, 60, 66], { lobes: 3, craters: 5, cracks: 3, tunnels: 1, pieces: { k: 4, focus: [10, -10, -52], focusN: 6, focusR: 0.55 } }); buildRock('rockC', 37, [56, 46, 50], { lobes: 2, craters: 4, cracks: 3, tunnels: 1, pieces: { k: 11 } }); });
    steps.push(() => { for (let i = 0; i < 4; i++) buildRock('rockS' + i, 50 + i, [14 + (i % 2) * 3, 11 + (i % 3), 13 + ((i + 1) % 2) * 3], { lobes: 1, craters: 2, cracks: 1, tunnels: 0, pieces: { k: 4 } }); });
    steps.push(() => { const r = SF.rng(606); for (let k = 0; k < NM; k++) { const a = r.r(22, 46); buildRock('rockM' + k, 70 + k, [a, a * r.r(0.7, 0.95), a * r.r(0.75, 1.0)], { lobes: 2, craters: 3, cracks: 2, tunnels: k % 3 === 0 ? 1 : 0 }); } });
    steps.push(() => { buildRock('rockD0', 91, [66, 52, 58], { lobes: 3, craters: 5, cracks: 3, tunnels: 1 }); buildRock('rockD1', 92, [80, 58, 66], { lobes: 3, craters: 6, cracks: 3, tunnels: 1 }); });
    steps.push(() => { SF.setupWorld(models); for (const k of ['rockA', 'rockB', 'rockC', 'rockS0', 'rockS1', 'rockS2', 'rockS3']) models[k].grid = null; });
    const stepMs = [];
    for (let i = 0; i < steps.length; i++) { const ts = performance.now(); steps[i](); stepMs.push(Math.round(performance.now() - ts)); prog((i + 1) / steps.length); await tick(); }
    SF.stepMs = stepMs;
    console.log('build ms', Math.round(performance.now() - t0));
    if (boot) { boot.style.opacity = 0; setTimeout(() => boot.remove(), 900); }
    started = true; tStart = performance.now();
    const ft = qs.get('t'); if (ft !== null) { exporting = true; lastT = parseFloat(ft); renderAt(lastT); }
    readyResolve();
    requestAnimationFrame(loop);
  }

  const F = {};
  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    const k = Math.min(1, 3840 / w, 2160 / h); w = Math.round(w * k); h = Math.round(h * k);
    R.resize(w, h);
  }
  function renderAt(t, freeCam) {
    size();
    t = SF.pmod(t, T);
    const c = SF.cameraAt(t), shot = freeCam ? Object.assign({}, c.shot, freeCam.shot || {}) : c.shot;
    const cam = freeCam ? Object.assign({}, c.cam, freeCam) : c.cam;
    const base = (shot.env === 'int') ? envInt : envExt;
    F.env = Object.assign({}, base); F.env.exposure = base.exposure * (freeCam && freeCam.exposure ? freeCam.exposure : c.exposure);
    F.cam = cam; F.time = t; F.phase = t / T; F.fade = 1;
    SF.assemble(t, models, shot, cam, F);
    R.render(F);
  }
  SF.renderAt = renderAt;
  function loop() {
    requestAnimationFrame(loop);
    if (exporting || !started) return;
    lastT = ((performance.now() - tStart) / 1000) % T;
    renderAt(lastT);
  }

  // ---------------------------------------------------------------- development helpers (not used by the piece itself)
  SF.dbg = {
    at(t) { exporting = true; lastT = t; renderAt(t); },
    free(t, pos, tgt, fov, extra) { exporting = true; renderAt(t, Object.assign({ pos, tgt, fov: fov || 45 }, extra || {})); },
    play(t) { exporting = false; if (t !== undefined) tStart = performance.now() - t * 1000; },
    grid(list, cols) {
      exporting = true; cols = cols || 2; const rows = Math.ceil(list.length / cols);
      let c2 = document.getElementById('dbg2d');
      if (!c2) { c2 = document.createElement('canvas'); c2.id = 'dbg2d'; c2.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:5'; document.body.appendChild(c2); }
      c2.width = window.innerWidth; c2.height = window.innerHeight; c2.style.display = 'block';
      const ctx = c2.getContext('2d'), tw = c2.width / cols, th = c2.height / rows;
      list.forEach((v, i) => {
        if (typeof v === 'number') renderAt(v); else renderAt(v[0], Object.assign({ pos: v[1], tgt: v[2], fov: v[3] || 45 }, v[4] || {}));
        R.gl.finish(); ctx.drawImage(canvas, (i % cols) * tw, Math.floor(i / cols) * th, tw, th);
        ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(typeof v === 'number' ? 't=' + v : 't=' + v[0] + ' free', (i % cols) * tw + 6, Math.floor(i / cols) * th + 14);
      });
    },
    single() { const c2 = document.getElementById('dbg2d'); if (c2) c2.style.display = 'none'; },
  };

  init().catch(e => { console.error(e); const b = document.getElementById('bootText'); if (b) b.textContent = '初始化失败：' + e.message; });
})();
