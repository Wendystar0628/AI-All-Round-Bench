/* ============ 锻火 FORGE · anim.js : 求值 / 插值 / 变换 ============ */
(function(){
const APP=window.APP=window.APP||{};
const C=APP.core;
const A=APP.anim={};
const P=APP.project;

/* ---------- 关键帧插值 ---------- */
A.keyValue=function(prop,time,ctx){
  const keys=prop.keys;
  if(!keys||!keys.length)return clone(prop.v);
  if(keys.length===1)return clone(keys[0].v);
  // 找到区间
  let i0=0,i1=keys.length-1;
  if(time<=keys[0].t)return clone(keys[0].v);
  if(time>=keys[i1].t)return clone(keys[i1].v);
  for(let i=0;i<keys.length-1;i++){
    if(time>=keys[i].t&&time<=keys[i+1].t){i0=i;i1=i+1;break;}
  }
  const k0=keys[i0],k1=keys[i1];
  const span=k1.t-k0.t;
  if(span<=0)return clone(k1.v);
  let u=(time-k0.t)/span;
  // 时间插值类型
  if(k0.lo==='hold'||k1.li==='hold')return clone(k0.v);
  const ease=C.easeFunc(k0.tout,k1.tin);
  u=ease(C.clamp(u,0,1));
  const v0=k0.v,v1=k1.v;
  if(Array.isArray(v0)&&Array.isArray(v1)){
    // 空间插值(仅位置类, 有空间手柄)
    if(k0.hout&&k1.hin&&ctx&&ctx.spatial){
      return spatialAt(v0,v1,k0,k1,u);
    }
    const out=[];
    for(let i=0;i<v0.length;i++)out.push(C.lerp(v0[i],v1[i]!==undefined?v1[i]:v0[i],u));
    return out;
  }
  return C.lerp(v0,v1,u);
};
function spatialAt(v0,v1,k0,k1,u){
  const p0=v0.slice(0,3),p1=v1.slice(0,3);
  const c0=[p0[0]+(k0.hout[0]||0),p0[1]+(k0.hout[1]||0),p0[2]+(k0.hout[2]||0)];
  const c1=[p1[0]+(k1.hin[0]||0),p1[1]+(k1.hin[1]||0),p1[2]+(k1.hin[2]||0)];
  const N=48;
  const pts=[];
  for(let i=0;i<=N;i++){
    const t=i/N,mt=1-t;
    pts.push([
      mt*mt*mt*p0[0]+3*mt*mt*t*c0[0]+3*mt*t*t*c1[0]+t*t*t*p1[0],
      mt*mt*mt*p0[1]+3*mt*mt*t*c0[1]+3*mt*t*t*c1[1]+t*t*t*p1[1],
      mt*mt*mt*p0[2]+3*mt*mt*t*c0[2]+3*mt*t*t*c1[2]+t*t*t*p1[2]
    ]);
  }
  // 弧长参数化(线性时间下匀速)
  const seg=[];let L=0;
  for(let i=1;i<=N;i++){const d=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1],pts[i][2]-pts[i-1][2]);seg.push(d);L+=d;}
  let target=u*L;
  for(let i=0;i<N;i++){
    if(target<=seg[i]||i===N-1){
      const k=seg[i]>0?Math.min(1,target/seg[i]):0;
      const a=pts[i],b=pts[i+1];
      return [C.lerp(a[0],b[0],k),C.lerp(a[1],b[1],k),C.lerp(a[2],b[2],k)];
    }
    target-=seg[i];
  }
  return p1;
}
function clone(v){return Array.isArray(v)?v.slice():v;}

