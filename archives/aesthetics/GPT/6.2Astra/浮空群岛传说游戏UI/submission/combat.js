'use strict';
const CUT=1.72,FULL_CUT=2.8,AUTO_CHAIN_AT=20.2;
const autoSkills=[[3.8,0],[6.6,1],[10.9,3],[15.1,2],[18.2,0],[31.7,1],[33.3,3]];
function beginBattle(){
 G.battle={linkAt:9.9,overAt:15.8,chainAt:AUTO_CHAIN_AT,first:0,order:null,chainTimes:null,actions:[],notice:null,solo:null,queued:[],manual:0,revision:0,openingUntil:null};
 G.battle.opening=openingVolley();
 G.missionSerial++;G.result=null;
}
const artTime=pos=>G.battle.chainTimes?.[pos]??(G.battle.chainAt+pos*CUT);
const fullTime=()=>artTime(3)+CUT;
const breakTime=()=>fullTime()+FULL_CUT;
const chainPosition=t=>t>=fullTime()?4:[3,2,1,0].find(pos=>t>=artTime(pos)-.00001)??0;
const battleEnd=()=>fightLog().victory+2.35;
function crewOrder(){const first=G.battle.first;return G.battle.order?.slice()||[first,...[0,1,2,3].filter(i=>i!==first)];}
function skillHistory(t){
 const l=G.load[G.team[0]],times=[-100,-100,-100,-100],history=[];
 const raw=autoSkills.map(([time,slot])=>({time,slot,kind:'skill',auto:true})).concat(G.battle.actions.filter(a=>a.kind==='skill')).sort((a,b)=>a.time-b.time);
 for(const h of raw){
  if(h.time>t||h.time>=(G.battle.openingUntil??G.battle.chainAt)&&h.time<breakTime())continue;
  if(h.time-times[h.slot]+.001<skillInfo[l.skills[h.slot]].cd)continue;
  times[h.slot]=h.time;history.push(h);
 }
 return {times,history};
}
function chargeAt(slot,t){
 const b=G.battle,pos=crewOrder().indexOf(slot),release=artTime(pos);
 if(t>=release)return clamp((t-release)*3.1,0,39);
 const last=b.actions.filter(a=>a.kind==='ult'&&a.slot===slot&&a.time<=t).at(-1);
 if(last)return clamp((t-last.time)*100/Math.max(.1,b.chainAt-.25-last.time),0,100);
 return clamp([25,22,30,18][slot]+Math.max(0,t-1.5)*[5.6,5.3,5.1,5.3][slot]+b.actions.filter(a=>a.kind==='skill'&&a.time<=t).length*1.2,0,100);
}
function chainDamage(slot){const h=G.team[slot];return Math.round((growStats(h).atk*13.15+growStats(h).crit*25)/10)*10;}
function finisherDamage(){return Math.round(teamPower()*1.91/10)*10;}
function totalChain(){return finisherDamage()+G.team.reduce((s,_,i)=>s+chainDamage(i),0);}
const totalBossHP=()=>[315000,398000,480000,605000][G.diff];
function clearWord(){return currentQuest()[1]==='护航作战'?'护航成功':currentQuest()[1]==='航路清剿'?'航线肃清':'讨伐成功';}
function equippedSkillDamage(slot){
 const skill=G.load[G.team[0]].skills[slot];
 return Math.round(growStats(G.team[0]).atk*[2.4,2.15,0,2.85,3.25,2.7][skill]);
}
function openingVolley(){
 const beats=[2.24,2.92,3.54,4.18,4.91,5.57,6.13,6.86,7.46,8.09,8.68,9.31,9.9,10.63,11.19,11.79,12.48,13.09,13.8,14.4,15.14,15.8,16.41,17.02,17.63,18.27,18.93,19.61];
 const slots=[0,1,2,3,0,2,1,3];
 const strikes=beats.map((time,i)=>{
  const slot=slots[i%slots.length],id=G.team[slot];
  const type=characters[id].e==='water'?'weak':i%5===1?'crit':'normal';
  const weight=growStats(id).atk*(type==='weak'?1.36:type==='crit'?1.65:1)*(1+(i*13%11)/40);
  return {time,slot,type,weight,kind:'basic'};
 });
 const budget=Math.max(16000,totalBossHP()*.73-totalChain()-16000);
 const sum=strikes.reduce((n,h)=>n+h.weight*(h.time>=9.9?1.32:1),0);
 return strikes.map(({weight,...hit})=>({...hit,amount:Math.round(weight/sum*budget)}));
}
let cachedLog=null;
function fightLog(){
 const b=G.battle;
 if(cachedLog?.battle===b&&cachedLog.revision===b.revision)return cachedLog;
 const brk=breakTime(),maximum=totalBossHP(),order=crewOrder();
 const events=b.opening.filter(h=>h.time<(b.openingUntil??b.chainAt)).map(h=>({...h}));
 for(const use of skillHistory(Infinity).history){
  const raw=equippedSkillDamage(use.slot);
  if(raw)events.push({time:use.time,slot:0,kind:'skill',amount:raw,type:characters[G.team[0]].e==='water'?'weak':'crit'});
 }
 for(const use of b.actions){
  if(use.kind==='attack')events.push({...use,type:characters[G.team[0]].e==='water'?'weak':'normal'});
  if(use.kind==='ult'&&!use.chainCast)events.push({...use,time:use.time+.68,type:'art'});
 }
 for(const [pos,slot] of order.entries()){
  events.push({time:artTime(pos)+.68,slot,amount:chainDamage(slot),kind:'ult',type:'art'});
 }
 events.push({time:fullTime()+.92,slot:b.first,amount:finisherDamage(),kind:'finisher',type:'art'});
 for(const hit of events){
  if(hit.type!=='art'&&hit.time>=b.linkAt&&hit.time<b.linkAt+11.2){
   hit.amount=Math.round(hit.amount*1.32);
  }
 }
 // The closing volley is arranged against the HP left when the guard breaks.
 // A manual strike in this window still lands at its own time and can finish the fight early.
 const leftAtBreak=Math.max(0,maximum-events.reduce((n,h)=>n+(h.time<brk?h.amount:0),0));
 const tail=[[.34,0,9],[.92,2,11],[1.57,1,9],[2.2,3,10],[2.86,0,10],[3.52,2,11],[4.14,1,9],[4.66,3,9],[5.25,0,22]];
 let allocated=0;
 tail.forEach(([delay,slot,percent],i)=>{
  const amount=i===tail.length-1?leftAtBreak-allocated:Math.floor(leftAtBreak*percent/100);
  allocated+=amount;
  const type=characters[G.team[slot]].e==='water'?'weak':i%3===0?'crit':'normal';
  events.push({time:brk+delay,slot,amount,kind:'basic',type});
 });
 const hits=[],contrib=[0,0,0,0];
 let hp=maximum;
 for(const hit of events.sort((a,b)=>a.time-b.time)){
  if(!hp)break;
  const amount=Math.min(hp,hit.amount);
  if(amount<=0)continue;
  hp-=amount;
  if(hit.kind==='finisher'){
   const assist=Math.floor(amount*.2);
   order.slice(1).forEach(slot=>contrib[slot]+=assist);
   contrib[order[0]]+=amount-assist*3;
  }else contrib[hit.slot]+=amount;
  hits.push({...hit,amount,hp,i:hits.length});
 }
 const hpAfter=time=>hits.findLast(h=>h.time<=time)?.hp??maximum;
 cachedLog={battle:b,revision:b.revision,hits,contrib,victory:hits.at(-1).time,
  atOver:hpAfter(b.overAt),atFracture:hpAfter(fullTime()+.92)};
 return cachedLog;
}
function battleModel(t){
 const b=G.battle,link=b.linkAt,over=b.overAt,chain=b.chainAt,brk=breakTime(),max=totalBossHP();
 const log=fightLog(),victory=log.victory,fracture=fullTime()+.92;
 const hp=log.hits.findLast(h=>h.time<=t)?.hp??max;
 const inChain=t>=chain&&t<Math.min(brk,victory),linking=t>=link&&t<link+11.2&&hp>0;
 const layerHP=max/4,layers=Math.ceil(hp/layerHP),layerFrac=hp>0?(hp-(layers-1)*layerHP)/layerHP:0;
 const linkVal=t<link?clamp((t-1.5)/(link-1.5)):linking?clamp(1-(t-link-.38)/10.82):0;
 const mode=t<over?clamp((max-hp)/Math.max(1,max-log.atOver)):t<fracture?
  clamp((hp-log.atFracture)/Math.max(1,log.atOver-log.atFracture)):0;
 const phase=t<1.9?'首领接近':!hp?'目标沉默':t>=fracture?'破防':t>=over?'超载':linking?'连携时刻':'交战';
 return {t,hp,max,layers,layerFrac,linkVal,linking,mode,phase,over:t>=over&&t<fracture&&hp>0,broken:t>=fracture&&hp>0,inChain,brk,victory};
}
function note(text,t){G.battle.notice={text,time:t};}
function battleInput(kind,slot=0){
 if(G.screen!=='battle')return;
 const t=sceneAge(),b=G.battle,m=battleModel(t);
 b.revision++;
 if(t<1.9){note('正在识别首领信号',t);paint();return;}
 if(t>=m.victory){note('已完成作战目标',t);paint();return;}
 if(m.inChain){
  if(kind==='ult'){
   const pos=chainPosition(t),order=crewOrder(),requested=order.indexOf(slot);
   if(pos<3&&requested>pos){
    [order[pos+1],order[requested]]=[order[requested],order[pos+1]];
    b.order=order;b.queued[pos+1]=true;
    note(characters[G.team[slot]].name+' · 奥义接续确认',t);
   }else if(pos<3){
    note(characters[G.team[slot]].name+' · 奥义已释放',t);
   }else note('全员连锁已接续',t);
  }
  else note('连锁奥义展开中',t);
  paint();return;
 }
 if(kind==='skill'){
  const id=G.load[G.team[0]].skills[slot],left=skillInfo[id].cd-(t-skillHistory(t).times[slot]);
  if(left>.001){note('技能冷却 · '+left.toFixed(1)+' s',t);paint();return;}
  const amount=equippedSkillDamage(slot);
  b.actions.push({time:t,kind,slot,amount});
  if(t<b.linkAt)b.linkAt=Math.max(t+.05,b.linkAt-(id===1?.72:.32));
  if(t<b.overAt&&amount)b.overAt=Math.max(b.linkAt+2,t+.08,b.overAt-(id===3?.6:.27));
  note(characters[G.team[0]].skills[id]+' · 已发动',t);
 }else if(kind==='ult'){
  if(b.solo?.slots.some((s,i)=>s===slot&&b.solo.times[i]>t)){note('奥义已加入连锁',t);paint();return;}
  if(chargeAt(slot,t)<99.99){note('奥义充能 '+Math.floor(chargeAt(slot,t))+'%',t);paint();return;}
  const connect=b.solo&&t-b.solo.times.at(-1)<=2.25&&!b.solo.slots.includes(slot);
  if(!connect&&t>=b.overAt&&t<b.chainAt&&G.team.every((_,i)=>chargeAt(i,t)>=99.99)){
   b.chainAt=t;b.first=slot;b.solo=null;note('连锁奥义启动',t);
  }else{
   if(!connect)b.solo={slots:[],times:[],events:[]};
   const combo=b.solo,release=combo.times.length?Math.max(t,combo.times.at(-1)+1.16):t;
   const ev={time:release,kind:'ult',slot,amount:chainDamage(slot)};
   combo.slots.push(slot);combo.times.push(release);combo.events.push(ev);b.actions.push(ev);
   note(combo.slots.length===1?'奥义解放':combo.slots.length+'连锁 · 奥义接续',t);
   if(combo.slots.length===4){
    b.first=combo.slots[0];b.order=combo.slots.slice();b.chainTimes=combo.times.slice();b.chainAt=combo.times[0];b.openingUntil=t;
    combo.events.forEach(event=>event.chainCast=true);b.solo=null;
   }else b.chainAt=Math.max(b.chainAt,release+2.26);
  }
 }else{
  const last=b.actions.filter(x=>x.kind==='attack').at(-1);if(last&&t-last.time<.32)return;
  b.actions.push({time:t,kind:'attack',slot:0,amount:Math.round(growStats(G.team[0]).atk*(1.05+(b.manual%3)*.18))});b.manual++;
  if(t<b.linkAt)b.linkAt=Math.max(t+.07,b.linkAt-.065);
 }
 paint();
}
const hitDrawing=sv('0 0 360 360','<g class="slash-strokes"><path d="M14 271Q164 190 339 69 227 161 33 271l100-60z" fill="currentColor"/><path d="M26 291q134-80 259-167-135 106-259 167zM119 194l168-114-87 71z" fill="currentColor" opacity=".62"/></g><g class="hit-shards">'+Array.from({length:13},(_,i)=>'<g transform="rotate('+(i*31.7)+' 180 180)"><path d="m178 '+(81+i%3*7)+' 2 -'+(9+i%5*4)+' 2 '+(5+i%3)+'z" fill="currentColor"/><path d="M177 '+(91+i%4*4)+'l-2 -9" stroke="currentColor" stroke-width="1"/></g>').join('')+'</g>','impact-etch');
function burstSigil(element){
 const plates={
  wind:[4,solid('M109 31C167 7 237 30 261 89c-25-36-72-45-112-29l19-17-68 19 25-23zM274 79l9 14 3 13-12-13z')+stroke('M124 40c36-12 78-8 99 5M120 68c33-15 48-15 68-15')],
  fire:[6,solid('M127 60q9-20 4-35l18 15q10-16 3-32 28 16 23 34l12-11q12 17 2 36l-10-17-10 12q-2-12-11-19l-2 19-13-12z')+stroke('m190 28 12 14-3 16m-81-7 5-15')],
  water:[4,solid('M90 53q38-40 86-34 45 6 68 34-44-25-63-12-15 12-33 7 10-4 12-12-39-4-70 17z')+stroke('M108 58q33-24 52-19m26 13q23-11 50 7')+'<circle cx="242" cy="47" r="3" fill="currentColor"/>'],
  earth:[8,solid('m138 54 7-22 15-17 17 18 6 24-19-10-9 5-4-12-9 16zm21-28-7 12 9-5 9 7z')+stroke('m130 53 8-23 11-13m26 3 10 13')],
  dark:[3,solid('M90 45q52-46 119-18 24 10 39 32-37-31-76-18-36 12-65 14l22-15zM223 66l3-8 2 8 8 2-8 3-2 8-3-8-8-3z')+stroke('M100 60q20-1 39-10m44-20q20-2 34 6')],
  light:[8,solid('m160 7 8 30 15 13-18-2-5 15-5-15-18 2 15-13zm0 11-2 22 4 1z')+stroke('m144 37-4-10m33 10 6-11')]
 };
 const [count,mark]=plates[element];
 const sails=Array.from({length:count},(_,i)=>'<g transform="rotate('+i*360/count+' 160 160)">'+mark+'</g>').join('');
 return sv('0 0 320 320','<g class="finisher-ring">'+sails+'</g>'+radialTicks(160,160,137,142,120,5)+'<g fill="none" stroke="currentColor"><circle cx="160" cy="160" r="94" stroke-dasharray="61 10 3 9"/><circle cx="160" cy="160" r="82" stroke-width=".7"/></g><svg x="105" y="105" width="110" height="110" viewBox="0 0 24 24">'+glyphs[element]+'</svg>','burst-insignia');
}
const lockDial=(()=>{
 const lines=Array.from({length:4},(_,i)=>'<g transform="rotate('+90*i+' 210 210)"><path d="M77 112v-34h34" fill="none" stroke="#d9e0c8" stroke-width="2"/><path d="M77 93V78h16" fill="none" stroke="#f28c5e" stroke-width="4"/></g>').join('');
 return sv('0 0 420 420','<g fill="none" stroke="currentColor"><circle cx="210" cy="210" r="170" stroke-dasharray="2 7" opacity=".6"/><circle cx="210" cy="210" r="151" opacity=".5"/><circle cx="210" cy="210" r="132" stroke-dasharray="70 9 3 9" stroke-width="1.3"/><path d="M8 210h82m240 0h82M210 10v55m0 292v54" stroke-dasharray="6 4"/></g>'+radialTicks(210,210,157,164,120,10,'#8c9984')+lines,'lock-dial');
})();
function relayWindow(t){
 const b=G.battle;
 if(!b||t>=fightLog().victory)return null;
 if(t>=b.chainAt&&t<breakTime()){
  const order=crewOrder(),pos=chainPosition(t);
  const start=pos===4?fullTime():artTime(pos);
  const end=pos===4?breakTime():pos===3?fullTime():artTime(pos+1);
  return {order,pos,start,end,next:order[pos+1]??-1,locked:pos>=3,
   spent:order.slice(0,pos+1),reserved:b.queued[pos+1]?order[pos+1]:-1};
 }
 const solo=b.solo;
 if(!solo||t>solo.times.at(-1)+2.25)return null;
 const next=G.team.findIndex((_,slot)=>!solo.slots.includes(slot)&&chargeAt(slot,t)>=99.99);
 return {order:solo.slots,pos:solo.slots.length-1,start:solo.times.at(-1),end:solo.times.at(-1)+2.25,
  next,locked:false,spent:solo.slots.slice(),reserved:-1};
}
function relayDock(){
 const controls=G.team.map((id,slot)=>{
  const h=characters[id];
  return '<button class="relay-unit" '+attr('cast:'+slot)+' style="--ec:'+elementBright[h.e]+'">'+
   '<kbd>'+(slot+1)+'</kbd><span class="relay-crest">'+ico(h.e,28)+'</span>'+
   '<span><b>'+h.name+'</b><small></small></span></button>';
 }).join('');
 return '<div class="battle-lower relay-dock" hidden>'+
  '<div class="relay-clock"><div class="tactical-tag">'+ico('bolt',16)+'奥义接续 <small>CHAIN WINDOW</small></div>'+
  '<div class="relay-readout"><strong></strong><span><b></b> s</span></div>'+
  '<div class="relay-track"><i></i></div></div>'+
  '<div class="skill-hud"><div class="skill-caption"><span>接续队员</span><i></i><small>CHAIN ORDER</small></div>'+
  '<div class="relay-slots">'+controls+'</div></div></div>';
}
function paintRelay(t){
 const active=relayWindow(t),dock=screenEl.querySelector('.relay-dock');
 if(paintCache.relayOpen!==!!active){
  if(!active&&paintCache.relayOpen)dock.outerHTML=relayDock();
  else dock.hidden=!active;
  screenEl.querySelector('.battle-lower:not(.relay-dock)').hidden=!!active;
  screenEl.querySelector('.party-hud').inert=!!active;
  screenEl.querySelector('.target-display').inert=!!active;
  $('#footbar').innerHTML=footer();
  paintCache.relayOpen=!!active;
 }
 if(!active)return;
 const {start,end,next,spent,reserved,pos,locked}=active;
 const remaining=Math.max(0,end-t);
 dock.querySelector('.relay-readout strong').textContent=locked?(pos===4?'终结技发动':'全员接续完成'):'接续剩余';
 dock.querySelector('.relay-readout b').textContent=remaining.toFixed(2);
 dock.querySelector('.relay-track i').style.width=clamp(remaining/(end-start))*100+'%';
 dock.querySelectorAll('.relay-unit').forEach((el,i)=>{
  const used=spent.includes(i),ready=chargeAt(i,t)>=99.99;
  el.disabled=used||locked||!ready;
  el.classList.toggle('spent',used);
  el.classList.toggle('next',i===next);
  el.classList.toggle('reserved',i===reserved);
  const label=used?'已释放':i===reserved?'已确认接续':!ready?'充能 '+Math.floor(chargeAt(i,t))+'%':i===next?'下一位 · 接续':'可接续';
  el.querySelector('small').textContent=label;
  el.setAttribute('aria-label',characters[G.team[i]].name+'，'+label);
 });
}
function battlePage(){
 const q=currentQuest(),h=characters[G.team[0]],l=G.load[G.team[0]];
 return '<section class="screen-content battle-page"><div class="field-grid"></div><div class="battle-heading"><div class="tactical-tag">'+ico('hunt',16)+'作战目标 <small>OBJECTIVE</small></div><h2>'+q[0]+'</h2><p>'+ico('pin',13)+q[2]+'</p></div><div class="boss-panel"><div class="boss-name"><span class="boss-fire">'+ico('fire',24)+'</span><div><small>ABYSSAL BEAST / 天渊兽</small><b>焰冠龙 伊格瑞斯</b></div><span class="boss-lv">Lv. '+[28,46,65,82][G.diff]+'</span><span class="weak-tag">'+ico('water',13)+'弱点 · 水</span></div><div class="boss-health"><i id="bossFill"></i><span></span></div><div class="boss-data"><span id="hpCount"></span><div class="layer-count" id="hpLayers"></div></div><div class="mode-line"><b id="modeName">模式槽</b><span><i id="modeFill"></i></span><small>MODE</small></div></div><div class="battle-time"><span>'+ico('clock',14)+'作战时间</span><b id="fightTimer">00:00</b></div><div class="party-hud">'+G.team.map((id,i)=>{const c=characters[id],s=growStats(id);return '<button class="member-hud '+(!i?'controlled':'')+'" style="--ec:'+elementBright[c.e]+'" '+attr('cast:'+i)+' title="释放'+c.name+'的奥义"><span class="member-crest">'+ico(c.e,26)+'</span><span class="member-body"><span class="member-title"><strong>'+c.name+'</strong><small>Lv.'+s.level+'</small><em>'+(!i?'操作':'AI')+'</em></span><span class="member-life"><i></i></span><span class="member-numbers"><b></b> / '+nfmt(s.hp)+'</span><span class="member-charge"><i></i></span><span class="charge-label">奥义 <b></b></span></span></button>';}).join('')+'</div><button class="target-display" '+attr('attack')+' aria-label="攻击锁定目标"><div class="target-inner-disc"></div>'+lockDial+'<div class="target-crest"><span class="crest-shard left">'+dragonArt+'</span><span class="crest-shard right">'+dragonArt+'</span></div><div class="target-coordinate">IG — 01</div><span class="target-label">'+ico('cross',13)+'目标锁定 / LOCKED</span><div id="impactRing"></div><div id="hitFX">'+hitDrawing+'</div><div id="damageField"></div></button><div class="right-hud"><div class="link-dial"><svg viewBox="0 0 124 124" aria-hidden="true"><circle class="link-track" cx="62" cy="62" r="51"/><circle id="linkRing" cx="62" cy="62" r="51"/>'+radialTicks(62,62,56,60,60,5,'#849178')+'</svg><div><small>LINK</small><b id="linkNum">0<i>%</i></b></div></div><strong id="linkName">队伍连携</strong><span id="buffName">联合战术待命</span></div><div class="battle-lower"><div class="control-hud"><div class="tactical-tag">'+ico(h.e,16)+'操作角色 <small>'+h.en+'</small></div><div class="control-line"><b>'+h.name+'</b><span>'+h.gear+'</span></div><button class="ult-trigger" '+attr('cast:0')+'><kbd>Q</kbd><span>奥义 · '+h.ult+'</span><b id="ultText"></b></button></div><div class="skill-hud"><div class="skill-caption"><span>技能配置</span><i></i><small>ABILITY DECK</small></div><div class="ability-slots">'+l.skills.map((sid,i)=>'<button class="ability" '+attr('skill:'+i)+'><kbd>'+String(i+1)+'</kbd><div class="ability-symbol">'+ico(skillInfo[sid].icon,31)+'<i></i></div><div class="ability-label"><b>'+h.skills[sid]+'</b><small>可用</small></div></button>').join('')+'</div></div></div>'+relayDock()+'<div id="battleNotice"></div><div id="battleFX"></div></section>';
}
function battleHits(t){
 return fightLog().hits.filter(h=>h.type!=='art'&&h.time<=t&&t-h.time<1.05).slice(-3);
}
function cutBody(slot,pos,solo,sequence=crewOrder()){
 const id=G.team[slot],h=characters[id],order=sequence;
 return '<div class="ult-cut" style="--cut:'+elementBright[h.e]+'"><div class="cut-streaks"></div><div class="cut-medal">'+ico(h.e,190)+'</div><div class="cut-weapon">'+weaponArt(h.w)+'</div><div class="cut-copy"><div class="cut-tag"><i></i>'+(solo||pos===0?'奥义解放':'连锁奥义')+' <small>SKYBOUND ART</small></div><div class="cut-caster">'+ico(h.e,19)+h.name+' <i></i> '+elementNames[h.e]+'属性</div><h1>'+h.ult+'</h1><div class="cut-damage"><small>奥义伤害</small><b>'+nfmt(chainDamage(slot))+'</b></div></div><div class="cut-chain"><small>'+(solo?'ART':'CHAIN')+'</small><b>'+String(solo?1:pos+1).padStart(2,'0')+'</b><span>'+(solo?'单体奥义':'/ 04')+'</span></div><div class="chain-members">'+(solo?'<span class="lit">'+h.name+'</span>':order.map((p,i)=>'<span class="'+(i<=pos?'lit':'')+'">'+ico(characters[G.team[p]].e,12)+characters[G.team[p]].name+'</span>').join(''))+'</div></div>';
}
function fullBody(){
 const e=characters[G.team[G.battle.first]].e;
 return '<div class="full-cut" style="--cut:'+elementBright[e]+'"><div class="full-orbit">'+burstSigil(e)+'</div><div class="full-content"><span class="cut-tag">'+ico('star',11)+' FOURFOLD CHAIN BURST '+ico('star',11)+'</span><h1>全员连锁</h1><div class="finish-name">'+ico(e,24)+elementNames[e]+'属性终结技 <b>'+finisherNames[e]+'</b></div><div class="chain-total"><span>连锁总伤害<small>TOTAL DAMAGE</small></span><b id="chainTotal"></b></div></div><div class="full-party">'+crewOrder().map(i=>'<span>'+ico(characters[G.team[i]].e,16)+characters[G.team[i]].name+'</span>').join('')+'</div></div>';
}
const brokenShield=sv('0 0 80 80',
 '<g class="shield-left"><path d="M9 16Q27 15 39 6l-5 22 6 3-13 13 6 1-7 16Q11 51 9 36z" fill="currentColor"/><path d="M16 22q10-1 16-6l-2 6-10 4 3 17-6-9z" fill="#5c5336"/></g>'+
 '<g class="shield-right"><path d="m47 8-5 21 7 2-13 12 7 2-11 19 8 7q28-17 29-38V17q-9 0-22-9z" fill="currentColor"/><path d="m57 25 5 2-1 13-5 9 2-15z" fill="#5c5336"/></g>'+
 '<path d="m16 61-5 8 2-9zm37-53 6-6-2 7zm0 58 9 4-6 2z" fill="currentColor"/>','fractured-shield');
