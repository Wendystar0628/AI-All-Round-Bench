'use strict';
const $=q=>document.querySelector(q);
const $$=(q,root=document)=>Array.from(root.querySelectorAll(q));
const deck=$('#deck'),screenEl=$('#screen'),overlayEl=$('#overlay');
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=x=>1-Math.pow(1-clamp(x),3);
const nfmt=x=>Math.round(x).toLocaleString('en-US');
const tfmt=x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(Math.floor(x%60)).padStart(2,'0');
const attr=(name)=>'data-action="'+name+'"';
const actionButton=(action,label,orange=false)=>'<button class="act-btn '+(orange?'orange':'')+'" '+attr(action)+'><span>'+label+'</span><span class="act-tail">'+ico('arrow',21)+'</span></button>';
const smallButton=(action,label,icon='')=>'<button class="small-btn" '+attr(action)+'>'+(icon?ico(icon,15):'')+label+'</button>';
const pageId=(zh,en)=>'<div class="page-id"><b>'+zh+'</b><span class="sep">/</span>'+en+'</div>';
const eTag=(e,size=17)=>'<span class="element-tag" style="--elem:'+elementColors[e]+'">'+ico(e,size)+elementNames[e]+'属性</span>';
const keys=(key,text)=>key==='Esc'?'<button class="hint key-back" '+attr('back')+'><kbd>Esc</kbd>'+text+'</button>':'<span class="hint"><kbd>'+key+'</kbd>'+text+'</span>';
function freshGame(){return {t:0,screen:'title',since:0,modal:null,modalParent:null,modalSince:0,swap:null,menu:false,menuIndex:0,diff:2,quest:1,team:[0,1,2,3],load:initLoadout(),slot:0,tab:'skills',pick:-1,candidate:null,preview:null,story:0,lineSince:0,full:false,auto:false,fast:false,term:'',termPinned:false,feedback:null,checkpoint:'story',sound:true,volume:55,speed:1,battle:null,result:null,resultOffset:0,missionSerial:0};}
const G=freshGame();
let exporting=false,enterItems=[],renderedAt=0,modalItems=[],lastFrame=null,paintCache={},soundCtx=null;
function growStats(id,preview=false){
 const h=characters[id], l=G.load[id];
 const s={atk:h.atk,hp:h.hp,crit:h.crit,power:h.power,level:h.level+l.levelGain};
 const sk=l.skills.slice(),sg=l.sigils.slice();
 if(preview&&G.pick>=0&&G.preview!==null){(G.tab==='skills'?sk:sg)[G.pick]=G.preview;}
 sk.forEach((v,i)=>{const picked=skillInfo[v],def=skillInfo[i];for(const k of ['atk','hp','crit'])s[k]+=picked[k]-def[k];});
 sg.forEach((v,i)=>{const picked=sigils[v],def=sigils[[0,1,0][i]];for(const k of ['atk','hp','crit'])s[k]+=picked[k]-def[k];});
 s.atk+=l.levelGain*26;s.hp+=l.levelGain*84;
 s.power+=Math.round((s.atk-h.atk)*1.7+(s.hp-h.hp)*.12+(s.crit-h.crit)*23);
 return s;
}
const teamPower=()=>G.team.reduce((sum,id)=>sum+growStats(id).power,0);
const currentQuest=()=>quests[G.diff][G.quest];
const sceneAge=()=>Math.max(0,G.t-G.since);
function fit(){let s=Math.min(innerWidth/1440,innerHeight/810);deck.style.transform='scale('+s+')';}
addEventListener('resize',fit);fit();
$('#paperMap').innerHTML=atlasMap;
function ping(type='click'){
 if(!G.sound||exporting||!G.volume)return;
 try{
  soundCtx=soundCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(soundCtx.state==='suspended')soundCtx.resume().catch(()=>{});
  const at=soundCtx.currentTime, o=soundCtx.createOscillator(),g=soundCtx.createGain();
  const tones={click:[580,800,.065],back:[440,270,.08],confirm:[460,820,.14],strike:[155,42,.16],burst:[240,520,.27]};
  const [a,b,d]=tones[type]||tones.click;o.type=type==='strike'?'triangle':'sine';o.frequency.setValueAtTime(a,at);o.frequency.exponentialRampToValueAtTime(b,at+d);g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(.045*G.volume/100,at+.012);g.gain.exponentialRampToValueAtTime(.0001,at+d);o.connect(g);g.connect(soundCtx.destination);o.start(at);o.stop(at+d+.02);
 }catch(e){}
}
function save(){if(exporting)return;try{localStorage.setItem('morningstar.atlas.v1',JSON.stringify({team:G.team,load:G.load,diff:G.diff,quest:G.quest,checkpoint:G.checkpoint,sound:G.sound,speed:G.speed,volume:G.volume}));}catch(e){}}
function restore(){try{
 const s=JSON.parse(localStorage.getItem('morningstar.atlas.v1')||'null');if(!s)return;
 if(Array.isArray(s.team)&&s.team.length===4&&new Set(s.team).size===4&&s.team.every(i=>Number.isInteger(i)&&characters[i])&&Array.isArray(s.load)&&s.load.length===6&&s.load.every(l=>l.skills?.length===4&&l.skills.every(i=>skillInfo[i])&&l.sigils?.length===3&&l.sigils.every(i=>sigils[i])&&Number.isFinite(l.xp)&&Number.isInteger(l.levelGain))) {
  G.team=s.team;G.load=s.load;
 }
 if(difficulties[s.diff]&&quests[s.diff][s.quest]){G.diff=s.diff;G.quest=s.quest;}
 if(['story','quest','party'].includes(s.checkpoint))G.checkpoint=s.checkpoint;
 G.sound=s.sound!==false;G.volume=clamp(Number(s.volume??55),0,100);G.speed=[.65,1,1.6].includes(s.speed)?s.speed:1;
 }catch(e){}}
