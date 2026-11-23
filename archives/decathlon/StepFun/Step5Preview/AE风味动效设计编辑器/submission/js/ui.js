/* ============ 锻火 FORGE · ui.js : 编辑器界面与交互 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const G=APP.geom;
const A=APP.anim;
const P=APP.project;
const CT=APP.content;
const S=APP.sim;
const R=APP.render;
const U=APP.ui={};

const $=id=>document.getElementById(id);
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!==undefined)e.innerHTML=html;return e;};

/* ================= 应用状态 ================= */
APP.app={
  project:null,sel:[],time:0,playing:false,loop:true,
  zoom:1,pan:{x:0,y:0},fps:30,
  renderCache:new Map(),particleCache:new Map(),
  bottomTab:'timeline',graphMode:'value',
  tlZoom:60,tlScroll:0,
  tool:'select',
  show:{grid:true,safe:true,handles:true,paths:true,fields:true,lights:true},
  chan:'rgb',res:1,
  nodePan:{x:0,y:0},nodeSel:[],nodeDrag:null,
  drag:null,exprError:null,lastError:null,lastNodeError:null,lastExprError:null,
  exportMode:false,
  clipboard:null,
  tlSelKeys:[]
};

/* ================= 初始化 ================= */
U.init=function(){
  const canvas=$('gl');
  R.init(canvas);
  APP.app.canvas=canvas;
  APP.app.ov=$('ov');
  APP.app.ovctx=$('ov').getContext('2d');
  U.resizeCanvas();
  window.addEventListener('resize',()=>{U.resizeCanvas();});
  U.bindToolbar();
  U.bindMenus();
  U.bindKeys();
  U.bindCanvas();
  U.bindTimeline();
  U.bindGraph();
  U.bindNodes();
  U.bindProps();
  C.bus.on('projectChanged',()=>{
    APP.app.renderCache.clear();APP.app.particleCache.clear();
    U.refreshAll();
  });
  C.bus.on('undoChange',()=>U.refreshAll());
  U.loop();
};
U.resizeCanvas=function(){
  const wrap=$('canvasWrap'),c=$('gl'),o=$('ov');
  const r=wrap.getBoundingClientRect();
  const dpr=Math.min(2,window.devicePixelRatio||1);
  c.width=Math.max(2,Math.floor(r.width*dpr));
  c.height=Math.max(2,Math.floor(r.height*dpr));
  c.style.width=r.width+'px';c.style.height=r.height+'px';
  o.width=c.width;o.height=c.height;o.style.width=r.width+'px';o.style.height=r.height+'px';
  U.view();
};
U.view=function(){
  const comp=P.activeComp();
  if(!comp)return;
  const c=$('gl');
  const dpr=c.width/Math.max(1,parseFloat(c.style.width));
  const z=APP.app.zoom*dpr;
  APP.app.viewT={z,ox:c.width/2+APP.app.pan.x*dpr,oy:c.height/2+APP.app.pan.y*dpr,
    cw:c.width,ch:c.height,comp};
};
/* 屏幕(画布像素) -> 合成坐标 */
U.screenToComp=function(sx,sy,worldZ){
  const comp=P.activeComp();
  const v=APP.app.viewT;
  const x=(sx-v.ox)/v.z, y=(sy-v.oy)/v.z;
  if(!comp)return {x,y};
  // 找相机
  let cam=null;
  for(const l of comp.layers)if(l.type==='camera'&&l.visible&&A.layerActive(l,comp,APP.app.time)){cam=l;break;}
  if(!cam)return {x,y};
  // 透视: 反投影到 z=worldZ 平面
  const cm=A.cameraMatrices(cam,comp,APP.app.time);
  const inv=C.m4inv(C.m4mul(cm.proj,cm.view));
  const nx=(sx/v.cw)*2-1, ny=1-(sy/v.ch)*2;
  const p0=C.m4transformPoint(inv,nx,ny,-1),p1=C.m4transformPoint(inv,nx,ny,1);
  const z=worldZ!==undefined?worldZ:0;
  const dz=p1.z-p0.z;
  if(Math.abs(dz)<1e-9)return {x:p0.x,y:p0.y,z};
  const t=(z-p0.z)/dz;
  return {x:C.lerp(p0.x,p1.x,t),y:C.lerp(p0.y,p1.y,t),z};
};
U.compToScreen=function(x,y,z){
  const comp=P.activeComp();
  const v=APP.app.viewT;
  if(!comp)return {x:v.ox+x*v.z,y:v.oy+y*v.z};
  let cam=null;
  for(const l of comp.layers)if(l.type==='camera'&&l.visible&&A.layerActive(l,comp,APP.app.time)){cam=l;break;}
  if(!cam)return {x:v.ox+x*v.z,y:v.oy+y*v.z};
  const cm=A.cameraMatrices(cam,comp,APP.app.time);
  const p=C.m4transformPoint(C.m4mul(cm.proj,cm.view),x,y,z||0);
  return {x:(p.x*0.5+0.5)*v.cw,y:(0.5-p.y*0.5)*v.ch};
};

/* ================= 工具栏 / 菜单 ================= */
U.bindToolbar=function(){
  const bind=(id,fn)=>{const e=$(id);if(e)e.onclick=fn;};
  bind('btnFirst',()=>U.seek(0));
  bind('btnPrev',()=>U.stepKey(-1));
  bind('btnNext',()=>U.stepKey(1));
  bind('btnPlay',()=>U.togglePlay());
  bind('btnLast',()=>{const c=P.activeComp();U.seek(c.duration);});
  bind('btnLoop',e=>{APP.app.loop=!APP.app.loop;e.target.classList.toggle('on',APP.app.loop);});
  bind('btnUndo',()=>C.undo.undo());
  bind('btnRedo',()=>C.undo.redo());
  bind('btnSaveJson',()=>U.saveProject());
  bind('btnOpenJson',()=>$('fileOpen').click());
  bind('btnSnap',()=>U.snapshot());
  bind('btnZoomIn',()=>U.setZoom(APP.app.zoom*1.25));
  bind('btnZoomOut',()=>U.setZoom(APP.app.zoom/1.25));
  bind('btnFit',()=>U.fit());
  bind('toolSelect',()=>U.setTool('select'));
  bind('toolPen',()=>U.setTool('pen'));
  bind('toolRect',()=>U.setTool('rect'));
  bind('toolEllipse',()=>U.setTool('ellipse'));
  bind('toolText',()=>U.setTool('text'));
  bind('toolPin',()=>U.setTool('pin'));
  for(const id of ['tgGrid','tgTitle','tgHandles','tgPaths','tgFields','tgLights']){
    bind(id,e=>{const k={tgGrid:'grid',tgTitle:'safe',tgHandles:'handles',tgPaths:'paths',tgFields:'fields',tgLights:'lights'}[id];
      APP.app.show[k]=!APP.app.show[k];e.target.classList.toggle('on',APP.app.show[k]);});
  }
  $('chanSel').onchange=e=>{APP.app.chan=e.target.value;};
  $('resSel').onchange=e=>{APP.app.res=parseFloat(e.target.value);APP.app.renderCache.clear();};
  bind('btnNewComp',()=>U.newComp());
  for(const b of document.querySelectorAll('#layerTools button')){
    b.onclick=()=>U.addLayer(b.dataset.add);
  }
  for(const b of document.querySelectorAll('#bottomTabs button[data-tab]')){
    b.onclick=()=>U.setBottomTab(b.dataset.tab);
  }
  $('btnGraphMode').onclick=()=>{
    APP.app.graphMode=APP.app.graphMode==='value'?'speed':'value';
    $('btnGraphMode').textContent=APP.app.graphMode==='value'?'值曲线':'速度曲线';
  };
  $('btnEasyEase').onclick=()=>U.easyEaseSel();
  $('fileOpen').onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{try{
      const d=JSON.parse(rd.result);
      P.load(d);C.undo.reset();C.undo.snapshot('打开工程');
      U.refreshAll();
    }catch(err){U.status('打开失败: '+err.message);}};
    rd.readAsText(f);
  };
};
U.setTool=function(t){
  APP.app.tool=t;
  for(const id of ['toolSelect','toolPen','toolRect','toolEllipse','toolText','toolPin']){
    $(id).classList.toggle('on',({toolSelect:'select',toolPen:'pen',toolRect:'rect',toolEllipse:'ellipse',toolText:'text',toolPin:'pin'})[id]===t);
  }
};
U.setZoom=function(z){
  APP.app.zoom=C.clamp(z,0.05,16);
  $('zoomVal').textContent=Math.round(APP.app.zoom*100)+'%';
  U.view();
};
U.fit=function(){
  const comp=P.activeComp();
  const c=$('gl');
  const w=parseFloat(c.style.width),h=parseFloat(c.style.height);
  APP.app.pan={x:0,y:0};
  U.setZoom(Math.min(w/comp.w,h/comp.h)*0.92);
};
U.status=function(msg){$('statusMsg').textContent=msg;};

/* ---------- 菜单 ---------- */
const MENUS={
  file:[['新建工程',()=>U.newProject(),'Ctrl+N'],['打开工程…',()=>$('fileOpen').click(),'Ctrl+O'],
    ['保存工程…',()=>U.saveProject(),'Ctrl+S'],['sep'],
    ['新建合成',()=>U.newComp(),'Ctrl+Alt+N'],['导出当前帧 PNG',()=>U.snapshot()]],
  edit:[['撤销',()=>C.undo.undo(),'Ctrl+Z'],['重做',()=>C.undo.redo(),'Ctrl+Shift+Z'],['sep'],
    ['复制图层',()=>U.duplicateLayers(),'Ctrl+D'],['删除图层',()=>U.deleteLayers(),'Del'],['sep'],
    ['全选图层',()=>{APP.app.sel=P.activeComp().layers.map(l=>l.id);U.refreshAll();},'Ctrl+A']],
  comp:[['合成设置…',()=>U.compSettings()],['sep'],
    ['新建空对象',()=>U.addLayer('null')],['新建调整层',()=>U.addLayer('adjust')],['sep'],
    ['预合成所选图层',()=>U.precompose(),'Ctrl+Shift+C']],
  layer:[['新建形状图层',()=>U.addLayer('shape')],['新建文字图层',()=>U.addLayer('text')],['sep'],
    ['新建摄像机',()=>U.addLayer('camera')],['新建灯光',()=>U.addLayer('light')],
    ['新建三维几何',()=>U.addLayer('geo3d')],['新建粒子系统',()=>U.addLayer('particle')],
    ['新建音色图层',()=>U.addLayer('audio')],['sep'],['重命名所选图层',()=>U.renameLayer(),'Enter']],
  anim:[['添加/删除位置关键帧',()=>U.toggleKey('t.pos')],['sep'],
    ['缓入缓出 (F9)',()=>U.easyEaseSel(),'F9'],['线性插值',()=>U.setInterp('linear')],
    ['贝塞尔插值',()=>U.setInterp('bezier')],['定格插值',()=>U.setInterp('hold')],['sep'],
    ['添加表达式',()=>U.addExpression()]],
  view:[['适应窗口',()=>U.fit(),'Shift+Z'],['缩放 100%',()=>{APP.app.pan={x:0,y:0};U.setZoom(1);}],['sep'],
    ['时间轴',()=>U.setBottomTab('timeline')],['曲线编辑器',()=>U.setBottomTab('graph')],
    ['节点编辑器',()=>U.setBottomTab('nodes')]],
  help:[['关于锻火',()=>alert('锻火 FORGE · AE 风味动效设计编辑器\n\n合成 / 图层 / 关键帧 / 表达式 / 节点 / 粒子 / 三维 / 导出\n全部由本编辑器实时计算生成。')],
    ['字体与字符范围',()=>U.showFontMap()]]
};
U.bindMenus=function(){
  document.querySelectorAll('#menubar button').forEach(b=>{
    b.onclick=e=>{
      e.stopPropagation();
      const items=MENUS[b.dataset.menu];
      if(!items)return;
      const r=b.getBoundingClientRect();
      U.popup(items,r.left,r.bottom);
    };
  });
  document.addEventListener('click',()=>U.closePopup());
};
U.popup=function(items,x,y){
  U.closePopup();
  const m=el('div','menu-pop');
  for(const it of items){
    if(it[0]==='sep'){m.appendChild(el('div','msep'));continue;}
    const d=el('div','mi',`<span>${it[0]}</span><span class="k">${it[2]||''}</span>`);
    d.onclick=ev=>{ev.stopPropagation();U.closePopup();it[1]();};
    m.appendChild(d);
  }
  m.style.left=Math.min(x,window.innerWidth-200)+'px';
  m.style.top=y+'px';
  document.body.appendChild(m);
  U._popup=m;
};
U.closePopup=function(){if(U._popup){U._popup.remove();U._popup=null;}};
U.showFontMap=function(){
  const f=APP.font.chars();
  alert('锻火体 · 可用字符\n\n汉字 ('+f.cjk.length+'): '+f.cjk.join('')+
    '\n\n拉丁/数字/符号 ('+f.lat.length+'): '+f.lat.join('')+
    '\n\n未列出的字符将显示为缺字方块。');
};

