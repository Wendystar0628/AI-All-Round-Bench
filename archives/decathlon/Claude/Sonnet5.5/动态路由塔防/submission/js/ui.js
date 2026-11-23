/* 战斗界面：顶栏、流量预报、部署栏、选中面板、确认面板、提示与横幅 */
(function (G) {
'use strict';
var gfx = G.gfx, K = G.K;
var ui = G.ui = { sel: null, hudBuilt: false };
function $(id) { return document.getElementById(id); }
function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function M() { return G.match; }
G.svg = {
  compute: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#ffd66b" stroke="#fff3c4" stroke-width="1"/></svg>',
  intel: '<svg viewBox="0 0 24 24"><path d="M12 2 21 12 12 22 3 12z" fill="none" stroke="#7fdcc4" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="#7fdcc4"/></svg>',
  core: '<svg viewBox="0 0 24 24"><path d="M12 2 20 6v6c0 5-3.5 8.5-8 10C7.5 20.5 4 17 4 12V6z" fill="rgba(80,230,140,.25)" stroke="#6dffb0" stroke-width="1.6"/><path d="M8 12l3 3 5-6" fill="none" stroke="#6dffb0" stroke-width="2"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="16" height="16"><rect x="5" y="4" width="5" height="16" fill="currentColor"/><rect x="14" y="4" width="5" height="16" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 4l14 8-14 8z" fill="currentColor"/></svg>',
  cam: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 8V4h4M21 8V4h-4M3 16v4h4M21 16v4h-4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2.4"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M8 4v16" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  isolator: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="13" fill="rgba(255,79,106,.2)" stroke="#ff6a7a" stroke-width="3"/><path d="M14 34 34 14" stroke="#ff6a7a" stroke-width="4"/><rect x="19" y="3" width="10" height="8" fill="#ffb066"/><rect x="19" y="37" width="10" height="8" fill="#ffb066"/></svg>',
  downgrade: '<svg viewBox="0 0 48 48"><path d="M6 36c8-18 28-18 36 0" fill="none" stroke="#ff9a3d" stroke-width="4" stroke-dasharray="7 5"/><path d="M24 12v18M16 24l8 8 8-8" fill="none" stroke="#ffd0a0" stroke-width="4"/></svg>',
  restore: '<svg viewBox="0 0 48 48"><path d="M10 24a14 14 0 1 1 4 10" fill="none" stroke="#6dffe9" stroke-width="4"/><path d="M6 36l5-12 11 6z" fill="#6dffe9"/><rect x="21" y="16" width="6" height="16" fill="#9dffef"/><rect x="16" y="21" width="16" height="6" fill="#9dffef"/></svg>'
};
G.bossIcon = function (t) { return G.models.icon('e:' + t, 96); };

ui.build = function () {
  if (ui.hudBuilt) return; ui.hudBuilt = true;
  var hud = $('hud');
  hud.innerHTML = [
    '<div id="topbar">',
    '<div class="stat" id="core"><div class="lb">中枢完整度 CORE INTEGRITY</div><div class="vl"><span id="coretx">100</span><small>%</small></div><div id="corebar"><div id="corefill"></div></div></div>',
    '<div class="res" id="res-c">' + G.svg.compute + '<div class="stat"><div class="lb">算力 COMPUTE</div><div class="vl" id="cv">0</div></div><div class="delta" id="cdl"></div></div>',
    '<div class="res" id="res-i">' + G.svg.intel + '<div class="stat"><div class="lb">情报 INTEL</div><div class="vl" id="iv">0</div></div></div>',
    '<div id="wavebox"><div class="stat"><div class="lb" id="wvlab">波次 WAVE</div><div class="wn"><span id="wn">0</span><small> / <span id="wt">0</span></small></div></div><div class="stat" style="flex:1"><div class="lb" id="wlab">部署时间</div><div class="vl" style="font-size:17px" id="wcd">--</div><div id="wavebar"><div id="wavefill"></div></div></div><button class="btn sm pri" id="btn-call" title="立即发起下一波（N）">发起下一波</button></div>',
    '<div id="speedbox"><button class="btn iconbtn" id="sp0" title="暂停 / 继续（空格）">' + G.svg.pause + '</button><button class="btn" id="sp1">1×</button><button class="btn" id="sp2">2×</button><button class="btn" id="sp3">3×</button></div>',
    '<button class="btn iconbtn" id="btn-cam" title="回到默认视角（H / Home）">' + G.svg.cam + '</button><button class="btn iconbtn" id="btn-codex" title="图鉴">' + G.svg.book + '</button><button class="btn iconbtn" id="btn-menu" title="菜单（Esc）">' + G.svg.menu + '</button>',
    '</div>',
    '<div id="forecast" class="panel"><div class="ph"><b>流量预报</b><span>FORECAST</span><span class="sp"></span><span class="tag" id="fc-tag"></span></div><div id="fc-body"></div></div>',
    '<div id="syslog" class="panel"><div class="ph"><b>系统日志</b><span>SYSLOG</span></div><div class="lines" id="loglines"></div></div>',
    '<div id="infopanel" class="panel hidden"></div>',
    '<div id="deck"><div class="grp panel" id="deck-t"><div class="gl">待部署 · DEPLOY</div></div><div class="grp panel" id="deck-i"><div class="gl">情报道具 · ITEMS</div></div></div>',
    '<div id="confirm" class="panel hidden"></div>',
    '<div id="bossbar" class="hidden"><div class="bn"><span id="bbname"></span><span id="bbph"></span></div><div class="bb"><i id="bbfill"></i><u id="bbsh"></u><b class="t1"></b><b class="t2"></b></div></div>',
    '<div id="pausetag" class="hidden" style="position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:12;padding:6px 26px;border:1px solid #ffb02e;background:rgba(40,28,6,.9);color:#ffe3a8;font-weight:700;letter-spacing:.3em">已暂停 · PAUSED</div>'
  ].join('');
  // 卡片
  var dt = $('deck-t'), di = $('deck-i');
  G.TOWER_ORDER.forEach(function (k, i) {
    var d = G.TOWERS[k], c = el('<div class="card" data-k="' + k + '"><div class="role" style="background:' + d.color + '"></div><span class="hk">' + (i + 1) + '</span><span class="rt" style="color:' + d.color + '">' + d.role + '</span><img class="ic" src="' + G.models.icon('t:' + k + ':1', 96) + '"><div class="nm">' + d.name + '</div><div class="cs">' + G.svg.compute.replace('<svg', '<svg width="13" height="13"') + d.cost + (d.nodeIntel ? '<i>+◈' + d.nodeIntel + '</i>' : '') + '</div></div>');
    c.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; e.preventDefault(); if (G.audio) G.audio.play('ui'); G.input.startDrag(k, e); });
    c.addEventListener('mouseenter', function (e) { ui.cardTip(k, c); if (G.audio) G.audio.play('hover'); }); c.addEventListener('mouseleave', function () { ui.hideTip(); });
    dt.appendChild(c);
  });
  G.ITEM_ORDER.forEach(function (k) {
    var d = G.ITEMS[k], c = el('<div class="card item" data-i="' + k + '"><div class="role" style="background:' + (k === 'restore' ? '#6dffe9' : '#f7c23d') + '"></div><span class="hk">' + d.hotkey + '</span><div class="ic" style="width:46px;height:46px;pointer-events:none">' + G.svg[k] + '</div><div class="nm" style="font-size:13px">' + d.name + '</div><div class="cs">' + (d.res === 'intel' ? '<i style="color:#7fdcc4;font-style:normal">◈ ' + d.cost + '</i>' : G.svg.compute.replace('<svg', '<svg width="13" height="13"') + d.cost) + '</div><div class="cdm hidden"></div></div>');
    c.addEventListener('pointerdown', function (e) { if (e.button !== 0) return; e.preventDefault(); if (G.audio) G.audio.play('ui'); G.input.armItem(k); });
    c.addEventListener('mouseenter', function () { ui.itemTip(k, c); if (G.audio) G.audio.play('hover'); }); c.addEventListener('mouseleave', function () { ui.hideTip(); });
    di.appendChild(c);
  });
  ['forecast', 'syslog'].forEach(function (id) { var pn = $(id), hd = pn.querySelector('.ph'); hd.style.cursor = 'pointer'; hd.title = '点击折叠 / 展开'; var ar = document.createElement('span'); ar.textContent = '▾'; ar.style.marginLeft = 'auto'; ar.style.color = '#c6b791'; hd.appendChild(ar); hd.onclick = function () { var c = pn.classList.toggle('collapsed'); ar.textContent = c ? '▸' : '▾'; if (G.audio) G.audio.play('ui'); }; });
  $('sp0').onclick = function () { ui.togglePause(); }; $('sp1').onclick = function () { ui.setSpeed(1); }; $('sp2').onclick = function () { ui.setSpeed(2); }; $('sp3').onclick = function () { ui.setSpeed(3); };
  $('btn-cam').onclick = function () { G.camCtl.userMoved = false; G.camCtl.reset(); }; $('btn-menu').onclick = function () { G.screens.pause(); };
  $('btn-codex').onclick = function () { G.screens.codex('game'); }; $('btn-call').onclick = function () { ui.callWave(); };
  // 提示/横幅/吐司 容器
  if (!$('tip')) { document.body.appendChild(el('<div id="tip" class="hidden"></div>')); document.body.appendChild(el('<div id="toasts"></div>')); document.body.appendChild(el('<div id="banner"></div>')); document.body.appendChild(el('<div id="dragghost" class="hidden"><img></div>')); }
};
ui.bind = function (match) {
  ui.m = match; ui.sel = null; ui.lastWave = -1; ui.lastFc = ''; $('loglines').innerHTML = ''; $('infopanel').classList.add('hidden');
  ui.seenBanner = {}; ui.pauseTag();
  var g = match.game;
  $('wt').textContent = g.map.waves.length; $('wvlab').textContent = g.map.name + ' · 波次';
  g.on(ui.onEvent);
  ui.setSpeed(1); ui.refreshCards(); ui.fcRender(true);
};

