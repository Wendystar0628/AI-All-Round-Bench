/* 主程序：对局生命周期、主循环、设置存档 */
(function (G) {
'use strict';
var gfx = G.gfx;
var S = G.settings = { master: 0.8, music: 0.6, sfx: 0.9, mute: false, nodeNames: true, best: {} };
try { var raw = localStorage.getItem('netdef.settings'); if (raw) Object.assign(S, JSON.parse(raw)); } catch (e) {}
G.saveSettings = function () { try { localStorage.setItem('netdef.settings', JSON.stringify(S)); } catch (e) {} };

var canvas, overlay, last = 0, acc = 0, tReal = 0;
G.uiz = 1;
G.updateUiScale = function () { var z = Math.max(0.72, Math.min(2.4, Math.min(window.innerWidth / 1500, window.innerHeight / 860))); G.uiz = z; document.documentElement.style.setProperty('--uiz', z); };
G.match = null;

function curtain(fn, cb) {
  var c = document.getElementById('curtain'); c.classList.add('on');
  setTimeout(function () { fn(); setTimeout(function () { c.classList.remove('on'); if (cb) cb(); }, 120); }, 360);
}
G.curtain = curtain;

function makeMatch(mapIndex, menuBg) {
  if (G.match && G.match.demo) { G.match.demo.dispose(); G.match.demo = null; }
  if (G.match && G.match.world) G.match.world.dispose();
  var game = new G.Game(mapIndex), world = new G.World(game, overlay);
  world.resizeOverlay();
  var m = { game: game, world: world, paused: false, inMenu: !!menuBg, demo: null, t: 0, acc: 0, mapIndex: mapIndex };
  G.match = m;
  G.camCtl.setDefault(game.map); G.camCtl.reset(true);
  world.showNodeNames = S.nodeNames;
  return m;
}
// 菜单背景：缓慢环绕的战场
G.enterMenu = function (mapIndex) {
  var m = makeMatch(mapIndex == null ? 0 : mapIndex, true);
  m.menuOrbit = true; document.getElementById('hud').classList.add('hidden'); gfx.resize();
  G.camCtl.def.pitch = 40; G.camCtl.def.dist *= 0.9; G.camCtl.reset(true);
  if (G.audio) G.audio.setTheme(m.game.map.theme, true);
  // 背景：一场循环进行的小规模交战，让菜单画面保持生机
  var g = m.game; g.autoWave = false; g.finish = function () { }; g.leakScale = 0;
  if (m.mapIndex === 0) {
    var f = function (k, x, y, lv, br, face) { return g.placeFree(k, x, y, lv || 1, br || null, face || 0); };
    f('firewall', 4, 5, 2); f('interceptor', 3, 5, 2, 'A', 0); f('interceptor', 5, 5, 2, 'B', Math.PI); f('sandbox', 5, 4, 2); f('repair', 3, 4, 1); f('honeypot', 4, 7, 1); f('interceptor', 3, 7, 1, null, 0);
    f('firewall', 12, 5, 1); f('interceptor', 13, 5, 1, null, Math.PI); f('interceptor', 11, 5, 2, 'A', 0); f('sandbox', 13, 4, 1); f('airgap', 4, 8, 1);
    m.bgBattle = { timer: 1, k: 0 };
  }
  return m;
};
G.startMatch = function (mapIndex, opts) {
  opts = opts || {};
  var m = makeMatch(mapIndex, false); m.inMenu = false;
  document.getElementById('hud').classList.remove('hidden');
  gfx.resize();
  G.ui.build(); G.ui.bind(m);
  G.input.cancel(); G.camCtl.userMoved = false;
  if (G.audio) G.audio.setTheme(m.game.map.theme, false);
  m.game.log('守护进程已接管「' + m.game.map.name + '」。保持各入口到中枢的连通。', 'info');
  (m.game.map.tips || []).slice(0, 2).forEach(function (t) { m.game.log('提示：' + t, 'ok'); });
  if (!S.tutorialDone && !opts.demo) {
    S.tutorialDone = true; G.saveSettings();
    ['把底部卡片拖到地图上部署：防火墙 / 蜜罐放在链路，拦截器 / 沙箱 / 修复进程放在设备平台。', '把防火墙或网闸拖到绿色的交换节点上，会截断道路——拖动时即可预览各入口的新路线。', '中键拖动环绕，Shift+中键平移，滚轮缩放；空格暂停，Tab 切换速度。'].forEach(function (t, i) { G.after(function () { if (G.match === m) G.ui.toast(t, 'info', 5200); }, 1200 + i * 5600); });
  }
  return m;
};
G.restart = function () { var m = G.match; var idx = m.mapIndex, demo = m.demoId; curtain(function () { if (G.demo && m.demo) { G.demo.stop(true); } G.hideAllScreens(); G.startMatch(idx); }); };
G.toSelect = function () { curtain(function () { if (G.demo) G.demo.stop(true); G.hideAllScreens(); G.enterMenu(0); G.screens.select(); }); };
G.toTitle = function () { curtain(function () { if (G.demo) G.demo.stop(true); G.hideAllScreens(); G.enterMenu(0); G.screens.title(); }); };

var errCount = 0, slowAcc = 0, slowN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (G.exportActive) { last = now; return; }   // 视频导出时由 videoExport 逐帧驱动
  var rawDt = (now - last) / 1000; var dtR = Math.min(0.05, rawDt); last = now; tReal += dtR;
  // 自适应画质：持续低帧率时降低渲染分辨率
  if (rawDt < 0.5) { slowAcc += rawDt; slowN++; if (slowN >= 90) { if (slowAcc / slowN > 0.04 && gfx.getPR() > 0.7) { gfx.setPR(Math.max(0.7, gfx.getPR() * 0.8)); if (G.match) G.match.world.resizeOverlay(); } slowAcc = 0; slowN = 0; } }
  var m = G.match;
  try { frameBody(dtR, m); } catch (e) { if (errCount++ < 5) console.error('frame error', e); }
  try { gfx.render(tReal); } catch (e2) { if (errCount++ < 5) console.error('render error', e2); }
}
G.stepMatch = function (m, dtR) {
  var g = m.game, w = m.world;
  var run = !m.paused && !g.over;
  var dtS = run ? dtR * g.speed : 0;
  if (m.demo && m.demo.active && m.demo.pausedGame) dtS = 0;
  if (dtS > 0) { m.acc += dtS; var n = 0; while (m.acc >= 1 / 30 - 1e-9 && n < 8) { g.step(1 / 30); m.acc -= 1 / 30; n++; if (m.demo && m.demo.active) m.demo.tick(1 / 30); } if (n >= 8) m.acc = 0; }
  m.t += dtS; w.update(dtS, m.t);
  if (m.demo && m.demo.active) m.demo.frame(dtR);
  G.ui.update(dtR);
  if (g.over && !m.endShown) { m.endShown = true; }
};
function frameBody(dtR, m) {
  if (m) {
    var g = m.game, w = m.world;
    if (m.inMenu) {
      if (m.menuOrbit) { G.camCtl.gaz += dtR * 0.07; G.camCtl.az += dtR * 0.07; }
      if (m.bgBattle) {
        var bb = m.bgBattle; bb.timer -= dtR;
        if (bb.timer <= 0) { bb.timer = 3.2; var tys = ['worm', 'worm', 'trojan', 'ransom', 'packer', 'hotspot', 'worm', 'flooder']; for (var q = 0; q < 3; q++) g.spawnQ.push({ t: g.time + q * 0.8, type: tys[(bb.k++) % tys.length], ent: bb.k % 2 ? 'A' : 'B', hpMul: 1.4, wave: 0 }); }
        m.acc += dtR; var nn = 0; while (m.acc >= 1 / 30 && nn < 4) { g.step(1 / 30); m.acc -= 1 / 30; nn++; } if (nn >= 4) m.acc = 0;
        g.core = 100; g.towers.forEach(function (t) { t.hp = Math.min(t.maxhp, t.hp + 80 * dtR); });
      }
      m.t += dtR; w.update(dtR, m.t);
    } else {
      G.stepMatch(m, dtR);
    }
    G.camCtl.update(dtR); G.camCtl.shakeAmt = Math.max(0, G.camCtl.shakeAmt - dtR * 2);
    if (G.audio) G.audio.update(dtR, m);
  }
}
G.hideAllScreens = function () { var s = document.getElementById('screens'); s.innerHTML = ''; G.input.cancel(); };

G.boot = function () {
  canvas = document.getElementById('gl'); overlay = document.getElementById('ov');
  gfx.init(canvas); G.input.attach(canvas);
  G.camCtl.setDefault(G.MAPS[0]);
  G.updateUiScale();
  window.addEventListener('resize', function () { G.updateUiScale(); gfx.resize(); if (G.match) G.match.world.resizeOverlay(); });
  // 为了生成图标，需要一个场景；图标渲染使用独立场景
  var hash = location.hash.replace('#', '');
  var m = G.enterMenu(0);
  G.ui.build();
  document.getElementById('loading').remove();
  if (hash.indexOf('play') === 0) { G.startMatch(+hash.slice(4) || 0); }
  else if (G.screens) G.screens.title();
  G.booted = true;
  last = performance.now(); requestAnimationFrame(frame);
};
window.addEventListener('load', function () { setTimeout(G.boot, 30); });
})(window.G);
