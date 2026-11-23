/* ui.js — 项目 / 时间轴 / 属性 / 曲线 / 效果 面板 */
(function(){
'use strict';
const UI = {};
window.UI = UI;

UI.tl = { pxPerSec:60, scrollX:0, scrollY:0, selKeys:[], boxSel:null, dragging:null };
UI.graph = { props:[], selProps:[], mode:'value', dragKey:null, range:null, scrollX:0, scrollY:0, pxPerSec:60 };
UI.comp = null;

const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));

/* ==================== 初始化 ==================== */
UI.init=function(){
  UI.renderMenus();
  UI.bindTimeline();
  UI.bindGraph();
  UI.bindProps();
  UI.bindTabs();
  Model.on('structure',()=>UI.refreshAll());
  Model.on('selection',()=>{ UI.renderTimeline(); UI.renderProps(); UI.renderProject(); UI.renderGraph(); });
  Model.on('time',()=>{ UI.updateHUD(); });
  Model.on('history',()=>{});
  setInterval(()=>UI.updateStats(),1000);
};

UI.refreshAll=function(){
  UI.renderProject();
  UI.renderTimeline();
  UI.renderProps();
  UI.renderFX();
  UI.renderGraph();
  UI.renderAudio();
  UI.updateHUD();
};

/* ==================== 菜单 ==================== */
UI.renderMenus=function(){
  const menus=[
    {n:'文件',items:[['新建工程',()=>Editor.newProject()],['打开工程…',()=>$('#file-open').click()],['保存工程',()=>Editor.saveProject()],['导出工程文件',()=>Model.exportFile()],['载入示例',()=>Demo.load()]]},
    {n:'编辑',items:[['撤销',()=>Editor.undo(),'Ctrl+Z'],['重做',()=>Editor.redo(),'Ctrl+Y'],['全选关键帧',()=>Editor.selectAllKeys()],['清除关键帧',()=>Editor.clearKeys()]]},
    {n:'合成',items:[['新建合成',()=>Editor.newCompDialog()],['合成设置…',()=>Editor.compSettings()],['预合成所选图层',()=>Editor.precompose(),'Ctrl+Shift+C'],['添加场',()=>Editor.addFieldDialog()]]},
    {n:'图层',items:[['新建形状图层',()=>Editor.addLayer('shape')],['新建文字图层',()=>Editor.addLayer('text')],['新建空对象',()=>Editor.addLayer('null')],['新建调整图层',()=>Editor.addLayer('adjust')],['新建三维几何',()=>Editor.addLayer('geometry3d')],['新建粒子',()=>Editor.addLayer('particle')],['新建摄像机',()=>Editor.addLayer('camera')],['新建灯光',()=>Editor.addLayer('light')],['新建音色',()=>Editor.addLayer('audio')],['复制图层',()=>Editor.duplicateLayer(),'Ctrl+D'],['删除图层',()=>Editor.deleteLayer(),'Delete']]},
    {n:'动画',items:[['添加关键帧',()=>Editor.addKeyToSelected(),'F6'],['缓入缓出',()=>Editor.easyEase(),'F9'],['循环 loopOut',()=>Editor.addLoopExpr()],['分离尺寸',()=>Editor.placeholder()]]},
    {n:'效果',items:[['高斯模糊',()=>Editor.addEffect('gaussianBlur')],['发光',()=>Editor.addEffect('glow')],['投影',()=>Editor.addEffect('dropShadow')],['色相/饱和度',()=>Editor.addEffect('hueSat')],['暗角',()=>Editor.addEffect('vignette')],['色差',()=>Editor.addEffect('chromatic')]]},
    {n:'视图',items:[['适配窗口',()=>Editor.fitView()],['放大',()=>Editor.zoom(1.2)],['缩小',()=>Editor.zoom(1/1.2)],['显示网格',()=>Editor.toggleGrid()],['显示辅助元素',()=>Editor.toggleHelpers()]]},
    {n:'帮助',items:[['快捷键',()=>Editor.showShortcuts()],['关于',()=>Editor.showAbout()]]},
  ];
  const box=$('#menus');
  box.innerHTML='';
  for(const m of menus){
    const d=document.createElement('div'); d.className='mb-menu'; d.textContent=m.n;
    const pop=document.createElement('div'); pop.className='hidden';
    pop.style.cssText='position:absolute;top:34px;background:#22262e;border:1px solid #3a4150;border-radius:6px;padding:4px 0;min-width:190px;z-index:200;box-shadow:0 8px 24px #000a';
    for(const it of m.items){
      const b=document.createElement('div');
      b.style.cssText='padding:5px 16px;cursor:pointer;color:#d7dce5;white-space:nowrap';
      b.textContent=it[0]+(it[2]?'   '+it[2]:'');
      b.onmouseenter=()=>b.style.background='#2b303a';
      b.onmouseleave=()=>b.style.background='transparent';
      b.onclick=()=>{ pop.classList.add('hidden'); it[1](); };
      pop.appendChild(b);
    }
    d.appendChild(pop);
    d.onmouseenter=()=>{ pop.classList.remove('hidden'); const r=d.getBoundingClientRect(); pop.style.left=r.left+'px'; };
    d.onmouseleave=()=>{ setTimeout(()=>{ if(!pop.matches(':hover')) pop.classList.add('hidden'); },120); };
    box.appendChild(d);
  }
};

/* ==================== 项目面板 ==================== */
UI.renderProject=function(){
  const tree=$('#project-tree');
  const list=$('#comp-list');
  if(!Model.project){ tree.innerHTML='<div class="pt-empty">空工程</div>'; list.innerHTML=''; return; }
  tree.innerHTML='';
  const root=document.createElement('div'); root.className='pt-item pt-folder'; root.textContent='📁 '+Model.project.name;
  tree.appendChild(root);
  const comps=document.createElement('div'); comps.className='pt-item'; comps.style.paddingLeft='20px';
  comps.innerHTML='<span class="pt-ico">🎬</span> 合成 ('+Model.project.comps.length+')';
  tree.appendChild(comps);
  list.innerHTML='';
  for(const c of Model.project.comps){
    const d=document.createElement('div');
    d.className='pt-item'+(c.id===Model.sel.compId?' active':'');
    d.innerHTML='<span class="pt-ico">🎬</span> '+U.escapeHtml(c.name)+' <span style="color:#6b7484;font-size:10px">'+c.width+'×'+c.height+' · '+c.fps+'fps · '+c.duration+'s</span>';
    d.onclick=()=>{ Model.select(c.id,[]); Editor.openComp(c.id); };
    d.ondblclick=()=>Editor.compSettings();
    list.appendChild(d);
  }
  $('#proj-stats').textContent=Model.project.comps.length+' 合成 / '+Model.project.comps.reduce((a,c)=>a+c.layers.length,0)+' 图层';
};

