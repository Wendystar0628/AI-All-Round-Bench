// 游戏数值与文本定义。时间单位：秒；距离单位：格。
window.GAME_DATA = (function () {
  const CLASS = {
    block: { name: '阻挡', color: '#ff9b4a' },
    lure: { name: '诱敌', color: '#ffd166' },
    iso: { name: '隔离', color: '#4dabf7' },
    ranged: { name: '远程', color: '#3de0ff' },
    detect: { name: '检测', color: '#b388ff' },
    support: { name: '支援', color: '#6ef3a5' },
    item: { name: '道具', color: '#f5f7fa' },
  };

  const TOWERS = {
    firewall: {
      name: '防火墙', cls: 'block', places: ['link', 'node'],
      hp: 420, cost: 60, nodeIntel: 25, nodeCost: 80,
      blockCap: 3, counterDmg: 14, counterRate: 1.0, range: 0,
      upCost: 70, upMul: { hp: 1.3, cap: 4, dmg: 1.4 },
      skill: { name: '强制阻断', cd: 28, dur: 8, desc: '8 秒内阻挡容量 +3，还击伤害翻倍。' },
      brief: '承受近战攻击，在链路上拦住有限数量的敌人并还击；建在节点上时隔离该节点，并拦截相邻链路上的敌人。',
      stats: '阻挡容量 3｜还击 14/s｜耐久 420',
    },
    honeypot: {
      name: '蜜罐', cls: 'lure', places: ['link'],
      hp: 190, cost: 55, blockCap: 2, tauntR: 2.4, trapR: 2.2, trapDur: 5, trapCd: 18,
      upCost: 65, upMul: { hp: 1.2 },
      branches: {
        mesh: {
          name: '蜜网诱导', desc: '嘲讽范围 +1.2 格，阻挡容量 +1，耐久 +20%。附近的远程敌人更多转向蜜罐。',
          apply: (t) => { t.blockCap += 1; t.tauntR += 1.2; t.maxHp = Math.round(t.maxHp * 1.2); },
        },
        trap: {
          name: '反制陷阱', desc: '被蜜罐阻挡的敌人持续灼烧（10/s），诱捕冷却 -6 秒。',
          apply: (t) => { t.burn = 10; t.trapCd -= 6; },
        },
      },
      skill: { name: '诱捕', cd: 18, dur: 5, desc: '范围内地面敌人被困 5 秒，无法移动。' },
      brief: '以伪造应答吸引附近会攻击塔的敌人，替其他塔承担攻击；耐久较低，但不会被加密。',
      stats: '阻挡容量 2｜嘲讽 2.4 格｜耐久 190',
    },
    gateway: {
      name: '网闸', cls: 'iso', places: ['node'],
      hp: 520, cost: 40, nodeIntel: 20, blockCap: 0,
      upCost: 60, upMul: { hp: 1.3 },
      brief: '低成本隔离交换节点，耐久较高，不攻击。节点被隔离后，敌人需绕行；网闸仍会被敌人攻击和冲毁。',
      stats: '不攻击｜隔离节点｜耐久 520',
    },
    interceptor: {
      name: '拦截器', cls: 'ranged', places: ['plat'],
      hp: 260, cost: 110, range: 5.6, arc: 0.7, dmg: 32, rate: 1.25, travel: 0.28,
      upCost: 90, upMul: { dmg: 1.35, range: 6.4, hp: 1.2 },
      branches: {
        pierce: {
          name: '贯穿攻击', desc: '射线穿透，最多命中 3 个目标，后续目标伤害递减。可波及未显形的木马。射程 +0.8 格。',
          apply: (t) => { t.pierce = 3; t.range += 0.8; },
        },
        suppress: {
          name: '压制减速', desc: '命中目标使其减速 50%，持续 2.5 秒；被压制的敌人额外受到 25% 伤害。单发伤害 -15%。',
          apply: (t) => { t.suppress = true; t.dmg = Math.round(t.dmg * 0.85); },
        },
      },
      skill: { name: '过载射击', cd: 22, dur: 6, desc: '6 秒内射速翻倍。' },
      brief: '在朝向决定的扇形区域内远程单体攻击，地面与飞行敌人都能打；看不见木马。',
      stats: '扇形射程 5.6 格｜伤害 32｜射速 1.25/s',
    },
    sandbox: {
      name: '沙箱', cls: 'detect', places: ['plat'],
      hp: 300, cost: 95, detectR: 4.2, aoeR: 1.7, aoeRange: 3.4, aoeDmg: 18, rate: 0.75,
      upCost: 85, upMul: { detectR: 1.25, aoeR: 1.3, aoeDmg: 1.4, hp: 1.2 },
      skill: { name: '全量扫描', cd: 24, dur: 0, desc: '立即显形检测范围内的伪装与潜伏目标，并进行一次双倍范围攻击。' },
      brief: '检测范围内伪装或潜伏的目标使其显形，并对地面敌人进行范围攻击，适合处理汇聚的流量。',
      stats: '检测 4.2 格｜范围伤害 18｜半径 1.7',
    },
    repair: {
      name: '修复进程', cls: 'support', places: ['plat'],
      hp: 230, cost: 100, healR: 3.0, heal: 13, shieldAmt: 70,
      upCost: 80, upMul: { healR: 1.25, heal: 1.4, hp: 1.2 },
      skill: { name: '冗余切换', cd: 24, dur: 8, desc: '范围内友塔获得 70 点护盾，并解除加密。' },
      brief: '不攻击敌人，持续恢复范围内其他受损塔的生命；冗余切换为友塔提供护盾并解除加密。',
      stats: '治疗范围 3 格｜13 生命/s｜耐久 230',
    },
  };

  const ENEMIES = {
    worm: {
      name: '蠕虫', hp: 60, speed: 1.2, dmg: 9, blockCost: 1, coreDmg: 4, reward: 3, intel: 0,
      clone: true, color: '#ff6b6b', rangeMelee: true,
      brief: '被阻挡时持续攻击挡住它的塔。首次经过直通的交换节点时复制出一个同伴（复制体不再复制）。',
    },
    flood: {
      name: '洪泛团', hp: 240, speed: 0.85, dmg: 12, blockCost: 2, coreDmg: 12, reward: 6, intel: 1,
      smash: { dmg: 34, cd: 1.6 }, color: '#ff8fa3',
      brief: '占用较多阻挡容量。会离开当前路线，冲向附近被隔离节点的通行一侧，重击节点上的塔或隔离器；打通后沿新开放的道路前进。',
    },
    trojan: {
      name: '木马', hp: 130, speed: 1.0, dmg: 10, blockCost: 1, coreDmg: 9, reward: 5, intel: 4,
      disguised: true, payload: { dmg: 60, r: 1.6 }, color: '#c5c9d6',
      brief: '伪装成正常封装数据包，显形前不能被远程单体攻击选中。沙箱检测、旧链路和被阻挡都会使其显形。未显形时被波及消灭会释放载荷，伤害附近的塔。',
    },
    ransom: {
      name: '勒索者', hp: 170, speed: 0.8, dmg: 13, blockCost: 1, coreDmg: 14, reward: 6, intel: 0,
      range: 2.7, rate: 0.9, encrypt: 6.5, color: '#b07cff',
      brief: '边移动边从远处攻击射程内的塔，包括平台上的塔，造成伤害并施加加密（停止攻击、治疗和技能，直到解除）。会优先攻击射程内的蜜罐。',
    },
    hotspot: {
      name: '伪热点', hp: 100, speed: 1.7, dmg: 0, blockCost: 0, coreDmg: 7, reward: 4, intel: 0,
      flying: true, color: '#7cf9ff',
      brief: '沿无线层从入口直飞出口，不受地面道路和阻挡影响，只能由拦截器对付。',
    },
    packer: {
      name: '加壳器', hp: 140, speed: 0.75, dmg: 0, blockCost: 1, coreDmg: 8, reward: 5, intel: 0,
      aura: 2.3, shieldAmt: 55, shieldCd: 5, color: '#ffc857',
      brief: '为附近同伴提供可被打破的护盾，保护成群敌人推进。护盾会吸收伤害，先处理支援者还是集中攻击前排需要取舍。',
    },
  };

  const BOSSES = {
    wanku: {
      name: '万傀', title: '僵尸网络主控', hp: 3400, speed: 0.5, dmg: 40, blockCost: 4, coreDmg: 40, reward: 80, intel: 50,
      color: '#ff5d73', scale: 1.9,
      brief: '以僵尸网络的群体控制为主题。“洪峰”冲击被隔离节点，重创塔并冲毁隔离器；生命降至一半后释放成群蠕虫。',
      abilities: '洪峰（冲击隔离节点）｜蠕虫群（生命 <50%）',
    },
    shenlou: {
      name: '蜃楼', title: '路由欺骗核心', hp: 3900, speed: 0.46, dmg: 26, blockCost: 4, coreDmg: 40, reward: 90, intel: 60,
      color: '#7cf9ff', scale: 1.8,
      brief: '以路由欺骗为主题。“伪路由”在前方链路制造临时路由黑洞，截断通行；生命降至一半后发动“路由风暴”，削弱附近塔的护盾。',
      abilities: '伪路由（黑洞，预警后生效）｜路由风暴（生命 <50%）',
    },
    zhenying: {
      name: '蛰影', title: '潜伏型攻击组织', hp: 4600, speed: 0.55, dmg: 30, blockCost: 4, coreDmg: 40, reward: 110, intel: 80,
      color: '#9b5cff', scale: 1.7,
      brief: '攻击组织的核心威胁，按“潜伏—提权—破坏”改变阶段：潜伏时需要检测才能被远程单体攻击选中，提权后强化护甲并放出木马，破坏阶段锁死前方一段运维环。',
      abilities: '潜伏（需检测）｜提权（护甲 +35%，放出木马）｜破坏（锁死运维环）',
    },
  };

  const ITEMS = {
    isolator: {
      name: '应急隔离器', cls: 'intel', cost: { intel: 30 }, cd: 22, hp: 260, life: 35,
      place: '直通节点（无塔）', brief: '临时隔离一个直通节点。有耐久与有效期，会被洪泛团或 Boss 冲毁；不产生情报。',
    },
    downgrade: {
      name: '协议降级', cls: 'intel', cost: { intel: 40 }, cd: 30, radius: 2.3, dur: 20,
      place: '链路区域（半径 2.3 格）', brief: '让一片链路暂时使用旧协议：地面敌人减速，经过的木马显形，敌人路线随通行速度重新选择。',
    },
    restore: {
      name: '备份还原', cls: 'compute', cost: { compute: 60 }, cd: 20, healPct: 0.4,
      place: '己方塔', brief: '恢复一座塔 40% 的生命并解除加密。',
    },
  };

  const ENTRY_COLOR = { A: '#3de0ff', B: '#ffb547', C: '#ff6fd8' };
  const EXIT_COLOR = { X: '#6ef3a5', Y: '#ff7f7f' };

  // 波次：e 为入口字母串，t 为敌人类型，n 为每入口数量，gap 为间隔（秒），at 为该组开始时间。
  const WAVES = {
    intranet: [
      [{ e: 'AB', t: 'worm', n: 4, gap: 1.3 }],
      [{ e: 'AB', t: 'worm', n: 6, gap: 1.1 }, { e: 'A', t: 'packer', n: 1, gap: 0, at: 6 }],
      [{ e: 'AB', t: 'worm', n: 5, gap: 1.0 }, { e: 'AB', t: 'flood', n: 2, gap: 7, at: 4 }],
      [{ e: 'AB', t: 'worm', n: 6, gap: 1.2 }, { e: 'B', t: 'trojan', n: 5, gap: 2.2, at: 3 }],
      [{ e: 'AB', t: 'worm', n: 8, gap: 1.0 }, { e: 'A', t: 'ransom', n: 3, gap: 3.2, at: 4 }],
      [{ e: 'AB', t: 'worm', n: 8, gap: 0.9 }, { e: 'AB', t: 'packer', n: 2, gap: 6, at: 5 }, { e: 'B', t: 'ransom', n: 3, gap: 3.5, at: 9 }],
      [{ e: 'AB', t: 'hotspot', n: 3, gap: 3.5 }, { e: 'AB', t: 'flood', n: 3, gap: 5, at: 6 }],
      [{ e: 'AB', t: 'trojan', n: 5, gap: 2.0 }, { e: 'AB', t: 'worm', n: 8, gap: 1.0, at: 3 }, { e: 'A', t: 'ransom', n: 3, gap: 3, at: 10 }],
      [{ e: 'AB', t: 'flood', n: 4, gap: 4.5 }, { e: 'AB', t: 'packer', n: 3, gap: 4, at: 2 }, { e: 'AB', t: 'worm', n: 6, gap: 1.0, at: 8 }],
      [{ e: 'AB', t: 'worm', n: 10, gap: 0.9 }, { e: 'AB', t: 'trojan', n: 4, gap: 2.4, at: 4 }, { e: 'AB', t: 'ransom', n: 4, gap: 3.2, at: 6 }],
      [{ e: 'AB', t: 'hotspot', n: 4, gap: 2.2 }, { e: 'AB', t: 'flood', n: 4, gap: 4, at: 3 }, { e: 'AB', t: 'packer', n: 3, gap: 4, at: 8 }],
      [{ e: 'AB', t: 'worm', n: 10, gap: 0.8 }, { e: 'AB', t: 'trojan', n: 5, gap: 2.0, at: 2 }, { e: 'AB', t: 'ransom', n: 5, gap: 2.8, at: 5 }, { e: 'AB', t: 'flood', n: 3, gap: 5, at: 10 }],
      [{ e: 'AB', t: 'flood', n: 5, gap: 3.5 }, { e: 'AB', t: 'packer', n: 4, gap: 3, at: 2 }, { e: 'AB', t: 'hotspot', n: 4, gap: 2.4, at: 6 }, { e: 'AB', t: 'worm', n: 10, gap: 0.8, at: 9 }],
      [{ e: 'AB', t: 'trojan', n: 6, gap: 1.8 }, { e: 'AB', t: 'ransom', n: 5, gap: 2.4, at: 3 }, { e: 'AB', t: 'worm', n: 12, gap: 0.7, at: 5 }],
      [{ e: 'AB', t: 'boss:wanku', n: 1, gap: 0 }, { e: 'AB', t: 'worm', n: 8, gap: 1.0, at: 4 }, { e: 'AB', t: 'flood', n: 3, gap: 4, at: 8 }],
    ],
    backbone: [
      [{ e: 'ABC', t: 'worm', n: 3, gap: 1.4 }],
      [{ e: 'ABC', t: 'worm', n: 4, gap: 1.2 }, { e: 'C', t: 'packer', n: 1, gap: 0, at: 6 }],
      [{ e: 'ABC', t: 'worm', n: 4, gap: 1.1 }, { e: 'AB', t: 'flood', n: 2, gap: 6, at: 4 }],
      [{ e: 'ABC', t: 'worm', n: 5, gap: 1.0 }, { e: 'A', t: 'trojan', n: 5, gap: 2.2, at: 3 }],
      [{ e: 'ABC', t: 'worm', n: 6, gap: 1.0 }, { e: 'C', t: 'ransom', n: 3, gap: 3.2, at: 4 }],
      [{ e: 'ABC', t: 'worm', n: 6, gap: 0.9 }, { e: 'AB', t: 'packer', n: 2, gap: 6, at: 5 }, { e: 'B', t: 'ransom', n: 3, gap: 3.4, at: 9 }],
      [{ e: 'AB', t: 'hotspot', n: 3, gap: 3.5 }, { e: 'C', t: 'flood', n: 3, gap: 5, at: 6 }],
      [{ e: 'ABC', t: 'trojan', n: 4, gap: 2.0 }, { e: 'ABC', t: 'worm', n: 6, gap: 1.0, at: 3 }, { e: 'A', t: 'ransom', n: 3, gap: 3, at: 10 }],
      [{ e: 'ABC', t: 'flood', n: 3, gap: 4.5 }, { e: 'ABC', t: 'packer', n: 2, gap: 4, at: 2 }, { e: 'ABC', t: 'worm', n: 6, gap: 1.0, at: 8 }],
      [{ e: 'ABC', t: 'worm', n: 8, gap: 0.9 }, { e: 'ABC', t: 'trojan', n: 3, gap: 2.4, at: 4 }, { e: 'AB', t: 'ransom', n: 4, gap: 3.2, at: 6 }],
      [{ e: 'AB', t: 'flood', n: 6, gap: 1.4, at: 0 }, { e: 'C', t: 'flood', n: 4, gap: 2.5, at: 2 }, { e: 'ABC', t: 'hotspot', n: 3, gap: 2.2, at: 3 }, { e: 'ABC', t: 'ransom', n: 3, gap: 2.8, at: 4 }],
      [{ e: 'ABC', t: 'worm', n: 9, gap: 0.8 }, { e: 'ABC', t: 'trojan', n: 4, gap: 2.0, at: 2 }, { e: 'ABC', t: 'packer', n: 3, gap: 4, at: 5 }, { e: 'ABC', t: 'ransom', n: 3, gap: 2.8, at: 9 }],
      [{ e: 'ABC', t: 'flood', n: 4, gap: 3.0 }, { e: 'ABC', t: 'hotspot', n: 4, gap: 2.4, at: 3 }, { e: 'AB', t: 'trojan', n: 6, gap: 1.8, at: 6 }],
      [{ e: 'ABC', t: 'worm', n: 10, gap: 0.7 }, { e: 'ABC', t: 'ransom', n: 4, gap: 2.4, at: 3 }, { e: 'C', t: 'flood', n: 5, gap: 3.2, at: 6 }],
      [{ e: 'AB', t: 'hotspot', n: 5, gap: 2.0 }, { e: 'ABC', t: 'packer', n: 3, gap: 3, at: 2 }, { e: 'ABC', t: 'trojan', n: 4, gap: 2.0, at: 6 }],
      [{ e: 'AC', t: 'boss:shenlou', n: 1, gap: 0 }, { e: 'ABC', t: 'worm', n: 6, gap: 1.0, at: 4 }, { e: 'ABC', t: 'flood', n: 2, gap: 4, at: 8 }],
    ],
    airgap: [
      [{ e: 'AC', t: 'worm', n: 4, gap: 1.3 }],
      [{ e: 'ABC', t: 'worm', n: 3, gap: 1.2 }, { e: 'B', t: 'packer', n: 1, gap: 0, at: 6 }],
      [{ e: 'ABC', t: 'worm', n: 4, gap: 1.1 }, { e: 'AB', t: 'flood', n: 1, gap: 6, at: 4 }],
      [{ e: 'ABC', t: 'worm', n: 5, gap: 1.0 }, { e: 'C', t: 'trojan', n: 4, gap: 2.2, at: 3 }],
      [{ e: 'ABC', t: 'worm', n: 6, gap: 1.0 }, { e: 'B', t: 'ransom', n: 3, gap: 3.2, at: 4 }],
      [{ e: 'ABC', t: 'worm', n: 6, gap: 0.9 }, { e: 'AB', t: 'packer', n: 2, gap: 6, at: 5 }, { e: 'C', t: 'ransom', n: 3, gap: 3.4, at: 9 }],
      [{ e: 'AB', t: 'hotspot', n: 3, gap: 3.5 }, { e: 'C', t: 'flood', n: 3, gap: 5, at: 6 }],
      [{ e: 'ABC', t: 'trojan', n: 4, gap: 2.0 }, { e: 'ABC', t: 'worm', n: 6, gap: 1.0, at: 3 }, { e: 'A', t: 'ransom', n: 3, gap: 3, at: 10 }],
      [{ e: 'ABC', t: 'flood', n: 3, gap: 4.5 }, { e: 'ABC', t: 'packer', n: 2, gap: 4, at: 2 }, { e: 'ABC', t: 'worm', n: 6, gap: 1.0, at: 8 }],
      [{ e: 'ABC', t: 'worm', n: 8, gap: 0.9 }, { e: 'ABC', t: 'trojan', n: 3, gap: 2.4, at: 4 }, { e: 'AB', t: 'ransom', n: 4, gap: 3.2, at: 6 }],
      [{ e: 'AB', t: 'hotspot', n: 4, gap: 2.2 }, { e: 'C', t: 'flood', n: 4, gap: 3.5, at: 1 }, { e: 'ABC', t: 'packer', n: 3, gap: 3.5, at: 5 }],
      [{ e: 'ABC', t: 'flood', n: 6, gap: 1.6 }, { e: 'ABC', t: 'hotspot', n: 3, gap: 2.2, at: 2 }, { e: 'ABC', t: 'ransom', n: 3, gap: 2.8, at: 4 }, { e: 'ABC', t: 'worm', n: 6, gap: 0.8, at: 6 }],
      [{ e: 'ABC', t: 'worm', n: 9, gap: 0.8 }, { e: 'ABC', t: 'trojan', n: 4, gap: 2.0, at: 2 }, { e: 'ABC', t: 'packer', n: 3, gap: 4, at: 5 }],
      [{ e: 'ABC', t: 'flood', n: 4, gap: 3.0 }, { e: 'ABC', t: 'hotspot', n: 4, gap: 2.4, at: 3 }, { e: 'AB', t: 'trojan', n: 6, gap: 1.8, at: 6 }],
      [{ e: 'ABC', t: 'worm', n: 10, gap: 0.7 }, { e: 'ABC', t: 'ransom', n: 4, gap: 2.4, at: 3 }, { e: 'C', t: 'flood', n: 5, gap: 3.2, at: 6 }],
      [{ e: 'ABC', t: 'boss:zhenying', n: 1, gap: 0 }, { e: 'ABC', t: 'worm', n: 6, gap: 1.0, at: 4 }, { e: 'ABC', t: 'flood', n: 2, gap: 4, at: 8 }],
    ],
  };

  // 洪峰波次（三个入口同时大量出兵）
  const PEAK_WAVE = { backbone: 11, airgap: 12 };

  const BOSS_NAME_BY_MAP = { intranet: 'wanku', backbone: 'shenlou', airgap: 'zhenying' };

  // 地图顺序与演示
  const DEMOS = [
    {
      id: 'demo-1', title: '分段取舍', map: 'intranet', subtitle: '分段内网 · 第 1 波',
      desc: '把网闸拖到西边界节点，预览中 A 折向 DMZ 互联，确认后办公网段的敌人掉头。',
    },
    {
      id: 'demo-2', title: '旁路直通', map: 'backbone', subtitle: '骨干流域 · 洪峰',
      desc: '洪泛团冲垮节点上的网闸，C、B 的路线改回原来的数据中心；玩家同时在 A 的路线上投下协议降级。',
    },
    {
      id: 'demo-3', title: '蛰影现身', map: 'airgap', subtitle: '气隙深层 · 第 16 波',
      desc: '蛰影锁死前方一段运维环，各入口的路线重新收敛，玩家选中修复进程释放冗余切换。',
    },
  ];

  return { CLASS, TOWERS, ENEMIES, BOSSES, ITEMS, ENTRY_COLOR, EXIT_COLOR, WAVES, BOSS_NAME_BY_MAP, DEMOS, PEAK_WAVE };
})();
