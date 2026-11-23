/* ============================================================
   fields.js — 空间场（距离衰减 / 噪声 / 旋涡 / 涡旋吸引）
   同一场同时作用于几何顶点与粒子运动
   ============================================================ */
(function (global) {
  const AE = global.AE = global.AE || {};
  const U = AE.util;
  const F = AE.fields = {};

  F.TYPES = [
    { id: 'distance', label: '距离衰减' },
    { id: 'noise', label: '噪声' },
    { id: 'vortex', label: '旋涡' },
    { id: 'attract', label: '吸引/排斥' }
  ];

  F.DEFS = [
    { key: 'position', label: '位置', type: 'vec3', def: [0, 0, 0] },
    { key: 'radius', label: '影响半径', type: 'num', def: 400, step: 5 },
    { key: 'strength', label: '强度', type: 'num', def: 120, step: 1 },
    { key: 'direction', label: '方向', type: 'vec3', def: [0, 0, 1] },
    { key: 'falloff', label: '衰减', type: 'num', def: 2, step: 0.1 },
    { key: 'seed', label: '种子', type: 'num', def: 1, step: 1 }
  ];

  F.create = function (type, name) {
    const f = {
      id: U.uid('field'), type: type || 'noise', name: name || (F.TYPES.find(t => t.id === type) || F.TYPES[1]).label,
      enabled: true, props: AE.model.makeProps(F.DEFS), visible: true
    };
    f.props.position = { v: [0, 0, 0], tr: null, ex: null };
    return f;
  };

  /** 场在某点的位移向量 */
  F.sample = function (field, p, ctx) {
    const g = ctx && ctx.getProp ? ctx.getProp(field, 'position', p) : field.props.position.v;
    const radius = ctx && ctx.getProp ? ctx.getProp(field, 'radius', p) : field.props.radius.v;
    const strength = ctx && ctx.getProp ? ctx.getProp(field, 'strength', p) : field.props.strength.v;
    const dir = ctx && ctx.getProp ? ctx.getProp(field, 'direction', p) : field.props.direction.v;
    const falloff = ctx && ctx.getProp ? ctx.getProp(field, 'falloff', p) : field.props.falloff.v;
    const seed = ctx && ctx.getProp ? ctx.getProp(field, 'seed', p) : field.props.seed.v;
    const dx = p[0] - g[0], dy = p[1] - g[1], dz = (p[2] || 0) - (g[2] || 0);
    const dist = Math.hypot(dx, dy, dz) || 1e-5;
    const fall = Math.max(0, 1 - dist / Math.max(1, radius));
    const w = Math.pow(fall, Math.max(0.1, falloff));
    switch (field.type) {
      case 'distance': {
        const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
        return [dir[0] / l * strength * w, dir[1] / l * strength * w, dir[2] / l * strength * w];
      }
      case 'noise': {
        const s = 0.02;
        const n1 = U.fbm2(p[0] * s + seed, p[1] * s + seed * 0.7, seed | 0, 3) - 0.5;
        const n2 = U.fbm2(p[1] * s + seed * 1.3, (p[2] || 0) * s + seed, seed | 0, 3) - 0.5;
        const n3 = U.fbm2((p[2] || 0) * s + seed * 0.4, p[0] * s + seed * 2.1, seed | 0, 3) - 0.5;
        return [n1 * strength * w * 2, n2 * strength * w * 2, n3 * strength * w * 2];
      }
      case 'vortex': {
        // 绕 Y 轴旋转
        const ax = U.vec.norm(dir);
        const rx = p[0] - g[0], ry = p[1] - g[1], rz = (p[2] || 0) - (g[2] || 0);
        const tangential = U.vec.cross(ax, [rx, ry, rz]);
        return [tangential[0] * strength * w * 0.01, tangential[1] * strength * w * 0.01, tangential[2] * strength * w * 0.01];
      }
      case 'attract': {
        const s = strength >= 0 ? 1 : -1;
        return [dx / dist * Math.abs(strength) * w * s, dy / dist * Math.abs(strength) * w * s, dz / dist * Math.abs(strength) * w * s];
      }
    }
    return [0, 0, 0];
  };

  /** 叠加多个场 */
  F.evaluate = function (fields, p, ctx) {
    let x = 0, y = 0, z = 0;
    for (const f of fields) {
      if (!f.enabled) continue;
      const d = F.sample(f, p, ctx);
      x += d[0]; y += d[1]; z += d[2];
    }
    return [x, y, z];
  };

  /** 场的影响范围（画布显示） */
  F.range = function (field, ctx) {
    const radius = ctx && ctx.getProp ? ctx.getProp(field, 'radius', 0) : field.props.radius.v;
    const pos = ctx && ctx.getProp ? ctx.getProp(field, 'position', 0) : field.props.position.v;
    return { radius, position: pos };
  };
})(window);