/* ==================== 时间轴 ==================== */
UI.bindTimeline=function(){
  const ruler=$('#tl-ruler'), tracks=$('#tl-tracks');
  ruler.addEventListener('mousedown',e=>{ UI.tl.dragging='playhead'; UI.timelineSeek(e); });
  window.addEventListener('mousemove',e=>{
    if(UI.tl.dragging==='playhead') UI.timelineSeek(e);
    else if(UI.tl.dragging==='key') UI.dragKey(e);
    else if(UI.tl.dragging==='box') UI.dragBox(e);
  });
  window.addEventListener('mouseup',()=>{ if(UI.tl.dragging==='key') Model.commit('移动关键帧'); UI.tl.dragging=null; });
  tracks.addEventListener('mousedown',e=>UI.trackMouseDown(e));
  tracks.addEventListener('dblclick',e=>UI.trackDblClick(e));
  tracks.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){ UI.zoomTl(e.deltaY<0?1.15:1/1.15,e); }
    else if(e.shiftKey){ UI.tl.scrollX=U.clamp(UI.tl.scrollX+e.deltaY*0.5,0,UI.tlMaxScroll()); UI.drawTimeline(); }
    else { UI.tl.scrollY=U.clamp(UI.tl.scrollY+e.deltaY,0,UI.tlMaxScrollY()); UI.syncTlScroll(); }
  },{passive:false});
  ruler.addEventListener('wheel',e=>{ e.preventDefault(); UI.zoomTl(e.deltaY<0?1.15:1/1.15,e); },{passive:false});
  $('#tl-layers').addEventListener('scroll',()=>{ UI.tl.scrollY=$('#tl-layers').scrollTop; UI.drawTimeline(); });
  $('#tl-scrollbar-thumb').addEventListener('mousedown',e=>{
    const startX=e.clientX, startScroll=UI.tl.scrollX;
    const move=ev=>{ UI.tl.scrollX=U.clamp(startScroll+(ev.clientX-startX),0,UI.tlMaxScroll()); UI.drawTimeline(); };
    const up=()=>{ window.removeEventListener('mousemove',move); window.removeEventListener('mouseup',up); };
    window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
  });
  window.addEventListener('keydown',e=>UI.timelineKey(e));
};
UI.timelineKey=function(e){
  if(Editor.isTyping()) return;
  if(e.key==='Delete'||e.key==='Backspace'){ Editor.deleteSelectedKeys(); }
};
UI.tlMaxScroll=function(){ const c=Model.currentComp(); if(!c) return 0; return Math.max(0,c.duration*UI.tl.pxPerSec-UI.tlWidth()+20); };
UI.tlMaxScrollY=function(){ const c=Model.currentComp(); if(!c) return 0; return Math.max(0,c.layers.length*22-UI.tlHeight()); };
UI.tlWidth=function(){ return $('#tl-tracks-wrap').clientWidth; };
UI.tlHeight=function(){ return $('#tl-tracks-wrap').clientHeight; };
UI.tlTimeAt=function(e){
  const r=$('#tl-tracks').getBoundingClientRect();
  const x=(e.clientX-r.left)+UI.tl.scrollX;
  const c=Model.currentComp();
  return U.clamp(x/UI.tl.pxPerSec,0,c?c.duration:0);
};
UI.timelineSeek=function(e){
  const c=Model.currentComp(); if(!c) return;
  Editor.setTime(UI.tlTimeAt(e));
};
UI.trackMouseDown=function(e){
  const c=Model.currentComp(); if(!c) return;
  const r=$('#tl-tracks').getBoundingClientRect();
  const y=e.clientY-r.top+UI.tl.scrollY;
  const row=Math.floor(y/22);
  const x=e.clientX-r.left+UI.tl.scrollX;
  const t=x/UI.tl.pxPerSec;
  const hit=UI.hitKey(row,t);
  if(hit){
    if(e.shiftKey){ UI.toggleKeySel(hit); }
    else if(!UI.keySelected(hit)){ UI.tl.selKeys=[hit]; }
    UI.tl.dragging='key';
    UI.tl.dragStart={x:e.clientX,keys:UI.tl.selKeys.map(k=>({...k}))};
    UI.drawTimeline();
    return;
  }
  if(e.shiftKey){
    UI.tl.dragging='box';
    UI.tl.boxSel={x0:e.clientX,x1:e.clientX,y0:e.clientY,y1:e.clientY};
    return;
  }
  UI.tl.selKeys=[];
  UI.tl.dragging='playhead';
  UI.timelineSeek(e);
  UI.drawTimeline();
};
UI.trackDblClick=function(e){
  const c=Model.currentComp(); if(!c) return;
  const r=$('#tl-tracks').getBoundingClientRect();
  const y=e.clientY-r.top+UI.tl.scrollY;
  const row=Math.floor(y/22);
  const layer=c.layers[row];
  if(!layer) return;
  Model.select(c.id,[layer.id]);
  const path=UI.pickAnimatablePath(layer);
  if(path) Editor.addKeyAtTime(layer,path,UI.tlTimeAt(e));
  UI.drawTimeline();
};
UI.pickAnimatablePath=function(layer){
  const g=Model.TYPE_GROUPS[layer.type]||[];
  for(const key of g){
    const sch=Model.SCHEMA.find(s=>s.key===key);
    if(sch) for(const p of sch.props){ if(p.t==='num'||p.t==='vec2'||p.t==='vec3'||p.t==='color') return p.p; }
  }
  return 'transform.position';
};
UI.hitKey=function(row,t){
  const c=Model.currentComp(); if(!c) return null;
  const layer=c.layers[row];
  if(!layer) return null;
  for(const path of Object.keys(layer.kf)){
    const keys=layer.kf[path].keys;
    for(let i=0;i<keys.length;i++){
      const k=keys[i];
      const x=k.t*UI.tl.pxPerSec-UI.tl.scrollX;
      if(Math.abs(x-(t*UI.tl.pxPerSec-UI.tl.scrollX))<7){ return {layerId:layer.id,path,index:i,key:k}; }
    }
  }
  return null;
};
UI.keySelected=function(h){ return UI.tl.selKeys.some(k=>k.layerId===h.layerId&&k.path===h.path&&k.index===h.index); };
UI.toggleKeySel=function(h){
  if(UI.keySelected(h)) UI.tl.selKeys=UI.tl.selKeys.filter(k=>!(k.layerId===h.layerId&&k.path===h.path&&k.index===h.index));
  else UI.tl.selKeys.push(h);
  UI.drawTimeline();
};
UI.dragKey=function(e){
  const c=Model.currentComp(); if(!c||!UI.tl.dragStart) return;
  const dx=e.clientX-UI.tl.dragStart.x;
  const dt=dx/UI.tl.pxPerSec;
  for(const sk of UI.tl.selKeys){
    const layer=Model.findLayer(c,sk.layerId); if(!layer) continue;
    const keys=Model.getKeys(layer,sk.path); if(!keys) continue;
    const orig=UI.tl.dragStart.keys.find(k=>k.layerId===sk.layerId&&k.path===sk.path&&k.index===sk.index);
    if(!orig) continue;
    keys[sk.index].t=U.clamp(orig.key.t+dt,0,c.duration);
    keys.sort((a,b)=>a.t-b.t);
  }
  UI.drawTimeline();
};
UI.dragBox=function(e){
  UI.tl.boxSel.x1=e.clientX; UI.tl.boxSel.y1=e.clientY;
  UI.drawTimeline();
};
UI.zoomTl=function(f,e){
  const c=Model.currentComp(); if(!c) return;
  const r=$('#tl-tracks').getBoundingClientRect();
  const mx=(e? e.clientX-r.left : UI.tlWidth()/2)+UI.tl.scrollX;
  const t=mx/UI.tl.pxPerSec;
  UI.tl.pxPerSec=U.clamp(UI.tl.pxPerSec*f,4,600);
  UI.tl.scrollX=U.clamp(t*UI.tl.pxPerSec-mx,0,UI.tlMaxScroll());
  UI.drawTimeline();
};
UI.syncTlScroll=function(){ $('#tl-layers').scrollTop=UI.tl.scrollY; UI.drawTimeline(); };

