/* ============================================================
 * 界面层：菜单、战斗 HUD、图鉴、结算、提示与交互
 * ============================================================ */
class UI {
  constructor(){
    this.game=null; this.world=null; this.main=null;
    this.currentScreen='menu';
    this.codexTab='towers';
    this.lastHud={};
    this.selRefresh=0;
    this.toastTimer=null;
    this.subTimer=null;
    this.drag=null;
    this.placeMode=false;
    this.itemMode=null;
    this.demo=false;
    this.$=id=>document.getElementById(id);
    this.cache();
    this.buildDeck();
    this.buildItems();
    this.buildMenuMapList();
    this.buildMapCards();
    this.buildDemoButtons();
    this.buildCodex();
    this.bind();
  }

  cache(){
    const $=id=>document.getElementById(id);
    this.el={
      menu:$('menu-screen'), select:$('select-screen'), battle:$('battle-hud'),
      report:$('report-screen'), codex:$('codex-screen'), settings:$('settings-screen'),
      pause:$('pause-screen'), tooltip:$('tooltip'), ghost:$('drag-ghost'), confirm:$('confirm-bar'),
      toast:$('toast-layer'), subtitle:$('subtitle'), subtitleText:$('subtitle-text'),
      demoControls:$('demo-controls'), demoProgress:$('demo-progress-fill'), demoTime:$('demo-time'),
      forecast:$('forecast-panel'), forecastBody:$('forecast-body'), forecastTag:$('forecast-tag'),
      forecastNote:$('forecast-note'), waveBtn:$('btn-wave'),
      compute:$('hud-compute'), intel:$('hud-intel'), core:$('hud-core'), coreFill:$('hud-core-fill'),
      wave:$('hud-wave'), mapName:$('hud-map-name'), mapSub:$('hud-map-sub'),
      deck:$('deck-items'), items:$('item-items'), selectPanel:$('select-panel'), selectBody:$('select-body'),
      legend:$('route-legend'), banner:$('wave-banner'), bannerText:$('wave-banner-text'),
      bossBanner:$('boss-banner'), bossName:$('boss-banner-name'), bossSub:$('boss-banner-sub'),
      hint:$('hint-bar'), codexContent:$('codex-content'), confirmText:$('confirm-text'),
      mapCards:$('map-cards'), menuMapList:$('menu-map-list'), demoButtons:$('demo-buttons')
    };
  }

  /* ---------- 构建 ---------- */
  buildDeck(){
    this.el.deck.innerHTML='';
    for(const type of DATA.TOWER_ORDER){
      const d=DATA.TOWERS[type];
      const card=document.createElement('div');
      card.className='tower-card'; card.dataset.type=type;
      card.classList.add(['firewall','honeypot','netgate'].includes(type)?'role-block':(['interceptor','sandbox'].includes(type)?'role-remote':'role-support'));
      card.innerHTML=`<span class="tc-key">${d.hotkey}</span><div class="tc-icon">${DATA.ICONS[d.icon]}</div>
        <div class="tc-name">${d.name}</div><div class="tc-role">${d.role}</div><div class="tc-cost">⬡ ${d.cost}</div>`;
      card.addEventListener('pointerdown',e=>this.onCardDown(e,type,'tower'));
      card.addEventListener('mouseenter',e=>this.showTip(e,`<b>${d.name} · ${d.role}</b><span class="tt-sub">${d.en}</span><div>${d.desc}</div><div class="tt-warn">拖到地图或点击后放置 · 消耗 ${d.cost} 算力</div>`));
      card.addEventListener('mousemove',e=>this.moveTip(e));
      card.addEventListener('mouseleave',()=>this.hideTip());
      this.el.deck.appendChild(card);
    }
  }

  buildItems(){
    this.el.items.innerHTML='';
    for(const id of DATA.ITEM_ORDER){
      const d=DATA.ITEMS[id];
      const card=document.createElement('div');
      card.className='item-card'; card.dataset.item=id;
      const pos=id==='isolator'?'交换节点':id==='downgrade'?'链路区域':'一座塔';
      card.innerHTML=`<div class="ic-icon">${DATA.ICONS[d.icon]}</div><div class="ic-name">${d.name}</div><div class="ic-pos">${pos}</div><div class="ic-cost">${d.res==='intel'?'◇':'⬡'} ${d.cost}</div><div class="ic-cdtext">CD ${d.cd}s</div><div class="ic-cd"></div>`;
      card.addEventListener('pointerdown',e=>{ e.stopPropagation(); this.onItemDown(id); });
      card.addEventListener('mouseenter',e=>this.showTip(e,`<b>${d.name}</b><span class="tt-sub">${d.en}</span><div>${d.desc}</div><div class="tt-warn">${d.tip}</div>`));
      card.addEventListener('mousemove',e=>this.moveTip(e));
      card.addEventListener('mouseleave',()=>this.hideTip());
      this.el.items.appendChild(card);
    }
  }

  buildMenuMapList(){
    this.el.menuMapList.innerHTML='';
    const icons={map1:'▦',map2:'≋',map3:'⬡'};
    for(const m of MAPS.MAP_LIST){
      const meta=DATA.MAPS_META[m.id];
      const row=document.createElement('div'); row.className='menu-map-row';
      row.innerHTML=`<div class="mm-ico">${icons[m.id]}</div><div class="mm-txt"><div class="mm-name">${meta.name}</div><div class="mm-sub">${meta.type} · ${meta.features.join(' / ')}</div></div><div class="mm-wave">${meta.waves}W</div>`;
      row.addEventListener('click',()=>{ AudioSys.sfx('click'); this.main.startGame(m.id); });
      this.el.menuMapList.appendChild(row);
    }
  }

