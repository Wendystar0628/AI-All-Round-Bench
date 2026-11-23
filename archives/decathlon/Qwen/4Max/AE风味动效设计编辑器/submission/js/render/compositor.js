/* 铸帧 ForgeFrame · 合成器：图层堆叠 / 三维组 / 混合 / 遮罩 / 调整层 / 运动模糊 / 预合成 */
"use strict";
(function(){
const FF=window.FF, GL=FF.GL, S=FF.Shaders, M4=FF.M4, V=FF.V, Eval=FF.Eval,
  clamp=FF.util.clamp;
let gl, progs={}, quadRectBuf=null, quadRectVAO=null;
let frameCache=null;
const MB_SAMPLES=7;

function init(){
  gl=FF.GL.gl;
  progs.xblit=GL.compile(S.vsXblit,S.fsBlit,'xblit');
  progs.adjust=GL.compile(S.vsQuad,S.fsAdjust,'adjust');
  quadRectVAO=gl.createVertexArray();
  gl.bindVertexArray(quadRectVAO);
  quadRectBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,quadRectBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,0,0, 1,0,1,0, 0,1,0,1, 1,1,1,1]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);
  gl.bindVertexArray(null);
}
function blendMode(mode){
  if(mode==='add') gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  else if(mode==='screen') gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);
  else if(mode==='multiply') gl.blendFunc(gl.DST_COLOR,gl.ONE_MINUS_SRC_ALPHA);
  else gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
}
function blitUnit(srcTex,dst,opacity,mode,xform,proj,srcW,srcH){
  GL.bindTarget(dst);
  gl.enable(gl.BLEND);
  if(mode==='overlay'){
    // 需要 dst 内容：先拷贝
    const tmp=FF.R2D.bank('ovTmp',dst.w,dst.h);
    FF.R2D.blit({tex:dst.tex,w:dst.w,h:dst.h},tmp,1);
    gl.useProgram(FF.R2D.progs.overlay.p);
    GL.tex(0,tmp.tex); gl.uniform1i(FF.R2D.progs.overlay.uni.uDst,0);
    GL.tex(1,srcTex); gl.uniform1i(FF.R2D.progs.overlay.uni.uSrc,1);
    gl.uniform1f(FF.R2D.progs.overlay.uni.uOpacity,opacity);
    gl.disable(gl.BLEND);
    GL.drawQuad();
    return;
  }
  blendMode(mode);
  if(xform){
    gl.useProgram(progs.xblit.p);
    gl.uniformMatrix4fv(progs.xblit.uni.uProj,false,proj);
    gl.uniformMatrix4fv(progs.xblit.uni.uXform,false,xform);
    GL.tex(0,srcTex); gl.uniform1i(progs.xblit.uni.uTex,0);
    gl.uniform1f(progs.xblit.uni.uOpacity,opacity);
    gl.uniform2f(progs.xblit.uni.uOffset,0,0);
    gl.bindVertexArray(quadRectVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER,quadRectBuf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,0,1, srcW,0,1,1, 0,srcH,0,0, srcW,srcH,1,0]),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    gl.bindVertexArray(null);
  } else {
    gl.useProgram(FF.R2D.progs.blit.p);
    GL.tex(0,srcTex); gl.uniform1i(FF.R2D.progs.blit.uni.uTex,0);
    gl.uniform1f(FF.R2D.progs.blit.uni.uOpacity,opacity);
    gl.uniform2f(FF.R2D.progs.blit.uni.uOffset,0,0);
    GL.drawQuad();
  }
  gl.disable(gl.BLEND);
}
function isRenderable(l){
  return ['shape','text','precomp','adjustment','geo','particles'].includes(l.type);
}
function is3D(l){ return l.threeD&&(l.type==='geo'||l.type==='particles'); }

