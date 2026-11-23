// Three handcrafted maps with distinct network architectures, switch node topologies,
// environmental storytelling, and curated wave scripts (14 / 15 / 16 waves).

function parseGrid(rows, meta) {
  const height = rows.length;
  const width = rows[0].length;
  const grid = [];
  const entries = [];
  const exits = [];
  const nodes = [];

  for (let y = 0; y < height; y++) {
    const rowArr = [];
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      let tile = { x, y, type: 'obstacle', subtype: meta.obstacleStyle || 'rack' };

      if (ch === '.') {
        tile = { x, y, type: 'link' };
      } else if (ch === 'L') {
        tile = { x, y, type: 'legacy' };
      } else if (ch === 'P') {
        tile = { x, y, type: 'platform' };
      } else if (ch === '#') {
        tile = { x, y, type: 'obstacle', subtype: meta.obstacleStyle || 'rack' };
      } else if (ch === '~') {
        tile = { x, y, type: 'obstacle', subtype: meta.hazardStyle || 'torrent' };
      } else if (ch === 'A' || ch === 'B' || ch === 'C') {
        const info = meta.entryMeta[ch];
        tile = { x, y, type: 'entry', entryId: ch, label: info.name };
        entries.push({ id: ch, x, y, name: info.name, desc: info.desc });
      } else if (ch === 'X' || ch === 'Y') {
        const info = meta.exitMeta[ch];
        tile = { x, y, type: 'exit', exitId: ch, label: info.name };
        exits.push({ id: ch, x, y, name: info.name, desc: info.desc });
      } else if (ch >= '1' && ch <= '4') {
        const nodeId = `N${ch}`;
        const info = meta.nodeMeta[nodeId];
        tile = { x, y, type: 'node', nodeId, label: info.name };
        nodes.push({ id: nodeId, x, y, name: info.name, zone: info.zone });
      }
      rowArr.push(tile);
    }
    grid.push(rowArr);
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  exits.sort((a, b) => a.id.localeCompare(b.id));
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  return { width, height, grid, entries, exits, nodes };
}

// Helper for concise wave entries: { entry, type, count, interval, delay }
function group(entry, type, count, interval = 1.0, delay = 0) {
  return { entry, type, count, interval, delay };
}

// ============================================================================
// MAP 1: 分段内网 (Enterprise Segmented Intranet - 14 Waves)
// ============================================================================
const MAP1_ROWS = [
  '##PAP#####PBP##',
  '#P#.P#####P.#P#',
  '#L............#',
  '#LPP1PP#PP3PP.#',
  '#L#P.P###P.P#.#',
  '#....LLLLL....#',
  '#.#P2P#P#P.P#.#',
  '#LPP.......PP.#',
  '#.#P#P#4#P#P#.#',
  '#.............#',
  '#####P#X#P#####',
];

const MAP1_META = {
  obstacleStyle: 'rack',
  hazardStyle: 'bulkhead',
  entryMeta: {
    A: { name: '门户网站', desc: '面向公网的 Web 前端接入点，直连办公网段。' },
    B: { name: '邮件网关', desc: '企业邮件收发网关，直连核心业务网段。' },
  },
  exitMeta: {
    X: { name: '核心数据库', desc: '保存汐域企业全域账务与身份凭证的核心库。' },
  },
  nodeMeta: {
    N1: { name: '西边界节点', zone: '办公网段北口' },
    N2: { name: '办公南闸节点', zone: '办公网段南口' },
    N3: { name: '东业务节点', zone: '业务网段北口' },
    N4: { name: '核心前置节点', zone: '核心数据库入口' },
  },
};