function header(){
 return '<div class="brand">'+ico('wing',44,'wing-icon')+'<strong>晨星号</strong><span class="brand-split"></span><span class="brand-id"><b>MORNINGSTAR</b><small>AIRSHIP NAVIGATION SYSTEM</small></span></div><div class="top-tools"><button class="sound-trigger" title="'+(G.sound?'关闭':'开启')+'界面音效" aria-label="'+(G.sound?'关闭':'开启')+'界面音效" '+attr('sound')+'>'+ico(G.sound?'audio':'mute',18)+'</button><i class="divider"></i><button class="directory-trigger" '+attr('directory')+'>'+ico('grid',14)+'界面目录<kbd>F1</kbd></button></div>';
}
function footer(){
 let tips=keys('↑ ↓ ← →','选择')+keys('Enter','确认')+keys('Esc','返回');
 if(G.screen==='battle'){
  tips=relayWindow(sceneAge())?
   keys('1 – 4','选择接续队员')+keys('Q','顺序接续')+keys('Esc','撤回'):
   keys('1 – 4','技能')+keys('Q','奥义')+keys('Space','攻击')+keys('Esc','撤回');
 }
 if(G.screen==='story')tips=keys('Enter','推进对话')+keys('A','自动')+keys('Esc','返回');
 if(G.screen==='result')tips=(sceneAge()+G.resultOffset<7.9?keys('Space','跳过演出'):'')+keys('Enter','确认')+keys('Esc','返回');
 return '<div class="sys-status"><i></i>航行系统在线<small>SYSTEM ONLINE</small></div><div class="keyhelp">'+tips+'</div>';
}
let departing=null,departTime=0;
function clearPageTurn(){if(departing){departing.remove();departing=null;}}
function startPageTurn(){
 clearPageTurn();
 const old=screenEl.firstElementChild;
 if(!old)return;
 departing=document.createElement('div');
 departing.className='departing-sheet '+(deck.classList.contains('dark-scene')?'departing-dark':'');
 if(G.screen==='chapter')departing.classList.add('departing-full');
 departing.inert=true;departing.setAttribute('aria-hidden','true');
 deck.insertBefore(departing,$('#feedback'));departing.append(old);
 // The outgoing sheet remains visible only during the diagonal page wipe.
 old.querySelectorAll('[data-action]').forEach(el=>el.removeAttribute('data-action'));
 old.querySelectorAll('[id]').forEach(el=>{
  if(el.closest('svg'))return;
  if(['battleFX','battleNotice','damageField','impactRing'].includes(el.id)){
   const style=getComputedStyle(el);
   for(const k of ['position','inset','pointerEvents','zIndex','width','height'])el.style[k]=style[k];
  }
  el.removeAttribute('id');
 });
 departTime=G.t;
}
function go(name,offset=0){
 const cleared=G.screen==='battle'&&G.battle&&sceneAge()>=fightLog().victory;
 startPageTurn();
 G.termPinned=false;G.feedback=null;G.modal=null;G.modalParent=null;G.swap=null;G.screen=name;G.since=G.t-offset;G.term='';G.pick=-1;G.candidate=null;G.preview=null;
 if(name==='title'){G.menu=false;G.menuIndex=0;}
 if(name==='story'){G.story=0;G.lineSince=G.t;G.auto=false;G.fast=false;G.full=false;}
 if(name==='detail')G.tab='skills';
 if(name==='battle')beginBattle();
 if(name==='result')beginResult(cleared);
 if(['story','quest','party'].includes(name)){G.checkpoint=name;save();}
 const active=document.activeElement;if(active instanceof HTMLElement)active.blur();render();
}
function render(){
 const id=document.activeElement?.getAttribute?.('data-action');
 const dark=G.screen==='battle'||G.screen==='chapter';
 deck.className=(dark?'dark-scene ':'')+(exporting?'exporting ':'')+'scene-'+G.screen;
 $('#topbar').innerHTML=header();$('#footbar').innerHTML=footer();
 const pages={title:titlePage,story:storyPage,chapter:chapterPage,quest:questPage,party:partyPage,detail:detailPage,battle:battlePage,result:resultPage};
 screenEl.innerHTML=pages[G.screen]();
 paintCache={};renderedAt=G.t;enterItems=$$('[data-in],[data-new]',screenEl);
 renderModal();if(id&&!exporting&&G.screen!=='title'){const next=(G.modal?overlayEl:screenEl).querySelector('[data-action="'+id+'"]');if(next)next.focus({preventScroll:true});}
 paint();
}
function titlePage(){
 const menu=G.menu?'<div class="main-menu" data-new="0">'+[['continue','继续游戏','CONTINUE','play'],['new','新游戏','NEW GAME','compass'],['settings','设置','SETTINGS','sliders']].map((v,i)=>'<button class="menu-choice '+(i===G.menuIndex?'selected':'')+'" '+attr(v[0])+'>'+ico(v[3],17)+'<span><b>'+v[1]+'</b><small>'+v[2]+'</small></span></button>').join('')+'</div>':'<button class="start-button" '+attr('start')+'><i class="start-symbol"></i><span><strong>按任意键开始</strong><small>PRESS ANY KEY</small></span><span class="go">'+ico('arrow',23)+'</span></button>';
 return '<section class="screen-content title-page"><div class="reg-mark reg-a"></div><div class="reg-mark reg-b"></div><div class="title-topline">'+pageId('舰桥主控','TITLE SCREEN')+'<div class="sheet-no">NAV. CHART &nbsp; 01 / 07</div></div><div class="title-left"><div class="archive-id" data-in="0.03"><span class="vol">VOL. I</span><i></i><strong>空行者航行志</strong></div><h1 class="wordmark" data-in="0.10"><span class="first">浮空群岛</span><span class="second">传说<span class="seal" aria-hidden="true">群島</span></span></h1><div class="title-sub" data-in="0.30">Legend of the Floating Isles</div></div><div class="title-actions" data-in=".36">'+menu+'</div><div class="title-illustration" data-in=".12">'+instrument+'<div class="plate-small">N 24° 17′<br>E 108° 42′</div><img src="airship.svg" class="ship-figure" alt="晨星号飞空艇舷侧识别图"><svg class="callouts" viewBox="0 0 678 545" fill="none" aria-hidden="true"><path d="m407 388 76 82h60" stroke="#737969" stroke-width=".9"/><circle cx="407" cy="388" r="3" fill="#3e4839"/><path d="M44 172h34l34 30" stroke="#868d7b"/><path d="M38 165h26m-26 3h16" stroke="#868d7b" stroke-width="1.3"/></svg><div class="plate-tag"><span>FIG. 01</span><b>飞空艇 · 晨星号</b><small>STARBOARD ELEVATION</small></div></div><div class="flight-strip" data-in=".42"><div class="route-data"><div class="field-label">当前航线<small>FLIGHT ROUTE</small></div><span class="route-node"><i class="filled"></i>晨星港</span><span class="route-line">'+ico('wing',20)+'</span><span class="route-node"><i></i>火山岛</span></div><div class="flight-field"><div class="field-label">巡航高度<small>ALTITUDE</small></div><b>3,840<small>M</small></b></div><div class="flight-field"><div class="field-label">航向<small>HEADING</small></div><b>042°<small>NE</small></b></div><div class="flight-graph">'+sv('0 0 112 32','<path d="M0 27h112M0 17h112M0 7h112" stroke="#c2c7b8" stroke-dasharray="2 3"/><path d="m1 25 10-2 8-8 6 4 9-14 8 7 7-5 11 13 8-4 6 4 10-15 8 9 8-4 11 2" fill="none" stroke="currentColor" stroke-width="1.5"/>')+ico('compass',32,'comp')+'</div></div></section>';
}
function dialogueMarkup(){
 const parts=storyLines[G.story].text.split(/(「(?:空行者|天渊兽)」)/);
 let start=0;
 return parts.map(part=>{
  if(!part)return '';
  const at=start;start+=part.length;
  if(part.startsWith('「')){const word=part.slice(1,-1);return '<button class="term" data-at="'+at+'" data-length="'+part.length+'" '+attr('term:'+word)+'>'+word+ico('book',12)+'</button>';}
  return '<span data-at="'+at+'" data-text="'+part+'"></span>';
 }).join('')+'<i class="type-caret"></i>';
}
function storyPage(){
 const speaker=characters[storyLines[G.story].who];
 return '<section class="screen-content story-page"><div class="story-heading">'+pageId('舰桥通讯','BRIDGE COMMS')+'<h1 class="large-heading">越过云海</h1></div><div class="comm-status">'+ico('radio',15)+'舰内频道 · 已接通</div><div class="story-chart"><svg viewBox="0 0 1280 330" class="route-chart" aria-hidden="true"><defs><pattern id="cg" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M0 0h5m-5 0v5" stroke="#a9af9b" stroke-width="1"/></pattern></defs><rect x="0" y="0" width="1280" height="330" fill="url(#cg)"/><g fill="none" stroke="#9ba38e" stroke-width="1"><path d="M43 230 293 210 468 124 749 148 910 70 1144 72" stroke-dasharray="3 7"/><path d="m198 224 240-78 173 24 238-57 172-53" stroke="#484f43" stroke-width="1.6" stroke-dasharray="6 5"/><circle cx="198" cy="224" r="15"/><circle cx="1021" cy="60" r="24"/><circle cx="1021" cy="60" r="31" stroke-dasharray="2 5"/><circle cx="611" cy="170" r="7"/><path d="m192 224 6-6 6 6-6 6z" fill="#414a3c"/><path d="m1012 60 9-9 9 9-9 9z" fill="#e75b32" stroke="#e75b32"/></g></svg><div class="route-location from"><small>HOME PORT</small><b>晨星港</b></div><div class="route-location to"><small>DESTINATION</small><b>火山岛</b></div><div class="vessel-mark"><div class="vessel-disc"></div><img src="airship.svg" alt="晨星号航标"><span>MS–01 / 航行中</span></div><div class="chart-scale">0 <i></i> 50 NM</div></div><div class="dialog-box" data-in=".12" style="--elem:'+elementBright[speaker.e]+'"><div class="dialog-top"><span>'+ico('radio',17)+'舰桥通讯 <small>BRIDGE CHANNEL</small></span><div>'+smallButton('auto',(G.auto?'自动 · 开':'自动'),'play')+smallButton('fast',(G.fast?'快进 · 开':'快进'),'fast')+'</div></div><div class="dialog-speaker"><div class="speaker-icon">'+ico(speaker.e,45)+'</div><div><small>'+speaker.title+' / '+speaker.en+'</small><h2>'+speaker.name+'</h2></div></div><div id="spoken" class="spoken">'+dialogueMarkup()+'</div><button class="dialog-next" '+attr('nextLine')+'>继续 '+ico('chevron',13)+'</button><div id="termTip" class="term-tip"></div></div></section>';
}
function lineLength(){return G.full||G.fast?storyLines[G.story].text.length:Math.min(storyLines[G.story].text.length,Math.floor((G.t-G.lineSince)*24*G.speed));}
function paintStory(){
 const n=lineLength(),line=storyLines[G.story].text;
 const vessel=$('.vessel-mark');vessel.style.left=(30+G.story*7.5+Math.min(1,n/line.length)*1.8)+'%';
 if(paintCache.n!==n){
  for(const el of $$('#spoken [data-at]')){
   const count=Math.max(0,n-Number(el.dataset.at));
   if(el.classList.contains('term')){el.hidden=count<Number(el.dataset.length);continue;}
   const next=el.dataset.text.slice(0,count);if(el.textContent!==next)el.textContent=next;
  }
  $('#spoken .type-caret').hidden=n>=line.length;paintCache.n=n;
 }
 const box=$('#termTip');
 if(paintCache.tip!==G.term){box.innerHTML=G.term?'<div class="eyebrow">LEXICON / 航行辞典</div><b>'+G.term+'</b><p>'+glossary[G.term]+'</p><button '+attr('termClose')+' aria-label="关闭释义">'+ico('close',16)+'</button>':'';box.classList.toggle('open',!!G.term);paintCache.tip=G.term;}
}
function nextLine(force=false){
 if(G.term){G.term='';G.termPinned=false;paintStory();return;}
 if(!force&&!G.full&&lineLength()<storyLines[G.story].text.length){G.full=true;paintStory();return;}
 if(G.story<storyLines.length-1){G.story++;G.lineSince=G.t;G.full=false;render();}else go('chapter');
}
function chapterPage(){return '<section class="screen-content chapter-page"><div class="chapter-compass">'+instrument+'</div><div class="chapter-roman" data-in="0">I</div><div class="chapter-info" data-in=".15"><div class="chapter-line"></div><span>CHAPTER &nbsp; 01</span><h1>越过赤色云海</h1><em>Across the Crimson Sea</em><p>第一章 · 火山岛航线</p></div><button class="chapter-advance" '+attr('chapterNext')+'>启程 '+ico('arrow',20)+'</button></section>';}
function powerCompare(rec= currentQuest()[3]){
 const power=teamPower();return '<div class="power-compare"><div><span>队伍战力</span><strong>'+nfmt(power)+'</strong></div><i>/</i><div class="recommended"><span>推荐战力</span><b>'+nfmt(rec)+'</b></div><span class="power-state '+(power<rec?'below':'')+'">'+ico(power>=rec?'check':'bolt',14)+(power>=rec?'已达标':'高危挑战')+'</span></div>';
}
function rarityPips(tier){return '<span class="rarity-pips" aria-hidden="true">'+'<b></b>'.repeat(tier+1)+'</span>';}
function rewardChip(icon,name,tier,qty=''){
 return '<span class="reward-chip r'+tier+'" title="'+rareNames[tier]+'级 · '+name+'"><i>'+
  ico(icon,20)+rarityPips(tier)+'</i><span>'+name+(qty?'<small> ×'+qty+'</small>':'')+'</span></span>';
}
function questPage(){
 const q=currentQuest(), hard=G.diff, lvl=[28,46,65,82][hard];
 const tabs=difficulties.map((w,i)=>'<button class="diff-tab '+(hard===i?'active':'')+'" '+attr('diff:'+i)+'><i>'+('<b></b>'.repeat(i+1))+'</i>'+w+'</button>').join('');
 const cards=quests[hard].map((v,i)=>'<button class="mission-card '+(G.quest===i?'active':'')+'" '+attr('quest:'+i)+' data-in="'+(.03+i*.06)+'"><div class="mission-glyph">'+ico(questIcons[v[1]],29)+'</div><div class="mission-content"><div class="mission-type">'+v[1]+' <small>/ Q–'+(hard+1)+'0'+(i+1)+'</small></div><b>'+v[0]+'</b><div class="mission-meta">'+ico('pin',13)+v[2]+'</div><div class="mission-loot">'+ico(v[6],13)+v[5]+'</div></div><span class="mission-rec"><small>推荐战力</small>'+nfmt(v[3])+'</span><i class="mission-arrow">'+ico('chevron',13)+'</i></button>').join('');
 return '<section class="screen-content page-wrap quest-page"><div class="page-top"><div>'+pageId('委托管理','MISSION CONTROL')+'<h1 class="large-heading">任务柜台</h1></div><div class="head-aside">'+ico('log',19)+'委托档案 <span>QUEST ARCHIVE</span></div></div><div class="quest-layout"><div class="quest-list"><div class="difficulty-row">'+tabs+'</div><div class="list-eyebrow"><span>可用委托</span><small>03 CONTRACTS</small></div>'+cards+'</div><article class="contract corner-box" data-new="0"><div class="contract-art"><div class="beast-dial"></div><div class="monster-glyph">'+dragonArt+'</div><div class="file-mark">TARGET FILE &nbsp; / &nbsp; IG–01</div><div class="contract-title"><div class="threat-label"><i></i>天渊兽 · 首领情报</div><h2>焰冠龙 <span>伊格瑞斯</span></h2><p><span>Lv. '+lvl+'</span><b>'+ico('fire',15)+'火属性</b><b>'+ico('water',14)+'弱点 · 水</b></p></div></div><div class="contract-data"><div class="contract-number"><span>委托 Q–'+(hard+1)+'0'+(G.quest+1)+'</span><span class="severity">'+difficulties[hard]+' / '+difficultyEN[hard]+'</span></div><h2>'+q[0]+'</h2><div class="contract-location">'+ico('pin',14)+q[2]+'</div><div class="field-head">作战目标<small>OBJECTIVE</small></div><p class="objective">'+q[4]+'</p><div class="field-head">可能获得<small>REWARDS</small></div><div class="reward-row">'+rewardChip(q[6],q[5],Math.min(2,G.diff))+rewardChip('crystal','天渊结晶',1)+rewardChip('coin','航行币',0)+'</div><div class="contract-bottom">'+powerCompare()+actionButton('depart','出发',true)+'</div></div></article></div></section>';
}
function weaponPlate(h,i,showId=true){return '<div class="weapon-plate" style="--elem:'+elementColors[h.e]+'"><div class="weapon-rings"></div><div class="plate-dashes"></div><div class="plate-symbol">'+ico(h.e,73)+'</div>'+weaponArt(h.w)+(showId?'<span class="weapon-id">'+h.en+' &nbsp; / &nbsp; '+String(i+1).padStart(2,'0')+'</span>':'')+'</div>';}
function partyPage(){
 const q=currentQuest();
 const cards=G.team.map((id,i)=>{const h=characters[id],s=growStats(id);return '<article class="unit-card '+(i===0?'lead':'')+'" style="--elem:'+elementColors[h.e]+'" data-in="'+(.05+i*.07)+'"><button class="unit-main" '+attr('roster:'+i)+' aria-label="替换'+h.name+'"><div class="unit-top"><span><b>'+String(i+1).padStart(2,'0')+'</b> / '+(i===0?'操作角色':'支援队员')+'</span>'+ico('exchange',17)+'</div>'+weaponPlate(h,i)+'<div class="unit-data"><div class="row"><h2>'+h.name+'</h2>'+eTag(h.e)+'</div><div class="unit-class">'+ico(h.w,15)+h.weapon+' <i></i> '+h.title+'</div><div class="unit-stats"><span>Lv. <b>'+s.level+'</b></span><span>战力 <b>'+nfmt(s.power)+'</b></span></div></div></button><button class="unit-detail" '+attr('detail:'+i)+'>'+ico('log',15)+'角色详情'+ico('expand',14)+'</button></article>';}).join('');
 return '<section class="screen-content page-wrap party-page"><div class="page-top"><div>'+pageId('出击准备','PARTY FORMATION')+'<h1 class="large-heading">小队编成</h1></div><div class="assigned-quest"><small>当前委托</small>'+q[0]+'<b>'+difficulties[G.diff]+'</b></div></div><div class="squad-head"><div class="field-head">出击队员<small>ACTIVE PARTY</small></div><span>04 / 04</span></div><div class="units">'+cards+'</div><div class="launch-bar"><div>'+powerCompare()+'<div class="power-track"><i style="width:'+clamp(teamPower()/q[3],0,1)*100+'%"></i></div></div><div class="launch-actions"><button class="back-btn" '+attr('toQuests')+'>'+ico('back',16)+'任务柜台</button>'+actionButton('launch','出击',true)+'</div></div></section>';
}
function statRows(id){const s=growStats(id),p=growStats(id,true);return [['atk','攻击','hunt'],['hp','生命','heart'],['crit','暴击','cross']].map(([key,name,icon])=>{
 const diff=+(p[key]-s[key]).toFixed(1),format=v=>key==='crit'?v.toFixed(1)+'%':nfmt(v);return '<div class="stat-row"><span>'+ico(icon,15)+name+'</span><div><b>'+format(p[key])+'</b>'+(diff?'<small class="'+(diff>0?'stat-up':'stat-down')+'">'+(diff>0?'▲ +':'▼ ')+diff+(key==='crit'?'%':'')+'</small>':'')+'</div></div>';
 }).join('');}
