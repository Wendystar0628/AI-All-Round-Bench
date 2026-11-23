'use strict';
const Inspector={
 chip(text,style=''){return '<span class="state-chip '+style+'">'+text+'</span>';},
 stats(rows){return '<div class="stat-grid">'+rows.map(([name,value])=>'<div>'+name+'<b>'+value+'</b></div>').join('')+'</div>';},
 health(hp,max,shield,enemy=false){return '<div class="hp-track"><i style="width:'+Math.max(0,Math.min(100,hp/max*100))+'%;'+(enemy?'background:#e6aa8c':'')+'"></i></div><p class="device-health">'+(enemy?'生命':'耐久')+' '+Math.max(0,Math.ceil(hp))+' / '+Math.ceil(max)+(shield>0?' · 护盾 '+Math.ceil(shield):'')+'</p>';},
 render(o){
  const s=Game.state,same=s.selected===o,scroll=same?(document.querySelector('.inspector-body')?.scrollTop||0):0;s.selected=o;let html='',actions='',heading='链路巡检',tag='OVERVIEW';
  if(!o){View.showRange(null,0);html='<div class="inspect-icon">'+icon('shield')+'</div><h3>防线待命</h3><p>选择单位查看实时状态，或将设备卡片拖入战场。</p>'+this.stats([['直通节点',s.network.nodes.filter(c=>!s.network.blocked.has(c.k)).length+' / '+s.network.nodes.length],['在线设备',s.towers.length],['已回收威胁',s.kills],['路由收敛',s.reroutes+' 次']])+'<div class="tactical-note"><small>本域观察</small><p>'+Data.tactics[s.map.id].hint+'</p><button onclick="UI.tactics()">查看布防参考 ↗</button></div>';}
  else if(o.maxHp&&Data.towers[o.type]){
   const d=Data.towers[o.type],is=o.isolator,branch=d.branches?.find(b=>b.id===o.branch),blocked=s.enemies.filter(e=>e.blocked===o&&e.hp>0),used=blocked.reduce((n,e)=>n+e.capacity,0);tag=is?'TEMPORARY':'DEVICE / L'+o.level;
   html='<div class="inspect-icon">'+icon(d.icon)+'</div><h3>'+(is?'应急隔离器':d.name)+'</h3><p>'+d.role+(branch?' · '+branch.name:'')+'</p>'+this.health(o.hp,o.maxHp,o.shield);
   let chips='';if(o.encrypted>0)chips+=this.chip('加密 '+o.encrypted.toFixed(1)+'s','encrypted');if(o.shield>0)chips+=this.chip('护盾 '+Math.ceil(o.shield)+' · '+o.shieldTime.toFixed(1)+'s','shield');if(o.buff>0)chips+=this.chip('过载 '+o.buff.toFixed(1)+'s');if(is)chips+=this.chip('剩余 '+o.life.toFixed(1)+'s','amber');if(chips)html+='<div class="state-chips">'+chips+'</div>';
   const effectiveRate=o.rate*(o.buff>0?(o.type==='firewall'?.5:.4):1),rows=[];let desc='';
   if(o.type==='firewall'){rows.push(['阻挡容量',used+' / '+o.capacity],['反击伤害',o.damage.toFixed(0)],['攻击间隔',effectiveRate.toFixed(2)+'s'],['设备等级','L'+o.level]);desc='在链路上阻挡最多 '+o.capacity+' 点容量，超过容量的威胁继续推进。部署到节点时隔离道路，并拦截相邻链路。';}
   if(o.type==='honeypot'){rows.push(['诱引范围',o.range.toFixed(2)+' 格'],['正被诱引',blocked.length+' 个'],['反击伤害',o.damage.toFixed(0)],['加密响应','完全免疫']);desc='吸引范围内会攻击设备的地面威胁，替关键设备承受攻击。'+(branch?branch.desc:'可升级深度诱捕或镜像反制。');}
   if(o.type==='gate'){rows.push(['通行状态','节点隔离'],['伤害减免',o.level===2?'25%':'0%'],['武器系统','无'],['情报收益',is?'无':'0.6 / 秒']);desc=is?'临时隔离 18 秒，耐久归零或期限结束后自动旁路直通。不产生情报。':'不攻击，专职控制道路。受到攻击仍会损失耐久；被摧毁后恢复直通。';}
   if(o.type==='interceptor'){rows.push(['有效射程',o.range.toFixed(1)+' 格'],['攻击伤害',o.damage.toFixed(1)],['攻击间隔',effectiveRate.toFixed(2)+'s'],['扇区朝向',['北','东','南','西'][(Math.round(o.dir/(Math.PI/2))+4)%4]+' / 120°']);desc='攻击朝向前方扇区内的地面与飞行威胁，无法主动选中未显形目标。'+(branch?branch.desc:'两个升级分支分别提供贯穿攻击或压制减速。');}
   if(o.type==='sandbox'){rows.push(['检测与射程',o.range.toFixed(1)+' 格'],['爆破半径',(o.level===2?1.8:1.3)+' 格'],['爆破伤害',o.damage.toFixed(0)],['投射间隔',o.rate.toFixed(2)+'s']);desc='持续检测木马与潜伏目标。弹体落地时对范围内地面威胁结算伤害，不攻击飞行目标。';}
   if(o.type==='repair'){rows.push(['治疗范围',o.range.toFixed(2)+' 格'],['治疗效率',((o.level===2?42.9:26)/.55).toFixed(1)+' / 秒'],['输出类型','专职治疗'],['设备等级','L'+o.level]);desc='持续修复范围内其他受损设备，不攻击敌人。优先修复生命比例最低的目标；加密期间停止治疗。';}
   html+=this.stats(rows)+'<p>'+desc+'</p>';
   if(!is){let skillDesc=d.skillDesc;if(o.type==='honeypot'&&o.branch==='lure')skillDesc='困住被诱引来的地面威胁 7 秒。';html+='<div class="skill-description"><small>主动协议 / '+d.skill+'</small><p>'+skillDesc+'</p></div>';actions='<div class="action-row">'+(o.level===1?'<button title="'+d.upgrade+'" onclick="Game.upgrade(Game.state.selected)">↑ 升级 L2<br>⌁ '+Math.round(d.cost*.75)+' / ◈ '+(d.branches?25:12)+'</button>':'<button disabled>L2 '+(branch?branch.name:'已完成')+'</button>')+'<button class="danger" onclick="UI.sell()">撤下 · 回收 '+Math.floor(o.cost*.55)+(o.cell.type==='node'?'<br>先预览旁路路由':'')+'</button></div><div class="action-row"><button title="'+skillDesc+'" onclick="Game.skill(Game.state.selected)" '+(o.skillCd>0||o.encrypted>0?'disabled':'')+'>'+d.skill+(o.encrypted>0?' / 加密停机':o.skillCd>0?' / '+o.skillCd.toFixed(1)+'s':' · 就绪')+'</button>'+(o.type==='interceptor'?'<button onclick="UI.rotateTower()">朝向 ↻ 90°</button>':'')+'</div>';}
   else actions='<div class="action-row"><button onclick="UI.sell()">预览并解除隔离</button></div>';
   View.showRange(o.cell,o.range,o.type,o.dir);
  }else if(Data.enemies[o.type]){
   heading='威胁分析';const d=Data.enemies[o.type];tag=o.type.startsWith('boss')?'CRITICAL / BOSS':'THREAT';html='<h3 style="color:#e6b197">'+d.name+'</h3>'+this.health(o.hp,o.maxHp,o.shield,true);let chips='';if(o.rooted>0)chips+=this.chip('禁锢 '+o.rooted.toFixed(1)+'s','amber');if(o.slow>0)chips+=this.chip('压制减速 '+o.slow.toFixed(1)+'s','shield');if(o.shield>0)chips+=this.chip('加壳护盾 '+Math.ceil(o.shield),'shield');if(!Game.visible(o))chips+=this.chip(o.type==='boss2'?'潜伏 / 需检测':'数据包伪装','encrypted');else if(o.detected>0||o.scanTime>0)chips+=this.chip('检测显形');if(o.type==='boss2')chips+=this.chip(['潜伏阶段','提权阶段','破坏阶段'][o.phase],o.phase===2?'amber':'');if(chips)html+='<div class="state-chips">'+chips+'</div>';
   if(o.casting>0)html+='<div class="state-chips">'+this.chip('路由重写 '+o.casting.toFixed(1)+'s','amber')+'</div>';
   const weight=o.edgeEnds?s.network.edgeCost(...o.edgeEnds):s.network.weight(o.cell),speed=o.blocked||o.rooted>0||o.casting>0?0:o.speed*(o.slow>0?.5:1)/(o.flying?1:weight),route=o.flying?o.flightTarget?.id:s.network.pathFrom(o)?.route.at(-1).id;
   html+=this.stats([['当前速度',speed.toFixed(2)+' 格/秒'],['阻挡占用',o.capacity],['通行层级',o.flying?'无线层':'链路层'],['收敛终点',route||'—']])+'<p>'+d.desc+'</p>';if(o.blocked&&s.towers.includes(o.blocked))html+='<div class="tactical-note"><small>正在交战</small><p>攻击 '+(o.blocked.isolator?'应急隔离器':Data.towers[o.blocked.type].name)+' / '+(o.blocked.cell.name||o.blocked.cell.k)+'</p></div>';View.showRange(o,0);
  }else{
   const c=o,n=s.network,slow=c.legacy||n.slow.has(c.k),cd=n.cooldowns.get(c.k)||0;tag='TERRAIN / '+c.k;const names={road:slow?'旧协议链路':'业务链路',pad:'高位设备平台',node:c.name,entry:c.name,exit:c.name,obstacle:c.name||'数据设施障碍'};
   html='<h3>'+names[c.type]+'</h3><p>'+({road:slow?'按 58% 通行速度运行，木马经过时显形。路由计算已计入额外耗时。':'普通数据链路；可部署防火墙和蜜罐，阻挡不会截断道路。',pad:'平台高于链路，敌人不可通行。拦截器、沙箱与修复进程可在此部署。',node:'交换节点可部署防火墙、网闸或隔离器。隔离截断该格，设备离线后恢复旁路。',entry:'入口接入端口，不可部署，必须持续保持到至少一座核心的通路。',exit:'关键数据中枢。威胁通过时损失完整度；此位置不可部署。',obstacle:c.description||'数据设施占据此区域，既不可通行，也不可部署。'}[c.type])+'</p>'+this.stats([['逻辑坐标',c.x+' : '+c.z],['部署权限',c.type==='pad'?'远程 / 支援':c.type==='road'?'阻挡 / 诱敌':c.type==='node'?'隔离设备':'禁止']]);
   if(c.type==='node')html+='<div class="state-chips">'+this.chip(n.blocked.has(c.k)?'已隔离':cd>0?'重连 '+cd.toFixed(1)+'s':'旁路直通',n.blocked.has(c.k)?'amber':'')+'</div>';
   if(n.slow.has(c.k)){const life=Math.max(0,...s.zones.filter(z=>Math.hypot(z.x-c.x,z.z-c.z)<=z.range).map(z=>z.life));html+='<p>协议降级剩余 '+life.toFixed(1)+' 秒。</p>';}
   View.showRange(c,0);
  }
  $('inspectHeading').textContent=heading;$('inspectTag').textContent=tag;$('inspect').innerHTML='<div class="inspector-body">'+html+'</div>'+(actions?'<div class="inspector-actions">'+actions+'</div>':'');if(same)document.querySelector('.inspector-body').scrollTop=scroll;
 }
};
