/* 游戏内定时器：平时等同 setTimeout；视频导出时由逐帧推进的虚拟时钟驱动，不依赖真实时间 */
(function (G) {
'use strict';
var realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
var vt = G.vt = { active: false, now: 0, q: [], seq: 0 };
G.after = function (fn, ms) {
  if (!vt.active) return realST(fn, ms);
  var id = 1e9 + (++vt.seq); vt.q.push({ id: id, t: vt.now + (ms || 0), fn: fn, seq: vt.seq }); return id;
};
G.cancelAfter = function (id) {
  if (id >= 1e9) { for (var i = 0; i < vt.q.length; i++) if (vt.q[i].id === id) { vt.q.splice(i, 1); return; } }
  else realCT(id);
};
vt.reset = function () { vt.q.length = 0; vt.now = 0; };
vt.advance = function (ms) {
  vt.now += ms;
  for (;;) {
    var bi = -1;
    for (var i = 0; i < vt.q.length; i++) { var q = vt.q[i]; if (q.t <= vt.now + 1e-6 && (bi < 0 || q.t < vt.q[bi].t || (q.t === vt.q[bi].t && q.seq < vt.q[bi].seq))) bi = i; }
    if (bi < 0) break;
    var it = vt.q.splice(bi, 1)[0]; try { it.fn(); } catch (e) { console.error(e); }
  }
};
G.realTimeout = realST;
})(window.G = window.G || {});
