/* 全屏页面：标题、关卡选择、实战演示列表、图鉴、设置、操作说明、暂停、事件报告 */
(function (G) {
'use strict';
var gfx = G.gfx, K = G.K, scr = G.screens = {};
function $(id) { return document.getElementById(id); }
function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
function root() { return $('screens'); }
function show(node) { var r = root(); r.innerHTML = ''; r.appendChild(node); if (G.audio) G.audio.play('page'); return node; }
function btn(txt, cls, fn) { var b = el('<button class="btn ' + (cls || '') + '">' + txt + '</button>'); b.onclick = function () { if (G.audio) G.audio.play('ui'); fn(); }; return b; }
function M() { return G.match; }

// ---------- 标题 ----------
scr.title = function () {
  var m = M(); if (m) m.inMenu = true; $('hud').classList.add('hidden');
  var n = el('<div class="screen dim"><div class="title-wrap"><div class="logo-sm">// 汐域自治域 · 守护进程 v5.1 //</div><h1 class="logo"><span>网络安全攻防战</span></h1><div class="tagline">动 态 路 由 塔 防 · DYNAMIC ROUTING DEFENSE</div><div class="menu-col" id="mc"></div></div><div class="foot">事件代号「蛰影」 · 请守护进程接管网络 · 中键拖动环绕 · Shift+中键平移 · 滚轮缩放</div></div>');
  var mc = n.querySelector('#mc');
  mc.appendChild(btn('开始行动', 'pri', function () { scr.select(); }));
  mc.appendChild(btn('实战演示', '', function () { scr.demos(); }));
  mc.appendChild(btn('图鉴 · 设备手册 / 威胁档案', '', function () { scr.codex('title'); }));
  mc.appendChild(btn('设置', '', function () { scr.settings('title'); }));
  mc.appendChild(btn('操作说明', '', function () { scr.help('title'); }));
  show(n);
  if (G.audio) G.audio.setTheme('enterprise', true);
};

// ---------- 小地图 ----------
function drawMini(cv, game) {
  var W = game.W, H = game.H, s = Math.floor(Math.min(cv.width / W, cv.height / H)), ox = (cv.width - s * W) / 2, oy = (cv.height - s * H) / 2, ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  var th = G.THEMES[game.map.theme];
  for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
    var i = y * W + x, k = game.kind[i], c = '#172320', ch = game.sub[i];
    if (k === K.OBS) c = ch === '~' ? '#1f9e92' : (ch === '=' ? '#6a58a6' : (ch === 'X' ? '#2a443d' : '#0e1816'));
    else if (k === K.PLAT) c = '#5c7a6c'; else if (k === K.OLD) c = '#b8742c'; else if (game.isRoadKind(k)) c = '#29463f';
    ctx.fillStyle = c; ctx.fillRect(ox + x * s, oy + y * s, s - 1, s - 1);
  }
  game.entrances.forEach(function (en) {
    ctx.strokeStyle = en.color; ctx.lineWidth = Math.max(2, s * 0.22); ctx.globalAlpha = 0.85; ctx.beginPath();
    en.route.forEach(function (t, i) { var px = ox + (game.tx(t) + 0.5) * s, py = oy + (game.ty(t) + 0.5) * s; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }); ctx.stroke(); ctx.globalAlpha = 1;
  });
  game.nodes.forEach(function (i) { ctx.fillStyle = '#6dffb0'; ctx.beginPath(); ctx.arc(ox + (game.tx(i) + 0.5) * s, oy + (game.ty(i) + 0.5) * s, s * 0.34, 0, 7); ctx.fill(); });
  game.entrances.forEach(function (en) { ctx.fillStyle = en.color; ctx.fillRect(ox + en.x * s, oy + en.y * s, s - 1, s - 1); ctx.fillStyle = '#021'; ctx.font = 'bold ' + Math.floor(s * 0.8) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(en.id, ox + (en.x + 0.5) * s, oy + (en.y + 0.8) * s); });
  Object.keys(game.exits).forEach(function (id) { var e = game.exits[id]; ctx.fillStyle = '#ff5d6c'; ctx.fillRect(ox + e.x * s, oy + e.y * s, s - 1, s - 1); ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.floor(s * 0.8) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(game.map.theme === 'enterprise' ? '核' : (id === '1' ? 'X' : 'Y'), ox + (e.x + 0.5) * s, oy + (e.y + 0.8) * s); });
}
var MAP_TEXT = [
  '企业内网：入口 A「门户网站」与 B「邮件网关」经 DMZ 接入，办公网段与业务网段由 DMZ 互联和一段旧链路相连。隔离边界节点让 A、B 汇流；隔离核心前节点，流量被迫绕上两侧外环。',
  '跨网骨干：公网流横贯战场，专线隧道与旧专线是仅有的两个跨越点。C、B 平时经旧专线汇流到机房 Y；隔离汇聚节点会把它们导向机房 X，与互联网 A 交战。',
  '工控网络：入口围绕中央气隙，运维环环绕气隙连通南北，老工控总线是较慢的支路。隔离环上的不同节点，让入侵在东西两条窄通道间转移——过程控制核心与安全联锁核心相互牵制。'
];
var MAP_SEEN = [['蠕虫', '木马', '洪泛团', '勒索者', '加壳器', 'Boss 万傀'], ['洪峰 ×1', '旧专线', '公网流', '伪热点', 'Boss 蜃楼'], ['洪峰 ×1', '气隙', '老工控总线', '双核心', 'Boss 蛰影']];
scr.select = function () {
  var m = M(); if (m) m.inMenu = true; $('hud').classList.add('hidden');
  var n = el('<div class="screen dim"><div class="scr-in"><div class="hdr"><h2>关卡选择 · LEVEL SELECT</h2><span class="sp"></span></div><div class="maps" id="maps"></div></div></div>');
  var hd = n.querySelector('.hdr');
  var dbox = el('<div style="display:flex;gap:6px;align-items:center;margin-right:14px"><span style="color:var(--dim);font-size:14px;margin-right:4px">难度</span></div>');
  G.DIFF.forEach(function (d, i) { var b = btn(d.name, 'sm' + ((G.settings.difficulty || 0) === i ? ' on' : ''), function () { G.settings.difficulty = i; G.saveSettings(); dbox.querySelectorAll('.btn').forEach(function (x, k) { x.classList.toggle('on', k === i); }); dtxt.textContent = d.desc; }); dbox.appendChild(b); });
  var dtxt = el('<span style="color:var(--dim);font-size:13px;margin-left:8px">' + G.DIFF[G.settings.difficulty || 0].desc + '</span>'); dbox.appendChild(dtxt);
  hd.appendChild(dbox); hd.appendChild(btn('返回', '', function () { scr.title(); }));
  var box = n.querySelector('#maps');
  G.MAPS.forEach(function (mp, i) {
    var game = new G.Game(i), best = G.settings.best[mp.id];
    var c = el('<div class="mapcard panel"><canvas width="380" height="215"></canvas><div class="mb"><h3>' + mp.name + '</h3><div class="sb">' + mp.sub + ' · ' + mp.boss.toUpperCase().replace('BOSS', 'BOSS ') + '</div><p>' + MAP_TEXT[i] + '</p><div class="meta">' + game.nodes.length + ' 个交换节点 · ' + game.entrances.length + ' 个入口 · ' + Object.keys(game.exits).length + ' 个出口</div><div class="meta">' + MAP_SEEN[i].map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div><div class="best">' + (best ? '最佳：评级 ' + best.grade + ' · 中枢 ' + best.core + '% · ' + G.fmtTime(best.time) : '尚无通关记录') + '</div></div></div>');
    drawMini(c.querySelector('canvas'), game);
    var go = btn('进入战场', 'pri', function () { G.curtain(function () { G.hideAllScreens(); G.startMatch(i); }); });
    c.querySelector('.mb').appendChild(go);
    c.onclick = function (e) { if (e.target === go) return; go.click(); };
    c.addEventListener('mouseenter', function () { if (G.audio) G.audio.play('hover'); });
    box.appendChild(c);
  });
  show(n);
};
scr.demos = function () {
  var m = M(); if (m) m.inMenu = true; $('hud').classList.add('hidden');
  var n = el('<div class="screen dim"><div class="scr-in"><div class="hdr"><h2>实战演示 · LIVE DEMOS</h2><span class="sp"></span></div><div class="demos" id="ds"></div><div style="margin-top:18px;color:var(--dim);text-align:center;font-size:14px">演示在游戏自身的逻辑上实时进行，关键步骤配字幕；随时可点击「退出演示」或按 Esc。</div></div></div>');
  n.querySelector('.hdr').appendChild(btn('返回', '', function () { scr.title(); }));
  var ds = n.querySelector('#ds');
  (G.DEMOS || []).forEach(function (d, i) {
    var c = el('<div class="democ panel"><div class="n">0' + (i + 1) + '</div><h3>' + d.name + '</h3><div class="mp">' + G.MAPS[d.map].name + (d.sub ? ' · ' + d.sub : '') + '</div><p>' + d.desc + '</p></div>');
    var go = btn('播放演示', 'pri', function () { G.demo.start(i); }); go.style.marginTop = '14px'; c.appendChild(go); c.onclick = function (e) { if (e.target !== go) go.click(); }; ds.appendChild(c);
  });
  show(n);
};

// ---------- 设置 / 帮助 ----------
scr.settings = function (from) {
  var S = G.settings;
  var n = el('<div class="screen dim"><div class="dlg panel"><div class="ph"><b>设置</b><span>SETTINGS</span></div><div class="ip-body"><div class="srow"><label>主音量</label><input type="range" min="0" max="100" id="s1"><span class="v" id="v1"></span></div><div class="srow"><label>音乐</label><input type="range" min="0" max="100" id="s2"><span class="v" id="v2"></span></div><div class="srow"><label>音效</label><input type="range" min="0" max="100" id="s3"><span class="v" id="v3"></span></div><div class="srow"><label>静音</label><button class="btn sm" id="smute"></button></div><div class="srow"><label>节点名称</label><button class="btn sm" id="snn"></button></div><div class="srow" style="justify-content:flex-end" id="sb"></div></div></div></div>');
  var up = function () { ['1', '2', '3'].forEach(function (k, i) { var key = ['master', 'music', 'sfx'][i]; n.querySelector('#s' + k).value = Math.round(S[key] * 100); n.querySelector('#v' + k).textContent = Math.round(S[key] * 100); }); n.querySelector('#smute').textContent = S.mute ? '已静音（点击取消）' : '声音开启（点击静音）'; n.querySelector('#snn').textContent = S.nodeNames ? '常驻显示' : '悬停显示'; };
  ['1', '2', '3'].forEach(function (k, i) { n.querySelector('#s' + k).oninput = function (e) { S[['master', 'music', 'sfx'][i]] = e.target.value / 100; up(); if (G.audio) G.audio.applyVolumes(); G.saveSettings(); }; });
  n.querySelector('#smute').onclick = function () { S.mute = !S.mute; up(); if (G.audio) { G.audio.applyVolumes(); G.audio.play('ui'); } G.saveSettings(); };
  n.querySelector('#snn').onclick = function () { S.nodeNames = !S.nodeNames; if (M()) M().world.showNodeNames = S.nodeNames; up(); G.saveSettings(); };
  n.querySelector('#sb').appendChild(btn('返回', 'pri', function () { back(from); }));
  up(); show(n);
};
function back(from) { if (from === 'title') scr.title(); else if (from === 'pause') scr.pause(); else if (from === 'select') scr.select(); else scr.close(); }
var _codexOrig;
scr.help = function (from) {
  var n = el('<div class="screen dim"><div class="dlg panel" style="width:760px"><div class="ph"><b>操作说明</b><span>HOW TO PLAY</span></div><div class="ip-body"><div class="help-grid">' +
    '<div class="k">镜头</div><div><kbd>鼠标中键</kbd> 拖动环绕 · <kbd>Shift</kbd>+<kbd>中键</kbd> 平移 · <kbd>滚轮</kbd> 缩放 · <kbd>H</kbd>/<kbd>Home</kbd> 回到默认视角（左键只用于点选和拖放部署）</div>' +
    '<div class="k">部署</div><div>把底部卡片<b>拖到地图</b>上部署，拖动时预览作用范围；也可点击卡片后再点地图。防火墙 / 蜜罐放在链路，网闸只能放在交换节点，防火墙也可放在节点上，拦截器 / 沙箱 / 修复进程放在设备平台。</div>' +
    '<div class="k">拦截器朝向</div><div>放下后移动鼠标设定朝向（8 个方向），点击确认；<kbd>R</kbd> 旋转 45°；确认前 <kbd>右键</kbd> / <kbd>Esc</kbd> 取消。</div>' +
    '<div class="k">隔离节点</div><div>把防火墙或网闸放到交换节点上会<b>截断道路</b>，拖动时即可预览各入口的新路线（虚线），确认后敌人从当前位置掉头。撤下 / 被摧毁后节点恢复直通，并需等待片刻才能再次隔离。会封死入口的操作会被拒绝，且不消耗资源。</div>' +
    '<div class="k">选中</div><div>左键点击塔、敌人或地块查看说明；塔可升级（拦截器、蜜罐在 2 级时二选一分支）、释放技能、撤下。</div>' +
    '<div class="k">道具</div><div><kbd>Q</kbd> 应急隔离器 · <kbd>W</kbd> 协议降级 · <kbd>E</kbd> 备份还原。移动鼠标可见影响范围与路线预览，点击确认投放。</div>' +
    '<div class="k">快捷键</div><div><kbd>1</kbd>–<kbd>6</kbd> 选择塔 · <kbd>空格</kbd> 暂停 · <kbd>Tab</kbd> 切换速度 · <kbd>N</kbd> 发起下一波 · <kbd>Z</kbd> 区域名称常驻 · <kbd>U</kbd> 升级 · <kbd>F</kbd> 技能 · <kbd>Delete</kbd> 撤下 · <kbd>Esc</kbd> 取消 / 菜单</div>' +
    '<div class="k">资源</div><div>算力用于塔与备份还原；情报用于隔离节点、选择升级分支和情报道具。二者不能互换。撤下塔退还 70% 算力，塔被摧毁不退款。</div></div><div class="srow" style="justify-content:flex-end;margin-top:22px" id="hb"></div></div></div></div>');
  n.querySelector('#hb').appendChild(btn('返回', 'pri', function () { back(from); })); show(n);
};
scr.close = function () { var m = M(); G.hideAllScreens(); if (m && !m.inMenu && m.resumeTo !== undefined) { m.paused = m.resumeTo; m.resumeTo = undefined; G.ui.pauseTag(); } };

// ---------- 暂停 ----------
scr.pause = function () {
  var m = M(); if (!m) return;
  if (m.inMenu) { scr.title(); return; }
  if (m.resumeTo === undefined) m.resumeTo = m.paused; m.paused = true; G.ui.pauseTag();
  var demoOn = m.demo && m.demo.active;
  var n = el('<div class="screen dim"><div class="dlg panel" style="width:480px"><div class="ph"><b>系统菜单</b><span>SYSTEM</span></div><div class="ip-body"><div class="menu-col" id="pm"></div></div></div></div>');
  var pm = n.querySelector('#pm');
  pm.appendChild(btn('继续', 'pri', function () { scr.close(); }));
  if (demoOn) pm.appendChild(btn('退出演示', 'bad', function () { m.resumeTo = undefined; G.demo.stop(); }));
  else pm.appendChild(btn('重开本图', '', function () { m.resumeTo = undefined; G.restart(); }));
  pm.appendChild(btn('返回关卡选择', '', function () { m.resumeTo = undefined; G.toSelect(); }));
  pm.appendChild(btn('图鉴', '', function () { scr.codex('pause'); }));
  pm.appendChild(btn('设置', '', function () { scr.settings('pause'); }));
  pm.appendChild(btn('操作说明', '', function () { scr.help('pause'); }));
  pm.querySelectorAll('.btn').forEach(function (b) { b.style.width = '100%'; });
  show(n);
};

// ---------- 事件报告 ----------
scr.result = function (g) {
  var m = M(); if (!m || m.game !== g) return; m.resumeTo = undefined;
  var st = g.stats, win = g.win, core = Math.round(g.core), grade;
  var progress = g.waveIdx / g.map.waves.length;
  if (win) grade = core >= 92 && st.destroyed <= 2 ? 'S' : (core >= 70 ? 'A' : (core >= 40 ? 'B' : 'C')); else grade = progress > 0.7 ? 'C' : (progress > 0.4 ? 'D' : 'E');
  var gc = { S: '#ffe066', A: '#6dffb0', B: '#7fdcc4', C: '#ffb02e', D: '#ff8a6a', E: '#ff4f6a' }[grade];
  if (win) { var b = G.settings.best[g.map.id]; var rank = 'SABC'; if (!b || rank.indexOf(grade) < rank.indexOf(b.grade) || (grade === b.grade && core > b.core)) { G.settings.best[g.map.id] = { grade: grade, core: core, time: Math.floor(g.time) }; G.saveSettings(); } }
  var kills = G.ENEMY_ORDER.filter(function (t) { return st.killsBy[t]; }).map(function (t) { return '<span class="chip"><img src="' + G.models.icon('e:' + t, 48) + '">' + G.ENEMIES[t].name + ' ×' + st.killsBy[t] + '</span>'; }).join('') || '<span style="color:var(--dim)">无</span>';
  var leakTxt = G.ENEMY_ORDER.filter(function (t) { return st.leaksBy[t]; }).map(function (t) { return '<span class="chip"><img src="' + G.models.icon('e:' + t, 48) + '">' + G.ENEMIES[t].name + ' ×' + st.leaksBy[t] + '</span>'; }).join('');
  var advice = '';
  if (!win) { var worst = G.ENEMY_ORDER.filter(function (t) { return st.leaksBy[t]; }).sort(function (a, b) { return st.leaksBy[b] * G.ENEMIES[b].coreDmg - st.leaksBy[a] * G.ENEMIES[a].coreDmg; })[0]; if (worst) advice = '失守主因：' + G.ENEMIES[worst].name + '。' + G.ENEMIES[worst].tip; }
  else if (st.destroyed > 6) advice = '设备损失较大：多用修复进程与备份还原，守住隔离点比反复改道更划算。';
  var logs = g.logs.slice(-14).map(function (l) { return '<div class="l ' + l.lvl + '">[' + G.fmtTime(l.t) + '] ' + l.text.replace(/</g, '&lt;') + '</div>'; }).join('');
  var n = el('<div class="screen dim"><div class="report panel"><div class="rh"><div class="grade" style="color:' + gc + ';text-shadow:0 0 30px ' + gc + '">' + grade + '</div><div><div class="logo-sm" style="margin:0">// 事件报告 INCIDENT REPORT · 事件代号「蛰影」</div><h1 style="color:' + (win ? '#7dffb0' : '#ff7a8a') + '">' + (win ? '防线守住 · 汐域安全' : '中枢失守 · 汐域沦陷') + '</h1><div class="sm">' + g.map.name + ' · ' + g.map.sub + ' · 难度「' + G.DIFF[g.diff || 0].name + '」 · 用时 ' + G.fmtTime(g.time) + ' · 已来袭 ' + g.waveIdx + ' / ' + g.map.waves.length + ' 波</div></div></div>' +
    '<div class="rbody"><div><h4>// 防守概况</h4><div class="rr"><span>中枢完整度</span><b>' + core + '%</b></div><div class="rr"><span>击杀威胁</span><b>' + st.kills + '</b></div><div class="rr"><span>漏过出口</span><b>' + st.leaks + '</b></div><div class="rr"><span>造成伤害</span><b>' + Math.round(st.dmg) + '</b></div><div class="rr"><span>治疗总量</span><b>' + Math.round(st.healed) + '</b></div></div>' +
    '<div><h4>// 设备与改道</h4><div class="rr"><span>部署设备</span><b>' + st.built + '</b></div><div class="rr"><span>设备被摧毁</span><b>' + st.destroyed + '</b></div><div class="rr"><span>主动撤下</span><b>' + st.sold + '</b></div><div class="rr"><span>路线改道次数</span><b>' + st.reroutes + '</b></div><div class="rr"><span>旁路直通次数</span><b>' + st.bypass + '</b></div><div class="rr"><span>道具使用</span><b>' + st.itemsUsed + '</b></div></div>' +
    '<div><h4>// 资源</h4><div class="rr"><span>算力获得</span><b>' + Math.round(st.compGain) + '</b></div><div class="rr"><span>算力花费</span><b>' + Math.round(st.compSpent) + '</b></div><div class="rr"><span>情报获得</span><b>' + Math.round(st.intelGain) + '</b></div><div class="rr"><span>情报花费</span><b>' + Math.round(st.intelSpent) + '</b></div></div></div>' +
    '<div style="padding:0 26px 10px"><h4 style="margin:0 0 6px;font-family:var(--mono);font-size:13px;color:var(--cy);letter-spacing:.14em">// 已清除威胁</h4><div class="chips" style="margin:0">' + kills + '</div></div>' + (leakTxt ? '<div style="padding:0 26px 10px"><h4 style="margin:0 0 6px;font-family:var(--mono);font-size:13px;color:#ff7a8a;letter-spacing:.14em">// 漏过出口的威胁</h4><div class="chips" style="margin:0">' + leakTxt + '</div></div>' : '') + (advice ? '<div style="padding:0 26px 10px;color:#ffe3a8;font-size:14px;line-height:1.6">' + advice + '</div>' : '') + '<div class="rlog">' + logs + '</div><div class="rfoot" id="rf"></div></div></div>');
  var rf = n.querySelector('#rf');
  rf.appendChild(btn('重开本图', 'pri', function () { G.restart(); })); rf.appendChild(btn('返回关卡选择', '', function () { G.toSelect(); })); rf.appendChild(btn('图鉴', '', function () { scr.codex('result'); }));
  rf.querySelectorAll('.btn').forEach(function (b) { b.style.minWidth = '180px'; });
  G.lastResult = g; show(n);
};

// ---------- 图鉴 ----------
var cdx = { tab: 0, key: null, lvl: 1, br: null, anim: null, from: null };
function statTable(rows) { return '<table>' + rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table>'; }
function towerDetail(k) {
  var d = G.TOWERS[k], s1 = G.towerStats(k, 1), h = '<h2>' + d.name + '</h2><div class="en">' + d.en + ' · ' + d.role + '</div><p>' + d.brief + '</p>';
  var place = d.place.map(function (p) { return { road: '链路', node: '交换节点', plat: '设备平台' }[p]; }).join(' / ');
  var rows = [['部署位置', place], ['建造费用', '算力 ' + d.cost + (d.nodeIntel ? ' + 情报 ' + d.nodeIntel + '（隔离节点）' : '')], ['等级 Ⅰ', statLine(k, 1)]];
  if (d.branches) { rows.push(['等级 Ⅱ · 分支 A「' + d.branches.A.name + '」', statLine(k, 2, 'A') + '<br><small style="color:#c6b791">升级：算力 ' + d.branches.A.cost + ' · 情报 ' + d.branches.A.intel + '</small>']); rows.push(['等级 Ⅱ · 分支 B「' + d.branches.B.name + '」', statLine(k, 2, 'B') + '<br><small style="color:#c6b791">升级：算力 ' + d.branches.B.cost + ' · 情报 ' + d.branches.B.intel + '</small>']); }
  else rows.push(['等级 Ⅱ', statLine(k, 2) + '<br><small style="color:#c6b791">升级：算力 ' + d.lv[1].cost + '</small>']);
  h += statTable(rows);
  if (d.branches) h += '<h4>// 分支差异</h4><div class="br"><b>A · ' + d.branches.A.name + '</b>：' + d.branches.A.desc + '</div><div class="br"><b>B · ' + d.branches.B.name + '</b>：' + d.branches.B.desc + '</div>';
  if (k === 'firewall') h += '<h4>// 主动技能</h4><div class="br"><b>' + d.skill.name + '</b>（冷却 ' + d.skill.cd + ' 秒）：' + d.skill.desc + '</div><h4>// 在节点上</h4><p>部署在交换节点上会隔离该节点，并以阻挡容量拦截相邻链路上的敌人。节点上的防火墙被摧毁或撤下后，节点旁路直通。</p>';
  if (k === 'honeypot') h += '<h4>// 主动技能</h4><div class="br"><b>诱捕</b>（冷却 ' + s1.trapCd + ' 秒，分支 B 为 ' + d.branches.B.trapCd + ' 秒）：困住诱导半径内的地面敌人 ' + s1.trapDur + ' 秒，使其受到的伤害 +20%（Boss 免疫）。</div><p>不会被加密，是勒索者的优先目标。诱导半径内正在攻击塔的敌人会改为攻击蜜罐（场上以紫色虚线标出）。</p>';
  if (k === 'repair') h += '<h4>// 主动技能</h4><div class="br"><b>冗余切换</b>（冷却 ' + s1.skillCd + ' 秒，Ⅱ 级 ' + G.towerStats(k, 2).skillCd + ' 秒）：为半径 ' + s1.skillR + ' 格内的友塔提供 ' + s1.skillShield + '（Ⅱ 级 ' + G.towerStats(k, 2).skillShield + '）点护盾，并解除加密。</div>';
  if (k === 'airgap') h += '<p>网闸只能放在交换节点上：低成本隔离，耐久较高，不攻击。敌人（尤其是洪泛团与 Boss）会攻击并冲毁它——此时节点旁路直通，道路重新开放。</p>';
  if (k === 'interceptor') h += '<p>攻击区域由朝向决定：在场上以蓝色扇形显示。可攻击地面与飞行目标；伪装的木马显形前不会被选中，但贯穿射线会波及直线上的未显形目标。塔优先攻击沿路线离出口最近的有效目标。</p>';
  if (k === 'sandbox') h += '<p>检测半径内的伪装 / 潜伏目标会显形；溅射伤害只对地面敌人有效，适合处理汇聚的流量。二级沙箱还会“污染”被命中的敌人使其受伤 +15%。</p>';
  return h;
}
function statLine(k, lv, br) {
  var s = G.towerStats(k, lv, br), p = ['耐久 ' + s.hp]; if (s.block) p.push('阻挡 ' + s.block);
  if (k === 'firewall') p.push('还击 ' + s.dmg + '/' + s.rate + 's');
  if (k === 'honeypot') { p.push('诱导 ' + s.lure + ' 格'); if (s.trace) p.push('溯源 ' + s.trace + '/s'); if (s.blast) p.push('引爆 ' + s.blast); }
  if (k === 'airgap') p.push('减伤 ' + Math.round((s.armor || 0) * 100) + '%');
  if (k === 'interceptor') { p.push('伤害 ' + s.dmg); p.push('射速 ' + s.rate + 's'); p.push('射程 ' + s.range); p.push('扇面 ' + s.arc * 2 + '°'); if (s.pierce) p.push('贯穿 ' + s.pierce); if (s.slow) p.push('减速 ' + Math.round(s.slow * 100) + '%'); }
  if (k === 'sandbox') { p.push('检测 ' + s.detect); p.push('伤害 ' + s.dmg + '/' + s.rate + 's'); p.push('射程 ' + s.range); p.push('溅射 ' + s.splash); }
  if (k === 'repair') { p.push('治疗 ' + s.heal + '/s'); p.push('范围 ' + s.range); p.push('同时 ' + s.targets + ' 座'); }
  return p.join(' · ');
}
function itemDetail(id) {
  var d = G.ITEMS[id];
  var h = '<h2>' + d.name + '</h2><div class="en">' + d.en + ' · 道具</div><p>' + d.brief + '</p>';
  h += statTable([['消耗', (d.res === 'intel' ? '情报 ' : '算力 ') + d.cost], ['使用间隔', d.cd + ' 秒'], d.ttl ? ['持续时间', d.ttl + ' 秒'] : null, d.radius ? ['影响半径', d.radius + ' 格'] : null, d.hp ? ['隔离器耐久', d.hp] : null, d.heal ? ['恢复生命', Math.round(d.heal * 100) + '% 最大生命，并解除加密'] : null, ['快捷键', d.hotkey]].filter(Boolean));
  if (id === 'isolator') h += '<p>只能插入一个直通的、未被占用的交换节点；与塔隔离一样需要保持连通——会封死入口的位置会被拒绝。有效期结束或被敌人冲毁后节点恢复直通，并有 ' + G.NODE_CD + ' 秒的再次隔离间隔。使用它不会产生“守住隔离点”的情报。</p>';
  if (id === 'downgrade') h += '<p>范围内的链路暂时变成旧链路：地面敌人减速 ' + Math.round((1 - G.OLD_SPEED) * 100) + '%，伪装的木马显形；路线成本随之变化，各入口与场上敌人会重新选路。预览时会显示路线变化。</p>';
  if (id === 'restore') h += '<p>选中一座己方设备投放。适合救活被集火的防火墙，或解除勒索者施加的加密。</p>';
  return h;
}
function enemyDetail(t) {
  var d = G.ENEMIES[t], h = '<h2>' + d.name + '</h2><div class="en">' + d.en + (d.boss ? ' · BOSS' : (d.air ? ' · 飞行' : ' · 地面')) + '</div><p>' + d.brief + '</p>';
  var rows = [['生命', d.hp + '（随波次提高）'], ['移动速度', d.speed + ' 格/秒'], ['阻挡占用', d.block || '不被阻挡（飞行）']];
  if (d.atk) rows.push(['攻击', d.atk + ' / ' + d.atkRate + ' 秒' + (d.ranged ? ' · 射程 ' + d.range + ' 格 · 加密 ' + d.enc + ' 秒' : '')]);
  if (d.strike) rows.push(['节点冲击', d.strike + ' / ' + d.strikeRate + ' 秒（对隔离器 ×1.2）']);
  if (d.payload) rows.push(['载荷', d.payload + ' 伤害 · 半径 ' + d.payloadR + ' 格（未显形被击毁时引爆）']);
  if (d.aura) rows.push(['护盾光环', '每 ' + d.shieldRate + ' 秒为半径 ' + d.aura + ' 格内的同伴加 ' + d.shieldAmt + ' 点护盾（上限 ' + d.shieldCap + '）']);
  rows.push(['到达出口', '中枢完整度 −' + d.coreDmg], ['击杀奖励', '算力 ' + d.rewardC + (d.rewardI ? ' · 情报 ' + d.rewardI : '')]);
  h += statTable(rows) + '<h4>// 应对建议</h4><div class="br">' + d.tip + '</div>';
  if (d.boss) { var pd = { boss1: '第一阶段：每隔 12 秒对被隔离的节点发起“洪峰”（先在节点上显示 2.6 秒警示环），重创塔并冲毁隔离器。生命低于 50%：移速提高，每 11 秒释放 6 只蠕虫。', boss2: '第一阶段：每隔 14 秒在前方链路制造路由黑洞（提前 3.2 秒预警，持续 9 秒），改选不会封死的位置。生命低于 50%：黑洞更频繁，且每 11 秒发动“路由风暴”，清除半径 5 格内塔的护盾并在 8 秒内无法获得护盾。', boss3: '潜伏（生命>66%）：需要检测显形才能被远程单体攻击选中。提权（33%–66%）：护甲 40%，每 8 秒放出 3 个木马。破坏（<33%）：每 12 秒锁死前方 3 格运维环（预警 3 秒，持续 10 秒），改变道路。' }[t]; h += '<h4>// 阶段</h4><div class="br">' + pd + '</div>'; }
  return h;
}
function mechDetail(id) {
  var out = '';
  if (id === 'terrain') { out = '<h2>地形</h2><div class="en">TERRAIN</div>'; Object.keys(G.TERRAIN).forEach(function (k) { var t = G.TERRAIN[k]; out += '<h4>// ' + t.name + '</h4><p><span class="stag" style="color:' + t.color + '">■</span>' + t.desc + '</p>'; }); }
  else if (id === 'status') { out = '<h2>状态</h2><div class="en">STATUS</div>'; Object.keys(G.STATUS).forEach(function (k) { var t = G.STATUS[k]; out += '<h4>// ' + t.name + '</h4><p><span class="stag" style="color:' + t.color + '">' + t.name + '</span>' + t.desc + '</p>'; }); }
  else if (id === 'route') out = '<h2>改道规则</h2><div class="en">DYNAMIC ROUTING</div><p><b>通行变化。</b>节点被塔或应急隔离器占用后截断道路；节点上的设备被摧毁或撤下、隔离器失效后，旁路直通，道路重新开放。Boss 的路由黑洞、锁死段以及协议降级的生效与结束，也会改变路线。</p><p><b>路由收敛。</b>每次变化后，各入口的路线同步更新，场上的地面敌人从当前位置重新寻路——可能继续前进，也可能就地掉头，但不会瞬移，也不会穿过不可通行的位置。</p><p><b>业务流量。</b>链路同时承载正常业务：沿各入口当前路线流动的白色小方块就是业务流量，它们表示该入口到中枢仍然连通——保持连通是改道的底线。</p><p><b>预览。</b>拖动隔离设备到节点上、或移动道具时，会以虚线显示各入口的新路线与路程变化。</p><p><b>保持连通。</b>任何通行变化都不能让某个入口或场上某个地面敌人无路可走。会封死的操作不能完成、不消耗资源，并在场上标出封死位置；Boss 会改选不会封死的位置。</p><p><b>改道的代价。</b>隔离消耗情报；撤下只返还 ' + Math.round(G.ISO_REFUND_C * 100) + '% 算力与 ' + Math.round(G.ISO_REFUND_I * 100) + '% 情报；节点恢复直通后要等 ' + G.NODE_CD + ' 秒才能再次隔离；敌人还会攻击节点上的设备。</p>';
  else if (id === 'combat') out = '<h2>战斗规则</h2><div class="en">COMBAT</div><p><b>阻挡与攻击。</b>阻挡使敌人停下交战，不改变道路的通行状态。塔优先攻击沿路线离出口最近的有效目标；被阻挡的攻塔敌人攻击挡住它的塔，勒索者与洪泛团的节点冲击按各自能力选择目标。</p><p><b>阻挡容量。</b>每个敌人占用一定阻挡容量（蠕虫 1、洪泛团 3、加壳器 2），容量满时后来的敌人直接穿过；Boss 占用 4 点阻挡容量，只有二级防火墙（容量 4）能独自拦住它。</p><p><b>节点攻防。</b>节点上的塔和隔离器同样要承受攻击；它们被摧毁后隔离解除，敌人重新选择道路。修复进程可以治疗节点上的塔——守住隔离点，或接受旁路直通，由你决定。</p><p><b>情报。</b>来自波次奖励、击杀重点威胁，以及节点塔在交战中持续守住隔离点（每 6 秒 +3）。</p>';
  return out;
}
scr.codex = function (from) {
  cdx.from = from || (cdx.keepFrom ? cdx.from : 'title'); cdx.keepFrom = true;
  var m = M(); if (m && !m.inMenu && !m.paused) { m.resumeTo = m.resumeTo === undefined ? m.paused : m.resumeTo; m.paused = true; G.ui.pauseTag(); }
  var n = el('<div class="screen solid"><div class="codex panel"><div class="cdx-tabs" id="ct"></div><div class="cdx-main"><div class="cdx-list" id="cl"></div><div class="cdx-detail" id="cd"></div></div></div></div>');
  var tabs = ['设备手册', '威胁档案', '地形 · 状态 · 规则'];
  var ct = n.querySelector('#ct'); tabs.forEach(function (t, i) { var d = el('<div class="tab ' + (cdx.tab === i ? 'on' : '') + '">' + t + '</div>'); d.onclick = function () { cdx.tab = i; cdx.key = null; scr.codex(); }; ct.appendChild(d); });
  var sp = el('<span style="flex:1"></span>'); ct.appendChild(sp); ct.appendChild(btn('返回', 'pri', function () { stopPrev(); back(cdx.from === 'result' ? 'x' : cdx.from); if (cdx.from === 'result' && G.lastResult) scr.result(G.lastResult); }));
  var list = n.querySelector('#cl'), items = [];
  if (cdx.tab === 0) { G.TOWER_ORDER.forEach(function (k) { items.push({ key: 't:' + k, name: G.TOWERS[k].name, sub: G.TOWERS[k].role, img: G.models.icon('t:' + k + ':1', 96) }); }); G.ITEM_ORDER.forEach(function (k) { items.push({ key: 'i:' + k, name: G.ITEMS[k].name, sub: '道具', svg: G.svg[k] }); }); }
  else if (cdx.tab === 1) G.ENEMY_ORDER.forEach(function (k) { items.push({ key: 'e:' + k, name: G.ENEMIES[k].name, sub: G.ENEMIES[k].boss ? 'BOSS' : (G.ENEMIES[k].air ? '飞行' : '地面'), img: G.models.icon('e:' + k, 96) }); });
  else [['m:terrain', '地形'], ['m:status', '状态'], ['m:route', '改道规则'], ['m:combat', '战斗规则']].forEach(function (a) { items.push({ key: a[0], name: a[1], sub: 'SYSTEM', svg: G.svg.book }); });
  if (!cdx.key || !items.some(function (i) { return i.key === cdx.key; })) { cdx.key = items[0].key; cdx.lvl = 1; cdx.br = null; }
  items.forEach(function (it) {
    var d = el('<div class="cdx-item ' + (it.key === cdx.key ? 'on' : '') + '">' + (it.img ? '<img src="' + it.img + '">' : '<div style="width:48px;height:44px;display:flex;align-items:center;justify-content:center">' + (it.svg || '').replace('<svg', '<svg width="30" height="30"') + '</div>') + '<div><b>' + it.name + '</b><small>' + it.sub + '</small></div></div>');
    d.onclick = function () { cdx.key = it.key; cdx.lvl = 1; cdx.br = null; scr.codex(); }; list.appendChild(d);
  });
  var det = n.querySelector('#cd'), key = cdx.key, kind = key.split(':')[0], id = key.split(':')[1], txt = '';
  if (kind === 't') txt = towerDetail(id); else if (kind === 'i') txt = itemDetail(id); else if (kind === 'e') txt = enemyDetail(id); else txt = mechDetail(id);
  var view = '';
  if (kind === 't' || kind === 'e') {
    view = '<div class="cdx-view"><canvas width="300" height="300" id="cv3d"></canvas><div class="srow" style="margin:10px 0 0;gap:6px;flex-wrap:wrap" id="lvb"></div><div style="color:var(--dim);font-size:12px;margin-top:6px">模型实时演示 · 拖动旋转</div></div>';
  } else if (kind === 'i') view = '<div class="cdx-view"><div style="width:300px;height:300px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(247,194,61,.16),transparent 68%)">' + G.svg[id].replace('<svg', '<svg width="170" height="170"') + '</div></div>';
  det.innerHTML = view + '<div class="cdx-txt">' + txt + '</div>';
  show(n);
  if (kind === 't' || kind === 'e') {
    var lvb = n.querySelector('#lvb'), d = kind === 't' ? G.TOWERS[id] : null;
    if (kind === 't') {
      var opts = [['Ⅰ 级', 1, null]]; if (d.branches) { opts.push(['Ⅱ·A ' + d.branches.A.name, 2, 'A']); opts.push(['Ⅱ·B ' + d.branches.B.name, 2, 'B']); } else opts.push(['Ⅱ 级', 2, null]);
      opts.forEach(function (o) { var b = btn(o[0], (cdx.lvl === o[1] && cdx.br === o[2]) ? 'on sm' : 'sm', function () { cdx.lvl = o[1]; cdx.br = o[2]; setModel(); lvb.querySelectorAll('.btn').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }); lvb.appendChild(b); });
    }
    setModel();
  }
  function setModel() { stopPrev(); var obj = kind === 't' ? G.models.tower(id, cdx.lvl, cdx.br, { onNode: false }) : G.models.enemy(id); startPrev(obj, kind === 'e' && /boss/.test(id)); }
  function startPrev(obj, big) {
    var cv = $('cv3d'); if (!cv) return; var t0 = performance.now(), az = 0.7, drag = false, lx = 0;
    cv.onpointerdown = function (e) { drag = true; lx = e.clientX; cv.setPointerCapture(e.pointerId); }; cv.onpointerup = function () { drag = false; }; cv.onpointermove = function (e) { if (drag) { az -= (e.clientX - lx) * 0.012; lx = e.clientX; } };
    var run = true; cdx.anim = { stop: function () { run = false; } }; var cache = {};
    var last = 0;
    (function loop(now) {
      if (!run || !document.body.contains(cv)) return;
      if (now - last > 33) { last = now; var t = (now - t0) / 1000; if (!drag) az += 0.012; obj.update(0.033, { t: t, m: t * 1.4, mv: kind === 'e' ? 1 : 0, atk: (Math.sin(t * 2.5) > 0.85) ? 1 : 0, aimYaw: -az * 0 + Math.sin(t) * 0.6, faceYaw: 0, showFace: false, phase: 1 + Math.floor(t / 4) % 3, rev: kind === 'e' && id === 'trojan' ? (Math.floor(t / 2) % 2) : 1, healing: 1, lure: 2.4, pulse: (Math.sin(t * 2) > 0.7) ? 1 : 0, surge: Math.max(0, Math.sin(t)), blocking: 0.5 }); gfx.renderIcon(obj.group, 300, { zoom: big ? 1.35 : 1.05, az: az, el: 0.38, canvas: cv, cache: cache }); }
      requestAnimationFrame(loop);
    })(performance.now());
  }
  function stopPrev() { if (cdx.anim) cdx.anim.stop(); cdx.anim = null; }
};
})(window.G = window.G || {});