/* ================= 工程操作 ================= */
U.newProject=function(){
  const pr=P.newProject();
  APP.app.project=pr;
  APP.app.sel=[];
  C.undo.reset();
  U.refreshAll();
  U.status('已新建空工程');
};
U.newComp=function(){
  const c=P.newComp('合成 '+(APP.app.project.comps.length+1),1280,720,30,15);
  APP.app.project.comps.push(c);
  APP.app.project.activeComp=c.id;
  C.undo.commit('新建合成');
  U.refreshAll();
};
U.compSettings=function(){
  const c=P.activeComp();
  const w=prompt('宽度',c.w),h=prompt('高度',c.h),fps=prompt('帧率',c.fps),dur=prompt('时长(秒)',c.duration);
  if(w)c.w=parseInt(w);if(h)c.h=parseInt(h);if(fps)c.fps=parseFloat(fps);
  if(dur){c.duration=parseFloat(dur);c.workEnd=c.duration;}
  C.undo.commit('合成设置');
  U.refreshAll();
};
U.saveProject=function(){
  const data=P.serialize();
  const blob=new Blob([JSON.stringify(data)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(APP.app.project.name||'工程')+'.forge';
  a.click();
  U.status('工程已保存');
};
U.snapshot=function(){
  const c=$('gl');
  const a=document.createElement('a');
  a.href=c.toDataURL('image/png');
  a.download='frame_'+Math.round(APP.app.time*30)+'.png';
  a.click();
};
U.addLayer=function(type){
  const comp=P.activeComp();
  const names={shape:'形状',text:'文字',null:'空对象',adjust:'调整层',precomp:'预合成',camera:'摄像机',
    light:'灯光',geo3d:'三维几何',particle:'粒子',audio:'音色'};
  const L=P.newLayer(type,(names[type]||'图层')+' '+(comp.layers.length+1));
  if(type==='camera'||type==='light'||type==='geo3d'||type==='particle'){
    L.t.pos.v=[0,0,type==='camera'?-1400:0];
  }
  comp.layers.push(L);
  APP.app.sel=[L.id];
  C.undo.commit('新建'+names[type]+'图层');
  U.refreshAll();
};
U.deleteLayers=function(){
  const comp=P.activeComp();
  const ids=APP.app.sel.slice();
  if(!ids.length)return;
  comp.layers=comp.layers.filter(l=>!ids.includes(l.id));
  for(const l of comp.layers)if(ids.includes(l.parent))l.parent=null;
  APP.app.sel=[];
  C.undo.commit('删除图层');
  U.refreshAll();
};
U.duplicateLayers=function(){
  const comp=P.activeComp();
  const sel=comp.layers.filter(l=>APP.app.sel.includes(l.id));
  if(!sel.length)return;
  const top=sel[sel.length-1];
  const copies=P.duplicateLayer(top,comp);
  APP.app.sel=[copies.id,...P.allDescendants(copies.id,comp)];
  C.undo.commit('复制图层');
  U.refreshAll();
};
U.renameLayer=function(){
  const l=U.selLayer();if(!l)return;
  const n=prompt('图层名称',l.name);
  if(n){l.name=n;C.undo.commit('重命名');U.refreshAll();}
};
U.precompose=function(){
  const comp=P.activeComp();
  const ids=APP.app.sel.filter(id=>comp.layers.some(l=>l.id===id));
  if(!ids.length){U.status('请先选择要预合成的图层');return;}
  const sel=comp.layers.filter(l=>ids.includes(l.id));
  const minT=Math.min(...sel.map(l=>l.inPoint||0));
  const maxT=Math.max(...sel.map(l=>l.outPoint!==null?l.outPoint:comp.duration));
  const nc=P.newComp('预合成 '+comp.name,comp.w,comp.h,comp.fps,comp.duration);
  // 保留原变换: 预合成内图层反向补偿
  const newLayers=sel.map(l=>{
    const c=C.deepClone(l);
    c.id=C.uid('L');
    // 保持画面一致: 位置减去组偏移(这里组偏移为 0, 保持各层原变换)
    return c;
  });
  nc.layers=newLayers;
  APP.app.project.comps.push(nc);
  const pl=P.newLayer('precomp','预合成 '+comp.name);
  pl.precomp.compId=nc.id;
  pl.inPoint=minT;pl.outPoint=maxT;
  pl.t.pos.v=[0,0,0];
  pl.precomp.timeRemap=P.newProp(minT);
  P.setKey(pl.precomp.timeRemap,minT,minT);
  P.setKey(pl.precomp.timeRemap,maxT,maxT);
  // 移除原图层并插入
  comp.layers=comp.layers.filter(l=>!ids.includes(l.id));
  const idx=comp.layers.findIndex(l=>l.id===ids[0]);
  comp.layers.splice(idx<0?comp.layers.length:idx,0,pl);
  APP.app.sel=[pl.id];
  C.undo.commit('预合成');
  U.refreshAll();
  U.status('已创建预合成, 前后时刻画面一致');
};

/* ================= 选择 ================= */
U.selLayer=function(){
  const comp=P.activeComp();
  if(!comp||!APP.app.sel.length)return null;
  return comp.layers.find(l=>l.id===APP.app.sel[APP.app.sel.length-1])||null;
};
U.selLayers=function(){
  const comp=P.activeComp();
  return comp.layers.filter(l=>APP.app.sel.includes(l.id));
};
U.select=function(ids,add){
  APP.app.sel=add?APP.app.sel.concat(ids.filter(i=>!APP.app.sel.includes(i))):ids.slice();
  U.refreshAll();
};

/* ================= 播放 ================= */
U.togglePlay=function(){
  if(APP.app.playing)U.pause();else U.play();
};
U.play=function(){
  const comp=P.activeComp();
  APP.app.playing=true;
  $('btnPlay').textContent='❚❚';
  AU.schedule(comp,APP.app.time);
};
U.pause=function(){
  APP.app.playing=false;
  $('btnPlay').textContent='▶';
  AU.stop();
};
U.seek=function(t){
  const comp=P.activeComp();
  APP.app.time=C.clamp(t,0,comp.duration);
  APP.app.renderCache.clear();
  AU.stop();
  if(APP.app.playing)AU.schedule(comp,APP.app.time);
  U.refreshTimeline();
  U.updateTimeRead();
};
U.stepKey=function(dir){
  const comp=P.activeComp();
  const times=[];
  for(const l of comp.layers){
    const props=[l.t.anchor,l.t.pos,l.t.scale,l.t.rot,l.t.opacity].concat(Object.values(l.props||{}));
    for(const p of props)if(p&&p.keys)for(const k of p.keys)times.push(k.t);
  }
  times.sort((a,b)=>a-b);
  const t=APP.app.time;
  if(dir>0){
    const n=times.find(x=>x>t+1e-4);
    U.seek(n!==undefined?n:comp.duration);
  }else{
    const prev=times.filter(x=>x<t-1e-4);
    U.seek(prev.length?prev[prev.length-1]:0);
  }
};
U.updateTimeRead=function(){
  const comp=P.activeComp();
  const f=Math.round(APP.app.time*comp.fps);
  $('timeRead').textContent=Math.floor(f/comp.fps)+':'+String(f%comp.fps).padStart(2,'0');
  $('stTime').textContent=APP.app.time.toFixed(2)+'s / '+comp.duration+'s · '+comp.w+'×'+comp.h+' @'+comp.fps+'fps';
};
U.loop=function(){
  let last=performance.now();
  const tick=(now)=>{
    const dt=(now-last)/1000;last=now;
    if(APP.app.playing){
      const comp=P.activeComp();
      let t=APP.app.time+dt;
      if(t>comp.duration){
        if(APP.app.loop)t=t%comp.duration;
        else{t=comp.duration;U.pause();}
      }
      APP.app.time=t;
      APP.app.renderCache.clear();
      U.refreshTimeline();
      U.updateTimeRead();
    }
    U.renderFrame();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/* ================= 帧渲染 ================= */
U.renderFrame=function(){
  const comp=P.activeComp();
  if(!comp||!R.gl||!R.gl.getError)return;
  const t0=performance.now();
  const c=$('gl');
  const res=APP.app.res;
  const w=Math.max(2,Math.round(comp.w*res)),h=Math.max(2,Math.round(comp.h*res));
  // 相机 DOF
  let cam=null;
  for(const l of comp.layers)if(l.type==='camera'&&l.visible&&A.layerActive(l,comp,APP.app.time)){cam=l;break;}
  const dof=cam?A.evalNum(cam.props.aperture,APP.app.time,{comp,layer:cam,time:APP.app.time}):0;
  const focus=cam?A.evalNum(cam.props.focus,APP.app.time,{comp,layer:cam,time:APP.app.time}):0;
  const fbo=R.renderComp(comp,APP.app.time,{w,h,noMB:false,dof,focus});
  const v=APP.app.viewT;
  R.present(fbo,c,{w:comp.w,h:comp.h,ox:v.ox,oy:v.oy,z:v.z});
  U.drawOverlay();
  const ms=performance.now()-t0;
  $('stPerf').textContent=ms.toFixed(1)+' ms/帧';
  $('stComp').textContent=comp.name;
  $('stSel').textContent=APP.app.sel.length?APP.app.sel.length+' 个选中':'无选择';
};

/* ================= 覆盖层绘制 ================= */
U.drawOverlay=function(){
  const o=APP.app.ov,ctx=APP.app.ovctx;
  const comp=P.activeComp();
  if(!comp)return;
  const W=o.width,H=o.height;
  ctx.clearRect(0,0,W,H);
  const S2=APP.app.show;
  // 网格
  if(S2.grid){
    const step=comp.w/16;
    ctx.strokeStyle='rgba(120,140,170,0.09)';
    ctx.lineWidth=1;
    ctx.beginPath();
    for(let x=-comp.w/2;x<=comp.w/2+0.1;x+=step){
      const a=U.compToScreen(x,-comp.h/2),b=U.compToScreen(x,comp.h/2);
      ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
    }
    for(let y=-comp.h/2;y<=comp.h/2+0.1;y+=step){
      const a=U.compToScreen(-comp.w/2,y),b=U.compToScreen(comp.w/2,y);
      ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
    }
    ctx.stroke();
  }
  // 安全框
  if(S2.safe){
    ctx.strokeStyle='rgba(120,140,170,0.35)';
    ctx.setLineDash([4,4]);
    ctx.beginPath();
    for(const k of [0.9,0.8]){
      const a=U.compToScreen(-comp.w/2*k,-comp.h/2*k),b=U.compToScreen(comp.w/2*k,-comp.h/2*k),
            c2=U.compToScreen(comp.w/2*k,comp.h/2*k),d=U.compToScreen(-comp.w/2*k,comp.h/2*k);
      ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c2.x,c2.y);ctx.lineTo(d.x,d.y);ctx.closePath();
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const t=APP.app.time;
  // 场范围
  if(S2.fields){
    for(const f of (comp.fields||[])){
      if(!f.enabled)continue;
      const p=A.eval(f.pos,t,{comp,time:t});
      const rad=A.evalNum(f.radius,t,{comp,time:t});
      ctx.strokeStyle=f.type==='noise'?'rgba(120,220,255,0.5)':f.type==='vortex'?'rgba(190,140,255,0.5)':'rgba(255,170,80,0.5)';
      ctx.setLineDash([3,3]);
      ctx.beginPath();
      for(let i=0;i<=32;i++){
        const a=i/32*Math.PI*2;
        const s=U.compToScreen(p[0]+Math.cos(a)*rad,p[1]+Math.sin(a)*rad,0);
        i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);
      }
      ctx.closePath();ctx.stroke();
      ctx.setLineDash([]);
      const s0=U.compToScreen(p[0],p[1],0);
      ctx.fillStyle='rgba(255,200,120,0.8)';
      ctx.font='11px sans-serif';
      ctx.fillText('场:'+f.name+'('+f.type+')',s0.x+6,s0.y-6);
    }
  }
  // 图层辅助
  for(const l of comp.layers){
    if(!A.layerActive(l,comp,t))continue;
    if(l.type==='light'&&S2.lights){
      const m=A.worldMatrixAt(l,comp,t);
      const s0=U.compToScreen(m[12],m[13],m[14]);
      ctx.fillStyle='rgba(255,230,150,0.9)';
      ctx.beginPath();ctx.arc(s0.x,s0.y,5,0,7);ctx.fill();
      const dir={x:-m[8],y:-m[9],z:-m[10]};
      const s1=U.compToScreen(m[12]+dir.x*160,m[13]+dir.y*160,m[14]+dir.z*160);
      ctx.strokeStyle='rgba(255,230,150,0.6)';
      ctx.beginPath();ctx.moveTo(s0.x,s0.y);ctx.lineTo(s1.x,s1.y);ctx.stroke();
      ctx.fillStyle='rgba(255,230,150,0.8)';ctx.font='11px sans-serif';
      ctx.fillText('光源 · '+l.name,s0.x+8,s0.y+14);
    }
    if(l.type==='camera'&&S2.lights){
      const m=A.worldMatrixAt(l,comp,t);
      const s0=U.compToScreen(m[12],m[13],m[14]);
      ctx.strokeStyle='rgba(120,200,255,0.9)';
      ctx.beginPath();ctx.arc(s0.x,s0.y,6,0,7);ctx.stroke();
      ctx.fillStyle='rgba(120,200,255,0.9)';ctx.font='11px sans-serif';
      ctx.fillText('摄像机 · '+l.name,s0.x+8,s0.y+14);
    }
  }
  // 选中图层: 运动路径 + 选择框 + 手柄
  for(const l of U.selLayers()){
    if(S2.paths&&l.t.pos.keys&&l.t.pos.keys.length>1){
      const path=A.spatialPath(l.t.pos,comp);
      if(path){
        ctx.strokeStyle='rgba(255,190,110,0.85)';
        ctx.lineWidth=1.5;
        ctx.beginPath();
        path.forEach((p,i)=>{const s=U.compToScreen(p.x,p.y,l.is3D?0:0);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y);});
        ctx.stroke();
        // 关键帧点
        for(const k of l.t.pos.keys){
          const s=U.compToScreen(k.v[0],k.v[1],0);
          ctx.fillStyle='rgba(255,190,110,0.95)';
          ctx.fillRect(s.x-3,s.y-3,6,6);
        }
      }
    }
    if(S2.handles)U.drawLayerHandles(ctx,l,comp,t);
  }
  // 播放头指示
  ctx.fillStyle='rgba(255,120,40,0.9)';
  ctx.font='bold 12px sans-serif';
  ctx.fillText('▶ '+APP.app.time.toFixed(2)+'s',10,18);
};
U.layerBox=function(l,comp,t){
  // 图层内容的局部包围盒
  let b=null;
  if(l.type==='shape'){
    const ops=[];
    for(const g of (l.shape?l.shape.groups:[]))for(const op of CT.buildGroup(g,l,comp,t))ops.push(op);
    for(const op of ops){
      const pts=op.kind==='fill'?op.paths.flatMap(p=>p.pts):(op.rings||[]);
      for(const p of pts){
        if(!b)b={x0:p.x,y0:p.y,x1:p.x,y1:p.y};
        else{b.x0=Math.min(b.x0,p.x);b.y0=Math.min(b.y0,p.y);b.x1=Math.max(b.x1,p.x);b.y1=Math.max(b.y1,p.y);}
      }
    }
  }else if(l.type==='text'){
    const layout=CT.textLayout(l,comp,t);
    b={x0:-layout.width/2,y0:-layout.height/2,x1:layout.width/2,y1:layout.height/2};
  }else if(l.type==='geo3d'){
    try{
      const cs=CT.geoContours(l,comp,t);
      const bb=G.bounds(cs);
      if(bb.w>0)b={x0:bb.x,y0:bb.y,x1:bb.x+bb.w,y1:bb.y+bb.h};
    }catch(e){}
  }else if(l.type==='precomp'){
    const sub=P.comp(l.precomp.compId);
    if(sub)b={x0:-sub.w/2,y0:-sub.h/2,x1:sub.w/2,y1:sub.h/2};
  }else if(l.type==='particle'||l.type==='null'||l.type==='camera'||l.type==='light'){
    b={x0:-40,y0:-40,x1:40,y1:40};
  }
  if(!b)b={x0:-50,y0:-50,x1:50,y1:50};
  return b;
};
U.drawLayerHandles=function(ctx,l,comp,t){
  const b=U.layerBox(l,comp,t);
  const m=A.worldMatrixAt(l,comp,t);
  const corners=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].map(p=>{
    const w=C.m4transformPoint(m,p[0],p[1],0);
    return U.compToScreen(w.x,w.y,w.z);
  });
  ctx.strokeStyle='rgba(255,160,60,0.95)';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.moveTo(corners[0].x,corners[0].y);
  for(let i=1;i<4;i++)ctx.lineTo(corners[i].x,corners[i].y);
  ctx.closePath();ctx.stroke();
  // 手柄
  const hs=[[0,0],[1,0],[1,1],[0,1]].map((c,i)=>corners[i]);
  for(const h of hs){
    ctx.fillStyle='#1b1e24';ctx.strokeStyle='rgba(255,160,60,0.95)';
    ctx.beginPath();ctx.rect(h.x-4,h.y-4,8,8);ctx.fill();ctx.stroke();
  }
  // 旋转手柄(顶边中点上方)
  const mid={x:(corners[0].x+corners[1].x)/2,y:(corners[0].y+corners[1].y)/2};
  const dx=corners[1].x-corners[0].x,dy=corners[1].y-corners[0].y;
  const len=Math.hypot(dx,dy)||1;
  const rh={x:mid.x-dy/len*26,y:mid.y+dx/len*26};
  ctx.beginPath();ctx.moveTo(mid.x,mid.y);ctx.lineTo(rh.x,rh.y);ctx.stroke();
  ctx.beginPath();ctx.arc(rh.x,rh.y,5,0,7);ctx.stroke();
  // 锚点
  const a=A.eval(l.t.anchor,t,{comp,layer:l,time:t});
  const aw=C.m4transformPoint(m,a[0],a[1],0);
  const as=U.compToScreen(aw.x,aw.y,aw.z);
  ctx.strokeStyle='rgba(120,200,255,0.95)';
  ctx.beginPath();ctx.arc(as.x,as.y,4.5,0,7);ctx.stroke();
  ctx.beginPath();ctx.moveTo(as.x-7,as.y);ctx.lineTo(as.x+7,as.y);ctx.moveTo(as.x,as.y-7);ctx.lineTo(as.x,as.y+7);ctx.stroke();
  U._handles={corners,rot:rh,anchor:as,box:b};
};

/* ================= 画布交互 ================= */
U.bindCanvas=function(){
  const o=$('ov');
  let start=null;
  const pos=e=>{
    const r=o.getBoundingClientRect();
    return {x:e.clientX-r.left,y:e.clientY-r.top};
  };
  o.addEventListener('mousedown',e=>{
    const p=pos(e);
    U.closePopup();
    const hit=U.hitTest(p);
    if(hit){
      C.undo.begin('画布操作');
      APP.app.drag={type:hit.type,layer:hit.layer,start:p,orig:U.snapshotProps(hit.layer),index:hit.index};
      e.preventDefault();
    }else if(e.button===0&&!hit){
      APP.app.drag={type:'marquee',start:p};
    }
    if(e.button===1){APP.app.drag={type:'pan',start:p,pan:Object.assign({},APP.app.pan)};e.preventDefault();}
  });
  window.addEventListener('mousemove',e=>{
    const d=APP.app.drag;
    if(!d)return;
    const p=pos(e);
    U.doDrag(d,p);
  });
  window.addEventListener('mouseup',e=>{
    const d=APP.app.drag;
    if(d&&d.type!=='pan'&&d.type!=='marquee'){
      C.undo.commit('画布操作');
      APP.app.renderCache.clear();
    }
    if(d&&d.type==='marquee'){
      const comp=P.activeComp();
      const p=pos(e);
      const x0=Math.min(d.start.x,p.x),x1=Math.max(d.start.x,p.x);
      const y0=Math.min(d.start.y,p.y),y1=Math.max(d.start.y,p.y);
      const hits=[];
      for(const l of comp.layers){
        const b=U.layerBox(l,comp,APP.app.time);
        const m=A.worldMatrixAt(l,comp,APP.app.time);
        const c=U.compToScreen(C.m4transformPoint(m,(b.x0+b.x1)/2,(b.y0+b.y1)/2,0).x,
                               C.m4transformPoint(m,(b.x0+b.x1)/2,(b.y0+b.y1)/2,0).y,0);
        if(c.x>=x0&&c.x<=x1&&c.y>=y0&&c.y<=y1)hits.push(l.id);
      }
      if(hits.length)U.select(hits,e.shiftKey);
    }
    APP.app.drag=null;
  });
  o.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){
      const p=pos(e);
      const before=U.screenToComp(p.x,p.y);
      U.setZoom(APP.app.zoom*(e.deltaY<0?1.1:0.9));
      U.view();
      const after=U.screenToComp(p.x,p.y);
      APP.app.pan.x+=(after.x-before.x)*APP.app.viewT.z;
      APP.app.pan.y+=(after.y-before.y)*APP.app.viewT.z;
      U.view();
    }else{
      APP.app.pan.x-=e.deltaX;APP.app.pan.y-=e.deltaY;
      U.view();
    }
  },{passive:false});
  o.addEventListener('dblclick',e=>{
    const p=pos(e);
    const hit=U.hitTest(p);
    if(!hit){
      const comp=P.activeComp();
      const cp=U.screenToComp(p.x,p.y);
      U.select([],false);
    }
  });
  o.addEventListener('contextmenu',e=>{
    e.preventDefault();
    const p=pos(e);
    const hit=U.hitTest(p);
    if(hit&&hit.layer){
      U.select([hit.layer.id],false);
      U.popup([['重命名',()=>U.renameLayer()],['复制',()=>U.duplicateLayers()],
        ['删除',()=>U.deleteLayers()],['sep'],['预合成',()=>U.precompose()]],e.clientX,e.clientY);
    }
  });
};
U.snapshotProps=function(l){
  return C.deepClone(l.t);
};
U.hitTest=function(p){
  const comp=P.activeComp();
  if(!comp)return null;
  // 选中图层的手柄优先
  for(const l of U.selLayers()){
    if(!APP.app.show.handles)continue;
    const b=U.layerBox(l,comp,APP.app.time);
    const m=A.worldMatrixAt(l,comp,APP.app.time);
    const cs=[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].map(q=>{
      const w=C.m4transformPoint(m,q[0],q[1],0);return U.compToScreen(w.x,w.y,w.z);});
    const names=['nw','ne','se','sw'];
    for(let i=0;i<4;i++){
      if(Math.abs(p.x-cs[i].x)<8&&Math.abs(p.y-cs[i].y)<8)return {type:'scale',layer:l,index:i,corner:cs[i]};
    }
    const mid={x:(cs[0].x+cs[1].x)/2,y:(cs[0].y+cs[1].y)/2};
    const dx=cs[1].x-cs[0].x,dy=cs[1].y-cs[0].y,len=Math.hypot(dx,dy)||1;
    const rh={x:mid.x-dy/len*26,y:mid.y+dx/len*26};
    if(Math.abs(p.x-rh.x)<9&&Math.abs(p.y-rh.y)<9)return {type:'rotate',layer:l};
    const a=A.eval(l.t.anchor,APP.app.time,{comp,layer:l,time:APP.app.time});
    const aw=C.m4transformPoint(m,a[0],a[1],0);
    const as=U.compToScreen(aw.x,aw.y,aw.z);
    if(Math.abs(p.x-as.x)<8&&Math.abs(p.y-as.y)<8)return {type:'anchor',layer:l};
  }
  // 点击内容选中图层(自上而下)
  const list=comp.layers.slice().reverse();
  for(const l of list){
    if(!A.layerActive(l,comp,APP.app.time))continue;
    if(l.type==='camera'||l.type==='light'||l.type==='audio')continue;
    const cp=U.screenToComp(p.x,p.y);
    let inside=false;
    try{
      if(l.type==='shape'||l.type==='geo3d'||l.type==='text'){
        const cs=CT.geoContours(l,comp,APP.app.time);
        if(cs.length){
          // 转换到本地坐标
          const inv=C.m4inv(A.worldMatrixAt(l,comp,APP.app.time));
          const lp=C.m4transformPoint(inv,cp.x,cp.y,0);
          inside=G.pointInside(cs,lp.x,lp.y);
        }
      }
      if(l.type==='particle'){
        const o=A.layerOrigin(l,comp,APP.app.time);
        inside=Math.hypot(cp.x-o.x,cp.y-o.y)<80;
      }
    }catch(e){}
    if(inside)return {type:'select',layer:l};
  }
  return null;
};
U.doDrag=function(d,p){
  const comp=P.activeComp();
  const t=APP.app.time;
  if(d.type==='pan'){
    APP.app.pan.x=d.pan.x+(p.x-d.start.x);
    APP.app.pan.y=d.pan.y+(p.y-d.start.y);
    U.view();return;
  }
  const l=d.layer;
  if(!l)return;
  const ctx={comp,layer:l,time:t};
  if(d.type==='select'){
    const cur=A.eval(l.t.pos,t,ctx);
    const orig=d.orig.pos.v;
    const a=U.screenToComp(d.start.x,d.start.y);
    const b=U.screenToComp(p.x,p.y);
    const v=Array.isArray(cur)?cur.slice():[cur,0,0];
    v[0]=orig[0]+(b.x-a.x);
    v[1]=orig[1]+(b.y-a.y);
    A.setKey(l.t.pos,t,v,ctx);
    l.t.pos.anim=true;
    U.refreshProps();
  }else if(d.type==='anchor'){
    // 只移动锚点, 位置补偿保持画面不变
    const a=U.screenToComp(d.start.x,d.start.y);
    const b=U.screenToComp(p.x,p.y);
    const cur=A.eval(l.t.anchor,t,ctx);
    const v=[cur[0]+(b.x-a.x),cur[1]+(b.y-a.y),cur[2]||0];
    A.setKey(l.t.anchor,t,v,ctx);l.t.anchor.anim=true;
    // 位置补偿: 使锚点世界位置不变
    const inv=C.m4inv(A.localMatrix(l,t,ctx));
    const oldW=C.m4transformPoint(A.worldMatrix(l,comp,t,ctx),d.orig.anchor.v[0],d.orig.anchor.v[1],0);
    const newW=C.m4transformPoint(A.worldMatrix(l,comp,t,ctx),v[0],v[1],0);
    const cp=A.eval(l.t.pos,t,ctx);
    const pv=[cp[0]+(oldW.x-newW.x),cp[1]+(oldW.y-newW.y),cp[2]||0];
    A.setKey(l.t.pos,t,pv,ctx);l.t.pos.anim=true;
    U.refreshProps();
  }else if(d.type==='rotate'){
    const b=U.layerBox(l,comp,t);
    const m=A.worldMatrixAt(l,comp,t);
    const cw=C.m4transformPoint(m,(b.x0+b.x1)/2,(b.y0+b.y1)/2,0);
    const cs=U.compToScreen(cw.x,cw.y,cw.z);
    const a0=Math.atan2(d.start.y-cs.y,d.start.x-cs.x);
    const a1=Math.atan2(p.y-cs.y,p.x-cs.x);
    const cur=A.eval(l.t.rot,t,ctx);
    const deg=(a1-a0)*180/Math.PI;
    A.setKey(l.t.rot,t,[cur[0],cur[1],cur[2]+deg],ctx);
    l.t.rot.anim=true;
    U.refreshProps();
  }else if(d.type==='scale'){
    const b=U.layerBox(l,comp,t);
    const m=A.worldMatrixAt(l,comp,t);
    const cw=C.m4transformPoint(m,(b.x0+b.x1)/2,(b.y0+b.y1)/2,0);
    const cs=U.compToScreen(cw.x,cw.y,cw.z);
    const d0=Math.hypot(d.start.x-cs.x,d.start.y-cs.y)||1;
    const d1=Math.hypot(p.x-cs.x,p.y-cs.y);
    const f=d1/d0;
    const cur=A.eval(l.t.scale,t,ctx);
    const orig=d.orig.scale.v;
    A.setKey(l.t.scale,t,[orig[0]*f,orig[1]*f,orig[2]],ctx);
    l.t.scale.anim=true;
    U.refreshProps();
  }
};