// ---------- 事件 → 提示 ----------
function routeText(g, id) { var en = g.routes[id]; var z = g.routeZones(en.route); var ex = g.exits[en.exit]; return en.id + '（' + en.name + '）→ ' + (z.slice(0, -1).join(' → ') || '直达') + ' → ' + (ex ? ex.name : '?'); }
ui.onEvent = function (type, d) {
  var m = M(); if (!m) return; var g = m.game;
  if (type === 'log') { ui.logLine(d); return; }
  if (type === 'toast') ui.toast(d.text, d.lvl);
  else if (type === 'wave') {
    ui.fcRender(true);
    var info = d.boss ? 'Boss 来袭' : (d.rush ? '洪峰 · 三个入口同时大量出兵' : '来自各入口的威胁正在逼近');
    ui.banner(d.rush || d.boss ? 'WARNING' : 'INCOMING', '第 ' + d.n + ' 波' + (d.boss ? ' · BOSS' : '') + (d.rush ? ' · 洪峰' : ''), info, d.rush || d.boss);
    d.newTypes.forEach(function (t, i) { if (t.indexOf('boss') === 0) return; G.after(function () { ui.banner('NEW THREAT', '新威胁：' + G.ENEMIES[t].name, G.ENEMIES[t].brief.split('；')[0].slice(0, 70), false, G.models.icon('e:' + t, 96)); }, 1900 + i * 3300); });
  } else if (type === 'bossIntro') ui.banner('BOSS', d.e.def.name, d.e.def.en + ' · ' + d.e.def.brief.split('。')[0], true, G.models.icon('e:' + d.e.type, 96));
  else if (type === 'bossPhase') ui.banner('PHASE', d.e.def.name + ' · ' + d.name, '阶段变化：留意地面预警', true);
  else if (type === 'reroute') {
    if (d.changed.length && d.reason !== 'hazardEnd') {
      var lines = d.changed.map(function (id) { return routeText(g, id); });
      ui.toast('路线改变：' + lines.join('；'), 'warn', 3600);
    }
  } else if (type === 'waveClear') ui.toast('第 ' + d.n + ' 波肃清：算力 +' + d.c + ' / 情报 +' + d.i, 'ok');
  else if (type === 'towerDestroyed') ui.toast(G.towerTitle(d.tw) + ' 被摧毁' + (d.tw.onNode ? '：节点旁路直通' : ''), 'bad');
  else if (type === 'built' || type === 'upgraded' || type === 'sold') ui.refreshCards();
  else if (type === 'end') { if (!m.demo) G.after(function () { if (G.match === m) G.screens.result(g); }, d.win ? 1800 : 1400); }
  else if (type === 'encrypt') { }
};
ui.logLine = function (rec) {
  var box = $('loglines'); if (!box) return;
  var d = document.createElement('div'); d.className = 'l ' + rec.lvl; d.innerHTML = '<i>' + G.fmtTime(rec.t) + '</i>' + rec.text.replace(/</g, '&lt;'); box.appendChild(d);
  while (box.children.length > 7) box.removeChild(box.firstChild);
};
ui.toast = function (text, lvl, ms) {
  var box = $('toasts'); if (!box) return;
  var d = document.createElement('div'); d.className = 'toast ' + (lvl || ''); d.textContent = text; box.appendChild(d);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  G.after(function () { d.style.transition = 'opacity .4s'; d.style.opacity = 0; G.after(function () { d.remove(); }, 450); }, ms || 2600);
};
ui.banner = function (t1, t2, t3, bad, icon) {
  var b = $('banner'); if (!b) return;
  var d = document.createElement('div'); d.className = 'bn' + (bad ? ' bad' : '');
  d.innerHTML = (icon ? '<img src="' + icon + '" style="width:74px;height:70px;object-fit:contain;margin-bottom:-6px">' : '') + '<div class="t1">' + t1 + '</div><div class="t2">' + t2 + '</div><div class="t3">' + (t3 || '') + '</div>';
  b.innerHTML = ''; b.appendChild(d); G.after(function () { if (d.parentNode) d.remove(); }, 3300);
};
ui.setTip = function (text, lvl, x, y) {
  var t = $('tip'); if (!t) return; t.className = lvl || ''; t.innerHTML = text.replace(/</g, '&lt;'); t.classList.remove('hidden');
  var z = G.uiz || 1, w = t.offsetWidth * z, h = t.offsetHeight * z, px = Math.min(window.innerWidth - w - 10, x + 20), py = y + 22; if (py + h > window.innerHeight - 150 * z) py = y - h - 18; t.style.left = (px / z) + 'px'; t.style.top = (py / z) + 'px';
};
ui.hideTip = function () { var t = $('tip'); if (t) t.classList.add('hidden'); };
ui.hoverInfo = function (ti, cx, cy) {
  var m = M(); if (!m || m.demo && m.demo.active) { ui.hideTip(); return; } var g = m.game, w = m.world;
  var en = w.enemyAt(cx, cy);
  if (en) { ui.setTip(en.def.name + '  生命 ' + Math.ceil(en.hp) + '/' + Math.ceil(en.maxhp) + (en.shield > 0 ? '  护盾 ' + Math.ceil(en.shield) : '') + (en.disguised && !en.revealed ? '\n伪装中：显形前不能被远程单体攻击选中' : ''), 'info', cx, cy); return; }
  var tw = g.towerAt[ti], k = g.kind[ti], txt = '';
  if (tw) txt = G.towerTitle(tw) + '  ' + Math.ceil(tw.hp) + '/' + tw.maxhp;
  else if (k === K.NODE) {
    txt = '交换节点 · ' + g.nodeName(ti) + (g.blocked[ti] & 1 ? '（已隔离）' : (g.nodeCd[ti] > 0 ? '（重启中 ' + Math.ceil(g.nodeCd[ti]) + 's）' : '（直通）'));
    if (!(g.blocked[ti] & 1)) {
      var pv = g.preview({ block: [ti] });
      if (!pv.ok) txt += '\n隔离会封死入口：不可操作';
      else txt += '\n若隔离：' + g.entrances.map(function (en) { var r = pv.routes[en.id]; return en.id + (r.changed ? ' 改道 ' + (r.deltaCost >= 0 ? '+' : '') + r.deltaCost.toFixed(1) : ' 不变'); }).join(' · ');
    }
  }
  else if (k === K.IN) { var e = g.entranceAt(ti); txt = '入口 ' + e.id + ' · ' + e.name + '\n默认路线 → ' + g.exits[e.exit].name; }
  else if (k === K.OUT) txt = '出口 · ' + g.exits[g.sub[ti]].name;
  else if (k === K.OLD || g.tempOld[ti] > 0) txt = '旧链路：地面敌人减速，木马显形';
  if (txt) ui.setTip(txt, 'info', cx, cy); else ui.hideTip();
};
ui.cardTip = function (k, c) {
  var d = G.TOWERS[k], r = c.getBoundingClientRect(), st = G.towerStats(k, 1);
  var hp = '耐久 ' + st.hp + (st.block ? ' · 阻挡 ' + st.block : '');
  ui.setTip('【' + d.role + '】' + d.name + '\n' + d.brief + '\n' + hp + '\n拖到地图部署；点击也可选中后再点地图（右键取消）', 'info', r.left, r.top - 130);
};
ui.itemTip = function (k, c) { var d = G.ITEMS[k], r = c.getBoundingClientRect(); ui.setTip(d.name + '（' + d.hotkey + '）\n' + d.brief + '\n消耗 ' + (d.res === 'intel' ? '情报 ' : '算力 ') + d.cost + ' · 使用间隔 ' + d.cd + ' 秒' + (d.ttl ? ' · 持续 ' + d.ttl + ' 秒' : ''), 'info', r.left, r.top - 120); };
ui.dragGhost = function (x, y, def) {
  var g = $('dragghost'); if (!g) return;
  if (!def) { g.classList.add('hidden'); return; }
  g.classList.remove('hidden'); g.style.left = x + 'px'; g.style.top = y + 'px'; g.firstChild.src = G.models.icon('t:' + def.id + ':1', 96);
};

