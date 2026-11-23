/* ================= 三张地图数据 ================= */
/* 节点 type: switch / entry / exit；edge.old 表示旧链路（减速 + 木马显形） */
G.MAPS = [
/* ============== 地图一：分段内网（企业网 14 波） ============== */
{
  id:0, key:'intranet', name:'分段内网', sub:'企业网 · 14 波',
  desc:'门户网站与邮件网关经 DMZ 接入，办公、业务网段互联，外围旧系统与灾备环可绕行核心数据库。隔离西边界节点可迫使 A 折向 DMZ 与 B 汇流；封住核心前节点，流量将分流两侧外环。',
  theme:0,
  nodes:[
    {id:'A',  x:-10,z:-7, type:'entry', name:'入口 A · 门户网站'},
    {id:'B',  x: 10,z:-7, type:'entry', name:'入口 B · 邮件网关'},
    {id:'n1', x:-5, z:-7, type:'switch', name:'DMZ 西交换节点'},
    {id:'n3', x:0,  z:-7, type:'switch', name:'DMZ 汇聚节点'},
    {id:'n2', x:5,  z:-7, type:'switch', name:'DMZ 东交换节点'},
    {id:'n7', x:-9, z:0,  type:'switch', name:'西边界节点 · 办公网段'},
    {id:'n8', x:9,  z:0,  type:'switch', name:'业务网段节点'},
    {id:'n9', x:-12,z:8,  type:'switch', name:'旧系统网段节点'},
    {id:'n10',x:12, z:8,  type:'switch', name:'灾备环节点'},
    {id:'n12',x:0,  z:7,  type:'switch', name:'核心前汇聚节点'},
    {id:'n6', x:0,  z:12, type:'switch', name:'核心防火墙节点'},
    {id:'E',  x:0,  z:16, type:'exit',  name:'出口 · 核心数据库'}
  ],
  /* w：显式路由权重（旧链路已将减速计入权重）；arch：跨越时拱起 */
  edges:[
    {a:'A',b:'n1',w:10},{a:'B',b:'n2',w:10},
    {a:'n1',b:'n3',w:10},{a:'n3',b:'n2',w:10},
    {a:'A',b:'n3',w:60,arch:true},{a:'B',b:'n3',w:60,arch:true},
    {a:'n1',b:'n7',w:60},{a:'n3',b:'n7',w:10},
    {a:'n2',b:'n8',w:10},
    {a:'n7',b:'n2',old:true,w:30,arch:true},
    {a:'n7',b:'n9',w:10},{a:'n9',b:'n12',w:10},{a:'n7',b:'n12',w:34,arch:true},
    {a:'n8',b:'n10',w:10},{a:'n10',b:'n12',w:10},{a:'n8',b:'n12',w:34,arch:true},
    {a:'n12',b:'n6',w:8},{a:'n6',b:'E',w:10},
    {a:'n9',b:'E',w:30,arch:true},{a:'n10',b:'E',w:30,arch:true},
    {a:'n9',b:'n6',old:true,w:26,arch:true},{a:'n10',b:'n6',w:34},
    {a:'n3',b:'n12',w:60,arch:true}
  ],
  platforms:[
    {id:'p1',x:-3.2,z:-1.8},{id:'p2',x:3.2,z:-1.8},{id:'p3',x:-5,z:5},
    {id:'p4',x:5,z:5},{id:'p5',x:-6.5,z:10.5},{id:'p6',x:6.5,z:10.5},
    {id:'p7',x:0,z:1.5},{id:'p8',x:0,z:9.6}
  ],
  obstacles:[
    {x:-5.2,z:3.6,w:2.4,d:1.6,h:1.4,kind:'facility',name:'OA 服务器机柜'},
    {x:5.4,z:3.6,w:2.6,d:1.6,h:1.2,kind:'facility',name:'业务服务器机柜'},
    {x:-9,z:12.5,w:3,d:2,h:1.8,kind:'facility',name:'旧系统机房'},
    {x:9,z:12.5,w:3,d:2,h:1.6,kind:'facility',name:'灾备存储'},
    {x:0,z:-11.5,w:6,d:1.4,h:1.5,kind:'airgap',name:'公网数据流'}
  ],
  entryColors:{'A':0x41e0ff,'B':0x57e389},
  waves:[
    {groups:[{type:'worm',count:6,entry:'A',interval:1.1}]},
    {groups:[{type:'worm',count:8,entry:'A',interval:.9},{type:'worm',count:5,entry:'B',interval:1.2,delay:2}]},
    {groups:[{type:'worm',count:6,entry:'A',interval:.9},{type:'flood',count:2,entry:'B',interval:2.4,delay:1.5}]},
    {groups:[{type:'trojan',count:5,entry:'B',interval:1.3},{type:'worm',count:6,entry:'A',interval:1,delay:2}]},
    {groups:[{type:'ransom',count:3,entry:'A',interval:2},{type:'worm',count:8,entry:'B',interval:.8,delay:1}]},
    {groups:[{type:'ap',count:5,entry:'A',interval:1.2},{type:'worm',count:8,entry:'B',interval:.9,delay:.5}]},
    {groups:[{type:'flood',count:3,entry:'A',interval:2},{type:'trojan',count:5,entry:'B',interval:1.2},{type:'worm',count:6,entry:'A',interval:.8,delay:3}]},
    {groups:[{type:'packer',count:2,entry:'A',interval:3},{type:'worm',count:10,entry:'B',interval:.65,delay:1},{type:'ransom',count:2,entry:'B',interval:2.5,delay:4}]},
    {groups:[{type:'ransom',count:4,entry:'A',interval:1.8},{type:'flood',count:3,entry:'B',interval:2.2,delay:2}]},
    {groups:[{type:'trojan',count:7,entry:'A',interval:1},{type:'trojan',count:6,entry:'B',interval:1.1,delay:1.5},{type:'ap',count:4,entry:'A',interval:1.4,delay:3}]},
    {groups:[{type:'flood',count:4,entry:'A',interval:1.8},{type:'packer',count:2,entry:'B',interval:3.5},{type:'worm',count:12,entry:'B',interval:.55,delay:2}]},
    {groups:[{type:'ransom',count:5,entry:'A',interval:1.5},{type:'trojan',count:7,entry:'B',interval:.9,delay:1},{type:'ap',count:5,entry:'B',interval:1.2,delay:3}]},
    {groups:[{type:'flood',count:4,entry:'A',interval:1.7},{type:'ransom',count:4,entry:'B',interval:1.7,delay:1},{type:'packer',count:3,entry:'A',interval:2.5,delay:3},{type:'worm',count:14,entry:'B',interval:.5,delay:2}]},
    {boss:true,boss:'wankui',groups:[{type:'flood',count:4,entry:'A',interval:2},{type:'worm',count:12,entry:'B',interval:.7,delay:1.5},{type:'ransom',count:3,entry:'A',interval:2.5,delay:6}]}
  ]
},
/* ============== 地图二：骨干流域（跨网专线 15 波） ============== */
{
  id:1, key:'backbone', name:'骨干流域', sub:'跨网专线 · 双活数据中心 · 15 波',
  desc:'互联网、分支专线与云端互联三条来流，经横贯战场的公网流隧道，汇入互为备份的 X、Y 两座数据中心。C、B 平时经旧专线在汇聚节点汇流；封住汇聚点，专线把它们导向另一座数据中心。',
  theme:1,
  nodes:[
    {id:'A',  x:-16,z:-6, type:'entry', name:'入口 A · 互联网'},
    {id:'C',  x:-12,z:-15,type:'entry', name:'入口 C · 分支专线'},
    {id:'B',  x:14, z:-10,type:'entry', name:'入口 B · 云端互联'},
    {id:'a1', x:-9, z:-6, type:'switch', name:'互联网接入节点'},
    {id:'c1', x:-8, z:-10,type:'switch', name:'分支汇聚节点'},
    {id:'b1', x:8,  z:-7, type:'switch', name:'云端汇聚节点'},
    {id:'m',  x:-5, z:1,  type:'switch', name:'西隧道口 · 旧专线', tunnel:true},
    {id:'e',  x:7,   z:1, type:'switch', name:'东隧道口 · 专线隧道', tunnel:true},
    {id:'o1', x:-1,  z:7, type:'switch', name:'骨干汇聚节点'},
    {id:'x1', x:-6,  z:12,type:'switch', name:'数据中心 X 前置'},
    {id:'y1', x:6,   z:12,type:'switch', name:'数据中心 Y 前置'},
    {id:'X',  x:-6,  z:16,type:'exit',  name:'出口 · 数据中心 X'},
    {id:'Y',  x:6,   z:16,type:'exit',  name:'出口 · 数据中心 Y'}
  ],
  edges:[
    {a:'A',b:'a1',w:10},{a:'C',b:'c1',w:10},{a:'B',b:'b1',w:10},
    {a:'A',b:'m',w:60,arch:true},{a:'C',b:'m',w:60,arch:true},{a:'B',b:'e',w:60,arch:true},
    {a:'a1',b:'m',w:10},{a:'c1',b:'m',old:true,w:10},
    {a:'c1',b:'b1',w:22,arch:true},{a:'b1',b:'e',w:10},
    {a:'m',b:'o1',w:10},{a:'e',b:'o1',w:10},
    {a:'a1',b:'c1',w:16,arch:true},{a:'c1',b:'e',w:60,arch:true},
    {a:'b1',b:'y1',w:40,arch:true},
    {a:'o1',b:'x1',w:6},{a:'o1',b:'y1',w:9},
    {a:'e',b:'y1',w:6,arch:true},
    {a:'m',b:'y1',w:22,arch:true},{a:'e',b:'x1',w:22,arch:true},
    {a:'x1',b:'y1',w:12},{a:'x1',b:'X',w:10},{a:'y1',b:'Y',w:10},
    {a:'x1',b:'Y',w:60,arch:true},{a:'y1',b:'X',w:60,arch:true}
  ],
  platforms:[
    {id:'p1',x:-12.5,z:-10.5},{id:'p2',x:11,z:-3},{id:'p3',x:-8.5,z:-2},
    {id:'p4',x:2.5,z:-4.2},{id:'p5',x:-3,z:5},{id:'p6',x:3.5,z:6.5},
    {id:'p7',x:0,z:10.2},{id:'p8',x:-8,z:13.8},{id:'p9',x:8,z:13.8}
  ],
  obstacles:[
    {x:0,z:1,w:34,d:3.2,h:2.2,kind:'publicflow',name:'公网数据流（横贯）'},
    {x:-6,z:16.9,w:3.4,d:1.4,h:2.6,kind:'datacenter',name:'数据中心 X 机柜群'},
    {x:6,z:16.9,w:3.4,d:1.4,h:2.6,kind:'datacenter',name:'数据中心 Y 机柜群'},
    {x:-14.5,z:-12,w:2.4,d:2.4,h:1.6,kind:'facility',name:'专线 CPE'},
    {x:12,z:-12.5,w:2.4,d:2,h:1.5,kind:'facility',name:'云接入网关'}
  ],
  entryColors:{'A':0x41e0ff,'B':0x57e389,'C':0xffc44d},
  waves:[
    {groups:[{type:'worm',count:7,entry:'A',interval:.9}]},
    {groups:[{type:'worm',count:7,entry:'C',interval:.9},{type:'worm',count:6,entry:'B',interval:1,delay:2}]},
    {groups:[{type:'trojan',count:6,entry:'A',interval:1.1},{type:'flood',count:2,entry:'C',interval:2.4,delay:2}]},
    {groups:[{type:'flood',count:3,entry:'B',interval:2},{type:'worm',count:8,entry:'A',interval:.8,delay:1}]},
    {groups:[{type:'ransom',count:4,entry:'C',interval:1.8},{type:'ap',count:5,entry:'A',interval:1.1,delay:1}]},
    {groups:[{type:'packer',count:2,entry:'B',interval:3},{type:'worm',count:10,entry:'A',interval:.6,delay:1},{type:'trojan',count:5,entry:'C',interval:1.1,delay:3}]},
    {groups:[{type:'flood',count:4,entry:'A',interval:1.8},{type:'ransom',count:3,entry:'B',interval:2,delay:1.5}]},
    {flood:true,groups:[{type:'worm',count:14,entry:'A',interval:.5},{type:'worm',count:12,entry:'B',interval:.55,delay:.5},{type:'flood',count:4,entry:'C',interval:1.8,delay:1}]},
    {groups:[{type:'trojan',count:8,entry:'C',interval:.9},{type:'packer',count:2,entry:'A',interval:3,delay:2}]},
    {groups:[{type:'ransom',count:5,entry:'A',interval:1.4},{type:'ransom',count:4,entry:'B',interval:1.6,delay:1},{type:'flood',count:3,entry:'C',interval:2,delay:2}]},
    {groups:[{type:'ap',count:8,entry:'A',interval:.8},{type:'worm',count:10,entry:'B',interval:.6,delay:1},{type:'trojan',count:6,entry:'C',interval:1,delay:2}]},
    {groups:[{type:'flood',count:5,entry:'C',interval:1.6},{type:'packer',count:3,entry:'B',interval:2.5,delay:1},{type:'ransom',count:4,entry:'A',interval:1.7,delay:3}]},
    {groups:[{type:'trojan',count:9,entry:'A',interval:.8},{type:'trojan',count:8,entry:'B',interval:.85,delay:1},{type:'flood',count:4,entry:'C',interval:2,delay:2}]},
    {groups:[{type:'flood',count:5,entry:'A',interval:1.5},{type:'ransom',count:5,entry:'B',interval:1.5,delay:1},{type:'packer',count:3,entry:'C',interval:2.5,delay:2},{type:'ap',count:6,entry:'A',interval:1,delay:4}]},
    {boss:true,boss:'shenlou',groups:[{type:'trojan',count:8,entry:'C',interval:.9},{type:'flood',count:4,entry:'A',interval:2,delay:1},{type:'worm',count:12,entry:'B',interval:.6,delay:2}]}
  ]
},
/* ============== 地图三：气隙深层（工控网 16 波） ============== */
{
  id:2, key:'ics', name:'气隙深层', sub:'工控网 · 双核心 · 16 波',
  desc:'三道接入围绕中央气隙，运维环连通南北两座控制核心。隔离环上不同节点，流量在两侧狭窄通道间转移；老工控总线是更慢的支路。两个核心的防守相互牵制。',
  theme:2,
  nodes:[
    {id:'A',  x:0,  z:-14,type:'entry', name:'入口 A · 运维跳板机'},
    {id:'B',  x:-14,z:0,  type:'entry', name:'入口 B · 办公网下行'},
    {id:'C',  x:14, z:0,  type:'entry', name:'入口 C · 供应商远程维护'},
    {id:'n1', x:0,  z:-9, type:'switch', name:'运维环 · 北节点'},
    {id:'n2', x:-8, z:-5, type:'switch', name:'运维环 · 西北节点'},
    {id:'n3', x:-8, z:5,  type:'switch', name:'运维环 · 西南节点'},
    {id:'n4', x:0,  z:9,  type:'switch', name:'运维环 · 南节点'},
    {id:'n5', x:8,  z:5,  type:'switch', name:'运维环 · 东南节点'},
    {id:'n6', x:8,  z:-5, type:'switch', name:'运维环 · 东北节点'},
    {id:'w',  x:-12,z:9,  type:'switch', name:'老工控总线 · 西支节点'},
    {id:'e',  x:12, z:9,  type:'switch', name:'老工控总线 · 东支节点'},
    {id:'X',  x:-5, z:15, type:'exit',  name:'出口 · 过程控制核心'},
    {id:'Y',  x:5,  z:15, type:'exit',  name:'出口 · 安全联锁核心'}
  ],
  edges:[
    {a:'n1',b:'n2',w:4},{a:'n2',b:'n3',w:4},{a:'n3',b:'n4',w:24},{a:'n4',b:'n5',w:24},{a:'n5',b:'n6',w:3},{a:'n6',b:'n1',w:12},
    {a:'A',b:'n1',w:10},{a:'A',b:'n2',w:16},{a:'A',b:'n6',w:16},
    {a:'B',b:'n2',w:10},{a:'B',b:'n3',w:10},
    {a:'C',b:'n6',w:10},{a:'C',b:'n5',w:40},
    {a:'n3',b:'X',w:50},{a:'n4',b:'X',w:12},{a:'n5',b:'Y',w:50},{a:'n4',b:'Y',w:12},
    {a:'n3',b:'w',old:true,w:5},{a:'w',b:'n4',old:true,w:5},
    {a:'n5',b:'e',old:true,w:5},{a:'e',b:'n4',old:true,w:5},
    {a:'n1',b:'n4',w:60,arch:true},
    {a:'n2',b:'w',w:20,arch:true},{a:'n6',b:'e',w:12,arch:true}
  ],
  platforms:[
    {id:'p1',x:-3.5,z:-7.5},{id:'p2',x:3.5,z:-7.5},{id:'p3',x:-11,z:-3},
    {id:'p4',x:11,z:-3},{id:'p5',x:-11,z:3},{id:'p6',x:11,z:3},
    {id:'p7',x:-3,z:12.2},{id:'p8',x:3,z:12.2},{id:'p9',x:0,z:-1.5}
  ],
  obstacles:[
    {x:0,z:0,w:6.5,d:6.5,h:3,kind:'airgap',name:'中央气隙'},
    {x:-6.8,z:15,w:2.6,d:1.8,h:2.2,kind:'plc',name:'PLC 控制阵列 X'},
    {x:6.8,z:15,w:2.6,d:1.8,h:2.2,kind:'plc',name:'联锁控制器 Y'},
    {x:-13.8,z:-6,w:2,d:2.4,h:1.5,kind:'facility',name:'运维终端柜'},
    {x:13.8,z:-6,w:2,d:2.4,h:1.5,kind:'facility',name:'供应商接入闸'}
  ],
  entryColors:{'A':0x41e0ff,'B':0xffc44d,'C':0xff7a5c},
  waves:[
    {groups:[{type:'worm',count:7,entry:'A',interval:.95}]},
    {groups:[{type:'worm',count:6,entry:'B',interval:1},{type:'worm',count:6,entry:'C',interval:1,delay:2}]},
    {groups:[{type:'flood',count:3,entry:'A',interval:2},{type:'worm',count:7,entry:'B',interval:.9,delay:1}]},
    {groups:[{type:'trojan',count:6,entry:'C',interval:1.1},{type:'worm',count:7,entry:'A',interval:.85,delay:1.5}]},
    {groups:[{type:'ransom',count:3,entry:'B',interval:2},{type:'flood',count:3,entry:'C',interval:2,delay:2}]},
    {groups:[{type:'ap',count:6,entry:'A',interval:1},{type:'trojan',count:5,entry:'B',interval:1.1,delay:1}]},
    {groups:[{type:'packer',count:2,entry:'C',interval:3},{type:'worm',count:10,entry:'A',interval:.6,delay:1},{type:'ransom',count:2,entry:'B',interval:2.5,delay:3}]},
    {flood:true,groups:[{type:'worm',count:12,entry:'A',interval:.55},{type:'flood',count:4,entry:'B',interval:1.8,delay:.5},{type:'flood',count:4,entry:'C',interval:1.8,delay:1}]},
    {groups:[{type:'flood',count:4,entry:'A',interval:1.8},{type:'trojan',count:6,entry:'B',interval:1,delay:1.5}]},
    {groups:[{type:'ransom',count:5,entry:'C',interval:1.5},{type:'packer',count:2,entry:'A',interval:3,delay:2}]},
    {groups:[{type:'trojan',count:8,entry:'A',interval:.85},{type:'trojan',count:6,entry:'B',interval:1,delay:1},{type:'ap',count:5,entry:'C',interval:1.1,delay:2.5}]},
    {groups:[{type:'flood',count:5,entry:'B',interval:1.6},{type:'ransom',count:4,entry:'A',interval:1.7,delay:1.5},{type:'worm',count:12,entry:'C',interval:.55,delay:2}]},
    {groups:[{type:'packer',count:3,entry:'A',interval:2.5},{type:'ransom',count:5,entry:'B',interval:1.5,delay:1},{type:'trojan',count:7,entry:'C',interval:.9,delay:2.5}]},
    {groups:[{type:'flood',count:5,entry:'C',interval:1.5},{type:'trojan',count:8,entry:'B',interval:.8,delay:1},{type:'ap',count:7,entry:'A',interval:.85,delay:2}]},
    {groups:[{type:'flood',count:5,entry:'A',interval:1.4},{type:'ransom',count:6,entry:'B',interval:1.3,delay:1},{type:'packer',count:3,entry:'C',interval:2.2,delay:2},{type:'worm',count:14,entry:'A',interval:.5,delay:3}]},
    {boss:true,boss:'zheying',groups:[{type:'trojan',count:8,entry:'A',interval:.9},{type:'flood',count:4,entry:'B',interval:2,delay:2},{type:'ransom',count:4,entry:'C',interval:1.8,delay:4}]}
  ]
}
];

