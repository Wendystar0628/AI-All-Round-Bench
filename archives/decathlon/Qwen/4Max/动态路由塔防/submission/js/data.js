/* 动态路由塔防 —— 数据定义（塔 / 敌人 / 道具 / 地图 / 波次 / 图鉴）
 * 经典脚本，兼容 file:// 打开；同时导出供 Node 校验。 */
(function (root) {
  'use strict';
  const ND = root.ND = root.ND || {};

  // ---- 格子类型 ----
  // '.' 虚空  '#' 障碍  '=' 链路  '-' 旧链路  'o' 交换节点  'P' 设备平台
  // 'A'/'B'/'C' 入口  'X'/'Y' 出口
  ND.CELL = { VOID: 0, OBSTACLE: 1, LINK: 2, LEGACY: 3, NODE: 4, PLATFORM: 5, ENTRY: 6, EXIT: 7 };
  ND.LEGACY_COST = 2.4;      // 旧链路通行代价（寻路权重）
  ND.LEGACY_SPEED = 0.45;    // 旧链路速度倍率

  // ---- 入口 / 出口 配色（路线标记） ----
  ND.ENTRY_COLORS = { A: 0x35d6ff, B: 0x7dff6a, C: 0xffb13d };
  ND.EXIT_COLORS = { X: 0xff5d7a, Y: 0xc07dff };

  // ================= 塔 =================
  ND.TOWERS = {
    firewall: {
      id: 'firewall', name: '防火墙', role: '阻挡', icon: 'shield',
      cost: 60, hp: 280, place: ['link', 'node'],
      block: 2, dmg: 13, rate: 0.8, range: 1.1,
      desc: '在链路上拦住有限数量的敌人并还击；部署在交换节点上会隔离该节点，并拦截相邻链路上的敌人。超过阻挡容量的敌人会继续前进。',
      lv2: { cost: 70, hp: 420, block: 3, dmg: 20, name: '强化防火墙' },
      detail: '阻挡不改变道路通行状态。被阻挡的近战敌人会攻击防火墙。节点被摧毁或撤下后旁路直通。'
    },
    honeypot: {
      id: 'honeypot', name: '蜜罐', role: '诱敌', icon: 'honeypot',
      cost: 45, hp: 150, place: ['link'],
      block: 2, taunt: 3.6, dmg: 0, rate: 1,
      desc: '以伪造应答吸引附近会攻击塔的地面敌人，替其他塔承担攻击。耐久较低，但不会被加密。',
      skill: { id: 'trap', name: '诱捕', cd: 12, desc: '困住当前被诱来的敌人 3 秒。' },
      branches: {
        deep: { name: '深网诱饵', intel: 35, cost: 55, hp: 300, taunt: 5.2, block: 3, desc: '大幅提升耐久与诱敌半径，阻挡容量 +1。' },
        sticky: { name: '粘滞蜜网', intel: 35, cost: 55, hp: 190, taunt: 4.2, dot: 7, desc: '被诱来的敌人持续受损，诱捕控制延长到 4.5 秒。' }
      },
      detail: '蜜罐免疫加密。勒索者优先攻击射程内的蜜罐。'
    },
    airgap: {
      id: 'airgap', name: '网闸', role: '隔离', icon: 'gate',
      cost: 30, hp: 340, place: ['node'],
      block: 0, dmg: 0,
      desc: '低成本隔离交换节点，耐久较高，不攻击。用于控制道路，仍会被敌人攻击和破坏。',
      lv2: { cost: 55, hp: 560, armor: 0.3, name: '强化网闸' },
      detail: '被摧毁后节点旁路直通，道路重新打开，并有短暂的再次隔离间隔。'
    },
    interceptor: {
      id: 'interceptor', name: '拦截器', role: '远程', icon: 'turret',
      cost: 80, hp: 160, place: ['platform'],
      dmg: 24, rate: 0.85, range: 4.6, sector: 130, facing: true,
      desc: '在朝向决定的扇形区域内进行远程单体攻击，可打击地面与飞行目标。部署时设定朝向。',
      branches: {
        pierce: { name: '贯穿阵列', intel: 35, cost: 65, dmg: 34, rate: 1.15, pierce: true, desc: '攻击贯穿一条直线上的所有敌人。' },
        suppress: { name: '压制阵列', intel: 35, cost: 65, dmg: 18, rate: 0.6, slow: 0.45, slowDur: 1.6, desc: '射速更快，命中使敌人减速 45%。' }
      },
      detail: '无法主动选中未显形的伪装目标。优先攻击沿路线离出口最近的目标。'
    },
    sandbox: {
      id: 'sandbox', name: '沙箱', role: '检测', icon: 'sandbox',
      cost: 90, hp: 160, place: ['platform'],
      dmg: 15, rate: 1.4, range: 3.2, detect: 3.4, aoe: true,
      desc: '检测范围内伪装或潜伏的目标使其显形，并对地面敌人进行范围攻击，适合处理汇聚的流量。',
      lv2: { cost: 80, hp: 230, dmg: 23, range: 4.0, detect: 4.4, mark: true, name: '深度沙箱' },
      detail: '范围攻击可波及未显形的伪装目标；未显形就被消灭的木马会释放载荷伤害附近的塔。深度解析使被显形的目标受到额外伤害。'
    },
    repair: {
      id: 'repair', name: '修复进程', role: '支援', icon: 'repair',
      cost: 70, hp: 150, place: ['platform'],
      heal: 11, range: 3.6,
      desc: '不攻击敌人，持续恢复范围内其他受损塔的生命。',
      skill: { id: 'failover', name: '冗余切换', cd: 18, desc: '为附近友塔提供护盾并解除加密，持续 6 秒。' },
      lv2: { cost: 75, hp: 220, heal: 19, range: 4.6, shield: 150, name: '集群修复' },
      detail: '加密会使修复进程停止治疗。冗余切换是维持关键节点防守的手段。'
    }
  };
  ND.TOWER_ORDER = ['firewall', 'honeypot', 'airgap', 'interceptor', 'sandbox', 'repair'];

  // ================= 敌人 =================
  ND.ENEMIES = {
    worm: {
      id: 'worm', name: '蠕虫', hp: 60, speed: 1.5, reward: 6, dmg: 9, rate: 0.9, flying: false,
      color: 0x8aff4d, desc: '被阻挡时持续攻击挡住它的塔。首次经过直通的交换节点时复制出一个同伴（复制出的不再复制）。'
    },
    flood: {
      id: 'flood', name: '洪泛团', hp: 150, speed: 1.05, reward: 12, dmg: 26, rate: 1.1, flying: false,
      blockCost: 2, color: 0x6a7dff, elite: true,
      desc: '占用较多阻挡容量。会冲向附近被隔离节点的可通行一侧，重击节点上的塔或隔离器；打通后沿重新开放的道路前进。'
    },
    trojan: {
      id: 'trojan', name: '木马', hp: 70, speed: 1.7, reward: 9, dmg: 7, rate: 1.0, flying: false,
      disguised: true, color: 0xff4dd8, payload: 22,
      desc: '伪装成正常数据包，显形前不能被远程单体攻击主动选中。沙箱检测、旧链路和阻挡会使其显形。未显形就被波及消灭时释放载荷伤害附近的塔。'
    },
    ransom: {
      id: 'ransom', name: '勒索者', hp: 110, speed: 1.15, reward: 14, dmg: 12, rate: 1.6, flying: false,
      range: 3.6, encrypt: 3.5, color: 0xff5d3d, elite: true,
      desc: '边移动边从远处攻击射程内的塔（含平台塔），造成伤害并施加加密。优先攻击射程内的蜜罐。'
    },
    ap: {
      id: 'ap', name: '伪热点', hp: 80, speed: 1.9, reward: 11, flying: true,
      color: 0xffd23d, desc: '沿无线层从入口直飞出口，不受地面道路和阻挡影响，由拦截器对付。'
    },
    packer: {
      id: 'packer', name: '加壳器', hp: 130, speed: 1.2, reward: 13, shield: 60, radius: 2.6, flying: false,
      color: 0xffa63d, elite: true, desc: '为附近同伴提供可被打破的护盾，保护成群敌人推进。'
    },
  };
  ND.ENEMIES.boss1 = {
    id: 'boss1', name: '万傀', hp: 2600, speed: 0.7, reward: 120, dmg: 40, rate: 1.2, flying: false,
    boss: true, color: 0xb0ff4d, blockCost: 3,
    desc: '僵尸网络的群体控制核心。“洪峰”冲击被隔离节点，重创塔并冲毁隔离器；生命降低后释放成群蠕虫。'
  };
  ND.ENEMIES.boss2 = {
    id: 'boss2', name: '蜃楼', hp: 3000, speed: 0.65, reward: 140, dmg: 30, rate: 1.3, flying: false,
    boss: true, color: 0x7de3ff, blockCost: 3,
    desc: '路由欺骗的化身。“伪路由”在前方链路制造临时路由黑洞截断通行；生命降低后发动“路由风暴”削弱附近塔的护盾。'
  };
  ND.ENEMIES.boss3 = {
    id: 'boss3', name: '蛰影', hp: 3600, speed: 0.6, reward: 160, dmg: 34, rate: 1.2, flying: false,
    boss: true, color: 0xff3d6a, blockCost: 3, stealth: true,
    desc: '攻击组织的核心威胁。按“潜伏—提权—破坏”改变阶段：潜伏需检测才能被单体选中；提权后强化护甲并放出木马；破坏阶段锁死前方一段运维环。'
  };
  ND.ENEMY_ORDER = ['worm', 'trojan', 'flood', 'ransom', 'ap', 'packer', 'boss1', 'boss2', 'boss3'];

  // ================= 道具 =================
  ND.ITEMS = {
    isolator: {
      id: 'isolator', name: '应急隔离器', res: 'intel', cost: 25, cd: 10, target: 'node',
      hp: 180, duration: 20, icon: 'isolator',
      desc: '临时隔离一个直通节点，有耐久和有效期，会被敌人冲毁。不产生情报。'
    },
    downgrade: {
      id: 'downgrade', name: '协议降级', res: 'intel', cost: 30, cd: 14, target: 'link', radius: 2.6,
      duration: 15, icon: 'downgrade',
      desc: '让一片链路暂时使用旧协议，产生旧链路的减速和显形效果，敌人的路线随通行速度变化重新选择。'
    },
    restore: {
      id: 'restore', name: '备份还原', res: 'compute', cost: 50, cd: 8, target: 'tower',
      healPct: 0.4, icon: 'restore',
      desc: '恢复一座塔的部分生命并解除加密。'
    }
  };
  ND.ITEM_ORDER = ['isolator', 'downgrade', 'restore'];

  // ================= 地图 =================
  // 每格一个字符。地图围绕不同网络的业务关系布局。
  ND.MAPS = [
    {
      id: 'intranet', name: '分段内网', sub: '企业网 · 14 波', waves: 14, boss: 'boss1',
      theme: 'corporate',
      brief: '门户网站与邮件网关接入 DMZ，南端是核心数据库。办公网段与业务网段经 DMZ 互联和一段旧链路相连，外围旧系统网段与灾备环也能绕到核心。',
      entries: { A: '门户网站', B: '邮件网关' }, exits: { X: '核心数据库' },
      startCompute: 190, startIntel: 30, integrity: 20,
      grid: [
        '...A===========B...',
        '...=.....-.....=...',
        '.--o=====o=====o--.',
        '.-.=.....=.....=.-.',
        '.-.=..P..=..P..=.-.',
        '.--------o--------.',
        '.-.=.....=.....=.-.',
        '.-.=..P..=..P..=.-.',
        '.--======o======--.',
        '.-.......=.......-.',
        '.-...P...=...P...-.',
        '.--------=--------.',
        '.........X.........'
      ]
    },
    {
      id: 'backbone', name: '骨干流域', sub: '跨网专线 · 15 波', waves: 15, boss: 'boss2',
      theme: 'backbone',
      brief: '互联网、分支专线与云端互联通向互为备份的数据中心 X、Y。公网流横贯战场，专线隧道与旧专线构成不同的跨越点。',
      entries: { A: '互联网', C: '分支专线', B: '云端互联' }, exits: { X: '数据中心 X', Y: '数据中心 Y' },
      startCompute: 210, startIntel: 35, integrity: 20,
      grid: [
        '.........C.........',
        '.........=.........',
        '.A===============B.',
        '.=.P.=...=.........',
        '.=.P.=.P.=.........',
        '.o-------o.........',
        '.=.P.=.P.=.........',
        '.=.##=###-###......',
        '.=.P.=.P.=.........',
        '.o=======o========.',
        '..P.=..P...P.=.....',
        '..P.=..P...P.=.....',
        '....X........Y.....'
      ]
    },
    {
      id: 'airgap', name: '气隙深层', sub: '工控网 · 16 波', waves: 16, boss: 'boss3',
      theme: 'industrial',
      brief: '运维跳板机、办公网下行与供应商远程维护围绕中央气隙接入，出口是过程控制核心 X 与安全联锁核心 Y。运维环绕过气隙连通南北，老工控总线组成较慢的支路。',
      entries: { A: '运维跳板机', B: '办公网下行', C: '供应商远程维护' }, exits: { X: '过程控制核心', Y: '安全联锁核心' },
      startCompute: 230, startIntel: 40, integrity: 22,
      grid: [
        '...A.....C.....B...',
        '...=.....=.....=...',
        '...=P....=....P=...',
        '...=.....=.....=...',
        '...=..o======..=...',
        '...=P.=#####=..=P..',
        '...=..=#####=..=...',
        '...===o#####=--=...',
        '...o..=#####=..o...',
        '...=P.=#####=..=P..',
        '...=============...',
        '...=..P.....P..=...',
        '...X...........Y...'
      ]
    }
  ];

  // ================= 波次 =================
  // 每波 = 若干 spawn 组 {e:入口, t:类型, n:数量, gap:间隔, delay:延迟}
  function W(list) { return list; }
  ND.WAVES = {
    intranet: [
      W([{ e: 'A', t: 'worm', n: 5, gap: 1.1 }]),
      W([{ e: 'B', t: 'worm', n: 6, gap: 1.0 }]),
      W([{ e: 'A', t: 'worm', n: 5, gap: 0.9 }, { e: 'B', t: 'trojan', n: 3, gap: 1.4, delay: 2 }]),
      W([{ e: 'A', t: 'flood', n: 3, gap: 1.6 }, { e: 'B', t: 'worm', n: 6, gap: 0.8, delay: 1 }]),
      W([{ e: 'B', t: 'ap', n: 4, gap: 1.2 }, { e: 'A', t: 'worm', n: 6, gap: 0.8 }]),
      W([{ e: 'A', t: 'ransom', n: 3, gap: 1.8 }, { e: 'B', t: 'trojan', n: 5, gap: 1.0, delay: 2 }]),
      W([{ e: 'A', t: 'worm', n: 8, gap: 0.6 }, { e: 'B', t: 'flood', n: 3, gap: 1.6, delay: 3 }]),
      W([{ e: 'B', t: 'packer', n: 2, gap: 2.2 }, { e: 'B', t: 'worm', n: 7, gap: 0.7, delay: 1 }, { e: 'A', t: 'ap', n: 3, gap: 1.2, delay: 4 }]),
      W([{ e: 'A', t: 'ransom', n: 4, gap: 1.4 }, { e: 'B', t: 'trojan', n: 6, gap: 0.9, delay: 2 }]),
      W([{ e: 'A', t: 'flood', n: 4, gap: 1.4 }, { e: 'B', t: 'ransom', n: 3, gap: 1.6, delay: 3 }, { e: 'A', t: 'worm', n: 6, gap: 0.6, delay: 5 }]),
      W([{ e: 'B', t: 'packer', n: 3, gap: 1.8 }, { e: 'A', t: 'trojan', n: 7, gap: 0.8, delay: 1 }, { e: 'B', t: 'ap', n: 4, gap: 1.1, delay: 4 }]),
      W([{ e: 'A', t: 'ransom', n: 4, gap: 1.2 }, { e: 'B', t: 'flood', n: 4, gap: 1.3, delay: 2 }, { e: 'A', t: 'worm', n: 8, gap: 0.5, delay: 4 }]),
      W([{ e: 'A', t: 'packer', n: 2, gap: 2 }, { e: 'B', t: 'ransom', n: 4, gap: 1.2, delay: 1 }, { e: 'A', t: 'trojan', n: 8, gap: 0.7, delay: 3 }, { e: 'B', t: 'ap', n: 5, gap: 1, delay: 5 }]),
      W([{ e: 'A', t: 'boss1', n: 1, gap: 1 }, { e: 'B', t: 'worm', n: 6, gap: 1.2, delay: 4 }, { e: 'A', t: 'trojan', n: 4, gap: 1.4, delay: 8 }])
    ],
    backbone: [
      W([{ e: 'A', t: 'worm', n: 6, gap: 1.0 }]),
      W([{ e: 'C', t: 'worm', n: 6, gap: 0.9 }]),
      W([{ e: 'B', t: 'trojan', n: 4, gap: 1.2 }, { e: 'A', t: 'worm', n: 5, gap: 0.9 }]),
      W([{ e: 'C', t: 'flood', n: 3, gap: 1.6 }, { e: 'B', t: 'worm', n: 6, gap: 0.8, delay: 1 }]),
      W([{ e: 'A', t: 'ap', n: 4, gap: 1.2 }, { e: 'C', t: 'trojan', n: 4, gap: 1.1 }]),
      W([{ e: 'B', t: 'ransom', n: 3, gap: 1.7 }, { e: 'A', t: 'worm', n: 7, gap: 0.7, delay: 2 }]),
      W([{ e: 'C', t: 'packer', n: 2, gap: 2 }, { e: 'C', t: 'worm', n: 7, gap: 0.7, delay: 1 }, { e: 'B', t: 'ap', n: 3, gap: 1.2, delay: 3 }]),
      // 洪峰：三入口同时大量出兵
      W([{ e: 'A', t: 'flood', n: 4, gap: 1.2 }, { e: 'C', t: 'flood', n: 4, gap: 1.2 }, { e: 'B', t: 'flood', n: 4, gap: 1.2 }, { e: 'A', t: 'worm', n: 6, gap: 0.7, delay: 3 }, { e: 'C', t: 'trojan', n: 5, gap: 0.9, delay: 3 }]),
      W([{ e: 'B', t: 'ransom', n: 4, gap: 1.3 }, { e: 'A', t: 'trojan', n: 6, gap: 0.9, delay: 2 }]),
      W([{ e: 'C', t: 'packer', n: 3, gap: 1.7 }, { e: 'A', t: 'flood', n: 3, gap: 1.4, delay: 2 }, { e: 'B', t: 'worm', n: 8, gap: 0.6, delay: 3 }]),
      W([{ e: 'A', t: 'ransom', n: 4, gap: 1.2 }, { e: 'C', t: 'trojan', n: 7, gap: 0.8, delay: 1 }, { e: 'B', t: 'ap', n: 5, gap: 1, delay: 4 }]),
      W([{ e: 'A', t: 'flood', n: 4, gap: 1.2 }, { e: 'B', t: 'ransom', n: 4, gap: 1.2, delay: 2 }, { e: 'C', t: 'worm', n: 9, gap: 0.5, delay: 3 }]),
      W([{ e: 'C', t: 'packer', n: 3, gap: 1.6 }, { e: 'A', t: 'trojan', n: 8, gap: 0.7, delay: 1 }, { e: 'B', t: 'flood', n: 3, gap: 1.4, delay: 3 }, { e: 'A', t: 'ap', n: 4, gap: 1.1, delay: 5 }]),
      W([{ e: 'A', t: 'ransom', n: 5, gap: 1.1 }, { e: 'B', t: 'flood', n: 4, gap: 1.2, delay: 2 }, { e: 'C', t: 'trojan', n: 8, gap: 0.7, delay: 3 }, { e: 'A', t: 'worm', n: 8, gap: 0.5, delay: 5 }]),
      W([{ e: 'C', t: 'boss2', n: 1, gap: 1 }, { e: 'A', t: 'worm', n: 6, gap: 1.1, delay: 4 }, { e: 'B', t: 'trojan', n: 5, gap: 1.2, delay: 7 }])
    ],
    airgap: [
      W([{ e: 'A', t: 'worm', n: 6, gap: 1.0 }]),
      W([{ e: 'B', t: 'worm', n: 6, gap: 0.9 }]),
      W([{ e: 'C', t: 'trojan', n: 4, gap: 1.2 }, { e: 'A', t: 'worm', n: 5, gap: 0.9 }]),
      W([{ e: 'A', t: 'flood', n: 3, gap: 1.6 }, { e: 'B', t: 'worm', n: 6, gap: 0.8, delay: 1 }]),
      W([{ e: 'C', t: 'ap', n: 4, gap: 1.2 }, { e: 'B', t: 'trojan', n: 4, gap: 1.1 }]),
      W([{ e: 'A', t: 'ransom', n: 3, gap: 1.7 }, { e: 'C', t: 'worm', n: 7, gap: 0.7, delay: 2 }]),
      W([{ e: 'B', t: 'packer', n: 2, gap: 2 }, { e: 'B', t: 'worm', n: 7, gap: 0.7, delay: 1 }, { e: 'A', t: 'ap', n: 3, gap: 1.2, delay: 3 }]),
      W([{ e: 'C', t: 'flood', n: 4, gap: 1.3 }, { e: 'A', t: 'trojan', n: 5, gap: 1, delay: 2 }]),
      W([{ e: 'A', t: 'ransom', n: 4, gap: 1.3 }, { e: 'B', t: 'flood', n: 3, gap: 1.4, delay: 2 }, { e: 'C', t: 'worm', n: 7, gap: 0.6, delay: 3 }]),
      // 洪峰
      W([{ e: 'A', t: 'flood', n: 4, gap: 1.1 }, { e: 'B', t: 'flood', n: 4, gap: 1.1 }, { e: 'C', t: 'flood', n: 4, gap: 1.1 }, { e: 'A', t: 'ransom', n: 3, gap: 1.4, delay: 3 }, { e: 'B', t: 'trojan', n: 6, gap: 0.8, delay: 3 }]),
      W([{ e: 'C', t: 'packer', n: 3, gap: 1.6 }, { e: 'A', t: 'trojan', n: 8, gap: 0.7, delay: 1 }, { e: 'B', t: 'ap', n: 5, gap: 1, delay: 4 }]),
      W([{ e: 'A', t: 'ransom', n: 5, gap: 1.1 }, { e: 'B', t: 'flood', n: 4, gap: 1.2, delay: 2 }, { e: 'C', t: 'worm', n: 9, gap: 0.5, delay: 3 }]),
      W([{ e: 'B', t: 'packer', n: 3, gap: 1.6 }, { e: 'C', t: 'trojan', n: 8, gap: 0.7, delay: 1 }, { e: 'A', t: 'flood', n: 3, gap: 1.4, delay: 3 }, { e: 'C', t: 'ap', n: 4, gap: 1.1, delay: 5 }]),
      W([{ e: 'A', t: 'ransom', n: 5, gap: 1 }, { e: 'B', t: 'flood', n: 4, gap: 1.2, delay: 2 }, { e: 'C', t: 'trojan', n: 8, gap: 0.6, delay: 3 }, { e: 'A', t: 'worm', n: 9, gap: 0.5, delay: 5 }]),
      W([{ e: 'A', t: 'packer', n: 3, gap: 1.5 }, { e: 'B', t: 'ransom', n: 5, gap: 1.1, delay: 1 }, { e: 'C', t: 'flood', n: 4, gap: 1.2, delay: 3 }, { e: 'A', t: 'trojan', n: 8, gap: 0.6, delay: 4 }]),
      W([{ e: 'C', t: 'boss3', n: 1, gap: 1 }, { e: 'A', t: 'worm', n: 7, gap: 1, delay: 4 }, { e: 'B', t: 'trojan', n: 5, gap: 1.2, delay: 7 }])
    ]
  };

  // ================= 图鉴文案 =================
  ND.STATUS_DOC = [
    { name: '检测 / 显形', icon: 'eye', text: '沙箱的检测范围、旧链路和阻挡会使伪装或潜伏目标显形。显形前不能被远程单体攻击主动选中，但会被范围攻击波及。' },
    { name: '护盾', icon: 'shield', text: '吸收伤害，先于生命消耗，可被打破。加壳器为同伴提供护盾；修复进程的冗余切换为友塔提供护盾。' },
    { name: '加密', icon: 'lock', text: '使塔暂时停止攻击、治疗和释放技能，但不解除阻挡或节点隔离。备份还原与冗余切换可解除。蜜罐免疫加密。' },
    { name: '减速', icon: 'slow', text: '旧链路与压制阵列使敌人移动变慢，敌人选路时也会考虑较慢的通行速度。' },
    { name: '诱捕', icon: 'trap', text: '蜜罐技能困住被诱来的敌人，使其无法移动和攻击。' },
    { name: '隔离 / 旁路', icon: 'gate', text: '节点被隔离后截断道路；节点上的塔或隔离器被摧毁、撤下或失效后旁路直通，道路重新打开，并有短暂的再次隔离间隔。' }
  ];
  ND.TERRAIN_DOC = [
    { name: '链路', icon: 'link', text: '恶意程序与业务流量经过的道路。防火墙和蜜罐可部署在入口、出口之外的链路上，阻挡敌人但不截断道路。' },
    { name: '设备平台', icon: 'platform', text: '部署拦截器、沙箱、修复进程的位置，与链路有高低区别，敌人不能通行。' },
    { name: '障碍', icon: 'obstacle', text: '数据设施、公网流和气隙等，不能通行，也不能部署。' },
    { name: '交换节点', icon: 'node', text: '链路交汇处的网络设备。部署防火墙、网闸或应急隔离器会隔离节点使其不可通行；解除隔离后恢复直通。' },
    { name: '旧链路', icon: 'legacy', text: '保留旧协议的道路，经过的地面敌人减速，伪装的木马显形。敌人选路时会考虑其较慢的通行速度。' }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = ND;
})(typeof window !== 'undefined' ? window : globalThis);