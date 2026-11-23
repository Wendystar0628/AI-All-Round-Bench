/* 网络安全攻防战 — 设备、威胁、道具数据与说明文本（说明由数值生成，保证与实际一致） */
(function (root) {
  'use strict';
  const TD = root.TD;

  TD.RULES = {
    isolateIntel: 3,        // 隔离节点消耗情报
    reisolate: 10,          // 节点恢复直通后的再次隔离间隔（秒）
    sellRefund: 0.6,        // 撤下返还算力比例
    holdInterval: 5,        // 交战中守住隔离节点，每 N 秒 +1 情报
    waveIntel: 2,
    prepFirst: 16, prep: 11,
    passive: 3.2,           // 每秒算力
    branchIntel: 4,
    antiAir: 1.5            // 拦截器对飞行目标的伤害倍率
  };

  // ---------------- 塔 ----------------
  TD.TOWERS = {
    firewall: {
      key: 'firewall', name: '防火墙', role: '阻挡', roleKey: 'block', place: ['link', 'node'], cost: 90, upCost: 120,
      L: [{ hp: 460, block: 2, dmg: 18, rate: 1.0, armor: 0, cleave: false },
          { hp: 720, block: 3, dmg: 24, rate: 0.9, armor: 0.2, cleave: true }],
      skill: { name: '策略加固', cd: 28, dur: 6, cut: 0.7, reflect: 12 },
      short: '在链路上拦住敌人并还击；放在交换节点上则隔离节点。'
    },
    honeypot: {
      key: 'honeypot', name: '蜜罐', role: '诱敌阻挡', roleKey: 'lure', place: ['link'], cost: 60, upCost: 80,
      L: [{ hp: 240, block: 2, lure: 2.6, trap: 4.5 }],
      B: {
        a: { name: '深度取证', hp: 300, block: 3, lure: 2.6, trap: 6, mark: 0.4, desc: '被它阻挡或诱捕的敌人被取证标记，受到的伤害 +40%；诱捕延长到 6 秒。适合放进火力覆盖区当靶场。' },
        b: { name: '蜜网集群', hp: 340, block: 4, lure: 3.8, trap: 4.5, burst: 3, stun: 2.5, desc: '诱敌半径扩大到 3.8 格、阻挡容量 4；被摧毁时释放告警脉冲，3 格内敌人显形并眩晕 2.5 秒。适合放在岔口把流量从节点引开。' }
      },
      skill: { name: '诱捕', cd: 24 },
      short: '伪造应答吸引附近会攻击塔的地面敌人，替其他塔挨打。不会被加密。'
    },
    gateway: {
      key: 'gateway', name: '网闸', role: '隔离', roleKey: 'iso', place: ['node'], cost: 50, upCost: 70,
      L: [{ hp: 560, smashCut: 0, regen: 0 }, { hp: 900, smashCut: 0.35, regen: 5 }],
      skill: null,
      short: '低成本隔离交换节点，耐久高，不攻击。用来控制道路。'
    },
    interceptor: {
      key: 'interceptor', name: '拦截器', role: '远程', roleKey: 'ranged', place: ['platform'], cost: 100, upCost: 100, facing: true,
      L: [{ hp: 190, dmg: 16, rate: 0.75, depth: 4, half: 1.5 }],
      B: {
        a: { name: '贯穿', hp: 240, dmg: 34, rate: 1.5, depth: 6, half: 1.5, pierce: true, desc: '改为贯穿光束：沿瞄准线直到射程尽头的敌人全部受伤，纵深 6 格。光束会波及未显形的木马。适合顺着笔直的链路架设。', skill: { name: '过载齐射', cd: 22, dmg: 70 } },
        b: { name: '压制', hp: 240, dmg: 8, rate: 0.25, depth: 4, half: 2.5, slow: 0.45, slowT: 1.6, desc: '改为高速压制射击：命中使目标减速 45%，攻击区域加宽到 5 格，优先射击尚未被减速的目标。适合架在岔口拖住成群敌人。', skill: { name: '压制弹幕', cd: 24, slow: 0.7, dur: 4 } }
      },
      skill: null,
      short: '在朝向决定的区域内远程单体攻击，地面与飞行敌人都能打。'
    },
    sandbox: {
      key: 'sandbox', name: '沙箱', role: '检测 / 范围', roleKey: 'detect', place: ['platform'], cost: 120, upCost: 120,
      L: [{ hp: 210, detect: 2.6, aoe: 1.9, dmg: 14, rate: 1.5, shieldMul: 1 },
          { hp: 300, detect: 3.3, aoe: 2.3, dmg: 22, rate: 1.4, shieldMul: 3 }],
      skill: { name: '引爆分析', cd: 30, mul: 3, dur: 6 },
      short: '让范围内伪装或潜伏的目标显形，并对地面敌人做范围攻击。'
    },
    repair: {
      key: 'repair', name: '修复进程', role: '治疗', roleKey: 'heal', place: ['platform'], cost: 110, upCost: 110,
      L: [{ hp: 180, range: 2.6, heal: 16, beams: 1, shield: 110 }, { hp: 250, range: 3.2, heal: 20, beams: 2, shield: 170 }],
      skill: { name: '冗余切换', cd: 32, dur: 8 },
      short: '不攻击，持续修复范围内其他受损的塔——包括节点上的塔。'
    }
  };
  TD.TOWER_ORDER = ['firewall', 'honeypot', 'gateway', 'interceptor', 'sandbox', 'repair'];

  TD.towerStats = function (type, level, branch) {
    const d = TD.TOWERS[type];
    if (level >= 2) { if (d.B) return d.B[branch || 'a']; return d.L[1]; }
    return d.L[0];
  };
  TD.towerSkill = function (type, level, branch) {
    const d = TD.TOWERS[type];
    if (type === 'interceptor') return level >= 2 ? d.B[branch].skill : null;
    return d.skill;
  };
  TD.towerFullName = function (t) {
    const d = TD.TOWERS[t.type];
    if (t.level >= 2 && d.B) return d.name + '·' + d.B[t.branch].name;
    return d.name;
  };

  // ---------------- 敌人 ----------------
  TD.ENEMIES = {
    worm: { key: 'worm', name: '蠕虫', hp: 62, speed: 1.05, size: 1, melee: 7, atkRate: 0.8, reward: 6, leak: 1, attacker: true, r: 0.26 },
    flood: { key: 'flood', name: '洪泛团', hp: 300, speed: 0.72, size: 2, melee: 18, atkRate: 1.1, smash: 60, smashRate: 1.4, seek: 4, reward: 16, leak: 2, attacker: true, r: 0.4 },
    trojan: { key: 'trojan', name: '木马', hp: 115, speed: 1.1, size: 1, melee: 9, atkRate: 1.0, payload: 42, payloadR: 1.7, reward: 9, leak: 1, attacker: true, hidden: true, r: 0.28 },
    ransom: { key: 'ransom', name: '勒索者', hp: 170, speed: 0.78, size: 1, ranged: 13, atkRate: 2.2, range: 3.2, encrypt: 4.5, reward: 14, intel: 1, leak: 1, attacker: true, r: 0.32 },
    hotspot: { key: 'hotspot', name: '伪热点', hp: 72, speed: 1.25, size: 0, fly: true, reward: 9, leak: 1, r: 0.34 },
    packer: { key: 'packer', name: '加壳器', hp: 200, speed: 0.8, size: 1, shield: 48, shieldR: 1.9, shieldRate: 5.5, reward: 14, intel: 1, leak: 1, r: 0.34 },
    boss1: { key: 'boss1', name: '万傀', boss: true, hp: 5200, speed: 0.42, size: 3, melee: 55, atkRate: 1.2, reward: 240, intel: 8, leak: 12, attacker: true, r: 0.75,
      surgeCd: 12, surgeWarn: 2.6, surgeFrac: 0.55, surgeMin: 260, wormCd: 9, wormN: 4 },
    boss2: { key: 'boss2', name: '蜃楼', boss: true, hp: 5600, speed: 0.48, size: 3, melee: 45, atkRate: 1.2, reward: 260, intel: 8, leak: 12, attacker: true, r: 0.7,
      spoofCd: 14, spoofWarn: 2.6, spoofDur: 11, stormCd: 10, stormR: 3.6, stormLock: 6 },
    boss3: { key: 'boss3', name: '蛰影', boss: true, hp: 6400, speed: 0.5, size: 3, melee: 60, atkRate: 1.1, reward: 300, intel: 10, leak: 12, attacker: true, r: 0.8,
      armor: 0.45, trojanCd: 10, trojanN: 2, lockCd: 16, lockWarn: 3, lockDur: 12, lockLen: 3 }
  };
  TD.ENEMY_ORDER = ['worm', 'flood', 'trojan', 'ransom', 'hotspot', 'packer', 'boss1', 'boss2', 'boss3'];

  // ---------------- 道具 ----------------
  TD.ITEMS = {
    isolator: { key: 'isolator', name: '应急隔离器', res: 'intel', cost: 3, cd: 30, target: '直通的交换节点', hp: 260, dur: 20,
      short: '临时隔离一个直通节点。有耐久和有效期，会被冲毁，不产生情报。' },
    downgrade: { key: 'downgrade', name: '协议降级', res: 'intel', cost: 2, cd: 24, target: '一片链路', radius: 2.3, dur: 12,
      short: '让一片链路暂时使用旧协议：地面敌人减速、木马显形，敌人按通行速度重新选路。' },
    restore: { key: 'restore', name: '备份还原', res: 'compute', cost: 60, cd: 18, target: '一座塔', frac: 0.5,
      short: '恢复一座塔 50% 的生命并解除加密。' }
  };
  TD.ITEM_ORDER = ['isolator', 'downgrade', 'restore'];

  // ---------------- 说明文本 ----------------
  const pct = v => Math.round(v * 100) + '%';
  TD.describeTower = function (type) {
    const d = TD.TOWERS[type], R = TD.RULES, o = { name: d.name, role: d.role, cost: d.cost, short: d.short, levels: [], skill: null, notes: [] };
    const L1 = d.L[0];
    if (type === 'firewall') {
      o.where = '链路 / 交换节点';
      o.levels.push({ t: '1 级', d: `生命 ${L1.hp}，阻挡容量 ${L1.block}，每 ${L1.rate} 秒还击一名被阻挡的敌人 ${L1.dmg} 伤害。` });
      o.levels.push({ t: '2 级（算力 ' + d.upCost + '）', d: `生命 ${d.L[1].hp}，阻挡容量 ${d.L[1].block}，还击改为横扫全部被阻挡的敌人（${d.L[1].dmg} 伤害），近战减伤 ${pct(d.L[1].armor)}。外观加装第二层装甲与顶部发射环。` });
      o.skill = { n: d.skill.name, d: `${d.skill.dur} 秒内受到的伤害降低 ${pct(d.skill.cut)}，并对近战攻击者反弹 ${d.skill.reflect} 伤害。冷却 ${d.skill.cd} 秒。` };
      o.notes = ['阻挡不截断道路：超过阻挡容量的敌人会继续前进。', '被阻挡或冲击节点超过 8 秒的敌人会逐渐狂暴，伤害持续上升——光挡不杀守不住。', `部署在交换节点上会隔离节点（另耗情报 ${R.isolateIntel}），并拦截相邻链路上的敌人。`, '被阻挡的木马会显形。'];
    } else if (type === 'honeypot') {
      o.where = '链路（不含节点、出入口）';
      o.levels.push({ t: '1 级', d: `生命 ${L1.hp}，阻挡容量 ${L1.block}，诱敌半径 ${L1.lure} 格。不攻击、不会被加密。` });
      o.levels.push({ t: '2 级分支 A · ' + d.B.a.name + '（算力 ' + d.upCost + ' + 情报 ' + R.branchIntel + '）', d: `生命 ${d.B.a.hp}，阻挡 ${d.B.a.block}。` + d.B.a.desc });
      o.levels.push({ t: '2 级分支 B · ' + d.B.b.name + '（算力 ' + d.upCost + ' + 情报 ' + R.branchIntel + '）', d: `生命 ${d.B.b.hp}。` + d.B.b.desc });
      o.skill = { n: d.skill.name, d: `困住被它阻挡和正被它诱来的敌人 ${L1.trap} 秒：不能移动也不能攻击。冷却 ${d.skill.cd} 秒。` };
      o.notes = ['被诱来的敌人会离开原路线走向蜜罐；洪泛团也会被从节点前引开。', '勒索者优先射击射程内的蜜罐，而蜜罐不会被加密。', 'Boss 不受诱骗。'];
    } else if (type === 'gateway') {
      o.where = '仅交换节点';
      o.levels.push({ t: '1 级', d: `生命 ${L1.hp}。隔离所在节点（另耗情报 ${R.isolateIntel}）。不攻击。` });
      o.levels.push({ t: '2 级（算力 ' + d.upCost + '）', d: `生命 ${d.L[1].hp}，受到的节点冲击伤害降低 ${pct(d.L[1].smashCut)}，每秒自修复 ${d.L[1].regen}。外观换成双层闸板与警示灯。` });
      o.notes = ['洪泛团会离开路线来冲击它；万傀的“洪峰”会重创它。', `在交战中守住隔离节点，每 ${R.holdInterval} 秒获得 1 点情报。`, `被摧毁或撤下后节点旁路直通，${R.reisolate} 秒内不能再次隔离。`];
    } else if (type === 'interceptor') {
      o.where = '设备平台（需设定朝向）';
      o.levels.push({ t: '1 级', d: `生命 ${L1.hp}，每 ${L1.rate} 秒射击 ${L1.dmg} 伤害。攻击区域：朝向前方纵深 ${L1.depth} 格、宽 ${L1.half * 2} 格。` });
      o.levels.push({ t: '2 级分支 A · ' + d.B.a.name + '（算力 ' + d.upCost + ' + 情报 ' + R.branchIntel + '）', d: `每 ${d.B.a.rate} 秒一道 ${d.B.a.dmg} 伤害的光束。` + d.B.a.desc + ` 技能“${d.B.a.skill.name}”：沿朝向扇形发射三道 ${d.B.a.skill.dmg} 伤害的贯穿光束，冷却 ${d.B.a.skill.cd} 秒。` });
      o.levels.push({ t: '2 级分支 B · ' + d.B.b.name + '（算力 ' + d.upCost + ' + 情报 ' + R.branchIntel + '）', d: `每 ${d.B.b.rate} 秒 ${d.B.b.dmg} 伤害。` + d.B.b.desc + ` 技能“${d.B.b.skill.name}”：攻击区域内全部敌人减速 ${pct(d.B.b.skill.slow)}，持续 ${d.B.b.skill.dur} 秒，冷却 ${d.B.b.skill.cd} 秒。` });
      o.notes = ['优先攻击沿路线离出口最近的有效目标。', '未显形的木马、潜伏中的蛰影不能被它主动选中。', '是唯一能对付飞行敌人（伪热点）的塔，对飞行目标伤害 +50%。'];
    } else if (type === 'sandbox') {
      o.where = '设备平台';
      o.levels.push({ t: '1 级', d: `生命 ${L1.hp}。检测半径 ${L1.detect} 格；每 ${L1.rate} 秒对 ${L1.aoe} 格内全部地面敌人造成 ${L1.dmg} 伤害。` });
      o.levels.push({ t: '2 级（算力 ' + d.upCost + '）', d: `生命 ${d.L[1].hp}，检测半径 ${d.L[1].detect}，范围 ${d.L[1].aoe}，伤害 ${d.L[1].dmg}；“脱壳分析”：对加壳器护盾造成 ${d.L[1].shieldMul} 倍伤害。外观加装环绕的探针。` });
      o.skill = { n: d.skill.name, d: `立即释放一次 ${d.skill.mul} 倍伤害的脉冲，并在 ${d.skill.dur} 秒内把检测半径翻倍。冷却 ${d.skill.cd} 秒。` };
      o.notes = ['检测范围内的木马永久显形；潜伏的蛰影只在检测范围内显形。', '范围攻击打不到飞行敌人。', '适合架在多条路线汇聚的位置。'];
    } else if (type === 'repair') {
      o.where = '设备平台';
      o.levels.push({ t: '1 级', d: `生命 ${L1.hp}。持续修复 ${L1.range} 格内受损最重的 1 座其他塔，每秒 ${L1.heal}。` });
      o.levels.push({ t: '2 级（算力 ' + d.upCost + '）', d: `生命 ${d.L[1].hp}，半径 ${d.L[1].range}，同时修复 ${d.L[1].beams} 座塔，每秒 ${d.L[1].heal}。外观变为双环无人机。` });
      o.skill = { n: d.skill.name, d: `为范围内其他友塔提供护盾（1 级 ${L1.shield} / 2 级 ${d.L[1].shield}，持续 ${d.skill.dur} 秒）并解除加密；护盾未破时免疫新的加密。冷却 ${d.skill.cd} 秒。` };
      o.notes = ['不能修复自己；被加密时停止治疗，也放不出技能。', '把它放在隔离节点旁，才能长期守住被洪泛团冲击的网闸。'];
    }
    return o;
  };

  TD.describeEnemy = function (type) {
    const d = TD.ENEMIES[type], o = { name: d.name, hp: d.hp, speed: d.speed, lines: [], counter: '' };
    if (type === 'worm') { o.tag = '近战 · 自我复制'; o.lines = [`被阻挡时每 ${d.atkRate} 秒攻击挡住它的塔 ${d.melee} 伤害。`, '首次经过直通的交换节点时复制出一个同伴；复制体不再复制。', '隔离节点能推迟复制发生的位置。']; o.counter = '防火墙阻挡 + 沙箱范围清理。'; }
    if (type === 'flood') { o.tag = '节点冲击 · 占 2 容量'; o.lines = [`占用 ${d.size} 点阻挡容量。`, `会离开行进路线，走向 ${d.seek} 格内被隔离节点的可通行一侧，每 ${d.smashRate} 秒重击节点上的塔或隔离器 ${d.smash} 伤害；打通后沿重新开放的道路前进。`, `被链路上的塔阻挡时近战 ${d.melee} 伤害。`]; o.counter = '修复进程守节点；蜜罐把它从节点前引开；节点上放防火墙可以还击。'; }
    if (type === 'trojan') { o.tag = '伪装 · 载荷'; o.lines = ['伪装成正常封装数据包。显形前不能被拦截器主动选中。', '沙箱检测、旧链路（含协议降级）和被阻挡都会让它显形。', `未显形就被贯穿光束等波及消灭时释放载荷：${d.payloadR} 格内的塔受到 ${d.payload} 伤害。`]; o.counter = '沙箱；把路线导向旧链路；协议降级。'; }
    if (type === 'ransom') { o.tag = '远程攻塔 · 加密'; o.lines = [`边移动边攻击 ${d.range} 格内的塔（包括平台上的塔）：每 ${d.atkRate} 秒 ${d.ranged} 伤害，并施加 ${d.encrypt} 秒加密。`, '优先攻击射程内的蜜罐；蜜罐不会被加密。', '消灭后获得 1 点情报。']; o.counter = '蜜罐吸引火力；冗余切换 / 备份还原解除加密。'; }
    if (type === 'hotspot') { o.tag = '飞行'; o.lines = ['沿无线层从入口直飞最近的出口，不受地面道路、阻挡与改道影响。', '沙箱的范围攻击打不到它。']; o.counter = '只有拦截器能攻击（对飞行目标伤害 +50%）；把拦截器架在入口到出口的直线上。'; }
    if (type === 'packer') { o.tag = '支援 · 护盾'; o.lines = [`每 ${d.shieldRate} 秒为 ${d.shieldR} 格内的同伴套上 ${d.shield} 点护盾，护盾可被打破。`, '自身不攻击。消灭后获得 1 点情报。']; o.counter = '先杀它，或用 2 级沙箱的“脱壳分析”撕掉护盾。'; }
    if (type === 'boss1') { o.tag = 'Boss · 分段内网第 14 波 · 僵尸网络'; o.lines = [`“洪峰”：每 ${d.surgeCd} 秒预警 ${d.surgeWarn} 秒后冲击一个被隔离的节点，对节点上的塔造成其最大生命 ${pct(d.surgeFrac)}（至少 ${d.surgeMin}）的伤害并冲毁应急隔离器；没有隔离节点时改为重击身前的塔。`, `生命降到 50% 后进入“傀儡解离”：每 ${d.wormCd} 秒释放 ${d.wormN} 只蠕虫。`, '占 3 点阻挡容量，近战极重。']; o.counter = '预警期间给目标节点开冗余切换；二阶段准备范围伤害。'; }
    if (type === 'boss2') { o.tag = 'Boss · 骨干流域第 15 波 · 路由欺骗'; o.lines = [`“伪路由”：每 ${d.spoofCd} 秒预警 ${d.spoofWarn} 秒后，在前方链路制造持续 ${d.spoofDur} 秒的路由黑洞，截断通行，各入口随之改道。它不会选择会封死道路的位置。`, `生命降到 50% 后发动“路由风暴”：每 ${d.stormCd} 秒清除 ${d.stormR} 格内塔的护盾，并使其 ${d.stormLock} 秒内无法获得护盾。`]; o.counter = '两个跨越点都要留守；风暴后用治疗而不是护盾顶住。'; }
    if (type === 'boss3') { o.tag = 'Boss · 气隙深层第 16 波 · 蛰影核心'; o.lines = ['潜伏（生命 > 66%）：只有在沙箱检测范围内、旧链路上或被阻挡时才显形，显形时才能被拦截器选中。', `提权（66%–33%）：护甲使受到的伤害降低 ${pct(d.armor)}，每 ${d.trojanCd} 秒放出 ${d.trojanN} 只木马。`, `破坏（< 33%）：每 ${d.lockCd} 秒预警 ${d.lockWarn} 秒后锁死前方 ${d.lockLen} 格运维环 ${d.lockDur} 秒，各入口路线重新收敛。`]; o.counter = '沿途布置沙箱；锁死预警时确认另一侧的防线撑得住。'; }
    return o;
  };

  TD.describeItem = function (k) {
    const d = TD.ITEMS[k], R = TD.RULES;
    const o = { name: d.name, cost: (d.res === 'intel' ? '情报 ' : '算力 ') + d.cost, cd: d.cd, target: d.target, short: d.short, lines: [] };
    if (k === 'isolator') o.lines = [`耐久 ${d.hp}，有效期 ${d.dur} 秒。`, '同样受连通规则约束：会封死道路时无法投放，也不消耗资源。', `失效后节点旁路直通，并进入 ${R.reisolate} 秒再次隔离间隔。`];
    if (k === 'downgrade') o.lines = [`影响投放点 ${d.radius} 格内的链路，持续 ${d.dur} 秒。`, `旧协议下地面敌人速度降为 ${Math.round(TD.LEGACY_SPEED * 100)}%，木马与潜伏的蛰影显形。`, '生效与结束时各入口路线会按通行时间重新计算。'];
    if (k === 'restore') o.lines = ['可以对任意一座己方塔使用，包括节点上的塔。', '是解除修复进程自身加密的唯一手段。'];
    return o;
  };

  TD.TERRAIN_INFO = [
    { k: 'link', n: '链路', d: '恶意程序与业务流量经过的道路。防火墙和蜜罐可以部署在入口、出口之外的链路上；它们阻挡敌人，但不截断道路。' },
    { k: 'platform', n: '设备平台', d: '高出链路的平台，部署拦截器、沙箱和修复进程。敌人不能通行。' },
    { k: 'obstacle', n: '障碍', d: '数据设施、公网流和气隙。不能通行，也不能部署。' },
    { k: 'node', n: '交换节点', d: `链路交汇处的网络设备。部署防火墙、网闸或投放应急隔离器会隔离节点，使这一格不能通行；解除后旁路直通，并有 ${TD.RULES.reisolate} 秒再次隔离间隔。` },
    { k: 'legacy', n: '旧链路', d: `保留旧协议的道路：地面敌人速度降为 ${Math.round(TD.LEGACY_SPEED * 100)}%，伪装的木马显形。敌人选路时会把较慢的通行速度算进去。` },
    { k: 'entry', n: '入口 / 出口', d: '入口是威胁接入点，出口是中枢。任何通行变化都必须保持每个入口到中枢的连通。' }
  ];
  TD.STATUS_INFO = [
    { k: 'reveal', n: '显形', d: '伪装（木马）或潜伏（蛰影）的目标被识破，可以被拦截器选中。来源：沙箱检测、旧链路 / 协议降级、被阻挡。' },
    { k: 'shield', n: '护盾', d: '先于生命吸收伤害。塔的护盾来自“冗余切换”，未破时免疫新的加密；敌人的护盾来自加壳器。会被打破，蜃楼的路由风暴会清除塔的护盾。' },
    { k: 'encrypt', n: '加密', d: '勒索者命中后施加。被加密的塔暂停攻击、治疗和技能，但阻挡与节点隔离仍然有效。到时自动解除，或由“冗余切换”“备份还原”立即解除。蜜罐免疫；网闸没有可停摆的功能，也不受影响。' },
    { k: 'slow', n: '减速', d: '来自旧链路、协议降级和压制分支。Boss 受到的减速效果减半。' },
    { k: 'root', n: '诱捕', d: '被蜜罐的“诱捕”困住：不能移动也不能攻击。Boss 免疫。' },
    { k: 'mark', n: '取证标记', d: '被“深度取证”蜜罐阻挡或诱捕的敌人受到的伤害 +40%。' },
    { k: 'isolate', n: '隔离 / 旁路直通', d: '节点被隔离时这一格不能通行；节点上的塔被摧毁、撤下或隔离器失效后，设备旁路直通，道路重新打开。' }
  ];
  TD.ROUTE_INFO = [
    '路线标记：颜色代表入口（A 橙、B 蓝、C 绿），沿路线流动的箭头指向出口——单箭头通往 X，双箭头通往 Y；入口标签和“流量预报”也写明当前通往的出口。',
    '通行变化（隔离 / 旁路直通、黑洞与锁死段的出现与消退）或通行速度变化（协议降级）时，各入口的路线同步更新，场上的地面敌人从当前位置重新寻路。',
    '确认改变路线的操作之前，可以预览每个入口的新路线：虚线是预览，实线是当前路线，变化的入口会被标出。',
    '任何操作都不能让某个入口或场上某个地面敌人无路可走。会封死的操作不能完成，也不消耗资源，被封死的位置会用红色标出。',
    `反复改道有代价：每次隔离消耗 ${TD.RULES.isolateIntel} 点情报，撤下只返还 ${Math.round(TD.RULES.sellRefund * 100)}% 算力，节点恢复直通后 ${TD.RULES.reisolate} 秒内不能再次隔离。`
  ];
  TD.RESOURCE_INFO = [
    `算力：交战中每秒自然增长 ${TD.RULES.passive}（准备阶段减半，入口更多的地图更高），消灭敌人回收。用于部署、升级塔和“备份还原”。`,
    `情报：每波结束 +${TD.RULES.waveIntel}；消灭勒索者、加壳器各 +1，Boss 更多；在交战中守住隔离节点每 ${TD.RULES.holdInterval} 秒 +1。用于隔离节点、选择升级分支和情报道具。`,
    '两种资源不能互换。撤下塔返还部分算力，塔被摧毁不退款。'
  ];
})(typeof window !== 'undefined' ? window : globalThis);