/* ---------- 完整求值(表达式优先) ---------- */
A.eval=function(prop,time,ctx){
  if(!prop)return 0;
  if(prop.expr&&prop.expr.on&&prop.expr.code){
    try{return APP.expr.evalPropExpr(prop,Object.assign({time},ctx||{}));}
    catch(e){
      if(!prop.__errShown||prop.__err!==e.message){prop.__err=e.message;prop.__errShown=true;
        if(APP.app)APP.app.lastExprError=e.message;}
      return A.keyValue(prop,time,ctx);
    }
  }
  return A.keyValue(prop,time,ctx);
};
A.evalNum=function(prop,time,ctx){
  const v=A.eval(prop,time,ctx);
  return Array.isArray(v)?(v.length?v[0]:0):(typeof v==='number'?v:0);
};

/* ---------- 变换矩阵 ---------- */
A.localMatrix=function(layer,time,ctx){
  const t=layer.t;
  const a=A.eval(t.anchor,time,ctx)||[0,0,0];
  const p=A.eval(t.pos,time,ctx)||[0,0,0];
  const s=A.eval(t.scale,time,ctx)||[100,100,100];
  const r=A.eval(t.rot,time,ctx)||[0,0,0];
  const m=C.m4trs(p[0],p[1],layer.is3D?(p[2]||0):0, s[0]/100,s[1]/100,layer.is3D?s[2]/100:1,
                  r[0],r[1],r[2]);
  // 锚点: M = T(pos) * R * S * T(-anchor)
  const ta=C.m4id();ta[12]=-a[0];ta[13]=-a[1];ta[14]=layer.is3D?-(a[2]||0):0;
  return C.m4mul(m,ta);
};
A.parentChain=function(layer,comp){
  const chain=[];let cur=layer;let guard=0;
  while(cur&&cur.parent&&guard++<20){
    const p=P.layer(cur.parent,comp);
    if(!p||p.id===cur.id)break;
    chain.unshift(p);cur=p;
  }
  return chain;
};
A.worldMatrix=function(layer,comp,time,ctx){
  let m=A.localMatrix(layer,time,ctx||{comp,layer,time});
  const chain=A.parentChain(layer,comp);
  for(const p of chain){
    m=C.m4mul(A.localMatrix(p,time,{comp,layer:p,time}),m);
  }
  return m;
};
A.worldMatrixAt=function(layer,comp,time){
  return A.worldMatrix(layer,comp,time,{comp,layer,time});
};
/* 图层中心(锚点)的世界坐标 */
A.layerOrigin=function(layer,comp,time){
  const m=A.worldMatrixAt(layer,comp,time);
  return {x:m[12],y:m[13],z:m[14]};
};