// ---------- 速度 / 暂停 ----------
ui.setSpeed = function (s) { var m = M(); if (!m) return; m.game.speed = s; ['sp1', 'sp2', 'sp3'].forEach(function (id, i) { $(id).classList.toggle('on', i + 1 === s); }); if (G.audio) G.audio.play('ui'); };
ui.cycleSpeed = function () { var m = M(); ui.setSpeed(m.game.speed % 3 + 1); };
ui.togglePause = function () { var m = M(); if (!m || m.game.over) return; m.paused = !m.paused; ui.pauseTag(); if (G.audio) G.audio.play('ui'); };
ui.pauseTag = function () { var m = M(); var p = m && m.paused; $('pausetag').classList.toggle('hidden', !p); $('sp0').classList.toggle('on', !!p); $('sp0').innerHTML = p ? G.svg.play : G.svg.pause; };
ui.escape = function () { var m = M(); if (!m || m.inMenu) { if (document.querySelector('#screens .dlg, #screens .codex')) { G.screens.title(); } return; } if (document.querySelector('#screens .report')) return; if (document.querySelector('#screens .screen')) { G.screens.close(); return; } if (m.world.sel) { m.world.setSelection(null); ui.select(null); return; } G.screens.pause(); };
ui.callWave = function () { var m = M(); if (!m || m.game.over) return; var ok = m.game.callNextWave(); if (ok && G.audio) G.audio.play('ui'); };