  drawMapPreview(canvas,map){
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=canvas.clientWidth||300, h=canvas.clientHeight||200;
    canvas.width=w*dpr; canvas.height=h*dpr;
    const x=canvas.getContext('2d'); x.scale(dpr,dpr);
    x.clearRect(0,0,w,h);
    const g=x.createRadialGradient(w/2,h*.6,10,w/2,h*.6,w*.7);
    g.addColorStop(0,'rgba(20,70,90,.5)'); g.addColorStop(1,'rgba(3,10,16,0)');
    x.fillStyle=g; x.fillRect(0,0,w,h);
    const tw=Math.min(w/(map.w+2),h/(map.h+2));
    const ox=(w-tw*map.w)/2, oy=(h-tw*map.h)/2;
    for(let z=0;z<map.h;z++) for(let ix=0;ix<map.w;ix++){
      const c=map.cell(ix,z); let col=null;
      if(c==='.') col='rgba(60,170,200,.55)';
      else if(c==='o') col='rgba(220,150,50,.65)';
      else if(c==='n') col='rgba(92,233,255,.95)';
      else if(c==='p') col='rgba(110,200,230,.5)';
      else if(c==='#') col='rgba(30,60,80,.55)';
      if(col){ x.fillStyle=col; x.fillRect(ox+ix*tw+1,oy+z*tw+1,tw-2,tw-2); }
    }
    for(const e of map.entries){ x.fillStyle='#5ce9ff'; x.beginPath(); x.arc(ox+(e.cell[0]+.5)*tw,oy+(e.cell[1]+.5)*tw,tw*.55,0,6.28); x.fill(); x.fillStyle='#eaffff'; x.font=`${Math.max(9,tw*.7)}px monospace`; x.textAlign='center'; x.fillText(e.id,ox+(e.cell[0]+.5)*tw,oy+(e.cell[1]+.5)*tw+tw*.25); }
    for(const e of map.exits){ x.fillStyle='#6cf0a8'; x.beginPath(); x.arc(ox+(e.cell[0]+.5)*tw,oy+(e.cell[1]+.5)*tw,tw*.55,0,6.28); x.fill(); x.fillStyle='#04140c'; x.font=`${Math.max(9,tw*.7)}px monospace`; x.textAlign='center'; x.fillText(e.id,ox+(e.cell[0]+.5)*tw,oy+(e.cell[1]+.5)*tw+tw*.25); }
    x.strokeStyle='rgba(92,233,255,.25)'; x.strokeRect(ox,oy,tw*map.w,tw*map.h);
  }

  buildMapCards(){
    this.el.mapCards.innerHTML='';
    for(const m of MAPS.MAP_LIST){
      const meta=DATA.MAPS_META[m.id];
      const card=document.createElement('div'); card.className='map-card'; card.dataset.map=m.id;
      card.innerHTML=`<div class="mc-preview"><span class="mc-tag">${meta.type}</span><div class="mc-diff">${[1,2,3,4].map(i=>`<i class="${i<=meta.difficulty?'on':''}"></i>`).join('')}</div></div>
        <div class="mc-body"><div class="mc-name">${meta.name}</div><div class="mc-en">${meta.en}</div>
        <div class="mc-desc">${meta.desc}</div>
        <div class="mc-meta"><span>波次 <b>${meta.waves}</b></span><span>入口 <b>${m.entries.length}</b></span><span>节点 <b>${m.nodes.length}</b></span></div></div>`;
      card.addEventListener('click',()=>{ AudioSys.sfx('click'); this.main.startGame(m.id); });
      this.el.mapCards.appendChild(card);
      const cv=document.createElement('canvas'); cv.style.position='absolute'; cv.style.inset='0'; cv.style.width='100%'; cv.style.height='100%'; cv.style.pointerEvents='none';
      card.querySelector('.mc-preview').appendChild(cv);
      setTimeout(()=>this.drawMapPreview(cv,m),30);
    }
  }

  buildDemoButtons(){
    this.el.demoButtons.innerHTML='';
    const names=['分段取舍','旁路直通','蛰影现身'];
    const subs=['网闸改道 · 分段内网','洪泛团冲垮节点 · 骨干流域','运维环锁死 · 气隙深层'];
    const DATA_DEMO_IDS=['demo-1','demo-2','demo-3'];
    for(let i=0;i<3;i++){
      const b=document.createElement('button'); b.className='demo-btn'; b.dataset.demo=DATA_DEMO_IDS[i];
      b.innerHTML=`<span class="db-idx">0${i+1}</span><div><div class="db-name">${names[i]}</div><div class="db-sub">${subs[i]}</div></div>`;
      b.addEventListener('click',()=>{ AudioSys.sfx('click'); this.main.startDemo(DATA_DEMO_IDS[i]); });
      this.el.demoButtons.appendChild(b);
    }
  }

  buildCodex(){
    const tabs=document.querySelectorAll('.codex-tabs .tab');
    tabs.forEach(t=>t.addEventListener('click',()=>{
      AudioSys.sfx('click');
      tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active');
      this.codexTab=t.dataset.tab; this.renderCodex();
    }));
    this.renderCodex();
  }

