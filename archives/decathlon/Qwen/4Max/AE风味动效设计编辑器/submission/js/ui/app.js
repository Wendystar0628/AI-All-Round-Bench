/* 铸帧 ForgeFrame · 应用状态 / 播放 / 历史 / 文件 / 快捷键 */
"use strict";
(function(){
const FF=window.FF, clamp=FF.util.clamp, Eval=FF.Eval;

const app={
  project:null, comp:null, time:0, playing:false, loop:true,
  selection:[], selKeys:[], selProp:null,
  tool:'select',
  view:{zoom:null, panX:0, panY:0},
  hud:{grid:false, paths:true, fields:true, lights:true},
  bottomView:'timeline',
  exportMode:false,
  history:{undo:[], redo:[]},
  dragSnapshot:null,
  needsRender:true,
  muted:false,
};
FF.app=app;

/* ---------- 工程装载 ---------- */
function setProject(proj,opts){
  opts=opts||{};
  app.project=proj;
  app.history={undo:[], redo:[]};
  app.selection=[]; app.selKeys=[]; app.selProp=null;
  app.time=0; app.playing=false;
  FF.Audio.stop();
  FF.Geo.invalidateGeo(); FF.Particles.invalidate();
  const comp=opts.compId?FF.findComp(proj,opts.compId):proj.comps[0];
  app.comp=comp||null;
  app.view={zoom:null,panX:0,panY:0};
  if(app.comp) app.time=app.comp.workArea[0];
  FF.Timeline.reset();
  refreshAll();
}
function setComp(id){
  const c=FF.findComp(app.project,id);
  if(!c) return;
  app.comp=c; app.selection=[]; app.selKeys=[]; app.selProp=null;
  app.time=clamp(app.time,c.workArea[0],c.workArea[1]);
  app.view={zoom:null,panX:0,panY:0};
  FF.Timeline.reset();
  refreshAll();
}
function invalidate(){
  FF.Geo.invalidateGeo();
  FF.Particles.invalidate();
  app.needsRender=true;
}
function refreshAll(){
  FF.ProjectPanel.refresh();
  FF.Inspector.refresh();
  FF.Timeline.draw();
  FF.Curves.draw();
  FF.NodeEditor.refresh();
  updateTopbar();
  app.needsRender=true;
}
function updateTopbar(){
  const c=app.comp;
  document.getElementById('compBadge').textContent=c?(c.name+' · '+c.w+'×'+c.h+' · '+c.fps+'fps · '+c.duration+'s'):'无合成';
  document.getElementById('projName').textContent=app.project?app.project.name:'';
  document.getElementById('timecode').textContent=FF.fmtTime(app.time);
  const pb=document.getElementById('btnPlay');
  pb.textContent=app.playing?'❚❚':'▶';
  pb.classList.toggle('playing',app.playing);
  document.getElementById('btnLoop').classList.toggle('on',app.loop);
  const errs=FF.Compositor.lastResult&&FF.Compositor.lastResult.ctx?FF.Compositor.lastResult.ctx.errors.size:0;
  const es=document.getElementById('exprStatus');
  if(errs){ es.textContent='⚠ '+errs+' 个表达式错误'; es.className='err'; }
  else { es.textContent='表达式正常'; es.className='ok'; }
  document.getElementById('selInfo').textContent=
    app.selection.length?(app.selection.length+' 个图层选中'):(app.selKeys.length?app.selKeys.length+' 个关键帧选中':'');
}
/* ---------- 时间 ---------- */
function setTime(t,opts){
  opts=opts||{};
  if(!app.comp) return;
  app.time=clamp(t,0,app.comp.duration);
  if(!opts.keepAudio&&app.playing&&!opts.fromPlayback){ /* 擦洗时重启音频 */ }
  app.needsRender=true;
  document.getElementById('timecode').textContent=FF.fmtTime(app.time);
}
function renderFrame(){
  if(!app.comp){ return; }
  const cv=FF.GL.canvas;
  FF.Compositor.display(app.comp,app.time,app.project,app.view);
  FF.CanvasView.draw();
  FF.Timeline.draw();
  if(app.bottomView==='curve') FF.Curves.draw();
  FF.Inspector.tick();
  updateTopbar();
  app.needsRender=false;
}
/* ---------- 播放 ---------- */
let lastTs=0;
function tick(ts){
  requestAnimationFrame(tick);
  const dt=Math.min(0.1,(ts-lastTs)/1000||0);
  lastTs=ts;
  if(app.playing&&app.comp&&!app.exportMode){
    let t=app.time+dt;
    const wa=app.comp.workArea;
    if(t>=wa[1]){
      if(app.loop){ t=wa[0]+(t-wa[1])%(wa[1]-wa[0]||1); FF.Audio.play(app.comp,t,app.project); }
      else { t=wa[1]; pause(); }
    }
    setTime(t,{fromPlayback:true});
  }
  if(app.needsRender) renderFrame();
}
function play(){
  if(!app.comp) return;
  FF.Audio.ensure();
  app.playing=true;
  if(app.time>=app.comp.workArea[1]-0.01) app.time=app.comp.workArea[0];
  FF.Audio.play(app.comp,app.time,app.project);
  app.needsRender=true;
  updateTopbar();
}
function pause(){
  app.playing=false;
  FF.Audio.stop();
  app.needsRender=true;
  updateTopbar();
}
function togglePlay(){ app.playing?pause():play(); }
function seekAndSync(t){
  setTime(t);
  if(app.playing) FF.Audio.play(app.comp,app.time,app.project);
}
/* ---------- 历史 ---------- */
function snapshot(){ return FF.serialize(app.project); }
function pushHistory(label){
  app.history.undo.push({label, data:snapshot()});
  if(app.history.undo.length>80) app.history.undo.shift();
  app.history.redo=[];
}
function loadSnapshot(data){
  const proj=FF.deserialize(data);
  const compId=app.comp?app.comp.id:null;
  const sel=app.selection.slice();
  app.project=proj;
  app.comp=FF.findComp(proj,compId)||proj.comps[0];
  app.selection=sel.filter(id=>app.comp&&FF.findLayer(app.comp,id));
  invalidate();
  refreshAll();
}
function undo(){
  const h=app.history.undo.pop();
  if(!h){ toast('没有可撤销的操作'); return; }
  app.history.redo.push({label:h.label,data:snapshot()});
  loadSnapshot(h.data);
  toast('撤销：'+h.label);
}
function redo(){
  const h=app.history.redo.pop();
  if(!h){ toast('没有可重做的操作'); return; }
  app.history.undo.push({label:h.label,data:snapshot()});
  loadSnapshot(h.data);
  toast('重做：'+h.label);
}
function beginDrag(){ app.dragSnapshot=snapshot(); }
function endDrag(label){
  if(app.dragSnapshot!==null&&app.dragSnapshot!==snapshot()){
    app.history.undo.push({label:label||'编辑',data:app.dragSnapshot});
    if(app.history.undo.length>80) app.history.undo.shift();
    app.history.redo=[];
  }
  app.dragSnapshot=null;
}
function transact(label,fn){
  pushHistory(label);
  fn();
  invalidate();
  app.needsRender=true;
}
/* ---------- 文件 ---------- */
function saveProject(){
  FF.download((app.project.name||'工程')+'.forge.json',FF.serialize(app.project));
  toast('工程已保存');
}
function openFile(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const proj=FF.deserialize(r.result);
      setProject(proj);
      toast('已打开：'+proj.name);
    }catch(e){ toast('打开失败：'+e.message); }
  };
  r.readAsText(file);
}
function newProject(){
  const proj=FF.makeProject('未命名工程');
  const comp=FF.makeComp('合成 1',1280,720,30,10);
  proj.comps.push(comp);
  setProject(proj);
  toast('已创建空工程');
}
/* ---------- 图层创建 ---------- */
function createLayer(type,opts){
  if(!app.comp){ toast('请先创建合成'); return null; }
  opts=opts||{};
  const c=app.comp;
  const l=FF.makeLayer(type,opts.name);
  const cx=c.w/2, cy=c.h/2;
  if(l.threeD){
    l.transform.position.value=[0,0,0];
  } else {
    l.transform.position.value=[cx,cy];
  }
  l.inPoint=Math.max(0,app.time);
  l.outPoint=c.duration;
  if(type==='shape'&&!opts.empty){
    const item=opts.shapeKind?FF.makeShapeItem(opts.shapeKind):FF.makeShapeItem('rect');
    l.shapes.push(item);
  }
  if(type==='text'){ l.text.content.value=opts.text||'铸帧'; }
  if(type==='geo'){
    let g=app.project.nodeGraphs.find(x=>x.name==='几何源');
    if(!g){
      g=FF.makeGraph('几何源');
      const n=FF.makeNode('textGlyph',80,80);
      n.params.textLayer=''; n.params.text=P_text('火');
      const e=FF.makeNode('extrude',340,80);
      e.inputs.in={node:n.id,port:'out'};
      g.nodes.push(n,e);
      app.project.nodeGraphs.push(g);
    }
    l.geo.graphId=g.id;
    l.geo.depth.value=40; l.geo.bevel.value=4;
  }
  if(type==='particles'){
    l.particles.emitters.push({kind:'point',rate:FF.P('num',60),speed:FF.P('num',220),
      life:FF.P('num',1.4),spread:40,direction:[0,-1,0],offset:[0,0,0],bursts:[]});
  }
  if(type==='light'){
    l.light.lightType=opts.lightType||'point';
    l.transform.position.value=[260,-320,420];
  }
  if(type==='camera'){
    l.transform.position.value=[0,0,1000];
    l.camera.target.value=[0,0,0];
  }
  if(type==='field'){
    l.transform.position.value=[0,0,0];
  }
  if(type==='audio'){
    l.audio.instrument=opts.instrument||'hit';
    if(l.audio.instrument==='hit') l.audio.events=[{t:app.time+0.5,vel:1,note:220}];
  }
  transact('新建'+FF.LAYER_TYPES[type].name,()=>{
    c.layers.unshift(l);
  });
  app.selection=[l.id];
  refreshAll();
  return l;
}
function P_text(v){ return FF.P('text',v); }
function deleteSelected(){
  if(!app.comp||!app.selection.length) return;
  transact('删除图层',()=>{
    FF.removeLayers(app.comp,app.selection);
  });
  app.selection=[];
  refreshAll();
}
function duplicateSelected(){
  if(!app.comp||!app.selection.length) return;
  const news=[];
  transact('复制图层',()=>{
    for(const id of app.selection){
      const l=FF.findLayer(app.comp,id);
      if(l) news.push(FF.duplicateLayer(app.comp,l));
    }
  });
  app.selection=news.map(l=>l.id);
  refreshAll();
}
/* ---------- 预合成 ---------- */
function precompose(){
  if(!app.comp||!app.selection.length){ toast('请先选择要预合成的图层'); return; }
  const c=app.comp;
  const selLayers=app.selection.map(id=>FF.findLayer(c,id)).filter(Boolean);
  modal({
    title:'预合成所选图层',
    fields:[{key:'name',label:'新合成名称',value:'预合成 '+(app.project.comps.length)}],
    onOk:(vals)=>{
      transact('预合成',()=>{
        const sub=FF.makeComp(vals.name||'预合成',c.w,c.h,c.fps,c.duration);
        sub.workArea=[0,c.duration];
        sub.bg=[0,0,0,0];
        const ctx=Eval.frame(app.project,c,app.time);
        const ids=selLayers.map(l=>l.id);
        // 烘焙外部父级影响，保持画面一致
        for(const l of selLayers){
          if(l.parent&&!ids.includes(l.parent)){
            Eval.bakeParent(ctx,l,null,app.time);
            l.parent=null;
          }
        }
        sub.layers=selLayers.map(l=>FF.deepClone(l));
        // 内部父级保留
        app.project.comps.push(sub);
        const minIn=Math.min(...selLayers.map(l=>l.inPoint));
        FF.removeLayers(c,ids);
        const pc=FF.makeLayer('precomp',vals.name||'预合成');
        pc.compId=sub.id;
        pc.startTime=minIn;
        pc.inPoint=minIn; pc.outPoint=c.duration;
        pc.transform.position.value=[0,0];
        const idx=Math.min(...selLayers.map(l=>c.layers.indexOf(l)).filter(i=>i>=0),c.layers.length);
        c.layers.splice(Math.max(0,c.layers.length-selLayers.length),0,pc);
        app.selection=[pc.id];
      });
      refreshAll();
      toast('已预合成');
    }
  });
}
/* ---------- UI 助手 ---------- */
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm=setTimeout(()=>t.classList.remove('show'),2200);
}
function modal(cfg){
  const root=document.getElementById('modalRoot');
  const mask=document.createElement('div');
  mask.className='modal-mask';
  const m=document.createElement('div');
  m.className='modal';
  let html='<h3>'+cfg.title+'</h3>';
  for(const f of cfg.fields){
    html+='<div class="m-row"><label>'+f.label+'</label>';
    if(f.options){
      html+='<select data-k="'+f.key+'">'+f.options.map(o=>'<option value="'+o+'"'+(o===f.value?' selected':'')+'>'+o+'</option>').join('')+'</select>';
    } else {
      html+='<input data-k="'+f.key+'" type="'+(f.type||'text')+'" value="'+(f.value===undefined?'':f.value)+'">';
    }
    html+='</div>';
  }
  html+='<div class="m-btns"><button class="cancel">取消</button><button class="primary ok">确定</button></div>';
  m.innerHTML=html;
  mask.appendChild(m);
  root.appendChild(mask);
  const close=()=>mask.remove();
  m.querySelector('.cancel').onclick=close;
  mask.addEventListener('mousedown',e=>{ if(e.target===mask) close(); });
  m.querySelector('.ok').onclick=()=>{
    const vals={};
    m.querySelectorAll('[data-k]').forEach(el=>{
      vals[el.dataset.k]=el.type==='number'?parseFloat(el.value):el.value;
    });
    close();
    cfg.onOk(vals);
  };
  const first=m.querySelector('input');
  if(first){ first.focus(); first.select(); }
  m.addEventListener('keydown',e=>{
    if(e.key==='Enter') m.querySelector('.ok').click();
    if(e.key==='Escape') close();
    e.stopPropagation();
  });
}
function ctxMenu(x,y,items){
  const el=document.getElementById('ctxMenu');
  el.innerHTML='';
  for(const it of items){
    if(it==='-'){ const s=document.createElement('div'); s.className='ctx-sep'; el.appendChild(s); continue; }
    const b=document.createElement('button');
    b.textContent=it.label;
    if(it.danger) b.className='danger';
    b.onclick=()=>{ el.classList.add('hidden'); it.fn&&it.fn(); };
    el.appendChild(b);
  }
  el.classList.remove('hidden');
  const r=el.getBoundingClientRect();
  el.style.left=Math.min(x,window.innerWidth-r.width-8)+'px';
  el.style.top=Math.min(y,window.innerHeight-r.height-8)+'px';
}
document.addEventListener('mousedown',e=>{
  const cm=document.getElementById('ctxMenu');
  if(!cm.contains(e.target)) cm.classList.add('hidden');
  document.querySelectorAll('.menu.open').forEach(m=>{
    if(!m.contains(e.target)) m.classList.remove('open');
  });
  const cp=document.querySelector('.color-pop');
  if(cp&&!cp.contains(e.target)&&!e.target.closest('.color-swatch')) cp.remove();
});
function colorPop(anchor,value,onChange){
  document.querySelectorAll('.color-pop').forEach(e=>e.remove());
  const pop=document.createElement('div');
  pop.className='color-pop';
  const hex=FF.color.rgbToHex(value);
  pop.innerHTML='<input type="color" value="'+hex+'"><div class="cp-presets">'+
    ['#ff7a29','#ffb347','#ff5470','#4fd2ff','#3d7bff','#9fe84f','#ffffff','#1a1d26'].map(c=>'<i style="background:'+c+'" data-c="'+c+'"></i>').join('')+'</div>';
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect();
  pop.style.left=Math.min(r.left,window.innerWidth-230)+'px';
  pop.style.top=Math.min(r.bottom+6,window.innerHeight-140)+'px';
  const inp=pop.querySelector('input');
  inp.addEventListener('input',()=>onChange(FF.color.hexToRgb(inp.value)));
  pop.querySelectorAll('.cp-presets i').forEach(i=>{
    i.onclick=()=>{ onChange(FF.color.hexToRgb(i.dataset.c)); pop.remove(); };
  });
  setTimeout(()=>inp.click(),30);
}
FF.ui={toast,modal,ctxMenu,colorPop};