function bannerBody(key){
 const data={intro:['TARGET IDENTIFIED','天渊兽 · 焰冠龙','伊格瑞斯','fire'],link:['LINK TIME','连携时刻','全队强化 · 攻击增幅 / 敌方减速','trace'],over:['WARNING / OVERDRIVE','首领超载','模式槽反转 · 集中压制','fire'],break:['MODE BREAK','破防','防御崩解 · 目标无法行动','shield'],victory:['TARGET NEUTRALIZED',clearWord(),'作战结束 · 返航许可','laurel']};
 const [en,zh,sub,sym]=data[key];
 return '<div class="combat-banner banner-'+key+'"><div class="banner-emblem">'+(key==='break'?brokenShield:ico(sym,64))+'</div><div><small>'+en+'</small><h2>'+zh+'</h2><p>'+sub+'</p></div><div class="banner-stripes"></div></div>';
}
function paintFX(m){
 const t=m.t,b=G.battle;let key='',age=0,htmlFn=()=>'',len=2;
 const recent=b.solo?.times.findLastIndex(at=>at<=t)??-1;
 if(m.inChain){
  const pos=chainPosition(t);
  if(pos<4){
   key='cut'+pos+crewOrder().join('');age=t-artTime(pos);len=(pos===3?fullTime():artTime(pos+1))-artTime(pos);
   htmlFn=()=>cutBody(crewOrder()[pos],pos,false);
  }else{key='full';age=t-fullTime();len=FULL_CUT;htmlFn=fullBody;}
 }else if(recent>=0&&t-b.solo.times[recent]<CUT){
  key='solo'+b.solo.times[recent];age=t-b.solo.times[recent];len=CUT;
  htmlFn=()=>cutBody(b.solo.slots[recent],recent,recent===0,b.solo.slots);
 }
 else{
  const mks=[['victory',m.victory,2.35],['break',m.brk,2.1],['over',b.overAt,1.9],['link',b.linkAt,1.8],['intro',0,2.35]];
  for(const [k,at,d] of mks)if(t>=at&&t<at+d){key=k;age=t-at;len=d;htmlFn=()=>bannerBody(k);break;}
 }
 const el=$('#battleFX');
 if(paintCache.fx!==key){el.removeAttribute('style');el.innerHTML=htmlFn();paintCache.fx=key;}
 if(key){
  const u=ease(age/.22),out=clamp((len-age)/.18);
  el.style.setProperty('--cut-in',u.toFixed(3));el.style.setProperty('--cut-out',out.toFixed(3));el.style.setProperty('--cut-age',age.toFixed(4));el.style.setProperty('--impact',clamp((age-.6)/.19).toFixed(3));el.style.setProperty('--cut-rise',((1-u)*30).toFixed(2)+'px');el.style.setProperty('--streak-x',(age*33).toFixed(2)+'px');
  if(key==='break')el.style.setProperty('--shield-part',(ease(age/.55)*4.7).toFixed(2)+'px');
  if(key==='full'){
   const e=characters[G.team[b.first]].e;
   const turn={wind:92,fire:34,water:-62,earth:16,dark:-48,light:39}[e];
   el.style.setProperty('--sigil-turn',(ease(age/2.5)*turn)+'deg');
   el.style.setProperty('--burst-flash',(age>=.83&&age<1.3?Math.sin(clamp((age-.83)/.47)*Math.PI)*.28:0).toFixed(3));
   $('.chain-total').style.opacity=ease((age-.95)/.27);
   $('#chainTotal').textContent=nfmt(totalChain()*ease((age-.96)/1.2));
  }
 }
}
function paintBattle(){
 const m=battleModel(sceneAge()),t=m.t,b=G.battle,hist=skillHistory(t),l=G.load[G.team[0]],root=screenEl.firstElementChild;
 root.style.setProperty('--fracture-distance',(t>=m.brk?ease((t-m.brk)/.44)*8.5:0).toFixed(2)+'px');
 const lockState=m.hp===0?'目标沉默 / CLEAR':m.broken?'破防锁定 / EXPOSED':'目标锁定 / LOCKED';
 if(lockState!==paintCache.lockState){$('.target-label').innerHTML=ico('cross',13)+lockState;paintCache.lockState=lockState;}
 root.classList.toggle('overdrive',m.over);root.classList.toggle('linked',m.linking);root.classList.toggle('broken',m.broken);
 $('#fightTimer').textContent=tfmt(t);$('#bossFill').style.width=m.layerFrac*100+'%';
 $('#hpCount').textContent='HP '+nfmt(m.hp)+' / '+nfmt(m.max);
 if(paintCache.layers!==m.layers){$('#hpLayers').innerHTML=[0,1,2,3].map(i=>'<i class="'+(i<m.layers?'filled':'')+'"></i>').join('')+'<b>× '+m.layers+'</b>';paintCache.layers=m.layers;}
 $('#modeName').textContent=m.over?'超载':m.broken?'破防':'模式槽';$('#modeFill').style.width=m.mode*100+'%';
 const ring=$('#linkRing');ring.style.strokeDashoffset=320.45*(1-m.linkVal);
 $('#linkNum').innerHTML=Math.round(m.linkVal*100)+'<i>%</i>';$('#linkName').textContent=m.linking?'连携时刻':'队伍连携';$('#buffName').textContent=m.linking?'ATK ↑ · 全员强化':m.broken?'破防 · 伤害增幅':'联合战术待命';
 const heal=hist.history.filter(h=>l.skills[h.slot]===2).length;
 const engaged=Math.min(t,b.chainAt);
 const enemyClock=engaged-.52*clamp(engaged-b.linkAt,0,11.2)+.48*Math.max(0,engaged-b.overAt);
 $$('.member-hud',root).forEach((el,i)=>{const s=growStats(G.team[i]),q=chargeAt(i,t),loss=Math.max(0,Math.floor((enemyClock-2-i*.6)/1.8))*(151+i*49),hp=Math.min(s.hp,s.hp-loss+(i===0?Math.round(s.hp*.12*heal):0));
  el.querySelector('.member-life i').style.width=hp/s.hp*100+'%';el.querySelector('.member-numbers b').textContent=nfmt(hp);
  el.querySelector('.member-charge i').style.width=q+'%';el.querySelector('.charge-label b').textContent=q>=99.99?'就绪':Math.floor(q)+'%';el.classList.toggle('ready',q>=99.99);
 });
 const q=chargeAt(0,t);$('#ultText').textContent=q>=99.99?'就绪':Math.floor(q)+'%';$('.ult-trigger').classList.toggle('ready',q>=99.99);
 $$('.ability',root).forEach((el,i)=>{const cd=skillInfo[l.skills[i]].cd,left=Math.max(0,cd-(t-hist.times[i]));
  el.classList.toggle('cooling',left>0);el.classList.toggle('recharged',t-hist.times[i]>=cd&&t-hist.times[i]<cd+.8);el.querySelector('.ability-symbol i').style.height=left/cd*100+'%';el.querySelector('.ability-label small').textContent=left>0?'冷却 '+left.toFixed(1)+' s':(el.classList.contains('recharged')?'冷却完成':'技能就绪');
 });
 const hits=battleHits(t);let dmg='';
 for(const hit of hits){
  const age=t-hit.time,entry=ease(age/.12),fade=clamp((1.05-age)/.38);
  const [x,y]=[[16,130],[279,115],[151,273]][hit.i%3];
  const typeLabel={normal:'命中',crit:'暴击 / CRIT',weak:'弱点 / WEAK'}[hit.type];
  const caption=characters[G.team[hit.slot]].name+' · '+typeLabel;
  dmg+='<span class="damage '+hit.type+'" style="left:'+x+'px;top:'+(y-age*31)+
   'px;opacity:'+(entry*fade)+';transform:scale('+(1+.16*(1-entry))+') rotate(-5deg)">'+
   '<small>'+caption+'</small>'+nfmt(hit.amount)+'</span>';
 }
 $('#damageField').innerHTML=dmg;const hit=hits.at(-1),imp=hit?clamp((t-hit.time)/.54):1;$('#impactRing').style.transform='scale('+(imp*.62+.55)+')';$('#impactRing').style.opacity=(1-imp)*.65;
 const hf=$('#hitFX'),impulse=hit?clamp((t-hit.time)/.43):1;
 hf.style.opacity=impulse<.19?impulse/.19:(1-impulse)/.81;
 hf.style.setProperty('--slash-scale',(.62+.48*ease(impulse)).toFixed(3));
 hf.style.setProperty('--shard-scale',(.3+1.25*ease(impulse)).toFixed(3));
 hf.style.setProperty('--slash-angle',((hit?.i||0)*47%160-65)+'deg');
 hf.style.color=hit?.type==='weak'?'#bce9e7':hit?.type==='crit'?'#ffc292':'#e9ead0';
 $('.target-crest').style.translate=(Math.sin(impulse*34)*(1-impulse)*4).toFixed(2)+'px '+(Math.cos(impulse*20)*(1-impulse)*2).toFixed(2)+'px';
 const nt=b.notice,notice=$('#battleNotice');notice.textContent=nt&&t-nt.time<1.6?nt.text:'';notice.style.opacity=nt?clamp((nt.time+1.6-t)/.25):0;
 paintFX(m);
 paintRelay(t);
}
/* Settlement is committed once per cleared sortie. Its presentation can be replayed independently. */
function beginResult(commit=false){
 G.resultOffset=0;
 if(G.result&&G.result.serial===G.missionSerial)return;
 const sec=commit?fightLog().victory:35.13;
 let contrib;
 if(commit)contrib=fightLog().contrib.slice();
 else{
  // A directory visit can preview a report before the first sortie.
  const weights=G.team.map((id,i)=>growStats(id).atk*[80,63,68,47][i]);
  const sum=weights.reduce((a,b)=>a+b,0);
  contrib=weights.map(w=>Math.round(totalBossHP()*w/sum));
  contrib[0]+=totalBossHP()-contrib.reduce((a,b)=>a+b,0);
 }
 const score=58+(teamPower()/currentQuest()[3]-.68)*97+Math.min(7,(G.battle?.manual||0)*.8)+(G.battle?.actions.filter(a=>a.kind==='skill').length||0)*.45;
 const exp=G.team.map((id,i)=>{const l=G.load[id],start=l.xp,level=characters[id].level+l.levelGain,gain=2340+Math.round(contrib[i]/350);if(commit){l.xp=(start+gain)%5000;l.levelGain+=Math.floor((start+gain)/5000);}return {start,level,gain};});
 G.result={serial:G.missionSerial,team:G.team.slice(),diff:G.diff,quest:G.quest,sec,contrib,exp,mvp:contrib.indexOf(Math.max(...contrib)),rank:score>=96?4:score>=87?3:score>=77?2:score>=69?1:0};
 if(commit){G.checkpoint='quest';save();}
}
function rankSeal(){
 let laurel='';
 for(let side of [-1,1])for(let i=0;i<8;i++){const deg=side*(44+i*8.3),a=deg*Math.PI/180,x=125+Math.sin(a)*81,y=103+Math.cos(a)*77;laurel+='<path transform="translate('+x+' '+y+') rotate('+(-deg+side*32)+')" d="M0 0q-10-8-5-23Q3-16 0 0z" fill="#807652"/>';}
 return sv('0 0 250 210','<g fill="none" stroke="#aca88d"><circle cx="125" cy="99" r="73"/><circle cx="125" cy="99" r="68" stroke-dasharray="2 5"/><path d="M125 18v18m0 129v15M35 99h18m144 0h18"/></g>'+radialTicks(125,99,63,66,90,5,'#8a8266')+laurel+'<path d="m51 183 52-18 22 6 23-6 51 18-35-3-4 10-35-15-34 15-4-10z" fill="#807451"/>','rank-seal');
}
function resultPage(){
 const r=G.result,q=quests[r.diff][r.quest],ranks=['C','B','A','S','S+'];
 return '<section class="screen-content page-wrap result-page"><div class="result-head"><div>'+pageId('战果报告','QUEST COMPLETE')+'<h1>任务完成</h1></div><div class="result-quest"><span class="severity">'+difficulties[r.diff]+' / '+difficultyEN[r.diff]+'</span><b>'+q[0]+'</b><small>'+q[2]+'</small></div><div class="clear-time"><small>'+ico('clock',14)+'通关时间</small><b>'+tfmt(r.sec)+'<em>.'+String(Math.round((r.sec%1)*100)).padStart(2,'0')+'</em></b></div></div><div class="results-middle"><div class="grade-card"><div class="field-head">综合评价<small>RANK</small></div><div class="grade-medal">'+rankSeal()+'<strong id="gradeLetter">'+ranks[r.rank]+'</strong></div><div class="grade-scale">'+ranks.map((v,i)=>'<span class="'+(r.rank===i?'peak':'')+'">'+v+'</span>').join('')+'</div></div><div class="contribution"><div class="field-head">队员战绩<small>CREW CONTRIBUTION</small></div><div class="report-col"><span>出击队员</span><span>贡献伤害</span><span>经验成长</span></div>'+r.team.map((id,i)=>{const c=characters[id];return '<div class="report-row" style="--ec:'+elementColors[c.e]+'"><div class="report-unit"><i>'+ico(c.e,21)+'</i><b>'+c.name+'</b>'+(r.mvp===i?'<em>MVP</em>':'')+'</div><div class="report-damage"><b></b><div><i style="width:0%"></i></div></div><div class="report-exp"><span></span><b></b><div><i></i></div></div></div>';}).join('')+'</div></div><div class="spoils-title"><div class="field-head">委托报酬<small>REWARD CHESTS</small></div><button class="skip-results" '+attr('skipResult')+'>'+ico('fast',13)+'跳过演出 <kbd>Space</kbd></button></div><div class="chests">'+[['航行铜币','1,200','coin'],['天渊结晶','3','crystal'],[q[5],'1',q[6]]].map(([n,num,ic],i)=>'<button class="chest-card r'+i+'" data-loot="'+ic+'" '+attr('chest:'+i)+'><div class="box-draw"></div><div class="box-label"><small>'+rareNames[i]+'宝箱 / '+['BRONZE','SILVER','GOLD'][i]+'</small><div class="box-loot">'+ico(ic,17)+'<b>'+n+'</b><span>×'+num+'</span></div><em>封存中</em></div><i class="treasure-flash"></i>'+(i===2?'<span class="gold-sparks" aria-hidden="true">'+'<i></i>'.repeat(14)+'</span>':'')+'</button>').join('')+'</div><div class="result-actions">'+smallButton('toQuests','返回任务柜台','back')+actionButton('retry','再来一次')+'</div></section>';
}
function paintResult(){
 const r=G.result,t=sceneAge()+G.resultOffset;const rank=ease((t-.33)/.8),letter=$('#gradeLetter');
 letter.textContent=['C','B','A','S','S+'][Math.min(r.rank,Math.floor(clamp((t-.33)/.68)*4))];letter.style.opacity=rank;letter.style.transform='translate(-50%,-50%) scale('+(1.65-rank*.65)+') rotate(-9deg)';$('.grade-scale').style.opacity=ease((t-.8)/.5);
 $$('.report-row',screenEl).forEach((el,i)=>{const u=ease((t-.55-i*.23)/.8),ex=r.exp[i],p=clamp((t-1.7-i*.15)/1.7),v=ex.start+Math.round(p*ex.gain);
  el.style.opacity=u;el.style.translate=((1-u)*19)+'px 0';el.querySelector('.report-damage b').textContent=nfmt(r.contrib[i]*u);el.querySelector('.report-damage i').style.width=(r.contrib[i]/Math.max(...r.contrib)*u*100)+'%';
  el.querySelector('.report-exp span').textContent='Lv. '+(ex.level+Math.floor(v/5000))+(v>=5000?' ↑ 升级':'');el.querySelector('.report-exp b').textContent='+'+nfmt(ex.gain*p)+' EXP';el.querySelector('.report-exp i').style.width=(v%5000)/50+'%';
 });
 $$('.chest-card',screenEl).forEach((el,i)=>{const a=t-[3,4.45,5.9][i],u=ease(a/(i===2?.85:.6));
  const key='chest'+i,step=Math.round(u*100);if(paintCache[key]!==step){el.querySelector('.box-draw').innerHTML=chestArt(i,step/100,el.dataset.loot);paintCache[key]=step;}
  if(i===2){
   el.querySelectorAll('.gold-sparks i').forEach((spark,k)=>{
    const v=clamp((a-.16-k%5*.051)/1.02),rise=Math.sin(v*Math.PI);
    spark.style.opacity=rise.toFixed(3);
    spark.style.transform='translate('+((k*31%142-66)*v)+'px,'+(-rise*(37+k%4*11)-v*14)+'px) rotate('+(45+k*10+v*61)+'deg) scale('+(rise*(k%3===0?1.3:.75))+')';
   });
  }
  el.classList.toggle('opened',u>.35);el.style.setProperty('--treasure-sweep',((clamp(a/(i===2?1.35:.7))-.5)*180)+'%');el.querySelector('.box-loot').style.opacity=ease((a-.16)/.5);el.style.setProperty('--glow',String(a>0?Math.sin(clamp(a/(i===2?1.35:.7))*Math.PI)*.85:0));el.querySelector('.box-label em').textContent=u>.35?'已领取':'封存中';
 });
 const revealed=t>=7.9;
 $('.skip-results').style.visibility=revealed?'hidden':'visible';
 if(revealed!==paintCache.reportRevealed){$('#footbar').innerHTML=footer();paintCache.reportRevealed=revealed;}
}