/* ---------- 摄像机 / 灯光 ---------- */
/* 相机沿自身 +Z 方向观看(y 向下坐标系, 与 AE 一致) */
function camViewMatrix(pos,rot,roll,target){
  let rx=rot[0],ry=rot[1],rz=rot[2]+(roll||0);
  const cx=Math.cos(rx*Math.PI/180),sx=Math.sin(rx*Math.PI/180);
  const cy=Math.cos(ry*Math.PI/180),sy=Math.sin(ry*Math.PI/180);
  const cz=Math.cos(rz*Math.PI/180),sz=Math.sin(rz*Math.PI/180);
  // R = Rz*Ry*Rx
  const r00=cz*cy, r01=cz*sy*sx-sz*cx, r02=cz*sy*cx+sz*sx;
  const r10=sz*cy, r11=sz*sy*sx+cz*cx, r12=sz*sy*cx-cz*sx;
  const r20=-sy,   r21=cy*sx,          r22=cy*cx;
  let fx,fy,fz;
  if(target){
    fx=target[0]-pos.x;fy=target[1]-pos.y;fz=target[2]-pos.z;
    const l=Math.hypot(fx,fy,fz)||1;fx/=l;fy/=l;fz/=l;
  }else{fx=r02;fy=r12;fz=r22;}
  // right = R*[1,0,0], down = R*[0,1,0]
  const rX=[r00,r10,r20], rY=[r01,r11,r21];
  // 若前向与 down 近乎平行, 修正 up
  let dX=rX,dY=rY;
  if(target){
    // 用世界 -y 作为参考上方向构造正交基
    const up=[0,-1,0];
    dX=[up[1]*fz-up[2]*fy, up[2]*fx-up[0]*fz, up[0]*fy-up[1]*fx];
    const l=Math.hypot(dX[0],dX[1],dX[2])||1;dX=[dX[0]/l,dX[1]/l,dX[2]/l];
    dY=[fy*dX[2]-fz*dX[1], fz*dX[0]-fx*dX[2], fx*dX[1]-fy*dX[0]];
  }
  const m=new Float32Array(16);
  m[0]=dX[0];m[1]=dY[0];m[2]=-fx;m[3]=0;
  m[4]=dX[1];m[5]=dY[1];m[6]=-fy;m[7]=0;
  m[8]=dX[2];m[9]=dY[2];m[10]=-fz;m[11]=0;
  m[12]=-(dX[0]*pos.x+dX[1]*pos.y+dX[2]*pos.z);
  m[13]=-(dY[0]*pos.x+dY[1]*pos.y+dY[2]*pos.z);
  m[14]=(fx*pos.x+fy*pos.y+fz*pos.z);
  m[15]=1;
  return m;
}
A.cameraMatrices=function(cam,comp,time){
  const m=A.worldMatrixAt(cam,comp,time);
  const pos={x:m[12],y:m[13],z:m[14]};
  const fov=A.evalNum(cam.props.fov,time,{comp,layer:cam,time});
  const target=A.eval(cam.props.target,time,{comp,layer:cam,time});
  const useT=cam.props.useTarget&&target&&(target[0]||target[1]||target[2]);
  const rot=A.eval(cam.t.rot,time,{comp,layer:cam,time})||[0,0,0];
  const roll=A.evalNum(cam.props.roll,time,{comp,layer:cam,time});
  const view=useT?camViewMatrix(pos,rot,roll,target):camViewMatrix(pos,rot,roll,null);
  return {view,pos,fov,proj:C.m4persp(fov,comp.w/comp.h,1,20000)};
};

/* ---------- 图层时间映射 ---------- */
A.layerActive=function(layer,comp,t){
  if(!layer.visible)return false;
  if(layer.inPoint!=null&&t<layer.inPoint-1e-6)return false;
  if(layer.outPoint!=null&&t>layer.outPoint+1e-6)return false;
  return true;
};
A.layerTime=function(layer,comp,t){
  if(!A.layerActive(layer,comp,t))return null;
  if(layer.type==='precomp'&&layer.precomp){
    let st=A.evalNum(layer.precomp.timeRemap,t,{comp,layer,time:t});
    return st;
  }
  return t;
};

/* ---------- 关键帧操作 ---------- */
A.findKey=function(prop,t){
  if(!prop.keys)return -1;
  for(let i=0;i<prop.keys.length;i++)if(Math.abs(prop.keys[i].t-t)<1e-6)return i;
  return -1;
};
A.setKey=function(prop,t,v,ctx){
  if(!prop.anim){prop.anim=true;prop.keys=[];}
  const i=A.findKey(prop,t);
  if(i>=0)prop.keys[i].v=clone(v);
  else{
    const k=P.newKey(t,v);
    prop.keys.push(k);
    prop.keys.sort((a,b)=>a.t-b.t);
  }
  return prop;
};
A.removeKey=function(prop,t){
  const i=A.findKey(prop,t);
  if(i>=0){prop.keys.splice(i,1);if(!prop.keys.length)prop.anim=false;}
  return prop;
};
A.hasKeys=function(prop){return prop&&prop.keys&&prop.keys.length>0;};
/* 属性在当前时刻是否有关键帧 */
A.keyAt=function(prop,t){
  if(!prop||!prop.keys)return -1;
  const fd=1/(APP.app?APP.app.fps:30);
  for(let i=0;i<prop.keys.length;i++)if(Math.abs(prop.keys[i].t-t)<fd*0.45)return i;
  return -1;
};
/* 移动关键帧(保持间距) */
A.moveKeys=function(prop,indices,dt){
  const keys=prop.keys;
  const moved=indices.map(i=>keys[i]);
  for(const k of moved)k.t+=dt;
  keys.sort((a,b)=>a.t-b.t);
};
/* 按比例拉伸时间 */
A.stretchKeys=function(prop,indices,anchor,scale){
  for(const i of indices){
    prop.keys[i].t=anchor+(prop.keys[i].t-anchor)*scale;
  }
  prop.keys.sort((a,b)=>a.t-b.t);
};
/* 缓入缓出 */
A.easyEase=function(prop,indices){
  for(const i of indices){
    const k=prop.keys[i];
    if(!k)continue;
    k.li='bezier';k.lo='bezier';
    k.tin={i:0.333,s:0};k.tout={i:0.333,s:0};
  }
};
A.easyEaseAll=function(prop){
  A.easyEase(prop,prop.keys.map((_,i)=>i));
};