  renderCodex(){
    const c=this.el.codexContent; c.innerHTML='';
    if(this.codexTab==='towers'){
      for(const type of DATA.TOWER_ORDER){
        const d=DATA.TOWERS[type];
        const card=document.createElement('div'); card.className='cx-card';
        const stats=`算力 <b>${d.cost}</b> · 生命 <b>${d.hp}</b>${d.range?` · 射程 <b>${d.range}</b>`:''}${d.block?` · 阻挡 <b>${d.block}</b>`:''}`;
        card.innerHTML=`<div class="cx-ico">${DATA.ICONS[d.icon]}</div><div class="cx-body"><div class="cx-name">${d.name}<span class="sp-tag tag-cyan">${d.role}</span></div><div class="cx-en">${d.en}</div><div class="cx-desc">${d.desc}</div><div class="cx-stats">${stats}</div><div class="cx-tip">提示：${d.detail}</div></div>`;
        c.appendChild(card);
      }
      const sec=document.createElement('div'); sec.className='cx-sec'; sec.textContent='升级与分支'; c.appendChild(sec);
      for(const type of ['honeypot','interceptor']){
        const d=DATA.TOWERS[type];
        const card=document.createElement('div'); card.className='cx-card';
        card.innerHTML=`<div class="cx-ico">${DATA.ICONS[d.icon]}</div><div class="cx-body"><div class="cx-name">${d.name} · 2 级分支</div><div class="cx-en">MUTUALLY EXCLUSIVE</div>`+
          Object.values(d.branches).map(b=>`<div class="cx-desc" style="margin-top:.35rem"><b style="color:#b58cff">${b.name}</b>（情报 ${b.intel}）— ${b.desc}</div>`).join('')+
          `</div>`;
        c.appendChild(card);
      }
    } else if(this.codexTab==='enemies'){
      for(const type of DATA.ENEMY_ORDER){
        const d=DATA.ENEMIES[type];
        const card=document.createElement('div'); card.className='cx-card';
        card.innerHTML=`<div class="cx-ico">${DATA.ICONS[type]}</div><div class="cx-body"><div class="cx-name">${d.name}<span class="sp-tag tag-red">${d.flying?'飞行':d.boss?'Boss':'地面'}</span></div><div class="cx-en">${d.en}</div><div class="cx-desc">${d.desc}</div><div class="cx-stats">生命 <b>${d.hp}</b> · 速度 <b>${d.speed}</b> · 赏金 <b>${d.bounty}</b></div><div class="cx-tip">${d.tip}</div></div>`;
        c.appendChild(card);
      }
      const sec=document.createElement('div'); sec.className='cx-sec'; sec.textContent='威胁档案 · Boss'; c.appendChild(sec);
      for(const type of ['boss_wankui','boss_shenlou','boss_zheying']){
        const d=DATA.ENEMIES[type];
        const card=document.createElement('div'); card.className='cx-card';
        card.innerHTML=`<div class="cx-ico">${DATA.ICONS[type]}</div><div class="cx-body"><div class="cx-name">${d.name}<span class="sp-tag tag-red">BOSS</span></div><div class="cx-en">${d.en}</div><div class="cx-desc">${d.desc}</div><div class="cx-stats">生命 <b>${d.hp}</b> · 护甲 <b>${Math.round((d.armor||0)*100)}%</b></div><div class="cx-tip">${d.tip}</div></div>`;
        c.appendChild(card);
      }
    } else {
      for(const s of DATA.CODEX_SYSTEMS){
        const card=document.createElement('div'); card.className='cx-card cx-sys';
        card.innerHTML=`<h3>${s.title}</h3><p>${s.body}</p>`;
        c.appendChild(card);
      }
      const isec=document.createElement('div'); isec.className='cx-sec'; isec.textContent='战术道具'; c.appendChild(isec);
      for(const id of DATA.ITEM_ORDER){
        const d=DATA.ITEMS[id];
        const card=document.createElement('div'); card.className='cx-card cx-sys';
        card.innerHTML=`<h3>${d.name} <span style="font-size:.6rem;color:#ffb85c">${d.res==='intel'?'情报 '+d.cost:'算力 '+d.cost} · 冷却 ${d.cd}s</span></h3><p>${d.desc}</p><p style="color:#ffb85c;margin-top:.3rem">${d.tip}</p>`;
        c.appendChild(card);
      }
      const sec=document.createElement('div'); sec.className='cx-sec'; sec.textContent='状态效果'; c.appendChild(sec);
      for(const k in DATA.STATUS_INFO){
        const s=DATA.STATUS_INFO[k];
        const card=document.createElement('div'); card.className='cx-card cx-sys';
        card.innerHTML=`<h3 style="color:${s.color}">${s.name}</h3><p>${s.desc}</p>`;
        c.appendChild(card);
      }
      const tsec=document.createElement('div'); tsec.className='cx-sec'; tsec.textContent='地形与通行'; c.appendChild(tsec);
      for(const t of [
        ['链路','恶意程序与业务流量经过的道路。防火墙和蜜罐可以部署，阻挡敌人但不截断道路。'],
        ['设备平台','部署远程和修复支援塔的位置，与链路有高低区别，敌人不能通行。'],
        ['交换节点','链路交汇处的网络设备。部署防火墙、网闸或应急隔离器会隔离节点；解除后恢复直通。'],
        ['旧链路','保留旧协议的道路。地面敌人减速 38%，伪装的木马经过时显形。'],
        ['障碍','数据设施、公网流和气隙等，不能通行，也不能部署。']
      ]){
        const card=document.createElement('div'); card.className='cx-card cx-sys';
        card.innerHTML=`<h3>${t[0]}</h3><p>${t[1]}</p>`;
        c.appendChild(card);
      }
    }
  }

  /* ---------- 屏幕 ---------- */
  showScreen(name){
    this.currentScreen=name;
    this.el.menu.classList.toggle('hidden',name!=='menu');
    this.el.select.classList.toggle('hidden',name!=='select');
    this.el.battle.classList.toggle('hidden',name!=='battle');
    this.el.report.classList.toggle('hidden',name!=='report');
    this.el.codex.classList.toggle('hidden',name!=='codex');
    this.el.settings.classList.toggle('hidden',name!=='settings');
    this.el.pause.classList.add('hidden');
    if(name!=='battle') this.hideTip();
  }

  showBattle(game){
    this.game=game;
    this.showScreen('battle');
    this.el.mapName.textContent=game.map.name;
    this.el.mapSub.textContent=game.map.sub;
    this.buildRouteLegend();
    this.updateForecast();
    this.refreshAll();
    this.el.selectPanel.classList.add('hidden');
  }

  buildRouteLegend(){
    const g=this.game; if(!g) return;
    this.el.legend.innerHTML='';
    for(const e of g.map.entries){
      const r=g.routes[e.id];
      const row=document.createElement('div'); row.className='rl-row';
      row.innerHTML=`<span class="rl-line" style="background:#${(e.color||0x5ce9ff).toString(16).padStart(6,'0')}"></span><span class="rl-name">${e.id} ${e.name} → ${r?r.exitId:e.defaultExit}</span>`;
      this.el.legend.appendChild(row);
    }
    const note=document.createElement('div'); note.className='rl-row'; note.style.color='#ffb85c';
    note.innerHTML=`<span class="rl-line" style="background:#ffd27a"></span><span class="rl-name">预览路线（确认前）</span>`;
    this.el.legend.appendChild(note);
  }

  onRoutesChanged(){ this.buildRouteLegend(); }

