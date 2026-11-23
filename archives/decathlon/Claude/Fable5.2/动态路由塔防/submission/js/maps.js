/* 网络安全攻防战 — 地图与波次定义 */
(function (root) {
  'use strict';
  const TD = root.TD;

  // 图例：. 虚空  # 链路  = 旧链路  N 交换节点  P 设备平台  O 数据设施(障碍)
  //       ~ 公网流(障碍)  G 气隙(障碍)  A/B/C 入口  X/Y 出口
  const MAPS = {};

  MAPS.intranet = {
    id: 'intranet', index: 1, name: '分段内网', sub: '企业网 · 14 波', code: 'XIYU-CORP-LAN',
    brief: '入口 A“门户网站”与 B“邮件网关”接入 DMZ，南端是“核心数据库”。办公网段与业务网段通过 DMZ 互联和一段旧链路相连，外围的旧系统网段与灾备环也能绕到核心。',
    tips: ['隔离【西边界】：A 改走 DMZ 互联，与 B 汇流；已在办公网段里的敌人掉头，就近的改经旧链路。', '隔离【东边界】：B 绕行灾备环——更长，但直通核心侧面。', '隔离【核心前置】：两路流量都转向外环，路程最长，防线也被拉开。'],
    rows: [
      '....OAO.........OBO....',
      '....P#############P....',
      '....P#PPOPPOPPOPP#P....',
      '....ONP..PPPPP..PNO....',
      '.PP.P#P..=====..P#P.PP.',
      '.########=POP=########.',
      '.=PP.PPP#PPOPP#PPP.PP#.',
      '.=P...OP#P...P#PO...P#.',
      '.=.....PNP.O.PNP.....#.',
      '.=P...OP#PP.PP#PO...P#.',
      '.=P.....###N###.....P#.',
      '.=......PPP#PPP......#.',
      '.#PP.PP...P#P...PP.PP#.',
      '.##########X##########.',
      '..........OOO..........'
    ],
    entries: { A: { name: '门户网站', desc: '对外 Web 门户，承载蠕虫与洪泛。' }, B: { name: '邮件网关', desc: '邮件入口，木马附件与勒索者混入。' } },
    exits: { X: { name: '核心数据库', desc: '汐域企业网的核心数据资产。' } },
    nodes: {
      '5,3': { name: '办公接入', desc: 'DMZ 通向办公网段的接入交换。隔离后新接入的 A 改走 DMZ 互联；已进入办公网段的流量不受影响。' },
      '17,3': { name: '业务接入', desc: 'DMZ 通向业务网段的接入交换。隔离后 B 改走 DMZ 互联，并入办公网段。' },
      '8,8': { name: '西边界', desc: '办公网段与核心区之间的边界交换。隔离后 A 改走 DMZ 互联，与 B 汇流；办公网段里的敌人会掉头，就近的改经旧链路。' },
      '14,8': { name: '东边界', desc: '业务网段与核心区之间的边界交换。隔离后 B 绕行东侧灾备环。' },
      '11,10': { name: '核心前置', desc: '核心数据库前的最后一台交换。隔离后两路流量转向外环。' }
    },
    zones: [
      { t: 'DMZ 互联', x: 11, y: 0.2 }, { t: '办公网段', x: 6.4, y: 7.2 }, { t: '业务网段', x: 15.8, y: 7.2 },
      { t: '旧链路', x: 11, y: 3.2 }, { t: '旧系统网段', x: 2.4, y: 9 }, { t: '灾备环', x: 19.8, y: 9 }, { t: '核心区', x: 13.3, y: 12 }
    ],
    theme: 'corp',
    start: { compute: 400, intel: 8, integrity: 20, passive: 1 },
    boss: 'boss1',
    waves: [
      { g: [['A', 'worm', 6, 1.5, 0]] },
      { g: [['A', 'worm', 6, 1.3, 0], ['B', 'worm', 5, 1.4, 2]] },
      { g: [['B', 'trojan', 3, 2.2, 0], ['A', 'worm', 8, 1.2, 1]], intro: 'trojan' },
      { g: [['A', 'flood', 2, 5, 0], ['A', 'worm', 6, 1.2, 2], ['B', 'worm', 6, 1.3, 1]], intro: 'flood' },
      { g: [['B', 'ransom', 2, 5, 0], ['B', 'trojan', 4, 2, 3], ['A', 'worm', 8, 1.1, 1]], intro: 'ransom' },
      { g: [['A', 'hotspot', 5, 1.8, 0], ['B', 'hotspot', 3, 2, 4], ['B', 'worm', 8, 1.1, 1]], intro: 'hotspot' },
      { g: [['A', 'packer', 1, 1, 2], ['A', 'worm', 10, 0.9, 0], ['B', 'packer', 1, 1, 3], ['B', 'trojan', 4, 1.6, 1]], intro: 'packer' },
      { g: [['A', 'flood', 3, 4, 0], ['A', 'worm', 10, 1, 2], ['B', 'ransom', 3, 4, 1], ['B', 'worm', 6, 1.2, 4]] },
      { g: [['A', 'hotspot', 6, 1.5, 0], ['A', 'trojan', 4, 1.8, 3], ['B', 'packer', 2, 5, 2], ['B', 'flood', 2, 5, 0], ['B', 'worm', 8, 1, 4]] },
      { g: [['A', 'worm', 14, 0.8, 0], ['A', 'packer', 2, 5, 3], ['B', 'trojan', 6, 1.5, 1], ['B', 'ransom', 3, 4, 4]] },
      { g: [['A', 'flood', 4, 3.5, 0], ['A', 'ransom', 2, 5, 4], ['B', 'hotspot', 8, 1.2, 1], ['B', 'worm', 10, 0.9, 5]] },
      { g: [['A', 'packer', 2, 6, 2], ['A', 'trojan', 6, 1.4, 0], ['A', 'worm', 10, 0.9, 6], ['B', 'flood', 3, 4, 1], ['B', 'ransom', 3, 4, 5], ['B', 'packer', 1, 1, 3]] },
      { g: [['A', 'worm', 16, 0.7, 0], ['A', 'flood', 3, 4, 4], ['A', 'hotspot', 5, 1.4, 8], ['B', 'trojan', 8, 1.3, 1], ['B', 'ransom', 4, 3.5, 5], ['B', 'packer', 2, 5, 3]] },
      { g: [['A', 'boss1', 1, 1, 6], ['A', 'worm', 10, 1, 0], ['A', 'flood', 2, 6, 14], ['B', 'ransom', 3, 5, 3], ['B', 'trojan', 5, 2, 8], ['B', 'hotspot', 6, 2, 18]], boss: true }
    ]
  };

  MAPS.backbone = {
    id: 'backbone', index: 2, name: '骨干流域', sub: '跨网专线与双活数据中心 · 15 波', code: 'XIYU-BACKBONE-WAN',
    brief: '入口 A“互联网”、C“分支专线”、B“云端互联”通向互为备份的数据中心 X、Y。公网流横贯战场，专线隧道与旧专线是仅有的两个跨越点。',
    tips: ['C、B 平时经【旧专线】汇流到 Y；隔离【汇聚节点】会把它们导向 X，与 A 在隧道口交汇。', '隔离【隧道北口】：A 沿北岸并入旧专线。', '隔离【X 前置】/【Y 前置】：流量沿南岸横穿到另一座数据中心。'],
    rows: [
      '.OAO.........OCO.....OBO.',
      '.P#P.........P#P.....P#P.',
      '.P####P......P#P.PP.PP#P.',
      '..PPP#PP.PP.PP#########P.',
      '....P##########PPP#PPP...',
      '...PPNPP.PP.PP.O.PNP.....',
      '~~~~~#~~~~~~~~~~~~=~~~~~~',
      '~~~~~#~~~~~~~~~~~~=~~~~~~',
      '~~~~~#~~~~~~~~~~~~=~~~~~~',
      '...PP#PP.........P#P.....',
      '....P#PPP.PP.PP.PP#P.....',
      '....P##############P.....',
      '.....PPPPNPP.PPNPPPP.....',
      '.......OP#PO.OP#PO.......',
      '.......OOXOO.OOYOO.......',
      '........OOO...OOO........'
    ],
    entries: { A: { name: '互联网', desc: '公网入口，蠕虫与洪泛成规模涌入。' }, C: { name: '分支专线', desc: '分支机构专线，木马与勒索者借信任关系渗入。' }, B: { name: '云端互联', desc: '云上互联，加壳器掩护的混合流量。' } },
    exits: { X: { name: '数据中心 X', desc: '西侧数据中心，与 Y 互为备份。' }, Y: { name: '数据中心 Y', desc: '东侧数据中心，与 X 互为备份。' } },
    nodes: {
      '5,5': { name: '隧道北口', desc: '专线隧道的北岸接入。隔离后 A 沿北岸并入旧专线，流向 Y。' },
      '18,5': { name: '汇聚节点', desc: 'C、B 汇流后进入旧专线的汇聚交换。隔离后二者改走专线隧道，流向 X。' },
      '9,12': { name: 'X 前置', desc: '数据中心 X 的接入交换。隔离后 A 沿南岸横穿至 Y。' },
      '15,12': { name: 'Y 前置', desc: '数据中心 Y 的接入交换。隔离后 C 改走隧道、B 沿南岸横穿，均流向 X。' }
    },
    zones: [
      { t: '公网流', x: 11.5, y: 7 }, { t: '专线隧道', x: 3.2, y: 7 }, { t: '旧专线', x: 20, y: 7 },
      { t: '北岸汇聚带', x: 10, y: 2.6 }, { t: '南岸双活互联', x: 12, y: 9.8 }
    ],
    theme: 'wan',
    start: { compute: 560, intel: 10, integrity: 20, passive: 1.3 },
    boss: 'boss2',
    waves: [
      { g: [['A', 'worm', 6, 1.5, 0]] },
      { g: [['C', 'worm', 4, 2.0, 0], ['B', 'worm', 4, 2.0, 1.2]] },
      { g: [['A', 'worm', 6, 1.2, 0], ['A', 'trojan', 3, 2.2, 3], ['C', 'trojan', 2, 3, 1]], intro: 'trojan' },
      { g: [['B', 'flood', 2, 5, 0], ['B', 'worm', 6, 1.2, 2], ['A', 'worm', 6, 1.3, 1]], intro: 'flood' },
      { g: [['C', 'ransom', 2, 5, 0], ['C', 'worm', 5, 1.3, 2], ['A', 'hotspot', 4, 2, 2]], intro: 'ransom' },
      { g: [['A', 'packer', 1, 1, 3], ['A', 'worm', 10, 0.9, 0], ['B', 'hotspot', 5, 1.6, 2]], intro: 'packer' },
      { g: [['B', 'flood', 3, 4, 0], ['B', 'packer', 1, 1, 2], ['C', 'trojan', 5, 1.6, 1], ['A', 'worm', 8, 1.1, 2]] },
      { g: [['A', 'ransom', 3, 4, 0], ['A', 'worm', 8, 1, 2], ['C', 'hotspot', 6, 1.5, 1], ['B', 'worm', 8, 1.1, 3]] },
      { g: [['A', 'worm', 14, 0.7, 0], ['A', 'flood', 3, 4, 2], ['C', 'worm', 10, 0.8, 0], ['C', 'trojan', 5, 1.6, 3], ['C', 'flood', 2, 5, 4], ['B', 'worm', 12, 0.7, 0], ['B', 'flood', 3, 4, 1], ['B', 'packer', 2, 5, 3]], surge: true },
      { g: [['A', 'hotspot', 8, 1.2, 0], ['C', 'ransom', 3, 4, 1], ['C', 'packer', 1, 1, 2], ['B', 'trojan', 6, 1.5, 0]] },
      { g: [['A', 'flood', 4, 3.5, 0], ['A', 'packer', 2, 5, 2], ['B', 'ransom', 3, 4, 1], ['B', 'worm', 10, 0.9, 4], ['C', 'worm', 8, 1, 2]] },
      { g: [['A', 'trojan', 8, 1.3, 0], ['A', 'worm', 10, 0.9, 5], ['C', 'flood', 3, 4, 1], ['B', 'hotspot', 8, 1.2, 2], ['B', 'packer', 2, 5, 3]] },
      { g: [['A', 'worm', 16, 0.7, 0], ['A', 'ransom', 3, 4, 4], ['C', 'trojan', 6, 1.4, 1], ['C', 'packer', 2, 5, 3], ['B', 'flood', 4, 3.5, 0]] },
      { g: [['A', 'flood', 4, 3.5, 0], ['A', 'hotspot', 8, 1.2, 4], ['C', 'ransom', 4, 3.5, 1], ['C', 'worm', 10, 0.9, 5], ['B', 'packer', 3, 4, 2], ['B', 'trojan', 8, 1.3, 0]] },
      { g: [['C', 'boss2', 1, 1, 6], ['C', 'worm', 8, 1.1, 0], ['A', 'worm', 12, 1, 2], ['A', 'flood', 2, 6, 12], ['B', 'hotspot', 6, 2, 8], ['B', 'ransom', 3, 5, 16]], boss: true }
    ]
  };

  MAPS.airgap = {
    id: 'airgap', index: 3, name: '气隙深层', sub: '工控网 · 16 波', code: 'XIYU-ICS-DEEP',
    brief: '入口 A“运维跳板机”、B“办公网下行”、C“供应商远程维护”围绕中央气隙接入，出口是“过程控制核心”X 与“安全联锁核心”Y。运维环绕过气隙连通南北，老工控总线是较慢的支路。',
    tips: ['隔离西廊节点，A 会转向东廊压向 Y；隔离东廊节点，B 会转向西廊压向 X。', '【东廊上闸】只把 B 逼上老工控总线——更慢，木马显形，但仍指向 Y。', '【西廊下闸】同时改变 A 与 C：A 去东廊，C 走老工控总线。'],
    rows: [
      '...OAO.............OBO...',
      '...P#P.............P#P...',
      '...P#PP...........PP#P...',
      '...P#PPPP.PP.PP.PPPP#P...',
      '..PP#################PP..',
      '.....PP#GGGGGGGGG#PP=P...',
      '.C..PPPNGGGGGGGGGNPP=P...',
      '.#P..PP#GGGGGGGGG#PP=....',
      '.#PPPPP#GGGGGGGGG#PP=P...',
      '.#######GGGGGGGGG#===P...',
      '.PPP=PP#GGGGGGGGG#PPPP...',
      '...P=PPNGGGGGGGGGNPP.....',
      '...P=PP###########PP.....',
      '...P=.P#PPP.PPP.P#P......',
      '...P===#O.......O#P......',
      '.....OOXOO.....OOYOO.....',
      '......OOO.......OOO......'
    ],
    entries: { A: { name: '运维跳板机', desc: '运维人员的跳板机，被攻陷后成为主攻方向。' }, B: { name: '办公网下行', desc: '办公网到生产网的下行通道。' }, C: { name: '供应商远程维护', desc: '第三方远程维护通道，路程最短。' } },
    exits: { X: { name: '过程控制核心', desc: '控制生产过程的 DCS 核心。' }, Y: { name: '安全联锁核心', desc: '保障停车与联锁的 SIS 核心。' } },
    nodes: {
      '7,6': { name: '西廊上闸', desc: '运维环西廊上段。隔离后 A 绕北段转入东廊，压向 Y；C 不受影响。' },
      '7,11': { name: '西廊下闸', desc: '运维环西廊下段。隔离后 A 转入东廊，C 改走老工控总线。' },
      '17,6': { name: '东廊上闸', desc: '运维环东廊上段。隔离后 B 被迫改走老工控总线，仍流向 Y。' },
      '17,11': { name: '东廊下闸', desc: '运维环东廊下段。隔离后 B 绕北段转入西廊，压向 X。' }
    },
    zones: [
      { t: '气 隙', x: 12, y: 8 }, { t: '运维环 · 北段', x: 12, y: 2.9 }, { t: '运维环 · 南段', x: 12, y: 13.1 },
      { t: '西廊', x: 5.6, y: 7.4 }, { t: '东廊', x: 18.6, y: 10.6 }, { t: '老工控总线', x: 2.4, y: 12 }, { t: '老工控总线', x: 22, y: 7 }
    ],
    theme: 'ics',
    start: { compute: 620, intel: 12, integrity: 20, passive: 1.4 },
    boss: 'boss3',
    waves: [
      { g: [['A', 'worm', 6, 1.5, 0]] },
      { g: [['B', 'worm', 6, 1.3, 0], ['A', 'worm', 4, 1.5, 2]] },
      { g: [['C', 'trojan', 3, 2.4, 0], ['A', 'worm', 6, 1.2, 1]], intro: 'trojan' },
      { g: [['B', 'flood', 2, 5, 0], ['B', 'worm', 6, 1.2, 2], ['C', 'worm', 4, 1.5, 1]], intro: 'flood' },
      { g: [['A', 'ransom', 2, 5, 0], ['A', 'worm', 6, 1.2, 2], ['B', 'trojan', 4, 2, 1]], intro: 'ransom' },
      { g: [['B', 'hotspot', 5, 1.6, 0], ['C', 'hotspot', 3, 2, 2], ['A', 'worm', 8, 1.1, 1]], intro: 'hotspot' },
      { g: [['A', 'packer', 1, 1, 3], ['A', 'worm', 10, 0.9, 0], ['C', 'trojan', 4, 1.8, 1], ['C', 'ransom', 1, 1, 6]], intro: 'packer' },
      { g: [['B', 'flood', 3, 4, 0], ['B', 'packer', 1, 1, 2], ['B', 'worm', 8, 1, 3], ['A', 'trojan', 5, 1.6, 1]] },
      { g: [['A', 'ransom', 3, 4, 0], ['A', 'worm', 10, 0.9, 2], ['B', 'hotspot', 6, 1.5, 1], ['C', 'flood', 2, 5, 3]] },
      { g: [['A', 'worm', 14, 0.7, 0], ['A', 'flood', 3, 4, 2], ['A', 'packer', 1, 1, 4], ['B', 'worm', 14, 0.7, 0], ['B', 'flood', 3, 4, 1], ['B', 'ransom', 2, 5, 4], ['C', 'worm', 8, 0.9, 0], ['C', 'trojan', 6, 1.5, 2], ['C', 'flood', 2, 5, 5]], surge: true },
      { g: [['C', 'packer', 2, 5, 1], ['C', 'trojan', 6, 1.5, 0], ['B', 'ransom', 4, 3.5, 1], ['B', 'worm', 8, 1, 4], ['A', 'hotspot', 6, 1.5, 2]] },
      { g: [['A', 'flood', 4, 3.5, 0], ['A', 'worm', 12, 0.8, 3], ['B', 'packer', 2, 5, 2], ['B', 'trojan', 6, 1.5, 0], ['C', 'ransom', 2, 5, 2], ['C', 'hotspot', 4, 1.8, 5]] },
      { g: [['A', 'trojan', 8, 1.3, 0], ['A', 'packer', 2, 5, 3], ['B', 'flood', 4, 3.5, 0], ['B', 'hotspot', 6, 1.4, 5], ['C', 'worm', 10, 0.9, 1]] },
      { g: [['A', 'worm', 16, 0.7, 0], ['A', 'ransom', 4, 3.5, 3], ['B', 'trojan', 8, 1.3, 0], ['B', 'flood', 3, 4, 4], ['C', 'packer', 2, 5, 2], ['C', 'flood', 2, 5, 5]] },
      { g: [['A', 'flood', 5, 3, 0], ['A', 'packer', 3, 4, 2], ['A', 'hotspot', 8, 1.2, 6], ['B', 'worm', 16, 0.7, 0], ['B', 'ransom', 4, 3.5, 4], ['B', 'packer', 2, 5, 2], ['C', 'trojan', 8, 1.3, 1]] },
      { g: [['A', 'boss3', 1, 1, 6], ['A', 'packer', 2, 6, 0], ['B', 'worm', 12, 1, 2], ['B', 'flood', 3, 6, 10], ['C', 'trojan', 5, 2.2, 6], ['C', 'ransom', 2, 6, 14]], boss: true }
    ]
  };

  TD.MAPS = MAPS;
  TD.MAP_ORDER = ['intranet', 'backbone', 'airgap'];
  TD.ENTRY_COLORS = { A: '#ff9838', B: '#45b6ff', C: '#a6f04a' };
  TD.EXIT_COLORS = { X: '#e9f6ff', Y: '#ffe27a' };

  // 解析地图为网格
  TD.parseMap = function (def) {
    const H = def.rows.length, W = def.rows[0].length;
    const cells = new Array(W * H);
    const entries = [], exits = [], nodes = [];
    for (let y = 0; y < H; y++) {
      if (def.rows[y].length !== W) throw new Error('地图行宽不一致: ' + def.id + ' 行 ' + y + ' = ' + def.rows[y].length);
      for (let x = 0; x < W; x++) {
        const ch = def.rows[y][x];
        const c = { i: y * W + x, x, y, ch, type: 'void', walk: false, legacy: false, id: null, name: '' };
        if (ch === '#') { c.type = 'link'; c.walk = true; }
        else if (ch === '=') { c.type = 'link'; c.walk = true; c.legacy = true; }
        else if (ch === 'N') { c.type = 'node'; c.walk = true; const nd = def.nodes[x + ',' + y] || { name: '节点', desc: '' }; c.name = nd.name; c.desc = nd.desc; nodes.push(c); }
        else if (ch === 'P') c.type = 'platform';
        else if (ch === 'O') { c.type = 'obstacle'; c.kind = 'facility'; }
        else if (ch === '~') { c.type = 'obstacle'; c.kind = 'flow'; }
        else if (ch === 'G') { c.type = 'obstacle'; c.kind = 'gap'; }
        else if (ch === 'A' || ch === 'B' || ch === 'C') { c.type = 'entry'; c.walk = true; c.id = ch; c.name = def.entries[ch].name; entries.push(c); }
        else if (ch === 'X' || ch === 'Y') { c.type = 'exit'; c.walk = true; c.id = ch; c.name = def.exits[ch].name; exits.push(c); }
        cells[c.i] = c;
      }
    }
    entries.sort((a, b) => (a.id < b.id ? -1 : 1));
    exits.sort((a, b) => (a.id < b.id ? -1 : 1));
    // 邻接
    for (const c of cells) {
      c.nb = [];
      for (let d = 0; d < 4; d++) {
        const nx = c.x + TD.DIRS[d][0], ny = c.y + TD.DIRS[d][1];
        c.nb.push(nx >= 0 && ny >= 0 && nx < W && ny < H ? ny * W + nx : -1);
      }
    }
    return { def, W, H, cells, entries, exits, nodes };
  };
})(typeof window !== 'undefined' ? window : globalThis);