UI.renderTimeline=function(){
  const c=Model.currentComp();
  const box=$('#tl-layers');
  box.innerHTML='';
  if(!c){ UI.drawTimeline(); return; }
  $('#tl-dur').textContent=U.formatTime(c.duration,c.fps);
  $('#tl-fps').textContent=c.fps+'fps';
  const sel=new Set(Model.sel.layerIds);
  for(let i=0;i<c.layers.length;i++){
    const l=c.layers[i];
    const row=document.createElement('div');
    row.className='tl-row'+(sel.has(l.id)?' selected':'')+((l.visible===false)?' muted':'');
    const labels={normal:'正常',add:'相加',screen:'滤色',multiply:'正片叠底',overlay:'叠加'};
    row.innerHTML=
      '<div class="tl-cell '+(l.visible!==false?'on':'')+'" data-f="vis" title="显示/隐藏"></div>'+
      '<div class="tl-cell '+(l.locked?'on lock':'')+'" data-f="lock" title="锁定"></div>'+
      '<div class="tl-cell" data-f="solo" title="独奏">S</div>'+
      '<div class="tl-blend" data-f="blend" title="混合模式">'+(labels[l.blendMode]||'正常')+'</div>'+
      '<div class="tl-parent" data-f="parent" title="父级">'+(l.parent? U.escapeHtml((Model.getLayer(l.parent)||{}).name||''):'⌄')+'</div>'+
      '<div class="tl-name">'+U.escapeHtml(l.name)+'</div>'+
      '<div class="tl-cell '+(l.motionBlur!==false?'on':'')+'" data-f="mb" title="运动模糊">MB</div>'+
      '<div class="tl-io">'+l.inPoint.toFixed(1)+'-'+l.outPoint.toFixed(1)+'</div>';
    row.querySelectorAll('[data-f]').forEach(el=>{
      el.onmousedown=e=>{ e.stopPropagation(); UI.layerSwitch(l,el.dataset.f); };
    });
    row.querySelector('.tl-name').onmousedown=e=>{
      if(e.shiftKey){ if(sel.has(l.id)){ Model.sel.layerIds=Model.sel.layerIds.filter(x=>x!==l.id);} else Model.sel.layerIds.push(l.id); }
      else Model.sel.layerIds=[l.id];
      Model.emit('selection');
    };
    box.appendChild(row);
  }
  UI.tl.scrollY=U.clamp(UI.tl.scrollY,0,Math.max(0,c.layers.length*22-UI.tlHeight()));
  UI.syncTlScroll();
};
UI.layerSwitch=function(l,f){
  const c=Model.layerComp(l);
  if(f==='vis') l.visible=!l.visible;
  else if(f==='lock') l.locked=!l.locked;
  else if(f==='solo') l.solo=!l.solo;
  else if(f==='mb') l.motionBlur=!l.motionBlur;
  else if(f==='blend'){
    const modes=['normal','add','screen','multiply','overlay'];
    const labels={normal:'正常',add:'相加',screen:'滤色',multiply:'正片叠底',overlay:'叠加'};
    const i=(modes.indexOf(l.blendMode)+1)%modes.length;
    l.blendMode=modes[i];
    Editor.toast('混合模式：'+labels[l.blendMode]);
  }
  else if(f==='parent'){
    const names=c.layers.filter(x=>x!==l&&x.type!=='audio').map((x,i)=>i+':'+x.name);
    const v=prompt('输入父级图层编号（留空解除）:\n'+names.join('  '));
    if(v===null) return;
    if(v===''){ Model.setParent(l,null); }
    else{ const idx=parseInt(v,10); if(c.layers[idx]) Model.setParent(l,c.layers[idx].id); }
  }
  Model.commit('图层开关');
  Model.emit('structure');
};

UI.drawTimeline=function(){
  const c=Model.currentComp();
  const ruler=$('#tl-ruler'), tracks=$('#tl-tracks');
  const rw=ruler.clientWidth, rh=ruler.clientHeight;
  const tw=tracks.clientWidth, th=tracks.clientHeight;
  if(rw<2||tw<2) return;
  if(ruler.width!==Math.round(rw*R.dpr)||ruler.height!==Math.round(rh*R.dpr)){ ruler.width=Math.round(rw*R.dpr); ruler.height=Math.round(rh*R.dpr); }
  if(tracks.width!==Math.round(tw*R.dpr)||tracks.height!==Math.round(th*R.dpr)){ tracks.width=Math.round(tw*R.dpr); tracks.height=Math.round(th*R.dpr); }
  const rc=ruler.getContext('2d'); rc.setTransform(R.dpr,0,0,R.dpr,0,0);
  rc.clearRect(0,0,rw,rh);
  rc.fillStyle='#22262e'; rc.fillRect(0,0,rw,rh);
  const tc=tracks.getContext('2d'); tc.setTransform(R.dpr,0,0,R.dpr,0,0);
  tc.clearRect(0,0,tw,th);
  tc.fillStyle='#191c22'; tc.fillRect(0,0,tw,th);
  if(!c) return;
  const pps=UI.tl.pxPerSec;
  const t0=UI.tl.scrollX/pps, t1=(UI.tl.scrollX+tw)/pps;
  rc.fillStyle='#6b7484'; rc.font='10px Consolas,monospace';
  const step=UI.rulerStep(pps);
  for(let t=Math.floor(t0/step)*step; t<=t1; t+=step){
    const x=t*pps-UI.tl.scrollX;
    rc.strokeStyle='#3a4150'; rc.beginPath(); rc.moveTo(x,rh-6); rc.lineTo(x,rh); rc.stroke();
    rc.fillText(U.formatTime(t,c.fps),x+3,rh-8);
  }
  const wx0=c.workStart*pps-UI.tl.scrollX, wx1=c.workEnd*pps-UI.tl.scrollX;
  tc.fillStyle='rgba(79,156,249,0.07)'; tc.fillRect(wx0,0,Math.max(0,wx1-wx0),th);
  tc.strokeStyle='#4f9cf9'; tc.beginPath(); tc.moveTo(wx0,0); tc.lineTo(wx0,th); tc.moveTo(wx1,0); tc.lineTo(wx1,th); tc.stroke();
  const sel=new Set(Model.sel.layerIds);
  for(let i=0;i<c.layers.length;i++){
    const l=c.layers[i];
    const y=i*22-UI.tl.scrollY;
    if(y<-22||y>th+22) continue;
    tc.fillStyle=sel.has(l.id)?'#2a3550':(i%2?'#1d2027':'#191c22');
    tc.fillRect(0,y,tw,22);
    tc.strokeStyle='#262a32'; tc.beginPath(); tc.moveTo(0,y+22); tc.lineTo(tw,y+22); tc.stroke();
    const ix0=l.inPoint*pps-UI.tl.scrollX, ix1=l.outPoint*pps-UI.tl.scrollX;
    tc.fillStyle='rgba(79,156,249,0.10)'; tc.fillRect(ix0,y,Math.max(0,ix1-ix0),22);
    for(const path of Object.keys(l.kf)){
      const keys=l.kf[path].keys;
      for(let k=0;k<keys.length;k++){
        const x=keys[k].t*pps-UI.tl.scrollX;
        if(x<-8||x>tw+8) continue;
        const isSel=UI.keySelected({layerId:l.id,path,index:k});
        tc.fillStyle=isSel?'#ffffff':(keys[k].interp==='bezier'?'#f2c14e':'#e08a3c');
        tc.beginPath();
        tc.moveTo(x,y+6); tc.lineTo(x+5,y+11); tc.lineTo(x,y+16); tc.lineTo(x-5,y+11); tc.closePath(); tc.fill();
      }
    }
    if(l.expr) for(const path of Object.keys(l.expr)){
      const ks=l.kf[path]?l.kf[path].keys:null;
      const x0=(ks&&ks.length?ks[0].t:0)*pps-UI.tl.scrollX;
      const x1=(ks&&ks.length?ks[ks.length-1].t:c.duration)*pps-UI.tl.scrollX;
      tc.strokeStyle='#ff7a3c'; tc.setLineDash([3,3]);
      tc.beginPath(); tc.moveTo(Math.max(0,x0),y+11); tc.lineTo(Math.min(tw,x1),y+11); tc.stroke();
      tc.setLineDash([]);
    }
  }
  if(UI.tl.boxSel){
    const b=UI.tl.boxSel;
    const r=tracks.getBoundingClientRect();
    const x=Math.min(b.x0,b.x1)-r.left, y=Math.min(b.y0,b.y1)-r.top;
    tc.strokeStyle='#4f9cf9'; tc.fillStyle='rgba(79,156,249,0.12)';
    tc.fillRect(x,y,Math.abs(b.x1-b.x0),Math.abs(b.y1-b.y0));
    tc.strokeRect(x,y,Math.abs(b.x1-b.x0),Math.abs(b.y1-b.y0));
  }
  const t=Editor.time||0;
  const px=t*pps-UI.tl.scrollX;
  tc.strokeStyle='#e8eefc'; tc.lineWidth=1;
  tc.beginPath(); tc.moveTo(px,0); tc.lineTo(px,th); tc.stroke();
  rc.strokeStyle='#e8eefc'; rc.beginPath(); rc.moveTo(px,0); rc.lineTo(px,rh); rc.stroke();
  rc.fillStyle='#e8eefc';
  rc.beginPath(); rc.moveTo(px-5,0); rc.lineTo(px+5,0); rc.lineTo(px,7); rc.closePath(); rc.fill();
  const max=UI.tlMaxScroll();
  const thumb=$('#tl-scrollbar-thumb');
  if(max>0){
    const w=Math.max(40,tw/(tw+max)*tw);
    thumb.style.width=w+'px';
    thumb.style.left=(UI.tl.scrollX/max*(tw-w))+'px';
    thumb.style.display='block';
  } else thumb.style.display='none';
};
UI.rulerStep=function(pps){
  const steps=[0.033,0.1,0.25,0.5,1,2,5,10,30,60];
  for(const s of steps){ if(s*pps>=55) return s; }
  return 120;
};

