/* editor.js — 查看器交互、工具、直接编辑、走带、快捷键 */
(function(){
'use strict';
const E = {
  time:0, playing:false, loop:true, tool:'select', fps:0, drawCalls:0, particleCount:0,
  editPathLayer:null, editPathIndex:0, drag:null, helpers:true, grid:false,
  zoomLevel:1, pan:{x:0,y:0}, showSafe:false, viewMode:'2d',
};
window.Editor = E;
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));

/* ==================== 初始化 ==================== */
E.init=function(){
  E.canvas=$('#gl'); E.overlay=$('#overlay');
  E.bindTools();
  E.bindCanvas();
  E.bindTransport();
  E.bindKeys();
  E.bindMenus2();
  Model.on('structure',()=>{});
  Model.on('selection',()=>E.drawOverlay());
  requestAnimationFrame(E.frame);
};
E.bindMenus2=function(){
  $('#btn-save').onclick=()=>E.saveProject();
  $('#btn-open').onclick=()=>$('#file-open').click();
  $('#file-open').onchange=e=>E.openFile(e);
  $('#btn-play').onclick=()=>E.togglePlay();
  $('#btn-stop').onclick=()=>{ E.playing=false; E.setTime(0); };
  $('#btn-loop').onclick=()=>{ E.loop=!E.loop; $('#btn-loop').classList.toggle('active',E.loop); };
  $('#btn-ramp').onclick=()=>E.rampPreview();
  $('#btn-add-layer').onclick=()=>E.addLayerMenu();
  $('#btn-add-comp').onclick=()=>E.newCompDialog();
  $('#btn-export-test').onclick=()=>E.testExport();
  $('#btn-newcomp').onclick=()=>E.newCompDialog();
  $('#btn-loaddemo').onclick=()=>Demo.load();
  $('#chk-motionblur').onchange=e=>{ const c=Model.currentComp(); if(c){ c.motionBlur.enabled=e.target.checked; } };
  $('#chk-dof').onchange=e=>{ E.dof=e.target.checked; };
  $('#chk-helpers').onchange=e=>{ E.helpers=e.target.checked; };
  $$('#tool-group [data-tool]').forEach(b=>b.onclick=()=>E.setTool(b.dataset.tool));
  $$('#viewer-toolbar [data-act]').forEach(b=>b.onclick=()=>E.toolAction(b.dataset.act));
};
E.setTool=function(t){
  E.tool=t;
  $$('#tool-group [data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));
  if(t==='pen'){ E.toast('钢笔：在画布上点击与拖动绘制；回车结束'); }
};
E.toolAction=function(a){
  if(a==='zoom-in') E.zoom(1.25);
  else if(a==='zoom-out') E.zoom(1/1.25);
  else if(a==='zoom-fit') E.fitView();
  else if(a==='toggle-grid'){ E.grid=!E.grid; E.drawOverlay(); }
  else if(a==='toggle-guides'){ E.showSafe=!E.showSafe; E.drawOverlay(); }
  else if(a==='toggle-safe'){ E.showSafe=!E.showSafe; E.drawOverlay(); }
  else if(a==='view-2d'){ E.setViewMode('2d'); }
  else if(a==='view-3d'){ E.setViewMode('3d'); }
  else if(a==='view-top'){ E.setViewMode('top'); }
  else if(a==='view-front'){ E.setViewMode('front'); }
};
E.setViewMode=function(m){
  E.viewMode=m;
  const comp=Model.currentComp(); if(!comp) return;
  const cam=comp.layers.find(l=>l.type==='camera');
  if(!cam) return;
  const v=cam.values['camera'];
  if(m==='2d'){ v.position=[comp.width/2,comp.height/2,-(comp.height/2)/Math.tan(35*Math.PI/360)]; v.pointOfInterest=[comp.width/2,comp.height/2,0]; }
  else if(m==='3d'){ v.position=[comp.width/2+260,comp.height/2-200,-900]; v.pointOfInterest=[comp.width/2,comp.height/2,0]; }
  else if(m==='top'){ v.position=[comp.width/2,comp.height/2-1400,-400]; v.pointOfInterest=[comp.width/2,comp.height/2,0]; }
  else if(m==='front'){ v.position=[comp.width/2,comp.height/2,-1400]; v.pointOfInterest=[comp.width/2,comp.height/2,0]; }
  Model.emit('structure');
};

/* ==================== 工具条 ==================== */
E.bindTools=function(){
  const tools=[['select','选择 (V)','⬚'],['hand','手 (H)','✋'],['zoom','缩放 (Z)','🔍'],['anchor','锚点 (Y)','⊕'],['rotate','旋转 (W)','⟳'],['scale','缩放 (E)','⤢'],['pen','钢笔 (G)','✒'],['rect','矩形','▭'],['ellipse','椭圆','◯'],['text','文字 (T)','T'],['pin','图钉','📌']];
  const g=$('#tool-group');
  g.innerHTML='';
  for(const t of tools){
    const b=document.createElement('button');
    b.className='vt-btn'+(t[0]==='select'?' active':'');
    b.dataset.tool=t[0]; b.textContent=t[2]; b.title=t[1];
    g.appendChild(b);
  }
};

/* ==================== 画布事件 ==================== */
E.bindCanvas=function(){
  const cv=E.canvas;
  cv.addEventListener('mousedown',e=>E.mouseDown(e));
  window.addEventListener('mousemove',e=>E.mouseMove(e));
  window.addEventListener('mouseup',e=>E.mouseUp(e));
  cv.addEventListener('wheel',e=>{ e.preventDefault(); if(e.ctrlKey||e.metaKey){ E.zoom(e.deltaY<0?1.12:1/1.12); } else if(e.shiftKey){ /* pan */ } },{passive:false});
  cv.addEventListener('dblclick',e=>E.dblClick(e));
  cv.addEventListener('contextmenu',e=>e.preventDefault());
};
E.evComp=function(e){
  const r=E.canvas.getBoundingClientRect();
  const sx=e.clientX-r.left, sy=e.clientY-r.top;
  return R.screenToComp(sx,sy);
};
E.mouseDown=function(e){
  AudioEngine.ensure();
  const comp=Model.currentComp(); if(!comp) return;
  const [cx,cy]=E.evComp(e);
  const t=E.time;
  if(E.tool==='hand'){ E.drag={kind:'pan',x:e.clientX,y:e.clientY,ox:R.view.ox,oy:R.view.oy}; return; }
  if(E.tool==='zoom'){ E.zoom(e.shiftKey?1/1.2:1.2); return; }
  if(E.tool==='rect'||E.tool==='ellipse'){
    const layer=Model.selectedLayers()[0];
    if(layer&&layer.type==='shape'){
      const shape=layer.values['shape'];
      const c=E.tool==='rect'? U.rectContour(cx,cy,1,1) : U.ellipseContour(cx,cy,1,1,24);
      const pd=U.pathDataFromPoly(c.pts,true);
      shape.paths.push(pd);
      E.drag={kind:'shape',layer,path:pd};
      Model.commit('绘制形状');
      Model.emit('structure');
      return;
    }
  }
  if(E.tool==='pen'){
    const layer=Model.selectedLayers()[0];
    if(layer&&layer.type==='shape'){
      const shape=layer.values['shape'];
      if(!E.penPath||E.penPathLayer!==layer){
        E.penPath=U.pathDataFromPoly([[cx,cy]],false);
        E.penPath.closed=false;
        shape.paths.push(E.penPath);
        E.penPathLayer=layer;
      }else{
        E.penPath.pts.push({p:[cx,cy],i:null,o:null});
      }
      Model.emit('structure');
      return;
    }else{
      E.toast('先选择一个形状图层');
      return;
    }
  }
  if(E.tool==='text'){
    E.editTextAt(cx,cy);
    return;
  }
  if(E.tool==='pin'){
    const layer=Model.selectedLayers()[0];
    if(layer&&layer.type==='geometry3d'){
      const pins=layer.values['deform'].pins;
      pins.push({id:U.uid('pin'),position:[cx,cy,0],restPosition:[cx,cy,0],radius:200,falloff:2,strength:1,rot:[0,0,0],rotX:0,rotY:0,rotZ:0,scale:[1,1,1]});
      Model.commit('添加图钉'); Model.emit('structure');
    }
    return;
  }
  // 路径编辑
  if(E.editPathLayer){
    const hit=E.hitPathPoint(cx,cy);
    if(hit){ E.drag={kind:'pathpoint',...hit}; return; }
  }
  // 命中图层
  const hit=E.hitTest(comp,t,cx,cy);
  if(E.tool==='select'||E.tool==='anchor'||E.tool==='rotate'||E.tool==='scale'){
    if(hit){
      if(e.shiftKey){
        const ids=Model.sel.layerIds.slice();
        const i=ids.indexOf(hit.id);
        if(i>=0) ids.splice(i,1); else ids.push(hit.id);
        Model.select(comp.id,ids);
      }else if(!Model.sel.layerIds.includes(hit.id)){
        Model.select(comp.id,[hit.id]);
      }
      const layer=hit;
      const kind=E.tool==='select'?'move':E.tool;
      const pos=Model.evalProperty(layer,'transform.position',t,comp);
      E.drag={kind,layer,cx,cy,startPos:Array.isArray(pos)?pos.slice():[pos,pos,0],t};
      if(kind==='anchor'){
        const a=Model.evalProperty(layer,'transform.anchorPoint',t,comp);
        E.drag.startAnchor=a.slice();
      }
    }else{
      if(!e.shiftKey) Model.select(comp.id,[]);
      E.drag={kind:'marquee',x0:e.clientX,y0:e.clientY,x1:e.clientX,y1:e.clientY};
    }
    return;
  }
};
E.mouseMove=function(e){
  const comp=Model.currentComp();
  if(!E.drag){
    // 悬停指针
    return;
  }
  const [cx,cy]=E.evComp(e);
  const d=E.drag;
  const t=E.time;
  if(d.kind==='pan'){
    R.view.ox=d.ox+(e.clientX-d.x);
    R.view.oy=d.oy+(e.clientY-d.y);
    return;
  }
  if(d.kind==='marquee'){
    d.x1=e.clientX; d.y1=e.clientY;
    E.drawOverlay();
    return;
  }
  if(d.kind==='shape'){
    const pd=d.path;
    if(E.tool==='rect'){
      const p0=pd.pts[0].p;
      pd.pts=[{p:[p0[0],p0[1]]},{p:[cx,p0[1]]},{p:[cx,cy]},{p:[p0[0],cy]}];
    }else{
      const p0=pd.pts[0].p;
      const rx=Math.abs(cx-p0[0]), ry=Math.abs(cy-p0[1]);
      const pts=[];
      for(let i=0;i<24;i++){ const a=i/24*U.TAU; pts.push({p:[p0[0]+Math.cos(a)*rx,p0[1]+Math.sin(a)*ry]}); }
      pd.pts=pts;
    }
    Model.emit('structure');
    return;
  }
  if(d.kind==='pathpoint'){
    d.pd.pts[d.index].p=[cx,cy];
    Model.emit('structure');
    return;
  }
  const layer=d.layer;
  const dx=cx-d.cx, dy=cy-d.cy;
  if(d.kind==='move'){
    const np=[d.startPos[0]+dx,d.startPos[1]+dy,d.startPos[2]||0];
    Model.setValueAtTime(layer,'transform.position',t,np);
    Model.emit('structure');
  }else if(d.kind==='anchor'){
    const na=[d.startAnchor[0]+dx,d.startAnchor[1]+dy,d.startAnchor[2]||0];
    const rot=Model.evalProperty(layer,'transform.rotation',t,comp)*Math.PI/180;
    const scl=Model.evalProperty(layer,'transform.scale',t,comp);
    const sx=Array.isArray(scl)?scl[0]/100:scl/100, sy=Array.isArray(scl)?scl[1]/100:scl/100;
    const dax=na[0]-d.startAnchor[0], day=na[1]-d.startAnchor[1];
    const rx=dax*Math.cos(rot)-day*Math.sin(rot);
    const ry=dax*Math.sin(rot)+day*Math.cos(rot);
    const pos=Model.evalProperty(layer,'transform.position',t,comp);
    Model.setValueAtTime(layer,'transform.anchorPoint',t,na);
    Model.setValueAtTime(layer,'transform.position',t,[pos[0]+rx*sx,pos[1]+ry*sy,pos[2]||0]);
    Model.emit('structure');
  }else if(d.kind==='rotate'){
    const pos=d.startPos;
    const ang=Math.atan2(cy-pos[1],cx-pos[0])-Math.atan2(d.cy-pos[1],d.cx-pos[0]);
    const rot=Model.evalProperty(layer,'transform.rotation',t,comp)+ang*180/Math.PI;
    Model.setValueAtTime(layer,'transform.rotation',t,rot);
    Model.emit('structure');
  }else if(d.kind==='scale'){
    const dist0=Math.hypot(d.cx-pos[0]??0,0);
    const d0=Math.max(8,Math.hypot(d.cx-d.startPos[0],d.cy-d.startPos[1]));
    const d1=Math.max(8,Math.hypot(cx-d.startPos[0],cy-d.startPos[1]));
    const f=d1/d0;
    const scl=Model.evalProperty(layer,'transform.scale',t,comp);
    const s=Array.isArray(scl)?scl:[scl,scl,scl];
    Model.setValueAtTime(layer,'transform.scale',t,[s[0]*f,s[1]*f,s[2]*f]);
    Model.emit('structure');
  }
};
E.mouseUp=function(e){
  const d=E.drag;
  if(!d) return;
  if(d.kind==='marquee'){
    const comp=Model.currentComp();
    const r=E.canvas.getBoundingClientRect();
    const x0=Math.min(d.x0,d.x1)-r.left, x1=Math.max(d.x0,d.x1)-r.left;
    const y0=Math.min(d.y0,d.y1)-r.top, y1=Math.max(d.y0,d.y1)-r.top;
    const [c0x,c0y]=R.screenToComp(x0,y0), [c1x,c1y]=R.screenToComp(x1,y1);
    const ids=[];
    for(const l of comp?comp.layers:[]){
      const g=Composite.layerGeometry(l,comp,E.time);
      if(!g) continue;
      const wm=Model.worldMatrix(l,E.time,comp);
      const pts=(g.contours||[]).map(c=>c.pts).flat();
      let inside=false;
      for(const p of pts){ const q=U.m4mulV(wm,[p[0],p[1],0,1]); if(q[0]>=c0x&&q[0]<=c1x&&q[1]>=c0y&&q[1]<=c1y){inside=true;break;} }
      if(inside) ids.push(l.id);
    }
    Model.select(comp?comp.id:null,ids);
  }
  if(d.kind==='move'||d.kind==='anchor'||d.kind=='rotate'||d.kind==='scale') Model.commit('直接编辑');
  E.drag=null;
  E.drawOverlay();
};
E.dblClick=function(e){
  const comp=Model.currentComp(); if(!comp) return;
  const [cx,cy]=E.evComp(e);
  const hit=E.hitTest(comp,E.time,cx,cy);
  if(hit&&hit.type==='shape'){
    E.editPathLayer=hit; E.editPathIndex=0;
    E.toast('路径编辑：拖动节点，双击空白退出');
  }else if(hit&&hit.type==='text'){
    E.editTextLayer(hit);
  }else{
    E.editPathLayer=null;
  }
  E.drawOverlay();
};

/* ==================== 命中测试 ==================== */
E.hitTest=function(comp,t,cx,cy){
  for(let i=0;i<comp.layers.length;i++){
    const l=comp.layers[i];
    if(l.visible===false) continue;
    if(l.type==='camera'||l.type==='light'||l.type==='audio'||l.type==='null'||l.type==='adjust') continue;
    if(!Composite.layerActive(l,t)) continue;
    if(l.type==='geometry3d'){
      const g=Composite.layerGeometry(l,comp,t);
      if(g&&g.mesh&&E.hitMesh(l,comp,t,g,cx,cy)) return l;
    }else{
      const g=Composite.layerGeometry(l,comp,t);
      if(!g) continue;
      const inv=U.m4invert(Model.worldMatrix(l,t,comp));
      const lp=U.m4mulV(inv,[cx,cy,0,1]);
      if(l.type==='text'){
        const lay=g.layout;
        for(const gl of lay.glyphs){ for(const c of gl.contours){ if(U.pointInPoly([lp[0],lp[1]],c.pts)) return l; } }
      }else if(l.type==='precomp'){
        const sub=Model.getComp(l.precompId);
        if(sub&&Math.abs(lp[0])<=sub.width/2&&Math.abs(lp[1])<=sub.height/2) return l;
      }else{
        for(const c of (g.contours||[])){ if(U.pointInPoly([lp[0],lp[1]],c.pts)) return l; }
      }
    }
  }
  return null;
};
E.hitMesh=function(layer,comp,t,g,cx,cy){
  const cam=Composite.getActiveCamera(comp,t);
  const vp=Composite.cameraVP(cam,comp);
  const wm=Model.worldMatrix(layer,t,comp);
  const pos=g.mesh.positions, idx=g.mesh.indices;
  const pts=[];
  for(let i=0;i<pos.length;i+=3){
    const w=U.m4mulV(wm,[pos[i],pos[i+1],pos[i+2],1]);
    const c=U.m4mulV(vp,w);
    if(c[3]<=0.001) continue;
    const nd=[c[0]/c[3],c[1]/c[3]];
    const cc=U.m4mulV(Render.matComp(),U.m4mulV(Render.matNdcToComp(),[nd[0],nd[1],0,1]));
    pts.push([cc[0],cc[1]]);
  }
  for(let i=0;i<idx.length;i+=3){
    const a=pts[idx[i]],b=pts[idx[i+1]],c=pts[idx[i+2]];
    if(!a||!b||!c) continue;
    if(U.pointInPoly([cx,cy],[a,b,c])) return true;
  }
  return false;
};
E.hitPathPoint=function(cx,cy){
  const layer=E.editPathLayer;
  if(!layer) return null;
  const shape=layer.values['shape'];
  const paths=shape.paths||[];
  const inv=U.m4invert(Model.worldMatrix(layer,E.time,Model.layerComp(layer)));
  for(let i=0;i<paths.length;i++){
    const pts=U.flattenPathData(paths[i],20);
    for(let j=0;j<pts.length;j++){
      const q=U.m4mulV(Model.worldMatrix(layer,E.time,Model.layerComp(layer)),[pts[j][0],pts[j][1],0,1]);
      if(Math.hypot(q[0]-cx,q[1]-cy)<7/R.view.scale) return {pd:paths[i],index:j,pts};
    }
  }
  return null;
};

/* ==================== 覆盖层绘制 ==================== */
E.drawOverlay=function(){
  const cv=E.overlay;
  const w=cv.clientWidth,h=cv.clientHeight;
  if(cv.width!==w*R.dpr||cv.height!==h*R.dpr){ cv.width=w*R.dpr; cv.height=h*R.dpr; }
  const c=cv.getContext('2d');
  c.setTransform(R.dpr,0,0,R.dpr,0,0);
  c.clearRect(0,0,w,h);
  const comp=Model.currentComp();
  if(!comp) return;
  const t=E.time;
  const toS=p=>{ const q=R.compToScreen(p[0],p[1]); return q; };
  // 安全框
  if(E.showSafe){
    c.strokeStyle='rgba(255,255,255,0.25)'; c.setLineDash([4,4]);
    for(const f of [0.9,0.8]){
      const ww=comp.width*f, hh=comp.height*f;
      const a=R.compToScreen((comp.width-ww)/2,(comp.height-hh)/2);
      c.strokeRect(a[0],a[1],ww*R.view.scale/R.dpr,hh*R.view.scale/R.dpr);
    }
    c.setLineDash([]);
  }
  // 网格
  if(E.grid){
    const step=50;
    c.strokeStyle='rgba(255,255,255,0.06)';
    c.lineWidth=1;
    for(let x=0;x<=comp.width;x+=step){ const a=toS([x,0]),b=toS([x,comp.height]); c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke(); }
    for(let y=0;y<=comp.height;y+=step){ const a=toS([0,y]),b=toS([comp.width,y]); c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke(); }
  }
  // 场范围
  if(E.helpers&&comp.fields){
    for(const f of comp.fields){
      const s=toS(f.position);
      const r=(f.radius||300)*R.view.scale/R.dpr;
      c.strokeStyle='rgba(255,150,60,0.5)'; c.setLineDash([3,3]);
      c.beginPath(); c.arc(s[0],s[1],r,0,U.TAU); c.stroke();
      c.setLineDash([]);
      c.fillStyle='rgba(255,150,60,0.8)'; c.font='10px sans-serif';
      c.fillText('场',s[0]+3,s[1]-3);
    }
  }
  // 灯光 / 摄像机
  if(E.helpers){
    for(const l of comp.layers){
      if(l.type==='light'){
        const o=Model.evalObj(l,'light',t,comp);
        const s=toS(o.position);
        c.strokeStyle='rgba(255,220,120,0.8)'; c.fillStyle='rgba(255,220,120,0.9)';
        c.beginPath(); c.arc(s[0],s[1],6,0,U.TAU); c.stroke();
        const d=U.vnorm(o.direction);
        const e2=toS([o.position[0]+d[0]*80,o.position[1]+d[1]*80]);
        c.beginPath(); c.moveTo(s[0],s[1]); c.lineTo(e2[0],e2[1]); c.stroke();
        c.font='10px sans-serif'; c.fillText('光',s[0]+8,s[1]-4);
      }else if(l.type==='camera'){
        const o=Model.evalObj(l,'camera',t,comp);
        const s=toS(o.position), tg=toS(o.pointOfInterest);
        c.strokeStyle='rgba(120,180,255,0.8)';
        c.beginPath(); c.arc(s[0],s[1],7,0,U.TAU); c.stroke();
        c.fillStyle='rgba(120,180,255,0.9)'; c.font='10px sans-serif'; c.fillText('机',s[0]+9,s[1]-4);
        c.beginPath(); c.moveTo(s[0],s[1]); c.lineTo(tg[0],tg[1]); c.setLineDash([3,3]); c.stroke(); c.setLineDash([]);
      }
    }
  }
  // 选中图层
  const sel=Model.selectedLayers();
  for(const l of sel){
    if(!Composite.layerActive(l,t)) continue;
    const g=Composite.layerGeometry(l,comp,t);
    const wm=Model.worldMatrix(l,t,comp);
    let pts=[];
    if(g&&g.contours) for(const cc of g.contours) pts=pts.concat(cc.pts.map(p=>U.m4mulV(wm,[p[0],p[1],0,1])));
    else if(l.type==='precomp'){ const sub=Model.getComp(l.precompId); if(sub) pts=[[-sub.width/2,-sub.height/2],[sub.width/2,-sub.height/2],[sub.width/2,sub.height/2],[-sub.width/2,sub.height/2]].map(p=>U.m4mulV(wm,[p[0],p[1],0,1])); }
    if(pts.length){
      let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
      for(const p of pts){ x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]); }
      const a=toS([x0,y0]), b=toS([x1,y1]);
      c.strokeStyle='#4f9cf9'; c.lineWidth=1;
      c.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);
      // 手柄
      c.fillStyle='#fff';
      for(const [hx,hy] of [[a[0],a[1]],[b[0],a[1]],[b[0],b[1]],[a[0],b[1]],[(a[0]+b[0])/2,a[1]],[(a[0]+b[0])/2,b[1]],[a[0],(a[1]+b[1])/2],[b[0],(a[1]+b[1])/2]]){
        c.fillRect(hx-2.5,hy-2.5,5,5);
      }
      // 锚点
      const anchor=Model.evalProperty(l,'transform.anchorPoint',t,comp);
      const as=toS(U.m4mulV(wm,[anchor[0],anchor[1],0,1]));
      c.strokeStyle='#ff7a3c'; c.beginPath(); c.arc(as[0],as[1],5,0,U.TAU); c.stroke();
      c.beginPath(); c.moveTo(as[0]-7,as[1]); c.lineTo(as[0]+7,as[1]); c.moveTo(as[0],as[1]-7); c.lineTo(as[0],as[1]+7); c.stroke();
    }
    // 运动路径
    if(l.type==='geometry3d'||l.type==='shape'||l.type==='text'||l.type==='precomp'){
      c.strokeStyle='rgba(255,122,60,0.55)'; c.lineWidth=1;
      c.beginPath();
      const N=60;
      for(let i=0;i<=N;i++){
        const tt=comp.workStart+(comp.workEnd-comp.workStart)*i/N;
        const p=Model.evalProperty(l,'transform.position',tt,comp);
        let sp;
        if(l.type==='geometry3d'){
          const cam=Composite.getActiveCamera(comp,tt);
          const vp=Composite.cameraVP(cam,comp);
          const wm2=Model.worldMatrix(l,tt,comp);
          const w=U.m4mulV(wm2,[p[0],p[1],p[2]||0,1]);
          const cp=U.m4mulV(vp,w);
          const nd=[cp[0]/cp[3],cp[1]/cp[3]];
          const cc=U.m4mulV(Render.matComp(),U.m4mulV(Render.matNdcToComp(),[nd[0],nd[1],0,1]));
          sp=toS([cc[0],cc[1]]);
        }else{
          const wm2=Model.worldMatrix(l,tt,comp);
          const q=U.m4mulV(wm2,[p[0],p[1],p[2]||0,1]);
          sp=toS([q[0],q[1]]);
        }
        if(i===0) c.moveTo(sp[0],sp[1]); else c.lineTo(sp[0],sp[1]);
      }
      c.stroke();
    }
  }
  // 路径编辑节点
  if(E.editPathLayer&&E.editPathLayer.values){
    const shape=E.editPathLayer.values['shape'];
    const wm=Model.worldMatrix(E.editPathLayer,t,comp);
    for(const pd of (shape.paths||[])){
      const pts=U.flattenPathData(pd,20);
      c.strokeStyle='rgba(79,156,249,0.9)';
      c.beginPath();
      pts.forEach((p,i)=>{ const q=U.m4mulV(wm,[p[0],p[1],0,1]); const s=toS([q[0],q[1]]); if(i===0)c.moveTo(s[0],s[1]); else c.lineTo(s[0],s[1]); });
      if(pd.closed) c.closePath();
      c.stroke();
      c.fillStyle='#f2c14e';
      for(const p of pd.pts){ const q=U.m4mulV(wm,[p.p[0],p.p[1],0,1]); const s=toS([q[0],q[1]]); c.beginPath(); c.arc(s[0],s[1],4,0,U.TAU); c.fill(); }
    }
  }
  // 框选
  if(E.drag&&E.drag.kind==='marquee'){
    const r=E.canvas.getBoundingClientRect();
    c.strokeStyle='#4f9cf9'; c.fillStyle='rgba(79,156,249,0.12)';
    const x=E.drag.x0-r.left, y=E.drag.y0-r.top;
    c.fillRect(x,y,E.drag.x1-E.drag.x0,E.drag.y1-E.drag.y0);
    c.strokeRect(x,y,E.drag.x1-E.drag.x0,E.drag.y1-E.drag.y0);
  }
  // 三维轴（左下）
  E.drawAxis(c,w,h,comp,t);
};
E.drawAxis=function(c,w,h,comp,t){
  const cam=Composite.getActiveCamera(comp,t);
  const vp=Composite.cameraVP(cam,comp);
  const org=[comp.width/2,comp.height/2,0];
  const axes=[[[1,0,0],'#e05563','X'],[[0,1,0],'#4fc08d','Y'],[[0,0,1],'#4f9cf9','Z']];
  const base=[26,h-26];
  for(const [d,col,lab] of axes){
    const p=U.m4mulV(vp,[org[0]+d[0]*60,org[1]+d[1]*60,org[2]+d[2]*60,1]);
    const o=U.m4mulV(vp,[org[0],org[1],org[2],1]);
    const sx=U.lerp(base[0],base[0]+(p[0]/p[3]-o[0]/o[3])*3000,1);
    const sy=U.lerp(base[1],base[1]+(p[1]/p[3]-o[1]/o[3])*3000,1);
    c.strokeStyle=col; c.lineWidth=2;
    c.beginPath(); c.moveTo(base[0],base[1]); c.lineTo(sx,sy); c.stroke();
    c.fillStyle=col; c.font='bold 10px sans-serif'; c.fillText(lab,sx+2,sy+3);
  }
};

