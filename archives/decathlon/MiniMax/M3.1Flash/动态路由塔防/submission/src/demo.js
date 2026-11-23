/* =========================================================================
 *  动态路由塔防 · 实战演示
 *  demo.js — 编排局面 / 虚拟鼠标 / 镜头 / 字幕
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});
  const T = THREE;
  const U = RT.util;
  const el = U.el;

  const Demo = {
    app: null, active: false, t: 0, steps: [], stepIndex: 0,
    demo: null, cursor: null, acc: 0
  };

  const LIST = [
    { id: 'demo-1', no: '01', title: '分段取舍', mapName: '分段内网 · 企业内网', duration: 18,
      desc: '把网闸拖到西边界节点，预览中 A 折向 DMZ 互联，与 B 汇流；确认后办公网段的敌人掉头。' },
    { id: 'demo-2', no: '02', title: '旁路直通', mapName: '骨干流域 · 洪峰波', duration: 20,
      desc: '洪泛团冲垮节点上的网闸，C、B 的路线改回原来的数据中心，同时在 A 的路线上投下协议降级。' },
    { id: 'demo-3', no: '03', title: '蛰影现身', mapName: '气隙深层 · 第 16 波', duration: 20,
      desc: '蛰影锁死前方一段运维环，各入口的路线重新收敛，玩家选中修复进程释放冗余切换。' }
  ];
  Demo.list = LIST;

  /* ---------------- 初始化 ---------------- */
  Demo.init = function (app) {
    Demo.app = app;
    const cur = document.createElement('div');
    cur.className = 'demo-cursor';
    cur.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 2l14 9-6 1.4L9.6 19z" fill="#fff" stroke="#00d5ff" stroke-width="1.3"/></svg><i></i>';
    document.body.appendChild(cur);
    Demo.cursor = cur;
  };

  function worldToScreen(v) {
    const app = Demo.app;
    const p = v.clone().project(app.camera);
    const rect = app.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (p.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-p.y * 0.5 + 0.5) * rect.height
    };
  }
  Demo.worldToScreen = worldToScreen;

  function nodeScreen(id) {
    const v = Demo.app.net.v[id];
    return worldToScreen(new T.Vector3(v.x, v.y + 1.0, v.z));
  }
  function cellScreen(gx, gy) {
    const net = Demo.app.net;
    const halfW = (net.cols - 1) / 2, halfH = (net.rows - 1) / 2;
    return worldToScreen(new T.Vector3((gx - halfW) * RT.Net.CELL, 0.4, (gy - halfH) * RT.Net.CELL));
  }
  function towerScreen(type) {
    const b = Demo.app.battle;
    const t = b.towers.filter((x) => x.type === type)[0];
    if (!t) return null;
    return worldToScreen(t.model.group.position.clone().setY(t.model.group.position.y + 0.5));
  }

  function findEdgeCell(gx, gy) {
    const net = Demo.app.net;
    for (let i = 0; i < net.edges.length; i++) {
      const e = net.edges[i];
      const idx = e.cells.findIndex((c) => c.gx === gx && c.gy === gy);
      if (idx >= 0) return { kind: 'link', edge: e, gx: gx, gy: gy };
    }
    return null;
  }

  function place(type, target) {
    const b = Demo.app.battle;
    const res = b.deploy(type, target);
    if (!res.ok) { console.warn('[demo] 部署失败', type, res.reason); return res; }
    const tw = res.tower;
    if (tw && RT.DATA.TOWERS[type].oriented) {
      // 有朝向的设备：面向最近的路线点
      const pos = tw.model.group.position;
      let best = null, bd = 1e9;
      Object.keys(b.routes).forEach((k) => {
        const r = b.routes[k];
        if (!r || !r.pts) return;
        r.pts.forEach((p) => {
          const d = Math.hypot(p.x - pos.x, p.z - pos.z);
          if (d < bd) { bd = d; best = p; }
        });
      });
      if (best) {
        tw.facing = Math.atan2(best.x - pos.x, best.z - pos.z);
        tw.model.group.rotation.y = tw.facing;
      }
      tw.needFacing = false; tw.aimed = true;
    }
    return res;
  }

  // 在指定位置附近生成敌人，并让它直接扑向目标节点
  function spawnNear(app, entry, type, x, z, nodeId) {
    const e = app.battle.spawnEnemy({ t: app.battle.time, e: entry, type: type, hpMul: 1 });
    if (!e) return null;
    const v = app.net.v[nodeId];
    e.path = [
      { x: x, y: 0.4, z: z, gx: 0, gy: 0, e: -1 },
      { x: v.x, y: v.y, z: v.z, gx: v.gx, gy: v.gy, e: -1 }
    ];
    e.pi = 0; e.pt = 0; e.x = x; e.y = 0.4; e.z = z;
    e.group.position.set(x, 0.4, z);
    return e;
  }

  /* ---------------- 剧本 ---------------- */
  const SCRIPTS = {
    'demo-1': {
      map: 'm1',
      setup: function (app) {
        const b = app.battle;
        place('firewall', findEdgeCell(10, 3));
        place('firewall', findEdgeCell(4, 11));
        place('interceptor', { kind: 'platform', gx: 10, gy: 5 });
        place('sandbox', { kind: 'platform', gx: 13, gy: 9 });
        b.spawnEnemy({ t: b.time, e: 'A', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'A', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'B', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'B', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'B', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'A', type: 'flood', hpMul: 1 });
        b.waveState = 'fighting';
        b.wave = 4;
      },
      steps: [
        { t: 0.0, sub: '演示 01 · 分段取舍 —— 企业内网的路由取舍', cam: { az: 0.0, pol: 0.74, dist: 44, target: [0, 0, 0] }, cur: 'center' },
        { t: 3.0, sub: '西边界节点一旦被隔离，入口 A 的通路会被截断', cam: { az: -0.22, pol: 0.66, dist: 30, target: [-7, 0, -6] } },
        { t: 5.2, sub: '从待部署栏拖出「网闸」，拖到西边界节点上', cur: 'card:gateway' },
        { t: 6.4, cur: 'card:gateway', act: 'press' },
        { t: 7.8, cur: 'node:W' },
        { t: 10.2, sub: '预览：A 折向 DMZ 互联，与 B 汇流；办公网段沿旧链路绕行', cur: 'node:W' },
        { t: 12.4, cur: 'node:W', act: 'release', drop: { type: 'gateway', target: { node: 'W' } } },
        { t: 13.0, sub: '确认隔离 —— 西边界节点被截断，路由重新收敛', cam: { az: -0.14, pol: 0.62, dist: 26, target: [-6, 0, -5] } },
        { t: 15.2, sub: '办公网段的敌人掉头，沿旧链路改道', cam: { az: 0.1, pol: 0.66, dist: 26, target: [-11, 0, 4] } },
        { t: 17.2, sub: '隔离改变了流量去向，也改变了防守压力', cam: { az: 0.0, pol: 0.74, dist: 42, target: [0, 0, 0] } }
      ]
    },

    'demo-2': {
      map: 'm2',
      setup: function (app) {
        const b = app.battle;
        place('firewall', findEdgeCell(9, 6));
        place('interceptor', { kind: 'platform', gx: 11, gy: 3 });
        place('sandbox', { kind: 'platform', gx: 7, gy: 9 });
        place('repair', { kind: 'platform', gx: 15, gy: 6 });
        const gw = place('gateway', { kind: 'node', vertex: app.net.v['S3'] });
        if (gw.ok) {
          b.isolated['S3'] = { source: 'tower', hp: 460, until: Infinity, towerId: gw.tower.id };
          b.applyIsolationVisual('S3', true);
          b.recomputeRoutes();
        }
        // 洪泛团从汇聚节点附近扑向网闸
        spawnNear(app, 'C', 'flood', -6.5, 2.5, 'S3');
        spawnNear(app, 'B', 'flood', -4.5, 4.5, 'S3');
        b.spawnEnemy({ t: b.time, e: 'A', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'A', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'C', type: 'worm', hpMul: 1 });
        b.waveState = 'fighting';
        b.wave = 10;
      },
      steps: [
        { t: 0.0, sub: '演示 02 · 旁路直通 —— 骨干流域的洪峰波', cam: { az: 0.0, pol: 0.74, dist: 46, target: [0, 0, 0] }, cur: 'center' },
        { t: 2.6, sub: '跨网汇聚节点上的网闸正在隔离主干道', cam: { az: 0.08, pol: 0.64, dist: 30, target: [-2, 0, -1] } },
        { t: 5.0, sub: '洪泛团脱离路线，重击节点上的网闸', cam: { az: 0.16, pol: 0.58, dist: 24, target: [-4, 0, 2] } },
        { t: 8.2, sub: '隔离器耐久被冲垮 —— 节点恢复直通', cam: { az: 0.08, pol: 0.66, dist: 30, target: [-2, 0, -1] } },
        { t: 10.4, sub: 'C、B 的路线改回原来的数据中心', cam: { az: 0.0, pol: 0.7, dist: 40, target: [0, 0, 0] } },
        { t: 12.4, sub: '同时在 A 的路线上投下协议降级', cur: 'card:downgrade' },
        { t: 13.4, cur: 'card:downgrade', act: 'press' },
        { t: 14.8, cur: 'cell:9,3' },
        { t: 16.4, cur: 'cell:9,3', act: 'release', drop: { item: 'downgrade', cell: [9, 3] } },
        { t: 17.2, sub: '旧协议生效：地面敌人减速，木马显形', cam: { az: 0.1, pol: 0.58, dist: 26, target: [1, 0, -5] } },
        { t: 19.2, sub: '改道与道具共同改变了战局', cam: { az: 0.0, pol: 0.74, dist: 46, target: [0, 0, 0] } }
      ]
    },

    'demo-3': {
      map: 'm3',
      setup: function (app) {
        const b = app.battle;
        place('firewall', findEdgeCell(9, 2));
        place('firewall', findEdgeCell(13, 9));
        place('interceptor', { kind: 'platform', gx: 11, gy: 4 });
        place('sandbox', { kind: 'platform', gx: 7, gy: 9 });
        place('repair', { kind: 'platform', gx: 11, gy: 9 });
        b.spawnEnemy({ t: b.time, e: 'A', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'B', type: 'worm', hpMul: 1 });
        b.spawnEnemy({ t: b.time, e: 'C', type: 'worm', hpMul: 1 });
        const boss = b.spawnEnemy({ t: b.time, e: 'A', type: 'zheyin', hpMul: 1, boss: true });
        // 编排：蛰影已进入破坏阶段
        if (boss) {
          boss.hp = Math.round(boss.maxHp * 0.26);
          boss.bossCd = 1.2;
          boss.phase = 3;
          boss.hidden = false; boss.revealed = true; boss.stealth = false;
          boss.model.setStealth && boss.model.setStealth(false);
          boss.model.setPhase && boss.model.setPhase(3);
        }
        b.waveState = 'fighting';
        b.wave = 16;
      },
      steps: [
        { t: 0.0, sub: '演示 03 · 蛰影现身 —— 气隙深层第 16 波', cam: { az: 0.0, pol: 0.76, dist: 44, target: [0, 0, 0] }, cur: 'center' },
        { t: 2.6, sub: '蛰影进入破坏阶段：锁死前方一段运维环', cam: { az: -0.14, pol: 0.64, dist: 26, target: [-11, 0, -6] } },
        { t: 5.4, sub: '运维环被截断，各入口的路线重新收敛', cam: { az: 0.0, pol: 0.72, dist: 40, target: [0, 0, 0] } },
        { t: 8.2, sub: '关键节点被加密，友塔无法反击', cam: { az: 0.16, pol: 0.6, dist: 24, target: [3, 0, 3] } },
        { t: 11.2, sub: '选中修复进程，准备释放冗余切换', cur: 'tower:repair' },
        { t: 12.6, cur: 'tower:repair', act: 'press' },
        { t: 13.4, cur: 'tower:repair', act: 'release', pickTower: 'repair' },
        { t: 14.8, sub: '释放「冗余切换」：护盾覆盖友塔并解除加密', cur: 'panel:skill' },
        { t: 15.8, cur: 'panel:skill', act: 'press' },
        { t: 16.6, cur: 'panel:skill', act: 'release', skill: true },
        { t: 17.4, sub: '防守重新稳定，防线得以维持', cam: { az: 0.0, pol: 0.74, dist: 42, target: [0, 0, 0] } },
        { t: 19.4, sub: '本段演示结束' }
      ]
    }
  };

  /* ---------------- 执行 ---------------- */
  Demo.start = function (id) {
    const app = Demo.app;
    const script = SCRIPTS[id];
    if (!script) return;
    const meta = LIST.filter((d) => d.id === id)[0];
    app.startMap(script.map);
    app.mode = 'demo';
    app.scriptLock = true;
    app.battle.paused = false;
    app.battle.compute = 900;
    app.battle.intel = 240;
    script.setup(app);
    RT.RouteViz.build(app.battle.routes);
    Demo.active = true;
    Demo.demo = { id: id, meta: meta, script: script };
    Demo.t = 0; Demo.acc = 0; Demo.stepIndex = 0;
    Demo.steps = script.steps.map((s) => Object.assign({}, s));
    Demo.cur = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.58, down: false };
    Demo.goal = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.58 };
    Demo.cursor.style.display = 'block';
    Demo.cursor.style.transform = 'translate(' + Demo.cur.x + 'px,' + Demo.cur.y + 'px)';
    showOverlay(meta, '');
    applyStep(Demo.steps[0]);
    app.audio.sfx('wave');
  };

  Demo.exit = function () {
    Demo.active = false;
    Demo.cursor.style.display = 'none';
    hideOverlay();
    const app = Demo.app;
    app.scriptLock = false;
    app.mode = 'battle';
    RT.UI.showScreen('menu');
  };

  function showOverlay(meta, sub) {
    const o = document.getElementById('demo-overlay');
    if (!o) return;
    o.classList.add('show');
    o.innerHTML = '';
    o.appendChild(el('div', { class: 'do-title' }, [
      el('span', { class: 'do-no', text: meta.no }),
      el('b', { text: meta.title }),
      el('i', { text: meta.mapName })
    ]));
    o.appendChild(el('div', { class: 'do-sub', id: 'do-sub', text: sub || '' }));
  }
  function setSub(text) {
    const s = document.getElementById('do-sub');
    if (s) s.textContent = text;
  }
  function hideOverlay() {
    const o = document.getElementById('demo-overlay');
    if (o) { o.classList.remove('show'); o.innerHTML = ''; }
  }

  function resolveCur(spec) {
    if (!spec) return null;
    if (spec === 'center') return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.56 };
    if (spec.indexOf('card:') === 0) {
      const c = document.querySelector('.tcard[data-type="' + spec.split(':')[1] + '"]');
      if (c) { const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; }
      return null;
    }
    if (spec.indexOf('item:') === 0) {
      const c = document.querySelector('.icard[data-item="' + spec.split(':')[1] + '"]');
      if (c) { const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; }
      return null;
    }
    if (spec.indexOf('node:') === 0) return nodeScreen(spec.split(':')[1]);
    if (spec.indexOf('cell:') === 0) {
      const [gx, gy] = spec.split(':')[1].split(',').map(Number);
      return cellScreen(gx, gy);
    }
    if (spec.indexOf('tower:') === 0) return towerScreen(spec.split(':')[1]);
    if (spec === 'panel:skill') {
      const b = document.querySelector('#sel-panel .btn.skill');
      if (b) { const r = b.getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; }
      return { x: window.innerWidth * 0.8, y: window.innerHeight * 0.5 };
    }
    return null;
  }

  function dispatch(kind, x, y, target) {
    const ev = new PointerEvent(kind, {
      clientX: x, clientY: y, bubbles: true, cancelable: true,
      button: 0, buttons: kind === 'pointerup' ? 0 : 1, pointerId: 1, isPrimary: true
    });
    (target || document.elementFromPoint(x, y) || document.body).dispatchEvent(ev);
  }

  function pressAt(x, y) {
    const app = Demo.app;
    app.demoControl = true;
    dispatch('pointerdown', x, y);
    app.demoControl = false;
    Demo.cur.down = true;
    Demo.cursor.classList.add('down');
  }
  function releaseAt(x, y) {
    const app = Demo.app;
    app.demoControl = true;
    dispatch('pointerup', x, y);
    app.demoControl = false;
    Demo.cur.down = false;
    Demo.cursor.classList.remove('down');
  }

  function applyStep(s) {
    if (!s) return;
    const app = Demo.app;
    if (s.cam) {
      const tgt = s.cam.target ? new T.Vector3(s.cam.target[0], s.cam.target[1], s.cam.target[2]) : undefined;
      app.rig.set(s.cam.az, s.cam.pol, s.cam.dist, tgt);
    }
    if (s.sub !== undefined) setSub(s.sub);
    if (s.cur) {
      Demo.goalSpec = s.cur;
      const p = resolveCur(s.cur);
      if (p) Demo.goal = p;
    }
    if (s.act === 'press') {
      // 等光标到达目标后再按下
      Demo.pendingPress = s;
    } else if (s.act === 'release') {
      Demo.pendingRelease = s;
    }
  }

  // 光标到达目标后执行按下 / 抬起
  function tryActions() {
    const app = Demo.app;
    if (Demo.pendingPress) {
      const d = Math.hypot(Demo.goal.x - Demo.cur.x, Demo.goal.y - Demo.cur.y);
      if (d < 12) { pressAt(Demo.cur.x, Demo.cur.y); Demo.pendingPress = null; }
    }
    if (Demo.pendingRelease) {
      const d = Math.hypot(Demo.goal.x - Demo.cur.x, Demo.goal.y - Demo.cur.y);
      if (d < 14) {
        const s = Demo.pendingRelease;
        releaseAt(Demo.cur.x, Demo.cur.y);
        Demo.pendingRelease = null;
        if (s.drop) performDrop(s.drop);
        if (s.pickTower) {
          const t = app.battle.towers.filter((x) => x.type === s.pickTower)[0];
          if (t) { RT.UI.showSelection({ kind: 'tower', tower: t }); app.audio.sfx('select'); }
        }
        if (s.skill) {
          const t = app.battle.towers.filter((x) => x.type === 'repair')[0];
          if (t) {
            const r = app.battle.useSkill(t);
            if (!r.ok) app.battle.intel += 30, app.battle.useSkill(t);
            app.audio.sfx('skill');
          }
        }
      }
    }
  }

  function performDrop(drop) {
    const app = Demo.app, b = app.battle;
    if (drop.type) {
      const before = b.towers.length;
      let target = null;
      if (drop.target && drop.target.node) target = { kind: 'node', vertex: app.net.v[drop.target.node] };
      else if (drop.target && drop.target.cell) target = findEdgeCell(drop.target.cell[0], drop.target.cell[1]);
      if (b.towers.length === before && target) app.tryDeploy(drop.type, target);
    } else if (drop.item) {
      const net = app.net;
      const halfW = (net.cols - 1) / 2, halfH = (net.rows - 1) / 2;
      const pos = new T.Vector3((drop.cell[0] - halfW) * RT.Net.CELL, 0.4, (drop.cell[1] - halfH) * RT.Net.CELL);
      app.useItemAt(drop.item, { kind: 'link', pos: pos, point: pos });
    }
  }

  Demo.update = function (dt) {
    if (!Demo.active) return;
    if (Demo.frozen) return;
    const app = Demo.app;
    Demo.acc += dt;
    let guard = 0;
    while (Demo.acc >= app.FIXED && guard < 12) {
      app.battle.update(app.FIXED);
      Demo.acc -= app.FIXED;
      guard++;
    }
    if (guard >= 12) Demo.acc = 0;
    Demo.t += dt;

    while (Demo.stepIndex < Demo.steps.length && Demo.steps[Demo.stepIndex].t <= Demo.t) {
      applyStep(Demo.steps[Demo.stepIndex]);
      Demo.stepIndex++;
    }

    if (Demo.goalSpec) {
      const p = resolveCur(Demo.goalSpec);
      if (p) Demo.goal = p;
    }
    if (Demo.goal) {
      const dx = Demo.goal.x - Demo.cur.x, dy = Demo.goal.y - Demo.cur.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1.2) {
        const step = Math.min(dist, 820 * dt);   // 接近正常鼠标速度
        Demo.cur.x += dx / dist * step;
        Demo.cur.y += dy / dist * step;
      }
      Demo.cur.x = Math.max(4, Math.min(window.innerWidth - 4, Demo.cur.x));
      Demo.cur.y = Math.max(4, Math.min(window.innerHeight - 4, Demo.cur.y));
      Demo.cursor.style.transform = 'translate(' + Demo.cur.x + 'px,' + Demo.cur.y + 'px)';
      app.demoControl = true;
      dispatch('pointermove', Demo.cur.x, Demo.cur.y, document);
      dispatch('pointermove', Demo.cur.x, Demo.cur.y, app.renderer.domElement);
      app.demoControl = false;
    }
    tryActions();

    const dur = Demo.demo.meta.duration;
    if (Demo.t >= dur) {
      Demo.active = false;
      Demo.cursor.style.display = 'none';
      hideOverlay();
      app.scriptLock = false;
      app.mode = 'idle';
      RT.UI.showScreen('menu');
      RT.UI.notice('演示「' + Demo.demo.meta.title + '」播放完毕', 'ok');
    }
  };

  RT.Demo = Demo;
})(typeof window !== 'undefined' ? window : globalThis);