const MAP1_WAVES = [
  // Wave 1: Worms from A
  {
    name: '探针试探',
    tip: '蠕虫首次经过直通交换节点时会复制分裂。',
    groups: [group('A', 'worm', 5, 1.35, 0.5)],
    intelBonus: 12,
  },
  // Wave 2: Worms from A & B
  {
    name: '双口渗透',
    tip: '门户网站与邮件网关同时涌入流量，可尝试隔离西边界节点汇聚火力。',
    groups: [group('A', 'worm', 5, 1.2, 0.4), group('B', 'worm', 5, 1.25, 1.2)],
    intelBonus: 12,
  },
  // Wave 3: Introduce Trojan (disguised)
  {
    name: '伪装载荷',
    tip: '新威胁「木马」混在正常封装中，需沙箱、旧链路或阻挡使其显形。',
    groups: [group('A', 'worm', 4, 1.1, 0.4), group('B', 'trojan', 3, 1.8, 1.2), group('A', 'trojan', 2, 2.0, 4.0)],
    intelBonus: 14,
  },
  // Wave 4: Introduce Flood Pack
  {
    name: '节点试压',
    tip: '新威胁「洪泛团」占用 2 格阻挡并会主动偏离路线撞击被隔离的交换节点。',
    groups: [group('A', 'flood', 2, 2.8, 0.6), group('B', 'worm', 6, 1.0, 0.8), group('A', 'worm', 4, 1.1, 3.0)],
    intelBonus: 15,
  },
  // Wave 5: Mixed + Trojans on both sides
  {
    name: '横向漫游',
    groups: [group('A', 'trojan', 4, 1.5, 0.5), group('B', 'flood', 2, 2.6, 1.0), group('B', 'worm', 6, 0.9, 2.2)],
    intelBonus: 15,
  },
  // Wave 6: Introduce Ransomware
  {
    name: '勒索试探',
    tip: '新威胁「勒索者」会远程攻击并加密平台与链路上的塔；可用蜜罐吸引火力。',
    groups: [group('A', 'worm', 6, 0.95, 0.4), group('B', 'ransom', 2, 2.6, 1.2), group('A', 'ransom', 1, 2.5, 4.2)],
    intelBonus: 16,
  },
  // Wave 7: Introduce Rogue Hotspot (Flying)
  {
    name: '无线越界',
    tip: '新威胁「伪热点」沿无线层直飞核心，无视地面改道，需调整拦截器朝向拦截。',
    groups: [group('A', 'hotspot', 3, 1.8, 0.6), group('B', 'hotspot', 3, 1.8, 1.5), group('A', 'trojan', 3, 1.6, 2.0), group('B', 'worm', 6, 0.9, 2.5)],
    intelBonus: 16,
  },
  // Wave 8: Flood + Ransom pressure on isolated nodes
  {
    name: '破闸强攻',
    groups: [group('A', 'flood', 3, 2.4, 0.5), group('A', 'ransom', 2, 2.4, 1.8), group('B', 'trojan', 4, 1.5, 1.0), group('B', 'worm', 6, 0.85, 3.5)],
    intelBonus: 18,
  },
  // Wave 9: Introduce Packager
  {
    name: '加壳掩护',
    tip: '新威胁「加壳器」为周边同伴套上可打破的护盾，掩护敌群突破防线。',
    groups: [group('A', 'packager', 2, 3.0, 0.6), group('A', 'worm', 7, 0.85, 0.9), group('B', 'packager', 2, 3.0, 1.4), group('B', 'trojan', 4, 1.5, 1.8)],
    intelBonus: 18,
  },
  // Wave 10: Dual air + ground siege
  {
    name: '立体压制',
    groups: [group('A', 'hotspot', 4, 1.5, 0.5), group('B', 'hotspot', 4, 1.5, 1.2), group('A', 'flood', 3, 2.2, 1.0), group('B', 'ransom', 3, 2.2, 1.5), group('A', 'packager', 2, 3.2, 3.0)],
    intelBonus: 20,
  },
  // Wave 11: Heavy node assault + covert trojans
  {
    name: '内网风暴',
    groups: [group('A', 'flood', 3, 2.0, 0.4), group('B', 'flood', 3, 2.0, 0.8), group('A', 'trojan', 5, 1.3, 1.6), group('B', 'ransom', 3, 2.0, 2.2), group('B', 'packager', 2, 2.8, 3.2)],
    intelBonus: 20,
  },
  // Wave 12: High-speed swarm + air + encryption
  {
    name: '全面渗透',
    groups: [group('A', 'worm', 10, 0.7, 0.4), group('B', 'worm', 10, 0.7, 0.8), group('A', 'ransom', 3, 2.0, 1.8), group('B', 'hotspot', 5, 1.3, 2.4), group('A', 'packager', 2, 2.8, 3.0)],
    intelBonus: 22,
  },
  // Wave 13: Pre-Boss Elite Vanguard
  {
    name: '僵尸先遣',
    groups: [group('A', 'flood', 4, 1.9, 0.4), group('B', 'packager', 3, 2.4, 0.8), group('B', 'trojan', 5, 1.2, 1.4), group('A', 'ransom', 4, 1.9, 2.0), group('A', 'hotspot', 4, 1.4, 3.5)],
    intelBonus: 24,
  },
  // Wave 14: BOSS 万傀
  {
    name: '领主来袭：万傀',
    isBossWave: true,
    tip: '警告：僵尸网络主控「万傀」侵入！警惕其「洪峰」重击隔离节点与半血蠕虫潮。',
    groups: [
      group('A', 'boss_wankui', 1, 1.0, 1.0),
      group('A', 'packager', 2, 3.5, 2.5),
      group('B', 'flood', 3, 2.6, 2.0),
      group('B', 'ransom', 3, 2.4, 4.0),
      group('A', 'worm', 6, 0.9, 6.5),
      group('B', 'hotspot', 4, 1.6, 8.0),
    ],
    intelBonus: 30,
  },
];

