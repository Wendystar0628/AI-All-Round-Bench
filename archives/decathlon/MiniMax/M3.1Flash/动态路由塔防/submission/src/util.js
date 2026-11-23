/* =========================================================================
 *  动态路由塔防 · 基础工具库
 *  util.js — 数学、随机、DOM、事件总线
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});

  /* ---------------- 数学 ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const dist2 = (ax, az, bx, bz) => {
    const dx = ax - bx, dz = az - bz;
    return dx * dx + dz * dz;
  };
  const angleTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
  const shortAngle = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

  /* ---------------- 随机 ---------------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = mulberry32(20261117);
  const rand = (a = 0, b = 1) => a + rng() * (b - a);
  const randInt = (a, b) => Math.floor(a + rng() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (p) => rng() < p;

  /* ---------------- DOM ---------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c === null || c === undefined) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  /* ---------------- 事件总线 ---------------- */
  function Bus() { this._h = {}; }
  Bus.prototype.on = function (evt, fn) {
    (this._h[evt] = this._h[evt] || []).push(fn);
    return () => this.off(evt, fn);
  };
  Bus.prototype.off = function (evt, fn) {
    const list = this._h[evt];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
  Bus.prototype.emit = function (evt, payload) {
    const list = this._h[evt];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (e) { console.error('[bus]', evt, e); }
    }
  };

  /* ---------------- 格式化 ---------------- */
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  function clock(t) {
    const s = Math.floor(t);
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }
  function num(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    return '' + Math.round(n);
  }

  /* ---------------- 颜色 ---------------- */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(v, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function mixHex(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    const r = Math.round(lerp(A.r, B.r, t));
    const g = Math.round(lerp(A.g, B.g, t));
    const bl = Math.round(lerp(A.b, B.b, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  RT.util = {
    clamp, lerp, invLerp, smoothstep, dist2, angleTo, shortAngle,
    easeOutCubic, easeInOutCubic, easeOutBack,
    mulberry32, rng, rand, randInt, pick, chance,
    $, $$, el, Bus, pad2, clock, num, hexToRgb, mixHex
  };
})(typeof window !== 'undefined' ? window : globalThis);
