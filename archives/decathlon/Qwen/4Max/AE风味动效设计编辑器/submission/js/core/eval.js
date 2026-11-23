/* 铸帧 ForgeFrame · 求值引擎：关键帧 / 表达式 / 变换 / 父级 */
"use strict";
(function(){
const FF=window.FF, V=FF.V, M4=FF.M4, Path=FF.Path, clamp=FF.util.clamp, lerp=FF.util.lerp,
  DEG=FF.util.DEG, rng=FF.rng, bez=FF.bez;

/* ---------- 关键帧采样 ---------- */
const arcCache=new WeakMap();
function arcLUT(k0,k1,dim){
  let per=arcCache.get(k0); if(!per){ per={}; arcCache.set(k0,per); }
  const key=JSON.stringify(k1.v)+'|'+dim;
  if(per[key]) return per[key];
  const p0=k0.v, p3=k1.v;
  const p1=V.add(p0,k0.so||[0,0]), p2=V.add(p3,k1.si||[0,0]);
  const pts=[]; let len=0; const N=40;
  let prev=p0;
  for(let i=0;i<=N;i++){
    const q=dim===3?bez.cubicPt3(p0,p1,p2,p3,i/N):bez.cubicPt(p0,p1,p2,i/N);
    if(i>0) len+=V.dist(prev,q);
    pts.push({p:q,l:len}); prev=q;
  }
  const lut={pts,len}; per[key]=lut; return lut;
}
function spatialAt(k0,k1,u,dim){
  const so=k0.so||[0,0], si=k1.si||[0,0];
  const curved=Math.abs(so[0])+Math.abs(so[1])+Math.abs(si[0])+Math.abs(si[1])>1e-6;
  if(!curved) return V.lerp(k0.v,k1.v,u);
  const lut=arcLUT(k0,k1,dim);
  if(lut.len<1e-6) return k0.v.slice();
  const target=u*lut.len;
  let lo=0,hi=lut.pts.length-1;
  while(lo<hi-1){ const mid=(lo+hi)>>1; if(lut.pts[mid].l<target) lo=mid; else hi=mid; }
  const a=lut.pts[lo], b=lut.pts[hi];
  const t=(b.l-a.l)>1e-9?(target-a.l)/(b.l-a.l):0;
  return V.lerp(a.p,b.p,t);
}
function sampleKeys(p,t){
  const keys=p.keys;
  if(!keys||!keys.length) return cloneVal(p.value);
  if(t<=keys[0].t) return cloneVal(keys[0].v);
  if(t>=keys[keys.length-1].t) return cloneVal(keys[keys.length-1].v);
  let i=0; while(i<keys.length-2&&keys[i+1].t<=t) i++;
  const k0=keys[i], k1=keys[i+1];
  if(k0.i==='hold') return cloneVal(k0.v);
  let u=(t-k0.t)/(k1.t-k0.t);
  if(k0.i==='bez'){
    u=bez.bezierEase(u, k0.eo[0],k0.eo[1], k1.ei[0],k1.ei[1]);
  }
  const dim=Array.isArray(k0.v)?k0.v.length:0;
  if((p.kind==='vec2'||p.kind==='vec3')&&dim>=2&&(p.spatial!==false)){
    return spatialAt(k0,k1,u,dim);
  }
  if(p.kind==='path') return Path.lerpPaths(k0.v,k1.v,u);
  if(dim) return V.lerp(k0.v,k1.v,u);
  if(typeof k0.v==='number') return lerp(k0.v,k1.v,u);
  return u<1?cloneVal(k0.v):cloneVal(k1.v);
}
function cloneVal(v){ return Array.isArray(v)?v.slice():(v&&typeof v==='object'?FF.deepClone(v):v); }
FF.cloneVal=cloneVal;

/* ---------- 表达式 ---------- */
const exprCache=new Map();
function compileExpr(code){
  if(exprCache.has(code)) return exprCache.get(code);
  const trimmed=code.trim();
  let body;
  const lines=trimmed.split('\n').map(s=>s.trim()).filter(Boolean);
  const last=lines[lines.length-1]||'';
  if(lines.length===1&&!/^(var|let|const|return|if|for|while|function)\b/.test(last)){
    body='return ('+last.replace(/;$/,'')+');';
  } else if(/^(return|var|let|const|if|for|while|function)\b/.test(last)||last.endsWith('}')){
    body=trimmed;
  } else {
    lines[lines.length-1]='return ('+last.replace(/;$/,'')+');';
    body=lines.join('\n');
  }
  let fn;
  try{ fn=new Function('$','with($){'+body+'\n}'); }
  catch(e){ fn=()=>{ throw new Error('语法错误: '+e.message); }; }
  exprCache.set(code,fn);
  return fn;
}

function makeRef(ctx,layer,path,timeOverride){
  const get=(t)=>prop(ctx,layer,path,t);
  const val=get(timeOverride!==undefined?timeOverride:ctx.time);
  const eps=1/240;
  const vel=()=>{
    const a=get(ctx.time-eps), b=get(ctx.time+eps);
    if(Array.isArray(val)) return val.map((_,i)=>((b[i]||0)-(a[i]||0))/(2*eps));
    return (b-a)/(2*eps);
  };
  const ref={
    value:val,
    valueAtTime:(t)=>get(t),
    velocity:vel(),
    speed:Array.isArray(val)?V.len(vel()):Math.abs(vel()),
    valueOf:()=>val,
    toString:()=>String(val),
  };
  return new Proxy(ref,{
    get(t,k){
      if(k in t) return t[k];
      if(typeof k==='string'&&/^\d+$/.test(k)) return Array.isArray(val)?val[+k]:val;
      if(k===Symbol.toPrimitive) return ()=>val;
      return val;
    }
  });
}
function layerProxy(ctx,layer){
  const tp={};
  const tkeys=layer.threeD?['anchor','position','scale','rotationX','rotationY','rotationZ','opacity']
    :['anchor','position','scale','rotation','opacity'];
  for(const k of tkeys) Object.defineProperty(tp,k,{get:()=>makeRef(ctx,layer,'transform.'+k),enumerable:true});
  if(layer.threeD) Object.defineProperty(tp,'rotation',{get:()=>makeRef(ctx,layer,'transform.rotationZ'),enumerable:true});
  const effectFn=(name)=>{
    const eff=(layer.effects||[]).find(e=>FF.EFFECT_NAMES[e.type]===name||e.type===name);
    const ef=new Proxy(function(paramName){
      if(!eff) throw new Error('效果不存在: '+name);
      const pk=Object.keys(eff).find(k=>eff[k]&&eff[k].kind&&(k===paramName||effParamName(eff,k)===paramName));
      if(!pk) throw new Error('效果参数不存在: '+paramName);
      return makeRef(ctx,layer,'effects.'+(layer.effects.indexOf(eff))+'.'+pk);
    },{get:(t,k)=>{ if(k==='param') return t; return t(k); }});
    return ef;
  };
  const base={
    name:layer.name, index:ctx.comp.layers.indexOf(layer)+1,
    width:ctx.comp.w, height:ctx.comp.h,
    inPoint:layer.inPoint, outPoint:layer.outPoint, startTime:layer.startTime,
    transform:tp, effect:effectFn,
    thisComp:compProxy(ctx,ctx.comp),
  };
  return new Proxy(base,{
    get(t,k){
      if(k in t) return t[k];
      if(typeof k!=='string') return undefined;
      const direct=FF.getProp(layer,k);
      if(direct) return makeRef(ctx,layer,k);
      for(const prefix of ['geo.material.','geo.','text.','camera.','light.','particles.','field.','audio.']){
        const p=FF.getProp(layer,prefix+k);
        if(p) return makeRef(ctx,layer,prefix+k);
      }
      if(k==='material'&&layer.geo) return new Proxy({},{get:(m,mk)=>makeRef(ctx,layer,'geo.material.'+mk)});
      if(k==='position') return makeRef(ctx,layer,'transform.position');
      if(k==='rotation') return makeRef(ctx,layer,layer.threeD?'transform.rotationZ':'transform.rotation');
      if(k==='scale') return makeRef(ctx,layer,'transform.scale');
      if(k==='opacity') return makeRef(ctx,layer,'transform.opacity');
      if(k==='anchor') return makeRef(ctx,layer,'transform.anchor');
      return undefined;
    }
  });
}
function effParamName(eff,k){
  const names={radius:'半径',threshold:'阈值',intensity:'强度',color:'颜色',opacity:'不透明度',
    distance:'距离',angle:'角度',softness:'柔和',hue:'色相',saturation:'饱和度',lightness:'亮度'};
  return names[k]||k;
}
function compProxy(ctx,comp){
  return {
    name:comp.name, width:comp.w, height:comp.h, duration:comp.duration, fps:comp.fps,
    numLayers:comp.layers.length, time:ctx.time,
    layer:(q)=>{
      const l=typeof q==='number'?comp.layers[q-1]:comp.layers.find(x=>x.name===q);
      if(!l) throw new Error('图层不存在: '+q);
      return layerProxy(ctx,l);
    },
    comp:(n)=>{ const c=ctx.project.comps.find(x=>x.name===n); if(!c) throw new Error('合成不存在: '+n); return compProxy(ctx,c); },
  };
}
function buildScope(ctx,layer,path,base){
  const seed=rng.hashStr(layer.id+':'+path);
  let callCount=0;
  const wiggle=(freq,amp,octaves,ampMult,t)=>{
    octaves=octaves||1; ampMult=ampMult===undefined?0.5:ampMult;
    const tt=t===undefined?ctx.time:t;
    const off=(i)=>{
      let a=Array.isArray(amp)?(amp[i]!==undefined?amp[i]:amp[0]):amp;
      let s=0, f=1, norm=0, aa=1;
      for(let o=0;o<octaves;o++){ s+=rng.fbm1(tt*freq*f+i*131.7,seed+i*97+o*57,1)*a*aa; norm+=aa; aa*=ampMult; f*=2; }
      return s;
    };
    if(Array.isArray(base)) return base.map((v,i)=>v+off(i));
    return base+off(0);
  };
  const loopFn=(dir)=>(type,numKeys)=>{
    type=type||'cycle';
    const p=FF.getProp(layer,path);
    const keys=p&&p.keys;
    if(!keys||keys.length<2) return base;
    const n=numKeys||0;
    const firstIdx=n>0?Math.max(0,keys.length-1-n):0;
    const t0=keys[firstIdx].t, t1=keys[keys.length-1].t;
    const dur=t1-t0; if(dur<=0) return base;
    let tt=ctx.time-t0;
    if(type==='pingpong'){
      const ph=((tt%(2*dur))+2*dur)%(2*dur);
      tt=ph<=dur?ph:2*dur-ph;
    } else if(type==='offset'){
      const cycles=Math.floor(tt/dur);
      tt=((tt%dur)+dur)%dur;
      const v=sampleKeys(p,t0+tt);
      const delta=typeof v==='number'?v-keys[firstIdx].v:null;
      return typeof v==='number'?v+cycles*(keys[keys.length-1].v-keys[firstIdx].v):v;
    } else {
      tt=((tt%dur)+dur)%dur;
    }
    return sampleKeys(p,t0+tt);
  };
  const mapFn=(smoothFlag)=>(t,a,b,c,d)=>{
    if(c===undefined){ c=a; d=b; a=0; b=1; }
    let u=(t-a)/((b-a)||1e-9); u=clamp(u,0,1);
    if(smoothFlag) u=u*u*(3-2*u);
    if(Array.isArray(c)) return c.map((cv,i)=>lerp(cv,d[i]!==undefined?d[i]:cv,u));
    return lerp(c,d,u);
  };
  const scope={
    time:ctx.time, value:base,
    thisLayer:layerProxy(ctx,layer),
    thisComp:compProxy(ctx,ctx.comp),
    thisProperty:makeRef(ctx,layer,path),
    comp:(n)=>{ const c=ctx.project.comps.find(x=>x.name===n); if(!c) throw new Error('合成不存在: '+n); return compProxy(ctx,c); },
    wiggle, loopOut:loopFn(1), loopIn:loopFn(-1),
    linear:mapFn(false), ease:mapFn(true),
    easeIn:(t,a,b,c,d)=>mapFn(true)(t,a,b,c,d),
    easeOut:(t,a,b,c,d)=>mapFn(true)(t,a,b,c,d),
    random:(a,b)=>{ callCount++;
      const r=rng.hashN(seed+callCount*7919+Math.floor(ctx.time*1e4));
      if(a===undefined) return r;
      if(Array.isArray(a)) return a.map((v,i)=>lerp(v,(b||a)[i]!==undefined?(b||a)[i]:v,r));
      return lerp(a,b===undefined?1:b,r); },
    seedRandom:(s,timeless)=>{ callCount=Math.floor(s*1000); },
    gaussRandom:(a,b)=>{ const r=(rng.hashN(seed+callCount*104729)+rng.hashN(seed+callCount*15485863))/2;
      callCount++; return a===undefined?r:lerp(a,b===undefined?1:b,r); },
    degreesToRadians:d=>d*DEG, radiansToDegrees:r=>r/DEG,
    Math, JSON,
    index:ctx.comp.layers.indexOf(layer)+1,
    add:(a,b)=>Array.isArray(a)?a.map((v,i)=>v+(Array.isArray(b)?b[i]:b)):a+b,
    mul:(a,b)=>Array.isArray(a)?a.map((v,i)=>v*(Array.isArray(b)?b[i]:b)):a*b,
    length:(a)=>Array.isArray(a)?V.len(a):Math.abs(a),
    normalize:(a)=>V.norm(a),
    clamp:(v,a,b)=>clamp(v,a,b),
    glyphSupported:(ch)=>FF.glyphs.isSupported(ch),
  };
  const tp=scope.thisLayer.transform;
  for(const k of ['position','anchor','scale','rotation','opacity','rotationX','rotationY','rotationZ']){
    if(k in tp) Object.defineProperty(scope,k,{get:()=>tp[k]});
  }
  scope.effect=scope.thisLayer.effect;
  return scope;
}

/* ---------- 属性求值 ---------- */
function prop(ctx,layer,path,t){
  if(t===undefined) t=ctx.time;
  const p=FF.getProp(layer,path);
  if(!p) return undefined;
  const ck=layer.id+':'+path+':'+t.toFixed(5);
  if(ctx.cache.has(ck)) return ctx.cache.get(ck);
  if(ctx.stack.has(ck)){ throw new Error('循环引用: '+layer.name+'.'+path); }
  ctx.stack.add(ck);
  let result;
  const base=sampleKeys(p,t);
  if(p.expr&&p.exprOn){
    try{
      const fn=compileExpr(p.expr);
      const scope=buildScope(ctx,layer,path,base);
      const r=fn(scope);
      result=coerce(r,p,base);
      ctx.exprOk.add(layer.id+':'+path);
    }catch(e){
      ctx.errors.set(layer.id+':'+path, e.message||String(e));
      result=base;
    }
  } else result=base;
  ctx.stack.delete(ck);
  ctx.cache.set(ck,result);
  return result;
}
function coerce(r,p,base){
  if(r&&typeof r==='object'&&r.__isRef) r=r.value;
  if(p.kind==='num'||p.kind==='angle'){ const v=Number(r); return isFinite(v)?v:(typeof base==='number'?base:0); }
  if(p.kind==='vec2'||p.kind==='vec3'){
    const n=p.kind==='vec2'?2:3;
    if(typeof r==='number') return new Array(n).fill(r);
    if(Array.isArray(r)){ const o=[]; for(let i=0;i<n;i++) o.push(Number(r[i]!==undefined?r[i]:(base[i]||0))||0); return o; }
    return base;
  }
  if(p.kind==='color'){
    if(Array.isArray(r)) return [clamp(Number(r[0])||0,0,1),clamp(Number(r[1])||0,0,1),clamp(Number(r[2])||0,0,1)];
    return base;
  }
  if(p.kind==='text') return String(r);
  if(p.kind==='bool') return !!r;
  if(p.kind==='path') return (r&&r.c)?r:base;
  return r;
}

/* ---------- 帧上下文 ---------- */
function frame(project,comp,time){
  return { project, comp, time, cache:new Map(), stack:new Set(), errors:new Map(), exprOk:new Set() };
}

/* ---------- 变换与世界矩阵 ---------- */
function localMatrix(ctx,layer,t){
  const tr=layer.transform;
  const pos=prop(ctx,layer,'transform.position',t);
  const anch=prop(ctx,layer,'transform.anchor',t);
  const scl=prop(ctx,layer,'transform.scale',t);
  const op=prop(ctx,layer,'transform.opacity',t);
  let m;
  if(layer.threeD){
    const rx=prop(ctx,layer,'transform.rotationX',t)*DEG;
    const ry=prop(ctx,layer,'transform.rotationY',t)*DEG;
    const rz=prop(ctx,layer,'transform.rotationZ',t)*DEG;
    m=M4.mul(M4.translate(pos[0],pos[1],pos[2]||0),
      M4.mul(M4.rotZ(rz),M4.mul(M4.rotY(ry),M4.rotX(rx))));
    m=M4.mul(m,M4.scale(scl[0]/100,scl[1]/100,(scl[2]===undefined?100:scl[2])/100));
    m=M4.mul(m,M4.translate(-anch[0],-anch[1],-(anch[2]||0)));
  } else {
    const rot=prop(ctx,layer,'transform.rotation',t)*DEG;
    m=M4.mul(M4.translate(pos[0],pos[1],0),M4.rotZ(rot));
    m=M4.mul(m,M4.scale(scl[0]/100,scl[1]/100,1));
    m=M4.mul(m,M4.translate(-anch[0],-anch[1],0));
  }
  return {m,opacity:op};
}
function worldMatrix(ctx,layer,t){
  const ck='W:'+layer.id+':'+t.toFixed(5);
  if(ctx.cache.has(ck)) return ctx.cache.get(ck);
  const local=localMatrix(ctx,layer,t);
  let m=local.m;
  if(layer.parent){
    const par=FF.findLayer(ctx.comp,layer.parent);
    if(par&&par.id!==layer.id){
      const pm=worldMatrix(ctx,par,t);
      m=M4.mul(pm.m,m);
    }
  }
  const out={m,opacity:local.opacity};
  ctx.cache.set(ck,out);
  return out;
}
/* 设定父级时保持画面：把世界变换烘焙为新的局部变换 */
function bakeParent(ctx,layer,newParentId,t){
  const oldWorld=worldMatrix(ctx,layer,t).m;
  layer.parent=newParentId;
  ctx.cache.clear();
  let target=oldWorld;
  if(newParentId){
    const par=FF.findLayer(ctx.comp,newParentId);
    if(par) target=M4.mul(M4.invert(worldMatrix(ctx,par,t).m),oldWorld);
  }
  // 分解 TRS（含锚点）
  const anch=prop(ctx,layer,'transform.anchor',t);
  const ax=anch[0],ay=anch[1],az=anch[2]||0;
  const p=M4.transformPoint(target,[ax,ay,az]);
  let sx=Math.hypot(target[0],target[1],target[2]);
  let sy=Math.hypot(target[4],target[5],target[6]);
  let sz=Math.hypot(target[8],target[9],target[10]);
  const det=target[0]*(target[5]*target[10]-target[6]*target[9])
    -target[4]*(target[1]*target[10]-target[2]*target[9])
    +target[8]*(target[1]*target[6]-target[2]*target[5]);
  if(det<0) sx=-sx;
  const r00=target[0]/sx,r01=target[4]/sy,r02=target[8]/sz;
  const r10=target[1]/sx,r11=target[5]/sy,r12=target[9]/sz;
  const r20=target[2]/sx,r21=target[6]/sy,r22=target[10]/sz;
  let rx,ry,rz;
  if(Math.abs(r20)<0.9999){
    ry=Math.asin(clamp(-r20,-1,1));
    rx=Math.atan2(r21,r22);
    rz=Math.atan2(r10,r00);
  } else {
    ry=r20<0?Math.PI/2:-Math.PI/2;
    rx=Math.atan2(-r12,r11);
    rz=0;
  }
  const set=(path,val)=>{
    const pp=FF.getProp(layer,path);
    if(pp.keys&&pp.keys.length){ addOrUpdateKey(pp,ctx.time,val); }
    else pp.value=val;
  };
  set('transform.position',layer.threeD?[p[0],p[1],p[2]]:[p[0],p[1]]);
  set('transform.scale',layer.threeD?[sx*100,sy*100,sz*100]:[sx*100,sy*100]);
  if(layer.threeD){
    set('transform.rotationX',rx/DEG); set('transform.rotationY',ry/DEG); set('transform.rotationZ',rz/DEG);
  } else set('transform.rotation',rz/DEG);
}
/* 修改属性：动画属性只在当前时刻建/更新关键帧 */
function addOrUpdateKey(p,t,v,interp){
  if(!p.keys) p.keys=[];
  const ex=p.keys.find(k=>Math.abs(k.t-t)<1e-4);
  if(ex){ ex.v=cloneVal(v); return ex; }
  const k=FF.K(t,v,interp||'bez');
  if(p.keys.length){
    const prev=[...p.keys].filter(x=>x.t<t).pop();
    const next=p.keys.find(x=>x.t>t);
    if(prev){ k.ei=prev.i==='hold'?[0.33,0.33]:[0.33,0.33]; k.eo=prev.eo?prev.eo.slice():[0.33,0.33]; }
    if(next){ k.ei=next.ei?next.ei.slice():[0.33,0.33]; }
    if(p.kind==='vec2'||p.kind==='vec3'){
      if(prev&&prev.so) k.so=[0,0];
    }
  }
  p.keys.push(k);
  p.keys.sort((a,b)=>a.t-b.t);
  return k;
}
function setValue(ctx,layer,path,v){
  const p=FF.getProp(layer,path);
  if(!p) return;
  if(p.keys&&p.keys.length) addOrUpdateKey(p,ctx.time,v);
  else p.value=cloneVal(v);
}
function layerActive(comp,layer,t){
  return t>=layer.inPoint-1e-9&&t<layer.outPoint-1e-9;
}

FF.Eval={frame,prop,sampleKeys,worldMatrix,localMatrix,bakeParent,setValue,addOrUpdateKey,layerActive,compileExpr};
})();