/* 敌人档案 */
G.ENEMIES = {
  worm:  {name:'蠕虫',     icon:'🪱', hp:46,  speed:1.5, dmg:9,  atkRate:1.1, leak:1, reward:6, intel:0,  blockCap:1, color:0xff6b4d, scale:1,
          desc:'被阻挡时持续近战攻击防火墙。首次经过直通的交换节点时复制一只同伴（复制体不再复制）。'},
  flood: {name:'洪泛团',   icon:'🌊', hp:150, speed:1.05,dmg:34, atkRate:.9, leak:2, reward:14,intel:1, blockCap:3, color:0x41d6ff, scale:1.5,
          desc:'占用 3 点阻挡容量。会离开路线冲向被隔离节点，重击节点上的网闸/塔，打通后沿重新开放的道路前进。'},
  trojan:{name:'木马',     icon:'🎁', hp:60,  speed:1.35,dmg:9,  atkRate:1,   leak:1, reward:10,intel:1, blockCap:1, color:0xd88cff, scale:1,
          desc:'伪装为正常数据包，显形前无法被远程单体主动选中。沙箱检测、旧链路和阻挡会使其显形；未显形被波及消灭时释放载荷，伤害周围的塔。'},
  ransom:{name:'勒索者',   icon:'🔒', hp:85,  speed:1.15,dmg:7,  atkRate:1.3, leak:1, reward:14,intel:1, blockCap:1, color:0xffd23d, scale:1.1, ranged:true, range:5.2,
          desc:'行进中远程攻击射程内的塔（含平台），造成伤害并施加加密；优先锁定蜜罐。'},
  ap:    {name:'伪热点',   icon:'📡', hp:38,  speed:2.0, dmg:0, atkRate:0,   leak:1, reward:8, intel:0, blockCap:0, color:0xff8fd8, scale:.9, flying:true,
          desc:'飞行单位，沿无线层从入口直飞出口，无视地面道路与阻挡，只能由拦截器等对空火力击落。'},
  packer:{name:'加壳器',   icon:'🛡', hp:110, speed:1.0, dmg:0, atkRate:0,   leak:1, reward:16,intel:1, blockCap:1, color:0x9db4ff, scale:1.15, aura:true,
          desc:'为周围同伴提供可被打破的护盾，掩护敌群推进。'},
  /* Boss */
  wankui: {name:'万傀', icon:'👑', hp:2600, speed:.8, dmg:60, atkRate:.8, leak:8, reward:0, intel:0, blockCap:6, color:0xff3355, scale:2.4, boss:true,
           desc:'僵尸网络主控。洪峰重创隔离点；生命低于 50% 释放成群蠕虫。'},
  shenlou:{name:'蜃楼', icon:'🌀', hp:3000, speed:.75,dmg:45, atkRate:1,  leak:8, reward:0, intel:0, blockCap:5, color:0x8f7cff, scale:2.4, boss:true, ranged:true, range:7,
           desc:'路由欺骗实体。伪路由制造黑洞截断链路；残血后发动路由风暴，剥夺附近塔的护盾。'},
  zheying:{name:'蛰影', icon:'🦂', hp:3600, speed:.7, dmg:70, atkRate:.9, leak:10,reward:0, intel:0, blockCap:6, color:0x7cff9e, scale:2.6, boss:true,
           desc:'蛰组织核心威胁。潜伏→提权→破坏三阶段：潜伏时须检测才能被远程选中，提权后高护甲并放出木马，破坏阶段锁死前方运维环。'}
};

