/* 铸帧 ForgeFrame · 时间轴 */
"use strict";
(function(){
const FF=window.FF, app=FF.app, Eval=FF.Eval, clamp=FF.util.clamp;
let cv, ctx2d, dpr=1;
const st={
  pxPerSec:80, scrollX:0, scrollY:0,
  headerW:252, rulerH:30, rowH:26, propRowH:20,
  expanded:new Set(),
  rows:[], // 布局缓存
  drag:null,
  snap:true,
};
const TYPE_COLORS={shape:'#ffb347',text:'#4fd2ff',null:'#9aa4bb',adjustment:'#9fe84f',
  precomp:'#ff5ad1',camera:'#5aa7ff',light:'#ffc247',geo:'#ff7a29',particles:'#ff5470',audio:'#57d98a',field:'#3d7bff'};

function init(){
  cv=document.getElementById('tlCanvas');
  ctx2d=cv.getContext('2d');
  wire();
  document.getElementById('tlZoom').addEventListener('input',e=>{
    st.pxPerSec=20+Math.pow(e.target.value/100,1.6)*900;
    draw();
  });
  document.getElementById('tlZoomIn').onclick=()=>{ st.pxPerSec*=1.4; draw(); };
  document.getElementById('tlZoomOut').onclick=()=>{ st.pxPerSec/=1.4; draw(); };
  document.getElementById('tlSnap').onclick=e=>{
    st.snap=!st.snap;
    e.currentTarget.classList.toggle('on',st.snap);
  };
  document.getElementById('tlExpandAll').onclick=()=>{
    if(app.comp) for(const l of app.comp.layers) st.expanded.add(l.id);
    draw();
  };
  document.getElementById('tlCollapseAll').onclick=()=>{ st.expanded.clear(); draw(); };
}
function reset(){ st.scrollX=0; st.scrollY=0; st.expanded.clear(); }
function resize(){
  const r=cv.parentElement.getBoundingClientRect();
  dpr=Math.min(window.devicePixelRatio||1,2);
  cv.width=Math.max(50,r.width*dpr);
  cv.height=Math.max(50,r.height*dpr);
  cv.style.width=r.width+'px';
  cv.style.height=r.height+'px';
}
function timeToX(t){ return st.headerW+(t*st.pxPerSec-st.scrollX); }
function xToTime(x){ return (x-st.headerW+st.scrollX)/st.pxPerSec; }
function snapTime(t,ignore){
  if(!st.snap||!app.comp) return t;
  const cands=[app.time,app.comp.workArea[0],app.comp.workArea[1],0];
  const frame=Math.round(t*app.comp.fps)/app.comp.fps;
  cands.push(frame);
  for(const l of app.comp.layers){
    cands.push(l.inPoint,l.outPoint);
    for(const {prop} of FF.allProps(l)){
      for(const k of prop.keys||[]){
        if(ignore&&ignore.has(l.id+':'+k.t)) continue;
        cands.push(k.t);
      }
    }
  }
  let best=t, bd=6/st.pxPerSec;
  for(const c of cands){
    if(Math.abs(c-t)<bd){ bd=Math.abs(c-t); best=c; }
  }
  return best;
}
function buildRows(){
  const rows=[];
  if(!app.comp) return rows;
  let y=st.rulerH+16;
  for(const l of app.comp.layers){
    rows.push({type:'layer',layer:l,y,h:st.rowH});
    y+=st.rowH;
    if(st.expanded.has(l.id)){
      const props=FF.allProps(l).filter(({prop})=>prop.keys.length>0||['transform.position','transform.scale','transform.rotation','transform.opacity','transform.rotationX','transform.rotationY','transform.rotationZ'].includes(path0(prop,l)));
      const seen=new Set();
      for(const {path,prop} of FF.allProps(l)){
        if(seen.has(path)) continue; seen.add(path);
        const isTransform=path.startsWith('transform.');
        if(prop.keys.length>0||isTransform){
          rows.push({type:'prop',layer:l,path,prop,y,h:st.propRowH});
          y+=st.propRowH;
        }
      }
    }
  }
  return rows;
}
function path0(prop,l){
  for(const {path,prop:p} of FF.allProps(l)) if(p===prop) return path;
  return '';
}
const PROP_LABELS={anchor:'锚点',position:'位置',scale:'缩放',rotation:'旋转',opacity:'不透明度',
  rotationX:'X旋转',rotationY:'Y旋转',rotationZ:'Z旋转'};
function propLabel(path){
  const parts=path.split('.');
  const last=parts[parts.length-1];
  if(parts[0]==='transform') return PROP_LABELS[last]||last;
  const names={depth:'挤出深度',bevel:'倒角',bend:'弯曲',twist:'扭转',write:'书写',start:'起点',end:'终点',
    copies:'副本',rate:'速率',speed:'速度',life:'寿命',fov:'视角',intensity:'强度',radius:'半径',
    hue:'色相',saturation:'饱和度',lightness:'亮度',threshold:'阈值',distance:'距离',angle:'角度',
    softness:'柔和',feather:'羽化',content:'内容',fontSize:'字号',baseColor:'基础色',metallic:'金属度',
    roughness:'粗糙度',emissive:'发光',emissiveStrength:'发光强度',focusDistance:'对焦',aperture:'光圈',
    strength:'强度',freq:'频率',amp:'幅度',decay:'衰减',tone:'音调',noise:'噪声',filter:'滤波',
    sizeStart:'初大小',sizeEnd:'末大小',gravity:'重力',drag:'阻力',restitution:'弹性',friction:'摩擦'};
  return (parts[0]==='transform'?'':parts[0]+'·')+(names[last]||last);
}
/* ---------- 绘制 ---------- */
function draw(){
  resize();
  const W=cv.width/dpr, H=cv.height/dpr;
  ctx2d.setTransform(dpr,0,0,dpr,0,0);
  ctx2d.clearRect(0,0,W,H);
  ctx2d.fillStyle='#10141d';
  ctx2d.fillRect(0,0,W,H);
  if(!app.comp){
    ctx2d.fillStyle='#5d6880';
    ctx2d.font='12px "Microsoft YaHei"';
    ctx2d.fillText('无合成',20,40);
    return;
  }
  const c=app.comp;
  st.rows=buildRows();
  const totalH=st.rows.length?st.rows[st.rows.length-1].y+st.rows[st.rows.length-1].h:st.rulerH+40;
  st.scrollY=clamp(st.scrollY,0,Math.max(0,totalH-H+30));
  // 时间网格
  const t0=xToTime(st.headerW), t1=xToTime(W);
  let step=1;
  const steps=[0.1,0.2,0.5,1,2,5,10,30,60];
  for(const s of steps){ if(s*st.pxPerSec>=64){ step=s; break; } step=s; }
  ctx2d.font='10px Consolas,monospace';
  for(let t=Math.floor(t0/step)*step;t<=t1;t+=step){
    const x=timeToX(t);
    if(x<st.headerW) continue;
    ctx2d.strokeStyle='rgba(255,255,255,0.045)';
    ctx2d.beginPath(); ctx2d.moveTo(x,st.rulerH); ctx2d.lineTo(x,H); ctx2d.stroke();
    ctx2d.fillStyle='#5d6880';
    ctx2d.fillText(t.toFixed(step<1?1:0)+'s',x+3,12);
    // 帧刻度
    if(st.pxPerSec/c.fps>7){
      for(let f=1;f<c.fps&&t+f/c.fps<t1;f++){
        const fx=timeToX(t+f/c.fps);
        ctx2d.strokeStyle='rgba(255,255,255,0.06)';
        ctx2d.beginPath(); ctx2d.moveTo(fx,st.rulerH-6); ctx2d.lineTo(fx,st.rulerH); ctx2d.stroke();
      }
    }
  }
  // 工作区
  const waX0=timeToX(c.workArea[0]), waX1=timeToX(c.workArea[1]);
  ctx2d.fillStyle='rgba(255,122,41,0.10)';
  ctx2d.fillRect(Math.max(st.headerW,waX0),st.rulerH-8,Math.min(W,waX1)-Math.max(st.headerW,waX0),8);
  ctx2d.fillStyle='#ff7a29';
  ctx2d.fillRect(waX0-3,st.rulerH-10,6,12);
  ctx2d.fillRect(waX1-3,st.rulerH-10,6,12);
  // 行
  ctx2d.save();
  ctx2d.beginPath(); ctx2d.rect(0,st.rulerH,W,H-st.rulerH); ctx2d.clip();
  ctx2d.translate(0,-st.scrollY);
  for(const row of st.rows){
    const y=row.y;
    if(y-st.scrollY>H+30||y-st.scrollY<-40) continue;
    const l=row.layer;
    const selected=app.selection.includes(l.id);
    if(row.type==='layer'){
      if(selected){ ctx2d.fillStyle='rgba(255,122,41,0.08)'; ctx2d.fillRect(0,y,W,st.rowH); }
      ctx2d.strokeStyle='rgba(255,255,255,0.04)';
      ctx2d.beginPath(); ctx2d.moveTo(0,y+st.rowH); ctx2d.lineTo(W,y+st.rowH); ctx2d.stroke();
      // 头部
      ctx2d.fillStyle='#161b27';
      ctx2d.fillRect(0,y,st.headerW,st.rowH);
      ctx2d.fillStyle=TYPE_COLORS[l.type]||'#9aa4bb';
      ctx2d.fillRect(0,y,3,st.rowH);
      // 开关
      ctx2d.font='11px "Segoe UI"';
      ctx2d.fillStyle=l.visible?'#e9edf6':'#3d465c';
      ctx2d.fillText('👁',8,y+17);
      ctx2d.fillStyle=l.locked?'#ffc247':'#3d465c';
      ctx2d.fillText('🔒',26,y+17);
      ctx2d.fillStyle=l.motionBlur?'#4fd2ff':'#3d465c';
      ctx2d.fillText('◉',44,y+17);
      ctx2d.fillStyle=l.threeD?'#9fe84f':'#3d465c';
      ctx2d.font='9px Consolas';
      ctx2d.fillText('3D',58,y+17);
      // 名称
      ctx2d.font='12px "Microsoft YaHei"';
      ctx2d.fillStyle=l.locked?'#5d6880':(selected?'#ffb347':'#e9edf6');
      const nameX=78;
      ctx2d.fillText((st.expanded.has(l.id)?'▾ ':'▸ ')+l.name,nameX,y+17, st.headerW-nameX-46);
      if(l.parent){
        const p=FF.findLayer(c,l.parent);
        ctx2d.fillStyle='#5d6880'; ctx2d.font='9px "Microsoft YaHei"';
        ctx2d.fillText('↳'+(p?p.name:'?'),st.headerW-42,y+17,40);
      }
      // 图层条
      const inT=Math.max(0,l.inPoint), outT=Math.min(c.duration,l.outPoint>1e8?c.duration:l.outPoint);
      const bx0=timeToX(inT), bx1=timeToX(outT);
      const col=TYPE_COLORS[l.type]||'#9aa4bb';
      const grd=ctx2d.createLinearGradient(bx0,y,bx1,y);
      grd.addColorStop(0,col+'55'); grd.addColorStop(0.5,col+'33'); grd.addColorStop(1,col+'55');
      ctx2d.fillStyle=grd;
      roundRect(ctx2d,bx0,y+5,Math.max(4,bx1-bx0),st.rowH-10,4);
      ctx2d.fill();
      ctx2d.strokeStyle=col+(selected?'':'88');
      ctx2d.lineWidth=1;
      roundRect(ctx2d,bx0,y+5,Math.max(4,bx1-bx0),st.rowH-10,4);
      ctx2d.stroke();
      // 条上名称
      ctx2d.fillStyle='rgba(233,237,246,0.75)';
      ctx2d.font='10px "Microsoft YaHei"';
      ctx2d.save();
      ctx2d.beginPath(); ctx2d.rect(bx0+4,y,bx1-bx0-8,st.rowH); ctx2d.clip();
      let label=l.name;
      if(l.type==='precomp'){ const sub=FF.findComp(app.project,l.compId); label+=' ▸ '+(sub?sub.name:'?'); }
      ctx2d.fillText(label,bx0+8,y+17);
      ctx2d.restore();
      // 音频事件
      if(l.type==='audio'&&l.audio.events){
        ctx2d.fillStyle='#57d98a';
        for(const ev of l.audio.events){
          const ex=timeToX(ev.t);
          ctx2d.fillRect(ex-1,y+7,2,st.rowH-14);
        }
      }
      // 入出点手柄
      ctx2d.fillStyle=col;
      ctx2d.fillRect(bx0-1,y+5,3,st.rowH-10);
      ctx2d.fillRect(bx1-2,y+5,3,st.rowH-10);
    } else {
      // 属性行
      ctx2d.fillStyle='#0d1119';
      ctx2d.fillRect(0,y,st.headerW,st.propRowH);
      const isSelProp=app.selProp&&app.selProp.layerId===l.id&&app.selProp.path===row.path;
      ctx2d.fillStyle=isSelProp?'#4fd2ff':'#77839c';
      ctx2d.font='10px "Microsoft YaHei"';
      ctx2d.fillText('  '+propLabel(row.path)+(row.prop.expr&&row.prop.exprOn?' fx':''),84,y+14,st.headerW-90);
      ctx2d.strokeStyle='rgba(255,255,255,0.03)';
      ctx2d.beginPath(); ctx2d.moveTo(st.headerW,y+st.propRowH); ctx2d.lineTo(W,y+st.propRowH); ctx2d.stroke();
      // 关键帧连线
      const keys=row.prop.keys||[];
      if(keys.length>1){
        ctx2d.strokeStyle='rgba(255,179,71,0.25)';
        ctx2d.beginPath();
        ctx2d.moveTo(timeToX(keys[0].t),y+st.propRowH/2);
        ctx2d.lineTo(timeToX(keys[keys.length-1].t),y+st.propRowH/2);
        ctx2d.stroke();
      }
      for(const k of keys){
        drawKey(timeToX(k.t),y+st.propRowH/2,l.id,row.path,k);
      }
    }
  }
  ctx2d.restore();
  // 头部列分隔
  ctx2d.fillStyle='#12161f';
  ctx2d.fillRect(st.headerW-1,0,2,H);
  // 播放头
  const px=timeToX(app.time);
  if(px>=st.headerW-2&&px<=W+2){
    ctx2d.strokeStyle='#ff7a29';
    ctx2d.lineWidth=1.5;
    ctx2d.beginPath(); ctx2d.moveTo(px,4); ctx2d.lineTo(px,H); ctx2d.stroke();
    ctx2d.fillStyle='#ff7a29';
    ctx2d.beginPath();
    ctx2d.moveTo(px-6,4); ctx2d.lineTo(px+6,4); ctx2d.lineTo(px+6,14); ctx2d.lineTo(px,20); ctx2d.lineTo(px-6,14);
    ctx2d.closePath(); ctx2d.fill();
    ctx2d.fillStyle='#1a0d04';
    ctx2d.font='8px Consolas';
  }
  // 框选
  if(st.drag&&st.drag.type==='marquee'){
    const d=st.drag;
    ctx2d.strokeStyle='#4fd2ff';
    ctx2d.fillStyle='rgba(79,210,255,0.08)';
    const x=Math.min(d.x0,d.x1), y=Math.min(d.y0,d.y1), w=Math.abs(d.x1-d.x0), h=Math.abs(d.y1-d.y0);
    ctx2d.fillRect(x,y,w,h); ctx2d.strokeRect(x,y,w,h);
  }
}
function roundRect(c,x,y,w,h,r){
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
function drawKey(x,y,layerId,path,k){
  const sel=app.selKeys.some(s=>s.layerId===layerId&&s.path===path&&Math.abs(s.t-k.t)<1e-4);
  const r=sel?6:4.5;
  ctx2d.save();
  ctx2d.translate(x,y);
  ctx2d.rotate(Math.PI/4);
  let col='#ffb347';
  if(k.i==='hold') col='#ff5470';
  else if(k.i==='lin') col='#9aa4bb';
  if(sel) col='#ff7a29';
  ctx2d.fillStyle=col;
  ctx2d.fillRect(-r/1.4,-r/1.4,r*1.42,r*1.42);
  if(sel){ ctx2d.strokeStyle='#fff'; ctx2d.lineWidth=1; ctx2d.strokeRect(-r/1.4,-r/1.4,r*1.42,r*1.42); }
  ctx2d.restore();
}
/* ---------- 命中 ---------- */
function hitTest(mx,my){
  if(my<st.rulerH+16){
    if(Math.abs(mx-timeToX(app.comp.workArea[0]))<7) return {type:'wa',edge:0};
    if(Math.abs(mx-timeToX(app.comp.workArea[1]))<7) return {type:'wa',edge:1};
    return {type:'ruler'};
  }
  const y=my+st.scrollY;
  for(const row of st.rows){
    if(y>=row.y&&y<row.y+row.h){
      if(mx<st.headerW){
        if(row.type==='layer'){
          if(mx<24) return {type:'switch',layer:row.layer,which:'visible'};
          if(mx<42) return {type:'switch',layer:row.layer,which:'locked'};
          if(mx<56) return {type:'switch',layer:row.layer,which:'motionBlur'};
          if(mx<76) return {type:'switch',layer:row.layer,which:'threeD'};
          return {type:'layerHead',layer:row.layer};
        }
        return {type:'propHead',row};
      }
      if(row.type==='prop'){
        for(const k of row.prop.keys||[]){
          if(Math.abs(mx-timeToX(k.t))<7) return {type:'key',layer:row.layer,path:row.path,k,row};
        }
        return {type:'propArea',row};
      }
      const l=row.layer;
      const inT=Math.max(0,l.inPoint), outT=Math.min(app.comp.duration,l.outPoint>1e8?app.comp.duration:l.outPoint);
      if(Math.abs(mx-timeToX(inT))<6) return {type:'barEdge',layer:l,edge:'in'};
      if(Math.abs(mx-timeToX(outT))<6) return {type:'barEdge',layer:l,edge:'out'};
      if(mx>timeToX(inT)&&mx<timeToX(outT)) return {type:'bar',layer:l};
      return {type:'empty',row};
    }
  }
  return {type:'void'};
}
/* ---------- 交互 ---------- */
function wire(){
  let pointer=null;
  cv.addEventListener('pointerdown',e=>{
    if(!app.comp) return;
    cv.setPointerCapture(e.pointerId);
    const r=cv.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    const hit=hitTest(mx,my);
    pointer={mx,my,hit,btn:e.button,shift:e.shiftKey,alt:e.altKey,moved:false};
    if(e.button===2) return;
    if(hit.type==='ruler'||hit.type==='wa'){
      if(hit.type==='wa'){
        pointer.drag={type:'wa',edge:hit.edge};
        FF.app.beginDrag();
      } else {
        pointer.drag={type:'scrub'};
        FF.app.pause();
        FF.app.seekAndSync(clamp(xToTime(mx),0,app.comp.duration));
      }
    } else if(hit.type==='switch'){
      const l=hit.layer;
      FF.app.transact('切换'+hit.which,()=>{ l[hit.which]=!l[hit.which]; });
      FF.app.refreshAll();
    } else if(hit.type==='layerHead'){
      if(e.shiftKey){
        if(app.selection.includes(hit.layer.id)) app.selection=app.selection.filter(x=>x!==hit.layer.id);
        else app.selection.push(hit.layer.id);
      } else app.selection=[hit.layer.id];
      app.selProp=null;
      pointer.drag={type:'maybeReorder',layer:hit.layer,y0:my};
      FF.app.refreshAll();
    } else if(hit.type==='propHead'){
      app.selection=[hit.row.layer.id];
      app.selProp={layerId:hit.row.layer.id,path:hit.row.path};
      FF.app.refreshAll();
      if(app.bottomView==='curve') FF.Curves.draw();
    } else if(hit.type==='key'){
      const sk={layerId:hit.layer.id,path:hit.path,t:hit.k.t};
      const already=app.selKeys.some(s=>s.layerId===sk.layerId&&s.path===sk.path&&Math.abs(s.t-sk.t)<1e-4);
      if(e.shiftKey){
        if(already) app.selKeys=app.selKeys.filter(s=>!(s.layerId===sk.layerId&&s.path===sk.path&&Math.abs(s.t-sk.t)<1e-4));
        else app.selKeys.push(sk);
      } else if(!already){ app.selKeys=[sk]; }
      app.selection=[hit.layer.id];
      app.selProp={layerId:hit.layer.id,path:hit.path};
      const orig=app.selKeys.map(s=>{
        const l=FF.findLayer(app.comp,s.layerId);
        const p=FF.getProp(l,s.path);
        const k=p.keys.find(x=>Math.abs(x.t-s.t)<1e-4);
        return {...s,k};
      }).filter(x=>x.k);
      pointer.drag={type:'keys',orig,x0:mx,stretch:e.altKey,anchor:orig.length?orig[0].k.t:0};
      FF.app.beginDrag();
      FF.app.refreshAll();
    } else if(hit.type==='propArea'){
      app.selection=[hit.row.layer.id];
      app.selProp={layerId:hit.row.layer.id,path:hit.row.path};
      pointer.drag={type:'marquee',x0:mx,y0:my,x1:mx,y1:my};
      if(!e.shiftKey) app.selKeys=[];
      FF.app.refreshAll();
    } else if(hit.type==='barEdge'){
      pointer.drag={type:'trim',layer:hit.layer,edge:hit.edge};
      FF.app.beginDrag();
    } else if(hit.type==='bar'){
      if(!app.selection.includes(hit.layer.id)) app.selection=[hit.layer.id];
      pointer.drag={type:'slip',layer:hit.layer,t0:xToTime(mx),
        origIn:hit.layer.inPoint,origOut:hit.layer.outPoint,origStart:hit.layer.startTime};
      FF.app.beginDrag();
      FF.app.refreshAll();
    } else if(hit.type==='empty'||hit.type==='void'){
      pointer.drag={type:'marquee',x0:mx,y0:my,x1:mx,y1:my};
      if(!e.shiftKey){ app.selKeys=[]; }
    }
  });
  cv.addEventListener('pointermove',e=>{
    const r=cv.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    // 光标
    if(!pointer){
      const hit=app.comp?hitTest(mx,my):{type:'void'};
      cv.style.cursor=hit.type==='key'?'pointer':
        hit.type==='barEdge'||hit.type==='wa'?'ew-resize':
        hit.type==='ruler'?'col-resize':
        hit.type==='bar'?'grab':'default';
      return;
    }
    const d=pointer.drag;
    if(!d) return;
    pointer.moved=true;
    if(d.type==='scrub'){
      FF.app.seekAndSync(clamp(xToTime(mx),0,app.comp.duration));
    } else if(d.type==='wa'){
      const t=clamp(snapTime(xToTime(mx)),0,app.comp.duration);
      if(d.edge===0) app.comp.workArea[0]=Math.min(t,app.comp.workArea[1]-0.1);
      else app.comp.workArea[1]=Math.max(t,app.comp.workArea[0]+0.1);
      FF.app.invalidate();
    } else if(d.type==='keys'){
      const dt=(mx-d.x0)/st.pxPerSec;
      const ignore=new Set(d.orig.map(o=>o.layerId+':'+o.k.t));
      if(d.stretch&&d.orig.length>1){
        const anchor=d.anchor;
        const cur=anchor+dt;
        let far=d.orig[0];
        for(const o of d.orig) if(Math.abs(o.k.t-anchor)>Math.abs(far.k.t-anchor)) far=o;
        const denom=(far.k.t-anchor)||1e-6;
        const scale=clamp((cur-anchor)/denom,-8,8);
        for(const o of d.orig){
          o.k.t=Math.max(0,anchor+(o.t-anchor)*scale);
        }
      } else {
        let snapped=null;
        for(const o of d.orig){
          let nt=Math.max(0,o.t+dt);
          nt=snapTime(nt,ignore);
          if(snapped===null) snapped=nt-o.t;
          o.k.t=Math.max(0,o.t+(snapped!==null?snapped:dt));
        }
      }
      for(const l of app.comp.layers){
        for(const {prop} of FF.allProps(l)) prop.keys.sort((a,b)=>a.t-b.t);
      }
      FF.app.invalidate();
    } else if(d.type==='trim'){
      const t=clamp(snapTime(xToTime(mx)),0,app.comp.duration);
      if(d.edge==='in') d.layer.inPoint=Math.min(t,d.layer.outPoint-0.05);
      else d.layer.outPoint=Math.max(t,d.layer.inPoint+0.05);
      FF.app.invalidate();
    } else if(d.type==='slip'){
      const dt=snapTime(xToTime(mx))-snapTime(d.t0);
      d.layer.inPoint=Math.max(0,d.origIn+dt);
      d.layer.outPoint=d.origOut>1e8?1e9:d.origOut+dt;
      d.layer.startTime=d.origStart+dt;
      FF.app.invalidate();
    } else if(d.type==='marquee'){
      d.x1=mx; d.y1=my;
      // 实时框选
      const x0=Math.min(d.x0,d.x1), x1=Math.max(d.x0,d.x1);
      const y0=Math.min(d.y0,d.y1)+st.scrollY, y1=Math.max(d.y0,d.y1)+st.scrollY;
      const sel=[];
      for(const row of st.rows){
        if(row.type!=='prop') continue;
        const ky=row.y+row.h/2;
        if(ky<y0||ky>y1) continue;
        for(const k of row.prop.keys||[]){
          const kx=timeToX(k.t);
          if(kx>=x0&&kx<=x1) sel.push({layerId:row.layer.id,path:row.path,t:k.t});
        }
      }
      app.selKeys=sel;
      draw();
    } else if(d.type==='maybeReorder'){
      if(Math.abs(my-d.y0)>st.rowH*0.8){
        const dir=my>d.y0?1:-1;
        FF.moveLayer(app.comp,d.layer.id,dir);
        d.y0=my;
        FF.app.invalidate();
        draw();
      }
    }
  });
  cv.addEventListener('pointerup',e=>{
    if(!pointer) return;
    const d=pointer.drag;
    if(d){
      if(['wa','keys','trim','slip'].includes(d.type)) FF.app.endDrag({wa:'工作区',keys:'移动关键帧',trim:'裁剪',slip:'滑动图层'}[d.type]);
      if(d.type==='marquee'){ FF.app.refreshAll(); }
      if(d.type==='maybeReorder'&&!pointer.moved){
        // 单击头部：展开/收起
        if(st.expanded.has(d.layer.id)) st.expanded.delete(d.layer.id);
        else st.expanded.add(d.layer.id);
      }
      if(d.type==='maybeReorder'&&pointer.moved) FF.app.endDrag('图层排序');
    }
    pointer=null;
    FF.app.refreshAll();
  });
  cv.addEventListener('dblclick',e=>{
    const r=cv.getBoundingClientRect();
    const hit=hitTest(e.clientX-r.left,e.clientY-r.top);
    if(hit.type==='layerHead'){
      const l=hit.layer;
      FF.ui.modal({title:'重命名图层',fields:[{key:'name',label:'名称',value:l.name}],onOk:v=>{
        FF.app.transact('重命名',()=>{l.name=v.name||l.name;});
        FF.app.refreshAll();
      }});
    } else if(hit.type==='bar'&&hit.layer.type==='precomp'){
      FF.app.setComp(hit.layer.compId);
    }
  });
  cv.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(!app.comp) return;
    const r=cv.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    const hit=hitTest(mx,my);
    if(hit.type==='key'){
      const k=hit.k;
      const sk={layerId:hit.layer.id,path:hit.path,t:k.t};
      if(!app.selKeys.some(s=>s.layerId===sk.layerId&&s.path===sk.path&&Math.abs(s.t-sk.t)<1e-4)) app.selKeys=[sk];
      FF.ui.ctxMenu(e.clientX,e.clientY,[
        {label:'缓入缓出 (F9)',fn:()=>FF.easeSelectedKeys()},
        {label:'线性插值',fn:()=>setKeyInterp('lin')},
        {label:'贝塞尔插值',fn:()=>setKeyInterp('bez')},
        {label:'定格',fn:()=>setKeyInterp('hold')},
        '-',
        {label:'复制关键帧',fn:()=>{ FF.app.setTime(k.t); copyKeysLocal(); }},
        {label:'删除关键帧',fn:()=>FF.app.deleteSelectedKeys?FF.app.deleteSelectedKeys():null,danger:true},
      ]);
    } else if(hit.type==='layerHead'||hit.type==='bar'){
      const l=hit.layer;
      if(!app.selection.includes(l.id)) app.selection=[l.id];
      FF.ui.ctxMenu(e.clientX,e.clientY,[
        {label:'复制图层 (Ctrl+D)',fn:()=>FF.app.duplicateSelected()},
        {label:'预合成 (Ctrl+Shift+C)',fn:()=>FF.app.precompose()},
        {label:l.visible?'隐藏':'显示',fn:()=>{FF.app.transact('显示切换',()=>{l.visible=!l.visible;});FF.app.refreshAll();}},
        {label:'上移一层',fn:()=>{FF.app.transact('排序',()=>FF.moveLayer(app.comp,l.id,-1));FF.app.refreshAll();}},
        {label:'下移一层',fn:()=>{FF.app.transact('排序',()=>FF.moveLayer(app.comp,l.id,1));FF.app.refreshAll();}},
        '-',
        {label:'删除图层',fn:()=>FF.app.deleteSelected(),danger:true},
      ]);
    }
  });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey){
      const r=cv.getBoundingClientRect();
      const mx=e.clientX-r.left;
      const t=xToTime(mx);
      st.pxPerSec=clamp(st.pxPerSec*(e.deltaY<0?1.15:0.87),12,1600);
      st.scrollX=t*st.pxPerSec-(mx-st.headerW);
    } else if(e.shiftKey){
      st.scrollY+=e.deltaY;
    } else {
      st.scrollX+=e.deltaY+e.deltaX;
    }
    st.scrollX=Math.max(-st.headerW,st.scrollX);
    draw();
  },{passive:false});
}
function setKeyInterp(interp){
  FF.app.transact('关键帧插值',()=>{
    for(const sk of app.selKeys){
      const l=FF.findLayer(app.comp,sk.layerId);
      const p=FF.getProp(l,sk.path);
      const k=p.keys.find(x=>Math.abs(x.t-sk.t)<1e-4);
      if(k){ k.i=interp; if(interp==='bez'){ k.eo=[0.33,0.33]; k.ei=[0.33,0.33]; } }
    }
  });
  FF.app.refreshAll();
}
function copyKeysLocal(){
  FF.ui.toast('关键帧已复制（Ctrl+V 粘贴到当前时间）');
  const ev=new KeyboardEvent('keydown',{key:'c',ctrlKey:true});
  document.dispatchEvent(ev);
}
function moveSel(dir){
  if(!app.comp||!app.comp.layers.length) return;
  const idx=app.selection.length?app.comp.layers.findIndex(l=>l.id===app.selection[0]):-1;
  const ni=clamp(idx+dir,0,app.comp.layers.length-1);
  app.selection=[app.comp.layers[ni].id];
  FF.app.refreshAll();
}
FF.Timeline={init,draw,reset,moveSel,st};
})();
