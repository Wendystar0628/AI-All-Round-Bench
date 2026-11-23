/* 网络安全攻防战 — 核心工具 */
(function (root) {
  'use strict';
  const TD = root.TD = root.TD || {};
  TD.TICK = 1 / 60;
  TD.LEGACY_SPEED = 0.55;                 // 旧链路通行速度系数
  TD.LEGACY_COST = 1 / TD.LEGACY_SPEED;

  // 确定性随机数
  TD.makeRng = function (seed) {
    let s = seed >>> 0;
    const f = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
    f.pick = arr => arr[Math.floor(f() * arr.length)];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  };
  TD.hash2 = function (x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 2246822519) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  TD.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  TD.lerp = (a, b, t) => a + (b - a) * t;
  TD.smooth = t => { t = TD.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  TD.ease = t => { t = TD.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  TD.easeOut = t => 1 - Math.pow(1 - TD.clamp(t, 0, 1), 3);
  TD.angLerp = function (a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * t;
  };
  TD.angDiff = function (a, b) {
    return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  };
  TD.fmt = n => (Math.round(n * 10) / 10).toString();
  TD.DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // 东 南 西 北
  TD.DIR_NAMES = ['东', '南', '西', '北'];

  class Emitter {
    constructor() { this.h = {}; }
    on(n, f) { (this.h[n] = this.h[n] || []).push(f); return this; }
    off(n, f) { const a = this.h[n]; if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } }
    emit(n, d) { const a = this.h[n]; if (a) for (let i = 0; i < a.length; i++) a[i](d); const b = this.h['*']; if (b) for (let i = 0; i < b.length; i++) b[i](n, d); }
  }
  TD.Emitter = Emitter;
  TD.bus = new Emitter();     // 界面/全局事件
})(typeof window !== 'undefined' ? window : globalThis);