/* ================= 时间轴 ================= */
U.bindTimeline=function(){
  const c=$('tlCanvas');
  const rect=()=>c.getBoundingClientRect();
  const fit=()=>{
    c.width=rect().width*2;c.height=rect().height*2;
    c.style.width=rect().width+'px';c.style.height=rect().height+'px';
  };
  fit();
  window.addEventListener('resize',fit);
  const pos=e=>{const r=rect();return {x:(e.clientX-r.left)*2,y:(e.clientY-r.top)*2};};
  const rowAt=y=>{
    const comp=P.activeComp();
    const top=28;
    const idx=Math.floor((y-top)/18);
    if(idx<0||idx>=comp.layers.length)return null;
    return comp.layers[comp.layers.length-1-idx];
  };
  const timeAt=x=>{
    const comp=P.activeComp();
    return (x-190)/APP.app.tlZoom;
  };
  const xOfTime=t=>190+t*APP.app.tlZoom;
  let drag=null;
  c.addEventListener('mousedown',e=>{
    const p=pos(e);const comp=P.activeComp();
    if(p.y<28){drag={type:'scrub'};U.seek(timeAt(p.x));return;}
    const l=rowAt(p.y);
    if(!l)return;
    if(p.x<186){
      // 图层选择 / 可见性
      if(p.x<24){l.visible=!l.visible;C.undo.commit('切换可见');U.refreshAll();return;}
      if(p.x<44){l.locked=!l.locked;C.undo.commit('切换锁定');U.refreshAll();return;}
      U.select([l.id],e.shiftKey||e.ctrlKey||e.metaKey);
      drag={type:'layer',layer:l};
      return;
    }
    if(!APP.app.sel.includes(l.id))U.select([l.id],false);
    const keys=collectKeys(l);
    const kx=xOfTime;
    for(const k of keys){
      if(Math.abs(p.x-kx(k.t))<6&&Math.abs(p.y-(28+(comp.layers.length-1-comp.layers.indexOf(l))*18+9))<8){
        drag={type:'key',layer:l,prop:k.prop,key:k.key,orig:k.key.t,moved:false};
        C.undo.begin('移动关键帧');
        if(!e.shiftKey)APP.app.tlSelKeys=[{layer:l.id,prop:k.path,idx:k.idx}];
        else APP.app.tlSelKeys.push({layer:l.id,prop:k.path,idx:k.idx});
        return;
      }
    }
    // 空白: 框选关键帧
    drag={type:'tlmarquee',start:p};
  });
  window.addEventListener('mousemove',e=>{
    if(!drag)return;
    const p=pos(e);
    if(drag.type==='scrub'){U.seek(timeAt(p.x));}
    else if(drag.type==='key'){
      const nt=Math.max(0,timeAt(p.x));
      if(Math.abs(nt-drag.orig)>0.02)drag.moved=true;
      drag.key.t=nt;
      drag.prop.keys.sort((a,b)=>a.t-b.t);
      APP.app.renderCache.clear();
    }else if(drag.type==='tlmarquee'){
      drag.cur=p;
    }
  });
  window.addEventListener('mouseup',()=>{
    if(drag&&drag.type==='key'){C.undo.commit('移动关键帧');}
    if(drag&&drag.type==='tlmarquee'){
      // 框选关键帧
      const comp=P.activeComp();
      const x0=Math.min(drag.start.x,drag.cur.x),x1=Math.max(drag.start.x,drag.cur.x);
      const y0=Math.min(drag.start.y,drag.cur.y),y1=Math.max(drag.start.y,drag.cur.y);
      const sel=[];
      const r0=rowAt(y0),r1=rowAt(y1);
      const layers=comp.layers.filter(l=>{
        const i=comp.layers.length-1-comp.layers.indexOf(l);
        const yy=28+i*18;
        return yy>=y0-18&&yy+18<=y1+18;
      });
      for(const l of layers)for(const k of collectKeys(l)){
        const yy=28+(comp.layers.length-1-comp.layers.indexOf(l))*18+9;
        if(xOfTime(k.t)>=x0&&xOfTime(k.t)<=x1&&yy>=y0&&yy<=y1)sel.push({layer:l.id,prop:k.path,idx:k.idx});
      }
      APP.app.tlSelKeys=sel;
    }
    drag=null;
    U.refreshTimeline();
  });
  c.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){
      const r=rect();
      const mx=(e.clientX-r.left)*2;
      const t0=timeAt(mx);
      APP.app.tlZoom=C.clamp(APP.app.tlZoom*(e.deltaY<0?1.15:0.87),4,600);
      const t1=timeAt(mx);
      APP.app.tlScroll+= (t1-t0);
    }else{
      APP.app.tlScroll-=e.deltaY*0.002;
    }
  },{passive:false});
  function collectKeys(l){
    const out=[];
    const walk=(obj,path)=>{
      if(!obj||typeof obj!=='object')return;
      if(obj.v!==undefined&&obj.keys){
        for(let i=0;i<obj.keys.length;i++)out.push({prop:obj,path:path+'/'+i,key:obj.keys[i],idx:i});
      }else{
        for(const k in obj){
          const v=obj[k];
          if(v&&typeof v==='object'&&k!=='path'&&k!=='pathItem')walk(v,path+'.'+k);
        }
      }
    };
    walk(l.t,'t');
    for(const k in (l.props||{}))walk({p:l.props[k]},'props.'+k);
    for(let i=0;i<(l.masks||[]).length;i++)walk(l.masks[i].props,'masks.'+i+'.props');
    for(let i=0;i<(l.effects||[]).length;i++)walk(l.effects[i].props,'effects.'+i+'.props');
    if(l.shape)for(let i=0;i<l.shape.groups.length;i++){
      walk(l.shape.groups[i].transform,'shape.groups.'+i+'.transform');
      for(const it of l.shape.groups[i].items){
        if(it.type==='trim'||it.type==='repeater'){
          for(const k in it)if(it[k]&&it[k].keys)walk({p:it[k]},'shape.groups.'+i+'.items.'+it.id+'.'+k);
        }
      }
    }
    if(l.particle){
      walk(l.particle,'particle');
    }
    if(l.precomp)walk(l.precomp.timeRemap,'precomp.timeRemap');
    return out;
  }
  U._tlCollect=collectKeys;
};
U.refreshTimeline=function(){
  const c=$('tlCanvas');
  if(!c)return;
  const ctx=c.getContext('2d');
  const comp=P.activeComp();
  if(!comp)return;
  const W=c.width,H=c.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#15181e';ctx.fillRect(0,0,W,H);
  const zoom=APP.app.tlZoom;
  const x0=190;
  const y0=28,rowH=18;
  const dur=comp.duration;
  const viewT0=-APP.app.tlScroll,viewT1=viewT0+(W-x0)/zoom;
  // 标尺
  ctx.fillStyle='#1f242d';ctx.fillRect(0,0,W,y0);
  ctx.strokeStyle='#39414d';ctx.beginPath();ctx.moveTo(0,y0);ctx.lineTo(W,y0);ctx.stroke();
  const stepChoices=[0.1,0.2,0.5,1,2,5,10];
  let step=stepChoices.find(s=>s*zoom>60)||10;
  ctx.font='10px Consolas,monospace';
  for(let t=Math.floor(viewT0/step)*step;t<=viewT1;t+=step){
    const x=x0+(t-viewT0)*zoom;
    if(x<x0)continue;
    ctx.strokeStyle='#39414d';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,y0);ctx.stroke();
    ctx.fillStyle='#8b95a3';ctx.fillText(t.toFixed(step<1?1:0)+'s',x+3,12);
    for(let f=1;f<comp.fps*step;f++){
      const tf=t+f/comp.fps;
      const fx=x0+(tf-viewT0)*zoom;
      ctx.strokeStyle='#2a3038';ctx.beginPath();ctx.moveTo(fx,y0-6);ctx.lineTo(fx,y0);ctx.stroke();
    }
  }
  // 工作区
  ctx.fillStyle='rgba(255,154,60,0.07)';
  ctx.fillRect(x0+(comp.workStart-viewT0)*zoom,0,(comp.workEnd-comp.workStart)*zoom,H);
  // 图层行
  const collect=U._tlCollect||(()=>[]);
  for(let i=0;i<comp.layers.length;i++){
    const l=comp.layers[i];
    const y=y0+i*rowH;
    ctx.fillStyle=i%2?'#171a20':'#1b1f26';
    ctx.fillRect(0,y,W,rowH);
    ctx.strokeStyle='#22272e';ctx.beginPath();ctx.moveTo(0,y+rowH);ctx.lineTo(W,y+rowH);ctx.stroke();
    const sel=APP.app.sel.includes(l.id);
    ctx.fillStyle=sel?'#2a2118':'transparent';
    ctx.fillRect(0,y,186,rowH);
    // 图标
    ctx.fillStyle=P.layerLabel(l);
    ctx.fillRect(0,y,3,rowH);
    ctx.fillStyle=l.visible?'#ff9a3c':'#3d444d';
    ctx.font='11px sans-serif';
    ctx.fillText('●',7,y+13);
    ctx.fillStyle=l.locked?'#4fd6ff':'#3d444d';
    ctx.fillText(l.locked?'🔒':'',26,y+13);
    ctx.fillStyle=sel?'#fff':'#b9c1cc';
    ctx.font='11px "Microsoft YaHei",sans-serif';
    const nm=(P.TYPE_ICON[l.type]||'')+' '+l.name;
    ctx.fillText(nm.length>16?nm.slice(0,15)+'…':nm,42,y+13);
    // 入出点
    const ip=l.inPoint||0,op=l.outPoint!==null?l.outPoint:dur;
    const ix=x0+(ip-viewT0)*zoom,ox=x0+(op-viewT0)*zoom;
    ctx.fillStyle='rgba(120,140,170,0.25)';
    ctx.fillRect(ix,y+2,Math.max(1,ox-ix),rowH-4);
    ctx.strokeStyle='rgba(160,180,210,0.5)';
    ctx.beginPath();ctx.moveTo(ix,y+2);ctx.lineTo(ix,y+rowH-2);ctx.moveTo(ox,y+2);ctx.lineTo(ox,y+rowH-2);ctx.stroke();
    // 关键帧
    const keys=collect(l);
    for(const k of keys){
      const kx=x0+(k.key.t-viewT0)*zoom;
      if(kx<x0-6||kx>W+6)continue;
      const selected=APP.app.tlSelKeys.some(s=>s.layer===l.id&&s.prop===k.path);
      ctx.fillStyle=selected?'#ffd34d':'#ff9a3c';
      ctx.beginPath();
      ctx.moveTo(kx,y+9);ctx.lineTo(kx+4,y+13);ctx.lineTo(kx,y+17);ctx.lineTo(kx-4,y+13);
      ctx.closePath();ctx.fill();
      if(k.prop.expr&&k.prop.expr.on){
        ctx.fillStyle='#4fd6ff';
        ctx.fillRect(kx-2,y+2,4,2);
      }
    }
  }
  // 播放头
  const px=x0+(APP.app.time-viewT0)*zoom;
  ctx.strokeStyle='#ff5d3c';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,H);ctx.stroke();
  ctx.fillStyle='#ff5d3c';
  ctx.beginPath();ctx.moveTo(px-5,0);ctx.lineTo(px+5,0);ctx.lineTo(px,8);ctx.closePath();ctx.fill();
};