/* 塔档案 */
G.TOWERS = {
  firewall:{name:'防火墙',icon:'🧱',cost:{c:70},hp:300,loc:['link','node'],color:0x4da6ff,
    desc:'链路上阻挡至多 3 个地面敌人并还击；部署在节点则隔离节点，并拦截相邻链路上的敌人。'},
  honeypot:{name:'蜜罐',icon:'🍯',cost:{c:55},hp:150,loc:['link'],color:0xffb44d,
    desc:'诱使附近攻塔敌人转向自己，耐久低但免疫加密。主动技能「诱捕」困住被诱来的敌人。'},
  gate:{name:'网闸',icon:'🚧',cost:{c:40,i:1},hp:430,loc:['node'],color:0x8fd0ff,
    desc:'低成本隔离节点，耐久高，不攻击，用于改变道路。仍会被敌人攻击破坏。'},
  interceptor:{name:'拦截器',icon:'🎯',cost:{c:90},hp:120,loc:['platform'],color:0x5ef0c0,
    desc:'朝向扇形区域内远程单体攻击，可打地面与飞行目标。升级二选一：贯穿 / 压制。'},
  sandbox:{name:'沙箱',icon:'🧪',cost:{c:100},hp:140,loc:['platform'],color:0xb08cff,
    desc:'检测范围内伪装/潜伏目标使其显形，并对地面敌人周期范围攻击，擅长汇聚流量。'},
  repair:{name:'修复进程',icon:'➕',cost:{c:65},hp:130,loc:['platform'],color:0x6fe08a,
    desc:'不攻击，持续治疗范围内友塔。主动技能「冗余切换」：附近友塔获得护盾并解除加密。'}
};

/* 道具档案 */
G.ITEMS = {
  isolator:{name:'应急隔离器',icon:'⛔',cost:{i:2},target:'node',
    desc:'临时隔离一个直通节点（有耐久与时限，可被冲毁），不产生情报。'},
  downgrade:{name:'协议降级',icon:'📉',cost:{i:2},target:'link',
    desc:'一片链路暂时降级为旧协议：地面敌人减速、伪装木马显形，路线按新速度重新收敛。'},
  backup:{name:'备份还原',icon:'💾',cost:{c:60},target:'tower',
    desc:'恢复一座塔 60% 生命并解除加密。'}
};
