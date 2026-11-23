/* 星际战舰编队 — interior spaces
 * Four self-contained rooms built on the same voxel grid as the hulls.
 * Walls face inward so the camera can occupy the room without the exterior
 * shell interfering.  All of them read as one architecture: stepped plates,
 * dark recesses, bright conduit lines.
 */
(function (global) {
  'use strict';
  const F = global.FLEET = global.FLEET || {};
  const Core = F.Core, V = F.Vox, P = F.Palette;
  const VM = V.VoxMesh, VG = V.VoxGrid;

  /* inward facing box (a room shell) */
  function room(mesh, x0, y0, z0, x1, y1, z1, m, opts) {
    const o = opts || {};
    const skip = o.skip || {};
    const tile = o.tile || 0;
    const put = (p0, p1, p2, p3, mat) => {
      if (!tile) { mesh.quad(p0, p1, p2, p3, mat, {}); return; }
      /* split the wall into plates so it never reads as one flat sheet */
      const L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const e1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const e2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
      const nu = Math.max(1, Math.round(e1 / tile)), nv = Math.max(1, Math.round(e2 / tile));
      for (let i = 0; i < nu; i++) {
        for (let j = 0; j < nv; j++) {
          const u0 = i / nu, u1 = (i + 1) / nu, v0 = j / nv, v1 = (j + 1) / nv;
          const a0 = L(p0, p1, u0), a1 = L(p0, p1, u1);
          const b0 = L(p3, p2, u0), b1 = L(p3, p2, u1);
          mesh.quad(L(a0, b0, v0), L(a1, b1, v0), L(a1, b1, v1), L(a0, b0, v1),
            panelMat(mat, i, j, o), {});
        }
      }
    };
    if (!skip.floor) put([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], o.floorMat || m);
    if (!skip.ceil) put([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], o.ceilMat || m);
    if (!skip.left) put([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], o.leftMat || m);
    if (!skip.right) put([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], o.rightMat || m);
    if (!skip.back) put([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], o.backMat || m);
    if (!skip.front) put([x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [x1, y0, z1], o.frontMat || m);
    return mesh;
  }

  /* plate variation for the panelled walls */
  function panelMat(base, i, j, o) {
    if (!o || !o.alt) return base;
    const h = Core.hash2(i * 7 + j * 13 + (o.salt || 0), i * 3 + j * 5);
    if (h > 0.88) return o.alt;
    if (h > 0.74) return o.alt2 || o.alt;
    return base;
  }
  /* solid outward block (furniture) */
  function block(mesh, x0, y0, z0, x1, y1, z1, m) { mesh.box(x0, y0, z0, x1, y1, z1, m); return mesh; }

  /* glowing line running along an axis */
  function strip(mesh, x0, y0, z0, x1, y1, z1, m) { mesh.box(x0, y0, z0, x1, y1, z1, m); return mesh; }

  /* ================================================================== */
  /* 1. BRIDGE — 130 wide x 130 deep x 60 tall command hall             */
  /* ================================================================== */
  function buildBridge() {
    const mesh = new VM('bridge');
    const X0 = -65, X1 = 65, Y0 = 104, Y1 = 164, Z0 = 215, Z1 = 345;
    const meta = { hub: [0, 128, 278], hologram: [0, 152, 272], window: [0, 134, 345] };

    // floor / ceiling / walls
    room(mesh, X0, Y0, Z0, X1, Y1, Z1, P.inner, {
      floorMat: P.hullDark, ceilMat: P.hullDark,
      leftMat: P.hullMid, rightMat: P.hullMid, backMat: P.hullMid,
      skip: { front: true }, tile: 16, alt: P.hullMidHi, alt2: P.deep, salt: 1,
    });
    // forward window frame: the opening is wide and low
    block(mesh, X0, Y0, Z1 - 4, X0 + 14, Y1, Z1, P.hullMid);
    block(mesh, X1 - 14, Y0, Z1 - 4, X1, Y1, Z1, P.hullMid);
    block(mesh, X0, Y1 - 16, Z1 - 4, X1, Y1, Z1, P.hullMid);
    block(mesh, X0, Y0, Z1 - 4, X1, Y0 + 10, Z1, P.hullMid);
    // window mullions
    for (let i = 1; i < 4; i++) {
      const x = X0 + (X1 - X0) * i / 4;
      block(mesh, x - 3, Y0 + 10, Z1 - 6, x + 3, Y1 - 16, Z1 - 2, P.trim);
    }
    // window sill light
    strip(mesh, X0 + 14, Y0 + 10, Z1 - 7, X1 - 14, Y0 + 13, Z1 - 3, P.glowSoft);

    // stepped command hub
    block(mesh, -26, Y0, 246, 26, Y0 + 8, 312, P.hullDark);
    block(mesh, -20, Y0 + 8, 250, 20, Y0 + 14, 308, P.hullMid);
    block(mesh, -14, Y0 + 14, 254, 14, Y0 + 19, 304, P.console);
    block(mesh, -12, Y0 + 19, 258, 12, Y0 + 22, 300, P.screen);
    block(mesh, -30, Y0 + 22, 250, -18, Y0 + 34, 270, P.hullMidHi);
    block(mesh, 18, Y0 + 22, 250, 30, Y0 + 34, 270, P.hullMidHi);
    block(mesh, -30, Y0 + 22, 288, -18, Y0 + 34, 308, P.hullMidHi);
    block(mesh, 18, Y0 + 22, 288, 30, Y0 + 34, 308, P.hullMidHi);
    // hub column
    block(mesh, -5, Y0 + 22, 272, 5, Y1 - 26, 282, P.hullMid);
    block(mesh, -3, Y0 + 26, 274, 3, Y0 + 34, 280, P.glow);

    // suspended display structures over the hub
    for (let i = 0; i < 4; i++) {
      const z = 244 + i * 22;
      const w = 30 - i * 4;
      block(mesh, -w, Y1 - 22, z - 5, w, Y1 - 16, z + 5, P.hullMid);
      block(mesh, -w + 4, Y1 - 26, z - 4, w - 4, Y1 - 22, z + 4, P.deep);
      // a cluster of small read-outs rather than one flat panel
      for (let k = 0; k < 3; k++) {
        const pw = (w - 10) / 3 - 1;
        const px = -w + 6 + k * (pw + 2);
        block(mesh, px, Y1 - 27, z - 3, px + pw, Y1 - 25, z + 3, (i + k) % 2 ? P.screen : P.screenWarm);
        block(mesh, px - 1, Y1 - 28, z - 4, px + pw + 1, Y1 - 27, z + 4, P.hullDark);
      }
      // hangers
      block(mesh, -w + 2, Y1 - 16, z - 1, -w + 4, Y1, z + 1, P.trim);
      block(mesh, w - 4, Y1 - 16, z - 1, w - 2, Y1, z + 1, P.trim);
    }

    // side platform tiers with console rows
    for (let side = -1; side <= 1; side += 2) {
      for (let tier = 0; tier < 2; tier++) {
        const px = side < 0 ? X0 + 2 : X1 - 26;
        const py = Y0 + tier * 26;
        block(mesh, px, py, 222, px + 24, py + 5, 340, tier ? P.hullMid : P.hullDark);
        // console rows
        for (let r = 0; r < 5; r++) {
          const z = 228 + r * 24;
          block(mesh, px + (side < 0 ? 4 : 4), py + 5, z, px + (side < 0 ? 20 : 20), py + 9, z + 10, P.console);
          block(mesh, px + 6, py + 9, z + 1, px + 18, py + 10, z + 9, P.screen);
        }
        // rail
        block(mesh, px + (side < 0 ? 22 : 0), py + 5, 224, px + (side < 0 ? 24 : 2), py + 13, 338, P.trim);
      }
    }

    // ceiling ribs spanning the hall
    for (let i = 0; i < 5; i++) {
      const z = 226 + i * 26;
      block(mesh, X0 + 2, Y1 - 7, z, X1 - 2, Y1 - 2, z + 6, P.hullMid);
      block(mesh, X0 + 2, Y1 - 9, z + 2, X1 - 2, Y1 - 7, z + 4, P.deep);
      block(mesh, -8, Y1 - 9, z + 2, 8, Y1 - 7, z + 4, P.glowDeep);
    }
    // rear bulkhead + doorway
    block(mesh, X0 + 10, Y0, Z0, X0 + 24, Y0 + 30, Z0 + 4, P.deep);
    block(mesh, X1 - 24, Y0, Z0, X1 - 10, Y0 + 30, Z0 + 4, P.deep);
    block(mesh, X0 + 10, Y0 + 30, Z0, X1 - 10, Y1, Z0 + 4, P.hullMid);
    strip(mesh, X0 + 12, Y0 + 28, Z0 + 4, X1 - 12, Y0 + 30, Z0 + 6, P.glowDeep);

    // near-field equipment that crops the frame edges
    block(mesh, X0 - 2, Y0, 330, X0 + 16, Y0 + 34, 344, P.hullDark);
    block(mesh, X1 - 16, Y0, 330, X1 + 2, Y0 + 34, 344, P.hullDark);
    block(mesh, X0 + 2, Y0, 300, X0 + 12, Y0 + 22, 318, P.console);
    block(mesh, X1 - 12, Y0, 300, X1 - 2, Y0 + 22, 318, P.console);
    strip(mesh, X0 + 3, Y0 + 21, 302, X0 + 11, Y0 + 22, 316, P.screenWarm);

    return { mesh: mesh, meta: meta };
  }

  /* ================================================================== */
  /* 2. POWER CORE ATRIUM — 250 wide x 250 tall, multi level shaft      */
  /* ================================================================== */
  function buildAtrium() {
    const mesh = new VM('atrium');
    const rings = [];
    const X = 125, Y = 125, Z0 = -392, Z1 = -208;
    const meta = { core: [0, 0, -300] };

    // shaft walls (dark, recessed panels)
    room(mesh, -X, -Y, Z0, X, Y, Z1, P.deep, {
      floorMat: P.deep, ceilMat: P.deep,
      leftMat: P.inner, rightMat: P.inner, backMat: P.inner, frontMat: P.inner,
      tile: 26, alt: P.hullDark, alt2: P.deep, salt: 2,
    });
    // wall panel ribs + light strips
    for (let i = 0; i < 7; i++) {
      const y = -110 + i * 37;
      for (let side = -1; side <= 1; side += 2) {
        block(mesh, side < 0 ? -X : X - 8, y, Z0 + 6, side < 0 ? -X + 8 : X, y + 10, Z1 - 6, P.hullDark);
        block(mesh, side < 0 ? -X + 2 : X - 4, y + 3, Z0 + 10, side < 0 ? -X + 4 : X - 2, y + 7, Z1 - 10, P.glowDeep);
      }
      block(mesh, -X + 8, y, Z1 - 8, X - 8, y + 10, Z1 - 2, P.hullDark);
    }

    // central core: outer cage of blocks with an inner luminous column
    const cg = new VG();
    for (let y = -108; y <= 108; y += 6) {
      const r = 34 + (y % 12 === 0 ? 0 : 5);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + (y % 12) * 0.06;
        cg.set(Math.round(Math.cos(a) * r), y, Math.round(Math.sin(a) * r) - 300, P.hullMid);
      }
    }
    V.emitGrid(mesh, cg, { jitter: 0.05 });
    for (let y = -110; y <= 110; y += 4) {
      const t = (y + 110) / 220;
      const w = 10 + Math.round(Math.sin(t * Math.PI * 3) * 4);
      block(mesh, -w, y, -300 - w, w, y + 3, -300 + w, y % 12 === 0 ? P.glowSoft : P.glowDeep);
    }
    // core cap
    block(mesh, -26, 108, -326, 26, 118, -274, P.hullMid);
    block(mesh, -16, 118, -316, 16, 124, -284, P.glowSoft);

    // five ring platforms around the core
    const levels = [-96, -48, 0, 48, 96];
    for (const y of levels) {
      const inner = 34, outer = 96;
      // floor ring made of radial blocks with gaps
      for (let a = 0; a < 36; a++) {
        const ang = (a / 36) * Math.PI * 2;
        if (a % 9 === 4) continue;                       // gaps
        const c = Math.cos(ang), s = Math.sin(ang);
        const x0 = c * inner, x1 = c * outer;
        const z0 = -300 + s * inner, z1 = -300 + s * outer;
        block(mesh, Math.min(x0, x1), y - 5, Math.min(z0, z1), Math.max(x0, x1) + 2, y, Math.max(z0, z1) + 2, P.hullMid);
        // underside glow
        block(mesh, Math.min(x0, x1) + 6, y - 6, Math.min(z0, z1) + 6, Math.max(x0, x1) - 4, y - 5, Math.max(z0, z1) - 4, P.glowDeep);
      }
      // inner rail
      for (let a = 0; a < 36; a++) {
        const ang = (a / 36) * Math.PI * 2;
        if (a % 9 === 4) continue;
        const c = Math.cos(ang), s = Math.sin(ang);
        block(mesh, c * inner - 2, y, -300 + s * inner - 2, c * inner + 3, y + 10, -300 + s * inner + 3, P.trim);
      }
    }
    // huge support struts from the wall to the core
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.4;
      const c = Math.cos(ang), s = Math.sin(ang);
      const len = 96 - 30;
      block(mesh, c * 30, -120, -300 + s * 30, c * 30 + c * len, -112, -300 + s * 30 + s * len, P.hullDark);
      block(mesh, c * 34, 112, -300 + s * 34, c * 34 + c * len, 120, -300 + s * 34 + s * len, P.hullDark);
      block(mesh, c * 44, -8, -300 + s * 44 - 6, c * 44 + c * 40, 8, -300 + s * 44 + s * 40 + 6, P.hullMid);
      block(mesh, c * 52, -4, -300 + s * 52 - 3, c * 52 + c * 34, 4, -300 + s * 52 + s * 34 + 3, P.glowSoft);
    }

    // rotating ring bands (separate meshes)
    for (let r = 0; r < 3; r++) {
      const m = new VM('ring' + r);
      const y = -60 + r * 60;
      const rad = 56 + r * 12;
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * Math.PI * 2;
        if (a % 10 === 5) continue;
        const c = Math.cos(ang), s = Math.sin(ang);
        m.box(c * rad - 4, y - 4, -300 + s * rad - 4, c * rad + 5, y + 4, -300 + s * rad + 5, r === 1 ? P.hullMidHi : P.hullMid);
      }
      for (let a = 0; a < 40; a += 4) {
        const ang = (a / 40) * Math.PI * 2;
        const c = Math.cos(ang), s = Math.sin(ang);
        m.box(c * rad - 2, y - 2, -300 + s * rad - 2, c * rad + 3, y + 2, -300 + s * rad + 3, P.glowSoft);
      }
      rings.push({ mesh: m, y: y, speed: (r % 2 === 0 ? 1 : -1) * (0.09 - r * 0.02) });
    }
    return { mesh: mesh, rings: rings, meta: meta };
  }

  /* ================================================================== */
  /* 3. HANGAR — 380 long tube with recessed bays on both sides          */
  /* ================================================================== */
  function buildHangar() {
    const mesh = new VM('hangar');
    const X0 = -133, X1 = -58, Y0 = -58, Y1 = 22, Z0 = -212, Z1 = 172;
    const OPEN_Z = 26;              // forward section of the bay opens to space
    const meta = { mouth: [-137, -20, 150], far: [-95, -18, -200] };

    room(mesh, X0, Y0, Z0, X1, Y1, Z1, P.inner, {
      floorMat: P.hullDark, ceilMat: P.hullDark,
      leftMat: P.hullMid, rightMat: P.hullDark, backMat: P.hullDark, frontMat: P.deep,
      skip: { left: true }, tile: 20, alt: P.hullMid, alt2: P.deep, salt: 3,
    });
    // only the aft half closes the outboard side; the forward half is the mouth,
    // so the lit bay is visible from outside and the camera flies in through it
    block(mesh, X0, Y0, Z0, X0 + 5, Y1, OPEN_Z, P.hullMid);
    // threshold: a lit frame where the bay meets the opening
    block(mesh, X0, Y0, OPEN_Z - 7, X0 + 7, Y1, OPEN_Z, P.hullMidHi);
    strip(mesh, X0 - 2, Y0 + 3, OPEN_Z - 8, X0 + 1, Y1 - 3, OPEN_Z - 6, P.glow);
    strip(mesh, X0, Y1 - 5, OPEN_Z - 8, X0 + 7, Y1 - 2, OPEN_Z - 6, P.glowSoft);
    // entry apron: lit ramp plates and chevrons right at the mouth
    for (let i = 0; i < 5; i++) {
      const z = OPEN_Z + 10 + i * 26;
      strip(mesh, X0 + 2, Y0 + 1, z, X0 + 28, Y0 + 3, z + 5, i % 2 ? P.glowSoft : P.glowDeep);
      block(mesh, X0 + 2, Y0 + 4, z + 8, X0 + 16, Y0 + 12, z + 14, P.hullMid);
      strip(mesh, X0 + 3, Y0 + 12, z + 9, X0 + 15, Y0 + 13, z + 12, P.glowDeep);
    }
    // low equipment lockers along the open edge, seen from space
    for (let i = 0; i < 5; i++) {
      const z = OPEN_Z + 6 + i * 28;
      block(mesh, X0, Y0 + 4, z, X0 + 11, Y0 + 26, z + 14, P.hullMid);
      block(mesh, X0 + 1, Y0 + 7, z + 2, X0 + 10, Y0 + 24, z + 12, P.inner);
      strip(mesh, X0 + 1, Y0 + 25, z + 3, X0 + 3, Y0 + 26, z + 11, P.glowDeep);
    }
    // floor guide strips converging toward the far hatch
    for (let i = 0; i < 5; i++) {
      const x = X0 + 10 + i * 14;
      strip(mesh, x, Y0, Z0 + 10, x + 3, Y0 + 1, Z1 - 10, i % 2 ? P.glowDeep : P.deep);
    }
    // floor plating bands
    for (let i = 0; i < 16; i++) {
      const z = Z0 + 12 + i * 24;
      block(mesh, X0 + 2, Y0, z, X1 - 2, Y0 + 2, z + 10, P.hullDark);
    }
    // bays recessed into both walls
    for (let i = 0; i < 6; i++) {
      const z = Z1 - 40 - i * 58;
      // outer wall bay (only where the outboard wall is closed)
      if (z + 20 <= OPEN_Z) {
        block(mesh, X0, Y0 + 6, z - 20, X0 + 22, Y0 + 46, z + 20, P.deep);
        block(mesh, X0 + 2, Y0 + 8, z - 18, X0 + 20, Y0 + 44, z + 18, P.inner);
        strip(mesh, X0 + 18, Y0 + 10, z - 16, X0 + 20, Y0 + 42, z + 16, P.glowDeep);
      }
      // inboard bay
      block(mesh, X1 - 20, Y0 + 6, z - 18, X1, Y0 + 44, z + 18, P.deep);
      block(mesh, X1 - 18, Y0 + 8, z - 16, X1 - 2, Y0 + 42, z + 16, P.inner);
      strip(mesh, X1 - 4, Y0 + 10, z - 14, X1 - 2, Y0 + 40, z + 14, P.glowDeep);
      // bay divider ribs (on the walls only, the central lane stays open)
      block(mesh, X0, Y0 + 6, z - 24, X0 + 26, Y0 + 50, z - 20, P.hullMid);
      block(mesh, X0, Y0 + 6, z + 20, X0 + 26, Y0 + 50, z + 24, P.hullMid);
      block(mesh, X1 - 24, Y0 + 6, z - 24, X1, Y0 + 50, z - 20, P.hullMid);
      block(mesh, X1 - 24, Y0 + 6, z + 20, X1, Y0 + 50, z + 24, P.hullMid);
    }
    // overhead gantries crossing the tube
    for (let i = 0; i < 8; i++) {
      const z = Z1 - 30 - i * 48;
      block(mesh, X0 + 2, Y1 - 12, z, X1 - 2, Y1 - 6, z + 8, P.hullMid);
      block(mesh, X0 + 6, Y1 - 16, z + 2, X1 - 6, Y1 - 12, z + 6, P.deep);
      strip(mesh, X0 + 10, Y1 - 17, z + 3, X1 - 10, Y1 - 16, z + 5, P.glowSoft);
      // hanging tool rigs
      block(mesh, X0 + 18, Y1 - 30, z - 2, X0 + 30, Y1 - 12, z + 6, P.hullDark);
      block(mesh, X1 - 30, Y1 - 26, z + 4, X1 - 18, Y1 - 12, z + 12, P.hullDark);
    }
    // continuous ceiling light lines running the length of the tube
    for (let i = 0; i < 2; i++) {
      const x = X0 + 16 + i * 42;
      strip(mesh, x, Y1 - 4, Z0 + 6, x + 3, Y1 - 2, Z1 - 6, P.glowSoft);
    }
    // wall guide lines at eye level
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? X0 + 24 : X1 - 26;
      strip(mesh, x, Y0 + 30, Z0 + 6, x + 1, Y0 + 31, Z1 - 6, P.glowDeep);
    }
    // wall panelling so the long flanks never read as one flat plate
    for (let i = 0; i < 16; i++) {
      const z = Z1 - 16 - i * 24;
      // outer flank (closed part only)
      if (z + 6 <= OPEN_Z) {
        block(mesh, X0, Y0 + 4, z, X0 + 4, Y1 - 4, z + 6, P.hullMid);
        block(mesh, X0 + 4, Y0 + 7, z + 1, X0 + 6, Y1 - 7, z + 5, P.deep);
        block(mesh, X0 + 1, Y0 + 8, z + 2, X0 + 3, Y1 - 8, z + 4, P.glowDeep);
      }
      // inboard flank
      block(mesh, X1 - 4, Y0 + 4, z, X1, Y1 - 4, z + 6, P.hullMid);
      block(mesh, X1 - 6, Y0 + 7, z + 1, X1 - 4, Y1 - 7, z + 5, P.deep);
      // side ledges under the ceiling
      block(mesh, X0, Y0 + 40, z, X0 + 11, Y0 + 46, z + 7, P.hullMid);
      block(mesh, X1 - 11, Y0 + 40, z, X1, Y0 + 46, z + 7, P.hullMid);
    }
    // abstract maintenance arms off the inboard wall
    for (let i = 0; i < 7; i++) {
      const z = Z1 - 60 - i * 52;
      block(mesh, X1 - 16, Y0 + 14, z, X1 - 4, Y0 + 20, z + 5, P.hullMidHi);
      block(mesh, X1 - 26, Y0 + 16, z - 1, X1 - 14, Y0 + 19, z + 3, P.trim);
      block(mesh, X1 - 34, Y0 + 15, z, X1 - 25, Y0 + 18, z + 2, P.hullMidHi);
    }
    // second hatch at the far end
    block(mesh, X0 + 6, Y0, Z0, X1 - 6, Y0 + 18, Z0 + 5, P.hullMid);
    block(mesh, X0 + 6, Y1 - 18, Z0, X1 - 6, Y1, Z0 + 5, P.hullMid);
    block(mesh, X0 + 6, Y0 + 18, Z0, X0 + 16, Y1 - 18, Z0 + 5, P.hullMid);
    block(mesh, X1 - 16, Y0 + 18, Z0, X1 - 6, Y1 - 18, Z0 + 5, P.hullMid);
    // light beyond the hatch: a framed aperture, not a flat card
    block(mesh, X0 + 16, Y0 + 20, Z0 + 2, X1 - 18, Y1 - 20, Z0 + 4, P.deep);
    strip(mesh, X0 + 15, Y0 + 19, Z0 + 1, X1 - 17, Y0 + 21, Z0 + 3, P.glowSoft);
    strip(mesh, X0 + 15, Y1 - 21, Z0 + 1, X1 - 17, Y1 - 19, Z0 + 3, P.glowSoft);
    strip(mesh, X0 + 15, Y0 + 20, Z0 + 1, X0 + 17, Y1 - 20, Z0 + 3, P.glowSoft);
    strip(mesh, X1 - 17, Y0 + 20, Z0 + 1, X1 - 15, Y1 - 20, Z0 + 3, P.glowSoft);
    // entry mouth frame (port side, matching the hull opening)
    block(mesh, X0 - 4, Y0, Z1 - 8, X0 + 2, Y1, Z1, P.hullMidHi);
    block(mesh, X0 - 6, Y1 - 10, Z1 - 8, X0 + 2, Y1, Z1, P.trim);
    block(mesh, X0 - 6, Y0, Z1 - 8, X0 + 2, Y0 + 8, Z1, P.trim);
    return { mesh: mesh, meta: meta };
  }

  /* ================================================================== */
  /* 4. ENERGY CORRIDOR — 360 long, tall loading machines, open spine  */
  /* ================================================================== */
  function buildCorridor() {
    const mesh = new VM('corridor');
    const X0 = 30, X1 = 102, Y0 = -86, Y1 = -14, Z0 = -80, Z1 = 284;
    const meta = { end: [66, -50, -80] };

    room(mesh, X0, Y0, Z0, X1, Y1, Z1, P.deep, {
      floorMat: P.hullDark, ceilMat: P.deep,
      leftMat: P.inner, rightMat: P.inner, backMat: P.deep, frontMat: P.deep,
      tile: 16, alt: P.hullDark, alt2: P.deep, salt: 4,
    });

    /* tall loading machines flanking a clear central spine */
    for (let i = 0; i < 8; i++) {
      const z = Z1 - 34 - i * 44;
      const t = i / 7;
      const w = 15 - Math.round(t * 2);
      /* starboard machine */
      block(mesh, X1 - w - 4, Y0 + 2, z - 17, X1 - 2, Y1 - 2, z + 17, P.hullMid);
      block(mesh, X1 - w, Y0 + 6, z - 13, X1 - 6, Y1 - 8, z + 13, P.deep);
      block(mesh, X1 - w + 3, Y0 + 18, z - 9, X1 - 9, Y1 - 22, z + 9, P.glow);
      block(mesh, X1 - w + 2, Y0 + 8, z - 11, X1 - 8, Y0 + 12, z + 11, P.glowSoft);
      strip(mesh, X1 - w - 2, Y0, z - 16, X1 - 2, Y0 + 3, z + 16, P.hullMidHi);
      /* port machine */
      block(mesh, X0 + 2, Y0 + 2, z - 13, X0 + w, Y1 - 14, z + 13, P.hullMid);
      block(mesh, X0 + 5, Y0 + 6, z - 9, X0 + w - 3, Y1 - 18, z + 9, P.deep);
      block(mesh, X0 + 8, Y0 + 16, z - 6, X0 + w - 6, Y1 - 26, z + 6, P.glowSoft);
      strip(mesh, X0 + 2, Y0 + 12, z - 12, X0 + w, Y0 + 14, z + 12, P.glowDeep);
    }

    /* repeated frames crossing overhead and down the flanks */
    for (let i = 0; i < 10; i++) {
      const z = Z1 - 18 - i * 34;
      const t = i / 9;
      const w = 11 - Math.round(t * 3);
      block(mesh, X0, Y0, z, X0 + w, Y1, z + 10, P.hullMid);
      block(mesh, X1 - w, Y0, z, X1, Y1, z + 10, P.hullMid);
      block(mesh, X0, Y1 - w, z, X1, Y1, z + 10, P.hullMid);
      strip(mesh, X0 + w, Y1 - w + 1, z + 2, X1 - w, Y1 - w + 3, z + 8, P.glowDeep);
      strip(mesh, X0 + 2, Y0 + 26, z + 2, X0 + 4, Y1 - w, z + 8, P.glowDeep);
      strip(mesh, X1 - 4, Y0 + 26, z + 2, X1 - 2, Y1 - w, z + 8, P.glowDeep);
    }

    /* suspended conductor rails above the spine */
    for (let i = 0; i < 11; i++) {
      const z = Z1 - 10 - i * 32;
      block(mesh, X0 + 16, Y1 - 13, z, X1 - 12, Y1 - 9, z + 4, P.hullDark);
      block(mesh, X0 + 22, Y1 - 16, z + 1, X1 - 18, Y1 - 13, z + 3, P.glowSoft);
      block(mesh, X0 + 30, Y1 - 19, z - 1, X0 + 33, Y1 - 9, z + 2, P.trim);
    }

    /* floor rails converging toward the far chamber */
    for (let i = 0; i < 3; i++) {
      strip(mesh, X0 + 18 + i * 16, Y0, Z0 + 4, X0 + 21 + i * 16, Y0 + 1, Z1 - 4, i === 1 ? P.glowDeep : P.deep);
    }
    strip(mesh, X0 + 2, Y0, Z0 + 4, X0 + 4, Y0 + 1, Z1 - 4, P.glowDeep);
    strip(mesh, X1 - 4, Y0, Z0 + 4, X1 - 2, Y0 + 1, Z1 - 4, P.glowDeep);

    /* wide chamber mouth at the far end: an aperture, not a light card */
    block(mesh, X0 + 4, Y0, Z0 - 4, X1 - 4, Y0 + 12, Z0 + 2, P.hullMid);
    block(mesh, X0 + 4, Y1 - 12, Z0 - 4, X1 - 4, Y1, Z0 + 2, P.hullMid);
    block(mesh, X0 + 4, Y0 + 12, Z0 - 4, X0 + 12, Y1 - 12, Z0 + 2, P.hullMid);
    block(mesh, X1 - 12, Y0 + 12, Z0 - 4, X1 - 4, Y1 - 12, Z0 + 2, P.hullMid);
    strip(mesh, X0 + 5, Y0 + 12, Z0 + 1, X0 + 11, Y1 - 12, Z0 + 3, P.glowSoft);
    strip(mesh, X1 - 11, Y0 + 12, Z0 + 1, X1 - 5, Y1 - 12, Z0 + 3, P.glowSoft);
    strip(mesh, X0 + 11, Y1 - 13, Z0 + 1, X1 - 11, Y1 - 11, Z0 + 3, P.glowSoft);
    strip(mesh, X0 + 11, Y0 + 11, Z0 + 1, X1 - 11, Y0 + 13, Z0 + 3, P.glowSoft);
    /* chamber depth: a darker recess with a hot core further in */
    block(mesh, X0 + 12, Y0 + 14, Z0 - 22, X1 - 12, Y1 - 14, Z0 - 2, P.inner);
    strip(mesh, X0 + 20, Y0 + 22, Z0 - 21, X1 - 20, Y1 - 22, Z0 - 19, P.glow);
    strip(mesh, X0 + 24, Y0 + 26, Z0 - 21, X1 - 24, Y1 - 26, Z0 - 19, P.glowSoft);

    /* side alcoves */
    for (let i = 0; i < 5; i++) {
      const z = Z1 - 60 - i * 70;
      block(mesh, X0 - 2, Y0 + 8, z - 18, X0 + 10, Y1 - 10, z + 18, P.deep);
      block(mesh, X0, Y0 + 12, z - 14, X0 + 8, Y1 - 14, z + 14, P.inner);
      strip(mesh, X0 + 1, Y0 + 14, z - 12, X0 + 3, Y1 - 16, z + 12, P.glowDeep);
    }
    return { mesh: mesh, meta: meta };
  }

  F.Interiors = {
    buildBridge: buildBridge,
    buildAtrium: buildAtrium,
    buildHangar: buildHangar,
    buildCorridor: buildCorridor,
    room: room,
  };
})(window);
