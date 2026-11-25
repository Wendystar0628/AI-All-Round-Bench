'use strict';
const elementNames = {wind:'风',fire:'火',water:'水',earth:'土',dark:'暗',light:'光'};
const elementColors = {wind:'#5a8970',fire:'#cf5637',water:'#548a9e',earth:'#a18145',dark:'#867697',light:'#b6953c'};
const elementBright = {wind:'#b4d6ab',fire:'#ff976f',water:'#95d1e6',earth:'#e0c188',dark:'#d0b6e5',light:'#f6de8a'};
const characters = [
 {name:'艾琳',en:'EIRIN',weapon:'单手剑',w:'sword',e:'wind',level:62,atk:1740,hp:8160,crit:16,power:6340,gear:'风信之刃',ult:'苍岚断空',title:'逐风剑士',skills:['回风斩','逐影突袭','岚之守势','破空刃','流星连斩','风羽回旋']},
 {name:'罗克',en:'ROCK',weapon:'长枪',w:'spear',e:'fire',level:61,atk:1860,hp:8530,crit:12,power:6180,gear:'烬牙长枪',ult:'焚星贯日',title:'赤槊先锋',skills:['燎原刺','贯虹一击','熔火架势','落日枪','绯焰连突','星火横扫']},
 {name:'希娅',en:'SIA',weapon:'法杖',w:'staff',e:'water',level:60,atk:1510,hp:7320,crit:19,power:5920,gear:'潮汐祷杖',ult:'沧海咏叹',title:'潮歌术士',skills:['潮涌','寒星坠落','深蓝庇护','洄流之歌','晶浪回声','霜环缚']},
 {name:'巴尔多',en:'BALDO',weapon:'大斧',w:'axe',e:'earth',level:62,atk:2010,hp:10280,crit:10,power:6240,gear:'断岭重斧',ult:'千岩崩落',title:'磐岩守卫',skills:['裂地斩','奔雷撞击','岩铠','破岳','陨星重劈','大地回响']},
 {name:'凛',en:'RIN',weapon:'双刀',w:'blades',e:'dark',level:60,atk:1650,hp:7180,crit:24,power:5980,gear:'朔夜双刃',ult:'朔月无影',title:'夜行双刃',skills:['碎影','月隐','夜幕步','双月斩','流萤乱舞','影袭']},
 {name:'薇奥拉',en:'VIOLA',weapon:'双枪',w:'guns',e:'light',level:61,atk:1560,hp:7560,crit:22,power:6080,gear:'白昼礼赞',ult:'群星齐鸣',title:'巡光射手',skills:['晨星连射','折光弹','白昼屏障','银翼齐发','星轨穿透','流光舞']}
];
const skillInfo = [
 {cd:5,effect:'快速打击目标，造成 240% 属性伤害。',atk:35,hp:0,crit:0.5,icon:'sword'},
 {cd:7,effect:'突进至锁定位置，提升连携值。',atk:30,hp:40,crit:1,icon:'bolt'},
 {cd:10,effect:'强化防御，回复自身 12% 生命。',atk:0,hp:260,crit:0,icon:'shield'},
 {cd:8,effect:'击穿敌方防线，额外削减模式槽。',atk:50,hp:20,crit:.5,icon:'trace'},
 {cd:6,effect:'发动四段连击，暴击时积攒奥义。',atk:88,hp:-90,crit:2,icon:'blades'},
 {cd:9,effect:'持续打击周围目标，提升全队生命。',atk:16,hp:210,crit:1.5,icon:'feather'}
];
const sigils = [
 {name:'强攻',level:2,atk:40,hp:0,crit:0,rarity:1,icon:'sword'},
 {name:'坚韧',level:2,atk:0,hp:150,crit:0,rarity:1,icon:'shield'},
 {name:'强攻',level:3,atk:60,hp:0,crit:0,rarity:2,icon:'sword'},
 {name:'会心',level:3,atk:8,hp:0,crit:3,rarity:2,icon:'cross'},
 {name:'坚韧',level:1,atk:0,hp:75,crit:0,rarity:0,icon:'shield'},
 {name:'会心',level:1,atk:0,hp:0,crit:1,rarity:0,icon:'cross'}
];
const rareNames=['铜','银','金'];
const difficulties=['普通','困难','极难','传说'];
const difficultyEN=['NORMAL','HARD','EXTREME','LEGEND'];
const quests=[
 [
 ['港湾的第一道警报','护航作战','晨星港 · 外港航道',6200,'护航物资船离港，驱退逼近航道的焰冠龙。','航行铜币','coin'],
 ['风脉巡行','航路清剿','风鸣岛 · 风车台地',7800,'压制焰冠龙的攻势，恢复东侧风脉的通行。','风纹碎晶','crystal'],
 ['余烬调查','讨伐侦察','火山岛 · 灰烬滩',8400,'与焰冠龙交战，记录火属性反应的变化。','赤铜徽印','sigil']
 ],[
 ['横渡灰烬航道','护航作战','火山岛 · 灰烬航道',13400,'掩护晨星号穿过火山灰，击退尾随的焰冠龙。','精炼银砂','crystal'],
 ['赤翼来袭','首领讨伐','火山岛 · 北部断崖',15800,'追踪灼热的翼痕，在北部断崖击败焰冠龙。','赤鳞碎片','feather'],
 ['封锁线上的信号','航路清剿','云齿岛 · 南部空港',17200,'击退占据补给航路的焰冠龙，为舰队开路。','银翼徽章','sigil']
 ],[
 ['灼风中的护航令','护航作战','火山岛 · 灼风峡口',20800,'截下冲向补给舰的焰冠龙，确保船队通过峡口。','赤钢结晶','crystal'],
 ['熔炉之巅的咆哮','首领讨伐','火山岛 · 熔岩竞技场',22400,'前往熔岩竞技场，讨伐从地脉中苏醒的焰冠龙，平息火山岛的震动。','焰冠龙之角','horn'],
 ['余烬封锁线','航路清剿','火山岛 · 赤砂隘口',23800,'突破伊格瑞斯的火焰封锁，打通赤砂隘口。','淬火金徽','sigil']
 ],[
 ['天渊最后的咆哮','首领讨伐','火山岛 · 天渊之眼',28400,'深入天渊之眼，斩断焰冠龙与古代地脉的共鸣。','古龙心核','crystal'],
 ['红莲远征','首领讨伐','火山岛 · 红莲熔层',30200,'抵达红莲熔层，在焰潮中完成对伊格瑞斯的讨伐。','绯焰王冠','sigil'],
 ['不落的晨星','护航作战','晨星港 · 白昼航道',31800,'守住最后的返港航线，击退追击晨星号的焰冠龙。','晨星勋章','sigil']
 ]
];
const questIcons={'护航作战':'sail','首领讨伐':'hunt','航路清剿':'compass','讨伐侦察':'cross'};
const storyLines=[
 {who:0,text:'老一辈的「空行者」说，云海之下还有一片大地。\n等这次返航，我想在海图的空白处，画下第一条海岸线。'},
 {who:2,text:'听右舷……火山岛的风声停了。\n那是「天渊兽」的心跳。整座岛都在回应它。'},
 {who:1,text:'连船舷都在跟着震！我的枪可等不及了。\n把晨星号再靠近一点，这次我来开路。'},
 {who:0,text:'航向东北，目标熔岩竞技场。\n守住这座岛，我们才有下一张海图可画。'}
];
const glossary={'空行者':'以飞空艇往来于群岛之间，接受委托、探索航路和讨伐魔物的冒险者。','天渊兽':'沉睡在岛屿深处的远古巨兽。它们的苏醒，正动摇维系群岛的平衡。'};
const sceneIndex=[
 ['title','标题画面','TITLE SCREEN','wing'],['story','剧情通讯','BRIDGE COMMS','radio'],['quest','任务柜台','QUEST COUNTER','log'],
 ['party','编队与养成','PARTY FORMATION','shield'],['battle','战斗指挥','BATTLE HUD','cross'],['burst','奥义与连锁','CHAIN BURST','bolt'],['result','任务结算','QUEST RESULT','laurel']
];
const initLoadout=()=>characters.map(()=>({skills:[0,1,2,3],sigils:[0,1,0],xp:3600,levelGain:0}));
const finisherNames={wind:'终天风廻',fire:'红莲焚穹',water:'溟海星潮',earth:'山岳震天',dark:'永夜朔月',light:'群星破晓'};

