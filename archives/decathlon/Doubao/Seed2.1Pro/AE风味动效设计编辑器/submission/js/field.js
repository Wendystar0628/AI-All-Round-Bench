/* ============================================================
 * field.js — 空间场
 * 距离衰减 / 噪声 / 旋涡；同一份 sampleFieldAt 同时驱动
 * 几何顶点变形（2.8）与粒子运动（2.13），保证二者一致。
 * ============================================================ */
(function (global) {
'use strict';

/* 3D 值噪声（可复现） */
function hash3(ix, iy, iz, seed) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 2147483647 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 1); }
function valueNoise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  const n000 = hash3(xi, yi, zi, seed), n100 = hash3(xi + 1, yi, zi, seed);
  const n010 = hash3(xi, yi + 1, zi, seed), n110 = hash3(xi + 1, yi + 1, zi, seed);
  const n001 = hash3(xi, yi, zi + 1, seed), n101 = hash3(xi + 1, yi, zi + 1, seed);
  const n011 = hash3(xi, yi + 1, zi + 1, seed), n111 = hash3(xi + 1, yi + 1, zi + 1, seed);
  const x00 = M.lerp(n000, n100, u), x10 = M.lerp(n010, n110, u);
  const x01 = M.lerp(n001, n101, u), x11 = M.lerp(n011, n111, u);
  return M.lerp(M.lerp(x00, x10, v), M.lerp(x01, x11, v), w);
}
/* 噪声旋度（散度近似为零，适合推动粒子） */
function curlNoise(x, y, z, freq, seed) {
  const e = 0.6;
  const n = (ox, oy, oz) => valueNoise3((x + ox) * freq, (y + oy) * freq, (z + oz) * freq, seed);
  const dx = (n(0, e, e) - n(0, -e, e)) - (n(0, e, -e) - n(0, -e, -e));
  const dy = (n(e, 0, e) - n(-e, 0, e)) - (n(e, 0, -e) - n(-e, 0, -e));
  const dz = (n(e, e, 0) - n(-e, e, 0)) - (n(e, -e, 0) - n(-e, -e, 0));
  return [dx, -dy, dz];
}

/* def: {kind, radius, strength, frequency, timeScale, falloff, position:[x,y,z]} */
function sampleFieldAt(def, x, y, z, time) {
  const dx = x - def.position[0], dy = y - def.position[1], dz = z - (def.position[2] || 0);
  const dist = Math.hypot(dx, dy, dz);
  const R = def.radius;
  if (dist > R) return [0, 0, 0];
  const fall = Math.pow(1 - dist / R, (def.falloff ?? 70) / 100 * 2 + 0.2);
  const S = def.strength * fall;
  if (def.kind === 'falloff') {
    /* 距离衰减：由场心向外推 */
    const inv = dist > 0.001 ? 1 / dist : 0;
    return [dx * inv * S, dy * inv * S, dz * inv * S * 0.4];
  }
  if (def.kind === 'vortex') {
    /* 旋涡：绕 z 轴切向力 */
    const inv = dist > 0.001 ? 1 / dist : 0;
    return [-dy * inv * S, dx * inv * S, Math.sin(time * 3 + dist * 0.02) * S * 0.25];
  }
  /* noise：旋度噪声 */
  const seed = def.seed || 7;
  const c = curlNoise(x, y, z + time * (def.timeScale || 1) * 60, def.frequency, seed);
  return [c[0] * S, c[1] * S, c[2] * S];
}

/* 混合多个场（图层 fieldIds 指定，顺序即混合顺序） */
function combinedField(defs, x, y, z, time) {
  const r = [0, 0, 0];
  for (const d of defs) {
    const f = sampleFieldAt(d, x, y, z, time);
    const b = d.blend !== undefined ? d.blend : 1;
    r[0] += f[0] * b; r[1] += f[1] * b; r[2] += f[2] * b;
  }
  return r;
}

/* 从场图层构造场定义（t 时刻，含世界变换） */
function fieldDefFromLayer(L, getPV, worldTransform) {
  const F = L.field;
  const pos = worldTransform ? worldTransform.position : getPV(L.transform.position, 0);
  return {
    kind: getPV(F.kind, 0),
    radius: getPV(F.radius, 0),
    strength: getPV(F.strength, 0),
    frequency: getPV(F.frequency, 0),
    timeScale: getPV(F.timeScale, 0),
    falloff: getPV(F.falloff, 0),
    blend: getPV(F.blend, 0),
    position: pos,
    seed: M.hashStr(L.id)
  };
}

global.Fields = { valueNoise3, curlNoise, sampleFieldAt, combinedField, fieldDefFromLayer };
})(window);
