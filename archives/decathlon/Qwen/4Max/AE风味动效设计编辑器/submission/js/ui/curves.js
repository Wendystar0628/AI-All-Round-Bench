/* 铸帧 ForgeFrame · 曲线编辑器：值曲线 / 速度曲线 / 表达式最终曲线 */
"use strict";
(function(){
const FF=window.FF, app=FF.app, Eval=FF.Eval, clamp=FF.util.lerp?FF.util.clamp:FF.util.clamp;
let cv,c2,dpr=1;
const st={mode:'value',zoom:1,panX:0,drag:null,vMin:0,vMax:1};
const COMP_COLORS=['#ff5470','#57d98a','#5aa7ff'];

function init(){
  cv=document.getElementById('cvCanvas');
  c2=cv.getContext('2d');
  document.getElementById('cvValue').onclick=e=>{ st.mode='value'; e.target.classList.add('on'); document.getElementById('cvSpeed').classList.remove('on'); draw(); };
  document.getElementById('cvSpeed').onclick=e=>{ st.mode='speed'; e.target.classList.add('on'); document.getElementById('cvValue').classList.remove('on'); draw(); };
  wire();
}
function currentProp(){
  if(app.selProp){
    const l=FF.findLayer(app.comp,app.selProp.layerId);
    if(l){ const p=FF.getProp(l,app.selProp.path); if(p) return {layer:l,path:app.selProp.path,prop:p}; }
  }
  if(app.selKeys.length){
    const sk=app.selKeys[0];
    const l=FF.findLayer(app.comp,sk.layerId);
    if(l){ const p=FF.getProp(l,sk.path); if(p) return {layer:l,path:sk.path,prop:p}; }
  }
  if(app.selection.length){
    const l=FF.findLayer(app.comp,app.selection[0]);
    if(l) return {layer:l,path:'transform.position',prop:l.transform.position};
  }
  return null;
}
function dims(p){
  if(p.kind==='vec2') return 2;
  if(p.kind==='vec3') return 3;
  if(p.kind==='color') return 3;
  return 1;
}
function sampleVal(cur,t,compIdx,base){
  const ctx=Eval.frame(app.project,app.comp,t);
  let v;
  if(base) v=Eval.sampleKeys(cur.prop,t);
  else v=Eval.prop(ctx,cur.layer,cur.path,t);
  if(Array.isArray(v)) return v[compIdx]||0;
  return typeof v==='number'?v:0;
}
function draw(){
  const r=cv.parentElement.getBoundingClientRect();
  dpr=Math.min(window.devicePixelRatio||1,2);
  cv.width=Math.max(50,r.width*dpr); cv.height=Math.max(50,r.height*dpr);
  cv.style.width=r.width+'px'; cv.style.height=r.height+'px';
  c2.setTransform(dpr,0,0,dpr,0,0);
  const W=r.width,H=r.height;
  c2.fillStyle='#0d1119'; c2.fillRect(0,0,W,H);
  const cur=currentProp();
  const legend=document.getElementById('cvLegend');
  if(!cur||!app.comp){
    c2.fillStyle='#5d6880'; c2.font='12px "Microsoft YaHei"';
    c2.fillText('选择一个属性或关键帧以查看曲线（时间轴中点击属性名）',20,40);
    legend.innerHTML='';
    return;
  }
  if(cur.prop.kind==='path'||cur.prop.kind==='text'){
    c2.fillStyle='#5d6880'; c2.font='12px "Microsoft YaHei"';
    c2.fillText('路径/文字属性不支持曲线视图，请在画布中编辑。',20,40);
    return;
  }
  const n=dims(cur.prop);
  const isVec=cur.prop.kind==='vec2'||cur.prop.kind==='vec3';
  const wa=app.comp.workArea;
  const t0=wa[0], t1=wa[1];
  const padL=52,padR=16,padT=18,padB=24;
  const gw=W-padL-padR, gh=H-padT-padB;
  const timeToX=t=>padL+(t-t0)/(t1-t0)*gw*st.zoom+st.panX;
  const xToTime=x=>(x-padL-st.panX)/(gw*st.zoom)*(t1-t0)+t0;
  // 采样
  const N=Math.min(600,Math.max(120,Math.floor(gw/2)));
  const series=[];
  let mn=1e18,mx=-1e18;
  const eps=1/240;
  for(let d=0;d<n;d++){
    const pts=[];
    for(let i=0;i<=N;i++){
      const t=t0+(t1-t0)*i/N;
      let v;
      if(st.mode==='speed'){
        if(isVec){
          const ctx=Eval.frame(app.project,app.comp,t);
          const a=Eval.prop(ctx,cur.layer,cur.path,Math.max(0,t-eps));
          const b=Eval.prop(ctx,cur.layer,cur.path,Math.min(app.comp.duration,t+eps));
          v=Math.hypot(b[0]-a[0],b[1]-a[1],(b[2]||0)-(a[2]||0))/(2*eps);
          if(d>0){ pts.push([t,0]); continue; }
        } else {
          const a=sampleVal(cur,Math.max(0,t-eps),d);
          const b=sampleVal(cur,Math.min(app.comp.duration,t+eps),d);
          v=Math.abs(b-a)/(2*eps);
        }
      } else {
        v=sampleVal(cur,t,d);
      }
      pts.push([t,v]);
      if(v<mn)mn=v; if(v>mx)mx=v;
    }
    series.push(pts);
  }
  // 关键帧值也纳入范围
  for(const k of cur.prop.keys||[]){
    const v=Array.isArray(k.v)?k.v:[k.v];
    for(let d=0;d<n;d++){ const vv=v[d]!==undefined?v[d]:v[0]; if(vv<mn)mn=vv; if(vv>mx)mx=vv; }
  }
  if(st.mode==='speed'){ mn=0; }
  if(mx-mn<1e-6){ mx=mn+1; }
  const pad=(mx-mn)*0.15;
  mn-=pad; mx+=pad;
  st.vMin=mn; st.vMax=mx;
  const valToY=v=>padT+(1-(v-mn)/(mx-mn))*gh;
  // 网格与坐标
  c2.font='10px Consolas';
  const vStep=niceStep((mx-mn)/5);
  for(let v=Math.ceil(mn/vStep)*vStep;v<=mx;v+=vStep){
    const y=valToY(v);
    c2.strokeStyle=Math.abs(v)<vStep*0.01?'rgba(255,255,255,0.14)':'rgba(255,255,255,0.05)';
    c2.beginPath(); c2.moveTo(padL,y); c2.lineTo(W-padR,y); c2.stroke();
    c2.fillStyle='#5d6880';
    c2.fillText(fmtN(v),4,y+3);
  }
  const tStep=niceStep((t1-t0)/8);
  for(let t=Math.ceil(t0/tStep)*tStep;t<=t1;t+=tStep){
    const x=timeToX(t);
    if(x<padL||x>W-padR) continue;
    c2.strokeStyle='rgba(255,255,255,0.05)';
    c2.beginPath(); c2.moveTo(x,padT); c2.lineTo(x,H-padB); c2.stroke();
    c2.fillStyle='#5d6880';
    c2.fillText(t.toFixed(1)+'s',x+2,H-8);
  }
  // 基础关键帧曲线（表达式开启时对照）
  if(cur.prop.expr&&cur.prop.exprOn&&st.mode==='value'){
    for(let d=0;d<n;d++){
      c2.strokeStyle='rgba(154,164,187,0.3)';
      c2.setLineDash([4,4]);
      c2.beginPath();
      for(let i=0;i<=N;i++){
        const t=t0+(t1-t0)*i/N;
        const v=sampleVal(cur,t,d,true);
        const x=timeToX(t),y=valToY(v);
        i?c2.lineTo(x,y):c2.moveTo(x,y);
      }
      c2.stroke();
      c2.setLineDash([]);
    }
  }
  // 曲线
  for(let d=0;d<n;d++){
    if(st.mode==='speed'&&isVec&&d>0) continue;
    c2.strokeStyle=n===1?'#ffb347':COMP_COLORS[d];
    c2.lineWidth=1.8;
    c2.beginPath();
    const pts=series[d];
    for(let i=0;i<pts.length;i++){
      const x=timeToX(pts[i][0]),y=valToY(pts[i][1]);
      i?c2.lineTo(x,y):c2.moveTo(x,y);
    }
    c2.stroke();
  }
  c2.lineWidth=1;
  // 关键帧与手柄
  const keys=cur.prop.keys||[];
  for(let ki=0;ki<keys.length;ki++){
    const k=keys[ki];
    const v=Array.isArray(k.v)?k.v[0]:k.v;
    const x=timeToX(k.t),y=valToY(st.mode==='speed'?keySpeed(cur,k):v);
    const sel=app.selKeys.some(s=>s.layerId===cur.layer.id&&s.path===cur.path&&Math.abs(s.t-k.t)<1e-4);
    // 时间手柄
    if(st.mode==='value'&&k.i==='bez'){
      const prev=keys[ki-1], next=keys[ki+1];
      if(next){
        const dt=next.t-k.t, dv=(Array.isArray(next.v)?next.v[0]:next.v)-v;
        const hx=timeToX(k.t+dt*k.eo[0]), hy=valToY(v+dv*k.eo[1]);
        c2.strokeStyle='rgba(79,210,255,0.6)';
        c2.beginPath(); c2.moveTo(x,y); c2.lineTo(hx,hy); c2.stroke();
        c2.fillStyle='#4fd2ff';
        c2.beginPath(); c2.arc(hx,hy,4,0,7); c2.fill();
      }
      if(prev){
        const dt=k.t-prev.t, pv=Array.isArray(prev.v)?prev.v[0]:prev.v;
        const dv=v-pv;
        const hx=timeToX(k.t-dt*k.ei[0]), hy=valToY(v-dv*k.ei[1]);
        c2.strokeStyle='rgba(79,210,255,0.6)';
        c2.beginPath(); c2.moveTo(x,y); c2.lineTo(hx,hy); c2.stroke();
        c2.fillStyle='#4fd2ff';
        c2.beginPath(); c2.arc(hx,hy,4,0,7); c2.fill();
      }
    }
    c2.save();
    c2.translate(x,y); c2.rotate(Math.PI/4);
    c2.fillStyle=sel?'#ff7a29':(k.i==='hold'?'#ff5470':'#ffb347');
    const s=sel?6:4.5;
    c2.fillRect(-s/1.4,-s/1.4,s*1.42,s*1.42);
    c2.restore();
  }
  // 播放头
  const px=timeToX(app.time);
  if(px>=padL&&px<=W-padR){
    c2.strokeStyle='rgba(255,122,41,0.7)';
    c2.beginPath(); c2.moveTo(px,padT); c2.lineTo(px,H-padB); c2.stroke();
  }
  legend.innerHTML=(n===1?'<span><i style="background:#ffb347"></i>'+(st.mode==='speed'?'速度':'值')+'</span>'
    :['X','Y','Z'].slice(0,n).map((c,i)=>'<span><i style="background:'+COMP_COLORS[i]+'"></i>'+c+'</span>').join(''))
    +(cur.prop.expr&&cur.prop.exprOn?'<span style="color:var(--steel)">fx 最终曲线</span>':'')
    +'<span>'+cur.layer.name+' · '+cur.path+'</span>';
  st._geom={timeToX,xToTime,valToY,padL,padR,padT,padB,W,H,cur,keys,n};
}
function keySpeed(cur,k){
  const eps=1/240;
  const isVec=cur.prop.kind==='vec2'||cur.prop.kind==='vec3';
  const ctx=Eval.frame(app.project,app.comp,k.t);
  const a=Eval.prop(ctx,cur.layer,cur.path,Math.max(0,k.t-eps));
  const b=Eval.prop(ctx,cur.layer,cur.path,k.t+eps);
  if(isVec) return Math.hypot(b[0]-a[0],b[1]-a[1],(b[2]||0)-(a[2]||0))/(2*eps);
  return Math.abs(b-a)/(2*eps);
}
function niceStep(raw){
  const p=Math.pow(10,Math.floor(Math.log10(raw||1)));
  const r=raw/p;
  return (r<1.5?1:r<3.5?2:r<7.5?5:10)*p;
}
function fmtN(v){ return Math.abs(v)>=1000?(v/1000).toFixed(1)+'k':(Math.round(v*10)/10).toString(); }
function wire(){
  let ptr=null;
  cv.addEventListener('pointerdown',e=>{
    const g=st._geom;
    if(!g) return;
    cv.setPointerCapture(e.pointerId);
    const r=cv.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top;
    const cur=g.cur;
    // 手柄命中
    if(st.mode==='value'){
      for(let ki=0;ki<g.keys.length;ki++){
        const k=g.keys[ki];
        const v=Array.isArray(k.v)?k.v[0]:k.v;
        const x=g.timeToX(k.t),y=g.valToY(v);
        const next=g.keys[ki+1],prev=g.keys[ki-1];
        if(next){
          const dt=next.t-k.t,dv=(Array.isArray(next.v)?next.v[0]:next.v)-v;
          const hx=g.timeToX(k.t+dt*k.eo[0]),hy=g.valToY(v+dv*k.eo[1]);
          if(Math.hypot(mx-hx,my-hy)<8){ ptr={type:'handle',k,side:'eo',ki}; FF.app.beginDrag(); return; }
        }
        if(prev){
          const dt=k.t-prev.t,pv=Array.isArray(prev.v)?prev.v[0]:prev.v;
          const dv=v-pv;
          const hx=g.timeToX(k.t-dt*k.ei[0]),hy=g.valToY(v-dv*k.ei[1]);
          if(Math.hypot(mx-hx,my-hy)<8){ ptr={type:'handle',k,side:'ei',ki}; FF.app.beginDrag(); return; }
        }
        if(Math.hypot(mx-x,my-y)<8){
          const sk={layerId:cur.layer.id,path:cur.path,t:k.t};
          if(!e.shiftKey) app.selKeys=[sk];
          else if(!app.selKeys.some(s=>Math.abs(s.t-k.t)<1e-4)) app.selKeys.push(sk);
          ptr={type:'key',k,x0:mx,y0:my,t0:k.t,v0:Array.isArray(k.v)?k.v.slice():k.v};
          FF.app.beginDrag();
          draw();
          return;
        }
      }
    }
    ptr={type:'pan',x0:mx,pan0:st.panX};
  });
  cv.addEventListener('pointermove',e=>{
    if(!ptr||!st._geom) return;
    const g=st._geom;
    const r=cv.getBoundingClientRect();
    const mx=e.clientX-r.left,my=e.clientY-r.top;
    if(ptr.type==='pan'){ st.panX=ptr.pan0+(mx-ptr.x0); draw(); return; }
    const k=ptr.k;
    if(ptr.type==='handle'){
      const ki=g.keys.indexOf(k);
      const v=Array.isArray(k.v)?k.v[0]:k.v;
      if(ptr.side==='eo'){
        const next=g.keys[ki+1]; if(!next) return;
        const dt=next.t-k.t||1e-6, dv=(Array.isArray(next.v)?next.v[0]:next.v)-v||1e-6;
        const hv=st.vMax-(my-g.padT)/(g.H-g.padT-g.padB)*(st.vMax-st.vMin);
        k.eo=[clamp((g.xToTime(mx)-k.t)/dt,0.02,0.98), clamp((hv-v)/dv,-2,2)];
      } else {
        const prev=g.keys[ki-1]; if(!prev) return;
        const dt=k.t-prev.t||1e-6, pv=Array.isArray(prev.v)?prev.v[0]:prev.v;
        const dv=v-pv||1e-6;
        const hv=st.vMax-(my-g.padT)/(g.H-g.padT-g.padB)*(st.vMax-st.vMin);
        k.ei=[clamp((k.t-g.xToTime(mx))/dt,0.02,0.98), clamp((v-hv)/dv,-2,2)];
      }
      k.i='bez';
      FF.app.invalidate();
      draw();
    } else if(ptr.type==='key'){
      const nt=clamp(g.xToTime(mx),0,app.comp.duration);
      k.t=Math.round(nt*app.comp.fps)/app.comp.fps;
      if(st.mode==='value'){
        const nv=st.vMax-(my-g.padT)/(g.H-g.padT-g.padB)*(st.vMax-st.vMin);
        if(Array.isArray(k.v)){
          // 找到最近的组件
          let d=0,bd=1e18;
          for(let i=0;i<k.v.length;i++){
            const y=g.valToY(k.v[i]);
            if(Math.abs(y-ptr.y0)<bd){bd=Math.abs(y-ptr.y0);d=i;}
          }
          k.v[d]=nv;
        } else k.v=nv;
      }
      cur.prop.keys.sort((a,b)=>a.t-b.t);
      app.selKeys=[{layerId:cur.layer.id,path:cur.path,t:k.t}];
      FF.app.invalidate();
      draw();
    }
  });
  cv.addEventListener('pointerup',()=>{
    if(ptr&&ptr.type!=='pan') FF.app.endDrag('曲线编辑');
    ptr=null;
    FF.app.refreshAll();
  });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey){ st.zoom=clamp(st.zoom*(e.deltaY<0?1.15:0.87),0.3,10); }
    else st.panX-=e.deltaY;
    draw();
  },{passive:false});
}
FF.Curves={init,draw,st};
})();