// ---------- 部署栏 ----------
ui.refreshCards = function () {
  var m = M(); if (!m) return; var g = m.game, inp = G.input;
  var cards = document.querySelectorAll('#deck .card[data-k]');
  for (var i = 0; i < cards.length; i++) { var c = cards[i], k = c.dataset.k, d = G.TOWERS[k]; var afford = g.compute >= d.cost; c.classList.toggle('dis', !afford); c.classList.toggle('armed', inp.armed === k); }
  var its = document.querySelectorAll('#deck .card[data-i]');
  for (var j = 0; j < its.length; j++) {
    var ic = its[j], id = ic.dataset.i, it = G.ITEMS[id], aff = it.res === 'intel' ? g.intel >= it.cost : g.compute >= it.cost, cd = g.itemCd[id];
    ic.classList.toggle('dis', !aff); ic.classList.toggle('armed', inp.item === id);
    var mk = ic.querySelector('.cdm'); if (cd > 0) { mk.classList.remove('hidden'); mk.textContent = Math.ceil(cd); } else mk.classList.add('hidden');
  }
};

// ---------- 预报 ----------
ui.fcRender = function (force) {
  var m = M(); if (!m) return; var g = m.game, idx = g.waveIdx, total = g.map.waves.length;
  var key = idx + '|' + g.enemies.length; if (!force && ui.lastFc === idx + '') return; ui.lastFc = idx + '';
  var body = $('fc-body'), html = '';
  var fc = g.forecast(idx), rush = g.isRush(idx + 1), boss = idx + 1 === total;
  $('fc-tag').innerHTML = idx < total ? '<span class="' + (rush || boss ? 'rushtag' : '') + '">第 ' + (idx + 1) + ' 波' + (rush ? ' · 洪峰' : '') + (boss ? ' · BOSS' : '') + '</span>' : '全部来袭';
  if (!fc) { body.innerHTML = '<div class="fc-next">所有波次已经来袭。肃清场上威胁即可胜利。</div>'; return; }
  g.entrances.forEach(function (en) {
    var items = fc[en.id] || {}, chips = '';
    G.ENEMY_ORDER.forEach(function (t) { if (items[t]) { var isnew = !g.seen[t]; chips += '<span class="chip' + (isnew ? ' new' : '') + '" title="' + G.ENEMIES[t].name + (isnew ? '（首次出现）' : '') + '"><img src="' + G.models.icon('e:' + t, 48) + '">×' + items[t] + '</span>'; } });
    var ex = g.exits[en.exit];
    html += '<div class="row"><div class="badge" style="background:' + en.color + '">' + en.id + '</div><div style="flex:1"><div class="en">' + en.name + '<small>→ ' + (ex ? ex.name : '?') + '</small></div><div class="chips">' + (chips || '<span style="color:#968e7e;font-size:12px">本波无来袭</span>') + '</div></div></div>';
  });
  var nx = g.forecast(idx + 1);
  if (nx) { var sum = 0, t2 = {}; for (var id in nx) for (var t in nx[id]) { sum += nx[id][t]; t2[t] = 1; } html += '<div class="fc-next">再下一波：共 ' + sum + ' 个 · ' + Object.keys(t2).map(function (t) { return G.ENEMIES[t].name; }).join('、') + '</div>'; }
  body.innerHTML = html;
};