/* ==================== 属性面板 ==================== */
UI.bindProps=function(){
  $('#expr-apply').onclick=()=>UI.applyExpr();
  $('#expr-close').onclick=()=>UI.closeExpr();
};
UI.exprTarget=null;
UI.renderProps=function(){
  const layer=Model.selectedLayers()[0];
  const box=$('#prop-scroll');
  const empty=$('#prop-empty');
  const content=$('#prop-content');
  if(!layer){ empty.classList.remove('hidden'); content.classList.add('hidden'); $('#prop-layer-name').textContent=''; return; }
  empty.classList.add('hidden'); content.classList.remove('hidden');
  $('#prop-layer-name').textContent=layer.name+' · '+(Model.TYPE_LABEL[layer.type]||layer.type);
  box.innerHTML='';
  const groups=Model.TYPE_GROUPS[layer.type]||['transform'];
  for(const g of groups){
    if(g==='effects') continue;
    if(g==='masks'){ UI.renderMasks(box,layer); continue; }
    if(g==='timeRemap'){ UI.renderTimeRemap(box,layer); continue; }
    const sch=Model.SCHEMA.find(s=>s.key===g);
    if(sch) UI.renderSchemaGroup(box,layer,sch);
  }
  if(layer.type==='shape') UI.renderShapeExtra(box,layer);
  if(layer.type==='text') UI.renderTextExtra(box,layer);
  if(layer.type==='geometry3d') UI.renderGeoExtra(box,layer);
  if(layer.type==='particle') UI.renderParticleExtra(box,layer);
  if(layer.type==='precomp') UI.renderPrecompExtra(box,layer);
  UI.renderCompFields(box,layer);
  UI.renderExprEditor(layer);
};
UI.renderSchemaGroup=function(box,layer,sch){
  const g=document.createElement('div'); g.className='prop-group';
  const head=document.createElement('div'); head.className='prop-ghead';
  head.innerHTML='<span style="flex:1">'+sch.label+'</span>';
  g.appendChild(head);
  const body=document.createElement('div'); body.className='prop-gbody';
  let open=true;
  head.onclick=()=>{ open=!open; body.style.display=open?'':'none'; };
  for(const p of sch.props){
    if(p.p==='transform.pointOfInterest'&&layer.type!=='camera') continue;
    UI.renderPropRow(body,layer,p);
  }
  g.appendChild(body);
  box.appendChild(g);
};
UI.renderPropRow=function(parent,layer,p){
  const row=document.createElement('div'); row.className='prop-row';
  const lab=document.createElement('div'); lab.className='prop-label'; lab.textContent=p.l;
  const val=document.createElement('div'); val.className='prop-val';
  const t=Editor.time||0;
  const cur=Model.evalProperty(layer,p.p,t,Model.layerComp(layer));
  const keys=Model.getKeys(layer,p.p);
  const hasKf=keys&&keys.length;
  const hasExpr=!!(layer.expr&&layer.expr[p.p]);
  const mkBtn=document.createElement('button'); mkBtn.className='prop-kf'+(hasKf?' on':''); mkBtn.textContent='◆'; mkBtn.title='启用/关闭动画（关键帧）';
  mkBtn.onclick=()=>Editor.toggleKey(layer,p.p);
  const exBtn=document.createElement('button'); exBtn.className='prop-exprbtn'+(hasExpr?' on':''); exBtn.textContent='fx'; exBtn.title='表达式';
  exBtn.onclick=()=>UI.openExpr(layer,p.p);
  const numWrap=document.createElement('div'); numWrap.className='prop-num';
  if(p.t==='num'){
    numWrap.appendChild(UI.makeNumberInput(layer,p.p,cur,p));
    if(p.u==='%'){ const s=document.createElement('span'); s.className='kfhint'; s.textContent='%'; numWrap.appendChild(s); }
    else if(p.u==='°'){ const s=document.createElement('span'); s.className='kfhint'; s.textContent='°'; numWrap.appendChild(s); }
  } else if(p.t==='vec2'||p.t==='vec3'){
    const n=p.t==='vec2'?2:3;
    const arr=Array.isArray(cur)?cur:[cur,cur,cur];
    for(let i=0;i<n;i++) numWrap.appendChild(UI.makeNumberInput(layer,p.p,arr[i],p,i));
  } else if(p.t==='color'){
    const arr=Array.isArray(cur)?cur:[1,1,1];
    const inp=document.createElement('input'); inp.type='color'; inp.value=U.rgb2hex(arr[0],arr[1],arr[2]);
    inp.oninput=()=>{ Editor.setPropVector(layer,p.p,U.hex2rgb(inp.value)); };
    numWrap.appendChild(inp);
  } else if(p.t==='bool'){
    const inp=document.createElement('input'); inp.type='checkbox'; inp.checked=!!cur;
    inp.onchange=()=>Editor.setProp(layer,p.p,inp.checked?1:0);
    numWrap.appendChild(inp);
  } else if(p.t==='select'){
    const sel=document.createElement('select');
    for(const o of (p.opts||[])){ const op=document.createElement('option'); op.value=o[0]; op.textContent=o[1]; if(cur===o[0]) op.selected=true; sel.appendChild(op); }
    sel.onchange=()=>Editor.setProp(layer,p.p,sel.value);
    numWrap.appendChild(sel);
  } else if(p.t==='font'){
    const sel=document.createElement('select');
    for(const f of Geo.availableFonts()){ const op=document.createElement('option'); op.value=f; op.textContent=f; if(cur===f) op.selected=true; sel.appendChild(op); }
    sel.onchange=()=>Editor.setProp(layer,p.p,sel.value);
    numWrap.appendChild(sel);
  } else if(p.t==='text'){
    const ta=document.createElement('textarea'); ta.className='prop-text'; ta.value=cur||'';
    ta.oninput=()=>Editor.setProp(layer,p.p,ta.value);
    numWrap.appendChild(ta);
  } else if(p.t==='layer'){
    const sel=document.createElement('select');
    const comp=Model.layerComp(layer);
    const op0=document.createElement('option'); op0.value=''; op0.textContent='（无）'; sel.appendChild(op0);
    if(comp) for(const l of comp.layers){ if(l===layer) continue; const op=document.createElement('option'); op.value=l.id; op.textContent=l.name; if(cur===l.id) op.selected=true; sel.appendChild(op); }
    sel.onchange=()=>Editor.setProp(layer,p.p,sel.value||null);
    numWrap.appendChild(sel);
  }
  val.appendChild(numWrap);
  val.appendChild(mkBtn);
  val.appendChild(exBtn);
  row.appendChild(lab); row.appendChild(val);
  parent.appendChild(row);
  if(hasExpr&&layer._exprError){
    const e=document.createElement('div'); e.className='expr-error';
    e.style.padding='0 0 4px 67px'; e.textContent=layer._exprError;
    parent.appendChild(e);
  }
};
UI.makeNumberInput=function(layer,path,val,p,comp){
  const inp=document.createElement('input'); inp.type='text';
  inp.value=(typeof val==='number'? +val.toFixed(4):val);
  let startX=0,startVal=0,dragging=false;
  inp.addEventListener('mousedown',e=>{ dragging=true; startX=e.clientX; startVal=typeof val==='number'?val:0; e.preventDefault(); });
  window.addEventListener('mousemove',e=>{
    if(!dragging) return;
    const dv=(e.clientX-startX)*0.01*(p.step||(p.u==='%'?1:0.5));
    const nv=startVal+dv;
    inp.value=+nv.toFixed(4);
    Editor.setPropComponent(layer,path,nv,comp);
  });
  window.addEventListener('mouseup',()=>{ if(dragging){ dragging=false; Model.commit('修改属性'); } });
  inp.addEventListener('change',()=>{ const v=parseFloat(inp.value); if(!isNaN(v)) Editor.setPropComponent(layer,path,v,comp); });
  inp.addEventListener('keydown',e=>{ e.stopPropagation(); });
  return inp;
};
UI.renderMasks=function(box,layer){
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">蒙版</span><button class="prop-btn" id="mask-add">+ 蒙版</button></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  layer.masks.forEach((m,i)=>{
    const row=document.createElement('div'); row.className='prop-row';
    row.innerHTML='<div class="prop-label">'+(m.name||('蒙版 '+(i+1)))+'</div><div class="prop-val"><div class="prop-num" style="gap:4px">'+
      '<select class="prop-sel" data-k="type"><option value="rect">矩形</option><option value="ellipse">椭圆</option><option value="path">路径</option></select>'+
      '<label class="kfhint"><input type="checkbox" data-k="inverted">反转</label>'+
      '<input type="text" data-k="feather" value="'+(m.feather||0)+'" style="width:44px">羽化'+
      '<input type="text" data-k="opacity" value="'+(m.opacity===undefined?100:m.opacity)+'" style="width:44px">不透明度'+
      '<button class="prop-btn danger" data-k="del">删</button></div></div>';
    body.appendChild(row);
    const sel=row.querySelector('[data-k=type]'); sel.value=m.type||'rect';
    sel.onchange=()=>{ m.type=sel.value; Model.commit('蒙版类型'); Model.emit('structure'); };
    const inv=row.querySelector('[data-k=inverted]'); inv.checked=!!m.inverted;
    inv.onchange=()=>{ m.inverted=inv.checked; Model.emit('structure'); };
    row.querySelector('[data-k=feather]').onchange=e=>{ m.feather=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=opacity]').onchange=e=>{ m.opacity=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=del]').onclick=()=>{ layer.masks.splice(i,1); Model.commit('删除蒙版'); Model.emit('structure'); };
  });
  g.appendChild(body); box.appendChild(g);
  g.querySelector('#mask-add').onclick=()=>{
    layer.masks.push({id:U.uid('mask'),name:'蒙版 '+(layer.masks.length+1),type:'rect',x:0,y:0,w:200,h:200,inverted:false,feather:0,opacity:100,enabled:true});
    Model.commit('添加蒙版'); Model.emit('structure');
  };
};
UI.renderTimeRemap=function(box,layer){
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">时间重映射</span></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  const rm=layer.values['timeRemap']||{enabled:false};
  const lab=document.createElement('div'); lab.className='prop-row';
  lab.innerHTML='<div class="prop-label">启用</div><div class="prop-val"><input type="checkbox" id="tr-enable" '+(rm.enabled?'checked':'')+'></div>';
  body.appendChild(lab);
  const lab2=document.createElement('div'); lab2.className='prop-row';
  lab2.innerHTML='<div class="prop-label">速度</div><div class="prop-val"><div class="prop-num"><input type="text" id="tr-speed" value="'+(rm.speed!==undefined?rm.speed:1)+'"></div></div>';
  body.appendChild(lab2);
  g.appendChild(body); box.appendChild(g);
  lab.querySelector('#tr-enable').onchange=e=>{ rm.enabled=e.target.checked; Model.commit('时间重映射'); Model.emit('structure'); };
  lab2.querySelector('#tr-speed').onchange=e=>{ rm.speed=parseFloat(e.target.value)||1; };
};
UI.renderShapeExtra=function(box,layer){
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">路径</span><div>'+
    '<button class="prop-btn" data-a="rect">矩形</button> <button class="prop-btn" data-a="ellipse">椭圆</button> <button class="prop-btn" data-a="pen">钢笔</button></div></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  const paths=(layer.values['shape']&&layer.values['shape'].paths)||[];
  const ops=[['add','并集'],['subtract','差集'],['intersect','交集']];
  paths.forEach((pd,i)=>{
    const row=document.createElement('div'); row.className='prop-row';
    row.innerHTML='<div class="prop-label">路径 '+(i+1)+'</div><div class="prop-val"><select data-k="op">'+
      ops.map(o=>'<option value="'+o[0]+'"'+(pd.op===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>'+
      '<button class="prop-btn" data-k="edit">编辑</button><button class="prop-btn danger" data-k="del">删</button></div>';
    body.appendChild(row);
    row.querySelector('[data-k=op]').onchange=e=>{ pd.op=e.target.value; Model.commit('布尔顺序'); Model.emit('structure'); };
    row.querySelector('[data-k=del]').onclick=()=>{ paths.splice(i,1); Model.commit('删除路径'); Model.emit('structure'); };
    row.querySelector('[data-k=edit]').onclick=()=>Editor.editPath(layer,i);
  });
  g.appendChild(body); box.appendChild(g);
  g.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{
    const a=b.dataset.a;
    if(a==='rect') layer.values['shape'].paths.push(U.pathDataFromPoly(U.rectContour(0,0,200,120).pts,true));
    else if(a==='ellipse') layer.values['shape'].paths.push(U.pathDataFromPoly(U.ellipseContour(0,0,100,70,32).pts,true));
    else if(a==='pen'){ Editor.setTool('pen'); Editor.toast('在画布上点击与拖动绘制路径'); return; }
    layer.values['shape'].paths[layer.values['shape'].paths.length-1].op='add';
    Model.commit('添加路径'); Model.emit('structure');
  });
};
UI.renderTextExtra=function(box,layer){
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">文字动画器</span><button class="prop-btn" id="anim-add">+ 动画器</button></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  const anims=(layer.values['text']&&layer.values['text'].animators)||[];
  anims.forEach((an,i)=>{
    const row=document.createElement('div'); row.className='prop-row';
    row.innerHTML='<div class="prop-label">动画器 '+(i+1)+'</div><div class="prop-val"><div class="prop-num" style="gap:3px">'+
      '<select data-k="unit"><option value="chars">按字</option><option value="words">按词</option><option value="lines">按行</option></select>'+
      '<input type="text" data-k="start" value="'+(an.selector.start||0)+'" style="width:38px">起'+
      '<input type="text" data-k="end" value="'+(an.selector.end||100)+'" style="width:38px">止'+
      '<input type="text" data-k="amount" value="'+(an.amount===undefined?100:an.amount)+'" style="width:38px">幅度'+
      '<button class="prop-btn danger" data-k="del">删</button></div></div>';
    body.appendChild(row);
    row.querySelector('[data-k=unit]').value=an.selector.unit||'chars';
    row.querySelector('[data-k=unit]').onchange=e=>{ an.selector.unit=e.target.value; Model.emit('structure'); };
    row.querySelector('[data-k=start]').onchange=e=>{ an.selector.start=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=end]').onchange=e=>{ an.selector.end=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=amount]').onchange=e=>{ an.amount=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=del]').onclick=()=>{ anims.splice(i,1); Model.commit('删除动画器'); Model.emit('structure'); };
    const p=an.props||{};
    const row2=document.createElement('div'); row2.className='prop-row';
    row2.innerHTML='<div class="prop-label">属性</div><div class="prop-val"><div class="prop-num" style="gap:3px">'+
      '<input type="text" data-k="px" value="'+(p.position?p.position[0]:0)+'" style="width:44px">X'+
      '<input type="text" data-k="py" value="'+(p.position?p.position[1]:0)+'" style="width:44px">Y'+
      '<input type="text" data-k="rot" value="'+(p.rotation||0)+'" style="width:38px">旋转'+
      '<input type="text" data-k="sc" value="'+(p.scale?p.scale[0]:100)+'" style="width:38px">缩放'+
      '<input type="text" data-k="op" value="'+(p.opacity!==undefined?p.opacity:100)+'" style="width:38px">不透明</div></div>';
    body.appendChild(row2);
    row2.querySelector('[data-k=px]').onchange=e=>{ p.position=p.position||[0,0]; p.position[0]=parseFloat(e.target.value)||0; };
    row2.querySelector('[data-k=py]').onchange=e=>{ p.position=p.position||[0,0]; p.position[1]=parseFloat(e.target.value)||0; };
    row2.querySelector('[data-k=rot]').onchange=e=>{ p.rotation=parseFloat(e.target.value)||0; };
    row2.querySelector('[data-k=sc]').onchange=e=>{ p.scale=p.scale||[100,100]; const v=parseFloat(e.target.value)||100; p.scale[0]=v;p.scale[1]=v; };
    row2.querySelector('[data-k=op]').onchange=e=>{ p.opacity=parseFloat(e.target.value)||0; };
  });
  g.appendChild(body); box.appendChild(g);
  g.querySelector('#anim-add').onclick=()=>{
    anims.push({selector:{unit:'chars',start:0,end:100,easeHigh:50,easeLow:50},props:{position:[0,0],rotation:0,scale:[100,100],opacity:100},amount:100});
    Model.commit('添加动画器'); Model.emit('structure');
  };
};
UI.renderGeoExtra=function(box,layer){
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">图钉</span><button class="prop-btn" id="pin-add">+ 图钉</button></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  const pins=(layer.values['deform']&&layer.values['deform'].pins)||[];
  pins.forEach((p,i)=>{
    const row=document.createElement('div'); row.className='prop-row';
    row.innerHTML='<div class="prop-label">图钉 '+(i+1)+'</div><div class="prop-val"><div class="prop-num" style="gap:3px">'+
      '<input type="text" data-k="x" value="'+((p.position||[0,0,0])[0]).toFixed(1)+'" style="width:48px">X'+
      '<input type="text" data-k="y" value="'+((p.position||[0,0,0])[1]).toFixed(1)+'" style="width:48px">Y'+
      '<input type="text" data-k="r" value="'+(p.radius||200)+'" style="width:44px">半径'+
      '<input type="text" data-k="rx" value="'+(p.rotX||0)+'" style="width:38px">旋转X'+
      '<button class="prop-btn danger" data-k="del">删</button></div></div>';
    body.appendChild(row);
    const set=(k,v)=>{
      if(k==='x'||k==='y'){ p.position=p.position||[0,0,0]; p.position[{x:0,y:1}[k]]=v; }
      else p[k]=v;
    };
    row.querySelector('[data-k=x]').onchange=e=>set('x',parseFloat(e.target.value)||0);
    row.querySelector('[data-k=y]').onchange=e=>set('y',parseFloat(e.target.value)||0);
    row.querySelector('[data-k=r]').onchange=e=>set('radius',parseFloat(e.target.value)||0);
    row.querySelector('[data-k=rx]').onchange=e=>set('rotX',parseFloat(e.target.value)||0);
    row.querySelector('[data-k=del]').onclick=()=>{ pins.splice(i,1); Model.commit('删除图钉'); Model.emit('structure'); };
  });
  g.appendChild(body); box.appendChild(g);
  g.querySelector('#pin-add').onclick=()=>{
    pins.push({id:U.uid('pin'),position:[0,0,0],restPosition:null,radius:200,falloff:2,strength:1,rot:[0,0,0],rotX:0,rotY:0,rotZ:0,scale:[1,1,1]});
    Model.commit('添加图钉'); Model.emit('structure');
  };
};
UI.renderParticleExtra=function(box,layer){
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">发射器</span><button class="prop-btn" id="em-add">+ 发射器</button></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  const ps=layer.values['particle']||{emitters:[]};
  (ps.emitters||[]).forEach((em,i)=>{
    const row=document.createElement('div'); row.className='prop-row';
    row.innerHTML='<div class="prop-label">发射器 '+(i+1)+'</div><div class="prop-val"><div class="prop-num" style="gap:3px">'+
      '<select data-k="type"><option value="point">点</option><option value="line">曲线</option></select>'+
      '<label class="kfhint"><input type="checkbox" data-k="surface">表面发射</label>'+
      '<input type="text" data-k="rate" value="'+(em.rate!==undefined?em.rate:(ps.rate||60))+'" style="width:44px">率'+
      '<button class="prop-btn danger" data-k="del">删</button></div></div>';
    body.appendChild(row);
    row.querySelector('[data-k=type]').value=em.type||'point';
    row.querySelector('[data-k=type]').onchange=e=>{ em.type=e.target.value; };
    row.querySelector('[data-k=surface]').checked=!!em.surface;
    row.querySelector('[data-k=surface]').onchange=e=>{ em.surface=e.target.checked; };
    row.querySelector('[data-k=rate]').onchange=e=>{ em.rate=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=del]').onclick=()=>{ ps.emitters.splice(i,1); Model.commit('删除发射器'); Model.emit('structure'); };
  });
  g.appendChild(body); box.appendChild(g);
  g.querySelector('#em-add').onclick=()=>{
    ps.emitters=ps.emitters||[];
    ps.emitters.push({id:U.uid('em'),type:'point',position:[0,0,0],direction:[0,1,0],spread:30,sourceLayerId:null,surface:false,velocity:true});
    Model.commit('添加发射器'); Model.emit('structure');
  };
  const g2=document.createElement('div'); g2.className='prop-group';
  g2.innerHTML='<div class="prop-ghead"><span style="flex:1">碰撞层</span></div>';
  const b2=document.createElement('div'); b2.className='prop-gbody';
  const comp=Model.layerComp(layer);
  const cl=ps.collisionLayers||[];
  for(const l of (comp?comp.layers:[])){
    if(l===layer||l.type!=='geometry3d') continue;
    const row=document.createElement('div'); row.className='prop-row';
    row.innerHTML='<div class="prop-label">'+U.escapeHtml(l.name)+'</div><div class="prop-val"><input type="checkbox" '+(cl.indexOf(l.id)>=0?'checked':'')+'></div>';
    b2.appendChild(row);
    row.querySelector('input').onchange=e=>{
      ps.collisionLayers=cl;
      if(e.target.checked) cl.push(l.id); else ps.collisionLayers=cl.filter(x=>x!==l.id);
    };
  }
  g2.appendChild(b2); box.appendChild(g2);
};
UI.renderPrecompExtra=function(box,layer){
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">预合成</span></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  const sub=Model.getComp(layer.precompId);
  body.innerHTML='<div class="kfhint">'+(sub? sub.name+' · '+sub.width+'×'+sub.height+' · '+sub.duration+'s':'（未指定）')+'</div>';
  if(sub){
    const b=document.createElement('button'); b.className='prop-btn'; b.textContent='打开子合成';
    b.onclick=()=>Editor.openComp(sub.id);
    body.appendChild(b);
  }
  g.appendChild(body); box.appendChild(g);
};
UI.renderCompFields=function(box,layer){
  const comp=Model.layerComp(layer); if(!comp) return;
  if(!comp.fields) comp.fields=[];
  const g=document.createElement('div'); g.className='prop-group';
  g.innerHTML='<div class="prop-ghead"><span style="flex:1">空间场</span><button class="prop-btn" id="fld-add">+ 场</button></div>';
  const body=document.createElement('div'); body.className='prop-gbody';
  comp.fields.forEach((f,i)=>{
    const row=document.createElement('div'); row.className='prop-row';
    row.innerHTML='<div class="prop-label">场 '+(i+1)+'</div><div class="prop-val"><div class="prop-num" style="gap:3px">'+
      '<select data-k="type"><option value="distance">距离衰减</option><option value="noise">噪声</option><option value="vortex">旋涡</option><option value="impact">冲击</option><option value="wind">风</option></select>'+
      '<input type="text" data-k="x" value="'+((f.position||[0,0,0])[0]).toFixed(0)+'" style="width:44px">X'+
      '<input type="text" data-k="y" value="'+((f.position||[0,0,0])[1]).toFixed(0)+'" style="width:44px">Y'+
      '<input type="text" data-k="r" value="'+(f.radius||300)+'" style="width:44px">半径'+
      '<input type="text" data-k="s" value="'+(f.strength||1)+'" style="width:40px">强度'+
      '<button class="prop-btn danger" data-k="del">删</button></div></div>';
    body.appendChild(row);
    row.querySelector('[data-k=type]').value=f.type||'distance';
    row.querySelector('[data-k=type]').onchange=e=>{ f.type=e.target.value; };
    row.querySelector('[data-k=x]').onchange=e=>{ f.position=f.position||[0,0,0]; f.position[0]=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=y]').onchange=e=>{ f.position=f.position||[0,0,0]; f.position[1]=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=r]').onchange=e=>{ f.radius=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=s]').onchange=e=>{ f.strength=parseFloat(e.target.value)||0; };
    row.querySelector('[data-k=del]').onclick=()=>{ comp.fields.splice(i,1); Particles.invalidateAll(); Model.emit('structure'); };
  });
  g.appendChild(body); box.appendChild(g);
  g.querySelector('#fld-add').onclick=()=>{
    comp.fields.push(Geo.makeField({}));
    Particles.invalidateAll();
    Model.commit('添加场'); Model.emit('structure');
  };
};

