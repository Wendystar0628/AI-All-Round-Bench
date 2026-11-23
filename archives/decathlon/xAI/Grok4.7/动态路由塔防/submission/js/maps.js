/* 地图、格子与寻路。浏览器与 Node 共用。坐标系：列 x 向东，行 z 向南，y 向上。 */
(function (root) {
  'use strict';
  var TD = root.TD = root.TD || {};
  TD.CELL = 2.4;
  TD.OLD_COST = 2.55;

  function key(c, r) { return c + ',' + r; }
  TD.key = key;

  function walkKind(k) {
    return k === 'path' || k === 'old' || k === 'node' || k === 'spawn' || k === 'exit';
  }
  TD.walkKind = walkKind;

  function Builder(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.cells = {};
    this.nodes = [];
    this.entrances = [];
    this.exits = [];
  }

  Builder.prototype._put = function (c, r, kind, opt) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) {
      throw new Error('越界 ' + c + ',' + r);
    }
    var k = key(c, r);
    var prev = this.cells[k];
    var cell = prev || { c: c, r: r };
    if (kind === 'old') cell.old = true;
    if (!prev) {
      cell.kind = kind === 'old' ? 'old' : kind;
      this.cells[k] = cell;
      return cell;
    }
    if (kind === 'path') {
      if (cell.kind === 'obstacle' || cell.kind === 'platform') {
        throw new Error('道路压到占据格 ' + k);
      }
      if (!cell.kind || cell.kind === 'path') cell.kind = cell.old ? 'old' : 'path';
      return cell;
    }
    if (kind === 'old') {
      if (cell.kind === 'obstacle' || cell.kind === 'platform') throw new Error('旧链路压到占据格 ' + k);
      if (cell.kind === 'path' || cell.kind === 'old' || !cell.kind) cell.kind = 'old';
      cell.old = true;
      return cell;
    }
    cell.kind = kind;
    if (opt) {
      for (var p in opt) if (opt.hasOwnProperty(p)) cell[p] = opt[p];
    }
    this.cells[k] = cell;
    return cell;
  };

  Builder.prototype.line = function (c0, r0, c1, r1, kind) {
    if (c0 !== c1 && r0 !== r1) throw new Error('斜线 ' + c0 + ',' + r0 + ' -> ' + c1 + ',' + r1);
    var dc = Math.sign(c1 - c0), dr = Math.sign(r1 - r0);
    var c = c0, r = r0;
    while (true) {
      this._put(c, r, kind || 'path');
      if (c === c1 && r === r1) break;
      c += dc;
      r += dr;
    }
  };

  Builder.prototype.node = function (id, name, c, r) {
    var cell = this._put(c, r, 'node', { nodeId: id });
    cell.nodeId = id;
    this.nodes.push({ id: id, name: name, c: c, r: r });
  };

  Builder.prototype.entrance = function (id, name, c, r, color) {
    this._put(c, r, 'spawn', { ent: id });
    this.entrances.push({ id: id, name: name, c: c, r: r, color: color });
  };

  Builder.prototype.exit = function (id, name, c, r, color) {
    var cell = this._put(c, r, 'exit', { exit: id });
    cell.old = false;
    cell.kind = 'exit';
    this.exits.push({ id: id, name: name, c: c, r: r, color: color });
  };

  Builder.prototype.platform = function (c, r) {
    var k = key(c, r);
    var prev = this.cells[k];
    if (prev && walkKind(prev.kind)) throw new Error('平台压到道路 ' + k);
    this.cells[k] = { c: c, r: r, kind: 'platform' };
  };

  Builder.prototype.block = function (c, r, decor) {
    var k = key(c, r);
    var prev = this.cells[k];
    if (prev && walkKind(prev.kind)) throw new Error('障碍压到道路 ' + k + ' ' + decor);
    if (prev && prev.kind === 'platform') throw new Error('障碍压到平台 ' + k);
    this.cells[k] = { c: c, r: r, kind: 'obstacle', decor: decor || 'rack' };
  };

  Builder.prototype.rect = function (c0, r0, c1, r1, decor) {
    for (var c = c0; c <= c1; c++) for (var r = r0; r <= r1; r++) this.block(c, r, decor);
  };

  function costOf(cell, oldSet, slowMap) {
    if (!cell || !walkKind(cell.kind)) return Infinity;
    var c = (cell.old || (oldSet && oldSet.has(key(cell.c, cell.r)))) ? TD.OLD_COST : 1;
    if (slowMap && slowMap.has && slowMap.has(key(cell.c, cell.r))) c *= slowMap.get(key(cell.c, cell.r));
    return c;
  }
  TD.costOf = costOf;

  function blockedCell(cell, blocked) {
    if (!cell || !walkKind(cell.kind)) return true;
    if (blocked && blocked.has(key(cell.c, cell.r))) return true;
    return false;
  }

  function dijkstra(map, start, exitKeys, blocked, oldSet, slowMap) {
    if (!map.cells[start]) return null;
    var best = {};
    var prev = {};
    var q = [start];
    best[start] = 0;
    var exits = {};
    for (var i = 0; i < exitKeys.length; i++) exits[exitKeys[i]] = true;
    while (q.length) {
      var bi = 0;
      for (var j = 1; j < q.length; j++) if (best[q[j]] < best[q[bi]]) bi = j;
      var cur = q.splice(bi, 1)[0];
      if (exits[cur] && cur !== start) break;
      var parts = cur.split(',');
      var c = +parts[0], r = +parts[1];
      var nbs = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
      for (var n = 0; n < 4; n++) {
        var nk = nbs[n][0] + ',' + nbs[n][1];
        var cell = map.cells[nk];
        if (blockedCell(cell, blocked)) continue;
        var nc = best[cur] + costOf(cell, oldSet, slowMap);
        if (best[nk] === undefined || nc < best[nk] - 1e-9) {
          best[nk] = nc;
          prev[nk] = cur;
          q.push(nk);
        }
      }
    }
    var chosen = null, cc = Infinity;
    for (var e = 0; e < exitKeys.length; e++) {
      var ek = exitKeys[e];
      if (best[ek] !== undefined && best[ek] < cc) { cc = best[ek]; chosen = ek; }
    }
    if (!chosen) return null;
    var path = [chosen];
    var g = chosen;
    var guard = 0;
    while (g !== start && guard++ < 5000) {
      g = prev[g];
      if (!g) return null;
      path.push(g);
    }
    path.reverse();
    return { cost: cc, path: path, exitKey: chosen };
  }
  TD.dijkstra = dijkstra;

  function exitKeys(map) {
    return map.exits.map(function (e) { return key(e.c, e.r); });
  }

  function routesFrom(map, originKey, blocked, oldSet, slowMap) {
    return dijkstra(map, originKey, exitKeys(map), blocked, oldSet, slowMap);
  }
  TD.routesFrom = routesFrom;

  function allRoutes(map, blocked, oldSet, slowMap) {
    var o = {};
    for (var i = 0; i < map.entrances.length; i++) {
      var e = map.entrances[i];
      o[e.id] = dijkstra(map, key(e.c, e.r), exitKeys(map), blocked, oldSet, slowMap);
    }
    return o;
  }
  TD.allRoutes = allRoutes;

  function pathFar(oldPath, newPath) {
    var maxMin = 0;
    for (var i = 0; i < newPath.length; i++) {
      var a = newPath[i].split(',');
      var m = Infinity;
      for (var j = 0; j < oldPath.length; j++) {
        var b = oldPath[j].split(',');
        var d = Math.abs(+a[0] - +b[0]) + Math.abs(+a[1] - +b[1]);
        if (d < m) m = d;
      }
      if (m > maxMin) maxMin = m;
    }
    return maxMin;
  }

  function samePath(a, b) {
    if (!a || !b) return false;
    if (a.path.length !== b.path.length) return false;
    for (var i = 0; i < a.path.length; i++) if (a.path[i] !== b.path[i]) return false;
    return true;
  }

  TD.validateMap = function (map) {
    var errors = [];
    var base = allRoutes(map, null, null);
    map.entrances.forEach(function (e) {
      if (!base[e.id]) errors.push(map.id + ' 入口 ' + e.id + ' 在全开时无路');
    });
    var multi = 0;
    map.nodes.forEach(function (node) {
      var blk = new Set([key(node.c, node.r)]);
      var alt = allRoutes(map, blk, null);
      var changed = 0;
      map.entrances.forEach(function (e) {
        if (!alt[e.id]) {
          errors.push(map.id + ' 隔离 ' + node.id + ' 后入口 ' + e.id + ' 被封死');
          return;
        }
        if (!samePath(base[e.id], alt[e.id])) {
          var far = pathFar(base[e.id].path, alt[e.id].path);
          if (far < 3) errors.push(map.id + ' 隔离 ' + node.id + ' 对入口 ' + e.id + ' 只是近处绕行 far=' + far);
          changed++;
        }
      });
      if (changed < 1) errors.push(map.id + ' 隔离 ' + node.id + ' 没有改变任何入口路线');
      if (changed >= 2) multi++;
      Object.keys(map.cells).forEach(function (ck) {
        var cell = map.cells[ck];
        if (!walkKind(cell.kind)) return;
        if (blk.has(ck)) return;
        var rr = dijkstra(map, ck, exitKeys(map), blk, null);
        if (!rr) errors.push(map.id + ' 隔离 ' + node.id + ' 后格子 ' + ck + ' 无路');
      });
    });
    if (multi < 1) errors.push(map.id + ' 没有任何节点能同时改变多个入口');
    return { errors: errors, base: base };
  };

  function finish(b, meta) {
    var map = {
      id: meta.id,
      name: meta.name,
      subtitle: meta.subtitle,
      blurb: meta.blurb,
      waves: meta.waves,
      style: meta.style,
      theme: meta.theme,
      cols: b.cols,
      rows: b.rows,
      cells: b.cells,
      nodes: b.nodes,
      entrances: b.entrances,
      exits: b.exits,
      tips: meta.tips || []
    };
    return map;
  }

  function mapIntranet() {
    var b = new Builder(18, 18);
    /* 办公脊柱 A → 西边界 → 核心 */
    b.line(3, 1, 3, 10);
    b.line(3, 10, 3, 12);
    b.line(3, 12, 5, 12);
    b.line(5, 12, 5, 14);
    b.line(5, 14, 8, 14);
    b.line(8, 14, 8, 16);
    /* 业务脊柱 B */
    b.line(14, 1, 14, 10);
    b.line(14, 10, 14, 12);
    b.line(14, 12, 12, 12);
    b.line(12, 12, 12, 14);
    b.line(12, 14, 8, 14);
    /* DMZ 互联 */
    b.line(3, 4, 14, 4);
    /* 旧链路：办公与业务中段 */
    b.line(3, 7, 14, 7, 'old');
    /* 旧系统外环，接到灾备环起点，不把灾备环写成旧协议 */
    b.line(3, 2, 0, 2, 'old');
    b.line(0, 2, 0, 12, 'old');
    b.line(0, 12, 1, 12, 'old');
    b.line(14, 2, 17, 2, 'old');
    b.line(17, 2, 17, 12, 'old');
    b.line(17, 12, 16, 12, 'old');
    /* 灾备环，最后铺，保持常速 */
    b.line(5, 12, 1, 12);
    b.line(1, 12, 1, 16);
    b.line(1, 16, 8, 16);
    b.line(12, 12, 16, 12);
    b.line(16, 12, 16, 16);
    b.line(16, 16, 8, 16);

    b.node('dmzW', '西DMZ交换', 3, 4);
    b.node('dmzE', '东DMZ交换', 14, 4);
    b.node('west', '西边界节点', 3, 10);
    b.node('east', '东边界节点', 14, 10);
    b.node('core', '核心前节点', 8, 14);
    b.entrance('A', '门户网站', 3, 1, '#3ee0ff');
    b.entrance('B', '邮件网关', 14, 1, '#ff9a3c');
    b.exit('X', '核心数据库', 8, 16, '#7dffa1');

    /* 设备平台：贴着分段，不压道路 */
    [[5, 2], [5, 3], [5, 5], [5, 6], [5, 8], [5, 9], [6, 5], [6, 8], [6, 9],
     [4, 8], [4, 9], [2, 6], [2, 8], [12, 2], [12, 3], [12, 5], [12, 6], [12, 8], [12, 9],
     [13, 6], [13, 8], [10, 5], [10, 6], [10, 8], [10, 9], [8, 6], [8, 8], [8, 10], [8, 12],
     [6, 15], [4, 15], [10, 15], [12, 15], [7, 2], [9, 2], [7, 11], [9, 11], [2, 14], [15, 8]
    ].forEach(function (p) { b.platform(p[0], p[1]); });

    [[6, 1], [7, 1], [6, 0], [9, 0], [10, 1], [11, 1],
     [6, 10], [7, 10], [6, 11], [9, 10], [10, 10], [10, 11],
     [15, 5], [16, 5], [15, 6], [16, 6], [16, 8], [16, 9],
     [1, 4], [1, 5], [1, 8], [4, 6], [5, 11]
    ].forEach(function (p) { b.block(p[0], p[1], 'rack'); });

    return finish(b, {
      id: 'intranet',
      name: '分段内网',
      subtitle: '企业网 · 14 波',
      waves: 14,
      style: 'intranet',
      blurb: '门户与邮件网关分走办公、业务两段，经 DMZ 互联和旧链路相接。西边界一闸，门户流量就折进邮件一侧；核心前落闸，两侧灾备环才会吃到压力。',
      tips: ['隔离西边界会让门户改走 DMZ 互联', '核心前节点同时牵动两个入口', '旧链路更慢，但能让伪装流量显形'],
      theme: {
        fog: 0x07111a, sky: 0x8eb6ff, ground: 0x0a1018, sun: 0xd7e8ff,
        accent: 0x3ec8ff, bed: 0x071018, fogFar: 78
      }
    });
  }

  function mapBackbone() {
    var b = new Builder(20, 18);
    /* A 互联网：向东绕行再回到西列。走廊在第 16 行，绕行隔一行，避免贴邻抄近路。 */
    b.line(2, 16, 2, 14);
    b.line(2, 14, 6, 14);
    b.line(6, 14, 6, 12);
    b.line(6, 12, 2, 12);
    b.line(2, 12, 2, 0);
    /* 北侧骨干，连接两座数据中心 */
    b.line(2, 4, 16, 4);
    b.line(16, 4, 16, 0);
    /* 南侧走廊 */
    b.line(2, 16, 18, 16);
    /* C、B 汇聚后走旧专线上行 */
    b.line(14, 16, 14, 13);
    b.line(14, 13, 16, 13);
    b.line(16, 13, 16, 4);
    /* 旧专线段 */
    b.line(16, 6, 16, 10, 'old');

    b.node('nA', '接入交换', 2, 12);
    b.node('nTunnel', '专线隧道', 2, 7);
    b.node('nX', '西核交换', 2, 3);
    b.node('nConv', '汇聚节点', 14, 13);
    b.node('nOld', '旧专线节点', 16, 8);
    b.node('nY', '东核交换', 16, 3);
    b.entrance('A', '互联网', 2, 16, '#3ee0ff');
    b.entrance('C', '分支专线', 11, 16, '#d56bff');
    b.entrance('B', '云端互联', 18, 16, '#ff9a3c');
    b.exit('X', '数据中心 X', 2, 0, '#7dffa1');
    b.exit('Y', '数据中心 Y', 16, 0, '#ffe27a');

    for (var c = 0; c < 20; c++) {
      if (c === 2 || c === 16) continue;
      b.block(c, 7, 'flow');
      b.block(c, 8, 'flow');
    }
    [[4, 2], [6, 2], [8, 2], [10, 2], [12, 2], [14, 2],
     [4, 5], [6, 5], [8, 5], [10, 5], [12, 5], [14, 5], [18, 5],
     [4, 10], [6, 10], [8, 10], [10, 10], [12, 10], [14, 10], [18, 10],
     [8, 12], [10, 12], [12, 12], [8, 14], [10, 14], [7, 14], [18, 12], [18, 14], [4, 11],
     [0, 12], [0, 5], [7, 5], [11, 1]
    ].forEach(function (p) { b.platform(p[0], p[1]); });
    [[4, 6], [5, 6], [8, 6], [9, 6], [12, 6], [13, 6],
     [8, 9], [9, 9], [10, 9], [12, 9], [4, 9], [5, 9], [7, 11], [9, 11], [5, 3], [8, 3], [12, 3]
    ].forEach(function (p) { b.block(p[0], p[1], 'rack'); });

    return finish(b, {
      id: 'backbone',
      name: '骨干流域',
      subtitle: '跨网双活 · 15 波',
      waves: 15,
      style: 'backbone',
      blurb: '互联网走专线隧道奔向数据中心 X，分支与云端平时经旧专线汇入数据中心 Y。汇聚节点一断，两路都会被挤上隧道，和互联网的交战叠在一起。',
      tips: ['平时 C、B 走旧专线去 Y', '隔离汇聚节点会把 C、B 一起赶到 X', '公网流只有隧道和旧专线两处可过'],
      theme: {
        fog: 0x100818, sky: 0xb089ff, ground: 0x120814, sun: 0xe7d4ff,
        accent: 0xc084fc, bed: 0x0c0614, fogFar: 84
      }
    });
  }

  function mapIcs() {
    var b = new Builder(18, 18);
    /* 运维环：西通道、东通道、北路、南路 */
    b.line(3, 4, 3, 16);
    b.line(14, 4, 14, 16);
    b.line(3, 4, 14, 4);
    b.line(3, 13, 14, 13);
    /* 入口接入 */
    b.line(7, 1, 7, 4);
    b.line(1, 11, 3, 11);
    b.line(16, 3, 14, 3);
    /* 老工控：供应商绕到北侧；办公外侧慢支路 */
    b.line(16, 3, 16, 0, 'old');
    b.line(16, 0, 7, 0, 'old');
    b.line(7, 0, 7, 1, 'old');
    b.line(1, 11, 1, 4, 'old');
    b.line(1, 4, 3, 4, 'old');

    b.node('nN', '北运维节点', 5, 4);
    b.node('nW', '西通道节点', 3, 8);
    b.node('nSW', '西南运维节点', 3, 13);
    b.node('nE', '东通道节点', 14, 8);
    b.node('nSE', '东南运维节点', 14, 13);
    b.entrance('A', '运维跳板机', 7, 1, '#3ee0ff');
    b.entrance('B', '办公网下行', 1, 11, '#ff9a3c');
    b.entrance('C', '供应商远程维护', 16, 3, '#d56bff');
    b.exit('X', '过程控制核心', 3, 16, '#7dffa1');
    b.exit('Y', '安全联锁核心', 14, 16, '#ffe27a');

    b.rect(5, 6, 12, 11, 'gap');

    [[4, 5], [4, 6], [4, 7], [4, 9], [4, 10], [4, 12], [4, 14], [4, 15],
     [13, 5], [13, 6], [13, 7], [13, 9], [13, 10], [13, 12], [13, 14], [13, 15],
     [6, 3], [8, 3], [10, 3], [12, 3], [6, 14], [8, 14], [10, 14], [12, 14],
     [6, 2], [10, 2], [8, 15], [15, 6], [15, 10], [15, 14], [2, 6], [2, 15], [0, 8], [17, 8], [17, 12]
    ].forEach(function (p) { b.platform(p[0], p[1]); });

    [[6, 5], [8, 5], [10, 5], [12, 5], [6, 12], [8, 12], [10, 12],
     [2, 2], [4, 2], [15, 2], [2, 9], [15, 8]
    ].forEach(function (p) { b.block(p[0], p[1], 'rack'); });

    return finish(b, {
      id: 'ics',
      name: '气隙深层',
      subtitle: '工控网 · 16 波',
      waves: 16,
      style: 'ics',
      blurb: '中央气隙把运维环切成东西两条窄通道。跳板默认走西侧去过程控制核心，供应商走东侧去安全联锁。环上任何一个节点被隔离，流量就会整段换到另一侧，两个核心互相牵制。',
      tips: ['西通道承接着跳板和办公下行', '隔离东通道会把供应商赶到过程控制一侧', '老工控总线很慢，只在环被切断时才划算'],
      theme: {
        fog: 0x140e08, sky: 0xffc27a, ground: 0x1a1008, sun: 0xffe0b0,
        accent: 0xffb020, bed: 0x120c08, fogFar: 80
      }
    });
  }

  TD.MAPS = [mapIntranet(), mapBackbone(), mapIcs()];
  TD.mapById = function (id) {
    for (var i = 0; i < TD.MAPS.length; i++) if (TD.MAPS[i].id === id) return TD.MAPS[i];
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