/* ---------- 项目面板 ---------- */
const ProjectPanel={
  refresh(){
    const tree=document.getElementById('projTree');
    tree.innerHTML='';
    if(!app.project) return;
    for(const c of app.project.comps){
      const el=document.createElement('div');
      el.className='proj-item'+(app.comp&&c.id===app.comp.id?' on':'');
      el.innerHTML='<span class="pi-icon">▣</span><span class="pi-name">'+c.name+'</span><span class="pi-meta">'+c.duration+'s</span><button class="pi-del" title="删除合成">✕</button>';
      el.onclick=()=>setComp(c.id);
      el.ondblclick=(e)=>{
        e.stopPropagation();
        modal({title:'重命名合成',fields:[{key:'name',label:'名称',value:c.name}],onOk:v=>{
          transact('重命名合成',()=>{c.name=v.name||c.name;}); refreshAll();
        }});
      };
      el.querySelector('.pi-del').onclick=(e)=>{
        e.stopPropagation();
        if(app.project.comps.length<=1){ toast('至少保留一个合成'); return; }
        transact('删除合成',()=>{
          app.project.comps=app.project.comps.filter(x=>x.id!==c.id);
          for(const cc of app.project.comps) cc.layers=cc.layers.filter(l=>l.compId!==c.id);
        });
        if(app.comp&&app.comp.id===c.id) app.comp=app.project.comps[0];
        refreshAll();
      };
      tree.appendChild(el);
    }
    for(const g of app.project.nodeGraphs){
      const el=document.createElement('div');
      el.className='proj-item';
      el.innerHTML='<span class="pi-icon" style="color:var(--steel)">⬡</span><span class="pi-name">'+g.name+'</span><span class="pi-meta">'+g.nodes.length+'节点</span>';
      el.onclick=()=>{
        FF.NodeEditor.open(g.id);
        setBottomView('nodes');
      };
      tree.appendChild(el);
    }
    const fi=document.getElementById('fontRangeInfo');
    if(fi) fi.textContent=FF.glyphs.rangeDesc;
  }
};
FF.ProjectPanel=ProjectPanel;

