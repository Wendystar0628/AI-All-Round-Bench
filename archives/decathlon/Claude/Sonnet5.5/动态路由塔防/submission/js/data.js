/* 《网络安全攻防战》数据定义：塔、敌人、道具、状态、地形说明 */
(function (G) {
'use strict';
// 游戏逻辑与特效统一使用 G.rand；默认即 Math.random，视频导出时切换为固定种子
G.rand = function () { return Math.random(); };        // 画面与特效用的随机数
G.simRand = function () { return Math.random(); };     // 对战逻辑用的随机数（独立序列，不随画面帧率变化）
function mulberry(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
G.seedRand = function (seed) { G.rand = mulberry(seed); G.simRand = mulberry(seed ^ 0x9E3779B9); };
G.unseedRand = function () { G.rand = function () { return Math.random(); }; G.simRand = function () { return Math.random(); }; };
G.TS = 1;                 // 一格的世界尺寸
G.OLD_SPEED = 0.55;       // 旧链路通行速度倍率
G.NODE_CD = 8;            // 节点恢复直通后再次隔离的间隔(秒)
G.ISO_REFUND_C = 0.7;     // 撤下返还算力比例
G.ISO_REFUND_I = 0.4;     // 撤下返还情报比例

// ---------- 塔 ----------
G.TOWERS = {
  firewall: {
    id: 'firewall', name: '防火墙', en: 'FIREWALL', role: '阻挡', color: '#f28c3a', place: ['road', 'node'],
    cost: 60, nodeIntel: 30, hotkey: '1',
    brief: '在链路上拦住敌人并还击；放在交换节点上则隔离该节点。',
    lv: [
      { name: '防火墙 Ⅰ', hp: 650, block: 3, dmg: 16, rate: 0.9 },
      { name: '防火墙 Ⅱ', hp: 1050, block: 4, dmg: 25, rate: 0.8, cost: 70 }
    ],
    skill: { name: '硬化策略', cd: 28, dur: 8, desc: '8 秒内承受伤害降低 60%，还击伤害 ×1.6。' }
  },
  honeypot: {
    id: 'honeypot', name: '蜜罐', en: 'HONEYPOT', role: '诱敌', color: '#b88be6', place: ['road'],
    cost: 70, hotkey: '2',
    brief: '以伪造应答吸引附近会攻击塔的地面敌人，替其他塔承担攻击；不会被加密。',
    lv: [
      { name: '蜜罐 Ⅰ', hp: 260, block: 2, lure: 2.4, trapDur: 3, trapCd: 22 },
      { name: '蜜罐 Ⅱ', hp: 260 }
    ],
    branches: {
      A: { name: '深度蜜网', hp: 720, block: 2, lure: 3.3, trapDur: 3.5, trapCd: 22, trace: 7, cost: 60, intel: 40,
           desc: '耐久与诱导半径大幅提高；被诱来的敌人持续承受溯源伤害并被检测显形。' },
      B: { name: '诱爆陷阱', hp: 340, block: 2, lure: 2.4, trapDur: 3, trapCd: 14, blast: 240, blastR: 1.9, cost: 60, intel: 40,
           desc: '诱捕冷却大幅缩短；诱捕或被击毁时引爆，对周围敌人造成范围伤害。' }
    },
    skill: { name: '诱捕', desc: '困住诱导半径内的地面敌人，使其无法移动并受到 20% 额外伤害（Boss 免疫）。' }
  },
  airgap: {
    id: 'airgap', name: '网闸', en: 'AIR-GAP SWITCH', role: '隔离', color: '#cfe9e2', place: ['node'],
    cost: 40, nodeIntel: 25, hotkey: '3',
    brief: '低成本隔离交换节点，耐久较高，不攻击；用来控制道路。',
    lv: [
      { name: '网闸 Ⅰ', hp: 900, block: 0, armor: 0 },
      { name: '网闸 Ⅱ', hp: 1700, block: 0, armor: 0.25, cost: 55 }
    ]
  },
  interceptor: {
    id: 'interceptor', name: '拦截器', en: 'INTERCEPTOR', role: '远程', color: '#6fb6e6', place: ['plat'],
    cost: 100, hotkey: '4', directional: true,
    brief: '在朝向的扇形区域内远程单体攻击，可打地面与飞行目标。',
    lv: [
      { name: '拦截器 Ⅰ', hp: 320, dmg: 30, rate: 0.8, range: 4.2, arc: 50 },
      { name: '拦截器 Ⅱ', hp: 320 }
    ],
    branches: {
      A: { name: '贯穿射线', hp: 340, dmg: 34, rate: 1.15, range: 5.8, arc: 26, pierce: 3, cost: 90, intel: 40,
           desc: '射程更远、扇面更窄，光束贯穿直线上至多 3 个目标（含未显形者）。' },
      B: { name: '压制脉冲', hp: 340, dmg: 17, rate: 0.5, range: 4.4, arc: 64, slow: 0.4, slowDur: 1.8, bonus: 0.25, cost: 90, intel: 40,
           desc: '扇面更宽、射速更快，命中使目标减速 40%，对被减速目标伤害 +25%。' }
    }
  },
  sandbox: {
    id: 'sandbox', name: '沙箱', en: 'SANDBOX', role: '检测', color: '#efcb4f', place: ['plat'],
    cost: 120, hotkey: '5',
    brief: '检测范围内伪装或潜伏目标使其显形，并对地面敌人进行范围攻击。',
    lv: [
      { name: '沙箱 Ⅰ', hp: 380, dmg: 36, rate: 1.7, range: 3.2, splash: 1.15, detect: 3.4 },
      { name: '沙箱 Ⅱ', hp: 480, dmg: 46, rate: 1.6, range: 3.8, splash: 1.5, detect: 4.4, taint: 0.15, cost: 90 }
    ]
  },
  repair: {
    id: 'repair', name: '修复进程', en: 'REPAIR DAEMON', role: '治疗', color: '#58d8a8', place: ['plat'],
    cost: 90, hotkey: '6',
    brief: '不攻击敌人，持续恢复范围内其他受损塔的生命；可释放冗余切换。',
    lv: [
      { name: '修复进程 Ⅰ', hp: 300, heal: 17, range: 2.7, targets: 2, skillShield: 220, skillCd: 30, skillR: 3.2 },
      { name: '修复进程 Ⅱ', hp: 360, heal: 30, range: 3.3, targets: 4, skillShield: 340, skillCd: 24, skillR: 4.0, cost: 80 }
    ],
    skill: { name: '冗余切换', desc: '为附近友塔提供护盾并解除加密。' }
  }
};
G.TOWER_ORDER = ['firewall', 'honeypot', 'airgap', 'interceptor', 'sandbox', 'repair'];
G.ROLE_COLOR = { '阻挡': '#f28c3a', '诱敌': '#b88be6', '隔离': '#cfe9e2', '远程': '#6fb6e6', '检测': '#efcb4f', '治疗': '#58d8a8' };

// 当前塔实例的有效属性（等级 + 分支合并）
G.towerStats = function (kind, level, branch) {
  var d = G.TOWERS[kind];
  var s = Object.assign({}, d.lv[0]);
  if (level >= 2) {
    s = Object.assign(s, d.lv[1]);
    if (branch && d.branches && d.branches[branch]) s = Object.assign(s, d.branches[branch]);
  }
  return s;
};
G.towerTitle = function (t) {
  var d = G.TOWERS[t.kind];
  var n = d.name + (t.level >= 2 ? ' Ⅱ' : ' Ⅰ');
  if (t.branch && d.branches) n += '·' + d.branches[t.branch].name;
  return n;
};

// ---------- 敌人 ----------
G.ENEMIES = {
  worm: {
    id: 'worm', name: '蠕虫', en: 'WORM', color: '#e8505a', hp: 90, speed: 1.0, block: 1, atk: 11, atkRate: 0.8, coreDmg: 2, rewardC: 7, rewardI: 0, r: 0.2,
    brief: '被阻挡时持续攻击挡住它的塔；首次经过直通的交换节点时复制出一个同伴（复制体不再复制）。',
    tip: '节点隔离后蠕虫无法经过节点，不会复制；把它们挡在节点之前是最省的办法。'
  },
  flooder: {
    id: 'flooder', name: '洪泛团', en: 'FLOOD CLUSTER', color: '#f09a3a', hp: 700, speed: 0.62, block: 3, atk: 20, atkRate: 1.0, strike: 150, strikeRate: 2.4, coreDmg: 10, rewardC: 30, rewardI: 5, r: 0.38,
    brief: '占用 3 个阻挡容量。会离开路线，向附近被隔离节点的可通行一侧移动，重击节点上的塔或隔离器；打通后沿重新开放的道路前进。',
    tip: '隔离点需要防火墙承受、修复进程补血；也可以让它撞上蜜罐。'
  },
  trojan: {
    id: 'trojan', name: '木马', en: 'TROJAN', color: '#a6d65c', hp: 130, speed: 1.15, block: 1, atk: 7, atkRate: 1.0, coreDmg: 3, rewardC: 10, rewardI: 0, r: 0.2, payload: 170, payloadR: 2.0,
    brief: '伪装成正常封装数据包，显形前不能被远程单体攻击选中；沙箱检测、旧链路和阻挡会使其显形。未显形就被范围攻击消灭时释放载荷，伤害附近的塔。',
    tip: '让它在旧链路或防火墙处显形再击杀，载荷就不会引爆。'
  },
  ransom: {
    id: 'ransom', name: '勒索者', en: 'RANSOMER', color: '#e45ab8', hp: 250, speed: 0.8, block: 1, atk: 16, atkRate: 1.5, range: 3.0, enc: 3.5, coreDmg: 6, rewardC: 16, rewardI: 4, r: 0.26, ranged: true,
    brief: '边移动边从远处攻击射程内的塔（包括平台上的塔），造成伤害并施加加密；会优先攻击射程内的蜜罐。',
    tip: '蜜罐不会被加密，是它的最佳靶子；冗余切换与备份还原可以解除加密。'
  },
  hotspot: {
    id: 'hotspot', name: '伪热点', en: 'ROGUE AP', color: '#7cc9e4', hp: 130, speed: 1.5, block: 0, coreDmg: 4, rewardC: 12, rewardI: 0, r: 0.24, air: true,
    brief: '飞行单位，沿无线层（场上空中的虚线）从入口直飞出口，不受地面道路和阻挡影响，只有拦截器能击落。',
    tip: '它不走路线，改道对它无效；用拦截器覆盖入口到出口的直线。'
  },
  packer: {
    id: 'packer', name: '加壳器', en: 'PACKER', color: '#e8c63e', hp: 320, speed: 0.7, block: 2, atk: 5, atkRate: 1.0, aura: 2.3, shieldAmt: 50, shieldCap: 100, shieldRate: 2.6, coreDmg: 5, rewardC: 22, rewardI: 4, r: 0.3,
    brief: '为附近同伴提供可被打破的护盾，保护成群敌人推进；本身脆弱。',
    tip: '先击杀加壳器，或用贯穿射线 / 沙箱范围伤害同时打破护盾。'
  },
  boss1: {
    id: 'boss1', name: '万傀', en: 'LEGION · BOTNET', color: '#ff6b3d', hp: 6800, speed: 0.42, block: 4, atk: 36, atkRate: 1.1, coreDmg: 60, rewardC: 300, rewardI: 40, r: 0.75, boss: true,
    brief: '僵尸网络的群体控制者。“洪峰”冲击被隔离的节点，重创塔并冲毁隔离器；生命降低后释放成群蠕虫。',
    tip: '冲击前节点上会出现警示环；准备修复进程，或在警示结束前撤下隔离、改由旁路直通。'
  },
  boss2: {
    id: 'boss2', name: '蜃楼', en: 'MIRAGE · BGP HIJACK', color: '#c69be6', hp: 7600, speed: 0.5, block: 4, atk: 30, atkRate: 1.0, coreDmg: 60, rewardC: 320, rewardI: 40, r: 0.75, boss: true,
    brief: '路由欺骗的化身。“伪路由”在前方链路制造临时路由黑洞，截断通行、迫使各入口改道；生命降低后发动“路由风暴”，削弱附近塔的护盾。',
    tip: '黑洞出现前地面会有紫色警示；保持备用线路畅通，不要把所有跨越点都隔离。'
  },
  boss3: {
    id: 'boss3', name: '蛰影', en: 'DORMANT SHADOW · APT', color: '#ee4a5e', hp: 8600, speed: 0.55, block: 4, atk: 40, atkRate: 1.0, coreDmg: 80, rewardC: 400, rewardI: 60, r: 0.7, boss: true,
    brief: '攻击组织的核心威胁，按“潜伏—提权—破坏”改变阶段：潜伏时需要检测才能被远程单体攻击选中；提权后强化护甲并放出木马；破坏阶段锁死前方一段运维环、改变道路。',
    tip: '带上沙箱让它显形；破坏阶段锁死段出现前有红色警示线。'
  }
};
G.ENEMY_ORDER = ['worm', 'flooder', 'trojan', 'ransom', 'hotspot', 'packer', 'boss1', 'boss2', 'boss3'];

// ---------- 道具 ----------
G.ITEMS = {
  isolator: {
    id: 'isolator', name: '应急隔离器', en: 'EMERGENCY ISOLATOR', res: 'intel', cost: 45, cd: 20, hp: 260, ttl: 26, radius: 0, hotkey: 'Q',
    brief: '临时隔离一个直通节点，有耐久和有效期，会被敌人冲毁；不产生情报。',
    target: 'node'
  },
  downgrade: {
    id: 'downgrade', name: '协议降级', en: 'PROTOCOL DOWNGRADE', res: 'intel', cost: 35, cd: 26, ttl: 18, radius: 2.3, hotkey: 'W',
    brief: '让一片链路暂时使用旧协议：地面敌人减速、伪装木马显形，敌人会按新的通行速度重新选路。',
    target: 'area'
  },
  restore: {
    id: 'restore', name: '备份还原', en: 'BACKUP RESTORE', res: 'compute', cost: 60, cd: 10, heal: 0.55, hotkey: 'E',
    brief: '恢复一座塔 55% 的最大生命并解除加密。',
    target: 'tower'
  }
};
G.ITEM_ORDER = ['isolator', 'downgrade', 'restore'];

// ---------- 状态 ----------
G.STATUS = {
  reveal: { name: '显形', color: '#ffe066', desc: '检测使伪装或潜伏的目标现身，现身后才能被远程单体攻击选中。来源：沙箱检测、旧链路、被阻挡、蜜网溯源。' },
  shield: { name: '护盾', color: '#a9d6ea', desc: '吸收伤害，先于生命被消耗。来源：加壳器（敌方）、冗余切换（己方）。' },
  encrypt: { name: '加密', color: '#fb53c5', desc: '塔暂时停止攻击、治疗和释放技能，但不解除阻挡或节点隔离。可用冗余切换或备份还原解除。' },
  slow: { name: '减速', color: '#9fd6ea', desc: '移动速度降低。来源：压制脉冲、旧链路、诱捕后的余波。' },
  trap: { name: '诱捕', color: '#b88be6', desc: '被蜜罐诱捕的敌人无法移动，并受到 20% 额外伤害（Boss 免疫）。' },
  harden: { name: '硬化', color: '#f28c3a', desc: '防火墙承受的伤害降低 60%，还击更强。' },
  taint: { name: '污染', color: '#efcb4f', desc: '被二级沙箱命中的敌人在短时间内承受更多伤害。' },
  iso: { name: '隔离', color: '#cfe9e2', desc: '交换节点被塔或隔离器占用后不可通行；撤下、被摧毁或到期后恢复直通。' }
};

// ---------- 地形 ----------
G.TERRAIN = {
  road: { name: '链路', color: '#35514a', desc: '恶意程序与业务流量经过的道路。防火墙和蜜罐可以部署在入口、出口之外的链路上；它们阻挡敌人，但不截断道路。' },
  old: { name: '旧链路', color: '#b5762f', desc: '保留旧协议的道路：经过的地面敌人减速 45%，伪装的木马显形。敌人选路时会把较慢的通行速度计入成本。' },
  node: { name: '交换节点', color: '#6fe0b0', desc: '链路交汇处的网络设备。部署防火墙、网闸或插入应急隔离器会隔离节点，使这一格不能通行；解除隔离后恢复直通，并有短暂的再次隔离间隔。' },
  plat: { name: '设备平台', color: '#8d9279', desc: '部署拦截器、沙箱和修复进程的位置，比链路略高，敌人不能通行。' },
  obs: { name: '障碍', color: '#33423d', desc: '数据设施、公网流和气隙等：不能通行，也不能部署。' },
  entrance: { name: '入口', color: '#5fd3c2', desc: '威胁流量的来源。每个入口都有自己的路线标记，不能在入口格部署防火墙或蜜罐。' },
  exit: { name: '出口', color: '#e8604f', desc: '中枢的数据出口。敌人到达这里，中枢完整度下降。' },
  tunnel: { name: '专线隧道', color: '#8fc4d4', desc: '穿越公网流的专线链路，通行速度正常。' }
};

G.DIFF = [{ name: '常规', hp: 1, res: 1, desc: '标准难度' }, { name: '困难', hp: 1.3, res: 0.85, desc: '敌人生命 ×1.3，初始资源 ×0.85' }, { name: '专家', hp: 1.65, res: 0.7, desc: '敌人生命 ×1.65，初始资源 ×0.7' }];
G.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
G.fmtTime = function (s) { s = Math.max(0, Math.floor(s)); return G.pad2(Math.floor(s / 60)) + ':' + G.pad2(s % 60); };
})(window.G = window.G || {});
