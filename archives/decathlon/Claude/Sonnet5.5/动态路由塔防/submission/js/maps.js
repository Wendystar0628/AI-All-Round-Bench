/* 地图与波次。字符：r 链路 o 旧链路 t 专线隧道 N 交换节点 P 设备平台 A/B/C 入口 1/2 出口
   X 数据设施 ~ 公网流 = 气隙 . 空白基板 */
(function (G) {
'use strict';
function g(type, count, ent, delay, gap, hpMul) { return { type: type, n: count, ent: ent, delay: delay || 0, gap: gap || 1.2, hpMul: hpMul || 1 }; }

G.MAPS = [];

// ======================= 地图 1：分段内网 =======================
G.MAPS.push({
  id: 'enterprise', index: 0, name: '分段内网', sub: '企业网 · 14 波', theme: 'enterprise',
  rows: [
    '..XXAXX...XXBXX..',
    '..XPrPXPPPXPrPX..',
    '.XXPrrrrrrrrrPXX.',
    'XXPPNPPPXPPPNPPXX',
    'X.XPrPXXXXXPrPX.X',
    '.XPPrPPPXPPPrPPX.',
    '.XXProoooooorPXX.',
    '.XPPrPPPXPPPrPPX.',
    'X.XPNPXXXXXPNPX.X',
    'XrrrrrrrrrrrrrrrX',
    'XrPPPXPPNPPXPPPrX',
    'XrPPXXPPrPPXXPPrX',
    'Xrrrrrrr1rrrrrrrX'
  ],
  entrances: { A: { name: '门户网站', color: '#5fd3c2' }, B: { name: '邮件网关', color: '#f2a65a' } },
  exits: { '1': { name: '核心数据库' } },
  flyTo: { A: '1', B: '1' },
  nodeNames: { '4,3': '西边界节点', '4,8': '办公网下行节点', '12,3': '东边界节点', '12,8': '业务网下行节点', '8,10': '核心前节点' },
  zones: [
    { name: '核心区', x0: 6, y0: 9, x1: 10, y1: 12, color: '#e8604f' },
    { name: '旧系统网段', x0: 0, y0: 9, x1: 5, y1: 12, color: '#c98a4a' },
    { name: '灾备环', x0: 11, y0: 9, x1: 16, y1: 12, color: '#58b890' },
    { name: 'DMZ 互联', x0: 5, y0: 2, x1: 11, y1: 2, color: '#e3b560' },
    { name: 'DMZ', x0: 3, y0: 0, x1: 13, y1: 3, color: '#e3b560' },
    { name: '旧链路段', x0: 5, y0: 6, x1: 11, y1: 6, color: '#b5762f' },
    { name: '办公网段', x0: 0, y0: 4, x1: 7, y1: 8, color: '#5fb5a0' },
    { name: '业务网段', x0: 9, y0: 4, x1: 16, y1: 8, color: '#a98fd0' }
  ],
  start: { c: 340, i: 90 },
  cam: { tx: 8, tz: 6.4, dist: 20.5, pitch: 58 },
  tips: ['隔离西边界节点：A 改走 DMZ 互联，与 B 汇流。', '隔离核心前节点：两股流量转向两侧外环，路程大增。', '旧链路会让木马显形并减速敌人。'],
  waves: [
    [g('worm', 6, 'A', 0, 1.3)],
    [g('worm', 5, 'A', 0, 1.2), g('worm', 5, 'B', 5, 1.2)],
    [g('worm', 6, 'A', 0, 1.1), g('trojan', 4, 'B', 3, 1.4)],
    [g('worm', 6, 'B', 0, 1.1), g('trojan', 3, 'A', 2, 1.4), g('hotspot', 2, 'B', 8, 2)],
    [g('flooder', 1, 'A', 0, 1), g('worm', 8, 'B', 2, 1)],
    [g('ransom', 2, 'A', 0, 2.4), g('worm', 6, 'B', 2, 1.1), g('trojan', 3, 'A', 6, 1.2)],
    [g('packer', 2, 'B', 0, 3), g('worm', 10, 'B', 1, 0.9), g('ransom', 1, 'A', 4, 2)],
    [g('hotspot', 3, 'A', 0, 1.6), g('hotspot', 3, 'B', 1, 1.6), g('worm', 8, 'A', 4, 0.9), g('flooder', 1, 'B', 6, 1)],
    [g('trojan', 5, 'A', 0, 1), g('trojan', 5, 'B', 0, 1), g('ransom', 3, 'A', 5, 2), g('packer', 1, 'B', 8, 1)],
    [g('flooder', 2, 'A', 0, 6), g('flooder', 1, 'B', 3, 1), g('worm', 10, 'B', 3, 0.8), g('packer', 2, 'A', 10, 2)],
    [g('ransom', 3, 'A', 0, 2), g('ransom', 3, 'B', 1, 2), g('trojan', 6, 'A', 6, 0.9), g('hotspot', 4, 'B', 8, 1.2)],
    [g('packer', 3, 'A', 0, 2.5), g('worm', 16, 'A', 1, 0.7), g('worm', 10, 'B', 3, 0.8), g('flooder', 2, 'B', 7, 5), g('hotspot', 3, 'A', 14, 1.4)],
    [g('flooder', 2, 'A', 0, 5), g('flooder', 2, 'B', 2, 5), g('ransom', 4, 'A', 4, 1.8), g('ransom', 3, 'B', 5, 1.8), g('packer', 3, 'B', 8, 2), g('trojan', 8, 'A', 10, 0.8)],
    [g('boss1', 1, 'A', 0, 1, 0.5), g('worm', 10, 'B', 6, 0.8), g('packer', 2, 'B', 12, 2), g('ransom', 3, 'A', 16, 2), g('hotspot', 4, 'B', 20, 1.2)]
  ],
  rushWave: -1, boss: 'boss1'
});

// ======================= 地图 2：骨干流域 =======================
G.MAPS.push({
  id: 'backbone', index: 1, name: '骨干流域', sub: '跨网专线 · 15 波', theme: 'backbone',
  rows: [
    '.APX.X.PPCPX.XPBPX.',
    'PrPX..X.PrP.X.PrP..',
    'PrPXX.XXPrPX.XPrPXX',
    'XrrrrrrrrrrrrrrrPXX',
    'XPPNPPXPPNPPXPPXX..',
    '~P~t~P~P~o~P~P~~~~~',
    '~~PtP~~~PoP~~~P~~~~',
    'XXPrPPPPPrPPPXPPXX.',
    'XXProoooorPPXPPX...',
    'XPPNPPPPPrrrPPPX...',
    'XPPrPPXXXPPNPPX....',
    '.XPrPPXXXXPrPPPX...',
    'XXX1XXXXXXX2XXXXXXX'
  ],
  entrances: { A: { name: '互联网', color: '#5fd3c2' }, C: { name: '分支专线', color: '#c4a0f0' }, B: { name: '云端互联', color: '#f2a65a' } },
  exits: { '1': { name: '数据中心 X' }, '2': { name: '数据中心 Y' } },
  flyTo: { A: '1', C: '2', B: '2' },
  nodeNames: { '3,4': '专线隧道节点', '9,4': '汇聚节点', '3,9': '机房 X 接入节点', '11,10': '机房 Y 接入节点' },
  zones: [
    { name: '专线隧道', x0: 2, y0: 4, x1: 4, y1: 7, color: '#7fb8c8' },
    { name: '旧专线', x0: 8, y0: 4, x1: 10, y1: 7, color: '#b5762f' },
    { name: '双活互联', x0: 4, y0: 8, x1: 8, y1: 8, color: '#b5762f' },
    { name: '机房 X', x0: 0, y0: 8, x1: 8, y1: 12, color: '#6fb0d0' },
    { name: '机房 Y', x0: 9, y0: 8, x1: 18, y1: 12, color: '#f080a0' },
    { name: '公网流', x0: 0, y0: 5, x1: 18, y1: 6, color: '#36c9b9' },
    { name: '互联网接入区', x0: 0, y0: 0, x1: 7, y1: 4, color: '#5fd3c2' },
    { name: '专线汇聚区', x0: 8, y0: 0, x1: 11, y1: 4, color: '#c4a0f0' },
    { name: '云端互联区', x0: 12, y0: 0, x1: 18, y1: 4, color: '#f2a65a' }
  ],
  start: { c: 380, i: 100 }, income: 3.0,
  cam: { tx: 9, tz: 6.2, dist: 22, pitch: 58 },
  tips: ['C、B 平时经旧专线汇流到机房 Y；隔离汇聚节点会把它们导向机房 X。', '隔离专线隧道节点：互联网 A 被迫走旧专线。', '两个跨越点不能同时隔离——封死的操作会被拒绝。'],
  waves: [
    [g('worm', 6, 'A', 0, 1.3)],
    [g('worm', 5, 'C', 0, 1.2), g('worm', 5, 'B', 4, 1.2)],
    [g('worm', 5, 'A', 0, 1.1), g('trojan', 4, 'C', 3, 1.4), g('worm', 4, 'B', 6, 1.2)],
    [g('hotspot', 3, 'A', 0, 1.6), g('worm', 6, 'B', 2, 1.1), g('trojan', 3, 'C', 4, 1.3)],
    [g('flooder', 1, 'A', 0, 1), g('worm', 8, 'C', 2, 1), g('worm', 6, 'B', 4, 1)],
    [g('ransom', 2, 'A', 0, 2.4), g('worm', 6, 'C', 2, 1), g('trojan', 4, 'B', 4, 1.2)],
    [g('packer', 2, 'C', 0, 3), g('worm', 10, 'C', 1, 0.9), g('ransom', 2, 'B', 4, 2), g('hotspot', 2, 'A', 6, 1.5)],
    [g('flooder', 1, 'B', 0, 1), g('flooder', 1, 'A', 3, 1), g('worm', 10, 'C', 4, 0.8), g('hotspot', 3, 'B', 8, 1.4)],
    [g('trojan', 6, 'A', 0, 0.9), g('trojan', 6, 'B', 0, 0.9), g('ransom', 3, 'C', 4, 2), g('packer', 2, 'A', 8, 2)],
    [g('flooder', 2, 'C', 0, 5), g('packer', 2, 'B', 2, 2), g('worm', 14, 'B', 3, 0.7), g('ransom', 3, 'A', 7, 2), g('hotspot', 4, 'C', 10, 1.2)],
    // 第 11 波：洪峰 — 三个入口同时大量出兵
    [g('worm', 22, 'A', 0, 0.45), g('worm', 20, 'C', 0, 0.5), g('worm', 20, 'B', 0, 0.5), g('packer', 2, 'A', 4, 2), g('packer', 2, 'B', 5, 2), g('flooder', 1, 'C', 6, 1), g('ransom', 2, 'C', 10, 2), g('hotspot', 4, 'A', 12, 1)],
    [g('ransom', 4, 'A', 0, 1.8), g('ransom', 3, 'B', 1, 1.8), g('trojan', 8, 'C', 3, 0.8), g('flooder', 2, 'B', 7, 5), g('packer', 3, 'C', 9, 2)],
    [g('hotspot', 5, 'A', 0, 1), g('hotspot', 4, 'B', 1, 1), g('flooder', 2, 'C', 4, 5), g('worm', 14, 'A', 5, 0.7), g('packer', 3, 'B', 8, 2), g('ransom', 3, 'C', 12, 1.8)],
    [g('flooder', 2, 'A', 0, 4), g('flooder', 2, 'B', 1, 4), g('flooder', 1, 'C', 3, 1), g('ransom', 4, 'C', 6, 1.6), g('packer', 3, 'A', 8, 2), g('trojan', 10, 'B', 10, 0.7), g('hotspot', 5, 'A', 14, 1)],
    [g('boss2', 1, 'C', 0, 1, 0.42), g('worm', 10, 'A', 6, 0.8), g('ransom', 3, 'B', 10, 2), g('packer', 3, 'A', 14, 2), g('hotspot', 5, 'B', 18, 1.1), g('trojan', 8, 'C', 22, 0.8)]
  ],
  rushWave: 10, boss: 'boss2'
});

// ======================= 地图 3：气隙深层 =======================
G.MAPS.push({
  id: 'airgap', index: 2, name: '气隙深层', sub: '工控网 · 16 波', theme: 'airgap',
  rows: [
    'XXX.XX..A..XX.XX.XX',
    'XX..P..PrPX..P...XX',
    'XX.PXPPPrPPPXP.XX..',
    'XXPPPPrNrrrrrPPPXX.',
    'X.PXXPr=====rrrrrrB',
    '.XPPXPN=P=P=rPPoPX.',
    '.XXPPPr=====NPXoPX.',
    'Crrrrrr=P=P=rPPoPX.',
    '.XPoPPN=====rPXoPX.',
    '.XPoPPrrrrrrrPPoPX.',
    'XXPoPPNPPXPPNPPoPXX',
    'XXPooorPPXPProooPXX',
    'XXXXXX1XXXXX2XXXXXX'
  ],
  entrances: { A: { name: '运维跳板机', color: '#5fd3c2' }, C: { name: '供应商远程维护', color: '#c4a0f0' }, B: { name: '办公网下行', color: '#f2a65a' } },
  exits: { '1': { name: '过程控制核心' }, '2': { name: '安全联锁核心' } },
  flyTo: { A: '1', C: '1', B: '2' },
  nodeNames: { '7,3': '北环西节点', '6,5': '西环上节点', '6,8': '西环下节点', '6,10': '过程控制接入节点', '12,6': '东环节点', '12,10': '安全联锁接入节点' },
  zones: [
    { name: '过程控制区', x0: 4, y0: 10, x1: 8, y1: 12, color: '#ffb04a' },
    { name: '安全联锁区', x0: 10, y0: 10, x1: 14, y1: 12, color: '#ff6a8a' },
    { name: '西老总线', x0: 0, y0: 8, x1: 5, y1: 11, color: '#b5762f' },
    { name: '东老总线', x0: 13, y0: 5, x1: 18, y1: 11, color: '#b5762f' },
    { name: '中央气隙', x0: 7, y0: 4, x1: 11, y1: 8, color: '#9f8cd8' },
    { name: '运维环', x0: 6, y0: 3, x1: 12, y1: 9, color: '#ff9a3c' },
    { name: '供应商接入', x0: 0, y0: 6, x1: 5, y1: 7, color: '#c4a0f0' },
    { name: '办公网下行', x0: 13, y0: 3, x1: 18, y1: 4, color: '#f2a65a' },
    { name: '运维跳板区', x0: 0, y0: 0, x1: 12, y1: 2, color: '#5fd3c2' }
  ],
  start: { c: 380, i: 100 }, income: 3.1,
  cam: { tx: 9, tz: 6.2, dist: 22, pitch: 58 },
  tips: ['隔离运维环上的不同节点，把入侵流量在东西两条窄通道间转移。', '西环下节点同时影响 A 与 C：A 转向东环，C 改走较慢的老工控总线。', '两个核心靠同一圈运维环相连，保护一边就会压力另一边。'],
  waves: [
    [g('worm', 6, 'A', 0, 1.3)],
    [g('worm', 5, 'C', 0, 1.2), g('worm', 5, 'B', 4, 1.2)],
    [g('worm', 5, 'A', 0, 1.1), g('trojan', 4, 'B', 3, 1.4), g('worm', 4, 'C', 6, 1.2)],
    [g('hotspot', 3, 'C', 0, 1.6), g('worm', 6, 'A', 2, 1.1), g('trojan', 3, 'B', 4, 1.3)],
    [g('flooder', 1, 'C', 0, 1), g('worm', 8, 'B', 2, 1), g('worm', 6, 'A', 4, 1)],
    [g('ransom', 2, 'B', 0, 2.4), g('worm', 6, 'A', 2, 1), g('trojan', 4, 'C', 4, 1.2)],
    [g('packer', 2, 'A', 0, 3), g('worm', 10, 'B', 1, 0.9), g('ransom', 2, 'C', 4, 2), g('hotspot', 2, 'B', 6, 1.5)],
    [g('flooder', 1, 'A', 0, 1), g('flooder', 1, 'B', 3, 1), g('worm', 10, 'C', 4, 0.8), g('hotspot', 3, 'A', 8, 1.4)],
    [g('trojan', 6, 'A', 0, 0.9), g('trojan', 6, 'C', 0, 0.9), g('ransom', 3, 'B', 4, 2), g('packer', 2, 'C', 8, 2)],
    [g('flooder', 2, 'B', 0, 5), g('packer', 2, 'A', 2, 2), g('worm', 14, 'C', 3, 0.7), g('ransom', 3, 'A', 7, 2), g('hotspot', 4, 'B', 10, 1.2)],
    [g('ransom', 4, 'C', 0, 1.8), g('ransom', 3, 'A', 1, 1.8), g('trojan', 8, 'B', 3, 0.8), g('flooder', 2, 'A', 7, 5), g('packer', 3, 'B', 9, 2)],
    [g('hotspot', 5, 'B', 0, 1), g('hotspot', 4, 'C', 1, 1), g('flooder', 2, 'A', 4, 5), g('worm', 14, 'C', 5, 0.7), g('packer', 3, 'A', 8, 2), g('ransom', 3, 'B', 12, 1.8)],
    // 第 13 波：洪峰
    [g('worm', 24, 'A', 0, 0.42), g('worm', 20, 'C', 0, 0.5), g('worm', 22, 'B', 0, 0.45), g('packer', 3, 'A', 4, 2), g('packer', 2, 'B', 5, 2), g('flooder', 2, 'C', 6, 2), g('ransom', 3, 'B', 10, 2), g('hotspot', 5, 'A', 12, 1)],
    [g('flooder', 2, 'A', 0, 4), g('flooder', 2, 'C', 1, 4), g('flooder', 1, 'B', 3, 1), g('ransom', 4, 'B', 6, 1.6), g('packer', 3, 'C', 8, 2), g('trojan', 10, 'A', 10, 0.7), g('hotspot', 5, 'C', 14, 1)],
    [g('ransom', 4, 'A', 0, 1.5), g('ransom', 4, 'C', 1, 1.5), g('flooder', 2, 'B', 4, 4), g('packer', 4, 'A', 8, 1.8), g('trojan', 10, 'B', 10, 0.6), g('hotspot', 6, 'C', 14, 0.9), g('worm', 16, 'C', 18, 0.6)],
    [g('boss3', 1, 'A', 0, 1, 0.4), g('worm', 10, 'C', 6, 0.8), g('ransom', 3, 'B', 10, 2), g('packer', 3, 'C', 14, 2), g('hotspot', 5, 'B', 18, 1.1), g('flooder', 2, 'B', 22, 4)]
  ],
  rushWave: 12, boss: 'boss3'
});

G.hpScale = function (map, n) { return 1 + 0.09 * (n - 1) + map.index * 0.012 * n; };
})(window.G = window.G || {});
