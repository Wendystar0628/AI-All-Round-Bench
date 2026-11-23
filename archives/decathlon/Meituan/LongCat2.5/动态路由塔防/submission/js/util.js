// util.js —— 通用工具
window.G = window.G || {};
(function () {
  const U = {};
  G.U = U;

  U.clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  // 确定性随机（演示/录像用）
  U.mulberry32 = function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  };
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = arr => arr[Math.floor(Math.random() * arr.length)];
  U.dist2d = (x1, z1, x2, z2) => Math.hypot(x2 - x1, z2 - z1);
  U.angleLerp = (a, b, t) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  };
  U.angleDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  // 二次贝塞尔
  U.bezier = (p0, p1, p2, t) => {
    const s = 1 - t;
    return [s * s * p0[0] + 2 * s * t * p1[0] + t * t * p2[0],
            s * s * p0[1] + 2 * s * t * p1[1] + t * t * p2[1]];
  };
  U.fmt = n => Math.floor(n).toString();
  U.fmtTime = s => {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' + m : m) + ':' + (r < 10 ? '0' + r : r);
  };

  // 事件总线
  const listeners = {};
  U.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  U.emit = (ev, data) => { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

  // Canvas 纹理工具
  U.canvasTex = function (w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  };

  // 发光圆点精灵材质缓存
  const glowCache = {};
  U.glowSprite = function (color, size) {
    const key = color + '_' + (size || 64);
    if (glowCache[key]) return glowCache[key];
    const tex = U.canvasTex(size || 64, size || 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    glowCache[key] = mat;
    return mat;
  };

  // 数值缓动
  U.damp = (cur, target, lambda, dt) => U.lerp(cur, target, 1 - Math.exp(-lambda * dt));

  // Dijkstra：返回 dist 数组与 prev 表（节点索引）
  U.dijkstra = function (n, adj, srcIdx, weightFn) {
    const dist = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    dist[srcIdx] = 0;
    for (let it = 0; it < n; it++) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      const edges = adj[u] || [];
      for (let k = 0; k < edges.length; k++) {
        const e = edges[k];
        if (e.blocked) continue;
        const w = weightFn ? weightFn(e) : e.w;
        if (dist[u] + w < dist[e.to]) { dist[e.to] = dist[u] + w; prev[e.to] = u; }
      }
    }
    return { dist, prev };
  };

  // 颜色工具
  U.colHex = hex => '#' + hex.toString(16).padStart(6, '0');

  // 池化数组
  U.Pool = function (create, reset) {
    this.create = create; this.reset = reset; this.free = [];
  };
  U.Pool.prototype.get = function () {
    if (this.free.length) { const o = this.free.pop(); if (this.reset) this.reset(o); return o; }
    return this.create();
  };
  U.Pool.prototype.put = function (o) { this.free.push(o); };
})();
