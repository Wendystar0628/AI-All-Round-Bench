/* 实战演示：编排局面 + 时间轴（操作/镜头/字幕/虚拟鼠标），实时与导出共用同一套逻辑。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};
  const CELL = ND.CELL_SIZE;

  // 三段演示定义（供菜单与导出接口使用）
  ND.DEMOS = [
    { id: 'demo-1', title: '分段取舍', map: 'intranet', mapName: '分段内网', dur: 18, seed: 11,
      desc: '把网闸拖到西边界节点，预览中 A 折向 DMZ 互联，确认后办公网段的敌人掉头。' },
    { id: 'demo-2', title: '旁路直通', map: 'backbone', mapName: '骨干流域', dur: 21, seed: 22,
      desc: '洪峰中洪泛团冲垮节点上的网闸，C、B 路线改回原数据中心，玩家同时在 A 路线投下协议降级。' },
    { id: 'demo-3', title: '蛰影现身', map: 'airgap', mapName: '气隙深层', dur: 21, seed: 33,
      desc: '蛰影锁死前方一段运维环，各入口路线重新收敛，玩家选中修复进程释放冗余切换。' },
  ];

  const Demo = ND.Demo = { current: null };

  // ---- 场景工具 ----
  function cellXY(game, x, y) { return y * game.w + x; }
  function place(game, type, x, y, facing) { const r = game.placeTower(type, cellXY(game, x, y), facing); return r.tower; }
  function spawnAt(game, type, x, y, entry) {
    const e = game.spawnEnemy(type, entry || 'A');
    const i = cellXY(game, x, y); const p = game.cellCenter(i);
    e.cell = i; e.x = p.x; e.z = p.z; e.nextCell = null;
    if (!e.flying) { const path = ND.Routing.trace(game.grid, game.field, i); if (path) { e.path = path; e.pathIdx = 0; } }
    return e;
  }
  function buffIt(t) { if (t) { t.level = 2; t.branch = 'suppress'; t.dmg = 18; t.rate = 0.55; t.slow = 0.45; t.slowDur = 1.6; } }
  function buffSb(t) { if (t) { t.level = 2; t.dmg = 23; t.range = 4.0; t.detect = 4.4; t.mark = true; } }
  function buffRp(t) { if (t) { t.level = 2; t.heal = 19; t.range = 4.6; t.shieldPower = 150; } }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  // 由关键帧求值（镜头 / 鼠标）
  function evalKeys(keys, t) {
    if (!keys.length) return null;
    if (t <= keys[0].t) return keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = smooth((t - a.t) / (b.t - a.t || 1));
        const out = { t };
        for (const key of Object.keys(a)) { if (key === 't') continue; out[key] = (typeof a[key] === 'number' && typeof b[key] === 'number') ? lerp(a[key], b[key], k) : (k < 1 ? a[key] : b[key]); }
        return out;
      }
    }
    return keys[keys.length - 1];
  }

  // ---- 场景构建 ----
  function buildScenario(def, game, renderer) {
    const S = { def, game, renderer, actions: [], fired: 0, subs: [], cam: [], cursor: [], duration: def.dur, done: false };
    const at = (t, fn) => S.actions.push({ t, fn });
    const sub = (t0, t1, text) => S.subs.push({ t0, t1, text });
    const cam = (t, x, z, radius) => S.cam.push({ t, x, z, radius });
    const cur = (t, x, y) => S.cursor.push({ t, x, y });
    const click = (t) => S.cursor.push({ t, click: true });
    const R = renderer;
    const W = (x, y) => game.cellCenter(cellXY(game, x, y));

    if (def.id === 'demo-1') {
      game.compute = 400; game.intel = 80;
      const fw = place(game, 'firewall', 9, 6, 0);
      const it = place(game, 'interceptor', 6, 4, Math.PI / 2);
      const sb = place(game, 'sandbox', 12, 4, 0);
      const rp = place(game, 'repair', 6, 7, 0);
      if (it) { it.level = 2; it.branch = 'suppress'; it.dmg = 18; it.rate = 0.6; it.slow = 0.45; it.slowDur = 1.6; }
      game.compute = 120; game.intel = 60;
      const wnode = cellXY(game, 3, 2);
      // 镜头
      cam(0, 0, 0, 34); cam(2.5, 0, 0, 34);
      cam(4, W(3, 2).x, W(3, 2).z, 16); cam(7, W(3, 2).x, W(3, 2).z, 16);
      cam(9, W(6, 3).x, W(6, 3).z, 20); cam(14, W(8, 4).x, W(8, 4).z, 22);
      cam(16.5, 0, 0, 34); cam(18, 0, 0, 34);
      // 鼠标：从部署栏网闸卡片拖到西边界节点
      cur(0, 0.5, 0.92); cur(2, 0.5, 0.92);
      cur(2.6, 0.40, 0.92); // 网闸卡片位置（近似）
      cur(3.2, W(3, 2).x, W(3, 2).z); // 用世界坐标占位，稍后转换
      // 字幕
      sub(0, 2.4, '分段内网 · 办公网段与业务网段同时告警');
      sub(2.4, 4.6, '拖拽网闸至西边界节点，预览入口 A 的新路线');
      sub(4.6, 7, '预览：A 折向 DMZ 互联，与 B 汇流（虚线为新路线）');
      sub(7, 10, '确认隔离 · 办公网段的敌人掉头改道');
      sub(10, 14, '勒索者加密设备，修复进程持续维持防线');
      sub(14, 18, '改道完成 · 路由收敛，连通保持');
      // 操作时间轴
      at(2.6, () => { R.deploy = { type: 'airgap', facing: 0, facingMode: false }; });
      at(3.2, () => { R.hoverCell = wnode; });
      at(4.0, () => { const blocked = new Set(game.blocked); blocked.add(wnode); R.buildRoutes(game, true, blocked, game.legacySet); });
      at(7, () => {
        R.clearPreview(); R.deploy = null;
        game.placeTower('airgap', wnode);
        spawnAt(game, 'worm', 3, 0, 'A'); spawnAt(game, 'worm', 3, 1, 'A');
      });
      at(7.4, () => { spawnAt(game, 'worm', 3, 0, 'A'); });
      at(1, () => { spawnAt(game, 'worm', 15, 1, 'B'); spawnAt(game, 'worm', 15, 2, 'B'); });
      at(2, () => { spawnAt(game, 'trojan', 15, 0, 'B'); spawnAt(game, 'worm', 14, 2, 'B'); });
      at(3, () => { spawnAt(game, 'ransom', 15, 3, 'B'); spawnAt(game, 'worm', 15, 1, 'B'); });
      at(4.5, () => { spawnAt(game, 'worm', 15, 2, 'B'); spawnAt(game, 'worm', 14, 2, 'B'); });
      at(8.5, () => { spawnAt(game, 'worm', 15, 1, 'B'); spawnAt(game, 'trojan', 15, 0, 'B'); });
      at(10, () => { spawnAt(game, 'ransom', 15, 3, 'B'); spawnAt(game, 'worm', 15, 2, 'B'); });
      at(12, () => { if (rp && !rp.dead) game.useSkill(rp); spawnAt(game, 'worm', 15, 1, 'B'); spawnAt(game, 'worm', 14, 2, 'B'); spawnAt(game, 'worm', 15, 2, 'B'); });
      at(14, () => { spawnAt(game, 'trojan', 15, 0, 'B'); spawnAt(game, 'worm', 15, 1, 'B'); });
      // 鼠标世界坐标段落在 update 中转换
      S.cursorWorld = [{ t: 3.2, x: W(3, 2).x, z: W(3, 2).z }, { t: 7, x: W(3, 2).x, z: W(3, 2).z }, { t: 9, x: W(8, 4).x, z: W(8, 4).z }, { t: 14, x: W(8, 4).x, z: W(8, 4).z }];
      S.clicks = [7];
    }

    else if (def.id === 'demo-2') {
      game.compute = 260; game.intel = 90;
      const gate = place(game, 'airgap', 9, 5, 0); // 汇聚节点 J
      const it = place(game, 'interceptor', 3, 4, Math.PI / 2); buffIt(it);
      const sb = place(game, 'sandbox', 7, 4, 0); buffSb(sb);
      const sb2 = place(game, 'sandbox', 3, 8, 0); buffSb(sb2);
      const rp = place(game, 'repair', 3, 6, 0); buffRp(rp);
      const fw = place(game, 'firewall', 1, 6, 0);
      game.compute = 150; game.intel = 70;
      const J = cellXY(game, 9, 5);
      cam(0, 0, 0, 36); cam(2, 0, 0, 36);
      cam(3.5, W(9, 6).x, W(9, 6).z, 18); cam(8, W(9, 6).x, W(9, 6).z, 18);
      cam(9.5, W(3, 7).x, W(3, 7).z, 20); cam(15, W(3, 7).x, W(3, 7).z, 20);
      cam(18, 0, 0, 36); cam(21, 0, 0, 36);
      sub(0, 2.2, '骨干流域 · 洪峰：三入口同时大量出兵');
      sub(2.2, 5, '洪泛团冲向被隔离的汇聚节点，重击网闸');
      sub(5, 8.5, '网闸被冲垮 · 节点旁路直通，C、B 路线改回原数据中心');
      sub(8.5, 12, '玩家同时在 A 的路线上投下协议降级');
      sub(12, 16, '旧协议减速并显形伪装目标，拦截器集火');
      sub(16, 21, '改道与降级缓解压力 · 防线守住数据中心');
      at(1, () => { spawnAt(game, 'flood', 9, 2, 'C'); spawnAt(game, 'flood', 9, 3, 'C'); spawnAt(game, 'worm', 9, 1, 'C'); });
      at(1.5, () => { spawnAt(game, 'flood', 16, 2, 'B'); spawnAt(game, 'worm', 17, 2, 'B'); spawnAt(game, 'worm', 1, 3, 'A'); });
      at(2, () => { spawnAt(game, 'worm', 1, 4, 'A'); spawnAt(game, 'trojan', 1, 2, 'A'); });
      // 洪泛团冲垮网闸（关键事件直接触发，之后改道由逻辑演出）
      at(5, () => {
        if (gate && !gate.dead) game.destroyTower(gate);
        else game.openNode(J);
      });
      at(6, () => { spawnAt(game, 'flood', 9, 4, 'C'); spawnAt(game, 'worm', 9, 2, 'C'); });
      // 协议降级投放到 A 路线
      at(9, () => { R.itemTarget = 'downgrade'; R.hoverCell = cellXY(game, 1, 7); });
      at(10.5, () => { game.useItem('downgrade', cellXY(game, 1, 7)); R.itemTarget = null; });
      at(12, () => { spawnAt(game, 'trojan', 1, 3, 'A'); spawnAt(game, 'worm', 1, 2, 'A'); });
      at(14, () => { if (rp && !rp.dead) game.useSkill(rp); });
      S.cursorWorld = [{ t: 0, x: W(9, 6).x, z: W(9, 6).z }, { t: 5, x: W(9, 6).x, z: W(9, 6).z }, { t: 9, x: W(1, 7).x, z: W(1, 7).z }, { t: 11, x: W(1, 7).x, z: W(1, 7).z }, { t: 15, x: W(3, 7).x, z: W(3, 7).z }];
      S.clicks = [5, 10.5];
    }

    else if (def.id === 'demo-3') {
      game.compute = 400; game.intel = 100;
      const it = place(game, 'interceptor', 4, 5, 0); buffIt(it);
      const sb = place(game, 'sandbox', 4, 9, 0); buffSb(sb);
      const rp = place(game, 'repair', 14, 5, 0); buffRp(rp);
      const it2 = place(game, 'interceptor', 14, 9, Math.PI / 4); buffIt(it2);
      const fw = place(game, 'firewall', 3, 6, 0);
      game.compute = 180; game.intel = 80;
      // Boss 蛰影 从 C 入口出现
      let boss;
      at(0.5, () => { boss = spawnAt(game, 'boss3', 9, 1, 'C'); boss.hp = boss.maxHp * 0.4; boss.phase = 2; boss.revealed = true; boss.disguised = false; });
      cam(0, 0, 0, 36); cam(2, W(9, 4).x, W(9, 4).z, 20);
      cam(5, W(6, 7).x, W(6, 7).z, 18); cam(10, W(6, 7).x, W(6, 7).z, 18);
      cam(12, W(14, 6).x, W(14, 6).z, 18); cam(17, W(14, 6).x, W(14, 6).z, 18);
      cam(19, 0, 0, 36); cam(21, 0, 0, 36);
      sub(0, 2.2, '气隙深层 · 第 16 波：攻击组织核心「蛰影」现身');
      sub(2.2, 5, '破坏阶段：蛰影预警并锁死前方一段运维环');
      sub(5, 9, '运维环被锁死 · 各入口路线重新收敛，入侵流量转移');
      sub(9, 13, '玩家选中修复进程，准备释放冗余切换');
      sub(13, 17, '冗余切换：为友塔提供护盾并解除加密，维持关键防守');
      sub(17, 21, '两个核心相互牵制 · 防线在改道中稳住');
      at(1, () => { spawnAt(game, 'worm', 3, 2, 'A'); spawnAt(game, 'worm', 3, 3, 'A'); spawnAt(game, 'trojan', 15, 2, 'B'); });
      at(2, () => { spawnAt(game, 'ransom', 15, 3, 'B'); });
      // 蛰影锁死运维环（关键事件直接触发预警→锁死，改道由逻辑演出）
      at(3, () => {
        const seg = [cellXY(game, 6, 8), cellXY(game, 6, 9)];
        game.warnings.push({ cell: seg[0], at: game.time + 2, apply: () => { seg.forEach(i => game.blocked.add(i)); game.locks.push({ cells: seg, expires: game.time + 9 }); game.emit('lockStart', { cells: seg, boss }); game.recomputeRoutes(); } });
        game.emit('bossWarning', { boss, cell: seg[0], delay: 2 });
      });
      at(6, () => { spawnAt(game, 'worm', 3, 4, 'A'); spawnAt(game, 'flood', 3, 5, 'A'); });
      at(10, () => { App_select(rp); });
      at(13, () => { if (rp && !rp.dead) game.useSkill(rp); });
      at(15, () => { spawnAt(game, 'trojan', 15, 5, 'B'); spawnAt(game, 'worm', 15, 6, 'B'); });
      function App_select(t) { if (t) { ND.App.selected = t.id; R.selected = t.id; } }
      S.cursorWorld = [{ t: 0, x: W(9, 3).x, z: W(9, 3).z }, { t: 5, x: W(6, 8).x, z: W(6, 8).z }, { t: 10, x: W(14, 5).x, z: W(14, 5).z }, { t: 13, x: W(14, 5).x, z: W(14, 5).z }, { t: 17, x: W(14, 6).x, z: W(14, 6).z }];
      S.clicks = [10, 13];
    }
    S.actions.sort((a, b) => a.t - b.t);
    return S;
  }

  Demo.start = function (def, game, renderer) {
    Demo.current = buildScenario(def, game, renderer);
    game.time = 0;
    Demo._applyVisuals(0);
  };
  Demo.stop = function () { Demo.current = null; };

  Demo.stepTo = function (targetTime) {
    const S = Demo.current; if (!S) return;
    const game = S.game;
    let guard = 0;
    while (game.time < targetTime - 1e-6 && guard++ < 100000) {
      game.step(ND.DT);
      while (S.fired < S.actions.length && S.actions[S.fired].t <= game.time) { S.actions[S.fired].fn(); S.fired++; }
      if (game.over) break;
    }
    Demo._applyVisuals(game.time);
    ND.App.processEvents(game);
    S.renderer.consumeEvents(game);
  };

  Demo._applyVisuals = function (t) {
    const S = Demo.current; if (!S) return;
    const R = S.renderer;
    // 镜头
    const c = evalKeys(S.cam, t);
    if (c) R.focusOn(c.x, c.z, c.radius);
    // 字幕
    let text = '';
    for (const s of S.subs) if (t >= s.t0 && t < s.t1) { text = s.text; break; }
    const subEl = document.getElementById('subtitle');
    if (subEl) subEl.textContent = text;
    // 虚拟鼠标（世界坐标 → 屏幕）
    const cursorEl = document.getElementById('virtual-cursor');
    if (cursorEl && S.cursorWorld && S.cursorWorld.length) {
      const cw = evalKeys(S.cursorWorld, t);
      if (cw) {
        const v = new THREE.Vector3(cw.x, 0.5, cw.z).project(R.camera);
        const sx = (v.x * 0.5 + 0.5) * R.width, sy = (-v.y * 0.5 + 0.5) * R.height;
        cursorEl.style.left = sx + 'px'; cursorEl.style.top = sy + 'px';
      }
      // 点击波纹
      let clicking = false;
      for (const ct of (S.clicks || [])) if (Math.abs(t - ct) < 0.25) clicking = true;
      cursorEl.classList.toggle('click', clicking);
    }
    if (t >= S.duration) S.done = true;
  };

  // 实时演示更新
  Demo.update = function (dt) {
    const S = Demo.current; if (!S) return;
    Demo.stepTo(S.game.time + dt);
    S.renderer.sync(S.game, dt);
    if (S.done) { setTimeout(() => { if (ND.App.state === 'demo') ND.App.exitDemo(); }, 600); Demo.current = null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);