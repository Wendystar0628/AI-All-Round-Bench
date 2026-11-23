/* 界面：屏幕（菜单/关卡/图鉴/设置/结算）、HUD、部署栏、选中面板、预报、提示、日志。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---- 图标（统一 SVG 语言） ----
  const IC = {
    firewall: '<svg viewBox="0 0 24 24"><path d="M12 2 L20 6 V12 C20 17 16 21 12 22 C8 21 4 17 4 12 V6 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11 L11 14 L16 8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    honeypot: '<svg viewBox="0 0 24 24"><path d="M12 2 L20 7 V17 L12 22 L4 17 V7 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    airgap: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="16" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="15" y="4" width="6" height="16" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 12 H15" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2 2"/></svg>',
    interceptor: '<svg viewBox="0 0 24 24"><circle cx="12" cy="14" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 14 L12 3 M9 6 L12 3 L15 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    sandbox: '<svg viewBox="0 0 24 24"><path d="M12 2 L21 7 V17 L12 22 L3 17 V7 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 7 L12 12 L21 7 M12 12 V22" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    repair: '<svg viewBox="0 0 24 24"><path d="M12 4 V20 M4 12 H20" stroke="currentColor" stroke-width="3"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/></svg>',
    worm: '<svg viewBox="0 0 24 24"><path d="M3 12 C5 7 8 7 10 12 C12 17 15 17 17 12 C18.5 9 20 9 21 11" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="20" cy="10" r="1.6" fill="currentColor"/></svg>',
    flood: '<svg viewBox="0 0 24 24"><path d="M2 9 C5 6 7 6 10 9 C13 12 15 12 18 9 C19.5 7.5 21 7.5 22 8.5 M2 15 C5 12 7 12 10 15 C13 18 15 18 18 15 C19.5 13.5 21 13.5 22 14.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    trojan: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10 H20" stroke="currentColor" stroke-width="1.4"/><path d="M9 3 H15 V6 H9 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="15" r="1.6" fill="currentColor"/></svg>',
    ransom: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10 V7 C8 4.8 9.8 3 12 3 C14.2 3 16 4.8 16 7 V10" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="15" r="1.8" fill="currentColor"/></svg>',
    ap: '<svg viewBox="0 0 24 24"><circle cx="12" cy="18" r="2" fill="currentColor"/><path d="M8 14 C10 12 14 12 16 14 M5 11 C8.5 7.5 15.5 7.5 19 11 M2 8 C7 3 17 3 22 8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    packer: '<svg viewBox="0 0 24 24"><path d="M12 2 L20 7 V17 L12 22 L4 17 V7 Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 6 L16.5 8.7 V14.3 L12 17 L7.5 14.3 V8.7 Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    boss1: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 4 V2 M12 22 V20 M4 12 H2 M22 12 H20 M6 6 L4.5 4.5 M18 6 L19.5 4.5 M6 18 L4.5 19.5 M18 18 L19.5 19.5" stroke="currentColor" stroke-width="1.6"/></svg>',
    boss2: '<svg viewBox="0 0 24 24"><path d="M12 2 L22 12 L12 22 L2 12 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7 L17 12 L12 17 L7 12 Z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    boss3: '<svg viewBox="0 0 24 24"><path d="M12 2 L15 8 L22 9 L17 14 L18.5 21 L12 17.5 L5.5 21 L7 14 L2 9 L9 8 Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    isolator: '<svg viewBox="0 0 24 24"><path d="M4 20 L20 4" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    downgrade: '<svg viewBox="0 0 24 24"><path d="M12 3 V15 M7 10 L12 15 L17 10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 20 H19" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><path d="M20 12 C20 16.4 16.4 20 12 20 C7.6 20 4 16.4 4 12 C4 7.6 7.6 4 12 4 C15 4 17.5 5.6 19 8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M19 3 V8 H14" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 10 V7 C8 4.8 9.8 3 12 3 C14.2 3 16 4.8 16 7 V10" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2 L20 6 V12 C20 17 16 21 12 22 C8 21 4 17 4 12 V6 Z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    slow: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7 V12 L15 15" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    trap: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 4 V20 M4 12 H20" stroke="currentColor" stroke-width="1.4"/></svg>',
    gate: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="16" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="15" y="4" width="6" height="16" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M4 12 H20" stroke="currentColor" stroke-width="2.4"/><path d="M7 9 L4 12 L7 15 M17 9 L20 12 L17 15" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    platform: '<svg viewBox="0 0 24 24"><path d="M12 3 L21 8 L12 13 L3 8 Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 8 V16 L12 21 L21 16 V8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
    obstacle: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 4 L20 20 M20 4 L4 20" stroke="currentColor" stroke-width="1.4"/></svg>',
    node: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2 V8 M12 16 V22 M2 12 H8 M16 12 H22" stroke="currentColor" stroke-width="1.6"/></svg>',
    legacy: '<svg viewBox="0 0 24 24"><path d="M3 12 H21" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3"/><path d="M6 8 H18 M6 16 H18" stroke="currentColor" stroke-width="1.2" opacity=".6"/></svg>',
  };
  function icon(name, size) { const s = IC[name] || IC.node; return '<span class="svgic" style="width:' + (size || 22) + 'px;height:' + (size || 22) + 'px;display:inline-block;">' + s + '</span>'; }
  ND.icon = icon;
  const TOWER_ICON = { firewall: 'firewall', honeypot: 'honeypot', airgap: 'airgap', interceptor: 'interceptor', sandbox: 'sandbox', repair: 'repair' };
  const ENEMY_ICON = { worm: 'worm', flood: 'flood', trojan: 'trojan', ransom: 'ransom', ap: 'ap', packer: 'packer', boss1: 'boss1', boss2: 'boss2', boss3: 'boss3' };
  const ITEM_ICON = { isolator: 'isolator', downgrade: 'downgrade', restore: 'restore' };
  const ENEMY_COLOR = { worm: '#8aff4d', flood: '#6a7dff', trojan: '#ff4dd8', ransom: '#ff5d3d', ap: '#ffd23d', packer: '#ffa63d', boss1: '#b0ff4d', boss2: '#7de3ff', boss3: '#ff3d6a' };

  const UI = ND.UI = { logs: [] };

  UI.init = function () {
    UI.screens = $('#screens');
    UI.hud = $('#hud');
    UI.buildDeployBar();
    UI.bindTopbar();
    UI.buildMenu(); UI.buildLevels(); UI.buildCodex(); UI.buildSettings();
    $('#pause-resume').onclick = () => ND.App.setPaused(false);
    $('#pause-restart').onclick = () => ND.App.restart();
    $('#pause-exit').onclick = () => ND.App.toLevels();
    $('#pause-codex').onclick = () => { UI.showScreen('codex'); };
    $('#demo-exit').onclick = () => ND.App.exitDemo();
  };

  // ---- 屏幕 ----
  UI.showScreen = function (name) {
    UI.screens.innerHTML = '';
    UI.screens.classList.remove('hidden');
    const s = UI._screens[name]; if (s) UI.screens.appendChild(s);
    UI.current = name;
  };
  UI.hideScreens = function () { UI.screens.classList.add('hidden'); UI.screens.innerHTML = ''; UI.current = null; };
  UI._screens = {};

  UI.buildMenu = function () {
    const s = el('div', 'screen');
    s.innerHTML = '<div class="screen-inner">' +
      '<div class="logo"><h1>网络安全攻防战</h1><div class="sub">CYBER DEFENSE · DYNAMIC ROUTING</div>' +
      '<div class="tag">自治域「汐域」遭攻击组织「蛰影」入侵 —— 作为守护进程，维持各入口到中枢的连通，抵御恶意程序。</div></div>' +
      '<div class="menu-btns">' +
      '<button class="btn primary" data-act="levels">开始防守 · 关卡选择</button>' +
      '<button class="btn" data-act="demos">实战演示</button>' +
      '<button class="btn" data-act="codex">图鉴 · 设备手册 / 威胁档案</button>' +
      '<button class="btn" data-act="settings">设置</button>' +
      '</div><div class="menu-foot">镜头：中键拖动环绕 · Shift+中键平移 · 滚轮缩放 · 左键点选 / 拖放部署<br>本地离线运行 · 图形与声音均为运行时程序化生成</div></div>';
    s.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
      ND.Audio.init(); ND.Audio.play('click');
      const a = b.dataset.act;
      if (a === 'levels') UI.showScreen('levels');
      else if (a === 'codex') UI.showScreen('codex');
      else if (a === 'settings') UI.showScreen('settings');
      else if (a === 'demos') UI.showScreen('demos');
    });
    UI._screens.menu = s;
    UI.buildDemos();
  };
  UI.buildDemos = function () {
    const s = el('div', 'screen');
    const demos = ND.DEMOS || [];
    let cards = '';
    demos.forEach((d, i) => {
      cards += '<div class="level-card" data-demo="' + d.id + '"><div class="level-body"><h3>' + (i + 1) + '. ' + d.title + '</h3>' +
        '<div class="lsub">' + d.mapName + ' · ' + d.dur + 's</div><p>' + d.desc + '</p>' +
        '<button class="btn primary small" style="margin-top:10px;">播放演示</button></div></div>';
    });
    s.innerHTML = '<div class="screen-inner"><div class="logo"><h1 style="font-size:36px;">实战演示</h1><div class="sub">LIVE DEMONSTRATIONS</div></div>' +
      '<div class="level-grid">' + cards + '</div><div style="text-align:center;margin-top:24px;"><button class="btn" data-back>返回</button></div></div>';
    s.querySelectorAll('[data-demo]').forEach(c => c.onclick = () => { ND.Audio.init(); ND.App.startDemo(c.dataset.demo); });
    s.querySelector('[data-back]').onclick = () => UI.showScreen('menu');
    UI._screens.demos = s;
  };

  UI.buildLevels = function () {
    const s = el('div', 'screen');
    let cards = '';
    ND.MAPS.forEach(m => {
      cards += '<div class="level-card" data-map="' + m.id + '"><div class="level-thumb"><canvas data-thumb="' + m.id + '" width="360" height="150"></canvas></div>' +
        '<div class="level-body"><h3>' + m.name + '</h3><div class="lsub">' + m.sub + '</div><p>' + m.brief + '</p>' +
        '<div class="level-meta"><span>波次 <b>' + m.waves + '</b></span><span>入口 <b>' + Object.keys(m.entries).length + '</b></span><span>出口 <b>' + Object.keys(m.exits).length + '</b></span><span>Boss <b>' + ND.ENEMIES[m.boss].name + '</b></span></div>' +
        '</div></div>';
    });
    s.innerHTML = '<div class="screen-inner"><div class="logo"><h1 style="font-size:36px;">关卡选择</h1><div class="sub">SELECT DEFENSE SECTOR</div></div>' +
      '<div class="level-grid">' + cards + '</div><div style="text-align:center;margin-top:24px;"><button class="btn" data-back>返回主菜单</button></div></div>';
    s.querySelectorAll('[data-map]').forEach(c => c.onclick = () => { ND.Audio.init(); ND.Audio.play('click'); ND.App.startBattle(c.dataset.map); });
    s.querySelector('[data-back]').onclick = () => UI.showScreen('menu');
    UI._screens.levels = s;
    // 缩略图
    setTimeout(() => s.querySelectorAll('[data-thumb]').forEach(cv => UI.drawThumb(cv, cv.dataset.thumb)), 0);
  };
  UI.drawThumb = function (cv, mapId) {
    const m = ND.MAPS.find(x => x.id === mapId); const g = ND.Routing.build(m);
    const ctx = cv.getContext('2d'); const th = ND.THEMES[m.theme];
    const W = cv.width, H = cv.height;
    ctx.fillStyle = '#' + th.bg.toString(16).padStart(6, '0'); ctx.fillRect(0, 0, W, H);
    const sx = W / (g.w + 2), sy = H / (g.h + 2); const s = Math.min(sx, sy);
    const ox = (W - g.w * s) / 2, oy = (H - g.h * s) / 2;
    const hex = c => '#' + c.toString(16).padStart(6, '0');
    for (const c of g.cells) {
      if (c.type === ND.CELL.VOID) continue;
      const x = ox + c.x * s, y = oy + c.y * s;
      let col = th.link;
      if (c.type === ND.CELL.LEGACY) col = th.legacy;
      if (c.type === ND.CELL.NODE) col = th.node;
      if (c.type === ND.CELL.PLATFORM) col = th.platform;
      if (c.type === ND.CELL.OBSTACLE) col = th.obstacle;
      if (c.type === ND.CELL.ENTRY) col = ND.ENTRY_COLORS[c.entry];
      if (c.type === ND.CELL.EXIT) col = ND.EXIT_COLORS[c.exit];
      ctx.fillStyle = hex(col); ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
    }
    // 路线
    const field = ND.Routing.field(g, new Set(), new Set());
    const routes = ND.Routing.entryRoutes(g, field);
    for (const k of Object.keys(routes)) {
      const p = routes[k]; if (!p) continue;
      ctx.strokeStyle = hex(ND.ENTRY_COLORS[k]); ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath();
      p.forEach((i, j) => { const c = g.cells[i]; const x = ox + c.x * s + s / 2, y = oy + c.y * s + s / 2; if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  };

  UI.buildCodex = function () {
    const s = el('div', 'screen');
    s.innerHTML = '<div class="screen-inner"><div class="logo"><h1 style="font-size:36px;">图鉴</h1><div class="sub">DEVICE MANUAL / THREAT ARCHIVE</div></div>' +
      '<div class="codex-tabs">' +
      '<div class="codex-tab active" data-tab="towers">设备手册</div>' +
      '<div class="codex-tab" data-tab="enemies">威胁档案</div>' +
      '<div class="codex-tab" data-tab="items">道具</div>' +
      '<div class="codex-tab" data-tab="status">状态</div>' +
      '<div class="codex-tab" data-tab="terrain">地形</div>' +
      '</div><div class="codex-grid" id="codex-grid"></div>' +
      '<div style="text-align:center;margin-top:24px;"><button class="btn" data-back>返回</button></div></div>';
    const grid = s.querySelector('#codex-grid');
    const render = (tab) => {
      grid.innerHTML = '';
      if (tab === 'towers') {
        ND.TOWER_ORDER.forEach(id => {
          const t = ND.TOWERS[id];
          let branchHtml = '';
          if (t.branches) branchHtml = '<div class="cbranch">升级分支（2级，二选一，消耗情报）：<br>' + Object.values(t.branches).map(b => '◆ ' + b.name + '：' + b.desc).join('<br>') + '</div>';
          else if (t.lv2) branchHtml = '<div class="cbranch">2级：' + t.lv2.name + '（提升属性）</div>';
          const skill = t.skill ? '<div class="cbranch">主动技能「' + t.skill.name + '」：' + t.skill.desc + '（冷却 ' + t.skill.cd + 's）</div>' : '';
          grid.appendChild(el('div', 'codex-item', '<h4><span class="cicon" style="color:var(--cyan)">' + icon(TOWER_ICON[id], 26) + '</span>' + t.name + ' <span style="font-size:12px;color:var(--txt-dim)">' + t.role + '</span></h4>' +
            '<p>' + t.desc + '</p><div class="cstats">算力 ' + t.cost + ' · 生命 ' + t.hp + (t.block ? ' · 阻挡 ' + t.block : '') + (t.dmg ? ' · 伤害 ' + t.dmg : '') + (t.range ? ' · 射程 ' + t.range : '') + '</div>' +
            '<p style="margin-top:6px;">' + t.detail + '</p>' + skill + branchHtml));
        });
      } else if (tab === 'enemies') {
        ND.ENEMY_ORDER.forEach(id => {
          const e = ND.ENEMIES[id];
          grid.appendChild(el('div', 'codex-item', '<h4><span class="cicon" style="color:' + ENEMY_COLOR[id] + '">' + icon(ENEMY_ICON[id], 26) + '</span>' + e.name + (e.boss ? ' <span style="font-size:12px;color:var(--red)">BOSS</span>' : e.elite ? ' <span style="font-size:12px;color:var(--amber)">重点</span>' : '') + '</h4>' +
            '<p>' + e.desc + '</p><div class="cstats">生命 ' + e.hp + ' · 速度 ' + e.speed + (e.flying ? ' · 飞行' : ' · 地面') + (e.dmg ? ' · 攻塔 ' + e.dmg : '') + '</div>'));
        });
      } else if (tab === 'items') {
        ND.ITEM_ORDER.forEach(id => {
          const it = ND.ITEMS[id];
          grid.appendChild(el('div', 'codex-item', '<h4><span class="cicon" style="color:var(--purple)">' + icon(ITEM_ICON[id], 26) + '</span>' + it.name + '</h4>' +
            '<p>' + it.desc + '</p><div class="cstats">' + (it.res === 'intel' ? '情报' : '算力') + ' ' + it.cost + ' · 冷却 ' + it.cd + 's · 投放目标：' + ({ node: '交换节点', link: '链路', tower: '塔' }[it.target]) + '</div>'));
        });
      } else if (tab === 'status') {
        ND.STATUS_DOC.forEach(d => grid.appendChild(el('div', 'codex-item', '<h4><span class="cicon" style="color:var(--amber)">' + icon(d.icon, 24) + '</span>' + d.name + '</h4><p>' + d.text + '</p>')));
      } else if (tab === 'terrain') {
        ND.TERRAIN_DOC.forEach(d => grid.appendChild(el('div', 'codex-item', '<h4><span class="cicon" style="color:var(--cyan)">' + icon(d.icon, 24) + '</span>' + d.name + '</h4><p>' + d.text + '</p>')));
      }
    };
    s.querySelectorAll('.codex-tab').forEach(t => t.onclick = () => { s.querySelectorAll('.codex-tab').forEach(x => x.classList.remove('active')); t.classList.add('active'); render(t.dataset.tab); });
    s.querySelector('[data-back]').onclick = () => { if (ND.App.state === 'battle') UI.hideScreens(); else UI.showScreen('menu'); };
    render('towers');
    UI._screens.codex = s;
  };

  UI.buildSettings = function () {
    const s = el('div', 'screen');
    s.innerHTML = '<div class="screen-inner" style="max-width:560px;"><div class="logo"><h1 style="font-size:36px;">设置</h1><div class="sub">SETTINGS</div></div>' +
      '<div class="panel" style="padding:20px 26px;">' +
      '<div class="settings-row"><label>主音量</label><input type="range" id="set-vol" min="0" max="100" value="70"></div>' +
      '<div class="settings-row"><label>音乐音量</label><input type="range" id="set-music" min="0" max="100" value="50"></div>' +
      '<div class="settings-row"><label>静音</label><button class="btn small" id="set-mute">开启静音</button></div>' +
      '</div><div style="text-align:center;margin-top:24px;"><button class="btn" data-back>返回</button></div></div>';
    s.querySelector('#set-vol').oninput = e => ND.Audio.setVolume(e.target.value / 100);
    s.querySelector('#set-music').oninput = e => ND.Audio.setMusicVolume(e.target.value / 100);
    s.querySelector('#set-mute').onclick = e => { ND.Audio.setMuted(!ND.Audio.muted); e.target.textContent = ND.Audio.muted ? '取消静音' : '开启静音'; UI.syncMute(); };
    s.querySelector('[data-back]').onclick = () => UI.showScreen('menu');
    UI._screens.settings = s;
  };

  // ---- 部署栏 ----
  UI.buildDeployBar = function () {
    const bar = $('#deploybar'); bar.innerHTML = '';
    const roles = [['阻挡 / 隔离', ['firewall', 'honeypot', 'airgap']], ['远程 / 检测 / 支援', ['interceptor', 'sandbox', 'repair']]];
    let hotkey = 1;
    roles.forEach(([label, ids]) => {
      const sec = el('div', 'deploy-section');
      sec.appendChild(el('div', 'ds-label', label));
      const cards = el('div', 'deploy-cards');
      ids.forEach(id => {
        const t = ND.TOWERS[id];
        const c = el('div', 'tcard'); c.dataset.tower = id;
        c.innerHTML = '<span class="tkey">' + hotkey + '</span><div class="ticon" style="color:var(--cyan)">' + icon(TOWER_ICON[id], 28) + '</div><div class="tname">' + t.name + '</div><div class="tcost">⬢' + t.cost + '</div>';
        c.dataset.hotkey = hotkey; hotkey++;
        c.onmouseenter = e => UI.tooltip(e, '<div class="tt-title">' + t.name + ' · ' + t.role + '</div>' + t.desc + '<div class="tt-cost">算力 ' + t.cost + ' · 生命 ' + t.hp + '</div>');
        c.onmousemove = e => UI.moveTooltip(e);
        c.onmouseleave = () => UI.hideTooltip();
        c.onmousedown = e => { if (e.button === 0) { ND.App.beginDeploy(id); c.classList.add('dragging'); } };
        cards.appendChild(c);
      });
      sec.appendChild(cards); bar.appendChild(sec);
    });
    bar.appendChild(el('div', 'deploy-divider'));
    const isec = el('div', 'deploy-section');
    isec.appendChild(el('div', 'ds-label', '道具 · 投放'));
    const icards = el('div', 'deploy-cards');
    ND.ITEM_ORDER.forEach(id => {
      const it = ND.ITEMS[id];
      const c = el('div', 'tcard item-card' + (it.res === 'compute' ? ' compute' : '')); c.dataset.item = id;
      c.innerHTML = '<div class="ticon" style="color:' + (it.res === 'intel' ? 'var(--purple)' : 'var(--cyan)') + '">' + icon(ITEM_ICON[id], 26) + '</div><div class="tname">' + it.name + '</div><div class="tcost">' + (it.res === 'intel' ? '◈' : '⬢') + it.cost + '</div><div class="tcd hidden"></div>';
      c.onmouseenter = e => UI.tooltip(e, '<div class="tt-title">' + it.name + '</div>' + it.desc + '<div class="tt-cost">' + (it.res === 'intel' ? '情报' : '算力') + it.cost + ' · 冷却 ' + it.cd + 's · 目标：' + ({ node: '节点', link: '链路', tower: '塔' }[it.target]) + '</div>');
      c.onmousemove = e => UI.moveTooltip(e);
      c.onmouseleave = () => UI.hideTooltip();
      c.onclick = () => ND.App.beginItem(id);
      icards.appendChild(c);
    });
    isec.appendChild(icards); bar.appendChild(isec);
  };
  UI.updateDeploy = function (game) {
    document.querySelectorAll('.tcard[data-tower]').forEach(c => {
      const t = ND.TOWERS[c.dataset.tower];
      c.classList.toggle('disabled', game.compute < t.cost);
    });
    document.querySelectorAll('.tcard[data-item]').forEach(c => {
      const it = ND.ITEMS[c.dataset.item];
      const res = it.res === 'intel' ? game.intel : game.compute;
      const cd = game.itemCd[it.id] - game.time;
      const cdEl = c.querySelector('.tcd');
      c.classList.toggle('disabled', res < it.cost || cd > 0);
      if (cd > 0) { cdEl.classList.remove('hidden'); cdEl.textContent = Math.ceil(cd); }
      else cdEl.classList.add('hidden');
    });
  };

  // ---- 顶栏 ----
  UI.bindTopbar = function () {
    document.querySelectorAll('.speed-btn').forEach(b => b.onclick = () => ND.App.setSpeed(+b.dataset.speed));
    $('#btn-pause').onclick = () => ND.App.setPaused(!ND.App.paused);
    $('#btn-mute').onclick = () => { ND.Audio.init(); ND.Audio.setMuted(!ND.Audio.muted); UI.syncMute(); };
    $('#btn-home').onclick = () => ND.App.renderer.defaultView();
    $('#btn-help').onclick = () => UI.showScreen('codex');
    $('#btn-menu').onclick = () => ND.App.setPaused(true);
    $('#callwave').onclick = () => ND.App.game && ND.App.game.callWaveEarly();
  };
  UI.syncMute = function () { $('#btn-mute').textContent = ND.Audio.muted ? '🔇' : '🔊'; $('#btn-mute').classList.toggle('active', ND.Audio.muted); };
  UI.setSpeedUI = function (s) { document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', +b.dataset.speed === s)); };
  UI.setPauseUI = function (p) { $('#btn-pause').textContent = p ? '▶' : '⏸'; $('#pause-overlay').classList.toggle('hidden', !p); };

  // ---- HUD 更新 ----
  UI.updateHUD = function (game) {
    $('#res-compute').textContent = Math.floor(game.compute);
    $('#res-intel').textContent = Math.floor(game.intel);
    $('#res-integrity').textContent = game.integrity;
    $('#integrity-fill').style.width = (game.integrity / game.maxIntegrity * 100) + '%';
    $('#res-wave').textContent = game.wave + '/' + game.mapDef.waves;
    UI.updateDeploy(game);
    // Boss
    const bb = $('#bossbar');
    if (game.boss && !game.boss.dead) {
      bb.classList.remove('hidden');
      $('#boss-name').textContent = game.boss.def.name;
      $('#boss-fill').style.width = (game.boss.hp / game.boss.maxHp * 100) + '%';
      $('#boss-phase').textContent = game.boss.type === 'boss3' ? ['阶段 · 潜伏', '阶段 · 提权', '阶段 · 破坏'][game.boss.phase] : (game.boss.hp / game.boss.maxHp < 0.5 ? '阶段 · 狂化' : '阶段 · 常态');
    } else bb.classList.add('hidden');
    // 预报计时
    if (game.waveState === 'prep') $('#fc-timer').textContent = '下一波 ' + Math.ceil(game.prepTimer) + 's';
    else $('#fc-timer').textContent = '交战中 · 剩余 ' + game.enemies.filter(e => !e.dead).length;
    $('#callwave').style.visibility = game.waveState === 'prep' ? 'visible' : 'hidden';
  };
  UI.updateForecast = function (game) {
    const body = $('#fc-body'); body.innerHTML = '';
    const nextWave = game.waveState === 'prep' ? game.wave + 1 : game.wave;
    const list = ND.WAVES[game.mapId][nextWave - 1];
    if (!list) { body.innerHTML = '<div class="fc-empty">已是最终波次</div>'; return; }
    const byEntry = {};
    list.forEach(grp => { (byEntry[grp.e] = byEntry[grp.e] || []).push(grp); });
    const title = el('div', 'fc-empty', (game.waveState === 'prep' ? '下一波 ' : '当前波 ') + nextWave + ' 来袭构成');
    title.style.marginBottom = '8px'; body.appendChild(title);
    Object.keys(byEntry).forEach(e => {
      const ent = el('div', 'fc-entry');
      const col = '#' + ND.ENTRY_COLORS[e].toString(16).padStart(6, '0');
      ent.appendChild(el('div', 'fc-name', '<span class="dot" style="background:' + col + ';box-shadow:0 0 6px ' + col + '"></span>' + e + ' · ' + (game.mapDef.entries[e] || '')));
      const chips = el('div', 'fc-enemies');
      byEntry[e].forEach(grp => {
        const def = ND.ENEMIES[grp.t];
        chips.appendChild(el('span', 'fc-chip', '<span class="ci" style="color:' + ENEMY_COLOR[grp.t] + '">' + icon(ENEMY_ICON[grp.t], 15) + '</span>' + def.name + ' ×' + grp.n));
      });
      ent.appendChild(chips); body.appendChild(ent);
    });
  };

  // ---- 选中面板 ----
  UI.showSelection = function (game, id) {
    const panel = $('#selpanel');
    const t = game.towers.find(x => x.id === id);
    const e = game.enemies.find(x => x.id === id);
    const body = $('#sp-body');
    if (t) {
      panel.classList.remove('hidden'); $('#sp-title').textContent = '设备 · ' + t.def.name;
      const def = t.def;
      let status = '';
      if (t.encryptedUntil > game.time) status += '<span class="st">加密 ' + Math.ceil(t.encryptedUntil - game.time) + 's</span>';
      if (t.shield > 0) status += '<span class="st">护盾 ' + Math.floor(t.shield) + '</span>';
      let actions = '';
      if (t.level < 2) {
        if (def.branches) {
          actions += '<div class="sp-branch">' + Object.keys(def.branches).map(b => '<button class="btn" data-branch="' + b + '">' + def.branches[b].name + '<br><span style="font-size:11px;color:var(--purple)">◈' + def.branches[b].intel + ' ⬢' + def.branches[b].cost + '</span></button>').join('') + '</div>';
        } else if (def.lv2) {
          actions += '<button class="btn primary" data-upgrade>升级 · ' + def.lv2.name + '（⬢' + def.lv2.cost + '）</button>';
        }
      } else {
        actions += '<div class="sp-desc" style="color:var(--amber)">已达 2 级' + (t.branch ? ' · ' + def.branches[t.branch].name : (def.lv2 ? ' · ' + def.lv2.name : '')) + '</div>';
      }
      if (def.skill) actions += '<button class="btn" data-skill>' + def.skill.name + '（' + (t.skillCd > game.time ? Math.ceil(t.skillCd - game.time) + 's' : '就绪') + '）</button>';
      actions += '<button class="btn danger" data-sell>撤下 · 返还 ⬢' + Math.floor(t.invested * 0.6) + '</button>';
      body.innerHTML = '<div class="sp-head"><span class="spicon" style="color:var(--cyan)">' + icon(TOWER_ICON[t.type], 30) + '</span><div><h3>' + def.name + ' Lv.' + t.level + '</h3><div class="sptype">' + def.role + (t.branch ? ' · ' + def.branches[t.branch].name : '') + '</div></div></div>' +
        '<div class="sp-hp"><i style="width:' + (t.hp / t.maxHp * 100) + '%"></i></div>' +
        '<div class="sp-stats">生命 <b>' + Math.ceil(t.hp) + '/' + t.maxHp + '</b>' + (t.block ? ' · 阻挡 <b>' + t.block + '</b>' : '') + (t.dmg ? ' · 伤害 <b>' + t.dmg + '</b>' : '') + (t.range ? ' · 射程 <b>' + t.range + '</b>' : '') + (t.heal ? ' · 治疗 <b>' + t.heal + '/s</b>' : '') + '</div>' +
        '<div class="sp-status">' + status + '</div>' +
        '<div class="sp-desc">' + def.desc + '</div>' +
        '<div class="sp-actions">' + actions + '</div>';
      body.querySelector('[data-upgrade]') && (body.querySelector('[data-upgrade]').onclick = () => { ND.App.upgradeSelected(null); });
      body.querySelectorAll('[data-branch]').forEach(b => b.onclick = () => ND.App.upgradeSelected(b.dataset.branch));
      body.querySelector('[data-skill]') && (body.querySelector('[data-skill]').onclick = () => ND.App.skillSelected());
      body.querySelector('[data-sell]').onclick = () => ND.App.sellSelected();
    } else if (e) {
      panel.classList.remove('hidden'); $('#sp-title').textContent = '威胁 · ' + e.def.name;
      let status = '';
      if (!e.revealed) status += '<span class="st">伪装中</span>';
      if (e.shield > 0) status += '<span class="st">护盾 ' + Math.floor(e.shield) + '</span>';
      if (e.slowFactor < 1) status += '<span class="st">减速</span>';
      if (e.rootedUntil > game.time) status += '<span class="st">被诱捕</span>';
      if (e.blockedBy) status += '<span class="st">被阻挡</span>';
      body.innerHTML = '<div class="sp-head"><span class="spicon" style="color:' + ENEMY_COLOR[e.type] + '">' + icon(ENEMY_ICON[e.type], 30) + '</span><div><h3>' + e.def.name + '</h3><div class="sptype">' + (e.boss ? 'BOSS' : e.def.elite ? '重点威胁' : '常规威胁') + ' · ' + (e.flying ? '飞行' : '地面') + '</div></div></div>' +
        '<div class="sp-hp"><i style="width:' + (e.hp / e.maxHp * 100) + '%"></i></div>' +
        '<div class="sp-stats">生命 <b>' + Math.ceil(e.hp) + '/' + e.maxHp + '</b> · 速度 <b>' + e.speed + '</b>' + (e.def.dmg ? ' · 攻塔 <b>' + e.def.dmg + '</b>' : '') + '</div>' +
        '<div class="sp-status">' + status + '</div><div class="sp-desc">' + e.def.desc + '</div>';
    } else {
      panel.classList.add('hidden');
    }
  };
  UI.showTileInfo = function (game, i) {
    const cell = game.grid.cells[i]; const panel = $('#selpanel'); const body = $('#sp-body');
    const names = { [ND.CELL.LINK]: '链路', [ND.CELL.LEGACY]: '旧链路', [ND.CELL.NODE]: '交换节点', [ND.CELL.PLATFORM]: '设备平台', [ND.CELL.OBSTACLE]: '障碍', [ND.CELL.ENTRY]: '入口', [ND.CELL.EXIT]: '出口' };
    const doc = ND.TERRAIN_DOC.find(d => d.name === names[cell.type]);
    let extra = '';
    if (cell.type === ND.CELL.NODE) {
      const ns = game.nodeState[i];
      extra = '<div class="sp-status">' + (ns.isolated ? '<span class="st">已隔离</span>' : game.time < ns.cooldownUntil ? '<span class="st">再隔离冷却 ' + Math.ceil(ns.cooldownUntil - game.time) + 's</span>' : '<span class="st">直通</span>') + '</div>';
    }
    if (cell.type === ND.CELL.ENTRY) extra = '<div class="sp-desc">入口 ' + cell.entry + ' · ' + game.mapDef.entries[cell.entry] + '</div>';
    if (cell.type === ND.CELL.EXIT) extra = '<div class="sp-desc">出口 ' + cell.exit + ' · ' + game.mapDef.exits[cell.exit] + '</div>';
    panel.classList.remove('hidden'); $('#sp-title').textContent = '地块 · ' + (names[cell.type] || '虚空');
    body.innerHTML = '<div class="sp-head"><span class="spicon" style="color:var(--cyan)">' + icon((doc && doc.icon) || 'node', 28) + '</span><div><h3>' + (names[cell.type] || '虚空') + '</h3><div class="sptype">坐标 (' + cell.x + ',' + cell.y + ')</div></div></div>' +
      extra + '<div class="sp-desc">' + (doc ? doc.text : '不可通行的虚空区域。') + '</div>';
  };
  UI.hideSelection = function () { $('#selpanel').classList.add('hidden'); };

  // ---- 提示 / 日志 / 横幅 ----
  UI.toast = function (msg, kind) {
    const t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2600);
  };
  UI.log = function (msg, kind) {
    const log = $('#eventlog');
    const line = el('div', 'logline' + (kind ? ' ' + kind : ''), '<b>[' + (ND.App.game ? ND.App.game.time.toFixed(0) : '0') + 's]</b> ' + msg);
    log.appendChild(line);
    while (log.children.length > 7) log.removeChild(log.firstChild);
  };
  UI.waveBanner = function (title, sub) {
    const b = $('#wavebanner');
    b.innerHTML = title + (sub ? '<div class="wsub">' + sub + '</div>' : '');
    b.classList.add('show');
    setTimeout(() => b.classList.remove('show'), 2200);
  };

  // ---- 工具提示 ----
  UI.tooltip = function (e, html) { const tt = $('#tooltip'); tt.innerHTML = html; tt.classList.remove('hidden'); UI.moveTooltip(e); };
  UI.moveTooltip = function (e) { const tt = $('#tooltip'); let x = e.clientX + 16, y = e.clientY + 16; if (x + 300 > innerWidth) x = e.clientX - 300; if (y + 160 > innerHeight) y = e.clientY - 160; tt.style.left = x + 'px'; tt.style.top = y + 'px'; };
  UI.hideTooltip = function () { $('#tooltip').classList.add('hidden'); };

  // ---- 结算 ----
  UI.showReport = function (game) {
    const win = game.result === 'victory';
    const s = el('div', 'screen');
    const st = game.stats;
    s.innerHTML = '<div class="screen-inner" style="max-width:760px;">' +
      '<div class="report-title ' + (win ? 'win' : 'lose') + '">' + (win ? '防守成功' : '中枢失守') + '</div>' +
      '<div class="report-sub">事件报告 · ' + game.mapDef.name + ' · ' + (win ? '全域连通已恢复，威胁已清除' : '中枢完整度归零，汐域沦陷') + '</div>' +
      '<div class="report-grid">' +
      '<div class="report-cell"><div class="rv">' + st.wavesCleared + '/' + game.mapDef.waves + '</div><div class="rl">坚守波次</div></div>' +
      '<div class="report-cell"><div class="rv">' + st.kills + '</div><div class="rl">消灭威胁</div></div>' +
      '<div class="report-cell"><div class="rv">' + game.integrity + '</div><div class="rl">剩余完整度</div></div>' +
      '<div class="report-cell"><div class="rv">' + st.built + '</div><div class="rl">部署设备</div></div>' +
      '<div class="report-cell"><div class="rv">' + st.destroyed + '</div><div class="rl">损失设备</div></div>' +
      '<div class="report-cell"><div class="rv">' + st.leaked + '</div><div class="rl">突破次数</div></div>' +
      '<div class="report-cell"><div class="rv">' + Math.floor(st.computeEarned) + '</div><div class="rl">累计算力</div></div>' +
      '<div class="report-cell"><div class="rv">' + Math.floor(st.intelEarned) + '</div><div class="rl">累计情报</div></div>' +
      '<div class="report-cell"><div class="rv">' + Math.floor(st.dmgDealt) + '</div><div class="rl">输出伤害</div></div>' +
      '</div><div class="report-btns"><button class="btn primary" data-restart>重开本图</button><button class="btn" data-levels>返回关卡选择</button><button class="btn" data-menu>主菜单</button></div></div>';
    s.querySelector('[data-restart]').onclick = () => ND.App.startBattle(game.mapId);
    s.querySelector('[data-levels]').onclick = () => ND.App.toLevels();
    s.querySelector('[data-menu]').onclick = () => ND.App.toMenu();
    UI.screens.innerHTML = ''; UI.screens.classList.remove('hidden'); UI.screens.appendChild(s);
  };

  UI.showBattle = function (game) {
    UI.hideScreens(); UI.hud.classList.remove('hidden');
    $('#forecast').style.display = '';
    $('#hud-map').textContent = game.mapDef.name;
    $('#eventlog').innerHTML = '';
    UI.updateForecast(game);
    UI.hideSelection();
    UI.setSpeedUI(ND.App.speed); UI.setPauseUI(false);
  };
  UI.hideBattle = function () { UI.hud.classList.add('hidden'); $('#pause-overlay').classList.add('hidden'); };
})(typeof window !== 'undefined' ? window : globalThis);