/* ==================== 渲染循环 ==================== */
let _last=performance.now(), _frames=0, _fpsT=0;
E.frame=function(now){
  const dt=Math.min(0.1,(now-_last)/1000); _last=now;
  _frames++; _fpsT+=dt;
  if(_fpsT>=1){ E.fps=_frames/_fpsT; _frames=0; _fpsT=0; }
  const comp=Model.currentComp();
  if(E.playing&&comp){
    E.time+=dt;
    const end=E.loop? comp.workEnd : comp.duration;
    if(E.time>=end){ if(E.loop){ E.time=comp.workStart; Particles.invalidateAll(); } else { E.time=comp.duration; E.playing=false; } }
    Model.emit('time');
  }
  AudioEngine.update(comp,E.time,E.playing);
  E.render();
  requestAnimationFrame(E.frame);
};
E.render=function(){
  const comp=Model.currentComp();
  if(!comp){ Render.clearFBO(null,[0.05,0.06,0.08],1); E.drawOverlay(); return; }
  Render.setComp(comp.width,comp.height);
  Composite.render(comp,E.time,null,{});
  E.particleCount=0;
  E.drawOverlay();
  UI.updateHUD();
};
E.rampPreview=function(){
  E.playing=true;
};

/* ==================== 走带 ==================== */
E.bindTransport=function(){
  $('#btn-prevframe').onclick=()=>E.stepFrame(-1);
  $('#btn-nextframe').onclick=()=>E.stepFrame(1);
};
E.togglePlay=function(){
  AudioEngine.ensure();
  const comp=Model.currentComp(); if(!comp) return;
  if(!E.playing && E.time>=comp.workEnd-1e-6) E.time=comp.workStart;
  E.playing=!E.playing;
  $('#btn-play').textContent=E.playing?'⏸':'▶';
  if(E.playing) AudioEngine.resume(); else AudioEngine.stopAll();
  AudioEngine._lastTrigger.clear();
};
E.stepFrame=function(d){
  const comp=Model.currentComp(); if(!comp) return;
  E.playing=false; $('#btn-play').textContent='▶';
  const f=Math.round(E.time*comp.fps)+d;
  E.setTime(f/comp.fps);
};
E.setTime=function(t){
  const comp=Model.currentComp();
  E.time=U.clamp(t,0,comp?comp.duration:0);
  Particles.invalidateAll();
  Model.emit('time');
};
E.zoom=function(f){
  E.zoomLevel=U.clamp(E.zoomLevel*f,0.02,20);
  Render.fitView(E.zoomLevel);
  UI.updateHUD();
};
E.fitView=function(){ E.zoomLevel=1; Render.fitView(1); UI.updateHUD(); };
E.toggleGrid=function(){ E.grid=!E.grid; };
E.toggleHelpers=function(){ E.helpers=!E.helpers; };