/* ================= 曲线编辑器 ================= */
U.bindGraph=function(){
  const c=$('grCanvas');
  const fit=()=>{
    const r=c.getBoundingClientRect();
    c.width=r.width*2;c.height=r.height*2;
    c.style.width=r.width+'px';c.style.height=r.height+'px';
  };
  fit();window.addEventListener('resize',fit);
  let drag=null;
  const pos=e=>{const r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*2,y:(e.clientY-r.top)*2};};
  const geom=()=>{
    const comp=P.activeComp();
    const W=c.width,H=c.height;
    const padL=46,padR=10,padT=10,padB=22;
    const t0=0,t1=comp.duration;
    return {W,H,padL,padR,padT,padB,t0,t1,comp,
      x:t=>padL+(t-t0)/(t1-t0)*(W-padL-padR),
      y:v=>H-padB-(v-GRAPH.v0)/(GRAPH.v1-GRAPH.v0)*(H-padT-padB),
      tx:x=>(x-padL)/(W-padL-padR)*(t1-t0)+t0,
      vy:y=>GRAPH.v0+(H-padB-y)/(H-padT-padB)*(GRAPH.v1-GRAPH.v0)};
  };
  const GRAPH={v0:0,v1:100};
  U._graphGeom=geom;
  c.addEventListener('mousedown',e=>{
    const p=pos(e);const g=geom();
    const l=U.selLayer();
    if(!l)return;
    const prop=U.graphProp();
    if(!prop||!prop.keys||!prop.keys.length)return;
    for(let i=0;i<prop.keys.length;i++){
      const k=prop.keys[i];
      const v=Array.isArray(k.v)?k.v[0]:k.v;
      const kx=g.x(k.t),ky=g.y(v);
      if(Math.abs(p.x-kx)<7&&Math.abs(p.y-ky)<7){
        drag={type:'key',prop,key:k};
        C.undo.begin('曲线编辑');
        return;
      }
      // 手柄
      if(k.hout){
        const hx=kx+g.x(APP.app.graphHandleT||0)*0,hy=ky;
      }
    }
  });
  window.addEventListener('mousemove',e=>{
    if(!drag)return;
    const p=pos(e);const g=geom();
    const k=drag.key;
    const nv=Array.isArray(k.v)?k.v.slice():[k.v];
    const target=g.vy(p.y);
    if(Array.isArray(k.v)){nv[0]=target;}else{nv=target;}
    k.v=nv;
    k.t=C.clamp(g.tx(p.x),0,g.comp.duration);
    drag.prop.keys.sort((a,b)=>a.t-b.t);
    APP.app.renderCache.clear();
    U.refreshProps();
  });
  window.addEventListener('mouseup',()=>{if(drag){C.undo.commit('曲线编辑');drag=null;}});
  c.addEventListener('wheel',e=>{
    e.preventDefault();
    const span=GRAPH.v1-GRAPH.v0;
    if(e.ctrlKey){
      const f=e.deltaY<0?0.9:1.1;
      GRAPH.v0*=f;GRAPH.v1*=f;
    }else{
      GRAPH.v0-=e.deltaY*0.05;GRAPH.v1-=e.deltaY*0.05;
    }
  },{passive:false});
};
U.graphProp=function(){
  const l=U.selLayer();
  if(!l)return null;
  return APP.app.graphProp||l.t.opacity;
};
U.refreshGraph=function(){
  const c=$('grCanvas');
  if(!c)return;
  const ctx=c.getContext('2d');
  const l=U.selLayer();
  const g=U._graphGeom&&U._graphGeom();
  if(!g)return;
  const W=c.width,H=c.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#101216';ctx.fillRect(0,0,W,H);
  // 网格
  ctx.strokeStyle='#22272e';ctx.lineWidth=1;
  for(let i=0;i<=10;i++){
    const x=g.padL+(W-g.padL-g.padR)*i/10;
    ctx.beginPath();ctx.moveTo(x,g.padT);ctx.lineTo(x,H-g.padB);ctx.stroke();
  }
  for(let i=0;i<=6;i++){
    const y=g.padT+(H-g.padT-g.padB)*i/6;
    ctx.beginPath();ctx.moveTo(g.padL,y);ctx.lineTo(W-g.padR,y);ctx.stroke();
  }
  ctx.fillStyle='#8b95a3';ctx.font='10px Consolas,monospace';
  for(let t=0;t<=g.comp.duration;t+=1){
    const x=g.x(t);
    ctx.fillText(t+'s',x+2,H-8);
  }
  if(!l){ctx.fillStyle='#5c6672';ctx.fillText('无选择',g.padL+10,30);return;}
  const prop=U.graphProp();
  if(!prop){ctx.fillStyle='#5c6672';ctx.fillText('选择可动画属性以查看曲线',g.padL+10,30);return;}
  // 曲线
  const pts=APP.app.graphMode==='value'
    ? A.sampleProp(prop,0,g.comp.duration,200,{comp:g.comp,layer:l,time:APP.app.time})
    : A.speedSamples(prop,0,g.comp.duration,200,{comp:g.comp,layer:l,time:APP.app.time});
  ctx.strokeStyle='#4fd6ff';ctx.lineWidth=1.6;
  ctx.beginPath();
  pts.forEach((p,i)=>{const x=g.x(p.t),y=g.y(p.v);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.stroke();
  // 关键帧
  if(prop.keys){
    for(let i=0;i<prop.keys.length;i++){
      const k=prop.keys[i];
      const v=Array.isArray(k.v)?k.v[0]:k.v;
      const x=g.x(k.t),y=g.y(v);
      const sel=APP.app.tlSelKeys.some(s=>s.layer===l.id);
      ctx.fillStyle=sel?'#ffd34d':'#ff9a3c';
      ctx.beginPath();
      ctx.moveTo(x,y-5);ctx.lineTo(x+5,y);ctx.lineTo(x,y+5);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();
      if(k.tin||k.tout){
        // 贝塞尔手柄
        const e0=C.easeFunc(k.tin,null),e1=C.easeFunc(null,k.tout);
        ctx.strokeStyle='rgba(255,255,255,0.35)';
        ctx.beginPath();
        const nk=prop.keys[i+1];
        if(nk){
          const nx=g.x(nk.t);
          const pv=Array.isArray(nk.v)?nk.v[0]:nk.v;
          const ny=g.y(pv);
          const span=Math.max(1,ny-y);
          const c1x=x+(k.tout.i*0.33)*(nx-x),c1y=y+e0(0.5)*span;
          const c2x=nx-(nk.tin.i*0.33)*(nx-x),c2y=ny-(1-e1(0.5))*span;
          ctx.moveTo(x,y);ctx.lineTo(c1x,c1y);ctx.lineTo(c2x,c2y);ctx.lineTo(nx,ny);
          ctx.stroke();
        }
      }
    }
  }
  // 播放头
  const px=g.x(APP.app.time);
  ctx.strokeStyle='#ff5d3c';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(px,0);ctx.lineTo(px,H);ctx.stroke();
  ctx.fillStyle='#c8d0da';ctx.font='11px "Microsoft YaHei",sans-serif';
  ctx.fillText('曲线 · '+(U.graphPropName||'不透明度'),8,14);
};

/* ================= 节点编辑器 ================= */
U.bindNodes=function(){
  const c=$('ndCanvas');
  const fit=()=>{
    const r=c.getBoundingClientRect();
    c.width=r.width*2;c.height=r.height*2;
    c.style.width=r.width+'px';c.style.height=r.height+'px';
  };
  fit();window.addEventListener('resize',fit);
  const pos=e=>{const r=c.getBoundingClientRect();return {x:(e.clientX-r.left)*2,y:(e.clientY-r.top)*2};};
  let drag=null,linkDrag=null;
  c.addEventListener('mousedown',e=>{
    const p=pos(e);const comp=P.activeComp();
    const g=comp.nodeGraph;
    const np=U.nodeAt(p,g);
    if(np){
      APP.app.nodeSel=[np.id];
      drag={type:'node',node:np,start:p,ox:np.x,oy:np.y};
      // 端口?
      const port=U.portAt(p,np);
      if(port){
        if(port.dir==='out')linkDrag={from:np,port:port.name,cur:p};
        else{
          // 断开
          port.link=null;
          const idx=g.links.findIndex(l=>l.to===np.id&&l.toPort===port.name);
          if(idx>=0)g.links.splice(idx,1);
          C.undo.commit('断开节点');
        }
        drag=null;
      }
      U.refreshNodes();
      return;
    }
    const link=U.linkAt(p,g);
    if(link){g.links.splice(g.links.indexOf(link),1);C.undo.commit('删除连线');U.refreshNodes();return;}
    APP.app.nodeSel=[];
    drag={type:'pan',start:p,pan:Object.assign({},APP.app.nodePan)};
  });
  window.addEventListener('mousemove',e=>{
    const p=pos(e);
    if(linkDrag){linkDrag.cur=p;U.refreshNodes();return;}
    if(!drag)return;
    if(drag.type==='node'){
      drag.node.x=drag.ox+(p.x-drag.start.x)+APP.app.nodePan.x;
      drag.node.y=drag.oy+(p.y-drag.start.y)+APP.app.nodePan.y;
      U.refreshNodes();
    }else if(drag.type==='pan'){
      APP.app.nodePan.x=drag.pan.x+(p.x-drag.start.x);
      APP.app.nodePan.y=drag.pan.y+(p.y-drag.start.y);
      U.refreshNodes();
    }
  });
  window.addEventListener('mouseup',e=>{
    const p=pos(e);
    if(linkDrag){
      const comp=P.activeComp();
      const target=U.nodeAt(p,comp.nodeGraph);
      if(target&&target!==linkDrag.from){
        const port=U.portAt(p,target);
        if(port&&port.dir==='in'){
          // 类型检查
          const fromPort=linkDrag.from.outputs.find(o=>o.name===linkDrag.port);
          if(fromPort&&fromPort.type===port.type||port.type==='geometry'){
            comp.nodeGraph.links.push({id:C.uid('L'),from:linkDrag.from.id,fromPort:linkDrag.port,
              to:target.id,toPort:port.name});
            port.link=comp.nodeGraph.links[comp.nodeGraph.links.length-1].id;
            C.undo.commit('连接节点');
          }else{
            U.status('端口类型不匹配: '+fromPort.type+' → '+port.type);
          }
        }
      }
      linkDrag=null;
      U.refreshNodes();
    }
    if(drag&&drag.type==='node')C.undo.commit('移动节点');
    drag=null;
  });
  c.addEventListener('dblclick',e=>{
    const p=pos(e);const comp=P.activeComp();
    const np=U.nodeAt(p,comp.nodeGraph);
    if(np){
      // 编辑参数
      if(np.type==='source'){
        const names=comp.layers.map(l=>l.name+' ('+P.TYPE_NAME[l.type]+')');
        const i=prompt('选择源图层 (输入序号):\n'+names.map((n,k)=>(k+1)+'. '+n).join('\n'),1);
        const l=comp.layers[parseInt(i)-1];
        if(l)np.params.layerId=l.id;
      }else if(np.type==='text'){
        const s=prompt('文字内容',np.params.str||'金');
        if(s!==null)np.params.str=s;
      }else{
        const port=np.inputs[0];
        if(port){const v=prompt('参数 '+port.name,port.value);if(v!==null)port.value=parseFloat(v)||0;}
      }
      C.undo.commit('编辑节点');
      U.refreshNodes();
    }
  });
  c.addEventListener('contextmenu',e=>{
    e.preventDefault();
    const p=pos(e);
    U.popup(U.nodeMenu(),e.clientX,e.clientY);
    APP.app._nodeAddPos=p;
  });
};
U.nodeMenu=function(){
  const types=Object.keys(S.NODE_DEFS).filter(t=>t!=='group');
  return types.map(t=>['+ '+S.NODE_DEFS[t].title,()=>{
    const comp=P.activeComp();
    const p=APP.app._nodeAddPos||{x:100,y:100};
    const n=S.newNode(t,p.x-APP.app.nodePan.x,p.y-APP.app.nodePan.y);
    comp.nodeGraph.nodes.push(n);
    C.undo.commit('新建节点');
    U.refreshNodes();
  }]).concat([['sep'],['删除所选节点',()=>{
    const comp=P.activeComp();
    comp.nodeGraph.nodes=comp.nodeGraph.nodes.filter(n=>!APP.app.nodeSel.includes(n.id));
    comp.nodeGraph.links=comp.nodeGraph.links.filter(l=>!APP.app.nodeSel.includes(l.from)&&!APP.app.nodeSel.includes(l.to));
    C.undo.commit('删除节点');
    U.refreshNodes();
  }],['清空节点图',()=>{
    const comp=P.activeComp();
    comp.nodeGraph={nodes:[],links:[]};
    C.undo.commit('清空节点图');
    U.refreshNodes();
  }]]);
};
U.nodeAt=function(p,g){
  const pan=APP.app.nodePan;
  for(const n of g.nodes){
    const x=n.x+pan.x,y=n.y+pan.y;
    const h=40+Math.max(n.inputs.length,n.outputs.length)*16+8;
    const w=140;
    if(p.x>=x&&p.x<=x+w&&p.y>=y&&p.y<=y+h)return n;
  }
  return null;
};
U.portAt=function(p,n){
  const pan=APP.app.nodePan;
  const x=n.x+pan.x,y=n.y+pan.y;
  for(let i=0;i<n.inputs.length;i++){
    const px=x,py=y+40+i*16;
    if(Math.abs(p.x-px)<8&&Math.abs(p.y-py)<8)return {dir:'in',name:n.inputs[i].name,port:n.inputs[i],idx:i};
  }
  for(let i=0;i<n.outputs.length;i++){
    const px=x+140,py=y+40+i*16;
    if(Math.abs(p.x-px)<8&&Math.abs(p.y-py)<8)return {dir:'out',name:n.outputs[i].name,idx:i};
  }
  return null;
};
U.linkAt=function(p,g){
  const pan=APP.app.nodePan;
  for(const l of g.links){
    const a=g.nodes.find(n=>n.id===l.from),b=g.nodes.find(n=>n.id===l.to);
    if(!a||!b)continue;
    const ai=a.outputs.findIndex(o=>o.name===l.fromPort);
    const bi=b.inputs.findIndex(i=>i.name===l.toPort);
    const p1={x:a.x+pan.x+140,y:a.y+pan.y+40+ai*16};
    const p2={x:b.x+pan.x,y:b.y+pan.y+40+bi*16};
    // 简单距离到曲线
    for(let t=0;t<=1;t+=0.05){
      const mt=1-t;
      const x=mt*mt*mt*p1.x+3*mt*mt*t*(p1.x+60)+3*mt*t*t*(p2.x-60)+t*t*t*p2.x;
      const y=mt*mt*mt*p1.y+3*mt*mt*t*p1.y+3*mt*t*t*p2.y+t*t*t*p2.y;
      if(Math.hypot(p.x-x,p.y-y)<6)return l;
    }
  }
  return null;
};
U.refreshNodes=function(){
  const c=$('ndCanvas');
  if(!c)return;
  const ctx=c.getContext('2d');
  const comp=P.activeComp();
  const W=c.width,H=c.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#101216';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(120,140,170,0.06)';
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  if(!comp){return;}
  const g=comp.nodeGraph;
  const pan=APP.app.nodePan;
  // 连线
  for(const l of g.links){
    const a=g.nodes.find(n=>n.id===l.from),b=g.nodes.find(n=>n.id===l.to);
    if(!a||!b)continue;
    const ai=a.outputs.findIndex(o=>o.name===l.fromPort);
    const bi=b.inputs.findIndex(i=>i.name===l.toPort);
    if(ai<0||bi<0)continue;
    const p1={x:a.x+pan.x+140,y:a.y+pan.y+40+ai*16};
    const p2={x:b.x+pan.x,y:b.y+pan.y+40+bi*16};
    const type=a.outputs[ai].type;
    ctx.strokeStyle={scalar:'#ffd34d',vector:'#7ddb6a',color:'#b78cff',geometry:'#4fd6ff',field:'#ff8ad8',string:'#c8d0da'}[type]||'#888';
    ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(p1.x,p1.y);
    ctx.bezierCurveTo(p1.x+60,p1.y,p2.x-60,p2.y,p2.x,p2.y);
    ctx.stroke();
    // 箭头
    ctx.fillStyle=ctx.strokeStyle;
    ctx.beginPath();ctx.arc(p2.x,p2.y,3.5,0,7);ctx.fill();
  }
  // 临时连线
  if(APP.app._linkDrag){
    const d=APP.app._linkDrag;
    ctx.strokeStyle='#4fd6ff';ctx.setLineDash([4,3]);
    ctx.beginPath();ctx.moveTo(d.from.x,d.from.y);ctx.lineTo(d.cur.x,d.cur.y);ctx.stroke();
    ctx.setLineDash([]);
  }
  // 节点
  for(const n of g.nodes){
    const x=n.x+pan.x,y=n.y+pan.y;
    const h=40+Math.max(n.inputs.length,n.outputs.length)*16+8;
    const sel=APP.app.nodeSel.includes(n.id);
    ctx.fillStyle=sel?'#2b3240':'#1c2129';
    ctx.strokeStyle=sel?'#ff9a3c':'#39414d';
    ctx.lineWidth=1;
    ctx.beginPath();
    const r=6;
    ctx.moveTo(x+r,y);ctx.arcTo(x+140,y,x+140,y+h,r);ctx.arcTo(x+140,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+140,y,r);
    ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#0f1216';ctx.fillRect(x+1,y+1,138,24);
    ctx.fillStyle='#d7dde6';ctx.font='12px "Microsoft YaHei",sans-serif';
    ctx.fillText(n.title||n.type,x+8,y+17);
    ctx.font='9px Consolas,monospace';
    ctx.fillStyle='#5c6672';
    ctx.fillText(n.type,x+8,y+34);
    for(let i=0;i<n.inputs.length;i++){
      const px=x,py=y+40+i*16;
      const t=n.inputs[i].type;
      ctx.fillStyle={scalar:'#ffd34d',vector:'#7ddb6a',color:'#b78cff',geometry:'#4fd6ff',field:'#ff8ad8',string:'#c8d0da'}[t]||'#888';
      ctx.beginPath();ctx.arc(px,py,4,0,7);ctx.fill();
      ctx.fillStyle='#8b95a3';ctx.font='10px "Microsoft YaHei",sans-serif';
      ctx.fillText(n.inputs[i].name+(n.inputs[i].link?'':' = '+U.fmtVal(n.inputs[i].value)),px+9,py+3);
    }
    for(let i=0;i<n.outputs.length;i++){
      const px=x+140,py=y+40+i*16;
      const t=n.outputs[i].type;
      ctx.fillStyle={scalar:'#ffd34d',vector:'#7ddb6a',color:'#b78cff',geometry:'#4fd6ff',field:'#ff8ad8',string:'#c8d0da'}[t]||'#888';
      ctx.beginPath();ctx.arc(px,py,4,0,7);ctx.fill();
      ctx.fillStyle='#8b95a3';ctx.font='10px "Microsoft YaHei",sans-serif';
      ctx.fillText(n.outputs[i].name,px-40,py+3);
    }
  }
  if(!g.nodes.length){
    ctx.fillStyle='#5c6672';ctx.font='13px "Microsoft YaHei",sans-serif';
    ctx.fillText('右键新建节点 · 从输出端口拖到输入端口建立连接',30,40);
    ctx.fillText('把「显示输出」或「挤出」节点接入三维几何图层即可驱动画面',30,60);
  }
  // 状态
  $('tlInfo').textContent='节点 '+g.nodes.length+' · 连线 '+g.links.length;
};
U.fmtVal=function(v){
  if(typeof v==='number')return Math.abs(v)>=100?v.toFixed(0):v.toFixed(1);
  return String(v);
};

/* ================= 属性面板 ================= */
U.bindProps=function(){
  $('props').addEventListener('change',e=>{
    const t=e.target;
    if(t.dataset.prop){
      U.setPropFromInput(t);
      C.undo.commit('修改属性');
      APP.app.renderCache.clear();
      U.refreshTimeline();
    }
  });
  $('props').addEventListener('input',e=>{
    const t=e.target;
    if(t.dataset.prop&&t.type==='number'){
      U.setPropFromInput(t);
      APP.app.renderCache.clear();
    }
  });
  $('props').addEventListener('click',e=>{
    const t=e.target;
    if(t.classList.contains('sw')){
      const path=t.dataset.prop;
      const l=U.selLayer();
      const prop=U.resolveProp(l,path);
      if(prop){
        if(!prop.anim&&prop.keys.length){prop.anim=true;}
        else if(prop.keys.length&&prop.anim&&!A.keyAt(prop,APP.app.time)>=0){
          // 开启动画
        }
        prop.anim=!prop.anim||prop.keys.length>0;
        if(prop.anim&&!prop.keys.length){
          A.setKey(prop,APP.app.time,A.eval(prop,APP.app.time,{comp:P.activeComp(),layer:l,time:APP.app.time}));
        }
        if(!prop.anim){
          // 关闭: 保留关键帧
        }
        C.undo.commit('切换动画');
        U.refreshAll();
      }
    }
    else if(t.classList.contains('expr-btn')){
      const path=t.dataset.prop;
      const l=U.selLayer();
      const prop=U.resolveProp(l,path);
      if(prop){
        prop.expr.on=!prop.expr.on;
        if(prop.expr.on&&!prop.expr.code)prop.expr.code='time*100';
        C.undo.commit('切换表达式');
        U.refreshAll();
      }
    }
    else if(t.dataset.act){
      U.doAction(t.dataset.act,t.dataset.arg,t);
    }
  });
  $('props').addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.target.blur();}
    e.stopPropagation();
  });
};
U.resolveProp=function(l,path){
  if(!l)return null;
  const parts=path.split('.');
  let cur=l;
  for(const p of parts){
    if(cur===null||cur===undefined)return null;
    cur=cur[p];
  }
  return cur;
};
U.setPropFromInput=function(t){
  const l=U.selLayer();
  if(!l)return;
  const path=t.dataset.prop;
  const parts=path.split('.');
  let cur=l;
  for(let i=0;i<parts.length-1;i++)cur=cur[parts[i]];
  const key=parts[parts.length-1];
  const v=t.value;
  if(t.dataset.vec){
    cur[key][parseInt(t.dataset.vec)]=parseFloat(v)||0;
  }else if(t.dataset.kind==='color'){
    const c=C.hex2rgb(v);
    cur[key]=[c.r,c.g,c.b];
  }else if(t.dataset.kind==='float'){
    cur[key]=parseFloat(v)||0;
  }else if(t.dataset.kind==='int'){
    cur[key]=parseInt(v)||0;
  }else if(t.dataset.kind==='text'){
    cur[key]=v;
  }else if(t.dataset.kind==='select'){
    cur[key]=v;
  }else{
    cur[key]=v;
  }
};
U.refreshProps=function(){
  const box=$('props');
  const l=U.selLayer();
  const comp=P.activeComp();
  if(!l){
    box.innerHTML='<div class="mini-note">未选择图层。在图层面板或画布中选择一个图层。</div>';
    return;
  }
  const t=APP.app.time;
  const ctx={comp,layer:l,time:t};
  const html=[];
  // 标题
  html.push(`<div class="pg-h"><span class="arw">▾</span><span class="nm" style="color:${P.layerLabel(l)}">${C.escapeHtml(l.name)}</span>
    <span class="badge">${P.TYPE_NAME[l.type]}</span></div>`);
  html.push(`<div class="pg-b">
    <div class="prop-row"><span class="plabel">类型</span><div class="pctrl">
      <select data-prop="_type" data-kind="select">
        ${Object.keys(P.TYPE_NAME).map(k=>`<option value="${k}" ${k===l.type?'selected':''}>${P.TYPE_NAME[k]}</option>`).join('')}
      </select>
      <button data-act="rename">重命名</button></div></div>
    <div class="prop-row"><span class="plabel">混合模式</span><div class="pctrl">
      <select data-prop="blend" data-kind="select">
        ${['normal','add','screen','multiply','overlay'].map(b=>`<option ${b===l.blend?'selected':''}>${b}</option>`).join('')}
      </select></div></div>
    <div class="rowbtns">
      <button data-act="toggle3d">${l.is3D?'2D 图层':'3D 图层'}</button>
      <button data-act="toggleMB" style="${l.mb?'color:#ff9a3c':''}">运动模糊</button>
      <button data-act="inout">入出点</button>
    </div>
    <div class="prop-row"><span class="plabel">父级</span><div class="pctrl">
      <select data-prop="parent" data-kind="select">
        <option value="">无</option>
        ${comp.layers.filter(x=>x.id!==l.id&&!P.isAncestor(l.id,x.id,comp)).map(x=>`<option value="${x.id}" ${x.parent===l.parent&&l.parent===x.id?'selected':''}>${C.escapeHtml(x.name)}</option>`).join('')}
      </select></div></div>
    <div class="prop-row"><span class="plabel">入点 / 出点</span><div class="pctrl">
      <input class="num" data-prop="inPoint" data-kind="float" value="${(l.inPoint||0).toFixed(2)}">
      <input class="num" data-prop="outPoint" data-kind="float" value="${l.outPoint===null?'':l.outPoint.toFixed(2)}"></div></div>
  </div>`);
  // 变换
  html.push('<div class="pg-h"><span class="arw">▾</span><span class="nm">变换</span></div><div class="pg-b">');
  const rows=l.is3D
    ? [['anchor','锚点',3],['pos','位置',3],['scale','缩放',3],['rot','旋转',3],['opacity','不透明度',1]]
    : [['anchor','锚点',2],['pos','位置',2],['scale','缩放',2],['rot','旋转',1],['opacity','不透明度',1]];
  for(const [k,label,dim] of rows){
    const prop=l.t[k];
    const v=A.eval(prop,t,ctx);
    const arr=Array.isArray(v)?v:[v];
    html.push(`<div class="prop-row"><span class="plabel">${label}</span><div class="pctrl">`);
    for(let i=0;i<dim;i++){
      const val=arr[i]!==undefined?arr[i]:0;
      html.push(`<input class="num ${prop.anim?'anim':''}" data-prop="t.${k}" data-vec="${dim>1?i:''}" value="${C.round(val,2)}">`);
    }
    html.push(`<span class="sw ${prop.anim?'on':''} ${A.keyAt(prop,t)>=0?'key':''}" data-prop="t.${k}" title="开启动画并添加关键帧">⏱</span>`);
    html.push(`<span class="expr-btn ${prop.expr&&prop.expr.on?'on':''}" data-prop="t.${k}" title="表达式">=</span>`);
    html.push('</div></div>');
    if(prop.expr&&prop.expr.on){
      html.push(`<textarea class="expr-box" data-prop="t.${k}" data-kind="text" data-expr="1">${C.escapeHtml(prop.expr.code)}</textarea>`);
      html.push(`<div class="mini-note" style="color:${APP.app.lastExprError?'#ff8a8a':'#5c6672'}">${APP.app.lastExprError?'⚠ '+C.escapeHtml(APP.app.lastExprError):'表达式已启用 · time / value / wiggle / loopOut / linear / ease / valueAtTime'}</div>`);
    }
  }
  html.push('</div>');
  // 类型特定
  if(l.type==='text'){
    html.push(U.textPanel(l,comp,t,ctx));
  }
  if(l.type==='shape'){
    html.push(U.shapePanel(l,comp,t,ctx));
  }
  if(l.type==='geo3d'){
    html.push(U.geoPanel(l,comp,t,ctx));
  }
  if(l.type==='particle'){
    html.push(U.particlePanel(l,comp,t,ctx));
  }
  if(l.type==='camera'){
    html.push(U.cameraPanel(l,comp,t,ctx));
  }
  if(l.type==='light'){
    html.push(U.lightPanel(l,comp,t,ctx));
  }
  if(l.type==='audio'){
    html.push(U.audioPanel(l,comp,t,ctx));
  }
  if(l.type==='precomp'){
    const sub=P.comp(l.precomp.compId);
    html.push(`<div class="pg-h"><span class="arw">▾</span><span class="nm">预合成</span></div><div class="pg-b">
      <div class="prop-row"><span class="plabel">源合成</span><div class="pctrl"><select data-prop="precomp.compId" data-kind="select">
        ${APP.app.project.comps.map(c=>`<option value="${c.id}" ${sub&&c.id===sub.id?'selected':''}>${C.escapeHtml(c.name)}</option>`).join('')}
      </select></div></div>
      <div class="prop-row"><span class="plabel">时间重映射</span><div class="pctrl">
        <input class="num ${l.precomp.timeRemap.anim?'anim':''}" data-prop="precomp.timeRemap" value="${C.round(A.evalNum(l.precomp.timeRemap,t,ctx),2)}">
        <span class="sw ${l.precomp.timeRemap.anim?'on':''}" data-prop="precomp.timeRemap">⏱</span>
        <span class="expr-btn ${l.precomp.timeRemap.expr.on?'on':''}" data-prop="precomp.timeRemap">=</span></div></div>
      <div class="mini-note">用时间重映射关键帧实现变速、倒放与定格。</div>
    </div>`);
  }
  // 蒙版
  html.push(U.maskPanel(l,comp,t,ctx));
  // 效果
  html.push(U.effectPanel(l,comp,t,ctx));
  box.innerHTML=html.join('');
};
/* ---- 子面板 ---- */
U.propRow=function(label,prop,path,ctx,opts){
  opts=opts||{};
  const t=ctx.time;
  const v=A.eval(prop,t,ctx);
  const arr=Array.isArray(v)?v:[v];
  const dim=arr.length;
  let s=`<div class="prop-row"><span class="plabel">${label}</span><div class="pctrl">`;
  for(let i=0;i<dim;i++){
    s+=`<input class="num ${prop.anim?'anim':''}" data-prop="${path}" data-vec="${dim>1?i:''}" value="${C.round(arr[i],2)}">`;
  }
  s+=`<span class="sw ${prop.anim?'on':''} ${A.keyAt(prop,t)>=0?'key':''}" data-prop="${path}">⏱</span>`;
  s+=`<span class="expr-btn ${prop.expr&&prop.expr.on?'on':''}" data-prop="${path}">=</span>`;
  s+='</div></div>';
  return s;
};
U.textPanel=function(l,comp,t,ctx){
  const tx=l.text;
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">文字</span><span class="sp"></span>'+
    '<button data-act="fontmap">字符范围</button></div><div class="pg-b">';
  s+=`<div class="prop-row"><span class="plabel">内容</span><div class="pctrl">
    <input style="flex:1" data-prop="text.src" data-kind="text" value="${C.escapeHtml(tx.src)}"></div></div>`;
  s+=`<div class="prop-row"><span class="plabel">字号</span><div class="pctrl">
    <input class="num" data-prop="text.size" data-kind="float" value="${tx.size}">
    <span class="plabel" style="width:34px">行距</span>
    <input class="num" data-prop="text.leading" data-kind="float" value="${tx.leading}"></div></div>`;
  s+=`<div class="prop-row"><span class="plabel">字距</span><div class="pctrl">
    <input class="num" data-prop="text.tracking" data-kind="float" value="${tx.tracking}">
    <span class="plabel" style="width:34px">对齐</span>
    <select data-prop="text.align" data-kind="select">
      <option value="left" ${tx.align==='left'?'selected':''}>左</option>
      <option value="center" ${tx.align==='center'?'selected':''}>中</option>
      <option value="right" ${tx.align==='right'?'selected':''}>右</option></select></div></div>`;
  s+=`<div class="prop-row"><span class="plabel">填充色</span><div class="pctrl">
    <input class="num" data-prop="text.color" data-kind="color" value="${C.rgb2hex(tx.color[0],tx.color[1],tx.color[2])}"></div></div>`;
  // 字符数(可见字符范围)
  s+=U.propRow('字符范围',l.props.charCount,'props.charCount',ctx);
  s+='<div class="rowbtns"><button data-act="addAnimator">+ 文字动画器</button></div>';
  for(let i=0;i<(tx.animators||[]).length;i++){
    const an=tx.animators[i];
    s+=`<div class="pg-h" style="background:#151820"><span class="nm" style="font-size:11px">动画器 ${i+1}</span>
      <button data-act="delAnimator" data-arg="${i}">删</button></div><div class="pg-b">`;
    for(let j=0;j<(an.ranges||[]).length;j++){
      const r=an.ranges[j];
      s+=`<div class="prop-row"><span class="plabel">范围${j+1}</span><div class="pctrl">
        <select data-act="rangeUnit" data-arg="${i},${j}">
          <option value="chars" ${r.unit==='chars'?'selected':''}>字符</option>
          <option value="words" ${r.unit==='words'?'selected':''}>词</option>
          <option value="lines" ${r.unit==='lines'?'selected':''}>行</option></select>
        <input class="num" data-act="rangeStart" data-arg="${i},${j}" value="${r.start}" title="起点">
        <input class="num" data-act="rangeEnd" data-arg="${i},${j}" value="${r.end}" title="终点">
        <input class="num" data-act="rangeSoft" data-arg="${i},${j}" value="${r.soft||0}" title="软边"></div></div>`;
    }
    s+='<div class="rowbtns"><button data-act="addRange" data-arg="'+i+'">+ 选择范围</button></div>';
    const p=an.props;
    s+=`<div class="prop-row"><span class="plabel">偏移</span><div class="pctrl">
      <input class="num" data-act="animProp" data-arg="${i},pos,0" value="${p.pos?p.pos[0]:0}">
      <input class="num" data-act="animProp" data-arg="${i},pos,1" value="${p.pos?p.pos[1]:0}"></div></div>`;
    s+=`<div class="prop-row"><span class="plabel">旋转/缩放</span><div class="pctrl">
      <input class="num" data-act="animProp" data-arg="${i},rot" value="${p.rot||0}">
      <input class="num" data-act="animProp" data-arg="${i},scale,0" value="${p.scale?p.scale[0]:100}">
      <input class="num" data-act="animProp" data-arg="${i},scale,1" value="${p.scale?p.scale[1]:100}"></div></div>`;
    s+=`<div class="prop-row"><span class="plabel">不透明度</span><div class="pctrl">
      <input class="num" data-act="animProp" data-arg="${i},opacity" value="${p.opacity!==undefined?p.opacity:100}"></div></div>`;
    s+='</div>';
  }
  s+='</div>';
  return s;
};
U.shapePanel=function(l,comp,t,ctx){
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">形状组</span><span class="sp"></span>'+
    '<button data-act="addGroup">+ 组</button></div><div class="pg-b">';
  for(let i=0;i<(l.shape?l.shape.groups.length:0);i++){
    const g=l.shape.groups[i];
    s+=`<div class="pg-h" style="background:#151820"><span class="nm" style="font-size:11px">${C.escapeHtml(g.name)}</span>
      <button data-act="addItem" data-arg="${i},rect">矩形</button>
      <button data-act="addItem" data-arg="${i},ellipse">椭圆</button>
      <button data-act="addItem" data-arg="${i},star">星</button>
      <button data-act="addItem" data-arg="${i},trim">修剪</button>
      <button data-act="addItem" data-arg="${i},repeater">重复</button>
      <button data-act="addItem" data-arg="${i},merge">合并</button></div><div class="pg-b">`;
    s+=U.propRow('组位置',g.transform.pos,`shape.groups.${i}.transform.pos`,ctx);
    s+=U.propRow('组旋转',g.transform.rot,`shape.groups.${i}.transform.rot`,ctx);
    s+=U.propRow('组缩放',g.transform.scale,`shape.groups.${i}.transform.scale`,ctx);
    for(const it of g.items){
      if(it.type==='fill'){
        s+=`<div class="prop-row"><span class="plabel">填充</span><div class="pctrl">
          <input class="num" data-prop="shape.groups.${i}.items.${it.id}.color" data-kind="color" value="${it.color}">
          <input class="num" data-prop="shape.groups.${i}.items.${it.id}.opacity" value="${C.round(A.evalNum(it.opacity,t,ctx),1)}" title="不透明度"></div></div>`;
      }else if(it.type==='stroke'){
        s+=`<div class="prop-row"><span class="plabel">描边</span><div class="pctrl">
          <input class="num" data-prop="shape.groups.${i}.items.${it.id}.color" data-kind="color" value="${it.color}">
          <input class="num" data-prop="shape.groups.${i}.items.${it.id}.width" value="${C.round(A.evalNum(it.width,t,ctx),1)}" title="宽度"></div></div>`;
      }else if(it.type==='trim'){
        s+=U.propRow('修剪 起/止/偏移',{v:[A.evalNum(it.start,t,ctx),A.evalNum(it.end,t,ctx),A.evalNum(it.offset,t,ctx)]},`shape.groups.${i}.items.${it.id}.trim`,ctx,{});
        s+=`<div class="mini-note">修剪分别控制 起/止/偏移 (在下方单独输入以动画)</div>`;
        s+=`<div class="prop-row"><span class="plabel">起</span><div class="pctrl"><input class="num" data-act="itemNum" data-arg="${i},${it.id},start" value="${C.round(A.evalNum(it.start,t,ctx),1)}"></div></div>`;
        s+=`<div class="prop-row"><span class="plabel">止</span><div class="pctrl"><input class="num" data-act="itemNum" data-arg="${i},${it.id},end" value="${C.round(A.evalNum(it.end,t,ctx),1)}"></div></div>`;
        s+=`<div class="prop-row"><span class="plabel">偏移</span><div class="pctrl"><input class="num" data-act="itemNum" data-arg="${i},${it.id},offset" value="${C.round(A.evalNum(it.offset,t,ctx),1)}"></div></div>`;
      }else if(it.type==='repeater'){
        s+=U.propRow('重复数量',it.copies,`shape.groups.${i}.items.${it.id}.copies`,ctx);
        s+=U.propRow('重复位移',it.pos,`shape.groups.${i}.items.${it.id}.pos`,ctx);
        s+=U.propRow('重复旋转',it.rot,`shape.groups.${i}.items.${it.id}.rot`,ctx);
      }else if(it.type==='merge'){
        s+=`<div class="prop-row"><span class="plabel">合并</span><div class="pctrl">
          <select data-act="mergeMode" data-arg="${i},${it.id}">
            <option value="union" ${it.mode==='union'?'selected':''}>并集</option>
            <option value="subtract" ${it.mode==='subtract'?'selected':''}>差集</option>
            <option value="intersect" ${it.mode==='intersect'?'selected':''}>交集</option></select></div></div>`;
      }else if(it.type==='path'){
        s+=`<div class="prop-row"><span class="plabel">路径</span><div class="pctrl">
          <span class="sel-chip">${it.path.contours.length} 轮廓 / ${it.path.contours[0].pts.length} 点</span>
          <button data-act="morphKey" data-arg="${i},${it.id}">形变关键帧</button></div></div>`;
      }
    }
    s+='</div>';
  }
  s+='</div>';
  return s;
};
U.geoPanel=function(l,comp,t,ctx){
  const g=l.geo3d;
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">三维几何</span></div><div class="pg-b">';
  s+=`<div class="prop-row"><span class="plabel">源</span><div class="pctrl">
    <select data-prop="geo3d.source" data-kind="select">
      <option value="text" ${g.source==='text'?'selected':''}>文字</option>
      <option value="shape" ${g.source==='shape'?'selected':''}>形状</option>
      <option value="node" ${g.source==='node'?'selected':''}>节点图</option></select></div></div>`;
  s+=U.propRow('挤出深度',g.depth,'geo3d.depth',ctx);
  s+=U.propRow('倒角',g.bevel,'geo3d.bevel',ctx);
  s+=U.propRow('弯曲',g.deform.bend,'geo3d.deform.bend',ctx);
  s+=U.propRow('扭转',g.deform.twist,'geo3d.deform.twist',ctx);
  if(g.source==='text'||l.text){
    s+=`<div class="prop-row"><span class="plabel">文字</span><div class="pctrl">
      <input style="flex:1" data-prop="text.src" data-kind="text" value="${C.escapeHtml(l.text.src)}"></div></div>`;
    s+=`<div class="prop-row"><span class="plabel">字号</span><div class="pctrl">
      <input class="num" data-prop="text.size" data-kind="float" value="${l.text.size}"></div></div>`;
  }
  s+='</div>';
  // 材质
  s+='<div class="pg-h"><span class="arw">▾</span><span class="nm">材质</span></div><div class="pg-b">';
  s+=U.propRow('基础色',g.material.base,'geo3d.material.base',ctx);
  s+=U.propRow('金属度',g.material.metal,'geo3d.material.metal',ctx);
  s+=U.propRow('粗糙度',g.material.rough,'geo3d.material.rough',ctx);
  s+=U.propRow('自发光色',g.material.emissive,'geo3d.material.emissive',ctx);
  s+=U.propRow('自发光强度',g.material.emissiveI,'geo3d.material.emissiveI',ctx);
  s+=U.propRow('不透明度',g.material.opacity,'geo3d.material.opacity',ctx);
  s+='<div class="mini-note">金属度高 → 反射环境光; 粗糙度低 → 高光锐利。自发光用于炽热状态。</div>';
  s+='</div>';
  // 图钉
  s+='<div class="pg-h"><span class="arw">▾</span><span class="nm">图钉变形</span><span class="sp"></span>'+
    '<button data-act="addPin">+ 图钉</button></div><div class="pg-b">';
  for(let i=0;i<(g.deform.pins||[]).length;i++){
    const p=g.deform.pins[i];
    s+=`<div class="prop-row"><span class="plabel">图钉${i+1} 位置</span><div class="pctrl">
      <input class="num" data-act="pinPos" data-arg="${i},0" value="${C.round(p.pos.v[0],1)}">
      <input class="num" data-act="pinPos" data-arg="${i},1" value="${C.round(p.pos.v[1],1)}">
      <button data-act="keyPin" data-arg="${i}">K</button>
      <button data-act="delPin" data-arg="${i}">✕</button></div></div>`;
  }
  s+='<div class="mini-note">图钉位置可设关键帧: 锤击时把图钉向内推, 多个图钉共同作用形体不撕裂。</div>';
  s+='</div>';
  return s;
};
U.particlePanel=function(l,comp,t,ctx){
  const p=l.particle;
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">粒子系统</span></div><div class="pg-b">';
  s+=`<div class="prop-row"><span class="plabel">发射源</span><div class="pctrl">
    <select data-act="emitterType">
      <option value="point" ${p.emitter.type==='point'?'selected':''}>点</option>
      <option value="curve" ${p.emitter.type==='curve'?'selected':''}>曲线</option>
      <option value="surface" ${p.emitter.type==='surface'?'selected':''}>几何表面</option></select></div></div>`;
  for(const [k,label] of [['birth','发射率/秒'],['life','寿命'],['lifeVar','寿命随机'],['vel','初速度'],['velVar','速度随机'],
      ['size','大小'],['sizeVar','大小随机'],['drag','阻力'],['grav','重力'],['inherit','继承运动'],['seed','随机种子'],
      ['collide','碰撞'],['bounce','弹性'],['friction','摩擦']]){
    s+=U.propRow(label,p[k],'particle.'+k,ctx);
  }
  s+=U.propRow('颜色 A',p.colorA,'particle.colorA',ctx);
  s+=U.propRow('颜色 B',p.colorB,'particle.colorB',ctx);
  s+=U.propRow('拖尾长度',p.trail.len,'particle.trail.len',ctx);
  s+=U.propRow('拖尾宽度',p.trail.width,'particle.trail.width',ctx);
  s+=U.propRow('拖尾消退',p.trail.fade,'particle.trail.fade',ctx);
  s+=`<div class="prop-row"><span class="plabel">命中行为</span><div class="pctrl">
    <select data-act="onHit">
      <option value="spark" ${p.onHit==='spark'?'selected':''}>迸出火星(次级发射)</option>
      <option value="none" ${p.onHit==='none'?'selected':''}>仅反弹</option>
      <option value="die" ${p.onHit==='die'?'selected':''}>熄灭</option></select></div></div>`;
  s+='<div class="mini-note">发射源使用当前变形后的几何; 与三维层表面按法线反弹。</div>';
  s+='</div>';
  return s;
};
U.cameraPanel=function(l,comp,t,ctx){
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">摄像机</span></div><div class="pg-b">';
  s+=U.propRow('视角(FOV)',l.props.fov,'props.fov',ctx);
  s+=U.propRow('对焦距离',l.props.focus,'props.focus',ctx);
  s+=U.propRow('光圈(景深)',l.props.aperture,'props.aperture',ctx);
  s+=U.propRow('滚动',l.props.roll,'props.roll',ctx);
  s+=`<div class="prop-row"><span class="plabel">目标点</span><div class="pctrl">
    <input class="num" data-act="target" data-arg="0" value="${C.round(A.eval(l.props.target||{v:[0,0,0]},t,ctx)[0],1)}">
    <input class="num" data-act="target" data-arg="1" value="${C.round(A.eval(l.props.target||{v:[0,0,0]},t,ctx)[1],1)}">
    <input class="num" data-act="target" data-arg="2" value="${C.round(A.eval(l.props.target||{v:[0,0,0]},t,ctx)[2],1)}">
    <button data-act="useTarget">${l.props.useTarget?'已启用':'未启用'}</button></div></div>`;
  s+='<div class="mini-note">启用目标点后摄像机朝向目标(覆盖旋转); 光圈 > 0 时按可见表面实际深度产生景深。</div>';
  s+='</div>';
  return s;
};
U.lightPanel=function(l,comp,t,ctx){
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">灯光</span></div><div class="pg-b">';
  s+=`<div class="prop-row"><span class="plabel">类型</span><div class="pctrl">
    <select data-act="lightKind">
      <option value="point" ${A.evalNum(l.props.kind,t,ctx)===0?'selected':''}>点光源</option>
      <option value="directional" ${A.evalNum(l.props.kind,t,ctx)===1?'selected':''}>平行光</option></select></div></div>`;
  s+=U.propRow('强度',l.props.intensity,'props.intensity',ctx);
  s+=U.propRow('颜色',l.props.color,'props.color',ctx);
  s+=U.propRow('投影',l.props.shadow,'props.shadow',ctx);
  s+='<div class="mini-note">平行光投射真实几何阴影(孔洞、侧墙与变形都体现在阴影中)。</div>';
  s+='</div>';
  return s;
};
U.audioPanel=function(l,comp,t,ctx){
  const a=l.audio;
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">音色</span><span class="sp"></span>'+
    '<button data-act="audition">试听</button></div><div class="pg-b">';
  s+=`<div class="prop-row"><span class="plabel">音色</span><div class="pctrl">
    <select data-act="inst">
      <option value="metal" ${a.inst==='metal'?'selected':''}>金属锤击</option>
      <option value="drone" ${a.inst==='drone'?'selected':''}>低音长鸣</option>
      <option value="noise" ${a.inst==='noise'?'selected':''}>噪声气流</option>
      <option value="bell" ${a.inst==='bell'?'selected':''}>钟鸣</option>
      <option value="pluck" ${a.inst==='pluck'?'selected':''}>拨弦</option></select></div></div>`;
  s+=U.propRow('音量',a.gain,'audio.gain',ctx);
  s+=U.propRow('低通',a.lpf,'audio.lpf',ctx);
  s+=U.propRow('衰减',a.decay,'audio.decay',ctx);
  s+=`<div class="prop-row"><span class="plabel">音符</span><div class="pctrl">
    <span class="sel-chip">${(a.pattern||[]).length} 个</span>
    <button data-act="editNotes">编辑</button></div></div>`;
  s+='<div class="mini-note">音符用 JSON 表示: [{t,f,dur,vel}], t 秒, f 赫兹。</div>';
  s+='</div>';
  return s;
};
U.maskPanel=function(l,comp,t,ctx){
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">蒙版</span><span class="sp"></span>'+
    '<button data-act="addMaskRect">矩形</button><button data-act="addMaskEllipse">椭圆</button></div><div class="pg-b">';
  for(let i=0;i<(l.masks||[]).length;i++){
    const m=l.masks[i];
    s+=`<div class="prop-row"><span class="plabel">蒙版${i+1}</span><div class="pctrl">
      <select data-act="maskShape" data-arg="${i}">
        <option value="rect" ${m.shape==='rect'?'selected':''}>矩形</option>
        <option value="ellipse" ${m.shape==='ellipse'?'selected':''}>椭圆</option></select>
      <button data-act="maskInvert" data-arg="${i}">${m.inverted?'已反转':'反转'}</button>
      <button data-act="delMask" data-arg="${i}">✕</button></div></div>`;
    s+=U.propRow('尺寸',{v:[A.evalNum(m.props.w,t,ctx),A.evalNum(m.props.h,t,ctx)]},`masks.${i}.props.size`,ctx);
    s+=U.propRow('位置',m.props.pos,`masks.${i}.props.pos`,ctx);
    s+=U.propRow('羽化',m.props.feather,`masks.${i}.props.feather`,ctx);
    s+=U.propRow('扩展',m.props.expand,`masks.${i}.props.expand`,ctx);
    s+=U.propRow('不透明度',m.props.opacity,`masks.${i}.props.opacity`,ctx);
  }
  s+='</div>';
  // 轨道遮罩
  s+=`<div class="pg-h"><span class="arw">▾</span><span class="nm">轨道遮罩</span></div><div class="pg-b">
    <div class="prop-row"><span class="plabel">模式</span><div class="pctrl">
      <select data-prop="matte.mode" data-kind="select">
        <option value="none" ${l.matte.mode==='none'?'selected':''}>无</option>
        <option value="alpha" ${l.matte.mode==='alpha'?'selected':''}>Alpha 遮罩</option>
        <option value="alphaInv" ${l.matte.mode==='alphaInv'?'selected':''}>Alpha 反转</option>
        <option value="luma" ${l.matte.mode==='luma'?'selected':''}>亮度遮罩</option>
        <option value="lumaInv" ${l.matte.mode==='lumaInv'?'selected':''}>亮度反转</option></select></div></div>
  </div>`;
  return s;
};
U.effectPanel=function(l,comp,t,ctx){
  let s='<div class="pg-h"><span class="arw">▾</span><span class="nm">效果</span><span class="sp"></span>'+
    '<button data-act="addFx" data-arg="gaussian">高斯模糊</button>'+
    '<button data-act="addFx" data-arg="glow">发光</button>'+
    '<button data-act="addFx" data-arg="shadow">投影</button>'+
    '<button data-act="addFx" data-arg="hsl">色相/饱和度</button></div><div class="pg-b">';
  for(let i=0;i<(l.effects||[]).length;i++){
    const e=l.effects[i];
    s+=`<div class="prop-row"><span class="plabel">${C.escapeHtml(e.name)}</span><div class="pctrl">
      <input type="checkbox" data-prop="effects.${i}.enabled" ${e.enabled!==false?'checked':''}>
      <button data-act="delFx" data-arg="${i}">✕</button></div></div>`;
    for(const k in e.props){
      const p=e.props[k];
      const v=A.eval(p,t,ctx);
      s+=U.propRow(k,p,`effects.${i}.props.${k}`,ctx);
    }
  }
  s+='</div>';
  return s;
};
/* ---- 属性面板动作 ---- */
U.doAction=function(act,arg,elm){
  const l=U.selLayer();const comp=P.activeComp();
  const t=APP.app.time;const ctx={comp,layer:l,time:t};
  const commit=(msg)=>{C.undo.commit(msg);APP.app.renderCache.clear();U.refreshAll();};
  switch(act){
    case 'rename':U.renameLayer();return;
    case 'toggle3d':l.is3D=!l.is3D;commit('切换 3D');return;
    case 'toggleMB':l.mb=!l.mb;commit('切换运动模糊');return;
    case 'inout':{
      const a=prompt('入点(秒)',l.inPoint||0),b=prompt('出点(秒, 空=无)',l.outPoint===null?'':l.outPoint);
      if(a!==null)l.inPoint=parseFloat(a)||0;
      l.outPoint=b===''||b===null?null:(parseFloat(b)||0);
      commit('裁剪入出点');return;
    }
    case 'fontmap':U.showFontMap();return;
    case 'addAnimator':{
      if(!l.text.animators)l.text.animators=[];
      l.text.animators.push({name:'动画器 '+(l.text.animators.length+1),enabled:true,
        ranges:[{unit:'chars',start:0,end:l.text.src.length,offset:0,soft:0}],
        props:{pos:[0,60],rot:0,scale:[100,100],opacity:0}});
      commit('添加文字动画器');return;
    }
    case 'delAnimator':{l.text.animators.splice(parseInt(arg),1);commit('删除动画器');return;}
    case 'addRange':{
      const i=parseInt(arg);
      l.text.animators[i].ranges.push({unit:'chars',start:0,end:l.text.src.length,offset:0,soft:1});
      commit('添加范围');return;
    }
    case 'animProp':{
      const [i,k,ci]=arg.split(',');
      const an=l.text.animators[parseInt(i)];
      const v=parseFloat(elm.value)||0;
      if(k==='pos'){an.props.pos=an.props.pos||[0,0];an.props.pos[parseInt(ci)]=v;}
      else if(k==='scale'){an.props.scale=an.props.scale||[100,100];an.props.scale[parseInt(ci)]=v;}
      else an.props[k]=v;
      commit('修改动画器');return;
    }
    case 'rangeUnit':case 'rangeStart':case 'rangeEnd':case 'rangeSoft':{
      const [i,j]=arg.split(',').map(Number);
      const r=l.text.animators[i].ranges[j];
      if(act==='rangeUnit')r.unit=elm.value;
      else r[act.replace('range','').toLowerCase()]=parseFloat(elm.value)||0;
      commit('修改范围');return;
    }
    case 'addGroup':{
      l.shape.groups.push(P.newGroup?P.newGroup('组 '+(l.shape.groups.length+1)):null);
      // 直接用 project 内部工厂不可达, 手工构造
      const g={id:C.uid('L'),name:'组 '+(l.shape.groups.length+1),enabled:true,items:[],
        transform:{anchor:P.newProp([0,0]),pos:P.newProp([0,0]),scale:P.newProp([100,100]),rot:P.newProp(0),opacity:P.newProp(100)}};
      l.shape.groups[l.shape.groups.length-1]=g;
      commit('添加形状组');return;
    }
    case 'addItem':{
      const [gi,kind]=arg.split(',');
      const g=l.shape.groups[parseInt(gi)];
      const mk={
        rect:()=>({id:C.uid('L'),type:'path',name:'矩形',path:CT.rectPath(200,140),anim:false,keys:[]}),
        ellipse:()=>({id:C.uid('L'),type:'path',name:'椭圆',path:CT.ellipsePath(100,100),anim:false,keys:[]}),
        star:()=>({id:C.uid('L'),type:'path',name:'星形',path:CT.starPath(110,55,5),anim:false,keys:[]}),
        trim:()=>({id:C.uid('L'),type:'trim',name:'修剪路径',start:P.newProp(0),end:P.newProp(100),offset:P.newProp(0)}),
        repeater:()=>({id:C.uid('L'),type:'repeater',name:'重复器',copies:P.newProp(3),pos:P.newProp([60,0]),
          scale:P.newProp([100,100]),rot:P.newProp(0),anchor:P.newProp([0,0]),opacity:P.newProp(100),composite:'below'}),
        merge:()=>({id:C.uid('L'),type:'merge',name:'合并路径',mode:'union'})
      }[kind];
      if(mk)g.items.push(mk());
      commit('添加形状元素');return;
    }
    case 'mergeMode':{
      const [gi,id]=arg.split(',');
      const it=l.shape.groups[parseInt(gi)].items.find(x=>x.id===id);
      if(it)it.mode=elm.value;
      commit('修改合并模式');return;
    }
    case 'morphKey':{
      const [gi,id]=arg.split(',');
      const it=l.shape.groups[parseInt(gi)].items.find(x=>x.id===id);
      if(it){
        const v=C.deepClone(it.path);
        if(!it.keys)it.keys=[];
        const k=P.newKey(t,v);
        if(it.keys.length&&Math.abs(it.keys[it.keys.length-1].t-t)<1e-4)it.keys[it.keys.length-1]=k;
        else it.keys.push(k);
        it.keys.sort((a,b)=>a.t-b.t);
        it.anim=it.keys.length>1;
      }
      commit('形变关键帧');return;
    }
    case 'itemNum':{
      const [gi,id,k]=arg.split(',');
      const it=l.shape.groups[parseInt(gi)].items.find(x=>x.id===id);
      if(it)A.setKey(it[k],t,parseFloat(elm.value)||0,ctx),it[k].anim=true;
      commit('修改参数');return;
    }
    case 'addFx':{
      const defs={
        gaussian:{name:'高斯模糊',props:{radius:P.newProp(12)}},
        glow:{name:'发光',props:{threshold:P.newProp(0.55),radius:P.newProp(30),intensity:P.newProp(1.6)}},
        shadow:{name:'投影',props:{distance:P.newProp(24),angle:P.newProp(135),softness:P.newProp(24),
          color:P.newProp([0,0,0]),opacity:P.newProp(0.65)}},
        hsl:{name:'色相/饱和度/亮度',props:{hue:P.newProp(0),saturation:P.newProp(0),lightness:P.newProp(0)}}
      }[arg];
      l.effects.push({id:C.uid('L'),type:arg,name:defs.name,enabled:true,props:defs.props});
      commit('添加效果');return;
    }
    case 'delFx':{l.effects.splice(parseInt(arg),1);commit('删除效果');return;}
    case 'addMaskRect':case 'addMaskEllipse':{
      const shape=act==='addMaskRect'?'rect':'ellipse';
      l.masks.push({id:C.uid('L'),name:'蒙版 '+(l.masks.length+1),shape,enabled:true,inverted:false,mode:'add',
        props:{w:P.newProp(400),h:P.newProp(300),pos:P.newProp([0,0]),rot:P.newProp(0),
          feather:P.newProp(0),opacity:P.newProp(100),expand:P.newProp(0),roundness:P.newProp(0)}});
      commit('添加蒙版');return;
    }
    case 'delMask':{l.masks.splice(parseInt(arg),1);commit('删除蒙版');return;}
    case 'maskInvert':{const m=l.masks[parseInt(arg)];m.inverted=!m.inverted;commit('反转蒙版');return;}
    case 'maskShape':{const m=l.masks[parseInt(arg)];m.shape=elm.value;commit('修改蒙版形状');return;}
    case 'emitterType':{l.particle.emitter.type=elm.value;APP.app.particleCache.clear();commit('修改发射源');return;}
    case 'onHit':{l.particle.onHit=elm.value;commit('修改命中行为');return;}
    case 'lightKind':{l.props.kind.v=elm.value==='directional'?1:0;commit('修改灯光类型');return;}
    case 'inst':{l.audio.inst=elm.value;commit('修改音色');return;}
    case 'audition':{AU.audition(l.audio.inst,220,0.6);return;}
    case 'editNotes':{
      const s=prompt('音符 JSON',JSON.stringify(l.audio.pattern));
      if(s){try{l.audio.pattern=JSON.parse(s);commit('编辑音符');}catch(e){U.status('JSON 解析失败');}}
      return;
    }
    case 'addPin':{
      const b=U.layerBox(l,comp,t);
      const cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
      const off=l.geo3d.deform.pins.length;
      l.geo3d.deform.pins.push({
        rest:[cx+(off%2?60:-60),cy+(off<2?0:70)],
        pos:P.newProp([cx+(off%2?60:-60),cy+(off<2?0:70)]),
        rot:P.newProp(0),scale:P.newProp([100,100]),radius:240});
      commit('添加图钉');return;
    }
    case 'delPin':{l.geo3d.deform.pins.splice(parseInt(arg),1);commit('删除图钉');return;}
    case 'keyPin':{
      const p=l.geo3d.deform.pins[parseInt(arg)];
      A.setKey(p.pos,t,A.eval(p.pos,t,ctx),ctx);p.pos.anim=true;
      commit('图钉关键帧');return;
    }
    case 'pinPos':{
      const [i,ci]=arg.split(',');
      const p=l.geo3d.deform.pins[parseInt(i)];
      const v=p.pos.v.slice();v[parseInt(ci)]=parseFloat(elm.value)||0;
      A.setKey(p.pos,t,v,ctx);p.pos.anim=true;
      APP.app.renderCache.clear();U.refreshProps();return;
    }
    case 'target':{
      if(!l.props.target)l.props.target=P.newProp([0,0,0]);
      const v=l.props.target.v.slice();v[parseInt(arg)]=parseFloat(elm.value)||0;
      l.props.target.v=v;l.props.useTarget=true;
      commit('设置目标点');return;
    }
    case 'useTarget':{l.props.useTarget=!l.props.useTarget;commit('切换目标点');return;}
  }
};

