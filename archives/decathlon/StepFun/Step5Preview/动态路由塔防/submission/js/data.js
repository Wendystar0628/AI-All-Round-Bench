/* 游戏数据：地图拓扑、塔、敌人、道具、波次、图鉴文本 */
(function (g) {
'use strict';
const TD = g.TD || (g.TD = {});

/* ============ 塔 ============ */
const TOWERS = {
  firewall: {
    id: 'firewall', name: '防火墙', cls: 'block', clsName: '阻挡', cost: 60, hp: 240,
    onLink: true, onNode: true, blockCap: 2, dmg: 16, atk: 1.15, range: 0,
    color: [0.20, 0.62, 0.95], accent: [0.55, 0.85, 1.0],
    desc: '承受近战攻击，在链路上拦住有限数量的敌人并还击；超过阻挡容量的敌人继续前进。部署在交换节点上时隔离该节点，并拦截相邻链路上的敌人。',
    up: '提升生命与阻挡容量，还击伤害提高。'
  },
  honeypot: {
    id: 'honeypot', name: '蜜罐', cls: 'lure', clsName: '诱敌阻挡', cost: 40, hp: 110,
    onLink: true, onNode: false, blockCap: 3, dmg: 5, atk: 0.8, range: 0, lure: 26,
    color: [0.95, 0.62, 0.20], accent: [1.0, 0.85, 0.45],
    desc: '以伪造应答吸引附近会攻击塔的地面敌人，替其他塔承担攻击；耐久较低，但不会被加密。主动技能“诱捕”能困住被诱来的敌人。',
    up: '提升生命与诱敌范围。',
    branches: [
      { id: 'b1', name: '诱饵矩阵', desc: '诱敌范围大幅提高，被困敌人受到持续伤害。' },
      { id: 'b2', name: '深度诱捕', desc: '诱捕时间延长，被诱敌人攻击速度降低。' }
    ]
  },
  gate: {
    id: 'gate', name: '网闸', cls: 'isolate', clsName: '隔离', cost: 25, hp: 340,
    onLink: false, onNode: true, blockCap: 0, dmg: 0, atk: 0, range: 0,
    color: [0.45, 0.80, 0.55], accent: [0.75, 1.0, 0.85],
    desc: '低成本隔离交换节点，耐久较高，不攻击。用途是控制道路，仍会受到敌人的攻击和破坏。',
    up: '提升生命。'
  },
  interceptor: {
    id: 'interceptor', name: '拦截器', cls: 'ranged', clsName: '远程', cost: 70, hp: 150,
    onLink: false, onNode: false, onPlatform: true, blockCap: 0, dmg: 21, atk: 1.0, range: 36, facing: true,
    color: [0.65, 0.45, 0.95], accent: [0.85, 0.70, 1.0],
    desc: '在朝向决定的攻击区域内进行远程单体攻击，地面与飞行敌人都能打。两个升级分支分别围绕贯穿攻击和压制减速展开。',
    up: '提升伤害、射程与攻击速度。',
    branches: [
      { id: 'b1', name: '贯穿模式', desc: '子弹穿透目标，对其身后直线上的敌人同样造成伤害。' },
      { id: 'b2', name: '压制模式', desc: '命中附带减速，并小幅溅射。' }
    ]
  },
  sandbox: {
    id: 'sandbox', name: '沙箱', cls: 'aoe', clsName: '检测范围', cost: 80, hp: 170,
    onLink: false, onNode: false, onPlatform: true, blockCap: 0, dmg: 15, atk: 0.75, range: 27, detect: 27,
    color: [0.30, 0.85, 0.75], accent: [0.65, 1.0, 0.95],
    desc: '检测范围内伪装或潜伏的目标使其显形，并对地面敌人进行范围攻击，适合处理汇聚的流量。',
    up: '提升伤害、范围与检测范围。'
  },
  repair: {
    id: 'repair', name: '修复进程', cls: 'heal', clsName: '专职治疗', cost: 65, hp: 160,
    onLink: false, onNode: false, onPlatform: true, blockCap: 0, dmg: 0, atk: 0, range: 28, heal: 16,
    color: [0.98, 0.80, 0.35], accent: [1.0, 0.93, 0.65],
    desc: '不攻击敌人，持续恢复范围内其他受损塔的生命。主动技能“冗余切换”为附近友塔提供护盾并解除加密。',
    up: '提升治疗量与范围。',
    skill: { id: 'switch', name: '冗余切换', cd: 26, desc: '为范围内友方塔提供 80 点护盾，并解除其加密状态。' }
  }
};

/* ============ 敌人 ============ */
const ENEMIES = {
  worm: {
    id: 'worm', name: '蠕虫', kind: 'ground', hp: 92, speed: 5.4, size: 2.6,
    dmg: 13, atk: 1.05, bounty: 9, intel: 0,
    color: [0.85, 0.30, 0.35], dark: [0.45, 0.12, 0.16],
    desc: '被阻挡时持续攻击挡住它的塔；首次经过直通的交换节点时复制出同伴，复制出的不再复制。',
    attacks: 'melee', replicate: true
  },
  flood: {
    id: 'flood', name: '洪泛团', kind: 'ground', hp: 300, speed: 3.3, size: 4.6,
    dmg: 26, atk: 0.75, bounty: 18, intel: 2, blockCap: 3,
    color: [0.35, 0.55, 0.95], dark: [0.14, 0.22, 0.5],
    desc: '占用较多阻挡容量。会离开当前行进路线，向附近被隔离节点的可通行一侧移动，重击节点上的塔或隔离器；打通后沿重新开放的道路前进。',
    attacks: 'slam'
  },
  trojan: {
    id: 'trojan', name: '木马', kind: 'ground', hp: 118, speed: 4.7, size: 2.8,
    dmg: 10, atk: 1.0, bounty: 14, intel: 3, disguised: true,
    color: [0.75, 0.75, 0.82], dark: [0.35, 0.36, 0.42],
    desc: '伪装成正常封装数据包，显形前不能被远程单体攻击主动选中；沙箱检测、旧链路和阻挡会使其显形。未显形就被攻击波及消灭时释放载荷，伤害附近的塔。',
    attacks: 'melee'
  },
  ransom: {
    id: 'ransom', name: '勒索者', kind: 'ground', hp: 140, speed: 4.1, size: 3.0,
    dmg: 11, atk: 0.9, bounty: 16, intel: 3, range: 32, encrypt: true,
    color: [0.95, 0.35, 0.75], dark: [0.45, 0.12, 0.35],
    desc: '边移动边从远处攻击射程内的塔，包括平台上的塔，造成伤害并施加加密；会优先攻击射程内的蜜罐。',
    attacks: 'ranged'
  },
  hotspot: {
    id: 'hotspot', name: '伪热点', kind: 'air', hp: 84, speed: 7.4, size: 2.4, fly: 16,
    dmg: 0, atk: 0, bounty: 11, intel: 1,
    color: [0.55, 0.95, 1.0], dark: [0.15, 0.45, 0.55],
    desc: '沿无线层从入口直飞出口，不受地面道路和阻挡影响，由拦截器对付。',
    attacks: 'none'
  },
  packer: {
    id: 'packer', name: '加壳器', kind: 'ground', hp: 220, speed: 3.5, size: 3.6,
    dmg: 8, atk: 0.8, bounty: 20, intel: 4, shieldR: 18, shieldHp: 70,
    color: [0.60, 0.65, 0.35], dark: [0.28, 0.32, 0.14],
    desc: '为附近同伴提供可被打破的护盾，保护成群敌人推进，迫使玩家考虑先处理支援者还是集中攻击前排。',
    attacks: 'melee'
  },
  wanKui: {
    id: 'wanKui', name: '万傀', kind: 'ground', boss: true, hp: 5200, speed: 2.6, size: 9.5,
    dmg: 40, atk: 0.7, bounty: 200, intel: 30, blockCap: 6, armor: 0.15,
    color: [0.75, 0.20, 0.25], dark: [0.30, 0.06, 0.09],
    desc: '僵尸网络群体控制主题的 Boss。“洪峰”冲击被隔离节点，重创塔并冲毁隔离器；生命降低后释放成群蠕虫。',
    bossKind: 'wankui'
  },
  mirage: {
    id: 'mirage', name: '蜃楼', kind: 'ground', boss: true, hp: 6000, speed: 3.0, size: 10.0,
    dmg: 34, atk: 0.8, bounty: 220, intel: 30, blockCap: 5, armor: 0.12,
    color: [0.45, 0.70, 0.95], dark: [0.10, 0.22, 0.45],
    desc: '路由欺骗主题的 Boss。“伪路由”在前方链路制造临时路由黑洞，截断通行、迫使各入口改道；生命降低后发动“路由风暴”，削弱附近塔的护盾。',
    bossKind: 'mirage'
  },
  latent: {
    id: 'latent', name: '蛰影', kind: 'ground', boss: true, hp: 7200, speed: 3.1, size: 10.5,
    dmg: 44, atk: 0.75, bounty: 260, intel: 40, blockCap: 6, armor: 0.2,
    color: [0.55, 0.30, 0.75], dark: [0.20, 0.08, 0.32],
    desc: '攻击组织核心威胁，按“潜伏—提权—破坏”改变阶段：潜伏时需检测才能被远程单体攻击选中，提权后强化护甲并放出木马，破坏阶段锁死前方一段运维环。',
    bossKind: 'latent'
  }
};

/* ============ 道具 ============ */
const ITEMS = {
  isolator: {
    id: 'isolator', name: '应急隔离器', res: 'intel', cost: 18, key: '1',
    dur: 22, hp: 140, target: 'node',
    desc: '临时隔离一个直通交换节点，有耐久和有效期，会被敌人冲毁，不产生情报。',
    icon: 'iso'
  },
  downgrade: {
    id: 'downgrade', name: '协议降级', res: 'intel', cost: 26, key: '2',
    dur: 15, radius: 20, target: 'links',
    desc: '让一片链路暂时使用旧协议，产生旧链路的减速与显形效果，敌人的路线随通行速度变化重新选择。',
    icon: 'down'
  },
  restore: {
    id: 'restore', name: '备份还原', res: 'compute', cost: 35, key: '3',
    heal: 90, target: 'tower',
    desc: '恢复一座塔的部分生命并解除加密。',
    icon: 'res'
  }
};

/* ============ 地图 ============ */
function W(entries, groups, pref, note, assign) {
  return { entries: entries, groups: groups, pref: pref || {}, note: note || '', assign: assign || {} };
}
function G(type, count, gap, entry) { return { type: type, count: count, gap: gap, entry: entry }; }

const MAPS = [
  {
    id: 'm1', name: '分段内网', sub: '企业内网 · 14 波', tag: '企业网',
    desc: '门户与邮件网关接入 DMZ，办公网段与业务网段经 DMZ 互联和一段旧链路相连，外围旧系统网段与灾备环可绕到核心数据库。',
    assign: { A: 'X', B: 'X' },
    env: {
      fog: [0.055, 0.085, 0.13], skyTop: [0.10, 0.16, 0.28], skyBot: [0.035, 0.05, 0.08],
      skyGlow: [0.25, 0.45, 0.75], sunPos: [0.22, 0.86],
      lightDir: [0.42, 0.80, 0.44], lightCol: [1.0, 0.96, 0.90], ambTop: [0.30, 0.36, 0.46], ambBot: [0.10, 0.12, 0.18],
      fogDen: 0.0022, emis: 1.0, shadows: true,
      ground: [0.075, 0.10, 0.15], grid: [0.20, 0.42, 0.62], accent: [0.25, 0.85, 0.95]
    },
    nodes: [
      { id: 'A', x: 22, y: 12, kind: 'entry', name: '门户网站' },
      { id: 'B', x: 140, y: 12, kind: 'entry', name: '邮件网关' },
      { id: 'X', x: 84, y: 106, kind: 'exit', name: '核心数据库' },
      { id: 'w1', x: 34, y: 30, name: '办公网段一', sw: true },
      { id: 'w2', x: 50, y: 48, name: '办公网段二', sw: true },
      { id: 'wb', x: 66, y: 36, name: '西边界节点', sw: true },
      { id: 'd2', x: 84, y: 50, name: 'DMZ 互联', sw: true },
      { id: 'd1', x: 84, y: 18, name: 'DMZ 北', sw: true },
      { id: 'eb', x: 114, y: 18, name: '东边界', sw: true },
      { id: 'e1', x: 128, y: 28, name: '业务网段一', sw: true },
      { id: 'e2', x: 114, y: 48, name: '业务网段二', sw: true },
      { id: 'd3', x: 84, y: 72, name: '核心前节点', sw: true },
      { id: 'l1', x: 8, y: 26, name: '旧系统网段一', sw: true },
      { id: 'l2', x: 8, y: 52, name: '旧系统网段二', sw: true },
      { id: 'l3', x: 8, y: 78, name: '旧系统网段三', sw: true },
      { id: 'r1', x: 28, y: 90, name: '灾备环西', sw: true },
      { id: 'r2', x: 56, y: 104, name: '灾备环南', sw: true },
      { id: 'r3', x: 112, y: 90, name: '灾备环东', sw: true },
      { id: 'e3', x: 130, y: 74, name: '业务外环', sw: true }
    ],
    edges: [
      { a: 'A', b: 'w1' }, { a: 'w1', b: 'w2' }, { a: 'w2', b: 'wb' }, { a: 'wb', b: 'd2' },
      { a: 'd2', b: 'd3' }, { a: 'd3', b: 'X' },
      { a: 'A', b: 'd1' }, { a: 'd1', b: 'eb' }, { a: 'eb', b: 'B' }, { a: 'd1', b: 'd2' },
      { a: 'B', b: 'e1' }, { a: 'e1', b: 'e2' }, { a: 'e2', b: 'd2' },
      { a: 'A', b: 'l1' }, { a: 'l1', b: 'l2' }, { a: 'l2', b: 'l3' },
      { a: 'l3', b: 'r1' }, { a: 'r1', b: 'r2' }, { a: 'r2', b: 'X' },
      { a: 'e2', b: 'e3' }, { a: 'e3', b: 'r3' }, { a: 'r3', b: 'X' }, { a: 'r2', b: 'r3' },
      { a: 'w2', b: 'e2', legacy: true },
      { a: 'wb', b: 'r1' },
      { a: 'l1', b: 'w1', legacy: true },
      { a: 'e1', b: 'eb', legacy: true }
    ],
    pref: { A: ['w1', 'w2', 'wb'], B: ['eb', 'd1'] },
    platforms: [
      { x: 48, y: 24 }, { x: 76, y: 30 }, { x: 100, y: 32 }, { x: 100, y: 62 }, { x: 44, y: 66 },
      { x: 28, y: 72 }, { x: 24, y: 44 }, { x: 148, y: 44 }, { x: 148, y: 68 }, { x: 68, y: 86 },
      { x: 102, y: 88 }, { x: 58, y: 76 }, { x: 126, y: 96 }, { x: 132, y: 62 }, { x: 24, y: 96 },
      { x: 66, y: 60 }, { x: 98, y: 66 }
    ],
    obstacles: [
      { x: 54, y: 6, w: 22, h: 8, kind: 'facility', label: 'DMZ 防火墙集群' },
      { x: 112, y: 4, w: 16, h: 7, kind: 'facility', label: '邮件队列' },
      { x: 16, y: 64, w: 12, h: 10, kind: 'facility', label: '旧系统机房' },
      { x: 146, y: 58, w: 12, h: 10, kind: 'facility', label: '业务机房' },
      { x: 46, y: 86, w: 12, h: 8, kind: 'facility', label: '灾备存储' },
      { x: 114, y: 72, w: 12, h: 8, kind: 'facility', label: '灾备存储' },
      { x: 84, y: 120, w: 28, h: 10, kind: 'facility', label: '核心数据库机房' },
      { x: 14, y: 100, w: 12, h: 10, kind: 'facility', label: '旧系统机房' },
      { x: 146, y: 22, w: 12, h: 7, kind: 'facility', label: '反垃圾网关' }
    ],
    waves: [
      W(['A'], [G('worm', 4, 1.4)], {}, '办公网段出现蠕虫'),
      W(['A', 'B'], [G('worm', 3, 1.2), G('worm', 3, 1.2)], {}, '邮件网关加入'),
      W(['A', 'B'], [G('trojan', 3, 1.6), G('worm', 3, 1.1)], {}, '出现伪装数据包'),
      W(['B'], [G('ransom', 2, 2.0), G('worm', 4, 1.0)], { B: ['e1', 'e2'] }, '勒索者远程压制'),
      W(['A', 'B'], [G('packer', 1, 1.0), G('worm', 5, 0.9)], {}, '加壳器保护同伴'),
      W(['A'], [G('hotspot', 4, 1.1)], {}, '伪热点直飞出口'),
      W(['A', 'B'], [G('worm', 6, 0.8), G('trojan', 3, 1.4)], {}, '混合流量'),
      W(['B'], [G('flood', 2, 3.0), G('worm', 4, 1.0)], { A: ['l1', 'l2', 'l3'] }, '洪泛团冲击节点'),
      W(['A', 'B'], [G('ransom', 3, 1.6), G('packer', 2, 2.0)], {}, '远程与护盾'),
      W(['A', 'B'], [G('hotspot', 6, 0.8), G('worm', 6, 0.8)], {}, '空中与地面'),
      W(['A', 'B'], [G('flood', 3, 2.4), G('trojan', 4, 1.2)], { A: ['l1', 'l2', 'l3'], B: ['e1', 'e2', 'e3'] }, '洪峰前压'),
      W(['A', 'B'], [G('worm', 10, 0.6), G('packer', 3, 1.6)], {}, '大规模推进'),
      W(['A', 'B'], [G('ransom', 4, 1.2), G('flood', 3, 2.2), G('hotspot', 5, 0.9)], {}, '三线并进'),
      W(['A', 'B'], [G('wanKui', 1, 1.0), G('worm', 8, 1.0), G('packer', 2, 2.0)], {}, '万傀登场')
    ]
  },
  {
    id: 'm2', name: '骨干流域', sub: '跨网专线与双活数据中心 · 15 波', tag: '跨网骨干',
    desc: '互联网、分支专线与云端互联通向互为备份的数据中心 X、Y。公网流横贯战场，专线隧道与旧专线构成不同的跨越点。',
    assign: { A: 'X', C: 'Y', B: 'Y' },
    env: {
      fog: [0.06, 0.06, 0.11], skyTop: [0.13, 0.11, 0.24], skyBot: [0.05, 0.04, 0.09],
      skyGlow: [0.55, 0.35, 0.85], sunPos: [0.78, 0.84],
      lightDir: [0.38, 0.82, 0.42], lightCol: [1.0, 0.94, 0.88], ambTop: [0.28, 0.26, 0.40], ambBot: [0.09, 0.08, 0.16],
      fogDen: 0.0021, emis: 1.15, shadows: true,
      ground: [0.07, 0.065, 0.12], grid: [0.35, 0.28, 0.62], accent: [0.75, 0.45, 1.0]
    },
    nodes: [
      { id: 'A', x: 24, y: 14, kind: 'entry', name: '互联网' },
      { id: 'B', x: 168, y: 14, kind: 'entry', name: '云端互联' },
      { id: 'C', x: 24, y: 104, kind: 'entry', name: '分支专线' },
      { id: 'X', x: 56, y: 126, kind: 'exit', name: '数据中心 X' },
      { id: 'Y', x: 120, y: 126, kind: 'exit', name: '数据中心 Y' },
      { id: 'an1', x: 56, y: 26, name: '北段一', sw: true },
      { id: 'tu1', x: 56, y: 61, name: '专线隧道一', sw: true },
      { id: 'wv2', x: 56, y: 92, name: '西下节点', sw: true },
      { id: 'mn1', x: 88, y: 26, name: '旧专线北', sw: true },
      { id: 'lc', x: 88, y: 61, name: '旧专线跨越', sw: true },
      { id: 'ms1', x: 88, y: 92, name: '旧专线南', sw: true },
      { id: 'en1', x: 120, y: 26, name: '北段三', sw: true },
      { id: 'tu2', x: 120, y: 61, name: '专线隧道二', sw: true },
      { id: 'es1', x: 120, y: 92, name: '东下节点', sw: true },
      { id: 'sb1', x: 56, y: 104, name: '南汇西', sw: true },
      { id: 'sb2', x: 88, y: 104, name: '南汇中', sw: true },
      { id: 'hub', x: 120, y: 104, name: '汇聚节点', sw: true },
      { id: 'cv1', x: 24, y: 122, name: '专线南支' },
      { id: 'bn1', x: 168, y: 84, name: '东绕节点' }
    ],
    edges: [
      { a: 'A', b: 'an1' }, { a: 'an1', b: 'mn1' }, { a: 'mn1', b: 'en1' }, { a: 'en1', b: 'B' },
      { a: 'A', b: 'mn1' },
      { a: 'an1', b: 'tu1', tunnel: true }, { a: 'tu1', b: 'wv2', tunnel: true }, { a: 'wv2', b: 'sb1' }, { a: 'sb1', b: 'X' },
      { a: 'mn1', b: 'lc', tunnel: true, legacy: true }, { a: 'lc', b: 'ms1', tunnel: true, legacy: true }, { a: 'ms1', b: 'sb2' },
      { a: 'en1', b: 'tu2', tunnel: true }, { a: 'tu2', b: 'es1', tunnel: true }, { a: 'es1', b: 'hub' },
      { a: 'sb1', b: 'sb2', legacy: true }, { a: 'sb2', b: 'hub' }, { a: 'hub', b: 'Y' },
      { a: 'C', b: 'sb1' }, { a: 'C', b: 'cv1' }, { a: 'cv1', b: 'X' },
      { a: 'B', b: 'bn1' }, { a: 'bn1', b: 'hub' }
    ],
    pref: { A: ['an1', 'tu1'], B: ['en1', 'tu2'], C: ['sb1'] },
    platforms: [
      { x: 50, y: 40 }, { x: 64, y: 40 }, { x: 80, y: 40 }, { x: 96, y: 40 }, { x: 112, y: 40 }, { x: 128, y: 40 },
      { x: 50, y: 80 }, { x: 64, y: 80 }, { x: 80, y: 80 }, { x: 96, y: 80 }, { x: 112, y: 80 }, { x: 128, y: 80 },
      { x: 34, y: 38 }, { x: 140, y: 38 }, { x: 34, y: 82 }, { x: 140, y: 82 }, { x: 24, y: 36 }, { x: 150, y: 36 },
      { x: 48, y: 38 }, { x: 64, y: 38 }, { x: 80, y: 38 }, { x: 96, y: 38 }, { x: 112, y: 38 }, { x: 128, y: 38 },
      { x: 40, y: 116 }, { x: 132, y: 118 }
    ],
    obstacles: [
      { x: 27, y: 59, w: 34, h: 26, kind: 'public', label: '公网流' },
      { x: 73, y: 59, w: 10, h: 26, kind: 'public', label: '公网流' },
      { x: 103, y: 59, w: 10, h: 26, kind: 'public', label: '公网流' },
      { x: 145, y: 59, w: 30, h: 26, kind: 'public', label: '公网流' },
      { x: 8, y: 14, w: 12, h: 12, kind: 'facility', label: '接入路由器' },
      { x: 176, y: 14, w: 12, h: 12, kind: 'facility', label: '云接入' },
      { x: 8, y: 104, w: 12, h: 12, kind: 'facility', label: '专线接入' },
      { x: 40, y: 138, w: 24, h: 10, kind: 'facility', label: '数据中心 X 机房' },
      { x: 104, y: 138, w: 24, h: 10, kind: 'facility', label: '数据中心 Y 机房' },
      { x: 162, y: 110, w: 12, h: 10, kind: 'facility', label: '东绕机房' }
    ],
    waves: [
      W(['A'], [G('worm', 5, 1.2)], {}, '北段出现蠕虫'),
      W(['A', 'C'], [G('worm', 4, 1.1), G('worm', 4, 1.1)], {}, '分支专线加入'),
      W(['C'], [G('trojan', 4, 1.4), G('worm', 3, 1.1)], { C: ['sb2', 'hub'] }, '伪装数据包'),
      W(['A', 'C'], [G('ransom', 3, 1.6), G('worm', 5, 1.0)], {}, '勒索者压制'),
      W(['A', 'C', 'B'], [G('worm', 6, 0.9), G('worm', 6, 0.9), G('worm', 5, 1.0)], {}, '洪峰：三入口同时出兵'),
      W(['B'], [G('flood', 2, 3.0), G('worm', 4, 1.0)], {}, '云端互联洪泛团'),
      W(['A', 'C'], [G('hotspot', 6, 0.9), G('worm', 5, 0.9)], {}, '无线层伪热点'),
      W(['A', 'C'], [G('packer', 3, 1.6), G('worm', 6, 0.9)], {}, '加壳器成群推进'),
      W(['C', 'B'], [G('flood', 3, 2.4), G('trojan', 4, 1.2)], {}, '冲击汇聚节点'),
      W(['A', 'C'], [G('ransom', 4, 1.3), G('hotspot', 6, 0.8)], {}, '远程与空中'),
      W(['A'], [G('worm', 8, 0.7), G('packer', 3, 1.5)], { A: ['mn1', 'lc', 'ms1', 'sb2', 'hub'] }, '互联网改走旧专线', { A: 'Y' }),
      W(['A', 'C', 'B'], [G('worm', 8, 0.7), G('packer', 3, 1.5), G('trojan', 4, 1.1)], {}, '洪峰：三入口压力'),
      W(['A'], [G('flood', 4, 2.0), G('worm', 6, 0.8)], {}, '北段冲击'),
      W(['C', 'B'], [G('ransom', 5, 1.1), G('flood', 3, 2.0)], {}, '南线压制'),
      W(['A', 'C', 'B'], [G('mirage', 1, 1.0), G('ransom', 4, 1.4), G('worm', 8, 0.9)], {}, '蜃楼登场')
    ]
  },
  {
    id: 'm3', name: '气隙深层', sub: '工控网络 · 16 波', tag: '工控网',
    desc: '运维跳板机、办公网下行与供应商远程维护围绕中央气隙接入，出口是过程控制核心 X 与安全联锁核心 Y。运维环绕过气隙连通南北，老工控总线组成较慢的支路。',
    assign: { A: 'X', B: 'Y', C: 'Y' },
    env: {
      fog: [0.075, 0.065, 0.05], skyTop: [0.18, 0.14, 0.10], skyBot: [0.06, 0.05, 0.04],
      skyGlow: [0.85, 0.55, 0.25], sunPos: [0.5, 0.88],
      lightDir: [0.40, 0.78, 0.48], lightCol: [1.0, 0.92, 0.80], ambTop: [0.32, 0.28, 0.22], ambBot: [0.11, 0.09, 0.07],
      fogDen: 0.0024, emis: 1.1, shadows: true,
      ground: [0.09, 0.08, 0.065], grid: [0.55, 0.42, 0.22], accent: [1.0, 0.65, 0.25]
    },
    nodes: [
      { id: 'A', x: 18, y: 18, kind: 'entry', name: '运维跳板机' },
      { id: 'B', x: 18, y: 62, kind: 'entry', name: '办公网下行' },
      { id: 'C', x: 18, y: 106, kind: 'entry', name: '供应商远程维护' },
      { id: 'X', x: 150, y: 26, kind: 'exit', name: '过程控制核心 X' },
      { id: 'Y', x: 150, y: 94, kind: 'exit', name: '安全联锁核心 Y' },
      { id: 'r1', x: 46, y: 16, name: '运维环北一', sw: true },
      { id: 'r2', x: 82, y: 10, name: '运维环北二', sw: true },
      { id: 'r3', x: 116, y: 18, name: '运维环北三', sw: true },
      { id: 'wa', x: 30, y: 42, name: '西汇聚上', sw: true },
      { id: 'wb', x: 30, y: 82, name: '西汇聚下', sw: true },
      { id: 'e1', x: 140, y: 40, name: '东通道上', sw: true },
      { id: 'e2', x: 140, y: 80, name: '东通道下', sw: true },
      { id: 's1', x: 46, y: 110, name: '运维环南一', sw: true },
      { id: 's2', x: 82, y: 116, name: '运维环南二', sw: true },
      { id: 's3', x: 116, y: 106, name: '运维环南三', sw: true },
      { id: 'bus1', x: 52, y: 74, name: '老工控总线一' },
      { id: 'bus2', x: 110, y: 74, name: '老工控总线二' },
      { id: 'bus3', x: 82, y: 96, name: '老工控总线三' }
    ],
    edges: [
      { a: 'A', b: 'r1' }, { a: 'r1', b: 'r2' }, { a: 'r2', b: 'r3' }, { a: 'r3', b: 'e1' }, { a: 'e1', b: 'X' },
      { a: 'A', b: 'wa' }, { a: 'wa', b: 'wb' }, { a: 'B', b: 'wa' }, { a: 'B', b: 'wb' },
      { a: 'C', b: 's1' }, { a: 's1', b: 's2' }, { a: 's2', b: 's3' }, { a: 's3', b: 'e2' }, { a: 'e2', b: 'Y' },
      { a: 'r3', b: 's3' }, { a: 'e1', b: 'e2' },
      { a: 'wa', b: 'bus1' }, { a: 'bus1', b: 'bus2' }, { a: 'bus2', b: 'e2' },
      { a: 'bus1', b: 'bus3' }, { a: 'bus3', b: 's2' }, { a: 'bus2', b: 's3' },
      { a: 'bus1', b: 'bus2', legacy: true }, { a: 'bus3', b: 's2', legacy: true }, { a: 'wb', b: 'bus3', legacy: true },
      { a: 'wb', b: 's1' }, { a: 'C', b: 'wb' }
    ],
    pref: { A: ['r1', 'r2', 'r3', 'e1'], B: ['wa', 'bus1', 'bus2'], C: ['s1', 's2', 's3'] },
    platforms: [
      { x: 34, y: 30 }, { x: 62, y: 28 }, { x: 96, y: 26 }, { x: 124, y: 30 }, { x: 34, y: 56 },
      { x: 34, y: 96 }, { x: 62, y: 108 }, { x: 96, y: 112 }, { x: 124, y: 100 }, { x: 124, y: 58 },
      { x: 18, y: 42 }, { x: 18, y: 82 }, { x: 60, y: 60 }, { x: 104, y: 62 }, { x: 82, y: 84 },
      { x: 152, y: 56 }, { x: 152, y: 70 }, { x: 44, y: 66 }, { x: 118, y: 66 }, { x: 66, y: 90 },
      { x: 96, y: 90 }, { x: 32, y: 26 }, { x: 68, y: 20 }, { x: 96, y: 20 }, { x: 40, y: 120 }
    ],
    obstacles: [
      { x: 82, y: 58, w: 34, h: 26, r: 15, kind: 'airgap', label: '中央气隙' },
      { x: 6, y: 30, w: 12, h: 14, kind: 'facility', label: '跳板机柜' },
      { x: 6, y: 92, w: 12, h: 14, kind: 'facility', label: '办公交换机' },
      { x: 6, y: 118, w: 12, h: 14, kind: 'facility', label: '供应商网关' },
      { x: 160, y: 34, w: 14, h: 16, kind: 'facility', label: '过程控制机柜' },
      { x: 160, y: 100, w: 14, h: 16, kind: 'facility', label: '联锁机柜' },
      { x: 46, y: 130, w: 18, h: 10, kind: 'facility', label: '工控总线桥' },
      { x: 118, y: 130, w: 18, h: 10, kind: 'facility', label: '工控总线桥' }
    ],
    waves: [
      W(['A'], [G('worm', 5, 1.1)], {}, '运维环出现蠕虫'),
      W(['A', 'B'], [G('worm', 4, 1.0), G('worm', 4, 1.0)], {}, '办公网下行加入'),
      W(['C'], [G('trojan', 4, 1.3), G('worm', 3, 1.1)], { C: ['bus3', 's2'] }, '供应商维护通道'),
      W(['A', 'B'], [G('ransom', 3, 1.5), G('worm', 5, 1.0)], {}, '勒索者压制平台'),
      W(['B', 'C'], [G('worm', 7, 0.8), G('worm', 6, 0.9)], {}, '南线推进'),
      W(['A'], [G('hotspot', 6, 0.9), G('worm', 4, 1.0)], {}, '无线层伪热点'),
      W(['A', 'B', 'C'], [G('worm', 7, 0.8), G('worm', 6, 0.9), G('worm', 6, 0.9)], {}, '洪峰：三入口同时出兵'),
      W(['C'], [G('flood', 3, 2.2), G('worm', 5, 1.0)], {}, '洪泛团冲击南环'),
      W(['A', 'B'], [G('packer', 3, 1.5), G('worm', 7, 0.8)], {}, '加壳器成群'),
      W(['A', 'C'], [G('hotspot', 7, 0.8), G('trojan', 4, 1.2)], {}, '空中与伪装'),
      W(['B', 'C'], [G('ransom', 4, 1.2), G('flood', 3, 2.0)], { B: ['wb', 's1', 's2', 's3'] }, '南线压制'),
      W(['A', 'B', 'C'], [G('worm', 9, 0.7), G('packer', 3, 1.4), G('trojan', 5, 1.0)], {}, '洪峰：三入口压力'),
      W(['A', 'C'], [G('flood', 4, 1.8), G('ransom', 4, 1.2)], {}, '双线冲击'),
      W(['A', 'B', 'C'], [G('hotspot', 9, 0.7), G('worm', 10, 0.6)], {}, '全线压境'),
      W(['A', 'B'], [G('worm', 12, 0.55), G('packer', 4, 1.2)], {}, '运维环重压'),
      W(['A', 'B', 'C'], [G('latent', 1, 1.0), G('trojan', 6, 1.0), G('worm', 10, 0.7)], {}, '蛰影现身')
    ]
  }
];

/* ============ 图鉴文本 ============ */
const CODEX = {
  terrain: [
    { id: 'link', name: '链路', desc: '恶意程序与业务流量经过的道路。防火墙和蜜罐可以部署在入口、出口之外的链路上；它们阻挡敌人，但不截断这条道路。' },
    { id: 'platform', name: '设备平台', desc: '部署远程和修复支援塔的位置，与链路有高低区别，敌人不能通行。' },
    { id: 'obstacle', name: '障碍', desc: '数据设施、公网流和气隙等，不能通行，也不能部署。' },
    { id: 'node', name: '交换节点', desc: '链路交汇处的网络设备。部署防火墙、网闸或插入应急隔离器，会隔离节点，使这一格不能通行；解除隔离后恢复直通。' },
    { id: 'legacy', name: '旧链路', desc: '保留旧协议的道路，经过的地面敌人减速，伪装的木马显形。敌人选择路线时也会考虑其较慢的通行速度。' }
  ],
  status: [
    { id: 'encrypt', name: '加密', desc: '塔暂时停止攻击、治疗和释放技能，但不解除阻挡或节点隔离。使用备份还原或修复进程的“冗余切换”可解除。' },
    { id: 'shield', name: '护盾', desc: '吸收伤害，先于生命被消耗。加壳器为同伴提供可被打破的护盾；修复进程的“冗余切换”可为友塔添加护盾。' },
    { id: 'detect', name: '检测', desc: '使伪装或潜伏的目标显形。显形后的木马才能被远程单体攻击主动选中。' },
    { id: 'slow', name: '减速', desc: '来自旧链路、协议降级与拦截器压制模式，降低地面敌人的移动速度。' },
    { id: 'trap', name: '诱捕', desc: '蜜罐技能，被困敌人无法移动与攻击，持续受到伤害。' }
  ]
};

TD.DATA = { TOWERS, ENEMIES, ITEMS, MAPS, CODEX };
})(typeof window !== 'undefined' ? window : globalThis);

