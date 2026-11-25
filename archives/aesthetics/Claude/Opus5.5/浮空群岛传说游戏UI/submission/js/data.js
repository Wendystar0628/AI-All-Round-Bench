/* =====================================================================
   data.js — 游戏数据：属性 / 武器 / 角色 / 技能 / 徽印 / 任务 / 道具 / 剧情
   ===================================================================== */
(function () {
  'use strict';

  const ELEMENTS = {
    fire: { name: '火', en: 'FIRE', c: '#ff6a3d' },
    water: { name: '水', en: 'WATER', c: '#3aa8ff' },
    earth: { name: '土', en: 'EARTH', c: '#d49a3f' },
    wind: { name: '风', en: 'WIND', c: '#3fd68f' },
    light: { name: '光', en: 'LIGHT', c: '#ffd84a' },
    dark: { name: '暗', en: 'DARK', c: '#a674ff' },
  };
  const WEAPONS = {
    sword: { name: '单手剑', en: 'SWORD' },
    spear: { name: '长枪', en: 'LANCE' },
    staff: { name: '法杖', en: 'STAFF' },
    axe: { name: '大斧', en: 'GREATAXE' },
    blades: { name: '双刀', en: 'TWIN BLADES' },
    guns: { name: '双枪', en: 'TWIN GUNS' },
  };
  const RARITY = {
    bronze: { name: '铜', en: 'BRONZE' },
    silver: { name: '银', en: 'SILVER' },
    gold: { name: '金', en: 'GOLD' },
  };
  const QTYPES = {
    boss: { name: '首领讨伐', en: 'BOSS HUNT', icon: 'q-boss' },
    hunt: { name: '魔物讨伐', en: 'SUBJUGATION', icon: 'q-hunt' },
    gather: { name: '采集', en: 'GATHERING', icon: 'q-gather' },
    escort: { name: '护送', en: 'ESCORT', icon: 'q-escort' },
    explore: { name: '调查', en: 'EXPLORATION', icon: 'q-explore' },
    defend: { name: '防卫', en: 'DEFENSE', icon: 'q-defend' },
  };
  const TIERS = [
    { id: 'normal', name: '普通', en: 'NORMAL', stars: 1 },
    { id: 'hard', name: '困难', en: 'HARD', stars: 2 },
    { id: 'extreme', name: '极难', en: 'EXTREME', stars: 3 },
    { id: 'legend', name: '传说', en: 'LEGEND', stars: 4 },
  ];

  /* ---------- 特性（徽印） ---------- */
  const TRAITS = {
    atk: { name: '攻击力', max: 30, icon: 'ui-atkup' },
    hp: { name: '生命值', max: 30, icon: 'ui-heart' },
    def: { name: '防御力', max: 30, icon: 'ui-shield' },
    crit: { name: '暴击率', max: 30, icon: 'ui-crit' },
    critdmg: { name: '暴击伤害', max: 30, icon: 'ui-critdmg' },
    ultgain: { name: '奥义槽提升', max: 30, icon: 'ui-ult' },
    link: { name: '连携加速', max: 30, icon: 'ui-link' },
    cdr: { name: '冷却缩减', max: 20, icon: 'ui-time' },
    eldmg: { name: '属性伤害', max: 30, icon: 'sk-burst' },
    brk: { name: '破防强化', max: 20, icon: 'sk-quake' },
  };

  /* ---------- 技能 ---------- */
  const SKILLS = {
    // 艾琳
    gale: { name: '疾风连斩', en: 'Gale Flurry', icon: 'sk-multi', cd: 6, pow: 420, desc: '向前方高速斩击五次，造成风属性伤害。' },
    cyclone: { name: '旋风突进', en: 'Cyclone Rush', icon: 'sk-dash', cd: 9, pow: 380, desc: '旋身突进贯穿目标，命中时额外积累连携值。' },
    azure: { name: '苍穹一闪', en: 'Azure Flash', icon: 'sk-slash', cd: 14, pow: 760, desc: '蓄力后拔剑一闪，本次攻击必定暴击。' },
    blessing: { name: '风之加护', en: "Wind's Blessing", icon: 'sk-buff', cd: 24, pow: 0, passive: { ultgain: 10 }, desc: '全队攻击力提升、移动加快 15 秒。装备时奥义效率 +10%。' },
    skyrend: { name: '裂空斩', en: 'Sky Rend', icon: 'sk-pierce', cd: 12, pow: 680, desc: '斩出贯穿天际的真空刃，对直线上的敌人造成大伤害。' },
    cloudstep: { name: '流云步', en: 'Cloud Step', icon: 'sk-dash', cd: 5, pow: 120, desc: '向任意方向闪身，闪避成功时下一击伤害提升。' },
    gyre: { name: '回旋刃', en: 'Gyre Edge', icon: 'sk-whirl', cd: 7, pow: 450, desc: '掷出风刃回旋切割，最多命中八次。' },
    tempest: { name: '岚之结界', en: 'Tempest Ward', icon: 'sk-barrier', cd: 20, pow: 260, desc: '展开风之结界，抵挡一次伤害并自动反击。' },
    // 罗克
    crimson: { name: '红莲突刺', en: 'Crimson Thrust', icon: 'sk-thrust', cd: 7, pow: 460, desc: '以长枪贯穿目标，附加灼烧。' },
    blaze: { name: '炎枪乱舞', en: 'Blazing Dance', icon: 'sk-whirl', cd: 10, pow: 520, desc: '挥舞燃烧的长枪横扫周围。' },
    warcry: { name: '烈火战吼', en: 'War Cry', icon: 'sk-roar', cd: 22, pow: 0, passive: { atk: 4 }, desc: '吸引敌人注意，自身攻击力大幅提升。' },
    burst: { name: '爆炎穿空', en: 'Burst Pierce', icon: 'sk-burst', cd: 15, pow: 820, desc: '跃起后向下贯刺，引发爆炎。' },
    // 希娅
    prayer: { name: '潮音祷言', en: 'Tide Prayer', icon: 'sk-heal', cd: 18, pow: 0, desc: '回复全队生命值，并解除灼烧。' },
    mirror: { name: '水镜屏障', en: 'Mirror Veil', icon: 'sk-barrier', cd: 20, pow: 0, desc: '为全队张开吸收伤害的水之屏障。' },
    maelstrom: { name: '涡流', en: 'Maelstrom', icon: 'sk-wave', cd: 9, pow: 540, desc: '在目标处召唤水之涡流持续造成伤害。' },
    hymn: { name: '沧浪咏唱', en: 'Wave Hymn', icon: 'sk-rain', cd: 12, pow: 700, desc: '咏唱后降下水之箭雨。' },
    // 巴尔多
    quake: { name: '震地击', en: 'Quake Strike', icon: 'sk-quake', cd: 8, pow: 560, desc: '以巨斧砸向地面，震飞周围的敌人。' },
    rockwall: { name: '岩壁守护', en: 'Rock Wall', icon: 'sk-ward', cd: 24, pow: 0, desc: '全队防御力提升，并获得击退耐性。' },
    crush: { name: '粉碎旋斧', en: 'Crushing Gyre', icon: 'sk-whirl', cd: 11, pow: 640, desc: '抡起巨斧旋转，最后一击必定破坏部位。' },
    immovable: { name: '不动如山', en: 'Immovable', icon: 'sk-counter', cd: 16, pow: 380, desc: '架起斧刃格挡，成功时发动强力反击。' },
    // 凛
    moonedge: { name: '月影连刃', en: 'Moonshade Edge', icon: 'sk-multi', cd: 6, pow: 440, desc: '双刀交错斩击七次。' },
    bind: { name: '影缚', en: 'Shadow Bind', icon: 'sk-shadow', cd: 14, pow: 300, desc: '以暗影束缚目标，使其行动迟缓。' },
    flash: { name: '瞬影杀', en: 'Flash Shadow', icon: 'sk-dash', cd: 10, pow: 600, desc: '瞬间移动到目标身后发动背刺。' },
    nightfall: { name: '夜幕', en: 'Nightfall', icon: 'sk-shadow', cd: 26, pow: 900, desc: '降下夜幕，下一次奥义伤害提升。' },
    // 薇奥拉
    volley: { name: '辉光连射', en: 'Radiant Volley', icon: 'sk-shot', cd: 6, pow: 400, desc: '双枪交替连射光弹。' },
    stardust: { name: '星屑弹', en: 'Stardust Shot', icon: 'sk-burst', cd: 11, pow: 560, desc: '射出会在命中后炸裂的星屑弹。' },
    support: { name: '圣辉支援', en: 'Holy Support', icon: 'sk-heal', cd: 20, pow: 0, desc: '为全队回复生命值并提升暴击率。' },
    snipe: { name: '贯光狙击', en: 'Piercing Light', icon: 'sk-pierce', cd: 16, pow: 880, desc: '蓄力狙击，命中弱点时伤害翻倍。' },
  };

  /* ---------- 角色 ---------- */
  const CHARS = {
    erin: {
      name: '艾琳', en: 'ERIN', weapon: 'sword', el: 'wind', title: '苍风的剑士', lv: 78, exp: [12450, 18000],
      base: { atk: 3120, hp: 18200, def: 1450, crit: 8, critdmg: 50, ultgain: 100 },
      weaponItem: { name: '苍穹之刃', en: 'Azure Edge', lv: 120, el: 'wind', rarity: 'gold', atk: 2480, hp: 0 },
      skills: ['gale', 'cyclone', 'azure', 'blessing'],
      pool: ['gale', 'cyclone', 'azure', 'blessing', 'skyrend', 'cloudstep', 'gyre', 'tempest'],
      sigils: [
        { t: 'atk', lv: 11, r: 'gold' }, { t: 'atk', lv: 10, r: 'silver' }, { t: 'crit', lv: 9, r: 'silver' },
        { t: 'hp', lv: 11, r: 'gold' }, { t: 'link', lv: 6, r: 'silver' }, { t: 'ultgain', lv: 8, r: 'gold' },
        { t: 'eldmg', lv: 7, r: 'bronze' }, { t: 'def', lv: 5, r: 'bronze' }, { t: 'critdmg', lv: 6, r: 'silver' }, null,
      ],
      ult: { name: '苍岚·千翼斩', en: 'AZURE TEMPEST · THOUSAND WINGS' },
      voice: '风啊——随我的剑起舞！',
    },
    rock: {
      name: '罗克', en: 'ROCKE', weapon: 'spear', el: 'fire', title: '炽炎枪骑', lv: 76, exp: [9800, 16800],
      base: { atk: 3260, hp: 17600, def: 1380, crit: 7, critdmg: 55, ultgain: 100 },
      weaponItem: { name: '赤焰贯星枪', en: 'Starpiercer', lv: 115, el: 'fire', rarity: 'gold', atk: 2390, hp: 0 },
      skills: ['crimson', 'blaze', 'warcry', 'burst'],
      pool: ['crimson', 'blaze', 'warcry', 'burst'],
      sigils: [
        { t: 'atk', lv: 12, r: 'gold' }, { t: 'critdmg', lv: 9, r: 'silver' }, { t: 'crit', lv: 8, r: 'silver' },
        { t: 'hp', lv: 8, r: 'silver' }, { t: 'eldmg', lv: 9, r: 'gold' }, { t: 'brk', lv: 5, r: 'bronze' },
        { t: 'ultgain', lv: 6, r: 'bronze' }, { t: 'def', lv: 4, r: 'bronze' }, null, null,
      ],
      ult: { name: '红莲·贯日枪', en: 'CRIMSON SUNPIERCER' },
      voice: '燃尽吧，这一枪贯穿太阳！',
    },
    thea: {
      name: '希娅', en: 'THEA', weapon: 'staff', el: 'water', title: '潮音的祈愿者', lv: 77, exp: [9200, 17400],
      base: { atk: 2980, hp: 16800, def: 1320, crit: 6, critdmg: 50, ultgain: 110 },
      weaponItem: { name: '潮汐之杖', en: 'Tidecaller', lv: 118, el: 'water', rarity: 'gold', atk: 2310, hp: 600 },
      skills: ['prayer', 'mirror', 'maelstrom', 'hymn'],
      pool: ['prayer', 'mirror', 'maelstrom', 'hymn'],
      sigils: [
        { t: 'atk', lv: 9, r: 'silver' }, { t: 'ultgain', lv: 11, r: 'gold' }, { t: 'hp', lv: 10, r: 'gold' },
        { t: 'eldmg', lv: 10, r: 'gold' }, { t: 'link', lv: 8, r: 'silver' }, { t: 'cdr', lv: 6, r: 'silver' },
        { t: 'def', lv: 6, r: 'bronze' }, { t: 'crit', lv: 5, r: 'bronze' }, null, null,
      ],
      ult: { name: '沧澜·潮汐圣歌', en: 'HYMN OF THE RISING TIDE' },
      voice: '潮声啊，回应我的祈愿。',
    },
    baldo: {
      name: '巴尔多', en: 'BALDO', weapon: 'axe', el: 'earth', title: '岩壁之斧', lv: 79, exp: [14000, 18600],
      base: { atk: 3340, hp: 21400, def: 1720, crit: 5, critdmg: 60, ultgain: 95 },
      weaponItem: { name: '崩岳巨斧', en: 'Peakbreaker', lv: 120, el: 'earth', rarity: 'gold', atk: 2520, hp: 900 },
      skills: ['quake', 'rockwall', 'crush', 'immovable'],
      pool: ['quake', 'rockwall', 'crush', 'immovable'],
      sigils: [
        { t: 'hp', lv: 12, r: 'gold' }, { t: 'def', lv: 11, r: 'gold' }, { t: 'atk', lv: 10, r: 'silver' },
        { t: 'brk', lv: 9, r: 'gold' }, { t: 'critdmg', lv: 7, r: 'silver' }, { t: 'atk', lv: 6, r: 'bronze' },
        { t: 'link', lv: 5, r: 'bronze' }, { t: 'crit', lv: 4, r: 'bronze' }, null, null,
      ],
      ult: { name: '崩岳·大地裂击', en: 'MOUNTAINFALL' },
      voice: '大地啊，裂开吧！',
    },
    rin: {
      name: '凛', en: 'RIN', weapon: 'blades', el: 'dark', title: '月影双刃', lv: 74, exp: [6100, 15600],
      base: { atk: 3050, hp: 15400, def: 1180, crit: 12, critdmg: 55, ultgain: 105 },
      weaponItem: { name: '朔月双刃', en: 'New Moon Pair', lv: 110, el: 'dark', rarity: 'silver', atk: 2210, hp: 0 },
      skills: ['moonedge', 'bind', 'flash', 'nightfall'],
      pool: ['moonedge', 'bind', 'flash', 'nightfall'],
      sigils: [
        { t: 'crit', lv: 10, r: 'gold' }, { t: 'critdmg', lv: 8, r: 'silver' }, { t: 'atk', lv: 8, r: 'silver' },
        { t: 'eldmg', lv: 6, r: 'bronze' }, { t: 'hp', lv: 6, r: 'bronze' }, null, null, null, null, null,
      ],
      ult: { name: '冥月·无明斩', en: 'UMBRAL CRESCENT' },
      voice: '月落之时，即是终焉。',
    },
    viola: {
      name: '薇奥拉', en: 'VIOLA', weapon: 'guns', el: 'light', title: '辉光枪手', lv: 75, exp: [11000, 16200],
      base: { atk: 3010, hp: 16000, def: 1240, crit: 10, critdmg: 52, ultgain: 100 },
      weaponItem: { name: '晨辉双枪', en: 'Dawnbringers', lv: 112, el: 'light', rarity: 'silver', atk: 2260, hp: 0 },
      skills: ['volley', 'stardust', 'support', 'snipe'],
      pool: ['volley', 'stardust', 'support', 'snipe'],
      sigils: [
        { t: 'crit', lv: 9, r: 'silver' }, { t: 'atk', lv: 9, r: 'silver' }, { t: 'ultgain', lv: 7, r: 'silver' },
        { t: 'hp', lv: 7, r: 'bronze' }, { t: 'link', lv: 6, r: 'bronze' }, { t: 'def', lv: 4, r: 'bronze' }, null, null, null, null,
      ],
      ult: { name: '圣辉·双星连射', en: 'TWIN STAR BARRAGE' },
      voice: '光芒会替我瞄准。',
    },
  };
  const CHAR_ORDER = ['erin', 'rock', 'thea', 'baldo', 'rin', 'viola'];

  // 徽印背包（用于替换）
  const SIGIL_BAG = [
    { t: 'crit', lv: 11, r: 'gold' },
    { t: 'critdmg', lv: 10, r: 'silver' },
    { t: 'link', lv: 10, r: 'gold' },
    { t: 'atk', lv: 9, r: 'silver' },
    { t: 'brk', lv: 7, r: 'silver' },
    { t: 'cdr', lv: 6, r: 'silver' },
    { t: 'ultgain', lv: 9, r: 'gold' },
    { t: 'hp', lv: 8, r: 'bronze' },
  ];

  // 全员连锁终结技：随第一名释放者的属性变化
  const FINISHERS = {
    wind: { name: '终式·天穹岚神舞', en: 'FINALE — DANCE OF THE SKY TEMPEST' },
    fire: { name: '终式·焚天红莲狱', en: 'FINALE — CRIMSON INFERNO' },
    water: { name: '终式·沧海归潮', en: 'FINALE — RETURN OF THE TIDE' },
    earth: { name: '终式·万岳崩天', en: 'FINALE — TEN THOUSAND PEAKS' },
    light: { name: '终式·晨星圣裁', en: 'FINALE — MORNING STAR JUDGMENT' },
    dark: { name: '终式·永夜冥渊', en: 'FINALE — ABYSS OF ETERNAL NIGHT' },
  };

  /* ---------- 道具 ---------- */
  const ITEMS = {
    coin: { name: '星币', icon: 'it-coin', r: 'bronze' },
    fireCrystal: { name: '火之结晶', icon: 'it-crystal', r: 'bronze', el: 'fire' },
    windCrystal: { name: '风之结晶', icon: 'it-crystal', r: 'bronze', el: 'wind' },
    ore: { name: '熔岩矿石', icon: 'it-ore', r: 'bronze' },
    expBook: { name: '冒险者手记', icon: 'it-book', r: 'silver' },
    flameShard: { name: '焰鳞碎片', icon: 'it-shard', r: 'silver', el: 'fire' },
    sigilFire: { name: '徽印·火焰抗性', icon: 'it-sigil', r: 'silver' },
    potion: { name: '高级回复药', icon: 'it-potion', r: 'bronze' },
    flameScale: { name: '焰冠龙鳞', icon: 'it-scale', r: 'gold', el: 'fire' },
    ignHorn: { name: '伊格瑞斯之角', icon: 'it-horn', r: 'gold', el: 'fire' },
    sigilGold: { name: '徽印·暴击伤害', icon: 'it-sigil', r: 'gold' },
    core: { name: '天渊核心', icon: 'it-core', r: 'gold' },
    feather: { name: '风暴羽', icon: 'it-feather', r: 'silver' },
    gear: { name: '古代齿轮', icon: 'it-gear', r: 'silver' },
    map: { name: '古航海图', icon: 'it-map', r: 'gold' },
    fang: { name: '雷角兽之牙', icon: 'it-fang', r: 'silver' },
    iceCore: { name: '冰晶之核', icon: 'it-core', r: 'gold', el: 'water' },
    obsidian: { name: '黑曜石', icon: 'it-ore', r: 'silver', el: 'dark' },
    moss: { name: '星辉苔', icon: 'it-crystal', r: 'bronze', el: 'light' },
    fishScale: { name: '云鱼鳞', icon: 'it-scale', r: 'bronze', el: 'water' },
    parts: { name: '修理零件', icon: 'it-gear', r: 'bronze' },
    abyssHeart: { name: '天渊之心', icon: 'it-core', r: 'gold', el: 'dark' },
  };

  /* ---------- 任务 ---------- */
  const Q = (o) => o;
  const QUESTS = {
    normal: [
      Q({ id: 'n1', name: '草原岛的不速之客', type: 'hunt', loc: '翠风草原岛', rec: 2400, reward: 'windCrystal', boss: { name: '角兔群', el: 'wind', weak: 'fire' }, desc: '草原岛的牧场遭到角兔群袭击。驱散它们，让牧民安心放牧。' }),
      Q({ id: 'n2', name: '白帆灯塔的委托', type: 'escort', loc: '白帆灯塔', rec: 3100, reward: 'coin', boss: { name: '云雀盗贼团', el: 'light', weak: 'dark' }, desc: '护送补给艇安全抵达白帆灯塔，途中可能遭遇空贼。' }),
      Q({ id: 'n3', name: '云海渔场的骚动', type: 'hunt', loc: '云海渔场', rec: 3600, reward: 'fishScale', boss: { name: '巨口云鱼', el: 'water', weak: 'earth' }, desc: '渔场出现了吞食渔网的巨口云鱼。' }),
      Q({ id: 'n4', name: '采集星辉苔', type: 'gather', loc: '星辉森林', rec: 2800, reward: 'moss', boss: { name: '森林守卫', el: 'earth', weak: 'wind' }, desc: '为公会药师收集只在夜里发光的星辉苔。' }),
    ],
    hard: [
      Q({ id: 'h1', name: '雷鸣峡谷的狩猎', type: 'hunt', loc: '雷鸣峡谷', rec: 7800, reward: 'fang', boss: { name: '雷角兽', el: 'light', weak: 'dark' }, desc: '峡谷中的雷角兽数量激增，开始袭击过往飞空艇。' }),
      Q({ id: 'h2', name: '沉没遗迹调查', type: 'explore', loc: '沉没遗迹', rec: 8500, reward: 'gear', boss: { name: '遗迹魔像', el: 'earth', weak: 'wind' }, desc: '调查从云海中浮起的古代遗迹。' }),
      Q({ id: 'h3', name: '守护晨星号', type: 'defend', loc: '晨星号甲板', rec: 9200, reward: 'parts', boss: { name: '空鲨群', el: 'wind', weak: 'fire' }, desc: '击退趁夜袭击晨星号的空鲨群。' }),
      Q({ id: 'h4', name: '冰晶洞窟之主', type: 'boss', loc: '冰晶洞窟', rec: 10400, reward: 'iceCore', boss: { name: '霜牙狼王', el: 'water', weak: 'earth' }, desc: '讨伐盘踞在冰晶洞窟深处的狼王。' }),
    ],
    extreme: [
      Q({ id: 'x2', name: '黑曜回廊的猎手', type: 'hunt', loc: '黑曜回廊', rec: 14200, reward: 'obsidian', boss: { name: '影爪豹', el: 'dark', weak: 'light' }, desc: '回廊中潜伏着只在暗处现身的猎手。' }),
      Q({
        id: 'x1', name: '熔炉之巅的咆哮', type: 'boss', loc: '火山岛 · 熔岩竞技场', rec: 15800, reward: 'flameScale', isNew: true,
        boss: { name: '焰冠龙 伊格瑞斯', title: '天渊兽', el: 'fire', weak: 'water', lv: 120 },
        desc: '沉睡于火山岛深处的天渊兽「焰冠龙」已经苏醒。它的炎息正在把熔岩推向周围的岛屿——在整座群岛被点燃之前，讨伐它。',
        goals: ['讨伐 焰冠龙 伊格瑞斯', '时间限制 20:00', '可倒下次数 3 次'],
        rewards: [['flameScale', '低概率'], ['ignHorn', '稀有'], ['sigilGold', '稀有'], ['flameShard', ''], ['fireCrystal', ''], ['coin', '']],
      }),
      Q({ id: 'x3', name: '风暴之眼', type: 'boss', loc: '风暴之眼', rec: 16500, reward: 'feather', boss: { name: '暴风鹰 席尔芙', el: 'wind', weak: 'fire' }, desc: '讨伐在风暴中心筑巢的巨鹰。' }),
      Q({ id: 'x4', name: '失落航线', type: 'explore', loc: '失落航线', rec: 13600, reward: 'map', boss: { name: '幽灵船', el: 'dark', weak: 'light' }, desc: '寻找三十年前消失在云海中的商船航线。' }),
    ],
    legend: [
      Q({ id: 'l1', name: '天渊之王', type: 'boss', loc: '天渊深处', rec: 28000, reward: 'abyssHeart', locked: true, boss: { name: '？？？', el: 'dark', weak: 'light' }, desc: '完成第三章后解锁。' }),
      Q({ id: 'l2', name: '云海之下', type: 'explore', loc: '？？？', rec: 32000, reward: 'core', locked: true, boss: { name: '？？？', el: 'light', weak: 'dark' }, desc: '传说中，云海之下还有一片无人见过的大地。' }),
    ],
  };
  // 补全默认的任务详情
  for (const k in QUESTS)
    QUESTS[k].forEach((q) => {
      if (!q.goals) q.goals = [`${q.type === 'gather' ? '收集' : q.type === 'escort' ? '护送' : q.type === 'explore' ? '调查' : q.type === 'defend' ? '击退' : '讨伐'} ${q.boss.name}`, '时间限制 20:00', '可倒下次数 3 次'];
      if (!q.rewards) q.rewards = [[q.reward, '低概率'], ['expBook', ''], ['potion', ''], ['coin', '']];
    });

  /* ---------- 剧情 ---------- */
  const GLOSSARY = {
    天渊兽: { en: 'Abyssal Beast', cat: '世界观 · 生物', text: '沉睡于群岛深处的远古巨兽。每一头都足以撼动一片岛屿的平衡，近年来接连苏醒。' },
    空行者: { en: 'Skyfarer', cat: '世界观 · 职业', text: '驾驶飞空艇往来于群岛之间，承接委托、讨伐魔物的冒险者。' },
    云海: { en: 'Sea of Clouds', cat: '世界观 · 地理', text: '浮空群岛之下无边无际的云层。传说云海之下，还有一片无人见过的大地。' },
    晨星号: { en: 'The Morning Star', cat: '飞空艇', text: '艾琳一行的飞空艇。船首镶着一枚永不熄灭的晨星石，是空行者公会登记在册的第 108 号船。' },
    赫菲拉: { en: 'Hephyra', cat: '地点 · 火山岛', text: '群岛南端的火山岛。山巅的熔岩竞技场是古代空行者的试炼之地。' },
  };
  const STORY = {
    chapter: { num: '第三章', en: 'CHAPTER III', name: '焰冠苏醒', enName: 'THE FLAME CROWN AWAKENS', tag: '沉睡于熔岩深处的巨兽，睁开了它的眼睛。' },
    place: '晨星号 · 甲板',
    time: '黄昏',
    lines: [
      { who: 'rock', text: '喂——舵手！船底都快被烤熟了，下面这到底是哪座岛啊？' },
      { who: 'thea', text: '是火山岛「{赫菲拉}」。公会的情报说，{天渊兽}就沉睡在山巅的熔岩竞技场里。' },
      { who: 'baldo', text: '哈哈！能让整座岛都发烫的家伙，正好拿来给我的斧头热热身。' },
      { who: 'erin', text: '它已经醒了。再这样下去，周围的岛都会被拖进{云海}。' },
      { who: 'erin', text: '我们是{空行者}——{晨星号}，准备降落！' },
    ],
  };

  G.DATA = { ELEMENTS, WEAPONS, RARITY, QTYPES, TIERS, TRAITS, SKILLS, chars: CHARS, CHAR_ORDER, SIGIL_BAG, FINISHERS, ITEMS, QUESTS, GLOSSARY, STORY };

  /* ---------- 可变状态 ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  G.resetState = function () {
    const builds = {};
    for (const id of CHAR_ORDER) builds[id] = { skills: CHARS[id].skills.slice(), sigils: clone(CHARS[id].sigils) };
    G.state = {
      party: ['erin', 'rock', 'thea', 'rin'],
      builds,
      tier: 'normal',
      quest: 'x1',
      bag: clone(SIGIL_BAG),
      result: null,
      storyLine: 0,
    };
  };
  G.resetState();

  G.questById = (id) => {
    for (const k in QUESTS) for (const q of QUESTS[k]) if (q.id === id) return Object.assign({ tier: k }, q);
    return null;
  };

  /* ---------- 数值计算 ---------- */
  G.traitSum = function (sigils) {
    const sum = {};
    for (const s of sigils) if (s) sum[s.t] = (sum[s.t] || 0) + s.lv;
    return sum;
  };
  G.calcStats = function (id, build) {
    const c = CHARS[id];
    build = build || G.state.builds[id];
    const tr = G.traitSum(build.sigils);
    const lv = (k) => Math.min(tr[k] || 0, TRAITS[k].max);
    let pas = { ultgain: 0, atk: 0 };
    build.skills.forEach((s) => { const p = SKILLS[s].passive; if (p) for (const k in p) pas[k] = (pas[k] || 0) + p[k]; });
    const atk = Math.round((c.base.atk + c.weaponItem.atk + lv('atk') * 36) * (1 + (pas.atk || 0) / 100));
    const hp = c.base.hp + c.weaponItem.hp + lv('hp') * 160;
    const def = c.base.def + lv('def') * 22;
    const crit = +(c.base.crit + lv('crit') * 0.9).toFixed(1);
    const critdmg = c.base.critdmg + lv('critdmg') * 2;
    const ultgain = +(c.base.ultgain + lv('ultgain') * 1.6 + (pas.ultgain || 0)).toFixed(1);
    const skillRaw = build.skills.reduce((a, s) => a + SKILLS[s].pow, 0);
    const skillpow = Math.round(skillRaw * (1 + lv('eldmg') * 0.02));
    const cdAvg = +((build.skills.reduce((a, s) => a + SKILLS[s].cd, 0) / 4) * (1 - lv('cdr') * 0.012)).toFixed(2);
    const power = Math.round(atk * 0.35 + hp * 0.04 + def * 0.3 + crit * 12 + critdmg * 3 + skillpow * 0.12 + ultgain * 4 + (lv('link') + lv('brk')) * 5 - cdAvg * 8);
    return { power, atk, hp, def, crit, critdmg, ultgain, skillpow, cd: cdAvg };
  };
  G.STAT_ROWS = [
    { k: 'power', name: '战力', en: 'POWER', icon: 'ui-power', fmt: (v) => G.fmt(v) },
    { k: 'atk', name: '攻击力', en: 'ATK', icon: 'ui-atkup', fmt: (v) => G.fmt(v) },
    { k: 'hp', name: '生命值', en: 'HP', icon: 'ui-heart', fmt: (v) => G.fmt(v) },
    { k: 'def', name: '防御力', en: 'DEF', icon: 'ui-shield', fmt: (v) => G.fmt(v) },
    { k: 'crit', name: '暴击率', en: 'CRIT', icon: 'ui-crit', fmt: (v) => v.toFixed(1) + '%' },
    { k: 'critdmg', name: '暴击伤害', en: 'CRIT DMG', icon: 'ui-critdmg', fmt: (v) => Math.round(v) + '%' },
    { k: 'ultgain', name: '奥义效率', en: 'ULT GAIN', icon: 'ui-ult', fmt: (v) => v.toFixed(1) + '%' },
    { k: 'skillpow', name: '技能威力', en: 'SKILL PWR', icon: 'ui-skill', fmt: (v) => G.fmt(v) + '%' },
    { k: 'cd', name: '平均冷却', en: 'AVG CD', icon: 'ui-time', fmt: (v) => v.toFixed(1) + 's', lowerBetter: true },
  ];
  G.partyPower = (party) => (party || G.state.party).reduce((a, id) => a + G.calcStats(id).power, 0);
})();