/* ================= 快捷键 ================= */
U.bindKeys=function(){
  window.addEventListener('keydown',e=>{
    const tag=(e.target.tagName||'').toLowerCase();
    const typing=tag==='input'||tag==='textarea'||tag==='select'||e.target.isContentEditable;
    if(e.key==='Escape'){U.closePopup();return;}
    if(typing)return;
    const comp=P.activeComp();
    if(e.code==='Space'){e.preventDefault();U.togglePlay();return;}
    if(e.key==='z'&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.shiftKey?C.undo.redo():C.undo.undo();return;}
    if(e.key==='y'&&(e.ctrlKey||e.metaKey)){e.preventDefault();C.undo.redo();return;}
    if(e.key==='s'&&(e.ctrlKey||e.metaKey)){e.preventDefault();U.saveProject();return;}
    if(e.key==='o'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('fileOpen').click();return;}
    if(e.key==='n'&&(e.ctrlKey||e.metaKey)&&!e.shiftKey){e.preventDefault();U.newProject();return;}
    if(e.key==='d'&&(e.ctrlKey||e.metaKey)){e.preventDefault();U.duplicateLayers();return;}
    if(e.key==='a'&&(e.ctrlKey||e.metaKey)){e.preventDefault();APP.app.sel=comp.layers.map(l=>l.id);U.refreshAll();return;}
    if(e.key==='c'&&e.ctrlKey&&e.shiftKey){e.preventDefault();U.precompose();return;}
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();U.deleteLayers();return;}
    if(e.key==='F9'){e.preventDefault();U.easyEaseSel();return;}
    if(e.key==='F2'){e.preventDefault();U.renameLayer();return;}
    if(e.key==='Home'){e.preventDefault();U.seek(0);return;}
    if(e.key==='End'){e.preventDefault();U.seek(comp.duration);return;}
    if(e.key==='PageUp'){e.preventDefault();U.stepKey(-1);return;}
    if(e.key==='PageDown'){e.preventDefault();U.stepKey(1);return;}
    if(e.key==='ArrowLeft'){e.preventDefault();U.seek(APP.app.time-(e.shiftKey?1:1/comp.fps));return;}
    if(e.key==='ArrowRight'){e.preventDefault();U.seek(APP.app.time+(e.shiftKey?1:1/comp.fps));return;}
    if(e.key==='v'||e.key==='V')U.setTool('select');
    if(e.key==='p'||e.key==='P')U.setTool('pen');
    if(e.key==='r'||e.key==='R')U.setTool('rect');
    if(e.key==='e'||e.key==='E')U.setTool('ellipse');
    if(e.key==='t'||e.key==='T')U.setTool('text');
    if(e.key==='w'||e.key==='W')U.setTool('pin');
    if(e.key==='z')U.fit();
  });
};
/* ---- 编辑辅助 ---- */
U.toggleKey=function(path){
  const l=U.selLayer();if(!l)return;
  const prop=U.resolveProp(l,path);
  if(!prop)return;
  if(A.keyAt(prop,APP.app.time)>=0)A.removeKey(prop,APP.app.time);
  else A.setKey(prop,APP.app.time,A.eval(prop,APP.app.time,{comp:P.activeComp(),layer:l,time:APP.app.time}));
  prop.anim=prop.keys.length>0;
  C.undo.commit('关键帧');
  U.refreshAll();
};
U.easyEaseSel=function(){
  const l=U.selLayer();if(!l)return;
  let n=0;
  const doProp=p=>{if(p&&p.keys&&p.keys.length){A.easyEaseAll(p);n++;}};
  doProp(l.t.pos);doProp(l.t.scale);doProp(l.t.rot);doProp(l.t.opacity);doProp(l.t.anchor);
  for(const k in l.props)doProp(l.props[k]);
  if(l.shape)for(const g of l.shape.groups){
    doProp(g.transform.pos);doProp(g.transform.rot);doProp(g.transform.scale);
    for(const it of g.items){
      if(it.type==='trim'){doProp(it.start);doProp(it.end);doProp(it.offset);}
      if(it.type==='repeater'){doProp(it.copies);doProp(it.pos);doProp(it.rot);}
    }
  }
  if(l.geo3d){doProp(l.geo3d.depth);doProp(l.geo3d.bevel);doProp(l.geo3d.deform.bend);doProp(l.geo3d.deform.twist);
    for(const p of l.geo3d.deform.pins)doProp(p.pos);}
  if(l.particle){for(const k in l.particle){const v=l.particle[k];if(v&&v.keys)doProp(v);}
    for(const k in l.particle.trail)doProp(l.particle.trail[k]);}
  for(const e of l.effects)for(const k in e.props)doProp(e.props[k]);
  for(const m of l.masks)for(const k in m.props)doProp(m.props[k]);
  if(l.geo3d&&l.geo3d.material)for(const k in l.geo3d.material)doProp(l.geo3d.material[k]);
  if(n)C.undo.commit('缓入缓出');
  U.refreshAll();
  U.status('已对 '+n+' 个属性应用缓入缓出');
};
U.setInterp=function(kind){
  const l=U.selLayer();if(!l)return;
  const doProp=p=>{if(p&&p.keys)for(const k of p.keys){k.li=kind;k.lo=kind;}};
  doProp(l.t.pos);doProp(l.t.scale);doProp(l.t.rot);doProp(l.t.opacity);
  for(const k in l.props)doProp(l.props[k]);
  C.undo.commit('插值');
  U.refreshAll();
};
U.addExpression=function(){
  const l=U.selLayer();if(!l)return;
  const code=prompt('表达式 (thisComp.layer("名").transform.rotation / time / value / wiggle(3,50) / loopOut("cycle") / linear(t,0,100,1,0))','time*100');
  if(code===null)return;
  l.t.pos.expr={on:true,code};
  C.undo.commit('添加表达式');
  U.refreshAll();
};