function setBottomView(v){
  app.bottomView=v;
  document.querySelectorAll('.view-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.view===v));
  document.getElementById('timelineView').classList.toggle('hidden',v!=='timeline');
  document.getElementById('curveView').classList.toggle('hidden',v!=='curve');
  document.getElementById('nodeView').classList.toggle('hidden',v!=='nodes');
  document.getElementById('tlTools').classList.toggle('hidden',v!=='timeline');
  document.getElementById('cvTools').classList.toggle('hidden',v!=='curve');
  document.getElementById('ndTools').classList.toggle('hidden',v!=='nodes');
  if(v==='curve') FF.Curves.draw();
  if(v==='nodes') FF.NodeEditor.refresh();
  if(v==='timeline') FF.Timeline.draw();
}
FF.setBottomView=setBottomView;

/* ---------- 工具栏 ---------- */
const TOOLS=[
  {id:'select',icon:'➤',name:'选择 (V)'},
  {id:'anchor',icon:'⊕',name:'锚点 (A)'},
  {id:'rotate',icon:'⟳',name:'旋转 (R)'},
  {id:'scale',icon:'⤢',name:'缩放 (S)'},
  {id:'rect',icon:'▭',name:'矩形 (Q)'},
  {id:'ellipse',icon:'◯',name:'椭圆 (E)'},
  {id:'pen',icon:'✒',name:'钢笔 (G)'},
  {id:'text',icon:'文',name:'文字 (T)'},
  {id:'pin',icon:'📌',name:'图钉 (P)'},
  {id:'field',icon:'◎',name:'空间场 (F)'},
];
function buildToolbar(){
  const tb=document.getElementById('toolbar');
  tb.innerHTML='';
  for(const t of TOOLS){
    const b=document.createElement('button');
    b.className='tool-btn'+(app.tool===t.id?' on':'');
    b.innerHTML=t.icon+'<span class="tip">'+t.name+'</span>';
    b.onclick=()=>setTool(t.id);
    tb.appendChild(b);
  }
  const qc=document.getElementById('quickCreate');
  qc.innerHTML='';
  const types=[['shape','◆ 形状'],['text','文 文字'],['null','⊹ 空对象'],['adjustment','◐ 调整'],
    ['precomp','▣ 预合成'],['camera','📷 摄像机'],['light','✦ 灯光'],['geo','⬢ 三维几何'],
    ['particles','⁘ 粒子'],['field','◎ 空间场'],['audio','♪ 音色']];
  for(const [type,label] of types){
    const b=document.createElement('button');
    b.textContent=label;
    b.onclick=()=>{
      if(type==='precomp'){ precompose(); return; }
      createLayer(type);
    };
    qc.appendChild(b);
  }
  const lm=document.getElementById('layerMenuPop');
  lm.innerHTML='';
  for(const [type,label] of types){
    const b=document.createElement('button');
    b.textContent='新建 '+label.replace(/^\S+\s/,'');
    b.onclick=()=>{ document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'));
      if(type==='precomp') precompose(); else createLayer(type); };
    lm.appendChild(b);
  }
}
function setTool(id){
  app.tool=id;
  buildToolbar();
  FF.CanvasView.onToolChange();
  const hints={select:'选择工具：拖动移动图层 · 手柄旋转缩放 · 双击进入预合成',
    anchor:'锚点工具：单独移动锚点，画面位置保持不变',
    rotate:'旋转工具：拖动旋转所选图层',scale:'缩放工具：拖动缩放所选图层',
    rect:'矩形工具：在画布上拖拽绘制',ellipse:'椭圆工具：在画布上拖拽绘制',
    pen:'钢笔工具：点击添加节点，拖动出切线，点击起点闭合，Esc 结束',
    text:'文字工具：点击画布创建文字（内置铸锋体）',
    pin:'图钉工具：点击三维几何添加图钉，拖动图钉变形',
    field:'场工具：点击画布创建空间场（距离衰减/噪声/旋涡）'};
  document.getElementById('statusHint').textContent=hints[id]||'就绪';
}
FF.setTool=setTool;

/* ---------- 顶栏事件 ---------- */
function wireTopbar(){
  document.querySelectorAll('.menu').forEach(m=>{
    m.querySelector('.menu-btn').addEventListener('click',e=>{
      e.stopPropagation();
      const was=m.classList.contains('open');
      document.querySelectorAll('.menu.open').forEach(x=>x.classList.remove('open'));
      if(!was) m.classList.add('open');
    });
  });
  document.querySelectorAll('.menu-pop [data-act]').forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll('.menu.open').forEach(m=>m.classList.remove('open'));
      const act=b.dataset.act;
      if(act==='new') newProject();
      else if(act==='open') document.getElementById('fileOpen').click();
      else if(act==='save') saveProject();
      else if(act==='demo'){ loadDemo(); }
      else if(act==='undo') undo();
      else if(act==='redo') redo();
      else if(act==='dup') duplicateSelected();
      else if(act==='del') deleteSelected();
      else if(act==='precomp') precompose();
    };
  });
  document.getElementById('fileOpen').addEventListener('change',e=>{
    if(e.target.files[0]) openFile(e.target.files[0]);
    e.target.value='';
  });
  document.getElementById('btnPlay').onclick=togglePlay;
  document.getElementById('btnStart').onclick=()=>{ if(app.comp) seekAndSync(app.comp.workArea[0]); };
  document.getElementById('btnEnd').onclick=()=>{ if(app.comp) seekAndSync(app.comp.workArea[1]-1/app.comp.fps); };
  document.getElementById('btnPrevFrame').onclick=()=>{ if(app.comp) seekAndSync(app.time-1/app.comp.fps); };
  document.getElementById('btnNextFrame').onclick=()=>{ if(app.comp) seekAndSync(app.time+1/app.comp.fps); };
  document.getElementById('btnLoop').onclick=()=>{ app.loop=!app.loop; updateTopbar(); };
  document.getElementById('btnAudio').onclick=()=>{
    app.muted=!app.muted;
    FF.Audio.ensure();
    FF.Audio.setMuted(app.muted);
    const b=document.getElementById('btnAudio');
    b.classList.toggle('on',!app.muted);
    b.textContent=app.muted?'♪ 声音关':'♪ 声音开';
    if(app.playing&&!app.muted) FF.Audio.play(app.comp,app.time,app.project);
  };
  document.getElementById('btnNewComp').onclick=()=>{
    modal({title:'新建合成',fields:[
      {key:'name',label:'名称',value:'合成 '+(app.project.comps.length+1)},
      {key:'w',label:'宽度',value:1280,type:'number'},
      {key:'h',label:'高度',value:720,type:'number'},
      {key:'fps',label:'帧率',value:30,type:'number'},
      {key:'dur',label:'时长(秒)',value:10,type:'number'},
    ],onOk:v=>{
      transact('新建合成',()=>{
        const c=FF.makeComp(v.name,Math.max(16,v.w||1280),Math.max(16,v.h||720),clamp(v.fps||30,1,120),Math.max(0.5,v.dur||10));
        app.project.comps.push(c);
      });
      setComp(app.project.comps[app.project.comps.length-1].id);
    }});
  };
  document.getElementById('btnNewGraph').onclick=()=>{
    transact('新建节点图',()=>{
      const g=FF.makeGraph('节点图 '+(app.project.nodeGraphs.length+1));
      app.project.nodeGraphs.push(g);
    });
    FF.NodeEditor.open(app.project.nodeGraphs[app.project.nodeGraphs.length-1].id);
    setBottomView('nodes');
    refreshAll();
  };
  document.querySelectorAll('.view-tabs button').forEach(b=>{
    b.onclick=()=>setBottomView(b.dataset.view);
  });
  document.querySelectorAll('#hudToggles button').forEach(b=>{
    b.onclick=()=>{
      const k=b.dataset.t;
      app.hud[k]=!app.hud[k];
      b.classList.toggle('on',app.hud[k]);
      app.needsRender=true;
    };
  });
  document.getElementById('hudZoomIn').onclick=()=>{ zoomCanvas(1.25); };
  document.getElementById('hudZoomOut').onclick=()=>{ zoomCanvas(0.8); };
  document.getElementById('hudFit').onclick=()=>{ app.view.zoom=null; app.view.panX=0; app.view.panY=0; app.needsRender=true; updateZoomLabel(); };
}
function zoomCanvas(f){
  const cv=FF.GL.canvas;
  if(!app.comp) return;
  const fit=Math.min((cv.width-80)/app.comp.w,(cv.height-80)/app.comp.h);
  app.view.zoom=clamp((app.view.zoom||fit)*f,fit*0.15,fit*12);
  app.needsRender=true;
  updateZoomLabel();
}
function updateZoomLabel(){
  const cv=FF.GL.canvas;
  if(!app.comp) return;
  const fit=Math.min((cv.width-80)/app.comp.w,(cv.height-80)/app.comp.h);
  const z=(app.view.zoom||fit)/fit;
  document.getElementById('hudZoom').textContent=Math.round(z*100)+'%';
}
FF.zoomCanvas=zoomCanvas; FF.updateZoomLabel=updateZoomLabel;

