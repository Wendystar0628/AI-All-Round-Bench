'use strict';
/* ==========================================================================
   Build utilities: models (instanced voxel props), railings, stairs, signage
   ========================================================================== */
(function () {
  const P = window.P, M = P.M, V = P.V, FV = P.FV;

  /* ------------------------------------------------------------ voxel models (instanced) */
  // builder(B, world) draws in model-local metres (origin = model pivot)
  P.models = {};
  P.makeModel = function (name, voxSize, builder) {
    const w = new P.VoxelWorld(voxSize);
    const b = new P.Brush(w);
    builder(b, w);
    const res = P.meshWorld(w, null, { tile: 1 << 14, region: 32, single: true });
    const out = { name, size: voxSize, op: null, gl: null, wa: null };
    for (const t of res.tiles.values()) {
      out.op = t.op.toGeometry(); out.gl = t.gl.toGeometry(); out.wa = t.wa.toGeometry();
    }
    out.world = w;
    P.models[name] = out;
    return out;
  };
  // instances: list of {x,y,z, rot (0..3 quarter turns), s (uniform scale, default 1)}
  P.instModel = function (scene, model, list, opts) {
    opts = opts || {};
    const res = [];
    const mats = { op: opts.mat || (model.size === FV ? P.fineMat : P.opMat), gl: P.glMatFine || null };
    const mk = (geo, mat, caster) => {
      if (!geo || !list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 1, 0);
      list.forEach((it, i) => {
        q.setFromAxisAngle(yAxis, (it.rot || 0) * Math.PI / 2 + (it.ry || 0));
        const sc = model.size * (it.s || 1);
        s.set(sc * (it.mx ? -1 : 1), sc, sc);
        p.set(it.x, it.y, it.z);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      if (caster) im.layers.enable(opts.dynamic ? 2 : 1);
      scene.add(im);
      res.push(im);
      return im;
    };
    const a = mk(model.op, mats.op, opts.cast !== false);
    if (model.gl) mk(model.gl, P.makeGlassMaterial(model.size), false);
    return a;
  };

  /* ------------------------------------------------------------ text & icons -> bitmaps */
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  P.FONT_CN = '"MiSans", "HarmonyOS Sans SC", "Microsoft YaHei", sans-serif';
  P.FONT_EN = '"Nunito", "Segoe UI Black", "Arial Black", sans-serif';
  P.textBits = function (text, px, opts) {
    opts = opts || {};
    const font = `${opts.weight || 900} ${px}px ${opts.font || P.FONT_CN}`;
    cx.font = font;
    const w = Math.ceil(cx.measureText(text).width) + 4;
    const h = Math.ceil(px * 1.25) + 4;
    cv.width = w; cv.height = h;
    cx.font = font;
    cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
    cx.fillStyle = '#fff'; cx.textBaseline = 'middle';
    cx.fillText(text, 2, h / 2 + px * 0.04);
    const d = cx.getImageData(0, 0, w, h).data;
    // crop
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    const bits = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const on = d[(x + y * w) * 4] > (opts.thr || 110) ? 1 : 0;
      bits[x + y * w] = on;
      if (on) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return { w: 0, h: 0, get: () => 0 };
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    return { w: cw, h: ch, get: (x, y) => (x < 0 || y < 0 || x >= cw || y >= ch ? 0 : bits[(x + x0) + (y + y0) * w]) };
  };
  // icon bitmaps drawn with canvas paths (size s x s)
  P.iconBits = function (kind, s) {
    cv.width = s; cv.height = s;
    const c = cx;
    c.fillStyle = '#000'; c.fillRect(0, 0, s, s);
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    c.lineCap = 'round'; c.lineJoin = 'round';
    const k = s / 32;
    c.save(); c.scale(k, k);
    c.lineWidth = 3.4;
    const ring = (x, y, r, w) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.lineWidth = w; c.stroke(); };
    switch (kind) {
      case 'wave':
        for (let i = 0; i < 3; i++) { c.beginPath(); for (let x = 4; x <= 28; x++) { const y = 9 + i * 7 + Math.sin(x * 0.5) * 2.4; if (x === 4) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
        break;
      case 'slide':
        c.beginPath(); c.moveTo(6, 5); c.bezierCurveTo(26, 6, 4, 18, 26, 27); c.lineWidth = 4.5; c.stroke();
        c.fillRect(4, 4, 4, 22); break;
      case 'tube': ring(16, 16, 9, 5.5); break;
      case 'loop': ring(16, 13, 8, 4); c.beginPath(); c.moveTo(3, 28); c.lineTo(29, 28); c.lineWidth = 4; c.stroke(); break;
      case 'drop': c.beginPath(); c.moveTo(16, 4); c.lineTo(16, 22); c.lineWidth = 4.5; c.stroke(); c.beginPath(); c.moveTo(9, 17); c.lineTo(16, 26); c.lineTo(23, 17); c.stroke(); break;
      case 'helix':
        c.lineWidth = 3.2;
        c.beginPath(); for (let y = 3; y <= 29; y++) { const x = 16 + Math.sin(y * 0.45) * 9; if (y === 3) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
        c.beginPath(); for (let y = 3; y <= 29; y++) { const x = 16 - Math.sin(y * 0.45) * 9; if (y === 3) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
        break;
      case 'race': for (let i = 0; i < 4; i++) { c.fillRect(5 + i * 6.5, 6 + i * 2, 4, 22 - i * 2); } break;
      case 'funnel': c.beginPath(); c.moveTo(4, 6); c.lineTo(28, 6); c.lineTo(19, 20); c.lineTo(19, 28); c.lineTo(13, 28); c.lineTo(13, 20); c.closePath(); c.fill(); break;
      case 'bowl': c.beginPath(); c.arc(16, 12, 12, 0, Math.PI); c.lineWidth = 4.5; c.stroke(); c.beginPath(); c.moveTo(16, 24); c.lineTo(16, 30); c.stroke(); break;
      case 'half': c.beginPath(); c.arc(16, 6, 13, 0.15, Math.PI - 0.15); c.lineWidth = 4.5; c.stroke(); break;
      case 'hole': ring(16, 16, 11, 3); c.beginPath(); c.arc(16, 16, 4.5, 0, Math.PI * 2); c.fill(); break;
      case 'family': ring(16, 18, 9, 4.5); c.beginPath(); c.arc(11, 9, 3, 0, 7); c.fill(); c.beginPath(); c.arc(21, 9, 3, 0, 7); c.fill(); break;
      case 'coaster': c.beginPath(); c.moveTo(3, 24); c.quadraticCurveTo(10, 2, 16, 18); c.quadraticCurveTo(22, 30, 29, 8); c.lineWidth = 4; c.stroke(); break;
      case 'surf': c.beginPath(); c.ellipse(16, 16, 5, 13, 0.6, 0, Math.PI * 2); c.fill(); break;
      case 'castle': c.fillRect(6, 12, 20, 16); c.fillRect(4, 6, 6, 8); c.fillRect(22, 6, 6, 8); c.fillRect(13, 4, 6, 9); c.fillStyle = '#000'; c.fillRect(13, 19, 6, 9); break;
      case 'spa': for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(9 + i * 7, 26); c.bezierCurveTo(5 + i * 7, 20, 13 + i * 7, 16, 9 + i * 7, 6); c.lineWidth = 3; c.stroke(); } break;
      case 'food': c.beginPath(); c.moveTo(16, 30); c.lineTo(8, 14); c.lineTo(24, 14); c.closePath(); c.fill(); c.beginPath(); c.arc(16, 11, 8, Math.PI, 0); c.fill(); break;
      case 'info': c.beginPath(); c.arc(16, 7, 3.2, 0, 7); c.fill(); c.fillRect(13, 12, 6, 16); break;
      case 'locker': c.fillRect(6, 4, 9, 24); c.fillRect(17, 4, 9, 24); c.fillStyle = '#000'; c.fillRect(12, 12, 2, 3); c.fillRect(23, 12, 2, 3); break;
      case 'pano': c.beginPath(); c.moveTo(3, 26); c.lineTo(12, 10); c.lineTo(18, 19); c.lineTo(22, 14); c.lineTo(29, 26); c.closePath(); c.fill(); c.beginPath(); c.arc(24, 7, 3.5, 0, 7); c.fill(); break;
      case 'river': c.beginPath(); c.moveTo(4, 8); c.bezierCurveTo(20, 2, 8, 20, 28, 16); c.lineWidth = 4; c.stroke(); ring(12, 24, 4, 3); break;
      case 'aid': c.fillRect(12, 5, 8, 22); c.fillRect(5, 12, 22, 8); break;
      case 'cup': c.fillRect(9, 12, 14, 17); c.fillRect(7, 9, 18, 4); c.fillRect(17, 2, 3, 8); break;
      case 'star': {
        c.beginPath();
        for (let i = 0; i < 10; i++) { const r = i & 1 ? 6 : 14, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(16 + Math.cos(a) * r, 17 + Math.sin(a) * r); }
        c.closePath(); c.fill(); break;
      }
      case 'climb': for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(8 + (i % 2) * 14, 6 + i * 5.2, 3, 0, 7); c.fill(); } break;
      case 'sun': ring(16, 16, 7, 4); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11); c.lineTo(16 + Math.cos(a) * 14.5, 16 + Math.sin(a) * 14.5); c.lineWidth = 3; c.stroke(); } break;
      default: c.beginPath(); c.arc(16, 16, 10, 0, 7); c.fill();
    }
    c.restore();
    const d = cx.getImageData(0, 0, s, s).data;
    const bits = new Uint8Array(s * s);
    for (let i = 0; i < s * s; i++) bits[i] = d[i * 4] > 110 ? 1 : 0;
    return { w: s, h: s, get: (x, y) => (x < 0 || y < 0 || x >= s || y >= s ? 0 : bits[x + y * s]) };
  };

  /* ------------------------------------------------------------ signage (fine voxels) */
  // place a bitmap on a vertical plane. face: 'S' (+z), 'N' (-z), 'E' (+x), 'W' (-x)
  // (x,y,z): centre of the bitmap on the plane, in metres; depth: voxels of relief
  P.stampBits = function (bits, x, y, z, face, mat, depth, scale) {
    const FB = P.FB; const w = P.fine;
    const s = scale || 1;
    const fx = Math.round(x / FV), fy = Math.round(y / FV), fz = Math.round(z / FV);
    const W = bits.w * s, H = bits.h * s;
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      if (!bits.get(Math.floor(u / s), Math.floor(v / s))) continue;
      const yy = fy + Math.floor(H / 2) - v;
      for (let d = 0; d < (depth || 1); d++) {
        let X, Z;
        if (face === 'S') { X = fx - Math.floor(W / 2) + u; Z = fz + d; }
        else if (face === 'N') { X = fx + Math.floor(W / 2) - u; Z = fz - 1 - d; }
        else if (face === 'E') { X = fx + d; Z = fz + Math.floor(W / 2) - u; }
        else { X = fx - 1 - d; Z = fz - Math.floor(W / 2) + u; }
        w.set(X, yy, Z, mat);
      }
    }
    return { w: W * FV, h: H * FV };
  };
  // rounded rectangle board in fine voxels on a vertical plane (centre x,y,z), size in metres
  P.board = function (x, y, z, face, wM, hM, mat, thick, radius) {
    const w = P.fine;
    const W = Math.round(wM / FV), H = Math.round(hM / FV);
    const fx = Math.round(x / FV), fy = Math.round(y / FV), fz = Math.round(z / FV);
    const r = Math.round((radius != null ? radius : 0.25) / FV);
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      // rounded corners
      const cu = u < r ? r - u : u >= W - r ? u - (W - r - 1) : 0;
      const cvv = v < r ? r - v : v >= H - r ? v - (H - r - 1) : 0;
      if (cu > 0 && cvv > 0 && cu * cu + cvv * cvv > r * r + 0.5) continue;
      const yy = fy - Math.floor(H / 2) + v;
      for (let d = 0; d < (thick || 1); d++) {
        let X, Z;
        if (face === 'S' || face === 'N') { X = fx - Math.floor(W / 2) + u; Z = fz + (face === 'S' ? -1 - d : d); }
        else { X = fx + (face === 'E' ? -1 - d : d); Z = fz - Math.floor(W / 2) + u; }
        w.set(X, yy, Z, mat);
      }
    }
  };
  // standard attraction sign: white rounded board, coloured header block with number + icon, name text
  P.sign = function (x, y, z, face, num, icon, name, col) {
    col = col || M.signB;
    const wM = Math.max(2.4, 1.2 + name.length * 0.62), hM = 1.5;
    P.board(x, y, z, face, wM + 0.25, hM + 0.25, M.signN, 1, 0.3);
    P.board(x, y, z, face, wM, hM, M.signW, 1, 0.25);
    // coloured badge on the left
    const bx = face === 'S' ? x - wM / 2 + 0.72 : face === 'N' ? x + wM / 2 - 0.72 : x;
    const bz = face === 'E' ? z + wM / 2 - 0.72 : face === 'W' ? z - wM / 2 + 0.72 : z;
    const off = (face === 'S') ? [0, FV] : face === 'N' ? [0, -FV] : face === 'E' ? [FV, 0] : [-FV, 0];
    P.board(bx + off[0], y, bz + off[1], face, 1.25, 1.25, col, 1, 0.3);
    const ib = P.iconBits(icon, 8);
    const ox = off[0] * 2, oz = off[1] * 2;
    P.stampBits(ib, bx + ox, y + 0.08, bz + oz, face, M.signW, 1, 1);
    // number tag (yellow dot)
    const nb = P.textBits(String(num), 7, { font: P.FONT_EN });
    const nx = face === 'S' ? bx + 0.45 : face === 'N' ? bx - 0.45 : bx;
    const nz = face === 'E' ? bz - 0.45 : face === 'W' ? bz + 0.45 : bz;
    P.board(nx + ox, y - 0.42, nz + oz, face, 0.62, 0.62, M.signY, 1, 0.3);
    P.stampBits(nb, nx + ox * 1.5, y - 0.42, nz + oz * 1.5, face, M.signN, 1, 1);
    // name
    const tb = P.textBits(name, 9);
    const tx = face === 'S' ? x + 0.55 : face === 'N' ? x - 0.55 : x;
    const tz = face === 'E' ? z - 0.55 : face === 'W' ? z + 0.55 : z;
    P.stampBits(tb, tx + off[0], y, tz + off[1], face, M.sky2, 1, 1);
  };
  // sign on a post
  P.signPost = function (x, z, face, num, icon, name, col, h) {
    const gy = P.groundY(x, z);
    h = h || 2.2;
    const B = P.FB;
    B.box(x - 0.125, gy, z - 0.125, x + 0.125, gy + h + 0.3, z + 0.125, M.steel);
    // double sided: front face + back face
    if (face === 'S' || face === 'N') {
      P.sign(x, gy + h + 0.9, z + FV, 'S', num, icon, name, col);
      P.sign(x, gy + h + 0.9, z - FV, 'N', num, icon, name, col);
    } else {
      P.sign(x + FV, gy + h + 0.9, z, 'E', num, icon, name, col);
      P.sign(x - FV, gy + h + 0.9, z, 'W', num, icon, name, col);
    }
  };

  /* ------------------------------------------------------------ railings (fine) */
  P.railing = function (pts, y, opts) {
    opts = opts || {};
    const B = P.FB;
    const h = opts.h || 1.0, mat = opts.mat || M.rail, post = opts.post || mat;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / FV));
      const yA = typeof y === 'function' ? null : y;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const yy = yA != null ? yA : y(x, z);
        const fx = Math.floor(x / FV), fz = Math.floor(z / FV), fy = Math.round(yy / FV);
        P.fine.set(fx, fy + Math.round(h / FV) - 1, fz, mat);
        if (!opts.noMid) P.fine.set(fx, fy + Math.round(h / FV / 2), fz, mat);
        const sp = Math.round((opts.spacing || 1.0) / FV);
        if (k % sp === 0) for (let q = 0; q < Math.round(h / FV) - 1; q++) P.fine.set(fx, fy + q, fz, post);
        if (opts.glass) for (let q = 1; q < Math.round(h / FV) - 1; q++) if (q !== Math.round(h / FV / 2)) P.fine.set(fx, fy + q, fz, M.glWin);
      }
    }
  };

  /* ------------------------------------------------------------ stairs (coarse) */
  // straight flight from (x,z) going along dir ('N','S','E','W'), width w, from y0 to y1, run per step
  P.stairs = function (x, z, dir, w, y0, y1, mat, run, sideMat) {
    const B = P.B;
    const steps = Math.round(Math.abs(y1 - y0) / V);
    run = run || 0.5;
    const up = y1 > y0 ? 1 : -1;
    for (let i = 0; i < steps; i++) {
      const yTop = y0 + (i + 1) * V * up;
      const d0 = i * run, d1 = (i + 1) * run;
      const yb = Math.min(y0, yTop) - (up > 0 ? 0 : 0);
      const ya = up > 0 ? y0 : yTop - V;
      let x0, x1, z0, z1;
      if (dir === 'N') { x0 = x - w / 2; x1 = x + w / 2; z0 = z - d1; z1 = z - d0; }
      else if (dir === 'S') { x0 = x - w / 2; x1 = x + w / 2; z0 = z + d0; z1 = z + d1; }
      else if (dir === 'E') { z0 = z - w / 2; z1 = z + w / 2; x0 = x + d0; x1 = x + d1; }
      else { z0 = z - w / 2; z1 = z + w / 2; x0 = x - d1; x1 = x - d0; }
      B.box(x0, Math.min(ya, yTop - V), z0, x1, yTop, z1, mat);
      if (sideMat) B.box(x0, Math.min(y0, y1), z0, x1, Math.min(ya, yTop - V), z1, sideMat);
    }
  };

  /* ------------------------------------------------------------ palm tree models (fine voxels) */
  P.buildPalmModels = function () {
    const variants = [];
    const defs = [
      { h: 7.5, lean: 0.10, fr: 8, L: 3.6, seed: 1 },
      { h: 9.0, lean: 0.16, fr: 9, L: 3.9, seed: 2 },
      { h: 10.5, lean: 0.12, fr: 9, L: 4.2, seed: 3 },
      { h: 12.0, lean: 0.2, fr: 10, L: 4.4, seed: 4 },
      { h: 6.0, lean: 0.06, fr: 7, L: 3.2, seed: 5 },
      { h: 11.0, lean: 0.24, fr: 9, L: 4.3, seed: 6 },
    ];
    defs.forEach((d, vi) => {
      const mdl = P.makeModel('palm' + vi, FV, (B, w) => {
        const rnd = P.rng(100 + d.seed * 17);
        const set = (x, y, z, m) => w.set(Math.round(x / FV), Math.round(y / FV), Math.round(z / FV), m);
        // trunk: gentle curve
        const n = Math.round(d.h / FV);
        let topX = 0, topZ = 0;
        const la = rnd() * Math.PI * 2;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const off = d.lean * d.h * t * t;
          const x = Math.cos(la) * off, z = Math.sin(la) * off, y = i * FV;
          const r = t < 0.08 ? 0.34 : 0.26 - t * 0.05;
          const ring = (Math.floor(i / 3) & 1) ? M.trunk : M.trunk2;
          for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
            const dx = a * FV, dz = b * FV;
            if (dx * dx + dz * dz <= r * r) set(x + dx, y, z + dz, ring);
          }
          topX = x; topZ = z;
        }
        const ty = n * FV;
        // crown bulb
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let c = -1; c <= 2; c++) {
          if (a * a + b * b + c * c * 2 <= 10) set(topX + a * FV, ty + c * FV, topZ + b * FV, M.frondS);
        }
        // coconuts
        for (let i = 0; i < 5; i++) {
          const a = rnd() * Math.PI * 2;
          const cxx = topX + Math.cos(a) * 0.32, czz = topZ + Math.sin(a) * 0.32, cy = ty - 0.35 - rnd() * 0.2;
          const m = rnd() < 0.5 ? M.coconut : M.coconutG;
          for (let p = 0; p < 2; p++) for (let q = 0; q < 2; q++) for (let r = 0; r < 2; r++) set(cxx + p * FV, cy + q * FV, czz + r * FV, m);
        }
        // fronds
        for (let f = 0; f < d.fr; f++) {
          const a = (f / d.fr) * Math.PI * 2 + rnd() * 0.4;
          const dx = Math.cos(a), dz = Math.sin(a);
          const px = -dz, pz = dx;
          const L = d.L * (0.85 + rnd() * 0.3);
          const rise = 0.6 + rnd() * 0.6;
          const droop = 1.6 + rnd() * 0.9;
          const steps = Math.round(L / (FV * 0.6));
          for (let s = 0; s <= steps; s++) {
            const u = s / steps;
            const along = u * L;
            const y = ty + 0.1 + rise * u * 1.4 - droop * u * u * 1.3;
            const cxp = topX + dx * along, czp = topZ + dz * along;
            const mat = u < 0.35 ? M.frond : u < 0.7 ? M.frond2 : M.frond3;
            set(cxp, y, czp, mat);
            // leaflets: comb pattern, width shrinking toward tip
            const wdt = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.95;
            if (u > 0.08 && (s % 2 === 0)) {
              const k = Math.round(wdt / FV);
              for (let j = 1; j <= k; j++) {
                const sag = j * FV * 0.45;
                const back = j * FV * 0.35;
                set(cxp + px * j * FV - dx * back, y - sag, czp + pz * j * FV - dz * back, mat);
                set(cxp - px * j * FV - dx * back, y - sag, czp - pz * j * FV - dz * back, mat);
              }
            }
          }
        }
      });
      variants.push(mdl);
    });
    P.palmModels = variants;
  };

  /* ------------------------------------------------------------ bushes / broadleaf trees (coarse) */
  P.buildPlantModels = function () {
    P.bushModels = [];
    for (let v = 0; v < 5; v++) {
      P.bushModels.push(P.makeModel('bush' + v, V, (B, w) => {
        const rnd = P.rng(300 + v * 13);
        const n = 3 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const x = (rnd() - 0.5) * 1.6, z = (rnd() - 0.5) * 1.6, r = 0.7 + rnd() * 0.6;
          B.ellipsoid(x, r * 0.7, z, r, r * 0.8, r, (X, Y, Z) => {
            const up = (Y - r * 0.3) / r;
            const h = P.hash3i(Math.floor(X * 4), Math.floor(Y * 4), Math.floor(Z * 4));
            if (h < 0.05 && v % 2 === 0) return M.flowerP;
            if (h < 0.05 && v === 3) return M.flowerY;
            return up > 0.45 ? (h < 0.5 ? M.leaf3 : M.leaf) : up > 0.0 ? (h < 0.5 ? M.leaf : M.leaf2) : M.leafDk;
          });
        }
      }));
    }
    P.treeModels = [];
    for (let v = 0; v < 4; v++) {
      P.treeModels.push(P.makeModel('tree' + v, V, (B, w) => {
        const rnd = P.rng(500 + v * 31);
        const h = 4.5 + rnd() * 3;
        // trunk with a couple of branches
        B.box(-0.25, 0, -0.25, 0.25, h, 0.25, M.trunk2);
        const n = 4 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          const a = rnd() * Math.PI * 2, rr = i === 0 ? 0 : 1.2 + rnd() * 1.4;
          const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, cy = h + (i === 0 ? 0.8 : rnd() * 1.2 - 0.3);
          const r = 1.5 + rnd() * 1.0;
          if (i > 0) B.beam(0, h - 0.6, 0, cx * 0.8, cy - 0.4, cz * 0.8, 0.25, M.trunk2);
          B.ellipsoid(cx, cy, cz, r, r * 0.72, r, (X, Y, Z) => {
            const up = (Y - cy) / r;
            const hh = P.hash3i(Math.floor(X * 4), Math.floor(Y * 4), Math.floor(Z * 4));
            return up > 0.35 ? (hh < 0.5 ? M.leaf3 : M.leaf) : up > -0.2 ? (hh < 0.6 ? M.leaf : M.leaf2) : (hh < 0.5 ? M.leaf2 : M.leafDk);
          });
        }
      }));
    }
    P.fernModels = [];
    for (let v = 0; v < 3; v++) {
      P.fernModels.push(P.makeModel('fern' + v, FV, (B, w) => {
        const rnd = P.rng(700 + v * 7);
        const n = 6 + Math.floor(rnd() * 4);
        const set = (x, y, z, m) => w.set(Math.round(x / FV), Math.round(y / FV), Math.round(z / FV), m);
        for (let f = 0; f < n; f++) {
          const a = (f / n) * Math.PI * 2 + rnd() * 0.5;
          const L = 0.9 + rnd() * 0.7;
          for (let s = 0; s <= 12; s++) {
            const u = s / 12;
            const y = 0.05 + u * 0.9 - u * u * 0.75;
            const x = Math.cos(a) * u * L, z = Math.sin(a) * u * L;
            set(x, y, z, u < 0.5 ? M.fernA : M.leaf3);
            if (s % 2 === 0 && u > 0.15 && u < 0.9) {
              set(x - Math.sin(a) * FV, y - FV * 0.5, z + Math.cos(a) * FV, M.fernA);
              set(x + Math.sin(a) * FV, y - FV * 0.5, z - Math.cos(a) * FV, M.fernA);
            }
          }
        }
        if (v === 1) for (let i = 0; i < 6; i++) { const a = rnd() * 6.28; set(Math.cos(a) * 0.3, 0.5 + rnd() * 0.2, Math.sin(a) * 0.3, M.flowerR); }
      }));
    }
    P.flowerModels = [];
    const fcols = [M.flowerP, M.flowerY, M.flowerW, M.flowerL, M.flowerO, M.flowerR];
    for (let v = 0; v < 4; v++) {
      P.flowerModels.push(P.makeModel('flowers' + v, FV, (B, w) => {
        const rnd = P.rng(900 + v * 5);
        for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) {
          const h = 1 + Math.floor(rnd() * 3);
          for (let y = 0; y < h; y++) w.set(x, y, z, rnd() < 0.5 ? M.leaf : M.leaf3);
          if (rnd() < 0.55) w.set(x, h, z, fcols[(v * 2 + Math.floor(rnd() * 2.2)) % fcols.length]);
        }
      }));
    }
  };

  /* ------------------------------------------------------------ beach props (fine) */
  P.buildPropModels = function () {
    // lounger (2.0 x 0.75), pivot at centre ground, facing +z
    P.makeModel('lounger', FV, (B) => {
      B.box(-0.375, 0.25, -1.0, 0.375, 0.375, 0.5, M.white);
      // backrest rising toward -z
      for (let i = 0; i < 5; i++) B.box(-0.375, 0.375 + i * FV, -1.0 + i * 0.1, 0.375, 0.5 + i * FV, -0.9 + i * 0.1, M.white);
      B.box(-0.375, 0.375, -0.25, 0.375, 0.5, 0.75, M.white);
      B.box(-0.375, 0.0, -0.9, -0.25, 0.25, -0.75, M.steel2); B.box(0.25, 0.0, -0.9, 0.375, 0.25, -0.75, M.steel2);
      B.box(-0.375, 0.0, 0.5, -0.25, 0.25, 0.625, M.steel2); B.box(0.25, 0.0, 0.5, 0.375, 0.25, 0.625, M.steel2);
      B.box(-0.3, 0.5, -0.9, 0.3, 0.625, -0.4, M.fabB);
    });
    // beach table
    P.makeModel('table', FV, (B) => {
      B.cyl(0, 0, 0.45, 0.625, 0.75, M.white);
      B.box(-0.0625, 0, -0.0625, 0.0625, 0.625, 0.0625, M.steel);
    });
    P.makeModel('chair', FV, (B) => {
      B.box(-0.25, 0.375, -0.25, 0.25, 0.5, 0.25, M.white);
      B.box(-0.25, 0.5, 0.125, 0.25, 0.875, 0.25, M.white);
      B.box(-0.25, 0, -0.25, -0.125, 0.375, -0.125, M.steel2); B.box(0.125, 0, -0.25, 0.25, 0.375, -0.125, M.steel2);
      B.box(-0.25, 0, 0.125, -0.125, 0.375, 0.25, M.steel2); B.box(0.125, 0, 0.125, 0.25, 0.375, 0.25, M.steel2);
    });
    P.makeModel('bench', FV, (B) => {
      B.box(-1.0, 0.375, -0.25, 1.0, 0.5, 0.25, M.wood);
      B.box(-1.0, 0.5, 0.125, 1.0, 0.875, 0.25, M.wood);
      B.box(-0.875, 0, -0.25, -0.75, 0.375, 0.25, M.steel2); B.box(0.75, 0, -0.25, 0.875, 0.375, 0.25, M.steel2);
    });
    P.makeModel('lamp', FV, (B) => {
      B.box(-0.0625, 0, -0.0625, 0.0625, 4.0, 0.0625, M.white);
      B.box(-0.25, 3.875, -0.25, 0.25, 4.125, 0.25, M.white);
      B.box(-0.1875, 3.75, -0.1875, 0.1875, 3.875, 0.1875, M.lampY);
      B.box(-0.125, 0, -0.125, 0.125, 0.25, 0.125, M.steel2);
    });
    // umbrella pole (static) — canopy is dynamic
    P.makeModel('upole', FV, (B) => {
      B.box(-0.0625, 0, -0.0625, 0.0625, 2.5, 0.0625, M.white);
      B.box(-0.1875, 0, -0.1875, 0.1875, 0.125, 0.1875, M.steel2);
    });
    // umbrella canopies: striped panels, 6 colour variants
    const uc = [[M.fabB, M.fabW], [M.fabY, M.fabW], [M.fabP, M.fabW], [M.fabM, M.fabW], [M.fabL, M.fabW], [M.fabO, M.fabW]];
    P.umbrellaModels = uc.map((c, i) => P.makeModel('ucan' + i, FV, (B, w) => {
      const R = 1.3;
      for (let x = -11; x <= 11; x++) for (let z = -11; z <= 11; z++) {
        const r = Math.hypot(x, z) * FV;
        if (r > R) continue;
        const y = Math.round((0.5 - r * 0.33) / FV);
        const a = Math.atan2(z, x);
        const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) & 1;
        w.set(x, y, z, seg ? c[0] : c[1]);
        if (r > R - 0.15) w.set(x, y - 1, z, seg ? c[0] : c[1]);
      }
      w.set(0, Math.round(0.62 / FV), 0, c[0]);
    }));
    // swim ring (tube) variants & rafts used by dynamics
    const tubeCols = [M.tube1, M.tube2, M.tube3, M.tube4, M.tube5, M.tube6];
    P.tubeModels = tubeCols.map((c, i) => P.makeModel('tube' + i, FV, (B, w) => {
      for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) for (let y = 0; y <= 2; y++) {
        const r = Math.hypot(x, z);
        const tr = Math.hypot(r - 3.4, (y - 1) * 1.2);
        if (tr <= 1.65) w.set(x, y, z, (Math.floor((Math.atan2(z, x) + 3.2) / 0.79) & 1) && i % 2 ? M.tubeW : c);
      }
    }));
    P.makeModel('tube2x', FV, (B, w) => {
      for (const oz of [-4, 4]) for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) for (let y = 0; y <= 2; y++) {
        const r = Math.hypot(x, z);
        const tr = Math.hypot(r - 3.4, (y - 1) * 1.2);
        if (tr <= 1.65) w.set(x, y, z + oz, oz < 0 ? M.tube1 : M.tube2);
      }
      w.set(0, 2, 0, M.handle); w.set(0, 2, -1, M.handle); w.set(0, 2, 1, M.handle);
    });
    P.makeModel('raft', FV, (B, w) => {
      for (let x = -10; x <= 10; x++) for (let z = -10; z <= 10; z++) for (let y = 0; y <= 3; y++) {
        const r = Math.hypot(x, z);
        if (r > 10.2) continue;
        if (y === 0 && r < 9) w.set(x, y, z, M.tubeW);
        const tr = Math.hypot(r - 8.4, (y - 1.5) * 1.1);
        if (tr <= 1.9) w.set(x, y, z, (Math.floor((Math.atan2(z, x) + 3.2) / 0.785) & 1) ? M.tube2 : M.tube1);
      }
      // seat dividers
      for (let i = -7; i <= 7; i++) { w.set(i, 1, 0, M.tube3); w.set(0, 1, i, M.tube3); }
    });
    P.makeModel('mat', FV, (B, w) => {
      for (let x = -4; x <= 4; x++) for (let z = -6; z <= 6; z++) {
        if (Math.abs(x) === 4 && Math.abs(z) === 6) continue;
        w.set(x, 0, z, z < -4 ? M.tube2 : (Math.abs(x) > 2 ? M.tube3 : M.tubeW)); if (z > -4 && z < 5) w.set(x, 1, z, z < -4 ? M.tube2 : (Math.abs(x) > 2 ? M.tube3 : M.tubeW));
      }
      for (let x = -2; x <= 2; x++) w.set(x, 1, -5, M.handle);
    });
    P.makeModel('bed', FV, (B, w) => {
      for (let x = -6; x <= 6; x++) for (let z = -12; z <= 12; z++) for (let y = 0; y <= 1; y++) {
        const ex = Math.abs(x) / 6.5, ez = Math.abs(z) / 12.5;
        if (ex * ex + ez * ez > 1.05) continue;
        const stripe = Math.floor((z + 12) / 3) & 1;
        if (y === 1 && Math.abs(x) > 4.5 && Math.abs(z) < 10) continue;
        w.set(x, y, z, stripe ? M.tube5 : M.tubeW);
      }
      for (let x = -5; x <= 5; x++) for (let z = 9; z <= 11; z++) w.set(x, 2, z, M.tube5);
    });
  };
})();
