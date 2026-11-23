// 界面：菜单、图鉴、说明、关卡卡片、事件报告，以及部署栏与信息面板的构建。
(function () {
  const D = window.GAME_DATA;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const CLS_NAME = { block: '阻挡', lure: '诱敌', iso: '隔离', ranged: '远程', detect: '检测', support: '支援', item: '道具', intel: '情报道具', compute: '算力道具' };
  const CLS_COLOR = { block: '#ff9b4a', lure: '#ffd166', iso: '#4dabf7', ranged: '#3de0ff', detect: '#b388ff', support: '#6ef3a5', item: '#f5f7fa', intel: '#b388ff', compute: '#ffb547' };
  const TOWER_ICON = { firewall: 'i-firewall', honeypot: 'i-honeypot', gateway: 'i-gateway', interceptor: 'i-interceptor', sandbox: 'i-sandbox', repair: 'i-repair' };
  const ENEMY_NAME = Object.fromEntries(Object.entries(D.ENEMIES).map(([k, v]) => [k, v.name]));
  const WAVE_TYPE_NAME = Object.assign({}, ENEMY_NAME, { 'boss:wanku': '万傀', 'boss:shenlou': '蜃楼', 'boss:zhenying': '蛰影' });

  const CARDS = [
    { id: 'firewall', kind: 'tower', cls: 'block', name: '防火墙', icon: 'i-firewall', cost: '算力 60', extra: '节点 +情报 25', place: '链路 / 交换节点' },
    { id: 'honeypot', kind: 'tower', cls: 'lure', name: '蜜罐', icon: 'i-honeypot', cost: '算力 55', place: '链路' },
    { id: 'gateway', kind: 'tower', cls: 'iso', name: '网闸', icon: 'i-gateway', cost: '算力 40', extra: '节点 +情报 20', place: '交换节点' },
    { id: 'interceptor', kind: 'tower', cls: 'ranged', name: '拦截器', icon: 'i-interceptor', cost: '算力 110', place: '设备平台（设定朝向）' },
    { id: 'sandbox', kind: 'tower', cls: 'detect', name: '沙箱', icon: 'i-sandbox', cost: '算力 95', place: '设备平台' },
    { id: 'repair', kind: 'tower', cls: 'support', name: '修复进程', icon: 'i-repair', cost: '算力 100', place: '设备平台' },
    { id: 'isolator', kind: 'item', cls: 'intel', name: '应急隔离器', icon: 'i-isolator', cost: '情报 30', place: '直通交换节点' },
    { id: 'downgrade', kind: 'item', cls: 'intel', name: '协议降级', icon: 'i-downgrade', cost: '情报 40', place: '链路区域' },
    { id: 'restore', kind: 'item', cls: 'compute', name: '备份还原', icon: 'i-restore', cost: '算力 60', place: '己方设备' },
  ];

  // ---------- 通用 ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function svg(id, cls) { return `<svg class="${cls || 'c-ico'}"><use href="#${id}"/></svg>`; }

  // ---------- 屏幕切换 ----------
  const UI = {
    screen: 'title',
    show(name) {
      if (name !== 'codex' && UI.stopPreview) UI.stopPreview();
      $$('#screens .screen').forEach((s) => s.classList.remove('show'));
      const map = { title: 'scrTitle', levels: 'scrLevels', demos: 'scrDemos', codex: 'scrCodex', help: 'scrHelp', settings: 'scrSettings', pause: 'scrPause', report: 'scrReport' };
      const el = $('#' + map[name]);
      if (el) el.classList.add('show');
      if (name !== 'pause' && name !== 'report') this.screen = name;
    },
    hideAll() { $$('#screens .screen').forEach((s) => s.classList.remove('show')); },
    toast(msg, kind, ms) {
      if (window.Snd) { if (!kind) Snd.play('deny'); else if (kind === 'ok') Snd.play('click'); }
      const t = $('#toast');
      t.textContent = msg;
      t.className = 'toast show' + (kind ? ' ' + kind : '');
      clearTimeout(this._tt);
      this._tt = setTimeout(() => { t.classList.remove('show'); }, ms || 2400);
    },
    log(text, kind, timeStr) {
      const box = $('#logBox');
      const d = document.createElement('div');
      d.className = kind || '';
      d.innerHTML = `<time>${timeStr || ''}</time>${esc(text)}`;
      box.appendChild(d);
      while (box.childElementCount > 80) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
    },
    fmtTime(t) { const s = Math.floor(t); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },

    // ----- 关卡 -----
    buildLevels(onPick, onInfo) {
      const grid = $('#levelGrid');
      grid.innerHTML = '';
      for (const m of window.MAP_DEFS) {
        const card = document.createElement('div');
        card.className = 'level-card';
        const cv = document.createElement('canvas');
        cv.width = 640; cv.height = 420;
        drawMinimap(cv, m);
        const bossName = D.BOSSES[D.BOSS_NAME_BY_MAP[m.id]].name;
        const entries = m.entries.map((e) => `<b style="color:${D.ENTRY_COLOR[e.id]}">${e.id}</b>${esc(e.name)}`).join('　');
        const exits = m.exits.map((e) => esc(e.name)).join('、');
        card.innerHTML = `<div class="lc-body">
          <h3>${esc(m.name)}</h3>
          <div class="lc-kind">${esc(m.kind)}</div>
          <p>${esc(MAP_BLURB[m.id])}</p>
          <div class="lc-meta">入口：${entries}</div>
          <div class="lc-meta">出口：${exits}</div>
          <div class="lc-meta">波次 <b>${m.waves}</b>　·　Boss <b>${esc(bossName)}</b>（第 ${m.bossWave} 波）</div>
          <div class="lc-go"><button class="btn" data-act="play">开始</button><button class="btn" data-act="info">设备与敌人</button></div>
        </div>`;
        card.prepend(cv);
        card.querySelector('[data-act="play"]').onclick = (ev) => { ev.stopPropagation(); onPick(m.id); };
        card.querySelector('[data-act="info"]').onclick = (ev) => { ev.stopPropagation(); this.openCodex('threats'); };
        card.onclick = () => onPick(m.id);
        grid.appendChild(card);
      }
    },
    buildDemos(onPlay) {
      const grid = $('#demoGrid');
      grid.innerHTML = '';
      for (const d of D.DEMOS) {
        const m = window.MAP_DEFS.find((x) => x.id === d.map);
        const el = document.createElement('div');
        el.className = 'demo-card';
        el.innerHTML = `<div class="dc-map">${esc(m.name)} · ${esc(d.subtitle)}</div><h3>${esc(d.title)}</h3><p>${esc(d.desc)}</p><button class="btn big">播放演示</button>`;
        el.querySelector('button').onclick = () => onPlay(d.id);
        grid.appendChild(el);
      }
    },

    // ----- 图鉴 -----
    codexTab: 'devices',
    codexSel: { devices: 'firewall', threats: 'worm' },
    openCodex(tab) {
      if (tab) this.codexTab = tab;
      $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.codexTab));
      this.renderCodexList();
      this.renderCodexDetail();
      this.show('codex');
    },
    codexItems() {
      if (this.codexTab === 'devices') {
        const items = [];
        for (const k of Object.keys(D.TOWERS)) { const t = D.TOWERS[k]; items.push({ key: k, name: t.name, sub: CLS_NAME[t.cls], icon: TOWER_ICON[k], color: CLS_COLOR[t.cls] }); }
        for (const k of Object.keys(D.ITEMS)) { const it = D.ITEMS[k]; items.push({ key: 'item:' + k, name: it.name, sub: '道具 · ' + CLS_NAME[it.cls], icon: { isolator: 'i-isolator', downgrade: 'i-downgrade', restore: 'i-restore' }[k], color: CLS_COLOR[it.cls] }); }
        items.push({ key: 'state:node', name: '交换节点与隔离', sub: '地形与状态', icon: 'i-core', color: '#4dabf7' });
        items.push({ key: 'state:terrain', name: '地形与状态', sub: '地形与状态', icon: 'i-wave', color: '#6ef3a5' });
        return items;
      }
      const items = [];
      for (const k of Object.keys(D.ENEMIES)) { const e = D.ENEMIES[k]; items.push({ key: k, name: e.name, sub: e.flying ? '飞行' : '地面', icon: 'i-warn', color: '#ff7a8f' }); }
      for (const k of Object.keys(D.BOSSES)) { const b = D.BOSSES[k]; items.push({ key: 'boss:' + k, name: b.name, sub: 'Boss · ' + b.title, icon: 'i-warn', color: '#ff3d5a' }); }
      items.push({ key: 'state:status', name: '状态与解除', sub: '状态说明', icon: 'i-lock', color: '#b388ff' });
      return items;
    },
    renderCodexList() {
      const list = $('#codexList');
      const sel = this.codexSel[this.codexTab];
      list.innerHTML = this.codexItems().map((it) => `<div class="codex-item ${it.key === sel ? 'on' : ''}" data-key="${it.key}" style="--cc:${it.color}">
        <svg class="c-ico"><use href="#${it.icon}"/></svg><div>${esc(it.name)}<small>${esc(it.sub)}</small></div></div>`).join('');
      $$('.codex-item', list).forEach((el) => {
        el.onclick = () => { this.codexSel[this.codexTab] = el.dataset.key; this.renderCodexList(); this.renderCodexDetail(); };
      });
    },
    renderCodexDetail() {
      const key = this.codexSel[this.codexTab];
      const el = $('#codexDetail');
      el.innerHTML = codexHTML(key);
      startPreview(document.getElementById('cxPrev'), key);
    },

    // ----- 说明 -----
    buildHelp() { $('#helpBody').innerHTML = HELP_HTML; },

    // ----- 结算 -----
    showReport(sim, result, mapDef) {
      const st = sim.stats;
      const won = result === 'won';
      const elapsed = this.fmtTime(sim.t);
      const bossLine = sim.def.boss ? (st.bossKilled ? `${D.BOSSES[D.BOSS_NAME_BY_MAP[sim.def.id]].name} 已被击溃` : `${D.BOSSES[D.BOSS_NAME_BY_MAP[sim.def.id]].name} 未被击溃`) : '';
      const notes = [
        won ? '全部波次已被守住，中枢数据保持完整。' : `中枢在第 ${sim.waveNo} 波失守。敌人经由 ${Object.keys(sim.lastPaths || {}).join('、')} 入口进入出口。`,
        `设备部署 ${st.towersBuilt} 次，损毁 ${st.towersLost} 座；节点隔离 ${st.nodesIsolated} 次；路线改写 ${st.reroutes} 次。`,
        bossLine,
      ].filter(Boolean).map((x) => `<div>· ${esc(x)}</div>`).join('');
      $('#reportBody').innerHTML = `
        <div class="rep-head"><h2>事件报告</h2><span class="muted">${esc(mapDef.name)} · 用时 ${elapsed}</span></div>
        <div class="verdict ${won ? 'win' : 'lose'}" style="margin-top:16px">${won ? '防御成功' : '中枢失守'}</div>
        <div class="grid">
          <div class="stat-card"><span>完成波次</span><b>${Math.min(sim.waveNo, sim.totalWaves)} / ${sim.totalWaves}</b></div>
          <div class="stat-card"><span>中枢完整度</span><b>${Math.max(0, Math.round(sim.integrity))}%</b></div>
          <div class="stat-card"><span>消灭目标</span><b>${st.kills}</b></div>
          <div class="stat-card"><span>到达出口</span><b>${st.leaks}</b></div>
          <div class="stat-card"><span>设备建成</span><b>${st.towersBuilt}</b></div>
          <div class="stat-card"><span>设备损毁</span><b>${st.towersLost}</b></div>
          <div class="stat-card"><span>节点隔离</span><b>${st.nodesIsolated}</b></div>
          <div class="stat-card"><span>路线改写</span><b>${st.reroutes}</b></div>
          <div class="stat-card"><span>道具使用</span><b>${st.itemsUsed}</b></div>
          <div class="stat-card"><span>木马载荷</span><b>${st.trojanBursts}</b></div>
          <div class="stat-card"><span>剩余算力</span><b>${Math.floor(sim.res.compute)}</b></div>
          <div class="stat-card"><span>剩余情报</span><b>${Math.floor(sim.res.intel)}</b></div>
        </div>
        <div class="notes">${notes}</div>
        <div class="btns"><button class="btn" id="repRestart">重开本图</button><button class="btn" id="repLevels">返回关卡选择</button></div>`;
      this.show('report');
    },

    // ----- 部署卡 -----
    buildCards(onDown, onHover) {
      const box = $('#cards');
      box.innerHTML = '';
      for (const c of CARDS) {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.id = c.id;
        el.dataset.cls = c.cls;
        const cdTxt = c.kind === 'item' ? `<div class="c-cdinfo">冷却 ${D.ITEMS[c.id].cd} 秒</div>` : '';
        el.innerHTML = `<span class="c-cls">${CLS_NAME[c.cls]}</span>${svg(c.icon)}<div class="c-name">${c.name}</div><div class="c-cost">${c.cost}</div><div class="c-place">${c.place}</div>${cdTxt}<div class="c-cd"></div>`;
        el.addEventListener('pointerdown', (ev) => onDown(c, ev));
        el.addEventListener('pointerenter', (ev) => onHover(c, el, true));
        el.addEventListener('pointerleave', () => onHover(c, el, false));
        box.appendChild(el);
      }
    },
    cardTip(c) {
      if (c.kind === 'tower') {
        const t = D.TOWERS[c.id];
        return `<b>${t.name}</b> <span style="color:${CLS_COLOR[t.cls]}">${CLS_NAME[t.cls]}</span><br>${esc(t.brief)}<br><span class="muted">${esc(t.stats)}</span><br>部署：${esc(c.place)}　费用：${c.cost}${c.extra ? '（' + c.extra + '）' : ''}`;
      }
      const it = D.ITEMS[c.id];
      return `<b>${it.name}</b> <span style="color:${CLS_COLOR[it.cls]}">${CLS_NAME[it.cls]}</span><br>${esc(it.brief)}<br>目标：${esc(it.place)}　费用：${c.cost}　冷却：${it.cd} 秒`;
    },
    updateCards(sim) {
      for (const el of $$('.card')) {
        const id = el.dataset.id;
        const isItem = !!D.ITEMS[id];
        let cool = 0;
        if (isItem) cool = Math.max(0, (sim.itemCd[id] || 0) - sim.t);
        el.classList.toggle('cooling', cool > 0);
        el.querySelector('.c-cd').textContent = cool > 0 ? Math.ceil(cool) + 's' : '';
        let afford = true;
        if (isItem) {
          const it = D.ITEMS[id];
          afford = (it.cost.intel || 0) <= sim.res.intel && (it.cost.compute || 0) <= sim.res.compute;
        } else {
          const t = D.TOWERS[id];
          afford = t.cost <= sim.res.compute;
        }
        el.classList.toggle('unavail', !afford);
      }
    },
    setArmed(id) { for (const el of $$('.card')) el.classList.toggle('armed', el.dataset.id === id); },

    // ----- 预报 -----
    renderForecast(sim, mapDef) {
      const idx = Math.min(sim.waveNo, mapDef.waves - 1);
      const groups = D.WAVES[mapDef.id][idx] || [];
      const by = {};
      let boss = null;
      for (const g of groups) {
        if (g.t.startsWith('boss:')) { boss = g.t.slice(5); continue; }
        const ids = g.e.split('');
        for (const e of ids) {
          by[e] = by[e] || {};
          by[e][g.t] = (by[e][g.t] || 0) + g.n;
        }
      }
      const head = sim.waveNo === 0 ? `第 1 波` : sim.state === 'active' ? `第 ${sim.waveNo} 波（进行中）· 下一波` : `第 ${Math.min(sim.waveNo + 1, mapDef.waves)} 波`;
      $('#forecastWave').textContent = head;
      const rows = mapDef.entries.map((en) => {
        const d = by[en.id] || {};
        const list = Object.keys(d).map((k) => `<b>${WAVE_TYPE_NAME[k]}</b> ×${d[k]}`).join('　') || '<span class="muted">无</span>';
        return `<div class="fc-row"><div class="fc-chip" style="background:${D.ENTRY_COLOR[en.id]}">${en.id}</div><div class="fc-main"><div class="fc-name">${esc(en.name)}</div><div class="fc-list">${list}</div></div></div>`;
      });
      if (boss) rows.push(`<div class="fc-row"><div class="fc-chip" style="background:#ff5d73">!</div><div class="fc-main"><div class="fc-name fc-boss">Boss 预警：${D.BOSSES[boss].name}</div><div class="fc-list">${esc(D.BOSSES[boss].abilities)}</div></div></div>`);
      $('#forecast').innerHTML = rows.join('');
      $('#threatIntro').innerHTML = '算力随波次增长，击杀与守住隔离节点可获得情报。预报仅显示下一波的来袭组合。';
    },
  };

  // ---------- 说明文本 ----------
  const MAP_BLURB = {
    intranet: '办公网段与业务网段经 DMZ 互联与一段旧链路相连，西侧边界与东侧通道决定入侵从哪里进入中枢数据库。',
    backbone: '互联网、分支专线与云端互联通向互为备份的双活数据中心。公网流横贯战场，专线隧道与旧专线构成两处跨越点。',
    airgap: '运维环绕过中央气隙连通南北，两侧狭窄通道相互转移流量；两座工控核心的防守彼此牵制。',
  };

  function drawMinimap(cv, m) {
    const ctx = cv.getContext('2d');
    const rows = m.rows;
    const h = rows.length, w = rows[0].length;
    const s = Math.min((cv.width - 40) / w, (cv.height - 40) / h);
    const ox = (cv.width - w * s) / 2, oy = (cv.height - h * s) / 2;
    ctx.fillStyle = '#060e1a';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const accent = { intranet: '#3de0ff', backbone: '#8f7bff', airgap: '#ffb547' }[m.id];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      const px = ox + x * s, py = oy + y * s;
      if (c === '.') continue;
      if (c === '#') { ctx.fillStyle = '#243752'; ctx.fillRect(px + 1, py + 1, s - 2, s - 2); continue; }
      if (c === 'P') { ctx.fillStyle = '#1e4a3a'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.32, 0, Math.PI * 2); ctx.fill(); continue; }
      if (c === '=' || c === 'o') { ctx.fillStyle = c === 'o' ? 'rgba(255,160,70,0.85)' : accent; ctx.globalAlpha = 0.35; ctx.fillRect(px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.7); ctx.globalAlpha = 1; }
      if (c === 'N') { ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.3, 0, Math.PI * 2); ctx.fill(); }
      if (c === 'A' || c === 'B' || c === 'C') { ctx.fillStyle = D.ENTRY_COLOR[c]; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#061018'; ctx.font = `bold ${Math.round(s * 0.55)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c, px + s / 2, py + s / 2 + 1); }
      if (c === 'X' || c === 'Y') { ctx.fillStyle = '#6ef3a5'; ctx.fillRect(px + 2, py + 2, s - 4, s - 4); ctx.fillStyle = '#061018'; ctx.font = `bold ${Math.round(s * 0.55)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c, px + s / 2, py + s / 2 + 1); }
    }
  }

  const HELP_HTML = `
  <h3>一、目标</h3>
  <p>汐域的中枢保存着全域数据。入侵者沿链路涌向中枢，每有一个敌人到达出口，中枢完整度就会下降，归零即失败；撑过全部波次即胜利。</p>
  <h3>二、地图与链路</h3>
  <table>
    <tr><th>地块</th><th>说明</th></tr>
    <tr><td>链路</td><td>恶意程序与业务流量经过的道路。防火墙、蜜罐可部署在入口、出口之外的链路上，阻挡敌人但不截断道路。</td></tr>
    <tr><td>交换节点</td><td>链路交汇处的设备。部署防火墙、网闸或应急隔离器会隔离节点，使其不能通行；移除后恢复直通，并有短暂的再次隔离间隔。</td></tr>
    <tr><td>设备平台</td><td>部署拦截器、沙箱、修复进程的位置，高于链路，敌人无法通行。</td></tr>
    <tr><td>障碍</td><td>数据设施、公网流、气隙等，既不能通行，也不能部署。</td></tr>
    <tr><td>旧链路</td><td>保留旧协议的道路，经过的地面敌人减速，伪装的木马显形。敌人选路时也会考虑其较慢的速度。</td></tr>
  </table>
  <h3>三、操作</h3>
  <table>
    <tr><th>操作</th><th>方式</th></tr>
    <tr><td>部署设备 / 道具</td><td>把待部署栏的卡片拖到地图上；也可单击卡片后单击地图。拖动时会预览作用范围与新路线。</td></tr>
    <tr><td>设定拦截器朝向</td><td>拦截器放下后，移动鼠标确定朝向，单击确认；右键或 Esc 取消。</td></tr>
    <tr><td>选中</td><td>单击设备、敌人或地块查看详情，可升级、释放技能、撤下。</td></tr>
    <tr><td>旋转视角</td><td>按住鼠标<kbd>中键</kbd>拖动环绕；按住 <kbd>Shift</kbd> + 中键平移；滚轮缩放。</td></tr>
    <tr><td>回到默认视角</td><td><kbd>Home</kbd>，整张地图完整可见。</td></tr>
    <tr><td>暂停 / 调速</td><td><kbd>空格</kbd> 暂停；<kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> 切换 1×、2×、3× 速度，统一作用于整场战斗。</td></tr>
    <tr><td>取消 / 菜单</td><td>右键取消当前操作与选中；<kbd>Esc</kbd> 打开菜单。</td></tr>
  </table>
  <h3>四、资源</h3>
  <table>
    <tr><th>资源</th><th>来源与用途</th></tr>
    <tr><td>算力</td><td>随战局增长，击杀敌人回收。用于部署与升级设备、备份还原。撤下设备退还一半；被摧毁的设备不退款。</td></tr>
    <tr><td>情报</td><td>通过波次、消灭重点威胁（木马、Boss）与持续守住隔离节点获得。用于隔离节点、选择升级分支、情报道具。两种资源不能互换。</td></tr>
  </table>
  <h3>五、设备与升级</h3>
  <p>设备都可升到 2 级。蜜罐与拦截器在 2 级时各在两个互斥分支中二选一（需情报）。主动技能有冷却时间，加密状态下无法释放。</p>
  <h3>六、状态</h3>
  <table>
    <tr><th>状态</th><th>说明与解除</th></tr>
    <tr><td>显形</td><td>木马、Boss 潜伏状态下才会被隐藏。沙箱检测、旧链路与被阻挡会使其显形；显形的目标可被远程单体攻击选中。</td></tr>
    <tr><td>护盾</td><td>吸收伤害。加壳器为附近同伴提供护盾；修复进程的冗余切换为友塔提供护盾。</td></tr>
    <tr><td>加密</td><td>勒索者的攻击施加。加密的塔停止攻击、治疗与技能，但仍然阻挡敌人、维持隔离。以备份还原或冗余切换解除，或等待到期。</td></tr>
    <tr><td>减速 / 压制</td><td>旧链路与协议降级使地面敌人减速；拦截器的压制减速使目标减速 50%。</td></tr>
    <tr><td>困住</td><td>蜜罐的诱捕技能使范围内地面敌人无法移动，持续数秒。</td></tr>
  </table>
  <h3>七、Boss 与预警</h3>
  <p>每张地图的最后一波是 Boss。Boss 改变道路前会在场上预警，红色或紫色区域即将被封锁或黑洞化，预警结束后生效。Boss 不会主动选择会封死入口的位置。</p>
  <h3>八、空中航道</h3>
  <p>伪热点沿无线层从入口直飞最近的出口，画面中的白色虚线即其航道。它不受地面道路与阻挡影响，只能由拦截器对付，应把拦截器的朝向对准航道。</p>
  <h3>九、路线</h3>
  <p>路线颜色对应入口：<span style="color:#3de0ff">A 青</span>、<span style="color:#ffb547">B 琥珀</span>、<span style="color:#ff6fd8">C 粉</span>。实线为当前路线，虚线为预览路线。任何改道都不能让某个入口或地面敌人无路可走；会封死的操作会被拒绝，并且不消耗资源。</p>
  `;

  // ---------- 图鉴三维预览（转台） ----------
  const PREV_CANVAS = '<canvas class="codex-preview" id="cxPrev"></canvas>';
  let prevState = null;
  function stopPreview() {
    if (!prevState) return;
    cancelAnimationFrame(prevState.raf);
    prevState.r.dispose();
    prevState.r.forceContextLoss && prevState.r.forceContextLoss();
    prevState = null;
  }
  function startPreview(canvas, key) {
    stopPreview();
    if (!canvas || !window.THREE || !window.MODELS) return;
    const T = window.THREE, M = window.MODELS;
    const r = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 300;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(w, h, false);
    r.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(30, w / h, 0.1, 60);
    scene.add(new T.HemisphereLight(0xcfeaff, 0x14203a, 1.4));
    const key1 = new T.DirectionalLight(0xffffff, 2.2); key1.position.set(3, 5, 4); scene.add(key1);
    const rim = new T.PointLight(0x3de0ff, 10, 14); rim.position.set(-3, 2, -3); scene.add(rim);
    let model = null, spin = null;
    const plate = new T.Mesh(new T.CylinderGeometry(1.7, 1.7, 0.08, 48), new T.MeshStandardMaterial({ color: 0x14263c, metalness: 0.6, roughness: 0.4 }));
    plate.position.y = -0.04;
    scene.add(plate);
    let sizeFit = 1;
    const towerKey = D.TOWERS[key] ? key : null;
    if (towerKey) model = M.buildTower(towerKey, 2, D.TOWERS[towerKey].branches ? Object.keys(D.TOWERS[towerKey].branches)[0] : null);
    else if (key.startsWith('boss:')) model = M.buildBoss(key.slice(5));
    else if (D.ENEMIES[key]) model = M.buildEnemy(key, false);
    if (!model) return;
    spin = new T.Group();
    spin.add(model.group);
    scene.add(spin);
    const bb = new T.Box3().setFromObject(model.group);
    const size = bb.getSize(new T.Vector3());
    const scale = 1.9 / Math.max(0.4, size.y + 0.2, Math.max(size.x, size.z));
    model.group.scale.setScalar(scale);
    const bb2 = new T.Box3().setFromObject(model.group);
    const cen = bb2.getCenter(new T.Vector3());
    model.group.position.sub(new T.Vector3(cen.x, bb2.min.y, cen.z));
    const top = Math.max(1, bb2.max.y - bb2.min.y);
    cam.position.set(0, top * 0.55 + 0.9, 4.3);
    cam.lookAt(0, top * 0.42, 0);
    const st = { r, raf: 0 };
    prevState = st;
    const t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      spin.rotation.y = t * 0.55;
      if (model.update) {
        if (key === 'trojan') model.update(t, { revealed: Math.sin(t * 0.9) > 0, seed: 0 });
        else if (key.startsWith('boss:')) model.update(t, { phase: 0, seed: 0 });
        else if (D.ENEMIES[key]) model.update(t, { moving: true, seed: 0, shielded: key === 'packer' && Math.sin(t) > 0 });
        else model.update(t, {});
      }
      r.render(scene, cam);
      st.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  // ---------- 图鉴内容 ----------
  function codexHTML(key) {
    const H = (name, color, stat, brief, extra) => `
      <h3 style="color:${color}">${name}</h3><div class="stat">${stat}</div><p>${brief}</p>${extra || ''}`;
    if (key.startsWith('item:')) {
      const it = D.ITEMS[key.slice(5)];
      const costTxt = Object.entries(it.cost).map(([k, v]) => (k === 'intel' ? '情报 ' : '算力 ') + v).join('、');
      return H(it.name, CLS_COLOR[it.cls], `道具 · 费用 ${costTxt} · 冷却 ${it.cd} 秒 · 目标：${it.place}`, it.brief);
    }
    if (key.startsWith('boss:')) {
      const b = D.BOSSES[key.slice(5)];
      return PREV_CANVAS + H(b.name, '#ff7a8f', `Boss · ${b.title} · 生命 ${b.hp} · 中枢伤害 ${b.coreDmg}`, b.brief, `<h4>能力</h4><p>${b.abilities}</p>`);
    }
    if (key.startsWith('state:')) {
      if (key === 'state:node' || key === 'state:terrain') {
        return `<h3>地形与交换节点</h3><p>链路、节点、设备平台、障碍与入口出口共同决定路线。</p><h4>交换节点</h4><p>可以隔离。隔离后的节点不能通行，敌人会绕行；隔离解除后有短暂的再次隔离间隔。</p><h4>旧链路</h4><p>地面敌人减速为一半，经过的木马显形。</p><h4>障碍</h4><p>不能通行，也不能部署。</p>`;
      }
      return `<h3>状态与解除</h3><p>状态会改变单位的行为或设备的运作，解除方式如下。</p>
        <div class="branch"><b>显形</b><br>木马、Boss 潜伏时被隐藏。沙箱检测、旧链路与被阻挡都会使其显形；显形后可被远程单体攻击选中。</div>
        <div class="branch"><b>护盾</b><br>吸收伤害后消失。加壳器为附近同伴提供护盾，修复进程的冗余切换为友塔提供护盾。</div>
        <div class="branch"><b>加密</b><br>勒索者的攻击施加，持续约 6.5 秒。加密的设备停止攻击、治疗与释放技能，但仍阻挡敌人、维持节点隔离。以备份还原或冗余切换解除。</div>
        <div class="branch"><b>减速 / 压制</b><br>旧链路与协议降级使地面敌人减速；拦截器的压制减速使目标减速 50%，并使其受到的伤害提高 25%。</div>
        <div class="branch"><b>困住</b><br>蜜罐的诱捕技能使范围内地面敌人无法移动，持续 5 秒。</div>
        <div class="branch"><b>灼烧</b><br>反制陷阱分支使被蜜罐阻挡的敌人每秒受到伤害。</div>
        <div class="branch"><b>阻挡</b><br>敌人被设备挡下后停止移动，并与之交战；阻挡容量不足时，多余的敌人继续前进。</div>`;
    }
    if (D.TOWERS[key]) {
      const t = D.TOWERS[key];
      let extra = '';
      if (t.skill) extra += `<h4>主动技能：${t.skill.name}</h4><p>${t.skill.desc}（冷却 ${t.skill.cd} 秒）</p>`;
      if (t.branches) {
        extra += '<h4>2 级分支（二选一，需情报）</h4>';
        for (const k of Object.keys(t.branches)) extra += `<div class="branch"><b>${t.branches[k].name}</b><br>${t.branches[k].desc}</div>`;
      }
      if (key === 'gateway') extra += '<h4>用途</h4><p>控制道路，仍会受到敌人的攻击和冲毁。</p>';
      return PREV_CANVAS + H(t.name, CLS_COLOR[t.cls], `${CLS_NAME[t.cls]} · ${t.stats}`, t.brief, extra);
    }
    if (D.ENEMIES[key]) {
      const e = D.ENEMIES[key];
      return PREV_CANVAS + H(e.name, '#ff7a8f', `${e.flying ? '飞行' : '地面'} · 生命 ${e.hp} · 速度 ${e.speed} · 中枢伤害 ${e.coreDmg}`, e.brief);
    }
    return '';
  }

  UI.stopPreview = stopPreview;
  window.UI = UI;
  window.UI_DATA = { CARDS, CLS_NAME, CLS_COLOR, MAP_BLURB, WAVE_TYPE_NAME, drawMinimap, esc };
})();