// ============================================================================
// MAP 2: 骨干流域 (Backbone Basin - Dual Active DCs - 15 Waves)
// ============================================================================
const MAP2_ROWS = [
  '#PA######PC#PB#',
  '#P.######P.#P.#',
  '#.............#',
  '#P.PPP.PP#P2P##',
  '#P1P#P.#~~~.~~#',
  '~~.~~~.~~~~L~~~',
  '~~.~~~.~~~~L~~~',
  '#P.P#P.###P.P##',
  '#.............#',
  '##P3PP###PP4P##',
  '###X#######Y###',
];

const MAP2_META = {
  obstacleStyle: 'pylon',
  hazardStyle: 'torrent',
  entryMeta: {
    A: { name: '互联网', desc: '公网骨干入口，默认沿西专线隧道直抵数据中心 X。' },
    C: { name: '分支专线', desc: '各地分支汇总线路，默认经东汇聚节点与旧专线前往数据中心 Y。' },
    B: { name: '云端互联', desc: '跨云高速接入点，默认汇入东汇聚节点经旧专线前往数据中心 Y。' },
  },
  exitMeta: {
    X: { name: '数据中心 X', desc: '西部主活数据中心，与数据中心 Y 互为热备。' },
    Y: { name: '数据中心 Y', desc: '东部双活数据中心，与数据中心 X 互为热备。' },
  },
  nodeMeta: {
    N1: { name: '西隧道节点', zone: '西专线隧道北口' },
    N2: { name: '东汇聚节点', zone: '旧专线汇聚枢纽' },
    N3: { name: '西核心闸门', zone: '数据中心 X 入口' },
    N4: { name: '东核心闸门', zone: '数据中心 Y 入口' },
  },
};

