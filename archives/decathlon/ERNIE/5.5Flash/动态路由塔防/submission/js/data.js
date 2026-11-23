/* ============================================================
 * 数据层：塔 / 敌人 / Boss / 道具 / 波次 / 图鉴 / 图标
 * ============================================================ */
const DATA = (() => {

/* ---------- 图标 ---------- */
const svg = (inner, vb='0 0 64 64') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

const ICONS = {
  firewall: svg(`
    <defs><linearGradient id="fw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ff7ff"/><stop offset="1" stop-color="#1f8aa8"/></linearGradient></defs>
    <path d="M32 5 56 13v17c0 13-10 22-24 29C18 52 8 43 8 30V13Z" fill="url(#fw)" stroke="#bff9ff" stroke-width="1.6" opacity=".9"/>
    <path d="M16 20h32M16 28h32M16 36h32M24 12v28M40 12v28" stroke="#06202c" stroke-width="2.2" opacity=".8"/>
    <path d="M32 42v9M27 46h10" stroke="#eaffff" stroke-width="2.4" stroke-linecap="round"/>`),
  honeypot: svg(`
    <defs><linearGradient id="hp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd98a"/><stop offset="1" stop-color="#b96a12"/></linearGradient></defs>
    <path d="M18 18h28l-3 30c-.4 4-4.4 7-11 7s-10.6-3-11-7Z" fill="url(#hp)" stroke="#ffe6b0" stroke-width="1.6"/>
    <ellipse cx="32" cy="18" rx="14" ry="4.5" fill="#5a2f05" stroke="#ffe6b0" stroke-width="1.4"/>
    <path d="M24 30c5-4 11 4 16 0M24 38c5-4 11 4 16 0" fill="none" stroke="#6b3505" stroke-width="2" stroke-linecap="round" opacity=".8"/>
    <path d="M32 8v6M26 11l3 3M38 11l-3 3" stroke="#ffcf6a" stroke-width="1.6" stroke-linecap="round"/>`),
  netgate: svg(`
    <defs><linearGradient id="ng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be9ff"/><stop offset="1" stop-color="#1d6d8c"/></linearGradient></defs>
    <path d="M12 10h8v44h-8zM44 10h8v44h-8z" fill="url(#ng)" stroke="#c8f6ff" stroke-width="1.4"/>
    <path d="M20 18h24M20 27h24M20 36h24M20 45h24" stroke="#7fe4ff" stroke-width="2.4" opacity=".75"/>
    <path d="M26 10v44M32 10v44M38 10v44" stroke="#0a2b3a" stroke-width="1.2" opacity=".5"/>
    <circle cx="32" cy="32" r="5" fill="#06202c" stroke="#8ff7ff" stroke-width="1.6"/>`),
  interceptor: svg(`
    <defs><linearGradient id="ic" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9f4ff"/><stop offset="1" stop-color="#16647e"/></linearGradient></defs>
    <path d="M13 50h38l-4 8H17Z" fill="#0c2d3d" stroke="#4fc9e6" stroke-width="1.3"/>
    <path d="M20 48V34l8-6h12l8 6v14Z" fill="url(#ic)" stroke="#c8f6ff" stroke-width="1.4"/>
    <path d="M32 14 52 24 32 34 12 24Z" fill="#17546a" stroke="#8ff7ff" stroke-width="1.6"/>
    <path d="M32 24v-9M32 15l8-4" stroke="#ffd166" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="32" cy="34" r="4" fill="#ffd166" stroke="#fff2c0" stroke-width="1.2"/>`),
  sandbox: svg(`
    <defs><linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9e8ff"/><stop offset="1" stop-color="#1c6b8a"/></linearGradient></defs>
    <path d="M32 7 55 20v24L32 57 9 44V20Z" fill="url(#sb)" stroke="#c8f6ff" stroke-width="1.5" opacity=".9"/>
    <path d="M32 18v28M20 24l24 14M44 24 20 38" stroke="#06202c" stroke-width="1.4" opacity=".45"/>
    <ellipse cx="32" cy="32" rx="9" ry="6" fill="#06202c" stroke="#7fe4ff" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="3" fill="#ffd166"/>`),
  repair: svg(`
    <defs><linearGradient id="rp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b6ffd8"/><stop offset="1" stop-color="#1b8b66"/></linearGradient></defs>
    <path d="M32 7 53 19v26L32 57 11 45V19Z" fill="url(#rp)" stroke="#c8ffe4" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="11" fill="#082b22" stroke="#8fffc8" stroke-width="1.6"/>
    <path d="M32 24v16M24 32h16" stroke="#b6ffd8" stroke-width="4" stroke-linecap="round"/>
    <path d="M32 7v7M32 50v7" stroke="#c8ffe4" stroke-width="2" opacity=".7"/>`),

  worm: svg(`
    <path d="M12 44c0-8 6-14 14-14h10c8 0 14-6 14-14" fill="none" stroke="#b6ff6e" stroke-width="9" stroke-linecap="round"/>
    <path d="M12 44c0-8 6-14 14-14h10c8 0 14-6 14-14" fill="none" stroke="#2f7a1c" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <circle cx="50" cy="16" r="7" fill="#d8ff9e" stroke="#2f7a1c" stroke-width="1.5"/>
    <circle cx="52" cy="14" r="1.6" fill="#12240a"/><circle cx="47" cy="14" r="1.6" fill="#12240a"/>`),
  flood: svg(`
    <path d="M10 40c0-13 10-23 22-23s22 10 22 23-9 16-22 16S10 53 10 40Z" fill="#ff8a5c" stroke="#ffd0b8" stroke-width="1.5"/>
    <path d="M18 36c6-5 12 5 18 0s10-2 14 0" fill="none" stroke="#7a2410" stroke-width="2.4" opacity=".7"/>
    <circle cx="24" cy="34" r="3" fill="#2a0a02"/><circle cx="40" cy="34" r="3" fill="#2a0a02"/>
    <path d="M10 22 4 16M54 22l6-6M32 17V7" stroke="#ff8a5c" stroke-width="2" stroke-linecap="round"/>`),
  trojan: svg(`
    <path d="M14 20 32 8l18 12v24L32 56 14 44Z" fill="#c7a6ff" stroke="#efe2ff" stroke-width="1.5"/>
    <path d="M14 20 32 32l18-12M32 32v24" fill="none" stroke="#4c2a86" stroke-width="1.6"/>
    <path d="M24 26v10M40 26v10" stroke="#2b1152" stroke-width="2"/>
    <path d="M22 42h20" stroke="#2b1152" stroke-width="2" stroke-dasharray="4 3"/>`),
  ransom: svg(`
    <path d="M18 28h28v24H18Z" fill="#ff6b7d" stroke="#ffd0d6" stroke-width="1.5"/>
    <path d="M24 28v-6a8 8 0 0 1 16 0v6" fill="none" stroke="#ffb3bc" stroke-width="3"/>
    <circle cx="32" cy="38" r="4" fill="#3a0710"/><path d="M32 42v5" stroke="#3a0710" stroke-width="3"/>
    <path d="M8 12 14 18M56 12 50 18M32 2v8" stroke="#ff6b7d" stroke-width="1.8" stroke-linecap="round"/>`),
  hotspot: svg(`
    <path d="M22 32 32 18l10 14-10 14Z" fill="#ffd166" stroke="#fff2c0" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="4" fill="#3a2600"/>
    <path d="M12 26c-4 4-4 8 0 12M52 26c4 4 4 8 0 12M18 20c-6 6-6 18 0 24M46 20c6 6 6 18 0 24" fill="none" stroke="#ffd166" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>`),
  shielder: svg(`
    <path d="M32 7 54 16v18c0 12-9 20-22 25-13-5-22-13-22-25V16Z" fill="#4fc3ff" stroke="#c8f0ff" stroke-width="1.5" opacity=".85"/>
    <circle cx="32" cy="30" r="10" fill="#06283d" stroke="#8ff7ff" stroke-width="1.6"/>
    <path d="M32 24v12M26 30h12" stroke="#8ff7ff" stroke-width="2.4"/>
    <path d="M32 38v12" stroke="#c8f0ff" stroke-width="1.6" opacity=".6"/>`),

  boss_wankui: svg(`
    <path d="M8 46 18 16l14 12L32 8l14 20 10-12 10 30Z" fill="#ff5d72" stroke="#ffd0d6" stroke-width="1.6"/>
    <circle cx="32" cy="36" r="9" fill="#2a0208" stroke="#ffb3bc" stroke-width="1.5"/>
    <circle cx="32" cy="36" r="3.5" fill="#ff5d72"/>`),
  boss_shenlou: svg(`
    <circle cx="32" cy="32" r="22" fill="#b58cff" stroke="#efe2ff" stroke-width="1.5" opacity=".85"/>
    <ellipse cx="32" cy="32" rx="10" ry="14" fill="#1c0b33" stroke="#d9c6ff" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="4" fill="#b58cff"/>
    <path d="M6 18 18 24M58 18 46 24M6 46l12-6M58 46 46 40" stroke="#d9c6ff" stroke-width="2" stroke-linecap="round"/>`),
  boss_zheying: svg(`
    <path d="M32 6 58 50H6Z" fill="#2b0f1a" stroke="#ff5d72" stroke-width="1.8"/>
    <path d="M32 22 44 42H20Z" fill="#ff5d72" opacity=".85"/>
    <circle cx="32" cy="36" r="4" fill="#ffe0e4"/>`),

  item_isolator: svg(`
    <path d="M20 10h24v8H20zM24 18h16v26H24z" fill="#5ce9ff" stroke="#c8f6ff" stroke-width="1.5"/>
    <path d="M18 44h28v8H18z" fill="#0c3a4d" stroke="#5ce9ff" stroke-width="1.5"/>
    <path d="M28 26v10M36 26v10" stroke="#06202c" stroke-width="2.4"/>`),
  item_downgrade: svg(`
    <path d="M10 18h44v8H10zM14 26h36v6H14z" fill="#ffb85c" stroke="#ffe6b0" stroke-width="1.3"/>
    <path d="M32 32v18M24 42l8 8 8-8" fill="none" stroke="#ffb85c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
  item_restore: svg(`
    <ellipse cx="32" cy="16" rx="18" ry="6" fill="#1b8b66" stroke="#8fffc8" stroke-width="1.5"/>
    <path d="M14 16v32c0 3.3 8 6 18 6s18-2.7 18-6V16" fill="#0c4033" stroke="#8fffc8" stroke-width="1.5"/>
    <ellipse cx="32" cy="24" rx="18" ry="6" fill="none" stroke="#8fffc8" stroke-width="1.2" opacity=".7"/>
    <path d="M32 32v14M25 39h14" stroke="#b6ffd8" stroke-width="3" stroke-linecap="round"/>`)
};

/* ---------- 塔 ---------- */
const TOWERS = {
  firewall: {
    name:'防火墙', en:'FIREWALL', role:'阻挡 · 反击', icon:'firewall',
    cost:80, intelCost:0, hp:380, build:['link','node'],
    range:2.8, dmg:15, rate:1.15, block:2,
    color:0x5ce9ff, accent:0xbff9ff,
    desc:'在链路上拦住有限数量的敌人并还击。架设在交换节点上时隔离该节点，并拦截相邻链路。',
    detail:'阻挡容量满时，多余敌人会从旁继续前进。加密会使其停止攻击，但不会解除阻挡。',
    level2:{cost:130, hp:600, dmg:24, rate:1.0, block:3},
    skill:{name:'紧急封锁', cd:26, desc:'令周围 5.5 格内的地面敌人停滞 2.2 秒，并立即修复自身 15% 生命。'},
    hotkey:'1'
  },
  honeypot: {
    name:'蜜罐', en:'HONEYPOT', role:'诱敌 · 承伤', icon:'honeypot',
    cost:75, intelCost:0, hp:230, build:['link'],
    range:3.0, dmg:0, rate:1, block:2, lure:6.5,
    color:0xffb85c, accent:0xffe6b0, immuneEncrypt:true,
    desc:'以伪造应答吸引附近会攻击塔的地面敌人，替其他塔承担攻击。耐久较低，但不会被加密。', hotkey:'2',
    detail:'被诱来的敌人会优先攻击蜜罐。2 级时可在两个互斥分支中选择强化方向。',
    level2:{cost:100, hp:360, block:3, lure:7.5},
    branches:{
      lure:{name:'诱捕阵列', desc:'诱敌半径 +3.5，诱捕技能持续时间 +2 秒，阻挡容量 +1。', intel:30, hp:340, lure:11, block:3, skillCd:18, skillDur:5},
      armor:{name:'蜜罐装甲', desc:'生命 +60%，受击时反弹 25% 伤害给攻击者。', intel:30, hp:560, reflect:0.25, block:3}
    },
    skill:{name:'诱捕', cd:20, desc:'困住所有被诱来的敌人 3.5 秒，期间无法移动或攻击。'}
  },
  netgate: {
    name:'网闸', en:'NETGATE', role:'隔离 · 控路', icon:'netgate',
    cost:55, intelCost:0, hp:760, build:['node'],
    range:0, dmg:0, rate:1, block:0,
    color:0x9be9ff, accent:0xc8f6ff, noAttack:true,
    desc:'低成本隔离交换节点，截断道路并控制敌人路线。耐久较高，不攻击。', hotkey:'3',
    detail:'节点上的网闸会被洪泛团和勒索者攻击。被摧毁后设备旁路直通，道路重新开放。',
    level2:{cost:90, hp:1150, regen:10},
    skill:{name:'重构隔离', cd:30, desc:'立即恢复自身 25% 生命，并临时获得 5 秒护盾。'}
  },
  interceptor: {
    name:'拦截器', en:'INTERCEPTOR', role:'远程 · 对空', icon:'interceptor',
    cost:110, intelCost:0, hp:270, build:['platform'],
    range:10.5, dmg:32, rate:1.05, arc:110, air:true,
    color:0x8ff7ff, accent:0xffd166, directional:true,
    desc:'在朝向决定的扇形区域内进行远程单体攻击，地面与飞行敌人都能打。', hotkey:'4',
    detail:'朝向在部署时由拖拽方向决定，可随时用 Q/E 调整。2 级时选择贯穿或压制分支。',
    level2:{cost:135, hp:400, dmg:42},
    branches:{
      pierce:{name:'贯穿射线', desc:'攻击转为穿透光束，命中直线上最多 3 个目标，伤害 +25%。', intel:32, dmg:52, pierce:true, range:12},
      suppress:{name:'压制脉冲', desc:'命中造成伤害并减速 45%，持续 2.5 秒；射速提升。', intel:32, dmg:22, rate:0.72, slow:0.45, slowDur:2.5}
    },
    skill:{name:'超频射击', cd:26, desc:'4 秒内射速翻倍，并立即锁定当前朝向。'}
  },
  sandbox: {
    name:'沙箱', en:'SANDBOX', role:'检测 · 范围', icon:'sandbox',
    cost:120, intelCost:0, hp:310, build:['platform'],
    range:8.5, dmg:22, rate:1.35, aoe:2.4, detect:8.5,
    color:0xb58cff, accent:0xd9c6ff,
    desc:'检测范围内伪装或潜伏的目标使其显形，并对地面敌人进行范围攻击，适合处理汇聚的流量。', hotkey:'5',
    detail:'检测范围独立显示。对隐身的木马和蛰影有效，对飞行单位无效。',
    level2:{cost:140, hp:440, dmg:32, aoe:3.1, detect:10},
    skill:{name:'深度扫描', cd:24, desc:'使大范围（1.6 倍检测半径）内所有伪装目标显形 9 秒，并造成 60 点范围伤害。'}
  },
  repair: {
    name:'修复进程', en:'REPAIR DAEMON', role:'治疗 · 支援', icon:'repair',
    cost:100, intelCost:0, hp:290, build:['platform'],
    range:7, dmg:0, rate:1, heal:20,
    color:0x6cf0a8, accent:0xb6ffd8, noAttack:true,
    desc:'不攻击敌人，持续恢复范围内其他受损塔的生命。', hotkey:'6',
    detail:'可治疗链路与节点上的塔。主动技能为附近友塔提供护盾并解除加密。',
    level2:{cost:120, hp:420, heal:34},
    skill:{name:'冗余切换', cd:24, desc:'为范围内友塔提供 90 点护盾并立即解除加密，持续 12 秒。'}
  }
};
const TOWER_ORDER = ['firewall','honeypot','netgate','interceptor','sandbox','repair'];

/* ---------- 敌人 ---------- */
const ENEMIES = {
  worm: {
    name:'蠕虫', en:'WORM', hp:95, speed:2.35, armor:0, bounty:9, blockUse:1, color:0x9dff5c, radius:.62,
    attackTower:{type:'melee', dmg:15, rate:0.85},
    desc:'被阻挡时持续攻击挡住它的塔。首次经过直通的交换节点时复制出同伴，复制出的不再复制。',
    tip:'复制会显著增加阻挡压力，优先在节点前清理。'
  },
  flood: {
    name:'洪泛团', en:'FLOOD SWARM', hp:320, speed:1.12, armor:0, bounty:26, blockUse:3, color:0xff8a5c, radius:1.05,
    attackTower:{type:'node', dmg:48, rate:1.35},
    detourNode:true,
    desc:'占用较多阻挡容量。会离开当前路线，向附近被隔离节点的可通行一侧移动，重击节点上的塔或隔离器；打通后沿重新开放的道路前进。',
    tip:'专门冲垮节点上的网闸，是改道体系的天敌。'
  },
  trojan: {
    name:'木马', en:'TROJAN', hp:160, speed:1.72, armor:0, bounty:17, blockUse:1, color:0xc7a6ff, radius:.68,
    attackTower:{type:'melee', dmg:13, rate:1.0},
    disguised:true, payload:{dmg:34, radius:4.5},
    desc:'伪装成正常封装数据包，显形前不能被远程单体攻击主动选中；沙箱检测、旧链路和阻挡会使其显形。未显形就被攻击波及消灭时释放载荷，伤害附近的塔。',
    tip:'用沙箱提前检测，或让它在旧链路上暴露。'
  },
  ransom: {
    name:'勒索者', en:'RANSOMWARE', hp:155, speed:1.5, armor:0, bounty:18, blockUse:1, color:0xff6b7d, radius:.7,
    attackTower:{type:'ranged', dmg:13, rate:1.5, range:6.5, encrypt:3.2, preferHoneypot:true},
    desc:'边移动边从远处攻击射程内的塔，包括平台上的塔，造成伤害并施加加密；会优先攻击射程内的蜜罐。',
    tip:'加密会停火但不解除阻挡，可用修复进程或备份还原解除。'
  },
  hotspot: {
    name:'伪热点', en:'HOTSPOT', hp:85, speed:3.15, armor:0, bounty:11, blockUse:0, color:0xffd166, radius:.55,
    flying:true,
    desc:'沿无线层从入口直飞出口，不受地面道路和阻挡影响，由拦截器对付。',
    tip:'只有拦截器与部分技能能攻击空中目标。'
  },
  shielder: {
    name:'加壳器', en:'PACKER', hp:190, speed:1.55, armor:0, bounty:21, blockUse:1, color:0x4fc3ff, radius:.75,
    attackTower:{type:'melee', dmg:10, rate:1.1},
    shieldAura:{range:5.5, amount:28, interval:2.2},
    desc:'为附近同伴提供可被打破的护盾，保护成群敌人推进，迫使玩家考虑先处理支援者还是集中攻击前排。',
    tip:'护盾可以被击破，先杀加壳器会让周围敌人变脆。'
  },
  boss_wankui: {
    name:'万傀', en:'WAN KUI', hp:3400, speed:.95, armor:.1, bounty:140, blockUse:5, color:0xff5d72, radius:1.7, boss:true,
    attackTower:{type:'node', dmg:70, rate:1.2},
    coreDamage:30,
    desc:'以僵尸网络的群体控制为主题。“洪峰”冲击被隔离节点，重创塔并冲毁隔离器；生命降低后释放成群蠕虫。',
    tip:'血量降至 60% 后开始释放蠕虫；持续冲击隔离节点。'
  },
  boss_shenlou: {
    name:'蜃楼', en:'SHEN LOU', hp:3900, speed:.9, armor:.05, bounty:160, blockUse:5, color:0xb58cff, radius:1.75, boss:true,
    attackTower:{type:'ranged', dmg:24, rate:1.2, range:8},
    coreDamage:30,
    desc:'以路由欺骗为主题。“伪路由”在前方链路制造临时路由黑洞，截断通行、迫使各入口改道；生命降低后发动“路由风暴”，削弱附近塔的护盾。',
    tip:'黑洞会提前预警，提前把塔部署到备用路线。'
  },
  boss_zheying: {
    name:'蛰影', en:'ZHE YING', hp:4400, speed:.85, armor:.15, bounty:200, blockUse:5, color:0xff5d72, radius:1.8, boss:true,
    attackTower:{type:'melee', dmg:45, rate:1.0},
    coreDamage:35,
    desc:'攻击组织的核心威胁，按“潜伏—提权—破坏”改变阶段：潜伏时需要检测才能被远程单体攻击选中，提权后强化护甲并放出木马，破坏阶段锁死前方一段运维环、改变道路。',
    tip:'潜伏阶段必须靠沙箱检测，否则无法被拦截器选中。'
  }
};
const ENEMY_ORDER = ['worm','flood','trojan','ransom','hotspot','shielder'];

/* ---------- Boss 阶段 ---------- */
const BOSS_PHASES = {
  boss_wankui:[
    {at:1, name:'群体控制', desc:'持续冲击隔离节点，制造阻挡压力。'},
    {at:.6, name:'洪峰释放', desc:'释放成群蠕虫，节点与阻挡塔同时承压。'}
  ],
  boss_shenlou:[
    {at:1, name:'路由欺骗', desc:'在前方链路制造临时路由黑洞，迫使改道。'},
    {at:.62, name:'路由风暴', desc:'削弱附近塔的护盾，并频繁制造黑洞。'},
    {at:.3, name:'全域误导', desc:'同时制造多个黑洞，路线剧烈变化。'}
  ],
  boss_zheying:[
    {at:1, name:'潜伏', desc:'隐匿于流量中，需要检测才能被选中。'},
    {at:.7, name:'提权', desc:'强化护甲，并释放木马。'},
    {at:.35, name:'破坏', desc:'锁死前方一段运维环，改变道路。'}
  ]
};

/* ---------- 道具 ---------- */
const ITEMS = {
  isolator:{name:'应急隔离器', en:'EMERGENCY ISOLATOR', icon:'item_isolator', cost:30, res:'intel', cd:42,
    desc:'临时隔离一个直通节点，有耐久和有效期，会被敌人冲毁，不产生情报。',
    tip:'与网闸不同，它只是临时设备，失效后节点恢复直通。'},
  downgrade:{name:'协议降级', en:'PROTOCOL DOWNGRADE', icon:'item_downgrade', cost:25, res:'intel', cd:38,
    desc:'让一片链路暂时使用旧协议，产生旧链路的减速和显形效果，敌人的路线随通行速度变化重新选择。',
    tip:'对已布防的路线使用，可把敌人拖入火力覆盖区。'},
  restore:{name:'备份还原', en:'BACKUP RESTORE', icon:'item_restore', cost:40, res:'compute', cd:30,
    desc:'恢复一座塔 55% 生命并解除加密。',
    tip:'关键节点被加密或濒临摧毁时使用。'}
};
const ITEM_ORDER = ['isolator','downgrade','restore'];

/* ---------- 状态说明 ---------- */
const STATUS_INFO = {
  encrypt:{name:'加密', color:'#b58cff', desc:'塔停止攻击、治疗和释放技能，但不解除阻挡或节点隔离。持续 3.2 秒。'},
  shield:{name:'护盾', color:'#4fc3ff', desc:'优先吸收伤害，护盾耗尽后恢复生命计算。'},
  detect:{name:'显形', color:'#ffd166', desc:'伪装目标被检测、旧链路或阻挡揭示后，可被远程单体攻击选中。'},
  slow:{name:'压制', color:'#8ff7ff', desc:'移动速度降低，持续 2.5 秒。'},
  root:{name:'停滞', color:'#ffb85c', desc:'无法移动或攻击。'},
  isolated:{name:'隔离', color:'#9be9ff', desc:'交换节点被截断，道路不可通行。隔离解除或设备被摧毁后恢复直通。'}
};

/* ---------- 地图元数据 ---------- */
const MAPS_META = {
  map1:{id:'map1', name:'分段内网', en:'SEGMENTED INTRANET', type:'企业网', waves:14,
    difficulty:2, desc:'办公网段与业务网段通过 DMZ 互联，南端是核心数据库。外围旧系统网段与灾备环提供了绕行的可能。',
    features:['DMZ 汇流','旧系统链路','灾备环'], accent:'#5ce9ff'},
  map2:{id:'map2', name:'骨干流域', en:'BACKBONE WATERSHED', type:'跨网骨干', waves:15,
    difficulty:3, desc:'双活数据中心互为备份，公网流横贯战场。专线隧道与旧专线构成不同的跨越点。',
    features:['公网流','双活中心','专线 / 旧专线'], accent:'#ffb85c'},
  map3:{id:'map3', name:'气隙深层', en:'AIR-GAPPED DEPTHS', type:'工控网络', waves:16,
    difficulty:4, desc:'中央气隙将网络分隔，运维环绕行连通南北。老工控总线是较慢的支路，两个核心互相牵制。',
    features:['中央气隙','运维环','工控总线'], accent:'#6cf0a8'}
};

/* ---------- 波次 ---------- */
const W = (label, groups, extra={}) => Object.assign({label, groups}, extra);

const WAVES = {
  map1:[
    W('侦察流量',[{entry:'A',type:'worm',n:6,gap:.85}],{intel:5,note:'门户网站出现异常封装。'}),
    W('双入口试探',[{entry:'A',type:'worm',n:5,gap:.8},{entry:'B',type:'worm',n:4,gap:.9,delay:1}],{intel:6}),
    W('伪装注入',[{entry:'A',type:'worm',n:4,gap:.8},{entry:'A',type:'trojan',n:2,gap:1.4,delay:2.5}],{intel:7,note:'木马混入正常封装，需沙箱检测。'}),
    W('邮件网关渗透',[{entry:'B',type:'worm',n:6,gap:.75},{entry:'B',type:'trojan',n:2,gap:1.5,delay:3}],{intel:7}),
    W('远程勒索',[{entry:'A',type:'ransom',n:2,gap:1.6},{entry:'B',type:'worm',n:5,gap:.8,delay:.5}],{intel:8,note:'勒索者会在射程内攻击平台上的塔。'}),
    W('网关承压',[{entry:'A',type:'worm',n:5,gap:.7},{entry:'B',type:'ransom',n:3,gap:1.4,delay:1}],{intel:8}),
    W('洪泛冲击',[{entry:'A',type:'flood',n:1,gap:1},{entry:'B',type:'worm',n:6,gap:.7,delay:1}],{intel:9,note:'洪泛团会离开路线，重击隔离节点。'}),
    W('封装风暴',[{entry:'A',type:'trojan',n:4,gap:1.2},{entry:'B',type:'worm',n:5,gap:.7,delay:1},{entry:'A',type:'ransom',n:1,gap:1,delay:5}],{intel:9}),
    W('护盾推进',[{entry:'B',type:'shielder',n:2,gap:2},{entry:'B',type:'worm',n:8,gap:.55,delay:1.5}],{intel:10}),
    W('双线高压',[{entry:'A',type:'flood',n:1,gap:1},{entry:'B',type:'shielder',n:1,gap:1,delay:2},{entry:'A',type:'worm',n:5,gap:.6,delay:1}],{intel:10}),
    W('空中侦察',[{entry:'A',type:'hotspot',n:5,gap:.8},{entry:'B',type:'ransom',n:2,gap:1.5,delay:1}],{intel:10,note:'伪热点沿无线层直飞出口。'}),
    W('复合施压',[{entry:'A',type:'flood',n:2,gap:2.5},{entry:'B',type:'shielder',n:2,gap:2,delay:1},{entry:'A',type:'worm',n:6,gap:.6,delay:2}],{intel:11}),
    W('中枢前夜',[{entry:'A',type:'trojan',n:4,gap:1.1},{entry:'B',type:'ransom',n:3,gap:1.4,delay:1},{entry:'B',type:'shielder',n:2,gap:2,delay:3},{entry:'A',type:'flood',n:1,gap:1,delay:4}],{intel:12,note:'最后一波之前，蛰影的前哨正在集结。'}),
    W('万傀降临',[{entry:'A',type:'boss_wankui',n:1,gap:1},{entry:'B',type:'worm',n:8,gap:.6,delay:2}],{intel:20,boss:true,note:'万傀开始群体控制，冲击隔离节点。'})
  ],
  map2:[
    W('专线侦察',[{entry:'C',type:'worm',n:5,gap:.8},{entry:'A',type:'worm',n:3,gap:.9,delay:1}],{intel:6}),
    W('云端试探',[{entry:'B',type:'worm',n:5,gap:.8},{entry:'C',type:'trojan',n:2,gap:1.5,delay:1}],{intel:6}),
    W('公网流掩护',[{entry:'A',type:'ransom',n:2,gap:1.6},{entry:'B',type:'worm',n:5,gap:.7}],{intel:7}),
    W('专线汇流',[{entry:'C',type:'trojan',n:3,gap:1.3},{entry:'B',type:'worm',n:5,gap:.7,delay:1}],{intel:7,note:'C 与 B 平时经旧专线汇流。'}),
    W('旧专线渗透',[{entry:'B',type:'flood',n:1,gap:1},{entry:'C',type:'worm',n:5,gap:.7,delay:1}],{intel:8}),
    W('数据中心的影子',[{entry:'A',type:'trojan',n:3,gap:1.2},{entry:'C',type:'ransom',n:2,gap:1.5,delay:1}],{intel:8}),
    W('双活压力',[{entry:'A',type:'worm',n:6,gap:.65},{entry:'B',type:'shielder',n:2,gap:2,delay:1}],{intel:9}),
    W('隧道争抢',[{entry:'C',type:'flood',n:1,gap:1},{entry:'A',type:'worm',n:5,gap:.6,delay:1},{entry:'B',type:'trojan',n:2,gap:1.2,delay:2}],{intel:9}),
    W('空中侦察',[{entry:'A',type:'hotspot',n:5,gap:.8},{entry:'B',type:'ransom',n:2,gap:1.4,delay:1}],{intel:9}),
    W('三入口洪峰',[
      {entry:'A',type:'worm',n:8,gap:.45},{entry:'B',type:'trojan',n:4,gap:.9,delay:.3},{entry:'C',type:'flood',n:2,gap:2.2,delay:1},
      {entry:'B',type:'shielder',n:1,gap:1,delay:3},{entry:'A',type:'ransom',n:2,gap:1.2,delay:4}
    ],{intel:14,peak:true,note:'三个入口同时大量出兵。'}),
    W('专线风暴',[{entry:'C',type:'flood',n:2,gap:2.5},{entry:'B',type:'worm',n:8,gap:.55,delay:1}],{intel:10}),
    W('黑洞前兆',[{entry:'A',type:'ransom',n:3,gap:1.3},{entry:'C',type:'shielder',n:2,gap:1.8,delay:1},{entry:'B',type:'worm',n:6,gap:.6,delay:2}],{intel:11}),
    W('双核告急',[{entry:'A',type:'trojan',n:4,gap:1},{entry:'B',type:'flood',n:2,gap:2.5,delay:1},{entry:'C',type:'worm',n:6,gap:.55,delay:2}],{intel:11}),
    W('流域决堤',[{entry:'A',type:'hotspot',n:5,gap:.7},{entry:'B',type:'shielder',n:2,gap:1.8,delay:1},{entry:'C',type:'flood',n:2,gap:2.2,delay:2},{entry:'A',type:'worm',n:6,gap:.5,delay:3}],{intel:13}),
    W('蜃楼现身',[{entry:'B',type:'boss_shenlou',n:1,gap:1},{entry:'A',type:'worm',n:6,gap:.6,delay:2},{entry:'C',type:'trojan',n:3,gap:1,delay:3}],{intel:22,boss:true,note:'蜃楼开始路由欺骗，制造临时黑洞。'})
  ],
  map3:[
    W('跳板机异常',[{entry:'A',type:'worm',n:5,gap:.8},{entry:'B',type:'worm',n:3,gap:.9,delay:1}],{intel:6}),
    W('办公网下行',[{entry:'B',type:'worm',n:5,gap:.7},{entry:'C',type:'trojan',n:2,gap:1.4,delay:1}],{intel:6}),
    W('供应商通道',[{entry:'C',type:'ransom',n:2,gap:1.5},{entry:'A',type:'worm',n:5,gap:.7,delay:1}],{intel:7}),
    W('总线杂音',[{entry:'B',type:'trojan',n:3,gap:1.2},{entry:'A',type:'worm',n:5,gap:.65,delay:1}],{intel:7,note:'老工控总线通行较慢，但会显形木马。'}),
    W('两侧渗透',[{entry:'A',type:'flood',n:1,gap:1},{entry:'C',type:'worm',n:5,gap:.7,delay:1}],{intel:8}),
    W('气隙边缘',[{entry:'B',type:'shielder',n:2,gap:1.8},{entry:'B',type:'worm',n:7,gap:.55,delay:1}],{intel:8}),
    W('远程维护',[{entry:'C',type:'ransom',n:3,gap:1.2},{entry:'A',type:'trojan',n:3,gap:1.1,delay:1}],{intel:9}),
    W('运维环洪峰',[
      {entry:'A',type:'worm',n:7,gap:.45},{entry:'B',type:'flood',n:2,gap:2,delay:1},{entry:'C',type:'trojan',n:4,gap:.9,delay:2}
    ],{intel:14,peak:true,note:'运维环三个入口同时受压。'}),
    W('老总线过载',[{entry:'B',type:'flood',n:2,gap:2.2},{entry:'C',type:'worm',n:6,gap:.55,delay:1}],{intel:9}),
    W('空中渗透',[{entry:'A',type:'hotspot',n:5,gap:.75},{entry:'C',type:'ransom',n:2,gap:1.3,delay:1}],{intel:9}),
    W('提权前夜',[{entry:'A',type:'shielder',n:2,gap:1.7},{entry:'B',type:'trojan',n:4,gap:1,delay:1},{entry:'C',type:'worm',n:5,gap:.6,delay:2}],{intel:10}),
    W('双侧夹击',[{entry:'A',type:'flood',n:2,gap:2.4},{entry:'C',type:'ransom',n:3,gap:1.2,delay:1},{entry:'B',type:'worm',n:6,gap:.55,delay:2}],{intel:11}),
    W('气隙风暴',[
      {entry:'A',type:'worm',n:8,gap:.4},{entry:'B',type:'trojan',n:4,gap:.9,delay:.5},{entry:'C',type:'shielder',n:2,gap:1.8,delay:2},
      {entry:'A',type:'flood',n:1,gap:1,delay:4}
    ],{intel:14,peak:true,note:'老工控总线与运维环同时被冲击。'}),
    W('核心前压',[{entry:'A',type:'ransom',n:3,gap:1.2},{entry:'B',type:'flood',n:2,gap:2.2,delay:1},{entry:'C',type:'hotspot',n:5,gap:.7,delay:2}],{intel:11}),
    W('蛰影前哨',[{entry:'A',type:'trojan',n:5,gap:1},{entry:'B',type:'shielder',n:2,gap:1.6,delay:1},{entry:'C',type:'worm',n:7,gap:.5,delay:2}],{intel:12}),
    W('蛰影降临',[{entry:'B',type:'boss_zheying',n:1,gap:1},{entry:'A',type:'worm',n:6,gap:.6,delay:2},{entry:'C',type:'trojan',n:3,gap:1,delay:3}],{intel:24,boss:true,note:'蛰影进入潜伏阶段，需要检测才能锁定。'})
  ]
};

/* ---------- 图鉴静态文本 ---------- */
const CODEX_SYSTEMS = [
  {title:'路由收敛', body:'任何通行或通行速度变化，各入口的路线同步更新；场上受地形约束的敌人从当前位置重新寻路，不瞬移、不穿过不可通行区域。'},
  {title:'保持连通', body:'任何隔离或封路操作都不能让某个入口或场上某个地面敌人无路可走。会封死的操作会被拒绝，不消耗资源；Boss 会改选不会封死的位置。'},
  {title:'节点隔离', body:'网闸、防火墙（节点）与应急隔离器会截断交换节点。设备被摧毁、撤下或隔离器失效后，设备旁路直通，道路重新打开。'},
  {title:'改道的代价', body:'节点恢复直通后有短暂的再次隔离间隔。隔离消耗、撤下返还与敌人攻塔的威胁共同约束反复改道，避免敌人在两条路之间无限折返。'},
  {title:'阻挡与攻击', body:'阻挡使敌人停下交战，不改变道路通行状态。塔优先攻击沿路线离出口最近的有效目标；被阻挡的攻塔敌人攻击挡住它的塔。'},
  {title:'资源', body:'算力随游戏进程增长、消灭敌人回收，用于塔与备份还原；情报通过波次、消灭重点威胁和在交战中持续守住隔离节点获得。两种资源不能互换。'},
  {title:'镜头', body:'中键拖动环绕，Shift + 中键平移，滚轮缩放。左键只用于点选和拖放部署。默认视角下整张地图完整可见，可随时回到默认视角。'},
  {title:'胜负', body:'敌人到达出口时中枢完整度下降，归零即失败，撑过全部波次即胜利。结算显示本局统计；局中和结算后都能重开本图或返回关卡选择。'}
];

return { ICONS, TOWERS, TOWER_ORDER, ENEMIES, ENEMY_ORDER, ITEMS, ITEM_ORDER, STATUS_INFO, MAPS_META, WAVES, BOSS_PHASES, CODEX_SYSTEMS };
})();