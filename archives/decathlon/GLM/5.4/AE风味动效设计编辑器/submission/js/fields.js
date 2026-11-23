/* ============================================================
   fields.js — 空间场：距离衰减、噪声、旋涡、方向；可混合
   ============================================================ */
(function (global) {
  'use strict';

  function hash3(x, y, z) {
    const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function noise3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
    const n = (i, j, k) => hash3(ix + i, iy + j, iz + k);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(n(0, 0, 0), n(1, 0, 0), ux), l(n(0, 1, 0), n(1, 1, 0), ux), uy),
      l(l(n(0, 0, 1), n(1, 0, 1), ux), l(n(0, 1, 1), n(1, 1, 1), ux), uy), uz
    ) * 2 - 1;
  }
  function fbm(x, y, z, oct = 3) {
    let a = 0.5, f = 1, s = 0;
    for (let i = 0; i < oct; i++) { s += noise3(x * f, y * f, z * f) * a; a *= 0.5; f *= 2.03; }
    return s;
  }

  function falloff(kind, d, r) {
    const t = U.clamp(d / Math.max(r, 1e-6), 0, 1);
    if (kind === 'linear') return 1 - t;
    if (kind === 'inverse') return 1 / (1 + t * 3);
    if (kind === 'constant') return t < 1 ? 1 : 0;
    return 1 - U.smoothstep(0, 1, t);
  }

  // 返回 { dir:[x,y,z], amount }
  function evalField(f, p, t) {
    const pos = f.pos || [0, 0, 0];
    const radius = f.radius === undefined ? 220 : f.radius;
    const strength = f.strength === undefined ? 1 : f.strength;
    const dx = p[0] - pos[0], dy = p[1] - pos[1], dz = (p[2] || 0) - (pos[2] || 0);
    const d = Math.hypot(dx, dy, dz);
    let fo = falloff(f.falloff || 'smooth', d, radius);
    if (f.invert) fo = (f.falloff === 'constant' ? (fo > 0 ? 0 : 1) : 1 - fo);
    if (fo <= 1e-6) return { dir: [0, 0, 0], amount: 0 };
    let dir = [0, 0, 0];
    if (f.type === 'radial') {
      const inv = 1 / Math.max(d, 1e-4);
      dir = [dx * inv, dy * inv, dz * inv];
      if (d < 1e-3) dir = [0, 1, 0];
    } else if (f.type === 'vortex') {
      const ax = f.axis || [0, 0, 1];
      // tangent = cross(axis, radial)
      dir = [ax[1] * dz - ax[2] * dy, ax[2] * dx - ax[0] * dz, ax[0] * dy - ax[1] * dx];
      const l = Math.hypot(...dir) || 1;
      dir = dir.map(v => v / l);
    } else if (f.type === 'noise' || f.type === 'turbulence') {
      const fr = f.frequency || 2, sp = f.speed || 1;
      const s = f.seed || 0;
      dir = [
        fbm(p[0] * fr / 100 + s, p[1] * fr / 100, t * sp + s * 3.1),
        fbm(p[1] * fr / 100 + s * 2, p[2] * fr / 100, t * sp + s * 1.7),
        fbm(p[2] * fr / 100, p[0] * fr / 100 + s * 3, t * sp + s * 2.3)
      ];
      if (f.type === 'turbulence') {
        const e = 0.35;
        const n1 = fbm(p[0] * fr / 100 + s, p[1] * fr / 100, t * sp + s * 3.1);
        const n2 = fbm(p[0] * fr / 100 + s + e, p[1] * fr / 100, t * sp + s * 3.1);
        const n3 = fbm(p[0] * fr / 100 + s, p[1] * fr / 100 + e, t * sp + s * 3.1);
        dir = [n2 - n1, n3 - n1, 0].map(v => v * 2.2);
      }
    } else if (f.type === 'directional') {
      dir = f.dir || [0, 1, 0];
      const l = Math.hypot(...dir) || 1; dir = dir.map(v => v / l);
    } else {
      dir = [0, 1, 0];
    }
    return { dir, amount: strength * fo };
  }

  // 混合多个场：add / max / multiply
  function evalFields(fields, p, t, blendMode) {
    let acc = [0, 0, 0], maxMag = 0, maxVec = [0, 0, 0], mul = [1, 1, 1];
    for (const f of fields) {
      if (f.enabled === false) continue;
      const r = evalField(f, p, t);
      const v = r.dir.map(x => x * r.amount);
      if (f.blend === 'max') { const m = Math.hypot(...v); if (m > maxMag) { maxMag = m; maxVec = v; } }
      else if (f.blend === 'multiply') { mul = [mul[0] * v[0], mul[1] * v[1], mul[2] * v[2]]; }
      else { acc = [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]]; }
    }
    return [acc[0] + maxVec[0], acc[1] + maxVec[1], acc[2] + maxVec[2]];
  }

  // 从图层场定义构建场对象
  function fieldFromLayer(state, layer, t) {
    const f = layer.field;
    return {
      type: f.type,
      pos: state.getProp(layer, ['transform', 'position'], t),
      radius: state.getProp(layer, ['field', 'radius'], t),
      strength: state.getProp(layer, ['field', 'strength'], t),
      falloff: f.falloff,
      frequency: state.getProp(layer, ['field', 'frequency'], t),
      speed: state.getProp(layer, ['field', 'speed'], t),
      seed: layer.seed || 1,
      axis: state.getProp(layer, ['field', 'axis'], t),
      dir: state.getProp(layer, ['field', 'axis'], t),
      blend: f.blend,
      invert: f.invert,
      enabled: layer.enabled
    };
  }

  global.FIELDS = { evalField, evalFields, fieldFromLayer, falloff, noise3, fbm };
})(window);
