/* 三段演示用真实战斗和同一套指针。时长合计 56 秒。 */
(function (root) {
  'use strict';
  var TD = root.TD = root.TD || {};
  var CELL = TD.CELL;

  function prep(b, title, note, wave) {
    b.suppressEnd = true;
    b.phase = 'combat';
    b.spawnQ.length = 0;
    b.prepLeft = 0;
    b.waveIndex = wave;
    b.waveT = 0;
    b.demoTitle = title;
    b.demoNote = note;
  }

  var LOCK = ['3,5', '3,6', '3,7', '3,9', '3,10', '3,12', '3,14', '3,15'];

  var DEMOS = [
    {
      id: 'demo-1', map: 'intranet', duration: 17.2, title: '分段取舍',
      setup: function (b) {
        prep(b, '演示 · 分段取舍', '把网闸拖到西边界，先看预览再松手', 6);
        b.place('firewall', 14, 8, 0, { free: true, hpMul: 0.85 });
        b.place('intercept', 12, 8, Math.PI / 2, { free: true });
        b.place('sandbox', 13, 8, 0, { free: true });
        b.compute = 90;
        b.intel = 40;
        [[3, 5], [3, 5], [3, 6]].forEach(function (p) {
          var e = b.spawnAt('worm', p[0], p[1], 'A');
          e.pace = 0.14;
        });
        [[14, 3], [14, 4], [14, 5]].forEach(function (p) { b.spawnAt('worm', p[0], p[1], 'B'); });
        b.spawnAt('ransom', 14, 6, 'B');
      },
      camera: [
        { t: 0, theta: 0.18, phi: 0.76, radius: 66, c: 8, r: 8 },
        { t: 2.8, theta: 0.62, phi: 1.02, radius: 22, c: 3, r: 6 },
        { t: 8.6, theta: -0.2, phi: 0.96, radius: 30, c: 8, r: 4 },
        { t: 12.4, theta: 0.4, phi: 1.02, radius: 24, c: 13, r: 8 },
        { t: 17.2, theta: 0.22, phi: 0.86, radius: 50, c: 10, r: 8 }
      ],
      cursor: [
        { t: 0, at: 'world', c: 8, r: 8, y: 1 },
        { t: 2.6, at: 'el', sel: '[data-card=gate]' },
        { t: 6.5, at: 'world', c: 3, r: 10, y: 1.15 },
        { t: 8.4, at: 'world', c: 6, r: 4, y: 1 },
        { t: 12, at: 'world', c: 14, r: 8, y: 1.3 },
        { t: 17.2, at: 'world', c: 14, r: 8, y: 1.2 }
      ],
      edges: [
        { t: 3.5, down: 1 },
        { t: 7.45, up: 1 },
        { t: 7.55, act: function (b) { b.enemies.forEach(function (e) { if (e.ent === 'A' && e.type === 'worm') e.pace = 1; }); } },
        { t: 8.8, act: function (b) { b.spawnAt('ransom', 14, 2, 'B'); b.spawnAt('worm', 14, 3, 'B'); b.spawnAt('worm', 14, 4, 'B'); } }
      ],
      subs: [
        { t: 0, text: '办公网段告警，门户流量正沿西侧南下。' },
        { t: 7.7, text: '隔离生效，门户流量折入 DMZ 互联。' },
        { t: 16.2, text: '邮件侧仍在交火。演示结束。' }
      ]
    },
    {
      id: 'demo-2', map: 'backbone', duration: 20.6, title: '旁路直通',
      setup: function (b) {
        prep(b, '演示 · 旁路直通', '汇聚节点失守后，路线按实时寻路回到原数据中心', 9);
        b.place('gate', 14, 13, 0, { free: true });
        [[11, 16, 'C'], [12, 16, 'C'], [16, 16, 'B']].forEach(function (p) {
          var e = b.spawnAt('flood', p[0], p[1], p[2]);
          e.pace = 0.72;
        });
        b.place('intercept', 4, 10, -Math.PI / 2, { free: true });
        var worm = b.spawnAt('worm', 2, 10, 'A');
        worm.pace = 0.55;
        [[2, 11], [2, 12]].forEach(function (p) {
          var e = b.spawnAt('trojan', p[0], p[1], 'A');
          e.pace = 0.16;
        });
        b.compute = 120;
        b.intel = 40;
      },
      camera: [
        { t: 0, theta: 0.15, phi: 0.74, radius: 72, c: 10, r: 9 },
        { t: 3.2, theta: 0.35, phi: 1.0, radius: 28, c: 14, r: 14 },
        { t: 7.4, theta: -0.45, phi: 0.98, radius: 32, c: 12, r: 12 },
        { t: 11.2, theta: 0.7, phi: 1.05, radius: 22, c: 3, r: 10 },
        { t: 16.5, theta: 0.5, phi: 1.02, radius: 24, c: 3, r: 10 },
        { t: 20.6, theta: 0.2, phi: 0.82, radius: 60, c: 10, r: 8 }
      ],
      cursor: [
        { t: 0, at: 'world', c: 14, r: 13, y: 1.2 },
        { t: 5.5, at: 'world', c: 14, r: 15, y: 1 },
        { t: 8.6, at: 'el', sel: '[data-item=downgrade]' },
        { t: 12.3, at: 'world', c: 2, r: 10, y: 0.8 },
        { t: 14.2, at: 'world', c: 2, r: 10, y: 0.9 },
        { t: 20.6, at: 'world', c: 2, r: 10, y: 1 }
      ],
      edges: [
        { t: 6.2, act: function (b) { b.forceBreakNode('nConv'); } },
        { t: 4.2, act: function (b) { var e = b.spawnAt('worm', 2, 13, 'A'); e.pace = 0.7; } },
        { t: 9.2, act: function (b) { var e = b.spawnAt('worm', 2, 13, 'A'); e.pace = 0.7; } },
        { t: 9.55, down: 1 },
        { t: 13.35, up: 1 }
      ],
      subs: [
        { t: 0, text: '洪峰压向汇聚节点，分支与云端正被挤往数据中心 X。' },
        { t: 6.55, text: '网闸失守，旁路直通。分支与云端折回数据中心 Y。' },
        { t: 13.6, text: '协议降级落在互联网专线上，伪装剥开，路线按通行时间重算。' },
        { t: 19.6, text: '演示结束。' }
      ]
    },
    {
      id: 'demo-3', map: 'ics', duration: 18.2, title: '蛰影现身',
      lockCells: LOCK,
      setup: function (b) {
        prep(b, '演示 · 蛰影现身', '选中修复进程，释放冗余切换', 15);
        var boss = b.spawnAt('shadow', 7, 4, 'A');
        boss.phase = 2;
        boss.revealed = true;
        boss.armorOn = true;
        boss.hp = boss.maxHp * 0.66;
        boss.pace = 0.35;
        var lead = b.spawnAt('worm', 6, 4, 'A');
        lead.pace = 0.3;
        var side = b.spawnAt('worm', 3, 11, 'B');
        side.pace = 0.05;
        b.place('repair', 13, 10, 0, { free: true });
        var face = Math.atan2(1, 2);
        var ic = b.place('intercept', 13, 7, face, { free: true });
        ic.tower.encryptT = 30;
        b.place('firewall', 14, 9, 0, { free: true, hpMul: 0.85 });
        var ransom = b.spawnAt('ransom', 14, 5, 'C');
        ransom.pace = 0;
        var worm = b.spawnAt('worm', 14, 7, 'C');
        worm.pace = 0.5;
      },
      camera: [
        { t: 0, theta: 0.1, phi: 0.78, radius: 64, c: 8, r: 8 },
        { t: 2.4, theta: 0.45, phi: 1.05, radius: 22, c: 7, r: 4 },
        { t: 6.6, theta: -0.35, phi: 0.98, radius: 30, c: 8, r: 8 },
        { t: 9.2, theta: 0.55, phi: 1.05, radius: 20, c: 13, r: 9 },
        { t: 14.5, theta: 0.4, phi: 1.02, radius: 22, c: 14, r: 8 },
        { t: 18.2, theta: 0.15, phi: 0.84, radius: 52, c: 9, r: 9 }
      ],
      cursor: [
        { t: 0, at: 'world', c: 7, r: 4, y: 1.6 },
        { t: 6.2, at: 'world', c: 3, r: 8, y: 1 },
        { t: 8.8, at: 'world', c: 13, r: 10, y: 1.6 },
        { t: 10.6, at: 'world', c: 13, r: 10, y: 1.6 },
        { t: 11.5, at: 'el', sel: '#skill-btn' },
        { t: 13.2, at: 'world', c: 14, r: 9, y: 1.2 },
        { t: 18.2, at: 'world', c: 14, r: 8, y: 1.2 }
      ],
      edges: [
        { t: 3.2, act: function (b, def) { b.warnLock(def.lockCells, 3, 12); } },
        { t: 6.5, act: function (b) { b.enemies.forEach(function (e) { if (e.ent === 'B' && e.type === 'worm') e.pace = 1; }); } },
        { t: 9.85, down: 1 },
        { t: 10.05, up: 1 },
        { t: 11.95, down: 1 },
        { t: 12.12, up: 1 }
      ],
      subs: [
        { t: 0, text: '蛰影已提权，护甲展开，正沿运维环推进。' },
        { t: 6.4, text: '西段运维环被锁死，跳板与办公下行改道挤入东通道。' },
        { t: 12.25, text: '冗余切换：护盾展开，加密解除。' },
        { t: 17.4, text: '演示结束。' }
      ]
    }
  ];

  TD.DEMOS = DEMOS;
  TD.demoById = function (id) {
    for (var i = 0; i < DEMOS.length; i++) if (DEMOS[i].id === id) return DEMOS[i];
    return null;
  };

  function segment(keys, t) {
    if (!keys.length) return null;
    if (t <= keys[0].t) return { a: keys[0], b: keys[0], k: 0 };
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        var span = keys[i].t - keys[i - 1].t || 1;
        var u = (t - keys[i - 1].t) / span;
        var k = u * u * (3 - 2 * u);
        return { a: keys[i - 1], b: keys[i], k: k };
      }
    }
    var last = keys[keys.length - 1];
    return { a: last, b: last, k: 0 };
  }

  function DemoPlayer(def, api) {
    this.def = def;
    this.api = api;
    this.t = 0;
    this.holding = false;
  }

  DemoPlayer.prototype.camAt = function (t) {
    var s = segment(this.def.camera, t);
    function L(f) { return s.a[f] + (s.b[f] - s.a[f]) * s.k; }
    return {
      theta: L('theta'), phi: L('phi'), radius: L('radius'),
      tx: L('c') * CELL, tz: L('r') * CELL
    };
  };

  DemoPlayer.prototype.pointOf = function (spec) {
    if (spec.at === 'el') {
      var node = document.querySelector(spec.sel);
      if (!node) return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
      var r = node.getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    }
    var p = this.api.project(spec.c * CELL, spec.y || 1, spec.r * CELL);
    return { x: p.x, y: p.y };
  };

  DemoPlayer.prototype.cursorAt = function (t) {
    var s = segment(this.def.cursor, t);
    var A = this.pointOf(s.a);
    var B = this.pointOf(s.b);
    return { x: A.x + (B.x - A.x) * s.k, y: A.y + (B.y - A.y) * s.k };
  };

  DemoPlayer.prototype.look = function (t) {
    this.api.applyCamera(this.camAt(t));
    var p = this.cursorAt(t);
    this.api.setCursor(p.x, p.y, true);
    var text = '';
    var subs = this.def.subs || [];
    for (var i = 0; i < subs.length; i++) if (subs[i].t <= t + 1e-6) text = subs[i].text;
    this.api.setSub(text);
    return p;
  };

  DemoPlayer.prototype.fire = function (t0, t1) {
    var edges = (this.def.edges || []).slice().sort(function (a, b) { return a.t - b.t; });
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      if (e.t <= t0 || e.t > t1) continue;
      var p = this.look(e.t);
      if (e.down) { this.holding = true; this.api.pointer('down', p.x, p.y); }
      if (e.up) { this.api.pointer('up', p.x, p.y); this.holding = false; }
      if (e.act) e.act(this.api.battle(), this.def);
      this.api.sync();
    }
  };

  DemoPlayer.prototype.present = function (t) {
    var p = this.look(t);
    if (this.holding) this.api.pointer('move', p.x, p.y);
  };

  TD.DemoPlayer = DemoPlayer;
})(typeof window !== 'undefined' ? window : globalThis);