  /* ---------- 交互 ---------- */
  bind(){
    document.getElementById('btn-start').addEventListener('click',()=>{ AudioSys.sfx('click'); this.showScreen('select'); });
    document.getElementById('btn-demos').addEventListener('click',()=>{ AudioSys.sfx('click'); this.showScreen('select'); this.el.demoButtons.scrollIntoView({behavior:'smooth',block:'nearest'}); });
    document.getElementById('btn-codex').addEventListener('click',()=>{ AudioSys.sfx('click'); this.openCodex(); });
    document.getElementById('btn-settings').addEventListener('click',()=>{ AudioSys.sfx('click'); this.showScreen('settings'); });
    document.getElementById('btn-settings-back').addEventListener('click',()=>{ AudioSys.sfx('click'); this.showScreen('menu'); });
    document.querySelectorAll('[data-nav="menu"]').forEach(b=>b.addEventListener('click',()=>{ AudioSys.sfx('click'); this.showScreen('menu'); }));
    document.getElementById('btn-codex-back').addEventListener('click',()=>{ AudioSys.sfx('click'); if(this.game && !this.game.over){ this.game.paused=false; this.showScreen('battle'); } else this.showScreen('menu'); });
    document.getElementById('btn-codex-battle').addEventListener('click',()=>this.openCodex());
    document.getElementById('btn-menu').addEventListener('click',()=>this.openPause());
    document.getElementById('btn-pause').addEventListener('click',()=>this.openPause());
    document.getElementById('btn-camera').addEventListener('click',()=>{ this.world.resetCamera(); AudioSys.sfx('click'); });
    document.getElementById('btn-resume').addEventListener('click',()=>this.resume());
    document.getElementById('btn-pause-codex').addEventListener('click',()=>this.openCodex());
    document.getElementById('btn-restart').addEventListener('click',()=>{ this.el.pause.classList.add('hidden'); this.main.restart(); });
    document.getElementById('btn-quit').addEventListener('click',()=>{ this.el.pause.classList.add('hidden'); this.main.quitToSelect(); });
    document.getElementById('btn-replay').addEventListener('click',()=>this.main.restart());
    document.getElementById('btn-back-select').addEventListener('click',()=>this.main.quitToSelect());
    document.getElementById('btn-wave').addEventListener('click',()=>{ if(this.game){ this.game.startWave(); AudioSys.sfx('click'); } });
    document.getElementById('btn-mute').addEventListener('click',()=>this.toggleMute());
    document.getElementById('btn-mute2').addEventListener('click',()=>this.toggleMute());
    document.querySelectorAll('.speed-btn').forEach(b=>b.addEventListener('click',()=>{
      this.game.speed=parseFloat(b.dataset.speed);
      document.querySelectorAll('.speed-btn').forEach(x=>x.classList.toggle('active',x===b));
      AudioSys.sfx('click');
    }));
    document.querySelectorAll('.seg button').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('.seg button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      this.world.setQuality(b.dataset.quality); AudioSys.sfx('click');
    }));
    for(const [id,key] of [['vol-ambient','ambient'],['vol-music','music'],['vol-sfx','sfx']]){
      const inp=document.getElementById(id);
      inp.addEventListener('input',()=>{
        document.getElementById(id+'-val').textContent=inp.value+'%';
        const v=parseInt(inp.value)/100;
        const vols={}; vols[key]=v; AudioSys.setVolumes(vols);
      });
    }
    document.getElementById('btn-demo-exit').addEventListener('click',()=>this.main.stopDemo());
    document.getElementById('select-screen').addEventListener('click',e=>{ if(e.target.id==='select-screen') this.showScreen('menu'); });
    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        if(this.el.pause.classList.contains('hidden')===false){ this.resume(); }
        else if(this.placeMode||this.itemMode){ this.main.cancelModes(); }
        else if(this.currentScreen==='battle'){ this.openPause(); }
      }
      if(e.code==='Space' && this.currentScreen==='battle' && this.game){ e.preventDefault(); this.openPause(); }
      if(e.key==='Tab' && this.currentScreen==='battle'){ e.preventDefault(); this.openCodex(); }
      if(e.key==='m'||e.key==='M'){ this.toggleMute(); }
      if((e.key==='r'||e.key==='R') && this.currentScreen==='battle'){ this.world.resetCamera(); }
      if(this.currentScreen==='battle' && this.game && !this.game.over){
        if(e.key==='1'||e.key==='2'||e.key==='3'||e.key==='4'||e.key==='5'||e.key==='6'){
          const type=DATA.TOWER_ORDER[parseInt(e.key)-1];
          this.main.beginPlacement(type);
        }
        if(e.key==='q'||e.key==='Q'||e.key==='e'||e.key==='E'){
          if(this.placeMode){ this.main.rotatePlacement(e.key.toLowerCase()==='q'?-Math.PI/12:Math.PI/12); }
        }
      }
    });
    document.addEventListener('pointermove',e=>{ if(this.drag && Math.hypot(e.clientX-this.drag.startX,e.clientY-this.drag.startY)>6) this.drag.moved=true; });
    document.addEventListener('pointerup',e=>{ if(this.drag) this.endCardDrag(e); });
  }

  openPause(){
    if(!this.game||this.game.over) return;
    this.game.paused=true;
    this.el.pause.classList.remove('hidden');
    AudioSys.sfx('click');
  }
  resume(){
    this.el.pause.classList.add('hidden');
    if(this.game) this.game.paused=false;
    AudioSys.sfx('click');
  }

  toggleMute(){
    AudioSys.init(); AudioSys.resume();
    this.muted=!this.muted;
    AudioSys.setMuted(this.muted);
    const b=document.getElementById('btn-mute'); b.classList.toggle('off',this.muted);
    b.textContent=this.muted?'✕':'♪';
    document.getElementById('btn-mute2').textContent=this.muted?'关闭静音':'开启静音';
    this.toast(this.muted?'已静音':'声音已开启');
  }

  openCodex(){
    this.codexReturn=this.currentScreen;
    this.showScreen('codex');
    AudioSys.sfx('click');
  }

  /* ---------- 拖放 ---------- */
  onCardDown(e,type,kind){
    if(!this.game||this.game.over) return;
    AudioSys.init(); AudioSys.resume();
    this.hideTip();
    e.preventDefault();
    this.drag={type,kind,startX:e.clientX,startY:e.clientY,moved:false};
    this.placeMode=true;
    this.main.beginPlacement(type);
    const g=this.el.ghost; g.innerHTML=DATA.ICONS[DATA.TOWERS[type].icon]; g.classList.remove('hidden');
    g.style.left=e.clientX+'px'; g.style.top=e.clientY+'px';
    document.querySelectorAll('.tower-card').forEach(c=>c.classList.toggle('placing',c.dataset.type===type));
    this.el.confirm.classList.remove('hidden');
    this.el.confirmText.textContent='拖动到地图部署 · 左键确认 · 右键取消';
  }
  endCardDrag(e){
    const d=this.drag; this.drag=null;
    if(!d) return;
    if(d.moved){
      this.main.tryDropAt(e.clientX,e.clientY);
    }
    this.el.ghost.classList.add('hidden');
  }
  onItemDown(id){
    if(!this.game||this.game.over) return;
    AudioSys.init(); AudioSys.resume();
    if(this.placeMode && this.main) this.main.cancelModes();
    this.itemMode=id;
    this.game.beginItem(id);
    this.el.confirm.classList.remove('hidden');
    this.el.confirmText.textContent='选择投放位置 · 左键确认 · 右键取消';
    this.toast('选择'+DATA.ITEMS[id].name+'的投放位置');
  }

  /* ---------- 提示 ---------- */
  showTip(e,html){
    const t=this.el.tooltip; t.innerHTML=html; t.classList.remove('hidden');
    this.moveTip(e);
  }
  moveTip(e){
    const t=this.el.tooltip; if(t.classList.contains('hidden')) return;
    const r=t.getBoundingClientRect();
    let x=e.clientX+18, y=e.clientY+16;
    if(x+r.width>window.innerWidth-10) x=e.clientX-r.width-14;
    if(y+r.height>window.innerHeight-10) y=e.clientY-r.height-14;
    t.style.left=x+'px'; t.style.top=y+'px';
  }
  hideTip(){ this.el.tooltip.classList.add('hidden'); }

  damageFlash(){
    const e=document.getElementById('damage-flash'); if(!e) return;
    e.classList.remove('active'); void e.offsetWidth; e.classList.add('active');
  }

  toast(text,type=''){
    const d=document.createElement('div'); d.className='toast '+type; d.textContent=text;
    d.dataset.until=String((this.game?this.game.time:performance.now()/1000)+2.6);
    this.el.toast.appendChild(d);
    setTimeout(()=>{ if(!this.game || this.game.time>=parseFloat(d.dataset.until||'0')) d.remove(); },2800);
  }

  subtitle(text,tag='SYS',dur=4){
    this.el.subtitle.classList.remove('hidden');
    this.el.subtitleText.innerHTML=`<span class="sub-tag">${tag}</span>${text}`;
    clearTimeout(this.subTimer);
    if(dur>0) this.subTimer=setTimeout(()=>this.el.subtitle.classList.add('hidden'),dur*1000);
  }

  setSubtitle(text,tag='SYS'){
    this.el.subtitle.classList.remove('hidden');
    this.el.subtitleText.innerHTML=`<span class="sub-tag">${tag}</span>${text}`;
  }
  hideSubtitle(){ this.el.subtitle.classList.add('hidden'); }

  showBanner(text,sub=''){
    this.el.banner.classList.remove('hidden');
    this.el.bannerText.innerHTML=text;
    this.bannerUntil=(this.game?this.game.time:0)+2.2;
    clearTimeout(this.bannerTimer);
  }

  showBossBanner(en){
    this.el.bossBanner.classList.remove('hidden');
    this.el.bossName.textContent=DATA.ENEMIES[en.type].name;
    this.el.bossSub.textContent=DATA.ENEMIES[en.type].en+' · 威胁等级跃升';
    this.bossBannerUntil=(this.game?this.game.time:0)+3.2;
    clearTimeout(this.bossTimer);
  }

  /* ---------- 战斗刷新 ---------- */
  refreshAll(){
    if(!this.game) return;
    const g=this.game;
    this.updateTransients();
    this.setTxt(this.el.compute,g.compute|0);
    this.setTxt(this.el.intel,g.intel|0);
    this.setTxt(this.el.core,g.core|0);
    this.el.coreFill.style.width=Math.max(0,g.core)+'%';
    this.el.coreFill.style.background=g.core>50?'linear-gradient(90deg,#2fd6b8,#6cf0a8)':g.core>25?'linear-gradient(90deg,#ffb85c,#ffd166)':'linear-gradient(90deg,#ff5d72,#ff8a5c)';
    this.setTxt(this.el.wave,(Math.min(g.waveIndex+1,g.waves.length))+' / '+g.waves.length);
    // 塔卡可用性
    document.querySelectorAll('.tower-card').forEach(c=>{
      const d=DATA.TOWERS[c.dataset.type];
      c.classList.toggle('unaffordable',g.compute<d.cost);
    });
    document.querySelectorAll('.item-card').forEach(c=>{
      const id=c.dataset.item, d=DATA.ITEMS[id];
      const res=d.res==='intel'?g.intel:g.compute;
      const cd=Math.max(0,(g.itemCds[id]||0)-g.time);
      c.classList.toggle('unaffordable',res<d.cost);
      c.classList.toggle('cooling',cd>0);
      const cdEl=c.querySelector('.ic-cd'); if(cdEl) cdEl.textContent=Math.ceil(cd);
    });
    this.updateForecast();
    this.refreshSelection();
  }

  setTxt(el,v){ if(el && el.textContent!==String(v)) el.textContent=v; }

  updateTransients(){
    if(!this.game) return;
    const t=this.game.time;
    for(const d of [...this.el.toast.children]){
      const until=parseFloat(d.dataset.until||'0');
      if(t>=until) d.remove();
    }
    if(this.bannerUntil && t>=this.bannerUntil){ this.el.banner.classList.add('hidden'); this.bannerUntil=0; }
    if(this.bossBannerUntil && t>=this.bossBannerUntil){ this.el.bossBanner.classList.add('hidden'); this.bossBannerUntil=0; }
  }

  updateForecast(){
    const g=this.game; if(!g) return;
    const w=g.waves[g.waveIndex];
    if(!w){ this.el.forecastBody.innerHTML='<div class="fc-wave-title">全部波次已清空</div>'; this.el.waveBtn.textContent='防御完成'; this.el.waveBtn.disabled=true; return; }
    this.el.forecastTag.textContent=g.waveActive?'LIVE':'NEXT';
    this.el.forecastTag.style.color=g.waveActive?'#ff5d72':'#5ce9ff';
    const chips={};
    for(const gr of w.groups){ chips[gr.entry]=chips[gr.entry]||{}; chips[gr.entry][gr.type]=(chips[gr.entry][gr.type]||0)+gr.n; }
    let html=`<div class="fc-wave-title">第 ${g.waveIndex+1} 波 · ${w.label}${w.peak?' <span class="fc-peak">洪峰</span>':''}${w.boss?' <span class="fc-boss">BOSS</span>':''}</div>`;
    for(const e in chips){
      html+=`<div class="fc-row"><span class="fc-ent">${e}</span><span class="fc-chips">`;
      for(const t in chips[e]) html+=`<span class="fc-chip">${DATA.ENEMIES[t]?DATA.ENEMIES[t].name:t} ×<b>${chips[e][t]}</b></span>`;
      html+='</span></div>';
    }
    this.el.forecastBody.innerHTML=html;
    this.el.forecastNote.textContent=w.note||'';
    this.el.waveBtn.textContent=g.waveActive?'第 '+(g.waveIndex+1)+' 波进行中':'开始下一波';
    this.el.waveBtn.disabled=g.waveActive;
  }

  onWaveStart(w){
    this.showBanner(`第 ${this.game.waveIndex+1} 波 · <b>${w.label}</b>`,w.note||'');
    this.updateForecast();
  }
  onWaveClear(){ this.toast('波次清空 · 情报与算力已回收','good'); this.updateForecast(); }
  onBossSpawn(en){ this.showBossBanner(en); this.toast('Boss 登场：'+DATA.ENEMIES[en.type].name,'warn'); }
  onBossKilled(en){ this.toast(DATA.ENEMIES[en.type].name+' 已被击退','good'); }

  /* ---------- 选中面板 ---------- */
  selectTower(t){
    const d=DATA.TOWERS[t.type];
    const s=this.game.statsFor(t);
    const hpPct=Math.max(0,t.hp/t.maxHp*100);
    const canUp=t.level<2;
    const upCost=d.level2?d.level2.cost:100;
    const isBranch=t.type==='honeypot'||t.type==='interceptor';
    let html=`<div class="sp-head"><div class="sp-icon">${DATA.ICONS[d.icon]}</div><div><div class="sp-title">${d.name} <span class="sp-tag tag-cyan">Lv.${t.level}</span>${t.branch?`<span class="sp-tag tag-violet">${d.branches[t.branch].name}</span>`:''}</div><div class="sp-sub">${d.en} · ${d.role}</div></div><button class="sp-close">✕</button></div>`;
    html+=`<div class="sp-row"><span>生命</span><b>${Math.ceil(t.hp)} / ${t.maxHp}</b></div><div class="sp-bar hp"><i style="width:${hpPct}%"></i></div>`;
    if(t.shield>0) html+=`<div class="sp-row"><span>护盾</span><b style="color:#4fc3ff">${Math.ceil(t.shield)}</b></div>`;
    if(t.encryptedUntil>this.game.time) html+=`<div class="sp-row"><span>状态</span><b style="color:#b58cff">加密中 ${Math.ceil(t.encryptedUntil-this.game.time)}s</b></div>`;
    if(d.range) html+=`<div class="sp-row"><span>射程</span><b>${s.range}</b></div>`;
    if(t.type==='interceptor') html+=`<div class="sp-row"><span>朝向</span><b>${this.facingName(t.facing)}</b></div>`;
    if(s.dmg) html+=`<div class="sp-row"><span>伤害 / 射速</span><b>${s.dmg} / ${s.rate.toFixed(2)}s</b></div>`;
    if(s.block) html+=`<div class="sp-row"><span>阻挡容量</span><b>${s.block}（占用 ${this.game.blockUsed(t)}）</b></div>`;
    if(s.heal) html+=`<div class="sp-row"><span>治疗 / 秒</span><b>${s.heal}</b></div>`;
    if(s.lure) html+=`<div class="sp-row"><span>诱敌半径</span><b>${s.lure}</b></div>`;
    if(t.nodeIsolation) html+=`<div class="sp-row"><span>节点隔离</span><b style="color:#ff5d72">生效中</b></div>`;
    html+=`<div class="sp-desc">${d.detail}</div>`;
    html+='<div class="sp-actions">';
    if(canUp){
      if(isBranch && !t.branch){
        html+=`<div class="sp-branch">`;
        for(const k in d.branches){ const b=d.branches[k]; html+=`<button class="branch-btn" data-branch="${k}">${b.name}<small>情报 ${b.intel} + 算力 ${upCost}</small></button>`; }
        html+='</div>';
      } else {
        html+=`<button class="btn" data-act="upgrade">升级到 2 级 <small>⬡ ${upCost}${t.branch?'':' · 情报 '+(d.branches?d.branches[t.branch||'lure']?.intel||0:0)}</small></button>`;
      }
    }
    if(d.skill){
      const cd=Math.max(0,t.skillCd-this.game.time);
      html+=`<div class="sp-skill" data-act="skill"><div class="sk-name">${d.skill.name}<span class="sk-cd">${cd>0?Math.ceil(cd)+'s':'就绪'}</span></div><div class="sk-desc">${d.skill.desc}</div></div>`;
    }
    html+=`<button class="btn" data-act="sell">撤下 <small>返还 ⬡ ${Math.floor(t.totalCost*.6)}</small></button>`;
    html+='</div>';
    this.el.selectBody.innerHTML=html;
    this.el.selectPanel.classList.remove('hidden');
    const close=this.el.selectBody.querySelector('.sp-close'); if(close) close.onclick=()=>this.game.select(null,null);
    this.el.selectBody.querySelectorAll('[data-branch]').forEach(b=>b.onclick=()=>{ const r=this.game.upgradeTower(t.id,b.dataset.branch); if(!r.ok) this.toast(r.reason,'warn'); else { this.toast('分支已选择：'+d.branches[b.dataset.branch].name,'intel'); this.refreshSelection(); } });
    const up=this.el.selectBody.querySelector('[data-act="upgrade"]'); if(up) up.onclick=()=>{ const r=this.game.upgradeTower(t.id); if(!r.ok) this.toast(r.reason,'warn'); else { this.toast('升级完成','good'); this.refreshSelection(); } };
    const sk=this.el.selectBody.querySelector('[data-act="skill"]'); if(sk) sk.onclick=()=>{ const r=this.game.useSkill(t.id); if(!r.ok) this.toast(r.reason,'warn'); else this.toast('技能释放','good'); };
    const sell=this.el.selectBody.querySelector('[data-act="sell"]'); if(sell) sell.onclick=()=>{ this.game.sellTower(t.id); this.el.selectPanel.classList.add('hidden'); };
  }

  facingName(a){
    const dirs=['南','东南','东','东北','北','西北','西','西南'];
    let i=Math.round(((a%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/(Math.PI/4))%8;
    return dirs[i]+' · '+Math.round(((a*180/Math.PI)%360+360)%360)+'°';
  }

  selectEnemy(en){
    const d=DATA.ENEMIES[en.type];
    let html=`<div class="sp-head"><div class="sp-icon">${DATA.ICONS[en.type]||'?'}</div><div><div class="sp-title">${d.name}${en.boss?' <span class="sp-tag tag-red">BOSS</span>':''}</div><div class="sp-sub">${d.en}</div></div><button class="sp-close">✕</button></div>`;
    html+=`<div class="sp-row"><span>生命</span><b>${Math.max(0,Math.ceil(en.hp))} / ${en.maxHp}</b></div><div class="sp-bar hp"><i style="width:${Math.max(0,en.hp/en.maxHp*100)}%"></i></div>`;
    if(en.shield>0) html+=`<div class="sp-row"><span>护盾</span><b style="color:#4fc3ff">${Math.ceil(en.shield)}</b></div>`;
    if(en.disguised && !en.revealed) html+=`<div class="sp-row"><span>状态</span><b style="color:#b58cff">伪装中 · 不可被拦截器选中</b></div>`;
    else if(en.revealed && en.disguised) html+=`<div class="sp-row"><span>状态</span><b style="color:#ffd166">已显形</b></div>`;
    if(en.rootUntil>this.game.time) html+=`<div class="sp-row"><span>状态</span><b style="color:#ffb85c">停滞</b></div>`;
    if(en.flying) html+=`<div class="sp-row"><span>层</span><b>无线层 · 无视地面阻挡</b></div>`;
    if(en.boss && DATA.BOSS_PHASES[en.type]){
      const ph=DATA.BOSS_PHASES[en.type][Math.min(en.phase-1,DATA.BOSS_PHASES[en.type].length-1)];
      html+=`<div class="sp-row"><span>阶段</span><b style="color:#ff5d72">${ph.name}</b></div>`;
      if(en.armor) html+=`<div class="sp-row"><span>护甲</span><b>${Math.round(en.armor*100)}%</b></div>`;
    }
    html+=`<div class="sp-desc">${d.desc}</div><div class="sp-desc" style="color:#ffb85c">${d.tip}</div>`;
    this.el.selectBody.innerHTML=html; this.el.selectPanel.classList.remove('hidden');
    const close=this.el.selectBody.querySelector('.sp-close'); if(close) close.onclick=()=>this.game.select(null,null);
  }

  selectCell(cell){
    const ch=this.game.map.cell(cell.x,cell.z);
    const names={'.':'链路','n':'交换节点','p':'设备平台','o':'旧链路','#':'障碍'};
    const st=this.game.nodeState(cell);
    const lock=this.game.lockCells.get(cell.x+','+cell.z);
    if(lock && lock.expires>this.game.time){
      html+=`<div class="sp-row"><span>通行状态</span><b style="color:#ff5d72">Boss 封锁 · ${Math.ceil(lock.expires-this.game.time)}s</b></div>`;
    }
    let html=`<div class="sp-head"><div class="sp-icon" style="font-size:1.4rem">${ch==='n'?'⬡':ch==='p'?'▦':ch==='o'?'≋':'▤'}</div><div><div class="sp-title">${names[ch]||'未知'} · ${cell.x+1},${cell.z+1}</div><div class="sp-sub">TERRAIN</div></div><button class="sp-close">✕</button></div>`;
    if(ch==='n'){
      html+=`<div class="sp-row"><span>通行状态</span><b style="color:${st&&st.active?'#ff5d72':'#6cf0a8'}">${st&&st.active?'已隔离':'直通'}</b></div>`;
      if(st&&st.active) html+=`<div class="sp-row"><span>隔离耐久</span><b>${Math.max(0,Math.ceil(st.hp))} / ${st.maxHp}</b></div>`;
      if(st&&st.reopenAt>this.game.time) html+=`<div class="sp-row"><span>再隔离间隔</span><b>${Math.ceil(st.reopenAt-this.game.time)}s</b></div>`;
      html+='<div class="sp-desc">交换节点。部署网闸、防火墙或应急隔离器可截断道路，改变各入口的路线。</div>';
    } else if(ch==='p'){
      html+='<div class="sp-desc">设备平台：可部署拦截器、沙箱和修复进程。敌人不能通行，平台上的塔可被勒索者远程攻击。</div>';
    } else if(ch==='o'){
      html+='<div class="sp-desc">旧链路：保留旧协议的道路。地面敌人减速 38%，伪装的木马经过时显形。部署防火墙或蜜罐可以阻挡。</div>';
    } else if(ch==='#'){
      html+='<div class="sp-desc">数据设施 / 公网流 / 气隙：不可通行，也不可部署。</div>';
    } else {
      html+='<div class="sp-desc">链路：恶意程序与业务流量经过的道路。防火墙和蜜罐可以部署，并阻挡敌人。</div>';
    }
    const t=this.game.towerAt(cell);
    if(t) html+=`<div class="sp-row"><span>设备</span><b>${DATA.TOWERS[t.type].name} Lv.${t.level}</b></div>`;
    this.el.selectBody.innerHTML=html; this.el.selectPanel.classList.remove('hidden');
    const close=this.el.selectBody.querySelector('.sp-close'); if(close) close.onclick=()=>this.game.select(null,null);
  }

  refreshSelection(){
    if(!this.game) return;
    const sel=this.game.selected;
    if(sel){
      const t=this.game.towerById(sel);
      if(t){ this.selectTower(t); }
      return;
    }
    if(this.selEnemyId){
      const e=this.game.enemyById(this.selEnemyId);
      if(e) this.selectEnemy(e); else { this.selEnemyId=null; this.el.selectPanel.classList.add('hidden'); }
      return;
    }
    if(this.selCell){ this.selectCell(this.selCell); }
  }

  onSelect(kind,id){
    this.selEnemyId=kind==='enemy'?id:null;
    this.selCell=kind==='cell'?id:null;
    if(kind==='tower'){
      const t=this.game.towerById(id); if(t) this.selectTower(t);
    } else if(kind==='enemy'){
      const e=this.game.enemyById(id); if(e) this.selectEnemy(e);
    } else if(kind==='cell'){
      this.selectCell(id);
    } else {
      this.el.selectPanel.classList.add('hidden');
    }
  }
  onSelectionCleared(){ this.selEnemyId=null; this.selCell=null; this.el.selectPanel.classList.add('hidden'); }

  onTowerBuilt(t){ this.toast('已部署 '+DATA.TOWERS[t.type].name,'good'); }
  onTowerUpgraded(t){ this.toast('升级完成','good'); this.world.selectTower(t.id); }
  onTowerRemoved(){ this.el.selectPanel.classList.add('hidden'); }
  onIsolationChanged(){ this.buildRouteLegend(); }
  onPlacementStart(type){
    this.placeMode=true;
    this.el.confirm.classList.remove('hidden');
    this.el.confirmText.textContent='移动预览 · 左键确认 · 右键 / Esc 取消'+(type==='interceptor'?' · Q/E 转向':'');
    document.querySelectorAll('.tower-card').forEach(c=>c.classList.toggle('placing',c.dataset.type===type));
  }
  onPlacementEnd(){
    this.placeMode=false;
    this.el.confirm.classList.add('hidden');
    this.el.ghost.classList.add('hidden');
    document.querySelectorAll('.tower-card').forEach(c=>c.classList.remove('placing'));
  }
  onItemStart(id){ this.itemMode=id; }
  onItemEnd(){ this.itemMode=null; this.el.confirm.classList.add('hidden'); }

  /* ---------- 结算 ---------- */
  showReport(win,g){
    this.game=g;
    const mins=Math.floor(g.time/60), secs=Math.floor(g.time%60);
    document.getElementById('report-status').textContent=win?'防线稳固 · 汐域连通':'中枢失守 · 防御终止';
    document.getElementById('report-status').classList.toggle('win',win);
    document.getElementById('report-title').textContent=g.map.name+' · '+(win?'防御成功':'防御终止');
    document.getElementById('report-time').textContent='用时 '+mins+':'+String(secs).padStart(2,'0')+' · 波次 '+Math.min(g.waveIndex,g.waves.length)+' / '+g.waves.length;
    document.getElementById('rep-kills').textContent=g.stats.kills;
    document.getElementById('rep-built').textContent=g.stats.built;
    document.getElementById('rep-lost').textContent=g.stats.lost;
    document.getElementById('rep-leaks').textContent=g.stats.leaks;
    document.getElementById('rep-intel').textContent=g.stats.intelEarned;
    const score=(win?60:0)+g.stats.kills*0.6-g.stats.leaks*3-g.stats.lost*1.2;
    const grade=score>90?'S':score>75?'A':score>55?'B':score>35?'C':'D';
    document.getElementById('rep-grade').textContent=grade;
    const log=document.getElementById('rep-log'); log.innerHTML='';
    for(const l of g.logs.slice(-18)){
      const d=document.createElement('div'); d.className=l.type==='bad'?'lg-bad':l.type==='ok'?'lg-ok':'lg-warn';
      const t=Math.floor(l.t/60)+':'+String(Math.floor(l.t%60)).padStart(2,'0');
      d.textContent=`[${t}] ${l.text}`; log.appendChild(d);
    }
    this.showScreen('report');
    AudioSys.sfx(win?'win':'lose');
  }

  /* ---------- 演示 UI ---------- */
  showDemoControls(show){
    this.demo=show;
    this.el.demoControls.classList.toggle('hidden',!show);
    if(!show) this.el.subtitle.classList.add('hidden');
  }
  updateDemoProgress(t,dur){
    this.el.demoProgress.style.width=Math.min(100,t/dur*100)+'%';
    const f=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
    this.el.demoTime.textContent=f(t)+' / '+f(dur);
  }
  demoCursor(x,y,visible=true){
    let c=document.getElementById('demo-cursor');
    if(!c){ c=document.createElement('div'); c.id='demo-cursor'; c.style.cssText='position:fixed;z-index:70;pointer-events:none;width:1.4rem;height:1.4rem;border-radius:50%;border:2px solid #5ce9ff;background:rgba(92,233,255,.18);box-shadow:0 0 1rem rgba(92,233,255,.8);transition:left .08s linear,top .08s linear;transform:translate(-50%,-50%)'; document.body.appendChild(c); }
    c.style.display=visible?'block':'none'; c.style.left=x+'px'; c.style.top=y+'px';
  }
  demoDragGhost(type,x,y,visible=true){
    const g=this.el.ghost;
    if(visible){ g.innerHTML=DATA.ICONS[DATA.TOWERS[type].icon]; g.classList.remove('hidden'); g.style.left=x+'px'; g.style.top=y+'px'; }
    else g.classList.add('hidden');
  }
  demoHighlightCard(type){
    document.querySelectorAll('.tower-card').forEach(c=>c.classList.toggle('placing',c.dataset.type===type));
  }
  demoHighlightItem(id){
    document.querySelectorAll('.item-card').forEach(c=>c.classList.toggle('placing',c.dataset.item===id));
  }
  demoSelectTower(id){
    document.querySelectorAll('.tower-card').forEach(c=>c.classList.remove('placing'));
  }

  onGameOver(win,g){ this.showReport(win,g); }
}