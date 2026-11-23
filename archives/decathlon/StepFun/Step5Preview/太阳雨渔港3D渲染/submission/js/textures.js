/* ============ procedural canvas textures ============ */
(function () {
  const HB = (window.HB = window.HB || {});
  const T = (HB.TEX = {});
  const rnd = HB.rng(20240716);

  function fill(ctx, w, h, col) { ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); }
  function grain(ctx, w, h, amp, alpha, scale) {
    scale = scale || 1;
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amp;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(id, 0, 0);
  }
  function blob(ctx, x, y, r, col, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a === undefined ? 1 : a; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  }
  function speck(ctx, w, h, n, rmin, rmax, col, a) {
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = a * (0.4 + Math.random() * 0.6);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, rmin + Math.random() * (rmax - rmin), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- wet concrete deck ---------- */
  T.deck = HB.canvasTex(512, 512, function (c, w, h) {
    fill(c, w, h, '#c3c8c1');
    // broad tonal patches
    for (let i = 0; i < 26; i++) blob(c, Math.random() * w, Math.random() * h, 60 + Math.random() * 130, Math.random() > .5 ? '#d5dad3' : '#a9b0a8', .5);
    // fine aggregate
    speck(c, w, h, 2600, 0.6, 2.1, '#8f968e', .5);
    speck(c, w, h, 1400, 0.6, 1.6, '#e2e6df', .5);
    // expansion joints
    c.strokeStyle = 'rgba(90,98,92,.55)'; c.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 0); c.lineTo(i * w / 4, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
    // cracks
    c.strokeStyle = 'rgba(80,88,82,.4)'; c.lineWidth = 1.4;
    for (let i = 0; i < 16; i++) {
      let x = Math.random() * w, y = Math.random() * h;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 70; y += (Math.random() - .5) * 70; c.lineTo(x, y); }
      c.stroke();
    }
    // wet sheen patches (rain water films)
    for (let i = 0; i < 40; i++) blob(c, Math.random() * w, Math.random() * h, 14 + Math.random() * 40, '#eef4f2', .30);
    // dark damp stains
    for (let i = 0; i < 18; i++) blob(c, Math.random() * w, Math.random() * h, 30 + Math.random() * 80, '#7f8781', .18);
    // tyre scuffs
    c.strokeStyle = 'rgba(70,76,72,.22)'; c.lineWidth = 7;
    for (let i = 0; i < 10; i++) { const y = Math.random() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * .3, y + 12, w * .6, y - 12, w, y); c.stroke(); }
    grain(c, w, h, 16);
  }, { repeat: true });

  /* ---------- seawall concrete (masonry, tide marks) ---------- */
  T.wall = HB.canvasTex(512, 512, function (c, w, h) {
    fill(c, w, h, '#a8ada6');
    for (let i = 0; i < 30; i++) blob(c, Math.random() * w, Math.random() * h, 40 + Math.random() * 110, Math.random() > .5 ? '#bcc2ba' : '#8f958e', .45);
    speck(c, w, h, 1800, 0.7, 2.4, '#79807a', .45);
    // masonry blocks
    const rows = 8, bh = h / rows;
    c.strokeStyle = 'rgba(70,76,72,.5)'; c.lineWidth = 2.5;
    for (let r = 0; r <= rows; r++) { c.beginPath(); c.moveTo(0, r * bh); c.lineTo(w, r * bh); c.stroke(); }
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) ? w / 4 : 0;
      for (let i = 0; i <= 4; i++) { const x = (i * w / 4 + off) % w; c.beginPath(); c.moveTo(x, r * bh); c.lineTo(x, (r + 1) * bh); c.stroke(); }
    }
    // --- wet / tide zone occupies the TOP of the texture (= deck level) ---
    const wet = c.createLinearGradient(0, 0, 0, h * 0.42);
    wet.addColorStop(0, 'rgba(46,66,64,.55)');
    wet.addColorStop(.35, 'rgba(52,72,70,.30)');
    wet.addColorStop(1, 'rgba(60,80,76,0)');
    c.fillStyle = wet; c.fillRect(0, 0, w, h * 0.42);
    // tide lines
    for (let i = 0; i < 5; i++) {
      const y = h * (0.05 + i * 0.075);
      const g = c.createLinearGradient(0, y - 14, 0, y + 14);
      g.addColorStop(0, 'rgba(60,80,74,0)'); g.addColorStop(.5, 'rgba(48,68,64,' + (0.4 - i * 0.06) + ')'); g.addColorStop(1, 'rgba(60,80,74,0)');
      c.fillStyle = g; c.fillRect(0, y - 14, w, 28);
    }
    // algae / seaweed streaks hanging from the waterline
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w, y0 = h * (0.02 + Math.random() * .22);
      c.strokeStyle = 'rgba(48,74,58,' + (0.25 + Math.random() * 0.45) + ')';
      c.lineWidth = 2 + Math.random() * 6; c.beginPath(); c.moveTo(x, y0);
      c.bezierCurveTo(x + 8, y0 + 40, x - 8, y0 + 80, x + 4, y0 + 40 + Math.random() * 90);
      c.stroke();
    }
    // barnacles + oyster shells (dense just below the waterline)
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * w, y = h * (0.02 + Math.random() * 0.5), r = 1.6 + Math.random() * 3.4;
      c.fillStyle = 'rgba(226,228,220,' + (0.45 + Math.random() * .5) + ')';
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(120,126,118,.6)'; c.lineWidth = .8;
      c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.stroke();
    }
    for (let i = 0; i < 34; i++) {
      const x = Math.random() * w, y = h * (0.08 + Math.random() * .45);
      c.fillStyle = 'rgba(214,210,196,.75)'; c.beginPath();
      c.ellipse(x, y, 5 + Math.random() * 8, 4 + Math.random() * 5, Math.random() * 3, 0, 7); c.fill();
      c.strokeStyle = 'rgba(140,136,120,.6)'; c.lineWidth = 1;
      for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x - 5, y - 3 + k * 2.4); c.lineTo(x + 5, y - 3 + k * 2.4); c.stroke(); }
    }
    // drip streaks
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = Math.random() * h * .5, l = 20 + Math.random() * 90;
      const g = c.createLinearGradient(0, y, 0, y + l);
      g.addColorStop(0, 'rgba(60,70,66,.22)'); g.addColorStop(1, 'rgba(60,70,66,0)');
      c.fillStyle = g; c.fillRect(x, y, 2 + Math.random() * 4, l);
    }
    grain(c, w, h, 14);
  }, { repeat: true });

  /* ---------- seabed gravel ---------- */
  T.seabed = HB.canvasTex(512, 512, function (c, w, h) {
    fill(c, w, h, '#5d6f68');
    for (let i = 0; i < 30; i++) blob(c, Math.random() * w, Math.random() * h, 50 + Math.random() * 120, Math.random() > .5 ? '#6f8178' : '#4a5b56', .55);
    speck(c, w, h, 1500, 1.5, 5, '#8b9488', .55);
    speck(c, w, h, 900, 1.5, 4, '#3b4844', .55);
    for (let i = 0; i < 120; i++) {
      c.fillStyle = 'rgba(' + (140 + Math.random() * 60 | 0) + ',' + (132 + Math.random() * 50 | 0) + ',' + (120 + Math.random() * 40 | 0) + ',.8)';
      c.save(); c.translate(Math.random() * w, Math.random() * h); c.rotate(Math.random() * 3);
      c.beginPath(); c.ellipse(0, 0, 2 + Math.random() * 6, 1.5 + Math.random() * 4, 0, 0, 7); c.fill(); c.restore();
    }
    grain(c, w, h, 18);
  }, { repeat: true });

  /* ---------- diagonal warning stripes ---------- */
  T.stripes = HB.canvasTex(128, 128, function (c, w, h) {
    fill(c, w, h, '#e8b62c');
    c.strokeStyle = '#22262a'; c.lineWidth = 22;
    for (let i = -3; i < 8; i++) { c.beginPath(); c.moveTo(i * 32, h); c.lineTo(i * 32 + 64, 0); c.stroke(); }
    // wear
    for (let i = 0; i < 60; i++) blob(c, Math.random() * w, Math.random() * h, 4 + Math.random() * 16, '#c9a343', .5);
    speck(c, w, h, 400, .5, 1.6, '#8f7a2a', .5);
    grain(c, w, h, 20);
  }, { repeat: true });

  /* ---------- wood planks ---------- */
  function woodTex(base, dark, light, planks) {
    return HB.canvasTex(256, 256, function (c, w, h) {
      fill(c, w, h, base);
      const ph = h / planks;
      for (let p = 0; p < planks; p++) {
        const y = p * ph;
        c.fillStyle = 'rgba(0,0,0,' + (0.04 + Math.random() * .07) + ')';
        c.fillRect(0, y, w, ph * .05);
        for (let i = 0; i < 26; i++) {
          c.strokeStyle = Math.random() > .5 ? dark : light;
          c.globalAlpha = .10 + Math.random() * .18; c.lineWidth = .6 + Math.random() * 1.8;
          const yy = y + Math.random() * ph;
          c.beginPath(); c.moveTo(0, yy);
          c.bezierCurveTo(w * .3, yy + (Math.random() - .5) * 6, w * .7, yy + (Math.random() - .5) * 6, w, yy);
          c.stroke();
        }
        c.globalAlpha = 1;
        // knots
        if (Math.random() > .6) {
          const x = Math.random() * w, yy = y + ph * .5;
          for (let k = 0; k < 5; k++) { c.strokeStyle = dark; c.globalAlpha = .3; c.lineWidth = 1.4; c.beginPath(); c.ellipse(x, yy, 3 + k * 2.2, 2 + k * 1.4, 0, 0, 7); c.stroke(); }
          c.globalAlpha = 1;
        }
      }
      // gaps between planks
      c.strokeStyle = 'rgba(40,30,20,.5)'; c.lineWidth = 2;
      for (let p = 0; p <= planks; p++) { c.beginPath(); c.moveTo(0, p * ph); c.lineTo(w, p * ph); c.stroke(); }
      grain(c, w, h, 12);
    }, { repeat: true });
  }
  T.wood = woodTex('#b98f5f', '#7c5b38', '#d8b184', 5);
  T.woodDark = woodTex('#8a6742', '#5d4227', '#a9815a', 6);
  T.woodLight = woodTex('#d3ae7c', '#a37f52', '#e8cba2', 4);

  /* ---------- rusted metal ---------- */
  T.rust = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#7d838a');
    for (let i = 0; i < 26; i++) blob(c, Math.random() * w, Math.random() * h, 20 + Math.random() * 70, Math.random() > .4 ? '#9c5f3d' : '#5d646c', .55);
    speck(c, w, h, 1200, .8, 2.6, '#4a3a30', .5);
    for (let i = 0; i < 60; i++) {
      c.strokeStyle = 'rgba(120,70,40,' + (.2 + Math.random() * .4) + ')'; c.lineWidth = 1 + Math.random() * 3;
      const x = Math.random() * w, y = Math.random() * h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - .5) * 40, y + Math.random() * 50); c.stroke();
    }
    grain(c, w, h, 20);
  }, { repeat: true });

  /* ---------- painted steel (weathered) ---------- */
  T.paintWorn = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#e9ece9');
    for (let i = 0; i < 30; i++) blob(c, Math.random() * w, Math.random() * h, 16 + Math.random() * 60, Math.random() > .5 ? '#f4f6f3' : '#c3c9c4', .4);
    for (let i = 0; i < 26; i++) blob(c, Math.random() * w, Math.random() * h, 5 + Math.random() * 26, '#9c5f3d', .30);
    speck(c, w, h, 900, .6, 2.0, '#9aa29c', .4);
    grain(c, w, h, 12);
  }, { repeat: true });

  /* ---------- boat hull paint: white with rust blooms ---------- */
  T.hull = HB.canvasTex(512, 512, function (c, w, h) {
    fill(c, w, h, '#f2f4f1');
    for (let i = 0; i < 22; i++) blob(c, Math.random() * w, Math.random() * h, 30 + Math.random() * 90, '#e2e6e2', .35);
    // rust blooms
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * w, y = h * (.55 + Math.random() * .45), r = 6 + Math.random() * 30;
      blob(c, x, y, r, '#a2603c', .55);
      speck(c, x - r, y - r, 2 * r, 2 * r, 40, 1, 3, '#8a4e30', .6);
    }
    // scuffs
    for (let i = 0; i < 60; i++) {
      c.strokeStyle = 'rgba(120,126,120,' + (.1 + Math.random() * .25) + ')'; c.lineWidth = 1 + Math.random() * 2.4;
      const x = Math.random() * w, y = Math.random() * h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - .5) * 60, y + (Math.random() - .5) * 10); c.stroke();
    }
    grain(c, w, h, 10);
  }, { repeat: true });

  /* ---------- fishing net (alpha) ---------- */
  T.netAlpha = HB.canvasTex(256, 256, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#e8e2cf'; c.lineWidth = 5;
    const step = 26;
    for (let i = -h; i < w + h; i += step) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i + h, h); c.stroke();
      c.beginPath(); c.moveTo(i, h); c.lineTo(i + h, 0); c.stroke();
    }
    // knots
    c.fillStyle = '#f2ecd8';
    for (let y = step; y < h; y += step) for (let x = step; x < w; x += step) { c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); }
  }, { srgb: false });

  /* ---------- rope fibre ---------- */
  T.rope = HB.canvasTex(64, 64, function (c, w, h) {
    fill(c, w, h, '#d9805a');
    for (let i = 0; i < 22; i++) {
      c.strokeStyle = Math.random() > .5 ? '#c06a46' : '#e8a179';
      c.lineWidth = 2 + Math.random() * 3; c.globalAlpha = .7;
      const x = Math.random() * w;
      c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 6, h * .33, x - 6, h * .66, x, h); c.stroke();
    }
    c.globalAlpha = 1; grain(c, w, h, 16);
  }, { repeat: true });

  T.ropeWet = HB.canvasTex(64, 64, function (c, w, h) {
    fill(c, w, h, '#9c4f36');
    for (let i = 0; i < 22; i++) {
      c.strokeStyle = Math.random() > .5 ? '#7d3d29' : '#b06a4c';
      c.lineWidth = 2 + Math.random() * 3; c.globalAlpha = .7;
      const x = Math.random() * w;
      c.beginPath(); c.moveTo(x, 0); c.bezierCurveTo(x + 6, h * .33, x - 6, h * .66, x, h); c.stroke();
    }
    c.globalAlpha = 1; grain(c, w, h, 14);
  }, { repeat: true });

  /* ---------- plastic fish box ---------- */
  T.fishBox = HB.canvasTex(128, 128, function (c, w, h) {
    fill(c, w, h, '#eef0ec');
    c.strokeStyle = '#cfd3cd'; c.lineWidth = 6;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.strokeStyle = '#d9ddd7'; c.lineWidth = 3;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(6, i * h / 4); c.lineTo(w - 6, i * h / 4); c.stroke(); }
    speck(c, w, h, 500, .5, 1.6, '#9aa29c', .4);
    for (let i = 0; i < 12; i++) blob(c, Math.random() * w, Math.random() * h, 4 + Math.random() * 14, '#c9cdc7', .5);
    grain(c, w, h, 10);
  }, { repeat: true });

  /* ---------- blue plastic crate ---------- */
  T.crate = HB.canvasTex(128, 128, function (c, w, h) {
    fill(c, w, h, '#2f6f9e');
    c.strokeStyle = '#24577c'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8);
    c.strokeStyle = '#3a80b4'; c.lineWidth = 4;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(4, i * h / 4); c.lineTo(w - 4, i * h / 4); c.stroke(); }
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(i * w / 4, 4); c.lineTo(i * w / 4, h - 4); c.stroke(); }
    for (let i = 0; i < 14; i++) blob(c, Math.random() * w, Math.random() * h, 3 + Math.random() * 10, '#1d4a6d', .5);
    grain(c, w, h, 12);
  }, { repeat: true });

  /* ---------- radar screen ---------- */
  T.radar = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#04231f');
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 60; i++) blob(c, Math.random() * w, Math.random() * h, 20 + Math.random() * 60, '#0a3a32', .5);
    c.strokeStyle = 'rgba(90,230,190,.55)';
    for (let r = 20; r < w / 2; r += 24) { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.stroke(); }
    for (let a = 0; a < 12; a++) { c.beginPath(); c.moveTo(cx, cy); const t = a / 12 * Math.PI * 2; c.lineTo(cx + Math.cos(t) * 120, cy + Math.sin(t) * 120); c.stroke(); }
    // sweep
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(120,255,215,0)'); g.addColorStop(.75, 'rgba(120,255,215,.45)'); g.addColorStop(1, 'rgba(160,255,230,.9)');
    c.fillStyle = g; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 124, -0.5, 0.5); c.fill();
    // blips
    c.fillStyle = '#c8ffe8';
    for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28, r = 20 + Math.random() * 100; c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5 + Math.random() * 3, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(140,255,220,.8)'; c.lineWidth = 3; c.strokeRect(4, 4, w - 8, h - 8);
  });

  /* ---------- fish finder screen ---------- */
  T.fishfinder = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#021a24');
    for (let i = 0; i < 40; i++) blob(c, Math.random() * w, Math.random() * h, 20 + Math.random() * 50, '#062c3a', .5);
    c.strokeStyle = 'rgba(120,220,255,.35)';
    for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(0, i * h / 8); c.lineTo(w, i * h / 8); c.stroke(); }
    for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(i * w / 6, 0); c.lineTo(i * w / 6, h); c.stroke(); }
    // bottom profile
    c.fillStyle = '#0b3a46'; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) c.lineTo(x, h * .55 + Math.sin(x * .05) * 14 + Math.sin(x * .11) * 8);
    c.lineTo(w, h); c.fill();
    c.strokeStyle = 'rgba(180,245,255,.9)'; c.lineWidth = 2.5; c.beginPath();
    for (let x = 0; x <= w; x += 8) { const y = h * .55 + Math.sin(x * .05) * 14 + Math.sin(x * .11) * 8; x === 0 ? c.moveTo(x, y) : c.lineTo(x, y); }
    c.stroke();
    // fish school
    c.fillStyle = 'rgba(200,250,255,.9)';
    for (let i = 0; i < 26; i++) { const x = 90 + Math.random() * 70, y = h * .3 + Math.random() * 60; c.beginPath(); c.ellipse(x, y, 4, 2.2, 0, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,210,120,.9)'; c.font = 'bold 20px "Yu Gothic", sans-serif'; c.fillText('12.4m', 10, 26);
  });

  /* ---------- nautical chart ---------- */
  T.chart = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#efe3c4');
    for (let i = 0; i < 50; i++) blob(c, Math.random() * w, Math.random() * h, 20 + Math.random() * 60, '#e6d7b2', .5);
    c.strokeStyle = 'rgba(120,140,120,.5)'; c.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) { c.beginPath(); c.moveTo(0, Math.random() * h); c.bezierCurveTo(w * .3, Math.random() * h, w * .7, Math.random() * h, w, Math.random() * h); c.stroke(); }
    c.strokeStyle = 'rgba(90,110,140,.6)';
    for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 26, 0, 7); c.stroke(); }
    c.fillStyle = 'rgba(70,90,70,.75)'; c.font = '13px "Yu Gothic", sans-serif';
    c.fillText('汐 浦 漁 港', 14, 24); c.fillText('潮 汐 表', 14, 44);
    c.fillStyle = 'rgba(60,80,110,.8)';
    for (let i = 0; i < 10; i++) c.fillText((1 + i) + '時  ' + (120 + i * 37) + 'cm', 14, 70 + i * 16);
    // compass
    c.save(); c.translate(w - 44, h - 44); c.strokeStyle = 'rgba(60,70,60,.8)'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 26, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(0, -26); c.lineTo(6, 0); c.lineTo(0, 26); c.lineTo(-6, 0); c.fill(); c.fill();
    c.restore();
    grain(c, w, h, 12);
  });

  /* ---------- faded timetable ---------- */
  T.timetable = HB.canvasTex(256, 160, function (c, w, h) {
    fill(c, w, h, '#f0ece0');
    for (let i = 0; i < 20; i++) blob(c, Math.random() * w, Math.random() * h, 10 + Math.random() * 40, '#ddd6c2', .5);
    c.fillStyle = 'rgba(70,80,90,.75)'; c.font = 'bold 16px "Yu Gothic", sans-serif';
    c.fillText('汽 船 時 刻 表', 12, 20);
    c.strokeStyle = 'rgba(90,100,110,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(10, 26); c.lineTo(w - 10, 26); c.stroke();
    c.fillStyle = 'rgba(80,90,100,.6)'; c.font = '12px "Yu Gothic", sans-serif';
    const dep = ['06:15', '07:40', '09:05', '10:30', '12:00', '13:25', '15:10', '16:45', '18:00'];
    for (let i = 0; i < dep.length; i++) { c.fillText(dep[i], 14, 44 + i * 12); c.fillText('汐 浦 港', 78, 44 + i * 12); c.fillText(i % 2 ? '佐 渡 島' : '沖 之 島', 152, 44 + i * 12); }
    // faded / sun-bleached patches
    for (let i = 0; i < 12; i++) blob(c, Math.random() * w, Math.random() * h, 8 + Math.random() * 30, '#fbf7ea', .55);
    // tape marks
    c.fillStyle = 'rgba(220,215,200,.75)'; c.fillRect(w * .55, 6, 14, h - 12); c.fillRect(w * .78, 10, 10, h - 20);
    grain(c, w, h, 10);
  });

  /* ---------- auction blackboard ---------- */
  T.blackboard = HB.canvasTex(512, 256, function (c, w, h) {
    fill(c, w, h, '#20302c');
    for (let i = 0; i < 24; i++) blob(c, Math.random() * w, Math.random() * h, 20 + Math.random() * 60, Math.random() > .5 ? '#2a3a35' : '#182521', .5);
    c.strokeStyle = 'rgba(232,228,206,.18)';
    for (let i = 0; i < 30; i++) { const x = Math.random() * w; c.beginPath(); c.moveTo(x, Math.random() * h); c.lineTo(x + (Math.random() - .5) * 40, Math.random() * h); c.stroke(); }
    c.fillStyle = 'rgba(240,238,214,.9)'; c.font = 'bold 30px "Yu Gothic", sans-serif';
    c.fillText('本 日 拍 賣 價 格', 16, 42);
    c.strokeStyle = 'rgba(240,238,214,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(14, 54); c.lineTo(w - 14, 54); c.stroke();
    const rows = [['鰺', '￥ 1,280'], ['鮪', '￥ 8,600'], ['鰯', '￥ 460'], ['鮭', '￥ 2,150'], ['平宗', '￥ 3,900'], ['海老', '￥ 1,050']];
    c.font = '24px "Yu Gothic", sans-serif';
    for (let i = 0; i < rows.length; i++) {
      c.fillStyle = 'rgba(240,238,214,' + (0.55 + Math.random() * .3) + ')';
      c.fillText(rows[i][0], 20 + (i % 2) * 250, 92 + Math.floor(i / 2) * 54);
      c.fillStyle = 'rgba(255,225,150,' + (0.5 + Math.random() * .35) + ')';
      c.fillText(rows[i][1], 96 + (i % 2) * 250, 92 + Math.floor(i / 2) * 54);
    }
    // chalk dust
    for (let i = 0; i < 120; i++) { c.fillStyle = 'rgba(255,255,255,' + Math.random() * .12 + ')'; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    grain(c, w, h, 10);
  });

  /* ---------- catch photo ---------- */
  T.photo = HB.canvasTex(128, 96, function (c, w, h) {
    fill(c, w, h, '#c8d2d0');
    for (let i = 0; i < 20; i++) blob(c, Math.random() * w, Math.random() * h, 10 + Math.random() * 30, '#b3c0bd', .5);
    // fish on ice
    for (let i = 0; i < 7; i++) {
      const x = 20 + Math.random() * (w - 40), y = 22 + Math.random() * (h - 40);
      c.save(); c.translate(x, y); c.rotate((Math.random() - .5) * .8);
      c.fillStyle = '#e8eef0'; c.beginPath(); c.ellipse(0, 0, 18, 6, 0, 0, 7); c.fill();
      c.beginPath(); c.moveTo(16, 0); c.lineTo(26, -7); c.lineTo(26, 7); c.fill();
      c.fillStyle = '#c3cdcb'; c.beginPath(); c.arc(-14, 0, 3, 0, 7); c.fill();
      c.restore();
    }
    speck(c, w, h, 400, .5, 1.4, '#ffffff', .7);
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 5; c.strokeRect(2, 2, w - 4, h - 4);
    grain(c, w, h, 14);
  });

  /* ---------- vending machine front ---------- */
  T.vending = HB.canvasTex(256, 384, function (c, w, h) {
    fill(c, w, h, '#c8322c');
    c.fillStyle = '#e8e2d4'; c.fillRect(10, 10, w - 20, 60);
    c.fillStyle = 'rgba(40,40,40,.8)'; c.font = 'bold 26px "Yu Gothic", sans-serif';
    c.fillText('自 動 販 賣 機', 26, 50);
    const cols = ['#e8d24a', '#4aa8d2', '#e87a3a', '#7ac24a', '#d24a8a', '#4a6ad2'];
    for (let r = 0; r < 6; r++) for (let i = 0; i < 3; i++) {
      const x = 20 + i * 76, y = 86 + r * 40;
      c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(x, y, 60, 30);
      c.fillStyle = cols[(r + i) % cols.length]; c.fillRect(x + 4, y + 4, 24, 22);
      c.fillStyle = 'rgba(60,60,60,.8)'; c.fillRect(x + 32, y + 6, 20, 6); c.fillRect(x + 32, y + 16, 20, 6);
    }
    c.fillStyle = '#2a2c2e'; c.fillRect(20, h - 76, w - 40, 58);
    c.fillStyle = 'rgba(255,240,190,.9)'; c.font = '18px "Yu Gothic", sans-serif';
    c.fillText('つめたい 150円', 34, h - 46);
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(34, h - 34, 90, 12);
    // glow
    blob(c, w / 2, h * .3, 150, '#ffffff', .10);
    grain(c, w, h, 10);
  });

  /* ---------- port sign ---------- */
  T.sign = HB.canvasTex(512, 256, function (c, w, h) {
    fill(c, w, h, '#e8ece6');
    c.strokeStyle = '#8f968e'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = 'rgba(50,70,80,.85)'; c.font = 'bold 62px "Shippori Mincho B1 Medium", "Yu Gothic", serif';
    c.fillText('汐 浦 漁 港', 40, 96);
    c.fillStyle = 'rgba(200,70,40,.9)'; c.font = 'bold 44px "Yu Gothic", sans-serif';
    c.fillText('注 意 落 水', 130, 176);
    // faded paint
    for (let i = 0; i < 40; i++) blob(c, Math.random() * w, Math.random() * h, 8 + Math.random() * 44, '#d6dbd4', .5);
    for (let i = 0; i < 26; i++) blob(c, Math.random() * w, Math.random() * h, 4 + Math.random() * 20, '#9c5f3d', .22);
    speck(c, w, h, 300, .5, 1.6, '#8f968e', .5);
    grain(c, w, h, 14);
  });

  /* ---------- faded buoy number ---------- */
  T.buoyNum = HB.canvasTex(128, 128, function (c, w, h) {
    fill(c, w, h, '#e4b23c');
    c.fillStyle = 'rgba(40,60,80,.75)'; c.font = 'bold 74px "Arial Black", sans-serif';
    c.fillText('17', 12, 96);
    for (let i = 0; i < 20; i++) blob(c, Math.random() * w, Math.random() * h, 5 + Math.random() * 22, '#c99a30', .55);
    for (let i = 0; i < 14; i++) blob(c, Math.random() * w, Math.random() * h, 3 + Math.random() * 14, '#9c5f3d', .35);
    speck(c, w, h, 200, .5, 1.6, '#7a6a2a', .5);
    grain(c, w, h, 16);
  }, { repeat: true });

  /* ---------- roof tiles ---------- */
  T.tile = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#6d7d88');
    const rows = 7, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rh;
      for (let i = 0; i < 6; i++) {
        const x = i * w / 6;
        const g = c.createLinearGradient(x, y, x + w / 6, y);
        g.addColorStop(0, '#5a6874'); g.addColorStop(.5, '#7d8d99'); g.addColorStop(1, '#5a6874');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(x, y + rh); c.quadraticCurveTo(x + w / 12, y + 2, x + w / 6, y + rh); c.lineTo(x + w / 6, y + rh); c.fill();
      }
      c.fillStyle = 'rgba(30,40,48,.45)'; c.fillRect(0, y + rh - 3, w, 4);
    }
    for (let i = 0; i < 30; i++) blob(c, Math.random() * w, Math.random() * h, 6 + Math.random() * 26, '#4d5a63', .4);
    for (let i = 0; i < 20; i++) blob(c, Math.random() * w, Math.random() * h, 3 + Math.random() * 12, '#7c8a70', .3);
    grain(c, w, h, 14);
  }, { repeat: true });

  /* ---------- cloud shadow ---------- */
  T.cloudShadow = HB.canvasTex(512, 512, function (c, w, h) {
    fill(c, w, h, '#ffffff');
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 110;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(150,168,178,.85)'); g.addColorStop(.6, 'rgba(190,205,212,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    // soft edges overall
    const g2 = c.createRadialGradient(w / 2, h / 2, w * .25, w / 2, h / 2, w * .62);
    g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(1, 'rgba(255,255,255,.7)');
    c.fillStyle = g2; c.fillRect(0, 0, w, h);
  }, { repeat: true, srgb: false });

  /* ---------- rain streak sprite ---------- */
  T.rain = HB.canvasTex(16, 64, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(.35, 'rgba(255,252,235,.85)');
    g.addColorStop(.6, 'rgba(255,248,222,.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(w * .5 - 1.4, 0); c.lineTo(w * .5 + 1.4, 0);
    c.lineTo(w * .5 + 0.6, h); c.lineTo(w * .5 - 0.6, h);
    c.closePath(); c.fill();
  }, { srgb: false });

  /* ---------- caustics for underwater ---------- */
  T.caustic = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#000000');
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      c.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (Math.random() - .5) * 70; y += (Math.random() - .5) * 70; c.lineTo(x, y); }
      c.stroke();
    }
    c.filter = 'blur(2px)';
    for (let i = 0; i < 20; i++) blob(c, Math.random() * w, Math.random() * h, 10 + Math.random() * 40, '#ffffff', .25);
  }, { repeat: true, srgb: false });

  /* ---------- umbrella fabric ---------- */
  T.umbrella = HB.canvasTex(128, 128, function (c, w, h) {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(226,244,246,.55)'; c.beginPath(); c.arc(w / 2, h / 2, w * .48, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * w * .46, h / 2 + Math.sin(a) * w * .46); c.stroke(); }
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(w / 2, h / 2, w * (.14 + i * .11), 0, 7); c.stroke(); }
    speck(c, w, h, 260, .5, 1.5, 'rgba(255,255,255,.8)', .8);
  });

  /* ---------- tire sidewall ---------- */
  T.tire = HB.canvasTex(128, 128, function (c, w, h) {
    fill(c, w, h, '#2f3337');
    c.strokeStyle = '#1e2225'; c.lineWidth = 5;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(w / 2, h / 2, 16 + i * 13, 0, 7); c.stroke(); }
    c.strokeStyle = '#3d4348'; c.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * 22, h / 2 + Math.sin(a) * 22); c.lineTo(w / 2 + Math.cos(a) * 60, h / 2 + Math.sin(a) * 60); c.stroke(); }
    c.fillStyle = '#20242a'; c.beginPath(); c.arc(w / 2, h / 2, 15, 0, 7); c.fill();
    speck(c, w, h, 700, .5, 1.8, '#1a1d20', .8);
    speck(c, w, h, 300, .5, 1.4, '#565c62', .5);
    grain(c, w, h, 14);
  }, { repeat: true });

  /* ---------- galvanised / zinc sheet ---------- */
  T.zinc = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#b8bec2');
    for (let i = 0; i < 18; i++) blob(c, Math.random() * w, Math.random() * h, 14 + Math.random() * 44, Math.random() > .5 ? '#c8ced2' : '#9aa2a8', .4);
    for (let i = 0; i < 40; i++) blob(c, Math.random() * w, Math.random() * h, 3 + Math.random() * 14, '#9c5f3d', .3);
    c.strokeStyle = 'rgba(120,128,134,.5)'; c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
    grain(c, w, h, 12);
  }, { repeat: true });

  /* ---------- painted wood wall (buildings) ---------- */
  T.wallPaint = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#dcd8c8');
    for (let i = 0; i < 24; i++) blob(c, Math.random() * w, Math.random() * h, 14 + Math.random() * 50, Math.random() > .5 ? '#e8e4d4' : '#c4c0b0', .4);
    for (let i = 0; i < 20; i++) blob(c, Math.random() * w, Math.random() * h, 3 + Math.random() * 16, '#9c5f3d', .25);
    speck(c, w, h, 500, .5, 1.6, '#8f8a78', .4);
    grain(c, w, h, 12);
  }, { repeat: true });

  /* ---------- shutter (roller) ---------- */
  T.shutter = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#8d959b');
    for (let y = 0; y < h; y += 12) {
      const g = c.createLinearGradient(0, y, 0, y + 12);
      g.addColorStop(0, '#a4acb2'); g.addColorStop(.5, '#7e868c'); g.addColorStop(1, '#a4acb2');
      c.fillStyle = g; c.fillRect(0, y, w, 12);
    }
    for (let i = 0; i < 40; i++) blob(c, Math.random() * w, Math.random() * h, 4 + Math.random() * 26, '#9c5f3d', .35);
    for (let i = 0; i < 24; i++) blob(c, Math.random() * w, Math.random() * h, 3 + Math.random() * 18, '#5d646c', .35);
    grain(c, w, h, 16);
  }, { repeat: true });

  /* ---------- mossy rock ---------- */
  T.rock = HB.canvasTex(256, 256, function (c, w, h) {
    fill(c, w, h, '#7c8288');
    for (let i = 0; i < 30; i++) blob(c, Math.random() * w, Math.random() * h, 16 + Math.random() * 60, Math.random() > .5 ? '#949aa0' : '#5f656b', .5);
    speck(c, w, h, 1400, .6, 2.4, '#4a5055', .5);
    for (let i = 0; i < 26; i++) blob(c, Math.random() * w, Math.random() * h, 6 + Math.random() * 30, '#5f7a52', .4);
    grain(c, w, h, 16);
  }, { repeat: true });
})();