/* ---------- 快捷键 ---------- */
function isTyping(){
  const el=document.activeElement;
  return el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||el.isContentEditable);
}
function wireKeys(){
  document.addEventListener('keydown',e=>{
    FF.Audio.ensure();
    if(app.exportMode) return;
    if(isTyping()){
      if(e.key==='Escape') document.activeElement.blur();
      return;
    }
    const ctrl=e.ctrlKey||e.metaKey;
    const k=e.key;
    if(ctrl&&k.toLowerCase()==='z'&&!e.shiftKey){ e.preventDefault(); undo(); return; }
    if((ctrl&&k.toLowerCase()==='y')||(ctrl&&e.shiftKey&&k.toLowerCase()==='z')){ e.preventDefault(); redo(); return; }
    if(ctrl&&k.toLowerCase()==='s'){ e.preventDefault(); saveProject(); return; }
    if(ctrl&&k.toLowerCase()==='o'){ e.preventDefault(); document.getElementById('fileOpen').click(); return; }
    if(ctrl&&k.toLowerCase()==='d'){ e.preventDefault(); duplicateSelected(); return; }
    if(ctrl&&e.shiftKey&&k.toLowerCase()==='c'){ e.preventDefault(); precompose(); return; }
    if(ctrl&&k.toLowerCase()==='c'){ copySelection(); return; }
    if(ctrl&&k.toLowerCase()==='v'){ pasteSelection(); return; }
    if(ctrl&&k.toLowerCase()==='a'){ e.preventDefault(); if(app.comp){ app.selection=app.comp.layers.map(l=>l.id); refreshAll(); } return; }
    if(k===' '){ e.preventDefault(); togglePlay(); return; }
    if(k==='Delete'||k==='Backspace'){
      if(app.selKeys.length){ deleteSelectedKeys(); }
      else deleteSelected();
      return;
    }
    if(k==='F9'){ e.preventDefault(); easeSelectedKeys(); return; }
    if(k==='Escape'){ FF.CanvasView.cancelPen(); app.selection=[]; app.selKeys=[]; refreshAll(); return; }
    if(k==='ArrowLeft'){ e.preventDefault(); seekAndSync(app.time-(e.shiftKey?10:1)/(app.comp?app.comp.fps:30)); return; }
    if(k==='ArrowRight'){ e.preventDefault(); seekAndSync(app.time+(e.shiftKey?10:1)/(app.comp?app.comp.fps:30)); return; }
    if(k==='ArrowUp'&&app.comp){ e.preventDefault(); FF.Timeline.moveSel(-1); return; }
    if(k==='ArrowDown'&&app.comp){ e.preventDefault(); FF.Timeline.moveSel(1); return; }
    if(k==='Home'&&app.comp){ seekAndSync(app.comp.workArea[0]); return; }
    if(k==='End'&&app.comp){ seekAndSync(app.comp.workArea[1]-1/app.comp.fps); return; }
    if(k==='PageUp'&&app.comp){ jumpKey(-1); return; }
    if(k==='PageDown'&&app.comp){ jumpKey(1); return; }
    const toolKeys={v:'select',a:'anchor',r:'rotate',s:'scale',q:'rect',e:'ellipse',g:'pen',t:'text',p:'pin',f:'field'};
    if(!ctrl&&toolKeys[k.toLowerCase()]){ setTool(toolKeys[k.toLowerCase()]); return; }
    if(k==='+'||k==='='){ zoomCanvas(1.25); return; }
    if(k==='-'){ zoomCanvas(0.8); return; }
  });
  document.addEventListener('pointerdown',()=>FF.Audio.ensure(),{once:false});
}
function jumpKey(dir){
  if(!app.comp) return;
  const times=new Set();
  for(const l of app.comp.layers){
    for(const {prop} of FF.allProps(l)){
      for(const key of prop.keys||[]) times.add(key.t);
    }
  }
  const arr=[...times].sort((a,b)=>a-b);
  let target=null;
  if(dir>0) target=arr.find(t=>t>app.time+1e-4);
  else target=[...arr].reverse().find(t=>t<app.time-1e-4);
  if(target!==undefined) seekAndSync(target);
}
/* 复制粘贴（图层或关键帧） */
let clipboard=null;
function copySelection(){
  if(app.selKeys.length){
    clipboard={type:'keys',keys:app.selKeys.map(sk=>{
      const l=FF.findLayer(app.comp,sk.layerId);
      const p=FF.getProp(l,sk.path);
      const k=p.keys.find(x=>Math.abs(x.t-sk.t)<1e-4);
      return k?{path:sk.path,key:FF.deepClone(k),dt:sk.t}:null;
    }).filter(Boolean)};
    FF.ui.toast('已复制 '+clipboard.keys.length+' 个关键帧');
  } else if(app.selection.length&&app.comp){
    clipboard={type:'layers',layers:app.selection.map(id=>FF.deepClone(FF.findLayer(app.comp,id))).filter(Boolean)};
    FF.ui.toast('已复制 '+clipboard.layers.length+' 个图层');
  }
}
function pasteSelection(){
  if(!clipboard||!app.comp) return;
  if(clipboard.type==='keys'){
    transact('粘贴关键帧',()=>{
      for(const ck of clipboard.keys){
        const targets=app.selection.length?app.selection:[clipboard.keys[0]&&app.selection[0]].filter(Boolean);
        const lids=app.selection.length?app.selection:(clipboard.layerIds||[]);
        for(const lid of (lids.length?lids:app.selection)){
          const l=FF.findLayer(app.comp,lid);
          if(!l) continue;
          const p=FF.getProp(l,ck.path);
          if(!p) continue;
          const nk=FF.deepClone(ck.key);
          nk.t=app.time+(ck.key.t-clipboard.keys[0].dt);
          p.keys=p.keys.filter(x=>Math.abs(x.t-nk.t)>1e-4);
          p.keys.push(nk);
          p.keys.sort((a,b)=>a.t-b.t);
        }
      }
    });
    refreshAll();
  } else {
    const news=[];
    transact('粘贴图层',()=>{
      for(const l of clipboard.layers){
        const cp=FF.deepClone(l);
        cp.id=FF.util.uid('L');
        cp.name=l.name+' 副本';
        cp.parent=null;
        app.comp.layers.unshift(cp);
        news.push(cp);
      }
    });
    app.selection=news.map(l=>l.id);
    refreshAll();
  }
}
function deleteSelectedKeys(){
  if(!app.selKeys.length) return;
  transact('删除关键帧',()=>{
    for(const sk of app.selKeys){
      const l=FF.findLayer(app.comp,sk.layerId);
      if(!l) continue;
      const p=FF.getProp(l,sk.path);
      if(p) p.keys=p.keys.filter(k=>Math.abs(k.t-sk.t)>1e-4);
    }
  });
  app.selKeys=[];
  refreshAll();
}
function easeSelectedKeys(){
  const keys=app.selKeys.length?app.selKeys:null;
  if(!keys){ FF.ui.toast('请先选择关键帧'); return; }
  transact('缓入缓出 (F9)',()=>{
    for(const sk of keys){
      const l=FF.findLayer(app.comp,sk.layerId);
      const p=FF.getProp(l,sk.path);
      const k=p.keys.find(x=>Math.abs(x.t-sk.t)<1e-4);
      if(!k) continue;
      k.i='bez';
      k.eo=[0.33,0];
      k.ei=[0.33,1];
    }
  });
  refreshAll();
  FF.ui.toast('已应用缓入缓出');
}
FF.easeSelectedKeys=easeSelectedKeys;

