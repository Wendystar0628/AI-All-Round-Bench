'use strict';
/* =====================================================================
   main.js — 启动、主循环、导出接口
   ===================================================================== */

const canvas = document.getElementById('view');
const errBox = document.getElementById('err');
window.addEventListener('error', (e) => { errBox.textContent += (e.message || e.error) + '\n'; });

let renderer, fleet, stars, particles, world;

function boot() {
  try {
    renderer = new Renderer(canvas);
  } catch (e) {
    errBox.textContent = '初始化失败: ' + e.message;
    throw e;
  }
  stars = new StarField(renderer.gl, 2600, 99);
  world = createWorld(renderer);
  world.build();
  renderer.resize();
  window.addEventListener('resize', () => renderer.resize());
  document.getElementById('boot').classList.add('gone');
  requestAnimationFrame(loop);
}

let lastNow = 0;
function loop(now) {
  if (!exportMode) {
    const dt = Math.min(0.1, (now - lastNow) / 1000);
    lastNow = now;
    const gt = (window.__t !== null && window.__t !== undefined) ? window.__t : ((now / 1000) % DURATION);
    drawFrame(gt, dt || 1 / 60);
  }
  requestAnimationFrame(loop);
}

function drawFrame(gt, dt) {
  renderer.time = gt;
  renderer.resize();
  world.update(gt, dt);
  world.render(renderer, gt, window.__cam);
  renderer.present(gt);
}

/* 调试钩子（不影响正常播放） */
window.__cam = null;
window.__t = null;
window.__setCam = (p, l, fov) => { window.__cam = { p, l, fov: (fov || 55) * PI / 180 }; };
window.__setT = (t) => { window.__t = t; };
window.__clay = 0;
window.__ortho = 0;
window.__ascii = (w, h) => {
  const c = document.getElementById('view');
  w = w || 110; h = h || 56;
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  const ctx = t.getContext('2d');
  ctx.drawImage(c, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const chars = ' .:-=+*#%@';
  let out = '', sum = 0, mx = 0, nb = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = Math.pow((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, 0.5);
      sum += l; if (l > mx) mx = l; if (l > 0.02) nb++;
      out += chars[Math.min(9, Math.floor(l * 10))];
    }
    out += '\n';
  }
  return { mean: +(sum / (w * h)).toFixed(3), max: +mx.toFixed(3), nonblack: +(nb / (w * h)).toFixed(3), ascii: out };
};
window.__ascii2 = (w, h) => {
  const c = document.getElementById('view');
  w = w || 96; h = h || 54;
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  const ctx = t.getContext('2d');
  ctx.drawImage(c, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let out = '';
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (r + g + b) / 3;
      if (l < 0.025) { out += ' '; continue; }
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      if (sat < 0.16) { out += ' .:-=+*#%@'[Math.min(9, Math.floor(l * 10))]; continue; }
      let hh = 0;
      if (mx === r) hh = ((g - b) / (mx - mn)) * 60;
      else if (mx === g) hh = 120 + ((b - r) / (mx - mn)) * 60;
      else hh = 240 + ((r - g) / (mx - mn)) * 60;
      if (hh < 0) hh += 360;
      const ch = hh < 20 || hh >= 330 ? 'R' : hh < 45 ? 'O' : hh < 70 ? 'Y' : hh < 165 ? 'G' : hh < 200 ? 'C' : hh < 255 ? 'B' : hh < 300 ? 'M' : 'P';
      const bright = l > 0.55 ? ch : ch.toLowerCase();
      out += bright;
    }
    out += '\n';
  }
  return out;
};

/* ---------------- 导出接口 ---------------- */
let exportMode = false;
let exportFPS = 30;

window.videoExport = {
  runs: ['tour'],
  async begin(runId, opts) {
    exportFPS = (opts && opts.fps) || 30;
    exportMode = true;
    const frames = Math.round(DURATION * exportFPS);
    world.reset(0);
    drawFrame(0, 1 / exportFPS);
    return { frames };
  },
  async frame(i) {
    const t = i / exportFPS;
    world.reset(t);
    drawFrame(t, 1 / exportFPS);
  },
  async end() {
    exportMode = false;
    world.reset(0);
    lastNow = performance.now();
  },
};

window.__ready = false;
boot();
setTimeout(() => { window.__ready = true; }, 1200);