/* ==================== 表达式编辑器 ==================== */
UI.renderExprEditor=function(layer){
  const ed=$('#expr-editor');
  if(!UI.exprTarget||UI.exprTarget.layer!==layer){ ed.classList.add('hidden'); return; }
  ed.classList.remove('hidden');
  $('#expr-propname').textContent='表达式 · '+UI.exprTarget.path;
  const ta=$('#expr-text');
  if(document.activeElement!==ta) ta.value=layer.expr[UI.exprTarget.path]||'';
  $('#expr-error').textContent=layer._exprError||'';
};
UI.openExpr=function(layer,path){
  UI.exprTarget={layer,path};
  if(!layer.expr[path]) layer.expr[path]='';
  UI.renderProps();
  setTimeout(()=>$('#expr-text').focus(),20);
};
UI.closeExpr=function(){ UI.exprTarget=null; $('#expr-editor').classList.add('hidden'); };
UI.applyExpr=function(){
  if(!UI.exprTarget) return;
  const layer=UI.exprTarget.layer, path=UI.exprTarget.path;
  layer.expr[path]=$('#expr-text').value;
  Model.commit('表达式');
  Particles.invalidateAll();
  Model.emit('structure');
  UI.renderProps();
  Editor.toast(layer.expr[path]? '表达式已应用':'表达式已清除');
};

