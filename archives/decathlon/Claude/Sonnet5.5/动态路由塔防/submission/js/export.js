/* 视频导出接口 window.videoExport：把三段实战演示逐帧导出
   runs   : ['demo-1', 'demo-2', 'demo-3']
   begin  : await begin(runId, { fps }) -> { frames }
   frame  : await frame(i)  —— 第 i 帧对应游戏时刻 i/fps，返回时已完整显示在页面上
   end    : end() 回到正常状态
   逐帧推进游戏逻辑、界面、特效、定时器与 CSS 动画，全部由虚拟时钟驱动，不依赖真实时间；随机数使用固定种子。 */
(function (G) {
'use strict';
var RUNS = ['demo-1', 'demo-2', 'demo-3'];
// 各段演示脚本自然结束的游戏时刻（秒），导出时再多留片尾
var END_AT = { 'demo-1': 18.7, 'demo-2': 19, 'demo-3': 18 };
var TAIL = 0;
var realST = G.realTimeout;
var st = null;                       // 导出状态
var saved = null;                    // 进入导出前的现场
var born = new WeakMap(), settled = new WeakSet();

function sleepReal(ms) { return new Promise(function (r) { realST(r, ms); }); }
function raf() { return new Promise(function (res) { var done = false; function fin() { if (!done) { done = true; res(); } } requestAnimationFrame(fin); realST(fin, 300); }); }

// 把页面里所有 CSS 动画 / 过渡对齐到虚拟时钟
function syncAnimations(clockMs, settle) {
  var list = document.getAnimations();
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (settled.has(a)) continue;
    var b = born.get(a);
    if (b === undefined) {
      b = clockMs; born.set(a, b);
      try { a.pause(); } catch (e) {}
      if (settle) {
        var end = a.effect && a.effect.getComputedTiming().endTime;
        if (isFinite(end)) { try { a.finish(); } catch (e2) {} settled.add(a); continue; }
      }
    }
    try { a.currentTime = Math.max(0, clockMs - b); } catch (e3) {}
  }
}
function releaseAnimations() {
  var list = document.getAnimations();
  for (var i = 0; i < list.length; i++) {
    var a = list[i]; if (!born.has(a) && !settled.has(a)) continue;
    try { var end = a.effect && a.effect.getComputedTiming().endTime; if (isFinite(end)) a.finish(); else a.play(); } catch (e) {}
  }
}

function install(fps, runIndex) {
  G.exportActive = true;
  G.vt.reset(); G.vt.active = true;
  G.seedRand(0x5EED0000 + runIndex * 7919 + 1);
  // 图标按需生成，不能消耗固定种子的随机序列
  if (!saved.icon) {
    saved.icon = G.models.icon;
    G.models.icon = function (k, s) { var r = G.rand, q = G.simRand; G.unseedRand(); try { return saved.icon(k, s); } finally { G.rand = r; G.simRand = q; } };
  }
  if (G.audio) { if (!saved.play) { saved.play = G.audio.play; G.audio.play = function () { }; } if (G.audio.ctx && G.audio.ctx.state === 'running') { saved.audioRunning = true; try { G.audio.ctx.suspend(); } catch (e) {} } }
  G.gfx.setPR(Math.min(window.devicePixelRatio || 1, 1.5));
}
function clearTransient() {
  ['toasts', 'banner'].forEach(function (id) { var n = document.getElementById(id); if (n) n.innerHTML = ''; });
  var tip = document.getElementById('tip'); if (tip) tip.classList.add('hidden');
  var gh = document.getElementById('dragghost'); if (gh) gh.classList.add('hidden');
  var de = document.getElementById('demo-end'); if (de) de.remove();
}
function relayout() {
  G.updateUiScale(); G.gfx.resize(); if (G.match) { G.match.world.resizeOverlay(); G.camCtl.setDefault(G.match.game.map); }
  st.w = window.innerWidth; st.h = window.innerHeight;
}
function launch(runIndex, fps) {
  saved = saved || {};
  if (G.match && G.match.demo) { G.match.demo.dispose(); G.match.demo = null; }
  install(fps, runIndex);
  clearTransient();
  G.demo.launch(runIndex);
  st.w = -1; relayout();
  G.camCtl.reset(true);
  st.i = -1; st.clock = 0; st.tReal = 0;
  syncAnimations(0, true);
}
function advance() {
  var dt = st.i < 0 ? 0 : 1 / st.fps, m = G.match;
  if (window.innerWidth !== st.w || window.innerHeight !== st.h) relayout();
  m.game.speed = 1; m.paused = false;
  G.stepMatch(m, dt);
  G.camCtl.update(dt); G.camCtl.shakeAmt = Math.max(0, G.camCtl.shakeAmt - dt * 2);
  G.gfx.camera.updateMatrixWorld(true); if (m.demo && m.demo.active) m.demo.frame(dt);   // 光标贴住世界目标
  G.vt.advance(dt * 1000);
  st.clock += dt * 1000; st.tReal += dt; st.i++;
  syncAnimations(st.clock, false);
}

var api = {
  runs: RUNS.slice(),
  begin: async function (runId, opts) {
    var ri = RUNS.indexOf(runId);
    if (ri < 0) throw new Error('未知的演示：' + runId);
    var fps = Math.max(1, Math.min(240, +(opts && opts.fps) || 30));
    while (!G.booted) await sleepReal(50);
    if (st) api.end(true);
    st = { run: ri, runId: runId, fps: fps, i: -1, clock: 0, tReal: 0, w: 0, h: 0 };
    launch(ri, fps);
    return { frames: Math.ceil((END_AT[runId] + TAIL) * fps) };
  },
  frame: async function (i) {
    if (!st) throw new Error('请先调用 begin');
    i = Math.max(0, Math.floor(i));
    if (i < st.i) launch(st.run, st.fps);           // 回退：从头重放到第 i 帧
    G.exportActive = true;
    while (st.i < i) advance();
    if (st.i < 0) advance();
    await new Promise(function (res) {
      var done = false; function fin() { if (!done) { done = true; res(); } }
      requestAnimationFrame(function () { try { G.gfx.render(st.tReal); } catch (e) { console.error(e); } fin(); });
      realST(fin, 400);
    });
    await raf();                                     // 再过一帧，确保第 i 帧已呈现
    return st.i;
  },
  end: function (keepActive) {
    if (!st) return;
    var m = G.match;
    if (m && m.demo) { m.demo.dispose(); m.demo = null; }
    releaseAnimations();
    G.vt.active = false; G.vt.reset();
    G.unseedRand();
    if (saved) {
      if (saved.icon) { G.models.icon = saved.icon; saved.icon = null; }
      if (saved.play && G.audio) { G.audio.play = saved.play; saved.play = null; }
      if (saved.audioRunning && G.audio && G.audio.ctx) { try { G.audio.ctx.resume(); } catch (e) {} saved.audioRunning = false; }
    }
    clearTransient();
    st = null;
    if (keepActive) return;
    G.exportActive = false;
    // 回到正常状态：标题页 + 菜单背景
    G.hideAllScreens(); document.body.classList.remove('demo');
    G.enterMenu(0); G.screens.title();
    G.camCtl.userMoved = false;
  }
};
window.videoExport = api;
})(window.G = window.G || {});
