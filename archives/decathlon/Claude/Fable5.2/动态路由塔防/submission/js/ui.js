/* 网络安全攻防战 — 界面：HUD、流量预报、选中面板、图鉴、关卡选择、事件报告 */
(function (root) {
  'use strict';
  const TD = root.TD, ic = TD.icon;
  const $ = (s, p) => (p || document).querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const mmss = t => { t = Math.max(0, Math.floor(t)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const EC = TD.ENTRY_COLORS, XC = TD.EXIT_COLORS;

  const UI = TD.UI = {
    app: null, sim: null, sel: null, cache: {}, logN: 0, bannerQ: [], bannerT: 0, cx: null, tipKey: '',

    init(app) {
      this.app = app; const ui = this.root = $('#ui');
      ui.innerHTML = `
      <div id="hud" class="hidden">
        <div id="topbar">
          <div class="panel seg mapname"><div><b id="tbMap"></b><span id="tbCode"></span></div></div>
          <div class="panel seg"><div class="res c" id="rC">${ic('compute')}<div><i>算力 COMPUTE</i><b>0</b></div></div><div class="res i" id="rI">${ic('intel')}<div><i>情报 INTEL</i><b>0</b></div></div>
            <div class="res h" id="rH">${ic('integrity')}<div><i>中枢完整度 INTEGRITY</i><b>20</b><div class="hpbar"><u></u></div></div></div></div>
          <div class="panel seg wavebox">${ic('wave')}<div><b id="tbWave">波次 1/14</b><div class="st" id="tbPhase"></div></div><button class="btn pri" id="btnNext" data-tip="next">立即开始 <span class="kbd">N</span></button></div>
          <div class="grow"></div>
          <div class="panel seg spd"><span class="lab" id="tbSpd">速度 1×</span>
            <button class="btn sq" id="bPause" data-tip="pause">${ic('pause')}</button><button class="btn sq" data-spd="1">1×</button><button class="btn sq" data-spd="2">2×</button><button class="btn sq" data-spd="3">3×</button></div>
          <div class="panel seg spd"><button class="btn sq" id="bHome" data-tip="home">${ic('home')}</button><button class="btn sq" id="bBook" data-tip="book">${ic('book')}</button><button class="btn sq" id="bMute" data-tip="mute">${ic('sound')}</button><button class="btn sq" id="bMenu" data-tip="menu">${ic('menu')}</button></div>
        </div>
        <div id="left">
          <div class="panel" id="forecast"><div class="ph">流量预报<small>TRAFFIC FORECAST</small></div><div id="fcBody"></div></div>
          <div class="panel" id="logp"><div class="ph">系统日志<small>daemon@xiyu:/var/log</small></div><div id="log"></div></div>
        </div>
        <div id="right"><div class="panel" style="flex:1;display:flex;flex-direction:column;min-height:0"><div class="ph" id="insT">守护进程<small id="insS">INSPECTOR</small></div><div id="ins"></div></div></div>
        <div id="deploy"><div class="panel" id="cards"></div><div class="panel" id="items"></div></div>
        <div id="bossbar" class="panel hidden"><div class="nm"><b id="bbN"></b><span id="bbP"></span><em id="bbH"></em></div><div class="bb"><u id="bbU"></u></div></div>
        <div id="banner"></div><div id="toasts"></div><div id="hint" class="hidden"></div>
        <div id="confirm" class="panel hidden"></div>
      </div>
      <div id="menu" class="screen scanl hidden"></div><div id="levels" class="screen dim scanl hidden"></div><div id="codex" class="screen dim scanl hidden"></div><div id="report" class="screen dim scanl hidden"></div>
      <div id="pause" class="modal hidden"></div><div id="settings" class="modal hidden"></div>
      <div id="demo" class="hidden"><div id="dTag">实战演示 · 自动操作中</div><div id="dTitle" class="hidden"></div><div id="dSub" class="hidden"></div><button class="btn warn" id="dExit">${ic('close')} 退出演示 <span class="kbd">Esc</span></button><div id="dProg"></div></div>
      <div id="dragGhost" class="hidden"></div>
      <div id="cursor" class="hidden"><svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M4 2l15 9.500-6.500 1.300 4 7.200-2.800 1.500-4-7.300L5 18.500z" fill="#fff" stroke="#06101c" stroke-width="1.400" stroke-linejoin="round"/></svg><div class="rp"></div></div>
      <div id="tip" class="panel hidden"></div><div id="fade"></div>`;
      this.buildMenu(); this.buildPause(); this.buildSettings();
      // 全局点击委托
      ui.addEventListener('click', e => this.onClick(e));
      ui.addEventListener('mousemove', e => this.onHover(e));
      ui.addEventListener('mouseover', e => { const b = e.target.closest('.btn,.card,.abtn,.cxi,.lv'); if (b && b !== this._hov) { this._hov = b; TD.Audio && TD.Audio.sfx('hover'); } });
      $('#cards').addEventListener('pointerdown', e => { const c = e.target.closest('.card'); if (c && e.button === 0) { e.preventDefault(); TD.Input.beginCard(c.dataset.t, e); } });
      $('#items').addEventListener('pointerdown', e => { const c = e.target.closest('.card'); if (c && e.button === 0) { e.preventDefault(); TD.Input.beginItem(c.dataset.k, e); } });
      $('#ins').addEventListener('pointerdown', e => { const b = e.target.closest('[data-act]'); if (b && e.button === 0) { e.preventDefault(); e.stopPropagation(); this.insAct(b.dataset.act, b.dataset.arg); } });
    },

    fade(cb) { const f = $('#fade'); f.classList.add('on'); setTimeout(() => { cb(); requestAnimationFrame(() => setTimeout(() => f.classList.remove('on'), 60)); }, 360); },
    show(name) {
      for (const s of ['menu', 'levels', 'codex', 'report']) $('#' + s).classList.toggle('hidden', s !== name);
      $('#pause').classList.add('hidden'); $('#settings').classList.add('hidden'); this.hideTip();
      this.screen = name || null;
      if (name === 'levels') this.buildLevels();
    },
    hud(on) { $('#hud').classList.toggle('hidden', !on); },

    // ---------------- 主菜单 ----------------
    buildMenu() {
      $('#menu').innerHTML = `
        <div class="boot mono">[ <b>OK</b> ] xiyu-guardd 守护进程已加载　　[ <b>OK</b> ] 路由收敛引擎 online<br>[ <i>WARN</i> ] 威胁情报：攻击组织“蛰影”正在渗透自治域“汐域”<br>[ <b>OK</b> ] 等待操作员接管 _</div>
        <h1>网络安全<br>攻防战</h1><h2>动态路由塔防<span>XIYU · GUARD DAEMON OS</span></h2>
        <div class="mb">
          <button class="btn pri" data-go="levels">${ic('shield')} 进入防区 <small>SELECT SECTOR</small></button>
          <button class="btn" data-go="demo">${ic('demo')} 实战演示 <small>3 段 · 约 60 秒</small></button>
          <button class="btn" data-go="codex">${ic('book')} 设备手册 / 威胁档案 <small>CODEX</small></button>
          <button class="btn" data-go="help">${ic('info')} 操作与规则说明 <small>MANUAL</small></button>
          <button class="btn" data-go="settings">${ic('gear')} 声音设置 <small>AUDIO</small></button>
        </div>
        <div class="ft">中键拖动环绕 · Shift+中键平移 · 滚轮缩放 · 左键点选与拖放部署</div>`;
    },
    buildPause() {
      $('#pause').innerHTML = `<div class="panel"><div class="ph">守护进程菜单<small>PAUSED</small></div><div class="mbody">
        <button class="btn pri" data-pm="resume">${ic('play')} 继续</button><button class="btn" data-pm="restart">${ic('retry')} 重开本图</button><button class="btn" data-pm="levels">${ic('back')} 返回关卡选择</button>
        <button class="btn" data-pm="codex">${ic('book')} 设备手册 / 威胁档案</button><button class="btn" data-pm="help">${ic('info')} 操作与规则说明</button><button class="btn" data-pm="settings">${ic('gear')} 声音设置</button><button class="btn" data-pm="menu">${ic('home')} 返回主菜单</button></div></div>`;
    },
    buildSettings() {
      const A = TD.Audio ? TD.Audio.vol : { master: 0.8, music: 0.6, sfx: 0.8 };
      const row = (k, n) => `<div class="sld"><span>${n}</span><input type="range" min="0" max="100" value="${Math.round(A[k] * 100)}" data-vol="${k}"><em>${Math.round(A[k] * 100)}</em></div>`;
      $('#settings').innerHTML = `<div class="panel"><div class="ph">声音设置<small>AUDIO</small></div><div class="mbody">${row('master', '总音量')}${row('music', '音乐')}${row('amb', '环境声')}${row('sfx', '音效')}
        <button class="btn" data-pm="mute" id="setMute">${ic('mute')} 静音：关</button><button class="btn pri" data-pm="closeSet">${ic('check')} 完成</button></div></div>`;
      $('#settings').addEventListener('input', e => { const k = e.target.dataset.vol; if (!k) return; const v = e.target.value / 100; e.target.nextElementSibling.textContent = e.target.value; TD.Audio.setVol(k, v); });
    },
    setMuteUi(m) { $('#bMute').innerHTML = ic(m ? 'mute' : 'sound'); $('#bMute').classList.toggle('on', m); const s = $('#setMute'); if (s) s.innerHTML = ic(m ? 'mute' : 'sound') + ' 静音：' + (m ? '开' : '关'); },

    // ---------------- 关卡选择 ----------------
    buildLevels() {
      const box = $('#levels');
      box.innerHTML = `<button class="btn backbtn" data-go="menu">${ic('back')} 返回</button><div class="stitle">选择防区</div><div class="ssub">SELECT SECTOR // 三张地图均可直接进入</div><div id="lvRow"></div>`;
      const row = $('#lvRow');
      TD.MAP_ORDER.forEach((id, k) => {
        const d = TD.MAPS[id], g = TD.parseMap(d), boss = TD.ENEMIES[d.boss];
        const c = el('div', 'panel lv'); c.dataset.map = id; c.style.animation = 'statIn 0.5s ' + (k * 0.1) + 's both';
        c.innerHTML = `<canvas width="680" height="380"></canvas><div class="bd"><h3>${String(k + 1).padStart(2, '0')} ${d.name}<small>${d.sub}</small></h3><div class="mono" style="font-size:.74rem;color:var(--mu);letter-spacing:.1em">${d.code}</div>
          <p>${d.brief}</p><div class="io">${g.entries.map(e => `<span style="color:${EC[e.id]}">入口 ${e.id} ${e.name}</span>`).join('')}${g.exits.map(e => `<span style="color:${XC[e.id]}">出口 ${e.id} ${e.name}</span>`).join('')}</div>
          <div class="tp">${d.tips.map(t => '<div>' + t + '</div>').join('')}</div><div class="boss">${ic(d.boss)} 最终波 Boss：${boss.name} · 交换节点 ${g.nodes.length} 个</div></div>
          <div class="go"><button class="btn pri">${ic('arrow')} 接管防区</button></div>`;
        row.appendChild(c); this.drawMini(c.querySelector('canvas'), g);
      });
    },
    drawMini(cv, g) {
      const x = cv.getContext('2d'), W = cv.width, H = cv.height, s = Math.min((W - 30) / g.W, (H - 30) / g.H), ox = (W - s * g.W) / 2, oy = (H - s * g.H) / 2;
      const th = TD.GX.THEMES[g.def.theme];
      const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#' + th.sky[1].toString(16).padStart(6, '0')); gr.addColorStop(1, '#' + th.sky[0].toString(16).padStart(6, '0')); x.fillStyle = gr; x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(120,200,255,0.07)'; x.lineWidth = 1; for (let i = 0; i < W; i += 20) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); } for (let j = 0; j < H; j += 20) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }
      for (const c of g.cells) {
        const px = ox + c.x * s, py = oy + c.y * s;
        if (c.type === 'void') continue;
        if (c.kind === 'flow') { x.fillStyle = 'rgba(170,90,255,0.5)'; x.fillRect(px, py, s + 1, s + 1); continue; }
        if (c.kind === 'gap') { x.fillStyle = 'rgba(255,140,40,0.16)'; x.fillRect(px, py, s + 1, s + 1); x.strokeStyle = 'rgba(255,150,50,0.4)'; x.beginPath(); x.moveTo(px, py + s); x.lineTo(px + s, py); x.stroke(); continue; }
        if (c.type === 'obstacle') { x.fillStyle = 'rgba(20,34,50,0.95)'; x.fillRect(px + 2, py + 2, s - 4, s - 4); x.fillStyle = th.facAcc; x.globalAlpha = 0.5; x.fillRect(px + s * 0.3, py + s * 0.3, s * 0.4, s * 0.4); x.globalAlpha = 1; continue; }
        if (c.type === 'platform') { x.strokeStyle = 'rgba(140,200,240,0.5)'; x.lineWidth = 1.2; x.strokeRect(px + 3, py + 3, s - 6, s - 6); x.fillStyle = 'rgba(80,130,170,0.16)'; x.fillRect(px + 3, py + 3, s - 6, s - 6); continue; }
        x.fillStyle = c.legacy ? '#7a5424' : th.slab; x.fillRect(px + 0.5, py + 0.5, s - 1, s - 1);
        if (c.legacy) { x.fillStyle = '#e8a23a'; x.fillRect(px + s * 0.15, py + s * 0.42, s * 0.3, s * 0.16); x.fillRect(px + s * 0.6, py + s * 0.42, s * 0.3, s * 0.16); }
      }
      const cost = i => g.cells[i].legacy ? TD.LEGACY_COST : 1, f = TD.computeField(g, () => true, cost), ids = g.entries.map(e => e.id);
      g.entries.forEach((e, k) => { const r = TD.traceRoute(f, e.i); if (!r) return; x.strokeStyle = EC[e.id]; x.lineWidth = 3; x.globalAlpha = 0.9; x.beginPath(); const off = (k - (ids.length - 1) / 2) * 3.5; r.cells.forEach((ci, q) => { const c = g.cells[ci], px = ox + (c.x + 0.5) * s + off, py = oy + (c.y + 0.5) * s + off; if (q) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke(); x.globalAlpha = 1; });
      for (const c of g.nodes) { const px = ox + (c.x + 0.5) * s, py = oy + (c.y + 0.5) * s; x.fillStyle = '#0a1622'; x.strokeStyle = '#5dffc0'; x.lineWidth = 2.5; x.beginPath(); x.arc(px, py, s * 0.42, 0, 7); x.fill(); x.stroke(); }
      x.font = '800 ' + Math.round(s * 0.8) + 'px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (const c of g.entries.concat(g.exits)) { const px = ox + (c.x + 0.5) * s, py = oy + (c.y + 0.5) * s; x.fillStyle = c.type === 'entry' ? EC[c.id] : XC[c.id]; x.fillRect(px - s * 0.6, py - s * 0.6, s * 1.2, s * 1.2); x.fillStyle = '#05101c'; x.fillText(c.id, px, py + 1); }
    },

    // ---------------- HUD 绑定 ----------------
    bindSim(sim) {
      this.sim = sim; this.sel = null; this.cache = {}; this.insKey = ''; this.bannerQ = []; this.bannerT = 0;
      $('#tbMap').textContent = sim.def.name; $('#tbCode').textContent = sim.def.code;
      $('#log').innerHTML = ''; $('#banner').innerHTML = ''; $('#toasts').innerHTML = ''; $('#bossbar').classList.add('hidden'); this.hideConfirm();
      // 待部署栏：按职业分组
      const groups = [['阻挡 BLOCK', ['firewall', 'honeypot']], ['隔离 ISOLATE', ['gateway']], ['远程 RANGED', ['interceptor']], ['检测 DETECT', ['sandbox']], ['治疗 HEAL', ['repair']]];
      let h = '', n = 0;
      groups.forEach((gp, gi) => {
        const col = TD.ROLE_COLORS[TD.TOWERS[gp[1][0]].roleKey];
        h += (gi ? '<div class="sep"></div>' : '') + `<div class="role" style="color:${col}"><i>${gp[0]}</i><div>` + gp[1].map(t => { const d = TD.TOWERS[t]; n++; return `<div class="card" data-t="${t}" style="color:${TD.ROLE_COLORS[d.roleKey]}"><span class="kbd hk">${n}</span>${ic(t)}<b>${d.name}</b><span class="w">${d.place.map(p => ({ link: '链路', node: '节点', platform: '平台' }[p])).join(' / ')}</span><div class="cst"><span class="c">${ic('compute')}${d.cost}</span>${d.place.includes('node') ? `<span class="i" title="隔离节点另耗情报">${ic('intel')}${d.place.length === 1 ? TD.RULES.isolateIntel : '+' + TD.RULES.isolateIntel}</span>` : ''}</div></div>`; }).join('') + '</div></div>';
      });
      $('#cards').innerHTML = h;
      $('#items').innerHTML = `<div class="role" style="color:var(--gd)"><i>道具 ITEMS</i><div>` + TD.ITEM_ORDER.map((k, i) => { const d = TD.ITEMS[k]; return `<div class="card item" data-k="${k}" style="color:${d.res === 'intel' ? 'var(--gd)' : 'var(--cy)'}"><span class="kbd hk">${'ZXC'[i]}</span>${ic(k)}<b>${d.name}</b><span class="w">投放：${d.target}</span><div class="cst"><span class="${d.res === 'intel' ? 'i' : 'c'}">${ic(d.res)}${d.cost}</span><span class="meta" style="color:var(--mu)">冷却 ${d.cd}s</span></div><div class="cdm hidden"></div></div>`; }).join('') + '</div></div>';
      this.renderForecast(); this.renderIns();
      this._h = (n2, d) => this.onSim(n2, d); sim.on('*', this._h);
      this.log('info', 'BOOT', `守护进程接管 ${sim.def.code}，中枢完整度 ${sim.integrity}/${sim.maxIntegrity}`);
      this.log('info', 'INFO', '部署设备后点击“立即开始”，或等待倒计时结束');
    },
    unbind() { if (this.sim && this._h) this.sim.off('*', this._h); this.sim = null; },

    // ---------------- 日志 / 提示 ----------------
    log(cls, key, msg) { const L = $('#log'); const d = el('div', cls, `<span class="t">${mmss(this.sim ? this.sim.time : 0)}</span><span class="k">${key}</span>${msg}`); L.appendChild(d); while (L.children.length > 60) L.removeChild(L.firstChild); },
    toast(msg, cls) { const T = $('#toasts'); const now = (this.clock || 0) * 1000; if (this._lt === msg && now - this._ltT < 900 && now >= this._ltT) return; this._lt = msg; this._ltT = now; const d = el('div', 'toast ' + (cls || ''), (cls === 'ok' ? ic('check') : cls === 'info' ? ic('info') : ic('close')) + msg); T.appendChild(d); while (T.children.length > 3) T.removeChild(T.firstChild); d._born = this.clock || 0; },
    banner(cls, title, sub, dur) { this.bannerQ.push({ cls, title, sub, dur: dur || 2.4 }); },
    _banner(dt) {
      const B = $('#banner');
      if (this.bannerCur) { this.bannerCur.t += dt; if (this.bannerCur.t > this.bannerCur.dur && !this.bannerCur.out) { this.bannerCur.out = true; this.bannerCur.el.classList.add('out'); } if (this.bannerCur.t > this.bannerCur.dur + 0.4) { B.innerHTML = ''; this.bannerCur = null; } else if (this.bannerQ.length && this.bannerCur.t > 1.1 && !this.bannerCur.out) { this.bannerCur.t = this.bannerCur.dur; } }
      if (!this.bannerCur && this.bannerQ.length) { const b = this.bannerQ.shift(); const e = el('div', 'bn ' + b.cls, `<b>${b.title}</b>${b.sub ? '<span>' + b.sub + '</span>' : ''}`); B.innerHTML = ''; B.appendChild(e); this.bannerCur = { el: e, t: 0, dur: b.dur }; }
    },
    hint(msg, cls) { const h = $('#hint'); if (!msg) { h.classList.add('hidden'); return; } h.classList.remove('hidden'); h.className = cls || ''; if (h._m !== msg) { h._m = msg; h.innerHTML = msg; } },

    onSim(n, d) {
      const s = this.sim, E = TD.ENEMIES;
      switch (n) {
        case 'wave': { const f = s.forecast(d.n - 1); const parts = []; for (const id in f.by) if (f.by[id].length) parts.push(id + '：' + f.by[id].map(o => E[o.type].name + '×' + o.n).join(' ')); this.log('warn', 'ALERT', `第 ${d.n} 波流量抵达 — ${parts.join(' ｜ ')}`); if (d.def.boss) this.banner('boss', `第 ${d.n} 波 · BOSS`, `检测到核心威胁“${E[s.def.boss].name}”的特征`, 3); else if (d.def.surge) this.banner('bad', `第 ${d.n} 波 · 洪峰`, '三个入口同时大量出兵', 3); else this.banner('info', `第 ${d.n} 波`, '恶意流量正在混入业务流量'); this.renderForecast(); TD.Audio && TD.Audio.sfx(d.def.boss ? 'bossWarn' : 'wave'); break; }
        case 'waveClear': this.log('ok', 'OK', `第 ${d.n} 波已遏制，算力 +${d.bonus}，情报 +${TD.RULES.waveIntel}`); this.renderForecast(); TD.Audio && TD.Audio.sfx('clear'); break;
        case 'earlyBonus': this.log('ok', 'OK', `提前放行，算力 +${d.n}`); break;
        case 'newEnemy': { if (E[d.type].boss) break; const ds = TD.describeEnemy(d.type); this.banner('warn', '新威胁：' + ds.name, ds.tag + ' — ' + ds.counter, 3.2); this.log('warn', 'NEW', `首次识别到“${ds.name}”：${ds.lines[0]}`); break; }
        case 'bossSpawn': { const ds = TD.describeEnemy(d.enemy.type); this.banner('boss', ds.name + ' 现身', ds.tag.replace('Boss · ', ''), 3.6); this.log('bad', 'BOSS', `${ds.name} 从入口 ${d.enemy.entry} 接入`); $('#bossbar').classList.remove('hidden'); $('#bbN').textContent = ds.name; break; }
        case 'bossWarn': { const w = d.warn, c = s.grid.cells[w.cells[0]], nm = E[d.enemy.type].name; const txt = w.kind === 'surge' ? `${nm} 正在蓄力“洪峰” → 目标：${c.name || '身前的设备'}` : w.kind === 'spoof' ? `${nm} 正在伪造路由 → 前方链路即将出现黑洞` : `${nm} 即将锁死前方 ${w.cells.length} 格运维环`; this.banner('bad', '⚠ 地形预警', txt, 2.4); this.log('bad', 'WARN', txt); TD.Audio && TD.Audio.sfx('warn'); break; }
        case 'bossPhase': { const nm = E[d.enemy.type].name; this.banner('boss', `${nm} · ${d.name}`, d.enemy.type === 'boss1' ? '傀儡解离为成群蠕虫，节点与阻挡塔压力上升' : d.enemy.type === 'boss2' ? '周期清除附近塔的护盾' : d.phase === 2 ? '护甲强化，开始放出木马' : '将锁死前方运维环，道路会改变', 3.2); this.log('bad', 'BOSS', `${nm} 进入阶段：${d.name}`); break; }
        case 'bossAct': { const nm = E[d.enemy.type].name; if (d.kind === 'surge') this.log('bad', 'BOSS', `${nm} 的洪峰命中${d.hit === 'iso' ? '，应急隔离器被冲毁' : d.hit === 'tower' ? '，节点设备受到重创' : ''}`); else if (d.kind === 'blackhole') this.log('bad', 'BOSS', `${nm} 制造路由黑洞，前方链路被截断`); else if (d.kind === 'lock') this.log('bad', 'BOSS', `${nm} 锁死 ${d.cells.length} 格运维环`); else if (d.kind === 'storm') this.log('bad', 'BOSS', `${nm} 发动路由风暴，${d.ids.length} 座塔的护盾被清除`); break; }
        case 'bossDie': this.banner('ok', E[d.enemy.type].name + ' 已清除', '核心威胁特征消失', 3); this.log('ok', 'KILL', `${E[d.enemy.type].name} 已清除`); $('#bossbar').classList.add('hidden'); break;
        case 'routes': { for (const id of d.changed) { const o = d.old[id], r = d.routes[id]; this.log('route', 'ROUTE', `路由收敛：入口 ${id} → ${r.exit}${o && o.exit !== r.exit ? '（原 ' + o.exit + '）' : ''}，路程 ${o ? o.cost.toFixed(0) : '?'} → ${r.cost.toFixed(0)}`); } if (d.changed.length) { this.renderForecast(); TD.Audio && TD.Audio.sfx('reroute'); } break; }
        case 'nodeIsolate': this.log('info', 'SEG', `节点【${s.grid.cells[d.ci].name}】已隔离（${d.by === 'isolator' ? '应急隔离器' : TD.TOWERS[d.tower.type].name}）`); break;
        case 'nodeOpen': this.log(d.why === 'sell' || d.why === 'expire' ? 'info' : 'bad', 'SEG', `节点【${s.grid.cells[d.ci].name}】旁路直通（${{ sell: '设备撤下', destroy: '设备被摧毁', expire: '隔离器到期', smash: '隔离器被冲毁', surge: '被洪峰冲毁' }[d.why] || d.why}），${TD.RULES.reisolate} 秒内不能再次隔离`); break;
        case 'towerDie': this.log('bad', 'LOSS', `设备损毁：${TD.towerFullName(d.tower)}`); if (this.sel && this.sel.kind === 'tower' && this.sel.id === d.tower.id) this.select(null); break;
        case 'towerSell': if (this.sel && this.sel.kind === 'tower' && this.sel.id === d.tower.id) this.select(null); break;
        case 'enemyDie': if (this.sel && this.sel.kind === 'enemy' && this.sel.id === d.enemy.id) this.select(null); break;
        case 'leak': this.log('bad', 'BREACH', `${TD.ENEMIES[d.enemy.type].name} 突入${s.exitName(d.exit)}，中枢完整度 -${d.dmg}`); if (this.sel && this.sel.kind === 'enemy' && this.sel.id === d.enemy.id) this.select(null); break;
        case 'intel': if (d.why === 'hold') this.log('intel', 'INTEL', '守住隔离节点，情报 +1'); break;
        case 'encrypt': this.log('warn', 'CRYPT', `${TD.towerFullName(d.tower)} 被加密，停止工作`); break;
        case 'payload': if (d.ids.length) this.log('bad', 'PAYLOAD', `未显形的木马被波及消灭，载荷伤及 ${d.ids.length} 座塔`); break;
        case 'skill': this.log('info', 'SKILL', `${TD.towerFullName(d.tower)} 释放“${d.name}”`); break;
        case 'item': this.log('info', 'ITEM', `使用道具“${TD.ITEMS[d.key].name}”`); break;
        case 'reject': this.toast(d.reason); this.log('warn', 'DENY', d.reason); TD.Audio && TD.Audio.sfx('deny'); break;
        case 'towerUp': this.insKey = ''; break;
      }
    },

    // ---------------- 流量预报 ----------------
    renderForecast() {
      const s = this.sim; if (!s) return; const w = s.wave, f = s.forecast(w), B = $('#fcBody');
      if (!f) { B.innerHTML = '<div class="fcw">全部波次已结束</div>'; return; }
      let h = `<div class="fcw">${s.phase === 'active' ? '当前' : '下一波'} <b>第 ${w + 1} / ${s.totalWaves} 波</b>${f.boss ? '<span class="tag">BOSS</span>' : ''}${f.surge ? '<span class="tag s">洪峰</span>' : ''}</div>`;
      for (const e of s.grid.entries) {
        const list = f.by[e.id], r = s.routes[e.id];
        h += `<div class="fcr"><div class="en"><b style="background:${EC[e.id]}">${e.id}</b><span>${e.name}</span><i>→ <span style="color:${XC[r.exit] || '#fff'}">${r.exit || '?'}</span> · 路程 ${isFinite(r.cost) ? r.cost.toFixed(0) : '∞'}</i></div><div class="th">` +
          (list.length ? list.map(o => `<span class="thr${f.intro === o.type ? ' new' : ''}" style="color:${TD.ENEMY_COLORS[o.type]}" data-en="${o.type}">${ic(o.type)}×${o.n}</span>`).join('') : '<span class="none">无异常流量</span>') + '</div></div>';
      }
      B.innerHTML = h;
    },

    // ---------------- 选中面板 ----------------
    select(sel) { this.sel = sel; this.insKey = ''; this.renderIns(); if (this.app.view) this.app.view.overlay.sel = sel; },
    renderIns() {
      const s = this.sim, I = $('#ins'), sel = this.sel; if (!s) return;
      let key = sel ? sel.kind + ':' + (sel.id != null ? sel.id : sel.ci) : 'none';
      if (sel && sel.kind === 'tower') { const t = s.tById.get(sel.id); if (!t) { this.sel = null; key = 'none'; } else key += ':' + t.level + (t.branch || ''); }
      if (sel && sel.kind === 'enemy' && !s.eById.get(sel.id)) { this.sel = null; key = 'none'; }
      if (key === this.insKey) { this.patchIns(); return; }
      this.insKey = key; const R = TD.RULES;
      if (!this.sel) {
        $('#insT').firstChild.textContent = '守护进程'; $('#insS').textContent = 'STATUS';
        I.innerHTML = `<div class="sec">本图要点</div>${s.def.tips.map(t => `<div class="il">› ${t}</div>`).join('')}
          <div class="sec">交换节点</div><div id="insNodes"></div>
          <div class="sec">操作</div><div class="il s">拖动下方卡片到地图部署；拦截器落位后移动鼠标定朝向，左键确认、右键取消。</div><div class="il s">在节点上部署网闸 / 防火墙会先预览各入口的新路线，确认后才执行。</div><div class="il s">点选塔、敌人或地块查看说明。<span class="kbd">空格</span> 暂停　<span class="kbd">Tab</span> 调速　<span class="kbd">H</span> 视角复位</div>`;
      } else if (this.sel.kind === 'tower') {
        const t = s.tById.get(this.sel.id), d = TD.TOWERS[t.type], S = t.S, col = TD.ROLE_COLORS[d.roleKey], sk = TD.towerSkill(t.type, t.level, t.branch);
        $('#insT').firstChild.textContent = '设备'; $('#insS').textContent = 'DEVICE #' + t.id;
        let st = '';
        if (t.type === 'firewall') st = `阻挡 ${S.block}　还击 ${S.dmg}${S.cleave ? '（横扫）' : ''} / ${S.rate}s${S.armor ? '　近战减伤 ' + Math.round(S.armor * 100) + '%' : ''}`;
        if (t.type === 'honeypot') st = `阻挡 ${S.block}　诱敌半径 ${S.lure} 格　不会被加密${S.mark ? '　取证标记 +40% 伤害' : ''}${S.burst ? '　被毁时告警脉冲' : ''}`;
        if (t.type === 'gateway') st = `不攻击${S.smashCut ? '　节点冲击减伤 ' + Math.round(S.smashCut * 100) + '%　自修复 ' + S.regen + '/s' : ''}`;
        if (t.type === 'interceptor') st = `${S.pierce ? '贯穿光束' : S.slow ? '压制射击' : '单体射击'} ${S.dmg} / ${S.rate}s　纵深 ${S.depth}　宽 ${S.half * 2}${S.slow ? '　减速 ' + Math.round(S.slow * 100) + '%' : ''}　朝向 ${TD.DIR_NAMES[t.facing]}`;
        if (t.type === 'sandbox') st = `检测半径 ${S.detect}　范围 ${S.aoe} 格 ${S.dmg} / ${S.rate}s${S.shieldMul > 1 ? '　对护盾 ×' + S.shieldMul : ''}`;
        if (t.type === 'repair') st = `治疗 ${S.heal}/s × ${S.beams}　半径 ${S.range} 格`;
        let h = `<div class="ih" style="color:${col}"><div class="big">${ic(t.type)}</div><div><b style="color:var(--tx)">${TD.towerFullName(t)}<span class="pips"><i class="on"></i><i class="${t.level >= 2 ? 'on' : ''}"></i></span></b><span>${d.role} · ${t.onNode ? '隔离节点【' + s.grid.cells[t.ci].name + '】' : s.grid.cells[t.ci].type === 'platform' ? '设备平台' : '链路'}</span></div></div>
          <div class="bar"><u id="iHp"></u><u class="sh" id="iSh"></u><span id="iHpT"></span></div><div class="chips" id="iCh"></div><div class="il">${st}</div>`;
        h += '<div class="act">';
        if (sk) { const ds = TD.describeTower(t.type); let sd = ds.skill ? ds.skill.d : ''; if (t.type === 'interceptor') sd = t.branch === 'a' ? `沿朝向扇形发射三道 ${sk.dmg} 伤害的贯穿光束。冷却 ${sk.cd} 秒。` : `攻击区域内全部敌人减速 ${Math.round(sk.slow * 100)}%，持续 ${sk.dur} 秒。冷却 ${sk.cd} 秒。`; h += `<button class="abtn sk" data-act="skill" id="iSk"><div class="cdv" id="iSkCd" style="width:0"></div>${ic('skill')}<div><b>技能 · ${sk.name}</b><span>${sd}</span></div><span class="kbd key">F</span></button>`; }
        else if (t.type === 'interceptor') h += `<div class="il s">选择分支后获得主动技能。</div>`;
        if (t.level < 2) {
          if (d.B) for (const b of ['a', 'b']) h += `<button class="abtn" data-act="up" data-arg="${b}" id="iUp${b}">${ic('up')}<div><b>升级分支 ${b.toUpperCase()} · ${d.B[b].name}</b><span>${d.B[b].desc}</span></div><div class="cost"><i class="c">算力 ${d.upCost}</i><i class="i">情报 ${R.branchIntel}</i></div><span class="kbd key">${b === 'a' ? 'U' : 'I'}</span></button>`;
          else { const ds = TD.describeTower(t.type); h += `<button class="abtn" data-act="up" id="iUpa">${ic('up')}<div><b>升级到 2 级</b><span>${ds.levels[1].d}</span></div><div class="cost"><i class="c">算力 ${d.upCost}</i></div><span class="kbd key">U</span></button>`; }
        }
        h += `<button class="abtn sell" data-act="sell" data-hover="sell" id="iSell">${ic('sell')}<div><b>撤下</b><span>返还算力 ${Math.round(t.spent * R.sellRefund)}${t.onNode ? '；节点将旁路直通（悬停预览路线）' : ''}</span></div><span class="kbd key">Del</span></button></div>`;
        I.innerHTML = h;
      } else if (this.sel.kind === 'enemy') {
        const e = s.eById.get(this.sel.id), ds = TD.describeEnemy(e.type), col = TD.ENEMY_COLORS[e.type];
        const masked = e.hidden;
        $('#insT').firstChild.textContent = '威胁'; $('#insS').textContent = 'THREAT #' + e.id;
        I.innerHTML = `<div class="ih" style="color:${col}"><div class="big">${ic(e.type)}</div><div><b style="color:var(--tx)">${masked ? '封装数据包？' : ds.name}${e.isCopy ? '（复制体）' : ''}</b><span>${masked ? '特征可疑 · 尚未显形' : ds.tag}</span></div></div>
          <div class="bar e"><u id="iHp"></u><u class="sh" id="iSh" style="background:#ff8ae0"></u><span id="iHpT"></span></div><div class="chips" id="iCh"></div>
          ${ds.lines.map(l => `<div class="il">› ${l}</div>`).join('')}<div class="il" style="color:var(--gn)">应对：${ds.counter}</div><div class="il s">来自入口 ${e.entry}“${s.entryName(e.entry)}”</div>`;
      } else {
        const c = s.grid.cells[this.sel.ci]; const k = c.type === 'link' ? (s.isLegacy(c.i) ? 'legacy' : 'link') : (c.type === 'entry' || c.type === 'exit') ? 'entry' : c.type;
        const info = TD.TERRAIN_INFO.find(o => o.k === k) || TD.TERRAIN_INFO[0];
        $('#insT').firstChild.textContent = '地块'; $('#insS').textContent = `CELL (${c.x},${c.y})`;
        let nm = info.n; if (c.type === 'node') nm = '交换节点【' + c.name + '】'; if (c.type === 'entry') nm = '入口 ' + c.id + ' · ' + c.name; if (c.type === 'exit') nm = '出口 ' + c.id + ' · ' + c.name; if (c.kind === 'flow') nm = '障碍 · 公网流'; if (c.kind === 'gap') nm = '障碍 · 气隙'; if (c.kind === 'facility') nm = '障碍 · 数据设施'; if (k === 'legacy' && !c.legacy) nm = '链路（协议降级中）';
        let ex = ''; if (c.type === 'node') ex = `<div class="il">${c.desc}</div>`; if (c.type === 'entry') ex = `<div class="il">${s.def.entries[c.id].desc}</div>`; if (c.type === 'exit') ex = `<div class="il">${s.def.exits[c.id].desc}</div>`;
        I.innerHTML = `<div class="ih" style="color:var(--cy)"><div class="big">${ic(c.type === 'node' ? 'node' : k)}</div><div><b style="color:var(--tx)">${nm}</b><span>${c.type === 'platform' ? '可部署：拦截器 / 沙箱 / 修复进程' : c.type === 'node' ? '可部署：网闸 / 防火墙 / 应急隔离器' : c.type === 'link' ? '可部署：防火墙 / 蜜罐' : '不可部署'}</span></div></div><div class="chips" id="iCh"></div>${ex}<div class="il">${info.d}</div>`;
      }
      this.patchIns();
    },
    patchIns() {
      const s = this.sim, sel = this.sel, R = TD.RULES;
      const chip = (c, t) => `<span class="chip ${c}">${t}</span>`;
      if (!sel) {
        const N = $('#insNodes'); if (!N) return; let h = '';
        for (const c of s.grid.nodes) { const ns = s.nodes[c.i]; let st, cl; if (ns.tower) { const t = s.tById.get(ns.tower); st = '已隔离 · ' + TD.TOWERS[t.type].name + ' ' + Math.ceil(t.hp) + '/' + t.maxHp; cl = 'o'; } else if (ns.iso) { st = '已隔离 · 隔离器 ' + Math.ceil(ns.iso.t) + 's'; cl = 'y'; } else if (s.blockCnt[c.i]) { st = '不可通行'; cl = 'v'; } else if (ns.reT > 0) { st = '直通 · ' + Math.ceil(ns.reT) + 's 后可再隔离'; cl = 'y'; } else { st = '直通'; cl = 'g'; } const ids = Object.keys(s.routes).filter(id => s.routes[id].cells.includes(c.i)); h += `<div class="il" style="display:flex;gap:.4rem;align-items:center"><b style="min-width:5rem">${c.name}</b>${chip(cl, st)}<span style="margin-left:auto">${ids.map(id => `<b class="mono" style="color:${EC[id]}">${id}</b>`).join(' ')}</span></div>`; }
        if (this.cache.nodes !== h) { this.cache.nodes = h; N.innerHTML = h; } return;
      }
      if (sel.kind === 'tower') {
        const t = s.tById.get(sel.id); if (!t) return; const d = TD.TOWERS[t.type];
        $('#iHp').style.width = Math.max(0, t.hp / t.maxHp * 100) + '%'; $('#iSh').style.width = (t.shield > 0 ? t.shield / (t.shieldMax || 1) * 100 : 0) + '%'; $('#iHpT').textContent = Math.ceil(t.hp) + ' / ' + t.maxHp + (t.shield > 0 ? ' +' + Math.ceil(t.shield) : '');
        let c = ''; if (t.encT > 0) c += chip('r', '加密 ' + t.encT.toFixed(1) + 's：停止' + (t.type === 'repair' ? '治疗' : '攻击') + '与技能'); if (t.shield > 0) c += chip('c', '护盾 ' + Math.ceil(t.shield) + ' · ' + t.shieldT.toFixed(1) + 's · 免疫加密'); if (t.shieldLock > 0) c += chip('v', '护盾受阻 ' + t.shieldLock.toFixed(1) + 's'); if (t.onNode) c += chip('o', '隔离中' + (s.nodes[t.ci].engT > 0 ? ' · 交战中，每 ' + R.holdInterval + 's 情报 +1' : '')); if (t.blocker) c += chip('m', '阻挡 ' + t.load + ' / ' + t.S.block); if (t.type === 'firewall' && t.skillT > 0) c += chip('g', '策略加固 ' + t.skillT.toFixed(1) + 's'); if (t.type === 'repair' && t.healIds.length) c += chip('g', '正在修复 ' + t.healIds.length + ' 座'); if (t.type === 'interceptor' && t.target) { const e = s.eById.get(t.target); if (e) c += chip('c', '目标：' + TD.ENEMIES[e.type].name); }
        if (this.cache.ch !== c) { this.cache.ch = c; $('#iCh').innerHTML = c; }
        const sk = $('#iSk'); if (sk) { const chk = s.checkSkill(t); sk.classList.toggle('dis', !chk.ok); const S2 = TD.towerSkill(t.type, t.level, t.branch); $('#iSkCd').style.width = (t.skillCd > 0 ? t.skillCd / S2.cd * 100 : t.encT > 0 ? 100 : 0) + '%'; }
        for (const b of ['a', 'b']) { const u = $('#iUp' + b); if (u) u.classList.toggle('dis', !s.checkUpgrade(t, d.B ? b : null).ok); }
      } else if (sel.kind === 'enemy') {
        const e = s.eById.get(sel.id); if (!e) return;
        $('#iHp').style.width = Math.max(0, e.hp / e.maxHp * 100) + '%'; $('#iSh').style.width = (e.shield > 0 ? e.shield / (e.shieldMax || 1) * 100 : 0) + '%'; $('#iHpT').textContent = Math.ceil(e.hp) + ' / ' + e.maxHp + (e.shield > 0 ? ' +' + Math.ceil(e.shield) : '');
        let c = ''; if (e.hidden) c += chip('v', '伪装中：拦截器无法选中'); if (e.type === 'boss3' && e.phase === 1) c += chip(e.revealT > 0 ? 'y' : 'v', e.revealT > 0 ? '潜伏 · 已显形' : '潜伏：需要检测'); if (e.boss) c += chip('r', '阶段 ' + e.phase); if (e.shield > 0) c += chip('v', '加壳护盾 ' + Math.ceil(e.shield)); if (e.slowT > 0) c += chip('c', '减速 ' + Math.round((1 - e.slowF) * 100) + '%'); if (e.rootT > 0) c += chip('y', '诱捕 ' + e.rootT.toFixed(1) + 's'); if (e.stunT > 0) c += chip('y', '眩晕'); if (e.markT > 0) c += chip('o', '取证标记 +40%'); if (e.blockedBy) c += chip('m', '被阻挡'); if (e.detour) c += chip('o', e.detour.kind === 'smash' ? '冲击节点【' + s.grid.cells[e.detour.node].name + '】' : '被蜜罐诱骗'); if (!e.fly && s.isLegacy(Math.round(e.y) * s.W + Math.round(e.x))) c += chip('y', '旧协议减速');
        if (this.cache.ch !== c) { this.cache.ch = c; $('#iCh').innerHTML = c; }
      } else {
        const c0 = s.grid.cells[sel.ci]; let c = '';
        if (c0.type === 'node') { const ns = s.nodes[c0.i]; c += ns.tower || ns.iso ? chip('o', '已隔离：不可通行') : s.blockCnt[c0.i] ? chip('v', '不可通行') : chip('g', '直通'); if (ns.reT > 0) c += chip('y', '再次隔离间隔 ' + Math.ceil(ns.reT) + 's'); if (ns.iso) c += chip('y', '隔离器耐久 ' + Math.ceil(ns.iso.hp) + ' · 剩余 ' + Math.ceil(ns.iso.t) + 's'); }
        if (c0.walk) { const ids = Object.keys(s.routes).filter(id => s.routes[id].cells.includes(c0.i)); if (ids.length) c += chip('c', '经过的路线：' + ids.join(' ')); if (s.blockCnt[c0.i] && c0.type !== 'node') c += chip('v', '被黑洞 / 锁死截断'); if (s.legCnt[c0.i]) c += chip('y', '协议降级中'); }
        if (this.cache.ch !== c) { this.cache.ch = c; $('#iCh').innerHTML = c; }
      }
    },
    insAct(act, arg, force) {
      const s = this.sim, sel = this.sel; if (!s || !sel || sel.kind !== 'tower' || (this.app.locked && !force)) return; const t = s.tById.get(sel.id); if (!t) return;
      if (act === 'skill') { if (s.castSkill(t.id)) TD.Audio && TD.Audio.sfx('skill_' + t.type); }
      else if (act === 'up') { if (s.upgrade(t.id, arg || null)) { TD.Audio && TD.Audio.sfx('upgrade'); this.insKey = ''; } }
      else if (act === 'sell') { TD.Input.clearPreview(); if (s.sell(t.id)) TD.Audio && TD.Audio.sfx('sell'); }
    },

    // ---------------- 确认气泡 ----------------
    showConfirm(o) {
      const C = $('#confirm'); this.confirmO = o; C.classList.remove('hidden');
      C.innerHTML = `<div class="ph">${o.title}<small>CONFIRM</small></div><div class="cb">${o.lines.join('')}<div class="cst">${o.cost}</div></div><div class="bts"><button class="btn pri" data-cf="ok">${ic('check')} 确认 <span class="kbd">Enter</span></button><button class="btn" data-cf="no">${ic('close')} 取消 <span class="kbd">Esc</span></button></div>`;
    },
    hideConfirm() { $('#confirm').classList.add('hidden'); this.confirmO = null; },
    routeLines(ev, sim) {
      const out = [];
      for (const id of Object.keys(ev.routes).sort()) { const r = ev.routes[id], o = sim.routes[id]; if (!r) { out.push(`<div class="r"><b style="background:${EC[id]}">${id}</b><span style="color:var(--rd)">无路可走</span></div>`); continue; } const ch = ev.changed.includes(id); out.push(`<div class="r"><b style="background:${EC[id]}">${id}</b><span style="${ch ? '' : 'color:var(--mu)'}">${ch ? `改道 → ${r.exit}${o.exit !== r.exit ? '（原 ' + o.exit + '）' : ''}，路程 ${o.cost.toFixed(0)} → ${r.cost.toFixed(0)}` : '路线不变 → ' + r.exit}</span></div>`); }
      return out;
    },

    // ---------------- 提示框 ----------------
    showTip(html, x, y) { const T = $('#tip'); T.classList.remove('hidden'); if (T._h !== html) { T._h = html; T.innerHTML = html; } const r = T.getBoundingClientRect(), W = innerWidth, H = innerHeight; let px = x + 18, py = y - r.height - 14; if (px + r.width > W - 8) px = W - r.width - 8; if (py < 8) py = y + 22; T.style.left = px + 'px'; T.style.top = py + 'px'; },
    hideTip() { $('#tip').classList.add('hidden'); },
    onHover(e) {
      const t = e.target; let h = '';
      const card = t.closest('.card'), en = t.closest('[data-en]'), tip = t.closest('[data-tip]'), hv = t.closest('[data-hover]'), res = t.closest('.res');
      if (card && card.dataset.t) { const d = TD.describeTower(card.dataset.t); h = `<b>${d.name}<span class="m">　${d.role} · ${d.where}</span></b>${d.short}<div class="m">${d.levels[0].d}</div>${d.skill ? `<div class="k">技能 · ${d.skill.n}：<span style="color:var(--tx)">${d.skill.d}</span></div>` : ''}<div class="m">拖到地图上部署；或点一下卡片再点地图。</div>`; }
      else if (card && card.dataset.k) { const d = TD.describeItem(card.dataset.k); h = `<b>${d.name}<span class="m">　${d.cost} · 冷却 ${d.cd}s</span></b>${d.short}<div class="m">投放位置：${d.target}。${d.lines[0]}</div>`; }
      else if (en) { const d = TD.describeEnemy(en.dataset.en); h = `<b>${d.name}<span class="m">　${d.tag}</span></b>${d.lines.map(l => '› ' + l).join('<br>')}<div class="k">应对：<span style="color:var(--tx)">${d.counter}</span></div>`; }
      else if (tip) h = { next: '<b>立即开始</b>跳过准备倒计时，按剩余时间奖励少量算力。', pause: '<b>暂停 / 继续<span class="m">　空格</span></b>暂停时仍可查看信息，但不能操作。', home: '<b>视角复位<span class="m">　H</span></b>回到整张地图完整可见的默认视角。', book: '<b>设备手册 / 威胁档案</b>', mute: '<b>静音<span class="m">　M</span></b>', menu: '<b>菜单<span class="m">　Esc</span></b>重开本图、返回关卡选择、设置。' }[tip.dataset.tip] || '';
      else if (res) h = res.id === 'rC' ? '<b>算力</b>' + TD.RESOURCE_INFO[0] : res.id === 'rI' ? '<b>情报</b>' + TD.RESOURCE_INFO[1] : '<b>中枢完整度</b>敌人进入出口时下降，归零即失败。洪泛团 -2，Boss -12。';
      if (h) this.showTip(h, e.clientX, e.clientY); else this.hideTip();
      const want = hv && this.sel && this.sel.kind === 'tower' ? this.sel.id : 0;
      if (want !== this._sellHover) { this._sellHover = want; TD.Input.sellPreview(want); }
    },

    // ---------------- 点击委托 ----------------
    onClick(e) {
      const t = e.target, A = this.app; TD.Audio && TD.Audio.unlock();
      const go = t.closest('[data-go]'), pm = t.closest('[data-pm]'), cf = t.closest('[data-cf]'), sp = t.closest('[data-spd]'), lv = t.closest('.lv'), cxi = t.closest('.cxi'), cxt = t.closest('[data-cxt]'), cxv = t.closest('[data-cxv]');
      if (t.closest('.btn,.cxi,.lv')) TD.Audio && TD.Audio.sfx('click');
      if (go) { const g = go.dataset.go; if (g === 'levels') this.fade(() => { A.toMenuScene(); this.show('levels'); }); else if (g === 'menu') this.fade(() => A.toMenu()); else if (g === 'codex') this.openCodex('tower'); else if (g === 'help') this.openCodex('sys'); else if (g === 'settings') $('#settings').classList.remove('hidden'); else if (g === 'demo') A.startDemos(); else if (g === 'cxback') this.closeCodex(); return; }
      if (pm) { const k = pm.dataset.pm; if (k === 'resume') A.setPaused(false); else if (k === 'restart') this.fade(() => A.startMap(A.mapId)); else if (k === 'levels') this.fade(() => { A.toMenuScene(); this.show('levels'); }); else if (k === 'menu') this.fade(() => A.toMenu()); else if (k === 'codex') this.openCodex('tower'); else if (k === 'help') this.openCodex('sys'); else if (k === 'settings') $('#settings').classList.remove('hidden'); else if (k === 'closeSet') $('#settings').classList.add('hidden'); else if (k === 'mute') A.toggleMute(); return; }
      if (cf) { if (cf.dataset.cf === 'ok') TD.Input.confirm(); else TD.Input.cancel(); return; }
      if (sp) { A.setSpeed(+sp.dataset.spd); return; }
      if (lv) { this.fade(() => A.startMap(lv.dataset.map)); return; }
      if (cxt) { this.cxTab(cxt.dataset.cxt); return; }
      if (cxi) { this.cxPick(cxi.dataset.kind, cxi.dataset.key); return; }
      if (cxv) { this.cxVariant(+cxv.dataset.cxv); return; }
      if (t.closest('#bPause')) A.togglePause(); else if (t.closest('#bHome')) A.resetView(); else if (t.closest('#bBook')) this.openCodex('tower'); else if (t.closest('#bMute')) A.toggleMute(); else if (t.closest('#bMenu')) A.openMenu(); else if (t.closest('#btnNext')) A.nextWave(); else if (t.closest('#dExit')) A.exitDemo();
      else if (t.closest('[data-rp]')) { const k = t.closest('[data-rp]').dataset.rp; this.fade(() => { if (k === 'retry') A.startMap(A.mapId); else { A.toMenuScene(); this.show('levels'); } }); }
    },

    // ---------------- 每帧 ----------------
    update(dt) {
      this.clock = (this.clock || 0) + dt;
      const s = this.sim, A = this.app; if (!s || $('#hud').classList.contains('hidden')) { this.cxDraw(dt); return; }
      const c = this.cache, set = (k, v, f) => { if (c[k] !== v) { const old = c[k]; c[k] = v; f(v, old); } };
      set('compute', Math.floor(s.compute), (v, o) => { const e = $('#rC'); e.querySelector('b').innerHTML = v + `<small>+${(TD.RULES.passive * s.passiveMul * (s.phase === 'active' ? 1 : 0.5)).toFixed(1)}/s</small>`; });
      set('intel', s.intel, (v, o) => { const e = $('#rI'); e.querySelector('b').textContent = v; if (o != null) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } });
      set('integ', s.integrity, (v, o) => { const e = $('#rH'); e.querySelector('b').innerHTML = v + `<small>/ ${s.maxIntegrity}</small>`; e.querySelector('u').style.width = (v / s.maxIntegrity * 100) + '%'; e.classList.toggle('low', v <= s.maxIntegrity * 0.35); if (o != null) { e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); } });
      set('wave', s.wave + '/' + s.phase, () => { $('#tbWave').textContent = '波次 ' + Math.min(s.totalWaves, s.wave + 1) + ' / ' + s.totalWaves; $('#btnNext').classList.toggle('hidden', s.phase !== 'prep' || !!A.demo); this.renderForecast(); });
      const ph = s.phase === 'prep' ? `准备中 · <em>${Math.ceil(s.prepT)}</em> 秒后放行` : s.phase === 'active' ? `交战中 · 场上威胁 <em>${s.enemies.length}</em>${s.spawnQ.length ? ' · 待接入 <em>' + s.spawnQ.length + '</em>' : ''}` : '已结束';
      set('phase', ph, v => { $('#tbPhase').innerHTML = v; });
      set('spd', (A.paused ? 'P' : '') + A.speed, () => { $('#tbSpd').textContent = A.paused ? '已暂停' : '速度 ' + A.speed + '×'; $('#bPause').innerHTML = ic(A.paused ? 'play' : 'pause'); $('#bPause').classList.toggle('on', A.paused); document.querySelectorAll('[data-spd]').forEach(b => b.classList.toggle('on', !A.paused && +b.dataset.spd === A.speed)); });
      // 卡片可用性
      this._cardT = (this._cardT || 0) - dt;
      if (this._cardT <= 0) {
        this._cardT = 0.15;
        document.querySelectorAll('#cards .card').forEach(cd => { const d = TD.TOWERS[cd.dataset.t]; cd.classList.toggle('poor', s.compute < d.cost || (d.place.length === 1 && d.place[0] === 'node' && s.intel < TD.RULES.isolateIntel)); cd.classList.toggle('act', TD.Input.activeCard === cd.dataset.t); });
        document.querySelectorAll('#items .card').forEach(cd => { const k = cd.dataset.k, d = TD.ITEMS[k], cdv = s.itemCd[k], m = cd.querySelector('.cdm'); cd.classList.toggle('poor', (d.res === 'intel' ? s.intel : s.compute) < d.cost || cdv > 0); cd.classList.toggle('act', TD.Input.activeItem === k); m.classList.toggle('hidden', cdv <= 0); if (cdv > 0) { m.style.top = (100 - cdv / d.cd * 100) + '%'; m.textContent = Math.ceil(cdv); } });
        this.renderIns();
        // Boss 条
        const boss = s.enemies.find(e => e.boss && !e.dead);
        if (boss) { $('#bossbar').classList.remove('hidden'); $('#bbU').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%'; $('#bbH').textContent = Math.ceil(boss.hp) + ' / ' + boss.maxHp; const names = { boss1: ['', '洪峰', '傀儡解离'], boss2: ['', '伪路由', '路由风暴'], boss3: ['', '潜伏', '提权', '破坏'] }[boss.type]; $('#bbP').textContent = '阶段 ' + boss.phase + ' · ' + names[boss.phase]; $('#bbN').textContent = TD.ENEMIES[boss.type].name; if (!this._bbMarks || this._bbMarks !== boss.type) { this._bbMarks = boss.type; const bb = $('#bossbar .bb'); bb.querySelectorAll('i').forEach(x => x.remove()); for (const f of boss.type === 'boss3' ? [0.66, 0.33] : [0.5]) { const m = el('i'); m.style.left = (f * 100) + '%'; bb.appendChild(m); } } }
        else $('#bossbar').classList.add('hidden');
      }
      const tip = !A.demo && A.state === 'battle' && s.wave === 0 && s.phase === 'prep' && TD.Input.mode === 'idle' && !s.towers.length && !A.paused;
      if (tip) { this._tipOn = true; this.hint('先看左侧“流量预报”：把<b>防火墙</b>拖到来袭入口通往中枢的链路上，再把<b>拦截器</b>、<b>沙箱</b>拖到旁边的设备平台', 'ok'); }
      else if (this._tipOn) { this._tipOn = false; if (TD.Input.mode === 'idle') this.hint(null); }
      this._banner(dt);
      // 确认气泡跟随节点
      if (this.confirmO && A.view) { const p = A.view.screenOfCell(this.confirmO.ci, 1.5); const C = $('#confirm'); C.style.left = TD.clamp(p.x, 240, innerWidth - 240) + 'px'; C.style.top = Math.max(C.offsetHeight + 80, p.y) + 'px'; }
      this.cxDraw(dt);
    },

    // ---------------- 事件报告 ----------------
    showReport(sim, result) {
      const R = $('#report'), st = sim.stats, win = result === 'win', f = sim.integrity / sim.maxIntegrity;
      const grade = !win ? 'F' : f >= 1 ? 'S' : f >= 0.75 ? 'A' : f >= 0.5 ? 'B' : 'C';
      R.className = 'screen dim scanl ' + (win ? 'win' : 'lose');
      const stat = (n, v, k) => `<div class="stat" style="animation-delay:${0.25 + k * 0.05}s"><i>${n}</i><b>${v}</b></div>`;
      const kills = TD.ENEMY_ORDER.filter(k => st.kills[k]).map(k => `<span class="thr" style="color:${TD.ENEMY_COLORS[k]}">${ic(k)}${TD.ENEMIES[k].name} ×${st.kills[k]}</span>`).join('') || '<span style="color:var(--mu)">无</span>';
      const d = new Date(); const id = 'IR-' + sim.def.code + '-' + String(Math.floor(sim.time)).padStart(4, '0');
      R.innerHTML = `<div class="panel rp"><div class="hd"><div class="seal">${grade}</div><div><div class="id">事件报告 INCIDENT REPORT // ${id}</div><h2>${sim.def.name}</h2><div class="concl">${win ? '结论：入侵已遏制，“' + TD.ENEMIES[sim.def.boss].name + '”被清除，各入口到中枢保持连通。' : '结论：中枢完整度归零，防区失守。事件升级至第 ' + Math.min(sim.totalWaves, sim.wave + 1) + ' 波。'}</div></div></div>
        <div class="grid">${stat('用时', mmss(sim.time), 0)}${stat('波次', Math.min(sim.totalWaves, sim.wave + (win ? 0 : 1)) + ' / ' + sim.totalWaves, 1)}${stat('中枢完整度', sim.integrity + ' / ' + sim.maxIntegrity, 2)}${stat('消灭威胁', st.killN, 3)}
          ${stat('突破出口', st.leaks, 4)}${stat('部署 / 损毁 / 撤下', st.built + ' / ' + st.lost + ' / ' + st.sold, 5)}${stat('节点隔离 / 改道', st.isolations + ' / ' + st.reroutes, 6)}${stat('技能 / 道具', st.skills + ' / ' + st.items, 7)}
          ${stat('算力投入', Math.round(st.computeUse), 8)}${stat('情报 获得 / 投入', st.intelGain + ' / ' + st.intelUse, 9)}${stat('设备承受伤害', Math.round(st.dmgToTowers), 10)}${stat('修复量', Math.round(st.healed), 11)}</div>
        <div class="kl"><h4>威胁处置清单</h4><div class="row">${kills}</div></div>
        <div class="tl"><h4>处置建议</h4>${win ? (st.leaks ? '› 仍有 ' + st.leaks + ' 个威胁突破出口，复盘它们的入口与路线。' : '› 零突破。尝试更少的设备或不同的隔离方案。') : '› 查看“流量预报”，在放行前按入口布防；隔离节点可以延长路线，但要准备修复进程守住它。'}<br>› ${st.lost > 3 ? '设备损毁较多：洪泛团与勒索者需要蜜罐、修复进程和备份还原来应对。' : '设备存活良好。'}</div>
        <div class="bts"><button class="btn pri" data-rp="retry">${ic('retry')} 重开本图</button><button class="btn" data-rp="levels">${ic('back')} 返回关卡选择</button></div></div>`;
      this.hud(false); this.show('report');
    },

    // ---------------- 图鉴 ----------------
    openCodex(tab) {
      const A = this.app; if (A.locked) return; this.cxPrev = { screen: this.screen, hud: !$('#hud').classList.contains('hidden'), paused: A.paused };
      if (A.state === 'battle') A.setPaused(true, true);
      $('#pause').classList.add('hidden'); $('#codex').classList.remove('hidden'); if (this.screen === 'menu') $('#menu').classList.add('hidden');
      $('#codex').innerHTML = `<button class="btn backbtn" data-go="cxback">${ic('back')} 返回</button><div class="stitle">守护进程资料库</div><div class="ssub">CODEX // 内容与对局中的实际数值一致</div>
        <div id="cxTabs"><button class="btn" data-cxt="tower">${ic('firewall')} 设备手册</button><button class="btn" data-cxt="enemy">${ic('worm')} 威胁档案</button><button class="btn" data-cxt="sys">${ic('info')} 操作与规则</button></div><div class="panel" id="codexBox"></div>`;
      this.cxTab(tab || 'tower');
    },
    closeCodex() { const p = this.cxPrev || {}; $('#codex').classList.add('hidden'); this.cxStop(); if (p.screen === 'menu') $('#menu').classList.remove('hidden'); if (this.app.state === 'battle') { if (this.app.menuOpen) $('#pause').classList.remove('hidden'); else this.app.setPaused(!!p.paused, true); } },
    cxTab(tab) {
      this.cxT = tab; document.querySelectorAll('[data-cxt]').forEach(b => b.classList.toggle('on', b.dataset.cxt === tab));
      const B = $('#codexBox');
      if (tab === 'sys') {
        this.cxStop();
        const it = (icn, n, d) => `<div class="it">${ic(icn)}<div><b>${n}</b>　${d}</div></div>`;
        B.innerHTML = `<div class="sysg"><h4>操作</h4><div class="keys">
          <div><span class="kbd">中键拖动</span>环绕视角</div><div><span class="kbd">Shift + 中键</span>平移视角</div><div><span class="kbd">滚轮</span>缩放</div>
          <div><span class="kbd">左键</span>点选；拖放卡片部署</div><div><span class="kbd">右键 / Esc</span>取消当前操作</div><div><span class="kbd">H</span>回到默认视角</div>
          <div><span class="kbd">1–6</span>拿起塔卡　<span class="kbd">Z X C</span>道具</div><div><span class="kbd">空格</span>暂停　<span class="kbd">Tab</span>调速　<span class="kbd">N</span>立即开始</div><div><span class="kbd">F</span>技能　<span class="kbd">U / I</span>升级　<span class="kbd">Del</span>撤下</div></div>
          <h4>地形</h4>${TD.TERRAIN_INFO.map(o => it(o.k === 'entry' ? 'entry' : o.k, o.n, o.d)).join('')}
          <h4>改道规则</h4>${TD.ROUTE_INFO.map(o => `<div class="it">${ic('arrow')}<div>${o}</div></div>`).join('')}
          <h4>状态</h4>${TD.STATUS_INFO.map(o => it({ reveal: 'eye', shield: 'shield', encrypt: 'lock', slow: 'downgrade', root: 'honeypot', mark: 'interceptor', isolate: 'isolator' }[o.k], o.n, o.d)).join('')}
          <h4>资源与胜负</h4>${TD.RESOURCE_INFO.map((o, i) => `<div class="it">${ic(['compute', 'intel', 'integrity'][i])}<div>${o}</div></div>`).join('')}<div class="it">${ic('integrity')}<div>敌人到达出口时中枢完整度下降，归零即失败；撑过全部波次即胜利。</div></div></div>`;
        return;
      }
      const list = tab === 'tower' ? TD.TOWER_ORDER.map(k => ['tower', k, TD.TOWERS[k].name, TD.TOWERS[k].role]).concat(TD.ITEM_ORDER.map(k => ['item', k, TD.ITEMS[k].name, '道具'])) : TD.ENEMY_ORDER.map(k => ['enemy', k, TD.ENEMIES[k].name, TD.ENEMIES[k].boss ? 'BOSS' : '']);
      B.innerHTML = `<div id="cxList">${list.map((o, i) => (tab === 'tower' && i === 6 ? '<div class="cxh">道具</div>' : tab === 'enemy' && i === 6 ? '<div class="cxh">BOSS</div>' : i === 0 ? `<div class="cxh">${tab === 'tower' ? '设备' : '恶意程序'}</div>` : '') + `<div class="cxi" data-kind="${o[0]}" data-key="${o[1]}" style="color:${o[0] === 'tower' ? TD.ROLE_COLORS[TD.TOWERS[o[1]].roleKey] : o[0] === 'item' ? 'var(--gd)' : TD.ENEMY_COLORS[o[1]]}">${ic(o[1])}<span style="color:var(--tx)">${o[2]}</span><small>${o[3]}</small></div>`).join('')}</div>
        <div id="cxView"><canvas id="cxCanvas"></canvas><div id="cxVar"></div></div><div id="cxText"></div>`;
      this.cxPick(list[0][0], list[0][1]);
    },
    cxPick(kind, key) {
      document.querySelectorAll('.cxi').forEach(e => e.classList.toggle('on', e.dataset.kind === kind && e.dataset.key === key));
      const T = $('#cxText'), V = $('#cxVar'); let vars = [];
      if (kind === 'tower') {
        const d = TD.describeTower(key), dd = TD.TOWERS[key];
        T.innerHTML = `<h3 style="color:${TD.ROLE_COLORS[dd.roleKey]}">${ic(key)}<span style="color:var(--tx)">${d.name}</span></h3><div class="tg">${d.role} · 部署位置：${d.where}</div><div class="kv"><span>算力 ${d.cost}</span>${dd.place.includes('node') ? '<span>隔离节点 +情报 ' + TD.RULES.isolateIntel + '</span>' : ''}</div><div>${d.short}</div>
          ${d.levels.map(l => `<div class="lvl"><b>${l.t}</b>${l.d}</div>`).join('')}${d.skill ? `<div class="lvl sk"><b>主动技能 · ${d.skill.n}</b>${d.skill.d}</div>` : ''}<ul>${d.notes.map(n => '<li>' + n + '</li>').join('')}</ul>`;
        vars = dd.B ? [['1 级', 1, null], ['2 级 · ' + dd.B.a.name, 2, 'a'], ['2 级 · ' + dd.B.b.name, 2, 'b']] : [['1 级', 1, null], ['2 级', 2, null]];
      } else if (kind === 'item') {
        const d = TD.describeItem(key);
        T.innerHTML = `<h3 style="color:var(--gd)">${ic(key)}<span style="color:var(--tx)">${d.name}</span></h3><div class="tg">道具 · 投放位置：${d.target}</div><div class="kv"><span>${d.cost}</span><span>冷却 ${d.cd} 秒</span></div><div>${d.short}</div><ul>${d.lines.map(n => '<li>' + n + '</li>').join('')}</ul><div class="lvl"><b>使用方法</b>点击或拖动道具卡，移动到目标上，影响范围和各入口的新路线会在确认前显示；左键确认，右键取消。</div>`;
      } else {
        const d = TD.describeEnemy(key), dd = TD.ENEMIES[key];
        T.innerHTML = `<h3 style="color:${TD.ENEMY_COLORS[key]}">${ic(key)}<span style="color:var(--tx)">${d.name}</span></h3><div class="tg">${d.tag}</div><div class="kv"><span>基础生命 ${d.hp}</span><span>速度 ${d.speed} 格/秒</span><span>突破损失 ${dd.leak}</span><span>${dd.fly ? '飞行' : '地面 · 占 ' + dd.size + ' 容量'}</span></div>
          ${d.lines.map(l => `<div class="lvl"><b>行为</b>${l}</div>`).join('')}<div class="ct">应对：${d.counter}</div>`;
        if (key === 'trojan') vars = [['伪装', 0], ['显形', 1]]; else if (key === 'boss1' || key === 'boss2') vars = [['阶段 1', 1], ['阶段 2', 2]]; else if (key === 'boss3') vars = [['潜伏', 1], ['提权', 2], ['破坏', 3]];
      }
      this.cxSel = { kind, key, vars, vi: 0 };
      V.innerHTML = vars.map((v, i) => `<button class="btn${i === 0 ? ' on' : ''}" data-cxv="${i}">${v[0]}</button>`).join('');
      this.cxBuild();
    },
    cxVariant(i) { this.cxSel.vi = i; document.querySelectorAll('[data-cxv]').forEach(b => b.classList.toggle('on', +b.dataset.cxv === i)); this.cxBuild(); },
    cxBuild() {
      const THREE = root.THREE, GX = TD.GX, cv = $('#cxCanvas'); if (!cv) return;
      if (!this.cx) {
        const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.92; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
        const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
        sc.add(new THREE.HemisphereLight(0x9fd0ff, 0x101820, 1.3)); const dl = new THREE.DirectionalLight(0xffffff, 2.0); dl.position.set(-2, 4, 3); dl.castShadow = true; dl.shadow.mapSize.set(1024, 1024); dl.shadow.camera.left = -2; dl.shadow.camera.right = 2; dl.shadow.camera.top = 2; dl.shadow.camera.bottom = -2; sc.add(dl); const rl = new THREE.DirectionalLight(0x49d6ff, 1.2); rl.position.set(3, 2, -3); sc.add(rl);
        const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.5;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.12, 48), new THREE.MeshStandardMaterial({ color: 0x15263a, metalness: 0.7, roughness: 0.4 })); base.position.y = -0.06; base.receiveShadow = true; sc.add(base);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.012, 6, 64), GX.glow(0x49d6ff, 2)); ring.rotation.x = Math.PI / 2; sc.add(ring);
        const gridH = new THREE.GridHelper(2.2, 11, 0x2a80b0, 0x163850); gridH.position.y = 0.002; sc.add(gridH);
        this.cx = { r, sc, cam, holder: new THREE.Group(), t: 0 }; sc.add(this.cx.holder);
      }
      const cx = this.cx, s = this.cxSel; cx.canvasEl = cv; cx.r.domElement = cx.r.domElement; cx.model = null; cx.t = 0;
      while (cx.holder.children.length) cx.holder.remove(cx.holder.children[0]);
      const v = s.vars[s.vi] || [];
      if (s.kind === 'tower') { cx.model = GX.makeTower(s.key, v[1] || 1, v[2] || null); cx.kind = 'tower'; cx.h = 1.0; cx.dist = 5.0; }
      else if (s.kind === 'enemy') { cx.model = GX.makeEnemy(s.key); cx.kind = 'enemy'; cx.h = cx.model.h; cx.dist = cx.model.boss ? 8.4 : 4.0; cx.phase = v[1] != null ? v[1] : 1; cx.fly = !!cx.model.fly; }
      else { cx.kind = 'item'; cx.model = { g: this.cxItemModel(s.key), tick() { } }; cx.h = 0.9; cx.dist = 4.8; }
      cx.holder.add(cx.model.g); cx.active = true;
    },
    cxItemModel(key) {
      const THREE = root.THREE, GX = TD.GX, G = GX.G, mk = GX.mk, g = new THREE.Group(), M = GX.M;
      if (key === 'isolator') { for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, c = new THREE.Group(); c.rotation.y = -a; c.add(mk(G.box(0.07, 0.5, 0.07), M.tSteel, [0.4, 0.25, 0])); c.add(mk(G.box(0.22, 0.06, 0.07), M.tAmber, [0.31, 0.5, 0])); g.add(c); } g.add(mk(G.tor(0.3, 0.03, 6, 24), M.tAmber, [0, 0.62, 0], [Math.PI / 2, 0, 0])); g.add(mk(G.cyl(0.47, 0.5, 0.17, 8), M.tWhite, [0, 0.0, 0], [0, Math.PI / 8, 0])); }
      else if (key === 'downgrade') { for (let i = -1; i <= 1; i++) { g.add(mk(G.rbox(0.5, 0.1, 0.5, 0.02), M.tDark, [i * 0.55, 0.05, 0])); g.add(mk(G.box(0.4, 0.02, 0.08), M.tAmber, [i * 0.55, 0.11, 0])); } g.add(mk(G.cone(0.2, 0.34, 4), M.tAmber, [0, 0.62, 0], [Math.PI, 0, 0])); g.add(mk(G.box(0.1, 0.3, 0.1), M.tAmber, [0, 0.9, 0])); }
      else { g.add(mk(G.cyl(0.36, 0.36, 0.14, 24), M.tWhite, [0, 0.3, 0])); g.add(mk(G.cyl(0.36, 0.36, 0.14, 24), M.tWhite, [0, 0.5, 0])); g.add(mk(G.cyl(0.37, 0.37, 0.03, 24), M.tHeal, [0, 0.4, 0])); g.add(mk(G.tor(0.5, 0.03, 6, 30, Math.PI * 1.5), M.tHeal, [0, 0.4, 0], [Math.PI / 2, 0, 0])); g.add(mk(G.box(0.3, 0.07, 0.07), M.tHeal, [0, 0.75, 0])); g.add(mk(G.box(0.07, 0.3, 0.07), M.tHeal, [0, 0.75, 0])); }
      return g;
    },
    cxStop() { if (this.cx) this.cx.active = false; },
    cxDraw(dt) {
      const cx = this.cx; if (!cx || !cx.active || $('#codex').classList.contains('hidden')) return;
      const cv = $('#cxCanvas'); if (!cv) return; const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
      if (cx.w !== w || cx.h2 !== h) { cx.w = w; cx.h2 = h; cx.r.setPixelRatio(Math.min(2, devicePixelRatio)); cx.r.setSize(w, h, false); cx.cam.aspect = w / h; cx.cam.updateProjectionMatrix(); }
      cx.t += dt; const t = cx.t, m = cx.model;
      const ang = t * 0.45; cx.cam.position.set(Math.sin(ang) * cx.dist, cx.h * 0.5 + cx.dist * 0.34, Math.cos(ang) * cx.dist); cx.cam.lookAt(0, cx.h * 0.42 + (cx.fly ? 0.5 : 0), 0);
      if (cx.kind === 'tower') { const cyc = t % 2.2; m.tick({ t, dt, fire: cyc, hit: (t + 1.1) % 4.4, deploy: 9, skill: (t % 9) > 7.6 ? 9 - (t % 9) : 0, aim: Math.sin(t * 0.8) * 0.6, hasAim: (t % 6) > 2.5, cdK: cyc / 2.2, seed: 0.3, heal: (t % 5) > 2, lureR: 1.1, range: 1.1, pitch: 0 }); }
      else if (cx.kind === 'enemy') { m.g.position.y = cx.fly ? 0.6 : 0; const a = { t, dt, sp: 1, move: (t % 8) < 5.5, atk: (t % 8) > 5.5 ? (t % 8 - 5.5) % 1.2 : 9, hit: (t + 2) % 5, state: 'move', seed: 0.4, phase: cx.phase || 1, cast: (t % 7) - 3.5, phaseAge: 9, revealK: this.cxSel.key === 'trojan' ? (cx._rk = (cx._rk || 0) + ((cx.phase ? 1 : 0) - (cx._rk || 0)) * Math.min(1, dt * 4)) : 1, stormAge: null }; if (a.cast < 0) a.cast = 99; m.tick(a); }
      else m.g.rotation.y = t * 0.8;
      cx.r.render(cx.sc, cx.cam);
      const x2 = cv.getContext('2d'); if (cv.width !== cx.r.domElement.width || cv.height !== cx.r.domElement.height) { cv.width = cx.r.domElement.width; cv.height = cx.r.domElement.height; }
      x2.clearRect(0, 0, cv.width, cv.height); x2.drawImage(cx.r.domElement, 0, 0);
    }
  };
})(window);