/* ==================== 效果面板 ==================== */
UI.renderFX=function(){
  const layer=Model.selectedLayers()[0];
  const list=$('#fx-list');
  list.innerHTML='';
  $('#fx-count').textContent=layer? (layer.effects?layer.effects.length:0)+' 个效果' : '';
  if(!layer){ list.innerHTML='<div class="fx-empty">未选择图层</div>'; return; }
  if(!layer.effects||!layer.effects.length){ list.innerHTML='<div class="fx-empty">无效果（菜单「效果」添加）</div>'; return; }
  layer.effects.forEach((fx,i)=>{
    const def=Composite.EFFECT_DEFS[fx.type];
    if(!def) return;
    const item=document.createElement('div'); item.className='fx-item';
    const head=document.createElement('div'); head.className='fx-head';
    head.innerHTML='<span style="flex:1" class="fx-name">'+def.label+'</span>'+
      '<span class="fx-ico" data-a="up" title="上移">▲</span>'+
      '<span class="fx-ico" data-a="down" title="下移">▼</span>'+
      '<span class="fx-ico" data-a="del" title="删除">✕</span>';
    item.appendChild(head);
    const body=document.createElement('div'); body.className='fx-body';
    for(const p of def.params){
      const cur=fx.params&&fx.params[p.p]!==undefined?fx.params[p.p]:p.def;
      const row=document.createElement('div'); row.className='prop-row';
      row.innerHTML='<div class="prop-label" style="flex:0 0 52px">'+p.l+'</div><div class="prop-val"><div class="prop-num">'+
        (p.t==='color'
          ? '<input type="color" class="prop-color" data-p="'+p.p+'" value="'+U.rgb2hex(cur[0],cur[1],cur[2])+'">'
          : '<input type="text" data-p="'+p.p+'" value="'+cur+'">')+
        '</div><button class="prop-kf" data-kf="'+p.p+'" title="动画参数">◆</button></div>';
      body.appendChild(row);
      const inp=row.querySelector('[data-p]');
      const commit=()=>{ fx.params[p.p]=p.t==='color'?U.hex2rgb(inp.value):(parseFloat(inp.value)||0); };
      if(p.t==='color') inp.oninput=commit;
      else { inp.onchange=commit; inp.onkeydown=e=>e.stopPropagation(); }
      row.querySelector('[data-kf]').onclick=()=>{
        const path='fx.'+i+'.'+p.p;
        if(!layer.kf[path]) layer.kf[path]={keys:[{t:Editor.time||0,v:fx.params[p.p]}]};
        else delete layer.kf[path];
        Model.emit('structure');
      };
    }
    item.appendChild(body);
    list.appendChild(item);
    head.querySelector('[data-a=up]').onclick=()=>{ if(i>0){ layer.effects.splice(i,1); layer.effects.splice(i-1,0,fx); Model.commit('效果排序'); Model.emit('structure'); } };
    head.querySelector('[data-a=down]').onclick=()=>{ if(i<layer.effects.length-1){ layer.effects.splice(i,1); layer.effects.splice(i+1,0,fx); Model.commit('效果排序'); Model.emit('structure'); } };
    head.querySelector('[data-a=del]').onclick=()=>{ layer.effects.splice(i,1); Model.commit('删除效果'); Model.emit('structure'); };
  });
};