/* ==================== 属性操作 ==================== */
E.isTyping=function(){
  const a=document.activeElement;
  return a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT');
};
E.setProp=function(layer,path,value){
  Model.setValueAtTime(layer,path,E.time,value);
  Model.emit('structure');
};
E.setPropComponent=function(layer,path,value,comp){
  if(comp===undefined||comp===null){
    Model.setValueAtTime(layer,path,value);
  }else{
    const cur=Model.evalProperty(layer,path,E.time,Model.layerComp(layer));
    const arr=Array.isArray(cur)?cur.slice():[cur,cur,cur];
    arr[comp]=value;
    Model.setValueAtTime(layer,path,arr);
  }
  Model.emit('structure');
};
E.setPropVector=function(layer,path,value){
  const arr=Array.isArray(value)?value.slice():[value,value,value];
  Model.setValueAtTime(layer,path,arr);
  Model.emit('structure');
};
E.toggleKey=function(layer,path){
  if(layer.expr&&layer.expr[path]){ E.toast('该属性已有表达式'); return; }
  const keys=Model.getKeys(layer,path);
  if(keys&&keys.length){ delete layer.kf[path]; E.toast('已清除动画'); }
  else{
    const v=Model.getStaticValue(layer,path);
    if(!layer.kf[path]) layer.kf[path]={keys:[]};
    Model.addKey(layer,path,E.time,v,{interp:'bezier',easeIn:[0.42,0],easeOut:[0.58,1]});
    E.toast('已添加关键帧');
  }
  Model.commit('切换动画');
  Model.emit('structure');
};
E.addKeyAtTime=function(layer,path,t){
  const v=Model.getStaticValue(layer,path);
  if(!layer.kf[path]) layer.kf[path]={keys:[]};
  Model.addKey(layer,path,t,v,{interp:'bezier',easeIn:[0.42,0],easeOut:[0.58,1]});
  Model.commit('添加关键帧');
  Model.emit('structure');
};
E.addKeyToSelected=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  const path=UI.pickAnimatablePath(layer);
  E.addKeyAtTime(layer,path,E.time);
};
E.easyEase=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  let n=0;
  for(const sel of UI.tl.selKeys){
    if(sel.layerId!==layer.id) continue;
    const keys=Model.getKeys(layer,sel.path); if(!keys||!keys[sel.index]) continue;
    const k=keys[sel.index];
    k.interp='bezier'; k.easeIn=[0.42,0]; k.easeOut=[0.58,1];
    n++;
  }
  if(!n){ for(const path of Object.keys(layer.kf)){ for(const k of layer.kf[path].keys){ k.interp='bezier'; k.easeIn=[0.42,0]; k.easeOut=[0.58,1]; n++; } } }
  Model.commit('缓入缓出');
  Model.emit('structure');
  E.toast('已应用缓入缓出（'+n+' 个关键帧）');
};
E.addLoopExpr=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  const path=UI.pickAnimatablePath(layer);
  layer.expr[path]='loopOut("cycle")';
  Model.commit('表达式');
  Particles.invalidateAll();
  Model.emit('structure');
  E.toast('已添加 loopOut("cycle") 到 '+path);
};
E.selectAllKeys=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  UI.tl.selKeys=[];
  for(const path of Object.keys(layer.kf)){
    const keys=layer.kf[path].keys;
    for(let i=0;i<keys.length;i++) UI.tl.selKeys.push({layerId:layer.id,path,index:i,key:keys[i]});
  }
  UI.drawTimeline();
};
E.clearKeys=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  layer.kf={};
  Model.commit('清除关键帧');
  Model.emit('structure');
};
E.deleteSelectedKeys=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  const byPath={};
  for(const s of UI.tl.selKeys){ if(s.layerId!==layer.id) continue; (byPath[s.path]=byPath[s.path]||[]).push(s.index); }
  for(const p of Object.keys(byPath)) Model.deleteKeys(layer,p,byPath[p]);
  UI.tl.selKeys=[];
  Model.commit('删除关键帧');
  Model.emit('structure');
};

