// effects.js — additive light effects, plumes, weapons, shields, particles
(function () {
  'use strict';
  const C = window.C;
  const P = C.PAL;

  const FX = {};

  FX.plume = function (r, pos, dir, len, w, intensity, t, col) {
    const c = col || [1.0, 0.62, 0.26];
    const flick = 0.9 + 0.1 * Math.sin(t * 21 + pos[0] * 0.1);
    for (let i = 0; i < 3; i++) {
      const ww = w * (1 - i * 0.3) * (0.9 + 0.2 * flick);
      const ll = len * (1 - i * 0.22);
      const a = (i === 0 ? 1.0 : i === 1 ? 0.55 : 0.3) * intensity * flick;
      r.pushBeam(pos[0], pos[1], pos[2],
        pos[0] + dir[0] * ll, pos[1] + dir[1] * ll, pos[2] + dir[2] * ll,
        c[0], c[1], c[2], a, ww, 0.35, 5 + i * 4, i * 1.7);
    }
    const hx = pos[0] + dir[0] * len * 0.06, hy = pos[1] + dir[1] * len * 0.06, hz = pos[2] + dir[2] * len * 0.06;
    r.pushGlow(hx, hy, hz, w * 2.4, w * 2.4, 1.0, 0.85, 0.55, 0.95 * intensity, 0, 2.0, 9, 0.3);
    r.pushGlow(pos[0] + dir[0] * len * 0.45, pos[1] + dir[1] * len * 0.45, pos[2] + dir[2] * len * 0.45,
      w * 1.5, w * 1.5, c[0], c[1], c[2], 0.5 * intensity, 0, 2.6, 5, 1.1);
  };

  FX.muzzleGlow = function (r, pos, size, col, a) {
    r.pushGlow(pos[0], pos[1], pos[2], size, size, col[0], col[1], col[2], a, 0, 2.0, 14, 0.2);
    r.pushGlow(pos[0], pos[1], pos[2], size * 0.45, size * 0.45, 1, 1, 1, a * 0.9, 0, 2.0, 20, 0.7);
  };

  // sustained beam with charge / fire / fade phases
  FX.cannonBeam = function (r, start, end, t0, charge, dur, fade, T, col) {
    const age = T - t0;
    if (age < -0.05) return;
    const c = col || [0.62, 0.95, 1.0];
    if (age < charge) {
      const k = age / charge;
      const s = 4 + 26 * k * k;
      const dir = C.norm(C.sub(end, start));
      r.pushGlow(start[0] + dir[0] * 10, start[1] + dir[1] * 10, start[2] + dir[2] * 10, s, s, c[0], c[1], c[2], 0.5 + 0.5 * k, 0, 2.0, 22, 0.4);
      r.pushGlow(start[0], start[1], start[2], s * 0.6, s * 0.6, 1, 1, 1, 0.8 * k, 0, 2.0, 26, 0.1);
      for (let i = 0; i < 5; i++) {
        const f = (i + 1) / 5;
        if (k > f * 0.7) {
          const p = [start[0] + dir[0] * 300 * f, start[1] + dir[1] * 300 * f, start[2] + dir[2] * 300 * f];
          r.pushGlow(p[0], p[1], p[2], 8 + 10 * k, 8 + 10 * k, c[0], c[1], c[2], 0.35 * k, 0, 2.0, 10, i);
        }
      }
      return;
    }
    const fa = age - charge;
    if (fa > dur + fade) return;
    const env = fa < dur ? 1 : 1 - C.smooth((fa - dur) / fade);
    const shrink = fa < dur ? 1 : 1 - 0.75 * C.smooth((fa - dur) / fade);
    const pulse = 0.82 + 0.18 * Math.sin(T * 26) * Math.sin(T * 11);
    const w = (5.5 + 3.5 * pulse) * shrink;
    r.pushBeam(start[0], start[1], start[2], end[0], end[1], end[2],
      c[0], c[1], c[2], 1.0 * env, w, 0.5, 7, 0.2);
    r.pushBeam(start[0], start[1], start[2], end[0], end[1], end[2],
      1, 1, 1, 0.85 * env, w * 0.38, 0.4, 12, 0.9);
    r.pushBeam(start[0], start[1], start[2], end[0], end[1], end[2],
      c[0] * 0.7, c[1] * 0.9, c[2], 0.4 * env, w * 2.6, 0.8, 3, 1.4);
    // muzzle ring
    const dir = C.norm(C.sub(end, start));
    r.pushGlow(start[0], start[1], start[2], w * 3.2, w * 3.2, c[0], c[1], c[2], 0.8 * env, 0, 2.0, 18, 0.3);
    for (let i = 0; i < 3; i++) {
      const p = [start[0] + dir[0] * (60 + i * 90), start[1] + dir[1] * (60 + i * 90), start[2] + dir[2] * (60 + i * 90)];
      r.pushGlow(p[0], p[1], p[2], w * 1.6, w * 1.6, 1, 1, 1, 0.35 * env, 0, 2.0, 14, i);
    }
    // impact glow
    r.pushGlow(end[0], end[1], end[2], 26 + 16 * pulse, 26 + 16 * pulse, 1.0, 0.9, 0.75, 1.1 * env, 0, 2.2, 20, 0.5);
    r.pushGlow(end[0], end[1], end[2], 12, 12, 1, 1, 1, 1.2 * env, 0, 2.0, 24, 0.9);
  };

  // travelling energy bolt
  FX.bolt = function (r, start, end, t0, speed, T, col, size) {
    const age = T - t0;
    if (age < 0) return;
    const d = C.dist(start, end);
    const trav = age * speed;
    if (trav > d + 30) return;
    const dir = C.norm(C.sub(end, start));
    const p = [start[0] + dir[0] * Math.min(trav, d), start[1] + dir[1] * Math.min(trav, d), start[2] + dir[2] * Math.min(trav, d)];
    const tail = 26;
    const ts = [start[0] + dir[0] * Math.max(0, trav - tail), start[1] + dir[1] * Math.max(0, trav - tail), start[2] + dir[2] * Math.max(0, trav - tail)];
    const hit = trav >= d;
    r.pushBeam(ts[0], ts[1], ts[2], p[0], p[1], p[2], col[0], col[1], col[2], hit ? 0 : 1, size || 4, 1.2, 14, 0.3);
    r.pushGlow(p[0], p[1], p[2], (size || 4) * 2.6, (size || 4) * 2.6, col[0], col[1], col[2], 1, 0, 2.0, 18, 0.4);
    if (hit) {
      const a = C.clamp(1 - (trav - d) / 26, 0, 1);
      r.pushGlow(end[0], end[1], end[2], 16 * a + 6, 16 * a + 6, 1, 0.95, 0.8, a, 0, 2.0, 20, 0.6);
    }
  };

  FX.tracer = function (r, start, end, t0, speed, T, col) {
    const age = T - t0;
    if (age < 0) return;
    const d = C.dist(start, end);
    const trav = age * speed;
    if (trav > d) return;
    const dir = C.norm(C.sub(end, start));
    const p = [start[0] + dir[0] * trav, start[1] + dir[1] * trav, start[2] + dir[2] * trav];
    const ts = [start[0] + dir[0] * Math.max(0, trav - 40), start[1] + dir[1] * Math.max(0, trav - 40), start[2] + dir[2] * Math.max(0, trav - 40)];
    r.pushBeam(ts[0], ts[1], ts[2], p[0], p[1], p[2], col[0], col[1], col[2], 0.85, 1.6, 2.0, 16, 0.2);
    r.pushGlow(p[0], p[1], p[2], 5, 5, col[0], col[1], col[2], 0.8, 0, 2.0, 16, 0.3);
  };

  FX.missile = function (r, start, ctrl, end, t0, dur, T) {
    const age = T - t0;
    if (age < 0 || age > dur + 2.2) return;
    const u = C.clamp(age / dur, 0, 1);
    const e = u * u * (3 - 2 * u) * 0.75 + u * 0.25;
    const p = [
      (1 - e) * (1 - e) * start[0] + 2 * (1 - e) * e * ctrl[0] + e * e * end[0],
      (1 - e) * (1 - e) * start[1] + 2 * (1 - e) * e * ctrl[1] + e * e * end[1],
      (1 - e) * (1 - e) * start[2] + 2 * (1 - e) * e * ctrl[2] + e * e * end[2]
    ];
    // body
    const dir = C.norm(C.sub(end, start));
    const R = [dir[0], dir[1], dir[2]];
    r.pushCube(p[0], p[1], p[2], R[0] * 3, R[1] * 3, R[2] * 3, 0, 1, 0, 0, 0, 1, 150, 150, 160, 0);
    // exhaust trail
    const segs = 12;
    for (let i = 0; i < segs; i++) {
      const f = i / segs;
      const back = 6 + i * 7;
      const q = [p[0] - dir[0] * back, p[1] - dir[1] * back, p[2] - dir[2] * back];
      const a = (1 - f) * (u < 1 ? 0.9 : 0.5) * C.clamp(age * 4, 0, 1);
      const s = 7 * (1 - f * 0.7);
      r.pushGlow(q[0], q[1], q[2], s, s, 1.0, 0.55, 0.28, a, 0, 2.4, 12, i);
    }
    r.pushGlow(p[0], p[1], p[2], 12, 12, 1.0, 0.75, 0.4, 0.95, 0, 2.0, 16, 0.4);
    if (u >= 1) {
      const a = C.clamp(1 - (age - dur) / 0.5, 0, 1);
      r.pushGlow(end[0], end[1], end[2], 60 * a + 10, 60 * a + 10, 1.0, 0.8, 0.5, a * 1.3, 0, 2.0, 20, 0.8);
    }
  };

  FX.explosion = function (r, ex, T) {
    const age = T - ex.t0;
    if (age < 0 || age > 2.6) return;
    const a = age / 2.6;
    const al = (1 - a) * (1 - a);
    const grow = C.smoother(C.clamp(age / 0.4, 0, 1));
    const s = ex.scale * (0.35 + 2.6 * grow) * (1 - 0.25 * a);
    r.pushGlow(ex.c[0], ex.c[1], ex.c[2], s, s, ex.col[0], ex.col[1], ex.col[2], al * 1.5, 0, 2.0, 16, 0.3);
    r.pushGlow(ex.c[0], ex.c[1], ex.c[2], s * 0.42, s * 0.42, 1, 1, 1, al * 1.4, 0, 2.0, 22, 0.7);
    for (const sp of ex.sparks) {
      const d = sp.v * age * (1 - age * 0.06);
      const px = ex.c[0] + sp.p[0] + d, py = ex.c[1] + sp.p[1] + d - age * age * 1.6, pz = ex.c[2] + sp.p[2] + d;
      const sz = sp.s * (1 - 0.55 * a);
      const ang = sp.ph + age * sp.w;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const r0 = [ca, 0, sa], r1 = [0, 1, 0], r2 = [-sa, 0, ca];
      const fade = C.clamp(1 - a * 1.15, 0, 1);
      r.pushCube(px, py, pz, r0[0] * sz, r0[1] * sz, r0[2] * sz, r1[0] * sz, r1[1] * sz, r1[2] * sz, r2[0] * sz, r2[1] * sz, r2[2] * sz,
        sp.col[0], sp.col[1], sp.col[2], fade * 0.85);
    }
    // shock ring
    for (let i = 0; i < 8; i++) {
      const th = i / 8 * 6.283 + age * 0.8;
      const rr = s * (0.5 + age * 0.9);
      r.pushGlow(ex.c[0] + Math.cos(th) * rr, ex.c[1] + Math.sin(th) * rr * 0.6, ex.c[2] + Math.sin(th) * rr,
        s * 0.22, s * 0.22, ex.col[0], ex.col[1], ex.col[2], al * 0.5, 0, 2.2, 8, i);
    }
  };

  FX.shieldDraw = function (r, model, ship, alpha, T, col) {
    if (alpha <= 0.001) return;
    const b = ship.bbox;
    const sx = (b.max[0] - b.min[0]) * 0.5 * 1.18;
    const sy = (b.max[1] - b.min[1]) * 0.5 * 1.5 + 6;
    const sz = (b.max[2] - b.min[2]) * 0.5 * 1.5 + 6;
    const cx = (b.max[0] + b.min[0]) * 0.5, cy = (b.max[1] + b.min[1]) * 0.5, cz = (b.max[2] + b.min[2]) * 0.5;
    const m = C.m4.compose([ship.pos[0], ship.pos[1], ship.pos[2]], ship.rot, [sx, sy, sz]);
    r.drawShield(null, m, col || P.shield, T, alpha, 1.0, sx * 2);
  };

  // dust motes drifting past
  FX.dust = function (r, dust, travel, T, boost) {
    for (const d of dust) {
      const x = d.pos[0] - travel * (d.v / 10) * (boost || 1);
      const wx = ((x + 3000) % 3000) - 300;
      const a = 0.10 + 0.10 * Math.sin(T * 2 + d.ph);
      r.pushGlow(wx, d.pos[1], d.pos[2], d.s * 2.2, d.s * 2.2, 0.55, 0.75, 1.0, a, 0, 2.4, 2, d.ph);
    }
  };

  // bridge holographic fleet schematic
  FX.holo = function (r, center, T, scale) {
    const s = scale || 1;
    const rot = T * 0.16;
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const ring = i < 1 ? 0 : (i < 5 ? 1 : i < 11 ? 2 : 3);
      const a = (i * 2.399) + ring * 0.7;
      const rad = ring === 0 ? 0 : 14 + ring * 13;
      pts.push([Math.cos(a) * rad * (ring > 1 ? 1.5 : 1), (ring - 1.5) * 4.5, Math.sin(a) * rad * (ring > 1 ? 1.5 : 1)]);
    }
    for (const p of pts) {
      const x = p[0] * Math.cos(rot) - p[2] * Math.sin(rot);
      const z = p[0] * Math.sin(rot) + p[2] * Math.cos(rot);
      const y = p[1] + Math.sin(T * 0.8 + x * 0.05) * 1.2;
      r.pushGlow(center[0] + x * s, center[1] + y * s, center[2] + z * s, 3.4 * s, 3.4 * s, 0.42, 0.95, 0.88, 0.75, 0, 2.0, 6, x * 0.1);
    }
    for (let i = 0; i < 4; i++) {
      const a = T * (0.5 + i * 0.2) + i * 1.7;
      const rad = 20 + i * 12;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      r.pushBeam(center[0] + x * 0.2, center[1] - 14, center[2] + z * 0.2, center[0] + x, center[1] + 14, center[2] + z,
        0.4, 0.9, 0.85, 0.28, 1.2, 1.0, 6, i);
    }
  };

  // corridor travelling light blocks + core pulse
  FX.corridorFlow = function (r, devices, T) {
    for (const d of devices) {
      const ph = (d.x * 0.013 + T * 0.22) % 1;
      const y = d.y - 24 + ph * 48;
      const on = Math.sin(ph * Math.PI) > 0.05;
      if (on) r.pushGlow(d.x, y, d.z, 9, 9, 0.5, 0.98, 0.9, 0.85, 0, 2.0, 8, d.x * 0.1);
      const ph2 = (d.x * 0.011 + 0.5 + T * 0.17) % 1;
      r.pushGlow(d.x, d.y - 22 + ph2 * 44, d.z + (d.z < -50 ? 6 : -6), 6, 6, 0.9, 0.7, 1.0, 0.5, 0, 2.0, 7, d.z);
    }
  };

  FX.coreGlow = function (r, core, T) {
    const b = 0.75 + 0.25 * Math.sin(T * 1.5) + 0.1 * Math.sin(T * 3.7);
    r.pushGlow(core[0], core[1], core[2], 120 * b, 120 * b, 0.35, 0.85, 0.95, 0.5, 0, 2.2, 1.4, 0.2);
    r.pushGlow(core[0], core[1], core[2], 70 * b, 70 * b, 0.6, 0.95, 1.0, 0.75, 0, 2.0, 2.0, 0.6);
    for (let i = 0; i < 3; i++) {
      const y = -70 + i * 70 + Math.sin(T * 0.9 + i) * 12;
      r.pushGlow(core[0], y, core[2], 90, 34, 0.4, 0.9, 1.0, 0.35, 0, 2.4, 1.2, i);
    }
  };

  window.FX = FX;
})();
