/* Player: canvas fitting, audio-synced clock, controls, seeking, and the window.videoExport interface. */
'use strict';
(function () {
  const PV = window.PV;
  const { clamp } = PV;
  const cv = document.getElementById('pv');
  const ctx = cv.getContext('2d', { alpha: false });
  const au = document.getElementById('au');
  const bar = document.getElementById('bar'), start = document.getElementById('start');
  const btn = document.getElementById('play'), pico = document.getElementById('pico');
  const timeEl = document.getElementById('time'), shotEl = document.getElementById('shot');
  const track = document.getElementById('track'), fillEl = track.querySelector('.fill'), knob = track.querySelector('.knob'), tip = track.querySelector('.tip');
  const DUR = PV.DUR;
  const AUDIO_LEN = 81.39998; // decoded length of the track (s)

  let ready = false, playing = false, exporting = false, started = false, dragging = false, overBar = false;
  let curT = 0, k = 1, exportFps = 60;

  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let w = vw, h = (vw * 9) / 16;
    if (h > vh) { h = vh; w = (vh * 16) / 9; }
    const x = (vw - w) / 2, y = (vh - h) / 2;
    Object.assign(cv.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    const dpr = window.devicePixelRatio || 1;
    let pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (pw > 3840) { ph = Math.round((ph * 3840) / pw); pw = 3840; }
    if (!exporting && pw > 2560) { ph = Math.round((ph * 2560) / pw); pw = 2560; } // keep live playback smooth
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    k = pw / PV.W;
    PV.K = k;
    if (PV.G3.ok || PV.G3.init()) PV.G3.size(pw, ph);
  }

  function render(t) {
    t = clamp(t, 0, DUR);
    curT = t;
    PV.T = t;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    const s = PV.shotAt(t);
    ctx.save();
    try { s.draw(ctx, t, s); } catch (e) { console.error('shot', s.id, e); }
    ctx.restore();
    ctx.save();
    try { PV.carry(ctx, t, s); } catch (e) { console.error('carry', e); }
    ctx.restore();
    ctx.save();
    try { PV.overlay(ctx, t, s); } catch (e) { console.error('overlay', e); }
    ctx.restore();
    ctx.save(); PV.grain(ctx, t, s); ctx.restore();
    if (!exporting) updateUI(t, s);
  }

  // ---------- clock ----------
  let lastAT = -1, lastPerf = 0;
  function clock() {
    const at = au.currentTime, now = performance.now();
    if (at !== lastAT) { lastAT = at; lastPerf = now; }
    return Math.min(at + (now - lastPerf) / 1000, at + 0.1);
  }
  function loop() {
    if (!playing || exporting) return;
    render(au.ended ? DUR : clock());
    requestAnimationFrame(loop);
  }

  // ---------- UI ----------
  const fmt = (t) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0');
  };
  function updateUI(t, s) {
    timeEl.textContent = fmt(t) + ' / ' + fmt(DUR);
    const f = t / DUR;
    fillEl.style.width = f * 100 + '%';
    knob.style.left = f * 100 + '%';
    const label = 'SHOT ' + String(s.id).padStart(2, '0');
    if (shotEl.dataset.k !== label) {
      shotEl.dataset.k = label;
      shotEl.innerHTML = '<b>' + label + '</b>/ 36' + (s.name ? ' · ' + s.name : '');
    }
  }
  function setIcon() {
    pico.innerHTML = playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="#fff"/>' : '<path d="M6 3l15 9-15 9z" fill="#fff"/>';
  }
  async function play() {
    if (exporting || !ready) return;
    if (au.ended || au.currentTime >= DUR - 0.02) au.currentTime = 0;
    try { await au.play(); } catch (e) { console.warn(e); return; }
    playing = true; lastAT = -1; setIcon(); poke();
    requestAnimationFrame(loop);
  }
  function pause() {
    au.pause(); playing = false; setIcon(); render(au.currentTime);
    bar.classList.remove('hide');
  }
  function seek(t) {
    t = clamp(t, 0, DUR);
    au.currentTime = Math.min(t, AUDIO_LEN - 0.001);
    lastAT = -1;
    render(t);
  }
  btn.addEventListener('click', (e) => { e.stopPropagation(); playing ? pause() : play(); });
  start.addEventListener('click', () => {
    if (!ready) return;
    started = true; start.classList.add('gone');
    au.currentTime = 0; render(0); play();
  });
  cv.addEventListener('click', () => { if (started && !exporting) (playing ? pause() : play()); });
  au.addEventListener('ended', () => { playing = false; setIcon(); render(DUR); bar.classList.remove('hide'); });

  const seekEv = (e) => {
    const r = track.getBoundingClientRect();
    seek(clamp((e.clientX - r.left) / r.width) * DUR);
  };
  track.addEventListener('pointerdown', (e) => { if (!started) return; dragging = true; track.setPointerCapture(e.pointerId); seekEv(e); });
  track.addEventListener('pointermove', (e) => {
    const r = track.getBoundingClientRect();
    const f = clamp((e.clientX - r.left) / r.width), t = f * DUR;
    const s = PV.shotAt(t);
    tip.style.left = f * 100 + '%';
    tip.textContent = fmt(t) + '  ·  SHOT ' + String(s.id).padStart(2, '0');
    if (dragging) seekEv(e);
  });
  track.addEventListener('pointerup', () => { dragging = false; });
  track.addEventListener('pointercancel', () => { dragging = false; });
  bar.addEventListener('mouseenter', () => { overBar = true; });
  bar.addEventListener('mouseleave', () => { overBar = false; });
  document.getElementById('fs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => 0);
  });
  // section ticks on the timeline
  [0, PV.B(11), PV.B(17), PV.B(32), PV.B(51) - PV.BEAT, PV.B(68)].forEach((t) => {
    const i = document.createElement('i'); i.style.left = (t / DUR) * 100 + '%'; track.querySelector('.ticks').appendChild(i);
  });

  let hideTimer = null;
  function poke() {
    if (!started || exporting) return;
    bar.classList.remove('hide');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (playing && !dragging && !overBar) bar.classList.add('hide'); }, 2200);
  }
  document.addEventListener('mousemove', poke);
  document.documentElement.addEventListener('mouseleave', () => { if (playing && !dragging) bar.classList.add('hide'); });
  window.addEventListener('keydown', (e) => {
    if (!started || exporting) return;
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
    else if (e.code === 'ArrowRight') seek((playing ? clock() : curT) + 3);
    else if (e.code === 'ArrowLeft') seek((playing ? clock() : curT) - 3);
    else if (e.code === 'Home') seek(0);
    poke();
  });
  window.addEventListener('resize', () => { if (!ready) return; layout(); render(playing ? clock() : curT); });

  // ---------- boot ----------
  const fontSpecs = ['600 40px "Source Han Serif"', '900 40px "Source Han Serif"', '700 20px "Montserrat"', '900 20px "Montserrat"',
    '400 20px "JetBrains Mono"', '700 20px "Yu Gothic"', '400 40px "Anton"', '400 40px "Playfair Display"', '700 20px "Roboto Condensed"'];
  const readyPromise = (async () => {
    await PV.loadImages();
    try { await Promise.all(fontSpecs.map((f) => document.fonts.load(f, 'あ雫A'))); } catch (e) { /* system fonts */ }
    layout();
    cv.style.visibility = 'hidden';
    if (PV.initShots) PV.initShots();
    // warm every shot once (builds silhouettes, textures, glyph caches) so first playback has no hitches
    const S = PV.SHOTS;
    for (let i = 0; i < S.length; i++) {
      const t1 = i + 1 < S.length ? S[i + 1].t0 : DUR;
      for (const f of [0.02, 0.5, 0.9]) render(S[i].t0 + (t1 - S[i].t0) * f);
      if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0));
    }
    ready = true;
    render(PV.POSTER_T || 0);
    cv.style.visibility = 'visible';
    start.classList.remove('loading');
  })();

  const nextPaint = () => new Promise((res) => {
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    requestAnimationFrame(() => requestAnimationFrame(fin));
    setTimeout(fin, 120);
  });

  window.videoExport = {
    runs: ['pv'],
    async begin(run, opts = {}) {
      exportFps = (opts && opts.fps) || 60;
      exporting = true;
      document.body.classList.add('export');
      au.pause(); playing = false; setIcon();
      await readyPromise;
      layout();
      render(0);
      await nextPaint();
      return { frames: Math.ceil(+(AUDIO_LEN * exportFps).toFixed(6)) };
    },
    async frame(i) {
      if (!exporting) return;
      render(i / exportFps);
      await nextPaint();
    },
    end() {
      exporting = false;
      document.body.classList.remove('export');
      layout();
      render(started ? au.currentTime : PV.POSTER_T || 0);
    },
  };
  PV.render = render; // debug hook
  PV.whenReady = readyPromise;
})();