/* ================= 面板刷新 ================= */
U.refreshAll=function(){
  U.refreshCompTabs();
  U.refreshCompList();
  U.refreshLayerList();
  U.refreshProps();
  U.refreshTimeline();
  U.refreshGraph();
  U.refreshNodes();
  U.updateTimeRead();
  U.view();
};
U.setBottomTab=function(tab){
  APP.app.bottomTab=tab;
  for(const b of document.querySelectorAll('#bottomTabs button[data-tab]')){
    b.classList.toggle('sel',b.dataset.tab===tab);
  }
  $('tabTimeline').classList.toggle('hidden',tab!=='timeline');
  $('tabGraph').classList.toggle('hidden',tab!=='graph');
  $('tabNodes').classList.toggle('hidden',tab!=='nodes');
  if(tab==='graph')U.refreshGraph();
  if(tab==='nodes')U.refreshNodes();
  if(tab==='timeline')U.refreshTimeline();
};
U.refreshCompTabs=function(){
  const box=$('compTabs');
  box.innerHTML='';
  for(const c of APP.app.project.comps){
    const d=el('div','ctab'+(c.id===APP.app.project.activeComp?' sel':''),C.escapeHtml(c.name));
    d.onclick=()=>{APP.app.project.activeComp=c.id;APP.app.sel=[];APP.app.renderCache.clear();
      C.undo.snapshot('切换合成');U.refreshAll();};
    box.appendChild(d);
  }
};
U.refreshCompList=function(){
  const box=$('compList');
  box.innerHTML='';
  for(const c of APP.app.project.comps){
    const d=el('div','comp-item'+(c.id===APP.app.project.activeComp?' sel':''));
    d.innerHTML=`<span class="ci">▣</span><span class="nm">${C.escapeHtml(c.name)}</span>
      <span class="dim">${c.w}×${c.h}</span>`;
    d.onclick=()=>{APP.app.project.activeComp=c.id;APP.app.sel=[];APP.app.renderCache.clear();U.refreshAll();};
    box.appendChild(d);
  }
  // 场
  const comp=P.activeComp();
  if(comp){
    const h=el('div','panel-h');
    h.innerHTML='空间场 <span class="sp"></span><button id="btnAddField">+ 场</button>';
    box.appendChild(h);
    for(const f of (comp.fields||[])){
      const d=el('div','comp-item');
      d.innerHTML=`<span class="ci">${f.type==='noise'?'≈':f.type==='vortex'?'🌀':'◎'}</span>
        <span class="nm">${C.escapeHtml(f.name)}</span><span class="dim">${f.enabled?'开':'关'}</span>`;
      d.onclick=()=>{
        const s=prompt('场参数: 类型(point/distance/vortex/noise), 强度, 半径',
          f.type+','+A.evalNum(f.strength,APP.app.time,{comp,time:APP.app.time})+','+A.evalNum(f.radius,APP.app.time,{comp,time:APP.app.time}));
        if(s){
          const p=s.split(',');
          if(['distance','vortex','noise'].includes(p[0]))f.type=p[0];
          if(p[1])f.strength.v=parseFloat(p[1]);
          if(p[2])f.radius.v=parseFloat(p[2]);
          C.undo.commit('修改场');
          U.refreshAll();
        }
      };
      box.appendChild(d);
    }
    $('btnAddField').onclick=()=>{
      if(!comp.fields)comp.fields=[];
      const types=['distance','noise','vortex'];
      comp.fields.push(S.newField(types[comp.fields.length%3],'场 '+(comp.fields.length+1)));
      C.undo.commit('新建场');
      U.refreshAll();
    };
  }
};
U.refreshLayerList=function(){
  const box=$('layerList');
  const comp=P.activeComp();
  box.innerHTML='';
  if(!comp)return;
  $('layerCount').textContent=comp.layers.length+' 层';
  for(let i=comp.layers.length-1;i>=0;i--){
    const l=comp.layers[i];
    const d=el('div','layer-item'+(APP.app.sel.includes(l.id)?' sel':''));
    d.style.borderLeftColor=P.layerLabel(l);
    d.innerHTML=`<span class="toggles">
      <span class="${l.visible?'on':''}" data-t="v">●</span>
      <span class="${l.locked?'on':''}" data-t="l">🔒</span></span>
      <span class="ticon" style="color:${P.layerLabel(l)}">${P.TYPE_ICON[l.type]||'▫'}</span>
      <span class="nm ${l.parent?'parent':''}">${C.escapeHtml(l.name)}</span>`;
    d.onclick=e=>{
      if(e.target.dataset.t==='v'){l.visible=!l.visible;C.undo.commit('可见性');U.refreshAll();return;}
      if(e.target.dataset.t==='l'){l.locked=!l.locked;C.undo.commit('锁定');U.refreshAll();return;}
      U.select([l.id],e.shiftKey||e.ctrlKey||e.metaKey);
    };
    d.ondblclick=()=>U.renameLayer();
    box.appendChild(d);
  }
};

APP.ui=U;
})();
