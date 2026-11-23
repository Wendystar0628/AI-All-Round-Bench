/* 界面。文字来自 content.js，和模拟行为用同一套说明。 */
(function (root) {
  'use strict';
  var TD = root.TD = root.TD || {};

  function el(id) { return document.getElementById(id); }
  function show(node, on) { if (node) node.style.display = on ? (node.classList.contains('modal') || node.classList.contains('screen') ? 'flex' : 'block') : 'none'; }

  TD.createUI = function (h) {
    var cardsBuilt = false;
    var routeSig = '';
    var logSig = '';
    var codexTab = 'tower';
    var reported = false;

    function bind() {
      el('btn-enter').onclick = function () { h.screen('select'); };
      el('btn-back-title').onclick = function () { h.screen('title'); };
      el('btn-codex-title').onclick = function () { openCodex(); };
      el('btn-codex').onclick = function () { openCodex(); };
      el('btn-codex-pause').onclick = function () { openCodex(); };
      el('btn-codex-close').onclick = function () { show(el('modal-codex'), false); };
      el('btn-play-demos').onclick = function () { h.playDemos(); };
      el('demo-open-1').onclick = function () { h.demo('demo-1'); };
      el('demo-open-2').onclick = function () { h.demo('demo-2'); };
      el('demo-open-3').onclick = function () { h.demo('demo-3'); };
      el('btn-pause').onclick = function () { h.pauseToggle(); };
      el('btn-resume').onclick = function () { h.pause(false); };
      el('btn-restart').onclick = function () { h.restart(); };
      el('btn-quit').onclick = function () { h.quit(); };
      el('btn-again').onclick = function () { h.restart(); };
      el('btn-report-quit').onclick = function () { h.quit(); };
      el('btn-cam').onclick = function () { h.resetCam(); };
      el('btn-skip').onclick = function () { h.skip(); };
      el('btn-mute').onclick = function () { h.mute(); };
      el('vol').oninput = function () { h.volume(Number(el('vol').value) / 100); };
      el('spd-1').onclick = function () { h.speed(1); };
      el('spd-2').onclick = function () { h.speed(2); };
      el('spd-3').onclick = function () { h.speed(3); };
      el('upgrade-btn').onclick = function () { h.upgrade(); };
      el('skill-btn').onclick = function () { h.skill(); };
      el('sell-btn').onclick = function () { h.sell(); };
      el('demo-exit').onclick = function () { h.skipDemo(); };
      el('btn-branch-cancel').onclick = function () { show(el('modal-branch'), false); };
      var tabs = [['tower', '设备'], ['enemy', '威胁'], ['item', '道具'], ['status', '状态'], ['terrain', '地形']];
      var tabHost = el('codex-tabs');
      tabs.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = t[1];
        b.dataset.tab = t[0];
        b.onclick = function () { codexTab = t[0]; renderCodex(); };
        tabHost.appendChild(b);
      });
    }

    function card(id, name, cost, place, icon, attr, val) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.setAttribute(attr, val);
      b.innerHTML = '<i class="ico ico-' + icon + '"></i><span class="nm">' + name + '</span><span class="cost">' + cost + '</span><span class="place">' + place + '</span>';
      return b;
    }

    function bindBattle() {
      var host = el('cards');
      host.innerHTML = '';
      Object.keys(TD.TOWERS).forEach(function (id) {
        var t = TD.TOWERS[id];
        var extra = t.nodeI ? ' / 节点情报 ' + t.nodeI : '';
        host.appendChild(card(id, t.name, '算力 ' + t.costC + extra, t.place, id, 'data-card', id));
      });
      var gap = document.createElement('div');
      gap.className = 'card split';
      host.appendChild(gap);
      Object.keys(TD.ITEMS).forEach(function (id) {
        var it = TD.ITEMS[id];
        host.appendChild(card(id, it.name, it.cost, it.place, id, 'data-item', id));
      });
      cardsBuilt = true;
      reported = false;
      routeSig = '';
      logSig = '';
    }

    function levels() {
      var host = el('level-list');
      host.innerHTML = '';
      TD.MAPS.forEach(function (map) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'level';
        var tips = (map.tips || []).map(function (t) { return '<li>' + t + '</li>'; }).join('');
        b.innerHTML = '<b>' + map.name + '</b><div class="sub">' + map.subtitle + '</div><p>' + map.blurb + '</p><ul class="tips">' + tips + '</ul>';
        b.onclick = function () { h.start(map.id); };
        host.appendChild(b);
      });
    }

    function renderCodex() {
      var host = el('codex-body');
      var html = '';
      function entry(title, sub, body) {
        html += '<div class="entry"><b>' + title + '</b><p>' + (sub || '') + '</p><p>' + body + '</p></div>';
      }
      if (codexTab === 'tower') {
        Object.keys(TD.TOWERS).forEach(function (id) {
          var t = TD.TOWERS[id];
          entry(t.name + ' · ' + t.role, '部署：' + t.place + '。技能「' + t.skill + '」。', t.manual);
        });
        Object.keys(TD.BRANCHES).forEach(function (id) {
          var b = TD.BRANCHES[id];
          entry(b.name, TD.TOWERS[b.tower].name + ' 的二级分支', b.text);
        });
      } else if (codexTab === 'enemy') {
        Object.keys(TD.ENEMIES).forEach(function (id) {
          var e = TD.ENEMIES[id];
          entry(e.name + (e.boss ? ' · 终局' : ''), '生命 ' + e.hp + (e.flying ? ' · 飞行' : ''), e.manual);
        });
      } else if (codexTab === 'item') {
        Object.keys(TD.ITEMS).forEach(function (id) {
          var it = TD.ITEMS[id];
          entry(it.name, it.cost + ' · ' + it.place, it.manual);
        });
      } else if (codexTab === 'status') {
        TD.STATUSES.forEach(function (s) { entry(s.name, '', s.text); });
      } else {
        TD.TERRAIN.forEach(function (s) { entry(s.name, '', s.text); });
      }
      host.innerHTML = html;
      var buttons = el('codex-tabs').querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) buttons[i].classList.toggle('on', buttons[i].dataset.tab === codexTab);
    }

    function openCodex() {
      renderCodex();
      show(el('modal-codex'), true);
    }

    function meter(label, hp, max, shield) {
      var r = Math.max(0, Math.min(1, hp / (max || 1)));
      var s = shield > 0 ? Math.min(1, shield / (max || 1)) : 0;
      return '<div>' + label + ' ' + Math.ceil(hp) + ' / ' + Math.ceil(max) + (shield > 0 ? ' · 护盾 ' + Math.ceil(shield) : '') + '</div><div class="meter"><span style="width:' + (r * 100) + '%"></span></div>' + (s ? '<div class="meter sh"><span style="width:' + (s * 100) + '%"></span></div>' : '');
    }

    function exitName(battle, key) {
      if (!key) return '中枢';
      for (var i = 0; i < battle.map.exits.length; i++) {
        if (battle.map.exits[i].c + ',' + battle.map.exits[i].r === key) return battle.map.exits[i].name;
      }
      return '中枢';
    }

    function sync(state) {
      var b = state.battle;
      document.body.dataset.screen = state.screen;
      if (b) document.body.dataset.map = b.map.id;
      show(el('demo-exit'), !!state.demo);
      show(el('demo-cursor'), !!state.demo);
      show(el('aim-hint'), !!state.aim);
      show(el('modal-pause'), state.paused && !state.demo);
      el('btn-pause').textContent = state.paused ? '继续' : '暂停';
      ['1', '2', '3'].forEach(function (s) {
        el('spd-' + s).classList.toggle('on', state.speed === Number(s) && !state.demo);
      });
      el('btn-mute').textContent = TD.audio.muted() ? '已静音' : '声音';
      if (!b) return;
      el('brand-name').textContent = b.map.name;
      el('brand-sub').textContent = state.demo ? state.demo.def.title : b.map.subtitle;
      el('stat-c').textContent = Math.floor(b.compute);
      el('stat-i').textContent = Math.floor(b.intel);
      el('stat-h').textContent = Math.ceil(b.integrity);
      var integ = el('stat-integ');
      integ.classList.toggle('bad', b.integrity < 30);
      integ.classList.toggle('warn', b.integrity >= 30 && b.integrity < 60);
      var waveNo = Math.min(b.waves.length, b.waveIndex + 1);
      el('stat-w').textContent = waveNo + '/' + b.waves.length;
      var phase = b.phase === 'prep' ? '间歇 ' + Math.ceil(b.prepLeft) + ' 秒' : b.phase === 'combat' ? '交战中' : b.phase === 'victory' ? '事件结束' : b.phase === 'defeat' ? '中枢失守' : '';
      el('fc-title').textContent = b.demoTitle || '流量预报';
      el('fc-phase').textContent = b.demoNote || phase;
      var rsig = b.routeRev + '|' + (state.previewKey || '');
      if (rsig !== routeSig) {
        routeSig = rsig;
        var html = '';
        b.map.entrances.forEach(function (ent) {
          var route = b.routes[ent.id];
          var changed = state.baseRoutes && route && state.baseRoutes[ent.id] && state.baseRoutes[ent.id] !== route.path.join('|');
          html += '<div class="route"><span><i style="background:' + ent.color + '"></i>' + ent.name + '</span><span>' + (route ? exitName(b, route.exitKey) : '无路') + (changed ? ' <em class="tag">改道</em>' : '') + '</span></div>';
        });
        el('fc-routes').innerHTML = html;
      }
      var wave = b.waves[Math.min(b.waveIndex, b.waves.length - 1)];
      var bits = [];
      if (!b.demoTitle && wave) {
        wave.spawns.forEach(function (s) {
          var ent = b.map.entrances.filter(function (e) { return e.id === s.ent; })[0];
          bits.push((ent ? ent.name : s.ent) + ' ' + TD.ENEMIES[s.type].name + '×' + s.n);
        });
      }
      el('fc-wave').textContent = b.demoTitle ? '' : bits.join(' · ');
      el('btn-skip').style.display = b.phase === 'prep' && !state.demo ? 'block' : 'none';
      var host = el('cards');
      var buttons = host.querySelectorAll('.card');
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        if (btn.dataset.card) {
          var def = TD.TOWERS[btn.dataset.card];
          btn.classList.toggle('broke', b.compute < def.costC);
        }
        if (btn.dataset.item) {
          var item = TD.ITEMS[btn.dataset.item];
          var cd = b.itemCd[btn.dataset.item] || 0;
          btn.classList.toggle('cd', cd > 0);
          var cost = btn.querySelector('.cost');
          if (cost) cost.textContent = cd > 0 ? ('冷却 ' + Math.ceil(cd) + 's') : item.cost;
          var need = item.costI ? b.intel < item.costI : b.compute < item.costC;
          btn.classList.toggle('broke', need && cd <= 0);
        }
      }
      syncInspect(state);
      var ls = b.logs.map(function (l) { return l.level + l.text; }).join('|');
      if (ls !== logSig) {
        logSig = ls;
        el('log').innerHTML = b.logs.slice(-8).map(function (l) {
          return '<p class="' + (l.level || '') + '">' + l.text + '</p>';
        }).join('');
        var last = b.logs[b.logs.length - 1];
        var toast = el('toast');
        if (last && (last.level === 'bad' || last.level === 'warn')) {
          toast.style.display = 'block';
          toast.textContent = last.text;
          toast.dataset.t = String(b.time);
        }
      }
      var toast = el('toast');
      if (toast.style.display === 'block' && b.time - Number(toast.dataset.t || 0) > 2.6) toast.style.display = 'none';
      if (!state.demo && (b.phase === 'victory' || b.phase === 'defeat') && !reported) {
        reported = true;
        showReport(b);
      }
      if (b.phase === 'prep' || b.phase === 'combat') {
        reported = false;
        show(el('modal-report'), false);
      }
    }

    function syncInspect(state) {
      var b = state.battle;
      var title = el('ins-title');
      var sub = el('ins-sub');
      var body = el('ins-body');
      var meters = el('ins-meters');
      var actions = el('ins-actions');
      var up = el('upgrade-btn');
      var sk = el('skill-btn');
      var sell = el('sell-btn');
      actions.style.display = 'none';
      meters.innerHTML = '';
      if (!state.sel) { title.textContent = '未选择'; sub.textContent = '点选设备、流量或格子'; body.textContent = ''; return; }
      if (state.sel.kind === 'tower') {
        var t = b.towerById(state.sel.id);
        if (!t || t.dead) { title.textContent = '设备已损毁'; body.textContent = ''; return; }
        title.textContent = t.def.name + (t.level > 1 ? ' · 二级' : '');
        sub.textContent = (t.branch ? TD.BRANCHES[t.branch].name + ' · ' : '') + t.def.role;
        meters.innerHTML = meter('耐久', t.hp, t.maxHp, t.shield);
        var flags = [];
        if (t.encryptT > 0) flags.push('加密 ' + t.encryptT.toFixed(1) + 's');
        if (t.skillT > 0) flags.push('技能持续 ' + t.skillT.toFixed(1) + 's');
        if (t.type === 'firewall' || t.type === 'honeypot' || t.type === 'gate') flags.push('阻挡 ' + (t.blocked ? t.blocked.length : 0) + '/' + ((t.cap || 0) + (t.bonusCap || 0)));
        body.textContent = flags.join(' · ') + (flags.length ? '。' : '') + t.def.blurb;
        actions.style.display = 'flex';
        up.style.display = t.level >= 2 ? 'none' : 'inline-block';
        up.textContent = '升级 · 算力 ' + t.def.upC + (t.def.upI ? ' / 情报 ' + t.def.upI : '');
        sk.style.display = 'inline-block';
        sk.textContent = t.def.skill + (t.skillCd > 0 ? ' ' + Math.ceil(t.skillCd) + 's' : '');
        sk.disabled = t.skillCd > 0 || t.encryptT > 0;
        sell.style.display = 'inline-block';
        sell.textContent = '撤下 · 返还 ' + Math.floor(t.spentC * 0.5);
      } else if (state.sel.kind === 'enemy') {
        var e = b.enemyById(state.sel.id);
        if (!e || !b.living(e)) { title.textContent = '流量已消失'; body.textContent = ''; return; }
        title.textContent = e.def.name;
        var st = [];
        if (e.def.camo && !e.revealed) st.push('未显形');
        if (e.revealed && e.def.camo) st.push('已显形');
        if (e.shield > 0) st.push('护盾');
        if (e.rootT > 0) st.push('诱捕');
        if (e.slowT > 0) st.push('减速');
        if (e.armorOn) st.push('护甲');
        if (e.state === 'blocked') st.push('受阻');
        if (e.state === 'attacknode') st.push('冲击节点');
        sub.textContent = st.join(' · ') || e.state;
        meters.innerHTML = meter('生命', e.hp, e.maxHp, e.shield);
        body.textContent = e.def.manual;
      } else if (state.sel.kind === 'cell') {
        var cell = b.cellAt(state.sel.c, state.sel.r);
        var node = b.nodeAt(state.sel.c, state.sel.r);
        var terrain = null;
        TD.TERRAIN.forEach(function (t) { if (cell && t.id === (cell.kind === 'spawn' ? 'spawn' : cell.kind === 'exit' ? 'exit' : cell.kind)) terrain = t; });
        title.textContent = node ? node.name : (terrain ? terrain.name : '空地');
        if (cell && cell.decor === 'gap') title.textContent = '气隙';
        if (cell && cell.decor === 'flow') title.textContent = '公网流';
        sub.textContent = '格 ' + state.sel.c + ',' + state.sel.r;
        var extra = terrain ? terrain.text : '';
        if (node) {
          extra += node.isolated ? ' 当前隔离。' : ' 当前直通。';
          if (node.lockT > 0) extra += ' 重构剩余 ' + node.lockT.toFixed(1) + ' 秒。';
        }
        body.textContent = extra;
      }
    }

    function showReport(b) {
      el('report-title').textContent = b.phase === 'victory' ? '事件报告 · 已阻断' : '事件报告 · 中枢失守';
      var s = b.stats;
      el('report-body').innerHTML = [
        ['击破', s.kills], ['泄漏', s.leaks], ['部署', s.built], ['损毁', s.lost],
        ['造成伤害', Math.round(s.dealt)], ['承受伤害', Math.round(s.taken)],
        ['获得算力', Math.round(s.earnedC)], ['守点时间', Math.round(s.hold) + ' 秒'],
        ['剩余完整度', Math.ceil(b.integrity)]
      ].map(function (row) { return '<div class="route"><span>' + row[0] + '</span><b>' + row[1] + '</b></div>'; }).join('');
      show(el('modal-report'), true);
    }

    function openBranch(tower) {
      var host = el('branch-choices');
      host.innerHTML = '';
      el('branch-title').textContent = tower.def.name + ' · 选择二级分支';
      Object.keys(TD.BRANCHES).forEach(function (id) {
        var br = TD.BRANCHES[id];
        if (br.tower !== tower.type) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = '<b>' + br.name + '</b><p>' + br.text + '</p>';
        b.onclick = function () { show(el('modal-branch'), false); h.branch(id); };
        host.appendChild(b);
      });
      show(el('modal-branch'), true);
    }

    function setSubtitle(text) {
      var node = el('subtitle');
      if (!text) { node.style.display = 'none'; return; }
      node.style.display = 'block';
      node.textContent = text;
    }

    function setCursor(x, y, on) {
      var c = el('demo-cursor');
      c.style.display = on ? 'block' : 'none';
      c.style.left = x + 'px';
      c.style.top = y + 'px';
    }

    function setGhost(text, x, y, on) {
      var g = el('drag-ghost');
      g.style.display = on ? 'block' : 'none';
      g.textContent = text || '';
      g.style.left = (x + 16) + 'px';
      g.style.top = (y + 12) + 'px';
    }

    bind();
    levels();
    return {
      sync: sync, bindBattle: bindBattle, openBranch: openBranch,
      setSubtitle: setSubtitle, setCursor: setCursor, setGhost: setGhost, openCodex: openCodex
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
