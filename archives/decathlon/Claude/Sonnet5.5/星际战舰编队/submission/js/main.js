'use strict';
// ---------- 主循环、尺寸适配与视频导出接口 ----------
(function () {
  var canvas = document.getElementById('c');
  var loadEl = document.getElementById('load');
  GLR.init(canvas);
  var MAXW = 3840, MAXH = 2160;
  var S = { mode: 'play', t0: 0, ready: false, scale: 1, ft: 16, lowCount: 0, highCount: 0, t: 0 };
  var DEBUG = { cam: null };

  function fit(force) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.floor(window.innerWidth * dpr)), h = Math.max(2, Math.floor(window.innerHeight * dpr));
    var k = Math.min(1, MAXW / w, MAXH / h);
    w = Math.floor(w * k); h = Math.floor(h * k);
    var sc = S.mode === 'export' ? 1 : S.scale;
    w = Math.max(2, Math.floor(w * sc)); h = Math.max(2, Math.floor(h * sc));
    if (w !== GLR.W || h !== GLR.H || force) GLR.resize(w, h);
  }
  window.addEventListener('resize', function () { fit(false); if (S.mode === 'export' || !S.ready) return; });

  function renderAt(t) {
    var W = GLR.W, H = GLR.H;
    var shot = cameraAt(t, W / H);
    if (DEBUG.cam) shot = DEBUG.cam(t, W / H) || shot;
    var frame = buildFrame(t, W, H, shot);
    GLR.render(frame);
    S.t = t;
  }
  window.__renderAt = function (t) { fit(false); renderAt(t); };
  window.__dbg = DEBUG;
  window.__freeze = function (t) { S.mode = 'export'; fit(true); renderAt(t); return GLR.stats; };

  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!S.ready || S.mode !== 'play') return;
    var t = ((now - S.t0) / 1000) % TL.T;
    try { renderAt(t); } catch (e) { if (!S.errLogged) { console.error(e); S.errLogged = true; } }
    // 实时自适应分辨率（仅正常播放；导出时固定满分辨率）
    if (last) {
      var dt = now - last;
      S.ft = S.ft * 0.9 + dt * 0.1;
      if (S.ft > 42) { S.lowCount++; S.highCount = 0; } else if (S.ft < 20) { S.highCount++; S.lowCount = 0; } else { S.lowCount = 0; S.highCount = 0; }
      if (S.lowCount > 25 && S.scale > 0.5) { S.scale = Math.max(0.5, S.scale * 0.85); S.lowCount = 0; fit(false); }
      if (S.highCount > 120 && S.scale < 1) { S.scale = Math.min(1, S.scale * 1.1); S.highCount = 0; fit(false); }
    }
    last = now;
  }

  function start() {
    window.__loadMs = performance.now();
    S.ready = true;
    fit(true);
    S.t0 = performance.now();
    loadEl.style.opacity = '0';
    setTimeout(function () { loadEl.style.display = 'none'; }, 700);
    requestAnimationFrame(loop);
  }
  fit(true);
  var tStart = performance.now();
  var readyResolve; var readyPromise = new Promise(function (r) { readyResolve = r; });
  var ltEl = document.getElementById('lt'), lbEl = document.getElementById('lb');
  loadAssets(function (name, p) { ltEl.textContent = '载入 ' + name; lbEl.style.width = Math.round(p * 100) + '%'; }, function () { lbEl.style.width = '100%'; start(); readyResolve(); });

  // ---------- 视频导出接口 ----------
  var RUNS = [{ id: 'approach', t0: 0, dur: 24 }, { id: 'interiors', t0: 24, dur: 15 }, { id: 'strike', t0: 39, dur: 23 }, { id: 'boost', t0: 62, dur: 15 }];
  var cur = null;
  function nextFrame() {
    return new Promise(function (res) {
      var done = false;
      requestAnimationFrame(function () { done = true; res(); });
      setTimeout(function () { if (!done) res(); }, 300);
    });
  }
  window.videoExport = {
    runs: RUNS.map(function (r) { return r.id; }),
    begin: async function (runId, opts) {
      await readyPromise;
      var run = RUNS.filter(function (r) { return r.id === runId; })[0] || RUNS[0];
      var fps = (opts && opts.fps) || 30;
      S.mode = 'export';
      fit(true);
      cur = { run: run, fps: fps, frames: Math.round(run.dur * fps) };
      renderAt(run.t0 % TL.T);
      return { frames: cur.frames };
    },
    frame: async function (i) {
      if (!cur) return;
      var t = (cur.run.t0 + i / cur.fps) % TL.T;
      renderAt(t);
      await nextFrame();
    },
    end: function () {
      cur = null;
      S.mode = 'play'; S.scale = 1; S.t0 = performance.now() - (S.t % TL.T) * 1000;
      last = 0;
      fit(true);
    }
  };
})();