// ---------- 选中面板 ----------
ui.select = function (type, obj) {
  if (!type) { ui.sel = null; $('infopanel').classList.add('hidden'); ui.hideTip(); return; }
  ui.sel = { type: type, obj: obj }; ui.panelDirty = true; ui.renderPanel(true);
};
function chipSt(name, col) { return '<span class="st" style="color:' + col + '">' + name + '</span>'; }
function spd(n) { return n.toFixed(1); }
ui.towerKV = function (tw, st) {
  var g = M().game, kv = [];
  var add = function (a, b) { kv.push('<span>' + a + '</span><span>' + b + '</span>'); };
  switch (tw.kind) {
    case 'firewall': add('阻挡容量', g.blockUsed(tw) + ' / ' + st.block); add('还击', st.dmg + ' / ' + st.rate + ' 秒 (' + (st.dmg / st.rate).toFixed(0) + ' DPS)'); add('节点部署', tw.onNode ? '隔离中 · 拦截相邻链路' : '链路拦截'); break;
    case 'honeypot': add('阻挡容量', st.block); add('诱导半径', st.lure + ' 格'); add('诱捕', st.trapDur + ' 秒 / 冷却 ' + st.trapCd + ' 秒'); if (st.trace) add('溯源伤害', st.trace + ' /秒 + 显形'); if (st.blast) add('引爆', st.blast + ' 伤害 · 半径 ' + st.blastR); add('加密', '免疫'); break;
    case 'airgap': add('耐久', st.hp); add('减伤', Math.round((st.armor || 0) * 100) + '%'); add('作用', '隔离节点 · 不攻击'); break;
    case 'interceptor': add('单发伤害', st.dmg); add('射速', st.rate + ' 秒/发'); add('射程 / 扇面', st.range + ' 格 / ' + (st.arc * 2) + '°'); if (st.pierce) add('贯穿', '至多 ' + st.pierce + ' 个目标'); if (st.slow) add('压制', '减速 ' + Math.round(st.slow * 100) + '% · 对减速目标 +' + Math.round(st.bonus * 100) + '%'); add('朝向', Math.round(((tw.face * 180 / Math.PI) % 360 + 360) % 360) + '°（R 旋转）'); add('目标', '地面+飞行 · 优先离出口最近'); break;
    case 'sandbox': add('检测半径', st.detect + ' 格'); add('攻击', st.dmg + ' / ' + st.rate + ' 秒'); add('射程 / 溅射', st.range + ' / ' + st.splash + ' 格'); if (st.taint) add('污染', '+' + Math.round(st.taint * 100) + '% 受伤'); add('目标', '仅地面'); break;
    case 'repair': add('治疗', st.heal + ' /秒 · 同时 ' + st.targets + ' 座'); add('范围', st.range + ' 格'); add('冗余切换', '护盾 ' + st.skillShield + ' · 半径 ' + st.skillR + ' · 冷却 ' + st.skillCd + ' 秒'); break;
  }
  return kv.join('');
};
ui.renderPanel = function (full) {
  var m = M(); if (!m || !ui.sel) return; var g = m.game, s = ui.sel, p = $('infopanel');
  if (s.type === 'tower') {
    var tw = s.obj; if (tw.dead) { ui.select(null); return; }
    var d = G.TOWERS[tw.kind], st = G.towerStats(tw.kind, tw.level, tw.branch);
    var sts = ''; if (tw.encT > 0) sts += chipSt('加密 ' + tw.encT.toFixed(1) + 's', '#fb53c5'); if (tw.shield > 0) sts += chipSt('护盾 ' + Math.ceil(tw.shield), '#a9d6ea'); if (tw.hardenT > 0) sts += chipSt('硬化 ' + tw.hardenT.toFixed(0) + 's', '#ffb066'); if (tw.onNode) sts += chipSt('节点隔离中', '#f8ca56'); if (tw.kind === 'honeypot') sts += chipSt('免疫加密', '#b88be6');
    if (full || ui.panelDirty) {
      ui.panelDirty = false;
      var html = '<div class="ph"><b>设备</b><span>DEVICE</span><span class="sp"></span><span class="tag">ID ' + tw.id + '</span></div><div class="ip-body">';
      html += '<div class="ip-title"><img src="' + G.models.icon('t:' + tw.kind + ':' + tw.level + (tw.branch ? ':' + tw.branch : ''), 96) + '"><div><h3>' + G.towerTitle(tw) + '<span class="role-tag" style="color:' + d.color + '">' + d.role + '</span></h3><div class="sub">' + d.en + ' · LV ' + tw.level + (tw.branch ? ' · 分支 ' + tw.branch : '') + '</div></div></div>';
      html += '<div id="ip-hp"></div><div class="stt" id="ip-st"></div><div class="kv" id="ip-kv"></div>';
      html += '<div class="desc">' + d.brief + (tw.branch ? '<br><b>' + d.branches[tw.branch].name + '：</b>' + d.branches[tw.branch].desc : '') + (d.skill && tw.kind === 'firewall' ? '<br><b>技能「' + d.skill.name + '」：</b>' + d.skill.desc : '') + (tw.kind === 'honeypot' ? '<br><b>技能「诱捕」：</b>' + G.TOWERS.honeypot.skill.desc : '') + (tw.kind === 'repair' ? '<br><b>技能「冗余切换」：</b>' + G.TOWERS.repair.skill.desc : '') + '</div>';
      if (tw.onNode) { var pvu = g.preview({ unblock: [tw.idx] }); var lines = g.entrances.map(function (en) { var r = pvu.routes[en.id]; return '<div class="rt" style="font-size:12px;line-height:1.6"><b style="color:' + en.color + '">' + en.id + '</b> ' + (r.changed ? '恢复直通后改走 ' + (r.zones.slice(0, -1).join(' → ') || '直达') + '（路程 ' + (r.deltaCost >= 0 ? '+' : '') + r.deltaCost.toFixed(1) + '）' : '路线不变') + '</div>'; }).join(''); html += '<div class="desc" style="margin-top:8px"><b>撤下 / 被摧毁后「' + g.nodeName(tw.idx) + '」旁路直通：</b>' + lines + '</div>'; }
      html += '<div class="acts" id="ip-acts"></div></div>';
      p.innerHTML = html; p.classList.remove('hidden'); ui.buildTowerActs(tw);
    }
    $('ip-hp').innerHTML = '<div class="hpbar"><i style="width:' + (tw.hp / tw.maxhp * 100) + '%"></i>' + (tw.shield > 0 ? '<u style="width:' + Math.min(100, tw.shield / tw.maxhp * 100) + '%"></u>' : '') + '</div><div class="hptx"><span>耐久 HP</span><span>' + Math.ceil(tw.hp) + ' / ' + tw.maxhp + '</span></div>';
    $('ip-st').innerHTML = sts; $('ip-kv').innerHTML = ui.towerKV(tw, st); ui.updateTowerActs(tw);
  } else if (s.type === 'enemy') {
    var e = s.obj; if (e.dead) { ui.select(null); return; }
    var df = e.def;
    if (full || ui.panelDirty) {
      ui.panelDirty = false;
      p.innerHTML = '<div class="ph"><b>威胁档案</b><span>THREAT</span><span class="sp"></span><span class="tag">' + (df.boss ? 'BOSS' : (df.air ? '飞行' : '地面')) + '</span></div><div class="ip-body"><div class="ip-title"><img src="' + G.models.icon('e:' + e.type, 96) + '"><div><h3>' + df.name + '</h3><div class="sub">' + df.en + '</div></div></div><div id="ip-hp"></div><div class="stt" id="ip-st"></div><div class="kv" id="ip-kv"></div><div class="desc">' + df.brief + '</div><div class="tipline">应对：' + df.tip + '</div></div>';
      p.classList.remove('hidden');
    }
    $('ip-hp').innerHTML = '<div class="hpbar"><i style="width:' + (e.hp / e.maxhp * 100) + '%;background:#ff6b7a"></i>' + (e.shield > 0 ? '<u style="width:' + Math.min(100, e.shield / e.maxhp * 100 * (df.boss ? 1 : 4)) + '%"></u>' : '') + '</div><div class="hptx"><span>生命 HP</span><span>' + Math.ceil(e.hp) + ' / ' + Math.ceil(e.maxhp) + '</span></div>';
    var st2 = ''; if (e.shield > 0) st2 += chipSt('护盾 ' + Math.ceil(e.shield), '#a9d6ea'); if (e.slowT > 0) st2 += chipSt('减速', '#9fd6ea'); if (e.rootT > 0) st2 += chipSt('诱捕', '#b88be6'); if (e.taintT > 0) st2 += chipSt('污染', '#ffd43b'); if ((e.disguised || e.stealth) && e.revealed) st2 += chipSt('已显形', '#ffe066'); else if (e.disguised || e.stealth) st2 += chipSt('伪装 / 潜伏中', '#c7bca1'); if (e.bl) st2 += chipSt('被阻挡', '#ff8a4c'); if (e.mode === 'strike') st2 += chipSt('冲击节点', '#ff9f43'); if (e.armor) st2 += chipSt('护甲 ' + Math.round(e.armor * 100) + '%', '#c7bca1');
    $('ip-st').innerHTML = st2;
    var kv = '<span>入口</span><span>' + e.ent + '</span><span>移动速度</span><span>' + spd(df.speed) + ' 格/秒</span><span>阻挡占用</span><span>' + (df.block || '—（不被阻挡）') + '</span>';
    if (df.atk) kv += '<span>攻击</span><span>' + df.atk + ' / ' + df.atkRate + ' 秒' + (df.ranged ? ' · 射程 ' + df.range : '') + '</span>'; if (df.strike) kv += '<span>节点冲击</span><span>' + df.strike + ' / ' + df.strikeRate + ' 秒</span>'; if (df.payload) kv += '<span>载荷</span><span>' + df.payload + ' · 半径 ' + df.payloadR + '</span>'; if (df.aura) kv += '<span>护盾光环</span><span>' + df.shieldAmt + ' · 半径 ' + df.aura + '</span>';
    kv += '<span>到达出口</span><span>中枢 −' + df.coreDmg + '</span><span>击杀奖励</span><span>算力 ' + df.rewardC + (df.rewardI ? ' · 情报 ' + df.rewardI : '') + '</span>';
    $('ip-kv').innerHTML = kv;
  } else if (s.type === 'tile') {
    var ti = s.obj, kd = g.kind[ti], tn = G.TERRAIN[kd === K.ROAD ? 'road' : kd === K.OLD ? 'old' : kd === K.NODE ? 'node' : kd === K.PLAT ? 'plat' : kd === K.IN ? 'entrance' : kd === K.OUT ? 'exit' : kd === K.TUN ? 'tunnel' : 'obs'];
    var nm = tn.name, extra = '';
    if (kd === K.OBS) { var ch = g.sub[ti]; nm = ch === '~' ? '公网流' : (ch === '=' ? '气隙' : (ch === 'X' ? '数据设施' : '空白基板')); }
    if (kd === K.NODE) { nm += ' · ' + g.nodeName(ti); extra = '<div class="kv"><span>状态</span><span>' + (g.blocked[ti] & 1 ? '已隔离' : (g.nodeCd[ti] > 0 ? '重启 ' + Math.ceil(g.nodeCd[ti]) + 's' : '直通')) + '</span><span>隔离消耗</span><span>◈ ' + G.TOWERS.airgap.nodeIntel + '（网闸）/ ' + G.TOWERS.firewall.nodeIntel + '（防火墙）/ ' + G.ITEMS.isolator.cost + '（隔离器）</span></div>'; }
    if (kd === K.IN) { var en = g.entranceAt(ti); extra = '<div class="kv"><span>入口</span><span>' + en.id + ' · ' + en.name + '</span><span>当前路线</span><span style="text-align:left;font-size:12px">' + g.routeZones(en.route).join(' → ') + ' → ' + g.exits[en.exit].name + '</span><span>路程成本</span><span>' + en.cost.toFixed(1) + '</span></div>'; }
    if (kd === K.OUT) extra = '<div class="kv"><span>出口</span><span>' + g.exits[g.sub[ti]].name + '</span></div>';
    var z = g.zoneAt[ti]; if (z) extra = '<div class="kv"><span>区域</span><span>' + z.name + '</span></div>' + extra;
    if (g.tempOld[ti] > 0) extra += '<div class="stt">' + chipSt('协议降级 ' + Math.ceil(g.tempOld[ti]) + 's', '#ff9a3d') + '</div>';
    p.innerHTML = '<div class="ph"><b>地块</b><span>TILE</span><span class="sp"></span><span class="tag">(' + g.tx(ti) + ',' + g.ty(ti) + ')</span></div><div class="ip-body"><div class="ip-title"><div style="width:52px;height:52px;background:' + tn.color + ';border:1px solid var(--line)"></div><div><h3>' + nm + '</h3><div class="sub">' + (kd === K.PLAT ? '可部署：拦截器 / 沙箱 / 修复进程' : kd === K.NODE ? '可部署：防火墙 / 网闸 / 应急隔离器' : (g.isRoadKind(kd) && kd !== K.IN && kd !== K.OUT ? '可部署：防火墙 / 蜜罐' : '不可部署')) + '</div></div></div>' + extra + '<div class="desc">' + tn.desc + '</div></div>';
    p.classList.remove('hidden');
  }
};
ui.buildTowerActs = function (tw) {
  var g = M().game, d = G.TOWERS[tw.kind], box = $('ip-acts'), html = '';
  var ui2 = g.upgradeInfo(tw);
  if (!ui2.max) {
    if (ui2.branchRequired) { ui2.options.forEach(function (o) { html += '<button class="btn br" data-up="' + o.branch + '"><b>升级 Ⅱ · 分支' + o.branch + '：' + o.name + '</b><small>' + o.desc + '</small><small class="cst">算力 ' + o.c + ' · 情报 ' + o.i + '</small></button>'; }); }
    else { var o = ui2.options[0]; html += '<button class="btn br" data-up=""><b>升级 Ⅱ：' + o.name + '</b><small>' + ui.upDesc(tw) + '</small><small class="cst">算力 ' + o.c + '</small></button>'; }
  } else html += '<div class="cdline">已是最高等级</div>';
  if (tw.kind === 'firewall' || tw.kind === 'honeypot' || tw.kind === 'repair') { var sk = tw.kind === 'firewall' ? d.skill.name : (tw.kind === 'honeypot' ? '诱捕' : '冗余切换'); html += '<button class="btn warn" data-sk="1"><b>技能：' + sk + '</b><small class="skcd"></small></button>'; }
  html += '<div class="row">' + (tw.kind === 'interceptor' ? '<button class="btn" data-rot="-1" title="逆时针 45°（R 为顺时针）">↺ 朝向</button><button class="btn" data-rot="1">↻ 朝向</button>' : '') + '<button class="btn bad" data-sell="1"><b>撤下</b><small class="sv"></small></button></div>';
  box.innerHTML = html;
  box.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () { ui.doUpgrade(tw, b.dataset.up || null); }; });
  var sk2 = box.querySelector('[data-sk]'); if (sk2) sk2.onclick = function () { ui.doSkill(tw); };
  box.querySelectorAll('[data-rot]').forEach(function (b) { b.onclick = function () { tw.face += +b.dataset.rot * Math.PI / 4; M().world.refreshRange(); ui.panelDirty = true; if (G.audio) G.audio.play('ui'); }; });
  var sellBtn = box.querySelector('[data-sell]'); sellBtn.onclick = function () { M().world.clearPreview(); ui.doSell(tw); };
  if (tw.onNode) { sellBtn.onmouseenter = function () { var pv = g.preview({ unblock: [tw.idx] }); M().world.setPreview(pv); }; sellBtn.onmouseleave = function () { M().world.clearPreview(); }; }
};
ui.upDesc = function (tw) {
  var a = G.towerStats(tw.kind, 1), b = G.towerStats(tw.kind, 2);
  var t = []; ['hp', 'block', 'dmg', 'heal', 'range', 'detect', 'splash', 'targets', 'skillShield'].forEach(function (k) { if (b[k] != null && a[k] != null && b[k] !== a[k]) t.push({ hp: '耐久', block: '阻挡', dmg: '伤害', heal: '治疗', range: '范围', detect: '检测', splash: '溅射', targets: '目标数', skillShield: '护盾' }[k] + ' ' + a[k] + '→' + b[k]); });
  if (b.armor && !a.armor) t.push('减伤 ' + Math.round(b.armor * 100) + '%'); if (b.taint) t.push('命中使目标受伤 +' + Math.round(b.taint * 100) + '%'); if (b.skillCd && b.skillCd !== a.skillCd) t.push('技能冷却 ' + a.skillCd + '→' + b.skillCd + 's');
  return t.join('；');
};
ui.updateTowerActs = function (tw) {
  var g = M().game, box = $('ip-acts'); if (!box) return;
  var sk = box.querySelector('.skcd'); if (sk) { var cs = g.canSkill(tw); sk.textContent = tw.encT > 0 ? '已被加密，无法释放' : (tw.skillCd > 0 ? '冷却 ' + Math.ceil(tw.skillCd) + ' 秒' : '就绪'); box.querySelector('[data-sk]').classList.toggle('dis', !cs.ok); }
  var sv = box.querySelector('.sv'); var v = g.sellValue(tw); sv.textContent = '返还 算力 ' + v.c + (v.i ? ' / 情报 ' + v.i : '');
  box.querySelectorAll('[data-up]').forEach(function (b) { var o = g.upgradeInfo(tw).options.find(function (x) { return (x.branch || '') === (b.dataset.up || ''); }); if (!o) return; b.classList.toggle('dis', g.compute < o.c || g.intel < (o.i || 0)); });
};
ui.doUpgrade = function (tw, br) { var g = M().game, r = g.upgrade(tw, br); if (!r.ok) { ui.toast(r.msg, 'bad'); if (G.audio) G.audio.play('deny'); return; } ui.panelDirty = true; ui.renderPanel(true); ui.refreshCards(); M().world.refreshRange(); };
ui.doSkill = function (tw) { var g = M().game, r = g.useSkill(tw); if (!r.ok) { ui.toast(r.msg, 'bad'); if (G.audio) G.audio.play('deny'); } };
ui.doSell = function (tw) { var g = M().game; M().world.setSelection(null); ui.select(null); g.sell(tw); ui.refreshCards(); };
ui.quickUpgrade = function () { var s = ui.sel; if (!s || s.type !== 'tower') return; var d = G.TOWERS[s.obj.kind]; if (d.branches) { ui.toast('请在面板中选择升级分支', 'info'); return; } ui.doUpgrade(s.obj, null); };
ui.quickSkill = function () { var s = ui.sel; if (s && s.type === 'tower') ui.doSkill(s.obj); };
ui.quickSell = function () { var s = ui.sel; if (s && s.type === 'tower') ui.doSell(s.obj); };