/* ==================== 曲线编辑器 ==================== */
UI.bindGraph=function(){
  const cv=$('#graph-canvas');
  cv.addEventListener('mousedown',e=>UI.graphMouseDown(e));
  window.addEventListener('mousemove',e=>UI.graphMouseDrag(e));
  window.addEventListener('mouseup',()=>{ if(UI.graph.dragKey){ UI.graph.dragKey=null; Model.commit('曲线编辑'); } });
  cv.addEventListener('wheel',e=>{ e.preventDefault(); UI.graph.pxPerSec=U.clamp(UI.graph.pxPerSec*(e.deltaY<0?1.15:1/1.15),2,600); UI.drawGraph(); },{passive:false});
  cv.addEventListener('dblclick',e=>{
    const hit=UI.graphHitKey(e);
    if(hit){ const k=hit.keys[hit.index]; k.interp='bezier'; k.easeIn=[0.42,0]; k.easeOut=[0.58,1]; Model.emit('structure'); UI.drawGraph(); }
  });
};
UI.graphProps=function(layer){
  const out=[];
  for(const path of Object.keys(layer.kf)){
    const keys=layer.kf[path].keys;
    if(!keys||!keys.length) continue;
    const p=path.split('.').pop();
    const isVec=/^(position|anchorPoint|scale|pointOfInterest|color|pos|direction)$/.test(p);
    if(isVec){
      const dims=keys[0].v&&keys[0].v.length?keys[0].v.length:1;
      for(let d=0;d<dims;d++) out.push({path,dim:d,label:p+'['+d+']',color:U.rgb2hex(0.3+0.7*(d===0),0.5+0.5*(d===1),0.6+0.4*(d===2))});
    }else out.push({path,dim:-1,label:p,color:'#4f9cf9'});
  }
  return out;
};
UI.renderGraph=function(){
  const layer=Model.selectedLayers()[0];
  const left=$('#graph-left');
  left.innerHTML='';
  if(!layer){ left.innerHTML='<div class="kfhint" style="padding:8px">未选择图层</div>'; UI.drawGraph(); return; }
  const props=UI.graphProps(layer);
  UI.graph.props=props;
  if(!props.length) left.innerHTML='<div class="kfhint" style="padding:8px">该图层没有关键帧</div>';
  for(const p of props){
    const d=document.createElement('div'); d.className='graph-prop'+(UI.graph.selProps.includes(p.path)?' active':'');
    d.innerHTML='<span class="dot" style="background:'+p.color+'"></span>'+p.label;
    d.onclick=()=>{ UI.graph.selProps=UI.graph.selProps.includes(p.path)?UI.graph.selProps.filter(x=>x!==p.path):[...UI.graph.selProps,p.path]; UI.renderGraph(); };
    left.appendChild(d);
  }
  UI.drawGraph();
};
UI.graphMouseDrag=function(e){
  if(!UI.graph.dragKey) return;
  const d=UI.graph.dragKey;
  const layer=Model.findLayer(Model.currentComp(),d.layerId); if(!layer) return;
  const keys=Model.getKeys(layer,d.path); if(!keys) return;
  const k=keys[d.index];
  const dt=(e.clientX-UI.graph.dragStart.x)/UI.graph.pxPerSec;
  const dv=(UI.graph.dragStart.y-e.clientY)/UI.graph.dragStart.vScale;
  if(d.dim>=0){ if(!Array.isArray(k.v)) k.v=[k.v]; k.v[d.dim]=+(UI.graph.dragStart.v+dv).toFixed(4); }
  else k.v=+(UI.graph.dragStart.v+dv).toFixed(4);
  k.t=U.clamp(UI.graph.dragStart.t+dt,0,Model.currentComp().duration);
  keys.sort((a,b)=>a.t-b.t);
  UI.drawGraph();
};
UI.graphMouseDown=function(e){
  const hit=UI.graphHitKey(e);
  if(hit){
    const layer=Model.selectedLayers()[0];
    const k=hit.keys[hit.index];
    UI.graph.dragKey=hit;
    UI.graph.dragStart={x:e.clientX,y:e.clientY,t:k.t,v:hit.dim>=0?(Array.isArray(k.v)?k.v[hit.dim]:k.v):k.v,vScale:1};
    const r=$('#graph-canvas').getBoundingClientRect();
    const range=UI.graphValueRange(layer,hit);
    UI.graph.dragStart.vScale=Math.max(20,(range.mx-range.mn)/(r.height*0.7));
    UI.drawGraph();
  }
};
UI.graphHitKey=function(e){
  const cv=$('#graph-canvas');
  const r=cv.getBoundingClientRect();
  const layer=Model.selectedLayers()[0]; if(!layer) return null;
  const props=UI.graph.props.length?UI.graph.props:UI.graphProps(layer);
  for(const p of props){
    const keys=Model.getKeys(layer,p.path); if(!keys) continue;
    for(let i=0;i<keys.length;i++){
      const k=keys[i];
      const x=(k.t*UI.graph.pxPerSec-UI.graph.scrollX);
      const y=UI.graphY(layer,p,k);
      if(Math.abs(x-(e.clientX-r.left))<7&&Math.abs(y-(e.clientY-r.top))<8) return {layerId:layer.id,path:p.path,index:i,keys,dim:p.dim};
    }
  }
  return null;
};
UI.graphValueRange=function(layer,p){
  let mn=1e18,mx=-1e18;
  for(const path of Object.keys(layer.kf)){
    for(const k of layer.kf[path].keys){
      const v=Array.isArray(k.v)?k.v[0]:k.v;
      if(typeof v==='number'){ mn=Math.min(mn,v); mx=Math.max(mx,v); }
    }
  }
  if(mn>mx){ mn=0;mx=1; }
  if(mx-mn<1e-6){ mn-=1;mx+=1; }
  return {mn,mx};
};
UI.graphY=function(layer,p,k){
  const cv=$('#graph-canvas');
  const r=cv.getBoundingClientRect();
  const range=UI.graph.range||UI.graphValueRange(layer,p);
  const pad=30;
  const h=r.height-pad*2;
  const v=Array.isArray(k.v)?(p.dim>=0?k.v[p.dim]:k.v[0]):k.v;
  return pad+(1-(v-range.mn)/(range.mx-range.mn))*h;
};
UI.drawGraph=function(){
  const cv=$('#graph-canvas');
  const w=cv.clientWidth,h=cv.clientHeight;
  if(w<2||h<2) return;
  if(cv.width!==Math.round(w*R.dpr)||cv.height!==Math.round(h*R.dpr)){ cv.width=Math.round(w*R.dpr); cv.height=Math.round(h*R.dpr); }
  const c=cv.getContext('2d'); c.setTransform(R.dpr,0,0,R.dpr,0,0);
  c.clearRect(0,0,w,h); c.fillStyle='#14161a'; c.fillRect(0,0,w,h);
  const layer=Model.selectedLayers()[0];
  if(!layer){ c.fillStyle='#6b7484'; c.font='12px sans-serif'; c.fillText('未选择图层',14,24); return; }
  const props=UI.graph.props.length?UI.graph.props:UI.graphProps(layer);
  if(!props.length){ c.fillStyle='#6b7484'; c.font='12px sans-serif'; c.fillText('该图层没有关键帧',14,24); return; }
  const comp=Model.layerComp(layer);
  const pad=30;
  let mn=1e18,mx=-1e18;
  for(const p of props){
    for(let i=0;i<=200;i++){
      const t=comp.duration*i/200;
      let v;
      try{ v=Model.evalProperty(layer,p.path,t,comp); }catch(e){ continue; }
      if(Array.isArray(v)) v=p.dim>=0?v[p.dim]:v[0];
      if(typeof v==='number'){ mn=Math.min(mn,v); mx=Math.max(mx,v); }
    }
  }
  if(mn>mx){ mn=0;mx=1; }
  if(mx-mn<1e-6){ mn-=1;mx+=1; }
  UI.graph.range={mn,mx};
  const t0=UI.graph.scrollX/UI.graph.pxPerSec, t1=t0+w/UI.graph.pxPerSec;
  const h2=h-pad*2;
  const Y=v=>pad+(1-(v-mn)/(mx-mn))*h2;
  c.strokeStyle='#262a32'; c.fillStyle='#6b7484'; c.font='10px Consolas,monospace';
  for(let gx=Math.floor(t0);gx<=t1;gx++){
    const x=(gx-t0)*UI.graph.pxPerSec;
    c.beginPath(); c.moveTo(x,pad-10); c.lineTo(x,h-pad+10); c.stroke();
    c.fillText(gx+'s',x+3,h-8);
  }
  for(let i=0;i<=4;i++){
    const v=mn+(mx-mn)*i/4, y=Y(v);
    c.strokeStyle='#22262e'; c.beginPath(); c.moveTo(0,y); c.lineTo(w,y); c.stroke();
    c.fillText(v.toFixed(2),4,y-3);
  }
  for(const p of props){
    c.strokeStyle=p.color; c.lineWidth=UI.graph.selProps.includes(p.path)?2:1.2;
    c.beginPath();
    for(let i=0;i<=300;i++){
      const t=U.clamp(t0+(i/300)*(t1-t0),0,comp.duration);
      let v=Model.evalProperty(layer,p.path,t,comp);
      if(Array.isArray(v)) v=p.dim>=0?v[p.dim]:v[0];
      const x=(t-t0)*UI.graph.pxPerSec, y=Y(v);
      if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
    }
    c.stroke();
    const keys=Model.getKeys(layer,p.path);
    if(keys) for(let i=0;i<keys.length;i++){
      const k=keys[i]; const x=(k.t-t0)*UI.graph.pxPerSec; if(x<-10||x>w+10) continue;
      const v=Array.isArray(k.v)?(p.dim>=0?k.v[p.dim]:k.v[0]):k.v;
      c.fillStyle=k.interp==='bezier'?'#f2c14e':'#e08a3c';
      c.beginPath(); c.moveTo(x,Y(v)-5); c.lineTo(x+5,Y(v)); c.lineTo(x,Y(v)+5); c.lineTo(x-5,Y(v)); c.closePath(); c.fill();
    }
  }
};

