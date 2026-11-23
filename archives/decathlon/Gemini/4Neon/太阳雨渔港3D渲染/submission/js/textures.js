// High-resolution procedural Canvas2D textures (100% file:// safe, crisp Japanese typography & anime details)
(function () {
  const { createRNG } = window.HARBOR;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function finishTex(canvas, opts) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = (opts && opts.linear) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    tex.wrapS = (opts && opts.wrapS) || THREE.ClampToEdgeWrapping;
    tex.wrapT = (opts && opts.wrapT) || THREE.ClampToEdgeWrapping;
    if (opts && opts.repeat) tex.repeat.set(opts.repeat[0], opts.repeat[1]);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  const FONT_SANS = '"Zen Kaku Gothic New Medium", "Yu Gothic", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  const FONT_SERIF = '"Shippori Mincho B1 Medium", "Noto Serif SC", "MS PMincho", serif';

  // 1. Wet Rough Concrete Deck (albedo + wetness map)
  function createWetConcreteTextures() {
    const size = 1024;
    const c = makeCanvas(size, size);
    const ctx = c.getContext('2d');
    const rng = createRNG(101);

    // Base pale gray-white sunlit concrete
    ctx.fillStyle = '#dde5e6';
    ctx.fillRect(0, 0, size, size);

    // Subtle tonal patches (watercolor wash feel)
    for (let i = 0; i < 140; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const r = 35 + rng() * 140;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      const dark = rng() > 0.45;
      g.addColorStop(0, dark ? 'rgba(154,176,184,0.16)' : 'rgba(244,250,251,0.20)');
      g.addColorStop(1, 'rgba(200,214,218,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Damp rain-stain pools (darker wet patches)
    const wc = makeCanvas(size, size);
    const wctx = wc.getContext('2d');
    wctx.fillStyle = '#707070'; // baseline damp concrete
    wctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 48; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const rx = 30 + rng() * 120;
      const ry = 25 + rng() * 95;
      const ang = rng() * Math.PI;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(122,148,158,0.28)');
      g.addColorStop(0.7, 'rgba(138,162,172,0.12)');
      g.addColorStop(1, 'rgba(138,162,172,0)');
      ctx.fillStyle = g;
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Corresponding high wetness
      wctx.save();
      wctx.translate(x, y);
      wctx.rotate(ang);
      const wg = wctx.createRadialGradient(0, 0, 4, 0, 0, Math.max(rx, ry));
      wg.addColorStop(0, 'rgba(245,245,245,0.65)');
      wg.addColorStop(1, 'rgba(120,120,120,0)');
      wctx.fillStyle = wg;
      wctx.scale(1, ry / rx);
      wctx.beginPath();
      wctx.arc(0, 0, rx, 0, Math.PI * 2);
      wctx.fill();
      wctx.restore();
    }

    // Fine concrete speckle & pits
    for (let i = 0; i < 3200; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const s = 1 + rng() * 2.2;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(105,126,136,0.18)' : 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, s, s);
    }

    // Concrete slab expansion joints (4x4 grid)
    ctx.strokeStyle = 'rgba(92,115,126,0.42)';
    ctx.lineWidth = 3;
    const step = size / 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(size, i * step);
      ctx.stroke();
      // Subtle highlight beside seam
      ctx.strokeStyle = 'rgba(246,252,253,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(i * step + 2, 0);
      ctx.lineTo(i * step + 2, size);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(92,115,126,0.42)';
      ctx.lineWidth = 3;
    }

    // Subtle hairline cracks
    ctx.strokeStyle = 'rgba(84,104,114,0.30)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 12; i++) {
      let cx = rng() * size;
      let cy = rng() * size;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let j = 0; j < 7; j++) {
        cx += (rng() - 0.5) * 42;
        cy += (rng() - 0.5) * 42;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }

    return {
      map: finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [3.2, 3.2] }),
      wetnessMap: finishTex(wc, { linear: true, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [3.2, 3.2] })
    };
  }

  // 2. Concrete Seawall with stacked blocks + multi-band tidal marks
  // UV v=1 is deck top (y=+1.35), v=0 is bottom (y=-3.92), waterline y=0 is around v=0.744
  function createSeawallTexture() {
    const w = 1024, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(202);

    // Vertical gradient representing tidal zones (canvas y=0 is top y=+1.35, y=h is bottom y=-3.92)
    // Waterline y=0 corresponds to canvasY = (1.35 / 5.27) * 512 ≈ 131
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.00, '#d7e0e2'); // dry/rain-wet concrete cap
    grad.addColorStop(0.14, '#c2cfd3'); // upper splash zone
    grad.addColorStop(0.21, '#8ea4a8'); // high-tide stain line
    grad.addColorStop(0.26, '#567879'); // dark wet tidal algae band
    grad.addColorStop(0.32, '#436866'); // submerged moss-teal zone
    grad.addColorStop(0.55, '#3b5c61'); // deeper concrete blocks
    grad.addColorStop(1.00, '#2a464e'); // seabed footing
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Concrete block rows (11 stacked courses across 5.27m -> ~3 clear courses above waterline!)
    const rows = 11;
    const rowH = h / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const cols = 10;
      const colW = w / cols;
      const offset = (r % 2) * (colW * 0.5);
      for (let col = -1; col <= cols; col++) {
        const x = col * colW + offset;
        const tone = (rng() - 0.5) * 24;
        ctx.fillStyle = tone > 0
          ? `rgba(238,246,248,${(tone / 190).toFixed(3)})`
          : `rgba(34,58,64,${(-tone / 150).toFixed(3)})`;
        ctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);

        // Crisp recessed horizontal & vertical mortar joint shadow
        ctx.strokeStyle = 'rgba(28,48,56,0.62)';
        ctx.lineWidth = 3.5;
        ctx.strokeRect(x + 1, y + 1, colW - 2, rowH - 2);
        // Subtle sunlit concrete block top bevel highlight
        ctx.strokeStyle = 'rgba(240,248,250,0.28)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 3);
        ctx.lineTo(x + colW - 3, y + 3);
        ctx.stroke();
      }
    }

    // Organic wavy multi-band tidal marks around canvasY = 100..185
    const drawTideBand = (centerY, bandH, color, alpha) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, centerY - bandH);
      for (let x = 0; x <= w; x += 16) {
        const wave = Math.sin(x * 0.025) * 7 + Math.cos(x * 0.068) * 4;
        ctx.lineTo(x, centerY - bandH * 0.5 + wave);
      }
      for (let x = w; x >= 0; x -= 16) {
        const wave = Math.sin(x * 0.03 + 1.1) * 8 + Math.cos(x * 0.055) * 4;
        ctx.lineTo(x, centerY + bandH * 0.5 + wave);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    drawTideBand(104, 18, '#93a8ab', 0.45);
    drawTideBand(126, 26, '#466964', 0.58);
    drawTideBand(148, 34, '#365a52', 0.62);
    drawTideBand(180, 42, '#2d4e4f', 0.40);

    // Vertical water drip streaks from deck edge
    for (let i = 0; i < 65; i++) {
      const x = rng() * w;
      const len = 45 + rng() * 150;
      const g = ctx.createLinearGradient(x, 0, x, len);
      g.addColorStop(0, 'rgba(65,90,98,0.34)');
      g.addColorStop(1, 'rgba(65,90,98,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 2 + rng() * 5, len);
    }

    // Rough surface grain
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(25,45,50,0.16)';
      ctx.fillRect(rng() * w, rng() * h, 2, 2);
    }

    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }

  // 3. Outer Cutaway Concrete Cross-Section (stratified concrete deck, rubble base, caisson slab)
  function createCutawaySideTexture() {
    const w = 1024, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(303);

    // Architectural diorama cutaway layers
    // Top concrete slab (0..78)
    ctx.fillStyle = '#c9d5d8';
    ctx.fillRect(0, 0, w, 78);
    // Mid compacted concrete/aggregate fill (78..250)
    ctx.fillStyle = '#9db0b7';
    ctx.fillRect(0, 78, w, 175);
    // Lower damp masonry foundation (250..512)
    const g = ctx.createLinearGradient(0, 250, 0, h);
    g.addColorStop(0, '#728992');
    g.addColorStop(0.55, '#526b75');
    g.addColorStop(1, '#3b525c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 250, w, h - 250);

    // Horizontal architectural stratum seams
    ctx.strokeStyle = 'rgba(42,66,76,0.55)';
    ctx.lineWidth = 4;
    [78, 165, 252, 355, 445].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    // Block vertical seams in lower section
    for (let row = 0; row < 4; row++) {
      const y0 = [78, 165, 252, 355][row];
      const y1 = [165, 252, 355, 445][row];
      const cols = 8;
      const cw = w / cols;
      const off = (row % 2) * cw * 0.5;
      for (let i = 0; i <= cols; i++) {
        const x = i * cw + off;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
      }
    }

    // Subtle aggregate pebbles in cutaway
    for (let i = 0; i < 1600; i++) {
      const x = rng() * w;
      const y = 80 + rng() * (h - 90);
      const r = 1.5 + rng() * 3.5;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(220,232,236,0.14)' : 'rgba(32,50,58,0.22)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }

  // 4. Worn Yellow-and-Black Hazard Curb Stripes
  function createHazardStripeTexture() {
    const w = 512, h = 128;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(404);

    ctx.fillStyle = '#f2c335';
    ctx.fillRect(0, 0, w, h);

    // Diagonal black stripes
    ctx.fillStyle = '#252f36';
    const stripeW = 48;
    for (let x = -h; x < w + h; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + stripeW, h);
      ctx.lineTo(x + stripeW + h * 0.85, 0);
      ctx.lineTo(x + h * 0.85, 0);
      ctx.closePath();
      ctx.fill();
    }

    // Natural paint chipping & concrete wear along top edge
    for (let i = 0; i < 420; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const edgeBias = (y < 24 || y > h - 18) ? 2.2 : 0.7;
      if (rng() < 0.35 * edgeBias) {
        ctx.fillStyle = rng() > 0.3 ? 'rgba(206,216,218,0.72)' : 'rgba(130,145,150,0.55)';
        ctx.fillRect(x, y, 2 + rng() * 14, 2 + rng() * 7);
      }
    }

    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, repeat: [4, 1] });
  }

  // 5. Boat Hull White Gelcoat + Waterline Trim + Subtle Rust & Japanese Boat Name
  function createBoatHullTexture(trimColor, boatName, seed) {
    const w = 1024, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(seed || 505);

    // Clean crisp white boat paint
    ctx.fillStyle = '#f4f8f9';
    ctx.fillRect(0, 0, w, h);

    // Subtle top gunwale stripe
    ctx.fillStyle = trimColor || '#3a84a8';
    ctx.fillRect(0, 14, w, 16);

    // Lower anti-fouling hull band (deep marine blue-teal / muted red-rust)
    ctx.fillStyle = '#2c5e74';
    ctx.fillRect(0, 178, w, 78);
    ctx.fillStyle = trimColor || '#3a84a8';
    ctx.fillRect(0, 164, w, 14);

    // Subtle localized rust streaks dripping from scuppers / rub rail
    for (let i = 0; i < 18; i++) {
      const x = 60 + rng() * (w - 120);
      const y0 = 26 + rng() * 55;
      const len = 25 + rng() * 75;
      const g = ctx.createLinearGradient(x, y0, x, y0 + len);
      g.addColorStop(0, 'rgba(166,92,58,0.55)');
      g.addColorStop(0.5, 'rgba(178,108,68,0.25)');
      g.addColorStop(1, 'rgba(178,108,68,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y0, 3 + rng() * 6, len);
    }

    // Salt/waterline grime flecks
    for (let i = 0; i < 360; i++) {
      const x = rng() * w;
      const y = 148 + rng() * 44;
      ctx.fillStyle = rng() > 0.5 ? 'rgba(92,126,130,0.22)' : 'rgba(160,96,62,0.20)';
      ctx.fillRect(x, y, 3 + rng() * 9, 2 + rng() * 4);
    }

    // Crisp Japanese boat name once near forward bow on BOTH Port [0..512] & Starboard [512..1024] + authentic aft registry code!
    if (boatName) {
      const regNum = 'SO' + (1 + ((seed || 505) % 4)) + '-' + (210 + (((seed || 505) * 37) % 680));
      ctx.save();
      ctx.textAlign = 'center';
      // Port side [0..512]: stern at 0, bow at 512 -> bow quarter at x=348, aft quarter at x=128
      ctx.fillStyle = '#244558';
      ctx.font = `bold 32px ${FONT_SERIF}`;
      ctx.fillText(boatName, 344, 108);
      ctx.fillStyle = '#4a6c7e';
      ctx.font = `bold 17px ${FONT_SANS}`;
      ctx.fillText(regNum, 128, 102);

      // Starboard side [512..1024]: bow at 512, stern at 1024 -> bow quarter at x=680, aft quarter at x=896
      ctx.fillStyle = '#244558';
      ctx.font = `bold 32px ${FONT_SERIF}`;
      ctx.fillText(boatName, 680, 108);
      ctx.fillStyle = '#4a6c7e';
      ctx.font = `bold 17px ${FONT_SANS}`;
      ctx.fillText(regNum, 896, 102);
      ctx.restore();
    }

    return finishTex(c);
  }

  // 6. Glowing Marine Radar Screen
  function createRadarTexture() {
    const s = 256;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#08221e';
    ctx.fillRect(0, 0, s, s);

    const cx = s / 2, cy = s / 2, r = s * 0.44;
    // Sweep glow wedge
    const sweep = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    sweep.addColorStop(0, 'rgba(72,255,196,0.55)');
    sweep.addColorStop(1, 'rgba(28,175,132,0.06)');
    ctx.fillStyle = sweep;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -0.95, -0.15);
    ctx.closePath();
    ctx.fill();

    // Concentric range circles & crosshairs
    ctx.strokeStyle = 'rgba(85,245,190,0.48)';
    ctx.lineWidth = 2;
    [0.25, 0.5, 0.75, 1.0].forEach((k) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Bright sweep line
    ctx.strokeStyle = '#9dffdf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(-0.15) * r, cy + Math.sin(-0.15) * r);
    ctx.stroke();

    // Coastline & buoy blips
    ctx.fillStyle = '#b4ffe6';
    [[165, 86, 6], [178, 108, 4], [95, 76, 5], [142, 168, 4], [192, 145, 7]].forEach(([x, y, rad]) => {
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = '#7ef7d0';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('RNG 1.5NM', 10, 22);
    ctx.fillText('HDG 048°', 168, 242);

    return finishTex(c);
  }

  // 7. Glowing Fishfinder Sonar Display
  function createFishfinderTexture() {
    const w = 256, h = 192;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a2a4a');
    bg.addColorStop(1, '#05152b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Depth grid
    ctx.strokeStyle = 'rgba(92,192,255,0.28)';
    ctx.lineWidth = 1;
    for (let y = 32; y < h; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Seabed contour echo (red-orange-yellow)
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = 132 + Math.sin(x * 0.04) * 14 + Math.cos(x * 0.09) * 6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = '#d9483b';
    ctx.fill();
    ctx.strokeStyle = '#ffe159';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Fish school sonar arches
    const schools = [[58, 74], [74, 82], [90, 72], [148, 92], [164, 85], [180, 96], [194, 88]];
    schools.forEach(([x, y]) => {
      ctx.strokeStyle = '#ff9d3b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y + 6, 9, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    });

    ctx.fillStyle = '#b4f4ff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('12.4m', 10, 24);
    ctx.font = '13px monospace';
    ctx.fillStyle = '#ffe98a';
    ctx.fillText('18.6°C', 184, 22);

    return finishTex(c);
  }

  // 8. Nautical Chart & Tide Table on Clipboard
  function createNauticalChartTexture() {
    const w = 512, h = 384;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f5f1e2';
    ctx.fillRect(0, 0, w, h);

    // Chart area (left 62%)
    ctx.fillStyle = '#d9eef2';
    ctx.fillRect(16, 18, 295, 348);
    // Landmass contour
    ctx.fillStyle = '#e7dec2';
    ctx.beginPath();
    ctx.moveTo(16, 18); ctx.lineTo(152, 18); ctx.lineTo(132, 110);
    ctx.lineTo(185, 165); ctx.lineTo(115, 255); ctx.lineTo(148, 366); ctx.lineTo(16, 366);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5c727a';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Depth contour rings & compass rose
    ctx.strokeStyle = 'rgba(56,125,152,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(218, 128, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(218, 128, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#d25847';
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(140, 198); ctx.quadraticCurveTo(212, 186, 286, 86);
    ctx.stroke();
    ctx.setLineDash([]);

    // Right side: Tide Table (潮汐表)
    ctx.fillStyle = '#fcfaf2';
    ctx.fillRect(324, 18, 172, 348);
    ctx.strokeStyle = '#365869';
    ctx.lineWidth = 2;
    ctx.strokeRect(324, 18, 172, 348);

    ctx.fillStyle = '#254c61';
    ctx.fillRect(324, 18, 172, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 20px ${FONT_SANS}`;
    ctx.fillText('青汐港 潮汐表', 340, 45);

    ctx.fillStyle = '#2a3d47';
    ctx.font = `bold 16px ${FONT_SANS}`;
    const rows = [
      ['満潮', '06:42', '162cm'],
      ['干潮', '12:58', ' 38cm'],
      ['満潮', '19:15', '174cm'],
      ['日入', '18:24', '中潮']
    ];
    rows.forEach((r, idx) => {
      const y = 92 + idx * 44;
      ctx.fillStyle = r[0] === '満潮' ? '#c94a3b' : '#2a5f7a';
      ctx.fillText(r[0], 334, y);
      ctx.fillStyle = '#263842';
      ctx.fillText(r[1], 382, y);
      ctx.fillText(r[2], 438, y);
      ctx.strokeStyle = 'rgba(54,88,105,0.22)';
      ctx.beginPath(); ctx.moveTo(330, y + 14); ctx.lineTo(490, y + 14); ctx.stroke();
    });

    // Mini tide sine curve
    ctx.strokeStyle = '#3688a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 140; i += 4) {
      const x = 340 + i;
      const y = 310 - Math.sin((i / 140) * Math.PI * 2.1) * 32;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    return finishTex(c);
  }

  // 9. Maritime Safety Talisman (お守り) & Fish Catch Photo
  function createTalismanTexture() {
    const w = 128, h = 220;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c83e36';
    ctx.fillRect(0, 0, w, h);
    // Gold woven border
    ctx.strokeStyle = '#f2cc6b';
    ctx.lineWidth = 7;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    // Inner cream strip
    ctx.fillStyle = '#faf4df';
    ctx.fillRect(36, 28, w - 72, h - 56);
    ctx.fillStyle = '#252629';
    ctx.font = `bold 24px ${FONT_SERIF}`;
    ctx.textAlign = 'center';
    ['海', '上', '安', '全'].forEach((ch, i) => ctx.fillText(ch, w / 2, 66 + i * 32));
    return finishTex(c);
  }

  function createCatchPhotoTexture() {
    const w = 256, h = 192;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    // Polaroid white frame
    ctx.fillStyle = '#f9f8f3';
    ctx.fillRect(0, 0, w, h);
    // Photo sky & sea
    const g = ctx.createLinearGradient(0, 14, 0, 148);
    g.addColorStop(0, '#a6dce8');
    g.addColorStop(0.55, '#5ca8be');
    g.addColorStop(1, '#c8b396');
    ctx.fillStyle = g;
    ctx.fillRect(14, 14, w - 28, 134);
    // Big gleaming red sea bream (真鯛) silhouette on deck
    ctx.fillStyle = '#e87e6b';
    ctx.beginPath();
    ctx.ellipse(128, 92, 64, 28, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(186, 88); ctx.lineTo(216, 68); ctx.lineTo(208, 114); ctx.closePath();
    ctx.fill();
    // Silver belly sheen & eye
    ctx.fillStyle = '#f8e6df';
    ctx.beginPath();
    ctx.ellipse(124, 102, 48, 12, -0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b262c';
    ctx.beginPath(); ctx.arc(82, 86, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(81, 84, 1.8, 0, Math.PI * 2); ctx.fill();
    // Handwritten caption on frame
    ctx.fillStyle = '#2d4654';
    ctx.font = `bold 18px ${FONT_SANS}`;
    ctx.fillText('8/14 真鯛 62cm!', 52, 174);
    return finishTex(c);
  }

  // 10. Warehouse Auction Chalkboard (黑板上的拍卖价格)
  function createAuctionChalkboardTexture() {
    const w = 512, h = 340;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(606);

    // Slate green chalkboard
    ctx.fillStyle = '#243d38';
    ctx.fillRect(0, 0, w, h);
    // Chalk dust smear
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(235,244,240,0.035)';
      ctx.fillRect(rng() * w, rng() * h, 40 + rng() * 120, 12 + rng() * 35);
    }
    // Wood border
    ctx.strokeStyle = '#7e5a3c';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, w - 18, h - 18);

    // Header
    ctx.fillStyle = '#fff4c4';
    ctx.font = `bold 32px ${FONT_SANS}`;
    ctx.fillText('本日 競売相場（漁協）', 42, 62);
    ctx.strokeStyle = 'rgba(245,250,245,0.65)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(34, 78); ctx.lineTo(w - 34, 78); ctx.stroke();

    // Prices in chalk
    const items = [
      ['マアジ（小）', '  850 円 / kg', '#f4f9f7'],
      ['マサバ', '  620 円 / kg', '#f4f9f7'],
      ['真鯛（活）', '2,400 円 / kg', '#ffd6a6'],
      ['ヤリイカ', '1,150 円 / kg', '#f4f9f7'],
      ['カワハギ', '  980 円 / kg', '#c4f0e8']
    ];
    ctx.font = `bold 25px ${FONT_SANS}`;
    items.forEach(([name, price, col], i) => {
      const y = 122 + i * 40;
      ctx.fillStyle = col;
      ctx.fillText(name, 44, y);
      ctx.fillText(price, 278, y);
    });

    return finishTex(c);
  }

  // 11. Waiting Room Faded Ferry Timetable (褪色的航班时刻表)
  function createFerryTimetableTexture() {
    const w = 512, h = 384;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#edf1ec';
    ctx.fillRect(0, 0, w, h);
    // Sun-faded header band
    ctx.fillStyle = '#5c8ea6';
    ctx.fillRect(16, 16, w - 32, 62);
    ctx.fillStyle = '#f8fbfc';
    ctx.font = `bold 28px ${FONT_SANS}`;
    ctx.fillText('青汐港 定期連絡船 時刻表', 42, 56);

    // Table frame
    ctx.strokeStyle = '#6c8b99';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(20, 92, w - 40, 240);

    const rows = [
      ['第一便', '07:15 発', '→ 沖ノ島', '07:45 着'],
      ['第二便', '10:30 発', '→ 沖ノ島', '11:00 着'],
      ['第三便', '13:45 発', '→ 沖ノ島', '14:15 着'],
      ['最終便', '16:50 発', '→ 沖ノ島', '17:20 着']
    ];
    ctx.font = `bold 24px ${FONT_SANS}`;
    rows.forEach((r, idx) => {
      const y = 138 + idx * 54;
      ctx.fillStyle = idx === 3 ? '#b55c4e' : '#355361';
      ctx.fillText(r[0], 38, y);
      ctx.fillText(r[1], 140, y);
      ctx.fillStyle = '#4e6f7d';
      ctx.fillText(r[2], 266, y);
      ctx.fillText(r[3], 386, y);
      if (idx < 3) {
        ctx.strokeStyle = 'rgba(108,139,153,0.4)';
        ctx.beginPath(); ctx.moveTo(24, y + 18); ctx.lineTo(w - 24, y + 18); ctx.stroke();
      }
    });

    ctx.fillStyle = '#5b7682';
    ctx.font = `bold 18px ${FONT_SANS}`;
    ctx.fillText('片道運賃：大人 420円 ／ 小人 210円　※荒天欠航あり', 36, 360);

    // Subtle aged fade wash
    ctx.fillStyle = 'rgba(232,226,205,0.22)';
    ctx.fillRect(0, 0, w, h);

    return finishTex(c);
  }

  // 12. Faded Harbor Warning Signboard (港名 + 注意落水)
  function createHarborSignTexture() {
    const w = 512, h = 340;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(707);

    // Sun-bleached enamel white
    ctx.fillStyle = '#ecefe9';
    ctx.fillRect(0, 0, w, h);

    // Faded coastal blue border & top banner
    ctx.strokeStyle = '#3f7694';
    ctx.lineWidth = 14;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = '#417c9c';
    ctx.fillRect(20, 20, w - 40, 78);

    ctx.fillStyle = '#f6fafb';
    ctx.font = `bold 44px ${FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.fillText('青 汐 漁 港', w / 2, 74);

    // Big red-orange warning: 注意落水
    ctx.fillStyle = '#cf4d3c';
    ctx.font = `bold 68px ${FONT_SANS}`;
    ctx.fillText('注意落水', w / 2, 192);

    ctx.fillStyle = '#2d4b59';
    ctx.font = `bold 24px ${FONT_SANS}`;
    ctx.fillText('岸壁の端は滑りやすく危険です', w / 2, 248);
    ctx.font = `bold 19px ${FONT_SANS}`;
    ctx.fillStyle = '#587482';
    ctx.fillText('青汐漁業協同組合・港湾管理事務所', w / 2, 294);

    // Weathering, faded scratches & bolt corner rust
    [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]].forEach(([bx, by]) => {
      const rg = ctx.createRadialGradient(bx, by, 2, bx, by, 24);
      rg.addColorStop(0, 'rgba(148,78,44,0.72)');
      rg.addColorStop(1, 'rgba(148,78,44,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(bx, by, 24, 0, Math.PI * 2); ctx.fill();
    });
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = rng() > 0.4 ? 'rgba(235,238,232,0.32)' : 'rgba(155,95,60,0.22)';
      ctx.fillRect(rng() * w, rng() * h, 3 + rng() * 14, 2 + rng() * 6);
    }

    return finishTex(c);
  }

  // 13. Glowing Coastal Vending Machine Front Texture
  function createVendingMachineTexture() {
    const w = 256, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');

    // Retro cream-white & sea-blue vending machine chassis
    ctx.fillStyle = '#e8eff0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5394b0';
    ctx.fillRect(0, 0, w, 34);
    ctx.fillRect(0, 315, w, 197);

    // Glowing lit showcase window (y = 44..298)
    ctx.fillStyle = '#fffbe8';
    ctx.fillRect(18, 44, w - 36, 254);
    ctx.strokeStyle = '#6f8b96';
    ctx.lineWidth = 4;
    ctx.strokeRect(18, 44, w - 36, 254);

    // 3 shelves of colorful Japanese drinks
    const drinkColors = [
      ['#56b870', '#48a4d4', '#f2a43b', '#e25848', '#8ad2e8', '#3c7a52'],
      ['#f4d448', '#529cd4', '#f4f7f8', '#c85a3a', '#6cc882', '#3a6ba8'],
      ['#8a5a3c', '#d87a3c', '#f2e4b8', '#4284b4', '#e46256', '#56a874']
    ];
    for (let row = 0; row < 3; row++) {
      const shelfY = 114 + row * 82;
      // Drink cans/bottles
      for (let col = 0; col < 6; col++) {
        const dx = 28 + col * 34;
        ctx.fillStyle = drinkColors[row][col];
        ctx.fillRect(dx, shelfY - 46, 22, 42);
        // Label band
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillRect(dx + 2, shelfY - 30, 18, 12);
        // Cap
        ctx.fillStyle = '#d4dde0';
        ctx.fillRect(dx + 5, shelfY - 52, 12, 6);
      }
      // Price rail (cold blue / hot red strips)
      ctx.fillStyle = row === 2 ? '#e05848' : '#3a94c8';
      ctx.fillRect(22, shelfY, w - 44, 14);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      for (let col = 0; col < 6; col++) {
        ctx.fillText('130', 30 + col * 34, shelfY + 11);
      }
    }

    // Coin slot & digital panel
    ctx.fillStyle = '#25343d';
    ctx.fillRect(168, 338, 62, 66);
    ctx.fillStyle = '#ff8c42';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('130', 184, 360);

    // Pickup bin at bottom
    ctx.fillStyle = '#233540';
    ctx.fillRect(24, 420, 188, 66);
    ctx.strokeStyle = '#a4bec8';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 420, 188, 66);

    // Subtle seaside logo
    ctx.fillStyle = '#f4fafb';
    ctx.font = `bold 18px ${FONT_SANS}`;
    ctx.fillText('DRINK', 34, 366);

    return finishTex(c);
  }

  // 14. Corrugated Galvanized Metal (roof, roller shutter, rusty awning)
  function createCorrugatedTexture(baseHex, rustAmount, horizontal) {
    const w = 512, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(808 + Math.round((rustAmount || 0) * 100));

    ctx.fillStyle = baseHex || '#8ca6b2';
    ctx.fillRect(0, 0, w, h);

    const ribs = 28;
    for (let i = 0; i < ribs; i++) {
      if (horizontal) {
        const y = (i / ribs) * h;
        const rh = h / ribs;
        const g = ctx.createLinearGradient(0, y, 0, y + rh);
        g.addColorStop(0.0, 'rgba(255,255,255,0.22)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.0)');
        g.addColorStop(0.85, 'rgba(22,44,54,0.34)');
        g.addColorStop(1.0, 'rgba(255,255,255,0.12)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, w, rh);
      } else {
        const x = (i / ribs) * w;
        const rw = w / ribs;
        const g = ctx.createLinearGradient(x, 0, x + rw, 0);
        g.addColorStop(0.0, 'rgba(255,255,255,0.24)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        g.addColorStop(0.85, 'rgba(22,44,54,0.34)');
        g.addColorStop(1.0, 'rgba(255,255,255,0.10)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, rw, h);
      }
    }

    // Subtle rust patina
    const count = Math.floor(85 * (rustAmount || 0.25));
    for (let i = 0; i < count; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const rx = 8 + rng() * 38;
      const ry = 8 + rng() * 32;
      const g = ctx.createRadialGradient(x, y, 2, x, y, Math.max(rx, ry));
      g.addColorStop(0, 'rgba(156,78,44,0.52)');
      g.addColorStop(1, 'rgba(156,78,44,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  }

  // 15. Japanese Kawara Roof Tiles
  function createRoofTileTexture() {
    const w = 512, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4e6778';
    ctx.fillRect(0, 0, w, h);

    const rows = 10, cols = 12;
    const rw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const x = col * rw, y = r * rh;
        const g = ctx.createLinearGradient(x, y, x + rw, y);
        g.addColorStop(0, '#3a5160');
        g.addColorStop(0.4, '#6d8899');
        g.addColorStop(0.85, '#486273');
        g.addColorStop(1, '#2d414e');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, rw, rh - 3);
        // Bottom curved tile shadow
        ctx.fillStyle = 'rgba(20,35,44,0.55)';
        ctx.fillRect(x, y + rh - 5, rw, 5);
        // Wet rain rim glint
        ctx.fillStyle = 'rgba(218,242,248,0.20)';
        ctx.fillRect(x + 3, y + 2, rw * 0.45, 3);
      }
    }
    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [2, 2] });
  }

  // 16. Japanese Stone Retaining Wall (石垣)
  function createStoneWallTexture() {
    const w = 512, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(909);

    ctx.fillStyle = '#4e6361'; // mossy mortar
    ctx.fillRect(0, 0, w, h);

    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -12;
      while (x < w) {
        const sw = 46 + rng() * 44;
        const shade = Math.floor(155 + rng() * 45);
        const bTint = Math.floor(shade + 8);
        ctx.fillStyle = `rgb(${shade - 6},${shade + 2},${bTint})`;
        ctx.beginPath();
        ctx.roundRect(x + 3, r * rh + 3, sw - 6, rh - 6, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(42,60,58,0.65)';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Wet moss top smudge
        if (rng() > 0.55) {
          ctx.fillStyle = 'rgba(84,126,90,0.34)';
          ctx.fillRect(x + 6, r * rh + 4, sw - 12, 8);
        }
        x += sw;
      }
    }
    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [3, 1.2] });
  }

  // 17. Mooring Buoy with Faded Stencil Number
  function createBuoyTexture(numStr, bodyColor) {
    const w = 512, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(numStr.charCodeAt(0) * 31 + numStr.charCodeAt(1));

    ctx.fillStyle = bodyColor || '#e87846';
    ctx.fillRect(0, 0, w, h);
    // White middle stripe
    ctx.fillStyle = '#eef4f5';
    ctx.fillRect(0, 74, w, 108);
    // Dark algae waterline bottom
    ctx.fillStyle = '#3d635d';
    ctx.fillRect(0, 214, w, 42);

    // Faded stencil number twice around circumference
    ctx.fillStyle = 'rgba(38,60,72,0.82)';
    ctx.font = `bold 84px ${FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(numStr, 128, 156);
    ctx.fillText(numStr, 384, 156);

    // Salt wear & rust patches
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = rng() > 0.45 ? 'rgba(235,242,244,0.28)' : 'rgba(148,72,42,0.34)';
      ctx.fillRect(rng() * w, rng() * h, 4 + rng() * 14, 3 + rng() * 8);
    }

    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }

  // 18. Weathered Wood Planks
  function createWoodTexture(baseHex) {
    const w = 512, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(1111);

    ctx.fillStyle = baseHex || '#a88462';
    ctx.fillRect(0, 0, w, h);

    const planks = 8;
    const ph = h / planks;
    for (let p = 0; p < planks; p++) {
      const y = p * ph;
      ctx.fillStyle = (rng() > 0.5) ? 'rgba(255,248,236,0.08)' : 'rgba(42,30,22,0.10)';
      ctx.fillRect(0, y, w, ph);
      // Grain lines
      ctx.strokeStyle = 'rgba(54,38,24,0.18)';
      ctx.lineWidth = 1.5;
      for (let g = 0; g < 6; g++) {
        ctx.beginPath();
        const gy = y + 6 + rng() * (ph - 12);
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(w * 0.3, gy + (rng() - 0.5) * 8, w * 0.7, gy + (rng() - 0.5) * 8, w, gy);
        ctx.stroke();
      }
      // Plank seam
      ctx.strokeStyle = 'rgba(34,26,20,0.48)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  }

  // 19. Waiting Room Wall Clock Face (after-school afternoon 16:15)
  function createClockFaceTexture() {
    const s = 256;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    const cx = s / 2, cy = s / 2, r = s * 0.45;
    ctx.fillStyle = '#f6f3e8';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#38525e';
    ctx.lineWidth = 10;
    ctx.stroke();

    // Hour ticks
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const inner = i % 3 === 0 ? r * 0.72 : r * 0.80;
      ctx.strokeStyle = '#2c424d';
      ctx.lineWidth = i % 3 === 0 ? 5 : 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (r * 0.90), cy + Math.sin(a) * (r * 0.90));
      ctx.stroke();
    }

    // Hands: 4:18 PM (after-school sunshower!)
    ctx.strokeStyle = '#22343d';
    ctx.lineCap = 'round';
    // Hour hand
    const hAng = ((4 + 18 / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hAng) * r * 0.48, cy + Math.sin(hAng) * r * 0.48);
    ctx.stroke();
    // Minute hand
    const mAng = (18 / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(mAng) * r * 0.72, cy + Math.sin(mAng) * r * 0.72);
    ctx.stroke();
    // Red second hand
    ctx.strokeStyle = '#d44b3c';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(1.8) * r * 0.78, cy + Math.sin(1.8) * r * 0.78);
    ctx.stroke();

    ctx.fillStyle = '#22343d';
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();

    return finishTex(c);
  }

  // 20. Drying Fishing Net Alpha Mesh Texture (crisp airy see-through diamond weave!)
  function createFishingNetTexture() {
    const s = 256;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = '#2d666c';
    ctx.lineWidth = 4.0;
    const step = 36;
    for (let i = -s; i < s * 2; i += step) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + s, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - s, s); ctx.stroke();
    }
    // Knot dots
    ctx.fillStyle = '#1e4b52';
    for (let y = 0; y <= s; y += step / 2) {
      for (let x = 0; x <= s; x += step / 2) {
        if ((Math.round(x / (step / 2)) + Math.round(y / (step / 2))) % 2 === 0) {
          ctx.beginPath(); ctx.arc(x, y, 2.8, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    const tex = finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [2.2, 1.5] });
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  // 21. Seabed Gravel & Sand Texture
  function createSeabedTexture() {
    const s = 512;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    const rng = createRNG(1212);

    ctx.fillStyle = '#759e9e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 65; i++) {
      const x = rng() * s, y = rng() * s, r = 20 + rng() * 80;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, rng() > 0.5 ? 'rgba(155,196,192,0.28)' : 'rgba(54,96,104,0.28)');
      g.addColorStop(1, 'rgba(117,158,158,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 2400; i++) {
      const x = rng() * s, y = rng() * s, r = 1.2 + rng() * 3.8;
      ctx.fillStyle = rng() > 0.48 ? 'rgba(182,212,208,0.42)' : 'rgba(48,80,86,0.45)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [4, 4] });
  }

  // 22. Braided Coarse Fiber Mooring Rope Texture (粗纤维感缆绳)
  function createRopeTexture() {
    const w = 256, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d6683a';
    ctx.fillRect(0, 0, w, h);
    // Diagonal twisted braided fiber strands
    for (let i = -h; i < w + h; i += 14) {
      ctx.strokeStyle = 'rgba(92,38,18,0.48)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h * 0.65, h); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,196,148,0.34)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(i + 5, 0); ctx.lineTo(i + 5 + h * 0.65, h); ctx.stroke();
    }
    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [12, 2] });
  }

  // 23. Stratified Hillside Cutaway Earth & Coastal Sandstone Texture
  function createHillCutawayTexture() {
    const w = 512, h = 512;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = createRNG(1313);
    // Grass turf edge at top -> warm loamy topsoil -> pale coastal rock strata!
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#5a945f');
    g.addColorStop(0.10, '#6a5b4a');
    g.addColorStop(0.32, '#7d7366');
    g.addColorStop(0.65, '#687a7d');
    g.addColorStop(1.00, '#4f656e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Subtle geological strata lines & embedded pebbles
    ctx.strokeStyle = 'rgba(38,52,58,0.28)';
    ctx.lineWidth = 3;
    for (let r = 1; r <= 6; r++) {
      const y = r * (h / 7);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) {
        ctx.lineTo(x, y + Math.sin(x * 0.02 + r) * 10);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 650; i++) {
      ctx.fillStyle = rng() > 0.5 ? 'rgba(220,226,216,0.16)' : 'rgba(36,44,46,0.22)';
      ctx.beginPath();
      ctx.arc(rng() * w, 35 + rng() * (h - 45), 1.5 + rng() * 4.0, 0, Math.PI * 2);
      ctx.fill();
    }
    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }

  // 25. Mechanical Harbor Platform Scale Dial Face (0-50kg graduations & 青汐漁協 badge)
  function createScaleDialTexture() {
    const s = 256;
    const c = makeCanvas(s, s);
    const ctx = c.getContext('2d');
    const cx = s / 2, cy = s / 2, r = s * 0.46;

    ctx.fillStyle = '#faf8f0';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#385852';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#6a847e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
    ctx.stroke();

    // 50 kg graduation ticks & crisp numbers around dial
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 50; i++) {
      const ang = (i / 50) * Math.PI * 2 - Math.PI / 2;
      const major = i % 5 === 0;
      const r0 = major ? r * 0.78 : r * 0.86;
      const r1 = r * 0.94;
      ctx.strokeStyle = major ? '#22383c' : '#6c8084';
      ctx.lineWidth = major ? 3.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();

      if (i % 10 === 0) {
        ctx.fillStyle = '#22383c';
        ctx.font = `bold 20px ${FONT_SANS}`;
        ctx.fillText(String(i), cx + Math.cos(ang) * (r * 0.62), cy + Math.sin(ang) * (r * 0.62));
      }
    }
    ctx.fillStyle = '#4f8c7b';
    ctx.font = `bold 15px ${FONT_SANS}`;
    ctx.fillText('青汐漁協', cx, cy - 22);
    ctx.fillStyle = '#5a6e72';
    ctx.font = `bold 14px ${FONT_SANS}`;
    ctx.fillText('MAX 50kg', cx, cy + 32);

    // Center metal hub cap
    ctx.fillStyle = '#395256';
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.fill();

    return finishTex(c);
  }

  // 26. Seamless Anime Calico Cat Head & Body Fur Textures (zero faceted shell ridges!)
  function createCatHeadTexture() {
    const w = 512, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    // Warm creamy off-white fur base
    ctx.fillStyle = '#f8f4ec';
    ctx.fillRect(0, 0, w, h);

    // Organic warm ginger-orange calico patch sweeping across left crown & brow (u ~ 0.27..0.58, top)
    ctx.fillStyle = '#e08e44';
    ctx.beginPath();
    ctx.ellipse(215, 58, 92, 66, -0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(152, 46, 48, 36, 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Soft dark-espresso tortoiseshell calico ear/crown patch on right side (wraps across u=0/1!)
    ctx.fillStyle = '#5a4134';
    ctx.beginPath();
    ctx.ellipse(38, 52, 54, 48, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w - 22, 54, 46, 44, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Subtle rosy anime blush cheeks right under eyes (face centered at u=0.25 -> x=128)
    ctx.fillStyle = 'rgba(242, 162, 158, 0.32)';
    ctx.beginPath();
    ctx.ellipse(98, 140, 14, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(158, 140, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }

  function createCatBodyTexture() {
    const w = 512, h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8f4ec';
    ctx.fillRect(0, 0, w, h);

    // Ginger-orange calico saddle across left back & flank
    ctx.fillStyle = '#e08e44';
    ctx.beginPath();
    ctx.ellipse(295, 76, 118, 68, -0.18, 0, Math.PI * 2);
    ctx.fill();

    // Dark-espresso calico patch along upper right flank & rump (u ~ 0.72..0.98)
    ctx.fillStyle = '#5a4134';
    ctx.beginPath();
    ctx.ellipse(425, 72, 74, 54, 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(28, 68, 48, 42, -0.15, 0, Math.PI * 2);
    ctx.fill();

    return finishTex(c, { wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  }

  window.HARBOR_TEXTURES = {
    createWetConcreteTextures,
    createSeawallTexture,
    createCutawaySideTexture,
    createHazardStripeTexture,
    createBoatHullTexture,
    createRadarTexture,
    createFishfinderTexture,
    createNauticalChartTexture,
    createTalismanTexture,
    createCatchPhotoTexture,
    createAuctionChalkboardTexture,
    createFerryTimetableTexture,
    createHarborSignTexture,
    createVendingMachineTexture,
    createCorrugatedTexture,
    createRoofTileTexture,
    createStoneWallTexture,
    createBuoyTexture,
    createWoodTexture,
    createClockFaceTexture,
    createFishingNetTexture,
    createSeabedTexture,
    createRopeTexture,
    createHillCutawayTexture,
    createScaleDialTexture,
    createCatHeadTexture,
    createCatBodyTexture
  };
})();
