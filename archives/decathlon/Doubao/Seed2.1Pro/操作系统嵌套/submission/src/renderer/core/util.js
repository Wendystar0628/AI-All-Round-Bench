/* 小工具 */
'use strict';
window.NOS = window.NOS || {};
NOS.util = {
  hash(s) {
    let h = 2166136261;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  },
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  deepEq(a, b) { return JSON.stringify(a) === JSON.stringify(b); },
  uid() { return Math.random().toString(36).slice(2, 9); }
};
