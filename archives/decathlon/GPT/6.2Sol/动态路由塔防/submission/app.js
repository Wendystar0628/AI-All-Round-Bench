"use strict";
const $=id=>document.getElementById(id);
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
const viewport=$('viewport'),world=new World($('world'),$('labels')),pointer=$('virtualPointer');
const warningBanner=document.createElement('div');
warningBanner.id='threatBanner';warningBanner.hidden=true;
warningBanner.innerHTML=icon('radar')+'<div><small></small><strong></strong></div>';viewport.append(warningBanner);
const pointerRipple=document.createElement('div');
pointerRipple.id='pointerRipple';pointerRipple.hidden=true;document.body.append(pointerRipple);
document.body.append(pointer);
const demoHud=document.createElement('div');demoHud.className='demo-hud';demoHud.hidden=true;demoHud.innerHTML='<button class="secondary" id="exitDemo">退出演示 <kbd>Esc</kbd></button>';viewport.append(demoHud);
let battle,ui,mapIndex=0,modal='',demo=null,exporting=false,exportFps=30,lastFrame=-1,reportShown=false,settlementAt=null,demoReturn=null,dialogReturnFocus=null;
let toastUntil=0,realTime=0,simCarry=0,previousFrame=0,uiSignature='',selectedSignature='',forecastSignature='',logSignature=-1,inspectorPress=false;
const stepSize=1/60;
let audio=null,master=null,ambientFilter=null,ambientGain=null,noiseBuffer=null,muted=false,volume=.4,lastNote=0,songBeat=0;
const soundStamps=new Map();
let burstStart=-1,burstCount=0;
const soundTones={
 gun:[680,118,.10,.049,'triangle'],shellLaunch:[280,520,.13,.038,'sine'],sandbox:[182,49,.29,.065,'triangle'],
 ransom:[302,87,.22,.045,'square'],slam:[136,31,.24,.092,'triangle'],melee:[172,63,.14,.044,'triangle'],
 heal:[416,617,.18,.037,'sine'],shield:[190,387,.24,.049,'triangle'],shieldBreak:[940,158,.19,.049,'triangle'],
 identify:[888,690,.19,.036,'sine'],detect:[783,1190,.17,.038,'sine'],
 breach:[220,43,.66,.13,'sawtooth'],boss:[89,30,.75,.10,'triangle'],destroy:[151,32,.46,.085,'triangle'],
 reject:[198,112,.12,.045,'triangle'],isolate:[730,225,.32,.076,'triangle'],downgrade:[530,192,.38,.076,'sine'],
 backup:[329,697,.43,.073,'sine'],trap:[830,290,.27,.055,'triangle'],click:[436,225,.09,.04,'sine'],
 victory:[261,392,.53,.085,'sine'],defeat:[228,38,.80,.108,'triangle'],deploy:[350,640,.21,.09,'triangle'],route:[670,1020,.35,.07,'sine'],skill:[277,511,.46,.085,'sine'],wave:[307,575,.41,.09,'triangle']
};
const soundLayers={
 gun:[.078,.050,1890,'highpass'],sandbox:[.22,.083,610,'lowpass'],ransom:[.15,.048,1120,'bandpass'],
 slam:[.28,.11,270,'lowpass'],melee:[.12,.037,430,'bandpass'],shieldBreak:[.16,.064,1610,'highpass'],
 boss:[.49,.11,190,'lowpass'],destroy:[.41,.086,380,'lowpass'],breach:[.44,.078,380,'lowpass'],
 isolate:[.19,.040,630,'bandpass'],trap:[.15,.044,750,'highpass']
};
const crowdedSounds=new Set(['gun','shellLaunch','sandbox','ransom','slam','melee','heal','shield','shieldBreak','identify','detect']);
const tracks=[
 {root:55,beat:.61,air:970,level:.031,wave:'sine',line:[0,7,12,3,7,15,10,7,0,7,15,3,7,12,10,5],chord:[0,3,7],drum:[0,4]},
 {root:48.99,beat:.52,air:1480,level:.043,wave:'triangle',line:[0,12,5,19,7,12,2,7,0,14,5,17,7,12,5,7],chord:[0,5,12],drum:[0,3,6]},
 {root:41.20,beat:.73,air:368,level:.049,wave:'sine',line:[0,3,12,7,0,15,10,5,0,3,14,5,0,12,10,3],chord:[0,3,10],drum:[0,5,7]}
];
function activateAudio(){
 if(exporting)return;
 if(!audio){
  const Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)return;
  audio=new Ctx();master=audio.createGain();master.gain.value=muted?0:volume;
  const limiter=audio.createDynamicsCompressor();
  limiter.threshold.value=-15;limiter.knee.value=12;limiter.ratio.value=3.5;limiter.attack.value=.012;
  master.connect(limiter).connect(audio.destination);lastNote=audio.currentTime+.05;
  startAmbient();
 }
 if(audio.state==='suspended')audio.resume().catch(()=>{});
}
function startAmbient(){
 const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate),air=buffer.getChannelData(0);
 noiseBuffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*.55),audio.sampleRate);
 const transient=noiseBuffer.getChannelData(0);
 let seed=8317,smoothed=0;
 for(let i=0;i<air.length;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const value=seed/2147483648-1;
  smoothed=smoothed*.83+value*.17;air[i]=smoothed;
  if(i<transient.length)transient[i]=value;
 }
 const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;
 ambientFilter=audio.createBiquadFilter();ambientFilter.type='bandpass';ambientFilter.Q.value=.65;
 ambientGain=audio.createGain();ambientGain.gain.value=0;
 source.connect(ambientFilter).connect(ambientGain).connect(master);source.start();
}
function connectSound(gain,pan){
 if(!pan||!audio.createStereoPanner){gain.connect(master);return null;}
 const stereo=audio.createStereoPanner();stereo.pan.value=pan;
 gain.connect(stereo).connect(master);return stereo;
}
function tone(freq,end,dur,amp,form='sine',delay=0,pan=0){
 if(!audio||muted||exporting||!volume)return;
 const t=audio.currentTime+delay,o=audio.createOscillator(),g=audio.createGain();
 o.type=form;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+dur);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(amp,t+.016);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
 o.connect(g);const stereo=connectSound(g,pan);
 o.onended=()=>{o.disconnect();g.disconnect();stereo?.disconnect();};
 o.start(t);o.stop(t+dur+.022);
}
function noise(dur,amp,frequency,filterType,pan){
 if(!noiseBuffer||!volume)return;
 const when=audio.currentTime,source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
 source.buffer=noiseBuffer;filter.type=filterType;filter.frequency.value=frequency;filter.Q.value=.54;
 gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(amp,when+.008);
 gain.gain.exponentialRampToValueAtTime(.0001,when+dur);
 source.connect(filter).connect(gain);const stereo=connectSound(gain,pan);
 source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();stereo?.disconnect();};
 source.start(when,0,dur);
}
function soundPan(source){
 if(!source||!Number.isFinite(source.x)||!Number.isFinite(source.z))return 0;
 return clamp(world.horizontalPosition(source.x,source.z)*.78,-.82,.82);
}
function sound(event,source=null){
 if(!audio||muted||exporting||!volume)return;
 const pan=soundPan(source),now=audio.currentTime;
 if(crowdedSounds.has(event)){
  const channel=event+'|'+Math.round(pan*2);
  if(now-(soundStamps.get(channel)??-1)<.085)return;
  if(now-burstStart>.090){burstStart=now;burstCount=0;}
  if(burstCount>=7)return;
  soundStamps.set(channel,now);burstCount++;
 }
 const voice=soundTones[event];
 if(voice)tone(...voice,0,pan);
 if(soundLayers[event])noise(...soundLayers[event],pan);
 if(['skill','deploy','wave','route'].includes(event))tone(715,810,.23,.065,'sine',.115,pan);
 if(event==='boss')tone(52,43,.9,.15,'sine',.1,pan);
 if(event==='isolate')tone(130,80,.23,.08,'triangle',.14,pan);
 if(event==='downgrade')tone(398,91,.27,.044,'triangle',.17,pan);
 if(event==='backup')tone(659,889,.24,.058,'sine',.14,pan);
 if(event==='trap')tone(205,143,.19,.055,'triangle',.08,pan);
 if(event==='victory'){tone(392,523,.41,.065,'sine',.17);tone(523,659,.38,.053,'sine',.33);}
 if(event==='defeat')tone(109,33,.67,.077,'sine',.16);
}
function music(){
 if(!audio||muted||exporting||audio.state!=='running')return;
 const track=tracks[mapIndex],t=audio.currentTime,paused=battle.paused||modal;
 if(ambientFilter){
  ambientFilter.frequency.setTargetAtTime(track.air+110*Math.sin(t*.67),t,.19);
  ambientGain.gain.setTargetAtTime(paused?.004:track.level,t,.20);
 }
 if(paused||t<lastNote)return;
 const beat=songBeat++,step=beat%track.line.length,space=track.beat*(battle.active?.89:1);
 lastNote=t+space;
 if(beat%4===0){
  const bass=track.root*(beat%16>=8?1.189:1);
  tone(bass,bass*.994,space*3.2,.090,'sine');
 }
 if(beat%8===0)for(const interval of track.chord){
  const layer=track.root*2*2**(interval/12);tone(layer,layer*.997,space*5.35,.020,'sine',.055,(interval-4)*.036);
 }
 const note=track.root*4*2**(track.line[step]/12);
 tone(note,note*.994,space*.76,.028,track.wave,.02,step%2?.14:-.14);
 if(battle.active&&track.drum.includes(step%8))tone(106,38,.16,.042,'sine');
}
function setMute(value){
 muted=value;const control=$('mute'),label=muted?'取消静音':'静音';
 control.innerHTML=icon(muted?'mute':'volume');control.title=label;control.setAttribute('aria-label',label);control.setAttribute('aria-pressed',String(muted));
 if(master)master.gain.value=muted?0:volume;
}
function resetGame(i){
 mapIndex=i;battle=new Battle(MAPS[i]);battle.onSound=sound;ui={placement:null,selected:null,hover:null,pending:null,validation:null,dir:0,forecastNext:false};
 simCarry=0;reportShown=false;settlementAt=null;songBeat=0;$('toast').textContent='';$('subtitle').textContent='';
 mountBattle();
}
function mountBattle(){
 world.bind(battle.map);world.routeSig='';world.guideSig='';world.warnEl=null;
 inspectorPress=false;selectedSignature='';uiSignature='';forecastSignature='';logSignature=-1;
 $('missionId').textContent='0'+(mapIndex+1);$('missionType').textContent=battle.map.type+' / SECTOR 0'+(mapIndex+1);
 $('missionName').textContent=battle.map.name;$('viewSector').textContent=battle.map.sector;
 $('geometry').textContent='15 × 11 · '+battle.map.nodes.length+' SW';
 renderDeck();refresh(true);
}
function toast(msg,error=false){
 $('toast').textContent=msg;$('toast').className=error?'error':'';toastUntil=demo?battle.time+2.25:realTime+2.6;
 if(error)sound('reject');
}
function info(label,value){return '<div class="info-line"><span>'+label+'</span><b>'+value+'</b></div>';}
function inspectHead(title,subtitle,symbol,color){return '<div class="inspect-id"><div class="inspect-art" style="--ink:'+color+'">'+icon(symbol)+'</div><div><b>'+title+'</b><small>'+subtitle+'</small></div></div>';}
const inspectActions=html=>'<div class="inspect-actions">'+html+'</div>';
const button=(action,text,main=false)=>'<button class="'+(main?'primary':'secondary')+'" data-action="'+action+'">'+text+'</button>';
function confirmLayout(html,label){
 return '<div class="confirm-layout"><div class="confirm-details">'+html+'</div><div class="confirm-bar">'+
  button('confirm',label+' <kbd>Enter</kbd>',true)+button('cancel','取消')+'</div></div>';
}
function previewHTML(v){
 if(!v?.p)return '';
 const {p}=v;
 if(!p.ok){
  const risk=p.bad.map(id=>{const c=battle.map.cells[id];return c.letter||('X'+c.x+'/Z'+c.z);}).join('、');
  return info('封死位置','<span class="risk-text">'+risk+'</span>');
 }
 const impact=[p.changed.length?p.changed.join('、')+' 将改道':'',p.weighted.length?p.weighted.join('、')+' 通行代价变化':''].filter(Boolean);
 return info('预览路线',impact.join(' · ')||'入口路由保持')+
  battle.map.entries.map(a=>{
   const dest=battle.map.cells[p.table.exit[a.id]], delta=p.table.d[a.id]-battle.route.d[a.id];
   const change=delta?' <span class="route-delta">'+(delta>0?'+':'−')+Math.abs(delta).toFixed(1)+'</span>':'';
   let result=info(a.letter+' '+a.name,'→ '+dest.name+change);
   if(p.changed.includes(a.letter)){
    const from=battle.laneReport(a.entry),to=battle.laneReport(a.entry,p.table);
    result+='<div class="coverage-delta">火力覆盖格 '+from.covered.size+'/'+from.routeCells.length+' → '+to.covered.size+'/'+to.routeCells.length+'</div>';
   }
   return result;
  }).join('')+'<div class="preview-caption">出口旁数值表示加权通行代价的变化</div>';
}
function deviceFacts(type,stats){
 const range=Number(stats.radius.toFixed(2))+' 格',facts=[];
 if(['gun','sandbox','repair','honey'].includes(type))facts.push([type==='honey'?'诱引距离':'作用距离',range]);
 if(stats.cap)facts.push(['阻挡容量',stats.cap+' 位']);
 if(stats.damage)facts.push([type==='firewall'?'反击伤害':'单次伤害',String(stats.damage)]);
 if(stats.interval)facts.push([type==='repair'?'修复间隔':'攻击间隔',stats.interval+' 秒']);
 if(stats.blast)facts.push(['爆破半径',stats.blast+' 格']);
 if(stats.flight)facts.push(['飞行时间',stats.flight+' 秒']);
 if(stats.trap)facts.push(['诱捕时长',stats.trap+' 秒']);
 if(stats.trapDamage)facts.push(['破盾后追加伤害',String(stats.trapDamage)]);
 if(stats.pierce)facts.push(['贯穿附伤',String(stats.pierce)]);
 if(stats.slow)facts.push(['压制减速',Math.round((1-SUPPRESSION_SPEED)*100)+'% / '+stats.slow+' 秒']);
 if(stats.repair)facts.push(['每次修复',stats.repair+' 耐久 × '+stats.targets+' 座']);
 if(stats.skillCd)facts.push(['技能冷却',stats.skillCd+' 秒']);
 if(stats.shield)facts.push([type==='gate'?'升级护盾':'技能护盾',String(stats.shield)]);
 if(stats.burst)facts.push(['技能修复',stats.burst+' 耐久']);
 return facts;
}
function upgradeComparison(t){
 const type=t.type,d=TOWERS[type],base=deviceProfile(type),before=new Map([['耐久上限',String(base.max)],...deviceFacts(type,base)]);
 const variants=d.branches||[[d.upgrade.split(' · ')[0],d.upgrade.split(' · ')[1]]];
 return variants.map(([title,description],branch)=>{
  const after=deviceProfile(type,2,d.branches?branch:-1);
  const changes=[['耐久上限',String(after.max)],...deviceFacts(type,after)]
   .filter(([label,value])=>before.get(label)!==value)
   .map(([label,value])=>info(label,before.has(label)?before.get(label)+' → '+value:'新增 '+value)).join('');
  const fees=battle.upgradeCost(t)+' 算力'+(d.branches?' / 2 情报':'');
  return '<section class="upgrade-variant"><b>'+title+'</b><p>'+description+'</p><div>'+changes+'</div>'+
   '<button type="button" class="primary" data-dialog="device-upgrade-'+branch+'">安装 · '+fees+'</button></section>';
 }).join('');
}
function inspectorHTML(){
 const s=ui.selected,t=battle.towers.get(s?.cell),e=battle.enemies.find(e=>e.uid===s?.enemy),c=battle.map.cells[s?.cell];
 if(ui.placement){
  const [mode,type]=ui.placement.split(':'),v=ui.validation;
  const target=battle.map.cells[ui.pending?.id??ui.hover];
  if(mode==='remove'){
   const tower=battle.towers.get(target?.id);
   if(!tower||!v?.ok)return inspectHead('设备已离线','撤下操作终止','backup','#ff9d86')+inspectActions(button('cancel','关闭预览'));
   return confirmLayout(inspectHead('预览旁路直通',target.name,'gate','#afd9ff')+
    '<p class="inspect-copy">撤下后恢复节点通行，同一节点 7 秒内无法再次隔离。</p>'+
    info('撤下回收',battle.refund(tower)+' 算力')+info('确认后算力',String(battle.cpu+battle.refund(tower)))+previewHTML(v),'确认撤下');
  }
  const d=(mode==='tower'?TOWERS:ITEMS)[type];
  let html=inspectHead(d.name,mode==='tower'?d.role:d.place,d.icon||type,d.color||'#b9a4ff');
  html+='<p class="inspect-copy">'+d.desc+'</p>';
  if(target)html+=info('投放位置',target.name||('X'+target.x+' / Z'+target.z));
  html+=previewHTML(v);
  if(target&&v?.cost){
   const {cpu,intel}=v.cost;
   const cost=[cpu?cpu+' 算力':'',intel?intel+' 情报':''].filter(Boolean).join(' / ');
   html+=info('本次消耗',cost);
   if(ui.pending&&v.ok){
    const remaining=[cpu?(battle.cpu-cpu)+' 算力':'',intel?(battle.intel-intel)+' 情报':''].filter(Boolean).join(' / ');
    html+=info('确认后剩余',remaining);
   }
  }
  if(mode==='item'&&type==='backup'&&target&&v?.ok){
   const tower=battle.towers.get(target.id);
   html+=info('预计恢复','+'+Math.ceil(Math.min(tower.max-tower.hp,tower.max*.55))+' 耐久');
   if(tower.enc>battle.time)html+=info('加密状态','还原时解除');
  }
  if(v&&!v.ok)html+='<p class="inspect-copy risk-text" style="margin-top:8px">'+v.why+'</p>';
  if(type==='gun'&&ui.pending){
   html+=info('拦截器朝向',Math.round(ui.pending.dir)+'°');
   html+=inspectActions('<div class="tabs" style="margin:0">'+button('turn-left','↶ 左转')+button('turn-right','右转 ↷')+'</div>');
  }
  if(ui.pending)return confirmLayout(html,mode==='tower'?'确认部署':'确认投放');
  return html+'<div class="help-note">'+icon('info')+(mode==='tower'?'拖放卡片或点击格点。':'选取地图中的投放位置。')+'</div>';
 }
 if(t){
  const d=TOWERS[t.type],cd=Math.max(0,Math.ceil(t.skillAt-battle.time)),enc=Math.max(0,Math.ceil(t.enc-battle.time));
  let html=inspectHead(d.name,'等级 '+t.lv+' / 2 · '+(t.lv===2?(d.branches?d.branches[t.branch][0]:d.upgrade.split(' · ')[0]):d.role),d.icon,d.color);
  const stats=deviceProfile(t.type,t.lv,t.branch);
  if(t.lv===1)html+='<div class="stats-switch">'+button('upgrade-preview','查看 2 级对比')+'</div>';
  html+='<p class="inspect-copy">'+(t.lv===2?(d.branches?d.branches[t.branch][1]:d.upgrade):d.desc)+'</p>';
  html+='<div class="hp"><i style="width:'+Math.max(0,100*t.hp/t.max)+'%"></i></div>'+info('设备耐久',Math.ceil(t.hp)+' / '+t.max);
  if(t.shield)html+=info('护盾',Math.ceil(t.shield));
  if(enc)html+=info('加密','<span style="color:#d5a6ff">'+enc+'s · 主动功能离线</span>');
  if(battle.map.cells[t.id].type==='node'){
   html+=info('链路','已隔离');
   if(t.hold)html+=info('驻守情报',Number(t.hold.toFixed(1))+' / 6 秒');
  }
  if(t.type==='gun')html+=info('覆盖朝向',Math.round(t.dir)+'°');
  if(stats.cap){
   const used=battle.enemies.filter(e=>!e.dead&&e.block===t.id).reduce((n,e)=>n+(e.spec.mass||1),0);
   html+=info('阻挡负载',used+' / '+stats.cap);
  }
  html+=deviceFacts(t.type,stats).filter(([label])=>label!=='阻挡容量'&&label!=='升级护盾').map(([label,value])=>info(label,value)).join('');
  const cost=battle.upgradeCost(t);
  let actions='';
  if(t.lv===1)actions+=d.branches?d.branches.map((a,i)=>button('branch-'+i,a[0]+' · '+cost+' 算力 / 2 情报')).join(''):button('upgrade','升级 · '+cost+' 算力');
  if(d.skill){
   const targets=battle.skillTargets(t),decrypt=t.type==='repair'?targets.filter(u=>u.enc>battle.time).length:0;
   html+=info(t.type==='repair'?'支援对象':'可诱捕威胁',targets.length+(t.type==='repair'?' 座':' 个')+(decrypt?' · '+decrypt+' 座待解密':''));
   const suffix=enc?' · 加密':cd?' · '+cd+'s':targets.length?'':' · 无目标';
   actions+=button('skill',d.skill+suffix,!cd&&!enc&&targets.length>0);
  }
  actions+='<button class="secondary muted-action" data-action="sell">撤下设备 · +'+battle.refund(t)+' 算力</button>';
  return '<div class="confirm-layout"><div class="confirm-details">'+html+'</div><div class="tower-actions">'+actions+'</div></div>';
 }
 if(e){
  let html=inspectHead(e.seen?e.spec.name:e.type==='shadow'?'蛰影 · 潜伏':'未识别流量',e.spec.air?'无线层':'地面网络', 'bug',e.spec.color)+
   '<p class="inspect-copy">'+e.spec.desc+'</p>'+info('耐久',Math.ceil(e.hp)+' / '+Math.ceil(e.max));
  html+=info('状态',[e.seen?'已识别':'伪装',e.shield?'护盾 '+Math.ceil(e.shield):'',e.block!=null?'受阻挡':'',e.root>battle.time?'受诱捕':'',e.slowed>battle.time?'受压制':''].filter(Boolean).join(' · '));
  if(e.revealBy)html+=info('显形来源',({protocol:'旧协议',block:'设备阻挡',sandbox:'沙箱扫描',escalation:'提权签名'})[e.revealBy]);
  const end=e.spec.air?e.dest:battle.route.exit[battle.groundChoice(e,battle.route)];
  const pursuit=e.seek?.target;
  if(pursuit?.hp>0)html+=info('冲击目标',battle.map.cells[pursuit.id].name);
  else if(e.lure!==null&&battle.towers.has(e.lure))html+=info('临时目标','蜜罐');
  return html+info('最终出口',battle.map.cells[end]?.name||'正在重新收敛');
 }
 if(s?.lane!==undefined){
  const route=battle.laneReport(s.lane),inlet=route.inlet;
  const percent=route.routeCells.length?Math.round(route.covered.size/route.routeCells.length*100):0;
  return inspectHead(inlet.name,'入口 '+inlet.letter+' · 业务路由','radar',inlet.color)+
   info('当前出口',route.exit.name)+info('链路步数',route.length+' 段')+
   info('加权通行代价',Number(route.weight.toFixed(2)))+
   info('地面火力覆盖',route.covered.size+' / '+route.routeCells.length+' 格')+
   '<div class="hp lane-meter"><i style="width:'+percent+'%"></i></div>'+
   '<p class="inspect-copy">覆盖按未加密的拦截器扇区和沙箱射程计算。地图上同时标出了火力盲区。</p>';
 }
 if(c){
  const terrain=TERRAIN[c.type],isolator=battle.isolators.get(c.id);
  let html=inspectHead(c.name||terrain[0],c.code||('X'+c.x+' / Z'+c.z),c.type==='node'?'gate':'layers',c.color||'#b7a5ff')+'<p class="inspect-copy">'+terrain[1]+'</p>';
  if(c.type==='node'){
   html+=info('旁路状态',battle.closed.has(c.id)?'隔离':'直通');
   const channels=battle.routeUsers.get(c.id);
   html+=info('业务路由',channels?.length?'入口 '+channels.join('、'):'当前无入口经过');
   const lock=Math.ceil((battle.locks.get(c.id)||0)-battle.time);
   if(isolator)html+=info('隔离器耐久',Math.ceil(isolator.hp)+' / '+isolator.max)+info('持续时间',Math.ceil(isolator.until-battle.time)+'s');
   else if(lock>0)html+=info('再次隔离','旁路冷却 '+lock+' 秒');
   else if(!battle.closed.has(c.id))html+=inspectActions(button('gate-card','选取网闸 · 55 算力 / 1 情报'));
  }
  if(c.type==='link'||c.type==='legacy'){
   const routes=battle.routeUsers.get(c.id);
   if(routes?.length)html+=info('业务路由','入口 '+routes.join('、'));
  }
  if(battle.downs.has(c.id))html+=info('协议降级',Math.ceil(battle.downs.get(c.id)-battle.time)+'s');
  if(battle.holes.has(c.id))html+=info(battle.map.boss==='mirage'?'路由黑洞':'区段锁死',Math.ceil(battle.holes.get(c.id)-battle.time)+'s');
  const warning=battle.warning;
  if(warning?.ids.includes(c.id)){
   const seconds=Math.max(0,warning.until-battle.time).toFixed(1);
   html+=info('首领预警','<span class="risk-text">'+seconds+' 秒后检验封锁</span>');
   const forecast=battle.preview(warning.ids);
   if(forecast.ok)html+=info('预计影响',forecast.changed.length?'入口 '+forecast.changed.join('、')+' 改道':'入口连通保持');
   else html+=info('预计影响','当前区段不可封锁');
  }
  return html;
 }
 return inspectHead('布防概况','守护进程 / 战术检查','cross','#74ead1')+
  '<p class="inspect-copy">'+battle.map.summary+'</p>'+
  info('接入入口',battle.map.entries.length+' 个')+info('交换节点',battle.map.nodes.length+' 个')+
  '<div class="help-note">'+icon('info')+'点击地图查看设备和威胁。点击流量预报中的入口可检查路线和火力。</div>';
}
function renderDeck(){
 $('towerCards').innerHTML=Object.entries(TOWERS).map(([id,d],i)=>'<button class="tower-card" data-place="tower:'+id+'" style="--ink:'+d.color+'" title="'+d.desc+'"><span class="tower-icon">'+icon(d.icon)+'</span><b>'+d.name+'</b><kbd>'+(i+1)+'</kbd><small>'+d.role+'</small><em>'+d.cpu+(d.intel?' <i>/ '+d.intel+'</i>':'')+'</em></button>').join('');
 $('items').innerHTML=Object.entries(ITEMS).map(([id,d])=>'<button class="item-card" data-place="item:'+id+'" title="'+d.desc+'"><span class="item-icon">'+icon(id)+'</span><span><b>'+d.name+'</b><small>'+d.place+'</small></span><span class="item-cost">'+d.cost+' '+(d.res==='intel'?'情报':'算力')+'<small id="cd-'+id+'"></small></span></button>').join('');
}
function forecast(n,lookahead){
 const list=demo?.forecast||wavePlan(battle.map,n);
 const pending=battle.active&&!demo&&!lookahead?battle.queue:null;
 return battle.map.entries.map((entry,i)=>{
  const group=list.filter(e=>e.entry===i),dest=battle.map.cells[battle.route.exit[entry.id]];
  const counts=new Map();
  for(const e of group)counts.set(e.type,(counts.get(e.type)||0)+1);
  const mix=[...counts].map(([type,count])=>ENEMIES[type].name+' ×'+count).join(' · ');
  const remaining=pending?.filter(e=>e.entry===i).length;
  const routed=battle.time-battle.lastChange<2.2&&battle.lastChanged.includes(entry.letter);
  const status=remaining===undefined?group.length+' 个待接入':remaining?remaining+' 个待接入':'已接入';
  const chosen=ui.selected?.lane===i;
  const content='<span class="route-id">'+entry.letter+'</span><span><b>'+entry.name+'</b><small>'+mix+'</small></span>'+
   '<span class="lane-readout"><em>→ '+dest.letter+'</em>'+(pending?'<small>'+status+'</small>':'')+'</span>';
  const style='class="forecast-row'+(routed?' rerouted':'')+(chosen?' lane-selected':'')+'" style="--route:'+entry.color+'"';
  return demo?'<div '+style+'>'+content+'</div>':
   '<button type="button" '+style+' data-lane="'+i+'" aria-pressed="'+chosen+'" title="查看路线和火力分布 · '+dest.name+' · '+status+'">'+content+'</button>';
 }).join('');
}
function refresh(force=false){
 const n=Math.min(battle.map.waves,battle.wave+(battle.active||battle.ended?0:1));
 const canLookAhead=battle.active&&!demo&&!battle.ended&&n<battle.map.waves;
 if(!canLookAhead)ui.forecastNext=false;
 const forecastWave=ui.forecastNext?n+1:n;
 const nText=String(n).padStart(2,'0'), sec=Math.ceil(Math.max(0,battle.autoAt-battle.time));
 const phase=demo?'演示运行中':battle.ended?'对局结束':battle.paused?'战术暂停':battle.active?'接敌中':battle.wave?'部署间隔':'等待开波';
 const key=[battle.wave,battle.active,battle.paused,battle.speed,battle.cpu,battle.intel,battle.core,battle.routeVersion,battle.logVersion,ui.placement,sec,battle.enemies.length,battle.queue.length,demo?.i,ui.selected?.lane,ui.forecastNext,Math.floor(battle.time)].join();
 if(force||key!==uiSignature){
  uiSignature=key;
  $('cpu').textContent=Math.floor(battle.cpu);$('intel').textContent=battle.intel;$('core').textContent=battle.core+' / '+battle.capCore;
  $('coreMeter').innerHTML=Array.from({length:12},(_,i)=>'<i class="'+(i*2<battle.core?'on':'')+'"></i>').join('');
  $('waveNo').textContent=nText;$('waveTotal').textContent='/ '+battle.map.waves;
  $('waveMeter').innerHTML=Array.from({length:battle.map.waves},(_,i)=>'<i class="'+(i+1<n||battle.ended==='win'?'done':i+1===n?'now':'')+'"></i>').join('');
  const brief=waveBrief(battle.map,forecastWave),briefEl=$('waveBrief'),switcher=$('lookahead');
  switcher.hidden=!canLookAhead;switcher.setAttribute('aria-pressed',String(ui.forecastNext));
  switcher.textContent=ui.forecastNext?'看本波':'看下波';
  switcher.title=ui.forecastNext?'查看当前接入流量':'查看下一波的入口和敌种';
  briefEl.textContent=(ui.forecastNext?'第 '+String(forecastWave).padStart(2,'0')+' 波预报 · ':'')+brief.name;
  briefEl.classList.toggle('critical',brief.alert);
  const forecasts=$('forecasts'),nextForecast=forecast(forecastWave,ui.forecastNext);
  if(forecastSignature!==nextForecast){
   const focused=forecasts.contains(document.activeElement)?document.activeElement.dataset.lane:null;
   forecasts.innerHTML=nextForecast;forecastSignature=nextForecast;
   if(focused!==null)forecasts.querySelector('[data-lane="'+focused+'"]')?.focus({preventScroll:true});
  }
  $('pause').innerHTML=icon(battle.paused?'play':'pause');$('pause').setAttribute('aria-pressed',String(battle.paused));
  $('speed').textContent=battle.speed+'×';
  $('waveStart').disabled=Boolean(battle.active||battle.ended||demo);
  $('waveStart').innerHTML=battle.ended?'<span>防御结束</span>':battle.active?'<span>第 '+nText+' 波进行中</span>':icon('play')+'<span>开始第 '+nText+' 波'+(sec?' · '+sec+'s':'')+'</span>';
  $('phase').lastElementChild.textContent=phase;
  $('footerRoute').textContent=battle.lastChange+3>battle.time&&battle.lastChanged.length?battle.lastChanged.join(' / ')+' 路由已切换':'路由已收敛';
  document.querySelectorAll('[data-place]').forEach(el=>el.classList.toggle('chosen',el.dataset.place===ui.placement));
  for(const [id,d] of Object.entries(ITEMS)){
   const cd=Math.ceil((battle.cooldowns[id]||0)-battle.time);
   $('cd-'+id).textContent=cd>0?'剩余 '+cd+'s':d.cd+'s 冷却';
  }
 }
 if(logSignature!==battle.logVersion){
  logSignature=battle.logVersion;
  const panel=$('logs'),anchor=[...panel.children].find(row=>row.offsetTop+row.offsetHeight>panel.scrollTop);
  const anchorId=panel.scrollTop>3?anchor?.dataset.event:null,offset=anchor?.offsetTop-panel.scrollTop;
  panel.innerHTML=battle.logs.map(entry=>{
   const content='<time>'+clockText(entry.time)+'</time><span>'+entry.text+'</span>';
   const attrs='class="log '+entry.kind+'" data-event="'+entry.serial+'"';
   return Number.isInteger(entry.cell)?
    '<button type="button" '+attrs+' data-log-cell="'+entry.cell+'" title="定位到战术地图">'+content+'<i class="log-location">'+icon('cross')+'</i></button>':
    '<div '+attrs+'>'+content+'</div>';
  }).join('');
  const old=anchorId&&panel.querySelector('[data-event="'+anchorId+'"]');
  if(old)panel.scrollTop=old.offsetTop-offset;
 }
 const html=inspectorHTML();
 if(force||!inspectorPress&&html!==selectedSignature){
  selectedSignature=html;
  const el=$('inspector'),previous=el.querySelector('.confirm-details')||el,scroll=previous.scrollTop;
  const focus=el.contains(document.activeElement)?document.activeElement.dataset.action:null;
  el.innerHTML=html;
  const next=el.querySelector('.confirm-details')||el;next.scrollTop=scroll;
  if(focus)el.querySelector('[data-action="'+focus+'"]')?.focus({preventScroll:true});
 }
}
function choose(value){
 if(battle.ended)return;
 ui.placement=value;ui.pending=null;ui.hover=null;ui.validation=null;ui.selected=null;ui.dir=0;
 sound('click');refresh(true);
}
function cancelPlacement(){ui.placement=null;ui.pending=null;ui.hover=null;ui.validation=null;refresh(true);}
function target(id,drop=false){
 if(!ui.placement||id==null)return;
 ui.hover=id;ui.validation=battle.validate(ui.placement,id);
 if(!ui.validation.ok){ui.pending=null;toast(ui.validation.why,true);refresh(true);return;}
 if(ui.pending?.id===id&&!drop){confirm();return;}
 const gun=ui.placement==='tower:gun';
 if(gun||ui.validation.p||ui.placement.startsWith('item:')){
  ui.pending={id,dir:ui.dir};
  toast(gun?'移动鼠标设定朝向，点击确认。':(ui.validation.p?.changed.length||ui.validation.p?.weighted.length)?'黄色虚线显示受影响的路由。':'确认投放位置及影响范围。');
  sound('click');refresh(true);
 }else{
  ui.pending={id,dir:0};confirm();
 }
}
function confirm(){
 if(!ui.placement||!ui.pending)return;
 const {id,dir}=ui.pending,result=battle.place(ui.placement,id,dir);
 if(!result.ok){ui.validation=result;toast(result.why,true);refresh(true);return;}
 ui.selected={cell:id};cancelPlacement();toast('操作已执行。');
}
function action(name){
 sound('click');let result;
 const t=battle.towers.get(ui.selected?.cell);
 if(name==='confirm')confirm();
 if(name==='cancel')cancelPlacement();
 if(name==='turn-left'&&ui.pending)ui.pending.dir=(ui.pending.dir+315)%360;
 if(name==='turn-right'&&ui.pending)ui.pending.dir=(ui.pending.dir+45)%360;
 if(name==='gate-card'){const id=ui.selected.cell;choose('tower:gate');target(id);}
 if(name==='upgrade-preview'&&t&&t.lv===1){
  showUpgradeDialog(t);
  return;
 }
 if(name==='skill')result=battle.skill(t);
 if(name==='upgrade')result=battle.upgrade(t);
 if(name.startsWith('branch-'))result=battle.upgrade(t,Number(name.at(-1)));
 if(name==='sell'&&t){
  if(battle.map.cells[t.id].type==='node'){
   ui.placement='remove:'+t.uid;ui.pending={id:t.id,dir:0};ui.hover=t.id;ui.validation=battle.validate(ui.placement,t.id);
  }else battle.remove(t.id);
 }
 if(result)toast(result,true);
 refresh(true);
}
$('inspector').addEventListener('pointerdown',e=>{
 if(e.button===0&&e.target.closest('[data-action]'))inspectorPress=true;
});
const releaseInspector=()=>{
 if(inspectorPress)requestAnimationFrame(()=>{inspectorPress=false;});
};
window.addEventListener('pointerup',releaseInspector);
window.addEventListener('pointercancel',releaseInspector);
window.addEventListener('blur',releaseInspector);
$('inspector').addEventListener('click',e=>{const btn=e.target.closest('[data-action]');if(btn&&interactive())action(btn.dataset.action);});
function selectMapTarget(hit){
 const tile=battle.map.cells[hit?.cell];
 ui.selected=tile?.entry!==undefined?{cell:tile.id,lane:tile.entry}:hit;
 sound('click');refresh(true);
}
$('lookahead').onclick=()=>{
 if(!interactive()||!battle.active||battle.wave>=battle.map.waves)return;
 ui.forecastNext=!ui.forecastNext;
 sound('click');refresh(true);
};
$('forecasts').addEventListener('click',event=>{
 const row=event.target.closest('[data-lane]');
 if(!row||!interactive())return;
 if(ui.placement){toast('请先确认或取消当前操作。',true);return;}
 const lane=Number(row.dataset.lane),entry=battle.map.entries[lane];
 selectMapTarget(ui.selected?.lane===lane?null:{cell:entry.id});
});
$('logs').addEventListener('click',event=>{
 const row=event.target.closest('[data-log-cell]');
 if(!row||demo||modal)return;
 if(ui.placement){toast('请先确认或取消当前操作。',true);return;}
 const cell=battle.map.cells[Number(row.dataset.logCell)],p=world.project(cell.x,.55,cell.z);
 ui.selected={cell:cell.id};ui.locator={id:cell.id,until:realTime+1.25,age:0};
 if(p.x<world.w*.12||p.x>world.w*.88||p.y<world.h*.14||p.y>world.h*.86){
  world.cam.x=cell.x-7;world.cam.z=cell.z-5;
 }
 sound('click');refresh(true);
});
let press=null,orbit=null,suppressClick=false;
function interactive(){return !modal&&!demo&&!battle.ended;}
document.addEventListener('pointerdown',e=>{
 activateAudio();
 if(!interactive()||e.button!==0)return;
 const card=e.target.closest('[data-place]');
 if(card){press={el:card,value:card.dataset.place,x:e.clientX,y:e.clientY,drag:false};e.preventDefault();}
});
document.addEventListener('click',e=>{
 const card=e.target.closest('[data-place]');
 if(card&&interactive()&&!suppressClick)choose(card.dataset.place);
});
document.addEventListener('pointermove',e=>{
 if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>6&&!press.drag){
  press.drag=true;choose(press.value);pointer.style.display='block';pointer.classList.add('down');
 }
 if(press?.drag){pointer.style.left=e.clientX+'px';pointer.style.top=e.clientY+'px';}
 if(orbit){
  const dx=e.clientX-orbit.x,dy=e.clientY-orbit.y,c=world.cam;
  if(orbit.pan||e.shiftKey){
   const a=c.az,units=(world.camera.top-world.camera.bottom)/Math.max(1,world.h);
   const horizontal=dx*units,vertical=dy*units/Math.sin(c.el);
   c.x-=horizontal*Math.cos(a)+vertical*Math.sin(a);
   c.z+=horizontal*Math.sin(a)-vertical*Math.cos(a);
  }else{c.az-=dx*.0075;c.el=clamp(c.el+dy*.0075,.28,1.51);}
  orbit.x=e.clientX;orbit.y=e.clientY;
  return;
 }
 if(!interactive()||!ui.placement)return;
 if(ui.pending){
  if(ui.placement==='tower:gun'){
   const b=world.canvas.getBoundingClientRect();
   if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)return;
   const point=world.worldPos(e.clientX,e.clientY,.54),origin=battle.map.cells[ui.pending.id];
   if(point&&dist(point,origin)>.4){ui.pending.dir=Math.round((Math.atan2(point.x-origin.x,point.z-origin.z)*180/Math.PI+360)%360/5)*5%360;refresh();}
  }
  return;
 }
 const hit=world.pick(e.clientX,e.clientY,battle,true,ui.placement==='item:backup'),id=hit?.cell??null;
 if(id!==ui.hover){ui.hover=id;ui.validation=id==null?null:battle.validate(ui.placement,id);refresh();}
});
document.addEventListener('pointerup',e=>{
 if(e.button===1){orbit=null;return;}
 if(e.button!==0||!press)return;
 if(press.drag){
  const hit=world.pick(e.clientX,e.clientY,battle,true,ui.placement==='item:backup');target(hit?.cell,true);
  pointer.style.display='none';pointer.classList.remove('down');suppressClick=true;setTimeout(()=>suppressClick=false,0);
 }
 press=null;
});
document.addEventListener('pointercancel',()=>{press=null;orbit=null;if(!demo)pointer.style.display='none';});
world.canvas.addEventListener('contextmenu',e=>e.preventDefault());
world.canvas.addEventListener('auxclick',e=>e.preventDefault());
world.canvas.addEventListener('pointerdown',e=>{
 if(e.button===1){e.preventDefault();if(!modal&&!demo)orbit={x:e.clientX,y:e.clientY,pan:e.shiftKey};}
});
world.canvas.addEventListener('wheel',e=>{e.preventDefault();if(!modal&&!demo)world.cam.zoom=clamp(world.cam.zoom*Math.exp(-e.deltaY*.001),.7,2.85);},{passive:false});
$('labels').addEventListener('click',e=>{
 if(!interactive()||suppressClick)return;
 const label=e.target.closest('[data-cell],[data-enemy]');
 if(!label)return;
 if(ui.placement){
  if(!ui.pending&&label.dataset.cell!==undefined)target(Number(label.dataset.cell));
  return;
 }
 selectMapTarget(label.dataset.cell===undefined?{enemy:Number(label.dataset.enemy)}:{cell:Number(label.dataset.cell)});
});
world.canvas.addEventListener('click', e=>{
 if(!interactive()||suppressClick||e.button!==0)return;
 if(ui.pending&&(ui.placement==='tower:gun'||ui.placement.startsWith('remove:'))){if(ui.placement==='tower:gun')confirm();return;}
 const hit=world.pick(e.clientX,e.clientY,battle,Boolean(ui.placement),ui.placement==='item:backup');
 if(ui.placement){target(hit?.cell);return;}
 selectMapTarget(hit);
});
$('resetCamera').onclick=()=>{world.reset();sound('click');};
$('mute').onclick=()=>setMute(!muted);
$('pause').onclick=()=>{if(!modal&&!battle.ended&&!exporting){battle.paused=!battle.paused;sound('click');refresh(true);}};
$('speed').onclick=()=>{if(!modal&&!demo){battle.speed=({1:2,2:3,3:1})[battle.speed];sound('click');refresh(true);}};
$('waveStart').onclick=()=>{if(!modal&&!demo&&battle.start()){battle.paused=false;refresh(true);}};
function setNav(id){
 for(const el of document.querySelectorAll('.nav'))el.classList.toggle('active',el.id===id);
}
const tacticalPage=document.querySelector('main');
function showDialog(kind,title,tag,desc,body,narrow=false){
 const dialog=$('dialog');
 const active=document.activeElement,previous=modal===kind&&dialog.contains(active)?active.dataset.dialog:null;
 if(!modal)dialogReturnFocus=active;
 modal=kind;$('overlay').hidden=false;tacticalPage.inert=true;dialog.className=narrow?'narrow':'';
 dialog.innerHTML='<div class="dialog-head"><div><div class="eyebrow">'+tag+'</div><h2 id="dialogTitle">'+title+'</h2>'+(desc?'<p>'+desc+'</p>':'')+'</div><button class="icon-button" data-dialog="close" title="关闭" aria-label="关闭">'+icon('close')+'</button></div><div class="dialog-body">'+body+'</div>';
 setNav(({missions:'navMissions',demos:'navDemos',manual:'navManual'})[kind]||'navBattle');
 const control=(previous&&[...dialog.querySelectorAll('[data-dialog]')].find(el=>el.dataset.dialog===previous))||
  dialog.querySelector('[data-dialog="close"]');
 control.focus({preventScroll:true});
}
function showUpgradeDialog(t){
 const d=TOWERS[t.type];
 showDialog('upgrade',d.name+' · 2 级升级','设备参数 / UPGRADE',
  '当前资源 '+battle.cpu+' 算力 / '+battle.intel+' 情报',
  '<div class="upgrade-grid">'+upgradeComparison(t)+'</div><div id="upgradeFeedback" role="status"></div>',!d.branches);
 $('dialog').dataset.deviceUid=String(t.uid);
}
function hideDialog(){
 const wasOpen=Boolean(modal);
 modal='';$('overlay').hidden=true;tacticalPage.inert=false;setNav('navBattle');
 if(wasOpen){
  const restore=dialogReturnFocus;
  if(restore?.isConnected&&!restore.disabled&&restore!==document.body)restore.focus({preventScroll:true});
  else $('navBattle').focus({preventScroll:true});
  dialogReturnFocus=null;
 }
}
function mapArt(map,i){
 const P=palette(map),entries=new Map([...map.entries,...map.exits].map(e=>[e.id,e]));
 const point=(x,z)=>[97+x*10.8-z*5.3,18+x*2.55+z*8.6];
 const xy=(x,z)=>point(x,z).join(',');
 let images='';
 for(const c of map.cells){
  if(c.type==='void')continue;
  const type=entries.get(c.id),color=type?.color||map.color;
  const p=[xy(c.x-.46,c.z-.46),xy(c.x+.46,c.z-.46),xy(c.x+.46,c.z+.46),xy(c.x-.46,c.z+.46)].join(' ');
  images+='<polygon points="'+p+'" fill="'+(c.edges.length?P.route:c.type==='obstacle'?P.trace:P.board)+'" fill-opacity="'+(c.edges.length?.83:.60)+'" stroke="none"/>';
  for(const n of c.edges.filter(n=>n>c.id)){const q=map.cells[n];images+='<polyline points="'+xy(c.x,c.z)+' '+xy(q.x,q.z)+'" stroke="'+map.color+'" opacity=".53"/>';}
  if(type||c.type==='node'){const [x,y]=point(c.x,c.z);images+='<circle cx="'+x+'" cy="'+y+'" r="'+(type?3.9:2.6)+'" fill="'+color+'" stroke="none"/>';}
 }
 return '<div class="mission-art"><svg viewBox="0 0 280 154" aria-hidden="true"><path opacity=".13" d="M5 53h270M5 102h270M70 7v140M205 7v140"/>'+images+'</svg><span>0'+(i+1)+'</span></div>';
}
const demoInfo=[
 '拖放网闸隔离西边界。观察入口 A 的新路线以及办公网段敌人的掉头。',
 '洪泛团击穿专线汇聚。向 A 的路由投放协议降级，为重组防线争取时间。',
 '查看蛰影锁死运维环后的流量走向，以及修复进程如何恢复友塔。'
];
function missionDialog(demos=false){
 const list=MAPS.map((map,i)=>'<button class="mission-card" data-dialog="'+(demos?'demo-':'map-')+i+'" style="--local:'+map.color+'">'+mapArt(map,i)+'<div class="mission-content"><small>'+map.type+' / '+map.code+'</small><h3>'+(demos?map.demo:map.name)+'</h3><p>'+(demos?demoInfo[i]:map.summary)+'</p><div class="go"><span>'+(demos?['18 秒','19 秒','20 秒'][i]+' · 播放演示':map.waves+' 波 · 接入网络')+'</span>'+icon('arrow')+'</div></div></button>').join('');
 showDialog(demos?'demos':'missions',demos?'实战演示':'选择防御网络',demos?'战斗记录 / FIELD DEMOS':'自治域 / NETWORK SELECT',demos?'回放三场实时攻防记录。路由、攻击与状态均由战斗系统计算。':'蛰影正在扫描汐域的入口。选择网络并维持业务到中枢的通路。','<div class="mission-list">'+list+'</div>');
}
const manualTabs=['设备手册','威胁档案','应急道具','地形与状态'];
function manualDialog(tab=0){
 const entry=(label,tag,desc,ic,color='#b0eee0')=>'<article class="manual-item"><div class="inspect-art" style="--ink:'+color+'">'+icon(ic)+'</div><div><h3>'+label+'</h3><small>'+tag+'</small><p>'+desc+'</p></div></article>';
 let content='';
 if(tab===0)content=Object.entries(TOWERS).map(([type,d])=>{
  const details=deviceFacts(type,deviceProfile(type)).slice(0,3).map(([label,value])=>label+' '+value).join(' · ');
  return entry(d.name,d.role+' / '+d.cpu+' 算力'+(d.intel?' / '+d.intel+' 情报':''),
   d.desc+(details?'<br>'+details:'')+'<br>'+(d.branches?d.branches.map(a=>a.join(' · ')).join('<br>'):d.upgrade)+(d.skill?'<br>主动技能 '+d.skill:''),d.icon,d.color);
 }).join('');
 if(tab===1)content=Object.values(ENEMIES).map(d=>entry(d.name,d.boss?'首领威胁':d.air?'无线层威胁':'地面威胁',d.desc,'bug',d.color)).join('');
 if(tab===2)content=Object.entries(ITEMS).map(([k,d])=>entry(d.name,d.place+' / '+d.cost+' '+(d.res==='cpu'?'算力':'情报')+' / '+d.cd+'s 冷却',d.desc,k,'#b7a5ff')).join('');
 if(tab===3){
  content=Object.values(TERRAIN).map(([name,desc])=>entry(name,'网络拓扑',desc,'layers')).join('');
  content+=entry('检测、阻挡与护盾','战斗状态','检测使伪装目标显形。阻挡保留出入口的通行状态，超出容量的敌人继续经过。护盾先于生命吸收伤害，显示于耐久条下方。','shield');
  content+=entry('加密与解密','设备状态','加密期间设备停止攻击、修复和释放技能。备份还原或冗余切换可解除加密。耐久条旁的锁、困、缓分别表示加密、诱捕和压制减速。','isolate','#cca9ff');
  content+=entry('路由收敛','业务约束','黄色虚线是新路由预览。关闭道路须同时保持所有入口和在场地面威胁的连通。节点恢复后需等待 7 秒。','radar');
  content+=entry('算力与情报','战斗资源','每波开战后的前 36 秒以及击杀威胁时获得算力，完成波次、清除重点威胁或在交战中维持隔离获得情报。隔离交换节点需要额外花费 1 情报。','cpu');
 }
 const tabs=manualTabs.map((name,i)=>'<button class="secondary '+(tab===i?'active':'')+'" data-dialog="tab-'+i+'">'+name+'</button>').join('');
 showDialog('manual','汐域作战手册','知识库 / DEFENSE MANUAL','查询设备能力、威胁签名和网络运行规则。','<div class="tabs">'+tabs+'</div><div class="manual-list">'+content+'</div>');
}
function showMenu(){
 showDialog('menu','对局菜单','守护进程 / CONTROL','','<label class="audio-setting"><span>主音量</span><input id="volume" type="range" min="0" max="100" value="'+volume*100+'"><b id="volumeValue">'+Math.round(volume*100)+'%</b></label><div class="menu-actions">'+
 '<button class="secondary" data-dialog="mute">'+icon(muted?'mute':'volume')+(muted?'取消静音':'静音')+'</button>'+
 '<button class="secondary" data-dialog="restart">'+icon('backup')+'重新开始本图</button>'+
 '<button class="secondary" data-dialog="missions">'+icon('layers')+'返回关卡选择</button></div>',true);
}
function report(){
 const won=battle.ended==='win',s=battle.stats;
 const fields=[['处理波次',battle.wave+'/'+battle.map.waves],['中枢完整度',battle.core+'/'+battle.capCore],['处置时间',clockText(battle.time)],['威胁清除',s.kills],['入侵突破',s.leaks],['改道次数',s.changes],['部署设备',s.built],['设备损毁',s.lost],['恢复耐久',Math.floor(s.healed)]];
 const exits=battle.map.exits;
 const rows=battle.map.entries.map((entry,i)=>'<tr><th scope="row"><span style="color:'+entry.color+'">'+entry.letter+'</span> '+entry.name+
  '</th>'+exits.map((_,j)=>'<td>'+battle.breachByRoute[i][j]+'</td>').join('')+'</tr>').join('');
 const review='<table class="report-paths"><caption>入侵突破分布</caption><thead><tr><th scope="col">入口</th>'+
  exits.map(exit=>'<th scope="col">'+exit.letter+' · '+exit.name+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>';
 showDialog('report',won?'防御成功':'中枢失守','汐域事件报告 / INCIDENT REPORT',battle.map.name+' · '+(won?'入侵已遏制，业务保留。':'中枢完整度归零，事件升级。'),
 '<div class="report-box">'+fields.map(([name,v])=>'<div class="report-stat"><b>'+v+'</b><span>'+name+'</span></div>').join('')+'</div>'+review+'<div class="menu-actions"><button class="primary" data-dialog="restart">'+icon('backup')+'重开本图</button><button class="secondary" data-dialog="missions">'+icon('layers')+'返回关卡选择</button></div>',true);
}
$('overlay').addEventListener('click',e=>{
 const cmd=e.target.closest('[data-dialog]')?.dataset.dialog;
 if(!cmd){if(e.target===$('overlay'))hideDialog();return;}
 sound('click');
 if(cmd==='close')hideDialog();
 if(cmd==='restart'){stopDemo(false);resetGame(mapIndex);hideDialog();}
 if(cmd==='missions'){if(demo)stopDemo();missionDialog();}
 if(cmd==='mute'){setMute(!muted);showMenu();}
 if(cmd.startsWith('device-upgrade-')&&modal==='upgrade'){
  const t=battle.towers.get(ui.selected?.cell),branch=Number(cmd.split('-').at(-1));
  const result=t&&String(t.uid)===$('dialog').dataset.deviceUid?battle.upgrade(t,branch):'设备已离线。';
  if(result){$('upgradeFeedback').textContent=result;sound('reject');}
  else{hideDialog();refresh(true);}
 }
 if(cmd.startsWith('tab-'))manualDialog(Number(cmd.at(-1)));
 if(cmd.startsWith('map-')){stopDemo(false);resetGame(Number(cmd.at(-1)));hideDialog();}
 if(cmd.startsWith('demo-'))beginDemo(Number(cmd.at(-1)));
});
$('overlay').addEventListener('input',e=>{
 if(e.target.id==='volume'){volume=Number(e.target.value)/100;$('volumeValue').textContent=e.target.value+'%';if(master)master.gain.value=muted?0:volume;}
});
$('navBattle').onclick=()=>hideDialog();
$('navMissions').onclick=()=>{if(demo)stopDemo();missionDialog();};
$('navDemos').onclick=()=>{if(demo)stopDemo();missionDialog(true);};
$('navManual').onclick=()=>manualDialog();
$('menu').onclick=()=>showMenu();
$('exitDemo').onclick=()=>exporting?window.videoExport.end():stopDemo();
for(const type of ['pointerdown','pointerup','click','wheel','keydown']){
 window.addEventListener(type,event=>{
  if(!exporting||event.target.closest?.('#exitDemo'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.type==='keydown'&&event.key==='Escape')window.videoExport.end();
 },{capture:true,passive:false});
}
document.addEventListener('keydown',e=>{
 activateAudio();
 if(e.key==='Escape'){
  if(modal)hideDialog();
  else if(demo)stopDemo();
  else if(ui.placement)cancelPlacement();
  else showMenu();
  return;
 }
 if(modal){
  if(e.key==='Tab'){
   const focusable=[...$('dialog').querySelectorAll('button:not(:disabled), input:not(:disabled), [href]')];
   const from=focusable.indexOf(document.activeElement);
   if(focusable.length&&(from<0||e.shiftKey&&from===0||!e.shiftKey&&from===focusable.length-1)){
    e.preventDefault();
    focusable[e.shiftKey?focusable.length-1:0].focus({preventScroll:true});
   }
  }
  return;
 }
 if(demo||e.target.tagName==='INPUT')return;
 if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();$('pause').click();}
 if(e.key==='Enter'&&ui.pending){e.preventDefault();confirm();}
 if(/^[1-6]$/.test(e.key)&&interactive())choose('tower:'+Object.keys(TOWERS)[Number(e.key)-1]);
 if(e.key.toLowerCase()==='r')world.reset();
});
const demoDurations=[18,19,20];
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
function beginDemo(i){
 if(!demoReturn){
  demoReturn={battle,ui,mapIndex,cam:{...world.cam},simCarry,reportShown,settlementAt,songBeat,realTime,
   toast:$('toast').textContent,toastClass:$('toast').className,toastUntil,wasReport:modal==='report'};
 }
 demo=null;press=null;orbit=null;
 hideDialog();
 resetGame(i);
 demo={i,duration:demoDurations[i],elapsed:0,marks:new Set(),points:{}};
 demoHud.hidden=false;pointer.style.display='none';battle.active=true;battle.demo=true;
 battle.wave=[5,9,16][i];battle.waveAt=0;battle.queue=[];
 battle.logs=[];battle.log('回放已接入 · '+battle.map.demo,'good');
 if(i===0){
  battle.addTower('gun',key(3,3),184);
  battle.addTower('repair',key(3,5),0);
  battle.addTower('firewall',key(6,2),0).hp=175;
  battle.spawn('ransom',1,key(10,3));
  battle.spawn('worm',0,key(4,6));
  battle.spawn('flood',0,key(4,6));
  battle.spawn('trojan',1,key(12,1));
 }else if(i===1){
  const g=battle.addTower('gate',key(11,4),0);g.hp=154;
  battle.addTower('gun',key(12,3),240);
  battle.addTower('gun',key(2,3),40);
  battle.addTower('firewall',key(6,4),0).hp=157;
  battle.recompute(false);
  battle.spawn('flood',1,key(11,2),{fireAt:1.7});
  battle.spawn('shell',2,key(10,2));
  battle.spawn('ransom',0,key(1,2));
  battle.spawn('worm',0,key(3,4));
 }else{
  const t=battle.addTower('repair',key(4,7),0);
  t.fireAt=2;
  battle.addTower('sandbox',key(4,3),0).hp=110;
  battle.addTower('gun',key(2,5),148).hp=107;
  battle.addTower('gun',key(12,7),210);
  battle.addTower('gun',key(1,7),268);
  battle.addTower('firewall',key(11,6),0).hp=196;
  battle.towers.get(key(3,7)).hp=197;
  battle.towers.get(key(3,7)).enc=3.5;
  demo.boss=battle.spawn('shadow',0,key(1,1),{hp:1040});
  demo.boss.preferred=[key(3,6),key(3,4)];
  battle.spawn('flood',2,key(11,4));
  battle.spawn('ransom',2,key(11,2),{fireAt:2.7});
  battle.spawn('shell',2,key(11,4));
 }
 demo.forecast=battle.enemies.map(e=>({type:e.type,entry:e.entry}));
 const emit=(time,entry,type,id)=>{
  demo.forecast.push({type,entry});
  battle.jobs.push({time,run:()=>battle.spawn(type,entry,id)});
 };
 if(i===0){
  emit(4.39,0,'worm',key(2,3));emit(4.8,0,'worm',key(2,2));emit(5.7,0,'flood',key(2,1));emit(8,1,'ransom',key(12,3));emit(10.1,1,'worm',key(10,3));emit(12.4,1,'worm',key(10,3));
 }else if(i===1){
  emit(2.3,1,'flood',key(12,2));emit(5.1,1,'worm',key(11,2));emit(5.8,2,'ransom',key(9,2));emit(6.6,2,'flood',key(11,2));emit(8.1,0,'worm',key(1,0));emit(10,1,'worm',key(11,2));emit(11.4,2,'ransom',key(11,3));emit(13,0,'flying',key(1,1));
 }else{
  emit(1.5,2,'worm',key(11,4));emit(2.3,2,'worm',key(11,4));emit(3.3,2,'ransom',key(11,5));emit(5.7,1,'worm',key(6,2));emit(7.4,1,'flood',key(5,2));emit(8.4,0,'ransom',key(3,2));emit(10.85,0,'ransom',key(3,8));emit(11,2,'trojan',key(11,5));emit(12.3,1,'flood',key(7,2));emit(13,2,'flying',key(13,0));
 }
 runDemo(0);paint(0);refresh(true);previousFrame=0;
}
function stopDemo(restore=true){
 if(!demo)return;
 const previous=demoReturn;demo=null;demoReturn=null;
 demoHud.hidden=true;pointerRipple.hidden=true;pointer.style.display='none';pointer.classList.remove('down');$('subtitle').textContent='';
 hideDialog();
 if(!restore||!previous)return;
 ({battle,ui,mapIndex,simCarry,reportShown,settlementAt,songBeat}=previous);
 const elapsed=realTime-previous.realTime;
 if(settlementAt!==null)settlementAt+=elapsed;
 toastUntil=previous.toastUntil+elapsed;
 $('toast').textContent=previous.toast;$('toast').className=previous.toastClass;
 mountBattle();
 Object.assign(world.cam,previous.cam);
 if(previous.wasReport)report();
 paint(battle.time);
}
function runDemo(t){
 const i=demo.i,once=(time,event)=>{
  if(t>=time&&!demo.marks.has(time)){demo.marks.add(time);event();}
 };
 if(i===0){
  once(2.05,()=>choose('tower:gate'));
  once(3.30,()=>target(key(2,4),true));
  once(4.68,()=>{demo.points.confirm=pointFor(document.querySelector('[data-action=confirm]'));confirm();});
  once(12.85,()=>{ui.selected={cell:key(7,7)};});
 }else if(i===1){
  once(1.0,()=>{ui.selected={cell:key(11,4)};});
  once(7.45,()=>choose('item:downgrade'));
  once(8.60,()=>target(key(3,4),true));
  once(10.05,()=>{demo.points.confirm=pointFor(document.querySelector('[data-action=confirm]'));confirm();});
 }else{
  once(4.8,()=>{if(!demo.boss.dead)demo.boss.hp=Math.min(demo.boss.hp,demo.boss.max*.408);});
  once(7.1,()=>{demo.boss.specialAt=60;});
  once(10.4,()=>{ui.selected={cell:key(4,7)};sound('click');});
  once(12.48,()=>action('skill'));
 }
}
const captions=[
 [[0,'分段取舍｜办公网段与 DMZ 互联提供两条进路。'],[1.82,'拖动网闸至 SW-01 西边界。'],[3.29,'预览：入口 A 折向 DMZ 互联，入口 B 保持当前路径。'],[4.68,'确认隔离。西边界前的恶意流量向互联区回撤。'],[8.45,'两路流量在互联区汇合。勒索者正压制守方设备。'],[14.05,'核心前仍有近战压力。隔离只改变经过的位置。']],
 [[0,'旁路直通｜三入口洪峰。网闸把 B、C 引向数据中心 X。'],[1.15,'洪泛团离开主路，从可通行的一侧重击网闸。'],[4.83,'网闸损毁。专线恢复，B、C 改返数据中心 Y。'],[7.38,'选取协议降级，准备减缓 A 的入侵流量。'],[8.65,'预览旧协议覆盖区域。确认后路由会计入通行时间。'],[10.07,'A 入口流量减速，拦截器获得额外攻击时间。'],[15.15,'双活数据中心分担压力，守方仍需覆盖两条线路。']],
 [[0,'蛰影现身｜工控运维环被渗透，检测塔开始扫描。'],[2.24,'沙箱确认潜伏签名，拦截器开始锁定目标。'],[4.82,'蛰影提权并进入破坏阶段。橙红标记提示即将锁死的位置。'],[6.57,'运维环锁死。A 绕向外环，B 转往东侧核心。'],[9.65,'选取修复进程，检查仍在交战的友塔。'],[12.48,'冗余切换解除友塔加密并装载护盾。'],[15.59,'运维环解除封锁，双核心重新分担流量。']]
];

const demoCameras=[
 [[0,0,0,1,.39,.84],[.8,0,0,1,.39,.84],[3.15,-4,-1.46,1.5,.50,.80],[5.30,-4,-1.46,1.5,.50,.80],
  [8.20,-2.40,-2.25,1.49,.46,.80],[12.45,-.64,.25,1.44,.42,.83],[15.12,.05,1.84,1.42,.40,.82],[18,0,0,1,.39,.84]],
 [[0,0,0,1,.39,.84],[.62,0,0,1,.39,.84],[2.72,3.58,-1.36,1.51,.27,.79],[5.17,3.58,-.98,1.48,.27,.79],
  [6.48,2.70,.30,1.42,.34,.82],[8.44,-3.46,.0,1.48,.43,.79],[11.20,-3.36,.31,1.48,.43,.79],
  [15.85,2.21,1.45,1.38,.32,.81],[19,0,0,1,.39,.84]],
 [[0,0,0,1,.39,.84],[.71,0,0,1,.39,.84],[2.40,-3.51,-2.12,1.48,.49,.80],[4.74,-2.94,-1.00,1.46,.48,.80],
  [6.88,-2.82,.58,1.49,.45,.80],[10.1,-2.79,1.96,1.49,.46,.81],[13.2,-2.47,2.1,1.40,.41,.82],
  [16.25,-.64,1.42,1.22,.36,.84],[20,0,0,1,.39,.84]]
];
function demoVisual(t){
 const i=demo.i,c=world.cam,shots=demoCameras[i];
 const high=shots.findIndex(a=>a[0]>=t),index=high<0?shots.length-1:high;
 const a=shots[Math.max(0,index-1)],b=shots[index],ratio=a===b?1:smooth((t-a[0])/(b[0]-a[0]));
 const fields=['x','z','zoom','az','el'];
 fields.forEach((field,i)=>{c[field]=a[i+1]+(b[i+1]-a[i+1])*ratio;});
 $('subtitle').textContent=captions[i].filter(a=>t>=a[0]).at(-1)?.[1]||'';
}
function pointFor(el){
 if(!el)return null;
 const r=el.getBoundingClientRect();return {x:r.left+r.width*.58,y:r.top+r.height*.53};
}
function pointerVisual(t){
 const i=demo.i,b=world.canvas.getBoundingClientRect();
 const tile=(x,z,y=.54)=>{const p=world.project(x,y,z);return {x:b.left+p.x,y:b.top+p.y};};
 const paths=[
  [[1.32,2.03,()=>tile(0,8),()=>pointFor(document.querySelector('[data-place="tower:gate"]'))],[2.05,3.30,()=>pointFor(document.querySelector('[data-place="tower:gate"]')),()=>tile(2,4),true],[3.30,3.89,()=>tile(2,4),()=>tile(2,4)],[3.90,4.68,()=>tile(2,4),()=>(pointFor(document.querySelector('[data-action=confirm]'))||demo.points.confirm)],[11.91,12.85,()=>tile(4,4),()=>tile(7,7,.85)]],
  [[.38,1.0,()=>tile(10,2),()=>tile(11,4,.86)],[6.79,7.45,()=>tile(11,4,.72),()=>pointFor(document.querySelector('[data-place="item:downgrade"]'))],[7.45,8.60,()=>pointFor(document.querySelector('[data-place="item:downgrade"]')),()=>tile(3,4),true],[8.6,9.17,()=>tile(3,4),()=>tile(3,4)],[9.18,10.05,()=>tile(3,4),()=>(pointFor(document.querySelector('[data-action=confirm]'))||demo.points.confirm)]],
  [[9.38,10.40,()=>tile(2,5),()=>tile(4,7,1.05)],[10.40,11.54,()=>tile(4,7,1.05),()=>tile(4,7,1.05)],[11.55,12.48,()=>tile(4,7,1.05),()=>pointFor(document.querySelector('[data-action="skill"]'))]]
 ][i];
 const selected=paths.find(a=>t>=a[0]&&t<=a[1]+.14);
 if(!selected){pointer.style.display='none';pointerRipple.hidden=true;return;}
 const [start,end,from,to,down]=selected,a=from(),p=to()||a;
 if(!a||!p){pointer.style.display='none';pointerRipple.hidden=true;return;}
 const s=smooth((t-start)/(end-start));pointer.style.display='block';pointer.classList.toggle('down',!!down||Math.abs(t-end)<.08);
 pointer.style.left=(a.x+(p.x-a.x)*s)+'px';pointer.style.top=(a.y+(p.y-a.y)*s)+'px';
 const release=(down||demo.marks.has(end))&&t>=end&&t-end<.14;
 pointerRipple.hidden=!release;
 if(release){
  const phase=clamp((t-end)/.14,0,1);
  pointerRipple.style.left=p.x+'px';pointerRipple.style.top=p.y+'px';
  pointerRipple.style.opacity=String(1-phase);
  pointerRipple.style.transform='translate(-50%,-50%) scale('+(1+phase*1.62)+')';
 }
}
function trackDemoHover(t){
 if(!demo||!ui.placement||ui.pending)return;
 const i=demo.i,cut=i===0?2.93:i===1?8.24:Infinity;
 const id=t>=cut?(i===0?key(2,4):key(3,4)):null;
 ui.hover=id;ui.validation=id==null?null:battle.validate(ui.placement,id);
}
function tick(){
 battle.tick(stepSize);
 if(demo){runDemo(battle.time);trackDemoHover(battle.time);}
}
function paint(t){
 if(ui.locator){
  if(realTime>=ui.locator.until)ui.locator=null;
  else ui.locator.age=1-(ui.locator.until-realTime)/1.25;
 }
 if(ui.placement&&(ui.pending||ui.hover!=null)){
  const id=ui.pending?.id??ui.hover;
  if(!ui.validation||battle.routeVersion!==ui.validRoute||Math.floor(battle.time*10)!==ui.validTime){
   ui.validation=battle.validate(ui.placement,id);ui.validRoute=battle.routeVersion;ui.validTime=Math.floor(battle.time*10);
  }
 }
 if(demo)demoVisual(t);
 const notice=battle.notice,age=notice?battle.time-notice.at:Infinity;
 warningBanner.hidden=!notice||age>=notice.dur;
 if(!warningBanner.hidden){
  warningBanner.style.setProperty('--alert-color',notice.color);
  warningBanner.style.opacity=String(Math.min(1,.3+age*7,(notice.dur-age)*4));
  warningBanner.querySelector('small').textContent=notice.tag;
  warningBanner.querySelector('strong').textContent=notice.title;
 }
 if((demo?battle.time:realTime)>toastUntil)$('toast').textContent='';
 refresh();
 const afterglow=settlementAt===null?0:clamp((realTime-settlementAt)*battle.speed,0,1.15);
 world.render(battle,ui,demo?t:battle.time+afterglow);
 if(demo)pointerVisual(t);
}
function advanceDemoTo(time){
 while(!battle.ended&&battle.time+stepSize<=time+1e-8)tick();
}
document.addEventListener('visibilitychange',()=>{previousFrame=0;});
function loop(ms){
 const wallDelta=previousFrame?Math.max(0,(ms-previousFrame)/1000):0;previousFrame=ms;
 requestAnimationFrame(loop);if(exporting||document.hidden)return;
 const dt=Math.min(.10,wallDelta);
 realTime+=dt;
 if(demo){
  if(!battle.paused&&!modal){
   demo.elapsed=Math.min(demo.duration,demo.elapsed+wallDelta);
   advanceDemoTo(demo.elapsed);
  }
  if(demo.elapsed<demo.duration){paint(demo.elapsed);music();return;}
  stopDemo();missionDialog(true);
 }else if(!battle.paused&&!modal&&!battle.ended){
  simCarry+=dt*battle.speed;
  while(simCarry+1e-8>=stepSize){tick();simCarry-=stepSize;}
 }
 if(battle.ended&&!demo){
  if(settlementAt===null)settlementAt=realTime;
  if(!reportShown&&(realTime-settlementAt)*battle.speed>=1.15){reportShown=true;report();}
 }
 paint(battle.time);
 music();
}
window.videoExport={
 runs:['demo-1','demo-2','demo-3'],
 async begin(runId,{fps=30}={}){
  const i=this.runs.indexOf(runId);
  if(i<0||!Number.isFinite(fps)||fps<=0)throw new Error('Invalid demonstration or frame rate');
  exporting=true;exportFps=fps;lastFrame=-1;
  if(master)master.gain.value=0;
  if(ambientGain){ambientGain.gain.cancelScheduledValues(audio.currentTime);ambientGain.gain.value=0;}
  beginDemo(i);
  return {frames:Math.ceil(demo.duration*fps)};
 },
 async frame(i){
  if(!exporting||!demo||i!==lastFrame+1||i>=Math.ceil(demo.duration*exportFps))throw new Error('Frame index out of sequence');
  const t=i/exportFps;
  advanceDemoTo(t);
  paint(t);
  world.renderer.getContext().finish();lastFrame=i;
 },
 end(){
  if(!exporting)return;
  exporting=false;
  if(master)master.gain.value=muted?0:volume;
  stopDemo();
  lastFrame=-1;
 }
};
resetGame(0);
requestAnimationFrame(loop);






