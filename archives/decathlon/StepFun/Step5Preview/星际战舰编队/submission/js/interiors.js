// interiors.js — hangar, bridge, engine core atrium, energy corridor
(function () {
  'use strict';
  const C = window.C, VB = window.VB;
  const P = C.PAL;

  function wallPanel(b, x0, y0, z0, x1, y1, z1, col, dark, glow, step) {
    b.box(x0, y0, z0, x1, y1, z1, col, false, 0.05);
    for (let x = x0; x <= x1; x += step) b.box(x, y0, z0, x + 1, y1, z1, dark, false, 0.03);
    if (glow) for (let x = x0 + (step >> 1); x <= x1; x += step) b.box(x, y0 + 1, z0, x, y1 - 1, z1, glow, true);
  }

  // ======================= HANGAR =======================
  function buildHangar() {
    const b = new VB.VoxelBuilder();
    const X0 = -450, X1 = -170, Y0 = -26, Y1 = 28, Z0 = -60, Z1 = 74;
    // floor + guide strips
    b.box(X0, Y0, Z0, X1, Y0 + 2, Z1, P.hullB, false, 0.05);
    for (let z = -40; z <= 60; z += 20) b.box(X0, Y0 + 3, z, X1, Y0 + 3, z + 1, P.glowDim, true);
    for (let x = X0 + 20; x < X1; x += 60) b.box(x, Y0 + 3, Z0 + 4, x + 1, Y0 + 3, Z1 - 4, P.hullD, false, 0.04);
    // ceiling + beams
    b.box(X0, Y1 - 2, Z0, X1, Y1, Z1, P.hullC, false, 0.04);
    for (let x = -400; x <= -180; x += 60) b.box(x, Y1 - 8, Z0 + 2, x + 5, Y1 - 2, Z1 - 2, P.hullB, false, 0.05);
    // port wall
    wallPanel(b, X0, Y0, Z0, X1, Y1, Z0 + 2, P.hullA, P.hullC, true, 22);
    // aft wall with far portal
    wallPanel(b, X0, Y0, Z0, X0 + 2, Y1, Z1, P.hullA, P.hullC, false, 22);
    b.carve(X0 - 4, -8, -30, X0 + 6, 18, 30);
    for (let x = X0 - 4; x <= X0 + 6; x++) for (let z = -28; z <= 28; z += 4) for (let y = -6; y <= 16; y += 4)
      b.set(x, y, z, P.glow, true);
    for (let x = X0 - 6; x <= X0 + 8; x++) { b.set(x, -10, -30, P.hullD); b.set(x, -10, 30, P.hullD); b.set(x, 20, -30, P.hullD); b.set(x, 20, 30, P.hullD); }
    // forward wall with second opening
    wallPanel(b, X1 - 2, Y0, Z0, X1, Y1, Z1, P.hullA, P.hullC, false, 22);
    b.carve(X1 - 6, -10, -14, X1 + 6, 16, 14);
    for (let x = X1 - 6; x <= X1 + 6; x++) for (let z = -12; z <= 12; z += 4) for (let y = -8; y <= 14; y += 4)
      b.set(x, y, z, P.glowDim, true);
    // berth alcoves along port wall
    const berths = [];
    for (let x = -424; x <= -200; x += 56) {
      b.carve(x, -14, Z0 - 2, x + 30, 16, Z0 + 1);
      for (let i = 0; i <= 30; i += 6) { b.set(x + i, -16, Z0 + 1, P.hullD); b.set(x + i, 18, Z0 + 1, P.hullD); }
      b.set(x, -16, Z0 + 1, P.hullD); b.set(x + 30, -16, Z0 + 1, P.hullD);
      b.set(x, 18, Z0 + 1, P.hullD); b.set(x + 30, 18, Z0 + 1, P.hullD);
      for (let i = 4; i <= 26; i += 8) b.set(x + i, 0, Z0 - 1, P.glowDim, true);
      berths.push({ pos: [x + 15, -12, Z0 - 6], yaw: -Math.PI / 2 });
    }
    // central island with berths both sides
    b.box(-440, Y0, -12, -180, 4, 12, P.hullB, false, 0.05);
    for (let x = -430; x <= -190; x += 60) {
      b.carve(x - 1, -12, -12, x + 1, 3, 12);
      for (const s of [-1, 1]) {
        for (let i = -12; i <= 12; i += 6) b.set(x, -13, i, P.hullD);
        b.set(x, 4, s * 12, P.hullD);
        b.set(x + 1, 0, s * 13, P.glowDim, true);
        berths.push({ pos: [x, -10, s * 20], yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    }
    // gantries + abstract repair arms
    for (let x = -400; x <= -180; x += 55) {
      for (const z of [-54, -18, 18, 54]) b.box(x, 4, z - 2, x + 4, 20, z + 2, P.hullB, false, 0.05);
      b.box(x, 20, -56, x + 4, 24, 56, P.hullA, false, 0.05);
      for (let z = -52; z <= 52; z += 13) b.box(x, 24, z - 1, x + 4, 25, z + 1, P.hullD, false, 0.04);
      b.box(x + 1, 25, -56, x + 3, 25, 56, P.glowDim, true);
      // repair arms
      b.box(x - 14, 10, -60, x + 2, 14, -54, P.hullB, false, 0.05);
      b.box(x - 18, 12, -58, x - 14, 13, -56, P.hullD, false, 0.04);
      b.set(x - 19, 12, -57, P.glow, true);
      b.box(x + 2, 10, 54, x + 18, 14, 60, P.hullB, false, 0.05);
      b.set(x + 19, 12, 57, P.glow, true);
    }
    // side light columns
    for (let y = -20; y <= 24; y += 11) for (let x = X0 + 10; x <= X1 - 10; x += 44) b.set(x, y, Z1 - 3, P.glowDim, true);
    const d = b.extract();
    return { mesh: VB.buildMesh(window.__gl, d), voxels: d.count, berths, bounds: { min: [X0, Y0, Z0], max: [X1, Y1, Z1] } };
  }

  // ======================= BRIDGE =======================
  function buildBridge() {
    const b = new VB.VoxelBuilder();
    const X0 = 176, X1 = 314, Y0 = -4, Y1 = 50, Z0 = -70, Z1 = 70;
    // exterior shell (layered stepped collar)
    b.shell(X0, Y0, Z0, X1, Y1, Z1, 3, P.hullA, false, 0.05, true);
    for (const s of [-1, 1]) {
      for (let x = 190; x <= 300; x++) {
        const t = Math.min(1, Math.min(x - 190, 300 - x) / 40);
        const w = Math.round(16 * C.smooth(t));
        if (w < 2) continue;
        for (let i = 0; i < w; i++) {
          const z = s * (70 + 2 + i);
          const edge = i === 0 || i === w - 1;
          for (let y = 4; y <= 44; y++)
            if (edge || y === 44 || y === 4) b.set(x, y, z, edge ? P.hullD : P.hullB, false, 0.05);
        }
        if (x % 30 === 0) for (let y = 8; y <= 40; y += 6) b.set(x, y, s * 71, P.glow, true);
      }
    }
    // dorsal fins
    for (let x = 200; x <= 290; x++) {
      const t = Math.min(1, Math.min(x - 200, 290 - x) / 30);
      const w = Math.round(14 * C.smooth(t));
      for (let z = -w; z <= w; z++) for (let y = 48; y <= 56; y++) {
        const edge = Math.abs(z) >= w - 2 || y === 56;
        if (edge) b.set(x, y, z, y === 56 ? P.hullD : P.hullB, false, 0.05);
      }
    }
    // ---- interior room
    const RX0 = 182, RX1 = 308, RY0 = 0, RY1 = 46, RZ0 = -64, RZ1 = 64;
    b.box(RX0, RY0, RZ0, RX1, RY0 + 2, RZ1, P.hullB, false, 0.05);          // deck
    for (let z = -56; z <= 56; z += 14) b.box(RX0, RY0 + 3, z, RX1, RY0 + 3, z + 1, P.glowDim, true);
    wallPanel(b, RX0, RY0, RZ0, RX1, RY1, RZ0 + 2, P.hullA, P.hullC, true, 24);   // port wall
    wallPanel(b, RX0, RY0, RZ1 - 2, RX1, RY1, RZ1, P.hullA, P.hullC, true, 24);   // stbd wall
    wallPanel(b, RX0, RY0, RZ0, RX0 + 2, RY1, RZ1, P.hullA, P.hullC, false, 24);  // back wall
    wallPanel(b, RX1 - 2, RY0, RZ0, RX1, RY1, RZ1, P.hullA, P.hullC, false, 24);  // front wall (window carved in hull)
    b.box(RX0, RY1 - 2, RZ0, RX1, RY1, RZ1, P.hullC, false, 0.04);                // ceiling
    for (let z = -60; z <= 60; z += 20) b.box(RX0 + 6, RY1 - 8, z - 1, RX1 - 6, RY1 - 2, z + 1, P.hullB, false, 0.05);
    // central command hub
    for (let i = 0; i < 4; i++) {
      const w = 34 - i * 7, y = 2 + i * 5;
      b.box(196 - i * 3, y, -w, 232 + i * 2, y + 2, w, i === 3 ? P.hullD : P.hullB, false, 0.05);
      b.box(196 - i * 3, y + 2, -w, 232 + i * 2, y + 3, w, P.glowDim, true);
    }
    for (let i = 0; i < 3; i++) b.box(206 + i * 4, 22 + i * 4, -16 + i * 2, 222 + i * 2, 22 + i * 4 + 2, 16 - i * 2, P.hullD, false, 0.04);
    // consoles along both sides at 3 levels
    const consoles = [];
    for (const s of [-1, 1]) {
      for (const lv of [0, 1, 2]) {
        const y = 4 + lv * 14;
        const z = s * (52 - lv * 4);
        b.box(190, y - 6, z - 6, 300, y, z + 6, P.hullB, false, 0.05);
        for (let x = 196; x <= 296; x += 26) {
          b.box(x, y, z - 7, x + 16, y + 3, z + 7, P.hullA, false, 0.05);
          b.box(x + 2, y + 3, z - 5, x + 14, y + 4, z + 5, P.glow, true);
          consoles.push({ pos: [x + 8, y + 5, z] });
          for (let k = 0; k < 3; k++) b.set(x + 4 + k * 5, y + 5, z + s * 8, P.glowDim, true);
        }
        b.box(190, y - 6, z - 7, 300, y - 5, z + 7, P.glowDim, true);
      }
    }
    // hanging display panels
    for (let x = 200; x <= 296; x += 24) {
      for (const s of [-1, 1]) {
        b.box(x, 34, s * 40 - 1, x + 16, 42, s * 40 + 1, P.hullB, false, 0.05);
        b.box(x + 2, 34, s * 40 - 1, x + 14, 42, s * 40 + 1, P.glowDim, true);
        b.box(x + 7, 42, s * 40 - 1, x + 9, 45, s * 40 + 1, P.hullD, false, 0.04);
      }
    }
    const d = b.extract();
    return {
      mesh: VB.buildMesh(window.__gl, d), voxels: d.count, consoles,
      holo: [214, 40, 0], bounds: { min: [X0, Y0, Z0], max: [X1, Y1, Z1] }
    };
  }

  // ======================= ENGINE CORE ATRIUM =======================
  function buildCore() {
    const b = new VB.VoxelBuilder();
    const CX = -20, CZ = 0;
    // floor
    b.box(-150, -120, -120, 120, -118, 120, P.hullC, false, 0.04);
    for (let z = -100; z <= 100; z += 25) b.box(-148, -117, z, 118, -117, z + 2, P.glowDim, true);
    // corner pylons (stepped)
    for (const px of [-142, 104]) for (const pz of [-112, 112]) {
      for (let i = 0; i < 3; i++) {
        const y0 = -104 + i * 74, w = 40 - i * 6;
        b.shell(px - w / 2, y0, pz - w / 2, px + w / 2, y0 + 60, pz + w / 2, 3, i % 2 ? P.hullA : P.hullA2, false, 0.05, true);
        b.box(px - w / 2 + 2, y0 + 58, pz - w / 2 + 2, px + w / 2 - 2, y0 + 60, pz + w / 2 - 2, P.hullD, false, 0.04);
      }
      for (let y = -96; y <= 96; y += 24) b.set(px, y, pz, P.glow, true);
    }
    // side walls (lattice plates with vertical slots)
    for (const s of [-1, 1]) {
      for (const xr of [[-136, -36], [-24, 116]]) {
        for (let x = xr[0]; x <= xr[1]; x++) {
          for (let y = -96; y <= 96; y++) {
            const slot = ((y + 96) % 26) < 9;
            if (!slot) {
              b.set(x, y, s * 118, P.hullB, false, 0.05);
              b.set(x, y, s * 116, P.hullA, false, 0.04);
            } else if ((y + 96) % 26 === 0) b.set(x, y, s * 117, P.glowDim, true);
          }
        }
        for (let y = -96; y <= 96; y += 26) b.box(xr[0], y, s * 118, xr[1], y + 2, s * 118, P.hullD, false, 0.04);
      }
    }
    // top and bottom plates
    for (const sy of [-1, 1]) {
      for (const xr of [[-136, -36], [-24, 116]]) {
        for (let x = xr[0]; x <= xr[1]; x++) for (let z = -112; z <= 112; z++) {
          const slot = ((z + 112) % 28) < 10;
          if (!slot) { b.set(x, sy * 118, z, P.hullB, false, 0.05); b.set(x, sy * 116, z, P.hullA, false, 0.04); }
        }
        for (let z = -112; z <= 112; z += 28) b.box(xr[0], sy * 118, z, xr[1], sy * 118, z + 2, P.hullD, false, 0.04);
      }
    }
    // platforms (5 levels)
    for (let i = 0; i < 5; i++) {
      const y = -78 + i * 40;
      const inner = 46 - i * 3;
      for (let x = -140; x <= 120; x++) {
        for (let z = -116; z <= 116; z++) {
          const dx = x - CX, dz = z - CZ;
          const r = Math.sqrt(dx * dx + dz * dz);
          if (r > inner && r < inner + 30) {
            const ring = r > inner + 27;
            b.set(x, y, z, ring ? P.hullD : P.hullB, false, 0.05);
            if (!ring && (Math.round(r) % 8 === 0)) b.set(x, y + 1, z, P.glowDim, true);
          }
        }
      }
      // railings
      for (let a = 0; a < 64; a++) {
        const th = a / 64 * Math.PI * 2;
        for (const rr of [inner + 2, inner + 28]) {
          const x = Math.round(CX + Math.cos(th) * rr), z = Math.round(CZ + Math.sin(th) * rr);
          if (x < -140 || x > 120 || Math.abs(z) > 116) continue;
          b.set(x, y + 4, z, P.hullD, false, 0.04);
          if (a % 8 === 0) b.set(x, y + 5, z, P.glowDim, true);
        }
      }
      // support ribs under platform
      for (let a = 0; a < 8; a++) {
        const th = a / 8 * Math.PI * 2 + 0.2;
        for (let r = inner + 4; r < inner + 26; r += 6) {
          const x = Math.round(CX + Math.cos(th) * r), z = Math.round(CZ + Math.sin(th) * r);
          for (let k = 1; k <= 6; k++) b.set(x, y - k, z, P.hullB, false, 0.04);
        }
      }
    }
    // supports from pylons to core
    for (const px of [-142, 104]) for (const pz of [-112, 112]) {
      for (const yy of [-60, 20, 80]) {
        const steps = 14;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = C.lerp(px, CX, t), z = C.lerp(pz, CZ, t), y = yy + Math.sin(t * Math.PI) * 26;
          for (let dx = -5; dx <= 5; dx += 5) for (let dz = -5; dz <= 5; dz += 5)
            b.set(Math.round(x) + dx, Math.round(y), Math.round(z) + dz, P.hullB, false, 0.05);
        }
      }
    }
    // core column
    for (let y = -104; y <= 104; y++) {
      const t = (y + 104) / 208;
      const w = 26 + Math.sin(t * Math.PI) * 8;
      for (let x = -w; x <= w; x += 1) for (let z = -w; z <= w; z += 1) {
        const r = Math.max(Math.abs(x), Math.abs(z));
        if (r <= w) {
          if (r > w - 4) b.set(CX + Math.round(x), y, CZ + Math.round(z), P.hullB, false, 0.05);
          else if (r > w - 8) b.set(CX + Math.round(x), y, CZ + Math.round(z), P.hullC, false, 0.04);
          else if (Math.abs(x) < 7 && Math.abs(z) < 7) b.set(CX + Math.round(x), y, CZ + Math.round(z), P.glow, true);
          else if (Math.abs(x) < 10 || Math.abs(z) < 10) b.set(CX + Math.round(x), y, CZ + Math.round(z), P.glowDim, true);
        }
      }
    }
    // rings (rotating, separate meshes)
    const rings = [];
    const rdefs = [[-70, 58, 0], [-20, 72, 1], [30, 64, 2], [76, 50, 0]];
    for (const rd of rdefs) {
      const rb = new VB.VoxelBuilder();
      const R = rd[1], seg = 10;
      for (let a = 0; a < 48; a++) {
        const th = a / 48 * Math.PI * 2;
        const gap = (a % 6) < 1;
        for (let k = -seg; k <= seg; k++) {
          if (gap && k > -3 && k < 3) continue;
          const rr = R + k * 0.5;
          const x = Math.round(Math.cos(th) * rr), z = Math.round(Math.sin(th) * rr);
          const c = (k === seg || k === -seg) ? P.hullD : (k === 0 ? P.hullA : P.hullB);
          rb.set(x, 0, z, c, false, 0.05);
          if (k === 0 && a % 4 === 0) rb.set(x, 0, z, P.glow, true);
        }
      }
      const mesh = VB.buildMesh(window.__gl, rb.extract());
      rings.push({ mesh, y: rd[0], R: rd[1], speed: (rd[2] % 2 ? 1 : -1) * (0.10 + rd[2] * 0.03), tilt: rd[2] * 0.06 });
    }
    const d = b.extract();
    return {
      mesh: VB.buildMesh(window.__gl, d), voxels: d.count, rings,
      corePos: [CX, 0, CZ], bounds: { min: [-150, -120, -120], max: [120, 120, 120] }
    };
  }

  // ======================= ENERGY CORRIDOR =======================
  function buildCorridor() {
    const b = new VB.VoxelBuilder();
    const X0 = 138, X1 = 492, Y0 = -84, Y1 = -6, Z0 = -104, Z1 = 0;
    // shell
    b.shell(X0, Y0, Z0, X1, Y1, Z1, 3, P.hullA, false, 0.05, true);
    for (let x = 150; x <= 480; x += 30) {
      for (const s of [-1, 1]) for (let y = Y0 + 6; y <= Y1 - 6; y += 12) b.set(x, y, s === -1 ? Z0 - 1 : Z1 + 1, P.glow, true);
    }
    // floor with guide light
    b.box(X0 + 2, Y0 + 2, Z0 + 2, X1 - 2, Y0 + 4, Z1 - 2, P.hullB, false, 0.05);
    for (let z = -92; z <= -8; z += 21) b.box(X0 + 4, Y0 + 5, z, X1 - 4, Y0 + 5, z + 1, P.glowDim, true);
    // devices along both sides
    const devices = [];
    for (const s of [-1, 1]) {
      const zc = s === -1 ? -88 : -16;
      for (let x = 168; x <= 460; x += 58) {
        const w = 22;
        b.shell(x - 18, Y0 + 4, zc - w / 2, x + 18, Y0 + 58, zc + w / 2, 3, P.hullA, false, 0.05, true);
        b.box(x - 14, Y0 + 8, zc - 7, x + 14, Y0 + 54, zc + 7, P.hullC, false, 0.04);
        for (let y = Y0 + 12; y <= Y0 + 50; y += 12) {
          b.box(x - 14, y, zc - 7, x + 14, y + 2, zc + 7, P.hullD, false, 0.04);
          b.box(x - 12, y + 3, zc - 5, x + 12, y + 4, zc + 5, P.glow, true);
        }
        b.box(x - 6, Y0 + 6, zc - 4, x + 6, Y0 + 56, zc + 4, P.glowDim, true);
        b.box(x - 20, Y0 + 58, zc - 12, x + 20, Y0 + 62, zc + 12, P.hullD, false, 0.05);
        devices.push({ x, z: zc, y: Y0 + 30 });
      }
    }
    // portal frames across the corridor
    for (let x = 210; x <= 460; x += 62) {
      for (let y = Y0 + 2; y <= Y1 - 2; y += 1) {
        b.box(x, y, Z0 + 2, x + 7, y, Z1 - 2, P.hullB, false, 0.05);
      }
      for (let y = Y0 + 4; y <= Y1 - 4; y += 10) b.box(x + 2, y, Z0 + 3, x + 5, y + 1, Z1 - 3, P.glowDim, true);
      for (const z of [Z0 + 3, Z1 - 3]) b.box(x, Y0 + 3, z, x + 7, Y1 - 3, z, P.hullD, false, 0.04);
      b.box(x - 2, Y0 + 2, Z0 + 2, x - 1, Y1 - 2, Z1 - 2, P.hullA, false, 0.04);
    }
    // far glowing cavity
    b.carve(X1 - 26, Y0 + 4, Z0 + 6, X1 + 8, Y1 - 4, Z1 - 6);
    for (let x = X1 - 24; x <= X1 + 8; x++) for (let z = Z0 + 8; z <= Z1 - 8; z += 5) for (let y = Y0 + 8; y <= Y1 - 8; y += 5)
      b.set(x, y, z, P.glow, true);
    for (let x = X1 - 28; x <= X1 + 10; x++) { b.set(x, Y0 + 6, Z0 + 6, P.hullD); b.set(x, Y0 + 6, Z1 - 6, P.hullD); b.set(x, Y1 - 6, Z0 + 6, P.hullD); b.set(x, Y1 - 6, Z1 - 6, P.hullD); }
    // entrance from the hull (opening at the forward end top)
    b.carve(X0 - 8, Y1 - 6, Z0 + 20, X0 + 10, Y1 + 6, Z1 - 20);
    for (let z = Z0 + 22; z <= Z1 - 22; z += 6) for (let y = Y1 - 5; y <= Y1 + 5; y += 3) b.set(X0 + 2, y, z, P.glowDim, true);
    const d = b.extract();
    return { mesh: VB.buildMesh(window.__gl, d), voxels: d.count, devices, endGlow: [X1 - 10, (Y0 + Y1) / 2, (Z0 + Z1) / 2], bounds: { min: [X0, Y0, Z0], max: [X1, Y1, Z1] } };
  }

  window.Interiors = { buildHangar, buildBridge, buildCore, buildCorridor };
})();
