/* =========================================================================
 *  动态路由塔防 · 静态数据
 *  data.js — 地图拓扑 / 波次 / 塔 / 敌人 / 道具 / 图鉴文本
 * ========================================================================= */
(function (global) {
  'use strict';
  const RT = (global.RT = global.RT || {});

  /* ===================== 地图 =====================
   * 顶点 kind: entry 入口 / exit 中枢 / switch 交换节点 / junction 汇聚器
   * 边   kind: normal 常规链路 / old 旧链路
   * 边   tier: 0 地面层 / 1 架高层 / 2 旧协议高层
   * 边   w   : 路由代价系数（越大越不优先）
   * ================================================= */
  const MAPS = [
    /* ---------------------------------------------------------- 分段内网 */
    {
      id: 'm1',
      name: '分段内网',
      sector: '企业内网 · 汐域内环',
      desc: '办公网段、业务网段与旧系统网段被 DMZ 隔开。入口 A 门户网站与 B 邮件网关的正常流量必须持续抵达南端的核心数据库。',
      brief: '14 波 · 单出口',
      cols: 19, rows: 14,
      theme: {
        bg0: '#04070f', bg1: '#0b1a2e', horizon: '#123252',
        ground: '#0a1526', groundEdge: '#1d3d63',
        road: '#2f6fa8', roadGlow: '#57c8ff', old: '#c9873a',
        accent: '#57c8ff', hostile: '#ff4d6d', warn: '#ffb648', good: '#52e5a8'
      },
      vertices: [
        { id: 'A', kind: 'entry', x: 1, y: 2, name: '门户网站', color: '#ff4d6d', h: 0.4 },
        { id: 'B', kind: 'entry', x: 1, y: 11, name: '邮件网关', color: '#ffb648', h: 0.4 },
        { id: 'W', kind: 'switch', x: 4, y: 2, name: '西边界节点' },
        { id: 'D', kind: 'switch', x: 8, y: 2, name: 'DMZ 互联' },
        { id: 'M', kind: 'switch', x: 8, y: 11, name: '办公汇聚' },
        { id: 'L', kind: 'junction', x: 4, y: 7, name: '旧系统汇聚器' },
        { id: 'R', kind: 'switch', x: 14, y: 2, name: '灾备环北口' },
        { id: 'N', kind: 'switch', x: 14, y: 7, name: '核心前枢纽' },
        { id: 'CORE', kind: 'exit', x: 17, y: 12, name: '核心数据库', h: 0.4 }
      ],
      edges: [
        { a: 'A', b: 'W', kind: 'normal', tier: 0, w: 0.97, path: [[1, 2], [2, 2], [3, 2], [4, 2]] },
        { a: 'A', b: 'D', kind: 'normal', tier: 0, w: 1.05, path: [[1, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [8, 2]] },
        { a: 'W', b: 'D', kind: 'normal', tier: 0, w: 0.97, path: [[4, 2], [5, 2], [6, 2], [7, 2], [8, 2]] },
        { a: 'D', b: 'R', kind: 'normal', tier: 1, w: 0.97, path: [[8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2]] },
        { a: 'D', b: 'N', kind: 'normal', tier: 0, w: 1.06, path: [[8, 2], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [14, 4], [14, 5], [14, 6], [14, 7]] },
        { a: 'R', b: 'N', kind: 'normal', tier: 1, w: 1.02, path: [[14, 2], [14, 3], [14, 4], [14, 5], [14, 6], [14, 7]] },
        { a: 'N', b: 'CORE', kind: 'normal', tier: 1, w: 0.97, path: [[14, 7], [15, 7], [16, 7], [17, 7], [17, 8], [17, 9], [17, 10], [17, 11], [17, 12]] },
        { a: 'R', b: 'CORE', kind: 'normal', tier: 0, w: 1.08, path: [[14, 2], [15, 2], [16, 2], [16, 3], [16, 4], [16, 5], [16, 6], [16, 7], [16, 8], [16, 9], [16, 10], [16, 11], [16, 12], [17, 12]] },
        { a: 'B', b: 'M', kind: 'normal', tier: 0, w: 0.97, path: [[1, 11], [2, 11], [3, 11], [4, 11], [5, 11], [6, 11], [7, 11], [8, 11]] },
        { a: 'M', b: 'D', kind: 'normal', tier: 0, w: 1.0, path: [[8, 11], [8, 10], [8, 9], [8, 8], [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [8, 2]] },
        { a: 'B', b: 'L', kind: 'old', tier: 2, w: 1.0, path: [[1, 11], [1, 10], [1, 9], [2, 9], [3, 9], [3, 8], [4, 8], [4, 7]] },
        { a: 'M', b: 'L', kind: 'old', tier: 2, w: 1.0, path: [[8, 11], [8, 10], [8, 9], [8, 8], [7, 8], [6, 8], [5, 8], [4, 8], [4, 7]] },
        { a: 'L', b: 'D', kind: 'old', tier: 2, w: 1.0, path: [[4, 7], [4, 6], [4, 5], [5, 5], [6, 5], [7, 5], [7, 4], [8, 4], [8, 3], [8, 2]] },
        { a: 'L', b: 'CORE', kind: 'normal', tier: 0, w: 1.6, path: [[4, 7], [4, 8], [4, 9], [4, 10], [4, 11], [4, 12], [5, 12], [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12], [12, 12], [13, 12], [14, 12], [15, 12], [16, 12], [17, 12]] },
        { a: 'W', b: 'L', kind: 'normal', tier: 0, w: 1.0, path: [[4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7]] }
      ],
      entryPref: { A: ['CORE'], B: ['CORE'] },
      platforms: [
        { x: 3, y: 5, name: '运维工作台' }, { x: 6, y: 9, name: '灰度发布区' },
        { x: 10, y: 5, name: '业务加速台' }, { x: 13, y: 9, name: '数据库前置区' },
        { x: 15, y: 4, name: '灾备同步台' }, { x: 11, y: 9, name: '日志审计台' },
        { x: 6, y: 6, name: '旧系统中继' }, { x: 16, y: 6, name: '外环观察台' }
      ],
      obstacles: [
        { x: 2, y: 4, kind: 'data', name: '数据机房' }, { x: 2, y: 5, kind: 'data', name: '数据机房' },
        { x: 3, y: 4, kind: 'data', name: '数据机房' }, { x: 3, y: 5, kind: 'data', name: '数据机房' },
        { x: 11, y: 9, kind: 'data', name: '归档阵列' }, { x: 11, y: 10, kind: 'data', name: '归档阵列' },
        { x: 12, y: 9, kind: 'data', name: '归档阵列' }, { x: 12, y: 10, kind: 'data', name: '归档阵列' },
        { x: 15, y: 10, kind: 'data', name: '备份磁带库' }
      ],
      waves: [
        { note: '外联探测', groups: [{ e: 'A', t: 'worm', n: 4, gap: 1.0 }] },
        { note: '邮件通道', groups: [{ e: 'B', t: 'worm', n: 4, gap: 1.0 }] },
        { note: '双入口扫描', groups: [{ e: 'A', t: 'worm', n: 6, gap: 0.9 }, { e: 'B', t: 'worm', n: 3, gap: 1.1, d: 2 }] },
        { note: '洪泛试探', groups: [{ e: 'A', t: 'flood', n: 1, gap: 1 }, { e: 'B', t: 'worm', n: 4, gap: 1.0, d: 2 }] },
        { note: '伪装封装', groups: [{ e: 'A', t: 'trojan', n: 3, gap: 1.2 }, { e: 'B', t: 'worm', n: 5, gap: 0.9, d: 1 }] },
        { note: '木马加密', groups: [{ e: 'B', t: 'trojan', n: 2, gap: 1.2 }, { e: 'A', t: 'worm', n: 6, gap: 0.8 }] },
        { note: '勒索前哨', groups: [{ e: 'A', t: 'extorter', n: 2, gap: 1.4 }, { e: 'B', t: 'worm', n: 6, gap: 0.9 }] },
        { note: '加壳推进', groups: [{ e: 'A', t: 'shell', n: 1, gap: 1 }, { e: 'A', t: 'worm', n: 6, gap: 0.8, d: 1 }, { e: 'B', t: 'flood', n: 1, gap: 1, d: 3 }] },
        { note: '无线渗透', groups: [{ e: 'A', t: 'hotspot', n: 4, gap: 0.8 }, { e: 'B', t: 'trojan', n: 3, gap: 1.0, d: 1 }] },
        { note: '压制防线', groups: [{ e: 'A', t: 'extorter', n: 3, gap: 1.2 }, { e: 'B', t: 'flood', n: 2, gap: 1.2, d: 2 }] },
        { note: '密集穿越', groups: [{ e: 'A', t: 'worm', n: 8, gap: 0.7 }, { e: 'B', t: 'extorter', n: 3, gap: 1.2, d: 2 }] },
        { note: '混合攻势', groups: [{ e: 'A', t: 'shell', n: 2, gap: 1.2 }, { e: 'A', t: 'trojan', n: 4, gap: 1.0, d: 1 }, { e: 'B', t: 'flood', n: 3, gap: 1.0, d: 3 }] },
        { note: '空地协同', groups: [{ e: 'A', t: 'hotspot', n: 6, gap: 0.7 }, { e: 'B', t: 'extorter', n: 4, gap: 1.0 }, { e: 'A', t: 'worm', n: 8, gap: 0.7, d: 3 }] },
        { note: '蛰影 · 万傀', boss: 'wankui', groups: [{ e: 'A', t: 'worm', n: 8, gap: 0.8, d: 4 }, { e: 'B', t: 'worm', n: 6, gap: 0.9, d: 8 }] }
      ]
    },

    /* ---------------------------------------------------------- 骨干流域 */
    {
      id: 'm2',
      name: '骨干流域',
      sector: '跨网专线 · 双活数据中心',
      desc: '互联网、分支专线与云端互联在跨网汇聚点合流，再分配向互为备份的数据中心 X 与 Y。旧专线承担了大部分合流流量。',
      brief: '15 波 · 双出口 · 含洪峰波',
      cols: 19, rows: 14,
      theme: {
        bg0: '#05040d', bg1: '#161033', horizon: '#3a1f6e',
        ground: '#110c24', groundEdge: '#3b2a6b',
        road: '#6a52c8', roadGlow: '#9d7bff', old: '#e0a03c',
        accent: '#b78bff', hostile: '#ff5470', warn: '#ffc857', good: '#4fe3b0'
      },
      vertices: [
        { id: 'A', kind: 'entry', x: 1, y: 2, name: '互联网', color: '#4fd6ff', h: 0.4 },
        { id: 'B', kind: 'entry', x: 7, y: 1, name: '云端互联', color: '#c07bff', h: 0.4 },
        { id: 'C', kind: 'entry', x: 1, y: 12, name: '分支专线', color: '#ff9f43', h: 0.4 },
        { id: 'S1', kind: 'switch', x: 5, y: 2, name: '骨干北口' },
        { id: 'S2', kind: 'switch', x: 5, y: 11, name: '专线南口' },
        { id: 'S3', kind: 'switch', x: 9, y: 6, name: '跨网汇聚' },
        { id: 'S4', kind: 'switch', x: 13, y: 3, name: '北环闸口' },
        { id: 'S5', kind: 'switch', x: 13, y: 9, name: '南环闸口' },
        { id: 'S6', kind: 'switch', x: 9, y: 2, name: '云端接入' },
        { id: 'X', kind: 'exit', x: 16, y: 4, name: '数据中心 X', h: 0.4 },
        { id: 'Y', kind: 'exit', x: 16, y: 11, name: '数据中心 Y', h: 0.4 }
      ],
      edges: [
        { a: 'A', b: 'S1', kind: 'normal', tier: 0, w: 0.97, path: [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2]] },
        { a: 'A', b: 'S6', kind: 'normal', tier: 1, w: 1.02, path: [[1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [9, 2]] },
        { a: 'S1', b: 'S6', kind: 'normal', tier: 0, w: 1.0, path: [[5, 2], [6, 2], [7, 2], [8, 2], [9, 2]] },
        { a: 'S6', b: 'S3', kind: 'normal', tier: 1, w: 1.0, path: [[9, 2], [9, 3], [9, 4], [9, 5], [9, 6]] },
        { a: 'S1', b: 'S3', kind: 'normal', tier: 0, w: 1.12, path: [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6]] },
        { a: 'B', b: 'S1', kind: 'normal', tier: 1, w: 1.1, path: [[7, 1], [6, 1], [5, 1], [5, 2]] },
        { a: 'B', b: 'S3', kind: 'old', tier: 2, w: 1.0, path: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [8, 6], [9, 6]] },
        { a: 'C', b: 'S2', kind: 'normal', tier: 0, w: 0.97, path: [[1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [5, 11]] },
        { a: 'C', b: 'S3', kind: 'old', tier: 2, w: 1.0, path: [[1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8], [7, 7], [8, 7], [9, 7], [9, 6]] },
        { a: 'S2', b: 'S3', kind: 'old', tier: 2, w: 1.0, path: [[5, 11], [5, 10], [5, 9], [5, 8], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [9, 6]] },
        { a: 'S2', b: 'S5', kind: 'normal', tier: 0, w: 2.2, path: [[5, 11], [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11], [13, 11], [13, 10], [13, 9]] },
        { a: 'S3', b: 'S4', kind: 'normal', tier: 1, w: 0.97, path: [[9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [13, 5], [13, 4], [13, 3]] },
        { a: 'S3', b: 'S5', kind: 'normal', tier: 1, w: 1.0, path: [[9, 6], [9, 7], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [13, 9]] },
        { a: 'S4', b: 'X', kind: 'normal', tier: 0, w: 0.97, path: [[13, 3], [14, 3], [15, 3], [16, 3], [16, 4]] },
        { a: 'S5', b: 'Y', kind: 'normal', tier: 0, w: 0.97, path: [[13, 9], [14, 9], [15, 9], [16, 9], [16, 10], [16, 11]] },
        { a: 'S6', b: 'S4', kind: 'normal', tier: 1, w: 2.0, path: [[9, 2], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [13, 2], [13, 3]] }
      ],
      entryPref: { A: ['X'], B: ['X'], C: ['Y'] },
      platforms: [
        { x: 3, y: 4, name: '骨干接入台' }, { x: 3, y: 8, name: '专线接入台' },
        { x: 7, y: 3, name: '旧线中继' }, { x: 11, y: 3, name: '北向观察台' },
        { x: 11, y: 10, name: '南向观察台' }, { x: 15, y: 6, name: '双活仲裁台' },
        { x: 7, y: 9, name: '跨网缓存台' }, { x: 15, y: 12, name: '容灾演练台' }
      ],
      obstacles: [
        { x: 1, y: 8, kind: 'stream', name: '公网流' }, { x: 2, y: 8, kind: 'stream', name: '公网流' },
        { x: 3, y: 8, kind: 'stream', name: '公网流' }, { x: 4, y: 8, kind: 'stream', name: '公网流' },
        { x: 5, y: 8, kind: 'stream', name: '公网流' }, { x: 6, y: 8, kind: 'stream', name: '公网流' },
        { x: 7, y: 8, kind: 'stream', name: '公网流' }, { x: 8, y: 8, kind: 'stream', name: '公网流' },
        { x: 9, y: 8, kind: 'stream', name: '公网流' },
        { x: 15, y: 4, kind: 'data', name: '冷数据舱' }, { x: 15, y: 5, kind: 'data', name: '冷数据舱' },
        { x: 6, y: 4, kind: 'data', name: '认证集群' }, { x: 6, y: 5, kind: 'data', name: '认证集群' }
      ],
      waves: [
        { note: '公网扫描', groups: [{ e: 'A', t: 'worm', n: 5, gap: 0.9 }] },
        { note: '专线渗透', groups: [{ e: 'C', t: 'worm', n: 5, gap: 0.9 }] },
        { note: '云端接入', groups: [{ e: 'B', t: 'worm', n: 5, gap: 0.9 }] },
        { note: '双线并行', groups: [{ e: 'A', t: 'worm', n: 6, gap: 0.8 }, { e: 'C', t: 'worm', n: 4, gap: 1.0, d: 2 }] },
        { note: '洪泛试探', groups: [{ e: 'A', t: 'flood', n: 2, gap: 1.1 }, { e: 'C', t: 'trojan', n: 2, gap: 1.2, d: 2 }] },
        { note: '云端木马', groups: [{ e: 'B', t: 'trojan', n: 3, gap: 1.1 }, { e: 'A', t: 'worm', n: 8, gap: 0.7 }] },
        { note: '空口突袭', groups: [{ e: 'C', t: 'extorter', n: 2, gap: 1.3 }, { e: 'A', t: 'hotspot', n: 3, gap: 0.9, d: 2 }] },
        { note: '加壳护流', groups: [{ e: 'A', t: 'shell', n: 2, gap: 1.1 }, { e: 'A', t: 'worm', n: 6, gap: 0.8, d: 1 }, { e: 'C', t: 'flood', n: 2, gap: 1.1, d: 3 }] },
        { note: '勒索压制', groups: [{ e: 'B', t: 'extorter', n: 3, gap: 1.1 }, { e: 'C', t: 'worm', n: 8, gap: 0.7 }] },
        { note: '洪峰 · 三线并发', flood: true, groups: [{ e: 'A', t: 'worm', n: 10, gap: 0.45 }, { e: 'C', t: 'worm', n: 10, gap: 0.45 }, { e: 'B', t: 'worm', n: 8, gap: 0.5 }] },
        { note: '木马与壳', groups: [{ e: 'A', t: 'trojan', n: 4, gap: 1.0 }, { e: 'B', t: 'shell', n: 2, gap: 1.1, d: 1 }, { e: 'C', t: 'flood', n: 3, gap: 1.0, d: 3 }] },
        { note: '空地协同', groups: [{ e: 'A', t: 'extorter', n: 4, gap: 1.0 }, { e: 'B', t: 'hotspot', n: 5, gap: 0.8 }, { e: 'C', t: 'worm', n: 10, gap: 0.6 }] },
        { note: '全线压力', groups: [{ e: 'A', t: 'flood', n: 4, gap: 1.0 }, { e: 'A', t: 'trojan', n: 4, gap: 0.9, d: 2 }, { e: 'B', t: 'extorter', n: 4, gap: 1.0 }, { e: 'C', t: 'shell', n: 2, gap: 1.1, d: 3 }] },
        { note: '总攻前夜', groups: [{ e: 'A', t: 'hotspot', n: 6, gap: 0.7 }, { e: 'B', t: 'worm', n: 9, gap: 0.6 }, { e: 'C', t: 'extorter', n: 4, gap: 0.9, d: 2 }] },
        { note: '蛰影 · 蜃楼', boss: 'shanlou', groups: [{ e: 'C', t: 'worm', n: 8, gap: 0.8, d: 3 }, { e: 'B', t: 'extorter', n: 3, gap: 1.0, d: 6 }] }
      ]
    },

    /* ---------------------------------------------------------- 气隙深层 */
    {
      id: 'm3',
      name: '气隙深层',
      sector: '工控网络 · 过程控制层',
      desc: '运维跳板机、办公网下行与供应商远程维护围绕中央气隙接入。过程控制核心与安全联锁核心互为备份，却共用同一段运维环。',
      brief: '16 波 · 双核心 · 含洪峰波',
      cols: 19, rows: 14,
      theme: {
        bg0: '#07060a', bg1: '#1b1410', horizon: '#4a2b12',
        ground: '#14100c', groundEdge: '#4a3520',
        road: '#a8733c', roadGlow: '#ffb257', old: '#d8c05a',
        accent: '#ffb257', hostile: '#ff4a3d', warn: '#ffe08a', good: '#7ce8a8'
      },
      vertices: [
        { id: 'A', kind: 'entry', x: 1, y: 2, name: '运维跳板机', color: '#ff8a3d', h: 0.4 },
        { id: 'B', kind: 'entry', x: 1, y: 7, name: '办公网下行', color: '#ffd166', h: 0.4 },
        { id: 'C', kind: 'entry', x: 1, y: 12, name: '供应商远程维护', color: '#ff5470', h: 0.4 },
        { id: 'O1', kind: 'switch', x: 5, y: 2, name: '运维北口' },
        { id: 'O2', kind: 'switch', x: 9, y: 2, name: '北环枢纽' },
        { id: 'O3', kind: 'switch', x: 13, y: 4, name: '东环北口' },
        { id: 'O4', kind: 'switch', x: 13, y: 9, name: '东环南口' },
        { id: 'O5', kind: 'switch', x: 5, y: 12, name: '运维南口' },
        { id: 'O6', kind: 'switch', x: 5, y: 7, name: '旧总线口' },
        { id: 'X', kind: 'exit', x: 16, y: 4, name: '过程控制核心', h: 0.4 },
        { id: 'Y', kind: 'exit', x: 16, y: 11, name: '安全联锁核心', h: 0.4 }
      ],
      edges: [
        { a: 'A', b: 'O1', kind: 'normal', tier: 0, w: 0.97, path: [[1, 2], [2, 2], [3, 2], [4, 2], [5, 2]] },
        { a: 'A', b: 'O2', kind: 'normal', tier: 1, w: 1.03, path: [[1, 2], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [9, 2]] },
        { a: 'O1', b: 'O2', kind: 'normal', tier: 0, w: 1.0, path: [[5, 2], [6, 2], [7, 2], [8, 2], [9, 2]] },
        { a: 'O2', b: 'O3', kind: 'normal', tier: 0, w: 0.97, path: [[9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [13, 3], [13, 4]] },
        { a: 'O2', b: 'O4', kind: 'normal', tier: 1, w: 1.0, path: [[9, 2], [9, 3], [9, 4], [9, 5], [9, 6], [9, 7], [9, 8], [9, 9], [10, 9], [11, 9], [12, 9], [13, 9]] },
        { a: 'O3', b: 'O4', kind: 'normal', tier: 0, w: 1.0, path: [[13, 4], [13, 5], [13, 6], [13, 7], [13, 8], [13, 9]] },
        { a: 'O3', b: 'X', kind: 'normal', tier: 0, w: 0.97, path: [[13, 4], [14, 4], [15, 4], [16, 4]] },
        { a: 'O4', b: 'Y', kind: 'normal', tier: 0, w: 0.97, path: [[13, 9], [14, 9], [15, 9], [16, 9], [16, 10], [16, 11]] },
        { a: 'O4', b: 'O5', kind: 'normal', tier: 0, w: 1.0, path: [[13, 9], [13, 10], [13, 11], [12, 11], [11, 11], [10, 11], [9, 11], [8, 11], [7, 11], [6, 11], [5, 11], [5, 12]] },
        { a: 'C', b: 'O5', kind: 'normal', tier: 0, w: 0.97, path: [[1, 12], [2, 12], [3, 12], [4, 12], [5, 12]] },
        { a: 'C', b: 'O6', kind: 'old', tier: 2, w: 1.0, path: [[1, 12], [1, 11], [2, 11], [3, 11], [4, 11], [5, 11], [5, 10], [5, 9], [5, 8], [5, 7]] },
        { a: 'B', b: 'O6', kind: 'old', tier: 2, w: 1.0, path: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]] },
        { a: 'B', b: 'O2', kind: 'normal', tier: 1, w: 1.0, path: [[1, 7], [1, 6], [1, 5], [1, 4], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [9, 2]] },
        { a: 'O1', b: 'O6', kind: 'old', tier: 2, w: 1.0, path: [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7]] },
        { a: 'O6', b: 'O5', kind: 'old', tier: 2, w: 1.0, path: [[5, 7], [5, 8], [5, 9], [5, 10], [5, 11], [5, 12]] }
      ],
      entryPref: { A: ['X'], B: ['Y'], C: ['Y'] },
      platforms: [
        { x: 3, y: 4, name: '跳板中继台' }, { x: 3, y: 9, name: '办公接入台' },
        { x: 7, y: 4, name: '工控观测台' }, { x: 11, y: 4, name: '联锁前置台' },
        { x: 15, y: 7, name: '过程控制台' }, { x: 11, y: 9, name: '东环维修台' },
        { x: 7, y: 9, name: '总线监测台' }, { x: 15, y: 2, name: '北侧巡检台' }
      ],
      obstacles: [
        { x: 7, y: 5, kind: 'airgap', name: '气隙' }, { x: 8, y: 5, kind: 'airgap', name: '气隙' },
        { x: 9, y: 5, kind: 'airgap', name: '气隙' }, { x: 10, y: 5, kind: 'airgap', name: '气隙' },
        { x: 11, y: 5, kind: 'airgap', name: '气隙' },
        { x: 7, y: 6, kind: 'airgap', name: '气隙' }, { x: 8, y: 6, kind: 'airgap', name: '气隙' },
        { x: 9, y: 6, kind: 'airgap', name: '气隙' }, { x: 10, y: 6, kind: 'airgap', name: '气隙' },
        { x: 11, y: 6, kind: 'airgap', name: '气隙' },
        { x: 7, y: 7, kind: 'airgap', name: '气隙' }, { x: 8, y: 7, kind: 'airgap', name: '气隙' },
        { x: 9, y: 7, kind: 'airgap', name: '气隙' }, { x: 10, y: 7, kind: 'airgap', name: '气隙' },
        { x: 11, y: 7, kind: 'airgap', name: '气隙' },
        { x: 7, y: 8, kind: 'airgap', name: '气隙' }, { x: 8, y: 8, kind: 'airgap', name: '气隙' },
        { x: 9, y: 8, kind: 'airgap', name: '气隙' }, { x: 10, y: 8, kind: 'airgap', name: '气隙' },
        { x: 11, y: 8, kind: 'airgap', name: '气隙' },
        { x: 3, y: 2, kind: 'data', name: '工控机柜' }, { x: 3, y: 3, kind: 'data', name: '工控机柜' },
        { x: 12, y: 2, kind: 'data', name: ' Historian' }, { x: 12, y: 3, kind: 'data', name: ' Historian' }
      ],
      waves: [
        { note: '跳板探测', groups: [{ e: 'A', t: 'worm', n: 4, gap: 1.0 }] },
        { note: '下行渗入', groups: [{ e: 'B', t: 'worm', n: 4, gap: 1.0 }] },
        { note: '供应商接入', groups: [{ e: 'C', t: 'worm', n: 4, gap: 1.0 }] },
        { note: '节点冲击', groups: [{ e: 'A', t: 'flood', n: 1, gap: 1 }, { e: 'C', t: 'worm', n: 5, gap: 0.9, d: 2 }] },
        { note: '伪装工控包', groups: [{ e: 'B', t: 'trojan', n: 2, gap: 1.2 }, { e: 'A', t: 'worm', n: 6, gap: 0.8 }] },
        { note: '勒索工控机', groups: [{ e: 'C', t: 'extorter', n: 2, gap: 1.3 }, { e: 'B', t: 'worm', n: 6, gap: 0.8 }] },
        { note: '无线渗入', groups: [{ e: 'A', t: 'hotspot', n: 3, gap: 0.9 }, { e: 'B', t: 'worm', n: 6, gap: 0.8, d: 1 }] },
        { note: '加壳推进', groups: [{ e: 'A', t: 'shell', n: 1, gap: 1 }, { e: 'C', t: 'flood', n: 2, gap: 1.1, d: 2 }, { e: 'B', t: 'worm', n: 8, gap: 0.7 }] },
        { note: '勒索压制', groups: [{ e: 'B', t: 'extorter', n: 3, gap: 1.0 }, { e: 'A', t: 'trojan', n: 3, gap: 1.0, d: 2 }] },
        { note: '总线冲击', groups: [{ e: 'C', t: 'worm', n: 10, gap: 0.6 }, { e: 'A', t: 'extorter', n: 3, gap: 1.0, d: 2 }] },
        { note: '洪峰 · 三线并发', flood: true, groups: [{ e: 'A', t: 'worm', n: 8, gap: 0.5 }, { e: 'B', t: 'worm', n: 8, gap: 0.5 }, { e: 'C', t: 'worm', n: 8, gap: 0.5 }, { e: 'C', t: 'flood', n: 2, gap: 1.2, d: 4 }] },
        { note: '木马与壳', groups: [{ e: 'A', t: 'trojan', n: 4, gap: 1.0 }, { e: 'B', t: 'shell', n: 2, gap: 1.1, d: 1 }, { e: 'C', t: 'extorter', n: 4, gap: 1.0, d: 2 }] },
        { note: '空地协同', groups: [{ e: 'A', t: 'hotspot', n: 5, gap: 0.8 }, { e: 'B', t: 'flood', n: 4, gap: 1.0 }, { e: 'C', t: 'worm', n: 10, gap: 0.6 }] },
        { note: '全线压迫', groups: [{ e: 'A', t: 'extorter', n: 5, gap: 0.9 }, { e: 'B', t: 'trojan', n: 4, gap: 1.0 }, { e: 'C', t: 'shell', n: 3, gap: 1.0, d: 2 }] },
        { note: '总攻前夜', groups: [{ e: 'A', t: 'worm', n: 9, gap: 0.6 }, { e: 'A', t: 'hotspot', n: 3, gap: 0.9, d: 2 }, { e: 'B', t: 'extorter', n: 4, gap: 0.9 }, { e: 'C', t: 'flood', n: 4, gap: 1.1, d: 3 }] },
        { note: '蛰影 · 现身', boss: 'zheyin', groups: [{ e: 'A', t: 'worm', n: 8, gap: 0.8, d: 3 }, { e: 'B', t: 'extorter', n: 3, gap: 1.0, d: 6 }, { e: 'C', t: 'trojan', n: 3, gap: 1.0, d: 9 }] }
      ]
    }
  ];

  /* ===================== 塔 ===================== */
  const TOWERS = {
    firewall: {
      name: '防火墙', short: '墙', cat: 'block', cost: 60, color: '#4aa8ff', hotkey: '1',
      place: 'link', // link | node
      desc: '部署在链路上时，会拦住有限数量的地面敌人并持续还击；超过阻挡容量的敌人继续前进。部署在交换节点上会隔离该节点，并拦截相邻链路。',
      hp: [280, 400], block: [2, 3], dps: [28, 42], regen: 0,
      nodeBlock: [3, 4]
    },
    honeypot: {
      name: '蜜罐', short: '蜜', cat: 'lure', cost: 70, color: '#ffc44d', hotkey: '2',
      place: 'link',
      desc: '以伪造应答吸引附近会攻击塔的地面敌人，替其他设备承担伤害。耐久偏低，但不会被加密。主动技能“诱捕”可困住被诱来的敌人。',
      hp: [150, 210], attract: [5.0, 6.2], regen: 0,
      skill: { name: '诱捕', cost: 18, radius: 5.5, duration: 3.0, dmg: 45, cd: 16,
        desc: '释放伪响应陷阱，困住半径内所有被诱来的敌人 3 秒并造成 45 点伤害。' },
      branches: [
        { id: 'deep', name: '深巢陷阱', desc: '吸引半径与耐久提升，诱捕范围更大。', hp: 260, attract: 7.4, radius: 7.0 },
        { id: 'bait', name: '诱饵阵列', desc: '主动技能冷却减半，诱捕伤害提高。', hp: 190, radius: 6.5, dmg: 70, cdMul: 0.5 }
      ]
    },
    gateway: {
      name: '网闸', short: '闸', cat: 'block', cost: 45, color: '#52e5c8', hotkey: '3',
      place: 'node',
      desc: '低成本隔离交换节点，使这一格不能通行。耐久较高、不攻击，但会持续承受敌人的冲击。',
      hp: [440, 600], regen: 0
    },
    interceptor: {
      name: '拦截器', short: '拦', cat: 'ranged', cost: 95, color: '#ff7bd5', hotkey: '4',
      place: 'platform', oriented: true,
      desc: '在朝向决定的扇形区域内进行远程单体攻击，地面与飞行敌人都能打击。',
      hp: [210, 280], range: [8.5, 10.5], dmg: [36, 54], rate: [1.15, 1.4], arc: 110,
      branches: [
        { id: 'pierce', name: '贯穿射线', desc: '攻击变为穿透光束，命中射程内一条直线上的所有敌人。', dmg: 27, pierce: true },
        { id: 'suppress', name: '压制力场', desc: '命中后附加 45% 减速，并略微提高伤害。', dmg: 30, slow: 0.45 }
      ]
    },
    sandbox: {
      name: '沙箱', short: '沙', cat: 'ranged', cost: 100, color: '#a78bfa', hotkey: '5',
      place: 'platform',
      desc: '检测范围内伪装或潜伏的目标使其显形，并对地面敌人进行范围攻击，适合处理汇聚流量。',
      hp: [220, 290], range: [6.2, 7.4], dmg: [24, 34], rate: [0.85, 1.0], aoe: [3.4, 4.2],
      detect: [9.0, 11.0]
    },
    repair: {
      name: '修复进程', short: '修', cat: 'support', cost: 85, color: '#7ef0b4', hotkey: '6',
      place: 'platform',
      desc: '不攻击敌人，持续恢复范围内其他受损塔的生命。主动技能“冗余切换”为附近友塔提供护盾并解除加密。',
      hp: [250, 330], range: [6.2, 7.4], heal: [16, 23], regen: 0,
      skill: { name: '冗余切换', cost: 22, radius: 7.0, shield: 70, duration: 9, cd: 22,
        desc: '为半径内友塔附加护盾并立即解除加密，持续 9 秒。' }
    }
  };
  const TOWER_ORDER = ['firewall', 'honeypot', 'gateway', 'interceptor', 'sandbox', 'repair'];

  /* ===================== 敌人 ===================== */
  const ENEMIES = {
    worm: {
      name: '蠕虫', hp: 130, speed: 2.25, reward: 7, intel: 1, flying: false, blockCost: 1,
      dmg: 20, range: 1.8, atkRate: 1.0, radius: 0.55, color: '#ff5b52', desc: '蠕虫形态的自传播程序。被阻挡时会持续啃咬挡住它的设备；首次经过直通的交换节点时复制出同伴，复制出的不再复制。'
    },
    flood: {
      name: '洪泛团', hp: 340, speed: 1.45, reward: 16, intel: 3, flying: false, blockCost: 2,
      dmg: 62, range: 2.4, atkRate: 0.8, radius: 0.95, color: '#ff9f2e',
      desc: '占用较多阻挡容量的重型数据包群。会离开当前路线，去冲击附近被隔离节点一侧的设备与隔离器；打通后沿重新开放的道路前进。'
    },
    trojan: {
      name: '木马', hp: 95, speed: 2.6, reward: 11, intel: 3, flying: false, blockCost: 1,
      dmg: 16, range: 1.6, atkRate: 1.1, radius: 0.45, color: '#8bff6a', hidden: true,
      payload: { dmg: 55, radius: 3.4 },
      desc: '伪装成正常封装数据包，显形前不能被远程单体攻击主动选中。沙箱检测、旧链路与阻挡都会使其显形；未显形就被波及消灭时会释放载荷，伤害附近设备。'
    },
    extorter: {
      name: '勒索者', hp: 175, speed: 1.75, reward: 13, intel: 4, flying: false, blockCost: 1,
      dmg: 22, range: 7.0, atkRate: 0.9, radius: 0.6, color: '#c07bff', ranged: true, encrypt: 7,
      desc: '边移动边从远处攻击射程内的设备，包括平台上的塔，并施加加密。优先攻击射程内的蜜罐。被加密的塔会停止攻击、治疗与释放技能，但仍能阻挡与隔离。'
    },
    hotspot: {
      name: '伪热点', hp: 78, speed: 3.5, reward: 9, intel: 2, flying: true, blockCost: 0,
      dmg: 0, range: 0, atkRate: 0, radius: 0.5, color: '#eaf6ff',
      desc: '沿无线层从入口直飞出口，不受地面道路与阻挡影响，只能由拦截器一类的远程塔对付。'
    },
    shell: {
      name: '加壳器', hp: 280, speed: 1.55, reward: 14, intel: 4, flying: false, blockCost: 2,
      dmg: 22, range: 2.0, atkRate: 0.9, radius: 0.85, color: '#4fd6c8', shieldRadius: 4.6, shield: 70,
      desc: '为附近同伴提供可被打破的护盾，保护成群敌人推进。玩家需要决定先处理支援者，还是集中火力清除前排。'
    },
    wankui: {
      name: '万傀', hp: 2200, speed: 1.1, reward: 120, intel: 40, flying: false, blockCost: 4,
      dmg: 70, range: 3.2, atkRate: 0.8, radius: 2.1, color: '#ff2f6d', boss: true,
      desc: '僵尸网络群体控制的化身。“洪峰”会冲击被隔离节点，重创设备并冲毁隔离器；生命降低后释放成群蠕虫，压迫节点与阻挡塔。'
    },
    shanlou: {
      name: '蜃楼', hp: 2300, speed: 1.05, reward: 130, intel: 45, flying: false, blockCost: 4,
      dmg: 62, range: 7.5, atkRate: 0.85, radius: 2.0, color: '#ffe08a', boss: true,
      desc: '以路由欺骗为核心。“伪路由”会在前方链路制造临时路由黑洞，截断通行、迫使各入口改道；生命降低后发动“路由风暴”，削弱附近友塔的护盾。'
    },
    zheyin: {
      name: '蛰影', hp: 2500, speed: 1.0, reward: 150, intel: 55, flying: false, blockCost: 4,
      dmg: 78, range: 3.0, atkRate: 0.85, radius: 2.2, color: '#8b1f3a', boss: true,
      desc: '攻击组织的核心威胁，按“潜伏—提权—破坏”改变阶段：潜伏时需要检测才能被远程单体攻击选中；提权后强化护甲并放出木马；破坏阶段会锁死前方一段运维环，改变道路。'
    }
  };

  /* ===================== 道具 ===================== */
  const ITEMS = {
    isolator: {
      name: '应急隔离器', res: 'intel', cost: 25, cd: 20, hotkey: 'Q',
      desc: '临时隔离一个直通交换节点，有耐久和有效期，会被敌人冲毁，不产生情报。',
      detail: '投放后该节点 12 秒内不可通行，隔离器耐久 260，会被洪泛团一类重型单位冲毁。'
    },
    downgrade: {
      name: '协议降级', res: 'intel', cost: 20, cd: 16, hotkey: 'W',
      desc: '让一片链路暂时使用旧协议，产生旧链路的减速与显形效果，敌人的路线随通行速度变化重新选择。',
      detail: '覆盖半径 5.5 的链路，持续 14 秒。期间经过的木马会显形，地面敌人减速 35%。'
    },
    restore: {
      name: '备份还原', res: 'compute', cost: 35, cd: 12, hotkey: 'E',
      desc: '恢复一座塔的部分生命并解除加密。',
      detail: '立即恢复目标设备 55% 最大生命，并清除其加密状态。'
    }
  };

  /* ===================== 图鉴文本 ===================== */
  const CODEX = {
    devices: [
      { id: 'firewall', name: '防火墙', tag: '阻挡', text: TOWERS.firewall.desc, extra: '阻挡容量：2（2 级 3）。每个敌人按自身占用的容量计算，洪泛团与加壳器占 2 点。超出容量的敌人会继续前进，不会被卡住。被摧毁后该链路恢复直通。' },
      { id: 'honeypot', name: '蜜罐', tag: '诱敌阻挡', text: TOWERS.honeypot.desc, extra: '会被附近会攻击塔的地面敌人优先攻击；免疫加密。分支：深巢陷阱 / 诱饵阵列。' },
      { id: 'gateway', name: '网闸', tag: '隔离', text: TOWERS.gateway.desc, extra: '耐久高于防火墙，成本更低；不造成任何伤害。' },
      { id: 'interceptor', name: '拦截器', tag: '远程单体', text: TOWERS.interceptor.desc, extra: '需要玩家设定朝向；分支：贯穿射线 / 压制力场。' },
      { id: 'sandbox', name: '沙箱', tag: '检测 · 范围', text: TOWERS.sandbox.desc, extra: '可让伪装与潜伏目标显形，使其可被远程单体攻击锁定。' },
      { id: 'repair', name: '修复进程', tag: '治疗', text: TOWERS.repair.desc, extra: '技能“冗余切换”提供护盾并解除加密，是维持关键节点的关键。' }
    ],
    threats: [
      { id: 'worm', name: '蠕虫', text: ENEMIES.worm.desc },
      { id: 'flood', name: '洪泛团', text: ENEMIES.flood.desc },
      { id: 'trojan', name: '木马', text: ENEMIES.trojan.desc },
      { id: 'extorter', name: '勒索者', text: ENEMIES.extorter.desc },
      { id: 'hotspot', name: '伪热点', text: ENEMIES.hotspot.desc },
      { id: 'shell', name: '加壳器', text: ENEMIES.shell.desc },
      { id: 'wankui', name: '万傀', text: ENEMIES.wankui.desc },
      { id: 'shanlou', name: '蜃楼', text: ENEMIES.shanlou.desc },
      { id: 'zheyin', name: '蛰影', text: ENEMIES.zheyin.desc }
    ],
    systems: [
      { name: '链路', text: '恶意程序与业务流量经过的道路。防火墙和蜜罐可以部署在入口、出口之外的链路上：它们阻挡敌人，但不会截断这条道路。' },
      { name: '交换节点', text: '链路交汇处的网络设备。部署防火墙、网闸或插入应急隔离器，会隔离节点，使这一格不能通行；解除隔离后恢复直通。' },
      { name: '设备平台', text: '部署远程与修复支援塔的位置，与链路有高低区别，敌人不能通行。拦截器、沙箱和修复进程只能部署在平台上。' },
      { name: '旧链路', text: '保留旧协议的道路。地面敌人在此减速，木马会显形。敌人选择路线时同样会考虑旧链路的较慢通行速度。' },
      { name: '障碍', text: '数据设施、公网流与气隙等区域，不能通行，也不能部署任何设备。架高层链路可以从上方跨越。' },
      { name: '状态', text: '检测使伪装目标显形；护盾吸收伤害；加密使塔暂时停止攻击、治疗与释放技能，但不解除阻挡或节点隔离。修复进程可以解除加密。' },
      { name: '资源', text: '算力随时间增长并可从消灭敌人中回收，用于建造与备份还原；情报通过波次、消灭重点威胁和持续守住隔离节点获得，用于隔离节点、升级分支与情报道具。两种资源不可互换。' },
      { name: '改道', text: '节点被隔离后截断道路；设备被摧毁或撤下、隔离器失效后道路重新打开。任何改道都不会让入口或场上的敌人无路可走。' }
    ]
  };

  RT.DATA = { MAPS, TOWERS, TOWER_ORDER, ENEMIES, ITEMS, CODEX };
})(typeof window !== 'undefined' ? window : globalThis);