/* ==================== 音频面板 ==================== */
UI.renderAudio=function(){
  const comp=Model.currentComp();
  const box=$('#audio-layers');
  box.innerHTML='';
  if(!comp) return;
  for(const l of comp.layers){
    if(l.type!=='audio') continue;
    const a=l.values['audio'];
    const d=document.createElement('div'); d.className='fx-item';
    d.innerHTML='<div class="fx-head"><span class="fx-name">'+U.escapeHtml(l.name)+'</span><span class="kfhint">'+ (a.preset||'') +' · '+(a.note||0)+'Hz · '+(a.duration||0.5)+'s</span></div>';
    box.appendChild(d);
  }
};

/* ==================== HUD ==================== */
UI.updateHUD=function(){
  const comp=Model.currentComp();
  const t=Editor.time||0;
  $('#hud-time').textContent=comp? U.formatTime(t,comp.fps)+'  ·  帧 '+Math.floor(t*(comp?comp.fps:30)) : '';
  $('#tl-clock').textContent=comp? U.formatTime(t,comp.fps):'00:00:00:00';
  $('#mb-compname').textContent=comp? comp.name+'  '+comp.width+'×'+comp.height+'  '+comp.fps+'fps':'空工程';
  const layers=Model.selectedLayers();
  $('#hud-info').textContent=layers.map(l=>l.name).join(', ');
  $('#viewer-label').textContent=comp? comp.name+' · '+(Render.view.zoom*100).toFixed(0)+'%':'';
  $('#zoom-label').textContent=(Render.view.zoom*100).toFixed(0)+'%';
  UI.drawTimeline();
};
UI.updateStats=function(){
  const comp=Model.currentComp();
  if(!comp) return;
  $('#sb-stats').textContent='FPS '+Editor.fps.toFixed(0)+' · 粒子 '+(Editor.particleCount||0);
};
UI.status=function(msg){ $('#sb-msg').textContent=msg; };

/* ==================== 标签页 ==================== */
UI.bindTabs=function(){
  $$('.bt-tab').forEach(t=>{
    t.onclick=()=>{
      $$('.bt-tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      $$('.tab-page').forEach(p=>p.classList.remove('active'));
      $('#tab-'+t.dataset.tab).classList.add('active');
      if(t.dataset.tab==='graph') UI.renderGraph();
      if(t.dataset.tab==='nodes') NodesWidget.focus();
      if(t.dataset.tab==='timeline') UI.drawTimeline();
    };
  });
};
UI.showTab=function(name){
  $$('.bt-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
  $$('.tab-page').forEach(p=>p.classList.remove('active'));
  $('#tab-'+name).classList.add('active');
  if(name==='graph') UI.renderGraph();
  if(name==='nodes') NodesWidget.focus();
};

})();