function loadDemo(){
  const proj=FF.Demo.build();
  setProject(proj);
  FF.ui.toast('已载入「锻字」示例 · 15 秒');
}
FF.loadDemo=loadDemo;

/* ---------- 初始化 ---------- */
function init(){
  buildToolbar();
  wireTopbar();
  wireKeys();
  setTool('select');
  requestAnimationFrame(tick);
}
FF.app.init=init;
FF.app.setProject=setProject;
FF.app.setComp=setComp;
FF.app.setTime=setTime;
FF.app.seekAndSync=seekAndSync;
FF.app.play=play; FF.app.pause=pause; FF.app.togglePlay=togglePlay;
FF.app.invalidate=invalidate;
FF.app.refreshAll=refreshAll;
FF.app.renderFrame=renderFrame;
FF.app.transact=transact;
FF.app.pushHistory=pushHistory;
FF.app.beginDrag=beginDrag;
FF.app.endDrag=endDrag;
FF.app.undo=undo; FF.app.redo=redo;
FF.app.createLayer=createLayer;
FF.app.deleteSelected=deleteSelected;
FF.app.deleteSelectedKeys=deleteSelectedKeys;
FF.app.duplicateSelected=duplicateSelected;
FF.app.precompose=precompose;
FF.app.saveProject=saveProject;
FF.app.newProject=newProject;
FF.app.updateTopbar=updateTopbar;
})();
