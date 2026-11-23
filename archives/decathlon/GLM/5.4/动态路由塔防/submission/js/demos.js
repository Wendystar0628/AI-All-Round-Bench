/* 动态路由塔防 —— 实战演示：按游戏时间驱动的编排（假鼠标、镜头、字幕、操作），以及视频导出接口 */
window.G = window.G || {};
(function () {
  'use strict';
  const S = G.Sim, UI = G.UI, A = G.Audio, T = window.THREE;

  function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function cellPos(app, key) { const c = app.game.M.byId.get(key); return app.view.worldToScreen({ x: c.wx, y: c.wy + 0.4, z: c.wz }); }
  function elPos(sel) { const el = document.querySelector(sel); if (!el) return { x: 0, y: 0 }; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  const Demo = {
    cur: null,
    start(app, id, exportMode) {
      const def = this.defs[id]; if (!def) return;
      app.mode = exportMode ? 'export' : 'demo'; app.itemMode = null; app.drag = null; app.aim = null;
      const g = S.createGame(def.map, { seed: def.seed || 7, cpu: def.cpu || 2000, intel: def.intel || 20 });
      def.setup(g, app);
      g.phase = 'demo'; g.paused = false; g.speed = 1;
      app.game = g; app.view.buildMap(g); FX.reset(); UI.setSelection(null); UI.showScreen('battle'); UI.el['demo-ui'].classList.remove('hidden');
      UI.el['demo-title'].innerHTML = '<span class="demo-tag">实战演示</span>' + def.title;
      if (!exportMode) { A.init(); A.startMusic(g.def.theme); }
      this.cur = { id, def, idx: 0, cursor: { x: innerWidth / 2, y: innerHeight / 2, sx: innerWidth / 2, sy: innerHeight / 2, tx: innerWidth / 2, ty: innerHeight / 2, t0: 0, t1: 0, pressed: false, visible: true, tfn: null }, cam: null, ended: false, exportMode };
      // 开场镜头
      const v = app.view; v.cam.userMoved = true; v.focus({ x: 0, z: 0 }, v.cam.tDist, 0, 0.88, true); v.defaultCam(); v.focus({ x: 0, z: 0 }, v.cam.tDist, 0, 0.88, true);
      UI.fakeCursor(this.cur.cursor.x, this.cur.cursor.y, false);
      this.update(app, g, 0);
    },
    stop(app) {
      UI.el['demo-ui'].classList.add('hidden'); UI.fakeCursor(0, 0, false); UI.ghost(0, 0, false); UI.subtitle(null); this.cur = null;
    },
    // 工具
    // target 可以是固定点，也可以是返回屏幕坐标的函数（镜头移动时每帧重新取位置）
    moveCursor(target, t0, dur) { const c = this.cur.cursor; const cur = this.cursorTarget(); c.sx = cur.x; c.sy = cur.y; c.tfn = typeof target === 'function' ? target : null; if (c.tfn) { const p = c.tfn(); c.tx = p.x; c.ty = p.y; } else { c.tx = target.x; c.ty = target.y; } c.t0 = t0; c.t1 = t0 + dur; },
    cursorTarget() { const c = this.cur.cursor; if (c.tfn) { const p = c.tfn(); c.tx = p.x; c.ty = p.y; } return { x: c.tx, y: c.ty }; },
    update(app, g, dt) {
      const C = this.cur; if (!C || C.ended) return; const def = C.def; const c = C.cursor;
      // 执行到期步骤
      while (C.idx < def.steps.length && g.t >= def.steps[C.idx].t) { const st = def.steps[C.idx++]; try { st.fn(C, app, g); } catch (e) { console.error('demo step', e); } }
      // 光标插值
      const tgt = this.cursorTarget();
      const k = c.t1 > c.t0 ? Math.min(1, Math.max(0, (g.t - c.t0) / (c.t1 - c.t0))) : 1; const e = ease(k);
      c.x = c.sx + (tgt.x - c.sx) * e; c.y = c.sy + (tgt.y - c.sy) * e;
      UI.fakeCursor(c.x, c.y, c.visible, c.pressed);
      if (app.drag) { app.drag.x = c.x; app.drag.y = c.y; app.moveDrag(c.x, c.y); UI.ghost(c.x, c.y, true); }
      if (app.aim) { app.moveAim(c.x, c.y); }
      // 镜头跟随
      if (C.camFollow) { const p = C.camFollow(g); if (p) app.view.focus(p, C.camDist || 34, C.camYaw, C.camPitch); }
      if (g.t >= def.duration && !C.exportMode) { C.ended = true; setTimeout(() => app.exitDemo(), 600); }
    },
    defs: {
      'demo-1': {
        map: 'seg', title: '分段取舍 · 分段内网', duration: 19, seed: 11,
        setup(g, app) {
          const cpu = g.cpu; g.cpu = 99999;
          S.deploy(g, 'firewall', '0:6:6'); S.deploy(g, 'honeypot', '0:5:6');
          S.deploy(g, 'interceptor', '0:8:5', -Math.PI / 2); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'pierce');
          S.deploy(g, 'interceptor', '0:10:9', Math.PI); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'suppress');
          S.deploy(g, 'sandbox', '0:8:9'); S.deploy(g, 'repair', '0:10:11');
          S.deploy(g, 'interceptor', '0:12:2', Math.PI / 2);
          g.cpu = cpu; g.intel = 12;
          // A 入口的蠕虫与木马正涌向西边界节点
          const put = (type, entry, cell, prog) => { const e = S.spawnEnemy(g, entry, type, { cell }); e.to = g.routes.next.get(cell); e.prog = prog; };
          put('worm', 'A', '0:3:2', 0.2); put('worm', 'A', '0:3:2', 0.55); put('worm', 'A', '0:3:1', 0.3); put('trojan', 'A', '0:3:1', 0.7); put('worm', 'A', '0:3:2', 0.85);
          put('worm', 'B', '0:15:4', 0.4); put('worm', 'B', '0:15:5', 0.1); put('trojan', 'B', '0:15:2', 0.6);
        },
        steps: [
          { t: 0.0, fn: (C, app, g) => { UI.subtitle('分段内网：入口 A「门户网站」的流量正经西边界节点涌入办公网段'); app.view.focus({ x: -10, z: -10 }, 44, 0, 0.8); C.camDist = 44; C.camYaw = 0; C.camPitch = 0.8; } },
          { t: 2.6, fn: (C, app, g) => { const p = elPos('.tower-card[data-type="gate"]'); C.cursor.sx = C.cursor.x = p.x - 120; C.cursor.sy = C.cursor.y = p.y + 60; Demo.moveCursor(p, g.t, 1.4); } },
          { t: 4.1, fn: (C, app, g) => { C.cursor.pressed = true; app.beginDrag('gate', { clientX: C.cursor.x, clientY: C.cursor.y }); UI.subtitle('把网闸拖到西边界节点 —— 预览显示 A 将折向 DMZ 互联，与 B 汇流'); } },
          { t: 4.4, fn: (C, app, g) => { Demo.moveCursor(() => cellPos(app, '0:3:3'), g.t, 2.0); C.camFollow = () => ({ x: -16, z: -18 }); C.camDist = 30; } },
          { t: 8.0, fn: (C, app, g) => { C.cursor.pressed = false; app.endDrag(C.cursor.x, C.cursor.y); UI.subtitle('确认隔离：节点封闭，A 的敌人从所在位置掉头，改走顶部的 DMZ 互联链路'); } },
          { t: 8.3, fn: (C, app, g) => { C.camFollow = (gg) => { const es = gg.enemies.filter(e => e.type !== 'hotspot'); if (!es.length) return { x: -16, z: -18 }; let x = 0, z = 0; for (const e of es) { x += e.x; z += e.z; } return { x: x / es.length, z: z / es.length }; }; C.camDist = 32; } },
          { t: 11.5, fn: (C, app, g) => { S.spawnEnemy(g, 'A', 'flood', { cell: '0:3:2' }); UI.subtitle('一支洪泛团直扑新隔离的西边界节点，网闸承受重击'); } },
          { t: 14.0, fn: (C, app, g) => { UI.subtitle('守方击退了掉头的蠕虫，但网闸耐久持续下降 —— 隔离需要付出代价'); C.camFollow = () => ({ x: -18, z: -20 }); C.camDist = 26; } },
          { t: 17.0, fn: (C, app, g) => { UI.subtitle(''); } },
        ]
      },
      'demo-2': {
        map: 'backbone', title: '旁路直通 · 骨干流域洪峰', duration: 22, seed: 5,
        setup(g, app) {
          const cpu = g.cpu; g.cpu = 99999; g.intel = 99;
          S.deploy(g, 'gate', '0:17:4');
          S.deploy(g, 'interceptor', '0:13:5', Math.PI / 2); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'pierce');
          S.deploy(g, 'interceptor', '0:15:5', Math.PI / 2); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'suppress');
          S.deploy(g, 'sandbox', '0:13:6'); S.deploy(g, 'repair', '0:15:6');
          S.deploy(g, 'interceptor', '0:10:6', Math.PI); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'pierce');
          S.deploy(g, 'interceptor', '0:8:6', 0); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'pierce');
          S.deploy(g, 'firewall', '0:10:4');
          S.deploy(g, 'interceptor', '0:10:10', -3 * Math.PI / 4); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'suppress');
          S.deploy(g, 'interceptor', '0:8:8', 0); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'suppress');
          S.deploy(g, 'interceptor', '0:15:8', 0); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'pierce');
          S.deploy(g, 'interceptor', '0:15:11', 0); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'suppress');
          g.cpu = cpu; g.intel = 10;
          const put = (type, entry, cell, prog) => { const e = S.spawnEnemy(g, entry, type, { cell }); e.to = g.routes.next.get(cell); e.prog = prog; };
          // 洪泛团逼近汇聚节点上的网闸
          const f1 = S.spawnEnemy(g, 'C', 'flood', { cell: '0:19:4' }); f1.to = '0:18:4'; f1.prog = 0.2;
          const f2 = S.spawnEnemy(g, 'B', 'flood', { cell: '0:16:4' }); f2.to = '0:17:4'; f2.prog = 0.3; f2.side = 0.6;
          // A 的流量在北岸向隧道推进
          put('worm', 'A', '0:8:4', 0.3); put('worm', 'A', '0:9:4', 0.1); put('trojan', 'A', '0:7:4', 0.6); put('worm', 'A', '0:10:4', 0.2);
          // B、C 被导向隧道
          put('worm', 'B', '0:14:4', 0.4); put('worm', 'C', '0:12:4', 0.2); put('trojan', 'C', '0:11:4', 0.7);
        },
        steps: [
          { t: 0.0, fn: (C, app, g) => { UI.subtitle('骨干流域洪峰：汇聚节点被网闸隔离，C、B 的流量被导向数据中心 X'); app.view.focus({ x: 10, z: -8 }, 40, 0, 0.8); C.camDist = 40; C.camYaw = 0; C.camPitch = 0.8; } },
          { t: 2.4, fn: (C, app, g) => { C.camFollow = () => ({ x: 16, z: -10 }); C.camDist = 26; UI.subtitle('洪泛团离开原路线，冲向被隔离的汇聚节点，重击网闸'); } },
          { t: 6.0, fn: (C, app, g) => { const gate = g.towers.find(t => t.type === 'gate'); if (gate) gate.hp = Math.min(gate.hp, 140); UI.subtitle('网闸即将被冲垮 —— 节点一旦恢复直通，C、B 的路线会改回原来的数据中心'); } },
          { t: 7.6, fn: (C, app, g) => { const gate = g.towers.find(t => t.type === 'gate'); if (gate) S.hurtTower(g, gate, 9999, 'enemy'); } },
          { t: 7.9, fn: (C, app, g) => { UI.subtitle('旁路直通：节点重新开放，C、B 的路线改回数据中心 Y，流量从隧道口折返'); } },
          { t: 9.0, fn: (C, app, g) => { const p = elPos('.item-card[data-item="downgrade"]'); C.cursor.sx = C.cursor.x = p.x - 140; C.cursor.sy = C.cursor.y = p.y + 40; Demo.moveCursor(p, g.t, 1.3); C.camFollow = () => ({ x: 4, z: -6 }); C.camDist = 30; } },
          { t: 10.4, fn: (C, app, g) => { C.cursor.pressed = true; } },
          { t: 10.6, fn: (C, app, g) => { C.cursor.pressed = false; app.beginItem('downgrade'); UI.subtitle('同时在 A 的路线上投下协议降级：这片链路切换为旧协议'); } },
          { t: 10.8, fn: (C, app, g) => { Demo.moveCursor(() => cellPos(app, '0:10:4'), g.t, 1.6); } },
          { t: 12.6, fn: (C, app, g) => { C.cursor.pressed = true; } },
          { t: 12.8, fn: (C, app, g) => { C.cursor.pressed = false; const c = g.M.byId.get('0:10:4'); S.useItem(g, 'downgrade', c.id); app.itemMode = null; app.clearPreview(); UI.cursorTip(null); UI.subtitle('协议降级生效：A 的敌人减速、木马显形，并按新的通行速度重新选择路线'); } },
          { t: 14.0, fn: (C, app, g) => { C.camFollow = (gg) => { const es = gg.enemies.filter(e => e.type !== 'hotspot'); if (!es.length) return { x: 4, z: 4 }; let x = 0, z = 0; for (const e of es) { x += e.x; z += e.z; } return { x: x / es.length, z: z / es.length }; }; C.camDist = 34; UI.subtitle('隧道口的拦截器与沙箱收割减速的流量，但仍有洪泛团冲过封锁'); } },
          { t: 18.0, fn: (C, app, g) => { UI.subtitle('守方守住了数据中心 X 的入口，另一路压力转移到了 Y'); } },
          { t: 21.0, fn: (C) => UI.subtitle('') },
        ]
      },
      'demo-3': {
        map: 'airgap', title: '蛰影现身 · 气隙深层第 16 波', duration: 19, seed: 3,
        setup(g, app) {
          const cpu = g.cpu; g.cpu = 99999;
          S.deploy(g, 'firewall', '0:9:12');
          S.deploy(g, 'interceptor', '0:11:11', Math.PI); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'pierce');
          S.deploy(g, 'repair', '0:7:11'); S.upgradeTower(g, g.towers[g.towers.length - 1].id);
          S.deploy(g, 'sandbox', '0:7:4'); S.deploy(g, 'interceptor', '0:11:4', Math.PI / 2); S.upgradeTower(g, g.towers[g.towers.length - 1].id, 'suppress');
          S.deploy(g, 'interceptor', '0:14:8', Math.PI); S.deploy(g, 'honeypot', '0:13:11'); S.deploy(g, 'interceptor', '0:16:11', Math.PI);
          g.cpu = cpu; g.intel = 8;
          const boss = S.spawnEnemy(g, 'C', 'boss_zhe', { cell: '0:13:10' }); boss.to = '0:12:10'; boss.prog = 0.1; boss.bossPhase = 'destroy'; boss.hp = boss.maxHp * 0.3; boss.revealed = true; boss.abilCd = 0.6;
          const fw = g.towers.find(t => t.type === 'firewall'); fw.hp = 260; fw.encUntil = 0;
          const put = (type, entry, cell, prog, revealed) => { const e = S.spawnEnemy(g, entry, type, { cell }); e.to = g.routes.next.get(cell); e.prog = prog; if (revealed) e.revealed = true; };
          put('trojan', 'C', '0:13:7', 0.3); put('worm', 'C', '0:13:6', 0.5); put('worm', 'B', '0:13:5', 0.2); put('trojan', 'B', '0:13:6', 0.9); put('worm', 'A', '0:6:4', 0.4); put('worm', 'A', '0:6:5', 0.1);
        },
        steps: [
          { t: 0.0, fn: (C, app, g) => { UI.subtitle('气隙深层第 16 波：蛰影进入破坏阶段，前方一段运维环即将被锁死'); app.view.focus({ x: 6, z: 6 }, 42, 0, 0.8); C.camDist = 42; C.camYaw = 0; C.camPitch = 0.8; } },
          { t: 0.6, fn: (C, app, g) => { C.camFollow = () => { const b = g.enemies.find(e => e.def.boss); return b ? { x: b.x, z: b.z } : { x: 6, z: 6 }; }; C.camDist = 30; UI.subtitle('蛰影锁死前方一段运维环 —— 锁死前先出现预警'); } },
          { t: 3.6, fn: (C, app, g) => { UI.subtitle('运维环被锁死，各入口的路线重新收敛到两侧通道'); } },
          { t: 6.5, fn: (C, app, g) => { C.camFollow = null; app.view.focus({ x: 2, z: 12 }, 26, 0, 0.7); const p = cellPos(app, '0:7:11'); C.cursor.sx = C.cursor.x = p.x + 160; C.cursor.sy = C.cursor.y = p.y + 120; Demo.moveCursor(() => cellPos(app, '0:7:11'), g.t, 1.5); UI.subtitle('选中修复进程，准备释放冗余切换'); } },
          { t: 8.1, fn: (C, app, g) => { C.cursor.pressed = true; } },
          { t: 8.3, fn: (C, app, g) => { C.cursor.pressed = false; const t = g.towers.find(x => x.type === 'repair'); UI.setSelection({ kind: 'tower', ref: t }); app.view.selected = t; A.play('click'); } },
          { t: 9.0, fn: (C, app, g) => { Demo.moveCursor(() => elPos('#sel-panel .btn.skill'), g.t, 1.4); } },
          { t: 10.5, fn: (C, app, g) => { C.cursor.pressed = true; } },
          { t: 10.7, fn: (C, app, g) => { C.cursor.pressed = false; const t = g.towers.find(x => x.type === 'repair'); if (t) S.castSkill(g, t.id); UI.subtitle('冗余切换：附近的防火墙与拦截器获得护盾并解除加密'); } },
          { t: 11.0, fn: (C, app, g) => { C.camFollow = () => { const b = g.enemies.find(e => e.def.boss); return b ? { x: b.x - 2, z: b.z + 2 } : { x: 6, z: 10 }; }; C.camDist = 24; C.cursor.visible = false; } },
          { t: 14.0, fn: (C, app, g) => { UI.subtitle('护盾抵住了蛰影的爪击，防火墙撑住了过程控制核心的入口'); } },
          { t: 17.5, fn: (C) => UI.subtitle('') },
        ]
      }
    }
  };
  const FX = G.FX;

  // ---------- 视频导出 ----------
  window.videoExport = {
    runs: ['demo-1', 'demo-2', 'demo-3'],
    async begin(runId, opts) {
      const app = G.App; opts = opts || {}; const fps = opts.fps || 30;
      app.exportState = { fps, frame: 0 };
      Demo.start(app, runId, true);
      app.view.syncUnits(app.game, 0, 0); app.view.syncField(app.game, 0, 0); app.view.render(0, 0);
      await paint();
      return { frames: Math.ceil(Demo.defs[runId].duration * fps) + 1 };
    },
    async frame(i) {
      const app = G.App; const st = app.exportState; if (!st) return; const g = app.game; const target = i / st.fps;
      let guard = 0;
      while (g.t < target - 1e-9 && guard++ < 600) { const dt = Math.min(1 / st.fps, target - g.t); S.tick(g, dt); Demo.update(app, g, dt); }
      app.consumeEvents(g);
      app.view.syncUnits(g, 1 / st.fps, g.t); app.view.syncField(g, 1 / st.fps, g.t); FX.update(1 / st.fps, g.t); UI.update(1 / st.fps);
      app.view.render(1 / st.fps, g.t);
      await paint();
    },
    end() { const app = G.App; app.exportState = null; Demo.stop(app); app.toMenu(); }
  };
  function paint() { return new Promise(r => { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))); }); }
  G.Demo = Demo;
})();