function renderUnit(comp,layer,t,ctx,depth,localCache){
  // 返回 {tex,w,h,xform?}
  if(layer.type==='precomp'){
    const sub=FF.findComp(ctx.project,layer.compId);
    if(!sub) return null;
    let ct=layer.timeRemap?Eval.prop(ctx,layer,'timeRemap',t):(t-layer.startTime);
    ct=clamp(ct,0,sub.duration);
    const key='PC:'+sub.id+':'+ct.toFixed(5);
    let res=localCache.get(key);
    if(!res){ res=renderComp(sub,ct,ctx.project,depth+1,localCache); localCache.set(key,res); }
    const wm=Eval.worldMatrix(ctx,layer,t).m;
    return {tex:res.tex,w:sub.w,h:sub.h,xform:wm,compW:sub.w,compH:sub.h};
  }
  if(is3D(layer)) return null; // 由组渲染
  const res=FF.R2D.renderLayer(comp,layer,t,ctx);
  return {tex:res.tex,w:comp.w,h:comp.h};
}
function renderComp(comp,t,project,depth,localCache){
  depth=depth||0;
  localCache=localCache||new Map();
  const key='C:'+comp.id+':'+t.toFixed(5)+':'+depth;
  if(localCache.has(key)) return localCache.get(key);
  const ctx=Eval.frame(project,comp,t);
  const w=comp.w,h=comp.h;
  let stackA=FF.R2D.bank('stack'+depth+'a',w,h);
  let stackB=FF.R2D.bank('stack'+depth+'b',w,h);
  let stack=stackA, other=stackB;
  GL.clearTarget(stack,comp.bg[0],comp.bg[1],comp.bg[2],comp.bg[3]===undefined?1:comp.bg[3]);
  const proj=FF.R2D.ortho2d(w,h);
  const mbOn=comp.motionBlur&&comp.motionBlur.enabled;
  const shutter=(comp.motionBlur?comp.motionBlur.shutterAngle:180)/360/comp.fps;
  const phase=(comp.motionBlur?comp.motionBlur.phase:0)/360;
  let lastTex=null; // 用于轨道遮罩（上一层）
  const layers=comp.layers;
  let i=layers.length-1;
  while(i>=0){
    const l=layers[i];
    if(!l.visible||!Eval.layerActive(comp,l,t)||!isRenderable(l)){
      if(l.type==='camera'||l.type==='light'||l.type==='null'||l.type==='field') { /* 不产生像素 */ }
      i--; continue;
    }
    // 调整层
    if(l.type==='adjustment'){
      const opa=(Eval.prop(ctx,l,'transform.opacity',t)||100)/100;
      if(opa>0.003&&l.effects&&l.effects.some(e=>e.enabled)){
        const copy=FF.R2D.bank('adjCopy'+depth,w,h);
        FF.R2D.blit(stack,copy,1);
        const processed=FF.R2D.applyEffects(copy,l,t,ctx,w,h);
        const mask=FF.R2D.renderMasks(comp,l,t,ctx,w,h);
        GL.bindTarget(other);
        gl.useProgram(progs.adjust.p);
        GL.tex(0,stack.tex); gl.uniform1i(progs.adjust.uni.uBase,0);
        GL.tex(1,processed.tex); gl.uniform1i(progs.adjust.uni.uProcessed,1);
        if(mask){ GL.tex(2,mask.tex); gl.uniform1i(progs.adjust.uni.uHasMask,1); }
        else gl.uniform1i(progs.adjust.uni.uHasMask,0);
        gl.uniform1i(progs.adjust.uni.uMask,2);
        gl.uniform1f(progs.adjust.uni.uOpacity,opa);
        gl.disable(gl.BLEND);
        GL.drawQuad();
        const tmp=stack; stack=other; other=tmp;
      }
      i--; continue;
    }
    // 三维组
    if(is3D(l)){
      const group=[];
      let j=i;
      while(j>=0&&is3D(layers[j])&&layers[j].visible&&Eval.layerActive(comp,layers[j],t)){ group.unshift(layers[j]); j--; }
      const anyMB=mbOn&&group.some(g=>g.motionBlur);
      let sceneTex=null;
      if(anyMB){
        const accum=FF.R2D.bank('mbAcc'+depth,w,h);
        GL.clearTarget(accum,0,0,0,0);
        for(let k=0;k<MB_SAMPLES;k++){
          const tk=Math.max(0,t+((k+0.5)/MB_SAMPLES-0.5+phase)*shutter);
          const ctxK=tk===t?ctx:Eval.frame(project,comp,tk);
          const sc=FF.R3D.renderScene(comp,group,tk,ctxK);
          GL.bindTarget(accum);
          gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
          gl.useProgram(FF.R2D.progs.blit.p);
          GL.tex(0,sc.tex); gl.uniform1i(FF.R2D.progs.blit.uni.uTex,0);
          gl.uniform1f(FF.R2D.progs.blit.uni.uOpacity,1/MB_SAMPLES);
          gl.uniform2f(FF.R2D.progs.blit.uni.uOffset,0,0);
          GL.drawQuad();
          gl.disable(gl.BLEND);
        }
        sceneTex=accum.tex;
      } else {
        const sc=FF.R3D.renderScene(comp,group,t,ctx);
        sceneTex=sc.tex;
      }
      blitUnit(sceneTex,other,1,'normal',null,proj);
      const tmp=stack; stack=other; other=tmp;
      lastTex=sceneTex;
      i=j; continue;
    }
    // 普通 2D 图层（含预合成）
    const opa=(Eval.prop(ctx,l,'transform.opacity',t)||100)/100;
    const useMB=mbOn&&l.motionBlur&&l.type!=='adjustment';
    let unitTex=null, unit=null;
    if(useMB){
      const accum=FF.R2D.bank('mbAcc2'+depth,w,h);
      GL.clearTarget(accum,0,0,0,0);
      for(let k=0;k<MB_SAMPLES;k++){
        const tk=Math.max(0,t+((k+0.5)/MB_SAMPLES-0.5+phase)*shutter);
        const ctxK=tk===t?ctx:Eval.frame(project,comp,tk);
        const u=renderUnit(comp,l,tk,ctxK,depth,localCache);
        if(!u) continue;
        // 预合成层在运动模糊采样时也要应用自身变换
        GL.bindTarget(accum);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE);
        if(u.xform){
          gl.useProgram(progs.xblit.p);
          gl.uniformMatrix4fv(progs.xblit.uni.uProj,false,proj);
          gl.uniformMatrix4fv(progs.xblit.uni.uXform,false,u.xform);
          GL.tex(0,u.tex); gl.uniform1i(progs.xblit.uni.uTex,0);
          gl.uniform1f(progs.xblit.uni.uOpacity,opa/MB_SAMPLES);
          gl.uniform2f(progs.xblit.uni.uOffset,0,0);
          gl.bindVertexArray(quadRectVAO);
          gl.bindBuffer(gl.ARRAY_BUFFER,quadRectBuf);
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,0,1, u.w,0,1,1, 0,u.h,0,0, u.w,u.h,1,0]),gl.DYNAMIC_DRAW);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
          gl.bindVertexArray(null);
        } else {
          gl.useProgram(FF.R2D.progs.blit.p);
          GL.tex(0,u.tex); gl.uniform1i(FF.R2D.progs.blit.uni.uTex,0);
          gl.uniform1f(FF.R2D.progs.blit.uni.uOpacity,opa/MB_SAMPLES);
          gl.uniform2f(FF.R2D.progs.blit.uni.uOffset,0,0);
          GL.drawQuad();
        }
        gl.disable(gl.BLEND);
      }
      unitTex=accum.tex;
    } else {
      unit=renderUnit(comp,l,t,ctx,depth,localCache);
      if(unit) unitTex=unit.tex;
    }
    if(unitTex){
      // 轨道遮罩
      if(l.matte&&l.matte!=='none'&&lastTex){
        const md=FF.R2D.bank('matteTmp'+depth,w,h);
        const mode={alpha:0,luma:1,alphaInv:2,lumaInv:3}[l.matte]||0;
        FF.R2D.applyMask({tex:unitTex},md,{tex:lastTex},mode);
        unitTex=md.tex;
      }
      const xf=(unit&&unit.xform)?unit.xform:null;
      blitUnit(unitTex,other,useMB?1:opa,l.blend||'normal',xf,proj,unit?unit.w:w,unit?unit.h:h);
      const tmp=stack; stack=other; other=tmp;
      lastTex=unitTex;
    }
    i--;
  }
  const out={tex:stack.tex,target:stack,w,h,ctx};
  localCache.set(key,out);
  return out;
}
/* 显示到屏幕 */
function display(comp,t,project,view){
  const cv=GL.canvas;
  const res=renderComp(comp,t,project,0,new Map());
  FF.Compositor.lastResult=res;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  gl.viewport(0,0,cv.width,cv.height);
  gl.clearColor(0.035,0.045,0.07,1);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  // 计算画布适配矩形
  const pad=40;
  const fit=Math.min((cv.width-pad*2)/comp.w,(cv.height-pad*2)/comp.h);
  const zoom=(view.zoom||fit);
  const cw=comp.w*zoom, ch=comp.h*zoom;
  const cx=(cv.width-cw)/2+(view.panX||0), cy=(cv.height-ch)/2+(view.panY||0);
  FF.Compositor.lastRect={x:cx,y:cy,w:cw,h:ch,zoom};
  const proj=M4.ortho(0,cv.width,cv.height,0,-1,1);
  const xform=M4.mul(M4.translate(cx,cy,0),M4.scale(zoom,zoom,1));
  gl.useProgram(progs.xblit.p);
  gl.uniformMatrix4fv(progs.xblit.uni.uProj,false,proj);
  gl.uniformMatrix4fv(progs.xblit.uni.uXform,false,xform);
  GL.tex(0,res.tex); gl.uniform1i(progs.xblit.uni.uTex,0);
  gl.uniform1f(progs.xblit.uni.uOpacity,1);
  gl.uniform2f(progs.xblit.uni.uOffset,0,0);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(quadRectVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER,quadRectBuf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,0,1, comp.w,0,1,1, 0,comp.h,0,0, comp.w,comp.h,1,0]),gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  gl.bindVertexArray(null);
  gl.enable(gl.DEPTH_TEST);
  return res;
}
FF.Compositor={init,renderComp,display,
  get lastRect(){return this._rect;}, set lastRect(v){this._rect=v;},
  get lastResult(){return this._res;}, set lastResult(v){this._res=v;}};
})();