// ---------- 确认面板 ----------
ui.showConfirm = function (info, ok, cancel) {
  var m = M(), g = m.game, d = G.TOWERS[info.kind], p = $('confirm'), pv = info.pv, rows = '';
  g.entrances.forEach(function (en) {
    var r = pv.routes[en.id], zs = r.zones.slice(0, -1).join(' → ') || '直达';
    rows += '<div class="rt"><i style="background:' + en.color + '"></i><b>入口 ' + en.id + '「' + en.name + '」</b>：' + (r.changed ? '<span style="color:#ffb02e">改道</span> → ' + zs + ' → ' + g.exits[r.exit].name + '（路程 ' + (r.deltaCost >= 0 ? '+' : '') + r.deltaCost.toFixed(1) + '）' : '<span style="color:#7dffb0">路线不变</span>') + '</div>';
  });
  p.innerHTML = '<div class="ph"><b>确认隔离节点</b><span>CONFIRM</span></div><div class="ip-body"><div class="desc"><b>' + d.name + '</b> → 隔离「' + g.nodeName(info.idx) + '」。场上敌人将从当前位置沿新路线转向。预览中虚线为新路线。</div>' + rows +
    '<div class="cdline">消耗：算力 ' + info.cost.c + ' · 情报 ' + info.cost.i + '　|　撤下后恢复直通，需等待 ' + G.NODE_CD + ' 秒才能再次隔离</div><div class="acts"><div class="row"><button class="btn pri" id="cf-ok">确认隔离 (Enter)</button><button class="btn" id="cf-no">取消 (Esc)</button></div></div></div>';
  p.classList.remove('hidden'); $('cf-ok').onclick = ok; $('cf-no').onclick = cancel;
};
ui.hideConfirm = function () { var p = $('confirm'); if (p) p.classList.add('hidden'); };