const MAP2_WAVES = [
  {
    name: '骨干探测',
    tip: 'C、B 默认经东汇聚节点与旧专线汇流至数据中心 Y，隔离东汇聚节点可将它们改道至数据中心 X。',
    groups: [group('A', 'worm', 4, 1.3, 0.5), group('C', 'worm', 4, 1.3, 1.2)],
    intelBonus: 12,
  },
  {
    name: '三源入网',
    groups: [group('A', 'worm', 4, 1.2, 0.4), group('C', 'worm', 4, 1.2, 0.8), group('B', 'worm', 4, 1.2, 1.4)],
    intelBonus: 13,
  },
  {
    name: '旧线暗桩',
    groups: [group('A', 'trojan', 3, 1.7, 0.5), group('C', 'trojan', 3, 1.6, 1.2), group('B', 'worm', 5, 1.0, 2.0)],
    intelBonus: 14,
  },
  {
    name: '汇聚试压',
    groups: [group('C', 'flood', 2, 2.6, 0.5), group('B', 'flood', 1, 2.5, 1.8), group('A', 'worm', 6, 1.0, 1.0)],
    intelBonus: 15,
  },
  {
    name: '云端勒索',
    groups: [group('A', 'ransom', 2, 2.4, 0.6), group('B', 'ransom', 2, 2.4, 1.4), group('C', 'worm', 6, 0.9, 1.2), group('A', 'trojan', 3, 1.6, 3.0)],
    intelBonus: 16,
  },
  {
    name: '跨河空袭',
    groups: [group('A', 'hotspot', 3, 1.7, 0.5), group('C', 'hotspot', 3, 1.7, 1.0), group('B', 'flood', 2, 2.5, 1.6), group('A', 'worm', 6, 0.9, 2.2)],
    intelBonus: 16,
  },
  {
    name: '双活牵制',
    groups: [group('A', 'packager', 2, 3.0, 0.6), group('A', 'trojan', 4, 1.5, 1.0), group('C', 'flood', 2, 2.4, 1.2), group('B', 'ransom', 2, 2.4, 2.0)],
    intelBonus: 18,
  },
  {
    name: '破盾协防',
    groups: [group('C', 'packager', 2, 2.8, 0.5), group('B', 'packager', 2, 2.8, 1.0), group('C', 'worm', 7, 0.85, 1.2), group('A', 'flood', 2, 2.4, 1.6), group('B', 'hotspot', 4, 1.5, 2.4)],
    intelBonus: 18,
  },
  {
    name: '双线高压',
    groups: [group('A', 'flood', 3, 2.2, 0.4), group('A', 'ransom', 3, 2.2, 1.5), group('C', 'trojan', 4, 1.4, 1.0), group('B', 'flood', 2, 2.4, 2.0)],
    intelBonus: 20,
  },
  {
    name: '暗流涌动',
    groups: [group('A', 'trojan', 5, 1.3, 0.5), group('C', 'ransom', 3, 2.1, 1.0), group('B', 'hotspot', 5, 1.35, 1.4), group('A', 'packager', 2, 2.8, 2.2)],
    intelBonus: 20,
  },
  // Wave 11: Iconic 3-Entry FLOOD SURGE (洪峰)
  {
    name: '【洪峰】三口并流',
    isSurgeWave: true,
    tip: '全网告警：互联网、分支专线、云端互联同时爆发高并发洪峰！灵活使用改道与协议降级分摊压力。',
    groups: [
      group('A', 'worm', 9, 0.65, 0.3),
      group('C', 'worm', 9, 0.65, 0.5),
      group('B', 'worm', 9, 0.65, 0.7),
      group('A', 'trojan', 4, 1.3, 2.4),
      group('C', 'flood', 3, 1.9, 2.2),
      group('B', 'flood', 3, 1.9, 2.6),
      group('A', 'hotspot', 4, 1.4, 4.5),
      group('B', 'ransom', 3, 2.0, 5.0),
    ],
    intelBonus: 26,
  },
  {
    name: '加壳重锤',
    groups: [group('A', 'packager', 3, 2.4, 0.4), group('A', 'flood', 3, 2.1, 1.0), group('C', 'ransom', 3, 2.0, 1.2), group('B', 'trojan', 5, 1.3, 1.8)],
    intelBonus: 22,
  },
  {
    name: '空地绞杀',
    groups: [group('A', 'hotspot', 5, 1.25, 0.5), group('C', 'hotspot', 5, 1.25, 1.2), group('B', 'flood', 4, 1.9, 1.0), group('A', 'ransom', 3, 2.0, 2.0), group('C', 'packager', 2, 2.6, 2.6)],
    intelBonus: 22,
  },
  {
    name: '骨干前夜',
    groups: [group('A', 'flood', 4, 1.8, 0.4), group('C', 'packager', 3, 2.4, 0.8), group('B', 'ransom', 4, 1.8, 1.2), group('A', 'trojan', 5, 1.2, 2.2), group('B', 'hotspot', 5, 1.3, 3.0)],
    intelBonus: 25,
  },
  // Wave 15: BOSS 蜃楼
  {
    name: '领主来袭：蜃楼',
    isBossWave: true,
    tip: '警告：路由欺骗体「蜃楼」进入骨干网！它会制造临时路由黑洞强行改道，半血后释放路由风暴削弱护盾。',
    groups: [
      group('C', 'boss_shenlou', 1, 1.0, 1.0),
      group('A', 'flood', 3, 2.4, 1.8),
      group('B', 'packager', 2, 3.0, 2.2),
      group('A', 'trojan', 4, 1.5, 3.2),
      group('B', 'ransom', 3, 2.3, 4.5),
      group('C', 'hotspot', 5, 1.5, 6.5),
    ],
    intelBonus: 35,
  },
];

