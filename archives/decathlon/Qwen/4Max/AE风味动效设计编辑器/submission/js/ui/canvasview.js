/* 铸帧 ForgeFrame · 画布视图：辅助元素绘制 + 直接编辑 */
"use strict";
(function(){
const FF=window.FF, app=FF.app, Eval=FF.Eval, M4=FF.M4, V=FF.V, Path=FF.Path,
  clamp=FF.util.clamp, DEG=FF.util.DEG;
let cv,c2,dpr=1;
let penSession=null; // {layerId,path,dragIdx,...}
let drag=null;

function init(){
  cv=document.getElementById('overlay');
  c2=cv.getContext('2d');
  wire();
}
function resize(){
  const r=cv.parentElement.getBoundingClientRect();
  const glcv=FF.GL.canvas;
  dpr=Math.min(window.devicePixelRatio||1,2);
  glcv.width=Math.max(50,Math.round(r.width*dpr));
  glcv.height=Math.max(50,Math.round(r.height*dpr));
  glcv.style.width=r.width+'px'; glcv.style.height=r.height+'px';
  cv.width=glcv.width; cv.height=glcv.height;
  cv.style.width=r.width+'px'; cv.style.height=r.height+'px';
  FF.app.needsRender=true;
  FF.updateZoomLabel();
}
function rect(){
  const r=FF.Compositor.lastRect;
  if(!r) return {x:0,y:0,w:100,h:100,zoom:1};
  return {x:r.x/dpr,y:r.y/dpr,w:r.w/dpr,h:r.h/dpr,zoom:r.zoom/dpr};
}
function compToScreen(p){
  const r=rect();
  return [r.x+p[0]*r.zoom, r.y+p[1]*r.zoom];
}
function screenToComp(s){
  const r=rect();
  return [(s[0]-r.x)/r.zoom,(s[1]-r.y)/r.zoom];
}
function cam(){ return FF.R3D.lastCam; }
function worldToScreen(p){
  const c=cam();
  if(!c||!app.comp) return compToScreen(p);
  const clip=M4.transformPoint(c.vp,p);
  // transformPoint 已除 w；需要透视 w 符号判断
  const w=c.vp[3]*p[0]+c.vp[7]*p[1]+c.vp[11]*p[2]+c.vp[15];
  if(w<=0.01) return null;
  return compToScreen([(clip[0]+1)/2*app.comp.w,(1-clip[1])/2*app.comp.h]);
}
function is3DMode(){
  return app.comp&&app.comp.layers.some(l=>l.threeD&&l.visible&&['geo','particles','camera'].includes(l.type));
}
function screenDeltaToWorld(dx,dy,depthPoint){
  const c=cam();
  if(!c) return [dx,dy,0];
  const dist=depthPoint?V.dist(c.pos,depthPoint):V.dist(c.pos,c.target);
  const wpp=2*dist*Math.tan(c.fov*DEG/2)/app.comp.h;
  const right=[c.view[0],c.view[4],c.view[8]];
  const up=[c.view[1],c.view[5],c.view[9]];
  return V.add(V.mul(right,dx*wpp),V.mul(up,dy*wpp));
}
function applyPosDelta(layer,dWorld){
  const ctx=Eval.frame(app.project,app.comp,app.time);
  let local=dWorld;
  if(layer.parent){
    const par=FF.findLayer(app.comp,layer.parent);
    if(par){
      const inv=M4.invert(Eval.worldMatrix(ctx,par,app.time).m);
      local=M4.transformDir(inv,dWorld);
    }
  }
  const pos=Eval.prop(ctx,layer,'transform.position',app.time);
  const nv=pos.map((v,i)=>v+(local[i]||0));
  Eval.setValue(ctx,layer,'transform.position',nv);
}
function layerBounds(layer,ctx){
  const t=app.time;
  if(layer.type==='shape'){
    const sg=FF.Geo.shapeLayerGeo(ctx,layer,t);
    let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18;
    const add=f=>{ for(let i=0;i<f.length;i+=2){ x0=Math.min(x0,f[i]);x1=Math.max(x1,f[i]);y0=Math.min(y0,f[i+1]);y1=Math.max(y1,f[i+1]); } };
    for(const p of sg.pieces){ for(const r of p.rings) add(r); for(const o of p.opens) add(o);
      if(p.ribbon){ const sm=FF.glyphs.sampleStroke(p.ribbon.stroke,4); for(const s of sm){ x0=Math.min(x0,s.x-10);x1=Math.max(x1,s.x+10);y0=Math.min(y0,s.y-10);y1=Math.max(y1,s.y+10); } } }
    if(x0>x1) return null;
    return [x0,y0,x1,y1];
  }
  if(layer.type==='text'){
    const tg=FF.Geo.textGeo(ctx,layer,t);
    return [-tg.width/2-10,-10,tg.width/2+10,tg.height+10];
  }
  if(layer.type==='geo'){
    const mesh=FF.Geo.geoLayerMesh(ctx,layer,t);
    const b=FF.Geo.meshBounds(mesh);
    return [b.min[0],b.min[1],b.max[0],b.max[1]];
  }
  if(layer.type==='precomp'){
    const sub=FF.findComp(app.project,layer.compId);
    if(sub) return [0,0,sub.w,sub.h];
  }
  return [-24,-24,24,24];
}
function worldCorners(layer,ctx){
  const b=layerBounds(layer,ctx);
  if(!b) return null;
  const wm=Eval.worldMatrix(ctx,layer,app.time).m;
  const pts=[[b[0],b[1],0],[b[2],b[1],0],[b[2],b[3],0],[b[0],b[3],0]];
  return pts.map(p=>M4.transformPoint(wm,p));
}
/* ---------- 绘制 ---------- */
function draw(){
  resizeIfNeeded();
  c2.setTransform(dpr,0,0,dpr,0,0);
  c2.clearRect(0,0,cv.width/dpr,cv.height/dpr);
  if(!app.comp) return;
  const r=rect();
  const ctx=Eval.frame(app.project,app.comp,app.time);
  // 合成边框
  c2.strokeStyle='rgba(255,122,41,0.35)';
  c2.lineWidth=1;
  c2.strokeRect(r.x,r.y,r.w,r.h);
  // 网格
  if(app.hud.grid){
    c2.strokeStyle='rgba(255,255,255,0.05)';
    const step=100;
    for(let x=0;x<=app.comp.w;x+=step){
      const a=compToScreen([x,0]),b=compToScreen([x,app.comp.h]);
      c2.beginPath(); c2.moveTo(a[0],a[1]); c2.lineTo(b[0],b[1]); c2.stroke();
    }
    for(let y=0;y<=app.comp.h;y+=step){
      const a=compToScreen([0,y]),b=compToScreen([app.comp.w,y]);
      c2.beginPath(); c2.moveTo(a[0],a[1]); c2.lineTo(b[0],b[1]); c2.stroke();
    }
  }
  const in3D=is3DMode();
  const toScreen=(p,layer)=>{
    if(in3D&&layer&&layer.threeD) return worldToScreen(p);
    return compToScreen(p);
  };
  // 场范围
  if(app.hud.fields){
    for(const l of app.comp.layers){
      if(l.type!=='field'||!l.visible) continue;
      const wm=Eval.worldMatrix(ctx,l,app.time).m;
      const center=M4.transformPoint(wm,[0,0,0]);
      const rad=Eval.prop(ctx,l,'field.radius',app.time);
      const col=l.field.fieldType==='falloff'?'#5aa7ff':(l.field.fieldType==='noise'?'#9fe84f':'#ff5ad1');
      drawWorldCircle(center,rad,col,ctx,l);
      const s=toScreen(center,l);
      if(s){
        c2.fillStyle=col;
        c2.font='10px "Microsoft YaHei"';
        c2.fillText('◎ '+l.name,s[0]+8,s[1]-8);
        c2.beginPath(); c2.arc(s[0],s[1],4,0,7); c2.fill();
      }
    }
  }
  // 灯光与摄像机
  if(app.hud.lights){
    for(const l of app.comp.layers){
      if(!l.visible) continue;
      if(l.type==='light'){
        const wm=Eval.worldMatrix(ctx,l,app.time).m;
        const p=M4.transformPoint(wm,[0,0,0]);
        const s=toScreen(p,l);
        const tgt=Eval.prop(ctx,l,'light.target',app.time);
        const ts=toScreen(tgt,l);
        if(s){
          const col=FF.color.rgbToHex(Eval.prop(ctx,l,'light.color',app.time));
          c2.strokeStyle=col; c2.fillStyle=col;
          c2.beginPath(); c2.arc(s[0],s[1],6,0,7); c2.stroke();
          c2.beginPath(); c2.arc(s[0],s[1],2.5,0,7); c2.fill();
          if(ts){ c2.setLineDash([3,4]); c2.beginPath(); c2.moveTo(s[0],s[1]); c2.lineTo(ts[0],ts[1]); c2.stroke(); c2.setLineDash([]); }
          c2.font='10px "Microsoft YaHei"';
          c2.fillText('✦ '+l.name,s[0]+9,s[1]+3);
        }
      } else if(l.type==='camera'){
        const wm=Eval.worldMatrix(ctx,l,app.time).m;
        const p=M4.transformPoint(wm,[0,0,0]);
        const s=toScreen(p,l);
        if(s){
          c2.strokeStyle='#5aa7ff'; c2.fillStyle='#5aa7ff';
          c2.strokeRect(s[0]-7,s[1]-5,14,10);
          c2.beginPath(); c2.moveTo(s[0]+7,s[1]-3); c2.lineTo(s[0]+13,s[1]-6); c2.lineTo(s[0]+13,s[1]+6); c2.lineTo(s[0]+7,s[1]+3); c2.stroke();
          c2.font='10px "Microsoft YaHei"';
          c2.fillText('📷 '+l.name,s[0]+16,s[1]+3);
        }
      }
    }
  }
  // 父级连线
  for(const l of app.comp.layers){
    if(!l.parent||!l.visible) continue;
    const par=FF.findLayer(app.comp,l.parent);
    if(!par) continue;
    const a=toScreen(M4.transformPoint(Eval.worldMatrix(ctx,l,app.time).m,[0,0,0]),l);
    const b=toScreen(M4.transformPoint(Eval.worldMatrix(ctx,par,app.time).m,[0,0,0]),par);
    if(a&&b){
      c2.strokeStyle='rgba(154,164,187,0.25)';
      c2.setLineDash([2,5]);
      c2.beginPath(); c2.moveTo(a[0],a[1]); c2.lineTo(b[0],b[1]); c2.stroke();
      c2.setLineDash([]);
    }
  }
  // 选中图层
  for(const id of app.selection){
    const l=FF.findLayer(app.comp,id);
    if(!l||!l.visible) continue;
    drawMotionPath(l,ctx,toScreen);
    drawSelection(l,ctx,toScreen);
    if(l.type==='geo') drawPins(l,ctx,toScreen);
    if(l.threeD&&in3D) drawAxes(l,ctx);
  }
  // 钢笔会话
  if(penSession) drawPenSession(ctx);
  // 空合成提示
  const hasContent=app.comp.layers.some(l=>l.visible&&['shape','text','geo','particles','precomp'].includes(l.type));
  document.getElementById('emptyHint').classList.toggle('hidden',hasContent);
}
function resizeIfNeeded(){
  const r=cv.parentElement.getBoundingClientRect();
  if(Math.abs(cv.width/dpr-r.width)>1||Math.abs(cv.height/dpr-r.height)>1) resize();
}
function drawWorldCircle(center,rad,col,ctx,layer){
  c2.strokeStyle=col+'66';
  c2.fillStyle=col+'0d';
  c2.beginPath();
  const N=40;
  let started=false;
  for(let i=0;i<=N;i++){
    const a=i/N*Math.PI*2;
    const p=[center[0]+Math.cos(a)*rad,center[1]+Math.sin(a)*rad,center[2]];
    const s=worldToScreen(p)||compToScreen(p);
    if(!s) continue;
    if(!started){ c2.moveTo(s[0],s[1]); started=true; }
    else c2.lineTo(s[0],s[1]);
  }
  c2.closePath();
  c2.fill(); c2.stroke();
}
function drawMotionPath(l,ctx,toScreen){
  if(!app.hud.paths) return;
  const p=l.transform.position;
  if(!p.keys||p.keys.length<2) return;
  const t0=Math.max(l.inPoint,app.comp.workArea[0],p.keys[0].t-0.5);
  const t1=Math.min(l.outPoint>1e8?app.comp.duration:l.outPoint,app.comp.workArea[1],p.keys[p.keys.length-1].t+0.5);
  if(t1<=t0) return;
  c2.strokeStyle='rgba(79,210,255,0.55)';
  c2.lineWidth=1.2;
  c2.beginPath();
  let started=false;
  const N=80;
  for(let i=0;i<=N;i++){
    const t=t0+(t1-t0)*i/N;
    const v=Eval.prop(ctx,l,'transform.position',t);
    const wm=Eval.worldMatrix(ctx,l,t).m;
    // 位置路径点 = 父级世界 * 位置（锚点无关）
    let wp;
    if(l.parent){
      const par=FF.findLayer(app.comp,l.parent);
      wp=M4.transformPoint(Eval.worldMatrix(ctx,par,t).m,v);
    } else wp=v;
    const s=l.threeD&&is3DMode()?worldToScreen(wp):compToScreen(wp);
    if(!s) continue;
    if(!started){ c2.moveTo(s[0],s[1]); started=true; } else c2.lineTo(s[0],s[1]);
  }
  c2.stroke();
  // 关键帧点与空间手柄
  for(const k of p.keys){
    if(k.t<t0-0.01||k.t>t1+0.01) continue;
    let wp=k.v;
    if(l.parent){ const par=FF.findLayer(app.comp,l.parent); if(par) wp=M4.transformPoint(Eval.worldMatrix(ctx,par,k.t).m,k.v); }
    const s=l.threeD&&is3DMode()?worldToScreen(wp):compToScreen(wp);
    if(!s) continue;
    c2.fillStyle='#4fd2ff';
    c2.fillRect(s[0]-3,s[1]-3,6,6);
    const selKey=app.selKeys.some(sk=>sk.layerId===l.id&&sk.path==='transform.position'&&Math.abs(sk.t-k.t)<1e-4);
    if(selKey||(k.so&&(k.so[0]||k.so[1]))||(k.si&&(k.si[0]||k.si[1]))){
      for(const [hk,off] of [['so',k.so],['si',k.si]]){
        if(!off||(!off[0]&&!off[1])) continue;
        const hp=[wp[0]+off[0],wp[1]+off[1],wp[2]||0];
        const hs=l.threeD&&is3DMode()?worldToScreen(hp):compToScreen(hp);
        if(!hs) continue;
        c2.strokeStyle='rgba(255,179,71,0.7)';
        c2.beginPath(); c2.moveTo(s[0],s[1]); c2.lineTo(hs[0],hs[1]); c2.stroke();
        c2.fillStyle='#ffb347';
        c2.beginPath(); c2.arc(hs[0],hs[1],4,0,7); c2.fill();
      }
    }
  }
}
function drawSelection(l,ctx,toScreen){
  const corners=worldCorners(l,ctx);
  const wm=Eval.worldMatrix(ctx,l,app.time).m;
  const anchor=Eval.prop(ctx,l,'transform.anchor',app.time);
  const aw=M4.transformPoint(wm,[anchor[0],anchor[1],anchor[2]||0]);
  const as=toScreen(aw,l);
  if(corners){
    const ss=corners.map(p=>toScreen(p,l)).filter(Boolean);
    if(ss.length===4){
      c2.strokeStyle='#ff7a29';
      c2.lineWidth=1.2;
      c2.beginPath();
      c2.moveTo(ss[0][0],ss[0][1]);
      for(let i=1;i<4;i++) c2.lineTo(ss[i][0],ss[i][1]);
      c2.closePath(); c2.stroke();
      // 手柄
      if(!l.locked){
        for(const s of ss){
          c2.fillStyle='#fff';
          c2.strokeStyle='#ff7a29';
          c2.fillRect(s[0]-3.5,s[1]-3.5,7,7);
          c2.strokeRect(s[0]-3.5,s[1]-3.5,7,7);
        }
        // 旋转手柄
        const mid=[(ss[0][0]+ss[1][0])/2,(ss[0][1]+ss[1][1])/2];
        const cx=(ss[0][0]+ss[2][0])/2, cy=(ss[0][1]+ss[2][1])/2;
        let dx=mid[0]-cx, dy=mid[1]-cy;
        const dl=Math.hypot(dx,dy)||1; dx/=dl; dy/=dl;
        const rh=[mid[0]+dx*22,mid[1]+dy*22];
        c2.strokeStyle='rgba(255,122,41,0.6)';
        c2.beginPath(); c2.moveTo(mid[0],mid[1]); c2.lineTo(rh[0],rh[1]); c2.stroke();
        c2.fillStyle='#ffb347';
        c2.beginPath(); c2.arc(rh[0],rh[1],5,0,7); c2.fill();
        l._rotHandle=rh; l._corners=ss; l._center=[cx,cy];
      }
    }
  }
  // 锚点
  if(as){
    c2.strokeStyle='#9fe84f';
    c2.lineWidth=1.4;
    c2.beginPath(); c2.arc(as[0],as[1],7,0,7); c2.stroke();
    c2.beginPath();
    c2.moveTo(as[0]-11,as[1]); c2.lineTo(as[0]+11,as[1]);
    c2.moveTo(as[0],as[1]-11); c2.lineTo(as[0],as[1]+11);
    c2.stroke();
    l._anchorScreen=as;
  }
}
function drawAxes(l,ctx){
  const wm=Eval.worldMatrix(ctx,l,app.time).m;
  const o=M4.transformPoint(wm,[0,0,0]);
  const os=worldToScreen(o);
  if(!os) return;
  const len=60;
  const axes=[[[len,0,0],'#ff5470','X'],[[0,len,0],'#57d98a','Y'],[[0,0,len],'#5aa7ff','Z']];
  for(const [vec,col,label] of axes){
    const p=M4.transformPoint(wm,vec);
    const s=worldToScreen(p);
    if(!s) continue;
    c2.strokeStyle=col; c2.lineWidth=2;
    c2.beginPath(); c2.moveTo(os[0],os[1]); c2.lineTo(s[0],s[1]); c2.stroke();
    c2.fillStyle=col;
    c2.beginPath(); c2.arc(s[0],s[1],5,0,7); c2.fill();
    c2.font='10px Consolas';
    c2.fillText(label,s[0]+7,s[1]+3);
  }
  l._axisHandles=axes.map(([vec])=>{
    const p=M4.transformPoint(wm,vec);
    return worldToScreen(p);
  });
  l._axisOrigin=os;
}
function drawPins(l,ctx,toScreen){
  const wm=Eval.worldMatrix(ctx,l,app.time).m;
  l.geo.pins.forEach((pin,pi)=>{
    const target=Eval.prop(ctx,l,'geo.pins.'+pi+'.pos',app.time)||pin.base;
    const baseW=M4.transformPoint(wm,pin.base);
    const targW=M4.transformPoint(wm,target);
    const bs=toScreen(baseW,l), ts=toScreen(targW,l);
    if(bs&&ts){
      c2.strokeStyle='rgba(255,90,209,0.5)';
      c2.setLineDash([3,3]);
      c2.beginPath(); c2.moveTo(bs[0],bs[1]); c2.lineTo(ts[0],ts[1]); c2.stroke();
      c2.setLineDash([]);
      c2.fillStyle='#ff5ad1';
      c2.beginPath(); c2.arc(ts[0],ts[1],6,0,7); c2.fill();
      c2.strokeStyle='#fff'; c2.lineWidth=1;
      c2.beginPath(); c2.arc(ts[0],ts[1],6,0,7); c2.stroke();
      c2.font='9px Consolas'; c2.fillStyle='#ff5ad1';
      c2.fillText('P'+(pi+1),ts[0]+8,ts[1]-6);
    }
  });
}
function drawPenSession(ctx){
  const l=FF.findLayer(app.comp,penSession.layerId);
  if(!l) return;
  const p=FF.getProp(l,penSession.path);
  const path=(p.keys&&p.keys.length)?Eval.sampleKeys(p,app.time):p.value;
  const wm=Eval.worldMatrix(ctx,l,app.time).m;
  c2.strokeStyle='#4fd2ff';
  for(const c of path.c){
    c2.beginPath();
    const flat=Path.flatten(c,0.8);
    for(let i=0;i<flat.length;i+=2){
      const wp=M4.transformPoint(wm,[flat[i],flat[i+1],0]);
      const s=compToScreen(wp);
      i?c2.lineTo(s[0],s[1]):c2.moveTo(s[0],s[1]);
    }
    if(c.closed) c2.closePath();
    c2.stroke();
    c.p.forEach((pt,pi)=>{
      const wp=M4.transformPoint(wm,[pt[0],pt[1],0]);
      const s=compToScreen(wp);
      for(const h of [[pt[2],pt[3]],[pt[4],pt[5]]]){
        if(Math.abs(h[0]-pt[0])<0.01&&Math.abs(h[1]-pt[1])<0.01) continue;
        const hs=compToScreen(M4.transformPoint(wm,[h[0],h[1],0]));
        c2.strokeStyle='rgba(255,179,71,0.6)';
        c2.beginPath(); c2.moveTo(s[0],s[1]); c2.lineTo(hs[0],hs[1]); c2.stroke();
        c2.fillStyle='#ffb347';
        c2.beginPath(); c2.arc(hs[0],hs[1],3.5,0,7); c2.fill();
      }
      c2.fillStyle=pi===0?'#9fe84f':'#fff';
      c2.strokeStyle='#4fd2ff';
      c2.fillRect(s[0]-4,s[1]-4,8,8);
      c2.strokeRect(s[0]-4,s[1]-4,8,8);
    });
  }
}
/* ---------- 交互 ---------- */
function evPos(e){
  const r=cv.getBoundingClientRect();
  return [e.clientX-r.left,e.clientY-r.top];
}
function hitHandle(l,s){
  if(l._rotHandle&&Math.hypot(s[0]-l._rotHandle[0],s[1]-l._rotHandle[1])<9) return {type:'rotate'};
  if(l._corners){
    for(let i=0;i<4;i++){
      const c=l._corners[i];
      if(Math.abs(s[0]-c[0])<7&&Math.abs(s[1]-c[1])<7) return {type:'scale',corner:i};
    }
  }
  if(app.tool==='anchor'&&l._anchorScreen&&Math.hypot(s[0]-l._anchorScreen[0],s[1]-l._anchorScreen[1])<12) return {type:'anchor'};
  if(l._axisHandles&&app.tool==='select'){
    for(let i=0;i<3;i++){
      const h=l._axisHandles[i];
      if(h&&Math.hypot(s[0]-h[0],s[1]-h[1])<9) return {type:'axis',axis:i};
    }
  }
  return null;
}
function wire(){
  cv.addEventListener('pointerdown',e=>{
    if(!app.comp||app.exportMode) return;
    cv.setPointerCapture(e.pointerId);
    const s=evPos(e);
    const comp=screenToComp(s);
    FF.Audio.ensure();
    // 中键 / 空格平移
    if(e.button===1){
      drag={type:'pan',s0:s,p0:{...app.view}};
      return;
    }
    if(e.button===2) return;
    const ctx=Eval.frame(app.project,app.comp,app.time);
    // 钢笔会话优先
    if(penSession){
      penDown(s,comp,ctx,e);
      return;
    }
    if(app.tool==='rect'||app.tool==='ellipse'){
      drag={type:'drawShape',kind:app.tool,s0:s,comp0:comp};
      return;
    }
    if(app.tool==='pen'){
      // 新建路径图层
      const l=FF.app.createLayer('shape',{name:'路径',empty:true});
      const item=FF.makeShapeItem('path');
      FF.app.transact('钢笔路径',()=>{ l.shapes.push(item); });
      startPathEdit(l.id,'shapes.0.path');
      penDown(s,comp,ctx,e);
      return;
    }
    if(app.tool==='text'){
      const l=FF.app.createLayer('text',{name:'文字'});
      l.transform.position.value=[comp[0],comp[1]];
      FF.app.refreshAll();
      FF.ui.modal({title:'文字内容（铸锋体）',fields:[{key:'t',label:'内容',value:'铸帧'}],onOk:v=>{
        FF.app.transact('文字内容',()=>{ l.text.content.value=v.t; });
        FF.app.refreshAll();
      }});
      FF.setTool('select');
      return;
    }
    if(app.tool==='field'){
      const l=FF.app.createLayer('field',{name:'空间场'});
      if(is3DMode()){
        const w=screenToWorldOnPlane(s);
        l.transform.position.value=w;
      } else l.transform.position.value=[comp[0],comp[1]];
      FF.app.refreshAll();
      FF.setTool('select');
      return;
    }
    if(app.tool==='pin'){
      const hit=FF.R3D.pick(app.comp,app.time,ctx,s[0]*dpr,s[1]*dpr,FF.GL.canvas.width,FF.GL.canvas.height);
      if(hit&&hit.layer.type==='geo'){
        const l=hit.layer;
        const inv=M4.invert(Eval.worldMatrix(ctx,l,app.time).m);
        const local=M4.transformPoint(inv,hit.point);
        FF.app.transact('添加图钉',()=>{
          l.geo.pins.push({base:local,pos:FF.P('vec3',local.slice()),rotation:FF.P('num',0),scale:FF.P('num',100),radius:150,enabled:true});
        });
        app.selection=[l.id];
        FF.app.refreshAll();
      } else FF.ui.toast('请点击三维几何表面');
      return;
    }
    // 手柄命中
    for(const id of app.selection){
      const l=FF.findLayer(app.comp,id);
      if(!l||l.locked) continue;
      // 图钉
      if(l.type==='geo'){
        const wm=Eval.worldMatrix(ctx,l,app.time).m;
        for(let pi=0;pi<l.geo.pins.length;pi++){
          const target=Eval.prop(ctx,l,'geo.pins.'+pi+'.pos',app.time)||l.geo.pins[pi].base;
          const ts=l.threeD&&is3DMode()?worldToScreen(M4.transformPoint(wm,target)):compToScreen(M4.transformPoint(wm,target));
          if(ts&&Math.hypot(s[0]-ts[0],s[1]-ts[1])<10){
            drag={type:'pin',layer:l,pi};
            FF.app.beginDrag();
            return;
          }
        }
      }
      // 空间手柄
      if(app.hud.paths&&l.transform.position.keys){
        for(const k of l.transform.position.keys){
          let wp=k.v;
          if(l.parent){ const par=FF.findLayer(app.comp,l.parent); if(par) wp=M4.transformPoint(Eval.worldMatrix(ctx,par,k.t).m,k.v); }
          for(const hk of ['so','si']){
            const off=k[hk];
            if(!off||(!off[0]&&!off[1])) continue;
            const hp=[wp[0]+off[0],wp[1]+off[1],wp[2]||0];
            const hs=l.threeD&&is3DMode()?worldToScreen(hp):compToScreen(hp);
            if(hs&&Math.hypot(s[0]-hs[0],s[1]-hs[1])<8){
              drag={type:'spatial',layer:l,k,hk};
              FF.app.beginDrag();
              return;
            }
          }
        }
      }
      const h=hitHandle(l,s);
      if(h){
        const pos=Eval.prop(ctx,l,'transform.position',app.time);
        drag={type:h.type,layer:l,corner:h.corner,axis:h.axis,s0:s,
          rot0:Eval.prop(ctx,l,l.threeD?'transform.rotationZ':'transform.rotation',app.time),
          scl0:Eval.prop(ctx,l,'transform.scale',app.time),
          pos0:pos,
          center:l._center,
          anchor0:Eval.prop(ctx,l,'transform.anchor',app.time)};
        FF.app.beginDrag();
        return;
      }
    }
    // 拾取
    const hit=FF.R3D.pick(app.comp,app.time,ctx,s[0]*dpr,s[1]*dpr,FF.GL.canvas.width,FF.GL.canvas.height);
    if(hit){
      const l=hit.layer;
      if(e.shiftKey){
        if(app.selection.includes(l.id)) app.selection=app.selection.filter(x=>x!==l.id);
        else app.selection.push(l.id);
      } else if(!app.selection.includes(l.id)) app.selection=[l.id];
      app.selProp=null;
      FF.app.refreshAll();
      if(!l.locked){
        if(app.tool==='rotate'){
          drag={type:'rotate',layer:l,s0:s,rot0:Eval.prop(ctx,l,l.threeD?'transform.rotationZ':'transform.rotation',app.time),center:l._center};
        } else if(app.tool==='scale'){
          drag={type:'scale',layer:l,s0:s,scl0:Eval.prop(ctx,l,'transform.scale',app.time),center:l._center};
        } else if(app.tool==='anchor'){
          drag={type:'anchorMove',layer:l,s0:s,anchor0:Eval.prop(ctx,l,'transform.anchor',app.time)};
        } else {
          drag={type:'move',layer:l,s0:s,pos0:Eval.prop(ctx,l,'transform.position',app.time),hitPoint:hit.point,
            startWorld:hit.point};
        }
        FF.app.beginDrag();
      }
    } else {
      if(!e.shiftKey){ app.selection=[]; FF.app.refreshAll(); }
      drag={type:'pan',s0:s,p0:{...app.view}};
    }
  });
  cv.addEventListener('pointermove',e=>{
    const s=evPos(e);
    if(!drag){
      // 光标
      let cur='default';
      if(app.tool==='rect'||app.tool==='ellipse'||app.tool==='pen') cur='crosshair';
      else if(app.tool==='text') cur='text';
      else if(app.tool==='pin'||app.tool==='field') cur='copy';
      cv.style.cursor=cur;
      return;
    }
    const ctx=Eval.frame(app.project,app.comp,app.time);
    const comp=screenToComp(s);
    if(drag.type==='pan'){
      app.view.panX=drag.p0.panX+(s[0]-drag.s0[0])*dpr;
      app.view.panY=drag.p0.panY+(s[1]-drag.s0[1])*dpr;
      if(app.view.zoom===null){
        const glcv=FF.GL.canvas;
        const fit=Math.min((glcv.width-80)/app.comp.w,(glcv.height-80)/app.comp.h);
        app.view.zoom=fit;
      }
      FF.app.needsRender=true;
      return;
    }
    if(drag.type==='drawShape'){
      drag.s1=s; drag.comp1=comp;
      FF.app.needsRender=true;
      drawShapePreview();
      return;
    }
    if(drag.type==='penPoint'){
      penMove(s,comp,ctx,e);
      return;
    }
    const l=drag.layer;
    if(!l) return;
    const dx=s[0]-drag.s0[0], dy=s[1]-drag.s0[1];
    if(drag.type==='move'||drag.type==='axis'){
      let dWorld;
      if(l.threeD&&is3DMode()){
        dWorld=screenDeltaToWorld(dx,dy,drag.startWorld||drag.pos0);
        if(drag.type==='axis'){
          const wm=Eval.worldMatrix(ctx,l,app.time).m;
          const ax=M4.transformDir(wm,drag.axis===0?[1,0,0]:drag.axis===1?[0,1,0]:[0,0,1]);
          const axn=V.norm(ax);
          dWorld=V.mul(axn,V.dot(dWorld,axn));
        }
      } else {
        const r=rect();
        dWorld=[dx/r.zoom,dy/r.zoom,0];
      }
      const total=Math.hypot(s[0]-drag.s0[0],s[1]-drag.s0[1]);
      void total;
      // 基于初始位置 + 累计增量
      const startPos=drag.pos0;
      let local=dWorld;
      if(l.parent){
        const par=FF.findLayer(app.comp,l.parent);
        if(par) local=M4.transformDir(M4.invert(Eval.worldMatrix(ctx,par,app.time).m),dWorld);
      }
      Eval.setValue(ctx,l,'transform.position',startPos.map((v,i)=>v+(local[i]||0)));
      FF.app.invalidate();
    } else if(drag.type==='rotate'){
      const center=drag.center||[cv.width/dpr/2,cv.height/dpr/2];
      const a0=Math.atan2(drag.s0[1]-center[1],drag.s0[0]-center[0]);
      const a1=Math.atan2(s[1]-center[1],s[0]-center[0]);
      let deg=drag.rot0+(a1-a0)/DEG;
      if(e.shiftKey) deg=Math.round(deg/15)*15;
      Eval.setValue(ctx,l,l.threeD?'transform.rotationZ':'transform.rotation',deg);
      FF.app.invalidate();
    } else if(drag.type==='scale'){
      const center=drag.center||[cv.width/dpr/2,cv.height/dpr/2];
      const d0=Math.hypot(drag.s0[0]-center[0],drag.s0[1]-center[1])||1;
      const d1=Math.hypot(s[0]-center[0],s[1]-center[1]);
      const f=clamp(d1/d0,0.05,20);
      const nv=drag.scl0.map(v=>v*f);
      Eval.setValue(ctx,l,'transform.scale',nv);
      FF.app.invalidate();
    } else if(drag.type==='anchor'||drag.type==='anchorMove'){
      const r=rect();
      let dLocal;
      if(l.threeD&&is3DMode()){
        const wm=Eval.worldMatrix(ctx,l,app.time).m;
        const dw=screenDeltaToWorld(dx,dy,M4.transformPoint(wm,drag.anchor0));
        dLocal=M4.transformDir(M4.invert(wm),dw);
        // 锚点在本地坐标（含缩放逆）
        const scl=Eval.prop(ctx,l,'transform.scale',app.time);
        dLocal=[dLocal[0]/(scl[0]/100||1),dLocal[1]/(scl[1]/100||1),dLocal[2]/((scl[2]||100)/100||1)];
      } else {
        dLocal=[dx/r.zoom,dy/r.zoom,0];
        const rot=(Eval.prop(ctx,l,'transform.rotation',app.time)||0)*DEG;
        const scl=Eval.prop(ctx,l,'transform.scale',app.time);
        const c=Math.cos(-rot),sn=Math.sin(-rot);
        dLocal=[(dLocal[0]*c-dLocal[1]*sn)/(scl[0]/100||1),(dLocal[0]*sn+dLocal[1]*c)/(scl[1]/100||1),0];
      }
      const na=drag.anchor0.map((v,i)=>v+(dLocal[i]||0));
      Eval.setValue(ctx,l,'transform.anchor',na);
      // 保持画面：位置补偿 R*S*da（父级空间）
      const rot=(Eval.prop(ctx,l,l.threeD?'transform.rotationZ':'transform.rotation',app.time)||0)*DEG;
      const scl=Eval.prop(ctx,l,'transform.scale',app.time);
      const c=Math.cos(rot),sn=Math.sin(rot);
      const da=[na[0]-drag.anchor0[0],na[1]-drag.anchor0[1],(na[2]||0)-(drag.anchor0[2]||0)];
      const comp=[ (c*da[0]-sn*da[1])*(scl[0]/100), (sn*da[0]+c*da[1])*(scl[1]/100), da[2]*((scl[2]||100)/100) ];
      const pos=Eval.prop(ctx,l,'transform.position',app.time);
      Eval.setValue(ctx,l,'transform.position',pos.map((v,i)=>v+(comp[i]||0)));
      FF.app.invalidate();
    } else if(drag.type==='pin'){
      const pin=l.geo.pins[drag.pi];
      let dWorld;
      if(l.threeD&&is3DMode()){
        const wm=Eval.worldMatrix(ctx,l,app.time).m;
        dWorld=screenDeltaToWorld(dx,dy,M4.transformPoint(wm,pin.base));
        const dLocal=M4.transformDir(M4.invert(wm),dWorld);
        const cur=Eval.prop(ctx,l,'geo.pins.'+drag.pi+'.pos',app.time)||pin.base;
        if(!drag.pin0) drag.pin0=cur.slice();
        Eval.setValue(ctx,l,'geo.pins.'+drag.pi+'.pos',drag.pin0.map((v,i)=>v+dLocal[i]));
      } else {
        const r=rect();
        if(!drag.pin0) drag.pin0=(Eval.prop(ctx,l,'geo.pins.'+drag.pi+'.pos',app.time)||pin.base).slice();
        Eval.setValue(ctx,l,'geo.pins.'+drag.pi+'.pos',[drag.pin0[0]+dx/r.zoom,drag.pin0[1]+dy/r.zoom,drag.pin0[2]||0]);
      }
      FF.app.invalidate();
    } else if(drag.type==='spatial'){
      const k=drag.k;
      let wp=k.v;
      if(l.parent){ const par=FF.findLayer(app.comp,l.parent); if(par) wp=M4.transformPoint(Eval.worldMatrix(ctx,par,k.t).m,k.v); }
      const r=rect();
      const newWorld=[comp[0],comp[1],wp[2]||0];
      let off=[newWorld[0]-wp[0],newWorld[1]-wp[1]];
      if(l.parent){
        const par=FF.findLayer(app.comp,l.parent);
        if(par){ const d=M4.transformDir(M4.invert(Eval.worldMatrix(ctx,par,k.t).m),[off[0],off[1],0]); off=[d[0],d[1]]; }
      }
      k[drag.hk]=off;
      FF.app.invalidate();
    }
  });
  cv.addEventListener('pointerup',e=>{
    if(!drag) return;
    const s=evPos(e);
    if(drag.type==='drawShape'&&drag.comp1){
      const x0=Math.min(drag.comp0[0],drag.comp1[0]), y0=Math.min(drag.comp0[1],drag.comp1[1]);
      const w=Math.abs(drag.comp1[0]-drag.comp0[0]), h=Math.abs(drag.comp1[1]-drag.comp0[1]);
      if(w>4&&h>4){
        const l=FF.app.createLayer('shape',{name:drag.kind==='rect'?'矩形':'椭圆',empty:true});
        const item=FF.makeShapeItem(drag.kind);
        item.size.value=[e.shiftKey?Math.max(w,h):w,e.shiftKey?Math.max(w,h):h];
        item.position.value=[0,0];
        FF.app.transact('绘制形状',()=>{ l.shapes.push(item); });
        l.transform.position.value=[x0+w/2,y0+h/2];
        app.selection=[l.id];
        FF.app.refreshAll();
      }
      FF.setTool('select');
    }
    if(drag.type==='penPoint'){ penUp(e); }
    else if(['move','rotate','scale','anchor','anchorMove','pin','spatial','axis'].includes(drag.type)){
      FF.app.endDrag({move:'移动图层',rotate:'旋转',scale:'缩放',anchor:'移动锚点',anchorMove:'移动锚点',pin:'图钉变形',spatial:'空间手柄',axis:'轴向移动'}[drag.type]);
      FF.app.refreshAll();
    }
    drag=null;
  });
  cv.addEventListener('dblclick',e=>{
    const s=evPos(e);
    const ctx=Eval.frame(app.project,app.comp,app.time);
    const hit=FF.R3D.pick(app.comp,app.time,ctx,s[0]*dpr,s[1]*dpr,FF.GL.canvas.width,FF.GL.canvas.height);
    if(hit&&hit.layer.type==='precomp'&&hit.layer.compId){
      FF.app.setComp(hit.layer.compId);
    }
  });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    if(!app.comp) return;
    FF.zoomCanvas(e.deltaY<0?1.12:0.9);
  },{passive:false});
  cv.addEventListener('contextmenu',e=>{
    e.preventDefault();
    if(penSession){ finishPen(); return; }
    const s=evPos(e);
    const ctx=Eval.frame(app.project,app.comp,app.time);
    const hit=FF.R3D.pick(app.comp,app.time,ctx,s[0]*dpr,s[1]*dpr,FF.GL.canvas.width,FF.GL.canvas.height);
    if(hit){
      if(!app.selection.includes(hit.layer.id)) app.selection=[hit.layer.id];
      FF.app.refreshAll();
      FF.ui.ctxMenu(e.clientX,e.clientY,[
        {label:'复制图层',fn:()=>FF.app.duplicateSelected()},
        {label:'预合成',fn:()=>FF.app.precompose()},
        {label:'删除图层',fn:()=>FF.app.deleteSelected(),danger:true},
      ]);
    }
  });
}
function screenToWorldOnPlane(s){
  const c=cam();
  if(!c) return [0,0,0];
  const comp=screenToComp(s);
  const ndcX=comp[0]/app.comp.w*2-1, ndcY=1-comp[1]/app.comp.h*2;
  const inv=M4.invert(c.vp);
  const p0=M4.transformPoint(inv,[ndcX,ndcY,-1]);
  const p1=M4.transformPoint(inv,[ndcX,ndcY,1]);
  const dir=V.norm(V.sub(p1,p0));
  if(Math.abs(dir[2])<1e-6) return [0,0,0];
  const t=-p0[2]/dir[2];
  return V.add(p0,V.mul(dir,t));
}
function drawShapePreview(){
  if(!drag||drag.type!=='drawShape'||!drag.comp1) return;
  const a=compToScreen(drag.comp0), b=compToScreen(drag.comp1);
  c2.strokeStyle='#4fd2ff';
  c2.setLineDash([5,4]);
  if(drag.kind==='rect') c2.strokeRect(Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));
  else {
    c2.beginPath();
    c2.ellipse((a[0]+b[0])/2,(a[1]+b[1])/2,Math.abs(b[0]-a[0])/2,Math.abs(b[1]-a[1])/2,0,0,7);
    c2.stroke();
  }
  c2.setLineDash([]);
}
/* ---------- 钢笔路径编辑 ---------- */
function startPathEdit(layerId,path){
  penSession={layerId,path};
  FF.setTool('select');
  FF.ui.toast('路径编辑：点击加点 · 拖动出切线 · 点起点闭合 · 右键/Esc 结束');
  FF.app.needsRender=true;
}
function finishPen(){
  penSession=null;
  FF.app.refreshAll();
}
function cancelPen(){ if(penSession) finishPen(); }
function penPath(ctx){
  const l=FF.findLayer(app.comp,penSession.layerId);
  const p=FF.getProp(l,penSession.path);
  return {l,p,path:(p.keys&&p.keys.length)?Eval.sampleKeys(p,app.time):p.value};
}
function penSave(ctx,path){
  const {l,p}=penPath(ctx);
  Eval.setValue(ctx,l,penSession.path,FF.deepClone(path));
  FF.app.invalidate();
}
function penDown(s,comp,ctx,e){
  const {l,path}=penPath(ctx);
  const wm=Eval.worldMatrix(ctx,l,app.time).m;
  const inv=M4.invert(wm);
  const local=M4.transformPoint(inv,[comp[0],comp[1],0]);
  // 命中已有点 / 手柄？
  for(let ci=0;ci<path.c.length;ci++){
    const c=path.c[ci];
    for(let pi=0;pi<c.p.length;pi++){
      const pt=c.p[pi];
      const ps=compToScreen(M4.transformPoint(wm,[pt[0],pt[1],0]));
      if(Math.hypot(s[0]-ps[0],s[1]-ps[1])<8){
        if(pi===0&&c.p.length>2&&!c.closed){
          c.closed=true;
          penSave(ctx,path);
          return;
        }
        drag={type:'penPoint',mode:'point',ci,pi,s0:s,pt0:pt.slice()};
        FF.app.beginDrag();
        return;
      }
      for(const [hki,hk] of [[2,'in'],[4,'out']]){
        const hs=compToScreen(M4.transformPoint(wm,[pt[hki],pt[hki+1],0]));
        if(Math.hypot(s[0]-hs[0],s[1]-hs[1])<7){
          drag={type:'penPoint',mode:hk,ci,pi,s0:s,pt0:pt.slice()};
          FF.app.beginDrag();
          return;
        }
      }
    }
  }
  // 加点
  if(!path.c.length) path.c.push({closed:false,p:[]});
  const c=path.c[path.c.length-1];
  c.p.push([local[0],local[1],local[0],local[1],local[0],local[1]]);
  penSave(ctx,path);
  drag={type:'penPoint',mode:'new',ci:path.c.length-1,pi:c.p.length-1,s0:s,pt0:c.p[c.p.length-1].slice()};
  FF.app.beginDrag();
}
function penMove(s,comp,ctx,e){
  const {path}=penPath(ctx);
  const l=FF.findLayer(app.comp,penSession.layerId);
  const wm=Eval.worldMatrix(ctx,l,app.time).m;
  const inv=M4.invert(wm);
  const local=M4.transformPoint(inv,[comp[0],comp[1],0]);
  const c=path.c[drag.ci];
  if(!c) return;
  const pt=c.p[drag.pi];
  if(drag.mode==='point'){
    const d=[local[0]-drag.pt0[0],local[1]-drag.pt0[1]];
    pt[0]=drag.pt0[0]+d[0]; pt[1]=drag.pt0[1]+d[1];
    pt[2]=drag.pt0[2]+d[0]; pt[3]=drag.pt0[3]+d[1];
    pt[4]=drag.pt0[4]+d[0]; pt[5]=drag.pt0[5]+d[1];
  } else if(drag.mode==='new'){
    // 拖出新点的切线
    const dx=local[0]-pt[0], dy=local[1]-pt[1];
    if(Math.hypot(dx,dy)>2){
      pt[4]=pt[0]+dx; pt[5]=pt[1]+dy;
      pt[2]=pt[0]-dx; pt[3]=pt[1]-dy;
    }
  } else {
    const hki=drag.mode==='in'?2:4;
    pt[hki]=local[0]; pt[hki+1]=local[1];
    if(!e.altKey){
      const other=drag.mode==='in'?4:2;
      pt[other]=pt[0]-(local[0]-pt[0]);
      pt[other+1]=pt[1]-(local[1]-pt[1]);
    }
  }
  penSave(ctx,path);
}
function penUp(e){
  FF.app.endDrag('路径编辑');
  FF.app.refreshAll();
}
function onToolChange(){
  if(penSession&&app.tool!=='select'&&app.tool!=='pen') finishPen();
  cv.style.cursor=app.tool==='select'?'default':'crosshair';
}
FF.CanvasView={init,draw,resize,startPathEdit,finishPen,cancelPen,onToolChange,
  compToScreen,screenToComp,worldToScreen};
})();