// ---------- 帧更新 ----------
ui.update = function (dt) {
  var m = M(); if (!m) return; var g = m.game;
  ui.acc = (ui.acc || 0) + dt;
  $('cv').textContent = Math.floor(g.compute); $('iv').textContent = Math.floor(g.intel);
  var cf = Math.max(0, g.core / g.coreMax * 100); $('coretx').textContent = Math.ceil(cf); $('core').classList.toggle('crit', cf < 30); var f = $('corefill'); f.style.width = cf + '%'; f.className = cf < 30 ? 'low' : (cf < 60 ? 'mid' : '');
  $('cdl').textContent = '+' + g.income.toFixed(1) + '/s';
  var idx = g.waveIdx, tot = g.map.waves.length; $('wn').textContent = idx;
  var alive = g.enemies.length + g.spawnQ.length;
  if (idx < tot && !g.autoWave) { $('wlab').textContent = '波次手动'; $('wcd').textContent = '场上 ' + alive; $('btn-call').classList.remove('dis'); $('wavefill').style.width = '0%'; }
  else if (idx < tot) { $('wlab').textContent = idx === 0 ? '部署时间 · 第 1 波将在' : '下一波倒计时'; $('wcd').textContent = Math.max(0, Math.ceil(g.nextWaveIn)) + ' 秒 · 场上 ' + alive; $('btn-call').classList.remove('dis'); $('wavefill').style.width = (1 - Math.min(1, g.nextWaveIn / (idx === 0 ? 24 : 26)) ) * 100 + '%'; }
  else { $('wlab').textContent = '全部来袭 · 肃清威胁'; $('wcd').textContent = '场上剩余 ' + alive; $('btn-call').classList.add('dis'); $('wavefill').style.width = '100%'; }
  var bs = null; for (var bi = 0; bi < g.enemies.length; bi++) if (g.enemies[bi].def.boss && !g.enemies[bi].dead) { bs = g.enemies[bi]; break; }
  var bb = $('bossbar');
  if (bs) {
    bb.classList.remove('hidden'); $('bbname').textContent = bs.def.name + ' · ' + bs.def.en;
    var phn = bs.type === 'boss3' ? ['潜伏', '提权', '破坏'][bs.phase - 1] : (bs.phase > 1 ? (bs.type === 'boss1' ? '僵尸网络释放' : '路由风暴') : '第一阶段'); $('bbph').textContent = phn;
    $('bbfill').style.width = Math.max(0, bs.hp / bs.maxhp * 100) + '%'; $('bbsh').style.width = Math.min(100, bs.shield / bs.maxhp * 100) + '%'; bb.style.setProperty('--bc', bs.def.color);
  } else bb.classList.add('hidden');
  if (idx !== ui.lastWave) { ui.lastWave = idx; ui.fcRender(true); }
  if (ui.acc > 0.12) {
    ui.acc = 0; ui.refreshCards(); if (ui.sel) ui.renderPanel(false); ui.fcRender(false);
  }
};
})(window.G = window.G || {});