// ============================================================================
// MAP 3: 气隙深层 (Air-Gap Depths - Industrial Control Network - 16 Waves)
// ============================================================================
const MAP3_ROWS_EXACT = [
  '###PA##PBPCP###', // A=(4,0), B=(8,0), C=(10,0)
  '##PP.##P.P.PP##', // links at (4,1), (8,1), (10,1)
  '#........2....#', // North Ring x=1..13, N2=(9,2) between B(8,2) and C(10,2)
  '#LPP.~~~~~.PPL#', // West Legacy Bus x=1, West Channel x=4, Air-Gap x=5..9, East Channel x=10, East Legacy Bus x=13
  '#L#P.~~~~~.P#L#',
  '#LP#1~~~~~3#PL#', // N1=(4,5) West Channel, N3=(10,5) East Channel
  '#L#P.~~~~~.P#L#',
  '#LPP.~~~~~.PPL#',
  '#.............#', // South Ring x=1..13 (connects West Bus, West Channel, South Ring, East Channel, East Bus)
  '###P.P###P4P###', // South Exits approach: (4,9)->X(4,10), N4=(10,9)->Y(10,10)
  '####X#####Y####', // X=(4,10) 过程控制核心, Y=(10,10) 安全联锁核心
];

const MAP3_META = {
  obstacleStyle: 'switchgear',
  hazardStyle: 'airgap',
  entryMeta: {
    A: { name: '运维跳板机', desc: '工控区北西运维入口，默认沿西运维通道直抵过程控制核心 X。' },
    B: { name: '办公网下行', desc: '跨边界数据下行接口，默认经北环东段汇入东运维通道攻向安全联锁核心 Y。' },
    C: { name: '供应商远程维护', desc: '外部厂商维护通道，默认沿东运维通道直逼安全联锁核心 Y。' },
  },
  exitMeta: {
    X: { name: '过程控制核心 X', desc: '控制生产工艺与反应釜阀组的核心 PLC 集群。' },
    Y: { name: '安全联锁核心 Y', desc: '负责紧急停机与联锁保护的最后安全屏障。' },
  },
  nodeMeta: {
    N1: { name: '西运维节点', zone: '西狭窄通道' },
    N2: { name: '北环分流节点', zone: '北运维环东段' },
    N3: { name: '东运维节点', zone: '东狭窄通道' },
    N4: { name: '联锁核心节点', zone: '安全联锁核心入口' },
  },
};