/* ==================== 图层 / 合成 ==================== */
E.addLayer=function(type){
  const comp=Model.currentComp(); if(!comp){ E.newCompDialog(); return; }
  const names={shape:'形状',text:'文字',null:'空对象',adjust:'调整图层',precomp:'预合成',camera:'摄像机',light:'灯光',geometry3d:'三维几何',particle:'粒子',audio:'音色'};
  const opts={name:names[type]||type};
  if(type==='camera'){ opts.position=[comp.width/2,comp.height/2,-(comp.height/2)/Math.tan(35*Math.PI/360)]; opts.anchor=[0,0,0]; }
  const l=Model.createLayer(comp,type,opts);
  Model.select(comp.id,[l.id]);
  Model.commit('新建图层');
  Particles.invalidateAll();
  Model.emit('structure');
  return l;
};
E.addLayerMenu=function(){
  const items=[['shape','形状'],['text','文字'],['null','空对象'],['adjust','调整图层'],['geometry3d','三维几何'],['particle','粒子'],['camera','摄像机'],['light','灯光'],['audio','音色']];
  E.modal('新建图层',items.map(i=>'<div class="form-row"><button class="prop-btn" data-t="'+i[0]+'">'+i[1]+'</button></div>').join(''),(el)=>{
    el.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{ E.closeModal(); E.addLayer(b.dataset.t); });
  });
};
E.duplicateLayer=function(){
  for(const l of Model.selectedLayers()) Model.duplicateLayer(l);
  Model.commit('复制图层');
};
E.deleteLayer=function(){
  for(const l of Model.selectedLayers()) Model.deleteLayer(l);
  Model.commit('删除图层');
};
E.precompose=function(){
  const layers=Model.selectedLayers();
  if(layers.length) Model.precompose(layers);
};
E.newCompDialog=function(){
  E.modal('新建合成',`
    <div class="form-row"><label>名称</label><input type="text" id="nc-name" value="合成 ${Model.project?Model.project.comps.length+1:1}"></div>
    <div class="form-row"><label>宽度</label><input type="number" id="nc-w" value="1280"></div>
    <div class="form-row"><label>高度</label><input type="number" id="nc-h" value="720"></div>
    <div class="form-row"><label>帧率</label><input type="number" id="nc-fps" value="30"></div>
    <div class="form-row"><label>时长(秒)</label><input type="number" id="nc-dur" value="15"></div>
    <div class="hint">预设：1920×1080 / 1280×720 / 720×1280</div>
    <div class="form-row"><label>预设</label><select id="nc-preset">
      <option value="1280x720">1280×720</option><option value="1920x1080">1920×1080</option>
      <option value="720x1280">720×1280</option><option value="1080x1080">1080×1080</option></select></div>
  `,(el)=>{
    el.querySelector('#nc-preset').onchange=e2=>{
      const [w,h]=e2.target.value.split('x').map(Number);
      el.querySelector('#nc-w').value=w; el.querySelector('#nc-h').value=h;
    };
  },()=>{
    const name=$('#nc-name').value, w=+$('#nc-w').value||1280, h=+$('#nc-h').value||720, fps=+$('#nc-fps').value||30, dur=+$('#nc-dur').value||15;
    const c=Model.createComp({name,width:w,height:h,fps,duration:dur,workStart:0,workEnd:dur});
    Model.select(c.id,[]);
    Model.commit('新建合成');
    Model.emit('structure');
    E.openComp(c.id);
  });
};
E.compSettings=function(){
  const comp=Model.currentComp(); if(!comp) return;
  E.modal('合成设置 · '+comp.name,`
    <div class="form-row"><label>名称</label><input type="text" id="cs-name" value="${U.escapeHtml(comp.name)}"></div>
    <div class="form-row"><label>宽度</label><input type="number" id="cs-w" value="${comp.width}"></div>
    <div class="form-row"><label>高度</label><input type="number" id="cs-h" value="${comp.height}"></div>
    <div class="form-row"><label>帧率</label><input type="number" id="cs-fps" value="${comp.fps}"></div>
    <div class="form-row"><label>时长(秒)</label><input type="number" id="cs-dur" value="${comp.duration}"></div>
    <div class="form-row"><label>工作区起</label><input type="number" id="cs-ws" value="${comp.workStart}"></div>
    <div class="form-row"><label>工作区止</label><input type="number" id="cs-we" value="${comp.workEnd}"></div>
    <div class="form-row"><label>背景</label><input type="color" id="cs-bg" value="${U.rgb2hex(comp.bgColor[0],comp.bgColor[1],comp.bgColor[2])}"></div>
    <div class="form-row"><label>运动模糊</label><input type="checkbox" id="cs-mb" ${comp.motionBlur&&comp.motionBlur.enabled?'checked':''}></div>
    <div class="form-row"><label>快门角度</label><input type="number" id="cs-sh" value="${comp.motionBlur?comp.motionBlur.shutterAngle:180}"></div>
    <div class="form-row"><label>采样数</label><input type="number" id="cs-samp" value="${comp.motionBlur?comp.motionBlur.samples:4}"></div>
  `,null,()=>{
    comp.name=$('#cs-name').value||comp.name;
    comp.width=+$('#cs-w').value||comp.width;
    comp.height=+$('#cs-h').value||comp.height;
    comp.fps=+$('#cs-fps').value||comp.fps;
    comp.duration=+$('#cs-dur').value||comp.duration;
    comp.workStart=+$('#cs-ws').value||0;
    comp.workEnd=+$('#cs-we').value||comp.duration;
    comp.bgColor=U.hex2rgb($('#cs-bg').value);
    if(!comp.motionBlur) comp.motionBlur={};
    comp.motionBlur.enabled=$('#cs-mb').checked;
    comp.motionBlur.shutterAngle=+$('#cs-sh').value||180;
    comp.motionBlur.samples=+$('#cs-samp').value||4;
    Model.commit('合成设置');
    Model.emit('structure');
  });
};
E.addFieldDialog=function(){
  const comp=Model.currentComp(); if(!comp) return;
  if(!comp.fields) comp.fields=[];
  comp.fields.push(Geo.makeField({}));
  Particles.invalidateAll();
  Model.commit('添加场');
  Model.emit('structure');
};
E.openComp=function(id){
  Model.select(id,[]);
  E.time=0;
  Particles.invalidateAll();
  Render.fitView(1); E.zoomLevel=1;
  Model.emit('structure');
  Model.emit('time');
};
E.editPath=function(layer,index){
  E.editPathLayer=layer; E.editPathIndex=index;
};
E.editTextLayer=function(layer){
  E.modal('编辑文字',`<div class="form-row"><label>内容</label><textarea id="et-text" class="prop-text" style="width:280px">${U.escapeHtml(layer.values['text'].source||'')}</textarea></div>`,null,()=>{
    layer.values['text'].source=$('#et-text').value;
    Model.commit('编辑文字');
    Particles.invalidateAll();
    Model.emit('structure');
  });
};
E.editTextAt=function(cx,cy){
  const comp=Model.currentComp();
  const hit=E.hitTest(comp,E.time,cx,cy);
  if(hit&&hit.type==='text'){ E.editTextLayer(hit); return; }
  const l=Model.createLayer(comp,'text',{name:'文字',position:[cx,cy,0],anchor:[0,0,0]});
  l.values['text'].source='文字';
  Model.select(comp.id,[l.id]);
  Model.commit('新建文字');
  Model.emit('structure');
  E.editTextLayer(l);
};
E.addEffect=function(type){
  const layer=Model.selectedLayers()[0];
  if(!layer){ E.toast('先选择一个图层'); return; }
  const def=Composite.EFFECT_DEFS[type]; if(!def) return;
  if(!layer.effects) layer.effects=[];
  const params={};
  for(const p of def.params) params[p.p]=U.deepClone(p.def);
  layer.effects.push({id:U.uid('fx'),type,params,enabled:true});
  Model.commit('添加效果');
  Model.emit('structure');
};