/* ---------- 曲线取样(曲线编辑器用) ---------- */
A.sampleProp=function(prop,t0,t1,n,ctx){
  const pts=[];
  for(let i=0;i<=n;i++){
    const t=t0+(t1-t0)*i/n;
    let v;
    try{v=A.eval(prop,t,ctx);}catch(e){v=A.keyValue(prop,t,ctx);}
    pts.push({t,v:Array.isArray(v)?v[0]:v});
  }
  return pts;
};
/* 速度曲线(位置沿运动路径的实际速度) */
A.speedSamples=function(prop,t0,t1,n,ctx){
  const pts=[];const dt=(t1-t0)/n;
  let prev=null;
  for(let i=0;i<=n;i++){
    const t=t0+dt*i;
    let v;
    try{v=A.eval(prop,t,ctx);}catch(e){v=A.keyValue(prop,t,ctx);}
    if(prev){
      const d=Array.isArray(v)?Math.hypot(v[0]-prev[0],v[1]-prev[1],(v[2]||0)-(prev[2]||0)):
                              Math.abs(v-prev);
      pts.push({t:t-dt/2,v:dt>0?d/dt:0});
    }
    prev=v;
  }
  return pts;
};
/* 空间路径点(画布用) */
A.spatialPath=function(prop,comp){
  const keys=prop.keys;
  if(!keys||keys.length<2)return null;
  const pts=[];
  for(let i=0;i<keys.length-1;i++){
    const k0=keys[i],k1=keys[i+1];
    const p0=k0.v,p1=k1.v;
    const c0=[p0[0]+(k0.hout?k0.hout[0]:0),p0[1]+(k0.hout?k0.hout[1]:0),(p0[2]||0)+(k0.hout?k0.hout[2]:0)];
    const c1=[p1[0]+(k1.hin?k1.hin[0]:0),p1[1]+(k1.hin?k1.hin[1]:0),(p1[2]||0)+(k1.hin?k1.hin[2]:0)];
    const N=24;
    for(let j=0;j<=N;j++){
      const t=j/N,mt=1-t;
      pts.push({x:mt*mt*mt*p0[0]+3*mt*mt*t*c0[0]+3*mt*t*t*c1[0]+t*t*t*p1[0],
                y:mt*mt*mt*p0[1]+3*mt*mt*t*c0[1]+3*mt*t*t*c1[1]+t*t*t*p1[1]});
    }
  }
  return pts;
};

/* ---------- 运动模糊子帧 ---------- */
A.shutterSamples=function(comp,layer,t){
  const mb=comp.mb;
  if(!mb||!mb.on||!layer.mb)return [t];
  const fd=1/comp.fps;
  const interval=mb.shutter/360*fd;
  const samples=Math.max(2,Math.round(mb.samples||8));
  const phase=(mb.phase||0)/360*fd;
  const out=[];
  for(let i=0;i<samples;i++){
    out.push(t+phase-interval/2+interval*(i+0.5)/samples);
  }
  return out;
};

/* ---------- 工具 ---------- */
A.propPathName=function(key){
  return {anchor:'锚点',pos:'位置',scale:'缩放',rot:'旋转',opacity:'不透明度'}[key]||key;
};
APP.anim=A;
})();
