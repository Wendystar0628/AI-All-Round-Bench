// 实战演示：编排好的起始局面 + 脚本化的鼠标操作，在游戏逻辑上实时演出。
// 时间由 tick(app, dt) 推进，因此在视频导出模式下完全确定。
(function () {
  const D = window.GAME_DATA;

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const cellIdx = (g, x, y) => y * g.w + x;
  function cellScreen(app, cell) {
    const g = app.sim.g;
    const p = app.view.toScreen(g.worldX(cell), 0.3, g.worldZ(cell));
    return { x: p[0], y: p[1] };
  }
  function elScreen(sel) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function cardEl(id) { return elScreen(`.card[data-id="${id}"]`); }
  // 战斗中心：正在交战（被阻挡或靠近设备）的敌人的平均位置
  function battleCenter(app) {
    const sim = app.sim;
    let sx = 0, sz = 0, n = 0;
    for (const e of sim.enemies.values()) {
      if (e.dead || e.flying) continue;
      let engaged = !!e.blocker;
      if (!engaged) for (const t of sim.towers.values()) { if (Math.hypot(t.x - e.x, t.z - e.z) < 2.6) { engaged = true; break; } }
      if (engaged) { sx += e.x; sz += e.z; n++; }
    }
    if (!n) for (const e of sim.enemies.values()) { sx += e.x; sz += e.z; n++; }
    if (!n) return null;
    return { x: sx / n, z: sz / n };
  }

  // ---------- 演示定义 ----------
  const SCRIPTS = {};

  // 1. 分段取舍：网闸隔离西边界节点，A 改道
  SCRIPTS['demo-1'] = {
    dur: 19, map: 'intranet', seed: 21, compute: 420, intel: 140, title: '分段取舍',
    setup(app) {
      const sim = app.sim, g = sim.g, c = (x, y) => cellIdx(g, x, y);
      sim.waveNo = 0;
      sim.startWave();
      sim.res.compute = 420;
      sim.placeTower('interceptor', c(2, 6), { angle: Math.PI });
      sim.placeTower('interceptor', c(10, 6), { angle: 0 });
      sim.placeTower('repair', c(12, 6));
      sim.placeTower('firewall', c(13, 6));
      sim.placeTower('sandbox', c(2, 4));
      sim.res.compute = 420;
    },
    steps: [
      { t: 0.2, sub: '分段取舍 · 西边界节点的一次隔离' },
      { t: 1.0, move: { dur: 1.5, to: (app) => cardEl('gateway') } },
      { t: 2.7, press: { id: 'gateway' } },
      { t: 2.9, move: { dur: 2.0, to: (app) => cellScreen(app, cellIdx(app.sim.g, 1, 4)) } },
      { t: 5.0, sub: '预览：网闸隔离西边界节点，A 折向 DMZ 互联，与 B 汇流' },
      { t: 5.6, release: true },
      { t: 5.8, sub: '确认：办公网段的敌人掉头，压力转向东侧业务网段', focus: { cell: [7, 3], dist: 13, pitch: 0.92, follow: true, speed: 1.6 } },
      { t: 8.6, move: { dur: 1.2, to: (app) => cellScreen(app, cellIdx(app.sim.g, 13, 6)) } },
      { t: 9.9, click: { select: (app) => ({ tower: app.sim.cellTower[cellIdx(app.sim.g, 13, 6)].id }) } },
      { t: 10.2, move: { dur: 0.9, to: () => elScreen('[data-act="skill"]') } },
      { t: 11.2, click: { button: '[data-act="skill"]' } },
      { t: 11.4, sub: '防火墙强制阻断：阻挡容量提升，还击伤害翻倍' },
      { t: 13.5, move: { dur: 1.0, to: () => ({ x: window.innerWidth * 0.5, y: window.innerHeight * 0.36 }) } },
      { t: 14.0, sub: '敌方仍在施压：东侧防线承受阻挡与攻击' },
      { t: 17.0, sub: '守方击退部分敌人，设备受损但防线未破' },
      { t: 17.6, focus: { full: true } },
      { t: 18.6, subOff: true },
    ],
  };

  // 2. 旁路直通：洪泛团冲垮网闸，路线回归；玩家在 A 的路线上投降级
  SCRIPTS['demo-2'] = {
    dur: 20, map: 'backbone', seed: 33, compute: 520, intel: 220, title: '旁路直通',
    setup(app) {
      const sim = app.sim, g = sim.g, c = (x, y) => cellIdx(g, x, y);
      sim.waveNo = 11;
      sim.state = 'active';
      sim.prepT = 0;
      sim.res.compute = 520; sim.res.intel = 220;
      // 汇聚节点 M 先被网闸隔离：C、B 改道至数据中心 Y
      sim.placeTower('gateway', c(4, 3));
      sim.placeTower('interceptor', c(4, 2), { angle: Math.PI / 2 });
      sim.placeTower('interceptor', c(6, 4), { angle: -Math.PI / 2 });
      sim.placeTower('sandbox', c(10, 4));
      sim.placeTower('repair', c(12, 2));
      sim.placeTower('firewall', c(13, 3));
      sim.res.compute = 520; sim.res.intel = 220;
      // 洪峰：C、B 的洪泛团与少量其他威胁
      const q = [];
      const base = sim.t;
      const add = (t, e, type) => q.push({ t: base + t, entry: e, type, hpMul: 1.05 });
      add(0.6, 'C', 'flood'); add(2.4, 'C', 'flood'); add(4.2, 'C', 'flood');
      add(1.2, 'B', 'flood'); add(3.0, 'B', 'flood'); add(4.8, 'B', 'flood');
      for (let i = 0; i < 4; i++) add(0.4 + i * 1.3, 'A', 'worm');
      add(5.0, 'A', 'trojan'); add(6.5, 'A', 'trojan');
      add(7.0, 'A', 'hotspot'); add(9.5, 'C', 'ransom');
      q.sort((a, b) => a.t - b.t);
      sim.spawnQ = q;
    },
    steps: [
      { t: 0.2, sub: '旁路直通 · 骨干流域的洪峰' },
      { t: 1.4, sub: '汇聚节点已被网闸隔离：C、B 的路线改至数据中心 Y' },
      { t: 3.4, focus: { cell: [4, 3], dist: 12, pitch: 0.95, follow: true, speed: 1.4 } },
      { t: 6.0, sub: '洪泛团绕向被隔离节点的通行一侧，准备冲击网闸' },
      { t: 8.0, move: { dur: 1.4, to: () => cardEl('downgrade') } },
      { t: 9.6, press: { id: 'downgrade' } },
      { t: 9.9, move: { dur: 1.8, to: (app) => cellScreen(app, cellIdx(app.sim.g, 8, 5)) } },
      { t: 11.9, release: true },
      { t: 12.1, sub: '协议降级：A 的隧道段转为旧协议，地面敌人减速，木马显形' },
      { t: 14.0, sub: '网闸被冲毁，节点旁路直通，C、B 的路线改回数据中心 X' },
      { t: 17.5, sub: '洪泛团沿重新开放的道路前进，防线在节点上承压' },
      { t: 19.0, subOff: true },
    ],
    frame(app, d) {
      const sim = app.sim, g = sim.g;
      const m = cellIdx(g, 4, 3);
      if (!d.flags.restored && !sim.isIsolated(m) && sim.t > 4) {
        d.flags.restored = true;
      }
    },
  };

  // 3. 蛰影现身：锁死运维环，路线收敛，修复进程释放冗余切换
  SCRIPTS['demo-3'] = {
    dur: 18, map: 'airgap', seed: 47, compute: 820, intel: 200, title: '蛰影现身',
    setup(app) {
      const sim = app.sim, g = sim.g, c = (x, y) => cellIdx(g, x, y);
      sim.waveNo = 15;
      sim.state = 'active';
      sim.prepT = 0;
      sim.placeTower('interceptor', c(2, 5), { angle: 0 });
      sim.placeTower('interceptor', c(13, 5), { angle: Math.PI });
      sim.placeTower('sandbox', c(3, 8));
      sim.placeTower('repair', c(3, 7));
      sim.placeTower('interceptor', c(13, 7), { angle: Math.PI });
      sim.placeTower('interceptor', c(3, 6), { angle: 0 });
      sim.placeTower('interceptor', c(13, 6), { angle: Math.PI });
      sim.placeTower('firewall', c(5, 4));
      sim.res.compute = 520; sim.res.intel = 200;
      const q = [];
      const base = sim.t;
      const add = (t, e, type, hpMul) => q.push({ t: base + t, entry: e, type, hpMul: hpMul || 1.2 });
      for (let i = 0; i < 5; i++) add(1.2 + i * 1.1, 'C', 'worm');
      for (let i = 0; i < 3; i++) add(3.0 + i * 1.6, 'B', 'trojan');
      add(4.5, 'A', 'ransom'); add(8.0, 'A', 'ransom');
      for (let i = 0; i < 3; i++) add(5.0 + i * 1.4, 'A', 'worm');
      q.sort((a, b) => a.t - b.t);
      sim.spawnQ = q;
      // 蛰影已潜入左侧通道：沙箱检测前它不能被单体攻击选中
      const boss = sim.spawn('boss:zhenying', 'A', { silent: true });
      boss.a = c(5, 4); boss.b = -1; boss.p = 0; sim.updatePos(boss);
    },
    steps: [
      { t: 0.2, sub: '蛰影现身 · 第 16 波：潜伏在运维环中的攻击组织' },
      { t: 2.6, sub: '预警：蛰影即将锁死底部运维环', lock: [[3, 9], [4, 9], [5, 9]] },
      { t: 7.6, sub: '运维环已锁死：入侵流量改道，转向另一侧狭窄通道' },
      { t: 9.0, move: { dur: 1.3, to: (app) => cellScreen(app, cellIdx(app.sim.g, 3, 7)) } },
      { t: 10.4, click: { select: (app) => ({ tower: app.sim.cellTower[cellIdx(app.sim.g, 3, 7)] && app.sim.cellTower[cellIdx(app.sim.g, 3, 7)].id }) } },
      { t: 10.7, move: { dur: 0.9, to: () => elScreen('[data-act="skill"]') } },
      { t: 11.7, click: { button: '[data-act="skill"]' } },
      { t: 11.9, sub: '修复进程冗余切换：友塔获得护盾，并解除加密' },
      { t: 14.5, sub: '蛰影进入破坏阶段，两侧通道承压，防线仍在' },
      { t: 17.0, subOff: true },
    ],
    frame(app, d) {
      const sim = app.sim;
      if (!d.flags.focus && d.time > 0.5) {
        d.flags.focus = true;
        d.follow = { dist: app.view.defaultDist * 0.78, pitch: 0.95, speed: 1.2 };
        app.view.camGoal = { tx: 0, tz: 0, yaw: 0.2, pitch: 0.95, dist: app.view.defaultDist * 0.78, speed: 1.2 };
      }
    },
  };

  // ---------- 运行时 ----------
  function prepare(id) {
    const cfg = SCRIPTS[id];
    if (!cfg) return null;
    const meta = D.DEMOS.find((x) => x.id === id);
    const d = {
      id, title: cfg.title || meta.title, map: cfg.map, seed: cfg.seed, compute: cfg.compute, intel: cfg.intel,
      cfg, time: 0, cur: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.8 }, tween: null,
      dragging: false, follow: null, followT: 0, flags: {}, done: [], ended: false,
      setup(app) { cfg.setup(app); app.view.setDefaultView(true); d.setupDone = true; },
    };
    return d;
  }
  function duration(id) { const c = SCRIPTS[id]; return c ? c.dur : 1; }

  function runStep(app, d, s) {
    const sim = app.sim;
    if (s.sub) app.setSubtitleVisible(true, s.sub);
    if (s.subOff) app.setSubtitleVisible(false);
    if (s.move) {
      const to = s.move.to(app) || d.cur;
      const to2 = (typeof to === 'function') ? to : null;
      d.tween = { t0: d.time, dur: s.move.dur, from: { x: d.cur.x, y: d.cur.y }, toFn: s.move.to, fallback: { x: to.x, y: to.y } };
    }
    if (s.click) {
      clickFx(d);
      if (s.click.select) {
        const pk = s.click.select(app);
        if (pk && (pk.tower || pk.cell != null)) app.select(pk);
        app.refreshSel(true);
      }
      if (s.click.button) {
        const b = document.querySelector(s.click.button);
        if (b) b.click();
      }
    }
    if (s.press) {
      clickFx(d);
      const c = D.CARDS || null;
      const id = s.press.id;
      const card = window.UI_DATA.CARDS.find((x) => x.id === id);
      d.dragCard = card;
      app.mode = { type: card.kind === 'tower' ? 'tower' : 'item', id };
      app.setArmed(id);
      app.showGhost(card);
      app.moveGhost(d.cur.x, d.cur.y);
      d.dragging = true;
    }
    if (s.release) {
      if (d.dragging) {
        const cell = app.view.cellAt(d.cur.x, d.cur.y);
        app.hideGhost();
        d.dragging = false;
        if (cell >= 0) {
          app.applyModeAt(cell, d.cur.x, d.cur.y);
        } else {
          app.mode = null; app.setArmed(null); app.clearPreview();
        }
      }
    }
    if (s.lock) {
      sim.scheduleLock(s.lock.map(([x, y]) => cellIdx(sim.g, x, y)), 3.2, 12);
    }
    if (s.planLock) {
      const boss = sim.bossList()[0];
      if (boss) sim.planLock(boss);
    }
    if (s.focus) {
      if (s.focus.full) {
        app.view.camGoal = { tx: 0, tz: 0, yaw: 0, pitch: 0.98, dist: app.view.defaultDist, speed: 1.3 };
        d.follow = null;
      } else {
        const g = sim.g;
        const cell = s.focus.cell;
        const tx = g.worldX(cellIdx(g, cell[0], cell[1])), tz = g.worldZ(cellIdx(g, cell[0], cell[1]));
        app.view.camGoal = { tx, tz, yaw: 0, pitch: s.focus.pitch || 0.95, dist: s.focus.dist || 12, speed: s.focus.speed || 1.5 };
        d.follow = s.focus.follow ? { dist: s.focus.dist || 12, pitch: s.focus.pitch || 0.95, speed: s.focus.speed || 1.5 } : null;
      }
    }
  }
  function clickFx(d) {
    d.clickAt = d.time;
  }

  function tick(app, dt) {
    const d = app.demo;
    if (!d || !d.cfg || d.ended) return;
    d.time += dt;
    const steps = d.cfg.steps;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (d.done[i]) continue;
      if (s.t <= d.time) { d.done[i] = true; runStep(app, d, s); }
    }
    // 光标移动（缓动）
    if (d.tween) {
      const tw = d.tween;
      const p = Math.min(1, (d.time - tw.t0) / tw.dur);
      const target = tw.toFn ? (tw.toFn(app) || tw.fallback) : tw.fallback;
      if (target) {
        tw.fallback = { x: target.x, y: target.y };
        const k = ease(p);
        d.cur.x = tw.from.x + (target.x - tw.from.x) * k;
        d.cur.y = tw.from.y + (target.y - tw.from.y) * k;
      }
      if (p >= 1) d.tween = null;
    }
    // 拖拽：幽灵卡片跟随，并实时预览
    if (d.dragging) {
      app.moveGhost(d.cur.x, d.cur.y);
      app.updateHover(d.cur.x, d.cur.y);
    }
    // 镜头跟随战斗
    if (d.follow) {
      d.followT -= dt;
      if (d.followT <= 0) {
        d.followT = 0.5;
        const bc = battleCenter(app);
        if (bc) {
          d.followTarget = bc;
          app.view.camGoal = { tx: bc.x, tz: bc.z, yaw: app.view.cam.yaw, pitch: d.follow.pitch, dist: d.follow.dist, speed: d.follow.speed };
        }
      }
    }
    if (d.cfg.frame) d.cfg.frame(app, d, dt);
    // 光标 DOM
    const cur = document.getElementById('cursorFx');
    if (cur) {
      cur.classList.remove('hidden');
      cur.style.left = (d.cur.x - 5) + 'px';
      cur.style.top = (d.cur.y - 3) + 'px';
      const since = d.time - (d.clickAt == null ? -9 : d.clickAt);
      cur.classList.toggle('click', since >= 0 && since < 0.45);
    }
    if (d.time >= d.cfg.dur && !d.ended) {
      d.ended = true;
      app.paused = true;
      if (!app.exportMode) app.setSubtitleVisible(true, '演示结束 · 按 Esc 返回菜单');
    }
  }

  function cleanup(app) {
    const cur = document.getElementById('cursorFx');
    if (cur) cur.classList.add('hidden');
    app.hideGhost();
    app.mode = null;
    app.setArmed && app.setArmed(null);
    app.setSubtitleVisible(false);
  }

  window.Demo = { prepare, tick, cleanup, duration, SCRIPTS };
})();
