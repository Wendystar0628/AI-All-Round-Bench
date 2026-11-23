import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}

function toTex(canvas, repeatX = 1, repeatY = 1, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures() {
  // 1. High-Speed Link Deck (Albedo + Bump)
  const linkA = makeCanvas(256, 256);
  const linkB = makeCanvas(256, 256);
  {
    const { ctx } = linkA;
    const bctx = linkB.ctx;
    ctx.fillStyle = '#0d1c2e';
    ctx.fillRect(0, 0, 256, 256);
    bctx.fillStyle = '#606060';
    bctx.fillRect(0, 0, 256, 256);

    // Subtle micro-grid fiber weave
    ctx.strokeStyle = 'rgba(42, 118, 168, 0.24)';
    ctx.lineWidth = 1;
    bctx.strokeStyle = '#383838';
    bctx.lineWidth = 1;
    for (let i = 0; i <= 256; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();

      bctx.beginPath();
      bctx.moveTo(i, 0);
      bctx.lineTo(i, 256);
      bctx.stroke();
      bctx.beginPath();
      bctx.moveTo(0, i);
      bctx.lineTo(256, i);
      bctx.stroke();
    }

    // Recessed center fiber channel
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#122840');
    grad.addColorStop(0.5, '#0b1828');
    grad.addColorStop(1, '#122840');
    ctx.fillStyle = grad;
    ctx.fillRect(18, 18, 220, 220);
    bctx.fillStyle = '#4a4a4a';
    bctx.fillRect(18, 18, 220, 220);

    // Raised metallic bevel frame
    ctx.strokeStyle = '#2e6187';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, 240, 240);
    bctx.strokeStyle = '#d8d8d8';
    bctx.lineWidth = 6;
    bctx.strokeRect(8, 8, 240, 240);

    // Inner glowing cyan fiber rails
    ctx.strokeStyle = 'rgba(45, 208, 255, 0.58)';
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, 212, 212);

    // Micro circuit traces
    ctx.strokeStyle = 'rgba(65, 195, 255, 0.3)';
    ctx.lineWidth = 2;
    bctx.strokeStyle = '#909090';
    bctx.lineWidth = 3;
    for (const c of [ctx, bctx]) {
      c.beginPath();
      c.moveTo(64, 24);
      c.lineTo(64, 96);
      c.lineTo(96, 128);
      c.lineTo(96, 232);
      c.moveTo(192, 24);
      c.lineTo(192, 160);
      c.lineTo(160, 192);
      c.lineTo(160, 232);
      c.stroke();
    }

    // Corner node bolts
    ctx.fillStyle = '#4ba6cf';
    bctx.fillStyle = '#ffffff';
    for (const [bx, by] of [[14, 14], [242, 14], [14, 242], [242, 242]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
      bctx.beginPath();
      bctx.arc(bx, by, 4, 0, Math.PI * 2);
      bctx.fill();
    }
  }

  // 2. Legacy Link Deck (Warm Amber/Copper Industrial Protocol Grate + Bump)
  const legacyA = makeCanvas(256, 256);
  const legacyB = makeCanvas(256, 256);
  {
    const { ctx } = legacyA;
    const bctx = legacyB.ctx;
    ctx.fillStyle = '#271a0e';
    ctx.fillRect(0, 0, 256, 256);
    bctx.fillStyle = '#303030';
    bctx.fillRect(0, 0, 256, 256);

    ctx.save();
    ctx.beginPath();
    ctx.rect(8, 8, 240, 240);
    ctx.clip();
    ctx.strokeStyle = 'rgba(218, 138, 38, 0.3)';
    ctx.lineWidth = 14;
    for (let i = -256; i < 512; i += 36) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(30, 19, 10, 0.84)';
    ctx.fillRect(28, 28, 200, 200);

    // Parallel raised braided legacy copper bus bars
    for (let x = 52; x <= 204; x += 38) {
      const g = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
      g.addColorStop(0, '#6e4214');
      g.addColorStop(0.5, '#f0a63a');
      g.addColorStop(1, '#5c3510');
      ctx.fillStyle = g;
      ctx.fillRect(x - 5, 30, 10, 196);

      bctx.fillStyle = '#d0d0d0';
      bctx.fillRect(x - 6, 30, 12, 196);
    }

    // Horizontal raised steel cross-clamps
    ctx.fillStyle = '#523e2b';
    ctx.fillRect(28, 72, 200, 12);
    ctx.fillRect(28, 172, 200, 12);
    bctx.fillStyle = '#ffffff';
    bctx.fillRect(28, 72, 200, 12);
    bctx.fillRect(28, 172, 200, 12);

    ctx.strokeStyle = '#e89b32';
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, 244, 244);
    bctx.strokeStyle = '#e0e0e0';
    bctx.lineWidth = 8;
    bctx.strokeRect(6, 6, 244, 244);

    ctx.fillStyle = '#ffc363';
    for (const [bx, by] of [[18, 18], [238, 18], [18, 238], [238, 238]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 3. Elevated Device Platform Texture (Brushed Ceramic Titanium Plinth + Bump)
  const platA = makeCanvas(256, 256);
  const platB = makeCanvas(256, 256);
  {
    const { ctx } = platA;
    const bctx = platB.ctx;
    const bg = ctx.createRadialGradient(128, 128, 16, 128, 128, 160);
    bg.addColorStop(0, '#2a4864');
    bg.addColorStop(0.65, '#1e354b');
    bg.addColorStop(1, '#152536');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 256);

    bctx.fillStyle = '#909090';
    bctx.fillRect(0, 0, 256, 256);

    // Brushed metallic horizontal micro-lines
    ctx.strokeStyle = 'rgba(180, 225, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let y = 0; y < 256; y += 3) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }

    // Chamfered outer raised frame
    ctx.strokeStyle = '#6ab2d6';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 236, 236);
    bctx.strokeStyle = '#e8e8e8';
    bctx.lineWidth = 8;
    bctx.strokeRect(10, 10, 236, 236);

    // Bright cyan mounting corner brackets
    ctx.strokeStyle = '#5ee8ff';
    ctx.lineWidth = 5;
    bctx.strokeStyle = '#ffffff';
    bctx.lineWidth = 6;
    const bLen = 28;
    const drawCorner = (c, x, y, dx, dy) => {
      c.beginPath();
      c.moveTo(x + dx * bLen, y);
      c.lineTo(x, y);
      c.lineTo(x, y + dy * bLen);
      c.stroke();
    };
    for (const c of [ctx, bctx]) {
      drawCorner(c, 22, 22, 1, 1);
      drawCorner(c, 234, 22, -1, 1);
      drawCorner(c, 22, 234, 1, -1);
      drawCorner(c, 234, 234, -1, -1);
    }

    // Recessed circular hardware socket ring
    ctx.strokeStyle = 'rgba(105, 225, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(128, 128, 66, 0, Math.PI * 2);
    ctx.stroke();
    bctx.strokeStyle = '#303030';
    bctx.lineWidth = 6;
    bctx.beginPath();
    bctx.arc(128, 128, 66, 0, Math.PI * 2);
    bctx.stroke();

    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = 'rgba(130, 235, 255, 0.36)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(128, 128, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(110, 230, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(114, 128);
    ctx.lineTo(142, 128);
    ctx.moveTo(128, 114);
    ctx.lineTo(128, 142);
    ctx.stroke();
  }

  // 4. Server Rack Face Texture (Map 1 Obstacles & Distant Clusters + Bump)
  const rackA = makeCanvas(256, 512);
  const rackB = makeCanvas(256, 512);
  {
    const { ctx } = rackA;
    const bctx = rackB.ctx;
    ctx.fillStyle = '#0c1624';
    ctx.fillRect(0, 0, 256, 512);
    bctx.fillStyle = '#404040';
    bctx.fillRect(0, 0, 256, 512);

    // Raised steel side rails
    ctx.fillStyle = '#1b2f45';
    ctx.fillRect(0, 0, 18, 512);
    ctx.fillRect(238, 0, 18, 512);
    bctx.fillStyle = '#e0e0e0';
    bctx.fillRect(0, 0, 18, 512);
    bctx.fillRect(238, 0, 18, 512);

    // 14 Server blade bays
    for (let i = 0; i < 14; i++) {
      const y = 12 + i * 35;
      ctx.fillStyle = '#132234';
      ctx.fillRect(24, y, 208, 28);
      ctx.strokeStyle = '#294a6b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(24, y, 208, 28);

      bctx.fillStyle = '#a0a0a0';
      bctx.fillRect(24, y, 208, 28);

      // Recessed vent louvers
      ctx.fillStyle = '#08101a';
      bctx.fillStyle = '#202020';
      for (let vx = 34; vx < 148; vx += 10) {
        ctx.fillRect(vx, y + 7, 5, 14);
        bctx.fillRect(vx, y + 7, 5, 14);
      }

      // Illuminated telemetry LEDs
      const ledColors = ['#29e6ff', '#2bf5a0', '#29e6ff', '#ffb830'];
      for (let l = 0; l < 4; l++) {
        const on = ((i * 7 + l * 3) % 5) !== 0;
        ctx.fillStyle = on ? ledColors[(i + l) % ledColors.length] : '#1c3147';
        ctx.fillRect(162 + l * 16, y + 10, 9, 8);
      }
    }
  }

  // 5. Industrial Switchgear / Hazard Trim Texture (Map 3 + Bump)
  const hazardA = makeCanvas(256, 256);
  const hazardB = makeCanvas(256, 256);
  {
    const { ctx } = hazardA;
    const bctx = hazardB.ctx;
    ctx.fillStyle = '#151f21';
    ctx.fillRect(0, 0, 256, 256);
    bctx.fillStyle = '#707070';
    bctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#d9911e';
    ctx.lineWidth = 18;
    for (let i = -256; i < 512; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(14, 24, 26, 0.78)';
    ctx.fillRect(0, 38, 256, 180);
    ctx.strokeStyle = '#2de0a8';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 48, 232, 160);

    // Raised industrial cabinet door seam & gauges
    bctx.fillStyle = '#b0b0b0';
    bctx.fillRect(14, 50, 228, 156);
    bctx.fillStyle = '#252525';
    bctx.fillRect(126, 52, 4, 152);
    ctx.fillStyle = '#0c1618';
    ctx.fillRect(32, 72, 82, 44);
    ctx.fillStyle = '#2df5a8';
    ctx.fillRect(42, 88, 36, 10);
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(84, 88, 18, 10);
  }

  // 6. Public Internet Torrent Texture (Scrolling plasma stream for Map 2)
  const torrentA = makeCanvas(512, 256);
  {
    const { ctx } = torrentA;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#041226');
    g.addColorStop(0.5, '#0b345c');
    g.addColorStop(1, '#041226');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);

    for (let i = 0; i < 48; i++) {
      const y = (i * 29) % 244 + 6;
      const x = (i * 83) % 440;
      const len = 45 + (i * 37) % 130;
      const col = i % 3 === 0 ? '#3bf2ff' : i % 3 === 1 ? '#68a4ff' : '#d25eff';
      const sg = ctx.createLinearGradient(x, 0, x + len, 0);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(0.5, col);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x, y, len, i % 4 === 0 ? 4 : 2);
    }
  }

  // 7. Deep Protocol Layer Wireframe Grid Texture
  const protoA = makeCanvas(512, 512);
  {
    const { ctx } = protoA;
    ctx.clearRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(46, 184, 245, 0.34)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(80, 232, 255, 0.14)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 512; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(95, 240, 255, 0.55)';
    for (let x = 0; x <= 512; x += 64) {
      for (let y = 0; y <= 512; y += 64) {
        ctx.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  }

  // 8. Soft Radial Glow Particle Sprite
  const glowA = makeCanvas(128, 128);
  {
    const { ctx } = glowA;
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(180,245,255,0.75)');
    g.addColorStop(0.65, 'rgba(60,180,255,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }

  return {
    linkMap: toTex(linkA.canvas, 1, 1),
    linkBump: toTex(linkB.canvas, 1, 1, false),
    legacyMap: toTex(legacyA.canvas, 1, 1),
    legacyBump: toTex(legacyB.canvas, 1, 1, false),
    platformMap: toTex(platA.canvas, 1, 1),
    platformBump: toTex(platB.canvas, 1, 1, false),
    rackMap: toTex(rackA.canvas, 1, 1),
    rackBump: toTex(rackB.canvas, 1, 1, false),
    hazardMap: toTex(hazardA.canvas, 1, 1),
    hazardBump: toTex(hazardB.canvas, 1, 1, false),
    torrentMap: toTex(torrentA.canvas, 4, 1),
    protocolMap: toTex(protoA.canvas, 12, 12),
    glowMap: toTex(glowA.canvas, 1, 1),
  };
}
