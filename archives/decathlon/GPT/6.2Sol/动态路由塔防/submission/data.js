"use strict";
const glyphs={
 brand:'<path d="M12 2 21 7v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10M8 5l9 5v5"/>',
 cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v4m6-4v4m-6 12v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
 intel:'<path d="m12 2 9 10-9 10-9-10zm0 5 4 5-4 5-4-5z"/>', heart:'<path d="m12 22-8-5V6l8-4 8 4v11zM6 12h3l2-4 2 7 2-3h3"/>',
 pause:'<path d="M9 5v14m6-14v14" stroke-width="3"/>', play:'<path d="m8 5 12 7-12 7z"/>', volume:'<path d="M3 9h4l5-4v14l-5-4H3zm13 0q4 3 0 6m2-9q7 6 0 12"/>', mute:'<path d="M3 9h4l5-4v14l-5-4H3zm14 0 5 6m0-6-5 6"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4m8 2v4m-6 2v4" stroke-width="3"/>',
 radar:'<circle cx="12" cy="12" r="9"/><path d="M16 16a6 6 0 1 1-5-10m1 6 7-7m-7 7h.1"/>',
 activity:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',select:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5m5-8 8 4-4 1-1 4z"/>',
 kit:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3m-7 7h6m-3-3v6"/>',
 cross:'<circle cx="12" cy="12" r="7"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6m-10 0h.1"/>',
 focus:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5"/><circle cx="12" cy="12" r="3"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5m-18 4 9 5 9-5"/>',
 firewall:'<path d="M3 17V6h18v11zm0-6h18M8 6v5m8-5v5m-4 0v6M7 21h10"/>',
 honey:'<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="M12 7c-1 2-4 4-4 6a4 4 0 0 0 8 0c0-2-3-4-4-6z"/>',
 gate:'<path d="M3 21V5h5v16m8 0V5h5v16M8 9h8M8 14h8m-8 5h8"/>',
 gun:'<path d="m4 16 4-4 5 1 6-8 2 2-5 9-7 2-2 3H3zM16 4h4"/>',
 sandbox:'<path d="m12 2 9 5v10l-9 5-9-5V7zm0 5 5 3v4l-5 3-5-3v-4zM3 7l4 3m10 4 4 3m-9 0v5"/>',
 repair:'<path d="M5 4h14l3 8-3 8H5l-3-8zm7 4v8m-4-4h8"/>',
 isolate:'<path d="M6 4h12l4 8-4 8H6l-4-8zM9 8l6 8m0-8-6 8"/>',
 downgrade:'<path d="m3 7 5 5 5-5m-3 5 5 5 5-5m-17 7h18"/>',
 backup:'<path d="M4 10a8 8 0 1 1 1 7M4 5v5h5m3-3v5l3 2"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.1"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', shield:'<path d="M12 2 21 6v7c0 4-9 9-9 9s-9-5-9-9V6z"/>',
 bug:'<path d="M7 9h10v8a5 5 0 0 1-10 0zM9 9V6l3-2 3 2v3M3 11h4m10 0h4M3 17h4m10 0h4m-9-4v7"/>'
};
const icon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(glyphs[name]||glyphs.info)+'</svg>';
const TOWERS={
 firewall:{name:'防火墙',icon:'firewall',color:'#ffb45f',role:'阻挡 · 链路 / 节点',cpu:95,intel:0,hp:265,r:1.35,cap:2,desc:'阻挡两单位地面威胁并反击。部署于交换节点时，隔离节点并在相邻链路拦截。',upgrade:'加固壁垒 · 扩大阻挡容量，反击强化'},
 honey:{name:'蜜罐',icon:'honey',color:'#f68fc7',role:'诱敌 · 链路',cpu:75,intel:0,hp:155,r:2.1,cap:2,desc:'伪造应答吸引附近可攻塔的地面敌人。免疫加密。主动诱捕已被吸引的敌人。',skill:'诱捕',branches:[['深层诱饵','扩大仿冒有效距离，诱捕延时。'],['反制载荷','诱捕立即破坏被引诱敌人的护盾，并造成伤害。']]},
 gate:{name:'网闸',icon:'gate',color:'#b89dff',role:'隔离 · 节点',cpu:55,intel:1,hp:325,r:0,cap:0,desc:'切断交换节点的通行，迫使业务和地面恶意流量重新选路。可被破坏。',upgrade:'双层网闸 · 强化耐久并获得吸收护盾'},
 gun:{name:'拦截器',icon:'gun',color:'#64e4f6',role:'远程 · 定向平台',cpu:120,intel:0,hp:145,r:3.75,cap:0,desc:'打击所朝向的扇区内最接近出口的一个已显形目标，兼顾地面和无线层。',branches:[['贯穿弹道','沿主目标的弹道命中同一层的其他敌人，伪装目标也可能被波及。'],['流量压制','命中挂载减速，延缓目标推进。']]},
 sandbox:{name:'沙箱',icon:'sandbox',color:'#c7ee7c',role:'范围检测 · 平台',cpu:130,intel:0,hp:160,r:2.65,cap:0,desc:'检测并显形附近的伪装敌人，发射分析弹，在落点对地面目标造成范围伤害。',upgrade:'深度扫描 · 扩大检测和爆破覆盖'},
 repair:{name:'修复进程',icon:'repair',color:'#62e5af',role:'治疗支援 · 平台',cpu:105,intel:0,hp:140,r:2.75,cap:0,desc:'持续修复附近另一座受损的塔。冗余切换为友塔解除加密并提供护盾。',skill:'冗余切换',upgrade:'并行恢复 · 同时修复两座塔，冗余护盾强化'}
};
const TOWER_TUNING={
 firewall:[{damage:19,interval:.76},{damage:29,interval:.76,cap:3}],
 honey:[{skillCd:15,trap:3.2},{skillCd:15,rangeBonus:.8,trap:5},{skillCd:15,rangeBonus:.2,trap:3.2,trapDamage:38}],
 gate:[{},{shield:95}],
 gun:[{damage:26,interval:.65},{damage:33,interval:.47,rangeBonus:.45,pierce:22},{damage:33,interval:.47,rangeBonus:.45,slow:1.35}],
 sandbox:[{damage:24,interval:1.52,blast:1.13,flight:.18},{damage:32,interval:1.13,rangeBonus:.65,blast:1.45,flight:.18}],
 repair:[{repair:15,interval:.72,targets:1,skillCd:19,shield:62,burst:22},
  {repair:19,interval:.72,targets:2,skillCd:19,rangeBonus:.5,shield:100,burst:40}]
};
const TOWER_PROFILES=Object.fromEntries(Object.entries(TOWER_TUNING).map(([type,variants])=>[type,variants.map((config,index)=>{
 const base=TOWERS[type];
 return {...config,max:index?Math.round(base.hp*1.36):base.hp,cap:config.cap??base.cap,radius:base.r+(config.rangeBonus||0)};
})]));
const deviceProfile=(type,level=1,branch=-1)=>TOWER_PROFILES[type][level===1?0:1+Math.max(0,branch)];
const SUPPRESSION_SPEED=.53;
const ITEMS={
 isolate:{name:'应急隔离器',cost:2,res:'intel',cd:19,dur:12,r:0,place:'直通交换节点',desc:'投放耐久 130 的隔离器，持续 12 秒。失效或遭冲毁时恢复通行。'},
 downgrade:{name:'协议降级',cost:2,res:'intel',cd:22,dur:11,r:2.15,place:'链路 · 区域',desc:'半径 2.15 格内的链路转为旧协议 11 秒，地面威胁减速，木马显形，路线重新计算。'},
 backup:{name:'备份还原',cost:60,res:'cpu',cd:16,r:0,place:'已部署设备',desc:'恢复目标塔 55% 的最大耐久并解除加密。'}
};
const ENEMIES={
 worm:{name:'蠕虫',hp:49,s:1.32,damage:15,cost:12,color:'#ff815e',desc:'被阻挡后攻击塔；首次通过直通交换节点时复制一个同伴。'},
 flood:{name:'洪泛团',hp:128,s:1.14,damage:34,cost:25,intel:1,mass:2,color:'#ff5365',desc:'占用两个阻挡位。主动冲击邻近隔离节点，打通后重新选择路径。'},
 trojan:{name:'木马',hp:64,s:1.5,damage:14,cost:17,color:'#ef79ec',stealth:true,desc:'伪装为普通数据，躲避单体攻击。检测、旧链路和阻挡使其显形；若隐蔽时遭范围攻击消灭，释放伤害设备的载荷。'},
 ransom:{name:'勒索者',hp:91,s:1.13,damage:18,cost:24,intel:1,color:'#ffaf5c',desc:'行进中远程攻击并加密塔，优先蜜罐。加密使攻击、治疗及主动技能暂停。'},
 flying:{name:'伪热点',hp:61,s:1.62,damage:0,cost:19,color:'#ffb4a3',air:true,desc:'从无线层飞往出口，绕过隔离和阻挡。只能由有对空能力的拦截器打击。'},
 shell:{name:'加壳器',hp:110,s:1.19,damage:13,cost:21,intel:1,color:'#f5e872',desc:'周期性为邻近同伴提供伤害吸收护盾。'},
 legion:{name:'万傀',hp:890,s:.64,damage:54,cost:110,intel:3,mass:3,color:'#ff4769',boss:true,desc:'洪峰会冲击被隔离的节点。进入第二阶段时分批释放蠕虫。'},
 mirage:{name:'蜃楼',hp:1020,s:.68,damage:37,cost:110,intel:3,mass:3,color:'#ac79ff',boss:true,desc:'预警后在前方制造临时路由黑洞。第二阶段发动风暴，剥离附近设备的护盾。'},
 shadow:{name:'蛰影',hp:1180,s:.72,damage:39,cost:120,intel:3,mass:3,color:'#ff446b',boss:true,stealth:true,desc:'先潜伏，失去部分生命后提权、强化护甲并释放木马。最后预警并锁死运维环链路。'}
};
const ROUTE_COLORS=['#55e8c2','#ffb760','#91baff'];
const key=(x,z)=>z*15+x;
const pos=id=>({x:id%15,z:Math.floor(id/15)});
function makeMap(meta){
 const cells=Array.from({length:165},(_,id)=>({...pos(id),id,type:'platform',edges:[]}));
 const connect=(from,to)=>{
  let [x,z]=from;const [tx,tz]=to, dx=Math.sign(tx-x),dz=Math.sign(tz-z);
  if(dx&&dz)throw Error('Expected orthogonal path');
  while(x!==tx||z!==tz){
   const a=cells[key(x,z)],b=cells[key(x+dx,z+dz)];
   if(!a.edges.includes(b.id)){a.edges.push(b.id); b.edges.push(a.id);}
   a.type=b.type='link';x+=dx;z+=dz;
  }
 };
 for(const path of meta.paths)for(let i=1;i<path.length;i++)connect(path[i-1],path[i]);
 const mark=(coord,type,attrs={})=>Object.assign(cells[key(...coord)],{type,...attrs});
 const entries=meta.entries.map(([x,z,name],i)=>mark([x,z],'entry',{name,letter:'ABC'[i],color:ROUTE_COLORS[i],entry:i}));
 const exits=meta.exits.map(([x,z,name],i)=>mark([x,z],'exit',{name,letter:['X','Y'][i],color:'#b5f7f4',exit:i}));
 const nodes=meta.nodes.map(([x,z,name],i)=>mark([x,z],'node',{name,code:'SW-0'+(i+1)}));
 for(const coord of meta.legacy)mark(coord,'legacy');
 for(const coord of meta.obstacles)mark(coord,'obstacle');
 if(meta.gap)for(const coord of meta.gap)mark(coord,'void');
 return {...meta,cells,entries,exits,nodes};
}
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>i+a);
const MAPS=[
 makeMap({name:'分段内网',type:'企业网络',code:'SEGMENTED LAN',sector:'LAN / DMZ-01',color:'#53dbc3',env:0,waves:14,boss:'legion',
 summary:'办公网与业务网之间的 DMZ 正受到探测。利用西边界把入口流量折向互联区，或放弃核心前的直通路径，把威胁引向外围灾备环。',
 paths:[[[2,0],[2,6],[7,6],[7,10]],[[2,2],[7,2],[7,6]],[[12,0],[12,3],[7,3]],[[2,4],[0,4],[0,9],[7,9]],[[12,3],[14,3],[14,9],[7,9]]],
 entries:[[2,0,'门户网站'],[12,0,'邮件网关']],exits:[[7,10,'核心数据库']],nodes:[[2,4,'西边界'],[7,8,'核心边界']],
 legacy:[[5,2],[0,6],[0,7],[1,9],[2,9],[13,9]],obstacles:[[0,1],[1,1],[4,0],[5,0],[9,0],[10,0],[14,1],[3,7],[4,7],[4,8],[10,6],[11,6],[11,7],[13,5],[1,10],[12,10],[10,10]],
 starters:[['gun',5,5,180],['firewall',7,7],['sandbox',9,4]],demo:'分段取舍'}),
 makeMap({name:'骨干流域',type:'跨网骨干',code:'BACKBONE BASIN',sector:'WAN / DCI-02',color:'#77a9ff',env:1,waves:15,boss:'mirage',
 summary:'公网流把双活数据中心分隔在不同通道。专线汇聚失守时，分支和云端流量会与互联网入口争夺同一座数据中心。',
 paths:[[[1,0],[1,3],[3,3],[3,8],[2,8],[2,10]],[[1,3],[6,3],[6,7],[2,7],[2,8]],[[9,0],[9,2],[11,2]],[[14,0],[14,2],[11,2],[11,8],[13,8],[13,10]],[[11,2],[6,2],[6,3]]],
 entries:[[1,0,'互联网'],[14,0,'云端互联'],[9,0,'分支专线']],exits:[[2,10,'数据中心 X'],[13,10,'数据中心 Y']],nodes:[[3,5,'隧道接入'],[11,4,'专线汇聚']],
 legacy:[[11,6],[11,7],[6,5],[6,6]],obstacles:[[0,1],[2,1],[4,1],[5,1],[9,1],[13,1],[0,9],[4,9],[5,9],[8,8],[9,8],[12,10],[14,10]],
 gap:[...range(0,14).filter(x=>![3,6,11].includes(x)).flatMap(x=>[[x,5],[x,6]])],
 starters:[['gun',4,4,270],['firewall',3,7],['sandbox',12,7]],demo:'旁路直通'}),
 makeMap({name:'气隙深层',type:'工控网络',code:'AIR GAP DEPTH',sector:'OT / ICS-03',color:'#ffae67',env:2,waves:16,boss:'shadow',
 summary:'过程控制与安全联锁是两套核心。运维环穿行于气隙两侧，任何一侧失守都可能把三处入侵流量挤入同一条狭窄通道。',
 paths:[[[1,0],[1,2],[3,2],[3,10]],[[7,0],[7,2],[3,2]],[[7,2],[11,2]],[[13,0],[13,2],[11,2],[11,10]],[[3,3],[0,3],[0,8],[3,8]],[[11,3],[14,3],[14,8],[11,8]],[[3,8],[11,8]]],
 entries:[[1,0,'运维跳板机'],[7,0,'办公网下行'],[13,0,'供应商远程维护']],exits:[[3,10,'过程控制核心'],[11,10,'安全联锁核心']],nodes:[[3,5,'西运维环'],[11,5,'东运维环']],
 legacy:[[0,4],[0,5],[0,6],[14,5],[14,6],[11,7],[5,8],[8,8]],obstacles:[[0,1],[4,0],[5,0],[9,0],[10,0],[14,1],[4,4],[10,4],[4,6],[10,6],[0,10],[6,9],[8,9],[14,10]],
 gap:range(5,9).flatMap(x=>range(3,7).map(z=>[x,z])),
 starters:[['gun',4,3,270],['firewall',3,7],['sandbox',10,7]],demo:'蛰影现身'})
];
const TERRAIN={
 platform:['设备平台','架高的基座。可以部署拦截器、沙箱或修复进程。'],
 link:['链路','地面数据流通行；防火墙和蜜罐可阻挡敌人，业务保持连通。'],
 legacy:['旧链路','地面敌人在此以约 57% 的速度移动。木马通过时显形。'],
 node:['交换节点','网闸、防火墙或应急隔离器可以切断该节点。恢复直通后有 7 秒冷却。'],
 obstacle:['数据设施','不可通行、不可部署。'],
 void:['网络隔离带','公网数据流或工业气隙。地面敌人不能在此穿越。'],
 entry:['入口','恶意流量由此接入。保持至少一条到任意中枢的通路。'],
 exit:['中枢出口','威胁进入该处时，降低共享的中枢完整度。']
};
const waveTypes=[
 ['worm'],['worm','flood'],['worm','trojan'],['worm','ransom'],['trojan','flying','worm'],['shell','worm','flood'],
 ['ransom','trojan','flood'],['flying','flying','shell','worm'],['flood','shell','ransom'],['trojan','worm','ransom','flying','flood'],
 ['shell','flood','flying'],['ransom','trojan','shell','flying'],['flood','worm','ransom','trojan'],['trojan','flying','shell','flood'],['ransom','flood','shell','flying']
];
const waveBriefs=[
 '链路探测','节点冲击','伪装载荷','加密渗透','无线接入','护盾集群',
 '设备压制','无线集群','护盾攻坚','混合渗透','双层冲锋','持续加密','节点围攻','无线掩护','核心围攻'
];
function waveBrief(map,n){
 if(n===map.waves)return {name:ENEMIES[map.boss].name+' · 首领攻势',alert:true};
 if(map.env>0&&n===9)return {name:'多入口洪峰',alert:true};
 return {name:waveBriefs[n-1],alert:false};
}
const surgeLanes=[
 ['flood','worm','shell','worm','ransom','worm','flood','worm','trojan','shell','flood'],
 ['worm','flood','worm','shell','worm','ransom','trojan','flood','worm','flood','shell'],
 ['shell','flood','worm','worm','trojan','ransom','worm','flood','shell','worm','flood']
];
function wavePlan(map,n){
 const rush=map.env>0&&n===9,final=n===map.waves;
 const mix=waveTypes[Math.min(n-1,waveTypes.length-1)],list=[];
 map.entries.forEach((entry,i)=>{
  if(rush){
   surgeLanes[(i+map.env-1)%surgeLanes.length].forEach((type,j)=>{
    const time=.35+i*.13+j*.63+(j>=6?3.05:0);
    list.push({time,entry:i,type});
   });
   return;
  }
  const count=Math.max(2,3+Math.floor(n*.34)+(i===n%map.entries.length?1:0)-(n===1&&i>0?1:0));
  for(let j=0;j<count;j++){
   const phase=j+i+n-1;
   const type=final&&map.env===0&&i===0&&j===2?'shell':mix[phase%mix.length];
   list.push({time:.35+i*.87+j*Math.max(.57,1.43-n*.047),entry:i,type});
  }
 });
 if(final)list.push({time:3.1,entry:map.env===1?2:0,type:map.boss});
 return list.sort((a,b)=>a.time-b.time);
}
