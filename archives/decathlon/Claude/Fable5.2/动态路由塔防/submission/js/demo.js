/* 网络安全攻防战 — 实战演示（在游戏本身的逻辑上实时演出）与视频导出接口 */
(function (root) {
  'use strict';
  const TD = root.TD;
  const $ = s => document.querySelector(s);
  const lerp = TD.lerp, ease = TD.ease;

  // ---------- 局面编排工具 ----------
  function tools(sim) {
    const at = (x, y) => y * sim.W + x;
    return {
      at,
      put(type, x, y, f, lv, br, hp) { const t = sim.place(type, at(x, y), f || 0, true); if (!t) { console.warn('demo: 无法部署', type, x, y); return null; } if (lv === 2) sim.upgrade(t.id, br || null, true); if (hp != null) t.hp = Math.round(t.maxHp * hp); t.born = -5; t.cd = 0.2 + (t.id % 5) * 0.11; return t; },
      foe(type, entry, x, y, o) { o = o || {}; const e = sim.spawnEnemy(type, entry, { x, y, cell: at(x, y), hpMul: o.mul }); if (o.hp != null) e.hp = Math.round(e.maxHp * o.hp); if (o.reveal) e.hidden = false; e.born = -5; if (o.rep) e.replicated = true; const nx = sim.field.next[e.cell]; if (nx >= 0) { e.dirX = sim.grid.cells[nx].x - x; e.dirY = sim.grid.cells[nx].y - y; } return e; },
      seen() { for (const k in TD.ENEMIES) sim.seen[k] = true; },
      queue(list) { sim.spawnQ = list.map(q => ({ t: q[0], type: q[1], entry: q[2] })).sort((a, b) => a.t - b.t); sim.phase = 'active'; sim.waveT = 0; }
    };
  }

  // ====================== 三段演示 ======================
  const DEMOS = [
    {
      id: 'demo-1', map: 'intranet', dur: 19.4, hpMul: 1.55, no: '1 / 3', title: '分段取舍', sub: '分段内网 · 第 8 波',
      setup(sim, T) {
        sim.wave = 7; sim.compute = 186; sim.intel = 5; sim.integrity = 17;
        // 业务网段（东）：成型的火力区
        T.put('interceptor', 13, 6, 1, 2, 'a'); T.put('interceptor', 15, 7, 2, 2, 'b'); T.put('sandbox', 15, 9, 0, 2); T.put('firewall', 14, 9, 0, 2, null, 0.8); T.put('repair', 15, 8, 0, 1);
        T.put('interceptor', 13, 9, 0, 1); T.put('interceptor', 16, 4, 1, 1); T.put('interceptor', 16, 2, 2, 1); T.put('sandbox', 13, 3, 0, 1);
        // 核心前
        T.put('sandbox', 10, 9, 0, 1); T.put('interceptor', 12, 11, 3, 1); T.put('firewall', 11, 11, 0, 1, null, 0.9);
        // 办公网段（西）：薄弱
        this.fw = T.put('firewall', 8, 7, 0, 1, null, 0.42); T.put('interceptor', 7, 6, 0, 1, null, 0.6); T.put('interceptor', 9, 7, 2, 1, null, 0.75);
        // 场上敌人
        T.foe('worm', 'A', 8, 6, { rep: 1 }); T.foe('worm', 'A', 8, 6, { rep: 1, hp: 0.7 }); T.foe('worm', 'A', 8, 5, { rep: 1 }); T.foe('flood', 'A', 7, 5, { hp: 0.9 }); T.foe('trojan', 'A', 6, 5); T.foe('worm', 'A', 5, 5, { rep: 1 }); T.foe('worm', 'A', 5, 4, { rep: 1 });
        T.foe('ransom', 'A', 5, 4); T.foe('worm', 'A', 5, 2); T.foe('trojan', 'A', 5, 2); T.foe('worm', 'A', 5, 1); T.foe('flood', 'A', 5, 0);
        T.foe('worm', 'B', 14, 6, { rep: 1 }); T.foe('worm', 'B', 14, 5, { rep: 1 }); T.foe('worm', 'B', 16, 5, { rep: 1 }); T.foe('packer', 'B', 17, 4); T.foe('worm', 'B', 17, 2); T.foe('trojan', 'B', 17, 1);
        const q = []; for (let i = 0; i < 12; i++) q.push([0.9 + i * 1.1, 'worm', 'A']); q.push([0.8, 'hotspot', 'A'], [2.2, 'hotspot', 'A'], [3, 'trojan', 'A'], [6.5, 'ransom', 'A'], [8, 'flood', 'A'], [10.5, 'trojan', 'A'], [12.5, 'packer', 'A']);
        for (let i = 0; i < 7; i++) q.push([1.5 + i * 1.7, 'worm', 'B']); q.push([4, 'hotspot', 'B'], [5.5, 'hotspot', 'B'], [7, 'ransom', 'B'], [9, 'hotspot', 'B'], [11, 'trojan', 'B']);
        T.queue(q);
      },
      cam: [[0, 'def'], [1.5, 'def'], [3.0, { x: 7.2, y: 6.2, d: 15.5, p: 0.84, w: 0.22 }], [4.5, { x: 7.2, y: 6.2, d: 15.5, p: 0.84, w: 0.22 }], [6.0, 'def'], [8.7, 'def'], [10.2, { x: 8.6, y: 5.4, d: 15, p: 0.82, w: 0.15 }], [12.2, { x: 10.5, y: 4.8, d: 15.5, p: 0.82, w: 0 }], [14.4, { x: 14.2, y: 7.2, d: 14.5, p: 0.8, w: -0.3 }], [17.4, { x: 14.2, y: 7.6, d: 14.5, p: 0.8, w: -0.3 }], [18.7, 'def']],
      subs: [[1.5, 4.4, '办公网段防线薄弱：入口 <b>A“门户网站”</b>的流量正压向<b>西边界</b>'], [4.4, 8.6, '把<b>网闸</b>拖到<b>西边界</b>节点 —— 预览：<b>A</b> 折向 <u>DMZ 互联</u>，与 B 汇流'], [8.6, 12.4, '确认隔离：办公网段里的敌人<i>掉头</i>，就近的改经<i>旧链路</i>（减速、木马显形）'], [12.4, 17.2, '汇流后的流量撞上业务网段的火力；<i>洪泛团</i>离开路线冲击网闸'], [17.2, 19.4, '取舍：路线更长、火力更集中，但隔离点要有人守']],
      script(D, sim) {
        const card = () => D.elPos('#cards .card[data-t="gateway"]'), node = () => D.cellPos(8, 8, 0.35), ok = () => D.elPos('#confirm [data-cf="ok"]');
        D.cur(3.1, 3.2, () => ({ x: innerWidth * 0.56, y: innerHeight * 0.6 }), true);
        D.cur(3.2, 4.2, card);
        D.act(4.3, () => D.press(() => TD.Input.beginCard('gateway', D.evt())));
        D.cur(4.45, 5.9, node, false, true);
        D.act(6.7, () => D.release(() => TD.Input.release(D.cx, D.cy)));
        D.cur(7.5, 8.3, ok);
        D.act(8.5, () => D.click(() => TD.Input.confirm()));
        D.cur(8.9, 9.7, () => ({ x: innerWidth * 0.62, y: innerHeight * 0.7 }));
        D.act(10.0, () => D.hideCursor());
      }
    },
    {
      id: 'demo-2', map: 'backbone', dur: 20.0, hpMul: 1.45, no: '2 / 3', title: '旁路直通', sub: '骨干流域 · 第 9 波 洪峰',
      setup(sim, T) {
        sim.wave = 8; sim.compute = 240; sim.intel = 4; sim.integrity = 16;
        this.gw = T.put('gateway', 18, 5, 0, 1, null, 0.6); T.put('repair', 17, 5, 0, 1, null, 0.7);
        // X 侧（西）：主防线
        T.put('firewall', 5, 10, 0, 2, null, 0.85); T.put('sandbox', 6, 10, 0, 2); T.put('interceptor', 6, 9, 3, 2, 'a'); T.put('interceptor', 7, 10, 2, 2, 'b'); T.put('interceptor', 8, 12, 3, 1); T.put('interceptor', 10, 12, 2, 1); T.put('repair', 6, 12, 0, 1);
        T.put('interceptor', 6, 3, 1, 1); T.put('sandbox', 6, 5, 0, 1); T.put('interceptor', 9, 5, 3, 1); T.put('interceptor', 12, 3, 1, 1);
        // Y 侧（东）：较薄
        T.put('firewall', 18, 10, 0, 1, null, 0.1); T.put('interceptor', 17, 10, 3, 1); T.put('interceptor', 16, 12, 3, 1); T.put('interceptor', 19, 9, 2, 1, null, 0.7);
        // 洪泛团正在冲击汇聚节点
        T.foe('flood', 'B', 18, 4, { hp: 0.85 }); T.foe('flood', 'B', 18, 3); T.foe('flood', 'C', 17, 3, { hp: 0.9 }); T.foe('ransom', 'B', 20, 3);
        for (const [x, y] of [[16, 3], [14, 4], [12, 4], [10, 4], [8, 4], [21, 3], [22, 2]]) T.foe('worm', x > 18 ? 'B' : 'C', x, y, { rep: 1 });
        T.foe('trojan', 'C', 13, 4); T.foe('trojan', 'C', 11, 4); T.foe('packer', 'B', 15, 3);
        for (const [x, y] of [[2, 1], [3, 2], [5, 2], [5, 3]]) T.foe('worm', 'A', x, y); T.foe('trojan', 'A', 4, 2); T.foe('flood', 'A', 2, 2); T.foe('trojan', 'A', 2, 0);
        const q = []; for (let i = 0; i < 9; i++) q.push([0.6 + i * 1.3, 'worm', 'A']); q.push([2.5, 'trojan', 'A'], [5, 'trojan', 'A'], [7.5, 'flood', 'A'], [9.5, 'trojan', 'A'], [12, 'hotspot', 'A']);
        for (let i = 0; i < 6; i++) q.push([0.8 + i * 1.7, 'worm', 'C']); q.push([3, 'trojan', 'C'], [6, 'flood', 'C']);
        for (let i = 0; i < 6; i++) q.push([1.2 + i * 1.7, 'worm', 'B']); q.push([2, 'flood', 'B'], [4.6, 'hotspot', 'B'], [5.6, 'hotspot', 'B'], [6.5, 'packer', 'B'], [8.5, 'ransom', 'B']);
        T.queue(q);
        // 关键事件由演示直接触发：5 秒后的下一次冲击冲垮网闸
        const gw = this.gw; sim.on('smash', d => { if (TD.Demo.t >= 5.0 && !gw.dead && d.ci === gw.ci) gw.hp = 1; });
        sim.on('melee', d => { if (TD.Demo.t >= 5.0 && !gw.dead && d.tower === gw) gw.hp = 1; });
      },
      forced(D, sim) { if (D.t >= 6.2 && !this.gw.dead) sim.destroyTower(this.gw, null); if (!this.gw.dead && D.t < 4.9 && this.gw.hp < 140) this.gw.hp = 140; },
      cam: [[0, 'def'], [1.5, 'def'], [3.0, { x: 18, y: 4.6, d: 13.5, p: 0.8, w: -0.3 }], [5.6, { x: 18, y: 4.8, d: 13.5, p: 0.8, w: -0.3 }], [7.2, 'def'], [9.8, 'def'], [11.2, { x: 17.4, y: 8.6, d: 15, p: 0.8, w: -0.25 }], [14.6, { x: 16.8, y: 10.2, d: 14.5, p: 0.8, w: -0.25 }], [16.2, { x: 5.6, y: 6.4, d: 16.5, p: 0.82, w: 0.28 }], [18.4, { x: 5.6, y: 7.4, d: 16.5, p: 0.82, w: 0.28 }], [19.5, 'def']],
      subs: [[1.5, 5.4, '洪峰：<i>洪泛团</i>离开路线，冲击<b>汇聚节点</b>上的网闸'], [5.4, 9.0, '网闸被冲垮，节点<u>旁路直通</u>：<b>C、B</b> 的路线改回数据中心 <b>Y</b>'], [9.0, 12.2, '同时在 <b>A</b> 的路线上投下<b>协议降级</b>：减速、木马显形'], [12.2, 16.0, 'C、B 涌过<i>旧专线</i>压向 Y —— 较薄的东线开始吃紧'], [16.0, 18.4, '被降级的 A 流量在隧道口被火力覆盖'], [18.4, 20.0, '东线防火墙<i>失守</i> —— 节点恢复直通后 10 秒内不能再次隔离']],
      script(D, sim) {
        const card = () => D.elPos('#items .card[data-k="downgrade"]'), spot = () => D.cellPos(5, 4, 0.05);
        D.cur(4.5, 4.6, () => ({ x: innerWidth * 0.6, y: innerHeight * 0.62 }), true);
        D.cur(4.6, 5.6, card);
        D.act(5.8, () => D.press(() => TD.Input.beginItem('downgrade', D.evt())));
        D.cur(6.0, 7.9, spot, false, true);
        D.act(9.3, () => D.release(() => TD.Input.release(D.cx, D.cy)));
        D.cur(9.8, 10.6, () => ({ x: innerWidth * 0.5, y: innerHeight * 0.7 }));
        D.act(10.8, () => D.hideCursor());
      }
    },
    {
      id: 'demo-3', map: 'airgap', dur: 19.6, hpMul: 2.0, no: '3 / 3', title: '蛰影现身', sub: '气隙深层 · 第 16 波',
      setup(sim, T) {
        sim.wave = 15; sim.compute = 310; sim.intel = 7; sim.integrity = 14; this.warned = false;
        // 西廊
        const sb = T.put('sandbox', 6, 7, 0, 2), ia = T.put('interceptor', 6, 5, 1, 2, 'a'), ib = T.put('interceptor', 5, 7, 0, 2, 'b', 0.7), i3 = T.put('interceptor', 6, 8, 0, 1, null, 0.6);
        this.rep = T.put('repair', 6, 10, 0, 2); T.put('firewall', 7, 12, 0, 2, null, 0.7); T.put('interceptor', 6, 12, 0, 1); T.put('interceptor', 5, 10, 0, 1, null, 0.8); T.put('sandbox', 6, 11, 0, 1); T.put('honeypot', 5, 9, 0, 1, null, 0.8);
        T.put('interceptor', 6, 3, 1, 1); T.put('interceptor', 8, 3, 1, 1);
        // 东廊与 Y
        T.put('interceptor', 18, 8, 2, 2, 'b'); T.put('sandbox', 18, 10, 0, 1); T.put('interceptor', 18, 12, 3, 1); T.put('firewall', 17, 12, 0, 1); T.put('interceptor', 18, 6, 2, 1); T.put('repair', 19, 10, 0, 1); T.put('interceptor', 16, 13, 0, 1); T.put('interceptor', 16, 3, 1, 1);
        for (const t of [sb, ib, i3]) t.encT = 30;      // 勒索者已把西廊的塔加密
        const b = this.boss = T.foe('boss3', 'A', 6, 4); b.hp = Math.round(b.maxHp * 0.4); b.phase = 2; b.speedMul = 1; b.abCd2 = 2.2; b.phaseT = -9; sim.seen.boss3 = true;
        T.foe('packer', 'A', 5, 4); T.foe('trojan', 'A', 7, 5); T.foe('worm', 'A', 4, 4); T.foe('worm', 'A', 4, 3); T.foe('worm', 'A', 4, 1); T.foe('trojan', 'A', 7, 7);
        T.foe('ransom', 'C', 4, 9); T.foe('ransom', 'C', 2, 9); T.foe('trojan', 'C', 1, 8); T.foe('worm', 'C', 6, 9, { rep: 1 }); T.foe('worm', 'C', 7, 10, { rep: 1 });
        for (const [x, y] of [[17, 5], [17, 7], [17, 8], [18, 4], [20, 3]]) T.foe('worm', 'B', x, y, { rep: 1 }); T.foe('flood', 'B', 20, 4); T.foe('flood', 'B', 20, 1);
        const q = []; for (let i = 0; i < 9; i++) q.push([1 + i * 1.5, 'worm', 'B']); q.push([4, 'flood', 'B'], [9, 'hotspot', 'B'], [11, 'hotspot', 'B']);
        for (let i = 0; i < 8; i++) q.push([1.5 + i * 1.7, 'worm', 'A']); q.push([5, 'trojan', 'A'], [9, 'flood', 'A']);
        q.push([2, 'trojan', 'C'], [5, 'worm', 'C'], [7, 'worm', 'C'], [9, 'ransom', 'C'], [12, 'trojan', 'C']);
        T.queue(q);
      },
      forced(D, sim) {
        const b = this.boss; if (b.dead) return;
        if (D.t < 3.5 && b.hp < b.maxHp * 0.36) b.hp = b.maxHp * 0.36;           // 破坏阶段在 3.5 秒进入
        if (D.t >= 3.5 && b.phase === 2) b.hp = Math.min(b.hp, b.maxHp * 0.33);
        if (b.phase === 3 && !this.warned) { b.abCd = 99; if (D.t >= 4.6) { this.warned = true; const W = sim.W; sim.addWarning({ kind: 'lock', boss: b.id, cells: [8 * W + 7, 9 * W + 7, 10 * W + 7], dur: b.d.lockWarn }); b.castT = sim.time; } }
        if (D.t < 17 && b.hp < b.maxHp * 0.08) b.hp = b.maxHp * 0.08;
      },
      cam: [[0, 'def'], [1.5, 'def'], [3.0, { x: 7.2, y: 7.2, d: 13.5, p: 0.78, w: 0.32 }], [7.6, { x: 7.2, y: 8.2, d: 13.5, p: 0.78, w: 0.32 }], [9.4, 'def'], [10.6, 'def'], [12.0, { x: 6.2, y: 8.8, d: 13.5, p: 0.8, w: 0.28 }], [15.0, { x: 6.2, y: 8.2, d: 13.5, p: 0.8, w: 0.28 }], [16.6, { f: 'boss', d: 15.5, p: 0.8, w: 0.2 }], [18.2, { f: 'boss', d: 15.5, p: 0.8, w: 0.2 }], [19.2, 'def']],
      subs: [[1.5, 4.6, '第 16 波：<i>蛰影</i>沿西廊南下，西廊的塔被<i>勒索者加密</i>，火力停摆'], [4.6, 8.2, '破坏阶段 —— <i>预警</i>：蛰影即将锁死前方三格运维环'], [8.2, 11.6, '运维环被锁死，各入口路线重新收敛：<b>A</b> 转入东廊，<b>C</b> 改走老工控总线'], [11.6, 15.6, '选中<b>修复进程</b>，释放<u>冗余切换</u>：护盾 + 解除加密，西廊火力恢复'], [15.6, 18.2, '蛰影掉头绕向东廊 —— 两个核心的防守相互牵制'], [18.2, 19.6, '改变地形前必有预警：看清锁死的位置，再决定守哪一侧']],
      script(D, sim) {
        const rep = this.rep, tw = () => D.cellPos(6, 10, 0.5), sk = () => D.elPos('#iSk', 0.3, 0.5);
        D.cur(10.6, 10.7, () => ({ x: innerWidth * 0.55, y: innerHeight * 0.66 }), true);
        D.cur(10.9, 12.2, tw, false, true);
        D.act(12.4, () => D.click(() => TD.Input.press(D.cx, D.cy)));
        D.cur(12.8, 13.9, sk);
        D.act(14.1, () => D.click(() => { if (!TD.UI.sel || TD.UI.sel.id !== rep.id) TD.UI.select({ kind: 'tower', id: rep.id }); TD.UI.insAct('skill', null, true); }));
        D.cur(14.6, 15.4, () => ({ x: innerWidth * 0.6, y: innerHeight * 0.72 }));
        D.act(15.6, () => D.hideCursor());
      }
    }
  ];

  // ====================== 导演 ======================
  const D = TD.Demo = {
    defs: DEMOS, cur_: null, t: 0, tick0: 0, acts: [], curs: [], cx: 0, cy: 0, cvis: false, down: 0, dragging: false, chain: false, idx: -1, camS: null,

    playAll() { this.chain = true; this.play(0); },
    play(i, o) {
      const A = TD.App, d = this.defs[i]; o = o || {};
      this.idx = i; this.def = d; this.export = !!o.export;
      A.attract = null; A.loadMap(d.map, { noAutoWave: true, seed: 1000 + i * 77 });
      A.state = 'battle'; A.demo = this; A.locked = true; A.paused = false; A.menuOpen = false; A.speed = 1; A.envT = 0; A.acc = 0;
      TD.UI.show(null); TD.UI.hud(true); TD.UI.bindSim(A.sim); TD.Audio.setScene(A.sim.def.theme);
      const sim = A.sim, TL = tools(sim); TL.seen(); const hm = d.hpMul; sim.waveHpMul = () => hm; d.setup(sim, TL);
      sim.recompute('demo');
      this.acts = []; this.curs = []; this.t = 0; this.tick0 = sim.tickN; this.cvis = false; this.dragging = false; this.down = -9; this.rip = -9; this.camS = null; this.ended = false;
      d.script(this, sim);
      this.acts.sort((a, b) => a.t - b.t);
      $('#demo').classList.remove('hidden'); $('#cursor').classList.add('hidden'); $('#dragGhost').classList.add('hidden');
      $('#dTag').textContent = '演示 ' + d.no + ' · ' + d.title;
      $('#log').innerHTML = ''; TD.UI.log('info', 'DEMO', `实战演示 ${d.no}：${d.title}（${d.sub}）`);
      $('#fade').style.transition = 'none'; $('#fade').classList.remove('on');
      this.update(0);
    },
    stop() {
      const A = TD.App; A.demo = null; A.locked = false; this.chain = false; this.def = null;
      $('#demo').classList.add('hidden'); $('#cursor').classList.add('hidden'); $('#dragGhost').classList.add('hidden');
      $('#fade').style.transition = ''; $('#fade').style.opacity = '';
      TD.Input.reset();
    },
    // 时间线登记
    act(t, fn) { this.acts.push({ t, fn, done: false }); },
    cur(t0, t1, to, jump, stick) { this.curs.push({ t0, t1, to, jump: !!jump, stick: !!stick }); },
    evt() { return { clientX: this.cx, clientY: this.cy }; },
    elPos(sel, fx, fy) { const e = $(sel); if (!e) return { x: this.cx, y: this.cy }; const r = e.getBoundingClientRect(); return { x: r.left + r.width * (fx == null ? 0.5 : fx), y: r.top + r.height * (fy == null ? 0.5 : fy) }; },
    cellPos(x, y, h) { const A = TD.App, v = A.view; const p = A.stage.project(v.wx(x), (h || 0), v.wz(y)); return { x: p.x, y: p.y }; },
    press(fn) { this.down = this.t; this.rip = this.t; this.isDown = true; this.dragging = true; fn(); this.syncGhost(); },
    release(fn) { this.isDown = false; this.dragging = false; this.rip = this.t; fn(); $('#dragGhost').classList.add('hidden'); },
    click(fn) { this.down = this.t; this.rip = this.t; this.clickT = this.t; fn(); },
    hideCursor() { this.cvis = false; },
    syncGhost() { const I = TD.Input, g = $('#dragGhost'); const src = I.activeCard ? $('#cards .card[data-t="' + I.activeCard + '"]') : I.activeItem ? $('#items .card[data-k="' + I.activeItem + '"]') : null; if (src) { g.innerHTML = ''; const c = src.cloneNode(true); c.classList.remove('act', 'poor'); c.style.transform = 'none'; g.appendChild(c); g.classList.remove('hidden'); } },

    // 每个模拟步之前：按时间点执行操作
    beforeStep() {
      const sim = TD.App.sim; this.t = (sim.tickN - this.tick0) / 60;
      if (this.def.forced) this.def.forced.call(this.def, this, sim);
      for (const a of this.acts) if (!a.done && this.t >= a.t) { a.done = true; a.fn(); }
    },
    // 每帧：鼠标、镜头、字幕
    update(dt) {
      const A = TD.App, d = this.def; if (!d) return; const sim = A.sim; const t = this.t = (sim.tickN - this.tick0) / 60;
      // —— 鼠标 ——
      let seg = null; for (const s of this.curs) if (t >= s.t0) seg = s;
      if (seg) {
        if (!seg.init) { seg.init = true; seg.fx = this.cx; seg.fy = this.cy; if (seg.jump) this.cvis = true; }
        const to = seg.to(); const k = seg.jump ? 1 : ease(TD.clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1));
        if (k < 1 || seg.stick || seg.jump) { const arc = Math.sin(k * Math.PI) * Math.min(60, Math.hypot(to.x - seg.fx, to.y - seg.fy) * 0.08); this.cx = lerp(seg.fx, to.x, k); this.cy = lerp(seg.fy, to.y, k) - arc; }
      }
      const C = $('#cursor'); C.classList.toggle('hidden', !this.cvis);
      if (this.cvis) { C.style.left = this.cx + 'px'; C.style.top = this.cy + 'px'; const dn = this.isDown || (t - this.down < 0.18); C.classList.toggle('down', dn); const rp = C.querySelector('.rp'), ru = (t - this.rip) / 0.45; if (ru >= 0 && ru < 1) { const s = 0.4 + ru * 3.2; rp.style.width = rp.style.height = s + 'rem'; rp.style.opacity = String(1 - ru); } else rp.style.opacity = '0'; }
      if (this.dragging || (TD.Input.mode !== 'idle' && TD.Input.mode !== 'confirm')) { TD.Input.move(this.cx, this.cy); const g = $('#dragGhost'); g.style.left = this.cx + 'px'; g.style.top = (this.cy + 4) + 'px'; }
      // —— 镜头 ——
      const st = A.stage, keys = d.cam; let a = keys[0], b = keys[0];
      for (let i = 0; i < keys.length; i++) { if (keys[i][0] <= t) { a = keys[i]; b = keys[Math.min(keys.length - 1, i + 1)]; } }
      const res = (k) => { if (k === 'def') return Object.assign({}, st.camDef); const m = A.view.map; let x = k.x, y = k.y; if (k.f === 'boss') { const bs = sim.enemies.find(e => e.boss) || this.lastBoss; if (bs) { this.lastBoss = { x: bs.x, y: bs.y }; x = bs.x; y = bs.y; } else { x = m.ox; y = m.oz; } } return { tx: x - m.ox, ty: 0, tz: y - m.oz + k.d * 0.045, dist: k.d, pitch: k.p, yaw: k.w }; };
      const ca = res(a[1]), cb = res(b[1]), u = b[0] > a[0] ? ease(TD.clamp((t - a[0]) / (b[0] - a[0]), 0, 1)) : 1, cam = st.cam;
      const tgt = {}; for (const k of ['tx', 'ty', 'tz', 'dist', 'pitch', 'yaw']) tgt[k] = lerp(ca[k], cb[k], u);
      if ((a[1] !== 'def' && a[1].f) || (b[1] !== 'def' && b[1].f)) { if (!this.camS) this.camS = Object.assign({}, cam); const q = 1 - Math.pow(0.02, dt); for (const k in tgt) this.camS[k] = lerp(this.camS[k], tgt[k], q); Object.assign(cam, this.camS); } else { Object.assign(cam, tgt); this.camS = null; }
      // —— 字幕、标题卡、进度、淡入淡出 ——
      let sub = null; for (const s of d.subs) if (t >= s[0] && t < s[1]) sub = s;
      const S = $('#dSub'); if (sub) { if (S._s !== sub) { S._s = sub; S.innerHTML = sub[2]; } S.classList.remove('hidden'); const k = Math.min(1, (t - sub[0]) / 0.25, (sub[1] - t) / 0.2); S.style.opacity = String(TD.clamp(k, 0, 1)); S.style.transform = 'translateX(-50%) translateY(' + ((1 - TD.clamp((t - sub[0]) / 0.25, 0, 1)) * 0.6) + 'rem)'; } else { S.classList.add('hidden'); S._s = null; }
      const TT = $('#dTitle'); if (t < 1.55) { if (TT._d !== d) { TT._d = d; TT.innerHTML = `<small>实战演示 ${d.no}</small><b>${d.title}</b><span>${d.sub}</span>`; } TT.classList.remove('hidden'); TT.style.opacity = String(TD.clamp(Math.min(t / 0.25 + 0.4, (1.55 - t) / 0.3), 0, 1)); } else { TT.classList.add('hidden'); TT._d = null; }
      $('#dProg').style.width = (TD.clamp(t / d.dur, 0, 1) * 100) + '%';
      const F = $('#fade'); F.style.opacity = String(TD.clamp(Math.max(1 - t / 0.3, (t - (d.dur - 0.35)) / 0.3), 0, 1));
      // —— 结束 ——
      if (t >= d.dur && !this.ended && !this.export) { this.ended = true; if (this.chain && this.idx < this.defs.length - 1) this.play(this.idx + 1); else { this.stop(); A.toMenu(); } }
    }
  };

  // ====================== 视频导出接口 ======================
  const seen = new Map();
  function syncAnimations(dtMs) {
    if (!document.getAnimations) return;
    const list = document.getAnimations();
    for (const a of list) { try { if (!seen.has(a)) { seen.set(a, 0); a.pause(); a.currentTime = 0; } else { const v = seen.get(a) + dtMs; seen.set(a, v); a.currentTime = v; } } catch (e) { } }
  }
  function painted() { return new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; requestAnimationFrame(() => requestAnimationFrame(fin)); setTimeout(fin, 120); }); }
  const VE = window.videoExport = {
    runs: DEMOS.map(d => d.id), fps: 30, i: -1, ticks: 0, active: false,
    async begin(runId, opts) {
      const A = TD.App, idx = DEMOS.findIndex(d => d.id === runId); if (idx < 0) throw new Error('unknown run: ' + runId);
      this.fps = (opts && opts.fps) || 30; this.i = -1; this.ticks = 0; this.active = true;
      if (TD.Audio.ctx && TD.Audio.ctx.state === 'running') { try { TD.Audio.ctx.suspend(); } catch (e) { } }
      A.exporting = true; D.chain = false; A.resize();
      for (const s of ['menu', 'levels', 'codex', 'report', 'pause', 'settings']) $('#' + s).classList.add('hidden');
      D.play(idx, { export: true }); A.resize(); A.fitDefault(true);
      seen.clear(); syncAnimations(0);
      await painted();
      return { frames: Math.round(DEMOS[idx].dur * this.fps) + 1 };
    },
    async frame(i) {
      const A = TD.App; if (!this.active) throw new Error('call begin() first');
      if (A.stage.w !== window.innerWidth || A.stage.h !== window.innerHeight) { A.resize(); A.fitDefault(false); }
      while (this.i < i) {
        this.i++; const dt = this.i === 0 ? 0 : 1 / this.fps, target = Math.round(this.i / this.fps * 60), n = target - this.ticks; this.ticks = target;
        A.tick(dt, n); syncAnimations(dt * 1000);
      }
      await painted();
    },
    end() {
      const A = TD.App; this.active = false; A.exporting = false;
      if (document.getAnimations) for (const a of document.getAnimations()) { try { a.play(); } catch (e) { } } seen.clear();
      D.stop(); A.toMenu(); A.last = performance.now();
      if (TD.Audio.ctx && TD.Audio.ctx.state === 'suspended') { try { TD.Audio.ctx.resume(); } catch (e) { } }
    }
  };
})(window);
