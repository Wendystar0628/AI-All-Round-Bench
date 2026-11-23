// 纯数学地形：场景渲染、飞行动力学与地面点选共用同一高度函数
import { clamp, smooth } from './util.js';

export function baseHeight(x, z, seed = 24, hills = 1) {
  const s = (seed % 97) * 0.618;
  let h = 3.2 * Math.sin(x * 0.017 + s) * Math.cos(z * 0.014 - s * 0.7)
    + 1.9 * Math.sin(x * 0.036 + z * 0.028 + s * 1.7)
    + 0.9 * Math.sin(x * 0.071 - s) * Math.sin(z * 0.061 + s * 0.3)
    + 0.35 * Math.sin(x * 0.15 + z * 0.11 + s * 2.1);
  return h * hills;
}

export function padCenterHeight(pad, seed = 24, hills = 1) {
  return baseHeight(pad.x, pad.z, seed, hills);
}

export function terrainHeight(x, z, def) {
  const seed = def?.seed ?? 24;
  const hills = def?.hills ?? 1;
  let h = baseHeight(x, z, seed, hills);
  const pads = def?.pads || [];
  for (const p of pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    const r = p.r || 10;
    if (d < r * 2.4) {
      const w = 1 - smooth(clamp((d - r * 0.92) / (r * 1.45), 0, 1));
      h = h * (1 - w) + padCenterHeight(p, seed, hills) * w;
    }
  }
  return h;
}

export function groundInfo(x, z, def) {
  const h = terrainHeight(x, z, def);
  let pad = null;
  for (const p of def?.pads || []) {
    if (Math.hypot(x - p.x, z - p.z) <= (p.r || 10)) { pad = p; break; }
  }
  return { height: h, pad, y: h + (pad ? 0.16 : 0) };
}

export function buildTerrainGeometry(THREE, def) {
  const size = def.size || 600;
  const seg = def.segments || 128;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cLow = new THREE.Color(def.colorLow || '#3d5438');
  const cHigh = new THREE.Color(def.colorHigh || '#7d7a52');
  const cRock = new THREE.Color(def.rock || '#4a4038');
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = terrainHeight(x, z, def);
    pos.setY(i, y);
    const t = clamp((y + 8) / 24, 0, 1);
    tmp.copy(cLow).lerp(cHigh, t);
    const n = Math.sin(x * 0.21 + z * 0.17) * 0.5 + 0.5;
    if (n > 0.82) tmp.lerp(cRock, (n - 0.82) * 2.2);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}