/* ==================== 工程 ==================== */
E.newProject=function(){
  Model.createProject('未命名工程');
  Model.initHistory();
  E.time=0;
  Model.emit('structure');
};
E.saveProject=function(){
  Model.saveLocal();
  Model.exportFile();
  E.toast('工程已保存');
};
E.openFile=function(e){
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ Model.loadJSON(r.result); Model.initHistory(); E.time=0; Model.emit('structure'); Model.emit('time'); E.toast('已打开工程'); }catch(err){ alert('无法打开工程: '+err.message); } };
  r.readAsText(f);
  e.target.value='';
};
E.undo=function(){ if(Model.undo()) E.toast('撤销'); Particles.invalidateAll(); };
E.redo=function(){ if(Model.redo()) E.toast('重做'); Particles.invalidateAll(); };

/* ==================== 快捷键 ==================== */
E.bindKeys=function(){
  window.addEventListener('keydown',e=>{
    if(E.isTyping()) return;
    const k=e.key;
    if(e.ctrlKey||e.metaKey){
      if(k==='z'||k==='Z'){ e.preventDefault(); E.undo(); return; }
      if(k==='y'||k==='Y'){ e.preventDefault(); E.redo(); return; }
      if(k==='s'||k==='S'){ e.preventDefault(); E.saveProject(); return; }
      if(k==='d'||k==='D'){ e.preventDefault(); E.duplicateLayer(); return; }
      if(e.shiftKey&&(k==='c'||k==='C')){ e.preventDefault(); E.precompose(); return; }
      if(k==='c'||k==='C'){ E.copyKeys(); return; }
      if(k==='v'||k==='V'){ E.pasteKeys(); return; }
      return;
    }
    if(k===' '){ e.preventDefault(); E.togglePlay(); }
    else if(k==='F9'){ e.preventDefault(); E.easyEase(); }
    else if(k==='F6'){ E.addKeyToSelected(); }
    else if(k==='Delete'||k==='Backspace'){ E.deleteSelectedKeys(); }
    else if(k==='ArrowLeft'){ e.preventDefault(); E.stepFrame(-1); }
    else if(k==='ArrowRight'){ e.preventDefault(); E.stepFrame(1); }
    else if(k==='ArrowUp'){ e.preventDefault(); E.jumpPrevKey(); }
    else if(k==='ArrowDown'){ e.preventDefault(); E.jumpNextKey(); }
    else if(k==='v'||k==='V') E.setTool('select');
    else if(k==='h'||k==='H') E.setTool('hand');
    else if(k==='z'||k==='Z') E.setTool('zoom');
    else if(k==='y'||k==='Y') E.setTool('anchor');
    else if(k==='w'||k==='W') E.setTool('rotate');
    else if(k==='e'||k==='E') E.setTool('scale');
    else if(k==='g'||k==='G') E.setTool('pen');
    else if(k==='t'||k==='T') E.setTool('text');
    else if(k==='l'||k==='L'){ E.loop=!E.loop; $('#btn-loop').classList.toggle('active',E.loop); }
    else if(k==='+'||k==='=') E.zoom(1.2);
    else if(k==='-'||k==='_') E.zoom(1/1.2);
    else if(k==='Escape'){ E.editPathLayer=null; E.closeModal(); E.drawOverlay(); }
    else if(k==='Enter'&&E.penPath){ E.penPath=null; E.penPathLayer=null; }
  });
};
E.copyKeys=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  E._clip=JSON.stringify(layer.kf);
  E.toast('已复制关键帧');
};
E.pasteKeys=function(){
  const layer=Model.selectedLayers()[0]; if(!layer||!E._clip) return;
  layer.kf=JSON.parse(E._clip);
  Model.commit('粘贴关键帧');
  Model.emit('structure');
};
E.jumpPrevKey=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  let best=null;
  for(const p of Object.keys(layer.kf)) for(const k of layer.kf[p].keys){ if(k.t<E.time-0.001&&(!best||k.t>best.t)) best=k; }
  if(best) E.setTime(best.t);
};
E.jumpNextKey=function(){
  const layer=Model.selectedLayers()[0]; if(!layer) return;
  let best=null;
  for(const p of Object.keys(layer.kf)) for(const k of layer.kf[p].keys){ if(k.t>E.time+0.001&&(!best||k.t<best.t)) best=k; }
  if(best) E.setTime(best.t);
};