function traitSummary(id,preview=false){
 const ss=G.load[id].sigils.slice();if(preview&&G.tab==='sigils'&&G.pick!==-1&&G.preview!==null)ss[G.pick]=G.preview;
 const traits={};ss.forEach(i=>{const v=sigils[i];traits[v.name]=(traits[v.name]||0)+v.level;});
 return Object.entries(traits).map(([n,v])=>'<span>'+n+' <b>Lv.'+v+'</b></span>').join('');
}
function detailContent(id){
 const h=characters[id],l=G.load[id],isSkill=G.tab==='skills';
 if(G.pick<0){
  if(isSkill)return '<div class="loadout-label"><span>已装备技能</span><small>04 SLOTS</small></div>'+l.skills.map((sid,i)=>{const sk=skillInfo[sid];return '<button class="skill-row" '+attr('pick:'+i)+'><span class="load-icon">'+ico(sk.icon,29)+'</span><span class="skill-info"><strong>'+h.skills[sid]+'</strong><small>'+sk.effect+'</small></span><span class="cd-label">'+ico('clock',13)+' '+sk.cd+' s</span><span class="slotnum">0'+(i+1)+'</span>'+ico('exchange',16)+'</button>';}).join('');
  return '<div class="loadout-label"><span>已镶嵌徽印</span><small>03 SLOTS</small></div><div class="sigil-slots">'+l.sigils.map((sid,i)=>{const s=sigils[sid];return '<button class="sigil-slot r'+s.rarity+'" '+attr('pick:'+i)+'><span class="sigil-no">SLOT 0'+(i+1)+'</span><span class="sigil-gem">'+ico(s.icon,31)+rarityPips(s.rarity)+'</span><strong>'+s.name+'</strong><small>'+rareNames[s.rarity]+' · Lv.'+s.level+'</small>'+ico('exchange',13)+'</button>';}).join('')+'</div><div class="field-head">全身特性<small>TRAIT TOTALS</small></div><div class="traits">'+traitSummary(id)+'</div>';
 }
 const options=isSkill?skillInfo.map((_,i)=>i).filter(i=>!l.skills.includes(i)):sigils.map((_,i)=>i).filter(i=>i!==l.sigils[G.pick]);
 const prev=G.preview!==null?G.preview:G.candidate;
 return '<div class="picker-head"><button class="back-btn" '+attr('cancelPick')+'>'+ico('back',15)+'装备列表</button><span>替换槽位 0'+(G.pick+1)+'</span></div><div class="loadout-label"><span>'+(isSkill?'可用技能':'可用徽印')+'</span><small>INVENTORY</small></div><div class="'+(isSkill?'candidate-list':'sigil-candidates')+'">'+options.map(i=>{const s=isSkill?skillInfo[i]:sigils[i];return '<button class="candidate '+(G.candidate===i?'selected':'')+' '+(!isSkill?'r'+s.rarity:'')+'" '+attr('choose:'+i)+' data-preview="'+i+'"><span class="load-icon">'+ico(s.icon,isSkill?27:19)+'</span><span><strong>'+(isSkill?h.skills[i]:s.name+' · Lv.'+s.level)+'</strong><small>'+(isSkill?s.effect:rareNames[s.rarity]+'级徽印')+'</small></span>'+(isSkill?'<em>'+s.cd+' s</em>':'')+'<i>'+ico(G.candidate===i?'check':'chevron',14)+'</i></button>';}).join('')+'</div><div class="preview-note"><span class="field-head">'+(isSkill?'属性预览':'特性预览')+'</span><div id="pickPreview">'+(isSkill?'选择技能查看属性变化':traitSummary(id,true))+'</div></div><div class="picker-bottom"><span>当前装备 <b>'+(isSkill?h.skills[l.skills[G.pick]]:sigils[l.sigils[G.pick]].name)+'</b></span><button class="act-btn orange" '+attr('equip')+(prev===null?' disabled':'')+'>确认替换<span class="act-tail">'+ico('check',17)+'</span></button></div>';
}
function detailPage(){
 const id=G.team[G.slot],h=characters[id],s=growStats(id),l=G.load[id];return '<section class="screen-content page-wrap detail-page"><div class="page-top"><div>'+pageId('队员档案','CHARACTER DOSSIER')+'<h1 class="large-heading">角色养成</h1></div><button class="back-btn" '+attr('toParty')+'>'+ico('back',17)+'返回编队</button></div><div class="dossier"><div class="profile-panel"><div class="profile-identity"><div><small class="eyebrow">'+h.en+' / '+h.title+'</small><h2>'+h.name+'</h2>'+eTag(h.e)+'</div>'+weaponArt(h.w)+'</div><div class="level-line"><b>Lv. '+s.level+'</b><small>EXP &nbsp; '+nfmt(l.xp)+' / 5,000</small></div><div class="meter"><i style="width:'+l.xp/50+'%"></i></div><div class="field-head">战斗属性<small>ATTRIBUTES</small></div><div id="profileStats">'+statRows(id)+'</div><div class="weapon-equipped"><span>'+ico(h.w,25)+'</span><div><small>装备武器 / '+h.weapon+'</small><b>'+h.gear+'</b></div><div><small>'+elementNames[h.e]+'属性</small><strong>Lv. '+(s.level-2)+'</strong></div></div></div><div class="loadout-panel"><nav class="gear-tabs"><button class="'+(G.tab==='skills'?'on':'')+'" '+attr('tab:skills')+'>'+ico('hunt',17)+'技能配置</button><button class="'+(G.tab==='sigils'?'on':'')+'" '+attr('tab:sigils')+'>'+ico('sigil',17)+'徽印镶嵌</button></nav><div class="loadout-content" data-new="0">'+detailContent(id)+'</div></div></div></section>';
}
function modalTitle(en,title){return '<div class="modal-header"><div><div class="eyebrow">'+en+'</div><h2>'+title+'</h2></div><button class="modal-close" '+attr('closeModal')+' aria-label="关闭">'+ico('close',16)+'</button></div>';}
function renderModal(){
 const active=overlayEl.contains(document.activeElement)?document.activeElement.dataset.action:null;
 for(const pane of [$('#topbar'),screenEl,$('#footbar')])pane.inert=!!G.modal;
 if(!G.modal){overlayEl.innerHTML='';modalItems=[];return;}
 let html='',cls='';
 if(G.modal==='directory'){
  const activePage=G.screen==='battle'&&battleModel(sceneAge()).inChain?'burst':G.screen==='detail'?'party':G.screen==='chapter'?'story':G.screen;
  cls='dir-sheet';html=modalTitle('NAVIGATION INDEX','界面目录')+'<div class="dir-list">'+sceneIndex.map(([key,zh,en,sym])=>'<button class="dir-item '+(key===activePage?'current':'')+'" '+attr('jump:'+key)+'><span class="ico-box">'+ico(sym,19)+'</span><span><strong>'+zh+'</strong><small>'+en+'</small></span>'+ico('chevron',13)+'</button>').join('')+'</div>';
 }else if(G.modal==='settings'){
  html=modalTitle('TERMINAL SETTINGS','终端设置')+'<div class="settings-body"><div class="setting-row"><strong>界面音效</strong><div class="option-seg">'+[true,false].map(v=>'<button class="'+(G.sound===v?'on':'')+'" '+attr('soundSet:'+Number(v))+'>'+(v?'开启':'关闭')+'</button>').join('')+'</div></div><div class="setting-row"><strong>音量</strong><div class="value-step"><button '+attr('volume:-10')+' aria-label="降低音量">−</button><b>'+G.volume+'%</b><button '+attr('volume:10')+' aria-label="提高音量">+</button></div></div><div class="setting-row"><strong>对话文字速度</strong><div class="option-seg">'+[[.65,'缓慢'],[1,'标准'],[1.6,'迅速']].map(([v,n])=>'<button class="'+(G.speed===v?'on':'')+'" '+attr('speed:'+v)+'>'+n+'</button>').join('')+'</div></div>'+actionButton('closeModal','完成')+'</div>';
 }else if(G.modal==='roster'){
  cls='roster-sheet';html=modalTitle('CREW ROSTER / SLOT 0'+(G.slot+1),'替换队员')+'<div class="roster-list">'+characters.map((h,id)=>{const at=G.team.indexOf(id);return '<button class="roster-person '+(at===G.slot?'current':'')+'" '+attr('recruit:'+id)+' style="--elem:'+elementColors[h.e]+'"><span class="roster-emblem">'+ico(h.w,30)+'</span><span class="roster-name"><strong>'+h.name+'</strong><small>'+h.weapon+' · '+elementNames[h.e]+'属性</small></span><span class="roster-state">'+(at===G.slot?'当前':at!==-1?'在队 0'+(at+1):'待命')+'<small>Lv.'+growStats(id).level+'</small></span></button>';}).join('')+'</div>';
 }
 overlayEl.innerHTML='<div class="modal-scrim" '+attr('closeModal')+'></div><section role="dialog" aria-modal="true" aria-label="'+({directory:'界面目录',settings:'终端设置',roster:'替换队员'}[G.modal])+'" class="modal-sheet '+cls+'" data-modal-in>'+html+'</section>';
 modalItems=$$('[data-modal-in]',overlayEl);
 if(active&&!exporting)overlayEl.querySelector('button[data-action="'+active+'"]')?.focus({preventScroll:true});
}
function openModal(name){if(name==='directory'&&G.modal&&G.modal!=='directory')G.modalParent=G.modal;G.modal=name;G.modalSince=G.t;renderModal();paintMotion();const first=overlayEl.querySelector('.current')||overlayEl.querySelector('.on')||overlayEl.querySelector('.modal-close');if(!exporting)first?.focus({preventScroll:true});}
function closeModal(){
 const was=G.modal;
 if(was==='directory'&&G.modalParent){const parent=G.modalParent;G.modalParent=null;openModal(parent);return;}
 G.modal=null;renderModal();
 const action=was==='roster'?'roster:'+G.slot:was==='settings'?'settings':'directory';
 if(!exporting)deck.querySelector('button[data-action="'+action+'"]')?.focus({preventScroll:true});
}
function paintPreview(i){
 if(G.screen!=='detail'||G.pick<0)return;G.preview=i;
 const id=G.team[G.slot],el=$('#profileStats'),dest=$('#pickPreview');if(el)el.innerHTML=statRows(id);
 if(dest){const now=growStats(id),next=growStats(id,true);dest.innerHTML=G.tab==='sigils'?traitSummary(id,true):['atk','hp','crit'].filter(k=>now[k]!==next[k]).map(k=>{const d=+(next[k]-now[k]).toFixed(1);return '<span class="'+(d>0?'stat-up':'stat-down')+'">'+({atk:'攻击',hp:'生命',crit:'暴击'}[k])+' '+(d>0?'+':'')+d+(k==='crit'?'%':'')+'</span>';}).join('')||'选择技能查看属性变化';}
}
function back(){
 if(G.modal){closeModal();return;}
 if(G.term){G.term='';G.termPinned=false;paintStory();return;}
 switch(G.screen){
 case 'title':G.menu=false;render();break;
 case 'detail':if(G.pick!==-1){G.pick=-1;G.preview=G.candidate=null;render();}else go('party');break;
 case 'battle':go('party');break;
 case 'party':case 'result':go('quest');break;
 case 'quest':go('title');G.menu=true;render();break;
 case 'chapter':go('story');break;
 case 'story':go('title');G.menu=true;render();break;
 }
}
function handle(action){
 if(!action)return;const [a,arg]=action.split(':'),i=Number(arg);
 if(!exporting)ping(['back','closeModal','cancelPick','toParty','toQuests'].includes(a)?'back':['launch','depart','equip','recruit','continue'].includes(a)?'confirm':a==='cast'?'burst':a==='skill'||a==='attack'?'strike':'click');
 switch(a){
 case 'start':G.menu=true;G.menuIndex=0;render();if(!exporting)screenEl.querySelector('.menu-choice.selected')?.focus({preventScroll:true});break;
 case 'continue':go(G.checkpoint||'story');break;
 case 'new':{const prefs={sound:G.sound,speed:G.speed,volume:G.volume};Object.assign(G,freshGame(),{t:G.t},prefs);go('story');break;}
 case 'settings':openModal('settings');break;
 case 'directory':if(G.modal==='directory')closeModal();else openModal('directory');break;
 case 'sound':case 'soundSet':G.sound=a==='sound'?!G.sound:!!i;$('#topbar').innerHTML=header();renderModal();save();break;
 case 'volume':G.volume=clamp(G.volume+i,0,100);renderModal();save();break;
 case 'speed':G.speed=i;renderModal();save();break;
 case 'closeModal':closeModal();break;
 case 'jump':if(arg==='burst'){go('battle',20.48);}else if(arg==='quest'){G.diff=2;G.quest=1;go(arg);}else go(arg);break;
 case 'nextLine':nextLine();break;
 case 'term':G.termPinned=!(G.termPinned&&G.term===arg);G.term=G.termPinned?arg:'';paintStory();break;
 case 'termClose':G.term='';G.termPinned=false;paintStory();break;
 case 'auto':G.auto=!G.auto;G.fast=false;render();break;
 case 'fast':G.fast=!G.fast;G.auto=false;G.lineSince=G.t;render();break;
 case 'chapterNext':go('quest');break;
 case 'diff':if(G.diff!==i){G.diff=i;G.quest=0;render();save();}break;
 case 'quest':G.quest=i;render();save();break;
 case 'depart':case 'toParty':go('party');break;
 case 'toQuests':go('quest');break;
 case 'roster':G.slot=i;openModal('roster');break;
 case 'recruit':{
  const from=G.team.indexOf(i),before=teamPower();
  if(from!==-1)G.team[from]=G.team[G.slot];
  G.team[G.slot]=i;
  G.swap=from===G.slot?null:{time:G.t,slots:from<0?[G.slot]:[G.slot,from],before,after:teamPower()};
  G.modal=null;render();save();break;
 }
 case 'detail':G.slot=i;go('detail');break;
 case 'tab':G.tab=arg;G.pick=-1;G.candidate=G.preview=null;render();break;
 case 'pick':G.pick=i;G.candidate=G.preview=null;render();break;
 case 'choose':G.preview=G.candidate=i;render();paintPreview(i);break;
 case 'cancelPick':G.pick=-1;G.candidate=G.preview=null;render();break;
 case 'equip':if(G.candidate!==null&&G.pick>=0){
  const equipped=G.tab==='skills'?characters[G.team[G.slot]].skills[G.candidate]:sigils[G.candidate].name+' Lv.'+sigils[G.candidate].level;
  G.feedback={t:G.t,scene:'detail',text:(G.tab==='skills'?'已装备技能 · ':'已镶嵌徽印 · ')+equipped};
  G.load[G.team[G.slot]][G.tab][G.pick]=G.candidate;G.pick=-1;G.preview=G.candidate=null;render();save();}break;
 case 'launch':go('battle');break;
 case 'attack':battleInput('attack');break;
 case 'skill':battleInput('skill',i);break;
 case 'cast':battleInput('ult',Number.isFinite(i)?i:0);break;
 case 'skipResult':G.resultOffset=Math.max(0,10-sceneAge());paint();break;
 case 'chest':G.resultOffset=Math.max(G.resultOffset,[3.3,4.8,6.2][i]-sceneAge());paint();break;
 case 'retry':G.team=G.result.team.slice();G.diff=G.result.diff;G.quest=G.result.quest;go('battle');break;
 case 'back':back();break;
 }
}
function paintMotion(){
 if(departing){
  const p=clamp((G.t-departTime)/.34);
  if(p===1)clearPageTurn();
  else{
   const edge=108-116*(p*p*(3-2*p));
   departing.style.clipPath='polygon(0 0,'+(edge+3)+'% 0,'+(edge-3)+'% 100%,0 100%)';
   departing.firstElementChild.style.translate=(-18*p)+'px 0';
  }
 }
 const feedback=$('#feedback'),message=G.feedback;
 if(message&&message.scene===G.screen&&G.t-message.t<1.65){
  if(feedback.dataset.msg!==message.text){feedback.innerHTML=ico('check',15)+message.text;feedback.dataset.msg=message.text;}
  feedback.style.display='flex';feedback.style.opacity=clamp((G.t-message.t)/.11)*clamp((1.65-G.t+message.t)/.25);
 }else feedback.style.display='none';
 const age=sceneAge();deck.style.setProperty('--pulse',(.73+Math.sin(G.t*2.4)*.25).toFixed(3));deck.style.setProperty('--drift',(Math.sin(G.t*.65)*2.3).toFixed(2)+'px');
 for(const el of enterItems){
  const rel=el.hasAttribute('data-new')?G.t-renderedAt:age,delay=Number(el.dataset.new??el.dataset.in??0);
  const u=ease((rel-delay)/.54);el.style.opacity=u.toFixed(3);el.style.translate='0 '+((1-u)*14).toFixed(2)+'px';
 }
 for(const el of modalItems){const u=ease((G.t-G.modalSince)/.19);el.style.opacity=u.toFixed(3);el.style.translate='0 '+((1-u)*-6).toFixed(2)+'px';}
}
function paint(){
 paintMotion();
 if(G.screen==='party'&&G.swap){
  const change=G.swap,u=ease((G.t-change.time)/.45);
  const cards=$$('.unit-card',screenEl);
  for(const slot of change.slots){
   const plate=cards[slot].querySelector('.weapon-plate');
   plate.style.opacity=(.36+.64*u).toFixed(3);
   plate.querySelector('.weapon-art').style.translate=((1-u)*32).toFixed(2)+'px 0';
  }
  $('.launch-bar .power-compare strong').textContent=nfmt(change.before+(change.after-change.before)*u);
  if(u===1)G.swap=null;
 }
 if(G.screen==='story')paintStory();
 else if(G.screen==='battle')paintBattle();
 else if(G.screen==='result')paintResult();
}
function tick(time,real=true){
 const dt=Math.max(0,time-G.t);
 if(G.modal&&real){G.since+=dt;G.lineSince+=dt;}
 G.t=time;
 if(!G.modal&&real){
  if(G.screen==='story'&&!G.term&&(G.fast&&G.t-G.lineSince>.78||G.auto&&G.t-G.lineSince>storyLines[G.story].text.length/(24*G.speed)+1.65))nextLine(true);
  if(G.screen==='chapter'&&sceneAge()>=3.1)go('quest');
  if(G.screen==='battle'&&sceneAge()>=battleEnd())go('result');
 }
 paint();
}
function focusMove(key){
 const scope=G.modal?overlayEl:screenEl;
 const btns=$$('button:not(:disabled)',scope).filter(el=>el.offsetHeight&&getComputedStyle(el).visibility!=='hidden');
 if(!btns.length)return;
 const cur=document.activeElement,idx=btns.indexOf(cur);
 if(idx<0){
  const first=btns.find(b=>b.classList.contains('selected')||b.classList.contains('active'))||btns[0];
  first.focus({preventScroll:true});return;
 }
 const p=cur.getBoundingClientRect(),cx=p.x+p.width/2,cy=p.y+p.height/2;
 const horizontal=key==='ArrowRight'||key==='ArrowLeft',sgn=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
 let best=null,score=Infinity;
 for(const el of btns){if(el===cur)continue;const r=el.getBoundingClientRect(),x=r.x+r.width/2-cx,y=r.y+r.height/2-cy,along=(horizontal?x:y)*sgn,cross=Math.abs(horizontal?y:x);if(along<=2)continue;let n=along+cross*3.2;if(n<score){best=el;score=n;}}
 (best||btns[(idx+sgn+btns.length)%btns.length]).focus({preventScroll:true});
}
document.addEventListener('click',ev=>{if(exporting)return;const b=ev.target.closest('[data-action]');if(b){if(!b.disabled)handle(b.dataset.action);}else if(!G.modal&&G.screen==='title'&&!G.menu)handle('start');else if(!G.modal&&G.screen==='story'&&ev.target.closest('.dialog-box')&&!ev.target.closest('.term-tip'))handle('nextLine');});
function onPoint(el){
 if(exporting||!(el instanceof Element))return;
 const p=el.closest('[data-preview]');if(p)paintPreview(Number(p.dataset.preview));
 const choice=el.closest('.menu-choice');if(choice){G.menuIndex=['continue','new','settings'].indexOf(choice.dataset.action);$$('.menu-choice').forEach(e=>e.classList.toggle('selected',e===choice));}
 const term=el.closest('.term');if(term&&G.screen==='story'&&!G.termPinned){G.term=term.dataset.action.split(':')[1];paintStory();}
}
document.addEventListener('pointerover',e=>onPoint(e.target));document.addEventListener('focusin',e=>onPoint(e.target));
document.addEventListener('focusout',e=>{
 if(!exporting&&G.screen==='detail'&&e.target.closest?.('[data-preview]')&&!e.relatedTarget?.closest?.('[data-preview]'))paintPreview(G.candidate);
 if(!exporting&&G.screen==='story'&&!G.termPinned&&e.target.closest?.('.term')&&!e.relatedTarget?.closest?.('.term,.term-tip')){
  G.term='';paintStory();
 }
});
document.addEventListener('pointerout',e=>{
 if(exporting||!(e.target instanceof Element))return;
 if(e.target.closest('[data-preview]')&&!e.relatedTarget?.closest?.('[data-preview]'))paintPreview(G.candidate);
 if(e.target.closest('.term,.term-tip')&&!e.relatedTarget?.closest?.('.term,.term-tip')&&G.screen==='story'&&!G.termPinned){G.term='';paintStory();}
});
document.addEventListener('keydown',e=>{
 if(exporting||e.altKey||e.ctrlKey||e.metaKey)return;
 if(e.key==='F1'){e.preventDefault();handle('directory');return;}
 if(e.key==='Escape'){e.preventDefault();ping('back');back();return;}
 if(!G.modal&&G.screen==='title'&&!G.menu&&!document.activeElement?.closest('.top-tools,.key-back')&&e.key!=='Tab'&&!['Shift','Control','Alt','Meta'].includes(e.key)){e.preventDefault();handle('start');return;}
 if(e.key.startsWith('Arrow')){e.preventDefault();focusMove(e.key);return;}
 if(e.key==='Tab'){
  const scope=G.modal?overlayEl:deck,btns=$$('button:not(:disabled)',scope).filter(b=>b.offsetHeight&&!(G.modal&&!overlayEl.contains(b)));
  if(btns.length&&(e.shiftKey&&document.activeElement===btns[0]||!e.shiftKey&&document.activeElement===btns.at(-1))){e.preventDefault();btns[e.shiftKey?btns.length-1:0].focus();}return;
 }
 if(G.modal){if((e.key==='Enter'||e.key===' ')&&!overlayEl.contains(document.activeElement)){e.preventDefault();overlayEl.querySelector('button')?.focus();}return;}
 if(G.screen==='battle'){
  const relay=relayWindow(sceneAge()),key=e.key.toLowerCase();
  let action;
  if(/^[1-4]$/.test(key))action=(relay?'cast:':'skill:')+(Number(key)-1);
  if(key==='q')action='cast:'+(relay&&relay.next>=0?relay.next:0);
  if(key===' '&&!relay)action='attack';
  if(action){e.preventDefault();if(!e.repeat)handle(action);return;}
 }
 if(G.screen==='result'&&sceneAge()+G.resultOffset<7.9&&(e.key===' '||e.key==='Enter'&&!document.activeElement?.closest('button'))){e.preventDefault();handle('skipResult');return;}
 if(G.screen==='story'&&e.key.toLowerCase()==='a'){e.preventDefault();handle('auto');return;}
 if(e.key==='Enter'||e.key===' '){
  if(document.activeElement?.closest('button'))return;e.preventDefault();
  const def=({story:'nextLine',title:['continue','new','settings'][G.menuIndex],chapter:'chapterNext',quest:'depart',party:'launch',result:'toQuests'})[G.screen];if(def)handle(def);
 }
});
function liveLoop(now){
 if(!exporting){const d=lastFrame===null?0:clamp((now-lastFrame)/1000,0,.12);tick(G.t+d,true);}
 lastFrame=now;requestAnimationFrame(liveLoop);
}

