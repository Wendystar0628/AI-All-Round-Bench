// 入口：画布尺寸、实时循环、视频导出接口（window.videoExport）。

(function () {
  var canvas = document.getElementById('stage');
  var TT = FLEET.T;
  var MAXW = 3840, MAXH = 2160;
  var sunDir = MATH.V.norm([0.42, 0.62, -0.66]);
  var sceneU = {
    sunDir: sunDir, sunCol: [1.55, 1.42, 1.25], skyCol: [0.22, 0.28, 0.42], gndCol: [0.05, 0.045, 0.06],
    fogCol: [0.02, 0.03, 0.06], fogDen: 0.00011, plights: [], time: 0
  };
  var canvasSize = { w: 0, h: 0 };
  var DBG_CAM = null;
  var dcm = /cam=([-0-9.,]+)/.exec(window.location.hash || '');
  if (dcm) DBG_CAM = dcm[1].split(',').map(Number);

  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    var w = Math.max(16, Math.round(window.innerWidth * dpr));
    var h = Math.max(16, Math.round(window.innerHeight * dpr));
    var k = Math.min(1, MAXW / w, MAXH / h);
    w = Math.round(w * k); h = Math.round(h * k);
    if (w !== canvasSize.w || h !== canvasSize.h) {
      canvas.width = w; canvas.height = h;
      canvasSize.w = w; canvasSize.h = h;
      GLR.resize(w, h);
    }
  }

  // 渲染一帧（t 为循环时间，单位秒）
  function renderAt(t) {
    sizeCanvas();
    var cs = SHOTS.at(t);
    if (DBG_CAM) { cs = { pos: DBG_CAM.slice(0, 3), target: DBG_CAM.slice(3, 6), fov: 40 * Math.PI / 180, stage: 'ext', tau: t }; }
    var f = MATH.V.norm(MATH.V.sub(cs.target, cs.pos));
    var up = [0, 1, 0];
    var r = MATH.V.norm(MATH.V.cross(f, up));
    var u = MATH.V.cross(r, f);
    var aspect = canvasSize.w / canvasSize.h;
    var cam = {
      pos: cs.pos, r: r, u: u, f: f, fov: cs.fov,
      view: MATH.viewRot(f, up),
      proj: MATH.perspective(cs.fov, aspect, 0.5, 60000)
    };
    var inside = cs.stage !== 'ext';
    var su = inside ? INTERIOR.sceneFor(cs.stage, cs.tau, sceneU) : sceneU;
    su.time = t;
    GLR.beginFrame(cam, su);
    GLR.drawBackground({ sunGlow: inside ? 0.3 : 1.0, neb: 1.0, time: t });
    if (inside) INTERIOR.draw(cs.stage, cs.tau, cam.pos);
    else SCENE.drawExterior(t, cam);
    GLR.endFrame(0.9);
  }

  var frozen = null;
  var hm = /t=([0-9.]+)/.exec(window.location.hash || '');
  if (hm) frozen = parseFloat(hm[1]);

  var exporting = false, runT0 = 0, runFps = 60, runFrames = 0;
  var RUNS = [];

  function init() {
    GLR.init(canvas);
    SCENE.init();
    // 舱内网格在开场之后于空闲时构建（首次绘制舱内画面前必定完成）
    setTimeout(function () { INTERIOR.ensure(); }, 300);
    SHOTS.init();
    RUNS = SHOTS.runs();
    window.videoExport = {
      runs: RUNS.map(function (r) { return r.name; }),
      begin: function (runId, opt) {
        var idx = RUNS.findIndex(function (r) { return r.name === runId; });
        if (idx < 0) throw new Error('未知分块: ' + runId);
        var fps = (opt && opt.fps) || 60;
        exporting = true; runFps = fps;
        runT0 = RUNS[idx].t0;
        runFrames = Math.round((RUNS[idx].t1 - RUNS[idx].t0) * fps);
        renderAt(runT0);
        return Promise.resolve({ frames: runFrames });
      },
      frame: function (i) {
        var t = runT0 + i / runFps;
        renderAt(t % TT);
        return Promise.resolve();
      },
      end: function () { exporting = false; }
    };
    var start = performance.now();
    var reported = false;
    function loop(now) {
      if (!exporting) {
        var t = frozen !== null ? frozen : ((now - start) / 1000) % TT;
        try {
          renderAt(t);
        } catch (e) {
          if (!reported) { reported = true; console.error(e); }
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  try {
    init();
  } catch (e) {
    console.error(e);
    document.body.setAttribute('data-error', String(e && e.message));
  }
})();