/* ==================== 弹窗 ==================== */
E.modal=function(title,html,after,onOk){
  const mask=$('#modal-mask'), m=$('#modal');
  m.innerHTML=`<div class="modal-head"><span>${title}</span><span class="m-close">✕</span></div><div class="modal-body">${html}</div><div class="modal-foot"><button class="prop-btn" id="m-cancel">取消</button><button class="prop-btn on" id="m-ok">确定</button></div>`;
  mask.classList.remove('hidden');
  m.querySelector('.m-close').onclick=E.closeModal;
  m.querySelector('#m-cancel').onclick=E.closeModal;
  m.querySelector('#m-ok').onclick=()=>{ if(onOk) onOk(); E.closeModal(); };
  if(after) after(m);
};
E.closeModal=function(){ $('#modal-mask').classList.add('hidden'); };
E.placeholder=function(){ E.toast('该功能为占位'); };
E.toast=function(msg){ UI.status(msg); clearTimeout(E._tt); E._tt=setTimeout(()=>UI.status('就绪'),4000); };
E.showShortcuts=function(){
  E.modal('快捷键',`<div style="line-height:1.9">
  空格 播放/暂停 · ←/→ 逐帧 · ↑/↓ 跳到关键帧<br>
  V 选择 · H 手 · Z 缩放 · Y 锚点 · W 旋转 · E 缩放图层<br>
  G 钢笔 · T 文字 · F6 添加关键帧 · F9 缓入缓出 · Delete 删除关键帧<br>
  Ctrl+Z 撤销 · Ctrl+Y 重做 · Ctrl+S 保存 · Ctrl+D 复制图层<br>
  Ctrl+Shift+C 预合成 · Ctrl+C/V 复制粘贴关键帧 · L 循环 · +/- 缩放视图<br>
  Esc 退出编辑 · 回车 结束钢笔</div>`);
};
E.showAbout=function(){
  E.modal('关于',`<div style="line-height:1.8">锻 · 动效设计编辑器<br>以合成与图层骨架的动效设计工具，支持关键帧、曲线、表达式、程序节点、三维实体、粒子与碰撞、蒙版效果、预合成与运动模糊。<br>内置「锻字」15 秒示例。</div>`);
};

/* ==================== 导出接口 ==================== */
E.testExport=function(){
  if(!window.videoExport){ E.toast('导出接口未就绪'); return; }
  E.toast('runs: '+JSON.stringify(window.videoExport.runs));
};

})();
