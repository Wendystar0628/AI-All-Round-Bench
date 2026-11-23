/* 动态路由塔防 —— 界面：菜单、HUD、面板、图鉴、设置、结算（DOM） */
window.G = window.G || {};
(function () {
  'use strict';
  const T = G.TOWERS, E = G.ENEMIES, I = G.ITEMS;

  const ICON = {
    firewall: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12h8M12 8v8" stroke="currentColor" stroke-width="2"/></svg>',
    honeypot: '<svg viewBox="0 0 24 24"><path d="M7 4h10l-1 3c2 1 3 3 3 5a7 7 0 0 1-14 0c0-2 1-4 3-5z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="2.5" fill="currentColor"/></svg>',
    gate: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="4" height="16" fill="currentColor"/><rect x="17" y="4" width="4" height="16" fill="currentColor"/><path d="M7 8h10M7 12h10M7 16h10" stroke="currentColor" stroke-width="2"/></svg>',
    interceptor: '<svg viewBox="0 0 24 24"><path d="M4 20h16M6 20V12l6-6 6 6v8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12v5M9 14.5l3-2.5 3 2.5" stroke="currentColor" stroke-width="2"/></svg>',
    sandbox: '<svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="10" r="1.8" fill="currentColor"/></svg>',
    repair: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v10M7 12h10" stroke="currentColor" stroke-width="2.5"/></svg>',
    isolator: '<svg viewBox="0 0 24 24"><path d="M5 4v16M19 4v16M8 12h8" stroke="currentColor" stroke-width="2.5" fill="none"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    downgrade: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M4 20h16" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>',
    restore: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    worm: '<svg viewBox="0 0 24 24"><path d="M3 16c3-6 6 4 9-2s6 2 9-4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="10" r="1.6" fill="currentColor"/></svg>',
    trojan: '<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v13M4 12h16M8 4l4 3 4-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    flood: '<svg viewBox="0 0 24 24"><path d="M3 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
    ransom: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="15.5" r="1.5" fill="currentColor"/></svg>',
    hotspot: '<svg viewBox="0 0 24 24"><path d="M4 10a11 11 0 0 1 16 0M7 13.5a7 7 0 0 1 10 0M10 17a3 3 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="20" r="1.4" fill="currentColor"/></svg>',
    packer: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"/><rect x="7" y="7" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10.5" y="10.5" width="3" height="3" fill="currentColor"/></svg>',
    boss_wan: '<svg viewBox="0 0 24 24"><path d="M12 2l3 4 5-1-2 5 3 3-4 2-1 5-4-3-4 3-1-5-4-2 3-3-2-5 5 1z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="10" cy="11" r="1.3" fill="currentColor"/><circle cx="14" cy="11" r="1.3" fill="currentColor"/></svg>',
    boss_shen: '<svg viewBox="0 0 24 24"><path d="M12 2l9 18H3z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7l5 10H7z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/></svg>',
    boss_zhe: '<svg viewBox="0 0 24 24"><path d="M4 20c4-2 4-8 8-10s8-2 8 2-4 5-6 2 1-6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="6" cy="19" r="2" fill="currentColor"/></svg>'
  };
  function icon(k) { return '<span class="ico">' + (ICON[k] || '') + '</span>'; }

  const UI = {
    init(app) {
      this.app = app; this.sel = null; this.hoverKey = {}; this.lastLog = -1;
      const root = document.getElementById('ui');
      root.innerHTML = `
      <div id="hud" class="hidden">
        <div class="topbar">
          <div class="brand"><div class="logo-mark"></div><div><div class="brand-title">汐域 · 守护进程</div><div class="brand-sub" id="hud-map">分段内网</div></div></div>
          <div class="core-box"><div class="core-label">中枢完整度</div><div class="core-bar"><div class="core-fill" id="core-fill"></div><div class="core-ticks"></div></div><div class="core-num" id="core-num">100</div></div>
          <div class="res-box">
            <div class="res"><span class="res-ico cpu">λ</span><div><div class="res-label">算力</div><div class="res-num" id="cpu-num">0</div></div><div class="res-rate" id="cpu-rate">+6/s</div></div>
            <div class="res"><span class="res-ico intel">◇</span><div><div class="res-label">情报</div><div class="res-num" id="intel-num">0</div></div></div>
            <div class="res wave"><span class="res-ico">▶</span><div><div class="res-label">波次</div><div class="res-num" id="wave-num">0/14</div></div></div>
          </div>
          <div class="speed-box">
            <button class="btn icon-btn" id="btn-pause" title="暂停 / 继续 (空格)">❚❚</button>
            <button class="btn speed" data-speed="1" title="正常速度">1×</button>
            <button class="btn speed" data-speed="2" title="二倍速">2×</button>
            <button class="btn speed" data-speed="3" title="三倍速">3×</button>
            <button class="btn icon-btn" id="btn-sound" title="静音 / 取消静音">♪</button>
            <button class="btn icon-btn" id="btn-menu" title="菜单">☰</button>
          </div>
        </div>
        <div class="left-panel">
          <div class="panel forecast">
            <div class="panel-title"><span class="dot"></span>流量预报 <span class="panel-sub" id="forecast-sub">下一波</span></div>
            <div class="forecast-body" id="forecast-body"></div>
            <div class="forecast-foot"><div class="countdown" id="countdown">--</div><button class="btn primary" id="btn-next">提前召唤 <span class="bonus" id="next-bonus"></span></button></div>
          </div>
          <div class="panel legend">
            <div class="panel-title">图例</div>
            <div class="legend-row"><span class="lane lane-A"></span>入口 A 路线 <span class="lane lane-B"></span>入口 B <span class="lane lane-C"></span>入口 C</div>
            <div class="legend-row"><span class="sw iso"></span>节点隔离 <span class="sw cd"></span>隔离冷却 <span class="sw old"></span>旧链路/协议降级 <span class="sw bh"></span>黑洞/锁死</div>
          </div>
        </div>
        <div class="right-panel">
          <div class="panel sel-panel" id="sel-panel"></div>
          <div class="panel log-panel"><div class="panel-title">系统日志</div><div class="log-body" id="log-body"></div></div>
        </div>
        <div class="bottom-bar">
          <div class="deploy-group">
            <div class="group-label">部署 <span>拖到地图上</span></div>
            <div class="cards" id="tower-cards"></div>
          </div>
          <div class="deploy-group items">
            <div class="group-label">道具 <span>点击后选择目标</span></div>
            <div class="cards" id="item-cards"></div>
          </div>
          <div class="cam-hint">中键拖动 环绕 · Shift+中键 平移 · 滚轮 缩放 · F 回到默认视角 · 空格 暂停</div>
        </div>
        <div class="toast-area" id="toast-area"></div>
        <div class="banner" id="banner"></div>
        <div class="cursor-tip" id="cursor-tip"></div>
        <div class="pause-veil hidden" id="pause-veil"><div class="pause-card"><div class="pause-title">已暂停</div><div class="pause-sub">战斗与自动操作均已停止 · 按空格或点击继续</div><button class="btn primary" id="btn-resume">继续</button></div></div>
      </div>
      <div id="menu" class="screen">
        <div class="menu-bg-fade"></div>
        <div class="menu-inner">
          <div class="title-block">
            <div class="eyebrow">汐域自治域 · 守护进程控制台</div>
            <h1>网络安全<span>攻防战</span></h1>
            <div class="title-sub">蠕虫、木马、勒索软件与僵尸网络混在正常流量里涌向中枢。改变路线，守住每一个入口到中枢的连通。</div>
          </div>
          <div class="menu-grid">
            <div class="level-list" id="level-list"></div>
            <div class="menu-side">
              <div class="side-title">实战演示 <span class="side-sub">正常速度 · 可随时退出</span></div>
              <button class="demo-btn" data-demo="demo-1"><span class="demo-num">01</span><div><b>分段取舍</b><small>分段内网 · 拖动网闸隔离西边界节点，预览 A 改走 DMZ 互联</small></div></button>
              <button class="demo-btn" data-demo="demo-2"><span class="demo-num">02</span><div><b>旁路直通</b><small>骨干流域 · 洪峰冲垮网闸，C、B 改回原数据中心，投下协议降级</small></div></button>
              <button class="demo-btn" data-demo="demo-3"><span class="demo-num">03</span><div><b>蛰影现身</b><small>气隙深层 · 蛰影锁死运维环，释放冗余切换稳住防线</small></div></button>
              <div class="side-btns"><button class="btn" id="btn-codex">图鉴 · 设备手册 / 威胁档案</button><button class="btn" id="btn-settings">设置</button></div>
            </div>
          </div>
          <div class="menu-foot">鼠标中键拖动环绕视角 · Shift+中键平移 · 滚轮缩放 · 左键点选与拖放部署</div>
        </div>
      </div>
      <div id="result" class="screen hidden">
        <div class="result-card">
          <div class="eyebrow" id="result-eyebrow">事件报告</div>
          <h2 id="result-title">中枢守住</h2>
          <div class="result-sub" id="result-sub"></div>
          <div class="result-grid" id="result-grid"></div>
          <div class="result-kills" id="result-kills"></div>
          <div class="result-btns"><button class="btn primary" id="btn-retry">重开本图</button><button class="btn" id="btn-back">返回关卡选择</button></div>
        </div>
      </div>
      <div id="codex" class="screen hidden">
        <div class="codex-card">
          <div class="codex-head"><div><div class="eyebrow">守护进程资料库</div><h2>图鉴</h2></div><button class="btn" id="btn-codex-close">关闭 (Esc)</button></div>
          <div class="tabs" id="codex-tabs"><button class="tab active" data-tab="towers">设备手册</button><button class="tab" data-tab="enemies">威胁档案</button><button class="tab" data-tab="items">道具</button><button class="tab" data-tab="status">状态</button><button class="tab" data-tab="terrain">地形</button></div>
          <div class="codex-body" id="codex-body"></div>
        </div>
      </div>
      <div id="settings" class="screen hidden">
        <div class="settings-card">
          <div class="codex-head"><div><div class="eyebrow">守护进程配置</div><h2>设置</h2></div><button class="btn" id="btn-settings-close">关闭 (Esc)</button></div>
          <div class="setting-row"><label>主音量</label><input type="range" min="0" max="1" step="0.01" data-vol="master"><button class="btn small" id="btn-mute">静音</button></div>
          <div class="setting-row"><label>音乐</label><input type="range" min="0" max="1" step="0.01" data-vol="music"></div>
          <div class="setting-row"><label>音效</label><input type="range" min="0" max="1" step="0.01" data-vol="sfx"></div>
          <div class="setting-row"><label>环境声</label><input type="range" min="0" max="1" step="0.01" data-vol="amb"></div>
          <div class="setting-row"><label>泛光后期</label><button class="btn small" id="btn-bloom">开启</button><span class="hint">关闭后更省性能</span></div>
          <div class="setting-row"><label>界面尺寸</label><input type="range" min="0.85" max="1.35" step="0.05" data-ui="scale"><span class="hint">适配 1080p 到 4K</span></div>
        </div>
      </div>
      <div id="demo-ui" class="hidden">
        <div class="demo-title" id="demo-title"></div>
        <div class="subtitle" id="subtitle"></div>
        <button class="btn demo-exit" id="btn-demo-exit">退出演示 (Esc)</button>
      </div>
      <div id="fake-cursor" class="hidden"><svg viewBox="0 0 24 24"><path d="M4 2l14 11-6 1 3 6-3 1-3-6-5 4z" fill="#fff" stroke="#000" stroke-width="1"/></svg></div>
      <div id="drag-ghost" class="hidden"></div>
      <div id="tooltip" class="hidden"></div>`;
      this.el = {}; document.querySelectorAll('#ui [id]').forEach(e => this.el[e.id] = e);
      // 卡片
      const tc = this.el['tower-cards'];
      tc.innerHTML = G.TOWER_ORDER.map(k => `<div class="card tower-card" data-type="${k}" data-key="t-${k}"><div class="card-top">${icon(k)}<span class="cost cpu">${T[k].cost}<i>λ</i></span></div><div class="card-name">${T[k].name}</div><div class="card-role">${T[k].role}</div><div class="card-sub">${T[k].onNode ? (T[k].onPath ? '链路 / 节点' : '仅节点') : T[k].onPlat ? '设备平台' : '仅链路'}</div></div>`).join('');
      const ic = this.el['item-cards'];
      ic.innerHTML = G.ITEM_ORDER.map(k => `<div class="card item-card" data-item="${k}" data-key="i-${k}"><div class="card-top">${icon(k)}<span class="cost ${I[k].kind === 'intel' ? 'intel' : 'cpu'}">${I[k].cost}<i>${I[k].kind === 'intel' ? '◇' : 'λ'}</i></span></div><div class="card-name">${I[k].name}</div><div class="card-role">${I[k].target === 'node' ? '投放：交换节点' : I[k].target === 'path' ? '投放：链路' : '投放：友方塔'}</div><div class="cd-mask"></div><div class="cd-text"></div></div>`).join('');
      // 关卡
      const ll = this.el['level-list'];
      ll.innerHTML = G.MAP_ORDER.map((id, i) => { const m = G.MAPS[id]; return `<button class="level-card" data-map="${id}"><div class="level-num">0${i + 1}</div><div class="level-body"><div class="level-name">${m.name}</div><div class="level-sub">${m.sub}</div><div class="level-intro">${m.intro}</div><div class="level-meta"><span>${m.waveCount} 波</span><span>Boss · ${E[m.boss].name}</span><span class="best" id="best-${id}"></span></div></div><div class="level-go">进入 ›</div></button>`; }).join('');
      // 事件
      ll.addEventListener('click', e => { const b = e.target.closest('.level-card'); if (b) { A.play('click'); app.startMap(b.dataset.map); } });
      document.querySelectorAll('.demo-btn').forEach(b => b.addEventListener('click', () => { A.play('click'); app.startDemo(b.dataset.demo); }));
      this.el['btn-codex'].addEventListener('click', () => { A.play('click'); this.openCodex('towers'); });
      this.el['btn-settings'].addEventListener('click', () => { A.play('click'); this.openSettings(); });
      this.el['btn-codex-close'].addEventListener('click', () => this.closeCodex());
      this.el['btn-settings-close'].addEventListener('click', () => this.closeSettings());
      document.querySelectorAll('#codex-tabs .tab').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('#codex-tabs .tab').forEach(x => x.classList.toggle('active', x === b)); this.renderCodex(b.dataset.tab); A.play('click'); }));
      document.querySelectorAll('[data-vol]').forEach(r => { r.value = A.vol[r.dataset.vol]; r.addEventListener('input', () => { A.setVol(r.dataset.vol, parseFloat(r.value)); }); });
      const sc = document.querySelector('[data-ui="scale"]'); sc.value = localStorage.getItem('td_uiscale') || '1'; sc.addEventListener('input', () => { document.documentElement.style.setProperty('--ui', sc.value); try { localStorage.setItem('td_uiscale', sc.value); } catch (e) { } });
      document.documentElement.style.setProperty('--ui', sc.value);
      this.el['btn-mute'].addEventListener('click', () => { A.setMuted(!A.muted); this.syncAudioBtns(); });
      this.el['btn-bloom'].addEventListener('click', () => { app.view.bloomOn = !app.view.bloomOn; this.el['btn-bloom'].textContent = app.view.bloomOn ? '开启' : '关闭'; });
      this.el['btn-pause'].addEventListener('click', () => app.togglePause());
      this.el['btn-resume'].addEventListener('click', () => app.togglePause());
      document.querySelectorAll('.speed').forEach(b => b.addEventListener('click', () => { app.setSpeed(parseInt(b.dataset.speed)); }));
      this.el['btn-sound'].addEventListener('click', () => { A.setMuted(!A.muted); this.syncAudioBtns(); });
      this.el['btn-menu'].addEventListener('click', () => app.openMenu());
      this.el['btn-next'].addEventListener('click', () => app.callNextWave());
      this.el['btn-retry'].addEventListener('click', () => app.startMap(app.game ? app.game.mapId : 'seg'));
      this.el['btn-back'].addEventListener('click', () => app.toMenu());
      this.el['btn-demo-exit'].addEventListener('click', () => app.exitDemo());
      // 卡片交互（拖放 / 点选）
      for (const c of document.querySelectorAll('.tower-card')) {
        c.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); app.beginDrag(c.dataset.type, e); });
        c.addEventListener('mouseenter', e => this.showTip(c, T[c.dataset.type].desc + '<div class="tip-cost">部署：' + (T[c.dataset.type].onNode ? (T[c.dataset.type].onPath ? '链路或交换节点' : '交换节点（消耗 ' + T[c.dataset.type].nodeIntel + ' 情报）') : T[c.dataset.type].onPlat ? '设备平台' : '链路') + '</div>', c.dataset.type));
        c.addEventListener('mouseleave', () => this.hideTip());
      }
      for (const c of document.querySelectorAll('.item-card')) {
        c.addEventListener('click', () => app.beginItem(c.dataset.item));
        c.addEventListener('mouseenter', () => this.showTip(c, I[c.dataset.item].desc, c.dataset.item));
        c.addEventListener('mouseleave', () => this.hideTip());
      }
      this.syncAudioBtns();
      // 日志
      this.el['log-body'].innerHTML = '';
    },
    syncAudioBtns() { const muted = G.Audio.muted; this.el['btn-mute'].textContent = muted ? '取消静音' : '静音'; this.el['btn-sound'].textContent = muted ? '♪̸' : '♪'; this.el['btn-sound'].classList.toggle('off', muted); },
    showTip(card, html, key) { const t = this.el.tooltip; t.innerHTML = (ICON[key] ? '<div class="tip-ico">' + ICON[key] + '</div>' : '') + '<div>' + html + '</div>'; t.classList.remove('hidden'); const r = card.getBoundingClientRect(); t.style.left = Math.min(window.innerWidth - 380, r.left) + 'px'; t.style.top = (r.top - t.offsetHeight - 10) + 'px'; },
    hideTip() { this.el.tooltip.classList.add('hidden'); },
    showScreen(name) {
      for (const id of ['menu', 'result', 'codex', 'settings']) this.el[id].classList.toggle('hidden', id !== name);
      this.el.hud.classList.toggle('hidden', !(name === 'battle'));
      if (name === 'battle') this.refreshMap();
      document.body.classList.toggle('in-battle', name === 'battle');
    },
    refreshMap() { const g = this.app.game; if (g) { this.el['hud-map'].textContent = g.def.name + ' · ' + g.def.sub; this.el['wave-num'].textContent = '0/' + g.def.waves.length; } },
    setSelection(sel) { this.sel = sel; this.renderSel(); },
    renderSel() {
      const g = this.app.game; const p = this.el['sel-panel']; const sel = this.sel;
      if (!g) { p.innerHTML = ''; return; }
      if (!sel) { p.innerHTML = `<div class="panel-title">选中查看</div><div class="sel-empty">点击地图上的塔、敌人或地块查看说明。<br><br>拖动下方卡片到链路 / 节点 / 平台上部署。拦截器放下后移动鼠标设定朝向，左键确认，右键取消。</div>`; return; }
      if (sel.kind === 'tower') {
        const t = sel.ref; if (t.dead || !g.towers.includes(t)) { this.sel = null; this.renderSel(); return; }
        const d = G.Sim.towerDef(t); const hp = Math.max(0, t.hp), ratio = hp / t.maxHp;
        let html = `<div class="panel-title">${icon(t.type)}${d.name}<span class="lvl">${t.level} 级${t.branch ? ' · ' + G.TOWERS[t.type].branches[t.branch].name : ''}</span></div>`;
        if (t.isItem) html += `<div class="sel-role">临时隔离器 · 剩余 ${Math.ceil(t.expireAt - g.t)} 秒</div>`;
        else html += `<div class="sel-role">${d.role}${t.onNode ? ' · 隔离节点「' + g.M.nodeByNum[t.onNode].name + '」' : ''}</div>`;
        html += `<div class="hp-bar"><div class="hp-fill" style="width:${(ratio * 100).toFixed(1)}%"></div>${t.shield > 0 ? `<div class="hp-shield" style="width:${Math.min(100, t.shield / t.maxHp * 100)}%"></div>` : ''}</div><div class="hp-num">${hp.toFixed(0)} / ${t.maxHp}${t.shield > 0 ? ' <span class="sh">+' + t.shield.toFixed(0) + ' 护盾</span>' : ''}${t.encUntil > g.t ? ' <span class="enc">🔒 加密 ' + Math.ceil(t.encUntil - g.t) + 's</span>' : ''}</div>`;
        if (d.cap && !t.isItem) html += `<div class="stat-row"><span>阻挡容量</span><b>${d.cap + (t.skillUntil > g.t && t.type === 'firewall' ? 2 : 0)}（已挡 ${t.blockers.size}）</b></div>`;
        if (d.dmg && !t.isItem) html += `<div class="stat-row"><span>伤害</span><b>${d.dmg}${t.stormUntil > g.t ? ' <span class="enc">风暴 -40%</span>' : ''}</b></div><div class="stat-row"><span>射速</span><b>${d.rate.toFixed(1)}/s</b></div>`;
        if (d.range) html += `<div class="stat-row"><span>范围</span><b>${d.range.toFixed(1)} 格${t.type === 'interceptor' ? ' · 90° 扇区' : ''}</b></div>`;
        if (d.lure) html += `<div class="stat-row"><span>诱敌范围</span><b>${d.lure.toFixed(1)} 格</b></div>`;
        if (d.heal) html += `<div class="stat-row"><span>治疗</span><b>${d.heal}/s</b></div>`;
        if (t.isItem) html += `<div class="sel-desc">应急隔离器会持续到有效期结束或被敌人冲毁，不产生情报。</div>`;
        else html += `<div class="sel-desc">${t.level === 1 ? d.desc : (G.TOWERS[t.type].up.desc || d.desc)}${t.branch ? '<br><b>分支 · ' + G.TOWERS[t.type].branches[t.branch].name + '：</b>' + G.TOWERS[t.type].branches[t.branch].desc : ''}</div>`;
        if (!t.isItem) {
          html += `<div class="sel-btns">`;
          if (d.skill) { const cd = Math.max(0, t.skillCd - g.t); html += `<button class="btn skill" data-act="skill" ${cd > 0 || t.encUntil > g.t ? 'disabled' : ''}>${d.skill.name}${cd > 0 ? ' · ' + Math.ceil(cd) + 's' : ''}</button>`; }
          if (t.level < 2) { const uc = G.Sim.upgradeCost(g, t); if (G.TOWERS[t.type].branches) { for (const bk in G.TOWERS[t.type].branches) { const b = G.TOWERS[t.type].branches[bk]; const cost = G.Sim.upgradeCost(g, t, bk); html += `<button class="btn upgrade" data-act="upgrade" data-branch="${bk}">${b.name} · ${cost.cpu}λ${cost.intel ? ' + ' + cost.intel + '◇' : ''}</button>`; } } else html += `<button class="btn upgrade" data-act="upgrade">升级 2 级 · ${uc.cpu}λ</button>`; }
          html += `<button class="btn danger" data-act="sell">撤下 +${Math.round(t.invested * 0.6)}λ</button></div>`;
          if (G.TOWERS[t.type].skill) html += `<div class="skill-desc">技能：${G.TOWERS[t.type].skill.desc}</div>`;
        }
        p.innerHTML = html;
        p.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => { const act = b.dataset.act; if (act === 'skill') this.app.castSkill(t.id); else if (act === 'upgrade') this.app.upgrade(t.id, b.dataset.branch); else if (act === 'sell') this.app.sell(t.id); }));
        return;
      }
      if (sel.kind === 'enemy') {
        const e = sel.ref; if (e.dead || !g.enemies.includes(e)) { this.sel = null; this.renderSel(); return; }
        const d = e.def; const hp = Math.max(0, e.hp), ratio = hp / e.maxHp; let name = d.name; if (d.boss && e.bossPhase) name += ' · ' + ({ lurk: '潜伏', escalate: '提权', destroy: '破坏' }[e.bossPhase] || '');
        let html = `<div class="panel-title">${icon(e.type)}${name}${d.boss ? '<span class="lvl boss">BOSS</span>' : ''}</div>`;
        html += `<div class="hp-bar enemy"><div class="hp-fill" style="width:${(ratio * 100).toFixed(1)}%"></div>${e.shield > 0 ? `<div class="hp-shield" style="width:${Math.min(100, e.shield / e.maxHp * 100)}%"></div>` : ''}</div><div class="hp-num">${hp.toFixed(0)} / ${e.maxHp.toFixed(0)}${e.shield > 0 ? ' <span class="sh">+' + e.shield.toFixed(0) + ' 护盾</span>' : ''}</div>`;
        const st = []; if (!e.revealed) st.push('<span class="tag bad">伪装' + (d.phases ? ' · 需检测' : '') + '</span>'); if (e.blockedBy != null) st.push('<span class="tag warn">被阻挡</span>'); if (e.trapUntil > g.t) st.push('<span class="tag warn">被诱捕</span>'); if (e.slowUntil > g.t) st.push('<span class="tag">减速</span>'); if (e.mode === 'siege' || e.mode === 'siegeAttack') st.push('<span class="tag bad">冲向隔离节点</span>'); if (e.mode === 'lured') st.push('<span class="tag">被蜜罐吸引</span>'); if (e.fly) st.push('<span class="tag">飞行 · 无视阻挡</span>'); if (e.shield > 0) st.push('<span class="tag">护盾</span>');
        if (st.length) html += `<div class="tags">${st.join('')}</div>`;
        html += `<div class="stat-row"><span>生命</span><b>${e.maxHp.toFixed(0)}</b></div><div class="stat-row"><span>速度</span><b>${d.speed.toFixed(2)} 格/s</b></div><div class="stat-row"><span>到达出口伤害</span><b>-${d.leak}</b></div><div class="stat-row"><span>击杀回收</span><b>+${d.cpu}λ${d.key ? ' +1◇' : ''}</b></div>`;
        if (d.melee) html += `<div class="stat-row"><span>近战</span><b>${d.melee.dmg} / ${d.melee.cd}s</b></div>`;
        if (d.ranged) html += `<div class="stat-row"><span>远程</span><b>${d.ranged.dmg} / ${d.ranged.cd}s · 射程 ${d.ranged.r} 格 · 加密 ${d.ranged.enc}s</b></div>`;
        if (d.siege) html += `<div class="stat-row"><span>节点重击</span><b>${d.siege.dmg} / ${d.siege.cd}s</b></div>`;
        html += `<div class="sel-desc">${d.desc}</div>`;
        p.innerHTML = html; return;
      }
      if (sel.kind === 'cell') {
        const c = sel.ref; let html = `<div class="panel-title">${c.type === 'node' ? '交换节点' : c.type === 'plat' ? '设备平台' : c.type === 'path' ? '链路' : c.type === 'old' ? '旧链路' : c.type === 'obst' ? '障碍' : c.type === 'entry' ? '入口' : c.type === 'exit' ? '出口' : c.type === 'river' ? '公网流' : c.type === 'gap' ? '气隙' : '地块'}</div>`;
        if (c.type === 'node') {
          const iso = c.iso, cd = g.t < c.reopenAt; html += `<div class="sel-role">「${c.name}」 · ${iso ? (iso.kind === 'isolator' ? '应急隔离器隔离中' : '已被 ' + (g.towers.find(t => t.id === iso.towerId) || {}).type ? G.TOWERS[(g.towers.find(t => t.id === iso.towerId) || { type: 'gate' }).type].name + ' 隔离' : '隔离中') : cd ? '直通 · ' + Math.ceil(c.reopenAt - g.t) + ' 秒后可再次隔离' : '直通'}</div>`;
          html += `<div class="sel-desc">${G.TERRAIN_INFO[2].desc}</div><div class="sel-desc">把网闸或防火墙拖到此处即可隔离；隔离前会预览各入口的新路线，封死入口或敌人的操作会被拒绝并指出位置。</div>`;
          if (!iso && !cd) { const r1 = G.Sim.canDeploy(g, 'gate', c.id); html += `<div class="sel-btns"><button class="btn upgrade" data-cell="${c.id}" data-t="gate" ${r1.ok ? '' : 'disabled'}>部署网闸 · ${G.TOWERS.gate.cost}λ + ${G.TOWERS.gate.nodeIntel}◇</button><button class="btn upgrade" data-cell="${c.id}" data-t="firewall" ${G.Sim.canDeploy(g, 'firewall', c.id).ok ? '' : 'disabled'}>部署防火墙 · ${G.TOWERS.firewall.cost}λ + ${G.TOWERS.firewall.nodeIntel}◇</button></div>`; if (!r1.ok) html += `<div class="sel-desc warn">${r1.reason}</div>`; }
        } else if (c.type === 'plat') html += `<div class="sel-desc">${G.TERRAIN_INFO[1].desc}</div><div class="sel-desc">把拦截器、沙箱或修复进程拖到此处。</div>`;
        else if (c.type === 'path' || c.type === 'old') html += `<div class="sel-desc">${(c.type === 'old' ? G.TERRAIN_INFO[3] : G.TERRAIN_INFO[0]).desc}</div>`;
        else if (c.type === 'entry') html += `<div class="sel-role">入口「${c.name}」</div><div class="sel-desc">${G.TERRAIN_INFO[5].desc}</div>`;
        else if (c.type === 'exit') html += `<div class="sel-role">出口「${c.name}」</div><div class="sel-desc">${G.TERRAIN_INFO[5].desc}</div>`;
        else html += `<div class="sel-desc">${G.TERRAIN_INFO[4].desc}</div>`;
        p.innerHTML = html;
        p.querySelectorAll('[data-cell]').forEach(b => b.addEventListener('click', () => this.app.quickDeploy(b.dataset.t, b.dataset.cell)));
      }
    },
    update(dt) {
      const g = this.app.game; if (!g) return; const app = this.app;
      this.el['core-fill'].style.width = Math.max(0, g.core) + '%'; this.el['core-fill'].classList.toggle('low', g.core < 35); this.el['core-num'].textContent = Math.max(0, Math.round(g.core));
      this.el['cpu-num'].textContent = Math.floor(g.cpu); this.el['intel-num'].textContent = g.intel;
      this.el['wave-num'].textContent = Math.min(g.def.waves.length, g.waveIdx + 1 + (g.phase === 'prep' ? 0 : 0)) + '/' + g.def.waves.length;
      // 预报
      const up = G.Sim.upcomingWave(g); const next = (g.phase === 'prep' || g.phase === 'inter');
      if (this._lastForecast !== up.idx + (next ? 'n' : 'c')) { this._lastForecast = up.idx + (next ? 'n' : 'c'); this.renderForecast(up, next); }
      if (next) { this.el.countdown.textContent = '下一波 ' + Math.ceil(g.interT) + 's'; this.el['next-bonus'].textContent = '+' + Math.round(g.interT * 5) + 'λ'; this.el['btn-next'].disabled = false; }
      else { this.el.countdown.textContent = '进行中'; this.el['next-bonus'].textContent = ''; this.el['btn-next'].disabled = true; }
      // 卡片状态
      for (const c of document.querySelectorAll('.tower-card')) { const k = c.dataset.type; const ok = g.cpu >= T[k].cost; c.classList.toggle('poor', !ok); c.classList.toggle('dragging', app.drag && app.drag.type === k); }
      for (const c of document.querySelectorAll('.item-card')) { const k = c.dataset.item; const cd = Math.max(0, g.itemCd[k] - g.t); const afford = I[k].kind === 'intel' ? g.intel >= I[k].cost : g.cpu >= I[k].cost; c.classList.toggle('cool', cd > 0); c.classList.toggle('poor', !afford); c.classList.toggle('active', app.itemMode === k); c.querySelector('.cd-mask').style.height = cd > 0 ? (cd / I[k].cd * 100) + '%' : '0'; c.querySelector('.cd-text').textContent = cd > 0 ? Math.ceil(cd) + 's' : ''; }
      // 速度按钮
      document.querySelectorAll('.speed').forEach(b => b.classList.toggle('active', g.speed === parseInt(b.dataset.speed) && !g.paused));
      this.el['btn-pause'].textContent = g.paused ? '▶' : '❚❚'; this.el['btn-pause'].classList.toggle('active', g.paused);
      this.el['pause-veil'].classList.toggle('hidden', !g.paused || app.mode === 'demo');
      // 日志
      if (g.log.length && this.lastLog !== g.log.length + ':' + (g.log[g.log.length - 1].t)) { this.lastLog = g.log.length + ':' + g.log[g.log.length - 1].t; const items = g.log.slice(-6); this.el['log-body'].innerHTML = items.map(l => `<div class="log-line ${l.kind}"><span class="log-t">${l.t.toFixed(0)}s</span>${l.text}</div>`).join(''); }
      // 选中面板刷新（每 0.25s）
      this._selT = (this._selT || 0) + dt; if (this._selT > 0.25) { this._selT = 0; if (this.sel) this.renderSel(); }
    },
    renderForecast(up, next) {
      const g = this.app.game; const def = up.def; const byEntry = {};
      for (const gr of def.groups) { (byEntry[gr[0]] = byEntry[gr[0]] || {})[gr[1]] = (byEntry[gr[0]][gr[1]] || 0) + gr[2]; }
      let html = `<div class="forecast-head"><div class="fw-label">${def.label}${def.flood ? ' <span class="tag bad">洪峰</span>' : ''}</div><div class="fw-idx">第 ${up.idx + 1} 波</div></div>`;
      for (const en in byEntry) {
        html += `<div class="fw-row"><span class="lane lane-${en}"></span><span class="fw-entry">${g.M.entries.find(c => c.entryId === en).name}</span><div class="fw-enemies">`;
        for (const t in byEntry[en]) html += `<span class="fw-e" title="${E[t].name}">${icon(t)}<b>${byEntry[en][t]}</b></span>`;
        html += `</div></div>`;
      }
      const total = def.groups.reduce((a, gr) => a + gr[2], 0); html += `<div class="fw-total">共 ${total} 个威胁${def.flood ? ' · 三入口同时出兵' : ''}</div>`;
      this.el['forecast-body'].innerHTML = html;
      this.el['forecast-sub'].textContent = next ? '下一波' : '当前波';
    },
    toast(text, kind, dur) { const a = this.el['toast-area']; const d = document.createElement('div'); d.className = 'toast ' + (kind || 'info'); d.textContent = text; a.appendChild(d); setTimeout(() => d.classList.add('out'), (dur || 2600)); setTimeout(() => d.remove(), (dur || 2600) + 400); },
    banner(title, sub, kind, dur) { const b = this.el.banner; b.innerHTML = `<div class="banner-title">${title}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`; b.className = 'banner show ' + (kind || ''); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('show'), dur || 2600); },
    subtitle(text) { const s = this.el.subtitle; if (!text) { s.classList.remove('show'); return; } s.innerHTML = text; s.classList.add('show'); },
    cursorTip(text, kind) { const t = this.el['cursor-tip']; if (!text) { t.classList.add('hidden'); return; } t.textContent = text; t.className = 'cursor-tip ' + (kind || ''); t.classList.remove('hidden'); },
    showResult(g, win) {
      const st = g.stats; this.el['result-eyebrow'].textContent = '事件报告 · ' + g.def.name; this.el['result-title'].textContent = win ? '中枢守住' : '中枢失守'; this.el['result-title'].className = win ? 'win' : 'lose';
      this.el['result-sub'].textContent = win ? '全部 ' + g.def.waves.length + ' 波入侵已被击退。' : '第 ' + (g.waveIdx + 1) + ' 波入侵攻破了中枢。';
      const rows = [['坚持波次', (st.waves || Math.max(0, g.waveIdx)) + ' / ' + g.def.waves.length], ['用时', formatTime(g.t)], ['中枢完整度', Math.round(g.core) + ' / 100'], ['消灭威胁', st.kills], ['漏过威胁', st.leaks], ['部署设备', st.built], ['损失设备', st.lost], ['节点隔离次数', st.isolated], ['获得情报', st.intelEarned], ['消耗算力', Math.round(st.cpuSpent)], ['造成伤害', Math.round(st.dmg)], ['Boss 击杀', st.bossKills]];
      this.el['result-grid'].innerHTML = rows.map(r => `<div class="rg"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('');
      this.el['result-kills'].innerHTML = '<div class="rk-title">威胁清除明细</div>' + G.ENEMY_ORDER.filter(k => st.killByType[k]).map(k => `<div class="rk">${icon(k)}<span>${E[k].name}</span><b>${st.killByType[k]}</b></div>`).join('');
      if (win) { try { const best = JSON.parse(localStorage.getItem('td_best') || '{}'); if (!best[g.mapId] || best[g.mapId].core < g.core) { best[g.mapId] = { core: Math.round(g.core), time: g.t }; localStorage.setItem('td_best', JSON.stringify(best)); } } catch (e) { } }
      this.refreshBest();
    },
    refreshBest() { try { const best = JSON.parse(localStorage.getItem('td_best') || '{}'); for (const id of G.MAP_ORDER) { const el = document.getElementById('best-' + id); if (el) el.textContent = best[id] ? '最佳 · 完整度 ' + best[id].core : ''; } } catch (e) { } },
    openCodex(tab) { this.el.codex.classList.remove('hidden'); document.querySelectorAll('#codex-tabs .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab)); this.renderCodex(tab); },
    closeCodex() { this.el.codex.classList.add('hidden'); },
    openSettings() { this.el.settings.classList.remove('hidden'); this.el['btn-bloom'].textContent = this.app.view.bloomOn ? '开启' : '关闭'; },
    closeSettings() { this.el.settings.classList.add('hidden'); },
    renderCodex(tab) {
      const b = this.el['codex-body']; let html = '';
      if (tab === 'towers') {
        for (const k of G.TOWER_ORDER) { const d = T[k]; html += `<div class="cx-card"><div class="cx-head">${icon(k)}<div><div class="cx-name">${d.name}</div><div class="cx-sub">${d.role} · ${d.cost} 算力${d.nodeIntel ? ' · 隔离节点 +' + d.nodeIntel + ' 情报' : ''}</div></div></div><div class="cx-desc">${d.desc}</div><div class="cx-rows"><div><span>生命</span><b>${d.hp}</b></div>${d.cap ? `<div><span>阻挡</span><b>${d.cap}</b></div>` : ''}${d.dmg ? `<div><span>伤害</span><b>${d.dmg} / ${(1 / d.rate).toFixed(2)}s</b></div>` : ''}${d.range ? `<div><span>范围</span><b>${d.range} 格</b></div>` : ''}${d.lure ? `<div><span>诱敌</span><b>${d.lure} 格</b></div>` : ''}${d.heal ? `<div><span>治疗</span><b>${d.heal}/s</b></div>` : ''}</div><div class="cx-up"><b>2 级</b>：${d.up.desc}</div>${d.branches ? `<div class="cx-up"><b>分支（二选一）</b>：${Object.keys(d.branches).map(bk => d.branches[bk].name + ' — ' + d.branches[bk].desc + '（' + d.branches[bk].cost + ' 算力 + ' + d.branches[bk].intel + ' 情报）').join('<br>')}</div>` : ''}${d.skill ? `<div class="cx-up"><b>主动技能 · ${d.skill.name}</b>：${d.skill.desc}（冷却 ${d.skill.cd}s）</div>` : ''}</div>`; }
      } else if (tab === 'enemies') {
        for (const k of G.ENEMY_ORDER) { const d = E[k]; html += `<div class="cx-card ${d.boss ? 'boss' : ''}"><div class="cx-head">${icon(k)}<div><div class="cx-name">${d.name}${d.boss ? ' <span class="lvl boss">BOSS</span>' : ''}</div><div class="cx-sub">${d.boss ? d.title : '生命 ' + d.hp + ' · 速度 ' + d.speed + ' · 到达出口 -' + d.leak + ' 完整度 · 击杀 +' + d.cpu + ' 算力' + (d.key ? ' +1 情报' : '')}</div></div></div><div class="cx-desc">${d.desc}</div></div>`; }
      } else if (tab === 'items') {
        for (const k of G.ITEM_ORDER) { const d = I[k]; html += `<div class="cx-card"><div class="cx-head">${icon(k)}<div><div class="cx-name">${d.name}</div><div class="cx-sub">${d.kind === 'intel' ? '情报 ' + d.cost : '算力 ' + d.cost} · 冷却 ${d.cd}s</div></div></div><div class="cx-desc">${d.desc}</div></div>`; }
      } else if (tab === 'status') { for (const s of G.STATUS_INFO) html += `<div class="cx-card"><div class="cx-head"><div><div class="cx-name">${s.name}</div></div></div><div class="cx-desc">${s.desc}</div></div>`; }
      else { for (const s of G.TERRAIN_INFO) html += `<div class="cx-card"><div class="cx-head"><div><div class="cx-name">${s.name}</div></div></div><div class="cx-desc">${s.desc}</div></div>`; html += `<div class="cx-card"><div class="cx-head"><div><div class="cx-name">镜头与操作</div></div></div><div class="cx-desc">${G.CAMERA_HINT}；左键只用于点选和拖放部署；空格暂停；1/2/3 调速。</div></div>`; }
      b.innerHTML = html;
    },
    fakeCursor(x, y, visible, pressed) { const c = document.getElementById('fake-cursor'); c.classList.toggle('hidden', !visible); c.style.transform = `translate(${x}px,${y}px) scale(${pressed ? 0.9 : 1})`; c.classList.toggle('pressed', !!pressed); },
    ghost(x, y, visible, html) { const g = document.getElementById('drag-ghost'); g.classList.toggle('hidden', !visible); if (html) g.innerHTML = html; g.style.transform = `translate(${x}px,${y}px)`; },
  };
  function formatTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ' 分 ' + (s < 10 ? '0' : '') + s + ' 秒'; }
  const A = G.Audio;
  UI.ICON = ICON; UI.icon = icon;
  G.UI = UI;
})();