const MAP3_WAVES = [
  {
    name: '跳板入侵',
    tip: '隔离运维环上的不同节点，可让流量在东西狭窄通道与两个核心之间转移牵制。',
    groups: [group('A', 'worm', 5, 1.2, 0.5), group('C', 'worm', 5, 1.2, 1.0)],
    intelBonus: 13,
  },
  {
    name: '环网试探',
    groups: [group('A', 'worm', 5, 1.1, 0.4), group('B', 'worm', 4, 1.2, 0.9), group('C', 'trojan', 3, 1.7, 1.4)],
    intelBonus: 14,
  },
  {
    name: '工控潜伏',
    groups: [group('A', 'trojan', 4, 1.5, 0.5), group('B', 'trojan', 3, 1.6, 1.2), group('C', 'worm', 6, 0.95, 1.6)],
    intelBonus: 15,
  },
  {
    name: '窄道强冲',
    groups: [group('A', 'flood', 2, 2.5, 0.5), group('C', 'flood', 2, 2.5, 1.0), group('B', 'worm', 6, 0.95, 1.5)],
    intelBonus: 16,
  },
  {
    name: '锁死威胁',
    groups: [group('A', 'ransom', 2, 2.3, 0.6), group('B', 'ransom', 2, 2.3, 1.4), group('C', 'trojan', 4, 1.5, 1.8), group('A', 'worm', 5, 0.9, 2.5)],
    intelBonus: 17,
  },
  {
    name: '气隙飞越',
    tip: '伪热点无视中央气隙直飞核心，需合理分配两翼平台拦截器朝向。',
    groups: [group('A', 'hotspot', 4, 1.6, 0.5), group('B', 'hotspot', 3, 1.6, 1.2), group('C', 'hotspot', 4, 1.6, 1.8), group('B', 'flood', 2, 2.4, 2.4)],
    intelBonus: 17,
  },
  {
    name: '装甲突进',
    groups: [group('A', 'packager', 2, 2.8, 0.5), group('A', 'flood', 2, 2.3, 1.0), group('C', 'packager', 2, 2.8, 1.2), group('C', 'trojan', 4, 1.5, 1.8)],
    intelBonus: 18,
  },
  {
    name: '双向加密',
    groups: [group('B', 'ransom', 3, 2.1, 0.5), group('C', 'ransom', 3, 2.1, 1.2), group('A', 'flood', 3, 2.2, 1.0), group('A', 'worm', 7, 0.85, 2.2)],
    intelBonus: 19,
  },
  {
    name: '老总线渗漏',
    groups: [group('A', 'trojan', 5, 1.3, 0.4), group('B', 'packager', 2, 2.8, 1.0), group('C', 'flood', 3, 2.1, 1.4), group('B', 'hotspot', 4, 1.4, 2.4)],
    intelBonus: 20,
  },
  {
    name: '联锁承压',
    groups: [group('C', 'flood', 4, 1.9, 0.4), group('C', 'ransom', 3, 2.0, 1.2), group('A', 'packager', 2, 2.6, 1.4), group('A', 'trojan', 4, 1.4, 2.0), group('B', 'worm', 8, 0.8, 2.5)],
    intelBonus: 21,
  },
  {
    name: '多域夹击',
    groups: [group('A', 'hotspot', 5, 1.3, 0.5), group('C', 'hotspot', 5, 1.3, 1.0), group('A', 'ransom', 3, 2.0, 1.4), group('B', 'flood', 3, 2.0, 1.8), group('C', 'packager', 2, 2.6, 2.6)],
    intelBonus: 22,
  },
  // Wave 12: Iconic 3-Entry FLOOD SURGE (洪峰)
  {
    name: '【洪峰】气隙合围',
    isSurgeWave: true,
    tip: '全网最高告警：三大工控入口同步爆发饱和洪峰！两座核心防线相互牵制，善用冗余切换与协议降级。',
    groups: [
      group('A', 'worm', 10, 0.6, 0.3),
      group('B', 'worm', 10, 0.6, 0.5),
      group('C', 'worm', 10, 0.6, 0.7),
      group('A', 'flood', 3, 1.9, 2.2),
      group('B', 'trojan', 5, 1.2, 2.4),
      group('C', 'flood', 3, 1.9, 2.6),
      group('A', 'ransom', 3, 2.0, 4.4),
      group('C', 'ransom', 3, 2.0, 4.8),
      group('B', 'hotspot', 5, 1.3, 5.5),
    ],
    intelBonus: 28,
  },
  {
    name: '高危加密潮',
    groups: [group('A', 'ransom', 4, 1.8, 0.4), group('C', 'ransom', 4, 1.8, 1.0), group('B', 'packager', 3, 2.4, 1.2), group('B', 'flood', 3, 2.0, 2.2)],
    intelBonus: 23,
  },
  {
    name: '空域遮蔽',
    groups: [group('A', 'hotspot', 6, 1.2, 0.4), group('B', 'hotspot', 5, 1.2, 1.0), group('C', 'trojan', 6, 1.15, 1.2), group('A', 'flood', 4, 1.8, 2.0)],
    intelBonus: 24,
  },
  {
    name: '提权前奏',
    groups: [group('A', 'packager', 3, 2.4, 0.4), group('A', 'flood', 4, 1.8, 1.0), group('B', 'ransom', 4, 1.8, 1.4), group('C', 'trojan', 5, 1.2, 1.8), group('C', 'packager', 3, 2.4, 2.6)],
    intelBonus: 26,
  },
  // Wave 16: FINAL BOSS 蛰影
  {
    name: '终极领主：蛰影',
    isBossWave: true,
    tip: '最高级威胁「蛰影」本体现身！阶段演进：潜伏（需显形）→ 提权（护甲+木马）→ 破坏（锁死运维环强行改道）。',
    groups: [
      group('C', 'boss_zheying', 1, 1.0, 1.0),
      group('A', 'flood', 3, 2.4, 1.8),
      group('B', 'ransom', 3, 2.2, 2.4),
      group('C', 'packager', 2, 3.0, 2.8),
      group('A', 'trojan', 4, 1.5, 4.2),
      group('B', 'hotspot', 5, 1.5, 6.2),
    ],
    intelBonus: 40,
  },
];

