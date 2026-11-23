/* 界面：菜单、关卡、图鉴、HUD、面板 */
(function (g) {
'use strict';
const TD = g.TD, D = TD.DATA;
let App = null;
function $(id) { return document.getElementById(id); }
const ICON = {
  firewall: '▣', honeypot: '◉', gate: '⊟', interceptor: '➤', sandbox: '⬢', repair: '✚',
  isolator: '⊘', downgrade: '⇄', restore: '⟲'
};
const CLS_COLOR = { block: '#4fd8ff', lure: '#ffb347', isolate: '#7fe6a1', ranged: '#c39bff', aoe: '#5fe6d0', heal: '#ffd166' };

const UI = TD.UI = {
  init() {
    App = TD.App;
    $('btn-start').onclick = () => { App.showScreen('levels'); TD.Audio.click(); };
    $('btn-codex').onclick = () => { App.showScreen('codex'); TD.Audio.click(); };
    $('btn-help').onclick = () => { App.showScreen('help'); TD.Audio.click(); };
    $('btn-set').onclick = () => { App.showScreen('set'); TD.Audio.click(); };
    $('btn-demo').onclick = () => { App.showScreen('demos'); TD.Audio.click(); };
    document.querySelectorAll('.back').forEach(b => b.onclick = () => { App.showScreen('menu'); TD.Audio.click(); });
    $('btn-pause').onclick = () => App.togglePause();
    $('btn-speed').onclick = () => App.cycleSpeed();
    $('btn-view').onclick = () => { App.resetView(); TD.Audio.click(); };
    $('btn-menu').onclick = () => { App.showScreen('menu'); TD.Audio.click(); };
    $('rp-again').onclick = () => { App.restart(); };
    $('rp-levels').onclick = () => { App.showScreen('levels'); };
  },

  /* ---------- 关卡 ---------- */
  buildLevels() {
    const w = $('levels-list');
    w.innerHTML = '';
    for (const m of D.MAPS) {
      const el = document.createElement('div');
      el.className = 'lvcard';
      el.innerHTML = '<span class="tag">' + m.tag + '</span><h3>' + m.name + '</h3><div class="sub">' + m.sub + '</div>' +
        '<div class="desc">' + m.desc + '</div>' +
        '<div class="bars">' + m.waves.map(() => '<i class="on"></i>').join('') + '</div>' +
        '<div class="go">进入战场 ▸</div>';
      el.onclick = () => { TD.Audio.click(); App.startGame(m.id); };
      w.appendChild(el);
    }
  },

  /* ---------- 图鉴 ---------- */
  codexTab: 'towers',
  buildCodex() {
    const tabs = [['towers', '设备手册'], ['enemies', '威胁档案'], ['items', '道具'], ['status', '状态与地形']];
    const tw = $('codex-tabs');
    tw.innerHTML = '';
    for (const [id, name] of tabs) {
      const b = document.createElement('div');
      b.className = 'ctab' + (this.codexTab === id ? ' on' : '');
      b.textContent = name;
      b.onclick = () => { this.codexTab = id; TD.Audio.click(); this.buildCodex(); };
      tw.appendChild(b);
    }
    const body = $('codex-body');
    body.innerHTML = '';
    const add = (title, cls, stat, desc, branches) => {
      const c = document.createElement('div');
      c.className = 'cxcard';
      c.innerHTML = '<h4>' + title + (cls ? '<span class="cls">' + cls + '</span>' : '') + '</h4>' +
        (stat ? '<div class="stat">' + stat + '</div>' : '') + '<div class="d">' + desc + '</div>' +
        (branches ? branches.map(b => '<div class="br"><b>' + b.name + '</b>：' + b.desc + '</div>').join('') : '');
      body.appendChild(c);
    };
    if (this.codexTab === 'towers') {
      for (const id in D.TOWERS) {
        const t = D.TOWERS[id];
        add('<span style="color:' + t.color.map(v => Math.round(v * 255)).join(',') + '">' + ICON[id] + '</span> ' + t.name, t.clsName,
          '生命 ' + t.hp + ' · 造价 ' + t.cost + ' 算力' + (t.dmg ? ' · 伤害 ' + t.dmg : '') + (t.range ? ' · 射程 ' + t.range : '') +
          (t.blockCap ? ' · 阻挡容量 ' + t.blockCap : '') + (t.heal ? ' · 治疗 ' + t.heal : ''),
          t.desc + ' ' + t.up, t.branches);
      }
    } else if (this.codexTab === 'enemies') {
      for (const id in D.ENEMIES) {
        const e = D.ENEMIES[id];
        add('<span style="color:' + e.color.map(v => Math.round(v * 255)).join(',') + '">◆</span> ' + e.name, e.boss ? 'Boss' : (e.kind === 'air' ? '飞行' : '地面'),
          '生命 ' + e.hp + ' · 速度 ' + e.speed.toFixed(1) + ' · 击杀 +' + e.bounty + (e.intel ? ' · 情报 +' + e.intel : '') + (e.dmg ? ' · 攻击 ' + e.dmg : ''),
          e.desc);
      }
    } else if (this.codexTab === 'items') {
      for (const id in D.ITEMS) {
        const it = D.ITEMS[id];
        add(ICON[id] + ' ' + it.name, it.res === 'intel' ? '情报' : '算力',
          '消耗 ' + it.cost + (it.res === 'intel' ? ' 情报' : ' 算力') + ' · 快捷键 ' + it.key,
          it.desc + ' 位置：' + (it.target === 'node' ? '交换节点' : it.target === 'tower' ? '己方塔' : '链路上的一片区域'));
      }
      for (const s of D.CODEX.status) add(s.name, '状态', '', s.desc);
    } else {
      for (const s of D.CODEX.terrain) add(s.name, '地形', '', s.desc);
      for (const s of D.CODEX.status) add(s.name, '状态', '', s.desc);
    }
  },

  /* ---------- 说明 ---------- */
  buildHelp() {
    $('help-body').innerHTML =
      '<div class="help-sec"><h4>镜头操作（与 Blender 一致）</h4><ul>' +
      '<li><kbd>中键拖动</kbd> 环绕视角</li><li><kbd>Shift + 中键拖动</kbd> 平移视角</li>' +
      '<li><kbd>滚轮</kbd> 缩放</li><li><kbd>左键</kbd> 点选与拖放部署</li><li><kbd>Home</kbd> 回到默认视角</li></ul></div>' +
      '<div class="help-sec"><h4>战斗操作</h4><ul>' +
      '<li>把下方设备卡片拖到地图上部署，拖动时预览作用范围</li>' +
      '<li>拦截器由玩家设定朝向：放下后点击目标方向，或按 <kbd>R</kbd> / 滚轮旋转，<kbd>Esc</kbd> 取消</li>' +
      '<li>点击塔可升级、选择分支、释放技能、撤下（退还 60% 算力）</li>' +
      '<li>点击敌人或地块查看说明；道具卡片点击后选择目标生效</li>' +
      '<li><kbd>空格</kbd> 暂停，<kbd>F</kbd> 切换 1×/2×/3× 速度</li></ul></div>' +
      '<div class="help-sec"><h4>改道要点</h4><ul>' +
      '<li>在交换节点上部署防火墙或网闸即隔离该节点，截断通行；撤下或被摧毁后恢复直通</li>' +
      '<li>隔离前会预览各入口新路线；会让入口或场上敌人无路可走的操作会被拒绝，且不消耗资源</li>' +
      '<li>节点恢复直通后有短暂间隔才能再次隔离，避免无代价反复改道</li>' +
      '<li>旧链路上的地面敌人减速，伪装的木马会显形</li></ul></div>' +
      '<div class="help-sec"><h4>胜负条件</h4><ul>' +
      '<li>敌人到达出口时中枢完整度下降，归零即失败</li>' +
      '<li>撑过全部波次即胜利，结算显示本局统计</li>' +
      '<li>算力随时间增长并来自击杀，用于建塔与备份还原；情报来自波次、重点威胁与守住隔离节点</li></ul></div>';
  },

  /* ---------- 设置 ---------- */
  buildSettings() {
    const b = $('set-body');
    b.innerHTML = '';
    const row = (label, key, fmt) => {
      const d = document.createElement('div');
      d.className = 'set-row';
      d.innerHTML = '<label>' + label + '</label><input type="range" min="0" max="100" value="' + Math.round(App.settings[key] * 100) + '"><b>' + fmt(App.settings[key]) + '</b>';
      const inp = d.querySelector('input'), out = d.querySelector('b');
      inp.oninput = () => { App.settings[key] = inp.value / 100; out.textContent = fmt(App.settings[key]); TD.Audio.setVolumes(); };
      b.appendChild(d);
    };
    row('主音量', 'master', v => Math.round(v * 100) + '%');
    row('音乐', 'music', v => Math.round(v * 100) + '%');
    row('音效', 'sfx', v => Math.round(v * 100) + '%');
    const d = document.createElement('div');
    d.className = 'set-row';
    d.innerHTML = '<label>静音</label><button class="mbtn" id="btn-mute">' + (App.settings.muted ? '已静音' : '有声') + '</button>';
    d.querySelector('button').onclick = (e) => { App.settings.muted = !App.settings.muted; e.target.textContent = App.settings.muted ? '已静音' : '有声'; TD.Audio.setVolumes(); };
    b.appendChild(d);
  },

  /* ---------- 演示 ---------- */
  buildDemos() {
    const w = $('demos-list');
    w.innerHTML = '';
    const demos = TD.Demo ? TD.Demo.list() : [];
    for (const dm of demos) {
      const el = document.createElement('div');
      el.className = 'lvcard';
      el.innerHTML = '<span class="tag">实战演示</span><h3>' + dm.name + '</h3><div class="sub">' + dm.sub + '</div>' +
        '<div class="desc">' + dm.desc + '</div><div class="go">开始演出 ▸</div>';
      el.onclick = () => { TD.Audio.unlock(); TD.Demo.play(dm.id); };
      w.appendChild(el);
    }
  },

  /* ---------- 结算 ---------- */
  buildReport(win) {
    const st = App.sim;
    $('rp-title').textContent = win ? '事件报告 · 防守成功' : '事件报告 · 中枢失守';
    $('rp-sub').textContent = st.mapDef.name + ' · 第 ' + (st.waveIdx + 1) + ' / ' + st.mapDef.waves.length + ' 波';
    const s = st.stats;
    const mins = Math.floor(st.time / 60), secs = Math.floor(st.time % 60);
    $('rp-body').innerHTML =
      '<div class="rp-verdict" style="color:' + (win ? 'var(--gn)' : 'var(--rd)') + '">' + (win ? '全部波次已清除，汐域网络保持连通' : '中枢完整度归零，数据区段失守') + '</div>' +
      '<div class="rp-stat"><span>击毁威胁</span><b>' + s.kills + '</b></div>' +
      '<div class="rp-stat"><span>漏过出口</span><b>' + s.leaked + '</b></div>' +
      '<div class="rp-stat"><span>建造设备</span><b>' + s.built + '</b></div>' +
      '<div class="rp-stat"><span>损失设备</span><b>' + s.lost + '</b></div>' +
      '<div class="rp-stat"><span>累计算力</span><b>' + Math.round(s.computeEarned) + '</b></div>' +
      '<div class="rp-stat"><span>累计情报</span><b>' + Math.round(s.intelEarned) + '</b></div>' +
      '<div class="rp-stat"><span>造成伤害</span><b>' + Math.round(s.damage) + '</b></div>' +
      '<div class="rp-stat"><span>剩余完整度</span><b>' + Math.max(0, Math.round(st.integrity)) + '</b></div>' +
      '<div class="rp-stat"><span>作战时长</span><b>' + mins + ':' + String(secs).padStart(2, '0') + '</b></div>';
  },

  /* ---------- HUD 卡组 ---------- */
  buildDeck() {
    const w = $('deck');
    w.innerHTML = '';
    const order = ['firewall', 'honeypot', 'gate', 'interceptor', 'sandbox', 'repair'];
    const keys = { firewall: 'Q', honeypot: 'W', gate: 'E', interceptor: 'R', sandbox: 'T', repair: 'Y' };
    for (const id of order) {
      const d = D.TOWERS[id];
      d.hotkey = keys[id];
      const el = document.createElement('div');
      el.className = 'tcard';
      el.dataset.type = id;
      const c = d.color.map(v => Math.round(Math.min(1, v * 1.1) * 255));
      el.innerHTML = '<div class="ic" style="background:linear-gradient(135deg,rgba(' + c + ',.35),rgba(' + c + ',.08));color:rgb(' + c + ')">' + ICON[id] + '</div>' +
        '<div class="nm">' + d.name + '</div><div class="cl">' + d.clsName + '</div><div class="cost">' + d.cost + '</div>' +
        '<div class="key">' + keys[id] + '</div>';
      el.onmousedown = (e) => { e.preventDefault(); App.startDragCard(id, el); };
      w.appendChild(el);
    }
  },
  buildItems() {
    const w = $('items');
    w.innerHTML = '';
    for (const id in D.ITEMS) {
      const it = D.ITEMS[id];
      const el = document.createElement('div');
      el.className = 'icard';
      el.dataset.item = id;
      const c = it.res === 'intel' ? '184,140,255' : '79,216,255';
      el.innerHTML = '<div class="nm" style="color:rgb(' + c + ')">' + ICON[id] + ' ' + it.name + '</div>' +
        '<div class="cost">' + it.cost + ' ' + (it.res === 'intel' ? '情报' : '算力') + ' · ' + it.key + '</div><div class="cd"><i></i></div>';
      el.onclick = () => App.startItem(id);
      w.appendChild(el);
    }
  },

  /* ---------- HUD 刷新 ---------- */
  lastRefresh: 0,
  refresh(force) {
    const st = App.sim;
    if (!st) return;
    const rc = $('res-compute').querySelector('b');
    const ri = $('res-intel').querySelector('b');
    rc.textContent = Math.floor(st.compute);
    ri.textContent = Math.floor(st.intel);
    const f = $('integrity-fill'), fn = $('integrity-num');
    const pct = Math.max(0, st.integrity);
    f.style.width = pct + '%';
    f.style.background = pct > 50 ? 'linear-gradient(90deg,#2ee08a,#9ff5c0)' : pct > 25 ? 'linear-gradient(90deg,#ffb347,#ffe0a3)' : 'linear-gradient(90deg,#ff5d6c,#ffb3ba)';
    fn.textContent = Math.max(0, Math.round(st.integrity));
    fn.style.color = pct > 50 ? 'var(--gn)' : pct > 25 ? 'var(--yl)' : 'var(--rd)';
    // 波次
    const total = st.mapDef.waves.length;
    if (st.waveState === 'prep' && st.waveIdx < 0) { $('wave-label').textContent = '备战'; $('wave-num').textContent = '0/' + total; }
    else if (st.waveState === 'prep') { $('wave-label').textContent = '下一波 ' + Math.ceil(st.prepT) + 's'; $('wave-num').textContent = (st.waveIdx + 1) + '/' + total; }
    else { $('wave-label').textContent = '交战中'; $('wave-num').textContent = (st.waveIdx + 1) + '/' + total; }
    // 预报
    this.refreshForecast();
    // 卡片可用性
    for (const el of document.querySelectorAll('.tcard')) {
      const d = D.TOWERS[el.dataset.type];
      el.classList.toggle('dis', st.compute < d.cost);
    }
    for (const el of document.querySelectorAll('.icard')) {
      const it = D.ITEMS[el.dataset.item];
      const res = it.res === 'intel' ? st.intel : st.compute;
      el.classList.toggle('dis', res < it.cost);
    }
    // 选中塔面板
    if (App.selected && !App.selected.dead) this.showTower(App.selected, true);
    else if (App.selected && App.selected.dead) { App.selected = null; this.hidePanels(); }
    // 事件
    this.drainEvents();
  },
  refreshForecast() {
    const st = App.sim;
    const idx = st.waveState === 'prep' && st.waveIdx < 0 ? 0 : (st.waveState === 'active' ? st.waveIdx : st.waveIdx + 1);
    const w = st.mapDef.waves[Math.min(idx, st.mapDef.waves.length - 1)];
    if (!w) return;
    const cnt = {};
    for (const grp of w.groups) cnt[grp.type] = (cnt[grp.type] || 0) + grp.count;
    let html = '';
    for (const k in cnt) html += '<div class="e"><span>' + D.ENEMIES[k].name + '</span><b>×' + cnt[k] + '</b></div>';
    html += '<div class="e" style="margin-top:4px"><span>来袭入口</span><b>' + w.entries.join(' ') + '</b></div>';
    if (w.note) html += '<div class="fc-note">' + w.note + '</div>';
    const b = $('fc-body');
    if (b.dataset.k !== html) { b.innerHTML = html; b.dataset.k = html; }
  },
  drainEvents() {
    const st = App.sim;
    if (!st.events.length) return;
    for (const e of st.events) {
      if (e.kind === 'wave') this.event('第 ' + (st.waveIdx + 1) + ' 波 · ' + e.text);
      else if (e.kind === 'waveclear') this.event(e.text + ' · 情报 +' + (8 + Math.floor(st.waveIdx * 0.8)));
      else if (e.kind === 'leak') this.event('⚠ ' + e.enemy.def.name + ' 突破出口 · 完整度 -' + e.dmg, true);
      else if (e.kind === 'boss-phase') this.event('☠ ' + e.text, true);
      else if (e.kind === 'boss-atk') this.event('☠ ' + e.text, true);
      else if (e.kind === 'blackhole') this.event('◍ ' + e.text, true);
      else if (e.kind === 'lock') this.event('⌧ 运维环段被锁死：' + st.G.nodeById.get(e.nodeId).name, true);
      else if (e.kind === 'iso-broken') this.event('应急隔离器被冲毁', true);
      else if (e.kind === 'skill') this.event('✦ ' + e.text);
      else if (e.kind === 'end') { /* 结算由主循环触发 */ }
    }
    st.events.length = 0;
  },
  event(text, warn) {
    const w = $('hud-events');
    const d = document.createElement('div');
    d.className = 'hev';
    if (warn) d.style.borderLeftColor = 'var(--rd)';
    d.textContent = text;
    w.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .5s,transform .5s'; d.style.opacity = '0'; d.style.transform = 'translateY(-10px)'; }, 2600);
    setTimeout(() => d.remove(), 3200);
    while (w.children.length > 4) w.firstChild.remove();
  },

  /* ---------- 面板 ---------- */
  hidePanels() { $('sel-panel').classList.add('hidden'); $('info-panel').classList.add('hidden'); },
  showTower(t, onlyStats) {
    App.selected = t;
    const p = $('sel-panel');
    p.classList.remove('hidden');
    const d = t.def;
    const hp = Math.max(0, Math.round(t.hp));
    const canUp = t.level < 2 && App.sim.compute >= Math.floor(d.cost * 0.85);
    let html = '<h4>' + ICON[t.type] + ' ' + d.name + ' <span class="cls">' + (t.level > 1 ? 'Lv.2 ' + (t.branch ? d.branches.find(b => b.id === t.branch).name : '') : 'Lv.1') + '</span></h4>' +
      '<div class="hpbar"><i style="width:' + (t.hp / t.maxHp * 100) + '%;background:' + (t.shield > 0 ? 'linear-gradient(90deg,#6cf,#bdf)' : 'linear-gradient(90deg,#2ee08a,#9ff5c0)') + '"></i></div>' +
      '<div class="stats">生命 ' + hp + '/' + t.maxHp + (t.shield > 0 ? ' · 护盾 ' + Math.round(t.shield) : '') + (t.encryptT > 0 ? ' · <span style="color:var(--rd)">加密中 ' + t.encryptT.toFixed(1) + 's</span>' : '') + '</div>' +
      '<div class="stats">' + (d.dmg ? '伤害 ' + t.stats.dmg.toFixed(0) + ' · ' : '') + (t.stats.range ? '射程 ' + t.stats.range.toFixed(0) + ' · ' : '') +
      (t.stats.blockCap ? '阻挡容量 ' + t.stats.blockCap + ' · ' : '') + (t.stats.heal ? '治疗 ' + t.stats.heal.toFixed(0) + ' · ' : '') +
      (t.nodeId ? '隔离节点 · ' : '') + (d.facing ? '朝向 ' + (t.facing * 180 / Math.PI).toFixed(0) + '° · ' : '') + '</div>';
    if (t.level === 1) {
      html += '<div class="desc">' + d.up + '</div>';
    } else if (d.branches) {
      const br = d.branches.find(b => b.id === t.branch);
      html += '<div class="desc">' + (br ? br.name + '：' + br.desc : '尚未选择分支') + '</div>';
    } else html += '<div class="desc">' + d.desc + '</div>';
    html += '<div class="sel-btns">';
    if (t.level === 1) html += '<div class="sbtn' + (canUp ? '' : ' dis') + '" id="sb-up">升级 ' + Math.floor(d.cost * 0.85) + '</div>';
    else if (d.branches && !t.branch) {
      html += '<div class="branch-row"><div class="sbtn" id="sb-b1">' + d.branches[0].name + '</div><div class="sbtn" id="sb-b2">' + d.branches[1].name + '</div></div>';
    }
    if (d.skill) html += '<div class="sbtn skill' + (t.skillCd > 0 || t.encryptT > 0 ? ' dis' : '') + '" id="sb-skill">' + d.skill.name + (t.skillCd > 0 ? ' ' + Math.ceil(t.skillCd) + 's' : '') + '</div>';
    if (d.facing) html += '<div class="sbtn" id="sb-face">调整朝向</div>';
    html += '<div class="sbtn" id="sb-sell">撤下 +' + Math.floor(d.cost * 0.6) + '</div></div>';
    p.innerHTML = html;
    const bind = (id, fn) => { const e = $(id); if (e && !e.classList.contains('dis')) e.onclick = fn; };
    bind('sb-up', () => {
      if (d.branches) { this.showBranch(t); return; }
      if (TD.Sim.upgradeTower(App.sim, t)) { TD.Audio.upgrade(); this.showTower(t); }
      else { App.toast('算力不足'); TD.Audio.deny(); }
    });
    bind('sb-b1', () => { TD.Sim.upgradeTower(App.sim, t, 'b1'); TD.Audio.upgrade(); this.showTower(t); });
    bind('sb-b2', () => { TD.Sim.upgradeTower(App.sim, t, 'b2'); TD.Audio.upgrade(); this.showTower(t); });
    bind('sb-skill', () => { if (TD.Sim.castSkill(App.sim, t)) TD.Audio.skill(); });
    bind('sb-face', () => { App.facingMode = { tower: t }; App.toast('点击目标方向设定朝向'); });
    bind('sb-sell', () => { TD.Sim.sellTower(App.sim, t); App.selected = null; this.hidePanels(); TD.UI.refresh(); TD.Audio.sell(); });
  },
  showBranch(t) {
    const d = t.def;
    const p = $('sel-panel');
    let html = '<h4>' + ICON[t.type] + ' ' + d.name + ' · 选择分支</h4><div class="desc">升级到 2 级时二选一，决定实际用法：</div>';
    d.branches.forEach((b, i) => {
      html += '<div class="br" style="margin:8px 0"><b>' + b.name + '</b>：' + b.desc + '<div class="sbtn" style="margin-top:8px" id="br-' + b.id + '">选择</div></div>';
    });
    html += '<div class="sel-btns"><div class="sbtn" id="br-cancel">取消</div></div>';
    p.innerHTML = html;
    for (const b of d.branches) {
      const e = $('br-' + b.id);
      if (e) e.onclick = () => { if (TD.Sim.upgradeTower(App.sim, t, b.id)) { TD.Audio.upgrade(); this.showTower(t); } else { App.toast('算力不足'); TD.Audio.deny(); } };
    }
    $('br-cancel').onclick = () => this.showTower(t);
  },
  showEnemy(en) {
    const p = $('info-panel');
    p.classList.remove('hidden');
    const d = en.def;
    p.innerHTML = '<h4 style="color:' + d.color.map(v => Math.round(Math.min(1, v * 1.2) * 255)).join(',') + '">◆ ' + d.name + '</h4>' +
      '<div class="stats">生命 ' + Math.max(0, Math.round(en.hp)) + '/' + en.maxHp + (en.shield > 0 ? ' · 护盾 ' + Math.round(en.shield) : '') + '</div>' +
      '<div class="stats">' + (d.boss ? 'Boss' : d.kind === 'air' ? '飞行' : '地面') + ' · 速度 ' + d.speed.toFixed(1) + (d.dmg ? ' · 攻击 ' + d.dmg : '') + (d.armor ? ' · 护甲 ' + Math.round(d.armor * 100) + '%' : '') + '</div>' +
      '<div class="stats">状态：' + (en.def.disguised && !en.revealed ? '伪装中（远程单体无法选中）' : en.revealed && en.def.disguised ? '已显形' : '正常') +
      (en.slow > 0 ? ' · 减速' : '') + (en.trap > 0 ? ' · 被困' : '') + (en.state === 'blocked' ? ' · 被阻挡交战' : '') + '</div>' +
      '<div class="d">' + d.desc + '</div>';
  },
  showTerrain(spot) {
    const p = $('info-panel');
    p.classList.remove('hidden');
    let name = '链路', desc = '恶意程序与业务流量经过的道路。防火墙和蜜罐可以部署在这里阻挡敌人，但不截断道路。', extra = '';
    if (spot.kind === 'platform') { name = '设备平台'; desc = '部署远程和修复支援塔的位置，与链路有高低区别，敌人不能通行。'; }
    else if (spot.kind === 'node') {
      name = '交换节点'; desc = '链路交汇处的网络设备。部署防火墙、网闸或插入应急隔离器会隔离该节点，使这一格不能通行；解除隔离后恢复直通。';
      extra = '<div class="stats">' + spot.node.name + (spot.node.sw ? ' · 可隔离' : ' · 普通节点') + '</div>';
      const r = App.sim.routes[Object.keys(App.sim.routes)[0]];
    }
    p.innerHTML = '<h4>' + name + '</h4>' + extra + '<div class="d">' + desc + '</div>';
  }
};
})(typeof window !== 'undefined' ? window : globalThis);
