/* 单位、波次、图鉴文案。数值是玩法的一部分，界面直接读这里。 */
(function (root) {
  'use strict';
  var TD = root.TD = root.TD || {};

  TD.START = {
    intranet: { c: 260, i: 62 },
    backbone: { c: 310, i: 82 },
    ics: { c: 330, i: 90 }
  };

  TD.TOWERS = {
    firewall: {
      id: 'firewall', name: '防火墙', role: '阻挡',
      costC: 86, nodeI: 26, upC: 70,
      hp: 360, hp2: 520, cap: 2, cap2: 4,
      dmg: 15, dmg2: 24, interval: 0.75,
      skill: '过载屏障', skillCd: 14, skillDur: 5,
      place: '链路或交换节点',
      blurb: '把近战流量拦在原地。放在节点上会隔离该节点，并拦住相邻链路。',
      manual: '部署在链路时按阻挡容量截停敌人，超过容量的单位会从旁边挤过去，道路本身保持可通行。被拦住的攻塔单位会捶打防火墙。部署在交换节点上时，该格改为不可通行，防火墙同时拦截相邻链路上的敌人。二级提高容量和反击，能独自卡住洪泛团。过载屏障在短时间里提高容量、反击和减伤。加密不会解除它的阻挡或节点隔离。'
    },
    honeypot: {
      id: 'honeypot', name: '蜜罐', role: '诱敌',
      costC: 62, upC: 46, upI: 24,
      hp: 150, cap: 2,
      attract: 3.35,
      skill: '诱捕', skillCd: 16, skillDur: 3.4,
      place: '仅链路',
      blurb: '伪造应答，把会打设备的地面敌人引到自己身上。耐久低，但不会被加密。',
      manual: '吸引范围内的蠕虫和勒索者改道来攻击蜜罐，从而替后面的设备承受伤害。被挡住的敌人停在蜜罐格上。诱捕能把已经引来的敌人定在原地数秒。二级必须二选一：深度伪造扩大吸引范围和容量，连洪泛团也会被引开；载荷反噬让攻击者受到反伤，蜜罐被摧毁时还会爆开。蜜罐免疫加密。'
    },
    gate: {
      id: 'gate', name: '网闸', role: '隔离',
      costC: 40, nodeI: 26, upC: 58,
      hp: 620, hp2: 980,
      skill: '闸锁加固', skillCd: 18, skillShield: 240,
      place: '仅交换节点',
      blurb: '便宜的道路开关。不攻击，但很耐打，专门用来改道。',
      manual: '只能放在交换节点上，放置即隔离该节点，敌人必须改走其他道路。它不反击，洪泛团、万傀和勒索者都可以把它拆掉；拆掉之后节点旁路直通，并进入短暂的重构时间，不能马上再隔离。二级在相邻链路上附加减速，敌人会按新的通行速度重新选路。闸锁加固给自己套上一层厚护盾。守住由网闸维持的隔离，会持续产出情报。'
    },
    intercept: {
      id: 'intercept', name: '拦截器', role: '远程',
      costC: 114, upC: 66, upI: 28,
      hp: 176, range: 5.6, cone: 0.78,
      dmg: 28, interval: 0.7,
      skill: '超频锁定', skillCd: 12, skillDur: 4,
      place: '设备平台，需设定朝向',
      blurb: '朝向决定扇形射界，地面和飞行目标都能打，优先打离出口最近的。',
      manual: '放在高出台面上，确认前用指针设定朝向，射界之外的敌人不会被主动选中。优先攻击沿路线最接近出口、且已经显形的目标。伪装木马和潜伏中的蛰影不能被它主动锁定。二级二选一：贯穿把一次射击打成一条直线，线上的单位都会受伤，误伤未显形目标时会触发载荷；压制降低射速换取命中减速，对伪热点更有价值。超频锁定在短时间里大幅提高射速。'
    },
    sandbox: {
      id: 'sandbox', name: '沙箱', role: '检测',
      costC: 120, upC: 84,
      hp: 188, range: 3.7, range2: 5.05,
      dmg: 17, dmg2: 26, interval: 1.12, interval2: 0.92,
      skill: '深度淬火', skillCd: 12, skillDmg: 40,
      place: '设备平台',
      blurb: '揭开伪装，并对一片地面流量做范围打击。适合守汇流。',
      manual: '周期性地把范围内伪装、潜伏单位标成显形，然后对范围内地面敌人造成伤害。显形发生在打击之前，因此被沙箱自己击破的木马不会爆载荷；若木马死于贯穿或溅射且当时还未显形，才会释放载荷伤害附近设备。沙箱打不到飞行单位。二级扩大检测圈并提高打击频率，用来覆盖整段汇流。深度淬火立刻再扫描一次并造成更高伤害。'
    },
    repair: {
      id: 'repair', name: '修复进程', role: '治疗',
      costC: 98, upC: 76,
      hp: 168, range: 3.9, range2: 5.3,
      heal: 18, heal2: 30,
      skill: '冗余切换', skillCd: 20, skillShield: 110, skillDur: 6.5,
      place: '设备平台',
      blurb: '不攻击。持续治疗范围内受损设备，关键时刻可以解加密、上护盾。',
      manual: '每秒治疗范围内其他受损设备，不治疗自己，也不能解除加密。加密会让被加密的修复进程暂停治疗和技能，但它已展开的节点隔离并不因此消失。冗余切换为范围内友方套上护盾并清除加密，用来保住即将被拆掉的网闸或防火墙。二级加大治疗量和覆盖，能够同时照看两条通道上的设备。'
    }
  };

  TD.BRANCHES = {
    mirror: { tower: 'honeypot', name: '深度伪造', text: '吸引半径和阻挡容量显著提高，洪泛团也会被伪造应答引离当前路线。' },
    reflect: { tower: 'honeypot', name: '载荷反噬', text: '攻击蜜罐的单位受到反伤；蜜罐被摧毁时对周围敌人造成一次爆发。' },
    pierce: { tower: 'intercept', name: '贯穿', text: '射击改为窄直线，命中线上全部单位。未显形目标若被这条线波及击破，会释放载荷。' },
    suppress: { tower: 'intercept', name: '压制', text: '改为高频低伤，并让命中目标减速。适合压住伪热点和成群蠕虫，而不是一击穿群。' }
  };

  TD.ENEMIES = {
    worm: {
      id: 'worm', name: '蠕虫', hp: 96, speed: 1.28, leak: 5, rewardC: 8, rewardI: 0,
      block: 1, melee: 10, meleeCd: 0.68, taunt: true, split: true,
      manual: '被阻挡时会持续啃咬挡住它的设备。第一次经过直通的交换节点时复制一只同伴，复制体不再复制。会响应蜜罐。'
    },
    flood: {
      id: 'flood', name: '洪泛团', hp: 280, speed: 0.8, leak: 10, rewardC: 15, rewardI: 3,
      block: 3, melee: 30, meleeCd: 0.72, divert: 8, priority: true,
      manual: '体积大，占用 3 点阻挡容量，普通防火墙挡不住。发现附近被隔离的节点时会离开当前路线，走到可通行的一侧重击节点上的设备或隔离器，打通后沿重新打开的道路继续前进。'
    },
    trojan: {
      id: 'trojan', name: '木马', hp: 82, speed: 1.42, leak: 6, rewardC: 11, rewardI: 3,
      block: 1, camo: true, payload: 46, payloadR: 2.15, priority: true,
      manual: '伪装成正常封装。显形前不能被远程单体攻击主动选中。沙箱检测、踏上旧链路、被阻挡，都会使它显形。若在仍未显形时被贯穿或溅射击破，会释放载荷，伤害附近设备。'
    },
    ransom: {
      id: 'ransom', name: '勒索者', hp: 124, speed: 1.02, leak: 7, rewardC: 16, rewardI: 4,
      block: 1, taunt: true, range: 4.35, shot: 13, shotCd: 1.32, encrypt: 4.4, priority: true,
      manual: '边走边射击射程内的设备，包括高台上的设备，造成伤害并施加加密。射程内有蜜罐时优先打蜜罐。加密期间设备不能攻击、治疗或放技能，但阻挡和节点隔离仍然有效。'
    },
    flyer: {
      id: 'flyer', name: '伪热点', hp: 100, speed: 1.62, leak: 6, rewardC: 12, rewardI: 2,
      block: 1, flying: true, priority: true,
      manual: '沿无线层从入口直飞当时选定的出口，不走地面道路，也不能被阻挡。只有拦截器的射界能处理它。'
    },
    shell: {
      id: 'shell', name: '加壳器', hp: 156, speed: 0.96, leak: 5, rewardC: 14, rewardI: 3,
      block: 1, giveShield: 52, giveCd: 2.05, giveR: 2.25, priority: true,
      manual: '自身不擅长拆塔，但会给附近同伴套上可被打破的护盾。先打掉加壳器，还是啃穿前排护盾，是波次中的取舍。'
    },
    wankui: {
      id: 'wankui', name: '万傀', boss: true, hp: 3400, speed: 0.5, leak: 26, rewardC: 100, rewardI: 20,
      block: 9, melee: 24, meleeCd: 0.78, divert: 10, slam: 190,
      manual: '分段内网的终局。以僵尸网络的方式冲击隔离节点：先预警，再重创节点上的设备并尝试冲毁隔离。生命过半后打开傀儡笼，持续放出蠕虫。'
    },
    mirage: {
      id: 'mirage', name: '蜃楼', boss: true, hp: 3800, speed: 0.47, leak: 26, rewardC: 110, rewardI: 22,
      block: 9, melee: 16, meleeCd: 0.9,
      manual: '骨干流域的终局。伪路由会在一条仍能保持连通的链路段落上预警，然后制造临时路由黑洞，截断通行、迫使各入口改道。生命过半后发动路由风暴，持续撕掉附近设备的护盾。'
    },
    shadow: {
      id: 'shadow', name: '蛰影', boss: true, hp: 4200, speed: 0.45, leak: 28, rewardC: 120, rewardI: 24,
      block: 9, melee: 20, meleeCd: 0.82, camo: true, armor: 0.6,
      manual: '气隙深层的终局，按潜伏、提权、破坏三阶段变化。潜伏时和木马一样，必须先检测才能被远程单体选中。提权后显形、获得护甲并释放木马。破坏阶段预警后锁死前方一段运维环，迫使路线重新收敛。'
    }
  };

  TD.ITEMS = {
    isolator: {
      id: 'isolator', name: '应急隔离器', cost: '情报 16', costI: 16, cd: 17,
      place: '直通的交换节点',
      blurb: '临时隔离一个节点。有耐久和时限，被打掉或到期即失效，不产出情报。',
      manual: '投放到直通节点上，预览会显示各入口的新路线。会封死入口或场上敌人的投放无效，也不消耗资源。隔离器耐久 200，持续约 11 秒。它不视为“守住隔离节点”，因此不产出情报。失效后节点进入较短的重构时间。'
    },
    downgrade: {
      id: 'downgrade', name: '协议降级', cost: '情报 16', costI: 16, cd: 18,
      place: '一片链路',
      blurb: '让一片链路暂时改用旧协议：地面敌人减速、伪装显形，并按新速度重新选路。',
      manual: '以落点为中心，半径约 2.2 格内的链路在 8.5 秒内视为旧链路。已经站在上面的木马会显形。路线按通行时间重算，敌人可能为了躲开慢区而改道。不影响飞行单位。'
    },
    restore: {
      id: 'restore', name: '备份还原', cost: '算力 34', costC: 34, cd: 13,
      place: '一座设备',
      blurb: '恢复一座设备的部分生命，并解除加密。',
      manual: '立即回复目标约 46% 最大生命，并清除加密。不能复活已经摧毁的设备。与修复进程的区别是：它即时、昂贵，而且专门用来解加密。'
    }
  };

  TD.STATUSES = [
    { id: 'reveal', name: '显形', text: '伪装或潜伏被打破后，远程单体可以锁定。沙箱、旧链路、阻挡都能造成显形。显形不会自己消退。' },
    { id: 'shield', name: '护盾', text: '先于生命吸收伤害，耗尽后破碎。加壳器把护盾给同伴；闸锁加固、冗余切换和部分技能把护盾给设备。路由风暴会直接削掉护盾。' },
    { id: 'encrypt', name: '加密', text: '设备暂时不能攻击、治疗、释放技能。阻挡关系和节点隔离保持有效。蜜罐免疫。冗余切换和备份还原可以解除。' },
    { id: 'root', name: '诱捕', text: '敌人被定在原地，不能移动，但仍可攻击。时间结束后续走。' },
    { id: 'slow', name: '减速', text: '来自旧协议、网闸二级光环或拦截器压制。旧协议和网闸光环会改变通行时间，从而影响选路；压制只影响被命中的那一只。' },
    { id: 'armor', name: '护甲', text: '蛰影提权后受到的伤害降低，直到进入破坏阶段。' }
  ];

  TD.TERRAIN = [
    { id: 'path', name: '链路', text: '敌人和业务流量通行的道路。防火墙和蜜罐可以部署在入口、出口以外的链路上。阻挡不会把道路标成不可通行。' },
    { id: 'old', name: '旧链路', text: '保留旧协议。地面敌人通过时减速，伪装木马踏上后显形。寻路会把这段较慢的通行时间算进去。' },
    { id: 'node', name: '交换节点', text: '链路交汇处。部署防火墙、网闸或投入应急隔离器会隔离该格，敌人不能再走这里。设备被摧毁、撤下或隔离器失效后旁路直通，并有一段时间不能再次隔离。' },
    { id: 'platform', name: '设备平台', text: '高于链路的台面，用来部署拦截器、沙箱和修复进程。敌人不能走上台面，但勒索者的远程攻击打得到。' },
    { id: 'obstacle', name: '障碍', text: '数据设施、公网流或气隙。不能通行，也不能部署。' },
    { id: 'spawn', name: '入口', text: '入侵流量的接入点。不能在入口格上建塔。每条入口在任何时候都必须至少能到达一座中枢。' },
    { id: 'exit', name: '出口 / 中枢', text: '敌人到达这里会降低中枢完整度。完整度归零则本次事件失败。' }
  ];

  function S(ent, type, n, gap, delay) {
    return { ent: ent, type: type, n: n, gap: gap == null ? 1.05 : gap, delay: delay || 0 };
  }
  function W(prep, c, i, spawns) { return { prep: prep, grantC: c, grantI: i, spawns: spawns }; }

  TD.WAVES = {
    intranet: [
      W(12, 18, 6, [S('A', 'worm', 5, 1.15)]),
      W(9, 20, 6, [S('A', 'worm', 4, 1.0), S('B', 'worm', 4, 1.05, 1.2)]),
      W(9, 22, 8, [S('A', 'trojan', 5, 1.1), S('B', 'worm', 3, 1.1, 2)]),
      W(8, 22, 8, [S('B', 'worm', 5, 0.9), S('A', 'trojan', 3, 1.0, 1.5), S('A', 'worm', 3, 1.0, 3)]),
      W(8, 24, 8, [S('B', 'flood', 2, 2.2), S('A', 'worm', 4, 0.95, 1), S('B', 'worm', 3, 1, 2.4)]),
      W(8, 24, 8, [S('A', 'ransom', 2, 2.0), S('B', 'worm', 4, 0.9, 0.6), S('B', 'trojan', 3, 1, 2)]),
      W(8, 26, 8, [S('A', 'flyer', 3, 1.4), S('B', 'flyer', 2, 1.5, 1.2), S('A', 'worm', 4, 0.9)]),
      W(8, 26, 9, [S('A', 'shell', 2, 1.8), S('A', 'worm', 5, 0.75, 0.4), S('B', 'trojan', 4, 0.9, 1)]),
      W(8, 28, 9, [S('A', 'flood', 2, 2), S('B', 'flood', 2, 2, 1.5), S('A', 'ransom', 2, 1.8, 0.8)]),
      W(8, 28, 10, [S('A', 'trojan', 6, 0.7), S('B', 'trojan', 5, 0.75, 0.5), S('B', 'flyer', 3, 1.2, 1)]),
      W(7, 30, 10, [S('A', 'flood', 3, 1.6), S('B', 'worm', 5, 0.7), S('A', 'shell', 2, 1.5, 1), S('B', 'ransom', 2, 1.6, 2)]),
      W(7, 32, 10, [S('A', 'worm', 6, 0.6), S('B', 'flood', 2, 1.8, 0.4), S('A', 'ransom', 2, 1.5, 1), S('B', 'flyer', 3, 1, 1.2)]),
      W(7, 34, 12, [S('A', 'flood', 2, 1.5), S('B', 'flood', 2, 1.5, 1), S('A', 'shell', 2, 1.4), S('B', 'trojan', 4, 0.7, 0.5), S('A', 'ransom', 2, 1.4, 2)]),
      W(8, 40, 14, [S('A', 'wankui', 1, 1, 1.2), S('A', 'worm', 4, 0.8, 6), S('B', 'worm', 4, 0.8, 7), S('B', 'flood', 1, 1, 9)])
    ],
    backbone: [
      W(12, 20, 7, [S('A', 'worm', 5, 1.1)]),
      W(9, 22, 7, [S('A', 'worm', 3, 1), S('C', 'worm', 4, 1, 0.8)]),
      W(9, 22, 8, [S('B', 'worm', 4, 1), S('A', 'trojan', 4, 1, 1)]),
      W(8, 24, 8, [S('C', 'trojan', 4, 0.95), S('B', 'worm', 4, 0.9, 0.6), S('A', 'flyer', 2, 1.4, 1.5)]),
      W(8, 24, 8, [S('C', 'flood', 2, 2), S('B', 'worm', 4, 0.85, 0.5), S('A', 'worm', 4, 0.9)]),
      W(8, 26, 9, [S('B', 'ransom', 2, 1.8), S('A', 'shell', 2, 1.6, 0.4), S('C', 'worm', 4, 0.8, 1)]),
      W(8, 26, 9, [S('A', 'flyer', 4, 1.1), S('C', 'trojan', 4, 0.85, 0.4), S('B', 'flyer', 2, 1.3, 1)]),
      W(8, 28, 9, [S('A', 'flood', 2, 1.8), S('C', 'ransom', 2, 1.6, 0.8), S('B', 'shell', 2, 1.5, 1.2)]),
      W(8, 30, 10, [S('A', 'worm', 5, 0.55), S('C', 'flood', 2, 1.4, 0.3), S('B', 'flood', 2, 1.4, 0.8), S('A', 'flyer', 3, 1, 0.5)]),
      W(7, 34, 12, [S('A', 'flood', 3, 1.3), S('C', 'flood', 3, 1.3, 0.4), S('B', 'flood', 3, 1.3, 0.7), S('A', 'worm', 4, 0.6), S('C', 'worm', 4, 0.6, 0.3), S('B', 'ransom', 2, 1.4, 1.5)]),
      W(7, 30, 10, [S('A', 'trojan', 5, 0.7), S('C', 'shell', 2, 1.4, 0.5), S('B', 'trojan', 4, 0.75, 0.4), S('A', 'ransom', 2, 1.5, 1)]),
      W(7, 32, 10, [S('C', 'flood', 2, 1.5), S('B', 'ransom', 2, 1.4, 0.6), S('A', 'shell', 2, 1.3), S('A', 'flyer', 3, 0.9, 0.4)]),
      W(7, 34, 12, [S('A', 'flood', 2, 1.4), S('C', 'worm', 6, 0.5, 0.2), S('B', 'flood', 2, 1.5, 0.8), S('B', 'flyer', 3, 0.9, 1)]),
      W(6, 36, 12, [S('A', 'ransom', 3, 1.2), S('C', 'shell', 2, 1.3, 0.4), S('B', 'trojan', 5, 0.6, 0.3), S('A', 'flood', 2, 1.6, 1)]),
      W(8, 42, 16, [S('A', 'mirage', 1, 1, 1), S('C', 'flood', 2, 1.8, 5), S('B', 'worm', 4, 0.7, 6), S('A', 'flyer', 3, 1.1, 4)])
    ],
    ics: [
      W(12, 20, 7, [S('A', 'worm', 5, 1.1)]),
      W(9, 22, 7, [S('A', 'worm', 3, 1), S('B', 'worm', 4, 1, 0.7)]),
      W(9, 22, 8, [S('C', 'trojan', 4, 1), S('A', 'worm', 3, 1, 1.2)]),
      W(8, 24, 8, [S('B', 'worm', 4, 0.9), S('C', 'worm', 4, 0.95, 0.5), S('A', 'trojan', 3, 1,1, 1)]),
      W(8, 24, 8, [S('A', 'flood', 2, 2), S('B', 'worm', 4, 0.8, 0.4), S('C', 'flyer', 2, 1.4, 1.2)]),
      W(8, 26, 8, [S('C', 'ransom', 2, 1.7), S('A', 'trojan', 4, 0.9, 0.4), S('B', 'shell', 1, 1, 1.5)]),
      W(8, 26, 9, [S('B', 'flood', 2, 1.8), S('A', 'flyer', 3, 1.2, 0.5), S('C', 'worm', 4, 0.85)]),
      W(8, 28, 9, [S('A', 'shell', 2, 1.5), S('A', 'worm', 5, 0.7, 0.3), S('C', 'trojan', 4, 0.8, 0.6), S('B', 'ransom', 1, 1, 2)]),
      W(8, 28, 9, [S('C', 'flood', 2, 1.7), S('B', 'trojan', 4, 0.8, 0.4), S('A', 'ransom', 2, 1.5, 1)]),
      W(7, 30, 10, [S('A', 'flyer', 4, 0.95), S('B', 'flood', 2, 1.6, 0.4), S('C', 'shell', 2, 1.4, 0.8)]),
      W(7, 34, 12, [S('A', 'flood', 3, 1.25), S('B', 'flood', 2, 1.4, 0.5), S('C', 'flood', 2, 1.4, 0.9), S('A', 'worm', 4, 0.55), S('B', 'worm', 4, 0.55, 0.2), S('C', 'ransom', 2, 1.3, 1.2)]),
      W(7, 30, 10, [S('C', 'trojan', 6, 0.65), S('A', 'shell', 2, 1.4, 0.4), S('B', 'worm', 5, 0.6)]),
      W(7, 32, 11, [S('A', 'ransom', 2, 1.4), S('B', 'flood', 2, 1.5, 0.6), S('C', 'flyer', 3, 1, 0.4), S('A', 'trojan', 4, 0.7)]),
      W(6, 34, 12, [S('A', 'flood', 2, 1.4), S('C', 'shell', 2, 1.3, 0.3), S('B', 'ransom', 2, 1.3, 0.8), S('C', 'worm', 5, 0.55, 0.4)]),
      W(6, 36, 12, [S('A', 'worm', 6, 0.5), S('B', 'flood', 2, 1.4, 0.4), S('C', 'trojan', 5, 0.6, 0.2), S('A', 'flyer', 3, 0.9, 1)]),
      W(8, 44, 16, [S('A', 'shadow', 1, 1, 1.1), S('B', 'worm', 4, 0.7, 5), S('C', 'trojan', 4, 0.75, 6), S('A', 'flood', 1, 1, 8)])
    ]
  };

  TD.bossOf = { intranet: 'wankui', backbone: 'mirage', ics: 'shadow' };
})(typeof window !== 'undefined' ? window : globalThis);