export const MAPS = [
  {
    id: 'intranet',
    index: 0,
    name: '分段内网',
    subtitle: '企业核心架构 · DMZ 与内外环网',
    networkType: '企业内网',
    difficulty: '标准',
    totalWaves: MAP1_WAVES.length,
    bossId: 'boss_wankui',
    startCompute: 260,
    startIntel: 45,
    startIntegrity: 20,
    description:
      '入口 A「门户网站」与 B「邮件网关」接入 DMZ，南端为「核心数据库」。隔离西边界节点可令 A 折向 DMZ 互联与 B 汇流；隔离核心前置节点则迫使双路流量转向外围旧系统网段与灾备环。',
    theme: {
      bgHex: '#07111f',
      fogHex: '#07111f',
      accentHex: '#25d5ff',
      ambientHex: '#33557a',
      keyLightHex: '#cbe8ff',
      rimLightHex: '#18c8ff',
      protocolHex: '#125c8a',
      musicTheme: 'intranet',
    },
    ...parseGrid(MAP1_ROWS, MAP1_META),
    waves: MAP1_WAVES,
  },
  {
    id: 'backbone',
    index: 1,
    name: '骨干流域',
    subtitle: '跨网专线 · 公网洪流与双活数据中心',
    networkType: '跨网骨干',
    difficulty: '进阶',
    totalWaves: MAP2_WAVES.length,
    bossId: 'boss_shenlou',
    startCompute: 290,
    startIntel: 52,
    startIntegrity: 20,
    description:
      '公网洪流横贯战场，三条专线隧道与旧专线横跨其上。入口 C、B 默认经东汇聚节点与旧专线汇流至数据中心 Y；隔离汇聚节点可将它们改道导向数据中心 X，重塑与入口 A 的交战分布。',
    theme: {
      bgHex: '#061224',
      fogHex: '#061224',
      accentHex: '#36f0cf',
      ambientHex: '#275478',
      keyLightHex: '#d5f2ff',
      rimLightHex: '#2ce4c8',
      protocolHex: '#0e6a7e',
      musicTheme: 'backbone',
    },
    ...parseGrid(MAP2_ROWS, MAP2_META),
    waves: MAP2_WAVES,
  },
  {
    id: 'airgap',
    index: 2,
    name: '气隙深层',
    subtitle: '工控核心 · 中央气隙与运维环网',
    networkType: '工控网络',
    difficulty: '高危',
    totalWaves: MAP3_WAVES.length,
    bossId: 'boss_zheying',
    startCompute: 310,
    startIntel: 58,
    startIntegrity: 20,
    description:
      '三座工控入口围绕中央物理气隙接入，运维环连通南北，外围老工控总线构成较慢的支路。隔离运维环上的不同节点会在东西狭窄通道间转移流量，令「过程控制核心 X」与「安全联锁核心 Y」的防守彼此牵制。',
    theme: {
      bgHex: '#091216',
      fogHex: '#091216',
      accentHex: '#f5a623',
      ambientHex: '#2e4e4a',
      keyLightHex: '#e6f5ec',
      rimLightHex: '#f59e0b',
      protocolHex: '#185c52',
      musicTheme: 'airgap',
    },
    ...parseGrid(MAP3_ROWS_EXACT, MAP3_META),
    waves: MAP3_WAVES,
  },
];

export function getMapById(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}
